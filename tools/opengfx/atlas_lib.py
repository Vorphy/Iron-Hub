"""Wspólne: wczytywanie wycinków PNG OpenGFX jako RGBA (indeks 0 palety = przezroczysty)."""

from pathlib import Path

from PIL import Image


ALPHA_LUT = bytes([0] + [255] * 255)

# Paleta TTD (DOS) z OpenTTD – paleta zapisana w plikach PNG OpenGFX ma w miejscu szarości
# i kolorów animowanych różowe znaczniki, więc kolory liczymy według tej.
PALETTE: list[int] | None = None


def set_palette(palette: list[int]) -> None:
    global PALETTE
    PALETTE = palette


def load_png(root: Path, file: str, cache: dict) -> Image.Image:
    if file not in cache:
        img = Image.open(root / file)
        if img.mode == 'P':
            # Paleta TTD: indeks 0 jest przezroczysty.
            idx = img.copy()
            if PALETTE:
                img = img.copy()
                img.putpalette(PALETTE)
            rgba = img.convert('RGBA')
            alpha = Image.frombytes('L', idx.size, idx.tobytes().translate(ALPHA_LUT))
            rgba.putalpha(alpha)
            cache[file] = (rgba, idx)
        else:
            cache[file] = (img.convert('RGBA'), None)
    return cache[file][0]


def load_sprite(root: Path, entry: list, cache: dict) -> Image.Image:
    file, x, y, w, h, _ox, _oy = entry
    return load_png(root, file, cache).crop((x, y, x + w, y + h))


def load_sprite_indices(root: Path, entry: list, cache: dict):
    """Indeksy palety wycinka (None, jeśli plik nie jest paletowy)."""
    file, x, y, w, h, _ox, _oy = entry
    load_png(root, file, cache)
    idx = cache[file][1]
    return idx.crop((x, y, x + w, y + h)) if idx is not None else None
