import { Assets, type Graphics, Rectangle, Texture } from 'pixi.js';

/**
 * Grafika z atlasu OpenGFX (GPL v2 – tylko na czas testów, patrz ADR 13). Sprite'y mają numery jak w TTD;
 * atlas i dane układów buduje `tools/opengfx/build_atlas.py`. Bez wczytanego atlasu (testy, błąd sieci)
 * renderery rysują dotychczasowe kształty.
 */

export interface HouseSprite {
  ground: string | null;
  building: string | null;
  /** Przesunięcie budynku w kafelku w 1/16 kafelka, osie OpenTTD (dx wzdłuż naszego y). */
  dx: number;
  dy: number;
}

/** Gotowy dom i trzy etapy budowy (wykop, rusztowanie, stan surowy). */
export interface HouseVariant extends HouseSprite {
  stages: HouseSprite[];
}

export interface HouseDef {
  id: number;
  pop: number;
  min: number;
  max: number;
  church: boolean;
  /** Dom z klimatu subarktycznego (spod linii śniegu). */
  arctic: boolean;
  variants: HouseVariant[];
}

export interface IndustryTile {
  x: number;
  y: number;
  ground: string | null;
  building: string | null;
  dx: number;
  dy: number;
}

export interface GfxData {
  pages: string[];
  frames: Record<string, [number, number, number, number, number, number, number]>;
  company: number;
  houses: HouseDef[];
  industries: Record<string, IndustryTile[]>;
  trees: { xy: [number, number][][]; layouts: number[][] };
  engines: Record<string, { base: number; views: number; pal: number }>;
  wagons: Record<string, { base: number; views: number; full: number | null }>;
  /** Ruch uliczny: pierwszy sprite (8 kierunków) dla trzech epok i dostępne kolory. */
  road: Record<'bus' | 'car' | 'truck', { eras: number[]; colours: number[] }>;
  /** Most kratownicowy: przęsło [spód, barierka, filar] dla osi X i Y OpenTTD oraz 8 przyczółków. */
  bridge: { middle: number[][]; heads: number[] };
}

export interface Frame {
  texture: Texture;
  ox: number;
  oy: number;
}

let data: GfxData | null = null;
const frames = new Map<string, Frame>();
/** Strony atlasu (adres i rozmiar) – do pokazywania sprite'ów w oknach interfejsu. */
let pageInfo: { url: string; w: number; h: number }[] = [];
let enabled = true;

/** Wczytuje atlas; przy błędzie gra zostaje przy prostych kształtach. */
export async function loadGfx(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}gfx.json`);
    if (!res.ok) return false;
    const json = (await res.json()) as GfxData;
    const pages = await Promise.all(json.pages.map((p) => Assets.load<Texture>(`${base}${p}`)));
    pageInfo = json.pages.map((p, k) => ({ url: `${base}${p}`, w: pages[k]!.width, h: pages[k]!.height }));
    for (const page of pages) {
      // Piksele bez rozmywania przy przybliżeniu (jak w TTD).
      page.source.scaleMode = 'nearest';
    }
    for (const [key, [p, x, y, w, h, ox, oy]] of Object.entries(json.frames)) {
      const source = pages[p]!.source;
      frames.set(key, { texture: new Texture({ source, frame: new Rectangle(x, y, w, h) }), ox, oy });
    }
    data = json;
    return true;
  } catch {
    return false;
  }
}

/** Atlas wczytany i grafika OpenGFX włączona. */
export function gfxOn(): boolean {
  return data !== null && enabled;
}

export function setGfxEnabled(on: boolean): void {
  enabled = on;
}

export function gfxData(): GfxData {
  return data!;
}

export function frame(key: string | number): Frame | undefined {
  return frames.get(String(key));
}

/** Klucz sprite'a z przekolorowaniem (np. kolor firmy). */
export function palKey(id: number, pal: number): string {
  return pal ? `${id}@${pal}` : String(id);
}

/**
 * Kierunek pojazdu jak w TTD (0 = N, 1 = NE … 7 = NW) z wektora jazdy w naszych osiach
 * (oś x OpenTTD to nasza oś y).
 */
export function ttdDirection(dx: number, dy: number): number {
  const angle = Math.atan2(dx, dy);
  return (((5 - Math.round(angle / (Math.PI / 4))) % 8) + 8) % 8;
}

/**
 * Sprite jako tło elementu HTML (okna interfejsu), powiększony `scale` razy bez rozmywania.
 * null – brak atlasu albo sprite'a.
 */
export function spriteStyle(key: string, scale = 2): Record<string, string> | null {
  if (!gfxOn()) return null;
  const f = data!.frames[key];
  if (!f) return null;
  const [p, x, y, w, h] = f;
  const page = pageInfo[p]!;
  return {
    width: `${w * scale}px`,
    height: `${h * scale}px`,
    backgroundImage: `url(${page.url})`,
    backgroundPosition: `-${x * scale}px -${y * scale}px`,
    backgroundSize: `${page.w * scale}px ${page.h * scale}px`,
    imageRendering: 'pixelated',
  };
}

/** Rysuje sprite tak, by jego punkt zaczepienia wypadł w (wx, wy). Zwraca false, gdy sprite'a nie ma. */
export function drawSprite(g: Graphics, key: string | number | null, wx: number, wy: number, tint = 0xffffff): boolean {
  if (key === null) return false;
  const f = frames.get(String(key));
  if (!f) return false;
  g.texture(f.texture, tint, Math.round(wx) + f.ox, Math.round(wy) + f.oy);
  return true;
}
