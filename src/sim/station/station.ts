import {
  CATCHMENT_RADIUS,
  CLEAR_ROUGH_COST,
  STATION_MAX_LENGTH,
  STATION_MAX_PLATFORMS,
  STATION_TILE_COST,
  TRACK_REFUND_RATE,
  METRO_STATION_EXTRA,
  WAYPOINT_COST,
} from '../config';
import { spend } from '../economy/finance';
import type { CommandResult, SimEvent } from '../commands';
import type { Cargo } from '../economy/cargo';
import type { GameState } from '../state';
import { nearestTown } from '../economy/town';
import { getTrackBits, Track } from '../track/track';
import { isFlat, tileBaseHeight } from '../world/height';
import { dropStationFromOrders } from '../trains/train';
import { getTerrain, hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from '../world/map';

/** Stacja bierze nazwę od miasta, którego rynek jest bliżej niż tyle kafelków. */
const TOWN_NAME_RADIUS = 16;

export type StationAxis = 'x' | 'y';

/** Stan jednego rodzaju ładunku na stacji. */
export interface StationCargo {
  /** Czeka na odbiór. */
  waiting: number;
  /** Tick ostatniego załadunku tego ładunku (-1 – nigdy). Bez obsługi stacja nie zbiera ładunku. */
  lastPickup: number;
}

export interface Station {
  id: number;
  name: string;
  axis: StationAxis;
  /** Indeksy kafelków peronów (y * width + x), rosnąco. */
  tiles: number[];
  cargo: Partial<Record<Cargo, StationCargo>>;
  /**
   * Perony metra tej stacji (poziom −1: `map.stationUnder`, tor w `map.under`). Stacja może mieć
   * perony na obu poziomach – to przesiadka: wspólna nazwa, ładunek i zasięg.
   */
  underTiles?: number[];
  /**
   * Punkt kontrolny: jeden kafelek na zwykłym torze, bez peronu i zasięgu. Pociąg z nim w rozkładzie
   * jedzie przez ten tor i nie zatrzymuje się.
   */
  waypoint: boolean;
}

/** Nazwy stacji z dala od miast. */
const STATION_NAMES = [
  'Żelazna Góra',
  'Stalowo',
  'Kolejowice',
  'Parowiec',
  'Węglin',
  'Szynobrzeg',
  'Dymno',
  'Torzyn',
  'Rudnik',
  'Iskrzyca',
  'Semaforowo',
  'Wagonin',
  'Mostowo',
  'Zwrotnica',
  'Kłębowo',
  'Hamulec',
  'Gwizdów',
  'Przystań',
  'Podkład',
  'Kotłowo',
];

/** Dopiski do nazwy, gdy miasto ma już stację o tej nazwie. */
const SUFFIXES = ['Główna', 'Wschód', 'Zachód', 'Północ', 'Południe', 'Towarowa', 'Osiedle', 'Park'];

/** Nazwa nowej stacji: od najbliższego miasta (z dopiskiem, gdy zajęta), inaczej z listy. */
export function stationNameFor(state: GameState, tiles: readonly number[], under = false): string {
  const W = state.map.width;
  const cx = tiles.reduce((s, t) => s + (t % W), 0) / tiles.length;
  const cy = tiles.reduce((s, t) => s + Math.floor(t / W), 0) / tiles.length;
  const town = nearestTown(state, cx, cy, TOWN_NAME_RADIUS);
  const taken = new Set(state.stations.map((s) => s.name));
  if (town) {
    const base = under ? `${town.name} Metro` : town.name;
    for (const name of [base, ...SUFFIXES.map((s) => `${base} ${s}`)]) if (!taken.has(name)) return name;
  }
  if (under) for (let i = 1; ; i++) if (!taken.has(`Metro ${i}`)) return `Metro ${i}`;
  for (let i = 0; ; i++) {
    const name = stationName(i);
    if (!taken.has(name)) return name;
  }
}

export function stationName(index: number): string {
  const base = STATION_NAMES[index % STATION_NAMES.length]!;
  const round = Math.floor(index / STATION_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

/** Stacja na kafelku – na powierzchni albo (`under`) w metrze. */
export function stationAt(state: GameState, x: number, y: number, under = false): Station | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = (under ? state.map.stationUnder : state.map.station)[y * state.map.width + x];
  return id ? state.stations.find((s) => s.id === id) : undefined;
}

export interface StationPlan {
  tiles: { x: number; y: number; ok: boolean }[];
  axis: StationAxis;
  cost: number;
  result: CommandResult;
  /** Stacja, którą peron rozbudowuje (sąsiaduje z nią), albo null – nowa stacja. */
  join: Station | null;
}

/** Wszystkie perony stacji – na powierzchni i w metrze (bez powtórzeń) – do zasięgu, ładunku, podpisu. */
export function allTiles(st: Station): number[] {
  if (!st.underTiles?.length) return st.tiles;
  return [...new Set([...st.tiles, ...st.underTiles])].sort((a, b) => a - b);
}

/**
 * Stacja, do której dołącza nowy peron (najniższy numer, gdy kilka): przylegająca bokiem na tym samym
 * poziomie albo – przesiadka – mająca peron na drugim poziomie w zasięgu nowego (promień zasięgu stacji).
 */
function adjacentStation(
  state: GameState,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  under: boolean,
): Station | null {
  const { map } = state;
  let best = 0;
  const check = (x: number, y: number, layer: Uint32Array) => {
    if (!inBounds(map, x, y)) return;
    const id = layer[y * map.width + x]!;
    // Punkt kontrolny to nie peron – nowej stacji do niego nie dołączamy.
    if (id && (!best || id < best) && !state.stations.find((s) => s.id === id)?.waypoint) best = id;
  };
  const other = under ? map.station : map.stationUnder;
  for (const layer of [map.station, map.stationUnder]) {
    for (let x = minX; x <= maxX; x++) {
      check(x, minY - 1, layer);
      check(x, maxY + 1, layer);
    }
    for (let y = minY; y <= maxY; y++) {
      check(minX - 1, y, layer);
      check(maxX + 1, y, layer);
    }
  }
  const r = CATCHMENT_RADIUS;
  for (let y = minY - r; y <= maxY + r; y++) for (let x = minX - r; x <= maxX + r; x++) check(x, y, other);
  return best ? (state.stations.find((s) => s.id === best) ?? null) : null;
}

/** Oś peronu: dłuższy bok prostokąta; przy kwadracie – preferencja gracza. */
export function stationAxis(x0: number, y0: number, x1: number, y1: number, preferred: StationAxis): StationAxis {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  return w === h ? preferred : w > h ? 'x' : 'y';
}

/** `separate` – osobna stacja nawet obok istniejącej (inaczej peron ją rozbudowuje). */
export function planStation(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  axis: StationAxis,
  separate = false,
  under = false,
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
  // Cała stacja na płaskim terenie, na jednej wysokości.
  const level = inBounds(map, minX, minY) ? tileBaseHeight(map, minX, minY) : 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Metro: peron pod ziemią – bez oglądania się na teren i budynki na powierzchni.
      const ok = under
        ? canPlaceUnder(map, x, y, axisTrack)
        : canPlace(map, x, y, axisTrack) && isFlat(map, x, y) && tileBaseHeight(map, x, y) === level;
      blocked ||= !ok;
      tiles.push({ x, y, ok });
      if (ok) {
        cost += STATION_TILE_COST;
        if (under) cost += METRO_STATION_EXTRA;
        else if (getTerrain(map, x, y) === Terrain.Rough) cost += CLEAR_ROUGH_COST;
      }
    }
  }

  let result: CommandResult = { ok: true };
  if (length > STATION_MAX_LENGTH || platforms > STATION_MAX_PLATFORMS) result = { ok: false, reason: 'tooBig' };
  else if (blocked) result = { ok: false, reason: 'blocked' };
  else if (cost > state.money) result = { ok: false, reason: 'noMoney' };
  const join = separate ? null : adjacentStation(state, minX, minY, maxX, maxY, under);
  return { tiles, axis, cost, result, join };
}

