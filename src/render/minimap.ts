import type { GameState } from '../sim/state';
import { pointBehindHead } from '../sim/trains/geometry';
import { cornerHeights } from '../sim/world/height';
import { Terrain } from '../sim/world/map';
import type { Rect } from './camera';
import { TILE_H, TILE_W } from './iso';

/**
 * Minimapa: cała mapa w rzucie izometrycznym na zwykłym płótnie 2D (poza Pixi). Kolory kafelków
 * liczone rzadko (teren zmienia się powoli), widok kamery i pociągi – co klatkę.
 */

const WATER = [46, 95, 143];
const GRASS = [91, 140, 58];
const ROUGH = [122, 115, 70];
const HOUSE = [196, 98, 72];
const ROAD = [150, 152, 156];
const INDUSTRY = [176, 124, 198];
const TRACK = [58, 48, 38];
const STATION = [222, 216, 200];

/** Współrzędne na minimapie (0–1) punktu świata w pikselach (rzut płaski, bez wysokości). */
export function worldToMinimap(state: GameState, wx: number, wy: number): { u: number; v: number } {
  const { width: W, height: H } = state.map;
  return { u: (wx / (TILE_W / 2) + H) / (W + H), v: wy / (TILE_H / 2) / (W + H) };
}

/** Odwrotność `worldToMinimap`. */
export function minimapToWorld(state: GameState, u: number, v: number): { x: number; y: number } {
  const { width: W, height: H } = state.map;
  return { x: (u * (W + H) - H) * (TILE_W / 2), y: v * (W + H) * (TILE_H / 2) };
}

export class Minimap {
  private readonly base = document.createElement('canvas');

  constructor(readonly canvas: HTMLCanvasElement) {}

  /** Kolory kafelków (próbka w środku każdego piksela). */
  redrawTerrain(state: GameState): void {
    const { canvas, base } = this;
    const cw = canvas.width;
    const ch = canvas.height;
    base.width = cw;
    base.height = ch;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(cw, ch);
    const { map } = state;
    const W = map.width;
    const H = map.height;
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const sx = ((px + 0.5) / cw) * (W + H) - H;
        const sy = ((py + 0.5) / ch) * (W + H);
        const x = Math.floor((sx + sy) / 2);
        const y = Math.floor((sy - sx) / 2);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        let c: number[];
        if (map.station[i]) c = STATION;
        else if (map.track[i] || map.bridge[i]) c = TRACK;
        else if (map.house[i]) c = HOUSE;
        else if (map.industry[i]) c = INDUSTRY;
        else if (map.road[i]) c = ROAD;
        else if (map.terrain[i] === Terrain.Water) c = WATER;
        else {
          // Wyżej jaśniej – widać ukształtowanie terenu.
          const k = 0.85 + Math.max(...cornerHeights(map, x, y)) * 0.06;
          const src = map.terrain[i] === Terrain.Rough ? ROUGH : GRASS;
          c = [src[0]! * k, src[1]! * k, src[2]! * k];
        }
        const o = (py * cw + px) * 4;
        img.data[o] = c[0]!;
        img.data[o + 1] = c[1]!;
        img.data[o + 2] = c[2]!;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Mapa, pociągi i prostokąt widoku kamery. */
  draw(state: GameState, view: Rect): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.base, 0, 0);
    const toPx = (wx: number, wy: number) => {
      const m = worldToMinimap(state, wx, wy);
      return { x: m.u * cw, y: m.v * ch };
    };
    ctx.fillStyle = '#ffe066';
    for (const t of state.trains) {
      if (t.status === 'depot' || !t.trail.length) continue;
      const p = pointBehindHead(t, 0);
      if (!p) continue;
      const s = toPx(((p.x - p.y) * TILE_W) / 2, ((p.x + p.y) * TILE_H) / 2);
      ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 2, 4, 4);
    }
    const a = toPx(view.x, view.y);
    const b = toPx(view.x + view.w, view.y + view.h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.max(4, b.x - a.x), Math.max(3, b.y - a.y));
  }
}
