import { Container, Graphics } from 'pixi.js';
import { getTrackBits, tracksOn } from '../sim/track/track';
import { getTerrain, Terrain, type WorldMap } from '../sim/world/map';
import type { Rect } from './camera';
import { TILE_H, TILE_W, tileDiamond, tileToWorld } from './iso';
import { drawTrackPiece, TRACK_STYLE } from './trackDraw';

const CHUNK = 16;

// Placeholder – płaskie kolory do czasu podpięcia grafiki (OpenGFX).
const COLORS: Record<Terrain, number[]> = {
  [Terrain.Grass]: [0x5b8c3a, 0x5f913d, 0x578636, 0x62943f],
  [Terrain.Water]: [0x2e5f8f, 0x2f6293, 0x2c5c8b, 0x30648f],
  [Terrain.Rough]: [0x7a7346, 0x766f43, 0x7e7749, 0x736c41],
};
const ROUGH_DOT = 0x4f4a2b;

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

  constructor(private readonly map: WorldMap) {
    this.container.addChild(this.terrainLayer, this.trackLayer);
    this.chunksX = Math.ceil(map.width / CHUNK);
    const chunksY = Math.ceil(map.height / CHUNK);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const chunk: Chunk = { gfx: new Graphics(), tracks: new Graphics(), cx, cy, bounds: this.chunkBounds(cx, cy) };
        this.drawChunk(chunk);
        this.chunks.push(chunk);
        this.terrainLayer.addChild(chunk.gfx);
        this.trackLayer.addChild(chunk.tracks);
      }
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
    const left = tileToWorld(x0, y0 + CHUNK).x - TILE_W / 2;
    const right = tileToWorld(x0 + CHUNK, y0).x + TILE_W / 2;
    const top = tileToWorld(x0, y0).y;
    const bottom = tileToWorld(x0 + CHUNK, y0 + CHUNK).y + TILE_H;
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
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const t = getTerrain(this.map, x, y);
        const h = tileHash(x, y);
        g.poly(tileDiamond(x, y)).fill(COLORS[t][h & 3]!).stroke({ width: 1, color: 0x000000, alpha: 0.08 });
        if (t === Terrain.Rough) drawRoughDots(g, x, y, h);
        for (const track of tracksOn(getTrackBits(this.map, x, y))) drawTrackPiece(chunk.tracks, x, y, track, TRACK_STYLE);
      }
    }
  }
}

function drawRoughDots(g: Graphics, x: number, y: number, h: number): void {
  const { x: sx, y: sy } = tileToWorld(x, y);
  for (let i = 0; i < 4; i++) {
    const dx = ((h >>> (i * 4)) & 15) - 8;
    const dy = ((h >>> (i * 4 + 16)) & 7) - 4;
    g.rect(sx + dx * 2, sy + TILE_H / 2 + dy * 2, 3, 2).fill(ROUGH_DOT);
  }
}

/** Stały „szum” wizualny per kafelek – tylko kosmetyka, poza symulacją. */
function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}