/** Kafelek nadaje się na peron: ląd, bez stacji, bez torów albo z samą prostą w osi peronu. */
function canPlace(map: WorldMap, x: number, y: number, axisTrack: Track): boolean {
  if (!inBounds(map, x, y) || getTerrain(map, x, y) === Terrain.Water) return false;
  const i = y * map.width + x;
  if (map.station[i] || map.depot[i] || hasBuilding(map, i) || map.bridge[i] || map.tunnel[i] || map.ramp[i]) return false;
  const bits = getTrackBits(map, x, y);
  return bits === 0 || bits === axisTrack;
}

/** Peron metra: bez innej stacji i zjazdu; tor metra brak albo prosty w osi peronu. */
function canPlaceUnder(map: WorldMap, x: number, y: number, axisTrack: Track): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  if (map.stationUnder[i] || map.ramp[i]) return false;
  return map.under[i] === 0 || map.under[i] === axisTrack;
}

export function buildStation(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  axis: StationAxis,
  events: SimEvent[],
  separate = false,
  under = false,
): CommandResult {
  const plan = planStation(state, x0, y0, x1, y1, axis, separate, under);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  const id = plan.join ? plan.join.id : state.nextStationId++;
  const axisTrack = axis === 'x' ? Track.X : Track.Y;
  const tiles: number[] = [];
  for (const { x, y } of plan.tiles) {
    const i = y * map.width + x;
    tiles.push(i);
    if (under) {
      map.stationUnder[i] = id;
      map.under[i] = axisTrack;
      continue;
    }
    map.station[i] = id;
    map.track[i] = axisTrack;
    map.road[i] = 0;
    if (getTerrain(map, x, y) === Terrain.Rough) setTerrain(map, x, y, Terrain.Grass);
    events.push({ type: 'tileChanged', x, y });
  }
  if (under) events.push({ type: 'undergroundChanged' });
  tiles.sort((a, b) => a - b);
  if (plan.join) {
    // Rozbudowa (także przesiadka z drugiego poziomu): ta sama stacja – nazwa, ładunek, rozkłady.
    if (under) plan.join.underTiles = [...(plan.join.underTiles ?? []), ...tiles].sort((a, b) => a - b);
    else plan.join.tiles = [...plan.join.tiles, ...tiles].sort((a, b) => a - b);
  } else {
    const name = stationNameFor(state, tiles, under);
    state.stations.push(
      under
        ? { id, name, axis, tiles: [], underTiles: tiles, cargo: {}, waypoint: false }
        : { id, name, axis, tiles, cargo: {}, waypoint: false },
    );
  }
  spend(state, 'construction', plan.cost);
  events.push({ type: 'stationsChanged' });
  return { ok: true };
}

