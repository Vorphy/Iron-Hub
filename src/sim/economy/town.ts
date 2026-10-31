import { ECONOMY } from '../../data/economy';
import type { SimEvent } from '../commands';
import type { GameState } from '../state';
import { createRng, nextFloat, nextInt } from '../rng';
import { inBounds } from '../world/map';

/** Mieszkańcy domu w zależności od poziomu zabudowy (1–4). */
export const HOUSE_POPULATION: readonly number[] = ECONOMY.town.housePopulation;
export const MAX_HOUSE_LEVEL = 4;
/** Wartości warstwy `house` poza poziomami 1–4: ozdoba (park, pomnik…) i kościół – bez mieszkańców. */
export const HOUSE_ORNAMENT = 5;
export const HOUSE_CHURCH = 6;
/** Etapy budowy domu (warstwa `houseBuild`: ile etapów zostało; 0 – gotowy). */
export const HOUSE_BUILD_STAGES = 3;
export const CONSTRUCTION_STAGE_DAYS = ECONOMY.town.constructionStageDays;

/** Dom zaczyna się budować od nowa – po wzroście miasta albo rozbudowie. */
export function startHouseConstruction(state: GameState, i: number): void {
  state.map.houseBuild[i] = HOUSE_BUILD_STAGES;
}

/** Co `CONSTRUCTION_STAGE_DAYS` dni: budowane domy przechodzą do następnego etapu. */
export function advanceHouseConstruction(state: GameState, events: SimEvent[]): void {
  const { map } = state;
  for (let i = 0; i < map.houseBuild.length; i++) {
    if (!map.houseBuild[i]) continue;
    map.houseBuild[i]!--;
    events.push({ type: 'tileChanged', x: i % map.width, y: Math.floor(i / map.width) });
  }
}

export interface TownMonth {
  passengers: number;
  passengersTransported: number;
  mail: number;
  mailTransported: number;
  /** Pasażerowie dowiezieni między dzielnicami miasta (z premią). */
  interDistrict: number;
}

export interface Town {
  id: number;
  name: string;
  /** Środek miasta (rynek). */
  x: number;
  y: number;
  month: TownMonth;
  /** Odsetek przewiezionych pasażerów w poprzednim miesiącu (0–1). */
  lastTransported: number;
  /** Dzielnice; pierwsza to centrum na rynku (`x`, `y`). Miasto = suma ich obszarów. */
  districts: District[];
  /** Miasto już ogłosiło, że chce metra (komunikat tylko raz). */
  metroDemand?: boolean;
  /**
   * Od `months` miesięcy (bez przerwy) styka się z innym miastem; `townId` – największy sąsiad.
   * Po roku większy sąsiad przejmuje miasto.
   */
  contact?: { townId: number; months: number };
}

/** Dzielnica miasta: środek (własna siatka ulic i obszar zabudowy) i nazwa. */
export interface District {
  name: string;
  x: number;
  y: number;
}

export const CENTER_DISTRICT_NAME = 'Centrum';

/**
 * Nazwa dzielnicy do pokazania: z nazwą miasta, np. „Bocznica – Torzyce”. Starsze nazwy stron świata
 * zapisane razem z nazwą miasta („Bocznica-Północ”) – bez powtórzenia miasta.
 */
export function districtLabel(town: Town, d: District): string {
  const name = d.name.startsWith(`${town.name}-`) ? d.name.slice(town.name.length + 1) : d.name;
  return `${town.name} – ${name}`;
}

export function emptyTownMonth(): TownMonth {
  return { passengers: 0, passengersTransported: 0, mail: 0, mailTransported: 0, interDistrict: 0 };
}

/** Nowe miasto z jedną dzielnicą – centrum na rynku. */
export function newTown(id: number, name: string, x: number, y: number): Town {
  return { id, name, x, y, districts: [{ name: CENTER_DISTRICT_NAME, x, y }], month: emptyTownMonth(), lastTransported: 0 };
}

/** Dzielnica, do której należy kafelek: ta z najbliższym środkiem (przy remisie – wcześniejsza). */
export function districtIndexAt(town: Town, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < town.districts.length; k++) {
    const d = town.districts[k]!;
    const dist = Math.abs(x - d.x) + Math.abs(y - d.y);
    if (dist < bestD) {
      bestD = dist;
      best = k;
    }
  }
  return best;
}

