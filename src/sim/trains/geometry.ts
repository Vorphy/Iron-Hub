import { VEHICLE_GAP } from '../config';
import { pointOnStep, stepLength } from './steps';
import type { Train } from './train';
import { engineDef, wagonDef } from './vehicles';

export interface VehicleSlot {
  /** Indeks w składzie: 0 – lokomotywa, 1.. – wagony. */
  index: number;
  length: number;
  color: string;
  engine: boolean;
}

/** Pojazdy w kolejności jazdy (od czoła); po zawróceniu lokomotywa jest na końcu. */
export function vehiclesInOrder(train: Train): VehicleSlot[] {
  const e = engineDef(train.engine)!;
  const list: VehicleSlot[] = [
    { index: 0, length: e.length, color: e.color, engine: true },
    ...train.wagons.map((id, i) => {
      const w = wagonDef(id)!;
      return { index: i + 1, length: w.length, color: w.color, engine: false };
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
  return pointOnStep(train.trail[k]!, pos - remaining);
}

export interface VehiclePose {
  index: number;
  color: string;
  engine: boolean;
  front: { x: number; y: number };
  back: { x: number; y: number };
}

/** Położenie każdego widocznego pojazdu (przód i tył w układzie logicznym). */
export function vehiclePoses(train: Train): VehiclePose[] {
  const out: VehiclePose[] = [];
  if (train.status === 'depot' || train.trail.length === 0) return out;
  let offset = 0;
  for (const v of vehiclesInOrder(train)) {
    const front = pointBehindHead(train, offset);
    const back = pointBehindHead(train, offset + v.length);
    if (front && back) out.push({ index: v.index, color: v.color, engine: v.engine, front, back });
    offset += v.length + VEHICLE_GAP;
  }
  return out;
}
