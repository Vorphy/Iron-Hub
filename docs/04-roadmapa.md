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
- **Audyt wydajności** – lista poprawek z pomiarami w [06-audyt-wydajnosci](06-audyt-wydajnosci.md). *Zrobione 2026-10-30/31: pkt 0 (autozapis 1370 → 10 ms), 1 (zasięg stacji), 2 (dzienny ładunek 92 → 3 ms), 3 (okna 5×/s), 5 (pociągi poza ekranem). Pomiar ticku 2026-10-31 (48 pociągów, mapa 1024): 70–90 ms procesora na sekundę gry przy 8×, trasa średnio 0,19 ms – pamiętanie tras na razie niepotrzebne (szczegóły w audycie). Zostało: profil części rysujących w przeglądarce.* Pierwotnie najpierw: autozapis bez zamrożeń (~0,6 s co 2 min na mapie 1024), liczenie zasięgu stacji bez przeglądania całej mapy, dzienny ładunek (~90 ms na 1024 przy 40 stacjach), okna odświeżane 4–5×/s. Potem profil gry w przeglądarce przy 8× i decyzja o pamiętaniu tras pociągów.
- **Dodatkowy audyt – części jeszcze niesprawdzone.** Profil w DevTools (zakładka Performance) na mapie 1024 przy 8× z kilkudziesięcioma pociągami i sprawdzenie miejsc, których pierwszy audyt nie objął: ruch uliczny (`traffic.ts`), minimapa, podpisy na mapie, rysowanie przy dalekim zoomie, odświeżanie interfejsu (Preact), pamięć (wycieki, GC), generowanie mapy (~2 s na 1024). Wyniki dopisać do [06-audyt-wydajnosci](06-audyt-wydajnosci.md). Przy pamięci: kilka razy „Nowa gra” / wczytanie i snapshot sterty – czy stare `Game` znika (`destroy()` zdejmuje nasłuchy `window` i świat Pixi, ale nie sprawdzaliśmy tego pomiarem). Drobne miejsca z audytu 2026-10-30 dopisane w pkt 5 audytu wydajności.

### Utrzymanie projektu
- ~~**Akcje GitHuba na Node 24**~~ ✅ (2026-10-22) – w `.github/workflows/deploy.yml`: checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5 (wszystkie na Node 24). Build na `ubuntu-latest` przechodzi.
- ~~**Pilnowanie zależności**~~ ✅ (2026-10-30, z audytu) – `.github/dependabot.yml` dla `npm` i `github-actions` (raz w tygodniu, aktualizacje zgrupowane w jeden PR) oraz krok `npm audit --omit=dev --audit-level=high` w CI (tylko biblioteki trafiające do gry; narzędzia deweloperskie pilnuje Dependabot, żeby podatność w np. Vitest nie blokowała publikacji).
- ~~**Odporność na uszkodzone zapisy**~~ ✅ (2026-10-31 – `checkReferences` w `serialize.ts`: odrzuca id w warstwach mapy bez obiektu, powtórzone numery, rozkład z nieistniejącą stacją, pociąg w nieistniejącej zajezdni lub poza mapą; naprawia grupę, zajezdnię macierzystą, blokujący pociąg, `currentOrder` i liczniki id; wczytanie mapy 1024 ~0,1 s) (z audytu 2026-10-30) – `deserializeState` sprawdza wersję, wymiary mapy, długości warstw i wysokości, ale nie odwołania między obiektami (pociąg → zajezdnia/stacja, sygnał → kafelek, id w warstwach mapy bez obiektu). Ręcznie zmieniony albo ucięty plik może wywrócić grę dopiero w trakcie ticku. Do zrobienia: przy wczytaniu odrzucić (albo naprawić) wiszące odwołania + kilka testów z celowo zepsutymi zapisami. Oszukiwanie przez edycję zapisu jest OK (gra single-player, patrz [05-decyzje](05-decyzje.md)) – chodzi o czytelny komunikat zamiast zawieszonej gry.