/** Miasto i dzielnica pod punktem (np. środkiem stacji); null – poza obszarem miast. */
export function districtAtPoint(state: GameState, px: number, py: number): { town: Town; district: number } | null {
  const x = Math.round(px);
  const y = Math.round(py);
  let best: { town: Town; district: number } | null = null;
  let bestD = Infinity;
  for (const town of state.towns) {
    if (!inTownArea(town, x, y)) continue;
    const k = districtIndexAt(town, x, y);
    const d = town.districts[k]!;
    const dist = Math.abs(x - d.x) + Math.abs(y - d.y);
    if (dist < bestD) {
      bestD = dist;
      best = { town, district: k };
    }
  }
  return best;
}

/** Kafelek leży w kwadracie ±`extent` wokół środka którejś dzielnicy. */
export function inTownArea(town: Town, x: number, y: number, extent = TOWN_EXTENT): boolean {
  return town.districts.some((d) => Math.abs(x - d.x) <= extent && Math.abs(y - d.y) <= extent);
}

/**
 * Przechodzi po obszarze miasta: kwadratach ±`extent` wokół środków dzielnic (przycięte do mapy),
 * każdy kafelek raz – część wspólna z wcześniejszą dzielnicą jest pomijana.
 */
export function forEachTownTile(
  map: { width: number; height: number },
  town: Town,
  extent: number,
  fn: (x: number, y: number, i: number) => void,
): void {
  const ds = town.districts;
  for (let k = 0; k < ds.length; k++) {
    const d = ds[k]!;
    for (let y = Math.max(0, d.y - extent); y <= Math.min(map.height - 1, d.y + extent); y++) {
      for (let x = Math.max(0, d.x - extent); x <= Math.min(map.width - 1, d.x + extent); x++) {
        let seen = false;
        for (let j = 0; j < k && !seen; j++) seen = Math.abs(x - ds[j]!.x) <= extent && Math.abs(y - ds[j]!.y) <= extent;
        if (!seen) fn(x, y, y * map.width + x);
      }
    }
  }
}

/** Fikcyjne nazwy miast. */
// biome-ignore format: zwarta lista nazw
export const TOWN_NAMES = [
  'Żelazowo', 'Stalówka', 'Kolejno', 'Węglewo', 'Parowice', 'Torzyce', 'Dymnik', 'Szynowo',
  'Rudawa', 'Iskrzyn', 'Kotłów', 'Wagonowo', 'Mostki', 'Zwrotniki', 'Gwizdowo', 'Semaforów',
  'Podkładowo', 'Hamulce', 'Przystanki', 'Nastawnia', 'Sieciechów', 'Kółkowo', 'Bocznica', 'Rozjazdy',
];

// --- Generator nazw (duże mapy): rdzeń + końcówka, czasem przymiotnik albo rzeka ---

type Gender = 'm' | 'f' | 'n' | 'pl';

// biome-ignore format: zwarta lista rdzeni
const NAME_ROOTS = [
  'Dęb', 'Lip', 'Grab', 'Brzez', 'Sosn', 'Olsz', 'Wierzb', 'Jawor', 'Buk', 'Jasion', 'Klon', 'Bor',
  'Gaj', 'Kruk', 'Sok', 'Wilk', 'Lis', 'Bobr', 'Rud', 'Węgl', 'Kol', 'Młyn', 'Hut', 'Kuźn',
  'Glin', 'Piask', 'Kamion', 'Strzel', 'Rak', 'Bogusz', 'Jarosz', 'Mir', 'Sław', 'Dobrosz', 'Krzyż', 'Wit',
  'Wojn', 'Ziel', 'Czarn', 'Bystrz', 'Złot', 'Srebr', 'Miedz', 'Sol', 'Kras', 'Brod', 'Przewoz', 'Grodz',
  'Zamk', 'Dwor', 'Jabłon', 'Grusz', 'Orzech', 'Trzcin', 'Łoz', 'Mszan', 'Kozł', 'Jastrzęb', 'Gołęb', 'Wrzos',
];

