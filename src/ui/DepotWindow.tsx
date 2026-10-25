import { useState } from 'preact/hooks';
import type { Traction } from '../data/economy';
import { MAX_ENGINES, MAX_WAGONS } from '../sim/config';
import {
  availableEngines,
  CARGO_NAMES,
  engineDef,
  engineRunningCost,
  TRACTION_NAMES,
  WAGONS,
  wagonDef,
  wagonRunningCost,
} from '../sim/trains/vehicles';
import { formatMoney } from '../tools';
import type { DepotWindowData, HudActions, TrainSummary } from './hudStore';
import { VehicleIcon, vehiclePal } from './VehicleIcon';

const TRACTIONS: Traction[] = ['steam', 'diesel', 'electric'];
const TRACTION_TITLES: Record<Traction, string> = { steam: 'Parowe', diesel: 'Spalinowe', electric: 'Elektryczne' };

/** Przeciągany pojazd: wagon z pociągu, lokomotywa (k – która) albo wolny wagon. */
type Drag =
  | { from: 'wagon'; trainId: number; index: number }
  | { from: 'engine'; trainId: number; k: number }
  | { from: 'spare'; index: number };

const DRAG_TYPE = 'application/x-ironhub-vehicle';

function dragData(e: DragEvent): Drag | null {
  try {
    return JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) ?? '') as Drag;
  } catch {
    return null;
  }
}

/**
 * Zajezdnia jak w OpenTTD: pociągi w rzędach (lokomotywa i wagony z boku), rząd wolnych wagonów,
 * przeciąganie pojazdów między nimi i do kosza oraz jedno miejsce zakupu – „Nowe pojazdy”.
 */
