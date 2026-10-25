import { describe, expect, it } from 'vitest';
import { RESEARCH, RESEARCH_CANCEL_REFUND } from '../src/data/research';
import { deserializeState, serializeState } from '../src/sim/serialize';
import {
  engineMaxSpeed,
  engineOnSale,
  maintenanceFactor,
  nextLevelPlan,
  researchLevel,
  wagonCapacity,
} from '../src/sim/research';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { TICKS_PER_DAY } from '../src/sim/time';
import { engineDef } from '../src/sim/trains/vehicles';

function sim(): Simulation {
  const s = createGame({ width: 16, height: 16, seed: 1, empty: true, startYear: 1950 });
  s.money = 10_000_000;
  return new Simulation(s);
}

describe('badania', () => {
  it('płatne z góry; po czasie rośnie poziom, następny poziom droższy', () => {
    const s = sim();
    const plan = nextLevelPlan(s.state, 'capacity')!;
    const money = s.state.money;
    s.enqueue({ type: 'startResearch', id: 'capacity' });
    s.step();
    expect(s.state.money).toBe(money - plan.cost);
    // Drugie badanie naraz – nie.
    s.enqueue({ type: 'startResearch', id: 'speed' });
    s.step();
    expect(s.drainEvents().some((e) => e.type === 'commandFailed')).toBe(true);
    for (let i = 0; i < plan.days * TICKS_PER_DAY + 2; i++) s.step();
    expect(researchLevel(s.state, 'capacity')).toBe(1);
    expect(s.state.research.current).toBeNull();
    expect(s.drainEvents().some((e) => e.type === 'researchDone')).toBe(true);
    expect(nextLevelPlan(s.state, 'capacity')!.cost).toBeGreaterThan(plan.cost);
  });

  it('przerwanie zwraca część ceny, poziom bez zmian', () => {
    const s = sim();
    const money = s.state.money;
    const cost = nextLevelPlan(s.state, 'speed')!.cost;
    s.enqueue({ type: 'startResearch', id: 'speed' });
    s.enqueue({ type: 'cancelResearch' });
    s.step();
    expect(s.state.money).toBe(money - cost + Math.round(cost * RESEARCH_CANCEL_REFUND));
    expect(researchLevel(s.state, 'speed')).toBe(0);
  });

  it('efekty: ładowność, prędkość, utrzymanie, wcześniejsze lokomotywy; maksymalny poziom', () => {
    const s = sim().state;
    s.research.levels = { capacity: 2, speed: 1, maintenance: 3, engines: 1 };
    expect(wagonCapacity(s, 30)).toBe(36);
    expect(engineMaxSpeed(s, 100)).toBe(110);
    expect(maintenanceFactor(s)).toBeCloseTo(0.7);
    // Sokół wchodzi w 1960 – z prototypami (2 lata) dostępny w 1958; w 1950 jeszcze nie.
    expect(engineOnSale(s, engineDef('sokol')!)).toBe(false);
    s.tick = 8 * 360 * TICKS_PER_DAY;
    expect(engineOnSale(s, engineDef('sokol')!)).toBe(true);
    const max = RESEARCH.find((r) => r.id === 'capacity')!.maxLevel;
    s.research.levels.capacity = max;
    expect(nextLevelPlan(s, 'capacity')).toBeNull();
  });

  it('zapis zachowuje badania; stary zapis (v23) dostaje puste', () => {
    const s = sim();
    s.enqueue({ type: 'startResearch', id: 'loading' });
    s.step();
    s.state.research.levels.rating = 2;
    const data = JSON.parse(JSON.stringify(serializeState(s.state)));
    const back = deserializeState(data);
    expect(back.research).toEqual(s.state.research);
    data.version = 23;
    delete data.research;
    expect(deserializeState(data).research).toEqual({ levels: {}, current: null });
  });
});
