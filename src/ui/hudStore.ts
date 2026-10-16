import type { Speed } from '../loop';
import type { Terrain } from '../sim/world/map';
import type { Tool } from '../tools';
import { Store } from './store';

export type WindowRef = { kind: 'depot'; depotId: number } | { kind: 'train'; trainId: number };

/** Skrót pociągu do list w oknach. */
export interface TrainSummary {
  id: number;
  name: string;
  engine: string;
  wagons: string[];
  status: string;
  resale: number;
}

export interface DepotWindowData {
  kind: 'depot';
  depotId: number;
  trains: TrainSummary[];
}

export type WindowData = DepotWindowData;

export interface HudState {
  date: string;
  money: number;
  speed: Speed;
  tool: Tool;
  fps: number;
  zoom: number;
  /** Podsumowanie grafu torów, gdy włączony podgląd (G). */
  graphInfo: string | null;
  hover: { x: number; y: number; terrain: Terrain; station: string | null } | null;
  /** Koszt / błąd przy kursorze podczas używania narzędzia (x, y – piksele ekranu). */
  cursorLabel: { x: number; y: number; text: string; ok: boolean } | null;
  message: { id: number; text: string } | null;
  /** Daty zapisów w przeglądarce (ISO) – do menu. */
  saves: { quick: string | null; auto: string | null };
  menuOpen: boolean;
  window: WindowRef | null;
  /** Dane otwartego okna, odświeżane przez grę. */
  windowData: WindowData | null;
}

export const hudStore = new Store<HudState>({
  date: '',
  money: 0,
  speed: 1,
  tool: 'cursor',
  fps: 0,
  zoom: 1,
  graphInfo: null,
  hover: null,
  cursorLabel: null,
  message: null,
  saves: { quick: null, auto: null },
  menuOpen: false,
  window: null,
  windowData: null,
});

let messageId = 0;

export function showMessage(text: string): void {
  hudStore.set({ message: { id: ++messageId, text } });
}

export interface HudActions {
  setSpeed(speed: Speed): void;
  setTool(tool: Tool): void;
  toggleMenu(): void;
  quickSave(): void;
  quickLoad(): void;
  exportFile(): void;
  importFile(): void;
  newGame(): void;
  closeWindow(): void;
  buyTrain(depotId: number, engine: string, wagons: string[]): void;
  sellTrain(trainId: number): void;
}
