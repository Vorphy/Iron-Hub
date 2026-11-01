// Zasady gry wybierane przez gracza (Menu → Ustawienia, okno nowej gry). Zapisywane razem z grą –
// każda gra ma swoje. Mnożniki poziomów są w src/data/economy.ts (`ECONOMY.settings`).
import { ECONOMY } from '../data/economy';
import type { GameState } from './state';

export type CostLevel = keyof typeof ECONOMY.settings.costs;
export type TownGrowth = keyof typeof ECONOMY.settings.townGrowth;

export interface GameSettings {
  /** Ceny budowy. */
  costs: CostLevel;
  /** Tempo wzrostu miast. */
  townGrowth: TownGrowth;
  /** Zrośnięte miasta łączą się (większe wchłania mniejsze jako dzielnicę). Wył. – jak w OpenTTD. */
  townMerge: boolean;
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = { costs: 'normal', townGrowth: 'normal', townMerge: true };

export const COST_LEVELS = Object.keys(ECONOMY.settings.costs) as CostLevel[];
export const TOWN_GROWTH_LEVELS = Object.keys(ECONOMY.settings.townGrowth) as TownGrowth[];

/** Cena budowy po uwzględnieniu ustawienia kosztów (także zwrot za rozbiórkę). */
export function price(state: Pick<GameState, 'settings'>, base: number): number {
  return Math.round(base * ECONOMY.settings.costs[state.settings.costs]);
}

export function townGrowthFactor(state: Pick<GameState, 'settings'>): number {
  return ECONOMY.settings.townGrowth[state.settings.townGrowth];
}

export function isSettings(v: unknown): v is GameSettings {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    COST_LEVELS.includes(s.costs as CostLevel) &&
    TOWN_GROWTH_LEVELS.includes(s.townGrowth as TownGrowth) &&
    typeof s.townMerge === 'boolean'
  );
}
