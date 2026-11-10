import {
  AN_M8, CLAYMORE, CLAYMORE_RULES, GAME_FRAME_DT, GameFrameAccumulator, HE, holdsFuse, launchGrenade, M67, MARK141, stepGrenade,
  type HullCast, type ThrowableRecord,
} from '@s2u/scene';
import type { ReplayPlayer, ReplayRecord } from '../../../match/src/replay/format';
import { equipmentKind } from '../equipment';
import { SEAL_ANIMS } from '../locomotion';
import type { TurretWire } from '../net/emplacement';
import type { BombWire } from '../net/objective';
import {
  ACTION_CODES, BodyFlag, JOIN_STATE_VERSION, type BodyState, type DropWire, type HostageWire, type JoinCorpseWire, type JoinProjectileWire,
  type DecidedWire, type JoinResultWire, type JoinWire, type RoomPhase, type ServerEvent,
} from '../net/protocol';
import { MAX_ROUNDS } from '../net/rules';

/**
 * The seek's fold (web sprint 37 PTT-6; ruling W37.R4, an addition to spec 4.1 "Seek"; research 244 §7).
 * REPLAY_ADAPTATION, as the replay mode is: SOCOM II plays no recording back, so nothing here is a game value or changes
 * one (PT.R3). A seek lands on the snapshot at or before the target (`SEEK_SNAPSHOT_RULE_ADAPTATION`) and skips the
 * events behind it; W37.R4 adds that the stateful ones are folded -- read from the segment's start to the target into the
 * state they leave -- and told to the page as a page joining the room at the target is told it: the welcome's late-join
 * fields (`objective`, `turrets`, `phase`, `startTick`, `countdown`, the join envelope's result, corpses and drops,
 * laid silently by the live page's own handlers: `JOIN_SILENT_READING`, PF-28) and then the room's `score`. The transient
 * ones (a tracer, a sound, a grenade's arc) are never replayed.
 *
 * RE-1 (web sprint 38; research 249 §1) folds what PTT-6 left engine-local (research 244 §7.2), each as the room's own
 * join tells it (`match/src/room.ts` `hello`, `joinWire`; `match/src/joinState.ts` `joinWire`): a victory dance still
 * running at the target (the `victory` told after the welcome with its `elapsed`), the charges lying there (the join
 * envelope's `projectiles`), and the ghosts (its `ghosts`).
 *
 * RE-2 (web sprint 38; W38.R2; research 249 §3) folds EXTRACTION's hostages as the room's welcome tells a joiner them
 * (`room.ts` `hello`: `hostages: this.extraction.wire()`; `match/src/extraction.ts` `wire`): the roster from the
 * recording's `hostages` record at or before the target (each hostage's id, name, model, place and state), the
 * `hostageState` and hostage `kill` events after it, and each one's place from the last snapshot that held its body.
 *
 * RV-6 (web sprint 39; research 276 §5) tells a corpse whose kill named no clip -- a blast's, a fall's -- in the landing
 * its body holds in the target's snapshot, at the death's age (`REPLAY_CORPSE_LANDING_READING`).
 *
 * RV-7 (web sprint 39; research 276 §6) folds an AN-M8 thrown at or before the target and not yet removed, as the room's
 * join lists it (the envelope's `projectiles`; `SMOKE_PHASE_ON_WIRE_READING`): flown from its `grenade` event over the
 * page's hull (`foldedJoin`'s `hull`, `ReplayClientOptions.hull`), as `Room.flyGrenades` flies it
 * (`REPLAY_SMOKE_FLIGHT_READING`). Without a hull no smoke is folded.
 */

/** W37.R4's two classes: folded on a seek, or skipped (never replayed). */
export type EventClass = 'stateful' | 'transient';

/**
 * Every kind of `ServerEvent` (`../net/protocol`), stateful or transient: the one table (W37.R4). Its type is the
 * union's kinds, so the typecheck refuses a kind left out (or one the union does not have); `test/replayFold.test.ts`
 * reads the union's text and fails the same way at run time. A recording holds only what the room broadcast
 * (`match/src/room.ts` `broadcast` -> `recorder.event`): a kind sent to one page is never in one, and is transient
 * here so that a hand-made one is never folded.
 */
