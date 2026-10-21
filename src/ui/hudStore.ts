import { defaultFilters, type MinimapFilters } from '../render/minimap';
import type { CustomCounts, Density } from '../sim/world/generate';

export interface MinimapSettings {
  big: boolean;
  zoom: number;
  /** Położenie małej minimapy (px od lewego górnego rogu); null – domyślne. */
  pos: { x: number; y: number } | null;
  legend: boolean;
  filters: MinimapFilters;
}

export function defaultMinimapSettings(): MinimapSettings {
  return { big: false, zoom: 1, pos: null, legend: false, filters: defaultFilters() };
}

/** Ustawienia świata z okna nowej gry. */
export interface NewWorldSettings {
  startYear: number;
  towns: Density;
  industry: Density;
  resources: Density;
  /** Tryb własny – dokładne liczby (null – według gęstości). */
  custom: CustomCounts | null;
}
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
  | { kind: 'finance' }
  | { kind: 'trains' };

/** Wiersz listy pociągów. */
export interface TrainRow {
  id: number;
  name: string;
  engine: string;
  color: string;
  status: string;
  lost: boolean;
  profitThis: number;
  profitLast: number;
  /** Wiek pociągu w latach. */
  age: number;
  groupId: number | null;
  /** Strata w zeszłym roku przy pełnym roku jazdy. */
  unprofitable: boolean;
  /** Kupiony w tym roku – zeszłoroczny zysk nie dotyczy. */
  newTrain: boolean;
  /** Liczba pociągów na wspólnym rozkładzie (0 – własny rozkład). */
  lineSize: number;
}

export interface TrainsWindowData {
  kind: 'trains';
  year: number;
  rows: TrainRow[];
  groups: { id: number; name: string; count: number }[];
}

/** Skrót pociągu do list w oknach. */
export interface TrainSummary {
  id: number;
  name: string;
  engine: string;
  wagons: string[];
  status: string;
  resale: number;
  /** Zwrot za samą lokomotywę (wagony zostają w magazynie). */
  engineResale: number;
  stopped: boolean;
}

