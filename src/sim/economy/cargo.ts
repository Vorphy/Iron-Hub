import { ECONOMY } from '../../data/economy';

export type Cargo = 'passengers' | 'mail' | 'coal' | 'ore' | 'goods' | 'wood';

export const CARGOS: readonly Cargo[] = ['passengers', 'mail', 'coal', 'ore', 'goods', 'wood'];

export interface CargoDef {
  name: string;
  /** Jednostka do wyświetlania. */
  unit: string;
  /** Stawka: zł za jednostkę za kafelek odległości (przy szybkiej dostawie). */
  rate: number;
  /** Do tylu dni przewozu płacimy pełną stawkę, potem coraz mniej. */
  fastDays: number;
  color: string;
}

/** Nazwy i kolory ładunków; stawki i dni – z pliku ekonomii (src/data/economy.ts). */
export const CARGO_DEFS: Record<Cargo, CargoDef> = {
  passengers: { name: 'pasażerowie', unit: 'os.', color: '#e9c46a', ...ECONOMY.cargo.passengers },
  mail: { name: 'poczta', unit: 'worków', color: '#f4a261', ...ECONOMY.cargo.mail },
  coal: { name: 'węgiel', unit: 't', color: '#3a3a3a', ...ECONOMY.cargo.coal },
  ore: { name: 'ruda', unit: 't', color: '#8a5a3c', ...ECONOMY.cargo.ore },
  goods: { name: 'towary', unit: 'skrzyń', color: '#6b4f2e', ...ECONOMY.cargo.goods },
  wood: { name: 'drewno', unit: 't', color: '#8c7a5a', ...ECONOMY.cargo.wood },
};

export function isCargo(v: unknown): v is Cargo {
  return typeof v === 'string' && (CARGOS as readonly string[]).includes(v);
}
