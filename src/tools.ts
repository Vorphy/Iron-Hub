import { planCatenary } from './sim/track/catenary';
import type { Overlay } from './render/overlay';
import type { Command, FailReason } from './sim/commands';
import { BRIDGE_TILE_COST, CLEAR_ROUGH_COST, SIGNAL_COST, TRACK_REFUND_RATE, TUNNEL_TILE_COST } from './sim/config';
import { CARGO_DEFS, type Cargo } from './sim/economy/cargo';
import { catchmentCargo } from './sim/economy/cargoFlow';
import { autoDepotSide, depotAt, depotRefund, planDepot } from './sim/depot/depot';
import {
  allTiles,
  catchment,
  planStation,
  planWaypoint,
  stationAt,
  stationAxis,
  stationTileRefund,
  type StationAxis,
} from './sim/station/station';
import { planTrackLine } from './sim/track/autorail';
import { planBuildTrack, planRemoveTrack, type TrackPlan } from './sim/track/build';
import { nextSignalState } from './sim/signals/signals';
import { getTrackBits, Side, type Track, TRACK_SIDES, tracksOn, type TrackPiece } from './sim/track/track';
import type { Simulation } from './sim/simulation';
import { getTerrain, inBounds, Terrain } from './sim/world/map';
import { levelTargets, planTerraform, terraformTargets } from './sim/world/terraform';
import { bridgeAt, bridgeRole, bridgeTileCoords, planBridge } from './sim/track/bridge';
import { metroTunnelAt, metroTunnelRefund, planMetroTunnel } from './sim/track/metroTunnel';
import { planTunnel, tunnelAt, tunnelRole, tunnelTileCoords } from './sim/track/tunnel';
import { autoRampDown, METRO_LEVEL, planBuildUnderTrack, planRamp, planRemoveUnderTrack } from './sim/track/metro';
import type { Point } from './render/iso';

/** 'orders' – wskazywanie stacji do rozkładu pociągu `ordersTrain` (z okna pociągu). */
export type Tool =
  | 'cursor'
  | 'track'
  | 'station'
  | 'depot'
  | 'signal'
  | 'catenary'
  | 'terrain'
  | 'bridge'
  | 'tunnel'
  | 'ramp'
  | 'bulldozer'
  | 'orders';

/** Narzędzie Stacja: perony albo punkt kontrolny na torze. */
export type StationKind = 'platform' | 'waypoint';

/** Narzędzie Teren: podnieś / obniż narożnik albo wyrównaj obszar. */
export type TerrainMode = 'raise' | 'lower' | 'level';

/** Narzędzie Tory: budowa albo rozbiórka (jak przy semaforach). */
export type TrackMode = 'build' | 'remove';

/** Rodzaj semafora stawianego narzędziem (albo usuwanie). */
export type SignalKind = 'path' | 'oneway' | 'remove';

