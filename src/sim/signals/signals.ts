import { SIGNAL_COST, TRACK_REFUND_RATE } from '../config';
import { baseTrack, isUnderTrack, underTrack } from '../track/metro';
import { spend } from '../economy/finance';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { hasTrack, Track, TRACK_SIDES } from '../track/track';
import type { Step } from '../trains/train';
import { inBounds } from '../world/map';

/** auto – tryb Amator (sygnalizacja automatyczna), manual – tryb Ekspert (semafory gracza). */
export type SignalMode = 'auto' | 'manual';

/**
 * Semafor ścieżkowy na elemencie toru. `dirs` – kierunki jazdy, dla których działa:
 * 1 – jazda w stronę drugiego boku elementu (TRACK_SIDES[track][1]), 2 – w stronę pierwszego, 3 – oba.
 * Jednokierunkowy (`oneWay`) dodatkowo zabrania przejazdu pod prąd.
 */
export interface Signal {
  x: number;
  y: number;
  track: Track;
  dirs: 1 | 2 | 3;
  oneWay: boolean;
  /** Semafor w metrze (poziom −1) – na torze z `map.under`. */
  under?: boolean;
}

/** Kod elementu toru semafora – jak w odcinkach jazdy pociągu (metro: przesunięty kod). */
export function signalCode(sig: Pick<Signal, 'track' | 'under'>): number {
  return sig.under ? underTrack(sig.track) : sig.track;
}

/** Element toru, na którym może stać semafor: zwykły albo metra (nie zajezdnia, most, tunel). */
function signalable(track: number): boolean {
  return (track > 0 && track <= Track.Right) || isUnderTrack(track);
}

/** Bit kierunku dla odcinka jazdy po elemencie toru. */
export function dirBit(s: Step): 1 | 2 {
  return s.exit === TRACK_SIDES[baseTrack(s.track)][1] ? 1 : 2;
}

function key(width: number, x: number, y: number, track: number): number {
  return (y * width + x) * 64 + track;
}

/** Szybkie wyszukiwanie semaforów po elemencie toru (budowane z listy w stanie). */
export class SignalIndex {
  private readonly map = new Map<number, Signal>();

  constructor(private readonly state: GameState) {
    for (const s of state.signals) this.map.set(key(state.map.width, s.x, s.y, signalCode(s)), s);
  }

  at(x: number, y: number, track: number): Signal | undefined {
    return this.map.get(key(this.state.map.width, x, y, track));
  }

  /** Semafor stojący przed pociągiem jadącym po `s` (pociąg może przed nim stanąć). */
  facing(s: Step): Signal | undefined {
    if (!signalable(s.track)) return undefined;
    const sig = this.at(s.x, s.y, s.track);
    return sig && sig.dirs & dirBit(s) ? sig : undefined;
  }

  /** Czy jazda po `s` jest zabroniona przez semafor jednokierunkowy. */
  forbids(s: Step): boolean {
    if (!signalable(s.track)) return false;
    const sig = this.at(s.x, s.y, s.track);
    return !!sig && sig.oneWay && !(sig.dirs & dirBit(s));
  }
}

/**
 * Stan semafora po kliknięciu: nowy – kierunek 1; istniejący – kolejny kierunek
 * (ścieżkowy 1 → 2 → oba → 1, jednokierunkowy 1 ↔ 2); zmiana rodzaju zostawia kierunek.
 */
export function nextSignalState(existing: Signal | undefined, oneWay: boolean): { dirs: 1 | 2 | 3; oneWay: boolean } {
  if (!existing) return { dirs: 1, oneWay };
  if (existing.oneWay !== oneWay) return { dirs: oneWay && existing.dirs === 3 ? 1 : existing.dirs, oneWay };
  const dirs = existing.dirs === 1 ? 2 : existing.dirs === 2 && !oneWay ? 3 : 1;
  return { dirs, oneWay };
}

/** Stawia semafor albo zmienia kierunek istniejącego (patrz `nextSignalState`). */
export function placeSignal(
  state: GameState,
  x: number,
  y: number,
  track: Track,
  oneWay: boolean,
  events: SimEvent[],
  under = false,
): CommandResult {
  const { map } = state;
  if (!inBounds(map, x, y)) return { ok: false, reason: 'blocked' };
  const i = y * map.width + x;
  if (under ? !(map.under[i]! & track) || map.stationUnder[i] : !hasTrack(map, x, y, track) || map.station[i] || map.depot[i]) {
    return { ok: false, reason: 'blocked' };
  }
  const existing = state.signals.find((s) => s.x === x && s.y === y && s.track === track && !!s.under === under);
  if (existing) {
    Object.assign(existing, nextSignalState(existing, oneWay));
  } else {
    if (state.money < SIGNAL_COST) return { ok: false, reason: 'noMoney' };
    spend(state, 'construction', SIGNAL_COST);
    state.signals.push({ x, y, track, dirs: 1, oneWay, ...(under ? { under: true } : {}) });
  }
  events.push({ type: 'signalsChanged' });
  return { ok: true };
}

export function removeSignal(state: GameState, x: number, y: number, track: Track, events: SimEvent[], under = false): CommandResult {
  const before = state.signals.length;
  state.signals = state.signals.filter((s) => !(s.x === x && s.y === y && s.track === track && !!s.under === under));
  if (state.signals.length === before) return { ok: false, reason: 'nothingToRemove' };
  spend(state, 'construction', -Math.round(SIGNAL_COST * TRACK_REFUND_RATE));
  events.push({ type: 'signalsChanged' });
  return { ok: true };
}

/** Usuwa semafory z elementów toru, których już nie ma (po rozbiórce). */
export function dropOrphanSignals(state: GameState, events: SimEvent[]): void {
  const before = state.signals.length;
  const { map } = state;
  state.signals = state.signals.filter((s) => {
    const i = s.y * map.width + s.x;
    return s.under ? (map.under[i]! & s.track) !== 0 && !map.stationUnder[i] : hasTrack(map, s.x, s.y, s.track) && !map.station[i];
  });
  if (state.signals.length !== before) events.push({ type: 'signalsChanged' });
}
