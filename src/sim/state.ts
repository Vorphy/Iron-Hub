import { START_MONEY } from './config';
import type { Depot } from './depot/depot';
import type { Station } from './station/station';
import { generateMap, type WorldMap } from './world/map';

/** Pełny stan gry. Wszystko, co tu jest, trafi do zapisu. */
export interface GameState {
  version: 1;
  tick: number;
  /** Stan PRNG symulacji (patrz rng.ts). */
  rng: { state: number };
  money: number;
  map: WorldMap;
  stations: Station[];
  /** Kolejne id stacji (od 1; 0 na mapie oznacza brak stacji). */
  nextStationId: number;
  depots: Depot[];
  nextDepotId: number;
}

export interface NewGameOptions {
  width: number;
  height: number;
  seed: number;
}

export function createGame({ width, height, seed }: NewGameOptions): GameState {
  return {
    version: 1,
    tick: 0,
    rng: { state: seed >>> 0 },
    money: START_MONEY,
    map: generateMap(width, height, seed),
    stations: [],
    nextStationId: 1,
    depots: [],
    nextDepotId: 1,
  };
}
