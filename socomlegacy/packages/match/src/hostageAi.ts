/**
 * The hostage's AI on the room (HX-3, web sprint 31; research 238 s2; rulings HX.R2, HX.R4). Pure: no room, no wire,
 * no clock and no random of its own. The original's session master runs every hostage's `CSealCtrlAi` (research 191
 * s1); the port's room is the master, and HX-1's hostage step calls `HostageAi.step(GAME_FRAME_DT, world)` once a
 * game frame from its own accumulator (`AI_FRAME_READING`). HX-4a's orders call `follow(leader)` / `hold(issuer)` /
 * `releaseFollow()`, HX-5's rescue `rescue(rescuer)`; each runs the stack moves the original makes, no more.
 *
 * What it holds, by the original's pieces (every line re-read at `socom2_game.elf.decomp.c` r0001, `D:L<n>`):
 * - the AI stack (`ctrl+0x41c`): Push `FUN_005f5c00` -> `FUN_005f7ee0` (D:L506832-506867), Replace `FUN_005f5ba0` ->
 *   `FUN_005f7d80` (D:L506781-506827), UnwindTo `FUN_005f5c80` -> `FUN_005f7b10` (D:L506689-506728), Pop `FUN_005f7c40`
 *   (D:L506733-506776), ClearStack `FUN_005f5f20` (D:L505663-505679), the gate `FUN_005f5cd0` (D:L505594-505658), the
 *   masks `FUN_005f7470` (D:L506410-506591), the driver `FUN_005f8030` (D:L506872-506930), the signals
 *   `CAiState::Signal` `FUN_005f6fa0` (D:L506292-506388) -- research 199 s1, s12.2;
 * - `CAiSHostage` (0x17) entered by `FUN_00555900` (D:L420206-420275) and ticked by `FUN_00601910` (D:L511764-511910),
 *   with its timers `FUN_005f62c0` / `FUN_005f61e0` (D:L505794-505840) and its watch modulo `FUN_005f6270`
 *   (D:L505822-505828) -- research 189 s1, s2, s14.4;
 * - `CAiSFollow` (9) with the shared follower in `hostageFollow.ts` (research 334), `CAiSRescued` (0x11)
 *   with its online sub-state 2 and fade (`FUN_005594b0` D:L422293-422324, `FUN_00559070` D:L422191-422212), `CAiSHold`
 *   (2) as the replay's one-frame state (`HOLD_STATE_TICK_PLACEHOLDER`).
 *
 * The states' ids stay the original's numbers (0x17, 9, 0x11, 2: the factory `FUN_005f6550` D:L505850-506230), never
 * an enum of the port's.
 */

type V3 = [number, number, number];

/** The four states a hostage's stack holds online: CAiSHostage, CAiSFollow, CAiSRescued, CAiSHold (189 s14.3; 199 s1). */
export type HostageStateId = 0x17 | 9 | 0x11 | 2;

/** The escortee unit (`FUN_005ef2f0(0x11)`; the spawn joins it, D:L434915-434918; research 189 s1). */
export const ESCORTEE_UNIT = 0x11;

/**
 * The hostage's fireteam bits 17, 30 and 31 = 0xC0020000 (MP6 `vehicles.rdr`; the record parser D:L400381-400401;
 * research 189 s2, 190 s10.3). Bit 17 (0x20000) is the escortee bit `FUN_00555900` tests.
 */
export const HOSTAGE_TEAM_MASK = 0xc0020000;
/** The SEALs' player mask 0x40000001 (`FUN_002c32c0` D:L164779-164800; research 189 s2): shares bit 30 with a hostage. */
export const SEAL_TEAM_MASK = 0x40000001;
/** The Terrorists' player mask 0x80000100 (`FUN_002c32e0` D:L164779-164800; research 189 s2): shares bit 31. */
export const TERRORIST_TEAM_MASK = 0x80000100;
/** The escortee bit of a fireteam mask (`+200 & 0x20000`, `FUN_00555900` D:L420224, D:L420234). */
const ESCORTEE_BIT = 0x20000;

/** CHRSND RESTRAINED, asked at 1.0 by sub-state 3 (D:L511828); silent: no MP record defines it (research 199 s8). */
export const CUE_RESTRAINED = 0x4b;
/** CHRSND PANIC_CRY, asked when the watched body shares no team bit (D:L511882-511884; `HOSTAGE_CRIES_READING`). */
export const CUE_PANIC = 0x48;
/** CHRSND HELPME, asked at 0.15 with the state's flag bit 1 (D:L511887-511889; `HOSTAGE_CRIES_READING`). */
export const CUE_HELPME = 0x49;

