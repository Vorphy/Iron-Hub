import { Container, Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import type { Depot } from '../sim/depot/depot';
import { axisTrack, bridgeRole, type Bridge } from '../sim/track/bridge';
import { tunnelRole, type Tunnel } from '../sim/track/tunnel';
import { isHeadAxisTrack } from './bridges';
import { getTrackBits, tracksOn } from '../sim/track/track';
import { getTerrain, Terrain, type WorldMap } from '../sim/world/map';
import type { Rect } from './camera';
import { cornerHeights, MAX_HEIGHT } from '../sim/world/height';
import { HEIGHT_PX, TILE_H, TILE_W, tileDiamond, tileToWorld, tileToWorldFlat } from './iso';
import { darken, lighten, tileHash } from './shapes';
import { drawHouse } from './buildings';
import { drawRoad } from './roadDraw';
import { drawCatenary } from './catenaryDraw';
import { drawDepot } from './depotDraw';
import { drawTrackPiece, TRACK_STYLE } from './trackDraw';

const CHUNK = 16;
/** Ile nowych kawałków mapy rysować na klatkę (płynność przy przewijaniu). */
const NEW_CHUNKS_PER_FRAME = 6;
/** Najwięcej narysowanych kawałków w pamięci (reszta rysowana ponownie, gdy wróci na ekran). */
const MAX_DRAWN_CHUNKS = 500;
/**
 * Daleki widok (zoom do tego progu): kawałek mapy renderowany raz do małego obrazka, bo setek tysięcy
 * wielokątów karta graficzna nie narysuje płynnie w każdej klatce.
 */
export const FAR_ZOOM = 0.25;
const NEW_FAR_PER_FRAME = 8;
const MAX_FAR_CHUNKS = 1500;

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
  /** Narysowany (geometria w pamięci) i czy wymaga odświeżenia. */
  drawn: boolean;
  dirty: boolean;
  /** Numer klatki, w której kawałek był ostatnio widoczny. */
  lastSeen: number;
  /** Tory w osobnej warstwie nad terenem – podsypka może lekko wychodzić poza kafelek. */
  tracks: Graphics;
  cx: number;
  cy: number;
  bounds: Rect;
  /** Obrazek kawałka w dalekim widoku (rozdzielczość = zoom, przy którym powstał). */
  far: Sprite;
  farRes: number;
  farDirty: boolean;
}

