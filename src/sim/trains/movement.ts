import {
  ADHESION,
  BEND_SPEED,
  BRAKE_KMH_PER_TICK,
  CREEP_SPEED,
  PHYS_DT,
  STATION_WAIT_TICKS,
  UNITS_PER_KMH_TICK,
} from '../config';
import type { SimEvent } from '../commands';
import type { GameState } from '../state';
import { trainLength } from './geometry';
import { planRoute, type Plan } from './path';
import { flipStep, isBend, stepKey, stepLength } from './steps';
import type { Step, Train } from './train';
import { consistStats, engineDef } from './vehicles';

/**
 * Pamięć tras (stan pochodny, nie trafia do zapisu). Trasa jest liczona od nowa, gdy zmieni się
 * odcinek czoła, cel pociągu albo tory – zawsze z tych samych danych, więc gra po wczytaniu
 * zachowuje się identycznie.
 */
export class Planner {
  private cache = new Map<number, { key: string; plan: Plan }>();
  private revision = 0;

  /** Wywoływane po każdej zmianie torów/stacji/zajezdni. */
  invalidate(): void {
    this.revision++;
  }

  get(state: GameState, train: Train): Plan {
    const head = train.trail[0]!;
    const key = [
      this.revision,
      stepKey(head, state.map.width),
      train.goToDepot ? 'D' : (train.orders[train.currentOrder] ?? '-'),
      train.mayReverse ? stepKey(train.trail[train.trail.length - 1]!, state.map.width) : '',
    ].join(':');
    const hit = this.cache.get(train.id);
    if (hit?.key === key) return hit.plan;
    const plan = planRoute(state, train);
    this.cache.set(train.id, { key, plan });
    return plan;
  }

  /** Czy pociąg nie może dojechać do celu (do wyświetlenia w UI). */
  isLost(trainId: number): boolean {
    return this.cache.get(trainId)?.plan.lost ?? false;
  }
}

export function tickTrains(state: GameState, planner: Planner, events: SimEvent[]): void {
  for (const train of state.trains) {
    if (train.status === 'depot') continue;
    if (train.status === 'loading') {
      if (--train.waitTicks <= 0) departStation(train);
      continue;
    }
    moveTrain(state, planner, train, events);
  }
}

function departStation(train: Train): void {
  train.status = 'running';
  if (train.orders.length) train.currentOrder = (train.currentOrder + 1) % train.orders.length;
  train.mayReverse = true;
}

/** Przyspieszenie (km/h na tick) z mocy, przyczepności i oporów. */
function acceleration(train: Train): number {
  const e = engineDef(train.engine)!;
  const { weight } = consistStats(train.engine, train.wagons);
  const mass = weight * 1000;
  const v = train.speed / 3.6;
  const force = Math.min((e.power * 1000) / Math.max(v, 1.5), ADHESION * e.weight * 1000 * 9.81);
  const resist = mass * 9.81 * (0.002 + 0.00002 * train.speed);
  return ((force - resist) / mass) * 3.6 * PHYS_DT;
}

/** Największa prędkość, z której zdążymy wyhamować do `limit` na drodze `d`. */
function brakingCap(d: number, limit: number): number {
  return Math.sqrt(limit * limit + (2 * BRAKE_KMH_PER_TICK * Math.max(0, d)) / UNITS_PER_KMH_TICK);
}

