import { customCounts, DEFAULT_DENSITY, isDensity } from './sim/world/generate';
import { LATEST_CHANGELOG } from './ui/HelpWindows';
import { START_YEAR, START_YEARS } from './sim/time';
import { Application } from 'pixi.js';
import { h, render } from 'preact';
import { Game } from './game';
import { loadGfx, setGfxEnabled } from './render/gfx/gfx';
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
import { defaultMinimapSettings, type MinimapSettings, type NewWorldSettings } from './ui/hudStore';
import { hudStore, showMessage, type HudActions } from './ui/hudStore';

/** Domyślny rozmiar mapy (okno nowej gry pozwala wybrać inny). */
const DEFAULT_MAP_SIZE = 128;
const ALLOWED_SIZES = [64, 128, 256, 512, 1024];
const AUTOSAVE_MS = 30_000;
const TRAFFIC_KEY = 'ironhub.traffic';
const GFX_KEY = 'ironhub.gfx';
const MINIMAP_KEY = 'ironhub.minimap';
const MINIMAP_SETTINGS_KEY = 'ironhub.minimapSettings';

/** Zapamiętane ustawienia minimapy (nowe typy zakładów – domyślnie widoczne). */
function storedMinimap(): MinimapSettings {
  const def = defaultMinimapSettings();
  try {
    const raw = JSON.parse(localStorage.getItem(MINIMAP_SETTINGS_KEY) ?? 'null') as Partial<MinimapSettings> | null;
    if (!raw) return def;
    return {
      ...def,
      zoom: [1, 2, 4, 8].includes(raw.zoom ?? 1) ? (raw.zoom ?? 1) : 1,
      pos: raw.pos ?? null,
      legend: raw.legend === true,
      filters: {
        ...def.filters,
        ...raw.filters,
        industries: { ...def.filters.industries, ...raw.filters?.industries },
      },
    };
  } catch {
    return def;
  }
}
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