### Faza B – głębia rozgrywki (po wnioskach z testów)
9. ~~**Podwójna trakcja**~~ ✅ (2026-10-21) – 2 takie same lokomotywy w składzie: 2× moc i przyczepność (ciężkie pociągi pod górę).
10. ~~**Tory na zboczach z fundamentami**~~ ✅ (2026-10-28) – jak `GetRailFoundation` w OpenTTD (`src/sim/track/foundation.ts`): fundament poziomy (kafelek do najwyższego narożnika; każdy bok, do którego dochodzi tor, musi mieć narożnik na górze) i pochyły (prosty tor przy jednym podniesionym narożniku). 250 zł za kafelek (2,5× toru, `construction.foundation`), raz na fundament. Fundament liczony z torów i terenu – bez zmiany zapisu. Grafika: sprite'y 990–1003 i `FOUNDATIONS_SLOPES_HALFTILES` w atlasie, w prostych kształtach – ścianki rysowane. *Bez:* stromych zboczy (fundamenty Steep*), półkafelkowych (Halftile – zamiast nich poziomy) i „anty-zygzaka”; przejazdy przez drogę tylko bez fundamentu.
11. **Szablony budowy** – gotowe do wklejenia układy, np. bezkolizyjne skrzyżowanie łączące cztery dwutorowe linie.
12. **Metro – poziom podziemny (−1)** – *etap 1 ✅ (2026-10-25): warstwa `map.under` z torami metra, zjazdy (`map.ramp`), jazda pociągów przez metro (osobne kody elementów, bez kolizji z powierzchnią), widok −1 (Q) z przyciemnioną powierzchnią, narzędzie Zjazd (J), zapis v22, stacje metra (`map.stationUnder`, `Station.under`). Etap 2 ✅ (2026-10-25): przesiadki (perony metra dołączają do stacji w zasięgu), semafory pod ziemią, metro na minimapie, miasta domagają się metra (od 5 tys. mieszkańców; metro przyspiesza wzrost, bez metra powyżej 10 tys. miasto stoi). Zajezdnie zostają na powierzchni (decyzja 2026-10-25). Dalej: dzielnice i ruch miejski – punkt 17.* – zastępuje „super stację” i „dworzec główny”. Przełącznik poziomu w menu budowy (powierzchnia / pod ziemią); pod ziemią te same narzędzia: tory, stacje, zajezdnie, pociągi, semafory. Duże miasta zaczynają się domagać metra. Połączenie z powierzchnią rampą jak portal tunelu, więc pociągi mogą jeździć między poziomami. Duża stacja w mieście = druga stacja pod ziemią, pod tą na powierzchni (szczegóły w Pomysłach).
13. ~~**„Jedź bez zatrzymania” i punkty kontrolne**~~ ✅ (2026-10-21) – ptaszek „bez zatrzymania” przy pozycji rozkładu; punkt kontrolny na prostym torze (narzędzie Stacja) wymusza trasę.
14. ~~**Badania (na co wydawać pieniądze)**~~ ✅ (2026-10-25) – okno Badania (Y): 6 kierunków (`src/data/research.ts`), jedno badanie naraz, koszt ×2 i czas ×1,5 na poziom, zapis v24. Pierwotny opis: żeby kasa nie leżała odłogiem, tylko była dalej inwestowana: drogie, stopniowe ulepszenia kupowane za pieniądze i czas, np. **+10% ładowności wagonów**, **+10% prędkości pociągów**, kolejne pomysły do dopisania (szybszy załadunek, tańsze utrzymanie, wyższa ocena stacji, wcześniejszy dostęp do nowych lokomotyw). Każdy poziom droższy od poprzedniego.
15. **Wersja na telefon** – większy refaktor interfejsu: sterowanie dotykiem (przesuwanie palcem, zoom dwoma palcami, przytrzymanie zamiast prawego przycisku), panele i okna dopasowane do wąskiego ekranu (pasek narzędzi na dole, okna na cały ekran, większe przyciski), czytelne podpisy i minimapa na małym ekranie.
16. **Awarie i serwis** – niezawodność spada z wiekiem, nieserwisowane pociągi psują się częściej i stają, serwis w zajezdni; możliwość wyłączenia przy nowej grze.
17. **Dzielnice, aglomeracje i ruch miejski** (ustalone 2026-10-25, MUSIMY zrobić – rozwinięcie metra z punktu 12). *Krok 1 ✅ (2026-10-31): `Town.districts` (pierwsza = „Centrum” na rynku), obszar miasta = kwadraty ±`TOWN_EXTENT` wokół środków dzielnic (`forEachTownTile`), kafelek należy do dzielnicy z najbliższym środkiem i ma jej siatkę ulic, zapis v29, lista dzielnic w oknie miasta i ich nazwy na mapie (gdy jest więcej niż jedna).* *Krok 2 ✅ (2026-10-31): `townMerge.ts` – co miesiąc miasto ≥ 5 tys. i > 2× większe wchłania sąsiada, którego domy stoją ≤ 3 kafelki od jego domów (`absorbReach`); domy przechodzą na większe miasto, dzielnice sąsiada dołączają (centrum pod nazwą miasta), statystyki miesiąca się sumują, ocena = średnia ważona; komunikat z przejściem do dzielnicy.* *Zmiana 2026-10-31 (po teście w grze): bez progu 5 tys. i warunku 2× – miasta, których domy się stykają (sąsiednie kafelki) albo łączy je droga, po `absorbMonths` (12) miesiącach styku łączą się: większe przejmuje mniejsze (`Town.contact`, komunikat przy pierwszym styku, licznik w oknie miasta). Z kilku zrośniętych miast powstaje metropolia.* *Krok 3 ✅ (2026-10-31): `districts.ts` – gdy `growTown` nie postawi wszystkich domów (miasto ≥ 1 tys.), nowy środek 16 kafelków od istniejącej dzielnicy (8 kierunków), z dala od innych środków, z ≥ 40 wolnymi kafelkami, punktowany bliskością stacji; nazwy: Zatorze (tor między środkami), „Miasto-Północ/Wschód/…” (strona świata na ekranie), lista osiedli. Uwaga: zabudowane centrum to ok. 14 tys. mieszkańców, więc w praktyce nowa dzielnica pojawia się w mieście z metrem.* *Krok 4 ✅ (2026-10-31): premia ×2 (`interDistrictBonus`) dla pasażerów między stacjami w różnych dzielnicach tego samego miasta przy odległości ≥ 10 kafelków (`interDistrictMinDist`, ta sama odległość co przy zapłacie), `month.interDistrict` w oknie miasta, zapis v30; wzrost z metrem: +`metroGrowthExtra` domów i rzut na rozbudowę za każdą dzielnicę ze stacją metra. Punkt 17 zrobiony – dalej do sprawdzenia w grze: tempo zakładania dzielnic i czy premia nie jest za hojna.* Stan wyjściowy: miasto = jeden rynek + kwadrat ±16 kafelków (`TOWN_EXTENT`), więc ma sufit wzrostu; miasta stoją ≥ 18 kafelków od siebie, więc sąsiednie już się zrastają; pasażerowie nie mają celu, a płaci się za odległość, więc przejazd metrem przez miasto zarabia grosze.
    - *Miasto = kilka dzielnic:* każda ma środek, nazwę i własny obszar zabudowy; miasto to ich suma (wspólna liczba mieszkańców, jedno okno z listą dzielnic: mieszkańcy, metro). Na start każde miasto ma jedną dzielnicę („Centrum”). To zdejmuje sufit wzrostu.
    - *Wchłanianie miast:* gdy domy dwóch miast się stykają albo łączy je droga, po roku większe wchłania mniejsze (pierwotnie: > 2× więcej mieszkańców i ≥ 5 tys. – zmienione 2026-10-31) – mniejsze zostaje dzielnicą z zachowaną nazwą („Żelazowo – dzielnica Stalówka”). Komunikat „Żelazowo wchłonęło Stalówkę”. Stacje zachowują nazwy. Ustalone 2026-10-31: w pełni automatycznie.
    - *Nowe dzielnice przy wzroście:* gdy miasto dobija do brzegu swoich dzielnic (ok. 10 tys.), przy krawędzi zabudowy powstaje nowa dzielnica, chętniej w stronę kolei. Nazwy: „Nowe Żelazowo”, „Żelazowo-Północ”, z generatora („Osiedle Parowe”), „Zatorze”, gdy powstaje za torami.
    - *Na mapie:* duża nazwa miasta przy rynku, nazwy dzielnic jak miasta, ale bez pogrubienia; kolory dzielnic na domach i ulicach (🏘 / I, krycie 60%) – zrobione 2026-10-31.
    - *Ruch miejski (po co to graczowi):* premia za pasażerów przewiezionych między stacjami w różnych dzielnicach tego samego miasta Ustalone 2026-10-31: każdy pociąg (metro i na powierzchni); premia tylko gdy oba warunki naraz – stacje w różnych dzielnicach tego samego miasta i przejazd ≥ 10 kafelków w linii prostej (żeby nie opłacało się wozić ludzi 3 kafelki przez granicę dzielnic), wtedy zapłata ×2 zamiast podłogi odległości. Zapotrzebowanie na metro per dzielnica – im więcej dzielnic ma stację metra, tym szybciej rośnie miasto (dziś wystarcza jedna stacja w dowolnym miejscu).
    - *Trudne miejsca:* zapis (lista dzielnic w mieście, migracja: jedna dzielnica = stary rynek), `townTiles` po kilku obszarach zamiast jednego kwadratu, scalanie dróg, ocen i statystyk przy wchłonięciu bez „skoków”.
    - *Kolejność:* (1) dzielnice jako dane + okno miasta + nazwy na mapie (każde miasto z jedną), (2) wchłanianie sąsiadów, (3) nowe dzielnice przy wzroście, (4) premia za ruch między dzielnicami i metro per dzielnica.
