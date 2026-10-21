import type { TrainGroup } from './trains/groups';
import type { Depot } from './depot/depot';
import { isCargo } from './economy/cargo';
import type { Finances, Ledger } from './economy/finance';
import { industryDef, type Industry } from './economy/industry';
import type { Town } from './economy/town';
import type { Signal, SignalMode } from './signals/signals';
import type { Station } from './station/station';
import type { Bridge } from './track/bridge';
import type { Tunnel } from './track/tunnel';
import type { GameState } from './state';
import { ALL_TRACKS, Side } from './track/track';
import type { Step, Train, WagonLoad } from './trains/train';
import { engineDef, wagonDef } from './trains/vehicles';
import { MAX_HEIGHT } from './world/height';

/** Wersja formatu zapisu – podbijana przy niezgodnych zmianach; starsze wersje migrujemy w `migrate()`. */
export const SAVE_VERSION = 19;

/** Warstwy mapy zapisywane jako base64; bajty na kafelek. */
const LAYERS = {
  terrain: 1,
  track: 1,
  station: 4,
  depot: 4,
  house: 1,
  town: 2,
  industry: 4,
  bridge: 2,
  tunnel: 2,
  road: 1,
  electric: 1,
} as const;
type LayerName = keyof typeof LAYERS;

export interface SerializedState {
  version: number;
  tick: number;
  startYear: number;
  rng: number;
  money: number;
  /** `heights` – siatka narożników (width+1)×(height+1), pozostałe warstwy – po jednej wartości na kafelek. */
  map: { width: number; height: number; heights: string } & Record<LayerName, string>;
  stations: Station[];
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
  groups: TrainGroup[];
  nextGroupId: number;
  nextShareId: number;
}

export class SaveError extends Error {}

/** Stan gry -> obiekt JSON. Tablice kafelków jako base64 (mapa 128×128 to ~300 KB). */
export function serializeState(state: GameState): SerializedState {
  const { map } = state;
  const layers = Object.fromEntries(
    (Object.keys(LAYERS) as LayerName[]).map((name) => [name, layerToBase64(map[name])]),
  ) as Record<LayerName, string>;
  return {
    version: SAVE_VERSION,
    tick: state.tick,
    startYear: state.startYear,
    rng: state.rng.state,
    money: state.money,
    map: { width: map.width, height: map.height, heights: layerToBase64(map.heights), ...layers },
    stations: structuredClone(state.stations),
    nextStationId: state.nextStationId,
    depots: structuredClone(state.depots),
    nextDepotId: state.nextDepotId,
    trains: structuredClone(state.trains),
    nextTrainId: state.nextTrainId,
    signals: structuredClone(state.signals),
    signalMode: state.signalMode,
    towns: structuredClone(state.towns),
    industries: structuredClone(state.industries),
    finances: structuredClone(state.finances),
    bridges: structuredClone(state.bridges),
    nextBridgeId: state.nextBridgeId,
    tunnels: structuredClone(state.tunnels),
    nextTunnelId: state.nextTunnelId,
    groups: structuredClone(state.groups),
    nextGroupId: state.nextGroupId,
    nextShareId: state.nextShareId,
  };
}

