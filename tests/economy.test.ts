import { ECONOMY } from '../src/data/economy';
import { describe, expect, it } from 'vitest';
import {
  deliveryPayment,
  ratingParts,
  ratingTarget,
  stationAccepts,
  stationRating,
  updateStationRatings,
} from '../src/sim/economy/cargoFlow';
import { emptyIndustryMonth, industryDef } from '../src/sim/economy/industry';
import { emptyTownMonth } from '../src/sim/economy/town';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

function addIndustry(state: GameState, type: string, x: number, y: number): void {
  const def = industryDef(type)!;
  const id = state.industries.length + 1;
  state.industries.push({ id, type, name: def.name, x, y, level: 1, growth: 0, month: emptyIndustryMonth(), history: [] });
  for (let dy = 0; dy < def.size[1]; dy++)
    for (let dx = 0; dx < def.size[0]; dx++) state.map.industry[(y + dy) * state.map.width + x + dx] = id;
}

function addTown(state: GameState, name: string, x: number, y: number, houses: [number, number][]): void {
  const id = state.towns.length + 1;
  state.towns.push({ id, name, x, y, month: emptyTownMonth(), lastTransported: 0 });
  for (const [hx, hy] of houses) {
    state.map.house[hy * state.map.width + hx] = 3;
    state.map.town[hy * state.map.width + hx] = id;
  }
}

/**
 * Linia y=10 x=1..48: zajezdnia (0,10). Kopalnia węgla przy x≈5, elektrownia przy x≈40,
 * stacje A (x=4..7) i B (x=40..43).
 */
function coalLine(): { sim: Simulation; state: GameState } {
  const state = createGame({ width: 50, height: 20, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  addIndustry(state, 'coal_mine', 4, 12);
  addIndustry(state, 'power_plant', 40, 12);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 48, 10) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 4, y0: 10, x1: 7, y1: 10, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 40, y0: 10, x1: 43, y1: 10, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'grom', wagons: ['weglarka', 'weglarka', 'weglarka'] });
  sim.step();
  expect(sim.drainEvents().filter((e) => e.type === 'commandFailed')).toEqual([]);
  const train = state.trains[0]!;
  sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [1, 2] });
  sim.enqueue({ type: 'startTrain', trainId: train.id });
  return { sim, state };
}

describe('zapłata za dostawę', () => {
  it('rośnie z ilością i odległością, maleje przy długim przewozie', () => {
    const fast = deliveryPayment('coal', 30, 40, 5);
    expect(fast).toBe(Math.round(30 * ECONOMY.cargo.coal.rate * 40));
    expect(deliveryPayment('coal', 60, 40, 5)).toBe(fast * 2);
    expect(deliveryPayment('coal', 30, 80, 5)).toBe(fast * 2);
    expect(deliveryPayment('coal', 30, 40, 60)).toBeLessThan(fast);
    // Nigdy poniżej 30% stawki.
    expect(deliveryPayment('coal', 30, 40, 1000)).toBe(Math.round(fast * 0.3));
  });
});

