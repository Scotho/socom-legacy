import { Room, roomLookGateMode, type Conn, type RoomOptions } from '../../../match/src/room';
import type { LookGateMode } from './lookGate';
import type { AiMaps, EscorteeStart, GameType, SpawnSlot, TurretPlacement } from '@s2u/scene';
import { actionRoots, groundGrid, type GroundData } from '../mover';
import type { MotionClip } from '@s2u/scene';
import type { MotionEntry } from '../motionTable';
import type { DoorSpec } from '../doors';
import type { GateSpec } from '../gates';
import type { CraneSpec } from '../cranes';
import type { MapMeta } from '../mapMeta';
import { stemOf, type SimClips, type SimMap } from '../simMap';
import { forkGround, type WorldState } from '../worldState';
import type { SimKits } from '../loadout';
import { offeredRules, RESPAWN_RULES_ENABLED, TICK_HZ, type ClientEvent } from './protocol';
import type { WebSocketLike } from './client';

/**
 * The page's single-player match (owner, 2026-09-29: "let's make offline tick rounds etc too"). Offline, reCOM mode
 * runs the match server's own `Room` (`@s2u/match` `room.ts`: no socket, no Node in it) inside the page, behind a
 * socket that never leaves it (`LoopbackMatch.socket`), and joins it with the same `NetClient` and `NetPage` a match
 * uses: the round's clock and banner, the round and match screens, the game's damage -- a grenade's blast on the
 * player included -- deaths, respawns and scores come from one implementation, online and off (every `DAT_0045a0c1`
 * rule on its network branch: `SOLO_IS_NETWORK_READING`). The room runs
 * `solo` (`RoomOptions.solo`: the player is the host's SEAL, no idle kick, classic's round runs alone to its clock).
 *
 * The room is stepped at the game's 60 Hz. With no C4 live, a wake runs at most five ticks, the dedicated server's
 * per-wake cap (`../../../match/src/server` `loop`); unlike the server (which drops the rest, `next = now`), the
 * deadline advances only by the ticks run, so the next wake comes at once and a kept gap is replayed over several
 * back-to-back wakes, never in one long one (#346's narrow review). While a C4 is live, one wake replays a kept gap
 * whole, up to one second (`LOOPBACK_CATCHUP_TICKS_ADAPTATION`). A stall longer than a second is dropped, not
 * replayed. While the page is drawing, the timer's wake holds a C4
 * `detonate` and the world follow for the next `drain`, so the gate and the flash are one rendered frame. Every
 * other frame of that wake is published before the wake returns, and a reply sent while a `detonate` is still held
 * joins that queue, so nothing overtakes it. A hidden tab, or a page whose frame loop has stopped, publishes as it
 * steps. Any other frame crosses on a microtask, or with a `drain` that runs first in the same task -- every frame in
 * the order the room sent it, as a socket's would.
 */

/**
 * How many room ticks one wake of the in-page clock owes, and the `next` deadline after them.
 * A gap of real time runs `elapsed × 60` ticks (none dropped) up to `cap`. A wake more than
 * `LOOPBACK_STALL_MS_ADAPTATION` behind (a hidden tab) drops that gap: `next` becomes `now`, and no ticks run for it.
 * `cap` is five ticks when no C4 is live (`LOOPBACK_WAKE_TICKS`) and sixty while one is (`LOOPBACK_CATCHUP_TICKS_ADAPTATION`).
 */
export const LOOPBACK_WAKE_TICKS = 5;
/**
 * Browser adaptation (research 209 §17.1, §18): while a C4 is live, one wake replays a kept gap in full. The stall
 * bound is one second and the room is 60 Hz, so the cap is 60. A synthetic room's sixty steps measured
 * 0.43–0.73 ms on this host (research 209 §18); a shipped map was not measured.
 */
export const LOOPBACK_CATCHUP_TICKS_ADAPTATION = 60;
/** Browser adaptation (research 209 §17.1): a wake further behind than this drops the gap, and a frame loop quiet this long is no longer drawing. */
export const LOOPBACK_STALL_MS_ADAPTATION = 1000;
export function loopbackDue(next: number, now: number, period = 1000 / TICK_HZ, cap = LOOPBACK_CATCHUP_TICKS_ADAPTATION): { steps: number; next: number } {
  if (!(period > 0) || !(now > next)) return { steps: 0, next };
  if (now - next > LOOPBACK_STALL_MS_ADAPTATION) return { steps: 0, next: now };
  // Count in periods, not by adding `period` until `now`. The sum drifts (150 ms is nine periods, and twenty of
  // those wakes owed 181 ticks). A deadline that lands on `now` is `now`.
  const steps = Math.min(cap, Math.floor((now - next) / period + 1e-9));
  const at = next + steps * period;
  return { steps, next: Math.abs(at - now) < 1e-6 ? now : at };
}

