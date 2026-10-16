import type { Depot } from './depot/depot';
import type { Station } from './station/station';
import type { GameState } from './state';
import { Side } from './track/track';
import type { Step, Train } from './trains/train';
import { engineDef, wagonDef } from './trains/vehicles';

/** Wersja formatu zapisu – podbijana przy niezgodnych zmianach; starsze wersje migrujemy w `migrate()`. */
export const SAVE_VERSION = 3;

export interface SerializedState {
  version: number;
  tick: number;
  rng: number;
  money: number;
  map: { width: number; height: number; terrain: string; track: string; station: string; depot: string };
  stations: Station[];
  nextStationId: number;
  depots: Depot[];
  nextDepotId: number;
  trains: Train[];
  nextTrainId: number;
}

export class SaveError extends Error {}

/** Stan gry -> obiekt JSON. Tablice kafelków jako base64 (128×128 to ~130 KB). */
export function serializeState(state: GameState): SerializedState {
  const { map } = state;
  return {
    version: SAVE_VERSION,
    tick: state.tick,
    rng: state.rng.state,
    money: state.money,
    map: {
      width: map.width,
      height: map.height,
      terrain: toBase64(map.terrain),
      track: toBase64(map.track),
      station: u32ToBase64(map.station),
      depot: u32ToBase64(map.depot),
    },
    stations: state.stations.map((s) => ({ ...s, tiles: [...s.tiles] })),
    nextStationId: state.nextStationId,
    depots: state.depots.map((d) => ({ ...d })),
    nextDepotId: state.nextDepotId,
    trains: state.trains.map(cloneTrain),
    nextTrainId: state.nextTrainId,
  };
}

function cloneTrain(t: Train): Train {
  return { ...t, wagons: [...t.wagons], orders: [...t.orders], trail: t.trail.map((s) => ({ ...s })) };
}

/** Uzupełnia zapisy ze starszych wersji gry. */
function migrate(data: Record<string, unknown>): Partial<SerializedState> {
  const d = { ...data } as Record<string, unknown> & { map?: Record<string, unknown> };
  if (d.version === 1) {
    // v2: zajezdnie
    const m = d.map ? { ...d.map } : undefined;
    d.map = m;
    if (m && isInt(m.width) && isInt(m.height)) m.depot = u32ToBase64(new Uint32Array(m.width * m.height));
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
  const terrain = fromBase64(m.terrain, n);
  const track = fromBase64(m.track, n);
  const station = u32FromBase64(m.station, n);
  const depot = u32FromBase64(m.depot, n);
  if (
    !isInt(d.tick) ||
    !isInt(d.rng) ||
    typeof d.money !== 'number' ||
    !isInt(d.nextStationId) ||
    !isInt(d.nextDepotId) ||
    !isInt(d.nextTrainId)
  ) {
    throw new SaveError('Uszkodzone dane gry');
  }
  if (!Array.isArray(d.stations) || !d.stations.every(isStation)) throw new SaveError('Uszkodzone stacje');
  if (!Array.isArray(d.depots) || !d.depots.every(isDepot)) throw new SaveError('Uszkodzone zajezdnie');
  if (!Array.isArray(d.trains) || !d.trains.every(isTrain)) throw new SaveError('Uszkodzone pociągi');
  return {
    version: 1,
    tick: d.tick,
    rng: { state: d.rng >>> 0 },
    money: d.money,
    map: { width: m.width, height: m.height, terrain, track, station, depot },
    stations: d.stations.map((s) => ({ ...s, tiles: [...s.tiles] })),
    nextStationId: d.nextStationId,
    depots: d.depots.map((dep) => ({ ...dep })),
    nextDepotId: d.nextDepotId,
    trains: d.trains.map(cloneTrain),
    nextTrainId: d.nextTrainId,
  };
}

const SIDES: readonly number[] = Object.values(Side);

function isStep(v: unknown): v is Step {
  const s = v as Step;
  const side = (x: unknown) => x === -1 || SIDES.includes(x as number);
  return !!s && isInt(s.x) && isInt(s.y) && isInt(s.track) && side(s.entry) && side(s.exit);
}

function isTrain(v: unknown): v is Train {
  const t = v as Train;
  return (
    !!t &&
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
    isInt(t.currentOrder) &&
    typeof t.goToDepot === 'boolean' &&
    typeof t.mayReverse === 'boolean' &&
    typeof t.speed === 'number' &&
    typeof t.progress === 'number' &&
    Array.isArray(t.trail) &&
    t.trail.every(isStep) &&
    typeof t.reversed === 'boolean' &&
    isInt(t.waitTicks) &&
    typeof t.value === 'number'
  );
}

function isDepot(v: unknown): v is Depot {
  const d = v as Depot;
  return !!d && isInt(d.id) && isInt(d.x) && isInt(d.y) && Object.values(Side).includes(d.side);
}

function u32ToBase64(arr: Uint32Array): string {
  return toBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

function u32FromBase64(s: unknown, length: number): Uint32Array {
  const bytes = fromBase64(s, length * 4);
  return new Uint32Array(bytes.buffer, bytes.byteOffset, length);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isStation(s: unknown): s is Station {
  const st = s as Station;
  return (
    !!st &&
    isInt(st.id) &&
    typeof st.name === 'string' &&
    (st.axis === 'x' || st.axis === 'y') &&
    Array.isArray(st.tiles) &&
    st.tiles.every(isInt)
  );
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
