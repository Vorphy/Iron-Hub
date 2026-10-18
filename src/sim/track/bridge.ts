import type { CommandResult, SimEvent } from '../commands';
import { BRIDGE_TILE_COST, MAX_BRIDGE_LENGTH, TRACK_COST, TRACK_REFUND_RATE } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { cornerHeights, tileSlope } from '../world/height';
import { hasBuilding, inBounds, Terrain, type WorldMap } from '../world/map';
import { Side, Track } from './track';

/**
 * Most: prosty odcinek wzdłuż osi między dwoma przyczółkami. Pomost leży na wysokości `deck`
 * (jeden poziom nad przyczółkami), więc pod nim mogą biec inne tory albo woda.
 *
 * Na przyczółku leży zwykły tor w osi mostu (rampa – rysowana i liczona osobno), nad kafelkami
 * pośrodku pociągi jadą po „torze mostowym” – osobnym rodzaju elementu, który nie koliduje
 * z torami pod spodem.
 */
export interface Bridge {
  id: number;
  /** Przyczółek A – mniejsze x (oś x) albo y (oś y). */
  x: number;
  y: number;
  axis: 'x' | 'y';
  /** Liczba kafelków razem z przyczółkami. */
  length: number;
  /** Wysokość pomostu (poziomy terenu). */
  deck: number;
}

/** Elementy toru na pomoście (poza bitami `map.track` – tylko w odcinkach jazdy pociągów). */
export const BRIDGE_X = 64;
export const BRIDGE_Y = 128;

export function isBridgeTrack(track: number): boolean {
  return track === BRIDGE_X || track === BRIDGE_Y;
}

export function axisTrack(axis: 'x' | 'y'): Track {
  return axis === 'x' ? Track.X : Track.Y;
}

export function bridgeTrack(axis: 'x' | 'y'): number {
  return axis === 'x' ? BRIDGE_X : BRIDGE_Y;
}

export type BridgeRole = 'headA' | 'headB' | 'span';

export function bridgeTileCoords(b: Pick<Bridge, 'x' | 'y' | 'axis' | 'length'>): { x: number; y: number }[] {
  return Array.from({ length: b.length }, (_, i) => (b.axis === 'x' ? { x: b.x + i, y: b.y } : { x: b.x, y: b.y + i }));
}

export function bridgeAt(state: GameState, x: number, y: number): Bridge | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.bridge[y * state.map.width + x];
  return id ? state.bridges.find((b) => b.id === id) : undefined;
}

export function bridgeRole(b: Bridge, x: number, y: number): BridgeRole {
  const i = b.axis === 'x' ? x - b.x : y - b.y;
  return i === 0 ? 'headA' : i === b.length - 1 ? 'headB' : 'span';
}

/** Bok przyczółka zwrócony w stronę pomostu. */
export function headSpanSide(b: Pick<Bridge, 'axis'>, role: 'headA' | 'headB'): Side {
  if (b.axis === 'x') return role === 'headA' ? Side.SE : Side.NW;
  return role === 'headA' ? Side.SW : Side.NE;
}

/** Średnia wysokość boku kafelka (środek krawędzi). */
export function sideHeight(map: WorldMap, x: number, y: number, side: Side): number {
  const [t, r, b, l] = cornerHeights(map, x, y);
  switch (side) {
    case Side.NE:
      return (t + r) / 2;
    case Side.SE:
      return (r + b) / 2;
    case Side.SW:
      return (b + l) / 2;
    case Side.NW:
      return (l + t) / 2;
  }
}

export interface BridgePlan {
  bridge: Omit<Bridge, 'id'> | null;
  cost: number;
  result: CommandResult;
}

function fail(reason: 'blocked' | 'tooBig' | 'bridgeHeads' | 'bridgeLow' | 'noMoney', bridge: BridgePlan['bridge'] = null, cost = 0): BridgePlan {
  return { bridge, cost, result: { ok: false, reason } };
}

/**
 * Przyczółek: ląd, bez stacji/zajezdni/budynku/innego mostu, płaski albo pochylony w górę w stronę
 * mostu; tor na nim tylko w osi mostu. Zwraca wysokość pomostu (null – nie nadaje się).
 */
