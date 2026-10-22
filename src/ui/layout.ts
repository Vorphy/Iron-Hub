import { useEffect, useRef, useState } from 'preact/hooks';
import { Store, useStore } from './store';

/**
 * UKŁAD PANELI – położenie i zwinięcie górnego paska, menu budowania i podpowiedzi. Ustawienie
 * gracza w tej przeglądarce (nie w zapisie gry).
 */
export type PanelId = 'topbar' | 'build' | 'hints';

export interface PanelLayout {
  /** Lewy górny róg panelu (px ekranu); null – położenie domyślne. */
  pos: { x: number; y: number } | null;
  collapsed: boolean;
}

export interface LayoutState {
  panels: Record<PanelId, PanelLayout>;
  /** Podpowiedzi do narzędzi w prawym dolnym rogu (Menu → Widok). */
  hints: boolean;
}

const KEY = 'ironhub.layout';
const PANEL_IDS: readonly PanelId[] = ['topbar', 'build', 'hints'];
/** Ile panelu musi zostać na ekranie, żeby dało się go złapać z powrotem. */
const KEEP_VISIBLE = 48;

function defaults(): LayoutState {
  const panels = {} as Record<PanelId, PanelLayout>;
  for (const id of PANEL_IDS) panels[id] = { pos: null, collapsed: false };
  return { panels, hints: true };
}

function load(): LayoutState {
  const def = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LayoutState> | null;
    if (!raw) return def;
    for (const id of PANEL_IDS) {
      const p = raw.panels?.[id];
      if (!p) continue;
      const pos = p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) ? { x: p.pos.x, y: p.pos.y } : null;
      def.panels[id] = { pos, collapsed: p.collapsed === true };
    }
    def.hints = raw.hints !== false;
    return def;
  } catch {
    return def;
  }
}

export const layoutStore = new Store<LayoutState>(load());

function update(patch: Partial<LayoutState>): void {
  layoutStore.set(patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(layoutStore.get()));
  } catch {
    // Bez dostępu do pamięci przeglądarki układ działa do zamknięcia strony.
  }
}

function setPanel(id: PanelId, patch: Partial<PanelLayout>): void {
  const panels = layoutStore.get().panels;
  update({ panels: { ...panels, [id]: { ...panels[id], ...patch } } });
}

export function setHints(on: boolean): void {
  update({ hints: on });
}

/** Wszystkie panele na domyślne miejsca, rozwinięte; podpowiedzi włączone. */
export function resetLayout(): void {
  update(defaults());
}

/** Położenie przycięte do okna – panel nie ucieknie za ekran (np. po zmniejszeniu okna). */
function clampToWindow(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(window.innerWidth - KEEP_VISIBLE, pos.x)),
    y: Math.max(0, Math.min(window.innerHeight - KEEP_VISIBLE, pos.y)),
  };
}

/**
 * Panel przesuwany za uchwyt i zwijany. `ref` – element panelu, `grip` – zdarzenia uchwytu,
 * `style` – położenie (undefined – domyślne z CSS).
 */
export function useFloatingPanel(id: PanelId) {
  const layout = useStore(layoutStore).panels[id];
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number; x: number; y: number } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const grip = {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0 || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDrag({ dx: e.clientX - r.left, dy: e.clientY - r.top, x: r.left, y: r.top });
      e.preventDefault();
    },
    onPointerMove: (e: PointerEvent) => {
      if (!drag) return;
      setDrag({ ...drag, ...clampToWindow({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }) });
    },
    onPointerUp: () => {
      if (!drag) return;
      setPanel(id, { pos: { x: drag.x, y: drag.y } });
      setDrag(null);
    },
  };

  const pos = drag ?? (layout.pos ? clampToWindow(layout.pos) : null);
  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto', transform: 'none' } : undefined;

  return {
    ref,
    grip,
    style,
    collapsed: layout.collapsed,
    toggleCollapsed: () => setPanel(id, { collapsed: !layout.collapsed }),
  };
}
