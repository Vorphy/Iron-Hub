import { Graphics } from 'pixi.js';
import { tileDiamond } from './iso';

/** Nakładki nad terenem: obecnie podświetlenie kafelka pod kursorem. */
export class Overlay {
  readonly hover = new Graphics();

  setHover(tile: { x: number; y: number } | null): void {
    this.hover.clear();
    if (!tile) return;
    this.hover
      .poly(tileDiamond(tile.x, tile.y))
      .fill({ color: 0xffffff, alpha: 0.15 })
      .stroke({ width: 2, color: 0xffe066, alpha: 0.9 });
  }
}
