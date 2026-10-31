import { TICKS_PER_DAY } from '../time';
import { engineMaxSpeed, stationWaitFactor, wagonCapacity } from '../research';
import { baseTrack, levelTrackBits, stationLayer } from '../track/metro';
import { SIDE_DELTA } from '../track/track';
import { inBounds } from '../world/map';
import { wagonDef } from './vehicles';
import { allTiles, type Station } from '../station/station';
import {
  ADHESION,
  GRADE_PER_LEVEL,
  BEND_SPEED,
  BRAKE_KMH_PER_TICK,
  CREEP_SPEED,
  DEADLOCK_REVERSE_TICKS,
  PHYS_DT,
  RESERVE_RETRY_TICKS,
  STATION_WAIT_TICKS,
  VEHICLE_GAP,
  UNITS_PER_KMH_TICK,
} from '../config';
import type { SimEvent } from '../commands';
import { catchmentCargo, serveTrainAtStation } from '../economy/cargoFlow';
import { SignalIndex } from '../signals/signals';
import type { GameState } from '../state';
import { trainLength } from './geometry';
import { isPlatformEnd, planRoute, type Plan } from './path';
import { addTaken, blockerOf, buildTaken, isFree, isSafeStop, type Taken } from './reservation';
import { flipStep, isBend, stepHeight, stepLength } from './steps';
import { STRAIGHT_LENGTH } from '../track/graph';
import { depotExit, leaveDepot, lineHeadway, passesOrder, replaceOnArrival, sharedTrains, type Step, type Train } from './train';
import { consistStats, engineDef } from './vehicles';

/** Po tylu dniach bez trasy do celu gra zgłasza zgubiony pociąg (jak „Train is lost” w OpenTTD). */
export const LOST_REPORT_DAYS = 5;

/**
 * Informacje o pociągach dla interfejsu (stan pochodny, nie trafia do zapisu i nie wpływa
 * na symulację): czy pociąg nie może dojechać do celu. Czekanie na wolny tor jest w stanie pociągu.
 */
export class Planner {
  private lost = new Set<number>();
  /** Od kiedy (tick) pociąg nie może dojechać do celu; zgłoszone – komunikat już poszedł. */
  private lostSince = new Map<number, number>();
  private reported = new Set<number>();

  /** Zostawione dla zgodności z Simulation – trasy nie są już pamiętane między tickami. */
  invalidate(): void {}

  isLost(trainId: number): boolean {
    return this.lost.has(trainId);
  }

  /** Zapamiętuje, czy pociąg jest zgubiony; true – właśnie minęło `LOST_REPORT_DAYS` dni (czas na komunikat). */
  setLost(trainId: number, lost: boolean, tick = 0): boolean {
    if (!lost) {
      this.lost.delete(trainId);
      this.lostSince.delete(trainId);
      this.reported.delete(trainId);
      return false;
    }
    this.lost.add(trainId);
    const since = this.lostSince.get(trainId) ?? tick;
    this.lostSince.set(trainId, since);
    if (this.reported.has(trainId) || tick - since < LOST_REPORT_DAYS * TICKS_PER_DAY) return false;
    this.reported.add(trainId);
    return true;
  }
}

interface TickContext {
  state: GameState;
  planner: Planner;
  taken: Taken;
  signals: SignalIndex;
  events: SimEvent[];
}

export function tickTrains(state: GameState, planner: Planner, events: SimEvent[]): void {
  const ctx: TickContext = { state, planner, taken: buildTaken(state), signals: new SignalIndex(state), events };
  // Kolejność pociągów jest stała (po id), więc rozstrzyganie, kto pierwszy zarezerwuje tor, jest deterministyczne.
  for (const train of state.trains) {
    if (train.status === 'depot') {
      if (!train.stopped) tryLeaveDepot(ctx, train);
      continue;
    }
    if (train.status === 'loading' && train.reverseRequested) {
      // Na stacji pociąg stoi – zawraca od razu i ładuje dalej.
      reverseTrain(train);
      train.reverseRequested = false;
    }
    if (train.status === 'loading') {
      // Zjazd do zajezdni ma pierwszeństwo: bez dalszego postoju, pełnego ładunku i wyrównywania odstępów.
      if (train.goToDepot) train.waitTicks = Math.min(train.waitTicks, 1);
      if (--train.waitTicks <= 0) {
        // Przed odjazdem dobieramy ładunek, który pojawił się w czasie postoju.
        const st = stationUnderHead(state, train);
        if (st) serveTrainAtStation(state, train, st, events, false);
        // „Pełny ładunek”: zostaje i ładuje dalej, aż wagony na ładunek tej stacji będą pełne.
        if (st && !train.goToDepot && waitsForFullLoad(state, train, st)) train.waitTicks = FULL_LOAD_CHECK_TICKS;
        else {
          const hold = train.goToDepot ? 0 : spacingHold(state, train);
          if (hold > 0) {
            train.holding = true;
            train.waitTicks = Math.min(hold, FULL_LOAD_CHECK_TICKS);
          } else departStation(state, train);
        }
      }
      continue;
    }
    moveTrain(ctx, train);
  }
  resolveDeadlocks(state);
}

