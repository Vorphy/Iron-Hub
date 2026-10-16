import { useEffect, useState } from 'preact/hooks';
import { SPEEDS, type Speed } from '../loop';
import { Side } from '../sim/track/track';
import { Terrain } from '../sim/world/map';
import { formatMoney, type Tool } from '../tools';
import { DepotWindow } from './DepotWindow';
import { TrainWindow } from './TrainWindow';
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
  { tool: 'station', icon: '▤', name: 'Stacja', key: 'P' },
  { tool: 'depot', icon: '⌂', name: 'Zajezdnia', key: 'Z' },
  { tool: 'bulldozer', icon: '✖', name: 'Rozbiórka', key: 'X' },
];

const TOOL_HELP: Record<Tool, string> = {
  cursor: 'Klik na pociąg lub zajezdnię – okno · przeciąganie / strzałki / WASD – przesuwanie · kółko – zoom · spacja – pauza · 1–4 – prędkość · G – podgląd grafu torów',
  track:
    'Przeciągnij, aby położyć tor: wzdłuż osi lub ukośnie. Pozycja kursora w kafelku wybiera łuk. Prawy przycisk – przesuwanie mapy · Esc – anuluj',
  station:
    'Przeciągnij prostokąt: dłuższy bok to długość peronu, krótszy – liczba torów. R – obrót przy kwadracie. Niebieskie pole to zasięg stacji',
  depot:
    'Klik stawia zajezdnię (1000 zł). Kierunek wjazdu wybierz w panelu obok (lub R); Auto – w stronę sąsiedniego toru',
  orders: 'Klikaj stacje, aby dopisać je do rozkładu pociągu · Esc – koniec',
  bulldozer: 'Klik – usuń zajezdnię, kafelek stacji, tory z kafelka lub oczyść nieużytek · przeciągnięcie – rozbierz odcinek toru (zwrot 25%)',
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
        <span class="sep" />
        <span class="buttons">
          <button class={s.menuOpen ? 'active' : ''} title="Menu gry" onClick={actions.toggleMenu}>
            ☰ Menu
          </button>
        </span>
      </div>

      {s.menuOpen && <Menu actions={actions} saves={s.saves} />}
      {s.windowData?.kind === 'depot' && <DepotWindow data={s.windowData} money={s.money} actions={actions} />}
      {s.windowData?.kind === 'train' && <TrainWindow data={s.windowData} actions={actions} />}

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

      <ToolOptions tool={s.tool} options={s.toolOptions} actions={actions} />

      <div class="panel statusbar">
        <span>
          {s.hover
            ? `Kafelek (${s.hover.x}, ${s.hover.y}) · ${s.hover.station ?? TERRAIN_NAMES[s.hover.terrain]}`
            : '—'}
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

// Kierunki na ekranie (rzut izometryczny): NE – prawo-góra, SE – prawo-dół, SW – lewo-dół, NW – lewo-góra.
const DEPOT_DIRS: { side: Side; icon: string; name: string }[] = [
  { side: Side.NW, icon: '↖', name: 'lewo-góra' },
  { side: Side.NE, icon: '↗', name: 'prawo-góra' },
  { side: Side.SW, icon: '↙', name: 'lewo-dół' },
  { side: Side.SE, icon: '↘', name: 'prawo-dół' },
];

/** Panel opcji przy pasku narzędzi: kierunek wjazdu zajezdni, oś peronów. */
function ToolOptions({ tool, options, actions }: { tool: Tool; options: HudState['toolOptions']; actions: HudActions }) {
  if (tool === 'depot') {
    return (
      <div class="panel tool-options">
        <div class="section-title">Wjazd</div>
        <div class="dir-grid">
          {DEPOT_DIRS.map((d) => (
            <button
              key={d.side}
              class={!options.depotAuto && options.depotSide === d.side ? 'active' : ''}
              title={`Wjazd od strony: ${d.name}`}
              onClick={() => actions.setDepotSide(d.side)}
            >
              {d.icon}
            </button>
          ))}
        </div>
        <button
          class={options.depotAuto ? 'active' : ''}
          title="Wjazd sam obraca się w stronę sąsiedniego toru"
          onClick={() => actions.setDepotSide('auto')}
        >
          Auto
        </button>
      </div>
    );
  }
  if (tool === 'station') {
    return (
      <div class="panel tool-options">
        <div class="section-title">Perony</div>
        <div class="dir-grid">
          <button class={options.stationAxis === 'y' ? 'active' : ''} title="Perony w osi ↙↗" onClick={() => actions.setStationAxis('y')}>
            ⟋
          </button>
          <button class={options.stationAxis === 'x' ? 'active' : ''} title="Perony w osi ↖↘" onClick={() => actions.setStationAxis('x')}>
            ⟍
          </button>
        </div>
        <div class="muted small">przy kwadracie</div>
      </div>
    );
  }
  return null;
}

function formatSaveDate(iso: string | null): string {
  if (!iso) return 'brak';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'brak' : d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

function Menu({ actions, saves }: { actions: HudActions; saves: HudState['saves'] }) {
  return (
    <div class="panel menu">
      <div class="menu-title">Gra</div>
      <button onClick={actions.quickSave}>Zapisz</button>
      <button onClick={actions.quickLoad} disabled={!saves.quick}>
        Wczytaj <small>{formatSaveDate(saves.quick)}</small>
      </button>
      <div class="menu-note">Autozapis co 30 s: {formatSaveDate(saves.auto)}</div>
      <div class="menu-title">Plik</div>
      <button onClick={actions.exportFile}>Eksportuj do pliku</button>
      <button onClick={actions.importFile}>Importuj z pliku</button>
      <div class="menu-title" />
      <button onClick={actions.newGame}>Nowa gra (losowa mapa)</button>
      <div class="menu-note">Zapisy w przeglądarce są widoczne tylko na tym urządzeniu i tej stronie.</div>
    </div>
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
