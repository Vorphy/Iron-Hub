import type { Container } from 'pixi.js';
import { TILE_H, TILE_W, type Point } from './iso';

/** Skale będące potęgami 2 – pixel art pozostaje ostry. */
export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4] as const;
const DEFAULT_ZOOM_INDEX = 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Camera {
  /** Punkt świata w środku ekranu. */
  cx = 0;
  cy = 0;
  viewW = 1;
  viewH = 1;
  private zoomIndex = DEFAULT_ZOOM_INDEX;

  constructor(
    private readonly world: Container,
    private readonly mapW: number,
    private readonly mapH: number,
  ) {}

  get zoom(): number {
    return ZOOM_LEVELS[this.zoomIndex]!;
  }

  /** Ustawia najbliższy dostępny poziom zoomu. */
  setZoom(zoom: number): void {
    let best = 0;
    ZOOM_LEVELS.forEach((z, i) => {
      if (Math.abs(z - zoom) < Math.abs(ZOOM_LEVELS[best]! - zoom)) best = i;
    });
    this.zoomIndex = best;
    this.clamp();
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  centerOn(p: Point): void {
    this.cx = p.x;
    this.cy = p.y;
    this.clamp();
  }

  /** Przesunięcie o wektor w pikselach ekranu. */
  panBy(dx: number, dy: number): void {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clamp();
  }

  /** Zmiana zoomu tak, by punkt pod kursorem został w miejscu. */
  zoomAt(sx: number, sy: number, direction: 1 | -1): void {
    const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, this.zoomIndex + direction));
    if (next === this.zoomIndex) return;
    const anchor = this.screenToWorld(sx, sy);
    this.zoomIndex = next;
    this.cx = anchor.x - (sx - this.viewW / 2) / this.zoom;
    this.cy = anchor.y - (sy - this.viewH / 2) / this.zoom;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.cx,
      y: (sy - this.viewH / 2) / this.zoom + this.cy,
    };
  }

  /** Widoczny obszar we współrzędnych świata. */
  viewRect(): Rect {
    const tl = this.screenToWorld(0, 0);
    return { x: tl.x, y: tl.y, w: this.viewW / this.zoom, h: this.viewH / this.zoom };
  }

  apply(): void {
    this.world.scale.set(this.zoom);
    this.world.position.set(
      Math.round(this.viewW / 2 - this.cx * this.zoom),
      Math.round(this.viewH / 2 - this.cy * this.zoom),
    );
  }

  private clamp(): void {
    const minX = (-this.mapH * TILE_W) / 2;
    const maxX = (this.mapW * TILE_W) / 2;
    const maxY = ((this.mapW + this.mapH) * TILE_H) / 2;
    this.cx = Math.min(maxX, Math.max(minX, this.cx));
    this.cy = Math.min(maxY, Math.max(0, this.cy));
  }
}
