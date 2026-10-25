import { VEHICLE_GAP } from '../config';
import type { GameState } from '../state';
import { isTunnelTrack } from '../track/tunnel';
import { pointOnStep, stepHeight, stepLength } from './steps';
import type { Step, Train } from './train';
import { engineDef, wagonDef } from './vehicles';

export interface VehicleSlot {
  /** Indeks w składzie (od lokomotyw, potem wagony) – stały mimo zawracania. */
  index: number;
  length: number;
  color: string;
  engine: boolean;
  /** Id lokomotywy lub wagonu z vehicles.json. */
  type: string;
  /** Wagon z ładunkiem (do grafiki pełnego wagonu). */
  loaded: boolean;
}

/** Pojazdy w kolejności jazdy (od czoła); po zawróceniu lokomotywy są na końcu. */
export function vehiclesInOrder(train: Train): VehicleSlot[] {
  const e = engineDef(train.engine)!;
  const list: VehicleSlot[] = [
    ...Array.from({ length: train.engineCount }, (_, k) => ({
      index: k,
      length: e.length,
      color: e.color,
      engine: true,
      type: train.engine,
      loaded: false,
    })),
    ...train.wagons.map((id, i) => {
      const w = wagonDef(id)!;
      const loaded = (train.loads[i]?.amount ?? 0) > 0;
      return { index: train.engineCount + i, length: w.length, color: w.color, engine: false, type: id, loaded };
    }),
  ];
  return train.reversed ? list.reverse() : list;
}

export function trainLength(train: Train): number {
  const v = vehiclesInOrder(train);
  return v.reduce((s, x) => s + x.length, 0) + VEHICLE_GAP * (v.length - 1);
}

/** Punkt w odległości `d` za czołem, idąc wstecz po zajmowanych odcinkach; null – poza torem (w zajezdni). */
export function pointBehindHead(train: Train, d: number): { x: number; y: number } | null {
  const at = locateBehindHead(train, d);
  return at && pointOnStep(at.step, at.pos);
}

/** Punkt za czołem razem z wysokością toru (mosty, rampy, teren). */
export function pointBehindHeadZ(state: GameState, train: Train, d: number): Point3 | null {
  const at = locateBehindHead(train, d);
  // We wnętrzu tunelu pojazdu nie widać.
  if (!at || isTunnelTrack(at.step.track)) return null;
  return { ...pointOnStep(at.step, at.pos), z: stepHeight(state, at.step, at.pos) };
}

function locateBehindHead(train: Train, d: number): { step: Step; pos: number } | null {
  let remaining = d;
  let k = 0;
  let pos = train.progress;
  while (remaining > pos) {
    remaining -= pos;
    k++;
    const s = train.trail[k];
    if (!s) return null;
    pos = stepLength(s);
  }
  return { step: train.trail[k]!, pos: pos - remaining };
}

export interface Point3 {
  x: number;
  y: number;
  /** Wysokość toru w poziomach terenu. */
  z: number;
}

export interface VehiclePose {
  index: number;
  color: string;
  engine: boolean;
  type: string;
  loaded: boolean;
  front: Point3;
  back: Point3;
}

/** Położenie każdego widocznego pojazdu (przód i tył w układzie logicznym, z wysokością toru). */
export function vehiclePoses(state: GameState, train: Train): VehiclePose[] {
  const out: VehiclePose[] = [];
  if (train.status === 'depot' || train.trail.length === 0) return out;
  let offset = 0;
  for (const v of vehiclesInOrder(train)) {
    const front = pointBehindHeadZ(state, train, offset);
    const back = pointBehindHeadZ(state, train, offset + v.length);
    if (front && back)
      out.push({ index: v.index, color: v.color, engine: v.engine, type: v.type, loaded: v.loaded, front, back });
    offset += v.length + VEHICLE_GAP;
  }
  return out;
}