/** Uzupełnia zapisy ze starszych wersji gry (każdy krok podnosi wersję o jeden). */
function migrate(data: Record<string, unknown>): Partial<SerializedState> {
  const d = structuredClone(data) as Record<string, unknown> & { map?: Record<string, unknown> };
  const emptyLayer = (name: LayerName) =>
    d.map && isInt(d.map.width) && isInt(d.map.height)
      ? toBase64(new Uint8Array(d.map.width * d.map.height * LAYERS[name]))
      : undefined;
  const mapTrains = (f: (t: Record<string, unknown>) => Record<string, unknown>) => {
    if (Array.isArray(d.trains)) d.trains = d.trains.map(f);
  };

  if (d.version === 1) {
    // v2: zajezdnie
    if (d.map) d.map.depot = emptyLayer('depot');
    d.depots = [];
    d.nextDepotId = 1;
    d.version = 2;
  }
  if (d.version === 2) {
    // v3: pociągi
    d.trains = [];
    d.nextTrainId = 1;
    d.version = 3;
  }
  if (d.version === 3) {
    // v4: semafory i rezerwacje torów
    d.signals = [];
    d.signalMode = 'auto';
    mapTrains((t) => ({ ...t, reservedAhead: [], resTerminal: null }));
    d.version = 4;
  }
  if (d.version === 4) {
    // v5: miasta, przemysł, ładunki, finanse (stare mapy zostają bez miast i zakładów)
    if (d.map) for (const name of ['house', 'town', 'industry'] as const) d.map[name] = emptyLayer(name);
    d.towns = [];
    d.industries = [];
    d.finances = { month: { income: 0, trains: 0, infrastructure: 0, construction: 0 }, history: [] };
    if (Array.isArray(d.stations)) d.stations = d.stations.map((s: Record<string, unknown>) => ({ ...s, cargo: {} }));
    mapTrains((t) => ({
      ...t,
      loads: Array.isArray(t.wagons) ? t.wagons.map(() => ({ amount: 0, source: 0, loadedTick: 0 })) : [],
    }));
    d.version = 5;
  }
  if (d.version === 5) {
    // v6: wysokości terenu (stare mapy są płaskie)
    if (d.map && isInt(d.map.width) && isInt(d.map.height)) {
      d.map.heights = toBase64(new Uint8Array((d.map.width + 1) * (d.map.height + 1)));
    }
    d.version = 6;
  }
  if (d.version === 6) {
    // v7: mosty
    if (d.map) d.map.bridge = emptyLayer('bridge');
    d.bridges = [];
    d.nextBridgeId = 1;
    d.version = 7;
  }
  if (d.version === 7) {
    // v8: tunele
    if (d.map) d.map.tunnel = emptyLayer('tunnel');
    d.tunnels = [];
    d.nextTunnelId = 1;
    d.version = 8;
  }
  if (d.version === 8) {
    // v9: czekanie i zawracanie pociągów w stanie gry
    mapTrains((t) => ({ ...t, blockedTicks: 0, blockedBy: null, reverseRequested: false }));
    d.version = 9;
  }
  if (d.version === 9) {
    // v10: drogi w miastach (stare mapy bez dróg – miasta zbudują je przy wzroście)
    if (d.map) d.map.road = emptyLayer('road');
    d.version = 10;
  }
  if (d.version === 10) {
    // v11: kredyt, bankructwo, odsetki w bilansie
    const f = d.finances as Record<string, unknown> | undefined;
    if (f && typeof f === 'object') {
      const addInterest = (l: unknown) => (l && typeof l === 'object' ? { ...l, interest: 0 } : l);
      f.month = addInterest(f.month);
      if (Array.isArray(f.history)) f.history = f.history.map(addInterest);
      Object.assign(f, { loan: 0, debtMonths: 0, bankrupt: false });
    }
    d.version = 11;
  }
  if (d.version === 11) {
    // v12: rok startu (dotąd zawsze 1950) i sieć trakcyjna
    d.startYear = 1950;
    if (d.map) d.map.electric = emptyLayer('electric');
    d.version = 12;
  }
  if (d.version === 12) {
    // v13: zamówiona wymiana lokomotywy
    mapTrains((t) => ({ ...t, replaceWith: null, engineBuilt: 0 }));
    d.version = 13;
  }
  if (d.version === 13) {
    // v14: „czekaj na pełny ładunek” przy pozycjach rozkładu
    mapTrains((t) => ({ ...t, fullLoad: Array.isArray(t.orders) ? t.orders.map(() => false) : [] }));
    d.version = 14;
  }
  if (d.version === 14) {
    // v15: magazyn wagonów w zajezdniach
    if (Array.isArray(d.depots)) d.depots = d.depots.map((dep) => ({ ...(dep as object), wagons: [] }));
    d.version = 15;
  }
  if (d.version === 15) {
    // v16: zajezdnia zakupu (kopie trafiają tam); dla starych pociągów – ta, w której stoją
    mapTrains((t) => ({ ...t, homeDepot: t.status === 'depot' ? (t.depotId ?? null) : null }));
    d.version = 16;
  }
  if (d.version === 16) {
    // v17: zysk pociągów, data zakupu, grupy
    mapTrains((t) => ({ ...t, profitThisYear: 0, profitLastYear: 0, createdTick: 0, groupId: null }));
    d.groups = [];
    d.nextGroupId = 1;
    d.version = 17;
  }
  if (d.version === 17) {
    // v18: wspólne rozkłady
    mapTrains((t) => ({ ...t, shareId: null }));
    d.nextShareId = 1;
    d.version = 18;
  }
  if (d.version === 18) {
    // v19: rozkład czasowy (postoje, równe odstępy)
    mapTrains((t) => ({
      ...t,
      waitDays: Array.isArray(t.orders) ? t.orders.map(() => 0) : [],
      spacing: false,
      departedFirstTick: -1,
      loopTicks: 0,
      holding: false,
    }));
    d.version = 19;
  }
  return d as Partial<SerializedState>;
}

