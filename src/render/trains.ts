import { Graphics } from 'pixi.js';
import type { GameState } from '../sim/state';
import { vehiclePoses, type Point3, type VehiclePose } from '../sim/trains/geometry';
import { toWorld, type Point } from './iso';
import { drawSprite, gfxData, gfxOn, palKey, ttdDirection } from './gfx/gfx';
import { FrontObjects, houseDepth, redrawHouse } from './buildings';
import type { StreetVehicle } from './traffic';
import { bridgeAbove, drawBridge } from './bridges';
import type { Bridge } from '../sim/track/bridge';

const HALF_WIDTH = 0.13;
const BODY_H = 7;
const HIT_RADIUS = 14;

type Pose = Pick<VehiclePose, 'front' | 'back'>;

interface Drawn {
  trainId: number;
  pose: VehiclePose;
  depth: number;
  /** Lokomotywa prowadząca składu (kolor całego pociągu w grafice OpenGFX). */
  engine: string;
  reversed: boolean;
}

/**
 * Pociągi rysowane co klatkę. Pozycje interpolowane między poprzednim a bieżącym tickiem
 * (alpha z pętli gry), więc ruch jest płynny przy 60 FPS niezależnie od 20 ticków/s.
 */
export class TrainRenderer {
  readonly gfx = new Graphics();
  private prev = new Map<string, Pose>();
  /** Środki pojazdów w świecie (px) do wskazywania myszą. */
  private hits: { trainId: number; x: number; y: number }[] = [];

  /** Zapamiętuje pozycje przed tickiem symulacji. */
  capture(state: GameState): void {
    this.prev.clear();
    for (const t of state.trains) for (const p of vehiclePoses(state, t)) this.prev.set(`${t.id}:${p.index}`, p);
  }

  /** Pociągi i auta (`cars` z ruchu ulicznego) w jednej kolejności z budynkami, które je zasłaniają. */
  draw(state: GameState, alpha: number, selectedId: number | null, cars: readonly StreetVehicle[] = [], metro = false): void {
    const g = this.gfx;
    g.clear();
    const items: Drawn[] = [];
    for (const t of state.trains) {
      for (const cur of vehiclePoses(state, t)) {
        // Widok metra – tylko pociągi pod ziemią; widok powierzchni – tylko na powierzchni.
        if (cur.under !== metro) continue;
        const prev = this.prev.get(`${t.id}:${cur.index}`);
        const pose = prev ? { ...cur, front: lerp(prev.front, cur.front, alpha), back: lerp(prev.back, cur.back, alpha) } : cur;
        const depth = (pose.front.x + pose.front.y + pose.back.x + pose.back.y) / 2;
        items.push({ trainId: t.id, pose, depth, engine: t.engine, reversed: t.reversed });
      }
    }
    // Budynki przed pojazdami zasłaniają je – dorysowujemy je (z tym, co stoi przed nimi) w kolejności głębokości.
    const front = new FrontObjects(state);
    // W metrze nic pojazdów nie zasłania (budynki są na powierzchni, nad przyciemnieniem).
    for (const it of metro ? [] : items) {
      const { front: f, back: b } = it.pose;
      front.addVehicle((f.x + b.x) / 2, (f.y + b.y) / 2);
    }
    for (const c of cars) front.addVehicle(c.x, c.y);
    front.close();
    const order: ({ depth: number; item: Drawn } | { depth: number; house: number } | { depth: number; car: StreetVehicle })[] = [
      ...items.map((item) => ({ depth: item.depth, item })),
      ...cars.map((car) => ({ depth: car.depth, car })),
      ...[...front.tiles].map((house) => ({ depth: houseDepth(state.map, house), house })),
    ];
    order.sort((a, b) => a.depth - b.depth);
    this.hits = [];
    const sprites = gfxOn();
    const drawItem = (item: Drawn) => {
      const selected = item.trainId === selectedId;
      const c = (sprites && drawVehicleSprite(g, item, selected)) || drawVehicle(g, item.pose, selected);
      this.hits.push({ trainId: item.trainId, x: c.x, y: c.y });
    };
    // Pojazdy na torze pod mostem: najpierw one, potem ten most nad nimi, na końcu reszta.
    const under = new Set<Drawn>();
    const bridges = new Set<Bridge>();
    for (const it of items) {
      const { front: f, back: b } = it.pose;
      const br = bridgeAbove(state, (f.x + b.x) / 2, (f.y + b.y) / 2, (f.z + b.z) / 2);
      if (br) {
        under.add(it);
        bridges.add(br);
      }
    }
    for (const o of order) if ('item' in o && under.has(o.item)) drawItem(o.item);
    for (const br of [...bridges].sort((a, c) => a.x + a.y - (c.x + c.y))) drawBridge(g, state, br);
    for (const o of order) {
      if ('house' in o) {
        redrawHouse(g, state, o.house);
        continue;
      }
      if ('car' in o) {
        o.car.draw(g);
        continue;
      }
      if (!under.has(o.item)) drawItem(o.item);
    }
  }

