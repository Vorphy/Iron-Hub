import { useState } from 'preact/hooks';
import { CARGO_DEFS } from '../sim/economy/cargo';
import { COMPANY_NAME_MAX } from '../sim/state';
import { formatMoney } from '../tools';
import type { FinanceWindowData, HudActions, IndustryWindowData, StationWindowData, TownWindowData } from './hudStore';

function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Head({ title, help, actions }: { title: string; help: string; actions: HudActions }) {
  return (
    <div class="window-head">
      <span class="window-title">{title}</span>
      <button class="close" title="Pomoc do tego okna" onClick={() => actions.openHelp(help)}>
        ?
      </button>
      <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
        ✕
      </button>
    </div>
  );
}

/** Metro w dużym mieście (od 5 000 mieszkańców). */
const METRO_TEXT = {
  metro: '🚇 Miasto ma metro – rośnie i rozbudowuje się szybciej.',
  wanted: '🚇 Miasto domaga się metra. Bez stacji metra przestanie rosnąć powyżej 10 000 mieszkańców.',
  stalled: '🚇 Rozwój wstrzymany – miasto powyżej 10 000 mieszkańców potrzebuje stacji metra.',
} as const;

export function TownWindow({ data: t, actions }: { data: TownWindowData; actions: HudActions }) {
  return (
    <div class="panel window">
      <Head title={t.name} help="towns" actions={actions} />
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
        Poprzedni miesiąc: przewieziono {percent(t.lastTransported)} pasażerów. Miasto rośnie szybciej, gdy obsługują je pociągi –
        nowe domy pojawiają się w pobliżu stacji.
      </div>
      {t.metro !== 'small' && <div class={`small metro-${t.metro}`}>{METRO_TEXT[t.metro]}</div>}
    </div>
  );
}

export function IndustryWindow({ data: d, actions }: { data: IndustryWindowData; actions: HudActions }) {
  const primary = d.accepts.length === 0;
  return (
    <div class="panel window">
      <Head title={d.name} help="industries" actions={actions} />
      <div class="row">
        <span class="grow">Poziom</span>
        <b>
          {d.level} / {d.maxLevel}
        </b>
      </div>
      <div class="level-bar" title="Punkty rozwoju: +12 – poziom w górę, −12 – w dół">
        <span
          class="level-fill"
          style={{
            width: `${Math.min(100, (Math.abs(d.growth) / 12) * 100)}%`,
            background: d.growth >= 0 ? '#9fdc7c' : '#ff9a85',
          }}
        />
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
  if (d.waypoint) {
    return (
      <div class="panel window">
        <Head title={d.name} help="orders" actions={actions} />
        <div class="muted small">
          Punkt kontrolny – dodaj go do rozkładu, a pociąg pojedzie tym torem i nie zatrzyma się. Nie zbiera ładunku. Buldożer
          usuwa sam znacznik, tor zostaje.
        </div>
      </div>
    );
  }
  return (
    <div class="panel window">
      <Head title={d.name} help="rating" actions={actions} />
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

/** Nazwa firmy z możliwością zmiany (Enter albo przycisk zapisuje). */
function CompanyName({ name, actions }: { name: string; actions: HudActions }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <div class="row">
        <span class="grow">
          Firma: <b>{name}</b>
        </span>
        <button onClick={() => setDraft(name)}>Zmień nazwę</button>
      </div>
    );
  }
  const save = () => {
    actions.renameCompany(draft);
    setDraft(null);
  };
  return (
    <div class="row">
      <input
        class="text grow"
        maxLength={COMPANY_NAME_MAX}
        value={draft}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setDraft(null);
          e.stopPropagation();
        }}
      />
      <button class="primary" onClick={save}>
        Zapisz
      </button>
      <button onClick={() => setDraft(null)}>Anuluj</button>
    </div>
  );
}

export function FinanceWindow({ data: d, money, actions }: { data: FinanceWindowData; money: number; actions: HudActions }) {
  const rows: { key: keyof FinanceWindowData['months'][number]; label: string; sign: 1 | -1 }[] = [
    { key: 'income', label: 'Przewozy', sign: 1 },
    { key: 'trains', label: 'Pociągi', sign: -1 },
    { key: 'infrastructure', label: 'Utrzymanie', sign: -1 },
    { key: 'construction', label: 'Budowa i zakupy', sign: -1 },
    { key: 'interest', label: 'Odsetki kredytu', sign: -1 },
  ];
  const months = d.months.slice(0, 4);
  const total = (m: FinanceWindowData['months'][number]) => m.income - m.trains - m.infrastructure - m.construction - m.interest;
  return (
    <div class="panel window wide">
      <Head title="Finanse" help="finance" actions={actions} />
      <CompanyName name={d.companyName} actions={actions} />
      <table class="ledger">
        <thead>
          <tr>
            <th />
            {months.map((m, i) => (
              <th key={i}>{i === 0 ? `${m.label} (teraz)` : m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              {months.map((m, i) => {
                const v = m[r.key] as number;
                return (
                  <td key={i} class={v === 0 ? 'muted' : r.sign * v > 0 ? 'pos' : 'neg'}>
                    {v === 0 ? '—' : `${r.sign * v > 0 ? '+' : '−'}${formatMoney(Math.abs(v))}`}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr class="total">
            <td>Razem</td>
            {months.map((m, i) => (
              <td key={i} class={total(m) >= 0 ? 'pos' : 'neg'}>
                {total(m) >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(total(m)))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div class="muted small">
        Koszty stałe co miesiąc: utrzymanie {formatMoney(d.infrastructurePerMonth)}, pociągi w trasie{' '}
        {formatMoney(d.trainsPerMonth)}. Pociągi w zajezdni nie generują kosztów.
      </div>

      <div class="section-title">Kredyt</div>
      <div class="row">
        <span class="grow">
          Zadłużenie <b>{formatMoney(d.loan)}</b> z {formatMoney(d.loanMax)}
        </span>
        <span class="muted">
          {Math.round(d.loanInterest * 100)}% rocznie · {formatMoney(d.interestPerMonth)} / mies.
        </span>
      </div>
      <div class="buttons wrap">
        <button disabled={d.loan >= d.loanMax} onClick={() => actions.borrow(d.loanStep)}>
          Pożycz {formatMoney(d.loanStep)}
        </button>
        <button disabled={d.loan >= d.loanMax} onClick={() => actions.borrow(d.loanMax - d.loan)}>
          Pożycz maksimum
        </button>
        <button disabled={d.loan <= 0 || money < Math.min(d.loanStep, d.loan)} onClick={() => actions.repay(d.loanStep)}>
          Spłać {formatMoney(Math.min(d.loanStep, d.loan || d.loanStep))}
        </button>
        <button
          disabled={d.loan <= 0 || money < d.loanStep}
          onClick={() => actions.repay(Math.min(d.loan, Math.floor(money / d.loanStep) * d.loanStep))}
        >
          Spłać ile się da
        </button>
      </div>
      {d.debtMonths > 0 ? (
        <div class="warning">
          Saldo ujemne na koniec miesiąca już {d.debtMonths}× z rzędu. Jeśli tak będzie {d.bankruptcyMonths}× – bankructwo i
          koniec gry. Weź kredyt, sprzedaj pociągi albo ogranicz koszty.
        </div>
      ) : (
        <div class="muted small">
          Ujemne saldo na koniec {d.bankruptcyMonths} miesięcy z rzędu oznacza bankructwo i koniec gry.
        </div>
      )}
    </div>
  );
}
