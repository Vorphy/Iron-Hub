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
  - *Placeholder OpenGFX ✅ (2026-10-25):* cała mapa z grafiki OpenGFX (GPL v2, zgodnie z ADR 13 tylko do testów) – teren ze zboczami i brzegami, drzewa, tory i rozjazdy, perony z dachami, zajezdnie, semafory, sieć trakcyjna, mosty kratownicowe, tunele, domy (wg poziomu i roku), zakłady, pociągi, autobusy i ciężarówki. Atlas buduje `tools/opengfx/build_atlas.py`; sprite'y mają numery jak w TTD, więc własną grafiką można je podmieniać kafelek po kafelku. Menu → Widok → Grafika: powrót do prostych kształtów.
- Retro UI, dźwięki (koła, gwizdek), muzyka.
- Wydanie na itch.io.

## Etap 8 – Później
- ~~Wysokości terenu, zbocza, mosty, tunele.~~ ✅ (zrobione wcześniej – 2026-10-18)
- Backend: zapis w chmurze, rankingi.
  - *Kandydat (2026-10-21):* Cloudflare Workers + D1 (baza SQLite) – bez własnego serwera do utrzymania, darmowy próg wystarcza na testy, strona zostaje na GitHub Pages. Pierwszy krok: statystyki graczy (nazwa firmy, identyfikator z przeglądarki, czas grania), potem zapis w chmurze i rankingi na tej samej bazie. Alternatywy: Supabase (Postgres + logowanie), mały VPS z SQLite (najwięcej kontroli, ale trzeba go utrzymywać).
  - Pełna dyskusja możliwości (licznik vs Workers + D1 vs Supabase vs VPS, nazwa firmy, identyfikator gracza, IP, RODO, szkic tabeli): [07-backend-mozliwosci](07-backend-mozliwosci.md).
- Płatne dodatki (pakiety pojazdów) – wymaga backendu i systemu płatności.
- Symulacja w Web Workerze, ewentualnie multiplayer.

## Kolejka – co dalej (stan na 2026-10-21)

Jedna kolejka, w kolejności, która najszybciej poprawia granie. Maglevy, kolej jednoszynowa i katastrofy – świadomie pomijamy.

### Faza A – przed testami z ludźmi
1. ~~**Droższe zmiany terenu**~~ ✅ (2026-10-21) – 150 zł za narożnik zamiast 30 zł (`terraformCorner`).
2. ~~**Nowa gra – tryb własny**~~ ✅ (2026-10-21) – przełącznik „Gęstość / Własne”, dokładne liczby miast i zakładów każdego typu, położenie z ziarna mapy.
3. ~~**Lista pociągów**~~ ✅ (2026-10-21) – okno z podglądem wszystkich pociągów: zysk w tym i zeszłym roku, sortowanie, oznaczenie nierentownych (i komunikat o nich raz w roku); filtry, w tym **grupy pociągów** (np. „Węgiel”, „Pasażerskie”).
4. ~~**Lepsza minimapa**~~ ✅ (2026-10-21) – zoom, przenoszenie po ekranie i powiększanie; po wejściu w nią – jak w OpenTTD – filtr zakładów (np. tylko kopalnie węgla, tylko elektrownie) z legendą kolorów, żeby zaplanować start i rozbudowę sieci.
5. ~~**Wspólne rozkłady**~~ ✅ (2026-10-21) – kopia pociągu może dzielić rozkład z oryginałem: zmiana w jednym zmienia wszystkie na linii.
6. ~~**Rozkład czasowy**~~ ✅ (2026-10-21) – postój X dni na stacji i **równe odstępy**: na wspólnym rozkładzie wyrównuje pociągi linii (czas obiegu / liczba pociągów) i wypuszcza je w odpowiednich odstępach.
7. ~~**Łączenia torów**~~ ✅ (2026-10-22) – styk prostej z ukosem ścięty na ukos (dwusieczna), więc szyny i podsypka obu elementów spotykają się w tych samych punktach; tak samo przy rampach mostów i wjazdach do tuneli (`jointMiter` w `src/render/trackDraw.ts`). Na rozjazdach końce zostają prostopadłe.
8. **Etap 5 – test „czy to jest fajne”** – granie z kilkoma osobami, strojenie `src/data/economy.ts` i `vehicles.json`.
   - *Przydatne do testów:* **statystyki graczy** (pomysł niżej) – kto wchodził, jak długo grał, na jakiej mapie.