/** Pociąg czeka (stoi przed zajętym torem). */
export function isWaiting(train: Train): boolean {
  return train.blockedTicks > 0;
}

/**
 * Zakleszczenie: pociągi czekające na siebie w koło (A na B, B na A…). Po DEADLOCK_REVERSE_TICKS
 * zawraca jeden – o najniższym numerze – i szuka innej drogi. Zwykła kolejka (na końcu łańcucha
 * pociąg, który nie czeka, np. stoi na stacji) nie jest zakleszczeniem.
 */
function resolveDeadlocks(state: GameState): void {
  const byId = new Map(state.trains.map((t) => [t.id, t]));
  for (const train of state.trains) {
    if (train.blockedTicks < DEADLOCK_REVERSE_TICKS || train.speed > 0) continue;
    const cycle = [train.id];
    let cur = byId.get(train.blockedBy ?? -1);
    while (cur && isWaiting(cur) && !cycle.includes(cur.id)) {
      cycle.push(cur.id);
      cur = byId.get(cur.blockedBy ?? -1);
    }
    // Koło zamyka się na tym pociągu, a on ma najniższy numer w kole – zawraca.
    if (cur?.id === train.id && Math.min(...cycle) === train.id) {
      reverseTrain(train);
      train.mayReverse = false;
    }
  }
}

/** Pociąg czekający na wyjazd wyjeżdża, gdy wyjazd z zajezdni jest wolny. */
function tryLeaveDepot(ctx: TickContext, train: Train): void {
  const exit = depotExit(ctx.state, train);
  if (!exit || !isFree(ctx.state, ctx.taken, exit, train.id)) {
    train.blockedTicks = Math.max(1, train.blockedTicks + 1);
    return;
  }
  leaveDepot(train, exit, ctx.events);
  addTaken(ctx.state, ctx.taken, exit, train.id);
  train.blockedTicks = 0;
  train.blockedBy = null;
}

/** Co ile ticków pociąg czekający na pełny ładunek sprawdza, czy coś przybyło (pół dnia). */
const FULL_LOAD_CHECK_TICKS = 20;

/** Czeka na pełny ładunek: ptaszek przy tej pozycji rozkładu i są niepełne wagony na ładunek stacji. */
export function waitsForFullLoad(state: GameState, train: Train, st: Station): boolean {
  if (train.stopped || train.reverseRequested) return false;
  if (train.orders[train.currentOrder] !== st.id || !train.fullLoad[train.currentOrder]) return false;
  const { supplies } = catchmentCargo(state, allTiles(st));
  return train.wagons.some((id, k) => {
    const def = wagonDef(id)!;
    const load = train.loads[k]!;
    // Wagon z ładunkiem z innej stacji tu nie dobierze (nie mieszamy ładunków).
    return (
      supplies.has(def.cargo) && load.amount < wagonCapacity(state, def.capacity) && (load.amount === 0 || load.source === st.id)
    );
  });
}

/** Długość peronu (kafelki) pod czołem pociągu – od czoła wstecz, wzdłuż toru tej samej stacji. */
export function platformTiles(state: GameState, train: Train): number {
  const { map } = state;
  const head = train.trail[0];
  if (!head) return 0;
  const stations = stationLayer(map, head.track);
  const id = stations[head.y * map.width + head.x];
  if (!id || head.entry === -1) return 0;
  const [dx, dy] = SIDE_DELTA[head.entry];
  let n = 0;
  let x = head.x;
  let y = head.y;
  const base = baseTrack(head.track);
  while (inBounds(map, x, y) && stations[y * map.width + x] === id && levelTrackBits(map, x, y, head.track) === base) {
    n++;
    x += dx;
    y += dy;
  }
  return n;
}

