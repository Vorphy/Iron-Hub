import { ECONOMY } from '../../data/economy';
import type { SimEvent } from '../commands';
import { catchment } from '../station/station';
import type { GameState } from '../state';
import { nextFloat, nextInt } from '../rng';
import { consistStats } from '../trains/vehicles';
import { growTown } from '../world/generate';
import { updateTownRoads } from '../world/roads';
import { closeMonth, spend } from './finance';
import {
  averageSupply,
  emptyIndustryMonth,
  industryDef,
  isPrimary,
  MAX_INDUSTRY_LEVEL,
  monthlyDemand,
  type Industry,
} from './industry';
import { emptyTownMonth, MAX_HOUSE_LEVEL, townTiles, type Town } from './town';

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

/** Zamknięcie miesiąca: rozwój fabryk i miast, koszty, bilans. Wywoływane na początku nowego miesiąca. */
export function monthlyEconomy(state: GameState, events: SimEvent[]): void {
  for (const ind of state.industries) closeIndustryMonth(ind);
  const nearStations = stationCatchmentMask(state);
  for (const town of state.towns) closeTownMonth(state, town, nearStations, events);
  chargeRunningCosts(state);
  closeMonth(state);
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
  if (supply >= GROW_THRESHOLD) ind.growth++;
  else if (supply <= DECLINE_THRESHOLD) ind.growth--;
  if (ind.growth >= LEVEL_POINTS) {
    ind.growth = 0;
    if (ind.level < MAX_INDUSTRY_LEVEL) ind.level++;
    else ind.growth = LEVEL_POINTS; // na maksimum nie zbieramy dalej
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
  for (const st of state.stations) for (const i of catchment(state.map, st.tiles)) mask[i] = 1;
  return mask;
}

function closeTownMonth(state: GameState, town: Town, nearStations: Uint8Array, events: SimEvent[]): void {
  const m = town.month;
  town.lastTransported = m.passengers > 0 ? Math.min(1, m.passengersTransported / m.passengers) : 0;
  const served = m.passengersTransported > 0;
  let houses = 0;
  if (served) houses = 1 + Math.round(TOWN_GROWTH_MAX_EXTRA * town.lastTransported);
  else if (nextFloat(state.rng) < UNSERVED_GROWTH_CHANCE) houses = 1;

  const before = new Set(townTiles(state, town));
  growTown(state, state.rng, town, houses, (i) => (nearStations[i] ? STATION_PULL : 1));
  for (const i of townTiles(state, town)) if (!before.has(i)) events.push(tileEvent(state, i));
  updateTownRoads(state, town, events);

  // W obsługiwanym mieście część domów się rozbudowuje.
  if (served && nextFloat(state.rng) < UPGRADE_CHANCE && before.size > 0) {
    const list = [...before];
    const i = list[nextInt(state.rng, 0, list.length)]!;
    if (state.map.house[i]! < MAX_HOUSE_LEVEL) {
      state.map.house[i]!++;
      events.push(tileEvent(state, i));
    }
  }
  town.month = emptyTownMonth();
}

function tileEvent(state: GameState, i: number): SimEvent {
  return { type: 'tileChanged', x: i % state.map.width, y: Math.floor(i / state.map.width) };
}

/** Koszty miesiąca: pociągi poza zajezdnią i utrzymanie infrastruktury. */
function chargeRunningCosts(state: GameState): void {
  let trains = 0;
  for (const t of state.trains) {
    if (t.status !== 'depot') trains += consistStats(t.engine, t.wagons).runningCost / 12;
  }
  spend(state, 'trains', Math.round(trains));
  spend(state, 'infrastructure', infrastructureCost(state));
}

export function infrastructureCost(state: GameState): number {
  const { map } = state;
  let pieces = 0;
  let stationTiles = 0;
  for (let i = 0; i < map.track.length; i++) {
    let b = map.track[i]!;
    while (b) {
      b &= b - 1;
      pieces++;
    }
    if (map.station[i]) stationTiles++;
  }
  return (
    pieces * MAINTENANCE.trackPiece +
    stationTiles * MAINTENANCE.stationTile +
    state.depots.length * MAINTENANCE.depot +
    state.signals.length * MAINTENANCE.signal
  );
}
