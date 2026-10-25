import { Container, Graphics } from 'pixi.js';
import { MAX_HEIGHT } from '../sim/world/height';
import type { Rect } from './camera';
import { HEIGHT_PX, tileToWorldFlat } from './iso';
import { industryDef, type Industry } from '../sim/economy/industry';
import { darken, drawBox, drawChimney, drawGableRoof, drawPile, drawTree, lighten, tileHash } from './shapes';
import { inBounds, type WorldMap } from '../sim/world/map';
import { gfxOn } from './gfx/gfx';
import { buildingsHidden } from './visibility';
import { drawHouseBuilding, drawIndustryBuilding, drawIndustryTiles, drawStationFront, drawTrees, tileTrees } from './gfx/tiles';
import type { GameState } from '../sim/state';

// Placeholder – proste bryły do czasu podpięcia grafiki.
const WALLS = [0xe8dcc0, 0xd9b38c, 0xc9c2b8, 0xe0c9a6];
const ROOFS = [0xa0412d, 0x7a4a2e, 0x8a3b2a, 0x6b4a3a];

/** Dom w mieście; wysokość rośnie z poziomem, poziom 4 – kamienica z płaskim dachem. */
export function drawHouse(g: Graphics, x: number, y: number, level: number, hash: number): void {
  const inset = 0.16 + ((hash >>> 3) & 3) * 0.02;
  const wall = WALLS[hash & 3]!;
  const h = 6 + level * 6;
  const box = { left: wall, right: darken(wall, 0.78), roof: level >= 4 ? 0x8f9196 : wall };
  drawBox(g, x + inset, y + inset, x + 1 - inset, y + 1 - inset, h, box);
  if (level < 4) {
    const roof = ROOFS[(hash >>> 5) & 3]!;
    drawGableRoof(g, x + inset, y + inset, x + 1 - inset, y + 1 - inset, h, 7, roof, darken(roof, 0.75));
  }
}

/** Głębokość domu do sortowania z pojazdami (środek kafelka, x + y). */
export const houseDepth = (map: WorldMap, i: number) => (i % map.width) + Math.floor(i / map.width) + 1;

/**
 * Domy (a z grafiką OpenGFX także perony i drzewa), które na ekranie mogą zasłaniać punkt (fx, fy):
 * leżą przed nim (większe x + y) i blisko w poziomie. Pojazdy są rysowane nad mapą, więc takie
 * obiekty dorysowujemy jeszcze raz przed nimi.
 */
export function housesInFront(state: GameState, fx: number, fy: number, out: Set<number>): void {
  if (buildingsHidden()) return;
  const { map } = state;
  const sprites = gfxOn();
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  // Z grafiką OpenGFX dalej: chłodnie elektrowni i kominy huty zasłaniają kilka kafelków za sobą.
  const reach = sprites ? 4 : 3;
  for (let dy = 0; dy <= reach; dy++) {
    for (let dx = 0; dx <= reach; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(map, x, y)) continue;
      const i = y * map.width + x;
      if (x + y + 1 <= fx + fy) continue;
      if (map.house[i] || (sprites && (map.station[i] || map.industry[i] || tileTrees(map, x, y)))) out.add(i);
    }
  }
}

/** Dorysowuje obiekty kafelka zasłaniające pojazd: dom, przód peronu z zadaszeniem albo drzewa. */
export function redrawHouse(g: Graphics, state: GameState, i: number): void {
  const { map } = state;
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  if (!gfxOn()) {
    if (map.house[i]) drawHouse(g, x, y, map.house[i]!, tileHash(x, y));
    return;
  }
  if (map.house[i]) return drawHouseBuilding(g, map, x, y, map.house[i]!);
  if (map.industry[i]) {
    const ind = state.industries.find((d) => d.id === map.industry[i]);
    if (ind) drawIndustryBuilding(g, map, ind.x, ind.y, ind.type, x, y);
    return;
  }
  if (map.station[i]) {
    const station = state.stations.find((s) => s.id === map.station[i]);
    if (station && !station.waypoint) drawStationFront(g, map, x, y, station);
    return;
  }
  const trees = tileTrees(map, x, y);
  if (trees) drawTrees(g, map, x, y, trees);
}

/** Wszystkie zakłady w jednej warstwie (jest ich kilkanaście – rysowane raz, odświeżane po zmianach). */
export class IndustryRenderer {
  /** Kontener do dodania do świata (każdy zakład to osobna grafika – ukrywana poza ekranem). */
  readonly gfx = new Container();
  private items: { g: Graphics; bounds: Rect }[] = [];

