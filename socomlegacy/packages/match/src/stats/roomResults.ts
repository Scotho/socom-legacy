/**
 * SVC-12d (web sprint 22, W22.R1; research 264 §1, research 155 §4.1-§4.3): the two results a game's room hands the
 * services -- a `RoomRoundResult` at every round's end, and at the match's end a `RoomMatchResult` **then** the last
 * round's `RoomRoundResult` (the original's order: the exit state's enter folds at the game over, `FUN_00223970`
 * D:L76078-76082, and its leave rates the round, `FUN_002232a0` D:L75798-75805) -- and the queue the bridge owns that
 * takes them. The room builds them from its own counters (`room.ts`, `Room.endRound`) and carries them on SVC-12c's
 * `RoundOverReport` (never a second hook); the hand-over is an O(1) enqueue (`ResultsQueue.enqueue`), drained after the
 * tick that enqueued it, never inside it (research 155 §4.2: the store's commit is synchronous and must never run in a
 * room's tick). Applying them -- the fold (SVC-12a), the rating (SVC-13a), the mark, the audit line -- is SVC-07's.
 *
 * Sources: the retail decompilation `socom2_game.elf.decomp.c` (`D:L<n>`, `FUN_<addr>`), cited, never pasted.
 */
import type { MatchBlock, Side } from './accountStats';
import type { RatingSeat, RoundResult } from './rating';

/**
 * JOIN_IN_PROGRESS_MARK_READING (research 264 §1, §6; research 155 §2.1, §8): a seat "joined the game in progress" when
 * the room seated it after its match had begun -- the reference the match's start, never the room's phase: a classic
 * room's first round started (the room left `waiting`); a respawn room's match a tick before the seat, its first match
 * (which plays from the room's building) beginning with its first seat, so its first seats are not in progress. A
 * takeover keeps its seat's mark (`TAKEOVER_ROW_READING`); a new match clears it. What the calculator reads is the player state's +0x43 not being
 * -1 (`FUN_002c2dc0` D:L164486-164513, D:L76756), set once as the joining client applies the game's state -- to the
 * rounds played if game +0xcd is set, else -1 (`FUN_002c06a0` D:L163205-163210) -- and +0xcd is set on a client whose
 * +0xcc is set as it connects (`FUN_001f5e70` D:L55715-55717). That the pair means "the match had begun when I joined"
 * is a reading of those lines; +0xcc's own setter (D:L149278) and its callers are not read, and nothing of it is
 * measured. Settled by a two-console run with a join in round 2 (ONL-32's per-round posts: the joiner's change halved).
 */
export const JOIN_IN_PROGRESS_MARK_READING = 'seated after its match began' as const;

/**
 * SEAT_PLAYED_MS_READING (research 264 §1, §6): a seat's time played in its match, the stand-in for the console's own
 * game +0xf0 (the fold's clock total, `MATCH_CLOCK_TOTAL_READING`): each round's ticks from its start, or from the seat's
 * seating when later, to the room's round end (`endRound`), in ms, summed over the match. The console's +0xf0 is zeroed
 * at the game's creation on that console (`FUN_002ad290` D:L152597) and added the round's +0xe8 at each round's end
 * (`FUN_002a9b30` D:L150666-150669), so a joiner's sum starts with its own game; whether a joiner's first +0xe8 counts
 * from the round's start (+0xe4, the host's) or from its join is not read. Settled with `MATCH_CLOCK_TOTAL_READING` by
 * a joiner's TOTAL PLAYING TIME read back after a match (PLAT-36's PEEK) or ONL-32's post.
 */
export const SEAT_PLAYED_MS_READING = 'from the round\'s start or the seat\'s seating, to the round\'s end' as const;

/**
 * SEAT_ROUNDS_READING (research 264 §1, §6): a seat's rounds won, lost and drawn in its match -- each round it played
 * (seated at the round's start, not a ghost of it) and saw end, by the round's winner: its side, the other, or none (a
 * draw). Research 155 §4.2 lists them in the `MatchResult`; the original's fold reads the sides' round wins instead
 * (game +0x120 / +0x124, `FUN_00225070` D:L76650-76651, `roundsOf`), which the result carries as well. A port's count
 * with no single source: whether a ghost's round or a round left early counts for a seat is not the original's to say.
 */
export const SEAT_ROUNDS_READING = 'the rounds the seat played, not as a ghost, by the round\'s winner' as const;

/** A leaver's round in the rating: in no calculator (`'none'`, as the original), or counted on its side (`'counted'`). */
export type LeaveCost = 'none' | 'counted';