function headDeck(map: WorldMap, x: number, y: number, axis: 'x' | 'y', spanSide: Side): number | null {
  if (!inBounds(map, x, y)) return null;
  const i = y * map.width + x;
  if (map.terrain[i] === Terrain.Water || map.station[i] || map.depot[i] || hasBuilding(map, i) || map.bridge[i] || map.tunnel[i]) {
    return null;
  }
  const bits = map.track[i]!;
  if (bits !== 0 && bits !== axisTrack(axis)) return null;
  const slope = tileSlope(map, x, y);
  const base = Math.min(...cornerHeights(map, x, y));
  if (slope === 'flat') return base + 1;
  // Zbocze w osi mostu, wyżej od strony pomostu.
  if (slope === axis && sideHeight(map, x, y, spanSide) === base + 1) return base + 1;
  return null;
}

export function planBridge(state: GameState, x0: number, y0: number, x1: number, y1: number): BridgePlan {
  const { map } = state;
  if (x0 !== x1 && y0 !== y1) return fail('blocked');
  const axis: 'x' | 'y' = x0 !== x1 ? 'x' : 'y';
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const length = Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1;
  const bridge = { x, y, axis, length, deck: 0 };
  if (length < 3) return fail('blocked');
  if (length > MAX_BRIDGE_LENGTH) return fail('tooBig');

  const tiles = bridgeTileCoords(bridge);
  const a = tiles[0]!;
  const b = tiles[tiles.length - 1]!;
  const deckA = headDeck(map, a.x, a.y, axis, headSpanSide(bridge, 'headA'));
  const deckB = headDeck(map, b.x, b.y, axis, headSpanSide(bridge, 'headB'));
  if (deckA === null || deckB === null) return fail('blocked');
  if (deckA !== deckB) return fail('bridgeHeads');
  bridge.deck = deckA;

  for (const t of tiles.slice(1, -1)) {
    if (!inBounds(map, t.x, t.y)) return fail('blocked');
    const i = t.y * map.width + t.x;
    if (map.station[i] || map.depot[i] || hasBuilding(map, i) || map.bridge[i]) return fail('blocked', bridge);
    if (Math.max(...cornerHeights(map, t.x, t.y)) > bridge.deck - 1) return fail('bridgeLow', bridge);
  }
  const headTracks = [a, b].filter((t) => !map.track[t.y * map.width + t.x]).length;
  const cost = length * BRIDGE_TILE_COST + headTracks * TRACK_COST;
  if (cost > state.money) return fail('noMoney', bridge, cost);
  return { bridge, cost, result: { ok: true } };
}

export function buildBridge(state: GameState, x0: number, y0: number, x1: number, y1: number, events: SimEvent[]): CommandResult {
  const plan = planBridge(state, x0, y0, x1, y1);
  if (!plan.result.ok || !plan.bridge) return plan.result;
  const { map } = state;
  const id = state.nextBridgeId++;
  const bridge: Bridge = { id, ...plan.bridge };
  const tiles = bridgeTileCoords(bridge);
  for (const [k, t] of tiles.entries()) {
    const i = t.y * map.width + t.x;
    map.bridge[i] = id;
    if (k === 0 || k === tiles.length - 1) map.track[i]! |= axisTrack(bridge.axis);
    events.push({ type: 'tileChanged', x: t.x, y: t.y });
  }
  state.bridges.push(bridge);
  spend(state, 'construction', plan.cost);
  events.push({ type: 'bridgesChanged' });
  return { ok: true };
}

/** Rozbiórka mostu razem z torem na przyczółkach. */
export function removeBridge(state: GameState, bridge: Bridge, events: SimEvent[]): CommandResult {
  const { map } = state;
  const tiles = bridgeTileCoords(bridge);
  for (const [k, t] of tiles.entries()) {
    const i = t.y * map.width + t.x;
    map.bridge[i] = 0;
    if (k === 0 || k === tiles.length - 1) map.track[i]! &= ~axisTrack(bridge.axis);
    events.push({ type: 'tileChanged', x: t.x, y: t.y });
  }
  state.bridges = state.bridges.filter((b) => b !== bridge);
  spend(state, 'construction', -Math.round(bridge.length * BRIDGE_TILE_COST * TRACK_REFUND_RATE));
  events.push({ type: 'bridgesChanged' });
  return { ok: true };
}
