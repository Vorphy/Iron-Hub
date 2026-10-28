"""Składa atlas grafiki gry z OpenGFX (GPL v2) i tabel układów z OpenTTD (GPL v2).

python build_atlas.py <katalog OpenGFX> <katalog src OpenTTD> <katalog wyjściowy>

Wynik: atlas-N.png (strony 2048×2048) i gfx.json:
  frames   – klucz sprite'a -> [strona, x, y, w, h, przes. x, przes. y]; klucz to numer sprite'a TTD
             ("1011"), z przekolorowaniem ("2905@787") albo sprite dodatkowy OpenTTD ("CATENARY:3")
  houses   – domy 1×1 klimatu umiarkowanego i subarktyczne spod linii śniegu, ozdoby (populacja 0), kościoły
             (populacja, lata, warianty: grunt, budynek, przesunięcie i 3 etapy budowy)
  industries – układy kafelków naszych zakładów (współrzędne już w układzie gry)
  trees    – układy drzew na kafelku (jak w OpenTTD)
  engines / wagons / company – sprite'y pojazdów i kolor firmy

Uwaga na osie: x w grze to y w OpenTTD (i odwrotnie) – nazwy boków (NE, SE…) są wspólne.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image

import atlas_lib
from atlas_lib import load_sprite, load_sprite_indices, set_palette
from parse_pnml import parse_opengfx

PAGE = 2048
PAD = 1

# Kolor firmy (stacje, zajezdnie, budynki zakładów): PALETTE_TO_RED.
COMPANY = 779
# Kolory domów z elementami w kolorze firmy (czerwony, niebieski, brązowy, kremowy).
HOUSE_COLOURS = [779, 783, 788, 784]
# Kolory firmowe TTD (PALETTE_TO_*), od 775.
COLOURS = {
    775: 'dark_blue', 776: 'pale_green', 777: 'pink', 778: 'yellow', 779: 'red', 780: 'light_blue',
    781: 'green', 782: 'dark_green', 783: 'blue', 784: 'cream', 785: 'mauve', 786: 'purple',
    787: 'orange', 788: 'brown', 789: 'grey', 790: 'white',
}

# Nasze lokomotywy -> pierwszy sprite zestawu TTD i liczba widoków (8 – różne przody, 4 – symetryczne).
ENGINES = {
    'iskra': (2921, 8),  # Kirby Paul Tank
    'grom': (2905, 8),  # Chaney Jubilee
    'strzala': (2913, 8),  # Ginzu A4
    'orzel': (2913, 8),
    'bizon': (2929, 4),  # SH/Hendry 25
    'sokol': (2933, 4),  # UU/37
    'tur': (2937, 4),  # SH/30
    'jastrzab': (2949, 8),  # Manley-Morel VT
    'elektra': (2973, 8),  # T.I.M.
    'wolt': (2957, 8),  # Dash
    'piorun': (2941, 8),  # SH 125
    'mamut': (2973, 8),
    'blyskawica': (2965, 8),  # Asia Star
}

# ---------------------------------------------------------------- tabele OpenTTD

def sprite_constants(ottd: Path) -> dict[str, int]:
    """Stałe SPR_* i PALETTE_* z sprites.h (tylko te, które da się policzyć)."""
    text = (ottd / 'sprites.h').read_text(encoding='utf-8')
    consts: dict[str, int] = {}
    pattern = re.compile(r'^\s*(?:static\s+const(?:expr)?\s+\w+\s+)?(\w+)\s*=\s*([^;,]+)[;,]', re.M)
    for _ in range(4):  # kilka przebiegów – stałe zależą od innych
        for m in pattern.finditer(text):
            name, expr = m.group(1), m.group(2).split('//')[0].strip()
            if name in consts:
                continue
            try:
                consts[name] = int(eval(expr, {'__builtins__': {}}, dict(consts)))  # noqa: S307
            except Exception:
                pass
    return consts


def c_value(expr: str, consts: dict[str, int]) -> int:
    expr = expr.strip()
    expr = re.sub(r'\|\s*\(\s*1U?\s*<<\s*PALETTE_MODIFIER_\w+\s*\)', '', expr)
    expr = expr.replace('PAL_NONE', '0')
    return int(eval(expr, {'__builtins__': {}}, dict(consts)))  # noqa: S307


def macro_rows(text: str, macro: str) -> list[list[str]]:
    """Argumenty kolejnych wywołań makra (np. M(...)) z uwzględnieniem nawiasów."""
    rows = []
    for m in re.finditer(r'(?<![A-Za-z_])' + re.escape(macro) + r'\(', text):
        i = m.end()
        depth = 1
        cur = ''
        args = []
        while depth:
            ch = text[i]
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    break
            if ch == ',' and depth == 1:
                args.append(cur.strip())
                cur = ''
            else:
                cur += ch
            i += 1
        args.append(cur.strip())
        rows.append(args)
    return rows


def has_colour_modifier(expr: str) -> bool:
    return 'PALETTE_MODIFIER_COLOUR' in expr


def parse_houses(ottd: Path, consts: dict[str, int]) -> list[dict]:
    text = (ottd / 'town_land.h').read_text(encoding='utf-8')
    draw = macro_rows(text[text.find('_town_draw_tile_data[]'):text.find('#undef M')], 'M')
    specs_text = text[text.find('_original_house_specs[]'):]
    specs = []
    for m in re.finditer(r'MS\((.*?)\), // ([0-9A-F]{2})', specs_text, re.S):
        body = m.group(1)
        nums = re.findall(r'^\s*([0-9]+|CalendarTime::MAX_YEAR)\s*,\s*([0-9]+|CalendarTime::MAX_YEAR)\s*,\s*(\d+)', body)
        a, b, pop = nums[0]
        specs.append({
            'min': int(a),
            'max': 5000000 if 'MAX' in b else int(b),
            'pop': int(pop),
            'size1': 'Size1x1' in body,
            'temperate': 'ClimateTemperate' in body,
            'below_snow': 'ClimateSubarcticBelowSnow' in body,
            'church': 'IsChurch' in body,
            'stadium': 'IsStadium' in body,
        })
    houses = []
    for i, spec in enumerate(specs):
        # Umiarkowany i subarktyczny spod linii śniegu (bez śniegu wyglądają jak zwykłe domy).
        if not (spec['size1'] and (spec['temperate'] or spec['below_snow'])):
            continue

        def stage(v: int, st: int) -> dict:
            s1, p1, s2, p2, dx, dy = draw[i * 16 + v * 4 + st][:6]
            pal = c_value(p2, consts)
            # Kolor firmy w domach: w OpenTTD losowy kolor domu – tu stały dla wariantu.
            if not pal and has_colour_modifier(s2):
                pal = HOUSE_COLOURS[v]
            return {
                'ground': c_value(s1, consts),
                'gpal': c_value(p1, consts),
                'building': c_value(s2, consts),
                'pal': pal,
                'dx': int(dx),
                'dy': int(dy),
            }

        # Wariant: gotowy dom (etap 3) i trzy etapy budowy (wykop, rusztowanie, stan surowy).
        variants = [{**stage(v, 3), 'stages': [stage(v, st) for st in range(3)]} for v in range(4)]
        houses.append({
            'id': i,
            'pop': spec['pop'],
            'min': spec['min'],
            'max': spec['max'],
            'church': spec['church'],
            'arctic': not spec['temperate'],
            'variants': variants,
        })
    return houses


def parse_industry_tiles(ottd: Path, consts: dict[str, int]) -> list[dict]:
    text = (ottd / 'industry_land.h').read_text(encoding='utf-8')
    rows = macro_rows(text[text.find('_industry_draw_tile_data['):text.find('#undef M')], 'M')
    out = []
    for g in range(len(rows) // 4):
        s1, p1, s2, p2, dx, dy = rows[g * 4 + 3][:6]
        out.append({
            'ground': c_value(s1, consts),
            'building': c_value(s2, consts),
            'cc': has_colour_modifier(s2),
            'dx': int(dx),
            'dy': int(dy),
        })
    return out


def parse_layout(ottd: Path, name: str) -> list[tuple[int, int, int]]:
    text = (ottd / 'build_industry.h').read_text(encoding='utf-8')
    i = text.find(f'_tile_table_{name} {{')
    body = text[i:text.find('};', i)]
    return [(int(a), int(b), int(c)) for a, b, c in re.findall(r'\{\{\s*(-?\d+),\s*(-?\d+)\}\s*,\s*(\d+)\}', body)]


def parse_trees(ottd: Path) -> dict:
    text = (ottd / 'tree_land.h').read_text(encoding='utf-8')
    xy_body = text[text.find('_tree_layout_xy'):]
    xy_body = xy_body[:xy_body.find('};')]
    pairs = [(int(a), int(b)) for a, b in re.findall(r'\{\s*(\d+),\s*(\d+)\s*\}', xy_body)]
    xy = [pairs[i * 4:i * 4 + 4] for i in range(4)]
    spr_body = text[text.find('_tree_layout_sprite'):]
    spr_body = spr_body[:spr_body.find('};')]
    rows = re.findall(r'\{\s*\{\s*(0x[0-9a-f]+),[^}]*\},\s*\{\s*(0x[0-9a-f]+),[^}]*\},\s*\{\s*(0x[0-9a-f]+),[^}]*\},\s*\{\s*(0x[0-9a-f]+)', spr_body)
    # Drzewa klimatu umiarkowanego: typy 0–11 (po 4 układy).
    layouts = [[int(v, 16) for v in r] for r in rows[:48]]
    return {'xy': xy, 'layouts': layouts}


def parse_recolours(root: Path) -> dict[int, bytes]:
    """Mapy przekolorowania (recolour_sprite) z base-0775 i base-1438."""
    out: dict[int, bytes] = {}
    for name in ('base-0775-recolor.pnml', 'base-1438-recolor-church.pnml'):
        text = (root / 'sprites' / 'base' / name).read_text(encoding='utf-8')
        defines: dict[str, tuple[list[str], str]] = {}
        for m in re.finditer(r'#define\s+(\w+)\(([^)]*)\)\s+(.*)', text):
            defines[m.group(1)] = ([p.strip() for p in m.group(2).split(',')], m.group(3))

        def expand(body: str) -> str:
            for _ in range(3):
                for mac, (params, repl) in defines.items():
                    def sub(mm, params=params, repl=repl):
                        args = [a.strip() for a in mm.group(1).split(',')]
                        r = repl
                        for p, a in sorted(zip(params, args), key=lambda t: -len(t[0])):
                            r = re.sub(r'\b' + p + r'\b', a, r)
                        return r
                    body = re.sub(mac + r'\(([^)]*)\)', sub, body)
            return body

        for m in re.finditer(r'base_graphics\s+\w+\((\d+),\s*""\)\s*\{(.*?)\n\}', text, re.S):
            start = int(m.group(1))
            blocks = re.findall(r'recolour_sprite\s*\{(.*?)\}', m.group(2), re.S)
            for k, block in enumerate(blocks):
                block = re.sub(r'//[^\n]*', '', expand(block))
                lut = list(range(256))
                for a, b, c, d in re.findall(r'(\w+)\s*(?:\.\.\s*(\w+))?\s*:\s*([\w+]+)\s*(?:\.\.\s*([\w+]+))?\s*;', block):
                    av = int(eval(a))  # noqa: S307
                    bv = int(eval(b)) if b else av  # noqa: S307
                    cv = int(eval(c))  # noqa: S307
                    for n in range(bv - av + 1):
                        lut[av + n] = cv + n if d else cv
                out[start + k] = bytes(lut)
    return out


def ttd_palette(ottd: Path) -> list[int]:
    """Kolory indeksów palety Windows (jak w plikach OpenGFX) według palety DOS z palettes.h; kolory animowane – pierwsza klatka."""
    text = (ottd / 'palettes.h').read_text(encoding='utf-8')
    main = text[text.find('_palette = {'):text.find('First dirty')]
    cols = [(0, 0, 0)] + [tuple(int(v) for v in m) for m in re.findall(r'M\(\s*(\d+),\s*(\d+),\s*(\d+)\)', main)]
    extra = text[text.find('_extra_palette_values = {'):]
    groups = [
        [tuple(int(v) for v in m) for m in re.findall(r'M\(\s*(\d+),\s*(\d+),\s*(\d+)\)', block)]
        for block in re.findall(r'\{\s*(M\(.*?)\}', extra, re.S)
    ]
    dark_water, _dark_toy, lighthouse, refinery, fizzy, glitter = groups[:6]
    anim = fizzy[:5] + refinery[:7] + [(252, 0, 0), (40, 0, 0)] + lighthouse[:4] + dark_water[:5] + [glitter[i] for i in (0, 3, 6, 9, 12)]
    cols = cols[:227] + anim + [cols[-1]]
    assert len(cols) == 256, len(cols)
    # Pliki OpenGFX są w palecie Windows: indeks -> indeks DOS (_palmap_w2d) -> kolor.
    conv = (ottd / 'palette_convert.h').read_text(encoding='utf-8')
    body = conv[conv.find('_palmap_w2d'):]
    body = re.sub(r'//[^\n]*', '', body[body.find('{') + 1:body.find('}')])
    w2d = [int(v) for v in re.findall(r'\d+', body)]
    assert len(w2d) == 256, len(w2d)
    return [c for i in range(256) for c in cols[w2d[i]]]


# ---------------------------------------------------------------- atlas

class Atlas:
    def __init__(self, root: Path, table: dict, recolours: dict[int, bytes]):
        self.root = root
        self.table = table
        self.recolours = recolours
        self.cache: dict = {}
        self.images: dict[str, tuple[Image.Image, int, int]] = {}
        self.missing: list[str] = []

    def add(self, sid: int | str, pal: int = 0) -> str | None:
        """Dodaje sprite (opcjonalnie przekolorowany); zwraca klucz albo None, gdy go nie ma."""
        if not sid:
            return None
        key = f'{sid}@{pal}' if pal else str(sid)
        if key in self.images:
            return key
        entry = self.table.get(str(sid))
        if not entry or entry[0] is None or entry[3] <= 0 or entry[4] <= 0:
            self.missing.append(key)
            return None
        if pal and pal in self.recolours:
            idx = load_sprite_indices(self.root, entry, self.cache)
            remapped = Image.frombytes('P', idx.size, idx.tobytes().translate(self.recolours[pal]))
            remapped.putpalette(atlas_lib.PALETTE)
            rgba = remapped.convert('RGBA')
            rgba.putalpha(Image.frombytes('L', idx.size, idx.tobytes().translate(bytes([0] + [255] * 255))))
            img = rgba
        else:
            img = load_sprite(self.root, entry, self.cache)
        self.images[key] = (img, entry[5], entry[6])
        return key

    def add_synthetic(self, key: str, img: Image.Image, ox: int, oy: int) -> str:
        self.images[key] = (img, ox, oy)
        return key

    def pack(self, out: Path) -> dict:
        items = sorted(self.images.items(), key=lambda kv: (-kv[1][0].height, -kv[1][0].width))
        pages: list[Image.Image] = []
        frames: dict[str, list[int]] = {}
        x = y = shelf = 0
        page = None
        for key, (img, ox, oy) in items:
            w, h = img.width + PAD * 2, img.height + PAD * 2
            if page is None or x + w > PAGE:
                x = 0
                y += shelf
                shelf = 0
            if page is None or y + h > PAGE:
                page = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))
                pages.append(page)
                x = y = shelf = 0
            page.paste(img, (x + PAD, y + PAD))
            frames[key] = [len(pages) - 1, x + PAD, y + PAD, img.width, img.height, ox, oy]
            x += w
            shelf = max(shelf, h)
        names = []
        for i, p in enumerate(pages):
            # Ostatnią stronę przycinamy do zajętej wysokości.
            if i == len(pages) - 1:
                p = p.crop((0, 0, PAGE, min(PAGE, 1 << (y + shelf - 1).bit_length())))
            name = f'atlas-{i}.png'
            p.save(out / name, optimize=True)
            names.append(name)
        return {'pages': names, 'frames': frames}


def shore_sprites(atlas: Atlas, root: Path) -> None:
    """Brzegi: plansza seashore_temperate ułożona jak kafelki terenu (19 zboczy) – klucze SHORE:n."""
    ground = [
        (0, 31, 0), (80, 31, 0), (160, 23, 0), (240, 23, 0), (320, 31, 0), (398, 31, 0), (478, 23, 0), (558, 23, 0),
        (638, 39, -8), (718, 39, -8), (798, 31, -8), (878, 31, -8), (958, 39, -8), (1038, 39, -8), (1118, 31, -8),
        (1196, 47, -16), (1276, 15, 0), (1356, 31, -8), (1436, 31, -8),
    ]
    file = 'sprites/png/terrain/waterfeatures/seashore_temperate.gimp.png'
    for n, (x, h, oy) in enumerate(ground):
        entry = [file, x + 1, 1, 64, h, -31, oy]
        atlas.add_synthetic(f'SHORE:{n}', load_sprite(root, entry, atlas.cache), -31, oy)


def nearest_colour(hex_color: str, recolours: dict[int, bytes], palette: list[int]) -> int:
    r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
    best, best_d = 775, 1e9
    for pal in COLOURS:
        i = recolours[pal][0xCA]
        pr, pg, pb = palette[i * 3:i * 3 + 3]
        d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
        if d < best_d:
            best, best_d = pal, d
    return best


def main() -> None:
    root, ottd, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    table = {str(k): v for k, v in parse_opengfx(root).items()}
    consts = sprite_constants(ottd)
    recolours = parse_recolours(root)
    atlas = Atlas(root, table, recolours)
    palette = ttd_palette(ottd)
    set_palette(palette)

    # Teren, woda, brzegi.
    for sid in range(3924, 4062):
        atlas.add(sid)
    shore_sprites(atlas, root)
    # Fundamenty pod torami na zboczach: poziome (989 + zbocze) i pochyłe z dodatków OpenTTD.
    for sid in range(990, 1004):
        atlas.add(sid)
    for k in range(8):
        atlas.add(f'FOUNDATIONS_SLOPES_HALFTILES:{k}')
    # Tory, zajezdnie, perony i dachy stacji (kolor firmy), semafory.
    for sid in range(1005, 1069):
        atlas.add(sid)
    for sid in list(range(1063, 1069)) + list(range(1069, 1087)):
        atlas.add(sid, COMPANY)
    # Szklane dachy peronów (w TTD półprzezroczyste): klucz "1083@glass".
    for sid in range(1083, 1087):
        key = atlas.add(sid, COMPANY)
        img, ox, oy = atlas.images[key]
        glass = img.copy()
        glass.putalpha(img.getchannel('A').point(lambda a: a * 45 // 100))
        atlas.add_synthetic(f'{sid}@glass', glass, ox, oy)
    for sid in range(1275, 1307):
        atlas.add(sid)
    # Semafory ścieżkowe (dwukierunkowe 112–127, jednokierunkowe 128–143) z dodatków OpenTTD.
    for k in range(112, 144):
        atlas.add(f'PRE_SIGNAL_SEMAPHORE_PBS:{k}')
    # Drogi (z chodnikiem i bez), przejazdy.
    for sid in range(1313, 1420):
        atlas.add(sid)
    # Sieć trakcyjna, tunele, mosty.
    for k in range(48):
        atlas.add(f'CATENARY:{k}')
    for sid in range(2365, 2373):
        atlas.add(sid)
    for k in range(16):
        atlas.add(f'RAILTYPE_TUNNELS:{k}')
    for sid in range(2437, 2601):
        atlas.add(sid)
    for k in range(6, 18):
        atlas.add(f'BRIDGE_DECKS:{k}')

    # Domy.
    houses = parse_houses(ottd, consts)
    def add_house_sprites(v: dict) -> None:
        v['ground'] = atlas.add(v['ground'], v.pop('gpal'))
        v['building'] = atlas.add(v['building'], v.pop('pal'))

    for h in houses:
        for v in h['variants']:
            add_house_sprites(v)
            for st in v['stages']:
                add_house_sprites(st)

    # Zakłady: (układ OpenTTD, transpozycja?, wycinek kafelków) -> nasze kafelki.
    tiles = parse_industry_tiles(ottd, consts)
    industry_defs = json.loads((Path(__file__).parents[2] / 'src/data/industries.json').read_text(encoding='utf-8'))
    sizes = {d['id']: d['size'] for d in industry_defs['industries']}
    choices = {
        'coal_mine': ('coal_mine_1', 0, 0, None),
        'power_plant': ('power_station_1', 0, 0, 7),
        'sawmill': ('sawmill_1', 0, 0, None),
        'forest': ('forest_0', 0, 0, None),
        'steel_mill': ('steel_mill_0', 1, 0, 56),
        'ore_mine': ('iron_mine_0', 0, 0, None),
    }
    industries = {}
    for our, (layout_name, sx, sy, filler) in choices.items():
        w, h = sizes[our]
        placed = {}
        for ox, oy, gfx in parse_layout(ottd, layout_name):
            # Nasze x = y OpenTTD, nasze y = x OpenTTD.
            x, y = oy - sy, ox - sx
            if 0 <= x < w and 0 <= y < h:
                placed[(x, y)] = gfx
        for x in range(w):
            for y in range(h):
                if (x, y) not in placed and filler is not None:
                    placed[(x, y)] = filler + ((x + y) & 1 if our == 'steel_mill' else 0)
        out_tiles = []
        for (x, y), gfx in sorted(placed.items()):
            t = tiles[gfx]
            out_tiles.append({
                'x': x,
                'y': y,
                'ground': atlas.add(t['ground']),
                'building': atlas.add(t['building'], COMPANY if t['cc'] else 0),
                'dx': t['dx'],
                'dy': t['dy'],
            })
        industries[our] = out_tiles

    # Drzewa (pełny wzrost i dwa młodsze stadia).
    trees = parse_trees(ottd)
    for row in trees['layouts']:
        for base in row:
            for stage in range(3, 7):
                atlas.add(base + stage)

    # Pojazdy: lokomotywy w kolorze najbliższym naszemu, wagony – w kolorach wszystkich lokomotyw.
    vehicles = json.loads((Path(__file__).parents[2] / 'src/data/vehicles.json').read_text(encoding='utf-8'))
    engine_out = {}
    used_colours = set()
    for e in vehicles['engines']:
        base, views = ENGINES[e['id']]
        pal = nearest_colour(e['color'], recolours, palette)
        used_colours.add(pal)
        for d in range(views):
            atlas.add(base + d, pal)
        engine_out[e['id']] = {'base': base, 'views': views, 'pal': pal}
    # Wagony TTD (pierwszy sprite, widoki; pełny ładunek – osobny zestaw, jeśli jest).
    WAGONS = {
        'osobowy': (2733, 4, None),
        'pocztowy': (2741, 4, None),
        'weglarka': (2737, 4, 2781),
        'rudowy': (2773, 4, 2797),
        'kryty': (2753, 4, None),
        'platforma': (2765, 4, 2789),
    }
    wagon_out = {}
    for wid, (base, views, full) in WAGONS.items():
        for pal in used_colours:
            for d in range(views):
                atlas.add(base + d, pal)
                if full:
                    atlas.add(full + d, pal)
        wagon_out[wid] = {'base': base, 'views': views, 'full': full}

    # Most kratownicowy stalowy (girder): przęsło [spód z torem, barierka z przodu, filar] dla osi X/Y
    # OpenTTD i przyczółki kolejowe (4 pochylone + 4 płaskie rampy, kolejność kierunków SW, SE, NE, NW).
    btext = (ottd / 'bridge_land.h').read_text(encoding='utf-8')

    def bridge_table(name: str) -> list[int]:
        body = btext[btext.find(f'{name}[] = {{'):]
        body = body[:body.find('};')]
        return [c_value(v, consts) for v in re.findall(r'\{\s*([^,{}]+?)\s*,\s*[A-Z_]+\s*\}', body)]

    middle = bridge_table('_bridge_sprite_table_girder_middle')
    heads = bridge_table('_bridge_sprite_table_generic_oxide_heads')[:8]
    bridge = {'middle': [middle[0:3], middle[4:7]], 'heads': heads}
    for sid in middle[0:3] + middle[4:7] + heads:
        atlas.add(sid)

    # Ruch uliczny (dekoracja): autobusy, furgonetki zamiast aut osobowych (TTD ich nie ma), ciężarówki;
    # trzy epoki (do 1960, do 1985, później), 8 kierunków, kilka kolorów.
    road = {
        'bus': {'eras': [3284, 3092, 3476], 'colours': [778]},
        'car': {'eras': [3300, 3108, 3492], 'colours': [779, 783, 790, 789, 781, 786, 787, 775]},
        'truck': {'eras': [3324, 3132, 3516], 'colours': [779, 783, 790, 781]},
    }
    for kind in road.values():
        for base in kind['eras']:
            for pal in kind['colours']:
                for d in range(8):
                    atlas.add(base + d, pal)

    data = atlas.pack(out)
    data.update({
        'company': COMPANY,
        'houses': houses,
        'industries': industries,
        'trees': trees,
        'engines': engine_out,
        'wagons': wagon_out,
        'road': road,
        'bridge': bridge,
    })
    (out / 'gfx.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(f"{len(atlas.images)} sprite'ów na {len(data['pages'])} stronach; brak: {len(atlas.missing)}")
    if atlas.missing:
        print('  ', ' '.join(atlas.missing[:40]))


if __name__ == '__main__':
    main()
