# 02 – Architektura

## Stos technologiczny

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Język | **TypeScript** (strict) | Bezpieczeństwo typów przy złożonej logice grafu torów i ekonomii |
| Build / dev | **Vite** | Szybki dev server, prosty build statyczny (hosting np. itch.io) |
| Rendering | **PixiJS v8** | Szybki renderer 2D/WebGL; pętlę gry i projekcję izometryczną mamy własną, więc pełny silnik (Phaser) nie jest potrzebny |
| UI | **Preact** + CSS (Tailwind opcjonalnie) | Okna, listy pociągów, rozkłady, budżet – HTML nad canvasem, z zarządzaniem stanem |
| Testy | **Vitest** | Testy jednostkowe symulacji bez przeglądarki |
| Lint / format | **Biome** | Jedno szybkie narzędzie (bez zależności od API TypeScriptu – działa z TS 7); `npm run lint` / `npm run format`, sprawdzane w CI przed testami. Wyłączone reguły sprzeczne z projektem: `!` (przy `noUncheckedIndexedAccess`), `return f()` w funkcjach `void`, `??=` w wyrażeniu |
| Zapis lokalny | **IndexedDB** + eksport/import pliku | Zapis gry u gracza od pierwszego etapu (`src/persistence/`, format w `sim/serialize.ts`) |
| Backend (później) | do ustalenia (np. Node.js + PostgreSQL) | Zapis w chmurze, rankingi, zakupy dodatków |

## Zasada naczelna: symulacja oddzielona od prezentacji

```
┌─────────────────────────────┐   snapshot stanu    ┌──────────────────────────────┐
│  sim/  (czysty TypeScript)  │ ──────────────────► │  render/  (PixiJS)           │
│  • stały tick               │                     │  • projekcja izometryczna    │
│  • deterministyczna         │                     │  • interpolacja ruchu        │
│  • zero importów z DOM/Pixi │                     │  • tylko CZYTA stan          │
│  • (docelowo Web Worker)    │ ◄────────────────── │  ui/  (Preact)               │
└─────────────────────────────┘      komendy        └──────────────────────────────┘
```

- **`sim/` nie wie, że istnieje ekran.** Żadnych importów z PixiJS, Preacta ani DOM. Można ją uruchomić w Node, w testach albo w Web Workerze.
- **Stan zmieniają wyłącznie komendy** (`BuildTrack`, `RemoveTrack`, `BuildStation`, `BuyVehicle`, `SetOrders`, `PlaceSignal`…). UI i input wysyłają komendy, symulacja je waliduje i wykonuje na początku ticku.
- **Renderer jest „głupi”** – rysuje snapshot stanu i interpoluje pozycje pociągów między tickami, żeby ruch był płynny przy 60 FPS niezależnie od częstotliwości symulacji.

Korzyści:
- zapis/odczyt gry = serializacja stanu symulacji,
- testy logiki bez przeglądarki,
- przyspieszanie czasu (pauza / x1 / x2 / x4 / x8) = więcej ticków na klatkę,
- przeniesienie symulacji do Web Workera (lub WASM) bez przepisywania gry,
- otwarta furtka do multiplayera (lockstep na komendach).

### Determinizm
- Jedno źródło losowości: **seedowany PRNG** w stanie symulacji. Zakaz `Math.random()` i `Date.now()` w `sim/`.
- Kolejność iteracji po kolekcjach musi być stabilna (tablice / mapy z deterministycznym porządkiem, sortowanie po ID).

## Pętla symulacji

| Zegar | Częstotliwość (startowo, do strojenia) | Co się dzieje |
|---|---|---|
| **Tick ruchu** | 20 / s przy prędkości x1 | Komendy, ruch pociągów, rezerwacje ścieżek, załadunek |
| **Dzień gry** | co 40 ticków (~2 s przy x1) | Generowanie pasażerów i ładunku, wypłaty za dostawy |
| **Miesiąc gry** | co 30 dni | Ocena fabryk i miast (wzrost/spadek), koszty utrzymania, statystyki |

Renderer działa na `requestAnimationFrame` i w każdej klatce wykonuje tyle ticków, ile wynika z upływu czasu i wybranej prędkości (akumulator czasu, fixed timestep).

