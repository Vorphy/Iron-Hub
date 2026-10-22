import type { Graphics } from 'pixi.js';
import { ALL_TRACKS, getTrackBits, oppositeSide, Side, SIDE_DELTA, TRACK_SIDES, type Track } from '../sim/track/track';
import { inBounds, type WorldMap } from '../sim/world/map';
import { tileToWorld, toWorld } from './iso';

export interface TrackStyle {
  ballast: number;
  sleeper: number;
  rail: number;
  alpha: number;
}

export const TRACK_STYLE: TrackStyle = { ballast: 0x8c8172, sleeper: 0x5b3f26, rail: 0xd0d2d8, alpha: 1 };

// Środki boków kafelka w układzie logicznym (ułamki kafelka).
export const SIDE_MID: Record<Side, readonly [number, number]> = {
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

const BALLAST_HALF = 0.2;
const SLEEPER_HALF = 0.16;
const RAIL_HALF = 0.085;

/**
 * Wektor przekroju na końcu odcinka (układ logiczny): punkt w odległości `k` od osi toru to
 * koniec + m·k. `null` – przekrój prostopadły do odcinka.
 */
export type Miter = readonly [number, number] | null;

/** Elementy toru dotykające boku kafelka (maska bitów). */
const SIDE_TRACKS: Record<Side, number> = { [Side.NE]: 0, [Side.SE]: 0, [Side.SW]: 0, [Side.NW]: 0 };
for (const t of ALL_TRACKS) for (const side of TRACK_SIDES[t]) SIDE_TRACKS[side] |= t;

function bitCount(v: number): number {
  let n = 0;
  for (; v; v &= v - 1) n++;
  return n;
}

/** Jednostkowy kierunek elementu od boku `from` do drugiego boku. */
function pieceDir(track: Track, from: Side): [number, number] {
  const [a, b] = TRACK_SIDES[track];
  const [fx, fy] = SIDE_MID[from];
  const [tx, ty] = SIDE_MID[from === a ? b : a];
  const len = Math.hypot(tx - fx, ty - fy);
  return [(tx - fx) / len, (ty - fy) / len];
}

/** Jedyny element toru na kafelku dotykający boku; `null`, gdy jest ich więcej albo brak. */
function soleTrackAt(map: WorldMap, x: number, y: number, side: Side): Track | null {
  if (!inBounds(map, x, y)) return null;
  const bits = getTrackBits(map, x, y) & SIDE_TRACKS[side];
  return bitCount(bits) === 1 ? (bits as Track) : null;
}

/**
 * Przekrój na styku elementu z sąsiadem za bokiem `side`: ukos (dwusieczna), żeby szyny i podsypka
 * obu elementów spotkały się w tych samych punktach. Tylko gdy po obu stronach styku jest dokładnie
 * jeden element – przy rozjazdach koniec zostaje prostopadły (jak u sąsiada). Wynik względem
 * kierunku elementu wg `TRACK_SIDES`.
 */
export function jointMiter(map: WorldMap, x: number, y: number, track: Track, side: Side): Miter {
  if (soleTrackAt(map, x, y, side) !== track) return null;
  const [dx, dy] = SIDE_DELTA[side];
  const next = soleTrackAt(map, x + dx, y + dy, oppositeSide(side));
  if (next === null) return null;
  // Jazda przez styk: do boku `side` po tym elemencie, dalej po sąsiednim.
  const [ix, iy] = pieceDir(track, side).map((v) => -v) as [number, number];
  const [ox, oy] = pieceDir(next, oppositeSide(side));
  const dot = ix * ox + iy * oy;
  if (dot > 0.999) return null; // ten sam kierunek – przekrój prostopadły wystarcza
  // Normalne (lewe) obu kierunków; m·n = 1, więc tor zachowuje szerokość.
  const [n1x, n1y] = [-iy, ix];
  const [n2x, n2y] = [-oy, ox];
  const d = 1 + n1x * n2x + n1y * n2y;
  // Dla ustalenia znaku: wynik względem normalnej elementu w jego własnym kierunku (TRACK_SIDES).
  const [a] = TRACK_SIDES[track];
  const sign = side === a ? -1 : 1;
  return [((n1x + n2x) / d) * sign, ((n1y + n2y) / d) * sign];
}

/** Jak `jointMiter`, ale dla odcinka rysowanego od boku `start` (rampa mostu, wjazd do tunelu). */
export function startMiter(map: WorldMap, x: number, y: number, track: Track, start: Side): Miter {
  const m = jointMiter(map, x, y, track, start);
  if (!m) return null;
  return start === TRACK_SIDES[track][0] ? m : [-m[0], -m[1]];
}

/**
 * Element toru liczony w układzie logicznym (odcinek między środkami boków), dopiero potem
 * rzutowany – dzięki temu szerokości i podkłady są poprawnie „spłaszczone” w izometrii.
 * Z mapą końce dopasowują się do sąsiednich elementów (patrz `jointMiter`).
 */
export function drawTrackPiece(g: Graphics, x: number, y: number, track: Track, style: TrackStyle, map?: WorldMap): void {
  const [sa, sb] = TRACK_SIDES[track];
  const [ax, ay] = SIDE_MID[sa];
  const [bx, by] = SIDE_MID[sb];
  const miters: [Miter, Miter] = map ? [jointMiter(map, x, y, track, sa), jointMiter(map, x, y, track, sb)] : [null, null];
  drawTrackSegment(g, x + ax, y + ay, x + bx, y + by, style, undefined, miters);
}

/** Odcinek toru między dwoma punktami w układzie logicznym. */
export function drawTrackSegment(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: TrackStyle,
  /** Wysokość toru wzdłuż odcinka (0–1 od początku); domyślnie – teren. */
  zAlong?: (t: number) => number,
  /** Przekroje na początku i końcu (patrz `Miter`). */
  miters: readonly [Miter, Miter] = [null, null],
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const px = -(y1 - y0) / len;
  const py = (x1 - x0) / len;

  // Rzut punktu: na terenie albo na zadanej wysokości (rampa mostu).
  const along = (lx: number, ly: number) => {
    const t = Math.abs(x1 - x0) > Math.abs(y1 - y0) ? (lx - x0) / (x1 - x0) : (ly - y0) / (y1 - y0);
    return Math.min(1, Math.max(0, t));
  };
  const p = (lx: number, ly: number) => (zAlong ? toWorld(lx, ly, zAlong(along(lx, ly))) : tileToWorld(lx, ly));
  const off = (lx: number, ly: number, k: number) => p(lx + px * k, ly + py * k);
  const [m0x, m0y] = miters[0] ?? [px, py];
  const [m1x, m1y] = miters[1] ?? [px, py];
  const start = (k: number) => p(x0 + m0x * k, y0 + m0y * k);
  const end = (k: number) => p(x1 + m1x * k, y1 + m1y * k);

  const q = [start(BALLAST_HALF), end(BALLAST_HALF), end(-BALLAST_HALF), start(-BALLAST_HALF)];
  g.poly(q.flatMap((v) => [v.x, v.y])).fill({ color: style.ballast, alpha: style.alpha });

  const sleepers = Math.max(2, Math.round(len * 4));
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
    const a = start(k);
    const b = end(k);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  g.stroke({ width: 1.5, color: style.rail, alpha: style.alpha });
}
