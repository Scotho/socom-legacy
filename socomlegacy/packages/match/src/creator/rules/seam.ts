/**
 * FCW-31: the seam between the room (`../../room.ts`) and a rule host -- what the room tells a host, what the room lets a
 * host see and do, and what reaches the page. RULES_ADAPTATION (`@s2u/creator-contracts`): a browser adaptation with no
 * original. The room calls a host only when `RoomOptions.ruleHost` is set; absent, no event is built and no outcome path
 * changes. A host's actions on the room go through the room's own paths (spec §5: outcomes are the room's).
 */
import type { Team } from '../../../../viewer/src/net/protocol';
import type { RuleEventInput } from './events';

export type RuleV3 = [number, number, number];

/** How the room lays a rule's damage (`player.damage`, `zone.hazard`): on the body, the armour out of it (`LIMB_SPILL_PIERCING`), a death no one's. */
export const RULE_DAMAGE_ADAPTATION = "a rule's damage on the body at LIMB_SPILL_PIERCING; its death the room's kill, scored to no one" as const;
/** A blast's hit scaled by the rules: its fragments laid again at the factor; a factor of 0 lays no knock, another keeps the unscaled blast's. */
export const RULE_BLAST_KNOCK_ADAPTATION = "a scaled blast's knock: none at 0, the unscaled blast's otherwise" as const;

/** A seat as the rules see it: its id, side, whether its body lives, whether the round has put it out, where its feet are. */
export interface RulePlayer {
  readonly id: number;
  readonly team: Team;
  readonly alive: boolean;
  /** Out of the round: a classic death, or a rule's `player.eliminate`. */
  readonly out: boolean;
  readonly feet: RuleV3;
}

/** The room as a host reads it. */
export interface RuleRoomView {
  readonly tick: number;
  /** The seated players (not the spectators). */
  players(): readonly RulePlayer[];
}

/** One presented thing (`message.show`, `cue.play`, `hud.value`): `to` its seats, null every seat. */
export type RulesShow =
  | { kind: 'message'; text: string; to: readonly number[] | null }
  | { kind: 'cue'; cue: string; to: readonly number[] | null }
  | { kind: 'hud'; label: string; value: number | boolean | string; to: readonly number[] | null };

/**
 * What the room sends the page for its rules (additive: a page that does not read them ignores an unknown `type`; FCW-32
 * draws them). `rulesPurchase`: the requester's answer, once. `rulesPresent`: a tick's presentation, the pack's own
 * (never the engine's result rows, spec §10).
 */
export type RulesWire =
  | { type: 'rulesPurchase'; seq: number; item: string; result: 'accepted' | 'refused'; reason?: string }
  | { type: 'rulesPresent'; mode: string; shows: readonly Omit<RulesShow, 'to'>[] };

/** The room as a host acts on it: each through the room's own path. */
export interface RuleRoom extends RuleRoomView {
  /** The round in play (a purchase's `phase`). */
  inRound(): boolean;
  /** `player.damage`, `zone.hazard`: the room's damage path; a death is the room's kill, scored to no one. */
  damage(id: number, amount: number, cause: string): void;
  /** `player.eliminate`: out of the round -- killed if alive, no respawn this round. */
  eliminate(id: number): void;
  /** `score.award`: a seat's score and round score, or a side's team carry. */
  award(to: { player: number } | { team: Team }, points: number): void;
  /** `round.end`: the round won by `winner` (null: drawn), through the room's round end. */
  endRound(winner: Team | null): void;
  /** `match.end`: as `endRound`, the match over with it. */
  endMatch(winner: Team | null): void;
  /** `door.open|close`: the map's door by its scene node's name, through the room's door path; false when it did not move. */
  door(id: string, open: boolean): boolean;
  /** `spawner.release` of a player spawner: the seat (re)spawned at `at`, its `player.spawn` naming the spawner. */
  respawn(id: number, at: RuleV3, yaw: number, spawner: string): void;
  /** A wire for the page: to one seat, or (absent) to every connection. */
  tell(ev: RulesWire, to?: number): void;
  /** A client request dropped, tallied as the room's own drops (`rulePurchase: <why>`). */
  drop(id: number, why: string): void;
}

/** What the room tells its rule host. */
export interface RoomRuleHost {
  /** Once, from the room's constructor. */
  attach(room: RuleRoom): void;
  /** One of the room's outcomes as an event (`./events`); the host numbers it. */
  event(input: RuleEventInput): void;
  /** A hit about to be laid (`player.hit`): the factor its damage is multiplied by (`hit.scale`); 1 when nothing scales it. */
  hit(input: RuleEventInput): number;
  /** The round's end (`round.end`) before the room tells it: true when a rule answering it asks `match.end` (this round the match's last). */
  roundEnd(input: RuleEventInput): boolean;
  /** A client's request for the rules (`rulePurchase`), its shape unchecked. */
  request(player: number, raw: Readonly<Record<string, unknown>>): void;
  /** The end of each room step, after the tick's outcomes. */
  endStep(): void;
}
