/**
 * HISTORIA ZMIAN – okno „Co nowego” w Menu. Najnowsze na górze.
 * Pisana dla gracza (co może zrobić), nie dla programisty. Przy każdej nowej funkcji dopisujemy wpis.
 */
export interface ChangelogEntry {
  /** Data w formacie RRRR-MM-DD. */
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: '2026-10-30',
    title: 'Kościoły i parki także w starszych miastach',
    items: [
      'Miasta z gier zaczętych przed pojawieniem się kościołów i ozdób nie miały na nie miejsca – centrum było już zabudowane. Teraz po zakończeniu miesiąca najmniejszy dom przy rynku przebudowuje się na kościół, a z czasem i na park, staw, pomnik albo fontannę.',
      'Przebudowa przechodzi przez etapy budowy (wykop, rusztowanie, stan surowy), więc widać, gdzie się dzieje.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Wielkość interfejsu dla różnych ekranów',
    items: [
      'Menu → Widok → Interfejs: 60%, 80%, 100% albo 120%. Mniejsze mieszczą menu, okna i panele na ekranie laptopa, 120% przydaje się na dużym monitorze. Mapa się nie zmienia.',
      'Na niskim ekranie gra przy pierwszym uruchomieniu sama wybiera 80%; wybór zapamiętuje przeglądarka.',
      'Menu wyższe niż ekran można przewijać – nie ucieka już za dolną krawędź.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Pracownicy: zakłady rosną do poziomu 7',
    items: [
      'Kopalnia, las czy fabryka na poziomie 5 może urosnąć jeszcze o dwa poziomy (do 7) – ale tylko z pracownikami. Stacja przy takim zakładzie przyjmuje pasażerów, nawet gdy obok nie ma domów, a każdy, kto wysiądzie, idzie do pracy.',
      'Potrzeba 50 pracowników na każdy poziom zakładu na miesiąc (250 na poziomie 5, 300 na 6). W oknie zakładu widać, ilu dowiozłeś w tym miesiącu i ilu trzeba.',
      'Bez kompletu pracowników zakład na poziomie 6–7 co miesiąc traci punkt rozwoju i po roku spada o poziom (nie niżej niż 5). Nowy powód, żeby wozić ludzi z miast do zakładów.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Ocena stacji jak w OpenTTD',
    items: [
      'Ocena stacji to teraz suma punktów jak w OpenTTD: liczy się, ile dni minęło od ostatniego załadunku, prędkość maksymalna ostatniego pociągu (ponad 85 km/h), ile ładunku czeka na peronie i wiek lokomotywy (nowa – do 3 lat – daje premię).',
      'Ocena nie skacze, tylko co dzień zbliża się o punkt do tej sumy – w oknie stacji strzałka ↑/↓ pokazuje, w którą stronę idzie, a po najechaniu widać wszystkie składniki.',
      'Stare, wolne parowozy dają około 69% nawet przy częstych kursach; szybka, nowa lokomotywa – ponad 90%. To powód, żeby wymieniać tabor. Wczytany zapis zaczyna od dotychczasowej oceny i powoli przechodzi na nową.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Trasy pociągów jeszcze bliżej OpenTTD',
    items: [
      'Na linii dwutorowej z semaforami ścieżkowymi pociąg trzyma się swojego toru – jazda pod prąd przez semafor liczy się jak 15 kafelków nadłożonej drogi, więc nie wjeżdża na tor przeciwny bez wyraźnego powodu.',
      'Tryb Ekspert: pociąg wybiera trasę z mniejszą liczbą łuków i bez podjazdów – ciężki skład objedzie pagórek płaską trasą, jeśli taka jest.',
      'Zajęty peron odstrasza bardziej (jak w OpenTTD), a pociąg stojący daleko – za kilkoma semaforami – nie zmienia już wyboru trasy: zanim tam dojedziesz, zwykle odjedzie.',
      'Trasy liczą się sprytniej (szukanie w stronę celu), co przyda się na dużych mapach.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Zgubione pociągi i nazwa firmy',
    items: [
      'Trasy jak w OpenTTD: pociąg omija stacje, które nie są jego celem (jeśli ma obok obwodnicę lub mijankę), a na stacji docelowej wybiera peron pasujący do długości składu – długi skład bierze długi peron, krótki zostawia go innym.',
      'Semafory jednokierunkowe: przy narzędziu Semafor (B) każdy pokazuje żółtą strzałkę – w tę stronę wolno jechać. Podgląd przed kliknięciem też ją ma.',
      'Pociąg, który od kilku dni nie może dojechać do celu (brak toru, semafor jednokierunkowy pod prąd, zły rozkład), zgłasza się komunikatem – „Pokaż ›” przenosi do niego i otwiera jego okno.',
      'Nazwa firmy: wpisujesz ją przy nowej grze, widać ją na górnym pasku i w oknie Finanse (tam też ją zmienisz), a eksportowany zapis ma ją w nazwie pliku.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Poprawka: semafory na prostych torach',
    items: [
      'Semafor na prostym torze biegnącym na ekranie z lewej góry w prawy dół (oś X) był rysowany odwrotnie, niż działał – jednokierunkowy ustawiony „na oko” blokował pociągi (np. metro na jednotorowym ringu stawało). Teraz grafika pokazuje kierunek, który obowiązuje.',
      'W starszych zapisach takie semafory mogą teraz wyglądać na odwrócone – to ich prawdziwy kierunek; kliknij je narzędziem Semafor, żeby zmienić.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Miasta: budowa domów, kościoły, parki i nowe budynki',
    items: [
      'Nowy i rozbudowywany dom najpierw się buduje: wykop, rusztowanie, stan surowy, po kilka dni każdy etap – widać, gdzie miasto rośnie.',
      'Przy rynku staje kościół (jeden na miasto), a z rzadka park, staw, pomnik albo fontanna. Nie mają mieszkańców – liczba domów i mieszkańców w oknie miasta ich nie liczy.',
      '13 nowych domów i drugi kościół – budynki z klimatu subarktycznego spod linii śniegu (kamienice, wieżowce, domki), więc miasta są mniej jednakowe.',
    ],
  },
  {
    date: '2026-10-28',
    title: 'Fundamenty pod torami na zboczach',
    items: [
      'Tory w poprzek zbocza, łuki i rozjazdy na zboczu można już budować – stoją na kamiennym fundamencie, jak w OpenTTD. Kafelek podnosi się do najwyższego narożnika, a prosty tor przy jednym podniesionym narożniku dostaje fundament pochyły, równo pod górę.',
      'Fundament kosztuje 250 zł za kafelek (do ceny torów), płaci się raz – kolejne tory na tym samym fundamencie tylko w cenie toru. Podgląd budowy pokazuje koszt z fundamentem.',
      'Nie da się, gdy tor kończyłby się uskokiem nad niższym sąsiadem, ani na stromym zboczu.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Pomoc uzupełniona',
    items: [
      'Nowy temat w Pomocy (H): Metro (poziom −1) – tory, zjazdy, stacje, przesiadki, semafory i zapotrzebowanie miast w jednym miejscu.',
      'Sterowanie: klawisze Q (metro), J (zjazd), U (widok bez budynków) i Y (badania). Uzupełnione też tematy o ładunku (kolejka na stacji), sygnalizacji i finansach.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Metro: semafory, minimapa, duże miasta',
    items: [
      'Semafory pod ziemią: na poziomie −1 narzędzie Semafor stawia je na torach i peronach metra (w widoku −1 widać tylko semafory metra, na powierzchni – tylko te z góry).',
      'Metro na minimapie – tory i stacje metra rysowane na niebiesko.',
      'Duże miasta domagają się metra: od 5 000 mieszkańców pojawia się komunikat, a w oknie miasta napis o metrze. Stacja metra w mieście przyspiesza jego wzrost i rozbudowę domów; bez metra miasto powyżej 10 000 mieszkańców przestaje rosnąć.',
      'Zajezdnie zostają na powierzchni – pociągi zjeżdżają do metra zjazdem.',
      'Miasta bez kolei rosną dużo wolniej (3% szans na nowy dom w miesiącu zamiast 10%) – po 40 latach nie mają już po 3 tys. mieszkańców. Miasta, które obsługujesz, rosną jak dotąd.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Badania',
    items: [
      'Nowe okno Badania (🔬 na górnym pasku albo Y): ulepszenia za pieniądze i czas – większe wagony, szybsze pociągi, sprawny załadunek, tańsze utrzymanie, lepsza obsługa stacji i prototypy lokomotyw (nowe modele 2 lata wcześniej).',
      'Jedno badanie naraz, płatne z góry (od 300 000 zł za pierwszy poziom – to inwestycja na dalszą grę); każdy kolejny poziom 2× droższy i dłuższy. Przerwanie zwraca połowę ceny. Efekty działają od razu na wszystkie pociągi i stacje.',
      'Metro ma teraz koszty utrzymania (tory i perony pod ziemią – dwa razy więcej niż na powierzchni).',
      'Kopalnie i inne zakłady nie wychodzą już nad domy i drzewa stojące przed nimi – są rysowane razem z mapą, w tej samej kolejności co budynki.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Poprawki: załadunek, semafory, mniej pasażerów',
    items: [
      'Kolejka na stacji: kto pierwszy przyjechał, ten pierwszy się ładuje. Pociąg, który dojechał później, nie podbiera ładunku temu, który już czeka (np. na pełny ładunek) – pierwszy zapełnia się i odjeżdża pierwszy.',
      'Semafory w grafice TTD stoją teraz właściwie – światła patrzą na nadjeżdżający pociąg (wcześniej były odwrócone). Podgląd w narzędziu Semafor pokazuje ten sam obrazek.',
      'Miasta dają o połowę mniej pasażerów i poczty – na stacjach nie zbierają się już dziesiątki tysięcy czekających.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Metro: przesiadki',
    items: [
      'Peron metra postawiony w zasięgu stacji na powierzchni dołącza do niej (i odwrotnie) – jedna stacja, wspólny ładunek, pasażerów i towary odbierają pociągi na obu poziomach.',
      'Jak na powierzchni: przełącznik „osobna stacja” (albo Ctrl / Shift) stawia osobną stację mimo zasięgu. Podgląd budowy pokazuje „Przesiadka: …”.',
      'Przycisk 🏠 na górnym pasku po włączeniu świeci na żółto, jak inne przełączniki.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Metro – poziom −1 (pierwsza wersja)',
    items: [
      'Przełącznik poziomu nad narzędziami budowy (albo Q): na poziomie −1 powierzchnia jest przyciemniona, ale jej obrysy zostają widoczne, więc łatwo się zlokalizować.',
      'Pod ziemią narzędzie Tory buduje tory metra – pod miastem, pod jeziorem, bez oglądania się na teren. Rozbiórka działa tak samo.',
      'Nowe narzędzie Zjazd metra (J): na płaskim kafelku tor schodzi do wykopu i dalej pod ziemię. Pociągi same wybierają trasę przez metro, jeśli jest krótsza.',
      'Stacje metra: na poziomie −1 narzędzie Stacja stawia perony pod ziemią – pod samym centrum miasta, bez burzenia domów. Mają zasięg jak zwykła stacja i nazwę „… Metro”.',
      'Pociąg w metrze widać tylko w widoku −1; tam też klikasz stacje metra (okno stacji, rozkład jazdy).',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Zajezdnia jak w OpenTTD',
    items: [
      'Pociągi w zajezdni to rzędy z lokomotywą i wagonami narysowanymi z boku; osobny rząd „Wolne wagony”.',
      'Pojazdy przeciągasz myszą: wagon na inny pociąg, do wolnych wagonów albo do kosza (sprzedaż). Klik też działa.',
      'Jedno miejsce zakupu – „Nowe pojazdy”: lista lokomotyw i wagonów z opisem. Lokomotywa to nowy pociąg, wagon trafia od razu do wybranego pociągu albo do wolnych. Druga lokomotywa (podwójna trakcja) – tam samo.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Ukośne tory na zboczach',
    items: [
      'Ukośny tor można położyć na zboczu, jeśli biegnie poziomo – np. wzdłuż płaskiej połówki kafelka z jednym podniesionym narożnikiem. Wcześniej ukosy szły tylko po płaskim.',
      'W oknie pociągu opcje stacji w rozkładzie (bez zatrzymania, postój, pełny ładunek) są w drugiej linii – nie nachodzą już na nazwę stacji.',
    ],
  },
  {
    date: '2026-10-25',
    title: 'Nowa grafika w stylu TTD',
    items: [
      'Mapa wygląda jak w klasycznym Transport Tycoon: trawa, zbocza, woda z brzegami, lasy i pojedyncze drzewa (grafika OpenGFX).',
      'Miasta mają prawdziwe domy, biurowce i kościoły – ich wygląd zależy od wielkości domu i roku gry (bez wieżowców w 1900).',
      'Tory, rozjazdy, skrzyżowania, perony z dachami i budynkiem stacji, zajezdnie i semafory w stylu TTD.',
      'Kopalnie, elektrownie, huty, tartaki i lasy z oryginalnych kafelków; pociągi, autobusy, furgonetki i ciężarówki z prawdziwymi sylwetkami – lokomotywa i jej wagony mają wspólny kolor.',
      'Stalowe mosty kratownicowe z filarami, wjazdy do tuneli w zboczu i sieć trakcyjna ze słupami jak w TTD.',
      'Pociąg przy peronie chowa się pod zadaszeniem, a domy i zakłady przed nim go zasłaniają (np. chłodnie elektrowni).',
      'Menu → Widok → Grafika: powrót do prostych kształtów (np. na słabszym komputerze).',
      'Przycisk 🏠 na górnym pasku (albo klawisz U, Menu → Widok → Budynki) ukrywa domy, zakłady, drzewa i dachy peronów – widać tory, które zasłaniały.',
      'Domy nie zmieniają już wyglądu co rok – każdy ma swój budynek, który zmienia się dopiero przy rozbudowie.',
      'Budynki w miastach nie „przeskakują” już przy jadących autach i pociągach – wcześniej domy z tyłu potrafiły wyskoczyć nad te z przodu i miasto zdawało się ciągle zmieniać. Auta i pociągi są teraz rysowane razem, w jednej kolejności z budynkami.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'Przesuwane i zwijane panele',
    items: [
      'Górny pasek, menu budowania i podpowiedzi przeciągasz za uchwyt ⠿ – układ zostaje zapamiętany.',
      'Zwijanie: pasek do samej daty i kwoty, menu budowania do samych ikon, podpowiedzi do małej zakładki.',
      'Podpowiedzi można wyłączyć (krzyżyk albo Menu → Widok); tam też „Przywróć układ paneli”.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'Równe łączenia torów',
    items: [
      'Tory na zakrętach (prosta przechodząca w ukos) łączą się teraz bez szczelin i przesunięć – szyny i podsypka schodzą się na styku, także przy wjeździe na most i do tunelu.',
      'Na rozjazdach szyny obu torów leżą na wspólnej podsypce – odgałęzienie nie zasłania już szyn toru głównego, niezależnie od tego, w którą stronę odchodzi.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'Pomoc: semafory ścieżkowe a jednokierunkowe',
    items: [
      'W Pomocy (Sygnalizacja) jest tabela i schematy, czym różnią się semafory ścieżkowe od jednokierunkowych – i kiedy którego użyć (mijanka, linia dwutorowa).',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Przejazdy kolejowo-drogowe',
    items: [
      'Miasta same prowadzą ulice przez tory – przez prosty tor poprzeczny do ulicy powstaje przejazd, więc dzielnice za torami dostają połączenie z resztą miasta.',
      'Pociągi mają pierwszeństwo: auta i autobusy przejeżdżają przez tor, ale nigdy nie zatrzymują pociągów.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Poprawka: miasta za torami',
    items: [
      'Miasta rozrastają się za torami – także za skośnymi i podwójnymi liniami. Dotąd tor (zwłaszcza skośny) zamykał zabudowie drogę.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Bez zatrzymania i punkty kontrolne',
    items: [
      'W rozkładzie przy każdej stacji ptaszek „bez zatrzymania”: pociąg przejeżdża przez stację i jedzie do następnej pozycji. Status: „Jedzie przez”.',
      'Punkt kontrolny (narzędzie Stacja → „Punkt kontrolny”, klik na prosty tor, 500 zł): dodany do rozkładu wymusza jazdę tym torem, np. przez wybraną mijankę albo objazd. Pociąg się na nim nie zatrzymuje, punkt nie zbiera ładunku. Buldożer usuwa sam znacznik – tor zostaje.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Poprawka: wyjazd z zajezdni',
    items: [
      'Po kliknięciu ▶ w oknie zajezdni widać, że pociąg czeka na wyjazd (status i podświetlony przycisk „■ Anuluj”, który odwołuje wyjazd).',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Podwójna trakcja',
    items: [
      'Pociąg może mieć dwie takie same lokomotywy: 2× moc i przyczepność, więc ciężki skład szybciej się rozpędza i lepiej radzi sobie pod górę. Prędkość maksymalna się nie zmienia, cena i utrzymanie lokomotyw – 2×.',
      'Przy zakupie: ptaszek „Podwójna trakcja”. W zajezdni: „+ 2. lokomotywa” / „− 2. lokomotywa” przy pociągu. Kopia pociągu i wymiana lokomotywy obejmują obie.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Rozkład czasowy i równe odstępy',
    items: [
      'Przy każdej stacji rozkładu: dodatkowy postój 1–30 dni.',
      '„Równe odstępy na linii” (wspólny rozkład): gra mierzy czas okrążenia i na pierwszej stacji wypuszcza pociągi co okrążenie / liczba pociągów – koniec jazdy „stadem”. Status: „Czeka na odstęp”.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Poprawka: pociągi pod mostami',
    items: ['Pociąg jadący torem pod mostem jest teraz rysowany pod pomostem, a nie nad nim.'],
  },
  {
    date: '2026-10-21',
    title: 'Długość pociągów i peronów',
    items: [
      'Każdy pojazd zajmuje pół kafelka: na kafelku mieści się lokomotywa z wagonem albo dwa wagony.',
      'Pociąg dłuższy niż peron ładuje się dłużej – proporcjonalnie do tego, ile wystaje (najwyżej 2×). Status: „peron za krótki – dłuższy postój”.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Wspólne rozkłady',
    items: [
      '„⧉ Kopiuj” tworzy pociąg ze wspólnym rozkładem: dodanie lub usunięcie stacji albo ptaszek pełnego ładunku w jednym zmienia całą linię. Każdy pociąg jedzie we własnym tempie.',
      '„⧉ osobny” – kopia z niezależnym rozkładem (jak dotąd). „Odłącz” w oknie pociągu – pociąg dostaje własną kopię rozkładu.',
      'Na liście pociągów znaczek ⇄N przy pociągach na wspólnym rozkładzie.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Niższe stawki za przewóz',
    items: [
      'Wszystkie stawki za przewóz niższe o 20% – po 10 latach gry pieniądze rosły za szybko. Aktualne stawki: Pomoc → „Za co płacą”.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Poprawka: rozbiórka mostów i tuneli',
    items: [
      'Buldożer na przyczółku mostu (albo wejściu do tunelu) znowu rozbiera cały most / tunel – wcześniej próbował rozebrać sam tor rampy. Podgląd pokazuje „Rozbierz most · zwrot”.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Lepsza minimapa',
    items: [
      'Minimapę przeniesiesz w dowolne miejsce, łapiąc za nagłówek; zoom − / + (do 8×) pokazuje okolicę kamery.',
      '⛶ – duża mapa z nazwami miast; ☰ – legenda z filtrami: każdy typ zakładu w swoim kolorze, „tylko” pokazuje sam ten typ (np. wszystkie kopalnie węgla), do tego miasta, tory i pociągi.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Lista pociągów, zyski i grupy',
    items: [
      'Okno „🚆 Pociągi” (K): wszystkie pociągi z zyskiem w tym i zeszłym roku, wiekiem i statusem; sortowanie po kliknięciu w nagłówek, filtr „tylko na minusie”.',
      'Grupy pociągów (np. „Węgiel”, „Pasażerskie”) – filtr listy; grupę ustawisz w liście albo w oknie pociągu. Kopia pociągu trafia do tej samej grupy.',
      'Na początku roku komunikat o pociągach, które w zeszłym roku przyniosły stratę; w liście są oznaczone na czerwono.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Nowa gra – tryb własny',
    items: [
      'Przełącznik „Gęstość / Własne”: w trybie własnym podajesz dokładnie, ile ma być miast i zakładów każdego typu (np. 0 miast, 1 elektrownia, 10 kopalń węgla). Położenie losuje się z ziarna mapy.',
      'Gdy czegoś nie da się zmieścić na mapie, gra mówi po starcie, ile się zmieściło.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Droższe kształtowanie terenu',
    items: [
      'Zmiana wysokości narożnika kosztuje 150 zł zamiast 30 zł – przekopywanie wzgórz i zasypywanie dolin to teraz odczuwalny wydatek; czasem taniej zbudować most albo tunel.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Numery zajezdni na mapie',
    items: ['Nad każdą zajezdnią podpis „Zajezdnia #N” – ten sam numer co w oknie zajezdni i komunikatach.'],
  },
  {
    date: '2026-10-21',
    title: 'Gęstość miast, kopalń i przemysłu',
    items: [
      'Nowa gra: osobno dla miast, kopalń i lasów oraz przemysłu – brak, mało, normalnie albo dużo (dotychczasowe mapy to „dużo”). Okno pokazuje, co powstanie.',
      'Np. bez miast, z jedną elektrownią i mnóstwem kopalń – czysto towarowa gra.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Rozbudowa stacji',
    items: [
      'Peron dobudowany tuż przy stacji ją rozbudowuje – ta sama nazwa, ładunek i rozkłady, większy zasięg. Podgląd pokazuje „Rozbudowa: …”.',
      'Ctrl albo Shift przy budowie (albo przełącznik „Osobna” w panelu) – osobna stacja obok.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Magazyn wagonów w zajezdni',
    items: [
      'Pociągi w oknie zajezdni pokazują skład. Klik na wagon odpina go do magazynu zajezdni, a klik na wagon w magazynie doczepia go do wybranego pociągu (z ładunkiem).',
      'Wagony można kupić prosto do magazynu i sprzedać z niego pojedynczo (zwrot 75%).',
      '„Sprzedaj lokomotywę” – lokomotywa idzie na sprzedaż, a wagony zostają w magazynie; samą lokomotywę kupisz jako pociąg bez wagonów.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Czekaj na pełny ładunek',
    items: [
      'W rozkładzie jazdy ptaszek „pełny ładunek” przy każdej stacji, osobno dla każdego pociągu: pociąg nie odjedzie, dopóki nie napełni wagonów na ładunek tej stacji.',
      'Wagony na ładunek, którego stacja nie zbiera (np. pocztowy przy kopalni), nie wstrzymują odjazdu.',
      'Inne pociągi omijają peron z pociągiem czekającym na pełny ładunek – wybierają wolny peron, w kolejkę ustawiają się tylko, gdy innej drogi nie ma.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Kopiowanie pociągów',
    items: [
      'Okno pociągu → „⧉ Kopiuj”: taki sam pociąg (lokomotywa, wagony, rozkład) staje w zajezdni – wystarczy kliknąć „▶ Wyjedź”.',
      'W oknie zajezdni „⧉” przy każdym pociągu. Kopia trafia do zajezdni, w której kupiono oryginał (gdy jej nie ma – do najbliższej).',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Więcej nazw miast',
    items: [
      'Duże mapy dostają polsko brzmiące nazwy z generatora (np. Gajice Dolne, Stara Wrzosówka, Boguszany nad Wilgą) zamiast „Osiedle 1, 2, 3…” – tysiące niepowtarzalnych nazw.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Pomoc i historia zmian',
    items: [
      'Pomoc (H albo „?” na górnym pasku): opis całej gry – od pierwszego toru po kredyt.',
      'Okno „Co nowego” w Menu – właśnie je czytasz. Kropka przy Menu oznacza nowości od ostatniej wizyty.',
      'W oknach miasta, zakładu, stacji i finansów link do odpowiedniej strony pomocy.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Wymiana lokomotyw',
    items: [
      'Okno pociągu → Lokomotywa: wybierz nowszą i kliknij „Wymień” – pociąg sam zjedzie do zajezdni, wymieni lokomotywę i wróci na trasę. Wagony i rozkład zostają.',
      '„Wymień we wszystkich” – to samo dla każdego pociągu z tą samą lokomotywą.',
      'Zwrot za starą lokomotywę zależy od wieku: 75% ceny dla nowej, 10% po 50 latach (także przy sprzedaży).',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Lokomotywy z biegiem lat i sieć trakcyjna',
    items: [
      '13 lokomotyw od 1900 do 2005: parowe → spalinowe → elektryczne, aż do 250 km/h. Stare modele są z czasem wycofywane.',
      'Wybór roku startu w nowej grze: 1900, 1925, 1950, 1975 albo 2000.',
      'Narzędzie Trakcja (E): sieć trakcyjna nad torami – lokomotywy elektryczne jeżdżą tylko pod nią.',
      'Na początku roku komunikat o nowych lokomotywach; w zajezdni znaczki „nowość” i „wkrótce wycofana”.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Kredyt i bankructwo',
    items: [
      'Kredyt w oknie Finanse (klik na kwotę): do 300 000 zł, odsetki 5% rocznie.',
      'Trzy miesiące z rzędu na minusie = bankructwo i koniec gry. Wcześniej ostrzeżenia.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Minimapa, pierwsze kroki, ciężarówki',
    items: [
      'Minimapa w lewym górnym rogu – klik przenosi kamerę; widać pociągi.',
      'Panel „Pierwsze kroki” prowadzi przez pierwszy zarobiony kurs.',
      'Ciężarówki w miastach przy zakładach; auta i pociągi chowają się za domami.',
    ],
  },
  {
    date: '2026-10-19',
    title: 'Drogi, ruch w miastach i duże mapy',
    items: [
      'Miasta budują drogi; jeżdżą po nich auta i autobusy (dekoracja – można wyłączyć w Menu).',
      'Wybór rozmiaru mapy przy nowej grze, aż do testowej 1024×1024; zoom do 0,125×.',
      'Zakleszczone pociągi same zawracają; przycisk „Zawróć” w oknie pociągu.',
      'Woda jak w OpenTTD: morze tylko poniżej poziomu zero.',
    ],
  },
  {
    date: '2026-10-18',
    title: 'Teren, mosty i tunele',
    items: [
      'Teren z wysokościami; pociągi zwalniają pod górę.',
      'Narzędzie Teren (L): podnoszenie, obniżanie i wyrównywanie.',
      'Mosty (M) i tunele (N).',
      'Rozbiórka pojedynczego elementu toru; zapis pamięta pozycję kamery.',
    ],
  },
  {
    date: '2026-10-18',
    title: 'Gospodarka w czasie',
    items: [
      'Zakłady rosną i upadają zależnie od tego, ile od nich wywozisz / do nich dowozisz.',
      'Miasta rosną szybciej, gdy obsługuje je kolej – w stronę stacji.',
      'Koszty utrzymania torów i pociągów; okno Finanse z bilansem miesięcy.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Miasta, przemysł i zarabianie',
    items: [
      'Miasta i zakłady na mapie, przewóz pasażerów, poczty i towarów.',
      'Zapłata zależy od ilości, odległości i czasu przewozu.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Pociągi i sygnalizacja',
    items: [
      'Zajezdnie z wyborem kierunku wjazdu, zakup lokomotyw i wagonów.',
      'Ruch pociągów po rozkładzie jazdy.',
      'Sygnalizacja: Amator (pociągi same trzymają odstęp) albo Ekspert (semafory stawiasz sam).',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Pierwsza wersja',
    items: ['Mapa izometryczna, budowa torów i stacji, zapis gry w przeglądarce i do pliku.'],
  },
];
