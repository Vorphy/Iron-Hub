import { CLEAR_ROUGH_COST, HOUSE_DEMOLISH_COST, ROAD_REMOVE_COST } from './config';
import type { ResearchId } from '../data/research';
import { cancelResearch, startResearch } from './research';
import { LOAN_MAX, LOAN_STEP, spend } from './economy/finance';
import { buildDepot, depotAt, removeDepot } from './depot/depot';
import { dropOrphanSignals, placeSignal, removeSignal, type SignalMode } from './signals/signals';
import type { GameState } from './state';
import { buildStation, buildWaypoint, removeStationTile, type StationAxis } from './station/station';
import { buildTrack, removeTrack } from './track/build';
import { buildRamp, buildUnderTrack, removeRamp, removeUnderTrack } from './track/metro';
import { buildCatenary, dropOrphanCatenary } from './track/catenary';
import { attachWagon, buyWagon, detachWagon, sellEngine, sellSpareWagon, setEngineCount } from './trains/consist';
import { createGroup, deleteGroup, renameGroup, setTrainGroup } from './trains/groups';
import { getTrackBits, tracksOn, type Side, type Track, type TrackPiece } from './track/track';
import {
  buyTrain,
  occupiedTiles,
  cloneTrain,
  unshareOrders,
  requestReplace,
  requestReverse,
  sellTrain,
  sendToDepot,
  setOrders,
  setSpacing,
  setWaitDays,
  toggleFullLoad,
  toggleNonStop,
  startTrain,
  stopTrain,
  trainsInDepot,
} from './trains/train';
import { bridgeAt, bridgeRole, bridgeTileCoords, buildBridge, removeBridge } from './track/bridge';
import { buildTunnel, removeTunnel, tunnelAt, tunnelRole, tunnelTileCoords } from './track/tunnel';
import { getTerrain, inBounds, setTerrain, Terrain } from './world/map';
import { applyTerraform, levelTargets, planTerraform, terraformTargets } from './world/terraform';

