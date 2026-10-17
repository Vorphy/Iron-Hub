import { Container, Graphics } from 'pixi.js';
import type { Depot } from '../sim/depot/depot';
import { getTrackBits, tracksOn } from '../sim/track/track';
import { getTerrain, Terrain, type WorldMap } from '../sim/world/map';
import type { Rect } from './camera';
import { cornerHeights, MAX_HEIGHT } from '../sim/world/height';
import { HEIGHT_PX, TILE_H, TILE_W, tileDiamond, tileToWorld, tileToWorldFlat } from './iso';
import { darken, lighten } from './shapes';
import { drawHouse } from './buildings';
import { drawDepot } from './depotDraw';
import { drawTrackPiece, TRACK_STYLE } from './trackDraw';

const CHUNK = 16;

// Placeholder – płaskie kolory do czasu podpięcia grafiki (OpenGFX).
const COLORS: Record<Terrain, number[]> = {
  [Terrain.Grass]: [0x5b8c3a, 0x5f913d, 0x578636, 0x62943f],
  [Terrain.Water]: [0x2e5f8f, 0x2f6293, 0x2c5c8b, 0x30648f],
  [Terrain.Rough]: [0x7a7346, 0x766f43, 0x7e7749, 0x736c41],
};
const ROUGH_DOT = 0x4f4a2b;
const PLATFORM = [0xa9a49b, 0xa5a097, 0xaca79e, 0xa29d94];
const PLATFORM_EDGE = 0x6d6860;

interface Chunk {
  gfx: Graphics;
  /** Tory w osobnej warstwie nad terenem – podsypka może lekko wychodzić poza kafelek. */
  tracks: Graphics;
  cx: number;
  cy: number;
  bounds: Rect;
}

/** Teren i tory rysowane w kawałkach 16×16 kafelków; niewidoczne kawałki są pomijane. */
export class MapRenderer {
  readonly container = new Container();
  private readonly terrainLayer = new Container();
  private readonly trackLayer = new Container();
  private readonly chunks: Chunk[] = [];
  private readonly chunksX: number;

  constructor(
    private readonly map: WorldMap,
    /** Zajezdnie czytane przy rysowaniu kafelka (tablica stanu może być podmieniana). */
    private readonly getDepots: () => readonly Depot[],
  ) {
    this.container.addChild(this.terrainLayer, this.trackLayer);
    this.chunksX = Math.ceil(map.width / CHUNK);
    const chunksY = Math.ceil(map.height / CHUNK);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const chunk: Chunk = { gfx: new Graphics(), tracks: new Graphics(), cx, cy, bounds: this.chunkBounds(cx, cy) };
        this.drawChunk(chunk);
        this.chunks.push(chunk);
      }
    }
    // Od tyłu do przodu (po przekątnej), żeby wyższy teren z przodu zasłaniał ten z tyłu.
    for (const c of [...this.chunks].sort((a, b) => a.cx + a.cy - (b.cx + b.cy) || a.cx - b.cx)) {
      this.terrainLayer.addChild(c.gfx);
      this.trackLayer.addChild(c.tracks);
    }
  }

  markTileDirty(x: number, y: number): void {
    const chunk = this.chunks[Math.floor(y / CHUNK) * this.chunksX + Math.floor(x / CHUNK)];
    if (chunk) this.drawChunk(chunk);
  }

  cull(view: Rect): void {
    for (const { gfx, tracks, bounds: b } of this.chunks) {
      gfx.visible = tracks.visible =
        b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y;
    }
  }

  private chunkBounds(cx: number, cy: number): Rect {
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const left = tileToWorldFlat(x0, y0 + CHUNK).x - TILE_W / 2;
    const right = tileToWorldFlat(x0 + CHUNK, y0).x + TILE_W / 2;
    // Teren i budynki mogą sięgać wyżej o maksymalną wysokość (+ zapas na kominy).
    const top = tileToWorldFlat(x0, y0).y - MAX_HEIGHT * HEIGHT_PX - 64;
    const bottom = tileToWorldFlat(x0 + CHUNK, y0 + CHUNK).y + TILE_H;
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  private drawChunk(chunk: Chunk): void {
    const g = chunk.gfx;
    g.clear();
    chunk.tracks.clear();
    const x0 = chunk.cx * CHUNK;
    const y0 = chunk.cy * CHUNK;
    const x1 = Math.min(x0 + CHUNK, this.map.width);
    const y1 = Math.min(y0 + CHUNK, this.map.height);
    // Po przekątnych x + y (od tyłu do przodu) – poprawne zasłanianie na wzgórzach.
    for (let d = x0 + y0; d <= x1 + y1 - 2; d++) {
      for (let x = Math.max(x0, d - y1 + 1); x <= Math.min(x1 - 1, d - y0); x++) {
        const y = d - x;
        const t = getTerrain(this.map, x, y);
        const h = tileHash(x, y);
        if (this.map.station[y * this.map.width + x]) {
          g.poly(tileDiamond(x, y)).fill(PLATFORM[h & 3]!).stroke({ width: 1, color: PLATFORM_EDGE, alpha: 0.6 });
        } else {
          drawTerrainTile(g, this.map, x, y, COLORS[t][h & 3]!);
          if (t === Terrain.Rough) drawRoughDots(g, x, y, h);
        }
        for (const track of tracksOn(getTrackBits(this.map, x, y))) drawTrackPiece(chunk.tracks, x, y, track, TRACK_STYLE);
        const house = this.map.house[y * this.map.width + x]!;
        if (house) drawHouse(chunk.tracks, x, y, house, h);
        const depotId = this.map.depot[y * this.map.width + x];
        if (depotId) {
          const depot = this.getDepots().find((d) => d.id === depotId);
          if (depot) drawDepot(chunk.tracks, x, y, depot.side);
        }
      }
    }
  }
}

