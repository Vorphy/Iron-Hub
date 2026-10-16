import { Container, Graphics, Text } from 'pixi.js';
import type { Station } from '../sim/station/station';
import { tileCenter } from './iso';

/** Tabliczki z nazwami stacji – stały rozmiar na ekranie niezależnie od zoomu. */
export class StationLabels {
  readonly container = new Container();

  rebuild(stations: readonly Station[], mapWidth: number): void {
    for (const child of this.container.removeChildren()) child.destroy({ children: true });
    for (const st of stations) {
      let sx = 0;
      let sy = 0;
      let top = Infinity;
      for (const t of st.tiles) {
        const c = tileCenter(t % mapWidth, Math.floor(t / mapWidth));
        sx += c.x;
        sy += c.y;
        top = Math.min(top, c.y);
      }
      const label = new Container();
      const text = new Text({
        text: st.name,
        style: { fontFamily: 'Consolas, monospace', fontSize: 12, fill: 0xffffff },
        resolution: 2,
      });
      const pad = 4;
      const bg = new Graphics()
        .rect(-text.width / 2 - pad, -text.height - pad, text.width + pad * 2, text.height + pad)
        .fill({ color: 0x1b1f24, alpha: 0.85 })
        .stroke({ width: 1, color: 0xffe066 });
      text.position.set(-text.width / 2, -text.height - pad / 2);
      label.addChild(bg, text);
      label.position.set(sx / st.tiles.length, top - 6);
      this.container.addChild(label);
    }
  }

  /** Odwrotność zoomu kamery, żeby napisy nie rosły ani nie znikały. */
  setZoom(zoom: number): void {
    for (const child of this.container.children) child.scale.set(1 / zoom);
  }
}
