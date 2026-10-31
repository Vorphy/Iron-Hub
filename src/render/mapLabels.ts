import { Container, Graphics, Text } from 'pixi.js';
import { allTiles } from '../sim/station/station';
import { industryDef } from '../sim/economy/industry';
import { districtIndexAt, townTiles } from '../sim/economy/town';
import type { GameState } from '../sim/state';
import type { Rect } from './camera';
import { tileCenter, tileToWorld } from './iso';

type Kind = 'station' | 'waypoint' | 'town' | 'district' | 'industry' | 'depot';

const STYLES: Record<Kind, { size: number; fill: number; border: number | null; bg: number; bold: boolean }> = {
  town: { size: 14, fill: 0xffffff, border: null, bg: 0x1b1f24, bold: true },
  district: { size: 13, fill: 0xffffff, border: null, bg: 0x1b1f24, bold: false },
  station: { size: 12, fill: 0xffffff, border: 0xffe066, bg: 0x1b1f24, bold: false },
  waypoint: { size: 10, fill: 0xffffff, border: null, bg: 0x2f5f90, bold: false },
  industry: { size: 11, fill: 0xd8d4c8, border: null, bg: 0x2a2620, bold: false },
  depot: { size: 10, fill: 0xffffff, border: null, bg: 0x6b3a2a, bold: true },
};

/** Nazwy miast, stacji, zakładów i numery zajezdni – stały rozmiar na ekranie niezależnie od zoomu. */
export class MapLabels {
  readonly container = new Container();

  rebuild(state: GameState): void {
    for (const child of this.container.removeChildren()) child.destroy({ children: true, context: true });
    const W = state.map.width;
    for (const ind of state.industries) {
      const [w, h] = industryDef(ind.type)!.size;
      const c = tileToWorld(ind.x + w / 2, ind.y + h / 2);
      this.add('industry', ind.name, c.x, c.y - 30);
    }
    for (const town of state.towns) {
      const c = tileCenter(town.x, town.y);
      this.add('town', town.name, c.x, c.y - 36);
      // Dzielnice poza centrum (to leży pod nazwą miasta) – jak miasto, tylko bez pogrubienia. Napis w środku
      // zabudowy dzielnicy (jej środek bywa jeszcze pustym polem, w które dopiero rośnie).
      if (town.districts.length < 2) continue;
      const sum = town.districts.map(() => ({ x: 0, y: 0, n: 0 }));
      for (const i of townTiles(state, town)) {
        const x = i % W;
        const y = Math.floor(i / W);
        const s = sum[districtIndexAt(town, x, y)]!;
        s.x += x;
        s.y += y;
        s.n++;
      }
      town.districts.forEach((d, k) => {
        if (k === 0) return;
        const s = sum[k]!;
        const dc = s.n ? tileCenter(Math.round(s.x / s.n), Math.round(s.y / s.n)) : tileCenter(d.x, d.y);
        this.add('district', d.name, dc.x, dc.y - 30);
      });
    }
    for (const depot of state.depots) {
      const c = tileCenter(depot.x, depot.y);
      this.add('depot', `Zajezdnia #${depot.id}`, c.x, c.y - 22);
    }
    for (const st of state.stations) {
      let sx = 0;
      let top = Infinity;
      const tiles = allTiles(st);
      for (const t of tiles) {
        const c = tileCenter(t % W, Math.floor(t / W));
        sx += c.x;
        top = Math.min(top, c.y);
      }
      this.add(st.waypoint ? 'waypoint' : 'station', st.name, sx / tiles.length, top - (st.waypoint ? 16 : 6));
    }
  }

  private add(kind: Kind, name: string, x: number, y: number): void {
    const s = STYLES[kind];
    const label = new Container();
    const text = new Text({
      text: name,
      style: { fontFamily: 'Consolas, monospace', fontSize: s.size, fill: s.fill, fontWeight: s.bold ? 'bold' : 'normal' },
      resolution: 2,
    });
    const pad = 4;
    const bg = new Graphics()
      .rect(-text.width / 2 - pad, -text.height - pad, text.width + pad * 2, text.height + pad)
      .fill({ color: s.bg, alpha: kind === 'town' || kind === 'district' ? 0.55 : 0.85 });
    if (s.border !== null) bg.stroke({ width: 1, color: s.border });
    text.position.set(-text.width / 2, -text.height - pad / 2);
    label.addChild(bg, text);
    label.position.set(x, y);
    label.label = kind;
    this.container.addChild(label);
  }

  /**
   * Odwrotność zoomu kamery (napisy stałej wielkości) i ukrywanie tych poza ekranem.
   * Przy najdalszym widoku tylko nazwy miast – reszta zasłaniałaby mapę.
   */
  update(zoom: number, view: Rect): void {
    const margin = 200 / zoom;
    for (const child of this.container.children) {
      child.scale.set(1 / zoom);
      const { x, y } = child.position;
      child.visible =
        (child.label === 'town' || zoom >= 0.25) &&
        x > view.x - margin &&
        x < view.x + view.w + margin &&
        y > view.y - margin &&
        y < view.y + view.h + margin;
    }
  }
}
