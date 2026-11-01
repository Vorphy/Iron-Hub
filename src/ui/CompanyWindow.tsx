// Okno Firma (F): historia przedsiębiorstwa – bilans okresu jako wykres Sankeya, wskaźniki,
// wykresy lat i tabela roczna. Dane: companyWindowData (windowData.ts), zbierane od v36 zapisu.
import { useState } from 'preact/hooks';
import { formatMoney } from '../tools';
import type { CompanyLedger, CompanyWindowData, CompanyYear, HudActions } from './hudStore';
import {
  CARGO_CHART_COLORS,
  formatShort,
  layoutSankey,
  ledgerProfit,
  ledgerSankey,
  type PlacedNode,
  SANKEY_NODE_W,
} from './sankey';

type Tab = 'balance' | 'years';
/** Okres w zakładce Bilans: indeks roku albo cała historia. */
type Period = number | 'all';

const SERIES = {
  income: { name: 'Przychody', color: CARGO_CHART_COLORS.passengers },
  expenses: { name: 'Wydatki', color: CARGO_CHART_COLORS.mail },
  profit: { name: 'Zysk', color: CARGO_CHART_COLORS.coal },
  value: { name: 'Wartość firmy', color: CARGO_CHART_COLORS.passengers },
};

const expensesOf = (l: CompanyLedger) => l.trains + l.infrastructure + l.construction + l.interest;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const yearLabel = (y: CompanyYear) =>
  y.current ? `${y.year} (do teraz)` : y.months < 12 ? `${y.year} (${y.months} mies.)` : `${y.year}`;

/** Suma bilansów kilku lat (zakładka Bilans → „Od założenia”). */
function sumLedgers(years: CompanyYear[]): CompanyLedger {
  const cargo = new Map<string, { cargo: CompanyLedger['cargo'][number]['cargo']; income: number; amount: number }>();
  const out: CompanyLedger = { cargo: [], income: 0, trains: 0, infrastructure: 0, construction: 0, interest: 0 };
  for (const { ledger: l } of years) {
    out.income += l.income;
    out.trains += l.trains;
    out.infrastructure += l.infrastructure;
    out.construction += l.construction;
    out.interest += l.interest;
    for (const c of l.cargo) {
      const t = cargo.get(c.cargo) ?? { cargo: c.cargo, income: 0, amount: 0 };
      t.income += c.income;
      t.amount += c.amount;
      cargo.set(c.cargo, t);
    }
  }
  out.cargo = [...cargo.values()].sort((a, b) => b.income - a.income);
  return out;
}

export function CompanyWindow({ data, actions }: { data: CompanyWindowData; actions: HudActions }) {
  const [tab, setTab] = useState<Tab>('balance');
  return (
    <div class="panel window wide company">
      <div class="window-head">
        <span class="window-title">Firma · {data.companyName}</span>
        <button class="close" title="Pomoc do tego okna" onClick={() => actions.openHelp('company')}>
          ?
        </button>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
          ✕
        </button>
      </div>
      <div class="buttons">
        <button class={tab === 'balance' ? 'active' : ''} onClick={() => setTab('balance')}>
          Bilans
        </button>
        <button class={tab === 'years' ? 'active' : ''} onClick={() => setTab('years')}>
          Lata
        </button>
      </div>
      {tab === 'balance' ? <BalanceTab years={data.years} /> : <YearsTab years={data.years} />}
    </div>
  );
}

function BalanceTab({ years }: { years: CompanyYear[] }) {
  const [period, setPeriod] = useState<Period>(years.length - 1);
  const index = period === 'all' ? null : Math.min(period, years.length - 1);
  const ledger = index === null ? sumLedgers(years) : years[index]!.ledger;
  const current = years.at(-1)!;
  const previous = years.at(-2);
  const profit = ledgerProfit(ledger);
  const label = index === null ? `od założenia (${years[0]!.year}–${current.year})` : yearLabel(years[index]!);
  return (
    <>
      <div class="kpis">
        <Kpi
          title="Wartość firmy"
          value={formatShort(current.companyValue)}
          delta={previous ? current.companyValue - previous.companyValue : null}
          note={previous ? `od końca ${previous.year}` : 'gotówka − kredyt + pociągi'}
        />
        <Kpi title="Zysk" value={formatShort(profit)} tone={profit >= 0 ? 'pos' : 'neg'} note={label} />
        <Kpi
          title="Marża"
          value={ledger.income > 0 ? pct((ledger.income - ledger.trains - ledger.infrastructure) / ledger.income) : '—'}
          note="po kosztach bieżących"
        />
        <Kpi title="Przychody" value={formatShort(ledger.income)} note={label} />
      </div>

      <div class="row period">
        <button
          disabled={index === 0}
          title="Rok wcześniej"
          onClick={() => setPeriod(index === null ? years.length - 1 : Math.max(0, index - 1))}
        >
          ◂
        </button>
        <span class="grow center">{label}</span>
        <button
          disabled={index === null || index === years.length - 1}
          title="Rok później"
          onClick={() => index !== null && setPeriod(Math.min(years.length - 1, index + 1))}
        >
          ▸
        </button>
        <button class={index === null ? 'active' : ''} onClick={() => setPeriod(index === null ? years.length - 1 : 'all')}>
          Od założenia
        </button>
      </div>
      <Sankey ledger={ledger} />
    </>
  );
}