export const EVENT_CLASS: Record<ServerEvent['type'], EventClass> = {
  // ---- stateful: what the screens draw at the target ----
  score: 'stateful',           // the scoreboard and the round's clock (`timeLeft`)
  roundStart: 'stateful',      // the round, its clock and phase; the drops go with the air (the page's `newRound`)
  roundTime: 'stateful',       // the round's total after a minute taken off: the clock
  timeExpired: 'stateful',     // the clock at 00:00, the phase `expired` (its line and music: not replayed)
  eliminated: 'stateful',      // the phase `decided` (its lines and music: not replayed)
  timedOut: 'stateful',        // LATER 127 / 138: the phase `decided` too (its lines and music: not replayed)
  roundOver: 'stateful',       // the round's screens, the clock stopped
  abandoned: 'stateful',       // the clock stopped, no screen, the room waiting; the drops go with the air
  countdown: 'stateful',       // the owner's launch countdown: the clock before round 1
  kill: 'stateful',            // a body's death: its corpse (its kill line and voice: not replayed)
  botCharacter: 'stateful',    // FBA.R10: assigned regional CPU appearance, including null on lobby return
  spawn: 'stateful',           // a body alive again; its kit and its type
  bomb: 'stateful',            // DEMOLITION's bomb
  turret: 'stateful',          // a turret's occupant (the broadcast; the occupant's rounds go to him alone)
  drop: 'stateful',            // a world drop lying (PF-34)
  taken: 'stateful',           // a world drop gone; the taker's kit
  joined: 'stateful',          // the roster: folded by the `players` records (`ReplayClient.rosterAt`), not here
  left: 'stateful',            // the roster, as `joined`
  renamed: 'stateful',         // the roster, as `joined`
  hostageState: 'stateful',    // EXTRACTION's hostages: folded on the `hostages` record's roster (RE-2), told in the welcome
  seatTold: 'stateful',        // SVC-07c: the seats' told pairs, the last one; a joiner is told it after its welcome (the bridge)
  // ---- transient: drawn or heard once, never replayed ----
  shot: 'transient',           // a round's muzzle, tracer and report
  impact: 'transient',         // to the shooter alone
  grenade: 'transient',        // a grenade's arc (W37.R4's example), a Detonator's fire; a charge's placement read (RE-1)
  detonate: 'transient',       // a charge set off: a verb; read for the charge's state (RE-1), never replayed
  sceneRound: 'transient',     // research 386 §3.2: a scene FIRE_WEAPON's round's explosion, drawn and heard once
  placed: 'transient',         // to the thrower alone
  flinch: 'transient',         // a clip
  motion: 'transient',         // a clip a map program pushed (a door's Open door; research 92 section 2)
  doorUse: 'transient',        // LATER 362: the room's pick for a door's next swing (the open or the kick), followed as it plays
  hurtVoice: 'transient',      // a voice
  reloadSound: 'transient',    // a sound
  victory: 'stateful',         // a dance running: told after the welcome as the room's join does (RE-1; no sound, no line)
  action: 'transient',         // a switch's presentation run (sounds, effects); its state rides the snapshot's env (PF.R26)
  sceneDeath: 'transient',     // V13-3c: a scene death's presentation run (sounds, the motion's fade), played once; not folded
  taunt: 'transient',          // a voice and a line
  communication: 'transient',  // a voice and a line
  escort: 'transient',         // LATER 131: ESCORT's script lines at the room's moments (lines and streams), heard once
  chat: 'transient',           // a line
  system: 'transient',         // SA-43c Part 2: the server's system message, sent to each page, never recorded
  welcome: 'transient',        // to one page; the fold's own carrier
  refused: 'transient',        // to one page
  pong: 'transient',           // to one page
  queue: 'transient',          // to one page
  promoted: 'transient',       // to one page
  demoted: 'transient',        // to one page
  hurt: 'transient',           // to one page
  health: 'transient',         // NU-3c: to a seat's side and the spectators, sent, never recorded
  stale: 'transient',          // to one page
  blast: 'transient',          // to one page
  votes: 'transient',          // to one page
  spectatorVote: 'transient',  // a line (SVC-23e)
  spectatorsEjected: 'transient', // a line; the spectators' closes follow (SVC-23e)
  kicked: 'transient',         // to one page
  loadout: 'transient',        // to one page
  kit: 'transient',            // to one page
  kitHeld: 'transient',        // KIT-HELD: to one page (`send`, never recorded)
  resume: 'transient',         // OT.R59 (RECONNECT-GHOST): to one page (`send`, never recorded)
  deadAtLoad: 'transient',     // VRJ-1: to the loading seat alone (`send`, never recorded)
  victoryOffer: 'transient',   // to one page
  voiceFloor: 'transient',     // to one page; voice is never recorded
  voiceMembers: 'transient',   // AD-14: to one page, its channel's member count; voice is never recorded
  seatClans: 'transient',      // AD-13: the told tags; nothing in a replay draws them (the speaker line needs the floor, never recorded)
  combat: 'transient',         // a playtest instrument's report, to the attacker and the target
  gameLobby: 'transient',      // the game lobby's (the bridge's), not the room's broadcast
};

/**
 * The wall-clock bound the fold of a 30-minute segment is held under (`test/replayFold.test.ts`; research 244 §7): a
 * test's margin, not a game value -- the fold is one pass over the records behind the target, measured at about 0.5 ms
 * over 74,197 records, so the bound is a hundredfold margin for a loaded host; the test also counts the records the fold
 * visits, which no host's speed changes.
 */
export const REPLAY_FOLD_BOUND_MS_ADAPTATION = 50;

type ScoreEvent = Extract<ServerEvent, { type: 'score' }>;
type Welcome = Extract<ServerEvent, { type: 'welcome' }>;
type VictoryEvent = Extract<ServerEvent, { type: 'victory' }>;
type SeatToldEvent = Extract<ServerEvent, { type: 'seatTold' }>;

/** What the stateful events leave at a tick. Ticks are the recording's (the room's tick). */
export interface FoldState {
  /** The last `score`: the scoreboard. */
  score: ScoreEvent | null;
  /** The tick the round's clock reads 0 on; null: stopped (between rounds, waiting) or none heard. */
  endsTick: number | null;
  /** The round's total, seconds (`roundStart`, `roundTime`). */
  roundSeconds: number;
  /** LATER 152 (LATER 148's review, finding 4): the round's length as its `roundStart` named it (the page's `roundLength`). */
  roundLength: number;
  /** The round in play, from its `roundStart`. */
  round: { round: number; rounds: number; startTick: number } | null;
  /** The room's state as the welcome names it, once a round event said it. */
  phase: RoomPhase | null;
  /** LATER 155: what decided the round (`eliminated`, `timedOut`; the first), the welcome's `decided` while `phase` is 'decided'. */
  decided: DecidedWire | null;
  /**
   * LATER 158 (its review's F1): the recording's rules are classic (its header's `rules`; true with no header) -- a bomb's
   * result decides the room's round only there (`room.ts`'s play arm returns before it under respawn rules).
   */
  classic: boolean;
  /** The last round end (`roundOver`) since the last round start or abandon, and its tick. */
  result: JoinResultWire | null;
  /** The tick the owner's launch countdown ends on, while one runs. */
  countdownEnds: number | null;
  bomb: BombWire | null;
  turrets: Map<number, TurretWire>;
  /** Each body's death since its last spawn: the room's clip, its cause and the tick. */
  corpses: Map<number, { clip: string | null; cause?: number; tick: number }>;
  /** Each body's kit and type as its last spawn (or claim) gave them. */
  kits: Map<number, number[]>;
  chars: Map<number, number>;
  characters: Map<number, string | null>;
  bots: Map<number, boolean>;
  drops: Map<number, DropWire>;
  /** RE-1: each seat's dance started and not stopped (the room's `victoryPlaying`), in the order the room keeps them. */
  dances: Map<number, { serial: number; clip: string; tick: number }>;
  /** RE-1: each charge set down and not cleared with the air, by its `pid`, in the room's flying order (`Room.flying`). */
  charges: Map<number, FoldedCharge>;
  /** RV-7: each AN-M8 thrown and not cleared with the air, by its `pid` (`foldedSmokes` flies it to the target). */
  smokes: Map<number, FoldedSmoke>;
  /** RE-1: the seated players (the `players` records' role 'player' with a team): the room's `players`, its seats. */
  seats: Set<number>;
  /** RE-1: the seats spawned since they were seated (a new seat is the room's new `Player`: not alive). */
  spawned: Set<number>;
  /**
   * RE-1 (the review): the seats whose death or its absence the segment shows -- a reset seen (`roundStart`, `abandoned`),
   * the seat's own seating (a `players` record after the segment's first), its `spawn` or its `kill`. A server's file
   * opens on the carried roster (`match/src/replay/files.ts` `RoomRecording`), whose dead seats died in the file before:
   * the room names them corpses, so the fold names no ghost it cannot know is one.
   */
  known: Set<number>;
  /** RE-1: whether the segment's first `players` record has been read (its seats are carried, not seated). */
  rostered: boolean;
  /**
   * RE-2: EXTRACTION's hostages by body id, in the roster's order, from the last `hostages` record read and the
   * `hostageState` and hostage `kill` events since; null before any record (an older file, or a room with none).
   */
  hostages: Map<number, FoldedHostage> | null;
  /**
   * RE-3 (research 249 §4): the round timer's figure the live page left on the HUD when its clock last stopped -- the
   * page draws no timer while neither its round clock nor its launch countdown runs (`NetPage.frame`), so the HUD keeps
   * the last figure drawn: the round's seconds left at a `roundOver` or an `abandoned` (0 once its time expired), the
   * countdown's at an `abandoned` in the launch hold, the round's length at a countdown called off (`NetPage.countdown`);
   * `PAGE_FIGURE_DEFAULT_S` before any.
   */
  figure: number;
  /** RE-3: the page's launch countdown's end (`NetPage.launchAt`) in ticks: set by a `countdown`, cleared by its call-off, a `roundStart`, an `abandoned`. */
  launchEnds: number | null;
  /** SVC-07c: the last `seatTold` (each a whole game's pairs, replacing the one before, as the page's board does). */
  told: SeatToldEvent | null;
}

