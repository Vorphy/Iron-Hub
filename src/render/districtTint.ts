import { Container, Graphics } from 'pixi.js';
import { districtIndexAt, forEachTownTile, TOWN_EXTENT } from '../sim/economy/town';
import type { GameState } from '../sim/state';
import type { WorldMap } from '../sim/world/map';
import { tileDiamond } from './iso';

/** Kolory dzielnic (kolejne w mieście); bez niebieskiego zasięgu stacji. */
const COLORS = [0xffd166, 0xf4845f, 0x90be6d, 0xb197fc, 0xff8fab, 0x5fd3c8, 0xe9c46a, 0xc77dff];
const ALPHA = 0.6;
/** Najczęściej co tyle ms – przy szybkiej grze zmiany kafelków przychodzą w każdej klatce. */
const MIN_REDRAW_MS = 250;

/** Ulica należy do miasta, gdy stoi przy jego domu (także po skosie). */
function roadOfTown(map: WorldMap, x: number, y: number, townId: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && map.town[ny * map.width + nx] === townId) return true;
    }
  }
  return false;
}

/**
 * Lekkie zabarwienie dzielnic (I): domy i ulice miast z co najmniej dwiema dzielnicami, każda dzielnica
 * swoim kolorem. Rysowane od nowa tylko po zmianie (`markDirty`), najwyżej co `MIN_REDRAW_MS`,
 * do nowej grafiki podmienianej w całości (bez czyszczenia tej, która jest na ekranie).
 */
export class DistrictTint {
  readonly gfx = new Container();
  private dirty = true;
  private lastDraw = -Infinity;

  get visible(): boolean {
    return this.gfx.visible;
  }

  set visible(on: boolean) {
    this.gfx.visible = on;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(state: GameState): void {
    if (!this.dirty || !this.gfx.visible) return;
    const now = performance.now();
    if (now - this.lastDraw < MIN_REDRAW_MS) return;
    this.lastDraw = now;
    this.dirty = false;
    const g = new Graphics();
    const { map } = state;
    for (const town of state.towns) {
      if (town.districts.length < 2) continue;
      const tiles: [number, number][][] = town.districts.map(() => []);
      forEachTownTile(map, town, TOWN_EXTENT, (x, y, i) => {
        if (map.town[i] !== town.id && !(map.road[i] && roadOfTown(map, x, y, town.id))) return;
        tiles[districtIndexAt(town, x, y)]!.push([x, y]);
      });
      tiles.forEach((list, k) => {
        if (!list.length) return;
        for (const [x, y] of list) g.poly(tileDiamond(x, y));
        g.fill({ color: COLORS[k % COLORS.length]!, alpha: ALPHA });
      });
    }
    for (const old of this.gfx.removeChildren()) old.destroy();
    this.gfx.addChild(g);
  }
}
