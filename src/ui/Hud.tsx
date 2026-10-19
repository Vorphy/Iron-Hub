import { useEffect, useState } from 'preact/hooks';
import { SPEEDS, type Speed } from '../loop';
import { Side } from '../sim/track/track';
import { Terrain } from '../sim/world/map';
import { formatMoney, type SignalKind, type Tool } from '../tools';
import { DepotWindow } from './DepotWindow';
import { NewGameDialog } from './NewGameDialog';
import { FinanceWindow, IndustryWindow, StationWindow, TownWindow } from './InfoWindows';
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
  { tool: 'signal', icon: '⊙', name: 'Semafor', key: 'B' },
  { tool: 'terrain', icon: '⛰', name: 'Teren', key: 'L' },
  { tool: 'bridge', icon: '⌒', name: 'Most', key: 'M' },
  { tool: 'tunnel', icon: '◠', name: 'Tunel', key: 'N' },
  { tool: 'bulldozer', icon: '✖', name: 'Rozbiórka', key: 'X' },
];

const TOOL_HELP: Record<Tool, string> = {
  cursor: 'Klik na pociąg, stację, zajezdnię, miasto lub zakład – okno · przeciąganie / strzałki / WASD – przesuwanie · kółko – zoom · spacja – pauza · 1–4 – prędkość · G – graf torów · V – rezerwacje torów',
  track:
    'Buduj: przeciągnij wzdłuż osi lub ukośnie; pozycja kursora w kafelku wybiera łuk. Usuń: klik – jeden element pod kursorem, przeciągnięcie – odcinek. Prawy przycisk – przesuwanie mapy · Esc – anuluj',
  station:
    'Przeciągnij prostokąt: dłuższy bok to długość peronu, krótszy – liczba torów. R – obrót przy kwadracie. Niebieskie pole to zasięg stacji',
  depot:
    'Klik stawia zajezdnię (1000 zł). Kierunek wjazdu wybierz w panelu obok (lub R); Auto – w stronę sąsiedniego toru',
  signal:
    'Klik na tor stawia semafor ścieżkowy (200 zł); kolejne kliknięcia zmieniają kierunek. Pociąg może stanąć tylko przed semaforem, na końcu peronu lub toru · V – podgląd rezerwacji',
  terrain:
    'Podnieś / Obniż: klik zmienia o poziom narożnik najbliższy kursorowi (sąsiedni teren dopasuje się sam). Wyrównaj: przeciągnij prostokąt – teren do wysokości punktu startowego. 30 zł za narożnik',
  bridge:
    'Przeciągnij od przyczółka do przyczółka (wzdłuż osi, max 14 kafelków). Przyczółki płaskie lub wznoszące się w stronę mostu, na tej samej wysokości; pod mostem teren co najmniej poziom niżej. 400 zł za kafelek',
  tunnel:
    'Klik na zbocze (w osi X lub Y) – tunel w głąb wzniesienia do zbocza po drugiej stronie na tej samej wysokości. Nad tunelem teren co najmniej poziom wyżej, max 20 kafelków, 600 zł za kafelek',
  orders: 'Klikaj stacje, aby dopisać je do rozkładu pociągu · Esc – koniec',
  bulldozer: 'Klik – usuń element toru pod kursorem, most (przyczółek), tunel (wejście), zajezdnię, kafelek stacji, dom lub oczyść nieużytek · przeciągnięcie – rozbierz odcinek toru (zwrot 25%)',
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
        <button class="money link" title="Finanse" onClick={actions.openFinance}>
          {formatMoney(s.money)}
        </button>
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

      {s.newGameOpen && <NewGameDialog actions={actions} canCancel={true} />}
      {s.menuOpen && <Menu actions={actions} saves={s.saves} signalMode={s.signalMode} traffic={s.traffic} />}
      {s.windowData?.kind === 'depot' && <DepotWindow data={s.windowData} money={s.money} actions={actions} />}
      {s.windowData?.kind === 'train' && <TrainWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'town' && <TownWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'station' && <StationWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'finance' && <FinanceWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'industry' && <IndustryWindow data={s.windowData} actions={actions} />}

      <div class="panel toolbar">
        {TOOLS.filter((t) => t.tool !== 'signal' || s.signalMode === 'manual').map((t) => (
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
  if (tool === 'terrain') {
    const modes: { mode: 'raise' | 'lower' | 'level'; label: string }[] = [
      { mode: 'raise', label: '▲ Podnieś' },
      { mode: 'lower', label: '▼ Obniż' },
      { mode: 'level', label: '▬ Wyrównaj' },
    ];
    return (
      <div class="panel tool-options">
        <div class="section-title">Teren</div>
        {modes.map((m) => (
          <button key={m.mode} class={options.terrainMode === m.mode ? 'active' : ''} onClick={() => actions.setTerrainMode(m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
    );
  }
  if (tool === 'track') {
    return (
      <div class="panel tool-options">
        <div class="section-title">Tory</div>
        <button class={options.trackMode === 'build' ? 'active' : ''} onClick={() => actions.setTrackMode('build')}>
          Buduj
        </button>
        <button
          class={options.trackMode === 'remove' ? 'active' : ''}
          title="Klik – usuwa jeden element toru pod kursorem; przeciągnięcie – odcinek"
          onClick={() => actions.setTrackMode('remove')}
        >
          Usuń
        </button>
      </div>
    );
  }
  if (tool === 'signal') {
    const kinds: { kind: SignalKind; label: string; title: string }[] = [
      { kind: 'path', label: 'Ścieżkowy', title: 'Przejezdny w obie strony; pociąg staje przed nim w ustawionym kierunku' },
      { kind: 'oneway', label: 'Jednokier.', title: 'Zabrania jazdy pod prąd' },
      { kind: 'remove', label: 'Usuń', title: 'Usuwa semafor (zwrot 25%)' },
    ];
    return (
      <div class="panel tool-options">
        <div class="section-title">Semafor</div>
        {kinds.map((k) => (
          <button
            key={k.kind}
            class={options.signalKind === k.kind ? 'active' : ''}
            title={k.title}
            onClick={() => actions.setSignalKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
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

function Menu({
  actions,
  saves,
  signalMode,
  traffic,
}: {
  actions: HudActions;
  saves: HudState['saves'];
  signalMode: HudState['signalMode'];
  traffic: boolean;
}) {
  return (
    <div class="panel menu">
      <div class="menu-title">Sygnalizacja</div>
      <div class="buttons">
        <button class={signalMode === 'auto' ? 'active' : ''} onClick={() => actions.setSignalMode('auto')}>
          Amator
        </button>
        <button class={signalMode === 'manual' ? 'active' : ''} onClick={() => actions.setSignalMode('manual')}>
          Ekspert
        </button>
      </div>
      <div class="menu-note">
        {signalMode === 'auto'
          ? 'Pociągi same trzymają odstęp i nie wjeżdżają na zajęte rozjazdy.'
          : 'Pociąg staje tylko przed semaforem, na końcu peronu lub toru. Semafory stawiasz sam (B).'}
      </div>
      <div class="menu-title">Widok</div>
      <button class={traffic ? 'active' : ''} onClick={actions.toggleTraffic} title="Auta i autobusy w miastach – tylko dekoracja">
        Ruch w miastach: {traffic ? 'wł.' : 'wył.'}
      </button>
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
      <button onClick={actions.newGame}>Nowa gra…</button>
      <div class="menu-title">Testy</div>
      <button onClick={actions.addTestMoney} title="Do testowania – dopisuje pieniądze bez wpisu w finansach">
        +100 000 zł
      </button>
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
