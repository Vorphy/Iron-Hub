import type { Graphics } from 'pixi.js';
import { Side, SIDE_DELTA } from '../sim/track/track';
import { inBounds, type WorldMap } from '../sim/world/map';
import { tileToWorld, type Point } from './iso';
import { SIDE_MID } from './trackDraw';

const ASPHALT = 0x5a5d62;
const CURB = 0x8a8c90;
const LINE = 0xd8d2b8;
/** Pół szerokości jezdni (ułamek kafelka). */
const HALF = 0.22;

const SIDES = [Side.NE, Side.SE, Side.SW, Side.NW] as const;

/** Boki kafelka, za którymi też jest droga. */
export function roadNeighbors(map: WorldMap, x: number, y: number): Side[] {
  return SIDES.filter((s) => {
    const [dx, dy] = SIDE_DELTA[s];
    return inBounds(map, x + dx, y + dy) && map.road[(y + dy) * map.width + x + dx] === 1;
  });
}

const poly = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

/** Droga na kafelku: plac w środku i ramiona do sąsiednich dróg (płaski kafelek). */
export function drawRoad(g: Graphics, map: WorldMap, x: number, y: number): void {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const at = (lx: number, ly: number) => tileToWorld(lx, ly);
  const arms = roadNeighbors(map, x, y);
  // Plac w środku.
  g.poly(poly([at(cx - HALF, cy - HALF), at(cx + HALF, cy - HALF), at(cx + HALF, cy + HALF), at(cx - HALF, cy + HALF)])).fill(
    ASPHALT,
  );
  for (const side of arms) {
    const [mx, my] = SIDE_MID[side];
    const ex = x + mx;
    const ey = y + my;
    // Prostopadła do ramienia.
    const px = mx === 0.5 ? HALF : 0;
    const py = mx === 0.5 ? 0 : HALF;
    g.poly(poly([at(cx - px, cy - py), at(cx + px, cy + py), at(ex + px, ey + py), at(ex - px, ey - py)])).fill(ASPHALT);
    // Krawężniki i przerywana linia środkowa.
    g.moveTo(at(cx - px, cy - py).x, at(cx - px, cy - py).y).lineTo(at(ex - px, ey - py).x, at(ex - px, ey - py).y);
    g.moveTo(at(cx + px, cy + py).x, at(cx + px, cy + py).y).lineTo(at(ex + px, ey + py).x, at(ex + px, ey + py).y);
    g.stroke({ width: 1, color: CURB, alpha: 0.8 });
    const a = at(cx + (ex - cx) * 0.35, cy + (ey - cy) * 0.35);
    const b = at(cx + (ex - cx) * 0.75, cy + (ey - cy) * 0.75);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: LINE, alpha: 0.7 });
  }
}
