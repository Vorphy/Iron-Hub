import type { SimEvent } from '../commands';
import { engineMaxSpeed, ratingBonus, wagonCapacity } from '../research';
import { stationLayer } from '../track/metro';
import { allTiles, catchment, newStationCargo, platformStations, type Station, type StationCargo } from '../station/station';
import type { GameState } from '../state';
import { ECONOMY } from '../../data/economy';
import { DAYS_PER_MONTH, TICKS_PER_DAY } from '../time';
import { engineAge, type Train } from '../trains/train';
import { engineDef, wagonDef } from '../trains/vehicles';
import { CARGO_DEFS, type Cargo } from './cargo';
import { earn } from './finance';
import { industryDef, industryTiles, monthlyProduction, wantsWorkers } from './industry';
import { HOUSE_POPULATION } from './town';

// Reguły z pliku ekonomii (src/data/economy.ts).
const S = ECONOMY.station;
export const SERVICE_DAYS = S.serviceDays;
export const MAX_WAITING = S.maxWaiting;
/** Pasażerowie i poczta na dzień (miesięczne wartości rozłożone na 30 dni). */
const PASSENGER_DAY_DIVISOR = ECONOMY.town.passengerDivisor * DAYS_PER_MONTH;
const MAIL_DAY_DIVISOR = ECONOMY.town.mailDivisor * DAYS_PER_MONTH;
const TOWN_ACCEPTANCE: Partial<Record<Cargo, number>> = ECONOMY.town.acceptance;

const R = ECONOMY.rating;
export const MAX_RATING = 255;
export const INITIAL_RATING = R.initial;

/** Czy stacja obsługuje ładunek (pociąg z pasującym wagonem był tu w ciągu `SERVICE_DAYS` dni). */
function served(state: GameState, sc: StationCargo | undefined): sc is StationCargo {
  return !!sc && sc.lastPickup >= 0 && (state.tick - sc.lastPickup) / TICKS_PER_DAY <= SERVICE_DAYS;
}

/** Ocena stacji dla ładunku (0–1); 0 – stacja nie obsługuje tego ładunku. */
export function stationRating(state: GameState, sc: StationCargo | undefined): number {
  return served(state, sc) ? Math.min(1, sc.rating / MAX_RATING) : 0;
}

/** Składniki oceny (punkty) – do tej sumy dąży ocena stacji. */
export interface RatingParts {
  speed: number;
  pickup: number;
  waiting: number;
  age: number;
  /** Badanie „Lepsza obsługa stacji”. */
  research: number;
}

/** Składniki oceny jak w OpenTTD (UpdateStationRating). */
export function ratingParts(state: GameState, sc: StationCargo): RatingParts {
  const days = (state.tick - sc.lastPickup) / TICKS_PER_DAY;
  const speed = Math.max(0, Math.floor((Math.min(R.speedMax, sc.lastSpeed) - R.speedFrom) / R.speedDivisor));
  let pickup = 0;
  for (const [limit, pts] of R.pickupDays) if (days <= limit) pickup += pts;
  let waiting: number = R.waitingBase;
  for (const [limit, pts] of R.waiting) if (sc.waiting <= limit) waiting += pts;
  let age = 0;
  for (const [limit, pts] of R.ageYears) if (sc.lastAge < limit) age += pts;
  return { speed, pickup, waiting, age, research: Math.round(ratingBonus(state) * MAX_RATING) };
}

/** Ocena, do której dąży stacja (punkty 0–255). */
export function ratingTarget(state: GameState, sc: StationCargo): number {
  const p = ratingParts(state, sc);
  return Math.max(0, Math.min(MAX_RATING, p.speed + p.pickup + p.waiting + p.age + p.research));
}

/** Codziennie: ocena każdego obsługiwanego ładunku o krok w stronę sumy składników. */
export function updateStationRatings(state: GameState): void {
  for (const st of state.stations) {
    for (const sc of Object.values(st.cargo)) {
      if (!served(state, sc)) continue;
      const diff = ratingTarget(state, sc) - sc.rating;
      sc.rating += Math.max(-R.stepPerDay, Math.min(R.stepPerDay, diff));
    }
  }
}

export function stationCenter(state: GameState, st: Station): { x: number; y: number } {
  const W = state.map.width;
  const tiles = allTiles(st);
  const n = tiles.length;
  return {
    x: tiles.reduce((s, t) => s + (t % W), 0) / n,
    y: tiles.reduce((s, t) => s + Math.floor(t / W), 0) / n,
  };
}