/**
 * The allowed-next masks of the four states, as `FUN_005f7470`'s switch gives them (the stack's `+0x428` is their AND
 * over every state in the stack; its `+0x42c` the OR of `1 << id`, D:L506572-506573): 0x17 `0x190f4bc0` (D:L506552:
 * bits 6-9, 11, 14, 16-19, 24, 27, 28 -- 9 and 0x11 in, 1, 2 and 0x17 out), 9 `0x1ffffdfe` (D:L506510), 0x11
 * `0x190c48c6` (D:L506534: bits 1, 2, 6, 7, 11, 14, 18, 19, 24, 27, 28 -- V5's correction, research 199 s12.2: no 9,
 * no 0x11, no 0x17), 2 `0x3ffffffa` (D:L506489). The CanPushAiState slots (vtable +0x1c, read in disassembly by 189 s1
 * and 199 s1): CAiSHostage 0x601ec0 refuses 0x10 (PathRecover) and admits 0x13 (ShotAt) only in sub-states 5 and 6;
 * CAiSFollow, CAiSRescued and CAiSHold all `return 1` (0x555390). Reading (199 s1, s12.2; research 238 s2).
 */
export const AI_STACK_MASKS_READING: Readonly<Record<HostageStateId, number>> = {
  [0x17]: 0x190f4bc0, [9]: 0x1ffffdfe, [0x11]: 0x190c48c6, [2]: 0x3ffffffa,
};

/**
 * CAiSHostage's timers, seconds (the float operands of `FUN_00601910`'s `FUN_005f62c0` calls): sub-state 3 -> 2 after
 * `restrained` 2 (0x40000000, D:L511836), 2 -> 5 after `hold` 5 (0x40a00000, D:L511824), 1 -> 5 after `getDown` 10
 * (0x41200000, D:L511818), 6 -> 5 after `crouch` 10 (D:L511898), 3 -> 4 after `rest` 0.5 (0x3f000000, D:L511832) with
 * the prone asked after `proneDelay` 0.15 (0x3e19999a, D:L511831) when not in the escortee unit. Reading (189 s2,
 * s14.4).
 */
export const HOSTAGE_TIMERS_READING = { restrained: 2, hold: 5, getDown: 10, crouch: 10, rest: 0.5, proneDelay: 0.15 } as const;

/**
 * Sub-state 5's watch: the nearest living body within `range` 250 (`lui 0x437a` = 250.0, D:L511874, passed to
 * `FUN_00569c60` D:L430176-430218: the first living type-2 entry of the body's neighbour list, nothing when it lies at
 * or beyond the range) is looked at when its horizontal distance squared is at least `minDist2` 100 (`DAT_00650da0`,
 * `FUN_00601200` D:L511517); the watch runs while `(int)(t x 10) % (int)(period x 10) == 0` (`FUN_005f6270`
 * D:L505822-505828), t the stack's running time (`ctrl+0x434`, the driver's D:L506919) -- every frame of a `window`
 * of 0.1 s, about three at 30 Hz (189 s14.4 correction 4); `period` 5 (0x40a00000, D:L511867; 3 s with the state's
 * flag bit 1, never set online). The neighbour list's metric is the squared XYZ distance, as the port's 3D one (research
 * 238, sprint 40 AD-0, C41; was "unread"). Reading.
 */
export const HOSTAGE_WATCH_READING = { range: 250, period: 5, window: 0.1, minDist2: 100 } as const;

/**
 * The watch's look: the original's CURIOUS look `FUN_00601200` turns the head toward the body (priority 2, held 5 s by
 * `FUN_00601860(5.0)`, D:L511879-511880). The port's remote bodies have no head-look channel on the wire: the target
 * is recorded on the AI (`look`, `lookAt`) for tests and sprint 32's HX-4b, nothing is drawn. Placeholder until a head
 * channel exists (research 238 s2).
 */
export const HOSTAGE_WATCH_LOOK_PLACEHOLDER = 'unseen';

/**
 * PANIC and HELPME never play online (189 s14.4, V2 #16): PANIC needs a watched body sharing no team bit with
 * 0xC0020000, and both sides' masks share one; HELPME needs the state's flag bit 1, which the three callers of
 * `FUN_00555900` never pass (flags 0: D:L434913, 437711, 450478). The port runs the original's tests as written; this
 * names their online outcome. RESTRAINED, PANIC, HELPME, WAIT_UP and NO are silent on the disc (research 199 s8).
 * Reading.
 */
export const HOSTAGE_CRIES_READING = 'never online';

/**
 * The hostage reacts to no AI event online: `FUN_00572d70` (UpdateEventMask) zeroes every AI event mask in a match
 * (189 s2, #16): no gunfire, blast or death reaction, so no ShotAt (0x13) push. `onEvent` takes the room's events and
 * changes nothing. Reading.
 */
