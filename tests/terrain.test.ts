import { describe, expect, it } from 'vitest';
import { HEIGHT_PX, pickTile, setHeightProvider, tileToWorld, tileToWorldFlat } from '../src/render/iso';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { cornerHeights, heightAt, MAX_HEIGHT, tileSlope } from '../src/sim/world/height';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

/** Płaski świat 40×12; od wierzchołka vx0 teren rośnie o 1 poziom na kafelek do `top`. */
function rampWorld(vx0 = 10, top = 4): GameState {
  const s = createGame({ width: 40, height: 12, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  const vw = s.map.width + 1;
  for (let vy = 0; vy <= s.map.height; vy++) {
    for (let vx = 0; vx <= s.map.width; vx++) s.map.heights[vy * vw + vx] = Math.max(0, Math.min(top, vx - vx0));
  }
  return s;
}

describe('zbocza', () => {
  it('klasyfikacja: płaski, zbocze w osi X lub Y, inne', () => {
    const s = rampWorld();
    expect(tileSlope(s.map, 5, 5)).toBe('flat');
    expect(tileSlope(s.map, 11, 5)).toBe('x');
    expect(cornerHeights(s.map, 11, 5)).toEqual([1, 2, 2, 1]);
    // Pojedynczy podniesiony narożnik.
    s.map.heights[3 * 41 + 3] = 1;
    expect(tileSlope(s.map, 3, 3)).toBe('other');
    expect(heightAt(s.map, 11.5, 5.5)).toBeCloseTo(1.5);
  });

  it('tor: na zboczu tylko prosty w górę zbocza, łuki tylko na płaskim', () => {
    const s = rampWorld();
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 20, 5) });
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 12, y: 7, track: Track.Y }] });
    sim.enqueue({ type: 'buildTrack', pieces: [{ x: 12, y: 8, track: Track.Upper }] });
    sim.step();
    const fails = sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
    expect(fails).toEqual(['blocked', 'blocked']);
    expect(s.map.track[5 * 40 + 12]).toBe(Track.X);
  });

  it('stacja, zajezdnia tylko na płaskim (stacja na jednej wysokości)', () => {
    const s = rampWorld();
    const sim = new Simulation(s);
    sim.enqueue({ type: 'buildStation', x0: 10, y0: 2, x1: 12, y1: 2, axis: 'x' });
    sim.enqueue({ type: 'buildDepot', x: 12, y: 8, side: Side.SE });
    sim.enqueue({ type: 'buildStation', x0: 2, y0: 2, x1: 5, y1: 2, axis: 'x' });
    sim.step();
    const fails = sim.drainEvents().flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));
    expect(fails).toEqual(['blocked', 'blocked']);
    expect(s.stations).toHaveLength(1);
  });
});

describe('generator wysokości', () => {
  it('sąsiednie narożniki różnią się najwyżej o 1, woda na poziomie 0, są wzgórza', () => {
    const s = createGame({ width: 128, height: 128, seed: 7 });
    const { map } = s;
    const vw = map.width + 1;
    for (let vy = 0; vy <= map.height; vy++) {
      for (let vx = 0; vx <= map.width; vx++) {
        const h = map.heights[vy * vw + vx]!;
        expect(h).toBeLessThanOrEqual(MAX_HEIGHT);
        if (vx > 0) expect(Math.abs(h - map.heights[vy * vw + vx - 1]!)).toBeLessThanOrEqual(1);
        if (vy > 0) expect(Math.abs(h - map.heights[(vy - 1) * vw + vx]!)).toBeLessThanOrEqual(1);
      }
    }
    for (let i = 0; i < map.terrain.length; i++) {
      if (map.terrain[i] === Terrain.Water) expect(cornerHeights(map, i % 128, Math.floor(i / 128))).toEqual([0, 0, 0, 0]);
    }
    expect(Math.max(...map.heights)).toBeGreaterThanOrEqual(4);
  });

  it('domy i zakłady stoją na płaskim terenie', () => {
    const s = createGame({ width: 128, height: 128, seed: 7 });
    for (let i = 0; i < s.map.house.length; i++) {
      if (s.map.house[i] || s.map.industry[i]) expect(tileSlope(s.map, i % 128, Math.floor(i / 128))).toBe('flat');
    }
  });

  it('wysokości przechodzą przez zapis', () => {
    const s = createGame({ width: 64, height: 64, seed: 3 });
    expect(deserializeState(JSON.parse(JSON.stringify(serializeState(s)))).map.heights).toEqual(s.map.heights);
  });
});

describe('wskazywanie kursorem na wzgórzu', () => {
  it('trafia w kafelek na zboczu, a nie w ten „pod nim” na płaskim rzucie', () => {
    const s = rampWorld(10, 4);
    setHeightProvider((fx, fy) => heightAt(s.map, fx, fy));
    try {
      for (const [x, y] of [
        [15, 5],
        [12, 6],
        [5, 5],
      ] as const) {
        const p = tileToWorld(x + 0.5, y + 0.5);
        const f = pickTile(p.x, p.y, MAX_HEIGHT);
        expect([Math.floor(f.x), Math.floor(f.y)]).toEqual([x, y]);
      }
      // Na płaskim rzucie ten sam punkt ekranu wskazałby inny kafelek.
      const p = tileToWorld(15.5, 5.5);
      expect(p.y).toBe(tileToWorldFlat(15.5, 5.5).y - 4 * HEIGHT_PX);
    } finally {
      setHeightProvider(() => 0);
    }
  });
});

describe('pociąg na wzniesieniu', () => {
  it('pod górę jedzie wolniej niż po płaskim', () => {
    const speedAt = (s: GameState) => {
      const sim = new Simulation(s);
      sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 38, 5) });
      sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
      sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'grom', wagons: Array(8).fill('weglarka') });
      sim.step();
      sim.enqueue({ type: 'startTrain', trainId: 1 });
      const t = s.trains[0]!;
      let max = 0;
      for (let i = 0; i < 3000; i++) {
        sim.step();
        // Tylko pierwszy przejazd (pod górę) – po zawróceniu pociąg zjeżdża z górki.
        if (!t.reversed && t.trail[0]!.x >= 12 && t.trail[0]!.x <= 15) max = Math.max(max, t.speed);
      }
      return max;
    };
    const flat = speedAt(rampWorld(10, 0));
    const hill = speedAt(rampWorld(10, 8));
    expect(hill).toBeLessThan(flat);
    expect(hill).toBeGreaterThan(0);
  });
});
