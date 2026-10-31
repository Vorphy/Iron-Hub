import { describe, expect, it } from 'vitest';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { gameDate, TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track } from '../src/sim/track/track';
import { Terrain } from '../src/sim/world/map';

describe('długość dnia (44 ticki, jak w OpenTTD)', () => {
  it('dzień trwa 2,2 s przy 1× (44 ticki po 50 ms)', () => {
    expect(TICKS_PER_DAY).toBe(44);
  });

  it('zapis v30 (dzień = 40 ticków): data, wiek i czasy ładunku po wczytaniu bez zmian', () => {
    const state = createGame({ width: 40, height: 20, seed: 1, empty: true });
    state.map.terrain.fill(Terrain.Grass);
    state.money = 1_000_000;
    const sim = new Simulation(state);
    sim.enqueue({ type: 'buildTrack', pieces: Array.from({ length: 20 }, (_, i) => ({ x: 1 + i, y: 10, track: Track.X })) });
    sim.enqueue({ type: 'buildDepot', x: 0, y: 10, side: Side.SE });
    sim.enqueue({ type: 'buildStation', x0: 5, y0: 10, x1: 7, y1: 10, axis: 'x' });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.processCommands();
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    // Jak w starym zapisie: 3 lata, 2 miesiące i 10 dni po 40 ticków; ładunek od 5 dni, odbiór 7 dni temu.
    const oldDay = 40;
    const days = (3 * 12 + 2) * 30 + 10;
    data.version = 30;
    data.tick = days * oldDay;
    const t = data.trains[0];
    t.engineBuilt = (days - 400) * oldDay;
    t.createdTick = (days - 400) * oldDay;
    t.loads[0] = { amount: 10, source: 1, loadedTick: (days - 5) * oldDay };
    data.stations[0].cargo = {
      passengers: { waiting: 0, lastPickup: (days - 7) * oldDay, rating: 128, lastSpeed: 0, lastAge: 0 },
    };

    const loaded = deserializeState(data);
    expect(gameDate(loaded)).toEqual({ year: loaded.startYear + 3, month: 3, day: 11 });
    const daysAgo = (tick: number) => (loaded.tick - tick) / TICKS_PER_DAY;
    expect(daysAgo(loaded.trains[0]!.engineBuilt)).toBeCloseTo(400, 5);
    expect(daysAgo(loaded.trains[0]!.loads[0]!.loadedTick)).toBeCloseTo(5, 5);
    expect(daysAgo(loaded.stations[0]!.cargo.passengers!.lastPickup)).toBeCloseTo(7, 5);
    expect(loaded.trains[0]!.departedFirstTick).toBe(-1);
  });
});
