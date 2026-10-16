// Rzut izometryczny 2:1 jak w TTD. Istnieje tylko w warstwie render/.

export const TILE_W = 64;
export const TILE_H = 32;

export interface Point {
  x: number;
  y: number;
}

/** Górny narożnik rombu kafelka (x, y) we współrzędnych świata (px). */
export function tileToWorld(x: number, y: number): Point {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

/** Środek rombu kafelka. */
export function tileCenter(x: number, y: number): Point {
  const p = tileToWorld(x, y);
  return { x: p.x, y: p.y + TILE_H / 2 };
}

/** Odwrotność rzutu: punkt świata -> współrzędne kafelka (ułamkowe). */
export function worldToTileF(wx: number, wy: number): Point {
  return { x: wy / TILE_H + wx / TILE_W, y: wy / TILE_H - wx / TILE_W };
}

export function worldToTile(wx: number, wy: number): Point {
  const f = worldToTileF(wx, wy);
  return { x: Math.floor(f.x), y: Math.floor(f.y) };
}

/** Wierzchołki rombu kafelka: góra, prawo, dół, lewo. */
export function tileDiamond(x: number, y: number): number[] {
  const { x: sx, y: sy } = tileToWorld(x, y);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  return [sx, sy, sx + hw, sy + hh, sx, sy + TILE_H, sx - hw, sy + hh];
}
