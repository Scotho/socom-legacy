import type { GameType, HullCast, ThrowableRecord } from '@s2u/scene';
import { seekIndex, type ReplayPlayer, type ReplayRecord } from '../../../match/src/replay/format';
import { applySceneDeath, applySnapshotWorld, JOIN_SILENT_READING, revisionNewer, type NetClient, type NetState, type NetWalk } from '../net/client';
import { SeatToldBoard } from '../net/seatTold';
import { SeatClanBoard } from '../net/seatClans';
import type { VoiceDown } from '../net/voiceWire';
import {
  epochNewer, type BodyState, type ClientEvent, type CombatReport, type CraneWire, type DoorWire, type EnvWire, type HostageWire, type Role, type ServerEvent, type Team,
} from '../net/protocol';
import { MAX_ROUNDS } from '../net/rules';
import type { WorldState } from '../worldState';
import { shortTurn, wrapYaw } from '../yaw';
import { firstAfter, ReplayClock } from './clock';
import { bakedThrowable, foldedFigure, foldedHostages, foldedJoin, foldTo, statefulRecord, type ThrowableLookup } from './fold';
import type { LoadedSegment } from './load';
import { loadKindOf, type ReplayLoadKind } from './refusalKind';
import { equipmentLimit } from '../equipmentLimit';

export type { LoadedSegment } from './load';

/**
 * The replay's client (web sprint 35 PT-18; W35.R4; spec 4.8; research 244 §1). REPLAY_ADAPTATION: a browser adaptation
 * with no original -- SOCOM II plays no recording back -- so nothing here is a game value, and nothing here changes one
 * (PT.R3); what it draws is what the recorded room sent its spectators.
 *
 * It stands where `NetPage` takes a `NetClient` (`NetPageDeps.client`, the additive factory), implementing the members
 * the page reads -- `on`, `send` (a no-op), `bodies`, `doors`, `env`, `serverTick`, `viewTick`, `id`, `role`, `team`,
 * `state`, `close`, `closeCode`, `newEpoch`, `setWorld`, `gameType` -- and the rest of `NetClient`'s surface as inert
 * (`NetClientSurface`, checked by the typecheck); never a subclass of it. It joins as a watcher: a spectator's welcome,
 * no body of its own (`REPLAY_WATCHER_ID` is no room's id), the walk never driven -- the path a spectator already uses,
 * so the bodies, the HUD's scoreboard and the round screens draw from the recording as they draw from a room.
 *
 * The records play on the replay's clock (`./clock`): `advance()` (the mode's frame, `./mount`) hands on each `event`
 * whose tick the clock has passed, in the file's order, and keeps the roster (`players`) and the world (`snap`'s
 * environment) as they stand; `bodies(now)` draws the two snapshots around the clock's tick, interpolated as
 * `NetClient.bodies` does (feet, yaw the short way, pitch; the rest from the newer) -- on the replay's tick, with no
 * interpolation delay, so a paused replay draws the same frame every time and 4x keeps the snapshots' order.
 *
 * Seek (spec 4.1, `SEEK_SNAPSHOT_RULE_ADAPTATION`; the plan's review focus 1-2): the snapshot at or before the target
 * (`seekIndex`) for the world; the roster restored from the last `players` record at or before the target (state, not a
 * transient: the review's F1), told to the page
 * as the room's own `left` / `joined` / `renamed` would (only what differs from the roster now); the events between the
 * snapshot and the target skipped, never replayed; play goes on from the target. A step back is a seek; a step on is
 * play. A `cmd` record is for investigators, never played.
 *
 * The seek's fold (PTT-6, W37.R4; research 244 §7): the stateful events from the segment's start to the target
 * (`./fold`'s one table) are folded and told to the page as a page joining the room at the target is told them -- a
 * welcome's late-join fields, then the room's `score` -- so the scoreboard, the round's clock and screens, a body's death,
 * the bomb and the turrets are the target's; the transient ones (a tracer, a sound, a grenade's arc) are never replayed.
 * RE-1 (research 249 §1): with them a dance still running (its `victory` after the welcome, at its age, as the room's
 * `hello` sends one; a dance the page was told at the old playhead and not running at the target is told its stop, the
 * room's stop), the charges lying at the target (the envelope's `projectiles`) and the ghosts (its `ghosts`).
 * RE-2 (research 249 §3, W38.R2): EXTRACTION's hostages, the welcome's `hostages` -- on the open and on every seek, from
 * the recording's `hostages` record, laid by the page's welcome handler alone (no YES, no Lead or Rescue line); a file
 * with none tells none, as before.
 *
 * RE-3 (W38.R3; research 249 §4): the page's clock (`pageClock`, which `NetPage` reads off its client) -- the replay's
 * own time in milliseconds, paused when it pauses and scaled with its speed, at the tick of the record being told while
 * one is -- so the page's round timer, launch countdown and round screens run on the replay; and, for a seek into a
 * stopped period, the figure the live page's timer kept there (`./fold` `foldedFigure`).
 *
 * RE-4 (research 249 §5): a seek tells its listeners (`onSeek`) first, before anything of the target, so the page clears
 * what is in its air at the old playhead (the match part, `./matchActions` `followNet`: the page's `clearAir`); the
 * target's charges are then laid by the welcome (RE-1's `projectiles`). RV-2 (research 276 §1; W39.R2, additive): the
 * listener is handed the seek (`ReplaySeek`: from, to, folded), so the viewer's seek note follows the engine.
 * RV-7 (research 276 §6; W39.R2, additive): an AN-M8 thrown before the target and not yet removed is laid by the welcome
 * as the room's join lays it (the envelope's `projectiles`), flown over the page's hull (`ReplayClientOptions.hull`).
 *
 * A file the load refused (`./load` `ReplayLoadError`), or one the page cannot show (`check`), makes the room
 * `refused` with the sentence as its reason: `NetPage` posts it and its status says it -- never a blank room. MU2-14:
 * the loader's kind of it is kept beside, as `refusedKind` (the event's type, the wire's, unchanged).
 */