  /** Pociąg pod punktem świata (px), jeśli jakiś jest blisko. */
  hitTest(wx: number, wy: number, zoom: number): number | null {
    let best: number | null = null;
    let bestD = (HIT_RADIUS / Math.min(zoom, 1)) ** 2;
    for (const h of this.hits) {
      const d = (h.x - wx) ** 2 + (h.y - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h.trainId;
      }
    }
    return best;
  }
}

/**
 * Pojazd z grafiki OpenGFX: jeden z 8 (lub 4 symetrycznych) widoków według kierunku jazdy,
 * w kolorze lokomotywy prowadzącej. Zwraca środek w px albo null, gdy brak sprite'a.
 */
function drawVehicleSprite(g: Graphics, item: Drawn, selected: boolean): Point | null {
  const { engines, wagons } = gfxData();
  const { front: f, back: b } = item.pose;
  let dir = ttdDirection(f.x - b.x, f.y - b.y);
  const pal = engines[item.engine]?.pal ?? 0;
  let id: number;
  if (item.pose.engine) {
    const e = engines[item.pose.type];
    if (!e) return null;
    // Po zawróceniu lokomotywa jedzie tyłem.
    if (item.reversed) dir = (dir + 4) % 8;
    id = e.base + (e.views === 8 ? dir : dir & 3);
  } else {
    const w = wagons[item.pose.type];
    if (!w) return null;
    id = (item.pose.loaded && w.full ? w.full : w.base) + (dir & 3);
  }
  // Metro rysujemy w miejscu kafelków nad nim (tor metra leży poziom niżej).
  const lift = item.pose.under ? 1 : 0;
  const mid = toWorld((f.x + b.x) / 2, (f.y + b.y) / 2, (f.z + b.z) / 2 + lift);
  if (!drawSprite(g, palKey(id, pal), mid.x, mid.y, selected ? 0xfff27a : 0xffffff)) return null;
  return { x: mid.x, y: mid.y - 6 };
}

function lerp(a: Point3, b: Point3, t: number): Point3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Pojazd jako prostopadłościan: obrys (ciemny) + dach (kolor pojazdu). Zwraca środek w px. */
function drawVehicle(g: Graphics, pose: VehiclePose, selected: boolean): Point {
  const lift = pose.under ? 1 : 0;
  const f = { ...pose.front, z: pose.front.z + lift };
  const b = { ...pose.back, z: pose.back.z + lift };
  const len = Math.hypot(f.x - b.x, f.y - b.y) || 1;
  const ux = (f.x - b.x) / len;
  const uy = (f.y - b.y) / len;
  const px = -uy * HALF_WIDTH;
  const py = ux * HALF_WIDTH;
  const ground = [
    toWorld(f.x + px, f.y + py, f.z),
    toWorld(f.x - px, f.y - py, f.z),
    toWorld(b.x - px, b.y - py, b.z),
    toWorld(b.x + px, b.y + py, b.z),
  ];
  const top = ground.map((p) => ({ x: p.x, y: p.y - BODY_H }));
  const color = parseInt(pose.color.slice(1), 16);

  g.poly(hull([...ground, ...top]).flatMap((p) => [p.x, p.y])).fill(darken(color, 0.55));
  g.poly(top.flatMap((p) => [p.x, p.y])).fill(color);
  g.poly(top.flatMap((p) => [p.x, p.y])).stroke({
    width: selected ? 2 : 1,
    color: selected ? 0xffe066 : 0x000000,
    alpha: selected ? 1 : 0.4,
  });

  if (pose.engine) {
    // Komin bliżej przodu parowozu.
    const c = toWorld(f.x - ux * 0.12, f.y - uy * 0.12, f.z);
    g.circle(c.x, c.y - BODY_H - 1, 2).fill(0x1b1b1b);
  }
  const mid = toWorld((f.x + b.x) / 2, (f.y + b.y) / 2, (f.z + b.z) / 2);
  return { x: mid.x, y: mid.y - BODY_H / 2 };
}

export function darken(color: number, k: number): number {
  const r = ((color >> 16) & 255) * k;
  const gg = ((color >> 8) & 255) * k;
  const b = (color & 255) * k;
  return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
}

/** Otoczka wypukła (monotone chain). */
export function hull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