export function DepotWindow({ data, money, actions }: { data: DepotWindowData; money: number; actions: HudActions }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [buyOpen, setBuyOpen] = useState(data.trains.length === 0);
  const [hover, setHover] = useState<string | null>(null);
  const target = data.trains.find((t) => t.id === selected) ?? null;
  const spareCount = data.spare.length;

  /** Wagon z pociągu `from` do pociągu `to` (przez wolne wagony – dwa polecenia w kolejności). */
  const moveWagon = (fromTrain: number, index: number, to: TrainSummary) => {
    if (to.wagons.length >= MAX_WAGONS) return;
    actions.detachWagon(fromTrain, index);
    actions.attachWagon(to.id, spareCount);
  };

  const dropOnTrain = (e: DragEvent, t: TrainSummary) => {
    e.preventDefault();
    setHover(null);
    const d = dragData(e);
    if (!d) return;
    if (d.from === 'spare' && t.wagons.length < MAX_WAGONS) actions.attachWagon(t.id, d.index);
    if (d.from === 'wagon' && d.trainId !== t.id) moveWagon(d.trainId, d.index, t);
  };
  const dropOnSpare = (e: DragEvent) => {
    e.preventDefault();
    setHover(null);
    const d = dragData(e);
    if (d?.from === 'wagon') actions.detachWagon(d.trainId, d.index);
  };
  const dropOnBin = (e: DragEvent) => {
    e.preventDefault();
    setHover(null);
    const d = dragData(e);
    if (!d) return;
    if (d.from === 'spare') actions.sellSpareWagon(data.depotId, d.index);
    else if (d.from === 'wagon') {
      actions.detachWagon(d.trainId, d.index);
      actions.sellSpareWagon(data.depotId, spareCount);
    } else {
      const t = data.trains.find((x) => x.id === d.trainId);
      if (!t) return;
      if (d.k > 0) actions.setEngineCount(t.id, 1);
      else if (t.wagons.length) actions.sellEngine(t.id);
      else actions.sellTrain(t.id);
    }
  };
  const dropZone = (key: string, onDrop: (e: DragEvent) => void) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (hover !== key) setHover(key);
    },
    onDragLeave: () => setHover(null),
    onDrop,
  });
  const startDrag = (d: Drag) => (e: DragEvent) => {
    e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(d));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div class="panel window depot-window">
      <div class="window-head">
        <span class="window-title">Zajezdnia #{data.depotId}</span>
        <button class="close" title="Pomoc: lokomotywy" onClick={() => actions.openHelp('engines')}>
          ?
        </button>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
          ✕
        </button>
      </div>

      {data.trains.length === 0 && <div class="muted">Pusto – kup lokomotywę w „Nowe pojazdy”, to będzie nowy pociąg.</div>}
      {data.trains.length > 0 && (
        <div class="muted small">
          Przeciągaj wagony między pociągami, do wolnych wagonów albo do kosza. Klik na nazwę – wybór pociągu.
        </div>
      )}
      {data.trains.map((t) => {
        const pal = vehiclePal(t.engine);
        return (
          <div
            key={t.id}
            class={`depot-row ${t.id === selected ? 'selected' : ''} ${hover === `t${t.id}` ? 'drop' : ''}`}
            {...dropZone(`t${t.id}`, (e) => dropOnTrain(e, t))}
          >
            <div class="row">
              {t.stopped ? (
                <button
                  class="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.startTrain(t.id);
                  }}
                  title="Wyjedź z zajezdni"
                >
                  ▶
                </button>
              ) : (
                <button
                  class="active"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.stopTrain(t.id);
                  }}
                  title="Pociąg czeka na wyjazd (wyjedzie, gdy wyjazd będzie wolny) – kliknij, aby anulować"
                >
                  ■
                </button>
              )}
              <button
                type="button"
                class="link grow depot-name"
                onClick={() => setSelected(t.id === selected ? null : t.id)}
                title="Wybierz – do tego pociągu trafią kupowane i klikane wolne wagony"
              >
                {t.id === selected ? '◉' : '○'} {t.name}
                {!t.stopped && <span class="status small"> · {t.status}</span>}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.openTrain(t.id);
                }}
                title="Okno pociągu (rozkład jazdy, wymiana lokomotywy)"
              >
                Rozkład
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.cloneTrain(t.id);
                }}
                title="Kup taki sam pociąg ze wspólnym rozkładem"
              >
                ⧉
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.sellTrain(t.id);
                }}
                title={`Sprzedaj cały pociąg (+${formatMoney(t.resale)})`}
              >
                Sprzedaj
              </button>
            </div>
            <div class="vehicle-strip">
              {Array.from({ length: t.engineCount }, (_, k) => (
                <button
                  key={`e${k}`}
                  type="button"
                  class="veh"
                  draggable
                  onDragStart={startDrag({ from: 'engine', trainId: t.id, k })}
                  title={`${engineDef(t.engine)!.name}${k > 0 ? ' (druga – przeciągnij do kosza, by sprzedać)' : ' – przeciągnij do kosza, by sprzedać lokomotywę'}`}
                >
                  <VehicleIcon type={t.engine} engine pal={pal} />
                </button>
              ))}
              {t.wagons.map((w, i) => (
                <button
                  key={i}
                  class="veh"
                  draggable
                  onDragStart={startDrag({ from: 'wagon', trainId: t.id, index: i })}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.detachWagon(t.id, i);
                  }}
                  title={`${wagonDef(w)!.name} – klik: odepnij do wolnych wagonów; albo przeciągnij`}
                >
                  <VehicleIcon type={w} engine={false} pal={pal} />
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div class={`depot-row spare-row ${hover === 'spare' ? 'drop' : ''}`} {...dropZone('spare', dropOnSpare)}>
        <div class="muted small">
          Wolne wagony
          {spareCount > 0 && (target ? ` – klik: doczep do ${target.name}` : ' – wybierz pociąg albo przeciągnij na niego')}
        </div>
        <div class="vehicle-strip">
          {spareCount === 0 && <span class="muted small">brak</span>}
          {data.spare.map((w, i) => (
            <button
              key={i}
              class="veh"
              draggable
              disabled={!!target && target.wagons.length >= MAX_WAGONS}
              onDragStart={startDrag({ from: 'spare', index: i })}
              onClick={() => target && actions.attachWagon(target.id, i)}
              title={`${wagonDef(w.type)!.name}${w.amount ? ` (ładunek ${w.amount})` : ''} · zwrot ${formatMoney(w.resale)}`}
            >
              <VehicleIcon type={w.type} engine={false} pal={vehiclePal(target?.engine)} loaded={w.amount > 0} />
            </button>
          ))}
        </div>
      </div>

      <div class="buttons">
        <button class={buyOpen ? 'active' : 'primary'} onClick={() => setBuyOpen(!buyOpen)}>
          {buyOpen ? '▾ Nowe pojazdy' : '▸ Nowe pojazdy'}
        </button>
        <span
          class={`depot-bin ${hover === 'bin' ? 'drop' : ''}`}
          {...dropZone('bin', dropOnBin)}
          title="Przeciągnij tu pojazd, aby go sprzedać"
        >
          🗑 Sprzedaj
        </span>
      </div>

      {buyOpen && <BuyVehicles data={data} money={money} actions={actions} target={target} />}
    </div>
  );
}

