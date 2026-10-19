import type { CommandResult, SimEvent } from '../commands';
import { TERRAFORM_COST } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { MAX_HEIGHT, syncWater, vertexIndex } from './height';
import { hasBuilding, inBounds, type WorldMap } from './map';

export interface TerraformPlan {
  /** Zmienione narożniki: indeks wierzchołka -> nowa wysokość. */
  changes: Map<number, number>;
  /** Kafelki, których kształt się zmienia (do podglądu i odświeżenia). */
  tiles: number[];
  cost: number;
  result: CommandResult;
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Kafelek, pod którym nie wolno zmieniać terenu (tor, stacja, zajezdnia, most, tunel, budynek). */
function locked(map: WorldMap, x: number, y: number): boolean {
  const i = y * map.width + x;
  return !!(
    map.track[i] ||
    map.station[i] ||
    map.depot[i] ||
    map.bridge[i] ||
    map.tunnel[i] ||
    map.road[i] ||
    hasBuilding(map, i)
  );
}

/**
 * Ustawia podane narożniki na zadane wysokości i dopasowuje sąsiadów tak, by różnice nie
 * przekraczały 1 (rozchodzi się falą jak w TTD). Nie zmienia stanu – zwraca plan.
 */
export function planTerraform(state: GameState, targets: ReadonlyMap<number, number>): TerraformPlan {
  const { map } = state;
  const vw = map.width + 1;
  const vh = map.height + 1;
  const h = (i: number) => changes.get(i) ?? map.heights[i]!;
  const changes = new Map<number, number>();
  const queue: number[] = [];
  let tooHigh = false;

  for (const [i, target] of targets) {
    if (target < 0 || target > MAX_HEIGHT) tooHigh = true;
    const t = Math.max(0, Math.min(MAX_HEIGHT, target));
    if (t !== map.heights[i]) {
      changes.set(i, t);
      queue.push(i);
    }
  }
  while (queue.length) {
    const i = queue.shift()!;
    const vx = i % vw;
    const vy = Math.floor(i / vw);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = vx + dx;
      const ny = vy + dy;
      if (nx < 0 || ny < 0 || nx >= vw || ny >= vh) continue;
      const n = ny * vw + nx;
      // Wierzchołki z listy celów nie są poprawiane przez sąsiadów.
      if (targets.has(n)) continue;
      const hv = h(i);
      const hn = h(n);
      if (hn < hv - 1) changes.set(n, hv - 1);
      else if (hn > hv + 1) changes.set(n, hv + 1);
      else continue;
      queue.push(n);
    }
  }

  // Kafelki dotknięte zmianą: każdy kafelek wokół zmienionego narożnika.
  const tiles = new Set<number>();
  for (const i of changes.keys()) {
    const vx = i % vw;
    const vy = Math.floor(i / vw);
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const) {
      if (inBounds(map, vx + dx, vy + dy)) tiles.add((vy + dy) * map.width + vx + dx);
    }
  }
  const tileList = [...tiles].sort((a, b) => a - b);
  const cost = changes.size * TERRAFORM_COST;
  let result: CommandResult = { ok: true };
  if (changes.size === 0) result = { ok: false, reason: tooHigh ? 'tooHigh' : 'nothingToClear' };
  else if (tileList.some((t) => locked(map, t % map.width, Math.floor(t / map.width)))) result = { ok: false, reason: 'blocked' };
  else if (cost > state.money) result = { ok: false, reason: 'noMoney' };
  return { changes, tiles: tileList, cost, result };
}

export function applyTerraform(state: GameState, plan: TerraformPlan, events: SimEvent[]): CommandResult {
  if (!plan.result.ok) return plan.result;
  for (const [i, v] of plan.changes) state.map.heights[i] = v;
  // Podniesiona woda staje się lądem, ląd obniżony na dno – wodą.
  syncWater(state.map, plan.tiles);
  spend(state, 'construction', plan.cost);
  for (const t of plan.tiles) events.push({ type: 'tileChanged', x: t % state.map.width, y: Math.floor(t / state.map.width) });
  return { ok: true };
}

/** Podniesienie (+1) lub obniżenie (−1) jednego narożnika. */
export function terraformTargets(state: GameState, vx: number, vy: number, delta: 1 | -1): Map<number, number> {
  const { map } = state;
  if (vx < 0 || vy < 0 || vx > map.width || vy > map.height) return new Map();
  const i = vertexIndex(map, vx, vy);
  return new Map([[i, map.heights[i]! + delta]]);
}

/** Wyrównanie prostokąta narożników do wysokości `level`. */
export function levelTargets(state: GameState, vx0: number, vy0: number, vx1: number, vy1: number, level: number): Map<number, number> {
  const { map } = state;
  const out = new Map<number, number>();
  for (let vy = Math.max(0, Math.min(vy0, vy1)); vy <= Math.min(map.height, Math.max(vy0, vy1)); vy++) {
    for (let vx = Math.max(0, Math.min(vx0, vx1)); vx <= Math.min(map.width, Math.max(vx0, vx1)); vx++) {
      out.set(vertexIndex(map, vx, vy), level);
    }
  }
  return out;
}
