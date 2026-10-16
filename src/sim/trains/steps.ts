import type { GameState } from '../state';
import { pieceLength } from '../track/graph';
import { oppositeSide, Side, SIDE_DELTA, TRACK_SIDES, tracksOn, type Track } from '../track/track';
import { inBounds } from '../world/map';
import type { Step } from './train';

/** Długość „ogonka” zajezdni: od wjazdu do środka kafelka. */
export const DEPOT_STUB_LENGTH = 8;

// Środki boków w układzie logicznym; -1 = środek kafelka (wnętrze zajezdni).
const MID: Record<number, readonly [number, number]> = {
  [-1]: [0.5, 0.5],
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

export function stepLength(s: Step): number {
  return s.track === 0 ? DEPOT_STUB_LENGTH : pieceLength(s.track as Track);
}

export function flipStep(s: Step): Step {
  return { x: s.x, y: s.y, track: s.track, entry: s.exit, exit: s.entry };
}

const TRACK_INDEX: Record<number, number> = { 0: 0, 1: 1, 2: 2, 4: 3, 8: 4, 16: 5, 32: 6 };

/** Jednoznaczny klucz skierowanego odcinka (do słowników w wyszukiwaniu trasy). */
export function stepKey(s: Step, mapWidth: number): number {
  return ((s.y * mapWidth + s.x) * 7 + TRACK_INDEX[s.track]!) * 5 + (s.entry + 1);
}

/**
 * Odcinki, w które można wjechać po przejechaniu `s` (bez zawracania).
 * Kolejność deterministyczna: elementy toru w stałej kolejności, zajezdnia na końcu.
 */
export function successors(state: GameState, s: Step): Step[] {
  if (s.exit === -1) return [];
  const { map } = state;
  const [dx, dy] = SIDE_DELTA[s.exit];
  const x = s.x + dx;
  const y = s.y + dy;
  if (!inBounds(map, x, y)) return [];
  const entry = oppositeSide(s.exit);
  const out: Step[] = [];
  for (const track of tracksOn(map.track[y * map.width + x]!)) {
    const [a, b] = TRACK_SIDES[track];
    if (a === entry) out.push({ x, y, track, entry, exit: b });
    else if (b === entry) out.push({ x, y, track, entry, exit: a });
  }
  const depotId = map.depot[y * map.width + x];
  if (depotId && state.depots.find((d) => d.id === depotId)?.side === entry) {
    out.push({ x, y, track: 0, entry, exit: -1 });
  }
  return out;
}

/** Punkt na odcinku w odległości `d` od wejścia (układ logiczny, ułamkowe kafelki). */
export function pointOnStep(s: Step, d: number): { x: number; y: number } {
  const [ex, ey] = MID[s.entry]!;
  const [xx, xy] = MID[s.exit]!;
  const t = d / stepLength(s);
  return { x: s.x + ex + (xx - ex) * t, y: s.y + ey + (xy - ey) * t };
}

/** Kierunek jazdy po odcinku jako para znaków – zmiana oznacza łuk 45°. */
export function stepDirection(s: Step): number {
  const [ex, ey] = MID[s.entry]!;
  const [xx, xy] = MID[s.exit]!;
  return (Math.sign(xx - ex) + 1) * 3 + (Math.sign(xy - ey) + 1);
}

export function isBend(a: Step, b: Step): boolean {
  return stepDirection(a) !== stepDirection(b);
}
