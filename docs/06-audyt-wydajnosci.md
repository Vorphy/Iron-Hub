# 06 – Audyt wydajności (2026-10-21)

Gra działa płynnie, więc żadna z poniższych rzeczy nie jest pilna. To lista miejsc, gdzie najtaniej da się odzyskać czas procesora, ułożona od największego zysku przy najmniejszej pracy. Najwięcej zyskują duże mapy (512 i 1024) i wysokie prędkości gry (4×, 8×).

## Jak mierzono

Jednorazowy pomiar w Node (vitest), świat z generatora (seed 3) z 40 stacjami po 4 perony, średnia z kilkudziesięciu wywołań. To liczby orientacyjne, w przeglądarce będą trochę inne.

| Operacja | Mapa 256 | Mapa 1024 |
|---|---|---|
| `catchment()` – zasięg jednej stacji | 0,21 ms | 1,43 ms |
| `stationAccepts()` – co przyjmuje stacja | 0,11 ms | 1,26 ms |
| `dailyCargo()` – dzienny ładunek, 40 stacji | 5,7 ms | **91,9 ms** |
| `infrastructureCost()` – koszt utrzymania | 0,27 ms | 2,85 ms |

Dla skali: przy 8× gra liczy 160 ticków/s, a dzień ma 40 ticków, czyli `dailyCargo` leci 4 razy na sekundę. Na mapie 1024 z 40 stacjami to ~370 ms procesora na sekundę gry, w porcjach po ~90 ms, czyli wyraźne przycięcia klatek.

## 0. Autozapis zamraża grę na dużych mapach ⭐ dopisane po audycie

`serializeState()` na mapie 1024 trwa **~560 ms** (do tego `JSON.stringify` ~20 ms i zapis ~34 MB do IndexedDB), cały czas w wątku gry. Autozapis na 1024 leci co 2 min (`AUTOSAVE_MS × szerokość / 256`, `src/main.ts`), więc co 2 minuty gra staje na ponad pół sekundy. Na 512 to ~150 ms co minutę. Zapis przy zamknięciu karty działa tak samo.

Prawie cały czas zabiera zamiana warstw mapy na base64 (`toBase64` w `src/sim/serialize.ts`: sklejanie napisu po 32 KB, potem `btoa`). Możliwe poprawki, od najprostszej:

1. Pamiętać base64 warstw, które się nie zmieniły (teren, wysokości, woda zmieniają się rzadko). Flaga „brudna” na warstwie, ustawiana tam, gdzie dziś leci `tileChanged`.
2. Szybsze kodowanie: `Uint8Array.prototype.toBase64()` tam, gdzie przeglądarka je ma, z obecną funkcją jako zapasem.
3. Mniej danych: większość warstw to zera, więc proste kodowanie RLE przed base64 zmniejszy zapis kilka–kilkadziesiąt razy (wymaga nowej wersji zapisu i migracji).
4. Serializacja w Web Workerze (kopia tablic przez `postMessage`) – gra nie staje wcale.

## 1. `catchment()` przegląda całą mapę ⭐ największy zysk, mała zmiana

`src/sim/station/station.ts` – `catchment(map, tiles)` przy każdym wywołaniu tworzy `Uint8Array` wielkości całej mapy (1 MB przy 1024²) i przegląda ją całą, choć zasięg stacji to kilkadziesiąt kafelków. Wywołują ją:

- `dailyCargo` → `catchmentIndex`: raz dziennie dla każdej stacji (główny składnik 92 ms wyżej);
- `stationCatchmentMask` (wzrost miast): raz w miesiącu dla każdej stacji;
- `catchmentCargo` / `stationAccepts`:
  - przy każdym postoju pociągu (rozładunek);
  - co pół dnia dla każdego pociągu czekającego na pełny ładunek;
  - przy budowie stacji (podgląd zasięgu pod kursorem);
  - **w każdej klatce**, gdy otwarte jest okno stacji, pociągu albo listy pociągów (patrz pkt 3).

