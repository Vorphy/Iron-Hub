import type { SignalIndex } from '../signals/signals';
import type { GameState } from '../state';
import { baseTrack, isUnderTrack } from '../track/metro';
import { Track, TRACK_SIDES } from '../track/track';
import type { Step } from './train';

/**
 * Rezerwacja torów. Każdy element toru może mieć tylko jednego właściciela – pociąg, który na nim
 * stoi (trail) albo zarezerwował go przed sobą (reservedAhead). Pociąg wjeżdża wyłącznie na tory
 * zarezerwowane, więc pociągi nie mogą się zderzyć.
 *
 * Mapa zajętości jest stanem pochodnym: budowana od nowa na początku ticku ze stanu pociągów.
 */
export type Taken = Map<number, { track: number; train: number }[]>;

/** Czy dwa elementy na tym samym kafelku przeszkadzają sobie (wspólny bok albo krzyżowanie X/Y). */
export function piecesConflict(a: number, b: number): boolean {
  // Metro: tory pod ziemią kolidują tylko ze sobą (jak zwykłe elementy), z powierzchnią nigdy.
  if (isUnderTrack(a) || isUnderTrack(b)) return isUnderTrack(a) && isUnderTrack(b) && piecesConflict(baseTrack(a), baseTrack(b));
  // Zajezdnia i pomost mostu to osobne „poziomy” – kolidują tylko z tym samym elementem.
  if (a === 0 || b === 0 || a > Track.Right || b > Track.Right) return a === b;
  if (a === b) return true;
  if ((a | b) === (Track.X | Track.Y)) return true;
  const [a0, a1] = TRACK_SIDES[a as Track];
  const sb = TRACK_SIDES[b as Track];
  return sb.includes(a0) || sb.includes(a1);
}

export function buildTaken(state: GameState): Taken {
  const taken: Taken = new Map();
  for (const t of state.trains) {
    if (t.status === 'depot') continue;
    for (const s of t.trail) addTaken(state, taken, s, t.id);
    for (const s of t.reservedAhead) addTaken(state, taken, s, t.id);
  }
  return taken;
}

export function addTaken(state: GameState, taken: Taken, s: Step, trainId: number): void {
  const i = s.y * state.map.width + s.x;
  const list = taken.get(i);
  if (list) list.push({ track: s.track, train: trainId });
  else taken.set(i, [{ track: s.track, train: trainId }]);
}

/** Wolny dla danego pociągu (jego własne rezerwacje nie przeszkadzają). */
export function isFree(state: GameState, taken: Taken, s: Step, trainId: number): boolean {
  const list = taken.get(s.y * state.map.width + s.x);
  return !list || list.every((e) => e.train === trainId || !piecesConflict(e.track, s.track));
}

/** Pociąg zajmujący lub rezerwujący element kolidujący z `s` (null – wolne). */
export function blockerOf(state: GameState, taken: Taken, s: Step, trainId: number): number | null {
  const list = taken.get(s.y * state.map.width + s.x);
  const hit = list?.find((e) => e.train !== trainId && piecesConflict(e.track, s.track));
  return hit ? hit.train : null;
}

/**
 * Czy pociąg może bezpiecznie stanąć czołem na końcu odcinka `s` (tam kończy się porcja rezerwacji).
 * Amator: każdy zwykły kafelek z jednym elementem toru (nie zwrotnica, nie skrzyżowanie).
 * Ekspert: tylko przed semaforem skierowanym w stronę jazdy.
 */
export function isSafeStop(state: GameState, s: Step, signals: SignalIndex): boolean {
  // Metro: semaforów pod ziemią (jeszcze) nie ma – postój jak w trybie Amator, na kafelku bez zwrotnicy.
  if (isUnderTrack(s.track)) {
    const bits = state.map.under[s.y * state.map.width + s.x]!;
    return (bits & (bits - 1)) === 0;
  }
  if (s.track === 0 || s.track > Track.Right) return false; // nie stajemy w zajezdni ani na moście
  if (state.signalMode === 'manual') return !!signals.facing(s);
  const bits = state.map.track[s.y * state.map.width + s.x]!;
  return (bits & (bits - 1)) === 0;
}
