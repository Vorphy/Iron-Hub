import { ECONOMY } from '../../data/economy';
import type { SimEvent } from '../commands';
import type { GameState } from '../state';
import { type Town, townPopulation, townTiles } from './town';

const T = ECONOMY.town;

/** Miasta, których domy stoją najwyżej `absorbReach` kafelków od domów `town`. */
export function touchingTowns(state: GameState, town: Town): number[] {
  const { map } = state;
  const r = T.absorbReach;
  const out = new Set<number>();
  for (const i of townTiles(state, town)) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    for (let ny = Math.max(0, y - r); ny <= Math.min(map.height - 1, y + r); ny++) {
      for (let nx = Math.max(0, x - r); nx <= Math.min(map.width - 1, x + r); nx++) {
        const id = map.town[ny * map.width + nx]!;
        if (id && id !== town.id) out.add(id);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * `big` wchłania `small`: domy przechodzą do `big`, dzielnice `small` dołączają do jego listy
 * (centrum pod nazwą miasta), statystyki miesiąca się sumują, a ocena to średnia ważona mieszkańcami.
 */
export function absorbTown(state: GameState, big: Town, small: Town): void {
  const { map } = state;
  const bigPop = townPopulation(state, big);
  const smallPop = townPopulation(state, small);
  // Cała mapa, nie tylko obszar dzielnic – żaden dom nie może zostać przy usuniętym mieście.
  for (let i = 0; i < map.town.length; i++) if (map.town[i] === small.id) map.town[i] = big.id;
  big.districts.push(...small.districts.map((d, k) => ({ ...d, name: k === 0 ? small.name : d.name })));
  for (const key of Object.keys(big.month) as (keyof Town['month'])[]) big.month[key] += small.month[key];
  const total = bigPop + smallPop;
  if (total > 0) big.lastTransported = (big.lastTransported * bigPop + small.lastTransported * smallPop) / total;
  state.towns.splice(state.towns.indexOf(small), 1);
}

/** Zamknięcie miesiąca: duże miasta wchłaniają mniejszych sąsiadów, z którymi się zrosły. */
export function absorbTowns(state: GameState, events: SimEvent[]): void {
  const pop = new Map(state.towns.map((t) => [t.id, townPopulation(state, t)]));
  const order = [...state.towns].sort((a, b) => pop.get(b.id)! - pop.get(a.id)! || a.id - b.id);
  for (const big of order) {
    if (!state.towns.includes(big)) continue;
    if (pop.get(big.id)! < T.absorbMinPop) break;
    for (const id of touchingTowns(state, big)) {
      const small = state.towns.find((t) => t.id === id);
      if (!small || pop.get(big.id)! <= T.absorbRatio * pop.get(id)!) continue;
      absorbTown(state, big, small);
      pop.set(big.id, pop.get(big.id)! + pop.get(id)!);
      pop.delete(id);
      events.push({ type: 'townAbsorbed', townId: big.id, district: small.name });
    }
  }
}
