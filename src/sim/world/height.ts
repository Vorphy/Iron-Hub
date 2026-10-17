import type { WorldMap } from './map';

/**
 * Wysokości terenu w narożnikach kafelków (jak w TTD): siatka (W+1)×(H+1).
 * Narożniki kafelka (x, y): góra (x, y), prawo (x+1, y), dół (x+1, y+1), lewo (x, y+1) – nazwy jak na ekranie.
 * Sąsiednie narożniki (w poziomie/pionie siatki) różnią się najwyżej o 1 poziom.
 */
export const MAX_HEIGHT = 8;

export function vertexIndex(map: WorldMap, vx: number, vy: number): number {
  return vy * (map.width + 1) + vx;
}

export function vertexHeight(map: WorldMap, vx: number, vy: number): number {
  return map.heights[vertexIndex(map, vx, vy)]!;
}

/** Wysokości narożników kafelka: [góra, prawo, dół, lewo]. */
export function cornerHeights(map: WorldMap, x: number, y: number): [number, number, number, number] {
  return [vertexHeight(map, x, y), vertexHeight(map, x + 1, y), vertexHeight(map, x + 1, y + 1), vertexHeight(map, x, y + 1)];
}

/** Wysokość w dowolnym punkcie (interpolacja dwuliniowa w kafelku) – do rysowania i pociągów. */
export function heightAt(map: WorldMap, fx: number, fy: number): number {
  const x = Math.min(map.width - 1, Math.max(0, Math.floor(fx)));
  const y = Math.min(map.height - 1, Math.max(0, Math.floor(fy)));
  const u = Math.min(1, Math.max(0, fx - x));
  const v = Math.min(1, Math.max(0, fy - y));
  const [t, r, b, l] = cornerHeights(map, x, y);
  return t * (1 - u) * (1 - v) + r * u * (1 - v) + b * u * v + l * (1 - u) * v;
}

/**
 * Rodzaj zbocza kafelka:
 * flat – płaski, x – pochylony wzdłuż osi X (tor X może wjechać pod górę), y – wzdłuż osi Y,
 * other – inne (narożnik, trzy narożniki, strome) – nie da się tu nic zbudować.
 */
export type Slope = 'flat' | 'x' | 'y' | 'other';

export function tileSlope(map: WorldMap, x: number, y: number): Slope {
  const [t, r, b, l] = cornerHeights(map, x, y);
  if (t === r && r === b && b === l) return 'flat';
  // Oś X biegnie od boku NW (narożniki l–t) do SE (r–b).
  if (t === l && r === b && Math.abs(t - r) === 1) return 'x';
  // Oś Y biegnie od boku NE (t–r) do SW (b–l).
  if (t === r && b === l && Math.abs(t - b) === 1) return 'y';
  return 'other';
}

export function isFlat(map: WorldMap, x: number, y: number): boolean {
  return tileSlope(map, x, y) === 'flat';
}

/** Wysokość płaskiego kafelka (dla zboczy – najniższy narożnik). */
export function tileBaseHeight(map: WorldMap, x: number, y: number): number {
  return Math.min(...cornerHeights(map, x, y));
}

/**
 * Wymusza ograniczenie „sąsiednie narożniki różnią się najwyżej o 1”, wyłącznie obniżając
 * (transformata odległości w dwóch przebiegach – wynik dokładny dla metryki miejskiej).
 */
export function relaxHeights(heights: Uint8Array, vw: number, vh: number): void {
  const at = (x: number, y: number) => heights[y * vw + x]!;
  for (let y = 0; y < vh; y++) {
    for (let x = 0; x < vw; x++) {
      let h = at(x, y);
      if (x > 0) h = Math.min(h, at(x - 1, y) + 1);
      if (y > 0) h = Math.min(h, at(x, y - 1) + 1);
      heights[y * vw + x] = h;
    }
  }
  for (let y = vh - 1; y >= 0; y--) {
    for (let x = vw - 1; x >= 0; x--) {
      let h = at(x, y);
      if (x < vw - 1) h = Math.min(h, at(x + 1, y) + 1);
      if (y < vh - 1) h = Math.min(h, at(x, y + 1) + 1);
      heights[y * vw + x] = h;
    }
  }
}
