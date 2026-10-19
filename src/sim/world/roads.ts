import type { SimEvent } from '../commands';
import { isStreet, TOWN_EXTENT, type Town } from '../economy/town';
import type { GameState } from '../state';
import { isFlat } from './height';
import { hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from './map';

/**
 * Drogi w miastach – na ulicach (co czwarty rząd i kolumna od rynku) obok domów. Miasto buduje je
 * samo przy wzroście. Drogi są dekoracją i tłem dla ruchu aut; nie wpływają na przewozy.
 */
export function canHaveRoad(map: WorldMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  if (map.terrain[i] === Terrain.Water || !isFlat(map, x, y)) return false;
  // Miasto nie buduje dróg przez tory, perony, zajezdnie, budynki ani mosty/tunele.
  return !map.track[i] && !map.station[i] && !map.depot[i] && !hasBuilding(map, i) && !map.bridge[i] && !map.tunnel[i];
}

/** Sąsiaduje (także po skosie) z domem tego miasta. */
function nextToHouse(map: WorldMap, x: number, y: number, townId: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && inBounds(map, x + dx, y + dy) && map.town[(y + dy) * map.width + x + dx] === townId) return true;
    }
  }
  return false;
}

/** Dokłada drogi na ulicach obok domów miasta (w okolicy rynku). */
export function updateTownRoads(state: GameState, town: Town, events?: SimEvent[]): void {
  const { map } = state;
  for (let y = Math.max(0, town.y - TOWN_EXTENT); y <= Math.min(map.height - 1, town.y + TOWN_EXTENT); y++) {
    for (let x = Math.max(0, town.x - TOWN_EXTENT); x <= Math.min(map.width - 1, town.x + TOWN_EXTENT); x++) {
      const i = y * map.width + x;
      if (map.road[i] || !isStreet(town, x, y) || !canHaveRoad(map, x, y) || !nextToHouse(map, x, y, town.id)) continue;
      map.road[i] = 1;
      if (map.terrain[i] === Terrain.Rough) setTerrain(map, x, y, Terrain.Grass);
      events?.push({ type: 'tileChanged', x, y });
    }
  }
}
