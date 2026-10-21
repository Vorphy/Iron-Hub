import { describe, expect, it } from 'vitest';
import type { Overlay } from '../src/render/overlay';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { Tools } from '../src/tools';
import { Terrain } from '../src/sim/world/map';

/** Nakładka bez rysowania – narzędzia tylko wysyłają komendy. */
const noOverlay = new Proxy({}, { get: () => () => {} }) as unknown as Overlay;

/** Dolina jak w testach mostów: most z (5,5) do (14,5). */
function bridgeSim(): Simulation {
  const s = createGame({ width: 40, height: 12, seed: 1, empty: true });
  s.map.terrain.fill(Terrain.Grass);
  for (let vy = 0; vy <= 12; vy++) for (let vx = 0; vx <= 40; vx++) s.map.heights[vy * 41 + vx] = vx <= 6 || vx >= 14 ? 1 : 0;
  const sim = new Simulation(s);
  sim.enqueue({ type: 'buildBridge', x0: 5, y0: 5, x1: 14, y1: 5 });
  sim.step();
  return sim;
}

function click(tools: Tools, x: number, y: number) {
  tools.primaryDown({ x, y });
  tools.primaryUp({ x, y });
}

describe('buldożer', () => {
  it('klik na przyczółek rozbiera cały most (rampa to nie zwykły tor)', () => {
    const sim = bridgeSim();
    expect(sim.state.bridges).toHaveLength(1);
    const tools = new Tools(sim, noOverlay);
    tools.setTool('bulldozer');
    click(tools, 5.5, 5.5);
    sim.step();
    expect(sim.state.bridges).toHaveLength(0);
    expect(sim.state.map.bridge.every((b) => b === 0)).toBe(true);
  });

  it('klik na pomost bez toru pod spodem też rozbiera most', () => {
    const sim = bridgeSim();
    const tools = new Tools(sim, noOverlay);
    tools.setTool('bulldozer');
    click(tools, 9.5, 5.5);
    sim.step();
    expect(sim.state.bridges).toHaveLength(0);
  });
});