/**
 * SOLO_IS_NETWORK_READING: the page's single-player match runs the game's **network** branch of every rule gated on
 * `DAT_0045a0c1` (the online flag, research 91 section 1) -- the death camera's modes 3/6, not the offline mode 2
 * (`FUN_002980d0` 141363-141375; `../deathCamera` `newDeathCamera`); no wounded groans (`FUN_005a33b0` L460231, single
 * player only); SELECT holds the scoreboard (research 87 section 9, L56760). The game's flag-clear path is the
 * campaign, which has no one-player MP round (`SOLO_ROUND_PLACEHOLDER`), so the match's rules come from its network
 * branch. Listed in research 91 section 20.1.
 */
export const SOLO_IS_NETWORK_READING = true;

/** What of a loaded map the room needs (`../loadMap` `LoadedMap`). */
export interface LoadedForMatch {
  victory?: import('../victoryData').VictoryData;
  path: string;
  name: string;
  ground?: GroundData;
  slots: SpawnSlot[];
  respawns?: SpawnSlot[];
  doors?: DoorSpec[];
  /** MAP-07: the map's lever gates (`../gates`), read-only specs; the room forks the hull they slide. */
  gates?: GateSpec[];
  /** Chain Reaction's hooks (`SimMap.cranes`, `LoadedMap.cranes`). The room shares the page's specs and forks the hull. */
  cranes?: CraneSpec[];
  /** MAP-01: the map's typed metadata (`../mapMeta`), read-only: the room shares the page's. */
  meta?: MapMeta;
  /** PF-12: the map's game type (`SimMap.gameType`), when the page has read it; absent: SUPPRESSION's rules. */
  gameType?: GameType;
  /** MAP-10a: the map's placed turrets (`SimMap.turrets`, `LoadedMap.turrets`), read only: the room shares the page's. */
  turrets?: TurretPlacement[];
  /** XR-05: DEMOLITION's StartBomb (`SimMap.bombStart`, `LoadedMap.bombStart`): the offline room gets the bomb too (PF-40). */
  bombStart?: [number, number, number];
  /**
   * W0 (HX-0b's review): the parsed AI maps (`SimMap.ai`, `LoadedMap.ai`) -- EXTRACTION's zone and the named points --
   * and the map's escortees at their starts (`SimMap.escortees`, `LoadedMap.escortees`): the offline room gets the
   * hostages too. Read only: the room shares the page's, as a server room's fork shares the server's.
   */
  ai?: AiMaps;
  escortees?: EscorteeStart[];
  /**
   * PAR-53: the world root's `DefaultMaterial` (`LoadedMap.grenade`, `../grenadeAssets`): the room's cast reads byte 0
   * as the server's (`SimMap.defaultMaterial`, the same `parseWorldRoot` read of `MP*.ZED`; `FUN_002dc1d0`).
   */
  grenade?: { defaultMaterial: string };
}

/**
 * The room's map from the page's: the hull copied (`forkGround`) -- the room's doors turn its polygons and the room's
 * world its owners' active bits (MAP-02) as the server's do, and the page's own hull follows them, as online -- its
 * grid, the slots and their respawn twins. The metadata is shared, read only: the room builds its own world from it.
 */
export function simMapOfLoaded(map: LoadedForMatch): SimMap {
  if (!map.ground) throw new Error('no hull: the map has no ground to play on');
  const ground: GroundData = forkGround(map.ground);
  // The grid is built off the copy, so the room's movers read the copy the room's doors turn and its world switches.
  return {
    victory: map.victory,
    stem: stemOf(map.path), name: map.name, ground, grid: groundGrid(ground), spawns: null,
    slots: map.slots, respawns: map.respawns ?? [], doors: map.doors ?? [], gates: map.gates ?? [], cranes: map.cranes ?? [], notes: [], ...(map.meta ? { meta: map.meta } : {}),
    ...(map.gameType !== undefined ? { gameType: map.gameType } : {}),
    ...(map.turrets ? { turrets: map.turrets } : {}),
    ...(map.bombStart ? { bombStart: map.bombStart } : {}),
    ...(map.ai ? { ai: map.ai } : {}),
    ...(map.escortees ? { escortees: map.escortees } : {}),
    ...(map.grenade ? { defaultMaterial: map.grenade.defaultMaterial } : {}),
  };
}

