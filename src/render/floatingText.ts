import { Container, Text } from 'pixi.js';
import { tileToWorld } from './iso';

const LIFE_MS = 1800;
const RISE_PX = 28;

interface Floater {
  text: Text;
  age: number;
  x: number;
  y: number;
}

/** Wznoszące się napisy nad mapą (np. „+1 234 zł” przy dostawie). Stały rozmiar na ekranie. */
export class FloatingTexts {
  readonly container = new Container();
  private items: Floater[] = [];

  spawn(label: string, lx: number, ly: number, color = 0x9fdc7c): void {
    const p = tileToWorld(lx, ly);
    const text = new Text({
      text: label,
      style: {
        fontFamily: 'Consolas, monospace',
        fontSize: 14,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x1b1f24, width: 3 },
      },
      resolution: 2,
    });
    text.anchor.set(0.5, 1);
    this.container.addChild(text);
    this.items.push({ text, age: 0, x: p.x, y: p.y - 20 });
  }

  /** Czy jakiś napis jeszcze się wznosi (trzeba rysować klatki). */
  get active(): boolean {
    return this.items.length > 0;
  }

  update(deltaMs: number, zoom: number): void {
    for (const f of this.items) {
      f.age += deltaMs;
      const t = Math.min(1, f.age / LIFE_MS);
      f.text.scale.set(1 / zoom);
      f.text.position.set(f.x, f.y - (RISE_PX * t) / zoom);
      f.text.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
    const dead = this.items.filter((f) => f.age >= LIFE_MS);
    for (const f of dead) f.text.destroy();
    this.items = this.items.filter((f) => f.age < LIFE_MS);
  }
}
