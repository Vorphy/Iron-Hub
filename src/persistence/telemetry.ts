/**
 * Anonimowe statystyki do testów z graczami (docs/07-backend-mozliwosci.md, opcja B).
 * Wysyłamy tylko: losowy identyfikator przeglądarki, kod testera z linku (?tester=ania), nazwę firmy,
 * zdarzenie, minuty grania, rozmiar mapy i wersję gry. Bez adresu IP i bez danych osobowych.
 * Adres odbiorcy (Cloudflare Worker) przychodzi z VITE_STATS_URL – bez niego nic nie jest wysyłane
 * (serwer deweloperski, testy, kopie gry).
 */

export type StatsEvent = 'start' | 'new_game' | 'playing';

export interface StatsPayload {
  player: string;
  tester: string;
  company: string;
  event: StatsEvent;
  minutes: number;
  mapSize: number | null;
  version: string;
}

const PLAYER_KEY = 'ironhub.playerId';
const TESTER_KEY = 'ironhub.tester';
export const STATS_KEY = 'ironhub.stats';
/** Co tyle sekund grania (karta widoczna) wysyłamy zdarzenie „playing”. */
export const REPORT_EVERY_S = 300;

/** Kod testera z adresu (?tester=…): małe litery, cyfry, „-” i „_”, do 32 znaków; null – brak w adresie. */
export function testerFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('tester');
  if (raw === null) return null;
  return (
    raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32) || null
  );
}

/** Odcinki grania → pełne raporty co REPORT_EVERY_S, resztę oddaje `flush` (min. 1 minuta). */
export class PlayReporter {
  private pending = 0;

  /** Dolicza sekundy grania; zwraca minuty do wysłania (0 – jeszcze nie). */
  add(seconds: number): number {
    this.pending += Math.max(0, seconds);
    if (this.pending < REPORT_EVERY_S) return 0;
    const minutes = Math.floor(this.pending / 60);
    this.pending -= minutes * 60;
    return minutes;
  }

  /** Przy schowaniu karty: wysyłamy, co się uzbierało (pełne minuty). */
  flush(): number {
    const minutes = Math.floor(this.pending / 60);
    if (minutes < 1) return 0;
    this.pending -= minutes * 60;
    return minutes;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Tryb prywatny: identyfikator tylko do zamknięcia karty.
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export class Telemetry {
  private readonly player: string;
  private readonly tester: string;
  private enabledFlag: boolean;

  constructor(
    private readonly url: string,
    private readonly version: string,
    search: string,
  ) {
    let player = read(PLAYER_KEY);
    if (!player) {
      player = randomId();
      write(PLAYER_KEY, player);
    }
    this.player = player;
    // Kod z linku zapamiętujemy – kolejne wejścia bez parametru należą do tego samego testera.
    const fromLink = testerFromSearch(search);
    if (fromLink) write(TESTER_KEY, fromLink);
    this.tester = fromLink ?? read(TESTER_KEY) ?? '';
    this.enabledFlag = read(STATS_KEY) !== '0';
  }

  /** Odbiorca skonfigurowany przy budowie gry (bez niego przełącznik w Menu jest ukryty). */
  get available(): boolean {
    return this.url !== '';
  }

  get enabled(): boolean {
    return this.available && this.enabledFlag;
  }

  set enabled(on: boolean) {
    this.enabledFlag = on;
    write(STATS_KEY, on ? '1' : '0');
  }

  payload(event: StatsEvent, company: string, mapSize: number | null, minutes = 0): StatsPayload {
    return {
      player: this.player,
      tester: this.tester,
      company: company.slice(0, 40),
      event,
      minutes,
      mapSize,
      version: this.version.slice(0, 20),
    };
  }

  send(event: StatsEvent, company: string, mapSize: number | null, minutes = 0): void {
    if (!this.enabled) return;
    const body = JSON.stringify(this.payload(event, company, mapSize, minutes));
    try {
      // text/plain – bez zapytania wstępnego CORS; sendBeacon dochodzi także przy zamykaniu karty.
      const blob = new Blob([body], { type: 'text/plain' });
      if (navigator.sendBeacon?.(this.url, blob)) return;
      void fetch(this.url, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {});
    } catch {
      // Statystyki nigdy nie przeszkadzają w grze.
    }
  }
}
