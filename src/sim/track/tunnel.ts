import type { CommandResult, SimEvent } from '../commands';
import { MAX_TUNNEL_LENGTH, TRACK_COST, TRACK_REFUND_RATE, TUNNEL_TILE_COST } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { cornerHeights, tileSlope } from '../world/height';
import { hasBuilding, inBounds, Terrain, type WorldMap } from '../world/map';
import { axisTrack, headSpanSide, sideHeight } from './bridge';
import { oppositeSide, Side as SideEnum, SIDE_DELTA, type Side } from './track';

/**
 * Tunel: prosty przekop pod wzniesieniem między dwoma wejściami (portalami) na zboczach.
 * Wnętrze leży na wysokości `level` (dolna krawędź portali); nad nim zostaje teren z tym, co na nim
 * stoi. Pociągi w tunelu jadą „torem tunelowym” – osobnym rodzajem elementu, niewidocznym.
 */
export interface Tunnel {
  id: number;
  /** Portal A – mniejsze x (oś x) albo y (oś y). */
  x: number;
  y: number;
  axis: 'x' | 'y';
  /** Liczba kafelków razem z portalami. */
  length: number;
  level: number;
}

export const TUNNEL_X = 256;
export const TUNNEL_Y = 512;

export function isTunnelTrack(track: number): boolean {
  return track === TUNNEL_X || track === TUNNEL_Y;
}

export function tunnelTrack(axis: 'x' | 'y'): number {
  return axis === 'x' ? TUNNEL_X : TUNNEL_Y;
}

export type TunnelRole = 'portalA' | 'portalB' | 'inside';

export function tunnelTileCoords(t: Pick<Tunnel, 'x' | 'y' | 'axis' | 'length'>): { x: number; y: number }[] {
  return Array.from({ length: t.length }, (_, i) => (t.axis === 'x' ? { x: t.x + i, y: t.y } : { x: t.x, y: t.y + i }));
}

export function tunnelAt(state: GameState, x: number, y: number): Tunnel | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.tunnel[y * state.map.width + x];
  return id ? state.tunnels.find((t) => t.id === id) : undefined;
}

export function tunnelRole(t: Tunnel, x: number, y: number): TunnelRole {
  const i = t.axis === 'x' ? x - t.x : y - t.y;
  return i === 0 ? 'portalA' : i === t.length - 1 ? 'portalB' : 'inside';
}

/** Bok portalu zwrócony do wnętrza tunelu. */
export function portalInnerSide(t: Pick<Tunnel, 'axis'>, role: 'portalA' | 'portalB'): Side {
  return headSpanSide(t, role === 'portalA' ? 'headA' : 'headB');
}

export function isPortal(state: GameState, x: number, y: number): boolean {
  const t = tunnelAt(state, x, y);
  return !!t && tunnelRole(t, x, y) !== 'inside';
}

export interface TunnelPlan {
  tunnel: Omit<Tunnel, 'id'> | null;
  cost: number;
  result: CommandResult;
}

type Reason = 'blocked' | 'tooBig' | 'noMoney' | 'tunnelNoExit';

function fail(reason: Reason, tunnel: TunnelPlan['tunnel'] = null, cost = 0): TunnelPlan {
  return { tunnel, cost, result: { ok: false, reason } };
}

/** Kafelek nadaje się na portal: ląd bez stacji/zajezdni/budynku/mostu/tunelu, tor tylko w osi. */
function portalFree(map: WorldMap, x: number, y: number, axis: 'x' | 'y'): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  if (map.terrain[i] === Terrain.Water || map.station[i] || map.depot[i] || hasBuilding(map, i)) return false;
  if (map.bridge[i] || map.tunnel[i] || map.ramp[i]) return false;
  const bits = map.track[i]!;
  return bits === 0 || bits === axisTrack(axis);
}

/**
 * Tunel od zbocza (x, y) w głąb wzniesienia: prosto, aż do kafelka zbocza na tej samej wysokości,
 * opadającego na zewnątrz po drugiej stronie. Nad wnętrzem musi być teren co najmniej poziom wyżej.
 */
