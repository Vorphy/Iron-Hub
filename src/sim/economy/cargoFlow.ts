import type { SimEvent } from '../commands';
import { catchment, type Station, type StationCargo } from '../station/station';
import type { GameState } from '../state';
import { TICKS_PER_DAY } from '../time';
import type { Train } from '../trains/train';
import { wagonDef } from '../trains/vehicles';
import { CARGO_DEFS, type Cargo } from './cargo';
import { earn } from './finance';
import { industryDef, industryTiles, monthlyProduction } from './industry';
import { HOUSE_POPULATION } from './town';

/** Stacja zbiera ładunek, jeśli pociąg z odpowiednim wagonem był na niej w ciągu tylu dni. */
export const SERVICE_DAYS = 60;
/** Ocena przy obsłudze co najwyżej co tyle dni – najwyższa. */
const FREQUENT_DAYS = 7;
const RATING_MAX = 0.95;
const RATING_MIN = 0.4;
/** Ładunek czekający ponad tę ilość obniża ocenę stacji. */
const CROWDED = 500;
export const MAX_WAITING = 4000;
/** Pasażerowie na miesiąc = mieszkańcy / 4, poczta = mieszkańcy / 16 (rozłożone na 30 dni). */
const PASSENGER_DAY_DIVISOR = 120;
const MAIL_DAY_DIVISOR = 480;
/** Mieszkańców w zasięgu potrzebnych, by stacja przyjmowała dany ładunek. */
const TOWN_ACCEPTANCE: Partial<Record<Cargo, number>> = { passengers: 1, mail: 100, goods: 200 };
/** Po ilu dniach ponad czas „szybki” zapłata spada do minimum. */
const LATE_DECAY_DAYS = 60;
const MIN_TIME_FACTOR = 0.3;

/** Ocena stacji dla ładunku (0–1); 0 – stacja nie obsługuje tego ładunku. */
export function stationRating(state: GameState, sc: StationCargo | undefined): number {
  if (!sc || sc.lastPickup < 0) return 0;
  const days = (state.tick - sc.lastPickup) / TICKS_PER_DAY;
  if (days > SERVICE_DAYS) return 0;
  const t = Math.max(0, (days - FREQUENT_DAYS) / (SERVICE_DAYS - FREQUENT_DAYS));
  const rating = RATING_MAX - (RATING_MAX - RATING_MIN) * t;
  return sc.waiting > CROWDED ? rating - 0.15 : rating;
}

export function stationCenter(state: GameState, st: Station): { x: number; y: number } {
  const W = state.map.width;
  const n = st.tiles.length;
  return {
    x: st.tiles.reduce((s, t) => s + (t % W), 0) / n,
    y: st.tiles.reduce((s, t) => s + Math.floor(t / W), 0) / n,
  };
}

/** Ładunki przyjmowane przez stację: surowce zakładów w zasięgu i potrzeby mieszkańców. */
export function stationAccepts(state: GameState, st: Station): Set<Cargo> {
  return catchmentCargo(state, st.tiles).accepts;
}

/** Co stacja na tych peronach przyjmie i co będzie zbierać (zakłady i domy w zasięgu). */
export function catchmentCargo(state: GameState, tiles: readonly number[]): { accepts: Set<Cargo>; supplies: Set<Cargo> } {
  const { map } = state;
  const accepts = new Set<Cargo>();
  const supplies = new Set<Cargo>();
  let population = 0;
  const industries = new Set<number>();
  for (const i of catchment(map, tiles)) {
    population += HOUSE_POPULATION[map.house[i]!]!;
    if (map.industry[i]) industries.add(map.industry[i]!);
  }
  for (const id of industries) {
    const ind = state.industries.find((x) => x.id === id);
    if (!ind) continue;
    const def = industryDef(ind.type)!;
    for (const c of def.accepts) accepts.add(c);
    if (def.produces) supplies.add(def.produces);
  }
  for (const [c, need] of Object.entries(TOWN_ACCEPTANCE) as [Cargo, number][]) if (population >= need) accepts.add(c);
  if (population > 0) supplies.add('passengers');
  if (population >= 100) supplies.add('mail');
  return { accepts, supplies };
}

/** Zapłata za dostawę: ilość × stawka × odległość × współczynnik czasu. */
export function deliveryPayment(cargo: Cargo, amount: number, distanceTiles: number, days: number): number {
  const def = CARGO_DEFS[cargo];
  const late = Math.max(0, days - def.fastDays);
  const timeFactor = Math.max(MIN_TIME_FACTOR, 1 - late / LATE_DECAY_DAYS);
  return Math.round(amount * def.rate * distanceTiles * timeFactor);
}

/** Kafelek → stacje, które go obejmują zasięgiem (liczone raz dziennie). */
function catchmentIndex(state: GameState): Map<number, Station[]> {
  const index = new Map<number, Station[]>();
  for (const st of state.stations) {
    for (const i of catchment(state.map, st.tiles)) {
      const list = index.get(i);
      if (list) list.push(st);
      else index.set(i, [st]);
    }
  }
  return index;
}