/**
 * The watcher's id: no room's (a room's ids are positive), so no recorded `spawn`, `kill` or `hurt` is taken as the
 * page's own. A sentinel of this adaptation, not a game value.
 */
export const REPLAY_WATCHER_ID = -1;

/** `NetClient`'s public surface, which `NetPage` and the page read: what a `ReplayClient` implements. */
export type NetClientSurface = { [K in keyof NetClient]: NetClient[K] };

export interface ReplayClientOptions {
  /** The watcher's name (`NetOptions.name`) for the welcome. */
  name: string;
  /** The page's map stem (`NetOptions.map`). */
  map: string;
  /** The page's world, the snapshots' environment laid on it (`NetOptions.world`); absent: none. */
  world?: () => WorldState | null;
  /** The wall clock, ms (`performance.now` by default). */
  now?: () => number;
  /** A segment the page cannot show (the mode's map check, `./mount`): its sentence, else null. */
  check?(segment: LoadedSegment): string | null;
  /**
   * RE-1 (W38.R1: additive; research 249 §1): a throwable's or a charge's record by the wire's kind -- the page's own (the
   * disc's `KitTable.throwables`, as `GrenadeThrower.setRecords` has them) -- so the seek's fold can lay the charges at
   * the target with their timers. Absent: the baked transcriptions (`./fold` `bakedThrowable`), which have the claymore
   * but not C4 or the PMN (disc-only), so those are not folded.
   */
  throwable?(kind: string): ThrowableRecord | null;
  /**
   * RV-7 (W39.R2: additive; research 276 §6): the hull the page's throwables fly over (its walk's grid with the map's
   * `DefaultMaterial`, `@s2u/scene` `gridCast`, as `GrenadeThrower` and `Room.hullCast` build it), read at each seek, so
   * the fold can fly an AN-M8 thrown before the target to where the room has it and lay its smoke at its age
   * (`./fold` `foldedSmokes`, REPLAY_SMOKE_FLIGHT_READING). Absent, or null at the seek: no smoke is folded, as before.
   */
  hull?(): HullCast | null;
  /**
   * RV2-02 (RV2.R2, the replay viewer redesign; W39.R2: additive): play at open (true, or absent: as before -- the
   * developers' mode, the embed, every existing caller), or open paused and held (false) until `release()`: no tick
   * advances under the hold (`advance` does nothing, `play` and `toggle` do not start the clock) while a seek or a step
   * still lands. A browser adaptation (REPLAY_ADAPTATION): the player's viewer holds the recording under the world's
   * loading screen; no game value.
   */
  autoplay?: boolean;
}

interface Snap { tick: number; index: number; bodies: BodyState[]; doors?: DoorWire[]; cranes?: CraneWire[]; env?: EnvWire }

/**
 * RV-2 (web sprint 39; research 276 §1; W39.R2, additive): what `onSeek` hands its listener at each seek.
 * - `from`: the replay's tick before the seek (a step back's: before the step).
 * - `to`: the tick the clock landed on (`ReplayClock.seek`'s value: the target clamped to the recording), known before
 *   anything of the target is told.
 * - `folded`: the target was reached by the snapshot at or before it and the fold of the records up to it (`seekTo`,
 *   research 244 §7, 249 §1-§5), not by playing on -- so what lay between was not played: true at every seek today.
 */
export interface ReplaySeek { from: number; to: number; folded: boolean }

const tickOf = (r: ReplayRecord): number => (r.kind === 'header' ? -Infinity : r.tick);

/**
 * The events the room broadcasts only while a round runs, so one before any `roundStart` says the recording opened
 * inside a round: its clock's minute taken off (`roundTime`), its time up (`timeExpired`), its side decided
 * (`eliminated`), its end (`roundOver`) -- `Room.penaltyMinute`, `clock`, `endRound` (`packages/match/src/room.ts`).
 * An `abandoned` is not one: the room abandons its launch hold too, before round 1 (`Room.clock`, room.ts:4284).
 */
const IN_ROUND: ReadonlySet<ServerEvent['type']> = new Set(['roundTime', 'timeExpired', 'eliminated', 'timedOut', 'roundOver']);   // LATER 127 / 138: `timedOut`

/**
 * RE-6 (research 249 §2): where Home lands -- the round's first tick: the tick of the segment's first `roundStart`
 * event, the one record that starts a round (`Room.startRound`, room.ts:4622-4652: the bomb's reset, the hostages',
 * the spawns, then the `roundStart`, all on one tick), so after Home the fold has the round in play and its bomb at the
 * reset (`./fold` `foldEvent`'s `roundStart` and `bomb`) and the compass draws it (`BombPage`'s phase gate). The
 * protocol has no `phase` event (the phase is the welcome's field, folded from these): the `roundStart` is the
 * recording's own mark of a round's state. `start` -- the segment's first tick -- when the segment has no `roundStart`,
 * or a round was already running when it opened (an `IN_ROUND` event before the first `roundStart`), so Home never
 * skips a round's play. That is the respawn room's case: its first round is in play from its construction with no
 * `roundStart` (the constructor's state, room.ts:1292; `hello`'s welcome `startTick` 0 at :1395) and ends by its
 * `timeExpired` and `roundOver` before round 2's `roundStart`. A classic room's recording opens before its first round
 * (the server's `RoomRecording`, one file a match; a session's segment at its room's build, `playtestSession.ts`).
 */
