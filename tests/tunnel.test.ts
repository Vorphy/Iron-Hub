import { describe, expect, it } from 'vitest';
import { START_MONEY, TRACK_COST, TUNNEL_TILE_COST } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { planTunnel, TUNNEL_X } from '../src/sim/track/tunnel';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { vehiclePoses } from '../src/sim/trains/geometry';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));
const yLine = (y0: number, y1: number, x: number): TrackPiece[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i, track: Track.Y }));

/** Wzgórze w poprzek mapy: zbocza na x = 9–10 i 15–16, płaski grzbiet x = 11–14 na poziomie 2. */
function hill(): { sim: Simulation; s: GameState } {
  const s = createGame({ width: 34, height: 12, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  for (let vy = 0; vy <= 12; vy++) {
    for (let vx = 0; vx <= 34; vx++) s.map.heights[vy * 35 + vx] = Math.max(0, Math.min(2, vx - 9, 17 - vx));
  }
  return { sim: new Simulation(s), s };
}

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

describe('budowa tunelu', () => {
  it('od zbocza w głąb wzgórza do zbocza po drugiej stronie; z obu stron ten sam tunel', () => {
    const { s } = hill();
    const expected = { x: 9, y: 5, axis: 'x', length: 8, level: 0 };
    expect(planTunnel(s, 9, 5).tunnel).toEqual(expected);
    expect(planTunnel(s, 16, 5).tunnel).toEqual(expected);
  });

  it('buduje portale z torem i pobiera koszt', () => {
    const { sim, s } = hill();
    sim.enqueue({ type: 'buildTunnel', x: 9, y: 5 });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(s.tunnels).toHaveLength(1);
    expect(s.map.track[5 * 34 + 9]).toBe(Track.X);
    expect(s.map.track[5 * 34 + 16]).toBe(Track.X);
    expect(s.map.track[5 * 34 + 12]).toBe(0);
    expect(s.money).toBe(START_MONEY - 8 * TUNNEL_TILE_COST - 2 * TRACK_COST);
  });

  it('odrzuca: płaski kafelek, dziura w wzgórzu, brak wyjścia', () => {
    const { sim, s } = hill();
    // Wąwóz do poziomu 0 w poprzek grzbietu nad trasą tunelu w rzędzie y = 2.
    s.map.heights[3 * 35 + 13] = 0;
    s.map.heights[2 * 35 + 13] = 0;
    sim.enqueue({ type: 'buildTunnel', x: 4, y: 5 });
    sim.enqueue({ type: 'buildTunnel', x: 9, y: 2 });
    sim.step();
    expect(fails(sim)).toEqual(['blocked', 'tunnelNoExit']);
  });

  it('teren nad tunelem jest nietykalny, rozbiórka portalu usuwa tunel', () => {
    const { sim, s } = hill();
    sim.enqueue({ type: 'buildTunnel', x: 9, y: 5 });
    sim.enqueue({ type: 'terraform', vx: 12, vy: 5, delta: 1 });
    sim.step();
    expect(fails(sim)).toEqual(['blocked']);
    sim.enqueue({ type: 'clearTile', x: 16, y: 5 });
    sim.step();
    expect(s.tunnels).toEqual([]);
    expect(s.map.tunnel.every((v) => v === 0)).toBe(true);
    expect(s.map.track[5 * 34 + 9]).toBe(0);
  });
});

function network(): { sim: Simulation; s: GameState } {
  const { sim, s } = hill();
  sim.enqueue({ type: 'buildTunnel', x: 9, y: 5 });
  sim.enqueue({ type: 'buildTrack', pieces: [...xLine(1, 8, 5), ...xLine(17, 30, 5)] });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 1, y0: 5, x1: 3, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 26, y0: 5, x1: 29, y1: 5, axis: 'x' });
  // Tor na grzbiecie, w poprzek nad tunelem.
  sim.enqueue({ type: 'buildTrack', pieces: yLine(0, 11, 12) });
  sim.step();
  expect(fails(sim)).toEqual([]);
  return { sim, s };
}

describe('pociągi i tunele', () => {
  it('pociąg przejeżdża przez tunel i w środku znika', () => {
    const { sim, s } = network();
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy', 'osobowy'] });
    sim.step();
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    const t = s.trains[0]!;
    let hidden = false;
    const stops = new Set<number>();
    for (let i = 0; i < 6000; i++) {
      sim.step();
      if (t.trail.some((st) => st.track === TUNNEL_X) && vehiclePoses(s, t).length < 3) hidden = true;
      if (t.status === 'loading') stops.add(s.map.station[t.trail[0]!.y * 34 + t.trail[0]!.x]!);
    }
    expect(hidden).toBe(true);
    expect(stops).toEqual(new Set([1, 2]));
  });

  it('tunel i pociąg w nim przechodzą przez zapis; gra toczy się identycznie', () => {
    const { sim: a } = network();
    a.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    a.step();
    a.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
    a.enqueue({ type: 'startTrain', trainId: 1 });
    for (let i = 0; i < 700; i++) a.step();
    const b = new Simulation(deserializeState(JSON.parse(JSON.stringify(serializeState(a.state)))));
    for (let i = 0; i < 2000; i++) {
      a.step();
      b.step();
    }
    expect(serializeState(b.state)).toEqual(serializeState(a.state));
  });
});
