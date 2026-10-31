import { districtIndexAt, forEachTownTile, TOWN_EXTENT } from '../sim/economy/town';
import type { GameState } from '../sim/state';
import type { WorldMap } from '../sim/world/map';

/** Kolory dzielnic (kolejne w mieście); bez niebieskiego zasięgu stacji. */
const COLORS = [0xffd166, 0xf4845f, 0x90be6d, 0xb197fc, 0xff8fab, 0x5fd3c8, 0xe9c46a, 0xc77dff];
export const DISTRICT_TINT_ALPHA = 0.6;
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
 * Kolory dzielnic (I): grunt pod domami i ulice miast z co najmniej dwiema dzielnicami, każda dzielnica
 * swoim kolorem. Rysuje je renderer mapy w warstwie terenu (pod budynkami – kolor kafelka z tyłu nie
 * może wejść na dom z przodu); tu tylko liczymy kolor kafelków i zgłaszamy te, które się zmieniły.
 */
export class DistrictTint {
  private shown = true;
  private dirty = true;
  private lastDraw = -Infinity;
  /** Kolor kafelka albo −1. */
  private colors: Int32Array = new Int32Array(0);
  private colored: number[] = [];

  constructor(private readonly markTileDirty: (x: number, y: number) => void) {}

  get visible(): boolean {
    return this.shown;
  }

  set visible(on: boolean) {
    this.shown = on;
    this.dirty = true;
    this.lastDraw = -Infinity;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Kolor kafelka `i` (null – bez koloru). */
  tileColor(i: number): number | null {
    const c = this.colors[i];
    return c === undefined || c < 0 ? null : c;
  }

  update(state: GameState): void {
    if (!this.dirty) return;
    const now = performance.now();
    if (now - this.lastDraw < MIN_REDRAW_MS) return;
    this.lastDraw = now;
    this.dirty = false;
    const { map } = state;
    if (this.colors.length !== map.width * map.height) {
      this.colors = new Int32Array(map.width * map.height).fill(-1);
      this.colored = [];
    }
    const next = new Map<number, number>();
    if (this.shown) {
      for (const town of state.towns) {
        if (town.districts.length < 2) continue;
        forEachTownTile(map, town, TOWN_EXTENT, (x, y, i) => {
          if (map.town[i] !== town.id && !(map.road[i] && roadOfTown(map, x, y, town.id))) return;
          next.set(i, COLORS[districtIndexAt(town, x, y) % COLORS.length]!);
        });
      }
    }
    const changed = (i: number) => this.markTileDirty(i % map.width, Math.floor(i / map.width));
    for (const i of this.colored) {
      if (next.has(i)) continue;
      this.colors[i] = -1;
      changed(i);
    }
    for (const [i, c] of next) {
      if (this.colors[i] === c) continue;
      this.colors[i] = c;
      changed(i);
    }
    this.colored = [...next.keys()];
  }
}