export function homeTick(records: readonly ReplayRecord[], start: number): number {
  for (const r of records) {
    if (r.kind !== 'event') continue;
    if (r.event.type === 'roundStart') return Math.max(r.tick, start);
    if (IN_ROUND.has(r.event.type)) return start;
  }
  return start;
}

export class ReplayClient implements NetClientSurface {
  id = 0;
  role: Role = 'spectator';
  team: Team | null = null;
  /** NetClient's own seat name (OBF-3): a replay watcher holds no seat. */
  seatName: string | null = null;
  /** Recorded server metadata only; legacy recordings remain unrestricted (REPLAY_ADAPTATION). */
  eqLimit = 0;
  /** HUD-ALIVE B (`../hud` `INFO_SESSION_MASTER_READING`): a replay watcher is never the session master -- the count's "%d". */
  sessionMaster = false;
  state: NetState = 'connecting';
  closeCode: number | null = null;
  /** LATER 62 (`NetClient.url`): a replay opens no socket, so no URL -- the close report names no route for it (`../net/closeReport`). */
  get url(): string { return ''; }
  /** TR-2 (`NetClient.refusal`): a replay never refuses a hello, so the Online line's status join (`withRefusalMap`) reads none. */
  readonly refusal: { reason: string; map: string } | null = null;
  /** OBF-20 (`NetClient.requestFloor`): a replay watcher sends no Chat menu request, so its floor stays 0. */
  requestFloor(_kind: 'taunt' | 'communication'): number { return 0; }
  queue = 0;
  rtt = 0;
  readonly corrections = { small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 };
  /** Settles once the segment is open or refused. */
  readonly ready: Promise<void>;
  /**
   * MU2-14: the refusal's kind beside its sentence -- the `./load` `ReplayLoadError`'s (`./refusalKind`), kept here
   * because the `refused` event (`../net/protocol`, the wire's type) carries the sentence only. Null while not refused,
   * and for a refusal that never came through the loader (the page's `check`, an error of another kind): text only.
   */
  refusedKind: ReplayLoadKind | null = null;
  /** The segment, once open. */
  segment: LoadedSegment | null = null;
  /** The file ended in a cut record (a live segment's flushed prefix). */
  truncated = false;
  /** LATER 498 (`NetClient.spawnPending`): a replay stands no walk, so no spawn of its own waits. */
  spawnPending(): boolean { return false; }
  /** LATER 498 (`NetClient.onSpawnHeld`): never called -- no spawn waits. */
  onSpawnHeld(_fn: () => void): () => void { return () => undefined; }

  private readonly now: () => number;
  private readonly listeners = new Set<(ev: ServerEvent) => void>();
  /** SVC-07c: each seat's last told pair, from the `seatTold` this client emits (a seek's, the playback's), as `NetClient.told`. */
  readonly told = new SeatToldBoard(this);
  /** AD-13: each seat's told tag, from the `seatClans` this client emits in playback (transient: a seek folds none), as `NetClient.clans`. */
  readonly clans = new SeatClanBoard(this);
  /** RE-4: told at each seek, before the target (`onSeek`); RV-2: handed the seek. */
  private readonly seekListeners = new Set<(seek: ReplaySeek) => void>();
  private records: ReplayRecord[] = [];
  private snaps: Snap[] = [];
  private snapTicks: number[] = [];
  private clock: ReplayClock | null = null;
  /** The next record `advance` reads. */
  private cursor = 0;
  private rosterNow: ReplayPlayer[] = [];
  private endRecord = false;
  private endSeen = false;
  /** The index of the first stateful event (`./fold`), or the records' length with none: a seek before it has no fold to tell. */
  private firstStateful = 0;
  /** The world's round epoch and the environment last laid on it (`NetClient.takeEnv`'s rule). */
  private epoch: number | null = null;
  private namedEnv: EnvWire | null = null;
  private world: (() => WorldState | null) | null;
  /** RE-1: the records the fold reads a charge's timers from (`ReplayClientOptions.throwable`). */
  private readonly throwable: ThrowableLookup;
  /** RE-1: each seat's dance the page was last told running (by play or by a seek), by its serial. */
  private dancing = new Map<number, number>();
  /**
   * RE-2: the segment's open -- its first snapshot's tick (the file's open: `RoomRecording` opens a file at the room's
   * snapshot, and the room hands the roster there) or its start, the later -- and the hostages told there, or null.
   */
  private openAt = 0;
  private openHostages: HostageWire[] | null = null;
  /** RE-3: the tick of the record (or the seek's target) being told the page now, else null: the page's clock reads it. */
  private telling: number | null = null;
  /** RE-3: the last seek's stopped figure (`./fold` `foldedFigure`), null when a clock runs at its target or before any seek. */
  private figure: number | null = null;
  /** RV2-02: held from the construction (`autoplay: false`) until `release()`. */
  private holding: boolean;

  constructor(source: Promise<LoadedSegment>, private readonly opts: ReplayClientOptions) {
    this.now = opts.now ?? (() => performance.now());
    this.holding = opts.autoplay === false;
    this.world = opts.world ?? null;
    this.throwable = opts.throwable ? (kind) => opts.throwable!(kind) : bakedThrowable;
    this.ready = source.then(
      (seg) => { if (this.state === 'connecting') this.open(seg); },
      (e: unknown) => { if (this.state === 'connecting') this.refuse(e instanceof Error ? e.message : String(e), loadKindOf(e)); },
    );
  }

