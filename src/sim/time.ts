// Kalendarz gry: uproszczony, 30 dni w miesiącu (patrz docs/02-architektura.md).

export const TICKS_PER_DAY = 40;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
/** Domyślny rok startu nowej gry. */
export const START_YEAR = 1950;
/** Lata startu do wyboru przy nowej grze. */
export const START_YEARS = [1900, 1925, 1950, 1975, 2000] as const;

export interface GameDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–30 */
  day: number;
}

export function tickToDate(tick: number, startYear: number = START_YEAR): GameDate {
  const totalDays = Math.floor(tick / TICKS_PER_DAY);
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  return {
    year: startYear + Math.floor(totalMonths / MONTHS_PER_YEAR),
    month: (totalMonths % MONTHS_PER_YEAR) + 1,
    day: (totalDays % DAYS_PER_MONTH) + 1,
  };
}

/** Bieżąca data gry. */
export function gameDate(state: { tick: number; startYear: number }): GameDate {
  return tickToDate(state.tick, state.startYear);
}