/**
 * LEAVE_COST_OWNER (research 264 §1, §2, §6; research 155 §4.3, §6 call 7): the owner's rule, OT.R33 call 7 (b)
 * (`plans/2026-10-02-online-path-target.md`, OT.R33: "People who quit still have their match and history recorded when
 * the server writes it at the end"): a player who quits **keeps the match** -- his seat's counters as they stood when he
 * left, in the `RoomMatchResult` the room hands over at the match's end (`Room.handOverOf`, the match's leavers) and
 * folded into his record with the rest -- with no extra penalty: in the rating he is as the original's leaver, in no
 * calculator of the round he left nor of any later one (his console never reaches their ends; the leave ghosts his actor
 * on the others, +0xfd1 by `FUN_002bef60` D:L162534, which the calculator skips, D:L76717), so `roundResultOf` leaves
 * him out (`'none'`); its `'counted'` branch stays the owner's other option for the round. The original's leaver folds
 * nothing (`FUN_00223970` runs the fold at the game over only, D:L76078-76082): the kept match is the owner's departure.
 */
export const LEAVE_COST_OWNER = 'the match kept' as const;

/**
 * A match's id (research 155 §4.2): the room's id (the game's, `RoomOptions.handOver.roomId`), the match's serial in
 * that room (from 1) and its start time (the room's clock in ms at its first round's start) -- unique for the server's
 * life and across restarts.
 */
export interface MatchId { room: number; serial: number; startedAt: number }

/**
 * A seat of a `RoomRoundResult`: SVC-13a's `RatingSeat` but its rating, which is the store's (SVC-07 reads it as it
 * applies the round, `withRatings`: the rating the last round left, research 261 §8.5's published rating). `id` is the
 * account's, as a string; `left` marks a leaver's seat under `roundResultOf`'s `'counted'` branch.
 */
export interface RoomRatingSeat extends Omit<RatingSeat, 'rating'> {
  account: number;
  left?: true;
}

/**
 * The round's result (research 155 §4.2; `FUN_002253c0` D:L76661-76768's inputs): the match's id and the round, the
 * rounds played (game +0x11c), each side's round wins (+0x120 / +0x124), the winner (+0x128; null none), and each seat on
 * a side in the room's order. `respawn`: a respawn room's round, which the rating's caller skips (the round's rating has
 * the fold's two conditions, D:L75798; research 261 §3). `emptied`: the round a leave emptied a side of, handed over
 * before the room abandons it (research 169 §4.2) -- the wins as they stand, its winner the decided one, else the side
 * still seated.
 */
export interface RoomRoundResult extends Omit<RoundResult, 'seats'> {
  kind: 'round';
  match: MatchId;
  round: number;
  respawn: boolean;
  emptied: boolean;
  seats: RoomRatingSeat[];
}

/**
 * A seat of a `RoomMatchResult`: the match block of research 155 §1.2 as SVC-12a's fold reads it (`MatchBlock`), the
 * seconds played (`playedMs`, `SEAT_PLAYED_MS_READING`, in ms as the fold's clock), the rounds won, lost and drawn
 * (`SEAT_ROUNDS_READING`) and the join-in-progress mark.
 */
export interface RoomMatchSeat {
  account: number;
  side: Side;
  joinedInProgress: boolean;
  playedMs: number;
  roundsWon: number;
  roundsLost: number;
  roundsDrawn: number;
  block: MatchBlock;
  /**
   * SVC-07 (`LEAVE_COST_OWNER`, OT.R33 call 7 (b)): a seat that left the match -- the match as it stood when it left (the
   * rounds completed, a decided round among them, and the sides' round wins then), which its fold reads in place of the
   * match's end (`roundsOf`, D:L76650-76651), so its rounds are scored as they stood. Absent for a seat there at the end.
   */
  stood?: { roundsPlayed: number; sealRoundWins: number; terroristRoundWins: number };
}

/**
 * The match's result (research 155 §4.2): each seat there at the end, the game type (game +0x111), respawn (+0xdc), the
 * rounds played and the sides' round wins (the fold's game inputs, research 261 §2). A seat gone before the end is in
 * it too, as it stood when it left (`stood`; `LEAVE_COST_OWNER`, OT.R33 call 7 (b)) -- the owner's departure: the
 * original's leaver folds nothing, its console never reaching the game over (research 261 §5.3).
 */