  // ---- open ----

  /** MU2-14: the kind is set before the event, so a listener reads `refusedKind` at the `refused` event itself. */
  private refuse(reason: string, kind: ReplayLoadKind | null = null): void {
    this.state = 'refused';
    this.refusedKind = kind;
    this.emit({ type: 'refused', reason });
  }

  private open(seg: LoadedSegment): void {
    const why = this.opts.check?.(seg) ?? null;
    if (why !== null) { this.refuse(why); return; }
    this.segment = seg;
    this.truncated = seg.truncated;
    this.records = seg.records;
    this.snaps = [];
    seg.records.forEach((r, index) => {
      if (r.kind === 'snap') this.snaps.push({ tick: r.tick, index, bodies: r.bodies, ...(r.doors ? { doors: r.doors } : {}), ...(r.cranes ? { cranes: r.cranes } : {}), ...(r.env ? { env: r.env } : {}) });
      if (r.kind === 'end') this.endRecord = true;
    });
    this.snapTicks = this.snaps.map((s) => s.tick);
    const first = seg.records.findIndex((r) => statefulRecord(r, this.throwable, this.opts.hull !== undefined));
    this.firstStateful = first < 0 ? seg.records.length : first;
    let start = Infinity, end = -Infinity;
    for (const r of seg.records) { const t = tickOf(r); if (Number.isFinite(t)) { start = Math.min(start, t); end = Math.max(end, t); } }
    if (!Number.isFinite(start)) { start = 0; end = 0; }
    this.clock = new ReplayClock({ tickHz: seg.header.tickHz, start, end, snaps: this.snapTicks, now: this.now });
    this.rosterNow = this.rosterAt(start);
    this.dancing = new Map();
    // RE-2: the roster at the segment's open, drawn as the bodies are before the first snapshot (`bodies`: the first's).
    this.openAt = Math.max(start, this.snapTicks[0] ?? start);
    const opening = foldTo(seg.records, this.openAt, seg.header.tickHz, this.throwable).state;
    this.openHostages = foldedHostages(opening, this.openAt, this.snaps[0]?.bodies ?? []);
    this.cursor = 1;                                         // after the header: the start's own records play
    this.id = REPLAY_WATCHER_ID;
    this.state = 'open';
    this.eqLimit = this.equipmentLimitAt(start);
    const env = this.envAt(start);
    if (env) this.layEnv(env, true);
    this.telling = start;
    this.emit({ ...this.welcome(start, env), ...(this.openHostages ? { hostages: this.openHostages } : {}) });
    this.telling = null;
    if (!this.holding) this.clock.play();                 // RV2-02: held, it opens paused at the start
  }

  /**
   * The watcher's welcome at `tick`: a spectator's -- no seat, so no ghost, no banner; the round's count the game's
   * default until the recording's `roundStart` names its own (`MAX_ROUNDS`, `./net/rules`) -- with the roster now and the
   * world laid. The seek's fold sets its late-join fields over it (`./fold` `foldedJoin`).
   */
  private welcome(tick: number, env: EnvWire | null, kits?: ReadonlyMap<number, number[]>, chars?: ReadonlyMap<number, number>, characters?: ReadonlyMap<number, string | null>, bots?: ReadonlyMap<number, boolean>): Extract<ServerEvent, { type: 'welcome' }> {
    const seg = this.segment!;
    return {
      type: 'welcome', id: REPLAY_WATCHER_ID, version: seg.header.protocol, map: seg.header.map, tick, role: 'spectator', team: null,
      queue: 0, name: this.opts.name, players: this.welcomePlayers(this.rosterNow, kits, chars, characters, bots), rules: seg.header.rules,
      round: 1, rounds: MAX_ROUNDS, ghost: false,
      ...(this.eqLimit !== 0 ? { eqLimit: this.eqLimit } : {}),
      env: env ?? { revision: 0, epoch: 0, states: [] }, epoch: env?.epoch ?? 0,
      ...(this.gameType() !== null ? { gameType: this.gameType()! } : {}),
    };
  }

  private welcomePlayers(roster: readonly ReplayPlayer[], kits?: ReadonlyMap<number, number[]>, chars?: ReadonlyMap<number, number>, characters?: ReadonlyMap<number, string | null>, bots?: ReadonlyMap<number, boolean>): Extract<ServerEvent, { type: 'welcome' }>['players'] {
    const appearance = (p: ReplayPlayer): string | null | undefined => characters?.has(p.id) ? characters.get(p.id) : p.character;
    return roster.flatMap((p) => (p.role === 'player' && p.team ? [{
      id: p.id, name: p.name, team: p.team, ...((bots?.has(p.id) ? bots.get(p.id) : p.bot) ? { bot: true as const } : {}), ...(appearance(p) ? { character: appearance(p)! } : {}), char: chars?.get(p.id) ?? p.char, ...(kits?.has(p.id) ? { kit: [...kits.get(p.id)!] } : {}),
    }] : []));
  }

  // ---- the clock ----

  /** Plays the records the clock has passed since the last call (the mode's frame calls it). */
  advance(now: number = this.now()): void {
    if (this.state !== 'open' || !this.clock || this.holding) return;   // RV2-02: nothing played under the hold
    this.playTo(this.clock.tick(now));
  }

