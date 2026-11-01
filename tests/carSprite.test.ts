import { describe, expect, it } from 'vitest';
import { type CarModel, carModel, directionVector, rasterizeCar } from '../src/render/gfx/cars';
import { ttdDirection } from '../src/render/gfx/gfx';

const MODELS: CarModel[] = ['classic', 'sedan', 'hatch'];
const RED = 0xc0392b;

describe('sprite auta osobowego', () => {
  it('kierunki zgadzają się z ttdDirection', () => {
    for (let dir = 0; dir < 8; dir++) {
      const [dx, dy] = directionVector(dir);
      expect(ttdDirection(dx, dy)).toBe(dir);
    }
  });

  it('każdy model i kierunek ma piksele, a auto jest mniejsze od autobusu OpenGFX (20×16 wzdłuż drogi)', () => {
    for (const model of MODELS) {
      for (let dir = 0; dir < 8; dir++) {
        const r = rasterizeCar(model, dir, RED);
        expect(r.data.some((b, i) => i % 4 === 3 && b === 255)).toBe(true);
        if (dir % 2 === 1) {
          expect(r.w).toBeLessThan(20);
          expect(r.h).toBeLessThan(16);
        }
      }
    }
  });

  it('auto jadące wzdłuż drogi w przeciwne strony ma prawie ten sam rozmiar, a punkt zaczepienia leży w obrazku', () => {
    for (const model of MODELS) {
      // Kierunki wzdłuż osi drogi (ruch uliczny jeździ tylko nimi); w ukosnych kabina poza środkiem zmienia wysokość.
      for (const dir of [1, 3]) {
        const a = rasterizeCar(model, dir, RED);
        const b = rasterizeCar(model, dir + 4, RED);
        // Zaokrąglenie do pikseli może dać ±1 px różnicy między przeciwnymi kierunkami.
        expect(Math.abs(a.w - b.w)).toBeLessThanOrEqual(1);
        expect(Math.abs(a.h - b.h)).toBeLessThanOrEqual(1);
        expect(-a.ox).toBeGreaterThanOrEqual(0);
        expect(-a.ox).toBeLessThan(a.w);
        expect(-a.oy).toBeGreaterThan(0);
        expect(-a.oy).toBeLessThan(a.h);
      }
    }
  });

  it('nadwozie ma kolor auta, a szyby są ciemne', () => {
    const r = rasterizeCar('sedan', 3, RED);
    let reddish = 0;
    let dark = 0;
    for (let i = 0; i < r.data.length; i += 4) {
      if (r.data[i + 3] !== 255) continue;
      const [cr, cg, cb] = [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!];
      if (cr > cg * 2 && cr > cb * 2) reddish++;
      else if (cr < 80 && cg < 90 && cb < 110) dark++;
    }
    expect(reddish).toBeGreaterThan(20);
    expect(dark).toBeGreaterThan(5);
  });

  it('model zależy od epoki', () => {
    expect(carModel(1950, 1)).toBe('classic');
    expect(new Set([0, 1].map((v) => carModel(1970, v)))).toEqual(new Set(['classic', 'sedan']));
    expect(new Set([0, 1].map((v) => carModel(2000, v)))).toEqual(new Set(['sedan', 'hatch']));
  });
});
