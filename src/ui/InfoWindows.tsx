import { CARGO_DEFS } from '../sim/economy/cargo';
import type { HudActions, IndustryWindowData, StationWindowData, TownWindowData } from './hudStore';

function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Head({ title, actions }: { title: string; actions: HudActions }) {
  return (
    <div class="window-head">
      <span class="window-title">{title}</span>
      <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
        ✕
      </button>
    </div>
  );
}

export function TownWindow({ data: t, actions }: { data: TownWindowData; actions: HudActions }) {
  return (
    <div class="panel window">
      <Head title={t.name} actions={actions} />
      <div class="row">
        <span class="grow">Mieszkańcy</span>
        <b>{t.population.toLocaleString('pl-PL')}</b>
      </div>
      <div class="row">
        <span class="grow">Budynki</span>
        <span>{t.houses}</span>
      </div>
      <div class="section-title">W tym miesiącu</div>
      <div class="row">
        <span class="grow">Pasażerowie (przewiezieni / wszyscy)</span>
        <span>
          {t.passengersTransported} / {t.passengers}
        </span>
      </div>
      <div class="row">
        <span class="grow">Poczta (przewieziona / wszystka)</span>
        <span>
          {t.mailTransported} / {t.mail}
        </span>
      </div>
      <div class="muted small">
        Poprzedni miesiąc: przewieziono {percent(t.lastTransported)} pasażerów. Miasto rośnie szybciej, gdy obsługują
        je pociągi – nowe domy pojawiają się w pobliżu stacji.
      </div>
    </div>
  );
}

export function IndustryWindow({ data: d, actions }: { data: IndustryWindowData; actions: HudActions }) {
  const primary = d.accepts.length === 0;
  return (
    <div class="panel window">
      <Head title={d.name} actions={actions} />
      <div class="row">
        <span class="grow">Poziom</span>
        <b>
          {d.level} / {d.maxLevel}
        </b>
      </div>
      <div class="level-bar" title="Punkty rozwoju: +12 – poziom w górę, −12 – w dół">
        <span class="level-fill" style={{ width: `${Math.min(100, Math.abs(d.growth) / 12 * 100)}%`, background: d.growth >= 0 ? '#9fdc7c' : '#ff9a85' }} />
      </div>
      <div class="muted small">
        Rozwój: {d.growth > 0 ? '+' : ''}
        {d.growth} / ±12 pkt
      </div>

      {d.produces && (
        <>
          <div class="section-title">Produkuje</div>
          <div class="row">
            <span class="swatch" style={{ background: CARGO_DEFS[d.produces].color }} />
            <span class="grow">{CARGO_DEFS[d.produces].name}</span>
            <span>
              {d.production} {CARGO_DEFS[d.produces].unit}/mies.
            </span>
          </div>
          <div class="muted small">
            W tym miesiącu: wyprodukowano {d.produced}, wywieziono {d.transported}
          </div>
        </>
      )}

      {!primary && (
        <>
          <div class="section-title">Przyjmuje</div>
          {d.accepts.map((a) => (
            <div class="row" key={a.cargo}>
              <span class="swatch" style={{ background: CARGO_DEFS[a.cargo].color }} />
              <span class="grow">{CARGO_DEFS[a.cargo].name}</span>
              <span>
                {a.delivered} / {a.demand} {CARGO_DEFS[a.cargo].unit}
              </span>
            </div>
          ))}
        </>
      )}

      <div class="section-title">{primary ? 'Wywóz' : 'Zaopatrzenie'} (3 miesiące)</div>
      <div class={d.supply === null ? 'muted' : d.supply >= 0.75 ? 'status' : d.supply <= 0.5 ? 'status bad' : ''}>
        {d.supply === null ? 'brak danych' : percent(d.supply)}
      </div>
      <div class="muted small">
        Od 75% zakład rośnie, poniżej 50% powoli podupada. {primary ? '' : 'Bez dostaw pracuje na 30% mocy.'}
      </div>
    </div>
  );
}

export function StationWindow({ data: d, actions }: { data: StationWindowData; actions: HudActions }) {
  return (
    <div class="panel window">
      <Head title={d.name} actions={actions} />
      <div class="muted small">Peronów (kafelków): {d.platforms}</div>

      <div class="section-title">Czeka na odbiór</div>
      {d.cargo.length === 0 && (
        <div class="muted small">
          Nic – stacja zaczyna zbierać ładunek, gdy zatrzyma się na niej pociąg z odpowiednim wagonem.
        </div>
      )}
      {d.cargo.map((c) => (
        <div class="row" key={c.cargo}>
          <span class="swatch" style={{ background: CARGO_DEFS[c.cargo].color }} />
          <span class="grow">{CARGO_DEFS[c.cargo].name}</span>
          <span>
            {c.waiting} {CARGO_DEFS[c.cargo].unit}
          </span>
          <span
            class={c.rating >= 0.75 ? 'rating good' : c.rating > 0 ? 'rating' : 'rating bad'}
            title="Ocena stacji: jaka część produkcji trafia na stację (zależy od częstości kursów)"
          >
            {c.rating > 0 ? percent(c.rating) : 'brak obsługi'}
          </span>
        </div>
      ))}

      <div class="section-title">Przyjmuje</div>
      <div class="muted small">
        {d.accepts.length ? d.accepts.map((c) => CARGO_DEFS[c].name).join(', ') : 'nic – w zasięgu nie ma odbiorców'}
      </div>
    </div>
  );
}
