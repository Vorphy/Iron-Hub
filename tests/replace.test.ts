import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/data/economy';
import type { SimEvent } from '../src/sim/commands';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { engineTradeIn, replaceCost } from '../src/sim/trains/train';
import { engineDef } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const YEAR_TICKS = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;
const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/** Linia y=5: zajezdnia (0,5), tor 1..30, stacje A (5..8) i B (22..25); pociąg Bizon z 2 wagonami, rozkład A–B. */
function line(): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true, startYear: 1962 });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'bizon', wagons: ['osobowy', 'pocztowy'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

const train = (sim: Simulation) => sim.state.trains[0]!;

describe('wymiana lokomotywy', () => {
  it('zwrot za starą maleje z wiekiem: 75% → 10% po 50 latach', () => {
    const sim = line();
    const cost = engineDef('bizon')!.cost;
    const { full, old } = ECONOMY.refunds.engineTradeIn;
    expect(engineTradeIn(sim.state, train(sim))).toBe(Math.round(cost * full));
    sim.state.tick += 25 * YEAR_TICKS;
    expect(engineTradeIn(sim.state, train(sim))).toBe(Math.round((cost * (full + old)) / 2));
    sim.state.tick += 40 * YEAR_TICKS;
    expect(engineTradeIn(sim.state, train(sim))).toBe(Math.round(cost * old));
  });

  it('sprzedaż starego pociągu: lokomotywa wg wieku, wagony 75%', () => {
    const sim = line();
    sim.state.tick += 60 * YEAR_TICKS;
    const money = sim.state.money;
    const wagons = train(sim).value - engineDef('bizon')!.cost;
    sim.enqueue({ type: 'sellTrain', trainId: 1 });
    sim.processCommands();
    const { old } = ECONOMY.refunds.engineTradeIn;
    expect(sim.state.money).toBe(
      money + Math.round(wagons * ECONOMY.refunds.trainResale) + Math.round(engineDef('bizon')!.cost * old),
    );
  });

  it('w zajezdni – od razu; wagony i rozkład zostają, płacimy różnicę', () => {
    const sim = line();
    sim.state.tick += 10 * YEAR_TICKS;
    const money = sim.state.money;
    const dopłata = replaceCost(sim.state, train(sim), 'sokol');
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'sokol' });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual([]);
    expect(train(sim)).toMatchObject({ engine: 'sokol', wagons: ['osobowy', 'pocztowy'], orders: [1, 2], status: 'depot' });
    expect(train(sim).engineBuilt).toBe(sim.state.tick);
    expect(sim.state.money).toBe(money - dopłata);
  });

  it('w trasie – zjeżdża do zajezdni, wymienia i wraca na trasę', () => {
    const sim = line();
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 400; i++) sim.step();
    expect(train(sim).status).not.toBe('depot');
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'sokol' });
    const events: SimEvent[] = [];
    let wasInDepot = false;
    for (let i = 0; i < 6000 && !(wasInDepot && train(sim).status !== 'depot'); i++) {
      sim.step();
      events.push(...sim.drainEvents());
      if (train(sim).status === 'depot') wasInDepot = true;
    }
    expect(fails(events)).toEqual([]);
    expect(events).toContainEqual({ type: 'engineReplaced', trainId: 1 });
    expect(train(sim)).toMatchObject({ engine: 'sokol', replaceWith: null, orders: [1, 2] });
    expect(train(sim).status).not.toBe('depot'); // wrócił na trasę
  });

  it('bez pieniędzy przy zajezdni jedzie dalej starą lokomotywą', () => {
    const sim = line();
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 400; i++) sim.step();
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'sokol' });
    sim.step();
    sim.state.money = 0;
    const events: SimEvent[] = [];
    for (let i = 0; i < 6000 && !events.some((e) => e.type === 'replaceFailed'); i++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(events).toContainEqual({ type: 'replaceFailed', trainId: 1, reason: 'noMoney' });
    expect(train(sim)).toMatchObject({ engine: 'bizon', stopped: false, replaceWith: null });
  });

  it('elektryczna do zajezdni bez sieci – odmowa; anulowanie i niedostępne', () => {
    const sim = line();
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'elektra' });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['noCatenary']);
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'blyskawica' });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['notAvailable']);
    for (let i = 0; i < 400; i++) sim.step();
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'sokol' });
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: null });
    sim.processCommands();
    expect(train(sim)).toMatchObject({ replaceWith: null, goToDepot: false });
  });

  it('zapis: zamówiona wymiana i wiek; stary zapis dostaje brak wymiany', () => {
    const sim = line();
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 200; i++) sim.step();
    sim.enqueue({ type: 'replaceEngine', trainId: 1, engine: 'sokol' });
    sim.processCommands();
    const data = JSON.parse(JSON.stringify(serializeState(sim.state)));
    expect(deserializeState(data).trains[0]).toEqual(train(sim));
    data.version = 12;
    for (const t of data.trains) {
      delete t.replaceWith;
      delete t.engineBuilt;
    }
    expect(deserializeState(data).trains[0]).toMatchObject({ replaceWith: null, engineBuilt: 0 });
  });
});