18. ~~**Pracownicy dla zakładów – poziomy 6 i 7**~~ ✅ (2026-10-28 – `workersNeeded`/`wantsWorkers` w `industry.ts`, `month.workers`, zapis v28; 50 × poziom na miesiąc; brak pracowników na 6–7 odbiera punkt na miesiąc zamiast od razu cofać do 5) (pomysł 2026-10-25). Dziś zakład rośnie do poziomu 5 (`maxLevel`) dzięki wywozowi albo dostawom, a produkcja i zapotrzebowanie rosną liniowo z poziomem (`baseProduction × level`). Pomysł: od poziomu 5 kopalnia albo fabryka może urosnąć jeszcze o 2 poziomy (do 7), ale tylko wtedy, gdy co miesiąc dostaje odpowiednią liczbę **pracowników** – pasażerów dowiezionych na stację w zasięgu zakładu.
    - *Zakład przyjmuje pasażerów:* stacja przy zakładzie od poziomu 5 przyjmuje pasażerów nawet bez domów w zasięgu (zapłata jak za zwykły przewóz).
    - *Wymóg:* np. pracownicy na miesiąc = X × poziom (do strojenia w `src/data/economy.ts`); spełniony próg daje punkty rozwoju jak dziś wywóz / dostawy, brak pracowników cofa zakład na poziom 5.
    - *W oknie zakładu:* pracownicy w tym miesiącu (dowiezieni / potrzebni) i informacja, że zakład chce pracowników.
    - *Dla gracza:* nowy powód do wożenia ludzi z miast do zakładów; dobrze łączy się z dzielnicami (punkt 17).
