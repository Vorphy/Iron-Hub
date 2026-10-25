import type { CommandResult, SimEvent } from '../commands';
import { METRO_RAMP_COST, METRO_TRACK_COST, TRACK_REFUND_RATE } from '../config';
import { spend } from '../economy/finance';
import type { GameState } from '../state';
import { occupiedTiles } from '../trains/train';
import { isFlat } from '../world/height';
import { getTerrain, hasBuilding, inBounds, Terrain, type WorldMap } from '../world/map';
import type { TrackPlan } from './build';
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

/** Warstwa stacji dla elementu toru: metro (`stationUnder`) albo powierzchnia (`station`). */
export function stationLayer(map: WorldMap, track: number): Uint32Array {
  return isUnderTrack(track) ? map.stationUnder : map.station;
}

/** Bity toru kafelka na poziomie elementu `track` (metro albo powierzchnia). */
export function levelTrackBits(map: WorldMap, x: number, y: number, track: number): number {
  return (isUnderTrack(track) ? map.under : map.track)[y * map.width + x]!;
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
  // Także pod wodą (jak prawdziwe metro pod rzeką); tylko nie pod zjazdem – tam tor dopiero schodzi.
  // Na peronie metra – tylko jego własny tor.
  if (map.stationUnder[i]) return map.under[i] === p.track;
  return !map.ramp[i];
}

function unique(pieces: readonly TrackPiece[]): TrackPiece[] {
  const seen = new Set<string>();
  return pieces.filter((p) => {
    const key = `${p.x},${p.y},${p.track}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Plan budowy torów metra (bez zmiany stanu – też do podglądu). */
export function planBuildUnderTrack(state: GameState, pieces: readonly TrackPiece[]): TrackPlan {
  const { map } = state;
  let cost = 0;
  let blocked = false;
  const out = unique(pieces).map((piece) => {
    if (!underBuildable(map, piece)) {
      blocked = true;
      return { piece, status: 'blocked' as const };
    }
    if (map.under[piece.y * map.width + piece.x]! & piece.track) return { piece, status: 'exists' as const };
    cost += METRO_TRACK_COST;
    return { piece, status: 'new' as const };
  });
  const result: CommandResult = blocked
    ? { ok: false, reason: 'blocked' }
    : cost > state.money
      ? { ok: false, reason: 'noMoney' }
      : { ok: true };
  return { pieces: out, cost, result };
}

/** Tory metra: dużo droższe od zwykłych (drążenie), bez ograniczeń terenu na powierzchni. */
export function buildUnderTrack(state: GameState, pieces: readonly TrackPiece[], events: SimEvent[]): CommandResult {
  const plan = planBuildUnderTrack(state, pieces);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  for (const { piece, status } of plan.pieces) if (status === 'new') map.under[piece.y * map.width + piece.x]! |= piece.track;
  spend(state, 'construction', plan.cost);
  events.push({ type: 'undergroundChanged' });
  return { ok: true };
}

/** Plan rozbiórki torów metra (tylko istniejące elementy; zwrot części kosztu). */
export function planRemoveUnderTrack(state: GameState, pieces: readonly TrackPiece[]): TrackPlan {
  const { map } = state;
  const busy = occupiedTiles(state);
  let count = 0;
  let inWay = false;
  const out = unique(pieces).map((piece) => {
    const i = piece.y * map.width + piece.x;
    const exists = inBounds(map, piece.x, piece.y) && !map.stationUnder[i] && (map.under[i]! & piece.track) !== 0;
    if (!exists) return { piece, status: 'blocked' as const };
    count++;
    if (busy.has(i)) inWay = true;
    return { piece, status: 'exists' as const };
  });
  const result: CommandResult = inWay
    ? { ok: false, reason: 'trainInWay' }
    : count
      ? { ok: true }
      : { ok: false, reason: 'nothingToRemove' };
  return { pieces: out, cost: -Math.round(count * METRO_TRACK_COST * TRACK_REFUND_RATE), result };
}

export function removeUnderTrack(state: GameState, pieces: readonly TrackPiece[], events: SimEvent[]): CommandResult {
  const plan = planRemoveUnderTrack(state, pieces);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  for (const { piece, status } of plan.pieces) if (status === 'exists') map.under[piece.y * map.width + piece.x]! &= ~piece.track;
  spend(state, 'construction', plan.cost);
  events.push({ type: 'undergroundChanged' });
  return { ok: true };
}

/**
 * Zjazd do metra na kafelku (x, y): prosty tor w osi, schodzący pod ziemię bokiem `down`.
 * Kafelek płaski, bez budynku i innej infrastruktury (najwyżej tor w osi zjazdu); po stronie `down`
 * kafelek nie może być wodą.
 */
export function planRamp(state: GameState, x: number, y: number, down: Side): { cost: number; result: CommandResult } {
  const { map } = state;
  const cost = METRO_RAMP_COST;
  if (!inBounds(map, x, y)) return { cost, result: { ok: false, reason: 'blocked' } };
  const i = y * map.width + x;
  const track = rampTrack(down);
  const [dx, dy] = SIDE_DELTA[down];
  const below = inBounds(map, x + dx, y + dy) ? (y + dy) * map.width + x + dx : -1;
  const blocked =
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
    map.terrain[below] === Terrain.Water;
  if (blocked) return { cost, result: { ok: false, reason: 'blocked' } };
  if (state.money < cost) return { cost, result: { ok: false, reason: 'noMoney' } };
  return { cost, result: { ok: true } };
}

export function buildRamp(state: GameState, x: number, y: number, down: Side, events: SimEvent[]): CommandResult {
  const plan = planRamp(state, x, y, down);
  if (!plan.result.ok) return plan.result;
  const { map } = state;
  const i = y * map.width + x;
  spend(state, 'construction', plan.cost);
  map.track[i] = rampTrack(down);
  map.ramp[i] = down + 1;
  events.push({ type: 'tileChanged', x, y }, { type: 'undergroundChanged' });
  return { ok: true };
}

/**
 * Kierunek zjazdu dobrany do otoczenia: w dół w stronę toru metra obok, a jeśli go nie ma –
 * w stronę przeciwną do toru na powierzchni, który do kafelka dochodzi. Inaczej `fallback`.
 */
export function autoRampDown(map: WorldMap, x: number, y: number, fallback: Side): Side {
  const sides = [Side.NE, Side.SE, Side.SW, Side.NW] as const;
  const touches = (bits: number, side: Side) => tracksOn(bits).some((t) => TRACK_SIDES[t].includes(side));
  for (const s of sides) {
    const [dx, dy] = SIDE_DELTA[s];
    if (inBounds(map, x + dx, y + dy) && touches(map.under[(y + dy) * map.width + x + dx]!, oppositeSide(s))) return s;
  }
  for (const s of sides) {
    const [dx, dy] = SIDE_DELTA[s];
    if (inBounds(map, x + dx, y + dy) && touches(map.track[(y + dy) * map.width + x + dx]!, oppositeSide(s)))
      return oppositeSide(s);
  }
  return fallback;
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
