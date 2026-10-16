# 03 – Mechaniki gry

Wartości liczbowe w tym dokumencie są **startowe** – do strojenia w trakcie testów. Wszystkie powinny trafić do pliku konfiguracyjnego / definicji danych, nie do kodu.

## Tory i stacje

- Budowa torów przeciąganiem myszą (prosta / łuk / ukos), z podglądem i kosztem przed zatwierdzeniem.
  - Kierunek przeciągnięcia wybiera typ linii: wzdłuż osi X lub Y albo ukos (poziomy lub pionowy na ekranie). Pozycja kursora w pierwszym kafelku wybiera łuk.
  - Linia budowana jest **w całości albo wcale** – jeśli którykolwiek kafelek jest zablokowany (woda, krawędź mapy), podgląd świeci na czerwono i nic nie powstaje.
  - Koszt: 100 zł za element toru, +50 zł za oczyszczenie nieużytku pod torem. Istniejące elementy są pomijane bez opłaty.
  - Jak w TTD nie ma skrętów o 90° – skręca się łukami (ukosami).
- Rozbiórka (buldożer): klik usuwa wszystkie tory z kafelka (lub oczyszcza nieużytek), przeciągnięcie rozbiera odcinek. Zwrot: 25% kosztu toru.
- Stacja: prostokąt peronów (długość × liczba torów, max 12 × 6). Każda stacja ma **zasięg** (4 kafelki od peronów) – z niego zbiera pasażerów i ładunek oraz do niego dostarcza.
  - Narzędzie Stacja (P): przeciągnięcie prostokąta; dłuższy bok = długość peronu, przy kwadracie oś wybiera panel obok paska narzędzi lub klawisz R.
  - Stację można postawić na pustym terenie albo na istniejącej prostej w osi peronu (wpięcie w linię). Nie na łuku, torze w innej osi, wodzie ani innej stacji.
  - Koszt: 300 zł za kafelek peronu (razem z torem). Buldożer usuwa pojedynczy kafelek (zwrot 25%); ostatni kafelek usuwa stację.
  - Na peronie nie da się dołożyć łuku ani rozebrać toru osobno.
  - Nazwy na razie z listy fikcyjnych nazw; po dodaniu miast – od najbliższego miasta.
  - Sąsiednie stacje się nie łączą (do rozważenia później).
- MVP: płaski teren (bez zboczy, mostów, tuneli). Model danych przewiduje wysokości na później.

## Zajezdnie

- Narzędzie Zajezdnia (Z): klik stawia zajezdnię na wolnym kafelku (1000 zł). Kierunek wjazdu wybiera się w panelu obok paska narzędzi (4 kierunki, jak w OpenTTD) lub klawiszem R. Tryb **Auto** obraca wjazd w stronę sąsiedniego toru.
- Na kafelek zajezdni nie można położyć toru ani stacji. Buldożer usuwa zajezdnię (zwrot 25%).
- W grafie torów wjazd zajezdni jest węzłem (jak koniec toru).

## Pociągi i rozkłady

- Gracz kupuje pociąg w zajezdni (klik kursorem na zajezdnię): lokomotywa + do 10 wagonów. Sprzedaż tylko w zajezdni, zwrot 75% ceny.
- Pojazdy definiuje plik danych `src/data/vehicles.json` (moc kW, prędkość km/h, masa t, długość w jednostkach toru, cena). Start: 3 parowozy z 1950 r. i 6 typów wagonów.
- Gracz ustawia **rozkład = lista stacji** z opcjami (ładuj / rozładuj / czekaj na pełny załadunek – opcje od etapu 4).
- Okno pociągu (klik na pociąg albo „Rozkład” w zajezdni): start/stop, „Do zajezdni”, „Pokaż”, rozkład – „+ Dodaj stacje” i klikanie stacji na mapie.
- Trasa liczona algorytmem Dijkstry po skierowanych elementach toru (stan pochodny, liczony od nowa przy zmianie odcinka czoła, celu lub torów). Pociąg zatrzymuje się czołem na końcu peronu w kierunku jazdy.
- Zawracanie jak w TTD: na końcu toru oraz na stacji, gdy kolejny cel jest za pociągiem (kara w wyszukiwaniu, żeby wybierać jazdę naprzód).
- Bez rozkładu pociąg jeździ przed siebie (bez wjazdu do zajezdni) i zawraca na końcach. Cel nieosiągalny → status „Nie może dojechać”.
- Ruch: przyspieszenie z mocy (kW), przyczepności i oporów; hamowanie 1 km/h na tick z wyprzedzeniem przed celem; łuk 45° – max 80 km/h. Postój na stacji: 2 dni gry.
- Tor, stacji ani zajezdni pod pociągiem nie można rozebrać.
- Na tym etapie pociągi się nie zderzają ani nie blokują nawzajem – to sygnalizacja w etapie 3.

## Sygnalizacja

