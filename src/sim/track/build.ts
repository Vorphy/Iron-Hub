import { spend } from '../economy/finance';
import { CLEAR_ROUGH_COST, TRACK_COST, TRACK_REFUND_RATE } from '../config';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { getTerrain, hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from '../world/map';
import { occupiedTiles } from '../trains/train';
import { cornerHeights, tileSlope, type Slope } from '../world/height';
import { hasTrack, Track, type TrackPiece } from './track';

export type PieceStatus = 'new' | 'exists' | 'blocked';

export interface TrackPlan {
  pieces: { piece: TrackPiece; status: PieceStatus }[];
  /** Dodatni – koszt; ujemny – zwrot. */
  cost: number;
  result: CommandResult;
}

/** Sprawdza budowę bez zmiany stanu – używane też do podglądu w UI. */
export function planBuildTrack(state: GameState, pieces: readonly TrackPiece[]): TrackPlan {
  const { map } = state;
  const out: TrackPlan['pieces'] = [];
  const roughTiles = new Set<number>();
  let cost = 0;
  let blocked = false;
  for (const piece of unique(pieces)) {
    let status: PieceStatus;
    if (!buildable(map, piece)) {
      status = 'blocked';
      blocked = true;
    } else if (hasTrack(map, piece.x, piece.y, piece.track)) {
      status = 'exists';
    } else {
      status = 'new';
      cost += TRACK_COST;
      if (getTerrain(map, piece.x, piece.y) === Terrain.Rough) roughTiles.add(piece.y * map.width + piece.x);
    }
    out.push({ piece, status });
  }
  cost += roughTiles.size * CLEAR_ROUGH_COST;
  const result: CommandResult = blocked
    ? { ok: false, reason: 'blocked' }
    : cost > state.money
      ? { ok: false, reason: 'noMoney' }
      : { ok: true };
  return { pieces: out, cost, result };
}

export function buildTrack(state: GameState, pieces: readonly TrackPiece[], events: SimEvent[]): CommandResult {
  const plan = planBuildTrack(state, pieces);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  for (const { piece, status } of plan.pieces) {
    if (status !== 'new') continue;
    const i = piece.y * map.width + piece.x;
    map.track[i]! |= piece.track;
    if (getTerrain(map, piece.x, piece.y) === Terrain.Rough) setTerrain(map, piece.x, piece.y, Terrain.Grass);
    events.push({ type: 'tileChanged', x: piece.x, y: piece.y });
  }
  spend(state, 'construction', plan.cost);
  return { ok: true };
}

/** Rozbiórka: tylko istniejące elementy; zwraca część kosztu. */
export function planRemoveTrack(state: GameState, pieces: readonly TrackPiece[]): TrackPlan {
  const { map } = state;
  const out: TrackPlan['pieces'] = [];
  let count = 0;
  for (const piece of unique(pieces)) {
    // Torów na peronie nie rozbieramy osobno – usuwa się kafelek stacji.
    const exists =
      inBounds(map, piece.x, piece.y) &&
      !map.station[piece.y * map.width + piece.x] &&
      !isBridgeHead(map, piece.x, piece.y) &&
      hasTrack(map, piece.x, piece.y, piece.track);
    if (exists) count++;
    out.push({ piece, status: exists ? 'exists' : 'blocked' });
  }
  const occupied = occupiedTiles(state);
  const blocked = out.some(({ piece, status }) => status === 'exists' && occupied.has(piece.y * map.width + piece.x));
  const result: CommandResult = blocked
    ? { ok: false, reason: 'trainInWay' }
    : count > 0
      ? { ok: true }
      : { ok: false, reason: 'nothingToRemove' };
  return { pieces: out, cost: -count * refund(), result };
}

export function removeTrack(state: GameState, pieces: readonly TrackPiece[], events: SimEvent[]): CommandResult {
  const plan = planRemoveTrack(state, pieces);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  for (const { piece, status } of plan.pieces) {
    if (status !== 'exists') continue;
    map.track[piece.y * map.width + piece.x]! &= ~piece.track;
    events.push({ type: 'tileChanged', x: piece.x, y: piece.y });
  }
  spend(state, 'construction', plan.cost);
  return { ok: true };
}

export function refund(): number {
  return Math.round(TRACK_COST * TRACK_REFUND_RATE);
}

function buildable(map: WorldMap, { x, y, track }: TrackPiece): boolean {
  if (!inBounds(map, x, y) || getTerrain(map, x, y) === Terrain.Water) return false;
  if (map.depot[y * map.width + x] || hasBuilding(map, y * map.width + x)) return false;
  // Na peronie wolno mieć tylko prosty tor w osi stacji (już istnieje).
  if (map.station[y * map.width + x]) return (track === Track.X || track === Track.Y) && hasTrack(map, x, y, track);
  // Przyczółek mostu: tylko istniejący tor w osi mostu.
  if (isBridgeHead(map, x, y)) return hasTrack(map, x, y, track);
  return trackFitsSlope(tileSlope(map, x, y), track) || levelDiagonal(map, x, y, track);
}

/** Tor na zboczu: tylko prosty, biegnący w górę zbocza (jak w TTD); łuki tylko na płaskim. */
export function trackFitsSlope(slope: Slope, track: number): boolean {
  if (slope === 'flat') return true;
  if (slope === 'x') return track === Track.X;
  if (slope === 'y') return track === Track.Y;
  return false;
}

/**
 * Ukos (łuk przy narożniku) na zboczu – wolno, gdy leży poziomo: oba jego końce (środki boków przy
 * narożniku) są na tej samej wysokości, np. na płaskiej połówce kafelka z jednym podniesionym
 * narożnikiem (jak w TTD). Bez stromych zboczy.
 */
export function levelDiagonal(map: WorldMap, x: number, y: number, track: number): boolean {
  const [t, r, b, l] = cornerHeights(map, x, y);
  if (Math.max(t, r, b, l) - Math.min(t, r, b, l) > 1) return false;
  if (track === Track.Upper || track === Track.Lower) return l === r;
  if (track === Track.Left || track === Track.Right) return t === b;
  return false;
}

/** Przyczółek mostu, portal tunelu albo zjazd do metra: tor w osi, nie do ruszania osobno. */
function isBridgeHead(map: WorldMap, x: number, y: number): boolean {
  if (map.ramp[y * map.width + x]) return true;
  return isStructureEnd(map, map.bridge, x, y) || isStructureEnd(map, map.tunnel, x, y);
}

function isStructureEnd(map: WorldMap, layer: Uint16Array, x: number, y: number): boolean {
  const id = layer[y * map.width + x];
  if (!id) return false;
  const same = (dx: number, dy: number) => inBounds(map, x + dx, y + dy) && layer[(y + dy) * map.width + x + dx] === id;
  return !((same(1, 0) && same(-1, 0)) || (same(0, 1) && same(0, -1)));
}

function unique(pieces: readonly TrackPiece[]): TrackPiece[] {
  const seen = new Set<string>();
  return pieces.filter((p) => {
    const key = `${p.x},${p.y},${p.track}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
