import type { MotionClip } from '@s2u/scene';
import { groundGrid, isPushedClip, launcherBaseCommand, launcherClipName, type PickupClipName, launcherMovingLowerCommands, LAUNCHER_SET_MOVES_READING, launcherStickLowers, moverSnapshot, playedOutCommand, STEP_PROBE_LIFT_READING, reloadHold, rootY, STANCES, TICK, Walker, type ActionEnd, type GroundData, type HoldClip, type HoldPass, type LauncherUp, type MoverState, type PlaySnapshot, type PopOutcome, type PushedClip, type PushedTop, type Stance, type SwapPick, type SwapProgress, type TraversalHooks, type TraversalKept, type WalkerState, type WalkInput } from './mover';
import type { Grid } from '@s2u/scene';
import type { TraversalPose } from './animator';
import { Button, COMMAND_STANCE_CODES, holdBits, STANCE_CODES, type Command } from './net/protocol';
import { MoverSim, type LauncherClip } from './net/moverSim';
import { aimPitchLimitsOf, LookGate, LookLog, OPEN_LOOK_CONTEXT, type LookContext } from './net/lookGate';
import { applyKnock, mountFallRefuses, mountPop, type Knock } from './net/blast';
import { fireCapability } from './net/fireCapability';
import type { StartBody } from './net/startLine';
import { flinchRefused, pushPopped } from './net/deaths';
import type { MotionTable } from './motionTable';
import { quantiseCommand } from './net/codec';
import { shortTurn, wrapYaw } from './yaw';
import type { GroundWish, Pose } from './camera';
import { headEye, headViewNear, PlayerCamera, INIT_AIM_PITCH, viewFar, type Vec3 } from './playerCamera';
import { proneEyeTerms, scopeEye, toWorld } from './cameraRig';
import { newDeathCamera } from './deathCamera';
import { KEY_STANCE, popStance as popOnMover, pressInWater, PRONE_POP_ADAPTATION, StanceButton, STANCE_HOLD_S_PLACEHOLDER, type StanceMode } from './stanceButton';
import { keyboardSite } from './keyboardTesting';
import { fallCovers, flinchOnTop, landingPops, type StackPop } from './stillReloadLife';
import type { ReloadItem } from './reloadClip';
import { flinchCovered, flinchCutAt, flinchLanded, type FlinchCut } from './net/flinchReload';
import { reloadCutOf } from './reloadLock';
import { LAUNCHER_RAISE_CLIPS, type LauncherFrom } from './equipment';
import { climbHoldsBody } from './traversal';

/**
 * The walk mode over the mover: the headless mover and its rules live in `./mover` (web sprint 3's shared sim, M2:
 * the server runs the same code), re-exported here so every import of `./walk` keeps working.
 */
export * from './mover';

/**
 * PAR-37 (research 251 section 9): the commands kept with the mover after each (`WalkMode`): 10 s at 60 Hz, the net
 * client's own history (`./net/client` `HISTORY`). A bound on what is kept, not a game value.
 */
const KEPT_COMMANDS = 600;

/**
 * NU-5 X1 (research 323 §1.5; the gameplay controller's point 3 and the review's F3, 2026-10-14): when the taker's own page
 * plays the pick-up's `Swap rifle`. The page cannot know at the press -- the room may refuse the claim (another seat's on
 * the same tick, `DROP_SAME_TICK_READING`; a stale command) -- so it waits for the room's `kit` (`./takeKit` ->
 * `WalkMode.pickupSwap`), but it knows its own claim's command (`pickupClaimed`, the `pickup` event's seq): it starts the
 * clip there, `from the claim's command` + 1, its clock caught up by the commands the message took (`Walker.launcherClip`'s
 * `elapsed`, as the room starts a kept clip late), so on the message's next command the page's clip is at the room's
 * phase and a fire is refused on both. What remains: the commands between the claim and the message ran on the page
 * without the clip (its feet and its fire there are the page's own until the room's correction); the claim's command is
 * told by the action part's fire table (`./matchActions` `pickup`, the one path a claim is sent on), so only a claim sent
 * some other way would start at the message, as before (was: "with no claim's command known ... as before", unwired). The original's taker online plays it
 * at the accept's arrival -- the owner decides (`FUN_0059f610` D:L458315-458331, `FUN_0059e830`) and each console applies
 * the accept on receipt (`FUN_002ba1a0` D:L159807-159817 -> `FUN_0059dfb0` -> `FUN_0059f0c0` D:L458209-458211) -- and
 * offline on the release's own frame; the port's room plays it from the claim's command, and the page follows the room.
 * [reading: not measured; capture NU5-1 times the taker's clip from the press] Was (to the review's F3): `'at the kit
 * message'` -- the page started on its next command at the message, a round trip behind the room.
 */
export const PICKUP_SWAP_OWN_LAG_READING = "from the claim's command" as const;

/** PAR-37: one command sent, kept with the mover after its tick (`WalkMode.replayVictory`). */
interface KeptCommand {
  seq: number;
  cmd: Command;
  /** The period of the hold the command carried (`hold`), as the room derives it for its mover (`MoverSim.holdPeriod`). */
  period: number | undefined;
  /** PAR-74: the pass of the hold the command carried (`hold`), as the room derives it from its bomb (`MoverSim.holdPass`). */
  pass?: HoldPass;
  /** PAR-84: the launcher clip the command started (`launcherRaised` / `launcherLowered`), as the room keeps it (`MoverSim.launcherClip`). */
  launcher?: LauncherClip;
  walker: WalkerState;
  /** The net client's corrections laid on the mover since (`nudge`): the kept state stood where they moved it from. */
  shift: [number, number, number];
  stance: Stance;
  weapon: 0 | 1;
  jumps: number;
  /** PAR-51: whether the victory dance was playing on the mover after the command (and any stop or start between ticks). */
  dancing: boolean;
  /**
   * LATER 551: the page's own flinch after the command's step (`flinchLogStep`), as last known -- rewritten when an event
   * heard later is replayed over it, or a re-run steps it again -- for a re-run from this command to lay back.
   */
  flinch?: FlinchState;
}

/**
 * LATER 525, LATER 551: the page's own flinch as it stands (`setFlinchPose`'s fields): its pose, its push flag, its reload
 * gate and clock, its window, its cover, the flinch a door clip covered, the end its replay found.
 */
interface FlinchState {
  pose: (() => TraversalPose | null) | null; pushed: boolean; gates: boolean; clock: (() => TraversalPose | null) | null;
  cut: FlinchCut | null; air: number; back: boolean; under: { cut: FlinchCut; at: number; pose: (() => TraversalPose | null) | null } | null;
  ended: number | null;
  /** The door-open body hold: the pushed clip that holds the body while the window is on top (`WalkMode.pushedTop`), or null. */
  hold: PushedClip | null;
}

/**
 * `WalkMode.setFlinchPose`'s options: `reloadGate` false for a program's push (no motion flag 0x4), `pushed` for one
 * (`FUN_00588bc0` alone, no `FUN_005a2690` gate), and `clip` -- the door-open body hold -- the push's clip, which holds
 * the body while its window is on top when it is one of `PUSHED_CLIPS` (`./mover`).
 */
export interface FlinchOpts { reloadGate?: boolean; pushed?: boolean; clip?: string }

/** PAR-37: a victory dance's run under it (`WalkMode.syncVictoryMotion`). */
interface VictoryReplay {
  from: number;
  clip: MotionClip;
  motion: { playback: number | null; noFire?: number | null };
  elapsed: number;
  replayed: ((after: number) => void) | undefined;
  /** The command a stop heard while the run waited is laid after (`stopVictoryMotionAfter`), or null. */
  stopAfter: number | null;
}

/** The half of `FlyCamera` walk mode drives: the look it reads, the view it places, the wish it steps by. */
export interface WalkCamera {
  /** OT.R68: the forge editor's camera (`./camera` `FlyCameraOptions.forgeKbm`): its Walk reads keys in every build. */
  readonly forgeKbm?: boolean;
  pose(): Pose;
  setPose(pose: Partial<Pose>): void;
  moveTo(x: number, y: number, z: number): void;
  setWalking(on: boolean): void;
  setPitchLimits(minDegrees: number, maxDegrees: number): void;
  placeView(eye: readonly [number, number, number], target: readonly [number, number, number] | null): void;
  groundWish(): GroundWish;
  /** The look law's state (web research 83, `./look`): its `turnRate`, rad/s left positive, is the actor's turn. */
  lookState?(): { turnRate: number };
  /** The projection's width/height (`FlyCamera.aspect`): the near clearance's rectangle. Absent on a stand-in: the game's frame (`GAME_ASPECT`). */
  aspect?(): number;
  /** OBF-1 (`HEAD_VIEW_NEAR_ADAPTATION`): the head view's near plane, or null for the map's (`FlyCamera.setViewNear`). */
  setViewNear?(near: number | null): void;
}

/**
 * Third person (the game's camera: W2.R1) or the view from the head while zoomed (`setScoped`) -- `scope` names every
 * zoom view past third person: first person (state 1), the night vision and the scope.
 */
export type WalkView = 'third' | 'scope';

/**
 * The hook's view of the walk's camera (W2.1): which view, the eye and target drawn, the root, the pitch, and the
 * pass's state (`FUN_0029bf70`: the distance `DAT_003de268`, the hold `cam+0x4c` in seconds).
 */
export interface WalkCameraState {
  mode: WalkView; eye: Vec3; target: Vec3; rootY: number; pitch: number; pass: { distance: number; hold: number };
  /** The drawn camera's eye (`PlayerCamera.view().eye`): `eye` is the game's, the shot's and the order's (#479's review F1). */
  drawnEye: Vec3;
}

/**
 * Walk and fly, one switch (W1.4 step 5): `G` toggles it (nothing on Ctrl -- `camera.ts` says why), the panel's
 * "walk" box mirrors it through `onChange`, and the hook drives it for Playwright. Entering walk stands the mover on
 * the floor under the camera, or on spawn A when there is none there; the touch stick drives the mover because
 * the mover reads the camera's own wish (`groundWish`). `setCamera` from the hook sets the mover too.
 */
/**
 * LATER 512: a one-shot's pose whose clock can be set (`at(seconds)`): the own flinch's (`./netPage`), which the walk draws
 * again from the phase it reached when a door push covered it (`WalkMode.flinchUncover`).
 */
export type PhasedPose = (() => TraversalPose | null) & { at?: (seconds: number) => void };

export class WalkMode {
  /** The map's ground, and the mover on it once walk is first asked for: the grid costs 15 ms on Guidance. */
  private ground: GroundData | undefined;
  /** MAP-02: the hull's grid (`gridOfGround`). */
  private hullGrid: Grid | null = null;
  private walker: Walker | null = null;
  /**
   * EPH-TILT (a browser adaptation, product track, OT.R53): the walker for the emulator parity harness's dev-mode read
   * (`./ephFrame` `tiltOf`, which feature-detects PRONE-TILT's `rootTilt` and reads only); null before the first walk.
   */
  ephWalker(): object | null { return this.walker; }
  /** Research 303: the serial of the dance the walker plays (`syncVictoryMotion`), or null. */
  private victorySerial: number | null = null;
  /** Research 303: the victory dance on this page's own mover (`Walker.victoryMotion`): its root travel, its NoFire. */
  victoryMotionActive(): boolean { return !!this.walker?.victoryMotion; }
  /**
   * Research 303: the room's dance on the page's own mover (`./victory` `VictoryPage`), once a serial; null stops it.
   * `ahead` is the commands the page sent past the one the room began it after (`victory.seq`, S).
   *
   * PAR-37 (research 251 section 9): the room ran those commands, S+1 to the last sent, under the dance -- which refuses
   * the jump and the swap, keeps a stance press as the request, gives way to a hold, the dive, the stick or the turn past
   * `INTERRUPT_STICK`, and is stopped by a reload decided there. So the page runs them again under it: its mover laid back
   * to the state it kept after S, the dance started there, and S+1.. applied through `MoverSim` -- the room's own rule, as
   * `respawn` replays (`replayVictory`). `reloads`: the commands the page's reloads rode while the request was in flight
   * (the room stops the dance once the command after one has run: `room.ts` `due`, `stopVictory` at the accepted reload,
   * `0x005a86b4`). `replayed` hears the S the run started from (the net client's predictions after it are the run's).
   * Without a kept state for S and every command after it (a new mover, a knock laid at or after S: `knockedAfter`), the
   * dance's root alone runs `ahead` ticks (`Walker.advanceVictory`), as before.
   */
  syncVictoryMotion(dance: { serial: number; elapsed: number } | null, clip?: MotionClip, motion?: { playback: number | null; noFire?: number | null }, ahead = 0,
    reloads: readonly number[] = [], replayed?: (after: number) => void): void {
    const w = this.walker;
    if (!w) return;
    // PAR-37: a stop naming no command (an older room's) heard while a run under the dance waits for its tick: the room sent
    // it before it ran any command the page has not sent yet, so the run stops the dance after the last one sent
    // (`stopVictoryMotionAfter`). PAR-49: a stop naming its `seq` goes to `stopVictoryMotionAfter(seq)` (`./victory`).
    if (!dance) { this.stopVictoryMotionAfter(this.taps); return; }
    if (this.victorySerial === dance.serial || !clip || !motion) return;
    this.victorySerial = dance.serial;
    const n = Math.max(0, Math.floor(ahead)), from = this.taps - n;
    const stops = reloads.filter((r) => r >= from).map((r) => r + 1);
    this.danceStopAt = stops.length ? Math.min(...stops) : null;
    const replay: VictoryReplay = { from, clip, motion, elapsed: dance.elapsed, replayed, stopAfter: null };
    this.danceHeard = replay;                                    // PAR-51: for a room stop heard after the run has run
    // A press taken since the last tick rides the next command, which the run must hold too: it waits for that tick --
    // with nothing sent past S as well (n = 0: the answer within a tick), as the press is run under the dance there.
    // The net client's predictions after S are the run's from now: a snapshot heard before that tick compares none of them.
    if ((this.pressed | this.pressedHold) !== 0 && this.canReplay(from, false)) { this.danceReplay = replay; replayed?.(from); return; }
    if (n > 0 && this.replayVictory(replay)) return;
    w.setVictoryMotion(clip, motion, dance.elapsed);
    w.advanceVictory(n);
    this.stopDanceAt(this.taps);
    this.keepDance(w);                                           // PAR-51: the dance on the mover after the last command
  }
  /**
   * The dance stopped on the page's mover (PARITY-1 close: its own end, `stopped`) -- the room's stop
   * (`syncVictoryMotion(null)`), or the page's own reload (`./victory` `VictoryPage.reloaded`). PAR-37: while a run under
   * the dance waits for its tick, the stop is laid in the run after command `seq` -- the room's after the command its stop
   * names (PAR-49: its last run at the stop, S+m), else after the last command sent (it stopped before running the next:
   * a flinch, the round's end, its clock, none of which the run can see), the
   * reload's after the command past the reload's (`room.ts` `due`) -- and the commands after it run with no dance.
   *
   * PAR-51 (research 251 section 9.1): a stop naming a command `seq` the page has already run past with the dance playing
   * after it -- the run under the dance ran at once (no press pending), or the page's own ticks went on under it -- runs
   * `seq`+1.. again with no dance (`rerunFrom`): the room stopped it after `seq` and ran the rest without it. A swap the
   * run under the dance undid is told to the kit redone (`swapProgress`). A stop naming S itself (m = 0: the room stopped
   * it before running S+1 -- a flinch, the round's end, the up-link's backlog) finds the state kept after S as it was
   * before the dance: the run lays the dance there as the room did (`setVictoryMotion`, its start's own effects) and the
   * stop at once, so `stopped` is heard once, as on the room. Without a kept state for `seq` and every command after it
   * (pruned past `KEPT_COMMANDS`, a new mover, a knock laid at or after it: `knockedAfter`), the dance stops now, as before.
   */
  stopVictoryMotionAfter(seq: number): void {
    const w = this.walker;
    if (!w) return;
    this.victorySerial = null;
    const r = this.danceReplay;
    if (r) { r.stopAfter = Math.min(r.stopAfter ?? seq, seq); return; }
    this.danceStopAt = null;
    const heard = this.danceHeard;
    this.danceHeard = null;
    if (seq < this.taps) {
      const between = this.kept.find((k) => k.seq === seq)?.dancing ? (m: Walker) => m.stopVictoryMotion()
        : heard && seq === heard.from ? (m: Walker) => { m.setVictoryMotion(heard.clip, heard.motion, heard.elapsed); m.stopVictoryMotion(); }
          : null;
      if (between && this.rerunFrom(seq, between, null, heard?.replayed, 'redone', { relog: true })) return;   // LATER 551
    }
    w.stopVictoryMotion();
  }
  /**
   * PAR-51: the dance as the page heard it start (`syncVictoryMotion`): its S, its clip, and who hears the commands run
   * again (`replayed`) -- for the room's stop heard after the run has run (`stopVictoryMotionAfter`).
   */
  private danceHeard: VictoryReplay | null = null;
  /** PAR-37: a victory dance's run under it, waiting for the next tick (`syncVictoryMotion`). */
  private danceReplay: VictoryReplay | null = null;
  /** PAR-37: the command after which the room stops the dance for a reload decided there (`syncVictoryMotion`), or null. */
  private danceStopAt: number | null = null;
  /**
   * PAR-37: per command sent, the command and the mover after its tick (`Walker.saveState`), the page's stance and weapon
   * then, the hold's period it carried, the jumps so far, and the nets' corrections laid on the mover since (`nudge`) --
   * the last `KEPT_COMMANDS`, the net client's own history.
   */
  private readonly kept: KeptCommand[] = [];
  /** PAR-37: the period of the hold taken since the last tick (`hold`), which rides the next command. */
  private pressedHoldPeriod: number | undefined = undefined;
  /** PAR-74: the pass of the hold taken since the last tick (`hold`), kept with the command it rides. */
  private pressedHoldPass: HoldPass | undefined = undefined;
  /** PAR-84: the launcher clip started since the last tick (`launcherRaised` / `launcherLowered`), kept with the command it rides. */
  private pressedLauncher: LauncherClip | null = null;
  /** The command a blast's knock was laid after (`knock`): the kept states at or before it lack it. */
  private knockedAfter = -1;
  /**
   * PAR-37: a swap the run under the dance undid, told once to the kit (`swapProgress`). PAR-51: or one a run with no
   * dance from the room's stop took again (`redone`); a redo while the undo is still untold cancels it (and the reverse).
   */
  private swapTold: 'undone' | 'redone' | null = null;

  /**
   * PAR-37: whether the page kept its mover after command `from` and every command since (`syncVictoryMotion`), and (with
   * `look`) the look gate's step after it -- which a run waiting for the next tick finds recorded by then.
   */
  private canReplay(from: number, look = true): boolean {
    const i = this.kept.findIndex((k) => k.seq === from);
    return i >= 0 && this.kept.length - 1 - i === this.taps - from && this.knockedAfter < from && (!look || this.lookLog.after(from) !== null);
  }

  /**
   * PAR-37 (research 251 section 9): the commands after `from` (S) run again under the dance -- the mover laid back to the
   * state kept after S (with the corrections laid since), the facing and the look gate as they stood after S (`LookLog.after`,
   * a facing's replay included), the dance started there as the room started it between its commands, then each command
   * through `MoverSim.apply` with the hold period it carried, the reload's stop after the command it is decided at. The
   * moves' own state is not kept: the room starts a dance only with none playing (`room.ts` `victoryStatus`), so a move the
   * page began since (the dive) is dropped and the run begins it again. False when the record does not reach back to S.
   */
  private replayVictory(r: VictoryReplay): boolean {
    return this.rerunFrom(r.from, (w) => {
      w.setVictoryMotion(r.clip, r.motion, r.elapsed);
      if (r.stopAfter !== null && r.stopAfter <= r.from) w.stopVictoryMotion();   // stopped before any command past S
    }, r.stopAfter, r.replayed, 'undone', { relog: true });        // LATER 551: the flinch stepped as the room's
  }

