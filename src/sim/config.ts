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

/** Koszt wyburzenia domu. */
export const HOUSE_DEMOLISH_COST = 500;

/** Koszt zajezdni. */
export const DEPOT_COST = 1000;

/** Maksymalna liczba wagonów w składzie. */
export const MAX_WAGONS = 10;
/** Jaka część ceny pociągu wraca przy sprzedaży. */
export const TRAIN_RESALE_RATE = 0.75;

/** Jaka część kosztu wraca przy rozbiórce toru lub stacji. */
export const TRACK_REFUND_RATE = 0.25;

// --- Ruch pociągów (wartości startowe do strojenia) ---

/** Czas fizyki na jeden tick (s) – przyspiesza rozpędzanie względem czasu rzeczywistego. */
export const PHYS_DT = 0.25;
/** Jednostki toru na tick przy 1 km/h (100 km/h ≈ kafelek na sekundę przy prędkości 1×). */
export const UNITS_PER_KMH_TICK = 0.008;
/** Hamowanie: km/h na tick. */
export const BRAKE_KMH_PER_TICK = 1.0;
/** Przyczepność: część ciężaru lokomotywy dostępna jako siła pociągowa. */
export const ADHESION = 0.25;
/** Maksymalna prędkość na łuku 45°. */
export const BEND_SPEED = 80;
/** Prędkość dojazdu do celu na ostatnich metrach. */
export const CREEP_SPEED = 6;
/** Postój na stacji (ticki; 80 = 2 dni gry). */
export const STATION_WAIT_TICKS = 80;
/** Odstęp między pojazdami w składzie (jednostki toru). */
export const VEHICLE_GAP = 1;
/** Kary w wyszukiwaniu trasy (jednostki toru). */
export const REVERSE_PENALTY = 64;
export const BEND_PENALTY = 2;
/** Kara za element toru zajęty przez inny pociąg – trasa omija zajęte perony i tory. */
export const OCCUPIED_PENALTY = 48;
/** Czekający pociąg ponawia próbę rezerwacji co tyle ticków. */
export const RESERVE_RETRY_TICKS = 10;
/** Koszt semafora. */
export const SIGNAL_COST = 200;
