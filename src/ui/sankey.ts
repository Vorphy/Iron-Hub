// Wykres Sankeya dla okna Firma: źródła (ładunki) → węzeł środkowy → cele (wydatki i zysk).
// Sam układ (bez Preact), żeby dało się go przetestować. Rysowanie: CompanyWindow.tsx.
import { CARGO_DEFS } from '../sim/economy/cargo';
import type { CompanyLedger } from './hudStore';

export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  color: string;
  /** Dopisek w podpowiedzi, np. przewieziona ilość. */
  note?: string;
}

export interface SankeyInput {
  sources: SankeyNode[];
  center: { label: string; color: string };
  targets: SankeyNode[];
}

export interface PlacedNode extends SankeyNode {
  x: number;
  y: number;
  h: number;
  /** Środek podpisu (po rozsunięciu, żeby podpisy na siebie nie wchodziły). */
  labelY: number;
}

export interface PlacedLink {
  id: string;
  from: string;
  to: string;
  value: number;
  color: string;
  path: string;
}

export interface SankeyLayout {
  width: number;
  height: number;
  total: number;
  sources: PlacedNode[];
  center: PlacedNode;
  targets: PlacedNode[];
  links: PlacedLink[];
}

/** Kolory ładunków na wykresach – paleta sprawdzona na ciemnym tle okien (rozróżnialna też przy daltonizmie). */
export const CARGO_CHART_COLORS = {
  passengers: '#3987e5',
  mail: '#d95926',
  coal: '#199e70',
  ore: '#c98500',
  goods: '#d55181',
  wood: '#008300',
} as const;

/** Wydatki – neutralny szary (podpisane wprost), zysk i strata – kolory stanu. */
export const EXPENSE_COLOR = '#8b9099';
export const CENTER_COLOR = '#c3c2b7';
export const PROFIT_COLOR = '#0ca30c';
export const LOSS_COLOR = '#d03b3b';

export const formatShort = (v: number): string => {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln zł`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3).toLocaleString('pl-PL')} tys. zł`;
  return `${sign}${Math.round(a).toLocaleString('pl-PL')} zł`;
};

/** Zysk okresu jak w oknie Finanse: przychody − wszystkie wydatki (zwroty pomniejszają budowę). */
export function ledgerProfit(l: CompanyLedger): number {
  return l.income - l.trains - l.infrastructure - l.construction - l.interest;
}

/** Bilans okresu -> węzły Sankeya: skąd pieniądze przyszły i na co poszły. Pusty bilans – null. */
export function ledgerSankey(l: CompanyLedger): SankeyInput | null {
  const sources: SankeyNode[] = l.cargo
    .filter((c) => c.income > 0)
    .map((c) => ({
      id: c.cargo,
      label: CARGO_DEFS[c.cargo].name,
      value: c.income,
      color: CARGO_CHART_COLORS[c.cargo],
      note: `${c.amount.toLocaleString('pl-PL')} ${CARGO_DEFS[c.cargo].unit}`,
    }));
  // Przychód sprzed zbierania podziału na ładunki (gra wczytana ze starszej wersji).
  const unknown = l.income - sources.reduce((s, n) => s + n.value, 0);
  if (unknown >= 1) sources.push({ id: 'other', label: 'przewozy (bez podziału)', value: unknown, color: EXPENSE_COLOR });
  // Więcej sprzedano i rozebrano, niż kupiono i zbudowano – zwroty to wpływ.
  if (l.construction < 0)
    sources.push({ id: 'refunds', label: 'sprzedaż i rozbiórka', value: -l.construction, color: EXPENSE_COLOR });

  const targets: SankeyNode[] = [
    { id: 'trains', label: 'pociągi', value: l.trains, color: EXPENSE_COLOR, note: 'eksploatacja pociągów' },
    { id: 'infrastructure', label: 'utrzymanie', value: l.infrastructure, color: EXPENSE_COLOR, note: 'tory, stacje, zajezdnie' },
    { id: 'construction', label: 'budowa i zakupy', value: Math.max(0, l.construction), color: EXPENSE_COLOR },
    { id: 'interest', label: 'odsetki', value: l.interest, color: EXPENSE_COLOR, note: 'odsetki od kredytu' },
  ].filter((t) => t.value > 0);

  const inflow = sources.reduce((s, n) => s + n.value, 0);
  const outflow = targets.reduce((s, n) => s + n.value, 0);
  if (inflow <= 0 && outflow <= 0) return null;
  const profit = inflow - outflow;
  if (profit >= 1) targets.push({ id: 'profit', label: 'zysk', value: profit, color: PROFIT_COLOR });
  else if (profit <= -1) sources.push({ id: 'loss', label: 'strata (z kasy)', value: -profit, color: LOSS_COLOR });
  const center =
    profit < 0
      ? { label: 'wydatki', color: CENTER_COLOR }
      : { label: l.construction < 0 ? 'wpływy' : 'przychody', color: CENTER_COLOR };
  return { sources, center, targets };
}

