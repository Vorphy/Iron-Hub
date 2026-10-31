import { describe, expect, it } from 'vitest';
import { STATION_WAIT_TICKS } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { spacingHold } from '../src/sim/trains/movement';
import { lineHeadway } from '../src/sim/trains/train';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

function line(): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  sim.processCommands();
  return sim;
}

describe('rozkład czasowy', () => {
  it('przeciąganie pozycji rozkładu: opcje jadą z nią, pociąg dalej jedzie do tej samej stacji (cała linia)', () => {
    const sim = line();
    sim.enqueue({ type: 'buildStation', x0: 12, y0: 5, x1: 14, y1: 5, axis: 'x' });
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2, 3], fullLoad: [false, true, false], waitDays: [0, 0, 5] });
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    const [a, b] = sim.state.trains;
    a!.currentOrder = 2;
    b!.currentOrder = 0;
    sim.enqueue({ type: 'moveOrder', trainId: 1, from: 2, to: 0 });
    sim.processCommands();
    for (const t of [a!, b!]) {
      expect(t.orders).toEqual([3, 1, 2]);
      expect(t.fullLoad).toEqual([false, false, true]);
      expect(t.waitDays).toEqual([5, 0, 0]);
    }
    expect(a!.orders[a!.currentOrder]).toBe(3);
    expect(b!.orders[b!.currentOrder]).toBe(1);
    sim.enqueue({ type: 'moveOrder', trainId: 1, from: 0, to: 3 });
    sim.processCommands();
    expect(a!.orders).toEqual([3, 1, 2]);
  });

  it('dodatkowy postój przy stacji wydłuża postój o tyle dni (dla całej linii)', () => {
    const sim = line();
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.enqueue({ type: 'setWaitDays', trainId: 1, index: 1, days: 3 });
    sim.processCommands();
    const [a, b] = sim.state.trains;
    expect(b!.waitDays).toEqual([0, 3]);
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.processCommands();
    for (let i = 0; i < 8000 && !(a!.status === 'loading' && a!.currentOrder === 1); i++) sim.step();
    expect(a!.waitTicks).toBeGreaterThanOrEqual(STATION_WAIT_TICKS + 3 * TICKS_PER_DAY - 1);
  });

  it('równe odstępy: odstęp = okrążenie / liczba pociągów, czeka tylko na pierwszej stacji', () => {
    const sim = line();
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.enqueue({ type: 'setSpacing', trainId: 2, on: true });
    sim.processCommands();
    const [a, b] = sim.state.trains;
    expect(a!.spacing).toBe(true);
    expect(lineHeadway(sim.state, a!)).toBe(0); // jeszcze nikt nie objechał linii
    a!.loopTicks = 4000;
    b!.loopTicks = 4000;
    expect(lineHeadway(sim.state, a!)).toBe(2000);
    a!.departedFirstTick = 1000;
    sim.state.tick = 1500;
    b!.currentOrder = 0;
    b!.stopped = false; // w trasie (zatrzymany przez gracza nie czeka na odstęp)
    expect(spacingHold(sim.state, b!)).toBe(1500);
    sim.state.tick = 3100;
    expect(spacingHold(sim.state, b!)).toBe(0);
    // Na innej stacji rozkładu – bez czekania.
    sim.state.tick = 1500;
    b!.currentOrder = 1;
    expect(spacingHold(sim.state, b!)).toBe(0);
    // Wyłączone – bez czekania.
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: false });
    sim.processCommands();
    b!.currentOrder = 0;
    expect(spacingHold(sim.state, b!)).toBe(0);
  });

  it('czas okrążenia mierzony przy odjeździe z pierwszej stacji; zapis', () => {
    const sim = line();
    const t = sim.state.trains[0]!;
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.processCommands();
    for (let i = 0; i < 30_000 && t.loopTicks === 0; i++) sim.step();
    expect(t.loopTicks).toBeGreaterThan(0);
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded.trains[0]).toMatchObject({ loopTicks: t.loopTicks, waitDays: [0, 0], spacing: false });
  });
});
