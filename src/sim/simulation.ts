import { applyCommand, type Command, type SimEvent } from './commands';
import { tickResearch } from './research';
import type { GameState } from './state';
import { buildTrackGraph, type TrackGraph } from './track/graph';
import { dailyCargo } from './economy/cargoFlow';
import { monthlyEconomy } from './economy/monthly';
import { DAYS_PER_MONTH, TICKS_PER_DAY } from './time';
import { Planner, tickTrains } from './trains/movement';

export class Simulation {
  private queue: Command[] = [];
  private events: SimEvent[] = [];
  private trackGraph: TrackGraph | null = null;
  /** Trasy pociągów – stan pochodny, liczony od nowa po zmianach. */
  readonly planner = new Planner();

  constructor(readonly state: GameState) {}

  enqueue(cmd: Command): void {
    this.queue.push(cmd);
  }

  /** Wykonuje oczekujące komendy bez upływu czasu (działa też podczas pauzy). */
  processCommands(): void {
    const cmds = this.queue;
    this.queue = [];
    for (const cmd of cmds) {
      const result = applyCommand(this.state, cmd, this.events);
      if (!result.ok) this.events.push({ type: 'commandFailed', command: cmd, reason: result.reason });
      // Udana komenda mogła zmienić tory – graf przebudujemy przy następnym odczycie.
      else {
        this.trackGraph = null;
        this.planner.invalidate();
      }
    }
  }

  /** Jeden tick symulacji: komendy, potem systemy gry. */
  step(): void {
    this.processCommands();
    // Po bankructwie czas stoi.
    if (this.state.finances.bankrupt) return;
    tickTrains(this.state, this.planner, this.events);
    this.state.tick++;
    tickResearch(this.state, this.events);
    if (this.state.tick % TICKS_PER_DAY === 0) dailyCargo(this.state);
    if (this.state.tick % (TICKS_PER_DAY * DAYS_PER_MONTH) === 0) monthlyEconomy(this.state, this.events);
  }

  /** Graf torów – stan pochodny, przebudowywany leniwie po zmianie torów. */
  get graph(): TrackGraph {
    return (this.trackGraph ??= buildTrackGraph(this.state.map, this.state.depots));
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
