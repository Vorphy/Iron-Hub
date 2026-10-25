import { Graphics } from 'pixi.js';
import { industryDef } from '../sim/economy/industry';
import { townPopulation, TOWN_EXTENT, type Town } from '../sim/economy/town';
import type { GameState } from '../sim/state';
import { inBounds, type WorldMap } from '../sim/world/map';
import type { Rect } from './camera';
import { tileCenter, tileToWorld, type Point } from './iso';
import { darken, hull } from './trains';
import { houseDepth, housesInFront, redrawHouse } from './buildings';
import { drawSprite, gfxData, gfxOn, palKey, ttdDirection } from './gfx/gfx';
import { gfxYear } from './gfx/tiles';

/**
 * Ruch uliczny w miastach – czysta dekoracja: nie należy do symulacji ani zapisu, losowość
 * z Math.random. Auta, autobusy i ciężarówki błądzą po drogach prawą stroną, tylko w miastach przy widoku.
 */

type Kind = 'car' | 'bus' | 'truck';

/** Prędkość w kafelkach na sekundę gry przy prędkości 1×. */
const SPEED: Record<Kind, number> = { car: 1.1, bus: 0.8, truck: 0.75 };
/** Przesunięcie na prawy pas (ułamek kafelka). */
const LANE = 0.11;
const CAR = { len: 0.17, half: 0.05, h: 4 };
const BUS = { len: 0.3, half: 0.06, h: 6 };
/** Ciężarówka: kabina z przodu (ułamek długości) i skrzynia. */
const TRUCK = { len: 0.28, half: 0.06, h: 6, cab: 0.3 };
const TRUCK_CABS = [0xc0392b, 0x2e6fb7, 0xe8e8e8, 0x3f8f4a];
const TRUCK_BOX = 0x9a8f7a;
/** Zakład w takiej odległości od rynku (kafelki) przysyła ciężarówki do miasta. */
const INDUSTRY_REACH = TOWN_EXTENT + 8;
const BUS_COLOR = 0xf2c230;
const CAR_COLORS = [0xc0392b, 0x2e6fb7, 0xe8e8e8, 0x2b2b2b, 0x3f8f4a, 0x8e44ad, 0xd98236, 0x7f8c8d];
/** Poniżej tego przybliżenia auta są za małe, żeby je rysować. */
const MIN_ZOOM = 0.5;
/** Co tyle ms odświeżamy listy dróg i liczbę pojazdów miast w widoku. */
const REFRESH_MS = 2000;

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

interface Vehicle {
  kind: Kind;
  color: number;
  /** Losowy wybór koloru w grafice OpenGFX. */
  variant: number;
  /** Kafelki (indeksy): poprzedni, bieżący odcinek a→b i następny. */
  prev: number;
  a: number;
  b: number;
  next: number;
  /** Postęp na odcinku a→b (0–1). */
  t: number;
}

interface TownTraffic {
  roads: number[];
  vehicles: Vehicle[];
}

export class TrafficRenderer {
  readonly gfx = new Graphics();
  private enabledFlag = true;
  private towns = new Map<number, TownTraffic>();
  private sinceRefresh = REFRESH_MS;

  get enabled(): boolean {
    return this.enabledFlag;
  }

  set enabled(on: boolean) {
    this.enabledFlag = on;
    if (!on) {
      this.towns.clear();
      this.gfx.clear();
    }
    this.sinceRefresh = REFRESH_MS;
  }

  /** `gameSeconds` – upływ czasu gry w sekundach (0 w pauzie). */
  update(state: GameState, deltaMs: number, gameSeconds: number, view: Rect, zoom: number): void {
    const g = this.gfx;
    g.clear();
    if (!this.enabledFlag || zoom < MIN_ZOOM) return;
    this.sinceRefresh += deltaMs;
    if (this.sinceRefresh >= REFRESH_MS) {
      this.sinceRefresh = 0;
      this.refresh(state, view);
    }
    const { map } = state;
    const drawn: ({ depth: number; v: Vehicle; pose: Pose } | { depth: number; house: number })[] = [];
    const houses = new Set<number>();
    for (const tt of this.towns.values()) {
      for (const v of tt.vehicles) {
        if (!this.advance(map, v, gameSeconds * SPEED[v.kind])) {
          respawn(map, tt, v);
          continue;
        }
        const pose = vehiclePose(map, v);
        drawn.push({ v, pose, depth: pose.x + pose.y });
        housesInFront(state, pose.x, pose.y, houses);
      }
    }
    // Domy przed autami zasłaniają je – dorysowujemy je w kolejności głębokości.
    for (const house of houses) drawn.push({ depth: houseDepth(map, house), house });
    drawn.sort((p, q) => p.depth - q.depth);
    const sprites = gfxOn();
    for (const d of drawn) {
      if ('house' in d) redrawHouse(g, state, d.house);
      else if (!sprites || !drawVehicleSprite(g, d.pose, d.v)) drawCar(g, d.pose, d.v);
    }
  }

