import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { emptyIndustryMonth } from '../src/sim/economy/industry';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/**
 * Linia y=10: zajezdnia (0,10), tor 1..30, stacja A (5..8) przy kopalni węgla (kafelki 5..7 × 6..8),
 * stacja B (22..25). Pociąg z 2 węglarkami (i wagonem pocztowym) jeździ A–B.
 */
function line(fullLoadAtA: boolean): Simulation {
  const state = createGame({ width: 40, height: 20, seed: 1, empty: true, startYear: 1962 });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const mine = {
    id: 1,
    type: 'coal_mine',
    name: 'Kopalnia',
    x: 5,
    y: 6,
    level: 1,
    growth: 0,
    month: emptyIndustryMonth(),
    history: [],
  };
  state.industries.push(mine);
  for (let y = 6; y < 9; y++) for (let x = 5; x < 8; x++) state.map.industry[y * 40 + x] = 1;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 10) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 10, x1: 8, y1: 10, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 10, x1: 25, y1: 10, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'bizon', wagons: ['weglarka', 'weglarka', 'pocztowy'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  if (fullLoadAtA) sim.enqueue({ type: 'toggleFullLoad', trainId: 1, index: 0 });
  sim.enqueue({ type: 'startTrain', trainId: 1 });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

/** Ile węgla wiezie pociąg, gdy pierwszy raz odjeżdża ze stacji A. */
function coalOnDeparture(sim: Simulation): { coal: number; ticks: number } {
  const t = sim.state.trains[0]!;
  let wasLoading = false;
  for (let i = 0; i < 20_000; i++) {
    sim.step();
    if (t.status === 'loading') wasLoading = true;
    else if (wasLoading) return { coal: t.loads[0]!.amount + t.loads[1]!.amount, ticks: i };
  }
  return { coal: -1, ticks: -1 };
}

describe('czekaj na pełny ładunek', () => {
  it('bez ptaszka odjeżdża po zwykłym postoju; z ptaszkiem – dopiero z pełnymi węglarkami', () => {
    const normal = coalOnDeparture(line(false));
    const full = coalOnDeparture(line(true));
    expect(normal.coal).toBeLessThan(60);
    expect(full.coal).toBe(60); // 2 węglarki × 30 t; wagon pocztowy nie wstrzymuje odjazdu
    expect(full.ticks).toBeGreaterThan(normal.ticks);
  });

  it('ptaszki idą za pozycjami rozkładu: dopisanie zostawia, usunięcie stacji zabiera', () => {
    const sim = line(true);
    const t = sim.state.trains[0]!;
    expect(t.fullLoad).toEqual([true, false]);
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2, 1] });
    sim.processCommands();
    expect(t.fullLoad).toEqual([true, false, false]);
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [2, 1], fullLoad: [false, true] });
    sim.processCommands();
    expect(t.fullLoad).toEqual([false, true]);
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    expect(sim.state.trains[1]!.fullLoad).toEqual([false, true]);
  });

  it('zapis: ptaszki przechodzą; stary zapis dostaje rozkład bez ptaszków', () => {
    const sim = line(true);
    const data = JSON.parse(JSON.stringify(serializeState(sim.state)));
    expect(deserializeState(data).trains[0]!.fullLoad).toEqual([true, false]);
    data.version = 13;
    for (const t of data.trains) delete t.fullLoad;
    expect(deserializeState(data).trains[0]!.fullLoad).toEqual([false, false]);
  });
});