/** Obiekt JSON -> stan gry. Rzuca SaveError przy uszkodzonych lub obcych danych. */
export function deserializeState(data: unknown): GameState {
  if (!data || typeof data !== 'object') throw new SaveError('Brak danych');
  const d = migrate(data as Record<string, unknown>);
  if (d.version !== SAVE_VERSION) throw new SaveError(`Nieobsługiwana wersja zapisu: ${String(d.version)}`);
  const m = d.map;
  if (!m || !isInt(m.width) || !isInt(m.height) || m.width <= 0 || m.height <= 0) throw new SaveError('Uszkodzona mapa');
  const n = m.width * m.height;
  const bytes = (name: LayerName) => fromBase64(m[name], n * LAYERS[name]);
  const map = {
    width: m.width,
    height: m.height,
    terrain: bytes('terrain'),
    track: bytes('track'),
    station: new Uint32Array(bytes('station').buffer),
    depot: new Uint32Array(bytes('depot').buffer),
    house: bytes('house'),
    town: new Uint16Array(bytes('town').buffer),
    industry: new Uint32Array(bytes('industry').buffer),
    heights: fromBase64(m.heights, (m.width + 1) * (m.height + 1)),
    bridge: new Uint16Array(bytes('bridge').buffer),
    tunnel: new Uint16Array(bytes('tunnel').buffer),
    road: bytes('road'),
    electric: bytes('electric'),
  };
  if (map.heights.some((h) => h > MAX_HEIGHT)) throw new SaveError('Uszkodzone wysokości terenu');
  const ints = [
    d.tick,
    d.rng,
    d.nextStationId,
    d.nextDepotId,
    d.nextTrainId,
    d.nextBridgeId,
    d.nextTunnelId,
    d.nextGroupId,
    d.nextShareId,
  ];
  if (!ints.every(isInt) || typeof d.money !== 'number') throw new SaveError('Uszkodzone dane gry');
  check(d.stations, isStation, 'stacje');
  check(d.depots, isDepot, 'zajezdnie');
  check(d.trains, isTrain, 'pociągi');
  check(d.signals, isSignal, 'semafory');
  check(d.towns, isTown, 'miasta');
  check(d.industries, isIndustry, 'zakłady');
  check(d.bridges, isBridge, 'mosty');
  check(d.tunnels, isTunnel, 'tunele');
  check(d.groups, isGroup, 'grupy');
  if (d.signalMode !== 'auto' && d.signalMode !== 'manual') throw new SaveError('Uszkodzony tryb sygnalizacji');
  if (!isFinances(d.finances)) throw new SaveError('Uszkodzone finanse');
  return {
    version: 1,
    tick: d.tick!,
    startYear: d.startYear!,
    rng: { state: d.rng! >>> 0 },
    money: d.money,
    map,
    stations: d.stations!,
    nextStationId: d.nextStationId!,
    depots: d.depots!,
    nextDepotId: d.nextDepotId!,
    trains: d.trains!,
    nextTrainId: d.nextTrainId!,
    signals: d.signals!,
    signalMode: d.signalMode,
    towns: d.towns!,
    industries: d.industries!,
    finances: d.finances,
    bridges: d.bridges!,
    nextBridgeId: d.nextBridgeId!,
    tunnels: d.tunnels!,
    nextTunnelId: d.nextTunnelId!,
    groups: d.groups!,
    nextGroupId: d.nextGroupId!,
    nextShareId: d.nextShareId!,
  };
}

