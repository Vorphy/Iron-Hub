import { describe, expect, it } from 'vitest';
import { createRng, nextInt } from '../src/sim/rng';
import { buildTrackGraph, CURVE_LENGTH, STRAIGHT_LENGTH, type TrackGraph } from '../src/sim/track/graph';
import { ALL_TRACKS, Track, type TrackPiece } from '../src/sim/track/track';
import { generateMap, type WorldMap } from '../src/sim/world/map';

function mapWith(pieces: TrackPiece[], size = 12): WorldMap {
  const map = generateMap(size, size, 1);
  for (const p of pieces) map.track[p.y * size + p.x]! |= p.track;
  return map;
}

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/** Każdy element toru należy do dokładnie jednej krawędzi, a końce krawędzi zgadzają się z węzłami. */
function expectConsistent(g: TrackGraph, totalPieces: number): void {
  const seen = new Set<string>();
  for (const e of g.edges) {
    for (const p of e.pieces) {
      const key = `${p.x},${p.y},${p.track}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(g.nodes[e.a]!.halves[e.aHalf]).toContainEqual({ edge: e.id, end: 'a' });
    expect(g.nodes[e.b]!.halves[e.bHalf]).toContainEqual({ edge: e.id, end: 'b' });
  }
  expect(seen.size).toBe(totalPieces);
}

describe('graf torów', () => {
  it('pusta mapa daje pusty graf', () => {
    expect(buildTrackGraph(mapWith([]))).toEqual({ nodes: [], edges: [] });
  });

  it('prosty odcinek to jedna krawędź między dwoma końcami', () => {
    const g = buildTrackGraph(mapWith(xLine(2, 6, 4)));
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.length).toBe(5 * STRAIGHT_LENGTH);
    expect(g.edges[0]!.pieces).toHaveLength(5);
    expectConsistent(g, 5);
  });

  it('skrzyżowanie X i Y na jednym kafelku nie łączy linii', () => {
    const pieces = [...xLine(2, 6, 4), ...[2, 3, 4, 5, 6].map((y) => ({ x: 4, y, track: Track.Y }))];
    const g = buildTrackGraph(mapWith(pieces));
    expect(g.edges).toHaveLength(2);
    expect(g.nodes).toHaveLength(4);
    expectConsistent(g, 10);
  });

  it('zwrotnica dzieli tor na trzy krawędzie', () => {
    // Prosta X na y=5 i odgałęzienie łukiem Upper na kafelku (3,5) – wspólny port NW tego kafelka.
    const g = buildTrackGraph(mapWith([...xLine(0, 6, 5), { x: 3, y: 5, track: Track.Upper }]));
    expect(g.edges).toHaveLength(3);
    // Koniec zachodni, zwrotnica, koniec wschodni, koniec odgałęzienia.
    expect(g.nodes).toHaveLength(4);
    const sw = g.nodes.find((n) => n.halves[0].length + n.halves[1].length === 3)!;
    // Z jednej strony zwrotnicy jedna krawędź, z drugiej dwie (prosto i w łuk).
    expect([sw.halves[0].length, sw.halves[1].length].sort()).toEqual([1, 2]);
    expect(g.edges.map((e) => e.length).sort((a, b) => a - b)).toEqual([CURVE_LENGTH, 3 * STRAIGHT_LENGTH, 4 * STRAIGHT_LENGTH]);
    expectConsistent(g, 8);
  });

  it('zamknięta pętla bez rozgałęzień dostaje jeden węzeł', () => {
    // Cztery łuki wokół narożnika (5,5).
    const loop: TrackPiece[] = [
      { x: 5, y: 5, track: Track.Upper },
      { x: 4, y: 5, track: Track.Right },
      { x: 4, y: 4, track: Track.Lower },
      { x: 5, y: 4, track: Track.Left },
    ];
    const g = buildTrackGraph(mapWith(loop));
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.a).toBe(g.edges[0]!.b);
    expect(g.edges[0]!.length).toBe(4 * CURVE_LENGTH);
    expectConsistent(g, 4);
  });

  it('tor przy krawędzi mapy jest poprawnie obsłużony', () => {
    const g = buildTrackGraph(mapWith(xLine(0, 11, 0)));
    expect(g.edges).toHaveLength(1);
    expectConsistent(g, 12);
  });

  it('losowe układy torów są spójne', () => {
    const rng = createRng(99);
    for (let round = 0; round < 50; round++) {
      const pieces: TrackPiece[] = [];
      for (let i = 0; i < 60; i++) {
        pieces.push({ x: nextInt(rng, 0, 10), y: nextInt(rng, 0, 10), track: ALL_TRACKS[nextInt(rng, 0, 6)]! });
      }
      const map = mapWith(pieces, 10);
      const total = Array.from(map.track).reduce((n, bits) => n + ALL_TRACKS.filter((t) => bits & t).length, 0);
      expectConsistent(buildTrackGraph(map), total);
    }
  });
});