  draw(industries: readonly Industry[], map: WorldMap): void {
    for (const child of this.gfx.removeChildren()) child.destroy({ context: true });
    this.items = [];
    // Od tyłu do przodu (mniejsze x + y wcześniej).
    for (const ind of [...industries].sort((a, b) => a.x + a.y - (b.x + b.y))) {
      const g = new Graphics();
      if (!gfxOn() || !drawIndustryTiles(g, map, ind.x, ind.y, ind.type)) {
        if (!buildingsHidden()) drawIndustry(g, ind);
      }
      const [w, h] = industryDef(ind.type)!.size;
      const left = tileToWorldFlat(ind.x, ind.y + h).x;
      const right = tileToWorldFlat(ind.x + w, ind.y).x;
      const top = tileToWorldFlat(ind.x, ind.y).y - (MAX_HEIGHT * HEIGHT_PX + 80);
      const bottom = tileToWorldFlat(ind.x + w, ind.y + h).y;
      this.items.push({ g, bounds: { x: left, y: top, w: right - left, h: bottom - top } });
      this.gfx.addChild(g);
    }
  }

  cull(view: Rect): void {
    for (const { g, bounds: b } of this.items) {
      g.visible = b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y;
    }
  }
}

function drawIndustry(g: Graphics, ind: Industry): void {
  const def = industryDef(ind.type)!;
  const [w, h] = def.size;
  const { x, y } = ind;
  const color = parseInt(def.color.slice(1), 16);
  const ground = { left: 0x77736b, right: 0x6a665f, roof: 0x8a857c };

  switch (ind.type) {
    case 'forest': {
      // Drzewa w siatce z lekkim przesunięciem.
      for (let i = 0; i < w * 3; i++) {
        for (let j = 0; j < h * 3; j++) {
          const jx = ((i * 7 + j * 13) % 5) / 20;
          const jy = ((i * 11 + j * 3) % 5) / 20;
          drawTree(
            g,
            x + (i + 0.5) / 3 + jx - 0.1,
            y + (j + 0.5) / 3 + jy - 0.1,
            10 + ((i + j) % 3) * 2,
            i % 2 ? color : lighten(color, 1.15),
          );
        }
      }
      return;
    }
    case 'coal_mine':
    case 'ore_mine': {
      drawBox(g, x + 0.1, y + 0.1, x + w - 0.1, y + h - 0.1, 2, ground);
      drawBox(g, x + 0.3, y + 0.3, x + 1.6, y + 1.4, 18, { left: 0x9c9a92, right: 0x7f7d76, roof: 0x5a5d63 });
      // Szyb wydobywczy (wieża).
      drawBox(g, x + 1.9, y + 0.4, x + 2.4, y + 0.9, 34, { left: 0x5a5d63, right: 0x44474c, roof: 0x2f3236 });
      drawPile(g, x + 1.3, y + 2.3, 11, color);
      drawPile(g, x + 2.4, y + 2.1, 8, color);
      return;
    }
    case 'power_plant': {
      drawBox(g, x + 0.2, y + 0.2, x + w - 0.2, y + h - 0.2, 2, ground);
      drawBox(g, x + 0.3, y + 1.2, x + 2.7, y + 2.7, 22, { left: color, right: darken(color, 0.78), roof: darken(color, 0.9) });
      drawChimney(g, x + 0.9, y + 0.7, 0, 52, 7, 0xb0b3b8);
      drawChimney(g, x + 2.0, y + 0.7, 0, 52, 7, 0xb0b3b8);
      return;
    }
    case 'steel_mill': {
      drawBox(g, x + 0.1, y + 0.1, x + w - 0.1, y + h - 0.1, 2, ground);
      drawBox(g, x + 0.3, y + 0.4, x + 3.7, y + 1.8, 24, { left: color, right: darken(color, 0.75), roof: 0x4a4f57 });
      drawChimney(g, x + 3.2, y + 2.4, 0, 46, 6, 0x8d6e63);
      drawChimney(g, x + 2.4, y + 2.4, 0, 40, 6, 0x8d6e63);
      drawPile(g, x + 0.9, y + 2.4, 9, 0x8a5a3c);
      return;
    }
    case 'sawmill': {
      drawBox(g, x + 0.1, y + 0.1, x + w - 0.1, y + h - 0.1, 2, ground);
      drawBox(g, x + 0.3, y + 0.3, x + 2.2, y + 1.5, 16, { left: color, right: darken(color, 0.78), roof: color });
      drawGableRoof(g, x + 0.3, y + 0.3, x + 2.2, y + 1.5, 16, 9, 0x6b4a3a, 0x4f3528);
      // Sterty drewna.
      for (const [dx, dy] of [
        [0.8, 2.2],
        [1.8, 2.3],
        [2.5, 1.2],
      ] as const) {
        drawBox(g, x + dx - 0.3, y + dy - 0.2, x + dx + 0.3, y + dy + 0.2, 7, {
          left: 0x8c7a5a,
          right: 0x6f5f45,
          roof: 0xa58f6a,
        });
      }
      return;
    }
    default:
      drawBox(g, x + 0.2, y + 0.2, x + w - 0.2, y + h - 0.2, 20, { left: color, right: darken(color, 0.78), roof: color });
  }
}