export interface DepotWindowData {
  kind: 'depot';
  depotId: number;
  trains: TrainSummary[];
  /** Magazyn wagonów (typy) i zwrot za każdy. */
  spare: { type: string; resale: number; amount: number }[];
  /** Bieżący rok – od niego zależą lokomotywy w sprzedaży. */
  year: number;
  /** Zajezdnia ma sieć trakcyjną (lokomotywy elektryczne mogą z niej wyjechać). */
  electrified: boolean;
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
  orders: { stationId: number; name: string; fullLoad: boolean; waitDays: number }[];
  /** Równe odstępy na linii i odstęp w dniach (null – jeszcze nieznany). */
  spacing: boolean;
  headwayDays: number | null;
  currentOrder: number;
  resale: number;
  /** Trwa wskazywanie stacji do rozkładu. */
  picking: boolean;
  /** Ładunek w składzie, zsumowany po rodzajach. */
  load: { cargo: Cargo; amount: number; capacity: number }[];
  /** Wiek lokomotywy (lata) i zwrot za nią przy wymianie. */
  engineAge: number;
  tradeIn: number;
  /** Zamówiona wymiana (id nowej lokomotywy). */
  replaceWith: string | null;
  /** Zysk w tym i zeszłym roku; grupa i lista grup. */
  profitThis: number;
  profitLast: number;
  groupId: number | null;
  groups: { id: number; name: string }[];
  /** Pozostałe pociągi ze wspólnym rozkładem (linia). */
  sharedWith: { id: number; name: string }[];
  /** Lokomotywy, na które można wymienić (z dopłatą); ile pociągów ma tę samą lokomotywę. */
  replaceOptions: { id: string; cost: number }[];
  /** Cena kopii (obecne ceny) i czy lokomotywa jest jeszcze w sprzedaży. */
  cloneCost: number;
  cloneAvailable: boolean;
  sameEngineTrains: number;
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
  | FinanceWindowData
  | TrainsWindowData;

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
    catenaryMode: TrackMode;
    terrainMode: TerrainMode;
    stationSeparate: boolean;
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
  /** Otwarty temat pomocy (null – pomoc zamknięta). */
  helpTopic: string | null;
  changelogOpen: boolean;
  /** Są wpisy w „Co nowego”, których gracz jeszcze nie widział. */
  changelogUnseen: boolean;
  /** Firma zbankrutowała – koniec gry. */
  bankrupt: boolean;
  minimapOpen: boolean;
  /** Ustawienia minimapy: duża (na środku), przybliżenie, położenie panelu, legenda i filtry. */
  minimap: MinimapSettings;
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
  toolOptions: {
    depotSide: 1,
    depotAuto: true,
    stationAxis: 'x',
    signalKind: 'path',
    trackMode: 'build',
    catenaryMode: 'build',
    terrainMode: 'raise',
    stationSeparate: false,
  },
  signalMode: 'auto',
  fps: 0,
  zoom: 1,
  graphInfo: null,
  hover: null,
  cursorLabel: null,
  message: null,
  saves: { quick: null, auto: null },
  menuOpen: false,
  helpTopic: null,
  changelogOpen: false,
  changelogUnseen: false,
  bankrupt: false,
  minimapOpen: true,
  minimap: defaultMinimapSettings(),
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
  setCatenaryMode(mode: TrackMode): void;
  setStationSeparate(on: boolean): void;
  setTerrainMode(mode: TerrainMode): void;
  setSignalMode(mode: SignalMode): void;
  toggleMenu(): void;
  /** Pomoc na danym temacie (domyślnie „Jak zacząć”). */
  openHelp(topic?: string): void;
  closeHelp(): void;
  openChangelog(): void;
  closeChangelog(): void;
  toggleMinimap(): void;
  /** Zmiana ustawień minimapy (zapamiętywane w przeglądarce). */
  setMinimap(patch: Partial<MinimapSettings>): void;
  toggleTutorial(): void;
  /** Płótno minimapy (null – odpięte). */
  attachMinimap(canvas: HTMLCanvasElement | null): void;
  minimapGoto(u: number, v: number): void;
  toggleTraffic(): void;
  openFinance(): void;
  /** Lista pociągów (K). */
  openTrains(): void;
  createGroup(name: string): void;
  renameGroup(groupId: number, name: string): void;
  deleteGroup(groupId: number): void;
  setTrainGroup(trainId: number, groupId: number | null): void;
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
  startNewGame(size: number, seed: number, settings: NewWorldSettings): void;
  closeWindow(): void;
  buyTrain(depotId: number, engine: string, wagons: string[]): void;
  sellTrain(trainId: number): void;
  buyWagon(depotId: number, wagon: string): void;
  sellSpareWagon(depotId: number, index: number): void;
  attachWagon(trainId: number, index: number): void;
  detachWagon(trainId: number, index: number): void;
  sellEngine(trainId: number): void;
  /** Kopia pociągu z tym samym rozkładem do zajezdni. */
  /** Kopia; `separate` – z osobnym rozkładem (domyślnie wspólny). */
  cloneTrain(trainId: number, separate?: boolean): void;
  unshareOrders(trainId: number): void;
  openTrain(trainId: number): void;
  startTrain(trainId: number): void;
  stopTrain(trainId: number): void;
  sendToDepot(trainId: number): void;
  reverseTrain(trainId: number): void;
  /** Wymiana lokomotywy (null – anulowanie); `all` – we wszystkich pociągach z tą samą lokomotywą. */
  replaceEngine(trainId: number, engine: string | null, all?: boolean): void;
  setOrders(trainId: number, orders: number[], fullLoad?: boolean[], waitDays?: number[]): void;
  setWaitDays(trainId: number, index: number, days: number): void;
  setSpacing(trainId: number, on: boolean): void;
  toggleFullLoad(trainId: number, index: number): void;
  /** Włącza/wyłącza wskazywanie stacji do rozkładu. */
  pickOrders(trainId: number): void;
  focusTrain(trainId: number): void;
}
