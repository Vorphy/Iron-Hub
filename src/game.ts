import { Application, Container } from 'pixi.js';
import { Input } from './input/input';
import { GameLoop, SPEEDS, type Speed } from './loop';
import { Camera } from './render/camera';
import { GraphDebug } from './render/graphDebug';
import { tileCenter, worldToTileF, type Point } from './render/iso';
import { MapRenderer } from './render/mapRenderer';
import { Overlay } from './render/overlay';
import { Simulation } from './sim/simulation';
import type { GameState } from './sim/state';
import { tickToDate } from './sim/time';
import { getTerrain, inBounds } from './sim/world/map';
import { FAIL_MESSAGES, Tools, type Tool } from './tools';
import { hudStore } from './ui/hudStore';

const KEY_SPEEDS: Record<string, Speed> = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 };
const KEY_TOOLS: Record<string, Tool> = { Escape: 'cursor', KeyT: 'track', KeyX: 'bulldozer', Delete: 'bulldozer' };

/** Spina symulację z prezentacją: pętla, renderer, wejście, narzędzia, HUD. */
export class Game {
  readonly sim: Simulation;
  readonly loop: GameLoop;
  private readonly camera: Camera;
  private readonly mapRenderer: MapRenderer;
  private readonly overlay = new Overlay();
  private readonly graphDebug = new GraphDebug();
  private readonly tools: Tools;
  private readonly input: Input;
  private pointer: Point | null = null;
  private lastSpeed: Speed = 1;
  private messageId = 0;

  constructor(
    private readonly app: Application,
    state: GameState,
  ) {
    this.sim = new Simulation(state);
    this.loop = new GameLoop(this.sim);
    this.tools = new Tools(this.sim, this.overlay);

    const world = new Container();
    this.mapRenderer = new MapRenderer(state.map);
    world.addChild(this.mapRenderer.container, this.graphDebug.gfx, this.overlay.container);
    app.stage.addChild(world);

    this.camera = new Camera(world, state.map.width, state.map.height);
    this.camera.resize(app.screen.width, app.screen.height);
    this.camera.centerOn(tileCenter(state.map.width / 2, state.map.height / 2));

    this.input = new Input(app.canvas, this.camera, {
      onPrimaryDown: (sx, sy) => this.tools.primaryDown(this.tileF(sx, sy)),
      onPrimaryDrag: (sx, sy) => this.tools.pointerMoved(this.tileF(sx, sy)),
      onPrimaryUp: (sx, sy) => this.tools.primaryUp(this.tileF(sx, sy)),
      onClick: () => {},
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

    app.renderer.on('resize', (w: number, h: number) => this.camera.resize(w, h));
    app.ticker.add((ticker) => this.frame(ticker.deltaMS));
  }

  setSpeed(speed: Speed): void {
    if (speed !== 0) this.lastSpeed = speed;
    this.loop.speed = speed;
  }

  setTool(tool: Tool): void {
    this.input.cancelToolDrag();
    this.tools.setTool(tool);
  }

  private onKey(code: string): void {
    if (code === 'Space') this.setSpeed(this.loop.speed === 0 ? this.lastSpeed : 0);
    const speed = KEY_SPEEDS[code];
    if (speed !== undefined && SPEEDS.includes(speed)) this.setSpeed(speed);
    if (code === 'Escape' && this.tools.cancel()) {
      this.input.cancelToolDrag();
      return;
    }
    const tool = KEY_TOOLS[code];
    if (tool) this.setTool(tool);
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
      if (ev.type === 'tileChanged') this.mapRenderer.markTileDirty(ev.x, ev.y);
      else if (ev.type === 'commandFailed') {
        hudStore.set({ message: { id: ++this.messageId, text: FAIL_MESSAGES[ev.reason] } });
      }
    }
    if (events.length) {
      this.tools.invalidate();
      if (this.graphDebug.visible) this.graphDebug.draw(this.sim.graph);
    }

    this.camera.apply();
    // Kamera ruszyła (klawisze/zoom), a kursor stoi – zmienia się kafelek pod nim.
    if (this.pointer && cameraBefore !== `${this.camera.cx},${this.camera.cy},${this.camera.zoom}`) {
      this.tools.pointerMoved(this.tileF(this.pointer.x, this.pointer.y));
    }
    this.mapRenderer.cull(this.camera.viewRect());
    this.tools.update();
    this.updateHud();
  }

  /** Punkt ekranu -> ułamkowe współrzędne kafelka. */
  private tileF(sx: number, sy: number): Point {
    const w = this.camera.screenToWorld(sx, sy);
    return worldToTileF(w.x, w.y);
  }

  private updateHud(): void {
    const { state } = this.sim;
    const d = tickToDate(state.tick);
    const f = this.pointer ? this.tileF(this.pointer.x, this.pointer.y) : null;
    const tile = f && inBounds(state.map, Math.floor(f.x), Math.floor(f.y)) ? { x: Math.floor(f.x), y: Math.floor(f.y) } : null;
    // Nowy obiekt tylko przy zmianie – inaczej UI przerysowywałoby się co klatkę.
    const prev = hudStore.get();
    const terrain = tile ? getTerrain(state.map, tile.x, tile.y) : null;
    const h = prev.hover;
    const hoverChanged = !h !== !tile || (h && tile && (h.x !== tile.x || h.y !== tile.y || h.terrain !== terrain));
    const label = this.tools.label && this.pointer ? { ...this.tools.label, ...this.pointer } : null;
    const pl = prev.cursorLabel;
    const labelChanged =
      !pl !== !label || (pl && label && (pl.text !== label.text || pl.ok !== label.ok || pl.x !== label.x || pl.y !== label.y));
    hudStore.set({
      date: `${pad(d.day)}.${pad(d.month)}.${d.year}`,
      money: state.money,
      speed: this.loop.speed,
      tool: this.tools.tool,
      fps: Math.round(this.app.ticker.FPS),
      zoom: this.camera.zoom,
      graphInfo: this.graphDebug.visible ? `${this.sim.graph.nodes.length} węzłów · ${this.sim.graph.edges.length} krawędzi` : null,
      hover: hoverChanged ? (tile && terrain !== null ? { ...tile, terrain } : null) : h,
      cursorLabel: labelChanged ? label : pl,
    });
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
