import { describe, expect, it } from 'vitest';
import type { CompanyLedger } from '../src/ui/hudStore';
import { layoutSankey, ledgerProfit, ledgerSankey, LOSS_COLOR, PROFIT_COLOR } from '../src/ui/sankey';

const ledger = (over: Partial<CompanyLedger> = {}): CompanyLedger => ({
  cargo: [
    { cargo: 'passengers', income: 6000, amount: 900 },
    { cargo: 'coal', income: 4000, amount: 500 },
  ],
  income: 10_000,
  trains: 3000,
  infrastructure: 1000,
  construction: 2000,
  interest: 0,
  ...over,
});

const sum = (ns: { value: number }[]) => ns.reduce((s, n) => s + n.value, 0);

describe('wykres Sankeya w oknie Firma', () => {
  it('zysk: ładunki → przychody → wydatki i zysk; wpływy = wypływy', () => {
    const s = ledgerSankey(ledger())!;
    expect(s.center.label).toBe('przychody');
    expect(s.sources.map((n) => n.id)).toEqual(['passengers', 'coal']);
    expect(s.targets.map((n) => [n.id, n.value])).toEqual([
      ['trains', 3000],
      ['infrastructure', 1000],
      ['construction', 2000],
      ['profit', 4000],
    ]);
    expect(s.targets.at(-1)!.color).toBe(PROFIT_COLOR);
    expect(sum(s.sources)).toBe(sum(s.targets));
    expect(ledgerProfit(ledger())).toBe(4000);
  });

  it('strata pokrywana z kasy jest źródłem, a nie celem', () => {
    const s = ledgerSankey(ledger({ construction: 9000 }))!;
    expect(s.center.label).toBe('wydatki');
    expect(s.sources.at(-1)).toMatchObject({ id: 'loss', value: 3000, color: LOSS_COLOR });
    expect(s.targets.some((n) => n.id === 'profit')).toBe(false);
    expect(sum(s.sources)).toBe(sum(s.targets));
  });

  it('zwroty ze sprzedaży i przychód bez podziału na ładunki to osobne źródła; pusty okres – brak wykresu', () => {
    const s = ledgerSankey(ledger({ income: 12_000, construction: -500 }))!;
    expect(s.sources.map((n) => [n.id, n.value])).toEqual([
      ['passengers', 6000],
      ['coal', 4000],
      ['other', 2000],
      ['refunds', 500],
    ]);
    expect(s.targets.some((n) => n.id === 'construction')).toBe(false);
    expect(ledgerSankey(ledger({ cargo: [], income: 0, trains: 0, infrastructure: 0, construction: 0 }))).toBeNull();
  });

  it('układ: wstęgi z obu stron węzła środkowego mają tę samą łączną grubość, podpisy się nie nakładają', () => {
    const L = layoutSankey(ledgerSankey(ledger())!);
    const h = (ids: string[]) => ids.reduce((s, id) => s + L.links.find((l) => l.id === id)!.value, 0);
    expect(h(['passengers>center', 'coal>center'])).toBe(
      h(['center>trains', 'center>infrastructure', 'center>construction', 'center>profit']),
    );
    expect(L.center.h).toBeGreaterThan(0);
    for (const col of [L.sources, L.targets]) {
      for (let i = 1; i < col.length; i++) {
        expect(col[i]!.y).toBeGreaterThanOrEqual(col[i - 1]!.y + col[i - 1]!.h);
        expect(col[i]!.labelY - col[i - 1]!.labelY).toBeGreaterThanOrEqual(26);
      }
    }
    expect(L.height).toBeGreaterThanOrEqual(Math.max(...L.targets.map((n) => n.labelY)));
  });
});
