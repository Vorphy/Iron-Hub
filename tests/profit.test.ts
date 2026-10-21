import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { emptyIndustryMonth } from '../src/sim/economy/industry';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { consistStats } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const YEAR = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;
const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/** Kopalnia węgla przy stacji A, elektrownia przy stacji B; pociąg z węglarkami A–B. */
function coalLine(): Simulation {
  const state = createGame({ width: 40, height: 20, seed: 1, empty: true, startYear: 1962 });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const add = (id: number, type: string, x: number) => {
    state.industries.push({ id, type, name: type, x, y: 6, level: 1, growth: 0, month: emptyIndustryMonth(), history: [] });
    for (let y = 6; y < 9; y++) for (let dx = 0; dx < 3; dx++) state.map.industry[y * 40 + x + dx] = id;
  };
  add(1, 'coal_mine', 5);
  add(2, 'power_plant', 22);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 10) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 10, x1: 8, y1: 10, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 10, x1: 25, y1: 10, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'bizon', wagons: ['weglarka', 'weglarka'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  sim.enqueue({ type: 'startTrain', trainId: 1 });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

describe('zysk pociągów', () => {
  it('przewóz dopisuje przychód do pociągu, miesiąc odejmuje jego utrzymanie', () => {
    const sim = coalLine();
    const t = sim.state.trains[0]!;
    let income = 0;
    for (let i = 0; i < 12_000 && income === 0; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'income') income += e.amount;
    }
    expect(income).toBeGreaterThan(0);
    const before = t.profitThisYear;
    expect(before).toBeGreaterThan(0);
    // Zamknięcie zwykłego miesiąca (nie stycznia – wtedy zamyka się też rok).
    sim.state.tick = 4 * DAYS_PER_MONTH * TICKS_PER_DAY;
    monthlyEconomy(sim.state, []);
    expect(t.profitThisYear).toBeCloseTo(before - consistStats('bizon', ['weglarka', 'weglarka']).runningCost / 12);
  });

  it('nowy rok: zysk przechodzi do zeszłego; stratne pociągi jeżdżące cały rok – komunikat', () => {
    const sim = coalLine();
    const s = sim.state;
    const t = s.trains[0]!;
    t.profitThisYear = -500;
    s.tick = YEAR + 10 * TICKS_PER_DAY; // pociąg kupiony rok temu
    // 1 stycznia następnego roku
    s.tick = 2 * YEAR;
    const events: SimEvent[] = [];
    monthlyEconomy(s, events);
    expect(t.profitLastYear).toBeLessThanOrEqual(-500);
    expect(t.profitThisYear).toBe(0);
    expect(events).toContainEqual({ type: 'unprofitableTrains', trainIds: [1] });
  });

  it('pociąg kupiony w trakcie roku nie jest ogłaszany jako stratny', () => {
    const sim = coalLine();
    const s = sim.state;
    s.trains[0]!.createdTick = YEAR - 40 * TICKS_PER_DAY;
    s.trains[0]!.profitThisYear = -100;
    s.tick = YEAR;
    const events: SimEvent[] = [];
    monthlyEconomy(s, events);
    expect(events.some((e) => e.type === 'unprofitableTrains')).toBe(false);
  });
});

describe('grupy pociągów', () => {
  it('tworzenie, przypisanie, kopia w tej samej grupie, usunięcie; zapis', () => {
    const sim = coalLine();
    const s = sim.state;
    sim.enqueue({ type: 'createGroup', name: '  Węgiel  ' });
    sim.enqueue({ type: 'setTrainGroup', trainId: 1, groupId: 1 });
    sim.enqueue({ type: 'renameGroup', groupId: 1, name: 'Węgiel A–B' });
    sim.processCommands();
    expect(s.groups).toEqual([{ id: 1, name: 'Węgiel A–B' }]);
    expect(s.trains[0]!.groupId).toBe(1);
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(s.trains[1]!.groupId).toBe(1);

    const data = JSON.parse(JSON.stringify(serializeState(s)));
    const loaded = deserializeState(data);
    expect(loaded.groups).toEqual(s.groups);
    expect(loaded.trains[1]!.groupId).toBe(1);

    sim.enqueue({ type: 'deleteGroup', groupId: 1 });
    sim.processCommands();
    expect(s.groups).toEqual([]);
    expect(s.trains.every((t) => t.groupId === null)).toBe(true);

    // Stary zapis (v16) – bez grup i zysków.
    data.version = 16;
    delete data.groups;
    delete data.nextGroupId;
    for (const t of data.trains) {
      delete t.profitThisYear;
      delete t.profitLastYear;
      delete t.createdTick;
      delete t.groupId;
    }
    const old = deserializeState(data);
    expect(old.groups).toEqual([]);
    expect(old.trains[0]).toMatchObject({ profitThisYear: 0, profitLastYear: 0, groupId: null });
  });
});