19. **Wyszukiwanie tras jak w OpenTTD (YAPF)** (analiza 2026-10-25; *kara za cudzą stację i dopasowanie peronu ✅ 2026-10-28 – `stationPenalty` w `path.ts`, stałe w `config.ts`; semafor pod prąd, zajętość blisko pociągu, zajęty peron, łuki 45°/90°, podjazdy i A\* ✅ 2026-10-28; zostały segmenty, `GetBestNode`, kara za utratę prędkości i „później”*). Dziś: Dijkstra po elementach toru (`src/sim/trains/path.ts`, limit 50 tys. kroków), kary w `src/sim/config.ts` (1 kafelek = 16 jednostek): zawrócenie 64, łuk 2, zajęty element 48 (na całej trasie, za każdy element), pełny ładunek 4096. Jadący pociąg liczy trasę od nowa przy każdym dołożeniu rezerwacji (co kilka ticków). Wzór: OpenTTD `src/pathfinder/yapf/yapf_costrail.hpp`, `yapf_rail.cpp`, `yapf_destrail.hpp`, domyślne kary w `src/table/settings/pathfinding_settings.ini`.
    - *Kara za przejazd przez nie swoją stację* (OpenTTD: 10 kafelków za kafelek peronu, u celu odejmowana) – pociągi omijają zatłoczone stacje obwodnicą.
    - *Dopasowanie peronu do długości pociągu* u celu (OpenTTD: za krótki +40 kafelków, za długi +8) – długi skład bierze długi peron.
    - ~~*Semafor ścieżkowy pod prąd*~~ ✅ (OpenTTD: +15 kafelków, do 10 semaforów od pociągu) – koniec wyprzedzania torem przeciwnym na dwutorówce (dziś opisane w pomocy jako wada).
    - ~~*Zajętość tylko blisko pociągu*~~ ✅ (do 5 semaforów; dalej tylko pociąg na pełnym ładunku; zajęty peron 8 kafelków) (OpenTTD: kary za rezerwacje tylko w zasięgu kilku pierwszych semaforów; 3 kafelki za skrzyżowanie z rezerwacją, 8 za kafelek zajętego peronu) – bez objazdów z powodu pociągu, który stoi daleko i zaraz odjedzie.
    - *Łuki i podjazdy:* ✅ łuki i podjazdy – tylko w trybie Ekspert dla łuków (w Amatorze pełna kara psuła mijanie na mijankach, zostaje 2); kary za utratę prędkości brak. Opis: łuk 45° ok. 1 kafelka (dziś 1/8) plus kara za utratę prędkości zależna od prędkości pociągu (szybkie wybierają proste); pod górę 2 kafelki za kafelek wzniesienia (ciężkie składy wybierają płaską trasę).
    - *Wydajność:* **A\*** ✅ (`goalEstimate` – prostokąt kafelków celu) z oszacowaniem odległości do celu (octile) zamiast Dijkstry; dalej **segmenty** (odcinki między zwrotnicami, mamy `src/sim/track/graph.ts`) z pamięcią kosztów, kasowaną przy zmianie torów.
    - *Limit przeszukiwania:* zamiast błąkania się – jazda do węzła najbliżej celu (jak `GetBestNode` w YAPF).
    - *Później:* zawracanie w zajezdni jako manewr (+50 kafelków), kara za przejazd przez drogę (+3).
    - *Testy scenariuszy:* obwodnica obok stacji, wybór peronu wg długości, dwutorówka z semaforami ścieżkowymi, pociąg daleko na trasie nie zmienia wyboru. Determinizm bez zmian (wszystko ze stanu gry).
