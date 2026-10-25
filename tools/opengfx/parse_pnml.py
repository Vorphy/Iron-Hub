"""Czyta pliki .pnml OpenGFX i zwraca tabelę sprite'ów TTD: numer -> (plik PNG, x, y, w, h, przes. x, przes. y).

Rozumie tylko to, czego używa OpenGFX w grafice bazowej: #include, szablony (template) z parametrami,
bloki base_graphics z numerem startowym i listy [x, y, w, h, ox, oy, ...]. alternative_sprites
(powiększenia 2×/4×, 32 bpp) są pomijane – bierzemy zwykłe 8 bpp.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

TOKEN = re.compile(r'\s*(?:(//[^\n]*|/\*.*?\*/)|("(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z0-9_]*)|(-?\d+)|(.))', re.S)
SAFE_EXPR = re.compile(r'^[\s\d+\-*/()A-Za-z_]*$')


def tokenize(text: str) -> list[str]:
    out = []
    pos = 0
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if not m:
            break
        pos = m.end()
        if m.group(1):
            continue
        tok = m.group(2) or m.group(3) or m.group(4) or m.group(5)
        if tok is not None and tok.strip():
            out.append(tok)
    return out


def preprocess(path: Path, root: Path, seen: set[Path] | None = None) -> str:
    """Rozwija #include (ścieżki względem katalogu głównego OpenGFX)."""
    seen = seen or set()
    out = []
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\s*#include\s+"([^"]+)"', line)
        if m:
            inc = root / m.group(1)
            if inc not in seen:
                seen.add(inc)
                out.append(preprocess(inc, root, seen))
            continue
        if line.lstrip().startswith('#'):
            continue
        out.append(line)
    return '\n'.join(out)


class Parser:
    def __init__(self, tokens: list[str]):
        self.t = tokens
        self.i = 0
        self.templates: dict[str, tuple[list[str], list[str]]] = {}
        self.sprites: dict[int | str, list] = {}

    def peek(self, k: int = 0) -> str | None:
        return self.t[self.i + k] if self.i + k < len(self.t) else None

    def take(self, expect: str | None = None) -> str:
        tok = self.t[self.i]
        if expect is not None and tok != expect:
            raise SyntaxError(f'oczekiwano {expect!r}, jest {tok!r} (token {self.i}: {self.t[self.i - 5:self.i + 5]})')
        self.i += 1
        return tok

    def block(self) -> list[str]:
        """Tokeny między { i pasującym } (bez nawiasów)."""
        self.take('{')
        depth = 1
        start = self.i
        while depth:
            tok = self.take()
            if tok == '{':
                depth += 1
            elif tok == '}':
                depth -= 1
        return self.t[start:self.i - 1]

    def args(self) -> list[list[str]]:
        """Argumenty w nawiasach okrągłych jako listy tokenów."""
        self.take('(')
        out: list[list[str]] = [[]]
        depth = 1
        while True:
            tok = self.take()
            if tok == '(':
                depth += 1
            elif tok == ')':
                depth -= 1
                if depth == 0:
                    break
            elif tok == ',' and depth == 1:
                out.append([])
                continue
            out[-1].append(tok)
        return [a for a in out if a] if out != [[]] else []

    def parse(self) -> None:
        next_id = 0
        while self.peek() is not None:
            tok = self.take()
            if tok == 'template':
                name = self.take()
                params = [''.join(a) for a in self.args()]
                self.templates[name] = (params, self.block())
            elif tok in ('base_graphics', 'replace'):
                name = self.take() if self.peek() != '(' else ''
                args = self.args()
                body = self.block()
                start = next_id
                file = None
                for a in args:
                    if len(a) == 1 and a[0].startswith('"'):
                        file = json.loads(a[0])
                    elif len(a) >= 1 and re.fullmatch(r'-?\d+', ''.join(a)):
                        start = int(''.join(a))
                items = self.expand(body, {}, file)
                for k, item in enumerate(items):
                    self.sprites[start + k] = item
                next_id = start + len(items)
            elif tok == 'replacenew':
                # Sprite'y dodatkowe OpenTTD: klucz "NAZWA:indeks" (np. CATENARY:0).
                if self.peek() != '(':
                    self.take()
                args = self.args()
                body = self.block()
                file = None
                offset = 0
                kind = ''.join(args[0])
                for a in args[1:]:
                    if len(a) == 1 and a[0].startswith('"'):
                        file = json.loads(a[0]) or None
                    elif re.fullmatch(r'-?\d+', ''.join(a)):
                        offset = int(''.join(a))
                for k, item in enumerate(self.expand(body, {}, file)):
                    self.sprites[f'{kind}:{offset + k}'] = item
            elif tok == 'if':
                # Klimat: bierzemy tylko gałąź umiarkowaną (temperate) albo warunki bez klimatu.
                chosen: list[str] | None = None
                while True:
                    cond = ' '.join(sum(self.args(), []))
                    body = self.block()
                    if chosen is None and ('CLIMATE_TEMPERATE' in cond or 'climate' not in cond):
                        chosen = body
                    if self.peek() != 'else':
                        break
                    self.take()
                    if self.peek() == 'if':
                        self.take()
                        continue
                    other = self.block()
                    if chosen is None:
                        chosen = other
                    break
                if chosen:
                    self.t[self.i:self.i] = chosen
            elif tok in ('alternative_sprites', 'grf', 'spriteset', 'recolour_sprite', 'font_glyph', 'error', 'param'):
                # Pomijamy całe wyrażenie (nagłówek + blok).
                while self.peek() not in ('{', None):
                    self.take()
                if self.peek() == '{':
                    self.block()
            else:
                continue

    def expand(self, body: list[str], env: dict[str, int | str], file: str | None) -> list[list]:
        """Rozwija ciało: listy [ ... ] i wywołania szablonów. Zwraca [plik, x, y, w, h, ox, oy]."""
        out: list[list] = []
        i = 0
        while i < len(body):
            tok = body[i]
            if tok == '[':
                j = body.index(']', i)
                parts = split_commas(body[i + 1:j])
                vals = [evaluate(p, env) for p in parts]
                f = file
                # Ostatni argument może być nazwą pliku (szablony *_file).
                if vals and isinstance(vals[-1], str) and vals[-1].endswith('.png'):
                    f = vals[-1]
                nums = [v for v in vals if isinstance(v, int)]
                out.append([f, *nums[:6]])
                i = j + 1
            elif tok in self.templates and i + 1 < len(body) and body[i + 1] == '(':
                params, tbody = self.templates[tok]
                # Argumenty wywołania.
                depth = 0
                j = i + 1
                cur: list[str] = []
                args: list[list[str]] = []
                while True:
                    t = body[j]
                    if t == '(':
                        depth += 1
                        if depth > 1:
                            cur.append(t)
                    elif t == ')':
                        depth -= 1
                        if depth == 0:
                            break
                        cur.append(t)
                    elif t == ',' and depth == 1:
                        args.append(cur)
                        cur = []
                    else:
                        cur.append(t)
                    j += 1
                if cur:
                    args.append(cur)
                sub = {p: evaluate(a, env) for p, a in zip(params, args)}
                out.extend(self.expand(tbody, sub, file))
                i = j + 1
            else:
                i += 1
        return out


