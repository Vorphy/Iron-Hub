import { type Application, Container } from 'pixi.js';
import { researchDef, researchLevel } from './sim/research';
import { Input } from './input/input';
import { GameLoop, SPEEDS, type Speed } from './loop';
import { Camera } from './render/camera';
import { GraphDebug } from './render/graphDebug';
import { pickFlat, pickTile, setHeightProvider, tileCenter, type Point } from './render/iso';
import { METRO_LEVEL } from './sim/track/metro';
import { heightAt, MAX_HEIGHT } from './sim/world/height';
import { MapRenderer } from './render/mapRenderer';
import { Overlay } from './render/overlay';
import { BridgeRenderer } from './render/bridges';
import { TunnelRenderer } from './render/tunnels';
import { IndustryRenderer } from './render/buildings';
import { setGfxYear } from './render/gfx/tiles';
import { UndergroundRenderer } from './render/underground';
import { buildingsHidden, setBuildingsHidden } from './render/visibility';
import { FloatingTexts } from './render/floatingText';
import { DistrictTint } from './render/districtTint';
import { MapLabels } from './render/mapLabels';
import { SignalRenderer } from './render/signals';
import { TrafficRenderer } from './render/traffic';
import { Minimap, minimapToWorld } from './render/minimap';
import { tutorialProgress } from './tutorial';
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
import { gameDate } from './sim/time';
import { engineDef, TRACTION_NAMES } from './sim/trains/vehicles';
import { getTerrain, inBounds } from './sim/world/map';
import { FAIL_MESSAGES, formatMoney, Tools, type Tool } from './tools';
import { hudStore, showMessage, type HudState, type WindowRef } from './ui/hudStore';
import { buildWindowData } from './ui/windowData';

/** Co ile ms przeliczać dane otwartego okna (zamiast w każdej klatce). */
const WINDOW_REFRESH_MS = 200;
const KEY_SPEEDS: Record<string, Speed> = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 };
const KEY_TOOLS: Record<string, Tool> = {
  Escape: 'cursor',
  KeyT: 'track',
  KeyP: 'station',
  KeyZ: 'depot',
  KeyB: 'signal',
  KeyE: 'catenary',
  KeyL: 'terrain',
  KeyM: 'bridge',
  KeyN: 'tunnel',
  KeyJ: 'ramp',
  KeyX: 'bulldozer',
  Delete: 'bulldozer',
};