/** Teren i tory rysowane w kawałkach 16×16 kafelków; niewidoczne kawałki są pomijane. */
export class MapRenderer {
  readonly container = new Container();
  private readonly terrainLayer = new Container();
  private readonly trackLayer = new Container();
  private readonly farLayer = new Container();
  private farCount = 0;
  private readonly chunks: Chunk[] = [];
  private readonly chunksX: number;
  private frame = 0;
  private drawnCount = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly map: WorldMap,
    /** Zajezdnie czytane przy rysowaniu kafelka (tablica stanu może być podmieniana). */
    private readonly getDepots: () => readonly Depot[],
    private readonly getBridges: () => readonly Bridge[],
    private readonly getTunnels: () => readonly Tunnel[],
  ) {
    this.container.addChild(this.terrainLayer, this.trackLayer, this.farLayer);
    this.chunksX = Math.ceil(map.width / CHUNK);
    const chunksY = Math.ceil(map.height / CHUNK);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        // Kawałki rysujemy dopiero, gdy pojawią się na ekranie (duże mapy: milion kafelków).
        const chunk: Chunk = {
          gfx: new Graphics(),
          tracks: new Graphics(),
          drawn: false,
          dirty: false,
          lastSeen: -1,
          cx,
          cy,
          bounds: this.chunkBounds(cx, cy),
          far: new Sprite(),
          farRes: 0,
          farDirty: false,
        };
        chunk.far.position.set(chunk.bounds.x, chunk.bounds.y);
        chunk.far.visible = false;
        this.chunks.push(chunk);
      }
    }
    // Od tyłu do przodu (po przekątnej), żeby wyższy teren z przodu zasłaniał ten z tyłu.
    for (const c of [...this.chunks].sort((a, b) => a.cx + a.cy - (b.cx + b.cy) || a.cx - b.cx)) {
      this.terrainLayer.addChild(c.gfx);
      this.trackLayer.addChild(c.tracks);
      this.farLayer.addChild(c.far);
    }
  }

  markTileDirty(x: number, y: number): void {
    const chunk = this.chunks[Math.floor(y / CHUNK) * this.chunksX + Math.floor(x / CHUNK)];
    if (chunk?.drawn) chunk.dirty = true;
    if (chunk?.farRes) chunk.farDirty = true;
  }

  /**
   * Widoczność kawałków; widoczne a nienarysowane rysujemy (najwyżej kilka nowych na klatkę,
   * zmienione – od razu), dawno niewidziane zwalniamy, gdy narysowanych jest za dużo.
   */
  cull(view: Rect, zoom: number): void {
    this.frame++;
    const far = zoom <= FAR_ZOOM;
    this.terrainLayer.visible = this.trackLayer.visible = !far;
    this.farLayer.visible = far;
    if (far) return this.cullFar(view, zoom);
    const pending: Chunk[] = [];
    for (const c of this.chunks) {
      const b = c.bounds;
      const visible = b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y;
      c.gfx.visible = c.tracks.visible = visible;
      if (!visible) continue;
      c.lastSeen = this.frame;
      if (c.dirty) this.drawChunk(c);
      else if (!c.drawn) pending.push(c);
    }
    // Najpierw kawałki bliżej środka ekranu.
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const dist = (c: Chunk) => Math.abs(c.bounds.x + c.bounds.w / 2 - cx) + Math.abs(c.bounds.y + c.bounds.h / 2 - cy);
    pending.sort((a, b) => dist(a) - dist(b));
    for (const c of pending.slice(0, NEW_CHUNKS_PER_FRAME)) this.drawChunk(c);
    if (this.drawnCount > MAX_DRAWN_CHUNKS) this.evict();
  }

  /** Daleki widok: obrazki kawałków, brakujące (lub zbyt mało ostre) dorabiane po kilka na klatkę. */
  private cullFar(view: Rect, zoom: number): void {
    const pending: Chunk[] = [];
    for (const c of this.chunks) {
      const b = c.bounds;
      const visible = b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y;
      c.far.visible = visible && c.farRes > 0;
      if (!visible) continue;
      c.lastSeen = this.frame;
      if (c.farDirty) this.renderFar(c, zoom);
      else if (c.farRes < zoom) pending.push(c);
    }
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const dist = (c: Chunk) => Math.abs(c.bounds.x + c.bounds.w / 2 - cx) + Math.abs(c.bounds.y + c.bounds.h / 2 - cy);
    pending.sort((a, b) => dist(a) - dist(b));
    for (const c of pending.slice(0, NEW_FAR_PER_FRAME)) this.renderFar(c, zoom);
    if (this.farCount > MAX_FAR_CHUNKS) {
      const old = this.chunks.filter((c) => c.farRes && c.lastSeen < this.frame).sort((a, b) => a.lastSeen - b.lastSeen);
      for (const c of old.slice(0, this.farCount - MAX_FAR_CHUNKS)) this.dropFar(c);
    }
  }

  /** Rysuje kawałek do tymczasowej geometrii i zapisuje jako obrazek (geometria od razu zwalniana). */
  private renderFar(chunk: Chunk, zoom: number): void {
    const temp = new Container();
    const g = new Graphics();
    const tracks = new Graphics();
    temp.addChild(g, tracks);
    this.drawChunkInto(chunk, g, tracks);
    const b = chunk.bounds;
    const texture = this.renderer.generateTexture({ target: temp, frame: new Rectangle(b.x, b.y, b.w, b.h), resolution: zoom });
    temp.destroy({ children: true, context: true });
    if (chunk.farRes) chunk.far.texture.destroy(true);
    else this.farCount++;
    chunk.far.texture = texture;
    chunk.far.visible = true;
    chunk.farRes = zoom;
    chunk.farDirty = false;
  }

  private dropFar(chunk: Chunk): void {
    chunk.far.texture.destroy(true);
    chunk.far.texture = Texture.EMPTY;
    chunk.far.visible = false;
    chunk.farRes = 0;
    chunk.farDirty = false;
    this.farCount--;
  }

  /** Zwalnia geometrię najdawniej widzianych kawałków. */
  private evict(): void {
    const old = this.chunks.filter((c) => c.drawn && c.lastSeen < this.frame).sort((a, b) => a.lastSeen - b.lastSeen);
    for (const c of old.slice(0, this.drawnCount - MAX_DRAWN_CHUNKS)) {
      c.gfx.clear();
      c.tracks.clear();
      c.drawn = false;
      c.dirty = false;
      this.drawnCount--;
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
    if (!chunk.drawn) this.drawnCount++;
    chunk.drawn = true;
    chunk.dirty = false;
    chunk.gfx.clear();
    chunk.tracks.clear();
    this.drawChunkInto(chunk, chunk.gfx, chunk.tracks);
  }

  private drawChunkInto(chunk: Chunk, g: Graphics, tracksG: Graphics): void {
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
          g.poly(tileDiamond(x, y))
            .fill(PLATFORM[h & 3]!)
            .stroke({ width: 1, color: PLATFORM_EDGE, alpha: 0.6 });
        } else {
          drawTerrainTile(g, this.map, x, y, COLORS[t][h & 3]!);
          if (t === Terrain.Rough) drawRoughDots(g, x, y, h);
        }
        // Droga pod torem (przejazd) – najpierw droga, tor nad nią.
        if (this.map.road[y * this.map.width + x]) drawRoad(tracksG, this.map, x, y);
        const bridge = this.map.bridge[y * this.map.width + x]
          ? this.getBridges().find((b) => b.id === this.map.bridge[y * this.map.width + x])
          : undefined;
        const head = bridge && bridgeRole(bridge, x, y) !== 'span' ? bridge : undefined;
        const tunnelId = this.map.tunnel[y * this.map.width + x];
        const tunnel = tunnelId ? this.getTunnels().find((t) => t.id === tunnelId) : undefined;
        const portal = tunnel && tunnelRole(tunnel, x, y) !== 'inside' ? tunnel : undefined;
        const tileTracks = tracksOn(getTrackBits(this.map, x, y));
        for (const track of tileTracks) {
          if (head && isHeadAxisTrack(head, track)) continue; // rampę rysuje most
          if (portal && track === axisTrack(portal.axis)) continue; // tor wjazdu rysuje tunel
          drawTrackPiece(tracksG, x, y, track, TRACK_STYLE);
        }
        if (this.map.electric[y * this.map.width + x]) drawCatenary(tracksG, x, y, tileTracks);
        const house = this.map.house[y * this.map.width + x]!;
        if (house) drawHouse(tracksG, x, y, house, h);
        const depotId = this.map.depot[y * this.map.width + x];
        if (depotId) {
          const depot = this.getDepots().find((d) => d.id === depotId);
          if (depot) drawDepot(tracksG, x, y, depot.side);
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
