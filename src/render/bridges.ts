import { Graphics } from 'pixi.js';
import type { GameState } from '../sim/state';
import { axisTrack, bridgeTileCoords, headSpanSide, sideHeight, type Bridge } from '../sim/track/bridge';
import { oppositeSide } from '../sim/track/track';
import { heightAt } from '../sim/world/height';
import { toWorld, type Point } from './iso';
import { darken } from './shapes';
import { drawTrackSegment, SIDE_MID, TRACK_STYLE } from './trackDraw';

const DECK = 0x5d4a3a;
const STONE = 0x8d877c;
const PILLAR = 0x6f6a62;
const RAIL = 0x2f2b27;
const HALF_WIDTH = 0.26;
const RAILING_H = 5;

const poly = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

/** Mosty (kilka–kilkanaście obiektów) – rysowane w jednej warstwie, odświeżane po zmianach. */
export class BridgeRenderer {
  readonly gfx = new Graphics();

  draw(state: GameState): void {
    const g = this.gfx;
    g.clear();
    for (const b of [...state.bridges].sort((a, c) => a.x + a.y - (c.x + c.y))) drawBridge(g, state, b);
  }
}

function drawBridge(g: Graphics, state: GameState, b: Bridge): void {
  const { map } = state;
  const tiles = bridgeTileCoords(b);
  // Kierunek mostu (oś) i prostopadła „na zewnątrz” w stronę widza (SW dla osi x, SE dla osi y).
  const [ux, uy] = b.axis === 'x' ? [1, 0] : [0, 1];
  const [nx, ny] = b.axis === 'x' ? [0, 1] : [1, 0];

  // Przyczółki: rampa z kamiennym nasypem i tor biegnący w górę do pomostu.
  for (const role of ['headA', 'headB'] as const) {
    const t = role === 'headA' ? tiles[0]! : tiles[tiles.length - 1]!;
    const spanSide = headSpanSide(b, role);
    const outer = oppositeSide(spanSide);
    const [ox, oy] = SIDE_MID[outer];
    const [sx, sy] = SIDE_MID[spanSide];
    const outerZ = sideHeight(map, t.x, t.y, outer);
    const at = (fx: number, fy: number, z: number) => toWorld(t.x + fx, t.y + fy, z);
    // Nasyp po stronie widza.
    const off = HALF_WIDTH;
    g.poly(
      poly([
        at(ox + nx * off, oy + ny * off, heightAt(map, t.x + ox + nx * off, t.y + oy + ny * off)),
        at(sx + nx * off, sy + ny * off, heightAt(map, t.x + sx + nx * off, t.y + sy + ny * off)),
        at(sx + nx * off, sy + ny * off, b.deck),
        at(ox + nx * off, oy + ny * off, outerZ),
      ]),
    ).fill(STONE);
    // Nawierzchnia rampy.
    g.poly(
      poly([
        at(ox + nx * off, oy + ny * off, outerZ),
        at(sx + nx * off, sy + ny * off, b.deck),
        at(sx - nx * off, sy - ny * off, b.deck),
        at(ox - nx * off, oy - ny * off, outerZ),
      ]),
    ).fill(darken(STONE, 0.85));
    drawTrackSegment(g, t.x + ox, t.y + oy, t.x + sx, t.y + sy, TRACK_STYLE, (k) => outerZ + (b.deck - outerZ) * k);
  }

  // Pomost nad kafelkami pośrodku.
  for (const t of tiles.slice(1, -1)) {
    const cx = t.x + 0.5;
    const cy = t.y + 0.5;
    // Filary (od terenu do pomostu), po obu stronach osi.
    for (const k of [-1, 1]) {
      const px = cx + nx * k * 0.18;
      const py = cy + ny * k * 0.18;
      const top = toWorld(px, py, b.deck);
      const bottom = toWorld(px, py, heightAt(map, px, py));
      g.rect(top.x - 2.5, top.y, 5, Math.max(0, bottom.y - top.y)).fill(PILLAR);
    }
    const a0 = { x: cx - ux * 0.5, y: cy - uy * 0.5 };
    const a1 = { x: cx + ux * 0.5, y: cy + uy * 0.5 };
    const corner = (p: { x: number; y: number }, k: number, z: number) => toWorld(p.x + nx * k, p.y + ny * k, z);
    // Bok pomostu (grubość) i nawierzchnia.
    g.poly(
      poly([corner(a0, HALF_WIDTH, b.deck), corner(a1, HALF_WIDTH, b.deck), corner(a1, HALF_WIDTH, b.deck - 0.5), corner(a0, HALF_WIDTH, b.deck - 0.5)]),
    ).fill(darken(DECK, 0.7));
    g.poly(
      poly([corner(a0, HALF_WIDTH, b.deck), corner(a1, HALF_WIDTH, b.deck), corner(a1, -HALF_WIDTH, b.deck), corner(a0, -HALF_WIDTH, b.deck)]),
    ).fill(DECK);
    drawTrackSegment(g, a0.x, a0.y, a1.x, a1.y, TRACK_STYLE, () => b.deck);
  }

  // Barierki wzdłuż całego pomostu (od krawędzi przyczółka A do B).
  const start = tiles[1]!;
  const end = tiles[tiles.length - 2]!;
  const s0 = { x: start.x + 0.5 - ux * 0.5, y: start.y + 0.5 - uy * 0.5 };
  const s1 = { x: end.x + 0.5 + ux * 0.5, y: end.y + 0.5 + uy * 0.5 };
  for (const k of [-HALF_WIDTH, HALF_WIDTH]) {
    const p0 = toWorld(s0.x + nx * k, s0.y + ny * k, b.deck);
    const p1 = toWorld(s1.x + nx * k, s1.y + ny * k, b.deck);
    g.moveTo(p0.x, p0.y - RAILING_H).lineTo(p1.x, p1.y - RAILING_H);
  }
  g.stroke({ width: 1.5, color: RAIL });
}

/** Element toru przyczółka (rysuje go most, nie mapa). */
export function isHeadAxisTrack(b: Bridge, track: number): boolean {
  return track === axisTrack(b.axis);
}

