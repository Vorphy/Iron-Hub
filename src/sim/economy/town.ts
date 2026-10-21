import { ECONOMY } from '../../data/economy';
import type { GameState } from '../state';
import { createRng, nextFloat, nextInt } from '../rng';
import { inBounds } from '../world/map';

/** Mieszkańcy domu w zależności od poziomu zabudowy (1–4). */
export const HOUSE_POPULATION: readonly number[] = ECONOMY.town.housePopulation;
export const MAX_HOUSE_LEVEL = 4;

export interface TownMonth {
  passengers: number;
  passengersTransported: number;
  mail: number;
  mailTransported: number;
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
}

export function emptyTownMonth(): TownMonth {
  return { passengers: 0, passengersTransported: 0, mail: 0, mailTransported: 0 };
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

/** Ulice: co czwarty rząd/kolumna od rynku zostaje wolna (kwartały zabudowy). */
export function isStreet(town: Town, x: number, y: number): boolean {
  return (x - town.x) % 4 === 0 || (y - town.y) % 4 === 0;
}

/** Dom miasta powstaje najwyżej tyle kafelków od rynku (wzrost szuka miejsc w promieniu 12 + ulica). */
export const TOWN_EXTENT = 16;

/** Kafelki domów miasta – szukane tylko w okolicy rynku (na dużych mapach to kluczowe dla wydajności). */
export function townTiles(state: GameState, town: Town): number[] {
  const { map } = state;
  const out: number[] = [];
  for (let y = Math.max(0, town.y - TOWN_EXTENT); y <= Math.min(map.height - 1, town.y + TOWN_EXTENT); y++) {
    for (let x = Math.max(0, town.x - TOWN_EXTENT); x <= Math.min(map.width - 1, town.x + TOWN_EXTENT); x++) {
      const i = y * map.width + x;
      if (map.town[i] === town.id) out.push(i);
    }
  }
  return out;
}

export function townPopulation(state: GameState, town: Town): number {
  return townTiles(state, town).reduce((pop, i) => pop + HOUSE_POPULATION[state.map.house[i]!]!, 0);
}

export function townHouseCount(state: GameState, town: Town): number {
  return townTiles(state, town).filter((i) => state.map.house[i]).length;
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