export const HOSTAGE_EVENTS_READING = 'mask 0';

/**
 * SetStance's default delay: a delay of -1 becomes `base` 0.25 + U(0, `spread` 0.95) s (`FUN_00563100` D:L427285-427300:
 * `rand x 4.656613e-10 x 0.95 + 0.25`), counted down by the post-tick `FUN_0056f970` (D:L432948-432953: the frame dt
 * subtracted while the requested stance differs, applied once below 0). U is the room's seeded random, injected.
 * Reading (189 s2).
 */
export const STANCE_DELAY_READING = { base: 0.25, spread: 0.95 } as const;

/**
 * The AI steps once a game frame (`GAME_FRAME_DT`, `@s2u/scene` `gameFrame.ts`): the AI driver `FUN_005f8030` takes the
 * frame dt (`DAT_0044d620`, D:L506884) from the main loop's one tick a swap (research 180 s0, 208). The caller (HX-1's
 * hostage step) accumulates; the 60 Hz room tick never steps it. Reading.
 */
export const AI_FRAME_READING = 'game frame';

/**
 * The rescued fade: `CAiSRescued::Tick` sub-state 2 moves the body node's opacity (`node+0x9c`) toward 0 by dt x 0.75,
 * clamped to [0, 1] (D:L422198-422203, 0x64fd88 = 0.0, 0x64fd90 = 1.0), and calls the node's SetActive(opacity != 0)
 * (D:L422207; vt+0x38, V5 H4-2): hidden at 0, after at most 1 / 0.75 = 1.33 s; the opacity is the node's, so a
 * re-entered 0x11 continues it. Reading (199 s2, s12.3).
 */
export const HOSTAGE_FADE_READING = { rate: 0.75 } as const;

/**
 * `Hostage_start` "Cower": `FUN_002a7d40` (D:L149744-149746) calls every object's slot +0x4c at each level start and
 * online round restart (`FUN_00223680` D:L75920-75935) -> `FUN_00553e60` -> ctrl slot +0x5c -> `FUN_00562ad0`
 * composes "Hostage_start"; `FUN_00561f00` starts the anim instance before pushing script state 1, which 0x17's mask
 * refuses (research 199 s12.8, V5: H4-7 WRONG). Not built: its visible effect beyond the state machine's crouch is
 * owed to capture C2 (research 238 s7). Reading (note in code).
 */
export const COWER_START_READING = 'not built';

/**
 * `CAiSRescued::OnSignal(0)` online sets sub-state 2 at once (`FUN_005594b0` D:L422309-422313), skipping case 0's
 * rejoin of the escortee unit (D:L422179-422184), frees the compass anchor (`FUN_00543480`, D:L422308) and sets body
 * `+0x105c` bit 3 (D:L422314): the hostage stays in its leader's unit -- the double-credit path HX-4a and HX-5 need
 * (research 199 s1). Reading.
 */
export const RESCUED_SIGNAL_READING = 'sub 2 at once';

/**
 * `CAiSHold` (2, vt 0x669d30): its Tick is unread. In the hostage's life it lives one frame (199 s1's replay: HOLD on a
 * lone 0x11 replaces it by 2; the next post-tick replaces 2 by 0x11), so the port's 2 does nothing. Placeholder.
 */
export const HOLD_STATE_TICK_PLACEHOLDER = 'idle';

/** `CAiState::Signal`'s kinds (`FUN_005f6fa0` D:L506292-506388): 0 activate, 1 end, 2 suspend, 3 resume. */
export type AiSignal = 0 | 1 | 2 | 3;

/** One state on the stack: the fields of `CAiState` the hostage's states use. */
export interface AiState {
  readonly id: HostageStateId;
  /** `+0x34`: the sub-state. */
  sub: number;
  /** `+0x38`: seconds in the sub-state (the driver adds dt, D:L506920; zeroed on a sub-state change). */
  time: number;
  /** `+0x40`: the running timer's seconds left. */
  timer: number;
  /** `+0x3c`: the sub-state the timer leads to. */
  next: number;
  /** `+0x2c` bit 30 (0x40000000): a timer runs; while it does, the Tick does nothing else (`FUN_005f61e0`). */
  timing: boolean;
  /** `+0x2c`'s low bits: 0 the restrain bit, 1 the watch's 3 s / HELPME bit -- never set online. */
  flags: number;
  /** `+0x4a` bit 1: alive on the stack; the driver pops a top whose bit is clear (D:L506891-506926). */
  live: boolean;
  /** `+0x5c` of 0x17 (the issuer `FUN_00601e50` records) and of 0x11 (the rescuer); -1 when none (OnSignal(4)). */
  owner: number;
  /** State 9's leader as HX-4a's `follow` gives it (the follow state's `+0x5d4` role); null otherwise. */
  leader: number | null;
}