/** Jedyny sposób zmiany stanu gry z zewnątrz. */
export type Command =
  | { type: 'clearTile'; x: number; y: number }
  /** `under` – tory metra (poziom −1). */
  | { type: 'buildTrack'; pieces: TrackPiece[]; under?: boolean }
  | { type: 'removeTrack'; pieces: TrackPiece[]; under?: boolean }
  /** Zjazd do metra: prosty tor schodzący pod ziemię bokiem `down`. */
  | { type: 'buildRamp'; x: number; y: number; down: Side }
  /** Peron obok istniejącej stacji ją rozbudowuje; `separate` – osobna stacja. */
  | {
      type: 'buildStation';
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      axis: StationAxis;
      separate?: boolean;
      /** Stacja metra (poziom −1). */
      under?: boolean;
    }
  /** Rozbiórka kafelka peronu metra. */
  | { type: 'removeUnderStation'; x: number; y: number }
  /** Punkt kontrolny na istniejącym prostym torze. */
  | { type: 'buildWaypoint'; x: number; y: number }
  | { type: 'buildDepot'; x: number; y: number; side: Side }
  /** `engineCount` – 2 lokomotywy (podwójna trakcja); domyślnie 1. */
  | { type: 'buyTrain'; depotId: number; engine: string; wagons: string[]; engineCount?: number }
  | { type: 'sellTrain'; trainId: number }
  /** Magazyn wagonów w zajezdni i zmiany składu (pociąg stoi w zajezdni). */
  | { type: 'buyWagon'; depotId: number; wagon: string }
  | { type: 'sellSpareWagon'; depotId: number; index: number }
  | { type: 'attachWagon'; trainId: number; index: number }
  | { type: 'detachWagon'; trainId: number; index: number }
  | { type: 'sellEngine'; trainId: number }
  /** Podwójna trakcja: liczba lokomotyw pociągu stojącego w zajezdni. */
  | { type: 'setEngineCount'; trainId: number; count: number }
  /** Grupy pociągów. */
  | { type: 'createGroup'; name: string }
  | { type: 'renameGroup'; groupId: number; name: string }
  | { type: 'deleteGroup'; groupId: number }
  | { type: 'setTrainGroup'; trainId: number; groupId: number | null }
  /** Kopia pociągu (lokomotywa, wagony, rozkład) do zajezdni. */
  | { type: 'cloneTrain'; trainId: number; shared?: boolean }
  /** Odłącza pociąg od wspólnego rozkładu (zostaje z jego kopią). */
  | { type: 'unshareOrders'; trainId: number }
  | { type: 'startTrain'; trainId: number }
  | { type: 'stopTrain'; trainId: number }
  | { type: 'sendToDepot'; trainId: number }
  | { type: 'reverseTrain'; trainId: number }
  /** Wymiana lokomotywy na inną (null – anulowanie zamówionej wymiany). */
  | { type: 'replaceEngine'; trainId: number; engine: string | null }
  | { type: 'setOrders'; trainId: number; orders: number[]; fullLoad?: boolean[]; waitDays?: number[]; nonStop?: boolean[] }
  /** „Bez zatrzymania” przy pozycji rozkładu. */
  | { type: 'toggleNonStop'; trainId: number; index: number }
  /** Rozkład czasowy: dodatkowy postój przy pozycji rozkładu i równe odstępy na linii. */
  | { type: 'setWaitDays'; trainId: number; index: number; days: number }
  | { type: 'setSpacing'; trainId: number; on: boolean }
  /** Ptaszek „czekaj na pełny ładunek” przy pozycji rozkładu. */
  | { type: 'toggleFullLoad'; trainId: number; index: number }
  | { type: 'placeSignal'; x: number; y: number; track: Track; oneWay: boolean; under?: boolean }
  | { type: 'removeSignal'; x: number; y: number; track: Track; under?: boolean }
  | { type: 'setSignalMode'; mode: SignalMode }
  | { type: 'buildBridge'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'buildTunnel'; x: number; y: number }
  | { type: 'terraform'; vx: number; vy: number; delta: 1 | -1 }
  | { type: 'levelLand'; vx0: number; vy0: number; vx1: number; vy1: number; level: number }
  /** Sieć trakcyjna nad torami na wskazanych kafelkach (most / tunel – w całości). */
  | { type: 'buildCatenary'; tiles: { x: number; y: number }[] }
  | { type: 'removeCatenary'; tiles: { x: number; y: number }[] }
  /** Kredyt: pożyczka / spłata (kwota zaokrąglana do kroku kredytu, przycinana do możliwej). */
  | { type: 'borrow'; amount: number }
  | { type: 'repay'; amount: number }
  /** Badania: rozpoczęcie następnego poziomu / przerwanie trwającego. */
  | { type: 'startResearch'; id: ResearchId }
  | { type: 'cancelResearch' }
  /** Testy: dopisanie pieniędzy (poza księgą finansów). */
  | { type: 'addMoney'; amount: number };

export type FailReason =
  | 'outOfBounds'
  | 'nothingToClear'
  | 'noMoney'
  | 'blocked'
  | 'nothingToRemove'
  | 'tooBig'
  | 'depotNotEmpty'
  | 'notInDepot'
  | 'depotNotConnected'
  | 'trainInWay'
  | 'industry'
  | 'tooHigh'
  | 'bridgeHeads'
  | 'bridgeLow'
  | 'tunnelNoExit'
  | 'noTrack'
  | 'alreadyBuilt'
  | 'notAvailable'
  | 'noCatenary'
  | 'noDepot'
  | 'loanLimit'
  | 'noLoan'
  | 'bankrupt';

export type CommandResult = { ok: true } | { ok: false; reason: FailReason };

