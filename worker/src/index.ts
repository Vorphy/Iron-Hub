/**
 * Odbiornik anonimowych statystyk Iron Hub (Cloudflare Worker + D1).
 * POST /event   – zdarzenie z gry (JSON jako text/plain, wysyłane przez sendBeacon)
 * GET  /summary – tabela graczy dla nas; wymaga tokena (?token=… albo nagłówek Authorization: Bearer …)
 * Adresu IP nie zapisujemy.
 */

interface D1Result<T> {
  results: T[];
}
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
}

export interface Env {
  DB: D1Database;
  /** Sekret: `npx wrangler secret put ADMIN_TOKEN`. */
  ADMIN_TOKEN: string;
  /** Dozwolone strony gry, po przecinku (wrangler.toml). */
  ALLOWED_ORIGINS: string;
}

const EVENTS = new Set(['start', 'new_game', 'playing']);
const MAP_SIZES = new Set([64, 128, 256, 512, 1024]);

interface EventRow {
  player: string;
  tester: string;
  company: string;
  event: string;
  minutes: number;
  mapSize: number | null;
  version: string;
}

/** Sprawdza i oczyszcza zdarzenie; null – odrzucamy. */
export function parseEvent(text: string): EventRow | null {
  if (text.length > 2000) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const player = str(d.player, 64);
  if (!/^[0-9a-f-]{8,64}$/i.test(player)) return null;
  const event = str(d.event, 20);
  if (!EVENTS.has(event)) return null;
  const tester = str(d.tester, 32);
  if (tester && !/^[a-z0-9_-]+$/.test(tester)) return null;
  const minutes = typeof d.minutes === 'number' && Number.isInteger(d.minutes) && d.minutes >= 0 && d.minutes <= 120 ? d.minutes : 0;
  const mapSize = typeof d.mapSize === 'number' && MAP_SIZES.has(d.mapSize) ? d.mapSize : null;
  return { player, tester, company: str(d.company, 40), event, minutes, mapSize, version: str(d.version, 20) };
}

const escape = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface SummaryRow {
  player_id: string;
  tester: string | null;
  company: string | null;
  sessions: number;
  minutes: number;
  new_games: number;
  maps: string | null;
  first_seen: string;
  last_seen: string;
  version: string | null;
}

async function summary(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT player_id,
            MAX(NULLIF(tester, '')) AS tester,
            (SELECT company FROM events e2 WHERE e2.player_id = e.player_id AND company <> '' ORDER BY id DESC LIMIT 1) AS company,
            SUM(event = 'start') AS sessions,
            SUM(minutes) AS minutes,
            SUM(event = 'new_game') AS new_games,
            GROUP_CONCAT(DISTINCT map_size) AS maps,
            MIN(created_at) AS first_seen,
            MAX(created_at) AS last_seen,
            (SELECT version FROM events e3 WHERE e3.player_id = e.player_id ORDER BY id DESC LIMIT 1) AS version
       FROM events e
      GROUP BY player_id
      ORDER BY last_seen DESC
      LIMIT 500`,
  ).all<SummaryRow>();
  const rows = results
    .map(
      (r) =>
        `<tr><td>${escape(r.tester || '–')}</td><td>${escape(r.company || '–')}</td><td>${r.sessions}</td>` +
        `<td>${Math.floor(r.minutes / 60)} h ${r.minutes % 60} min</td><td>${r.new_games}</td><td>${escape(r.maps || '–')}</td>` +
        `<td>${escape(r.first_seen)}</td><td>${escape(r.last_seen)}</td><td>${escape(r.version)}</td>` +
        `<td><code>${escape(r.player_id.slice(0, 8))}</code></td></tr>`,
    )
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><title>Iron Hub – statystyki</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td,th{padding:6px 10px;border-bottom:1px solid #ddd;text-align:left}</style>
<h1>Iron Hub – gracze (${results.length})</h1>
<table><tr><th>Tester</th><th>Firma</th><th>Sesje</th><th>Czas grania</th><th>Nowe gry</th><th>Mapy</th><th>Pierwsze wejście (UTC)</th><th>Ostatnie (UTC)</th><th>Wersja</th><th>Id</th></tr>${rows}</table>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/event' && request.method === 'POST') {
      // Tylko z naszej strony gry – reszta internetu nie wpisuje nam zdarzeń.
      const origin = request.headers.get('origin') ?? '';
      const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
      if (!allowed.includes(origin)) return new Response('forbidden', { status: 403 });
      const ev = parseEvent(await request.text());
      if (!ev) return new Response('bad request', { status: 400 });
      await env.DB.prepare(
        'INSERT INTO events (player_id, tester, company, event, minutes, map_size, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(ev.player, ev.tester, ev.company, ev.event, ev.minutes, ev.mapSize, ev.version)
        .run();
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin } });
    }
    if (url.pathname === '/summary' && request.method === 'GET') {
      const token = url.searchParams.get('token') ?? request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });
      return summary(env);
    }
    return new Response('not found', { status: 404 });
  },
};
