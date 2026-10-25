import { TERRAFORM_COST, WAYPOINT_COST } from '../sim/config';
import { useEffect, useState } from 'preact/hooks';
import { SPEEDS, type Speed } from '../loop';
import { Side } from '../sim/track/track';
import { Terrain } from '../sim/world/map';
import { formatMoney, type SignalKind, type Tool } from '../tools';
import { DepotWindow } from './DepotWindow';
import { NewGameDialog } from './NewGameDialog';
import { MinimapPanel, TutorialPanel } from './Guide';
import { ChangelogWindow, HelpWindow } from './HelpWindows';
import { FinanceWindow, IndustryWindow, StationWindow, TownWindow } from './InfoWindows';
import { TrainWindow } from './TrainWindow';
import { TrainsWindow } from './TrainsWindow';
import { hudStore, type HudActions, type HudState } from './hudStore';
import { layoutStore, resetLayout, setHints, useFloatingPanel } from './layout';
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
  { tool: 'catenary', icon: 'ϟ', name: 'Trakcja', key: 'E' },
  { tool: 'terrain', icon: '⛰', name: 'Teren', key: 'L' },
  { tool: 'bridge', icon: '⌒', name: 'Most', key: 'M' },
  { tool: 'tunnel', icon: '◠', name: 'Tunel', key: 'N' },
  { tool: 'bulldozer', icon: '✖', name: 'Rozbiórka', key: 'X' },
];

const TOOL_HELP: Record<Tool, string> = {
  cursor:
    'Klik na pociąg, stację, zajezdnię, miasto lub zakład – okno · przeciąganie / strzałki / WASD – przesuwanie · kółko – zoom · spacja – pauza · 1–4 – prędkość · G – graf torów · V – rezerwacje torów',
  track:
    'Buduj: przeciągnij wzdłuż osi lub ukośnie; pozycja kursora w kafelku wybiera łuk. Usuń: klik – jeden element pod kursorem, przeciągnięcie – odcinek. Prawy przycisk – przesuwanie mapy · Esc – anuluj',
  station:
    'Przeciągnij prostokąt: dłuższy bok to długość peronu, krótszy – liczba torów. Peron obok stacji ją rozbudowuje (Ctrl / Shift – osobna stacja). R – obrót przy kwadracie. Niebieskie pole to zasięg stacji. Punkt kontrolny (panel): klik na prosty tor – w rozkładzie wymusza jazdę tym torem',
  depot: 'Klik stawia zajezdnię (1000 zł). Kierunek wjazdu wybierz w panelu obok (lub R); Auto – w stronę sąsiedniego toru',
  signal:
    'Klik na tor stawia semafor ścieżkowy (200 zł); kolejne kliknięcia zmieniają kierunek. Pociąg może stanąć tylko przed semaforem, na końcu peronu lub toru · V – podgląd rezerwacji',
  catenary:
    'Sieć trakcyjna dla lokomotyw elektrycznych: przeciągnij wzdłuż toru (jak przy budowie, także po skosie) albo kliknij kafelek. Most i tunel – w całości. Zajezdnia też musi mieć sieć. 150 zł za kafelek',
  terrain: `Podnieś / Obniż: klik zmienia o poziom narożnik najbliższy kursorowi (sąsiedni teren dopasuje się sam). Wyrównaj: przeciągnij prostokąt – teren do wysokości punktu startowego. ${TERRAFORM_COST} zł za narożnik`,
  bridge:
    'Przeciągnij od przyczółka do przyczółka (wzdłuż osi, max 14 kafelków). Przyczółki płaskie lub wznoszące się w stronę mostu, na tej samej wysokości; pod mostem teren co najmniej poziom niżej. 400 zł za kafelek',
  tunnel:
    'Klik na zbocze (w osi X lub Y) – tunel w głąb wzniesienia do zbocza po drugiej stronie na tej samej wysokości. Nad tunelem teren co najmniej poziom wyżej, max 20 kafelków, 600 zł za kafelek',
  orders: 'Klikaj stacje lub punkty kontrolne, aby dopisać je do rozkładu pociągu · Esc – koniec',
  bulldozer:
    'Klik – usuń element toru pod kursorem, most (przyczółek), tunel (wejście), zajezdnię, kafelek stacji, dom lub oczyść nieużytek · przeciągnięcie – rozbierz odcinek toru (zwrot 25%)',
};

