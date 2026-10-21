import { CARGO_DEFS } from '../sim/economy/cargo';
import { useState } from 'preact/hooks';
import { engineDef, TRACTION_NAMES, wagonDef } from '../sim/trains/vehicles';
import { formatMoney } from '../tools';
import type { HudActions, TrainWindowData } from './hudStore';

export function TrainWindow({ data: t, actions }: { data: TrainWindowData; actions: HudActions }) {
  const id = t.trainId;
  const running = !t.stopped;
  return (
    <div class="panel window">
      <div class="window-head">
        <span class="window-title">{t.name}</span>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
          ✕
        </button>
      </div>

      <div class="consist">
        <span class="chip engine" style={{ background: engineDef(t.engine)!.color }}>
          {engineDef(t.engine)!.name}
        </span>
        {t.wagons.map((w, i) => (
          <span key={i} class="chip static" style={{ background: wagonDef(w)!.color }}>
            {wagonDef(w)!.name.split(' ').pop()}
          </span>
        ))}
      </div>

      <div class={t.lost ? 'status bad' : 'status'}>{t.status}</div>
      {t.load.map((l) => (
        <div class="row small" key={l.cargo}>
          <span class="swatch" style={{ background: CARGO_DEFS[l.cargo].color }} />
          <span class="grow">{CARGO_DEFS[l.cargo].name}</span>
          <span>
            {l.amount} / {l.capacity} {CARGO_DEFS[l.cargo].unit}
          </span>
        </div>
      ))}
      {!t.inDepot && (
        <div class="muted small">
          Prędkość {t.speed} / {t.maxSpeed} km/h
        </div>
      )}

      <div class="buttons wrap">
        <button
          class={running ? '' : 'primary'}
          onClick={() => (running ? actions.stopTrain(id) : actions.startTrain(id))}
          title={t.inDepot ? 'Wyjazd z zajezdni' : running ? 'Zatrzymaj pociąg' : 'Wznów jazdę'}
        >
          {t.inDepot ? (running ? '■ Anuluj wyjazd' : '▶ Wyjedź') : running ? '■ Stop' : '▶ Start'}
        </button>
        <button disabled={t.inDepot} title="Zawróć (pociąg najpierw zahamuje)" onClick={() => actions.reverseTrain(id)}>
          ⟲ Zawróć
        </button>
        <button disabled={t.inDepot} class={t.goToDepot ? 'active' : ''} onClick={() => actions.sendToDepot(id)}>
          ⌂ Do zajezdni
        </button>
        <button disabled={t.inDepot} onClick={() => actions.focusTrain(id)}>
          ◎ Pokaż
        </button>
        {t.inDepot && (
          <button onClick={() => actions.sellTrain(id)}>
            Sprzedaj <small>+{formatMoney(t.resale)}</small>
          </button>
        )}
      </div>

      <EngineSection t={t} actions={actions} />

      <div class="section-title">Rozkład jazdy</div>
      {t.orders.length === 0 && <div class="muted small">Brak stacji – pociąg jeździ przed siebie.</div>}
      {t.orders.map((o, i) => (
        <div class="row order" key={i}>
          <span class="order-mark">{i === t.currentOrder && !t.goToDepot ? '▶' : `${i + 1}.`}</span>
          <span class="grow">{o.name}</span>
          <button
            class="close"
            title="Usuń z rozkładu"
            onClick={() =>
              actions.setOrders(
                id,
                [...t.orders.map((x) => x.stationId)].filter((_, j) => j !== i),
              )
            }
          >
            ✕
          </button>
        </div>
      ))}
      <div class="buttons wrap">
        <button class={t.picking ? 'active' : ''} onClick={() => actions.pickOrders(id)}>
          {t.picking ? 'Gotowe' : '+ Dodaj stacje'}
        </button>
        {t.orders.length > 0 && <button onClick={() => actions.setOrders(id, [])}>Wyczyść</button>}
      </div>
      {t.picking && <div class="muted small">Klikaj stacje na mapie – dopisują się na koniec rozkładu.</div>}
    </div>
  );
}

/** Lokomotywa: wiek, zwrot i wymiana na nowszą (wagony i rozkład zostają). */
function EngineSection({ t, actions }: { t: TrainWindowData; actions: HudActions }) {
  const current = engineDef(t.engine)!;
  // Domyślnie najszybsza dostępna lokomotywa tej samej trakcji, inaczej najszybsza w ogóle.
  const sorted = [...t.replaceOptions].sort((a, b) => engineDef(b.id)!.maxSpeed - engineDef(a.id)!.maxSpeed);
  const fallback = (sorted.find((o) => engineDef(o.id)!.traction === current.traction) ?? sorted[0])?.id ?? '';
  const [picked, setPicked] = useState('');
  const choice = t.replaceOptions.find((o) => o.id === picked) ?? t.replaceOptions.find((o) => o.id === fallback);
  return (
    <>
      <div class="section-title">Lokomotywa</div>
      <div class="row small">
        <span class="grow">
          {current.name} · {current.maxSpeed} km/h · {t.engineAge} {t.engineAge === 1 ? 'rok' : 'lat'}
        </span>
        <span class="muted">zwrot przy wymianie {formatMoney(t.tradeIn)}</span>
      </div>
      {t.replaceWith ? (
        <div class="row small">
          <span class="grow">
            Wymiana na <b>{engineDef(t.replaceWith)!.name}</b> w najbliższej zajezdni, potem powrót na trasę.
          </span>
          <button onClick={() => actions.replaceEngine(t.trainId, null)}>Anuluj</button>
        </div>
      ) : choice ? (
        <>
          <div class="row small">
            <select
              class="grow"
              value={choice.id}
              onChange={(e) => setPicked((e.target as HTMLSelectElement).value)}
              title="Nowa lokomotywa"
            >
              {sorted.map((o) => {
                const e = engineDef(o.id)!;
                return (
                  <option key={o.id} value={o.id}>
                    {e.name} – {TRACTION_NAMES[e.traction]}, {e.maxSpeed} km/h
                  </option>
                );
              })}
            </select>
          </div>
          <div class="buttons wrap">
            <button
              class="primary"
              onClick={() => actions.replaceEngine(t.trainId, choice.id)}
              title={
                t.inDepot ? 'Wymiana od razu' : 'Pociąg zjedzie do najbliższej zajezdni, wymieni lokomotywę i wróci na trasę'
              }
            >
              Wymień · dopłata {formatMoney(Math.max(0, choice.cost))}
            </button>
            {t.sameEngineTrains > 1 && (
              <button onClick={() => actions.replaceEngine(t.trainId, choice.id, true)}>
                Wymień we wszystkich ({t.sameEngineTrains}) z {current.name}
              </button>
            )}
          </div>
          {engineDef(choice.id)!.traction === 'electric' && (
            <div class="muted small">Elektryczna jeździ tylko pod siecią trakcyjną – zajezdnia i trasa muszą ją mieć.</div>
          )}
        </>
      ) : (
        <div class="muted small">Brak innych lokomotyw w sprzedaży.</div>
      )}
    </>
  );
}
