import type { Graphics } from 'pixi.js';
import type { GameState } from '../../sim/state';
import { bridgeTileCoords, headSpanSide, type Bridge } from '../../sim/track/bridge';
import { Side } from '../../sim/track/track';
import { portalInnerSide, type Tunnel } from '../../sim/track/tunnel';
import { heightAt } from '../../sim/world/height';
import type { WorldMap } from '../../sim/world/map';
import { HEIGHT_PX, toWorld } from '../iso';
import { drawSprite, gfxData } from './gfx';
import { tileSlope } from './tiles';

/** Przyczółki w tabeli OpenTTD są w kolejności kierunków SW, SE, NE, NW. */
const RAMP_OFFSET: Record<Side, number> = { [Side.NE]: 2, [Side.SE]: 1, [Side.SW]: 0, [Side.NW]: 3 };
/** Pomost rysowany 3 px poniżej wysokości mostu (BRIDGE_Z_START). */
const BRIDGE_Z_START = 3 / HEIGHT_PX;

/**
 * Most kratownicowy jak w OpenTTD (DrawBridgeMiddle, przyczółki z DrawTile_TunnelBridge):
 * przyczółki z rampą i torem, na przęsłach spód z torem, filary do ziemi i barierka od strony widza.
 */
export function drawBridgeSprites(g: Graphics, state: GameState, b: Bridge): void {
  const { map } = state;
  const { bridge } = gfxData();
  const tiles = bridgeTileCoords(b);
  for (const role of ['headA', 'headB'] as const) {
    const t = role === 'headA' ? tiles[0]! : tiles[tiles.length - 1]!;
    const { slope, z } = tileSlope(map, t.x, t.y);
    const o = toWorld(t.x, t.y, z);
    drawSprite(g, bridge.heads[RAMP_OFFSET[headSpanSide(b, role)] + (slope === 0 ? 4 : 0)]!, o.x, o.y);
  }
  // Oś x u nas to oś Y OpenTTD (druga trójka sprite'ów).
  const [floor, front, pillar] = bridge.middle[b.axis === 'x' ? 1 : 0]!;
  const z = b.deck - BRIDGE_Z_START;
  // Przód (barierka, filar przedni) przesunięty o 12/16 kafelka w stronę widza; filar tylny o 3/16.
  const [fdx, fdy] = b.axis === 'x' ? [0, 12 / 16] : [12 / 16, 0];
  const [bdx, bdy] = b.axis === 'x' ? [0, 3 / 16] : [3 / 16, 0];
  for (const t of tiles.slice(1, -1)) {
    const blocked = map.track[t.y * map.width + t.x] !== 0;
    if (!blocked) {
      drawPillar(g, map, pillar!, t.x + bdx, t.y + bdy, z - 2);
      drawPillar(g, map, pillar!, t.x + fdx, t.y + fdy, z);
    }
    const o = toWorld(t.x, t.y, z);
    drawSprite(g, floor!, o.x, o.y);
    const f = toWorld(t.x + fdx, t.y + fdy, z);
    drawSprite(g, front!, f.x, f.y);
  }
}

/** Kolumna filara od wysokości `top` w dół, co poziom terenu, póki nad ziemią. */
function drawPillar(g: Graphics, map: WorldMap, id: number, fx: number, fy: number, top: number): void {
  const ground = heightAt(map, fx, fy);
  for (let z = top; z >= ground - 0.01; z -= 1) {
    const p = toWorld(fx, fy, z);
    drawSprite(g, id, p.x, p.y);
  }
}

/** Wjazd do tunelu: grunt z torem w zboczu i sklepienie portalu (SPR_TUNNEL_ENTRY_REAR_RAIL + kierunek). */
export function drawTunnelPortal(
  g: Graphics,
  objects: Graphics,
  map: WorldMap,
  x: number,
  y: number,
  t: Tunnel,
  role: 'portalA' | 'portalB',
): void {
  const { z } = tileSlope(map, x, y);
  const o = toWorld(x, y, z);
  const image = 2365 + portalInnerSide(t, role) * 2;
  drawSprite(g, image, o.x, o.y);
  drawSprite(objects, image + 1, o.x, o.y);
}
