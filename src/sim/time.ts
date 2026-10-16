// Kalendarz gry: uproszczony, 30 dni w miesiącu (patrz docs/02-architektura.md).

export const TICKS_PER_DAY = 40;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const START_YEAR = 1950;

export interface GameDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–30 */
  day: number;
}

export function tickToDate(tick: number): GameDate {
  const totalDays = Math.floor(tick / TICKS_PER_DAY);
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  return {
    year: START_YEAR + Math.floor(totalMonths / MONTHS_PER_YEAR),
    month: (totalMonths % MONTHS_PER_YEAR) + 1,
    day: (totalDays % DAYS_PER_MONTH) + 1,
  };
}
