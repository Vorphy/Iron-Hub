import { INDUSTRY_DEFS, industryDef } from '../sim/economy/industry';
import type { GameState } from '../sim/state';
import { pointBehindHead } from '../sim/trains/geometry';
import { cornerHeights } from '../sim/world/height';
import { Terrain } from '../sim/world/map';
import type { Rect } from './camera';
import { TILE_H, TILE_W } from './iso';

/**
 * Minimapa: cała mapa (albo jej przybliżony fragment wokół kamery) w rzucie izometrycznym na zwykłym
 * płótnie 2D (poza Pixi). Teren liczony rzadko, zakłady, pociągi i widok kamery – co klatkę.
 */

/** Co pokazywać na minimapie (legenda z ptaszkami). */
export interface MinimapFilters {
  /** Typ zakładu (id z industries.json) → widoczny. */
  industries: Record<string, boolean>;
  towns: boolean;
  rail: boolean;
  trains: boolean;
}

export interface MinimapOptions {
  /** Przybliżenie: 1 – cała mapa, 2/4/8 – fragment wokół kamery. */
  zoom: number;
  filters: MinimapFilters;
  /** Nazwy miast (duża mapa). */
  labels: boolean;
}

export const MINIMAP_ZOOMS = [1, 2, 4, 8] as const;

/** Wyraźne kolory zakładów na minimapie (legenda). */
export const MINIMAP_INDUSTRY_COLORS: Record<string, string> = {
  coal_mine: '#141414',
  ore_mine: '#b0643a',
  forest: '#1d5c27',
  power_plant: '#ffd23f',
  steel_mill: '#e0403a',
  sawmill: '#f08c2a',
};

export function industryColor(type: string): string {
  return MINIMAP_INDUSTRY_COLORS[type] ?? industryDef(type)?.color ?? '#b07cc6';
}

export function defaultFilters(): MinimapFilters {
  return { industries: Object.fromEntries(INDUSTRY_DEFS.map((d) => [d.id, true])), towns: true, rail: true, trains: true };
}

const WATER = [46, 95, 143];
const GRASS = [91, 140, 58];
const ROUGH = [122, 115, 70];
const HOUSE = [196, 98, 72];
const ROAD = [150, 152, 156];
const TRACK = [58, 48, 38];
const STATION = [222, 216, 200];

/** Współrzędne na całej minimapie (0–1) punktu świata w pikselach (rzut płaski, bez wysokości). */
export function worldToMinimap(state: GameState, wx: number, wy: number): { u: number; v: number } {
  const { width: W, height: H } = state.map;
  return { u: (wx / (TILE_W / 2) + H) / (W + H), v: wy / (TILE_H / 2) / (W + H) };
}

/** Odwrotność `worldToMinimap`. */
export function minimapToWorld(state: GameState, u: number, v: number): { x: number; y: number } {
  const { width: W, height: H } = state.map;
  return { x: (u * (W + H) - H) * (TILE_W / 2), y: v * (W + H) * (TILE_H / 2) };
}

/** Punkt w układzie kafelków → cała minimapa (0–1). */
function tileToMinimap(state: GameState, x: number, y: number): { u: number; v: number } {
  const { width: W, height: H } = state.map;
  return { u: (x - y + H) / (W + H), v: (x + y) / (W + H) };
}

/** Widoczny fragment minimapy: lewy górny róg i bok (ułamki całej mapy). */
interface Window {
  u0: number;
  v0: number;
  span: number;
}

const REDRAW_MS = 250;

export class Minimap {
  private readonly base = document.createElement('canvas');
  private win: Window = { u0: 0, v0: 0, span: 1 };
  private baseWin: Window | null = null;
  private baseKey = '';
  private lastBase = 0;

  constructor(readonly canvas: HTMLCanvasElement) {}

  /** Ułamek płótna (0–1) → położenie na całej mapie (0–1). */
  toMap(fx: number, fy: number): { u: number; v: number } {
    return { u: this.win.u0 + fx * this.win.span, v: this.win.v0 + fy * this.win.span };
  }

