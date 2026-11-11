import type { ServerEvent } from '../../../viewer/src/sim';
import { TICK_HZ, type MatchStats, type ScoreRow } from '../../../viewer/src/net/protocol';
import { DEATH_CAUSE } from '../../../viewer/src/net/deaths';
import { BOMB_STATE } from '../../../viewer/src/net/objective';
import type { RoomRecorder } from '../replay/recorder';
import type { RoundOverReport } from '../room';
import type { MatchBlock } from './accountStats';
import type { HandOver, RoomMatchResult, RoomRoundResult } from './roomResults';

/**
 * MS-3 (the match stats plan, `docs/plans/2026-11-07-match-stats-tracking.md`; MS.R3, MS.R4, MS.R6): the **match record**
 * -- one match told to central in three kinds of part, `open` / `round` / `close`, beside the results path and never
 * through it (`HandOver`, `ResultGame`, BTL.R10 and `handOverOf`'s no-account rule are untouched, MS.R4). Every match is
 * recorded -- counted, respawn, under five, password, with CPUs (MS.R3) -- and sent only when central's hello advertised
 * `matchRecords: true` (the process told so at its start, `game.ts`).
 *
 * **Product track, an adaptation throughout** (OT.R53; OT.R27: the original has no match history, research 155 §3): it
 * observes the room's broadcast stream as the replay recorder does (`RoomRecorder`: `event`, `matchReset`; the room's
 * bytes to its connections are the same with it on, PT.R2) and the game's own round hooks (`onRoundStart`,
 * `onRoundOver`); it changes nothing the room does, and no value here is the original's.
 *
 * What it reads, by the room's broadcast (`viewer/src/net/protocol.ts` `ServerEvent`):
 * - `roundStart` -- a round's start tick; round 1 a match's (its counters from zero).
 * - `kill` -- a kill (`room.ts` `kill`'s broadcast: killer, victim, weapon, how, cause); a hostage's (`victimKind
 *   'hostage'`) is the objective `hostageKilled`, its actor the killer.
 * - `bomb` -- the bomb's state transitions (`BOMB_STATE`): to planted (actor the planter), defused (the defuser),
 *   detonated (the planter); a re-sent wire is no transition.
 * - `hostageState` -- a hostage's AI into rescued (0x11), its actor the rescuer; `escort` 'extracted', no actor.
 * - `eliminated`, `timedOut`, `timeExpired` -- the round's reason (`MATCH_ROUND_REASONS_ADAPTATION`).
 * - `roundOver` -- the round's winner and each seat's match counters (`MatchStats`); `score` -- each seat's match and
 *   round rows (`ScoreRow`), and the CPU mark (`bot`, FBA.R12).
 */

/** MS.R6: the most events one round's part carries; past it the oldest are dropped and `eventsDropped` says how many. */
export const MATCH_EVENTS_PER_ROUND_MAX_ADAPTATION = 500;

/**
 * LCM-6a (a product adaptation, the owner's "can we do assists??"; the original keeps none): the least health an enemy
 * must have taken from a victim in one life for an assist at that victim's death -- any health at all.
 */
export const ASSIST_MIN_DAMAGE_ADAPTATION = 1;

/** A seat in the record: the account id as a string, or `cpu:<n>` for a CPU (its seat id in the room). */
export type RecordSeat = string;

/** The match's identity, as the results' `mark.match` names it (`MatchId`): the game's id as text, the room's serial and start. */
export interface MatchRecordId { room: string; serial: number; startedAt: number }

