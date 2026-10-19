import { Application, Container } from 'pixi.js';
import { Input } from './input/input';
import { GameLoop, SPEEDS, type Speed } from './loop';
import { Camera } from './render/camera';
import { GraphDebug } from './render/graphDebug';
import { pickTile, setHeightProvider, tileCenter, type Point } from './render/iso';
import { heightAt, MAX_HEIGHT } from './sim/world/height';
import { MapRenderer } from './render/mapRenderer';
import { Overlay } from './render/overlay';
import { BridgeRenderer } from './render/bridges';
import { TunnelRenderer } from './render/tunnels';
import { IndustryRenderer } from './render/buildings';
import { FloatingTexts } from './render/floatingText';
import { MapLabels } from './render/mapLabels';
import { SignalRenderer } from './render/signals';
import { TrafficRenderer } from './render/traffic';
import { TrainRenderer } from './render/trains';
import type { ViewState } from './persistence/saves';
import type { Command } from './sim/commands';
import { depotAt } from './sim/depot/depot';
import { industryAt } from './sim/economy/industry';
import { townAt, townNear, townPopulation } from './sim/economy/town';
import { stationAt } from './sim/station/station';
import { pointBehindHead } from './sim/trains/geometry';
import { trainById } from './sim/trains/train';
import { Simulation } from './sim/simulation';
import type { GameState } from './sim/state';
import { tickToDate } from './sim/time';
import { getTerrain, inBounds } from './sim/world/map';
import { FAIL_MESSAGES, formatMoney, Tools, type Tool } from './tools';
import { hudStore, showMessage, type HudState, type WindowRef } from './ui/hudStore';
import { buildWindowData } from './ui/windowData';

const KEY_SPEEDS: Record<string, Speed> = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 };
const KEY_TOOLS: Record<string, Tool> = {
  Escape: 'cursor',
  KeyT: 'track',
  KeyP: 'station',
  KeyZ: 'depot',
  KeyB: 'signal',
  KeyL: 'terrain',
  KeyM: 'bridge',
  KeyN: 'tunnel',
  KeyX: 'bulldozer',
  Delete: 'bulldozer',
};

/** Spina symulację z prezentacją: pętla, renderer, wejście, narzędzia, HUD. */
export class Game {
  readonly sim: Simulation;
  readonly loop: GameLoop;
  private readonly camera: Camera;
  private readonly mapRenderer: MapRenderer;
  private readonly overlay = new Overlay();
  private readonly graphDebug = new GraphDebug();
  private readonly labels = new MapLabels();
  private readonly industries = new IndustryRenderer();
  private readonly bridges = new BridgeRenderer();
  private readonly tunnels = new TunnelRenderer();
  private readonly floaters = new FloatingTexts();
  private readonly trains = new TrainRenderer();
  private readonly signals = new SignalRenderer();
  private readonly traffic = new TrafficRenderer();
  private readonly tools: Tools;
  private readonly input: Input;
  private pointer: Point | null = null;
  private lastSpeed: Speed = 1;
  private windowJson = '';
  private readonly world = new Container();
  private readonly onResize = (w: number, h: number) => this.camera.resize(w, h);
  private readonly onTick = (ticker: { deltaMS: number }) => this.frame(ticker.deltaMS);

