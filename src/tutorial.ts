import type { GameState } from './sim/state';
import type { TrackGraph } from './sim/track/graph';

/** Pierwsze kroki dla nowego gracza: kolejne cele wykrywane ze stanu gry. */
export interface TutorialStep {
  title: string;
  hint: string;
  done: (state: GameState, graph: TrackGraph) => boolean;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: 'Zbuduj tor',
    hint: 'Narzędzie Tory (T): przeciągnij tor między dwoma miastami albo od kopalni do elektrowni.',
    done: (_s, graph) => graph.edges.length > 0,
  },
  {
    title: 'Postaw dwie stacje',
    hint: 'Stacja (P): przeciągnij prostokąt na końcach toru. Niebieski zasięg musi objąć domy lub zakład.',
    done: (s) => s.stations.filter((st) => !st.waypoint).length >= 2,
  },
  {
    title: 'Postaw zajezdnię',
    hint: 'Zajezdnia (Z): klik obok toru; wjazd obróci się sam w stronę toru (Auto).',
    done: (s) => s.depots.length > 0,
  },
  {
    title: 'Kup pociąg',
    hint: 'Kliknij zajezdnię kursorem i kup lokomotywę z wagonami (pasażerskie dla miast, węglarki dla kopalni).',
    done: (s) => s.trains.length > 0,
  },
  {
    title: 'Ułóż rozkład jazdy',
    hint: 'W oknie pociągu: „+ Dodaj stacje”, kliknij obie stacje na mapie, potem „Gotowe”.',
    done: (s) => s.trains.some((t) => new Set(t.orders).size >= 2),
  },
  {
    title: 'Wyślij pociąg w trasę',
    hint: 'W oknie pociągu lub zajezdni: „▶ Wyjedź”.',
    done: (s) => s.trains.some((t) => t.status !== 'depot' && !t.stopped),
  },
  {
    title: 'Zarób na przewozie',
    hint: 'Pociąg zabiera ładunek ze stacji i dostaje zapłatę po dowiezieniu. Im dalej i szybciej, tym więcej. Przyspiesz grę (2–4).',
    done: (s) => s.finances.month.income > 0 || s.finances.history.some((m) => m.income > 0),
  },
];

/** Które kroki są zrobione. Kroki raz zrobione zostają zaliczone (np. po sprzedaży pociągu). */
export function tutorialProgress(state: GameState, graph: TrackGraph, previous: readonly boolean[] = []): boolean[] {
  return TUTORIAL_STEPS.map((step, i) => previous[i] === true || step.done(state, graph));
}
