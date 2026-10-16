import { START_MONEY } from './config';
import { generateMap, type WorldMap } from './world/map';

/** Pełny stan gry. Wszystko, co tu jest, trafi do zapisu. */
export interface GameState {
  version: 1;
  tick: number;
  /** Stan PRNG symulacji (patrz rng.ts). */
  rng: { state: number };
  money: number;
  map: WorldMap;
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
  };
}
