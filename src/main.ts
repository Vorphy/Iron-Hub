import { Application } from 'pixi.js';
import { h, render } from 'preact';
import { Game } from './game';
import { createGame } from './sim/state';
import { Hud } from './ui/Hud';

const MAP_SIZE = 128;

async function start(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#1b1f24',
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.getElementById('game')!.appendChild(app.canvas);

  const seed = Number(new URLSearchParams(location.search).get('seed')) || 1;
  const game = new Game(app, createGame({ width: MAP_SIZE, height: MAP_SIZE, seed }));

  render(h(Hud, { actions: { setSpeed: (s) => game.setSpeed(s) } }), document.getElementById('ui')!);
}

void start();