## Struktura katalogów (plan)

```
src/
  sim/                 # czysta logika gry – bez DOM/Pixi
    world/             # mapa kafelków, teren, obiekty
    track/             # tory na kafelkach + graf torów
    trains/            # pojazdy, ruch, rozkłady
    signals/           # sygnały, rezerwacje, auto-sygnalizacja (Amator)
    economy/           # miasta, fabryki, stacje, ładunki, finanse
    commands/          # definicje i obsługa komend
    defs/              # ładowanie definicji pojazdów / przemysłu (dane)
    rng.ts, state.ts, tick.ts, serialize.ts
  render/              # PixiJS: projekcja izo, warstwy, sprite'y, kamera, picking
  ui/                  # Preact: okna, paski narzędzi, panele
  input/               # mysz/klawiatura -> narzędzia -> komendy
  persistence/         # IndexedDB, eksport/import zapisu
  main.ts
data/                  # definicje JSON: pojazdy, typy przemysłu, ładunki
assets/                # grafiki, dźwięki
tests/                 # testy symulacji (Vitest)
```

## Model danych (zarys)

### Mapa
Mapa to siatka kafelków `W × H` we **współrzędnych logicznych** (x, y). Izometria istnieje wyłącznie w `render/` – symulacja nie zna rzutu.

```ts
interface Tile {
  terrain: TerrainType;      // trawa, woda, skała...
  height: number;            // MVP: zawsze 0; docelowo wysokości narożników pod zbocza
  track: TrackBits;          // bitmaska elementów toru na kafelku
  objectId?: EntityId;       // budynek, stacja, fabryka
}
```

### Tory: kafelki jako źródło prawdy, graf jako widok pochodny
- **Na kafelku** tor zapisany jest jak w TTD – bitmaska 6 elementów: `X`, `Y` (proste) oraz `N`, `S`, `E`, `W` (łuki w ćwiartkach). Budowanie i rozbiórka operują na bitach kafelka.
- **Graf torów** (`sim/track/graph.ts`) jest **stanem pochodnym**: budowany z kafelków leniwie po każdej zmianie torów, nigdy nie zapisywany.
  - **port** – granica dwóch kafelków (środek boku); każdy element toru łączy dwa porty. Port ma dwie połówki (po jednej na kafelek) – pociąg przechodzi zawsze z jednej połówki do drugiej, więc nie zawraca pod ostrym kątem,
  - **węzeł** – port, który nie jest zwykłym przejściem 1→1: koniec toru albo zwrotnica (później także sygnał, krawędź peronu),
  - **krawędź** – ciąg elementów między węzłami, z długością w całkowitych jednostkach (prosty 16, łuk 11).
  - Pełna przebudowa kosztuje O(liczba kafelków z torem) – wystarcza; przyrostowa aktualizacja w razie potrzeby później.
- Wyszukiwanie tras (A*) i rezerwacje działają na grafie. Podgląd grafu w grze: klawisz **G**.

### Pociąg
```ts
interface Train {
  id: EntityId;
  consist: VehicleRef[];     // lokomotywa(y) + wagony (z definicji danych)
  head: { x: number; y: number; track: Track; dir: Side; progress: number };  // pozycja czoła w układzie kafelków
  speed: number;
  orders: Order[];           // lista stacji (+ opcje ładuj/rozładuj)
  currentOrder: number;
  path: EdgeId[];            // zaplanowana trasa do celu
  reservation: ReservationId[];
  cargo: CargoLoad[];
}
```
Pozycja jest zapisana w układzie kafelków (jak w TTD), a nie jako krawędź grafu – dzięki temu przebudowa grafu po zmianie torów nie unieważnia pozycji pociągów. Graf służy do wyboru drogi na zwrotnicach. Wagony podążają za czołem w zadanych odstępach wzdłuż historii przebytej ścieżki.