function moveTrain(state: GameState, planner: Planner, train: Train, events: SimEvent[]): void {
  let plan = planner.get(state, train);

  if (plan.terminal === 'reverseNow') {
    reverseTrain(train);
    train.mayReverse = false;
    plan = planner.get(state, train);
  }

  const maxSpeed = engineDef(train.engine)!.maxSpeed;
  const head = train.trail[0]!;
  const hasStop = plan.terminal !== 'continue';
  // Droga do punktu zatrzymania i ograniczenia na łukach przed nami.
  let dist = stepLength(head) - train.progress;
  let target = train.stopped ? 0 : maxSpeed;
  let prev = head;
  const lookahead = (maxSpeed * maxSpeed * UNITS_PER_KMH_TICK) / (2 * BRAKE_KMH_PER_TICK) + 32;
  for (const s of plan.steps) {
    if (isBend(prev, s)) target = Math.min(target, brakingCap(dist, BEND_SPEED));
    if (dist > lookahead) break;
    dist += stepLength(s);
    prev = s;
  }
  const distToStop = hasStop ? stepLength(head) - train.progress + plan.steps.reduce((d, s) => d + stepLength(s), 0) : Infinity;
  if (hasStop) target = Math.min(target, brakingCap(distToStop, 0));

  if (train.speed < target) train.speed = Math.min(target, train.speed + acceleration(train));
  else train.speed = Math.max(target, train.speed - BRAKE_KMH_PER_TICK);
  // Dojazd do celu: ostatnie metry „pełzając”, żeby nie zatrzymać się tuż przed nim.
  if (!train.stopped && hasStop && train.speed < CREEP_SPEED && distToStop > 0) train.speed = CREEP_SPEED;
  if (train.speed > 0) train.mayReverse = false;

  const move = train.speed * UNITS_PER_KMH_TICK;
  if (move >= distToStop) {
    advance(train, plan.steps, distToStop);
    arrive(state, train, plan, events);
    return;
  }
  advance(train, plan.steps, move);
}

/**
 * Przesuwa czoło o `move`, wchodząc w kolejne odcinki planu policzonego na początku ticku
 * (w następnym ticku plan liczy się od nowa z nowego czoła).
 */
function advance(train: Train, steps: readonly Step[], move: number): void {
  let remaining = move;
  let i = 0;
  for (;;) {
    const head = train.trail[0]!;
    const room = stepLength(head) - train.progress;
    if (remaining < room) {
      train.progress += remaining;
      break;
    }
    remaining -= room;
    train.progress = stepLength(head);
    const next = steps[i++];
    if (!next) break;
    train.trail.unshift(next);
    train.progress = 0;
  }
  trimTrail(train);
}

function arrive(state: GameState, train: Train, plan: Plan, events: SimEvent[]): void {
  train.speed = 0;
  switch (plan.terminal) {
    case 'stop':
      train.status = 'loading';
      train.waitTicks = STATION_WAIT_TICKS;
      break;
    case 'depot': {
      const head = train.trail[0]!;
      train.status = 'depot';
      train.depotId = state.map.depot[head.y * state.map.width + head.x] || null;
      train.trail = [];
      train.progress = 0;
      train.stopped = true;
      train.goToDepot = false;
      train.reversed = false;
      events.push({ type: 'trainsChanged' });
      break;
    }
    default:
      reverseTrain(train);
  }
}

/** Usuwa z końca odcinki, których skład już nie zajmuje. */
function trimTrail(train: Train): void {
  const length = trainLength(train);
  let covered = train.progress;
  for (let k = 1; k < train.trail.length; k++) {
    if (covered >= length) {
      train.trail.length = k;
      return;
    }
    covered += stepLength(train.trail[k]!);
  }
}

/** Zawrócenie: koniec składu staje się czołem, kierunek jazdy odwrotny. */
export function reverseTrain(train: Train): void {
  const length = trainLength(train);
  // Odległość od czoła do wejścia w odcinek k.
  let d = train.progress;
  let k = 0;
  while (d < length && k + 1 < train.trail.length) {
    k++;
    d += stepLength(train.trail[k]!);
  }
  const tailStep = train.trail[k]!;
  // Ogon leży (d - length) od wejścia w odcinek k; po odwróceniu liczymy od drugiej strony.
  const fromEntry = Math.max(0, d - length);
  train.trail = train.trail
    .slice(0, k + 1)
    .reverse()
    .map(flipStep);
  train.progress = stepLength(tailStep) - fromEntry;
  train.reversed = !train.reversed;
  train.speed = 0;
}
