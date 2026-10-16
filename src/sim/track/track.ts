import type { WorldMap } from '../world/map';

/**
 * Boki kafelka nazwane jak na ekranie (rzut izometryczny):
 * NE – prawy górny (sąsiad y-1), SE – prawy dolny (x+1),
 * SW – lewy dolny (y+1), NW – lewy górny (x-1).
 */
export const Side = { NE: 0, SE: 1, SW: 2, NW: 3 } as const;
export type Side = (typeof Side)[keyof typeof Side];

export const SIDE_DELTA: Readonly<Record<Side, readonly [number, number]>> = {
  [Side.NE]: [0, -1],
  [Side.SE]: [1, 0],
  [Side.SW]: [0, 1],
  [Side.NW]: [-1, 0],
};

export function oppositeSide(s: Side): Side {
  return ((s + 2) & 3) as Side;
}

/**
 * Elementy toru na kafelku (jak w TTD) – każdy łączy dwa boki.
 * X i Y to proste wzdłuż osi, pozostałe to krótkie łuki przy narożnikach rombu;
 * łańcuch łuków daje tor ukośny (na ekranie poziomy lub pionowy).
 */
export const Track = {
  X: 1,
  Y: 2,
  Upper: 4,
  Lower: 8,
  Left: 16,
  Right: 32,
} as const;
export type Track = (typeof Track)[keyof typeof Track];

export const ALL_TRACKS: readonly Track[] = [Track.X, Track.Y, Track.Upper, Track.Lower, Track.Left, Track.Right];

export const TRACK_SIDES: Readonly<Record<Track, readonly [Side, Side]>> = {
  [Track.X]: [Side.NW, Side.SE],
  [Track.Y]: [Side.NE, Side.SW],
  [Track.Upper]: [Side.NW, Side.NE],
  [Track.Lower]: [Side.SE, Side.SW],
  [Track.Left]: [Side.SW, Side.NW],
  [Track.Right]: [Side.NE, Side.SE],
};

export interface TrackPiece {
  x: number;
  y: number;
  track: Track;
}

export function getTrackBits(map: WorldMap, x: number, y: number): number {
  return map.track[y * map.width + x]!;
}

export function hasTrack(map: WorldMap, x: number, y: number, track: Track): boolean {
  return (getTrackBits(map, x, y) & track) !== 0;
}

export function tracksOn(bits: number): Track[] {
  return ALL_TRACKS.filter((t) => (bits & t) !== 0);
}
