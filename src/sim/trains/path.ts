import { BEND_PENALTY, OCCUPIED_PENALTY, REVERSE_PENALTY } from '../config';
import type { SignalIndex } from '../signals/signals';
import type { GameState } from '../state';
import { SIDE_DELTA, Track } from '../track/track';
import { inBounds } from '../world/map';
import { isElectrified, needsCatenary } from '../track/catenary';
import { isFree, type Taken } from './reservation';
import { flipStep, isBend, stepKey, stepLength, successors } from './steps';
import type { Step, Train } from './train';

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

export type Goal = { kind: 'station'; stationId: number } | { kind: 'depot' } | null;

/** Dokąd pociąg aktualnie jedzie (wynika wyłącznie ze stanu pociągu). */
export function trainGoal(train: Train): Goal {
  if (train.goToDepot) return { kind: 'depot' };
  const stationId = train.orders[train.currentOrder];
  return stationId === undefined ? null : { kind: 'station', stationId };
}

/** Czy odcinek kończy się na końcu peronu danej stacji (tam pociąg się zatrzymuje). */
function isPlatformEnd(state: GameState, s: Step, stationId: number): boolean {
  const { map } = state;
  if (s.track !== Track.X && s.track !== Track.Y) return false;
  if (map.station[s.y * map.width + s.x] !== stationId) return false;
  if (s.exit === -1) return false;
  const [dx, dy] = SIDE_DELTA[s.exit];
  const nx = s.x + dx;
  const ny = s.y + dy;
  return !inBounds(map, nx, ny) || map.station[ny * map.width + nx] !== stationId;
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
  const goal = trainGoal(train);
  const manual = state.signalMode === 'manual';
  // Lokomotywa elektryczna nie wjedzie tam, gdzie nie ma sieci trakcyjnej.
  const electric = needsCatenary(train.engine);
  const next = (s: Step) => {
    let out = successors(state, s);
    if (manual) out = out.filter((n) => !ctx.signals.forbids(n));
    if (electric) out = out.filter((n) => isElectrified(state.map, n.x, n.y));
    return out;
  };
  if (!goal) return wander(head, next);

  const isGoal = goalTest(state, goal);
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
        (isFree(state, ctx.taken, s, train.id) ? 0 : OCCUPIED_PENALTY);
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