/** Zdarzenia dla warstwy prezentacji (renderer, UI). Nie wpływają na symulację. */
export type SimEvent =
  | { type: 'tileChanged'; x: number; y: number }
  | { type: 'stationsChanged' }
  /** Postawiono / rozebrano zajezdnię (podpisy z numerami na mapie). */
  | { type: 'depotsChanged' }
  | { type: 'trainsChanged' }
  | { type: 'signalsChanged' }
  | { type: 'bridgesChanged' }
  | { type: 'tunnelsChanged' }
  | { type: 'researchChanged' }
  /** Badanie zakończone – nowy poziom. */
  | { type: 'researchDone'; id: ResearchId }
  /** Zmiana torów, zjazdów lub stacji metra (renderer poziomu −1 rysuje się od nowa). */
  | { type: 'undergroundChanged' }
  /** Miasto urosło na tyle, że domaga się metra (raz na miasto). */
  | { type: 'metroDemand'; townId: number }
  /** Zapłata za dostawę – (x, y) w układzie logicznym, do napisu nad pociągiem. */
  | { type: 'income'; amount: number; x: number; y: number }
  /** Zamknięcie miesiąca z ujemnym saldem: tyle miesięcy do bankructwa. */
  | { type: 'debtWarning'; monthsLeft: number }
  | { type: 'bankrupt' }
  /** Nowy rok: lokomotywy, które właśnie weszły do sprzedaży. */
  | { type: 'newEngines'; engines: string[] }
  | { type: 'engineReplaced'; trainId: number }
  | { type: 'trainCloned'; trainId: number; depotId: number }
  /** Nowy rok: pociągi, które w zeszłym roku przyniosły stratę. */
  | { type: 'unprofitableTrains'; trainIds: number[] }
  | { type: 'replaceFailed'; trainId: number; reason: 'noMoney' | 'noCatenary' | 'notAvailable' }
  | { type: 'commandFailed'; command: Command; reason: FailReason };

export function applyCommand(state: GameState, cmd: Command, events: SimEvent[]): CommandResult {
  // Po bankructwie gra jest skończona.
  if (state.finances.bankrupt) return { ok: false, reason: 'bankrupt' };
  const result = apply(state, cmd, events);
  // Rozbiórka toru lub stacji mogła zostawić semafory bez toru.
  if (
    result.ok &&
    (cmd.type === 'removeTrack' || cmd.type === 'clearTile' || cmd.type === 'buildStation' || cmd.type === 'removeUnderStation')
  ) {
    dropOrphanSignals(state, events);
    dropOrphanCatenary(state, events);
  }
  return result;
}

