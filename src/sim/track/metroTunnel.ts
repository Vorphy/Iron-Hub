import type { CommandResult, SimEvent } from '../commands';
import { MAX_TUNNEL_LENGTH, METRO_TRACK_COST, METRO_TUNNEL_TILE_COST, TRACK_REFUND_RATE } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { inBounds, type WorldMap } from '../world/map';
import { axisTrack } from './bridge';
import { METRO_LEVEL, underTrack } from './metro';
import { type Tunnel, type TunnelPlan, tunnelTileCoords } from './tunnel';

/**
 * Przejście pod torem metra: krótki tunel poziom głębiej niż metro, między dwoma portalami na torze
 * metra. Nad wnętrzem mogą biec dowolne tory metra (inna linia) – bez połączenia z tunelem, więc linie
 * krzyżują się bezkolizyjnie. Trzymany na liście `state.tunnels` z `under: true`, na mapie w `underTunnel`.
 *
 * W trasie pociągu wnętrze to osobne kody elementu (nie mylą się z metrem ani tunelem na powierzchni).
 *
 * Tor metra w osi przejścia na kafelkach wnętrza znika (zastępuje go przejście) – tak płaskie
 * skrzyżowanie zamienia się w bezkolizyjne jednym przeciągnięciem wzdłuż linii.
 */
export const METRO_TUNNEL_X = 1 << 16;
export const METRO_TUNNEL_Y = 1 << 17;

export function isMetroTunnelTrack(track: number): boolean {
  return track === METRO_TUNNEL_X || track === METRO_TUNNEL_Y;
}

export function metroTunnelTrack(axis: 'x' | 'y'): number {
  return axis === 'x' ? METRO_TUNNEL_X : METRO_TUNNEL_Y;
}

export function metroTunnelAt(state: GameState, x: number, y: number): Tunnel | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.underTunnel[y * state.map.width + x];
  return id ? state.tunnels.find((t) => t.id === id) : undefined;
}

/** Portal: wolny kafelek metra albo z prostym torem metra w osi (bez peronu, zjazdu i innego przejścia). */
function portalFree(map: WorldMap, x: number, y: number, axis: 'x' | 'y'): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  if (map.underTunnel[i] || map.stationUnder[i] || map.ramp[i]) return false;
  const bits = map.under[i]!;
  return bits === 0 || bits === axisTrack(axis);
}

function fail(
  reason: 'blocked' | 'tooBig' | 'noMoney' | 'trainInWay',
  tunnel: TunnelPlan['tunnel'] = null,
  cost = 0,
): TunnelPlan {
  return { tunnel, cost, result: { ok: false, reason } };
}

/** Przejście z (x0, y0) do (x1, y1) – prosto w jednej osi, portale na obu końcach, w środku co najmniej kafelek. */
export function planMetroTunnel(state: GameState, x0: number, y0: number, x1: number, y1: number): TunnelPlan {
  const { map } = state;
  if (x0 !== x1 && y0 !== y1) return fail('blocked');
  const axis = y0 === y1 ? 'x' : 'y';
  const length = Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1;
  if (length < 3) return fail('blocked');
  if (length > MAX_TUNNEL_LENGTH) return fail('tooBig');
  const tunnel = { x: Math.min(x0, x1), y: Math.min(y0, y1), axis, length, level: METRO_LEVEL - 1, under: true } as const;
  const tiles = tunnelTileCoords(tunnel);
  const ends = [tiles[0]!, tiles[tiles.length - 1]!];
  if (!ends.every((t) => portalFree(map, t.x, t.y, axis))) return fail('blocked');
  if (tiles.some((t) => !inBounds(map, t.x, t.y) || map.underTunnel[t.y * map.width + t.x])) return fail('blocked');
  // Pociąg na torze metra w osi, który przejście zastąpi.
  const replaced = new Set(tiles.slice(1, -1).map((t) => `${t.x},${t.y}`));
  const axisCode = underTrack(axisTrack(axis));
  if (
    state.trains.some((t) => [...t.trail, ...t.reservedAhead].some((s) => s.track === axisCode && replaced.has(`${s.x},${s.y}`)))
  ) {
    return fail('trainInWay', tunnel);
  }
  const newPortals = ends.filter((t) => !map.under[t.y * map.width + t.x]).length;
  const cost = length * METRO_TUNNEL_TILE_COST + newPortals * METRO_TRACK_COST;
  if (cost > state.money) return fail('noMoney', tunnel, cost);
  return { tunnel, cost, result: { ok: true } };
}

export function buildMetroTunnel(
  state: GameState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  events: SimEvent[],
): CommandResult {
  const plan = planMetroTunnel(state, x0, y0, x1, y1);
  if (!plan.result.ok || !plan.tunnel) return plan.result;
  const { map } = state;
  const tunnel: Tunnel = { id: state.nextTunnelId++, ...plan.tunnel };
  const tiles = tunnelTileCoords(tunnel);
  for (const [k, t] of tiles.entries()) {
    const i = t.y * map.width + t.x;
    map.underTunnel[i] = tunnel.id;
    if (k === 0 || k === tiles.length - 1) map.under[i]! |= axisTrack(tunnel.axis);
    else map.under[i]! &= ~axisTrack(tunnel.axis);
  }
  state.tunnels.push(tunnel);
  spend(state, 'construction', plan.cost);
  events.push({ type: 'undergroundChanged' });
  return { ok: true };
}

export function metroTunnelRefund(tunnel: Tunnel): number {
  return Math.round(tunnel.length * METRO_TUNNEL_TILE_COST * TRACK_REFUND_RATE);
}

/** Pociąg w przejściu albo na torze metra jego portalu (pociągi nad wnętrzem i na powierzchni nie przeszkadzają). */
export function metroTunnelBusy(state: GameState, tunnel: Tunnel): boolean {
  const tiles = tunnelTileCoords(tunnel);
  const ends = [tiles[0]!, tiles[tiles.length - 1]!];
  const axis = underTrack(axisTrack(tunnel.axis));
  return state.trains.some((t) =>
    [...t.trail, ...t.reservedAhead].some(
      (s) =>
        (isMetroTunnelTrack(s.track) && tiles.some((p) => p.x === s.x && p.y === s.y)) ||
        (s.track === axis && ends.some((p) => p.x === s.x && p.y === s.y)),
    ),
  );
}

/** Rozbiórka przejścia razem z torami portali. */
export function removeMetroTunnel(state: GameState, tunnel: Tunnel, events: SimEvent[]): CommandResult {
  const { map } = state;
  const tiles = tunnelTileCoords(tunnel);
  for (const [k, t] of tiles.entries()) {
    const i = t.y * map.width + t.x;
    map.underTunnel[i] = 0;
    if (k === 0 || k === tiles.length - 1) map.under[i]! &= ~axisTrack(tunnel.axis);
  }
  state.tunnels = state.tunnels.filter((t) => t !== tunnel);
  spend(state, 'construction', -metroTunnelRefund(tunnel));
  events.push({ type: 'undergroundChanged' });
  return { ok: true };
}
