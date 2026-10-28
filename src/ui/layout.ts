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

/**
 * Wielkość interfejsu (Menu → Widok): 60% i 80% – laptopy i małe ekrany, 100% – monitory ok. 24",
 * 120% – duże ekrany.
 */
export type UiSize = 'tiny' | 'small' | 'normal' | 'large';
export const UI_SIZES: readonly UiSize[] = ['tiny', 'small', 'normal', 'large'];
export const UI_SIZE_SCALE: Record<UiSize, number> = { tiny: 0.6, small: 0.8, normal: 1, large: 1.2 };
export const UI_SIZE_NAMES: Record<UiSize, string> = { tiny: '60%', small: '80%', normal: '100%', large: '120%' };
/** Okno przeglądarki niższe niż tyle px – na start mały interfejs (laptop). */
const SMALL_SCREEN_HEIGHT = 800;

export interface LayoutState {
  panels: Record<PanelId, PanelLayout>;
  /** Podpowiedzi do narzędzi w prawym dolnym rogu (Menu → Widok). */
  hints: boolean;
  uiSize: UiSize;
}

const KEY = 'ironhub.layout';
const PANEL_IDS: readonly PanelId[] = ['topbar', 'build', 'hints'];
/** Ile panelu musi zostać na ekranie, żeby dało się go złapać z powrotem. */
const KEEP_VISIBLE = 48;

function defaults(): LayoutState {
  const panels = {} as Record<PanelId, PanelLayout>;
  for (const id of PANEL_IDS) panels[id] = { pos: null, collapsed: false };
  const uiSize = typeof window !== 'undefined' && window.innerHeight < SMALL_SCREEN_HEIGHT ? 'small' : 'normal';
  return { panels, hints: true, uiSize };
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
    if (UI_SIZES.includes(raw.uiSize as UiSize)) def.uiSize = raw.uiSize as UiSize;
    return def;
  } catch {
    return def;
  }
}

export const layoutStore = new Store<LayoutState>(load());

/** Skala interfejsu (1 – normalny). Położenia paneli trzymamy w px ekranu, w CSS dzielimy przez skalę. */
export function uiScale(): number {
  return UI_SIZE_SCALE[layoutStore.get().uiSize];
}

/** Ustawia zmienną CSS `--ui-scale` (zoom warstwy `#ui`). */
function applyUiScale(): void {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--ui-scale', String(uiScale()));
}
applyUiScale();

export function setUiSize(uiSize: UiSize): void {
  update({ uiSize });
  applyUiScale();
}

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

/** Wszystkie panele na domyślne miejsca, rozwinięte; podpowiedzi włączone. Wielkość interfejsu zostaje. */
export function resetLayout(): void {
  update({ ...defaults(), uiSize: layoutStore.get().uiSize });
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
  const s = UI_SIZE_SCALE[useStore(layoutStore).uiSize];
  const style = pos
    ? { left: `${pos.x / s}px`, top: `${pos.y / s}px`, right: 'auto', bottom: 'auto', transform: 'none' }
    : undefined;

  return {
    ref,
    grip,
    style,
    collapsed: layout.collapsed,
    toggleCollapsed: () => setPanel(id, { collapsed: !layout.collapsed }),
  };
}
