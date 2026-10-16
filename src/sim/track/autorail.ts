import { Track, type TrackPiece } from './track';

/** Kąt, poniżej którego przeciągnięcie traktujemy jako prostą wzdłuż osi, a nie ukos. */
const AXIS_RATIO = 0.5;

/**
 * Wyznacza elementy toru dla przeciągnięcia myszą (jak „autorail” w TTD).
 * Współrzędne to ułamkowe pozycje kafelków (punkt w świecie w układzie logicznym).
 */
export function planTrackLine(sx: number, sy: number, ex: number, ey: number): TrackPiece[] {
  const tx = Math.floor(sx);
  const ty = Math.floor(sy);
  const etx = Math.floor(ex);
  const ety = Math.floor(ey);
  if (tx === etx && ty === ety) return [{ x: tx, y: ty, track: pieceAt(sx - tx, sy - ty) }];

  const dx = ex - sx;
  const dy = ey - sy;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (ay <= ax * AXIS_RATIO) return straight(tx, ty, etx - tx, 0, Track.X);
  if (ax <= ay * AXIS_RATIO) return straight(tx, ty, 0, ety - ty, Track.Y);

  if (Math.sign(dx) !== Math.sign(dy)) {
    // Ukos poziomy na ekranie: u = x - y rośnie w prawo.
    const du = dx - dy;
    const first = sx - tx + (sy - ty) < 1 ? Track.Upper : Track.Lower;
    return diagonal(tx, ty, first, Math.floor(Math.abs(du)) + 1, du > 0 ? stepRight : stepLeft);
  }
  // Ukos pionowy na ekranie: v = x + y rośnie w dół.
  const dv = dx + dy;
  const first = sx - tx - (sy - ty) > 0 ? Track.Right : Track.Left;
  return diagonal(tx, ty, first, Math.floor(Math.abs(dv)) + 1, dv > 0 ? stepDown : stepUp);
}

/** Element toru wskazany pozycją kursora wewnątrz kafelka (fx, fy w [0, 1)). */
export function pieceAt(fx: number, fy: number): Track {
  const s = fx + fy;
  const d = fx - fy;
  if (s < 0.5) return Track.Upper;
  if (s > 1.5) return Track.Lower;
  if (d > 0.5) return Track.Right;
  if (d < -0.5) return Track.Left;
  return Math.abs(fy - 0.5) < Math.abs(fx - 0.5) ? Track.X : Track.Y;
}

function straight(x: number, y: number, dx: number, dy: number, track: Track): TrackPiece[] {
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const out: TrackPiece[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: x + sx * i, y: y + sy * i, track });
  return out;
}

type Step = (p: TrackPiece) => TrackPiece;

// Kolejne elementy toru ukośnego – łuki naprzemiennie w sąsiednich kafelkach.
const stepRight: Step = (p) =>
  p.track === Track.Lower ? { x: p.x + 1, y: p.y, track: Track.Upper } : { x: p.x, y: p.y - 1, track: Track.Lower };
const stepLeft: Step = (p) =>
  p.track === Track.Lower ? { x: p.x, y: p.y + 1, track: Track.Upper } : { x: p.x - 1, y: p.y, track: Track.Lower };
const stepDown: Step = (p) =>
  p.track === Track.Right ? { x: p.x + 1, y: p.y, track: Track.Left } : { x: p.x, y: p.y + 1, track: Track.Right };
const stepUp: Step = (p) =>
  p.track === Track.Right ? { x: p.x, y: p.y - 1, track: Track.Left } : { x: p.x - 1, y: p.y, track: Track.Right };

function diagonal(x: number, y: number, first: Track, count: number, step: Step): TrackPiece[] {
  const out: TrackPiece[] = [{ x, y, track: first }];
  while (out.length < count) out.push(step(out[out.length - 1]!));
  return out;
}
