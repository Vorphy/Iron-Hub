import { describe, expect, it } from 'vitest';
import { GameLoop, TICK_MS } from '../src/loop';
import { CLEAR_ROUGH_COST, START_MONEY } from '../src/sim/config';
import { createRng, nextInt, nextU32 } from '../src/sim/rng';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { TICKS_PER_DAY, tickToDate } from '../src/sim/time';
import { generateMap, getTerrain, setTerrain, Terrain } from '../src/sim/world/map';

describe('rng', () => {
  it('jest deterministyczny dla tego samego ziarna', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('nextInt mieści się w zakresie', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = nextInt(r, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
    }
  });
});

describe('generateMap', () => {
  it('daje tę samą mapę dla tego samego ziarna', () => {
    expect(generateMap(64, 48, 5).terrain).toEqual(generateMap(64, 48, 5).terrain);
  });

  it('różne ziarna dają różne mapy', () => {
    expect(generateMap(64, 64, 1).terrain).not.toEqual(generateMap(64, 64, 2).terrain);
  });

  it('zawiera trawę, wodę i nieużytki', () => {
    const map = generateMap(128, 128, 1);
    const counts = [0, 0, 0];
    for (const t of map.terrain) counts[t]!++;
    expect(counts[Terrain.Grass]).toBeGreaterThan(counts[Terrain.Water]!);
    expect(counts[Terrain.Water]).toBeGreaterThan(0);
    expect(counts[Terrain.Rough]).toBeGreaterThan(0);
  });
});

describe('time', () => {
  it('liczy datę z ticków', () => {
    expect(tickToDate(0)).toEqual({ year: 1950, month: 1, day: 1 });
    expect(tickToDate(TICKS_PER_DAY)).toEqual({ year: 1950, month: 1, day: 2 });
    expect(tickToDate(TICKS_PER_DAY * 30)).toEqual({ year: 1950, month: 2, day: 1 });
    expect(tickToDate(TICKS_PER_DAY * 360)).toEqual({ year: 1951, month: 1, day: 1 });
  });
});

function simWithRoughAt(x: number, y: number): Simulation {
  const state = createGame({ width: 16, height: 16, seed: 1 });
  state.map.terrain.fill(Terrain.Grass);
  setTerrain(state.map, x, y, Terrain.Rough);
  return new Simulation(state);
}

describe('Simulation', () => {
  it('clearTile zamienia nieużytek w trawę i pobiera opłatę', () => {
    const sim = simWithRoughAt(3, 4);
    sim.enqueue({ type: 'clearTile', x: 3, y: 4 });
    sim.step();
    expect(getTerrain(sim.state.map, 3, 4)).toBe(Terrain.Grass);
    expect(sim.state.money).toBe(START_MONEY - CLEAR_ROUGH_COST);
    expect(sim.drainEvents()).toEqual([{ type: 'tileChanged', x: 3, y: 4 }]);
  });

  it('odrzuca nieprawidłowe komendy bez zmiany stanu', () => {
    const sim = simWithRoughAt(3, 4);
    sim.enqueue({ type: 'clearTile', x: 0, y: 0 });
    sim.enqueue({ type: 'clearTile', x: 99, y: 0 });
    sim.step();
    expect(sim.state.money).toBe(START_MONEY);
    expect(sim.drainEvents().map((e) => e.type === 'commandFailed' && e.reason)).toEqual(['nothingToClear', 'outOfBounds']);
  });

  it('odrzuca komendę przy braku pieniędzy', () => {
    const sim = simWithRoughAt(3, 4);
    sim.state.money = CLEAR_ROUGH_COST - 1;
    sim.enqueue({ type: 'clearTile', x: 3, y: 4 });
    sim.step();
    expect(getTerrain(sim.state.map, 3, 4)).toBe(Terrain.Rough);
  });

  it('drainEvents opróżnia kolejkę zdarzeń', () => {
    const sim = simWithRoughAt(3, 4);
    sim.enqueue({ type: 'clearTile', x: 3, y: 4 });
    sim.step();
    sim.drainEvents();
    expect(sim.drainEvents()).toEqual([]);
  });
});

describe('GameLoop', () => {
  it('wykonuje ticki zgodnie z upływem czasu i prędkością', () => {
    const sim = new Simulation(createGame({ width: 8, height: 8, seed: 1 }));
    const loop = new GameLoop(sim);
    expect(loop.advance(TICK_MS * 3)).toBe(3);
    loop.speed = 4;
    expect(loop.advance(TICK_MS)).toBe(4);
    expect(sim.state.tick).toBe(7);
  });

  it('akumuluje ułamki klatek', () => {
    const sim = new Simulation(createGame({ width: 8, height: 8, seed: 1 }));
    const loop = new GameLoop(sim);
    expect(loop.advance(TICK_MS * 0.6)).toBe(0);
    expect(loop.advance(TICK_MS * 0.6)).toBe(1);
    expect(loop.alpha).toBeCloseTo(0.2);
  });

  it('podczas pauzy czas stoi, ale komendy są wykonywane', () => {
    const sim = simWithRoughAt(1, 1);
    const loop = new GameLoop(sim);
    loop.speed = 0;
    sim.enqueue({ type: 'clearTile', x: 1, y: 1 });
    expect(loop.advance(1000)).toBe(0);
    expect(sim.state.tick).toBe(0);
    expect(getTerrain(sim.state.map, 1, 1)).toBe(Terrain.Grass);
  });
});
