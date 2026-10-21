import { useState } from 'preact/hooks';
import { START_YEAR, START_YEARS } from '../sim/time';
import { DEFAULT_DENSITY, DENSITIES, DENSITY_NAMES, type Density, worldCounts } from '../sim/world/generate';
import type { HudActions } from './hudStore';

export const MAP_SIZES: { size: number; name: string; note: string; title?: string }[] = [
  { size: 64, name: 'Mała', note: '64×64 – szybka gra' },
  { size: 128, name: 'Średnia', note: '128×128 – zalecana' },
  { size: 256, name: 'Duża', note: '256×256' },
  {
    size: 512,
    name: 'Ogromna',
    note: '512×512 – eksperymentalna',
    title: 'Wolniejsze wczytywanie i autozapis – wymaga mocnego komputera',
  },
  {
    size: 1024,
    name: 'Testowa',
    note: '1024×1024 – test wydajności',
    title: 'Milion kafelków; autozapis co 2 minuty – tylko do testów',
  },
];

/** Co jest w zajezdniach na starcie (lokomotywy z src/data/vehicles.json). */
const YEAR_NOTES: Record<number, string> = {
  1900: 'Tylko parowozy – wolno, tanio, początek kolei.',
  1925: 'Parowozy, w tym szybka Strzała.',
  1950: 'Parowozy i pierwsza spalinowa; elektryczne od 1955.',
  1975: 'Spalinowe i elektryczne do 160 km/h.',
  2000: 'Nowoczesne lokomotywy do 200 km/h, wkrótce 250 km/h.',
};

function DensityPicker({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div class="buttons wrap">
      {DENSITIES.map((d) => (
        <button key={d} class={d === value ? 'active' : ''} onClick={() => onChange(d)}>
          {DENSITY_NAMES[d]}
        </button>
      ))}
    </div>
  );
}

/** Polska odmiana liczebnika: 1 miasto, 2 miasta, 5 miast. */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

/** Okno nowej gry: rozmiar mapy i ziarno (ta sama liczba = ta sama mapa). */
export function NewGameDialog({ actions, canCancel }: { actions: HudActions; canCancel: boolean }) {
  const [size, setSize] = useState(128);
  const [seed, setSeed] = useState(randomSeed);
  const [year, setYear] = useState<number>(START_YEAR);
  const [towns, setTowns] = useState<Density>(DEFAULT_DENSITY);
  const [industry, setIndustry] = useState<Density>(DEFAULT_DENSITY);
  const counts = worldCounts(size, size, towns, industry);

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

        <div class="section-title">Rok startu</div>
        <div class="buttons wrap">
          {START_YEARS.map((y) => (
            <button key={y} class={y === year ? 'active' : ''} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
        <div class="muted small">{YEAR_NOTES[year]}</div>

        <div class="section-title">Miasta</div>
        <DensityPicker value={towns} onChange={setTowns} />
        <div class="section-title">Przemysł (kopalnie, lasy, zakłady)</div>
        <DensityPicker value={industry} onChange={setIndustry} />
        <div class="muted small">
          Na tej mapie: {counts.towns} {plural(counts.towns, 'miasto', 'miasta', 'miast')}, {counts.industries}{' '}
          {plural(counts.industries, 'zakład', 'zakłady', 'zakładów')}.
          {counts.towns === 0 && ' Bez miast nie ma pasażerów, poczty ani odbiorców towarów.'}
          {counts.industries === 0 && ' Bez przemysłu wozisz tylko pasażerów i pocztę.'}
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

        <button class="primary" onClick={() => actions.startNewGame(size, seed, year, towns, industry)}>
          Rozpocznij
        </button>
        {canCancel && <div class="muted small">Bieżąca gra zostanie zastąpiona (autozapis też).</div>}
      </div>
    </div>
  );
}
