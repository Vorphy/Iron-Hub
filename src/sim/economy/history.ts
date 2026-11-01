// Historia firmy: bilans każdego zamkniętego roku zostaje w zapisie na zawsze (pod przyszłe okno „Firma”,
// wykresy i raporty – roadmapa pkt 27). Liczone raz w roku, więc bez kosztu w ticku.
import type { GameState } from '../state';
import { tracksOn } from '../track/track';
import { wagonResale } from '../trains/consist';
import { resaleValue } from '../trains/train';
import { emptyLedger, type YearRecord } from './finance';

/** Wartość firmy: gotówka − kredyt + wartość odsprzedaży pociągów i wagonów w magazynach zajezdni. */
export function companyValue(state: GameState): number {
  const trains = state.trains.reduce((sum, t) => sum + resaleValue(state, t), 0);
  const spare = state.depots.reduce((sum, d) => sum + d.wagons.reduce((s, w) => s + wagonResale(w.type), 0), 0);
  return Math.round(state.money - state.finances.loan + trains + spare);
}

/** Elementy torów na mapie (powierzchnia i metro). */
export function trackPieces(state: GameState): number {
  const { map } = state;
  let n = 0;
  for (let i = 0; i < map.track.length; i++) {
    if (map.track[i]) n += tracksOn(map.track[i]!).length;
    if (map.under[i]) n += tracksOn(map.under[i]!).length;
  }
  return n;
}

/** Zamknięcie roku `year` (wywoływane po zamknięciu grudnia): suma miesięcy i stan firmy na koniec roku. */
export function closeFinanceYear(state: GameState, year: number): YearRecord {
  const f = state.finances;
  const record: YearRecord = {
    year,
    months: f.yearMonths,
    ledger: f.year,
    money: Math.round(state.money),
    loan: f.loan,
    companyValue: companyValue(state),
    trains: state.trains.length,
    stations: state.stations.filter((s) => !s.waypoint).length,
    trackPieces: trackPieces(state),
  };
  f.years.push(record);
  f.year = emptyLedger();
  f.yearMonths = 0;
  return record;
}