const MESSAGE_MS = 2500;

function speedLabel(s: Speed): string {
  return s === 0 ? '⏸' : `${s}×`;
}

export function Hud({ actions }: { actions: HudActions }) {
  const s = useStore(hudStore);
  const top = useFloatingPanel('topbar');
  const build = useFloatingPanel('build');

  return (
    <>
      <div class="panel topbar" ref={top.ref} style={top.style}>
        <span class="grip" title="Przeciągnij, aby przenieść pasek" {...top.grip}>
          ⠿
        </span>
        <span class="title">IRON HUB</span>
        <span class="sep" />
        <span>{s.date}</span>
        <span class="sep" />
        <button class={`money link ${s.money < 0 ? 'negative' : ''}`} title="Finanse i kredyt" onClick={actions.openFinance}>
          {formatMoney(s.money)}
        </button>
        {!top.collapsed && <TopbarControls s={s} actions={actions} />}
        <button
          class="collapse"
          title={top.collapsed ? 'Rozwiń pasek' : 'Zwiń pasek (zostaje data i kwota)'}
          onClick={top.toggleCollapsed}
        >
          {top.collapsed ? '▸' : '◂'}
        </button>
      </div>

      <MinimapPanel open={s.minimapOpen} settings={s.minimap} actions={actions} />
      {s.tutorialOpen && <TutorialPanel steps={s.tutorialSteps} actions={actions} />}

      {s.bankrupt && !s.newGameOpen && <BankruptDialog actions={actions} hasQuickSave={!!s.saves.quick} />}
      {s.helpTopic && <HelpWindow topic={s.helpTopic} actions={actions} />}
      {s.changelogOpen && <ChangelogWindow actions={actions} />}
      {s.newGameOpen && <NewGameDialog actions={actions} canCancel={true} />}
      {s.menuOpen && (
        <Menu
          actions={actions}
          saves={s.saves}
          signalMode={s.signalMode}
          traffic={s.traffic}
          gfx={s.gfxAvailable ? s.gfx : null}
          buildingsHidden={s.buildingsHidden}
          changelogUnseen={s.changelogUnseen}
        />
      )}
      {s.windowData?.kind === 'depot' && <DepotWindow data={s.windowData} money={s.money} actions={actions} />}
      {s.windowData?.kind === 'train' && <TrainWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'town' && <TownWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'station' && <StationWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'trains' && <TrainsWindow data={s.windowData} actions={actions} />}
      {s.windowData?.kind === 'finance' && <FinanceWindow data={s.windowData} money={s.money} actions={actions} />}
      {s.windowData?.kind === 'industry' && <IndustryWindow data={s.windowData} actions={actions} />}

      <div class="build-dock" ref={build.ref} style={build.style}>
        <div class={`panel toolbar ${build.collapsed ? 'compact' : ''}`}>
          <div class="panel-head">
            <span class="grip" title="Przeciągnij, aby przenieść menu budowania" {...build.grip}>
              ⠿
            </span>
            <button
              class="collapse"
              title={build.collapsed ? 'Pokaż nazwy narzędzi' : 'Zwiń do samych ikon'}
              onClick={build.toggleCollapsed}
            >
              {build.collapsed ? '»' : '«'}
            </button>
          </div>
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
      </div>

      <div class="panel statusbar">
        <span>
          {s.hover ? `Kafelek (${s.hover.x}, ${s.hover.y}) · ${s.hover.station ?? TERRAIN_NAMES[s.hover.terrain]}` : '—'}
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

      <Hints text={TOOL_HELP[s.tool]} />

      <CursorLabel label={s.cursorLabel} />
      <Toast message={s.message} />
    </>
  );
}

