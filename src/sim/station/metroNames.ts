// Nazwy stacji metra – z miasta i okolicy zamiast „Metro 13”, „Metro 14” (roadmapa pkt 26).
import { screenDirection } from '../economy/districts';
import { industryDef } from '../economy/industry';
import { districtIndexAt, type Town, townAt } from '../economy/town';
import type { GameState } from '../state';

/** Miejsca jak w prawdziwych sieciach metra – kolejność startowa zależy od położenia stacji. */
export const METRO_PLACES = [
  'Ratusz',
  'Rynek',
  'Dworzec',
  'Politechnika',
  'Uniwersytet',
  'Plac Kolejarzy',
  'Teatr',
  'Opera',
  'Muzeum',
  'Stadion',
  'Szpital',
  'Hala Targowa',
  'Park Miejski',
  'Ogród Botaniczny',
  'Zoo',
  'Arsenał',
  'Mennica',
  'Bulwary',
  'Most',
  'Katedra',
  'Zamek',
  'Rondo Parowe',
  'Aleja Semaforów',
  'Plac Zwrotnicy',
  'Kolejowa',
  'Dworcowa',
  'Fabryczna',
  'Ogrodowa',
  'Targowa',
  'Biblioteka',
  'Filharmonia',
  'Poczta Główna',
];

/** Promień, w którym stacja bierze nazwę od miasta i od zakładu. */
const TOWN_RADIUS = 16;
const INDUSTRY_RADIUS = 6;
/** Od tylu kafelków od środka dzielnicy nazwa dostaje stronę świata. */
const DIRECTION_MIN = 3;

/**
 * Miasto stacji: pod nią (zabudowa miasta) albo z najbliższym środkiem dzielnicy w promieniu –
 * w metropolii daleka dzielnica też należy do miasta, choć do rynku jest daleko.
 */
function townNear(state: GameState, cx: number, cy: number): Town | undefined {
  const here = townAt(state, Math.floor(cx), Math.floor(cy));
  if (here) return here;
  let best: Town | undefined;
  let bestD = TOWN_RADIUS;
  for (const t of state.towns) {
    for (const d of t.districts) {
      const dist = Math.abs(d.x - cx) + Math.abs(d.y - cy);
      if (dist < bestD) {
        bestD = dist;
        best = t;
      }
    }
  }
  return best;
}

/**
 * Nazwa nowej stacji metra w punkcie (cx, cy) – pierwsza wolna z listy:
 * „Miasto Metro”, dzielnica („Bocznica Zatorze”, w centrum – „Bocznica Centrum”), strona świata względem środka
 * dzielnicy („Bocznica Północ”), pobliski zakład („Bocznica Huta”), miejsce („Ratusz”, potem „Bocznica Ratusz”),
 * a dopiero na końcu numer („Bocznica Metro 2”).
 */
export function metroStationName(state: GameState, cx: number, cy: number, taken: ReadonlySet<string>): string {
  const town = townNear(state, cx, cy);
  const candidates: string[] = [];
  const start = Math.abs(Math.round(cx) * 31 + Math.round(cy) * 17) % METRO_PLACES.length;
  const places = METRO_PLACES.map((_, k) => METRO_PLACES[(start + k) % METRO_PLACES.length]!);
  if (town) {
    const t = town.name;
    candidates.push(`${t} Metro`);
    const k = districtIndexAt(town, cx, cy);
    const d = town.districts[k]!;
    // Starsze nazwy stron świata zapisane z nazwą miasta („Bocznica-Północ”) – bez powtórzenia miasta.
    const district = k === 0 ? 'Centrum' : d.name.startsWith(`${t}-`) ? d.name.slice(t.length + 1) : d.name;
    candidates.push(`${t} ${district}`);
    if (Math.abs(cx - d.x) + Math.abs(cy - d.y) >= DIRECTION_MIN) {
      const dir = screenDirection(cx - d.x, cy - d.y);
      candidates.push(k === 0 ? `${t} ${dir}` : `${t} ${district} ${dir}`);
    }
    const industries = state.industries
      .map((ind) => ({ ind, dist: Math.abs(ind.x + 1 - cx) + Math.abs(ind.y + 1 - cy) }))
      .filter((e) => e.dist <= INDUSTRY_RADIUS)
      .sort((a, b) => a.dist - b.dist);
    for (const { ind } of industries) {
      const def = industryDef(ind.type);
      if (def) candidates.push(`${t} ${def.name}`);
    }
    for (const p of places) candidates.push(p, `${t} ${p}`);
    for (const name of candidates) if (!taken.has(name)) return name;
    for (let i = 2; ; i++) if (!taken.has(`${t} Metro ${i}`)) return `${t} Metro ${i}`;
  }
  for (const p of places) if (!taken.has(p)) return p;
  for (let i = 1; ; i++) if (!taken.has(`Metro ${i}`)) return `Metro ${i}`;
}

/** Stare nazwy „Metro 1”, „Metro 2”… (zapisy sprzed v37) – nowe, w kolejności numerów stacji. */
export function renameNumberedMetro(state: GameState): void {
  const W = state.map.width;
  for (const st of [...state.stations].sort((a, b) => a.id - b.id)) {
    if (!/^Metro \d+$/.test(st.name) || !st.underTiles?.length) continue;
    const tiles = st.underTiles;
    const cx = tiles.reduce((s, t) => s + (t % W), 0) / tiles.length;
    const cy = tiles.reduce((s, t) => s + Math.floor(t / W), 0) / tiles.length;
    const taken = new Set(state.stations.filter((s) => s !== st).map((s) => s.name));
    st.name = metroStationName(state, cx, cy, taken);
  }
}
