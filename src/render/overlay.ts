import { Container, Graphics } from 'pixi.js';
import type { StationPlan } from '../sim/station/station';
import type { TrackPlan } from '../sim/track/build';
import { tileDiamond } from './iso';
import { drawTrackPiece, type TrackStyle } from './trackDraw';

const PREVIEW_OK: TrackStyle = { ballast: 0xffffff, sleeper: 0xffe066, rail: 0xffffff, alpha: 0.55 };
const PREVIEW_EXISTS: TrackStyle = { ballast: 0xffffff, sleeper: 0xffffff, rail: 0xffffff, alpha: 0.2 };
const PREVIEW_BAD: TrackStyle = { ballast: 0xe0503a, sleeper: 0x8a2010, rail: 0xffb0a0, alpha: 0.7 };

/** Nakładki nad terenem: kafelek pod kursorem i podgląd budowy. */
export class Overlay {
  readonly container = new Container();
  private readonly catchment = new Graphics();
  private readonly hover = new Graphics();
  private readonly preview = new Graphics();

  constructor() {
    this.container.addChild(this.catchment, this.hover, this.preview);
  }

  /** Zasięg stacji: indeksy kafelków (y * width + x). */
  setCatchment(tiles: readonly number[] | null, mapWidth = 0): void {
    this.catchment.clear();
    if (!tiles) return;
    for (const t of tiles) this.catchment.poly(tileDiamond(t % mapWidth, Math.floor(t / mapWidth)));
    this.catchment.fill({ color: 0x4cc9f0, alpha: 0.18 });
  }

  setStationPreview(plan: StationPlan | null): void {
    this.preview.clear();
    if (!plan) return;
    const failed = !plan.result.ok;
    for (const { x, y, ok } of plan.tiles) {
      const bad = failed || !ok;
      this.preview
        .poly(tileDiamond(x, y))
        .fill({ color: bad ? 0xe0503a : 0xffffff, alpha: bad ? 0.45 : 0.35 })
        .stroke({ width: 1.5, color: bad ? 0xe0503a : 0xffe066, alpha: 0.9 });
    }
  }

  setHover(tile: { x: number; y: number } | null, color = 0xffe066): void {
    this.hover.clear();
    if (!tile) return;
    this.hover
      .poly(tileDiamond(tile.x, tile.y))
      .fill({ color: 0xffffff, alpha: 0.15 })
      .stroke({ width: 2, color, alpha: 0.9 });
  }

  /** Podgląd budowy (removal = rozbiórka – istniejące elementy na czerwono). */
  setTrackPreview(plan: TrackPlan | null, removal = false): void {
    this.preview.clear();
    if (!plan) return;
    const failed = !plan.result.ok;
    for (const { piece, status } of plan.pieces) {
      let style: TrackStyle;
      if (removal) {
        if (status !== 'exists') continue;
        style = PREVIEW_BAD;
      } else {
        style = status === 'blocked' || failed ? PREVIEW_BAD : status === 'exists' ? PREVIEW_EXISTS : PREVIEW_OK;
      }
      drawTrackPiece(this.preview, piece.x, piece.y, piece.track, style);
    }
  }
}
