import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/commands';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { planStation } from '../src/sim/station/station';
import { Terrain } from '../src/sim/world/map';

const fails = (events: SimEvent[]) => events.flatMap((e) => (e.type === 'commandFailed' ? [e.reason] : []));

function sim(): Simulation {
  const state = createGame({ width: 24, height: 24, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  const s = new Simulation(state);
  s.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  s.processCommands();
  return s;
}

describe('rozbudowa stacji', () => {
  it('peron obok stacji ją rozbudowuje (ta sama nazwa, wspólne kafelki)', () => {
    const s = sim();
    const st = s.state.stations[0]!;
    st.cargo.coal = { waiting: 120, lastPickup: 0 };
    expect(planStation(s.state, 5, 6, 8, 6, 'x').join?.id).toBe(st.id);
    s.enqueue({ type: 'buildStation', x0: 5, y0: 6, x1: 8, y1: 6, axis: 'x' });
    s.processCommands();
    expect(fails(s.drainEvents())).toEqual([]);
    expect(s.state.stations).toHaveLength(1);
    expect(st.tiles).toHaveLength(8);
    expect(s.state.map.station[6 * 24 + 5]).toBe(st.id);
    expect(st.cargo.coal?.waiting).toBe(120);
  });

  it('separate – osobna stacja obok; daleko – zawsze nowa', () => {
    const s = sim();
    s.enqueue({ type: 'buildStation', x0: 5, y0: 6, x1: 8, y1: 6, axis: 'x', separate: true });
    s.enqueue({ type: 'buildStation', x0: 5, y0: 15, x1: 8, y1: 15, axis: 'x' });
    s.processCommands();
    expect(s.state.stations).toHaveLength(3);
    expect(planStation(s.state, 5, 10, 8, 10, 'x').join).toBeNull();
  });

  it('rozbudowa po skosie (tylko narożnikiem) nie łączy', () => {
    const s = sim();
    expect(planStation(s.state, 9, 6, 12, 6, 'x').join).toBeNull();
    expect(planStation(s.state, 9, 5, 12, 5, 'x').join?.id).toBe(1); // przedłużenie peronu
  });
});
