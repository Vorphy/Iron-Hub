# Atlas grafiki z OpenGFX

Buduje `public/gfx/opengfx/` (atlas PNG + `gfx.json`) ze źródeł OpenGFX i tabel OpenTTD.
Python 3 + Pillow.

```bash
git clone --depth 1 https://github.com/OpenTTD/OpenGFX.git /tmp/ogfx
# Tabele z OpenTTD (src/table/*.h i palette_convert.h) – wystarczą pojedyncze pliki:
mkdir /tmp/ottd && cd /tmp/ottd
for f in sprites.h town_land.h industry_land.h build_industry.h tree_land.h palettes.h palette_convert.h; do
  curl -sfLO "https://raw.githubusercontent.com/OpenTTD/OpenTTD/master/src/table/$f"
done
python build_atlas.py /tmp/ogfx /tmp/ottd ../../public/gfx/opengfx
```

- `parse_pnml.py` – czyta definicje sprite'ów OpenGFX (`*.pnml`): numer TTD → wycinek PNG i przesunięcie.
- `build_atlas.py` – wybiera potrzebne sprite'y, przekolorowuje (kolor firmy, kolory domów), pakuje w atlas
  i dopisuje układy domów, zakładów, drzew i pojazdów.
- `sheet.py` – plansza podglądu zakresu numerów (do dobierania sprite'ów).

Pliki PNG OpenGFX są w palecie Windows; kolory liczymy jak OpenTTD: indeks → `_palmap_w2d` → paleta DOS.
Osie: nasze `x` to `y` w OpenTTD (nazwy boków NE/SE/SW/NW są wspólne).
