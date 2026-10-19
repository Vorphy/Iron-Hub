import { ECONOMY } from '../../data/economy';
import data from '../../data/industries.json';
import type { GameState } from '../state';
import { inBounds } from '../world/map';
import type { Cargo } from './cargo';

export interface IndustryDef {
  id: string;
  name: string;
  size: [number, number];
  produces: Cargo | null;
  accepts: Cargo[];
  /** Produkcja na miesiąc przy poziomie 1 (rośnie z poziomem). */
  baseProduction: number;
  /** Zapotrzebowanie na każdy surowiec na miesiąc przy poziomie 1. */
  baseDemand: number;
  color: string;
  /** Liczba na mapie 128×128 (skalowana z powierzchnią). */
  perMap: number;
}

export const INDUSTRY_DEFS: readonly IndustryDef[] = data.industries as IndustryDef[];
const defById = new Map(INDUSTRY_DEFS.map((d) => [d.id, d]));

export function industryDef(id: string): IndustryDef | undefined {
  return defById.get(id);
}

export const MAX_INDUSTRY_LEVEL = ECONOMY.industry.maxLevel;

/** Statystyki bieżącego miesiąca. */
export interface IndustryMonth {
  produced: number;
  /** Wywiezione (trafiło na stacje). */
  transported: number;
  /** Dostarczone surowce. */
  delivered: Partial<Record<Cargo, number>>;
}

export interface Industry {
  id: number;
  type: string;
  name: string;
  /** Lewy-górny kafelek (najmniejsze x, y) obszaru. */
  x: number;
  y: number;
  level: number;
  /** Punkty rozwoju: +12 → poziom w górę, −12 → poziom w dół. */
  growth: number;
  month: IndustryMonth;
  /** Wskaźnik zaopatrzenia (lub wywozu) z ostatnich miesięcy, najnowszy na końcu (max 3). */
  history: number[];
}

export function emptyIndustryMonth(): IndustryMonth {
  return { produced: 0, transported: 0, delivered: {} };
}

export function industryAt(state: GameState, x: number, y: number): Industry | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.industry[y * state.map.width + x];
  return id ? state.industries.find((i) => i.id === id) : undefined;
}

/** Kafelki zajmowane przez zakład. */
export function industryTiles(state: GameState, ind: Industry): number[] {
  const def = industryDef(ind.type)!;
  const out: number[] = [];
  for (let dy = 0; dy < def.size[1]; dy++) {
    for (let dx = 0; dx < def.size[0]; dx++) out.push((ind.y + dy) * state.map.width + ind.x + dx);
  }
  return out;
}

/** Zakład bez surowców (kopalnia, las) – jego wskaźnik to odsetek wywiezionej produkcji. */
export function isPrimary(def: IndustryDef): boolean {
  return def.accepts.length === 0;
}

/** Średni wskaźnik zaopatrzenia/wywozu z ostatnich miesięcy (null – brak danych). */
export function averageSupply(ind: Industry): number | null {
  if (ind.history.length === 0) return null;
  return ind.history.reduce((s, v) => s + v, 0) / ind.history.length;
}

/** Bez dostaw przetwórnia pracuje na tym ułamku mocy; pełne zaopatrzenie – 100%. */
export const IDLE_PRODUCTION = ECONOMY.industry.idleProduction;

/** Produkcja na miesiąc przy obecnym poziomie (przetwórnie – zależnie od zaopatrzenia). */
export function monthlyProduction(ind: Industry): number {
  const def = industryDef(ind.type)!;
  if (!def.produces) return 0;
  const base = def.baseProduction * ind.level;
  if (isPrimary(def)) return base;
  const supply = Math.min(1, averageSupply(ind) ?? 0);
  return base * (IDLE_PRODUCTION + (1 - IDLE_PRODUCTION) * supply);
}

export function monthlyDemand(ind: Industry): number {
  return industryDef(ind.type)!.baseDemand * ind.level;
}
