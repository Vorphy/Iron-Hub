import { CHANGELOG } from '../data/changelog';
import { HELP_TOPICS, type HelpBlock } from '../data/help';
import type { HudActions } from './hudStore';

/** Tekst z `**pogrubieniami**`. */
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}</>;
}

function Block({ block }: { block: HelpBlock }) {
  if (typeof block === 'string') {
    return (
      <p>
        <Rich text={block} />
      </p>
    );
  }
  if ('list' in block) {
    return (
      <ul>
        {block.list.map((item) => (
          <li key={item}>
            <Rich text={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <table class="ledger help-table">
      <thead>
        <tr>
          {block.table.head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.table.rows.map((row) => (
          <tr key={row.join('|')}>
            {row.map((cell, i) => (
              <td key={i}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Pomoc: lista tematów po lewej, treść po prawej. Gra toczy się dalej. */
export function HelpWindow({ topic, actions }: { topic: string; actions: HudActions }) {
  const current = HELP_TOPICS.find((t) => t.id === topic) ?? HELP_TOPICS[0]!;
  return (
    <div class="panel window big-window">
      <div class="window-head">
        <span class="window-title">Pomoc – {current.title}</span>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeHelp}>
          ✕
        </button>
      </div>
      <div class="help-body">
        <nav class="help-topics">
          {HELP_TOPICS.map((t) => (
            <button key={t.id} class={t.id === current.id ? 'active' : ''} onClick={() => actions.openHelp(t.id)}>
              {t.title}
            </button>
          ))}
          <button class="link" onClick={actions.openChangelog}>
            Co nowego →
          </button>
        </nav>
        <div class="help-content">
          {current.blocks.map((b, i) => (
            <Block key={`${current.id}-${i}`} block={b} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Historia zmian, najnowsze na górze. */
export function ChangelogWindow({ actions }: { actions: HudActions }) {
  return (
    <div class="panel window big-window">
      <div class="window-head">
        <span class="window-title">Co nowego</span>
        <button class="close" title="Zamknij (Esc)" onClick={actions.closeChangelog}>
          ✕
        </button>
      </div>
      <div class="help-content">
        {CHANGELOG.map((e) => (
          <div key={`${e.date}-${e.title}`} class="changelog-entry">
            <div class="section-title">
              {formatDate(e.date)} · {e.title}
            </div>
            <ul>
              {e.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Klucz najnowszego wpisu – do kropki „nowości” przy Menu. */
export const LATEST_CHANGELOG = CHANGELOG[0] ? `${CHANGELOG[0].date} ${CHANGELOG[0].title}` : '';

/** Link „?” do tematu pomocy (w oknach miasta, zakładu, stacji…). */
export function HelpLink({ topic, label, actions }: { topic: string; label: string; actions: HudActions }) {
  return (
    <button class="link help-link" onClick={() => actions.openHelp(topic)} title="Otwórz pomoc">
      ? {label}
    </button>
  );
}
