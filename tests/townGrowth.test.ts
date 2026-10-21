import { describe, expect, it } from 'vitest';
import { emptyTownMonth } from '../src/sim/economy/town';
import { createRng } from '../src/sim/rng';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { planTrackLine } from '../src/sim/track/autorail';
import { Track, type TrackPiece } from '../src/sim/track/track';
import { growTown } from '../src/sim/world/generate';
import { updateTownRoads } from '../src/sim/world/roads';
import { Terrain } from '../src/sim/world/map';

const W = 64;

/** Puste miasto z rynkiem (20, 20) i torem zbudowanym z podanych odcinków. */
function townWithTrack(pieces: TrackPiece[]) {
  const state = createGame({ width: W, height: W, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  state.towns.push({ id: 1, name: 'Testowo', x: 20, y: 20, month: emptyTownMonth(), lastTransported: 0 });
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces });
  sim.processCommands();
  return state;
}

const houses = (state: ReturnType<typeof townWithTrack>) =>
  [...state.map.house.keys()].filter((i) => state.map.house[i]).map((i) => ({ x: i % W, y: Math.floor(i / W) }));

describe('wzrost miast przez tory', () => {
  it('zabudowa przechodzi za skośny tor', () => {
    // Skos tuż przy rynku: x + y ≈ 46.
    const state = townWithTrack(planTrackLine(10.5, 36.5, 36.5, 10.5));
    expect(state.map.track.some((b) => b === Track.Upper || b === Track.Lower || b === Track.Left || b === Track.Right)).toBe(
      true,
    );
    growTown(state, createRng(7), state.towns[0]!, 300);
    const far = houses(state).filter((h) => h.x + h.y > 48);
    expect(far.length).toBeGreaterThan(5);
    // Tor nienaruszony – domy tylko obok.
    expect(houses(state).some((h) => state.map.track[h.y * W + h.x])).toBe(false);
  });

  it('zabudowa przechodzi za prosty tor poza ulicą', () => {
    // Kolumna x = 23 (ulice co 4 od rynku: 20, 24) – tor w środku kwartału.
    const state = townWithTrack(Array.from({ length: 30 }, (_, k) => ({ x: 23, y: 5 + k, track: Track.Y })));
    growTown(state, createRng(7), state.towns[0]!, 300);
    expect(houses(state).filter((h) => h.x > 23).length).toBeGreaterThan(5);
  });

  it('miasto buduje przejazd przez prosty tor poprzeczny do ulicy, ale nie wzdłuż toru', () => {
    // Tor w kolumnie x = 23 (oś Y) przecina ulice-rzędy y = 16, 20, 24…
    const state = townWithTrack([
      ...Array.from({ length: 30 }, (_, k) => ({ x: 23, y: 5 + k, track: Track.Y })),
      // Tor w osi X na ulicy-rzędzie y = 28 (wzdłuż ulicy) – tu drogi nie będzie.
      ...Array.from({ length: 3 }, (_, k) => ({ x: 25 + k, y: 28, track: Track.X })),
    ]);
    growTown(state, createRng(7), state.towns[0]!, 300);
    updateTownRoads(state, state.towns[0]!);
    const road = (x: number, y: number) => state.map.road[y * W + x] === 1;
    expect(road(23, 20)).toBe(true);
    expect(state.map.track[20 * W + 23]).toBe(Track.Y);
    // Miasto doszło do rzędu y = 28 (są tam drogi), a mimo to na torze wzdłuż ulicy drogi nie ma.
    expect([21, 22, 28, 29, 30].some((x) => road(x, 28))).toBe(true);
    for (let x = 25; x <= 27; x++) expect(road(x, 28)).toBe(false);
  });
});
