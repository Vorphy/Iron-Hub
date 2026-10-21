import { useState } from 'preact/hooks';
import { MAX_ENGINES, MAX_WAGONS } from '../sim/config';
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
  const [double, setDouble] = useState(false);
  const engineCount = double ? MAX_ENGINES : 1;
  const [selected, setSelected] = useState<number | null>(null);
  // Wybrany pociąg (do niego trafiają wagony z magazynu); domyślnie pierwszy w zajezdni.
  const target = data.trains.find((t) => t.id === selected) ?? data.trains[0];
  const stats = consistStats(engine, wagons, engineCount);
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
      {data.trains.length === 0 && (
        <div class="muted">Brak – kup pierwszy pociąg poniżej (sama lokomotywa też jest pociągiem).</div>
      )}
      {data.trains.length > 0 && <div class="muted small">Klik na pociąg – wybór; klik na wagon – odepnij do magazynu.</div>}
      {data.trains.map((t) => (
        <div class={`depot-train ${t.id === target?.id ? 'selected' : ''}`} key={t.id}>
          <div class="row">
            <button
              class="link grow train-pick"
              onClick={() => setSelected(t.id)}
              title="Wybierz – do tego pociągu trafią wagony z magazynu"
            >
              {t.id === target?.id ? '◉' : '○'} {t.name}
            </button>
            {t.stopped ? (
              <button class="primary" onClick={() => actions.startTrain(t.id)} title="Wyjedź z zajezdni">
                ▶
              </button>
            ) : (
              <button
                class="active"
                onClick={() => actions.stopTrain(t.id)}
                title="Pociąg czeka na wyjazd (wyjedzie, gdy wyjazd będzie wolny) – kliknij, aby anulować"
              >
                ■ Anuluj
              </button>
            )}
            <button onClick={() => actions.openTrain(t.id)} title="Okno pociągu (rozkład jazdy, wymiana lokomotywy)">
              Rozkład
            </button>
            <button onClick={() => actions.cloneTrain(t.id)} title="Kup taki sam pociąg ze wspólnym rozkładem">
              ⧉
            </button>
          </div>
          {!t.stopped && <div class="status small">{t.status}</div>}
          <div class="consist">
            {Array.from({ length: t.engineCount }, (_, k) => (
              <span key={`e${k}`} class="chip engine" style={{ background: engineDef(t.engine)!.color }}>
                {engineDef(t.engine)!.name}
              </span>
            ))}
            {t.wagons.map((w, i) => (
              <button
                key={i}
                class="chip"
                style={{ background: wagonDef(w)!.color }}
                title={`${wagonDef(w)!.name} – kliknij, aby odpiąć do magazynu`}
                onClick={() => actions.detachWagon(t.id, i)}
              >
                {wagonDef(w)!.name.split(' ').pop()}
              </button>
            ))}
          </div>
          <div class="buttons wrap">
            <button onClick={() => actions.sellTrain(t.id)} title="Sprzedaj cały pociąg">
              Sprzedaj <small>+{formatMoney(t.resale)}</small>
            </button>
            {t.wagons.length > 0 && (
              <button onClick={() => actions.sellEngine(t.id)} title="Sprzedaj tylko lokomotywę – wagony zostaną w magazynie">
                Sprzedaj {t.engineCount > 1 ? 'lokomotywy' : 'lokomotywę'} <small>+{formatMoney(t.engineResale)}</small>
              </button>
            )}
            {t.engineCount < MAX_ENGINES ? (
              <button
                disabled={!t.engineAvailable || engineDef(t.engine)!.cost > money}
                onClick={() => actions.setEngineCount(t.id, t.engineCount + 1)}
                title={
                  t.engineAvailable
                    ? 'Podwójna trakcja: druga taka sama lokomotywa – 2× moc i przyczepność (ciężkie składy pod górę), 2× utrzymanie'
                    : 'Ta lokomotywa jest już wycofana ze sprzedaży'
                }
              >
                + 2. lokomotywa <small>{formatMoney(engineDef(t.engine)!.cost)}</small>
              </button>
            ) : (
              <button onClick={() => actions.setEngineCount(t.id, 1)} title="Sprzedaj drugą lokomotywę">
                − 2. lokomotywa <small>+{formatMoney(t.oneEngineResale)}</small>
              </button>
            )}
          </div>
        </div>
      ))}

      <div class="section-title">Magazyn wagonów</div>
      {data.spare.length === 0 ? (
        <div class="muted small">Pusto. Odepnij wagon z pociągu albo kup wagon poniżej.</div>
      ) : (
        <div class="muted small">
          {target ? `Klik na wagon – doczep do: ${target.name}.` : 'Kup lokomotywę, żeby doczepić wagony.'} ✕ – sprzedaj.
        </div>
      )}
      <div class="consist">
        {data.spare.map((w, i) => (
          <span class="spare" key={i}>
            <button
              class="chip"
              style={{ background: wagonDef(w.type)!.color }}
              disabled={!target || target.wagons.length >= MAX_WAGONS}
              title={`${wagonDef(w.type)!.name}${w.amount ? ` (ładunek ${w.amount})` : ''} – doczep do wybranego pociągu`}
              onClick={() => target && actions.attachWagon(target.id, i)}
            >
              {wagonDef(w.type)!.name.split(' ').pop()}
            </button>
            <button
              class="close"
              title={`Sprzedaj (+${formatMoney(w.resale)})`}
              onClick={() => actions.sellSpareWagon(data.depotId, i)}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div class="muted small">Kup wagon do magazynu:</div>
      <div class="wagon-grid">
        {WAGONS.map((w) => (
          <button
            key={w.id}
            disabled={w.cost > money}
            onClick={() => actions.buyWagon(data.depotId, w.id)}
            title={`${w.name}: ${w.capacity} (${CARGO_NAMES[w.cargo]})`}
          >
            <span class="swatch" style={{ background: w.color }} />
            {w.name} <small>{formatMoney(w.cost)}</small>
          </button>
        ))}
      </div>

      <div class="section-title">Kup nowy pociąg</div>
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

      <label class="full-load" title="Dwie takie same lokomotywy: 2× moc i przyczepność, 2× cena i utrzymanie">
        <input type="checkbox" checked={double} onChange={() => setDouble(!double)} />
        Podwójna trakcja (2 lokomotywy – ciężkie składy pod górę)
      </label>

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
        {Array.from({ length: engineCount }, (_, k) => (
          <span key={`e${k}`} class="chip engine" style={{ background: engineDef(engine)!.color }}>
            {engineDef(engine)!.name}
          </span>
        ))}
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
        Długość {(stats.length / TILE_UNITS).toFixed(1)} kaf. · masa {stats.weight} t · {stats.power} kW · max {stats.maxSpeed}{' '}
        km/h · utrzymanie {formatMoney(stats.runningCost)}/rok (trakcja {TRACTION_NAMES[engineDef(engine)!.traction]})
      </div>

      <button
        class="primary"
        disabled={!canBuy}
        onClick={() => {
          actions.buyTrain(data.depotId, engine, wagons, engineCount);
          setWagons([]);
        }}
      >
        Kup za {formatMoney(stats.cost)}
      </button>
    </div>
  );
}
