import { describe, expect, it } from 'vitest';
import { deserializeState, SaveError, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Track } from '../src/sim/track/track';

function playedSim(): Simulation {
  const sim = new Simulation(createGame({ width: 32, height: 24, seed: 3 }));
  sim.state.map.terrain.fill(0);
  sim.enqueue({ type: 'buildTrack', pieces: [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 4, track: Track.X })) });
  sim.enqueue({ type: 'buildStation', x0: 2, y0: 4, x1: 4, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 10, y0: 10, x1: 10, y1: 13, axis: 'y' });
  for (let i = 0; i < 100; i++) sim.step();
  return sim;
}

/** Zapis przechodzi przez JSON tak jak do pliku / IndexedDB. */
const roundTrip = (sim: Simulation) => deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));

describe('zapis gry', () => {
  it('odtwarza identyczny stan', () => {
    const sim = playedSim();
    const loaded = roundTrip(sim);
    expect(loaded).toEqual(sim.state);
    expect(serializeState(loaded)).toEqual(serializeState(sim.state));
  });

  it('wczytana gra toczy się dalej identycznie (determinizm)', () => {
    const a = playedSim();
    const b = new Simulation(roundTrip(a));
    for (const sim of [a, b]) {
      sim.enqueue({ type: 'buildTrack', pieces: [{ x: 8, y: 8, track: Track.Upper }] });
      sim.enqueue({ type: 'clearTile', x: 3, y: 5 });
      for (let i = 0; i < 500; i++) sim.step();
    }
    expect(serializeState(b.state)).toEqual(serializeState(a.state));
    expect(b.graph).toEqual(a.graph);
  });

  it('wczytany stan nie dzieli tablic z oryginałem', () => {
    const sim = playedSim();
    const loaded = roundTrip(sim);
    loaded.map.track[0] = 63;
    loaded.stations[0]!.tiles.push(999);
    expect(sim.state.map.track[0]).toBe(0);
    expect(sim.state.stations[0]!.tiles).not.toContain(999);
  });

  it('odrzuca uszkodzone dane', () => {
    const good = serializeState(playedSim().state);
    const bad = [
      null,
      'tekst',
      { ...good, version: 99 },
      { ...good, map: { ...good.map, width: 0 } },
      { ...good, map: { ...good.map, track: good.map.track.slice(8) } },
      { ...good, map: { ...good.map, terrain: '%%%' } },
      { ...good, tick: 1.5 },
      { ...good, stations: [{ id: 1, name: 'X', axis: 'z', tiles: [] }] },
    ];
    for (const data of bad) expect(() => deserializeState(data)).toThrow(SaveError);
  });
});
