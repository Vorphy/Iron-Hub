import type { Graphics } from 'pixi.js';
import { Side, Track, TRACK_SIDES, tracksOn } from '../../sim/track/track';
import { heightAt } from '../../sim/world/height';
import { sideHeight } from '../../sim/track/bridge';
import type { WorldMap } from '../../sim/world/map';
import { HEIGHT_PX, toWorld } from '../iso';
import { drawSprite } from './gfx';
import { tileSlope } from './tiles';

/**
 * Sieć trakcyjna z grafiki OpenGFX – uproszczony algorytm z elrail.cpp OpenTTD: przewód nad każdym
 * elementem toru, słupy na krawędziach kafelka (PCP) po stronie wskazanej przez tabele OpenTTD,
 * na prostych co drugi kafelek. Sprite'y: CATENARY:0–27 przewody, 28–35 słupy.
 */

/** Przewód: [sprite (WireSpriteOffset), x, y w 1/16 kafelka (osie OpenTTD), wysokość nad torem w px]. */
type Wire = [number, number, number, number];
const ELEVATION = 10;
const ELEVRAISE = ELEVATION + HEIGHT_PX + 1;
const ELEVLOWER = ELEVATION - 1;

/** Przewody dla naszych elementów toru (nasze X = Y OpenTTD); zbocza: 'up' i 'down' wzdłuż osi. */
function wireFor(track: Track, slope: number): Wire | null {
  switch (track) {
    case Track.Y: // X OpenTTD: pod górę na zboczu SW (3), w dół na NE (12)
      return slope === 3 ? [6, 0, 7, ELEVRAISE] : slope === 12 ? [4, 0, 7, ELEVLOWER] : [0, 0, 7, ELEVATION];
    case Track.X: // Y OpenTTD: pod górę na SE (6), w dół na NW (9)
      return slope === 6 ? [5, 7, 0, ELEVRAISE] : slope === 9 ? [7, 7, 0, ELEVLOWER] : [1, 7, 0, ELEVATION];
    case Track.Upper:
      return [2, 7, 0, ELEVATION];
    case Track.Lower:
      return [2, 15, 8, ELEVATION];
    case Track.Left:
      return [3, 8, 0, ELEVATION];
    case Track.Right:
      return [3, 0, 8, ELEVATION];
  }
  return null;
}

// Kierunki OpenTTD: N=0, NE=1, E=2, SE=3, S=4, SW=5, W=6, NW=7.
const PPP_X = [-2, -4, -2, 0, 2, 4, 2, 0];
const PPP_Y = [-2, 0, 2, 4, 2, 0, -2, -4];
/** Rodzaj słupa (PylonSpriteOffset) dla kierunku jego położenia względem PCP. */
const PYLON_SPRITE = [4, 0, 7, 3, 5, 1, 6, 2];
/** Środki krawędzi kafelka (PCP) w 1/16 kafelka, osie OpenTTD. */
const PCP_X: Record<Side, number> = { [Side.NE]: 0, [Side.SE]: 8, [Side.SW]: 16, [Side.NW]: 8 };
const PCP_Y: Record<Side, number> = { [Side.NE]: 8, [Side.SE]: 16, [Side.SW]: 8, [Side.NW]: 0 };

/**
 * Kierunek słupa przy danym PCP dla elementu toru: prostopadle do toru, po stronie należącej
 * do tego kafelka (preferowane ∩ dozwolone ∩ „własne” PPP z elrail_data.h).
 */
const PYLON_DIR: Record<number, Partial<Record<Side, number>>> = {
  [Track.Y]: { [Side.NE]: 3, [Side.SW]: 7 },
  [Track.X]: { [Side.SE]: 5, [Side.NW]: 1 },
  [Track.Upper]: { [Side.NE]: 4, [Side.NW]: 4 },
  [Track.Lower]: { [Side.SE]: 0, [Side.SW]: 0 },
  [Track.Left]: { [Side.SW]: 2, [Side.NW]: 2 },
  [Track.Right]: { [Side.NE]: 6, [Side.SE]: 6 },
};

export function drawCatenarySprites(g: Graphics, map: WorldMap, x: number, y: number, bits: number): void {
  const { slope, z } = tileSlope(map, x, y);
  const at = (ox: number, oy: number, zz: number) => toWorld(x + oy / 16, y + ox / 16, zz);
  const done = new Set<Side>();
  for (const track of tracksOn(bits)) {
    const [a, b] = TRACK_SIDES[track];
    // Proste – słup co drugi kafelek, na krawędzi od strony mniejszych współrzędnych; ukosy – na przemian.
    let side: Side | null;
    if (track === Track.X) side = (x & 1) === 0 ? Side.NW : null;
    else if (track === Track.Y) side = (y & 1) === 0 ? Side.NE : null;
    else side = ((x + y) & 1) === 0 ? a : b;
    if (side === null || done.has(side)) continue;
    const dir = PYLON_DIR[track]?.[side];
    if (dir === undefined) continue;
    done.add(side);
    const px = PCP_X[side] + PPP_X[dir]!;
    const py = PCP_Y[side] + PPP_Y[dir]!;
    const p = at(px, py, heightAt(map, x + py / 16, y + px / 16));
    drawSprite(g, `CATENARY:${28 + PYLON_SPRITE[dir]!}`, p.x, p.y);
  }
  for (const track of tracksOn(bits)) {
    const w = wireFor(track, slope);
    if (!w) continue;
    // Ukos na zboczu leży na wysokości swoich końców.
    const base = slope !== 0 && track !== Track.X && track !== Track.Y ? sideHeight(map, x, y, TRACK_SIDES[track][0]) : z;
    const p = at(w[1], w[2], base + w[3] / HEIGHT_PX);
    drawSprite(g, `CATENARY:${w[0]}`, p.x, p.y);
  }
}
