// Parametry gry. Kwoty i reguły ekonomii są w src/data/economy.ts – tu tylko je udostępniamy
// pod dotychczasowymi nazwami; poniżej limity budowy i fizyka ruchu.
import { ECONOMY } from '../data/economy';
import { TICKS_PER_DAY } from './time';

const C = ECONOMY.construction;

export const START_MONEY = ECONOMY.startMoney;
export const CLEAR_ROUGH_COST = C.clearRough;
export const TRACK_COST = C.trackPiece;
export const STATION_TILE_COST = C.stationTile;
export const WAYPOINT_COST = C.waypoint;
export const HOUSE_DEMOLISH_COST = C.demolishHouse;
export const ROAD_REMOVE_COST = C.removeRoad;
export const CATENARY_COST = C.catenaryTile;
export const TERRAFORM_COST = C.terraformCorner;
export const FOUNDATION_COST = C.foundation;
export const BRIDGE_TILE_COST = C.bridgeTile;
export const TUNNEL_TILE_COST = C.tunnelTile;
export const METRO_TRACK_COST = C.metroTrackPiece;
export const METRO_RAMP_COST = C.metroRamp;
export const METRO_STATION_EXTRA = C.metroStationExtra;
export const METRO_TUNNEL_TILE_COST = C.metroTunnelTile;
export const DEPOT_COST = C.depot;
export const SIGNAL_COST = C.signal;
export const TRAIN_RESALE_RATE = ECONOMY.refunds.trainResale;
export const TRACK_REFUND_RATE = ECONOMY.refunds.demolition;
export const CATENARY_REFUND = Math.round(C.catenaryTile * ECONOMY.refunds.demolition);

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
/** Najwięcej lokomotyw w składzie (podwójna trakcja). */
export const MAX_ENGINES = 2;

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
/** Postój na stacji (ticki): 2 dni gry. */
export const STATION_WAIT_TICKS = 2 * TICKS_PER_DAY;
/** Odstęp między pojazdami w składzie (jednostki toru). */
export const VEHICLE_GAP = 1;
/** Kary w wyszukiwaniu trasy (jednostki toru). */
export const REVERSE_PENALTY = 64;
/**
 * Jak w OpenTTD (YAPF, 1 kafelek = 16 jednostek): łuk 45° – 1 kafelek, łuk 90° – 6 kafelków
 * (szybkie trasy prowadzą prosto), podjazd – 2 kafelki za element pod górę (ciężkie składy
 * wybierają płaską trasę).
 */
export const BEND_PENALTY = 16;
/**
 * Łuk w trybie Amator (bez semaforów): mała kara. Pociągi mijają się tam tylko dzięki karze za zajęty
 * tor, a przy pełnej karze z OpenTTD wjeżdżały na siebie zamiast w mijankę.
 */
export const AUTO_BEND_PENALTY = 2;
export const BEND90_PENALTY = 6 * 16;
export const UPHILL_PENALTY = 2 * 16;
/**
 * Semafor ścieżkowy pod prąd (stoi tylko dla przeciwnego kierunku) – 15 kafelków, liczone do
 * `SIGNAL_LOOKAHEAD` semaforów od pociągu: na dwutorówce pociągi jadą swoim torem.
 */
export const SIGNAL_BACK_PENALTY = 15 * 16;
export const SIGNAL_LOOKAHEAD = 10;
/** Zajętość innych pociągów liczy się tylko przed tyloma semaforami od pociągu (OpenTTD: połowa `SIGNAL_LOOKAHEAD`). */
export const OCCUPIED_LOOKAHEAD = 5;
/** Kara za element toru zajęty przez inny pociąg – trasa omija zajęte perony i tory. */
export const OCCUPIED_PENALTY = 48;
/**
 * Peron zajęty przez inny pociąg (OpenTTD: 8 kafelków za kafelek) – pociąg wybiera wolny peron,
 * nawet jeśli dojazd ma więcej łuków.
 */
export const OCCUPIED_PLATFORM_PENALTY = 8 * 16;
/**
 * Jak w OpenTTD (YAPF, 1 kafelek = 16 jednostek): przejazd przez peron stacji, która nie jest celem –
 * za każdy kafelek peronu (pociągi wybierają obwodnicę zamiast jazdy przez zatłoczoną stację).
 */
export const STATION_PASS_PENALTY = 10 * 16;
/** Peron u celu krótszy od pociągu (część składu poza peronem) i dłuższy niż trzeba. */
export const PLATFORM_SHORTER_PENALTY = 40 * 16;
export const PLATFORM_LONGER_PENALTY = 8 * 16;
/**
 * Tor zajęty przez pociąg czekający na pełny ładunek (może stać bardzo długo): taki peron wybieramy
 * tylko, gdy nie ma innej drogi – inaczej pociągi ustawiają się za nim w kolejce i zatykają stację.
 */
export const FULL_LOAD_PENALTY = 4096;
/**
 * Zakleszczenie (pociągi czekają na siebie nawzajem): po tylu tickach czekania zawraca pociąg
 * o najniższym numerze w zakleszczeniu (3 dni gry).
 */
export const DEADLOCK_REVERSE_TICKS = 3 * TICKS_PER_DAY;
/** Czekający pociąg ponawia próbę rezerwacji co tyle ticków. */
export const RESERVE_RETRY_TICKS = 10;
