import { emptyIndustryMonth, INDUSTRY_DEFS, type IndustryDef } from '../economy/industry';
import { emptyTownMonth, isStreet, MAX_HOUSE_LEVEL, TOWN_NAMES, type Town } from '../economy/town';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import type { GameState } from '../state';
import { isFlat, tileBaseHeight } from './height';
import { getTerrain, hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from './map';

/** Powierzchnia mapy, dla której podane są liczby miast i zakładów (128×128). */
const REFERENCE_AREA = 128 * 128;
const TOWNS_PER_REFERENCE = 8;
const MIN_TOWN_DISTANCE = 18;
const MIN_INDUSTRY_TOWN_DISTANCE = 9;
const MIN_INDUSTRY_DISTANCE = 6;
const EDGE_MARGIN = 5;

/** Rozmieszcza miasta i przemysł na świeżej mapie (osobny PRNG z ziarna mapy – determinizm). */
export function generateWorld(state: GameState, seed: number): void {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const scale = (state.map.width * state.map.height) / REFERENCE_AREA;
  placeTowns(state, rng, Math.max(1, Math.round(TOWNS_PER_REFERENCE * scale)));
  for (const def of INDUSTRY_DEFS) {
    const count = Math.max(def.perMap > 0 ? 1 : 0, Math.round(def.perMap * scale));
    for (let i = 0; i < count; i++) placeIndustry(state, rng, def);
  }
}

function isLand(map: WorldMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && getTerrain(map, x, y) !== Terrain.Water;
}

/** Wolny, płaski kafelek lądu – tylko na takich stawiamy domy i zakłady. */
function isFree(map: WorldMap, x: number, y: number): boolean {
  if (!isLand(map, x, y) || !isFlat(map, x, y)) return false;
  const i = y * map.width + x;
  return !hasBuilding(map, i) && !map.track[i] && !map.station[i] && !map.depot[i];
}

function placeTowns(state: GameState, rng: Rng, count: number): void {
  const { map } = state;
  const names = [...TOWN_NAMES];
  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = nextInt(rng, EDGE_MARGIN + 2, map.width - EDGE_MARGIN - 2);
      const y = nextInt(rng, EDGE_MARGIN + 2, map.height - EDGE_MARGIN - 2);
      if (!landAround(map, x, y, 3)) continue;
      if (state.towns.some((t) => Math.abs(t.x - x) + Math.abs(t.y - y) < MIN_TOWN_DISTANCE)) continue;
      const name = names.splice(nextInt(rng, 0, names.length), 1)[0] ?? `Miasto ${n + 1}`;
      const town: Town = { id: state.towns.length + 1, name, x, y, month: emptyTownMonth(), lastTransported: 0 };
      state.towns.push(town);
      growTown(state, rng, town, nextInt(rng, 8, 30));
      break;
    }
  }
}

/** Czy w promieniu r wokół (x, y) jest prawie sam płaski ląd (miejsce na miasto). */
function landAround(map: WorldMap, x: number, y: number, r: number): boolean {
  let flat = 0;
  let total = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      total++;
      if (isLand(map, x + dx, y + dy) && isFlat(map, x + dx, y + dy)) flat++;
    }
  }
  return flat >= total * 0.75;
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Dokłada domy obok istniejącej zabudowy (poza ulicami). Wyższa zabudowa bliżej rynku.
 * `prefer` – opcjonalna waga kafelka (np. bliskość stacji), żeby miasto rosło w stronę kolei.
 */
export function growTown(
  state: GameState,
  rng: Rng,
  town: Town,
  houses: number,
  prefer?: (i: number) => number,
): number {
  const { map } = state;
  let built = 0;
  for (let h = 0; h < houses; h++) {
    const candidates: number[] = [];
    const weights: number[] = [];
    const consider = (x: number, y: number) => {
      if (!isFree(map, x, y) || isStreet(town, x, y)) return;
      const i = y * map.width + x;
      if (candidates.includes(i)) return;
      candidates.push(i);
      weights.push(prefer ? prefer(i) : 1);
    };
    // Sąsiedzi istniejących domów miasta; dla pustego miasta – okolica rynku.
    const R = 12;
    let any = false;
    for (let y = town.y - R; y <= town.y + R; y++) {
      for (let x = town.x - R; x <= town.x + R; x++) {
        if (!inBounds(map, x, y) || map.town[y * map.width + x] !== town.id) continue;
        any = true;
        // Przez ulicę też można przejść – kwartały po drugiej stronie.
        for (const [dx, dy] of NEIGHBORS) {
          consider(x + dx, y + dy);
          if (isStreet(town, x + dx, y + dy)) consider(x + 2 * dx, y + 2 * dy);
        }
      }
    }
    if (!any) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) consider(town.x + dx, town.y + dy);
    if (candidates.length === 0) break;
    const i = candidates[pickWeighted(rng, weights)]!;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const dist = Math.abs(x - town.x) + Math.abs(y - town.y);
    const maxLevel = dist <= 3 ? MAX_HOUSE_LEVEL : dist <= 6 ? 3 : 2;
    map.house[i] = nextInt(rng, 1, maxLevel + 1);
    map.town[i] = town.id;
    if (getTerrain(map, x, y) === Terrain.Rough) setTerrain(map, x, y, Terrain.Grass);
    built++;
  }
  return built;
}

export function pickWeighted(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = nextFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function placeIndustry(state: GameState, rng: Rng, def: IndustryDef): void {
  const { map } = state;
  const [w, h] = def.size;
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = nextInt(rng, EDGE_MARGIN, map.width - EDGE_MARGIN - w);
    const y = nextInt(rng, EDGE_MARGIN, map.height - EDGE_MARGIN - h);
    let ok = true;
    // Teren pod zakładem płaski i na jednym poziomie; wokół – margines wolnego terenu.
    const level = tileBaseHeight(map, x, y);
    for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w && ok; dx++) ok = tileBaseHeight(map, x + dx, y + dy) === level;
    for (let dy = -1; dy <= h && ok; dy++) {
      for (let dx = -1; dx <= w && ok; dx++) {
        const inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
        ok = inside ? isFree(map, x + dx, y + dy) : isLand(map, x + dx, y + dy);
      }
    }
    if (!ok) continue;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (state.towns.some((t) => Math.abs(t.x - cx) + Math.abs(t.y - cy) < MIN_INDUSTRY_TOWN_DISTANCE)) continue;
    if (state.industries.some((o) => Math.abs(o.x - x) + Math.abs(o.y - y) < MIN_INDUSTRY_DISTANCE + w)) continue;
    const id = state.industries.length + 1;
    const near = nearestTownName(state, cx, cy);
    state.industries.push({
      id,
      type: def.id,
      name: near ? `${def.name} ${near}` : def.name,
      x,
      y,
      level: nextInt(rng, 1, 3),
      growth: 0,
      month: emptyIndustryMonth(),
      history: [],
    });
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        map.industry[(y + dy) * map.width + x + dx] = id;
        if (getTerrain(map, x + dx, y + dy) === Terrain.Rough) setTerrain(map, x + dx, y + dy, Terrain.Grass);
      }
    }
    return;
  }
}

/** Dopisek do nazwy zakładu: najbliższe miasto, np. „Kopalnia węgla (Żelazowo)”. */
function nearestTownName(state: GameState, x: number, y: number): string | null {
  let best: Town | null = null;
  let bestD = Infinity;
  for (const t of state.towns) {
    const d = Math.abs(t.x - x) + Math.abs(t.y - y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best ? `(${best.name})` : null;
}
