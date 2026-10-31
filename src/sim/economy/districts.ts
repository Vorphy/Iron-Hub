import { ECONOMY } from '../../data/economy';
import type { GameState } from '../state';
import { isFree } from '../world/generate';
import { inBounds } from '../world/map';
import { districtIndexAt, type District, type Town, townTiles } from './town';

const T = ECONOMY.town;

/** Promień wzrostu wokół środka dzielnicy (jak w `growTown`). */
const GROWTH_RADIUS = 12;
/** Środki dzielnic (wszystkich miast) nie bliżej niż tyle kafelków od siebie (w kwadracie). */
const MIN_CENTER_GAP = 9;
const EDGE_MARGIN = 3;

/** Nazwy dzielnic, gdy nie pasuje „Zatorze” ani strona świata. */
// biome-ignore format: zwarta lista nazw
const DISTRICT_NAMES = [
  'Osiedle Parowe', 'Osiedle Kolejarzy', 'Przedmieście', 'Zalesie', 'Podgórze', 'Osiedle Słoneczne',
  'Kolonia', 'Osiedle Robotnicze', 'Nowy Gród', 'Zielone Wzgórze', 'Osiedle Hutnicze', 'Zagrodzie',
  'Zawodzie', 'Zarzecze', 'Podlesie', 'Górki', 'Błonia', 'Łęgi', 'Osiedle Torowe', 'Osiedle Semaforowe',
  'Osiedle Węglowe', 'Osiedle Młynarskie', 'Nowe Miasto', 'Stare Przedmieście', 'Osiedle Ogrodowe', 'Osiedle Leśne',
  'Wygoda', 'Pod Lipami', 'Kamionka', 'Piaski', 'Glinki', 'Wrzosowisko', 'Osiedle Kwiatowe', 'Osiedle Parkowe',
  'Słoneczny Stok', 'Dolina', 'Wzgórze Kolejowe', 'Nowiny', 'Osiedle Maszynistów', 'Osiedle Zwrotniczych',
];

/**
 * Strona świata na ekranie (widok izometryczny): przesunięcie (dx, dy) na mapie to na ekranie
 * (dx − dy) w poziomie i (dx + dy) / 2 w pionie – w górę to północ.
 */
function screenDirection(dx: number, dy: number): string {
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  if (Math.abs(sx) >= Math.abs(sy)) return sx > 0 ? 'Wschód' : 'Zachód';
  return sy < 0 ? 'Północ' : 'Południe';
}

/** Między środkami leży tor na powierzchni – nowa dzielnica jest „za torami”. */
function trackBetween(state: GameState, a: District, x: number, y: number): boolean {
  const { map } = state;
  const steps = Math.max(Math.abs(x - a.x), Math.abs(y - a.y));
  for (let s = 1; s < steps; s++) {
    const i = Math.round(a.y + ((y - a.y) * s) / steps) * map.width + Math.round(a.x + ((x - a.x) * s) / steps);
    if (map.track[i] && !map.bridge[i] && !map.tunnel[i]) return true;
  }
  return false;
}

/** Nazwy miast i dzielnic na całej mapie – nowa nazwa nie może się powtórzyć. */
function takenNames(state: GameState): Set<string> {
  return new Set(state.towns.flatMap((t) => [t.name, ...t.districts.map((d) => d.name)]));
}

/** Pierwsza wolna nazwa z listy osiedli, a gdy zabraknie – „Osiedle N”. */
function freeListName(taken: Set<string>): string {
  for (const name of DISTRICT_NAMES) if (!taken.has(name)) return name;
  let n = 1;
  while (taken.has(`Osiedle ${n}`)) n++;
  return `Osiedle ${n}`;
}

/** Nazwa nowej dzielnicy (niepowtarzalna na mapie): „Zatorze”, strona świata albo z listy. */
export function districtName(state: GameState, town: Town, parent: District, x: number, y: number): string {
  const taken = takenNames(state);
  const options = [
    ...(trackBetween(state, parent, x, y) ? ['Zatorze'] : []),
    `${town.name}-${screenDirection(x - town.x, y - town.y)}`,
  ];
  for (const name of options) if (!taken.has(name)) return name;
  return freeListName(taken);
}

