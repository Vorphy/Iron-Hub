/**
 * POMOC (wiki w grze) – okno „Pomoc” (H). Liczby pochodzą z plików danych (ekonomia, pojazdy, zakłady),
 * więc po strojeniu opis aktualizuje się sam. Tekst `**tak**` jest pogrubiony.
 */
import { CARGO_DEFS } from '../sim/economy/cargo';
import { RESEARCH, RESEARCH_CANCEL_REFUND, RESEARCH_COST_GROWTH, RESEARCH_DAYS_GROWTH } from './research';
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
import mijankaSvg from '../assets/help/mijanka.svg';
import semaforySvg from '../assets/help/semafory.svg';
import { ECONOMY } from './economy';

/** `figure` – adres obrazka z importu (Vite dokleja hash, więc zmiana rysunku omija cache). */
export type HelpBlock =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { figure: string; alt: string };

export interface HelpTopic {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

const E = ECONOMY;
const zl = (v: number) => `${v.toLocaleString('pl-PL')} zł`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const R = E.rating;
const num = (v: number) => v.toLocaleString('pl-PL');
/** Progi kumulowane z oceny stacji jako tekst: „do 7,5 dni: 130, do 15 dni: 95…”, od najkorzystniejszego. */
const cumulative = (steps: readonly (readonly [number, number])[], base: number, label: (limit: number) => string) =>
  steps
    .map((_, i) => {
      const total = base + steps.slice(0, steps.length - i).reduce((s, [, p]) => s + p, 0);
      return `${label(steps[steps.length - 1 - i]![0])}: ${total > 0 ? '+' : ''}${total}`;
    })
    .join(', ');
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
            [
              'minimapa: nagłówek / − + / ☰ / ⛶',
              'przeciągnij – przenieś; zoom; legenda z filtrami zakładów; duża mapa (Esc zamyka)',
            ],
            [
              'panele: ⠿ / ◂ « ▾',
              'górny pasek, menu budowania i podpowiedzi: przeciągnij za ⠿ – przenieś; zwiń (pasek – sama data i kwota, menu – same ikony)',
            ],
            ['spacja / 1–4', 'pauza / prędkość 1×, 2×, 4×, 8×'],
            ['Esc', 'anuluj, zamknij okno, kursor'],
            ['T, P, Z, E, L, M, N, X', 'Tory, Stacja, Zajezdnia, Trakcja, Teren, Most, Tunel, Rozbiórka'],
            ['B', 'Semafor (tylko w trybie Ekspert)'],
            ['Q / J', 'metro: przełącz poziom −1 / narzędzie Zjazd'],
            ['U', 'widok bez budynków (domy, zakłady, drzewa) – też 🏠 na górnym pasku'],
            ['I', 'kolory dzielnic w miastach, które mają ich kilka (włącz / wyłącz)'],
            ['Y', 'Badania'],
            ['R', 'obrót stacji / wjazdu zajezdni'],
            ['V', 'podgląd rezerwacji torów'],
            ['G', 'podgląd grafu torów (dla ciekawych)'],
            ['K', 'lista pociągów'],
            ['H', 'ta pomoc'],
          ],
        },
      },
      'Klik kursorem na pociąg, stację, zajezdnię, miasto lub zakład otwiera jego okno. Klik na kwotę na górnym pasku – finanse.',
      'Układ paneli zapamiętuje przeglądarka. Podpowiedzi wyłączysz krzyżykiem albo w Menu → Widok; tam też „Przywróć układ paneli”, gdy coś odjedzie za daleko.',
      '**Wielkość interfejsu**: Menu → Widok → Interfejs – 60% lub 80% (laptop, mały ekran), 100% (monitor ok. 24") albo 120% (duży ekran). Zmienia napisy, przyciski, okna i panele; mapa zostaje bez zmian. Przy pierwszym uruchomieniu na niskim ekranie gra sama wybiera mały. Ustawienie zapamiętuje przeglądarka.',
    ],
  },
  {
    id: 'tracks',
    title: 'Tory, mosty, tunele',
    blocks: [
      `Tory (T): przeciągnij wzdłuż osi albo po skosie; pozycja kursora w pierwszym kafelku wybiera łuk. Linia powstaje w całości albo wcale (czerwony podgląd = coś blokuje). ${zl(E.construction.trackPiece)} za element toru. Nie ma skrętów o 90° – skręca się łukami.`,
      'Na zboczu prosty tor w górę zbocza i ukos (łuk) leżący poziomo – np. wzdłuż płaskiej połówki kafelka z jednym podniesionym narożnikiem – leżą wprost na terenie. Stacje i zajezdnie tylko na płaskim. Pod górę pociąg zwalnia, z górki przyspiesza.',
      `**Fundament** (jak w OpenTTD): tor w poprzek zbocza, łuk albo rozjazd na zboczu stoi na kamiennym fundamencie – kafelek jest podnoszony do najwyższego narożnika (prosty tor przy jednym podniesionym narożniku – na fundamencie pochyłym, równo pod górę). ${zl(E.construction.foundation)} za kafelek, do ceny torów. Nie da się, gdy tor kończyłby się uskokiem nad niższym sąsiadem (bok kafelka cały na dole) ani na stromym zboczu.`,
      `Usuwanie: Tory → Usuń albo Rozbiórka (X). Klik – jeden element pod kursorem, przeciągnięcie – odcinek. Zwrot ${pct(E.refunds.demolition)}. Toru pod pociągiem nie rozbierzesz.`,
      `**Most** (M): przeciągnij od przyczółka do przyczółka, do ${MAX_BRIDGE_LENGTH} kafelków, ${zl(E.construction.bridgeTile)} za kafelek. Przyczółki na tej samej wysokości, pod mostem teren niżej (woda, inne tory).`,
      `**Tunel** (N): kliknij zbocze – tunel biegnie prosto do zbocza po drugiej stronie na tej samej wysokości. Do ${MAX_TUNNEL_LENGTH} kafelków, ${zl(E.construction.tunnelTile)} za kafelek.`,
      'Pod ziemią (poziom −1) też budujesz tory – patrz **Metro**.',
      `**Teren** (L): podnieś / obniż narożnik albo wyrównaj prostokąt; ${zl(E.construction.terraformCorner)} za narożnik. Pod torami, budynkami i drogami terenu nie zmienisz. Woda jest tylko na najniższym poziomie – podniesienie dna zamienia ją w ląd.`,
    ],
  },
  {
    id: 'metro',
    title: 'Metro (poziom −1)',
    blocks: [
      'Metro to druga warstwa mapy pod powierzchnią: tory i stacje pod miastem, wodą i wzgórzami, bez burzenia domów. Przełączasz się przyciskiem nad narzędziami budowy albo klawiszem **Q** – pod ziemią powierzchnia jest przyciemniona, ale jej obrysy zostają widoczne.',
      {
        list: [
          `**Tory metra**: narzędzie Tory na poziomie −1, ${zl(E.construction.metroTrackPiece)} za element. Rozbiórka działa tak samo.`,
          `**Zjazd** (J, ${zl(E.construction.metroRamp)}): płaski kafelek, na którym tor schodzi pod ziemię w stronę strzałki (kierunek dobiera się sam, R – obrót). Tylko tędy pociągi wjeżdżają do metra i wyjeżdżają na powierzchnię.`,
          `**Stacje metra**: narzędzie Stacja na poziomie −1, ${zl(E.construction.stationTile + E.construction.metroStationExtra)} za kafelek. Zasięg jak zwykła stacja, nazwa „… Metro”.`,
          '**Przesiadka**: peron metra w zasięgu stacji na powierzchni (albo odwrotnie) dołącza do niej – jedna stacja, wspólny ładunek i zasięg, pociągi na obu poziomach odbierają pasażerów i towary. „Osobna stacja” (albo Ctrl / Shift) – osobna mimo zasięgu.',
          '**Semafory** (tryb Ekspert): narzędzie Semafor na poziomie −1 stawia je na torach i peronach metra. W widoku −1 widać tylko semafory metra, na powierzchni – tylko te z góry.',
          '**Zajezdnie** są tylko na powierzchni – pociąg kupujesz na górze i zjeżdża do metra zjazdem.',
        ],
      },
      'Pod ziemią jeździ każda lokomotywa, także elektryczna (trzecia szyna – bez sieci trakcyjnej). Pociąg w metrze widać tylko w widoku −1; tam też klikasz stacje metra (okno stacji, dodawanie do rozkładu). Pociągi same wybierają trasę przez metro, jeśli jest krótsza.',
      'Utrzymanie torów i peronów metra jest dwa razy droższe niż na powierzchni. Na minimapie metro jest niebieskie.',
      `**Duże miasta chcą metra**: od ${E.town.metroDemandPop.toLocaleString('pl-PL')} mieszkańców metro przyspiesza wzrost miasta, a bez niego miasto powyżej ${E.town.metroRequiredPop.toLocaleString('pl-PL')} mieszkańców stoi (patrz Miasta).`,
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
      'Pociąg staje czołem na końcu peronu. Każdy pojazd to pół kafelka (lokomotywa + wagon albo dwa wagony na kafelek) – długość składu pokazuje okno zajezdni.',
      '**Za krótki peron**: pociąg dłuższy niż peron ładuje się dłużej, proporcjonalnie do tego, ile wystaje – np. 5 kafelków składu na 4-kafelkowym peronie to postój o 25% dłuższy, dwa razy za długi pociąg (i dłuższy) – 2×. Status pociągu podpowiada „peron za krótki”.',
    ],
  },
  {
    id: 'rating',
    title: 'Ładunek na stacji i ocena',
    blocks: [
      `Stacja zaczyna zbierać ładunek dopiero, gdy zatrzyma się na niej pociąg z pasującym wagonem. Bez takiego pociągu przez ${E.station.serviceDays} dni przestaje zbierać.`,
      `**Ocena stacji** (jak w OpenTTD) mówi, jaka część produkcji trafia na stację. To suma punktów (255 = 100%), osobno dla każdego ładunku; najedź na ocenę w oknie stacji, żeby zobaczyć składniki:`,
      {
        table: {
          head: ['Składnik', 'Punkty'],
          rows: [
            ['Dni od ostatniego załadunku', cumulative(R.pickupDays, 0, (d) => `do ${num(d)} dni`)],
            [
              'Prędkość maks. ostatniego pociągu',
              `+1 za każde ${R.speedDivisor} km/h ponad ${R.speedFrom} km/h (najwyżej +${Math.floor((R.speedMax - R.speedFrom) / R.speedDivisor)})`,
            ],
            ['Czekający ładunek', `${cumulative(R.waiting, R.waitingBase, (n) => `do ${n}`)}, więcej: ${R.waitingBase}`],
            ['Wiek lokomotywy', cumulative(R.ageYears, 0, (y) => (y === 1 ? 'poniżej roku' : `poniżej ${y} lat`))],
            ['Badanie „Lepsza obsługa stacji”', 'dodatkowe punkty'],
          ],
        },
      },
      `Ocena nie skacze: co dzień zmienia się o ${R.stepPerDay} pkt w stronę sumy. Nowo obsługiwany ładunek zaczyna od ${pct(R.initial / 255)}. Wniosek: częste kursy szybkimi, nowymi pociągami i nie dopuszczać do tłumu na peronie. Na stacji czeka najwyżej ${E.station.maxWaiting} jednostek.`,
      'Kilka stacji przy jednym zakładzie dzieli się produkcją według ocen. Wniosek: częste kursy = więcej ładunku.',
      'Na stacji pociąg najpierw rozładowuje to, co stacja przyjmuje, potem ładuje czekający ładunek.',
      '**Kolejka**: kto pierwszy przyjechał, ten pierwszy się ładuje. Pociąg, który dojechał później, nie podbiera ładunku temu, który już czeka (np. na pełny ładunek) – pierwszy zapełnia się i odjeżdża pierwszy.',
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
      `Kliknij zajezdnię → **Nowe pojazdy** (jak w OpenTTD): w zakładce Lokomotywy „Kup” tworzy nowy pociąg; w zakładce Wagony „Kup i doczep” dokłada wagon do wybranego pociągu (klik na jego nazwę), „Kup do wolnych wagonów” – luzem. Do ${MAX_WAGONS} wagonów. Pociąg czeka w zajezdni, aż ułożysz rozkład i klikniesz ▶.`,
      `Sprzedaż tylko w zajezdni: wagony – zwrot ${pct(E.refunds.trainResale)} ceny, lokomotywa – zależnie od wieku (patrz Wymiana lokomotyw).`,
      `Koszt utrzymania (rocznie, tylko poza zajezdnią): lokomotywa parowa ${pct(E.trainRunningCost.traction.steam)} ceny, spalinowa ${pct(E.trainRunningCost.traction.diesel)}, elektryczna ${pct(E.trainRunningCost.traction.electric)}; wagony ${pct(E.trainRunningCost.wagon)}.`,
      'Okno pociągu (klik na pociąg): start/stop, „Do zajezdni”, „Zawróć”, „Pokaż”, zysk, grupa, rozkład i wymiana lokomotywy.',
      '**Lista pociągów** („🚆 Pociągi” na górnym pasku albo K): zysk każdego pociągu w tym i zeszłym roku (przewozy − utrzymanie), wiek, status; sortowanie po kliknięciu w nagłówek, filtr „tylko na minusie” i **grupy** (np. „Węgiel”, „Pasażerskie”) – tworzysz je na dole listy. Pociągi na minusie w zeszłym roku są oznaczone na czerwono, a na początku roku gra o nich przypomina – takim warto zmienić trasę, skrócić skład albo je sprzedać.',
      '**Zmiana składu** (okno zajezdni, pociąg musi stać w zajezdni): pojazdy **przeciągasz** myszą – wagon na inny pociąg, do rzędu **Wolne wagony** albo do kosza (🗑 – sprzedaż). Klik na wagon w pociągu odpina go do wolnych, klik na wolny wagon doczepia go do wybranego pociągu. Lokomotywa przeciągnięta do kosza sprzedaje się, a wagony zostają wolne – tak przełożysz je na nową lokomotywę. Zajezdni z wolnymi wagonami nie zburzysz.',
      '**Wspólny rozkład**: kopia (⧉ Kopiuj) dzieli rozkład z oryginałem – to jedna linia. Dodanie lub usunięcie stacji albo ptaszek pełnego ładunku w dowolnym z jej pociągów zmienia rozkład wszystkich; każdy jedzie we własnym tempie. „Odłącz” w oknie pociągu daje mu własną kopię rozkładu, a „⧉ osobny” tworzy kopię od razu z osobnym rozkładem. Na liście pociągów linia ma znaczek ⇄N.',
      '**Rozkład czasowy**: przy każdej stacji wybierzesz dodatkowy postój (1–30 dni). Na wspólnym rozkładzie włącz **„Równe odstępy na linii”** – gra mierzy czas okrążenia linii i na pierwszej stacji rozkładu wypuszcza pociągi co (czas okrążenia / liczba pociągów); po pierwszym okrążeniu odstęp się ustali. Pociąg czekający na swoją kolej ma status „Czeka na odstęp”. Dokup pociąg do linii (⧉ Kopiuj) – odstęp sam się zmniejszy.',
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
      'Pociąg sam wybiera trasę (najkrótszą, omijając zajęte perony) i zawraca na końcu toru albo na stacji, gdy następny cel jest za nim. Jak w OpenTTD: przez cudze stacje jedzie niechętnie (wybierze obwodnicę, jeśli jest – albo poprowadź go punktem kontrolnym), a na stacji docelowej wybiera peron pasujący do długości składu – długi pociąg nie stanie na krótkim peronie, jeśli jest dłuższy. W trybie Ekspert unika też łuków (najchętniej jedzie prosto), podjazdów (płaska trasa, nawet trochę dłuższa) i zajętych peronów; pociągi stojące daleko, za kilkoma semaforami, nie zmieniają jego wyboru – zdążą odjechać.',
      '**Bez zatrzymania** (ptaszek przy stacji): pociąg przejeżdża przez stację i jedzie dalej – nie ładuje, nie wysiada nikt.',
      '**Punkt kontrolny**: narzędzie Stacja → „Punkt kontrolny”, klik na prosty tor (500 zł). Dodany do rozkładu jak stacja wymusza trasę przez ten tor (np. wybraną mijankę albo objazd); pociąg się na nim nie zatrzymuje. Buldożer usuwa sam znacznik, tor zostaje.',
      'Status „Nie może dojechać” – do celu nie ma toru (albo lokomotywa elektryczna nie ma sieci trakcyjnej, albo w trybie Ekspert drogę zamyka semafor jednokierunkowy). Po kilku dniach takiej jazdy gra pokazuje komunikat – „Pokaż ›” przenosi do pociągu.',
      'Bez rozkładu pociąg jeździ przed siebie i zawraca na końcach toru.',
    ],
  },
  {
    id: 'signals',
    title: 'Sygnalizacja',
    blocks: [
      'Pociąg wjeżdża tylko na tory, które zarezerwował – nie ma zderzeń. Tryb przełączasz w Menu.',
      '**Amator** (domyślny): nie stawiasz semaforów – pociągi same trzymają odstęp i nie stają na rozjazdach. Wystarczy na początek.',
      `**Ekspert**: pociąg staje tylko przed semaforem, na końcu peronu lub toru. Semafory (B, ${zl(E.construction.signal)}): ścieżkowy – kliknięcia zmieniają kierunek; jednokierunkowy – zakaz jazdy pod prąd. Strzałka na torze pokazuje kierunek, słup stoi po prawej stronie toru. W grafice TTD światła semafora patrzą na pociąg, który przed nim staje. Semafory działają też w metrze (patrz Metro).`,
      {
        table: {
          head: ['', 'Ścieżkowy', 'Jednokierunkowy'],
          rows: [
            ['Na torze', 'jedna strzałka (dwie przy „oba”)', 'podwójna strzałka'],
            ['Kliknięcia', 'kierunek 1 → 2 → oba', 'kierunek 1 ↔ 2'],
            ['Jazda w stronę strzałki', 'pociąg może przed nim stanąć', 'pociąg może przed nim stanąć'],
            ['Jazda pod prąd', 'przejeżdża bez zatrzymania', 'zakazana – pociąg szuka innej drogi'],
            ['Do czego', 'jednotorowe szlaki z mijankami, głowice stacji', 'linie dwutorowe – każdy tor w swoją stronę'],
          ],
        },
      },
      'Na torze używanym w obie strony (jednotor z mijankami, głowica stacji) stawiaj ścieżkowe – zatrzymują pociąg przed wjazdem na jednotor, a z przeciwka przepuszczają:',
      {
        figure: mijankaSvg,
        alt: 'Mijanka: pociąg czeka przed semaforem na wyjeździe, pociąg z przeciwka mija semafor drugiego toru od tyłu',
      },
      'Na linii dwutorowej oba rodzaje działają, ale inaczej. Jazda pod prąd przez semafor ścieżkowy kosztuje w wyborze trasy tyle co 15 kafelków (jak w OpenTTD), więc pociąg trzyma się swojego toru. Torem przeciwnym wyprzedzi tylko długo stojący pociąg na dłuższym odcinku – a ruch z przeciwka w tym czasie czeka. Jednokierunkowe trzymają każdy pociąg na swoim torze zawsze:',
      {
        figure: semaforySvg,
        alt: 'Linia dwutorowa: na semaforach ścieżkowych pociąg wyprzedza torem przeciwnym, na jednokierunkowych czeka na swoim torze',
      },
      'Jeden jednokierunkowy wystarczy, by cały odcinek między rozjazdami stał się jednokierunkowy. Uwaga: postawiony na jedynym torze odcina ruch w drugą stronę (status „Nie może dojechać”). Przy narzędziu Semafor każdy semafor ma żółtą strzałkę kierunku, którego dotyczy (jednokierunkowy – podwójną, w tę stronę wolno jechać). Pociąg jadący pod strzałkę mija zwykły semafor ścieżkowy od tyłu, nawet przy czerwonym – to światło dla jadących z naprzeciwka; kolejne kliknięcie zmienia kierunek.',
      'Odstęp od rozjazdu do semafora za nim powinien mieścić cały najdłuższy pociąg – inaczej pociąg staje przed semaforem z ogonem na zwrotnicy i blokuje inne drogi (zwłaszcza w głowicy stacji). Przed stacją postaw semafor kilka kafelków przed rozjazdem.',
      'Na jednym torze z ruchem w obie strony buduj mijanki. Gdy pociągi zablokują się naprzeciw siebie, po 3 dniach jeden sam zawróci; możesz też kliknąć „Zawróć”.',
      'Klawisz V pokazuje rezerwacje – widać, kto na kogo czeka.',
    ],
  },
  {
    id: 'towns',
    title: 'Miasta – jak rosną',
    blocks: [
      `Domy mają ${E.town.housePopulation.slice(1, 5).join(' / ')} mieszkańców zależnie od wysokości. Miesięcznie miasto daje pasażerów = mieszkańcy / ${E.town.passengerDivisor} i pocztę = mieszkańcy / ${E.town.mailDivisor} (z domów w zasięgu stacji).`,
      `**Wzrost co miesiąc**: miasto, z którego wozisz pasażerów, dostaje 1–${1 + E.town.growthMaxExtra} nowe domy (więcej, im większy odsetek przewieziesz) i ma ${pct(E.town.upgradeChance)} szans na rozbudowę domu w górę. Miasto bez kolei – tylko ${pct(E.town.unservedGrowthChance)} szans na jeden dom.`,
      `Nowe domy powstają ${E.town.stationPull}× chętniej w zasięgu stacji – miasto rośnie w stronę kolei. Większe miasto = więcej pasażerów = więcej pieniędzy.`,
      `Nowy albo rozbudowywany dom przez kilka dni się buduje (wykop, rusztowanie, stan surowy – po ${E.town.constructionStageDays} dni) – widać, gdzie miasto rośnie. Przy środku każdej dzielnicy stoi kościół (od ${E.town.churchMinHouses} domów) i parki, stawy, pomniki albo fontanny (jedna ozdoba na ${E.town.housesPerOrnament} domów) – bez mieszkańców; w zabudowanej dzielnicy przebudowuje się na nie najniższy dom. Co miesiąc ok. 1 na ${E.town.renovationHouses} domów przechodzi remont (te same etapy budowy).`,
      `**Metro w dużym mieście**: od ${E.town.metroDemandPop.toLocaleString('pl-PL')} mieszkańców miasto domaga się metra (komunikat i napis w oknie miasta). Stacja metra w obrębie miasta przyspiesza jego rozwój: za każdą dzielnicę ze stacją metra +${E.town.metroGrowthExtra} domy na miesiąc i dodatkowe ${pct(E.town.metroUpgradeChance)} szans na rozbudowę. Bez metra miasto powyżej ${E.town.metroRequiredPop.toLocaleString('pl-PL')} mieszkańców przestaje rosnąć.`,
      `**Dzielnice**: miasto może mieć kilka dzielnic – każda ma swój środek, ulice i obszar zabudowy. Gdy domy dwóch miast się stykają albo łączy je droga, miasta się zrastają: po ${E.town.absorbMonths} miesiącach większe przejmuje mniejsze, które zostaje dzielnicą pod swoją nazwą, np. „Bocznica – Torzyce” (stacje zachowują nazwy). Miasto zachowuje swoją nazwę. Tak z kilku miast powstaje metropolia. Gdy miasto (od ${E.town.newDistrictMinPop.toLocaleString('pl-PL')} mieszkańców) nie ma już gdzie budować, przy brzegu zabudowy powstaje nowa dzielnica – chętniej w stronę stacji; za torami nazywa się Zatorze. Lista dzielnic (mieszkańcy, metro) jest w oknie miasta, a na mapie każda dzielnica ma własny kolor (🏘 na górnym pasku, klawisz I albo Menu → Dzielnice – włącza i wyłącza).`,
      `**Ruch miejski**: pasażerowie przewiezieni między stacjami w różnych dzielnicach tego samego miasta płacą ${E.town.interDistrictBonus}× więcej – jeśli przejazd ma co najmniej ${E.town.interDistrictMinDist} kafelków (krótszy przez granicę dzielnic i przejazd w jednej dzielnicy – zwykła stawka). Metro i zwykłe pociągi tak samo.`,
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
      `**Pracownicy – poziomy ${E.industry.maxLevel + 1}–${E.industry.maxLevel + E.industry.workerLevels}**: od poziomu ${E.industry.maxLevel} zakład rośnie dalej tylko z pracownikami. Stacja w jego zasięgu przyjmuje wtedy pasażerów (nawet bez domów obok, zapłata jak za zwykły przewóz), a każdy, kto wysiądzie, to pracownik. Potrzeba ${E.industry.workersPerLevel} × poziom pracowników na miesiąc (np. ${E.industry.workersPerLevel * E.industry.maxLevel} na poziomie ${E.industry.maxLevel}). Na poziomach ${E.industry.maxLevel + 1}–${E.industry.maxLevel + E.industry.workerLevels} brak kompletu odbiera punkt rozwoju co miesiąc – po roku zakład spada o poziom, najniżej do ${E.industry.maxLevel}. Stan widać w oknie zakładu.`,
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
      '**Podwójna trakcja**: dwie takie same lokomotywy w składzie (w zajezdni: wybierz pociąg i w Nowe pojazdy kup tę samą lokomotywę „jako 2. lokomotywę”; drugą przeciągnij do kosza, by ją sprzedać) – 2× moc i przyczepność, ta sama prędkość maksymalna, 2× cena i utrzymanie lokomotyw. Opłaca się przy ciężkich składach na trasach pod górę.',
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
      `Start: ${zl(E.startMoney)}. Okno Finanse (klik na kwotę): przychody i koszty z ostatnich miesięcy. Tam też zmienisz nazwę firmy (wpisaną przy nowej grze – widać ją na górnym pasku i w nazwie eksportowanego zapisu).`,
      `Koszty co miesiąc: utrzymanie pociągów w trasie (patrz Pociągi), torów (${zl(E.maintenance.trackPiece)} za element), peronów (${zl(E.maintenance.stationTile)} za kafelek), zajezdni (${zl(E.maintenance.depot)}), semaforów i sieci trakcyjnej. Tory i perony metra – dwa razy więcej niż na powierzchni. Badanie „Tańsze utrzymanie” obniża te koszty.`,
      `**Kredyt**: do ${zl(E.loan.max)}, po ${zl(E.loan.step)}, odsetki ${pct(E.loan.yearlyInterest)} rocznie (co miesiąc). Spłacasz, gdy masz gotówkę.`,
      `**Bankructwo**: ujemne saldo na koniec miesiąca ${E.loan.bankruptcyMonths} razy z rzędu kończy grę. Wcześniej gra ostrzega – weź kredyt, sprzedaj nierentowne pociągi albo zatrzymaj je w zajezdni (tam nie kosztują).`,
    ],
  },
  {
    id: 'research',
    title: 'Badania',
    blocks: [
      `Okno Badania (🔬 na górnym pasku albo Y): ulepszenia kupowane za pieniądze i czas, żeby zarobione pieniądze dalej pracowały. Jedno badanie naraz; płacisz z góry, a po upływie czasu (dni gry) rośnie poziom. Każdy kolejny poziom jest ${RESEARCH_COST_GROWTH}× droższy i ${RESEARCH_DAYS_GROWTH}× dłuższy. Przerwanie zwraca ${pct(RESEARCH_CANCEL_REFUND)} ceny.`,
      ...RESEARCH.map(
        (r) => `**${r.name}** – ${r.effect} za poziom, do ${r.maxLevel} poziomów; pierwszy poziom ${zl(r.cost)}, ${r.days} dni.`,
      ),
      'Efekty działają od razu na wszystkie pociągi i stacje – także te już kupione.',
    ],
  },
  {
    id: 'saving',
    title: 'Zapis gry i ustawienia',
    blocks: [
      'Gra zapisuje się sama co 30 s (na dużych mapach rzadziej) i przy zamknięciu karty. W Menu: Zapisz / Wczytaj (ręczny zapis), eksport i import pliku (przeniesienie na inny komputer).',
      'Zapisy w przeglądarce są widoczne tylko na tym urządzeniu i tej stronie. Uszkodzony albo ręcznie zmieniony plik nie wczyta się – zobaczysz komunikat, co jest nie tak.',
      'Menu → Gra pokazuje, od kiedy grasz, ile było sesji i łączny czas grania (liczony, gdy karta z grą jest widoczna). Te liczby zostają w przeglądarce – gra nigdzie ich nie wysyła.',
      '**Grafika**: Menu → Widok → Grafika przełącza między grafiką w stylu TTD (OpenGFX – darmowa grafika projektu OpenTTD, licencja GPL v2, na czas testów) a prostymi kształtami. Lasy, pojedyncze drzewa i wygląd domów to tylko dekoracja – nie wpływają na grę.',
      '**U** – widok bez budynków: domy, zakłady, drzewa i dachy peronów znikają, żeby zobaczyć tory, które zasłaniały. Ponowne U je przywraca (też w Menu → Widok → Budynki).',
      'Menu → Ruch w miastach – auta i autobusy można wyłączyć na słabszym komputerze. Minimapę zwijasz przyciskiem ▾, przenosisz za nagłówek; jej położenie, zoom i filtry przeglądarka zapamiętuje.',
      '**Planowanie z mapą**: ⛶ na minimapie otwiera dużą mapę z nazwami miast, a legenda (☰) pozwala pokazać tylko wybrane zakłady – np. „tylko” przy Kopalni węgla, potem przy Elektrowni – i znaleźć dobrą parę na pierwszą linię.',
      'Nowa gra: rozmiar mapy (64 – 1024), rok startu, gęstość miast, kopalń i lasów oraz przemysłu (brak / mało / normalnie / dużo) albo tryb „Własne” z dokładnymi liczbami każdego typu i ziarno – ta sama liczba i ustawienia dają tę samą mapę.',
    ],
  },
];
