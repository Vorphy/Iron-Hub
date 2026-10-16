import { CARGO_DEFS } from '../sim/economy/cargo';
import { engineDef, wagonDef } from '../sim/trains/vehicles';
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

      <div class="section-title">Rozkład jazdy</div>
      {t.orders.length === 0 && <div class="muted small">Brak stacji – pociąg jeździ przed siebie.</div>}
      {t.orders.map((o, i) => (
        <div class="row order" key={i}>
          <span class="order-mark">{i === t.currentOrder && !t.goToDepot ? '▶' : `${i + 1}.`}</span>
          <span class="grow">{o.name}</span>
          <button
            class="close"
            title="Usuń z rozkładu"
            onClick={() => actions.setOrders(id, [...t.orders.map((x) => x.stationId)].filter((_, j) => j !== i))}
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
