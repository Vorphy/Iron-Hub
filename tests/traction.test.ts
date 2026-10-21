import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { trainLength } from '../src/sim/trains/geometry';
import { consistStats, engineDef } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
const HEAVY = Array.from({ length: 10 }, () => 'weglarka');

/** Prosty tor y=5 z zajezdnią (0,5); pociąg Iskra z 10 węglarkami (`engines` lokomotyw). */
function line(engines: number): Simulation {
  const state = createGame({ width: 60, height: 12, seed: 1, empty: true, startYear: 1920 });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 58, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: HEAVY, engineCount: engines });
  sim.processCommands();
  expect(fails(sim.drainEvents())).toEqual([]);
  return sim;
}

const train = (sim: Simulation) => sim.state.trains[0]!;

describe('podwójna trakcja', () => {
  it('dwie lokomotywy: 2× cena, moc, masa lokomotyw i utrzymanie; prędkość maksymalna bez zmian', () => {
    const one = consistStats('iskra', HEAVY, 1);
    const two = consistStats('iskra', HEAVY, 2);
    const e = engineDef('iskra')!;
    expect(two.cost - one.cost).toBe(e.cost);
    expect(two.power).toBe(2 * e.power);
    expect(two.engineWeight).toBe(2 * e.weight);
    expect(two.length - one.length).toBe(e.length);
    expect(two.maxSpeed).toBe(one.maxSpeed);
    expect(two.runningCost).toBeGreaterThan(one.runningCost);
  });

  it('zakup z dwiema lokomotywami pobiera cenę obu; skład jest dłuższy', () => {
    const a = line(1);
    const b = line(2);
    expect(a.state.money - b.state.money).toBe(engineDef('iskra')!.cost);
    expect(train(b).engineCount).toBe(2);
    expect(trainLength(train(b))).toBeGreaterThan(trainLength(train(a)));
  });

  it('w zajezdni można dopiąć i odpiąć drugą lokomotywę', () => {
    const sim = line(1);
    const money = sim.state.money;
    sim.enqueue({ type: 'setEngineCount', trainId: 1, count: 2 });
    sim.processCommands();
    expect(train(sim).engineCount).toBe(2);
    expect(sim.state.money).toBe(money - engineDef('iskra')!.cost);
    sim.enqueue({ type: 'setEngineCount', trainId: 1, count: 3 });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['tooBig']);
    sim.enqueue({ type: 'setEngineCount', trainId: 1, count: 1 });
    sim.processCommands();
    expect(train(sim).engineCount).toBe(1);
    // Zwrot za nową lokomotywę: 75% ceny.
    expect(sim.state.money).toBe(money - engineDef('iskra')!.cost + Math.round(engineDef('iskra')!.cost * 0.75));
  });

  it('poza zajezdnią skład się nie zmienia', () => {
    const sim = line(1);
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 10; i++) sim.step();
    sim.enqueue({ type: 'setEngineCount', trainId: 1, count: 2 });
    sim.processCommands();
    expect(fails(sim.drainEvents())).toEqual(['notInDepot']);
  });

  it('ciężki skład z dwiema lokomotywami szybciej się rozpędza', () => {
    const a = line(1);
    const b = line(2);
    for (const sim of [a, b]) {
      sim.enqueue({ type: 'startTrain', trainId: 1 });
      for (let i = 0; i < 40; i++) sim.step();
    }
    expect(train(b).speed).toBeGreaterThan(train(a).speed * 1.15);
  });

  it('zapis i odczyt zachowuje liczbę lokomotyw', () => {
    const sim = line(2);
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded.trains[0]!.engineCount).toBe(2);
  });
});