/**
 * RE-3 (research 249 §4): the timer's figure on a page no clock has set -- the HUD's own (`../hud` `DEFAULT_MODEL.timer`,
 * a round's six minutes) and the page's round length until a `roundStart` names one (`NetPage.roundSeconds`): the
 * figure a live page shows before its first round, and after a countdown called off before any. The page's own value, a
 * browser adaptation's, not a game value (REPLAY_ADAPTATION).
 */
export const PAGE_FIGURE_DEFAULT_S = 6 * 60;

/** RE-2: a hostage as the fold holds it: the welcome's wire (`HostageWire`, its death apart) and its death's tick and clip. */
export interface FoldedHostage {
  wire: Omit<HostageWire, 'deathClip' | 'age'>;
  /** The tick it died (the room's `diedAt`): its `kill`'s, or its record's less the record's `age`; null alive. */
  diedAt: number | null;
  deathClip: string | null;
}

/** RE-1: a charge as the room flies it (`Room.flyer`): its pid, owner, kind and record, where it lies, its facing, its tick. */
export interface FoldedCharge {
  pid: number; owner: number; kind: string; record: ThrowableRecord;
  pos: [number, number, number]; facing: [number, number, number];
  /** The tick it was set down (its `grenade` event's). */
  tick: number;
  /** The tick it was set off (a `detonate`, its owner's Detonator, a PMN's trip); null while it lies armed or arming. */
  setOff: number | null;
}

/**
 * RV-7: an AN-M8 as its `grenade` event launched it (`Room.throwGrenade`: `launchGrenade(from, velocity, record)`, the
 * broadcast's `from`, `velocity` and `pid`): its owner, kind, record and the tick it was thrown.
 */
export interface FoldedSmoke {
  pid: number; owner: number; kind: string; record: ThrowableRecord;
  from: [number, number, number]; velocity: [number, number, number];
  /** The tick its `grenade` event was recorded at (the room's tick at the throw, before its next step flies it). */
  tick: number;
}

/** RE-1: a throwable's or a charge's record by the wire's kind (`zweapon.rdr`'s `InternalName`); null for none. */
export type ThrowableLookup = (kind: string) => ThrowableRecord | null;

/**
 * The records the viewer carries without the disc's tables (`@s2u/scene`'s transcriptions): the room's own fallback set
 * (`match/src/room.ts` `BAKED_THROWN`; `../equipment` `throwableOf`'s). C4 and the PMN come off the disc only (research
 * 94 §C5), so with no `ReplayClientOptions.throwable` they are not folded (research 249 §1).
 */
const BAKED_BY_NAME: ReadonlyMap<string, ThrowableRecord> = new Map([M67, HE, AN_M8, MARK141, CLAYMORE].map((r) => [r.name, r]));
export const bakedThrowable: ThrowableLookup = (kind) => BAKED_BY_NAME.get(kind) ?? null;

/**
 * Whether a record is a charge the room sets down rather than throws: the room's dispatch of a `throw` by the item's
 * kind (`match/src/room.ts` `case 'throw'`: `kindOf` -> `equipmentKind`, 'placed' or 'c4' to `placeCharge`).
 */
const isCharge = (r: ThrowableRecord): boolean => { const k = equipmentKind(r.id); return k === 'placed' || k === 'c4'; };

/**
 * RV-7: whether a thrown record is a smoke -- the page's own rule (`../grenade` `detonationOf`: `Explosion_Radius` 0 is
 * 'smoke'), which is the AN-M8 (zweapon.rdr's, `@s2u/scene` `throwableRecord`; baked `AN_M8`, radius and damage 0).
 */
const isSmoke = (r: ThrowableRecord): boolean => !isCharge(r) && r.explosionRadius === 0;

/**
 * RV-7 (research 276 §6): where an AN-M8 is at the target is the room's flight of it, which no record holds (no event is
 * broadcast when it comes to rest or pours: `Room.flyGrenades` sends nothing for a smoke). The fold flies it again from
 * its `grenade` event as the room does -- `launchGrenade(from, velocity, record)`, then `stepGrenade` once per game frame
 * (`GAME_FRAME_DT`) over the hull -- on a fresh `GameFrameAccumulator` advanced one tick (1 / tick rate) for each room
 * step after the throw's tick, as `Room.flyGrenades` advances its own each step. Three things differ from the room's run:
 * - when the throw was decided: one decided between two steps (its command already run) is recorded at the tick before
 *   the room's first flight of it, and the fold's count is exact. One decided inside a step -- the live page's usual case:
 *   its throw names the command it sends with it (`NetPage`'s `lastSeq()`), so the room waits for that command
 *   (`Room.timed`) and decides it in the step that runs it (`settle`), before that step's `flyGrenades` -- is recorded at
 *   the step whose own flight already moves it once. The recording does not say which, so the fold can trail the room by
 *   one game frame (about two ticks) for about half of the targets;
 * - the accumulator: the room's carries the phase of whatever else was flying at the throw and is reset only when its
 *   flying list empties, so with another projectile in the air its frame count can differ by one more;
 * - in each case `stepGrenade`'s path is the same frame by frame; its place in flight and its timers may be a frame off.
 * - the hull: the page's at the seek (`ReplayClientOptions.hull`: the grid the page's own throwables fly over, with the
 *   map's `DefaultMaterial`), where the room flew over its own each frame -- a door or a destructible changed during the
 *   flight is met as the page holds it at the seek.
 * Held against the room's own join to a watcher at the same ticks (a real `Room`, `test/replaySmoke.test.ts`): equal for
 * a throw decided between steps, within one frame for one decided inside a step. [reading]
 */
