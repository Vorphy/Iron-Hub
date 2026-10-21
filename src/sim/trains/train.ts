import { isElectrified, needsCatenary } from '../track/catenary';
import { DAYS_PER_MONTH, gameDate, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../time';
import { ECONOMY } from '../../data/economy';
import { MAX_WAGONS, TRAIN_RESALE_RATE } from '../config';
import { spend } from '../economy/finance';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import type { Side } from '../track/track';
import { successors } from './steps';
import { consistStats, engineAvailable, engineDef, wagonDef } from './vehicles';

/** Odcinek drogi pociągu: element toru przejeżdżany od boku `entry` do `exit`. */
export interface Step {
  x: number;
  y: number;
  /** Bit elementu toru albo 0 – „ogonek” zajezdni (od wjazdu do środka kafelka). */
  track: number;
  /** -1 = środek zajezdni. */
  entry: Side | -1;
  exit: Side | -1;
}

export type TrainStatus = 'depot' | 'running' | 'loading';

/** Ładunek w wagonie (rodzaj wynika z typu wagonu). */
export interface WagonLoad {
  amount: number;
  /** Stacja załadunku (0 – pusty). */
  source: number;
  /** Tick załadunku – do liczenia czasu przewozu. */
  loadedTick: number;
}

export interface Train {
  id: number;
  name: string;
  engine: string;
  wagons: string[];
  status: TrainStatus;
  /** Zajezdnia, w której stoi (status 'depot'). */
  depotId: number | null;
  /** Zajezdnia, w której pociąg kupiono – tam trafiają jego kopie (null – rozebrana / nieznana). */
  homeDepot: number | null;
  /** Zysk (przewozy − utrzymanie) w bieżącym i poprzednim roku gry, zł. */
  profitThisYear: number;
  profitLastYear: number;
  /** Tick zakupu pociągu (do oceny, czy jeździł cały rok). */
  createdTick: number;
  /** Grupa gracza (null – bez grupy). */
  groupId: number | null;
  /**
   * Wspólny rozkład (linia): pociągi o tym samym `shareId` mają te same stacje i ptaszki; zmiana
   * w jednym zmienia wszystkie. Każdy jedzie we własnym tempie (własne `currentOrder`). null – własny.
   */
  shareId: number | null;
  /** Dodatkowy postój (dni gry) przy każdej pozycji rozkładu (ta sama długość co `orders`). */
  waitDays: number[];
  /** Równe odstępy na linii: na pierwszej stacji rozkładu czeka, aż minie odstęp od poprzedniego pociągu. */
  spacing: boolean;
  /** Tick ostatniego odjazdu z pierwszej stacji rozkładu (-1 – jeszcze nie) i czas ostatniego okrążenia linii. */
  departedFirstTick: number;
  loopTicks: number;
  /** Teraz czeka na odstęp (do statusu). */
  holding: boolean;
  /** Zatrzymany przez gracza. */
  stopped: boolean;
  /** Rozkład: id stacji. */
  orders: number[];
  /** Przy której pozycji rozkładu czekać na pełny ładunek (ta sama długość co `orders`). */
  fullLoad: boolean[];
  currentOrder: number;
  goToDepot: boolean;
  /** Może zawrócić w miejscu przy ruszaniu (np. po postoju na stacji). */
  mayReverse: boolean;
  /** km/h */
  speed: number;
  /** Przejechana część pierwszego odcinka `trail` (jednostki toru). */
  progress: number;
  /** Zajmowane odcinki, od czoła do końca składu. */
  trail: Step[];
  /** Odcinki zarezerwowane przed czołem, w kolejności jazdy. Pociąg wjeżdża tylko na nie. */
  reservedAhead: Step[];
  /** Rezerwacja sięga celu: co zrobić po dojechaniu do jej końca (null – to tylko granica rezerwacji). */
  resTerminal: 'stop' | 'depot' | 'reverse' | null;
  /** Skład jedzie „tyłem” (po zawróceniu lokomotywa jest na końcu). */
  reversed: boolean;
  /** Pozostały czas postoju na stacji (ticki). */
  waitTicks: number;
  /** Cena zakupu (do sprzedaży). */
  value: number;
  /** Ile ticków pociąg stoi, czekając na wolny tor (0 – nie czeka). */
  blockedTicks: number;
  /** Pociąg, przez który czeka (null – brak). Do wykrywania zakleszczeń. */
  blockedBy: number | null;
  /** Gracz kazał zawrócić: pociąg hamuje i zawraca po zatrzymaniu. */
  reverseRequested: boolean;
  /** Wymiana lokomotywy w najbliższej zajezdni (id nowej) – potem pociąg wraca na trasę. */
  replaceWith: string | null;
  /** Tick zakupu lokomotywy (od niego zależy zwrot przy wymianie). */
  engineBuilt: number;
  /** Ładunek, po jednym wpisie na wagon (w kolejności `wagons`). */
  loads: WagonLoad[];
}

export function trainById(state: GameState, id: number): Train | undefined {
  return state.trains.find((t) => t.id === id);
}

export function trainsInDepot(state: GameState, depotId: number): Train[] {
  return state.trains.filter((t) => t.status === 'depot' && t.depotId === depotId);
}

export function planBuyTrain(
  state: GameState,
  engine: string,
  wagons: readonly string[],
): { cost: number; result: CommandResult } {
  if (!engineDef(engine) || wagons.some((w) => !wagonDef(w))) return { cost: 0, result: { ok: false, reason: 'blocked' } };
  if (wagons.length > MAX_WAGONS) return { cost: 0, result: { ok: false, reason: 'tooBig' } };
  if (!engineAvailable(engineDef(engine)!, gameDate(state).year))
    return { cost: 0, result: { ok: false, reason: 'notAvailable' } };
  const { cost } = consistStats(engine, wagons);
  return { cost, result: cost > state.money ? { ok: false, reason: 'noMoney' } : { ok: true } };
}

export function buyTrain(
  state: GameState,
  depotId: number,
  engine: string,
  wagons: readonly string[],
  events: SimEvent[],
): CommandResult {
  if (!state.depots.some((d) => d.id === depotId)) return { ok: false, reason: 'blocked' };
  const plan = planBuyTrain(state, engine, wagons);
  if (!plan.result.ok) return plan.result;
  const id = state.nextTrainId++;
  state.trains.push({
    id,
    name: `Pociąg ${id}`,
    engine,
    wagons: [...wagons],
    status: 'depot',
    depotId,
    stopped: true,
    orders: [],
    fullLoad: [],
    currentOrder: 0,
    goToDepot: false,
    mayReverse: false,
    speed: 0,
    progress: 0,
    trail: [],
    reservedAhead: [],
    resTerminal: null,
    reversed: false,
    waitTicks: 0,
    value: plan.cost,
    loads: wagons.map(() => ({ amount: 0, source: 0, loadedTick: 0 })),
    blockedTicks: 0,
    blockedBy: null,
    reverseRequested: false,
    replaceWith: null,
    homeDepot: depotId,
    profitThisYear: 0,
    profitLastYear: 0,
    createdTick: state.tick,
    groupId: null,
    shareId: null,
    waitDays: [],
    spacing: false,
    departedFirstTick: -1,
    loopTicks: 0,
    holding: false,
    engineBuilt: state.tick,
  });
  spend(state, 'construction', plan.cost);
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

export function sellTrain(state: GameState, trainId: number, events: SimEvent[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  if (train.status !== 'depot') return { ok: false, reason: 'notInDepot' };
  unshare(state, train);
  state.trains = state.trains.filter((t) => t !== train);
  spend(state, 'construction', -resaleValue(state, train));
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/** Zwrot przy sprzedaży: wagony 75% ceny, lokomotywa – zależnie od wieku (jak przy wymianie). */
export function resaleValue(state: GameState, train: Train): number {
  const wagons = train.wagons.reduce((sum, w) => sum + wagonDef(w)!.cost, 0);
  return Math.round(wagons * TRAIN_RESALE_RATE) + engineTradeIn(state, train);
}

/** Kafelki zajęte przez pociągi na torach – tam nie wolno rozbierać torów ani stacji. */
export function occupiedTiles(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const t of state.trains) for (const s of [...t.trail, ...t.reservedAhead]) out.add(s.y * state.map.width + s.x);
  return out;
}

/**
 * Start: w zajezdni – zgłoszenie wyjazdu (pociąg wyjedzie, gdy wyjazd będzie wolny),
 * na torze – wznowienie jazdy.
 */
export function startTrain(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  if (train.status === 'depot') {
    const exit = depotExit(state, train);
    if (!exit) return { ok: false, reason: 'blocked' };
    if (successors(state, exit).length === 0) return { ok: false, reason: 'depotNotConnected' };
    if (needsCatenary(train.engine) && !isElectrified(state.map, exit.x, exit.y)) return { ok: false, reason: 'noCatenary' };
  }
  train.stopped = false;
  return { ok: true };
}

/** Odcinek wyjazdu z zajezdni, w której stoi pociąg. */
export function depotExit(state: GameState, train: Train): Step | null {
  const depot = state.depots.find((d) => d.id === train.depotId);
  return depot ? { x: depot.x, y: depot.y, track: 0, entry: -1, exit: depot.side } : null;
}

/** Wystawia pociąg na wyjazd z zajezdni (wywoływane, gdy wyjazd jest wolny). */
export function leaveDepot(train: Train, exit: Step, events: SimEvent[]): void {
  train.status = 'running';
  train.depotId = null;
  train.trail = [exit];
  train.reservedAhead = [];
  train.resTerminal = null;
  train.progress = 0;
  train.speed = 0;
  train.reversed = false;
  train.mayReverse = false;
  events.push({ type: 'trainsChanged' });
}

export function stopTrain(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  train.stopped = true;
  return { ok: true };
}

/** Zawróć: pociąg na torze hamuje i zawraca; na stacji zawraca od razu. */
export function requestReverse(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train || train.status === 'depot') return { ok: false, reason: 'blocked' };
  train.reverseRequested = true;
  return { ok: true };
}

/** Wiek lokomotywy w latach gry. */
export function engineAge(state: GameState, train: Train): number {
  return Math.max(0, (state.tick - train.engineBuilt) / (TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR));
}

/** Zwrot za starą lokomotywę przy wymianie: od 75% ceny dla nowej, liniowo do 10% po 50 latach. */
export function engineTradeIn(state: GameState, train: Train): number {
  const { full, old, years } = ECONOMY.refunds.engineTradeIn;
  const rate = full + (old - full) * Math.min(1, engineAge(state, train) / years);
  return Math.round(engineDef(train.engine)!.cost * rate);
}

/** Dopłata za wymianę lokomotywy: cena nowej minus zwrot za starą (zależny od jej wieku). */
export function replaceCost(state: GameState, train: Train, engine: string): number {
  return engineDef(engine)!.cost - engineTradeIn(state, train);
}

/**
 * Wymiana lokomotywy (wagony, rozkład i ładunek zostają). W zajezdni – od razu; w trasie – pociąg
 * jedzie do najbliższej zajezdni, tam wymienia lokomotywę i wraca na trasę. `null` – anulowanie.
 */
export function requestReplace(state: GameState, trainId: number, engine: string | null, events: SimEvent[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  if (engine === null) {
    if (train.replaceWith !== null) {
      train.replaceWith = null;
      train.goToDepot = false;
      train.resTerminal = null;
    }
    return { ok: true };
  }
  const def = engineDef(engine);
  if (!def || engine === train.engine) return { ok: false, reason: 'blocked' };
  if (!engineAvailable(def, gameDate(state).year)) return { ok: false, reason: 'notAvailable' };
  if (replaceCost(state, train, engine) > state.money) return { ok: false, reason: 'noMoney' };
  if (train.status === 'depot') {
    const depot = state.depots.find((d) => d.id === train.depotId);
    if (needsCatenary(engine) && depot && !isElectrified(state.map, depot.x, depot.y) && !train.stopped) {
      return { ok: false, reason: 'noCatenary' };
    }
    swapEngine(state, train, engine, events);
    return { ok: true };
  }
  train.replaceWith = engine;
  train.goToDepot = true;
  train.resTerminal = null;
  return { ok: true };
}

function swapEngine(state: GameState, train: Train, engine: string, events: SimEvent[]): void {
  const cost = replaceCost(state, train, engine);
  train.value += engineDef(engine)!.cost - engineDef(train.engine)!.cost;
  train.engine = engine;
  train.engineBuilt = state.tick;
  spend(state, 'construction', cost);
  events.push({ type: 'trainsChanged' });
}

/**
 * Pociąg wjechał do zajezdni z zamówioną wymianą: wymiana i powrót na trasę. Bez pieniędzy jedzie
 * dalej starą lokomotywą; elektryczna bez sieci w zajezdni – zostaje (stara lokomotywa) i czeka na gracza.
 */
export function replaceOnArrival(state: GameState, train: Train, events: SimEvent[]): void {
  const engine = train.replaceWith;
  if (engine === null) return;
  train.replaceWith = null;
  const depot = state.depots.find((d) => d.id === train.depotId);
  if (needsCatenary(engine) && depot && !isElectrified(state.map, depot.x, depot.y)) {
    events.push({ type: 'replaceFailed', trainId: train.id, reason: 'noCatenary' });
    return;
  }
  if (!engineAvailable(engineDef(engine)!, gameDate(state).year)) {
    events.push({ type: 'replaceFailed', trainId: train.id, reason: 'notAvailable' });
  } else if (replaceCost(state, train, engine) > state.money) {
    events.push({ type: 'replaceFailed', trainId: train.id, reason: 'noMoney' });
  } else {
    swapEngine(state, train, engine, events);
    events.push({ type: 'engineReplaced', trainId: train.id });
  }
  // Wraca na trasę (wyjedzie, gdy wyjazd będzie wolny).
  train.stopped = false;
}

/** Przełącza „jedź do zajezdni”. */
export function sendToDepot(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train || train.status === 'depot') return { ok: false, reason: 'blocked' };
  train.goToDepot = !train.goToDepot;
  // Ręczne odwołanie zjazdu anuluje też zamówioną wymianę lokomotywy.
  if (!train.goToDepot) train.replaceWith = null;
  // Cel się zmienił – po dojechaniu do końca obecnej rezerwacji trasa zostanie policzona od nowa.
  train.resTerminal = null;
  return { ok: true };
}

/**
 * Kopia pociągu: ta sama lokomotywa, wagony i rozkład; staje w zajezdni (zatrzymana). Zajezdnia:
 * ta, w której stoi oryginał, a w trasie – najbliższa (dla elektrycznej – z siecią trakcyjną).
 */
/**
 * Kopia pociągu. `shared` – kopia dzieli rozkład z oryginałem (ta sama linia); inaczej dostaje
 * własną kopię rozkładu.
 */
export function cloneTrain(state: GameState, trainId: number, events: SimEvent[], shared = true): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  const depot = cloneDepot(state, train);
  if (!depot) return { ok: false, reason: 'noDepot' };
  const result = buyTrain(state, depot.id, train.engine, train.wagons, events);
  if (!result.ok) return result;
  const copy = state.trains[state.trains.length - 1]!;
  copy.orders = [...train.orders];
  copy.fullLoad = [...train.fullLoad];
  copy.waitDays = [...train.waitDays];
  copy.spacing = train.spacing;
  copy.groupId = train.groupId;
  if (shared && train.orders.length) {
    train.shareId ??= state.nextShareId++;
    copy.shareId = train.shareId;
  }
  events.push({ type: 'trainCloned', trainId: copy.id, depotId: depot.id });
  return { ok: true };
}

function cloneDepot(state: GameState, train: Train) {
  if (train.status === 'depot') return state.depots.find((d) => d.id === train.depotId);
  // Zajezdnia, w której pociąg kupiono (elektryczna – tylko jeśli ma sieć, inaczej by nie wyjechała).
  const home = state.depots.find((d) => d.id === train.homeDepot);
  if (home && (!needsCatenary(train.engine) || isElectrified(state.map, home.x, home.y))) return home;
  const head = train.trail[0];
  if (!head) return undefined;
  const electric = needsCatenary(train.engine);
  let best: (typeof state.depots)[number] | undefined;
  let bestD = Infinity;
  for (const d of state.depots) {
    if (electric && !isElectrified(state.map, d.x, d.y)) continue;
    const dist = Math.abs(d.x - head.x) + Math.abs(d.y - head.y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/**
 * Nowy rozkład. `fullLoad` – ptaszki „pełny ładunek” dla pozycji; bez niego zostają ptaszki
 * dotychczasowych pozycji (dopisanie stacji na końcu ich nie rusza), nowe – bez ptaszka.
 */
export function setOrders(
  state: GameState,
  trainId: number,
  orders: readonly number[],
  fullLoad?: readonly boolean[],
  waitDays?: readonly number[],
): CommandResult {
  const train = trainById(state, trainId);
  if (!train || orders.some((id) => !state.stations.some((s) => s.id === id))) return { ok: false, reason: 'blocked' };
  const flags = orders.map((_, i) => (fullLoad ? fullLoad[i] === true : train.fullLoad[i] === true));
  const waits = orders.map((_, i) => clampWait(waitDays ? waitDays[i] : train.waitDays[i]));
  // Wspólny rozkład: ta sama zmiana dla całej linii.
  for (const t of sharedTrains(state, train)) {
    t.fullLoad = [...flags];
    t.waitDays = [...waits];
    t.orders = [...orders];
    if (t.currentOrder >= t.orders.length) t.currentOrder = 0;
    t.resTerminal = null;
  }
  if (orders.length === 0) unshare(state, train);
  return { ok: true };
}

/** Po usunięciu stacji pociągi nie mogą mieć jej w rozkładzie. */
export function dropStationFromOrders(state: GameState, stationId: number): void {
  for (const t of state.trains) {
    const i = t.orders.indexOf(stationId);
    if (i < 0) continue;
    t.fullLoad = t.fullLoad.filter((_, j) => t.orders[j] !== stationId);
    t.waitDays = t.waitDays.filter((_, j) => t.orders[j] !== stationId);
    t.orders = t.orders.filter((id) => id !== stationId);
    if (i < t.currentOrder) t.currentOrder--;
    if (t.currentOrder >= t.orders.length) t.currentOrder = 0;
    t.resTerminal = null;
  }
}

/** Przełącza „czekaj na pełny ładunek” dla pozycji rozkładu. */
export function toggleFullLoad(state: GameState, trainId: number, index: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train || index < 0 || index >= train.orders.length) return { ok: false, reason: 'blocked' };
  const on = !train.fullLoad[index];
  for (const t of sharedTrains(state, train)) t.fullLoad[index] = on;
  return { ok: true };
}

/** Pociągi dzielące rozkład z danym (z nim samym); bez wspólnego rozkładu – tylko on. */
export function sharedTrains(state: GameState, train: Train): Train[] {
  return train.shareId === null ? [train] : state.trains.filter((t) => t.shareId === train.shareId);
}

/** Odłącza pociąg od wspólnego rozkładu (zostaje mu kopia); samotny ostatni pociąg linii też przestaje dzielić. */
export function unshare(state: GameState, train: Train): void {
  const id = train.shareId;
  if (id === null) return;
  train.shareId = null;
  const rest = state.trains.filter((t) => t.shareId === id && t !== train);
  if (rest.length === 1) rest[0]!.shareId = null;
}

export function unshareOrders(state: GameState, trainId: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train || train.shareId === null) return { ok: false, reason: 'blocked' };
  unshare(state, train);
  return { ok: true };
}

/** Najdłuższy dodatkowy postój na stacji (dni). */
export const MAX_WAIT_DAYS = 30;

function clampWait(v: number | undefined): number {
  return Math.max(0, Math.min(MAX_WAIT_DAYS, Math.floor(v ?? 0) || 0));
}

/** Dodatkowy postój (dni) przy pozycji rozkładu – dla całej linii. */
export function setWaitDays(state: GameState, trainId: number, index: number, days: number): CommandResult {
  const train = trainById(state, trainId);
  if (!train || index < 0 || index >= train.orders.length) return { ok: false, reason: 'blocked' };
  for (const t of sharedTrains(state, train)) t.waitDays[index] = clampWait(days);
  return { ok: true };
}

/** Równe odstępy na linii (wspólny rozkład) – wł. / wył. dla wszystkich jej pociągów. */
export function setSpacing(state: GameState, trainId: number, on: boolean): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  for (const t of sharedTrains(state, train)) {
    t.spacing = on;
    t.holding = false;
  }
  return { ok: true };
}

/**
 * Odstęp między pociągami linii (ticki): średni czas okrążenia / liczba pociągów. 0 – jeszcze
 * nieznany (żaden pociąg nie objechał linii) albo linia ma jeden pociąg.
 */
export function lineHeadway(state: GameState, train: Train): number {
  const line = sharedTrains(state, train);
  if (line.length < 2) return 0;
  const loops = line.map((t) => t.loopTicks).filter((v) => v > 0);
  if (!loops.length) return 0;
  return Math.round(loops.reduce((s, v) => s + v, 0) / loops.length / line.length);
}
