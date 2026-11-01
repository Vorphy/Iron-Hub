# Statystyki graczy (Cloudflare Worker + D1)

Odbiera anonimowe zdarzenia z gry (`src/persistence/telemetry.ts`) i zapisuje je w bazie SQLite (D1).
Zbieramy: losowy identyfikator przeglądarki, kod testera z linku, nazwę firmy, zdarzenie (`start`, `new_game`,
`playing` co 5 min), minuty grania, rozmiar mapy i wersję gry. **Bez adresu IP.** Gracz może wyłączyć wysyłanie
w Menu.

## Pierwsze uruchomienie (raz)

Potrzebne darmowe konto Cloudflare. Polecenia w folderze `worker/`:

```bash
npx wrangler login                        # logowanie w przeglądarce
npx wrangler d1 create iron-hub-stats     # wypisze database_id – wklej go do wrangler.toml
npx wrangler d1 execute iron-hub-stats --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN       # wymyśl długie hasło do strony z podsumowaniem
npx wrangler deploy                       # wypisze adres, np. https://iron-hub-stats.<konto>.workers.dev
```

Potem w repo na GitHubie: **Settings → Secrets and variables → Actions → Variables → New repository variable**:
`STATS_URL` = `https://iron-hub-stats.<konto>.workers.dev/event`. Następny push na `main` zbuduje grę z wysyłaniem
statystyk. Bez tej zmiennej gra niczego nie wysyła, a przełącznik w Menu jest ukryty.

Lokalnie (`npm run dev`) wysyłanie włączysz plikiem `.env.local` w głównym folderze: `VITE_STATS_URL=…/event`.

## Linki dla testerów

`https://vorphy.github.io/Iron-Hub/?tester=ania` – kod testera zapamiętuje się w przeglądarce, więc kolejne wejścia
bez parametru też trafią do „ania”.

## Podgląd

`https://iron-hub-stats.<konto>.workers.dev/summary?token=<ADMIN_TOKEN>` – tabela graczy: tester, firma, sesje,
czas grania, nowe gry, mapy, pierwsze i ostatnie wejście, wersja.

Surowe dane: `npx wrangler d1 execute iron-hub-stats --remote --command "SELECT * FROM events ORDER BY id DESC LIMIT 50"`.

## Darmowe limity

Na testy z kilkoma osobami z dużym zapasem. Aktualne limity Workers i D1 sprawdź na stronie Cloudflare przed
szerszym udostępnieniem gry.