/** What `AiStack` asks of the body it belongs to. */
export interface AiStackHooks {
  /** The body's alive bit (`+0xe1` bit 4): the gate refuses every push for a dead body (D:L505611). */
  alive(): boolean;
  /** The top state's CanPushAiState (vtable +0x1c), called last by the gate (D:L505650-505654). */
  canPush(top: AiState, id: number): boolean;
  /** `CAiState::Signal`'s per-state part (`OnSignal`, vtable +8), after the base's own (signal 0's reset). */
  signal(state: AiState, signal: AiSignal): void;
}

function bit(id: number): number {
  return (1 << (id & 31)) >>> 0;
}

/**
 * The AI stack (`ctrl+0x41c`), top first. The moves are the original's, each recomputing the masks as `FUN_005f7470`
 * does after it. The gate's `+0x265` test (a controller flag no hostage path sets) and its `+0x430` bit 2 branch (set
 * only with state 1 on the stack, never a hostage's) are not modelled; the empty stack's top is the static default
 * state `DAT_0066b990` (D:L505613), whose id and CanPush are unread -- the port's empty stack admits any push (the
 * original's spawn enters 0x17 through it).
 */
export class AiStack {
  private readonly states: AiState[] = [];
  /**
   * The stack's running time (`ctrl+0x434`, the stack's `+0x18`): the driver adds dt after a top's Tick (D:L506919);
   * every activation (signal 0, a push or a replace) zeroes it (D:L506356). The watch's window reads it.
   */
  time = 0;

  constructor(private readonly hooks: AiStackHooks) {}

  /** The top state, or null on an empty stack. */
  get top(): AiState | null {
    return this.states[this.states.length - 1] ?? null;
  }

  /** The states' ids, top first (the order of the original's list). */
  get ids(): HostageStateId[] {
    return this.states.map((s) => s.id).reverse();
  }

  /** `+0x428`: the AND of the allowed-next masks of every state on the stack (0xffffffff when empty, D:L506429). */
  get allowedMask(): number {
    let m = 0xffffffff;
    for (const s of this.states) m = (m & AI_STACK_MASKS_READING[s.id]) >>> 0;
    return m >>> 0;
  }

  /** `+0x42c`: the OR of `1 << id` over the stack (D:L506573). */
  get presentMask(): number {
    let m = 0;
    for (const s of this.states) m = (m | bit(s.id)) >>> 0;
    return m;
  }

  /** Whether `id` is somewhere on the stack (`+0x42c & (1 << id)`). */
  has(id: number): boolean {
    return (this.presentMask & bit(id)) !== 0;
  }

  /**
   * The can-push gate `FUN_005f5cd0` (D:L505594-505658): 0x12 always (D:L505606); else the body alive (D:L505611);
   * the id in the allowed-next mask unless `flags` bit 1 (2) skips it (D:L505621-505624); not equal to the top unless
   * `flags` bit 0 (1) skips that (D:L505625-505626); then the top's CanPushAiState (D:L505650-505654).
   */
  canPush(id: number, flags = 0): boolean {
    if (id === 0x12) return true;
    if (!this.hooks.alive()) return false;
    let ok = (flags & 2) !== 0 || (this.allowedMask & bit(id)) !== 0;
    const top = this.top;
    if (ok && (flags & 1) === 0 && top) ok = top.id !== id;
    if (!ok) return false;
    return top ? this.hooks.canPush(top, id) : true;
  }

  /** Push (`FUN_005f5c00` -> `FUN_005f7ee0` D:L506832-506867): the gate, then the top suspended (signal 2), the new one activated. */
  push(id: HostageStateId): boolean {
    if (!this.canPush(id)) return false;
    const top = this.top;
    if (top) this.hooks.signal(top, 2);
    this.add(id);
    return true;
  }

  /** Replace (`FUN_005f5ba0` -> `FUN_005f7d80` D:L506781-506827): the gate, then the top ended (signal 1) and removed, the new one activated. */
  replace(id: HostageStateId): boolean {
    if (!this.canPush(id)) return false;
    const top = this.top;
    if (top) {
      this.hooks.signal(top, 1);
      this.states.pop();
    }
    this.add(id);
    return true;
  }

  /** UnwindTo (`FUN_005f5c80` -> `FUN_005f7b10` D:L506689-506728): pops until the top is `id`, only when `id` is on the stack; whether the top is `id`. */
  unwindTo(id: number): boolean {
    if (this.has(id)) while (this.top && this.top.id !== id) this.pop();
    return this.top?.id === id;
  }

