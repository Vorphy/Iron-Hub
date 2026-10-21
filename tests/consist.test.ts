import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { MAX_WAGONS } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side } from '../src/sim/track/track';
import { wagonResale } from '../src/sim/trains/consist';
import { engineTradeIn, resaleValue } from '../src/sim/trains/train';
import { wagonDef } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

function depotSim(): Simulation {
  const state = createGame({ width: 16, height: 16, seed: 1, empty: true, startYear: 1962 });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'bizon', wagons: ['weglarka', 'osobowy'] });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'sokol', wagons: [] });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

const run = (sim: Simulation, ...cmds: Parameters<Simulation['enqueue']>[0][]) => {
  for (const c of cmds) sim.enqueue(c);
  sim.processCommands();
  return fails(sim.drainEvents());
};

describe('magazyn wagonów i zmiana składu', () => {
  it('kupno wagonu do magazynu i sprzedaż z magazynu', () => {
    const sim = depotSim();
    const s = sim.state;
    const money = s.money;
    expect(run(sim, { type: 'buyWagon', depotId: 1, wagon: 'weglarka' })).toEqual([]);
    expect(s.depots[0]!.wagons.map((w) => w.type)).toEqual(['weglarka']);
    expect(s.money).toBe(money - wagonDef('weglarka')!.cost);
    run(sim, { type: 'sellSpareWagon', depotId: 1, index: 0 });
    expect(s.depots[0]!.wagons).toEqual([]);
    expect(s.money).toBe(money - wagonDef('weglarka')!.cost + wagonResale('weglarka'));
  });

  it('odpięcie wagonu z pociągu i doczepienie do innego – z ładunkiem', () => {
    const sim = depotSim();
    const [a, b] = sim.state.trains;
    a!.loads[0]!.amount = 17;
    expect(run(sim, { type: 'detachWagon', trainId: 1, index: 0 })).toEqual([]);
    expect(a!.wagons).toEqual(['osobowy']);
    expect(sim.state.depots[0]!.wagons[0]).toMatchObject({ type: 'weglarka', load: { amount: 17 } });
    expect(run(sim, { type: 'attachWagon', trainId: 2, index: 0 })).toEqual([]);
    expect(b!.wagons).toEqual(['weglarka']);
    expect(b!.loads[0]!.amount).toBe(17);
    expect(sim.state.depots[0]!.wagons).toEqual([]);
  });

  it('sprzedaż samej lokomotywy zostawia wagony w magazynie; zajezdni z wagonami nie zburzysz', () => {
    const sim = depotSim();
    const money = sim.state.money;
    const refund = engineTradeIn(sim.state, sim.state.trains[0]!);
    run(sim, { type: 'sellEngine', trainId: 1 });
    expect(sim.state.trains.map((t) => t.id)).toEqual([2]);
    expect(sim.state.depots[0]!.wagons.map((w) => w.type)).toEqual(['weglarka', 'osobowy']);
    expect(sim.state.money).toBe(money + refund);
    run(sim, { type: 'sellTrain', trainId: 2 });
    expect(run(sim, { type: 'clearTile', x: 4, y: 4 })).toEqual(['depotNotEmpty']);
  });

  it('limity: tylko w zajezdni, najwyżej 10 wagonów; zwrot za pociąg = lokomotywa + wagony', () => {
    const sim = depotSim();
    for (let i = 0; i < MAX_WAGONS; i++) run(sim, { type: 'buyWagon', depotId: 1, wagon: 'weglarka' });
    for (let i = 0; i < MAX_WAGONS - 2; i++) run(sim, { type: 'attachWagon', trainId: 1, index: 0 });
    expect(sim.state.trains[0]!.wagons).toHaveLength(MAX_WAGONS);
    expect(run(sim, { type: 'attachWagon', trainId: 1, index: 0 })).toEqual(['tooBig']);
    const t = sim.state.trains[0]!;
    const wagons = t.wagons.reduce((sum, w) => sum + wagonResale(w), 0);
    expect(Math.abs(resaleValue(sim.state, t) - (engineTradeIn(sim.state, t) + wagons))).toBeLessThanOrEqual(t.wagons.length);
    // Pociąg w trasie – bez zmian składu.
    t.status = 'running';
    expect(run(sim, { type: 'detachWagon', trainId: 1, index: 0 })).toEqual(['notInDepot']);
  });

  it('magazyn przechodzi przez zapis; stare zajezdnie dostają pusty magazyn', () => {
    const sim = depotSim();
    run(sim, { type: 'buyWagon', depotId: 1, wagon: 'kryty' });
    const data = JSON.parse(JSON.stringify(serializeState(sim.state)));
    expect(deserializeState(data).depots).toEqual(sim.state.depots);
    data.version = 14;
    for (const d of data.depots) delete d.wagons;
    expect(deserializeState(data).depots[0]!.wagons).toEqual([]);
  });
});
