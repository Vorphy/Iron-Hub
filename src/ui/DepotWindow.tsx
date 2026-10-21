import { useState } from 'preact/hooks';
import { MAX_WAGONS } from '../sim/config';
import {
  CARGO_NAMES,
  consistStats,
  engineDef,
  engineRunningCost,
  ENGINES,
  TRACTION_NAMES,
  WAGONS,
  wagonDef,
} from '../sim/trains/vehicles';
import { formatMoney } from '../tools';
import type { DepotWindowData, HudActions } from './hudStore';

const TILE_UNITS = 16;

export function DepotWindow({ data, money, actions }: { data: DepotWindowData; money: number; actions: HudActions }) {
  const [engine, setEngine] = useState(ENGINES[0]!.id);
  const [wagons, setWagons] = useState<string[]>([]);
  const stats = consistStats(engine, wagons);
  const canBuy = stats.cost <= money;

  return (
    <div class="panel window">
      <div class="window-head">
        <span class="window-title">Zajezdnia #{data.depotId}</span>
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
      <div class="choices">
        {ENGINES.map((e) => (
          <button
            key={e.id}
            class={e.id === engine ? 'active' : ''}
            onClick={() => setEngine(e.id)}
            title={`${e.description} · trakcja ${TRACTION_NAMES[e.traction]} · utrzymanie ${formatMoney(engineRunningCost(e))}/rok`}
          >
            <span class="swatch" style={{ background: e.color }} />
            <span class="grow">{e.name}</span>
            <small>
              {e.maxSpeed} km/h · {e.power} kW · {formatMoney(e.cost)}
            </small>
          </button>
        ))}
      </div>

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
