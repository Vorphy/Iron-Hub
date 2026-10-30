# 07 – Backend: jakie mamy możliwości (dyskusja, 2026-10-21)

Nic tu jeszcze nie jest postanowione. Dokument zbiera rozmowę o tym, skąd wziąć „serwer” do statystyk graczy, a później do zapisu w chmurze i rankingów, żeby dało się spokojnie wybrać. Ostateczną decyzję dopiszemy do [05-decyzje](05-decyzje.md).

## Skąd w ogóle ten temat

Chcemy wiedzieć, **kto grał, czy grał i jak długo** (przyda się przy etapie 5 – testach z ludźmi). Do tego doszły pomysły:

- **nazwa firmy** przy nowej grze – działa jak osobny „login” gracza;
- **łączenie sesji** jednego gracza (pierwszy pomysł: po IP);
- później (etap 8): **zapis w chmurze**, **rankingi**.

## Jak działa gra dziś

Iron-Hub to **strona statyczna** na GitHub Pages: przeglądarka pobiera pliki gry (HTML, JS, obrazki) i cała gra działa u gracza. Zapisy leżą w przeglądarce (IndexedDB). Nie ma żadnego miejsca, które **zbiera dane od wielu graczy naraz**.

```
Gracz A ──┐
Gracz B ──┼──► GitHub Pages (tylko wydaje pliki gry, niczego nie zapisuje)
Gracz C ──┘
```

Żeby zobaczyć, kto grał, gra musi coś **wysłać** w miejsce, które to **zapisze** i pozwoli potem **odczytać**. To właśnie „backend”: kawałek kodu działający poza przeglądarką gracza plus baza danych.

```
Gracz A ──┐                                    ┌──► baza (kto, kiedy, ile)
Gracz B ──┼──► gra wysyła „gram, firma X, 5 min” ┤
Gracz C ──┘                                    └──► my odczytujemy statystyki
```

## Pojęcia, które się przewijają

- **Serwer / VPS** – komputer w internecie, który stale działa. Sami instalujemy na nim program i bazę, sami go aktualizujemy i pilnujemy.
- **Serverless (np. Cloudflare Workers)** – piszemy tylko małą funkcję („przyjmij zdarzenie i zapisz”), a dostawca uruchamia ją, kiedy przychodzi zapytanie. Nie ma maszyny do utrzymywania.
- **SQLite** – baza danych w jednym pliku: prosta, szybka, w zupełności wystarczy na nasze potrzeby. **D1** to SQLite prowadzone przez Cloudflare.
- **Postgres** – „duża” baza danych (Supabase ją udostępnia razem z logowaniem użytkowników).
- **Licznik odwiedzin (GoatCounter, Plausible)** – gotowa usługa: wklejamy jeden skrypt, a ona liczy wejścia i proste zdarzenia. Nic nie programujemy po stronie serwera, ale też niewiele możemy dopasować.

## Możliwości

### A. Gotowy licznik odwiedzin (GoatCounter / Plausible)

Wklejamy skrypt do `index.html`; z gry wysyłamy zdarzenia typu „nowa gra 256”, „gra 10 min”.

- **Plusy:** najmniej pracy (godzina–dwie), zero utrzymania, dba o prywatność (nie pokazuje IP).
- **Minusy:** widać **liczby**, nie konkretne osoby i ich sesje; nie da się na tym zrobić zapisu w chmurze ani rankingów – przy etapie 8 i tak potrzebny będzie backend.
- **Koszt:** GoatCounter darmowy przy niekomercyjnym użyciu; Plausible płatny (lub samodzielny hosting).

### B. Cloudflare Workers + D1 (SQLite) ⭐ obecny kandydat

Mała funkcja w Cloudflare przyjmuje zdarzenia z gry i zapisuje je w bazie D1. Strona zostaje na GitHub Pages.

