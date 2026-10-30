import type { Simulation } from '../sim/simulation';
import type { GameState } from '../sim/state';
import { engineMaxSpeed, engineOnSale, maintenanceFactor, nextLevelPlan, researchLevel, wagonCapacity } from '../sim/research';
import { RESEARCH, RESEARCH_CANCEL_REFUND } from '../data/research';
import {
  engineAge,
  engineTradeIn,
  oneEngineTradeIn,
  lineHeadway,
  passesOrder,
  replaceCost,
  resaleValue,
  trainById,
  trainsInDepot,
  type Train,
} from '../sim/trains/train';
import { isWaiting, platformPenalty, waitsForFullLoad } from '../sim/trains/movement';
import { consistStats, engineDef, ENGINES } from '../sim/trains/vehicles';
import { infrastructureCost } from '../sim/economy/monthly';
import { BANKRUPTCY_MONTHS, LOAN_INTEREST, LOAN_MAX, LOAN_STEP, monthlyInterest } from '../sim/economy/finance';
import { DAYS_PER_MONTH, gameDate, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../sim/time';
import { isElectrified } from '../sim/track/catenary';
import { wagonResale } from '../sim/trains/consist';

const MONTH_NAMES = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
import {
  averageSupply,
  BASE_MAX_LEVEL,
  industryDef,
  MAX_INDUSTRY_LEVEL,
  monthlyDemand,
  monthlyProduction,
  workersNeeded,
} from '../sim/economy/industry';
import { metroStatus, townHouseCount, townPopulation } from '../sim/economy/town';
import { CARGOS, type Cargo } from '../sim/economy/cargo';
import { MAX_RATING, ratingParts, ratingTarget, stationAccepts, stationRating } from '../sim/economy/cargoFlow';
import { wagonDef } from '../sim/trains/vehicles';
import type { TrainSummary, WindowData, WindowRef } from './hudStore';

function stationName(sim: Simulation, id: number | undefined): string {
  return sim.state.stations.find((s) => s.id === id)?.name ?? '?';
}

function trainStatus(sim: Simulation, t: Train): string {
  if (t.status === 'depot') return t.stopped ? 'W zajezdni' : 'Czeka na wyjazd z zajezdni';
  if (t.status === 'loading') {
    const h = t.trail[0]!;
    const st = sim.state.stations.find((s) => s.id === sim.state.map.station[h.y * sim.state.map.width + h.x]);
    if (st && t.waitTicks > 0 && waitsForFullLoad(sim.state, t, st)) return `Czeka na pełny ładunek: ${st.name}`;
    if (t.holding) return `Czeka na odstęp od poprzedniego pociągu linii: ${st?.name ?? ''}`;
    const short = platformPenalty(sim.state, t) > 1 ? ' (peron za krótki – dłuższy postój)' : '';
    return `Postój: ${stationName(sim, st?.id ?? 0)}${short}`;
  }
  if (t.stopped) return t.speed > 0 ? 'Hamuje' : 'Zatrzymany';
  if (t.reverseRequested) return 'Zawraca';
  if (isWaiting(t) && t.speed < 1) return 'Czeka na wolny tor';
  if (t.replaceWith) return `Jedzie do zajezdni – wymiana lokomotywy na ${engineDef(t.replaceWith)!.name}`;
  if (t.goToDepot) return 'Jedzie do zajezdni';
  const target = t.orders[t.currentOrder];
  if (target === undefined) return 'Jedzie (brak rozkładu)';
  if (sim.planner.isLost(t.id)) return `Nie może dojechać do: ${stationName(sim, target)}`;
  return `${passesOrder(sim.state, t, t.currentOrder) ? 'Jedzie przez' : 'Jedzie do'}: ${stationName(sim, target)}`;
}

function trainLoad(state: GameState, t: Train): { cargo: Cargo; amount: number; capacity: number }[] {
  const sums = new Map<Cargo, { amount: number; capacity: number }>();
  t.wagons.forEach((id, k) => {
    const def = wagonDef(id)!;
    const s = sums.get(def.cargo) ?? { amount: 0, capacity: 0 };
    s.amount += t.loads[k]?.amount ?? 0;
    s.capacity += wagonCapacity(state, def.capacity);
    sums.set(def.cargo, s);
  });
  return [...sums].map(([cargo, s]) => ({ cargo, ...s }));
}

function summary(sim: Simulation, t: Train): TrainSummary {
  return {
    id: t.id,
    name: t.name,
    engine: t.engine,
    engineCount: t.engineCount,
    wagons: t.wagons,
    status: trainStatus(sim, t),
    resale: resaleValue(sim.state, t),
    engineResale: engineTradeIn(sim.state, t),
    oneEngineResale: oneEngineTradeIn(sim.state, t),
    engineAvailable: engineOnSale(sim.state, engineDef(t.engine)!),
    stopped: t.stopped,
  };
}

/** Dane otwartego okna albo null, gdy obiekt już nie istnieje. */
export function buildWindowData(sim: Simulation, ref: WindowRef, pickingFor: number | null): WindowData | null {
  const { state } = sim;
  if (ref.kind === 'depot') {
    if (!state.depots.some((d) => d.id === ref.depotId)) return null;
    const depot = state.depots.find((d) => d.id === ref.depotId)!;
    return {
      kind: 'depot',
      depotId: ref.depotId,
      trains: trainsInDepot(state, ref.depotId).map((t) => summary(sim, t)),
      spare: depot.wagons.map((w) => ({ type: w.type, resale: wagonResale(w.type), amount: w.load.amount })),
      year: gameDate(state).year,
      onSale: ENGINES.filter((e) => engineOnSale(state, e)).map((e) => e.id),
      electrified: isElectrified(state.map, depot.x, depot.y),
    };
  }
  if (ref.kind === 'trains') {
    const yearTicks = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;
    const year = gameDate(state).year;
    const yearStart =
      state.tick - (gameDate(state).month - 1) * DAYS_PER_MONTH * TICKS_PER_DAY - (gameDate(state).day - 1) * TICKS_PER_DAY;
    // Pociągi na wspólnym rozkładzie – policzone raz, nie osobno dla każdego wiersza.
    const lineSizes = new Map<number, number>();
    for (const t of state.trains) if (t.shareId !== null) lineSizes.set(t.shareId, (lineSizes.get(t.shareId) ?? 0) + 1);
    return {
      kind: 'trains',
      year,
      rows: state.trains.map((t) => {
        const e = engineDef(t.engine)!;
        return {
          id: t.id,
          name: t.name,
          engine: t.engineCount > 1 ? `${t.engineCount}× ${e.name}` : e.name,
          color: e.color,
          status: trainStatus(sim, t),
          lost: sim.planner.isLost(t.id),
          profitThis: Math.round(t.profitThisYear),
          profitLast: t.profitLastYear,
          age: Math.floor((state.tick - t.createdTick) / yearTicks),
          groupId: t.groupId,
          unprofitable: t.profitLastYear < 0 && t.createdTick <= yearStart - yearTicks,
          newTrain: t.createdTick > yearStart - 1 && t.profitLastYear === 0,
          lineSize: t.shareId === null ? 0 : (lineSizes.get(t.shareId) ?? 0),
        };
      }),
      groups: state.groups.map((g) => ({ id: g.id, name: g.name, count: state.trains.filter((t) => t.groupId === g.id).length })),
    };
  }
  if (ref.kind === 'research') {
    const cur = state.research.current;
    return {
      kind: 'research',
      items: RESEARCH.map((r) => ({
        id: r.id,
        name: r.name,
        effect: r.effect,
        level: researchLevel(state, r.id),
        maxLevel: r.maxLevel,
        next: nextLevelPlan(state, r.id),
      })),
      current: cur
        ? {
            id: cur.id,
            name: RESEARCH.find((r) => r.id === cur.id)!.name,
            level: researchLevel(state, cur.id) + 1,
            progress: Math.min(1, (state.tick - cur.startTick) / Math.max(1, cur.endTick - cur.startTick)),
            daysLeft: Math.max(0, Math.ceil((cur.endTick - state.tick) / TICKS_PER_DAY)),
            refund: Math.round(cur.cost * RESEARCH_CANCEL_REFUND),
          }
        : null,
    };
  }
  if (ref.kind === 'finance') {
    const now = gameDate(state);
    const ledgers = [state.finances.month, ...[...state.finances.history].reverse()];
    return {
      kind: 'finance',
      companyName: state.companyName,
      months: ledgers.map((l, k) => {
        const total = now.year * 12 + (now.month - 1) - k;
        return {
          label: `${MONTH_NAMES[total % 12]} ${Math.floor(total / 12)}`,
          income: Math.round(l.income),
          trains: Math.round(l.trains),
          infrastructure: Math.round(l.infrastructure),
          construction: Math.round(l.construction),
          interest: Math.round(l.interest),
        };
      }),
      loan: state.finances.loan,
      loanMax: LOAN_MAX,
      loanStep: LOAN_STEP,
      loanInterest: LOAN_INTEREST,
      interestPerMonth: monthlyInterest(state),
      debtMonths: state.finances.debtMonths,
      bankruptcyMonths: BANKRUPTCY_MONTHS,
      infrastructurePerMonth: infrastructureCost(state),
      trainsPerMonth: Math.round(
        (state.trains
          .filter((t) => t.status !== 'depot')
          .reduce((s, t) => s + consistStats(t.engine, t.wagons, t.engineCount).runningCost, 0) *
          maintenanceFactor(state)) /
          12,
      ),
    };
  }
  if (ref.kind === 'station') {
    const st = state.stations.find((s) => s.id === ref.stationId);
    if (!st) return null;
    const accepts = stationAccepts(state, st);
    return {
      kind: 'station',
      stationId: st.id,
      name: st.name,
      waypoint: st.waypoint,
      platforms: st.tiles.length + (st.underTiles?.length ?? 0),
      cargo: CARGOS.filter((c) => st.cargo[c]).map((c) => {
        const sc = st.cargo[c]!;
        const rating = stationRating(state, sc);
        return {
          cargo: c,
          waiting: Math.floor(sc.waiting),
          rating,
          target: rating > 0 ? ratingTarget(state, sc) / MAX_RATING : 0,
          parts: rating > 0 ? ratingParts(state, sc) : null,
        };
      }),
      accepts: CARGOS.filter((c) => accepts.has(c)),
    };
  }
  if (ref.kind === 'town') {
    const town = state.towns.find((t) => t.id === ref.townId);
    if (!town) return null;
    const population = townPopulation(state, town);
    return {
      kind: 'town',
      townId: town.id,
      name: town.name,
      population,
      houses: townHouseCount(state, town),
      passengers: Math.round(town.month.passengers),
      passengersTransported: Math.round(town.month.passengersTransported),
      mail: Math.round(town.month.mail),
      mailTransported: Math.round(town.month.mailTransported),
      lastTransported: town.lastTransported,
      metro: metroStatus(state, town, population),
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
      baseMaxLevel: BASE_MAX_LEVEL,
      workers: Math.round(ind.month.workers),
      workersNeeded: workersNeeded(ind),
    };
  }
  const t = trainById(state, ref.trainId);
  if (!t) return null;
  return {
    kind: 'train',
    trainId: t.id,
    name: t.name,
    engine: t.engine,
    engineCount: t.engineCount,
    wagons: t.wagons,
    status: trainStatus(sim, t),
    speed: Math.round(t.speed),
    maxSpeed: engineMaxSpeed(state, engineDef(t.engine)!.maxSpeed),
    inDepot: t.status === 'depot',
    stopped: t.stopped,
    goToDepot: t.goToDepot,
    lost: sim.planner.isLost(t.id),
    orders: t.orders.map((id, i) => ({
      stationId: id,
      name: stationName(sim, id),
      fullLoad: t.fullLoad[i] === true,
      waitDays: t.waitDays[i] ?? 0,
      nonStop: t.nonStop[i] === true,
      waypoint: state.stations.some((s) => s.id === id && s.waypoint),
    })),
    spacing: t.spacing,
    headwayDays: lineHeadway(state, t) > 0 ? Math.round((lineHeadway(state, t) / TICKS_PER_DAY) * 10) / 10 : null,
    currentOrder: t.currentOrder,
    resale: resaleValue(sim.state, t),
    picking: pickingFor === t.id,
    load: trainLoad(state, t),
    engineAge: Math.floor(engineAge(state, t)),
    tradeIn: engineTradeIn(state, t),
    replaceWith: t.replaceWith,
    profitThis: Math.round(t.profitThisYear),
    profitLast: t.profitLastYear,
    groupId: t.groupId,
    groups: state.groups.map((g) => ({ id: g.id, name: g.name })),
    sharedWith:
      t.shareId === null
        ? []
        : state.trains.filter((o) => o.shareId === t.shareId && o !== t).map((o) => ({ id: o.id, name: o.name })),
    replaceOptions: ENGINES.filter((e) => engineOnSale(state, e))
      .filter((e) => e.id !== t.engine)
      .map((e) => ({ id: e.id, cost: replaceCost(state, t, e.id) })),
    sameEngineTrains: state.trains.filter((o) => o.engine === t.engine).length,
    cloneCost: consistStats(t.engine, t.wagons, t.engineCount).cost,
    cloneAvailable: engineOnSale(state, engineDef(t.engine)!),
  };
}