const NAME_ENDINGS: readonly [string, Gender][] = [
  ['owo', 'n'],
  ['ice', 'pl'],
  ['ów', 'm'],
  ['owice', 'pl'],
  ['any', 'pl'],
  ['ówka', 'f'],
  ['ec', 'm'],
  ['ki', 'pl'],
];

/** Przymiotnik w formie dla rodzaju (m, f, n, pl) i czy stoi przed nazwą („Nowy Dębów”) czy po („Dębów Górny”). */
const NAME_ADJECTIVES: readonly { forms: Record<Gender, string>; before: boolean }[] = [
  { forms: { m: 'Nowy', f: 'Nowa', n: 'Nowe', pl: 'Nowe' }, before: true },
  { forms: { m: 'Stary', f: 'Stara', n: 'Stare', pl: 'Stare' }, before: true },
  { forms: { m: 'Wielki', f: 'Wielka', n: 'Wielkie', pl: 'Wielkie' }, before: true },
  { forms: { m: 'Górny', f: 'Górna', n: 'Górne', pl: 'Górne' }, before: false },
  { forms: { m: 'Dolny', f: 'Dolna', n: 'Dolne', pl: 'Dolne' }, before: false },
  { forms: { m: 'Mały', f: 'Mała', n: 'Małe', pl: 'Małe' }, before: false },
];

const NAME_RIVERS = ['nad Bystrą', 'nad Czarną', 'nad Rudawą', 'nad Srebrną', 'nad Białką', 'nad Wilgą'];

/**
 * Generator kolejnych, niepowtarzalnych nazw miast (deterministyczny – własny strumień losowy,
 * żeby nazwy nie zmieniały reszty mapy). `taken` – nazwy już użyte.
 */
export function townNameGenerator(seed: number, taken: Iterable<string>): () => string {
  const rng = createRng((seed ^ 0x51ed270b) >>> 0);
  const used = new Set(taken);
  const pick = <T>(list: readonly T[]): T => list[nextInt(rng, 0, list.length)]!;
  let fallback = 0;
  return () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [ending, gender] = pick(NAME_ENDINGS);
      const base = pick(NAME_ROOTS) + ending;
      const r = nextFloat(rng);
      let name = base;
      if (r < 0.3) {
        const adj = pick(NAME_ADJECTIVES);
        name = adj.before ? `${adj.forms[gender]} ${base}` : `${base} ${adj.forms[gender]}`;
      } else if (r < 0.4) {
        name = `${base} ${pick(NAME_RIVERS)}`;
      }
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return `Osiedle ${++fallback}`;
  };
}

export function townAt(state: GameState, x: number, y: number): Town | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.town[y * state.map.width + x];
  return id ? state.towns.find((t) => t.id === id) : undefined;
}

/** Miasto pod kafelkiem albo przy nim (ulice, rynek) – do kliknięć i podpowiedzi. */
export function townNear(state: GameState, x: number, y: number): Town | undefined {
  const direct = townAt(state, x, y);
  if (direct) return direct;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = townAt(state, x + dx, y + dy);
      if (t) return t;
    }
  }
  return undefined;
}

/** Ulice: co czwarty rząd/kolumna od środka dzielnicy zostaje wolna (kwartały zabudowy). */
export function isStreet(town: Town, x: number, y: number): boolean {
  const d = town.districts[districtIndexAt(town, x, y)]!;
  return (x - d.x) % 4 === 0 || (y - d.y) % 4 === 0;
}

/** Dom miasta powstaje najwyżej tyle kafelków od rynku (wzrost szuka miejsc w promieniu 12 + ulica). */
export const TOWN_EXTENT = 16;

/** Kafelki domów miasta – szukane tylko w obszarze dzielnic (na dużych mapach to kluczowe dla wydajności). */
export function townTiles(state: GameState, town: Town): number[] {
  const { map } = state;
  const out: number[] = [];
  forEachTownTile(map, town, TOWN_EXTENT, (_x, _y, i) => {
    if (map.town[i] === town.id) out.push(i);
  });
  return out;
}

export function townPopulation(state: GameState, town: Town): number {
  return townTiles(state, town).reduce((pop, i) => pop + HOUSE_POPULATION[state.map.house[i]!]!, 0);
}

