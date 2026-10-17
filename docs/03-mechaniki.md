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

### Jeden silnik: rezerwacja torów
- Pociąg wjeżdża **wyłącznie na tory, które zarezerwował**. Każdy element toru ma najwyżej jednego właściciela: pociąg, który na nim stoi, albo który zarezerwował go przed sobą.
- Kolidują elementy na tym samym kafelku, które mają wspólny bok (zwrotnica) albo krzyżują się (X i Y). Równoległe łuki (górny/dolny, lewy/prawy) nie kolidują.
- Rezerwacja jest dokładana **porcjami** – każda porcja kończy się w bezpiecznym miejscu zatrzymania i jest brana tylko w całości. Pociąg stara się mieć zarezerwowaną drogę hamowania z prędkości maksymalnej; jeśli następna porcja jest zajęta, hamuje i czeka (status „Czeka na wolny tor”).
- Trasa omija tory zajęte przez inne pociągi (kara w wyszukiwaniu) – np. na stacji z kilkoma peronami pociąg wybiera wolny.
- Wyjazd z zajezdni następuje dopiero, gdy wyjazd jest wolny („Czeka na wyjazd z zajezdni”).
- Pociągi jadące naprzeciw siebie po jednym torze zatrzymują się i blokują (jak w OpenTTD) – na liniach z ruchem w obie strony potrzebne są mijanki lub dwa tory.
- Podgląd rezerwacji: klawisz **V** (kolory pociągów; jaśniej – tor pod pociągiem, mocniej – rezerwacja przed nim).

### Tryb Amator (domyślny)
- Bezpieczne miejsce zatrzymania: **każdy zwykły kafelek toru** (z jednym elementem – nie zwrotnica, nie skrzyżowanie). Działa jak „ruchomy odstęp blokowy”: pociągi same trzymają odstęp i nigdy nie stają na rozjazdach. Gracz nie stawia semaforów.

### Tryb Ekspert
- Bezpieczne miejsce zatrzymania: **tylko przed semaforem** skierowanym w stronę jazdy (oraz koniec peronu, koniec toru, zajezdnia). Bez semaforów pociąg rezerwuje całą drogę do celu.
- Narzędzie Semafor (B, widoczne tylko w trybie Ekspert), 200 zł:
  - **ścieżkowy** – kolejne kliknięcia zmieniają kierunek: jeden → drugi → oba; od tyłu przejezdny,
  - **jednokierunkowy** – zabrania jazdy pod prąd,
  - semafor zielony, gdy pociąg zarezerwował drogę przez niego,
  - **oznaczenie kierunku:** biała strzałka na torze wskazuje kierunek jazdy, którego semafor dotyczy; słup stoi **po prawej stronie toru patrząc w kierunku jazdy**. Semafor dwukierunkowy ma dwie strzałki i dwa słupy; jednokierunkowy – podwójną strzałkę,
  - przy narzędziu żółty podgląd pokazuje stan semafora po kliknięciu.
- Rozbiórka toru usuwa jego semafory; na peronach semaforów nie ma.

Tryb przełącza się w Menu w dowolnym momencie (semafory zostają, w trybie Amator są ignorowane).

## Miasta

- Na nowej mapie 128×128 powstaje **8 miast** (fikcyjne nazwy) z 8–30 domami. Zabudowa w kwartałach – co czwarty rząd i kolumna od rynku to ulica (wolny kafelek). Przy rynku wyższe budynki (poziom domu 1–4: 20 / 45 / 80 / 140 mieszkańców).
- **Pasażerowie**: mieszkańcy / 4 na miesiąc, **poczta**: mieszkańcy / 16 na miesiąc – liczone z domów w zasięgu stacji.
- Stacja przyjmuje: pasażerów, gdy w zasięgu jest jakikolwiek dom; pocztę od 100 mieszkańców w zasięgu; towary od 200.
- **Wzrost (co miesiąc)**: miasto, z którego przewieziono pasażerów, dostaje `1 + round(3 × odsetek przewiezionych)` nowych domów i ma 40% szans na rozbudowę jednego domu. Nieobsługiwane – 10% szans na jeden dom. Nowe domy powstają obok istniejącej zabudowy, **6× chętniej w zasięgu stacji** – miasto rośnie w stronę kolei.
- Dom można wyburzyć buldożerem (500 zł). Stacja bierze nazwę od miasta w promieniu 16 kafelków (kolejne: „Główna”, „Wschód”…).

## Fabryki