export interface RoomMatchResult {
  kind: 'match';
  match: MatchId;
  gameType: number;
  respawn: boolean;
  roundsPlayed: number;
  sealRoundWins: number;
  terroristRoundWins: number;
  seats: RoomMatchSeat[];
}

/** One result handed over. */
export type HandOver = RoomRoundResult | RoomMatchResult;

/**
 * SVC-23b's read-outs for a seat and its round (research 169 §4.2; the roadmap's OT.R22 note on SVC-12d): the shots and
 * hits (`HIT_COUNT_READING`'s), the hits by the part met (`PART`'s numbers; -1 a shotgun's shell, whose pellets meet
 * several), the requests the room refused by why (`dropped`'s key, the seat's own), the steps in which it ran more than
 * one command (a burst drawn on the credit a stall saved, `CREDIT_MAX`), the commands run, and whether one of them
 * carried input (the idle kick's test). No judgement: a flag is SVC-23b's.
 *
 * SVC-23b (research 264 §5): `burstSizes` -- those steps counted by how many commands each ran (`{ 2: 40, 31: 1 }`), so a
 * flag can tell a stall-and-burst (a step of many commands after a silence) from an honest line's jitter (steps of two
 * or three), which `bursts` alone cannot: an honest page's 400 ms hiccup is 24 commands in a step (HARD-ROUND's
 * `FIRE_STALL_CREDIT_TICKS` and its jitter), a lag switch's second 60.
 */
