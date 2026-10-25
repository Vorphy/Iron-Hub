# Grafika OpenGFX – placeholder na czas testów

Pliki `atlas-*.png` zawierają sprite'y z **OpenGFX** (https://github.com/OpenTTD/OpenGFX,
rewizja `bdea551`, 2026-10-24) – darmowej grafiki bazowej dla OpenTTD, na licencji **GNU GPL v2**
(pełny tekst: `LICENSE.txt`). Autorzy: zespół OpenGFX i współtwórcy (lista w repozytorium OpenGFX).

`gfx.json` zawiera położenie sprite'ów w atlasie oraz układy domów, zakładów, drzew, peronów i pojazdów
wyprowadzone z tabel OpenTTD (https://github.com/OpenTTD/OpenTTD, `src/table/*.h`, GNU GPL v2).

Zmiany względem oryginału: wycięcie wybranych sprite'ów i złożenie ich w atlas, przeliczenie palety
(Windows → DOS, kolory animowane – pierwsza klatka), przekolorowanie elementów w kolorze firmy,
półprzezroczyste szyby dachów peronów. Skrypt: `tools/opengfx/build_atlas.py`.

Zgodnie z decyzją ADR 13 (`docs/05-decyzje.md`) ta grafika służy tylko do testów i przed wydaniem
zostanie zastąpiona grafiką z licencją pozwalającą na zamknięty kod (np. własną albo CC0).
Sprite'y mają numery jak w TTD – nową grafikę można podmieniać kafelek po kafelku.
