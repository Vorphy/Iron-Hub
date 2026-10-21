import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/state';
import { customLimits, worldCounts } from '../src/sim/world/generate';

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

  it('kopalnie i lasy osobno od przemysłu: bez miast, mało zakładów, dużo kopalń', () => {
    const c = worldCounts(128, 128, 0, 1, 3);
    expect(c.towns).toBe(0);
    expect(c.mines).toBe(worldCounts(128, 128, 3, 3, 3).mines);
    expect(c.factories).toBeLessThan(c.mines);
    const s = createGame({ width: 128, height: 128, seed: 8, towns: 0, industry: 1, resources: 3 });
    expect(s.towns).toHaveLength(0);
    expect(s.industries.length).toBe(c.industries);
  });

  it('generator stawia tyle, ile zapowiada okno nowej gry', () => {
    const s = createGame({ width: 128, height: 128, seed: 5, towns: 1, industry: 0, resources: 0 });
    expect(s.towns.length).toBe(worldCounts(128, 128, 1, 0, 0).towns);
    expect(s.industries).toHaveLength(0);
    const none = createGame({ width: 64, height: 64, seed: 5, towns: 0, industry: 2 });
    expect(none.towns).toHaveLength(0);
    expect(none.industries.length).toBeGreaterThan(0);
  });

  it('tryb własny: dokładne liczby – np. bez miast, 1 elektrownia i 10 kopalń węgla', () => {
    const s = createGame({
      width: 128,
      height: 128,
      seed: 9,
      custom: { towns: 0, industries: { coal_mine: 10, power_plant: 1 } },
    });
    expect(s.towns).toHaveLength(0);
    const byType = (t: string) => s.industries.filter((i) => i.type === t).length;
    expect(byType('coal_mine')).toBe(10);
    expect(byType('power_plant')).toBe(1);
    expect(s.industries).toHaveLength(11);
    // Granice pól: 3× „dużo”, co najmniej 5.
    expect(customLimits(128, 128).towns).toBe(24);
    expect(customLimits(64, 64).industries.steel_mill).toBe(5);
  });
});
