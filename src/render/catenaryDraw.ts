import type { Graphics } from 'pixi.js';
import { TRACK_SIDES, type Track } from '../sim/track/track';
import { tileToWorld } from './iso';
import { SIDE_MID } from './trackDraw';

const WIRE = 0x2b2b2b;
const POLE = 0x6d6f73;
/** Wysokość przewodu nad torem (px). */
const WIRE_H = 13;
/** Odsunięcie słupa od osi toru (ułamek kafelka). */
const POLE_OFFSET = 0.3;

/** Sieć trakcyjna nad elementami toru na kafelku: przewód nad osią toru, słup co drugi kafelek. */
export function drawCatenary(g: Graphics, x: number, y: number, tracks: readonly Track[]): void {
  tracks.forEach((track, k) => {
    const [sa, sb] = TRACK_SIDES[track];
    const [ax, ay] = SIDE_MID[sa];
    const [bx, by] = SIDE_MID[sb];
    const a = tileToWorld(x + ax, y + ay);
    const b = tileToWorld(x + bx, y + by);
    if (k === 0 && (x + y) % 2 === 0) {
      // Słup z boku toru i wysięgnik do przewodu.
      const len = Math.hypot(bx - ax, by - ay);
      const px = -(by - ay) / len;
      const py = (bx - ax) / len;
      const cx = x + (ax + bx) / 2;
      const cy = y + (ay + by) / 2;
      const base = tileToWorld(cx + px * POLE_OFFSET, cy + py * POLE_OFFSET);
      const mid = tileToWorld(cx, cy);
      g.moveTo(base.x, base.y)
        .lineTo(base.x, base.y - WIRE_H - 3)
        .lineTo(mid.x, mid.y - WIRE_H - 1)
        .stroke({ width: 1.5, color: POLE });
    }
    g.moveTo(a.x, a.y - WIRE_H)
      .lineTo(b.x, b.y - WIRE_H)
      .stroke({ width: 1, color: WIRE, alpha: 0.85 });
  });
}
