import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import {
  advanceHouseConstruction,
  emptyTownMonth,
  HOUSE_BUILD_STAGES,
  HOUSE_CHURCH,
  HOUSE_ORNAMENT,
  MAX_HOUSE_LEVEL,
  townHouseCount,
  townPopulation,
  townTiles,
} from '../src/sim/economy/town';
import { createRng } from '../src/sim/rng';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame, type GameState } from '../src/sim/state';
import { DAYS_PER_MONTH, TICKS_PER_DAY } from '../src/sim/time';
import { growTown } from '../src/sim/world/generate';
import { Terrain } from '../src/sim/world/map';

function emptyTown(): GameState {
  const state = createGame({ width: 64, height: 64, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.towns.push({ id: 1, name: 'Testowo', x: 30, y: 30, month: emptyTownMonth(), lastTransported: 0 });
  return state;
}

describe('ozdoby i kościół', () => {
  it('kościół jeden na miasto, ozdoby rzadko i blisko rynku – bez mieszkańców', () => {
    const state = emptyTown();
    const town = state.towns[0]!;
    growTown(state, createRng(3), town, 200);
    const tiles = townTiles(state, town);
    const kind = (k: number) => tiles.filter((i) => state.map.house[i] === k);
    expect(kind(HOUSE_CHURCH)).toHaveLength(1);
    const ornaments = kind(HOUSE_ORNAMENT);
    expect(ornaments.length).toBeGreaterThan(0);
    expect(ornaments.length).toBeLessThanOrEqual(1 + Math.floor(townHouseCount(state, town) / 25));
    for (const i of [...ornaments, ...kind(HOUSE_CHURCH)]) {
      expect(Math.abs((i % 64) - town.x) + Math.abs(Math.floor(i / 64) - town.y)).toBeLessThanOrEqual(4);
    }
    // Liczba domów i mieszkańców bez ozdób i kościoła.
    expect(townHouseCount(state, town)).toBe(tiles.length - ornaments.length - 1);
    const pop = tiles.reduce(
      (s, i) => s + (state.map.house[i]! <= MAX_HOUSE_LEVEL ? [0, 20, 45, 80, 140][state.map.house[i]!]! : 0),
      0,
    );
    expect(townPopulation(state, town)).toBe(pop);
  });

  it('miasto bez kościoła i ozdób (stary zapis) dostaje je przy rynku – jako budowa', () => {
    const state = emptyTown();
    const town = state.towns[0]!;
    growTown(state, createRng(3), town, 60);
    // Jak w zapisie sprzed ozdób: same domy, centrum zabudowane.
    for (const i of townTiles(state, town)) if (state.map.house[i]! > MAX_HOUSE_LEVEL) state.map.house[i] = 1;
    const ornamentsAfter = () => townTiles(state, town).filter((i) => state.map.house[i] === HOUSE_ORNAMENT);
    for (let m = 0; m < 60 && ornamentsAfter().length === 0; m++) monthlyEconomy(state, []);
    const church = townTiles(state, town).filter((i) => state.map.house[i] === HOUSE_CHURCH);
    expect(church).toHaveLength(1);
    expect(ornamentsAfter()).toHaveLength(1);
    for (const i of [...church, ...ornamentsAfter()]) {
      expect(Math.abs((i % 64) - town.x) + Math.abs(Math.floor(i / 64) - town.y)).toBeLessThanOrEqual(4);
    }
    // Drugi kościół nie powstaje.
    monthlyEconomy(state, []);
    expect(townTiles(state, town).filter((i) => state.map.house[i] === HOUSE_CHURCH)).toHaveLength(1);
  });

  it('nowy kościół w zabudowanym mieście stoi najpierw jako budowa', () => {
    const state = emptyTown();
    const town = state.towns[0]!;
    growTown(state, createRng(3), town, 60);
    for (const i of townTiles(state, town)) if (state.map.house[i]! > MAX_HOUSE_LEVEL) state.map.house[i] = 1;
    monthlyEconomy(state, []);
    const church = townTiles(state, town).find((i) => state.map.house[i] === HOUSE_CHURCH)!;
    expect(state.map.houseBuild[church]).toBe(HOUSE_BUILD_STAGES);
  });
});

describe('etapy budowy domów', () => {
  it('nowy dom z miesięcznego wzrostu stoi najpierw jako budowa, po 3 etapach jest gotowy', () => {
    const state = emptyTown();
    growTown(state, createRng(3), state.towns[0]!, 10);
    expect(state.map.houseBuild.every((v) => v === 0)).toBe(true);
    // Obsługiwane miasto: w miesiącu przewieziono pasażerów.
    state.towns[0]!.month.passengersTransported = 10;
    state.towns[0]!.month.passengers = 10;
    const before = new Set(townTiles(state, state.towns[0]!));
    monthlyEconomy(state, []);
    const fresh = townTiles(state, state.towns[0]!).filter((i) => !before.has(i));
    expect(fresh.length).toBeGreaterThan(0);
    for (const i of fresh) expect(state.map.houseBuild[i]).toBe(HOUSE_BUILD_STAGES);

    const events: SimEvent[] = [];
    for (let k = 0; k < HOUSE_BUILD_STAGES; k++) advanceHouseConstruction(state, events);
    for (const i of fresh) expect(state.map.houseBuild[i]).toBe(0);
    expect(events.filter((e) => e.type === 'tileChanged').length).toBeGreaterThanOrEqual(fresh.length * HOUSE_BUILD_STAGES);
  });

  it('budowa postępuje sama w trakcie gry i przechodzi przez zapis', () => {
    const state = emptyTown();
    growTown(state, createRng(3), state.towns[0]!, 5);
    const i = townTiles(state, state.towns[0]!)[0]!;
    state.map.houseBuild[i] = HOUSE_BUILD_STAGES;
    const copy = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
    expect(copy.map.houseBuild[i]).toBe(HOUSE_BUILD_STAGES);

    const sim = new Simulation(copy);
    // Do końca miesiąca – bez wzrostu miasta, tylko etapy budowy (co 5 dni).
    for (let t = 0; t < TICKS_PER_DAY * (DAYS_PER_MONTH - 1); t++) sim.step();
    expect(copy.map.houseBuild[i]).toBe(0);
  });

  it('stary zapis (v24) – wszystkie domy gotowe', () => {
    const state = emptyTown();
    growTown(state, createRng(3), state.towns[0]!, 5);
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    data.version = 24;
    delete data.map.houseBuild;
    const loaded = deserializeState(data);
    expect(loaded.map.houseBuild.every((v) => v === 0)).toBe(true);
    expect(loaded.map.house).toEqual(state.map.house);
  });
});
