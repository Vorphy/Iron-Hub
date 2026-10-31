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
    /** Punkt kontrolny na istniejącym torze. */
    waypoint: 500,
    depot: 1000,
    signal: 200,
    /** Kafelek mostu (przyczółki i pomost). */
    bridgeTile: 400,
    /** Kafelek tunelu (z portalami). */
    tunnelTile: 600,
    /** Zmiana wysokości jednego narożnika terenu. */
    terraformCorner: 150,
    /**
     * Fundament pod torem na zboczu (łuk, rozjazd albo tor w poprzek zbocza) – za kafelek, do ceny torów.
     * Jak w OpenTTD: 2,5× ceny elementu toru.
     */
    foundation: 250,
    /** Oczyszczenie nieużytku. */
    clearRough: 50,
    /** Wyburzenie domu. */
    demolishHouse: 500,
    /** Rozbiórka drogi w mieście (miasto może ją z czasem odbudować). */
    removeRoad: 20,
    /** Sieć trakcyjna nad jednym kafelkiem toru (dla lokomotyw elektrycznych). */
    catenaryTile: 150,
    /** Element toru metra (pod ziemią – drążenie, kilka razy drożej od zwykłego toru). */
    metroTrackPiece: 500,
    /** Zjazd z powierzchni do metra. */
    metroRamp: 3000,
    /** Dopłata za kafelek peronu metra (hala peronu pod ziemią) – do ceny zwykłego peronu. */
    metroStationExtra: 1500,
  },

  /** Kredyt i bankructwo. */
  loan: {
    /** Najwyższy możliwy kredyt. */
    max: 300_000,
    /** Pożyczamy i spłacamy po tyle. */
    step: 10_000,
    /** Odsetki rocznie (naliczane co miesiąc, 1/12). */
    yearlyInterest: 0.05,
    /** Tyle zamknięć miesiąca z rzędu z ujemnym saldem = bankructwo (koniec gry). */
    bankruptcyMonths: 3,
  },

  /** Zwroty. */
  refunds: {
    /** Część kosztu zwracana przy rozbiórce (tory, stacje, zajezdnie, semafory, mosty, tunele). */
    demolition: 0.25,
    /** Część ceny pociągu zwracana przy sprzedaży. */
    trainResale: 0.75,
    /** Zwrot za starą lokomotywę przy wymianie: `full` ceny dla nowej, liniowo do `old` po `years` latach. */
    engineTradeIn: { full: 0.75, old: 0.1, years: 50 },
  },

  /** Utrzymanie infrastruktury – co miesiąc. */
  maintenance: {
    trackPiece: 2,
    stationTile: 10,
    depot: 30,
    signal: 1,
    catenaryTile: 1,
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

  /**
   * Stawki ładunków: zł za jednostkę za kafelek i liczba dni z pełną stawką.
   * 2026-10-21: −20% (po 10 latach gry 3,2 mln zł bez kredytu – zarobki za wysokie).
   */
  cargo: {
    passengers: { rate: 2.4, fastDays: 10 },
    mail: { rate: 3.6, fastDays: 8 },
    coal: { rate: 1.44, fastDays: 30 },
    ore: { rate: 1.52, fastDays: 30 },
    goods: { rate: 2.56, fastDays: 15 },
    wood: { rate: 1.36, fastDays: 30 },
  } satisfies Record<Cargo, { rate: number; fastDays: number }>,

  /** Stacje: zbieranie ładunku i ocena (jaka część produkcji trafia na stację). */
  station: {
    /** Bez pociągu z pasującym wagonem przez tyle dni stacja przestaje zbierać ładunek. */
    serviceDays: 60,
    /** Najwięcej czekającego ładunku jednego rodzaju. */
    maxWaiting: 4000,
  },

  /**
   * Ocena stacji jak w OpenTTD (UpdateStationRating): punkty 0–255 (255 = 100%), suma składników.
   * Ocena idzie do tej sumy powoli – najwyżej o `stepPerDay` punktów dziennie. Progi „do N” są
   * kumulowane (krótszy czas daje punkty ze wszystkich progów, które spełnia).
   */
  rating: {
    /** Ocena nowo obsługiwanego ładunku (OpenTTD: 175 ≈ 69%). */
    initial: 175,
    stepPerDay: 1,
    /** Prędkość maksymalna ostatniego pociągu: (km/h − speedFrom) / speedDivisor punktów. */
    speedFrom: 85,
    speedDivisor: 4,
    speedMax: 255,
    /** Dni od ostatniego załadunku: do N dni – +punkty. */
    pickupDays: [
      [52.5, 25],
      [30, 25],
      [15, 45],
      [7.5, 35],
    ],
    /** Czekający ładunek: `waitingBase` plus punkty za każdy próg „najwyżej N jednostek”. */
    waitingBase: -90,
    waiting: [
      [1500, 55],
      [1000, 35],
      [600, 10],
      [300, 20],
      [100, 10],
    ],
    /** Wiek lokomotywy ostatniego pociągu: poniżej N lat – +punkty. */
    ageYears: [
      [3, 10],
      [2, 10],
      [1, 13],
    ],
  },

  /** Miasta. */
  town: {
    /** Mieszkańcy domu według poziomu zabudowy (indeks = poziom 0–4; 5 – ozdoba, 6 – kościół: bez mieszkańców). */
    housePopulation: [0, 20, 45, 80, 140, 0, 0],
    /**
     * Ozdoby (park, staw, pomnik, fontanna) i kościół – tylko blisko rynku (do `ornamentRadius` kafelków).
     * Kościół jeden na miasto, gdy ma co najmniej `churchMinHouses` domów; ozdoba z szansą `ornamentChance`
     * przy każdym nowym budynku w tym promieniu, najwyżej 1 na `housesPerOrnament` domów.
     */
    ornamentRadius: 4,
    ornamentChance: 0.08,
    housesPerOrnament: 25,
    churchMinHouses: 8,
    /** Nowy albo rozbudowywany dom: 3 etapy budowy (wykop, rusztowanie, stan surowy) po tyle dni. */
    constructionStageDays: 5,
    /** Pasażerowie na miesiąc = mieszkańcy / passengerDivisor; poczta = mieszkańcy / mailDivisor. */
    passengerDivisor: 8,
    mailDivisor: 32,
    /** Mieszkańców w zasięgu stacji potrzebnych, by przyjmowała dany ładunek. */
    acceptance: { passengers: 1, mail: 100, goods: 200 } satisfies Partial<Record<Cargo, number>>,
    /** Nowe domy na miesiąc w obsługiwanym mieście: 1 + round(growthMaxExtra × odsetek przewiezionych pasażerów). */
    growthMaxExtra: 3,
    /** Szansa na nowy dom w mieście bez kolei (na miesiąc) – ok. 14 domów przez 40 lat. */
    unservedGrowthChance: 0.03,
    /** Szansa na rozbudowę jednego domu w obsługiwanym mieście (na miesiąc). */
    upgradeChance: 0.4,
    /** Kafelki w zasięgu stacji są tyle razy chętniej wybierane pod nowy dom. */
    stationPull: 6,
    /** Od tylu mieszkańców miasto domaga się metra (stacja na poziomie −1 w obrębie miasta). */
    metroDemandPop: 5000,
    /** Powyżej tylu mieszkańców miasto bez metra przestaje rosnąć. */
    metroRequiredPop: 10000,
    /** Miasto z metrem (od metroDemandPop): tyle domów więcej na miesiąc i dodatkowa szansa na rozbudowę. */
    metroGrowthExtra: 2,
    metroUpgradeChance: 0.6,
    /**
     * Wchłanianie (co miesiąc): gdy domy dwóch miast stoją najwyżej `absorbReach` kafelków od siebie,
     * miasto z co najmniej `absorbMinPop` mieszkańcami i ponad `absorbRatio` razy większe od sąsiada
     * wchłania go – sąsiad zostaje dzielnicą z dotychczasową nazwą.
     */
    absorbReach: 3,
    absorbMinPop: 5000,
    absorbRatio: 2,
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
    /**
     * Poziomy ponad `maxLevel` (6 i 7) tylko z pracownikami: pasażerami dowiezionymi na stację
     * w zasięgu zakładu. Na poziomie L (od `maxLevel`) potrzeba `workersPerLevel × L` na miesiąc –
     * inaczej zakład nie rośnie, a na poziomach 6–7 traci punkty rozwoju.
     */
    workerLevels: 2,
    workersPerLevel: 50,
    /** Z ilu ostatnich miesięcy liczymy średnie zaopatrzenie. */
    historyMonths: 3,
    /** Przetwórnia bez dostaw pracuje na tej części mocy. */
    idleProduction: 0.3,
  },
} as const;
