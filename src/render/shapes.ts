import type { Graphics } from 'pixi.js';
import { tileToWorld, type Point } from './iso';

export interface BoxColors {
  /** Ściana od strony SW (lewa, jaśniejsza). */
  left: number;
  /** Ściana od strony SE (prawa, ciemniejsza). */
  right: number;
  roof: number;
}

const poly = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

/**
 * Prostopadłościan na prostokącie (x0, y0)–(x1, y1) w układzie logicznym, wysokości `h` px.
 * Widoczne: dwie przednie ściany i dach. Zwraca narożniki dachu (góra, prawo, dół, lewo).
 */
export function drawBox(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  c: BoxColors,
  alpha = 1,
): Point[] {
  const a = tileToWorld(x0, y0);
  const b = tileToWorld(x1, y0);
  const cc = tileToWorld(x1, y1);
  const d = tileToWorld(x0, y1);
  const up = (p: Point): Point => ({ x: p.x, y: p.y - h });
  g.poly(poly([b, cc, up(cc), up(b)])).fill({ color: c.right, alpha });
  g.poly(poly([cc, d, up(d), up(cc)])).fill({ color: c.left, alpha });
  const roof = [up(a), up(b), up(cc), up(d)];
  g.poly(poly(roof)).fill({ color: c.roof, alpha }).stroke({ width: 1, color: 0x000000, alpha: 0.3 * alpha });
  return roof;
}

/** Dach dwuspadowy nad prostokątem (kalenica wzdłuż osi x). */
export function drawGableRoof(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  ridge: number,
  color: number,
  dark: number,
): void {
  const ym = (y0 + y1) / 2;
  const at = (x: number, y: number, z: number): Point => {
    const p = tileToWorld(x, y);
    return { x: p.x, y: p.y - z };
  };
  // Od tyłu do przodu: połać tylna, szczyt boczny (SE), połać przednia (SW).
  g.poly(poly([at(x0, y0, h), at(x1, y0, h), at(x1, ym, h + ridge), at(x0, ym, h + ridge)])).fill(dark);
  g.poly(poly([at(x1, y0, h), at(x1, y1, h), at(x1, ym, h + ridge)])).fill(dark);
  g.poly(poly([at(x0, y1, h), at(x1, y1, h), at(x1, ym, h + ridge), at(x0, ym, h + ridge)])).fill(color);
}

/** Komin: cienki walec (prostokąt) od podstawy w punkcie logicznym. */
export function drawChimney(g: Graphics, lx: number, ly: number, base: number, h: number, w: number, color: number): void {
  const p = tileToWorld(lx, ly);
  g.rect(p.x - w / 2, p.y - base - h, w, h).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  g.ellipse(p.x, p.y - base - h, w / 2, w / 4).fill(0x1b1b1b);
}

/** Hałda / sterta: elipsa z cieniem. */
export function drawPile(g: Graphics, lx: number, ly: number, r: number, color: number): void {
  const p = tileToWorld(lx, ly);
  g.ellipse(p.x, p.y, r * 1.4, r * 0.7).fill(darken(color, 0.6));
  g.ellipse(p.x, p.y - r * 0.35, r * 1.1, r * 0.6).fill(color);
}

export function drawTree(g: Graphics, lx: number, ly: number, size: number, color: number): void {
  const p = tileToWorld(lx, ly);
  g.rect(p.x - 1, p.y - size * 0.5, 2, size * 0.5).fill(0x5b3f26);
  g.circle(p.x, p.y - size * 0.8, size * 0.45).fill(color);
  g.circle(p.x - size * 0.15, p.y - size * 0.9, size * 0.2).fill(lighten(color, 1.25));
}

export function darken(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 255) * k);
  const g = Math.round(((color >> 8) & 255) * k);
  const b = Math.round((color & 255) * k);
  return (r << 16) | (g << 8) | b;
}

export function lighten(color: number, k: number): number {
  const c = (v: number) => Math.min(255, Math.round(v * k));
  return (c((color >> 16) & 255) << 16) | (c((color >> 8) & 255) << 8) | c(color & 255);
}
