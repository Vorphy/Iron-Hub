import { describe, expect, it } from 'vitest';
import { addPlayTime, formatPlayTime, newSession } from '../src/persistence/playStats';

describe('statystyki grania', () => {
  it('pierwsza sesja zaczyna licznik, kolejne go zwiększają, czas się sumuje', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    let s = newSession(null, now);
    expect(s).toEqual({ sessions: 1, seconds: 0, since: now.toISOString() });
    s = addPlayTime(addPlayTime(s, 14.6), 15);
    s = newSession(s, new Date('2026-11-02T10:00:00Z'));
    expect(s).toEqual({ sessions: 2, seconds: 30, since: now.toISOString() });
    expect(addPlayTime(s, -5).seconds).toBe(30);
  });

  it('czas w minutach i godzinach', () => {
    expect(formatPlayTime(59)).toBe('0 min');
    expect(formatPlayTime(45 * 60)).toBe('45 min');
    expect(formatPlayTime(3 * 3600)).toBe('3 h');
    expect(formatPlayTime(3 * 3600 + 20 * 60 + 30)).toBe('3 h 20 min');
  });
});
