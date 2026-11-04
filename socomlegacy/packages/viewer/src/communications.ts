import { TAUNT_DELAY_SECONDS, TAUNT_SLOTS, validTauntText } from './taunts';

/**
 * The Chat menu's team communications (web research 302 §3; Chris's settings): TACTICAL ORDERS and MESSAGES, sent to
 * the room and routed by it (`packages/match/src/room.ts`) -- the request's shape, the original's rules on it and the
 * transport's safeguards, shared by the page (`./matchChat`) and the server. Pure: no DOM.
 */

/** TACTICAL ORDERS' commands in the menu's order (`FUN_002344e0`, 00234898..002349c8): HOLD FIRE ... POINT. */
export const TACTICAL_COMMANDS = [6, 3, 23, 45, 46, 47, 48] as const;
/** DEFUSE THE BOMB and PROTECT TARGET, the two the game type gates (`FUN_0022fa90`, the jump table 0x3e5d30). */
const DEFUSE = 46, PROTECT = 47;
/** A MESSAGES slot's node: the custom messages are 49..53 (research 302 §3). */
const MESSAGE_NODE = 49;

/** Whether a tactical command is one of the seven and allowed in the game type (DEFUSE in types 1-2, PROTECT in 3-4). */
export function tacticalAllowed(command: unknown, gameType: number | undefined): boolean {
  if (!TACTICAL_COMMANDS.includes(command as (typeof TACTICAL_COMMANDS)[number])) return false;
  if (command === DEFUSE) return gameType === 1 || gameType === 2;
  if (command === PROTECT) return gameType === 3 || gameType === 4;
  return true;
}

export type CommunicationChoice = { kind: 'tactical'; command: number } | { kind: 'custom'; slot: number; text: string };
export type CommunicationRequest = CommunicationChoice & { request: number };

/**
 * The room's check of a page's requests: the original's per-node five-second delay (`TAUNT_DELAY_SECONDS`, the menu's
 * node, research 301 §7), and -- transport safeguards, not the original's -- a known shape and no other field, a
 * request id rising per connection (a replay or a repeat refused), a slot of the five, a text the keyboard could make.
 */
export class CommunicationRequests {
  private held = new Map<number, { request: number; until: Map<number, number> }>();
  forget(id: number): void { this.held.delete(id); }
  /** OBF-20: a new match, as `TauntRequests.renumber` -- every seat's last request forgotten; each node's delay kept. */
  renumber(): void { for (const v of this.held.values()) v.request = 0; }
  /** OBF-20 (the review's F1): the seat's last request taken, 0 for none -- the `resume` event's `communication`. */
  last(id: number): number { return this.held.get(id)?.request ?? 0; }
  accept(id: number, raw: unknown, now: number): CommunicationRequest | null {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>, previous = this.held.get(id);
    if (Object.keys(v).some((k) => !['type', 'kind', 'command', 'slot', 'text', 'request'].includes(k))) return null;
    if (!Number.isSafeInteger(v.request) || (v.request as number) < 1 || (previous && (v.request as number) <= previous.request)) return null;
    let choice: CommunicationChoice, node: number;
    if (v.kind === 'tactical' && TACTICAL_COMMANDS.includes(v.command as (typeof TACTICAL_COMMANDS)[number]) && v.slot === undefined && v.text === undefined) {
      choice = { kind: 'tactical', command: v.command as number }; node = choice.command;
    } else if (v.kind === 'custom' && v.command === undefined && Number.isInteger(v.slot) && (v.slot as number) >= 0 && (v.slot as number) < TAUNT_SLOTS
      && validTauntText(v.text) && v.text.length) {
      choice = { kind: 'custom', slot: v.slot as number, text: v.text }; node = MESSAGE_NODE + choice.slot;
    } else return null;
    const until = previous?.until ?? new Map<number, number>();
    if (now < (until.get(node) ?? -Infinity)) return null;
    until.set(node, now + TAUNT_DELAY_SECONDS * 1000);
    this.held.set(id, { request: v.request as number, until });
    return { ...choice, request: v.request as number };
  }
}
