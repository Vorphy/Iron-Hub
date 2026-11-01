import { describe, expect, it } from 'vitest';
import { newTown } from '../src/sim/economy/town';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Track } from '../src/sim/track/track';
import { METRO_PLACES, metroStationName } from '../src/sim/station/metroNames';

function city() {
  const state = createGame({ width: 64, height: 64, seed: 1, empty: true });
  const town = newTown(1, 'Bocznica', 30, 30);
  town.districts.push({ name: 'Zatorze', x: 46, y: 30 });
  state.towns.push(town);
  return state;
}

/** Kolejne stacje metra w tym samym miejscu – każda dostaje pierwszą wolną nazwę. */
function names(state: ReturnType<typeof city>, x: number, y: number, n: number): string[] {
  const taken = new Set<string>();
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const name = metroStationName(state, x, y, taken);
    taken.add(name);
    out.push(name);
  }
  return out;
}

describe('nazwy stacji metra', () => {
  it('najpierw miasto, dzielnica i strona świata – nie „Metro 13”', () => {
    // (−4, −4) od rynku – na ekranie w górę, czyli północ.
    expect(names(city(), 26, 26, 3)).toEqual(['Bocznica Metro', 'Bocznica Centrum', 'Bocznica Północ']);
    // W innej dzielnicy – jej nazwa.
    expect(names(city(), 47, 30, 2)).toEqual(['Bocznica Metro', 'Bocznica Zatorze']);
  });

  it('potem pobliski zakład i miejsca z listy, dopiero na końcu numer', () => {
    const state = city();
    state.industries.push({ id: 1, type: 'steel_mill', name: 'Huta Bocznica', x: 31, y: 31 } as never);
    // Metro, Centrum, zakład, miejsca (same i z miastem), potem numery 2 i 3.
    const list = names(state, 31, 31, 3 + 2 * METRO_PLACES.length + 2);
    expect(list.slice(0, 2)).toEqual(['Bocznica Metro', 'Bocznica Centrum']);
    expect(list[2]).toMatch(/^Bocznica (Huta|Kopalnia|Elektrownia|Tartak|Las)/);
    expect(new Set(list).size).toBe(list.length);
    expect(list.filter((n) => METRO_PLACES.includes(n))).toHaveLength(METRO_PLACES.length);
    expect(list.at(-1)).toBe('Bocznica Metro 3');
  });

  it('stara nazwa dzielnicy ze stroną świata nie powtarza miasta; poza miastem – miejsca, potem numer', () => {
    const state = city();
    state.towns[0]!.districts[1]!.name = 'Bocznica-Wschód';
    expect(names(state, 46, 30, 2)[1]).toBe('Bocznica Wschód');
    const empty = createGame({ width: 64, height: 64, seed: 1, empty: true });
    const far = names(empty, 5, 5, METRO_PLACES.length + 1);
    expect(far.slice(0, -1).every((n) => METRO_PLACES.includes(n))).toBe(true);
    expect(far.at(-1)).toBe('Metro 1');
  });

  it('zapis sprzed v37: stare „Metro 1”, „Metro 2” dostają nowe nazwy, rozkłady bez zmian', () => {
    const state = city();
    state.money = 1_000_000;
    const sim = new Simulation(state);
    sim.enqueue({
      type: 'buildTrack',
      pieces: Array.from({ length: 20 }, (_, i) => ({ x: 24 + i, y: 33, track: Track.X })),
      under: true,
    });
    sim.enqueue({ type: 'buildStation', x0: 26, y0: 33, x1: 28, y1: 33, axis: 'x', under: true });
    sim.enqueue({ type: 'buildStation', x0: 38, y0: 33, x1: 40, y1: 33, axis: 'x', under: true, separate: true });
    sim.processCommands();
    expect(state.stations).toHaveLength(2);
    state.stations[0]!.name = 'Metro 1';
    state.stations[1]!.name = 'Metro 2';
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    data.version = 36;
    const loaded = deserializeState(data);
    // Druga stacja (x ≈ 39) leży bliżej środka Zatorza (46) niż rynku (30).
    expect(loaded.stations.map((s) => s.name)).toEqual(['Bocznica Metro', 'Bocznica Zatorze']);
    expect(loaded.stations.map((s) => s.id)).toEqual(state.stations.map((s) => s.id));
    // Aktualny zapis – nazwy bez zmian, nawet „Metro 1” nadane ręcznie.
    const fresh = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
    expect(fresh.stations[0]!.name).toBe('Metro 1');
  });
});
