// Parametry gry. Kwoty i reguły ekonomii są w src/data/economy.ts – tu tylko je udostępniamy
// pod dotychczasowymi nazwami; poniżej limity budowy i fizyka ruchu.
import { ECONOMY } from '../data/economy';

const C = ECONOMY.construction;

export const START_MONEY = ECONOMY.startMoney;
export const CLEAR_ROUGH_COST = C.clearRough;
export const TRACK_COST = C.trackPiece;
export const STATION_TILE_COST = C.stationTile;
export const HOUSE_DEMOLISH_COST = C.demolishHouse;
export const ROAD_REMOVE_COST = C.removeRoad;
export const TERRAFORM_COST = C.terraformCorner;
export const BRIDGE_TILE_COST = C.bridgeTile;
export const TUNNEL_TILE_COST = C.tunnelTile;
export const DEPOT_COST = C.depot;
export const SIGNAL_COST = C.signal;
export const TRAIN_RESALE_RATE = ECONOMY.refunds.trainResale;
export const TRACK_REFUND_RATE = ECONOMY.refunds.demolition;

// --- Limity budowy ---

/** Maksymalna długość peronu i liczba torów stacji. */
export const STATION_MAX_LENGTH = 12;
export const STATION_MAX_PLATFORMS = 6;
/** Zasięg stacji w kafelkach od krawędzi peronów. */
export const CATCHMENT_RADIUS = 4;

/** Najdłuższy most (z przyczółkami) i tunel. */
export const MAX_BRIDGE_LENGTH = 14;
export const MAX_TUNNEL_LENGTH = 20;
/** Maksymalna liczba wagonów w składzie. */
export const MAX_WAGONS = 10;

// --- Ruch pociągów (wartości startowe do strojenia) ---

/** Czas fizyki na jeden tick (s) – przyspiesza rozpędzanie względem czasu rzeczywistego. */
export const PHYS_DT = 0.25;
/** Jednostki toru na tick przy 1 km/h (100 km/h ≈ kafelek na sekundę przy prędkości 1×). */
export const UNITS_PER_KMH_TICK = 0.008;
/** Hamowanie: km/h na tick. */
export const BRAKE_KMH_PER_TICK = 1.0;
/** Przyczepność: część ciężaru lokomotywy dostępna jako siła pociągowa. */
export const ADHESION = 0.25;
/** Nachylenie toru wznoszącego się o 1 poziom na długości kafelka (0,04 = 4%). */
export const GRADE_PER_LEVEL = 0.04;
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
/**
 * Zakleszczenie (pociągi czekają na siebie nawzajem): po tylu tickach czekania zawraca pociąg
 * o najniższym numerze w zakleszczeniu (120 = 3 dni gry).
 */
export const DEADLOCK_REVERSE_TICKS = 120;
/** Czekający pociąg ponawia próbę rezerwacji co tyle ticków. */
export const RESERVE_RETRY_TICKS = 10;
