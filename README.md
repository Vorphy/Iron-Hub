# Iron Hub

Przeglądarkowa gra kolejowa w stylu klasycznego *Transport Tycoon Deluxe / OpenTTD* – izometryczna, retro, bez mikrozarządzania. Gracz buduje wyłącznie kolej, a miasta, przemysł i transport lokalny żyją własnym życiem.

**Zagraj:** https://vorphy.github.io/Iron-Hub/ (publikowane automatycznie po każdym pushu na `main`)

## Uruchomienie lokalne

Wymagany Node.js 22+.

```bash
npm install
npm run dev        # serwer deweloperski: http://localhost:5173
npm test           # testy symulacji (Vitest)
npm run build      # typecheck + build produkcyjny do dist/
```

Parametr `?seed=123` w adresie generuje inną mapę.

## Struktura kodu

```
src/sim/      logika gry – deterministyczna, bez DOM/Pixi (patrz docs/02-architektura.md)
src/render/   PixiJS: rzut izometryczny, kamera, teren
src/input/    mysz i klawiatura
src/ui/       interfejs w Preact
src/loop.ts   stały krok symulacji (20 ticków/s) i prędkości gry
tests/        testy jednostkowe
```

## Dokumentacja

| Dokument | Zawartość |
|---|---|
| [docs/01-wizja.md](docs/01-wizja.md) | Wizja gry, wyróżniki, pętle rozgrywki, model biznesowy |
| [docs/02-architektura.md](docs/02-architektura.md) | Stos technologiczny, podział na moduły, model danych, pętla symulacji |
| [docs/03-mechaniki.md](docs/03-mechaniki.md) | Tory i pociągi, sygnalizacja, miasta, fabryki, ekonomia |
| [docs/04-roadmapa.md](docs/04-roadmapa.md) | Etapy implementacji i kryteria ukończenia |
| [docs/05-decyzje.md](docs/05-decyzje.md) | Rejestr decyzji projektowych (ADR) i otwarte pytania |

Pierwotna specyfikacja: [rail_tycoon_browser_project_specification.md](rail_tycoon_browser_project_specification.md) (archiwalna – obowiązuje `docs/`).