  /** Miasta przy widoku dostają ruch; dalsze go tracą. */
  private refresh(state: GameState, view: Rect): void {
    const margin = TOWN_EXTENT * 32;
    const near = (t: Town) => {
      const c = tileCenter(t.x, t.y);
      return c.x > view.x - margin && c.x < view.x + view.w + margin && c.y > view.y - margin && c.y < view.y + view.h + margin;
    };
    const active = new Set<number>();
    for (const town of state.towns) {
      if (!near(town)) continue;
      active.add(town.id);
      const roads = townRoads(state.map, town);
      const tt = this.towns.get(town.id) ?? { roads, vehicles: [] };
      tt.roads = roads;
      this.towns.set(town.id, tt);
      const pop = townPopulation(state, town);
      const cars =
        roads.length < 2 ? 0 : Math.min(Math.round(roads.length / 3), Math.max(1, Math.min(12, Math.round(pop / 150))));
      // Więcej autobusów w mieście obsługiwanym przez kolej (dowożą pasażerów na stację).
      const buses = roads.length < 6 ? 0 : town.lastTransported > 0 ? 2 + Math.floor(pop / 1500) : pop > 400 ? 1 : 0;
      // Ciężarówki dowożą do miasta z pobliskich zakładów (więcej z większych) i towary do dużych miast.
      let trucks = pop > 800 ? 1 : 0;
      for (const ind of state.industries) {
        const [w, h] = industryDef(ind.type)!.size;
        if (Math.abs(ind.x + w / 2 - town.x) + Math.abs(ind.y + h / 2 - town.y) <= INDUSTRY_REACH)
          trucks += ind.level >= 3 ? 2 : 1;
      }
      trucks = roads.length < 6 ? 0 : Math.min(4, trucks);
      const want: Record<Kind, number> = { car: cars, bus: buses, truck: trucks };
      for (const kind of ['car', 'bus', 'truck'] as const) {
        const list = tt.vehicles.filter((v) => v.kind === kind);
        for (let n = list.length; n < want[kind]; n++) {
          const v = spawn(state.map, tt, kind);
          if (v) tt.vehicles.push(v);
        }
        for (const v of list.slice(want[kind])) tt.vehicles.splice(tt.vehicles.indexOf(v), 1);
      }
    }
    for (const id of this.towns.keys()) if (!active.has(id)) this.towns.delete(id);
  }

  /** Przesuwa pojazd o `dist` kafelków; false – droga pod nim zniknęła. */
  private advance(map: WorldMap, v: Vehicle, dist: number): boolean {
    if (!map.road[v.a] || !map.road[v.b]) return false;
    v.t += dist;
    while (v.t >= 1) {
      v.t -= 1;
      if (!map.road[v.next]) v.next = pickNext(map, v.a, v.b);
      v.prev = v.a;
      v.a = v.b;
      v.b = v.next;
      v.next = pickNext(map, v.a, v.b);
      if (!map.road[v.b]) return false;
    }
    return true;
  }
}

function townRoads(map: WorldMap, town: Town): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, town.y - TOWN_EXTENT); y <= Math.min(map.height - 1, town.y + TOWN_EXTENT); y++) {
    for (let x = Math.max(0, town.x - TOWN_EXTENT); x <= Math.min(map.width - 1, town.x + TOWN_EXTENT); x++) {
      const i = y * map.width + x;
      if (map.road[i] && roadExits(map, i).length) out.push(i);
    }
  }
  return out;
}

function roadExits(map: WorldMap, i: number): number[] {
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    if (inBounds(map, x + dx, y + dy) && map.road[i + dy * map.width + dx]) out.push(i + dy * map.width + dx);
  }
  return out;
}

/** Następny kafelek za b (jadąc z a): losowo, bez zawracania, chyba że to ślepy zaułek. */
function pickNext(map: WorldMap, a: number, b: number): number {
  const exits = roadExits(map, b);
  const forward = exits.filter((e) => e !== a);
  const options = forward.length ? forward : exits;
  return options.length ? options[Math.floor(Math.random() * options.length)]! : a;
}

function spawn(map: WorldMap, tt: TownTraffic, kind: Kind): Vehicle | null {
  const pick = (list: number[]) => list[Math.floor(Math.random() * list.length)]!;
  const v: Vehicle = {
    kind,
    color: kind === 'bus' ? BUS_COLOR : kind === 'truck' ? pick(TRUCK_CABS) : pick(CAR_COLORS),
    variant: Math.floor(Math.random() * 1000),
    prev: 0,
    a: 0,
    b: 0,
    next: 0,
    t: 0,
  };
  return respawn(map, tt, v) ? v : null;
}