export const REPLAY_SMOKE_FLIGHT_READING = 'flown again from the throw, over the page hull' as const;

/**
 * RE-1: a charge's clock in the fold is the recording's ticks -- its age the ticks since its `grenade` event, a set-off
 * at the tick its event (or the snapshot that shows its trip) was recorded at, C4's fuse run out at `Timer1` x the tick
 * rate after its placement. The room steps its projectiles by game frames (`GameFrameAccumulator`, `GAME_FRAME_DT`
 * 525/15734 s) and sets a triggered charge off on its next one, so each is within about one game frame of the room's;
 * the recording holds no frame phase to do better. [reading]
 */
export const REPLAY_CHARGE_CLOCK_READING = 'recorded ticks' as const;

/**
 * RE-1: an armed PMN's trip -- no event the room broadcasts -- is read off the recorded snapshots: at each, any living
 * seated body (`BodyFlag.Alive`; a seat of the `players` records) whose feet lie within its `ProximityDistance`
 * (`proximityTripped`'s `d^2 < r^2`, `FUN_00543930` L410270-410310) once its `Timer1` has run sets it off. The room tests
 * every game frame against its movers' origins; the recording keeps every other tick, so a body that crosses the radius
 * between two snapshots is not seen. [reading]
 */
export const REPLAY_PMN_TRIP_READING = 'recorded snapshots' as const;

/**
 * RV-6 (research 276 §5): a corpse whose kill named no clip -- a blast's standing or crouched (`deaths.ts` `deathClip`
 * 'blast': the knock throws the body instead), or a fall's -- is posed by its own mover, which the recorded snapshots
 * carry (`../net/body` `bodyOf`: the action and its clock, protocol 6's knock codes): thrown in `Fall forward` / `Fall
 * backwards`, landed in `Land forward` / `Land backwards` and held on its last key, dead (`../mover` `Walker.land`,
 * `runClocks`; `FUN_005807d0`, `FUN_005805b0` D:L441994, research 218 s3). The welcome carries a corpse as one clip at
 * one age, the death's (`JoinCorpseWire`, `../joinState` CORPSE_HYDRATE_READING), so the seek tells the landing the
 * target's snapshot holds the body in, at the death's age; the page's `deathPose` holds it on its last key. Exact once
 * the room's landing is held (the mover's 0.331 s, `ACTION_SECONDS`) and the death's age is past `deathPose`'s
 * playback (0.4 s, `motion.rdr`): both on the last key. Before that the pose is ahead of the room's by the throw's time
 * in the air -- 0 to about 0.85 s (the knock's rise at most `KNOCK_SPEED_MAX` 100 u/s, gravity 235), about 0.42 s at
 * the `KNOCK_RISE` floor of a close blast (measured: kill tick 242, the landing's first snapshot 268 at 0.017 s) -- so a
 * seek inside the landing of a close lethal blast draws its last key. A body still in the air at the target is told no
 * clip, as before: its own action draws the fall, then its landing as play goes on (a clip told there would hold the
 * fall through the landing, `RemotePlayers.frame`). What would retire this: an additive pose age on `JoinCorpseWire`,
 * read by `hydrateCorpse` (the `age` is also the corpse rule's clock, `../net/deaths` `corpseShownS`, so it is kept the
 * death's; NU-4 (research 317): a player's corpse has no timed hide, it lies until its seat is alive -- was: "the `age`
 * also drives the fade, so it cannot carry it"). [reading]
 */
export const REPLAY_CORPSE_LANDING_READING = 'the landing held, at the death age' as const;

/** RV-6: the landing a recorded body holds (`REPLAY_CORPSE_LANDING_READING`), as its clip; null for any other play. */
function heldLanding(b: BodyState | undefined): string | null {
  const name = b && b.action ? ACTION_CODES[b.action - 1] : undefined;
  return name === 'landDeath' || name === 'landBackwards' ? SEAL_ANIMS[name] : null;
}

export function emptyFold(): FoldState {
  return {
    score: null, endsTick: null, roundSeconds: 0, roundLength: 0, round: null, phase: null, decided: null, classic: true, result: null, countdownEnds: null, bomb: null,
    turrets: new Map(), corpses: new Map(), kits: new Map(), chars: new Map(), characters: new Map(), bots: new Map(), drops: new Map(),
    dances: new Map(), charges: new Map(), smokes: new Map(), seats: new Set(), spawned: new Set(), known: new Set(), rostered: false, hostages: null,
    figure: PAGE_FIGURE_DEFAULT_S, launchEnds: null, told: null,
  };
}

/**
 * One stateful event at `tick` on the state (a transient one changes nothing). Each rule is the live page's handler's
 * effect on what it draws (`../netPage` `NetPage.event`, `../bombPage`, `../turretPage`, `../drops`), in ticks.
 */