20. **Grafika miast z OpenGFX** (analiza 2026-10-25; *ozdoby, etapy budowy i domy subarktyczne ✅ 2026-10-28* – warstwa `map.houseBuild` (zapis v25), `house` 5 = ozdoba, 6 = kościół, parametry w `ECONOMY.town`; zostały budynki wielokafelkowe i NewGRF). Dziś rysujemy tylko domy 1×1 z mieszkańcami, bez kościołów – 22 z 31 typów klimatu umiarkowanego (`levels()` w `src/render/gfx/tiles.ts`, lista z `parse_houses` w `tools/opengfx/build_atlas.py`, dane z `src/table/town_land.h` OpenTTD). Po podziale na 4 poziomy i lata w danym roku zostaje 2–4 budynki na poziom – stąd monotonia. Kolejność:
    - *Ozdoby:* kościoły i budynki bez mieszkańców (parki, pomniki, fontanny – typy 09–0C) – rzadko, bliżej rynku.
    - *Etapy budowy:* nowy dom przez kilka dni pokazuje 3 etapy z OpenGFX (wykop, rusztowanie, stan surowy) – indeks `house << 4 | wariant << 2 | etap` w `_town_draw_tile_data`; dziś bierzemy tylko etap 3 (gotowy). Miasto widać, że żyje i gdzie rośnie.
    - *Domy subarktyczne spod linii śniegu:* 57 dodatkowych domów 1×1 z innych klimatów; subarktyczne bez śniegu wyglądają jak zwykłe kamienice i domki – dorzucić do puli (pustynne nie pasują).
    - *Budynki wielokafelkowe:* 2 stadiony 2×2, blok 1×2 (140 mieszk., od 1959), duży budynek 2×2 (180 mieszk., od 1983) – wymaga domu zajmującego kilka kafelków (większa zmiana w mieście, wzroście i rozbiórce).
    - *Później:* zestawy NewGRF z budynkami (setki typów; każdy z własną licencją, trzeba czytać definicje domów z NewGRF) – osobny projekt; wszystko to grafika zastępcza wg ADR 13.
