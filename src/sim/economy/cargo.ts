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

/** Wartości startowe – do strojenia. */
export const CARGO_DEFS: Record<Cargo, CargoDef> = {
  passengers: { name: 'pasażerowie', unit: 'os.', rate: 3.0, fastDays: 10, color: '#e9c46a' },
  mail: { name: 'poczta', unit: 'worków', rate: 4.5, fastDays: 8, color: '#f4a261' },
  coal: { name: 'węgiel', unit: 't', rate: 1.8, fastDays: 30, color: '#3a3a3a' },
  ore: { name: 'ruda', unit: 't', rate: 1.9, fastDays: 30, color: '#8a5a3c' },
  goods: { name: 'towary', unit: 'skrzyń', rate: 3.2, fastDays: 15, color: '#6b4f2e' },
  wood: { name: 'drewno', unit: 't', rate: 1.7, fastDays: 30, color: '#8c7a5a' },
};

export function isCargo(v: unknown): v is Cargo {
  return typeof v === 'string' && (CARGOS as readonly string[]).includes(v);
}