export function foldEvent(s: FoldState, ev: ServerEvent, tick: number, tickHz: number, throwable: ThrowableLookup = bakedThrowable): void {
  if (ev.type === 'grenade' || ev.type === 'detonate') { foldCharge(s, ev, tick, throwable); return; }
  if (EVENT_CLASS[ev.type] !== 'stateful') return;
  switch (ev.type) {
    case 'score':
      s.score = ev;
      // the page's: a null leaves the clock; LATER 152: a held one stops at its figure (a defuse)
      if (ev.timeLeft !== null && ev.clockHeld) { s.endsTick = null; s.figure = ev.timeLeft; }
      else if (ev.timeLeft !== null) s.endsTick = tick + ev.timeLeft * tickHz;
      break;
    case 'roundStart':
      s.round = { round: ev.round, rounds: ev.rounds, startTick: tick };
      s.roundSeconds = ev.seconds;
      s.roundLength = ev.seconds;
      s.endsTick = tick + ev.seconds * tickHz;
      s.phase = 'play';
      s.decided = null;                                   // LATER 155
      s.result = null;
      s.countdownEnds = null;
      s.launchEnds = null;                                // RE-3: the page's `launchAt` cleared at the round's start
      s.drops.clear();                                    // the page's `newRound` -> `clearAir` (`../main` roundHooks)
      s.charges.clear();                                  // RE-1: the room's `clearAir` (ROUND_START_PROJECTILES_READING)
      s.smokes.clear();                                   // RV-7: and every throw in it (`Room.clearAir` empties `flying`)
      s.corpses.clear();                                  // RE-1: every seat's `diedAt` back to -1 (`Room.startRound`)
      for (const id of s.seats) s.known.add(id);
      break;
    case 'roundTime':
      if (s.endsTick !== null) s.endsTick += (ev.seconds - s.roundSeconds) * tickHz;
      s.roundSeconds = ev.seconds;
      break;
    case 'timeExpired': s.endsTick = tick; s.phase = 'expired'; break;
    case 'eliminated': case 'timedOut':
      s.phase = 'decided';
      s.decided ??= { winner: ev.winner, reason: ev.type === 'timedOut' ? 'timeout' : ev.reason ?? 'elimination' };   // LATER 155
      // A bomb's result decides the room's round too (`decided` 'bomb'): folded from its `bomb` event (LATER 158, below).
      break;
    case 'roundOver':
      s.figure = drawnFigure(s, tick, tickHz);            // RE-3: the figure the page's clock stops on
      s.endsTick = null;
      s.phase = 'over';
      s.result = { round: ev.round, winner: ev.winner, wins: ev.wins, matchOver: ev.matchOver, screens: ev.screens, ...(ev.stats ? { stats: ev.stats } : {}), at: tick };
      break;
    case 'abandoned':
      s.figure = drawnFigure(s, tick, tickHz); s.launchEnds = null;   // RE-3: the page's `abandoned` stops both clocks
      s.endsTick = null; s.phase = 'waiting'; s.decided = null; s.result = null; s.drops.clear();
      s.charges.clear();                                  // RE-1: the room's `clearAir` at its abandon
      s.smokes.clear();                                   // RV-7: the same clear
      s.corpses.clear();                                  // RE-1: `Room.abandon` sets every seat's `diedAt` back to -1
      for (const id of s.seats) s.known.add(id);
      break;
    case 'countdown':
      s.countdownEnds = ev.seconds === null ? null : tick + ev.seconds * tickHz;
      // RE-3: the page's `countdown` -- called off while one runs, the timer shows the round's length (the page's own
      // until a `roundStart` names one; `roundLength` is 0 here until then, LATER 152); told, it runs to its end.
      if (ev.seconds !== null) s.launchEnds = s.countdownEnds;
      else if (s.launchEnds !== null) { s.figure = s.roundLength > 0 ? s.roundLength : PAGE_FIGURE_DEFAULT_S; s.launchEnds = null; }
      break;
    case 'kill':
      s.known.add(ev.victim); s.corpses.set(ev.victim, { clip: ev.clip, ...(typeof ev.cause === 'number' ? { cause: ev.cause } : {}), tick });
      // RE-2: a hostage's death as the room keeps it (`ExtractionAuthority.killed`: `diedAt` the tick, `deathClip` the clip)
      if (ev.victimKind === 'hostage') {
        const h = s.hostages?.get(ev.victim);
        if (h) { h.wire.alive = false; h.diedAt = tick; h.deathClip = ev.clip; }
      }
      break;
    case 'botCharacter': s.characters.set(ev.id, ev.character); break;
    case 'spawn':
      s.corpses.delete(ev.id);
      s.spawned.add(ev.id);
      s.known.add(ev.id);
      if (ev.kit) s.kits.set(ev.id, ev.kit);
      if (ev.char !== undefined) s.chars.set(ev.id, ev.char);
      s.characters.set(ev.id, ev.character ?? null);
      s.bots.set(ev.id, ev.bot === true);
      break;
    case 'bomb': {
      const { type: _type, ...wire } = ev;
      s.bomb = wire;
      // LATER 158: a bomb's result decides the room's round in the same step, with no event of its own (`room.ts`'s play arm,
      // `decided.reason` 'bomb') -- state 5 (detonated) the planting side's, state 4 (defused) the other side's. In play only:
      // a round already decided keeps its first reason (a defuse in an elimination's or BREACH's time-out hold, LATER 145, 150).
      if (s.classic && s.phase === 'play' && (wire.state === 4 || wire.state === 5) && wire.plantingTeam) {
        s.phase = 'decided';
        s.decided ??= { winner: wire.state === 5 ? wire.plantingTeam : wire.plantingTeam === 'seal' ? 'terrorist' : 'seal', reason: 'bomb' };
      }
      break;
    }
    case 'turret': { const { type: _type, ...wire } = ev; s.turrets.set(wire.id, wire); break; }
    case 'drop': { const { type: _type, ...wire } = ev; s.drops.set(wire.did, wire); break; }
    case 'taken': s.drops.delete(ev.did); if (ev.kit) s.kits.set(ev.by, ev.kit); break;
    // RE-1: a dance from its start to its stop. Every end the room has -- its own end, a death, the round over, an action,
    // a hold, a pose, a flinch, a reload, a (re)spawn (a new round's and the abandon's), a leave -- goes through
    // `Room.stopVictory`, which broadcasts the stop (a `victory` with no clip): the stop is in the recording.
    case 'victory':
      s.dances.delete(ev.id);                             // a new start goes last, as the room's map re-adds it
      if (ev.clip) s.dances.set(ev.id, { serial: ev.serial, clip: ev.clip, tick });
      break;
    // RE-2: a hostage's state as the page's own handler keeps it (`../netPage` `hostageState`: the seven fields over the
    // welcome's); alive again (the round's reset, `ExtractionAuthority.reset` then `tellAll`) is no death (`diedAt` -1).
    case 'seatTold': s.told = ev; break;            // SVC-07c: the last whole game's pairs
    case 'hostageState': {
      const h = s.hostages?.get(ev.id);
      if (!h) break;
      h.wire = { ...h.wire, id: ev.id, alive: ev.alive, ai: ev.ai, leader: ev.leader, rescuer: ev.rescuer, opacity: ev.opacity, unit: ev.unit };
      if (ev.alive) { h.diedAt = null; h.deathClip = null; }
      break;
    }
    default: break;                                       // the roster's (the `players` records)
  }
}