/**
 * Oddaje produkcję stacjom obsługującym ładunek (proporcjonalnie do ocen).
 * Trafia na nie ułamek równy najlepszej ocenie – reszta przepada. Zwraca ilość, która trafiła na stacje.
 */
function distribute(state: GameState, stations: readonly Station[], cargo: Cargo, amount: number): number {
  const rated = stations
    .map((st) => ({ st, r: stationRating(state, st.cargo[cargo]) }))
    .filter((x) => x.r > 0);
  if (rated.length === 0 || amount <= 0) return 0;
  const best = Math.max(...rated.map((x) => x.r));
  const total = rated.reduce((s, x) => s + x.r, 0);
  const moved = amount * best;
  for (const { st, r } of rated) {
    const sc = st.cargo[cargo]!;
    sc.waiting = Math.min(MAX_WAITING, sc.waiting + (moved * r) / total);
  }
  return moved;
}

/** Dzienna produkcja zakładów i miast trafia na obsługujące je stacje. */
export function dailyCargo(state: GameState): void {
  const index = catchmentIndex(state);
  const { map } = state;

  for (const ind of state.industries) {
    const def = industryDef(ind.type)!;
    if (!def.produces) continue;
    const daily = monthlyProduction(ind) / 30;
    ind.month.produced += daily;
    const near = new Set<Station>();
    for (const i of industryTiles(state, ind)) for (const st of index.get(i) ?? []) near.add(st);
    ind.month.transported += distribute(state, sortById([...near]), def.produces, daily);
  }

  for (let i = 0; i < map.house.length; i++) {
    const level = map.house[i]!;
    if (!level) continue;
    const town = state.towns.find((t) => t.id === map.town[i]);
    if (!town) continue;
    const pop = HOUSE_POPULATION[level]!;
    const passengers = pop / PASSENGER_DAY_DIVISOR;
    const mail = pop / MAIL_DAY_DIVISOR;
    town.month.passengers += passengers;
    town.month.mail += mail;
    const near = index.get(i);
    if (!near) continue;
    town.month.passengersTransported += distribute(state, near, 'passengers', passengers);
    town.month.mailTransported += distribute(state, near, 'mail', mail);
  }
}

function sortById(stations: Station[]): Station[] {
  return stations.sort((a, b) => a.id - b.id);
}

/**
 * Pociąg na stacji: rozładunek tego, co stacja przyjmuje (zapłata, dostawy do zakładów),
 * i załadunek czekającego ładunku. Stacja zaczyna (lub dalej) obsługiwać ładunki pociągu.
 */
export function serveTrainAtStation(state: GameState, train: Train, st: Station, events: SimEvent[], unload: boolean): void {
  const pos = stationCenter(state, st);
  const accepts = unload ? stationAccepts(state, st) : new Set<Cargo>();
  let income = 0;

  train.wagons.forEach((id, k) => {
    const def = wagonDef(id)!;
    const load = train.loads[k]!;
    const sc = (st.cargo[def.cargo] ??= { waiting: 0, lastPickup: -1 });
    sc.lastPickup = state.tick;

    if (unload && load.amount > 0 && load.source !== st.id && accepts.has(def.cargo)) {
      const source = state.stations.find((s) => s.id === load.source);
      const from = source ? stationCenter(state, source) : pos;
      const dist = Math.abs(from.x - pos.x) + Math.abs(from.y - pos.y);
      const days = (state.tick - load.loadedTick) / TICKS_PER_DAY;
      income += deliveryPayment(def.cargo, load.amount, dist, days);
      deliverToIndustries(state, st, def.cargo, load.amount);
      load.amount = 0;
      load.source = 0;
    }

    // Nie mieszamy ładunku z różnych stacji w jednym wagonie.
    if (load.amount > 0 && load.source !== st.id) return;
    const take = Math.min(def.capacity - load.amount, Math.floor(sc.waiting));
    if (take <= 0) return;
    if (load.amount === 0) load.loadedTick = state.tick;
    load.amount += take;
    load.source = st.id;
    sc.waiting -= take;
  });

  if (income > 0) {
    earn(state, income);
    const head = train.trail[0]!;
    events.push({ type: 'income', amount: income, x: head.x + 0.5, y: head.y + 0.5 });
  }
}

/** Surowiec dowieziony na stację trafia do zakładów w jej zasięgu, które go przyjmują. */
function deliverToIndustries(state: GameState, st: Station, cargo: Cargo, amount: number): void {
  const ids = new Set<number>();
  for (const i of catchment(state.map, st.tiles)) if (state.map.industry[i]) ids.add(state.map.industry[i]!);
  const targets = state.industries.filter((ind) => ids.has(ind.id) && industryDef(ind.type)!.accepts.includes(cargo));
  for (const ind of targets) ind.month.delivered[cargo] = (ind.month.delivered[cargo] ?? 0) + amount / targets.length;
}