export interface SeatSignals {
  seat: number;
  shots: number;
  hits: number;
  hitsByPart: Record<number, number>;
  refused: Record<string, number>;
  bursts: number;
  burstSizes: Record<number, number>;
  commands: number;
  input: boolean;
  /** SEC-F1 (OT.R98 step 1): the accepted rounds' offsets from the cone's centre (`ShotCentring`); absent before the first. */
  centring?: ShotCentring;
  /**
   * SIMDROP-INSTR (sim drop #3; an instrument with no original, it changes nothing judged): the page's health. Optional
   * on the wire (a host of an older build reports none); the room's own always carry them (`RoundSignals`).
   * `arrivalLate`: each command's arrival, the first copy the room queued, by its lateness in ticks -- the room's wall
   * clock in ticks less the command's number, over the line's best such offset in the last `LAG_FLOOR_WINDOW_TICKS`
   * (`Room.binary`) -- bucketed about `FIRE_ARRIVAL_JITTER_TICKS` (J) and keyed by each bucket's least lateness
   * (`arrivalBucket`); `arrivalGapMaxMs`: the largest gap between two of the seat's command frames this round (ms,
   * rounded); `staleFires`: the rounds that arrived naming a command more than J older than the last the room ran
   * (`Room.timed`; the decision's own refusal is still `refused['fire: stale']`).
   */
  arrivalLate?: Record<number, number>;
  arrivalGapMaxMs?: number;
  staleFires?: number;
  /**
   * NCW-1 (B-count; an instrument with no original, it changes nothing judged): the seat's accepted rounds this round,
   * each classed once (`RewindClass`) by whether its walk strikes a body with the others rewound to the round's own
   * `viewTick` and at the room's scored rewind (`at`: the clamped `viewTick`, or since NCW-2 B-shown the round's valid
   * displayed tick held to the cap, `Room.shownOf`), keyed `class:bucket` (`rewindAgeBucket` of the round's rewind age,
   * the room's tick less its `viewTick`, in ticks): `{ 'a:0-8': 40, 'b:25-36': 3 }`. Absent before the seat's first
   * classed round, and when the room's `rewindOutcome` is off.
   */
  rewind?: Record<string, number>;
  /** NCW-1: the largest rewind age (ticks, unrounded) among the rounds `rewind` counts. */
  rewindAgeMax?: number;
  /**
   * NCW-1 (the lane seat's addition): the seat's heartbeat round trips this round (`Room.noteRoundTrip`'s raw samples,
   * one a `HEARTBEAT_MS`, before the score row's smoothing), summarised by `rttSummary`; absent with none.
   */
  rtt?: RttSummary;
  /**
   * NCW-6 (an instrument with no original; nothing judged reads it): the commands the room RECEIVED from the seat this
   * round -- each command's first copy queued at intake (`Room.binary`, beside `noteArrival`), apart from `commands`, the
   * commands it ran -- and `wallMs`, the seat's wall time in the round on the room's clock (`RoomOptions.now`), from the
   * round's start or the seat's seating, the later, to the report, in ms, rounded. `commandsReceived / (wallMs / 1000) /
   * TICK_HZ` is the seat's commands per real second over the page's 60 (1.0 real time; central's `commandRate`). A
   * number is received once, however many copies come (an unsynced page's flood cut, `Room.receivedFloor`). The wall time
   * runs on while the seat is away or parked (a reconnect's `handBack` keeps the same seat): it can only lower the ratio
   * (60 s away of 180 s reads about 0.67 at real time), never make a page look fast. Both absent for a seat that sent
   * nothing this round, and from a host of an older build.
   */
  commandsReceived?: number;
  wallMs?: number;
  /**
   * NCW-6 (the lane seat's addition from the field split; an instrument): of `staleFires`, the rounds whose named command
   * the room had dropped unrun in a stretch (`Room.dropStretch`: a stall's backlog, `dropBacklog`, or the intake's flood
   * cut) -- the rest are a page's old rounds on commands that ran (a backgrounded tab's, a reconnect's). A number the page
   * skipped inside a stretch was never received and is not counted; only the last `STALE_DROP_RANGES_MAX_ADAPTATION`
   * runs of dropped numbers are remembered, so a round on an older one undercounts here (never over). On the report
   * whenever `staleFires` is above 0 (0 when none was a drop's); absent with no stale round, and from an older host.
   */
  staleAfterDrop?: number;
  /**
   * NCW-10 (an instrument with no original, the product track): the seat's page build (its hello's `build`, `viewerRev()`,
   * at most `CLIENT_BUILD_MAX_CHARS_ADAPTATION` characters of `[0-9a-z.-]`, `Room.clientBuildOf`) and its build time (the
   * hello's `builtAt`, UTC to the minute, `BUILT_AT_PATTERN`), so a seat's refusals and rates read against the build that
   * made them. Each absent when the page sent none or a malformed one, and from a host of an older build.
   */
  build?: string;
  builtAt?: string;
  /**
   * NCW-17 (the claim-versus-picture instrument, `docs/plans/2026-11-05-netcode-wave.md` section 7; no original, nothing
   * judged reads it): of the rounds `rewind` counts, those whose page sent a valid displayed tick (`fire`'s `shownTick`,
   * `Room.shownOf`), by the claim's lead over the picture -- `viewTick - shownTick`, in ticks, `shownLeadBucket` -- and
   * `shownMiss`, those of them that miss at the scored rewind and hit at the displayed tick (`shownMissOf`). Since NCW-2
   * B-shown such a round is scored AT its displayed tick, so `shownMiss` reads 0 by construction: a tripwire (a count
   * above 0 means the scored tick and the displayed tick parted); a host before B-shown counted the claim's misses
   * there. The round B-shown rescues is NCW-1's `d` beside a lead of 1 or more. `shownLead` absent before the seat's
   * first such round, `shownMiss` before its first miss; both with the room's `rewindOutcome` off, and from a host of an
   * older build.
   */
  shownLead?: Record<string, number>;
  shownMiss?: number;
  /**
   * NCW-2 B-trade (the review's F1; an instrument, it changes nothing judged): the dead shooter's rounds this round the
   * room took into the trade window (`Room.tradeFrame`) -- decided, and refused (each also in `refused` under
   * `fire: trade: <reason>`). Absent before the seat's first. Central's reader (`hostResults.ts` `readSignals`) keeps
   * only the members it names, so it does not store this one yet.
   */
  trade?: { decided: number; refused: number };
}

/**
 * NCW-1 (B-count, `docs/plans/2026-11-05-netcode-wave.md` sections 2, 4; an instrument with no original): a round the
 * room took and walked against the bodies, classed once by two reads -- the walk with the others rewound to the
 * shooter's own `viewTick` (unclamped), and the scored walk at `at`, the room's scored rewind: the `viewTick` clamped
 * to the seat's cap (since NCW-2 B-bound `rewindCapTicks` of its measured round trip: 12 ticks at the floor,
 * `MAX_REWIND_MS`, up to 24 at the ceiling, `REWIND_CEILING_MS_ADAPTATION`), or, since NCW-2 B-shown, the round's valid
 * displayed tick (`shownTick`) held to the same cap (`Room.shownOf`) --
 * `a` the body its walk first strikes at the `viewTick` is struck too at `at`; `b` it strikes a body at the `viewTick`
 * and not that body at `at` (a bystander struck instead does not make it `a`); `c` no body at either; `d` none at the
 * `viewTick` and one at `at`; `e` the `viewTick` older than the room keeps (its history), not tested.
 * In the old age buckets (past the cap) `b` is a round lost to the cap and `d` one the cap's clamp happened to land.
 * In the low buckets (inside the cap) a round without a displayed tick has one read, so only `a` or `c`; a round with a
 * displayed tick behind its `viewTick` is read at two ticks: `d` is a round the picture rescued (a miss where the claim
 * ran on to, a hit where the page drew the body -- B-shown's yield), `b` one that would have struck at the `viewTick`
 * but misses at the picture (B-shown's cost). By `rewindClassOf`.
 */
