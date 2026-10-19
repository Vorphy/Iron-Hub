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

export function townPopulation(state: GameState, town: Town): number {
  let pop = 0;
  const { map } = state;
  for (let i = 0; i < map.town.length; i++) if (map.town[i] === town.id) pop += HOUSE_POPULATION[map.house[i]!]!;
  return pop;
}

export function townHouseCount(state: GameState, town: Town): number {
  let n = 0;
  for (let i = 0; i < state.map.town.length; i++) if (state.map.town[i] === town.id && state.map.house[i]) n++;
  return n;
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
