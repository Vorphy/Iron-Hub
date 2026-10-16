import { MAX_WAGONS, TRAIN_RESALE_RATE } from '../config';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import type { Side } from '../track/track';
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
