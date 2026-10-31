import { describe, expect, it } from 'vitest';
import { STATION_WAIT_TICKS } from '../src/sim/config';
import { deserializeState, serializeState } from '../src/sim/serialize';
import { Simulation } from '../src/sim/simulation';
import { createGame } from '../src/sim/state';
import { TICKS_PER_DAY } from '../src/sim/time';
import { Side, Track, type TrackPiece } from '../src/sim/track/track';
import { enterUnbunchDepot, lineTiming } from '../src/sim/trains/spacing';
import { Terrain } from '../src/sim/world/map';

const xLine = (x0: number, x1: number, y: number): TrackPiece[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, track: Track.X }));

function line(): Simulation {
  const state = createGame({ width: 40, height: 12, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 1_000_000;
  const sim = new Simulation(state);
  sim.enqueue({ type: 'buildTrack', pieces: xLine(1, 30, 5) });
  sim.enqueue({ type: 'buildDepot', x: 0, y: 5, side: Side.SE });
  sim.enqueue({ type: 'buildStation', x0: 5, y0: 5, x1: 8, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 22, y0: 5, x1: 25, y1: 5, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2] });
  sim.processCommands();
  return sim;
}

describe('rozkład czasowy', () => {
  it('przeciąganie pozycji rozkładu: opcje jadą z nią, pociąg dalej jedzie do tej samej stacji (cała linia)', () => {
    const sim = line();
    sim.enqueue({ type: 'buildStation', x0: 12, y0: 5, x1: 14, y1: 5, axis: 'x' });
    sim.enqueue({ type: 'setOrders', trainId: 1, orders: [1, 2, 3], fullLoad: [false, true, false], waitDays: [0, 0, 5] });
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    const [a, b] = sim.state.trains;
    a!.currentOrder = 2;
    b!.currentOrder = 0;
    sim.enqueue({ type: 'moveOrder', trainId: 1, from: 2, to: 0 });
    sim.processCommands();
    for (const t of [a!, b!]) {
      expect(t.orders).toEqual([3, 1, 2]);
      expect(t.fullLoad).toEqual([false, false, true]);
      expect(t.waitDays).toEqual([5, 0, 0]);
    }
    expect(a!.orders[a!.currentOrder]).toBe(3);
    expect(b!.orders[b!.currentOrder]).toBe(1);
    sim.enqueue({ type: 'moveOrder', trainId: 1, from: 0, to: 3 });
    sim.processCommands();
    expect(a!.orders).toEqual([3, 1, 2]);
  });

  it('dodatkowy postój przy stacji wydłuża postój o tyle dni (dla całej linii)', () => {
    const sim = line();
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.enqueue({ type: 'setWaitDays', trainId: 1, index: 1, days: 3 });
    sim.processCommands();
    const [a, b] = sim.state.trains;
    expect(b!.waitDays).toEqual([0, 3]);
    sim.enqueue({ type: 'startTrain', trainId: 1 });
    sim.processCommands();
    for (let i = 0; i < 8000 && !(a!.status === 'loading' && a!.currentOrder === 1); i++) sim.step();
    expect(a!.waitTicks).toBeGreaterThanOrEqual(STATION_WAIT_TICKS + 3 * TICKS_PER_DAY - 1);
  });
});

/**
 * Pętla (prostokąt 36×7) z czterema stacjami po 4 kafelki: A (x 6–9) i B (x 26–29) u góry, C (x 26–29)
 * i D (x 6–9) na dole. Zajezdnia nad górnym torem (x 20), wjazd i wyjazd w obie strony.
 * Rozkład B → C → D → A.
 */
function ring(trains: number): Simulation {
  const state = createGame({ width: 42, height: 14, seed: 1, empty: true });
  state.map.terrain.fill(Terrain.Grass);
  state.money = 10_000_000;
  const sim = new Simulation(state);
  const yLine = (x: number, y0: number, y1: number): TrackPiece[] =>
    Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i, track: Track.Y }));
  sim.enqueue({
    type: 'buildTrack',
    pieces: [
      ...xLine(3, 36, 3),
      ...xLine(3, 36, 9),
      ...yLine(2, 4, 8),
      ...yLine(37, 4, 8),
      { x: 2, y: 3, track: Track.Lower },
      { x: 37, y: 3, track: Track.Left },
      { x: 37, y: 9, track: Track.Upper },
      { x: 2, y: 9, track: Track.Right },
      { x: 20, y: 3, track: Track.Right },
      { x: 20, y: 3, track: Track.Upper },
    ],
  });
  sim.enqueue({ type: 'buildDepot', x: 20, y: 2, side: Side.SW });
  sim.enqueue({ type: 'buildStation', x0: 6, y0: 3, x1: 9, y1: 3, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 26, y0: 3, x1: 29, y1: 3, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 26, y0: 9, x1: 29, y1: 9, axis: 'x' });
  sim.enqueue({ type: 'buildStation', x0: 6, y0: 9, x1: 9, y1: 9, axis: 'x' });
  sim.enqueue({ type: 'buyTrain', depotId: 1, engine: 'iskra', wagons: ['osobowy'] });
  sim.processCommands();
  const [a, b, c, d] = sim.state.stations.map((st) => st.id);
  sim.enqueue({ type: 'setOrders', trainId: 1, orders: [b!, c!, d!, a!] });
  for (let i = 1; i < trains; i++) sim.enqueue({ type: 'cloneTrain', trainId: 1 });
  sim.processCommands();
  expect(sim.state.trains).toHaveLength(trains);
  return sim;
}