  /** Odświeża teren (gdy trzeba) i rysuje warstwę na wierzchu. `terrainChanged` – mapa się zmieniła. */
  update(state: GameState, view: Rect, opts: MinimapOptions, terrainChanged: boolean, now: number): boolean {
    const span = 1 / opts.zoom;
    if (opts.zoom === 1) this.win = { u0: 0, v0: 0, span: 1 };
    else {
      // Przybliżenie: fragment wokół środka kamery (nie wychodzi poza mapę).
      const c = worldToMinimap(state, view.x + view.w / 2, view.y + view.h / 2);
      const clamp = (v: number) => Math.min(1 - span, Math.max(0, v - span / 2));
      this.win = { u0: clamp(c.u), v0: clamp(c.v), span };
    }
    const f = opts.filters;
    const key = `${this.canvas.width}x${this.canvas.height}|${opts.zoom}|${f.towns}|${f.rail}`;
    const moved =
      this.baseWin !== null &&
      (Math.abs(this.baseWin.u0 - this.win.u0) + Math.abs(this.baseWin.v0 - this.win.v0)) / span > 2 / this.canvas.width;
    let redrawn = false;
    if (key !== this.baseKey || ((terrainChanged || moved) && now - this.lastBase >= REDRAW_MS)) {
      this.redrawBase(state, opts);
      this.baseKey = key;
      this.baseWin = { ...this.win };
      this.lastBase = now;
      redrawn = true;
    }
    this.draw(state, view, opts);
    return redrawn;
  }

  /** Teren, woda, miasta (domy, drogi) i tory – próbka w środku każdego piksela. */
  private redrawBase(state: GameState, opts: MinimapOptions): void {
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
    const { u0, v0, span } = this.win;
    const { towns, rail } = opts.filters;
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const u = u0 + ((px + 0.5) / cw) * span;
        const v = v0 + ((py + 0.5) / ch) * span;
        const sx = u * (W + H) - H;
        const sy = v * (W + H);
        const x = Math.floor((sx + sy) / 2);
        const y = Math.floor((sy - sx) / 2);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        let c: number[];
        if (rail && map.station[i]) c = STATION;
        else if (rail && (map.track[i] || map.bridge[i])) c = TRACK;
        else if (towns && map.house[i]) c = HOUSE;
        else if (towns && map.road[i]) c = ROAD;
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

  /** Teren, zakłady (znaczniki w kolorach legendy), pociągi, nazwy miast i prostokąt widoku kamery. */
  private draw(state: GameState, view: Rect, opts: MinimapOptions): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { u0, v0, span } = this.win;
    const px = (m: { u: number; v: number }) => ({ x: ((m.u - u0) / span) * cw, y: ((m.v - v0) / span) * ch });
    const tile = (x: number, y: number) => px(tileToMinimap(state, x, y));
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.base, 0, 0);

    // Zakłady: obrys terenu zakładu, a gdy za mały – kwadracik (widać je nawet na całej dużej mapie).
    for (const ind of state.industries) {
      if (opts.filters.industries[ind.type] === false) continue;
      const [w, h] = industryDef(ind.type)!.size;
      const pts = [tile(ind.x, ind.y), tile(ind.x + w, ind.y), tile(ind.x + w, ind.y + h), tile(ind.x, ind.y + h)];
      const c = tile(ind.x + w / 2, ind.y + h / 2);
      if (c.x < -10 || c.y < -10 || c.x > cw + 10 || c.y > ch + 10) continue;
      ctx.fillStyle = industryColor(ind.type);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      const size = Math.max(Math.abs(pts[1]!.x - pts[3]!.x), Math.abs(pts[2]!.y - pts[0]!.y));
      if (size < 6) {
        ctx.fillRect(Math.round(c.x) - 3, Math.round(c.y) - 3, 6, 6);
        ctx.strokeRect(Math.round(c.x) - 3.5, Math.round(c.y) - 3.5, 7, 7);
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    if (opts.filters.trains) {
      ctx.fillStyle = '#ffe066';
      for (const t of state.trains) {
        if (t.status === 'depot' || !t.trail.length) continue;
        const p = pointBehindHead(t, 0);
        if (!p) continue;
        const s = tile(p.x, p.y);
        ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 2, 4, 4);
      }
    }

    if (opts.labels && opts.filters.towns) {
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'center';
      for (const town of state.towns) {
        const s = tile(town.x + 0.5, town.y + 0.5);
        if (s.x < 0 || s.y < 0 || s.x > cw || s.y > ch) continue;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(town.name, s.x, s.y - 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(town.name, s.x, s.y - 4);
      }
    }

    const a = px(worldToMinimap(state, view.x, view.y));
    const b = px(worldToMinimap(state, view.x + view.w, view.y + view.h));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.max(4, b.x - a.x), Math.max(3, b.y - a.y));
  }
}
