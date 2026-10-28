import { deserializeState, SaveError, serializeState, type SerializedState } from '../sim/serialize';
import type { GameState } from '../sim/state';

/** Widok gracza (kamera) – zapisywany obok stanu gry, ale poza symulacją. */
export interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

/** Plik zapisu: to samo trafia do IndexedDB i do eksportowanego pliku. */
export interface SaveFile {
  format: 'iron-hub-save';
  savedAt: string;
  state: SerializedState;
  view?: ViewState;
}

export interface LoadedSave {
  state: GameState;
  savedAt: string;
  view: ViewState | null;
}

function isView(v: unknown): v is ViewState {
  const o = v as ViewState;
  return !!o && [o.cx, o.cy, o.zoom].every((n) => typeof n === 'number' && Number.isFinite(n));
}

export type Slot = 'auto' | 'quick';

const DB_NAME = 'iron-hub';
const STORE = 'saves';

export function toSaveFile(state: GameState, view?: ViewState): SaveFile {
  return { format: 'iron-hub-save', savedAt: new Date().toISOString(), state: serializeState(state), view };
}

export function parseSaveFile(text: string): LoadedSave {
  let data: Partial<SaveFile>;
  try {
    data = JSON.parse(text) as Partial<SaveFile>;
  } catch {
    throw new SaveError('To nie jest plik JSON');
  }
  if (data?.format !== 'iron-hub-save') throw new SaveError('To nie jest zapis Iron Hub');
  return {
    state: deserializeState(data.state),
    savedAt: String(data.savedAt ?? ''),
    view: isView(data.view) ? data.view : null,
  };
}

// --- IndexedDB (zapis lokalny, osobny dla każdej domeny i przeglądarki) ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function writeSlot(slot: Slot, state: GameState, view?: ViewState): Promise<SaveFile> {
  const file = toSaveFile(state, view);
  await withStore('readwrite', (s) => s.put(JSON.stringify(file), slot));
  return file;
}

export async function readSlot(slot: Slot): Promise<LoadedSave | null> {
  const text = await withStore<unknown>('readonly', (s) => s.get(slot));
  return typeof text === 'string' ? parseSaveFile(text) : null;
}

/** Data zapisu w slocie (bez wczytywania całego stanu do gry) albo null. */
export async function slotDate(slot: Slot): Promise<string | null> {
  try {
    const text = await withStore<unknown>('readonly', (s) => s.get(slot));
    if (typeof text !== 'string') return null;
    return String((JSON.parse(text) as Partial<SaveFile>).savedAt ?? '') || null;
  } catch {
    return null;
  }
}

// --- Pliki ---

export function downloadSave(state: GameState, view?: ViewState): void {
  const file = toSaveFile(state, view);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Nazwa firmy w nazwie pliku (same litery, cyfry i myślniki).
  const company = state.companyName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  a.download = `iron-hub-${company ? `${company}-` : ''}${file.savedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickSaveFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

export function describeError(e: unknown): string {
  if (e instanceof SaveError) return `Nie udało się wczytać: ${e.message}`;
  return 'Zapis w przeglądarce niedostępny (tryb prywatny?)';
}
