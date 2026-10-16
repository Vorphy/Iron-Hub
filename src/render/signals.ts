import { Graphics } from 'pixi.js';
import { dirBit, type Signal } from '../sim/signals/signals';
import type { GameState } from '../sim/state';
import { TRACK_SIDES } from '../sim/track/track';
import { pointOnStep, stepLength } from '../sim/trains/steps';
import type { Step } from '../sim/trains/train';
import { tileToWorld } from './iso';

const POST_H = 12;
const RED = 0xe0503a;
const GREEN = 0x5fd35f;
const RESERVATION_COLORS = [0x4cc9f0, 0xf72585, 0xffb703, 0x06d6a0, 0x9d4edd, 0xff6b35, 0xb5e48c, 0xff9ff3];

/**
 * Semafory (tryb Ekspert) – zielone, gdy pociąg zarezerwował drogę przez nie, inaczej czerwone.
 * Opcjonalnie rezerwacje torów (klawisz V) w kolorach pociągów.
 */
export class SignalRenderer {
  readonly gfx = new Graphics();
  showReservations = false;

  draw(state: GameState): void {
    const g = this.gfx;
    g.clear();
    if (this.showReservations) drawReservations(g, state);
    if (state.signalMode !== 'manual') return;

    // Odcinki, przez które jakiś pociąg ma zarezerwowany przejazd dalej (semafor „zielony”).
    const W = state.map.width;
    const passing = new Set<string>();
    for (const t of state.trains) {
      const path = [...t.trail].reverse().concat(t.reservedAhead);
      for (let i = 0; i + 1 < path.length; i++) {
        const s = path[i]!;
        if (s.track) passing.add(`${s.y * W + s.x}:${s.track}:${dirBit(s)}`);
      }
    }
    for (const sig of state.signals) {
      for (const bit of [1, 2] as const) {
        if (!(sig.dirs & bit)) continue;
        const green = passing.has(`${sig.y * W + sig.x}:${sig.track}:${bit}`);
        drawSignal(g, sig, bit, green);
      }
    }
  }
}

/** Słup z latarnią po prawej stronie toru, przy końcu elementu w kierunku jazdy. */
function drawSignal(g: Graphics, sig: Signal, bit: 1 | 2, green: boolean): void {
  const [a, b] = TRACK_SIDES[sig.track];
  const step: Step = bit === 1 ? { x: sig.x, y: sig.y, track: sig.track, entry: a, exit: b } : { x: sig.x, y: sig.y, track: sig.track, entry: b, exit: a };
  const len = stepLength(step);
  const p0 = pointOnStep(step, len * 0.7);
  const p1 = pointOnStep(step, len * 0.9);
  const ux = p1.x - p0.x;
  const uy = p1.y - p0.y;
  const n = Math.hypot(ux, uy) || 1;
  // Prawa strona kierunku jazdy w układzie logicznym: (-uy, ux).
  const base = tileToWorld(p1.x + (-uy / n) * 0.3, p1.y + (ux / n) * 0.3);
  g.moveTo(base.x, base.y).lineTo(base.x, base.y - POST_H).stroke({ width: 2, color: 0x2b2b2b });
  g.circle(base.x, base.y - POST_H, 3.5).fill(green ? GREEN : RED).stroke({ width: 1, color: 0x000000 });
  if (sig.oneWay) g.circle(base.x, base.y - POST_H + 6, 1.5).fill(0xffffff);
}

function drawReservations(g: Graphics, state: GameState): void {
  for (const t of state.trains) {
    const color = RESERVATION_COLORS[t.id % RESERVATION_COLORS.length]!;
    for (const [steps, alpha] of [
      [t.trail, 0.35],
      [t.reservedAhead, 0.8],
    ] as const) {
      for (const s of steps) {
        const a = tileToWorld(...xy(pointOnStep(s, 0)));
        const b = tileToWorld(...xy(pointOnStep(s, stepLength(s))));
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      g.stroke({ width: 5, color, alpha });
    }
  }
}

function xy(p: { x: number; y: number }): [number, number] {
  return [p.x, p.y];
}