  /** Pop (`FUN_005f7c40` D:L506733-506776): signal 1 to the top, removed, signal 3 (resume) to the next; the new top's id. */
  pop(): HostageStateId | null {
    const top = this.top;
    if (!top) return null;
    this.hooks.signal(top, 1);
    this.states.pop();
    const next = this.top;
    if (next) this.hooks.signal(next, 3);
    return next?.id ?? null;
  }

  /**
   * ClearStack (`FUN_005f5f20` D:L505663-505679): the whole stack popped only on `force` or a dead body (the
   * controller's `+0x264` bit 1 and the body's 0x40000 are no hostage's); else the masks recomputed, nothing popped.
   * Whether it cleared.
   */
  clear(force: boolean): boolean {
    if (!force && this.hooks.alive()) return false;
    while (this.top) this.pop();
    return true;
  }

  /** The state `id` on the stack, or null (`FUN_005f5fc0`'s walk, D:L505686-505699). */
  find(id: HostageStateId): AiState | null {
    return this.states.find((s) => s.id === id) ?? null;
  }

  /**
   * A new state activated (`CAiState::Signal(0)`, D:L506330-506357): its fields zeroed, `live` set, the stack's time
   * zeroed (D:L506356), then the state's OnSignal.
   */
  private add(id: HostageStateId): void {
    const s: AiState = { id, sub: 0, time: 0, timer: 0, next: 0, timing: false, flags: 0, live: true, owner: -1, leader: null };
    this.states.push(s);
    this.time = 0;
    this.hooks.signal(s, 0);
  }
}

/** A body the watch may look at: its id, feet, alive bit and fireteam mask (`+200`). */
export interface HostageWorldBody {
  id: number; feet: V3; alive: boolean; team: number;
  /** The room supplies these from the leader's mover; watch-only fixtures need none. */
  yaw?: number; velocity?: V3; topSpeed?: number; stance?: 0 | 1 | 2;
}

/** What a frame of the AI sees: the hostage's own feet and every other body in the round (players and hostages). */
export interface HostageWorld { feet: V3; bodies: readonly HostageWorldBody[] }

/** A hostage's AI: the room's seeded `random` (never `Math.random`), and `signal` a listener on every stack signal. */
export interface HostageAiOptions {
  /** The hostage's body id (HX-1's `HOSTAGE_ID_BASE` + n): the watch skips it among the bodies. */
  id: number;
  /** U[0, 1): the room's seeded random (`opts.random`), drawn for SetStance's default delay. */
  random: () => number;
  /** Called after each signal the stack sends (HX-4a hooks Follow's end, signal 1, for the leader's count). */
  signal?: (state: AiState, signal: AiSignal) => void;
  /** Shared navigation/physical mover at the original game frame; absent only without map data. */
  follow?: (dt: number, leader: number) => { sub: number; goal: V3 | null; stance: 0 | 1 | 2 } | null;
}

/**
 * One hostage's AI (`CSealCtrlAi` with an escortee body). Spawned online in 0x17 sub-state 3 in the escortee unit, its
 * compass anchor made (`FUN_00573130` D:L434903-434920). Fields HX-1 reads to draw it: `stance` (0 stand, 1 crouch, 2
 * prone; the snapshot's), `opacity` / `hidden` (the fade), `state` / `sub`; HX-4a writes `unit` (the escortee unit or
 * the leader's) and HX-1 `alive`.
 */
export class HostageAi {
  readonly id: number;
  readonly stack: AiStack;
  /** The body's alive bit (`+0xe1` bit 4); HX-1 clears it on the hostage's death. A dead hostage's AI is not stepped. */
  alive = true;
  /** The unit the body is in (`ctrl+0x10c`): the escortee unit at spawn; HX-4a's FOLLOW and HOLD move it. */
  unit = ESCORTEE_UNIT;
  /** The stance the body holds (`+0x278`): 0 stand, 1 crouch, 2 prone. */
  stance: 0 | 1 | 2 = 0;
  /** The stance asked (`+0x279`), applied when `stanceDelay` runs out. */
  requestedStance: 0 | 1 | 2 = 0;
  /** The asked stance's delay left (`+0x280`), seconds. */
  stanceDelay = 0;
  /** The watched body's id (the CURIOUS look's target), or null before any (`HOSTAGE_WATCH_LOOK_PLACEHOLDER`). */
  look: number | null = null;
  /** The watched body's feet when it was looked at (the look's point, `+0x28..0x30`). */
  lookAt: V3 | null = null;
  /** Frames on which the watch's search ran (the 0.1 s window's frames). */
  watchRuns = 0;
  /** The cues the Tick asked for, in order (`ctrl` vtable +0x24); silent on the disc but YES (research 199 s8). */
  readonly cues: number[] = [];
  /** The body node's opacity (`node+0x9c`), 1 until a rescue's fade. */
  opacity = 1;
  /** The node's active bit cleared at opacity 0 (`SetActive`): no pick, no hit, not drawn. */
  hidden = false;
  /** The hostage's compass anchor (type 4, `FUN_005434b0(body, 4, 0)` D:L434920), freed on rescue (D:L422308). */
  anchored = true;
  /** Body `+0x105c` bit 3, set by the rescue online (D:L422314). */
  rescued = false;
  /** Follow's current goal, research 334; null when navigation is inactive or no map data exists. */
  goal: V3 | null = null;

