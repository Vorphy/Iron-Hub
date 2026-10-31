import { Container, Graphics } from 'pixi.js';
import type { GameState } from '../sim/state';
import { METRO_LEVEL, rampDown, rampTrack } from '../sim/track/metro';
import type { Tunnel } from '../sim/track/tunnel';
import { Side, TRACK_SIDES, tracksOn } from '../sim/track/track';
import type { WorldMap } from '../sim/world/map';
import { heightAt, MAX_HEIGHT } from '../sim/world/height';
import { gfxOn } from './gfx/gfx';
import { drawTrackOverlays, drawUnderPlatform, platformAxis } from './gfx/tiles';
import { flatDiamond, HEIGHT_PX, TILE_H, TILE_W, toWorld } from './iso';
import { drawTrackSegment, drawTrackTile, SIDE_MID, TRACK_STYLE } from './trackDraw';

/** Przyciemnienie powierzchni w widoku metra – obrysy terenu, ulic i domów zostają lekko widoczne. */
const SHADE = 0x05070b;
const SHADE_ALPHA = 0.74;
const FLOOR = 0x2b3038;
const FLOOR_EDGE = 0x434a55;
const RAMP_FLOOR = 0x4a5a6e;
/** Trzecia szyna (zasilanie lokomotyw elektrycznych w metrze). */
const THIRD_RAIL = 0xe0b84a;

/**
 * Widok poziomu −1 (metro): półprzezroczysta „ziemia” nad powierzchnią i tory metra pod nią – płasko,
 * na stałej wysokości METRO_LEVEL (na pagórkach sieć leży niżej na ekranie niż teren nad nią).
 * Rysowany od nowa po zmianie metra.
 */
export class UndergroundRenderer {
  readonly container = new Container();
  private readonly shade = new Graphics();
  private readonly floor = new Graphics();
  /** Przejścia pod torem metra – między podłogą a torami, więc tor drugiej linii biegnie nad nimi. */
  private readonly passes = new Graphics();
  private readonly tracks = new Graphics();
  private dirty = true;