/**
 * The room's clips from the page's (`../play` `PlayClips`, the worker's): the same clips and `motion.rdr` table the
 * server loads (`loadSimClips`), so the room's movers run the page's action root motion. Null without them.
 */
export function simClipsOfPlay(play: { clips: MotionClip[]; table: [string, MotionEntry][] | null } | null): SimClips | null {
  if (!play || !play.clips.length) return null;
  return { clips: play.clips, table: play.table ? new Map(play.table) : null, roots: actionRoots(play.clips) };
}

export interface LoopbackOptions extends Partial<RoomOptions> {
  /** Run the room's clock (the page); false: the caller steps it (`step`, the tests). */
  auto?: boolean;
  /**
   * RB-2 (the replay batch; OT.R114, RB.R4, RB.R6 -- a BROWSER ADAPTATION, no original): the room's look gate,
   * `RoomOptions.lookRate` passed through -- 'free' opens the movers' gates (`./lookGate` `LookGateMode`: no clamp, no
   * bank) in this, the page's own offline room, the one room that may (match `room.ts` `roomLookGateMode` asks for
   * `solo`, which this room always is); absent, the law, as every room. Who passes 'free' (the test room's and the Forge's
   * offline Play under `kbmAllowed`) is RB-9's; the page's prediction follows whatever this room runs
   * (`offlineRoomLookRate`, read by `../walk` `WalkMode`).
   */
  lookRate?: RoomOptions['lookRate'];
  /**
   * Whether the respawn rules may be played (`./protocol` `RESPAWN_RULES_ENABLED`, off by the owner's ruling of
   * 2026-09-29): off, the match is classic whatever `rules` asks. The respawn room's tests turn it on.
   */
  respawnRules?: boolean;
  /**
   * The kit tables (web sprint 4): the page's own `ZWEAPON.ZAR` read and the map's kits (`LoadedMap.arsenal`), so the
   * room's players carry their types' kits as the server's do; absent, the baked pair.
   */
  kits?: SimKits | null;
  /**
   * Each side's hit body (2026-09-30; `../teamBody` `hitBodiesOfPage`): the page's SEAL and Terrorist skeletons and
   * idles, so the room hits each player on its side's capsules as the server does; absent, the placeholder capsules.
   */
  bodies?: ConstructorParameters<typeof Room>[3];
  /**
   * MAP-02: the page's world (`../worldState`, on the page's own hull, drawn by `WorldView.setNodeActive`), made to
   * follow the room's at every change (`WorldState.apply` of the room's `states()`) -- the loopback's stand-in for
   * MAP-03's wire. A function is read at each change, as `NetPage`'s `world` is (2026-10-19): `main.ts` starts the
   * offline room before `show` has built the page's world under `?devmode&noarmory`, so a world read once at
   * construction was null there and the room's kills reached nothing on the page; a getter that returns null until
   * the page's world exists is caught up at the room's next step. Absent: the room's world is followed by nothing.
   */
  world?: WorldState | null | (() => WorldState | null);
  /**
   * P7 (the online-parity sweep's class G, a browser/network adaptation with no original: LOOPBACK_DELAY_ADAPTATION): a
   * one-way delay in milliseconds laid on every frame each way -- the page's to the room after `delayMs`, the room's to
   * the page after `delayMs` (then through the queue below as any frame) -- so a round trip is `2 * delayMs`, as a
   * server's would be, and a presentation the page leaves to the room shows a round trip late in a test. Every frame
   * waits the same, on the timer, so each direction keeps its send order. Absent or 0: none (the loopback as it was).
   */
  delayMs?: number;
}

/**
 * LOOPBACK_DELAY_ADAPTATION (P7; the online-parity sweep's class G guard): `LoopbackOptions.delayMs` -- the test room's
 * own latency, no original: the original's consoles ran a door, a switch and a lever on the pressing console (research
 * 92 section 1), which the port's page predicts against a room a round trip away; this makes that round trip in the
 * loopback (the tests', and a latency-injected run's). `NetClient`'s `simulate` injects the same per client.
 */