- **Plusy:** pełna kontrola nad tym, co zbieramy (nazwa firmy, identyfikator gracza, czas grania, rozmiar mapy…); brak serwera do utrzymania; **ta sama baza** posłuży potem do zapisu w chmurze i rankingów; SQLite jest proste do zrozumienia i przeglądania.
- **Minusy:** trzeba napisać i wdrożyć Workera (kilkadziesiąt linii) i założyć konto Cloudflare; podgląd statystyk na początek przez zapytania SQL (albo prostą stronę „admin”).
- **Koszt:** darmowy próg z dużym zapasem na testy (rzędu 100 tys. zapytań dziennie do Workerów, kilka GB w D1 – **sprawdzić aktualne limity przed decyzją**).
- **IP:** Worker widzi IP gracza, więc *da się* je zapisać – patrz „Łączenie sesji i IP” niżej.

### C. Supabase (Postgres + logowanie)

Gotowa baza z kontami użytkowników, wywoływana bezpośrednio z gry.

- **Plusy:** gotowe **prawdziwe konta** (e-mail, Google…), gdyby kiedyś były potrzebne; panel do przeglądania danych.
- **Minusy:** więcej rzeczy do zrozumienia (uprawnienia do tabel, klucze); na darmowym planie projekt bez ruchu jest usypiany po kilku dniach; konta to więcej danych osobowych do pilnowania.
- **Koszt:** darmowy plan wystarcza na testy (sprawdzić limity).

### D. Własny mały VPS z SQLite

Wynajęty serwer (np. kilka euro miesięcznie), na nim nasz program i plik SQLite.

- **Plusy:** pełna kontrola, wszystko w jednym miejscu, łatwo przenieść.
- **Minusy:** **my utrzymujemy serwer**: aktualizacje, kopie zapasowe, certyfikat HTTPS, bezpieczeństwo, co jeśli padnie w nocy. Najwięcej pracy na dłuższą metę.
- **Koszt:** stały, mały abonament.

### Porównanie

| | A. Licznik | B. Workers + D1 | C. Supabase | D. VPS + SQLite |
|---|---|---|---|---|
| Praca na start | ⭐ najmniej | mało | średnio | najwięcej |
| Utrzymanie | brak | brak | małe | **nasze** |
| Kto konkretnie grał | ✗ (tylko liczby) | ✓ | ✓ | ✓ |
| Zapis w chmurze, rankingi | ✗ | ✓ | ✓ | ✓ |
| Prawdziwe konta (logowanie) | ✗ | do dopisania | ✓ gotowe | do dopisania |
| Koszt na testy | 0 zł | 0 zł | 0 zł | kilka €/mies. |

## Kim jest gracz: nazwa firmy, identyfikator, IP

Trzy rzeczy, które łatwo pomylić:

1. **Nazwa firmy** – wpisuje ją gracz przy nowej grze. Jest czytelna („Kolej Żelazna”), ale gracz może ją zmienić przy kolejnej grze, a dwie osoby mogą wpisać tę samą.
2. **Identyfikator gracza** – losowy kod (np. `a7f3…`) tworzony przy pierwszym uruchomieniu i zapisany w przeglądarce. Ten sam komputer i przeglądarka = ten sam gracz, nawet gdy zmieni nazwę firmy. Nie mówi nic o tym, kim jest człowiek.
3. **IP** – adres, z którego przychodzi zapytanie. Wydaje się dobrym „loginem”, ale:
   - **zmienia się** (telefon w innej sieci, domowy router po restarcie);
   - bywa **wspólne** dla wielu osób (biuro, akademik, sieć komórkowa);
   - to **dane osobowe** w rozumieniu RODO.

**Wniosek z rozmowy:** łączyć sesje po **identyfikatorze z przeglądarki**, pokazywać je pod **nazwą firmy**. IP najwyżej jako dodatkowa wskazówka (np. „te dwa identyfikatory to pewnie ta sama osoba na dwóch urządzeniach”), i tylko jeśli naprawdę potrzebne.