function apply(state: GameState, cmd: Command, events: SimEvent[]): CommandResult {
  switch (cmd.type) {
    case 'clearTile':
      return clearTile(state, cmd.x, cmd.y, events);
    case 'buildTrack':
      return cmd.under ? buildUnderTrack(state, cmd.pieces, events) : buildTrack(state, cmd.pieces, events);
    case 'removeTrack':
      return cmd.under ? removeUnderTrack(state, cmd.pieces, events) : removeTrack(state, cmd.pieces, events);
    case 'startResearch':
      return startResearch(state, cmd.id, events);
    case 'cancelResearch':
      return cancelResearch(state, events);
    case 'buildRamp':
      return buildRamp(state, cmd.x, cmd.y, cmd.down, events);
    case 'buildStation':
      return buildStation(state, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.axis, events, cmd.separate === true, cmd.under === true);
    case 'removeUnderStation':
      if (occupiedTiles(state).has(cmd.y * state.map.width + cmd.x)) return { ok: false, reason: 'trainInWay' };
      return removeStationTile(state, cmd.x, cmd.y, events, true);
    case 'buildWaypoint':
      return buildWaypoint(state, cmd.x, cmd.y, events);
    case 'buildDepot':
      return buildDepot(state, cmd.x, cmd.y, cmd.side, events);
    case 'buyTrain':
      return buyTrain(state, cmd.depotId, cmd.engine, cmd.wagons, events, cmd.engineCount ?? 1);
    case 'buyWagon':
      return buyWagon(state, cmd.depotId, cmd.wagon, events);
    case 'sellSpareWagon':
      return sellSpareWagon(state, cmd.depotId, cmd.index, events);
    case 'attachWagon':
      return attachWagon(state, cmd.trainId, cmd.index, events);
    case 'detachWagon':
      return detachWagon(state, cmd.trainId, cmd.index, events);
    case 'sellEngine':
      return sellEngine(state, cmd.trainId, events);
    case 'setEngineCount':
      return setEngineCount(state, cmd.trainId, cmd.count, events);
    case 'createGroup':
      return createGroup(state, cmd.name, events);
    case 'renameGroup':
      return renameGroup(state, cmd.groupId, cmd.name, events);
    case 'deleteGroup':
      return deleteGroup(state, cmd.groupId, events);
    case 'setTrainGroup':
      return setTrainGroup(state, cmd.trainId, cmd.groupId, events);
    case 'cloneTrain':
      return cloneTrain(state, cmd.trainId, events, cmd.shared !== false);
    case 'unshareOrders':
      return unshareOrders(state, cmd.trainId);
    case 'sellTrain':
      return sellTrain(state, cmd.trainId, events);
    case 'startTrain':
      return startTrain(state, cmd.trainId);
    case 'stopTrain':
      return stopTrain(state, cmd.trainId);
    case 'sendToDepot':
      return sendToDepot(state, cmd.trainId);
    case 'replaceEngine':
      return requestReplace(state, cmd.trainId, cmd.engine, events);
    case 'reverseTrain':
      return requestReverse(state, cmd.trainId);
    case 'setOrders':
      return setOrders(state, cmd.trainId, cmd.orders, cmd.fullLoad, cmd.waitDays, cmd.nonStop);
    case 'toggleNonStop':
      return toggleNonStop(state, cmd.trainId, cmd.index);
    case 'setWaitDays':
      return setWaitDays(state, cmd.trainId, cmd.index, cmd.days);
    case 'setSpacing':
      return setSpacing(state, cmd.trainId, cmd.on);
    case 'toggleFullLoad':
      return toggleFullLoad(state, cmd.trainId, cmd.index);
    case 'placeSignal':
      return placeSignal(state, cmd.x, cmd.y, cmd.track, cmd.oneWay, events, cmd.under === true);
    case 'removeSignal':
      return removeSignal(state, cmd.x, cmd.y, cmd.track, events, cmd.under === true);
    case 'buildBridge':
      return buildBridge(state, cmd.x0, cmd.y0, cmd.x1, cmd.y1, events);
    case 'buildTunnel':
      return buildTunnel(state, cmd.x, cmd.y, events);
    case 'terraform':
      return applyTerraform(state, planTerraform(state, terraformTargets(state, cmd.vx, cmd.vy, cmd.delta)), events);
    case 'levelLand':
      return applyTerraform(
        state,
        planTerraform(state, levelTargets(state, cmd.vx0, cmd.vy0, cmd.vx1, cmd.vy1, cmd.level)),
        events,
      );
    case 'addMoney':
      state.money += cmd.amount;
      return { ok: true };
    case 'buildCatenary':
      return buildCatenary(state, cmd.tiles, false, events);
    case 'removeCatenary':
      return buildCatenary(state, cmd.tiles, true, events);
    case 'borrow':
      return borrow(state, cmd.amount);
    case 'repay':
      return repay(state, cmd.amount);
    case 'setSignalMode':
      state.signalMode = cmd.mode;
      events.push({ type: 'signalsChanged' });
      return { ok: true };
  }
}

