import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/data/economy';
import { TRACK_COST } from '../src/sim/config';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import { HOUSE_POPULATION, newTown, townTiles } from '../src/sim/economy/town';
import { absorbTowns } from '../src/sim/economy/townMerge';
import { deserializeState, SaveError, serializeState } from '../src/sim/serialize';
import { DEFAULT_SETTINGS, type GameSettings } from '../src/sim/settings';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { refund } from '../src/sim/track/build';
import { Track } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

const W = 64;

function world(settings: Partial<GameSettings> = {}) {
  const state = createGame({ width: W, height: W, seed: 1, empty: true, settings });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  return state;
}

const line = (n: number) => Array.from({ length: n }, (_, k) => ({ x: 10 + k, y: 10, track: Track.X }));

describe('zasady gry – koszty budowy', () => {
  it('nowa gra ma domyślne zasady, a okno nowej gry może je zmienić', () => {
    expect(createGame({ width: 16, height: 16, seed: 1, empty: true }).settings).toEqual(DEFAULT_SETTINGS);
    const g = createGame({ width: 16, height: 16, seed: 1, empty: true, settings: { costs: 'high' }, signalMode: 'manual' });
    expect(g.settings).toEqual({ ...DEFAULT_SETTINGS, costs: 'high' });
    expect(g.signalMode).toBe('manual');
  });

  it('wysokie koszty mnożą cenę budowy i zwrot za rozbiórkę', () => {
    for (const costs of ['low', 'normal', 'high'] as const) {
      const state = world({ costs });
      const sim = new Simulation(state);
      const factor = ECONOMY.settings.costs[costs];
      sim.enqueue({ type: 'buildTrack', pieces: line(4) });
      sim.processCommands();
      expect(state.money).toBe(1_000_000 - Math.round(4 * TRACK_COST * factor));
      const before = state.money;
      sim.enqueue({ type: 'removeTrack', pieces: line(1) });
      sim.processCommands();
      expect(state.money - before).toBe(refund(state));
      expect(refund(state)).toBe(Math.round(TRACK_COST * ECONOMY.refunds.demolition * factor));
    }
  });

  it('zmiana w trakcie gry działa od następnej budowy; błędna wartość jest odrzucana', () => {
    const state = world();
    const sim = new Simulation(state);
    sim.enqueue({ type: 'setSettings', settings: { costs: 'low' } });
    sim.enqueue({ type: 'buildTrack', pieces: line(4) });
    sim.processCommands();
    expect(state.money).toBe(1_000_000 - Math.round(4 * TRACK_COST * ECONOMY.settings.costs.low));
    sim.enqueue({ type: 'setSettings', settings: { costs: 'gratis' as never } });
    sim.processCommands();
    expect(state.settings.costs).toBe('low');
  });
});

describe('zasady gry – miasta', () => {
  /** Obsługiwane miasto: co miesiąc wszyscy pasażerowie przewiezieni (najszybszy wzrost). */
  function grownTiles(townGrowth: GameSettings['townGrowth'], months = 4): number {
    const state = world({ townGrowth });
    const town = newTown(1, 'Testowo', 30, 30);
    state.towns.push(town);
    for (let k = 0; k < months; k++) {
      town.month.passengers = 100;
      town.month.passengersTransported = 100;
      monthlyEconomy(state, []);
    }
    return townTiles(state, town).length;
  }

  it('tempo wzrostu: brak – miasto stoi, szybko – rośnie szybciej niż normalnie', () => {
    const off = grownTiles('off');
    const slow = grownTiles('slow');
    const normal = grownTiles('normal');
    const fast = grownTiles('fast');
    expect(off).toBe(0);
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(normal);
    expect(fast).toBeGreaterThan(normal);
  });

  it('łączenie wyłączone: zrośnięte miasta zostają osobno i nie liczą miesięcy styku', () => {
    const state = world({ townMerge: false });
    const big = newTown(1, 'Żelazowo', 30, 30);
    const small = newTown(2, 'Stalówka', 34, 30);
    state.towns.push(big, small);
    for (const [x, id, level] of [
      [32, 1, 4],
      [33, 2, 1],
    ] as const) {
      state.map.house[30 * W + x] = level;
      state.map.town[30 * W + x] = id;
    }
    expect(HOUSE_POPULATION[4]).toBeGreaterThan(HOUSE_POPULATION[1]!);
    small.contact = { townId: 1, months: 5 };
    for (let k = 0; k < ECONOMY.town.absorbMonths + 2; k++) absorbTowns(state, []);
    expect(state.towns).toHaveLength(2);
    expect(small.contact).toBeUndefined();
    // Po włączeniu – licznik startuje od zera i po roku miasta się łączą.
    state.settings.townMerge = true;
    for (let k = 0; k < ECONOMY.town.absorbMonths; k++) absorbTowns(state, []);
    expect(state.towns).toEqual([big]);
  });
});

describe('zasady gry – zapis', () => {
  it('zapis i odczyt zachowują zasady; uszkodzone są odrzucane', () => {
    const state = world({ costs: 'high', townGrowth: 'fast', townMerge: false });
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    expect(deserializeState(data).settings).toEqual({ costs: 'high', townGrowth: 'fast', townMerge: false });
    expect(() => deserializeState({ ...data, settings: { ...data.settings, townGrowth: 'turbo' } })).toThrow(SaveError);
  });

  it('starsze zapisy (v34) dostają domyślne zasady – zachowanie jak dotąd', () => {
    const data = JSON.parse(JSON.stringify(serializeState(world())));
    delete data.settings;
    data.version = 34;
    expect(deserializeState(data).settings).toEqual(DEFAULT_SETTINGS);
  });
});
