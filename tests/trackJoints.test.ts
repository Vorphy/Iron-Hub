import { describe, expect, it } from 'vitest';
import { jointClipped, jointMiter, SIDE_MID, startMiter } from '../src/render/trackDraw';
import { oppositeSide, type Side, SIDE_DELTA, Track, TRACK_SIDES } from '../src/sim/track/track';
import { generateMap } from '../src/sim/world/map';

/** Lewa normalna elementu w jego własnym kierunku (TRACK_SIDES) – jak w drawTrackSegment. */
function normal(track: Track): [number, number] {
  const [a, b] = TRACK_SIDES[track];
  const dx = SIDE_MID[b][0] - SIDE_MID[a][0];
  const dy = SIDE_MID[b][1] - SIDE_MID[a][1];
  const len = Math.hypot(dx, dy);
  return [-dy / len, dx / len];
}

function emptyMap() {
  const map = generateMap(8, 8, 1);
  map.track.fill(0);
  map.bridge.fill(0);
  map.tunnel.fill(0);
  return map;
}

/** Punkty szyn (k = ±1) na styku – w układzie logicznym mapy. */
function railPoints(miter: readonly [number, number], x: number, y: number, side: Side): string[] {
  const [mx, my] = SIDE_MID[side];
  return [1, -1].map((k) => `${(x + mx + miter[0] * k).toFixed(6)},${(y + my + miter[1] * k).toFixed(6)}`).sort();
}

describe('jointMiter', () => {
  it('prosta i łuk spotykają się w tych samych punktach, szerokość toru bez zmian', () => {
    const map = emptyMap();
    // X na (2,2) i łuk Upper na (3,2) – styk na boku SE kafelka (2,2).
    map.track[2 * 8 + 2] = Track.X;
    map.track[2 * 8 + 3] = Track.Upper;
    const side = TRACK_SIDES[Track.X][1];
    const [dx, dy] = SIDE_DELTA[side];
    const a = jointMiter(map, 2, 2, Track.X, side)!;
    const b = jointMiter(map, 2 + dx, 2 + dy, Track.Upper, oppositeSide(side))!;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(railPoints(a, 2, 2, side)).toEqual(railPoints(b, 2 + dx, 2 + dy, oppositeSide(side)));
    const [nx, ny] = normal(Track.X);
    expect(a[0] * nx + a[1] * ny).toBeCloseTo(1);
    const [ux, uy] = normal(Track.Upper);
    expect(b[0] * ux + b[1] * uy).toBeCloseTo(1);
  });

  it('prosta w prostą i rozjazd – koniec prostopadły, przy rozjeździe przycięty do kafelka', () => {
    const map = emptyMap();
    map.track[2 * 8 + 2] = Track.X;
    map.track[2 * 8 + 3] = Track.X;
    const se = TRACK_SIDES[Track.X][1];
    expect(jointMiter(map, 2, 2, Track.X, se)).toBeNull();
    expect(jointClipped(map, 2, 2, se)).toBe(false);
    map.track[2 * 8 + 3] = Track.X | Track.Upper;
    expect(jointMiter(map, 2, 2, Track.X, se)).toBeNull();
    // Po obu stronach styku z rozjazdem – symetrycznie.
    expect(jointClipped(map, 2, 2, se)).toBe(true);
    expect(jointClipped(map, 3, 2, oppositeSide(se))).toBe(true);
  });

  it('rampa rysowana od boku (most, tunel) – przekrój względem kierunku odcinka', () => {
    const map = emptyMap();
    map.track[2 * 8 + 2] = Track.X;
    map.track[2 * 8 + 3] = Track.Upper;
    const [a, b] = TRACK_SIDES[Track.X];
    // Odcinek od boku b do a – normalna odwrotna niż w TRACK_SIDES.
    const m = startMiter(map, 2, 2, Track.X, b)!;
    const dx = SIDE_MID[a][0] - SIDE_MID[b][0];
    const dy = SIDE_MID[a][1] - SIDE_MID[b][1];
    const len = Math.hypot(dx, dy);
    expect(m[0] * (-dy / len) + m[1] * (dx / len)).toBeCloseTo(1);
    expect(railPoints(m, 2, 2, b)).toEqual(railPoints(jointMiter(map, 2, 2, Track.X, b)!, 2, 2, b));
  });
});