/** Buldożer na pojedynczym kafelku: zajezdnia lub stacja, potem tory, potem nieużytek. */
function clearTile(state: GameState, x: number, y: number, events: SimEvent[]): CommandResult {
  const { map } = state;
  if (!inBounds(map, x, y)) return { ok: false, reason: 'outOfBounds' };
  if (occupiedTiles(state).has(y * map.width + x)) return { ok: false, reason: 'trainInWay' };
  if (map.station[y * map.width + x]) return removeStationTile(state, x, y, events);
  const i = y * map.width + x;
  if (map.ramp[i]) return removeRamp(state, x, y, events);
  if (map.industry[i]) return { ok: false, reason: 'industry' };
  // Portal tunelu – rozbiórka całego tunelu.
  const tunnel = tunnelAt(state, x, y);
  if (tunnel && tunnelRole(tunnel, x, y) !== 'inside') {
    const occupied = occupiedTiles(state);
    if (tunnelTileCoords(tunnel).some((t) => occupied.has(t.y * map.width + t.x))) return { ok: false, reason: 'trainInWay' };
    return removeTunnel(state, tunnel, events);
  }
  // Most: przyczółek albo pomost bez toru pod spodem – rozbiórka całego mostu.
  const bridge = bridgeAt(state, x, y);
  if (bridge && (bridgeRole(bridge, x, y) !== 'span' || !map.track[i])) {
    const occupied = occupiedTiles(state);
    if (bridgeTileCoords(bridge).some((t) => occupied.has(t.y * map.width + t.x))) return { ok: false, reason: 'trainInWay' };
    return removeBridge(state, bridge, events);
  }
  if (map.house[i]) {
    if (state.money < HOUSE_DEMOLISH_COST) return { ok: false, reason: 'noMoney' };
    spend(state, 'construction', HOUSE_DEMOLISH_COST);
    map.house[i] = 0;
    map.houseBuild[i] = 0;
    map.town[i] = 0;
    events.push({ type: 'tileChanged', x, y });
    return { ok: true };
  }
  const depot = depotAt(state, x, y);
  if (depot) {
    if (trainsInDepot(state, depot.id).length || depot.wagons.length) return { ok: false, reason: 'depotNotEmpty' };
    return removeDepot(state, depot, events);
  }
  const bits = getTrackBits(map, x, y);
  if (bits)
    return removeTrack(
      state,
      tracksOn(bits).map((track) => ({ x, y, track })),
      events,
    );
  if (map.road[i]) {
    if (state.money < ROAD_REMOVE_COST) return { ok: false, reason: 'noMoney' };
    spend(state, 'construction', ROAD_REMOVE_COST);
    map.road[i] = 0;
    events.push({ type: 'tileChanged', x, y });
    return { ok: true };
  }
  if (getTerrain(map, x, y) !== Terrain.Rough) return { ok: false, reason: 'nothingToClear' };
  if (state.money < CLEAR_ROUGH_COST) return { ok: false, reason: 'noMoney' };
  spend(state, 'construction', CLEAR_ROUGH_COST);
  setTerrain(map, x, y, Terrain.Grass);
  events.push({ type: 'tileChanged', x, y });
  return { ok: true };
}

/** Kwota kredytu: wielokrotność kroku, co najmniej jeden krok. */
function loanAmount(amount: number): number {
  return Math.max(LOAN_STEP, Math.round(amount / LOAN_STEP) * LOAN_STEP);
}

function borrow(state: GameState, amount: number): CommandResult {
  const f = state.finances;
  const value = Math.min(loanAmount(amount), LOAN_MAX - f.loan);
  if (value <= 0) return { ok: false, reason: 'loanLimit' };
  f.loan += value;
  state.money += value;
  return { ok: true };
}

function repay(state: GameState, amount: number): CommandResult {
  const f = state.finances;
  if (f.loan <= 0) return { ok: false, reason: 'noLoan' };
  const value = Math.min(loanAmount(amount), f.loan);
  if (state.money < value) return { ok: false, reason: 'noMoney' };
  f.loan -= value;
  state.money -= value;
  return { ok: true };
}
