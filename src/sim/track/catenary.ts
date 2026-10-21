import type { CommandResult, SimEvent } from '../commands';
import { CATENARY_COST, CATENARY_REFUND } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { engineDef } from '../trains/vehicles';
import { inBounds, type WorldMap } from '../world/map';
import { bridgeAt, bridgeTileCoords } from './bridge';
import { tunnelAt, tunnelTileCoords } from './tunnel';

/**
 * Sieć trakcyjna: cały kafelek z torem (także peron, zajezdnia, most, tunel) jest zelektryfikowany
 * albo nie. Lokomotywy elektryczne jeżdżą tylko po takich kafelkach.
 */

/** Kafelek ma coś, po czym jeździ pociąg. */
export function hasRail(map: WorldMap, i: number): boolean {
  return !!(map.track[i] || map.station[i] || map.depot[i] || map.bridge[i] || map.tunnel[i]);
}

export function isElectrified(map: WorldMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.electric[y * map.width + x] === 1;
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
 * Kafelki do elektryfikacji / rozbiórki sieci. Most i tunel zawsze w całości (wskazanie jednego
 * kafelka obejmuje resztę).
 */
function targetTiles(state: GameState, coords: readonly { x: number; y: number }[]): number[] {
  const { map } = state;
  const out = new Set<number>();
  for (const { x, y } of coords) {
    if (!inBounds(map, x, y)) continue;
    const i = y * map.width + x;
    if (!hasRail(map, i)) continue;
    out.add(i);
    const bridge = map.bridge[i] ? bridgeAt(state, x, y) : undefined;
    const tunnel = map.tunnel[i] ? tunnelAt(state, x, y) : undefined;
    for (const t of [...(bridge ? bridgeTileCoords(bridge) : []), ...(tunnel ? tunnelTileCoords(tunnel) : [])]) {
      if (inBounds(map, t.x, t.y)) out.add(t.y * map.width + t.x);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Kafelki zajęte przez pociągi elektryczne – tam nie wolno zdjąć sieci. */
function electricTrainTiles(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const t of state.trains) {
    if (!needsCatenary(t.engine)) continue;
    for (const s of [...t.trail, ...t.reservedAhead]) out.add(s.y * state.map.width + s.x);
    if (t.status === 'depot') {
      const d = state.depots.find((dep) => dep.id === t.depotId);
      if (d) out.add(d.y * state.map.width + d.x);
    }
  }
  return out;
}

export function planCatenary(state: GameState, coords: readonly { x: number; y: number }[], remove: boolean): CatenaryPlan {
  const { map } = state;
  const all = targetTiles(state, coords);
  if (all.length === 0) return { tiles: [], cost: 0, result: { ok: false, reason: 'noTrack' } };
  const tiles = all.filter((i) => (map.electric[i] === 1) === remove);
  if (tiles.length === 0) return { tiles, cost: 0, result: { ok: false, reason: remove ? 'nothingToRemove' : 'alreadyBuilt' } };
  if (remove) {
    const busy = electricTrainTiles(state);
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
): CommandResult {
  const plan = planCatenary(state, coords, remove);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  for (const i of plan.tiles) {
    map.electric[i] = remove ? 0 : 1;
    events.push({ type: 'tileChanged', x: i % map.width, y: Math.floor(i / map.width) });
  }
  spend(state, 'construction', plan.cost);
  return { ok: true };
}

/** Po rozbiórce: sieć bez toru pod spodem znika (bez zwrotu – rozebrano ją razem z torem). */
export function dropOrphanCatenary(state: GameState, events: SimEvent[]): void {
  const { map } = state;
  for (let i = 0; i < map.electric.length; i++) {
    if (map.electric[i] && !hasRail(map, i)) {
      map.electric[i] = 0;
      events.push({ type: 'tileChanged', x: i % map.width, y: Math.floor(i / map.width) });
    }
  }
}

/** Liczba zelektryfikowanych kafelków (utrzymanie). */
export function catenaryTiles(map: WorldMap): number {
  let n = 0;
  for (let i = 0; i < map.electric.length; i++) n += map.electric[i]!;
  return n;
}
