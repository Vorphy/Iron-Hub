import { describe, expect, it } from 'vitest';
import { ROAD_REMOVE_COST } from '../src/sim/config';
import { isStreet } from '../src/sim/economy/town';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { isFlat } from '../src/sim/world/height';
import { Terrain } from '../src/sim/world/map';

const world = () => createGame({ width: 128, height: 128, seed: 4 });

describe('drogi w miastach', () => {
  it('generator buduje drogi na ulicach obok domów, na płaskim lądzie', () => {
    const s = world();
    const roads = [...s.map.road.keys()].filter((i) => s.map.road[i]);
    expect(roads.length).toBeGreaterThan(50);
    for (const i of roads) {
      const x = i % 128;
      const y = Math.floor(i / 128);
      expect(isFlat(s.map, x, y)).toBe(true);
      expect(s.map.terrain[i]).not.toBe(Terrain.Water);
      expect(s.map.house[i] || s.map.industry[i] || s.map.track[i]).toBe(0);
      // Na ulicy któregoś miasta.
      expect(s.towns.some((t) => isStreet(t, x, y))).toBe(true);
    }
  });

  it('stacja na drodze ją zastępuje, buldożer usuwa drogę, miasto ją odbudowuje', () => {
    const s = world();
    const sim = new Simulation(s);
    const roads = [...s.map.road.keys()].filter((i) => s.map.road[i]);
    const [a, b] = [roads[0]!, roads[roads.length - 1]!];
    sim.enqueue({ type: 'buildStation', x0: a % 128, y0: Math.floor(a / 128), x1: a % 128, y1: Math.floor(a / 128), axis: 'x' });
    const money = s.money;
    sim.enqueue({ type: 'clearTile', x: b % 128, y: Math.floor(b / 128) });
    sim.step();
    expect(s.map.road[a]).toBe(0);
    expect(s.map.station[a]).toBeGreaterThan(0);
    expect(s.map.road[b]).toBe(0);
    expect(s.money).toBeLessThan(money - ROAD_REMOVE_COST + 1);
    // Po miesiącu miasto odbudowuje drogę obok swoich domów (stacji już nie rusza).
    monthlyEconomy(s, []);
    expect(s.map.road[b]).toBe(1);
    expect(s.map.road[a]).toBe(0);
  });

  it('terenu pod drogą nie da się zmieniać', () => {
    const s = world();
    const sim = new Simulation(s);
    const i = [...s.map.road.keys()].find((k) => s.map.road[k])!;
    sim.enqueue({ type: 'terraform', vx: i % 128, vy: Math.floor(i / 128), delta: 1 });
    sim.step();
    expect(sim.drainEvents().some((e) => e.type === 'commandFailed' && e.reason === 'blocked')).toBe(true);
  });

  it('drogi przechodzą przez zapis', () => {
    const s = world();
    expect(deserializeState(JSON.parse(JSON.stringify(serializeState(s)))).map.road).toEqual(s.map.road);
  });
});