/** Prędkość gry, lista pociągów, pomoc i menu – chowane razem ze zwinięciem paska. */
function TopbarControls({ s, actions }: { s: HudState; actions: HudActions }) {
  return (
    <>
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
        <button
          class={s.window?.kind === 'trains' ? 'active' : ''}
          title="Lista pociągów – zyski, grupy (K)"
          onClick={() => (s.window?.kind === 'trains' ? actions.closeWindow() : actions.openTrains())}
        >
          🚆 Pociągi
        </button>
        <button
          class={s.buildingsHidden ? 'active' : ''}
          title={s.buildingsHidden ? 'Pokaż budynki (U)' : 'Ukryj budynki, drzewa i dachy peronów – widać tory pod nimi (U)'}
          onClick={actions.toggleBuildings}
        >
          {s.buildingsHidden ? '🏚 Bez budynków' : '🏠'}
        </button>
        <button
          class={s.helpTopic ? 'active' : ''}
          title="Pomoc (H)"
          onClick={() => (s.helpTopic ? actions.closeHelp() : actions.openHelp())}
        >
          ?
        </button>
        <button class={s.menuOpen ? 'active' : ''} title="Menu gry" onClick={actions.toggleMenu}>
          ☰ Menu{s.changelogUnseen && <span class="dot" title="Nowości w „Co nowego”" />}
        </button>
      </span>
    </>
  );
}

