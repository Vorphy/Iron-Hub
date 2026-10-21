import { useEffect, useRef } from 'preact/hooks';
import { TUTORIAL_STEPS } from '../tutorial';
import type { HudActions } from './hudStore';

/** Szerokość płótna minimapy w px ekranu (wysokość – połowa, jak w rzucie izometrycznym). */
const MINIMAP_W = 240;

/** Minimapa w lewym górnym rogu: klik lub przeciąganie przenosi kamerę. */
export function MinimapPanel({ open, actions }: { open: boolean; actions: HudActions }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    actions.attachMinimap(open ? ref.current : null);
    return () => actions.attachMinimap(null);
  }, [open]);

  const goto = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    actions.minimapGoto((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  return (
    <div class="panel minimap">
      <div class="minimap-head">
        <span>Mapa</span>
        <button class="close" title={open ? 'Zwiń minimapę' : 'Pokaż minimapę'} onClick={actions.toggleMinimap}>
          {open ? '–' : '+'}
        </button>
      </div>
      {open && (
        <canvas
          ref={ref}
          width={MINIMAP_W * 2}
          height={MINIMAP_W}
          style={{ width: `${MINIMAP_W}px`, height: `${MINIMAP_W / 2}px` }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
            goto(e);
          }}
          onPointerMove={(e) => e.buttons & 1 && goto(e)}
        />
      )}
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
