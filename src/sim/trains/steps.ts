import type { GameState } from '../state';
import { axisTrack, bridgeAt, bridgeRole, bridgeTrack, headSpanSide, isBridgeTrack, sideHeight } from '../track/bridge';
import { trackHeight } from '../track/foundation';
import { pieceLength, STRAIGHT_LENGTH } from '../track/graph';
import { isTunnelTrack, portalInnerSide, tunnelAt, tunnelRole, tunnelTrack } from '../track/tunnel';
import { heightAt } from '../world/height';
import { baseTrack, isUnderTrack, METRO_LEVEL, rampDown, rampTrack, underEntries } from '../track/metro';
import { oppositeSide, Side, SIDE_DELTA, Track, TRACK_SIDES, tracksOn } from '../track/track';
import { inBounds } from '../world/map';
import type { Step } from './train';

/** Długość „ogonka” zajezdni: od wjazdu do środka kafelka. */
export const DEPOT_STUB_LENGTH = 8;

// Środki boków w układzie logicznym; -1 = środek kafelka (wnętrze zajezdni).
const MID: Record<number, readonly [number, number]> = {
  [-1]: [0.5, 0.5],
  [Side.NE]: [0.5, 0],
  [Side.SE]: [1, 0.5],
  [Side.SW]: [0.5, 1],
  [Side.NW]: [0, 0.5],
};

export function stepLength(s: Step): number {
  if (s.track === 0) return DEPOT_STUB_LENGTH;
  if (isUnderTrack(s.track)) return pieceLength(baseTrack(s.track));
  if (isBridgeTrack(s.track) || isTunnelTrack(s.track)) return STRAIGHT_LENGTH;
  return pieceLength(s.track as Track);
}

export function flipStep(s: Step): Step {
  return { x: s.x, y: s.y, track: s.track, entry: s.exit, exit: s.entry };
}

const TRACK_INDEX: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
  4: 3,
  8: 4,
  16: 5,
  32: 6,
  64: 7,
  128: 8,
  256: 9,
  512: 10,
  // Metro (poziom −1).
  1024: 11,
  2048: 12,
  4096: 13,
  8192: 14,
  16384: 15,
  32768: 16,
};

/** Jednoznaczny klucz skierowanego odcinka (do słowników w wyszukiwaniu trasy). */
export function stepKey(s: Step, mapWidth: number): number {
  return ((s.y * mapWidth + s.x) * 17 + TRACK_INDEX[s.track]!) * 5 + (s.entry + 1);
}

/**
 * Odcinki, w które można wjechać po przejechaniu `s` (bez zawracania).
 * Kolejność deterministyczna: elementy toru w stałej kolejności, zajezdnia na końcu.
 */
export function successors(state: GameState, s: Step): Step[] {
  if (s.exit === -1) return [];
  const { map } = state;
  const [dx, dy] = SIDE_DELTA[s.exit];
  const x = s.x + dx;
  const y = s.y + dy;
  if (!inBounds(map, x, y)) return [];
  const entry = oppositeSide(s.exit);
  const straight = (track: number): Step => ({ x, y, track, entry, exit: oppositeSide(entry) });
  const metro = () => underEntries(map, x, y, entry).map((e) => ({ x, y, track: e.track, entry, exit: e.exit }));

  // Metro: pod ziemią tylko tory metra, a w zjazd – od jego dolnego boku – na powierzchnię.
  if (isUnderTrack(s.track)) {
    const down = rampDown(map, x, y);
    if (down !== null && entry === down) return [straight(rampTrack(down))];
    return metro();
  }
  // Zjazd: dolnym bokiem prosto pod ziemię; od dolnego boku nie wjeżdża się torem po powierzchni.
  if (rampDown(map, s.x, s.y) === s.exit) return metro();
  if (rampDown(map, x, y) === entry) return [];

  // Mosty: z rampy na pomost, po pomoście, z pomostu na drugi przyczółek.
  const here = bridgeAt(state, s.x, s.y);
  const next = bridgeAt(state, x, y);
  if (isBridgeTrack(s.track)) {
    if (!next || next !== here) return [];
    return [straight(bridgeRole(next, x, y) === 'span' ? s.track : axisTrack(next.axis))];
  }
  if (here && next === here && s.track === axisTrack(here.axis)) {
    const role = bridgeRole(here, s.x, s.y);
    if (role !== 'span' && s.exit === headSpanSide(here, role)) return [straight(bridgeTrack(here.axis))];
  }
  // Tunele: z portalu do wnętrza, wnętrzem, z wnętrza na drugi portal.
  const tHere = tunnelAt(state, s.x, s.y);
  const tNext = tunnelAt(state, x, y);
  if (isTunnelTrack(s.track)) {
    if (!tNext || tNext !== tHere) return [];
    return [straight(tunnelRole(tNext, x, y) === 'inside' ? s.track : axisTrack(tNext.axis))];
  }
  if (tHere && tNext === tHere && s.track === axisTrack(tHere.axis)) {
    const role = tunnelRole(tHere, s.x, s.y);
    if (role !== 'inside' && s.exit === portalInnerSide(tHere, role)) return [straight(tunnelTrack(tHere.axis))];
  }
  // Do portalu od strony wnętrza da się wjechać tylko z tunelu (nie torem po powierzchni).
  if (tNext) {
    const role = tunnelRole(tNext, x, y);
    if (role !== 'inside' && entry === portalInnerSide(tNext, role)) return [];
  }
  // Na przyczółek od strony pomostu da się wjechać tylko z pomostu (nie torem pod mostem).
  if (next) {
    const role = bridgeRole(next, x, y);
    if (role !== 'span' && entry === headSpanSide(next, role)) return [];
  }

  const out: Step[] = [];
  for (const track of tracksOn(map.track[y * map.width + x]!)) {
    const [a, b] = TRACK_SIDES[track];
    if (a === entry) out.push({ x, y, track, entry, exit: b });
    else if (b === entry) out.push({ x, y, track, entry, exit: a });
  }
  const depotId = map.depot[y * map.width + x];
  if (depotId && state.depots.find((d) => d.id === depotId)?.side === entry) {
    out.push({ x, y, track: 0, entry, exit: -1 });
  }
  return out;
}