  private playTo(t: number): void {
    while (this.cursor < this.records.length) {
      const r = this.records[this.cursor]!;
      if (r.kind !== 'header' && r.tick > t) break;
      this.cursor++;
      this.telling = r.kind === 'header' ? null : r.tick;   // RE-3: the page's clock at the record's own tick
      this.take(r);
    }
    this.telling = null;
  }

  private take(r: ReplayRecord): void {
    switch (r.kind) {
      case 'players': this.rosterTo(r.players); break;
      case 'event':
        if (r.event.type === 'victory') {                  // RE-1: the dance the page holds, for a seek's stop
          if (r.event.clip) this.dancing.set(r.event.id, r.event.serial); else this.dancing.delete(r.event.id);
        }
        this.emit(r.event);
        break;
      case 'snap': if (r.env) this.layEnv(r.env, false); break;
      case 'end': this.endSeen = true; break;
      default: break;                                       // header, mark (PT-20), cmd (never played), hostages (RE-2: the open's, a seek's)
    }
  }

  play(): void { if (!this.holding) this.clock?.play(); }
  pause(): void { this.clock?.pause(); this.advance(); }
  toggle(): boolean {
    if (this.holding) return false;                        // RV2-02: the clock stays paused under the hold
    const on = this.clock?.toggle() ?? false; this.advance(); return on;
  }
  /** RV2-02: the recording is held (`autoplay: false`, not yet released): paused, its tick moved only by a seek or a step. */
  held(): boolean { return this.holding; }
  /**
   * RV2-02: the hold ends and the recording plays, once -- a client never held, or already released, is left as it is;
   * released before the segment opens, it plays at the open. `play` false (CPS.R9 (e), the page's `pause` beside the
   * loading hold, `./mount`): the hold ends and the clock stays as it stands, paused, so a paused seek is not played on
   * from (released before the open, the open plays and the page's pause at `ready` stops it, as without a hold).
   */
  release(play: boolean = true): void {
    if (!this.holding) return;
    this.holding = false;
    if (play && this.state === 'open') this.clock?.play();
  }
  speed(rate: number): number { return this.clock ? this.clock.speed(rate) : rate; }
  faster(): number { return this.clock?.faster() ?? 1; }
  slower(): number { return this.clock?.slower() ?? 1; }
  playing(): boolean { return this.clock?.playing ?? false; }
  rate(): number { return this.clock?.rate ?? 1; }
  /**
   * F2 (PT-19; research 244 §3): the scale `NetPage.frame` puts on the `dt` it hands `remote.frame`, so the bodies'
   * animation runs on the replay's clock (`ReplayClock.dtScale`: the speed playing, 0 paused or at the end, 0 for a
   * seek's or a step's frame); 0 before the recording opens and once it is closed. Read once a frame by the page.
   */
  dtScale(now: number = this.now()): number {
    return this.state === 'open' && this.clock ? this.clock.dtScale(now) : 0;
  }
  /** The recording's span: its first and last tick. */
  span(): { start: number; end: number } { return { start: this.clock?.start ?? 0, end: this.clock?.end ?? 0 }; }
  /**
   * RE-3 (W38.R3; research 249 §4): the page's clock in replay time, milliseconds -- the tick of the record being told the
   * page while one is (so a `roundStart`'s clock is set from its own tick, not the frame's), else the replay's tick now
   * (`serverTick`: standing still paused, scaled by the speed) -- over the recording's tick rate (its header's `tickHz`);
   * 0 before the recording opens.
   */
  pageNow(now: number = this.now()): number {
    const hz = this.segment?.header.tickHz;
    if (!hz) return 0;
    return ((this.telling ?? this.serverTick(now)) * 1000) / hz;
  }
  /**
   * RE-3: the figure the page's timer is set to by a seek's welcome -- the live page's at the target when no clock runs
   * there (`./fold` `foldedFigure`) -- else null; null before any seek.
   */
  stoppedFigure(): number | null { return this.figure; }
  /**
   * RE-3: the page's clock (`NetPageDeps.replayClock`'s shape): `pageNow` and `stoppedFigure`, one object a client.
   * `NetPage` reads it off its client, as it reads `dtScale` (PT-19), so the test room's replay branch passes nothing.
   */
  pageClock(): { now(): number; stoppedFigure(): number | null } { return this.pageFace; }
  private readonly pageFace = { now: (): number => this.pageNow(), stoppedFigure: (): number | null => this.stoppedFigure() };

  /** One snapshot on (play: what lies between is heard) or back (a seek); paused there. Returns the tick. */
  step(dir: 1 | -1): number {
    if (this.state !== 'open' || !this.clock) return 0;
    const from = this.clock.tick();
    const to = this.clock.step(dir);
    if (to >= from) this.playTo(to); else this.seekTo(to, from);
    return to;
  }

  /** Seek to `tick` (spec 4.1): the roster in force at it, the world of the snapshot at or before it, the events skipped. */
  seek(tick: number): number {
    if (this.state !== 'open' || !this.clock) return 0;
    return this.seekTo(tick);
  }
  /** Home: the round's first tick (RE-6, `homeTick`), else the segment's start. An explicit `seek` goes anywhere. */
  seekStart(): number { return this.seek(homeTick(this.records, this.clock?.start ?? 0)); }
  seekEnd(): number { return this.seek(this.clock?.end ?? 0); }

