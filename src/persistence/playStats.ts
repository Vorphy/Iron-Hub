/**
 * Statystyki grania – tylko w tej przeglądarce (localStorage), nigdzie niewysyłane.
 * Sesja = jedno uruchomienie gry; czas liczy się tylko, gdy karta z grą jest widoczna.
 */
export interface PlayStats {
  sessions: number;
  /** Łączny czas grania (sekundy). */
  seconds: number;
  /** Pierwsze uruchomienie (ISO). */
  since: string;
}

const KEY = 'ironhub.playStats';

export function newSession(prev: PlayStats | null, now: Date): PlayStats {
  return prev ? { ...prev, sessions: prev.sessions + 1 } : { sessions: 1, seconds: 0, since: now.toISOString() };
}

export function addPlayTime(stats: PlayStats, seconds: number): PlayStats {
  return { ...stats, seconds: stats.seconds + Math.max(0, Math.round(seconds)) };
}

/** Np. „45 min”, „3 h 20 min”. */
export function formatPlayTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function isStats(v: unknown): v is PlayStats {
  const s = v as PlayStats;
  return (
    !!s &&
    Number.isInteger(s.sessions) &&
    s.sessions >= 0 &&
    Number.isFinite(s.seconds) &&
    s.seconds >= 0 &&
    typeof s.since === 'string'
  );
}

export function loadPlayStats(): PlayStats | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return isStats(v) ? v : null;
  } catch {
    return null;
  }
}

export function storePlayStats(stats: PlayStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Tryb prywatny / zablokowane dane strony – statystyki tylko do końca sesji.
  }
}