  /**
   * PAR-37 / PAR-51: the commands after `from` run again through `MoverSim.apply` from the state kept after `from` --
   * `between` laid there first, as the room laid it between its commands (the dance's start, PAR-37; the room's stop,
   * PAR-51), `stopAfter` the stop laid in the run after that command. A weapon that comes out other than the page's is
   * told to the kit once as `told` (or cancels the opposite signal still untold). False when the record does not reach
   * back to `from`. LATER 526: `held` false runs the commands' look as sent, not held to a turret (the room's body on foot
   * holds none, `room.ts` `onTurret`); `relog` writes each command's stick cut, air and landing (`cutLog`) as the run left
   * the mover, for the flinch's replay after it (`mountUntake`).
   *
   * LATER 549 (research 92 section 4, "LATER 544's reading", path 3; PTW.R3 with `room.ts`'s `oneShotOnTop` on `sim.seq`):
   * the flinch's slot is asked of each command run again as it stood at that command (`MoverSim.seq`), not the live slot at
   * `taps + 1` -- a stance request waits under it (`FUN_00552ec0` D:L418927-418930, LATER 512c). With `flinch` (a refused
   * take: `mountUntake`), the run steps the slot itself: `flinch(seq)` lays what stood or was pushed before command `seq`,
   * and each command's relogged `cutLog` entry steps it after (`flinchLogStep`), so the slot is read from the window the
   * room kept (`[start, until)`, after the tick's pop). Without it, each command's answer is the one `cutLog` kept for it
   * (`slot`: the live tick's, or rewritten by an event heard since, `setFlinchPose`), else the slot's window read at that
   * command.
   *
   * LATER 551 (research 92 section 4, "LATER 551"; PTW.R3 with `room.ts`'s `watchCut` and `oneShotOnTop`): the knock's run
   * and the dance's (`relog`, no `flinch` of their own) step the flinch themselves, as the room's mover ran the commands:
   * the flinch laid back as it stood after `from` (`KeptCommand.flinch`), what was laid between the commands laid again
   * before each (`flinchLaid`: a told window, a take's end), each command's relogged entry stepping it after
   * (`flinchLogStep`) -- so a knock's fall covers the window from the first command its body runs in the air inside it
   * (PAR-71, `flinchCovered`: `FUN_005af930` D:L466956-466970) and the landing pops it with its clip or hands it back with
   * the commands it had left (`flinchLanded`: `FUN_00589aa0` D:L466900-466901, `FUN_0028da00` D:L135104-135107), and
   * each command's slot is the room's (`FUN_00552ec0` D:L418927-418930). A Prone cover knock in `between` ends the
   * window at the knock (`knockPops`, LATER 555: `FUN_0058a4d0` D:L440997, D:L446762-446768), as the room's. A take
   * standing (`takeKept`) keeps the flinch this run steps to M - 1, for its refusal (`mountUntake`).
   *
   * LATER 551's review F2: the room ran its pushes and its knock in the order the wire tells them, and read a push's cover
   * from its own flinch at the push (`room.ts` `doorMotion`; its knock drops the covered one, `layKnock`). The told
   * entries laid after `from` (`flinchLaid` at `from + 1`, all heard before the event this run lays) are laid ahead of
   * `between`; the page's own entries there (a take's end, a death's, a refused take's hand-back) after it, as before.
   * A pushed told entry's cover (`flinchUnder`) is read again from the flinch this run has stepped to it, by
   * `setFlinchPose`'s rule, not the live one at its hearing. `layBefore` stops the leading told entries at the first
   * entry of the page's own: a told entry stored after a page-own one at `from + 1` is laid after `between` (unreached
   * in the read cases; the re-look's note). LATER 551's review F5: `base` is taken for every run that
   * relogs without a `flinch` of its own -- the knock's, the dance's, and `mountUntake`'s when the take kept no flinch (a
   * superseded one, `k.flinch` null), which then steps the flinch kept after M - 1 through `flinchLaid` where it read
   * `cutLog`'s slots before LATER 551 (closer to the room's mover, which stepped its flinch on every command; not pinned).
   */
  private rerunFrom(from: number, between: (w: Walker) => void, stopAfter: number | null, replayed: ((after: number) => void) | undefined,
    told: 'undone' | 'redone', opts: { held?: boolean; relog?: boolean; flinch?: (seq: number) => void } = {}): boolean {
    const w = this.walker;
    if (!w || !this.canReplay(from)) return false;
    const i = this.kept.findIndex((k) => k.seq === from), at = this.kept[i]!, look = this.lookLog.after(from)!;
    const firstJumps = this.kept[this.kept.length - 1]!.jumps - at.jumps;
    // LATER 551: a run that relogs and has no `flinch` of its own (the knock's, the dance's) lays the flinch back as it
    // stood after `from` and steps it itself (`layBefore`, then each relogged entry).
    const base = !opts.flinch && opts.relog ? at.flinch : undefined;
    if (this.moves && (this.moves.busy() || this.moves.pose())) this.moves.reset();
    w.restoreState(at.walker);
    w.state.x += at.shift[0]; w.state.y += at.shift[1]; w.state.z += at.shift[2];
    w.state.yaw = look.ref.yaw; w.state.pitch = look.ref.pitch;
    if (base) this.flinchLay(base);
    // LATER 551: what was laid between the commands (`flinchLaid`), before command `seq` -- a told window's cover read
    // from the body as this run left it after the command before (`setFlinchPose`'s `before`, PAR-65) -- and the take's
    // kept flinch (`takeKept`) refreshed with the one this run steps to M - 1, where the take is laid (`mountTake`). From
    // entry `skip` on; `told` alone: the leading told entries only. Returns the index after the last entry laid.
    const kt = base ? this.takeKept : null;
    const layBefore = (seq: number, skip = 0, told = false): number => {
      const all = this.flinchLaid.get(seq) ?? [];
      let n = skip;
      for (; n < all.length; n++) {
        const l = all[n]!;
        if (told && !l.told) break;
        if (l.take && kt?.flinch && seq === kt.taps + 1) kt.flinch = this.flinchNow();
        // LATER 551's review F2: a push's cover read from this run's flinch, as `setFlinchPose` reads it (LATER 363).
        const open = this.flinchCut, at = l.s.cut?.start ?? seq;
        const under = !l.cover ? l.s.under
          : this.flinchGates && open && open.until > at ? { cut: { start: open.start, until: open.until }, at, pose: this.flinchPose }
            : this.flinchUnder;
        this.flinchLay(l.s);
        this.flinchUnder = under;
        if (l.told && l.s.cut) this.flinchAir = w.airborne ? seq : -1;
      }
      return n;
    };
    // LATER 551's review F2: the told entries after `from`, heard before this run's event, laid ahead of it (the wire's order).
    const early = base ? from + 1 : -1;
    const earlyLaid = base ? layBefore(early, 0, true) : 0;
    between(w);
    const sim = new MoverSim(w, this.moves);
    sim.seq = from;
    sim.weapon = at.weapon;
    sim.gate = look.gate;
    sim.lookContext = this.lookContext;
    let cur = at;
    sim.holdPeriod = () => cur.period;
    sim.holdPass = () => cur.pass;                               // PAR-74: the pass kept with the command
    // PAR-84: the launcher clip kept with the command -- none under the dance: the room drops a `throw` while its dance
    // plays (`room.ts` `victoryPlaying`), so its mover holds no clip there (the page's launcher state is not undone).
    // NU-5 review F3: a pick-up's `Swap rifle` rides the command after its message, kept from the claim's (`at` earlier).
    sim.launcherClip = (seq) => (cur.launcher !== undefined && cur.launcher.at <= seq && !w.victoryMotion ? cur.launcher : null);
    this.lookLog.truncate(from);                                 // recorded again, as the run steps the gate
    // PAR-51: each step recorded with the facing it steps from -- the mover's, which `MoverSim.prepare` steps the gate from
    // -- as the walk's own ticks record theirs (PTT-8's `ref`), so a later run from a command inside this one finds the
    // facing after it (`LookLog.after`; the room's stop at S+m) and a facing's replay through it starts each step there.
    const log = this.lookLog;
    sim.lookLog = Object.assign(Object.create(log) as LookLog, {
      record: (...a: Parameters<LookLog['record']>) => log.record(a[0], a[1], a[2], a[3], a[4], a[5], { yaw: w.state.yaw, pitch: w.state.pitch }),
    });
    let jumps = 0;
    let seen = w.landing;                                        // LATER 526 (`relog`): the landing seen after `from`
    const stepped = opts.flinch ?? (base ? (seq: number): void => { layBefore(seq, seq === early ? earlyLaid : 0); } : undefined);
    // LATER 549: the slot at the command the sim runs now (`MoverSim.prepare` sets `seq` before the stance is asked).
    this.rerunSlot = () => (stepped ? this.slotAt(sim.seq) : this.cutLog.find((c) => c.seq === sim.seq)?.slot ?? this.slotAt(sim.seq));
    this.rerunSeq = () => sim.seq;                               // the door-open body hold: the push on the command run again
    this.basePopped = false;                                     // LATER 560: none carried into the run
    try {
      for (let k = i + 1; k < this.kept.length; k++) {
        cur = this.kept[k]!;
        stepped?.(cur.seq);                                        // LATER 549: what the room's slot held before this command
        // T81-3: held to the turret as the room's `onTurret` holds it (LATER 526: not on foot, `held` false)
        if (sim.apply(opts.held === false ? cur.cmd : this.aimHeld(cur.cmd)).jumped) jumps++;
        // LATER 560: a climb's start or a ladder's mount on the command as run again (the moves heard it, `stackPopped`);
        // relogged on its entry, its step cuts the window there (`flinchLogStep`); a run that does not relog drops it.
        const pop = this.takeBasePop();
        if (opts.relog) {
          const e = this.cutLog.find((c) => c.seq === cur.seq);
          if (e) Object.assign(e, this.cutEntry(w, seen), { pop });
          if (w.landing) seen = w.landing;
          if (e && stepped) this.flinchLogStep(e);                 // LATER 549: the slot stepped on the command as re-run
        }
        this.stopDanceAt(cur.seq);
        if (stopAfter !== null && cur.seq >= stopAfter) w.stopVictoryMotion();   // a stop heard while it waited
        cur.walker = w.saveState();
        cur.shift = [0, 0, 0];
        cur.stance = w.stance;
        cur.weapon = sim.weapon;
        cur.jumps = at.jumps + jumps;
        cur.dancing = !!w.victoryMotion;
      }
      if (base) layBefore(this.taps + 1, this.taps + 1 === early ? earlyLaid : 0);   // LATER 551: laid after the last command
    } finally {
      this.rerunSlot = null;
      this.rerunSeq = null;
    }
    if (opts.relog && seen) this.poppedLanding = seen;           // LATER 526: the next tick's own landing judged after the run's
    this.jumps += Math.max(0, jumps - firstJumps);              // the count only grows: a take-off drawn stays drawn
    this.stance_ = w.stance;
    if (sim.weapon !== this.weapon_) {
      this.weapon_ = sim.weapon;
      this.swapTold = this.swapTold !== null && this.swapTold !== told ? null : told;   // PAR-51: an untold opposite cancels
    }
    this.lookGate = sim.gate;
    this.tickRef = { yaw: w.state.yaw, pitch: w.state.pitch };
    this.gateWeapon = sim.weapon;
    replayed?.(from);
    return true;
  }

  /**
   * PAR-51: the last command kept laid again when the dance came on or off the mover after it, between ticks (a start
   * heard, a reload's stop at the tick's end): the kept state is the mover after the command, as the room's stop after
   * it finds it (`stopVictoryMotionAfter`).
   */
  private keepDance(w: Walker): void {
    const last = this.kept[this.kept.length - 1];
    if (!last || last.seq !== this.taps || last.dancing === !!w.victoryMotion) return;
    last.walker = w.saveState();
    last.shift = [0, 0, 0];
    last.dancing = !!w.victoryMotion;
  }

