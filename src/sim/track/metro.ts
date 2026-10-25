import type { CommandResult, SimEvent } from '../commands';
import { METRO_RAMP_COST, METRO_TRACK_COST, TRACK_REFUND_RATE } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { occupiedTiles } from '../trains/train';
import { isFlat } from '../world/height';
import { getTerrain, hasBuilding, inBounds, Terrain, type WorldMap } from '../world/map';
import { oppositeSide, Side, SIDE_DELTA, Track, TRACK_SIDES, tracksOn, type TrackPiece } from './track';

/**
 * Metro – drugi poziom torów pod mapą (poziom −1). Tory pod ziemią leżą w warstwie `map.under`
 * (te same bity co na powierzchni), stacje podziemne w `map.stationUnder`. Z powierzchnią łączą
 * je zjazdy (`map.ramp`): kafelek z prostym torem, który jednym bokiem schodzi pod ziemię.
 *
 * W trasie pociągu element toru pod ziemią ma kod przesunięty o UNDER_SHIFT bitów (1024–32768),
 * więc nie myli się z torami na powierzchni, mostami (64, 128) ani tunelami (256, 512).
 */
export const UNDER_SHIFT = 10;

/** Kod elementu toru pod ziemią (w odcinkach jazdy pociągu). */
export function underTrack(track: Track): number {
  return track << UNDER_SHIFT;
}

export function isUnderTrack(track: number): boolean {
  return track >= 1 << UNDER_SHIFT;
}

/** Zwykły element toru (bity jak na powierzchni) dla kodu spod ziemi. */
export function baseTrack(track: number): Track {
  return (isUnderTrack(track) ? track >> UNDER_SHIFT : track) as Track;
}

/** Bok, którym tor zjazdu schodzi pod ziemię (null – kafelek nie jest zjazdem). */
export function rampDown(map: WorldMap, x: number, y: number): Side | null {
  if (!inBounds(map, x, y)) return null;
  const v = map.ramp[y * map.width + x]!;
  return v ? ((v - 1) as Side) : null;
}

/** Tor na powierzchni zjazdu – prosty w osi zjazdu. */
export function rampTrack(down: Side): Track {
  return down === Side.NW || down === Side.SE ? Track.X : Track.Y;
}

function underBuildable(map: WorldMap, p: TrackPiece): boolean {
  if (!inBounds(map, p.x, p.y)) return false;
  const i = p.y * map.width + p.x;
  // Pod wodą i pod zjazdem (tam tor dopiero schodzi) metra nie kopiemy.
  return getTerrain(map, p.x, p.y) !== Terrain.Water && !map.ramp[i];
}

/** Tory metra: dużo droższe od zwykłych (drążenie), bez ograniczeń terenu na powierzchni. */
export function buildUnderTrack(state: GameState, pieces: readonly TrackPiece[], events: SimEvent[]): CommandResult {
  const { map } = state;
  const fresh = pieces.filter((p) => !(map.under[p.y * map.width + p.x]! & p.track));
  if (!fresh.length) return { ok: true };
  if (!fresh.every((p) => underBuildable(map, p))) return { ok: false, reason: 'blocked' };
  const cost = fresh.length * METRO_TRACK_COST;
  if (state.money < cost) return { ok: false, reason: 'noMoney' };
  spend(state, 'construction', cost);
  for (const p of fresh) map.under[p.y * map.width + p.x]! |= p.track;
  events.push({ type: 'undergroundChanged' });
  return { ok: true };
}

export function removeUnderTrack(state: GameState, pieces: readonly TrackPiece[], events: SimEvent[]): CommandResult {
  const { map } = state;
  const present = pieces.filter((p) => inBounds(map, p.x, p.y) && map.under[p.y * map.width + p.x]! & p.track);
  if (!present.length) return { ok: true };
  // Nie spod jadącego pociągu (zajęte kafelki – jak na powierzchni).
  const busy = occupiedTiles(state);
  if (present.some((p) => busy.has(p.y * map.width + p.x))) return { ok: false, reason: 'trainInWay' };
  for (const p of present) {
    const i = p.y * map.width + p.x;
    if (map.stationUnder[i]) continue; // tor peronu usuwa się razem ze stacją
    map.under[i]! &= ~p.track;
  }
  spend(state, 'construction', -Math.round(present.length * METRO_TRACK_COST * TRACK_REFUND_RATE));
  events.push({ type: 'undergroundChanged' });
  return { ok: true };
}

/**
 * Zjazd do metra na kafelku (x, y): prosty tor w osi, schodzący pod ziemię bokiem `down`.
 * Kafelek płaski, bez budynku i innej infrastruktury (najwyżej tor w osi zjazdu); po stronie `down`
 * kafelek nie może być wodą.
 */
export function buildRamp(state: GameState, x: number, y: number, down: Side, events: SimEvent[]): CommandResult {
  const { map } = state;
  if (!inBounds(map, x, y)) return { ok: false, reason: 'blocked' };
  const i = y * map.width + x;
  const track = rampTrack(down);
  const [dx, dy] = SIDE_DELTA[down];
  const below = inBounds(map, x + dx, y + dy) ? (y + dy) * map.width + x + dx : -1;
  if (
    map.ramp[i] ||
    !isFlat(map, x, y) ||
    getTerrain(map, x, y) === Terrain.Water ||
    hasBuilding(map, i) ||
    map.station[i] ||
    map.depot[i] ||
    map.bridge[i] ||
    map.tunnel[i] ||
    map.road[i] ||
    map.under[i] ||
    (map.track[i] && map.track[i] !== track) ||
    below < 0 ||
    map.terrain[below] === Terrain.Water
  ) {
    return { ok: false, reason: 'blocked' };
  }
  if (state.money < METRO_RAMP_COST) return { ok: false, reason: 'noMoney' };
  spend(state, 'construction', METRO_RAMP_COST);
  map.track[i] = track;
  map.ramp[i] = down + 1;
  events.push({ type: 'tileChanged', x, y }, { type: 'undergroundChanged' });
  return { ok: true };
}

/** Rozbiórka zjazdu (razem z jego torem). */
export function removeRamp(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const { map } = state;
  const i = y * map.width + x;
  if (!map.ramp[i]) return { ok: false, reason: 'blocked' };
  if (occupiedTiles(state).has(i)) return { ok: false, reason: 'trainInWay' };
  map.ramp[i] = 0;
  map.track[i] = 0;
  spend(state, 'construction', -Math.round(METRO_RAMP_COST * TRACK_REFUND_RATE));
  events.push({ type: 'tileChanged', x, y }, { type: 'undergroundChanged' });
  return { ok: true };
}

/** Elementy toru metra na kafelku (kody spod ziemi), w które da się wjechać od boku `entry`. */
export function underEntries(map: WorldMap, x: number, y: number, entry: Side): { track: number; exit: Side }[] {
  const out: { track: number; exit: Side }[] = [];
  for (const t of tracksOn(map.under[y * map.width + x]!)) {
    const [a, b] = TRACK_SIDES[t];
    if (a === entry) out.push({ track: underTrack(t), exit: b });
    else if (b === entry) out.push({ track: underTrack(t), exit: a });
  }
  return out;
}

/** Bok zjazdu od strony powierzchni (wjazd z normalnego toru). */
export function rampTop(down: Side): Side {
  return oppositeSide(down);
}
