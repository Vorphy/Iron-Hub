import { CLEAR_ROUGH_COST } from './config';
import type { GameState } from './state';
import { getTerrain, inBounds, setTerrain, Terrain } from './world/map';

/** Jedyny sposób zmiany stanu gry z zewnątrz. */
export type Command = { type: 'clearTile'; x: number; y: number };

export type FailReason = 'outOfBounds' | 'notRough' | 'noMoney';

export type CommandResult = { ok: true } | { ok: false; reason: FailReason };

/** Zdarzenia dla warstwy prezentacji (renderer, UI). Nie wpływają na symulację. */
export type SimEvent =
  | { type: 'tileChanged'; x: number; y: number }
  | { type: 'commandFailed'; command: Command; reason: FailReason };

export function applyCommand(state: GameState, cmd: Command, events: SimEvent[]): CommandResult {
  switch (cmd.type) {
    case 'clearTile':
      return clearTile(state, cmd.x, cmd.y, events);
  }
}

function clearTile(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  if (!inBounds(state.map, x, y)) return { ok: false, reason: 'outOfBounds' };
  if (getTerrain(state.map, x, y) !== Terrain.Rough) return { ok: false, reason: 'notRough' };
  if (state.money < CLEAR_ROUGH_COST) return { ok: false, reason: 'noMoney' };
  state.money -= CLEAR_ROUGH_COST;
  setTerrain(state.map, x, y, Terrain.Grass);
  events.push({ type: 'tileChanged', x, y });
  return { ok: true };
}