function isGroup(v: unknown): v is TrainGroup {
  const g = v as TrainGroup;
  return isObj(g) && isInt(g.id) && typeof g.name === 'string';
}

function isTunnel(v: unknown): v is Tunnel {
  const t = v as Tunnel;
  return (
    isObj(t) &&
    isInt(t.id) &&
    isInt(t.x) &&
    isInt(t.y) &&
    (t.axis === 'x' || t.axis === 'y') &&
    isInt(t.length) &&
    t.length >= 2 &&
    isInt(t.level)
  );
}

function isBridge(v: unknown): v is Bridge {
  const b = v as Bridge;
  return (
    isObj(b) &&
    isInt(b.id) &&
    isInt(b.x) &&
    isInt(b.y) &&
    (b.axis === 'x' || b.axis === 'y') &&
    isInt(b.length) &&
    b.length >= 3 &&
    isInt(b.deck)
  );
}

function check<T>(v: unknown, guard: (x: unknown) => x is T, what: string): asserts v is T[] {
  if (!Array.isArray(v) || !v.every(guard)) throw new SaveError(`Uszkodzone dane: ${what}`);
}

// --- Walidacja ---

const SIDES: readonly number[] = Object.values(Side);

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Obiekt z kluczami-ładunkami i wartościami spełniającymi `guard`. */
function isCargoRecord(v: unknown, guard: (x: unknown) => boolean): boolean {
  return isObj(v) && Object.entries(v).every(([k, x]) => isCargo(k) && guard(x));
}

function isStep(v: unknown): v is Step {
  const s = v as Step;
  const side = (x: unknown) => x === -1 || SIDES.includes(x as number);
  return isObj(s) && isInt(s.x) && isInt(s.y) && isInt(s.track) && side(s.entry) && side(s.exit);
}

function isLoad(v: unknown): v is WagonLoad {
  const l = v as WagonLoad;
  return isObj(l) && isNum(l.amount) && isInt(l.source) && isInt(l.loadedTick);
}

function isTrain(v: unknown): v is Train {
  const t = v as Train;
  return (
    isObj(t) &&
    isInt(t.id) &&
    typeof t.name === 'string' &&
    !!engineDef(t.engine) &&
    Array.isArray(t.wagons) &&
    t.wagons.every((w) => !!wagonDef(w)) &&
    ['depot', 'running', 'loading'].includes(t.status) &&
    (t.depotId === null || isInt(t.depotId)) &&
    typeof t.stopped === 'boolean' &&
    Array.isArray(t.orders) &&
    t.orders.every(isInt) &&
    Array.isArray(t.fullLoad) &&
    t.fullLoad.length === t.orders.length &&
    t.fullLoad.every((f) => typeof f === 'boolean') &&
    isInt(t.currentOrder) &&
    typeof t.goToDepot === 'boolean' &&
    typeof t.mayReverse === 'boolean' &&
    isNum(t.speed) &&
    isNum(t.progress) &&
    Array.isArray(t.trail) &&
    t.trail.every(isStep) &&
    Array.isArray(t.reservedAhead) &&
    t.reservedAhead.every(isStep) &&
    (t.resTerminal === null || ['stop', 'depot', 'reverse'].includes(t.resTerminal)) &&
    typeof t.reversed === 'boolean' &&
    isInt(t.waitTicks) &&
    isNum(t.value) &&
    Array.isArray(t.loads) &&
    t.loads.length === t.wagons.length &&
    t.loads.every(isLoad) &&
    isInt(t.blockedTicks) &&
    (t.blockedBy === null || isInt(t.blockedBy)) &&
    typeof t.reverseRequested === 'boolean' &&
    (t.replaceWith === null || !!engineDef(t.replaceWith)) &&
    isNum(t.engineBuilt) &&
    (t.homeDepot === null || isInt(t.homeDepot)) &&
    isNum(t.profitThisYear) &&
    isNum(t.profitLastYear) &&
    isInt(t.createdTick) &&
    (t.groupId === null || isInt(t.groupId)) &&
    (t.shareId === null || isInt(t.shareId)) &&
    Array.isArray(t.waitDays) &&
    t.waitDays.length === t.orders.length &&
    t.waitDays.every(isInt) &&
    typeof t.spacing === 'boolean' &&
    isInt(t.departedFirstTick) &&
    isInt(t.loopTicks) &&
    typeof t.holding === 'boolean'
  );
}