/**
 * RE-1: a `grenade` or a `detonate` on the charges (never replayed: its arc, release and blast stay transient). A charge
 * set down (`Room.placeCharge`: the `grenade` broadcast with its `pid`, `velocity` its facing, normalised as the room
 * normalises it) joins the list; the owner's Detonator (`Room.detonate`: a `grenade` of kind `Detonator` from the owner's
 * feet) sets off each of his claymores at rest within `CLAYMORE_RULES.detonateRange`, as the room's loop does; a
 * `detonate` (`Room.chargeHit`) sets off the charge it names.
 */
function foldCharge(s: FoldState, ev: Extract<ServerEvent, { type: 'grenade' | 'detonate' }>, tick: number, throwable: ThrowableLookup): void {
  if (ev.type === 'detonate') {
    const c = s.charges.get(ev.pid);
    if (c && c.setOff === null) c.setOff = tick;
    return;
  }
  if (ev.kind === 'Detonator') {
    for (const c of s.charges.values()) {
      if (c.owner !== ev.id || c.record.id !== CLAYMORE.id || c.setOff !== null) continue;
      if (Math.hypot(c.pos[0] - ev.from[0], c.pos[1] - ev.from[1], c.pos[2] - ev.from[2]) <= CLAYMORE_RULES.detonateRange) c.setOff = tick;
    }
    return;
  }
  if (ev.pid === undefined) return;
  const record = throwable(ev.kind);
  if (!record) return;
  if (isSmoke(record)) {                                  // RV-7: a smoke thrown (`Room.throwGrenade`), flown at the join
    s.smokes.set(ev.pid, {
      pid: ev.pid, owner: ev.id, kind: ev.kind, record, from: [ev.from[0], ev.from[1], ev.from[2]],
      velocity: [ev.velocity[0], ev.velocity[1], ev.velocity[2]], tick,
    });
    return;
  }
  if (!isCharge(record)) return;
  const v = ev.velocity, l = Math.hypot(v[0], v[1], v[2]) || 1;
  s.charges.set(ev.pid, {
    pid: ev.pid, owner: ev.id, kind: ev.kind, record, pos: [ev.from[0], ev.from[1], ev.from[2]],
    facing: [v[0] / l, v[1] / l, v[2] / l], tick, setOff: null,
  });
}

/**
 * RE-1: the seats as a `players` record names them. A seat new to a later record is the room's new `Player` (not
 * spawned, no death: known); the segment's first record carries its seats over (a server's file opens on the last
 * match's roster, `RoomRecording`), so what those seats are is not known until a reset, a spawn or a kill shows it.
 */
function foldRoster(s: FoldState, players: readonly ReplayPlayer[]): void {
  const now = new Set(players.filter((p) => p.role === 'player' && p.team).map((p) => p.id));
  for (const p of players) { s.characters.set(p.id, p.character ?? null); s.bots.set(p.id, p.bot === true); }
  for (const id of s.characters.keys()) if (!now.has(id)) { s.characters.delete(id); s.bots.delete(id); }
  const seated = s.rostered;
  s.rostered = true;
  for (const id of now) {
    if (s.seats.has(id)) continue;
    s.spawned.delete(id); s.corpses.delete(id);
    if (seated) s.known.add(id); else s.known.delete(id);
  }
  for (const id of s.seats) if (!now.has(id)) { s.spawned.delete(id); s.known.delete(id); }
  s.seats = now;
}

/** RE-2: a `hostages` record: the roster as the room's welcome had it at `tick` (a dead one's `age` read back to its tick). */
function foldHostages(s: FoldState, hostages: readonly HostageWire[], tick: number): void {
  s.hostages = new Map(hostages.map(({ deathClip, age, ...wire }) => [wire.id, {
    wire: { ...wire, at: [wire.at[0], wire.at[1], wire.at[2]] },
    diedAt: !wire.alive && typeof age === 'number' ? tick - age : null,
    deathClip: !wire.alive && typeof age === 'number' ? deathClip ?? null : null,
  }]));
}

/**
 * RE-2: each hostage's place as a recorded snapshot holds its body (the room's `Hostage.at` and `yaw`,
 * `ExtractionAuthority.bodies`). A hidden one is left out of the snapshot and keeps the place of the last that held it:
 * the room moves a hostage only at a round's reset (`extraction.ts` `reset`, `h.at`/`h.yaw` to its start), which makes
 * it visible again, so that is the room's own place for it.
 */
function foldHostagePlaces(s: FoldState, bodies: readonly BodyState[]): void {
  for (const b of bodies) {
    const h = s.hostages!.get(b.id);
    if (h) { h.wire.at = [b.feet[0], b.feet[1], b.feet[2]]; h.wire.yaw = b.yaw; }
  }
}

/** RE-1: the armed PMNs a recorded snapshot's living seated bodies trip (`REPLAY_PMN_TRIP_READING`). */
function foldTrips(s: FoldState, bodies: readonly BodyState[], tick: number, tickHz: number): void {
  let origins: BodyState[] | null = null;
  for (const c of s.charges.values()) {
    const r = c.record.proximity ?? 0;
    if (!(r > 0) || c.setOff !== null || tick - c.tick < c.record.fuse * tickHz) continue;
    origins ??= bodies.filter((b) => (b.flags & BodyFlag.Alive) !== 0 && s.seats.has(b.id));
    if (origins.some((b) => (b.feet[0] - c.pos[0]) ** 2 + (b.feet[1] - c.pos[1]) ** 2 + (b.feet[2] - c.pos[2]) ** 2 < r * r)) c.setOff = tick;
  }
}

/**
 * The fold from the segment's start to `target`: one pass over the records at or before it, in the file's order (the
 * room's), stopping at the first past it. `visited` counts the records read (the header aside), `end` the index of the
 * first record past the target -- where play goes on from.
 */
export function foldTo(records: readonly ReplayRecord[], target: number, tickHz: number, throwable: ThrowableLookup = bakedThrowable): { state: FoldState; visited: number; end: number } {
  const state = emptyFold();
  const head = records[0];
  if (head?.kind === 'header') state.classic = head.header.rules === 'classic';   // LATER 158 (its review's F1)
  let k = 1, visited = 0;
  for (; k < records.length; k++) {
    const r = records[k]!;
    if (r.kind === 'header') continue;
    if (r.tick > target) break;
    visited++;
    if (r.kind === 'event') foldEvent(state, r.event, r.tick, tickHz, throwable);
    else if (r.kind === 'players') foldRoster(state, r.players);
    else if (r.kind === 'hostages') foldHostages(state, r.hostages, r.tick);
    else if (r.kind === 'snap') {
      if (state.charges.size) foldTrips(state, r.bodies, r.tick, tickHz);
      if (state.hostages) foldHostagePlaces(state, r.bodies);   // RE-2: only once a roster is read
    }
  }
  return { state, visited, end: k };
}

