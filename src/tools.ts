import type { Overlay } from './render/overlay';
import type { Command, FailReason } from './sim/commands';
import { CLEAR_ROUGH_COST } from './sim/config';
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
import { getTrackBits, Side, tracksOn } from './sim/track/track';
import type { Simulation } from './sim/simulation';
import { getTerrain, inBounds, Terrain } from './sim/world/map';
import type { Point } from './render/iso';

export type Tool = 'cursor' | 'track' | 'station' | 'depot' | 'bulldozer';

export const FAIL_MESSAGES: Record<FailReason, string> = {
  outOfBounds: 'Poza mapą',
  nothingToClear: 'Tu nie ma czego usuwać',
  noMoney: 'Brak pieniędzy',
  blocked: 'Nie można tu budować',
  nothingToRemove: 'Brak torów do rozebrania',
  tooBig: 'Za duże (stacja max 12 × 6, pociąg max 10 wagonów)',
  depotNotEmpty: 'W zajezdni stoją pociągi',
  notInDepot: 'Pociąg musi stać w zajezdni',
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
  /** Preferowany wjazd zajezdni (R); gdy obok jest tor, wjazd ustawia się sam. */
  depotSide: Side = Side.SE;
  private dragStart: Point | null = null;
  private pointer: Point | null = null;
  private dirty = true;
  label: CursorLabel | null = null;

  constructor(
    private readonly sim: Simulation,
    private readonly overlay: Overlay,
  ) {}

  setTool(tool: Tool): void {
    this.tool = tool;
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
    if (this.tool === 'depot') this.depotSide = ((this.depotSide + 1) & 3) as Side;
    else this.stationAxis = this.stationAxis === 'x' ? 'y' : 'x';
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
      if (this.dragStart) this.label = planLabel(plan);
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
    return autoDepotSide(this.sim.state.map, x, y, this.depotSide);
  }

  private stationPlan(start: Point, end: Point) {
    const [x0, y0, x1, y1] = [start.x, start.y, end.x, end.y].map(Math.floor) as [number, number, number, number];
    return planStation(this.sim.state, x0, y0, x1, y1, stationAxis(x0, y0, x1, y1, this.stationAxis));
  }

  private commandFor(start: Point, end: Point): Command | null {
    if (this.tool === 'track') {
      return { type: 'buildTrack', pieces: planTrackLine(start.x, start.y, end.x, end.y) };
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
