import { describe, expect, it } from 'vitest';
import { FOUNDATION_COST, START_MONEY, TRACK_COST } from '../src/sim/config';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { Foundation, foundationCorners, railFoundation, tileFoundation, trackCorners } from '../src/sim/track/foundation';
import { Side, Track } from '../src/sim/track/track';
import { stepHeight, stepLength } from '../src/sim/trains/steps';
import { Terrain } from '../src/sim/world/map';

/** Płaski świat 12×12 na wysokości 1; `raise` – narożniki (wierzchołki) podniesione o 1. */
function world(raise: [number, number][]): GameState {
  const s = createGame({ width: 12, height: 12, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  s.map.heights.fill(1);
  for (const [vx, vy] of raise) s.map.heights[vy * 13 + vx] = 2;
  return s;
}

function failures(sim: Simulation): string[] {
  return sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
}

describe('fundamenty pod torami (jak GetRailFoundation w OpenTTD)', () => {
  // Narożniki [góra, prawo, dół, lewo].
  it('płaski teren i tor w górę zbocza – bez fundamentu', () => {
    expect(railFoundation([1, 1, 1, 1], Track.X | Track.Y | Track.Upper)).toBe(Foundation.None);
    expect(railFoundation([2, 1, 1, 2], Track.X)).toBe(Foundation.None);
  });

  it('tor w poprzek zbocza albo rozjazd na zboczu – fundament poziomy', () => {
    expect(railFoundation([2, 1, 1, 2], Track.Y)).toBe(Foundation.Leveled);
    expect(railFoundation([2, 2, 2, 1], Track.X | Track.Upper)).toBe(Foundation.Leveled);
    expect(foundationCorners([2, 1, 1, 2], Track.Y)).toEqual([2, 2, 2, 2]);
  });

  it('prosty tor przy jednym podniesionym narożniku – fundament pochyły wzdłuż toru', () => {
    expect(railFoundation([2, 1, 1, 1], Track.X)).toBe(Foundation.Inclined);
    // Tor X biegnie od boku NW (lewy, górny narożnik) do SE – bok NW idzie w górę.
    expect(foundationCorners([2, 1, 1, 1], Track.X)).toEqual([2, 1, 1, 2]);
    expect(foundationCorners([2, 1, 1, 1], Track.Y)).toEqual([2, 2, 1, 1]);
  });

  it('bez fundamentu: tor dochodzący do boku całkiem na dole i strome zbocza', () => {
    // Łuk Lower przy dolnym narożniku na zboczu w osi X – bok SW na dole, fundament zrobiłby uskok.
    expect(railFoundation([2, 1, 1, 2], Track.Lower | Track.X)).toBeNull();
    // Skrzyżowanie na zboczu w osi X: tor w górę zbocza na fundamencie kończyłby się uskokiem.
    expect(railFoundation([2, 1, 1, 2], Track.X | Track.Y)).toBeNull();
    expect(railFoundation([3, 2, 1, 2], Track.X)).toBeNull();
  });

  it('budowa: dopłata za fundament, prosty przy jednym narożniku – pochyły', () => {
    // Kafelek (5, 5) z podniesionym górnym narożnikiem.
    const s = world([[5, 5]]);
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.Y }] });
    sim.step();
    expect(failures(sim)).toEqual([]);
    expect(tileFoundation(s.map, 5, 5)).toBe(Foundation.Inclined);
    expect(s.money).toBe(START_MONEY - TRACK_COST - FOUNDATION_COST);
    // Drugi prosty schodziłby do boku całkiem na dole – nie da się (jak w OpenTTD).
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.X }] });
    sim.step();
    expect(failures(sim)).toEqual(['blocked']);
  });

  it('budowa: kolejne tory na tym samym fundamencie bez dopłaty', () => {
    // Trzy podniesione narożniki: góra, prawo, dół.
    const s = world([
      [5, 5],
      [6, 5],
      [6, 6],
    ]);
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.Y }] });
    sim.step();
    expect(failures(sim)).toEqual([]);
    expect(tileFoundation(s.map, 5, 5)).toBe(Foundation.Leveled);
    expect(s.money).toBe(START_MONEY - TRACK_COST - FOUNDATION_COST);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.X }, { x: 5, y: 5, track: Track.Lower }] });
    sim.step();
    expect(failures(sim)).toEqual([]);
    expect(s.money).toBe(START_MONEY - 3 * TRACK_COST - FOUNDATION_COST);
  });

  it('rozbiórka zostawia fundament dopasowany do pozostałych torów', () => {
    // Trzy podniesione narożniki: góra, prawo, dół – łuk Right leży na górze bez fundamentu.
    const s = world([
      [5, 5],
      [6, 5],
      [6, 6],
    ]);
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.Right }, { x: 5, y: 5, track: Track.Y }] });
    sim.step();
    expect(failures(sim)).toEqual([]);
    expect(tileFoundation(s.map, 5, 5)).toBe(Foundation.Leveled);
    sim.enqueue({ type: 'removeTrack', pieces: [{ x: 5, y: 5, track: Track.Y }] });
    sim.step();
    expect(failures(sim)).toEqual([]);
    expect(tileFoundation(s.map, 5, 5)).toBe(Foundation.None);
    expect(trackCorners(s.map, 5, 5)).toEqual([2, 2, 2, 1]);
  });

  it('pociąg jedzie po wierzchu fundamentu', () => {
    // Zbocze w osi X na kafelku (5, 5): podniesione narożniki góra i lewo; tor Y w poprzek – na fundamencie.
    const s = world([
      [5, 5],
      [5, 6],
    ]);
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.Y }] });
    sim.step();
    expect(failures(sim)).toEqual([]);
    const step = { x: 5, y: 5, track: Track.Y, entry: Side.NE, exit: Side.SW };
    expect(stepHeight(s, step, 0)).toBe(2);
    expect(stepHeight(s, step, stepLength(step) / 2)).toBe(2);
  });
});