export const REWIND_CLASSES = ['a', 'b', 'c', 'd', 'e'] as const;
/** NCW-1: one of `REWIND_CLASSES`. */
export type RewindClass = typeof REWIND_CLASSES[number];

/**
 * NCW-1: one ray's two reads -- `viewFirst`, the id of the first body (a player's, or a hostage's) its walk strikes with
 * the bodies at the shooter's `viewTick`, null none; `atStruck`, the ids of every body the scored walk strikes at the
 * scored rewind (`at`: the clamped `viewTick`, or the displayed tick held to the cap, NCW-2 B-shown), in order. Struck means met by the walk, before any friendly-fire gate.
 */
export interface RewindRay {
  viewFirst: number | null; atStruck: readonly number[];
  /**
   * NCW-17: the id of the first body the ray's walk strikes with the bodies rewound to the round's displayed tick (the
   * page's `shownTick`, held to the cap: `max(tick - cap, shownTick)`), null none; absent when the round sent no valid one.
   * Since NCW-2 B-shown that tick is the scored rewind, so this is `atStruck[0]` (the same walk).
   */
  shownFirst?: number | null;
}

/**
 * NCW-1 (the review's F5: by the same body): a round's class from its rays (one, or a shotgun pull's: one round, a hit
 * any ray's) -- a ray hit at the `viewTick` is kept when the same body (its `viewFirst`) is struck at the scored rewind
 * (`REWIND_CLASSES`); `a` some ray kept, `b` some ray hit at the `viewTick` and none kept (a bystander struck instead is
 * still `b`), `d` no ray hit at the `viewTick` and one struck a body at the scored rewind, `c` neither. `e` is the caller's (no read).
 */
export function rewindClassOf(rays: readonly RewindRay[]): Exclude<RewindClass, 'e'> {
  if (rays.some((x) => x.viewFirst !== null)) return rays.some((x) => x.viewFirst !== null && x.atStruck.includes(x.viewFirst)) ? 'a' : 'b';
  return rays.some((x) => x.atStruck.length > 0) ? 'd' : 'c';
}
/**
 * NCW-17 (the review's F5 rule, by the same body, as `rewindClassOf`): whether a round (one ray, or a shotgun pull's: one
 * round) is a miss at the scored rewind and a hit at the displayed tick -- some ray's walk strikes a body at the
 * displayed tick (`shownFirst`) and no ray's scored walk strikes the body it struck there. A bystander struck by the
 * scored walk instead does not make it a hit. Since NCW-2 B-shown a round with a displayed tick is scored at it
 * (`shownFirst` is `atStruck[0]`), so this is false for every such round by construction: a tripwire that reads 0 while
 * the scored and displayed ticks agree. Before B-shown the scored walk was the claim's (`viewTick`) and this counted the
 * claim's misses the picture would have landed.
 */
export function shownMissOf(rays: readonly RewindRay[]): boolean {
  const shown = rays.filter((x) => x.shownFirst !== undefined && x.shownFirst !== null);
  return shown.length > 0 && !shown.some((x) => x.atStruck.includes(x.shownFirst!));
}

/**
 * NCW-17 (an instrument's bands, no game value: an adaptation, research 223 §4): the claim's lead over the picture
 * (`viewTick - shownTick`) in whole ticks at `TICK_HZ` 60 -- `0` the claim on the picture (two snapshots bracket the view
 * tick, or the gap shorter than the page's interpolation); then bands up to 2, 4, 8 and 12 ticks (the scored rewind's
 * floor, `MAX_REWIND_MS` 12 ticks), 24 (Benny's 500 ms gap; since NCW-2 B-bound also the ceiling of a seat's cap,
 * `REWIND_CEILING_MS_ADAPTATION`) and past it. A lead of 13-24 is clamped only for a seat whose cap is below it (a seat
 * under about 50 ms round trip, or with no measure, has 12): the band does not say which. Seven `/metrics` series.
 */
