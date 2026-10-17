// Rzut izometryczny 2:1 jak w TTD. Istnieje tylko w warstwie render/.

export const TILE_W = 64;
export const TILE_H = 32;
/** Jeden poziom wysokości terenu w pikselach (jak w TTD przy kafelku 64 px). */
export const HEIGHT_PX = 8;

export interface Point {
  x: number;
  y: number;
}

/**
 * Wysokość terenu w punkcie (ułamkowe współrzędne kafelka), w poziomach. Ustawiana przez grę
 * dla bieżącej mapy; domyślnie teren płaski (testy, podglądy bez mapy).
 */
let heightProvider: (fx: number, fy: number) => number = () => 0;

export function setHeightProvider(fn: (fx: number, fy: number) => number): void {
  heightProvider = fn;
}

/** Rzut płaski (bez wysokości) – do odwracania rzutu i obliczeń kamery. */
export function tileToWorldFlat(x: number, y: number): Point {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

/** Punkt (x, y) w układzie logicznym na powierzchni terenu, we współrzędnych świata (px). */
export function tileToWorld(x: number, y: number): Point {
  const p = tileToWorldFlat(x, y);
  return { x: p.x, y: p.y - heightProvider(x, y) * HEIGHT_PX };
}

/** Środek kafelka na powierzchni terenu. */
export function tileCenter(x: number, y: number): Point {
  return tileToWorld(x + 0.5, y + 0.5);
}

/** Odwrotność rzutu płaskiego: punkt świata -> współrzędne kafelka (ułamkowe). */
export function worldToTileF(wx: number, wy: number): Point {
  return { x: wy / TILE_H + wx / TILE_W, y: wy / TILE_H - wx / TILE_W };
}

export function worldToTile(wx: number, wy: number): Point {
  const f = worldToTileF(wx, wy);
  return { x: Math.floor(f.x), y: Math.floor(f.y) };
}

/** Wierzchołki kafelka na powierzchni terenu: góra, prawo, dół, lewo. */
export function tileDiamond(x: number, y: number): number[] {
  const t = tileToWorld(x, y);
  const r = tileToWorld(x + 1, y);
  const b = tileToWorld(x + 1, y + 1);
  const l = tileToWorld(x, y + 1);
  return [t.x, t.y, r.x, r.y, b.x, b.y, l.x, l.y];
}

/**
 * Punkt świata (px) -> ułamkowe współrzędne kafelka na terenie z wysokościami.
 * Idziemy od najwyższego poziomu w dół: pierwszy punkt, który leży na terenie, jest widoczny.
 */
export function pickTile(wx: number, wy: number, maxHeight: number): Point {
  for (let z = maxHeight; z >= 0; z--) {
    let f = worldToTileF(wx, wy + z * HEIGHT_PX);
    // Doprecyzowanie: wysokość terenu w znalezionym punkcie.
    for (let k = 0; k < 3; k++) f = worldToTileF(wx, wy + heightProvider(f.x, f.y) * HEIGHT_PX);
    if (heightProvider(f.x, f.y) >= z - 0.5) return f;
  }
  return worldToTileF(wx, wy);
}
