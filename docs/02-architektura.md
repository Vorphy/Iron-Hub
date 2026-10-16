# 02 – Architektura

## Stos technologiczny

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Język | **TypeScript** (strict) | Bezpieczeństwo typów przy złożonej logice grafu torów i ekonomii |
| Build / dev | **Vite** | Szybki dev server, prosty build statyczny (hosting np. itch.io) |
| Rendering | **PixiJS v8** | Szybki renderer 2D/WebGL; pętlę gry i projekcję izometryczną mamy własną, więc pełny silnik (Phaser) nie jest potrzebny |
| UI | **Preact** + CSS (Tailwind opcjonalnie) | Okna, listy pociągów, rozkłady, budżet – HTML nad canvasem, z zarządzaniem stanem |
| Testy | **Vitest** | Testy jednostkowe symulacji bez przeglądarki |
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

### Definicje danymi
Pojazdy, typy przemysłu, ładunki i ich parametry są w `data/*.json` (wersjonowane, z ID). Dodatki płatne = dodatkowe pakiety definicji + grafik, ładowane tym samym mechanizmem.

## Rendering izometryczny

- Rzut 2:1 (kafelek np. 64×32 px), jak w TTD.
- Warstwy: teren → tory → obiekty i pojazdy (sortowane po głębokości `x + y`, potem po wysokości) → nakładki (zasięg stacji, podgląd budowy) → UI.
- **Picking** (który kafelek pod kursorem): odwrotna projekcja ekran → logiczne (x, y); przy wprowadzeniu wysokości – korekta po wysokości kafelka.
- Culling: rysujemy tylko kafelki w widoku kamery; statyczny teren w buforowanych chunkach.
- Kierunki pojazdów: 8 sprite'ów (co 45°), wybierane wg kierunku krawędzi.

## Zapis gry

- Format: JSON `{ format: 'iron-hub-save', savedAt, state }`, gdzie `state` to wynik `serializeState()` z polem `version` (obecnie 1). Tablice kafelków zakodowane w base64 (mapa 128×128 ≈ 130 KB).
- Zapisujemy wyłącznie `GameState`. Stan pochodny (graf torów) i prezentacja (kamera, narzędzie) nie trafiają do zapisu.
- Przy niezgodnej zmianie formatu podbijamy `SAVE_VERSION` i dopisujemy migrację starszych wersji w `deserializeState()`.
- Sloty w IndexedDB: `auto` (co 30 s, gdy gra nie stoi, i przy ukryciu karty) oraz `quick` (przycisk Zapisz). Start strony bez `?seed=` wczytuje autozapis.
- IndexedDB jest osobne dla każdej domeny i przeglądarki – przeniesienie gry tylko przez eksport/import pliku.