export const SHOWN_LEAD_BUCKETS_ADAPTATION = ['0', '1-2', '3-4', '5-8', '9-12', '13-24', '25+'] as const;
/** NCW-17: each lead bucket's top, in whole ticks (the last open). */
const SHOWN_LEAD_TOPS = [0, 2, 4, 8, 12, 24, Infinity] as const;

/** NCW-17: a lead's bucket -- the lead (fractional ticks) rounded up to whole ticks, at most 0 the first (`0`). */
export function shownLeadBucket(lead: number): typeof SHOWN_LEAD_BUCKETS_ADAPTATION[number] {
  const whole = Math.max(0, Math.ceil(lead));
  return SHOWN_LEAD_BUCKETS_ADAPTATION[SHOWN_LEAD_TOPS.findIndex((top) => whole <= top)]!;
}

/**
 * NCW-17 (an operator's instrument, no original): the server's totals of its rooms' rounds that carried a valid displayed
 * tick, by lead bucket, and of the misses at the scored rewind that hit at the displayed tick (`shownMissOf`), summed
 * from each room's once-a-second `takeRewind` (`add`) for the life of the process, as `RewindTally`. `/metrics`
 * `s2u_shown_lead_rounds_total{lead}` (every bucket always written) and `s2u_shown_miss_rounds_total` -- since NCW-2
 * B-shown a tripwire that reads 0 by construction (a host before it counted the claim's misses): eight series, no seat
 * or room label.
 */
export class ShownTally {
  private readonly lead = new Map<string, number>(SHOWN_LEAD_BUCKETS_ADAPTATION.map((b) => [b, 0] as [string, number]));
  private miss = 0;

  /** One room's take: each seat's lead counts (an unknown bucket or a count below one ignored) and its misses added. */
  add(take: { seats: Record<number, { shownLead?: Record<string, number>; shownMiss?: number }> }): void {
    for (const seat of Object.values(take.seats)) {
      for (const [key, n] of Object.entries(seat.shownLead ?? {})) if (this.lead.has(key) && n > 0) this.lead.set(key, this.lead.get(key)! + n);
      if (seat.shownMiss !== undefined && seat.shownMiss > 0) this.miss += seat.shownMiss;
    }
  }

  /** The Prometheus lines: `s2u_shown_lead_rounds_total{lead="3-4"} 2` in `SHOWN_LEAD_BUCKETS_ADAPTATION` order, then the misses. */
  lines(): string[] {
    return [...[...this.lead].map(([b, n]) => `s2u_shown_lead_rounds_total{lead="${b}"} ${n}`), `s2u_shown_miss_rounds_total ${this.miss}`];
  }
}

/**
 * NCW-1 (the controller's buckets; no game value): the rewind age's bands in whole ticks at `TICK_HZ` 60 -- 0-8 a
 * page's interpolation (6) and the decision's tick at a near line; 9-12 up to the floor of the seat's cap
 * (`MAX_REWIND_MS` 200 ms = 12 ticks: never clamped); then 13-16, 17-24, 25-36 and 37+. Since NCW-2 B-bound a seat's
 * cap is its measured line (`rewindCapTicks`): 12 ticks with no measure or under about 50 ms round trip, growing with
 * it up to 24 (`REWIND_CEILING_MS_ADAPTATION`, 400 ms) -- so a 13-24 age is scored unclamped for a seat whose cap
 * reaches it and clamped for one whose does not (read it beside the seat's `signals.rtt`); 25-36 (about 200 ms one way)
 * and 37+ are past every seat's cap, clamped always.
 */
export const REWIND_AGE_BUCKETS = ['0-8', '9-12', '13-16', '17-24', '25-36', '37+'] as const;
/** NCW-1: each bucket's top age, in whole ticks (the last open). */
const REWIND_AGE_TOPS = [8, 12, 16, 24, 36, Infinity] as const;

/**
 * NCW-1: a rewind age's bucket -- the age (the room's tick less the round's `viewTick`, fractional) rounded up to whole
 * ticks, so an age past the cap by any fraction falls in a bucket past it (the rewind clamps at `viewTick < tick - 12`);
 * at most 0, the first.
 */
export function rewindAgeBucket(age: number): typeof REWIND_AGE_BUCKETS[number] {
  const whole = Math.max(0, Math.ceil(age));
  return REWIND_AGE_BUCKETS[REWIND_AGE_TOPS.findIndex((top) => whole <= top)]!;
}

