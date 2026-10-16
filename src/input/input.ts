import type { Camera } from '../render/camera';

const DRAG_THRESHOLD_PX = 4;
const KEY_PAN_PX_PER_S = 900;

export interface InputHandlers {
  /**
   * Wciśnięcie lewego przycisku. Zwraca true, jeśli aktywne narzędzie przejmuje gest
   * (np. budowa toru) – wtedy przeciąganie nie przesuwa mapy.
   */
  onPrimaryDown(sx: number, sy: number): boolean;
  onPrimaryDrag(sx: number, sy: number): void;
  onPrimaryUp(sx: number, sy: number): void;
  /** Kliknięcie lewym przyciskiem, gdy narzędzie nie przejęło gestu. */
  onClick(sx: number, sy: number): void;
  onPointerMove(sx: number, sy: number): void;
  onPointerLeave(): void;
  onKey(code: string): void;
}

interface Drag {
  id: number;
  lastX: number;
  lastY: number;
  moved: number;
  button: number;
  /** Gest przejęty przez narzędzie (nie przesuwa mapy). */
  tool: boolean;
}

/**
 * Mysz i klawiatura -> kamera / narzędzia.
 * Prawy/środkowy przycisk zawsze przesuwa mapę; lewy – gdy narzędzie nie przejmie gestu.
 */
export class Input {
  private readonly held = new Set<string>();
  private drag: Drag | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly handlers: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', preventDefault);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', preventDefault);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Przesuwanie klawiszami – wywoływane co klatkę. */
  update(deltaMs: number): void {
    const d = (KEY_PAN_PX_PER_S * deltaMs) / 1000;
    let dx = 0;
    let dy = 0;
    if (this.held.has('ArrowLeft') || this.held.has('KeyA')) dx += d;
    if (this.held.has('ArrowRight') || this.held.has('KeyD')) dx -= d;
    if (this.held.has('ArrowUp') || this.held.has('KeyW')) dy += d;
    if (this.held.has('ArrowDown') || this.held.has('KeyS')) dy -= d;
    if (dx || dy) this.camera.panBy(dx, dy);
  }

  /** Przerywa gest narzędzia (np. Escape w trakcie przeciągania). */
  cancelToolDrag(): void {
    if (this.drag?.tool) this.drag = null;
  }

  private onDown = (e: PointerEvent): void => {
    if (this.drag) return;
    this.el.setPointerCapture(e.pointerId);
    const tool = e.button === 0 && this.handlers.onPrimaryDown(e.offsetX, e.offsetY);
    this.drag = { id: e.pointerId, lastX: e.offsetX, lastY: e.offsetY, moved: 0, button: e.button, tool };
  };

  private onMove = (e: PointerEvent): void => {
    this.handlers.onPointerMove(e.offsetX, e.offsetY);
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.tool) {
      this.handlers.onPrimaryDrag(e.offsetX, e.offsetY);
      return;
    }
    const dx = e.offsetX - drag.lastX;
    const dy = e.offsetY - drag.lastY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.lastX = e.offsetX;
    drag.lastY = e.offsetY;
    if (drag.moved > DRAG_THRESHOLD_PX) this.camera.panBy(dx, dy);
  };

  private onUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) return;
    this.drag = null;
    if (e.type !== 'pointerup') return;
    if (drag.tool) this.handlers.onPrimaryUp(e.offsetX, e.offsetY);
    else if (drag.button === 0 && drag.moved <= DRAG_THRESHOLD_PX) this.handlers.onClick(e.offsetX, e.offsetY);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.deltaY !== 0) this.camera.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1 : -1);
  };

  private onLeave = (): void => this.handlers.onPointerLeave();
  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };
  private onBlur = (): void => this.held.clear();

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    this.held.add(e.code);
    if (!e.repeat) this.handlers.onKey(e.code);
  };
}

function preventDefault(e: Event): void {
  e.preventDefault();
}
