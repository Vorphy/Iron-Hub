# 08 – Plan testów (gra od zera, 2026-11-01)

Cel: sprawdzić na świeżej grze wszystko, co weszło 31.10 (dzielnice, łączenie miast, kolory, premia ×2, metro w dzielnicach, parki i remonty, domy, dłuższy dzień, zjazd do zajezdni), i zebrać liczby do strojenia ekonomii.

**Jak zgłaszać:** przy każdym punkcie wpisz ✅ / ❌ i krótką uwagę. Przy ❌: **data w grze, co zrobiłeś, co się stało, czego się spodziewałeś** + zrzut ekranu (do `docs/`, jak dotąd). Przy większych błędach dodatkowo **Menu → Plik → Eksportuj do pliku** i wrzuć plik do `docs/testy/` – mogę go wczytać w teście i sprawdzić stan gry.

---

## 0. Start – zapisz ustawienia

| Co | Wartość |
|---|---|
| Rozmiar mapy | (proponuję **256**) |
| Ziarno mapy (seed) | |
| Miasta / przemysł / surowce | (proponuję miasta: **Dużo** – szybciej się zrastają) |
| Rok startu | (proponuję **1950**) |
| Nazwa firmy | |

- [ ] Kolory dzielnic są **wyłączone** (🏘 niepodświetlony), bo żadne miasto nie ma jeszcze dzielnic.
- [ ] Dzień przy 1× trwa ok. **2,2 s** (policz 10 dni na stoperze: ok. 22 s).

## 1. Pierwszy rok – zwykła gra

Graj normalnie: pierwsza linia pasażerska i/lub węglowa.

- [ ] Pociągi jadą tak samo szybko jak wcześniej, ale w ciągu dnia przejeżdżają trochę dalej.
- [ ] Postój na stacji to ok. 2 dni (tyle co wcześniej w dniach).
- [ ] **Zjazd do zajezdni z pełnego ładunku:** postaw pociąg z „pełnym ładunkiem” na stacji, gdzie mało ładunku → kliknij „Do zajezdni” → rusza od razu.

**Zapisz na koniec 1. roku:** pieniądze, przychód i koszty roku (okno Finanse), liczba pociągów.

## 2. Miasta rosną – domy, kościoły, parki, budowa

Przy 2–4× obserwuj 2–3 obsługiwane miasta.

- [ ] Nowe domy przechodzą 3 etapy: **wykop → rusztowanie → stan surowy** (po ok. 5 dni każdy).
- [ ] **Remonty:** w większym mieście co jakiś czas gotowy dom znów przechodzi przez etapy budowy (ok. 1 na 100 domów miesięcznie – w małym mieście rzadko).
- [ ] **Kościół** przy rynku (od 8 domów), z czasem **parki / stawy / pomniki / fontanny** (ok. 1 na 25 domów).
- [ ] **Ceglane domy subarktyczne** nie dominują – na oko najwyżej co trzeci budynek.
- [ ] Domy nie zmieniają wyglądu „same z siebie” co chwilę (dopuszczalne: pojedyncze zmiany na początku roku, gdy wejdzie nowy budynek).

## 3. Metro – od 5 000 mieszkańców

- [ ] Komunikat „X domaga się metra!” przy ok. 5 000 mieszkańców.
- [ ] Bez metra miasto powyżej 10 000 przestaje rosnąć (okno miasta: czerwony napis o wstrzymanym rozwoju).
- [ ] Po zbudowaniu stacji metra (Q – widok −1) miasto rośnie wyraźnie szybciej.

## 4. Nowe dzielnice (miasto zabudowane do brzegu, zwykle ~10–14 tys. z metrem)

