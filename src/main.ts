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
  type ViewState,
} from './persistence/saves';
import { createGame, type GameState } from './sim/state';
import { Hud } from './ui/Hud';
import { hudStore, showMessage, type HudActions } from './ui/hudStore';

/** Domyślny rozmiar mapy (okno nowej gry pozwala wybrać inny). */
const DEFAULT_MAP_SIZE = 128;
const ALLOWED_SIZES = [64, 128, 256, 512];
const AUTOSAVE_MS = 30_000;

let app: Application;
let game: Game | null = null;
/** Stan przy ostatnim autozapisie – nie zapisujemy, gdy nic się nie zmieniło (pauza, kamera w miejscu). */
let autosavedKey = '';

function autosaveKey(g: Game): string {
  const v = g.view;
  return `${g.state.tick}:${Math.round(v.cx)}:${Math.round(v.cy)}:${v.zoom}`;
}

function startGame(state: GameState, view: ViewState | null = null): void {
  game?.destroy();
  game = new Game(app, state);
  if (view) game.view = view;
  game.closeWindow();
  // Dostęp z konsoli przeglądarki przy pracy lokalnej (testy, debugowanie).
  if (import.meta.env.DEV) Object.assign(window, { game, iron: { startGame, createGame } });
  autosavedKey = autosaveKey(game);
  hudStore.set({ menuOpen: false });
}

function newGame(seed: number, size = DEFAULT_MAP_SIZE): void {
  startGame(createGame({ width: size, height: size, seed }));
}

async function refreshSaveInfo(): Promise<void> {
  const [quick, auto] = await Promise.all([slotDate('quick'), slotDate('auto')]);
  hudStore.set({ saves: { quick, auto } });
}

async function saveTo(slot: Slot, silent = false): Promise<void> {
  if (!game) return;
  try {
    await writeSlot(slot, game.state, game.view);
    if (slot === 'auto') autosavedKey = autosaveKey(game);
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
    startGame(save.state, save.view);
    return true;
  } catch (e) {
    showMessage(describeError(e));
    return false;
  }
}

const actions: HudActions = {
  setSpeed: (s) => game?.setSpeed(s),
  setTool: (t) => game?.setTool(t),
  setDepotSide: (s) => game?.toolController.setDepotSide(s),
  setStationAxis: (a) => game?.toolController.setStationAxis(a),
  setSignalKind: (k) => game?.toolController.setSignalKind(k),
  setTrackMode: (m) => game?.toolController.setTrackMode(m),
  setTerrainMode: (m) => game?.toolController.setTerrainMode(m),
  setSignalMode: (mode) => game?.command({ type: 'setSignalMode', mode }),
  toggleMenu: () => hudStore.set({ menuOpen: !hudStore.get().menuOpen }),
  openFinance: () => game?.openWindow({ kind: 'finance' }),
  addTestMoney: () => game?.command({ type: 'addMoney', amount: 100_000 }),
  quickSave: () => void saveTo('quick'),
  quickLoad: () => {
    void loadFrom('quick').then((ok) => ok && showMessage('Wczytano zapis'));
  },
  exportFile: () => game && downloadSave(game.state, game.view),
  importFile: () => {
    void pickSaveFile().then((text) => {
      if (text === null) return;
      try {
        const save = parseSaveFile(text);
        startGame(save.state, save.view);
        showMessage('Wczytano grę z pliku');
      } catch (e) {
        showMessage(describeError(e));
      }
    });
  },
  closeWindow: () => game?.closeWindow(),
  buyTrain: (depotId, engine, wagons) => game?.command({ type: 'buyTrain', depotId, engine, wagons }),
  sellTrain: (trainId) => game?.command({ type: 'sellTrain', trainId }),
  openTrain: (trainId) => game?.openWindow({ kind: 'train', trainId }),
  startTrain: (trainId) => game?.command({ type: 'startTrain', trainId }),
  stopTrain: (trainId) => game?.command({ type: 'stopTrain', trainId }),
  sendToDepot: (trainId) => game?.command({ type: 'sendToDepot', trainId }),
  reverseTrain: (trainId) => game?.command({ type: 'reverseTrain', trainId }),
  setOrders: (trainId, orders) => game?.command({ type: 'setOrders', trainId, orders }),
  pickOrders: (trainId) => game?.pickOrders(trainId),
  focusTrain: (trainId) => game?.focusTrain(trainId),
  newGame: () => hudStore.set({ newGameOpen: true, menuOpen: false }),
  closeNewGame: () => hudStore.set({ newGameOpen: false }),
  startNewGame: (size, seed) => {
    hudStore.set({ newGameOpen: false });
    newGame(seed, size);
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

  // ?seed=N[&size=S] wymusza nową grę na danej mapie; inaczej kontynuujemy autozapis.
  // Bez autozapisu (pierwsze wejście) – mapa w tle i okno nowej gry z wyborem rozmiaru.
  const params = new URLSearchParams(location.search);
  const seedParam = Number(params.get('seed'));
  const sizeParam = Number(params.get('size'));
  const size = ALLOWED_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_MAP_SIZE;
  if (seedParam) newGame(seedParam, size);
  else if (await loadFrom('auto')) showMessage('Wczytano autozapis');
  else {
    newGame(1);
    hudStore.set({ newGameOpen: true });
  }
  void refreshSaveInfo();

  setInterval(() => {
    if (game && autosaveKey(game) !== autosavedKey) void saveTo('auto', true);
  }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveTo('auto', true);
  });
}

void start();
