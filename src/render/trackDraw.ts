import type { Graphics } from 'pixi.js';
import { Side, TRACK_SIDES, type Track } from '../sim/track/track';
import { tileToWorld } from './iso';

export interface TrackStyle {
  ballast: number;
  sleeper: number;
  rail: number;
  alpha: number;
}

export const TRACK_STYLE: TrackStyle = { ballast: 0x8c8172, sleeper: 0x5b3f26, rail: 0xd0d2d8, alpha: 1 };

// Środki boków kafelka w układzie logicznym (ułamki kafelka).
const SIDE_MID: Record<Side, readonly [number, number]> = {
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

const BALLAST_HALF = 0.2;
const SLEEPER_HALF = 0.16;
const RAIL_HALF = 0.085;

/**
 * Element toru liczony w układzie logicznym (odcinek między środkami boków), dopiero potem
 * rzutowany – dzięki temu szerokości i podkłady są poprawnie „spłaszczone” w izometrii.
 */
export function drawTrackPiece(g: Graphics, x: number, y: number, track: Track, style: TrackStyle): void {
  const [sa, sb] = TRACK_SIDES[track];
  const [ax, ay] = SIDE_MID[sa];
  const [bx, by] = SIDE_MID[sb];
  const x0 = x + ax;
  const y0 = y + ay;
  const x1 = x + bx;
  const y1 = y + by;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const px = -(y1 - y0) / len;
  const py = (x1 - x0) / len;

  const p = (lx: number, ly: number) => tileToWorld(lx, ly);
  const off = (lx: number, ly: number, k: number) => p(lx + px * k, ly + py * k);

  const q = [off(x0, y0, BALLAST_HALF), off(x1, y1, BALLAST_HALF), off(x1, y1, -BALLAST_HALF), off(x0, y0, -BALLAST_HALF)];
  g.poly(q.flatMap((v) => [v.x, v.y])).fill({ color: style.ballast, alpha: style.alpha });

  const sleepers = len > 0.9 ? 4 : 3;
  for (let i = 0; i < sleepers; i++) {
    const t = (i + 0.5) / sleepers;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    const a = off(cx, cy, SLEEPER_HALF);
    const b = off(cx, cy, -SLEEPER_HALF);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  g.stroke({ width: 2, color: style.sleeper, alpha: style.alpha });

  for (const k of [RAIL_HALF, -RAIL_HALF]) {
    const a = off(x0, y0, k);
    const b = off(x1, y1, k);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  g.stroke({ width: 1.5, color: style.rail, alpha: style.alpha });
}
