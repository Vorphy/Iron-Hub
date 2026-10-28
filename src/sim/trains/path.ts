import {
  BEND_PENALTY,
  FULL_LOAD_PENALTY,
  OCCUPIED_PENALTY,
  PLATFORM_LONGER_PENALTY,
  PLATFORM_SHORTER_PENALTY,
  REVERSE_PENALTY,
  STATION_PASS_PENALTY,
} from '../config';
import { STRAIGHT_LENGTH } from '../track/graph';
import { trainLength } from './geometry';
import { baseTrack, isUnderTrack, levelTrackBits, stationLayer } from '../track/metro';
import type { SignalIndex } from '../signals/signals';
import type { GameState } from '../state';
import { SIDE_DELTA, Track } from '../track/track';
import { inBounds } from '../world/map';
import { isElectrified, needsCatenary } from '../track/catenary';
import { blockerOf, type Taken } from './reservation';
import { flipStep, isBend, stepKey, stepLength, successors } from './steps';
import { passesOrder, type Step, type Train } from './train';

/**
 * Co pociąg robi po przejechaniu zaplanowanych odcinków:
 * stop – zatrzymanie przy peronie, depot – wjazd do zajezdni, reverse – zawrócenie na końcu toru,
 * reverseNow – zawrócenie od razu (cel jest za pociągiem), continue – jazda dalej (brak celu).
 */
export type Terminal = 'stop' | 'depot' | 'reverse' | 'reverseNow' | 'continue';

export interface Plan {
  /** Odcinki przed czołem pociągu (bez bieżącego). */
  steps: Step[];
  terminal: Terminal;
  /** Cel istnieje, ale nie da się do niego dojechać. */
  lost: boolean;
}

/** `pass` – cel tylko do przejechania (bez zatrzymania, punkt kontrolny): trasa prowadzi przez niego dalej. */
export type Goal = { kind: 'station'; stationId: number; pass: boolean } | { kind: 'depot' } | null;

/**
 * Dokąd liczyć trasę (wynika wyłącznie ze stanu gry). Pozycje „tylko przejazd”, przez które
 * rezerwacja już prowadzi, są pomijane – trasa liczy się od nich do następnej pozycji rozkładu.
 */
export function trainGoal(state: GameState, train: Train): Goal {
  if (train.goToDepot) return { kind: 'depot' };
  const n = train.orders.length;
  for (let k = 0; k < n; k++) {
    const index = (train.currentOrder + k) % n;
    const stationId = train.orders[index]!;
    if (!passesOrder(state, train, index)) return { kind: 'station', stationId, pass: false };
    if (!train.reservedAhead.some((s) => isPlatformEnd(state, s, stationId))) return { kind: 'station', stationId, pass: true };
  }
  return null;
}

/** Czy odcinek kończy się na końcu peronu danej stacji (tam pociąg się zatrzymuje). */
export function isPlatformEnd(state: GameState, s: Step, stationId: number): boolean {
  const { map } = state;
  const base = baseTrack(s.track);
  if (base !== Track.X && base !== Track.Y) return false;
  // Peron na poziomie odcinka: w metrze stacje i tory metra, na powierzchni – zwykłe.
  const stations = stationLayer(map, s.track);
  if (stations[s.y * map.width + s.x] !== stationId) return false;
  if (s.exit === -1) return false;
  const [dx, dy] = SIDE_DELTA[s.exit];
  const nx = s.x + dx;
  const ny = s.y + dy;
  if (!inBounds(map, nx, ny) || stations[ny * map.width + nx] !== stationId) return true;
  return levelTrackBits(map, nx, ny, s.track) !== base;
}

function goalTest(state: GameState, goal: NonNullable<Goal>): (s: Step) => boolean {
  if (goal.kind === 'depot') return (s) => s.track === 0 && s.exit === -1;
  return (s) => isPlatformEnd(state, s, goal.stationId);
}

const WANDER_LOOKAHEAD = 12;
/** Ogranicza przeszukiwanie na bardzo dużych sieciach. */
const MAX_EXPANSIONS = 50_000;