### Wydajność – wrócić przed testami na dużych mapach
- **Audyt wydajności** – lista poprawek z pomiarami w [06-audyt-wydajnosci](06-audyt-wydajnosci.md). Najpierw: autozapis bez zamrożeń (~0,6 s co 2 min na mapie 1024), liczenie zasięgu stacji bez przeglądania całej mapy, dzienny ładunek (~90 ms na 1024 przy 40 stacjach), okna odświeżane 4–5×/s. Potem profil gry w przeglądarce przy 8× i decyzja o pamiętaniu tras pociągów.
- **Dodatkowy audyt – części jeszcze niesprawdzone.** Profil w DevTools (zakładka Performance) na mapie 1024 przy 8× z kilkudziesięcioma pociągami i sprawdzenie miejsc, których pierwszy audyt nie objął: ruch uliczny (`traffic.ts`), minimapa, podpisy na mapie, rysowanie przy dalekim zoomie, odświeżanie interfejsu (Preact), pamięć (wycieki, GC), generowanie mapy (~2 s na 1024). Wyniki dopisać do [06-audyt-wydajnosci](06-audyt-wydajnosci.md).

### Utrzymanie projektu
- ~~**Akcje GitHuba na Node 24**~~ ✅ (2026-10-22) – w `.github/workflows/deploy.yml`: checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5 (wszystkie na Node 24). Build na `ubuntu-latest` przechodzi.

### Faza B – głębia rozgrywki (po wnioskach z testów)
9. ~~**Podwójna trakcja**~~ ✅ (2026-10-21) – 2 takie same lokomotywy w składzie: 2× moc i przyczepność (ciężkie pociągi pod górę).
10. **Tory na zboczach z fundamentami** – łuki i rozjazdy na zboczu, wyraźnie droższe od zwykłych torów.
11. **Szablony budowy** – gotowe do wklejenia układy, np. bezkolizyjne skrzyżowanie łączące cztery dwutorowe linie.
12. **Metro – poziom podziemny (−1)** – *etap 1 ✅ (2026-10-25): warstwa `map.under` z torami metra, zjazdy (`map.ramp`), jazda pociągów przez metro (osobne kody elementów, bez kolizji z powierzchnią), widok −1 (Q) z przyciemnioną powierzchnią, narzędzie Zjazd (J), zapis v22, stacje metra (`map.stationUnder`, `Station.under`). Dalej: zajezdnie i semafory pod ziemią, przesiadki (stacja metra + stacja nad nią jako jeden węzeł?), metro na minimapie, zapotrzebowanie miast.* – zastępuje „super stację” i „dworzec główny”. Przełącznik poziomu w menu budowy (powierzchnia / pod ziemią); pod ziemią te same narzędzia: tory, stacje, zajezdnie, pociągi, semafory. Duże miasta zaczynają się domagać metra. Połączenie z powierzchnią rampą jak portal tunelu, więc pociągi mogą jeździć między poziomami. Duża stacja w mieście = druga stacja pod ziemią, pod tą na powierzchni (szczegóły w Pomysłach).
13. ~~**„Jedź bez zatrzymania” i punkty kontrolne**~~ ✅ (2026-10-21) – ptaszek „bez zatrzymania” przy pozycji rozkładu; punkt kontrolny na prostym torze (narzędzie Stacja) wymusza trasę.
14. ~~**Badania (na co wydawać pieniądze)**~~ ✅ (2026-10-25) – okno Badania (Y): 6 kierunków (`src/data/research.ts`), jedno badanie naraz, koszt ×2 i czas ×1,5 na poziom, zapis v24. Pierwotny opis: żeby kasa nie leżała odłogiem, tylko była dalej inwestowana: drogie, stopniowe ulepszenia kupowane za pieniądze i czas, np. **+10% ładowności wagonów**, **+10% prędkości pociągów**, kolejne pomysły do dopisania (szybszy załadunek, tańsze utrzymanie, wyższa ocena stacji, wcześniejszy dostęp do nowych lokomotyw). Każdy poziom droższy od poprzedniego.
15. **Wersja na telefon** – większy refaktor interfejsu: sterowanie dotykiem (przesuwanie palcem, zoom dwoma palcami, przytrzymanie zamiast prawego przycisku), panele i okna dopasowane do wąskiego ekranu (pasek narzędzi na dole, okna na cały ekran, większe przyciski), czytelne podpisy i minimapa na małym ekranie.
16. **Awarie i serwis** – niezawodność spada z wiekiem, nieserwisowane pociągi psują się częściej i stają, serwis w zajezdni; możliwość wyłączenia przy nowej grze.