export function planTunnel(state: GameState, x: number, y: number): TunnelPlan {
  const { map } = state;
  if (!inBounds(map, x, y)) return fail('blocked');
  const slope = tileSlope(map, x, y);
  if (slope !== 'x' && slope !== 'y') return fail('blocked');
  const axis = slope;
  if (!portalFree(map, x, y, axis)) return fail('blocked');
  const level = Math.min(...cornerHeights(map, x, y));
  // Kierunek w głąb: bok portalu, który jest wyżej.
  const sides: [Side, Side] = axis === 'x' ? [SideEnum.NW, SideEnum.SE] : [SideEnum.NE, SideEnum.SW];
  const inward = sideHeight(map, x, y, sides[1]) > sideHeight(map, x, y, sides[0]) ? sides[1] : sides[0];
  const [dx, dy] = SIDE_DELTA[inward];
  const back = oppositeSide(inward);

  for (let k = 1; k < MAX_TUNNEL_LENGTH; k++) {
    const tx = x + dx * k;
    const ty = y + dy * k;
    if (!inBounds(map, tx, ty)) return fail('tunnelNoExit');
    const i = ty * map.width + tx;
    if (map.tunnel[i]) return fail('blocked');
    const exitSlope = tileSlope(map, tx, ty);
    // Wyjście: zbocze w tej samej osi, dolna krawędź na poziomie tunelu, wyżej od strony wnętrza.
    if (exitSlope === axis && Math.min(...cornerHeights(map, tx, ty)) === level && sideHeight(map, tx, ty, back) === level + 1) {
      if (!portalFree(map, tx, ty, axis)) return fail('blocked');
      const tunnel = {
        x: Math.min(x, tx),
        y: Math.min(y, ty),
        axis,
        length: k + 1,
        level,
      };
      const portals = [i, y * map.width + x].filter((p) => !map.track[p]).length;
      const cost = tunnel.length * TUNNEL_TILE_COST + portals * TRACK_COST;
      if (cost > state.money) return fail('noMoney', tunnel, cost);
      return { tunnel, cost, result: { ok: true } };
    }
    // Wnętrze: nad tunelem teren co najmniej poziom wyżej.
    if (Math.min(...cornerHeights(map, tx, ty)) < level + 1) return fail('tunnelNoExit');
  }
  return fail('tooBig');
}

export function buildTunnel(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const plan = planTunnel(state, x, y);
  if (!plan.result.ok || !plan.tunnel) return plan.result;
  const { map } = state;
  const tunnel: Tunnel = { id: state.nextTunnelId++, ...plan.tunnel };
  const tiles = tunnelTileCoords(tunnel);
  for (const [k, t] of tiles.entries()) {
    const i = t.y * map.width + t.x;
    map.tunnel[i] = tunnel.id;
    if (k === 0 || k === tiles.length - 1) {
      map.track[i]! |= axisTrack(tunnel.axis);
      events.push({ type: 'tileChanged', x: t.x, y: t.y });
    }
  }
  state.tunnels.push(tunnel);
  spend(state, 'construction', plan.cost);
  events.push({ type: 'tunnelsChanged' });
  return { ok: true };
}

export function removeTunnel(state: GameState, tunnel: Tunnel, events: SimEvent[]): CommandResult {
  const { map } = state;
  const tiles = tunnelTileCoords(tunnel);
  for (const [k, t] of tiles.entries()) {
    const i = t.y * map.width + t.x;
    map.tunnel[i] = 0;
    if (k === 0 || k === tiles.length - 1) {
      map.track[i]! &= ~axisTrack(tunnel.axis);
      events.push({ type: 'tileChanged', x: t.x, y: t.y });
    }
  }
  state.tunnels = state.tunnels.filter((t) => t !== tunnel);
  spend(state, 'construction', -Math.round(tunnel.length * TUNNEL_TILE_COST * TRACK_REFUND_RATE));
  events.push({ type: 'tunnelsChanged' });
  return { ok: true };
}
