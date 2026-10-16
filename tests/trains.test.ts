import { describe, expect, it } from 'vitest';
import { MAX_WAGONS, START_MONEY } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side } from '../src/sim/track/track';
import { resaleValue, trainsInDepot } from '../src/sim/trains/train';
import { consistStats, ENGINES, WAGONS } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

function simWithDepot(): Simulation {
  const state = createGame({ width: 16, height: 16, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
  sim.step();
  sim.drainEvents();
  return sim;
}

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

describe('definicje pojazdów', () => {
  it('mają unikalne id i sensowne parametry', () => {
    const ids = [...ENGINES, ...WAGONS].map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ENGINES) expect(e.power > 0 && e.maxSpeed > 0 && e.weight > 0 && e.length > 0).toBe(true);
    for (const w of WAGONS) expect(w.capacity > 0 && w.length > 0).toBe(true);
  });
});

describe('zakup pociągu', () => {
  it('kupuje skład do zajezdni i pobiera cenę', () => {
    const sim = simWithDepot();
    const money = sim.state.money;
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy', 'osobowy', 'pocztowy'] });
    sim.step();
    const [train] = sim.state.trains;
    expect(train).toMatchObject({ id: 1, name: 'Pociąg 1', status: 'depot', depotId: 1, trail: [] });
    const cost = consistStats('iskra', ['osobowy', 'osobowy', 'pocztowy']).cost;
    expect(sim.state.money).toBe(money - cost);
    expect(trainsInDepot(sim.state, 1)).toHaveLength(1);
  });

  it('odrzuca nieznane pojazdy, za długi skład, brak pieniędzy i brak zajezdni', () => {
    const sim = simWithDepot();
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'nieistnieje', wagons: [] });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy', 'xyz'] });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: Array(MAX_WAGONS + 1).fill('osobowy') });
    sim.enqueue({ type: 'buyTrain', depotId: 99, engine: 'iskra', wagons: [] });
    sim.step();
    sim.state.money = 10;
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: [] });
    sim.step();
    expect(fails(sim)).toEqual(['blocked', 'blocked', 'tooBig', 'blocked', 'noMoney']);
    expect(sim.state.trains).toEqual([]);
  });

  it('sprzedaż zwraca część ceny', () => {
    const sim = simWithDepot();
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'grom', wagons: ['weglarka'] });
    sim.step();
    const train = sim.state.trains[0]!;
    const before = sim.state.money;
    sim.enqueue({ type: 'sellTrain', trainId: train.id });
    sim.step();
    expect(sim.state.trains).toEqual([]);
    expect(sim.state.money).toBe(before + resaleValue(train));
  });

  it('zajezdni z pociągiem nie da się zburzyć', () => {
    const sim = simWithDepot();
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: [] });
    sim.enqueue({ type: 'clearTile', x: 4, y: 4 });
    sim.step();
    expect(fails(sim)).toEqual(['depotNotEmpty']);
    expect(sim.state.depots).toHaveLength(1);
  });

  it('pociągi przechodzą przez zapis', () => {
    const sim = simWithDepot();
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'strzala', wagons: ['osobowy', 'kryty'] });
    sim.step();
    expect(deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))))).toEqual(sim.state);
  });
});

it('nowa gra startuje bez pociągów i z pełnym budżetem', () => {
  const s = createGame({ width: 8, height: 8, seed: 1, empty: true });
  expect(s.trains).toEqual([]);
  expect(s.money).toBe(START_MONEY);
});