/** Długość pociągu w kafelkach (dwa pojazdy na kafelek). */
export function trainTiles(train: Train): number {
  return (trainLength(train) + VEHICLE_GAP) / STRAIGHT_LENGTH;
}

/** Mnożnik czasu postoju: 1 – pociąg mieści się na peronie, do 2 – gdy wystaje (proporcjonalnie). */
export function platformPenalty(state: GameState, train: Train): number {
  const platform = platformTiles(state, train);
  if (platform <= 0) return 1;
  return Math.min(2, Math.max(1, trainTiles(train) / platform));
}

/**
 * Równe odstępy: na pierwszej stacji rozkładu pociąg linii czeka, aż od odjazdu poprzedniego minie
 * odstęp (czas okrążenia / liczba pociągów). Zwraca, ile ticków jeszcze czekać (0 – może jechać).
 */
export function spacingHold(state: GameState, train: Train): number {
  if (!train.spacing || train.currentOrder !== 0 || train.stopped) return 0;
  const headway = lineHeadway(state, train);
  if (headway <= 0) return 0;
  let last = -1;
  for (const t of sharedTrains(state, train)) if (t !== train) last = Math.max(last, t.departedFirstTick);
  if (last < 0) return 0;
  return Math.max(0, last + headway - state.tick);
}

function departStation(state: GameState, train: Train): void {
  train.holding = false;
  train.status = 'running';
  nextOrder(state, train);
  train.mayReverse = true;
  train.resTerminal = null;
}

/** Następna pozycja rozkładu; odjazd z pierwszej (albo przejazd przez nią) – pomiar czasu okrążenia linii. */
function nextOrder(state: GameState, train: Train): void {
  if (!train.orders.length) return;
  if (train.currentOrder === 0) {
    if (train.departedFirstTick >= 0) train.loopTicks = state.tick - train.departedFirstTick;
    train.departedFirstTick = state.tick;
  }
  train.currentOrder = (train.currentOrder + 1) % train.orders.length;
}

/** Czoło wjechało na koniec stacji „tylko przejazd” z bieżącej pozycji rozkładu – zaliczona, jedzie dalej. */
function checkPassed(state: GameState, train: Train): void {
  if (train.goToDepot) return;
  const head = train.trail[0]!;
  // Kilka kolejnych pozycji na tym samym kafelku (np. ten sam punkt dwa razy) zalicza się naraz.
  for (let k = 0; k < train.orders.length; k++) {
    const id = train.orders[train.currentOrder];
    if (id === undefined || !passesOrder(state, train, train.currentOrder) || !isPlatformEnd(state, head, id)) return;
    nextOrder(state, train);
  }
}

/** Nachylenie odcinka czoła (dodatnie – pod górę). */
function headGrade(state: GameState, train: Train): number {
  const head = train.trail[0]!;
  const rise = stepHeight(state, head, stepLength(head)) - stepHeight(state, head, 0);
  return (rise * GRADE_PER_LEVEL * STRAIGHT_LENGTH) / stepLength(head);
}

/** Przyspieszenie (km/h na tick) z mocy, przyczepności, oporów i nachylenia toru. */
function acceleration(train: Train, grade: number): number {
  const { weight, power, engineWeight } = consistStats(train.engine, train.wagons, train.engineCount);
  const mass = weight * 1000;
  const v = train.speed / 3.6;
  const force = Math.min((power * 1000) / Math.max(v, 1.5), ADHESION * engineWeight * 1000 * 9.81);
  const resist = mass * 9.81 * (0.002 + 0.00002 * train.speed + grade);
  return ((force - resist) / mass) * 3.6 * PHYS_DT;
}

/** Największa prędkość, z której zdążymy wyhamować do `limit` na drodze `d`. */
function brakingCap(d: number, limit: number): number {
  return Math.sqrt(limit * limit + (2 * BRAKE_KMH_PER_TICK * Math.max(0, d)) / UNITS_PER_KMH_TICK);
}

/** Droga hamowania z prędkości maksymalnej + zapas – tyle pociąg stara się mieć zarezerwowane. */
function reserveDistance(state: GameState, train: Train): number {
  const v = engineMaxSpeed(state, engineDef(train.engine)!.maxSpeed);
  return (v * v * UNITS_PER_KMH_TICK) / (2 * BRAKE_KMH_PER_TICK) + 24;
}

