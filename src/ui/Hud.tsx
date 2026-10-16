import { useEffect, useState } from 'preact/hooks';
import { SPEEDS, type Speed } from '../loop';
import { Terrain } from '../sim/world/map';
import { hudStore, type HudActions } from './hudStore';
import { useStore } from './store';

const TERRAIN_NAMES: Record<Terrain, string> = {
  [Terrain.Grass]: 'Trawa',
  [Terrain.Water]: 'Woda',
  [Terrain.Rough]: 'Nieużytek',
};

const MESSAGE_MS = 2500;

function speedLabel(s: Speed): string {
  return s === 0 ? '⏸' : `${s}×`;
}

export function Hud({ actions }: { actions: HudActions }) {
  const s = useStore(hudStore);

  return (
    <>
      <div class="panel topbar">
        <span class="title">IRON HUB</span>
        <span class="sep" />
        <span>{s.date}</span>
        <span class="sep" />
        <span class="money">{s.money.toLocaleString('pl-PL')} zł</span>
        <span class="sep" />
        <span class="speeds">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              class={sp === s.speed ? 'active' : ''}
              title={sp === 0 ? 'Pauza (spacja)' : `Prędkość ${sp}×`}
              onClick={() => actions.setSpeed(sp)}
            >
              {speedLabel(sp)}
            </button>
          ))}
        </span>
      </div>

      <div class="panel statusbar">
        <span>
          {s.hover ? `Kafelek (${s.hover.x}, ${s.hover.y}) · ${TERRAIN_NAMES[s.hover.terrain]}` : '—'}
        </span>
        <span class="sep" />
        <span>zoom {s.zoom}×</span>
        <span class="sep" />
        <span>{s.fps} FPS</span>
      </div>

      <div class="panel help">
        Przeciąganie / strzałki / WASD – przesuwanie · kółko – zoom · klik na nieużytek – oczyść (50 zł) · spacja –
        pauza · 1–4 – prędkość
      </div>

      <Toast message={s.message} />
    </>
  );
}

function Toast({ message }: { message: { id: number; text: string } | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), MESSAGE_MS);
    return () => clearTimeout(t);
  }, [message?.id]);
  if (!message || !visible) return null;
  return <div class="panel toast">{message.text}</div>;
}