**Poprawka:** liczyć tylko w prostokącie obejmującym perony ± promień (zbiór lub mała tablica zamiast tablicy całej mapy). Wynik się nie zmienia (ta sama lista, rosnąco), więc determinizm i zapisy są bezpieczne. Spodziewany zysk: ~50–500× na wywołanie, tym większy, im większa mapa.

## 2. `dailyCargo()` – indeks zasięgów i szukanie miasta przy każdym domu

`src/sim/economy/cargoFlow.ts`:

- `catchmentIndex(state)` buduje od zera mapę „kafelek → stacje” **codziennie**, a stacje zmieniają się rzadko. Można trzymać ją w pamięci i przebudowywać tylko po zdarzeniu `stationsChanged` (stan pochodny, jak graf torów w `Simulation`), albo przynajmniej skorzystać z poprawki z pkt 1.
- Pętla po domach przegląda całą warstwę `map.house` (1 mln kafelków przy 1024²) i dla każdego domu robi `state.towns.find(...)` (512 miast na mapie 1024). Wystarczy raz zbudować `Map<id, Town>` przed pętlą. Można też iść po miastach i ich kafelkach (`townTiles`), zamiast po całej mapie.

Spodziewany zysk: z ~92 ms do pojedynczych milisekund na mapie 1024.

## 3. Okna liczone w każdej klatce

`src/game.ts` → `updateWindow()` woła `buildWindowData()` i `JSON.stringify()` w **każdej klatce** (60/s), żeby sprawdzić, czy coś się zmieniło. Najdroższe okna:

- **Okno stacji:** `accepts: CARGOS.filter((c) => stationAccepts(state, st).has(c))` liczy zasięg **osobno dla każdego rodzaju ładunku**, czyli 6× na klatkę. Na mapie 1024 to ~7,5 ms z budżetu 16 ms klatki. Poprawka: jedno wywołanie przed `filter`.
- **Lista pociągów:** dla każdego wiersza `lineSize` filtruje wszystkie pociągi (O(n²)). `trainStatus` przy pociągach czekających na pełny ładunek woła `waitsForFullLoad` → `catchmentCargo` (pkt 1).
- **Finanse:** `infrastructureCost()` przegląda całą mapę (2,9 ms przy 1024²) i `catenaryTiles()` też, w każdej klatce.

**Poprawka:** odświeżać dane okna 4–5 razy na sekundę zamiast 60 (tak jak minimapę i samouczek) i od razu po komendzie gracza. W oknie stacji – jedno `stationAccepts`. Zysk: kilka ms na klatkę przy otwartym oknie, mniej śmieci dla GC.

## 4. Wyszukiwanie trasy liczone od nowa (do zmierzenia)

`src/sim/trains/movement.ts` → `extendReservation` woła `planRoute` (Dijkstra, do 50 000 rozwinięć) za każdym razem, gdy rezerwacja przed jadącym pociągiem robi się krótsza niż droga hamowania. Dzieje się to co kilka ticków na pociąg, a trasa liczy się aż do celu, mimo że w poprzednim wywołaniu wyszło to samo. Czekające pociągi mają już ograniczenie (`RESERVE_RETRY_TICKS`), jadące nie.

Możliwe usprawnienia, od najprostszego:

1. W `planRoute` alokuje się nowy obiekt na każdy węzeł (`{ ...n, seq }`) i liczy `fullLoadingTrains(state)` przy każdym wywołaniu. Można policzyć to raz na tick w `TickContext` i nie kopiować węzła.
2. Pamiętać plan pociągu (resztę odcinków) i dokładać rezerwację z niego, a liczyć od nowa dopiero, gdy: zmieniły się tory, plan się skończył, odcinek jest zajęty albo zmienił się cel. `Planner.invalidate()` jest już podpięty pod zmiany torów, więc jest miejsce na taki pamiętnik.