interface Node {
  step: Step;
  cost: number;
  parent: Node | null;
  /** Do tego odcinka dojechano przez zawrócenie na końcu poprzedniego. */
  viaReverse: boolean;
  /** Start „od tyłu” – pociąg zawraca w miejscu. */
  reversedStart: boolean;
  seq: number;
}

export interface RouteContext {
  /** Odcinek, od którego liczymy trasę – koniec obecnej rezerwacji albo czoło. */
  from: Step;
  /** Pociąg stoi i nie ma rezerwacji – może zawrócić w miejscu. */
  allowReverseStart: boolean;
  taken: Taken;
  signals: SignalIndex;
}

/**
 * Trasa do celu (Dijkstra po skierowanych odcinkach toru). Tory zajęte przez inne pociągi
 * kosztują więcej, więc pociąg wybiera wolny peron, jeśli jest. Wynik zależy tylko od stanu gry
 * (determinizm).
 */
export function planRoute(state: GameState, train: Train, ctx: RouteContext): Plan {
  const head = ctx.from;
  const goal = trainGoal(state, train);
  const manual = state.signalMode === 'manual';
  // Lokomotywa elektryczna nie wjedzie tam, gdzie nie ma sieci trakcyjnej.
  const electric = needsCatenary(train.engine);
  const next = (s: Step) => {
    let out = successors(state, s);
    if (manual) out = out.filter((n) => !ctx.signals.forbids(n));
    // Metro ma zasilanie z trzeciej szyny – pod ziemią jeździ każda lokomotywa elektryczna.
    if (electric) out = out.filter((n) => isUnderTrack(n.track) || isElectrified(state.map, n.x, n.y));
    return out;
  };
  if (!goal) return wander(head, next);

  const isGoal = goalTest(state, goal);
  const fullLoaders = fullLoadingTrains(state);
  const stationCost = stationPenalty(state, train, head, goal);
  const W = state.map.width;
  const heap = new MinHeap();
  const best = new Map<number, number>();
  let seq = 0;
  const push = (n: Omit<Node, 'seq'>) => {
    const key = stepKey(n.step, W);
    const prev = best.get(key);
    if (prev !== undefined && prev <= n.cost) return;
    best.set(key, n.cost);
    heap.push({ ...n, seq: seq++ });
  };

  push({ step: head, cost: 0, parent: null, viaReverse: false, reversedStart: false });
  if (ctx.allowReverseStart) {
    const tail = train.trail[train.trail.length - 1]!;
    push({ step: flipStep(tail), cost: REVERSE_PENALTY, parent: null, viaReverse: false, reversedStart: true });
  }

  let expansions = 0;
  while (heap.size > 0 && expansions++ < MAX_EXPANSIONS) {
    const node = heap.pop()!;
    if (best.get(stepKey(node.step, W))! < node.cost) continue;
    if (isGoal(node.step)) return toPlan(node, goal);
    const nexts = next(node.step);
    for (const s of nexts) {
      const cost =
        node.cost +
        stepLength(s) +
        (isBend(node.step, s) ? BEND_PENALTY : 0) +
        occupancyPenalty(state, ctx.taken, s, train.id, fullLoaders) +
        stationCost(s, isGoal(s));
      push({ step: s, cost, parent: node, viaReverse: false, reversedStart: node.reversedStart });
    }
    if (nexts.length === 0) {
      // Koniec toru: zawracamy (kara, żeby wybierać jazdę naprzód, gdy się da).
      const back = flipStep(node.step);
      push({ step: back, cost: node.cost + REVERSE_PENALTY, parent: node, viaReverse: true, reversedStart: node.reversedStart });
    }
  }
  return { ...wander(head, next), lost: true };
}

/**
 * Kary stacyjne jak w YAPF (OpenTTD): przejazd przez peron cudzej stacji (za kafelek) – bez stacji celu,
 * stacji, na której pociąg właśnie stoi, i punktów kontrolnych; u celu – peron za krótki albo za długi
 * względem składu (długi pociąg bierze długi peron).
 */
