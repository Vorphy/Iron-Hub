import { describe, expect, it } from 'vitest';
import { SIGNAL_COST } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { piecesConflict } from '../src/sim/trains/reservation';
import type { Train } from '../src/sim/trains/train';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/** Żadne dwa pociągi nie zajmują ani nie rezerwują kolidujących elementów toru. */
function expectNoConflicts(sim: Simulation): void {
  const W = sim.state.map.width;
  const owners = new Map<number, { track: number; train: number }[]>();
  for (const t of sim.state.trains) {
    if (t.status === 'depot') continue;
    for (const s of [...t.trail, ...t.reservedAhead]) {
      const i = s.y * W + s.x;
      for (const o of owners.get(i) ?? []) {
        if (o.train !== t.id && piecesConflict(o.track, s.track)) {
          throw new Error(`Kolizja pociągów ${o.train} i ${t.id} na (${s.x},${s.y})`);
        }
      }
      owners.set(i, [...(owners.get(i) ?? []), { track: s.track, train: t.id }]);
    }
  }
}

/** Linia y=5: zajezdnia (0,5)→SE, tor x=1..30, stacja A x=5..8, stacja B x=22..25. */
function lineSim(): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1 });
  state.map.terrain.fill(Terrain.Grass);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.step();
  return sim;
}

function addTrain(sim: Simulation, depotId: number, orders: number[]): Train {
  sim.enqueue({ type: 'buyTrain', depotId, engine: 'iskra', wagons: ['osobowy', 'osobowy'] });
  sim.step();
  const t = sim.state.trains[sim.state.trains.length - 1]!;
  sim.enqueue({ type: 'setOrders', trainId: t.id, orders });
  sim.enqueue({ type: 'startTrain', trainId: t.id });
  return t;
}

function run(sim: Simulation, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    sim.step();
    expectNoConflicts(sim);
    each?.();
  }
}

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

describe('kolizje elementów toru', () => {
  it('równoległe łuki się nie kolidują, wspólny bok i krzyżowanie tak', () => {
    expect(piecesConflict(Track.Upper, Track.Lower)).toBe(false);
    expect(piecesConflict(Track.Left, Track.Right)).toBe(false);
    expect(piecesConflict(Track.X, Track.Y)).toBe(true);
    expect(piecesConflict(Track.X, Track.Upper)).toBe(true);
    expect(piecesConflict(Track.Upper, Track.Left)).toBe(true);
    expect(piecesConflict(Track.X, Track.X)).toBe(true);
    expect(piecesConflict(0, Track.X)).toBe(false);
    expect(piecesConflict(0, 0)).toBe(true);
  });
});

describe('tryb Amator (automatyczna sygnalizacja)', () => {
  it('dwa pociągi do tej samej stacji: drugi czeka za pierwszym, bez kolizji', () => {
    const sim = lineSim();
    const a = addTrain(sim, 1, [2]);
    const b = addTrain(sim, 1, [2]);
    run(sim, 3000);
    expect(a.status).toBe('loading');
    expect(b.status).toBe('running');
    expect(sim.planner.isWaiting(b.id)).toBe(true);
    // Drugi stoi tuż przed peronem zajętym przez pierwszego.
    expect(b.trail[0]!.x).toBeLessThan(a.trail[a.trail.length - 1]!.x);
    expect(b.trail[0]!.x).toBeGreaterThan(15);
  });

  it('pociągi naprzeciw siebie na jednym torze stają, ale się nie zderzają', () => {
    const sim = lineSim();
    sim.enqueue({ type: 'buildDepot', x: 31, y: 5, side: Side.NW });
    sim.step();
    const a = addTrain(sim, 1, [2]);
    const b = addTrain(sim, 2, [1]);
    run(sim, 3000);
    // Zakleszczenie jak w OpenTTD: oba czekają.
    expect(sim.planner.isWaiting(a.id) || a.status === 'loading').toBe(true);
    expect(sim.planner.isWaiting(b.id) || b.status === 'loading').toBe(true);
  });

  it('na stacji z dwoma peronami drugi pociąg wybiera wolny peron', () => {
    const state = createGame({ width: 40, height: 12, seed: 1 });
    state.map.terrain.fill(Terrain.Grass);
    const sim = new Simulation(state);
    // Mijanka: zjazd na y=6 przy x=10, powrót na y=5 przy x=20.
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
    sim.enqueue({ type: 'buildStation', x0: 13, y0: 5, x1: 16, y1: 6, axis: 'x' });
    sim.step();
    expect(fails(sim)).toEqual([]);
    const a = addTrain(sim, 1, [1]);
    const b = addTrain(sim, 1, [1]);
    let together = false;
    run(sim, 3000, () => {
      if (a.status === 'loading' && b.status === 'loading') together = true;
    });
    expect(together).toBe(true);
    expect(new Set([a.trail[0]!.y, b.trail[0]!.y])).toEqual(new Set([5, 6]));
  });
});

