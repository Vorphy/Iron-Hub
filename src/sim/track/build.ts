import { spend } from '../economy/finance';
import { CLEAR_ROUGH_COST, FOUNDATION_COST, TRACK_COST, TRACK_REFUND_RATE } from '../config';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { getTerrain, hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from '../world/map';
import { occupiedTiles } from '../trains/train';
import { cornerHeights } from '../world/height';
import { Foundation, railFoundation } from './foundation';
import { hasTrack, Track, type TrackPiece, tracksOn } from './track';

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
  // Nowe elementy po kafelkach – zbocze sprawdzamy dla wszystkich torów kafelka razem.
  const added = new Map<number, number>();
  for (const piece of unique(pieces)) {
    let status: PieceStatus;
    if (!buildable(map, piece)) status = 'blocked';
    else if (hasTrack(map, piece.x, piece.y, piece.track)) status = 'exists';
    else {
      status = 'new';
      const i = piece.y * map.width + piece.x;
      added.set(i, (added.get(i) ?? 0) | piece.track);
    }
    out.push({ piece, status });
  }
  let cost = 0;
  for (const [i, bits] of added) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const corners = cornerHeights(map, x, y);
    const after = railFoundation(corners, map.track[i]! | bits);
    // Przejazd przez drogę tylko na terenie, bez fundamentu.
    if (after === null || (map.road[i] && after !== Foundation.None)) {
      for (const p of out) if (p.status === 'new' && p.piece.y * map.width + p.piece.x === i) p.status = 'blocked';
      continue;
    }
    cost += tracksOn(bits).length * TRACK_COST;
    if (after !== railFoundation(corners, map.track[i]!)) cost += FOUNDATION_COST;
    if (getTerrain(map, x, y) === Terrain.Rough) cost += CLEAR_ROUGH_COST;
  }
  const blocked = out.some((p) => p.status === 'blocked');
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
  return true;
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
