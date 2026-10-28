import { describe, expect, it } from 'vitest';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { COMPANY_NAME_MAX, cleanCompanyName, createGame, DEFAULT_COMPANY_NAME } from '../src/sim/state';

describe('nazwa firmy', () => {
  it('nowa gra: podana nazwa albo domyślna', () => {
    expect(createGame({ width: 8, height: 8, seed: 1, empty: true }).companyName).toBe(DEFAULT_COMPANY_NAME);
    expect(createGame({ width: 8, height: 8, seed: 1, empty: true, companyName: '  Kolej   Śląska ' }).companyName).toBe(
      'Kolej Śląska',
    );
  });

  it('pusta nazwa – domyślna, za długa – przycięta', () => {
    expect(cleanCompanyName('   ')).toBe(DEFAULT_COMPANY_NAME);
    expect(cleanCompanyName('x'.repeat(100))).toHaveLength(COMPANY_NAME_MAX);
  });

  it('zmiana nazwy komendą i zapis', () => {
    const sim = new Simulation(createGame({ width: 8, height: 8, seed: 1, empty: true }));
    sim.enqueue({ type: 'renameCompany', name: 'Żelazne Koleje Sp. z o.o.' });
    sim.processCommands();
    expect(sim.state.companyName).toBe('Żelazne Koleje Sp. z o.o.');
    const copy = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(copy.companyName).toBe('Żelazne Koleje Sp. z o.o.');
  });

  it('stary zapis (v25) dostaje domyślną nazwę', () => {
    const data = JSON.parse(JSON.stringify(serializeState(createGame({ width: 8, height: 8, seed: 1, empty: true }))));
    data.version = 25;
    delete data.companyName;
    expect(deserializeState(data).companyName).toBe(DEFAULT_COMPANY_NAME);
  });
});
