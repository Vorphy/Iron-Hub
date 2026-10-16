import {
  CATCHMENT_RADIUS,
  CLEAR_ROUGH_COST,
  STATION_MAX_LENGTH,
  STATION_MAX_PLATFORMS,
  STATION_TILE_COST,
  TRACK_REFUND_RATE,
} from '../config';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { getTrackBits, Track } from '../track/track';
import { getTerrain, inBounds, setTerrain, Terrain, type WorldMap } from '../world/map';

export type StationAxis = 'x' | 'y';

export interface Station {
  id: number;
  name: string;
  axis: StationAxis;
  /** Indeksy kafelków peronów (y * width + x), rosnąco. */
  tiles: number[];
}

/** Fikcyjne nazwy stacji do czasu, aż pojawią się miasta. */
const STATION_NAMES = [
  'Żelazna Góra', 'Stalowo', 'Kolejowice', 'Parowiec', 'Węglin', 'Szynobrzeg', 'Dymno', 'Torzyn',
  'Rudnik', 'Iskrzyca', 'Semaforowo', 'Wagonin', 'Mostowo', 'Zwrotnica', 'Kłębowo', 'Hamulec',
  'Gwizdów', 'Przystań', 'Podkład', 'Kotłowo',
];

export function stationName(index: number): string {
  const base = STATION_NAMES[index % STATION_NAMES.length]!;
  const round = Math.floor(index / STATION_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

export function stationAt(state: GameState, x: number, y: number): Station | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.station[y * state.map.width + x];
  return id ? state.stations.find((s) => s.id === id) : undefined;
}

export interface StationPlan {
  tiles: { x: number; y: number; ok: boolean }[];
  axis: StationAxis;
  cost: number;
  result: CommandResult;
}

/** Oś peronu: dłuższy bok prostokąta; przy kwadracie – preferencja gracza. */
export function stationAxis(x0: number, y0: number, x1: number, y1: number, preferred: StationAxis): StationAxis {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  return w === h ? preferred : w > h ? 'x' : 'y';
}

export function planStation(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  axis: StationAxis,
): StationPlan {
  const { map } = state;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const length = axis === 'x' ? maxX - minX + 1 : maxY - minY + 1;
  const platforms = axis === 'x' ? maxY - minY + 1 : maxX - minX + 1;
  const axisTrack = axis === 'x' ? Track.X : Track.Y;

  const tiles: StationPlan['tiles'] = [];
  let cost = 0;
  let blocked = false;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const ok = canPlace(map, x, y, axisTrack);
      blocked ||= !ok;
      tiles.push({ x, y, ok });
      if (ok) {
        cost += STATION_TILE_COST;
        if (getTerrain(map, x, y) === Terrain.Rough) cost += CLEAR_ROUGH_COST;
      }
    }
  }

  let result: CommandResult = { ok: true };
  if (length > STATION_MAX_LENGTH || platforms > STATION_MAX_PLATFORMS) result = { ok: false, reason: 'tooBig' };
  else if (blocked) result = { ok: false, reason: 'blocked' };
  else if (cost > state.money) result = { ok: false, reason: 'noMoney' };
  return { tiles, axis, cost, result };
}

/** Kafelek nadaje się na peron: ląd, bez stacji, bez torów albo z samą prostą w osi peronu. */
function canPlace(map: WorldMap, x: number, y: number, axisTrack: Track): boolean {
  if (!inBounds(map, x, y) || getTerrain(map, x, y) === Terrain.Water) return false;
  if (map.station[y * map.width + x] || map.depot[y * map.width + x]) return false;
  const bits = getTrackBits(map, x, y);
  return bits === 0 || bits === axisTrack;
}

export function buildStation(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  axis: StationAxis,
  events: SimEvent[],
): CommandResult {
  const plan = planStation(state, x0, y0, x1, y1, axis);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  const id = state.nextStationId++;
  const axisTrack = axis === 'x' ? Track.X : Track.Y;
  const tiles: number[] = [];
  for (const { x, y } of plan.tiles) {
    const i = y * map.width + x;
    map.station[i] = id;
    map.track[i] = axisTrack;
    if (getTerrain(map, x, y) === Terrain.Rough) setTerrain(map, x, y, Terrain.Grass);
    tiles.push(i);
    events.push({ type: 'tileChanged', x, y });
  }
  tiles.sort((a, b) => a - b);
  state.stations.push({ id, name: stationName(id - 1), axis, tiles });
  state.money -= plan.cost;
  events.push({ type: 'stationsChanged' });
  return { ok: true };
}

/** Usuwa jeden kafelek peronu (razem z torem); pusta stacja znika. */
export function removeStationTile(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const station = stationAt(state, x, y);
  if (!station) return { ok: false, reason: 'nothingToClear' };
  const { map } = state;
  const i = y * map.width + x;
  map.station[i] = 0;
  map.track[i] = 0;
  station.tiles = station.tiles.filter((t) => t !== i);
  if (station.tiles.length === 0) state.stations = state.stations.filter((s) => s !== station);
  state.money += stationTileRefund();
  events.push({ type: 'tileChanged', x, y }, { type: 'stationsChanged' });
  return { ok: true };
}

export function stationTileRefund(): number {
  return Math.round(STATION_TILE_COST * TRACK_REFUND_RATE);
}

/** Kafelki w zasięgu stacji (promień Czebyszewa od każdego peronu), rosnąco. */
export function catchment(map: WorldMap, tiles: readonly number[], radius = CATCHMENT_RADIUS): number[] {
  const inside = new Uint8Array(map.width * map.height);
  for (const t of tiles) {
    const tx = t % map.width;
    const ty = Math.floor(t / map.width);
    for (let y = Math.max(0, ty - radius); y <= Math.min(map.height - 1, ty + radius); y++) {
      for (let x = Math.max(0, tx - radius); x <= Math.min(map.width - 1, tx + radius); x++) {
        inside[y * map.width + x] = 1;
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < inside.length; i++) if (inside[i]) out.push(i);
  return out;
}