def split_commas(tokens: list[str]) -> list[list[str]]:
    out: list[list[str]] = [[]]
    depth = 0
    for t in tokens:
        if t == '(':
            depth += 1
        elif t == ')':
            depth -= 1
        if t == ',' and depth == 0:
            out.append([])
        else:
            out[-1].append(t)
    return [o for o in out if o]


def evaluate(tokens: list[str], env: dict[str, int | str]):
    if len(tokens) == 1 and tokens[0].startswith('"'):
        return json.loads(tokens[0])
    if len(tokens) == 1 and tokens[0] in env:
        return env[tokens[0]]
    expr = ' '.join(tokens)
    if not SAFE_EXPR.match(expr):
        return expr
    names = {k: v for k, v in env.items()}
    try:
        val = eval(expr, {'__builtins__': {}}, names)  # noqa: S307 – tylko liczby i nazwy parametrów
    except Exception:
        return expr  # flagi (ANIM, NOCROP) i inne nazwy – pomijane
    return val if isinstance(val, str) else int(val)


def parse_opengfx(root: Path) -> dict[int, list]:
    sprites: dict = {}
    for name in ('ogfx1_base.pnml', 'ogfxe_extra.pnml'):
        p = Parser(tokenize(preprocess(root / name, root)))
        p.parse()
        sprites.update(p.sprites)
    return sprites


if __name__ == '__main__':
    root = Path(sys.argv[1])
    sprites = parse_opengfx(root)
    out = Path(sys.argv[2])
    out.write_text(json.dumps({str(k): v for k, v in sprites.items()}), encoding='utf-8')
    kinds = sorted({k.split(':')[0] for k in sprites if isinstance(k, str)})
    print(len(sprites), 'sprites; extra:', ', '.join(kinds))
