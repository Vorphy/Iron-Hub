import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Track } from '../src/sim/track/track';
import { tutorialProgress } from '../src/tutorial';

describe('pierwsze kroki', () => {
  it('na nowej mapie nic nie jest zrobione, tor zalicza pierwszy krok', () => {
    const s = createGame({ width: 64, height: 64, seed: 1, empty: true });
    const sim = new Simulation(s);
    expect(tutorialProgress(s, sim.graph).some(Boolean)).toBe(false);
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 10, y: 10, track: Track.X }, { x: 11, y: 10, track: Track.X }] });
    sim.step();
    expect(tutorialProgress(s, sim.graph)[0]).toBe(true);
  });

  it('raz zaliczony krok zostaje zaliczony', () => {
    const s = createGame({ width: 64, height: 64, seed: 1, empty: true });
    const sim = new Simulation(s);
    const prev = [true, false, false, false, false, false, false];
    expect(tutorialProgress(s, sim.graph, prev)[0]).toBe(true);
  });
});