/**
 * Whether a record is a stateful event: the seek tells the fold only once one lies behind a playhead. RE-1: a charge's
 * placement is state too (a `grenade` whose kind is a charge), though the `grenade` kind stays transient. RV-7: with
 * `smokes` (the seek can fly them: a hull is handed), so is a smoke's throw.
 */
export function statefulRecord(r: ReplayRecord, throwable: ThrowableLookup = bakedThrowable, smokes = false): boolean {
  if (r.kind === 'hostages') return true;                // RE-2: the roster is state the welcome carries
  if (r.kind !== 'event') return false;
  if (EVENT_CLASS[r.event.type] === 'stateful') return true;
  if (r.event.type !== 'grenade' || r.event.pid === undefined) return false;
  const record = throwable(r.event.kind);
  return record !== null && (isCharge(record) || (smokes && isSmoke(record)));
}

/**
 * RE-3: the timer's figure the page draws at `tick` while a clock runs (`NetPage.frame`: the launch countdown's first, then
 * the round's), else the figure it last left.
 */
function drawnFigure(s: FoldState, tick: number, tickHz: number): number {
  if (s.launchEnds !== null) return Math.max(0, (s.launchEnds - tick) / tickHz);
  if (s.endsTick !== null) return Math.max(0, (s.endsTick - tick) / tickHz);
  return s.figure;
}

/**
 * RE-3 (research 249 §4): the figure a seek's welcome sets on the page's timer at `target`, or null when a clock runs
 * there -- the round's (the score's `timeLeft` starts it) or the launch countdown's (the welcome's `countdown`). In a
 * stopped period (a round's end, the waiting room, before round 1) the live page keeps the figure its clock stopped on
 * (`FoldState.figure`); a launch countdown run out (the room's load hold before round 1) leaves its 0.
 */
export function foldedFigure(s: FoldState, target: number): number | null {
  if (s.endsTick !== null) return null;
  if (s.launchEnds !== null) return s.launchEnds > target ? null : 0;
  return s.figure;
}

/** The welcome's fields the fold sets, beside the watcher's own (`ReplayClient`'s welcome). */
export type FoldedWelcome = Pick<Welcome, 'tick' | 'round' | 'rounds' | 'startTick' | 'phase' | 'decided' | 'objective' | 'turrets' | 'countdown' | 'join' | 'hostages'>;

/**
 * What the page is told at `target` from the fold: a joiner's welcome fields and the room's `score` after it (the room
 * sends a joiner its score at once, `room.ts` `scoreDirty`). `bodies`: the snapshot at or before the target -- a corpse is
 * laid only on a body it holds dead. The round's screens are the join envelope's result -- the round end's own at its age
 * (`RESULT_CLOCK_READING`), or, with none standing, a result with no screen left: the page's one silent path that takes
 * a screen down, and it stops the page's clock (`NetPage.joinSinks`). The round's clock is then the score's `timeLeft` at
 * the target, which starts it again while the round runs; null leaves it stopped. RE-1: the envelope's `projectiles`
 * (the charges, `foldedCharges`) and `ghosts`, and `victories` -- the dances under way, which the room sends a joiner
 * after its welcome and before its score (`room.ts` `hello`, :1404-1409). RE-2: the welcome's `hostages` (`foldedHostages`),
 * once a `hostages` record has been read; a hostage's death then rides it, not the envelope's corpses, as the room's
 * (`joinWire`'s corpses are its seats'). RV-7: with `hull` (the page's), the AN-M8s among the `projectiles`
 * (`foldedSmokes`), in the room's flying order (by pid: `Room.flyer` gives them in launch order); without, none.
 * SVC-07c: `told`, the last `seatTold`, which a game's joiner hears after its welcome (the bridge's join refresh); told
 * after the score.
 */
export function foldedJoin(s: FoldState, target: number, tickHz: number, bodies: readonly BodyState[], hull: HullCast | null = null): { welcome: FoldedWelcome; score: ScoreEvent; victories: VictoryEvent[]; told: SeatToldEvent | null } {
  const dead = new Map(bodies.filter((b) => !(b.flags & BodyFlag.Alive)).map((b) => [b.id, b]));
  const corpses: JoinCorpseWire[] = [];
  for (const [id, c] of s.corpses) {
    if (s.hostages?.has(id)) continue;                   // RE-2: the welcome's `hostages` lays it
    // RV-6: a kill with no clip: the landing its body holds at the target (REPLAY_CORPSE_LANDING_READING)
    if (dead.has(id)) corpses.push({ id, clip: c.clip ?? heldLanding(dead.get(id)), ...(c.cause !== undefined ? { cause: c.cause } : {}), age: target - c.tick });
  }
  // RE-1: the ghosts as `joinWire` names them -- a seat not alive with no death since the round's reset (`diedAt` < 0):
  // alive as the target's snapshot holds it, or, for a seat it does not hold yet, spawned since it was seated. Only a
  // seat whose death the segment would show (`known`); a dead one carried in with the file's roster is drawn as its
  // snapshot draws it -- not a ghost, and no corpse, whose death's tick lies in the file before.
  const held = new Set(bodies.map((b) => b.id));
  const ghosts = [...s.seats].filter((id) => s.known.has(id) && !s.corpses.has(id) && (held.has(id) ? dead.has(id) : !s.spawned.has(id)));
  const projectiles = foldedCharges(s, target, tickHz);
  if (hull && s.smokes.size) {                            // RV-7: the smokes, merged in the room's order (by pid)
    projectiles.push(...foldedSmokes(s, target, tickHz, hull));
    projectiles.sort((a, b) => a.pid - b.pid);
  }
  // RE-1: the dances under way, each as `hello` sends a joiner one after its welcome (`room.ts` :1404-1406): no `seq`.
  const victories: VictoryEvent[] = [...s.dances].map(([id, d]) => ({ type: 'victory', id, serial: d.serial, clip: d.clip, elapsed: (target - d.tick) / tickHz }));
  const running = s.endsTick !== null;
  const wins = s.score?.wins ?? s.result?.wins ?? { seal: 0, terrorist: 0 };
  const result: JoinResultWire = s.result ?? { round: s.round?.round ?? 0, winner: null, wins, matchOver: false, screens: [], at: target };
  const join: JoinWire = { v: JOIN_STATE_VERSION, result, projectiles, corpses, ghosts, drops: [...s.drops.values()] };
  const occupied = [...s.turrets.values()].filter((t) => t.occupant !== null);
  const countdown = s.countdownEnds !== null && s.countdownEnds > target ? (s.countdownEnds - target) / tickHz : null;
  const welcome: FoldedWelcome = {
    tick: target, round: s.round?.round ?? 1, rounds: s.round?.rounds ?? MAX_ROUNDS, join,
    ...(s.round ? { startTick: s.round.startTick } : {}),
    ...(s.phase ? { phase: s.phase } : {}),
    ...(s.phase === 'decided' && s.decided ? { decided: { ...s.decided } } : {}),   // LATER 155
    ...(s.bomb ? { objective: { ...s.bomb, pos: [...s.bomb.pos] as [number, number, number] } } : {}),
    ...(occupied.length ? { turrets: occupied.map((t) => ({ ...t })) } : {}),
    ...(countdown !== null ? { countdown } : {}),
  };
  const hostages = foldedHostages(s, target, bodies);
  if (hostages) welcome.hostages = hostages;
  const timeLeft = running ? Math.max(0, (s.endsTick! - target) / tickHz) : null;
  const score: ScoreEvent = s.score
    ? { ...s.score, timeLeft, rows: s.score.rows.map((row) => {
      // R12: a later roster/spawn may reuse this id. An older score must not restore the former CPU's marker.
      const bot = s.bots.get(row.id);
      if (bot === undefined || bot === (row.bot === true)) return row;
      const { bot: _oldBot, ...rest } = row;
      return bot ? { ...rest, bot: true as const } : rest;
    }) }
    : { type: 'score', rows: [], timeLeft, spectators: [], wins };
  return { welcome, score, victories, told: s.told };
}

