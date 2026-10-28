import { START_MONEY } from './config';
import { emptyResearch, type ResearchState } from './research';
import { START_YEAR } from './time';
import type { Depot } from './depot/depot';
import { emptyFinances, type Finances } from './economy/finance';
import type { Industry } from './economy/industry';
import type { Town } from './economy/town';
import type { Signal, SignalMode } from './signals/signals';
import type { Station } from './station/station';
import type { Bridge } from './track/bridge';
import type { Tunnel } from './track/tunnel';
import type { TrainGroup } from './trains/groups';
import type { Train } from './trains/train';
import { type CustomCounts, DEFAULT_DENSITY, type Density, generateWorld } from './world/generate';
import { generateMap, type WorldMap } from './world/map';

/** Pełny stan gry. Wszystko, co tu jest, trafi do zapisu. */
export interface GameState {
  version: 1;
  tick: number;
  /** Rok, od którego liczy się kalendarz (data = startYear + tick). */
  startYear: number;
  /** Stan PRNG symulacji (patrz rng.ts). */
  rng: { state: number };
  money: number;
  /** Nazwa firmy gracza (nowa gra, zmiana w oknie Finanse). */
  companyName: string;
  map: WorldMap;
  stations: Station[];
  /** Kolejne id stacji (od 1; 0 na mapie oznacza brak stacji). */
  nextStationId: number;
  depots: Depot[];
  nextDepotId: number;
  trains: Train[];
  nextTrainId: number;
  signals: Signal[];
  signalMode: SignalMode;
  towns: Town[];
  industries: Industry[];
  finances: Finances;
  bridges: Bridge[];
  nextBridgeId: number;
  tunnels: Tunnel[];
  nextTunnelId: number;
  /** Grupy pociągów gracza. */
  groups: TrainGroup[];
  nextGroupId: number;
  /** Kolejny numer wspólnego rozkładu (linii). */
  nextShareId: number;
  /** Badania (ulepszenia kupowane za pieniądze i czas). */
  research: ResearchState;
}

export interface NewGameOptions {
  width: number;
  height: number;
  seed: number;
  /** Bez miast i przemysłu (testy, w przyszłości edytor map). */
  empty?: boolean;
  /** Rok startu (domyślnie 1950) – od niego zależą dostępne lokomotywy. */
  startYear?: number;
  /** Gęstość miast i przemysłu (domyślnie „dużo”). */
  towns?: Density;
  /** Przetwórnie (elektrownia, huta, tartak) i surowce (kopalnie, lasy) – osobno. */
  industry?: Density;
  resources?: Density;
  /** Tryb własny: dokładne liczby miast i zakładów (zamiast gęstości). */
  custom?: CustomCounts | null;
  /** Nazwa firmy (pusta – domyślna). */
  companyName?: string;
}

export const DEFAULT_COMPANY_NAME = 'Kolej Żelazna';
export const COMPANY_NAME_MAX = 40;

/** Nazwa firmy po oczyszczeniu: bez zbędnych spacji, przycięta; pusta – domyślna. */
export function cleanCompanyName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, COMPANY_NAME_MAX).trim();
  return clean || DEFAULT_COMPANY_NAME;
}

export function createGame({
  width,
  height,
  seed,
  empty = false,
  startYear = START_YEAR,
  towns = DEFAULT_DENSITY,
  industry = DEFAULT_DENSITY,
  resources = DEFAULT_DENSITY,
  custom = null,
  companyName = '',
}: NewGameOptions): GameState {
  const state: GameState = {
    version: 1,
    tick: 0,
    startYear,
    rng: { state: seed >>> 0 },
    money: START_MONEY,
    companyName: cleanCompanyName(companyName),
    map: generateMap(width, height, seed),
    stations: [],
    nextStationId: 1,
    depots: [],
    nextDepotId: 1,
    trains: [],
    nextTrainId: 1,
    signals: [],
    signalMode: 'auto',
    towns: [],
    industries: [],
    finances: emptyFinances(),
    bridges: [],
    nextBridgeId: 1,
    tunnels: [],
    nextTunnelId: 1,
    groups: [],
    nextGroupId: 1,
    nextShareId: 1,
    research: emptyResearch(),
  };
  // Pusty świat (testy) jest płaski.
  if (empty) state.map.heights.fill(0);
  else generateWorld(state, seed, towns, industry, resources, custom);
  return state;
}