  /** PAR-37: the room's stop for a reload decided after command `seq` (`danceStopAt`), on the page's mover. */
  private stopDanceAt(seq: number): void {
    if (this.danceStopAt === null || seq < this.danceStopAt) return;
    this.danceStopAt = null;
    this.walker?.stopVictoryMotion();
  }
  private spawn: [number, number, number] | null = null;
  private walking = false;
  private bound: EventTarget | null = null;
  /** Whether `G` switches walk and fly (owner, 2026-09-29: off in Play for a player; the developer's `?devmode` keeps it). */
  modeKey = true;
  /** The stance, kept here so a new map's mover takes it on (`setGround` makes a new `Walker`). */
  private stance_: Stance = 'stand';
  /** The game's camera over the mover (W2.1), made with it. */
  private player: PlayerCamera | null = null;
  /** The view last placed: what the hook and the reticle read. */
  private placed: { eye: Vec3; target: Vec3; far: Vec3 } | null = null;
  /**
   * MISSION R8: the drawn camera when the drawn feet stand off the simulated ones (`follow`), else null. Lifted from
   * the game's eye (`CameraView.aim`), so the use prompt's ray (`lookAim`) never takes the drawn-only push (#479's F1).
   */
  private drawnEye: Vec3 | null = null;
  private drawnTarget: Vec3 | null = null;
  /** The eye the frame is drawn from in third person (`PlayerCamera.view().eye`, lifted), else null (#479's review F1). */
  private frameEye: Vec3 | null = null;
  /** OBF-1: the head view's near plane last handed the camera (`HEAD_VIEW_NEAR_ADAPTATION`), null for the map's. */
  private viewNear: number | null = null;
  private drawnFar: Vec3 | null = null;
  /** Jumps taken: the animator sees a take-off by the count, whenever between two frames it came. */
  private jumps = 0;
  /** Zoomed past third person (first person, the night vision, the scope; `main.ts`): the view from the head. */
  private scoped = false;
  /** In the 9x view or a scope (`./zoom` state 4 and up; not the night vision): the mover's stick x 0.2 (`Walker.scoped`). */
  private scopedMove = false;
  /**
   * The view the last command sent carried (`Button.Scope`): what the room weighs the next command's swap against
   * (`MoverSim.prepare`: the swap before the command's own `Scope`), so the page's press does too (`swapWeapon`).
   */
  private sentScope = false;
  /**
   * The presses taken since the last tick that rank after the jump in the player update's order (`Button.Action`,
   * `Button.Swap`, `Button.Stance`; `FUN_00594cf0`: the jump D:L453208, the Action D:L453218, the swap D:L453288, the
   * zoom D:L453313, the stance D:L453331):
   * the room takes a command's presses in that order (`MoverSim.prepare`), so the page keeps it within a tick.
   */
  private tickPresses = 0;
  /** A jump pressed after an Action, a swap or a stance this tick: it waits for the next tick, where the room reads it too. */
  private jumpWaits = false;
  /** An Action pressed after a swap or a stance this tick: it waits for the next tick (D:L453218, after the jump, before the swap). */
  private actionWaits = false;
  private binoculars_ = false;
  /** MULTIPLAYER: a hold the mover took since the last tick (`hold`), as its bits on the next command. */
  private pressedHold = 0;
  /**
   * `C`, the PC's stance button (owner, 2026-09-29): held or not, a press not yet seen by a frame (a tap quicker than
   * a frame still counts), and its tap-and-hold machine -- a tap toggles stand and crouch (prone to crouch), a hold of
   * `STANCE_HOLD_S_PLACEHOLDER` goes prone -- run once a frame in `frame`.
   */
  private stanceKeyHeld = false;
  private stanceKeyPressed = false;
  private readonly stanceKey = new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE);
  /** The touch C button (`./touch`): `C`'s rule on its own machine, fed by `stanceTouch`, run beside the key's. */
  private stanceTouchHeld = false;
  private stanceTouchPressed = false;
  private readonly stanceTouchButton = new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE);
  /**
   * OT.R67: the stance mode every lane's stance button runs in (`../stanceButton` `StanceButton.lanes`) -- the
   * prone-pop by default (`PRONE_POP_ADAPTATION`); the page sets the browser's controller setting (`setStanceMode`).
   */
  private stanceMode_: StanceMode = PRONE_POP_ADAPTATION;
  /**
   * OT.R76 (`../stanceButton` `TRIANGLE_SQUARE_POP_ADAPTATION`): the pop's window -- the drop to prone or the dive a
   * stance press started (`pronePress`), on its mover; null when none is open (`jumpPress`, `disarmPop`).
   */
  private popArm: { mover: Walker; token: object } | null = null;
  /** The R2 inventory open (`holdForMenu`): C, Space and the touch C take nothing. */
  private menuHeld = false;
  /** TRAVERSAL SEAM: the factory `useTraversal` set, and the moves on the current mover. */
  private traversalFactory: ((walker: Walker, ground: GroundData) => TraversalHooks) | null = null;
  private moves: TraversalHooks | null = null;
  /**
   * The skeleton root's height over the feet as the body is posed (`./play` hands it over after each animator step),
   * or null with no clips: `FUN_0029a950` reads the posed root (`FUN_002869d0` on `actor+0x2e8`, decomp 142450-142460),
   * so the camera rises with the standing jump's root and sinks through a crouch as the clips do.
   */
  private posedRoot: number | null = null;
  /** The look's yaw at the last frame, degrees, and the turn since, radians a second (left positive). */
  private lastYaw: number | null = null;
  private turnRate = 0;
  /**
   * MULTIPLAYER (web sprint 3, W3.R8): each tick's command, handed to the net client after the tick with the feet it
   * left the mover on (the prediction), and the presses since the last tick, which ride on the next command. The page
   * applies a press at once, between frames -- before the next tick, where the server's `MoverSim.prepare` applies it.
   */
  private netTap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null = null;
  private pressed = 0;
  private pressedStance = 0;
  /**
   * The command number of the walk's last tick, in the net client's numbering: set at each `setNetTap` to the number the
   * client gave last (`sent`: 0 on a new client, its count so far on a rebind -- a second match on one lobby socket,
   * ONL-18, where `./net/client` keeps numbering) and counted on per tick, so the next is command `taps + 1`, the number
   * the client gives it: the page's tick runs on the seq the server's will (`Walker.commandSeq`,
   * `LANDING_HIT_DRAW_READING`) and its look record is keyed by the seq the room acks (`reconcileFacing`).
   */
  private taps = 0;
  private weapon_: 0 | 1 = 0;
  private trigger_ = false;
  /** Dead or spectating in a networked round: the mover takes no stick and no presses. */
  private locked = false;
  /** Dead (the net client's `kill` until its `spawn`): the look is not the mover's and the camera is the death's. */
  private dead = false;
  private tickLook: [number, number, number] = [0, 0, 0];
  /**
   * LATER 338: this frame's ticks as they ran -- each command's number, its moment from the frame's start and its camera
   * (the shot's eye and aim point at that tick) -- the previous frame's last first (its moment at or before 0): where the
   * kit names a held round (`tickAim`).
   */
  private frameTicks: { seq: number; at: number; eye: Vec3; far: Vec3 }[] = [];
  private lastTick: { seq: number; eye: Vec3; far: Vec3 } | null = null;
  /**
   * NET-LOOK (OT.R38): the room's look gate (`./net/lookGate`) run on the page's own commands, so the predicted mover
   * faces and turns as the room's does; and where the mover faced at the end of the last tick (the gate's start).
   */
  private lookGate = new LookGate();
  private tickRef = { yaw: 0, pitch: 0 };
  /** NET-WIRE (research 224 §4): the gate's steps by command, for the facing's replay (`reconcileFacing`). */
  private readonly lookLog = new LookLog();
  /**
   * NET-LOOK's review (finding 1): the room's context for the gate -- the held weapon's record (`lookContextOf`), handed
   * by the firearm (`./matchFirearm`) -- and the weapon in hand as the room's mover had it at the end of the last tick.
   */
  private lookContext: ((weapon: 0 | 1) => LookContext) | null = null;
  private gateWeapon: 0 | 1 = 0;
  /** The look the last command carried (degrees): where a frame's look starts, spread over its ticks (round 3). */
  private lastLook = { yaw: 0, pitch: 0 };
  private deathPose: (() => TraversalPose | null) | null = null;

  constructor(private readonly camera: WalkCamera, private readonly onChange: (walking: boolean) => void = () => undefined) {}

  /**
   * TRAVERSAL SEAM (web research 86): the traversal moves' factory, called for each new mover (a map's ground); the
   * moves drive the mover (`Walker.driver`), the clip, the camera's root and peek, and the facing while they run.
   */
  useTraversal(factory: ((walker: Walker, ground: GroundData) => TraversalHooks) | null): void {
    this.traversalFactory = factory;
    this.moves = null;
    if (this.walker) this.attachMoves(this.walker);
  }

  /** TRAVERSAL SEAM: the moves on the current mover, or null (no factory, no ground, not yet walked). */
  traversal(): TraversalHooks | null {
    return this.moves;
  }

  /**
   * DOORS (`./doorPage`): the map's own action, asked first -- a door under the reticle takes the press, as the game's
   * action button takes a `CZAction` in reach before anything else (`FUN_00592d50`, decomp 452002-452022); true when
   * it did. The press then goes neither to the moves nor on the command (the door rides its own event).
   */
  private actionFilter: (() => boolean) | null = null;
  setActionFilter(filter: (() => boolean) | null): void {
    this.actionFilter = filter;
  }

  /**
   * PARITY-1 D02 (research 251 s6): the still reload's clip the mover does not carry (`./stillReloadLife`, the room's
   * `reloadLife` on the page's clock) -- told each tick after it ran, asked at a jump press: `FUN_0057e1b0` refuses the
   * jump under a one-shot on top (D:L440805-440810). A new mover drops it (the room's spawn clears its life). PAR-82: its
   * `family` (`StillReloadLife.family`), which a landing (`landingPops`) and the mover's take-off (`holdCovered`) ask.
   */
  private stillClip: { ran(count: number, w: Walker): void; lives(count: number): boolean; end(): void; family?(): ReloadItem | null } | null = null;
  setStillClip(clip: { ran(count: number, w: Walker): void; lives(count: number): boolean; end(): void; family?(): ReloadItem | null } | null): void {
    this.stillClip = clip;
  }

  /** XR-06: a cancel taken since the last command: that command carries no `ActionHeld` (`cancelAction`). */
  private actionCancelled = false;
  /**
   * XR-06 (research 214 s4; a port rule: a cancel is never a release): the action button's hold cancelled -- the blur, a
   * menu, the ARMORY, a pad lost, a death, a touch taken by the system (`./actionContext`). The moves let the hold go
   * (`holdAction(false)`: no slide from a ladder's head), and the next command carries no `ActionHeld`, so the room's
   * plant or defuse count goes back to 0 (`FUN_00594600` D:L453260-453294: the counter resets without the button). No press
   * is made: the release that a cancel stands for fires nothing.
   */
  cancelAction(): void {
    this.actionCancelled = true;
    this.actionWaits = false;
    (this.moves as { holdAction?: (on: boolean) => void } | null)?.holdAction?.(false);
  }

  /** TRAVERSAL SEAM: the action button (the ladder's slide, the climb): false when not walking. */
  action(): boolean {
    if (this.walking && !this.locked && this.actionFilter?.()) return true;
    // A swap or a stance already taken this tick: the player update fires the Action before both (D:L453218-453243), so
    // it waits for the next tick, as the room will read it there (`tap`).
    if (this.walking && (this.tickPresses & (Button.Swap | Button.Stance)) !== 0) { this.actionWaits = true; return true; }
    if (this.walking) { this.pressed |= Button.Action; this.tickPresses |= Button.Action; }   // MULTIPLAYER: also the respawn's press (research 91 §4.1)
    if (this.locked || !this.walking || !this.moves) return false;
    this.moves.action();
    return true;
  }

  /**
   * RSP-8 (research 354): the dead controller's accepted fresh respawn press, already gated by NetPage. Queue only
   * the existing wire bit: no living context filter, traversal action or deferred swap/stance action runs here.
   */
  queueRespawnAction(): boolean {
    if (!this.walking || !this.dead) return false;
    this.pressed |= Button.Action;
    this.tickPresses |= Button.Action;
    return true;
  }

  /**
   * TRAVERSAL SEAM: the lean buttons, held: -1 left, 1 right, 0 neither. Locked or dead the mover takes no press, the
   * lean's with the rest (the dead's controller `FUN_00592560` L451642-451730 reads the respawn press alone).
   */
  lean(side: -1 | 0 | 1): void {
    this.leanSide = this.walking && !this.locked && !this.dead ? side : 0;
    this.moves?.lean(this.leanSide);
  }
  /** The lean last held (`lean`): read again after a stance press pops a peek (`setStance`, PF-20). */
  private leanSide: -1 | 0 | 1 = 0;
  /**
   * A test-room instrument (`__viewer.setPeek`). While set, the third-person camera uses this peek and ignores the
   * traversal's, including a lean the side ray refused. Null: the game's eased peek. A browser adaptation; it changes
   * no behaviour until something sets it.
   */
  peekPin: number | null = null;
  /** PF-20: a stance press this tick went to the peek: the tick's later stance presses go there too (`setStance`). */
  private peekPressTick = false;

  private attachMoves(w: Walker): void {
    const m = this.traversalFactory && this.ground ? this.traversalFactory(w, this.ground) : null;
    this.moves = m;
    w.driver = m;
    // PAR-28 (research 251 s12.2): a climb's start and a ladder's mount pop the stack -- on the command whose tick lays them.
    const heard = m as (TraversalHooks & { on?: (l: (e: { type: string }) => void) => () => void }) | null;
    if (heard?.on && !this.popsHeard.has(heard)) {
      this.popsHeard.add(heard);
      heard.on((e) => {
        if (this.moves !== heard) return;
        if (e.type === 'climbStart') { this.climbFrom = this.taps + 1; this.stackPopped('climb', this.ticks_ + 1); }
        else if (e.type === 'ladderMount') this.stackPopped('ladder', this.ticks_ + 1);
      });
    }
    // PAR-82 (research 251 s12.3): the fall covers no hold standing in for `Rifle m203 reload` (`fallCovers`), as the room's.
    w.holdCovered = () => { const f = this.stillClip?.family?.() ?? null; return f === null || fallCovers(f); };
    w.climbLock = () => this.climbLocked();                      // NU-1b B1: the offer's refusals the mover does not carry
    w.pistolHand = () => this.weapon_ === 1;                     // LATER 509: the hand, for the gate's throw term
    w.launcherSetOn = () => this.launcherSetOn();                // LATER 504: the launcher's set kneels the mover
    w.oneShotOnTop = () => this.oneShotOnTop();                  // LATER 512c: a stance request waits under the flinch's slot
    w.pushedOnTop = () => this.pushedTop();                      // the door-open body hold: the push's clip holds the body
    if (!this.heard.has(w)) {                                    // PAR-19: every mover the walk makes is heard (`onActionEnd`)
      this.heard.add(w);
      w.onActionEnd((e) => { if (this.walker === w) for (const f of [...this.actionEnds]) f(e); });
    }
  }
  private readonly heard = new WeakSet<Walker>();
  private readonly actionEnds = new Set<(end: ActionEnd) => void>();
  /** NU-1b review F2: the command the moves' last climb began on (`climbStart`, the commands' seqs), null none heard. */
  private climbFrom: number | null = null;

  /**
   * NU-1b B1 (research 313 section 1.3; `./traversal` `CLIMB_OFFER_GATE_READING`): `Walker.climbLock` on the page, asked
   * in the tick of command `ticks_ + 1` -- the reload lock's parts the mover does not carry (`FUN_005a7ab0`,
   * `FUN_005b4340(actor, 2)` D:L469416: the standing still clip's life, the firearm's clips and the after-shot's timer,
   * `setReloadLock`, and the reload's delay timer, `CLIMB_LOCK_RELOAD_DELAY_READING` -- on this tick's command, LATER 72),
   * the launcher's anim set on the commands' seqs (D:L469470-469472) and the turret's (`setMountPose`, D:L469473-469474):
   * the room's mover asks its own (`room.ts`).
   */
  private climbLocked(): boolean {
    // LATER 220's last head: `FUN_005b4340(actor, 2)` asks `FUN_005a7980` (D:L469412), whose second layer holds the
    // stick's moving lower (D:L462494-462495) -- the air too.
    return (this.stillClip?.lives(this.ticks_ + 1) ?? false) || (this.reloadLock?.(this.taps + 1) ?? false)
      || flinchOnTop(this.launcherSet, this.taps + 1) || (this.mountPose !== null && this.mountPose() !== null)
      || this.taps + 1 < this.launcherMovingUntil;
  }

  /**
   * NU-1b B1: the firearm's reload lock (`./fire` `Fire.reloadLocked`, `FUN_005a7ab0`), for the climb's offer
   * (`climbLocked`); `./matchFirearm` sets it. Null: none.
   */
  setReloadLock(lock: ((cmd: number) => boolean) | null): void {
    this.reloadLock = lock;
  }

  /**
   * LATER 220 (research 369; `./net/actionGate`): the action prompts' common gate shut on the command a door's, a
   * switch's or a mount's ask names (the walk's last, `taps`: `lastSeq()`; the review's F2, as LATER 221's mount) -- the
   * kit's lock there (`setReloadLock`, `Fire.reloadLocked`: the press's window in commands), the walker's top after it
   * (`Walker.gateTop`, the hand's), or the stick's moving lower on the command after it (`launcherMovingUntil`, term 6
   * directly, D:L462494-462495); the room asks the same (`room.ts` `actionGateShut`). `./actionWiring` offers no door,
   * switch or mount then.
   */
  actionGateShut(): boolean {
    return (this.reloadLock?.(this.taps) ?? false) || this.taps + 1 < this.launcherMovingUntil
      || (this.walker?.gateTop(this.weapon_ === 1) ?? null) !== null;
  }
  private reloadLock: ((cmd: number) => boolean) | null = null;

  /**
   * NU-1b B5 (research 313 sections 5 and 8.1; `./traversal` `CLIMB_RELOAD_REFUSED_READING`): a climb's clip or the hang
   * holds the walk's mover now (`climbHoldsBody` of the move's clip) -- `./fire` `FireSource.climbHolds`, which refuses a
   * reload's start then (`FUN_005b4340(actor, 3)` D:L477404).
   */
  climbHolds(): boolean {
    return this.walking && climbHoldsBody(this.moves?.pose()?.clip);
  }

  /**
   * PAR-28 (research 251 section 12; `./stillReloadLife` `StackPop`): hears each pop of the body's stack that can take a
   * reload's clip, with the command it falls on -- a knock laid (`knock`, the last command run), a climb's start and a
   * ladder's mount (the moves' `climbStart` / `ladderMount`, the command whose tick laid them), a landing that plays a
   * clip, or (PAR-82) any landing under the m203's still clip (`landingPops`, the command it landed on) -- whichever
   * mover it is now. The room lays the same pops on its mover (`room.ts` `endStillReload`). Returns the unsubscribe.
   */
  onStackPop(listener: (pop: StackPop, count: number) => void): () => void {
    this.stackPops.add(listener);
    return () => { this.stackPops.delete(listener); };
  }
  private readonly stackPops = new Set<(pop: StackPop, count: number) => void>();
  private stackPopped(pop: StackPop, count: number): void {
    // LATER 363's review F1: a knock, a climb's start and a ladder's mount pop the stack to its base (`FUN_0058a4d0`
    // D:L440997, `FUN_00580b70` D:L442186-442214, `FUN_0057f880` D:L441547-441558): a flinch a door push covered goes with
    // it, as in the room. A landing with a clip under the push is `flinchDown`'s (`endFlinch`); a landing's pop here is the
    // still clip's (PAR-82: any landing under the m203's), which takes no base.
    if (pop !== 'landing') this.flinchUnder = null;
    // LATER 560: a climb's start or a ladder's mount pops the flinch on top as well -- marked for the command's step
    // (`flinchRan`, a re-run's relogged entry: `basePopStep`), after the presses this command asked under it.
    if (pop === 'climb' || pop === 'ladder') this.basePopped = true;
    for (const f of [...this.stackPops]) f(pop, count);
  }
  /** LATER 560: a climb's start or a ladder's mount heard in the tick now running, not yet laid on its `cutLog` entry. */
  private basePopped = false;
  /** LATER 560: the mark read and cleared (`basePopped`), for the command just run. */
  private takeBasePop(): boolean {
    const p = this.basePopped;
    this.basePopped = false;
    return p;
  }
  /** PAR-28: the moves already heard (a factory may hand the same moves to a new mover). */
  private readonly popsHeard = new WeakSet<object>();
  /** PAR-28: the mover's last landing a pop was asked of (`Walker.landing`: a new record each landing). */
  private poppedLanding: object | null = null;

  /**
   * PAR-19 (research 251 section 4.2): hears every end of a body owner or the overlay on the walk's mover, whichever
   * mover it is now (a respawn makes a new one) -- `Walker.onActionEnd` with its reason. The page's clocks that outlive
   * the mover's end on it: the reload's (`./fire` `reloadEndOfBody`), the throw's pose (`./throwPose` `throwPoseEnds`).
   * Returns the unsubscribe.
   */
  onActionEnd(listener: (end: ActionEnd) => void): () => void {
    this.actionEnds.add(listener);
    return () => { this.actionEnds.delete(listener); };
  }

  /** LATER 414: the stance word's one-time bit, read and cleared (`Walker.takeStanceTaken`); false off the walk. */
  takeStanceTaken(): boolean {
    return this.walking && this.walker ? this.walker.takeStanceTaken() : false;
  }

  /** The mover's stance (W2.2b): what `C` and the touch button change and the hook reads. */
  stance(): Stance {
    return this.stance_;
  }

  /** LATER 492: what the water allows the stance press now (`../stanceButton` `pressInWater`); null off the walk. */
  stanceAllows(): { crouch: boolean; prone: boolean } | null {
    return this.walking && this.walker ? this.moves?.stanceAllows?.(this.walker) ?? null : null;
  }

  /**
   * PAR-19 (research 251 section 2): the stance the button's next press toggles from -- the request still pending
   * (`Walker.pendingStance`: a press refused while a full-body one-shot owns the body), else the stance. The original's
   * press reads the request `actor+0x374`, not the stance (`FUN_00594cf0` D:L453351-453354, D:L453380-453384), so a
   * second tap during a crouched reload takes the first one back.
   */
  stanceIntent(): Stance {
    return (this.walking ? this.walker?.pendingStance : null) ?? this.stance_;
  }

  /** OT.R67: the stance mode the stance buttons run in (`PRONE_POP_ADAPTATION` until the page sets one). */
  stanceMode(): StanceMode {
    return this.stanceMode_;
  }

  /** OT.R67: the browser's controller setting laid on the walk; a change forgets the `C` and touch C presses under way. */
  setStanceMode(mode: StanceMode): void {
    if (mode === this.stanceMode_) return;
    this.stanceMode_ = mode;
    this.onBlur();
    this.stanceTouchHeld = false;
    this.stanceTouchPressed = false;
    this.stanceTouchButton.reset();
  }

  /**
   * OT.R76: the motion a pop's window rides -- the running dive (`Traversal`'s own dive, by identity), else the mover's
   * drop to prone (`standToProne` / `crouchToProne`, not reversed), on this mover; null for none, off the walk, locked
   * or dead. The window is the motion's own life: no timer of the page's.
   */
  private popMotion(): { mover: Walker; token: object } | null {
    const w = this.walker, m = this.moves;
    if (!this.walking || this.locked || !w || w.dead) return null;
    const dive = m?.inDive?.() ? (m as unknown as { diving: object | null }).diving : null;
    if (dive) return { mover: w, token: dive };
    const a = w.action;
    return a && !a.reversed && (a.name === 'standToProne' || a.name === 'crouchToProne') ? { mover: w, token: a } : null;
  }

  /**
   * OT.R76 (`../stanceButton` `TRIANGLE_SQUARE_POP_ADAPTATION`): a stance press's prone (the stance button's hold, the
   * Prone bind's press) -- the ordinary `setStance('prone')`; when it starts a new drop or dive, the pop's window opens
   * on it. A prone asked from anywhere else (`setStance`) opens none.
   */
  pronePress(): boolean {
    const prior = this.popMotion();
    const took = this.setStance('prone');
    const next = this.popMotion();
    this.popArm = took && next && !(prior && prior.mover === next.mover && prior.token === next.token) ? next : null;
    return took;
  }

  /** OT.R76: the pop's window closed -- a fresh stance press (`../stanceButton`), a menu frame (`./matchLanes`). */
  disarmPop(): void {
    this.popArm = null;
  }

  /**
   * OT.R76: the jump button's fresh press (the pad's and the touch's Jump lane, `./matchLanes`; the keyboard's Space) --
   * inside the pop's window (its motion still the one it opened on, on the same mover) the pop (`popStance`: its command
   * code, the 260 ms rise, the headroom), else the native jump. The window closes either way. True when either acted.
   */
  jumpPress(): boolean {
    const arm = this.popArm, now = this.popMotion();
    this.popArm = null;
    if (arm && now && arm.mover === now.mover && arm.token === now.token) {
      const out = this.popStance();
      if (out === 'dive' || out === 'drop') return true;
    }
    return this.jump();
  }

  /**
   * OT.R67 (`../stanceButton` `PRONE_POP_ADAPTATION`, `popStance`): the prone-pop on the walk's mover -- a pop taken is
   * the command's stance press with the code `'pop'` (`COMMAND_STANCE_CODES`), which the room runs by the same rule;
   * refused, or none here, nothing is sent (the machine then asks the ordinary stance, `setStance`).
   */
  popStance(): PopOutcome {
    const w = this.walker;
    if (!this.walking || this.locked || !w) return 'refused';
    const out = popOnMover(w, this.moves);
    if (out === 'dive' || out === 'drop' || out === 'prone') {
      this.pressed |= Button.Stance; this.pressedStance = COMMAND_STANCE_CODES.indexOf('pop'); this.tickPresses |= Button.Stance;   // MULTIPLAYER
      this.stance_ = w.stance;
    }
    return out;
  }

  /**
   * Sets the stance, walking or not; false, and nothing changes, for a name that is not one. Walking, it is the game's
   * change (`Walker.changeStance`: a transition clip holds the mover while it plays).
   */
  setStance(stance: Stance): boolean {
    if (!STANCES.includes(stance)) return false;
    if (this.locked && this.walking) return false;
    if (this.walking) { this.pressed |= Button.Stance; this.pressedStance = STANCE_CODES.indexOf(stance); this.tickPresses |= Button.Stance; }   // MULTIPLAYER
    if (this.walking && this.walker && this.moves?.busy()) return this.moves.stanceButton(this.walker, stance);   // TRAVERSAL SEAM
    if (this.walking && this.walker && this.moves && (this.peekPressTick || this.moves.peeking())) {
      // PF-20: under a held peek the press ends the peek, no transition, the stance kept (`Traversal.stanceButton`); the
      // lean is read after the stance (D:L453431-453458, `ROOM_LEAN_ORDER_READING`), as the room's `MoverSim.prepare`.
      // A second press in the same tick is the same command's one press (its stance code the last): the peek's too.
      const took = this.peekPressTick || this.moves.stanceButton(this.walker, stance);
      this.peekPressTick = true;
      this.moves.lean(this.leanSide);
      return took;
    }
    if (this.walking && this.walker && stance === 'prone' && this.stance_ !== 'prone' && this.moves?.dive(this.walker)) {   // TRAVERSAL SEAM: the dive
      this.stance_ = 'prone';
      return true;
    }
    this.stance_ = stance;
    if (this.walker) {
      if (this.walking) { this.walker.changeStance(stance); this.stance_ = this.walker.stance; }   // deep water: the game's fallback (#22)
      else this.walker.stance = stance;
    }
    return true;
  }

  /**
   * The touch C button (`./touch` `attachTouchControls`), the PC's `C` rule (owner, 2026-09-29; `KEY_STANCE`): a tap
   * toggles stand and crouch (prone to crouch), a hold of `STANCE_HOLD_S_PLACEHOLDER` goes prone; acted on in `frame`.
   * A press is taken only while walking, a release always; a cancel forgets the press, so it is no tap.
   */
  stanceTouch(event: 'down' | 'up' | 'cancel'): void {
    if (event === 'down') {
      if (!this.walking || this.menuHeld) return;
      this.popArm = null;                                          // OT.R76: a fresh touch C closes the window at its press
      this.stanceTouchHeld = true;
      this.stanceTouchPressed = true;
    } else if (event === 'up') {
      this.stanceTouchHeld = false;
    } else {
      this.stanceTouchHeld = false;
      this.stanceTouchPressed = false;
      this.stanceTouchButton.reset();
    }
  }

  /**
   * The R2 inventory open or closed (`./inventoryMenu`): the open sets the controller's mode byte `ctrl+0x221` to 1
   * (`FUN_0021c6f0` L72835), and the player update runs no Jump (L453208-453217) and no stance block (L453331-453430)
   * until the close clears it (`FUN_0021aaa0` L72009) -- so while it is open the development keyboard's C and Space and
   * the touch C take nothing, and a press under way as it opens is forgotten (its release no tap).
   */
  holdForMenu(on: boolean): void {
    if (on === this.menuHeld) return;
    this.menuHeld = on;
    if (!on) return;
    this.popArm = null;                                          // OT.R76: a menu closes the pop's window
    this.onBlur();
    this.stanceTouchHeld = false;
    this.stanceTouchPressed = false;
    this.stanceTouchButton.reset();
  }

  /**
   * A map's ground and a point on the floor at its spawn A, or none: `main.ts` passes A's (x, z) at the opening
   * stand's floor (W1.4b, `./stand`), A's recorded y where the probe found none. A mover already walking is stood
   * again on the new map, under wherever the page has put the camera; with nothing to stand on it goes back to flying.
   */
  setGround(ground: GroundData | undefined, spawn: [number, number, number] | null, grid: Grid | null = null): void {
    this.ground = ground;
    this.hullGrid = grid;
    this.walker = null;
    this.forgetKept();                                           // PAR-37: a new mover
    this.player = null;
    this.deathKept = null;                                       // LATER 496: a new map ends the last death's camera
    this.spawn = spawn;
    if (!this.walking) return;
    if (this.stand()) this.restart();
    else this.leave();
  }

  // ---- MULTIPLAYER (web sprint 3, W3.R8) ----

  /**
   * The net client's tap: each tick's command (numbered by the client) and the feet it predicted; null to stop. `sent` is
   * the number the client gave its last command (`NetWalk.setNetTap`): the walk's next tick is `sent + 1`.
   */
  setNetTap(tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null, sent = 0): void {
    this.netTap = tap;
    this.pressed = 0;
    this.taps = sent;
    this.lookLog.clear();                                        // a new numbering: the facing's replay starts afresh
    this.frameTicks = []; this.lastTick = null;                  // LATER 338 (review F3): no tick of the old numbering names a round
    this.forgetKept();
  }

  /** PAR-37: a new mover or a new numbering: no kept command reaches it, and no run under a dance waits. */
  private forgetKept(): void {
    this.kept.length = 0;
    this.cutLog.length = 0;                                      // PAR-60: the flinch's cut axes, by the old numbering
    this.mountTook = null;                                       // LATER 524: the take's M, by the old numbering
    this.takeKept = null;                                        // LATER 525: and what the take ended
    this.danceReplay = null;
    this.danceHeard = null;
    this.danceStopAt = null;
    this.pressedHoldPeriod = undefined;
    this.pressedHoldPass = undefined;
    this.pressedLauncher = null;                                 // PAR-84
    this.knockedAfter = -1;
    this.flinchLaid.clear();                                     // LATER 551: by the old numbering
  }

  /** The trigger held (the body's fire pose on the other screens). */
  setTrigger(on: boolean): void {
    this.trigger_ = on;
  }

  /** Dead or spectating: the mover takes no stick and no presses (the Action press still goes to the server). */
  setLocked(on: boolean): void {
    this.locked = on;
    if (!on) { this.mountTook = null; this.takeKept = null; }    // LATER 524, 525: the turret's hold let go (`./matchActions`): the take is over
  }

  /**
   * The page's own death clip (`./remotePlayers` `deathPose`), or null when alive. Either way a flinch is ended: the
   * death's (`FUN_005a2690`'s kind-8 branch, L459978, plays the death clip instead), the spawn's, a close's or a drop's.
   */
  setDeathPose(pose: (() => TraversalPose | null) | null): void {
    this.deathPose = pose;
    this.endFlinch();
    this.flinchLaidAt(this.taps + 1, false);                     // LATER 551: none from the next command
    this.mountTook = null;                                       // LATER 524: a death (the room releases first) or a spawn ends the take
    this.takeKept = null;                                        // LATER 525
  }

  /**
   * The page's own flinch (MATCH-FIX-2; research 91 section 21: the game plays it on the victim's own actor,
   * `FUN_005a54d0` L461401-461405 -> `FUN_005a2690` -> `FUN_00588bc0` L460019): `./remotePlayers` `flinchPose` at its
   * clock, or null. Drawn as a remote body's (`stepFlinch`): in place of the mover's play unless `FUN_005a2690` refuses
   * it (`./net/deaths` `flinchRefused`, FLINCH_GATE_READING; PF-21: a jump, a landing, a step-up and a stance transition
   * do not), whole-body (FLINCH_LAYER_PLACEHOLDER), dropped once played through or once refused; never over the death clip. The mover keeps the stick, the look and the trigger meanwhile. The
   * body is posed with it in the scope too (hidden): the muzzle (`./play` `muzzle`) and the posed root
   * (`setPosedRoot`) follow the clip in both views (FLINCH_LAYER_PLACEHOLDER).
   *
   * PAR-60 (research 230 section 5.2.1; PTW.R3 with `room.ts` `flinchCut`): `cut`, the room's window from the event
   * (`./net/flinchReload` `flinchCutWindow`), lets the page's own stick cut it as the room's mover does -- the first
   * command `FLINCH_CUT_COMMANDS` or more past the push whose cut axes after it ran are past 0.1 (`FUN_00550ef0`
   * D:L418180-418185; `reloadCutOf` on this mover, `flinchCutAt`) ends the flinch, the pose and `flinching()` with it.
   * The commands already run when the event arrives (a round trip after the hit) are read from `cutLog`: a cut among
   * them ends the flinch at once, and its command is answered (the room's window ends there: `./netPage`'s undo reads
   * it); null when none. Without `cut` (an older room's event) nothing cuts the flinch but its clock.
   *
   * PAR-65 (research 230 section 5.2.4; PTW.R3 with `room.ts` `flinchLanding`): a flinch the room pushed while this body
   * was in the air (after the command before the window's start) is covered by the fall: not drawn, its window left as
   * told, until the command the body is back on the floor (`./net/flinchReload` `flinchLanded`) -- a landing with no
   * clip hands it back whole from that command, its window, `flinching()` (on the commands from there, the room's) and
   * its stick's cut with it; any other way down ends it. When that command has already run as the event arrives, the
   * answer is the window's end the page's commands give (the cut's command, or the landing's plus the clip, or the
   * landing's own) wherever it differs from the event's: `./netPage`'s undo reads it as the window's end.
   *
   * PAR-71 (research 230 section 5.2.4, "PAR-71"; PTW.R3 with `room.ts` `flinchLanding`): a flinch pushed on the floor is
   * covered by the fall at the first command its body runs in the air inside its window (`./net/flinchReload`
   * `flinchCovered`), at the phase it reached, and handed back by a clipless landing with the commands it had left
   * (`flinchLanded`). The commands already run are replayed from `cutLog` through the step each tick takes
   * (`flinchStep`), so a cut, a cover and a landing among them are taken in their order.
   */
  setFlinchPose(pose: (() => TraversalPose | null) | null, cut: FlinchCut | null = null, opts: FlinchOpts = {}): number | null {
    // NU-1b B7 (`./traversal` `CLIMB_HIT_CANCELS_READING`): the flinch taken pops a running climb first (FUN_005a2690
    // D:L460018-460019), as the room's `flinch` pops its mover's. NU-1b's review F2: the room popped the climb its mover
    // ran at the hit -- after command `cut.start - 1` -- so a climb this page began after it (heard a round trip later)
    // stands; with no window told (an older room) or no start heard, the pop as before. A program's push (`pushed`,
    // DOORS) has no such pop: `ai::ANIMATE` pushes through `FUN_00588bc0` alone (D:L487256-487260).
    const begun = this.climbFrom;
    // LATER 524 (research 215 section 8.6, "The flinch at the take"; PTW.R3 with `room.ts` `takeMount`'s LATER 523): a play
    // the room pushed before the turret's take (its push, `cut.start`, before the take's M) and this page hears after the
    // take (taken at send time, `mountTake`) was popped by it -- `FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` (D:L447984)
    // pops every play (D:L446796-446798) -- and the room cut its window at M: here too its window ends at M (or before, by
    // the commands already run), and nothing of it is drawn or kept (no pose, no clock, no refusal; no climb pop, no cover:
    // the take popped those). Its end is answered for `./netPage`'s undo. A push at or after M is kept as before: the room
    // holds a flinch pushed after the take, and whether the original flinches a mounted body is unread. No window (an older
    // room's event): nothing to compare, as before. The room tells its events in order, so none of a play pushed after M
    // is open when this one arrives.
    const took = this.mountTook;
    const heard = cut?.until;
    const popped = pose !== null && cut !== null && took !== null && cut.start < took;
    // LATER 525: kept as heard, for the room's refusal of the take to run it uncut (`mountUntake`).
    // LATER 526 (step 5; research 92 section 4, LATER 363): a door push at or after M (`pushed`) supersedes nothing -- the
    // room never took, so its push covered the flinch the take ended here, open at its first command: kept as heard, with
    // the command it was heard after, for the refusal to lay it over that flinch (`mountUntake`). Was: dropped the flinch.
    // LATER 549's review F1: a flinch pushed at or after M stands on the page as in the room, and is kept as heard too: the
    // refusal lays it at its own first command (`cut.start`), where its pop to the base (`FUN_005a2690` -> `FUN_0058a4d0`
    // D:L460018-460019) replaced the room's flinch -- the take's kept one stands before it, its window asked on the
    // commands of the wait up to there. Was: it dropped what the take kept, and the refusal's re-run, not stepped, asked the
    // slot the take had ended (`endFlinch`) on every command before it. An event with no pose or no window still drops it.
    const kept = this.takeKept;
    // LATER 525 (a): each event heard while the take stands, as heard, for a re-key on the room's later take (`mountRekey`).
    if (kept) kept.log.push({ pose, cut: cut ? { ...cut } : null, opts });
    if (kept && popped) kept.heard.push({ pose, cut: cut!, opts, taps: this.taps });
    else if (kept && kept.flinch && pose && cut) kept.heard.push({ pose, cut, opts, taps: this.taps });
    else if (kept) { kept.flinch = null; kept.heard.length = 0; }
    if (popped) cut = { ...cut!, until: Math.min(cut!.until, took!) };
    // LATER 363 (research 92 section 4, "A flinch under the push"; PTW.R3 with `room.ts` `flinchUncover`): a push over the
    // own flinch still open at its first command covers it, not pops it -- kept for the push's pop to hand back. A flinch
    // pops the stack to its base first (`FUN_0058a4d0` D:L460018): nothing stays under it.
    const open = this.flinchCut;
    if (!opts.pushed || popped) this.flinchUnder = null;
    else if (pose && cut && this.flinchGates && open && open.until > cut.start) this.flinchUnder = { cut: { start: open.start, until: open.until }, at: cut.start, pose: this.flinchPose };
    if (pose && !popped && !opts.pushed && this.walking && this.walker && (cut === null || begun === null || begun <= cut.start - 1)) this.moves?.flinchPop?.(this.walker);
    this.flinchPose = pose;
    this.flinchPushed = !!pose && !!opts.pushed;
    // The door-open body hold (research 92 section 2, "The body under the door clip"): a push of a door's clip holds the
    // body while its window is on top (`pushedTop`), as the room's mover holds it (`room.ts` `watchMoves`).
    this.flinchHold = pose && opts.pushed && opts.clip !== undefined && isPushedClip(opts.clip) ? opts.clip : null;
    // #485's review F2: whether this window refuses a reload at all -- a flinch's does (its motion flag 0x4), a program's push
    // does not -- so a hand-back by a clipless landing (`flinchDown`) does not turn the refusal on for the push.
    this.flinchGates = opts.reloadGate !== false;
    // DOORS (research 92 section 2): a one-shot pushed by a map program's `ai::ANIMATE` (`Open door`) is drawn and cut
    // as the flinch is -- its `NoInterrupt` in the window's `cutFrom` -- but `FUN_00588bc0(actor, type, stance, 0, 0)`
    // sets no motion flag 0x4 (the flinch's `FUN_005a2690` does, D:L460021-460024), and the reload's refusal reads the
    // top motion's flag (`FUN_005b4340` D:L469494-469504), which the push now is: `reloadGate` false ends `flinching()`,
    // a flinch's still open with it (the room ends its window at the push the same way, `room.ts` `doorMotion`).
    this.flinchClock = opts.reloadGate === false ? null : pose;
    this.flinchCut = pose ? cut : null;
    this.flinchAir = -1;
    this.flinchBack = false;
    this.flinchEnded = null;
    const told = this.flinchCut;
    if (!told) { this.flinchLaidAt(this.taps + 1, false); return null; }   // LATER 551: none from the next command
    // The body after the command before the push: the walker's own when that is the last run (as the room reads it at the hit).
    const before = this.taps === told.start - 1 ? this.walker?.airborne ?? false : this.cutLog.find((e) => e.seq === told.start - 1)?.air ?? false;
    if (before) this.flinchAir = told.start;                      // PAR-65: pushed in the air, covered from its first command
    // LATER 551: laid before its first command, for a re-run; a push that covers (review F2: its cover read again there).
    this.flinchLaidAt(told.start, true, false, !!opts.pushed && !popped);
    // LATER 549: inside a re-run (`rerunAt`), only the commands it has run again; each command's slot kept (`flinchLogStep`).
    const upTo = this.rerunAt ?? Infinity;
    for (const e of this.cutLog) if (e.seq >= told.start && e.seq <= upTo) this.flinchLogStep(e);
    const w = this.flinchCut as FlinchCut | null;
    if (popped) {
      // LATER 524: the window's end on the commands already run (a cut, a way down, a hand-back's end), at M at the latest.
      // The review's F1: a window handed back by a landing (105..125) and ended by the replay is clamped to M as well.
      const end = w ? Math.min(w.until, took!) : Math.min(this.flinchEnded ?? took!, took!);
      this.endFlinch();
      // LATER 551's review F1: the replay above wrote the clamped window, still standing, into the flinch kept after each
      // command from M (`flinchLogStep`); the room's take popped it at M. Each is rewritten with the flinch ended, so a
      // re-run from a command at or after M (a knock's, a dance's) lays none back. (Bounding the replay to M - 1 instead
      // would leave what an earlier judgement against an earlier M wrote there: `mountRekey` judges each event again.)
      const ended = this.flinchNow();
      for (const c of this.kept) if (c.seq >= took! && c.seq <= upTo) c.flinch = ended;
      this.flinchLaidAt(took!, false, true);                      // LATER 551: the take's pop at M, after this window
      return end !== heard ? end : null;
    }
    if (!w) return this.flinchEnded !== told.until ? this.flinchEnded : null;
    if (this.flinchAir >= 0) return null;                         // still in the air: the event's window stands for now
    return w.until !== told.until ? w.until : null;
  }
  private flinchPose: (() => TraversalPose | null) | null = null;
  /** DOORS: the pose is a program's push (`setFlinchPose` `pushed`): `FUN_005a2690`'s gate (`flinchRefused`) is not asked of it. */
  private flinchPushed = false;
  /**
   * The door-open body hold: the pushed clip that holds the body while the window is on top (`setFlinchPose`'s `clip`),
   * or null. Kept apart from `flinchPushed`, which the drawing clears when it drops the pose (`snapshot`): the hold is the
   * window's, as the room's is.
   */
  private flinchHold: PushedClip | null = null;
  /** #485's review F2: the window refuses reloads (a flinch's), or not (a program's push: `setFlinchPose` `reloadGate` false). */
  private flinchGates = true;
  /** PAR-60: the playing flinch's window for the stick's cut (`setFlinchPose`), or null. */
  private flinchCut: FlinchCut | null = null;
  /**
   * PAR-81 (research 230 section 5.2.6; PTW.R3 with `room.ts` `Player.launcherSet`): the launcher's anim set on the body,
   * on the commands' seqs -- from the raise's own command (the one after the last sent, `taps + 1`) to the lower's end
   * (`playedOutCommand`; Infinity while up). The jump is refused inside it (`jump`). Null: none.
   */
  private launcherSet: { start: number; until: number } | null = null;
  /**
   * PAR-83 (research 230 section 5.2.8; PTW.R3 with `room.ts` `Player.launcherUp`): the launcher up -- the first command
   * its base is on top (`launcherBaseCommand`) and the firearm it came from -- for the stick's lower (`launcherStickRan`).
   * Null: none up, or lowered.
   */
  private launcherUp: LauncherUp | null = null;
  /** PAR-83: who hears the stick's lower (`onLauncherStickLower`). */
  private readonly launcherStickLowers = new Set<(from: LauncherFrom) => void>();
  /**
   * PAR-83, F1 of its review (PTW.R3 with `room.ts` `Player.movingLowerUntil`): the first command the stick's moving lower
   * no longer lives on -- the stick's command + `launcherMovingLowerCommands` -- before which `swapGate` refuses every take
   * and the swap (`FUN_005a8cb0` -> `FUN_005a7de0` -> `FUN_005a7980` D:L462492-462499). -Infinity: none.
   */
  private launcherMovingUntil = -Infinity;

  /**
   * PAR-81: the launcher raised now (`./matchThrow`'s `equip`, the room's `raiseLauncher` at the same `throw` event's seq,
   * the last command sent): its set from the next command -- the raise is pushed before the driver on its press's own
   * frame (`FUN_005a6d30` D:L462105), so the jump riding on that command is refused. A lower still under way keeps its
   * start. PAR-83: `from`, the firearm it comes from (its clip, `LAUNCHER_RAISE_CLIPS`), puts its base on top the command
   * after the raise's end, from which the stick lowers it (`launcherStickRan`).
   */
  launcherRaised(from: LauncherFrom = 0): void {
    const set = this.launcherSet;
    this.launcherSet = { start: set !== null && set.until >= this.taps + 1 ? set.start : this.taps + 1, until: Infinity };
    this.launcherUp = { base: launcherBaseCommand(this.taps, from === 1 ? LAUNCHER_RAISE_CLIPS.pistol : LAUNCHER_RAISE_CLIPS.rifle), from };
    this.launcherClip(from, false);                              // PAR-84: the body held through the raise
  }

  /**
   * PAR-84 (research 230 section 5.2.10; PTW.R3 with `room.ts` `raiseLauncher` / `launcherDown`): the raise's clip, or
   * reversed the still lower's, on the page's mover at the press -- as its swap starts (`swapWeapon`), before the tick of
   * the command it rides (`taps + 1`), where the room's `MoverSim.prepare` starts it from the clip it kept at the `throw`
   * event's seq + 1 -- and kept with that command (`KeptCommand.launcher`) for a run under a victory dance. The body stands
   * through it (`Walker.launcherClip`), and `swapGate` refuses every take while it plays (`Walker.swapping`).
   */
  private launcherClip(from: LauncherFrom, reversed: boolean): void {
    const w = this.walker;
    if (!this.walking || !w || this.locked) return;
    const clip: LauncherClip = { name: launcherClipName(from), reversed, at: this.taps + 1 };
    if (w.launcherClip(clip.name, clip.reversed)) this.pressedLauncher = clip;
  }

  /**
   * NU-5 X1 and research 324 P2 (`PICKUP_SWAP_OWN_LAG_READING`): the pick-up's `Swap rifle` on the page's own body --
   * `swapRifleExchange` after the room's `kit` shows a slot's weapon replaced, `swapRifleClaim` after it shows a
   * launcher claimed (`./takeKit`) -- started on the page's mover before the tick of the next command (`taps + 1`), kept
   * with it (`KeptCommand.launcher`), as the launcher's clips are. The body stands through it (`Walker.launcherClip`).
   * The launcher claim's only with no action on the body (the room's `PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER`).
   */
  pickupSwap(name: PickupClipName): void {
    const w = this.walker, claimed = this.claimedAt;
    this.claimedAt = null;
    if (!this.walking || !w || this.locked) return;
    if (name === 'swapRifleClaim' && w.action !== null) return;
    // NU-5 review F3: from the claim's command + 1, its clock caught up to the next command (`PICKUP_SWAP_OWN_LAG_READING`).
    const at = claimed !== null && claimed < this.taps ? claimed + 1 : this.taps + 1;
    const clip: LauncherClip = { name, reversed: false, at };
    if (w.launcherClip(clip.name, clip.reversed, (this.taps + 1 - at) * TICK)) this.pressedLauncher = clip;
  }

  /**
   * NU-5 review F3: the page's claim of a weapon sent now (`NetPage.pickup`: the `pickup` event at the client's last
   * command, `taps`) -- the command the room keeps the taker's `Swap rifle` after (`pickupSwap`). Told by
   * `./matchActions`' fire table when the claim is sent.
   */
  pickupClaimed(): void {
    this.claimedAt = this.taps;
  }
  /** NU-5 review F3: the command the last claim was sent at (`pickupClaimed`), till its `kit` (`pickupSwap`); null none. */
  private claimedAt: number | null = null;

  /**
   * PAR-81: the launcher lowered now to the firearm `from` (the room's `lowerLauncher`): the set goes at the raise's clip
   * reversed's end (`FUN_00582540` D:L443058-443062), on its `playedOutCommand`-th command from the next. PAR-84: that clip
   * holds the body (`launcherClip`) unless `held` is false (the swap's lower with the launcher up, `swapWeapon`).
   */
  launcherLowered(from: LauncherFrom, held = true): void {
    const clip = from === 1 ? LAUNCHER_RAISE_CLIPS.pistol : LAUNCHER_RAISE_CLIPS.rifle;
    this.launcherSet = { start: this.launcherSet?.start ?? this.taps + 1, until: this.taps + playedOutCommand(clip.playback, clip.frames) };
    this.launcherUp = null;                                      // PAR-83: down, the stick lowers nothing
    if (held) this.launcherClip(from, true);                     // PAR-84: the body held through the still lower
  }

  /**
   * LATER 203's review F1: the launcher's set on the body at the next command (`launcherSet`): from the raise through the
   * still lower's clip to its end (`FUN_005a60d0(.., 4)` from that clip's end, D:L438531-438536, D:L461770-461771); the
   * stick's lower gives it back at once (`launcherStickRan`). The page's Fire and aim weights read it (`./play`).
   */
  launcherSetOn(): boolean { return flinchOnTop(this.launcherSet, this.taps + 1); }

  /**
   * LATER 512c (research 92 section 4, "LATER 512c's reading"; PTW.R3 with `room.ts`, the room's mover's
   * `oneShotOnTop`): the flinch's slot -- the flinch, or a door's `Open door` over it, or the flinch it hands back at its
   * pop (`flinchCut`) -- on top on the command run now (`taps + 1`), read after the tick's pop (`[start, until)`): a stance
   * request waits under it (`Walker.oneShotOnTop`; `FUN_00552ec0` D:L418927-418930). Not while the fall covers it
   * (`flinchAir`): the fall's play is the top then.
   */
  private oneShotOnTop(): boolean {
    return this.rerunSlot ? this.rerunSlot() : this.slotAt(this.taps + 1);
  }

  /** LATER 512c, LATER 549: the flinch's slot as it stands now, read at command `seq` (`[start, until)`, not under the fall). */
  private slotAt(seq: number): boolean {
    const c = this.flinchCut;
    if (c === null || seq < c.start || seq >= c.until) return false;
    return !(this.flinchAir >= 0 && seq >= this.flinchAir);
  }
  /**
   * The door-open body hold (research 92 section 2, "The body under the door clip"; reading, pending review; PTW.R3 with
   * `room.ts`'s `watchMoves` hook): a door's push on top on the command run now -- the live `taps + 1`, or inside a re-run
   * the command its sim runs (`rerunSeq`) -- its window the slot `oneShotOnTop` reads (`slotAt`: `[start, until)`, not
   * under the fall), with its clip (`flinchHold`), the seconds since the window's start and whether that command may cut
   * it (`flinchCutAt`). `Walker.step60` holds the body on it; the window ends at the cut after the command (`flinchStep`).
   */
  private pushedTop(): PushedTop | null {
    const clip = this.flinchHold, c = this.flinchCut, seq = this.rerunSeq ? this.rerunSeq() : this.taps + 1;
    if (clip === null || c === null || !this.slotAt(seq)) return null;
    return { clip, t: (seq - c.start) * TICK, cuttable: flinchCutAt(c, seq) };
  }

  /**
   * The door-open body hold (PTW.R3 with `room.ts` `doorMotion`): the room's push heard on the page's own body (`./netPage`'s
   * `motion`, after `setFlinchPose` laid its window) a round trip after its first command -- the commands this page ran
   * since walked the body where the room's mover held it, so they run again from the state kept after the command before
   * the window (`rerunFrom`, the knock's and the dance's way: the flinch stepped on the re-run's own commands), and the
   * page stands where the room does instead of being pulled there by the reconcile. `replayed` hears the command run
   * after (the net client's predictions after it are the run's, `NetClient.replayed`). Nothing when the window starts on
   * the next command (the bare page's own press) or the record does not reach back (then the snapshots correct it).
   * True when it ran again.
   */
  pushHeard(cut: FlinchCut | null, replayed?: (after: number) => void): boolean {
    if (!cut || !this.walking || !this.walker || this.flinchHold === null) return false;
    const from = cut.start - 1;
    if (from >= this.taps || from < 0) return false;
    return this.rerunFrom(from, () => undefined, null, replayed, 'redone', { relog: true });
  }

  /**
   * LATER 549: while `rerunFrom` runs commands again, the slot's answer for the command its sim runs (`MoverSim.seq`) --
   * `oneShotOnTop` asks it in place of the live `taps + 1`. Null: no re-run.
   */
  private rerunSlot: (() => boolean) | null = null;
  /** The door-open body hold: inside `rerunFrom`, the command its sim runs (`MoverSim.seq`), for `pushedTop`. Null: no re-run. */
  private rerunSeq: (() => number) | null = null;
  /** LATER 549: inside a stepped re-run, the last command it has run again: `setFlinchPose` replays `cutLog` to it alone. Null: none. */
  private rerunAt: number | null = null;

  /** PAR-81: no launcher on the body -- a spawn's kit, as the room's spawn clears its `launcherSet`. */
  launcherCleared(): void {
    this.launcherSet = null;
    this.launcherUp = null;                                      // PAR-83
    this.launcherMovingUntil = -Infinity;                        // PAR-83, F1: nor its moving lower
    this.walker?.dropLauncherClip();                             // PAR-84: nor its raise's or lower's clip (a new body's)
    this.pressedLauncher = null;
  }

  /**
   * PAR-83 (research 230 section 5.2.8): `listener` hears the stick lower the launcher, with the firearm it goes back to
   * (`./matchThrow` puts the launcher away on it, sending the room nothing: the room lowers it from the same command's
   * stick, `room.ts` `launcherStick`). Returns the unsubscribe.
   */
  onLauncherStickLower(listener: (from: LauncherFrom) => void): () => void {
    this.launcherStickLowers.add(listener);
    return () => { this.launcherStickLowers.delete(listener); };
  }

  /**
   * PAR-83 (research 230 section 5.2.8; PTW.R3 with `room.ts` `launcherStick`): after the tick of command `taps`, with the
   * launcher up and its base on top (from `LauncherUp.base`), a move axis of that command's stick past 0.1
   * (`launcherStickLowers` of `Walker.cutStick`; not in the air nor on a landing's pop, `Walker.cutAsked`) lowers it, as
   * the ground driver's looped branch does (`FUN_00550ef0` D:L418263-418278): the set given back on this command, after
   * its jump's read (D:L418119-418150; `jump` asked `taps + 1` before the tick), so the next command's jump is taken.
   * [reading: `FUN_005a7ab0`'s refusal under the RPG's feed, `FUN_005b4b40`'s contact zero and the top's type (a one-shot
   * over the base lowers nothing: F2 of PAR-83's review) are not held here -- research 230 section 5.2.9,
   * `LAUNCHER_STICK_LOWER_READING`]
   */
  private launcherStickRan(w: Walker): void {
    const up = this.launcherUp, set = this.launcherSet;
    if (up === null || set === null || this.taps < up.base || !w.cutAsked || !launcherStickLowers(w.cutStick)) return;
    this.launcherUp = null;
    this.launcherSet = { start: set.start, until: this.taps };
    this.launcherMovingUntil = this.taps + launcherMovingLowerCommands(up.from);   // F1: the moving lower's life
    for (const f of [...this.launcherStickLowers]) f(up.from);
  }
  /**
   * PAR-60: each command's cut axes after its tick (`reloadCutOf`), by seq: the last `KEPT_COMMANDS`; PAR-65: the body in
   * the air after it, and a landing with no clip on it. LATER 549: `slot`, the flinch's slot on that command as last known
   * (the tick's own answer, rewritten when an event heard later is replayed over it, `flinchLogStep`), for a re-run.
   */
  private readonly cutLog: { seq: number; push: boolean; air: boolean; bare: boolean; slot?: boolean; pop?: boolean }[] = [];
  /**
   * PAR-65, PAR-71: the command from which the fall covers the flinch until the body is back on the floor -- its push's
   * first when pushed in the air, else the first command run in the air inside its window (a walk-off). -1: not covered.
   */
  private flinchAir = -1;
  /** PAR-65: the flinch handed back at a landing with no clip: `flinching()` is its window on the commands. */
  private flinchBack = false;
  /**
   * LATER 363: the own flinch a door push covered (`setFlinchPose` `pushed`) -- its window on the commands and the push's
   * first command (`at`), where it stopped advancing -- for the push's pop to hand back (`flinchUncover`). LATER 512: its
   * pose (`pose`), drawn again from there. Null: none.
   */
  private flinchUnder: { cut: FlinchCut; at: number; pose: (() => TraversalPose | null) | null } | null = null;
  /** PAR-65: the window's end where a way down popped the flinch (`flinchDown`); PAR-71: or its cut's command, or its end once handed back. */
  private flinchEnded: number | null = null;
  /**
   * LATER 524: the command M the turret's take named (`mountTake`), kept until the mount ends -- the hold let go
   * (`setLocked(false)`), a death or a spawn (`setDeathPose`), a new numbering (`forgetKept`). Null: none.
   */
  private mountTook: number | null = null;
  /**
   * LATER 525: what the turret's take ended on this page (`mountTake`), for the room's refusal of it (`mountUntake`): the
   * own flinch as it stood -- its pose, its push flag, its reload gate and clock, its window, its cover, the flinch a door
   * clip covered, the end its replay found -- with the command the take was sent after (`taps`); and each flinch event the
   * room pushed before M, heard after the take, as heard (`setFlinchPose`). `flinch` null: superseded by an event with no
   * pose or no window (LATER 549's review F1: one pushed at or after M is kept as heard, laid at its start at the refusal).
   * Null: no take standing (kept until the hold is let go, a death or spawn, a new numbering).
   * LATER 526: each heard event with the command it was heard after (`taps`), a door push at or after M among them while
   * the flinch is kept (LATER 549's review F1: and a flinch pushed at or after M); and the move under way as the take's
   * pop found it (`moves`: the moves it was kept from, and their state, `TraversalHooks.keep`), for the refusal to lay
   * back on the body re-run as the room ran it.
   */
  private takeKept: {
    taps: number;
    flinch: FlinchState | null;
    heard: { pose: (() => TraversalPose | null) | null; cut: FlinchCut; opts: FlinchOpts; taps: number }[];
    moves: { of: TraversalHooks; state: TraversalKept } | null;
    /**
     * LATER 525 (a): every flinch or push event heard while the take stands, as heard (its window uncut), in order -- for
     * the room's take on a later command than M (`mountRekey`) to judge them again against it.
     */
    log: { pose: (() => TraversalPose | null) | null; cut: FlinchCut | null; opts: FlinchOpts }[];
    /**
     * LATER 526's review F1: the state object kept after command M - 1 at the take (`KeptCommand.walker`). A replay during the
     * wait (a knock heard after a command before M - 1: `replayKnock` -> `rerunFrom`) writes every kept state after it anew,
     * so another object there is a body the moves kept at the take no longer belong to. Identity, not a counter: `rerunFrom`
     * and `keepDance` are the only writers, and each assigns a new `saveState()`.
     */
    anchor: KeptCommand['walker'] | null;
  } | null = null;

  /** The page's own flinch off the body: its pose, its clock (the reload's gate) and its cut. */
  private endFlinch(): void {
    this.flinchPose = null;
    this.flinchPushed = false;
    this.flinchHold = null;
    this.flinchGates = true;
    this.flinchClock = null;
    this.flinchCut = null;
    this.flinchAir = -1;
    this.flinchBack = false;
    this.flinchUnder = null;
  }

  /** LATER 551: the page's own flinch as it stands now. */
  private flinchNow(): FlinchState {
    return {
      pose: this.flinchPose, pushed: this.flinchPushed, gates: this.flinchGates, clock: this.flinchClock, cut: this.flinchCut,
      air: this.flinchAir, back: this.flinchBack, under: this.flinchUnder, ended: this.flinchEnded, hold: this.flinchHold,
    };
  }

  /** LATER 525, LATER 551: the page's own flinch laid as `s` holds it. */
  private flinchLay(s: FlinchState): void {
    this.flinchPose = s.pose; this.flinchPushed = s.pushed; this.flinchGates = s.gates; this.flinchClock = s.clock;
    this.flinchCut = s.cut; this.flinchAir = s.air; this.flinchBack = s.back; this.flinchUnder = s.under; this.flinchEnded = s.ended;
    this.flinchHold = s.hold;
  }

  /**
   * LATER 551 (research 92 section 4, "LATER 551"): what was laid on the page's own flinch between two commands, by the
   * command it was laid before (`at`), in the order laid -- a flinch or a push the room told (`told`: its first command,
   * `setFlinchPose`), the end a take or a death put to it (`take`: the turret's, `mountTake`), the flinch a refused take
   * handed back (`mountUntake`) -- each the state as it stood once laid, before the commands from `at` stepped it. A re-run
   * (`rerunFrom`) lays each again before its command, between the steps of the commands it runs again, as the room's
   * events and its take fell between its commands. Pruned with `kept`; cleared with a new numbering.
   */
  private readonly flinchLaid = new Map<number, { s: FlinchState; told: boolean; take?: boolean; cover?: boolean }[]>();

  /**
   * LATER 551: the flinch as it stands now, laid before command `at` (`flinchLaid`). `cover` (review F2): a told push that
   * covers (`setFlinchPose` `pushed`, not popped by a take), its cover read again from a re-run's flinch.
   */
  private flinchLaidAt(at: number, told: boolean, take = false, cover = false): void {
    const l = this.flinchLaid.get(at) ?? [];
    l.push({ s: this.flinchNow(), told, ...(take ? { take } : {}), ...(cover ? { cover } : {}) });
    this.flinchLaid.set(at, l);
  }

  /** LATER 551: the take's end laid before command `at` dropped (`mountRekey`, `mountUntake`: the room took elsewhere, or not). */
  private flinchUntake(at: number): void {
    const l = this.flinchLaid.get(at)?.filter((x) => !x.take);
    if (l?.length) this.flinchLaid.set(at, l);
    else this.flinchLaid.delete(at);
  }

  /** LATER 551: the command kept for `seq` (`kept`), or undefined. */
  private keptAt(seq: number): KeptCommand | undefined {
    const k = this.kept, c = k.length ? k[seq - k[0]!.seq] : undefined;
    return c?.seq === seq ? c : k.find((x) => x.seq === seq);
  }

  /**
   * LATER 363 (research 92 section 4, "A flinch under the push"; the original's rule, PTW.R3 with `room.ts`
   * `flinchUncover`): the push's pop at command `pop` -- its window's end, or the stick's cut -- takes one play off
   * (`FUN_00589aa0` D:L446479) and the covered flinch is the top again, its phase kept (`FUN_0028da00` D:L135098-135110)
   * and its flag 0x4 with it: handed back as at PAR-71's landing (`flinchLanded`), from `pop` for the commands it had left
   * at the push, at least one. LATER 512: drawn again too -- its pose's clock (`PhasedPose.at`) set to the commands it had
   * run at the push, plus those run since the pop when the push's event came after it (the review's F1); a pose with no
   * clock is not drawn. False: none covered.
   */
  private flinchUncover(pop: number): boolean {
    const u = this.flinchUnder;
    if (!u) return false;
    this.flinchUnder = null;
    // LATER 512 (research 92 section 4, "LATER 512's reading"): drawn again from the phase it reached at the push -- its
    // pose's clock (`PhasedPose.at`, the own flinch's: `./netPage`) set to the commands it had run, `at - start` -- as
    // the pop sets the covered play up again with its phase kept (`FUN_0028da00` D:L135098-135110).
    // The review's F1: a push event that arrived after its pop (replayed from `cutLog` in `setFlinchPose`) -- the flinch
    // has played on since the pop, so the clock is set past it by the commands run since (`taps - pop`).
    const pose = u.pose as PhasedPose | null;
    if (pose?.at) pose.at((u.at - u.cut.start + Math.max(0, this.taps - pop)) * TICK);
    this.flinchPose = pose?.at ? pose : null;
    this.flinchPushed = false;
    this.flinchHold = null;                                       // the flinch handed back holds no body
    this.flinchGates = true;
    this.flinchClock = null;
    this.flinchCut = flinchLanded(u.cut, pop, true, u.at);
    this.flinchAir = -1;
    this.flinchBack = true;
    return true;
  }

  /** PAR-65: the covered flinch at command `seq`, the body back on the floor (`bare`: a landing with no clip): handed back or popped. */
  private flinchDown(seq: number, bare: boolean): void {
    const w = flinchLanded(this.flinchCut!, seq, bare, this.flinchAir);
    this.flinchAir = -1;
    if (w.until <= seq) { this.flinchEnded = w.until; this.endFlinch(); return; }
    this.flinchCut = w;
    this.flinchBack = true;
  }

  /**
   * PAR-60: the tick `taps` ran -- its cut axes logged, and the flinch cut by them (`setFlinchPose`), as the room's
   * `flinchCut`. A command the room loses (past its gap wait, or a dropped backlog) is cut here and not there: the page's
   * cut then stands before the room's (review F1, a known gap under a degraded network: research 230 section 5.2.2).
   */
  private flinchRan(w: Walker): void {
    const e = { seq: this.taps, ...this.cutEntry(w, this.poppedLanding), pop: this.takeBasePop() };   // LATER 560: `pop`
    this.cutLog.push(e);
    if (this.cutLog.length > KEPT_COMMANDS) this.cutLog.shift();
    this.flinchLogStep(e);
  }

  /**
   * LATER 549: the slot on command `e.seq` kept in its entry (read before the step, as the tick read it), then the step.
   * LATER 560: a climb's start or a ladder's mount on the command (`e.pop`) ends the window at it first (`basePopStep`;
   * its review F1), as the room's `watchCut` does after the command (`basePopCut`) before the command's cut is asked; the
   * slot on the command itself is read before it (the stance asked in the run), and what stands is ended there.
   */
  private flinchLogStep(e: { seq: number; push: boolean; air: boolean; bare: boolean; slot?: boolean; pop?: boolean }): void {
    e.slot = this.slotAt(e.seq);
    const popped = e.pop === true && this.basePopStep(e.seq);
    this.flinchStep(e);
    if (popped && this.flinchCut !== null) { this.flinchEnded = this.flinchCut.until; this.endFlinch(); }
    const k = this.keptAt(e.seq);                                // LATER 551: the flinch after the command, for a re-run
    if (k) k.flinch = this.flinchNow();
  }

  /**
   * LATER 560 (research 92 section 4, "LATER 560"; reading, pending review; PTW.R3 with `room.ts` `watchMoves`): a climb's
   * start, a `Climb over` start or a ladder's mount on command `seq` pops the stack to its base -- `FUN_00580b70`
   * D:L442186-442214, `FUN_00580a80` D:L442151-442163, `FUN_0057f880` D:L441547-441558 -- the flinch on top with it (or a
   * door clip's push, and the flinch it covers: LATER 512b), and no gate on the start's path refuses it under a flinch.
   * The page's own window open at `seq` ends at it (its review F1: the pop comes in the driver's pass, `FUN_00550ef0`
   * D:L418132, and the reload's flag 0x4 is asked after it from the kit's frame `FUN_005c0fd0` in the actor's post-tick,
   * D:L417907 -- research 230, PAR-67 -- as the stick's cut in the same pass ends it at its own command, D:L418174-418190),
   * off the fall's cover and with nothing under it; its pose, its slot after `seq` and its reload refusal (`flinching`) end
   * with it (`flinchLogStep`). True: a window was cut. Was: only the covered flinch went (`stackPopped`), the window kept
   * to its end or the stick's cut; then (the first build) it ended at `seq + 1`.
   */
  private basePopStep(seq: number): boolean {
    const c = this.flinchCut;
    if (c === null || seq < c.start || seq >= c.until) return false;
    this.flinchCut = { ...c, until: seq };
    this.flinchAir = -1;
    this.flinchUnder = null;
    return true;
  }

  /** PAR-60, PAR-65: what `cutLog` holds of the command just run on `w` -- `seen` the landing the command before it left. */
  private cutEntry(w: Walker, seen: object | null): { push: boolean; air: boolean; bare: boolean } {
    const push = reloadCutOf(w.cutStick, w.turn, !w.cutAsked);           // PAR-64: the command's stick; PAR-62: none on a bare landing
    const landing = w.landing, air = w.airborne;
    const bare = !air && landing !== null && landing !== seen && landing.clip === null;   // PAR-65: this tick's own landing, no clip
    return { push, air, bare };
  }

  /**
   * PAR-60, PAR-65, PAR-71: the flinch at one command run (`e`, as `cutLog` holds it), in the order the room's `watchCut`
   * asks it: covered by the fall (`flinchCovered`) or, covered, back on the floor (`flinchDown`); then the stick's cut
   * (`flinchCutAt`); then, handed back, its window's end. Each end is kept in `flinchEnded` for `setFlinchPose`'s answer.
   */
  private flinchStep(e: { seq: number; push: boolean; air: boolean; bare: boolean }): void {
    const w = this.flinchCut;
    if (!w) return;
    if (this.flinchAir < 0) { if (flinchCovered(w, e.seq, e.air)) this.flinchAir = e.seq; }   // PAR-71: walked off mid-flinch
    else if (!e.air) this.flinchDown(e.seq, e.bare);                       // PAR-65: the covered flinch handed back or popped
    const now = this.flinchCut as FlinchCut | null;
    if (!now) return;
    if (e.push && flinchCutAt(now, e.seq)) { this.flinchEnded = e.seq; if (!this.flinchUncover(e.seq)) this.endFlinch(); return; }
    if (this.flinchUnder && e.seq + 1 >= now.until) { this.flinchUncover(now.until); return; }   // LATER 363: the push played through
    if (this.flinchBack && e.seq >= now.until) { this.flinchEnded = now.until; this.endFlinch(); }
  }

  /**
   * MAP-10b (research 215 s7): the page's own body on a turret -- the turret anim set's mount clip, its hold, the release's
   * reversed clip (`./turretPage` `ownPose`) -- in place of the mover's play while it returns one; never over the death
   * clip, and over a flinch (the room starts none on a mounted body: the release comes first). Null: none.
   */
  setMountPose(pose: (() => TraversalPose | null) | null): void {
    this.mountPose = pose;
  }
  private mountPose: (() => TraversalPose | null) | null = null;

  /**
   * PAR-44 (research 215 s7.5): the turret's hold on the page's own mover (`./turretPage` `TurretPage.holdTick`), run after
   * each tick's move and before the tick's command and predicted feet are sent -- where the room runs `holdStep` on its
   * mover (`room.ts`, the command step) -- so the prediction and the room agree and the reconcile has nothing to correct.
   * Null: none.
   */
  setTurretHold(hold: ((w: Walker) => void) | null): void {
    this.turretHold = hold;
  }
  private turretHold: ((w: Walker) => void) | null = null;

  /**
   * T81-3 (issue #81, research 215 s7.8): the held turret's hold on this walk's look -- `TurretPage.clampLook`, which answers
   * the look as given while nothing is held -- laid on each command's look before the look gate steps toward it, as the
   * room's `onTurret` clamps the command (`clampAim`) before its own gate (`room.ts`), and on the commands a rerun applies
   * again. The original's turret never stands past a stop: `FUN_003a76d0` holds the turned direction at the stop
   * (D:L299504-299518) before it lays the part's matrix (D:L299519-299529), and the hold lays the body on that matrix
   * (`FUN_00585cd0`). The command sent is not changed (the room clamps it on the wire's grid). Null: no hold.
   */
  setTurretAim(clamp: ((yaw: number, pitch: number) => { yaw: number; pitch: number }) | null): void {
    this.turretAim = clamp;
  }
  private turretAim: ((yaw: number, pitch: number) => { yaw: number; pitch: number }) | null = null;

  /** T81-3: a command with its look held by `turretAim` (as `room.ts` `onTurret` holds it), or as it is. */
  private aimHeld(cmd: Command): Command {
    const a = this.turretAim?.(cmd.yaw, cmd.pitch);
    return a && (a.yaw !== cmd.yaw || a.pitch !== cmd.pitch) ? { ...cmd, yaw: a.yaw, pitch: a.pitch } : cmd;
  }

  /**
   * PF-18 (ruling PF.R37; research 194 A03, 218 §2): whether the page's own flinch is before its one-shot end (PAR-58:
   * its last key, `T x ((n - 1) / n)^2`, research 230 s5.2) -- the clock `setFlinchPose` was handed, whether or not
   * the walk still draws it (a mover action or a move over it drops the pose, FLINCH_GATE_READING, while the room's flinch state runs on: `room.ts` `flinch`). The reload refuses to begin
   * meanwhile (`./fire` `FireSource.flinching`: `FUN_005b4340(actor, 3)` D:L469494-469504 on the flinch's motion flag
   * 0x4, `FUN_005a2690` D:L460018-460025); a round does not. A death or a spawn ends it (`setDeathPose`).
   */
  flinching(): boolean {
    // PAR-65: handed back, on the room's window (a push's refuses none: #485 F2); LATER 363: from its start (the push's pop).
    if (this.flinchBack) return this.flinchGates && this.flinchCut !== null && this.taps >= this.flinchCut.start && this.taps < this.flinchCut.until;
    if (this.flinchClock && this.flinchClock() === null) this.flinchClock = null;
    return this.flinchClock !== null;
  }
  private flinchClock: (() => TraversalPose | null) | null = null;

  /**
   * PF-19 (research 218 s3; `./net/blast` KNOCK_COVER_RELOAD_READING): whether the knock's `Prone cover` plays on this
   * page's own mover -- the room drops a reload named inside it `'proneCover'`, so the page's reload is refused too (the
   * `Fire` source's reload gate beside `flinching`: `main.ts`, the controller's one-line wiring). A round is refused by
   * the clip's `NoFire ()` (`fireAllowed`).
   */
  knockCovered(): boolean {
    return this.walking && this.walker?.action?.name === 'proneCover';
  }

  /**
   * The number of the walk's next command (`taps + 1`): a push made now lands on it -- the bare page's own door clip sizes its
   * window from it (`./net/flinchReload` `pushedWindowOf`; #485's review F4), as the room sizes its own from `seq + 1`.
   */
  nextCommand(): number {
    return this.taps + 1;
  }

  /** The mover's ticks so far (each the command it sends, networked): `main.ts` marks the zoom's tick by it. */
  ticks(): number {
    return this.ticks_;
  }
  /** The ticks ever run: `taps` takes the client's numbering at each `setNetTap` (the commands'), this never restarts. */
  private ticks_ = 0;

  isLocked(): boolean {
    return this.locked;
  }

  private tap(w: Walker, wish: WalkInput): void {
    this.taps++;
    this.ticks_++;
    this.stillClip?.ran(this.ticks_, w);                       // PARITY-1 D02: the clip's last key or cut, as the room's `watchCut`
    this.flinchRan(w);                                         // PAR-60: the flinch's stick cut, as the room's `flinchCut`
    this.launcherStickRan(w);                                  // PAR-83: the stick's lower of the launcher, as the room's `launcherStick`
    const landing = w.landing;                                 // PAR-28: a landing's clip pops the stack, as the room's run reads it
    // PAR-82: and any landing pops the m203's still clip (`landingPops` asks the life's family, as the room's `run`).
    if (landing && landing !== this.poppedLanding) { this.poppedLanding = landing; if (landingPops(landing, this.stillClip?.family?.() ?? null)) this.stackPopped('landing', this.ticks_); }
    this.sentScope = this.scopedMove;                          // offline too: the tick's view, as a command would carry it
    this.tickPresses = 0;
    this.peekPressTick = false;
    const jumpWaits = this.jumpWaits, actionWaits = this.actionWaits;
    this.jumpWaits = false;
    this.actionWaits = false;
    this.send(w, wish);
    const replay = this.danceReplay;                           // PAR-37: a run under the dance that waited for this tick
    this.danceReplay = null;
    if (replay && !this.replayVictory(replay)) {
      const stop = replay.stopAfter;
      w.setVictoryMotion(replay.clip, replay.motion, replay.elapsed);
      w.advanceVictory(Math.min(this.taps, stop ?? this.taps) - replay.from);
      if (stop !== null && stop <= this.taps) w.stopVictoryMotion();
    }
    const later = replay?.stopAfter ?? null;                   // a stop past the run's last command: at its tick
    if (later !== null && later > this.taps) this.danceStopAt = later;
    this.stopDanceAt(this.taps);                               // PAR-37: a reload's stop decided after this command
    this.keepDance(w);                                         // PAR-51: the kept state as the tick left it
    if (jumpWaits) this.jump();                                // the next tick's presses, in the update's order: they ride
    if (actionWaits) this.action();                            // on the next command
  }

  /** The command for the tick just run (MULTIPLAYER: `netTap`), its presses cleared. */
  private send(w: Walker, wish: WalkInput): void {
    if (!this.netTap) return;
    let buttons = this.pressed | this.pressedHold;
    this.pressed = 0;
    this.pressedHold = 0;
    if (this.scopedMove) buttons |= Button.Scope;
    if (this.binoculars_) buttons |= Button.Binoculars;
    if (wish.boost) buttons |= Button.Boost;
    if (this.scoped) buttons |= Button.Aim;                    // any view from the head: first person, night vision, scope
    if (this.trigger_) buttons |= Button.Trigger;
    const lean = this.moves?.peeking() ?? 0;
    const leanHeld = (this.moves as { leanHeld?: () => -1 | 0 | 1 } | null)?.leanHeld?.() ?? lean;
    if (leanHeld < 0) buttons |= Button.LeanLeft;
    if (leanHeld > 0) buttons |= Button.LeanRight;
    if (this.actionCancelled) this.actionCancelled = false;    // XR-06: the command after a cancel holds nothing
    else if ((this.moves as { actionHeldNow?: () => boolean } | null)?.actionHeldNow?.()) buttons |= Button.ActionHeld;
    const q = quantiseCommand({ seq: 0, forward: wish.forward, right: wish.right, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const cmd: Omit<Command, 'seq'> = {
      forward: q.forward, right: q.right, yaw: this.tickLook[0], pitch: this.tickLook[1], turn: this.tickLook[2],
      buttons, stance: this.pressedStance, weapon: this.weapon_, separate: this.stanceMode_ === 'separate',   // SEP-POP: the room's rule
    };
    this.netTap(cmd, [w.state.x, w.state.y, w.state.z], [w.state.yaw, w.state.pitch]);   // protocol 11: the gated facing, reconciled
    // PAR-37: the command kept with the mover after its tick, for a victory dance's run under it (`replayVictory`).
    this.kept.push({
      seq: this.taps, cmd: { ...cmd, seq: this.taps }, period: this.pressedHoldPeriod, walker: w.saveState(), shift: [0, 0, 0],
      stance: w.stance, weapon: this.weapon_, jumps: this.jumps, dancing: !!w.victoryMotion,
      flinch: this.flinchNow(),                                  // LATER 551: the flinch after this command's step (`flinchRan`)
      ...(this.pressedHoldPass !== undefined ? { pass: this.pressedHoldPass } : {}),
      ...(this.pressedLauncher !== null ? { launcher: this.pressedLauncher } : {}),
    });
    this.pressedHoldPeriod = undefined;
    this.pressedHoldPass = undefined;
    this.pressedLauncher = null;
    if (this.kept.length > KEPT_COMMANDS) {
      this.kept.shift();
      const first = this.kept[0]!.seq;                           // LATER 551: no re-run starts before it
      for (const at of [...this.flinchLaid.keys()]) if (at <= first) this.flinchLaid.delete(at);
    }
  }

  /** LATER 498 (`NetWalk.grounded`): a grid to stand a mover on -- the walker's, or the ground's. */
  grounded(): boolean { return (this.walker?.grid ?? this.gridOfGround()) !== null; }

  /**
   * A spawn from the server: a new mover (the server makes a fresh one too) stood at `at` facing `yaw`, then the
   * commands the server has not run on it replayed through the shared apply (`MoverSim`). False with no ground. `at` is
   * the feet: the floor is picked from the feet + `STEP_PROBE_LIFT_READING`, the tick's own origin (`Walker.place`; the server's
   * spawn does the same, so the two stand on one floor).
   */
  respawn(at: readonly [number, number, number], yaw: number, replay: readonly Command[] = []): boolean {
    const grid = this.walker?.grid ?? this.gridOfGround();
    if (!grid) return false;
    const w = new Walker(grid);
    w.actionRoots = this.actionRoots;
    if (this.heldModels) w.heldModels = { ...this.heldModels };   // SEGMENT-BODY part 4 (F1): the kit's models
    // LATER 410 (Fuse's #339): placed before it replaces the standing walker -- a point with no floor (the port's
    // refusal: `place` over the ground grid; the original's spawn rebuild `FUN_00599b60` D:L455604 has no such branch)
    // returns false with the standing walker, its kept state and its moves as they were. Was: swapped first, the new
    // mover left at (0, 0, 0).
    if (!w.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2])) return false;
    this.deathKept = null;                                       // LATER 496 F1: a respawn that holds ends the last death
    this.walker = w;
    this.forgetKept();                                           // PAR-37: a new mover
    if (!this.player) this.player = new PlayerCamera(grid);
    this.attachMoves(w);
    w.state.yaw = wrapYaw(yaw);
    this.stance_ = 'stand';
    this.jumps = 0;
    this.weapon_ = 0;
    this.camera.setPose({ yaw, pitch: INIT_AIM_PITCH });
    if (!this.walking) { this.walking = true; this.camera.setWalking(true); this.onChange(true); }
    const sim = new MoverSim(w, this.moves);
    sim.lookContext = this.lookContext;                          // OT.R38: the replay's gate on the room's context
    for (const cmd of replay) { const r = sim.apply(cmd); if (r.jumped) this.jumps++; }
    this.basePopped = false;                                     // LATER 560 review F4: a replayed mount's mark has no command step
    w.settle();
    const ref = { yaw: w.state.yaw, pitch: w.state.pitch };      // where the replay left the mover, as the room's
    this.stance_ = w.stance;
    // NU-12 B1 (research 328 R328.1, §4.2 D1-D2): the original rebuilds the body and makes a new camera on it
    // (`FUN_00599b60` D:L455663, `FUN_00299150` D:L455694). The spawn is counted for the body's play (`spawns`: `./play`
    // drops its animation at a change), and the last life's posed root is dropped, so the new camera stands on the
    // stance's root until the body's first posed frame -- not on a corpse's, a crouch's or a prone root. Was: kept, the
    // view rising from the floor with the body's 0.5 s ease into `seal_stand`.
    this.spawns_++;
    this.posedRoot = null;
    this.restart();
    this.lookGate = sim.gate;                                    // OT.R38: the replay's gate goes on, as the room's mover's
    this.lookLog.clear();                                        // a new mover: no step before it is replayed (NET-WIRE)
    this.tickRef = ref;
    this.gateWeapon = sim.weapon;
    this.lastLook = { yaw: w.state.yaw, pitch: w.state.pitch };   // the camera's, as restart laid it
    return true;
  }

  /** The native initial firearm selection on a fresh body (FUN_005c0250; research 362 §2), without a shoulder press. */
  placeFirearm(weapon: 0 | 1): void {
    this.weapon_ = weapon;
    this.gateWeapon = weapon;
    if (this.walker) this.walker.hand = weapon;
  }

  /**
   * OT.R59 (RECONNECT-GHOST, a labelled adaptation; `NetWalk.resume`): the seat the room handed back alive -- the page's
   * own mover (no new mover when one stands; a page with none stands one first, a respawn's) stood where the room's body
   * stands, facing `yaw`, in its posture at once (`Walker.stance`'s set: no transition), the firearm the room holds in
   * the hand (the commands' `weapon`, so the room reads no swap), and with no launcher on the body when the room holds
   * none. False for a posture that is none, or no floor there (the client then respawns it and asks again).
   */
  resume(at: readonly [number, number, number], yaw: number, posture: Stance, weapon: 0 | 1, held: number | null): boolean {
    if (!STANCES.includes(posture)) return false;
    // The review's F3: a page with no mover yet stands one first (a respawn's), then the room's posture and firearm on it.
    if (!this.walker && !this.respawn(at, yaw)) return false;
    const w = this.walker!;
    // `place` takes any clip off the mover -- a swap the page began in the gap among them (the review's F2) -- and the
    // walk's own record of a swap's undoing with it.
    if (!w.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2])) return false;
    this.swapTold = null;
    w.state.yaw = wrapYaw(yaw);
    w.stance = posture;
    this.stance_ = posture;
    this.weapon_ = weapon;
    w.hand = weapon;                                             // NU-1c B11: the mover's hand, as a swap would leave it
    this.gateWeapon = weapon;
    if (held === null) this.launcherCleared();
    w.settle();
    this.tickRef = { yaw: w.state.yaw, pitch: w.state.pitch };
    if (!this.walking) { this.walking = true; this.camera.setWalking(true); this.onChange(true); }
    return true;
  }

  /**
   * NU-12 B1 (research 328 R328.1): the spawns this walk has stood (`respawn`), never reset -- the body's play reads a
   * change as the original's rebuild of the body (`./play` `Play.frame`: `Play.respawn`).
   */
  spawns(): number {
    return this.spawns_;
  }
  private spawns_ = 0;

  /**
   * A blast's knock from the server (`./net/blast`): the same `applyKnock` the room laid on its mover
   * (`FUN_0057e770` D:L440981-441027, research 85 §12). `after` is the command the room had run when it laid the knock.
   * When that command and every one since are still kept, the mover is laid back there, the knock is applied, and the
   * commands since run again (`rerunFrom`) -- the knock is on that frame, then the sim goes on, as on the room.
   * `replayed` hears `after` when that replay ran (the net client's predictions after it are the run's). The same tick
   * (`after` not behind the last command sent) and a command no longer kept are laid on the mover as it stands.
   */
  knock(k: Knock, after?: number, replayed?: (after: number) => void): boolean {
    if (!this.walker || !this.walking) return false;
    if (typeof after === 'number' && after >= 0 && after < this.taps && this.replayKnock(after, k)) {
      replayed?.(after);
      return true;
    }
    this.knockedAfter = this.taps;                               // no kept state before it holds the knock
    const laid = applyKnock(this.walker, this.moves, k);
    if (laid) this.stackPopped('knock', this.ticks_);            // PAR-28: as the room's `layKnock`
    if (laid) this.knockPops(k, this.taps + 1);                  // LATER 555
    return laid;
  }

  /**
   * LATER 555 (research 92 section 4, "LATER 551"; reading, pending review; PTW.R3 with `room.ts` `layKnock`): a knock laid
   * before command `at` pops the flinch on top too -- `FUN_0057e770` calls `FUN_0058a4d0(actor, 0)` (D:L440997), which pops
   * while the stack holds more than its base and the top is not Stand, Crouch or Prone (types 1, 0x12, 0x1a:
   * D:L446762-446768), and a prone body's pops again (D:L441003-441004) before `Prone cover` (D:L441017-441018). A Prone
   * cover knock has no fall to cover the window: the page's own flinch (or door push) on top at `at` ends there -- its
   * pose, its slot (a stance request waits only for Prone cover's end) and its reload refusal (`flinching`). A fall's
   * knock leaves it to the fall's cover and its landing's pop (`flinchStep`, LATER 551), unchanged. Was: kept to its end.
   */
  private knockPops(k: Knock, at: number): void {
    const c = this.flinchCut;
    if (k.fall !== 'proneCover' || (c !== null && c.start > at)) return;
    this.endFlinch();
  }

  /** The knock laid after command `after`, then every kept command since run again. False when the record does not reach it. */
  private replayKnock(after: number, k: Knock): boolean {
    const ok = this.rerunFrom(after, (w) => {
      // The command the room laid it on, as the walk's tick it ran on: a pop is counted in `ticks_` (the still clip's and
      // the reload's lives), and command `taps + 1` runs on tick `ticks_ + 1` -- the two numberings differ after a
      // `setNetTap` (#441's review, finding 3).
      if (applyKnock(w, this.moves, k)) {
        this.stackPopped('knock', after + this.ticks_ - this.taps);
        this.knockPops(k, after + 1);                            // LATER 555: the window ends at the knock, as the room's
      }
    }, null, undefined, 'redone', { relog: true });                // LATER 551: the flinch stepped on the re-run's own air
    if (ok) this.knockedAfter = after;
    return ok;
  }

  /**
   * Dead or alive, as the match server has it (the net client's `kill` and `spawn`): a dead mover's death landing stays
   * down (`Walker.dead`, `DEATH_LANDING_GETUP_PLACEHOLDER` is the free walk's alone (`&nomatch`, `&fly`)).
   */
  setDead(on: boolean, opts: { keepDeath?: boolean } = {}): void {
    this.dead = on;
    const w = this.walker;
    // The death drops a move: `FUN_005af590` on state 8 (L466696-466699) and the blast's death (L440992-440993) call
    // `FUN_005a5da0`, the hang and ladder detach -- the corpse falls from the rungs or the ledge. A death with no move
    // leaves the mover as it is (a knock's fall goes on).
    if (on && w && this.moves?.busy()) { this.moves.reset(w); w.setAirborne(true); }
    if (w) w.dead = on;
    // The death camera from the death (`FUN_00297410` 140900-140913: mode 1 at state 8) to the respawn's new camera
    // (`FUN_00299150`): mode 6 until a killer is named (`setDeathKiller`). LATER 496's review F1 (the page's own case: a
    // spawn the walk refused, `NetClient.retrySpawn`): the client's spawn alone asks to keep the camera (`keepDeath`), so
    // a death after a refused respawn takes it back -- its killer and its turn as they were; a respawn that holds, a new
    // ground, or any other `setDead(false)` (a match's release, a give-back) drops it (the fold's re-look).
    if (!this.player) { this.deathKept = null; return; }
    if (on) { this.player.death = this.player.death ?? this.deathKept ?? newDeathCamera(); this.deathKept = null; }
    else { this.deathKept = opts.keepDeath ? this.player.death ?? this.deathKept : null; this.player.death = null; }
  }

  /** LATER 496's review F1: the death camera set aside by `setDead(false, { keepDeath: true })` until a respawn holds (`respawn`) or a death. */
  private deathKept: ReturnType<typeof newDeathCamera> | null = null;

  /**
   * The killer the death camera turns to (`./deathCamera` mode 3: `FUN_002980d0` 141355-141375), its origin as the page
   * sees it now; null for a death with none but the SEAL itself (a suicide, a fall: mode 6).
   */
  setDeathKiller(killer: (() => Vec3 | null) | null): void {
    if (this.player?.death) this.player.death = newDeathCamera(killer);
  }

  /** Dead, as the match server has it. */
  isDead(): boolean {
    return this.dead;
  }

  /**
   * A1 (`./net/blast` `mountPop`): this page's own body taken by its reserved turret, before the command the take names,
   * `m` (M: `./turretPage` `takeOwn` through `./matchActions`' `took`). LATER 524: M kept (`mountTook`) for a flinch event
   * the room pushed before it and this page hears after it (`setFlinchPose`). Without `m`: none kept.
   */
  mountTake(m?: number): void {
    this.mountTook = m ?? null;
    const moves = this.moves;
    // LATER 525: what the take ends here, kept for the room's refusal of it (`mountUntake`); a take with no M keeps none.
    this.takeKept = m === undefined ? null : {
      taps: this.taps,
      flinch: this.flinchNow(),
      heard: [],
      log: [],
      // LATER 526: the move under way as the pop finds it (a climb, a hang, a ladder, a dive), for the refusal to lay back.
      moves: moves?.keep ? { of: moves, state: moves.keep() } : null,
      anchor: this.kept.find((c) => c.seq === this.taps)?.walker ?? null,
    };
    if (this.walker) mountPop(this.walker, this.moves);
    // LATER 512, LATER 523 (research 215 section 8.6, "The flinch at the take"; PTW.R3 with `room.ts` `takeMount` and
    // `./remotePlayers` `frame`'s LATER 512b): the take runs `FUN_0058c350`, whose `FUN_0058a5e0(actor, 0, 1)` (D:L447984)
    // pops every play (D:L446796-446798) -- the flinch on top (its pose and its reload refusal, a door clip's push too)
    // and the one a door clip covers alike. Was: only the covered one (`flinchUnder`).
    this.endFlinch();
    if (m !== undefined) this.flinchLaidAt(m, false, true);     // LATER 551: before M, for a re-run through the take
  }

  /**
   * LATER 525 (research 215 section 8.6, "The flinch at the take" and "A1"; PTW.R3 with `room.ts` `takeMount`): the room
   * refused the take this page made at send time (`./turretPage` `untook`) -- dead, the round over, a knock-down fall on
   * top (`FUN_005463c0` D:L412134-412139; `FUN_00588030` D:L445700-445713) -- so its body never ran `FUN_0058c350`
   * (D:L447957-447994) and the room cut no flinch. What the take ended here is handed back: the flinch as it stood at the
   * take, run on over the commands this page has run since (`cutLog`, `flinchStep`: a stick's cut, a cover, a landing,
   * as the room's mover ran them), then each flinch event pushed before M and heard since, uncut. M is cleared. With no
   * take kept (none, or one already ended): nothing.
   *
   * LATER 526 (research 215 section 8.6, "A1"; PTW.R3 with `room.ts` `takeMount`): `FUN_005463c0` refuses before any of its
   * take's steps (D:L412131-412166), so the room's body was never popped to its base (`FUN_0058c350` D:L447983-447992: the
   * overlay, the stack, the stance, the request), its move under way never ended (D:L446796-446798) and the hold never
   * placed it: it ran this page's commands since on foot. Undone here, not kept: the mover laid back to its state after the
   * command before M (`kept`, the net client's corrections laid since with it), the move the pop ended laid back with it
   * (`TraversalHooks.restore`), and the commands since run again through the room's own rule (`rerunFrom`: `MoverSim`, their
   * look as sent -- no turret held them in the room -- and their stick cut logged again), their predictions not compared
   * (`replayed`: the room's next snapshots are, as after PAR-37's run). The record not reaching back to M - 1 (a knock
   * laid since, a new numbering): the mover stands, and the room's snapshots correct it (`./net/client` `reconcile`).
   * Then the flinch: the kept one run up to each event heard since (`taps`), each laid as it was heard -- LATER 526's
   * step 5: a door push at or after M covers the kept flinch (LATER 363), as a push covers a flinch on foot. (That order is
   * the fallback with no re-run; with one, LATER 549 lays each event at its window's start inside it.) LATER 549's review
   * F1: a flinch pushed at or after M is among the events, replacing the kept one at its start, as the room's push did.
   */
  mountUntake(replayed?: (after: number) => void): void {
    const k = this.takeKept;
    this.takeKept = null;
    this.mountTook = null;
    if (!k) return;
    this.flinchUntake(k.taps + 1);                               // LATER 551: the room never took -- no end laid at M
    // LATER 526's review F1: the moves go back only on the body they were kept from -- kept[M - 1] not rewritten since the
    // take. Rewritten (a knock replayed from before it), the room's body ended them with that knock: left reset.
    const mv = k.anchor !== null && this.kept.find((c) => c.seq === k.taps)?.walker === k.anchor ? k.moves : null;
    // LATER 551: the flinch as the take kept it -- or as a knock's re-run during the wait left it at M - 1 (`rerunFrom`).
    const f = k.flinch;
    const layKept = (): void => { if (f) this.flinchLay(f); };
    // LATER 549 (research 92 section 4, "LATER 544's reading", path 3; PTW.R3 with `room.ts`'s `oneShotOnTop`): the room's
    // body kept its flinch through the wait (`FUN_005463c0` refuses before its take's steps, D:L412131-412166), so its
    // stance gate asked that window on every command (`FUN_00552ec0` D:L418927-418930). The kept flinch is laid before the
    // re-run and stepped on each command it runs again (`rerunFrom`'s `flinch`), each event heard in the wait laid before the
    // first command of its window (the room pushed it there: `cut.start`), its replay bounded by the re-run (`rerunAt`) --
    // so the re-run asks the slot as the room's mover had it. Was: laid after the re-run, which asked the live slot the
    // take had ended (`endFlinch`): a request kept under the flinch was taken on the re-run's first command.
    // LATER 549's review F5, what the order changes beside the slot: a pushed event pops no climb (`setFlinchPose`: a
    // program's push has none, D:L487256-487260), so a door push laid inside the re-run moves no body; but its cover
    // (`flinchUnder`) now stands while the commands after its start run again, and a climb's start or a ladder's mount among
    // them drops it (`stackPopped`, from the moves' `on`), as the room's moves drop it (`room.ts`'s `moves.on`) -- the old
    // order laid the push after them and kept the cover. A flinch pushed before M and heard in the wait is laid at M - 1
    // and pops a climb restored there (the room popped it at its `cut.start - 1`): closer than after the re-run, not the
    // room's -- NU-1b's late-flinch gap, not LATER 549's.
    const heard = k.heard;
    let next = 0;
    const layHeard = (upTo: number): void => {
      while (next < heard.length && heard[next]!.cut.start - 1 <= upTo) {
        const h = heard[next++]!;
        this.rerunAt = upTo;
        try { this.setFlinchPose(h.pose, h.cut, h.opts); } finally { this.rerunAt = null; }
      }
    };
    let stepped = false;
    const ran = this.rerunFrom(k.taps, () => {
      if (mv && this.moves === mv.of) mv.of.restore?.(mv.state);
      // LATER 551: what stood before M, laid there for a later re-run through it (`flinchLaid`).
      if (f) { layKept(); layHeard(k.taps); this.flinchLaidAt(k.taps + 1, false); stepped = true; }
    }, null, replayed, 'undone', { held: false, relog: true, flinch: f ? (seq) => layHeard(seq - 1) : undefined });
    if (ran && stepped) {
      for (const h of heard.slice(next)) this.setFlinchPose(h.pose, h.cut, h.opts);   // a window from after the last command
      return;
    }
    layKept();
    if (f) this.flinchLaidAt(k.taps + 1, false);                 // LATER 551
    // The kept flinch stepped up to each event's hearing; once one is laid, it has stepped the flinch on to now itself.
    let at = k.taps;
    const stepTo = (to: number): void => {
      if (f) for (const e of this.cutLog) if (e.seq > at && e.seq <= to) this.flinchLogStep(e);
      at = Math.max(at, to);
    };
    for (const h of k.heard) { stepTo(h.taps); this.setFlinchPose(h.pose, h.cut, h.opts); at = Math.max(at, this.taps); }
    stepTo(this.taps);
  }

  /**
   * LATER 525 (a) (research 215 section 8.6, "The flinch at the take" and "A1"; PTW.R3 with `room.ts` `takeMount`): the
   * room took this page's body on a later command than the M this page took it at (`m`, the take broadcast's
   * `steer.after` + 1: `./turretPage` `retook`) -- a word heard after its command ran (`room.ts` `mountWord`,
   * `r.m = Math.max(m, p.sim.seq + 1)`) or the bound (`resolveMounts`, `takeMount(p, p.sim.seq + 1, false)`). The room's
   * take pops every play there, `FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` (D:L447984; its pops D:L446796-446798),
   * so its flinch window ends at its take's command (LATER 523, `p.flinchUntil = seq`), not at M; before it the body ran
   * on foot (`FUN_005463c0` refuses or takes only at the take, D:L412131-412166, the take block from D:L412188). M is
   * re-keyed to `m` (`mountTook`, for the events heard from now), and the events heard since the take (`takeKept.log`)
   * are judged again against it, in order, through `setFlinchPose` over the commands already run: one pushed in [M, m),
   * kept by this page, is cut at `m`; one pushed before M, cut at M here, runs on to `m` (or to its own end, a stick's
   * cut or a way down among the commands, as before). The room's take is sent once it has run the command before `m`,
   * which this page sent, so those windows have run by now: nothing of them is drawn after the re-key. Returned: each
   * event pushed before `m`, with its window's end as the room's take leaves it (for `./netPage`'s undo; not re-told
   * there: the page's reload is locked through the take, the gap LATER 525 (c) names). Nothing for a take not kept (none,
   * ended, refused), or an `m` at or before M (the room's take at or before the page's: not this re-key).
   */
  mountRekey(m: number): { start: number; until: number }[] {
    const took = this.mountTook, k = this.takeKept;
    if (took === null || k === null || !(m > took)) return [];
    this.mountTook = m;
    if (!k.log.some((h) => h.pose !== null && h.cut !== null && h.cut.start < m)) return [];
    const log = k.log;
    k.log = [];
    k.heard.length = 0;                                          // laid again as the events are judged against `m`
    this.endFlinch();
    this.flinchEnded = null;
    this.flinchUntake(took);                                     // LATER 551: the take's end at `m`, not at M
    this.flinchLaidAt(m, false, true);
    const out: { start: number; until: number }[] = [];
    // LATER 551's review F1: each event pushed before `m` rewrites the flinch kept from `m` with its end (`setFlinchPose`).
    for (const h of log) {
      const end = this.setFlinchPose(h.pose, h.cut, h.opts);
      if (h.pose !== null && h.cut !== null && h.cut.start < m) out.push({ start: h.cut.start, until: end ?? h.cut.until });
    }
    return out;
  }

  /**
   * LATER 532: whether the body was off the floor after command `seq` as the walk last ran it (`cutLog`'s `air`: after a
   * refused take, the re-run's -- the room's run on foot, `mountUntake`'s `relog`); null when the log does not hold it.
   * For the wind-up's chase over the wait, which stands off the floor (`FUN_00594cf0` D:L453478-453480, D:L457369-457371).
   */
  airAfter(seq: number): boolean | null {
    return this.cutLog.find((e) => e.seq === seq)?.air ?? null;
  }

  /** LATER 526: whether the trigger is held as the walk's commands carry it (`setTrigger`; `./netPage` `trigger`). */
  triggerHeld(): boolean {
    return this.trigger_;
  }

  /** A1: the take's own refusal on this page's body -- dead, or a knock-down fall on top (`mountFallRefuses`). */
  mountRefused(): boolean {
    return this.dead || (this.walker !== null && mountFallRefuses(this.walker));
  }

  /**
   * PF-17 (ruling PF.R36; research 194 A02, 218 s1): whether a firearm's round may leave over the body's playing motion
   * -- `./net/fireCapability` on this page's own mover after its last tick, the command the round is tagged with, as the
   * room records it at that command (`AimFrame.fire`): a stance change, a hard landing's first 0.3, a hang or a ladder,
   * the claymore's placing refuse; the jump, the soft landing and the flinches never do. True out of walk mode. The page's
   * `Fire.source.fireRefused` reads it, the round's gate alone (`main.ts`, `./matchFirearm`) -- never `ready`, which the
   * reload reads too: NoFire refuses no reload (FUN_005a7de0, research 218 s1.5).
   */
  fireAllowed(): boolean {
    const w = this.walker;
    if (!this.walking || !w) return true;
    return fireCapability(w, this.moves, this.weapon_ === 1, this.motionTable).fire;
  }

  /** The firearm in the hand, as the commands carry it: 0 the rifle, 1 the sidearm (MAP-10b: the mount clip's choice). */
  hand(): 0 | 1 {
    return this.weapon_;
  }

  /** PF-17: `motion.rdr`'s entries for the clips in play (`./play` hands them over with the action roots), or none. */
  setMotionTable(table: MotionTable | null): void {
    this.motionTable = table;
  }
  private motionTable: MotionTable | null = null;

  /**
   * A correction from the server: the mover moved by (dx, dy, dz) now (a small one is spread over ticks by the caller),
   * found at the room's snapshot acking command `ack`. PAR-37: the kept movers moved with it (`shift`).
   *
   * LATER 528 (LATER 526's review F2): not the kept movers up to M - 1 for a correction found at or past M while a send-time
   * turret take is kept (`takeKept`). The page predicted the hold's place from M; a room that decides the take after M -- a
   * late word (`room.ts` `mountWord`, `r.m = Math.max(m, p.sim.seq + 1)`) or the bound (`resolveMounts`, taken at
   * `p.sim.seq + 1`) -- had its body on foot there, so the correction is the hold's distance from that body, not an error of
   * the body before M. Laid on M - 1's state, the refusal's re-run from it (`mountUntake`: `FUN_005463c0` refuses before
   * any of its take's steps, D:L412131-412166, so the room's body ran the wait on foot) started off by it and the next
   * snapshot snapped it back. The choice (of the review's two): the re-run starts from M - 1's state with every correction
   * but the hold's -- one found before M (the body on foot) is still laid -- rather than leaving the client's reconcile
   * blind for the acks past M while the take waits, which the page cannot tell from a take the room confirmed (the take
   * broadcast reaches `./turretPage`, not the walk) and would have changed the confirmed late take's reconcile
   * (`turretHold.test.ts`'s late-press cases). The hold places the mover on its next tick, so the walker's own move here
   * is overwritten through the wait.
   */
  nudge(dx: number, dy: number, dz: number, ack?: number): void {
    const w = this.walker;
    if (!w) return;
    w.state.x += dx; w.state.y += dy; w.state.z += dz;
    const t = this.takeKept, hold = t !== null && ack !== undefined && ack > t.taps ? t.taps : null;
    for (const k of this.kept) {
      if (hold !== null && k.seq <= hold) continue;              // LATER 528: the hold's correction, not the body's before M
      k.shift[0] += dx; k.shift[1] += dy; k.shift[2] += dz;      // PAR-37: the kept movers with it
    }
  }

  /**
   * NET-WIRE's independent review (research 224 §4): the room's facing after command `ack` laid on the gate's start and
   * the mover, and every later command's look replayed through the gate from it (`LookLog.replay`, the steps as this walk
   * took them: the command's look, the weapon's context, the held move, the stance's limits). The camera keeps the
   * player's look. Null when no step of `ack` is recorded (the client then replays its own shadow of the gate and turns
   * the mover by `nudgeFacing`, one offset only as the last resort: `./net/client` `reconcileFacing`).
   */
  reconcileFacing(ack: number, facing: { yaw: number; pitch: number }): Map<number, [number, number]> | null {
    const w = this.walker;
    if (!w) return null;
    // PTT-8: the mover's facing after the newest tick -- only while alive: a dead tick records no step but moves `tickRef`.
    const r = this.lookLog.replay(ack, facing, this.lookGate, this.dead ? null : this.tickRef);
    if (!r) return null;
    this.lookGate = r.gate;
    this.tickRef = { yaw: r.ref.yaw, pitch: r.ref.pitch };
    w.state.yaw = r.ref.yaw;
    w.state.pitch = r.ref.pitch;
    return r.facings;
  }

  /**
   * Protocol 11 (NET-WIRE; research 224 §4): a facing correction from the server, laid at once -- on the look gate's start
   * (`tickRef`, where the next tick's gate steps from, as the room's steps from its mover) and on the mover. The camera
   * keeps the player's look: the gate turns the mover toward it at the law from here, as the room's does.
   */
  nudgeFacing(dyaw: number, dpitch: number): void {
    const w = this.walker;
    if (!w) return;
    this.tickRef = { yaw: wrapYaw(this.tickRef.yaw + dyaw), pitch: this.tickRef.pitch + dpitch };
    w.state.yaw = wrapYaw(w.state.yaw + dyaw);
    w.state.pitch += dpitch;
  }

  mode(): 'walk' | 'fly' {
    return this.walking ? 'walk' : 'fly';
  }

  /** Walk or fly. False when walk was asked for and there is no floor to stand on: the mode stays fly. */
  setMode(mode: 'walk' | 'fly'): boolean {
    if (mode === 'fly') {
      if (this.walking) this.leave();
      return true;
    }
    if (this.walking) return true;
    if (!this.stand()) return false;
    this.walking = true;
    this.sentScope = false;                                    // a new walk: no command yet, the room's mover unscoped
    this.tickPresses = 0;
    this.peekPressTick = false;
    this.jumpWaits = false;
    this.actionWaits = false;
    this.camera.setWalking(true);
    this.camera.setPose({ pitch: INIT_AIM_PITCH });          // the game's spawn pitch, init_aim_pitch (W2.1)
    this.restart();
    this.onChange(true);
    return true;
  }

  /** DEAD-CYCLE (LATER 78; research 314 §5.6): back on the own body from a teammate's view -- walking again where the walker stands, not re-placed at the fly camera (`stand()`); false with no walker. */
  resumeBody(): boolean {
    if (this.walking) return true;
    if (!this.walker) return false;
    this.walking = true;
    this.camera.setWalking(true);
    this.cameraTick();
    this.onChange(true);
    return true;
  }

  /** Third person, or the view from the head while zoomed (first person or the scope). */
  view(): WalkView {
    return this.scoped && !this.dead ? 'scope' : 'third';     // dead: the death camera, a third-person one
  }

  /** Zoomed past third person (`main.ts`: `Zoom.lens()`): the view from the head while on, third person after. */
  setScoped(on: boolean): void {
    if (this.scoped === on) return;
    this.scoped = on;
    if (this.walking && this.walker) this.follow();
  }

  /**
   * The 9x view or a scope is on (`main.ts`: `./zoom`'s `moveScale()` under 1): the mover's move stick x 0.2
   * (`Walker.scoped`, `FUN_005966a0`), sent as `Button.Scope` so the server's mover walks as slowly.
   */
  setScopedMove(on: boolean): void {
    this.scopedMove = on;
    if (this.walker) this.walker.scoped = on && this.walking;
  }

  /** The binoculars are up (`./zoom` state 4): sent as `Button.Binoculars`, the others' view of the body (and the room's fire). */
  /**
   * NET-LOOK's review (finding 1): the look gate's context as the room has it -- `lookContextOf` of the kit's record in
   * slot `weapon` (0 the rifle, 1 the sidearm), the firearm's (`./matchFirearm`); null, the open context.
   */
  setLookContext(context: ((weapon: 0 | 1) => LookContext) | null): void {
    this.lookContext = context;
  }

  setBinoculars(on: boolean): void {
    this.binoculars_ = on;
  }

  /** The binoculars up (`setBinoculars`): the room fires no round of the command (`fire`'s gate, a turret's too). */
  binoculars(): boolean {
    return this.binoculars_;
  }

  /**
   * The kit's one-shot on the mover (`Walker.hold`: a throw's clip at the release, the claymore's placing, a still
   * crouched or prone reload), walking only; the hold rides the next command (`holdBits`) so the server's mover holds
   * on the same tick. False, and nothing sent, when the mover refuses it or the clip is no hold. `pass` (PAR-74): its push's
   * pass for the one code pushed from both sides of the driver (`Walker.hold`, `holdPassOf`): the bomb's plant gives
   * `'before'` (`./bombPage` `ownBombBody`); not on the wire -- the room derives it (`MoverSim.holdPass`).
   */
  hold(clip: string, period?: number, pass?: HoldPass): boolean {
    const w = this.walker;
    if (!this.walking || !w || this.locked || !w.hold(clip, period, pass)) return false;
    this.pressedHold = holdBits(clip as HoldClip);
    this.pressedHoldPeriod = period;                             // PAR-37: kept with the command it rides
    this.pressedHoldPass = pass;                                 // PAR-74: so is the pass
    return true;
  }

  /**
   * The reload's hold for the stance and the weapon in hand (`reloadHold`): the crouched and prone ones only. `period`:
   * `reloadHoldPeriod` of the reload's seconds as `Fire` announced them (the record's `ReloadTime` still, on the rifle's
   * and the pistol's families only), the clock the hold and the body's clip share (research 150 F2, review F-A); the
   * room derives the same.
   */
  holdReload(period?: number): boolean {
    const w = this.walker;
    const clip = w ? reloadHold(w.stance, this.weapon_ === 1) : null;
    return clip !== null && this.hold(clip, period);
  }

  /** Walk mode: the mover's jump (`Walker.jump`); false when flying, or in the air. */
  jump(): boolean {
    const w = this.walker;
    if (this.locked) return false;
    // An Action, a swap or a stance already taken this tick: the player update reads the jump before all three (D:L453208),
    // so the jump waits for the next tick, as the room will read it there (`tap`).
    if (this.walking && (this.tickPresses & (Button.Action | Button.Swap | Button.Stance)) !== 0) { this.jumpWaits = true; return false; }
    // PARITY-1 D02: under the still reload's clip the press is spent and refused (D:L418128-418129), off the command, so
    // no replay re-runs it; the room refuses the same command on its own life (`room.ts` `jumpRefused`). Not under a move:
    // the climb's start pops the still clip (`FUN_00580b70` D:L442186-442214) and the hang lets go under its own looped top
    // (D:L418136-418139; review F3, research 251 s6).
    // PAR-78 (research 230 section 5.2.5): under the flinch on top too, on the room's window as this page's own commands cut
    // it (`setFlinchPose`; `room.ts` `jumpRefused` asks the same `flinchOnTop` on the same command's seq).
    if (this.walking && !this.moves?.busy() && (this.stillClip?.lives(this.ticks_ + 1) || flinchOnTop(this.flinchCut, this.taps + 1))) return false;
    // PAR-81 (research 230 section 5.2.6): under the launcher's set `FUN_005b4340(actor, 0xb)` refuses the press itself
    // (D:L453211-453213, D:L469466-469471) -- moves or not (`LAUNCHER_SET_MOVES_READING`); `room.ts` `jumpRefused` the same.
    if (this.walking && flinchOnTop(this.launcherSet, this.taps + 1)
      && (LAUNCHER_SET_MOVES_READING === 'refused under a move' || !this.moves?.busy())) return false;
    if (this.walking) this.pressed |= Button.Jump;              // MULTIPLAYER: the press rides on the next command
    if (this.moves?.busy()) return !!w && this.walking && this.moves.jump(w);   // TRAVERSAL SEAM: hanging, the jump lets go
    if (!this.walking || !w || !w.jump()) return false;
    this.stance_ = w.stance;
    this.jumps++;
    return true;
  }

  /**
   * Whether a swap would be taken now, nothing started (the mover's half of `FUN_00594cf0`'s gate, research 201 §1:
   * `./kit` `pressShoulder` gates the whole shoulder press on it): walking, alive, no move holding the mover, no stance
   * pressed this tick (the room reads the swap before the stance), and the mover's own refusal (`Walker.swapRefused`:
   * in the air, an action or a swap playing) with the view the last tick left -- `FUN_005c4fd0` is read before the zoom
   * (D:L453288 before D:L453313), and the room weighs the swap against the last command's `Scope` (`MoverSim.prepare`),
   * so a zoom step since the tick counts from the next.
   */
  swapGate(): boolean {
    const w = this.walker;
    if (!this.walking || !w || this.locked || this.moves?.busy()) return false;
    if ((this.tickPresses & Button.Stance) !== 0) return false;
    // PAR-83, F1 of its review (research 230 section 5.2.8): the stick's moving lower live on the command the take rides
    // (`FUN_005a7980` answers, D:L462492-462499, so `FUN_005a8cb0`'s `FUN_005a7de0(actor, 1, 1)` refuses, D:L463159) --
    // the room's `swapRefused` and `raiseLauncher` refuse on the same commands.
    if (this.taps + 1 < this.launcherMovingUntil) return false;
    return !w.swapRefused(this.sentScope);
  }

  /**
   * Walk mode: the rifle <-> pistol swap's clip for the WEAPON workstream (`Walker.swapWeapon`, `FUN_005a64c0`): the
   * full-body action or the overlay over the locomotion, or null when `swapGate` refuses.
   */
  swapWeapon(to: 'pistol' | 'rifle'): SwapPick | null {
    if (!this.swapGate()) return null;
    const pick = this.walker!.swapWeapon(to, this.sentScope);
    if (pick) {                                                   // MULTIPLAYER: only a swap the mover took goes on the wire
      this.swapTold = null;                                       // PAR-37: a new swap is the kit's now
      this.pressed |= Button.Swap;
      this.tickPresses |= Button.Swap;
      this.weapon_ = to === 'pistol' ? 1 : 0;
      // PAR-83, F3 of PAR-81's review (research 230 section 5.2.8): a firearm taken with the launcher still up is the
      // lower in the set (`FUN_005a64c0(actor, 4, firearm, 0)` -> `FUN_005a6b70` D:L462069-462082, by the firearm taken),
      // its set given back at that clip's end -- the room's `aim` the same on this command. Unreachable from the kit today.
      // PAR-84: the mover plays the firearm's swap there, not the still lower (research 230 section 5.2.10, step 8: not
      // built), as the room's `aim` does -- `held` false.
      if (this.launcherUp !== null) this.launcherLowered(this.weapon_, false);
    }
    return pick;
  }

  /** Walk mode: the swap clip playing and its progress (`Walker.swapProgress`), or null. */
  swapProgress(): SwapProgress | null {
    // PAR-37 (research 251 section 9): a swap the run under a victory dance undid (`replayVictory`: the room refused it
    // under the dance), told once -- the kit goes back to the firearm it left (`./kit` `Kit.frame`).
    // PAR-51 (section 9.1): or one a run with no dance from the room's stop took again (`stopVictoryMotionAfter`), told once.
    const told = this.swapTold;
    if (told) {
      this.swapTold = null;
      return told === 'undone' ? { action: null, overlay: false, progress: 0, undone: true } : { action: null, overlay: false, progress: 0, redone: true };
    }
    return this.walking && this.walker ? this.walker.swapProgress() : null;
  }

  /**
   * Walk mode: crouches (true), stands (false) or toggles stand and crouch (no argument); crouched after (the stance). The
   * toggle is the pad's Crouch bind, the original's light press (`./matchLanes`): it asks through the press's water
   * columns (`../stanceButton` `pressInWater`, LATER 492's review F1), so standing 9 deep it asks stand. `crouch(true)` and
   * `crouch(false)` ask their stance as given, past the table (the walk's own callers, not the press).
   */
  crouch(on?: boolean): boolean {
    if (!this.walking || !this.walker) return false;
    const intent = this.stanceIntent();
    const toggle: Stance = intent !== 'crouch' ? 'crouch' : 'stand';
    this.setStance(on !== undefined ? (on ? 'crouch' : 'stand') : pressInWater('tap', intent, this.stanceAllows(), toggle) ?? toggle);
    return this.stance_ === 'crouch';
  }

  /** The mover's state while walking (in the air, crouched, the stance, the last landing), else null. */
  mover(): MoverState | null {
    const w = this.walker;
    if (!this.walking || !w) return null;
    return { airborne: w.airborne, crouched: w.posture === 'crouch', stance: w.stance, landing: w.landing && { ...w.landing } };
  }

  /** The mover for the body and its clips, while walking; null in fly mode. */
  snapshot(): PlaySnapshot | null {
    const w = this.walker;
    if (!this.walking || !w) return null;
    const s = moverSnapshot(w, this.moves, this.jumps, this.turnRate);
    s.drawnFeet = w.drawnFeet();                                // MISSION R8: the body's place; `feet` stays the simulated
    if (this.deathPose) s.traversal = this.deathPose();     // MULTIPLAYER: the death clip in place of the mover's play
    else if (this.flinchPose && this.flinchAir < 0) {          // MULTIPLAYER: the own flinch, unless FUN_005a2690 refuses it (PF-21); PAR-65, PAR-71: not under the fall
      const pose = (this.flinchPushed ? pushPopped(s) : flinchRefused(s)) ? null : this.flinchPose();   // DOORS: a push has no FUN_005a2690 gate; the stack's pops take it (#485 F3)
      if (pose) s.traversal = pose; else { this.flinchPose = null; this.flinchPushed = false; }
    }
    const mount = this.deathPose ? null : this.mountPose?.() ?? null;   // MAP-10b: the turret anim set's clip
    if (mount) s.traversal = mount;
    return s;
  }

  /**
   * SEGMENT-BODY part 4 (fresh review 1's F1): the kit's firearm models (`./loadout` `heldWeaponModels`, from
   * `./matchFirearm`'s `spawnKit` and `takeKit`), the weapon line's length (`Walker.heldModels`; `FUN_0054e8f0`
   * D:L416869-416870): laid on the mover now and on every mover the walk makes after (`respawn`, `stand`).
   */
  setHeldModels(models: { rifle: string | null; pistol: string | null }): void {
    this.heldModels = { ...models };
    if (this.walker) this.walker.heldModels = { ...models };
  }
  private heldModels: { rifle: string | null; pistol: string | null } | null = null;

  /** The action clips' root keys, by clip name (`./play` hands them over from the pack): `Walker.actionRoots`. */
  setActionRoots(roots: ReadonlyMap<string, Float32Array> | null): void {
    this.actionRoots = roots;
    if (this.walker) this.walker.actionRoots = roots;
  }
  private actionRoots: ReadonlyMap<string, Float32Array> | null = null;

  /**
   * The body's posed skeleton root over the feet (`./play`, after each animator step), or null to fall back on the
   * stance's measured root (`rootY`): what the camera stands its target on from the next tick.
   */
  setPosedRoot(rootY: number | null): void {
    this.posedRoot = rootY !== null && Number.isFinite(rootY) ? rootY : null;
  }

  /**
   * One frame: the look goes to the mover (the pitch clamped to the posture's limits), real time goes in -- the
   * camera ticking after each of the mover's ticks -- and the view is placed between the last two.
   */
  frame(dt: number): void {
    const w = this.walker;
    if (!this.walking || !w) return;
    // DEAD (DEAD_LOOK_READING, research 91 s16): the look is not the body's -- the dead's controller (`FUN_00592560` L451642-451730) takes the respawn press
    // alone; the body keeps the facing it died with and turns at no rate (the server's corpse ticks the same, `room.ts`).
    if (!this.dead) this.look(w);
    const yaw = w.state.yaw;
    const look = this.camera.lookState?.();
    if (this.dead) this.turnRate = 0;
    else if (look) this.turnRate = look.turnRate;
    else if (this.lastYaw !== null && dt > 0) {
      const turn = shortTurn(this.lastYaw, yaw);
      this.turnRate = (turn * Math.PI) / 180 / dt;
    }
    this.lastYaw = yaw;
    this.stanceKeyFrame(dt);
    w.turn = this.turnRate;
    w.scoped = this.scopedMove;
    w.stanceCut = true;                                        // COMBINED-CUT (OT.R93): the player's stick cuts the stance clips, both modes
    w.stanceSeparate = this.stanceMode_ === 'separate';        // SEP-POP: SEPARATE's push leaves the velocity
    const wish = this.locked ? { forward: 0, right: 0, boost: false } : this.camera.groundWish();
    // NET-LOOK round 3 (finding 2): the frame's look spread evenly over the ticks it runs, so a long frame (a hitch, a slow
    // device) lays each tick a tick's share of the turn -- the law's step -- not the whole frame's on its first.
    const spread = { n: w.ticksFor(dt), k: 0, from: { ...this.lastLook }, to: { yaw: w.state.yaw, pitch: w.state.pitch } };
    // LATER 338: the frame's ticks, from the time already run since the last tick (the walker's accumulator).
    const since = w.alpha() * TICK;
    this.frameTicks = this.lastTick ? [{ ...this.lastTick, at: -since }] : [];
    let ran = 0;
    w.advance(dt, wish, () => { this.turretHold?.(w); this.tickRef = { yaw: w.state.yaw, pitch: w.state.pitch }; this.gateWeapon = this.weapon_; this.tap(w, wish); this.cameraTick(); this.noteTick(w, ++ran * TICK - since); }, () => {
      // MULTIPLAYER: the look each tick starts from (a move may turn the mover inside a tick; the next starts there).
      w.commandSeq = this.taps + 1;                              // the command this tick will be (LANDING_HIT_DRAW_READING)
      if (!this.netTap) return wish;
      // Networked, the tick runs on the command as the server will read it (`quantiseCommand`), so the two agree.
      const f = spread.n > 0 ? Math.min(1, ++spread.k / spread.n) : 1;
      const lookYaw = wrapYaw(spread.from.yaw + shortTurn(spread.from.yaw, spread.to.yaw) * f);
      const lookPitch = spread.from.pitch + (spread.to.pitch - spread.from.pitch) * f;
      const q = quantiseCommand({ seq: 0, forward: wish.forward, right: wish.right, yaw: lookYaw, pitch: lookPitch, turn: w.turn, buttons: 0, stance: 0, weapon: 0 });
      this.tickLook = [q.yaw, q.pitch, q.turn];
      this.lastLook = { yaw: q.yaw, pitch: q.pitch };
      // OT.R38: the room holds the look to the stick's law and derives the turn (`MoverSim.prepare`); the page's mover
      // takes the same gate on the same command (a dead body's command runs no look on the room: none here either).
      const view = (this.scopedMove ? Button.Scope : 0) | (this.binoculars_ ? Button.Binoculars : 0);
      const ctx = this.lookContext?.(this.gateWeapon) ?? OPEN_LOOK_CONTEXT;
      // T81-3: the look held to a held turret's limits before the gate steps toward it (and before it is recorded, so a
      // facing's replay steps the same looks), as the room's `onTurret` holds the command before its gate.
      const aim = this.turretAim?.(q.yaw, q.pitch) ?? q;
      const held = (this.moves?.yaw() ?? null) !== null, limits = aimPitchLimitsOf(w), look = { yaw: aim.yaw, pitch: aim.pitch, buttons: view };
      if (!this.dead) this.lookLog.record(w.commandSeq, this.lookGate, look, ctx, held, limits, this.tickRef);   // PTT-8: where the step starts
      const looked = this.dead ? null : this.lookGate.step(this.tickRef, look, ctx, held, limits);
      w.state.yaw = looked?.yaw ?? q.yaw; w.state.pitch = looked?.pitch ?? q.pitch; w.turn = looked?.turn ?? q.turn;
      return { forward: q.forward, right: q.right, boost: wish.boost };
    });
    this.stance_ = w.stance;                                     // TRAVERSAL SEAM: a move or the water may stand the SEAL up
    this.follow();
  }

  /**
   * The hook's pose, in walk mode as in fly: the look is taken as given, and a position is the eye to drop the mover
   * from, onto the floor under it. With no floor there the pose is honoured and the mode goes back to fly -- unless
   * `keepOnFoot` (Play without the fly toggle, `./flyAccess`): then the mover stands where entering the walk would stand
   * it (the spawn's feet), and the walk is never left by the hook's hand.
   */
  setCamera(pose: Partial<Pose>, keepOnFoot = false): void {
    this.camera.setPose(pose);
    const w = this.walker;
    if (!this.walking || !w) return;
    // A turn only: the camera keeps its pass (the distance, the hold) and its root; the next tick takes the turn.
    if (pose.x === undefined && pose.y === undefined && pose.z === undefined) { this.look(w); return; }
    const at = this.camera.pose();
    this.forgetKept();                                           // PAR-37: a placing starts the mover afresh
    this.moves?.reset(w);                                        // TRAVERSAL SEAM: a new pose drops a move
    if (w.place(at.x, at.y, at.z) || (keepOnFoot && this.stand())) this.restart();
    else this.leave();
  }

  /**
   * `seconds` of ticks with this input, run now rather than over frames, facing the camera's yaw -- the
   * frame-rate-proof way for a test to walk (`e2e/walk.spec.ts`). Returns the camera's pose at the end.
   */
  walkFor(seconds: number, input: WalkInput): Pose {
    const w = this.walker;
    if (!this.walking || !w) return this.camera.pose();
    this.look(w);
    for (let i = Math.round(seconds / TICK); i > 0; i--) { w.tick(input); this.cameraTick(); }
    this.stance_ = w.stance;                                     // TRAVERSAL SEAM
    w.settle();
    this.player?.settle();
    this.follow();
    return this.camera.pose();
  }

  /** The mover's feet while walking, else null. */
  feet(): [number, number, number] | null {
    const w = this.walker;
    return this.walking && w ? [w.state.x, w.state.y, w.state.z] : null;
  }

  /** The feet as drawn this frame, between the last two ticks (the body's place), or null in fly mode. */
  drawnFeet(): [number, number, number] | null {
    const w = this.walker;
    return this.walking && w ? w.drawnFeet() : null;
  }

  /** The body in use (`Walker.posture`): `stand` while a crouch runs at full stick; the stance when not walking. */
  posture(): Stance {
    return this.walking && this.walker ? this.walker.posture : this.stance_;
  }

  /** The mover's speed over the ground, units a second (0 in fly mode). */
  speed(): number {
    const w = this.walker;
    return this.walking && w ? Math.hypot(w.state.vx, w.state.vz) : 0;
  }

  /** The walk's camera as last placed, or null in fly mode (the hook's `camera()`). */
  cameraState(): WalkCameraState | null {
    const w = this.walker, placed = this.placed;
    if (!this.walking || !w || !placed) return null;
    return {
      mode: this.view(), eye: [...placed.eye], target: [...placed.target], drawnEye: [...(this.frameEye ?? this.drawnEye ?? placed.eye)],
      rootY: this.player?.rootY() ?? rootY(w.posture), pitch: this.camera.pose().pitch,
      pass: { distance: this.player?.distance() ?? 0, hold: this.player?.hold() ?? 0 },
    };
  }

  /**
   * The point the reticle sits on, or null in fly mode: in third person on the view line, the eye toward the moved
   * target (`viewFar`, LATER 305; `FUN_00297410`'s aim, 1000 ahead along the look, until the pass moves the eye), in
   * the head's view 1000 ahead -- the drawn camera's (MISSION R8: lifted with it in the air, `follow`), so the reticle
   * stays where the drawn view looks.
   */
  aim(): Vec3 | null {
    if (!this.walking || !this.placed) return null;
    return [...(this.drawnFar ?? this.placed.far)];
  }

  /** W2.5 (`./fire`): the shot's origin and aim -- the eye as placed (the firepoint's stand-in) and the aim point. */
  fireAim(): { eye: Vec3; far: Vec3 } | null {
    return this.walking && this.placed ? { eye: [...this.placed.eye], far: [...this.placed.far] } : null;
  }

  /**
   * LATER 338 (`FireSource.tickAim`): the tick of this frame at or before `at` seconds into it -- its command and its
   * camera -- or the previous frame's last for a moment before this frame's first tick; null off the walk or with none.
   */
  tickAim(at: number): { seq: number; eye: Vec3; far: Vec3 } | null {
    if (!this.walking) return null;
    let pick: { seq: number; eye: Vec3; far: Vec3 } | null = null;
    for (const k of this.frameTicks) if (k.at <= at + 1e-9) pick = k;
    return pick ? { seq: pick.seq, eye: [...pick.eye], far: [...pick.far] } : null;
  }

  /**
   * LATER 338: a tick just run (its command `taps`, its camera just ticked), `at` seconds into the frame: the shot's eye
   * and aim point as `follow` places them, at the tick itself rather than between the last two -- the third person's
   * pass at the tick, or the head's eye on the tick's feet and look.
   */
  private noteTick(w: Walker, at: number): void {
    let eye: Vec3, far: Vec3;
    if (this.view() === 'third') {
      const v = this.player?.view(1);
      if (!v) return;
      eye = [...v.aim.eye]; far = [...v.far];
    } else {
      const yaw = (w.state.yaw * Math.PI) / 180, pitch = (w.state.pitch * Math.PI) / 180;
      const root = this.posedRoot ?? this.moves?.rootY() ?? rootY(w.posture);
      const feet: Vec3 = [w.state.x, w.state.y, w.state.z];
      eye = headEye(w.grid, feet, toWorld(feet, w.state.yaw, scopeEye(w.posture, root, this.moves?.peek() ?? 0, proneEyeTerms(w.floorNormal[1]))));
      far = [eye[0] - Math.sin(yaw) * Math.cos(pitch) * 1000, eye[1] + Math.sin(pitch) * 1000, eye[2] - Math.cos(yaw) * Math.cos(pitch) * 1000];
    }
    const tick = { seq: this.taps, eye, far };
    this.frameTicks.push({ ...tick, at });
    this.lastTick = tick;
  }

  /**
   * LATER 366 (OT.R80): the body the room measures a round's start from (`./net/startLine`, `room.ts` `startBody`): the
   * simulated feet and yaw, the stance, the move's root and peek -- the stance's root, not the posed one, as the room's.
   * Null off the walk.
   */
  startBody(): StartBody | null {
    const w = this.walker;
    if (!this.walking || !w) return null;
    return { feet: [w.state.x, w.state.y, w.state.z], yaw: w.state.yaw, posture: w.posture, moveRoot: this.moves?.rootY() ?? null, peek: this.moves?.peek() ?? 0, groundNormalY: w.floorNormal[1] };
  }

  /**
   * The use prompt's ray (research 208 §9, 84 §19): the drawn eye, and the reticle's point (`aim`) -- on the view line
   * since LATER 305 (`viewFar`), so the prompt picks where the reticle sits. `fireAim` stays on the simulated feet so a
   * shot's claim is unchanged.
   */
  lookAim(): { eye: Vec3; far: Vec3 } | null {
    if (!this.walking || !this.placed) return null;
    return { eye: [...(this.drawnEye ?? this.placed.eye)], far: [...(this.drawnFar ?? this.placed.far)] };
  }

  /**
   * The game's camera in third person -- the pass's eye and target, lifted by MISSION R8's drawn offset as `lookAim`'s
   * -- where the drawn one (`frameEye`) may stand off it (the near clearance, H309; #479's re-review F1, F2): the
   * perception cone's apex and the sound listener (`./matchFirearm`, `./matchSound`). Null in first person or off the
   * walk: the drawn camera is the game's there.
   */
  gameCamera(): { eye: Vec3; target: Vec3 } | null {
    if (!this.walking || !this.placed || !this.frameEye) return null;
    return { eye: [...(this.drawnEye ?? this.placed.eye)], target: [...(this.drawnTarget ?? this.placed.target)] };
  }

  /**
   * MAP-02: the hull's grid -- the one `setGround` was given (the page's world state's, `./worldState`, whose revision
   * the mover's caches follow), else one built once off the hull. Public for PAR-46a (research 283 s8): the throws'
   * hull walking or not (`./matchThrow` `hullGrid`) -- a page off the walk (a spectator, the replay's watcher) draws the
   * room's throws over the map's grid as the room flies them (`room.ts` `hullCast()`); walking, it is `grid()`'s object.
   */
  gridOfGround(): Grid | null {
    if (!this.ground) return null;
    return this.hullGrid ??= groundGrid(this.ground);
  }

  /** W2.5: the hull the mover stands on (the probe's grid), while walking. */
  grid(): Grid | null {
    return this.walking && this.walker ? this.walker.grid : null;
  }

  /**
   * `G` (walk and fly), `Space` (the jump) and `C` (the stance: its press and release, while walking) on `target`,
   * ignored with a modifier -- so Ctrl+C stays the browser's -- on auto-repeat, and while a control has the keyboard.
   * A lost keyboard (`blur`) lets `C` go without a tap.
   */
  bindKey(target: EventTarget = globalThis): void {
    this.unbindKey();
    if (import.meta.env.DEV) keyboardSite('s2u-kb-walk');            // OT.R29: the keys a development build's only,
    if (import.meta.env.DEV || this.camera.forgeKbm === true) {      //   and the forge's Walk on its layout in every build (OT.R68)
      target.addEventListener('keydown', this.onKey as EventListener);
      target.addEventListener('keyup', this.onKeyUp as EventListener);
    }
    target.addEventListener('blur', this.onBlur);
    this.bound = target;
  }

  unbindKey(): void {
    this.bound?.removeEventListener('keydown', this.onKey as EventListener);
    this.bound?.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.bound?.removeEventListener('blur', this.onBlur);
    this.bound = null;
    this.onBlur();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!['KeyG', 'KeyC', 'Space'].includes(e.code) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.code !== 'KeyG' && !this.walking) return;          // in fly mode Space stays the camera's "up"
    if (e.code === 'KeyG' && !this.modeKey) return;           // the fly camera is not a player's in Play
    const target = e.target;
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    e.preventDefault();
    if (this.menuHeld && e.code !== 'KeyG') return;           // the R2 inventory open: no jump, no stance (ctrl+0x221)
    if (e.code === 'Space') this.jumpPress();                  // OT.R76: the pop inside its window, else the jump
    else if (e.code === 'KeyC') { this.popArm = null; this.stanceKeyHeld = true; this.stanceKeyPressed = true; }   // OT.R76: a fresh C closes the window at its press
    else this.setMode(this.walking ? 'fly' : 'walk');
  };

  /** `C` let go: the tap (or nothing, after a hold) is the next frame's. Taken with a modifier too: a release is a release. */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyC') this.stanceKeyHeld = false;
  };

  private readonly onBlur = (): void => {
    this.popArm = null;                                          // OT.R76: focus lost (and a mode change) closes the window
    this.stanceKeyHeld = false;
    this.stanceKeyPressed = false;
    this.stanceKey.reset();
  };

  /**
   * One frame of `C`'s machine and the touch C's: a press between two frames is down for one; the stance asked for, set.
   * OT.R67: in the stance mode (`StanceButton.lanes`) -- the prone-pop's machine, the pad's Triangle's, by default; in
   * `'separate'` `KEY_STANCE` as before.
   */
  private stanceKeyFrame(dt: number): void {
    const down = this.stanceKeyHeld || this.stanceKeyPressed;
    this.stanceKeyPressed = false;
    this.stanceKey.lanes(this.stanceMode_, { triangle: down }, dt, this);
    const touched = this.stanceTouchHeld || this.stanceTouchPressed;
    this.stanceTouchPressed = false;
    this.stanceTouchButton.lanes(this.stanceMode_, { triangle: touched }, dt, this);
  }

  /** The floor under the camera, else spawn A's. */
  private stand(): boolean {
    if (!this.walker && this.ground) {
      this.walker = new Walker(this.gridOfGround()!);
      this.walker.actionRoots = this.actionRoots;
      if (this.heldModels) this.walker.heldModels = { ...this.heldModels };   // SEGMENT-BODY part 4 (F1): the kit's models
      this.player = new PlayerCamera(this.walker.grid);
      this.attachMoves(this.walker);                              // TRAVERSAL SEAM
    }
    const w = this.walker;
    if (!w) return false;
    w.stance = this.stance_;
    const at = this.camera.pose();
    if (w.place(at.x, at.y, at.z)) return true;
    return this.spawn !== null && w.place(this.spawn[0], this.spawn[1] + STEP_PROBE_LIFT_READING, this.spawn[2]);   // the spawn's feet: the tick's pick
  }

  private leave(): void {
    this.walking = false;
    this.onBlur();                                               // a C press under way is no tap on the next walk
    this.placed = null;
    this.drawnEye = null;
    this.drawnTarget = null;
    this.drawnFar = null;
    this.frameEye = null;
    this.setViewNear(null);
    this.camera.setWalking(false);
    this.onChange(false);
  }

  /** The look to the mover: the camera's yaw is the body's, its pitch clamped to the posture's limits. */
  private look(w: Walker): void {
    const [min, max] = aimPitchLimitsOf(w);                     // PRONE-TILT-2 (1): the prone pair leaned by the slope
    this.camera.setPitchLimits(min, max);
    const held = this.moves?.yaw() ?? null;                      // TRAVERSAL SEAM: a ladder holds the facing
    if (held !== null) this.camera.setPose({ yaw: held });
    const look = this.camera.pose();
    w.state.yaw = wrapYaw(look.yaw);                             // canonical whatever camera hands it (yaw.ts)
    w.state.pitch = look.pitch;
  }

  /** One camera tick on the mover's last tick: on the body's posed root when there is one, else the stance's. */
  private cameraTick(): void {
    const w = this.walker!;
    const posed = this.posedRoot;
    // TRAVERSAL SEAM: the lean's peek (the move's root is the posed one). `peekPin` is the test room's disc-check hold.
    if (this.player) {
      this.player.peek = this.peekPin ?? this.moves?.peek() ?? 0;
      const aspect = this.camera.aspect?.();
      if (aspect !== undefined && Number.isFinite(aspect) && aspect > 0) this.player.nearAspect = aspect;
    }
    this.player?.tick([w.state.x, w.state.y, w.state.z], w.state.yaw, w.state.pitch, posed ?? this.moves?.rootY() ?? rootY(w.posture), undefined, posed !== null);
  }

  /** A new camera on the mover where it now stands (entering walk, a pose from the hook, a new map). */
  private restart(): void {
    const w = this.walker!;
    this.lastYaw = null;
    this.turnRate = 0;
    this.look(w);
    this.lookGate = new LookGate();                              // a new mover: its facing the gate's (OT.R38)
    this.frameTicks = []; this.lastTick = null;                  // LATER 338: no tick of the old body names a round
    this.lookLog.clear();
    this.stillClip?.end();                                       // PARITY-1 D02: a new body holds no clip
    this.launcherSet = null;                                     // PAR-81: nor the launcher's set (the room's spawn clears it)
    this.launcherUp = null;                                      // PAR-83: nor a launcher up
    this.launcherMovingUntil = -Infinity;                        // PAR-83, F1: nor its moving lower
    this.tickRef = { yaw: w.state.yaw, pitch: w.state.pitch };
    this.gateWeapon = this.weapon_;
    this.lastLook = { yaw: w.state.yaw, pitch: w.state.pitch };
    this.player?.reset();
    this.cameraTick();
    this.follow();
  }

  /**
   * The view to the camera: the game's, between the last two ticks, or the head's in the scope. MISSION R8 (a known
   * deviation, research 208 section 9): in the air the body is drawn at `Walker.drawnFeet`, its height between the last
   * two 30 Hz game frames', and the camera drawn on it (the third-person view lifted by the drawn height's offset, the
   * head's eye from the drawn feet), so the view no longer judders; `placed` -- the shot's eye (`fireAim`) and the
   * hook's camera -- stays on the simulated height (`Walker.tickFeet`), so the claim the room checks is unchanged.
   */
  private follow(): void {
    const w = this.walker!;
    const third = this.player?.view(w.alpha());
    if (!third) return;
    const simFeet = w.tickFeet(), drawn = w.drawnFeet();
    const d: Vec3 = [drawn[0] - simFeet[0], drawn[1] - simFeet[1], drawn[2] - simFeet[2]];   // MISSION R8's height; LATER 96's drawn-only offset
    const moved = d[0] !== 0 || d[1] !== 0 || d[2] !== 0;
    if (this.view() === 'third') {
      this.setViewNear(null);                                    // OBF-1: third person draws at the map's near plane
      // The game's eye (the pass's) is placed for the shot and the order; the frame is drawn from the drawn camera (#479's review F1).
      // LATER 305: the aim point on the game's view line -- the eye toward the moved target (`viewFar`) -- for the shot, the
      // reticle and the use ray alike.
      const aim = third.aim;
      const far = viewFar(aim.eye, aim.target, third.far);
      this.placed = { eye: aim.eye, target: aim.target, far };
      this.frameEye = [third.eye[0] + d[0], third.eye[1] + d[1], third.eye[2] + d[2]];
      this.camera.placeView(this.frameEye, [third.target[0] + d[0], third.target[1] + d[1], third.target[2] + d[2]]);
      this.drawnEye = moved ? [aim.eye[0] + d[0], aim.eye[1] + d[1], aim.eye[2] + d[2]] : null;
      this.drawnTarget = moved ? [aim.target[0] + d[0], aim.target[1] + d[1], aim.target[2] + d[2]] : null;   // `gameCamera`'s
      this.drawnFar = moved ? [far[0] + d[0], far[1] + d[1], far[2] + d[2]] : null;
      return;
    }
    this.frameEye = null;
    const look = this.camera.pose(), yaw = (look.yaw * Math.PI) / 180, pitch = (look.pitch * Math.PI) / 180;
    // FUN_0029ae50 (PF-05): the eye on the skeleton root -- the posed one, as the third-person camera's (`cameraTick`),
    // else a move's or the stance's -- plus the head's offset, the peek across (TRAVERSAL SEAM), turned by the look.
    const root = this.posedRoot ?? this.moves?.rootY() ?? rootY(w.posture);
    // PRONE-TILT-2 (2): prone, the saved floor normal's y (`+0x1348`, D:L142596), the room's frame's too.
    const local = scopeEye(w.posture, root, this.moves?.peek() ?? 0, proneEyeTerms(w.floorNormal[1]));
    const headAt = (feet: Vec3): Vec3 => headEye(w.grid, feet, toWorld(feet, look.yaw, local));   // never past a wall
    const ahead: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const eye = headAt(simFeet);
    const far: Vec3 = [eye[0] + ahead[0] * 1000, eye[1] + ahead[1] * 1000, eye[2] + ahead[2] * 1000];
    this.placed = { eye, target: [eye[0] + ahead[0], eye[1] + ahead[1], eye[2] + ahead[2]], far };
    const seen = moved ? headAt(drawn) : eye;
    this.drawnEye = moved ? [...seen] : null;
    this.drawnTarget = moved ? [seen[0] + ahead[0], seen[1] + ahead[1], seen[2] + ahead[2]] : null;
    this.drawnFar = moved ? [seen[0] + ahead[0] * 1000, seen[1] + ahead[1] * 1000, seen[2] + ahead[2] * 1000] : null;
    this.camera.placeView(seen, null);
    // OBF-1 (`HEAD_VIEW_NEAR_ADAPTATION`, OBF.R1): a wall inside the map's near rectangle is not cut away -- the plane is
    // drawn in short of it; the eye above, the shot's and the game's, does not move.
    this.setViewNear(headViewNear(w.grid, seen, ahead, this.camera.aspect?.()));
  }

  /** OBF-1: hands the camera the head view's near plane when it changes (`WalkCamera.setViewNear`). */
  private setViewNear(near: number | null): void {
    if (near === this.viewNear) return;
    this.viewNear = near;
    this.camera.setViewNear?.(near);
  }
}
