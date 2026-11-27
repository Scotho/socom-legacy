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
 *   (2) as the replay's one-frame state (`HOLD_STATE_TICK_READING`, LATER 1187).
 *
 * The states' ids stay the original's numbers (0x17, 9, 0x11, 2: the factory `FUN_005f6550` D:L505850-506230), never
 * an enum of the port's.
 */

import { HOSTAGE_FLEE_END_PLACEHOLDER, HOSTAGE_FLEE_POSTURE_READING } from './hostageDanger';

type V3 = [number, number, number];

/**
 * The states a hostage's stack holds online: CAiSHostage, CAiSFollow, CAiSRescued, CAiSHold (189 s14.3; 199 s1), and LATER
 * 1170's 0x1b CAiSGrenade, the flight from a frag or C4 its danger scan pushes (research 445 s3-s5), and LATER
 * 1185's 0x13 CAiSShotAt, the shot reaction its hit counter pushes (research 447 s2.2).
 */
export type HostageStateId = 0x17 | 9 | 0x11 | 2 | 0x1b | 0x13 | 0x1c;

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
  // LATER 1170 (research 445 s4): 0x1b `FUN_005f7470` case 0x1b (D:L506563-506564) -- no 9, no 2 while it runs.
  [0x1b]: 0x310468c2,
  // LATER 1185 (research 447 s2.2): 0x13 CAiSShotAt, `FUN_005f7470` case 0x13 (D:L506540-506541).
  [0x13]: 0x31040800,
  // LATER 1188 (research 447 s12): 0x1c, the cower, `FUN_005f7470` case 0x1c (D:L506566-506567).
  [0x1c]: 0x21042000,
};

/**
 * LATER 1188 (research 447 s12; reading, pending review): the cower test `FUN_00571b10` (D:L434002-434172; machine code
 * 0x571c14-0x571d8c) for a flashbang (cause 0): within `near` (ELF 0x650008), or within `behind` (0x650010) with the blast
 * behind the body; `duration` the `+4` `FUN_005a5250` gives a Mark141 (max(old, 2.0)); `delay` 0x1c's OnSignal(0)
 * wait, U(0, `delay`) s (`FUN_00605f90`).
 */
export const HOSTAGE_COWER_READING = { near: 70, behind: 100, duration: 2.0, delay: 0.75 } as const;

/**
 * LATER 1188 (research 447 s9.3, s12; reading, pending review): the cower clips by stance (`FUN_00571b10`
 * D:L434093-434111): standing or crouched a coin between two (U <= 0.5 the first: which run-time global holds which clip
 * is unread -- the rig saw anim 167 and 168 standing), prone one (`Prone cover`, 447 s9.3). Their `motion.rdr` playback
 * and `MOTION_P.ZAR` keys (the viewer's `test/golden/motion-rdr.json`, the scene's `test/golden/character-motion.json`;
 * `guard_prone_cover` as the viewer's `ACTION_CLIPS.proneCover`); a clip runs `playback x ((n - 1) / n)^2` seconds
 * (`FUN_0028c4f0`, the viewer's `oneShotSeconds`): 4.94 / 4.56 standing, 4.92 / 4.53 crouched, 3.78 prone.
 */
export const HOSTAGE_COWER_CLIPS_READING = {
  stand: ['guard_flashbang_cower', 'guard_flashbang_cower2'],
  crouch: ['guard_crouch_flashbang_cower', 'guard_crouch_flashbang_cower2'],
  prone: 'guard_prone_cover',
  keys: {
    guard_flashbang_cower: { playback: 5.2, frames: 40 }, guard_flashbang_cower2: { playback: 4.8, frames: 40 },
    guard_crouch_flashbang_cower: { playback: 5.1, frames: 55 }, guard_crouch_flashbang_cower2: { playback: 4.7, frames: 55 },
    guard_prone_cover: { playback: 4.3, frames: 16 },
  },
} as const;
export type CowerClip = keyof (typeof HOSTAGE_COWER_CLIPS_READING)['keys'];
/** A cower clip's run (`FUN_0028c4f0`: `playback x ((n - 1) / n)^2`). */
export function cowerSeconds(clip: CowerClip): number {
  const k = HOSTAGE_COWER_CLIPS_READING.keys[clip], a = (k.frames - 1) / k.frames;
  return k.playback * a * a;
}

