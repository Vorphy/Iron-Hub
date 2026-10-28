import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { vertexIndex } from '../src/sim/world/height';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/**
 * Linia y=5 (x=1..30) z mijanką y=6 (x=10..20), zajezdnia (0,5), stacje na końcach.
 * Jeden pociąg ze stacji zachodniej na wschodnią; zwraca wiersze, którymi jechał przez x=15.
 */
function loopLine(setup?: (sim: Simulation) => void) {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({
    type: 'buildTrack',
    pieces: [
      ...xLine(1, 30, 5),
      { x: 10, y: 5, track: Track.Left },
      { x: 10, y: 6, track: Track.Right },
      ...xLine(11, 19, 6),
      { x: 20, y: 6, track: Track.Upper },
      { x: 20, y: 5, track: Track.Lower },
    ],
  });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 2, y0: 5, x1: 4, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 26, y0: 5, x1: 28, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.processCommands();
  setup?.(sim);
  const train = sim.state.trains[0]!;
  sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2] });
  sim.enqueue({ type: 'startTrain', trainId: train.id });
  const rows = new Set<number>();
  for (let t = 0; t < 6000 && train.status !== 'loading'; t++) {
    sim.step();
    for (const s of train.trail) if (s.x === 15) rows.add(s.y);
  }
  expect(train.status).toBe('loading');
  return [...rows];
}

describe('kary w wyszukiwaniu trasy jak w YAPF', () => {
  it('bez przeszkód pociąg jedzie prosto, bez łuków mijanki', () => {
    expect(loopLine()).toEqual([5]);
  });

  it('pagórek na prostej – pociąg wybiera płaską mijankę', () => {
    expect(
      loopLine((sim) => {
        // Narożniki po północnej stronie kafelków y=5 (x=14..15) o poziom wyżej: wjazd pod górę na x=13.
        const m = sim.state.map;
        for (const vx of [14, 15]) m.heights[vertexIndex(m, vx, 5)] = 1;
      }),
    ).toEqual([6]);
  });

  it('semafor ścieżkowy pod prąd na prostej – pociąg jedzie mijanką', () => {
    expect(
      loopLine((sim) => {
        sim.enqueue({ type: 'setSignalMode', mode: 'manual' });
        // Semafor tylko dla jazdy na zachód (kierunek 2) na prostej i dla jazdy na wschód na mijance.
        sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: false });
        sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: false });
        sim.enqueue({ type: 'placeSignal', x: 15, y: 6, track: Track.X, oneWay: false });
        sim.processCommands();
      }),
    ).toEqual([6]);
  });
});
