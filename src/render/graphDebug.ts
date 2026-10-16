import { Graphics } from 'pixi.js';
import type { Port, TrackGraph } from '../sim/track/graph';
import { Side, TRACK_SIDES, type TrackPiece } from '../sim/track/track';
import { tileToWorld, type Point } from './iso';

const EDGE_COLORS = [0x4cc9f0, 0xf72585, 0xb5e48c, 0xffb703, 0x9d4edd, 0x06d6a0, 0xff6b35, 0xff9ff3];
const DEAD_END = 0xe0503a;
const SWITCH = 0xffe066;
const PASS = 0x4cc9f0;

const SIDE_MID: Record<Side, readonly [number, number]> = {
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

/** Podgląd grafu torów (klawisz G): krawędzie w kolorach, węzły jako kropki. */
export class GraphDebug {
  readonly gfx = new Graphics();

  constructor() {
    this.gfx.visible = false;
  }

  get visible(): boolean {
    return this.gfx.visible;
  }

  set visible(v: boolean) {
    this.gfx.visible = v;
  }

  draw(graph: TrackGraph): void {
    const g = this.gfx;
    g.clear();
    for (const edge of graph.edges) {
      const pts = edge.pieces.map(pieceCenter);
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      if (pts.length === 1) g.circle(pts[0]!.x, pts[0]!.y, 3);
      g.stroke({ width: 4, color: EDGE_COLORS[edge.id % EDGE_COLORS.length]!, alpha: 0.9 });
    }
    for (const node of graph.nodes) {
      const p = portCenter(node.port);
      const degree = node.halves[0].length + node.halves[1].length;
      const color = degree === 1 ? DEAD_END : degree > 2 ? SWITCH : PASS;
      g.circle(p.x, p.y, 5).fill(color).stroke({ width: 1.5, color: 0x000000 });
    }
  }
}

function pieceCenter(p: TrackPiece): Point {
  const [a, b] = TRACK_SIDES[p.track];
  const [ax, ay] = SIDE_MID[a];
  const [bx, by] = SIDE_MID[b];
  return tileToWorld(p.x + (ax + bx) / 2, p.y + (ay + by) / 2);
}

function portCenter(port: Port): Point {
  const [mx, my] = SIDE_MID[port.side];
  return tileToWorld(port.x + mx, port.y + my);
}