function stationPenalty(
  state: GameState,
  train: Train,
  head: Step,
  goal: NonNullable<Goal>,
): (s: Step, atGoal: boolean) => number {
  const { map } = state;
  const W = map.width;
  const goalId = goal.kind === 'station' ? goal.stationId : 0;
  const here = stationLayer(map, head.track)[head.y * W + head.x] ?? 0;
  const waypoints = new Set(state.stations.filter((st) => st.waypoint).map((st) => st.id));
  const trainTiles = Math.ceil(trainLength(train) / STRAIGHT_LENGTH);
  return (s, atGoal) => {
    if (s.track === 0) return 0;
    const id = stationLayer(map, s.track)[s.y * W + s.x]!;
    if (!id) return 0;
    if (atGoal && goal.kind === 'station' && !goal.pass) {
      const missing = trainTiles - platformLength(state, s, id);
      return missing > 0 ? PLATFORM_SHORTER_PENALTY : missing < 0 ? PLATFORM_LONGER_PENALTY : 0;
    }
    if (id === goalId || id === here || waypoints.has(id)) return 0;
    return STATION_PASS_PENALTY;
  };
}

/** Długość peronu (kafelki), na którego końcu kończy się odcinek `s` – liczona wstecz od końca. */
export function platformLength(state: GameState, s: Step, stationId: number): number {
  const { map } = state;
  const stations = stationLayer(map, s.track);
  const base = baseTrack(s.track);
  if (s.entry === -1) return 1;
  const [dx, dy] = SIDE_DELTA[s.entry];
  let n = 1;
  let x = s.x + dx;
  let y = s.y + dy;
  while (inBounds(map, x, y) && stations[y * map.width + x] === stationId && levelTrackBits(map, x, y, s.track) === base) {
    n++;
    x += dx;
    y += dy;
  }
  return n;
}

/** Pociągi stojące na stacji z ptaszkiem „pełny ładunek” przy bieżącej pozycji rozkładu. */
export function fullLoadingTrains(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const t of state.trains) if (t.status === 'loading' && t.fullLoad[t.currentOrder]) out.add(t.id);
  return out;
}

/** Kara za odcinek zajęty przez inny pociąg; za czekającym na pełny ładunek – bardzo duża. */
export function occupancyPenalty(state: GameState, taken: Taken, s: Step, trainId: number, fullLoaders: Set<number>): number {
  const blocker = blockerOf(state, taken, s, trainId);
  if (blocker === null) return 0;
  return OCCUPIED_PENALTY + (fullLoaders.has(blocker) ? FULL_LOAD_PENALTY : 0);
}

function toPlan(goalNode: Node, goal: NonNullable<Goal>): Plan {
  const chain: Node[] = [];
  for (let n: Node | null = goalNode; n; n = n.parent) chain.push(n);
  chain.reverse();
  if (chain[0]!.reversedStart) return { steps: [], terminal: 'reverseNow', lost: false };
  // chain[0] to bieżący odcinek czoła; jedziemy do pierwszego zawrócenia albo do celu.
  const steps: Step[] = [];
  for (let i = 1; i < chain.length; i++) {
    if (chain[i]!.viaReverse) return { steps, terminal: 'reverse', lost: false };
    steps.push(chain[i]!.step);
  }
  if (goal.kind === 'station' && goal.pass) return { steps, terminal: 'continue', lost: false };
  return { steps, terminal: goal.kind === 'depot' ? 'depot' : 'stop', lost: false };
}

/** Bez celu: jedziemy przed siebie (najchętniej bez łuków), na końcu toru zawracamy. */
function wander(head: Step, successorsOf: (s: Step) => Step[]): Plan {
  const steps: Step[] = [];
  let cur = head;
  for (let i = 0; i < WANDER_LOOKAHEAD; i++) {
    const next = successorsOf(cur).filter((s) => s.track !== 0);
    if (next.length === 0) return { steps, terminal: 'reverse', lost: false };
    cur = next.find((s) => !isBend(cur, s)) ?? next[0]!;
    steps.push(cur);
  }
  return { steps, terminal: 'continue', lost: false };
}

/** Kopiec binarny po (koszt, kolejność dodania) – stabilny, więc deterministyczny. */
class MinHeap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(n: Node): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }

  pop(): Node | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

function less(a: Node, b: Node): boolean {
  return a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq);
}