/** Długość drogi od czoła do końca rezerwacji. */
function reservedDistance(train: Train): number {
  return stepLength(train.trail[0]!) - train.progress + train.reservedAhead.reduce((d, s) => d + stepLength(s), 0);
}

function moveTrain(ctx: TickContext, train: Train): void {
  const { state } = ctx;
  // Zawracanie na polecenie gracza: najpierw hamujemy, po zatrzymaniu zawracamy.
  if (train.reverseRequested && train.speed === 0) {
    reverseTrain(train);
    train.reverseRequested = false;
    train.mayReverse = false;
    return;
  }
  if (
    !train.stopped &&
    !train.reverseRequested &&
    !train.resTerminal &&
    reservedDistance(train) < reserveDistance(state, train)
  ) {
    // Czekający pociąg ponawia próbę co kilka ticków (mniej liczenia tras).
    const retry = !isWaiting(train) || (state.tick + train.id) % RESERVE_RETRY_TICKS === 0;
    if (retry && extendReservation(ctx, train) === 'reversed') return;
  }
  if (isWaiting(train) && train.speed === 0) train.blockedTicks++;

  const maxSpeed = engineMaxSpeed(state, engineDef(train.engine)!.maxSpeed);
  const head = train.trail[0]!;
  const dist = reservedDistance(train);
  let target = train.stopped || train.reverseRequested ? 0 : maxSpeed;
  // Łuki na zarezerwowanej drodze.
  let d = stepLength(head) - train.progress;
  let prev = head;
  for (const s of train.reservedAhead) {
    if (isBend(prev, s)) target = Math.min(target, brakingCap(d, BEND_SPEED));
    d += stepLength(s);
    prev = s;
  }
  // Zawsze musimy zdążyć stanąć na końcu rezerwacji.
  target = Math.min(target, brakingCap(dist, 0));

  if (train.speed > target) {
    train.speed = Math.max(target, train.speed - BRAKE_KMH_PER_TICK);
  } else {
    // Siły działają zawsze – pod górę skład zwalnia nawet przy prędkości maksymalnej.
    const accel = acceleration(train, headGrade(state, train));
    // Ciężki skład pod stromą górę nie staje całkiem – wlecze się z minimalną prędkością.
    train.speed = Math.min(target, Math.max(Math.min(target, CREEP_SPEED), train.speed + accel));
  }
  // Dojazd do celu (peron, zajezdnia, koniec toru) na ostatnich metrach „pełzając”.
  if (!train.stopped && train.resTerminal && train.speed < CREEP_SPEED && dist > 0) train.speed = CREEP_SPEED;
  if (train.speed > 0) train.mayReverse = false;

  const move = train.speed * UNITS_PER_KMH_TICK;
  if (move >= dist) {
    advance(state, train, dist);
    train.speed = 0;
    if (train.resTerminal) arrive(ctx, train);
    return;
  }
  advance(state, train, move);
}

/**
 * Dokłada rezerwację porcjami: każda porcja kończy się w bezpiecznym miejscu (zwykły tor w trybie
 * Amator, semafor w trybie Ekspert) albo u celu i jest brana tylko w całości, gdy cała jest wolna.
 */
function extendReservation(ctx: TickContext, train: Train): 'ok' | 'blocked' | 'reversed' {
  const { state, planner } = ctx;
  const from = train.reservedAhead[train.reservedAhead.length - 1] ?? train.trail[0]!;
  const clearWaiting = () => {
    train.blockedTicks = 0;
    train.blockedBy = null;
  };
  const plan: Plan = planRoute(state, train, {
    from,
    allowReverseStart: train.mayReverse && train.reservedAhead.length === 0,
    taken: ctx.taken,
    signals: ctx.signals,
  });
  if (planner.setLost(train.id, plan.lost, state.tick)) ctx.events.push({ type: 'trainLost', trainId: train.id });

  if (plan.terminal === 'reverseNow') {
    reverseTrain(train);
    train.mayReverse = false;
    clearWaiting();
    return 'reversed';
  }

  const need = reserveDistance(ctx.state, train);
  let have = reservedDistance(train);
  let i = 0;
  while (have < need && i < plan.steps.length) {
    // Porcja do najbliższego bezpiecznego miejsca (albo do końca planu).
    const chunk: Step[] = [];
    while (i < plan.steps.length) {
      const s = plan.steps[i++]!;
      chunk.push(s);
      if (isSafeStop(state, s, ctx.signals)) break;
    }
    const blocked = chunk.find((s) => !isFree(state, ctx.taken, s, train.id));
    if (blocked) {
      train.blockedTicks = Math.max(1, train.blockedTicks);
      train.blockedBy = blockerOf(state, ctx.taken, blocked, train.id);
      return 'blocked';
    }
    for (const s of chunk) {
      train.reservedAhead.push(s);
      addTaken(state, ctx.taken, s, train.id);
      have += stepLength(s);
    }
  }
  clearWaiting();
  // Cały plan zarezerwowany i kończy się celem – po dojechaniu pociąg wykona akcję końcową.
  if (i >= plan.steps.length && plan.terminal !== 'continue') train.resTerminal = plan.terminal;
  return 'ok';
}