### Faza C
17. **Etap 7** – grafika, dźwięki, retro UI, wydanie na itch.io.
18. **Etap 8** – generator/edytor map, chmura, Web Worker, płatne dodatki.

### Zrobione z wcześniejszej kolejki (2026-10-21)
Kredyt i bankructwo · minimapa · pierwsze kroki · lokomotywy z biegiem lat i sieć trakcyjna · ciężarówki, chowanie pojazdów za domami, lint/format · wymiana lokomotyw · pomoc i historia zmian · nazwy miast · kopiowanie pociągów · pełny ładunek · magazyn wagonów · rozbudowa stacji · gęstość miast, kopalń i przemysłu · numery zajezdni.

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
- ~~**Super stacja**~~ → zastąpiona przez **Metro** (2026-10-25, opis niżej). Pierwotny pomysł (2026-10-21): ulepszenie istniejącej stacji za ~100× ceny peronu – druga kondygnacja peronów pod spodem (4 tory zamiast 2 na tym samym obszarze), zjazdy na dolny poziom jak portale tuneli, dolne tory jako osobna warstwa (bez kolizji z górnymi). Żeby nie było zatorów: osobne tory zjazdów w głowicy (wymóg 2-torowego wjazdu), wybór peronu przez obecny planer. Warunek: stacja w mieście (np. ≥ 2000 mieszkańców w zasięgu). Prostsza alternatywa: „dworzec główny” – 2× szybszy załadunek, wyższa ocena, większy zasięg. Po etapie 5.
- **Statystyki graczy** (pomysł 2026-10-21): kto wchodził, czy grał i jak długo – przyda się przy etapie 5. Omówienie możliwości: [07-backend-mozliwosci](07-backend-mozliwosci.md). Gra jest statyczną stroną (GitHub Pages, bez serwera), więc do wyboru:
  - *Prosto, bez serwera:* lekki licznik odwiedzin szanujący prywatność (np. GoatCounter, Plausible) + własne zdarzenia z gry: start nowej gry (rozmiar mapy), czas grania co kilka minut, osiągnięte kroki samouczka. Bez kont – widać liczby, nie konkretne osoby.
  - *„Kto” konkretnie:* opcjonalny nick przy pierwszym uruchomieniu albo kod testera w linku (np. `?tester=ania`) dołączany do zdarzeń – wystarczy na testy z kilkoma osobami.
  - **Nazwa firmy przy nowej grze** (pomysł 2026-10-21): gracz wpisuje nazwę swojej kolei (np. „Kolej Żelazna Sp. z o.o.”) – widać ją w grze (HUD, finanse, podpis zapisu), a w statystykach działa jak osobny „login”. Fajne samo w sobie, nawet bez statystyk.
  - *Łączenie sesji jednego gracza:* zamiast IP lepiej losowy identyfikator gracza zapisany w przeglądarce (localStorage) – IP zmienia się (telefon, domowy router) albo jest wspólne dla wielu osób (firma, akademik). IP da się dołożyć, ale tylko z własnym małym serwerem (np. Cloudflare Worker), bo gotowe liczniki go nie pokazują; IP to dane osobowe – wtedy obowiązkowa informacja o zbieraniu i ograniczony czas przechowywania.
  - *Własny backend:* razem z etapem 8 (zapis w chmurze, rankingi) – wtedy pełne logi sesji.
  - Lokalnie w grze: łączny czas grania i liczba sesji w Menu (tylko dla tego gracza, bez wysyłania).
  - Pamiętać o RODO: krótka informacja w grze, co jest zbierane; bez danych osobowych, jeśli się da.
