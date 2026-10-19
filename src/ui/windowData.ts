import type { Simulation } from '../sim/simulation';
import { resaleValue, trainById, trainsInDepot, type Train } from '../sim/trains/train';
import { isWaiting } from '../sim/trains/movement';
import { consistStats, engineDef } from '../sim/trains/vehicles';
import { infrastructureCost } from '../sim/economy/monthly';
import { tickToDate } from '../sim/time';

const MONTH_NAMES = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
import {
  averageSupply,
  industryDef,
  MAX_INDUSTRY_LEVEL,
  monthlyDemand,
  monthlyProduction,
} from '../sim/economy/industry';
import { townHouseCount, townPopulation } from '../sim/economy/town';
import { CARGOS, type Cargo } from '../sim/economy/cargo';
import { stationAccepts, stationRating } from '../sim/economy/cargoFlow';
import { wagonDef } from '../sim/trains/vehicles';
import type { TrainSummary, WindowData, WindowRef } from './hudStore';

function stationName(sim: Simulation, id: number | undefined): string {
  return sim.state.stations.find((s) => s.id === id)?.name ?? '?';
}

function trainStatus(sim: Simulation, t: Train): string {
  if (t.status === 'depot') return t.stopped ? 'W zajezdni' : 'Czeka na wyjazd z zajezdni';
  if (t.status === 'loading') {
    const h = t.trail[0]!;
    return `Postój: ${stationName(sim, sim.state.map.station[h.y * sim.state.map.width + h.x])}`;
  }
  if (t.stopped) return t.speed > 0 ? 'Hamuje' : 'Zatrzymany';
  if (t.reverseRequested) return 'Zawraca';
  if (isWaiting(t) && t.speed < 1) return 'Czeka na wolny tor';
  if (t.goToDepot) return 'Jedzie do zajezdni';
  const target = t.orders[t.currentOrder];
  if (target === undefined) return 'Jedzie (brak rozkładu)';
  if (sim.planner.isLost(t.id)) return `Nie może dojechać do: ${stationName(sim, target)}`;
  return `Jedzie do: ${stationName(sim, target)}`;
}

function trainLoad(t: Train): { cargo: Cargo; amount: number; capacity: number }[] {
  const sums = new Map<Cargo, { amount: number; capacity: number }>();
  t.wagons.forEach((id, k) => {
    const def = wagonDef(id)!;
    const s = sums.get(def.cargo) ?? { amount: 0, capacity: 0 };
    s.amount += t.loads[k]?.amount ?? 0;
    s.capacity += def.capacity;
    sums.set(def.cargo, s);
  });
  return [...sums].map(([cargo, s]) => ({ cargo, ...s }));
}

function summary(sim: Simulation, t: Train): TrainSummary {
  return {
    id: t.id,
    name: t.name,
    engine: t.engine,
    wagons: t.wagons,
    status: trainStatus(sim, t),
    resale: resaleValue(t),
  };
}

/** Dane otwartego okna albo null, gdy obiekt już nie istnieje. */
export function buildWindowData(sim: Simulation, ref: WindowRef, pickingFor: number | null): WindowData | null {
  const { state } = sim;
  if (ref.kind === 'depot') {
    if (!state.depots.some((d) => d.id === ref.depotId)) return null;
    return { kind: 'depot', depotId: ref.depotId, trains: trainsInDepot(state, ref.depotId).map((t) => summary(sim, t)) };
  }
  if (ref.kind === 'finance') {
    const now = tickToDate(state.tick);
    const ledgers = [state.finances.month, ...[...state.finances.history].reverse()];
    return {
      kind: 'finance',
      months: ledgers.map((l, k) => {
        const total = now.year * 12 + (now.month - 1) - k;
        return {
          label: `${MONTH_NAMES[total % 12]} ${Math.floor(total / 12)}`,
          income: Math.round(l.income),
          trains: Math.round(l.trains),
          infrastructure: Math.round(l.infrastructure),
          construction: Math.round(l.construction),
        };
      }),
      infrastructurePerMonth: infrastructureCost(state),
      trainsPerMonth: Math.round(
        state.trains.filter((t) => t.status !== 'depot').reduce((s, t) => s + consistStats(t.engine, t.wagons).runningCost, 0) / 12,
      ),
    };
  }
  if (ref.kind === 'station') {
    const st = state.stations.find((s) => s.id === ref.stationId);
    if (!st) return null;
    return {
      kind: 'station',
      stationId: st.id,
      name: st.name,
      platforms: st.tiles.length,
      cargo: CARGOS.filter((c) => st.cargo[c]).map((c) => ({
        cargo: c,
        waiting: Math.floor(st.cargo[c]!.waiting),
        rating: stationRating(state, st.cargo[c]),
      })),
      accepts: CARGOS.filter((c) => stationAccepts(state, st).has(c)),
    };
  }
  if (ref.kind === 'town') {
    const town = state.towns.find((t) => t.id === ref.townId);
    if (!town) return null;
    return {
      kind: 'town',
      townId: town.id,
      name: town.name,
      population: townPopulation(state, town),
      houses: townHouseCount(state, town),
      passengers: Math.round(town.month.passengers),
      passengersTransported: Math.round(town.month.passengersTransported),
      mail: Math.round(town.month.mail),
      mailTransported: Math.round(town.month.mailTransported),
      lastTransported: town.lastTransported,
    };
  }
  if (ref.kind === 'industry') {
    const ind = state.industries.find((i) => i.id === ref.industryId);
    if (!ind) return null;
    const def = industryDef(ind.type)!;
    return {
      kind: 'industry',
      industryId: ind.id,
      name: ind.name,
      typeName: def.name,
      level: ind.level,
      maxLevel: MAX_INDUSTRY_LEVEL,
      growth: ind.growth,
      produces: def.produces,
      production: Math.round(monthlyProduction(ind)),
      accepts: def.accepts.map((cargo) => ({
        cargo,
        demand: monthlyDemand(ind),
        delivered: Math.round(ind.month.delivered[cargo] ?? 0),
      })),
      produced: Math.round(ind.month.produced),
      transported: Math.round(ind.month.transported),
      supply: averageSupply(ind),
    };
  }
  const t = trainById(state, ref.trainId);
  if (!t) return null;
  return {
    kind: 'train',
    trainId: t.id,
    name: t.name,
    engine: t.engine,
    wagons: t.wagons,
    status: trainStatus(sim, t),
    speed: Math.round(t.speed),
    maxSpeed: engineDef(t.engine)!.maxSpeed,
    inDepot: t.status === 'depot',
    stopped: t.stopped,
    goToDepot: t.goToDepot,
    lost: sim.planner.isLost(t.id),
    orders: t.orders.map((id) => ({ stationId: id, name: stationName(sim, id) })),
    currentOrder: t.currentOrder,
    resale: resaleValue(t),
    picking: pickingFor === t.id,
    load: trainLoad(t),
  };
}