/**
 * LATER 1188 (the review's F7): the cower test's point is the head node (actor `+0x308`, `FUN_005a3070`
 * D:L460103-460150), whose height over the feet is unread. The room stands in the SEAL body's head eye height by stance
 * (the viewer's `cameraRig.ts` `scopeEyeHeight`: 15.884 standing, 9.904 crouched; the hostage's body is the SEAL's actor).
 * Nearby, not the same point: the rig read the controller's eye (`ctrl+0x90`) 17.46 over a standing hostage's feet.
 * Settled by a rig read of `FUN_005a3070`'s point for a standing and a crouched hostage.
 * The facing (SHOTS-1208 r117, research 445 s5.10; reading, pending review): `FUN_005a3070` (D:L460103-460148) returns
 * the head LOOK direction -- the body CLook's current direction (`+0x11a0`, body space, stored by its tick `FUN_005ad920`
 * at D:L465562 and by `FUN_005ad9d0` at D:L465599) carried through the rotation of `+0x28`, the BODY's scene node, not a head
 * node -- so the body's facing composed with the head look's turn now. The room models no hostage head-look rotator (the
 * watch records only its target, `HOSTAGE_WATCH_LOOK_PLACEHOLDER`), so `ExtractionAuthority.flashCower` still passes the
 * bare body facing, which equals the original's only while the head looks straight ahead: a departure NOT folded, under
 * this placeholder until the rotator is built (its rest direction is unread). Held at r0004 by the key job (0x5a8be0).
 */
export const HOSTAGE_COWER_HEAD_PLACEHOLDER = 'feet + scopeEyeHeight(posture)' as const;

/**
 * LATER 1188 (the review's F3): the cower's sound -- slot 0x48 of the actor's sound table (`FUN_0053b8f0(FUN_00599810(actor),
 * 0x48)`, D:L434113-434114) into `+100` (D:L434163), played once on a 0.15 + U(0, 0.25) s timer (D:L513820-513851); whether
 * it fires rests on `+0x70`'s start, unread. Not built.
 */
export const HOSTAGE_COWER_CUE_PLACEHOLDER = 'not built' as const;

/**
 * The cower test (`FUN_00571b10` D:L434055-434058, D:L434092): `head` the point, `facing` the world head look
 * (`FUN_005a3070`; the room passes the body's, `HOSTAGE_COWER_HEAD_PLACEHOLDER`), `point` the burst's.
 */