describe('tryb Ekspert (semafory gracza)', () => {
  it('bez semaforów drugi pociąg czeka w zajezdni, z semaforem podjeżdża pod niego', () => {
    const sim = lineSim();
    sim.enqueue({ type: 'setSignalMode', mode: 'manual' });
    const a = addTrain(sim, 1, [2]);
    const b = addTrain(sim, 1, [2]);
    run(sim, 2500);
    expect(a.status).toBe('loading');
    expect(b.trail[0]!.track).toBe(0); // wciąż w wyjeździe z zajezdni

    sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: false });
    run(sim, 1500);
    expect(b.trail[0]).toMatchObject({ x: 15, y: 5 });
    expect(b.speed).toBe(0);
  });

  it('semafor jednokierunkowy zabrania jazdy pod prąd', () => {
    const sim = lineSim();
    sim.enqueue({ type: 'setSignalMode', mode: 'manual' });
    // Dwa kliknięcia: kierunek 1 (na wschód) → 2 (na zachód).
    sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: true });
    sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: true });
    const a = addTrain(sim, 1, [2]);
    run(sim, 300);
    expect(sim.state.signals[0]!.dirs).toBe(2);
    expect(sim.planner.isLost(a.id)).toBe(true);
  });
});

describe('semafory – budowa', () => {
  it('kolejne kliknięcia zmieniają kierunek, rozbiórka toru usuwa semafor', () => {
    const sim = lineSim();
    const money = sim.state.money;
    for (let i = 0; i < 4; i++) sim.enqueue({ type: 'placeSignal', x: 12, y: 5, track: Track.X, oneWay: false });
    sim.step();
    expect(sim.state.signals).toEqual([{ x: 12, y: 5, track: Track.X, dirs: 1, oneWay: false }]); // 1→2→3→1
    expect(sim.state.money).toBe(money - SIGNAL_COST);
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 12, y: 5, track: Track.X }] });
    sim.step();
    expect(sim.state.signals).toEqual([]);
  });

  it('nie wolno stawiać semafora na peronie ani bez toru', () => {
    const sim = lineSim();
    sim.enqueue({ type: 'placeSignal', x: 6, y: 5, track: Track.X, oneWay: false });
    sim.enqueue({ type: 'placeSignal', x: 12, y: 5, track: Track.Y, oneWay: false });
    sim.step();
    expect(fails(sim)).toEqual(['blocked', 'blocked']);
  });
});

describe('zapis z rezerwacjami i semaforami', () => {
  it('wczytana gra z kilkoma pociągami toczy się identycznie', () => {
    const sim = lineSim();
    sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: false });
    addTrain(sim, 1, [1, 2]);
    addTrain(sim, 1, [2]);
    run(sim, 900);
    const b = new Simulation(deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state)))));
    for (let i = 0; i < 2000; i++) {
      sim.step();
      b.step();
    }
    expect(serializeState(b.state)).toEqual(serializeState(sim.state));
  });
});
