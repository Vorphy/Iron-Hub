import type { Graphics } from 'pixi.js';
import { Side } from '../sim/track/track';
import { tileToWorld, type Point } from './iso';
import { drawTrackSegment, SIDE_MID, TRACK_STYLE, type TrackStyle } from './trackDraw';

export interface DepotStyle {
  wallLight: number;
  wallDark: number;
  roof: number;
  door: number;
  alpha: number;
}

export const DEPOT_STYLE: DepotStyle = { wallLight: 0x9c5a44, wallDark: 0x7a4232, roof: 0x4a4f57, door: 0x1e1a18, alpha: 1 };

const INSET = 0.12;
const WALL_H = 16;

/** Zajezdnia: kawałek toru od wjazdu do środka i budynek z bramą od strony wjazdu. */
export function drawDepot(
  g: Graphics,
  x: number,
  y: number,
  side: Side,
  style: DepotStyle = DEPOT_STYLE,
  track: TrackStyle = TRACK_STYLE,
): void {
  const [mx, my] = SIDE_MID[side];
  drawTrackSegment(g, x + mx, y + my, x + 0.5, y + 0.5, track);

  const a = tileToWorld(x + INSET, y + INSET); // góra
  const b = tileToWorld(x + 1 - INSET, y + INSET); // prawo
  const c = tileToWorld(x + 1 - INSET, y + 1 - INSET); // dół
  const d = tileToWorld(x + INSET, y + 1 - INSET); // lewo
  const up = (p: Point): Point => ({ x: p.x, y: p.y - WALL_H });
  const poly = (...pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

  // Widoczne są ściany od strony SE (b–c) i SW (c–d) oraz dach.
  g.poly(poly(b, c, up(c), up(b))).fill({ color: style.wallDark, alpha: style.alpha });
  g.poly(poly(c, d, up(d), up(c))).fill({ color: style.wallLight, alpha: style.alpha });
  g.poly(poly(up(a), up(b), up(c), up(d))).fill({ color: style.roof, alpha: style.alpha });
  g.poly(poly(up(a), up(b), up(c), up(d))).stroke({ width: 1, color: 0x000000, alpha: 0.35 * style.alpha });

  // Wjazd od tyłu (NE/NW): ściana jest zasłonięta – zaznaczamy otwór na krawędzi dachu.
  const back = side === Side.NE ? [up(a), up(b)] : side === Side.NW ? [up(d), up(a)] : null;
  if (back) {
    const [p, q] = back as [Point, Point];
    const roofC = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 - WALL_H };
    const at = (t: number, k: number): Point => {
      const ex = p.x + (q.x - p.x) * t;
      const ey = p.y + (q.y - p.y) * t;
      return { x: ex + (roofC.x - ex) * k, y: ey + (roofC.y - ey) * k };
    };
    g.poly(poly(at(0.28, 0), at(0.72, 0), at(0.72, 0.35), at(0.28, 0.35))).fill({ color: style.door, alpha: style.alpha });
  }

  // Brama na ścianie od strony wjazdu (jeśli ta ściana jest widoczna).
  const face = side === Side.SE ? [b, c] : side === Side.SW ? [c, d] : null;
  if (face) {
    const [p, q] = face as [Point, Point];
    const at = (t: number, h: number): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t - h });
    g.poly(poly(at(0.28, 0), at(0.72, 0), at(0.72, WALL_H * 0.75), at(0.28, WALL_H * 0.75))).fill({
      color: style.door,
      alpha: style.alpha,
    });
  }
}
