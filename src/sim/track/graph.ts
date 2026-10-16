import type { Depot } from '../depot/depot';
import type { WorldMap } from '../world/map';
import { Side, Track, TRACK_SIDES, tracksOn, type TrackPiece } from './track';

/**
 * Graf torów wyprowadzany z kafelków. Nie jest zapisywany – po każdej zmianie torów
 * budujemy go od nowa (koszt ~ liczba kafelków z torem).
 *
 * Port = granica między dwoma kafelkami (środek boku). Każdy element toru łączy dwa porty.
 * Port ma dwie „połówki” – po jednej na każdy z sąsiednich kafelków. Pociąg przechodzi przez
 * port zawsze z jednej połówki do drugiej (bez zawracania pod ostrym kątem).
 *
 * Węzeł = port, który nie jest zwykłym przejściem 1→1: koniec toru albo zwrotnica.
 * Krawędź = ciąg elementów między dwoma węzłami.
 */

/** Długości w jednostkach toru (całkowite – determinizm). */
export const STRAIGHT_LENGTH = 16;
export const CURVE_LENGTH = 11;

export function pieceLength(track: Track): number {
  return track === Track.X || track === Track.Y ? STRAIGHT_LENGTH : CURVE_LENGTH;
}

export interface Port {
  /** Kafelek „właściciel” portu; port to jego bok NE albo NW. */
  x: number;
  y: number;
  side: typeof Side.NE | typeof Side.NW;
}

export type Half = 0 | 1;

export interface EdgeEnd {
  edge: number;
  /** Który koniec krawędzi dotyka węzła. */
  end: 'a' | 'b';
}

export interface TrackNode {
  id: number;
  port: Port;
  /** Zajezdnia, której wjazd leży w tym porcie. */
  depot?: number;
  /** Krawędzie wychodzące w połówkę 0 (kafelek-właściciel) i 1 (sąsiad). */
  halves: [EdgeEnd[], EdgeEnd[]];
}

export interface TrackEdge {
  id: number;
  a: number;
  b: number;
  /** Połówka portu węzła a/b, po której leży krawędź. */
  aHalf: Half;
  bHalf: Half;
  /** Elementy w kolejności od a do b. */
  pieces: TrackPiece[];
  length: number;
}

export interface TrackGraph {
  nodes: TrackNode[];
  edges: TrackEdge[];
}

/** Port na boku `side` kafelka (x, y) oraz połówka, w której leży ten kafelek. */
export function portOf(x: number, y: number, side: Side): { port: Port; half: Half } {
  switch (side) {
    case Side.NE:
    case Side.NW:
      return { port: { x, y, side }, half: 0 };
    case Side.SE:
      return { port: { x: x + 1, y, side: Side.NW }, half: 1 };
    case Side.SW:
      return { port: { x, y: y + 1, side: Side.NE }, half: 1 };
  }
}

function portKey(p: Port): number {
  // Porty mogą leżeć tuż za krawędzią mapy (x/y = -1 lub width) – przesunięcie o 1.
  return ((p.y + 1) * 4096 + (p.x + 1)) * 2 + (p.side === Side.NE ? 0 : 1);
}

interface PortSlot {
  port: Port;
  halves: [number[], number[]];
}

/** Znacznik zajezdni w połówce portu (ujemny, żeby nie mylić z indeksem elementu toru). */
const depotMark = (id: number) => -id;

export function buildTrackGraph(map: WorldMap, depots: readonly Depot[] = []): TrackGraph {
  const pieces: TrackPiece[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const bits = map.track[y * map.width + x]!;
      if (bits) for (const track of tracksOn(bits)) pieces.push({ x, y, track });
    }
  }

  // Indeks: port -> elementy toru w każdej połówce.
  const slots = new Map<number, PortSlot>();
  const piecePorts: [number, number][] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const keys = TRACK_SIDES[p.track].map((side) => {
      const { port, half } = portOf(p.x, p.y, side);
      const key = portKey(port);
      let slot = slots.get(key);
      if (!slot) slots.set(key, (slot = { port, halves: [[], []] }));
      slot.halves[half].push(i);
      return key;
    }) as [number, number];
    piecePorts.push(keys);
  }

  // Wjazd zajezdni jest jak koniec toru – zawsze węzeł.
  for (const d of depots) {
    const { port, half } = portOf(d.x, d.y, d.side);
    const key = portKey(port);
    let slot = slots.get(key);
    if (!slot) slots.set(key, (slot = { port, halves: [[], []] }));
    slot.halves[half].push(depotMark(d.id));
  }

  const isSimple = (s: PortSlot) =>
    s.halves[0].length === 1 && s.halves[1].length === 1 && s.halves[0][0]! >= 0 && s.halves[1][0]! >= 0;

  const graph: TrackGraph = { nodes: [], edges: [] };
  const nodeByKey = new Map<number, TrackNode>();
  const addNode = (key: number): TrackNode => {
    let node = nodeByKey.get(key);
    if (!node) {
      const slot = slots.get(key)!;
      node = { id: graph.nodes.length, port: slot.port, halves: [[], []] };
      const depot = [...slot.halves[0], ...slot.halves[1]].find((v) => v < 0);
      if (depot !== undefined) node.depot = -depot;
      graph.nodes.push(node);
      nodeByKey.set(key, node);
    }
    return node;
  };
  // Deterministyczna kolejność: porty w kolejności pierwszego wystąpienia.
  for (const [key, slot] of slots) if (!isSimple(slot)) addNode(key);

  const used = new Uint8Array(pieces.length);

  const walk = (startKey: number, startHalf: Half, first: number): void => {
    const start = nodeByKey.get(startKey)!;
    const edgePieces: TrackPiece[] = [];
    let length = 0;
    let piece = first;
    let fromKey = startKey;
    for (;;) {
      used[piece] = 1;
      const p = pieces[piece]!;
      edgePieces.push(p);
      length += pieceLength(p.track);
      const [k0, k1] = piecePorts[piece]!;
      const nextKey = k0 === fromKey && k1 !== fromKey ? k1 : k0;
      const slot = slots.get(nextKey)!;
      const myHalf: Half = slot.halves[0].includes(piece) ? 0 : 1;
      const end = nodeByKey.get(nextKey);
      if (end) {
        const id = graph.edges.length;
        graph.edges.push({ id, a: start.id, b: end.id, aHalf: startHalf, bHalf: myHalf, pieces: edgePieces, length });
        start.halves[startHalf].push({ edge: id, end: 'a' });
        end.halves[myHalf].push({ edge: id, end: 'b' });
        return;
      }
      piece = slot.halves[myHalf === 0 ? 1 : 0][0]!;
      fromKey = nextKey;
    }
  };

  const startEdges = (key: number) => {
    const slot = slots.get(key)!;
    for (const half of [0, 1] as const) {
      for (const piece of slot.halves[half]) if (piece >= 0 && !used[piece]) walk(key, half, piece);
    }
  };

  for (const node of [...graph.nodes]) startEdges(portKey(node.port));

  // Zamknięte pętle bez żadnego węzła – jeden z portów staje się węzłem.
  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue;
    const key = piecePorts[i]![0];
    addNode(key);
    startEdges(key);
  }

  return graph;
}

