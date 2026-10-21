import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { WAYPOINT_COST } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { getTrackBits, Side, Track, type TrackPiece } from '../src/sim/track/track';
import type { Train } from '../src/sim/trains/train';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/**
 * Linia y=5 (x=1..34) z mijanką na y=6 (zjazd przy x=10, powrót przy x=20), zajezdnia (0,5).
 * Stacje: A (1) x=3..6, B (2) x=13..15 na głównym torze, C (3) x=28..31.
 */
function network(): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({
    type: 'buildTrack',
    pieces: [
      ...xLine(1, 34, 5),
      { x: 10, y: 5, track: Track.Left },
      { x: 10, y: 6, track: Track.Right },
      ...xLine(11, 19, 6),
      { x: 20, y: 6, track: Track.Upper },
      { x: 20, y: 5, track: Track.Lower },
    ],
  });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 3, y0: 5, x1: 6, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 13, y0: 5, x1: 15, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 28, y0: 5, x1: 31, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

const train = (sim: Simulation): Train => sim.state.trains[0]!;

/** Jedzie, zapisując: na których stacjach stawał i po których kafelkach przejechał czołem. */
function drive(sim: Simulation, ticks: number) {
  const stops: number[] = [];
  const visited = new Set<string>();
  let wasLoading = false;
  for (let i = 0; i < ticks; i++) {
    sim.step();
    const t = train(sim);
    const h = t.trail[0];
    if (h) visited.add(`${h.x},${h.y}`);
    if (t.status === 'loading' && !wasLoading && h) stops.push(sim.state.map.station[h.y * sim.state.map.width + h.x]!);
    wasLoading = t.status === 'loading';
  }
  return { stops, visited };
}

describe('bez zatrzymania', () => {
  it('pociąg przejeżdża przez stację „bez zatrzymania” i staje na następnej', () => {
    const sim = network();
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2, 3], nonStop: [false, true, false] });
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    const { stops } = drive(sim, 3000);
    expect(stops.slice(0, 3)).toEqual([1, 3, 1]);
    expect(stops).not.toContain(2);
  });

  it('przełącznik działa na całej linii i trafia do zapisu', () => {
    const sim = network();
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2, 3] });
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.enqueue({ type: 'toggleNonStop', trainId: 2, index: 1 });
    sim.processCommands();
    expect(sim.state.trains.map((t) => t.nonStop)).toEqual([
      [false, true, false],
      [false, true, false],
    ]);
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded.trains[0]!.nonStop).toEqual([false, true, false]);
  });

  it('usunięcie stacji usuwa też jej ustawienie', () => {
    const sim = network();
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2, 3], nonStop: [false, false, true] });
    for (let x = 13; x <= 15; x++) sim.enqueue({ type: 'clearTile', x, y: 5 });
    sim.processCommands();
    expect(train(sim).orders).toEqual([1, 3]);
    expect(train(sim).nonStop).toEqual([false, true]);
  });
});

describe('punkty kontrolne', () => {
  it('budowa tylko na prostym torze; cena i rozbiórka zostawiają tor', () => {
    const sim = network();
    sim.enqueue({ type: 'buildWaypoint', x: 15, y: 8 });
    sim.enqueue({ type: 'buildWaypoint', x: 10, y: 5 });
    sim.enqueue({ type: 'buildWaypoint', x: 4, y: 5 });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['noTrack', 'blocked', 'blocked']);
    const money = sim.state.money;
    sim.enqueue({ type: 'buildWaypoint', x: 15, y: 6 });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual([]);
    expect(sim.state.money).toBe(money - WAYPOINT_COST);
    const wp = sim.state.stations.find((s) => s.waypoint)!;
    expect(wp.name).toBe('Punkt 1');
    sim.enqueue({ type: 'clearTile', x: 15, y: 6 });
    sim.processCommands();
    expect(sim.state.stations.some((s) => s.waypoint)).toBe(false);
    expect(getTrackBits(sim.state.map, 15, 6)).toBe(Track.X);
  });

  it('peron obok punktu kontrolnego tworzy nową stację, a nie rozbudowę', () => {
    const sim = network();
    sim.enqueue({ type: 'buildWaypoint', x: 15, y: 6 });
    sim.enqueue({ type: 'buildStation', x0: 16, y0: 6, x1: 18, y1: 6, axis: 'x' });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual([]);
    expect(sim.state.stations.find((s) => s.waypoint)!.tiles).toHaveLength(1);
  });

  it('wymusza trasę przez mijankę i pociąg się na nim nie zatrzymuje', () => {
    const sim = network();
    sim.enqueue({ type: 'buildWaypoint', x: 15, y: 6 });
    sim.processCommands();
    const wp = sim.state.stations.find((s) => s.waypoint)!.id;
    // Bez punktu: A → C prosto torem głównym.
    const plain = network();
    plain.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 3] });
    plain.enqueue({ type: 'startTrain', trainId: 1 });
    expect(drive(plain, 1500).visited.has('15,6')).toBe(false);

    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, wp, 3] });
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    const { stops, visited } = drive(sim, 3000);
    expect(visited.has('15,6')).toBe(true);
    expect(stops.slice(0, 3)).toEqual([1, 3, 1]);
    expect(stops).not.toContain(wp);
  });

  it('punkt kontrolny nie zbiera ładunku i trafia do zapisu', () => {
    const sim = network();
    sim.enqueue({ type: 'buildWaypoint', x: 15, y: 6 });
    sim.processCommands();
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    const wp = loaded.stations.find((s) => s.waypoint)!;
    expect(wp.tiles).toEqual([6 * 40 + 15]);
    expect(wp.cargo).toEqual({});
  });
});
