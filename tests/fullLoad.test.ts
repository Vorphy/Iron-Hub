import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { FULL_LOAD_PENALTY, OCCUPIED_PLATFORM_PENALTY } from '../src/sim/config';
import { fullLoadingTrains, occupancyPenalty } from '../src/sim/trains/path';
import { buildTaken } from '../src/sim/trains/reservation';
import { emptyIndustryMonth } from '../src/sim/economy/industry';
import { serveTrainAtStation } from '../src/sim/economy/cargoFlow';
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

  it('peron z pociągiem czekającym na pełny ładunek inni omijają (bardzo duża kara w planie trasy)', () => {
    const sim = line(true);
    const t = sim.state.trains[0]!;
    for (let i = 0; i < 20_000 && t.status !== 'loading'; i++) sim.step();
    expect(t.status).toBe('loading');
    const taken = buildTaken(sim.state);
    const platform = t.trail[0]!;
    const other = 99; // inny pociąg pytający o ten odcinek
    expect(occupancyPenalty(sim.state, taken, platform, other, fullLoadingTrains(sim.state))).toBe(
      OCCUPIED_PLATFORM_PENALTY + FULL_LOAD_PENALTY,
    );
    // Bez ptaszka – zwykła kara za zajęty tor.
    t.fullLoad[t.currentOrder] = false;
    expect(occupancyPenalty(sim.state, taken, platform, other, fullLoadingTrains(sim.state))).toBe(OCCUPIED_PLATFORM_PENALTY);
    // Własny tor nie kosztuje.
    expect(occupancyPenalty(sim.state, taken, platform, t.id, fullLoadingTrains(sim.state))).toBe(0);
  });

  it('czekający na pełny ładunek po „Do zajezdni” od razu rusza i dojeżdża do zajezdni', () => {
    const sim = line(true);
    const t = sim.state.trains[0]!;
    for (let i = 0; i < 20_000 && t.status !== 'loading'; i++) sim.step();
    expect(t.status).toBe('loading');
    // Kopalnia nic nie daje – bez zjazdu pociąg stałby bez końca.
    sim.state.industries[0]!.level = 0;
    for (const load of t.loads) load.amount = 0;
    sim.enqueue({ type: 'sendToDepot', trainId: t.id });
    sim.processCommands();
    for (let i = 0; i < 5 && t.status === 'loading'; i++) sim.step();
    expect(t.status).toBe('running');
    for (let i = 0; i < 20_000 && t.status !== 'depot'; i++) sim.step();
    expect(t.status).toBe('depot');
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

describe('kolejka załadunku', () => {
  it('kto pierwszy przyjechał, ten pierwszy ładuje – późniejszy pociąg nie podbiera ładunku', () => {
    const sim = line(true);
    const { state } = sim;
    const first = state.trains[0]!;
    for (let i = 0; i < 20_000 && first.status !== 'loading'; i++) sim.step();
    expect(first.status).toBe('loading');
    const st = state.stations[0]!;
    // Drugi pociąg „stoi” na tej samej stacji, przyjechał później.
    const second = structuredClone(first);
    second.id = 2;
    second.arrivedTick = (first.arrivedTick ?? 0) + 100;
    second.loads = second.loads.map(() => ({ amount: 0, source: 0, loadedTick: 0 }));
    state.trains.push(second);
    first.loads = first.loads.map(() => ({ amount: 0, source: 0, loadedTick: 0 }));
    st.cargo.coal = { waiting: 40, lastPickup: state.tick, rating: 175, lastSpeed: 0, lastAge: 0 };

    serveTrainAtStation(state, second, st, [], false);
    expect(second.loads[0]!.amount + second.loads[1]!.amount).toBe(0);
    serveTrainAtStation(state, first, st, [], false);
    expect(first.loads[0]!.amount + first.loads[1]!.amount).toBe(40);
    // Gdy pierwszy odjedzie, kolej na drugi.
    first.status = 'running';
    st.cargo.coal.waiting = 25;
    serveTrainAtStation(state, second, st, [], false);
    expect(second.loads[0]!.amount + second.loads[1]!.amount).toBe(25);
  });
});
