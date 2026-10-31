import type { Depot } from '../depot/depot';
import { SignalIndex } from '../signals/signals';
import type { Station } from '../station/station';
import type { GameState } from '../state';
import { TICKS_PER_DAY } from '../time';
import { stationLayer, underTrack } from '../track/metro';
import { TRACK_SIDES, Track } from '../track/track';
import { stepKey, stepLength, successors } from './steps';
import { sharedTrains, type Step, type Train } from './train';

/**
 * Równe odstępy na linii (pociągi ze wspólnym rozkładem) – jak „unbunching” w OpenTTD
 * (vehicle.cpp: LeaveUnbunchingDepot, IsWaitingForUnbunching, pomiar w VehicleEnterDepot).
 *
 * Punktem wyrównania jest zajezdnia linii (ta, w której kupiono pociągi). Gracz nie dopisuje jej do
 * rozkładu: raz na okrążenie pociąg zjeżdża do niej na tym odcinku rozkładu, na którym objazd po torach
 * jest najkrótszy (stacja → zajezdnia → następna stacja), i czeka tam na swój termin. W zajezdni czekający pociąg nikogo nie blokuje (zajezdnia mieści każdą
 * liczbę pociągów), więc czekanie nie zatyka linii.
 *
 * – Okrążenie: od wyjazdu z zajezdni do ponownego wjazdu (czekanie w zajezdni się nie liczy, korki po
 *   drodze tak). Nowy pomiar najwyżej 2× dłuższy i najkrócej 2× krótszy od poprzedniego – jeden zator
 *   nie rozregulowuje linii.
 * – Odstęp = średnie okrążenie / liczba jeżdżących pociągów linii.
 * – Gdy pociąg wyjeżdża z zajezdni, każdy pociąg linii może z niej wyjechać najwcześniej po odstępie.
 *
 * Przeciążenie (dodatek): pociągi linii tracą w korkach za sobą nawzajem ponad 10% okrążenia. Bez
 * korków te same pociągi przewiozłoby ok. N·(okrążenie − korki) / okrążenie pociągów – tyle linia mieści.
 */

/** Udział korków (za pociągami tej samej linii) w okrążeniu, od którego linia jest przeciążona. */
export const CONGESTION_SHARE = 0.1;

export interface LineTiming {
  /** Zajezdnia linii (punkt wyrównania) i stacja, po której pociągi do niej zjeżdżają. */
  depotId: number;
  afterOrder: number;
  /** Średnie okrążenie (ticki); 0 – jeszcze nikt go nie zmierzył. */
  cycle: number;
  /** Odstęp między wyjazdami z zajezdni (ticki); 0 – jeszcze nieznany. */
  headway: number;
  /** Jeżdżące pociągi linii. */
  trains: number;
  /** Średni czas okrążenia stracony w korkach za pociągami tej samej linii (ticki). */
  congestion: number;
  overloaded: boolean;
  /** Ile pociągów linia mieści bez korkowania się (przy przeciążeniu). */
  maxTrains: number;
}

/** Pociągi linii, które jeżdżą (bez zatrzymanych przez gracza – jak w OpenTTD). */
export function runningLineTrains(state: GameState, train: Train): Train[] {
  return sharedTrains(state, train).filter((t) => !t.stopped);
}

