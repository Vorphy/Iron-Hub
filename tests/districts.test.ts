import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/data/economy';
import type { SimEvent } from '../src/sim/commands';
import { serveTrainAtStation } from '../src/sim/economy/cargoFlow';
import {
  districtIndexAt,
  districtInfo,
  forEachTownTile,
  HOUSE_POPULATION,
  isStreet,
  metroStatus,
  newTown,
  townPopulation,
  townTiles,
} from '../src/sim/economy/town';
import { absorbTowns } from '../src/sim/economy/townMerge';
import { districtName, foundDistrict, renameDuplicateDistricts } from '../src/sim/economy/districts';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import { createRng } from '../src/sim/rng';
import { Side, Track } from '../src/sim/track/track';
import { growTown } from '../src/sim/world/generate';
import { deserializeState, SaveError, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
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

describe('wchłanianie miast', () => {
  /** Żelazowo (rynek 30, 30) – 40 domów po 140 = 5 600 mieszkańców w x 20–39; Stalówka (rynek 50, 30) obok. */
  function twoTowns(smallHouses: [number, number][]) {
    const state = world();
    const big = newTown(1, 'Żelazowo', 30, 30);
    const small = newTown(2, 'Stalówka', 50, 30);
    state.towns.push(big, small);
    for (let n = 0; n < 40; n++) {
      const i = (28 + Math.floor(n / 20)) * W + 20 + (n % 20);
      state.map.house[i] = 4;
      state.map.town[i] = 1;
    }
    for (const [x, y] of smallHouses) {
      state.map.house[y * W + x] = 1;
      state.map.town[y * W + x] = 2;
    }
    return { state, big, small };
  }

  /** Kolejne zamknięcia miesiąca (samo wchłanianie). */
  const months = (state: ReturnType<typeof world>, n: number, events: SimEvent[] = []) => {
    for (let k = 0; k < n; k++) absorbTowns(state, events);
    return events;
  };
  const YEAR = ECONOMY.town.absorbMonths;

  it('zrośnięte mniejsze miasto po roku zostaje dzielnicą większego', () => {
    const { state, big, small } = twoTowns([
      [40, 29],
      [50, 30],
    ]);
    small.districts.push({ name: 'Stalówka-Północ', x: 50, y: 20 });
    const events = months(state, YEAR - 1);
    expect(state.towns).toHaveLength(2);
    expect(small.contact).toEqual({ townId: 1, months: YEAR - 1 });
    expect(events).toEqual([{ type: 'townsTouching', townId: 1, smallId: 2 }]);
    small.month.passengers = 10;
    big.month.passengers = 5;
    months(state, 1, events);
    expect(state.towns).toEqual([big]);
    expect(big.districts.map((d) => d.name)).toEqual(['Centrum', 'Stalówka', 'Stalówka-Północ']);
    expect(big.districts[1]).toMatchObject({ x: 50, y: 30 });
    expect(state.map.town[30 * W + 50]).toBe(1);
    expect(state.map.town.includes(2)).toBe(false);
    expect(big.month.passengers).toBe(15);
    expect(events.at(-1)).toEqual({ type: 'townAbsorbed', townId: 1, district: 'Stalówka' });
    expect(townPopulation(state, big)).toBe(40 * HOUSE_POPULATION[4]! + 2 * HOUSE_POPULATION[1]!);
  });

  it('podobnej wielkości i małe miasta też się łączą – większe przejmuje mniejsze', () => {
    const { state, big, small } = twoTowns([]);
    for (let n = 0; n < 39; n++) {
      const i = (30 + Math.floor(n / 20)) * W + 40 + (n % 20);
      state.map.house[i] = 4; // 39 domów – o jeden mniej niż Żelazowo
      state.map.town[i] = 2;
    }
    months(state, YEAR);
    expect(state.towns).toEqual([big]);
    expect(small.districts).toHaveLength(1);
    expect(big.districts.map((d) => d.name)).toEqual(['Centrum', 'Stalówka']);
  });

  it('bez styku domów i bez drogi – osobne miasta; rozdzielenie zeruje licznik', () => {
    const far = twoTowns([[41, 29]]); // jeden wolny kafelek od ostatniego domu Żelazowa (x 39)
    months(far.state, YEAR * 2);
    expect(far.state.towns).toHaveLength(2);

    const { state, small } = twoTowns([[40, 29]]);
    months(state, YEAR - 1);
    state.map.town[29 * W + 40] = 0; // dom przy granicy wyburzony
    state.map.house[29 * W + 40] = 0;
    state.map.house[30 * W + 50] = 1;
    state.map.town[30 * W + 50] = 2;
    months(state, 1);
    expect(small.contact).toBeUndefined();
    expect(state.towns).toHaveLength(2);
  });

  it('miasta połączone drogą też się zrastają', () => {
    const { state, big } = twoTowns([[50, 29]]);
    for (let x = 40; x <= 49; x++) state.map.road[30 * W + x] = 1; // ulica od Żelazowa do domu Stalówki
    months(state, YEAR);
    expect(state.towns).toEqual([big]);
  });

  it('łańcuch: najmniejsze do średniego, średnie do dużego – wszystko w jednym mieście', () => {
    const { state, big } = twoTowns([[40, 29]]);
    for (let x = 40; x <= 44; x++) {
      state.map.house[29 * W + x] = 2;
      state.map.town[29 * W + x] = 2;
    }
    state.towns.push(newTown(3, 'Dymnik', 52, 29));
    state.map.house[29 * W + 45] = 1;
    state.map.town[29 * W + 45] = 3;
    months(state, YEAR);
    expect(state.towns).toEqual([big]);
    expect(big.districts.map((d) => d.name)).toEqual(['Centrum', 'Stalówka', 'Dymnik']);
  });

  it('zapis z licznikiem styku i z wchłoniętym miastem się wczytuje', () => {
    const { state } = twoTowns([[40, 29]]);
    months(state, 3);
    const back = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
    expect(back.towns[1]!.contact).toEqual({ townId: 1, months: 3 });
    months(state, YEAR);
    expect(deserializeState(JSON.parse(JSON.stringify(serializeState(state)))).towns[0]!.districts).toHaveLength(2);
  });
});

describe('nowe dzielnice przy wzroście', () => {
  /** Miasto zabudowane do brzegu: wzrost nie znajduje już miejsca. */
  function fullTown() {
    const state = world();
    const town = newTown(1, 'Żelazowo', 48, 48);
    state.towns.push(town);
    const rng = createRng(3);
    while (growTown(state, rng, town, 50) === 50);
    return { state, town, rng };
  }

  it('zabudowane miasto dostaje dzielnicę przy brzegu i rośnie dalej', () => {
    const { state, town, rng } = fullTown();
    expect(growTown(state, rng, town, 5)).toBe(0);
    const d = foundDistrict(state, town)!;
    expect(d).not.toBeNull();
    expect(Math.max(Math.abs(d.x - 48), Math.abs(d.y - 48))).toBeGreaterThanOrEqual(12);
    expect(town.districts).toHaveLength(2);
    expect(growTown(state, rng, town, 5)).toBe(5);
  });

  it('dzielnica powstaje w stronę stacji', () => {
    const { state, town } = fullTown();
    // „Stacja” na wschód od rynku w osi x: kafelki x ≥ 60 przyciągają.
    const d = foundDistrict(state, town, (i) => (i % W >= 60 ? 6 : 1))!;
    expect(d.x).toBeGreaterThan(48);
  });

  it('nazwa: Zatorze za torami, potem strona świata, bez powtórzeń', () => {
    const state = world();
    const town = newTown(1, 'Żelazowo', 48, 48);
    state.towns.push(town);
    // Na ekranie w górę (północ) to −x −y.
    expect(districtName(state, town, town.districts[0]!, 36, 36)).toBe('Żelazowo-Północ');
    expect(districtName(state, town, town.districts[0]!, 60, 36)).toBe('Żelazowo-Wschód');
    state.map.track[48 * W + 56] = Track.X;
    expect(districtName(state, town, town.districts[0]!, 64, 48)).toBe('Zatorze');
    town.districts.push({ name: 'Zatorze', x: 64, y: 48 });
    expect(districtName(state, town, town.districts[0]!, 64, 48)).toBe('Żelazowo-Wschód');
  });

  it('miesiąc: zabudowane miasto z metrem zakłada dzielnicę z komunikatem', () => {
    const { state, town } = fullTown();
    // Ponad 10 tys. mieszkańców – bez metra miasto by stało.
    state.money = 1_000_000;
    const sim = new Simulation(state);
    const pieces = Array.from({ length: 7 }, (_, i) => ({ x: 45 + i, y: 49, track: Track.X }));
    sim.enqueue({ type: 'buildTrack', pieces, under: true });
    sim.enqueue({ type: 'buildStation', x0: 47, y0: 49, x1: 49, y1: 49, axis: 'x', under: true });
    sim.processCommands();
    expect(metroStatus(state, town, townPopulation(state, town))).toBe('metro');
    town.month.passengers = 100;
    town.month.passengersTransported = 80;
    const events: SimEvent[] = [];
    monthlyEconomy(state, events);
    expect(town.districts).toHaveLength(2);
    expect(events).toContainEqual({ type: 'districtFounded', townId: 1, district: town.districts[1]!.name });
  });
});

describe('ruch między dzielnicami', () => {
  const xLine = (x0: number, x1: number, y: number) =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

  /**
   * Miasto: Centrum (30, 30) i opcjonalnie Stalówka (50, 30); tor y = 32, stacje A i B.
   * Zwraca zarobek za dowiezienie 40 pasażerów z A do B.
   */
  function trip(a: [number, number], b: [number, number], twoDistricts: boolean) {
    const state = world();
    state.money = 1_000_000;
    const town = newTown(1, 'Żelazowo', 30, 30);
    if (twoDistricts) town.districts.push({ name: 'Stalówka', x: 50, y: 30 });
    state.towns.push(town);
    for (let x = 20; x <= 60; x++) {
      state.map.house[33 * W + x] = 4;
      state.map.town[33 * W + x] = 1;
    }
    const sim = new Simulation(state);
    sim.enqueue({ type: 'buildTrack', pieces: xLine(15, 65, 32) });
    sim.enqueue({ type: 'buildDepot', x: 14, y: 32, side: Side.SE });
    sim.enqueue({ type: 'buildStation', x0: a[0], y0: 32, x1: a[1], y1: 32, axis: 'x' });
    sim.enqueue({ type: 'buildStation', x0: b[0], y0: 32, x1: b[1], y1: 32, axis: 'x', separate: true });
    sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
    sim.processCommands();
    const [sa, sb] = state.stations;
    const train = state.trains[0]!;
    train.trail = [{ x: b[0], y: 32, track: Track.X, entry: Side.NE, exit: Side.SW }];
    train.loads[0] = { amount: 40, source: sa!.id, loadedTick: state.tick };
    const before = state.money;
    serveTrainAtStation(state, train, sb!, [], true);
    return { income: state.money - before, town };
  }

  it('przejazd ≥ 10 kafelków między dzielnicami płaci ×2 i liczy się w mieście', () => {
    const plain = trip([28, 30], [50, 52], false);
    const city = trip([28, 30], [50, 52], true);
    expect(plain.income).toBeGreaterThan(0);
    expect(city.income).toBe(plain.income * ECONOMY.town.interDistrictBonus);
    expect(city.town.month.interDistrict).toBe(40);
    expect(plain.town.month.interDistrict).toBe(0);
  });

  it('krótki przejazd przez granicę dzielnic – bez premii', () => {
    const plain = trip([36, 38], [42, 44], false);
    const city = trip([36, 38], [42, 44], true);
    expect(city.income).toBe(plain.income);
    expect(city.town.month.interDistrict).toBe(0);
  });

  it('długi przejazd w jednej dzielnicy – bez premii', () => {
    const plain = trip([20, 22], [36, 38], false);
    const city = trip([20, 22], [36, 38], true);
    expect(city.income).toBe(plain.income);
  });

  it('stary zapis (v29) dostaje zerowy licznik', () => {
    const s = world();
    s.towns.push(newTown(1, 'Testowo', 30, 30));
    const data = JSON.parse(JSON.stringify(serializeState(s)));
    data.version = 29;
    delete data.towns[0].month.interDistrict;
    expect(deserializeState(data).towns[0]!.month.interDistrict).toBe(0);
  });
});

describe('metro w dzielnicach', () => {
  /** Zabudowane centrum (48, 48) i dzielnica Wschód (64, 48); metro w podanych dzielnicach. */
  function cityWithMetro(xs: number[]) {
    const state = world();
    const town = newTown(1, 'Żelazowo', 48, 48);
    state.towns.push(town);
    const rng = createRng(3);
    while (growTown(state, rng, town, 50) === 50);
    town.districts.push({ name: 'Wschód', x: 64, y: 48 });
    state.money = 1_000_000;
    const sim = new Simulation(state);
    for (const x of xs) {
      sim.enqueue({
        type: 'buildTrack',
        pieces: Array.from({ length: 7 }, (_, i) => ({ x: x - 3 + i, y: 49, track: Track.X })),
        under: true,
      });
      sim.enqueue({ type: 'buildStation', x0: x - 1, y0: 49, x1: x + 1, y1: 49, axis: 'x', under: true, separate: true });
    }
    sim.processCommands();
    town.month.passengers = 100;
    town.month.passengersTransported = 100;
    return { state, town };
  }

  it('każda dzielnica ze stacją metra dokłada domy co miesiąc', () => {
    const one = cityWithMetro([48]);
    const two = cityWithMetro([48, 64]);
    expect(districtInfo(two.state, two.town).map((d) => d.metro)).toEqual([true, true]);
    const before = [townTiles(one.state, one.town).length, townTiles(two.state, two.town).length];
    monthlyEconomy(one.state, []);
    monthlyEconomy(two.state, []);
    const grew1 = townTiles(one.state, one.town).length - before[0]!;
    const grew2 = townTiles(two.state, two.town).length - before[1]!;
    expect(grew2 - grew1).toBe(ECONOMY.town.metroGrowthExtra);
  });
});

describe('puste dzielnice', () => {
  it('nie powstaje dzielnica w polu, bez domów miasta w zasięgu', () => {
    const state = world();
    const town = newTown(1, 'Żelazowo', 48, 48);
    state.towns.push(town);
    // Skupisko 3×3 przy rynku: w kwadratach możliwych dzielnic (16 / 12 po skosie dalej, ±12) najwyżej 4 domy.
    for (let y = 47; y <= 49; y++) {
      for (let x = 47; x <= 49; x++) {
        state.map.house[y * W + x] = 1;
        state.map.town[y * W + x] = 1;
      }
    }
    expect(foundDistrict(state, town)).toBeNull();
    expect(town.districts).toHaveLength(1);
  });

  it('dzielnica bez domów znika przy zamknięciu miesiąca (z odświeżeniem mapy)', () => {
    const state = world();
    const town = newTown(1, 'Torzyce', 30, 30);
    town.districts.push({ name: 'Przedmieście', x: 70, y: 30 }, { name: 'Zatorze', x: 30, y: 60 });
    state.towns.push(town);
    state.map.house[30 * W + 31] = 1;
    state.map.town[30 * W + 31] = 1;
    state.map.house[60 * W + 31] = 1;
    state.map.town[60 * W + 31] = 1;
    const events: SimEvent[] = [];
    monthlyEconomy(state, events);
    expect(town.districts.map((d) => d.name)).toEqual(['Centrum', 'Zatorze']);
    expect(events).toContainEqual({ type: 'districtsChanged', townId: 1 });
  });
});

describe('nazwy dzielnic na całej mapie', () => {
  it('nowa nazwa nie powtarza nazwy dzielnicy innego miasta', () => {
    const state = world();
    const a = newTown(1, 'Żelazowo', 30, 48);
    const b = newTown(2, 'Kolejno', 70, 48);
    a.districts.push({ name: 'Zatorze', x: 30, y: 60 });
    state.towns.push(a, b);
    state.map.track[48 * W + 76] = Track.X;
    expect(districtName(state, b, b.districts[0]!, 82, 48)).toBe('Kolejno-Wschód');
  });

  it('powtórzone nazwy (stare zapisy) dostają wolną nazwę z listy', () => {
    const state = world();
    const a = newTown(1, 'Żelazowo', 30, 30);
    const b = newTown(2, 'Kolejno', 70, 30);
    a.districts.push({ name: 'Osiedle Parowe', x: 30, y: 46 }, { name: 'Zatorze', x: 46, y: 30 });
    b.districts.push({ name: 'Osiedle Parowe', x: 70, y: 46 }, { name: 'Zatorze', x: 86, y: 30 });
    state.towns.push(a, b);
    expect(renameDuplicateDistricts(state)).toBe(true);
    const names = state.towns.flatMap((t) => t.districts.slice(1).map((d) => d.name));
    expect(new Set(names).size).toBe(names.length);
    expect(a.districts.map((d) => d.name)).toEqual(['Centrum', 'Osiedle Parowe', 'Zatorze']);
    expect(renameDuplicateDistricts(state)).toBe(false);
  });
});

describe('licznik styku', () => {
  it('rok styku liczy się bez przerwy, także gdy w trakcie zmieni się, które miasto jest większe', () => {
    const state = world();
    const big = newTown(1, 'Żelazowo', 30, 30);
    const small = newTown(2, 'Stalówka', 50, 30);
    state.towns.push(big, small);
    const put = (x: number, y: number, id: number, level = 1) => {
      state.map.house[y * W + x] = level;
      state.map.town[y * W + x] = id;
    };
    // Na początku Stalówka jest większa.
    put(39, 29, 1);
    for (let x = 40; x < 50; x++) put(x, 29, 2, 4);
    const half = ECONOMY.town.absorbMonths / 2;
    for (let k = 0; k < half; k++) absorbTowns(state, []);
    // Po pół roku Żelazowo rośnie i staje się większe – licznik Stalówki biegnie dalej.
    for (let x = 20; x < 39; x++) put(x, 30, 1, 4);
    for (let k = 0; k < half - 1; k++) absorbTowns(state, []);
    expect(state.towns).toHaveLength(2);
    expect(small.contact).toEqual({ townId: 1, months: ECONOMY.town.absorbMonths - 1 });
    absorbTowns(state, []);
    expect(state.towns).toEqual([big]);
  });
});
