import { createRng, nextFloat, type Rng } from '../rng';
import { MAX_HEIGHT, relaxHeights } from './height';

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
  /** Id zajezdni na kafelku (0 – brak), indeks jak terrain. */
  depot: Uint32Array;
  /** Poziom domu na kafelku (0 – brak, 1–4), indeks jak terrain. */
  house: Uint8Array;
  /** Id miasta, do którego należy dom (0 – brak). */
  town: Uint16Array;
  /** Id zakładu przemysłowego na kafelku (0 – brak). */
  industry: Uint32Array;
  /** Wysokości narożników kafelków, siatka (width+1)×(height+1) – patrz height.ts. */
  heights: Uint8Array;
}

/** Na kafelku stoi budynek (dom lub zakład) – nie da się tu nic zbudować. */
export function hasBuilding(map: WorldMap, i: number): boolean {
  return map.house[i] !== 0 || map.industry[i] !== 0;
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
const HILL_CELL = 20;
const WATER_LEVEL = 0.3;
const ROUGH_LEVEL = 0.72;
/** Teren niżej niż ten próg szumu zostaje na poziomie 0 (niziny wokół wody). */
const LOWLAND = 0.35;

/** Mapa z jeziorami, nieużytkami i wzgórzami (szum wartości, interpolacja dwuliniowa). */
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
  const n = width * height;
  return {
    width,
    height,
    heights: generateHeights(rng, width, height, terrain),
    terrain,
    track: new Uint8Array(n),
    station: new Uint32Array(n),
    depot: new Uint32Array(n),
    house: new Uint8Array(n),
    town: new Uint16Array(n),
    industry: new Uint32Array(n),
  };
}

/**
 * Wysokości narożników: szerokie wzgórza (dwie skale szumu), kwantyzowane na poziomy – stąd
 * płaskie tarasy, na których da się budować. Woda zawsze na poziomie 0, brzegi łagodne.
 */
function generateHeights(rng: Rng, width: number, height: number, terrain: Uint8Array): Uint8Array {
  const vw = width + 1;
  const vh = height + 1;
  const broad = noiseField(rng, vw, vh, HILL_CELL);
  const detail = noiseField(rng, vw, vh, NOISE_CELL);
  const heights = new Uint8Array(vw * vh);
  for (let i = 0; i < heights.length; i++) {
    const e = broad[i]! * 0.7 + detail[i]! * 0.3;
    const level = Math.floor((Math.max(0, e - LOWLAND) / (1 - LOWLAND)) * (MAX_HEIGHT + 2));
    heights[i] = Math.min(MAX_HEIGHT, level);
  }
  // Narożniki kafelków wody na poziomie 0.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (terrain[y * width + x] !== Terrain.Water) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) heights[(y + dy) * vw + x + dx] = 0;
    }
  }
  relaxHeights(heights, vw, vh);
  return heights;
}

function noiseField(rng: Rng, width: number, height: number, cell = NOISE_CELL): Float32Array {
  const gw = Math.ceil(width / cell) + 1;
  const gh = Math.ceil(height / cell) + 1;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = nextFloat(rng);

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / cell;
      const gy = y / cell;
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
