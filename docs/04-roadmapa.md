# 04 – Roadmapa

Etapy są ułożone tak, żeby po każdym istniała działająca, testowalna wersja. Czas trwania celowo nie jest podany sztywno – projekt rozwijany po godzinach; realnie liczyć 2–3× więcej niż w pierwotnych szacunkach.

## Etap 0 – Fundament ✅ (2026-10-16)
- Vite + TypeScript (strict) + PixiJS + Preact + Vitest; lint/format – Biome (dodany 2026-10-21).
- Szkielet `sim/` (stan, tick, komendy, seedowany RNG) oddzielony od `render/`.
- Pętla z fixed timestep i akumulatorem; pauza / przyspieszanie.

**Gotowe, gdy:** pusta mapa izometryczna, kamera (przesuwanie, zoom), picking kafelka pod kursorem, test symulacji przechodzi w Node.

*Zrealizowano:* mapa 128×128 generowana z ziarna (trawa, woda, nieużytki), rysowanie w kawałkach 16×16 z cullingiem, kamera (przeciąganie, WASD/strzałki, zoom 0.25–4× wokół kursora), podświetlenie kafelka, HUD (data, pieniądze, prędkości 0/1/2/4/8×, FPS), pierwsza komenda `clearTile` (oczyszczenie nieużytku) jako test ścieżki wejście → komenda → symulacja → render, 16 testów, automatyczna publikacja na GitHub Pages.

## Etap 1 – Mapa i tory ✅ (2026-10-16)
- Generowanie płaskiej mapy (teren, woda).
- Narzędzie budowy torów (bitmaski kafelków), rozbiórka, koszt.
- Przyrostowa budowa grafu torów z kafelków.
- Stacje z zasięgiem (wizualizacja zasięgu).
- **Zapis / odczyt gry** (IndexedDB + eksport pliku).

**Gotowe, gdy:** można zbudować sieć ze stacjami, zapisać, wczytać i graf zgadza się z kafelkami (testy).

*Zrealizowano:* budowa torów przeciąganiem (proste i ukosy, podgląd z kosztem), buldożer, graf torów z podglądem (G), stacje z zasięgiem i nazwami, zapis: autozapis co 30 s i przy zamknięciu karty, slot ręczny, eksport/import pliku JSON. 50 testów, w tym determinizm gry po wczytaniu.

## Etap 2 – Pociągi ✅ (2026-10-16)
- Zajezdnia, zakup lokomotywy i wagonów z definicji danych.
- Ruch po grafie (czoło + wagony), przyspieszanie/hamowanie.
- A* po grafie, rozkład = lista stacji.

**Gotowe, gdy:** pociąg kursuje między 2+ stacjami po dowolnej sieci, wagony płynnie wchodzą w łuki.

*Zrealizowano:* zajezdnie, 3 lokomotywy i 6 wagonów z pliku danych, okno zajezdni (zakup/sprzedaż), ruch z fizyką i hamowaniem przed celem, zawracanie, okno pociągu z rozkładem, płynna interpolacja ruchu. Zapis v3 z migracją. 75 testów, w tym determinizm gry wczytanej w trakcie jazdy.

## Etap 3 – Rezerwacje i tryb Amator ✅ (2026-10-16)
- Silnik rezerwacji ścieżek.
- Auto-sygnalizacja (tryb Amator).
- Wykrywanie i sygnalizowanie zakleszczeń.

**Gotowe, gdy:** wiele pociągów na wspólnej sieci z rozjazdami jeździ bez kolizji; testy scenariuszy (mijanki, stacje przelotowe, węzły).

*Zrealizowano:* rezerwacja torów porcjami, tryb Amator jako ruchomy odstęp blokowy (bez stawiania semaforów), omijanie zajętych peronów, kolejka wyjazdu z zajezdni, podgląd rezerwacji (V). Zakleszczenia na jednym torze są sygnalizowane statusem „Czeka na wolny tor”; od 2026-10-19 rozwiązywane automatycznie (zawraca pociąg o najniższym numerze) + przycisk Zawróć.

## Etap 4 – Ekonomia ✅ (2026-10-18)
- Miasta (populacja, budynki, generowanie pasażerów, wzrost wzdłuż korytarzy).
- Fabryki (typy, poziomy, wskaźnik zaopatrzenia, progi 75% / 50%).
- Załadunek / rozładunek, płatności, koszty, kredyt.
- Ruch lokalny AI jako dekoracja.

**Gotowe, gdy:** da się zarabiać, fabryki i miasta zmieniają się w czasie zgodnie z regułami.

*Zrealizowano:* generator świata (8 miast, 12 zakładów w 3 łańcuchach), domy i zakłady w izometrii, okna miasta, zakładu, stacji i finansów, zbieranie ładunku z oceną stacji, załadunek/rozładunek z zapłatą, miesięczny rozwój fabryk (progi 75%/50%, ±12 pkt) i miast (w stronę stacji), koszty eksploatacji i utrzymania. Zapis v5. 107 testów.
*Przeniesione:* ruch lokalny AI (dekoracja) – wymaga dróg w miastach; kredyt i bankructwo.
*Dodano później (2026-10-19):* drogi w miastach i ruch lokalny (auta, autobusy) jako dekoracja; testowa mapa 1024×1024.

## Etap 5 – Test „czy to jest fajne”
- Grywalny wycinek na placeholderowej grafice, rozegrany przez kilka osób.
- Strojenie parametrów ekonomii i tempa rozwoju.