  constructor(
    private readonly app: Application,
    state: GameState,
  ) {
    this.sim = new Simulation(state);
    // Rysowanie i wskazywanie kursorem uwzględniają wysokość terenu bieżącej mapy.
    setHeightProvider((fx, fy) => heightAt(this.sim.state.map, fx, fy));
    this.loop = new GameLoop(this.sim);
    this.tools = new Tools(this.sim, this.overlay);

    const world = this.world;
    this.mapRenderer = new MapRenderer(
      state.map,
      () => this.sim.state.depots,
      () => this.sim.state.bridges,
      () => this.sim.state.tunnels,
    );
    world.addChild(
      this.mapRenderer.container,
      this.traffic.gfx,
      this.industries.gfx,
      this.bridges.gfx,
      this.tunnels.gfx,
      this.graphDebug.gfx,
      this.overlay.container,
      this.signals.gfx,
      this.trains.gfx,
      this.labels.container,
      this.floaters.container,
    );
    this.loop.onBeforeStep = () => this.trains.capture(this.sim.state);
    this.labels.rebuild(state);
    this.industries.draw(state.industries);
    this.bridges.draw(state);
    this.tunnels.draw(state);
    app.stage.addChild(world);

    this.camera = new Camera(world, state.map.width, state.map.height);
    this.camera.resize(app.screen.width, app.screen.height);
    // Start przy największym mieście (na nowej mapie jest od razu co oglądać).
    const town = [...state.towns].sort((a, b) => townPopulation(state, b) - townPopulation(state, a))[0];
    this.camera.centerOn(town ? tileCenter(town.x, town.y) : tileCenter(state.map.width / 2, state.map.height / 2));

    this.input = new Input(app.canvas, this.camera, {
      onPrimaryDown: (sx, sy) => this.tools.primaryDown(this.tileF(sx, sy)),
      onPrimaryDrag: (sx, sy) => this.tools.pointerMoved(this.tileF(sx, sy)),
      onPrimaryUp: (sx, sy) => this.tools.primaryUp(this.tileF(sx, sy)),
      onClick: (sx, sy) => this.onClick(sx, sy),
      onPointerMove: (sx, sy) => {
        this.pointer = { x: sx, y: sy };
        this.tools.pointerMoved(this.tileF(sx, sy));
      },
      onPointerLeave: () => {
        this.pointer = null;
        this.tools.pointerMoved(null);
      },
      onKey: (code) => this.onKey(code),
    });

    app.renderer.on('resize', this.onResize);
    app.ticker.add(this.onTick);
  }

