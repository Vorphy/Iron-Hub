import { describe, expect, it } from 'vitest';
import { emptyLedger, LEDGER_HISTORY, recordCargo, spend } from '../src/sim/economy/finance';
import { companyValue } from '../src/sim/economy/history';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import { deserializeState, SaveError, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { DAYS_PER_MONTH, TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track } from '../src/sim/track/track';
import { resaleValue } from '../src/sim/trains/train';
import { Terrain } from '../src/sim/world/map';

const MONTH = TICKS_PER_DAY * DAYS_PER_MONTH;

/** Gra z torem, zajezdnią i jednym pociągiem (stoi w zajezdni – bez kosztów eksploatacji). */
function company() {
  const state = createGame({ width: 32, height: 32, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: Array.from({ length: 6 }, (_, k) => ({ x: 5 + k, y: 5, track: Track.X })) });
  sim.enqueue({ type: 'buildDepot', x: 4, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.processCommands();
  return { state, sim };
}

/** Zamknięcie kolejnego miesiąca (jak na początku nowego miesiąca w grze). */
function nextMonth(state: ReturnType<typeof company>['state']) {
  state.tick += MONTH;
  monthlyEconomy(state, []);
}

describe('historia firmy', () => {
  it('po 12 miesiącach powstaje bilans roku z przewozami według ładunku i stanem firmy', () => {
    const { state } = company();
    const start = state.startYear;
    for (let m = 1; m <= 12; m++) {
      state.finances.month.income += 1000;
      recordCargo(state, 'coal', 1000, 50);
      if (m === 3) recordCargo(state, 'passengers', 0, 7);
      nextMonth(state);
    }
    const f = state.finances;
    expect(f.years).toHaveLength(1);
    const y = f.years[0]!;
    expect(y).toMatchObject({ year: start, months: 12, trains: 1, stations: 0, trackPieces: 6, loan: 0 });
    expect(y.ledger.income).toBe(12_000);
    expect(y.ledger.cargo).toEqual({ coal: { income: 12_000, amount: 600 }, passengers: { income: 0, amount: 7 } });
    expect(y.ledger.infrastructure).toBeGreaterThan(0);
    expect(y.money).toBe(Math.round(state.money));
    expect(y.companyValue).toBe(Math.round(state.money) + resaleValue(state, state.trains[0]!));
    expect(companyValue(state)).toBe(y.companyValue);
    // Nowy rok zaczyna się od zera.
    expect(f.year).toEqual(emptyLedger());
    expect(f.yearMonths).toBe(0);
    // Pociąg pamięta zysk z każdego roku.
    expect(state.trains[0]!.profitHistory).toEqual([{ year: start, profit: state.trains[0]!.profitLastYear }]);
  });

  it('lata zostają na zawsze, miesiące – ostatnie 3 lata', () => {
    const { state } = company();
    for (let m = 0; m < 12 * 5; m++) {
      spend(state, 'construction', 10);
      nextMonth(state);
    }
    expect(state.finances.years.map((y) => y.year)).toEqual([0, 1, 2, 3, 4].map((k) => state.startYear + k));
    // Rok 1 zawiera też budowę toru i zakup pociągu z początku gry.
    expect(state.finances.years.every((y) => y.months === 12)).toBe(true);
    expect(state.finances.years.slice(1).every((y) => y.ledger.construction === 120)).toBe(true);
    expect(state.finances.history).toHaveLength(LEDGER_HISTORY);
    expect(state.trains[0]!.profitHistory).toHaveLength(5);
  });

  it('historia przechodzi przez zapis; uszkodzona jest odrzucana', () => {
    const { state } = company();
    for (let m = 0; m < 14; m++) {
      recordCargo(state, 'mail', 5, 1);
      nextMonth(state);
    }
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    const loaded = deserializeState(data);
    expect(loaded.finances).toEqual(state.finances);
    expect(loaded.trains[0]!.profitHistory).toEqual(state.trains[0]!.profitHistory);
    data.finances.years[0].ledger.cargo = { gold: { income: 1, amount: 1 } };
    expect(() => deserializeState(data)).toThrow(SaveError);
  });

  it('zapis sprzed historii (v35): rok zaczyna się z miesięcy, które są jeszcze w bilansach', () => {
    const { state } = company();
    // Maj: zamknięte 4 miesiące tego roku; w historii (12) także końcówka poprzedniego.
    state.tick = (12 + 4) * MONTH;
    state.trains[0]!.profitLastYear = -1234;
    const data = JSON.parse(JSON.stringify(serializeState(state)));
    data.version = 35;
    const ledger = (income: number) => ({ income, trains: 0, infrastructure: 0, construction: 0, interest: 0 });
    data.finances = {
      month: ledger(1),
      history: [10, 20, 30, 40, 50, 60, 70, 80, 100, 200, 300, 400].map(ledger),
      loan: 0,
      debtMonths: 0,
      bankrupt: false,
    };
    for (const t of data.trains) delete t.profitHistory;
    const loaded = deserializeState(data);
    expect(loaded.finances.yearMonths).toBe(4);
    expect(loaded.finances.year.income).toBe(1000);
    expect(loaded.finances.years).toEqual([]);
    expect(loaded.finances.month.cargo).toEqual({});
    expect(loaded.trains[0]!.profitHistory).toEqual([{ year: state.startYear, profit: -1234 }]);
  });
});