describe('stacje i ładunki', () => {
  it('stacja przyjmuje surowce zakładów w zasięgu i potrzeby mieszkańców', () => {
    const { state } = coalLine();
    expect([...stationAccepts(state, state.stations[1]!)]).toEqual(['coal']);
    expect(stationAccepts(state, state.stations[0]!).size).toBe(0);
    addTown(state, 'Testowo', 6, 15, [
      [5, 14],
      [6, 14],
      [7, 14],
    ]);
    // 3 domy poziomu 3 = 240 mieszkańców: pasażerowie, poczta i towary.
    expect(stationAccepts(state, state.stations[0]!)).toEqual(new Set(['passengers', 'mail', 'goods']));
  });

  it('bez obsługi stacja nie zbiera ładunku', () => {
    const { sim, state } = coalLine();
    sim.enqueue({ type: 'stopTrain', trainId: 1 });
    for (let i = 0; i < 25 * TICKS_PER_DAY; i++) sim.step();
    expect(state.stations[0]!.cargo.coal).toBeUndefined();
    expect(state.industries[0]!.month.produced).toBeGreaterThan(0);
    expect(state.industries[0]!.month.transported).toBe(0);
  });

  it('składniki oceny jak w OpenTTD: odbiór, prędkość, tłum, wiek', () => {
    const { state } = coalLine();
    state.tick = 0;
    const sc = { waiting: 50, lastPickup: 0, rating: 175, lastSpeed: 165, lastAge: 0 };
    // Świeży odbiór, 165 km/h, mało czeka, nowa lokomotywa: 130 + 20 + 40 + 33.
    expect(ratingParts(state, sc)).toEqual({ speed: 20, pickup: 130, waiting: 40, age: 33, research: 0 });
    expect(ratingTarget(state, sc)).toBe(223);
    // Wolny stary pociąg, 20 dni bez odbioru, tłum na peronie.
    state.tick = 20 * TICKS_PER_DAY;
    const bad = { waiting: 2000, lastPickup: 0, rating: 175, lastSpeed: 64, lastAge: 10 };
    expect(ratingParts(state, bad)).toEqual({ speed: 0, pickup: 50, waiting: -90, age: 0, research: 0 });
    expect(ratingTarget(state, bad)).toBe(0);
  });

  it('stary zapis (v26): ocena w punktach ze starej oceny za częstość kursów', () => {
    const { state } = coalLine();
    state.tick = 100 * TICKS_PER_DAY;
    state.stations[0]!.cargo.coal = { waiting: 0, lastPickup: state.tick, rating: 0, lastSpeed: 0, lastAge: 0 };
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    data.version = 26;
    const old = data.stations[0].cargo.coal;
    delete old.rating;
    delete old.lastSpeed;
    delete old.lastAge;
    const sc = deserializeState(data).stations[0]!.cargo.coal!;
    expect(sc.rating).toBe(Math.round(0.95 * 255));
    expect(sc.lastSpeed).toBe(0);
  });

  it('ocena zmienia się powoli, a bez obsługi przez 60 dni spada do zera', () => {
    const { state } = coalLine();
    state.tick = 0;
    const st = state.stations[0]!;
    st.cargo.coal = { waiting: 0, lastPickup: 0, rating: 175, lastSpeed: 165, lastAge: 0 };
    updateStationRatings(state);
    expect(st.cargo.coal.rating).toBe(176);
    for (let d = 0; d < 100; d++) updateStationRatings(state);
    expect(st.cargo.coal.rating).toBe(223);
    expect(stationRating(state, st.cargo.coal)).toBeCloseTo(223 / 255);
    state.tick = 61 * TICKS_PER_DAY;
    expect(stationRating(state, st.cargo.coal)).toBe(0);
  });
});

describe('łańcuch kopalnia → pociąg → elektrownia', () => {
  it('pociąg wozi węgiel i zarabia, elektrownia dostaje dostawy', () => {
    const { sim, state } = coalLine();
    const money = state.money;
    const incomes: number[] = [];
    for (let i = 0; i < 200 * TICKS_PER_DAY; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'income') incomes.push(e.amount);
    }
    expect(incomes.length).toBeGreaterThan(1);
    expect(state.finances.month.income + state.finances.history.reduce((s, l) => s + l.income, 0)).toBeGreaterThan(0);
    expect(state.money).toBeGreaterThan(money);
    // Statystyki zamykają się co miesiąc – sprawdzamy historię wskaźników.
    expect(state.industries[0]!.history.some((r) => r > 0)).toBe(true);
    expect(state.industries[1]!.history.some((r) => r > 0)).toBe(true);
  });

  it('gra z ładunkami po wczytaniu toczy się identycznie', () => {
    const { sim: a } = coalLine();
    for (let i = 0; i < 60 * TICKS_PER_DAY; i++) a.step();
    const b = new Simulation(deserializeState(JSON.parse(JSON.stringify(serializeState(a.state)))));
    for (let i = 0; i < 60 * TICKS_PER_DAY; i++) {
      a.step();
      b.step();
    }
    expect(serializeState(b.state)).toEqual(serializeState(a.state));
  });
});

describe('pasażerowie', () => {
  it('pociąg pasażerski wozi ludzi między miastami', () => {
    const state = createGame({ width: 50, height: 20, seed: 1, empty: true });
    state.map.terrain.fill(Terrain.Grass);
    addTown(state, 'Lewo', 6, 13, [
      [5, 12],
      [6, 12],
      [7, 12],
      [5, 13],
      [7, 13],
    ]);
    addTown(state, 'Prawo', 42, 13, [
      [41, 12],
      [42, 12],
      [43, 12],
      [41, 13],
    ]);
    const sim = new Simulation(state);
    sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 48, 10) });
    sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
    sim.enqueue({ type: 'buildStation', x0: 4, y0: 10, x1: 7, y1: 10, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 40, y0: 10, x1: 43, y1: 10, axis: 'x' });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy', 'osobowy'] });
    sim.step();
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    let income = 0;
    for (let i = 0; i < 150 * TICKS_PER_DAY; i++) {
      sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'income') income += e.amount;
    }
    expect(income).toBeGreaterThan(0);
    expect(state.towns.some((t) => t.lastTransported > 0)).toBe(true);
  });
});
