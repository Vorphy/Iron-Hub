import { Texture } from 'pixi.js';

/**
 * Własne sprite'y aut osobowych w stylu OpenGFX. TTD i OpenGFX nie mają samochodów osobowych (każdy pojazd
 * na drodze należy tam do firmy), więc auto składamy z kilku brył (nadwozie, kabina, koła) i rzutujemy
 * piksel po pikselu w tej samej skali co pojazdy OpenGFX: 16 jednostek na kafelek, oś x gry → (2, 1) px,
 * oś y → (−2, 1) px, wysokość 1 px na jednostkę. Grafika jest nasza – nie podlega licencji OpenGFX.
 */

export type CarModel = 'classic' | 'sedan' | 'hatch';

type Paint = 'body' | 'glass' | 'wheel';

/** Bryła w układzie auta: u – wzdłuż (przód to +u), v – w poprzek, z – w górę; jednostki jak wyżej. */
interface Part {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  z0: number;
  z1: number;
  /** Kolor ścian bocznych; dach zawsze w kolorze nadwozia (koła – ciemne). */
  sides: Paint;
  /** Kabina: słupki w kolorze nadwozia na krawędziach szyb. */
  cabin?: boolean;
  /** Nadwozie: światła z przodu i z tyłu. */
  lights?: boolean;
}

interface ModelDef {
  len: number;
  width: number;
  body: [number, number];
  cabin: { u0: number; u1: number; top: number };
}

const MODELS: Record<CarModel, ModelDef> = {
  /** Lata 30.–50.: krótszy, wyższa kabina. */
  classic: { len: 5, width: 2.8, body: [0.7, 2.8], cabin: { u0: -1.7, u1: 0.8, top: 5.6 } },
  /** Sedan: najdłuższy, niska kabina pośrodku. */
  sedan: { len: 5.6, width: 3, body: [0.6, 2.6], cabin: { u0: -1.5, u1: 1.1, top: 4.9 } },
  /** Hatchback: krótki, kabina do samego tyłu. */
  hatch: { len: 4.8, width: 3, body: [0.6, 2.7], cabin: { u0: -2.4, u1: 0.9, top: 5.2 } },
};

const GLASS = 0x3e5770;
const WHEEL = 0x1e1e1e;
const HEADLIGHT = 0xfff2b0;
const TAILLIGHT = 0xb02a1f;
/** Gęstość próbkowania ścian (jednostki) – kilka próbek na piksel, bez dziur. */
const STEP = 0.125;

function parts(m: ModelDef): Part[] {
  const hl = m.len / 2;
  const hw = m.width / 2;
  const out: Part[] = [
    { u0: -hl, u1: hl, v0: -hw, v1: hw, z0: m.body[0], z1: m.body[1], sides: 'body', lights: true },
    {
      u0: m.cabin.u0,
      u1: m.cabin.u1,
      v0: -hw + 0.35,
      v1: hw - 0.35,
      z0: m.body[1],
      z1: m.cabin.top,
      sides: 'glass',
      cabin: true,
    },
  ];
  for (const u of [-hl + 1.1, hl - 1.1]) {
    for (const [v0, v1] of [
      [-hw, -hw + 0.5],
      [hw - 0.5, hw],
    ] as const) {
      out.push({ u0: u - 0.55, u1: u + 0.55, v0, v1, z0: 0, z1: 0.8, sides: 'wheel' });
    }
  }
  return out;
}

