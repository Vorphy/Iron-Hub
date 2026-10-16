import type { Simulation } from '../sim/simulation';
import { resaleValue, trainById, trainsInDepot, type Train } from '../sim/trains/train';
import { engineDef } from '../sim/trains/vehicles';
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
  if (sim.planner.isWaiting(t.id) && t.speed < 1) return 'Czeka na wolny tor';
  if (t.goToDepot) return 'Jedzie do zajezdni';
  const target = t.orders[t.currentOrder];
  if (target === undefined) return 'Jedzie (brak rozkładu)';
  if (sim.planner.isLost(t.id)) return `Nie może dojechać do: ${stationName(sim, target)}`;
  return `Jedzie do: ${stationName(sim, target)}`;
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
  };
}
