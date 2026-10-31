import type { CommandResult, SimEvent } from '../commands';
import { CATENARY_COST, CATENARY_REFUND } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { engineDef } from '../trains/vehicles';
import { inBounds, type WorldMap } from '../world/map';
import { bridgeAt, bridgeTileCoords } from './bridge';
import { isUnderTrack } from './metro';
import { isMetroTunnelTrack, metroTunnelAt } from './metroTunnel';
import { tunnelAt, tunnelTileCoords } from './tunnel';

/**
 * Sieć trakcyjna: cały kafelek z torem (także peron, zajezdnia, most, tunel) jest zelektryfikowany
 * albo nie. Lokomotywy elektryczne jeżdżą tylko po takich kafelkach. Metro (poziom −1) ma osobną
 * warstwę `electricUnder` – trzecią szynę, kładzioną tym samym narzędziem w widoku metra.
 */

/** Kafelek ma coś, po czym jeździ pociąg. */
export function hasRail(map: WorldMap, i: number): boolean {
  return !!(map.track[i] || map.station[i] || map.depot[i] || map.bridge[i] || map.tunnel[i]);
}

/** Kafelek ma tor metra, peron metra albo przejście pod torem metra. */
export function hasRailUnder(map: WorldMap, i: number): boolean {
  return !!(map.under[i] || map.stationUnder[i] || map.underTunnel[i]);
}

export function isElectrified(map: WorldMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.electric[y * map.width + x] === 1;
}

/** Odcinek trasy pod ziemią (metro albo przejście pod nim) – zasilany z trzeciej szyny. */
export function isUnderStep(s: { track: number }): boolean {
  return isUnderTrack(s.track) || isMetroTunnelTrack(s.track);
}

/** Lokomotywa elektryczna może wjechać na odcinek: sieć nad torem albo trzecia szyna w metrze. */
export function stepPowered(map: WorldMap, s: { x: number; y: number; track: number }): boolean {
  if (!inBounds(map, s.x, s.y)) return false;
  const i = s.y * map.width + s.x;
  return (isUnderStep(s) ? map.electricUnder[i] : map.electric[i]) === 1;
}

function layerOf(map: WorldMap, under: boolean): Uint8Array {
  return under ? map.electricUnder : map.electric;
}

/** Czy lokomotywa danego pociągu potrzebuje sieci trakcyjnej. */
export function needsCatenary(engine: string): boolean {
  return engineDef(engine)?.traction === 'electric';
}

export interface CatenaryPlan {
  /** Kafelki, które się zmienią (indeksy). */
  tiles: number[];
  cost: number;
  result: CommandResult;
}

/**
 * Kafelki do elektryfikacji / rozbiórki sieci. Most i tunel (także przejście pod torem metra) zawsze
 * w całości – wskazanie jednego kafelka obejmuje resztę.
 */
function targetTiles(state: GameState, coords: readonly { x: number; y: number }[], under: boolean): number[] {
  const { map } = state;
  const out = new Set<number>();
  for (const { x, y } of coords) {
    if (!inBounds(map, x, y)) continue;
    const i = y * map.width + x;
    if (!(under ? hasRailUnder(map, i) : hasRail(map, i))) continue;
    out.add(i);
    const bridge = !under && map.bridge[i] ? bridgeAt(state, x, y) : undefined;
    const tunnel = under ? metroTunnelAt(state, x, y) : map.tunnel[i] ? tunnelAt(state, x, y) : undefined;
    for (const t of [...(bridge ? bridgeTileCoords(bridge) : []), ...(tunnel ? tunnelTileCoords(tunnel) : [])]) {
      if (inBounds(map, t.x, t.y)) out.add(t.y * map.width + t.x);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Kafelki zajęte przez pociągi elektryczne (na danym poziomie) – tam nie wolno zdjąć sieci. */
function electricTrainTiles(state: GameState, under: boolean): Set<number> {
  const out = new Set<number>();
  for (const t of state.trains) {
    if (!needsCatenary(t.engine)) continue;
    for (const s of [...t.trail, ...t.reservedAhead]) if (isUnderStep(s) === under) out.add(s.y * state.map.width + s.x);
    if (!under && t.status === 'depot') {
      const d = state.depots.find((dep) => dep.id === t.depotId);
      if (d) out.add(d.y * state.map.width + d.x);
    }
  }
  return out;
}

export function planCatenary(
  state: GameState,
  coords: readonly { x: number; y: number }[],
  remove: boolean,
  under = false,
): CatenaryPlan {
  const layer = layerOf(state.map, under);
  const all = targetTiles(state, coords, under);
  if (all.length === 0) return { tiles: [], cost: 0, result: { ok: false, reason: 'noTrack' } };
  const tiles = all.filter((i) => (layer[i] === 1) === remove);
  if (tiles.length === 0) return { tiles, cost: 0, result: { ok: false, reason: remove ? 'nothingToRemove' : 'alreadyBuilt' } };
  if (remove) {
    const busy = electricTrainTiles(state, under);
    if (tiles.some((i) => busy.has(i))) return { tiles, cost: 0, result: { ok: false, reason: 'trainInWay' } };
    return { tiles, cost: -tiles.length * CATENARY_REFUND, result: { ok: true } };
  }
  const cost = tiles.length * CATENARY_COST;
  return { tiles, cost, result: cost > state.money ? { ok: false, reason: 'noMoney' } : { ok: true } };
}

export function buildCatenary(
  state: GameState,
  coords: readonly { x: number; y: number }[],
  remove: boolean,
  events: SimEvent[],
  under = false,
): CommandResult {
  const plan = planCatenary(state, coords, remove, under);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  const layer = layerOf(map, under);
  for (const i of plan.tiles) {
    layer[i] = remove ? 0 : 1;
    if (!under) events.push({ type: 'tileChanged', x: i % map.width, y: Math.floor(i / map.width) });
  }
  if (under) events.push({ type: 'undergroundChanged' });
  spend(state, 'construction', plan.cost);
  return { ok: true };
}

/** Po rozbiórce: sieć bez toru pod spodem znika (bez zwrotu – rozebrano ją razem z torem). */
export function dropOrphanCatenary(state: GameState, events: SimEvent[]): void {
  const { map } = state;
  let changedUnder = false;
  for (let i = 0; i < map.electric.length; i++) {
    if (map.electric[i] && !hasRail(map, i)) {
      map.electric[i] = 0;
      events.push({ type: 'tileChanged', x: i % map.width, y: Math.floor(i / map.width) });
    }
    if (map.electricUnder[i] && !hasRailUnder(map, i)) {
      map.electricUnder[i] = 0;
      changedUnder = true;
    }
  }
  if (changedUnder) events.push({ type: 'undergroundChanged' });
}

/** Liczba zelektryfikowanych kafelków – sieć i trzecia szyna w metrze (utrzymanie). */
export function catenaryTiles(map: WorldMap): number {
  let n = 0;
  for (let i = 0; i < map.electric.length; i++) n += map.electric[i]! + map.electricUnder[i]!;
  return n;
}