/** Wektor jazdy (osie gry) dla kierunku TTD 0–7 – odwrotność `ttdDirection`. */
export function directionVector(dir: number): [number, number] {
  const angle = ((5 - dir) * Math.PI) / 4;
  return [Math.sin(angle), Math.cos(angle)];
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const shade = (c: number, k: number): [number, number, number] =>
  rgb(c).map((ch) => Math.max(0, Math.min(255, Math.round(ch * k)))) as [number, number, number];

export interface CarRaster {
  w: number;
  h: number;
  /** Przesunięcie lewego górnego rogu względem środka auta na jezdni (px). */
  ox: number;
  oy: number;
  /** Piksele RGBA, wiersz po wierszu. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Rysuje auto w pamięci (bez DOM) – kolor nadwozia `color`, kierunek TTD `dir`. */
export function rasterizeCar(model: CarModel, dir: number, color: number): CarRaster {
  const m = MODELS[model];
  const [fx, fy] = directionVector(dir);
  // Oś w poprzek auta (prawa strona przy osi y w dół).
  const [sx, sy] = [-fy, fx];
  const px = new Map<number, { depth: number; c: [number, number, number] }>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const plot = (u: number, v: number, z: number, c: [number, number, number]) => {
    const x = u * fx + v * sx;
    const y = u * fy + v * sy;
    const X = Math.floor(2 * (x - y));
    const Y = Math.floor(x + y - z);
    // Bliżej widza: większe x + y, a przy tym samym pikselu – wyżej (kierunek patrzenia (1, 1, 2)).
    const depth = x + y + 2 * z;
    const key = (Y + 512) * 1024 + (X + 512);
    const prev = px.get(key);
    if (prev && prev.depth >= depth) return;
    px.set(key, { depth, c });
    minX = Math.min(minX, X);
    minY = Math.min(minY, Y);
    maxX = Math.max(maxX, X);
    maxY = Math.max(maxY, Y);
  };

  for (const p of parts(m)) {
    const base = p.sides === 'wheel' ? WHEEL : color;
    // Dach.
    const roof = shade(base, p.sides === 'wheel' ? 1 : 1.12);
    for (let u = p.u0; u <= p.u1 + 1e-9; u += STEP) for (let v = p.v0; v <= p.v1 + 1e-9; v += STEP) plot(u, v, p.z1, roof);
    // Ściany boczne: normalna w osiach gry; widać tylko te zwrócone do widza (x + y > 0).
    const faces: { n: [number, number]; along: 'u' | 'v'; at: number; sign: number }[] = [
      { n: [fx, fy], along: 'v', at: p.u1, sign: 1 },
      { n: [-fx, -fy], along: 'v', at: p.u0, sign: -1 },
      { n: [sx, sy], along: 'u', at: p.v1, sign: 1 },
      { n: [-sx, -sy], along: 'u', at: p.v0, sign: -1 },
    ];
    for (const f of faces) {
      if (f.n[0] + f.n[1] <= 1e-6) continue;
      // Światło z lewej góry ekranu: ściana zwrócona w +y jaśniejsza niż w +x.
      const k = 0.8 + 0.12 * (f.n[1] - f.n[0]);
      const [a0, a1] = f.along === 'u' ? [p.u0, p.u1] : [p.v0, p.v1];
      for (let a = a0; a <= a1 + 1e-9; a += STEP) {
        for (let z = p.z0; z <= p.z1 + 1e-9; z += STEP) {
          let paint = p.sides === 'wheel' ? WHEEL : p.sides === 'glass' ? GLASS : color;
          if (p.cabin) {
            // Słupki: krawędzie szyb w kolorze nadwozia.
            const edge = Math.min(a - a0, a1 - a);
            const middle = f.along === 'u' && Math.abs(a - (a0 + a1) / 2) < 0.15 && a1 - a0 > 2.6;
            if (edge < 0.25 || middle) paint = color;
          }
          if (p.lights && f.along === 'v' && z > 1.4 && z < 2.1 && Math.abs(a) > p.v1 - 0.7) {
            paint = f.sign > 0 ? HEADLIGHT : TAILLIGHT;
          }
          const u = f.along === 'u' ? a : f.at;
          const v = f.along === 'u' ? f.at : a;
          plot(u, v, z, shade(paint, paint === HEADLIGHT ? 1 : k));
        }
      }
    }
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  const filled = (X: number, Y: number) => px.has((Y + 512) * 1024 + (X + 512));
  for (const [key, { c }] of px) {
    const X = (key % 1024) - 512;
    const Y = Math.floor(key / 1024) - 512;
    // Ciemniejszy obrys sylwetki (mocniej od spodu), żeby małe auto było czytelne na jezdni.
    let k = 1;
    if (!filled(X, Y + 1)) k = 0.55;
    else if (!filled(X - 1, Y) || !filled(X + 1, Y) || !filled(X, Y - 1)) k = 0.75;
    const o = ((Y - minY) * w + (X - minX)) * 4;
    data[o] = Math.round(c[0] * k);
    data[o + 1] = Math.round(c[1] * k);
    data[o + 2] = Math.round(c[2] * k);
    data[o + 3] = 255;
  }
  return { w, h, ox: minX, oy: minY, data };
}

/** Model auta dla roku gry i losowego wariantu: z czasem na ulicach pojawiają się nowsze nadwozia. */
export function carModel(year: number, variant: number): CarModel {
  const models: CarModel[] = year < 1960 ? ['classic'] : year < 1985 ? ['classic', 'sedan'] : ['sedan', 'hatch'];
  return models[variant % models.length]!;
}

const cache = new Map<string, { texture: Texture; ox: number; oy: number } | null>();

/** Tekstura auta (tworzona przy pierwszym użyciu); null bez przeglądarki (testy). */
export function carFrame(model: CarModel, dir: number, color: number): { texture: Texture; ox: number; oy: number } | null {
  const key = `${model}:${dir}:${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return null;
  const r = rasterizeCar(model, dir, color);
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cache.set(key, null);
    return null;
  }
  ctx.putImageData(new ImageData(r.data, r.w, r.h), 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  const out = { texture, ox: r.ox, oy: r.oy };
  cache.set(key, out);
  return out;
}