21. **Nowe zakłady i ładunki z OpenTTD** (pomysł 2026-10-25). Grafiki są w OpenGFX: **farma** (zboże i żywiec) → **fabryka** (+ stal) → towary; **szyby naftowe** i **platforma wiertnicza** → **rafineria** → towary; **bank** (kosztowności, wagon pancerny). Nowe ładunki, wagony i łańcuchy dostaw; dane produkcji z `src/table/build_industry.h`.
22. **Mechaniki z OpenTTD do rozważenia** (pomysł 2026-10-25):
    - *Cargodist:* pasażerowie i ładunki z celem podróży – łączy się z dzielnicami i ruchem miejskim (punkt 17), ruch między dzielnicami powstaje sam.
    - ~~*Ocena stacji jak w OpenTTD:*~~ ✅ (2026-10-28 – `ratingParts`/`updateStationRatings` w `cargoFlow.ts`, `ECONOMY.rating`, zapis v27; bez pomnika w mieście i losowego ubytku ładunku) prędkość i wiek ostatniego pociągu, dni od ostatniego odbioru, ile czeka (`station_cmd.cpp`, UpdateStationRating); dziś liczy się głównie częstotliwość.
    - *Animacje:* animowana paleta (woda, latarnia, ogień w hucie, światła) i animowane budynki (fontanny) – kolory animowanej palety są już przygotowane w `build_atlas.py`.
25. **Menu → Ustawienia – zasady gry jak w OpenTTD** (pomysł 2026-10-31). Osobny folder w Menu na opcje, które zmieniają zasady rozgrywki (dziś część siedzi luzem w Menu, np. „Sygnalizacja”). Ustawienia zapisywane razem z grą (każda gra ma swoje), domyślne do wyboru też w oknie nowej gry; widok i interfejs (grafika, wielkość UI, podpowiedzi, budynki) zostają w Menu → Widok, bo należą do przeglądarki, nie do gry.
    - *Sygnalizacja:* Amator (auto) / Ekspert (ręczne semafory) – przeniesienie z obecnej sekcji Menu.
    - *Łączenie miast:* wł./wył. – zrośnięte miasta po roku stają się dzielnicami większego albo zostają osobnymi miastami (OpenTTD nie łączy miast, więc „wył.” = zachowanie jak w OpenTTD). Ewentualnie czas styku (pół roku / rok / 2 lata).
    - *Do rozważenia (zebrać więcej przed zrobieniem):* nowe dzielnice przy wzroście wł./wył.; tempo wzrostu miast (jak „town growth rate” w OpenTTD: wolno / normalnie / szybko); premia za ruch między dzielnicami (wył. / ×1,5 / ×2); koszty budowy i stawki przewozu (łatwo / normalnie / trudno – jak „construction cost” i „economy” w OpenTTD); awarie pociągów (punkt 16: wył. / rzadkie / normalne); ruch uliczny (dziś w Menu → Widok – do decyzji, czy to zasada gry, czy widok); bankructwo wł./wył.; miasta domagające się metra wł./wył.
    - *Technicznie:* `state.settings` z wartościami domyślnymi (zapis + migracja: stare gry dostają dzisiejsze zachowanie), parametry z `src/data/economy.ts` czytane przez ustawienia tam, gdzie gracz może je zmienić; pomoc i okno nowej gry pokazują aktualne wartości.