/** Punkt na odcinku w odległości `d` od wejścia (układ logiczny, ułamkowe kafelki). */
export function pointOnStep(s: Step, d: number): { x: number; y: number } {
  const [ex, ey] = MID[s.entry]!;
  const [xx, xy] = MID[s.exit]!;
  const t = d / stepLength(s);
  return { x: s.x + ex + (xx - ex) * t, y: s.y + ey + (xy - ey) * t };
}

/**
 * Wysokość toru w punkcie odcinka (poziomy terenu): na pomoście – wysokość pomostu, na przyczółku –
 * rampa od zewnętrznej krawędzi do pomostu, poza mostami – teren.
 */
export function stepHeight(state: GameState, s: Step, d: number): number {
  const p = pointOnStep(s, d);
  if (s.track === 0) return heightAt(state.map, p.x, p.y);
  // Tunel: wnętrze i tor portalu na poziomie dolnej krawędzi wejścia.
  const tunnel = tunnelAt(state, s.x, s.y);
  if (tunnel && (isTunnelTrack(s.track) || (tunnelRole(tunnel, s.x, s.y) !== 'inside' && s.track === axisTrack(tunnel.axis)))) {
    return tunnel.level;
  }
  // Metro: płasko na stałym poziomie −1. Zjazd w fizyce schodzi o jeden poziom (z dowolnej wysokości
  // powierzchni – bez stromego spadku na płaskowyżu); skok między zjazdem a metrem nie liczy się do wzniesień,
  // bo te mierzymy w obrębie jednego odcinka.
  if (isUnderTrack(s.track)) return METRO_LEVEL;
  const down = rampDown(state.map, s.x, s.y);
  if (down !== null) {
    const t = d / stepLength(s);
    return heightAt(state.map, p.x, p.y) - (s.exit === down ? t : 1 - t);
  }
  const bridge = bridgeAt(state, s.x, s.y);
  // Ukos na zboczu leży poziomo – na wysokości swoich końców (środków boków kafelka).
  if (s.track >= Track.Upper && s.track <= Track.Right) {
    const e = pointOnStep(s, 0);
    return trackHeight(state.map, s.x, s.y, e.x - s.x, e.y - s.y);
  }
  // Teren albo wierzch fundamentu.
  const surface = () => trackHeight(state.map, s.x, s.y, p.x - s.x, p.y - s.y);
  if (!bridge) return surface();
  if (isBridgeTrack(s.track)) return bridge.deck;
  const role = bridgeRole(bridge, s.x, s.y);
  if (role === 'span' || s.track !== axisTrack(bridge.axis)) return surface();
  const spanSide = headSpanSide(bridge, role);
  const edge = (side: number) => (side === spanSide ? bridge.deck : sideHeight(state.map, s.x, s.y, side as Side));
  const t = d / stepLength(s);
  return edge(s.entry) * (1 - t) + edge(s.exit) * t;
}

/** Kierunek jazdy po odcinku jako para znaków – zmiana oznacza łuk 45°. */
export function stepDirection(s: Step): number {
  const [ex, ey] = MID[s.entry]!;
  const [xx, xy] = MID[s.exit]!;
  return (Math.sign(xx - ex) + 1) * 3 + (Math.sign(xy - ey) + 1);
}

export function isBend(a: Step, b: Step): boolean {
  return stepDirection(a) !== stepDirection(b);
}
