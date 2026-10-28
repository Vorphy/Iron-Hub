import type { Graphics } from 'pixi.js';
import type { Depot } from '../../sim/depot/depot';
import type { Station } from '../../sim/station/station';
import { Side, Track, TRACK_SIDES, tracksOn } from '../../sim/track/track';
import { cornerHeights } from '../../sim/world/height';
import { sideHeight } from '../../sim/track/bridge';
import { type Corners, Foundation, tileFoundation, trackCorners } from '../../sim/track/foundation';
import { getTerrain, Terrain, type WorldMap } from '../../sim/world/map';
import { toWorld } from '../iso';
import { buildingsHidden } from '../visibility';
import { tileHash } from '../shapes';
import { drawSprite, gfxData, type HouseDef, palKey } from './gfx';

// Numery sprite'ów TTD (table/sprites.h w OpenTTD).
const SPR_FLAT_GRASS = 3981;
const SPR_FLAT_ROUGH = 4000;
const SPR_ROUGH_VARIANTS = [4019, 4020, 4021, 4022];
const SPR_WATER = 4061;
const SPR_RAIL_TRACK_Y = 1011;
const SPR_RAIL_TRACK_N_S = 1035;
const SPR_RAIL_TRACK_BASE = 1018;
const SPR_ROAD_Y = 1332;
const SPR_CROSSING_OFF_X = 1370;
const NUM_SLOPES = 19;
const SPR_FOUNDATION_BASE = 989;

/**
 * Zbocze kafelka w kodowaniu TTD: bity podniesionych narożników W=1 (lewy), S=2 (dolny), E=4 (prawy),
 * N=8 (górny), 16 – strome (jeden narożnik o 2 poziomy wyżej). `z` – wysokość najniższego narożnika.
 */
export function tileSlope(map: WorldMap, x: number, y: number): { slope: number; z: number } {
  return cornersSlope(cornerHeights(map, x, y));
}

/** Zbocze, po którym biegną tory kafelka – wierzch fundamentu, jeśli jest. */
export function railTileSlope(map: WorldMap, x: number, y: number): { slope: number; z: number } {
  return cornersSlope(trackCorners(map, x, y));
}

function cornersSlope([n, e, s, w]: Corners): { slope: number; z: number } {
  const z = Math.min(n, e, s, w);
  const max = Math.max(n, e, s, w);
  let slope = (w > z ? 1 : 0) | (s > z ? 2 : 0) | (e > z ? 4 : 0) | (n > z ? 8 : 0);
  if (max - z >= 2) slope |= 16;
  return { slope, z };
}

/** Indeks sprite'a terenu w grupie 19 zboczy (SlopeToSpriteOffset w OpenTTD). */
export function slopeOffset(slope: number): number {
  if (slope < 16) return slope === 15 ? 0 : slope;
  switch (slope) {
    case 29:
      return 15; // strome N
    case 23:
      return 16; // strome S
    case 27:
      return 17; // strome W
    case 30:
      return 18; // strome E
    default:
      return 0;
  }
}

/** Punkt zaczepienia sprite'a kafelka: górny narożnik na wysokości najniższego narożnika. */
function tileOrigin(x: number, y: number, z: number) {
  return toWorld(x, y, z);
}

/** Punkt w kafelku podany w 1/16 kafelka w osiach OpenTTD (x OpenTTD = nasze y). */
function subTile(x: number, y: number, z: number, ox: number, oy: number) {
  return toWorld(x + oy / 16, y + ox / 16, z);
}

