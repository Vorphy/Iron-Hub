import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W, tileCenter, tileDiamond, tileToWorld, worldToTile } from '../src/render/iso';

describe('rzut izometryczny', () => {
  it('środek kafelka mapuje się z powrotem na ten sam kafelek', () => {
    for (let y = -3; y < 20; y++) {
      for (let x = -3; x < 20; x++) {
        const c = tileCenter(x, y);
        expect(worldToTile(c.x, c.y)).toEqual({ x, y });
      }
    }
  });

  it('punkty tuż wewnątrz narożników rombu należą do kafelka', () => {
    const [tx, ty, rx, ry, bx, by, lx, ly] = tileDiamond(5, 7) as [number, number, number, number, number, number, number, number];
    const e = 1;
    expect(worldToTile(tx, ty + e)).toEqual({ x: 5, y: 7 });
    expect(worldToTile(rx - e * 2, ry)).toEqual({ x: 5, y: 7 });
    expect(worldToTile(bx, by - e)).toEqual({ x: 5, y: 7 });
    expect(worldToTile(lx + e * 2, ly)).toEqual({ x: 5, y: 7 });
  });

  it('sąsiedzi leżą o pół kafelka w ukosie', () => {
    const a = tileToWorld(0, 0);
    expect(tileToWorld(1, 0)).toEqual({ x: a.x + TILE_W / 2, y: a.y + TILE_H / 2 });
    expect(tileToWorld(0, 1)).toEqual({ x: a.x - TILE_W / 2, y: a.y + TILE_H / 2 });
  });
});