export interface MatchRecordOpen {
  t: 'matchRecord'; part: 'open'; game: number; match: MatchRecordId;
  map: string; mode: string; gameType: number;
  settings: { roundSeconds: number; maxRounds: number; friendlyFire: boolean; maxPlayers: number; teamSize: number; eqLimit: number };
  lobbyName: string; host: string;
  seats: { seat: RecordSeat; name: string; side: number; joinedInProgress: boolean }[];
  /**
   * PR #753's third pass P2-a: the id of the server's replay file open at round 1 (`RoomRecorder.replayId`; the first
   * match's file opens in the lobby) -- the match and its replay by one identity, never by their starts. Absent when none
   * is open (no `REPLAYS_DIR`, or the next match's file not yet opened: then the close names it). Additive.
   */
  replayId?: string;
}
export interface MatchRecordRound {
  t: 'matchRecord'; part: 'round'; game: number; match: MatchRecordOpen['match'];
  round: number; winner: number | null; reason: string; ms: number;
  /**
   * PR #753's third pass P2-b: `roundsWon` / `roundsLost`, the seat's rounds as the room counts them at this round's end
   * (`room.ts`'s round end, SEAT_ROUNDS_READING: a seat at the end that played the round -- no classic ghost, no leaver).
   * LCM-6a: `assists` and `damage`, this round's (`MatchRecorder.combatApplied`, the room's `onCombatApplied` observer):
   * the health the seat's applied hits took from enemies, and its assists at enemies' deaths. Always set by this
   * recorder; optional on the wire, as an older host's part carries neither (additive). A seat gone from the rows by the
   * round's end with assists or damage in it is named too, its counts zero (gap C of the assists-everywhere batch).
   */
  seats: { seat: RecordSeat; kills: number; deaths: number; score: number; rescued: number; roundsWon?: number; roundsLost?: number; assists?: number; damage?: number }[];
  events: MatchEvent[]; eventsDropped: number;
  /**
   * PR #753's Codex P2: each seat first seen since the part before (a mid-match joiner, absent from the open's `seats`),
   * in the open's seat shape, `joinedInProgress` true; absent when none (the part's bytes as before). Additive: the link
   * and the pipe read only the envelope (protocol 7 kept).
   */
  joined?: { seat: RecordSeat; name: string; side: number; joinedInProgress: true }[];
}
export interface MatchRecordClose {
  t: 'matchRecord'; part: 'close'; game: number; match: MatchRecordOpen['match'];
  ended: 'complete' | 'abandoned'; endedAt: number;
  /**
   * PR #753 P2-b: each seat's rounds won and lost -- the room's own (`RoomMatchSeat`) when it handed a result, else the
   * stream's count.
   * LCM-6a: `assists` and `damage`, the match's -- the recorder's own count, never in `block` (the career's); optional on the
   * wire as the round's.
   */
  totals: { seat: RecordSeat; block: MatchBlock; playedMs: number; roundsWon?: number; roundsLost?: number; assists?: number; damage?: number }[];
  /** PR #753 P2-a: the replay file the match was recorded in (the last one open while it was), absent when none. Additive. */
  replayId?: string;
}
export type MatchRecordPart = MatchRecordOpen | MatchRecordRound | MatchRecordClose;

/** A kill's `killer` is null where the room names none (a fall, the world, an orphaned grenade: `kill`'s `killer: null`). */
export type MatchEvent =
  | { kind: 'kill'; tick: number; killer: RecordSeat | null; victim: RecordSeat; weapon: string; part: string; how: string }
  | { kind: 'objective'; tick: number; what: 'planted' | 'defused' | 'detonated' | 'rescued' | 'hostageKilled' | 'extracted'; actor: RecordSeat | null };

/**
 * The record's names for the game types (missionlist TYPE, as central's `lobbyCard.ts` `TYPE_WORDS` names them); a type
 * off the list is `UNKNOWN`.
 */
export const MATCH_MODE_NAMES_ADAPTATION: Readonly<Record<number, string>> = { 1: 'BREACH', 2: 'DEMOLITION', 3: 'ESCORT', 4: 'EXTRACTION', 5: 'SUPPRESSION' };

/**
 * A kill's hit part as the record names it, from the kill's death cause (`DEATH_CAUSE`, the actor's +0xfb0; a head
 * hit's cause is 3, `room.ts` `kill`'s headshot count): the broadcast carries the cause, not the part number.
 */
export const MATCH_KILL_PART_OF_CAUSE_ADAPTATION: Readonly<Record<number, string>> = {
  [DEATH_CAUSE.HEADSHOT]: 'head', [DEATH_CAUSE.BULLET]: 'body', [DEATH_CAUSE.BLAST]: 'blast', [DEATH_CAUSE.FALL]: 'fall', [DEATH_CAUSE.CLEANUP]: 'cleanup',
};