/** Wypuszcza pociągi z zajezdni jeden po drugim, tuż za sobą – jadą zbici w grupę. */
function startBunched(sim: Simulation): void {
  for (const t of sim.state.trains) {
    sim.enqueue({ type: 'startTrain', trainId: t.id });
    sim.processCommands();
    for (let i = 0; i < 400 && t.status === 'depot'; i++) sim.step();
    for (let i = 0; i < 60; i++) sim.step();
  }
}

/** Odjazdy ze stacji `index` rozkładu w czasie `ticks` (rosnąco). */
function departures(sim: Simulation, ticks: number, index = 1): number[] {
  const out: number[] = [];
  const at = sim.state.trains.map((t) => t.currentOrder);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    sim.state.trains.forEach((t, k) => {
      if (at[k] === index && t.currentOrder !== index) out.push(sim.state.tick);
      at[k] = t.currentOrder;
    });
  }
  return out;
}

const gapsOf = (deps: number[]) => deps.slice(1).map((d, i) => d - deps[i]!);

// Symulacja kilkudziesięciu tysięcy ticków – przy równoległych testach dłużej niż domyślne 5 s.
describe('równe odstępy na linii (jak „unbunching” w OpenTTD)', { timeout: 30_000 }, () => {
  it('bez równych odstępów pociągi wypuszczone razem jeżdżą w grupie', () => {
    const sim = ring(4);
    startBunched(sim);
    const gaps = gapsOf(departures(sim, 30_000));
    expect(Math.min(...gaps)).toBeLessThan(Math.max(...gaps) / 4);
  });

  it('pociągi wypuszczone razem rozkładają się równo: odstęp = okrążenie / liczba pociągów', () => {
    const sim = ring(4);
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: true });
    sim.processCommands();
    const first = sim.state.trains[0]!;
    const timing0 = lineTiming(sim.state, first)!;
    expect(timing0.depotId).toBe(1);
    // Zajezdnia leży przy górnym torze – zjazd na odcinku A → B (najkrótszy objazd).
    expect(first.orders[timing0.afterOrder]).toBe(sim.state.stations[0]!.id);
    startBunched(sim);
    departures(sim, 40_000);
    const timing = lineTiming(sim.state, first)!;
    expect(timing.cycle).toBeGreaterThan(0);
    expect(timing.headway).toBe(Math.round(timing.cycle / 4));
    expect(timing.overloaded).toBe(false);
    const gaps = gapsOf(departures(sim, timing.cycle * 2));
    expect(gaps.length).toBeGreaterThanOrEqual(6);
    for (const g of gaps) expect(Math.abs(g - timing.headway) / timing.headway).toBeLessThan(0.05);
  });

  it('odstęp nie rośnie z czasem (czekanie w zajezdni nie wlicza się do okrążenia)', () => {
    const sim = ring(4);
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: true });
    sim.processCommands();
    startBunched(sim);
    departures(sim, 40_000);
    const early = lineTiming(sim.state, sim.state.trains[0]!)!.headway;
    departures(sim, 60_000);
    const late = lineTiming(sim.state, sim.state.trains[0]!)!.headway;
    expect(Math.abs(late - early) / early).toBeLessThan(0.03);
  });

  it('dokupiony pociąg: odstęp sam się zmniejsza i linia znów jedzie równo', () => {
    const sim = ring(3);
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: true });
    sim.processCommands();
    startBunched(sim);
    departures(sim, 40_000);
    const h3 = lineTiming(sim.state, sim.state.trains[0]!)!.headway;
    sim.enqueue({ type: 'cloneTrain', trainId: 1 });
    sim.processCommands();
    sim.enqueue({ type: 'startTrain', trainId: sim.state.trains[3]!.id });
    sim.processCommands();
    departures(sim, 40_000);
    const timing = lineTiming(sim.state, sim.state.trains[0]!)!;
    expect(timing.trains).toBe(4);
    expect(Math.abs(timing.headway - (h3 * 3) / 4) / timing.headway).toBeLessThan(0.05);
    const gaps = gapsOf(departures(sim, timing.cycle * 2));
    for (const g of gaps) expect(Math.abs(g - timing.headway) / timing.headway).toBeLessThan(0.05);
  });

  it('pomiar okrążenia jak w OpenTTD: jeden zator zmienia go najwyżej 2×; zatrzymany pociąg się nie liczy', () => {
    const sim = ring(3);
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: true });
    sim.processCommands();
    const [a, b, c] = sim.state.trains;
    for (const t of [a!, b!, c!]) t.stopped = false;
    a!.roundTripTicks = 3000;
    a!.lastUnbunchDeparture = 0;
    sim.state.tick = 20_000;
    a!.unbunchDepot = 1;
    enterUnbunchDepot(sim.state, a!);
    expect(a!.roundTripTicks).toBe(6000);
    b!.roundTripTicks = 3000;
    c!.roundTripTicks = 3000;
    expect(lineTiming(sim.state, a!)!.headway).toBe(Math.round(12_000 / 3 / 3));
    c!.stopped = true;
    expect(lineTiming(sim.state, a!)).toMatchObject({ trains: 2, headway: Math.round(9000 / 2 / 2) });
  });

  it('przeciążenie: pociągi linii stoją w korkach za sobą ponad 10% okrążenia', () => {
    const sim = ring(4);
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: true });
    sim.processCommands();
    for (const t of sim.state.trains) {
      t.stopped = false;
      t.roundTripTicks = 10_000;
      t.roundTripJam = 2_500;
    }
    expect(lineTiming(sim.state, sim.state.trains[0]!)).toMatchObject({ overloaded: true, maxTrains: 3 });
    for (const t of sim.state.trains) t.roundTripJam = 500;
    expect(lineTiming(sim.state, sim.state.trains[0]!)).toMatchObject({ overloaded: false, maxTrains: 4 });
  });

  it('wyłączenie: czekający w zajezdni wyjeżdża, zaplanowany zjazd odpada; zapis', () => {
    const sim = ring(2);
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: true });
    sim.processCommands();
    startBunched(sim);
    departures(sim, 20_000);
    const loaded = deserializeState(JSON.parse(JSON.stringify(serializeState(sim.state))));
    expect(loaded.trains.map((t) => t.roundTripTicks)).toEqual(sim.state.trains.map((t) => t.roundTripTicks));
    sim.enqueue({ type: 'setSpacing', trainId: 1, on: false });
    sim.processCommands();
    expect(sim.state.trains.every((t) => t.unbunchDepot === null)).toBe(true);
    departures(sim, 3000);
    expect(sim.state.trains.every((t) => t.status !== 'depot')).toBe(true);
  });

  it('zapis v33: równe odstępy mierzą się od nowa', () => {
    const sim = line();
    const data = serializeState(sim.state) as unknown as { version: number; trains: Record<string, unknown>[] };
    data.version = 33;
    for (const t of data.trains) {
      for (const k of [
        'unbunchDepot',
        'lastUnbunchDeparture',
        'nextUnbunchDeparture',
        'roundTripTicks',
        'roundTripJam',
        'lapJamTicks',
        'lastGap',
      ])
        delete t[k];
      Object.assign(t, { departedFirstTick: 500, loopTicks: 9000 });
    }
    const loaded = deserializeState(JSON.parse(JSON.stringify(data)));
    expect(loaded.trains[0]).toMatchObject({ roundTripTicks: 0, lastUnbunchDeparture: -1, unbunchDepot: null });
    expect(loaded.trains[0]).not.toHaveProperty('loopTicks');
  });
});