Słabe miejsce identyfikatora: inna przeglądarka, tryb prywatny albo wyczyszczone dane strony = nowy gracz. Na testy z kilkoma znajomymi to nie problem; gdyby przeszkadzało – **kod testera w linku** (`…/?tester=ania`) albo w przyszłości prawdziwe konta (opcja C).

## RODO w skrócie

- Nazwa firmy i losowy identyfikator **nie są** danymi osobowymi, dopóki nikt nie wpisze tam imienia i nazwiska.
- **IP jest** daną osobową. Jeśli je zapisujemy: krótka informacja w grze, co i po co zbieramy; przechowywanie ograniczone w czasie (np. 30 dni); najlepiej zapisywać skrót (hash) zamiast pełnego adresu.
- Niezależnie od wyboru: w Menu krótki tekst „Gra wysyła anonimowe statystyki: nazwa firmy, czas grania, rozmiar mapy” – i najlepiej przełącznik, żeby to wyłączyć.

## Co by zbierać na start (szkic dla opcji B)

Jedna tabela zdarzeń w SQLite:

| kolumna | przykład | po co |
|---|---|---|
| `player_id` | `a7f3c2…` | łączenie sesji jednego gracza |
| `company` | `Kolej Żelazna` | czytelna nazwa w statystykach |
| `event` | `start`, `playing`, `new_game` | co się stało |
| `minutes` | `5` | czas grania (wysyłane co ~5 min) |
| `map_size` | `256` | jakie mapy wybierają gracze |
| `version` | `2026-10-21` | która wersja gry |
| `created_at` | `2026-10-22 18:04` | kiedy |

Z tego jednym zapytaniem SQL wychodzi: kto grał, ile sesji, łączny czas, na jakich mapach.

## Proponowana kolejność

1. **Nazwa firmy** przy nowej grze – sama w sobie fajna funkcja, bez żadnego backendu.
2. **Identyfikator gracza** w przeglądarce + lokalne statystyki w Menu (czas grania, liczba sesji) – też bez backendu.
3. **Worker + D1**: wysyłanie zdarzeń z tabeli wyżej, informacja w Menu, przełącznik „nie wysyłaj”.
4. Prosta strona z podsumowaniem dla nas (kto, ile, kiedy).
5. Etap 8: zapis w chmurze i rankingi na tej samej bazie.

## Rankingi a oszukiwanie (z audytu 2026-10-30)

Cała gra liczy się w przeglądarce, więc gracz może zmienić pieniądze w zapisie albo w konsoli. Dla gry single-player to w porządku, ale **ranking nie może wierzyć liczbom wysłanym z przeglądarki**. Możliwe podejścia, gdy dojdziemy do etapu 8:
- serwer dostaje cały zapis i sam liczy wynik (symulacja jest deterministyczna i działa w Node – testy już to robią); najprościej: sprawdzić, czy zapis jest spójny, i policzyć z niego wartość firmy;
- mocniej: serwer dostaje ziarno mapy + listę komend gracza i odtwarza grę (powtórka); pewne, ale drogie przy długich grach;
- rankingi tylko „dla zabawy”, bez nagród – wtedy wystarczy podstawowa kontrola.

Nazwy firm z rankingu wyświetlać zawsze jako tekst (Preact robi to sam; nie używać `dangerouslySetInnerHTML`).

## Otwarte pytania (do decyzji)

- Czy wystarczy nam „liczba i czas” (opcja A), czy chcemy widzieć konkretnych graczy (B / C / D)?
- Czy IP jest nam naprawdę potrzebne, skoro identyfikator i nazwa firmy łączą sesje?
- Czy kiedyś planujemy prawdziwe konta (logowanie)? Jeśli tak – warto od razu rozważyć C.
- Kto ma dostęp do statystyk i gdzie je oglądamy (zapytania SQL czy prosta strona)?
