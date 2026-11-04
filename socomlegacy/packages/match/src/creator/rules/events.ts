/**
 * FCW-31: the room's typed rule events (spec `docs/specs/2026-10-27-creator-rules-contract.md` §4's events, §6's order;
 * the names and payloads are FCW-30's frozen vocabulary, `@s2u/creator-contracts` `RULE_EVENTS`/`RULE_EVENT_SPECS`).
 * RULES_ADAPTATION: a browser adaptation with no original -- the events are read off the room's existing outcomes and
 * change none of them; a room with no rule host builds none.
 *
 * Each event carries a room-unique, rising sequence id (`RuleEventStream`); a rule fires at most once per event (the host
 * drops an id it has already taken, `RuleHost.deliver`). `depth` is its step in a chain: 0 for the room's own outcome, one
 * more than its cause's for an event an action caused (`RULE_CHAIN_DEPTH_ADAPTATION` bounds it).
 */
import type { RuleEventName } from '@s2u/creator-contracts';

/** An event as the room (or the host's own engine: zones, timers, items, purchases) names it, before it is numbered. */
export interface RuleEventInput {
  readonly name: RuleEventName;
  /** The seat ids it carries, by their part (`RULE_EVENT_SPECS[name].roles`); absent when the event carries none (a world kill's attacker). */
  readonly player?: number;
  readonly attacker?: number;
  readonly victim?: number;
  /** The id a rule's `when` filter matches (`RULE_EVENT_SPECS[name].filter`): a zone, a door or switch, an item, a timer, a phase, a spawner. */
  readonly id?: string;
  /** Its fields (`RULE_EVENT_SPECS[name].fields`). */
  readonly fields?: Readonly<Record<string, number | string>>;
}

/** A numbered event. */
export interface RuleEvent extends RuleEventInput {
  readonly seq: number;
  /** The room's tick it happened on. */
  readonly tick: number;
  readonly depth: number;
}

/** The room's one numbering: ids from 1, rising, never reused; `advance` keeps it past an id taken from elsewhere. */
export class RuleEventStream {
  private next = 1;
  emit(input: RuleEventInput, tick: number, depth: number): RuleEvent {
    return { ...input, seq: this.next++, tick, depth };
  }
  advance(seq: number): void { if (seq >= this.next) this.next = seq + 1; }
}

/**
 * An objective the room scored (`objectiveScore.ts` `ObjectiveEvent`, the room's `scoreObjective`) as `objective.change`'s
 * fields: the bomb's three transitions, a hostage's rescue and kill, an action record's use.
 */
export function objectiveFields(kind: 'plant' | 'defuse' | 'detonate' | 'action' | 'rescue' | 'hostageKill'): { objective: string; state: string } {
  switch (kind) {
    case 'plant': return { objective: 'bomb', state: 'planted' };
    case 'defuse': return { objective: 'bomb', state: 'defused' };
    case 'detonate': return { objective: 'bomb', state: 'detonated' };
    case 'rescue': return { objective: 'hostage', state: 'rescued' };
    case 'hostageKill': return { objective: 'hostage', state: 'killed' };
    case 'action': return { objective: 'action', state: 'used' };
  }
}