### Typy (plik danych `src/data/industries.json`)
| Zakład | Produkuje | Przyjmuje | Produkcja / zapotrzebowanie na miesiąc (poziom 1) | Na mapie 128×128 |
|---|---|---|---|---|
| Kopalnia węgla | węgiel | – | 60 t | 4 |
| Kopalnia rudy | ruda | – | 50 t | 2 |
| Las | drewno | – | 50 t | 2 |
| Elektrownia | – | węgiel | 80 t | 2 |
| Huta | towary (40) | ruda, węgiel | 50 t każdego | 1 |
| Tartak | towary (35) | drewno | 50 t | 1 |

Produkcja i zapotrzebowanie rosną liniowo z poziomem (1–5). Zakłady startują na poziomie 1–2; nie da się ich zburzyć.

### Wskaźnik zaopatrzenia
Średnia z ostatnich **3 miesięcy gry**:
- zakład pierwotny: `wywiezione / wyprodukowane`,
- przetwórnia: średnia z `min(1, dostarczone / zapotrzebowanie)` po wszystkich surowcach.

### Wzrost i spadek – progi z histerezą

| Zaopatrzenie | Efekt (co miesiąc) |
|---|---|
| **≥ 75%** | +1 punkt rozwoju |
| **50% – 75%** | stabilnie (bez zmian) |
| **≤ 50%** | −1 punkt rozwoju |

- **12 punktów** = poziom w górę, **−12** = poziom w dół (≈ rok gry przy stałej sytuacji). Pas 50–75% to strefa neutralna.
- Poziom nie spada poniżej 1 ani nie rośnie ponad 5. Zamykania zakładów nie ma.
- Przetwórnia bez dostaw pracuje na **30% mocy**, przy pełnym zaopatrzeniu na 100% (liniowo).

## Ładunki i stacje

- Stacja zbiera ładunek z zakładów i domów w zasięgu **dopiero, gdy zatrzyma się na niej pociąg z pasującym wagonem**; obsługa wygasa po 60 dniach bez takiego pociągu.
- **Ocena stacji** (ile produkcji trafia na stację): 95% przy kursach co ≤ 7 dni, spada do 40% przy 60 dniach; −15%, gdy czeka ponad 500 jednostek. Kilka stacji przy jednym zakładzie dzieli się produkcją proporcjonalnie do ocen. Na stacji czeka maksymalnie 4000 jednostek.
- Na stacji pociąg **rozładowuje** to, co stacja przyjmuje (i co nie zostało załadowane tutaj), potem **ładuje** czekający ładunek; przed odjazdem dobiera to, co przybyło w czasie postoju. W jednym wagonie nie miesza się ładunku z różnych stacji.
- Okno stacji (klik): co czeka, ocena, co stacja przyjmuje. Przy stawianiu stacji podpowiedź: „Zbiera: … · Przyjmuje: …”.

## Ruch lokalny AI

- Autobusy, ciężarówki i auta **są wyłącznie dekoracją**. Jeżdżą po drogach miasta i w okolicach stacji, ich liczba luźno zależy od wielkości miasta / aktywności stacji.
- **Nie mają związku z liczbą pasażerów ani ładunku** – te liczone są abstrakcyjnie przez zasięg stacji.
- Nie uczestniczą w symulacji (żyją w `render/` lub w osobnym, niedeterministycznym module kosmetycznym), nie trafiają do zapisu gry.
- Można je wyłączyć w ustawieniach (wydajność).

## Ekonomia gracza

- **Przychód za dostawę** = `ilość × stawka × odległość między stacjami (kafelki) × współczynnik czasu`. Pełna stawka do „szybkiego” czasu przewozu, potem spada liniowo przez 60 dni do 30%.

  | Ładunek | Stawka (zł / jedn. / kafelek) | Pełna stawka do (dni) |
  |---|---|---|
  | pasażerowie | 3,0 | 10 |
  | poczta | 4,5 | 8 |
  | węgiel | 1,8 | 30 |
  | ruda | 1,9 | 30 |
  | towary | 3,2 | 15 |
  | drewno | 1,7 | 30 |

- **Koszty miesięczne**: eksploatacja pociągów poza zajezdnią (1/12 kosztu rocznego: Iskra 1200, Grom 1800, Strzała 2600, wagon 120 zł/rok); utrzymanie: 2 zł za element toru, 10 zł za kafelek peronu, 30 zł za zajezdnię, 1 zł za semafor.
- **Okno finansów** (klik na pieniądze): przewozy, pociągi, utrzymanie, budowa i zakupy (po zwrotach) – bieżący miesiąc i poprzednie.
- Kredytu i bankructwa na razie nie ma – przy braku pieniędzy nie da się budować ani kupować.