/** Przesuwa czoło o `move` po zarezerwowanych odcinkach. */
function advance(state: GameState, train: Train, move: number): void {
  let remaining = move;
  for (;;) {
    const head = train.trail[0]!;
    const room = stepLength(head) - train.progress;
    if (remaining < room || train.reservedAhead.length === 0) {
      train.progress = Math.min(stepLength(head), train.progress + remaining);
      break;
    }
    remaining -= room;
    train.trail.unshift(train.reservedAhead.shift()!);
    train.progress = 0;
    checkPassed(state, train);
  }
  trimTrail(train);
}

function arrive(ctx: TickContext, train: Train): void {
  const { state } = ctx;
  const terminal = train.resTerminal;
  train.resTerminal = null;
  switch (terminal) {
    case 'stop': {
      train.status = 'loading';
      train.arrivedTick = state.tick;
      const st = stationUnderHead(state, train);
      // Za krótki peron: postój dłuższy proporcjonalnie do tego, ile pociągu wystaje (najwyżej 2×).
      train.waitTicks = Math.round(STATION_WAIT_TICKS * stationWaitFactor(state) * (st ? platformPenalty(state, train) : 1));
      // Rozkład czasowy: dodatkowy postój ustawiony przy tej stacji.
      train.waitTicks += (train.waitDays[train.currentOrder] ?? 0) * TICKS_PER_DAY;
      if (st) serveTrainAtStation(state, train, st, ctx.events, true);
      break;
    }
    case 'depot': {
      const head = train.trail[0]!;
      train.status = 'depot';
      train.depotId = state.map.depot[head.y * state.map.width + head.x] || null;
      train.trail = [];
      train.reservedAhead = [];
      train.progress = 0;
      train.stopped = true;
      train.goToDepot = false;
      train.reversed = false;
      replaceOnArrival(state, train, ctx.events);
      ctx.events.push({ type: 'trainsChanged' });
      break;
    }
    case 'reverse':
      reverseTrain(train);
      break;
  }
}

function stationUnderHead(state: GameState, train: Train) {
  const h = train.trail[0]!;
  const id = stationLayer(state.map, h.track)[h.y * state.map.width + h.x];
  return id ? state.stations.find((s) => s.id === id) : undefined;
}

/** Usuwa z końca odcinki, których skład już nie zajmuje (zwalnia je dla innych pociągów). */
function trimTrail(train: Train): void {
  const length = trainLength(train);
  let covered = train.progress;
  for (let k = 1; k < train.trail.length; k++) {
    if (covered >= length) {
      train.trail.length = k;
      return;
    }
    covered += stepLength(train.trail[k]!);
  }
}

/** Zawrócenie: koniec składu staje się czołem; rezerwacja przed starym czołem jest zwalniana. */
export function reverseTrain(train: Train): void {
  const length = trainLength(train);
  // Odległość od czoła do wejścia w odcinek k.
  let d = train.progress;
  let k = 0;
  while (d < length && k + 1 < train.trail.length) {
    k++;
    d += stepLength(train.trail[k]!);
  }
  const tailStep = train.trail[k]!;
  // Ogon leży (d - length) od wejścia w odcinek k; po odwróceniu liczymy od drugiej strony.
  const fromEntry = Math.max(0, d - length);
  train.trail = train.trail
    .slice(0, k + 1)
    .reverse()
    .map(flipStep);
  train.progress = stepLength(tailStep) - fromEntry;
  train.reservedAhead = [];
  train.resTerminal = null;
  train.reversed = !train.reversed;
  train.speed = 0;
  train.blockedTicks = 0;
  train.blockedBy = null;
}
