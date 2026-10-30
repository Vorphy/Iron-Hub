import { describe, expect, it } from 'vitest';
import { emptyIndustryMonth, industryDef, monthlyProduction } from '../src/sim/economy/industry';
import { infrastructureCost, LEVEL_POINTS, MAINTENANCE, monthlyEconomy, monthRatio } from '../src/sim/economy/monthly';
import { newTown, townHouseCount, townTiles } from '../src/sim/economy/town';
import { createGame, type GameState } from '../src/sim/state';
import { Side, Track } from '../src/sim/track/track';
import { consistStats } from '../src/sim/trains/vehicles';
import { Simulation } from '../src/sim/simulation';
import { Terrain } from '../src/sim/world/map';

function emptyWorld(): GameState {
  const s = createGame({ width: 40, height: 40, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  return s;
}

function addIndustry(state: GameState, type: string, level = 1) {
  const def = industryDef(type)!;
  const ind = {
    id: state.industries.length + 1,
    type,
    name: def.name,
    x: 5,
    y: 5,
    level,
    growth: 0,
    month: emptyIndustryMonth(),
    history: [] as number[],
  };
  state.industries.push(ind);
  return ind;
}

describe('rozwój fabryk', () => {
  it('wskaźnik: kopalnia – wywóz, przetwórnia – średnie zaopatrzenie', () => {
    const s = emptyWorld();
    const mine = addIndustry(s, 'coal_mine');
    mine.month.produced = 100;
    mine.month.transported = 80;
    expect(monthRatio(mine)).toBeCloseTo(0.8);
    const mill = addIndustry(s, 'steel_mill');
    mill.month.delivered = { ore: 50, coal: 25 }; // zapotrzebowanie 50 na każdy
    expect(monthRatio(mill)).toBeCloseTo(0.75);
  });

  it('od 75% rośnie, pomiędzy stoi, od 50% w dół spada; poziom zmienia się po 12 punktach', () => {
    const s = emptyWorld();
    const good = addIndustry(s, 'power_plant');
    const mid = addIndustry(s, 'power_plant');
    const bad = addIndustry(s, 'power_plant', 3);
    for (let m = 0; m < LEVEL_POINTS; m++) {
      good.month.delivered = { coal: 80 }; // 100%
      mid.month.delivered = { coal: 50 }; // 62,5%
      bad.month.delivered = { coal: 0 };
      monthlyEconomy(s, []);
    }
    expect(good.level).toBe(2);
    expect(mid).toMatchObject({ level: 1, growth: 0 });
    expect(bad.level).toBe(2);
  });

  it('poziom nie spada poniżej 1 ani nie rośnie ponad maksimum', () => {
    const s = emptyWorld();
    const ind = addIndustry(s, 'power_plant');
    for (let m = 0; m < 40; m++) monthlyEconomy(s, []);
    expect(ind.level).toBe(1);
    expect(ind.growth).toBeGreaterThanOrEqual(-LEVEL_POINTS);
  });

  it('przetwórnia bez dostaw pracuje na 30%, z pełnymi dostawami na 100%', () => {
    const s = emptyWorld();
    const mill = addIndustry(s, 'sawmill');
    const base = industryDef('sawmill')!.baseProduction;
    expect(monthlyProduction(mill)).toBeCloseTo(base * 0.3);
    mill.history = [1, 1, 1];
    expect(monthlyProduction(mill)).toBeCloseTo(base);
  });
});

describe('koszty miesięczne', () => {
  it('utrzymanie infrastruktury i eksploatacja pociągów poza zajezdnią', () => {
    const s = emptyWorld();
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: Array.from({ length: 10 }, (_, i) => ({ x: 1 + i, y: 3, track: Track.X })) });
    sim.enqueue({ type: 'buildDepot', x: 0, y: 3, side: Side.SE });
    sim.enqueue({ type: 'buildStation', x0: 4, y0: 3, x1: 6, y1: 3, axis: 'x' });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'grom', wagons: [] });
    sim.step();
    expect(infrastructureCost(s)).toBe(10 * MAINTENANCE.trackPiece + 3 * MAINTENANCE.stationTile + MAINTENANCE.depot);
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.step();
    sim.step();
    const money = s.money;
    monthlyEconomy(s, []);
    const last = s.finances.history[s.finances.history.length - 1]!;
    // Pociąg 2 stoi w zajezdni – nie kosztuje.
    expect(last.trains).toBe(Math.round(consistStats('iskra', ['osobowy']).runningCost / 12));
    expect(last.infrastructure).toBe(infrastructureCost(s));
    expect(s.money).toBe(money - last.trains - last.infrastructure);
    expect(s.finances.month).toEqual({ income: 0, trains: 0, infrastructure: 0, construction: 0, interest: 0 });
  });

  it('budowa i zwroty trafiają do księgi jako koszty budowy', () => {
    const s = emptyWorld();
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 2, y: 2, track: Track.X }] });
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 2, y: 2, track: Track.X }] });
    sim.step();
    expect(s.finances.month.construction).toBe(100 - 25);
  });
});

describe('rozwój miast', () => {
  it('obsługiwane miasto rośnie, nowe domy chętniej w zasięgu stacji', () => {
    const s = emptyWorld();
    s.towns.push(newTown(1, 'Testowo', 20, 20));
    s.map.house[21 * 40 + 21] = 2;
    s.map.town[21 * 40 + 21] = 1;
    const town = s.towns[0]!;
    for (let m = 0; m < 6; m++) {
      town.month.passengers = 100;
      town.month.passengersTransported = 80;
      monthlyEconomy(s, []);
    }
    // 6 miesięcy × (1 + round(3 × 0,8) = 3) budynki (domy, a przy rynku też kościół i ozdoby)
    expect(townTiles(s, town)).toHaveLength(1 + 6 * 3);
    expect(town.lastTransported).toBeCloseTo(0.8);
  });

  it('nieobsługiwane miasto rośnie rzadko', () => {
    const s = emptyWorld();
    s.towns.push(newTown(1, 'Testowo', 20, 20));
    s.map.house[21 * 40 + 21] = 2;
    s.map.town[21 * 40 + 21] = 1;
    for (let m = 0; m < 12; m++) monthlyEconomy(s, []);
    expect(townHouseCount(s, s.towns[0]!)).toBeLessThan(6);
  });
});