/** Zajezdnia linii: ta, w której kupiono najwięcej jej pociągów (przy remisie – o niższym numerze). */
export function lineDepot(state: GameState, train: Train): Depot | undefined {
  const count = new Map<number, number>();
  for (const t of sharedTrains(state, train)) {
    if (t.homeDepot !== null) count.set(t.homeDepot, (count.get(t.homeDepot) ?? 0) + 1);
  }
  let best: Depot | undefined;
  let bestN = 0;
  for (const d of state.depots) {
    const n = count.get(d.id) ?? 0;
    if (n > bestN || (n === bestN && n > 0 && best && d.id < best.id)) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

/** Odcinki jazdy po peronach stacji (oba kierunki, oba poziomy) – start wyszukiwania trasy. */
function platformSteps(state: GameState, station: Station): Step[] {
  const { map } = state;
  const out: Step[] = [];
  const add = (tiles: readonly number[], under: boolean) => {
    for (const i of tiles) {
      const bits = under ? map.under[i]! : map.track[i]!;
      const base = bits & Track.X ? Track.X : bits & Track.Y ? Track.Y : 0;
      if (!base) continue;
      const [a, b] = TRACK_SIDES[base];
      const track = under ? underTrack(base) : base;
      const x = i % map.width;
      const y = (i - x) / map.width;
      out.push({ x, y, track, entry: a, exit: b }, { x, y, track, entry: b, exit: a });
    }
  };
  add(station.tiles, false);
  add(station.underTiles ?? [], true);
  return out;
}

/** Długość najkrótszej trasy po torach (Dijkstra; w trybie Ekspert z semaforami jednokierunkowymi). */
function routeLength(state: GameState, from: readonly Step[], isGoal: (s: Step) => boolean): number {
  const W = state.map.width;
  const signals = state.signalMode === 'manual' ? new SignalIndex(state) : null;
  const dist = new Map<number, number>();
  const heap: [number, Step][] = [];
  const push = (d: number, s: Step) => {
    const k = stepKey(s, W);
    if ((dist.get(k) ?? Infinity) <= d) return;
    dist.set(k, d);
    heap.push([d, s]);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  for (const s of from) push(0, s);
  for (let expansions = 0; heap.length && expansions < 200_000; expansions++) {
    const [d, s] = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (l + 1 < heap.length && heap[l + 1]![0] < heap[m]![0]) m = l + 1;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    if ((dist.get(stepKey(s, W)) ?? Infinity) < d) continue;
    if (d > 0 && isGoal(s)) return d;
    for (const n of successors(state, s)) if (!signals?.forbids(n)) push(d + stepLength(n), n);
  }
  return Infinity;
}

const afterOrderCache = new WeakMap<GameState, Map<string, { order: number; tick: number }>>();
/** Co ile odświeżać wybór odcinka (tory mogły się zmienić) – raz na miesiąc gry. */
const AFTER_ORDER_REFRESH = 30 * TICKS_PER_DAY;

/**
 * Pozycja rozkładu, po której pociąg zjeżdża do zajezdni: odcinek (ta stacja → następna) z najkrótszym
 * objazdem przez zajezdnię po torach. -1 – zajezdnia nieosiągalna.
 */
export function unbunchAfterOrder(state: GameState, train: Train, depot: Depot): number {
  let cache = afterOrderCache.get(state);
  if (!cache) afterOrderCache.set(state, (cache = new Map()));
  const key = `${depot.id}|${train.orders.join(',')}`;
  const hit = cache.get(key);
  if (hit && state.tick - hit.tick < AFTER_ORDER_REFRESH && hit.tick <= state.tick) return hit.order;
  const { map } = state;
  const W = map.width;
  const station = (id: number) => state.stations.find((s) => s.id === id);
  const atStation = (id: number) => (s: Step) => s.track !== 0 && stationLayer(map, s.track)[s.y * W + s.x] === id;
  const atDepot = (s: Step) => s.track === 0 && s.exit === -1 && map.depot[s.y * W + s.x] === depot.id;
  const depotExit: Step = { x: depot.x, y: depot.y, track: 0, entry: -1, exit: depot.side };
  const n = train.orders.length;
  let best = -1;
  let bestDetour = Infinity;
  for (let i = 0; i < n; i++) {
    const a = station(train.orders[i]!);
    const nextId = train.orders[(i + 1) % n]!;
    if (!a || !station(nextId)) continue;
    const from = platformSteps(state, a);
    const toDepot = routeLength(state, from, atDepot);
    if (!Number.isFinite(toDepot)) continue;
    const back = routeLength(state, [depotExit], atStation(nextId));
    const direct = routeLength(state, from, atStation(nextId));
    const detour = toDepot + back - (Number.isFinite(direct) ? direct : 0);
    if (detour < bestDetour) {
      bestDetour = detour;
      best = i;
    }
  }
  cache.set(key, { order: best, tick: state.tick });
  return best;
}

/** Czy linia pociągu ma równe odstępy (włączone, wspólny rozkład z innymi, co najmniej 2 stacje, zajezdnia). */
function lineDepotFor(state: GameState, train: Train): Depot | undefined {
  if (!train.spacing || train.shareId === null || train.orders.length < 2) return undefined;
  if (sharedTrains(state, train).length < 2) return undefined;
  return lineDepot(state, train);
}

/** Czasy linii do okna pociągu i do odstępu. null – linia bez równych odstępów. */
export function lineTiming(state: GameState, train: Train): LineTiming | null {
  const depot = lineDepotFor(state, train);
  if (!depot) return null;
  const line = runningLineTrains(state, train);
  const measured = line.filter((t) => t.roundTripTicks > 0);
  const cycle = measured.length ? measured.reduce((s, t) => s + t.roundTripTicks, 0) / measured.length : 0;
  const congestion = measured.length ? measured.reduce((s, t) => s + t.roundTripJam, 0) / measured.length : 0;
  const n = Math.max(1, line.length);
  const overloaded = cycle > 0 && congestion > cycle * CONGESTION_SHARE;
  return {
    depotId: depot.id,
    afterOrder: unbunchAfterOrder(state, train, depot),
    cycle: Math.round(cycle),
    headway: Math.round(cycle / n),
    trains: line.length,
    congestion: Math.round(congestion),
    overloaded,
    maxTrains: overloaded ? Math.max(1, Math.floor((line.length * (cycle - congestion)) / cycle)) : line.length,
  };
}

/** Odjazd z pozycji rozkładu `i`: po stacji najbliższej zajezdni linii pociąg zjeżdża do zajezdni. */
export function onOrderDeparture(state: GameState, train: Train, i: number): void {
  const depot = lineDepotFor(state, train);
  if (!depot || train.goToDepot) return;
  if (unbunchAfterOrder(state, train, depot) === i) train.unbunchDepot = depot.id;
}

/** Wjazd do zajezdni linii: pomiar okrążenia (jak w OpenTTD: wygładzony do ½–2× poprzedniego). */
export function enterUnbunchDepot(state: GameState, train: Train): void {
  train.unbunchDepot = null;
  train.holding = true;
  if (train.lastUnbunchDeparture < 0) return;
  const measured = state.tick - train.lastUnbunchDeparture;
  const rt = train.roundTripTicks;
  train.roundTripTicks = rt === 0 ? measured : Math.min(rt * 2, Math.max(Math.round(rt / 2), measured));
  train.roundTripJam = train.lapJamTicks;
  train.lapJamTicks = 0;
}

/** Pociąg w zajezdni linii czeka jeszcze na swój termin wyjazdu. */
export function waitingForUnbunching(state: GameState, train: Train): boolean {
  if (!train.holding || train.status !== 'depot') return false;
  if (!lineDepotFor(state, train)) return false;
  return train.nextUnbunchDeparture > state.tick;
}

/** Wyjazd z zajezdni linii: termin najbliższego wyjazdu dla wszystkich pociągów linii = teraz + odstęp. */
export function leaveUnbunchDepot(state: GameState, train: Train): void {
  if (!train.holding) return;
  train.holding = false;
  const tick = state.tick;
  let last = -1;
  for (const t of sharedTrains(state, train)) if (t !== train) last = Math.max(last, t.lastUnbunchDeparture);
  train.lastGap = last >= 0 ? tick - last : -1;
  train.lastUnbunchDeparture = tick;
  train.lapJamTicks = 0;
  const headway = lineTiming(state, train)?.headway ?? 0;
  const next = tick + Math.max(1, headway);
  for (const t of runningLineTrains(state, train)) t.nextUnbunchDeparture = next;
}

/** Pociąg stoi za pociągiem tej samej linii – korek liczony do przeciążenia. */
export function countJam(state: GameState, train: Train): void {
  if (!train.spacing || train.blockedBy === null || train.shareId === null) return;
  const ahead = state.trains.find((t) => t.id === train.blockedBy);
  if (ahead && ahead.shareId === train.shareId) train.lapJamTicks++;
}

/** Wyłączenie równych odstępów albo zmiana rozkładu: bez zaległego zjazdu i czekania. */
export function resetUnbunching(train: Train): void {
  train.unbunchDepot = null;
  train.nextUnbunchDeparture = 0;
}