function drawRoughDots(g: Graphics, x: number, y: number, h: number): void {
  for (let i = 0; i < 4; i++) {
    const fx = 0.2 + (((h >>> (i * 4)) & 15) / 15) * 0.6;
    const fy = 0.2 + (((h >>> (i * 4 + 16)) & 15) / 15) * 0.6;
    const p = tileToWorld(x + fx, y + fy);
    g.rect(p.x - 1.5, p.y - 1, 3, 2).fill(ROUGH_DOT);
  }
}

/**
 * Kafelek terenu jako dwa trójkąty z cieniowaniem: światło od strony NW (lewa góra ekranu).
 * Podział wzdłuż przekątnej łączącej narożniki o równej wysokości – grzbiety wyglądają poprawnie.
 */
function drawTerrainTile(g: Graphics, map: WorldMap, x: number, y: number, color: number): void {
  const [zt, zr, zb, zl] = cornerHeights(map, x, y);
  const [t, r, b, l] = [tileToWorld(x, y), tileToWorld(x + 1, y), tileToWorld(x + 1, y + 1), tileToWorld(x, y + 1)];
  const tri = (pts: { x: number; y: number }[], dzdx: number, dzdy: number) => {
    const shade = Math.min(1.3, Math.max(0.65, 1 + 0.16 * dzdx + 0.05 * dzdy));
    const c = shade >= 1 ? lighten(color, shade) : darken(color, shade);
    g.poly(pts.flatMap((p) => [p.x, p.y])).fill(c);
  };
  if (zt === zr && zr === zb && zb === zl) {
    g.poly(tileDiamond(x, y)).fill(color).stroke({ width: 1, color: 0x000000, alpha: 0.08 });
    return;
  }
  if (zl === zr || zt !== zb) {
    // Podział lewo–prawo: trójkąt górny (t, r, l) i dolny (l, r, b).
    tri([t, r, l], zr - zt, zl - zt);
    tri([l, r, b], zb - zl, zb - zr);
  } else {
    // Podział góra–dół: trójkąt prawy (t, r, b) i lewy (t, b, l).
    tri([t, r, b], zr - zt, zb - zr);
    tri([t, b, l], zb - zl, zl - zt);
  }
  g.poly(tileDiamond(x, y)).stroke({ width: 1, color: 0x000000, alpha: 0.08 });
}

/** Stały „szum” wizualny per kafelek – tylko kosmetyka, poza symulacją. */
function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}