  /** Odłącza grę od aplikacji (przed wczytaniem innego stanu). */
  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.app.renderer.off('resize', this.onResize);
    this.input.destroy();
    this.app.stage.removeChild(this.world);
    this.world.destroy({ children: true });
  }

  get state(): GameState {
    return this.sim.state;
  }

  /** Ruch aut i autobusów w miastach (dekoracja, można wyłączyć na słabszym komputerze). */
  set trafficEnabled(on: boolean) {
    this.traffic.enabled = on;
  }

  setSpeed(speed: Speed): void {
    if (speed !== 0) this.lastSpeed = speed;
    this.loop.speed = speed;
  }

  command(cmd: Command): void {
    this.sim.enqueue(cmd);
  }

  openWindow(ref: WindowRef): void {
    hudStore.set({ window: ref, menuOpen: false });
  }

  closeWindow(): void {
    hudStore.set({ window: null, windowData: null });
    this.windowJson = '';
    if (this.tools.tool === 'orders') this.tools.setTool('cursor');
  }

  /** Włącza/wyłącza wskazywanie stacji do rozkładu pociągu. */
  pickOrders(trainId: number): void {
    const active = this.tools.tool === 'orders' && this.tools.ordersTrain === trainId;
    this.setTool(active ? 'cursor' : 'orders', trainId);
  }

  /** Kamera do zapisu gry. */
  get view(): ViewState {
    return { cx: this.camera.cx, cy: this.camera.cy, zoom: this.camera.zoom };
  }

  set view(v: ViewState) {
    this.camera.setZoom(v.zoom);
    this.camera.centerOn({ x: v.cx, y: v.cy });
  }

  /** Centruje kamerę na kafelku. */
  focusTile(x: number, y: number): void {
    this.camera.centerOn(tileCenter(x, y));
  }

  /** Centruje kamerę na pociągu (na torze). */
  focusTrain(trainId: number): void {
    const t = trainById(this.sim.state, trainId);
    const p = t && t.trail.length ? pointBehindHead(t, 0) : null;
    if (p) this.camera.centerOn(tileCenter(p.x - 0.5, p.y - 0.5));
  }

  /** Klik kursorem (bez przeciągania): otwiera okno pociągu albo zajezdni pod kursorem. */
  private onClick(sx: number, sy: number): void {
    if (this.tools.tool !== 'cursor') return;
    const w = this.camera.screenToWorld(sx, sy);
    const trainId = this.trains.hitTest(w.x, w.y, this.camera.zoom);
    if (trainId !== null) return this.openWindow({ kind: 'train', trainId });
    const f = this.tileF(sx, sy);
    const x = Math.floor(f.x);
    const y = Math.floor(f.y);
    const depot = depotAt(this.sim.state, x, y);
    if (depot) return this.openWindow({ kind: 'depot', depotId: depot.id });
    const station = stationAt(this.sim.state, x, y);
    if (station) return this.openWindow({ kind: 'station', stationId: station.id });
    const industry = industryAt(this.sim.state, x, y);
    if (industry) return this.openWindow({ kind: 'industry', industryId: industry.id });
    const town = townNear(this.sim.state, x, y);
    if (town) return this.openWindow({ kind: 'town', townId: town.id });
  }

  get toolController(): Tools {
    return this.tools;
  }

  setTool(tool: Tool, ordersTrain: number | null = null): void {
    this.input.cancelToolDrag();
    this.tools.setTool(tool, ordersTrain);
  }

  private onKey(code: string): void {
    if (code === 'Space') this.setSpeed(this.loop.speed === 0 ? this.lastSpeed : 0);
    const speed = KEY_SPEEDS[code];
    if (speed !== undefined && SPEEDS.includes(speed)) this.setSpeed(speed);
    if (code === 'Escape' && this.tools.cancel()) {
      this.input.cancelToolDrag();
      return;
    }
    if (code === 'Escape' && this.tools.tool === 'orders') {
      this.setTool('cursor');
      return;
    }
    if (code === 'Escape' && hudStore.get().window) {
      this.closeWindow();
      return;
    }
    const tool = KEY_TOOLS[code];
    // Semafory tylko w trybie Ekspert.
    if (tool && (tool !== 'signal' || this.sim.state.signalMode === 'manual')) this.setTool(tool);
    if (code === 'KeyV') this.signals.showReservations = !this.signals.showReservations;
    if (code === 'KeyR') this.tools.rotate();
    if (code === 'KeyG') {
      this.graphDebug.visible = !this.graphDebug.visible;
      if (this.graphDebug.visible) this.graphDebug.draw(this.sim.graph);
    }
  }

  private frame(deltaMs: number): void {
    const cameraBefore = `${this.camera.cx},${this.camera.cy},${this.camera.zoom}`;
    this.input.update(deltaMs);
    this.loop.advance(deltaMs);

    const events = this.sim.drainEvents();
    for (const ev of events) {
      if (ev.type === 'tileChanged') {
        // Drogi łączą się z sąsiadami – odświeżamy też sąsiednie kafelki (mogą być w innym kawałku).
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) this.mapRenderer.markTileDirty(ev.x + dx, ev.y + dy);
      }
      else if (ev.type === 'stationsChanged') this.labels.rebuild(this.sim.state);
      else if (ev.type === 'bridgesChanged') this.bridges.draw(this.sim.state);
      else if (ev.type === 'tunnelsChanged') this.tunnels.draw(this.sim.state);
      else if (ev.type === 'income') this.floaters.spawn(`+${formatMoney(ev.amount)}`, ev.x, ev.y);
      else if (ev.type === 'commandFailed') {
        showMessage(FAIL_MESSAGES[ev.reason]);
      }
    }
    if (events.length) {
      this.tools.invalidate();
      if (this.graphDebug.visible) this.graphDebug.draw(this.sim.graph);
    }

    this.camera.apply();
    this.labels.update(this.camera.zoom, this.camera.viewRect());
    this.floaters.update(deltaMs, this.camera.zoom);
    // Kamera ruszyła (klawisze/zoom), a kursor stoi – zmienia się kafelek pod nim.
    if (this.pointer && cameraBefore !== `${this.camera.cx},${this.camera.cy},${this.camera.zoom}`) {
      this.tools.pointerMoved(this.tileF(this.pointer.x, this.pointer.y));
    }
    this.mapRenderer.cull(this.camera.viewRect());
    this.industries.cull(this.camera.viewRect());
    // Ruch uliczny w tempie gry (stoi w pauzie).
    const gameSeconds = (Math.min(deltaMs, 250) * this.loop.speed) / 1000;
    this.traffic.update(this.sim.state, deltaMs, gameSeconds, this.camera.viewRect(), this.camera.zoom);
    const win = hudStore.get().window;
    this.signals.draw(this.sim.state);
    this.trains.draw(this.sim.state, this.loop.alpha, win?.kind === 'train' ? win.trainId : null);
    if (this.tools.tool === 'signal' && this.sim.state.signalMode !== 'manual') this.setTool('cursor');
    this.tools.update();
    this.updateWindow();
    this.updateHud();
  }

  /** Dane otwartego okna; do UI trafiają tylko przy zmianie. */
  private updateWindow(): void {
    const ref = hudStore.get().window;
    if (!ref) return;
    const data = buildWindowData(this.sim, ref, this.tools.tool === 'orders' ? this.tools.ordersTrain : null);
    if (!data) return this.closeWindow();
    const json = JSON.stringify(data);
    if (json !== this.windowJson) {
      this.windowJson = json;
      hudStore.set({ windowData: data });
    }
  }

  /** Punkt ekranu -> ułamkowe współrzędne kafelka. */
  private tileF(sx: number, sy: number): Point {
    const w = this.camera.screenToWorld(sx, sy);
    return pickTile(w.x, w.y, MAX_HEIGHT);
  }

  /** Ten sam obiekt, dopóki nic się nie zmieniło (UI nie przerysowuje się co klatkę). */
  private toolOptions(prev: HudState['toolOptions']): HudState['toolOptions'] {
    const t = this.tools;
    return prev.depotSide === t.depotSide &&
      prev.depotAuto === t.depotAuto &&
      prev.stationAxis === t.stationAxis &&
      prev.signalKind === t.signalKind &&
      prev.trackMode === t.trackMode &&
      prev.terrainMode === t.terrainMode
      ? prev
      : {
          depotSide: t.depotSide,
          depotAuto: t.depotAuto,
          stationAxis: t.stationAxis,
          signalKind: t.signalKind,
          trackMode: t.trackMode,
          terrainMode: t.terrainMode,
        };
  }

  private updateHud(): void {
    const { state } = this.sim;
    const d = tickToDate(state.tick);
    const f = this.pointer ? this.tileF(this.pointer.x, this.pointer.y) : null;
    const tile = f && inBounds(state.map, Math.floor(f.x), Math.floor(f.y)) ? { x: Math.floor(f.x), y: Math.floor(f.y) } : null;
    // Nowy obiekt tylko przy zmianie – inaczej UI przerysowywałoby się co klatkę.
    const prev = hudStore.get();
    const terrain = tile ? getTerrain(state.map, tile.x, tile.y) : null;
    const station = tile ? objectName(state, tile.x, tile.y) : null;
    const h = prev.hover;
    const hoverChanged =
      !h !== !tile ||
      (h && tile && (h.x !== tile.x || h.y !== tile.y || h.terrain !== terrain || h.station !== station));
    const label = this.tools.label && this.pointer ? { ...this.tools.label, ...this.pointer } : null;
    const pl = prev.cursorLabel;
    const labelChanged =
      !pl !== !label || (pl && label && (pl.text !== label.text || pl.ok !== label.ok || pl.x !== label.x || pl.y !== label.y));
    hudStore.set({
      date: `${pad(d.day)}.${pad(d.month)}.${d.year}`,
      money: state.money,
      speed: this.loop.speed,
      tool: this.tools.tool,
      signalMode: state.signalMode,
      toolOptions: this.toolOptions(prev.toolOptions),
      fps: Math.round(this.app.ticker.FPS),
      zoom: this.camera.zoom,
      graphInfo: this.graphDebug.visible ? `${this.sim.graph.nodes.length} węzłów · ${this.sim.graph.edges.length} krawędzi` : null,
      hover: hoverChanged ? (tile && terrain !== null ? { ...tile, terrain, station } : null) : h,
      cursorLabel: labelChanged ? label : pl,
    });
  }
}

/** Nazwa obiektu na kafelku do paska stanu (stacja, zakład, dom w mieście). */
function objectName(state: GameState, x: number, y: number): string | null {
  const st = stationAt(state, x, y);
  if (st) return st.name;
  const ind = industryAt(state, x, y);
  if (ind) return ind.name;
  const town = townAt(state, x, y);
  return town ? `Dom · ${town.name}` : null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