/** Lista pojazdów do kupienia (jak okno „Nowe pojazdy” w OpenTTD) – lokomotywy i wagony w jednym miejscu. */
function BuyVehicles({
  data,
  money,
  actions,
  target,
}: {
  data: DepotWindowData;
  money: number;
  actions: HudActions;
  target: TrainSummary | null;
}) {
  const engines = availableEngines(data.year);
  const [tab, setTab] = useState<'engines' | 'wagons'>('engines');
  const [pickedEngine, setEngine] = useState(engines[0]?.id ?? '');
  const [pickedWagon, setWagon] = useState(WAGONS[0]!.id);
  // Wybrana lokomotywa mogła wyjść ze sprzedaży (nowy rok) – wtedy pierwsza dostępna.
  const engine = engines.find((e) => e.id === pickedEngine) ?? engines[0]!;
  const wagon = wagonDef(pickedWagon)!;
  const pal = vehiclePal(engine.id);

  return (
    <div class="buy-panel">
      <div class="buttons">
        <button class={tab === 'engines' ? 'active' : ''} onClick={() => setTab('engines')}>
          Lokomotywy
        </button>
        <button class={tab === 'wagons' ? 'active' : ''} onClick={() => setTab('wagons')}>
          Wagony
        </button>
      </div>

      {tab === 'engines' && (
        <>
          <div class="buy-list">
            {TRACTIONS.map((traction) => {
              const list = engines.filter((e) => e.traction === traction);
              if (!list.length) return null;
              return (
                <div key={traction}>
                  <div class="muted small">{TRACTION_TITLES[traction]}</div>
                  {list.map((e) => (
                    <button key={e.id} class={`buy-item ${e.id === engine.id ? 'active' : ''}`} onClick={() => setEngine(e.id)}>
                      <span class="buy-icon">
                        <VehicleIcon type={e.id} engine pal={vehiclePal(e.id)} />
                      </span>
                      <span class="grow">
                        {e.name}
                        {data.year - e.year <= 1 && <span class="badge">nowość</span>}
                        {e.retire !== undefined && e.retire - data.year <= 2 && <span class="badge old">wkrótce wycofana</span>}
                      </span>
                      <small>{formatMoney(e.cost)}</small>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <div class="buy-detail">
            <div class="row">
              <VehicleIcon type={engine.id} engine pal={pal} />
              <b class="grow">{engine.name}</b>
            </div>
            <div class="muted small">{engine.description}</div>
            <div class="small">
              {engine.maxSpeed} km/h · {engine.power} kW · {engine.weight} t · trakcja {TRACTION_NAMES[engine.traction]}
            </div>
            <div class="small">
              Cena {formatMoney(engine.cost)} · utrzymanie {formatMoney(engineRunningCost(engine))}/rok · od {engine.year}
              {engine.retire ? ` do ${engine.retire - 1}` : ''}
            </div>
            {engine.traction === 'electric' && (
              <div class={data.electrified ? 'muted small' : 'warning'}>
                {data.electrified
                  ? 'Lokomotywa elektryczna – jeździ tylko pod siecią trakcyjną.'
                  : 'Ta zajezdnia nie ma sieci trakcyjnej – pociąg elektryczny z niej nie wyjedzie. Zbuduj sieć narzędziem Trakcja (E).'}
              </div>
            )}
            <div class="buttons wrap">
              <button
                class="primary"
                disabled={engine.cost > money}
                onClick={() => actions.buyTrain(data.depotId, engine.id, [], 1)}
                title="Nowy pociąg w zajezdni – wagony doczepisz z wolnych albo kupisz w zakładce Wagony"
              >
                Kup – nowy pociąg
              </button>
              {target && target.engine === engine.id && target.engineCount < MAX_ENGINES && (
                <button
                  disabled={engine.cost > money}
                  onClick={() => actions.setEngineCount(target.id, target.engineCount + 1)}
                  title="Podwójna trakcja: druga taka sama lokomotywa – 2× moc i przyczepność (ciężkie składy pod górę), 2× utrzymanie"
                >
                  Kup jako 2. lokomotywę do {target.name}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'wagons' && (
        <>
          <div class="buy-list">
            {WAGONS.map((w) => (
              <button key={w.id} class={`buy-item ${w.id === wagon.id ? 'active' : ''}`} onClick={() => setWagon(w.id)}>
                <span class="buy-icon">
                  <VehicleIcon type={w.id} engine={false} pal={vehiclePal(target?.engine)} />
                </span>
                <span class="grow">{w.name}</span>
                <small>{formatMoney(w.cost)}</small>
              </button>
            ))}
          </div>
          <div class="buy-detail">
            <div class="row">
              <VehicleIcon type={wagon.id} engine={false} pal={vehiclePal(target?.engine)} />
              <b class="grow">{wagon.name}</b>
            </div>
            <div class="small">
              Ładowność {wagon.capacity} ({CARGO_NAMES[wagon.cargo]}) · {wagon.weight} t
            </div>
            <div class="small">
              Cena {formatMoney(wagon.cost)} · utrzymanie {formatMoney(wagonRunningCost(wagon))}/rok
            </div>
            <div class="buttons wrap">
              {target && (
                <button
                  class="primary"
                  disabled={wagon.cost > money || target.wagons.length >= MAX_WAGONS}
                  onClick={() => {
                    actions.buyWagon(data.depotId, wagon.id);
                    actions.attachWagon(target.id, data.spare.length);
                  }}
                  title={target.wagons.length >= MAX_WAGONS ? `Najwyżej ${MAX_WAGONS} wagonów` : undefined}
                >
                  Kup i doczep do {target.name}
                </button>
              )}
              <button
                class={target ? '' : 'primary'}
                disabled={wagon.cost > money}
                onClick={() => actions.buyWagon(data.depotId, wagon.id)}
              >
                Kup do wolnych wagonów
              </button>
            </div>
            {!target && (
              <div class="muted small">Wybierz pociąg (klik na jego nazwę), żeby kupowane wagony od razu się doczepiały.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