/**
 * A round's `reason` (the record's words): the last deciding broadcast of the round -- `eliminated` its own reason
 * (`elimination`, `rescue`, `hostageKills`), `timedOut` 'timeout', the bomb 'defused' / 'detonated', `timeExpired` 'time'
 * -- else 'draw' with no winner and 'points' with one (respawn's), and 'emptied' for a round a leave emptied a side of.
 */
export const MATCH_ROUND_REASONS_ADAPTATION = ['elimination', 'rescue', 'hostageKills', 'timeout', 'defused', 'detonated', 'time', 'draw', 'points', 'emptied'] as const;

/** A side as the record numbers it: the room's `sideOf` (`room.ts`: SEALs 0, Terrorists 1). */
export const sideNumber = (team: 'seal' | 'terrorist'): number => (team === 'seal' ? 0 : 1);

/** What the recorder asks of the game it records (`game.ts` `matchSource`; a test's fake). */
export interface RoomStreamSource {
  /** The game's id (`handOver.roomId`, `MatchId.room`). */
  readonly game: number;
  /** The room's match now (`Room.currentMatch()`): its serial and start. */
  match(): { serial: number; startedAt: number };
  map(): string;
  gameType(): number;
  settings(): MatchRecordOpen['settings'];
  lobbyName(): string;
  host(): string;
  /** A seat's account as text, or null for none; a CPU is told by the stream's own mark (`bot`), never here. */
  accountOf(id: number): string | null;
  /** The players seated now (the lobby's, in join order). */
  seats(): { id: number; name: string; team: 'seal' | 'terrorist'; bot?: boolean }[];
  now(): number;
}

interface SeatTotals { row: ScoreRow | null; stats: MatchStats | null; planted: number; defused: number; playedMs: number; won: number; lost: number; assists: number; damage: number }

/** The block of a seat from its last rows and counters, by the room's own map (`room.ts` `matchSeat`'s fields). */
function blockOf(t: SeatTotals): MatchBlock {
  const s = t.stats;
  return {
    headShots: s?.headshots ?? 0, hits: s?.shotsHit ?? 0, shots: s?.shotsFired ?? 0, kills: t.row?.kills ?? 0, deaths: t.row?.deaths ?? 0,
    suicides: s?.suicides ?? 0, teamKills: s?.teamKills ?? 0, escorteesKilled: s?.escorteesKilled ?? 0, escorteesBroughtOut: s?.hostagesRescued ?? 0,
    primaryObjectives: s?.primaryObjs ?? 0, bonusObjectives: s?.bonusObjs ?? 0, bombsDefused: t.defused, bombsPlanted: t.planted, score: t.row?.score ?? 0,
  };
}

/**
 * The recorder of one room's matches. `stream` is handed to the room as an observer (its `RoomRecorder`); `open`,
 * `round` and `close` build the parts (the driver: `matchRecording`). Nothing here reaches back into the room.
 */
export class MatchRecorder {
  readonly stream: RoomRecorder;
  private opened = false;
  private id: MatchRecordId | null = null;
  private lastTick = 0;
  private roundStartTick = 0;
  private events: MatchEvent[] = [];
  private dropped = 0;
  private reason: string | null = null;
  private over: { round: number; winner: 'seal' | 'terrorist' | null; tick: number } | null = null;
  private rows: ScoreRow[] = [];
  private bomb: number | null = null;
  private hostages = new Map<number, number>();
  /** MS-3 review F2: the hostages rescued this round, by id -- a rescue counted once (0x11, then held, then 0x11 again). */
  private rescuedIds = new Set<number>();
  private rescued = new Map<RecordSeat, number>();
  private totals = new Map<RecordSeat, SeatTotals>();
  private readonly bots = new Set<number>();
  /** The stream told this match's first `roundStart` (the recorder is the room's observer), not yet opened. */
  private started = false;
  /** PR #753 P2: the seats this match's parts have named (the open's, then each round's `joined`), from its open. */
  private known = new Set<RecordSeat>();
  /**
   * PR #753 fold review F1: the seats first seen in a `score` since the last part, not yet named -- each as it first
   * appeared (the room's seat's name and side, else its row's), so one who joins and leaves inside a round is named too.
   */
  private pendingJoined = new Map<RecordSeat, { name: string; side: number }>();
  /**
   * PR #753 P2-a: the server's replay file open now (`replayId`: its id at its open, null at its close), and the one the
   * open match was recorded in -- latched while it is open, so a file closed before the record's close (an abandon: the
   * tee tells the replay first) is still named.
   */
  private fileNow: string | null = null;
  private matchReplay: string | null = null;
  /**
   * PR #753 P2-b: the round's roster -- the seats of the room's `score` right after its `roundStart` (`startRound`'s), less
   * its `ghosts` -- whom the room's round end counts in classic (`ghostOf`: a seat not seated at the round's start).
   */
  private roster: Set<number> | null = null;
  private rosterDue = false;
  private ghosts = new Set<number>();
  /**
   * LCM-6a: each victim's life now (by room id): the health each enemy (by room id) took from him since his last spawn or
   * the round's start -- read at his death for assists, then cleared; and the round's own assists and damage, by seat.
   * Each attacker's record seat is kept from his hit (PR #781 Codex P2): a seat that left before the death no longer
   * resolves to its account (`MatchGame.seatFor().left()`), so `seatOf` at the death would name a `seat:<n>`.
   */
  private lives = new Map<number, Map<number, { taken: number; seat: RecordSeat }>>();
  private roundAssists = new Map<RecordSeat, number>();
  private roundDamage = new Map<RecordSeat, number>();

