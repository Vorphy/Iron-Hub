import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { STRAIGHT_LENGTH } from '../src/sim/track/graph';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { trainLength } from '../src/sim/trains/geometry';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/**
 * Stacja docelowa z dwoma peronami: długi y=5 (x=20..25) i krótki y=6 (x=20..21, bliżej).
 * Rozjazd przy x=10, zajezdnia (0,5), stacja startowa A x=3..6.
 */
function twoPlatforms(wagons: number) {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({
    type: 'buildTrack',
    pieces: [...xLine(1, 25, 5), { x: 10, y: 5, track: Track.Left }, { x: 10, y: 6, track: Track.Right }, ...xLine(11, 21, 6)],
  });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 3, y0: 5, x1: 6, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 20, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 20, y0: 6, x1: 21, y1: 6, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: Array(wagons).fill('osobowy') });
  sim.processCommands();
  expect(sim.state.stations).toHaveLength(2);
  const train = sim.state.trains[0]!;
  sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2] });
  sim.enqueue({ type: 'startTrain', trainId: train.id });
  return { sim, train };
}

/** Wiersz peronu (y), na którym pociąg pierwszy raz stanął do załadunku. */
function firstStopRow(sim: Simulation): number | null {
  const train = sim.state.trains[0]!;
  for (let t = 0; t < 4000; t++) {
    sim.step();
    if (train.status === 'loading') return train.trail[0]!.y;
  }
  return null;
}

describe('kary stacyjne jak w OpenTTD', () => {
  it('krótki skład staje na bliższym krótkim peronie', () => {
    const { sim, train } = twoPlatforms(1);
    expect(Math.ceil(trainLength(train) / STRAIGHT_LENGTH)).toBeLessThanOrEqual(2);
    expect(firstStopRow(sim)).toBe(6);
  });

  it('długi skład wybiera długi peron, choć dalej', () => {
    const { sim, train } = twoPlatforms(5);
    expect(Math.ceil(trainLength(train) / STRAIGHT_LENGTH)).toBeGreaterThan(2);
    expect(firstStopRow(sim)).toBe(5);
  });
});
