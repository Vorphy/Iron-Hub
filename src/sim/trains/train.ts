import { MAX_WAGONS, TRAIN_RESALE_RATE } from '../config';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import type { Side } from '../track/track';
import { successors } from './steps';
import { consistStats, engineDef, wagonDef } from './vehicles';

/** Odcinek drogi pociągu: element toru przejeżdżany od boku `entry` do `exit`. */
export interface Step {
  x: number;
  y: number;
  /** Bit elementu toru albo 0 – „ogonek” zajezdni (od wjazdu do środka kafelka). */
  track: number;
  /** -1 = środek zajezdni. */
  entry: Side | -1;
  exit: Side | -1;
}

export type TrainStatus = 'depot' | 'running' | 'loading';

export interface Train {
  id: number;
  name: string;
  engine: string;
  wagons: string[];
  status: TrainStatus;
  /** Zajezdnia, w której stoi (status 'depot'). */
  depotId: number | null;
  /** Zatrzymany przez gracza. */
  stopped: boolean;
  /** Rozkład: id stacji. */
  orders: number[];
  currentOrder: number;
  goToDepot: boolean;
  /** Może zawrócić w miejscu przy ruszaniu (np. po postoju na stacji). */
  mayReverse: boolean;
  /** km/h */
  speed: number;
  /** Przejechana część pierwszego odcinka `trail` (jednostki toru). */
  progress: number;
  /** Zajmowane odcinki, od czoła do końca składu. */
  trail: Step[];
  /** Skład jedzie „tyłem” (po zawróceniu lokomotywa jest na końcu). */
  reversed: boolean;
  /** Pozostały czas postoju na stacji (ticki). */
  waitTicks: number;
  /** Cena zakupu (do sprzedaży). */
  value: number;
}

export function trainById(state: GameState, id: number): Train | undefined {
  return state.trains.find((t) => t.id === id);
}

export function trainsInDepot(state: GameState, depotId: number): Train[] {
  return state.trains.filter((t) => t.status === 'depot' && t.depotId === depotId);
}

export function planBuyTrain(
  state: GameState,
  engine: string,
  wagons: readonly string[],
): { cost: number; result: CommandResult } {
  if (!engineDef(engine) || wagons.some((w) => !wagonDef(w))) return { cost: 0, result: { ok: false, reason: 'blocked' } };
  if (wagons.length > MAX_WAGONS) return { cost: 0, result: { ok: false, reason: 'tooBig' } };
  const { cost } = consistStats(engine, wagons);
  return { cost, result: cost > state.money ? { ok: false, reason: 'noMoney' } : { ok: true } };
}

export function buyTrain(
  state: GameState,
  depotId: number,
  engine: string,
  wagons: readonly string[],
  events: SimEvent[],
): CommandResult {
  if (!state.depots.some((d) => d.id === depotId)) return { ok: false, reason: 'blocked' };
  const plan = planBuyTrain(state, engine, wagons);
  if (!plan.result.ok) return plan.result;
  const id = state.nextTrainId++;
  state.trains.push({
    id,
    name: `Pociąg ${id}`,
    engine,
    wagons: [...wagons],
    status: 'depot',
    depotId,
    stopped: true,
    orders: [],
    currentOrder: 0,
    goToDepot: false,
    mayReverse: false,
    speed: 0,
    progress: 0,
    trail: [],
    reversed: false,
    waitTicks: 0,
    value: plan.cost,
  });
  state.money -= plan.cost;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

export function sellTrain(state: GameState, trainId: number, events: SimEvent[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  if (train.status !== 'depot') return { ok: false, reason: 'notInDepot' };
  state.trains = state.trains.filter((t) => t !== train);
  state.money += resaleValue(train);
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

export function resaleValue(train: Train): number {
  return Math.round(train.value * TRAIN_RESALE_RATE);
}

/** Kafelki zajęte przez pociągi na torach – tam nie wolno rozbierać torów ani stacji. */
export function occupiedTiles(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const t of state.trains) for (const s of t.trail) out.add(s.y * state.map.width + s.x);
  return out;
}

/** Wyjazd z zajezdni albo wznowienie jazdy zatrzymanego pociągu. */
export function startTrain(state: GameState, trainId: number, events: SimEvent[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  if (train.status === 'depot') {
    const depot = state.depots.find((d) => d.id === train.depotId);
    if (!depot) return { ok: false, reason: 'blocked' };
    const exit: Step = { x: depot.x, y: depot.y, track: 0, entry: -1, exit: depot.side };
    if (successors(state, exit).length === 0) return { ok: false, reason: 'depotNotConnected' };
    train.status = 'running';
    train.depotId = null;
    train.trail = [exit];
    train.progress = 0;
    train.speed = 0;
    train.reversed = false;
    train.mayReverse = false;
    events.push({ type: 'trainsChanged' });
  }
  train.stopped = false;
  return { ok: true };
}

export function stopTrain(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  train.stopped = true;
  return { ok: true };
}

/** Przełącza „jedź do zajezdni”. */
export function sendToDepot(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train || train.status === 'depot') return { ok: false, reason: 'blocked' };
  train.goToDepot = !train.goToDepot;
  return { ok: true };
}

export function setOrders(state: GameState, trainId: number, orders: readonly number[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train || orders.some((id) => !state.stations.some((s) => s.id === id))) return { ok: false, reason: 'blocked' };
  train.orders = [...orders];
  if (train.currentOrder >= train.orders.length) train.currentOrder = 0;
  return { ok: true };
}

/** Po usunięciu stacji pociągi nie mogą mieć jej w rozkładzie. */
export function dropStationFromOrders(state: GameState, stationId: number): void {
  for (const t of state.trains) {
    const i = t.orders.indexOf(stationId);
    if (i < 0) continue;
    t.orders = t.orders.filter((id) => id !== stationId);
    if (i < t.currentOrder) t.currentOrder--;
    if (t.currentOrder >= t.orders.length) t.currentOrder = 0;
  }
}