  /**
   * `onMatchReset`: the room's match reset (`RoomRecorder.matchReset`: the next match's start, a held game's return).
   * `onAbandoned`: the room's `abandoned` broadcast (a side emptied: `Room.abandon`), told before the abandon's `score`
   * -- whose rows `resetMatch` has zeroed -- reaches the recorder (MS-3 review F1).
   */
  constructor(private readonly room: RoomStreamSource, onMatchReset?: () => void, private readonly onAbandoned?: () => void) {
    this.stream = {
      snapshot: (tick) => { this.lastTick = tick; },
      event: (tick, ev) => { try { this.event(tick, ev); } catch { /* PT.R2's containment: never into the room's broadcast */ } },
      players: (_tick, players) => { for (const p of players) if (p.bot === true) this.bots.add(p.id); },
      matchReset: () => onMatchReset?.(),
      replayId: (id) => { this.fileNow = id; if (id !== null && this.opened) this.matchReplay = id; },
      close: () => undefined,
    };
  }

  /** Whether a match is open (its `open` built and no `close` yet). */
  get isOpen(): boolean { return this.opened; }

  /**
   * Whether the stream told this match's start (round 1's `roundStart`) -- false when the recorder is not the room's
   * observer (another `recorder` took its place): then no record is opened, never one with empty rounds.
   */
  get streamed(): boolean { return this.started; }

  /** A seat of the room as the record names it: `cpu:<n>` for a CPU, else its account, else `seat:<n>` (none known). */
  seatOf(id: number): RecordSeat {
    if (this.bots.has(id)) return `cpu:${id}`;
    return this.room.accountOf(id) ?? `seat:${id}`;
  }

  /** The match's `open`: its identity, the game, the settings and the seats at its start. */
  open(): MatchRecordOpen {
    const m = this.room.match();
    this.id = { room: String(this.room.game), serial: m.serial, startedAt: m.startedAt };
    this.opened = true; this.started = false;
    const seats = this.room.seats();
    for (const s of seats) if (s.bot === true) this.bots.add(s.id);
    const type = this.room.gameType();
    const named = seats.map((s) => ({ seat: this.seatOf(s.id), name: s.name, side: sideNumber(s.team), joinedInProgress: false }));
    this.known = new Set(named.map((s) => s.seat));
    this.pendingJoined = new Map();
    this.matchReplay = this.fileNow;
    return {
      t: 'matchRecord', part: 'open', game: this.room.game, match: { ...this.id },
      map: this.room.map(), mode: MATCH_MODE_NAMES_ADAPTATION[type] ?? 'UNKNOWN', gameType: type,
      settings: { ...this.room.settings() }, lobbyName: this.room.lobbyName(), host: this.room.host(),
      seats: named,
      ...(this.fileNow !== null ? { replayId: this.fileNow } : {}),
    };
  }

