# 01 – Wizja gry

## Założenie

„Iron Hub” to darmowa gra przeglądarkowa inspirowana *OpenTTD*, oczyszczona z mikrozarządzania. Gracz jest magnatem kolejowym: buduje tory, stacje i puszcza pociągi. Wszystko inne – miasta, przemysł, lokalny transport – działa samo i reaguje na jego sieć.

Stylistyka: **klasyczna izometria w duchu TTD**, pixel art, retro-nowoczesny interfejs.

## Wyróżniki (USP)

1. **Tylko kolej.** Gracz nie buduje dróg, linii autobusowych ani lotnisk. Ruch pomocniczy (busy, ciężarówki, auta) jest generowany przez grę i ma charakter **wyłącznie wizualny** – pokazuje, że miasto żyje, ale nie wpływa na liczby (patrz [03-mechaniki](03-mechaniki.md#ruch-lokalny-ai)).
2. **Świat reaguje na stacje.** Postawienie stacji przy mieście lub fabryce uruchamia ich rozwój. Miasta rosną wzdłuż korytarzy kolejowych.
3. **Dwa tryby sygnalizacji na jednym silniku.**
   - *Amator* – gra sama stawia semafory; pociągi nigdy się nie zderzają ani nie blokują w martwym punkcie na prostych układach.
   - *Ekspert* – pełny zestaw sygnałów w stylu OpenTTD (blokowe, ścieżkowe, jednokierunkowe) stawiany ręcznie.
4. **Fabryki rosną i maleją powoli, zależnie od zaopatrzenia.** Nie ma twardej blokady z braku surowców – jest progresywny wzrost przy dobrym zaopatrzeniu i powolny spadek przy złym (szczegóły: [03-mechaniki](03-mechaniki.md#fabryki)).

## Pętle rozgrywki

### Pętla krótka (minuty)
1. **Budowa** – gracz wytycza tory i stawia stację przy osiedlu / fabryce.
2. **Reakcja świata** – stacja zaczyna zbierać pasażerów i ładunek ze swojego zasięgu; wokół pojawia się ruch lokalny.
3. **Transport** – gracz kupuje pociąg, ustala rozkład (lista stacji), pociąg wozi ładunek i zarabia.

### Pętla długa (godziny)
4. **Rozwój** – dobrze zaopatrzone fabryki podnoszą poziom, miasta rosną wzdłuż linii, rośnie popyt.
5. **Modernizacja** – gracz rozbudowuje sieć: więcej torów, stacji, szybsze lokomotywy, bardziej złożona sygnalizacja.

## Model biznesowy

- Gra **bezpłatna**.
- W przyszłości możliwe płatne dodatki: pakiety pojazdów (lokomotywy, wagony), być może inne treści.
- Konsekwencja dla architektury: pojazdy i treści muszą być **definiowane danymi** (pliki definicji), a nie zaszyte w kodzie – wtedy dodatek = pakiet danych + grafik.
- Kwestia licencji grafiki ma wpływ na monetyzację – patrz [05-decyzje](05-decyzje.md).