/**
 * RE-2: the welcome's `hostages` at the target from the fold, as `ExtractionAuthority.wire()` gives them: each in the
 * roster's order, its place the target's snapshot's body (`bodies`: the snapshot at or before the target), else the
 * last snapshot's that held it (`foldHostagePlaces`), else its record's; its state the last told, and a dead one's clip and age in ticks since its death
 * (the room's `!alive && diedAt >= 0`). Null before any `hostages` record: no roster, as an older file.
 */
export function foldedHostages(s: FoldState, target: number, bodies: readonly BodyState[]): HostageWire[] | null {
  if (!s.hostages) return null;
  const held = new Map(bodies.map((b) => [b.id, b]));
  return [...s.hostages.values()].map((h) => {
    const b = held.get(h.wire.id);
    return {
      ...h.wire,
      at: b ? [b.feet[0], b.feet[1], b.feet[2]] : [h.wire.at[0], h.wire.at[1], h.wire.at[2]],
      yaw: b ? b.yaw : h.wire.yaw,
      ...(!h.wire.alive && h.diedAt !== null ? { deathClip: h.deathClip, age: target - h.diedAt } : {}),
    };
  });
}

/**
 * RE-1: the charges at the target in the envelope's shape (`match/src/joinState.ts` `joinWire`, its clock in ticks): each
 * as the room's `Grenade` stands then (`launchGrenade` at the point with no velocity, laid `rest`; `stepGrenade` counting
 * its age, fuse and removal down from the placement): `detonated` once set off or, for a charge that does not hold its
 * fuse (`holdsFuse`: C4), once its `Timer1` has run; left out once detonated with its `Timer2` run (`removed`, which the
 * envelope leaves out). The page lays nothing for a detonated charge (`GrenadeThrower.hydrateLive`); the room lists it,
 * so the fold does. `REPLAY_CHARGE_CLOCK_READING`.
 */
function foldedCharges(s: FoldState, target: number, tickHz: number): JoinProjectileWire[] {
  const out: JoinProjectileWire[] = [];
  for (const c of s.charges.values()) {
    const age = target - c.tick, fuse = c.record.fuse * tickHz - age, removal = c.record.removal * tickHz - age;
    const detonated = (c.setOff !== null && c.setOff <= target) || (!holdsFuse(c.record) && fuse <= 0);
    if (detonated && removal <= 0) continue;
    out.push({
      pid: c.pid, owner: c.owner, kind: c.kind, pos: [...c.pos], vel: [0, 0, 0], state: detonated ? 'detonated' : 'rest',
      age, fuse, removal, bounces: 0, dud: false, facing: [...c.facing],
    });
  }
  return out;
}

/**
 * RV-7 (research 276 §6): each AN-M8 thrown at or before the target, as the room's `joinWire` lists it there: flown from
 * its throw to the target (`REPLAY_SMOKE_FLIGHT_READING`) -- in flight, at rest, or detonated and pouring
 * (`SMOKE_PHASE_ON_WIRE_READING`: `-fuse` the time since it poured, `removal` the time left) -- with its place, velocity,
 * clock in ticks, bounces and dud; left out once removed (its `Timer2` run: `stepGrenade`), as the envelope leaves it.
 * The page lays it through its joiner's path (`GrenadeThrower.hydrateLive`: the canister and the stream, nothing heard).
 */
function foldedSmokes(s: FoldState, target: number, tickHz: number, hull: HullCast): JoinProjectileWire[] {
  const out: JoinProjectileWire[] = [];
  for (const sm of s.smokes.values()) {
    if (sm.tick > target) continue;
    const g = launchGrenade([...sm.from], [...sm.velocity], sm.record);
    const flight = new GameFrameAccumulator();
    const gone = (): boolean => g.state === 'removed';
    // The room's steps after the throw's tick; a throw decided inside its tick's step flew once more there (the reading).
    for (let t = sm.tick + 1; t <= target && !gone(); t++) {
      for (let k = flight.advance(1 / tickHz); k > 0 && !gone(); k--) stepGrenade(g, GAME_FRAME_DT, hull);
    }
    if (gone()) continue;
    out.push({
      pid: sm.pid, owner: sm.owner, kind: sm.kind, pos: [g.pos[0], g.pos[1], g.pos[2]], vel: [g.vel[0], g.vel[1], g.vel[2]],
      state: g.state as JoinProjectileWire['state'],
      age: g.age * tickHz, fuse: g.fuse * tickHz, removal: g.removal * tickHz, bounces: g.bounces, dud: g.dud,
    });
  }
  return out;
}