/**
 * NCW-1 (B-count; an operator's instrument, no original): the server's totals of the rounds its rooms classed, by class
 * and age bucket, summed from each room's once-a-second `takeRewind` (`add`) -- a total for the life of the process, as
 * `s2u_ticks_total` is, never reset with a room. `/metrics` `s2u_rewind_rounds_total{class,age}`: every class and bucket
 * always written (30 series, a zero where none), so a scraper's series never come and go; no seat or room label (the
 * per-seat counts are the `rewind` log line's and the round results').
 */
export class RewindTally {
  private readonly totals = new Map<string, number>(REWIND_CLASSES.flatMap((c) => REWIND_AGE_BUCKETS.map((b) => [`${c}:${b}`, 0] as [string, number])));

  /**
   * One room's take: each seat's `class:bucket` counts added (an unknown key ignored). A take's counts are never below
   * one (`Room.takeRewind`: a round counted once, when its class is final); a count below one is ignored, so the total
   * only grows.
   */
  add(take: { seats: Record<number, { rounds: Record<string, number> }> }): void {
    for (const seat of Object.values(take.seats)) {
      for (const [key, n] of Object.entries(seat.rounds)) if (this.totals.has(key) && n > 0) this.totals.set(key, this.totals.get(key)! + n);
    }
  }

  /** The Prometheus lines, `name{class="b",age="25-36"} 3`, in `REWIND_CLASSES` then `REWIND_AGE_BUCKETS` order. */
  lines(name = 's2u_rewind_rounds_total'): string[] {
    return [...this.totals].map(([key, n]) => {
      const [c, age] = key.split(':');
      return `${name}{class="${c}",age="${age}"} ${n}`;
    });
  }
}

/**
 * NCW-1: the most heartbeat round-trip samples a seat keeps for its round's `signals.rtt` (one each `HEARTBEAT_MS`,
 * `../server`'s 5 s: 21 minutes' worth, past respawn's 1200 s round), the oldest dropped past it. An instrument's bound,
 * no game value.
 */
export const RTT_SAMPLES_MAX_ADAPTATION = 256;
/** NCW-1: the round trips summarised -- the samples, their median (the mean of the middle two when even), max and last, in ms. */
export interface RttSummary { samples: number; medianMs: number; maxMs: number; lastMs: number }

/** NCW-1: `samples` (ms, in order) as an `RttSummary`, rounded to whole ms; undefined with none. */
export function rttSummary(samples: readonly number[]): RttSummary | undefined {
  if (!samples.length) return undefined;
  const sorted = [...samples].sort((x, y) => x - y), mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { samples: samples.length, medianMs: Math.round(median), maxMs: Math.round(sorted[sorted.length - 1]!), lastMs: Math.round(samples[samples.length - 1]!) };
}

/**
 * SEC-F1 (OT.R98 step 1; product track: a detection statistic with no original -- it decides nothing and changes no game
 * value): a seat's accepted rounds in the round, each read as its offset from the centre of the cone the room ran at its
 * command, over the cone's half side (`../../../viewer/src/net/shotCone` `centringOf`: 0 the centre, 1 the edge) --
 * their count, their mean, and the share of them under `CENTRED10_FRACTION`. The page's own sample (`perturb`) has the
 * mean 1/2 and a tenth under 0.1 (`HONEST_CENTRING_MEAN`); a page that sends the cone's centre, ~0 and ~all. Central's
 * `shot-centring` flag reads it (`../../../central/src/stats/signals.ts`).
 */
export interface ShotCentring { rounds: number; mean: number; centred10: number }
/** SEC-F1: the offset under which a round counts as centred (`ShotCentring.centred10`): the statistic's own definition. */
export const CENTRED10_FRACTION = 0.1;

/** SEC-F1: one accepted round's offset (`centringOf`, in [0, 1]) taken into the seat's round statistic. */
export function noteCentring(s: { centring?: ShotCentring }, offset: number): void {
  const c = s.centring ?? (s.centring = { rounds: 0, mean: 0, centred10: 0 });
  c.rounds++;
  // Running means, held in [0, 1] against float drift (central's reader refuses a report outside it: `hostResults.ts`).
  const unit = (v: number): number => Math.min(1, Math.max(0, v));
  c.mean = unit(c.mean + (offset - c.mean) / c.rounds);
  c.centred10 = unit(c.centred10 + ((offset < CENTRED10_FRACTION ? 1 : 0) - c.centred10) / c.rounds);
}

/** The page's health, as the room keeps it through a round (SIMDROP-INSTR). */
type PageHealth = Required<Pick<SeatSignals, 'arrivalLate' | 'arrivalGapMaxMs' | 'staleFires'>>;

