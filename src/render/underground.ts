import { Container, Graphics } from 'pixi.js';
import type { GameState } from '../sim/state';
import { rampDown, rampTrack } from '../sim/track/metro';
import { tracksOn } from '../sim/track/track';
import { MAX_HEIGHT } from '../sim/world/height';
import { gfxOn } from './gfx/gfx';
import { drawTrackOverlays, drawUnderPlatform, tileSlope } from './gfx/tiles';
import { HEIGHT_PX, TILE_H, TILE_W, tileDiamond, toWorld } from './iso';
import { drawTrackTile, TRACK_STYLE } from './trackDraw';

/** Przyciemnienie powierzchni w widoku metra – obrysy terenu, ulic i domów zostają lekko widoczne. */
const SHADE = 0x05070b;
const SHADE_ALPHA = 0.74;
const FLOOR = 0x2b3038;
const FLOOR_EDGE = 0x434a55;
const RAMP_FLOOR = 0x4a5a6e;

/**
 * Widok poziomu −1 (metro): półprzezroczysta „ziemia” nad powierzchnią i tory metra na niej
 * (w miejscu kafelków nad nimi, żeby łatwo się zlokalizować). Rysowany od nowa po zmianie metra.
 */
export class UndergroundRenderer {
  readonly container = new Container();
  private readonly shade = new Graphics();
  private readonly tracks = new Graphics();
  private dirty = true;

  constructor(width: number, height: number) {
    const left = (-height * TILE_W) / 2 - TILE_W;
    const right = (width * TILE_W) / 2 + TILE_W;
    const top = -MAX_HEIGHT * HEIGHT_PX - 2 * TILE_H;
    const bottom = ((width + height) * TILE_H) / 2 + 2 * TILE_H;
    this.shade.rect(left, top, right - left, bottom - top).fill({ color: SHADE, alpha: SHADE_ALPHA });
    this.container.addChild(this.shade, this.tracks);
    this.container.visible = false;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(on: boolean) {
    this.container.visible = on;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(state: GameState): void {
    if (!this.container.visible || !this.dirty) return;
    this.dirty = false;
    const g = this.tracks;
    g.clear();
    const { map } = state;
    const sprites = gfxOn();
    const stations = new Map(state.stations.map((s) => [s.id, s]));
    for (let i = 0; i < map.under.length; i++) {
      const bits = map.under[i]!;
      const ramp = map.ramp[i]!;
      if (!bits && !ramp) continue;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      // Kafelek tunelu metra (zjazd – jaśniejszy, to wejście z powierzchni).
      g.poly(tileDiamond(x, y))
        .fill(ramp ? RAMP_FLOOR : FLOOR)
        .stroke({ width: 1, color: FLOOR_EDGE, alpha: 0.8 });
      const draw = ramp ? rampTrack(rampDown(map, x, y)!) : bits;
      const station = map.stationUnder[i] ? stations.get(map.stationUnder[i]!) : undefined;
      if (station && sprites) {
        drawUnderPlatform(g, map, x, y, station.axis);
        continue;
      }
      if (station) g.poly(tileDiamond(x, y)).fill({ color: 0xa9a49b, alpha: 0.9 });
      if (sprites) {
        const { z } = tileSlope(map, x, y);
        const o = toWorld(x, y, z);
        drawTrackOverlays(g, o.x, o.y, draw);
      } else {
        drawTrackTile(g, x, y, tracksOn(draw), TRACK_STYLE, map);
      }
    }
  }
}
