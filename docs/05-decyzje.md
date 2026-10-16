# 05 – Decyzje projektowe i otwarte pytania

## Rejestr decyzji (ADR)

| # | Data | Decyzja | Uzasadnienie |
|---|---|---|---|
| 1 | 2026-10-16 | Język: **TypeScript** | Typowana logika symulacji, natywnie w przeglądarce |
| 2 | 2026-10-16 | **Symulacja oddzielona od renderingu**, deterministyczna, sterowana komendami | Zapis/odczyt, testy, przyspieszanie czasu, Web Worker, furtka do multiplayera |
| 3 | 2026-10-16 | Renderer: **PixiJS v8** zamiast Phaser 3 | Pętla i projekcja są własne; potrzebny tylko szybki renderer |
| 4 | 2026-10-16 | UI: **Preact** nad canvasem | Okna i listy z zarządzaniem stanem; sam Tailwind tego nie daje |
| 5 | 2026-10-16 | **Tory jako graf** wyprowadzany z bitmask kafelków | Ruch, A* i rezerwacje na grafie; budowa na kafelkach |
| 6 | 2026-10-16 | **Jeden silnik rezerwacji ścieżek**; Amator = auto-sygnały, Ekspert = ręczne | Jeden system zamiast dwóch |
| 7 | 2026-10-16 | **Ruch lokalny AI tylko kosmetyczny** | Wydajność i prostota; pasażerowie liczeni abstrakcyjnie |
| 8 | 2026-10-16 | Fabryki: zaopatrzenie ≥75% → wzrost, ≤50% → spadek, pomiędzy stabilnie; zmiany bardzo powolne | Nagradza obsługę, bez twardej blokady i bez „mrugania” poziomem |
| 9 | 2026-10-16 | **Izometria w stylu klasycznego TTD** od początku | Kluczowa dla charakteru gry; logika i tak niezależna od rzutu |
| 10 | 2026-10-16 | MVP na **płaskim terenie** | Zbocza znacząco komplikują tory i picking – później |
| 11 | 2026-10-16 | Gra **bezpłatna**, ewentualne płatne dodatki; treści **definiowane danymi** | Dodatek = pakiet danych + grafik |
| 12 | 2026-10-16 | Zapis lokalny (IndexedDB) od etapu 1; backend na końcu | Backend nie jest potrzebny do sprawdzenia gry |
| 13 | 2026-10-16 | **OpenGFX tylko jako placeholder** w prototypie; przed wydaniem zamiana na darmową grafikę z licencją pozwalającą na zamknięty kod (np. CC0) lub własną | Zachowuje możliwość płatnych dodatków |
| 14 | 2026-10-16 | Graf torów **pochodny i niezapisywany**; pozycja pociągu w układzie kafelków (nie krawędź+offset) | Przebudowa grafu nie psuje pozycji pociągów; prostszy zapis gry |

## Otwarte pytania

### ✅ Licencja grafiki – rozstrzygnięte (ADR 13), poniżej kontekst
OpenGFX jest na licencji **GPLv2**. Użycie jej w grze najpewniej oznacza, że całość (łącznie z kodem) musi być dystrybuowana na licencji zgodnej z GPL, czyli z otwartym kodem źródłowym. GPL nie zabrania sprzedaży, ale każdy może legalnie skopiować i rozpowszechniać także „płatne” treści, co podważa model płatnych dodatków.

Opcje:
1. **OpenGFX tylko jako placeholder** w prototypie (etapy 0–5), przed wydaniem zamiana na własną grafikę lub grafikę z licencją CC0/komercyjną. *(rekomendowane)*
2. Projekt open source na GPL – świadoma rezygnacja z zamkniętych płatnych dodatków (ew. model „wsparcia” / darowizn).

Do decyzji przed etapem 7. Do tego czasu nie mieszać grafiki OpenGFX z docelowymi zasobami w repozytorium (osobny katalog z plikiem licencji).

### Pozostałe
- Czy tryb sygnalizacji można zmienić w trakcie gry (Amator → Ekspert)? Przejście w jedną stronę jest proste (auto-sygnały stają się ręcznymi).
- Czy fabryka może zostać zamknięta po spadku poniżej poziomu 1?
- Wskaźnik zaopatrzenia fabryki przetwórczej: minimum z wejść czy średnia ważona?
- Czy pasażerowie dowiezieni do fabryki (siła robocza) są osobnym wejściem obowiązkowym, czy bonusem?
- Rozmiar mapy w MVP (propozycja: 128×128) i docelowy.
- Czym płatne dodatki mają się różnić od darmowych pojazdów – kosmetyka czy parametry? (ryzyko pay-to-win w grze z rankingami).
