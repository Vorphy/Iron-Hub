import { describe, expect, it } from 'vitest';
import { CLEAR_ROUGH_COST, START_MONEY, TRACK_COST } from '../src/sim/config';
import { createRng, nextFloat } from '../src/sim/rng';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { pieceAt, planTrackLine } from '../src/sim/track/autorail';
import { refund } from '../src/sim/track/build';
import {
  getTrackBits,
  oppositeSide,
  SIDE_DELTA,
  Track,
  TRACK_SIDES,
  type TrackPiece,
} from '../src/sim/track/track';
import { getTerrain, setTerrain, Terrain } from '../src/sim/world/map';

/** Czy element b jest bezpośrednią kontynuacją elementu a. */
function connected(a: TrackPiece, b: TrackPiece): boolean {
  return TRACK_SIDES[a.track].some((s) => {
    const [dx, dy] = SIDE_DELTA[s];
    return a.x + dx === b.x && a.y + dy === b.y && TRACK_SIDES[b.track].includes(oppositeSide(s));
  });
}

describe('pieceAt', () => {
  it('wybiera łuk przy narożniku i prostą w środku', () => {
    expect(pieceAt(0.1, 0.1)).toBe(Track.Upper);
    expect(pieceAt(0.9, 0.9)).toBe(Track.Lower);
    expect(pieceAt(0.9, 0.1)).toBe(Track.Right);
    expect(pieceAt(0.1, 0.9)).toBe(Track.Left);
    expect(pieceAt(0.2, 0.5)).toBe(Track.X);
    expect(pieceAt(0.5, 0.2)).toBe(Track.Y);
  });
});

describe('planTrackLine', () => {
  it('prosta wzdłuż osi X', () => {
    expect(planTrackLine(2.5, 3.5, 6.5, 3.6)).toEqual([2, 3, 4, 5, 6].map((x) => ({ x, y: 3, track: Track.X })));
  });

  it('prosta wzdłuż osi Y w stronę ujemną', () => {
    expect(planTrackLine(4.5, 9.5, 4.4, 7.5)).toEqual([9, 8, 7].map((y) => ({ x: 4, y, track: Track.Y })));
  });

  it('ukos poziomy na ekranie to naprzemienne łuki', () => {
    expect(planTrackLine(5.8, 5.8, 8.8, 2.8)).toEqual([
      { x: 5, y: 5, track: Track.Lower },
      { x: 6, y: 5, track: Track.Upper },
      { x: 6, y: 4, track: Track.Lower },
      { x: 7, y: 4, track: Track.Upper },
      { x: 7, y: 3, track: Track.Lower },
      { x: 8, y: 3, track: Track.Upper },
      { x: 8, y: 2, track: Track.Lower },
    ]);
  });

  it('każda zaplanowana linia jest ciągła', () => {
    const rng = createRng(123);
    for (let i = 0; i < 500; i++) {
      const sx = nextFloat(rng) * 40;
      const sy = nextFloat(rng) * 40;
      const line = planTrackLine(sx, sy, nextFloat(rng) * 40, nextFloat(rng) * 40);
      for (let k = 1; k < line.length; k++) expect(connected(line[k - 1]!, line[k]!)).toBe(true);
    }
  });
});

function flatSim(): Simulation {
  const state = createGame({ width: 16, height: 16, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  return new Simulation(state);
}

const line = (x0: number, x1: number, y = 2): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

describe('budowa torów', () => {
  it('kładzie tor i pobiera koszt', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: line(1, 4) });
    sim.step();
    expect(sim.state.money).toBe(START_MONEY - 4 * TRACK_COST);
    expect(getTrackBits(sim.state.map, 3, 2)).toBe(Track.X);
    expect(sim.drainEvents()).toHaveLength(4);
  });

  it('nie pobiera opłaty za istniejące elementy, dokłada nowe na ten sam kafelek', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: line(1, 4) });
    sim.enqueue({ type: 'buildTrack', pieces: [...line(3, 5), { x: 3, y: 2, track: Track.Y }] });
    sim.step();
    expect(sim.state.money).toBe(START_MONEY - 6 * TRACK_COST);
    expect(getTrackBits(sim.state.map, 3, 2)).toBe(Track.X | Track.Y);
  });

  it('nieużytek pod torem jest oczyszczany za dopłatą', () => {
    const sim = flatSim();
    setTerrain(sim.state.map, 2, 2, Terrain.Rough);
    sim.enqueue({ type: 'buildTrack', pieces: line(1, 3) });
    sim.step();
    expect(sim.state.money).toBe(START_MONEY - 3 * TRACK_COST - CLEAR_ROUGH_COST);
    expect(getTerrain(sim.state.map, 2, 2)).toBe(Terrain.Grass);
  });

  it('woda lub krawędź mapy blokuje całą linię', () => {
    const sim = flatSim();
    setTerrain(sim.state.map, 3, 2, Terrain.Water);
    sim.enqueue({ type: 'buildTrack', pieces: line(1, 5) });
    sim.enqueue({ type: 'buildTrack', pieces: line(14, 16) });
    sim.step();
    expect(sim.state.money).toBe(START_MONEY);
    expect(getTrackBits(sim.state.map, 1, 2)).toBe(0);
    expect(sim.drainEvents().map((e) => e.type === 'commandFailed' && e.reason)).toEqual(['blocked', 'blocked']);
  });

  it('brak pieniędzy blokuje budowę', () => {
    const sim = flatSim();
    sim.state.money = TRACK_COST * 2;
    sim.enqueue({ type: 'buildTrack', pieces: line(1, 3) });
    sim.step();
    expect(getTrackBits(sim.state.map, 1, 2)).toBe(0);
    expect(sim.state.money).toBe(TRACK_COST * 2);
  });
});

describe('rozbiórka torów', () => {
  it('usuwa tylko wskazane elementy i zwraca część kosztu', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'buildTrack', pieces: [...line(1, 4), { x: 2, y: 2, track: Track.Y }] });
    sim.enqueue({ type: 'removeTrack', pieces: line(2, 6) });
    sim.step();
    expect(getTrackBits(sim.state.map, 1, 2)).toBe(Track.X);
    expect(getTrackBits(sim.state.map, 2, 2)).toBe(Track.Y);
    expect(getTrackBits(sim.state.map, 4, 2)).toBe(0);
    expect(sim.state.money).toBe(START_MONEY - 5 * TRACK_COST + 3 * refund());
  });

  it('buldożer na kafelku usuwa wszystkie elementy toru', () => {
    const sim = flatSim();
    sim.enqueue({
      type: 'buildTrack',
      pieces: [
        { x: 5, y: 5, track: Track.Upper },
        { x: 5, y: 5, track: Track.Lower },
      ],
    });
    sim.enqueue({ type: 'clearTile', x: 5, y: 5 });
    sim.step();
    expect(getTrackBits(sim.state.map, 5, 5)).toBe(0);
    expect(sim.state.money).toBe(START_MONEY - 2 * TRACK_COST + 2 * refund());
  });

  it('rozbiórka bez torów kończy się błędem', () => {
    const sim = flatSim();
    sim.enqueue({ type: 'removeTrack', pieces: line(1, 3) });
    sim.step();
    expect(sim.drainEvents()).toMatchObject([{ type: 'commandFailed', reason: 'nothingToRemove' }]);
  });
});
