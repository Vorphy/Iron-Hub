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
  year: number;
  power: number;
  maxSpeed: number;
  weight: number;
  length: number;
  cost: number;
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

/** Definicje pojazdów pochodzą z pliku danych – dodatki to kolejne pliki tego typu. */
export const ENGINES: readonly EngineDef[] = data.engines;
export const WAGONS: readonly WagonDef[] = data.wagons as WagonDef[];

const engineById = new Map(ENGINES.map((e) => [e.id, e]));
const wagonById = new Map(WAGONS.map((w) => [w.id, w]));

export function engineDef(id: string): EngineDef | undefined {
  return engineById.get(id);
}

export function wagonDef(id: string): WagonDef | undefined {
  return wagonById.get(id);
}

/** Parametry całego składu (lokomotywa + wagony); zakłada poprawne id. */
export function consistStats(engine: string, wagons: readonly string[]) {
  const e = engineById.get(engine)!;
  const ws = wagons.map((w) => wagonById.get(w)!);
  return {
    cost: e.cost + ws.reduce((s, w) => s + w.cost, 0),
    weight: e.weight + ws.reduce((s, w) => s + w.weight, 0),
    length: e.length + ws.reduce((s, w) => s + w.length, 0),
    maxSpeed: e.maxSpeed,
    power: e.power,
  };
}