const NODE_W = 10;
/** Miejsce na podpisy po bokach (dwie linijki: nazwa i kwota). */
const LABEL_W = 104;
const GAP = 8;
/** Najmniejszy odstęp między środkami podpisów. */
const LABEL_STEP = 26;
const TOP = 22;

/**
 * Układ: trzy kolumny węzłów (wysokość ∝ wartości), wstęgi jako krzywe Béziera.
 * Kolejność węzłów jak w danych (ładunki od największego, wydatki, zysk na końcu).
 */
export function layoutSankey(input: SankeyInput, width = 520, plotHeight = 220): SankeyLayout {
  const total = Math.max(
    input.sources.reduce((s, n) => s + n.value, 0),
    input.targets.reduce((s, n) => s + n.value, 0),
  );
  const maxCount = Math.max(input.sources.length, input.targets.length, 1);
  const scale = total > 0 ? (plotHeight - GAP * (maxCount - 1)) / total : 0;
  const xs = { left: LABEL_W, center: (width - NODE_W) / 2, right: width - LABEL_W - NODE_W };

  const column = (nodes: SankeyNode[], x: number): PlacedNode[] => {
    const heights = nodes.map((n) => Math.max(1, n.value * scale));
    const colH = heights.reduce((s, h) => s + h, 0) + GAP * (nodes.length - 1);
    let y = TOP + (plotHeight - colH) / 2;
    let lastLabel = -Infinity;
    return nodes.map((n, i) => {
      const h = heights[i]!;
      const labelY = Math.max(y + h / 2, lastLabel + LABEL_STEP);
      lastLabel = labelY;
      const placed = { ...n, x, y, h, labelY };
      y += h + GAP;
      return placed;
    });
  };
  const sources = column(input.sources, xs.left);
  const targets = column(input.targets, xs.right);
  const centerH = Math.max(1, total * scale);
  const center: PlacedNode = {
    id: 'center',
    label: input.center.label,
    value: total,
    color: input.center.color,
    x: xs.center,
    y: TOP + (plotHeight - centerH) / 2,
    h: centerH,
    labelY: TOP + (plotHeight - centerH) / 2 - 8,
  };

  const band = (x0: number, a0: number, a1: number, x1: number, b0: number, b1: number) => {
    const xm = (x0 + x1) / 2;
    return `M${x0},${a0}C${xm},${a0} ${xm},${b0} ${x1},${b0}L${x1},${b1}C${xm},${b1} ${xm},${a1} ${x0},${a1}Z`;
  };
  const links: PlacedLink[] = [];
  let cy = center.y;
  for (const s of sources) {
    const h = s.value * scale;
    links.push({
      id: `${s.id}>center`,
      from: s.id,
      to: 'center',
      value: s.value,
      color: s.color,
      path: band(s.x + NODE_W, s.y, s.y + h, center.x, cy, cy + h),
    });
    cy += h;
  }
  cy = center.y;
  for (const t of targets) {
    const h = t.value * scale;
    links.push({
      id: `center>${t.id}`,
      from: 'center',
      to: t.id,
      value: t.value,
      color: t.color,
      path: band(center.x + NODE_W, cy, cy + h, t.x, t.y, t.y + h),
    });
    cy += h;
  }
  const bottom = Math.max(TOP + plotHeight, ...[...sources, ...targets].map((n) => n.labelY + LABEL_STEP / 2));
  return { width, height: Math.ceil(bottom + 4), total, sources, center, targets, links };
}

export const SANKEY_NODE_W = NODE_W;
