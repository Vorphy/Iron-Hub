import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/data/economy';
import { serveTrainAtStation, stationAccepts } from '../src/sim/economy/cargoFlow';
import { BASE_MAX_LEVEL, emptyIndustryMonth, industryDef, MAX_INDUSTRY_LEVEL, workersNeeded } from '../src/sim/economy/industry';
import { LEVEL_POINTS, monthlyEconomy } from '../src/sim/economy/monthly';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

function world(): GameState {
  const s = createGame({ width: 50, height: 20, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  s.money = 1_000_000;
  return s;
}

function addIndustry(state: GameState, type: string, x: number, y: number, level: number) {
  const def = industryDef(type)!;
  const id = state.industries.length + 1;
  const ind = { id, type, name: def.name, x, y, level, growth: 0, month: emptyIndustryMonth(), history: [] as number[] };
  state.industries.push(ind);
  for (let dy = 0; dy < def.size[1]; dy++)
    for (let dx = 0; dx < def.size[0]; dx++) state.map.industry[(y + dy) * state.map.width + x + dx] = id;
  return ind;
}

/** Miesiące z pełnymi dostawami węgla i podaną liczbą pracowników. */
function months(state: GameState, ind: ReturnType<typeof addIndustry>, n: number, workers: () => number) {
  for (let m = 0; m < n; m++) {
    ind.month.delivered = { coal: 10_000 };
    ind.month.workers = workers();
    monthlyEconomy(state, []);
  }
}

describe('pracownicy – poziomy 6 i 7 zakładów', () => {
  it('od poziomu 5 potrzeba pracowników: X × poziom na miesiąc', () => {
    const s = world();
    const ind = addIndustry(s, 'power_plant', 5, 5, 4);
    expect(workersNeeded(ind)).toBe(0);
    ind.level = BASE_MAX_LEVEL;
    expect(workersNeeded(ind)).toBe(ECONOMY.industry.workersPerLevel * BASE_MAX_LEVEL);
    expect(MAX_INDUSTRY_LEVEL).toBe(BASE_MAX_LEVEL + 2);
  });

  it('bez pracowników zakład zostaje na poziomie 5, z nimi rośnie do 7 i dalej nie', () => {
    const s = world();
    const ind = addIndustry(s, 'power_plant', 5, 5, BASE_MAX_LEVEL);
    months(s, ind, LEVEL_POINTS * 2, () => 0);
    expect(ind.level).toBe(BASE_MAX_LEVEL);
    months(s, ind, LEVEL_POINTS * 4, () => workersNeeded(ind));
    expect(ind.level).toBe(MAX_INDUSTRY_LEVEL);
  });

  it('na poziomie 6 brak pracowników cofa zakład do poziomu 5 (nie niżej)', () => {
    const s = world();
    const ind = addIndustry(s, 'power_plant', 5, 5, BASE_MAX_LEVEL + 1);
    months(s, ind, LEVEL_POINTS * 3, () => 0);
    expect(ind.level).toBe(BASE_MAX_LEVEL);
  });

  it('stacja przy zakładzie od poziomu 5 przyjmuje pasażerów, a wysiadający to pracownicy', () => {
    const s = world();
    const plant = addIndustry(s, 'power_plant', 40, 12, 4);
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 48, 10) });
    sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
    sim.enqueue({ type: 'buildStation', x0: 4, y0: 10, x1: 7, y1: 10, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 40, y0: 10, x1: 43, y1: 10, axis: 'x' });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.processCommands();
    const [a, b] = s.stations;
    expect(stationAccepts(s, b!).has('passengers')).toBe(false);
    plant.level = BASE_MAX_LEVEL;
    expect(stationAccepts(s, b!).has('passengers')).toBe(true);

    const train = s.trains[0]!;
    train.trail = [{ x: 41, y: 10, track: Track.X, entry: Side.NE, exit: Side.SW }];
    train.loads[0] = { amount: 30, source: a!.id, loadedTick: s.tick };
    serveTrainAtStation(s, train, b!, [], true);
    expect(train.loads[0]!.amount).toBe(0);
    expect(plant.month.workers).toBe(30);
  });

  it('stary zapis (v27) dostaje zerowych pracowników', () => {
    const s = world();
    addIndustry(s, 'power_plant', 5, 5, 3);
    const data = JSON.parse(JSON.stringify(serializeState(s)));
    data.version = 27;
    delete data.industries[0].month.workers;
    expect(deserializeState(data).industries[0]!.month.workers).toBe(0);
  });
});