  /**
   * Each seat's match counters (headshots, hits, shots, suicides, team kills, the objectives) as the room last stated
   * them: a `roundOver`'s `stats`, or -- PR #753 fourth pass -- an emptied round's report (`Room.reportEmptied`: the
   * counters in `report.seats`, no `roundOver` sent), so an abandoned close carries the round in play's.
   */
  takeStats(seats: readonly { id: number; stats: MatchStats | undefined }[]): void {
    for (const s of seats) if (s.stats) this.totalsOf(this.seatOf(s.id)).stats = { ...s.stats };
  }

  /**
   * LCM-6a: the room's `onCombatApplied` (an enemy's applied hit that took `healthTaken` health from `targetId`): the
   * attacker's damage, and his share of the victim's life for an assist. A self-hit, no health, or a seat the last
   * `score` puts on the victim's own side counts nothing (the room tells enemies only; this holds it here too).
   */
  combatApplied(attackerId: number, targetId: number, healthTaken: number): void {
    if (!(healthTaken > 0) || attackerId === targetId || this.sameSide(attackerId, targetId)) return;
    let life = this.lives.get(targetId);
    if (!life) { life = new Map(); this.lives.set(targetId, life); }
    const seat = this.seatOf(attackerId);
    life.set(attackerId, { taken: (life.get(attackerId)?.taken ?? 0) + healthTaken, seat });
    this.totalsOf(seat).damage += healthTaken;
    this.roundDamage.set(seat, (this.roundDamage.get(seat) ?? 0) + healthTaken);
  }

  /** LCM-6a: whether the last `score` puts both seats on one side (unknown: not); asked at the hit only. */
  private sameSide(a: number, b: number): boolean {
    const ta = this.rows.find((r) => r.id === a)?.team, tb = this.rows.find((r) => r.id === b)?.team;
    return ta !== undefined && ta === tb;
  }

  /**
   * LCM-6a: a death ends `victim`'s life -- each enemy but the killer who took enough health from him gets an assist.
   * Assists everywhere (gap E): the hits are counted by record seat -- a takeover's two room ids one seat, one assist for
   * one death -- and the killer is told by his record seat too, so his kill under a new id earns him no assist beside
   * it; his hits under his kill's own room id are dropped first (the review's F1). No side check here: the room tells enemies' hits only and `combatApplied` held each at its hit, so a later
   * score putting the two on one side takes nothing away.
   */
  private died(victim: number, killer: number | null): void {
    const life = this.lives.get(victim);
    this.lives.delete(victim);
    if (!life) return;
    // the review's F1: the killer's own hits dropped by his room id too -- his seat now can differ from the one his hit
    // kept (a leaver's grenade in flight: his account forgotten; a CPU hit before the stream marked it one)
    if (killer !== null) life.delete(killer);
    const killerSeat = killer === null ? null : this.seatOf(killer);
    const bySeat = new Map<RecordSeat, number>();
    for (const { taken, seat } of life.values()) bySeat.set(seat, (bySeat.get(seat) ?? 0) + taken);
    for (const [seat, taken] of bySeat) {
      if (seat === killerSeat || taken < ASSIST_MIN_DAMAGE_ADAPTATION) continue;
      this.totalsOf(seat).assists++;
      this.roundAssists.set(seat, (this.roundAssists.get(seat) ?? 0) + 1);
    }
  }