  /**
   * RE-4 (research 249 §5; W38.R1: additive): `listener` told at each seek -- `seek`, `seekStart`, `seekEnd`, a step back
   * -- before anything of the target is told (its roster, its world, its welcome), never at play or a step on. The page's
   * air at the old playhead is cleared there (`./matchActions`), and the welcome then lays the target's charges. Returns
   * its removal. A live `NetClient` has none: nothing on the live path is cleared by it. RV-2 (research 276 §1; W39.R2,
   * additive): the listener is handed the seek (`ReplaySeek`); one that takes no argument works as before.
   */
  onSeek(listener: (seek: ReplaySeek) => void): () => void {
    this.seekListeners.add(listener);
    return () => { this.seekListeners.delete(listener); };
  }

  /** The seek to `tick` from `from` (the tick before it: a step back has moved the clock already). */
  private seekTo(tick: number, from: number = this.clock!.tick()): number {
    const clock = this.clock!;
    const target = clock.seek(tick);                       // RV-2: the landing, known before anything of the target
    const seek: ReplaySeek = { from, to: target, folded: true };
    for (const l of [...this.seekListeners]) l(seek);      // RE-4: the air at the old playhead, before the target is told
    const i = seekIndex(this.records, target);
    const s = i >= 0 ? (this.records[i] as { tick: number }).tick : clock.start;
    // The roster is state, not a transient (the review's F1): the last `players` at or before the TARGET -- the room
    // writes one at any tick, the snapshots fall on every other -- so a leave or a join between the two is not lost.
    this.rosterTo(this.rosterAt(target));
    // The world as it stood at the snapshot, laid silently (a joiner's: JOIN_SILENT_READING): reset, then its state.
    const env = this.envAt(s);
    this.epoch = null;
    this.namedEnv = null;
    this.worldNow()?.reset();
    if (env) this.layEnv(env, true);
    this.eqLimit = this.equipmentLimitAt(target);
    // Every record at or before the target is behind the playhead now: none of it is played. The stateful events
    // among them are folded (W37.R4, `./fold`): one pass, which also finds where play goes on from.
    const was = this.cursor;
    const { state, end: k } = foldTo(this.records, target, this.segment!.header.tickHz, this.throwable);
    this.cursor = k;
    this.endSeen = this.endRecord && this.records.slice(1, k).some((r) => r.kind === 'end');
    // Told only once a stateful event lies behind the old playhead or the new one: the page holds some state to set.
    if (this.firstStateful < Math.max(was, k)) {
      const at = firstAfter(this.snapTicks, target) - 1;
      const hull = this.opts.hull?.() ?? null;            // RV-7: the smokes flown over the page's hull
      const { welcome, score, victories, told } = foldedJoin(state, target, this.segment!.header.tickHz, at >= 0 ? this.snaps[at]!.bodies : [], hull);
      // RE-1: a dance the page holds that is not the one running at the target is stopped, as the room stops one.
      for (const [id, serial] of this.dancing) {
        if (state.dances.get(id)?.serial !== serial) this.emit({ type: 'victory', id, serial, clip: null, elapsed: 0 });
      }
      // RE-2: before the segment's open (its first snapshot) the roster is the open's, as the bodies drawn there are.
      if (!welcome.hostages && target < this.openAt && this.openHostages) welcome.hostages = this.openHostages;
      this.figure = foldedFigure(state, target);           // RE-3: read by the page at the welcome
      this.telling = target;                               // RE-3: the page's clock at the target while the fold is told
      this.emit({ ...this.welcome(target, this.namedEnv, state.kits, state.chars, state.characters, state.bots), ...welcome });
      for (const v of victories) this.emit(v);             // the room's `hello`: each dance under way after the welcome
      this.dancing = new Map(victories.map((v) => [v.id, v.serial]));
      this.emit(score);
      // SVC-07c: the seats' pairs, as a game's joiner is told them; none behind the target, an empty one -- a seek back
      // before every `seatTold` leaves the page's board none of the later pairs (the re-review's B).
      this.emit(told ?? { type: 'seatTold', seats: [] });
      this.telling = null;
    }
    return target;
  }

  // ---- the roster ----

  /**
   * The roster in force at `tick`: the last `players` record at or before it (empty before any), with the recorded `joined`
   * of a member it holds after it applied -- REPLAY-TEAM-SWAP (2026-11-09): a recording made before the room wrote a roster
   * record at SWITCH TEAMS or the side swap holds only their `left` then `joined`, so the side is the `joined`'s. A `left`
   * alone changes nothing here (a departure writes its own roster record), and a member the record does not hold is not added.
   */
  private rosterAt(tick: number): ReplayPlayer[] {
    let out: ReplayPlayer[] = [];
    for (const r of this.records) {
      if (r.kind === 'header') continue;
      if (r.tick > tick) break;
      if (r.kind === 'players') out = r.players;
      else if (r.kind === 'event' && r.event.type === 'joined') {
        const { id, team } = r.event;
        if (out.some((p) => p.id === id && p.team !== team)) out = out.map((p) => (p.id === id ? { ...p, team } : p));
      }
    }
    return out;
  }

  /** Optional recorded welcome/lobby metadata at the playhead, restored independently of transient event playback. */
  private equipmentLimitAt(tick: number): number {
    let limit = 0;
    for (const r of this.records) {
      if (r.kind === 'header') continue;
      if (r.tick > tick) break;
      if (r.kind === 'event' && (r.event.type === 'welcome' || r.event.type === 'gameLobby')) limit = equipmentLimit(r.event.eqLimit);
    }
    return limit;
  }

