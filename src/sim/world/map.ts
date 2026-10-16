import { createRng, nextFloat, type Rng } from '../rng';

export const Terrain = {
  Grass: 0,
  Water: 1,
  Rough: 2,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** Mapa kafelków we współrzędnych logicznych (x, y). Symulacja nie zna rzutu izometrycznego. */
export interface WorldMap {
  width: number;
  height: number;
  /** terrain[y * width + x] */
  terrain: Uint8Array;
  /** Bitmaska elementów toru na kafelku (patrz track/track.ts), indeks jak terrain. */
  track: Uint8Array;
  /** Id stacji na kafelku (0 – brak), indeks jak terrain. */
  station: Uint32Array;
}

export function inBounds(map: WorldMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function getTerrain(map: WorldMap, x: number, y: number): Terrain {
  return map.terrain[y * map.width + x] as Terrain;
}

export function setTerrain(map: WorldMap, x: number, y: number, t: Terrain): void {
  map.terrain[y * map.width + x] = t;
}

const NOISE_CELL = 8;
const WATER_LEVEL = 0.3;
const ROUGH_LEVEL = 0.72;

/** Płaska mapa z jeziorami i nieużytkami (szum wartości, interpolacja dwuliniowa). */
export function generateMap(width: number, height: number, seed: number): WorldMap {
  const rng = createRng(seed);
  const water = noiseField(rng, width, height);
  const rough = noiseField(rng, width, height);
  const terrain = new Uint8Array(width * height);
  for (let i = 0; i < terrain.length; i++) {
    if (water[i]! < WATER_LEVEL) terrain[i] = Terrain.Water;
    else if (rough[i]! > ROUGH_LEVEL) terrain[i] = Terrain.Rough;
    else terrain[i] = Terrain.Grass;
  }
  return { width, height, terrain, track: new Uint8Array(width * height), station: new Uint32Array(width * height) };
}

function noiseField(rng: Rng, width: number, height: number): Float32Array {
  const gw = Math.ceil(width / NOISE_CELL) + 1;
  const gh = Math.ceil(height / NOISE_CELL) + 1;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = nextFloat(rng);

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / NOISE_CELL;
      const gy = y / NOISE_CELL;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = smooth(gx - x0);
      const ty = smooth(gy - y0);
      const a = grid[y0 * gw + x0]!;
      const b = grid[y0 * gw + x0 + 1]!;
      const c = grid[(y0 + 1) * gw + x0]!;
      const d = grid[(y0 + 1) * gw + x0 + 1]!;
      out[y * width + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    }
  }
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