/** Ładunki przyjmowane przez stację: surowce zakładów w zasięgu i potrzeby mieszkańców. */
export function stationAccepts(state: GameState, st: Station): Set<Cargo> {
  return catchmentCargo(state, allTiles(st)).accepts;
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
    // Duży zakład przyjmuje pracowników – pasażerów, nawet bez domów w zasięgu.
    if (wantsWorkers(ind)) accepts.add('passengers');
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
  const { lateDecayDays, minTimeFactor } = ECONOMY.delivery;
  const timeFactor = Math.max(minTimeFactor, 1 - late / lateDecayDays);
  return Math.round(amount * def.rate * distanceTiles * timeFactor);
}

/** Kafelek → stacje, które go obejmują zasięgiem (liczone raz dziennie). */
function catchmentIndex(state: GameState): Map<number, Station[]> {
  const index = new Map<number, Station[]>();
  for (const st of platformStations(state)) {
    for (const i of catchment(state.map, allTiles(st))) {
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
  const rated = stations.map((st) => ({ st, r: stationRating(state, st.cargo[cargo]) })).filter((x) => x.r > 0);
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
  updateStationRatings(state);
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

  const towns = new Map(state.towns.map((t) => [t.id, t]));
  for (let i = 0; i < map.house.length; i++) {
    const level = map.house[i]!;
    if (!level) continue;
    const town = towns.get(map.town[i]!);
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
  const queued = cargoQueuedAhead(state, train, st);
  const accepts = unload ? stationAccepts(state, st) : new Set<Cargo>();
  let income = 0;

  train.wagons.forEach((id, k) => {
    const def = wagonDef(id)!;
    const load = train.loads[k]!;
    const sc = (st.cargo[def.cargo] ??= newStationCargo(INITIAL_RATING));
    sc.lastPickup = state.tick;
    // Do oceny: prędkość i wiek lokomotywy ostatniego pociągu (jak last_speed i last_age w OpenTTD).
    sc.lastSpeed = engineMaxSpeed(state, engineDef(train.engine)!.maxSpeed);
    sc.lastAge = Math.floor(engineAge(state, train));

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
    // Kto pierwszy przyjechał, ten pierwszy ładuje: ładunek, na który czeka wcześniejszy pociąg, zostaje dla niego.
    if (queued.has(def.cargo)) return;
    const take = Math.min(wagonCapacity(state, def.capacity) - load.amount, Math.floor(sc.waiting));
    if (take <= 0) return;
    if (load.amount === 0) load.loadedTick = state.tick;
    load.amount += take;
    load.source = st.id;
    sc.waiting -= take;
  });

  if (income > 0) {
    earn(state, income);
    train.profitThisYear += income;
    const head = train.trail[0]!;
    events.push({ type: 'income', amount: income, x: head.x + 0.5, y: head.y + 0.5 });
  }
}

/**
 * Ładunki, na które na tej samej stacji czekają pociągi, które przyjechały wcześniej (mają jeszcze
 * niepełne wagony na ten ładunek). Przy równym czasie przyjazdu pierwszeństwo ma niższy numer.
 */
function cargoQueuedAhead(state: GameState, train: Train, st: Station): Set<Cargo> {
  const out = new Set<Cargo>();
  const mine = train.arrivedTick ?? -1;
  for (const other of state.trains) {
    if (other === train || other.status !== 'loading') continue;
    const at = other.arrivedTick ?? -1;
    if (at > mine || (at === mine && other.id > train.id)) continue;
    const h = other.trail[0];
    if (!h || stationLayer(state.map, h.track)[h.y * state.map.width + h.x] !== st.id) continue;
    other.wagons.forEach((id, k) => {
      const def = wagonDef(id)!;
      const load = other.loads[k]!;
      if (load.amount < wagonCapacity(state, def.capacity) && (load.amount === 0 || load.source === st.id)) out.add(def.cargo);
    });
  }
  return out;
}

/**
 * Surowiec dowieziony na stację trafia do zakładów w jej zasięgu, które go przyjmują; pasażerowie –
 * jako pracownicy do zakładów, które ich szukają (dzielone po równo).
 */
function deliverToIndustries(state: GameState, st: Station, cargo: Cargo, amount: number): void {
  const ids = new Set<number>();
  for (const i of catchment(state.map, allTiles(st))) if (state.map.industry[i]) ids.add(state.map.industry[i]!);
  const near = state.industries.filter((ind) => ids.has(ind.id));
  const targets = near.filter((ind) => industryDef(ind.type)!.accepts.includes(cargo));
  for (const ind of targets) ind.month.delivered[cargo] = (ind.month.delivered[cargo] ?? 0) + amount / targets.length;
  if (cargo !== 'passengers') return;
  const employers = near.filter(wantsWorkers);
  for (const ind of employers) ind.month.workers += amount / employers.length;
}
