import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { LOST_REPORT_DAYS } from '../src/sim/trains/movement';
import { TICKS_PER_DAY } from '../src/sim/time';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/** Linia y=5 ze stacją A i osobny kawałek toru y=9 ze stacją B – do B nie da się dojechać. */
function lostSim(): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 20, 5) });
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 20, 9) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 9, x1: 8, y1: 9, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.step();
  const train = sim.state.trains[0]!;
  sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2, 1] });
  sim.enqueue({ type: 'startTrain', trainId: train.id });
  sim.step();
  expect(sim.drainEvents().filter((e) => e.type === 'commandFailed')).toEqual([]);
  return sim;
}

const lostEvents = (events: SimEvent[]) => events.filter((e) => e.type === 'trainLost');

describe('zgubiony pociąg', () => {
  it(`komunikat raz, po ${LOST_REPORT_DAYS} dniach bez trasy do celu`, () => {
    const sim = lostSim();
    const events: SimEvent[] = [];
    for (let t = 0; t < (LOST_REPORT_DAYS - 1) * TICKS_PER_DAY; t++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(sim.planner.isLost(1)).toBe(true);
    expect(lostEvents(events)).toEqual([]);
    for (let t = 0; t < 10 * TICKS_PER_DAY; t++) {
      sim.step();
      events.push(...sim.drainEvents());
    }
    expect(lostEvents(events)).toEqual([{ type: 'trainLost', trainId: 1 }]);
  });

  it('po naprawie trasy pociąg przestaje być zgubiony i może być zgłoszony znowu', () => {
    const planner = lostSim().planner;
    const day = TICKS_PER_DAY;
    expect(planner.setLost(7, true, 0)).toBe(false);
    expect(planner.setLost(7, true, LOST_REPORT_DAYS * day)).toBe(true);
    expect(planner.setLost(7, true, 2 * LOST_REPORT_DAYS * day)).toBe(false);
    expect(planner.setLost(7, false)).toBe(false);
    expect(planner.isLost(7)).toBe(false);
    expect(planner.setLost(7, true, 100 * day)).toBe(false);
    expect(planner.setLost(7, true, (100 + LOST_REPORT_DAYS) * day)).toBe(true);
  });
});