  private readonly random: () => number;
  private readonly listener: ((state: AiState, signal: AiSignal) => void) | undefined;
  private readonly moveFollow: HostageAiOptions['follow'];

  constructor(opts: HostageAiOptions) {
    this.id = opts.id;
    this.random = opts.random;
    this.listener = opts.signal;
    this.moveFollow = opts.follow;
    this.stack = new AiStack({
      alive: () => this.alive,
      canPush: (top, id) => stateCanPush(top, id),
      signal: (state, signal) => this.onSignal(state, signal),
    });
    this.enterHostage(3);                                        // FUN_00573130 D:L434913: FUN_00555900(ctrl, 3, 0)
  }

  /** The top state's id, or null on an empty stack. */
  get state(): HostageStateId | null {
    return this.stack.top?.id ?? null;
  }

  /** The top state's sub-state (0x17's 0-6, 0x11's 2 online), or null. */
  get sub(): number | null {
    return this.stack.top?.sub ?? null;
  }

  /** The top state's running timer, seconds left, or null when none runs. */
  get timer(): number | null {
    const top = this.stack.top;
    return top && top.timing ? top.timer : null;
  }

  /** 0x17's recorded issuer (`+0x5c`, `FUN_00601e50`), or 0x11's rescuer; -1 when none. */
  get owner(): number {
    return this.stack.top?.owner ?? -1;
  }

  /**
   * Enter CAiSHostage at `sub` (`FUN_00555900` D:L420206-420275): eligible -- sub 3: online and an escortee (the
   * offline restrain bit aside; D:L420221-420230); others: an escortee and 0x17 on the stack or admitted by the gate
   * (D:L420232-420238). 0x17 on the stack is unwound to (D:L420253); else the stack unwound to 6 or 1, or cleared
   * (D:L420241-420250), and 0x17 pushed (D:L420262). The
   * sub-state set (its time zeroed when it changes), the timer stopped, `next` = `sub`. Whether 0x17 is the top.
   */
  enterHostage(sub: number): boolean {
    const escortee = (HOSTAGE_TEAM_MASK & ESCORTEE_BIT) !== 0;
    const ok = sub === 3 ? escortee && this.stack.canPush(0x17) : escortee && (this.stack.has(0x17) || this.stack.canPush(0x17));
    if (!ok) return false;
    if (this.stack.has(0x17)) this.stack.unwindTo(0x17);
    else if (this.stack.has(6)) this.stack.unwindTo(6);
    else if (!this.stack.unwindTo(1)) this.stack.clear(true);
    if (this.stack.top?.id !== 0x17 && !this.stack.push(0x17)) return false;
    const st = this.stack.top!;
    if (st.sub !== sub) { st.time = 0; st.sub = sub; }
    st.timing = false;
    st.timer = 0;
    st.next = sub;
    return true;
  }

  /**
   * FOLLOW's stack moves (OnCommand `FUN_0058fbe0` case 4, D:L450351-450410): ClearStack(0) (D:L450385), then 9 kept
   * when on top or pushed (D:L450393), `leader` recorded on it. HX-4a adds the gates, the unit join, the YES, the radio
   * and the leader bookkeeping (`FUN_005fd010`, D:L450398) around it. Whether 9 is the top.
   */
  follow(leader: number): boolean {
    this.stack.clear(false);
    if (this.stack.top?.id !== 9 && !this.stack.push(9)) return false;
    this.stack.top!.leader = leader;
    return true;
  }

  /**
   * HOLD's stack moves (OnCommand case 5, D:L450465-450540): ClearStack(0) (D:L450473); `FUN_00555900(ctrl, 2)`
   * (D:L450478) and the issuer recorded on 0x17 (`FUN_00601e50`, D:L450521); failing that, UnwindTo(6), failing that
   * Replace by CAiSHold (D:L450480-450482: 199 s1's replay on a lone 0x11). HX-4a adds the YES and the unit. The new
   * top's id, or null when every move was refused.
   */
  hold(issuer: number): HostageStateId | null {
    this.stack.clear(false);
    if (this.enterHostage(2)) {
      this.stack.top!.owner = issuer;
      return 0x17;
    }
    if (this.stack.unwindTo(6)) return this.state;
    return this.stack.replace(2) ? 2 : null;
  }