/** Spina symulację z prezentacją: pętla, renderer, wejście, narzędzia, HUD. */
export class Game {
  readonly sim: Simulation;
  readonly loop: GameLoop;
  private readonly camera: Camera;
  private readonly mapRenderer: MapRenderer;
  /** Widok poziomu −1 (metro). */
  private readonly underground: UndergroundRenderer;
  private readonly overlay = new Overlay();
  private readonly graphDebug = new GraphDebug();
  private readonly labels = new MapLabels();
  private readonly districtTint = new DistrictTint((x, y) => this.mapRenderer.markTileDirty(x, y));
  private readonly industries = new IndustryRenderer();
  private readonly bridges = new BridgeRenderer();
  private readonly tunnels = new TunnelRenderer();
  private readonly floaters = new FloatingTexts();
  private readonly trains = new TrainRenderer();
  private readonly signals = new SignalRenderer();
  private readonly traffic = new TrafficRenderer();
  private minimap: Minimap | null = null;
  private minimapDirty = true;
  private minimapSince = 0;
  private tutorialSince = 0;
  private tutorialDone: boolean[] = [];
  private readonly tools: Tools;
  private readonly input: Input;
  private pointer: Point | null = null;
  private lastSpeed: Speed = 1;
  private windowJson = '';
  /** Okno odświeżane co `WINDOW_REFRESH_MS`, od razu po otwarciu innego okna i po komendzie gracza. */
  private windowSince = 0;
  private windowRef: WindowRef | null = null;
  private windowCommands = 0;
  private readonly world = new Container();
  private readonly onResize = (w: number, h: number) => this.camera.resize(w, h);
  private readonly onTick = (ticker: { deltaMS: number }) => this.frame(ticker.deltaMS);
  /** Ctrl / Shift – modyfikator narzędzi (np. osobna stacja zamiast rozbudowy). */
  private readonly onModifier = (e: KeyboardEvent | PointerEvent) => this.tools.setModifier(e.ctrlKey || e.shiftKey);

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
    this.underground = new UndergroundRenderer(state.map.width, state.map.height);
    this.mapRenderer = new MapRenderer(
      app.renderer,
      state.map,
      () => this.sim.state.depots,
      () => this.sim.state.bridges,
      () => this.sim.state.tunnels,
      () => this.sim.state.stations,
      () => this.sim.state.industries,
    );
    this.mapRenderer.tileTint = (i) => this.districtTint.tileColor(i);
    world.addChild(
      this.mapRenderer.container,
      this.traffic.gfx,
      this.industries.gfx,
      this.bridges.gfx,
      this.tunnels.gfx,
      this.graphDebug.gfx,
      this.underground.container,
      this.overlay.container,
      this.signals.gfx,
      this.trains.gfx,
      this.labels.container,
      this.floaters.container,
    );
    this.loop.onBeforeStep = () => this.trains.capture(this.sim.state);
    this.labels.rebuild(state);
    // Kolory dzielnic po wczytaniu i w nowej grze wyłączone (🏘 / I włącza).
    hudStore.set({ districtsShown: false });
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
    window.addEventListener('keydown', this.onModifier);
    window.addEventListener('keyup', this.onModifier);
    window.addEventListener('pointermove', this.onModifier);
  }

  /** Odłącza grę od aplikacji (przed wczytaniem innego stanu). */
  destroy(): void {
    this.app.ticker.remove(this.onTick);
    window.removeEventListener('keydown', this.onModifier);
    window.removeEventListener('keyup', this.onModifier);
    window.removeEventListener('pointermove', this.onModifier);
    this.app.renderer.off('resize', this.onResize);
    this.input.destroy();
    this.app.stage.removeChild(this.world);
    this.world.destroy({ children: true, context: true });
  }

  get state(): GameState {
    return this.sim.state;
  }

  /** Ruch aut i autobusów w miastach (dekoracja, można wyłączyć na słabszym komputerze). */
  /** Przerysowuje całą mapę i obiekty (np. po przełączeniu grafiki). */
  redrawAll(): void {
    const state = this.sim.state;
    this.mapRenderer.markAllDirty();
    this.trains.invalidate();
    this.industries.draw(state.industries);
    this.bridges.draw(state);
    this.tunnels.draw(state);
  }

  /** Widok metra (poziom −1, Q): przyciemniona powierzchnia, tory i pociągi metra, budowa pod ziemią. */
  toggleUnderground(): void {
    const on = !this.underground.visible;
    this.underground.visible = on;
    this.underground.markDirty();
    this.tools.setUnder(on);
    hudStore.set({ underground: on });
  }

  /** Kolory dzielnic na mapie (I). */
  toggleDistricts(): void {
    const on = !this.districtTint.visible;
    this.districtTint.visible = on;
    hudStore.set({ districtsShown: on });
    showMessage(on ? 'Dzielnice zaznaczone kolorami (I – ukryj)' : 'Kolory dzielnic ukryte (I – pokaż)');
  }

  /** Widok bez budynków (U) – żeby zobaczyć tory zasłonięte domami i zakładami. */
  toggleBuildings(): void {
    const hidden = !buildingsHidden();
    setBuildingsHidden(hidden);
    hudStore.set({ buildingsHidden: hidden });
    this.redrawAll();
    showMessage(hidden ? 'Budynki ukryte (U – pokaż)' : 'Budynki widoczne');
  }

  set trafficEnabled(on: boolean) {
    this.traffic.enabled = on;
  }

  /** Płótno minimapy z interfejsu (null – minimapa zwinięta). */
  attachMinimap(canvas: HTMLCanvasElement | null): void {
    this.minimap = canvas ? new Minimap(canvas) : null;
    this.minimapDirty = true;
  }

  /** Klik na minimapie (ułamek płótna 0–1) – kamera w to miejsce (uwzględnia przybliżenie minimapy). */
  minimapGoto(fx: number, fy: number): void {
    if (!this.minimap) return;
    const m = this.minimap.toMap(fx, fy);
    this.camera.centerOn(minimapToWorld(this.sim.state, m.u, m.v));
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

  /** Otwiera okno, a gdy już jest otwarte – zamyka (przyciski i skróty). */
  toggleWindow(ref: WindowRef): void {
    if (hudStore.get().window?.kind === ref.kind) this.closeWindow();
    else this.openWindow(ref);
  }

  closeWindow(): void {
    hudStore.set({ window: null, windowData: null });
    this.windowJson = '';
    this.windowRef = null;
    if (this.tools.tool === 'orders') this.tools.setTool('cursor');
  }

  /** Włącza/wyłącza wskazywanie stacji do rozkładu pociągu. */
  pickOrders(trainId: number): void {
    const active = this.tools.tool === 'orders' && this.tools.ordersTrain === trainId;
    this.setTool(active ? 'cursor' : 'orders', trainId);
    this.windowRef = null;
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
    const p = t?.trail.length ? pointBehindHead(t, 0) : null;
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
    // W widoku metra najpierw stacja pod ziemią.
    const station = (this.underground.visible && stationAt(this.sim.state, x, y, true)) || stationAt(this.sim.state, x, y);
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
    const hud = hudStore.get();
    if (code === 'Escape' && hud.minimap.big) {
      hudStore.set({ minimap: { ...hud.minimap, big: false } });
      return;
    }
    if (code === 'Escape' && (hud.helpTopic || hud.changelogOpen)) {
      hudStore.set({ helpTopic: null, changelogOpen: false });
      return;
    }
    if (code === 'KeyK') {
      if (hud.window?.kind === 'trains') this.closeWindow();
      else this.openWindow({ kind: 'trains' });
      return;
    }
    if (code === 'KeyH') {
      hudStore.set({ helpTopic: hud.helpTopic ? null : 'start', changelogOpen: false });
      return;
    }
    if (code === 'Escape' && hudStore.get().window) {
      this.closeWindow();
      return;
    }
    const tool = KEY_TOOLS[code];
    // Semafory tylko w trybie Ekspert.
    if (tool && (tool !== 'signal' || this.sim.state.signalMode === 'manual')) this.setTool(tool);
    if (code === 'KeyU') this.toggleBuildings();
    if (code === 'KeyI') this.toggleDistricts();
    if (code === 'KeyY') this.toggleWindow({ kind: 'research' });
    if (code === 'KeyQ') this.toggleUnderground();
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
    let bridgesDirty = false;
    let labelsDirty = false;
    let tunnelsDirty = false;
    for (const ev of events) {
      if (ev.type === 'signalsChanged') this.signals.invalidate();
      if (ev.type === 'tileChanged') {
        this.districtTint.markDirty();
        this.trains.invalidate();
        this.signals.invalidate();
        // Drogi łączą się z sąsiadami – odświeżamy też sąsiednie kafelki (mogą być w innym kawałku).
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          this.mapRenderer.markTileDirty(ev.x + dx, ev.y + dy);
        this.minimapDirty = true;
        const { map } = this.sim.state;
        // Tor pod mostem zmienia wygląd mostu (filary); tor obok przyczółka lub portalu – styk rampy.
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const x = ev.x + dx;
          const y = ev.y + dy;
          if (!inBounds(map, x, y)) continue;
          if (map.bridge[y * map.width + x]) bridgesDirty = true;
          if (map.tunnel[y * map.width + x]) tunnelsDirty = true;
        }
      } else if (ev.type === 'stationsChanged' || ev.type === 'depotsChanged') this.labels.rebuild(this.sim.state);
      else if (ev.type === 'bridgesChanged') this.bridges.draw(this.sim.state);
      else if (ev.type === 'tunnelsChanged') this.tunnels.draw(this.sim.state);
      else if (ev.type === 'undergroundChanged') {
        this.underground.markDirty();
        this.minimapDirty = true;
      } else if (ev.type === 'income') this.floaters.spawn(`+${formatMoney(ev.amount)}`, ev.x, ev.y);
      else if (ev.type === 'metroDemand') {
        const town = this.sim.state.towns.find((t) => t.id === ev.townId);
        if (town)
          showMessage(`${town.name} domaga się metra! Bez stacji metra miasto przestanie rosnąć powyżej 10 000 mieszkańców.`);
      } else if (ev.type === 'districtsChanged') {
        labelsDirty = true;
        this.districtTint.markDirty();
      } else if (ev.type === 'districtFounded') {
        this.labels.rebuild(this.sim.state);
        this.districtTint.markDirty();
        const town = this.sim.state.towns.find((t) => t.id === ev.townId);
        if (town)
          showMessage(`${town.name} rośnie – powstaje nowa dzielnica ${town.name} – ${ev.district}.`, () => {
            const d = town.districts.find((dd) => dd.name === ev.district);
            if (d) this.focusTile(d.x, d.y);
            this.openWindow({ kind: 'town', townId: town.id });
          });
      } else if (ev.type === 'townsTouching') {
        const big = this.sim.state.towns.find((t) => t.id === ev.townId);
        const small = this.sim.state.towns.find((t) => t.id === ev.smallId);
        if (big && small)
          showMessage(`Miasto ${small.name} zrosło się z miastem ${big.name} – za rok stanie się jego dzielnicą.`, () => {
            this.focusTile(small.x, small.y);
            this.openWindow({ kind: 'town', townId: small.id });
          });
      } else if (ev.type === 'townAbsorbed') {
        this.labels.rebuild(this.sim.state);
        this.districtTint.markDirty();
        this.minimapDirty = true;
        const town = this.sim.state.towns.find((t) => t.id === ev.townId);
        if (town)
          showMessage(`Miasto ${ev.district} zrosło się z miastem ${town.name} i jest teraz jego dzielnicą.`, () => {
            const d = town.districts.find((dd) => dd.name === ev.district);
            if (d) this.focusTile(d.x, d.y);
            this.openWindow({ kind: 'town', townId: town.id });
          });
      } else if (ev.type === 'researchDone') {
        const def = researchDef(ev.id);
        if (def) showMessage(`Badanie zakończone: ${def.name} – poziom ${researchLevel(this.sim.state, ev.id)}`);
      } else if (ev.type === 'newEngines') {
        const names = ev.engines.map((id) => {
          const e = engineDef(id)!;
          return `${e.name} (${TRACTION_NAMES[e.traction]}, ${e.maxSpeed} km/h)`;
        });
        showMessage(`Nowa lokomotywa w zajezdniach: ${names.join(', ')}`);
      } else if (ev.type === 'unprofitableTrains') {
        const names = ev.trainIds.map((id) => this.sim.state.trains.find((t) => t.id === id)?.name).filter(Boolean);
        const list = names.length > 4 ? `${names.slice(0, 4).join(', ')} i ${names.length - 4} innych` : names.join(', ');
        showMessage(`Strata w zeszłym roku: ${list} – lista pociągów (K)`);
      } else if (ev.type === 'trainLost') {
        const t = this.sim.state.trains.find((tr) => tr.id === ev.trainId);
        if (t)
          showMessage(`${t.name} nie może dojechać do celu – sprawdź tory, semafory jednokierunkowe i rozkład`, () => {
            this.focusTrain(t.id);
            this.openWindow({ kind: 'train', trainId: t.id });
          });
      } else if (ev.type === 'trainCloned') {
        showMessage(`Kopia gotowa: Pociąg ${ev.trainId} w zajezdni #${ev.depotId} – kliknij ▶ Wyjedź`);
      } else if (ev.type === 'engineReplaced') {
        const t = this.sim.state.trains.find((tr) => tr.id === ev.trainId);
        if (t) showMessage(`${t.name}: nowa lokomotywa ${engineDef(t.engine)!.name} – wraca na trasę`);
      } else if (ev.type === 'replaceFailed') {
        const t = this.sim.state.trains.find((tr) => tr.id === ev.trainId);
        const why = {
          noMoney: 'brak pieniędzy – jedzie dalej starą lokomotywą',
          noCatenary: 'zajezdnia bez sieci trakcyjnej – czeka w zajezdni',
          notAvailable: 'lokomotywa wycofana ze sprzedaży – jedzie dalej starą',
        }[ev.reason];
        if (t) showMessage(`${t.name}: wymiana nieudana (${why})`);
      } else if (ev.type === 'debtWarning') {
        showMessage(
          ev.monthsLeft === 1
            ? 'Ujemne saldo! Za miesiąc bankructwo – weź kredyt (Finanse) lub sprzedaj pociągi'
            : `Ujemne saldo! Bankructwo za ${ev.monthsLeft} mies. – weź kredyt (Finanse) lub sprzedaj pociągi`,
        );
      } else if (ev.type === 'commandFailed') {
        showMessage(FAIL_MESSAGES[ev.reason]);
      }
    }
    if (bridgesDirty) this.bridges.draw(this.sim.state);
    if (labelsDirty) this.labels.rebuild(this.sim.state);
    if (tunnelsDirty) this.tunnels.draw(this.sim.state);
    if (events.length) {
      this.tools.invalidate();
      if (this.graphDebug.visible) this.graphDebug.draw(this.sim.graph);
    }

    this.camera.apply();
    this.labels.update(this.camera.zoom, this.camera.viewRect());
    this.districtTint.update(this.sim.state);
    this.floaters.update(deltaMs, this.camera.zoom);
    // Kamera ruszyła (klawisze/zoom), a kursor stoi – zmienia się kafelek pod nim.
    if (this.pointer && cameraBefore !== `${this.camera.cx},${this.camera.cy},${this.camera.zoom}`) {
      this.tools.pointerMoved(this.tileF(this.pointer.x, this.pointer.y));
    }
    setGfxYear(gameDate(this.sim.state).year);
    this.mapRenderer.cull(this.camera.viewRect(), this.camera.zoom);
    this.industries.cull(this.camera.viewRect());
    // Ruch uliczny w tempie gry (stoi w pauzie).
    const gameSeconds = (Math.min(deltaMs, 250) * this.loop.speed) / 1000;
    const cars = this.traffic.update(this.sim.state, deltaMs, gameSeconds, this.camera.viewRect(), this.camera.zoom);
    this.underground.update(this.sim.state);
    const win = hudStore.get().window;
    this.signals.showDirections = this.tools.tool === 'signal';
    this.signals.draw(this.sim.state, this.underground.visible, this.camera.viewRect());
    const metro = this.underground.visible;
    this.trains.draw(
      this.sim.state,
      this.loop.alpha,
      win?.kind === 'train' ? win.trainId : null,
      metro ? [] : cars,
      metro,
      this.camera.viewRect(),
    );
    if (this.tools.tool === 'signal' && this.sim.state.signalMode !== 'manual') this.setTool('cursor');
    this.tools.update();
    this.updateMinimap(deltaMs);
    this.updateTutorial(deltaMs);
    this.updateWindow(deltaMs);
    this.updateHud();
  }

  /** Teren minimapy po zmianach mapy najwyżej co sekundę (i przy przesuwaniu przybliżonej), reszta co klatkę. */
  private updateMinimap(deltaMs: number): void {
    if (!this.minimap) return;
    this.minimapSince += deltaMs;
    const s = hudStore.get().minimap;
    const terrainChanged = this.minimapDirty && this.minimapSince >= 1000;
    const opts = { zoom: s.zoom, filters: s.filters, labels: s.big };
    if (this.minimap.update(this.sim.state, this.camera.viewRect(), opts, terrainChanged, performance.now()) && terrainChanged) {
      this.minimapDirty = false;
      this.minimapSince = 0;
    }
  }

  /** Postęp „Pierwszych kroków” – sprawdzany dwa razy na sekundę. */
  private updateTutorial(deltaMs: number): void {
    this.tutorialSince += deltaMs;
    if (this.tutorialSince < 500) return;
    this.tutorialSince = 0;
    const done = tutorialProgress(this.sim.state, this.sim.graph, this.tutorialDone);
    if (done.join() !== this.tutorialDone.join()) {
      this.tutorialDone = done;
      hudStore.set({ tutorialSteps: done });
    }
  }

  /** Dane otwartego okna (kilka razy na sekundę zamiast co klatkę); do UI trafiają tylko przy zmianie. */
  private updateWindow(deltaMs: number): void {
    const ref = hudStore.get().window;
    if (!ref) return;
    this.windowSince += deltaMs;
    const fresh = ref !== this.windowRef || this.sim.commandsDone !== this.windowCommands;
    if (!fresh && this.windowSince < WINDOW_REFRESH_MS) return;
    this.windowSince = 0;
    this.windowRef = ref;
    this.windowCommands = this.sim.commandsDone;
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
    // W widoku metra – płaska siatka na poziomie metra.
    if (this.underground.visible) return pickFlat(w.x, w.y, METRO_LEVEL);
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
      prev.catenaryMode === t.catenaryMode &&
      prev.stationSeparate === t.stationSeparate &&
      prev.stationKind === t.stationKind &&
      prev.terrainMode === t.terrainMode
      ? prev
      : {
          depotSide: t.depotSide,
          depotAuto: t.depotAuto,
          stationAxis: t.stationAxis,
          signalKind: t.signalKind,
          trackMode: t.trackMode,
          catenaryMode: t.catenaryMode,
          stationSeparate: t.stationSeparate,
          stationKind: t.stationKind,
          terrainMode: t.terrainMode,
        };
  }

  private updateHud(): void {
    const { state } = this.sim;
    const d = gameDate(state);
    const f = this.pointer ? this.tileF(this.pointer.x, this.pointer.y) : null;
    const tile = f && inBounds(state.map, Math.floor(f.x), Math.floor(f.y)) ? { x: Math.floor(f.x), y: Math.floor(f.y) } : null;
    // Nowy obiekt tylko przy zmianie – inaczej UI przerysowywałoby się co klatkę.
    const prev = hudStore.get();
    const terrain = tile ? getTerrain(state.map, tile.x, tile.y) : null;
    const station = tile ? objectName(state, tile.x, tile.y, this.underground.visible) : null;
    const h = prev.hover;
    const hoverChanged =
      !h !== !tile || (h && tile && (h.x !== tile.x || h.y !== tile.y || h.terrain !== terrain || h.station !== station));
    const label = this.tools.label && this.pointer ? { ...this.tools.label, ...this.pointer } : null;
    const pl = prev.cursorLabel;
    const labelChanged =
      !pl !== !label || (pl && label && (pl.text !== label.text || pl.ok !== label.ok || pl.x !== label.x || pl.y !== label.y));
    hudStore.set({
      date: `${pad(d.day)}.${pad(d.month)}.${d.year}`,
      money: state.money,
      company: state.companyName,
      speed: this.loop.speed,
      tool: this.tools.tool,
      signalMode: state.signalMode,
      toolOptions: this.toolOptions(prev.toolOptions),
      fps: Math.round(this.app.ticker.FPS),
      zoom: this.camera.zoom,
      graphInfo: this.graphDebug.visible
        ? `${this.sim.graph.nodes.length} węzłów · ${this.sim.graph.edges.length} krawędzi`
        : null,
      hover: hoverChanged ? (tile && terrain !== null ? { ...tile, terrain, station } : null) : h,
      cursorLabel: labelChanged ? label : pl,
      bankrupt: state.finances.bankrupt,
    });
  }
}

/** Nazwa obiektu na kafelku do paska stanu (stacja, zakład, dom w mieście). */
function objectName(state: GameState, x: number, y: number, under: boolean): string | null {
  const st = (under && stationAt(state, x, y, true)) || stationAt(state, x, y);
  if (st) return st.name;
  const ind = industryAt(state, x, y);
  if (ind) return ind.name;
  const town = townAt(state, x, y);
  return town ? `Dom · ${town.name}` : null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
