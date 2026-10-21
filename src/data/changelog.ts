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