export const LOOPBACK_DELAY_ADAPTATION = 'delayMs' as const;

/** The id the page's player takes in its own room. */
const SOLO_ID = 1;

/**
 * PT-03 (web sprint 33; research 240 §5): the playtest instrument's seam -- PLAYTEST_INSTRUMENT_ADAPTATION, no original.
 * The page builds its `LoopbackMatch` in `main.ts`, which the playtest lane never edits (PT.R5), so `../playtestSession`
 * registers its replay recorder here (`{ recorder }`) and every `LoopbackMatch` built after merges these defaults under
 * its caller's options (the caller's keys win); `{}` clears them. A function is called at each construction (the
 * playtest checks its segment then). Nothing registers any outside a playtest.
 */
type Defaults = Partial<LoopbackOptions> | (() => Partial<LoopbackOptions>);
let defaults: Defaults = {};
export function setLoopbackDefaults(opts: Defaults): void { defaults = typeof opts === 'function' ? opts : { ...opts }; }

/**
 * RB-9 (the replay batch, KBM-3; OT.R114, RB.R4, RB.R6 -- a BROWSER ADAPTATION with no original, reviewed as the
 * simulation track because the room's shot cone follows the gated look, match `room.ts` `Room` step's `aim` on the gate's
 * `looked`): the look gate mode of the page's own offline room -- the newest live `LoopbackMatch`, which records the mode
 * its room's movers run (`roomLookGateMode`: 'free' only for its solo room that asked) at its construction and withdraws
 * it at its `stop`. The page's prediction (`../walk` `WalkMode`, its gate step on each tick's command) takes the same
 * mode, so the page and the room hold the same look; with no live offline room, the law, as every server room's. Only a
 * `LoopbackMatch` writes it (module state, a source pin in `lookGate.test.ts`): never the network client, the mover sim,
 * the match server or central. A mode, never a rate: the pad's look law (`../look` `LookLaw.frame`, 128.1 deg/s at the
 * full push) is the camera's, untouched.
 */
let offlineRoom: { owner: LoopbackMatch; mode: LookGateMode } | null = null;

/** RB-9: the look gate mode of the page's live offline room (the newest `LoopbackMatch` not stopped); none, the law. */
export function offlineRoomLookRate(): LookGateMode {
  return offlineRoom?.mode ?? 'law';
}

export class LoopbackMatch {
  readonly room: Room;
  /** Whether the room has the clips (a match made before the worker sent them is made again when they come). */
  readonly clips: boolean;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** MAP-02: unhooks the page's world from the room's (`LoopbackOptions.world`). */
  private unfollow: (() => void) | null = null;
  /** The in-page clock's next deadline (`loopbackDue`). Shared by the timer and the page's frame. */
  private next = performance.now();
  /** While `catchUp` is stepping the room, its frames are queued instead of crossing on a microtask. */
  private catching = false;
  /** The page has called `drain`: a visible timer wake may hold a C4 `detonate` for the next one (research 209 §18). */
  private framing = false;
  /** `performance.now()` of the last `drain`. A quiet page longer than the stall bound is no longer drawing. */
  private framedAt = 0;
  /** This catch-up is the timer's, and the page will drain: the world follow waits with the frames. */
  private holding = false;
  /** The room's world changed during a held wake. `drain` applies it with that wake's frames. */
  private worldHeld = false;
  /** A held wake's `detonate` waits in `queued` for the next `drain`; a frame sent meanwhile waits behind it. */
  private heldWake = false;
  /** A microtask will deliver `queued` (a frame sent outside a catch-up, with no `detonate` held). */
  private flushScheduled = false;
  private pageWorld: WorldState | null = null;
  /** The page world last told; null until one exists. A held wake updates it in `publishHeld`. */
  private followedWorld: WorldState | null = null;
  /** Frames waiting for `drain`. `hold` is a `detonate`: it, and anything queued behind it, stay until then. */
  private readonly queued: { deliver: () => void; hold: boolean }[] = [];
  /** MAP-02: tells a page world that appeared, or changed, since the room's last change (`step`). */
  private syncPageWorld: (() => void) | null = null;

