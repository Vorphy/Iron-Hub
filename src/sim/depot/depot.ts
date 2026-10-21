import type { WagonLoad } from '../trains/train';
import { CLEAR_ROUGH_COST, DEPOT_COST, TRACK_REFUND_RATE } from '../config';
import { spend } from '../economy/finance';
import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { oppositeSide, type Side, SIDE_DELTA, TRACK_SIDES, tracksOn } from '../track/track';
import { isFlat } from '../world/height';
import { getTerrain, hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from '../world/map';

/**
 * Zajezdnia zajmuje kafelek; tor wychodzi z niej jednym bokiem (wjazd).
 * Pociągi stojące w zajezdni nie zajmują torów na mapie.
 */
/** Wagon w magazynie zajezdni (odpięty albo kupiony luzem). */
export interface SpareWagon {
  type: string;
  load: WagonLoad;
}

export interface Depot {
  id: number;
  x: number;
  y: number;
  side: Side;
  /** Magazyn wagonów – można je doczepić do pociągu stojącego w tej zajezdni. */
  wagons: SpareWagon[];
}

export function depotAt(state: GameState, x: number, y: number): Depot | undefined {
  if (!inBounds(state.map, x, y)) return undefined;
  const id = state.map.depot[y * state.map.width + x];
  return id ? state.depots.find((d) => d.id === id) : undefined;
}

/** Czy na kafelek można wjechać od strony `side` (tor lub zajezdnia zwrócona w tę stronę). */
function hasTrackTowards(map: WorldMap, x: number, y: number, side: Side): boolean {
  if (!inBounds(map, x, y)) return false;
  return tracksOn(map.track[y * map.width + x]!).some((t) => TRACK_SIDES[t].includes(side));
}

/**
 * Wjazd zajezdni: pierwszy bok (licząc od preferowanego), za którym jest tor prowadzący
 * do tego kafelka; jeśli żadnego – preferowany.
 */
export function autoDepotSide(map: WorldMap, x: number, y: number, preferred: Side): Side {
  for (let i = 0; i < 4; i++) {
    const side = ((preferred + i) & 3) as Side;
    const [dx, dy] = SIDE_DELTA[side];
    if (hasTrackTowards(map, x + dx, y + dy, oppositeSide(side))) return side;
  }
  return preferred;
}

export function planDepot(state: GameState, x: number, y: number): { cost: number; result: CommandResult } {
  const { map } = state;
  if (!inBounds(map, x, y)) return { cost: 0, result: { ok: false, reason: 'outOfBounds' } };
  const i = y * map.width + x;
  const cost = DEPOT_COST + (getTerrain(map, x, y) === Terrain.Rough ? CLEAR_ROUGH_COST : 0);
  if (
    getTerrain(map, x, y) === Terrain.Water ||
    map.track[i] ||
    map.station[i] ||
    map.depot[i] ||
    hasBuilding(map, i) ||
    map.bridge[i] ||
    !isFlat(map, x, y)
  ) {
    return { cost, result: { ok: false, reason: 'blocked' } };
  }
  if (cost > state.money) return { cost, result: { ok: false, reason: 'noMoney' } };
  return { cost, result: { ok: true } };
}

export function buildDepot(state: GameState, x: number, y: number, side: Side, events: SimEvent[]): CommandResult {
  const plan = planDepot(state, x, y);
  if (!plan.result.ok) return plan.result;
  const id = state.nextDepotId++;
  state.map.depot[y * state.map.width + x] = id;
  state.map.road[y * state.map.width + x] = 0;
  if (getTerrain(state.map, x, y) === Terrain.Rough) setTerrain(state.map, x, y, Terrain.Grass);
  state.depots.push({ id, x, y, side, wagons: [] });
  spend(state, 'construction', plan.cost);
  events.push({ type: 'tileChanged', x, y }, { type: 'depotsChanged' });
  return { ok: true };
}

export function removeDepot(state: GameState, depot: Depot, events: SimEvent[]): CommandResult {
  state.map.depot[depot.y * state.map.width + depot.x] = 0;
  state.depots = state.depots.filter((d) => d !== depot);
  spend(state, 'construction', -depotRefund());
  events.push({ type: 'tileChanged', x: depot.x, y: depot.y }, { type: 'depotsChanged' });
  return { ok: true };
}

export function depotRefund(): number {
  return Math.round(DEPOT_COST * TRACK_REFUND_RATE);
}