/**
 * Powtórzone nazwy dzielnic (ze starszych wersji gry albo po wchłonięciu miasta z tak samo nazwaną
 * dzielnicą): późniejsze dostają wolną nazwę z listy. Centrów nie ruszamy. Zwraca, czy coś zmieniono.
 */
export function renameDuplicateDistricts(state: GameState): boolean {
  const seen = new Set(state.towns.map((t) => t.name));
  for (const t of state.towns) seen.add(t.districts[0]!.name);
  let changed = false;
  for (const t of state.towns) {
    for (const d of t.districts.slice(1)) {
      if (seen.has(d.name)) {
        d.name = freeListName(new Set([...seen, ...takenNames(state)]));
        changed = true;
      }
      seen.add(d.name);
    }
  }
  return changed;
}

/**
 * Nowa dzielnica przy brzegu zabudowy: `newDistrictStep` kafelków od środka istniejącej dzielnicy
 * (8 kierunków), z dala od innych środków, z wolnym terenem pod domy. Wolne kafelki liczą się z wagą
 * `prefer` (np. bliskość stacji), więc miasto chętniej rośnie w stronę kolei. Null – nie ma miejsca.
 */
export function foundDistrict(state: GameState, town: Town, prefer: (i: number) => number = () => 1): District | null {
  const { map } = state;
  const step = T.newDistrictStep;
  const diag = Math.round(step * 0.75);
  const offsets = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
    [diag, diag],
    [-diag, diag],
    [diag, -diag],
    [-diag, -diag],
  ] as const;
  const centers = state.towns.flatMap((t) => t.districts);
  let best: { x: number; y: number; parent: District; score: number } | null = null;
  for (const parent of town.districts) {
    for (const [dx, dy] of offsets) {
      const x = parent.x + dx;
      const y = parent.y + dy;
      if (x < EDGE_MARGIN || y < EDGE_MARGIN || x >= map.width - EDGE_MARGIN || y >= map.height - EDGE_MARGIN) continue;
      if (centers.some((c) => Math.abs(c.x - x) < MIN_CENTER_GAP && Math.abs(c.y - y) < MIN_CENTER_GAP)) continue;
      let free = 0;
      let houses = 0;
      let score = 0;
      for (let ty = y - GROWTH_RADIUS; ty <= y + GROWTH_RADIUS; ty++) {
        for (let tx = x - GROWTH_RADIUS; tx <= x + GROWTH_RADIUS; tx++) {
          if (!inBounds(map, tx, ty)) continue;
          if (map.town[ty * map.width + tx] === town.id) houses++;
          if (!isFree(map, tx, ty)) continue;
          free++;
          score += prefer(ty * map.width + tx);
        }
      }
      // Wzrost idzie od istniejących domów – bez nich w promieniu dzielnica zostałaby pusta.
      if (free < T.newDistrictMinFree || houses < T.newDistrictMinHouses) continue;
      if (!best || score > best.score) best = { x, y, parent, score };
    }
  }
  if (!best) return null;
  const district = { name: districtName(state, town, best.parent, best.x, best.y), x: best.x, y: best.y };
  town.districts.push(district);
  return district;
}

/**
 * Usuwa dzielnice bez żadnego domu (poza centrum) – np. założone w polu przez starszą wersję gry.
 * Zwraca, czy coś usunięto.
 */
export function pruneEmptyDistricts(state: GameState, town: Town): boolean {
  if (town.districts.length < 2) return false;
  const { map } = state;
  const used = new Set<number>([0]);
  for (const i of townTiles(state, town)) used.add(districtIndexAt(town, i % map.width, Math.floor(i / map.width)));
  if (used.size === town.districts.length) return false;
  town.districts = town.districts.filter((_, k) => used.has(k));
  return true;
}
