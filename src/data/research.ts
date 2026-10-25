/**
 * BADANIA – na co wydawać pieniądze w dalszej grze. Jedno badanie naraz: płacisz z góry, po upływie
 * czasu rośnie poziom. Każdy kolejny poziom droższy i dłuższy (costGrowth, daysGrowth).
 * Liczby do strojenia – efekty liczy src/sim/research.ts.
 */
export type ResearchId = 'capacity' | 'speed' | 'loading' | 'maintenance' | 'rating' | 'engines';

export interface ResearchDef {
  id: ResearchId;
  name: string;
  /** Opis efektu jednego poziomu (dla gracza). */
  effect: string;
  maxLevel: number;
  /** Cena i czas (dni gry) pierwszego poziomu. */
  cost: number;
  days: number;
  /** Wielkość efektu na poziom (ułamek albo lata – patrz opis). */
  perLevel: number;
}

export const RESEARCH: readonly ResearchDef[] = [
  {
    id: 'capacity',
    name: 'Większe wagony',
    effect: '+10% ładowności wszystkich wagonów',
    maxLevel: 5,
    cost: 40_000,
    days: 60,
    perLevel: 0.1,
  },
  {
    id: 'speed',
    name: 'Szybsze pociągi',
    effect: '+10% prędkości maksymalnej lokomotyw',
    maxLevel: 3,
    cost: 60_000,
    days: 90,
    perLevel: 0.1,
  },
  {
    id: 'loading',
    name: 'Sprawny załadunek',
    effect: '−15% czasu postoju na stacji',
    maxLevel: 3,
    cost: 30_000,
    days: 45,
    perLevel: 0.15,
  },
  {
    id: 'maintenance',
    name: 'Tańsze utrzymanie',
    effect: '−10% kosztów utrzymania pociągów i infrastruktury',
    maxLevel: 3,
    cost: 50_000,
    days: 60,
    perLevel: 0.1,
  },
  {
    id: 'rating',
    name: 'Lepsza obsługa stacji',
    effect: '+5 pkt oceny stacji – więcej ładunku trafia na stacje',
    maxLevel: 3,
    cost: 35_000,
    days: 45,
    perLevel: 0.05,
  },
  {
    id: 'engines',
    name: 'Prototypy lokomotyw',
    effect: 'nowe lokomotywy 2 lata wcześniej',
    maxLevel: 3,
    cost: 45_000,
    days: 60,
    perLevel: 2,
  },
];

/** Każdy kolejny poziom: cena × costGrowth, czas × daysGrowth. */
export const RESEARCH_COST_GROWTH = 2;
export const RESEARCH_DAYS_GROWTH = 1.5;
/** Zwrot przy przerwaniu badania (część ceny). */
export const RESEARCH_CANCEL_REFUND = 0.5;
