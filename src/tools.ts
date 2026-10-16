import type { Overlay } from './render/overlay';
import type { Command, FailReason } from './sim/commands';
import { CLEAR_ROUGH_COST } from './sim/config';
import { planTrackLine } from './sim/track/autorail';
import { planBuildTrack, planRemoveTrack, type TrackPlan } from './sim/track/build';
import { getTrackBits, tracksOn } from './sim/track/track';
import type { Simulation } from './sim/simulation';
import { getTerrain, inBounds, Terrain } from './sim/world/map';
import type { Point } from './render/iso';

export type Tool = 'cursor' | 'track' | 'bulldozer';

export const FAIL_MESSAGES: Record<FailReason, string> = {
  outOfBounds: 'Poza mapą',
  nothingToClear: 'Tu nie ma czego usuwać',
  noMoney: 'Brak pieniędzy',
  blocked: 'Nie można tu budować',
  nothingToRemove: 'Brak torów do rozebrania',
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

    const p = this.pointer;
    const map = this.sim.state.map;
    const tile = p && inBounds(map, Math.floor(p.x), Math.floor(p.y)) ? { x: Math.floor(p.x), y: Math.floor(p.y) } : null;

    if (this.tool === 'cursor' || !p) {
      this.overlay.setHover(tile);
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

    // Buldożer
    if (sameTile(start, p)) {
      this.overlay.setHover(tile, 0xe0503a);
      if (!tile) return;
      const bits = getTrackBits(map, tile.x, tile.y);
      if (bits) {
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

  private commandFor(start: Point, end: Point): Command | null {
    if (this.tool === 'track') {
      return { type: 'buildTrack', pieces: planTrackLine(start.x, start.y, end.x, end.y) };
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

function planLabel(plan: TrackPlan): CursorLabel {
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
