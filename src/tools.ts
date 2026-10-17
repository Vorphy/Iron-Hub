import type { Overlay } from './render/overlay';
import type { Command, FailReason } from './sim/commands';
import { CLEAR_ROUGH_COST, SIGNAL_COST } from './sim/config';
import { CARGO_DEFS, type Cargo } from './sim/economy/cargo';
import { catchmentCargo } from './sim/economy/cargoFlow';
import { autoDepotSide, depotAt, depotRefund, planDepot } from './sim/depot/depot';
import {
  catchment,
  planStation,
  stationAt,
  stationAxis,
  stationTileRefund,
  type StationAxis,
} from './sim/station/station';
import { planTrackLine } from './sim/track/autorail';
import { planBuildTrack, planRemoveTrack, type TrackPlan } from './sim/track/build';
import { nextSignalState } from './sim/signals/signals';
import { getTrackBits, Side, Track, TRACK_SIDES, tracksOn } from './sim/track/track';
import type { Simulation } from './sim/simulation';
import { getTerrain, inBounds, Terrain } from './sim/world/map';
import type { Point } from './render/iso';

/** 'orders' – wskazywanie stacji do rozkładu pociągu `ordersTrain` (z okna pociągu). */
export type Tool = 'cursor' | 'track' | 'station' | 'depot' | 'signal' | 'bulldozer' | 'orders';

/** Rodzaj semafora stawianego narzędziem (albo usuwanie). */
export type SignalKind = 'path' | 'oneway' | 'remove';

export const FAIL_MESSAGES: Record<FailReason, string> = {
  outOfBounds: 'Poza mapą',
  nothingToClear: 'Tu nie ma czego usuwać',
  noMoney: 'Brak pieniędzy',
  blocked: 'Nie można tu budować',
  nothingToRemove: 'Brak torów do rozebrania',
  tooBig: 'Za duże (stacja max 12 × 6, pociąg max 10 wagonów)',
  depotNotEmpty: 'W zajezdni stoją pociągi',
  notInDepot: 'Pociąg musi stać w zajezdni',
  depotNotConnected: 'Zajezdnia nie ma toru przy wjeździe',
  trainInWay: 'Na drodze stoi pociąg',
  industry: 'Zakładów przemysłowych nie można burzyć',
};

export interface CursorLabel {
  text: string;
  ok: boolean;
}

/**
 * Logika narzędzi gracza: podgląd (plan bez zmiany stanu) i wysyłanie komend.
 * Pracuje na ułamkowych współrzędnych kafelków – rzut ekranowy zna tylko Game.
 */
export class Tools {
  tool: Tool = 'cursor';
  /** Oś peronu przy kwadratowym zaznaczeniu (klawisz R). */
  stationAxis: StationAxis = 'x';
  /** Wjazd zajezdni wybrany przez gracza (panel kierunków lub R). */
  depotSide: Side = Side.SE;
  /** Auto: wjazd sam obraca się w stronę sąsiedniego toru. */
  depotAuto = true;
  signalKind: SignalKind = 'path';
  /** Pociąg, któremu dopisujemy stacje (narzędzie 'orders'). */
  ordersTrain: number | null = null;
  private dragStart: Point | null = null;
  private pointer: Point | null = null;
  private dirty = true;
  label: CursorLabel | null = null;

  constructor(
    private readonly sim: Simulation,
    private readonly overlay: Overlay,
  ) {}

  setTool(tool: Tool, ordersTrain: number | null = null): void {
    this.tool = tool;
    this.ordersTrain = tool === 'orders' ? ordersTrain : null;
    this.dragStart = null;
    this.dirty = true;
  }

  /** Czy narzędzie przejmuje przeciąganie lewym przyciskiem. */
  primaryDown(p: Point): boolean {
    if (this.tool === 'cursor') return false;
    this.dragStart = p;
    this.pointer = p;
    this.dirty = true;
    return true;
  }

  pointerMoved(p: Point | null): void {
    this.pointer = p;
    this.dirty = true;
  }

  primaryUp(p: Point): void {
    const start = this.dragStart;
    this.dragStart = null;
    this.dirty = true;
    if (!start) return;
    const cmd = this.commandFor(start, p);
    if (cmd) this.sim.enqueue(cmd);
  }

  /** Klawisz R: obrót stacji albo wjazdu zajezdni. */
  rotate(): void {
    if (this.tool === 'depot') this.setDepotSide(((this.depotSide + 1) & 3) as Side);
    else this.setStationAxis(this.stationAxis === 'x' ? 'y' : 'x');
  }

  /** Kierunek wjazdu albo 'auto'. Ręczny wybór wyłącza automatyczne obracanie. */
  setDepotSide(side: Side | 'auto'): void {
    if (side === 'auto') this.depotAuto = true;
    else {
      this.depotSide = side;
      this.depotAuto = false;
    }
    this.dirty = true;
  }

