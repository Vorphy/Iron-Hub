import { cornerHeights } from '../world/height';
import type { WorldMap } from '../world/map';
import { Side, Track, TRACK_SIDES, tracksOn } from './track';

/**
 * Fundament pod torem na zboczu (jak GetRailFoundation w OpenTTD, src/rail_cmd.cpp):
 * None – tor leży na terenie, Leveled – kafelek podniesiony do najwyższego narożnika (płaski),
 * Inclined – prosty tor na zboczu z jednym podniesionym narożnikiem, pochylony równo wzdłuż toru.
 * Strome zbocza (różnica 2 poziomów) – bez fundamentów.
 */
export const Foundation = { None: 0, Leveled: 1, Inclined: 2 } as const;
export type Foundation = (typeof Foundation)[keyof typeof Foundation];

/** Wysokości narożników [góra, prawo, dół, lewo] – jak `cornerHeights`. */
export type Corners = readonly [number, number, number, number];

/** Narożniki przy boku kafelka (indeksy w `Corners`). */
const SIDE_CORNERS: Readonly<Record<Side, readonly [number, number]>> = {
  [Side.NE]: [0, 1],
  [Side.SE]: [1, 2],
  [Side.SW]: [2, 3],
  [Side.NW]: [3, 0],
};

/**
 * Element toru leży na terenie bez fundamentu: na płaskim każdy, na zboczu w osi – prosty w górę
 * zbocza, ukos – gdy leży poziomo (oba końce na tej samej wysokości, np. na płaskiej połówce kafelka).
 */
export function fitsWithoutFoundation(c: Corners, track: Track): boolean {
  const [t, r, b, l] = c;
  const max = Math.max(t, r, b, l);
  const min = Math.min(t, r, b, l);
  if (max === min) return true;
  if (max - min > 1) return false;
  if (track === Track.X) return t === l && r === b;
  if (track === Track.Y) return t === r && b === l;
  if (track === Track.Upper || track === Track.Lower) return l === r;
  return t === b;
}

/** Fundament potrzebny pod elementami `bits` na zboczu `c`; null – nie da się ich tu zbudować. */
export function railFoundation(c: Corners, bits: number): Foundation | null {
  const tracks = tracksOn(bits);
  if (tracks.every((t) => fitsWithoutFoundation(c, t))) return Foundation.None;
  const max = Math.max(...c);
  const min = Math.min(...c);
  if (max - min > 1) return null;
  // Prosty tor na zboczu z jednym podniesionym narożnikiem – fundament pochyły.
  const raised = c.filter((h) => h === max).length;
  if (raised === 1 && (bits === Track.X || bits === Track.Y)) return Foundation.Inclined;
  // Fundament poziomy: każdy bok, do którego dochodzi tor, ma narożnik na górze –
  // inaczej tor kończyłby się uskokiem nad niższym sąsiadem.
  const ok = tracks.every((t) => TRACK_SIDES[t].every((side) => SIDE_CORNERS[side].some((k) => c[k] === max)));
  return ok ? Foundation.Leveled : null;
}

/** Narożniki powierzchni, po której biegnie tor (teren albo wierzch fundamentu). */
export function foundationCorners(c: Corners, bits: number): Corners {
  const f = railFoundation(c, bits);
  if (f === Foundation.Leveled) {
    const max = Math.max(...c);
    return [max, max, max, max];
  }
  if (f === Foundation.Inclined) {
    // Bok toru z podniesionym narożnikiem idzie w górę w całości, przeciwny zostaje na dole.
    const max = Math.max(...c);
    const min = Math.min(...c);
    const high = TRACK_SIDES[bits as Track].find((side) => SIDE_CORNERS[side].some((k) => c[k] === max))!;
    const out: [number, number, number, number] = [min, min, min, min];
    for (const k of SIDE_CORNERS[high]) out[k] = max;
    return out;
  }
  return c;
}

/** Fundament pod torami kafelka (None, gdy nie ma torów). */
export function tileFoundation(map: WorldMap, x: number, y: number): Foundation {
  return railFoundation(cornerHeights(map, x, y), map.track[y * map.width + x]!) ?? Foundation.None;
}

/** Narożniki powierzchni torów kafelka – po uwzględnieniu fundamentu. */
export function trackCorners(map: WorldMap, x: number, y: number): Corners {
  return foundationCorners(cornerHeights(map, x, y), map.track[y * map.width + x]!);
}

/** Wysokość powierzchni torów w punkcie kafelka (u, v w 0–1 wzdłuż osi x, y) – interpolacja jak `heightAt`. */
export function trackHeight(map: WorldMap, x: number, y: number, u: number, v: number): number {
  const [t, r, b, l] = trackCorners(map, x, y);
  return t * (1 - u) * (1 - v) + r * u * (1 - v) + b * u * v + l * (1 - u) * v;
}