- [ ] Komunikat „X rośnie – powstaje nowa dzielnica X – …”; kliknięcie przenosi do niej.
- [ ] Nowa dzielnica powstaje **przy zabudowie** i od razu ma domy (nie w polu / nad wodą).
- [ ] W następnych miesiącach wokół niej przybywa domów.
- [ ] Nazwy: „Zatorze” (gdy za torami), strona świata („Północ”, „Wschód”…) albo osiedle z listy; **w jednym mieście bez powtórzeń**.
- [ ] Na mapie: „Miasto – Dzielnica”, zwykłą (niepogrubioną) czcionką, w środku zabudowy dzielnicy.
- [ ] Okno miasta: lista dzielnic z mieszkańcami, 🚇 przy dzielnicach z peronem metra.
- [ ] Brak dzielnic-widm: jeśli jakaś nie ma domów, znika przy zamknięciu miesiąca.

## 5. Zrastanie się miast

Miasta rosnące ku sobie (albo połączone ulicami).

- [ ] Gdy **domy się stykają albo łączy je droga** – komunikat „Miasto Y zrosło się z miastem X – za rok stanie się jego dzielnicą”.
- [ ] Jeden pusty kafelek przerwy bez drogi – **brak** zrastania.
- [ ] Okno mniejszego miasta pokazuje, ile miesięcy zostało; okno większego – że przejmie mniejsze.
- [ ] Po **12 miesiącach** styku: komunikat o wchłonięciu, mniejsze miasto znika z listy, jest dzielnicą „X – Y”, stacje i zakłady zachowują nazwy.
- [ ] Łańcuch (A styka się z B, B z C) kończy się jednym miastem.

**Zapisz:** datę pierwszego styku i datę wchłonięcia (powinno być ~12 mies.).

## 6. Kolory dzielnic (🏘 / I / Menu → Dzielnice)

- [ ] Włączanie i wyłączanie działa wszystkimi trzema sposobami.
- [ ] Kolorują się **ulice i grunt przy domach**, budynki zostają w swoich kolorach – bez „duchów” i migania.
- [ ] **Sąsiednie dzielnice mają różne kolory** (także na styku dwóch miast).
- [ ] Po wczytaniu zapisu kolory są wyłączone.
- [ ] FPS (górny pasek) z kolorami i bez – podobny przy dalekim i bliskim zoomie.

## 7. Ruch między dzielnicami (premia ×2)

Linia (metro albo na powierzchni) między stacjami w **różnych dzielnicach tego samego miasta**.

- [ ] Przejazd **≥ 10 kafelków**: w oknie miasta rośnie „Między dzielnicami (premia ×2)”, a kwota nad pociągiem jest wyraźnie wyższa niż na podobnej linii w obrębie jednej dzielnicy.
- [ ] Przejazd **< 10 kafelków** przez granicę dzielnic – bez premii.
- [ ] Linia między dwoma **różnymi miastami** – bez premii.

## 8. Zapis i wczytanie

- [ ] Zapisz grę, wczytaj: ta sama data, dzielnice, liczniki zrastania, pociągi.
- [ ] (Jeśli masz stary zapis sprzed 31.10) wczytuje się z **tą samą datą** co przed zmianą długości dnia.

## 9. Liczby do strojenia (co rok gry, np. 1950–1960)

| Rok | Pieniądze | Przychód / rok | Koszty / rok | Największe miasto (mieszk.) | Dzielnic | Między dzielnicami / mies. | Pociągów | FPS |
|---|---|---|---|---|---|---|---|---|
| 1951 | | | | | | | | |
| 1952 | | | | | | | | |
| 1953 | | | | | | | | |
| 1955 | | | | | | | | |
| 1960 | | | | | | | | |

**Wrażenia (krótko):** czy tempo dni pasuje, czy miasta rosną za szybko / za wolno, czy premia ×2 nie robi „maszynki do pieniędzy”, co było nudne, co fajne.

---

## Co mi podać jutro

1. Ten plik z ✅/❌ i uwagami (albo wklej go do rozmowy).
2. Zrzuty błędów w `docs/` z datą w grze w nazwie albo opisie.
3. Przy poważnym błędzie: eksport zapisu do `docs/testy/`.
4. Tabelę z punktu 9 – na jej podstawie zdecydujemy o stawkach, bonusie z metra i premii ×2.
