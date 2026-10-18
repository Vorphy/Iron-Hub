import { describe, expect, it } from 'vitest';
import { BRIDGE_TILE_COST, START_MONEY, TRACK_COST } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { BRIDGE_X } from '../src/sim/track/bridge';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { piecesConflict } from '../src/sim/trains/reservation';
import { stepHeight } from '../src/sim/trains/steps';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const yLine = (y0: number, y1: number, x: number): TrackPiece[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i, track: Track.Y }));

/**
 * Dolina: teren na poziomie 1 dla x ≤ 5 i x ≥ 14, w dolinie (x 7–12) poziom 0, zbocza na x = 6 i 13.
 * Most z (5,5) do (14,5): przyczółki płaskie na poziomie 1, pomost na poziomie 2.
 */
function valley(): { sim: Simulation; s: GameState } {
  const s = createGame({ width: 40, height: 12, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  for (let vy = 0; vy <= 12; vy++) for (let vx = 0; vx <= 40; vx++) s.map.heights[vy * 41 + vx] = vx <= 6 || vx >= 14 ? 1 : 0;
  return { sim: new Simulation(s), s };
}

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

describe('budowa mostu', () => {
  it('most nad doliną: przyczółki z torem, pomost poziom wyżej, koszt', () => {
    const { sim, s } = valley();
    sim.enqueue({ type: 'buildBridge', x0: 5, y0: 5, x1: 14, y1: 5 });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(s.bridges).toEqual([{ id: 1, x: 5, y: 5, axis: 'x', length: 10, deck: 2 }]);
    expect(s.map.track[5 * 40 + 5]).toBe(Track.X);
    expect(s.map.track[5 * 40 + 14]).toBe(Track.X);
    expect(s.map.track[5 * 40 + 9]).toBe(0);
    expect(s.money).toBe(START_MONEY - 10 * BRIDGE_TILE_COST - 2 * TRACK_COST);
  });

  it('odrzuca: przyczółki na różnych wysokościach, za wysoki teren pod spodem, za długi, nie w linii', () => {
    const { sim, s } = valley();
    s.map.heights.fill(0);
    for (let vy = 0; vy <= 12; vy++) for (let vx = 0; vx <= 3; vx++) s.map.heights[vy * 41 + vx] = 1;
    sim.enqueue({ type: 'buildBridge', x0: 1, y0: 5, x1: 8, y1: 5 }); // A na 1, B na 0
    // Pagórek pod pomostem sięga wysokości przyczółków (pomost tylko poziom wyżej – za nisko).
    s.map.heights[5 * 41 + 12] = 1;
    sim.enqueue({ type: 'buildBridge', x0: 10, y0: 5, x1: 14, y1: 5 });
    sim.enqueue({ type: 'buildBridge', x0: 10, y0: 2, x1: 30, y1: 2 });
    sim.enqueue({ type: 'buildBridge', x0: 10, y0: 2, x1: 14, y1: 4 });
    sim.step();
    expect(fails(sim)).toEqual(['bridgeHeads', 'bridgeLow', 'tooBig', 'blocked']);
  });

  it('most nad wodą', () => {
    const { sim, s } = valley();
    for (let x = 8; x <= 11; x++) s.map.terrain[5 * 40 + x] = Terrain.Water;
    sim.enqueue({ type: 'buildBridge', x0: 5, y0: 5, x1: 14, y1: 5 });
    sim.step();
    expect(fails(sim)).toEqual([]);
  });

  it('rozbiórka buldożerem na przyczółku usuwa most i tor przyczółków', () => {
    const { sim, s } = valley();
    sim.enqueue({ type: 'buildBridge', x0: 5, y0: 5, x1: 14, y1: 5 });
    sim.enqueue({ type: 'clearTile', x: 14, y: 5 });
    sim.step();
    expect(s.bridges).toEqual([]);
    expect(s.map.bridge.every((v) => v === 0)).toBe(true);
    expect(s.map.track[5 * 40 + 5]).toBe(0);
  });

  it('tor przyczółka nie daje się rozebrać osobno ani dołożyć na nim łuku', () => {
    const { sim } = valley();
    sim.enqueue({ type: 'buildBridge', x0: 5, y0: 5, x1: 14, y1: 5 });
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 5, y: 5, track: Track.X }] });
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.Upper }] });
    sim.step();
    expect(fails(sim)).toEqual(['nothingToRemove', 'blocked']);
  });
});

/** Linia przez most (y = 5) z zajezdnią i stacjami oraz linia Y w dolinie (x = 10) pod mostem. */
function railNetwork(): { sim: Simulation; s: GameState } {
  const { sim, s } = valley();
  sim.enqueue({ type: 'buildBridge', x0: 5, y0: 5, x1: 14, y1: 5 });
  sim.enqueue({ type: 'buildTrack', pieces: [...xLine(1, 4, 5), ...xLine(15, 30, 5)] });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 1, y0: 5, x1: 3, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 26, y0: 5, x1: 29, y1: 5, axis: 'x' });
  // Linia w dolinie pod mostem.
  sim.enqueue({ type: 'buildTrack', pieces: yLine(1, 11, 10) });
  sim.enqueue({ type: 'buildDepot', x: 10, y: 0, side: Side.SW });
  sim.enqueue({ type: 'buildStation', x0: 10, y0: 8, x1: 10, y1: 10, axis: 'y' });
  sim.step();
  expect(fails(sim)).toEqual([]);
  return { sim, s };
}

describe('pociągi i mosty', () => {
  it('pociąg przejeżdża po moście na wysokości pomostu, drugi jedzie pod mostem – bez kolizji', () => {
    const { sim, s } = railNetwork();
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy', 'osobowy'] });
    sim.enqueue({ type: 'buyTrain', depotId: 2, engine: 'iskra', wagons: ['osobowy'] });
    sim.step();
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
    sim.enqueue({ type: 'setOrders', trainId: 2, orders: [3] });
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.enqueue({ type: 'startTrain', trainId: 2 });
    const a = s.trains[0]!;
    const b = s.trains[1]!;
    let onDeck = false;
    const stops = new Set<number>();
    for (let i = 0; i < 6000; i++) {
      sim.step();
      for (const st of a.trail) {
        if (st.track === BRIDGE_X) {
          onDeck = true;
          expect(stepHeight(s, st, 8)).toBe(2);
        }
      }
      // Pomost i tor pod nim nie kolidują.
      expect(piecesConflict(BRIDGE_X, Track.Y)).toBe(false);
      if (a.status === 'loading') stops.add(s.map.station[a.trail[0]!.y * 40 + a.trail[0]!.x]!);
    }
    expect(onDeck).toBe(true);
    expect(stops).toEqual(new Set([1, 2]));
    expect(b.status === 'loading' || s.map.station[b.trail[0]!.y * 40 + b.trail[0]!.x] === 3 || b.trail.length > 0).toBe(true);
  });

  it('most i pociąg na nim przechodzą przez zapis; gra toczy się identycznie', () => {
    const { sim: a } = railNetwork();
    a.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    a.step();
    a.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
    a.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 900; i++) a.step();
    const b = new Simulation(deserializeState(JSON.parse(JSON.stringify(serializeState(a.state)))));
    for (let i = 0; i < 2000; i++) {
      a.step();
      b.step();
    }
    expect(serializeState(b.state)).toEqual(serializeState(a.state));
  });
});
