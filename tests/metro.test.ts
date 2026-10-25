import { describe, expect, it } from 'vitest';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { isUnderTrack } from '../src/sim/track/metro';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/**
 * Linia wzdłuż y = 5: zajezdnia (0), stacja A (2–4), tor do zjazdu w x = 8 (w dół w stronę SE),
 * metro x = 9–20, zjazd w górę w x = 21 (dół od strony NW), tor i stacja B (25–27).
 */
function metroLine(): Simulation {
  const state = createGame({ width: 32, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 10_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: [...xLine(1, 7, 5), ...xLine(22, 30, 5)] });
  sim.enqueue({ type: 'buildRamp', x: 8, y: 5, down: Side.SE });
  sim.enqueue({ type: 'buildRamp', x: 21, y: 5, down: Side.NW });
  sim.enqueue({ type: 'buildTrack', pieces: xLine(9, 20, 5), under: true });
  sim.enqueue({ type: 'buildStation', x0: 2, y0: 5, x1: 4, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 25, y0: 5, x1: 27, y1: 5, axis: 'x', separate: true });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.step();
  expect(fails(sim)).toEqual([]);
  return sim;
}

describe('metro (poziom −1)', () => {
  it('tor metra nie zajmuje powierzchni, zjazd kładzie tor w osi', () => {
    const sim = metroLine();
    const { map } = sim.state;
    expect(map.under[5 * 32 + 12]).toBe(Track.X);
    expect(map.track[5 * 32 + 12]).toBe(0);
    expect(map.ramp[5 * 32 + 8]).toBe(Side.SE + 1);
    expect(map.track[5 * 32 + 8]).toBe(Track.X);
    // Nad metrem można normalnie budować na powierzchni (np. tor w poprzek).
    sim.enqueue({
      type: 'buildTrack',
      pieces: [
        { x: 12, y: 4, track: Track.Y },
        { x: 12, y: 5, track: Track.Y },
      ],
    });
    sim.step();
    expect(fails(sim)).toEqual([]);
    // Toru na zjeździe nie rozbiera się osobno.
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 8, y: 5, track: Track.X }] });
    sim.step();
    expect(fails(sim)).toEqual(['nothingToRemove']);
  });

  it('pociąg jedzie ze stacji A przez metro do stacji B i z powrotem', () => {
    const sim = metroLine();
    const { state } = sim;
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.step();
    const train = state.trains[0]!;
    const [a, b] = state.stations;
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [a!.id, b!.id] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    let wentUnder = false;
    const visited: number[] = [];
    for (let i = 0; i < 40 * 60 && visited.length < 3; i++) {
      sim.step();
      if (train.trail.some((s) => isUnderTrack(s.track))) wentUnder = true;
      if (train.status === 'loading') {
        const st = state.map.station[train.trail[0]!.y * 32 + train.trail[0]!.x];
        if (st && visited[visited.length - 1] !== st) visited.push(st);
      }
    }
    expect(wentUnder).toBe(true);
    expect(visited).toEqual([a!.id, b!.id, a!.id]);
  });

  it('pociąg pod metrem nie blokuje toru na powierzchni nad nim', () => {
    const sim = metroLine();
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 12, y: 5, track: Track.Y }] });
    sim.step();
    expect(fails(sim)).toEqual([]);
  });

  it('zapis zachowuje tory i zjazdy metra', () => {
    const sim = metroLine();
    const back = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(Array.from(back.map.under)).toEqual(Array.from(sim.state.map.under));
    expect(Array.from(back.map.ramp)).toEqual(Array.from(sim.state.map.ramp));
  });

  it('stacje metra: peron pod ziemią, pociąg kursuje między nimi', () => {
    const sim = metroLine();
    const { state } = sim;
    const money = state.money;
    sim.enqueue({ type: 'buildStation', x0: 11, y0: 5, x1: 13, y1: 5, axis: 'x', under: true });
    sim.enqueue({ type: 'buildStation', x0: 17, y0: 5, x1: 19, y1: 5, axis: 'x', under: true, separate: true });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(state.money).toBeLessThan(money);
    const [, , m1, m2] = state.stations;
    expect(m1).toMatchObject({ under: true, tiles: [5 * 32 + 11, 5 * 32 + 12, 5 * 32 + 13] });
    expect(state.map.stationUnder[5 * 32 + 12]).toBe(m1!.id);
    expect(state.map.station[5 * 32 + 12]).toBe(0);
    // Na peronie metra nie dołożysz rozjazdu.
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 12, y: 5, track: Track.Upper }], under: true });
    sim.step();
    expect(fails(sim)).toEqual(['blocked']);

    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.step();
    const train = state.trains[0]!;
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [m1!.id, m2!.id] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    const visited: number[] = [];
    for (let i = 0; i < 40 * 60 && visited.length < 3; i++) {
      sim.step();
      const h = train.trail[0];
      if (train.status === 'loading' && h) {
        expect(isUnderTrack(h.track)).toBe(true);
        const st = state.map.stationUnder[h.y * 32 + h.x];
        if (st && visited[visited.length - 1] !== st) visited.push(st);
      }
    }
    expect(visited).toEqual([m1!.id, m2!.id, m1!.id]);
    // Zapis i rozbiórka peronu metra.
    const back = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
    expect(back.stations.find((s) => s.id === m2!.id)?.under).toBe(true);
    expect(back.map.stationUnder[5 * 32 + 18]).toBe(m2!.id);
  });
});
