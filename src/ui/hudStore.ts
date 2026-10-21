import type { Speed } from '../loop';
import type { Terrain } from '../sim/world/map';
import type { Cargo } from '../sim/economy/cargo';
import type { StationAxis } from '../sim/station/station';
import type { Side } from '../sim/track/track';
import type { SignalMode } from '../sim/signals/signals';
import type { SignalKind, TerrainMode, Tool, TrackMode } from '../tools';
import { Store } from './store';

export type WindowRef =
  | { kind: 'depot'; depotId: number }
  | { kind: 'train'; trainId: number }
  | { kind: 'town'; townId: number }
  | { kind: 'industry'; industryId: number }
  | { kind: 'station'; stationId: number }
  | { kind: 'finance' };

/** Skrót pociągu do list w oknach. */
export interface TrainSummary {
  id: number;
  name: string;
  engine: string;
  wagons: string[];
  status: string;
  resale: number;
}

export interface DepotWindowData {
  kind: 'depot';
  depotId: number;
  trains: TrainSummary[];
}

export interface TrainWindowData {
  kind: 'train';
  trainId: number;
  name: string;
  engine: string;
  wagons: string[];
  status: string;
  speed: number;
  maxSpeed: number;
  inDepot: boolean;
  stopped: boolean;
  goToDepot: boolean;
  lost: boolean;
  orders: { stationId: number; name: string }[];
  currentOrder: number;
  resale: number;
  /** Trwa wskazywanie stacji do rozkładu. */
  picking: boolean;
  /** Ładunek w składzie, zsumowany po rodzajach. */
  load: { cargo: Cargo; amount: number; capacity: number }[];
}

export interface TownWindowData {
  kind: 'town';
  townId: number;
  name: string;
  population: number;
  houses: number;
  passengers: number;
  passengersTransported: number;
  mail: number;
  mailTransported: number;
  lastTransported: number;
}

export interface IndustryWindowData {
  kind: 'industry';
  industryId: number;
  name: string;
  typeName: string;
  level: number;
  maxLevel: number;
  growth: number;
  produces: Cargo | null;
  /** Produkcja na miesiąc przy obecnym poziomie i zaopatrzeniu. */
  production: number;
  accepts: { cargo: Cargo; demand: number; delivered: number }[];
  produced: number;
  transported: number;
  /** Wskaźnik zaopatrzenia/wywozu z ostatnich miesięcy (0–1). */
  supply: number | null;
}

export interface StationWindowData {
  kind: 'station';
  stationId: number;
  name: string;
  platforms: number;
  /** Ładunki obsługiwane lub czekające: ilość i ocena (0–1, 0 – brak obsługi). */
  cargo: { cargo: Cargo; waiting: number; rating: number }[];
  accepts: Cargo[];
}

export interface FinanceWindowData {
  kind: 'finance';
  /** Miesiące od bieżącego wstecz. */
  months: { label: string; income: number; trains: number; infrastructure: number; construction: number; interest: number }[];
  loan: number;
  loanMax: number;
  loanStep: number;
  /** Odsetki rocznie (ułamek) i za bieżący miesiąc (zł). */
  loanInterest: number;
  interestPerMonth: number;
  /** Miesiące z rzędu z ujemnym saldem i ile ich prowadzi do bankructwa. */
  debtMonths: number;
  bankruptcyMonths: number;
  /** Szacunek miesięcznych kosztów stałych. */
  infrastructurePerMonth: number;
  trainsPerMonth: number;
}

export type WindowData =
  | DepotWindowData
  | TrainWindowData
  | TownWindowData
  | IndustryWindowData
  | StationWindowData
  | FinanceWindowData;

export interface HudState {
  date: string;
  money: number;
  speed: Speed;
  tool: Tool;
  /** Ustawienia narzędzi budowy (panel opcji). */
  toolOptions: {
    depotSide: Side;
    depotAuto: boolean;
    stationAxis: StationAxis;
    signalKind: SignalKind;
    trackMode: TrackMode;
    terrainMode: TerrainMode;
  };
  signalMode: SignalMode;
  fps: number;
  zoom: number;
  /** Podsumowanie grafu torów, gdy włączony podgląd (G). */
  graphInfo: string | null;
  hover: { x: number; y: number; terrain: Terrain; station: string | null } | null;
  /** Koszt / błąd przy kursorze podczas używania narzędzia (x, y – piksele ekranu). */
  cursorLabel: { x: number; y: number; text: string; ok: boolean } | null;
  message: { id: number; text: string } | null;
  /** Daty zapisów w przeglądarce (ISO) – do menu. */
  saves: { quick: string | null; auto: string | null };
  menuOpen: boolean;
  /** Firma zbankrutowała – koniec gry. */
  bankrupt: boolean;
  minimapOpen: boolean;
  /** Panel „Pierwsze kroki” i które kroki są zrobione. */
  tutorialOpen: boolean;
  tutorialSteps: boolean[];
  /** Ruch aut i autobusów w miastach. */
  traffic: boolean;
  /** Okno nowej gry (rozmiar mapy, ziarno). */
  newGameOpen: boolean;
  window: WindowRef | null;
  /** Dane otwartego okna, odświeżane przez grę. */
  windowData: WindowData | null;
}

export const hudStore = new Store<HudState>({
  date: '',
  money: 0,
  speed: 1,
  tool: 'cursor',
  toolOptions: { depotSide: 1, depotAuto: true, stationAxis: 'x', signalKind: 'path', trackMode: 'build', terrainMode: 'raise' },
  signalMode: 'auto',
  fps: 0,
  zoom: 1,
  graphInfo: null,
  hover: null,
  cursorLabel: null,
  message: null,
  saves: { quick: null, auto: null },
  menuOpen: false,
  bankrupt: false,
  minimapOpen: true,
  tutorialOpen: true,
  tutorialSteps: [],
  traffic: true,
  newGameOpen: false,
  window: null,
  windowData: null,
});

let messageId = 0;

export function showMessage(text: string): void {
  hudStore.set({ message: { id: ++messageId, text } });
}

export interface HudActions {
  setSpeed(speed: Speed): void;
  setTool(tool: Tool): void;
  setDepotSide(side: Side | 'auto'): void;
  setStationAxis(axis: StationAxis): void;
  setSignalKind(kind: SignalKind): void;
  setTrackMode(mode: TrackMode): void;
  setTerrainMode(mode: TerrainMode): void;
  setSignalMode(mode: SignalMode): void;
  toggleMenu(): void;
  toggleMinimap(): void;
  toggleTutorial(): void;
  /** Płótno minimapy (null – odpięte). */
  attachMinimap(canvas: HTMLCanvasElement | null): void;
  minimapGoto(u: number, v: number): void;
  toggleTraffic(): void;
  openFinance(): void;
  addTestMoney(): void;
  borrow(amount: number): void;
  repay(amount: number): void;
  quickSave(): void;
  quickLoad(): void;
  exportFile(): void;
  importFile(): void;
  /** Otwiera okno nowej gry. */
  newGame(): void;
  closeNewGame(): void;
  startNewGame(size: number, seed: number): void;
  closeWindow(): void;
  buyTrain(depotId: number, engine: string, wagons: string[]): void;
  sellTrain(trainId: number): void;
  openTrain(trainId: number): void;
  startTrain(trainId: number): void;
  stopTrain(trainId: number): void;
  sendToDepot(trainId: number): void;
  reverseTrain(trainId: number): void;
  setOrders(trainId: number, orders: number[]): void;
  /** Włącza/wyłącza wskazywanie stacji do rozkładu. */
  pickOrders(trainId: number): void;
  focusTrain(trainId: number): void;
}
