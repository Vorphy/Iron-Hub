# 03 – Mechaniki gry

Wartości liczbowe w tym dokumencie są **startowe** – do strojenia w trakcie testów. Wszystkie powinny trafić do pliku konfiguracyjnego / definicji danych, nie do kodu.

## Tory i stacje

- Budowa torów przeciąganiem myszą (prosta / łuk / ukos), z podglądem i kosztem przed zatwierdzeniem.
  - Kierunek przeciągnięcia wybiera typ linii: wzdłuż osi X lub Y albo ukos (poziomy lub pionowy na ekranie). Pozycja kursora w pierwszym kafelku wybiera łuk.
  - Linia budowana jest **w całości albo wcale** – jeśli którykolwiek kafelek jest zablokowany (woda, krawędź mapy), podgląd świeci na czerwono i nic nie powstaje.
  - Koszt: 100 zł za element toru, +50 zł za oczyszczenie nieużytku pod torem. Istniejące elementy są pomijane bez opłaty.
  - Jak w TTD nie ma skrętów o 90° – skręca się łukami (ukosami).
- Rozbiórka (buldożer): klik usuwa wszystkie tory z kafelka (lub oczyszcza nieużytek), przeciągnięcie rozbiera odcinek. Zwrot: 25% kosztu toru.
- Stacja: prostokąt peronów (długość × liczba torów). Każda stacja ma **zasięg** (np. 4 kafelki od krawędzi) – z niego zbiera pasażerów i ładunek oraz do niego dostarcza.
- MVP: płaski teren (bez zboczy, mostów, tuneli). Model danych przewiduje wysokości na później.

## Pociągi i rozkłady

- Gracz kupuje pociąg w zajezdni, składa skład (lokomotywa + wagony), ustawia **rozkład = lista stacji** z opcjami (ładuj / rozładuj / czekaj na pełny załadunek).
- Trasa liczona A* po grafie torów; przeliczana, gdy sieć się zmieni lub trasa jest zablokowana.
- Ruch: przyspieszanie / hamowanie wg mocy i masy (uproszczone), limit prędkości na łukach.

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
