import { useState } from 'preact/hooks';
import type { HudActions } from './hudStore';

export const MAP_SIZES: { size: number; name: string; note: string; title?: string }[] = [
  { size: 64, name: 'Mała', note: '64×64 – szybka gra, 2 miasta' },
  { size: 128, name: 'Średnia', note: '128×128 – zalecana, 8 miast' },
  { size: 256, name: 'Duża', note: '256×256 – 32 miasta' },
  {
    size: 512,
    name: 'Ogromna',
    note: '512×512 – eksperymentalna',
    title: '128 miast; wolniejsze wczytywanie i autozapis – wymaga mocnego komputera',
  },
];

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

/** Okno nowej gry: rozmiar mapy i ziarno (ta sama liczba = ta sama mapa). */
export function NewGameDialog({ actions, canCancel }: { actions: HudActions; canCancel: boolean }) {
  const [size, setSize] = useState(128);
  const [seed, setSeed] = useState(randomSeed);

  return (
    <div class="modal-backdrop">
      <div class="panel window dialog">
        <div class="window-head">
          <span class="window-title">Nowa gra</span>
          {canCancel && (
            <button class="close" title="Anuluj" onClick={actions.closeNewGame}>
              ✕
            </button>
          )}
        </div>

        <div class="section-title">Rozmiar mapy</div>
        <div class="choices">
          {MAP_SIZES.map((m) => (
            <button key={m.size} class={m.size === size ? 'active' : ''} title={m.title} onClick={() => setSize(m.size)}>
              <span class="grow">{m.name}</span>
              <small>{m.note}</small>
            </button>
          ))}
        </div>

        <div class="section-title">Ziarno mapy</div>
        <div class="row">
          <input
            class="seed"
            type="number"
            min={1}
            value={seed}
            onInput={(e) => setSeed(Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value)) || 1))}
          />
          <button title="Losuj" onClick={() => setSeed(randomSeed())}>
            🎲 Losuj
          </button>
        </div>
        <div class="muted small">Ta sama liczba i rozmiar dają zawsze tę samą mapę.</div>

        <button class="primary" onClick={() => actions.startNewGame(size, seed)}>
          Rozpocznij
        </button>
        {canCancel && <div class="muted small">Bieżąca gra zostanie zastąpiona (autozapis też).</div>}
      </div>
    </div>
  );
}
