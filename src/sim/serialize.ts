import type { Station } from './station/station';
import type { GameState } from './state';

/** Wersja formatu zapisu – podbijana przy niezgodnych zmianach (wtedy potrzebna migracja). */
export const SAVE_VERSION = 1;

export interface SerializedState {
  version: number;
  tick: number;
  rng: number;
  money: number;
  map: { width: number; height: number; terrain: string; track: string; station: string };
  stations: Station[];
  nextStationId: number;
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
      station: toBase64(new Uint8Array(map.station.buffer, map.station.byteOffset, map.station.byteLength)),
    },
    stations: state.stations.map((s) => ({ ...s, tiles: [...s.tiles] })),
    nextStationId: state.nextStationId,
  };
}

/** Obiekt JSON -> stan gry. Rzuca SaveError przy uszkodzonych lub obcych danych. */
export function deserializeState(data: unknown): GameState {
  const d = data as Partial<SerializedState>;
  if (!d || typeof d !== 'object') throw new SaveError('Brak danych');
  if (d.version !== SAVE_VERSION) throw new SaveError(`Nieobsługiwana wersja zapisu: ${String(d.version)}`);
  const m = d.map;
  if (!m || !isInt(m.width) || !isInt(m.height) || m.width <= 0 || m.height <= 0) throw new SaveError('Uszkodzona mapa');
  const n = m.width * m.height;
  const terrain = fromBase64(m.terrain, n);
  const track = fromBase64(m.track, n);
  const stationBytes = fromBase64(m.station, n * 4);
  const station = new Uint32Array(stationBytes.buffer, stationBytes.byteOffset, n);
  if (!isInt(d.tick) || !isInt(d.rng) || typeof d.money !== 'number' || !isInt(d.nextStationId)) {
    throw new SaveError('Uszkodzone dane gry');
  }
  if (!Array.isArray(d.stations) || !d.stations.every(isStation)) throw new SaveError('Uszkodzone stacje');
  return {
    version: 1,
    tick: d.tick,
    rng: { state: d.rng >>> 0 },
    money: d.money,
    map: { width: m.width, height: m.height, terrain, track, station: new Uint32Array(station) },
    stations: d.stations.map((s) => ({ ...s, tiles: [...s.tiles] })),
    nextStationId: d.nextStationId,
  };
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
