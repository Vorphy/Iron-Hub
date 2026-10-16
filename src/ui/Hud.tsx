import { useEffect, useState } from 'preact/hooks';
import { SPEEDS, type Speed } from '../loop';
import { Terrain } from '../sim/world/map';
import { formatMoney, type Tool } from '../tools';
import { hudStore, type HudActions, type HudState } from './hudStore';
import { useStore } from './store';

const TERRAIN_NAMES: Record<Terrain, string> = {
  [Terrain.Grass]: 'Trawa',
  [Terrain.Water]: 'Woda',
  [Terrain.Rough]: 'Nieużytek',
};

const TOOLS: { tool: Tool; icon: string; name: string; key: string }[] = [
  { tool: 'cursor', icon: '↖', name: 'Kursor', key: 'Esc' },
  { tool: 'track', icon: '═', name: 'Tory', key: 'T' },
  { tool: 'bulldozer', icon: '✖', name: 'Rozbiórka', key: 'X' },
];

const TOOL_HELP: Record<Tool, string> = {
  cursor: 'Przeciąganie / strzałki / WASD – przesuwanie · kółko – zoom · spacja – pauza · 1–4 – prędkość · G – podgląd grafu torów',
  track:
    'Przeciągnij, aby położyć tor: wzdłuż osi lub ukośnie. Pozycja kursora w kafelku wybiera łuk. Prawy przycisk – przesuwanie mapy · Esc – anuluj',
  bulldozer: 'Klik – usuń tory z kafelka lub oczyść nieużytek · przeciągnięcie – rozbierz odcinek toru (zwrot 25%)',
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
        <span class="money">{formatMoney(s.money)}</span>
        <span class="sep" />
        <span class="buttons">
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

      <div class="panel toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            class={t.tool === s.tool ? 'active' : ''}
            title={`${t.name} (${t.key})`}
            onClick={() => actions.setTool(t.tool)}
          >
            <span class="icon">{t.icon}</span>
            <span class="name">{t.name}</span>
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>

      <div class="panel statusbar">
        <span>
          {s.hover ? `Kafelek (${s.hover.x}, ${s.hover.y}) · ${TERRAIN_NAMES[s.hover.terrain]}` : '—'}
        </span>
        {s.graphInfo && (
          <>
            <span class="sep" />
            <span class="graph-info">Graf: {s.graphInfo}</span>
          </>
        )}
        <span class="sep" />
        <span>zoom {s.zoom}×</span>
        <span class="sep" />
        <span>{s.fps} FPS</span>
      </div>

      <div class="panel help">{TOOL_HELP[s.tool]}</div>

      <CursorLabel label={s.cursorLabel} />
      <Toast message={s.message} />
    </>
  );
}

function CursorLabel({ label }: { label: HudState['cursorLabel'] }) {
  if (!label) return null;
  return (
    <div class={`cursor-label ${label.ok ? '' : 'bad'}`} style={{ left: `${label.x + 16}px`, top: `${label.y + 18}px` }}>
      {label.text}
    </div>
  );
}

function Toast({ message }: { message: HudState['message'] }) {
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
