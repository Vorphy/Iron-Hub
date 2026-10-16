import { CLEAR_ROUGH_COST, TRACK_COST, TRACK_REFUND_RATE } from '../config';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { getTerrain, inBounds, setTerrain, Terrain, type WorldMap } from '../world/map';
import { hasTrack, type TrackPiece } from './track';

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
    if (!buildable(map, piece.x, piece.y)) {
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
  state.money -= plan.cost;
  return { ok: true };
}

/** Rozbiórka: tylko istniejące elementy; zwraca część kosztu. */
export function planRemoveTrack(state: GameState, pieces: readonly TrackPiece[]): TrackPlan {
  const { map } = state;
  const out: TrackPlan['pieces'] = [];
  let count = 0;
  for (const piece of unique(pieces)) {
    const exists = inBounds(map, piece.x, piece.y) && hasTrack(map, piece.x, piece.y, piece.track);
    if (exists) count++;
    out.push({ piece, status: exists ? 'exists' : 'blocked' });
  }
  const result: CommandResult = count > 0 ? { ok: true } : { ok: false, reason: 'nothingToRemove' };
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
  state.money -= plan.cost;
  return { ok: true };
}

export function refund(): number {
  return Math.round(TRACK_COST * TRACK_REFUND_RATE);
}

function buildable(map: WorldMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && getTerrain(map, x, y) !== Terrain.Water;
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
