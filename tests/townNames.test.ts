import { describe, expect, it } from 'vitest';
import { TOWN_NAMES, townNameGenerator } from '../src/sim/economy/town';

describe('nazwy miast', () => {
  it('generator daje tysiące niepowtarzalnych nazw, bez numerowanych osiedli', () => {
    const next = townNameGenerator(7, TOWN_NAMES);
    const names = Array.from({ length: 2000 }, next);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => n.startsWith('Osiedle'))).toBe(false);
    expect(names.some((n) => TOWN_NAMES.includes(n))).toBe(false);
  });

  it('ta sama mapa (ziarno) – te same nazwy', () => {
    const a = townNameGenerator(11, TOWN_NAMES);
    const b = townNameGenerator(11, TOWN_NAMES);
    expect(Array.from({ length: 50 }, a)).toEqual(Array.from({ length: 50 }, b));
  });

  it('przymiotnik w dobrej formie', () => {
    const names = Array.from({ length: 2000 }, townNameGenerator(3, []));
    for (const n of names) {
      if (n.startsWith('Nowy ')) expect(n).toMatch(/(ów|ec)$/);
      if (n.startsWith('Nowa ')) expect(n).toMatch(/ówka$/);
      if (/ówka (Górny|Dolny|Mały)$/.test(n)) throw new Error(`zła forma: ${n}`);
    }
  });
});