  /** Round `n`'s part: its winner, reason and length, each seat's round rows, its events (`emptied`: a leave emptied a side). */
  round(n: number, emptied = false, decided?: 'seal' | 'terrorist' | null, respawn = false): MatchRecordRound {
    const over = this.over && this.over.round === n ? this.over : null;
    const end = over ? over.tick : this.lastTick;
    const ms = Math.max(0, Math.round(((end - this.roundStartTick) * 1000) / TICK_HZ));
    // MS-3 review F3: an emptied round has no `roundOver`; its winner is its round result's (`reportEmptied`), when handed
    const winner = over?.winner ?? decided ?? null;
    const reason = emptied ? 'emptied' : this.reason ?? (winner === null ? 'draw' : 'points');
    // PR #753 P2-b: the room's round end (`room.ts`, SEAT_ROUNDS_READING) -- each seat there at the end that played the
    // round (respawn: all; classic: the round's roster, `ghostOf`) gets its result; an emptied round none (`reportEmptied`)
    const seats = this.rows.map((r) => {
      const seat = this.seatOf(r.id);
      const t = this.totalsOf(seat);
      t.playedMs += ms;
      if (!emptied && (respawn || this.roster === null || this.roster.has(r.id)) && winner !== null) { if (r.team === winner) t.won++; else t.lost++; }
      return {
        seat, kills: r.roundKills ?? 0, deaths: r.roundDeaths ?? 0, score: r.roundScore ?? 0, rescued: this.rescued.get(seat) ?? 0, roundsWon: t.won, roundsLost: t.lost,
        assists: this.roundAssists.get(seat) ?? 0, damage: this.roundDamage.get(seat) ?? 0,
      };
    });
    // Assists everywhere (gap C): a seat with this round's assists or damage and no row at its end (a leaver) -- once, its
    // counts zero (the room's rows, gone with it), its rounds as they stood (no result for a round it left)
    const named = new Set(seats.map((s) => s.seat));
    for (const seat of new Set([...this.roundAssists.keys(), ...this.roundDamage.keys()])) {
      if (named.has(seat)) continue;
      named.add(seat);
      const t = this.totalsOf(seat);
      seats.push({
        seat, kills: 0, deaths: 0, score: 0, rescued: this.rescued.get(seat) ?? 0, roundsWon: t.won, roundsLost: t.lost,
        assists: this.roundAssists.get(seat) ?? 0, damage: this.roundDamage.get(seat) ?? 0,
      });
    }
    // PR #753 P2 (with the fold review's F1): the seats first seen in this round's `score`s (`pendingJoined`, as each first
    // appeared: a joiner gone by the round's end too), then any in the round-end rows not yet named -- each once
    this.noteJoiners(this.rows);
    const joined: NonNullable<MatchRecordRound['joined']> = [];
    for (const [seat, j] of this.pendingJoined) { this.known.add(seat); joined.push({ seat, name: j.name, side: j.side, joinedInProgress: true }); }
    this.pendingJoined = new Map();
    const part: MatchRecordRound = {
      t: 'matchRecord', part: 'round', game: this.room.game, match: { ...this.matchId() },
      round: n, winner: winner === null ? null : sideNumber(winner), reason, ms, seats, events: this.events, eventsDropped: this.dropped,
      ...(joined.length > 0 ? { joined } : {}),
    };
    this.events = []; this.dropped = 0; this.over = null;
    return part;
  }

  /**
   * The match's `close`: every seat's totals, CPUs included. `result`, the room's own `RoomMatchResult` when it handed
   * one over (every seat an account's): each of its seats' block and time are the room's builder's (`matchSeat`,
   * `matchSeats`: a leaver's match too); every other seat's (a CPU's, any match without a result) from the stream.
   */
  close(ended: 'complete' | 'abandoned', result?: RoomMatchResult): MatchRecordClose {
    const totals: MatchRecordClose['totals'] = [];
    const exact = new Map((result?.seats ?? []).map((s) => [String(s.account), s] as const));
    for (const [seat, t] of this.totals) {
      const r = exact.get(seat);
      totals.push(r ? { seat, block: { ...r.block }, playedMs: r.playedMs, roundsWon: r.roundsWon, roundsLost: r.roundsLost, assists: t.assists, damage: t.damage }
        : { seat, block: blockOf(t), playedMs: t.playedMs, roundsWon: t.won, roundsLost: t.lost, assists: t.assists, damage: t.damage });
      exact.delete(seat);
    }
    for (const [seat, r] of exact) totals.push({ seat, block: { ...r.block }, playedMs: r.playedMs, roundsWon: r.roundsWon, roundsLost: r.roundsLost, assists: 0, damage: 0 });
    const part: MatchRecordClose = {
      t: 'matchRecord', part: 'close', game: this.room.game, match: { ...this.matchId() }, ended, endedAt: this.room.now(), totals,
      ...(this.matchReplay !== null ? { replayId: this.matchReplay } : {}),
    };
    this.opened = false; this.matchReplay = null;
    return part;
  }

