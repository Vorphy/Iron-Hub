import { Application } from 'pixi.js';
import { h, render } from 'preact';
import { Game } from './game';
import {
  describeError,
  downloadSave,
  parseSaveFile,
  pickSaveFile,
  readSlot,
  slotDate,
  writeSlot,
  type Slot,
} from './persistence/saves';
import { createGame, type GameState } from './sim/state';
import { Hud } from './ui/Hud';
import { hudStore, showMessage, type HudActions } from './ui/hudStore';

const MAP_SIZE = 128;
const AUTOSAVE_MS = 30_000;

let app: Application;
let game: Game | null = null;
/** Tick ostatniego autozapisu – nie zapisujemy, gdy gra stoi (pauza). */
let autosavedTick = -1;

function startGame(state: GameState): void {
  game?.destroy();
  game = new Game(app, state);
  game.closeWindow();
  autosavedTick = state.tick;
  hudStore.set({ menuOpen: false });
}

function newGame(seed: number): void {
  startGame(createGame({ width: MAP_SIZE, height: MAP_SIZE, seed }));
}

async function refreshSaveInfo(): Promise<void> {
  const [quick, auto] = await Promise.all([slotDate('quick'), slotDate('auto')]);
  hudStore.set({ saves: { quick, auto } });
}

async function saveTo(slot: Slot, silent = false): Promise<void> {
  if (!game) return;
  try {
    await writeSlot(slot, game.state);
    if (slot === 'auto') autosavedTick = game.state.tick;
    if (!silent) showMessage('Gra zapisana');
    void refreshSaveInfo();
  } catch (e) {
    if (!silent) showMessage(describeError(e));
  }
}

async function loadFrom(slot: Slot): Promise<boolean> {
  try {
    const save = await readSlot(slot);
    if (!save) return false;
    startGame(save.state);
    return true;
  } catch (e) {
    showMessage(describeError(e));
    return false;
  }
}

const actions: HudActions = {
  setSpeed: (s) => game?.setSpeed(s),
  setTool: (t) => game?.setTool(t),
  toggleMenu: () => hudStore.set({ menuOpen: !hudStore.get().menuOpen }),
  quickSave: () => void saveTo('quick'),
  quickLoad: () => {
    void loadFrom('quick').then((ok) => ok && showMessage('Wczytano zapis'));
  },
  exportFile: () => game && downloadSave(game.state),
  importFile: () => {
    void pickSaveFile().then((text) => {
      if (text === null) return;
      try {
        startGame(parseSaveFile(text).state);
        showMessage('Wczytano grę z pliku');
      } catch (e) {
        showMessage(describeError(e));
      }
    });
  },
  closeWindow: () => game?.closeWindow(),
  buyTrain: (depotId, engine, wagons) => game?.command({ type: 'buyTrain', depotId, engine, wagons }),
  sellTrain: (trainId) => game?.command({ type: 'sellTrain', trainId }),
  newGame: () => {
    if (!confirm('Rozpocząć nową grę? Niezapisany postęp przepadnie (autozapis zostanie nadpisany).')) return;
    newGame(Math.floor(Math.random() * 1_000_000) + 1);
    void saveTo('auto', true);
  },
};

async function start(): Promise<void> {
  app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1b1f24',
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.getElementById('game')!.appendChild(app.canvas);
  render(h(Hud, { actions }), document.getElementById('ui')!);

  // ?seed=N wymusza nową grę na danej mapie; inaczej kontynuujemy autozapis.
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  if (seedParam) newGame(seedParam);
  else if (await loadFrom('auto')) showMessage('Wczytano autozapis');
  else newGame(1);
  void refreshSaveInfo();

  setInterval(() => {
    if (game && game.state.tick !== autosavedTick) void saveTo('auto', true);
  }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveTo('auto', true);
  });
}

void start();
