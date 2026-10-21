import { useState } from 'preact/hooks';
import { formatMoney } from '../tools';
import type { HudActions, TrainsWindowData } from './hudStore';

type SortKey = 'name' | 'profitThis' | 'profitLast' | 'age';
/** Filtr grupy: 'all' – wszystkie, 'none' – bez grupy, liczba – id grupy. */
type GroupFilter = 'all' | 'none' | number;

const money = (v: number) => `${v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}`;

/** Lista pociągów: zysk w tym i zeszłym roku, sortowanie, nierentowne, grupy. */
export function TrainsWindow({ data, actions }: { data: TrainsWindowData; actions: HudActions }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'profitLast', desc: true });
  const [group, setGroup] = useState<GroupFilter>('all');
  const [onlyBad, setOnlyBad] = useState(false);
  const [newGroup, setNewGroup] = useState('');

  const rows = data.rows
    .filter((r) => (group === 'all' ? true : group === 'none' ? r.groupId === null : r.groupId === group))
    .filter((r) => !onlyBad || r.unprofitable || r.profitThis < 0)
    .sort((a, b) => {
      const k = sort.key;
      const d = k === 'name' ? a.id - b.id : k === 'age' ? a.age - b.age : a[k] - b[k];
      return sort.desc ? -d : d;
    });
  const total = (k: 'profitThis' | 'profitLast') => rows.reduce((s, r) => s + r[k], 0);
  const header = (key: SortKey, label: string) => (
    <th>
      <button
        class={`link sort ${sort.key === key ? 'active' : ''}`}
        onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'name' })}
      >
        {label}
        {sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
      </button>
    </th>
  );
  const selectedGroup = typeof group === 'number' ? data.groups.find((g) => g.id === group) : undefined;

  return (
    <div class="panel window wide">
      <div class="window-head">
        <span class="window-title">Pociągi ({data.rows.length})</span>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeWindow}>
          ✕
        </button>
      </div>

      <div class="row trains-filters">
        <select
          value={String(group)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            setGroup(v === 'all' || v === 'none' ? v : Number(v));
          }}
          title="Grupa"
        >
          <option value="all">Wszystkie grupy</option>
          <option value="none">Bez grupy</option>
          {data.groups.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.name} ({g.count})
            </option>
          ))}
        </select>
        <label class="full-load">
          <input type="checkbox" checked={onlyBad} onChange={() => setOnlyBad(!onlyBad)} />
          tylko na minusie
        </label>
        <span class="grow" />
        {selectedGroup && (
          <>
            <button
              onClick={() => {
                const name = prompt('Nowa nazwa grupy', selectedGroup.name);
                if (name) actions.renameGroup(selectedGroup.id, name);
              }}
            >
              Zmień nazwę
            </button>
            <button
              onClick={() => {
                actions.deleteGroup(selectedGroup.id);
                setGroup('all');
              }}
              title="Pociągi zostaną bez grupy"
            >
              Usuń grupę
            </button>
          </>
        )}
      </div>

      {data.rows.length === 0 ? (
        <div class="muted">Nie masz jeszcze pociągów – kup pierwszy w zajezdni.</div>
      ) : (
        <div class="trains-table">
          <table class="ledger">
            <thead>
              <tr>
                {header('name', 'Pociąg')}
                <th>Grupa</th>
                {header('profitThis', 'Zysk w tym roku')}
                {header('profitLast', `Zysk w ${data.year - 1}`)}
                {header('age', 'Wiek')}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} class={r.unprofitable ? 'unprofitable' : ''}>
                  <td>
                    <button class="link train-name" onClick={() => actions.openTrain(r.id)} title={r.status}>
                      <span class="swatch" style={{ background: r.color }} /> {r.name}
                    </button>
                    <div class={`muted small ${r.lost ? 'bad' : ''}`}>
                      {r.engine} · {r.status}
                    </div>
                  </td>
                  <td>
                    <select
                      value={r.groupId === null ? '' : String(r.groupId)}
                      onChange={(e) => {
                        const v = (e.target as HTMLSelectElement).value;
                        actions.setTrainGroup(r.id, v === '' ? null : Number(v));
                      }}
                    >
                      <option value="">—</option>
                      {data.groups.map((g) => (
                        <option key={g.id} value={String(g.id)}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td class={r.profitThis < 0 ? 'neg' : 'pos'}>{money(r.profitThis)}</td>
                  <td class={r.profitLast < 0 ? 'neg' : r.profitLast > 0 ? 'pos' : 'muted'}>
                    {r.newTrain ? '—' : money(r.profitLast)}
                  </td>
                  <td>{r.age} l.</td>
                </tr>
              ))}
              <tr class="total">
                <td>Razem ({rows.length})</td>
                <td />
                <td class={total('profitThis') < 0 ? 'neg' : 'pos'}>{money(total('profitThis'))}</td>
                <td class={total('profitLast') < 0 ? 'neg' : 'pos'}>{money(total('profitLast'))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div class="row">
        <input
          class="grow group-name"
          placeholder="Nowa grupa, np. Węgiel"
          value={newGroup}
          maxLength={32}
          onInput={(e) => setNewGroup((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          disabled={!newGroup.trim()}
          onClick={() => {
            actions.createGroup(newGroup);
            setNewGroup('');
          }}
        >
          + Grupa
        </button>
      </div>
      <div class="muted small">
        Zysk = przewozy − utrzymanie pociągu. Na czerwono – pociągi, które w zeszłym roku przyniosły stratę (jeżdżące cały rok).
        Klik w nazwę otwiera okno pociągu.
      </div>
    </div>
  );
}
