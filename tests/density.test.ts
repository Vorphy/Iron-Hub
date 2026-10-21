import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/state';
import { worldCounts } from '../src/sim/world/generate';

describe('gęstość miast i przemysłu', () => {
  it('„dużo” to dotychczasowe mapy (128×128: 8 miast, 12 zakładów); niżej – mniej, „brak” – zero', () => {
    expect(worldCounts(128, 128, 3, 3)).toMatchObject({ towns: 8, industries: 12 });
    const normal = worldCounts(128, 128, 2, 2);
    const few = worldCounts(128, 128, 1, 1);
    expect(normal.towns).toBeLessThan(8);
    expect(few.towns).toBeLessThan(normal.towns);
    expect(few.industries).toBeLessThan(normal.industries);
    expect(worldCounts(128, 128, 0, 0)).toMatchObject({ towns: 0, industries: 0 });
    // Każdy typ zakładu jest choć raz, jeśli przemysł w ogóle jest (łańcuchy dostaw).
    expect(worldCounts(64, 64, 1, 1).perType.every((t) => t.count >= 1)).toBe(true);
  });

  it('generator stawia tyle, ile zapowiada okno nowej gry', () => {
    const s = createGame({ width: 128, height: 128, seed: 5, towns: 1, industry: 0 });
    expect(s.towns.length).toBe(worldCounts(128, 128, 1, 0).towns);
    expect(s.industries).toHaveLength(0);
    const none = createGame({ width: 64, height: 64, seed: 5, towns: 0, industry: 2 });
    expect(none.towns).toHaveLength(0);
    expect(none.industries.length).toBeGreaterThan(0);
  });
});