To najpewniej największy koszt ticku przy wielu pociągach na rozbudowanej sieci, ale wymaga pomiaru na prawdziwej grze (profil w DevTools przy 8× z ~50 pociągami), zanim się w to wejdzie. Punkt 2 trzeba zrobić ostrożnie, bo wynik musi zostać deterministyczny (test determinizmu po wczytaniu).

## 5. Drobniejsze

- **Rysowanie pociągów** (`src/render/trains.ts`): wszystkie pociągi są przeliczane i rysowane w każdej klatce, także poza ekranem, a `vehiclePoses` liczy się dwa razy (`capture` co tick i `draw` co klatkę). Odrzucenie pociągów poza `camera.viewRect()` przed `vehiclePoses` daje zysk na dużych mapach z wieloma pociągami.
- **Semafory i rezerwacje** (`src/render/signals.ts`): `g.clear()` i rysowanie od nowa w każdej klatce. W trybie Amator bez podglądu (V) od razu wychodzi z funkcji – OK. W trybie Ekspert zbiór `passing` buduje klucze-napisy dla wszystkich odcinków wszystkich pociągów; klucz liczbowy byłby tańszy.
- **Rysowanie kafelków** (`src/render/mapRenderer.ts`): przy przerysowaniu kawałka mapy każdy kafelek stacji, zajezdni i mostu robi `find()` po całej tablicy. Mapa `id → obiekt` zbudowana raz na kawałek wystarczy. Ma znaczenie tylko przy przewijaniu dużej mapy.
- **`passesOrder`** (`src/sim/trains/train.ts`): `state.stations.some(...)` przy każdym wjeździe czoła na nowy odcinek. Koszt pomijalny przy kilkudziesięciu stacjach. Wróć do niego, jeśli stacji będą setki.
- **Zajezdnia w `successors`** (`src/sim/trains/steps.ts:126`, z audytu 2026-10-30): `state.depots.find(...)` przy każdym rozwinięciu kafelka zajezdni w wyszukiwaniu trasy. Tanie przy kilku zajezdniach; jeśli będzie ich kilkadziesiąt – `Map<id, Depot>` w `TickContext` (to samo w `train.ts`, `consist.ts`, `catenary.ts`).
- **`townPopulation`** (z audytu 2026-10-30): za każdym razem przegląda kwadrat 33×33 wokół rynku. Woła ją okno miasta (co klatkę, pkt 3) i ruch uliczny (`src/render/traffic.ts`) dla miast na ekranie. Jeśli wyjdzie w profilu – liczba mieszkańców trzymana w mieście i aktualizowana przy zmianie domu. Przy dzielnicach (punkt 17 roadmapy) i tak to się zmieni.
- **`infrastructureCost`** raz w miesiącu – w symulacji OK, problemem jest tylko okno finansów (pkt 3).

## Czego audyt nie objął

Audyt to przegląd kodu i pomiary w Node, nie profil gry w przeglądarce. Nie mierzono: ruchu ulicznego (`traffic.ts`), minimapy, podpisów na mapie, renderu dalekiego zoomu, odświeżania interfejsu Preact, pamięci (wycieki, GC) ani generowania mapy (~2 s na 1024, jednorazowo). Pewność „reszta jest optymalna” da dopiero profil z DevTools (zakładka Performance) na dużej mapie przy 8× z kilkudziesięcioma pociągami.

## Proponowana kolejność

1. Autozapis bez zamrożeń (pkt 0) – odczuwalne dla gracza na mapach 512 i 1024.
2. `catchment()` w prostokącie (pkt 1) i jedno `stationAccepts` w oknie stacji – kilkanaście linii, największy efekt.
3. `Map` miast w `dailyCargo` i indeks zasięgów odświeżany po zmianie stacji (pkt 2).
4. Okna odświeżane 4–5×/s (pkt 3).
5. Profil prawdziwej gry przy 8×, potem decyzja o pamiętaniu tras (pkt 4).
6. Odrzucanie pociągów poza ekranem (pkt 5).

Po każdym kroku: `npm test` (w tym testy determinizmu) i ponowny pomiar jak w tabeli wyżej.