export const FAIL_MESSAGES: Record<FailReason, string> = {
  outOfBounds: 'Poza mapą',
  nothingToClear: 'Tu nie ma czego usuwać',
  noMoney: 'Brak pieniędzy',
  blocked: 'Nie można tu budować',
  nothingToRemove: 'Brak torów do rozebrania',
  tooBig: 'Za duże (stacja max 12 × 6, pociąg max 10 wagonów)',
  depotNotEmpty: 'W zajezdni stoją pociągi albo wolne wagony',
  notInDepot: 'Pociąg musi stać w zajezdni',
  depotNotConnected: 'Zajezdnia nie ma toru przy wjeździe',
  trainInWay: 'Na drodze stoi pociąg',
  industry: 'Zakładów przemysłowych nie można burzyć',
  tooHigh: 'Teren poza zakresem wysokości (0–8)',
  bridgeHeads: 'Przyczółki mostu muszą być na tej samej wysokości',
  bridgeLow: 'Teren pod mostem jest za wysoko',
  tunnelNoExit: 'Tunel nie trafia na zbocze po drugiej stronie (albo nad nim jest za nisko)',
  noTrack: 'Tu nie ma toru',
  alreadyBuilt: 'Sieć trakcyjna już tu jest',
  notAvailable: 'Ta lokomotywa nie jest dostępna w tym roku',
  noDepot: 'Brak zajezdni na kopię (dla lokomotywy elektrycznej – zajezdni z siecią trakcyjną)',
  noCatenary: 'Lokomotywa elektryczna – zajezdnia nie ma sieci trakcyjnej (narzędzie Trakcja, E)',
  loanLimit: 'Osiągnięto limit kredytu',
  noLoan: 'Nie masz kredytu do spłaty',
  bankrupt: 'Firma zbankrutowała',
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
  trackMode: TrackMode = 'build';
  /** Narzędzie Trakcja: budowa albo zdjęcie sieci. */
  catenaryMode: TrackMode = 'build';
  /** Stacja: osobna zamiast rozbudowy sąsiedniej (panel); Ctrl / Shift odwraca na czas trzymania. */
  stationSeparate = false;
  stationKind: StationKind = 'platform';
  private modifierHeld = false;
  terrainMode: TerrainMode = 'raise';
  /** Pociąg, któremu dopisujemy stacje (narzędzie 'orders'). */
  ordersTrain: number | null = null;
  /** Budowa na poziomie −1 (metro) – przełącznik widoku. */
  under = false;
  /** Zjazd do metra: bok, którym tor schodzi pod ziemię (gdy otoczenie go nie podpowiada). */
  rampSide: Side = Side.SE;
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

  /** Klawisz R: obrót stacji, wjazdu zajezdni albo zjazdu do metra. */
  rotate(): void {
    if (this.tool === 'ramp') {
      const map = this.sim.state.map;
      const p = this.pointer;
      const cur = p ? autoRampDown(map, Math.floor(p.x), Math.floor(p.y), this.rampSide) : this.rampSide;
      this.rampSide = ((cur + 1) & 3) as Side;
      this.rampAuto = false;
      this.dirty = true;
    } else if (this.tool === 'depot') this.setDepotSide(((this.depotSide + 1) & 3) as Side);
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

  /** Kierunek zjazdu: z otoczenia, dopóki gracz nie obróci go klawiszem R. */
  private rampAuto = true;

  setUnder(on: boolean): void {
    this.under = on;
    this.overlay.level = on ? METRO_LEVEL : null;
    this.dragStart = null;
    this.dirty = true;
  }

  private rampDownAt(x: number, y: number): Side {
    return this.rampAuto ? autoRampDown(this.sim.state.map, x, y, this.rampSide) : this.rampSide;
  }

  setTerrainMode(mode: TerrainMode): void {
    this.terrainMode = mode;
    this.dirty = true;
  }

  setTrackMode(mode: TrackMode): void {
    this.trackMode = mode;
    this.dirty = true;
  }

  setCatenaryMode(mode: TrackMode): void {
    this.catenaryMode = mode;
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

  setStationKind(kind: StationKind): void {
    this.stationKind = kind;
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
      const station = tile && stationAt(this.sim.state, tile.x, tile.y, this.under);
      if (station && !station.waypoint) this.overlay.setCatchment(catchment(map, allTiles(station)), map.width);
      return;
    }

    const start = this.dragStart ?? p;
    if (this.tool === 'ramp') {
      if (!tile) return this.overlay.setHover(null);
      const down = this.rampDownAt(tile.x, tile.y);
      const plan = planRamp(this.sim.state, tile.x, tile.y, down);
      this.overlay.setHover(tile, plan.result.ok ? 0x4cc9f0 : 0xe0503a);
      this.overlay.setDepotPreview(tile.x, tile.y, down, plan.result.ok);
      this.label = { ...planLabel(plan), text: `Zjazd ${SIDE_ARROWS[down]} · ${planLabel(plan).text} (R – obróć)` };
      return;
    }
    // Pod ziemią (metro): tory, perony, zjazdy, przejścia pod torem, rozkład i rozbiórka.
    const underTools: Tool[] = ['track', 'bulldozer', 'station', 'orders', 'signal', 'tunnel'];
    if (this.under && (!underTools.includes(this.tool) || (this.tool === 'station' && this.stationKind === 'waypoint'))) {
      this.overlay.setHover(tile, 0x9aa0a8);
      this.label = { text: 'Pod ziemią: tory, perony, semafory, zjazdy, przejścia i rozbiórka (Q – powierzchnia)', ok: false };
      return;
    }
    if (this.under && this.tool === 'tunnel') {
      this.overlay.setHover(tile);
      if (!this.dragStart || !tile || sameTile(start, p)) {
        this.label = { text: 'Przejście pod torem: przeciągnij wzdłuż toru metra przez tor drugiej linii', ok: true };
        return;
      }
      const [x0, y0, x1, y1] = bridgeEnds(start, p);
      const plan = planMetroTunnel(this.sim.state, x0, y0, x1, y1);
      if (plan.tunnel) {
        const tiles = tunnelTileCoords(plan.tunnel).map((t) => t.y * map.width + t.x);
        this.overlay.setTerrainPreview(tiles, map.width, plan.result.ok, null);
      }
      this.label = planLabel(plan);
      return;
    }
    if (this.under && this.tool === 'bulldozer' && sameTile(start, p) && tile) {
      const pass = metroTunnelAt(this.sim.state, tile.x, tile.y);
      if (pass && tunnelRole(pass, tile.x, tile.y) !== 'inside') {
        this.overlay.setHover(tile, 0xe0503a);
        this.label = { text: `Przejście pod torem – zwrot: ${formatMoney(metroTunnelRefund(pass))}`, ok: true };
        return;
      }
    }
    if (this.under && this.tool === 'bulldozer' && sameTile(start, p) && tile && map.stationUnder[tile.y * map.width + tile.x]) {
      const station = stationAt(this.sim.state, tile.x, tile.y, true);
      this.overlay.setHover(tile, 0xe0503a);
      this.label = { text: `Zwrot: ${formatMoney(stationTileRefund(station, true))}`, ok: true };
      return;
    }
    if (this.under && (this.tool === 'track' || this.tool === 'bulldozer')) {
      this.overlay.setHover(null);
      if (this.tool === 'track' && this.trackMode === 'build') {
        const plan = planBuildUnderTrack(this.sim.state, planTrackLine(start.x, start.y, p.x, p.y));
        this.overlay.setTrackPreview(plan);
        if (this.dragStart) this.label = planLabel(plan);
        return;
      }
      const pieces = this.removalPieces(start, p);
      if (!pieces.length) {
        this.overlay.setHover(tile, 0xe0503a);
        this.label = sameTile(start, p) ? { text: 'Wskaż tor metra', ok: false } : null;
        return;
      }
      const plan = planRemoveUnderTrack(this.sim.state, pieces);
      this.overlay.setTrackPreview(plan, true);
      this.label = planLabel(plan);
      return;
    }
    if (this.tool === 'tunnel') {
      this.overlay.setHover(tile);
      if (!tile) return;
      const plan = planTunnel(this.sim.state, tile.x, tile.y);
      if (plan.tunnel) {
        const tiles = tunnelTileCoords(plan.tunnel).map((t) => t.y * map.width + t.x);
        this.overlay.setTerrainPreview(tiles, map.width, plan.result.ok, null);
      }
      this.label = planLabel(plan);
      return;
    }

    if (this.tool === 'bridge') {
      this.overlay.setHover(tile);
      if (!this.dragStart || !tile) return;
      const [x0, y0, x1, y1] = bridgeEnds(start, p);
      const plan = planBridge(this.sim.state, x0, y0, x1, y1);
      const tiles = bridgeTileCoords({
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        axis: x0 !== x1 ? 'x' : 'y',
        length: Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1,
      })
        .filter((t) => inBounds(map, t.x, t.y))
        .map((t) => t.y * map.width + t.x);
      this.overlay.setTerrainPreview(tiles, map.width, plan.result.ok, null);
      this.label = planLabel(plan);
      return;
    }

    if (this.tool === 'terrain') {
      this.overlay.setHover(null);
      const v = nearestVertex(start);
      const end = this.terrainMode === 'level' ? nearestVertex(p) : v;
      const plan = planTerraform(this.sim.state, this.terrainTargets(v, end));
      this.overlay.setTerrainPreview(plan.tiles, map.width, plan.result.ok, end);
      const level = this.terrainMode === 'level' ? ` · do poziomu ${vertexHeightSafe(this.sim, v)}` : '';
      this.label = plan.changes.size || this.dragStart ? { ...planLabel(plan), text: planLabel(plan).text + level } : null;
      return;
    }

    if (this.tool === 'track' && this.trackMode === 'remove') {
      this.previewRemoval(start, p, false);
      return;
    }

    if (this.tool === 'catenary') {
      this.overlay.setHover(null);
      const plan = planCatenary(this.sim.state, catenaryTiles(start, p), this.catenaryMode === 'remove');
      this.overlay.setTerrainPreview(plan.tiles, map.width, plan.result.ok, null);
      this.label = planLabel(plan);
      return;
    }

    if (this.tool === 'track') {
      this.overlay.setHover(null);
      const plan = planBuildTrack(this.sim.state, planTrackLine(start.x, start.y, p.x, p.y));
      this.overlay.setTrackPreview(plan);
      if (this.dragStart) this.label = planLabel(plan);
      return;
    }

    if (this.tool === 'signal') {
      const piece = tile && nearestPiece(this.sim, p, this.under);
      this.overlay.setHover(tile, 0x9aa0a8);
      if (!piece) {
        this.label = { text: 'Wskaż tor', ok: false };
        return;
      }
      const existing = this.sim.state.signals.find(
        (s) => s.x === piece.x && s.y === piece.y && s.track === piece.track && !!s.under === this.under,
      );
      const after =
        this.signalKind === 'remove' ? null : { ...piece, ...nextSignalState(existing, this.signalKind === 'oneway') };
      this.overlay.setPieceHighlight(piece.x, piece.y, piece.track, after, map);
      this.label =
        this.signalKind === 'remove'
          ? existing
            ? { text: 'Usuń semafor', ok: true }
            : { text: 'Brak semafora', ok: false }
          : existing
            ? { text: after?.dirs === 3 ? 'Kliknij: oba kierunki' : 'Kliknij: zmień kierunek', ok: true }
            : { text: `Koszt: ${formatMoney(SIGNAL_COST)}`, ok: this.sim.state.money >= SIGNAL_COST };
      // Co znaczy strzałka: jednokierunkowy – pod prąd nie przejedzie nikt; zwykły – zatrzymuje tylko
      // jadących w stronę strzałki, z naprzeciwka mija się go od tyłu.
      if (after && this.label.ok) {
        const hint = after.oneWay ? 'jazda tylko w stronę strzałki' : 'dla jadących w stronę strzałki';
        this.label = { text: `${this.label.text} · ${hint}`, ok: true };
      }
      return;
    }

    if (this.tool === 'orders') {
      const station = tile && stationAt(this.sim.state, tile.x, tile.y, this.under);
      this.overlay.setHover(tile, station ? 0x4cc9f0 : 0x9aa0a8);
      if (station && !station.waypoint) this.overlay.setCatchment(catchment(map, allTiles(station)), map.width);
      this.label = station
        ? { text: `Dodaj: ${station.name}${station.waypoint ? ' (punkt kontrolny)' : ''}`, ok: true }
        : { text: 'Wskaż stację lub punkt kontrolny', ok: false };
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

    if (this.tool === 'station' && this.stationKind === 'waypoint') {
      this.overlay.setHover(tile, 0x4cc9f0);
      if (!tile) return;
      const plan = planWaypoint(this.sim.state, tile.x, tile.y);
      this.label = plan.result.ok ? { text: `Punkt kontrolny · ${planLabel(plan).text}`, ok: true } : planLabel(plan);
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
      const transfer = plan.join && (this.under ? plan.join.tiles.length > 0 : !!plan.join.underTiles?.length);
      const kind = plan.join
        ? `${transfer ? 'Przesiadka' : 'Rozbudowa'}: ${plan.join.name}`
        : this.dragStart
          ? this.under
            ? 'Nowa stacja metra'
            : 'Nowa stacja'
          : '';
      this.label =
        base || cargoInfo ? { text: [kind, base?.text, cargoInfo].filter(Boolean).join(' · '), ok: base?.ok ?? true } : null;
      return;
    }

    // Buldożer
    if (sameTile(start, p)) {
      this.overlay.setHover(tile, 0xe0503a);
      if (!tile) return;
      const bits = getTrackBits(map, tile.x, tile.y);
      const station = stationAt(this.sim.state, tile.x, tile.y);
      if (station) {
        this.label = { text: `Zwrot: ${formatMoney(stationTileRefund(station))}`, ok: true };
      } else if (depotAt(this.sim.state, tile.x, tile.y)) {
        this.label = { text: `Zwrot: ${formatMoney(depotRefund())}`, ok: true };
      } else if (structureAt(this.sim, tile.x, tile.y)) {
        const s = structureAt(this.sim, tile.x, tile.y)!;
        this.label = { text: `Rozbierz ${s.name} · zwrot: ${formatMoney(s.refund)}`, ok: true };
      } else if (bits) {
        this.previewRemoval(start, p, true);
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

  /**
   * Podgląd rozbiórki toru: klik – jeden element najbliższy kursorowi, przeciągnięcie – odcinek.
   * `keepHover` – zostaw podświetlenie kafelka (buldożer).
   */
  private previewRemoval(start: Point, p: Point, keepHover: boolean): void {
    if (!keepHover) this.overlay.setHover(null);
    const pieces = this.removalPieces(start, p);
    if (pieces.length === 0) {
      this.label = sameTile(start, p) ? { text: 'Wskaż tor', ok: false } : null;
      return;
    }
    const plan = planRemoveTrack(this.sim.state, pieces);
    this.overlay.setTrackPreview(plan, true);
    this.label = planLabel(plan);
  }

  /** Elementy do rozbiórki: jeden pod kursorem (klik) albo linia (przeciągnięcie). */
  private removalPieces(start: Point, end: Point): TrackPiece[] {
    if (!sameTile(start, end)) return planTrackLine(start.x, start.y, end.x, end.y);
    const piece = nearestPiece(this.sim, end, this.under);
    return piece ? [piece] : [];
  }

  private terrainTargets(v: Point, end: Point): Map<number, number> {
    const s = this.sim.state;
    if (this.terrainMode === 'level') return levelTargets(s, v.x, v.y, end.x, end.y, vertexHeightSafe(this.sim, v));
    return terraformTargets(s, v.x, v.y, this.terrainMode === 'raise' ? 1 : -1);
  }

  private depotSideAt(x: number, y: number): Side {
    return this.depotAuto ? autoDepotSide(this.sim.state.map, x, y, this.depotSide) : this.depotSide;
  }

  /** Osobna stacja zamiast rozbudowy: przełącznik w panelu albo wciśnięty Ctrl / Shift (odwraca). */
  get separateStation(): boolean {
    return this.stationSeparate !== this.modifierHeld;
  }

  setStationSeparate(on: boolean): void {
    this.stationSeparate = on;
    this.dirty = true;
  }

  setModifier(held: boolean): void {
    if (held === this.modifierHeld) return;
    this.modifierHeld = held;
    this.dirty = true;
  }

  private stationPlan(start: Point, end: Point) {
    const [x0, y0, x1, y1] = [start.x, start.y, end.x, end.y].map(Math.floor) as [number, number, number, number];
    const axis = stationAxis(x0, y0, x1, y1, this.stationAxis);
    return planStation(this.sim.state, x0, y0, x1, y1, axis, this.separateStation, this.under);
  }

  private commandFor(start: Point, end: Point): Command | null {
    // Pod ziemią działają tylko narzędzia metra (pozostałe budowałyby na powierzchni).
    const metroTools: Tool[] = ['track', 'bulldozer', 'station', 'orders', 'signal', 'ramp', 'tunnel'];
    if (this.under && !metroTools.includes(this.tool)) return null;
    if (this.under && this.tool === 'tunnel') {
      if (sameTile(start, end)) return null;
      const [x0, y0, x1, y1] = bridgeEnds(start, end);
      return { type: 'buildMetroTunnel', x0, y0, x1, y1 };
    }
    if (this.tool === 'tunnel') return { type: 'buildTunnel', x: Math.floor(end.x), y: Math.floor(end.y) };
    if (this.tool === 'bridge') {
      if (sameTile(start, end)) return null;
      const [x0, y0, x1, y1] = bridgeEnds(start, end);
      return { type: 'buildBridge', x0, y0, x1, y1 };
    }
    if (this.tool === 'terrain') {
      const v = nearestVertex(start);
      if (this.terrainMode === 'level') {
        const e = nearestVertex(end);
        return { type: 'levelLand', vx0: v.x, vy0: v.y, vx1: e.x, vy1: e.y, level: vertexHeightSafe(this.sim, v) };
      }
      return { type: 'terraform', vx: v.x, vy: v.y, delta: this.terrainMode === 'raise' ? 1 : -1 };
    }
    if (this.tool === 'signal') {
      const piece = nearestPiece(this.sim, end, this.under);
      if (!piece) return null;
      const under = this.under ? { under: true } : {};
      if (this.signalKind === 'remove') return { type: 'removeSignal', ...piece, ...under };
      return { type: 'placeSignal', ...piece, oneWay: this.signalKind === 'oneway', ...under };
    }
    if (this.tool === 'catenary') {
      const tiles = catenaryTiles(start, end);
      return { type: this.catenaryMode === 'remove' ? 'removeCatenary' : 'buildCatenary', tiles };
    }
    if (this.tool === 'ramp') {
      const x = Math.floor(end.x);
      const y = Math.floor(end.y);
      return { type: 'buildRamp', x, y, down: this.rampDownAt(x, y) };
    }
    if (this.under) {
      if (this.tool === 'track' && this.trackMode === 'build') {
        return { type: 'buildTrack', pieces: planTrackLine(start.x, start.y, end.x, end.y), under: true };
      }
      if (this.tool === 'bulldozer' && sameTile(start, end)) {
        const x = Math.floor(end.x);
        const y = Math.floor(end.y);
        const { map } = this.sim.state;
        if (inBounds(map, x, y) && map.stationUnder[y * map.width + x]) return { type: 'removeUnderStation', x, y };
        const pass = metroTunnelAt(this.sim.state, x, y);
        if (pass && tunnelRole(pass, x, y) !== 'inside') return { type: 'removeMetroTunnel', x, y };
      }
      if (this.tool === 'track' || this.tool === 'bulldozer') {
        const pieces = this.removalPieces(start, end);
        return pieces.length ? { type: 'removeTrack', pieces, under: true } : null;
      }
      // Pod ziemią poza tym tylko perony metra i rozkład (niżej); reszta narzędzi – nic.
      if (this.tool !== 'orders' && (this.tool !== 'station' || this.stationKind === 'waypoint')) return null;
    }
    if (this.tool === 'track') {
      if (this.trackMode === 'remove') {
        const pieces = this.removalPieces(start, end);
        return pieces.length ? { type: 'removeTrack', pieces } : null;
      }
      return { type: 'buildTrack', pieces: planTrackLine(start.x, start.y, end.x, end.y) };
    }
    if (this.tool === 'orders') {
      const station = stationAt(this.sim.state, Math.floor(end.x), Math.floor(end.y), this.under);
      const train = this.sim.state.trains.find((t) => t.id === this.ordersTrain);
      if (!station || !train) return null;
      return { type: 'setOrders', trainId: train.id, orders: [...train.orders, station.id] };
    }
    if (this.tool === 'depot') {
      const x = Math.floor(end.x);
      const y = Math.floor(end.y);
      return { type: 'buildDepot', x, y, side: this.depotSideAt(x, y) };
    }
    if (this.tool === 'station' && this.stationKind === 'waypoint') {
      return { type: 'buildWaypoint', x: Math.floor(end.x), y: Math.floor(end.y) };
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
        separate: this.separateStation,
        ...(this.under ? { under: true } : {}),
      };
    }
    if (this.tool === 'bulldozer') {
      const x = Math.floor(end.x);
      const y = Math.floor(end.y);
      const { map } = this.sim.state;
      const i = y * map.width + x;
      // Zwykły tor: tylko wskazany element; stacja, zajezdnia, most (przyczółek), tunel (wejście),
      // dom, nieużytek – cały obiekt (rampa mostu i tor wjazdu do tunelu to nie „zwykły tor”).
      const plainTrack =
        inBounds(map, x, y) && map.track[i] && !map.station[i] && !map.depot[i] && !map.ramp[i] && !structureAt(this.sim, x, y);
      if (sameTile(start, end) && !plainTrack) return { type: 'clearTile', x, y };
      const pieces = this.removalPieces(start, end);
      return pieces.length ? { type: 'removeTrack', pieces } : null;
    }
    return null;
  }
}

/** Strzałka kierunku na ekranie (rzut izometryczny) – zjazd schodzi pod ziemię w tę stronę. */
const SIDE_ARROWS: Record<Side, string> = { [Side.NE]: '↗', [Side.SE]: '↘', [Side.SW]: '↙', [Side.NW]: '↖' };

// Środki boków kafelka (do wyboru najbliższego elementu toru).
const MID: Record<Side, readonly [number, number]> = {
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

/** Element toru na kafelku pod kursorem najbliższy kursorowi (do stawiania semaforów). */
function nearestPiece(sim: Simulation, p: Point, under = false): { x: number; y: number; track: Track } | null {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (!inBounds(sim.state.map, x, y)) return null;
  const fx = p.x - x;
  const fy = p.y - y;
  let best: Track | null = null;
  let bestD = Infinity;
  const bits = under ? sim.state.map.under[y * sim.state.map.width + x]! : getTrackBits(sim.state.map, x, y);
  for (const track of tracksOn(bits)) {
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

/** Most (przyczółek albo pomost bez toru pod spodem) lub tunel (wejście) na kafelku – buldożer rozbiera całość. */
function structureAt(sim: Simulation, x: number, y: number): { name: string; refund: number } | null {
  const state = sim.state;
  const { map } = state;
  if (!inBounds(map, x, y)) return null;
  const i = y * map.width + x;
  const bridge = map.bridge[i] ? bridgeAt(state, x, y) : undefined;
  if (bridge && (bridgeRole(bridge, x, y) !== 'span' || !map.track[i])) {
    return { name: 'most', refund: Math.round(bridge.length * BRIDGE_TILE_COST * TRACK_REFUND_RATE) };
  }
  const tunnel = map.tunnel[i] ? tunnelAt(state, x, y) : undefined;
  if (tunnel && tunnelRole(tunnel, x, y) !== 'inside') {
    return { name: 'tunel', refund: Math.round(tunnel.length * TUNNEL_TILE_COST * TRACK_REFUND_RATE) };
  }
  return null;
}

/** Kafelki pod linią przeciągnięcia (jak przy budowie toru, także po skosie); klik – kafelek pod kursorem. */
function catenaryTiles(start: Point, end: Point): { x: number; y: number }[] {
  const tile = { x: Math.floor(end.x), y: Math.floor(end.y) };
  if (sameTile(start, end)) return [tile];
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  for (const p of [...planTrackLine(start.x, start.y, end.x, end.y), tile]) {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Końce mostu z przeciągnięcia: prosta wzdłuż dominującej osi od kafelka startowego. */
function bridgeEnds(start: Point, end: Point): [number, number, number, number] {
  const x0 = Math.floor(start.x);
  const y0 = Math.floor(start.y);
  const x1 = Math.floor(end.x);
  const y1 = Math.floor(end.y);
  return Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? [x0, y0, x1, y0] : [x0, y0, x0, y1];
}

/** Narożnik kafelka najbliższy punktowi. */
function nearestVertex(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function vertexHeightSafe(sim: Simulation, v: Point): number {
  const { map } = sim.state;
  const x = Math.max(0, Math.min(map.width, v.x));
  const y = Math.max(0, Math.min(map.height, v.y));
  return map.heights[y * (map.width + 1) + x]!;
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