  constructor(width: number, height: number) {
    const left = (-height * TILE_W) / 2 - TILE_W;
    const right = (width * TILE_W) / 2 + TILE_W;
    const top = -MAX_HEIGHT * HEIGHT_PX - 2 * TILE_H;
    const bottom = ((width + height) * TILE_H) / 2 + 2 * TILE_H - METRO_LEVEL * HEIGHT_PX;
    this.shade.rect(left, top, right - left, bottom - top).fill({ color: SHADE, alpha: SHADE_ALPHA });
    this.container.addChild(this.shade, this.floor, this.passes, this.tracks);
    this.container.visible = false;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(on: boolean) {
    this.container.visible = on;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(state: GameState): void {
    if (!this.container.visible || !this.dirty) return;
    this.dirty = false;
    const g = this.tracks;
    g.clear();
    this.floor.clear();
    this.passes.clear();
    const { map } = state;
    for (const t of state.tunnels) if (t.under) drawPass(this.passes, t, map.electricUnder[t.y * map.width + t.x] === 1);
    const sprites = gfxOn();
    const stations = new Map(state.stations.map((s) => [s.id, s]));
    for (let i = 0; i < map.under.length; i++) {
      const bits = map.under[i]!;
      const ramp = map.ramp[i]!;
      if (!bits && !ramp) continue;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      if (ramp) {
        drawRamp(this.floor, g, map, x, y, rampDown(map, x, y)!);
        continue;
      }
      // Kafelek tunelu metra.
      this.floor
        .poly(flatDiamond(x, y, METRO_LEVEL))
        .fill(FLOOR)
        .stroke({ width: 1, color: FLOOR_EDGE, alpha: 0.8 });
      const draw = bits;
      const station = map.stationUnder[i] ? stations.get(map.stationUnder[i]!) : undefined;
      if (station && sprites) {
        drawUnderPlatform(g, x, y, METRO_LEVEL, platformAxis(bits, station));
        continue;
      }
      if (station) g.poly(flatDiamond(x, y, METRO_LEVEL)).fill({ color: 0xa9a49b, alpha: 0.9 });
      if (sprites) {
        const o = toWorld(x, y, METRO_LEVEL);
        drawTrackOverlays(g, o.x, o.y, draw);
      } else {
        drawTrackTile(g, x, y, tracksOn(draw), TRACK_STYLE, map, METRO_LEVEL);
      }
    }
    drawThirdRail(g, map);
  }
}

/** Narożnik kafelka (0/1, 0/1) leży na boku `side`. */
function cornerOnSide(cx: number, cy: number, side: Side): boolean {
  if (side === Side.NE) return cy === 0;
  if (side === Side.SE) return cx === 1;
  if (side === Side.SW) return cy === 1;
  return cx === 0;
}

/**
 * Zjazd: pochylnia od wysokości terenu (tam łączy się z torem na powierzchni) do poziomu metra po
 * stronie `down` – także na wzgórzu, gdzie metro leży dużo niżej niż teren.
 */
function drawRamp(floor: Graphics, g: Graphics, map: WorldMap, x: number, y: number, down: Side): void {
  const top = heightAt(map, x + 0.5, y + 0.5);
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const;
  const pts = corners.flatMap(([cx, cy]) => {
    const p = toWorld(x + cx, y + cy, cornerOnSide(cx, cy, down) ? METRO_LEVEL : top);
    return [p.x, p.y];
  });
  floor.poly(pts).fill(RAMP_FLOOR).stroke({ width: 1, color: FLOOR_EDGE, alpha: 0.8 });
  const [sa, sb] = TRACK_SIDES[rampTrack(down)];
  const [ax, ay] = SIDE_MID[sa];
  const [bx, by] = SIDE_MID[sb];
  const za = sa === down ? METRO_LEVEL : top;
  const zb = sb === down ? METRO_LEVEL : top;
  drawTrackSegment(g, x + ax, y + ay, x + bx, y + by, TRACK_STYLE, (t) => za + (zb - za) * t);
}

// Środki boków kafelka w układzie logicznym.
const MID: Record<Side, readonly [number, number]> = {
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

/** Trzecia szyna: żółta linia z boku każdego elementu toru metra na kafelkach z zasilaniem. */
function drawThirdRail(g: Graphics, map: WorldMap): void {
  const z = METRO_LEVEL;
  let any = false;
  for (let i = 0; i < map.under.length; i++) {
    const bits = map.under[i]!;
    if (!bits || !map.electricUnder[i]) continue;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    for (const track of tracksOn(bits)) {
      const [a, b] = TRACK_SIDES[track].map((s) => MID[s]);
      const dx = b![0] - a![0];
      const dy = b![1] - a![1];
      const len = Math.hypot(dx, dy);
      // Przesunięcie w bok od osi toru (prostopadle), żeby szyna nie zlewała się z torem.
      const ox = (-dy / len) * 0.2;
      const oy = (dx / len) * 0.2;
      const p = toWorld(x + a![0] + ox, y + a![1] + oy, z);
      const q = toWorld(x + b![0] + ox, y + b![1] + oy, z);
      g.moveTo(p.x, p.y).lineTo(q.x, q.y);
      any = true;
    }
  }
  if (any) g.stroke({ width: 1.5, color: THIRD_RAIL, alpha: 0.95 });
}

const PASS = 0x101317;
const PASS_EDGE = 0x8a94a3;

/**
 * Przejście pod torem metra: ciemny wykop w osi między portalami (od połowy portalu do połowy
 * drugiego) z przerywanymi brzegami – tory nad nim to druga linia, przejeżdżająca górą.
 */
function drawPass(g: Graphics, t: Tunnel, powered: boolean): void {
  const z = METRO_LEVEL;
  // a – wzdłuż osi przejścia (od środka portalu A do środka portalu B), b – w poprzek.
  const at = (a: number, b: number) => (t.axis === 'x' ? toWorld(t.x + a, t.y + b, z) : toWorld(t.x + b, t.y + a, z));
  const a0 = 0.5;
  const a1 = t.length - 0.5;
  const quad = (b0: number, b1: number) => [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)].flatMap((p) => [p.x, p.y]);
  g.poly(quad(0.22, 0.78)).fill({ color: PASS, alpha: 0.92 });
  // Brzegi przerywane: tor biegnie tu głębiej, pod spodem.
  for (const b of [0.22, 0.78]) {
    for (let a = a0; a < a1; a += 0.25) {
      const p = at(a, b);
      const q = at(Math.min(a + 0.14, a1), b);
      g.moveTo(p.x, p.y).lineTo(q.x, q.y);
    }
  }
  g.stroke({ width: 1.5, color: PASS_EDGE, alpha: 0.9 });
  if (powered) {
    const p = at(a0, 0.3);
    const q = at(a1, 0.3);
    g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.5, color: THIRD_RAIL, alpha: 0.6 });
  }
}