function newGame(seed: number, size = DEFAULT_MAP_SIZE, settings: Partial<NewWorldSettings> = {}): void {
  const state = createGame({ width: size, height: size, seed, ...settings });
  startGame(state);
  // Tryb własny: na mapie mogło się nie zmieścić wszystko, o co prosił gracz.
  const custom = settings.custom;
  if (custom) {
    const wanted = customCounts(custom);
    if (state.towns.length < wanted.towns || state.industries.length < wanted.industries) {
      showMessage(
        `Zmieściło się ${state.towns.length} z ${wanted.towns} miast i ${state.industries.length} z ${wanted.industries} zakładów – większa mapa pomieści więcej`,
      );
    }
  }
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
  setStationSeparate: (on) => game?.toolController.setStationSeparate(on),
  setStationKind: (kind) => game?.toolController.setStationKind(kind),
  setTerrainMode: (m) => game?.toolController.setTerrainMode(m),
  setSignalMode: (mode) => game?.command({ type: 'setSignalMode', mode }),
  toggleMenu: () => hudStore.set({ menuOpen: !hudStore.get().menuOpen }),
  toggleBuildings: () => game?.toggleBuildings(),
  toggleUnderground: () => game?.toggleUnderground(),
  toggleGfx: () => {
    const gfx = !hudStore.get().gfx;
    hudStore.set({ gfx });
    setGfxEnabled(gfx);
    game?.redrawAll();
    storeFlag(GFX_KEY, gfx);
  },
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
  setMinimap: (patch) => {
    const minimap = { ...hudStore.get().minimap, ...patch };
    hudStore.set({ minimap });
    try {
      // Duża mapa to chwilowy podgląd – zapamiętujemy resztę.
      localStorage.setItem(MINIMAP_SETTINGS_KEY, JSON.stringify({ ...minimap, big: false }));
    } catch {
      // Bez pamięci przeglądarki ustawienia działają do zamknięcia strony.
    }
  },
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
  openTrains: () => game?.openWindow({ kind: 'trains' }),
  createGroup: (name) => game?.command({ type: 'createGroup', name }),
  renameGroup: (groupId, name) => game?.command({ type: 'renameGroup', groupId, name }),
  deleteGroup: (groupId) => game?.command({ type: 'deleteGroup', groupId }),
  setTrainGroup: (trainId, groupId) => game?.command({ type: 'setTrainGroup', trainId, groupId }),
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
  buyTrain: (depotId, engine, wagons, engineCount = 1) =>
    game?.command({ type: 'buyTrain', depotId, engine, wagons, engineCount }),
  setEngineCount: (trainId, count) => game?.command({ type: 'setEngineCount', trainId, count }),
  sellTrain: (trainId) => game?.command({ type: 'sellTrain', trainId }),
  buyWagon: (depotId, wagon) => game?.command({ type: 'buyWagon', depotId, wagon }),
  sellSpareWagon: (depotId, index) => game?.command({ type: 'sellSpareWagon', depotId, index }),
  attachWagon: (trainId, index) => game?.command({ type: 'attachWagon', trainId, index }),
  detachWagon: (trainId, index) => game?.command({ type: 'detachWagon', trainId, index }),
  sellEngine: (trainId) => game?.command({ type: 'sellEngine', trainId }),
  cloneTrain: (trainId, separate = false) => game?.command({ type: 'cloneTrain', trainId, shared: !separate }),
  unshareOrders: (trainId) => game?.command({ type: 'unshareOrders', trainId }),
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
  setOrders: (trainId, orders, fullLoad, waitDays, nonStop) =>
    game?.command({ type: 'setOrders', trainId, orders, fullLoad, waitDays, nonStop }),
  toggleNonStop: (trainId, index) => game?.command({ type: 'toggleNonStop', trainId, index }),
  setWaitDays: (trainId, index, days) => game?.command({ type: 'setWaitDays', trainId, index, days }),
  setSpacing: (trainId, on) => game?.command({ type: 'setSpacing', trainId, on }),
  toggleFullLoad: (trainId, index) => game?.command({ type: 'toggleFullLoad', trainId, index }),
  pickOrders: (trainId) => game?.pickOrders(trainId),
  focusTrain: (trainId) => game?.focusTrain(trainId),
  newGame: () => hudStore.set({ newGameOpen: true, menuOpen: false }),
  closeNewGame: () => hudStore.set({ newGameOpen: false }),
  startNewGame: (size, seed, settings) => {
    hudStore.set({ newGameOpen: false });
    newGame(seed, size, settings);
    void saveTo('auto', true);
  },
};

async function start(): Promise<void> {
  hudStore.set({ changelogUnseen: storedText(CHANGELOG_KEY) !== LATEST_CHANGELOG, minimap: storedMinimap() });
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
  // Grafika OpenGFX; bez niej gra rysuje proste kształty.
  const gfxAvailable = await loadGfx(`${import.meta.env.BASE_URL}gfx/opengfx/`);
  const gfx = storedFlag(GFX_KEY);
  setGfxEnabled(gfx);
  hudStore.set({ gfxAvailable, gfx });
  render(h(Hud, { actions }), document.getElementById('ui')!);

  // ?seed=N[&size=S] wymusza nową grę na danej mapie; inaczej kontynuujemy autozapis.
  // Bez autozapisu (pierwsze wejście) – mapa w tle i okno nowej gry z wyborem rozmiaru.
  const params = new URLSearchParams(location.search);
  const seedParam = Number(params.get('seed'));
  const sizeParam = Number(params.get('size'));
  const size = ALLOWED_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_MAP_SIZE;
  const yearParam = Number(params.get('year'));
  const year = (START_YEARS as readonly number[]).includes(yearParam) ? yearParam : START_YEAR;
  const density = (name: string) => {
    const v = Number(params.get(name) ?? DEFAULT_DENSITY);
    return isDensity(v) ? v : DEFAULT_DENSITY;
  };
  if (seedParam) {
    newGame(seedParam, size, {
      startYear: year,
      towns: density('towns'),
      industry: density('industry'),
      resources: density('resources'),
    });
  } else if (await loadFrom('auto')) showMessage('Wczytano autozapis');
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

// Podgląd stanu gry w konsoli przeglądarki (tylko serwer deweloperski).
if (import.meta.env.DEV)
  Object.assign(window, {
    ironhub: {
      get game() {
        return game;
      },
    },
  });

void start();
