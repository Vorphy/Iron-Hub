import { Graphics } from 'pixi.js';
import type { GameState } from '../sim/state';
import { sideHeight } from '../sim/track/bridge';
import { oppositeSide } from '../sim/track/track';
import { portalInnerSide, tunnelTileCoords, type Tunnel } from '../sim/track/tunnel';
import { toWorld, type Point } from './iso';
import { drawTrackSegment, SIDE_MID, TRACK_STYLE } from './trackDraw';

const STONE = 0x8d877c;
const STONE_DARK = 0x6a655d;
const MOUTH = 0x141210;
const HALF = 0.34;

const poly = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

/** Wejścia do tuneli: tor wjeżdżający w zbocze i kamienny portal z ciemnym otworem. */
export class TunnelRenderer {
  readonly gfx = new Graphics();

  draw(state: GameState): void {
    const g = this.gfx;
    g.clear();
    for (const t of state.tunnels) drawPortals(g, state, t);
  }
}

function drawPortals(g: Graphics, state: GameState, t: Tunnel): void {
  const tiles = tunnelTileCoords(t);
  // Prostopadła do osi tunelu.
  const [nx, ny] = t.axis === 'x' ? [0, 1] : [1, 0];
  for (const role of ['portalA', 'portalB'] as const) {
    const p = role === 'portalA' ? tiles[0]! : tiles[tiles.length - 1]!;
    const inner = portalInnerSide(t, role);
    const outer = oppositeSide(inner);
    const [ix, iy] = SIDE_MID[inner];
    const [ox, oy] = SIDE_MID[outer];
    const top = sideHeight(state.map, p.x, p.y, inner);
    // Tor na poziomie tunelu, od dolnej krawędzi do ściany portalu.
    drawTrackSegment(g, p.x + ox, p.y + oy, p.x + ix, p.y + iy, TRACK_STYLE, () => t.level);
    // Ściana portalu w płaszczyźnie wewnętrznej krawędzi: obudowa i otwór.
    const at = (k: number, z: number) => toWorld(p.x + ix + nx * k, p.y + iy + ny * k, z);
    const wallTop = Math.max(top, t.level + 1.2);
    g.poly(poly([at(-HALF - 0.08, t.level), at(HALF + 0.08, t.level), at(HALF + 0.08, wallTop), at(-HALF - 0.08, wallTop)])).fill(STONE);
    // Otwór: prostokąt z łukiem (przybliżony kilkoma punktami).
    const arch: Point[] = [at(-HALF + 0.05, t.level), at(HALF - 0.05, t.level)];
    for (let a = 0; a <= 8; a++) {
      const ang = (a / 8) * Math.PI;
      arch.push(at(Math.cos(ang) * (HALF - 0.05), t.level + 0.75 + Math.sin(ang) * 0.35));
    }
    g.poly(poly(arch)).fill(MOUTH);
    g.poly(poly([at(-HALF - 0.08, wallTop), at(HALF + 0.08, wallTop), at(HALF + 0.08, wallTop + 0.15), at(-HALF - 0.08, wallTop + 0.15)])).fill(
      STONE_DARK,
    );
  }
}