export function cowerTest(head: V3, facing: V3, point: readonly number[]): boolean {
  const off: V3 = [head[0] - point[0]!, head[1] - point[1]!, head[2] - point[2]!];
  const d = Math.hypot(off[0], off[1], off[2]), f = off[0] * facing[0] + off[1] * facing[1] + off[2] * facing[2];
  return d < HOSTAGE_COWER_READING.near || (d < HOSTAGE_COWER_READING.behind && f > 0);
}

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
 * The hostage reacts to no AI **event** online: `FUN_00572d70` (UpdateEventMask) zeroes every AI event mask in a match
 * (189 s2, #16): no gunfire, blast or death reaction through it, so no ShotAt (0x13) push. `onEvent` takes the room's
 * events and changes nothing. Reading. (LATER 1170, research 445: the danger scan runs outside the mask -- a frag or C4
 * the hostage notices pushes 0x1b; `HostageAi.flee`.)
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
 * LATER 1187 (research 447 s2.2; reading, pending review; was the HOLD tick's placeholder, unread): `CAiSHold`'s (2, vt 0x669d30)
 * Tick `FUN_006060c0` (D:L513892-514090): sub-state 0 sets the AI mode IDLE; sub-state 7 sets up one look and may pick a
 * stance after 2.5 s; with HOLD's online flags nothing ends it. In the hostage's life it lives one frame (199 s1's replay:
 * HOLD on a lone 0x11 replaces it by 2; the next rescue's Replace takes it), so the port's 2 writes the mode and nothing
 * else. Its signal 0's `FUN_0056dca0` and `FUN_005b3890` are unread.
 */
export const HOLD_STATE_TICK_READING = 'AI mode idle';

/**
 * LATER 1185 (research 447 s2.2): the hit counter `+0x718` (`FUN_00572330` D:L434250-434403): for a hostage
 * (`ctrl+0x26c == 4`) `hit` (`DAT_0064fdd8`, 2.5) a hit by a shooter that resolves to a kind-2 entity, the first hit in a
 * frame only (the `+0x40c` stamp); the push above `push` (`DAT_0064fde8`, 1.5) in the controller update `FUN_0056fd00`
 * (D:L433253-433287). Values from the disc's ELF. Reading.
 */
export const HOSTAGE_SHOT_COUNTER_READING = { hit: 2.5, push: 1.5 } as const;

/**
 * LATER 1185: the items `FUN_00572330` adds nothing for, by the projectile record's item id (`+0x7c`): the grenades 0x79-0x80
 * (the switch at ~D:L434335-434349: M67, the smokes, Mark141, the chem light, HE and the rest of the hand grenades) and
 * C4, the satchel and the claymore 0x97, 0x98, 0x99 (~D:L434352-434361). Reading.
 */
export const HOSTAGE_SHOT_EXCLUDED_READING: ReadonlySet<number> = new Set([0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f, 0x80, 0x97, 0x98, 0x99]);

/** LATER 1185: the alert level (`FUN_00561110`: 2 at 0x13's entry, 3 at a refused push): its effects on a hostage beyond the startle gate are unread; kept, read by nothing. */
export const HOSTAGE_ALERT_PLACEHOLDER = 'kept, read by nothing';

/** LATER 1185: a refused push's remembered event, a 3 s head look at the shooter (`FUN_005fad00`, `FUN_005faae0`): the wire carries no head look (research 447 s9.4); not built. */
export const HOSTAGE_SHOT_LOOK_PLACEHOLDER = 'not built';

/** LATER 1185: the near-miss feed into the counter (controller slot `+0x44`, `FUN_005729f0` D:L434460-434570): its broadcaster (ELF 0x5a4f80) has no caller found; not built. */
export const HOSTAGE_NEAR_MISS_PLACEHOLDER = 'not built';

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
  /** LATER 1170: 0x1b's object (`+0x58`, `FUN_0055cca0` D:L423925-423927): the room's projectile id; null otherwise. */
  danger?: number | null;
  /** LATER 1170: 0x1b's end timer, seconds left once the object is gone (`HOSTAGE_FLEE_END_PLACEHOLDER`); null while it stands. */
  ending?: number | null;
  /** LATER 1224: 0x1b's move child 0x18 running (the room's run): while it runs, 0x1b's sub-state holds at 6. */
  child?: boolean;
  /**
   * LATER 1188: 0x1c's fields -- `+4` the duration, `+0x60` the delay left, `+0x5c` the clip (null before the push sets
   * it), its seconds left while it plays, and the wait flag (`+0x2c` bit 0).
   */
  cower?: { duration: number; delay: number; clip: CowerClip | null; left: number; wait: boolean };
  /** LATER 1185: 0x13's saved stance (`+0x5a`, the body's `+0x278` at its entry, D:L515345), asked again at its exit. */
  savedStance?: 0 | 1 | 2;
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
  /** LATER 960: the body's placement stamp (`Walker.placement`); a change is a placement, which zeroes its trail. */
  placement?: number;
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
  /**
   * LATER 1170: 0x1b's frame -- the room moves the hostage on its flight and answers whether the object is gone (its
   * handle no longer matches: detonated or removed). Absent: the object never goes (a test without a room).
   */
  flee?: (dt: number, danger: number) => { gone: boolean; moving?: boolean; inside?: boolean };
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
  /**
   * LATER 1205: the state whose Tick ran in the last `step` (null when none ran: a dead hostage, an empty stack, or a top
   * popped without a tick). Read by the room: 9 and 0x1b step the body themselves in their Tick, so the room's own
   * physics is skipped by this, not by the state after the step -- the driver may have popped the ticked state already.
   */
  ticked: HostageStateId | null = null;
  /** LATER 1185: the hit counter `+0x718` (`HOSTAGE_SHOT_COUNTER_READING`). */
  shotCounter = 0;
  /** LATER 1185: the alert level (`HOSTAGE_ALERT_PLACEHOLDER`). */
  alert = 0;
  /** LATER 1187: the AI mode CAiSHold's Tick writes (`HOLD_STATE_TICK_READING`); null before any. */
  aiMode: 'idle' | null = null;
  /** LATER 1185: the game frames stepped, and the frame of the last counted hit (the `+0x40c` stamp). */
  private frames = 0;
  private lastHitFrame = -1;

  private readonly random: () => number;
  private readonly listener: ((state: AiState, signal: AiSignal) => void) | undefined;
  private readonly moveFollow: HostageAiOptions['follow'];
  private readonly moveFlee: HostageAiOptions['flee'];

  constructor(opts: HostageAiOptions) {
    this.id = opts.id;
    this.random = opts.random;
    this.listener = opts.signal;
    this.moveFollow = opts.follow;
    this.moveFlee = opts.flee;
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

  /**
   * LATER 1170 (research 445 s3.5): the danger scan's push -- refused unless the scan's gate admits 0x1b (`canFlee`,
   * SHOTS-1208 r125), then a top 0x13 popped (`FUN_005f5cb0` -> `FUN_005f7990`, D:L482740), 0x1b pushed through the gate
   * (`FUN_005f5c00`, D:L482741) and handed the object (`FUN_0055cca0`). Whether 0x1b was entered.
   */
  flee(danger: number): boolean {
    // SHOTS-1208 r125 (research 445 s5.10; reading, pending review): the scan reaches this push only through
    // `FUN_005f5cd0(ctrl, 0x1b, 0)` (D:L482954-482955), which tests bit 27 of +0x428, the AND of the stacked states'
    // masks (`FUN_005f7470` D:L506410-506590; held at r0004 by the key job, 0x5fec50). 0x13's mask 0x31040800 lacks it
    // (D:L506540), so while 0x13 stands the flight is refused and the pop below is never reached under it.
    if (!this.canFlee) return false;
    if (this.stack.top?.id === 0x13) this.stack.pop();
    if (!this.stack.push(0x1b)) return false;
    this.stack.top!.danger = danger;
    this.stack.top!.ending = null;
    return true;
  }

  /** LATER 1170: whether 0x1b is on the stack (`+0x42c` bit 27). */
  get fleeing(): boolean {
    return this.stack.has(0x1b);
  }

  /**
   * SHOTS-1208 r125: the danger scan's gate, `FUN_005f5cd0(ctrl, 0x1b, 0)` (D:L482954-482955): the whole can-push test --
   * the allowed-next mask's bit 27 (0x1b, 0x13 and 0x1c each clear it), the top not 0x1b, the top's veto.
   */
  get canFlee(): boolean {
    return this.stack.canPush(0x1b);
  }

  /**
   * LATER 1188 (`FUN_00571b10`'s flashbang branch, cause 0, D:L434092-434168): the room's cower test passed -- with 0x1c
   * already on top the function returns before any draw (D:L434032-434043; the entry gate's other term, ctrl `+0x264`
   * bit 1 or `DAT_0066b190`, is not built: research 445 s3 reads `+0x264` bit 1 clear on a hostage, so the gate is open); else the clip by stance (the coin drawn first, D:L434094-434096), a running
   * 0x1b's live bit cleared (D:L434137-434150), 0x1c pushed through the gate with `+4` the duration and the wait flag
   * (D:L434151-434168). Whether 0x1c was entered.
   */
  cower(duration: number = HOSTAGE_COWER_READING.duration): boolean {
    if (this.stack.top?.id === 0x1c) return false;                // D:L434032-434043: no draw (the review's F4)
    const first = this.random() <= 0.5;
    const C = HOSTAGE_COWER_CLIPS_READING;
    const clip: CowerClip = this.stance === 0 ? C.stand[first ? 0 : 1] : this.stance === 1 ? C.crouch[first ? 0 : 1] : C.prone;
    const top = this.stack.top;
    if (top?.id === 0x1b) top.live = false;                        // D:L434137-434150
    if (!this.stack.push(0x1c)) return false;
    this.cowerSerial = (this.cowerSerial + 1) & 0xff;
    const st = this.stack.top!;
    st.cower = { duration, delay: st.cower?.delay ?? 0, clip, left: 0, wait: true };
    return true;
  }

  /** LATER 1188: counts each cower's start: the body's action serial, so the page sees a restart. */
  cowerSerial = 0;

  /** LATER 1188: the cower clip playing (0x1c's sub 2): its name, its time and its length, for the body's action. */
  get cowerClip(): { name: CowerClip; t: number; seconds: number } | null {
    const st = this.stack.top;
    if (!st || st.id !== 0x1c || st.sub !== 2 || !st.cower?.clip) return null;
    const seconds = cowerSeconds(st.cower.clip);
    return { name: st.cower.clip, t: seconds - st.cower.left, seconds };
  }

  /**
   * LATER 1185 (`FUN_00572330`, `HOSTAGE_SHOT_COUNTER_READING`): a round struck the hostage. `item` the round's item id,
   * `shooter` where its shooter stands, null when it resolves to no kind-2 entity (a departed thrower): the counter takes
   * `hit` on the first such hit in a game frame, none for an excluded item (`HOSTAGE_SHOT_EXCLUDED_READING`).
   */
  shotBy(item: number, shooter: V3 | null): void {
    // The frame stamp `+0x40c` is written for ANY hit in a new frame (D:L434400), outside the shooter and item tests: an
    // uncounted hit (no shooter, an excluded item) still spends the frame (the 1185 review's F3).
    if (this.lastHitFrame === this.frames) return;
    this.lastHitFrame = this.frames;
    if (shooter === null || HOSTAGE_SHOT_EXCLUDED_READING.has(item)) return;
    this.shotCounter += HOSTAGE_SHOT_COUNTER_READING.hit;
  }

  /**
   * LATER 1185: the controller update's ShotAt push (`FUN_0056fd00` D:L433253-433287), each game frame AFTER the AI driver
   * (the entity tick at priority 4.6 against the driver's pre-tick at 1.0, D:L50922, D:L50925):
   * above `push` and 0x13 not on top, 0x13 pushed through the gate; refused, the alert 3 and the counter zeroed (the look
   * stored is `HOSTAGE_SHOT_LOOK_PLACEHOLDER`).
   */
  controllerUpdate(): void {
    if (!this.alive || !(this.shotCounter > HOSTAGE_SHOT_COUNTER_READING.push) || this.stack.top?.id === 0x13) return;
    if (!this.stack.push(0x13)) { this.alert = 3; this.shotCounter = 0; }
  }

  /** A room event near the hostage (a shot, a blast, a death): the event masks are 0 online, nothing changes. */
  onEvent(_kind: 'shot' | 'blast' | 'death', _at: V3): boolean {
    return false;                                                // HOSTAGE_EVENTS_READING
  }

  /**
   * One game frame (the driver `FUN_005f8030` D:L506872-506930, then the post-tick's stance countdown `FUN_0056f970`
   * D:L432948-432953): a top whose `live` bit is clear is popped and nothing ticks; else the top's Tick runs, and its
   * return -- every hostage Tick returns `!live`, stored at `+0x28` (research 447 s11) -- decides: done, the top is popped in the same
   * call (`FUN_005f7c40`) with no time added, the state below not ticked until the next frame (LATER 1205, research 447
   * s11); not done, the stack's time and the state's time take dt (D:L506919). A dead hostage is not stepped.
   */
  step(dt: number, world: HostageWorld): void {
    this.ticked = null;
    if (!this.alive) return;
    this.frames++;                                               // LATER 1185: the counter's frame stamp
    const top = this.stack.top;
    if (top) {
      if (!top.live) this.stack.pop();
      else {
        this.ticked = top.id;
        this.tick(top, dt, world);
        if (!top.live) {
          if (this.stack.top === top) this.stack.pop();
        } else {
          this.stack.time += dt;
          top.time += dt;
        }
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
    else if (st.id === 0x1b) this.tickFlee(st, dt);
    else if (st.id === 0x13) {
      // LATER 1185: CAiSShotAt's Tick for a hostage (`FUN_006089f0`, ctrl+0x26c == 4): sub 0 -> the alert 2 -> sub 5, its
      // live bit cleared the same tick (D:L515130-515133, D:L515277-515279): its Tick returns done and the driver pops it
      // in that frame (LATER 1205), the state below ticking from the next.
      if (st.sub === 0) { this.alert = 2; st.time = 0; st.sub = 5; }
      if (st.sub === 5) st.live = false;
    }
    else if (st.id === 2 && st.sub === 0) this.aiMode = 'idle';   // LATER 1187: HOLD_STATE_TICK_READING
    else if (st.id === 0x1c) this.tickCower(st, dt);
  }

  /**
   * LATER 1188: 0x1c's Tick (`FUN_00605c60` D:L513770-513870): sub 0 waits out the delay, then (the same tick) starts the
   * clip -- sub 2 while it plays, sub 3 at once with none; sub 3 ends it unless the wait flag holds it while the stack's
   * time is under `+4`. The cue (`+100` on its `+0x68` / `+0x6c` timer) is `HOSTAGE_COWER_CUE_PLACEHOLDER`.
   */
  private tickCower(st: AiState, dt: number): void {
    const c = st.cower ?? (st.cower = { duration: 0, delay: 0, clip: null, left: 0, wait: false });
    let sub = st.sub;
    if (sub === 3) st.live = c.wait ? this.stack.time < c.duration : false;
    else if (sub === 2) { c.left -= dt; if (c.left <= 0) sub = 3; }
    else if (sub === 0 && c.delay > 0) c.delay -= dt;
    else {
      if (c.clip) { c.left = cowerSeconds(c.clip); sub = 2; }
      else { sub = 3; c.wait = true; }                            // no clip (`FUN_00571150` refused): the wait flag
    }
    if (sub !== st.sub) { st.sub = sub; st.time = 0; }
  }

  /**
   * LATER 1170: `CAiSGrenade`'s Tick (`FUN_0055ac20`, research 445 s5) as built -- the run each frame (the room's, sub-state
   * 3's move child folded in: `HOSTAGE_FLEE_MOVE_PLACEHOLDER`); not the move's arrival but the object gone ends it, after
   * `HOSTAGE_FLEE_END_PLACEHOLDER` (D:L423024-423061): `live` cleared, the driver pops it in the same frame (LATER 1205),
   * the state below resumes on the next.
   */
  private tickFlee(st: AiState, dt: number): void {
    const moved: { gone: boolean; moving?: boolean; inside?: boolean } =
      st.danger === null || st.danger === undefined ? { gone: true } : this.moveFlee?.(dt, st.danger) ?? { gone: false };
    if (moved.gone && (st.ending === null || st.ending === undefined)) st.ending = HOSTAGE_FLEE_END_PLACEHOLDER;
    if (st.ending !== null && st.ending !== undefined) {
      // The object gone: the parent returns before its sub-state switch (D:L423027-423062).
      st.ending -= dt;
      if (st.ending <= 0) st.live = false;
      return;
    }
    // LATER 1224 (research 445 s5; Q24c M1, M2): the sub-states. While the move child 0x18 runs the driver does not tick
    // 0x1b (D:L506892-506913), so sub 6 holds; with none -- no cell, or the run over -- 6 picks 7 inside R or 8 outside
    // (D:L423488-423494) and 7 / 8 ask prone / crouch (D:L423504-423517). The asks write `+0x279` and `+0x280` directly.
    const P = HOSTAGE_FLEE_POSTURE_READING;
    const ask = (): number => P.base + this.random() * P.spread;
    const to = (sub: number): void => { if (sub !== st.sub) { st.sub = sub; st.time = 0; } };   // D:L423521-423523
    switch (st.sub) {
      case 0:
        // Sub 0, with a prediction or none: a prone hostage (or one asked prone) is asked to stand (D:L423103-423107,
        // D:L423116-423120); a hostage goes on to 3 (6 directly needs ctrl +0x264 bit 1, no hostage's). Sub 3 the same tick
        // (the switch falls through, D:L423215-423219): 6 at once, the run its move child (`HOSTAGE_FLEE_MOVE_PLACEHOLDER`:
        // the room's run), none when the search finds no cell (callout 0x35, not built).
        if (this.stance === 2 || this.requestedStance === 2) { this.requestedStance = P.stand; this.stanceDelay = ask(); }
        // Case 3's own ask, the same test (D:L423221-423225): a hostage still prone (`+0x278` 2) draws a second time in
        // the same tick, and the second delay stands (the 1224 review's F2). The original's test reads `+0x279` too, but case 0
        // has just written it (stand), so only the `+0x278` half can hold here (the box's tsc, TS2367: the request is 0 | 1).
        if (this.stance === 2) { this.requestedStance = P.stand; this.stanceDelay = ask(); }
        to(6);
        st.child = moved.moving === true;
        break;
      case 6:
        if (st.child && moved.moving === true) break;              // the child runs: no Tick of 0x1b this frame
        st.child = false;
        to(moved.inside === true ? 7 : 8);
        break;
      case 7:
        if (this.requestedStance !== P.inside) { this.requestedStance = P.inside; this.stanceDelay = ask(); }
        break;
      case 8:
        if (this.requestedStance !== P.outside) { this.requestedStance = P.outside; this.stanceDelay = ask(); }
        break;
    }
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
    // LATER 1185 (`FUN_006093f0`): 0x13's entry saves the stance held (`+0x278` into the state's `+0x5a`, D:L515345); its
    // exit asks that stance again after 0.25 + U(0, 0.25) s (`FUN_00563100`, D:L515338-515340) -- which overwrites a
    // pending stance request (the 1185 review's F2) -- and zeroes the counter (D:L515342).
    if (state.id === 0x13 && signal === 0) state.savedStance = this.stance;
    // LATER 1188: 0x1c's OnSignal (`FUN_00605f90` D:L513864-513889): 0 the delay U(0, 0.75) s (the AI mode 2 and the
    // look and stance calls it makes are not built); 2 and 3 (a suspend or a resume) end it.
    if (state.id === 0x1c && signal === 0) state.cower = { duration: 0, delay: this.random() * HOSTAGE_COWER_READING.delay, clip: null, left: 0, wait: false };
    if (state.id === 0x1c && (signal === 2 || signal === 3)) state.live = false;
    if (state.id === 0x13 && signal === 1) {
      this.setStance(0.25 + this.random() * 0.25, state.savedStance ?? this.stance);
      this.shotCounter = 0;
    }
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
