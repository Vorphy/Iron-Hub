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
  state.trains = state.trains.filter((t) => t !== train);
  spend(state, 'construction', -resaleValue(state, train));
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/** Zwrot przy sprzedaży: wagony 75% ceny, lokomotywa – zależnie od wieku (jak przy wymianie). */
export function resaleValue(state: GameState, train: Train): number {
  const engineCost = engineDef(train.engine)!.cost;
  return Math.round((train.value - engineCost) * TRAIN_RESALE_RATE) + engineTradeIn(state, train);
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
export function cloneTrain(state: GameState, trainId: number, events: SimEvent[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train) return { ok: false, reason: 'blocked' };
  const depot = cloneDepot(state, train);
  if (!depot) return { ok: false, reason: 'noDepot' };
  const result = buyTrain(state, depot.id, train.engine, train.wagons, events);
  if (!result.ok) return result;
  const copy = state.trains[state.trains.length - 1]!;
  copy.orders = [...train.orders];
  copy.fullLoad = [...train.fullLoad];
  events.push({ type: 'trainCloned', trainId: copy.id, depotId: depot.id });
  return { ok: true };
}

function cloneDepot(state: GameState, train: Train) {
  if (train.status === 'depot') return state.depots.find((d) => d.id === train.depotId);
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
): CommandResult {
  const train = trainById(state, trainId);
  if (!train || orders.some((id) => !state.stations.some((s) => s.id === id))) return { ok: false, reason: 'blocked' };
  train.fullLoad = orders.map((_, i) => (fullLoad ? fullLoad[i] === true : train.fullLoad[i] === true));
  train.orders = [...orders];
  if (train.currentOrder >= train.orders.length) train.currentOrder = 0;
  train.resTerminal = null;
  return { ok: true };
}

/** Po usunięciu stacji pociągi nie mogą mieć jej w rozkładzie. */
export function dropStationFromOrders(state: GameState, stationId: number): void {
  for (const t of state.trains) {
    const i = t.orders.indexOf(stationId);
    if (i < 0) continue;
    t.fullLoad = t.fullLoad.filter((_, j) => t.orders[j] !== stationId);
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
  train.fullLoad[index] = !train.fullLoad[index];
  return { ok: true };
}