  /** The roster becomes `next`: what differs told to the page as the room's own lobby events would. */
  private rosterTo(next: readonly ReplayPlayer[]): void {
    const was = new Map(this.rosterNow.map((p) => [p.id, p]));
    const now = new Map(next.map((p) => [p.id, p]));
    this.rosterNow = [...next];
    for (const [id] of was) if (!now.has(id)) this.emit({ type: 'left', id });
    for (const p of next) {
      const o = was.get(p.id);
      // Authored CPU presentation: a trusted roster transition replaces the bot bit even when id, name and team
      // are reused. Lightweight recordings do not emit a folded welcome, so this event must carry the bit too.
      if (p.team && (!o || o.team !== p.team || (o.bot === true) !== (p.bot === true)))
        this.emit({ type: 'joined', id: p.id, name: p.name, team: p.team, ...(p.bot === true ? { bot: true as const } : {}) });
      else if (o && o.name !== p.name) this.emit({ type: 'renamed', id: p.id, name: p.name });
    }
  }

  /** The roster now (the last `players` record played or restored). */
  roster(): ReplayPlayer[] { return [...this.rosterNow]; }

  // ---- the world ----

  /** The environment of the last snapshot at or before `tick` that names one. */
  private envAt(tick: number): EnvWire | null {
    for (let k = firstAfter(this.snapTicks, tick) - 1; k >= 0; k--) { const snap = this.snaps[k]!; if (snap.env) return snap.env; }
    return null;
  }

  /**
   * A recorded environment on the page's world, by `NetClient.takeEnv`'s rule: an older round's not laid; within the
   * round a revision no newer than the one laid dropped; a later round's resets the world first (`newEpoch`).
   */
  private layEnv(env: EnvWire, silent: boolean): void {
    if (this.epoch !== null && epochNewer(this.epoch, env.epoch)) return;
    const held = this.namedEnv;
    if (held && this.epoch === (env.epoch & 0xffff) && !revisionNewer(env.revision, held.revision)) return;
    if (this.epoch === null) this.epoch = env.epoch & 0xffff;
    else this.newEpoch(env.epoch);
    const quiet = silent || this.namedEnv === null;
    this.namedEnv = env;
    const world = this.worldNow();
    if (world) applySnapshotWorld({ env }, world, JOIN_SILENT_READING && quiet);
  }

  private worldNow(): WorldState | null { return this.world?.() ?? null; }

  setWorld(world: (() => WorldState | null) | null): void {
    this.world = world;
    const w = this.worldNow();
    if (w && this.namedEnv) applySnapshotWorld({ env: this.namedEnv }, w, JOIN_SILENT_READING);
  }

  newEpoch(epoch: number): boolean {
    if (this.epoch !== null && !epochNewer(epoch, this.epoch)) return false;
    this.epoch = epoch & 0xffff;
    this.worldNow()?.reset();
    return true;
  }

  roundEpoch(): number | null { return this.epoch; }

  env(): EnvWire | undefined { return this.namedEnv ?? undefined; }

  /** The header's game type (`SimMap.gameType` as a string, research 240 §6), or null. */
  gameType(): GameType | null {
    const g = this.segment?.header.gameType ?? null;
    return g !== null && /^[0-5]$/.test(g) ? (Number(g) as GameType) : null;
  }

  // ---- the bodies ----

  serverTick(now: number = this.now()): number { return this.clock?.tick(now) ?? 0; }
  /** The tick the bodies are drawn at: the replay's own, no interpolation delay (every snapshot is in hand). */
  viewTick(now: number = this.now()): number { return this.serverTick(now); }
  /** NCW-17's displayed tick (`NetClient.shownTick`), inert: a replay fires no round. */
  shownTick(): number | null { return null; }

  /** Every recorded body at the replay's tick, between the two snapshots around it (`NetClient.bodies`' law). */
  bodies(now: number = this.now()): BodyState[] {
    // NU-12 B2: no `spawns` here (not built) -- a replay's copy is rebuilt only at a dead-to-alive change (REMOTE_RESPAWN_REBUILD_READING, research 328 §6).
    const n = this.snaps.length;
    if (!n || this.state !== 'open') return [];
    const t = this.serverTick(now);
    const b = Math.min(n - 1, firstAfter(this.snapTicks, t));
    const newer = this.snaps[b]!, older = b > 0 ? this.snaps[b - 1]! : null;
    if (!older || newer.tick <= t) return newer.bodies;
    const f = Math.max(0, Math.min(1, (t - older.tick) / (newer.tick - older.tick)));
    const before = new Map(older.bodies.map((x) => [x.id, x]));
    return newer.bodies.map((x) => {
      const o = before.get(x.id);
      if (!o) return x;
      const turn = shortTurn(o.yaw, x.yaw);
      return {
        ...x,
        feet: [o.feet[0] + (x.feet[0] - o.feet[0]) * f, o.feet[1] + (x.feet[1] - o.feet[1]) * f, o.feet[2] + (x.feet[2] - o.feet[2]) * f],
        yaw: wrapYaw(o.yaw + turn * f), pitch: o.pitch + (x.pitch - o.pitch) * f,
      };
    });
  }

  /** The doors as the snapshot at or before the replay's tick has them. */
  doors(): DoorWire[] | undefined {
    if (!this.snaps.length) return undefined;
    const k = firstAfter(this.snapTicks, this.serverTick()) - 1;
    return this.snaps[Math.max(0, k)]!.doors;
  }

  /** P7 (`NetClient.acked`): a watcher presses no door, so has nothing for the room to ack. */
  acked(): number | null {
    return null;
  }

