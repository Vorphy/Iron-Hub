import { applyCommand, type Command, type SimEvent } from './commands';
import type { GameState } from './state';

export class Simulation {
  private queue: Command[] = [];
  private events: SimEvent[] = [];

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
    }
  }

  /** Jeden tick symulacji: komendy, potem systemy gry. */
  step(): void {
    this.processCommands();
    this.state.tick++;
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
