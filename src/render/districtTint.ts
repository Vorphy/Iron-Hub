import { districtIndexAt, forEachTownTile, TOWN_EXTENT, type Town } from '../sim/economy/town';
import type { GameState } from '../sim/state';
import type { WorldMap } from '../sim/world/map';

/** Kolory dzielnic; bez niebieskiego zasięgu stacji (0x4cc9f0). */
// biome-ignore format: zwarta paleta
const COLORS = [
  0xffd166, 0xf4845f, 0x90be6d, 0xb197fc, 0xff8fab, 0x5fd3c8, 0xc77dff, 0xff5d5d,
  0xc5f277, 0x7aa2ff, 0xc08552, 0x9ef0c9, 0xff4fd8, 0xf1f1f1, 0xe9a03b, 0x5fae7f,
];
/** Dzielnice o środkach bliżej niż tyle kafelków (w kwadracie) mogą się stykać – dostają różne kolory. */
const NEIGHBOUR_REACH = 2 * TOWN_EXTENT + 2;

/**
 * Kolor każdej dzielnicy (miasta z co najmniej dwiema): pierwszy z palety, którego nie ma żadna wcześniejsza
 * sąsiednia dzielnica – także z innego miasta. Kolejność stała (miasta, potem dzielnice), więc dołożenie
 * nowej dzielnicy nie przemalowuje starszych.
 */
export function districtColors(towns: readonly Town[]): Map<Town, number[]> {
  const placed: { x: number; y: number; color: number }[] = [];
  const out = new Map<Town, number[]>();
  for (const town of towns) {
    if (town.districts.length < 2) continue;
    out.set(
      town,
      town.districts.map((d) => {
        const used = new Set(
          placed
            .filter((p) => Math.abs(p.x - d.x) <= NEIGHBOUR_REACH && Math.abs(p.y - d.y) <= NEIGHBOUR_REACH)
            .map((p) => p.color),
        );
        const free = COLORS.findIndex((c) => !used.has(c));
        const color = COLORS[free >= 0 ? free : placed.length % COLORS.length]!;
        placed.push({ x: d.x, y: d.y, color });
        return color;
      }),
    );
  }
  return out;
}
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
  private shown = false;
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
      for (const [town, colors] of districtColors(state.towns)) {
        forEachTownTile(map, town, TOWN_EXTENT, (x, y, i) => {
          if (map.town[i] !== town.id && !(map.road[i] && roadOfTown(map, x, y, town.id))) return;
          next.set(i, colors[districtIndexAt(town, x, y)]!);
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
