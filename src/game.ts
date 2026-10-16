import { Application, Container } from 'pixi.js';
import { Input } from './input/input';
import { GameLoop, SPEEDS, type Speed } from './loop';
import { Camera } from './render/camera';
import { tileCenter, worldToTile } from './render/iso';
import { MapRenderer } from './render/mapRenderer';
import { Overlay } from './render/overlay';
import type { FailReason } from './sim/commands';
import { Simulation } from './sim/simulation';
import type { GameState } from './sim/state';
import { tickToDate } from './sim/time';
import { getTerrain, inBounds } from './sim/world/map';
import { hudStore } from './ui/hudStore';

const FAIL_MESSAGES: Record<FailReason, string> = {
  outOfBounds: 'Poza mapą',
  notRough: 'Tu nie ma czego oczyszczać',
  noMoney: 'Brak pieniędzy',
};

const KEY_SPEEDS: Record<string, Speed> = { Digit1: 1, Digit2: 2, Digit3: 4, Digit4: 8 };

/** Spina symulację z prezentacją: pętla, renderer, wejście, HUD. */
export class Game {
  readonly sim: Simulation;
  readonly loop: GameLoop;
  private readonly camera: Camera;
  private readonly mapRenderer: MapRenderer;
  private readonly overlay = new Overlay();
  private readonly input: Input;
  private pointer: { x: number; y: number } | null = null;
  private lastSpeed: Speed = 1;
  private messageId = 0;

  constructor(
    private readonly app: Application,
    state: GameState,
  ) {
    this.sim = new Simulation(state);
    this.loop = new GameLoop(this.sim);

    const world = new Container();
    this.mapRenderer = new MapRenderer(state.map);
    world.addChild(this.mapRenderer.container, this.overlay.hover);
    app.stage.addChild(world);

    this.camera = new Camera(world, state.map.width, state.map.height);
    this.camera.resize(app.screen.width, app.screen.height);
    this.camera.centerOn(tileCenter(state.map.width / 2, state.map.height / 2));

    this.input = new Input(app.canvas, this.camera, {
      onClick: (sx, sy) => {
        const t = this.tileAt(sx, sy);
        if (t) this.sim.enqueue({ type: 'clearTile', x: t.x, y: t.y });
      },
      onPointerMove: (sx, sy) => (this.pointer = { x: sx, y: sy }),
      onPointerLeave: () => (this.pointer = null),
      onKey: (code) => this.onKey(code),
    });

    app.renderer.on('resize', (w: number, h: number) => this.camera.resize(w, h));
    app.ticker.add((ticker) => this.frame(ticker.deltaMS));
  }

  setSpeed(speed: Speed): void {
    if (speed !== 0) this.lastSpeed = speed;
    this.loop.speed = speed;
  }

  private onKey(code: string): void {
    if (code === 'Space') this.setSpeed(this.loop.speed === 0 ? this.lastSpeed : 0);
    const speed = KEY_SPEEDS[code];
    if (speed !== undefined && SPEEDS.includes(speed)) this.setSpeed(speed);
  }

  private frame(deltaMs: number): void {
    this.input.update(deltaMs);
    this.loop.advance(deltaMs);

    for (const ev of this.sim.drainEvents()) {
      if (ev.type === 'tileChanged') this.mapRenderer.markTileDirty(ev.x, ev.y);
      else if (ev.type === 'commandFailed') {
        hudStore.set({ message: { id: ++this.messageId, text: FAIL_MESSAGES[ev.reason] } });
      }
    }

    this.camera.apply();
    this.mapRenderer.cull(this.camera.viewRect());

    const hover = this.pointer ? this.tileAt(this.pointer.x, this.pointer.y) : null;
    this.overlay.setHover(hover);
    this.updateHud(hover);
  }

  private tileAt(sx: number, sy: number): { x: number; y: number } | null {
    const w = this.camera.screenToWorld(sx, sy);
    const t = worldToTile(w.x, w.y);
    return inBounds(this.sim.state.map, t.x, t.y) ? t : null;
  }

  private updateHud(hover: { x: number; y: number } | null): void {
    const { state } = this.sim;
    const d = tickToDate(state.tick);
    // Nowy obiekt tylko przy zmianie – inaczej UI przerysowywałoby się co klatkę.
    const prev = hudStore.get().hover;
    const terrain = hover ? getTerrain(state.map, hover.x, hover.y) : null;
    const hoverChanged = !prev !== !hover || (prev && hover && (prev.x !== hover.x || prev.y !== hover.y || prev.terrain !== terrain));
    hudStore.set({
      date: `${pad(d.day)}.${pad(d.month)}.${d.year}`,
      money: state.money,
      speed: this.loop.speed,
      fps: Math.round(this.app.ticker.FPS),
      zoom: this.camera.zoom,
      hover: hoverChanged ? (hover && terrain !== null ? { ...hover, terrain } : null) : prev,
    });
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