### Faza C
23. **Etap 7** – grafika, dźwięki, retro UI, wydanie na itch.io.
24. **Etap 8** – generator/edytor map, chmura, Web Worker, płatne dodatki.

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
  - ~~**Nazwa firmy przy nowej grze**~~ ✅ (2026-10-28 – `state.companyName`, zapis v26, zmiana w oknie Finanse) (pomysł 2026-10-21): gracz wpisuje nazwę swojej kolei (np. „Kolej Żelazna Sp. z o.o.”) – widać ją w grze (HUD, finanse, podpis zapisu), a w statystykach działa jak osobny „login”. Fajne samo w sobie, nawet bez statystyk.
  - *Łączenie sesji jednego gracza:* zamiast IP lepiej losowy identyfikator gracza zapisany w przeglądarce (localStorage) – IP zmienia się (telefon, domowy router) albo jest wspólne dla wielu osób (firma, akademik). IP da się dołożyć, ale tylko z własnym małym serwerem (np. Cloudflare Worker), bo gotowe liczniki go nie pokazują; IP to dane osobowe – wtedy obowiązkowa informacja o zbieraniu i ograniczony czas przechowywania.
  - *Własny backend:* razem z etapem 8 (zapis w chmurze, rankingi) – wtedy pełne logi sesji.
  - ~~Lokalnie w grze: łączny czas grania i liczba sesji w Menu (tylko dla tego gracza, bez wysyłania).~~ ✅ (2026-10-31 – `src/persistence/playStats.ts`, klucz `ironhub.playStats`; czas tylko przy widocznej karcie, przerwy > 2 min pomijane; Menu → Gra)
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
- ~~**Wielkość interfejsu: 3 rozmiary w Menu → Widok**~~ ✅ (2026-10-28 – `zoom: var(--ui-scale)` na `#ui`, 60% / 80% / 100% / 120%, `uiSize` w `src/ui/layout.ts`; położenia paneli w px ekranu dzielone przez skalę; menu przewijane) (pomysł 2026-10-28). Na małym laptopie (screen 2026-10-28 22:25 – 1920×1080 ze skalowaniem Windows) menu budowania, górny pasek, Menu i okna (np. lista pociągów) zajmują pół ekranu i zasłaniają mapę; na monitorze 24" jest dobrze – tak zostaje jako „Normalny”. Do zrobienia: przełącznik „Mały / Normalny / Duży” (np. 85% / 100% / 115%) zapamiętany w przeglądarce (jak układ paneli w `src/ui/layout.ts`), skalujący czcionki i odstępy całego interfejsu – najprościej przez zmienną CSS (`--ui-scale`) zamiast stałych `font-size` w px w `src/ui/style.css` (18 miejsc) albo `zoom` na kontenerze HUD; podpisy na mapie bez zmian. Przy okazji: domyślnie „Mały”, gdy okno przeglądarki ma mniej niż ~1000 px wysokości.
- ~~**Do sprawdzenia: kościoły, ozdoby i etapy budowy domów niewidoczne w grze**~~ ✅ (2026-10-30 – przyczyna: hipoteza 1. Nowa mapa 256 ma kościół w 31 z 32 miast i 24 ozdoby, atlas ma wszystkie sprite'y; w starych zapisach centrum jest zabudowane, a wzrost stawiał je tylko na wolnym kafelku. Poprawka: `addMissingLandmarks` w `town.ts` – co miesiąc najniższy dom przy rynku przebudowuje się na brakujący kościół albo pierwszą ozdobę, przez etapy budowy. Etapy budowy przy wolnym wzroście nieobsługiwanego miasta po prostu rzadko widać) (zgłoszenie 2026-10-28, po punkcie 20). Gracz nie widzi kościołów, parków/fontann/pomników ani wykopów i rusztowań. Do weryfikacji w przeglądarce na zapisie gracza i na nowej grze:
  - *Hipotezy:* (1) ozdoby i kościół powstają tylko przy budowie nowego domu blisko rynku (`ornamentRadius` 4, szansa 8%) – w starym zapisie z gęsto zabudowanym centrum może nie być na nie miejsca, a istniejące miasta nie dostają ich wstecz; (2) etap budowy trwa 3 × 5 dni tylko dla nowych i rozbudowywanych domów – przy wolnym wzroście i dalekim zoomie łatwo przegapić; (3) grafika: czy atlas z nowymi sprite'ami (etapy, kościoły, ozdoby) doszedł na GitHub Pages i czy nie trzyma go cache przeglądarki; (4) tryb prostych kształtów vs OpenGFX.
  - *Do zrobienia:* policzyć w zapisie gracza kafelki `house` 5/6 i `houseBuild` > 0; test w przeglądarce z wymuszonym wzrostem miasta (zrzut ekranu); jeśli trzeba – dosadzić kościół i ozdoby w istniejących miastach przy wczytaniu (migracja) albo poluzować warunki (np. ozdoba także zamiast rozbudowy domu przy rynku), dłuższe etapy budowy; ewentualnie podgląd „buduje się” w oknie miasta (liczba domów w budowie).