/** Metro w mieście: stacja z peronem na poziomie −1 w obrębie miasta. */
export function townHasMetro(state: GameState, town: Town): boolean {
  const w = state.map.width;
  return state.stations.some((st) => st.underTiles?.some((i) => inTownArea(town, i % w, Math.floor(i / w))));
}

export interface DistrictInfo {
  name: string;
  population: number;
  /** W obszarze dzielnicy jest peron metra. */
  metro: boolean;
}

/** Mieszkańcy i metro w każdej dzielnicy (do okna miasta). */
export function districtInfo(state: GameState, town: Town): DistrictInfo[] {
  const { map } = state;
  const out = town.districts.map((d) => ({ name: districtLabel(town, d), population: 0, metro: false }));
  for (const i of townTiles(state, town)) {
    out[districtIndexAt(town, i % map.width, Math.floor(i / map.width))]!.population += HOUSE_POPULATION[map.house[i]!]!;
  }
  for (const st of state.stations) {
    for (const i of st.underTiles ?? []) {
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      if (inTownArea(town, x, y)) out[districtIndexAt(town, x, y)]!.metro = true;
    }
  }
  return out;
}

/**
 * Metro a rozwój miasta: poniżej progu bez znaczenia ('small'); od progu metro przyspiesza wzrost
 * ('metro'), a jego brak ('wanted') powyżej drugiego progu wstrzymuje rozwój ('stalled').
 */
export type MetroStatus = 'small' | 'metro' | 'wanted' | 'stalled';

export function metroStatus(state: GameState, town: Town, population: number): MetroStatus {
  if (population < ECONOMY.town.metroDemandPop) return 'small';
  if (townHasMetro(state, town)) return 'metro';
  return population > ECONOMY.town.metroRequiredPop ? 'stalled' : 'wanted';
}

/**
 * Kościół i ozdoba w mieście, które ich nie ma (np. ze starego zapisu albo z zabudowanym centrum,
 * gdzie wzrost nie znajdzie wolnego kafelka przy rynku): zamiast nowego budynku przebudowuje się
 * najniższy dom najbliżej rynku. Kościół od razu, ozdoba z szansą `ornamentChance` na miesiąc.
 * Zwraca przebudowane kafelki.
 */
export function addMissingLandmarks(state: GameState, town: Town, tiles: number[], chance: number): number[] {
  const { map } = state;
  const T = ECONOMY.town;
  let church = false;
  let ornaments = 0;
  let homes = 0;
  const near: number[] = [];
  for (const i of tiles) {
    const kind = map.house[i]!;
    if (kind === HOUSE_CHURCH) church = true;
    else if (kind === HOUSE_ORNAMENT) ornaments++;
    else if (kind) {
      homes++;
      const dist = Math.abs((i % map.width) - town.x) + Math.abs(Math.floor(i / map.width) - town.y);
      if (dist <= T.ornamentRadius && kind <= 2 && !map.houseBuild[i]) near.push(i);
    }
  }
  if (homes < T.churchMinHouses || near.length === 0) return [];
  const dist = (i: number) => Math.abs((i % map.width) - town.x) + Math.abs(Math.floor(i / map.width) - town.y);
  near.sort((a, b) => map.house[a]! - map.house[b]! || dist(a) - dist(b) || a - b);
  const out: number[] = [];
  if (!church) {
    const i = near.shift()!;
    map.house[i] = HOUSE_CHURCH;
    out.push(i);
  }
  if (ornaments === 0 && near.length > 0 && chance < T.ornamentChance) {
    const i = near.shift()!;
    map.house[i] = HOUSE_ORNAMENT;
    out.push(i);
  }
  return out;
}

/** Domy z mieszkańcami (bez ozdób i kościoła). */
export function townHouseCount(state: GameState, town: Town): number {
  return townTiles(state, town).filter((i) => state.map.house[i]! && state.map.house[i]! <= MAX_HOUSE_LEVEL).length;
}

/** Najbliższe miasto w zasięgu `maxDist` kafelków (do nazw stacji i zakładów). */
export function nearestTown(state: GameState, x: number, y: number, maxDist = Infinity): Town | undefined {
  let best: Town | undefined;
  let bestD = maxDist;
  for (const t of state.towns) {
    const d = Math.abs(t.x - x) + Math.abs(t.y - y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
