"""Podgląd: sprite'y z zakresu numerów na jednej planszy z podpisami (do dobierania numerów).

python sheet.py <katalog OpenGFX> <sprites.json> <wyjście.png> 1011-1036 [3981 ...]
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from atlas_lib import load_sprite


def main() -> None:
    root = Path(sys.argv[1])
    table = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    ids: list[int] = []
    for arg in sys.argv[4:]:
        if '-' in arg:
            a, b = arg.split('-')
            ids += range(int(a), int(b) + 1)
        else:
            ids.append(int(arg))
    cell_w, cell_h, cols = 140, 150, 10
    rows = (len(ids) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), (90, 90, 90, 255))
    draw = ImageDraw.Draw(sheet)
    cache: dict = {}
    for n, sid in enumerate(ids):
        cx = (n % cols) * cell_w
        cy = (n // cols) * cell_h
        entry = table.get(str(sid))
        draw.text((cx + 3, cy + 2), str(sid), fill=(255, 255, 0, 255))
        if not entry or entry[0] is None:
            continue
        img = load_sprite(root, entry, cache)
        _, _, _, w, h, ox, oy = entry
        # Punkt zaczepienia w (70, 90) – zaznaczony krzyżykiem.
        ax, ay = cx + 70, cy + 95
        sheet.alpha_composite(img, (ax + ox, ay + oy)) if ax + ox >= 0 and ay + oy >= 0 else None
        draw.line((ax - 3, ay, ax + 3, ay), fill=(255, 0, 0, 255))
        draw.line((ax, ay - 3, ax, ay + 3), fill=(255, 0, 0, 255))
    sheet.save(sys.argv[3])


if __name__ == '__main__':
    main()
