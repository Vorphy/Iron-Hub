import { useEffect, useState } from 'preact/hooks';

/** Minimalny magazyn stanu: gra zapisuje, UI subskrybuje. */
export class Store<T extends object> {
  private listeners = new Set<() => void>();

  constructor(private state: T) {}

  get(): T {
    return this.state;
  }

  /** Aktualizuje tylko, gdy coś faktycznie się zmieniło (płytkie porównanie). */
  set(patch: Partial<T>): void {
    let changed = false;
    for (const key in patch) {
      if (!Object.is(patch[key], this.state[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function useStore<T extends object>(store: Store<T>): T {
  const [state, setState] = useState(store.get());
  useEffect(() => store.subscribe(() => setState(store.get())), [store]);
  return state;
}
