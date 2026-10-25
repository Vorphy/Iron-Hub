import type { CommandResult, SimEvent } from '../commands';
import { engineOnSale } from '../research';
import { MAX_ENGINES, MAX_WAGONS, TRAIN_RESALE_RATE } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { engineTradeIn, oneEngineTradeIn, trainById, unshare } from './train';
import { engineDef, wagonDef } from './vehicles';

/**
 * Zmiany składu w zajezdni (jak w OpenTTD): wagony odpięte albo kupione luzem czekają w magazynie
 * zajezdni i można je doczepić do dowolnego pociągu stojącego w tej zajezdni.
 */

/** Zwrot za wagon (wagony nie tracą na wartości z wiekiem). */
export function wagonResale(type: string): number {
  return Math.round(wagonDef(type)!.cost * TRAIN_RESALE_RATE);
}

function depotById(state: GameState, depotId: number) {
  return state.depots.find((d) => d.id === depotId);
}

/** Pociąg stojący w zajezdni (tylko tam zmienia się skład). */
function trainInDepot(state: GameState, trainId: number) {
  const train = trainById(state, trainId);
  if (train?.status !== 'depot') return null;
  const depot = depotById(state, train.depotId ?? -1);
  return depot ? { train, depot } : null;
}

export function buyWagon(state: GameState, depotId: number, type: string, events: SimEvent[]): CommandResult {
  const depot = depotById(state, depotId);
  const def = wagonDef(type);
  if (!depot || !def) return { ok: false, reason: 'blocked' };
  if (def.cost > state.money) return { ok: false, reason: 'noMoney' };
  depot.wagons.push({ type, load: { amount: 0, source: 0, loadedTick: 0 } });
  spend(state, 'construction', def.cost);
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

export function sellSpareWagon(state: GameState, depotId: number, index: number, events: SimEvent[]): CommandResult {
  const depot = depotById(state, depotId);
  const spare = depot?.wagons[index];
  if (!depot || !spare) return { ok: false, reason: 'blocked' };
  depot.wagons.splice(index, 1);
  spend(state, 'construction', -wagonResale(spare.type));
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/** Doczepia wagon z magazynu zajezdni na koniec pociągu (razem z ładunkiem). */
export function attachWagon(state: GameState, trainId: number, index: number, events: SimEvent[]): CommandResult {
  const found = trainInDepot(state, trainId);
  if (!found) return { ok: false, reason: 'notInDepot' };
  const { train, depot } = found;
  const spare = depot.wagons[index];
  if (!spare) return { ok: false, reason: 'blocked' };
  if (train.wagons.length >= MAX_WAGONS) return { ok: false, reason: 'tooBig' };
  depot.wagons.splice(index, 1);
  train.wagons.push(spare.type);
  train.loads.push(spare.load);
  train.value += wagonDef(spare.type)!.cost;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/** Odpina wagon z pociągu do magazynu zajezdni (ładunek zostaje w wagonie). */
export function detachWagon(state: GameState, trainId: number, index: number, events: SimEvent[]): CommandResult {
  const found = trainInDepot(state, trainId);
  if (!found) return { ok: false, reason: 'notInDepot' };
  const { train, depot } = found;
  const type = train.wagons[index];
  if (type === undefined) return { ok: false, reason: 'blocked' };
  depot.wagons.push({ type, load: train.loads[index]! });
  train.wagons.splice(index, 1);
  train.loads.splice(index, 1);
  train.value -= wagonDef(type)!.cost;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/** Sprzedaje samą lokomotywę – wagony zostają w magazynie zajezdni. */
export function sellEngine(state: GameState, trainId: number, events: SimEvent[]): CommandResult {
  const found = trainInDepot(state, trainId);
  if (!found) return { ok: false, reason: 'notInDepot' };
  const { train, depot } = found;
  train.wagons.forEach((type, k) => {
    depot.wagons.push({ type, load: train.loads[k]! });
  });
  const refund = engineTradeIn(state, train);
  unshare(state, train);
  state.trains = state.trains.filter((t) => t !== train);
  spend(state, 'construction', -refund);
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/**
 * Podwójna trakcja: dokupienie drugiej lokomotywy tego samego typu (pełna cena) albo jej sprzedaż
 * (zwrot jak przy wymianie, zależny od wieku). Tylko w zajezdni.
 */
export function setEngineCount(state: GameState, trainId: number, count: number, events: SimEvent[]): CommandResult {
  const found = trainInDepot(state, trainId);
  if (!found) return { ok: false, reason: 'notInDepot' };
  const { train } = found;
  if (!Number.isInteger(count) || count < 1 || count > MAX_ENGINES) return { ok: false, reason: 'tooBig' };
  if (count === train.engineCount) return { ok: true };
  const def = engineDef(train.engine)!;
  if (count > train.engineCount) {
    if (!engineOnSale(state, def)) return { ok: false, reason: 'notAvailable' };
    const cost = def.cost * (count - train.engineCount);
    if (cost > state.money) return { ok: false, reason: 'noMoney' };
    spend(state, 'construction', cost);
    train.value += cost;
  } else {
    const removed = train.engineCount - count;
    spend(state, 'construction', -oneEngineTradeIn(state, train) * removed);
    train.value -= def.cost * removed;
  }
  train.engineCount = count;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}
