import type { SimEvent } from '../commands';
import { districtIndexAt, forEachTownTile, isStreet, TOWN_EXTENT, type Town } from '../economy/town';
import type { GameState } from '../state';
import { Track } from '../track/track';
import { isFlat } from './height';
import { hasBuilding, inBounds, setTerrain, Terrain, type WorldMap } from './map';

/**
 * Drogi w miastach – na ulicach (co czwarty rząd i kolumna od rynku) obok domów. Miasto buduje je
 * samo przy wzroście, także przez proste tory poprzeczne do ulicy (przejazdy). Drogi są dekoracją
 * i tłem dla ruchu aut; nie wpływają na przewozy ani na ruch pociągów.
 */
export function canHaveRoad(map: WorldMap, x: number, y: number, town?: Town): boolean {
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  if (map.terrain[i] === Terrain.Water || !isFlat(map, x, y)) return false;
  // Miasto nie buduje dróg przez perony, zajezdnie, budynki ani mosty/tunele.
  if (map.station[i] || map.depot[i] || hasBuilding(map, i) || map.bridge[i] || map.tunnel[i] || map.ramp[i]) return false;
  const bits = map.track[i]!;
  return bits === 0 || (!!town && bits === crossingTrack(town, x, y));
}

/**
 * Przejazd kolejowo-drogowy: tor, przez który ulica może przejść – prosty i poprzeczny do ulicy
 * (ulica w rzędzie biegnie wzdłuż osi X, więc tor w osi Y, i odwrotnie). Na skrzyżowaniu ulic – brak.
 * Pociągi mają pierwszeństwo: auta są tylko dekoracją i nie zatrzymują pociągów.
 */
export function crossingTrack(town: Town, x: number, y: number): number {
  const d = town.districts[districtIndexAt(town, x, y)]!;
  const row = (y - d.y) % 4 === 0;
  const column = (x - d.x) % 4 === 0;
  if (row === column) return 0;
  return row ? Track.Y : Track.X;
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

/** Dokłada drogi na ulicach obok domów miasta (w obszarze dzielnic). */
export function updateTownRoads(state: GameState, town: Town, events?: SimEvent[]): void {
  const { map } = state;
  forEachTownTile(map, town, TOWN_EXTENT, (x, y, i) => {
    if (map.road[i] || !isStreet(town, x, y) || !canHaveRoad(map, x, y, town) || !nextToHouse(map, x, y, town.id)) return;
    map.road[i] = 1;
    if (map.terrain[i] === Terrain.Rough) setTerrain(map, x, y, Terrain.Grass);
    events?.push({ type: 'tileChanged', x, y });
  });
}