  constructor(map: SimMap, clips: SimClips | null, opts: LoopbackOptions = {}) {
    const { auto = true, respawnRules = RESPAWN_RULES_ENABLED, kits = null, bodies = null, world = null, delayMs = 0, ...room } = { ...(typeof defaults === 'function' ? defaults() : defaults), ...opts };
    this.clips = clips !== null;
    this.delayMs = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    this.room = new Room(map, clips, { now: () => performance.now(), ...room, rules: offeredRules(room.rules, respawnRules), solo: true }, bodies, kits);
    // RB-9: the page's prediction follows the gate this room's movers run (`offlineRoomLookRate`); the newest room's.
    offlineRoom = { owner: this, mode: roomLookGateMode({ solo: true, lookRate: room.lookRate }) };
    if (world) {
      const resolve = typeof world === 'function' ? world : (): WorldState | null => world;
      const follow = (): void => {
        const page = resolve();
        if (!page) return;
        this.pageWorld = page;
        // A held timer wake keeps the gate with the queued `detonate` until `drain` (research 209 §18).
        if (this.holding) { this.worldHeld = true; return; }
        this.followedWorld = page;
        page.apply(this.room.world.states(), false);
      };
      this.unfollow = this.room.world.on({ changed: follow });
      follow();
      // A page world built after the room (the getter null at construction): caught up at the next step.
      this.syncPageWorld = (): void => { if (this.followedWorld !== resolve()) follow(); };
    }
    if (auto) this.loop();
  }

  /** P7 (`LoopbackOptions.delayMs`): the one-way delay each frame waits, ms; 0 none. */
  private readonly delayMs: number;

  /** `LoopbackOptions.delayMs`: `run` after the one-way delay (on the timer, so in send order), or now with none. */
  private readonly lag = (run: () => void): void => {
    if (this.delayMs <= 0) { run(); return; }
    setTimeout(() => { if (!this.stopped) run(); }, this.delayMs);
  };

  /** `NetOptions.socket`: a socket onto this room. */
  readonly socket = (_url: string): WebSocketLike => new LoopbackSocket(this.room, SOLO_ID, (deliver, frame) => this.lag(() => this.queueFrame(deliver, frame)), this.lag);

  /**
   * FG-21 (the forge's NPCs, a browser adaptation): a socket onto this room for seat `id` -- a seat beside the page's
   * player (`socket`'s SOLO_ID), on the side the room's `soloSide` names. Nothing of the game's own rooms calls it.
   */
  socketAs(id: number): (url: string) => WebSocketLike {
    return () => new LoopbackSocket(this.room, id, (deliver, frame) => this.lag(() => this.queueFrame(deliver, frame)), this.lag);
  }

  /** One 60 Hz step of the room (the tests; the page's clock calls it). */
  step(): void {
    this.room.step();
    this.syncPageWorld?.();
  }

  /**
   * The page's frame, before its grenades (`main.ts`). The room's due ticks run, and the frames held from the timer's
   * wake — a placed C4's `detonate`, and the world follow — are applied before this returns (research 209 §18).
   */
  drain(now = performance.now()): void {
    if (this.stopped) return;
    this.framing = true;
    this.framedAt = now;
    this.catchUp(now, false);
  }

  /**
   * The in-page clock's wake (`loop`). After `drain`, a visible page holds a C4 `detonate` for the next `drain`.
   * A hidden tab, a page that has stopped drawing, and a room nobody drains (the forge), publishes as it steps.
   */
  timerWake(now = performance.now()): void {
    if (this.stopped) return;
    const hidden = typeof document !== 'undefined' && document.hidden === true;
    if (this.framing && (hidden || now - this.framedAt > LOOPBACK_STALL_MS_ADAPTATION)) this.framing = false;
    this.catchUp(now, this.framing && !hidden);
  }

