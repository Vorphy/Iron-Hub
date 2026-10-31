import { ECONOMY } from '../../data/economy';
import type { SimEvent } from '../commands';
import type { GameState } from '../state';
import { type Town, townPopulation, townTiles } from './town';

const T = ECONOMY.town;

/** Sąsiedzi kafelka (także po skosie) w obrębie mapy. */
function forEachAround(map: { width: number; height: number }, i: number, fn: (j: number) => void): void {
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < map.width && ny < map.height) fn(ny * map.width + nx);
    }
  }
}

/**
 * Miasta zrośnięte z `town`: ich dom styka się z jego domem (także po skosie) albo łączy je droga –
 * ciąg dróg od ulicy przy domu `town` do ulicy przy domu innego miasta.
 */
export function touchingTowns(state: GameState, town: Town): number[] {
  const { map } = state;
  const out = new Set<number>();
  const other = (j: number) => {
    const id = map.town[j]!;
    if (id && id !== town.id) out.add(id);
  };
  // Drogi przy domach miasta – start przeszukiwania sieci dróg.
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const i of townTiles(state, town)) {
    forEachAround(map, i, (j) => {
      other(j);
      if (map.road[j] && !seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    });
  }
  const w = map.width;
  while (queue.length) {
    const i = queue.pop()!;
    forEachAround(map, i, other);
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= map.road.length || !map.road[j] || seen.has(j)) continue;
      seen.add(j);
      queue.push(j);
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
  // Kto zrastał się z wchłoniętym, zrasta się teraz z `big` – bez liczenia roku od nowa.
  for (const t of state.towns) if (t.contact?.townId === small.id) t.contact.townId = big.id;
  if (big.contact?.townId === big.id) delete big.contact;
}

/**
 * Zamknięcie miesiąca: miasto, które styka się z większym sąsiadem (przy równej liczbie mieszkańców –
 * starszym, o niższym numerze), po `absorbMonths` miesiącach styku zostaje jego dzielnicą. Miasta
 * nie przejmują się nawzajem w inny sposób.
 */
export function absorbTowns(state: GameState, events: SimEvent[]): void {
  const pop = new Map(state.towns.map((t) => [t.id, townPopulation(state, t)]));
  const bigger = (a: Town, b: Town) => pop.get(a.id)! > pop.get(b.id)! || (pop.get(a.id) === pop.get(b.id) && a.id < b.id);
  for (const town of state.towns) {
    let absorber: Town | undefined;
    for (const id of touchingTowns(state, town)) {
      const other = state.towns.find((t) => t.id === id);
      if (other && bigger(other, town) && (!absorber || bigger(other, absorber))) absorber = other;
    }
    if (!absorber) {
      delete town.contact;
      continue;
    }
    if (town.contact?.townId === absorber.id) town.contact.months++;
    else {
      town.contact = { townId: absorber.id, months: 1 };
      events.push({ type: 'townsTouching', townId: absorber.id, smallId: town.id });
    }
  }
  // Najpierw najmniejsze – łańcuch C → B → A w jednym miesiącu kończy się w A.
  const ready = state.towns
    .filter((t) => t.contact && t.contact.months >= T.absorbMonths)
    .sort((a, b) => pop.get(a.id)! - pop.get(b.id)! || b.id - a.id);
  for (const small of ready) {
    const big = state.towns.find((t) => t.id === small.contact?.townId);
    if (!big || !state.towns.includes(small)) continue;
    delete small.contact;
    absorbTown(state, big, small);
    events.push({ type: 'townAbsorbed', townId: big.id, district: small.name });
  }
}
