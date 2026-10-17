import { CLEAR_ROUGH_COST, HOUSE_DEMOLISH_COST } from './config';
import { spend } from './economy/finance';
import { buildDepot, depotAt, removeDepot } from './depot/depot';
import { dropOrphanSignals, placeSignal, removeSignal, type SignalMode } from './signals/signals';
import type { GameState } from './state';
import { buildStation, removeStationTile, type StationAxis } from './station/station';
import { buildTrack, removeTrack } from './track/build';
import { getTrackBits, tracksOn, type Side, type Track, type TrackPiece } from './track/track';
import {
  buyTrain,
  occupiedTiles,
  sellTrain,
  sendToDepot,
  setOrders,
  startTrain,
  stopTrain,
  trainsInDepot,
} from './trains/train';
import { getTerrain, inBounds, setTerrain, Terrain } from './world/map';

/** Jedyny sposób zmiany stanu gry z zewnątrz. */
export type Command =
  | { type: 'clearTile'; x: number; y: number }
  | { type: 'buildTrack'; pieces: TrackPiece[] }
  | { type: 'removeTrack'; pieces: TrackPiece[] }
  | { type: 'buildStation'; x0: number; y0: number; x1: number; y1: number; axis: StationAxis }
  | { type: 'buildDepot'; x: number; y: number; side: Side }
  | { type: 'buyTrain'; depotId: number; engine: string; wagons: string[] }
  | { type: 'sellTrain'; trainId: number }
  | { type: 'startTrain'; trainId: number }
  | { type: 'stopTrain'; trainId: number }
  | { type: 'sendToDepot'; trainId: number }
  | { type: 'setOrders'; trainId: number; orders: number[] }
  | { type: 'placeSignal'; x: number; y: number; track: Track; oneWay: boolean }
  | { type: 'removeSignal'; x: number; y: number; track: Track }
  | { type: 'setSignalMode'; mode: SignalMode };

export type FailReason =
  | 'outOfBounds'
  | 'nothingToClear'
  | 'noMoney'
  | 'blocked'
  | 'nothingToRemove'
  | 'tooBig'
  | 'depotNotEmpty'
  | 'notInDepot'
  | 'depotNotConnected'
  | 'trainInWay'
  | 'industry';

export type CommandResult = { ok: true } | { ok: false; reason: FailReason };

/** Zdarzenia dla warstwy prezentacji (renderer, UI). Nie wpływają na symulację. */
export type SimEvent =
  | { type: 'tileChanged'; x: number; y: number }
  | { type: 'stationsChanged' }
  | { type: 'trainsChanged' }
  | { type: 'signalsChanged' }
  /** Zapłata za dostawę – (x, y) w układzie logicznym, do napisu nad pociągiem. */
  | { type: 'income'; amount: number; x: number; y: number }
  | { type: 'commandFailed'; command: Command; reason: FailReason };

export function applyCommand(state: GameState, cmd: Command, events: SimEvent[]): CommandResult {
  const result = apply(state, cmd, events);
  // Rozbiórka toru lub stacji mogła zostawić semafory bez toru.
  if (result.ok && (cmd.type === 'removeTrack' || cmd.type === 'clearTile' || cmd.type === 'buildStation')) {
    dropOrphanSignals(state, events);
  }
  return result;
}

function apply(state: GameState, cmd: Command, events: SimEvent[]): CommandResult {
  switch (cmd.type) {
    case 'clearTile':
      return clearTile(state, cmd.x, cmd.y, events);
    case 'buildTrack':
      return buildTrack(state, cmd.pieces, events);
    case 'removeTrack':
      return removeTrack(state, cmd.pieces, events);
    case 'buildStation':
      return buildStation(state, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.axis, events);
    case 'buildDepot':
      return buildDepot(state, cmd.x, cmd.y, cmd.side, events);
    case 'buyTrain':
      return buyTrain(state, cmd.depotId, cmd.engine, cmd.wagons, events);
    case 'sellTrain':
      return sellTrain(state, cmd.trainId, events);
    case 'startTrain':
      return startTrain(state, cmd.trainId);
    case 'stopTrain':
      return stopTrain(state, cmd.trainId);
    case 'sendToDepot':
      return sendToDepot(state, cmd.trainId);
    case 'setOrders':
      return setOrders(state, cmd.trainId, cmd.orders);
    case 'placeSignal':
      return placeSignal(state, cmd.x, cmd.y, cmd.track, cmd.oneWay, events);
    case 'removeSignal':
      return removeSignal(state, cmd.x, cmd.y, cmd.track, events);
    case 'setSignalMode':
      state.signalMode = cmd.mode;
      events.push({ type: 'signalsChanged' });
      return { ok: true };
  }
}

/** Buldożer na pojedynczym kafelku: zajezdnia lub stacja, potem tory, potem nieużytek. */
function clearTile(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const { map } = state;
  if (!inBounds(map, x, y)) return { ok: false, reason: 'outOfBounds' };
  if (occupiedTiles(state).has(y * map.width + x)) return { ok: false, reason: 'trainInWay' };
  if (map.station[y * map.width + x]) return removeStationTile(state, x, y, events);
  const i = y * map.width + x;
  if (map.industry[i]) return { ok: false, reason: 'industry' };
  if (map.house[i]) {
    if (state.money < HOUSE_DEMOLISH_COST) return { ok: false, reason: 'noMoney' };
    spend(state, 'construction', HOUSE_DEMOLISH_COST);
    map.house[i] = 0;
    map.town[i] = 0;
    events.push({ type: 'tileChanged', x, y });
    return { ok: true };
  }
  const depot = depotAt(state, x, y);
  if (depot) {
    if (trainsInDepot(state, depot.id).length) return { ok: false, reason: 'depotNotEmpty' };
    return removeDepot(state, depot, events);
  }
  const bits = getTrackBits(map, x, y);
  if (bits) return removeTrack(state, tracksOn(bits).map((track) => ({ x, y, track })), events);
  if (getTerrain(map, x, y) !== Terrain.Rough) return { ok: false, reason: 'nothingToClear' };
  if (state.money < CLEAR_ROUGH_COST) return { ok: false, reason: 'noMoney' };
  spend(state, 'construction', CLEAR_ROUGH_COST);
  setTerrain(map, x, y, Terrain.Grass);
  events.push({ type: 'tileChanged', x, y });
  return { ok: true };
}