/** Usuwa jeden kafelek peronu (razem z torem); pusta stacja znika. Punkt kontrolny – sam znacznik, tor zostaje. */
export function removeStationTile(state: GameState, x: number, y: number, events: SimEvent[], under = false): CommandResult {
  const station = stationAt(state, x, y, under);
  if (!station) return { ok: false, reason: 'nothingToClear' };
  const { map } = state;
  const i = y * map.width + x;
  if (under) {
    map.stationUnder[i] = 0;
    map.under[i] = 0;
    events.push({ type: 'undergroundChanged' });
  } else {
    map.station[i] = 0;
    if (!station.waypoint) map.track[i] = 0;
  }
  if (under) station.underTiles = (station.underTiles ?? []).filter((t) => t !== i);
  else station.tiles = station.tiles.filter((t) => t !== i);
  if (station.tiles.length === 0 && !station.underTiles?.length) {
    state.stations = state.stations.filter((s) => s !== station);
    dropStationFromOrders(state, station.id);
  }
  spend(state, 'construction', -stationTileRefund(station, under));
  events.push({ type: 'tileChanged', x, y }, { type: 'stationsChanged' });
  return { ok: true };
}

export function stationTileRefund(station?: Station, under = false): number {
  const cost = station?.waypoint ? WAYPOINT_COST : STATION_TILE_COST + (under ? METRO_STATION_EXTRA : 0);
  return Math.round(cost * TRACK_REFUND_RATE);
}

/** Punkt kontrolny: tylko na płaskim kafelku z jednym prostym torem (bez stacji, zajezdni, mostu, tunelu, drogi, semafora). */
export function planWaypoint(state: GameState, x: number, y: number): { cost: number; result: CommandResult } {
  const { map } = state;
  const cost = WAYPOINT_COST;
  if (!inBounds(map, x, y)) return { cost, result: { ok: false, reason: 'outOfBounds' } };
  const i = y * map.width + x;
  const bits = getTrackBits(map, x, y);
  if (!bits) return { cost, result: { ok: false, reason: 'noTrack' } };
  const blocked =
    (bits !== Track.X && bits !== Track.Y) ||
    map.station[i] ||
    map.depot[i] ||
    map.bridge[i] ||
    map.tunnel[i] ||
    map.ramp[i] ||
    map.road[i] ||
    !isFlat(map, x, y) ||
    state.signals.some((s) => s.x === x && s.y === y);
  if (blocked) return { cost, result: { ok: false, reason: 'blocked' } };
  if (cost > state.money) return { cost, result: { ok: false, reason: 'noMoney' } };
  return { cost, result: { ok: true } };
}

export function buildWaypoint(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const plan = planWaypoint(state, x, y);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  const i = y * map.width + x;
  const id = state.nextStationId++;
  map.station[i] = id;
  state.stations.push({
    id,
    name: waypointName(state),
    axis: getTrackBits(map, x, y) === Track.X ? 'x' : 'y',
    tiles: [i],
    cargo: {},
    waypoint: true,
  });
  spend(state, 'construction', plan.cost);
  events.push({ type: 'tileChanged', x, y }, { type: 'stationsChanged' });
  return { ok: true };
}

function waypointName(state: GameState): string {
  const taken = new Set(state.stations.map((s) => s.name));
  for (let n = 1; ; n++) if (!taken.has(`Punkt ${n}`)) return `Punkt ${n}`;
}

/** Stacje z peronami (bez punktów kontrolnych) – zasięg, ładunek, wzrost miast. */
export function platformStations(state: GameState): Station[] {
  return state.stations.filter((s) => !s.waypoint);
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
