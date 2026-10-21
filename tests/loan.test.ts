import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { BANKRUPTCY_MONTHS, LOAN_INTEREST, LOAN_MAX, LOAN_STEP } from '../src/sim/economy/finance';
import { monthlyEconomy } from '../src/sim/economy/monthly';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Track } from '../src/sim/track/track';

const world = () => new Simulation(createGame({ width: 32, height: 32, seed: 2, empty: true }));

function run(sim: Simulation, ...cmds: Parameters<Simulation['enqueue']>[0][]) {
  for (const c of cmds) sim.enqueue(c);
  sim.processCommands();
  return sim.drainEvents();
}

describe('kredyt', () => {
  it('pożyczka i spłata po krokach, w granicach limitu', () => {
    const sim = world();
    const s = sim.state;
    const start = s.money;
    run(sim, { type: 'borrow', amount: LOAN_STEP });
    expect(s.finances.loan).toBe(LOAN_STEP);
    expect(s.money).toBe(start + LOAN_STEP);
    // Ponad limit – przycięte do maksimum, potem odmowa.
    run(sim, { type: 'borrow', amount: LOAN_MAX * 2 });
    expect(s.finances.loan).toBe(LOAN_MAX);
    const ev = run(sim, { type: 'borrow', amount: LOAN_STEP });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'commandFailed', reason: 'loanLimit' }));
    run(sim, { type: 'repay', amount: LOAN_MAX });
    expect(s.finances.loan).toBe(0);
    expect(s.money).toBe(start);
    expect(run(sim, { type: 'repay', amount: LOAN_STEP })).toContainEqual(
      expect.objectContaining({ type: 'commandFailed', reason: 'noLoan' }),
    );
  });

  it('spłata wymaga gotówki', () => {
    const sim = world();
    run(sim, { type: 'borrow', amount: LOAN_STEP });
    sim.state.money = LOAN_STEP - 1;
    const ev = run(sim, { type: 'repay', amount: LOAN_STEP });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'commandFailed', reason: 'noMoney' }));
    expect(sim.state.finances.loan).toBe(LOAN_STEP);
  });

  it('odsetki naliczane co miesiąc', () => {
    const sim = world();
    run(sim, { type: 'borrow', amount: 120_000 });
    const before = sim.state.money;
    monthlyEconomy(sim.state, []);
    const interest = Math.round((120_000 * LOAN_INTEREST) / 12);
    expect(sim.state.finances.history.at(-1)!.interest).toBe(interest);
    expect(sim.state.money).toBe(before - interest);
  });
});

describe('bankructwo', () => {
  it(`ujemne saldo ${BANKRUPTCY_MONTHS} miesiące z rzędu kończy grę`, () => {
    const sim = world();
    const s = sim.state;
    s.money = -1000;
    const events: SimEvent[] = [];
    for (let m = 1; m < BANKRUPTCY_MONTHS; m++) {
      monthlyEconomy(s, events);
      expect(events.at(-1)).toEqual({ type: 'debtWarning', monthsLeft: BANKRUPTCY_MONTHS - m });
      expect(s.finances.bankrupt).toBe(false);
    }
    monthlyEconomy(s, events);
    expect(events.at(-1)).toEqual({ type: 'bankrupt' });
    expect(s.finances.bankrupt).toBe(true);
    // Czas stoi, komendy odrzucane.
    const tick = s.tick;
    sim.step();
    expect(s.tick).toBe(tick);
    const ev = run(sim, { type: 'buildTrack', pieces: [{ x: 3, y: 3, track: Track.X }] });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'commandFailed', reason: 'bankrupt' }));
  });

  it('wyjście na plus zeruje licznik', () => {
    const sim = world();
    const s = sim.state;
    s.money = -1000;
    monthlyEconomy(s, []);
    expect(s.finances.debtMonths).toBe(1);
    run(sim, { type: 'borrow', amount: LOAN_STEP });
    monthlyEconomy(s, []);
    expect(s.finances.debtMonths).toBe(0);
  });

  it('kredyt i stan zadłużenia przechodzą przez zapis; stary zapis dostaje pusty kredyt', () => {
    const sim = world();
    run(sim, { type: 'borrow', amount: 50_000 });
    sim.state.finances.debtMonths = 1;
    const data = JSON.parse(JSON.stringify(serializeState(sim.state)));
    expect(deserializeState(data).finances).toEqual(sim.state.finances);

    const old = structuredClone(data);
    old.version = 10;
    delete old.finances.loan;
    delete old.finances.debtMonths;
    delete old.finances.bankrupt;
    delete old.finances.month.interest;
    const f = deserializeState(old).finances;
    expect(f).toMatchObject({ loan: 0, debtMonths: 0, bankrupt: false });
    expect(f.month.interest).toBe(0);
  });
});
