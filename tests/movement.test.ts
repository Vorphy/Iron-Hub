import { describe, expect, it } from 'vitest';
import { BEND_SPEED } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { trainLength, vehiclePoses } from '../src/sim/trains/geometry';
import { reverseTrain } from '../src/sim/trains/movement';
import { stepLength } from '../src/sim/trains/steps';
import type { Train } from '../src/sim/trains/train';
import { engineDef } from '../src/sim/trains/vehicles';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/**
 * Linia na y=5: zajezdnia (0,5) z wjazdem SE, tor x=1..30,
 * stacja A na x=5..8, stacja B na x=22..25.
 */
function lineSim(engine = 'iskra', wagons = ['osobowy', 'osobowy']): { sim: Simulation; train: Train } {
  const state = createGame({ width: 40, height: 12, seed: 1 });
  state.map.terrain.fill(Terrain.Grass);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine, wagons });
  sim.step();
  expect(sim.drainEvents().filter((e) => e.type === 'commandFailed')).toEqual([]);
  return { sim, train: sim.state.trains[0]! };
}

/** Kolejne stacje, na których pociąg się zatrzymał (id), w ciągu `ticks` ticków. */
function runAndRecordStops(sim: Simulation, train: Train, ticks: number): number[] {
  const stops: number[] = [];
  let wasLoading = false;
  for (let i = 0; i < ticks; i++) {
    sim.step();
    expect(train.speed).toBeLessThanOrEqual(engineDef(train.engine)!.maxSpeed + 1e-9);
    expectTrailCoversTrain(train);
    const loading = train.status === 'loading';
    if (loading && !wasLoading) {
      const h = train.trail[0]!;
      stops.push(sim.state.map.station[h.y * sim.state.map.width + h.x]!);
    }
    wasLoading = loading;
  }
  return stops;
}

function expectTrailCoversTrain(train: Train): void {
  if (train.status === 'depot') return;
  const covered = train.progress + train.trail.slice(1).reduce((d, s) => d + stepLength(s), 0);
  // Przy wyjeździe z zajezdni część składu jest jeszcze w środku.
  const leavingDepot = train.trail[train.trail.length - 1]!.track === 0;
  if (!leavingDepot) expect(covered).toBeGreaterThanOrEqual(trainLength(train) - 1e-6);
}