  /**
   * PR #753 F1: each seat of `rows` neither named by a part nor pending, noted as it appears now -- its name and side the
   * room's seat's (as the open's), else its row's; the room asked only when there is one, and a failure there costs the
   * names, never the stream (PT.R2).
   */
  private noteJoiners(rows: readonly ScoreRow[]): void {
    if (!this.opened) return;
    let room: ReturnType<RoomStreamSource['seats']> | null = null;
    for (const r of rows) {
      const seat = this.seatOf(r.id);
      if (this.known.has(seat) || this.pendingJoined.has(seat)) continue;
      if (room === null) { try { room = this.room.seats(); } catch { room = []; } }
      const s = room.find((x) => x.id === r.id);
      this.pendingJoined.set(seat, { name: s?.name ?? r.name, side: sideNumber(s?.team ?? r.team) });
    }
  }

  private matchId(): MatchRecordId {
    if (this.id) return this.id;
    const m = this.room.match();
    return { room: String(this.room.game), serial: m.serial, startedAt: m.startedAt };
  }

  private totalsOf(seat: RecordSeat): SeatTotals {
    let t = this.totals.get(seat);
    if (!t) { t = { row: null, stats: null, planted: 0, defused: 0, playedMs: 0, won: 0, lost: 0, assists: 0, damage: 0 }; this.totals.set(seat, t); }
    return t;
  }

  private push(e: MatchEvent): void {
    if (this.events.length >= MATCH_EVENTS_PER_ROUND_MAX_ADAPTATION) { this.events.shift(); this.dropped++; }   // MS.R6: the oldest go
    this.events.push(e);
  }

  private objective(tick: number, what: Extract<MatchEvent, { kind: 'objective' }>['what'], actor: number | null): void {
    this.push({ kind: 'objective', tick, what, actor: actor === null ? null : this.seatOf(actor) });
  }

  private event(tick: number, ev: ServerEvent): void {
    this.lastTick = tick;
    switch (ev.type) {
      case 'roundStart':
        if (ev.round === 1) { this.totals = new Map(); this.id = null; this.started = true; }   // a match's first round: its counters from zero
        this.roundStartTick = tick; this.events = []; this.dropped = 0; this.reason = null; this.over = null;
        this.hostages = new Map(); this.rescued = new Map(); this.rescuedIds = new Set();
        this.roster = null; this.rosterDue = true; this.ghosts = new Set(ev.ghosts ?? []);   // PR #753 P2-b: the roster at the next score
        this.lives = new Map(); this.roundAssists = new Map(); this.roundDamage = new Map();   // LCM-6a: a new life for every seat
        return;
      case 'spawn': this.lives.delete(ev.id); return;                    // LCM-6a: a spawn starts a new life
      case 'kill':
        if (ev.victimKind === 'hostage') { this.objective(tick, 'hostageKilled', ev.killer); return; }
        this.died(ev.victim, ev.killer);                                 // LCM-6a: the victim's assists, before his life is gone
        this.push({
          kind: 'kill', tick, killer: ev.killer === null ? null : this.seatOf(ev.killer), victim: this.seatOf(ev.victim), weapon: ev.weapon ?? '',
          part: ev.cause === undefined ? '' : MATCH_KILL_PART_OF_CAUSE_ADAPTATION[ev.cause] ?? String(ev.cause), how: ev.how,
        });
        return;
      case 'bomb': {
        const was = this.bomb;
        this.bomb = ev.state;
        if (was === ev.state) return;                                    // a re-sent wire is no transition
        if (ev.state === BOMB_STATE.planted) { this.objective(tick, 'planted', ev.planter); if (ev.planter !== null) this.totalsOf(this.seatOf(ev.planter)).planted++; }
        else if (ev.state === BOMB_STATE.defused) { this.objective(tick, 'defused', ev.defuser); this.reason = 'defused'; if (ev.defuser !== null) this.totalsOf(this.seatOf(ev.defuser)).defused++; }
        else if (ev.state === BOMB_STATE.detonated) { this.objective(tick, 'detonated', ev.planter); this.reason = 'detonated'; }
        return;
      }
      case 'hostageState': {
        const was = this.hostages.get(ev.id);
        this.hostages.set(ev.id, ev.ai);
        if (ev.ai === 0x11 && was !== 0x11 && !this.rescuedIds.has(ev.id)) {
          this.rescuedIds.add(ev.id);
          this.objective(tick, 'rescued', ev.rescuer);
          if (ev.rescuer !== null) { const seat = this.seatOf(ev.rescuer); this.rescued.set(seat, (this.rescued.get(seat) ?? 0) + 1); }
        }
        return;
      }
      case 'escort': if (ev.kind === 'extracted') this.objective(tick, 'extracted', null); return;
      case 'eliminated': this.reason = ev.reason ?? 'elimination'; return;
      case 'timedOut': this.reason = 'timeout'; return;
      case 'timeExpired': this.reason ??= 'time'; return;
      // MS-3 review F1: the match dropped (`Room.abandon`: `resetMatch`, then this, then the zeroed `score`) -- closed now,
      // its rows as they stood, its end this moment; the zeroed rows after it belong to no open match
      case 'abandoned': this.onAbandoned?.(); return;
      case 'roundOver':
        this.over = { round: ev.round, winner: ev.winner, tick };
        this.takeStats(Object.entries(ev.stats ?? {}).map(([id, stats]) => ({ id: Number(id), stats })));
        return;
      case 'score':
        this.rows = ev.rows.map((r) => ({ ...r }));
        if (this.rosterDue) { this.rosterDue = false; this.roster = new Set(ev.rows.map((r) => r.id).filter((id) => !this.ghosts.has(id))); }
        for (const r of ev.rows) { if (r.bot === true) this.bots.add(r.id); this.totalsOf(this.seatOf(r.id)).row = { ...r }; }
        this.noteJoiners(this.rows);                                     // PR #753 F1: a joiner as they first appear (its CPU mark read)
        return;
      default:
        return;
    }
  }
}

