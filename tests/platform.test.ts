import { describe, expect, it } from 'vitest';
import { STATION_WAIT_TICKS } from '../src/sim/config';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { platformPenalty, platformTiles, trainTiles } from '../src/sim/trains/movement';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/** Linia y=5, stacja A (5..8, 4 kafelki) i B (22..25); pociąg z `wagons` wagonami jedzie do B. */
function run(wagons: number) {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: Array(wagons).fill('osobowy') });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [2] });
  sim.enqueue({ type: 'startTrain', trainId: 1 });
  sim.processCommands();
  const t = state.trains[0]!;
  for (let i = 0; i < 6000 && t.status !== 'loading'; i++) sim.step();
  return { state, t };
}

describe('długość pociągu i peronu', () => {
  it('dwa pojazdy na kafelek', () => {
    const { t } = run(3);
    expect(trainTiles(t)).toBe(2); // lokomotywa + 3 wagony
  });

  it('mieści się na peronie – zwykły postój; wystaje – dłuższy proporcjonalnie, najwyżej 2×', () => {
    const fits = run(7); // 8 pojazdów = 4 kafelki na 4-kafelkowym peronie
    expect(fits.t.status).toBe('loading');
    expect(platformTiles(fits.state, fits.t)).toBe(4);
    expect(platformPenalty(fits.state, fits.t)).toBe(1);

    const long = run(9); // 10 pojazdów = 5 kafelków
    expect(platformPenalty(long.state, long.t)).toBe(1.25);
    expect(long.t.waitTicks).toBeGreaterThan(STATION_WAIT_TICKS);
    expect(long.t.waitTicks).toBeLessThanOrEqual(Math.round(STATION_WAIT_TICKS * 1.25));
  });
});