  setSignalKind(kind: SignalKind): void {
    this.signalKind = kind;
    this.dirty = true;
  }

  setStationAxis(axis: StationAxis): void {
    this.stationAxis = axis;
    this.dirty = true;
  }

  cancel(): boolean {
    if (!this.dragStart) return false;
    this.dragStart = null;
    this.dirty = true;
    return true;
  }

  /** Stan gry się zmienił – podgląd trzeba przeliczyć (np. koszt vs pieniądze). */
  invalidate(): void {
    this.dirty = true;
  }

  /** Odświeża nakładki, gdy coś się zmieniło. */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.label = null;
    this.overlay.setTrackPreview(null);
    this.overlay.setCatchment(null);

    const p = this.pointer;
    const map = this.sim.state.map;
    const tile = p && inBounds(map, Math.floor(p.x), Math.floor(p.y)) ? { x: Math.floor(p.x), y: Math.floor(p.y) } : null;

    if (this.tool === 'cursor' || !p) {
      this.overlay.setHover(tile);
      const station = tile && stationAt(this.sim.state, tile.x, tile.y);
      if (station) this.overlay.setCatchment(catchment(map, station.tiles), map.width);
      return;
    }

    const start = this.dragStart ?? p;
    if (this.tool === 'track') {
      this.overlay.setHover(null);
      const plan = planBuildTrack(this.sim.state, planTrackLine(start.x, start.y, p.x, p.y));
      this.overlay.setTrackPreview(plan);
      if (this.dragStart) this.label = planLabel(plan);
      return;
    }

    if (this.tool === 'signal') {
      const piece = tile && nearestPiece(this.sim, p);
      this.overlay.setHover(tile, 0x9aa0a8);
      if (!piece) {
        this.label = { text: 'Wskaż tor', ok: false };
        return;
      }
      const existing = this.sim.state.signals.find((s) => s.x === piece.x && s.y === piece.y && s.track === piece.track);
      const after =
        this.signalKind === 'remove' ? null : { ...piece, ...nextSignalState(existing, this.signalKind === 'oneway') };
      this.overlay.setPieceHighlight(piece.x, piece.y, piece.track, after);
      this.label =
        this.signalKind === 'remove'
          ? existing
            ? { text: 'Usuń semafor', ok: true }
            : { text: 'Brak semafora', ok: false }
          : existing
            ? { text: after?.dirs === 3 ? 'Kliknij: oba kierunki' : 'Kliknij: zmień kierunek', ok: true }
            : { text: `Koszt: ${formatMoney(SIGNAL_COST)}`, ok: this.sim.state.money >= SIGNAL_COST };
      return;
    }

    if (this.tool === 'orders') {
      const station = tile && stationAt(this.sim.state, tile.x, tile.y);
      this.overlay.setHover(tile, station ? 0x4cc9f0 : 0x9aa0a8);
      if (station) this.overlay.setCatchment(catchment(map, station.tiles), map.width);
      this.label = station ? { text: `Dodaj: ${station.name}`, ok: true } : { text: 'Wskaż stację', ok: false };
      return;
    }

    if (this.tool === 'depot') {
      this.overlay.setHover(null);
      if (!tile) return;
      const plan = planDepot(this.sim.state, tile.x, tile.y);
      this.overlay.setDepotPreview(tile.x, tile.y, this.depotSideAt(tile.x, tile.y), plan.result.ok);
      this.label = planLabel(plan);
      return;
    }

    if (this.tool === 'station') {
      this.overlay.setHover(null);
      const plan = this.stationPlan(start, p);
      this.overlay.setStationPreview(plan);
      const ok = plan.tiles.filter((t) => t.ok).map((t) => t.y * map.width + t.x);
      if (ok.length) this.overlay.setCatchment(catchment(map, ok), map.width);
      const info = ok.length ? catchmentCargo(this.sim.state, ok) : null;
      const cargoInfo = info ? describeCatchment(info.supplies, info.accepts) : '';
      const base = this.dragStart ? planLabel(plan) : null;
      this.label = base || cargoInfo ? { text: [base?.text, cargoInfo].filter(Boolean).join(' · '), ok: base?.ok ?? true } : null;
      return;
    }

