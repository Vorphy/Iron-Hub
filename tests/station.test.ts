import { describe, expect, it } from 'vitest';
import { START_MONEY, STATION_TILE_COST, TRACK_COST } from '../src/sim/config';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { catchment, stationAt, stationAxis, stationTileRefund } from '../src/sim/station/station';
import { getTrackBits, Track, type TrackPiece } from '../src/sim/track/track';
import { setTerrain, Terrain } from '../src/sim/world/map';

function flatSim(): Simulation {
  const state = createGame({ width: 20, height: 20, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  return new Simulation(state);
}

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

function failReasons(sim: Simulation): (string | false)[] {
  return sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
}

describe('stationAxis', () => {
  it('oś peronu to dłuższy bok, przy kwadracie – preferencja', () => {
    expect(stationAxis(0, 0, 4, 1, 'y')).toBe('x');
    expect(stationAxis(0, 0, 1, 4, 'x')).toBe('y');
    expect(stationAxis(0, 0, 2, 2, 'y')).toBe('y');
  });
});

describe('budowa stacji', () => {
  it('stawia perony z torami w osi stacji i nadaje nazwę', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 5, x1: 5, y1: 6, axis: 'x' });
    sim.step();
    const { state } = sim;
    expect(state.stations).toHaveLength(1);
    const st = state.stations[0]!;
    expect(st.name).toBe('Żelazna Góra');
    expect(st.tiles).toHaveLength(6);
    expect(getTrackBits(state.map, 4, 6)).toBe(Track.X);
    expect(stationAt(state, 5, 5)).toBe(st);
    expect(state.money).toBe(START_MONEY - 6 * STATION_TILE_COST);
  });

  it('można wpiąć stację w istniejącą prostą w tej samej osi', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: xLine(0, 10, 4) });
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 4, x1: 6, y1: 4, axis: 'x' });
    sim.step();
    expect(failReasons(sim)).toEqual([]);
    // Perony nie rozcinają linii – w grafie to nadal jedna krawędź.
    expect(sim.graph.edges).toHaveLength(1);
  });

  it('nie wolno stawiać na torze w innej osi, łuku, wodzie ani innej stacji', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 2, y: 2, track: Track.Y }, { x: 8, y: 2, track: Track.Upper }] });
    setTerrain(sim.state.map, 14, 2, Terrain.Water);
    sim.enqueue({ type: 'buildStation', x0: 1, y0: 2, x1: 3, y1: 2, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 7, y0: 2, x1: 9, y1: 2, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 13, y0: 2, x1: 15, y1: 2, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 1, y0: 10, x1: 3, y1: 10, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 9, x1: 3, y1: 11, axis: 'y' });
    sim.step();
    expect(failReasons(sim)).toEqual(['blocked', 'blocked', 'blocked', 'blocked']);
    expect(sim.state.stations).toHaveLength(1);
  });

  it('odrzuca za dużą stację', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildStation', x0: 0, y0: 0, x1: 12, y1: 0, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 0, y0: 0, x1: 8, y1: 6, axis: 'x' });
    sim.step();
    expect(failReasons(sim)).toEqual(['tooBig', 'tooBig']);
  });

  it('kolejne stacje dostają kolejne nazwy', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildStation', x0: 0, y0: 0, x1: 2, y1: 0, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: 0, y0: 5, x1: 2, y1: 5, axis: 'x' });
    sim.step();
    expect(sim.state.stations.map((s) => s.name)).toEqual(['Żelazna Góra', 'Stalowo']);
  });
});

describe('tory a perony', () => {
  it('nie da się dołożyć łuku na peron ani rozebrać toru peronu przeciągnięciem', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 4, x1: 6, y1: 4, axis: 'x' });
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 4, y: 4, track: Track.Upper }] });
    sim.enqueue({ type: 'removeTrack', pieces: xLine(3, 6, 4) });
    sim.step();
    expect(failReasons(sim)).toEqual(['blocked', 'nothingToRemove']);
    expect(getTrackBits(sim.state.map, 4, 4)).toBe(Track.X);
  });

  it('tor można dobudować do końca peronu', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 4, x1: 6, y1: 4, axis: 'x' });
    sim.enqueue({ type: 'buildTrack', pieces: xLine(6, 9, 4) });
    sim.step();
    expect(failReasons(sim)).toEqual([]);
    // Kafelek (6,4) już był peronem – płacimy tylko za 3 nowe elementy.
    expect(sim.state.money).toBe(START_MONEY - 4 * STATION_TILE_COST - 3 * TRACK_COST);
  });
});

describe('rozbiórka stacji', () => {
  it('buldożer usuwa kafelek peronu, ostatni kafelek usuwa stację', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildStation', x0: 3, y0: 4, x1: 4, y1: 4, axis: 'x' });
    sim.enqueue({ type: 'clearTile', x: 3, y: 4 });
    sim.step();
    expect(sim.state.stations[0]!.tiles).toHaveLength(1);
    expect(getTrackBits(sim.state.map, 3, 4)).toBe(0);
    sim.enqueue({ type: 'clearTile', x: 4, y: 4 });
    sim.step();
    expect(sim.state.stations).toEqual([]);
    expect(sim.state.map.station.every((v) => v === 0)).toBe(true);
    expect(sim.state.money).toBe(START_MONEY - 2 * STATION_TILE_COST + 2 * stationTileRefund());
  });
});

describe('zasięg stacji', () => {
  it('kwadrat o promieniu 4 przycięty do mapy', () => {
    const map = createGame({ width: 20, height: 20, seed: 1, empty: true }).map;
    expect(catchment(map, [0])).toHaveLength(25);
    expect(catchment(map, [10 * 20 + 10])).toHaveLength(81);
    // Dwa sąsiednie perony – zasięgi się sumują bez duplikatów.
    expect(catchment(map, [10 * 20 + 10, 10 * 20 + 11])).toHaveLength(90);
  });
});
