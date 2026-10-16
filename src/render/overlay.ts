import { Container, Graphics } from 'pixi.js';
import type { TrackPlan } from '../sim/track/build';
import { tileDiamond } from './iso';
import { drawTrackPiece, type TrackStyle } from './trackDraw';

const PREVIEW_OK: TrackStyle = { ballast: 0xffffff, sleeper: 0xffe066, rail: 0xffffff, alpha: 0.55 };
const PREVIEW_EXISTS: TrackStyle = { ballast: 0xffffff, sleeper: 0xffffff, rail: 0xffffff, alpha: 0.2 };
const PREVIEW_BAD: TrackStyle = { ballast: 0xe0503a, sleeper: 0x8a2010, rail: 0xffb0a0, alpha: 0.7 };

/** Nakładki nad terenem: kafelek pod kursorem i podgląd budowy. */
export class Overlay {
  readonly container = new Container();
  private readonly hover = new Graphics();
  private readonly preview = new Graphics();

  constructor() {
    this.container.addChild(this.hover, this.preview);
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
