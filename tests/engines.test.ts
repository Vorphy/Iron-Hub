import { describe, expect, it } from 'vitest';
import { CATENARY_COST } from '../src/sim/config';
import type { SimEvent } from '../src/sim/commands';
import { infrastructureCost, monthlyEconomy } from '../src/sim/economy/monthly';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { DAYS_PER_MONTH, gameDate, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { availableEngines, ENGINES } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const YEAR_TICKS = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;
const ids = (year: number) => availableEngines(year).map((e) => e.id);
const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/** Linia y=5: zajezdnia (0,5), tor 1..30, stacje A (5..8) i B (22..25). */
function line(startYear: number, engine: string): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true, startYear });
  state.map.terrain.fill(Terrain.Grass);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine, wagons: ['osobowy'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  sim.processCommands();
  expect(fails(sim)).toEqual([]);
  return sim;
}

const tilesX = (x0: number, x1: number, y: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));

describe('lokomotywy z biegiem lat', () => {
  it('w sprzedaży zależnie od roku: parowe → spalinowe → elektryczne', () => {
    expect(ids(1900)).toEqual(['iskra']);
    expect(ids(1950)).toContain('bizon');
    expect(ids(1950)).not.toContain('elektra');
    expect(ids(1960)).toContain('elektra');
    expect(ids(1960)).not.toContain('iskra'); // wycofana
    expect(ids(2010)).toContain('blyskawica');
    expect(ids(2010).some((id) => ENGINES.find((e) => e.id === id)!.traction === 'steam')).toBe(false);
    // Każdego roku od 1900 jest co kupić.
    for (let y = 1900; y <= 2100; y++) expect(availableEngines(y).length).toBeGreaterThan(0);
    // Najszybsza dostępna z czasem nie zwalnia.
    let best = 0;
    for (let y = 1900; y <= 2050; y++) {
      const fastest = Math.max(...availableEngines(y).map((e) => e.maxSpeed));
      expect(fastest).toBeGreaterThanOrEqual(best);
      best = fastest;
    }
  });

  it('nie da się kupić lokomotywy spoza sprzedaży', () => {
    const state = createGame({ width: 16, height: 16, seed: 1, empty: true, startYear: 1950 });
    state.map.terrain.fill(Terrain.Grass);
    const sim = new Simulation(state);
    sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'blyskawica', wagons: [] });
    sim.processCommands();
    expect(fails(sim)).toEqual(['notAvailable']);
    expect(state.trains).toHaveLength(0);
  });

  it('rok startu ustawia kalendarz; nowy rok ogłasza nowości', () => {
    const state = createGame({ width: 16, height: 16, seed: 1, empty: true, startYear: 1954 });
    expect(gameDate(state)).toEqual({ year: 1954, month: 1, day: 1 });
    state.tick = YEAR_TICKS; // 1 stycznia 1955
    const events: SimEvent[] = [];
    monthlyEconomy(state, events);
    expect(events).toContainEqual({ type: 'newEngines', engines: ['elektra'] });
  });
});

describe('sieć trakcyjna', () => {
  it('budowa za opłatą, zdjęcie ze zwrotem, znika razem z torem, liczy się do utrzymania', () => {
    const sim = line(1960, 'bizon');
    const s = sim.state;
    const money = s.money;
    const upkeep = infrastructureCost(s);
    sim.enqueue({ type: 'buildCatenary', tiles: tilesX(10, 14, 5) });
    sim.processCommands();
    expect(s.money).toBe(money - 5 * CATENARY_COST);
    expect(infrastructureCost(s)).toBeGreaterThan(upkeep);
    // Drugi raz to samo – już jest.
    sim.enqueue({ type: 'buildCatenary', tiles: tilesX(10, 14, 5) });
    sim.processCommands();
    expect(fails(sim)).toEqual(['alreadyBuilt']);
    // Poza torem – nic do zrobienia.
    sim.enqueue({ type: 'buildCatenary', tiles: [{ x: 3, y: 9 }] });
    sim.processCommands();
    expect(fails(sim)).toEqual(['noTrack']);
    sim.enqueue({ type: 'removeCatenary', tiles: tilesX(10, 10, 5) });
    sim.processCommands();
    expect(s.map.electric[5 * 40 + 10]).toBe(0);
    // Rozbiórka toru zabiera sieć.
    sim.enqueue({ type: 'removeTrack', pieces: xLine(12, 12, 5) });
    sim.processCommands();
    expect(s.map.electric[5 * 40 + 12]).toBe(0);
    expect(s.map.electric[5 * 40 + 13]).toBe(1);
  });

  it('elektryczna nie wyjedzie z zajezdni bez sieci', () => {
    const sim = line(1960, 'elektra');
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.processCommands();
    expect(fails(sim)).toEqual(['noCatenary']);
  });

  it('elektryczna jeździ tylko pod siecią', () => {
    const run = (gapAt: number | null) => {
      const sim = line(1960, 'elektra');
      sim.enqueue({ type: 'buildCatenary', tiles: tilesX(0, 30, 5) });
      if (gapAt !== null) sim.enqueue({ type: 'removeCatenary', tiles: tilesX(gapAt, gapAt, 5) });
      sim.enqueue({ type: 'startTrain', trainId: 1 });
      sim.processCommands();
      expect(fails(sim)).toEqual([]);
      let reachedB = false;
      for (let i = 0; i < 4000 && !reachedB; i++) {
        sim.step();
        const h = sim.state.trains[0]!.trail[0];
        if (h && h.x >= 22) reachedB = true;
        // Nigdy nie wjeżdża na kafelek bez sieci.
        for (const st of sim.state.trains[0]!.trail) expect(sim.state.map.electric[st.y * 40 + st.x]).toBe(1);
      }
      return reachedB;
    };
    expect(run(null)).toBe(true);
    expect(run(15)).toBe(false);
  });

  it('spalinowa jeździ po każdym torze; sieć przechodzi przez zapis', () => {
    const sim = line(1960, 'bizon');
    sim.enqueue({ type: 'buildCatenary', tiles: tilesX(3, 6, 5) });
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.processCommands();
    for (let i = 0; i < 3000; i++) sim.step();
    expect(sim.state.trains[0]!.status).not.toBe('depot');
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded.map.electric).toEqual(sim.state.map.electric);
    expect(loaded.startYear).toBe(1960);
  });

  it('stary zapis (v11) dostaje rok 1950 i tory bez sieci', () => {
    const data = JSON.parse(JSON.stringify(serializeState(line(1960, 'bizon').state)));
    data.version = 11;
    delete data.startYear;
    delete data.map.electric;
    const loaded = deserializeState(data);
    expect(loaded.startYear).toBe(1950);
    expect(loaded.map.electric.every((v) => v === 0)).toBe(true);
  });
});