/** Podpowiedzi do narzędzia: przesuwane, zwijane, wyłączane (Menu → Widok). */
function Hints({ text }: { text: string }) {
  const on = useStore(layoutStore).hints;
  const p = useFloatingPanel('hints');
  if (!on) return null;
  return (
    <div class={`panel help ${p.collapsed ? 'collapsed' : ''}`} ref={p.ref} style={p.style}>
      <span class="grip" title="Przeciągnij, aby przenieść podpowiedzi" {...p.grip}>
        ⠿
      </span>
      {p.collapsed ? <span>Podpowiedzi</span> : <span class="help-text">{text}</span>}
      <span class="buttons">
        <button class="collapse" title={p.collapsed ? 'Rozwiń podpowiedzi' : 'Zwiń podpowiedzi'} onClick={p.toggleCollapsed}>
          {p.collapsed ? '▴' : '▾'}
        </button>
        <button class="collapse" title="Wyłącz podpowiedzi (włączysz w Menu → Widok)" onClick={() => setHints(false)}>
          ✕
        </button>
      </span>
    </div>
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
          <button
            key={m.mode}
            class={options.terrainMode === m.mode ? 'active' : ''}
            onClick={() => actions.setTerrainMode(m.mode)}
          >
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
  if (tool === 'catenary') {
    return (
      <div class="panel tool-options">
        <div class="section-title">Trakcja</div>
        <button class={options.catenaryMode === 'build' ? 'active' : ''} onClick={() => actions.setCatenaryMode('build')}>
          Buduj
        </button>
        <button
          class={options.catenaryMode === 'remove' ? 'active' : ''}
          title="Zdejmuje sieć (zwrot 25%); nie tam, gdzie stoi lub jedzie pociąg elektryczny"
          onClick={() => actions.setCatenaryMode('remove')}
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
        <div class="section-title">Buduj</div>
        <button
          class={options.stationKind === 'platform' ? 'active' : ''}
          title="Perony stacji – przeciągnij prostokąt"
          onClick={() => actions.setStationKind('platform')}
        >
          Peron
        </button>
        <button
          class={options.stationKind === 'waypoint' ? 'active' : ''}
          title="Punkt kontrolny na prostym torze – w rozkładzie wymusza jazdę tym torem, bez zatrzymania"
          onClick={() => actions.setStationKind('waypoint')}
        >
          Punkt kontrolny
        </button>
        {options.stationKind === 'waypoint' && <div class="muted small">Klik na prosty tor · {formatMoney(WAYPOINT_COST)}</div>}
        <div class="section-title">Perony</div>
        <div class="dir-grid">
          <button
            class={options.stationAxis === 'y' ? 'active' : ''}
            title="Perony w osi ↙↗"
            onClick={() => actions.setStationAxis('y')}
          >
            ⟋
          </button>
          <button
            class={options.stationAxis === 'x' ? 'active' : ''}
            title="Perony w osi ↖↘"
            onClick={() => actions.setStationAxis('x')}
          >
            ⟍
          </button>
        </div>
        <div class="muted small">przy kwadracie</div>
        <div class="section-title">Obok stacji</div>
        <button
          class={!options.stationSeparate ? 'active' : ''}
          title="Peron przy istniejącej stacji ją rozbudowuje (ta sama nazwa i ładunek)"
          onClick={() => actions.setStationSeparate(false)}
        >
          Rozbuduj
        </button>
        <button
          class={options.stationSeparate ? 'active' : ''}
          title="Zawsze osobna stacja"
          onClick={() => actions.setStationSeparate(true)}
        >
          Osobna
        </button>
        <div class="muted small">Ctrl / Shift – odwrotnie</div>
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
  gfx,
  buildingsHidden,
  changelogUnseen,
}: {
  actions: HudActions;
  saves: HudState['saves'];
  signalMode: HudState['signalMode'];
  traffic: boolean;
  /** null – atlas grafiki niedostępny. */
  gfx: boolean | null;
  buildingsHidden: boolean;
  changelogUnseen: boolean;
}) {
  const hints = useStore(layoutStore).hints;
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
      <button
        class={traffic ? 'active' : ''}
        onClick={actions.toggleTraffic}
        title="Auta i autobusy w miastach – tylko dekoracja"
      >
        Ruch w miastach: {traffic ? 'wł.' : 'wył.'}
      </button>
      {gfx !== null && (
        <button
          class={gfx ? 'active' : ''}
          onClick={actions.toggleGfx}
          title="Grafika w stylu TTD (OpenGFX) albo proste kształty"
        >
          Grafika: {gfx ? 'OpenGFX' : 'prosta'}
        </button>
      )}
      <button
        class={buildingsHidden ? '' : 'active'}
        onClick={actions.toggleBuildings}
        title="Ukryj domy, zakłady, drzewa i dachy peronów, żeby zobaczyć tory pod nimi"
      >
        Budynki: {buildingsHidden ? 'ukryte' : 'widoczne'} <small>U</small>
      </button>
      <button class={hints ? 'active' : ''} onClick={() => setHints(!hints)} title="Podpowiedzi do narzędzi w rogu ekranu">
        Podpowiedzi: {hints ? 'wł.' : 'wył.'}
      </button>
      <button onClick={resetLayout} title="Górny pasek, menu budowania i podpowiedzi wracają na swoje miejsca i rozwijają się">
        Przywróć układ paneli
      </button>
      <button onClick={actions.toggleTutorial}>Pierwsze kroki</button>
      <button onClick={() => actions.openHelp()}>
        Pomoc <small>H</small>
      </button>
      <button onClick={actions.openChangelog}>Co nowego {changelogUnseen && <span class="dot" />}</button>
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

/** Koniec gry po bankructwie: nowa gra albo powrót do zapisu. */
function BankruptDialog({ actions, hasQuickSave }: { actions: HudActions; hasQuickSave: boolean }) {
  return (
    <div class="modal-backdrop">
      <div class="panel window dialog">
        <div class="window-head">
          <span class="window-title">Bankructwo</span>
        </div>
        <div>Firma zbyt długo miała ujemne saldo i ogłosiła upadłość. Wierzyciele przejęli majątek – to koniec tej gry.</div>
        <div class="buttons wrap">
          <button class="primary" onClick={actions.newGame}>
            Nowa gra…
          </button>
          <button disabled={!hasQuickSave} onClick={actions.quickLoad}>
            Wczytaj zapis
          </button>
        </div>
      </div>
    </div>
  );
}
