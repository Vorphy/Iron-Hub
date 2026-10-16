// Parametry gry – wartości startowe, do strojenia.

export const START_MONEY = 100_000;
export const CLEAR_ROUGH_COST = 50;

/** Koszt jednego elementu toru (prosty lub łuk). */
export const TRACK_COST = 100;
/** Koszt jednego kafelka peronu (razem z torem). */
export const STATION_TILE_COST = 300;
/** Maksymalna długość peronu i liczba torów stacji. */
export const STATION_MAX_LENGTH = 12;
export const STATION_MAX_PLATFORMS = 6;
/** Zasięg stacji w kafelkach od krawędzi peronów. */
export const CATCHMENT_RADIUS = 4;

/** Koszt zajezdni. */
export const DEPOT_COST = 1000;

/** Jaka część kosztu wraca przy rozbiórce toru lub stacji. */
export const TRACK_REFUND_RATE = 0.25;