/** Stawia pojazd na losowym odcinku drogi miasta. */
function respawn(map: WorldMap, tt: TownTraffic, v: Vehicle): boolean {
  const candidates = tt.roads.filter((i) => map.road[i]);
  if (!candidates.length) return false;
  const a = candidates[Math.floor(Math.random() * candidates.length)]!;
  const exits = roadExits(map, a);
  if (!exits.length) return false;
  v.prev = a;
  v.a = a;
  v.b = exits[Math.floor(Math.random() * exits.length)]!;
  v.next = pickNext(map, v.a, v.b);
  v.t = Math.random();
  return true;
}

interface Pose {
  /** Środek pojazdu (współrzędne kafelka). */
  x: number;
  y: number;
  /** Kierunek jazdy (wektor jednostkowy). */
  ux: number;
  uy: number;
}

function delta(map: WorldMap, from: number, to: number): [number, number] {
  const d = to - from;
  if (d === 1 || d === -1) return [d, 0];
  return [0, Math.sign(d) * (Math.abs(d) === map.width ? 1 : 0)];
}

/** Prawa strona kierunku (dx, dy) w układzie kafelków (rzut zachowuje orientację, oś y w dół). */
const right = ([dx, dy]: [number, number]): [number, number] => [-dy, dx];

function vehiclePose(map: WorldMap, v: Vehicle): Pose {
  const d = delta(map, v.a, v.b);
  let [rx, ry] = right(d);
  // Na skrzyżowaniach pas płynnie przechodzi do pasa sąsiedniego odcinka.
  if (v.t < 0.25 && v.prev !== v.a) {
    const [px, py] = right(delta(map, v.prev, v.a));
    const k = 0.5 - v.t * 2;
    rx += (px - rx) * k;
    ry += (py - ry) * k;
  } else if (v.t > 0.75 && v.next !== v.b) {
    const [nx, ny] = right(delta(map, v.b, v.next));
    const k = (v.t - 0.75) * 2;
    rx += (nx - rx) * k;
    ry += (ny - ry) * k;
  }
  const ax = (v.a % map.width) + 0.5;
  const ay = Math.floor(v.a / map.width) + 0.5;
  return { x: ax + d[0] * v.t + rx * LANE, y: ay + d[1] * v.t + ry * LANE, ux: d[0], uy: d[1] };
}

/** Pojazd z grafiki OpenGFX: autobus, furgonetka (zamiast auta) lub ciężarówka z epoki gry. */
function drawVehicleSprite(g: Graphics, p: Pose, v: Vehicle): boolean {
  const def = gfxData().road[v.kind];
  const year = gfxYear();
  const base = def.eras[year < 1960 ? 0 : year < 1985 ? 1 : 2]!;
  const pal = def.colours[v.variant % def.colours.length]!;
  const at = tileToWorld(p.x, p.y);
  return drawSprite(g, palKey(base + ttdDirection(p.ux, p.uy), pal), at.x, at.y);
}

function drawCar(g: Graphics, p: Pose, v: Vehicle): void {
  if (v.kind !== 'truck') {
    const s = v.kind === 'bus' ? BUS : CAR;
    drawBlock(g, p, -s.len / 2, s.len / 2, s.half, s.h, v.color);
    return;
  }
  // Ciężarówka: skrzynia i kabina – najpierw część dalsza od widza.
  const split = TRUCK.len / 2 - TRUCK.len * TRUCK.cab;
  const box = () => drawBlock(g, p, -TRUCK.len / 2, split - 0.01, TRUCK.half, TRUCK.h, TRUCK_BOX);
  const cab = () => drawBlock(g, p, split, TRUCK.len / 2, TRUCK.half * 0.9, TRUCK.h - 1, v.color);
  if (p.ux + p.uy > 0) {
    box();
    cab();
  } else {
    cab();
    box();
  }
}

/** Prostopadłościan wzdłuż kierunku jazdy, od `a` do `b` (ułamki kafelka względem środka pojazdu). */
function drawBlock(g: Graphics, p: Pose, a: number, b: number, half: number, h: number, color: number): void {
  const sx = -p.uy * half;
  const sy = p.ux * half;
  const at = (k: number, side: number) => tileToWorld(p.x + p.ux * k + sx * side, p.y + p.uy * k + sy * side);
  const ground: Point[] = [at(b, 1), at(b, -1), at(a, -1), at(a, 1)];
  const top = ground.map((q) => ({ x: q.x, y: q.y - h }));
  g.poly(hull([...ground, ...top]).flatMap((q) => [q.x, q.y])).fill(darken(color, 0.6));
  g.poly(top.flatMap((q) => [q.x, q.y])).fill(color);
}
