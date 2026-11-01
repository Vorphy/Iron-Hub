import { describe, expect, it } from 'vitest';
import { PlayReporter, REPORT_EVERY_S, Telemetry, testerFromSearch } from '../src/persistence/telemetry';
import { parseEvent } from '../worker/src/index';

describe('statystyki – gra', () => {
  it('kod testera z linku: małe litery, bez polskich znaków i obcych znaków', () => {
    expect(testerFromSearch('?tester=Ania')).toBe('ania');
    expect(testerFromSearch('?seed=3&tester=Łukasz_2')).toBe('lukasz_2');
    expect(testerFromSearch('?tester=<script>')).toBe('script');
    expect(testerFromSearch('?tester=')).toBeNull();
    expect(testerFromSearch('?seed=3')).toBeNull();
    expect(testerFromSearch(`?tester=${'a'.repeat(50)}`)).toHaveLength(32);
  });

  it('czas grania wysyłany co 5 minut, reszta przy schowaniu karty', () => {
    const r = new PlayReporter();
    let sent = 0;
    for (let s = 0; s < REPORT_EVERY_S - 15; s += 15) sent += r.add(15);
    expect(sent).toBe(0);
    sent += r.add(15);
    expect(sent).toBe(5);
    expect(r.flush()).toBe(0); // mniej niż minuta
    r.add(130);
    expect(r.flush()).toBe(2);
    expect(r.flush()).toBe(0);
  });

  it('bez adresu odbiorcy nic nie jest wysyłane, a zdarzenie ma tylko dozwolone pola', () => {
    const t = new Telemetry('', '2026-11-01', '?tester=ania');
    expect(t.available).toBe(false);
    expect(t.enabled).toBe(false);
    const p = t.payload('new_game', 'Kolej Żelazna', 256);
    expect(Object.keys(p).sort()).toEqual(['company', 'event', 'mapSize', 'minutes', 'player', 'tester', 'version']);
    expect(p).toMatchObject({ tester: 'ania', company: 'Kolej Żelazna', event: 'new_game', mapSize: 256, version: '2026-11-01' });
  });
});

describe('statystyki – odbiornik (Worker)', () => {
  const ok = {
    player: 'a7f3c2d1-0000-4000-8000-000000000000',
    tester: 'ania',
    company: 'Kolej',
    event: 'playing',
    minutes: 5,
    mapSize: 256,
    version: '2026-11-01',
  };

  it('przyjmuje poprawne zdarzenie', () => {
    expect(parseEvent(JSON.stringify(ok))).toEqual(ok);
  });

  it('odrzuca śmieci i przycina podejrzane pola', () => {
    expect(parseEvent('nie json')).toBeNull();
    expect(parseEvent(JSON.stringify({ ...ok, player: 'x' }))).toBeNull();
    expect(parseEvent(JSON.stringify({ ...ok, event: 'drop table' }))).toBeNull();
    expect(parseEvent(JSON.stringify({ ...ok, tester: 'Ania!' }))).toBeNull();
    expect(parseEvent('x'.repeat(3000))).toBeNull();
    const odd = parseEvent(JSON.stringify({ ...ok, minutes: 9999, mapSize: 300, company: 'k'.repeat(100) }))!;
    expect(odd.minutes).toBe(0);
    expect(odd.mapSize).toBeNull();
    expect(odd.company).toHaveLength(40);
  });
});