- ~~menu górna przesuwalne i możliwość minimalizacji, to samo menu budowania. te podpowiedzi na dole po prawej możliwość wyłączenia minimalizacji i przesuwania~~ ✅ (2026-10-22) – uchwyt ⠿ i zwijanie w górnym pasku, menu budowania (z panelem opcji) i podpowiedziach, położenie w przeglądarce (`src/ui/layout.ts`); Menu → Widok: podpowiedzi wł./wył., „Przywróć układ paneli”.
- **Metro – poziom podziemny** (pomysł 2026-10-25): rozwiązuje też „super stację” i „dworzec główny”.
  - *Poziom −1:* osobna warstwa mapy pod powierzchnią. W menu budowy przełącznik „Powierzchnia / Pod ziemią”: na dolnym poziomie powierzchnia jest przygaszona, widać siatkę i to, co zbudowane pod ziemią.
  - *Te same zasady:* tory, rozjazdy, stacje, zajezdnie, pociągi, semafory i rozkłady działają jak na powierzchni. Pod ziemią nie ma terenu do kształtowania, wody ani domów, które by przeszkadzały; budowa jest za to wyraźnie droższa (drążenie).
  - *Łączenie z powierzchnią:* rampa / portal, jak wjazd do tunelu. Zwykłe pociągi mogą zjeżdżać pod ziemię i odwrotnie – jedna wspólna sieć i jeden graf torów.
  - *Duże stacje:* pod stacją na powierzchni można zbudować drugą, podziemną; pasażerowie z tego samego zasięgu idą do obu (ewentualnie połączenie jako jeden węzeł przesiadkowy).
  - *Miasta domagają się metra:* od pewnej liczby mieszkańców (np. 2000+) miasto zgłasza zapotrzebowanie; metro w mieście podnosi ocenę / wzrost, a ruch wewnątrz miasta (pasażerowie między dzielnicami) daje dodatkowy zarobek.
  - *Do przemyślenia:* rysowanie dwóch warstw (przezroczystość, przełączanie), picking na poziomie −1, zapis (nowa wersja + migracja), podgląd na minimapie, tunele z powierzchni przecinające się z metrem.
- ~~Bugfix - przebudowa - Screenshot 2026-10-25 at 08-34-40 Iron Hub.png - tak jak w ottd, bez sensu kupowanie dwa razy w zajezdni, wszystko kupujemy dokładnie odtworzyć musimy tak jak jest w ottd. do rego na done rozjezdzają się napisy jedne na drugich leżą.Screenshot 2026-10-25 at 08-32-08 Iron Hub.png~~ ✅ *(napisy w rozkładzie ✅ 2026-10-25 – opcje stacji w drugiej linii pod nazwą; przebudowa zajezdni ✅ 2026-10-25 – rzędy pociągów z sylwetkami pojazdów, wolne wagony, przeciąganie i kosz, jedno „Nowe pojazdy”)*
- ~~bugfix Screenshot 2026-10-25 at 08-06-09 Iron Hub.png tory nie budują się w takiej sytuacji a przecież powinny mieszczą się.~~ ✅ (2026-10-25) – ukos (łuk) na zboczu wolno budować, gdy leży poziomo: oba końce na tej samej wysokości, np. na płaskiej połówce kafelka z jednym podniesionym narożnikiem (`levelDiagonal`). Ukosy w poprzek zbocza nadal nie – to punkt 10 (fundamenty).
- ~~bardzo szybko w miastach zmieniają sie budynki, non stop praktycznie trzeba to spowolnić zdecydowanie.~~ ✅ (2026-10-25) – wygląd domu stały dla kafelka; zmienia się tylko przy rozbudowie domu albo raz, gdy jego budynek pojawi się w danym roku (wcześniej co nowy rok przetasowywało się całe miasto).
- ~~konieczny przycisk widoku bez budynó zasłaniają tory, czasem treba widzieć tory~~ ✅ (2026-10-25) – klawisz U albo Menu → Widok → Budynki: domy, zakłady, drzewa i dachy peronów znikają, tory i drogi zostają.

- ~~kolejność załadunku na stracji, często jest tak ze jeden pociąg jest naładowany w 50% dojezdza drugi i oba maja full w tym samym czasie. a powinien jednak tec co miał 50% wyjechać jako pierwszy. coś tu nie do końca działa.~~ ✅ (2026-10-25) – kolejka załadunku: ładunek, na który czeka pociąg, który przyjechał wcześniej, zostaje dla niego (`Train.arrivedTick`, `cargoQueuedAhead`).
- ✅ (2026-10-25) Screenshot 09-24-11: semafory w grafice TTD były odwrócone (obrazek to strona, w którą patrzą światła) – poprawione, podgląd w narzędziu też sprite'em.
- ✅ (2026-10-25) Za dużo pasażerów i poczty (Torzyce 14k mieszkańców, ~30k czekających) – generowanie o połowę mniejsze (`passengerDivisor` 8, `mailDivisor` 32).