  /**
   * The leader's release (`ControlHostageAction(ai, 0)`, `FUN_005fcf10` D:L509476-509527, from the leader's death
   * `FUN_00547af0` D:L413031-413046 or departure): the follow state's `+0x4a` bit 1 cleared; the driver pops 9 on the
   * next frame and 0x17 resumes (research 199 s5). HX-4a's bookkeeping (counts, `lastLeader`) is its own.
   */
  releaseFollow(): void {
    const follow = this.stack.find(9);
    if (follow) follow.live = false;
  }

  /**
   * The rescue's stack move (the escortee post-tick `FUN_0056f970` D:L432975: `FUN_005f5ba0(ctrl, 0x11)` -- the gate,
   * so refused while 0x11 is on top), the rescuer recorded (`+0x5c`). HX-5 runs the zone test and the credit. Whether
   * 0x11 was entered.
   */
  rescue(rescuer: number): boolean {
    if (!this.stack.replace(0x11)) return false;
    this.stack.top!.owner = rescuer;
    return true;
  }

  /** A room event near the hostage (a shot, a blast, a death): the event masks are 0 online, nothing changes. */
  onEvent(_kind: 'shot' | 'blast' | 'death', _at: V3): boolean {
    return false;                                                // HOSTAGE_EVENTS_READING
  }

  /**
   * One game frame (the driver `FUN_005f8030` D:L506872-506930, then the post-tick's stance countdown `FUN_0056f970`
   * D:L432948-432953): a top whose `live` bit is clear is popped and nothing ticks; else the top's Tick runs and the
   * stack's time and the state's time take dt after it. A dead hostage is not stepped.
   */
  step(dt: number, world: HostageWorld): void {
    if (!this.alive) return;
    const top = this.stack.top;
    if (top) {
      if (!top.live) this.stack.pop();
      else {
        this.tick(top, dt, world);
        this.stack.time += dt;
        top.time += dt;
      }
    }
    if (this.stance !== this.requestedStance) {
      this.stanceDelay -= dt;
      if (this.stanceDelay < 0) this.stance = this.requestedStance;
    }
  }

  /** SetStance (`FUN_00563100` D:L427285-427300): a new stance asked with `delay`, -1 the default (`STANCE_DELAY_READING`). */
  private setStance(delay: number, stance: 0 | 1 | 2): void {
    if (stance === this.requestedStance) return;
    this.stanceDelay = delay === -1 ? STANCE_DELAY_READING.base + this.random() * STANCE_DELAY_READING.spread : delay;
    this.requestedStance = stance;
  }

  /** SetStance now (`FUN_005631a0`): asked and applied with no delay. */
  private setStanceNow(stance: 0 | 1 | 2): void {
    this.requestedStance = stance;
    this.stanceDelay = 0;
    this.stance = stance;
  }

  private tick(st: AiState, dt: number, world: HostageWorld): void {
    if (st.id === 0x17) this.tickHostage(st, dt, world);
    else if (st.id === 9) {
      const motion = st.leader === null ? null : this.moveFollow?.(dt, st.leader);
      this.goal = motion?.goal ?? null;
      if (motion) { st.sub = motion.sub; this.setStance(-1, motion.stance); }
      else this.setStance(-1, 0);
    }
    else if (st.id === 0x11) this.tickRescued(st, dt);
    // 2: HOLD_STATE_TICK_PLACEHOLDER
  }

  /** `FUN_005f62c0(delay, state, next)` (D:L505832-505851): 0 sets `next` now; else the timer runs. */
  private setTimer(st: AiState, delay: number, next: number): void {
    if (delay === 0) {
      if (next !== st.sub) { st.time = 0; st.sub = next; }
      st.timing = false;
    } else {
      st.timing = true;
      st.timer = delay;
      st.next = next;
    }
  }

