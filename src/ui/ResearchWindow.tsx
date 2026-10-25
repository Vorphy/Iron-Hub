import { formatMoney } from '../tools';
import type { HudActions, ResearchWindowData } from './hudStore';

/**
 * Badania: kierunki ulepszeń z poziomami (kropki), cena i czas następnego poziomu, jedno badanie naraz
 * z paskiem postępu. Pieniądze płaci się z góry; przerwanie zwraca część.
 */
export function ResearchWindow({ data, money, actions }: { data: ResearchWindowData; money: number; actions: HudActions }) {
  const cur = data.current;
  return (
    <div class="panel window research-window">
      <div class="window-head">
        <span class="window-title">Badania</span>
        <button class="close" title="Pomoc: badania" onClick={() => actions.openHelp('research')}>
          ?
        </button>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
          ✕
        </button>
      </div>
      <div class="muted small">
        Jedno badanie naraz: płacisz z góry, po kilku tygodniach gry ulepszenie działa na wszystkie pociągi i stacje.
      </div>

      {cur ? (
        <div class="research-current">
          <div class="row">
            <b class="grow">
              {cur.name} – poziom {cur.level}
            </b>
            <span class="small">zostało {cur.daysLeft} d.</span>
          </div>
          <div class="progress">
            <div class="progress-bar" style={{ width: `${Math.round(cur.progress * 100)}%` }} />
          </div>
          <button onClick={actions.cancelResearch} title="Badanie przepada, wraca połowa ceny">
            Przerwij <small>+{formatMoney(cur.refund)}</small>
          </button>
        </div>
      ) : (
        <div class="muted small">Teraz nic nie jest badane – wybierz kierunek poniżej.</div>
      )}

      {data.items.map((r) => (
        <div class={`research-item ${cur?.id === r.id ? 'active' : ''}`} key={r.id}>
          <div class="row">
            <b class="grow">{r.name}</b>
            <span class="pips" title={`Poziom ${r.level} z ${r.maxLevel}`}>
              {Array.from({ length: r.maxLevel }, (_, k) => (
                <span key={k} class={k < r.level ? 'pip on' : 'pip'} />
              ))}
            </span>
          </div>
          <div class="small">{r.effect} (za poziom)</div>
          {r.next ? (
            <div class="row">
              <span class="muted small grow">
                Poziom {r.level + 1}: {formatMoney(r.next.cost)} · {r.next.days} dni
              </span>
              <button
                class="primary"
                disabled={!!cur || r.next.cost > money}
                title={cur ? 'Trwa inne badanie' : r.next.cost > money ? 'Brak pieniędzy' : 'Zacznij badanie'}
                onClick={() => actions.startResearch(r.id)}
              >
                Badaj
              </button>
            </div>
          ) : (
            <div class="muted small">Maksymalny poziom.</div>
          )}
        </div>
      ))}
    </div>
  );
}
