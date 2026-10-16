import type { Speed } from '../loop';
import type { Terrain } from '../sim/world/map';
import { Store } from './store';

export interface HudState {
  date: string;
  money: number;
  speed: Speed;
  fps: number;
  zoom: number;
  hover: { x: number; y: number; terrain: Terrain } | null;
  message: { id: number; text: string } | null;
}

export const hudStore = new Store<HudState>({
  date: '',
  money: 0,
  speed: 1,
  fps: 0,
  zoom: 1,
  hover: null,
  message: null,
});

export interface HudActions {
  setSpeed(speed: Speed): void;
}
