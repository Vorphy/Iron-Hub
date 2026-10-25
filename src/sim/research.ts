import {
  RESEARCH,
  RESEARCH_CANCEL_REFUND,
  RESEARCH_COST_GROWTH,
  RESEARCH_DAYS_GROWTH,
  type ResearchDef,
  type ResearchId,
} from '../data/research';
import type { CommandResult, SimEvent } from './commands';
import { spend } from './economy/finance';
import type { GameState } from './state';
import { gameDate, TICKS_PER_DAY } from './time';
import type { EngineDef } from './trains/vehicles';

/** Badania: osiągnięte poziomy i trwające badanie (jedno naraz). */
export interface ResearchState {
  levels: Partial<Record<ResearchId, number>>;
  current: { id: ResearchId; startTick: number; endTick: number; cost: number } | null;
}

export function emptyResearch(): ResearchState {
  return { levels: {}, current: null };
}

export function researchDef(id: ResearchId): ResearchDef | undefined {
  return RESEARCH.find((r) => r.id === id);
}

export function researchLevel(state: GameState, id: ResearchId): number {
  return state.research.levels[id] ?? 0;
}

/** Cena i czas następnego poziomu (null – osiągnięty maksymalny). */
export function nextLevelPlan(state: GameState, id: ResearchId): { cost: number; days: number } | null {
  const def = researchDef(id);
  const level = researchLevel(state, id);
  if (!def || level >= def.maxLevel) return null;
  return {
    cost: Math.round(def.cost * RESEARCH_COST_GROWTH ** level),
    days: Math.round(def.days * RESEARCH_DAYS_GROWTH ** level),
  };
}

export function startResearch(state: GameState, id: ResearchId, events: SimEvent[]): CommandResult {
  if (state.research.current) return { ok: false, reason: 'blocked' };
  const plan = nextLevelPlan(state, id);
  if (!plan) return { ok: false, reason: 'blocked' };
  if (state.money < plan.cost) return { ok: false, reason: 'noMoney' };
  spend(state, 'construction', plan.cost);
  state.research.current = { id, startTick: state.tick, endTick: state.tick + plan.days * TICKS_PER_DAY, cost: plan.cost };
  events.push({ type: 'researchChanged' });
  return { ok: true };
}

/** Przerwanie badania – zwrot części ceny, poziom bez zmian. */
export function cancelResearch(state: GameState, events: SimEvent[]): CommandResult {
  const cur = state.research.current;
  if (!cur) return { ok: false, reason: 'blocked' };
  spend(state, 'construction', -Math.round(cur.cost * RESEARCH_CANCEL_REFUND));
  state.research.current = null;
  events.push({ type: 'researchChanged' });
  return { ok: true };
}

/** Co tick: koniec badania podnosi poziom. */
export function tickResearch(state: GameState, events: SimEvent[]): void {
  const cur = state.research.current;
  if (!cur || state.tick < cur.endTick) return;
  state.research.levels[cur.id] = researchLevel(state, cur.id) + 1;
  state.research.current = null;
  events.push({ type: 'researchDone', id: cur.id }, { type: 'researchChanged' });
}

// --- Efekty ---

const bonus = (state: GameState, id: ResearchId) => researchLevel(state, id) * (researchDef(id)?.perLevel ?? 0);

/** Ładowność wagonu po badaniach (całe jednostki). */
export function wagonCapacity(state: GameState, base: number): number {
  return Math.round(base * (1 + bonus(state, 'capacity')));
}

/** Prędkość maksymalna lokomotywy po badaniach (km/h). */
export function engineMaxSpeed(state: GameState, base: number): number {
  return Math.round(base * (1 + bonus(state, 'speed')));
}

/** Mnożnik czasu postoju na stacji. */
export function stationWaitFactor(state: GameState): number {
  return Math.max(0.3, 1 - bonus(state, 'loading'));
}

/** Mnożnik kosztów utrzymania (pociągi i infrastruktura). */
export function maintenanceFactor(state: GameState): number {
  return Math.max(0.3, 1 - bonus(state, 'maintenance'));
}

/** Dodatek do oceny stacji (0–1). */
export function ratingBonus(state: GameState): number {
  return bonus(state, 'rating');
}

/** Rok, według którego liczy się dostępność lokomotyw (prototypy – kilka lat wcześniej). */
export function engineYear(state: GameState): number {
  return gameDate(state).year + bonus(state, 'engines');
}

/** Lokomotywa w sprzedaży z uwzględnieniem badań (wcześniejsze wejście; wycofanie bez zmian). */
export function engineOnSale(state: GameState, e: EngineDef): boolean {
  const year = gameDate(state).year;
  return engineYear(state) >= e.year && (e.retire === undefined || year < e.retire);
}
