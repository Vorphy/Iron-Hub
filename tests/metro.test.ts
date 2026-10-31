import { describe, expect, it } from 'vitest';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { isUnderTrack, METRO_LEVEL, underTrack } from '../src/sim/track/metro';
import { stepHeight, stepLength } from '../src/sim/trains/steps';
import { isMetroTunnelTrack } from '../src/sim/track/metroTunnel';
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

  it('metro leży płasko na poziomie −1, także pod pagórkiem', () => {
    const sim = metroLine();
    const { map } = sim.state;
    // Pagórek nad metrem: wierzchołki x 12–16 o dwa poziomy wyżej.
    const vw = map.width + 1;
    for (let y = 3; y <= 8; y++) for (let x = 12; x <= 16; x++) map.heights[y * vw + x] = 2;
    for (const x of [10, 12, 14, 16]) {
      const step = { x, y: 5, track: underTrack(Track.X), entry: Side.NW, exit: Side.SE };
      expect(stepHeight(sim.state, step, 0)).toBe(METRO_LEVEL);
      expect(stepHeight(sim.state, step, stepLength(step))).toBe(METRO_LEVEL);
    }
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
    expect(m1).toMatchObject({ tiles: [], underTiles: [5 * 32 + 11, 5 * 32 + 12, 5 * 32 + 13] });
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
    expect(back.stations.find((s) => s.id === m2!.id)?.underTiles).toHaveLength(3);
    expect(back.map.stationUnder[5 * 32 + 18]).toBe(m2!.id);
  });

  it('przesiadka: peron metra w zasięgu stacji na powierzchni dołącza do niej (albo osobna stacja)', () => {
    const sim = metroLine();
    const { state } = sim;
    // Stacja na powierzchni dwa kafelki obok linii metra.
    sim.enqueue({ type: 'buildStation', x0: 10, y0: 3, x1: 12, y1: 3, axis: 'x', separate: true });
    sim.step();
    const top = state.stations[state.stations.length - 1]!;
    sim.enqueue({ type: 'buildStation', x0: 11, y0: 5, x1: 13, y1: 5, axis: 'x', under: true });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(state.stations).toHaveLength(3);
    expect(top.tiles).toEqual([3 * 32 + 10, 3 * 32 + 11, 3 * 32 + 12]);
    expect(top.underTiles).toEqual([5 * 32 + 11, 5 * 32 + 12, 5 * 32 + 13]);
    expect(state.map.stationUnder[5 * 32 + 12]).toBe(top.id);
    // Osobna stacja metra mimo zasięgu.
    sim.enqueue({ type: 'buildStation', x0: 16, y0: 5, x1: 18, y1: 5, axis: 'x', under: true, separate: true });
    sim.step();
    expect(state.stations).toHaveLength(4);
    // Rozbiórka peronu metra zostawia stację na powierzchni.
    for (const x of [11, 12, 13]) sim.enqueue({ type: 'removeUnderStation', x, y: 5 });
    sim.step();
    expect(top.underTiles).toEqual([]);
    expect(state.stations).toContain(top);
  });

  it('zapis v22: stacja metra (under: true) przechodzi na perony metra', () => {
    const sim = metroLine();
    sim.enqueue({ type: 'buildStation', x0: 11, y0: 5, x1: 13, y1: 5, axis: 'x', under: true });
    sim.step();
    const data = JSON.parse(JSON.stringify(serializeState(sim.state)));
    data.version = 22;
    const m = data.stations[data.stations.length - 1];
    data.stations[data.stations.length - 1] = { ...m, tiles: m.underTiles, under: true, underTiles: undefined };
    const back = deserializeState(data);
    const st = back.stations[back.stations.length - 1]!;
    expect(st.tiles).toEqual([]);
    expect(st.underTiles).toEqual([5 * 32 + 11, 5 * 32 + 12, 5 * 32 + 13]);
  });

  it('semafory w metrze (tryb Ekspert): stawiane na torze metra, pociąg przez nie przejeżdża', () => {
    const sim = metroLine();
    const { state } = sim;
    sim.enqueue({ type: 'setSignalMode', mode: 'manual' });
    sim.enqueue({ type: 'placeSignal', x: 14, y: 5, track: Track.X, oneWay: false, under: true });
    // Na powierzchni nad metrem nie ma toru – zwykły semafor tu nie stanie.
    sim.enqueue({ type: 'placeSignal', x: 15, y: 5, track: Track.X, oneWay: false });
    sim.step();
    expect(fails(sim)).toEqual(['blocked']);
    expect(state.signals).toEqual([{ x: 14, y: 5, track: Track.X, dirs: 1, oneWay: false, under: true }]);

    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.step();
    const train = state.trains[0]!;
    const [a, b] = state.stations;
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [a!.id, b!.id] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    const visited: number[] = [];
    for (let i = 0; i < 40 * 90 && visited.length < 3; i++) {
      sim.step();
      if (train.status === 'loading') {
        const st = state.map.station[train.trail[0]!.y * 32 + train.trail[0]!.x];
        if (st && visited[visited.length - 1] !== st) visited.push(st);
      }
    }
    expect(visited).toEqual([a!.id, b!.id, a!.id]);
    // Rozbiórka toru metra zabiera semafor.
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 14, y: 5, track: Track.X }], under: true });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(state.signals).toEqual([]);
  });

  it('przejście pod torem metra: druga linia biegnie górą, pociąg przejeżdża dołem', () => {
    const sim = metroLine();
    const { state } = sim;
    const { map } = state;
    const yLine = (x: number, y0: number, y1: number): TrackPiece[] =>
      Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i, track: Track.Y }));
    // Płaskie skrzyżowanie wolno zbudować…
    sim.enqueue({ type: 'buildTrack', pieces: yLine(14, 1, 10), under: true });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(map.under[5 * 32 + 14]).toBe(Track.X | Track.Y);
    // …a przeciągnięcie przejścia wzdłuż linii zamienia je w bezkolizyjne.
    sim.enqueue({ type: 'buildMetroTunnel', x0: 12, y0: 5, x1: 16, y1: 5 });
    sim.step();
    expect(fails(sim)).toEqual([]);
    expect(map.under[5 * 32 + 14]).toBe(Track.Y);
    expect(map.under[5 * 32 + 13]).toBe(0);
    expect(map.under[5 * 32 + 12]).toBe(Track.X);
    // Toru portalu nie rozbiera się osobno, a na portalu nie dokłada innego toru.
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 12, y: 5, track: Track.X }], under: true });
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 12, y: 5, track: Track.Y }], under: true });
    sim.step();
    expect(fails(sim)).toEqual(['nothingToRemove', 'blocked']);

    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.step();
    const train = state.trains[0]!;
    const [a, b] = state.stations;
    sim.enqueue({ type: 'setOrders', trainId: train.id, orders: [a!.id, b!.id] });
    sim.enqueue({ type: 'startTrain', trainId: train.id });
    let wentThrough = false;
    const visited: number[] = [];
    for (let i = 0; i < 40 * 60 && visited.length < 3; i++) {
      sim.step();
      if (train.trail.some((s) => isMetroTunnelTrack(s.track))) wentThrough = true;
      if (train.status === 'loading') {
        const st = map.station[train.trail[0]!.y * 32 + train.trail[0]!.x];
        if (st && visited[visited.length - 1] !== st) visited.push(st);
      }
    }
    expect(wentThrough).toBe(true);
    expect(visited).toEqual([a!.id, b!.id, a!.id]);

    // Zapis zachowuje przejście; buldożer na portalu rozbiera je razem z torami portali.
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
    expect(loaded.map.underTunnel[5 * 32 + 14]).toBe(map.underTunnel[5 * 32 + 14]);
    expect(loaded.tunnels).toEqual(state.tunnels);
  });

  it('przejścia nie da się zbudować po skosie, za krótkiego ani z peronem na końcu', () => {
    const sim = metroLine();
    for (const [x0, y0, x1, y1] of [
      [12, 5, 14, 7],
      [12, 5, 13, 5],
    ] as const) {
      sim.enqueue({ type: 'buildMetroTunnel', x0, y0, x1, y1 });
    }
    sim.step();
    expect(fails(sim)).toEqual(['blocked', 'blocked']);
    sim.enqueue({ type: 'buildMetroTunnel', x0: 12, y0: 5, x1: 16, y1: 5 });
    sim.step();
    expect(fails(sim)).toEqual([]);
    sim.enqueue({ type: 'removeMetroTunnel', x: 16, y: 5 });
    sim.step();
    expect(fails(sim)).toEqual([]);
    const { map } = sim.state;
    expect(map.underTunnel[5 * 32 + 14]).toBe(0);
    expect(map.under[5 * 32 + 12]).toBe(0);
    expect(sim.state.tunnels).toEqual([]);
  });
});
