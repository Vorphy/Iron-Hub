/**
 * EKONOMIA – wszystkie reguły ekonomiczne gry w jednym miejscu.
 *
 * Wartości startowe, do strojenia. Kwoty w zł, czas w dniach gry (1 dzień = 2 s przy prędkości 1×),
 * odsetki jako ułamki (0.25 = 25%). Ceny i parametry konkretnych pojazdów są w `vehicles.json`,
 * produkcja konkretnych zakładów w `industries.json` – tu są reguły wspólne dla wszystkich.
 *
 * Po zmianie wartości gra przeładuje się sama (npm run dev); testy (npm test) pokażą,
 * czy któraś reguła przestała działać.
 */
import type { Cargo } from '../sim/economy/cargo';

export type Traction = 'steam' | 'diesel' | 'electric';

export const ECONOMY = {
  /** Pieniądze na start nowej gry. */
  startMoney: 100_000,

  /** Ceny budowy. */
  construction: {
    /** Element toru (prosty lub łuk). */
    trackPiece: 100,
    /** Kafelek peronu (razem z torem). */
    stationTile: 300,
    depot: 1000,
    signal: 200,
    /** Kafelek mostu (przyczółki i pomost). */
    bridgeTile: 400,
    /** Kafelek tunelu (z portalami). */
    tunnelTile: 600,
    /** Zmiana wysokości jednego narożnika terenu. */
    terraformCorner: 30,
    /** Oczyszczenie nieużytku. */
    clearRough: 50,
    /** Wyburzenie domu. */
    demolishHouse: 500,
  },

  /** Zwroty. */
  refunds: {
    /** Część kosztu zwracana przy rozbiórce (tory, stacje, zajezdnie, semafory, mosty, tunele). */
    demolition: 0.25,
    /** Część ceny pociągu zwracana przy sprzedaży. */
    trainResale: 0.75,
  },

  /** Utrzymanie infrastruktury – co miesiąc. */
  maintenance: {
    trackPiece: 2,
    stationTile: 10,
    depot: 30,
    signal: 1,
  },

  /**
   * Utrzymanie pociągów – rocznie, jako część ceny zakupu (naliczane co miesiąc, tylko poza zajezdnią).
   * Lokomotywa według rodzaju trakcji, wagony osobno.
   */
  trainRunningCost: {
    traction: {
      steam: 0.2,
      diesel: 0.15,
      electric: 0.1,
    } satisfies Record<Traction, number>,
    wagon: 0.1,
  },

  /**
   * Zapłata za przewóz = ilość × stawka × odległość między stacjami (kafelki) × współczynnik czasu.
   * Do `fastDays` dni płacimy 100%, potem zapłata spada liniowo przez `lateDecayDays` dni do `minTimeFactor`.
   */
  delivery: {
    lateDecayDays: 60,
    minTimeFactor: 0.3,
  },

  /** Stawki ładunków: zł za jednostkę za kafelek i liczba dni z pełną stawką. */
  cargo: {
    passengers: { rate: 3.0, fastDays: 10 },
    mail: { rate: 4.5, fastDays: 8 },
    coal: { rate: 1.8, fastDays: 30 },
    ore: { rate: 1.9, fastDays: 30 },
    goods: { rate: 3.2, fastDays: 15 },
    wood: { rate: 1.7, fastDays: 30 },
  } satisfies Record<Cargo, { rate: number; fastDays: number }>,

  /** Stacje: zbieranie ładunku i ocena (jaka część produkcji trafia na stację). */
  station: {
    /** Bez pociągu z pasującym wagonem przez tyle dni stacja przestaje zbierać ładunek. */
    serviceDays: 60,
    /** Kursy co najwyżej co tyle dni – ocena maksymalna. */
    frequentDays: 7,
    ratingMax: 0.95,
    /** Ocena przy kursach co `serviceDays` dni. */
    ratingMin: 0.4,
    /** Gdy czeka więcej niż tyle jednostek, ocena spada o `crowdedPenalty`. */
    crowdedAmount: 500,
    crowdedPenalty: 0.15,
    /** Najwięcej czekającego ładunku jednego rodzaju. */
    maxWaiting: 4000,
  },

  /** Miasta. */
  town: {
    /** Mieszkańcy domu według poziomu zabudowy (indeks = poziom 0–4). */
    housePopulation: [0, 20, 45, 80, 140],
    /** Pasażerowie na miesiąc = mieszkańcy / passengerDivisor; poczta = mieszkańcy / mailDivisor. */
    passengerDivisor: 4,
    mailDivisor: 16,
    /** Mieszkańców w zasięgu stacji potrzebnych, by przyjmowała dany ładunek. */
    acceptance: { passengers: 1, mail: 100, goods: 200 } satisfies Partial<Record<Cargo, number>>,
    /** Nowe domy na miesiąc w obsługiwanym mieście: 1 + round(growthMaxExtra × odsetek przewiezionych pasażerów). */
    growthMaxExtra: 3,
    /** Szansa na nowy dom w mieście bez kolei (na miesiąc). */
    unservedGrowthChance: 0.1,
    /** Szansa na rozbudowę jednego domu w obsługiwanym mieście (na miesiąc). */
    upgradeChance: 0.4,
    /** Kafelki w zasięgu stacji są tyle razy chętniej wybierane pod nowy dom. */
    stationPull: 6,
  },

  /** Zakłady przemysłowe – reguły rozwoju (docs/03-mechaniki.md). */
  industry: {
    /** Zaopatrzenie (lub wywóz) od tego progu: +1 punkt rozwoju na miesiąc. */
    growThreshold: 0.75,
    /** Do tego progu: −1 punkt rozwoju na miesiąc. */
    declineThreshold: 0.5,
    /** Tyle punktów = zmiana poziomu. */
    levelPoints: 12,
    maxLevel: 5,
    /** Z ilu ostatnich miesięcy liczymy średnie zaopatrzenie. */
    historyMonths: 3,
    /** Przetwórnia bez dostaw pracuje na tej części mocy. */
    idleProduction: 0.3,
  },
} as const;
