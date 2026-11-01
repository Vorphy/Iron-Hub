// Zasady gry (jak ustawienia rozgrywki w OpenTTD): sygnalizacja, ceny budowy, wzrost i łączenie miast.
// Ten sam wybór w Menu → Ustawienia (bieżąca gra) i w oknie nowej gry.
import { ECONOMY } from '../data/economy';
import { COST_LEVELS, type CostLevel, type GameSettings, TOWN_GROWTH_LEVELS, type TownGrowth } from '../sim/settings';
import type { SignalMode } from '../sim/signals/signals';

export const COST_NAMES: Record<CostLevel, string> = { low: 'niskie', normal: 'normalne', high: 'wysokie' };
export const GROWTH_NAMES: Record<TownGrowth, string> = { off: 'brak', slow: 'wolno', normal: 'normalnie', fast: 'szybko' };

const percent = (f: number) => `${Math.round(f * 100)}%`;

export interface GameRulesValue {
  signalMode: SignalMode;
  settings: GameSettings;
}

export function GameRules({
  value,
  onSignalMode,
  onSettings,
  titleClass,
  noteClass,
}: {
  value: GameRulesValue;
  onSignalMode: (mode: SignalMode) => void;
  onSettings: (patch: Partial<GameSettings>) => void;
  /** Klasy nagłówka i opisu – różne w Menu i w oknie nowej gry. */
  titleClass: string;
  noteClass: string;
}) {
  const { signalMode, settings } = value;
  return (
    <>
      <div class={titleClass}>Sygnalizacja</div>
      <div class="buttons">
        <button class={signalMode === 'auto' ? 'active' : ''} onClick={() => onSignalMode('auto')}>
          Amator
        </button>
        <button class={signalMode === 'manual' ? 'active' : ''} onClick={() => onSignalMode('manual')}>
          Ekspert
        </button>
      </div>
      <div class={noteClass}>
        {signalMode === 'auto'
          ? 'Pociągi same trzymają odstęp i nie wjeżdżają na zajęte rozjazdy.'
          : 'Pociąg staje tylko przed semaforem, na końcu peronu lub toru. Semafory stawiasz sam (B).'}
      </div>

      <div class={titleClass}>Koszty budowy</div>
      <div class="buttons wrap">
        {COST_LEVELS.map((c) => (
          <button
            key={c}
            class={settings.costs === c ? 'active' : ''}
            title={`${percent(ECONOMY.settings.costs[c])} cen budowy (tory, stacje, mosty, teren…) i zwrotów za rozbiórkę`}
            onClick={() => onSettings({ costs: c })}
          >
            {COST_NAMES[c]}
          </button>
        ))}
      </div>
      <div class={noteClass}>
        {percent(ECONOMY.settings.costs[settings.costs])} normalnych cen. Pociągi i utrzymanie bez zmian.
      </div>

      <div class={titleClass}>Wzrost miast</div>
      <div class="buttons wrap">
        {TOWN_GROWTH_LEVELS.map((g) => (
          <button
            key={g}
            class={settings.townGrowth === g ? 'active' : ''}
            title={`${percent(ECONOMY.settings.townGrowth[g])} nowych domów i rozbudów`}
            onClick={() => onSettings({ townGrowth: g })}
          >
            {GROWTH_NAMES[g]}
          </button>
        ))}
      </div>
      <div class={noteClass}>
        {settings.townGrowth === 'off'
          ? 'Miasta nie budują nowych domów.'
          : `${percent(ECONOMY.settings.townGrowth[settings.townGrowth])} normalnego tempa: nowe domy i rozbudowa.`}
      </div>

      <div class={titleClass}>Łączenie miast</div>
      <div class="buttons">
        <button class={settings.townMerge ? 'active' : ''} onClick={() => onSettings({ townMerge: true })}>
          wł.
        </button>
        <button class={settings.townMerge ? '' : 'active'} onClick={() => onSettings({ townMerge: false })}>
          wył.
        </button>
      </div>
      <div class={noteClass}>
        {settings.townMerge
          ? `Zrośnięte miasta po ${ECONOMY.town.absorbMonths} miesiącach styku łączą się – mniejsze zostaje dzielnicą większego.`
          : 'Miasta zostają osobno, nawet gdy się zrosną (jak w OpenTTD).'}
      </div>
    </>
  );
}