  /** `CAiSHostage::Tick` (`FUN_00601910` D:L511764-511910) online: the restrain bit (flag 0) is never set online. */
  private tickHostage(st: AiState, dt: number, world: HostageWorld): void {
    if (st.timing) {                                             // FUN_005f61e0 D:L505794-505818
      st.timer -= dt;
      if (st.timer > 0) return;
      st.timer = 0;
      if (st.next !== st.sub) { st.time = 0; st.sub = st.next; }
      st.timing = false;
    }
    const T = HOSTAGE_TIMERS_READING;
    switch (st.sub) {
      case 0:
        this.setTimer(st, 0, 2);
        break;
      case 1:                                                     // ClearRoute, AllStop(1), prone; 10 s -> 5
        this.setStance(-1, 2);
        this.setTimer(st, T.getDown, 5);
        break;
      case 2:                                                     // AI mode IDLE; crouch; 5 s -> 5
        this.setStance(-1, 1);
        this.setTimer(st, T.hold, 5);
        break;
      case 3:                                                     // RESTRAINED at 1.0; in unit 0x11 stand now, 2 s -> 2
        this.cues.push(CUE_RESTRAINED);
        if (this.unit === ESCORTEE_UNIT) {
          this.setStanceNow(0);
          this.setTimer(st, T.restrained, 2);
        } else {
          this.setStance(T.proneDelay, 2);
          this.setTimer(st, T.rest, 4);
        }
        break;
      case 5:
        this.watch(st, world);
        break;
      case 6:
        this.setStance(-1, 1);
        this.setTimer(st, T.crouch, 5);
        break;
      default:                                                    // 4: rest, no case
        break;
    }
  }

  /** Sub-state 5 (D:L511865-511894): in the window, the nearest living body within 250 looked at; the cries by team. */
  private watch(st: AiState, world: HostageWorld): void {
    const W = HOSTAGE_WATCH_READING;
    const period = (st.flags & 2) !== 0 ? 3 : W.period;
    if (Math.trunc(this.stack.time * 10) % Math.trunc(period * 10) !== 0) return;   // FUN_005f6270
    this.watchRuns++;
    const [x, y, z] = world.feet;
    let near: HostageWorldBody | null = null;
    let best = W.range * W.range;
    for (const b of world.bodies) {
      if (b.id === this.id || !b.alive) continue;
      const d2 = (b.feet[0] - x) ** 2 + (b.feet[1] - y) ** 2 + (b.feet[2] - z) ** 2;
      if (d2 < best) { best = d2; near = b; }
    }
    if (!near) return;
    const h2 = (near.feet[0] - x) ** 2 + (near.feet[2] - z) ** 2;
    if (h2 >= W.minDist2) {                                      // FUN_00601200: DAT_00650da0 <= dx^2 + dz^2
      this.look = near.id;
      this.lookAt = [near.feet[0], near.feet[1], near.feet[2]];
    }
    if (((near.team & HOSTAGE_TEAM_MASK) >>> 0) === 0) this.cues.push(CUE_PANIC);
    else {
      if ((st.flags & 2) !== 0) this.cues.push(CUE_HELPME);
      st.flags &= ~2;
    }
  }

  /** `CAiSRescued::Tick` sub-state 2 online (D:L422191-422212): the fade; offline's self-pop (D:L422208-422211) never runs. */
  private tickRescued(st: AiState, dt: number): void {
    if (st.sub !== 2) return;                                    // online the state is entered at 2 and stays
    if (this.opacity !== 0) this.opacity = Math.min(1, Math.max(0, this.opacity - dt * HOSTAGE_FADE_READING.rate));
    this.hidden = this.opacity === 0;
  }

  /** The stack's signals: the base's activation reset (signal 0) is `AiStack`'s; the per-state OnSignal here. */
  private onSignal(state: AiState, signal: AiSignal): void {
    if (state.id === 9 && (signal === 1 || signal === 2)) this.goal = null;
    if (signal === 0) {
      // CAiState::Signal(0) (D:L506330-506357): OnSignal(4) first (D:L506353), then OnSignal(0) (D:L506385).
      // OnSignal(4): 0x17's (0x601f20) owner -1; 0x11's zeroes +0x58/+0x5c/+0x60 (D:L422317-422321): the port's -1.
      state.owner = -1;
      if (state.id === 0x11) {                                   // FUN_005594b0 D:L422307-422315, online
        this.anchored = false;
        if (state.sub !== 2) { state.time = 0; state.sub = 2; }
        this.rescued = true;
      }
    }
    this.listener?.(state, signal);
  }
}

/**
 * The CanPushAiState slot of the top state (vtable +0x1c): CAiSHostage 0x601ec0 refuses 0x10 and admits 0x13 only in
 * sub-states 5 and 6 (research 189 s1, 199 s1, disassembly); CAiSFollow, CAiSRescued and CAiSHold `return 1`
 * (0x555390). Part of `AI_STACK_MASKS_READING`.
 */
export function stateCanPush(top: AiState, id: number): boolean {
  if (top.id !== 0x17) return true;
  if (id === 0x10) return false;
  if (id === 0x13) return top.sub === 5 || top.sub === 6;
  return true;
}
