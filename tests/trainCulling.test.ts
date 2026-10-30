import { describe, expect, it } from 'vitest';
import { tileToWorldFlat } from '../src/render/iso';
import { trainInView } from '../src/render/trains';
import type { Train } from '../src/sim/trains/train';

const train = (tiles: [number, number][]) =>
  ({ trail: tiles.map(([x, y]) => ({ x, y, track: 1, entry: 0, exit: 2 })) }) as unknown as Train;

/** Widok 800×600 px wokół środka kafelka (x, y). */
const viewAt = (x: number, y: number) => {
  const c = tileToWorldFlat(x + 0.5, y + 0.5);
  return { x: c.x - 400, y: c.y - 300, w: 800, h: 600 };
};

describe('pociągi poza ekranem', () => {
  it('rysowany, gdy choć jeden kafelek pociągu jest w widoku (z zapasem na wysokość)', () => {
    const view = viewAt(50, 50);
    expect(trainInView(train([[50, 50]]), view)).toBe(true);
    // Czoło daleko, ostatni wagon jeszcze na ekranie.
    expect(
      trainInView(
        train([
          [80, 50],
          [52, 50],
        ]),
        view,
      ),
    ).toBe(true);
    expect(trainInView(train([[90, 90]]), view)).toBe(false);
    expect(trainInView(train([[10, 10]]), view)).toBe(false);
  });

  it('bez widoku (np. pierwsza klatka) – rysuje wszystko', () => {
    expect(trainInView(train([[900, 900]]), null)).toBe(true);
  });
});
