import { ECONOMY, type Traction } from '../../data/economy';
import data from '../../data/vehicles.json';
import { CARGO_DEFS, type Cargo } from '../economy/cargo';

export const CARGO_NAMES: Record<Cargo, string> = Object.fromEntries(
  Object.entries(CARGO_DEFS).map(([k, v]) => [k, v.name]),
) as Record<Cargo, string>;

/** Lokomotywa. Moc w kW, prędkość w km/h, masa w tonach, długość w jednostkach toru (kafelek = 16). */
export interface EngineDef {
  id: string;
  name: string;
  description: string;
  /** Rok wejścia do sprzedaży. */
  year: number;
  /** Rok wycofania ze sprzedaży (jeżdżące pociągi zostają); brak – bez końca. */
  retire?: number;
  power: number;
  maxSpeed: number;
  weight: number;
  length: number;
  cost: number;
  /** Rodzaj trakcji – od niego zależy koszt utrzymania (src/data/economy.ts). */
  traction: Traction;
  color: string;
}

export interface WagonDef {
  id: string;
  name: string;
  cargo: Cargo;
  capacity: number;
  weight: number;
  length: number;
  cost: number;
  color: string;
}

export const TRACTION_NAMES: Record<Traction, string> = { steam: 'parowa', diesel: 'spalinowa', electric: 'elektryczna' };

/** Roczny koszt utrzymania lokomotywy: część ceny zależna od trakcji (plik ekonomii). */
export function engineRunningCost(e: EngineDef): number {
  return Math.round(e.cost * ECONOMY.trainRunningCost.traction[e.traction]);
}

export function wagonRunningCost(w: WagonDef): number {
  return Math.round(w.cost * ECONOMY.trainRunningCost.wagon);
}

/** Definicje pojazdów pochodzą z pliku danych – dodatki to kolejne pliki tego typu. */
export const ENGINES: readonly EngineDef[] = data.engines as EngineDef[];
export const WAGONS: readonly WagonDef[] = data.wagons as WagonDef[];

const engineById = new Map(ENGINES.map((e) => [e.id, e]));
const wagonById = new Map(WAGONS.map((w) => [w.id, w]));

export function engineDef(id: string): EngineDef | undefined {
  return engineById.get(id);
}

export function wagonDef(id: string): WagonDef | undefined {
  return wagonById.get(id);
}

/**
 * Parametry całego składu (lokomotywy + wagony); zakłada poprawne id. `engines` – liczba lokomotyw
 * tego samego typu (podwójna trakcja: moc i masa się sumują, prędkość maksymalna bez zmian).
 */
export function consistStats(engine: string, wagons: readonly string[], engines = 1) {
  const e = engineById.get(engine)!;
  const ws = wagons.map((w) => wagonById.get(w)!);
  return {
    cost: e.cost * engines + ws.reduce((s, w) => s + w.cost, 0),
    weight: e.weight * engines + ws.reduce((s, w) => s + w.weight, 0),
    /** Masa lokomotyw – od niej zależy przyczepność. */
    engineWeight: e.weight * engines,
    length: e.length * engines + ws.reduce((s, w) => s + w.length, 0),
    maxSpeed: e.maxSpeed,
    power: e.power * engines,
    runningCost: engineRunningCost(e) * engines + ws.reduce((s, w) => s + wagonRunningCost(w), 0),
  };
}

/** Czy lokomotywę można kupić w danym roku. */
export function engineAvailable(e: EngineDef, year: number): boolean {
  return year >= e.year && (e.retire === undefined || year < e.retire);
}

/** Lokomotywy w sprzedaży w danym roku. */
export function availableEngines(year: number): EngineDef[] {
  return ENGINES.filter((e) => engineAvailable(e, year));
}
