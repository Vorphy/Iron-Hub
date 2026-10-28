import { useEffect, useRef, useState } from 'preact/hooks';
import { defaultFilters, industryColor, MINIMAP_ZOOMS } from '../render/minimap';
import { INDUSTRY_DEFS } from '../sim/economy/industry';
import { TUTORIAL_STEPS } from '../tutorial';
import type { HudActions, MinimapSettings } from './hudStore';
import { layoutStore, UI_SIZE_SCALE } from './layout';
import { useStore } from './store';

/** Szerokość małej minimapy w px ekranu (wysokość – połowa, jak w rzucie izometrycznym). */
const MINIMAP_W = 240;

/**
 * Minimapa: mała (przeciągana za nagłówek) albo duża na środku ekranu; zoom, legenda z filtrami
 * zakładów, miast, torów i pociągów. Klik lub przeciąganie po mapie przenosi kamerę.
 */
export function MinimapPanel({ open, settings, actions }: { open: boolean; settings: MinimapSettings; actions: HudActions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState(settings.pos);
  const big = settings.big;
  // Duża mapa: szerokość z rozmiaru okna (płótno 1:1 z ekranem, żeby nie liczyć zbyt wielu pikseli).
  const s = UI_SIZE_SCALE[useStore(layoutStore).uiSize];
  const bigW = Math.min(900, Math.max(320, window.innerWidth / s - 360));
  const w = big ? bigW : MINIMAP_W;
  const scale = big ? 1 : 2;

  useEffect(() => {
    actions.attachMinimap(open ? ref.current : null);
    return () => actions.attachMinimap(null);
  }, [open, big]);

  const goto = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    actions.minimapGoto((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  // Przeciąganie małej minimapy za nagłówek.
  const onHeadDown = (e: PointerEvent) => {
    if (big || (e.target as HTMLElement).closest('button')) return;
    const panel = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ dx: e.clientX - panel.left, dy: e.clientY - panel.top });
  };
  const onHeadMove = (e: PointerEvent) => {
    if (!drag) return;
    const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy));
    setPos({ x, y });
  };
  const onHeadUp = () => {
    if (!drag) return;
    setDrag(null);
    actions.setMinimap({ pos });
  };

  const zoomIdx = MINIMAP_ZOOMS.indexOf(settings.zoom as (typeof MINIMAP_ZOOMS)[number]);
  const setZoom = (d: number) => {
    const next = MINIMAP_ZOOMS[Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, zoomIdx + d))]!;
    actions.setMinimap({ zoom: next });
  };
  // Położenie w px ekranu; interfejs jest powiększony o `s` (zoom `#ui`).
  const style = big || !pos ? undefined : { left: `${pos.x / s}px`, top: `${pos.y / s}px` };

  const panel = (
    <div class={`panel minimap ${big ? 'big' : ''}`} style={style}>
      <div
        class={`minimap-head ${big ? '' : 'draggable'}`}
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
        title={big ? undefined : 'Przeciągnij, aby przenieść minimapę'}
      >
        <span>Mapa{settings.zoom > 1 ? ` ${settings.zoom}×` : ''}</span>
        <span class="minimap-tools">
          {open && (
            <>
              <button class="close" title="Oddal minimapę" disabled={zoomIdx <= 0} onClick={() => setZoom(-1)}>
                −
              </button>
              <button
                class="close"
                title="Przybliż minimapę (wokół kamery)"
                disabled={zoomIdx >= MINIMAP_ZOOMS.length - 1}
                onClick={() => setZoom(1)}
              >
                +
              </button>
              {!big && (
                <button
                  class={`close ${settings.legend ? 'active' : ''}`}
                  title="Legenda i filtry"
                  onClick={() => actions.setMinimap({ legend: !settings.legend })}
                >
                  ☰
                </button>
              )}
              <button
                class="close"
                title={big ? 'Zmniejsz' : 'Duża mapa z legendą'}
                onClick={() => actions.setMinimap({ big: !big })}
              >
                {big ? '⤡' : '⛶'}
              </button>
            </>
          )}
          {!big && (
            <button class="close" title={open ? 'Zwiń minimapę' : 'Pokaż minimapę'} onClick={actions.toggleMinimap}>
              {open ? '▾' : '▸'}
            </button>
          )}
        </span>
      </div>
      {open && (
        <div class="minimap-body">
          <canvas
            ref={ref}
            width={w * scale}
            height={(w / 2) * scale}
            style={{ width: `${w}px`, height: `${w / 2}px` }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
              goto(e);
            }}
            onPointerMove={(e) => e.buttons & 1 && goto(e)}
          />
          {(big || settings.legend) && <MinimapLegend settings={settings} actions={actions} />}
        </div>
      )}
    </div>
  );
  if (!big) return panel;
  return <div class="modal-backdrop minimap-backdrop">{panel}</div>;
}