function isSignal(v: unknown): v is Signal {
  const s = v as Signal;
  return (
    isObj(s) &&
    isInt(s.x) &&
    isInt(s.y) &&
    ALL_TRACKS.includes(s.track) &&
    (s.dirs === 1 || s.dirs === 2 || s.dirs === 3) &&
    typeof s.oneWay === 'boolean'
  );
}

function isDepot(v: unknown): v is Depot {
  const d = v as Depot;
  return (
    isObj(d) &&
    isInt(d.id) &&
    isInt(d.x) &&
    isInt(d.y) &&
    SIDES.includes(d.side) &&
    Array.isArray(d.wagons) &&
    d.wagons.every((w) => isObj(w) && !!wagonDef(w.type) && isLoad(w.load))
  );
}

function isStation(v: unknown): v is Station {
  const st = v as Station;
  return (
    isObj(st) &&
    isInt(st.id) &&
    typeof st.name === 'string' &&
    (st.axis === 'x' || st.axis === 'y') &&
    Array.isArray(st.tiles) &&
    st.tiles.every(isInt) &&
    isCargoRecord(st.cargo, (c) => isObj(c) && isNum(c.waiting) && isInt(c.lastPickup))
  );
}

function isTown(v: unknown): v is Town {
  const t = v as Town;
  return (
    isObj(t) &&
    isInt(t.id) &&
    typeof t.name === 'string' &&
    isInt(t.x) &&
    isInt(t.y) &&
    isObj(t.month) &&
    Object.values(t.month).every(isNum) &&
    isNum(t.lastTransported)
  );
}

function isIndustry(v: unknown): v is Industry {
  const i = v as Industry;
  return (
    isObj(i) &&
    isInt(i.id) &&
    !!industryDef(i.type) &&
    typeof i.name === 'string' &&
    isInt(i.x) &&
    isInt(i.y) &&
    isInt(i.level) &&
    isNum(i.growth) &&
    isObj(i.month) &&
    isNum(i.month.produced) &&
    isNum(i.month.transported) &&
    isCargoRecord(i.month.delivered, isNum) &&
    Array.isArray(i.history) &&
    i.history.every(isNum)
  );
}

function isLedger(v: unknown): v is Ledger {
  const l = v as Ledger;
  return isObj(l) && isNum(l.income) && isNum(l.trains) && isNum(l.infrastructure) && isNum(l.construction) && isNum(l.interest);
}

function isFinances(v: unknown): v is Finances {
  const f = v as Finances;
  return (
    isObj(f) &&
    isLedger(f.month) &&
    Array.isArray(f.history) &&
    f.history.every(isLedger) &&
    isNum(f.loan) &&
    f.loan >= 0 &&
    isInt(f.debtMonths) &&
    typeof f.bankrupt === 'boolean'
  );
}

// --- base64 ---

function layerToBase64(arr: Uint8Array | Uint16Array | Uint32Array): string {
  return toBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function fromBase64(s: unknown, expectedLength: number): Uint8Array {
  if (typeof s !== 'string') throw new SaveError('Brak danych mapy');
  let bin: string;
  try {
    bin = atob(s);
  } catch {
    throw new SaveError('Uszkodzone dane mapy');
  }
  if (bin.length !== expectedLength) throw new SaveError('Nieprawidłowy rozmiar danych mapy');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