/** The room's `RoomMatchResult` in a round's report, when it handed one over (`handOverOf`, at the match's end). */
function matchResultOf(results: readonly HandOver[] | undefined): RoomMatchResult | undefined {
  return results?.find((r): r is RoomMatchResult => r.kind === 'match');
}

/**
 * The record's driver for one room (`game.ts`): the recorder, its stream for the room, and the game's hooks -- `open` at
 * round 1's start (only when `enabled`: central's flag, MS.R4), `round` at each round's report, `close` 'complete' at the
 * match's end and 'abandoned' at a match reset with the match still open (MS.R6), or at the game's `end`. Each part goes
 * to `send`; nothing is built or sent while no match is open.
 */
export function matchRecording(source: RoomStreamSource, send: (part: MatchRecordPart) => void, enabled: () => boolean) {
  // PT.R2's containment, as `FileRecorder`'s: a failure here (a part's build, the pipe's send) never reaches the room's step
  const guard = (work: () => void): void => { try { work(); } catch { /* the record's own trouble: a gap in its rows */ } };
  const abandoned = (): void => guard(() => { if (recorder.isOpen) send(recorder.close('abandoned')); });
  const recorder: MatchRecorder = new MatchRecorder(source, abandoned, abandoned);
  return {
    recorder,
    stream: recorder.stream,
    onRoundStart(round: number): void {
      guard(() => {
        if (round !== 1 || !enabled() || !recorder.streamed) return;   // no stream (not the room's observer): no record
        // MS-3 review F4: an open match was closed at its reset (`matchReset`, before this round's) or its abandon
        send(recorder.open());
      });
    },
    onRoundOver(report: RoundOverReport): void {
      guard(() => {
        if (!recorder.isOpen) return;
        if (report.emptied === true) recorder.takeStats(report.seats);  // PR #753 fourth pass: no roundOver for an emptied round
        const decided = report.results?.find((r): r is RoomRoundResult => r.kind === 'round')?.winner;
        send(recorder.round(report.round, report.emptied === true, decided, report.respawn));
        if (report.matchOver && report.emptied !== true) send(recorder.close('complete', matchResultOf(report.results)));
      });
    },
    end(): void {
      guard(() => { if (recorder.isOpen) send(recorder.close('abandoned')); });
    },
    /** LCM-6a: the room's `onCombatApplied` (`game.ts` hands it over), its failure contained as the stream's (PT.R2). */
    combatApplied(attackerId: number, targetId: number, healthTaken: number): void {
      guard(() => recorder.combatApplied(attackerId, targetId, healthTaken));
    },
  };
}