/** Legenda minimapy: ptaszki pokazują / chowają typy zakładów, miasta, tory i pociągi; „tylko” – sam ten typ. */
function MinimapLegend({ settings, actions }: { settings: MinimapSettings; actions: HudActions }) {
  const f = settings.filters;
  const set = (patch: Partial<MinimapSettings['filters']>) => actions.setMinimap({ filters: { ...f, ...patch } });
  const setIndustry = (id: string, on: boolean) => set({ industries: { ...f.industries, [id]: on } });
  const only = (id: string) => set({ industries: Object.fromEntries(INDUSTRY_DEFS.map((d) => [d.id, d.id === id])) });
  return (
    <div class="minimap-legend">
      {INDUSTRY_DEFS.map((d) => (
        <div class="row legend-row" key={d.id}>
          <label class="full-load grow">
            <input
              type="checkbox"
              checked={f.industries[d.id] !== false}
              onChange={() => setIndustry(d.id, f.industries[d.id] === false)}
            />
            <span class="legend-swatch" style={{ background: industryColor(d.id) }} />
            {d.name}
          </label>
          <button class="link" title={`Pokaż tylko: ${d.name}`} onClick={() => only(d.id)}>
            tylko
          </button>
        </div>
      ))}
      <label class="full-load">
        <input type="checkbox" checked={f.towns} onChange={() => set({ towns: !f.towns })} />
        <span class="legend-swatch" style={{ background: '#c46248' }} />
        Miasta i drogi
      </label>
      <label class="full-load">
        <input type="checkbox" checked={f.rail} onChange={() => set({ rail: !f.rail })} />
        <span class="legend-swatch" style={{ background: '#3a3026' }} />
        <span class="legend-swatch" style={{ background: '#6078e6' }} />
        Tory, stacje i metro
      </label>
      <label class="full-load">
        <input type="checkbox" checked={f.trains} onChange={() => set({ trains: !f.trains })} />
        <span class="legend-swatch" style={{ background: '#ffe066' }} />
        Pociągi
      </label>
      <button class="link" onClick={() => set(defaultFilters())}>
        Pokaż wszystko
      </button>
    </div>
  );
}

/** „Pierwsze kroki”: lista celów, bieżący z podpowiedzią. */
export function TutorialPanel({ steps, actions }: { steps: boolean[]; actions: HudActions }) {
  if (!steps.length) return null;
  const current = steps.findIndex((d) => !d);
  return (
    <div class="panel tutorial">
      <div class="window-head">
        <b>Pierwsze kroki</b>
        <button class="close" title="Ukryj (wrócisz przez Menu → Pierwsze kroki)" onClick={actions.toggleTutorial}>
          ✕
        </button>
      </div>
      <ol>
        {TUTORIAL_STEPS.map((step, i) => (
          <li key={step.title} class={steps[i] ? 'done' : i === current ? 'current' : ''}>
            <span class="mark">{steps[i] ? '✓' : i === current ? '▶' : '·'}</span>
            <span>
              {step.title}
              {i === current && <div class="hint">{step.hint}</div>}
            </span>
          </li>
        ))}
      </ol>
      {current === -1 && (
        <div class="hint">
          Gotowe! Teraz rozbudowuj sieć: więcej pociągów, nowe linie, łańcuchy dostaw (węgiel → elektrownia).
        </div>
      )}
      <div class="buttons">
        <button onClick={actions.newGame} title="Inny rozmiar mapy lub inne ziarno">
          Nowa gra…
        </button>
        <button onClick={() => actions.openHelp()} title="Opis całej gry (H)">
          Pomoc
        </button>
        <button onClick={actions.toggleTutorial}>Ukryj</button>
      </div>
    </div>
  );
}
