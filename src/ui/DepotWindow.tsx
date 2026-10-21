import { useState } from 'preact/hooks';
import { MAX_WAGONS } from '../sim/config';
import type { Traction } from '../data/economy';
import {
  availableEngines,
  CARGO_NAMES,
  consistStats,
  engineDef,
  engineRunningCost,
  TRACTION_NAMES,
  WAGONS,
  wagonDef,
} from '../sim/trains/vehicles';
import { formatMoney } from '../tools';
import type { DepotWindowData, HudActions } from './hudStore';

const TILE_UNITS = 16;
const TRACTIONS: Traction[] = ['steam', 'diesel', 'electric'];
const TRACTION_TITLES: Record<Traction, string> = { steam: 'Parowe', diesel: 'Spalinowe', electric: 'Elektryczne' };

export function DepotWindow({ data, money, actions }: { data: DepotWindowData; money: number; actions: HudActions }) {
  const engines = availableEngines(data.year);
  const [picked, setEngine] = useState(engines[0]?.id ?? '');
  // Wybrana lokomotywa mogła wyjść ze sprzedaży (nowy rok) – wtedy pierwsza dostępna.
  const engine = engines.some((e) => e.id === picked) ? picked : engines[0]!.id;
  const [wagons, setWagons] = useState<string[]>([]);
  const stats = consistStats(engine, wagons);
  const canBuy = stats.cost <= money;
  const electric = engineDef(engine)!.traction === 'electric';

  return (
    <div class="panel window">
      <div class="window-head">
        <span class="window-title">Zajezdnia #{data.depotId}</span>
        <button class="close" title="Pomoc: lokomotywy" onClick={() => actions.openHelp('engines')}>
          ?
        </button>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
          ✕
        </button>
      </div>

      <div class="section-title">Pociągi w zajezdni</div>
      {data.trains.length === 0 && <div class="muted">Brak – kup pierwszy pociąg poniżej.</div>}
      {data.trains.map((t) => (
        <div class="row" key={t.id}>
          <div class="grow">
            <div>{t.name}</div>
            <div class="muted small">
              {engineDef(t.engine)?.name} + {t.wagons.length} wag.
            </div>
          </div>
          <button class="primary" onClick={() => actions.startTrain(t.id)} title="Wyjedź z zajezdni">
            ▶
          </button>
          <button onClick={() => actions.openTrain(t.id)} title="Okno pociągu (rozkład jazdy)">
            Rozkład
          </button>
          <button onClick={() => actions.sellTrain(t.id)} title={`Sprzedaj (+${formatMoney(t.resale)})`}>
            Sprzedaj
          </button>
        </div>
      ))}

      <div class="section-title">Kup pociąg</div>
      {TRACTIONS.map((traction) => {
        const list = engines.filter((e) => e.traction === traction);
        if (!list.length) return null;
        return (
          <div class="choices" key={traction}>
            <div class="muted small">{TRACTION_TITLES[traction]}</div>
            {list.map((e) => (
              <button
                key={e.id}
                class={e.id === engine ? 'active' : ''}
                onClick={() => setEngine(e.id)}
                title={`${e.description} · od ${e.year}${e.retire ? ` do ${e.retire - 1}` : ''} · utrzymanie ${formatMoney(engineRunningCost(e))}/rok`}
              >
                <span class="swatch" style={{ background: e.color }} />
                <span class="grow">
                  {e.name}
                  {data.year - e.year <= 1 && <span class="badge">nowość</span>}
                  {e.retire !== undefined && e.retire - data.year <= 2 && <span class="badge old">wkrótce wycofana</span>}
                </span>
                <small>
                  {e.maxSpeed} km/h · {e.power} kW · {formatMoney(e.cost)}
                </small>
              </button>
            ))}
          </div>
        );
      })}
      {electric && (
        <div class={data.electrified ? 'muted small' : 'warning'}>
          {data.electrified
            ? 'Lokomotywa elektryczna – jeździ tylko pod siecią trakcyjną.'
            : 'Ta zajezdnia nie ma sieci trakcyjnej – pociąg elektryczny z niej nie wyjedzie. Zbuduj sieć narzędziem Trakcja (E).'}
        </div>
      )}

      <div class="muted small">Dodaj wagony (max {MAX_WAGONS}):</div>
      <div class="wagon-grid">
        {WAGONS.map((w) => (
          <button
            key={w.id}
            disabled={wagons.length >= MAX_WAGONS}
            onClick={() => setWagons([...wagons, w.id])}
            title={`${w.name}: ${w.capacity} (${CARGO_NAMES[w.cargo]}), ${formatMoney(w.cost)}`}
          >
            <span class="swatch" style={{ background: w.color }} />+ {w.name}
          </button>
        ))}
      </div>

      <div class="consist">
        <span class="chip engine" style={{ background: engineDef(engine)!.color }}>
          {engineDef(engine)!.name}
        </span>
        {wagons.map((id, i) => (
          <button
            key={i}
            class="chip"
            style={{ background: wagonDef(id)!.color }}
            title="Kliknij, aby usunąć"
            onClick={() => setWagons(wagons.filter((_, j) => j !== i))}
          >
            {wagonDef(id)!.name.split(' ').pop()}
          </button>
        ))}
      </div>
      <div class="muted small">
        Długość {(stats.length / TILE_UNITS).toFixed(1)} kaf. · masa {stats.weight} t · max {stats.maxSpeed} km/h · utrzymanie{' '}
        {formatMoney(stats.runningCost)}/rok (trakcja {TRACTION_NAMES[engineDef(engine)!.traction]})
      </div>

      <button
        class="primary"
        disabled={!canBuy}
        onClick={() => {
          actions.buyTrain(data.depotId, engine, wagons);
          setWagons([]);
        }}
      >
        Kup za {formatMoney(stats.cost)}
      </button>
    </div>
  );
}
