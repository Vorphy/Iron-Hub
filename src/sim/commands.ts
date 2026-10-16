import { CLEAR_ROUGH_COST } from './config';
import type { GameState } from './state';
import { buildStation, removeStationTile, type StationAxis } from './station/station';
import { buildTrack, removeTrack } from './track/build';
import { getTrackBits, tracksOn, type TrackPiece } from './track/track';
import { getTerrain, inBounds, setTerrain, Terrain } from './world/map';

/** Jedyny sposób zmiany stanu gry z zewnątrz. */
export type Command =
  | { type: 'clearTile'; x: number; y: number }
  | { type: 'buildTrack'; pieces: TrackPiece[] }
  | { type: 'removeTrack'; pieces: TrackPiece[] }
  | { type: 'buildStation'; x0: number; y0: number; x1: number; y1: number; axis: StationAxis };

export type FailReason = 'outOfBounds' | 'nothingToClear' | 'noMoney' | 'blocked' | 'nothingToRemove' | 'tooBig';

export type CommandResult = { ok: true } | { ok: false; reason: FailReason };

/** Zdarzenia dla warstwy prezentacji (renderer, UI). Nie wpływają na symulację. */
export type SimEvent =
  | { type: 'tileChanged'; x: number; y: number }
  | { type: 'stationsChanged' }
  | { type: 'commandFailed'; command: Command; reason: FailReason };

export function applyCommand(state: GameState, cmd: Command, events: SimEvent[]): CommandResult {
  switch (cmd.type) {
    case 'clearTile':
      return clearTile(state, cmd.x, cmd.y, events);
    case 'buildTrack':
      return buildTrack(state, cmd.pieces, events);
    case 'removeTrack':
      return removeTrack(state, cmd.pieces, events);
    case 'buildStation':
      return buildStation(state, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.axis, events);
  }
}

/** Buldożer na pojedynczym kafelku: stacja, potem tory, potem nieużytek. */
function clearTile(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const { map } = state;
  if (!inBounds(map, x, y)) return { ok: false, reason: 'outOfBounds' };
  if (map.station[y * map.width + x]) return removeStationTile(state, x, y, events);
  const bits = getTrackBits(map, x, y);
  if (bits) return removeTrack(state, tracksOn(bits).map((track) => ({ x, y, track })), events);
  if (getTerrain(map, x, y) !== Terrain.Rough) return { ok: false, reason: 'nothingToClear' };
  if (state.money < CLEAR_ROUGH_COST) return { ok: false, reason: 'noMoney' };
  state.money -= CLEAR_ROUGH_COST;
  setTerrain(map, x, y, Terrain.Grass);
  events.push({ type: 'tileChanged', x, y });
  return { ok: true };
}
