import { LATEST_CHANGELOG } from './ui/HelpWindows';
import { START_YEAR, START_YEARS } from './sim/time';
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
const ALLOWED_SIZES = [64, 128, 256, 512, 1024];
const AUTOSAVE_MS = 30_000;
const TRAFFIC_KEY = 'ironhub.traffic';
const MINIMAP_KEY = 'ironhub.minimap';
const TUTORIAL_KEY = 'ironhub.tutorial';
const CHANGELOG_KEY = 'ironhub.changelogSeen';

function storedText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Przełącznik z pamięci przeglądarki (domyślnie włączony). */
function storedFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

function storeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Bez dostępu do pamięci przeglądarki ustawienie działa do zamknięcia strony.
  }
}

let minimapCanvas: HTMLCanvasElement | null = null;

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
  game.trafficEnabled = hudStore.get().traffic;
  game.attachMinimap(minimapCanvas);
  hudStore.set({ tutorialSteps: [] });
  game.closeWindow();
  // Dostęp z konsoli przeglądarki przy pracy lokalnej (testy, debugowanie).
  if (import.meta.env.DEV) Object.assign(window, { game, iron: { startGame, createGame } });
  autosavedKey = autosaveKey(game);
  hudStore.set({ menuOpen: false });
}

function newGame(seed: number, size = DEFAULT_MAP_SIZE, startYear = START_YEAR): void {
  startGame(createGame({ width: size, height: size, seed, startYear }));
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
  setCatenaryMode: (m) => game?.toolController.setCatenaryMode(m),
  setTerrainMode: (m) => game?.toolController.setTerrainMode(m),
  setSignalMode: (mode) => game?.command({ type: 'setSignalMode', mode }),
  toggleMenu: () => hudStore.set({ menuOpen: !hudStore.get().menuOpen }),
  toggleTraffic: () => {
    const traffic = !hudStore.get().traffic;
    hudStore.set({ traffic });
    if (game) game.trafficEnabled = traffic;
    storeFlag(TRAFFIC_KEY, traffic);
  },
  openHelp: (topic = 'start') => hudStore.set({ helpTopic: topic, changelogOpen: false, menuOpen: false }),
  closeHelp: () => hudStore.set({ helpTopic: null }),
  openChangelog: () => {
    hudStore.set({ changelogOpen: true, helpTopic: null, menuOpen: false, changelogUnseen: false });
    try {
      localStorage.setItem(CHANGELOG_KEY, LATEST_CHANGELOG);
    } catch {
      // Bez pamięci przeglądarki kropka wróci po odświeżeniu – nic poważnego.
    }
  },
  closeChangelog: () => hudStore.set({ changelogOpen: false }),
  toggleMinimap: () => {
    const minimapOpen = !hudStore.get().minimapOpen;
    hudStore.set({ minimapOpen });
    storeFlag(MINIMAP_KEY, minimapOpen);
  },
  toggleTutorial: () => {
    const tutorialOpen = !hudStore.get().tutorialOpen;
    hudStore.set({ tutorialOpen, menuOpen: false });
    storeFlag(TUTORIAL_KEY, tutorialOpen);
  },
  attachMinimap: (canvas) => {
    minimapCanvas = canvas;
    game?.attachMinimap(canvas);
  },
  minimapGoto: (u, v) => game?.minimapGoto(u, v),
  openFinance: () => game?.openWindow({ kind: 'finance' }),
  addTestMoney: () => game?.command({ type: 'addMoney', amount: 100_000 }),
  borrow: (amount) => game?.command({ type: 'borrow', amount }),
  repay: (amount) => game?.command({ type: 'repay', amount }),
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
  cloneTrain: (trainId) => game?.command({ type: 'cloneTrain', trainId }),
  openTrain: (trainId) => game?.openWindow({ kind: 'train', trainId }),
  startTrain: (trainId) => game?.command({ type: 'startTrain', trainId }),
  stopTrain: (trainId) => game?.command({ type: 'stopTrain', trainId }),
  sendToDepot: (trainId) => game?.command({ type: 'sendToDepot', trainId }),
  reverseTrain: (trainId) => game?.command({ type: 'reverseTrain', trainId }),
  replaceEngine: (trainId, engine, all = false) => {
    if (!game) return;
    const train = game.state.trains.find((t) => t.id === trainId);
    if (!train) return;
    const ids = all ? game.state.trains.filter((t) => t.engine === train.engine).map((t) => t.id) : [trainId];
    for (const id of ids) game.command({ type: 'replaceEngine', trainId: id, engine });
  },
  setOrders: (trainId, orders, fullLoad) => game?.command({ type: 'setOrders', trainId, orders, fullLoad }),
  toggleFullLoad: (trainId, index) => game?.command({ type: 'toggleFullLoad', trainId, index }),
  pickOrders: (trainId) => game?.pickOrders(trainId),
  focusTrain: (trainId) => game?.focusTrain(trainId),
  newGame: () => hudStore.set({ newGameOpen: true, menuOpen: false }),
  closeNewGame: () => hudStore.set({ newGameOpen: false }),
  startNewGame: (size, seed, startYear) => {
    hudStore.set({ newGameOpen: false });
    newGame(seed, size, startYear);
    void saveTo('auto', true);
  },
};

async function start(): Promise<void> {
  hudStore.set({ changelogUnseen: storedText(CHANGELOG_KEY) !== LATEST_CHANGELOG });
  hudStore.set({
    traffic: storedFlag(TRAFFIC_KEY),
    minimapOpen: storedFlag(MINIMAP_KEY),
    tutorialOpen: storedFlag(TUTORIAL_KEY),
  });
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
  const yearParam = Number(params.get('year'));
  const year = (START_YEARS as readonly number[]).includes(yearParam) ? yearParam : START_YEAR;
  if (seedParam) newGame(seedParam, size, year);
  else if (await loadFrom('auto')) showMessage('Wczytano autozapis');
  else {
    newGame(1);
    hudStore.set({ newGameOpen: true });
  }
  void refreshSaveInfo();

  // Autozapis co 30 s; na dużych mapach rzadziej (zapis 1024×1024 to kilkadziesiąt MB danych).
  let lastAutosave = Date.now();
  setInterval(() => {
    if (!game) return;
    const factor = Math.max(1, game.state.map.width / 256);
    if (Date.now() - lastAutosave < AUTOSAVE_MS * factor) return;
    lastAutosave = Date.now();
    // Po bankructwie zostawiamy ostatni autozapis sprzed końca gry.
    if (autosaveKey(game) !== autosavedKey && !game.state.finances.bankrupt) void saveTo('auto', true);
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !game?.state.finances.bankrupt) void saveTo('auto', true);
  });
}

void start();
