import type { Camera } from '../render/camera';

const DRAG_THRESHOLD_PX = 4;
const KEY_PAN_PX_PER_S = 900;

export interface InputHandlers {
  /** Kliknięcie lewym przyciskiem (bez przeciągania) w punkt ekranu. */
  onClick(sx: number, sy: number): void;
  onPointerMove(sx: number, sy: number): void;
  onPointerLeave(): void;
  onKey(code: string): void;
}

/**
 * Mysz i klawiatura -> kamera / akcje.
 * Przeciąganie dowolnym przyciskiem przesuwa mapę (lewy – dopóki nie ma narzędzi budowy).
 */
export class Input {
  private readonly held = new Set<string>();
  private drag: { id: number; lastX: number; lastY: number; moved: number; button: number } | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly handlers: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', () => handlers.onPointerLeave());
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
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

  private onDown = (e: PointerEvent): void => {
    if (this.drag) return;
    this.el.setPointerCapture(e.pointerId);
    this.drag = { id: e.pointerId, lastX: e.offsetX, lastY: e.offsetY, moved: 0, button: e.button };
  };

  private onMove = (e: PointerEvent): void => {
    this.handlers.onPointerMove(e.offsetX, e.offsetY);
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const dx = e.offsetX - this.drag.lastX;
    const dy = e.offsetY - this.drag.lastY;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    this.drag.lastX = e.offsetX;
    this.drag.lastY = e.offsetY;
    if (this.drag.moved > DRAG_THRESHOLD_PX) this.camera.panBy(dx, dy);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const { moved, button } = this.drag;
    this.drag = null;
    if (e.type === 'pointerup' && button === 0 && moved <= DRAG_THRESHOLD_PX) {
      this.handlers.onClick(e.offsetX, e.offsetY);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.deltaY !== 0) this.camera.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1 : -1);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    this.held.add(e.code);
    if (!e.repeat) this.handlers.onKey(e.code);
  };
}