### Jeden silnik: rezerwacja ścieżek
Rdzeniem jest system **rezerwacji ścieżek** (jak path signals / PBS w OpenTTD):
- Pociąg przed wjazdem w obszar sygnałów rezerwuje ciąg odcinków grafu aż do najbliższego **bezpiecznego miejsca zatrzymania** (sygnał lub peron).
- Rezerwacja się nie powiedzie, jeśli którykolwiek odcinek / rozjazd jest zajęty lub zarezerwowany – pociąg czeka przed sygnałem.
- Odcinki zwalniane są, gdy ostatni wagon je opuści.

### Tryb Amator
Gra **automatycznie** stawia sygnały na tym samym silniku:
- sygnał ścieżkowy przed każdym rozjazdem i wjazdem na stację,
- sygnały blokowe co N kafelków na długich odcinkach (przepustowość),
- automatyczna aktualizacja przy każdej zmianie torów.

Gracz nie widzi narzędzia sygnałów (może widzieć sygnały na mapie). Cel: brak kolizji i brak blokad na typowych układach. Złożone układy jednotorowe z ruchem dwukierunkowym mogą nadal się korkować – gra powinna wtedy wskazać problematyczne miejsce.

### Tryb Ekspert
Gracz stawia sygnały ręcznie: blokowe, ścieżkowe, jednokierunkowe ścieżkowe (+ ewentualnie później: wjazdowe/wyjazdowe/kombi). Auto-sygnalizacja wyłączona.

Tryb wybierany przy tworzeniu gry (możliwość zmiany w trakcie – do decyzji, patrz [05-decyzje](05-decyzje.md)).

## Miasta

- Stan miasta: populacja, lista budynków, „ocena” transportu.
- **Generowanie pasażerów** zależy od populacji budynków w zasięgu stacji.
- **Wzrost**: tempo zależy od jakości obsługi (procent przewiezionych pasażerów, częstotliwość pociągów). Nowe budynki pojawiają się **preferencyjnie wzdłuż korytarzy kolejowych** i wokół stacji – miasto rośnie w stronę sieci gracza.

## Fabryki

### Typy
- **Pierwotne** (kopalnia węgla, kopalnia rudy, las, farma) – produkują surowiec.
- **Przetwórcze** (huta, tartak, zakład spożywczy…) – przyjmują surowce i siłę roboczą (pasażerów), produkują towar.
- **Odbiorcy końcowi** (elektrownia, miasto dla towarów) – tylko przyjmują.

Każda fabryka ma **poziom** (1…N). Poziom określa produkcję i zapotrzebowanie.

### Wskaźnik zaopatrzenia
Liczony jako średnia krocząca z ostatnich **3 miesięcy gry**:

- fabryka przetwórcza: `dostarczone / zapotrzebowanie` dla każdego wymaganego wejścia; wynik = minimum (lub ważona średnia – do strojenia),
- fabryka pierwotna: `wywiezione / wyprodukowane` (jak w TTD – rośnie ta, którą gracz obsługuje).

### Wzrost i spadek – progi z histerezą

| Zaopatrzenie | Efekt (co miesiąc) |
|---|---|
| **≥ 75%** | +1 punkt rozwoju |
| **50% – 75%** | stabilnie (bez zmian) |
| **≤ 50%** | −1 punkt rozwoju |

- Zmiana poziomu następuje po zebraniu **np. 12 punktów** (≈ rok gry przy stałej sytuacji) – zarówno w górę, jak i w dół. Rozwój i upadek są **bardzo powolne**.
- Pas 50–75% to celowa strefa neutralna – fabryka nie „mruga” poziomem przy wahaniach dostaw.
- Spadek nie schodzi poniżej poziomu 1 (czy fabryka może zostać zamknięta – do decyzji).
- Produkcja w ramach poziomu skaluje się płynnie z zaopatrzeniem (np. 30% bazowej produkcji przy zerowych dostawach, 100% przy pełnych) – nie ma twardej blokady.

## Ruch lokalny AI

- Autobusy, ciężarówki i auta **są wyłącznie dekoracją**. Jeżdżą po drogach miasta i w okolicach stacji, ich liczba luźno zależy od wielkości miasta / aktywności stacji.
- **Nie mają związku z liczbą pasażerów ani ładunku** – te liczone są abstrakcyjnie przez zasięg stacji.
- Nie uczestniczą w symulacji (żyją w `render/` lub w osobnym, niedeterministycznym module kosmetycznym), nie trafiają do zapisu gry.
- Można je wyłączyć w ustawieniach (wydajność).

## Ekonomia gracza

- Przychód za dostawę: `ilość × stawka ładunku × f(dystans) × g(czas przewozu)` – szybciej i dalej = więcej.
- Koszty: budowa (tory, stacje, pojazdy), utrzymanie torów i stacji (miesięczne), eksploatacja pojazdów (roczna, rośnie z wiekiem).
- Kredyt w banku z oprocentowaniem; bankructwo przy długotrwałym ujemnym saldzie.