  /**
   * A frame the room sends, always in send order (#346's reviews): every frame joins `queued`. During a catch-up, or
   * while a held `detonate` waits for `drain` (`heldWake`), it waits there -- a direct reply (`placed`, an armory
   * answer, a `pong`) never overtakes the blast; otherwise a microtask delivers the queue, unless a `drain` in the
   * same task delivers it first -- a reply the page asked for before its frame's `drain` never trails that drain's ticks.
   */
  private queueFrame(deliver: () => void, frame?: string): void {
    this.queued.push({ deliver, hold: isDetonateFrame(frame) });
    if (this.catching || this.heldWake || this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      if (!this.catching && !this.heldWake) this.publishHeld();
    });
  }

  /** The world follow and every frame still queued. */
  private publishHeld(): void {
    this.heldWake = false;
    if (this.worldHeld && this.pageWorld) {
      this.pageWorld.apply(this.room.world.states(), false);
      this.followedWorld = this.pageWorld;
      this.worldHeld = false;
    }
    const queued = this.queued.splice(0);
    for (const item of queued) item.deliver();
  }

  /**
   * A held wake publishes what sits ahead of a `detonate` before it returns. The `detonate`, anything queued
   * behind it, and the world follow stay for `drain`, so the gate and the flash are one frame and nothing
   * overtakes the blast. With no `detonate`, the whole wake is published now.
   */
  private releaseBeforeDetonate(): void {
    const from = this.queued.findIndex((q) => q.hold);
    if (from < 0) {
      this.publishHeld();
      return;
    }
    this.heldWake = true;
    const early = this.queued.splice(0, from);
    for (const item of early) item.deliver();
  }

  /** How many room ticks one wake owes (`loopbackDue`). `hold`: keep a C4 `detonate` for `drain`. */
  private catchUp(now: number, hold: boolean): void {
    const cap = this.room.c4Pending() ? LOOPBACK_CATCHUP_TICKS_ADAPTATION : LOOPBACK_WAKE_TICKS;
    const due = loopbackDue(this.next, now, 1000 / TICK_HZ, cap);
    this.holding = hold;
    this.catching = true;
    try {
      for (let i = 0; i < due.steps; i++) this.step();
    } finally {
      this.catching = false;
      this.holding = false;
    }
    this.next = due.next;
    if (hold) this.releaseBeforeDetonate();
    else this.publishHeld();
  }

  stop(): void {
    this.stopped = true;
    if (offlineRoom?.owner === this) offlineRoom = null;       // RB-9: an older room stopped later leaves the newer one's
    this.unfollow?.();
    this.unfollow = null;
    this.syncPageWorld = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** The server's clock (`MatchServer.loop`), in the page. A slow frame is caught up (`loopbackDue`). */
  private loop(): void {
    const run = (): void => {
      if (this.stopped) return;
      this.timerWake();
      this.timer = setTimeout(run, Math.max(0, this.next - performance.now()));
    };
    this.timer = setTimeout(run, 0);
  }
}

/** A `detonate` frame (C4's blast, or a chain). Held for the drawing frame; every other frame is not. */
function isDetonateFrame(frame: string | undefined): boolean {
  if (!frame || !frame.includes('"detonate"')) return false;
  try { return (JSON.parse(frame) as { type?: string }).type === 'detonate'; }
  catch { return false; }
}

/** The page's end: what `NetClient` sends goes into the room; what the room sends comes back on a microtask, or behind a held `detonate`, or with the frame that drains one. */
class LoopbackSocket implements WebSocketLike {
  binaryType = 'arraybuffer';
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  private joined = false;

  constructor(
    private readonly room: Room, private readonly id: number, private readonly enqueue: (deliver: () => void, frame?: string) => void,
    /** P7 (`LoopbackOptions.delayMs`): the up-link's delay; with none, `run` at once. */
    private readonly up: (run: () => void) => void = (run) => run(),
  ) {
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(data: string | Uint8Array): void {
    if (this.readyState !== 1) return;
    this.up(() => { if (this.readyState === 1) this.deliver(data); });
  }

  /** A frame from the page reaching the room (`send`, after the up-link's delay). */
  private deliver(data: string | Uint8Array): void {
    if (typeof data !== 'string') { this.room.binary(this.id, data); return; }
    const ev = JSON.parse(data) as ClientEvent;
    if (ev.type === 'hello') {
      if (this.joined) return;
      this.joined = true;
      const conn: Conn = {
        send: (frame) => this.enqueue(() => { if (this.readyState === 1) this.onmessage?.({ data: frame }); }, typeof frame === 'string' ? frame : undefined),
        close: (code, reason) => this.close(code, reason),
      };
      this.room.hello(this.id, conn, ev);
      return;
    }
    this.room.text(this.id, ev);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.room.leave(this.id);
    queueMicrotask(() => this.onclose?.({ code, reason }));
  }
}
