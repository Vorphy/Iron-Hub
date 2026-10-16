import type { Simulation } from './sim/simulation';

export const SPEEDS = [0, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

/** Długość ticku przy prędkości x1 (20 ticków/s). */
export const TICK_MS = 50;
/** Ogranicza nadrabianie po zawieszeniu karty, żeby nie wpaść w spiralę opóźnień. */
const MAX_FRAME_MS = 250;
const MAX_TICKS_PER_FRAME = 64;

/** Stały krok symulacji niezależny od FPS (akumulator czasu). */
export class GameLoop {
  speed: Speed = 1;
  private acc = 0;
  /** Wywoływane przed każdym tickiem – renderer zapamiętuje pozycje do interpolacji. */
  onBeforeStep: (() => void) | null = null;

  constructor(private readonly sim: Simulation) {}

  /** Zwraca liczbę wykonanych ticków. */
  advance(deltaMs: number): number {
    if (this.speed === 0) {
      this.acc = 0;
      this.sim.processCommands();
      return 0;
    }
    this.acc += Math.min(deltaMs, MAX_FRAME_MS) * this.speed;
    let ticks = 0;
    while (this.acc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      this.onBeforeStep?.();
      this.sim.step();
      this.acc -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.acc = 0;
    // Komendy gracza nie czekają na następny tick.
    if (ticks === 0) this.sim.processCommands();
    return ticks;
  }

  /** Ułamek do następnego ticku – do interpolacji ruchu w rendererze. */
  get alpha(): number {
    return this.acc / TICK_MS;
  }
}
