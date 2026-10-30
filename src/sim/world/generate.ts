import { emptyIndustryMonth, INDUSTRY_DEFS, type IndustryDef, isPrimary } from '../economy/industry';
import { ECONOMY } from '../../data/economy';
import {
  districtIndexAt,
  forEachTownTile,
  HOUSE_CHURCH,
  HOUSE_ORNAMENT,
  isStreet,
  MAX_HOUSE_LEVEL,
  newTown,
  TOWN_NAMES,
  townNameGenerator,
  type Town,
} from '../economy/town';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import type { GameState } from '../state';
import { isFlat, tileBaseHeight } from './height';
import { updateTownRoads } from './roads';
import { getTerrain, hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from './map';

const T = ECONOMY.town;

/** Powierzchnia mapy, dla której podane są liczby miast i zakładów (128×128). */
const REFERENCE_AREA = 128 * 128;
const TOWNS_PER_REFERENCE = 8;
const MIN_TOWN_DISTANCE = 18;
const MIN_INDUSTRY_TOWN_DISTANCE = 9;
const MIN_INDUSTRY_DISTANCE = 6;
const EDGE_MARGIN = 5;

/** Gęstość miast / przemysłu przy nowej grze: 0 – brak, 1 – mało, 2 – normalnie, 3 – dużo. */
export type Density = 0 | 1 | 2 | 3;
export const DENSITIES: readonly Density[] = [0, 1, 2, 3];
export const DENSITY_NAMES: Record<Density, string> = { 0: 'Brak', 1: 'Mało', 2: 'Normalnie', 3: 'Dużo' };
/** Część pełnej liczby („dużo” = dotychczasowa gęstość map). */
const DENSITY_FACTOR: Record<Density, number> = { 0: 0, 1: 0.3, 2: 0.6, 3: 1 };
export const DEFAULT_DENSITY: Density = 3;

export function isDensity(v: number): v is Density {
  return (DENSITIES as readonly number[]).includes(v);
}

/**
 * Ile miast i zakładów (każdego typu) powstanie na mapie danej wielkości. Osobno: przemysł
 * (przetwórnie: elektrownia, huta, tartak) i surowce (kopalnie, lasy).
 */
export function worldCounts(width: number, height: number, towns: Density, industry: Density, resources: Density = industry) {
  const scale = (width * height) / REFERENCE_AREA;
  const tk = DENSITY_FACTOR[towns];
  const perType = INDUSTRY_DEFS.map((def) => {
    const k = DENSITY_FACTOR[isPrimary(def) ? resources : industry];
    return { def, count: k === 0 || def.perMap <= 0 ? 0 : Math.max(1, Math.round(def.perMap * scale * k)) };
  });
  const sum = (primary: boolean) => perType.filter((t) => isPrimary(t.def) === primary).reduce((s, t) => s + t.count, 0);
  return {
    towns: tk === 0 ? 0 : Math.max(1, Math.round(TOWNS_PER_REFERENCE * scale * tk)),
    perType,
    industries: sum(false) + sum(true),
    factories: sum(false),
    mines: sum(true),
  };
}

/** Tryb własny nowej gry: dokładne liczby miast i zakładów każdego typu (id z industries.json). */
export interface CustomCounts {
  towns: number;
  industries: Record<string, number>;
}

/** Górna granica pól trybu własnego: 3× „dużo” (i co najmniej 5) – więcej i tak się nie zmieści. */
export function customLimits(width: number, height: number): CustomCounts {
  const full = worldCounts(width, height, 3, 3, 3);
  return {
    towns: Math.max(5, full.towns * 3),
    industries: Object.fromEntries(full.perType.map((t) => [t.def.id, Math.max(5, t.count * 3)])),
  };
}

/** Liczby trybu własnego w tej samej postaci co z poziomów gęstości. */
export function customCounts(custom: CustomCounts) {
  const perType = INDUSTRY_DEFS.map((def) => ({ def, count: Math.max(0, Math.floor(custom.industries[def.id] ?? 0)) }));
  const sum = (primary: boolean) => perType.filter((t) => isPrimary(t.def) === primary).reduce((s, t) => s + t.count, 0);
  return {
    towns: Math.max(0, Math.floor(custom.towns)),
    perType,
    industries: sum(false) + sum(true),
    factories: sum(false),
    mines: sum(true),
  };
}

/** Rozmieszcza miasta i przemysł na świeżej mapie (osobny PRNG z ziarna mapy – determinizm). */
export function generateWorld(
  state: GameState,
  seed: number,
  towns: Density = DEFAULT_DENSITY,
  industry: Density = DEFAULT_DENSITY,
  resources: Density = DEFAULT_DENSITY,
  custom: CustomCounts | null = null,
): void {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const counts = custom ? customCounts(custom) : worldCounts(state.map.width, state.map.height, towns, industry, resources);
  placeTowns(state, rng, seed, counts.towns);
  for (const { def, count } of counts.perType) {
    for (let i = 0; i < count; i++) placeIndustry(state, rng, def);
  }
  for (const town of state.towns) updateTownRoads(state, town);
}

function isLand(map: WorldMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && getTerrain(map, x, y) !== Terrain.Water;
}

/** Wolny, płaski kafelek lądu – tylko na takich stawiamy domy i zakłady. */
function isFree(map: WorldMap, x: number, y: number): boolean {
  if (!isLand(map, x, y) || !isFlat(map, x, y)) return false;
  const i = y * map.width + x;
  return !hasBuilding(map, i) && !map.track[i] && !map.station[i] && !map.depot[i] && !map.road[i];
}

function placeTowns(state: GameState, rng: Rng, seed: number, count: number): void {
  const { map } = state;
  // Najpierw losowo spośród podstawowych nazw, potem z generatora (duże mapy).
  const base = [...TOWN_NAMES];
  const extra = townNameGenerator(seed, TOWN_NAMES);
  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = nextInt(rng, EDGE_MARGIN + 2, map.width - EDGE_MARGIN - 2);
      const y = nextInt(rng, EDGE_MARGIN + 2, map.height - EDGE_MARGIN - 2);
      if (!landAround(map, x, y, 3)) continue;
      if (state.towns.some((t) => Math.abs(t.x - x) + Math.abs(t.y - y) < MIN_TOWN_DISTANCE)) continue;
      const name = base.length ? base.splice(nextInt(rng, 0, base.length), 1)[0]! : extra();
      const town = newTown(state.towns.length + 1, name, x, y);
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

/** Najszerszy pas ulic i torów (kafelki), przez który miasto przechodzi z zabudową – np. podwójny skośny tor. */
const MAX_CROSSING = 4;

/** Kafelek, nad którym zabudowa „przeskakuje”: ulica albo tor (bez stacji i zajezdni). */
function crossable(map: WorldMap, town: Town, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  return isStreet(town, x, y) || (!!map.track[i] && !map.station[i] && !map.depot[i]);
}

/**
 * Dokłada domy obok istniejącej zabudowy (poza ulicami). Wyższa zabudowa bliżej rynku.
 * `prefer` – opcjonalna waga kafelka (np. bliskość stacji), żeby miasto rosło w stronę kolei.
 */
export function growTown(state: GameState, rng: Rng, town: Town, houses: number, prefer?: (i: number) => number): number {
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
    let homes = 0;
    let ornaments = 0;
    let church = false;
    forEachTownTile(map, town, R, (x, y, i) => {
      if (map.town[i] !== town.id) return;
      any = true;
      const kind = map.house[i]!;
      if (kind === HOUSE_CHURCH) church = true;
      else if (kind === HOUSE_ORNAMENT) ornaments++;
      else if (kind) homes++;
      // Przez ulicę i tory też można przejść – kwartały po drugiej stronie (skośny tor to
      // „schodki” z kafelków, więc bez tego zamykałby miastu drogę).
      for (const [dx, dy] of NEIGHBORS) {
        consider(x + dx, y + dy);
        let k = 1;
        while (k <= MAX_CROSSING && crossable(map, town, x + k * dx, y + k * dy)) k++;
        if (k > 1) consider(x + k * dx, y + k * dy);
      }
    });
    if (!any)
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const)
        consider(town.x + dx, town.y + dy);
    if (candidates.length === 0) break;
    const i = candidates[pickWeighted(rng, weights)]!;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const center = town.districts[districtIndexAt(town, x, y)]!;
    const dist = Math.abs(x - center.x) + Math.abs(y - center.y);
    const maxLevel = dist <= 3 ? MAX_HOUSE_LEVEL : dist <= 6 ? 3 : 2;
    // Blisko rynku: kościół (jeden na miasto) albo – rzadko – park, staw, pomnik czy fontanna.
    if (dist <= T.ornamentRadius && !church && homes >= T.churchMinHouses) map.house[i] = HOUSE_CHURCH;
    else if (
      dist <= T.ornamentRadius &&
      ornaments < 1 + Math.floor(homes / T.housesPerOrnament) &&
      nextFloat(rng) < T.ornamentChance
    )
      map.house[i] = HOUSE_ORNAMENT;
    else map.house[i] = nextInt(rng, 1, maxLevel + 1);
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