    // Buldożer
    if (sameTile(start, p)) {
      this.overlay.setHover(tile, 0xe0503a);
      if (!tile) return;
      const bits = getTrackBits(map, tile.x, tile.y);
      if (stationAt(this.sim.state, tile.x, tile.y)) {
        this.label = { text: `Zwrot: ${formatMoney(stationTileRefund())}`, ok: true };
      } else if (depotAt(this.sim.state, tile.x, tile.y)) {
        this.label = { text: `Zwrot: ${formatMoney(depotRefund())}`, ok: true };
      } else if (bits) {
        const plan = planRemoveTrack(this.sim.state, tracksOn(bits).map((track) => ({ ...tile, track })));
        this.overlay.setTrackPreview(plan, true);
        this.label = planLabel(plan);
      } else if (getTerrain(map, tile.x, tile.y) === Terrain.Rough) {
        this.label = { text: `Koszt: ${formatMoney(CLEAR_ROUGH_COST)}`, ok: this.sim.state.money >= CLEAR_ROUGH_COST };
      }
      return;
    }
    this.overlay.setHover(null);
    const plan = planRemoveTrack(this.sim.state, planTrackLine(start.x, start.y, p.x, p.y));
    this.overlay.setTrackPreview(plan, true);
    this.label = planLabel(plan);
  }

  private depotSideAt(x: number, y: number): Side {
    return this.depotAuto ? autoDepotSide(this.sim.state.map, x, y, this.depotSide) : this.depotSide;
  }

  private stationPlan(start: Point, end: Point) {
    const [x0, y0, x1, y1] = [start.x, start.y, end.x, end.y].map(Math.floor) as [number, number, number, number];
    return planStation(this.sim.state, x0, y0, x1, y1, stationAxis(x0, y0, x1, y1, this.stationAxis));
  }

  private commandFor(start: Point, end: Point): Command | null {
    if (this.tool === 'signal') {
      const piece = nearestPiece(this.sim, end);
      if (!piece) return null;
      if (this.signalKind === 'remove') return { type: 'removeSignal', ...piece };
      return { type: 'placeSignal', ...piece, oneWay: this.signalKind === 'oneway' };
    }
    if (this.tool === 'track') {
      return { type: 'buildTrack', pieces: planTrackLine(start.x, start.y, end.x, end.y) };
    }
    if (this.tool === 'orders') {
      const station = stationAt(this.sim.state, Math.floor(end.x), Math.floor(end.y));
      const train = this.sim.state.trains.find((t) => t.id === this.ordersTrain);
      if (!station || !train) return null;
      return { type: 'setOrders', trainId: train.id, orders: [...train.orders, station.id] };
    }
    if (this.tool === 'depot') {
      const x = Math.floor(end.x);
      const y = Math.floor(end.y);
      return { type: 'buildDepot', x, y, side: this.depotSideAt(x, y) };
    }
    if (this.tool === 'station') {
      const plan = this.stationPlan(start, end);
      const xs = plan.tiles.map((t) => t.x);
      const ys = plan.tiles.map((t) => t.y);
      return {
        type: 'buildStation',
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
        axis: plan.axis,
      };
    }
    if (this.tool === 'bulldozer') {
      if (sameTile(start, end)) return { type: 'clearTile', x: Math.floor(end.x), y: Math.floor(end.y) };
      return { type: 'removeTrack', pieces: planTrackLine(start.x, start.y, end.x, end.y) };
    }
    return null;
  }
}

// Środki boków kafelka (do wyboru najbliższego elementu toru).
const MID: Record<Side, readonly [number, number]> = {
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

/** Element toru na kafelku pod kursorem najbliższy kursorowi (do stawiania semaforów). */
function nearestPiece(sim: Simulation, p: Point): { x: number; y: number; track: Track } | null {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (!inBounds(sim.state.map, x, y)) return null;
  const fx = p.x - x;
  const fy = p.y - y;
  let best: Track | null = null;
  let bestD = Infinity;
  for (const track of tracksOn(getTrackBits(sim.state.map, x, y))) {
    const [a, b] = TRACK_SIDES[track];
    const d = distToSegment(fx, fy, MID[a], MID[b]);
    if (d < bestD) {
      bestD = d;
      best = track;
    }
  }
  return best === null ? null : { x, y, track: best };
}

function distToSegment(px: number, py: number, a: readonly [number, number], b: readonly [number, number]): number {
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function describeCatchment(supplies: Set<Cargo>, accepts: Set<Cargo>): string {
  const names = (s: Set<Cargo>) => [...s].map((c) => CARGO_DEFS[c].name).join(', ') || '—';
  return `Zbiera: ${names(supplies)} · Przyjmuje: ${names(accepts)}`;
}

function sameTile(a: Point, b: Point): boolean {
  return Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y);
}

function planLabel(plan: { cost: number; result: TrackPlan['result'] }): CursorLabel {
  if (!plan.result.ok) {
    if (plan.result.reason === 'noMoney') return { text: `Brak pieniędzy (${formatMoney(plan.cost)})`, ok: false };
    return { text: FAIL_MESSAGES[plan.result.reason], ok: false };
  }
  if (plan.cost < 0) return { text: `Zwrot: ${formatMoney(-plan.cost)}`, ok: true };
  return { text: `Koszt: ${formatMoney(plan.cost)}`, ok: true };
}

export function formatMoney(n: number): string {
  return `${n.toLocaleString('pl-PL')} zł`;
}
