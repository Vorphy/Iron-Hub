import { ECONOMY } from '../../data/economy';
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
  /** Odsetki od kredytu. */
  interest: number;
}

export interface Finances {
  month: Ledger;
  /** Poprzednie miesiące, najnowszy na końcu (max 12). */
  history: Ledger[];
  /** Zaciągnięty kredyt. */
  loan: number;
  /** Ile zamknięć miesiąca z rzędu saldo było ujemne. */
  debtMonths: number;
  /** Bankructwo – koniec gry (czas stoi). */
  bankrupt: boolean;
}

export const LEDGER_HISTORY = 12;

export function emptyLedger(): Ledger {
  return { income: 0, trains: 0, infrastructure: 0, construction: 0, interest: 0 };
}

export function emptyFinances(): Finances {
  return { month: emptyLedger(), history: [], loan: 0, debtMonths: 0, bankrupt: false };
}

export type ExpenseKind = 'trains' | 'infrastructure' | 'construction' | 'interest';

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

export const LOAN_MAX = ECONOMY.loan.max;
export const LOAN_STEP = ECONOMY.loan.step;
export const LOAN_INTEREST = ECONOMY.loan.yearlyInterest;
export const BANKRUPTCY_MONTHS = ECONOMY.loan.bankruptcyMonths;

/** Odsetki za miesiąc od bieżącego kredytu. */
export function monthlyInterest(state: GameState): number {
  return Math.round((state.finances.loan * LOAN_INTEREST) / 12);
}

/**
 * Po naliczeniu kosztów miesiąca: ujemne saldo kolejny miesiąc z rzędu przybliża bankructwo.
 * Zwraca, ile miesięcy zostało (0 – bankructwo), albo null, gdy saldo nie jest ujemne.
 */
export function checkDebt(state: GameState): number | null {
  const f = state.finances;
  if (state.money >= 0) {
    f.debtMonths = 0;
    return null;
  }
  f.debtMonths++;
  const left = Math.max(0, BANKRUPTCY_MONTHS - f.debtMonths);
  if (left === 0) f.bankrupt = true;
  return left;
}
