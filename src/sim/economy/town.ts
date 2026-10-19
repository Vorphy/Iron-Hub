import { ECONOMY } from '../../data/economy';
import type { GameState } from '../state';
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
export const TOWN_NAMES = [
  'Żelazowo', 'Stalówka', 'Kolejno', 'Węglewo', 'Parowice', 'Torzyce', 'Dymnik', 'Szynowo',
  'Rudawa', 'Iskrzyn', 'Kotłów', 'Wagonowo', 'Mostki', 'Zwrotniki', 'Gwizdowo', 'Semaforów',
  'Podkładowo', 'Hamulce', 'Przystanki', 'Nastawnia', 'Sieciechów', 'Kółkowo', 'Bocznica', 'Rozjazdy',
];

/** Dopiski do nazw, gdy podstawowa lista się skończy (duże mapy). */
const NAME_SUFFIXES = ['Zdrój', 'Kolonia', 'Osada', 'Wieś', 'Huta', 'Młyn', 'Las', 'Pole', 'Brzeg', 'Port'];

/** Lista nazw dla mapy: najpierw podstawowe, potem z dopiskami, na końcu numerowane. */
export function townNamePool(count: number): string[] {
  const out = [...TOWN_NAMES];
  for (const suffix of NAME_SUFFIXES) for (const base of TOWN_NAMES) out.push(`${base} ${suffix}`);
  for (let i = 1; out.length < count; i++) out.push(`Osiedle ${i}`);
  return out;
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
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const t = townAt(state, x + dx, y + dy);
    if (t) return t;
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
