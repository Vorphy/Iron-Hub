import { describe, expect, it } from 'vitest';
import { DEPOT_COST, START_MONEY } from '../src/sim/config';
import { autoDepotSide, depotAt, depotRefund } from '../src/sim/depot/depot';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

function flatSim(): Simulation {
  const state = createGame({ width: 16, height: 16, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  return new Simulation(state);
}

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

describe('zajezdnia', () => {
  it('stawia zajezdnię i pobiera koszt', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
    sim.step();
    expect(depotAt(sim.state, 4, 4)).toEqual({ id: 1, x: 4, y: 4, side: Side.SE });
    expect(sim.state.money).toBe(START_MONEY - DEPOT_COST);
  });

  it('wjazd ustawia się w stronę toru, który do niej prowadzi', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: xLine(5, 9, 4) });
    sim.step();
    // Tor zaczyna się na prawo-dół (x+1) od (4,4) – wjazd od strony SE, niezależnie od preferencji.
    expect(autoDepotSide(sim.state.map, 4, 4, Side.NE)).toBe(Side.SE);
    // Tor biegnący w poprzek (Y) nie prowadzi do kafelka – zostaje preferencja.
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 1, y: 10, track: Track.Y }] });
    sim.step();
    expect(autoDepotSide(sim.state.map, 0, 10, Side.NW)).toBe(Side.NW);
  });

  it('nie wolno stawiać na torze, stacji, wodzie ani innej zajezdni', () => {
    const sim = flatSim();
    sim.state.map.terrain[2 * 16 + 9] = Terrain.Water;
    sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 2, 2) });
    sim.enqueue({ type: 'buildStation', x0: 5, y0: 2, x1: 6, y1: 2, axis: 'x' });
    sim.enqueue({ type: 'buildDepot', x: 12, y: 2, side: Side.SE });
    for (const x of [1, 5, 9, 12]) sim.enqueue({ type: 'buildDepot', x, y: 2, side: Side.SE });
    sim.step();
    expect(fails(sim)).toEqual(['blocked', 'blocked', 'blocked', 'blocked']);
  });

  it('nie da się położyć toru na zajezdni', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
    sim.enqueue({ type: 'buildTrack', pieces: xLine(2, 6, 4) });
    sim.step();
    expect(fails(sim)).toEqual(['blocked']);
  });

  it('buldożer usuwa zajezdnię ze zwrotem części kosztu', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
    sim.enqueue({ type: 'clearTile', x: 4, y: 4 });
    sim.step();
    expect(sim.state.depots).toEqual([]);
    expect(sim.state.map.depot[4 * 16 + 4]).toBe(0);
    expect(sim.state.money).toBe(START_MONEY - DEPOT_COST + depotRefund());
  });

  it('wjazd zajezdni jest węzłem grafu na końcu toru', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: xLine(5, 9, 4) });
    sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SE });
    sim.step();
    const g = sim.graph;
    expect(g.edges).toHaveLength(1);
    const depotNode = g.nodes.find((n) => n.depot === 1)!;
    expect(depotNode).toBeDefined();
    expect(g.edges[0]!.a === depotNode.id || g.edges[0]!.b === depotNode.id).toBe(true);
  });
});

describe('zapis z zajezdniami', () => {
  it('zajezdnie przechodzą przez zapis', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildDepot', x: 4, y: 4, side: Side.SW });
    sim.step();
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded).toEqual(sim.state);
  });

  it('zapis w wersji 1 (sprzed zajezdni) wczytuje się po migracji', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 5, 3) });
    sim.step();
    const v2 = serializeState(sim.state);
    const { depots: _d, nextDepotId: _n, ...rest } = v2;
    const { depot: _m, ...mapV1 } = v2.map;
    const v1 = { ...rest, version: 1, map: mapV1 };
    const loaded = deserializeState(JSON.parse(JSON.stringify(v1)));
    expect(loaded).toEqual(sim.state);
    // Migracja nie zmienia obiektu wejściowego.
    expect('depot' in v1.map).toBe(false);
  });
});
