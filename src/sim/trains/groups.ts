import type { CommandResult, SimEvent } from '../commands';
import type { GameState } from '../state';
import { trainById } from './train';

/** Grupa pociągów gracza (np. „Węgiel”, „Pasażerskie”) – do filtrowania listy pociągów. */
export interface TrainGroup {
  id: number;
  name: string;
}

const MAX_NAME = 32;

function cleanName(name: string): string {
  return name.trim().slice(0, MAX_NAME);
}

export function createGroup(state: GameState, name: string, events: SimEvent[]): CommandResult {
  const clean = cleanName(name);
  if (!clean) return { ok: false, reason: 'blocked' };
  state.groups.push({ id: state.nextGroupId++, name: clean });
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

export function renameGroup(state: GameState, groupId: number, name: string, events: SimEvent[]): CommandResult {
  const group = state.groups.find((g) => g.id === groupId);
  const clean = cleanName(name);
  if (!group || !clean) return { ok: false, reason: 'blocked' };
  group.name = clean;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

/** Usuwa grupę – jej pociągi zostają bez grupy. */
export function deleteGroup(state: GameState, groupId: number, events: SimEvent[]): CommandResult {
  if (!state.groups.some((g) => g.id === groupId)) return { ok: false, reason: 'blocked' };
  state.groups = state.groups.filter((g) => g.id !== groupId);
  for (const t of state.trains) if (t.groupId === groupId) t.groupId = null;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}

export function setTrainGroup(state: GameState, trainId: number, groupId: number | null, events: SimEvent[]): CommandResult {
  const train = trainById(state, trainId);
  if (!train || (groupId !== null && !state.groups.some((g) => g.id === groupId))) return { ok: false, reason: 'blocked' };
  train.groupId = groupId;
  events.push({ type: 'trainsChanged' });
  return { ok: true };
}
