import type { GameState } from '../state';

/** Bilans jednego miesiąca. Koszty jako liczby dodatnie. */
export interface Ledger {
  /** Przychody z przewozów. */
  income: number;
  /** Eksploatacja pociągów. */
  trains: number;
  /** Utrzymanie torów, stacji, zajezdni i semaforów. */
  infrastructure: number;
  /** Budowa i zakupy (po odjęciu zwrotów ze sprzedaży i rozbiórki). */
  construction: number;
}

export interface Finances {
  month: Ledger;
  /** Poprzednie miesiące, najnowszy na końcu (max 12). */
  history: Ledger[];
}

export const LEDGER_HISTORY = 12;

export function emptyLedger(): Ledger {
  return { income: 0, trains: 0, infrastructure: 0, construction: 0 };
}

export function emptyFinances(): Finances {
  return { month: emptyLedger(), history: [] };
}

export type ExpenseKind = 'trains' | 'infrastructure' | 'construction';

/** Wydatek (ujemna kwota = zwrot, np. sprzedaż pociągu, rozbiórka). */
export function spend(state: GameState, kind: ExpenseKind, amount: number): void {
  state.money -= amount;
  state.finances.month[kind] += amount;
}

export function earn(state: GameState, amount: number): void {
  state.money += amount;
  state.finances.month.income += amount;
}

/** Zamyka miesiąc: bieżący bilans trafia do historii. */
export function closeMonth(state: GameState): void {
  const f = state.finances;
  f.history.push(f.month);
  if (f.history.length > LEDGER_HISTORY) f.history.shift();
  f.month = emptyLedger();
}