  /** P8 (`NetClient.heardTick`): a watcher predicts no pull, so none is settled on its ticks. */
  heardTick(): number | null {
    return null;
  }

  /** Chain Reaction's hooks as the snapshot at or before the replay's tick has them. A recording that predates them has none. */
  cranes(): CraneWire[] | undefined {
    if (!this.snaps.length) return undefined;
    const k = firstAfter(this.snapTicks, this.serverTick()) - 1;
    return this.snaps[Math.max(0, k)]!.cranes;
  }

  /** The recording's snapshot rate over its whole span. */
  snapshotRate(): number {
    const n = this.snaps.length;
    if (n < 2 || !this.segment) return 0;
    const span = (this.snaps[n - 1]!.tick - this.snaps[0]!.tick) / this.segment.header.tickHz;
    return span > 0 ? (n - 1) / span : this.segment.header.snapshotHz;
  }

  // ---- the page's ----

  on(listener: (ev: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: ServerEvent): void {
    if (ev.type === 'welcome' || ev.type === 'gameLobby') this.eqLimit = equipmentLimit(ev.eqLimit);
    // V13-3c (`SCENE_DEATH_ON_WIRE_READING`): a told death of the round played, laid on the page's world as the live
    // client lays it (a transient: a seek past it does not replay it -- the target's state still tells those it turns off).
    if (ev.type === 'sceneDeath' && this.epoch === (ev.epoch & 0xffff)) { const w = this.worldNow(); if (w) applySceneDeath(ev, w, false); }
    if (ev.type === 'doorUse' && (ev.pick === 0 || ev.pick === 1)) { this.doorPicks.push({ door: ev.door, pick: ev.pick }); if (this.doorPicks.length > 64) this.doorPicks.shift(); }   // LATER 362
    for (const l of [...this.listeners]) l(ev);
  }

  /** LATER 362: the recording's door picks (`doorUse`) played since the last call, as the live client's (`takeDoorPicks`). */
  takeDoorPicks(): { door: number; pick: 0 | 1 }[] {
    return this.doorPicks.splice(0);
  }
  private readonly doorPicks: { door: number; pick: 0 | 1 }[] = [];

  /** A recording takes nothing from the page (W35.R4). */
  send(_ev: ClientEvent): void { /* no-op */ }

  /**
   * Sprint 20's voice (SVC-20b-page, `NetClient.onVoice` / `sendVoice`): a recording carries no voice (the plan's constraint 5:
   * voice frames are never recorded), so a replay hears none and sends none -- inert, as `send` is.
   */
  onVoice(_listener: (down: VoiceDown) => void): () => void { return () => {}; }
  sendVoice(_frame: Uint8Array): void { /* no-op */ }
  /**
   * AD-14 (`NetClient.voiceMembers`): the room's count of a page's own voice channel goes to that page alone and is never
   * recorded (`./fold` `EVENT_CLASS.voiceMembers`: transient), so a replay has none -- null, as before the room's first.
   */
  readonly voiceMembers: { channel: number; members: number } | null = null;

  /** OT.R59 (RECONNECT-GHOST step 2, `NetClient.sayBye`): a replay has no room to tell -- nothing to say. */
  sayBye(): void {}

  /** NET-RES-2d (`NetClient.heardAt`): a replay has no server to fall silent -- always heard now (`NetPage` skips it anyway). */
  heardAt(): number { return performance.now(); }

  /** NET-RES-2d (`NetClient.drop`): a replay has no link to give up -- closed as `close` closes it. */
  drop(): void { this.close(); }

  close(): void {
    if (this.state === 'closed') return;
    this.clock?.pause();
    this.state = 'closed';
    this.closeCode = 1000;
    this.told.close();
  }

  /** The segment's end record has been played (or the file had none to play: false). */
  ended(): boolean { return this.endSeen; }
  /** A live segment's prefix: cut in a record, or whole but with no `end` (the socket closed before it). */
  partial(): boolean { return this.truncated || (this.segment !== null && !this.endRecord); }

  // ---- inert: a watcher of a recording drives no walk and reports nothing ----

  rebind(_walk: NetWalk): void { /* a watcher drives no walk */ }
  /** PAR-37 (`NetClient.replayed`): a watcher predicts nothing, so no prediction is set aside. */
  replayed(_after: number): void { /* no-op */ }
  reportLoaded(): void { /* no room to tell */ }
  /** LATER 64 (`NetClient.reportLateLoad`): a replay is no seat -- no room to tell. */
  reportLateLoad(): void { /* no room to tell */ }
  loadReported(): boolean { return false; }
  /** VRJ-1: this replay spectator owns no actor and has no live page's load-death arrival. */
  deadAtLoadAt(): number | null { return null; }
  /** B138: a replay takes no respawn press; the page's own clock alone. */
  roomSecondsDead(): number | null { return null; }
  lastSeq(): number { return 0; }
  combatReport(): { events: CombatReport[]; dropped: number } { return { events: [], dropped: 0 }; }
  /** NU-3c (`NetClient.healthOf`): a recording holds no `health` event (research 321 section 4.2.1), so a replay's bar stays empty. */
  healthOf(_id: number): number | null { return null; }
}

/**
 * The client as `NetPage` holds it (`NetPageDeps.client`'s return): `NetClient` is a class with private members, so a
 * structural twin is not assignable to it; `ReplayClient` implements its whole public surface (`NetClientSurface`, which
 * the typecheck holds), and `NetPage` reads nothing else.
 */
export function asNetClient(c: ReplayClient): NetClient {
  return c as unknown as NetClient;
}