**Gotowe, gdy:** sesja 30–60 min jest wciągająca bez instrukcji z zewnątrz. Dopiero potem inwestujemy w grafikę.

## Etap 6 – Tryb Ekspert ✅ (2026-10-16, zrobiony razem z etapem 3)
- Ręczne sygnały: blokowe, ścieżkowe, jednokierunkowe.
- Narzędzia diagnostyki (podgląd rezerwacji, stan sygnałów).

## Etap 7 – Oprawa i wydanie
- Docelowa grafika izometryczna (patrz decyzja o licencji w [05-decyzje](05-decyzje.md)).
- Retro UI, dźwięki (koła, gwizdek), muzyka.
- Wydanie na itch.io.

## Etap 8 – Później
- ~~Wysokości terenu, zbocza, mosty, tunele.~~ ✅ (zrobione wcześniej – 2026-10-18)
- Backend: zapis w chmurze, rankingi.
- Płatne dodatki (pakiety pojazdów) – wymaga backendu i systemu płatności.
- Symulacja w Web Workerze, ewentualnie multiplayer.

## Kolejka – co dalej (stan na 2026-10-19)

Kolejność proponowana; zmieniamy według potrzeb. Punkty 1–4 przygotowują etap 5 (test z ludźmi).

1. ~~**Kredyt i bankructwo**~~ ✅ (2026-10-21) – kredyt do 300 tys. zł, 5% rocznie, ostrzeżenia, bankructwo po 3 miesiącach na minusie.
2. ~~**Minimapa**~~ ✅ (2026-10-21) – lewy górny róg, klik/przeciąganie przenosi kamerę, widać pociągi i obszar ekranu; można zwinąć.
3. ~~**Pierwsze kroki dla nowego gracza**~~ ✅ (2026-10-21) – panel z 7 celami (tor → stacje → zajezdnia → pociąg → rozkład → wyjazd → zarobek) zaliczanymi automatycznie, podpowiedź do bieżącego, przycisk Nowa gra; ukrywany, powrót przez Menu.
4. ~~**Poziomy pociągów i trakcje**~~ ✅ (2026-10-21) – 13 lokomotyw 1900–2005 (parowe → spalinowe → elektryczne do 250 km/h, bez maglevów), wycofywanie starych modeli, wybór roku startu, sieć trakcyjna dla elektrycznych.
5. **Etap 5 – test „czy to jest fajne”** – granie, strojenie `src/data/economy.ts`.
6. ~~Drobne~~ ✅ (2026-10-21): ciężarówki w miastach przy zakładach, pojazdy chowają się za domami, lint/format (Biome, sprawdzany przy każdym pushu).
7. **Etap 7** – grafika, dźwięki, retro UI, wydanie na itch.io.
8. **Etap 8** – generator/edytor map, chmura, Web Worker, płatne dodatki.

## Pomysły (lista otwarta – dopisuj na dole)

- Poziomy pociągów, rodzaje kolei (np. parowa → spalinowa → elektryczna) i przechodzenie między nimi; prosty system ulepszeń. ✅ *(lokomotywy z biegiem lat i sieć trakcyjna – 2026-10-21; wymiana lokomotywy z odbiorem starej zależnym od wieku – 2026-10-21)*
- Mapa nierówna: góry, kaniony; generator map i edytor. ✅ *(wysokości terenu, kształtowanie terenu, mosty, tunele – 2026-10-18; generator i edytor map – później)*
- ~~Budowa mostów i tuneli.~~ ✅
- ~~przycisk testowy + 100000 zł~~ ✅ (Menu → Testy)
- ~~przy torach tak jak przy semaforach budowanie i usuwanie torów, żeby nie trzeba niszczyć całości tylko wybrany w danym kierunku.~~ ✅ (Tory → Usuń, buldożer)
- ~~mapa niech pamięta ostatnie ustawienie, zoom i pozycje kamery~~ ✅ (zapisywane razem z grą)
- ~~rozmiar mapy zobaczymy jak duża żeby zasobów komputera wystarczyło :)~~ ✅ (wybór przy nowej grze: 64 / 128 / 256 / 512, 1024 testowa; zoom do 0,125×)
- ~~zawracanie pociągu jak się zakleszczą!!! WAŻNE!!!~~ ✅ (automatycznie po 3 dniach zakleszczenia + przycisk Zawróć)
- ~~historia zmian na stronie w menu~~ ✅ (Menu → Co nowego; `src/data/changelog.ts`, kropka przy Menu przy nowościach – 2026-10-21)
- ~~samouczek + mini wiki jak co działą jak rosnie miasto fabryka.~~ ✅ (Pomoc – H / „?”: 16 tematów, liczby z plików danych, linki „?” w oknach; `src/data/help.ts` – 2026-10-21)
- **Super stacja** (pomysł 2026-10-21): ulepszenie istniejącej stacji za ~100× ceny peronu – druga kondygnacja peronów pod spodem (4 tory zamiast 2 na tym samym obszarze), zjazdy na dolny poziom jak portale tuneli, dolne tory jako osobna warstwa (bez kolizji z górnymi). Żeby nie było zatorów: osobne tory zjazdów w głowicy (wymóg 2-torowego wjazdu), wybór peronu przez obecny planer. Warunek: stacja w mieście (np. ≥ 2000 mieszkańców w zasięgu). Prostsza alternatywa: „dworzec główny” – 2× szybszy załadunek, wyższa ocena, większy zasięg. Po etapie 5.
- 