/** A seat's signals as the room keeps them through a round. */
export type RoundSignals = Omit<SeatSignals, 'seat' | keyof PageHealth> & PageHealth;

/** A round's signals from zero (each round's start, each new seat). */
export function freshSignals(): RoundSignals {
  return { shots: 0, hits: 0, hitsByPart: {}, refused: {}, bursts: 0, burstSizes: {}, commands: 0, input: false, arrivalLate: {}, arrivalGapMaxMs: 0, staleFires: 0 };
}

/**
 * SIMDROP-INSTR: a command's arrival lateness (whole ticks, at least 0) as its bucket's key -- about `jitter` (J, the
 * room's `FIRE_ARRIVAL_JITTER_TICKS`): 0..J each its own, then (J, 2J], (2J, 4J], (4J, 8J] and past 8J, keyed by
 * their least (J + 1, 2J + 1, 4J + 1, 8J + 1: 4, 7, 13 and 25 at J = 3).
 */
export function arrivalBucket(late: number, jitter: number): number {
  if (late <= jitter) return Math.max(0, late);
  if (late <= 2 * jitter) return jitter + 1;
  if (late <= 4 * jitter) return 2 * jitter + 1;
  if (late <= 8 * jitter) return 4 * jitter + 1;
  return 8 * jitter + 1;
}

/** What `roundResultOf` reads: the round as the room ends it, its seats now, and the leavers of the round. */
export interface RoundInput {
  match: MatchId;
  round: number;
  respawn: boolean;
  emptied: boolean;
  wins: { seal: number; terrorist: number };
  winner: Side | null;
  seats: readonly RoomRatingSeat[];
  leavers: readonly RoomRatingSeat[];
}

/** The round's result: the seats now and, under `'counted'` (the owner's other option for the round), the round's leavers. */
export function roundResultOf(input: RoundInput, leaveCost: LeaveCost = 'none'): RoomRoundResult {
  const leavers = leaveCost === 'counted' ? input.leavers.map((s) => ({ ...s, left: true as const })) : [];
  return {
    kind: 'round', match: { ...input.match }, round: input.round, respawn: input.respawn, emptied: input.emptied,
    roundsPlayed: input.round, sealRoundWins: input.wins.seal, terroristRoundWins: input.wins.terrorist, winner: input.winner,
    seats: [...input.seats.map((s) => ({ ...s })), ...leavers],
  };
}

/** SVC-07's step before `ratingsAfterRound`: each seat given its stored rating -- the one input the room cannot know. */
export function withRatings(result: RoomRoundResult, ratingOf: (account: number) => number): RoundResult {
  return { ...result, seats: result.seats.map((s) => ({ ...s, rating: ratingOf(s.account) })) };
}

/**
 * The results queue the bridge owns (research 155 §4.1-§4.2): first in, first out; `enqueue` is an O(1) append and
 * schedules one drain (`schedule`, after the current tick: `setImmediate`), which hands each result to `apply` in order,
 * one at a time, a throw logged and the next applied. SVC-07 gives it its consumer (the journal, the store's change);
 * until then the bridge's consumer applies nothing (the record is still SVC-12c's writer's, from the report: W22.R2).
 */
export class ResultsQueue {
  private items: HandOver[] = [];
  private head = 0;
  private scheduled = false;

  constructor(private readonly o: {
    apply: (result: HandOver) => void;
    schedule?: (drain: () => void) => void;
    log?: (entry: Record<string, unknown>) => void;
  }) {}

  /** Results waiting. */
  get size(): number { return this.items.length - this.head; }

  /** The hand-over: appended, a drain scheduled; nothing applied here. */
  enqueue(results: readonly HandOver[] | undefined): void {
    if (!results?.length) return;
    for (const r of results) this.items.push(r);
    if (this.scheduled) return;
    this.scheduled = true;
    (this.o.schedule ?? ((f: () => void) => { setImmediate(f); }))(() => this.drain());
  }

  /** Every result waiting, in order, to `apply`. */
  drain(): void {
    this.scheduled = false;
    while (this.head < this.items.length) {
      const r = this.items[this.head]!;
      this.items[this.head++] = undefined as unknown as HandOver;
      try { this.o.apply(r); } catch (e) { this.o.log?.({ level: 'error', msg: 'result not applied', kind: r.kind, match: r.match, error: String(e) }); }
    }
    this.items = [];
    this.head = 0;
  }
}
