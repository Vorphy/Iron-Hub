import { ECONOMY } from '../../data/economy';
import type { GameState } from '../state';
import type { Cargo } from './cargo';

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
  /** Przewozy według ładunku: zapłata i dostarczona ilość (pasażerowie, worki, tony…). */
  cargo: Partial<Record<Cargo, CargoStat>>;
}

export interface CargoStat {
  income: number;
  amount: number;
}

/**
 * Bilans zamkniętego roku – zostaje w zapisie na zawsze (historia firmy od założenia).
 * Stan na koniec roku: gotówka, kredyt, wartość firmy i majątek.
 */
export interface YearRecord {
  year: number;
  /** Ile miesięcy roku jest w bilansie (mniej niż 12 – rok założenia firmy albo gra sprzed zbierania historii). */
  months: number;
  ledger: Ledger;
  money: number;
  loan: number;
  /** Gotówka − kredyt + wartość odsprzedaży pociągów i wagonów w zajezdniach. */
  companyValue: number;
  trains: number;
  stations: number;
  /** Elementy torów (powierzchnia i metro). */
  trackPieces: number;
}

export interface Finances {
  month: Ledger;
  /** Poprzednie miesiące, najnowszy na końcu (max `LEDGER_HISTORY`). */
  history: Ledger[];
  /** Bieżący rok: suma zamkniętych miesięcy i ich liczba. */
  year: Ledger;
  yearMonths: number;
  /** Zamknięte lata, najstarszy na początku – bez limitu. */
  years: YearRecord[];
  /** Zaciągnięty kredyt. */
  loan: number;
  /** Ile zamknięć miesiąca z rzędu saldo było ujemne. */
  debtMonths: number;
  /** Bankructwo – koniec gry (czas stoi). */
  bankrupt: boolean;
}

/** Ile miesięcy pamiętamy szczegółowo (starsze są w bilansach rocznych). */
export const LEDGER_HISTORY = 36;

export function emptyLedger(): Ledger {
  return { income: 0, trains: 0, infrastructure: 0, construction: 0, interest: 0, cargo: {} };
}

export function emptyFinances(): Finances {
  return {
    month: emptyLedger(),
    history: [],
    year: emptyLedger(),
    yearMonths: 0,
    years: [],
    loan: 0,
    debtMonths: 0,
    bankrupt: false,
  };
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

/** Przewóz dostarczony do odbiorcy – do statystyk według ładunku (pieniądze księguje `earn`). */
export function recordCargo(state: GameState, cargo: Cargo, income: number, amount: number): void {
  const c = (state.finances.month.cargo[cargo] ??= { income: 0, amount: 0 });
  c.income += income;
  c.amount += amount;
}

/** Dodaje bilans `l` do `into` (także przewozy według ładunku). */
export function addLedger(into: Ledger, l: Ledger): void {
  into.income += l.income;
  into.trains += l.trains;
  into.infrastructure += l.infrastructure;
  into.construction += l.construction;
  into.interest += l.interest;
  for (const [cargo, c] of Object.entries(l.cargo) as [Cargo, CargoStat][]) {
    const t = (into.cargo[cargo] ??= { income: 0, amount: 0 });
    t.income += c.income;
    t.amount += c.amount;
  }
}

/** Zamyka miesiąc: bieżący bilans trafia do historii i do sumy roku. */
export function closeMonth(state: GameState): void {
  const f = state.finances;
  f.history.push(f.month);
  if (f.history.length > LEDGER_HISTORY) f.history.shift();
  addLedger(f.year, f.month);
  f.yearMonths++;
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