function Kpi({
  title,
  value,
  note,
  delta = null,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  delta?: number | null;
  tone?: 'pos' | 'neg';
}) {
  return (
    <div class="kpi">
      <div class="kpi-title">{title}</div>
      <div class={`kpi-value ${tone ?? ''}`}>{value}</div>
      {delta !== null && (
        <div class={`kpi-delta ${delta >= 0 ? 'pos' : 'neg'}`}>
          {delta >= 0 ? '▲' : '▼'} {formatShort(Math.abs(delta))}
        </div>
      )}
      <div class="kpi-note">{note}</div>
    </div>
  );
}

interface Tip {
  x: number;
  y: number;
  lines: string[];
}

function Sankey({ ledger }: { ledger: CompanyLedger }) {
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const input = ledgerSankey(ledger);
  if (!input) return <div class="muted small">Brak przychodów i wydatków w tym okresie.</div>;
  const L = layoutSankey(input);
  const share = (v: number) => (L.total > 0 ? ` (${pct(v / L.total)})` : '');
  const nodeTip = (n: PlacedNode) => [`${n.label}: ${formatMoney(n.value)}${share(n.value)}`, ...(n.note ? [n.note] : [])];
  const byId = new Map([...L.sources, ...L.targets].map((n) => [n.id, n]));
  // Podpowiedź po `data-tip` elementu pod kursorem (wstęga albo węzeł) – jeden nasłuch na całym wykresie.
  const tipLines = (id: string): string[] => {
    if (id === 'center') return [`${L.center.label}: ${formatMoney(L.total)}`];
    const link = L.links.find((l) => l.id === id);
    const node = byId.get(link ? (link.from === 'center' ? link.to : link.from) : id);
    return node ? nodeTip(node) : [];
  };
  const onMove = (e: MouseEvent) => {
    const id = (e.target as Element).getAttribute('data-tip');
    if (!id) return hide();
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    setHover(id);
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines: tipLines(id) });
  };
  const hide = () => {
    setHover(null);
    setTip(null);
  };
  const dim = (ids: string[]) => (hover && !ids.includes(hover) ? ' dim' : '');

  return (
    <div class="chart">
      <svg
        viewBox={`0 0 ${L.width} ${L.height}`}
        role="img"
        aria-label={`Bilans: ${input.sources.map((n) => `${n.label} ${formatMoney(n.value)}`).join(', ')} → ${input.targets.map((n) => `${n.label} ${formatMoney(n.value)}`).join(', ')}`}
        onMouseMove={onMove}
        onMouseLeave={hide}
      >
        {L.links.map((link) => {
          const node = byId.get(link.from === 'center' ? link.to : link.from)!;
          return (
            <path
              key={link.id}
              d={link.path}
              fill={link.color}
              class={`sankey-link${dim([link.id, node.id])}`}
              data-tip={link.id}
            />
          );
        })}
        {[...L.sources, ...L.targets].map((n) => (
          <rect
            key={n.id}
            x={n.x}
            y={n.y}
            width={SANKEY_NODE_W}
            height={n.h}
            rx={2}
            fill={n.color}
            class={`sankey-node${dim([n.id, `${n.id}>center`, `center>${n.id}`])}`}
            data-tip={n.id}
          />
        ))}
        <rect
          x={L.center.x}
          y={L.center.y}
          width={SANKEY_NODE_W}
          height={L.center.h}
          rx={2}
          fill={L.center.color}
          data-tip="center"
        />
        <text x={L.center.x + SANKEY_NODE_W / 2} y={L.center.labelY} text-anchor="middle" class="sankey-label">
          {L.center.label} · {formatShort(L.total)}
        </text>
        {L.sources.map((n) => (
          <NodeLabel key={n.id} n={n} x={n.x - 6} anchor="end" />
        ))}
        {L.targets.map((n) => (
          <NodeLabel key={n.id} n={n} x={n.x + SANKEY_NODE_W + 6} anchor="start" />
        ))}
      </svg>
      {tip && (
        <div class="chart-tip" style={{ left: `${tip.x + 12}px`, top: `${tip.y + 12}px` }}>
          {tip.lines.map((l, i) => (
            <div key={i} class={i ? 'muted' : ''}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeLabel({ n, x, anchor }: { n: PlacedNode; x: number; anchor: 'start' | 'end' }) {
  return (
    <text x={x} y={n.labelY} text-anchor={anchor} class="sankey-label">
      <tspan x={x} dy="-0.2em">
        {n.label}
      </tspan>
      <tspan x={x} dy="1.15em" class="sankey-value">
        {formatShort(n.value)}
      </tspan>
    </text>
  );
}

function YearsTab({ years }: { years: CompanyYear[] }) {
  const labels = years.map((y) => (y.current ? `${y.year}*` : `${y.year}`));
  return (
    <>
      {years.length < 2 ? (
        <div class="muted small">
          Wykresy lat pojawią się po zamknięciu pierwszego roku – historia firmy zbiera się od {years[0]!.year} r.
        </div>
      ) : (
        <>
          <LineChart
            title="Przychody, wydatki i zysk w kolejnych latach (zł)"
            partialLast
            labels={labels}
            series={[
              { ...SERIES.income, values: years.map((y) => y.ledger.income) },
              { ...SERIES.expenses, values: years.map((y) => expensesOf(y.ledger)) },
              { ...SERIES.profit, values: years.map((y) => ledgerProfit(y.ledger)) },
            ]}
          />
          <LineChart
            title="Wartość firmy na koniec roku (zł)"
            partialLast
            labels={labels}
            series={[{ ...SERIES.value, values: years.map((y) => y.companyValue) }]}
          />
          <div class="muted small">* bieżący rok – do teraz (linia przerywana).</div>
        </>
      )}
      <div class="table-scroll">
        <table class="ledger">
          <thead>
            <tr>
              <th>Rok</th>
              <th>Przychody (zł)</th>
              <th>Wydatki</th>
              <th>Zysk</th>
              <th>Marża</th>
              <th>Wartość</th>
              <th>Pociągi</th>
            </tr>
          </thead>
          <tbody>
            {[...years].reverse().map((y) => {
              const p = ledgerProfit(y.ledger);
              const l = y.ledger;
              return (
                <tr key={y.year}>
                  <td>{yearLabel(y)}</td>
                  <td>{formatAxis(l.income)}</td>
                  <td>{formatAxis(expensesOf(l))}</td>
                  <td class={p >= 0 ? 'pos' : 'neg'}>{formatAxis(p)}</td>
                  <td>{l.income > 0 ? pct((l.income - l.trains - l.infrastructure) / l.income) : '—'}</td>
                  <td>{formatAxis(y.companyValue)}</td>
                  <td>{y.trains}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** „Ładne” podziałki osi: 1, 2 albo 5 × 10^n. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  if (out.at(-1)! < max) out.push(out.at(-1)! + step);
  return out;
}

interface Series {
  name: string;
  color: string;
  values: number[];
}

/** Podpis osi bez „zł” (jednostka w tytule wykresu). */
function formatAxis(v: number): string {
  return formatShort(v).replace(' zł', '');
}

function LineChart({
  title,
  labels,
  series,
  partialLast = false,
}: {
  title: string;
  labels: string[];
  series: Series[];
  /** Ostatni punkt to niepełny rok – linia do niego przerywana. */
  partialLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520;
  const H = 170;
  const m = { l: 62, r: 22, t: 8, b: 22 };
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0]!;
  const hi = ticks.at(-1)!;
  const n = labels.length;
  const x = (i: number) => m.l + (n === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (n - 1));
  const y = (v: number) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo || 1);
  // Podpisy osi X: najwyżej ok. 8, zawsze pierwszy i ostatni.
  const every = Math.ceil(n / 8);
  const onMove = (e: MouseEvent) => {
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = n === 1 ? 0 : Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div class="chart">
      <div class="chart-head">
        <span class="chart-title">{title}</span>
        {series.length > 1 && (
          <span class="legend">
            {series.map((s) => (
              <span key={s.name} class="legend-item">
                <span class="swatch" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} class={t === 0 ? 'axis-zero' : 'grid'} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" text-anchor="end" class="axis-label">
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={l} x={x(i)} y={H - 6} text-anchor={i === n - 1 && n > 1 ? 'end' : 'middle'} class="axis-label">
              {l}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} class="crosshair" />}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              points={s.values
                .slice(0, partialLast ? -1 : undefined)
                .map((v, i) => `${x(i)},${y(v)}`)
                .join(' ')}
              fill="none"
              stroke={s.color}
              stroke-width={2}
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            {/* Bieżący rok (niepełny) – przerywana linia. */}
            {partialLast && n > 1 && (
              <line
                x1={x(n - 2)}
                y1={y(s.values[n - 2]!)}
                x2={x(n - 1)}
                y2={y(s.values[n - 1]!)}
                stroke={s.color}
                stroke-width={2}
                stroke-dasharray="4 4"
                stroke-linecap="round"
              />
            )}
            {s.values.map((v, i) =>
              hover === i || n <= 12 ? (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.5} fill={s.color} class="dot" />
              ) : null,
            )}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div class={`chart-tip fixed-tip ${hover > n / 2 ? 'left' : 'right'}`}>
          <div>{labels[hover]!.replace('*', ' (do teraz)')}</div>
          {series.map((s) => (
            <div key={s.name} class="tip-row">
              <span class="swatch" style={{ background: s.color }} />
              <span class="grow">{s.name}</span>
              <b>{formatShort(s.values[hover]!)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
