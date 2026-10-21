/**
 * POMOC (wiki w grze) – okno „Pomoc” (H). Liczby pochodzą z plików danych (ekonomia, pojazdy, zakłady),
 * więc po strojeniu opis aktualizuje się sam. Tekst `**tak**` jest pogrubiony.
 */
import { CARGO_DEFS } from '../sim/economy/cargo';
import { INDUSTRY_DEFS } from '../sim/economy/industry';
import {
  CATCHMENT_RADIUS,
  MAX_BRIDGE_LENGTH,
  MAX_TUNNEL_LENGTH,
  MAX_WAGONS,
  STATION_MAX_LENGTH,
  STATION_MAX_PLATFORMS,
} from '../sim/config';
import { ENGINES, TRACTION_NAMES } from '../sim/trains/vehicles';
import { ECONOMY } from './economy';

export type HelpBlock = string | { list: string[] } | { table: { head: string[]; rows: string[][] } };

export interface HelpTopic {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

const E = ECONOMY;
const zl = (v: number) => `${v.toLocaleString('pl-PL')} zł`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const cargoName = (c: string) => CARGO_DEFS[c as keyof typeof CARGO_DEFS].name;

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'start',
    title: 'Jak zacząć',
    blocks: [
      'Iron Hub to gra o kolei: budujesz tory i stacje, kupujesz pociągi i zarabiasz na przewozie pasażerów i ładunków. Miasta i zakłady rozwijają się dzięki Twojej kolei.',
      '**Pierwszy zarobek** (panel „Pierwsze kroki” prowadzi krok po kroku):',
      {
        list: [
          'Znajdź **kopalnię węgla** i **elektrownię** 20–40 kafelków od siebie – to najprostsza dochodowa linia. Albo dwa miasta (pasażerowie).',
          'Zbuduj tor między nimi (Tory, T) i po stacji przy każdym końcu (Stacja, P) – niebieski zasięg musi objąć zakład lub domy.',
          'Postaw zajezdnię przy torze (Zajezdnia, Z), kliknij ją i kup lokomotywę z węglarkami.',
          'W oknie pociągu: „+ Dodaj stacje”, kliknij obie stacje, „Gotowe”, potem „▶ Wyjedź”.',
          'Przyspiesz grę (2–4) i obserwuj, jak nad stacją pojawiają się zarobione pieniądze.',
        ],
      },
      'Dalej: więcej pociągów na dobrych liniach, łańcuchy dostaw (ruda + węgiel → huta → towary do miasta), szybsze lokomotywy z biegiem lat.',
    ],
  },
  {
    id: 'controls',
    title: 'Sterowanie',
    blocks: [
      {
        table: {
          head: ['Klawisz / mysz', 'Działanie'],
          rows: [
            ['przeciąganie, WASD, strzałki', 'przesuwanie mapy (prawy przycisk – także przy narzędziach)'],
            ['kółko myszy', 'zoom (0,125× – 4×)'],
            ['klik na minimapie', 'skok w to miejsce'],
            ['spacja / 1–4', 'pauza / prędkość 1×, 2×, 4×, 8×'],
            ['Esc', 'anuluj, zamknij okno, kursor'],
            ['T, P, Z, E, L, M, N, X', 'Tory, Stacja, Zajezdnia, Trakcja, Teren, Most, Tunel, Rozbiórka'],
            ['B', 'Semafor (tylko w trybie Ekspert)'],
            ['R', 'obrót stacji / wjazdu zajezdni'],
            ['V', 'podgląd rezerwacji torów'],
            ['G', 'podgląd grafu torów (dla ciekawych)'],
            ['H', 'ta pomoc'],
          ],
        },
      },
      'Klik kursorem na pociąg, stację, zajezdnię, miasto lub zakład otwiera jego okno. Klik na kwotę na górnym pasku – finanse.',
    ],
  },
  {
    id: 'tracks',
    title: 'Tory, mosty, tunele',
    blocks: [
      `Tory (T): przeciągnij wzdłuż osi albo po skosie; pozycja kursora w pierwszym kafelku wybiera łuk. Linia powstaje w całości albo wcale (czerwony podgląd = coś blokuje). ${zl(E.construction.trackPiece)} za element toru. Nie ma skrętów o 90° – skręca się łukami.`,
      'Na zboczu tylko prosty tor w górę zbocza; łuki, stacje i zajezdnie tylko na płaskim. Pod górę pociąg zwalnia, z górki przyspiesza.',
      `Usuwanie: Tory → Usuń albo Rozbiórka (X). Klik – jeden element pod kursorem, przeciągnięcie – odcinek. Zwrot ${pct(E.refunds.demolition)}. Toru pod pociągiem nie rozbierzesz.`,
      `**Most** (M): przeciągnij od przyczółka do przyczółka, do ${MAX_BRIDGE_LENGTH} kafelków, ${zl(E.construction.bridgeTile)} za kafelek. Przyczółki na tej samej wysokości, pod mostem teren niżej (woda, inne tory).`,
      `**Tunel** (N): kliknij zbocze – tunel biegnie prosto do zbocza po drugiej stronie na tej samej wysokości. Do ${MAX_TUNNEL_LENGTH} kafelków, ${zl(E.construction.tunnelTile)} za kafelek.`,
      `**Teren** (L): podnieś / obniż narożnik albo wyrównaj prostokąt; ${zl(E.construction.terraformCorner)} za narożnik. Pod torami, budynkami i drogami terenu nie zmienisz. Woda jest tylko na najniższym poziomie – podniesienie dna zamienia ją w ląd.`,
    ],
  },
  {
    id: 'stations',
    title: 'Stacje i zasięg',
    blocks: [
      `Stacja (P): przeciągnij prostokąt – dłuższy bok to długość peronu, krótszy liczba torów (max ${STATION_MAX_LENGTH} × ${STATION_MAX_PLATFORMS}). Można ją postawić na pustym terenie albo na prostym torze. ${zl(E.construction.stationTile)} za kafelek.`,
      `**Zasięg** (niebieskie pole, ${CATCHMENT_RADIUS} kafelki od peronów): stacja zbiera pasażerów i pocztę z domów oraz ładunek z zakładów w zasięgu i dostarcza do nich. Przy stawianiu podpowiedź pokazuje „Zbiera: … · Przyjmuje: …”.`,
      `Stacja przyjmuje pasażerów, gdy w zasięgu jest jakikolwiek dom; pocztę od ${E.town.acceptance.mail} mieszkańców, towary od ${E.town.acceptance.goods}. Węgiel, rudę i drewno – gdy w zasięgu jest zakład, który ich potrzebuje.`,
      '**Rozbudowa**: peron postawiony tuż obok stacji (bokiem przylega do jej peronu) staje się jej częścią – ta sama nazwa, czekający ładunek i rozkłady, zasięg rośnie. Tak dokładasz kolejne tory, gdy stacja nie nadąża. Ctrl albo Shift przy budowie (albo „Osobna” w panelu) stawia osobną stację.',
      'Pociąg staje czołem na końcu peronu. Peron powinien mieścić cały skład (długość pokazuje okno zajezdni).',
    ],
  },
  {
    id: 'rating',
    title: 'Ładunek na stacji i ocena',
    blocks: [
      `Stacja zaczyna zbierać ładunek dopiero, gdy zatrzyma się na niej pociąg z pasującym wagonem. Bez takiego pociągu przez ${E.station.serviceDays} dni przestaje zbierać.`,
      `**Ocena stacji** mówi, jaka część produkcji trafia na stację: ${pct(E.station.ratingMax)} przy kursach co ${E.station.frequentDays} dni lub częściej, spada do ${pct(E.station.ratingMin)} przy kursach co ${E.station.serviceDays} dni. Gdy czeka ponad ${E.station.crowdedAmount} jednostek – kara ${pct(E.station.crowdedPenalty)}. Na stacji czeka najwyżej ${E.station.maxWaiting} jednostek.`,
      'Kilka stacji przy jednym zakładzie dzieli się produkcją według ocen. Wniosek: częste kursy = więcej ładunku.',
      'Na stacji pociąg najpierw rozładowuje to, co stacja przyjmuje, potem ładuje czekający ładunek.',
    ],
  },
  {
    id: 'money',
    title: 'Za co płacą',
    blocks: [
      '**Zapłata = ilość × stawka × odległość między stacjami (kafelki, w linii prostej po osiach) × współczynnik czasu.**',
      `Odległość się opłaca: ten sam wagon wieziony dwa razy dalej zarabia dwa razy więcej. Ale liczy się czas – do „szybkiego” czasu płacą 100%, potem zapłata spada przez ${E.delivery.lateDecayDays} dni do ${pct(E.delivery.minTimeFactor)}.`,
      {
        table: {
          head: ['Ładunek', 'Stawka (zł / jedn. / kafelek)', 'Pełna stawka do (dni)'],
          rows: Object.values(CARGO_DEFS).map((c) => [c.name, c.rate.toLocaleString('pl-PL'), String(c.fastDays)]),
        },
      },
      'Pasażerowie i poczta płacą najlepiej, ale chcą szybko; węgiel i ruda płacą mniej, ale mogą jechać długo i jest ich dużo.',
    ],
  },
  {
    id: 'trains',
    title: 'Pociągi i zajezdnie',
    blocks: [
      `Zajezdnia (Z): klik obok toru, ${zl(E.construction.depot)}. Kierunek wjazdu w panelu obok narzędzi albo R; „Auto” obraca wjazd w stronę toru.`,
      `Kliknij zajezdnię, wybierz lokomotywę i do ${MAX_WAGONS} wagonów (klik na wagon w składzie usuwa go). Pociąg czeka w zajezdni, aż ułożysz rozkład i klikniesz „▶ Wyjedź”.`,
      `Sprzedaż tylko w zajezdni: wagony – zwrot ${pct(E.refunds.trainResale)} ceny, lokomotywa – zależnie od wieku (patrz Wymiana lokomotyw).`,
      `Koszt utrzymania (rocznie, tylko poza zajezdnią): lokomotywa parowa ${pct(E.trainRunningCost.traction.steam)} ceny, spalinowa ${pct(E.trainRunningCost.traction.diesel)}, elektryczna ${pct(E.trainRunningCost.traction.electric)}; wagony ${pct(E.trainRunningCost.wagon)}.`,
      'Okno pociągu (klik na pociąg): start/stop, „Do zajezdni”, „Zawróć”, „Pokaż”, rozkład i wymiana lokomotywy.',
      '**Zmiana składu** (okno zajezdni, pociąg musi stać w zajezdni): klik na wagon w składzie odpina go do **magazynu** zajezdni; klik na wagon w magazynie doczepia go do wybranego pociągu (◉). Wagony kupisz też prosto do magazynu, a ✕ sprzedaje wagon z magazynu. „Sprzedaj lokomotywę” zostawia wagony w magazynie – tak przełożysz wagony na nową lokomotywę (kup ją jako pociąg bez wagonów). Zajezdni z wagonami w magazynie nie zburzysz.',
      '**Kopiuj** (⧉ w oknie pociągu lub zajezdni): kupuje taki sam pociąg z tym samym rozkładem. Kopia staje w zajezdni, w której kupiono oryginał; gdy tej zajezdni już nie ma (albo elektryczna nie ma w niej sieci) – w najbliższej. Kliknij „▶ Wyjedź” – najlepiej, gdy poprzedni odjedzie kawałek, żeby pociągi jechały w odstępie.',
    ],
  },
  {
    id: 'orders',
    title: 'Rozkład jazdy',
    blocks: [
      'Rozkład to lista stacji, po których pociąg jeździ w kółko: w oknie pociągu „+ Dodaj stacje”, klikaj stacje na mapie, „Gotowe”.',
      '**Pełny ładunek** (ptaszek przy stacji w rozkładzie): pociąg nie odjedzie, dopóki nie napełni wagonów na ładunek, który ta stacja zbiera (status „Czeka na pełny ładunek”). Dobre przy kopalniach – zamiast wozić pół pustych wagonów. Inne pociągi omijają taki peron, jeśli mają wolny.',
      'Rada: przy pełnym ładunku daj stacji co najmniej jeden peron więcej niż pociągów czekających na ładunek. Wagony na inny ładunek nie wstrzymują odjazdu; „■ Stop” albo „Zawróć” przerywa czekanie.',
      'Pociąg sam wybiera trasę (najkrótszą, omijając zajęte perony) i zawraca na końcu toru albo na stacji, gdy następny cel jest za nim.',
      'Status „Nie może dojechać” – do celu nie ma toru (albo lokomotywa elektryczna nie ma sieci trakcyjnej).',
      'Bez rozkładu pociąg jeździ przed siebie i zawraca na końcach toru.',
    ],
  },
  {
    id: 'signals',
    title: 'Sygnalizacja',
    blocks: [
      'Pociąg wjeżdża tylko na tory, które zarezerwował – nie ma zderzeń. Tryb przełączasz w Menu.',
      '**Amator** (domyślny): nie stawiasz semaforów – pociągi same trzymają odstęp i nie stają na rozjazdach. Wystarczy na początek.',
      `**Ekspert**: pociąg staje tylko przed semaforem, na końcu peronu lub toru. Semafory (B, ${zl(E.construction.signal)}): ścieżkowy – kliknięcia zmieniają kierunek; jednokierunkowy – zakaz jazdy pod prąd. Strzałka na torze pokazuje kierunek, słup stoi po prawej stronie toru.`,
      'Odstęp od rozjazdu do semafora za nim powinien mieścić cały najdłuższy pociąg – inaczej pociąg staje przed semaforem z ogonem na zwrotnicy i blokuje inne drogi (zwłaszcza w głowicy stacji). Przed stacją postaw semafor kilka kafelków przed rozjazdem.',
      'Na jednym torze z ruchem w obie strony buduj mijanki. Gdy pociągi zablokują się naprzeciw siebie, po 3 dniach jeden sam zawróci; możesz też kliknąć „Zawróć”.',
      'Klawisz V pokazuje rezerwacje – widać, kto na kogo czeka.',
    ],
  },
  {
    id: 'towns',
    title: 'Miasta – jak rosną',
    blocks: [
      `Domy mają ${E.town.housePopulation.slice(1).join(' / ')} mieszkańców zależnie od wysokości. Miesięcznie miasto daje pasażerów = mieszkańcy / ${E.town.passengerDivisor} i pocztę = mieszkańcy / ${E.town.mailDivisor} (z domów w zasięgu stacji).`,
      `**Wzrost co miesiąc**: miasto, z którego wozisz pasażerów, dostaje 1–${1 + E.town.growthMaxExtra} nowe domy (więcej, im większy odsetek przewieziesz) i ma ${pct(E.town.upgradeChance)} szans na rozbudowę domu w górę. Miasto bez kolei – tylko ${pct(E.town.unservedGrowthChance)} szans na jeden dom.`,
      `Nowe domy powstają ${E.town.stationPull}× chętniej w zasięgu stacji – miasto rośnie w stronę kolei. Większe miasto = więcej pasażerów = więcej pieniędzy.`,
      `Miasta same budują drogi (jeździ po nich ruch – tylko dekoracja). Dom można wyburzyć buldożerem (${zl(E.construction.demolishHouse)}).`,
    ],
  },
  {
    id: 'industries',
    title: 'Zakłady – jak rosną',
    blocks: [
      {
        table: {
          head: ['Zakład', 'Produkuje', 'Potrzebuje', 'Na miesiąc (poziom 1)'],
          rows: INDUSTRY_DEFS.map((d) => [
            d.name,
            d.produces ? cargoName(d.produces) : '–',
            d.accepts.length ? d.accepts.map(cargoName).join(', ') : '–',
            [
              d.produces ? `daje ${d.baseProduction}` : '',
              d.accepts.length ? `bierze ${d.baseDemand}${d.accepts.length > 1 ? ' każdego' : ''}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          ]),
        },
      },
      `**Wskaźnik zaopatrzenia** (średnia z ${E.industry.historyMonths} miesięcy): kopalnia/las – jaką część produkcji wywozisz; przetwórnia – ile dostarczasz względem potrzeb.`,
      `Od ${pct(E.industry.growThreshold)} zakład zbiera +1 punkt na miesiąc, poniżej ${pct(E.industry.declineThreshold)} traci punkt, pomiędzy – stoi. ${E.industry.levelPoints} punktów = poziom w górę (lub w dół). Poziomy 1–${E.industry.maxLevel}; produkcja rośnie z poziomem.`,
      `Przetwórnia bez dostaw pracuje na ${pct(E.industry.idleProduction)} mocy – dowóz surowców zwiększa produkcję towarów. Towary wieź do dużych miast.`,
    ],
  },
  {
    id: 'engines',
    title: 'Lokomotywy z biegiem lat',
    blocks: [
      'Każda lokomotywa wchodzi do sprzedaży w swoim roku, a starsze są po latach wycofywane (jeżdżące zostają). Rok startu wybierasz przy nowej grze. Na początku roku gra ogłasza nowości.',
      {
        table: {
          head: ['Lokomotywa', 'Trakcja', 'Lata', 'km/h', 'kW', 'Cena'],
          rows: ENGINES.map((e) => [
            e.name,
            TRACTION_NAMES[e.traction],
            e.retire ? `${e.year}–${e.retire - 1}` : `od ${e.year}`,
            String(e.maxSpeed),
            String(e.power),
            zl(e.cost),
          ]),
        },
      },
      'Moc decyduje o przyspieszeniu i podjazdach z ciężkim składem, prędkość – o czasie przewozu. Elektryczne są najtańsze w utrzymaniu, ale potrzebują sieci trakcyjnej.',
    ],
  },
  {
    id: 'catenary',
    title: 'Sieć trakcyjna',
    blocks: [
      `Lokomotywy elektryczne jeżdżą tylko pod siecią. Narzędzie Trakcja (E): przeciągnij wzdłuż istniejącego toru (jak przy budowie, także po skosie) albo kliknij kafelek. ${zl(E.construction.catenaryTile)} za kafelek, utrzymanie ${zl(E.maintenance.catenaryTile)} na miesiąc.`,
      'Torów nie wymieniasz – sieć dokłada się nad nimi. Obejmuje cały kafelek (także peron i zajezdnię); most i tunel – w całości.',
      '**Zajezdnia też musi mieć sieć**, inaczej pociąg elektryczny z niej nie wyjedzie. Sieć musi być ciągła na całej trasie.',
      'Parowe i spalinowe jeżdżą pod siecią normalnie – linię można elektryfikować stopniowo.',
    ],
  },
  {
    id: 'replace',
    title: 'Wymiana lokomotyw',
    blocks: [
      'Okno pociągu → Lokomotywa: wybierz nowszą i kliknij „Wymień”. Pociąg w trasie sam zjedzie do najbliższej zajezdni, wymieni lokomotywę i wróci na trasę; w zajezdni – od razu. Wagony, ładunek i rozkład zostają.',
      `Płacisz cenę nowej minus zwrot za starą: ${pct(E.refunds.engineTradeIn.full)} ceny dla nowej lokomotywy, coraz mniej z każdym rokiem, aż do ${pct(E.refunds.engineTradeIn.old)} po ${E.refunds.engineTradeIn.years} latach.`,
      '„Wymień we wszystkich” – to samo dla każdego pociągu z tą samą lokomotywą.',
      'Na elektryczną wymieniaj tylko pociągi jeżdżące pod siecią i zjeżdżające do zajezdni z siecią.',
    ],
  },
  {
    id: 'finance',
    title: 'Finanse, kredyt, bankructwo',
    blocks: [
      `Start: ${zl(E.startMoney)}. Okno Finanse (klik na kwotę): przychody i koszty z ostatnich miesięcy.`,
      `Koszty co miesiąc: utrzymanie pociągów w trasie (patrz Pociągi), torów (${zl(E.maintenance.trackPiece)} za element), peronów (${zl(E.maintenance.stationTile)} za kafelek), zajezdni (${zl(E.maintenance.depot)}), semaforów i sieci trakcyjnej.`,
      `**Kredyt**: do ${zl(E.loan.max)}, po ${zl(E.loan.step)}, odsetki ${pct(E.loan.yearlyInterest)} rocznie (co miesiąc). Spłacasz, gdy masz gotówkę.`,
      `**Bankructwo**: ujemne saldo na koniec miesiąca ${E.loan.bankruptcyMonths} razy z rzędu kończy grę. Wcześniej gra ostrzega – weź kredyt, sprzedaj nierentowne pociągi albo zatrzymaj je w zajezdni (tam nie kosztują).`,
    ],
  },
  {
    id: 'saving',
    title: 'Zapis gry i ustawienia',
    blocks: [
      'Gra zapisuje się sama co 30 s (na dużych mapach rzadziej) i przy zamknięciu karty. W Menu: Zapisz / Wczytaj (ręczny zapis), eksport i import pliku (przeniesienie na inny komputer).',
      'Zapisy w przeglądarce są widoczne tylko na tym urządzeniu i tej stronie.',
      'Menu → Ruch w miastach – auta i autobusy można wyłączyć na słabszym komputerze. Minimapę zwijasz przyciskiem „–”.',
      'Nowa gra: rozmiar mapy (64 – 1024), rok startu, gęstość miast, kopalń i lasów oraz przemysłu (brak / mało / normalnie / dużo) albo tryb „Własne” z dokładnymi liczbami każdego typu i ziarno – ta sama liczba i ustawienia dają tę samą mapę.',
    ],
  },
];
