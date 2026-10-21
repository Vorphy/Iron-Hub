import { describe, expect, it } from 'vitest';
import { TERRAFORM_COST } from '../src/sim/config';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { Track } from '../src/sim/track/track';
import { isFlat, tileSlope, vertexHeight } from '../src/sim/world/height';
import { Terrain } from '../src/sim/world/map';

function flat(): { sim: Simulation; s: GameState } {
  const s = createGame({ width: 20, height: 20, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  return { sim: new Simulation(s), s };
}

const fails = (sim: Simulation) => sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

/** Sąsiednie narożniki w całej mapie różnią się najwyżej o 1. */
function expectSmooth(s: GameState): void {
  const vw = s.map.width + 1;
  for (let vy = 0; vy <= s.map.height; vy++) {
    for (let vx = 0; vx <= s.map.width; vx++) {
      const h = s.map.heights[vy * vw + vx]!;
      if (vx > 0) expect(Math.abs(h - s.map.heights[vy * vw + vx - 1]!)).toBeLessThanOrEqual(1);
      if (vy > 0) expect(Math.abs(h - s.map.heights[(vy - 1) * vw + vx]!)).toBeLessThanOrEqual(1);
    }
  }
}

describe('kształtowanie terenu', () => {
  it('podniesienie narożnika zmienia 4 kafelki wokół i kosztuje 30 zł', () => {
    const { sim, s } = flat();
    const money = s.money;
    sim.enqueue({ type: 'terraform', vx: 10, vy: 10, delta: 1 });
    sim.step();
    expect(vertexHeight(s.map, 10, 10)).toBe(1);
    expect(tileSlope(s.map, 9, 9)).toBe('other');
    expect(s.money).toBe(money - TERRAFORM_COST);
    expect(sim.drainEvents().filter((e) => e.type === 'tileChanged')).toHaveLength(4);
  });

  it('wielokrotne podnoszenie tworzy górkę – sąsiedzi dopasowują się sami', () => {
    const { sim, s } = flat();
    for (let i = 0; i < 4; i++) sim.enqueue({ type: 'terraform', vx: 10, vy: 10, delta: 1 });
    sim.step();
    expect(vertexHeight(s.map, 10, 10)).toBe(4);
    expect(vertexHeight(s.map, 12, 10)).toBe(2);
    expectSmooth(s);
  });

  it('nie wolno zmieniać terenu pod torem ani poniżej dna', () => {
    const { sim, s } = flat();
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 5, y: 5, track: Track.X }] });
    sim.step();
    sim.drainEvents();
    sim.enqueue({ type: 'terraform', vx: 5, vy: 5, delta: 1 });
    sim.enqueue({ type: 'terraform', vx: 2, vy: 2, delta: -1 });
    sim.step();
    expect(fails(sim)).toEqual(['blocked', 'tooHigh']);
    expect(vertexHeight(s.map, 5, 5)).toBe(0);
  });

  it('poziom morza: podniesiona woda staje się lądem, ląd obniżony na dno – wodą', () => {
    const { sim, s } = flat();
    // Ląd na poziomie 1, jezioro (narożniki na dnie) w środku.
    s.map.heights.fill(1);
    for (let vy = 8; vy <= 12; vy++) for (let vx = 8; vx <= 12; vx++) s.map.heights[vy * 21 + vx] = 0;
    for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) s.map.terrain[y * 20 + x] = Terrain.Water;
    // Podnieś narożnik w środku jeziora – cztery kafelki wokół wynurzają się.
    sim.enqueue({ type: 'terraform', vx: 10, vy: 10, delta: 1 });
    // Obniż narożnik lądu – kafelek, którego wszystkie narożniki są na dnie, zalewa woda.
    sim.enqueue({ type: 'terraform', vx: 13, vy: 9, delta: -1 });
    sim.enqueue({ type: 'terraform', vx: 13, vy: 10, delta: -1 });
    sim.step();
    expect(fails(sim)).toEqual([]);
    for (const [x, y] of [
      [9, 9],
      [10, 9],
      [9, 10],
      [10, 10],
    ] as const)
      expect(s.map.terrain[y * 20 + x]).toBe(Terrain.Grass);
    expect(s.map.terrain[8 * 20 + 8]).toBe(Terrain.Water);
    expect(s.map.terrain[9 * 20 + 12]).toBe(Terrain.Water);
    expect(s.map.terrain[9 * 20 + 13]).toBe(Terrain.Grass);
  });

  it('wyrównanie obszaru daje płaski teren, na którym da się postawić stację', () => {
    const { sim, s } = flat();
    // Zbocze: teren rośnie z x.
    const vw = 21;
    for (let vy = 0; vy <= 20; vy++)
      for (let vx = 0; vx <= 20; vx++) s.map.heights[vy * vw + vx] = Math.min(5, Math.max(0, vx - 5));
    sim.enqueue({ type: 'buildStation', x0: 8, y0: 4, x1: 11, y1: 4, axis: 'x' });
    sim.step();
    expect(fails(sim)).toEqual(['blocked']);
    // Wyrównaj prostokąt narożników do wysokości narożnika (8,3) = 3.
    sim.enqueue({ type: 'levelLand', vx0: 8, vy0: 3, vx1: 12, vy1: 5, level: 3 });
    sim.enqueue({ type: 'buildStation', x0: 8, y0: 4, x1: 11, y1: 4, axis: 'x' });
    sim.step();
    expect(fails(sim)).toEqual([]);
    for (let x = 8; x <= 11; x++) expect(isFlat(s.map, x, 4)).toBe(true);
    expectSmooth(s);
  });
});
