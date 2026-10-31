import { ECONOMY } from '../../data/economy';
import { engineYear, maintenanceFactor } from '../research';
import type { SimEvent } from '../commands';
import { allTiles, catchment, platformStations } from '../station/station';
import type { GameState } from '../state';
import { nextFloat, nextInt } from '../rng';
import { consistStats, ENGINES } from '../trains/vehicles';
import { catenaryTiles } from '../track/catenary';
import { DAYS_PER_MONTH, gameDate, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../time';
import { growTown } from '../world/generate';
import { updateTownRoads } from '../world/roads';
import { checkDebt, closeMonth, monthlyInterest, spend } from './finance';
import {
  averageSupply,
  emptyIndustryMonth,
  industryDef,
  isPrimary,
  BASE_MAX_LEVEL,
  MAX_INDUSTRY_LEVEL,
  workersNeeded,
  monthlyDemand,
  type Industry,
} from './industry';
import {
  districtInfo,
  addMissingLandmarks,
  emptyTownMonth,
  HOUSE_POPULATION,
  MAX_HOUSE_LEVEL,
  metroStatus,
  startHouseConstruction,
  townTiles,
  type Town,
} from './town';
import { foundDistrict } from './districts';
import { absorbTowns } from './townMerge';

// Reguły z pliku ekonomii (src/data/economy.ts).
export const GROW_THRESHOLD = ECONOMY.industry.growThreshold;
export const DECLINE_THRESHOLD = ECONOMY.industry.declineThreshold;
export const LEVEL_POINTS = ECONOMY.industry.levelPoints;
const HISTORY_MONTHS = ECONOMY.industry.historyMonths;
export const MAINTENANCE = ECONOMY.maintenance;
const TOWN_GROWTH_MAX_EXTRA = ECONOMY.town.growthMaxExtra;
const UNSERVED_GROWTH_CHANCE = ECONOMY.town.unservedGrowthChance;
const UPGRADE_CHANCE = ECONOMY.town.upgradeChance;
const STATION_PULL = ECONOMY.town.stationPull;
const METRO_GROWTH_EXTRA = ECONOMY.town.metroGrowthExtra;
const METRO_UPGRADE_CHANCE = ECONOMY.town.metroUpgradeChance;
const NEW_DISTRICT_MIN_POP = ECONOMY.town.newDistrictMinPop;
/** Utrzymanie toru i peronu metra względem zwykłego. */
const METRO_MAINTENANCE = 2;

/** Zamknięcie miesiąca: rozwój fabryk i miast, koszty, bilans. Wywoływane na początku nowego miesiąca. */
export function monthlyEconomy(state: GameState, events: SimEvent[]): void {
  // Nowy rok: lokomotywy, które właśnie weszły do sprzedaży.
  const date = gameDate(state);
  if (date.month === 1) {
    // Prototypy lokomotyw (badania) przyspieszają wejście do sprzedaży.
    const year = engineYear(state);
    const engines = ENGINES.filter((e) => e.year === year).map((e) => e.id);
    if (engines.length) events.push({ type: 'newEngines', engines });
  }
  for (const ind of state.industries) closeIndustryMonth(ind);
  const nearStations = stationCatchmentMask(state);
  for (const town of state.towns) closeTownMonth(state, town, nearStations, events);
  absorbTowns(state, events);
  chargeRunningCosts(state);
  spend(state, 'interest', monthlyInterest(state));
  const left = checkDebt(state);
  if (left === 0) events.push({ type: 'bankrupt' });
  else if (left !== null) events.push({ type: 'debtWarning', monthsLeft: left });
  closeMonth(state);
  if (date.month === 1) closeTrainYear(state, events);
}

/** Wskaźnik miesiąca: kopalnie – odsetek wywiezionej produkcji, przetwórnie – średnie zaopatrzenie. */
export function monthRatio(ind: Industry): number {
  const def = industryDef(ind.type)!;
  if (isPrimary(def)) return ind.month.produced > 0 ? Math.min(1, ind.month.transported / ind.month.produced) : 0;
  const demand = monthlyDemand(ind);
  const ratios = def.accepts.map((c) => Math.min(1, (ind.month.delivered[c] ?? 0) / demand));
  return ratios.reduce((s, r) => s + r, 0) / ratios.length;
}

function closeIndustryMonth(ind: Industry): void {
  ind.history.push(monthRatio(ind));
  if (ind.history.length > HISTORY_MONTHS) ind.history.shift();
  const supply = averageSupply(ind) ?? 0;
  // Od poziomu 5 rozwój wymaga pracowników; na poziomach 6–7 ich brak cofa rozwój.
  const staffed = ind.month.workers >= workersNeeded(ind);
  if (supply >= GROW_THRESHOLD && staffed) ind.growth++;
  else if (supply <= DECLINE_THRESHOLD || (ind.level > BASE_MAX_LEVEL && !staffed)) ind.growth--;
  if (ind.growth >= LEVEL_POINTS) {
    ind.growth = 0;
    if (ind.level < MAX_INDUSTRY_LEVEL && staffed) ind.level++;
    else ind.growth = LEVEL_POINTS; // na maksimum (albo bez pracowników) nie zbieramy dalej
  } else if (ind.growth <= -LEVEL_POINTS) {
    ind.growth = 0;
    if (ind.level > 1) ind.level--;
    else ind.growth = -LEVEL_POINTS;
  }
  ind.month = emptyIndustryMonth();
}

/** Maska kafelków w zasięgu jakiejkolwiek stacji (miasta rosną w ich stronę). */
function stationCatchmentMask(state: GameState): Uint8Array {
  const mask = new Uint8Array(state.map.width * state.map.height);
  for (const st of platformStations(state)) for (const i of catchment(state.map, allTiles(st))) mask[i] = 1;
  return mask;
}

function closeTownMonth(state: GameState, town: Town, nearStations: Uint8Array, events: SimEvent[]): void {
  const m = town.month;
  town.lastTransported = m.passengers > 0 ? Math.min(1, m.passengersTransported / m.passengers) : 0;
  const served = m.passengersTransported > 0;
  const tiles = townTiles(state, town);
  const population = tiles.reduce((pop, i) => pop + HOUSE_POPULATION[state.map.house[i]!]!, 0);
  const metro = metroStatus(state, town, population);
  if ((metro === 'wanted' || metro === 'stalled') && !town.metroDemand) {
    town.metroDemand = true;
    events.push({ type: 'metroDemand', townId: town.id });
  }

  let houses = 0;
  if (served) houses = 1 + Math.round(TOWN_GROWTH_MAX_EXTRA * town.lastTransported);
  else if (nextFloat(state.rng) < UNSERVED_GROWTH_CHANCE) houses = 1;
  // Duże miasto: metro przyspiesza rozwój (za każdą dzielnicę ze stacją metra), bez metra powyżej progu miasto stoi.
  const metroDistricts = metro === 'metro' ? districtInfo(state, town).filter((d) => d.metro).length : 0;
  if (metro === 'metro') houses += METRO_GROWTH_EXTRA * metroDistricts;
  else if (metro === 'stalled') houses = 0;

  const before = new Set(tiles);
  const prefer = (i: number) => (nearStations[i] ? STATION_PULL : 1);
  const built = growTown(state, state.rng, town, houses, prefer);
  // Zabudowa doszła do brzegu dzielnic: nowa dzielnica przy krawędzi i dalszy wzrost wokół niej.
  if (built < houses && population >= NEW_DISTRICT_MIN_POP) {
    const district = foundDistrict(state, town, prefer);
    if (district) {
      events.push({ type: 'districtFounded', townId: town.id, district: district.name });
      growTown(state, state.rng, town, houses - built, prefer);
    }
  }
  for (const i of townTiles(state, town)) {
    if (before.has(i)) continue;
    startHouseConstruction(state, i);
    events.push(tileEvent(state, i));
  }
  updateTownRoads(state, town, events);
  for (const i of addMissingLandmarks(state, town, townTiles(state, town), nextFloat(state.rng))) {
    startHouseConstruction(state, i);
    events.push(tileEvent(state, i));
  }

  // W obsługiwanym mieście część domów się rozbudowuje (z metrem – częściej).
  if (metro !== 'stalled' && before.size > 0) {
    if (served && nextFloat(state.rng) < UPGRADE_CHANCE) upgradeHouse(state, tiles, events);
    for (let k = 0; k < metroDistricts; k++) {
      if (nextFloat(state.rng) < METRO_UPGRADE_CHANCE) upgradeHouse(state, tiles, events);
    }
  }
  town.month = emptyTownMonth();
}

function upgradeHouse(state: GameState, tiles: number[], events: SimEvent[]): void {
  const i = tiles[nextInt(state.rng, 0, tiles.length)]!;
  if (state.map.house[i]! < MAX_HOUSE_LEVEL) {
    state.map.house[i]!++;
    startHouseConstruction(state, i);
    events.push(tileEvent(state, i));
  }
}

function tileEvent(state: GameState, i: number): SimEvent {
  return { type: 'tileChanged', x: i % state.map.width, y: Math.floor(i / state.map.width) };
}

/** Koszty miesiąca: pociągi poza zajezdnią i utrzymanie infrastruktury. */
function chargeRunningCosts(state: GameState): void {
  let trains = 0;
  for (const t of state.trains) {
    if (t.status === 'depot') continue;
    const cost = (consistStats(t.engine, t.wagons, t.engineCount).runningCost * maintenanceFactor(state)) / 12;
    trains += cost;
    t.profitThisYear -= cost;
  }
  spend(state, 'trains', Math.round(trains));
  spend(state, 'infrastructure', infrastructureCost(state));
}

/** Nowy rok: zysk „w tym roku” przechodzi do „zeszłego”; pociągi na minusie (jeżdżące cały rok) – komunikat. */
function closeTrainYear(state: GameState, events: SimEvent[]): void {
  const yearTicks = TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR;
  const unprofitable: number[] = [];
  for (const t of state.trains) {
    t.profitLastYear = Math.round(t.profitThisYear);
    t.profitThisYear = 0;
    if (t.profitLastYear < 0 && state.tick - t.createdTick >= yearTicks) unprofitable.push(t.id);
  }
  if (unprofitable.length) events.push({ type: 'unprofitableTrains', trainIds: unprofitable });
}

export function infrastructureCost(state: GameState): number {
  const { map } = state;
  let pieces = 0;
  let stationTiles = 0;
  let metroPieces = 0;
  let metroStationTiles = 0;
  const bitCount = (v: number) => {
    let n = 0;
    for (let b = v; b; b &= b - 1) n++;
    return n;
  };
  for (let i = 0; i < map.track.length; i++) {
    pieces += bitCount(map.track[i]!);
    if (map.station[i]) stationTiles++;
    metroPieces += bitCount(map.under[i]!);
    if (map.stationUnder[i]) metroStationTiles++;
  }
  const total =
    pieces * MAINTENANCE.trackPiece +
    stationTiles * MAINTENANCE.stationTile +
    // Metro (tunele, wentylacja) – utrzymanie razy METRO_MAINTENANCE.
    (metroPieces * MAINTENANCE.trackPiece + metroStationTiles * MAINTENANCE.stationTile) * METRO_MAINTENANCE +
    state.depots.length * MAINTENANCE.depot +
    state.signals.length * MAINTENANCE.signal +
    catenaryTiles(map) * MAINTENANCE.catenaryTile;
  return Math.round(total * maintenanceFactor(state));
}