describe('ruch pociągu', () => {
  it('wyjeżdża z zajezdni i kursuje A → B → A → B, zatrzymując się na końcu peronu', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [1, 2] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    const stops = runAndRecordStops(sim, train, 4000);
    expect(stops.slice(0, 4)).toEqual([1, 2, 1, 2]);
  });

  it('zatrzymuje się czołem na ostatnim kafelku peronu w kierunku jazdy', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2, 1] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 4000 && train.status !== 'loading'; i++) sim.step();
    expect(train.trail[0]).toMatchObject({ x: 25, y: 5, exit: Side.SE });
    expect(train.progress).toBeCloseTo(stepLength(train.trail[0]!));
    // Po postoju zawraca (B jest na końcu w kierunku jazdy, A za pociągiem) i staje na x=5 w stronę NW.
    for (let i = 0; i < 400 && train.status === 'loading'; i++) sim.step();
    for (let i = 0; i < 4000 && train.status !== 'loading'; i++) sim.step();
    expect(train.trail[0]).toMatchObject({ x: 5, y: 5, exit: Side.NW });
  });

  it('bez rozkładu jeździ tam i z powrotem, nie wjeżdżając do zajezdni', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    let reversals = 0;
    let lastReversed = train.reversed;
    for (let i = 0; i < 5000; i++) {
      sim.step();
      expect(train.status).toBe('running');
      if (train.reversed !== lastReversed) reversals++;
      lastReversed = train.reversed;
    }
    expect(reversals).toBeGreaterThanOrEqual(2);
  });

  it('wraca do zajezdni na polecenie', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 600; i++) sim.step();
    sim.enqueue({ type: 'sendToDepot', trainId: train.id });
    for (let i = 0; i < 5000 && train.status !== 'depot'; i++) sim.step();
    expect(train).toMatchObject({ status: 'depot', depotId: 1, trail: [], goToDepot: false });
  });

  it('zatrzymany przez gracza hamuje do zera i rusza po wznowieniu', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 300; i++) sim.step();
    expect(train.speed).toBeGreaterThan(20);
    sim.enqueue({ type: 'stopTrain', trainId: train.id });
    for (let i = 0; i < 200; i++) sim.step();
    expect(train.speed).toBe(0);
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 50; i++) sim.step();
    expect(train.speed).toBeGreaterThan(0);
  });

  it('nie dojedzie do stacji na odciętej linii – oznacza się jako zgubiony', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'buildTrack', pieces: xLine(2, 6, 9) });
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 9, x1: 4, y1: 9, axis: 'x' });
    sim.step();
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [3] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 200; i++) sim.step();
    expect(sim.planner.isLost(train.id)).toBe(true);
    expect(train.status).toBe('running');
  });

  it('nie można rozebrać toru pod pociągiem', () => {
    const { sim, train } = lineSim();
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 500; i++) sim.step();
    sim.enqueue({ type: 'stopTrain', trainId: train.id });
    for (let i = 0; i < 300; i++) sim.step();
    sim.drainEvents();
    expect(sim.state.map.station[train.trail[0]!.y * 40 + train.trail[0]!.x]).toBe(0);
    const h = train.trail[0]!;
    sim.enqueue({ type: 'clearTile', x: h.x, y: h.y });
    sim.enqueue({ type: 'removeTrack', pieces: xLine(1, 30, 5) });
    sim.step();
    const fails = sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
    expect(fails).toEqual(['trainInWay', 'trainInWay']);
  });

  it('zwalnia przed łukiem', () => {
    const state = createGame({ width: 40, height: 20, seed: 1 });
    state.map.terrain.fill(Terrain.Grass);
    const sim = new Simulation(state);
    // Długa prosta, potem ukos z łuków (pierwszy łuk na (21,10)).
    const diag: TrackPiece[] = [];
    let x = 21;
    let y = 10;
    for (let i = 0; i < 8; i++) {
      diag.push({ x, y, track: Track.Upper }, { x, y: y - 1, track: Track.Lower });
      x++;
      y--;
    }
    sim.enqueue({ type: 'buildTrack', pieces: [...xLine(1, 20, 10), ...diag] });
    sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'strzala', wagons: [] });
    sim.step();
    const train = sim.state.trains[0]!;
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    let maxSpeed = 0;
    let speedAtBend = -1;
    for (let i = 0; i < 2000 && speedAtBend < 0; i++) {
      sim.step();
      maxSpeed = Math.max(maxSpeed, train.speed);
      if (train.trail[0]!.x === 21 && train.trail[0]!.track === Track.Upper) speedAtBend = train.speed;
    }
    expect(maxSpeed).toBeGreaterThan(BEND_SPEED + 10);
    expect(speedAtBend).toBeGreaterThan(0);
    expect(speedAtBend).toBeLessThanOrEqual(BEND_SPEED + 1);
  });
});

describe('zawracanie', () => {
  it('pojazdy zostają w tym samym miejscu, zmienia się tylko kierunek', () => {
    const { sim, train } = lineSim('iskra', ['osobowy', 'kryty', 'weglarka']);
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [2] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 700; i++) sim.step();
    const before = vehiclePoses(train);
    reverseTrain(train);
    const after = vehiclePoses(train);
    expect(after).toHaveLength(before.length);
    for (const b of before) {
      const a = after.find((p) => p.index === b.index)!;
      expect(a.front.x).toBeCloseTo(b.back.x, 6);
      expect(a.front.y).toBeCloseTo(b.back.y, 6);
      expect(a.back.x).toBeCloseTo(b.front.x, 6);
    }
  });
});

describe('determinizm z pociągami', () => {
  it('gra wczytana w trakcie jazdy toczy się identycznie', () => {
    const { sim: a, train } = lineSim('grom', ['weglarka', 'weglarka', 'weglarka']);
    a.enqueue({ type: 'setOrders', trainId: train.id, orders: [1, 2] });
    a.enqueue({ type: 'startTrain', trainId: train.id });
    for (let i = 0; i < 777; i++) a.step();
    const b = new Simulation(deserializeState(JSON.parse(JSON.stringify(serializeState(a.state)))));
    for (let i = 0; i < 3000; i++) {
      a.step();
      b.step();
    }
    expect(serializeState(b.state)).toEqual(serializeState(a.state));
  });
});