### Definicje danymi i konfiguracja ekonomii
- **`src/data/economy.ts`** – jedno miejsce na całą ekonomię: pieniądze na start, ceny budowy, zwroty, utrzymanie infrastruktury, utrzymanie pociągów jako % ceny według trakcji (parowa / spalinowa / elektryczna), stawki ładunków, oceny stacji, wzrost miast, progi rozwoju fabryk. Plik TypeScript (a nie JSON), żeby mieć komentarze przy wartościach i sprawdzanie typów. `sim/config.ts` i moduły `sim/economy/` tylko czytają z niego wartości.
- **`src/data/vehicles.json`, `src/data/industries.json`** – definicje konkretnych obiektów (cena, moc, trakcja pojazdu; rozmiar i produkcja zakładu), z ID. Dodatki płatne = dodatkowe pakiety definicji + grafik, ładowane tym samym mechanizmem.

## Rendering izometryczny

- Rzut 2:1 (kafelek 64×32 px), jak w TTD; poziom wysokości = 8 px. `tileToWorld` podnosi każdy punkt o wysokość terenu (interpolacja w kafelku), więc tory, budynki i pociągi same „siadają” na zboczach. Kafelek terenu to dwa trójkąty z cieniowaniem; kawałki mapy rysowane od tyłu do przodu.
- Warstwy: teren → tory → obiekty i pojazdy (sortowane po głębokości `x + y`, potem po wysokości) → nakładki (zasięg stacji, podgląd budowy) → UI.
- **Picking** (który kafelek pod kursorem): odwrotny rzut płaski sprawdzany od najwyższego poziomu w dół – pierwszy punkt leżący na terenie jest widoczny (`pickTile`).
- Kawałki mapy 16×16 kafelków rysowane **leniwie** – dopiero gdy pojawią się na ekranie (do 6 nowych na klatkę, najbliższe środka najpierw); najdawniej niewidziane są zwalniane, gdy narysowanych jest ponad 500. Zakłady i podpisy poza ekranem są ukrywane. Dzięki temu działa mapa 1024×1024 (milion kafelków).
- **Daleki widok** (zoom 0,25× i 0,125×): każdy kawałek mapy jest raz renderowany do małego obrazka w rozdzielczości równej zoomowi, a jego geometria od razu zwalniana. Karta rysuje wtedy kilkaset obrazków zamiast setek tysięcy wielokątów. Zmieniony kafelek odświeża obrazek swojego kawałka. Przy 0,125× widać tylko nazwy miast.
- Uwaga (Pixi 8): `destroy({ children: true })` nie zwalnia geometrii obiektów `Graphics` – trzeba dodać `context: true`.
- Statystyki miast liczone tylko w okolicy rynku (domy powstają najwyżej 16 kafelków od niego), nie po całej mapie.
- Kierunki pojazdów: 8 sprite'ów (co 45°), wybierane wg kierunku krawędzi.

## Pomoc i historia zmian

- **Pomoc** (wiki w grze, klawisz H, „?” na górnym pasku i w oknach): treść w `src/data/help.ts`. Liczby (ceny, stawki, progi, lokomotywy, zakłady) są wstawiane z plików danych – po strojeniu ekonomii opis aktualizuje się sam.
- **Co nowego** (Menu): `src/data/changelog.ts`, pisane dla gracza. **Przy każdej funkcji widocznej dla gracza dopisujemy wpis na górze.** Kropka przy Menu znika po obejrzeniu (klucz najnowszego wpisu w pamięci przeglądarki).

## Zapis gry

- Format: JSON `{ format: 'iron-hub-save', savedAt, state }`, gdzie `state` to wynik `serializeState()` z polem `version` (obecnie 1). Tablice kafelków zakodowane w base64 (mapa 128×128 ≈ 130 KB).
- Zapisujemy wyłącznie `GameState`. Stan pochodny (graf torów) i prezentacja (kamera, narzędzie) nie trafiają do zapisu.
- Przy niezgodnej zmianie formatu podbijamy `SAVE_VERSION` i dopisujemy migrację starszych wersji w `deserializeState()`.
- Sloty w IndexedDB: `auto` (co 30 s, gdy gra nie stoi, i przy ukryciu karty) oraz `quick` (przycisk Zapisz). Start strony bez `?seed=` wczytuje autozapis.
- IndexedDB jest osobne dla każdej domeny i przeglądarki – przeniesienie gry tylko przez eksport/import pliku.