/** Teren pod kafelkiem: trawa, nieużytek, woda albo brzeg. */
export function drawGround(g: Graphics, map: WorldMap, x: number, y: number): void {
  const { slope, z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  const t = getTerrain(map, x, y);
  if (t === Terrain.Water) {
    drawSprite(g, SPR_WATER, o.x, o.y);
    return;
  }
  // Brzeg: ląd z narożnikiem na poziomie wody.
  if (z === 0 && slope !== 0) {
    drawSprite(g, `SHORE:${slopeOffset(slope)}`, o.x, o.y);
    return;
  }
  if (t === Terrain.Rough) {
    const key = slope === 0 ? SPR_ROUGH_VARIANTS[tileHash(x, y) & 3]! : SPR_FLAT_ROUGH + slopeOffset(slope);
    drawSprite(g, key, o.x, o.y);
    return;
  }
  drawSprite(g, SPR_FLAT_GRASS + slopeOffset(slope), o.x, o.y);
}

/** Tor na zboczu: przesunięcie od SPR_RAIL_TRACK_Y według zbocza (_track_sloped_sprites). */
const TRACK_SLOPED: Record<number, number> = { 3: 22, 6: 21, 9: 23, 12: 20 };

/** Elementy toru pojedynczo (skrzyżowania, rozjazdy) – nakładki na grunt. */
const SINGLE: Record<number, number> = {
  [Track.Y]: 1005,
  [Track.X]: 1006,
  [Track.Upper]: 1007,
  [Track.Lower]: 1008,
  [Track.Right]: 1009,
  [Track.Left]: 1010,
};

/** Gotowe kafelki „tor + trawa” dla typowych układów. */
const COMBINED: Record<number, number> = {
  [Track.X]: SPR_RAIL_TRACK_Y,
  [Track.Y]: SPR_RAIL_TRACK_Y + 1,
  [Track.Upper]: SPR_RAIL_TRACK_Y + 2,
  [Track.Lower]: SPR_RAIL_TRACK_Y + 3,
  [Track.Right]: SPR_RAIL_TRACK_Y + 4,
  [Track.Left]: SPR_RAIL_TRACK_Y + 5,
  [Track.X | Track.Y]: SPR_RAIL_TRACK_Y + 6,
  [Track.Upper | Track.Lower]: SPR_RAIL_TRACK_N_S,
  [Track.Left | Track.Right]: SPR_RAIL_TRACK_N_S + 1,
};

function touches(bits: number, side: Side): boolean {
  return tracksOn(bits).some((t) => TRACK_SIDES[t].includes(side));
}

/** Tory z gruntem pod nimi (jak DrawTrackBits w OpenTTD). `bits` – tylko elementy do narysowania. */
export function drawTrackGround(g: Graphics, map: WorldMap, x: number, y: number, bits: number): void {
  drawFoundation(g, map, x, y);
  const { slope, z } = railTileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  if (slope !== 0) {
    const off = TRACK_SLOPED[slope];
    if (off !== undefined && (bits === Track.X || bits === Track.Y)) {
      drawSprite(g, SPR_RAIL_TRACK_Y + off, o.x, o.y);
      return;
    }
    // Poziome ukosy na zboczu: teren, a na nim tor na wysokości końców ukosu.
    drawGround(g, map, x, y);
    for (const t of tracksOn(bits)) {
      const p = toWorld(x, y, sideHeight(map, x, y, TRACK_SIDES[t][0]));
      drawSprite(g, SINGLE[t]!, p.x, p.y);
    }
    return;
  }
  const combined = COMBINED[bits];
  if (combined !== undefined) {
    drawSprite(g, combined, o.x, o.y);
    return;
  }
  // Rozjazd: grunt z tłuczniem tam, gdzie są tory, i każdy element osobno.
  const ground = !touches(bits, Side.NE)
    ? 0
    : !touches(bits, Side.SW)
      ? 1
      : !touches(bits, Side.NW)
        ? 2
        : !touches(bits, Side.SE)
          ? 3
          : 4;
  drawSprite(g, SPR_RAIL_TRACK_BASE + ground, o.x, o.y);
  for (const t of tracksOn(bits)) drawSprite(g, SINGLE[t]!, o.x, o.y);
}

/**
 * Ścianki fundamentu pod torami na zboczu (DrawFoundation w OpenTTD): poziomy – sprite 989 + zbocze,
 * pochyły – z dodatków OpenTTD, indeks: najwyższy narożnik × 2 + (oś Y OpenTTD, czyli nasz tor X).
 */
function drawFoundation(g: Graphics, map: WorldMap, x: number, y: number): void {
  const f = tileFoundation(map, x, y);
  if (f === Foundation.None) return;
  const { slope, z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  if (f === Foundation.Leveled) {
    drawSprite(g, SPR_FOUNDATION_BASE + slope, o.x, o.y);
    return;
  }
  // Pochyły tylko przy jednym podniesionym narożniku: W=1, S=2, E=4, N=8 -> narożnik 0–3.
  const corner = Math.log2(slope);
  const alongX = map.track[y * map.width + x] === Track.X ? 1 : 0;
  drawSprite(g, `FOUNDATIONS_SLOPES_HALFTILES:${corner * 2 + alongX}`, o.x, o.y);
}

/** Same szyny (bez gruntu) – tory metra w widoku poziomu −1. */
export function drawTrackOverlays(g: Graphics, ox: number, oy: number, bits: number): void {
  for (const t of tracksOn(bits)) drawSprite(g, SINGLE[t]!, ox, oy);
}

/**
 * Zjazd do metra na powierzchni: tor jak zwykle, a połowa kafelka od strony `down` to ciemny wykop
 * z betonowymi ścianami po bokach (tor znika w nim pod ziemią).
 */
export function drawRampPit(g: Graphics, map: WorldMap, x: number, y: number, down: Side): void {
  const { z } = tileSlope(map, x, y);
  // a: 0 – bok od strony powierzchni, 1 – bok, którym tor schodzi pod ziemię; b: w poprzek toru.
  const at = (a: number, b: number) => {
    const u = down === Side.NW || down === Side.NE ? 1 - a : a;
    return down === Side.SE || down === Side.NW ? toWorld(x + u, y + b, z) : toWorld(x + b, y + u, z);
  };
  const quad = (a0: number, a1: number, b0: number, b1: number) =>
    [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)].flatMap((p) => [p.x, p.y]);
  // Coraz ciemniej w stronę zejścia pod ziemię.
  for (let k = 0; k < 5; k++) {
    const a0 = 0.45 + k * 0.11;
    g.poly(quad(a0, a0 + 0.11, 0.14, 0.86)).fill({ color: 0x0c0e11, alpha: 0.3 + k * 0.17 });
  }
  // Betonowe ściany wykopu po bokach.
  g.poly(quad(0.45, 1, 0.08, 0.14)).fill(0xa9a49a);
  g.poly(quad(0.45, 1, 0.86, 0.92)).fill(0x8d887f);
}

/** Bity drogi jak w OpenTTD: NW=1, SW=2, SE=4, NE=8. */
const ROAD_BIT: Record<Side, number> = { [Side.NW]: 1, [Side.SW]: 2, [Side.SE]: 4, [Side.NE]: 8 };
const ROAD_OFFSETS = [0, 18, 17, 7, 16, 0, 10, 5, 15, 8, 1, 4, 9, 3, 6, 2];
const ROAD_SLOPED: Record<number, number> = { 12: 11, 6: 12, 3: 13, 9: 14 };

/** Droga miejska z chodnikami (ramiona do sąsiednich dróg); z torem – przejazd kolejowy. */
export function drawRoadGround(g: Graphics, map: WorldMap, x: number, y: number, arms: readonly Side[], trackBits: number): void {
  const { slope, z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  if (trackBits) {
    // Oś toru w OpenTTD: X = nasze Y.
    const axis = trackBits & Track.Y ? 0 : 1;
    drawSprite(g, SPR_CROSSING_OFF_X + axis + 4, o.x, o.y);
    return;
  }
  let bits = 0;
  for (const s of arms) bits |= ROAD_BIT[s];
  const off = slope !== 0 ? (ROAD_SLOPED[slope] ?? 0) : ROAD_OFFSETS[bits]!;
  drawSprite(g, SPR_ROAD_Y - NUM_SLOPES + off, o.x, o.y);
}

// ------------------------------------------------------------------ domy

/** Domy TTD pogrupowane według poziomu naszego domu (1–4) – po populacji budynku. */
let houseLevels: HouseDef[][] | null = null;

function levels(): HouseDef[][] {
  if (houseLevels) return houseLevels;
  const all = gfxData().houses.filter((h) => h.pop > 0 && !h.church);
  const band = (lo: number, hi: number) => all.filter((h) => h.pop > lo && h.pop <= hi);
  houseLevels = [band(0, 35), band(35, 100), band(100, 150), band(150, 10000)];
  return houseLevels;
}

/** Rok gry do wyboru wyglądu domów (ustawiany przez grę). */
let year = 1950;

export function setGfxYear(y: number): void {
  year = y;
}

export function gfxYear(): number {
  return year;
}

/** Budynki dostępne od początku gry (bez roku wprowadzenia) – zastępstwo, zanim pojawi się wylosowany. */
let houseFallback: HouseDef[][] | null = null;

function fallbacks(): HouseDef[][] {
  if (houseFallback) return houseFallback;
  const bands = levels();
  houseFallback = bands.map((_, k) => {
    // Najbliższy niższy (albo ten sam) poziom, w którym są domy dostępne od zawsze.
    for (let j = k; j >= 0; j--) {
      const always = bands[j]!.filter((d) => d.min <= 1900);
      if (always.length) return always;
    }
    return bands[k]!;
  });
  return houseFallback;
}

/**
 * Wygląd domu stały dla kafelka: budynek losowany raz z całego poziomu (bez względu na rok).
 * Dopóki wylosowany budynek nie istnieje w danym roku, stoi zastępczy z poziomu – więc kafelek zmienia
 * wygląd najwyżej raz (gdy wylosowany budynek wejdzie do gry) albo gdy dom się rozbuduje.
 */
function houseVariant(x: number, y: number, level: number) {
  const h = tileHash(x, y);
  const k = Math.min(3, Math.max(0, level - 1));
  const band = levels()[k]!;
  let def = band[h % band.length]!;
  if (def.min > year) {
    const list = fallbacks()[k]!;
    def = list[(h >>> 4) % list.length]!;
  }
  return def.variants[(h >>> 8) & 3]!;
}

/** Dom na kafelku: grunt (warstwa terenu) i budynek (warstwa obiektów); wygląd zależy od poziomu i roku. */
export function drawHouseTile(g: Graphics, objects: Graphics, map: WorldMap, x: number, y: number, level: number): void {
  const v = houseVariant(x, y, level);
  const { z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  drawSprite(g, v.ground, o.x, o.y);
  if (!buildingsHidden()) drawHouseBuilding(objects, map, x, y, level);
}

/** Sam budynek domu (także do dorysowania przed pojazdem, który zasłania). */
export function drawHouseBuilding(objects: Graphics, map: WorldMap, x: number, y: number, level: number): void {
  const v = houseVariant(x, y, level);
  const { z } = tileSlope(map, x, y);
  const b = subTile(x, y, z, v.dx, v.dy);
  drawSprite(objects, v.building, b.x, b.y);
}

// ------------------------------------------------------------------ drzewa

/** Gęstość lasów: szum wartości na siatce 6×6 kafelków (stały dla mapy). */
function treeNoise(x: number, y: number): number {
  const cell = 6;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const v = (a: number, b: number) => (tileHash(a + 7919, b + 104729) & 0xffff) / 0xffff;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = v(gx, gy) * (1 - sx) + v(gx + 1, gy) * sx;
  const bottom = v(gx, gy + 1) * (1 - sx) + v(gx + 1, gy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** Drzewa rosną tylko na pustej trawie i nieużytkach (bez torów, budynków, dróg, mostów i tuneli). */
export function tileTrees(map: WorldMap, x: number, y: number): number {
  const i = y * map.width + x;
  if (map.track[i] || map.station[i] || map.depot[i] || map.house[i] || map.industry[i] || map.road[i]) return 0;
  if (map.bridge[i] || map.tunnel[i] || getTerrain(map, x, y) === Terrain.Water) return 0;
  return treeCount(x, y);
}

/** Ile drzew rośnie na pustym kafelku (0 – żadne). Czysta dekoracja, poza symulacją. */
export function treeCount(x: number, y: number): number {
  const n = treeNoise(x, y);
  const h = tileHash(x, y);
  if (n < 0.62) return (h & 63) === 0 ? 1 : 0; // pojedyncze drzewa na łąkach
  return 1 + Math.min(3, Math.floor((n - 0.62) * 12 + ((h >>> 6) & 1)));
}

/** Drzewa na kafelku (układ i gatunki jak w OpenTTD, gatunek zależny od okolicy). */
export function drawTrees(objects: Graphics, map: WorldMap, x: number, y: number, count: number): void {
  const { trees } = gfxData();
  const h = tileHash(x, y);
  const region = tileHash(Math.floor(x / 9), Math.floor(y / 9));
  const type = (region + ((h >>> 12) & 1)) % 12;
  const sprites = trees.layouts[type * 4 + (h & 3)]!;
  const xy = trees.xy[(h >>> 2) & 3]!;
  const { slope, z } = tileSlope(map, x, y);
  const zt = z + (slope === 0 ? 0 : slope & 16 ? 1 : 0.5);
  const list = Array.from({ length: count }, (_, i) => ({ base: sprites[i]!, ox: xy[i]![0], oy: xy[i]![1], i }));
  list.sort((a, b) => a.ox + a.oy - (b.ox + b.oy));
  for (const t of list) {
    const stage = t.i === count - 1 ? 3 + ((h >>> 20) & 3) : 6;
    const p = subTile(x, y, zt, t.ox, t.oy);
    drawSprite(objects, t.base + stage, p.x, p.y);
  }
}

// ------------------------------------------------------------------ stacje i zajezdnie

const COMPANY = () => gfxData().company;

interface SeqItem {
  id: number;
  dx: number;
  dy: number;
  dz: number;
  glass?: boolean;
}

/** Układy peronów (station_land.h): [oś OpenTTD X][rodzaj]. Rodzaj: 0 – peron, 1 – budynek, 2/3 – dach A/B. */
const PLATFORMS: SeqItem[][][] = [
  [
    [
      { id: 1070, dx: 0, dy: 0, dz: 0 },
      { id: 1072, dx: 0, dy: 11, dz: 0 },
    ],
    [
      { id: 1073, dx: 0, dy: 0, dz: 0 },
      { id: 1072, dx: 0, dy: 11, dz: 0 },
    ],
    [
      { id: 1076, dx: 0, dy: 0, dz: 0 },
      { id: 1072, dx: 0, dy: 11, dz: 0 },
      { id: 1079, dx: 0, dy: 0, dz: 16 },
      { id: 1083, dx: 0, dy: 0, dz: 16, glass: true },
    ],
    [
      { id: 1070, dx: 0, dy: 0, dz: 0 },
      { id: 1078, dx: 0, dy: 11, dz: 0 },
      { id: 1081, dx: 0, dy: 0, dz: 16 },
      { id: 1085, dx: 0, dy: 0, dz: 16, glass: true },
    ],
  ],
  [
    [
      { id: 1071, dx: 0, dy: 0, dz: 0 },
      { id: 1069, dx: 11, dy: 0, dz: 0 },
    ],
    [
      { id: 1074, dx: 0, dy: 0, dz: 0 },
      { id: 1069, dx: 11, dy: 0, dz: 0 },
    ],
    [
      { id: 1077, dx: 0, dy: 0, dz: 0 },
      { id: 1069, dx: 11, dy: 0, dz: 0 },
      { id: 1080, dx: 0, dy: 0, dz: 16 },
      { id: 1084, dx: 0, dy: 0, dz: 16, glass: true },
    ],
    [
      { id: 1071, dx: 0, dy: 0, dz: 0 },
      { id: 1075, dx: 11, dy: 0, dz: 0 },
      { id: 1082, dx: 0, dy: 0, dz: 16 },
      { id: 1086, dx: 0, dy: 0, dz: 16, glass: true },
    ],
  ],
];

/**
 * Peron stacji: tor jako grunt, perony / budynek / zadaszenie jako obiekty. Rodzaj kafelka zależy
 * od położenia w rzędzie peronów: budynek na środku, zadaszenie na przemian, zwykłe perony na końcach.
 */
export function drawStationTile(g: Graphics, objects: Graphics, map: WorldMap, x: number, y: number, station: Station): void {
  const { z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  // Nasza oś x = oś Y OpenTTD; oś peronu z toru na kafelku (stacja z przesiadką może mieć perony w obu osiach).
  const ottdX = platformAxis(map.track[y * map.width + x]!, station) === 'y';
  drawSprite(g, ottdX ? SPR_RAIL_TRACK_Y + 1 : SPR_RAIL_TRACK_Y, o.x, o.y);
  // Bez budynków – same perony (bez budynku stacji i zadaszenia).
  const kind = buildingsHidden() ? 0 : stationKind(map, x, y, station);
  drawStationParts(objects, x, y, z, ottdX, kind, 0);
}

/** Rodzaj kafelka peronu: budynek na środku rzędu, zadaszenie na przemian, zwykłe perony na końcach. */
function stationKind(map: WorldMap, x: number, y: number, station: Station): number {
  const w = map.width;
  const axis = platformAxis(map.track[y * w + x]!, station);
  const along = (i: number) => (axis === 'x' ? i % w : Math.floor(i / w));
  const across = (i: number) => (axis === 'x' ? Math.floor(i / w) : i % w);
  const here = axis === 'x' ? y : x;
  const row = station.tiles.filter((i) => across(i) === here && map.track[i] === map.track[y * w + x]).map(along);
  const pos = (axis === 'x' ? x : y) - Math.min(...row);
  const len = row.length;
  if (len >= 3 && pos === Math.floor(len / 2)) return 1;
  if (len >= 3 && pos > 0 && pos < len - 1) return 2 + (pos & 1);
  return 0;
}

/** Oś peronu z bitów toru na kafelku (prosty X albo Y); bez toru – oś stacji. */
export function platformAxis(bits: number, station: Station): 'x' | 'y' {
  return bits === Track.X ? 'x' : bits === Track.Y ? 'y' : station.axis;
}

/** Części peronu od `from` (0 – całość; 1 – przednia krawędź i zadaszenie, zasłaniające pociąg). */
function drawStationParts(objects: Graphics, x: number, y: number, z: number, ottdX: boolean, kind: number, from: number): void {
  for (const it of PLATFORMS[ottdX ? 0 : 1]![kind]!.slice(from)) {
    const p = subTile(x, y, z + it.dz / 8, it.dx, it.dy);
    drawSprite(objects, it.glass ? `${it.id}@glass` : palKey(it.id, COMPANY()), p.x, p.y);
  }
}

/** Peron metra (widok −1): tor i perony po obu stronach, bez budynku i dachu. */
export function drawUnderPlatform(g: Graphics, map: WorldMap, x: number, y: number, axis: 'x' | 'y'): void {
  const { z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  const ottdX = axis === 'y';
  drawSprite(g, ottdX ? SPR_RAIL_TRACK_Y + 1 : SPR_RAIL_TRACK_Y, o.x, o.y);
  drawStationParts(g, x, y, z, ottdX, 0, 0);
}

/** Przednia krawędź peronu i zadaszenie – dorysowywane przed pociągiem stojącym przy peronie. */
export function drawStationFront(objects: Graphics, map: WorldMap, x: number, y: number, station: Station): void {
  const { z } = tileSlope(map, x, y);
  const kind = buildingsHidden() ? 0 : stationKind(map, x, y, station);
  drawStationParts(objects, x, y, z, platformAxis(map.track[y * map.width + x]!, station) === 'y', kind, 1);
}

/** Zajezdnia (track_land.h): grunt i budynek w kolorze firmy, wjazd od strony `depot.side`. */
export function drawDepotTile(g: Graphics, objects: Graphics, map: WorldMap, x: number, y: number, depot: Depot): void {
  const { z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  const layouts: Record<Side, { ground: number; parts: [number, number, number][] }> = {
    [Side.NE]: { ground: SPR_FLAT_GRASS, parts: [[1067, 2, 13]] },
    [Side.SE]: {
      ground: SPR_RAIL_TRACK_Y,
      parts: [
        [1063, 2, 2],
        [1064, 13, 2],
      ],
    },
    [Side.SW]: {
      ground: SPR_RAIL_TRACK_Y + 1,
      parts: [
        [1065, 2, 2],
        [1066, 2, 13],
      ],
    },
    [Side.NW]: { ground: SPR_FLAT_GRASS, parts: [[1068, 13, 2]] },
  };
  const l = layouts[depot.side];
  drawSprite(g, l.ground, o.x, o.y);
  for (const [id, dx, dy] of l.parts) {
    const p = subTile(x, y, z, dx, dy);
    drawSprite(objects, palKey(id, COMPANY()), p.x, p.y);
  }
}

// ------------------------------------------------------------------ zakłady

/**
 * Kafelek zakładu rysowany razem z mapą (w kolejności głębokości z domami): grunt w warstwie terenu,
 * budynek w warstwie obiektów. Kafelek bez części w układzie – sam teren.
 */
export function drawIndustryTile(
  g: Graphics,
  objects: Graphics,
  map: WorldMap,
  x: number,
  y: number,
  ind: { x: number; y: number; type: string },
): void {
  const t = gfxData().industries[ind.type]?.find((k) => ind.x + k.x === x && ind.y + k.y === y);
  if (!t) return drawGround(g, map, x, y);
  const { z } = tileSlope(map, x, y);
  const o = tileOrigin(x, y, z);
  drawSprite(g, t.ground, o.x, o.y);
  if (buildingsHidden()) return;
  const p = subTile(x, y, z, t.dx, t.dy);
  drawSprite(objects, t.building, p.x, p.y);
}

/** Budynek jednego kafelka zakładu (x, y) – do dorysowania przed pojazdem, który zasłania. */
export function drawIndustryBuilding(
  g: Graphics,
  map: WorldMap,
  ix: number,
  iy: number,
  type: string,
  x: number,
  y: number,
): void {
  const t = gfxData().industries[type]?.find((k) => ix + k.x === x && iy + k.y === y);
  if (!t) return;
  const { z } = tileSlope(map, x, y);
  const p = subTile(x, y, z, t.dx, t.dy);
  drawSprite(g, t.building, p.x, p.y);
}
