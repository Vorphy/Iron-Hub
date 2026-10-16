import { describe, expect, it } from 'vitest';
import { HOUSE_DEMOLISH_COST } from '../src/sim/config';
import { industryDef, industryTiles } from '../src/sim/economy/industry';
import { isStreet, townHouseCount, townPopulation } from '../src/sim/economy/town';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Track } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

const world = (seed = 1) => createGame({ width: 128, height: 128, seed });

describe('generator świata', () => {
  it('jest deterministyczny', () => {
    expect(serializeState(world(5))).toEqual(serializeState(world(5)));
  });

  it('stawia 8 miast z domami na lądzie, ulice zostają wolne', () => {
    const s = world();
    expect(s.towns).toHaveLength(8);
    expect(new Set(s.towns.map((t) => t.name)).size).toBe(8);
    for (const t of s.towns) {
      expect(townHouseCount(s, t)).toBeGreaterThanOrEqual(5);
      expect(townPopulation(s, t)).toBeGreaterThan(0);
    }
    for (let i = 0; i < s.map.house.length; i++) {
      if (!s.map.house[i]) continue;
      expect(s.map.terrain[i]).not.toBe(Terrain.Water);
      const town = s.towns.find((t) => t.id === s.map.town[i])!;
      expect(isStreet(town, i % 128, Math.floor(i / 128))).toBe(false);
    }
  });

  it('zakłady nie nachodzą na siebie, na wodę ani na domy', () => {
    const s = world(3);
    expect(s.industries.length).toBeGreaterThanOrEqual(10);
    const seen = new Set<number>();
    for (const ind of s.industries) {
      expect(industryDef(ind.type)).toBeDefined();
      for (const i of industryTiles(s, ind)) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
        expect(s.map.industry[i]).toBe(ind.id);
        expect(s.map.house[i]).toBe(0);
        expect(s.map.terrain[i]).not.toBe(Terrain.Water);
      }
    }
    // Jest z czego budować łańcuchy: węgiel → elektrownia, ruda + węgiel → huta, drewno → tartak.
    for (const type of ['coal_mine', 'power_plant', 'ore_mine', 'steel_mill', 'forest', 'sawmill']) {
      expect(s.industries.some((i) => i.type === type)).toBe(true);
    }
  });
});

describe('budowanie w mieście', () => {
  it('nie można kłaść torów ani stawiać stacji na domach i zakładach', () => {
    const s = world();
    const sim = new Simulation(s);
    const house = s.map.house.findIndex((h) => h > 0);
    const ind = s.industries[0]!;
    const hx = house % 128;
    const hy = Math.floor(house / 128);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: hx, y: hy, track: Track.X }] });
    sim.enqueue({ type: 'buildStation', x0: ind.x, y0: ind.y, x1: ind.x, y1: ind.y, axis: 'x' });
    sim.enqueue({ type: 'clearTile', x: ind.x, y: ind.y });
    sim.step();
    const fails = sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
    expect(fails).toEqual(['blocked', 'blocked', 'industry']);
  });

  it('dom można wyburzyć za opłatą', () => {
    const s = world();
    const sim = new Simulation(s);
    const house = s.map.house.findIndex((h) => h > 0);
    const money = s.money;
    sim.enqueue({ type: 'clearTile', x: house % 128, y: Math.floor(house / 128) });
    sim.step();
    expect(s.map.house[house]).toBe(0);
    expect(s.map.town[house]).toBe(0);
    expect(s.money).toBe(money - HOUSE_DEMOLISH_COST);
  });

  it('stacja przy mieście bierze jego nazwę, kolejna – z dopiskiem', () => {
    const s = world();
    const sim = new Simulation(s);
    const town = s.towns[0]!;
    // Ulica przy rynku jest wolna (x = town.x).
    for (const dy of [2, -2]) {
      const y = town.y + dy;
      sim.enqueue({ type: 'buildStation', x0: town.x, y0: y, x1: town.x, y1: y, axis: 'x' });
    }
    sim.step();
    const names = s.stations.map((st) => st.name);
    expect(names[0]).toBe(town.name);
    expect(names[1]).toBe(`${town.name} Główna`);
  });
});

describe('zapis świata', () => {
  it('miasta, zakłady i warstwy mapy przechodzą przez zapis', () => {
    const s = world(9);
    expect(deserializeState(JSON.parse(JSON.stringify(serializeState(s))))).toEqual(s);
  });

  it('zapis v4 (sprzed ekonomii) wczytuje się jako świat bez miast', () => {
    const s = createGame({ width: 32, height: 32, seed: 2, empty: true });
    const v5 = serializeState(s) as unknown as Record<string, unknown> & { map: Record<string, unknown> };
    const { towns: _t, industries: _i, finances: _f, ...rest } = v5;
    const { house: _h, town: _tw, industry: _in, ...map } = v5.map;
    const v4 = { ...rest, version: 4, map };
    const loaded = deserializeState(JSON.parse(JSON.stringify(v4)));
    expect(loaded.towns).toEqual([]);
    expect(loaded.map.house.every((h) => h === 0)).toBe(true);
    expect(loaded).toEqual(s);
  });
});
