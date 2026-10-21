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
