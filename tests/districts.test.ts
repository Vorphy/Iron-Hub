import { describe, expect, it } from 'vitest';
import {
  districtIndexAt,
  districtInfo,
  forEachTownTile,
  HOUSE_POPULATION,
  isStreet,
  newTown,
  townPopulation,
  townTiles,
} from '../src/sim/economy/town';
import { deserializeState, SaveError, serializeState } from '../src/sim/serialize';
import { createGame } from '../src/sim/state';
import { Terrain } from '../src/sim/world/map';

const W = 96;

function world() {
  const state = createGame({ width: W, height: W, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  return state;
}

describe('dzielnice', () => {
  it('nowe miasto ma jedną dzielnicę – centrum na rynku', () => {
    const t = newTown(1, 'Testowo', 30, 40);
    expect(t.districts).toEqual([{ name: 'Centrum', x: 30, y: 40 }]);
  });

  it('obszar miasta obejmuje kwadraty wszystkich dzielnic, każdy kafelek raz', () => {
    const t = newTown(1, 'Testowo', 30, 30);
    t.districts.push({ name: 'Stalówka', x: 50, y: 30 });
    const seen: number[] = [];
    forEachTownTile({ width: W, height: W }, t, 16, (_x, _y, i) => seen.push(i));
    expect(new Set(seen).size).toBe(seen.length);
    // Dwa kwadraty 33×33 zachodzące na siebie o 13 kolumn.
    expect(seen.length).toBe(33 * 33 * 2 - 13 * 33);
  });

  it('obszar przycięty do mapy', () => {
    const t = newTown(1, 'Testowo', 2, 3);
    let n = 0;
    forEachTownTile({ width: W, height: W }, t, 16, () => n++);
    expect(n).toBe(19 * 20);
  });

  it('kafelek należy do dzielnicy z najbliższym środkiem; ulice od jej środka', () => {
    const t = newTown(1, 'Testowo', 30, 30);
    t.districts.push({ name: 'Stalówka', x: 51, y: 31 });
    expect(districtIndexAt(t, 35, 30)).toBe(0);
    expect(districtIndexAt(t, 48, 30)).toBe(1);
    expect(isStreet(t, 34, 33)).toBe(true); // kolumna 34 = 30 + 4
    expect(isStreet(t, 55, 33)).toBe(true); // kolumna 55 = 51 + 4
    expect(isStreet(t, 54, 33)).toBe(false); // w siatce centrum byłaby ulicą, w Stalówce nie
  });

  it('mieszkańcy i metro liczone osobno dla każdej dzielnicy', () => {
    const state = world();
    const t = newTown(1, 'Testowo', 30, 30);
    t.districts.push({ name: 'Stalówka', x: 60, y: 30 });
    state.towns.push(t);
    for (const [x, y, level] of [
      [31, 31, 2],
      [61, 31, 4],
      [62, 31, 1],
    ] as const) {
      state.map.house[y * W + x] = level;
      state.map.town[y * W + x] = 1;
    }
    state.stations.push({ underTiles: [32 * W + 59] } as never);
    const info = districtInfo(state, t);
    expect(info.map((d) => d.name)).toEqual(['Centrum', 'Stalówka']);
    expect(info[0]!.population).toBe(HOUSE_POPULATION[2]);
    expect(info[1]!.population).toBe(HOUSE_POPULATION[4]! + HOUSE_POPULATION[1]!);
    expect(info.map((d) => d.metro)).toEqual([false, true]);
    expect(townTiles(state, t)).toHaveLength(3);
    expect(townPopulation(state, t)).toBe(info[0]!.population + info[1]!.population);
  });
});

describe('dzielnice w zapisie', () => {
  it('stary zapis (v28) – każde miasto dostaje centrum na rynku', () => {
    const s = world();
    s.towns.push(newTown(1, 'Testowo', 30, 30));
    const data = JSON.parse(JSON.stringify(serializeState(s)));
    data.version = 28;
    delete data.towns[0].districts;
    expect(deserializeState(data).towns[0]!.districts).toEqual([{ name: 'Centrum', x: 30, y: 30 }]);
  });

  it('dzielnice przechodzą przez zapis', () => {
    const s = world();
    const t = newTown(1, 'Testowo', 30, 30);
    t.districts.push({ name: 'Stalówka', x: 50, y: 30 });
    s.towns.push(t);
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(s))));
    expect(loaded.towns[0]!.districts).toEqual(t.districts);
  });

  it('dzielnica poza mapą albo centrum poza rynkiem – błąd wczytania', () => {
    const s = world();
    s.towns.push(newTown(1, 'Testowo', 30, 30));
    const data = JSON.parse(JSON.stringify(serializeState(s)));
    data.towns[0].districts.push({ name: 'Za mapą', x: W + 5, y: 3 });
    expect(() => deserializeState(data)).toThrow(SaveError);
    data.towns[0].districts = [{ name: 'Centrum', x: 31, y: 30 }];
    expect(() => deserializeState(data)).toThrow(SaveError);
    data.towns[0].districts = [];
    expect(() => deserializeState(data)).toThrow(SaveError);
  });
});
