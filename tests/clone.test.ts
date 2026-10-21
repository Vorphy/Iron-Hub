import { deserializeState, serializeState } from '../src/sim/serialize';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { consistStats } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/** Linia y=5: zajezdnie na obu końcach (0,5) i (31,5), stacje A i B, pociąg z rozkładem A–B w zajezdni 1. */
function line(engine = 'bizon'): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true, startYear: 1962 });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildDepot', x: 31, y: 5, side: Side.NW });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  if (engine === 'elektra') sim.enqueue({ type: 'buildCatenary', tiles: Array.from({ length: 31 }, (_, x) => ({ x, y: 5 })) });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine, wagons: ['osobowy', 'pocztowy'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

describe('kopiowanie pociągu', () => {
  it('w zajezdni: taki sam skład i rozkład w tej samej zajezdni, za cenę składu', () => {
    const sim = line();
    const money = sim.state.money;
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    const events = sim.drainEvents();
    expect(fails(events)).toEqual([]);
    expect(events).toContainEqual({ type: 'trainCloned', trainId: 2, depotId: 1 });
    const copy = sim.state.trains[1]!;
    expect(copy).toMatchObject({
      engine: 'bizon',
      wagons: ['osobowy', 'pocztowy'],
      orders: [1, 2],
      status: 'depot',
      depotId: 1,
      stopped: true,
    });
    expect(sim.state.money).toBe(money - consistStats('bizon', ['osobowy', 'pocztowy']).cost);
    // Kopia ma własny rozkład (zmiana nie rusza oryginału).
    copy.orders.push(1);
    expect(sim.state.trains[0]!.orders).toEqual([1, 2]);
  });

  it('w trasie: kopia w zajezdni, w której pociąg kupiono, nawet gdy inna jest bliżej', () => {
    const sim = line();
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    // Jedzie do B (koniec linii przy zajezdni 2).
    for (let i = 0; i < 4000 && (sim.state.trains[0]!.trail[0]?.x ?? 0) < 22; i++) sim.step();
    sim.drainEvents();
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(sim.drainEvents()).toContainEqual({ type: 'trainCloned', trainId: 2, depotId: 1 });
    expect(sim.state.trains[1]!.homeDepot).toBe(1);
  });

  it('zajezdnia zakupu rozebrana – kopia w najbliższej', () => {
    const sim = line();
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 4000 && (sim.state.trains[0]!.trail[0]?.x ?? 0) < 22; i++) sim.step();
    sim.state.depots = sim.state.depots.filter((d) => d.id !== 1);
    sim.drainEvents();
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(sim.drainEvents()).toContainEqual({ type: 'trainCloned', trainId: 2, depotId: 2 });
  });

  it('elektryczna – tylko do zajezdni z siecią', () => {
    const sim = line('elektra');
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 4000 && (sim.state.trains[0]!.trail[0]?.x ?? 0) < 22; i++) sim.step();
    sim.drainEvents();
    // Zajezdnia 2 (bliżej) bez sieci – kopia trafia do zajezdni 1.
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(sim.drainEvents()).toContainEqual({ type: 'trainCloned', trainId: 2, depotId: 1 });
  });

  it('bez pieniędzy albo z wycofaną lokomotywą – odmowa', () => {
    const sim = line();
    sim.state.money = 100;
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['noMoney']);

    sim.state.money = 1_000_000;
    sim.state.tick += 60 * TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR; // 2022 – Bizon wycofany
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['notAvailable']);
    expect(sim.state.trains).toHaveLength(1);
  });

  it('wspólny rozkład: kopia dzieli rozkład – zmiany i ptaszki dla całej linii, każdy jedzie swoim tempem', () => {
    const sim = line();
    const s = sim.state;
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.enqueue({ type: 'cloneTrain', trainId: 2 });
    sim.processCommands();
    const [a, b, c] = s.trains;
    expect(a!.shareId).not.toBeNull();
    expect(b!.shareId).toBe(a!.shareId);
    expect(c!.shareId).toBe(a!.shareId);
    // Zmiana w kopii zmienia oryginał i trzeci pociąg.
    sim.enqueue({ type: 'setOrders', trainId: 3, orders: [2, 1, 2] });
    sim.enqueue({ type: 'toggleFullLoad', trainId: 2, index: 1 });
    sim.processCommands();
    for (const t of [a!, b!, c!]) {
      expect(t.orders).toEqual([2, 1, 2]);
      expect(t.fullLoad).toEqual([false, true, false]);
    }
    // Własne tempo: inny bieżący cel.
    a!.currentOrder = 2;
    expect(b!.currentOrder).toBe(0);
    // Odłączenie: własna kopia, reszta dalej wspólna.
    sim.enqueue({ type: 'unshareOrders', trainId: 1 });
    sim.enqueue({ type: 'setOrders', trainId: 2, orders: [1] });
    sim.processCommands();
    expect(a!.shareId).toBeNull();
    expect(a!.orders).toEqual([2, 1, 2]);
    expect(c!.orders).toEqual([1]);
    // Sprzedaż jednego z dwóch – ostatni przestaje „dzielić” rozkład.
    sim.enqueue({ type: 'sellTrain', trainId: 3 });
    sim.processCommands();
    expect(b!.shareId).toBeNull();
  });

  it('„osobny” – kopia z niezależnym rozkładem; wspólny rozkład przechodzi przez zapis', () => {
    const sim = line();
    sim.enqueue({ type: 'cloneTrain', trainId: 1, shared: false });
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    const [a, b, c] = sim.state.trains;
    expect(b!.shareId).toBeNull();
    expect(c!.shareId).toBe(a!.shareId);
    sim.enqueue({ type: 'setOrders', trainId: 2, orders: [2] });
    sim.processCommands();
    expect(a!.orders).toEqual([1, 2]);
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded.trains.map((t) => t.shareId)).toEqual(sim.state.trains.map((t) => t.shareId));
    expect(loaded.nextShareId).toBe(sim.state.nextShareId);
  });
});
