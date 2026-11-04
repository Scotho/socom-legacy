import { STANCES, type HoldClip, type HoldPass, type LauncherClipName, type MoverAction, type Stance, type SwapPick, type TraversalHooks, type Walker, type WalkInput, type PlaySnapshot } from '../mover';
import { ACTION_CLIPS, moverSnapshot, playedOutCommand, TICK } from '../mover';
import { Button, COMMAND_STANCE_CODES, holdOf, STANCE_CODES, type Command } from './protocol';
import { popStance } from '../stanceButton';
import { aimPitchLimitsOf, LookGate, OPEN_LOOK_CONTEXT, type LookContext, type Looked, type LookLog } from './lookGate';

/**
 * One command applied to a mover (web sprint 3, W3.R8): the page's prediction and the server run every tick through
 * this one function, so the two movers see the same look, the same buttons in the same order and the same stick.
 * The steep-ground slide is the mover's own step (`../steepSlide`), so both take it.
 * The rules are `WalkMode`'s own (`./walk`): a stance button while a move holds the mover goes to the move (hanging:
 * stand climbs, crouch/prone let go), prone from a run is the dive, the jump while hanging lets go, the swap is refused
 * while a move holds; the action and lean buttons go to the moves.
 */

/** What one tick did, for the page's bookkeeping (the animator's jump count, the stance shown). */
export interface TickResult { jumped: boolean; stance: Stance; swap: SwapPick | null }

/**
 * READING (named; PF-20, research 217 s3.4, research 211 s2): the lean is read after the stance (`'after'`). The player
 * update `FUN_00594cf0` reads the stance presses (D:L453331-453430) and then the d-pad (D:L453431-453458: `+0x375`
 * written 2, then 1 / 0xff for a held side); the press's pop of the held peek is not the update's -- the per-tick
 * applier `FUN_00552d60` (D:L418875) runs the stance function after the read, and the re-push waits for the next frame.
 * The port's mover takes the press at once (`Traversal.stanceButton` pops the lean and clears its read), so `prepare`
 * reads the command's lean after it, as the update's order has it, and the held d-pad re-peeks the next tick; the page
 * reads its held lean after a stance press the same way (`WalkMode.setStance`).
 */
export const ROOM_LEAN_ORDER_READING = 'after' as const;

/** The moves a mover may carry (`./traversal`'s `Traversal`), with the held action button. */
export type Moves = TraversalHooks & { holdAction?(on: boolean): void };

/**
 * PAR-84 (research 230 section 5.2.10): a launcher clip a command starts -- the raise (`reversed` false) or the still
 * lower (true), by the firearm's action (`../mover` `launcherClipName`), and its own command `at`: the one after the
 * `throw` event's seq, which the room and the page share (the raise is no command bit: the event carries it).
 */
export interface LauncherClip { readonly name: LauncherClipName; readonly reversed: boolean; readonly at: number }

/** PAR-84: the commands a launcher clip lives on from its own: the 84th from the rifle's clip, the 82nd from the pistol's. */
function launcherClipLife(c: LauncherClip): number {
  const a = ACTION_CLIPS[c.name];
  return playedOutCommand(a.playback, a.frames);
}

/**
 * PAR-84 (research 230 section 5.2.10): the room's kept launcher clips (`room.ts` `raiseLauncher`, `launcherDown`), which
 * `MoverSim.prepare` starts. The room may run behind the event, and a command may be lost past its wait or dropped with
 * a backlog (the drop lays only a command's presses, `room.ts` `dropBacklog`): a kept clip starts on the first command run
 * at or after its own, its clock caught up (`Walker.launcherClip`'s `elapsed`) -- none once its life is past. `liveOn`
 * answers for the room's refusals of a raise or a lower riding inside either clip (`FUN_005a8cb0` D:L463159 ->
 * `FUN_005a7de0` -> `FUN_005a7980` D:L462484-462491): a kept clip not yet started on the commands' seqs; a started one
 * while it is still the mover's action (`onMover`, the start's serial) -- F1 of PAR-84's review: a knock, a death or a
 * fall that took it off the body ends the refusal there, as the page's `swapGate` asks its mover (`Walker.swapping`).
 */
export class LauncherClips {
  private readonly kept: { clip: LauncherClip; started: boolean; serial: number | null }[] = [];

  /** `onMover`: the mover's action now (`MoverSim`'s walker); absent, a started clip answers on the seqs alone. */
  constructor(private readonly onMover: (() => MoverAction | null) | null = null) {}

  /** A clip from its own command `clip.at`; those whose life ended before it are forgotten. */
  keep(clip: LauncherClip): void {
    for (let i = this.kept.length - 1; i >= 0; i--) {
      const k = this.kept[i]!.clip;
      if (k.at + launcherClipLife(k) <= clip.at) this.kept.splice(i, 1);
    }
    this.kept.push({ clip, started: false, serial: null });
  }

  /**
   * OT.R59 (RECONNECT-GHOST): every kept clip forgotten -- a resumed seat's launcher lowered at once
   * (`RECONNECT_HELD_LAUNCHER_ADAPTATION`), no raise or lower of the old client's left to start on the new one's commands.
   */
  clear(): void { this.kept.length = 0; }

  /** The kept clip command `seq` starts -- the first not yet started whose own command is at or before it -- or null. */
  next(seq: number): LauncherClip | null {
    const k = this.kept.find((e) => !e.started && e.clip.at <= seq);
    if (!k) return null;
    k.started = true;
    return seq - k.clip.at < launcherClipLife(k.clip) ? k.clip : null;
  }

  /** F1 of PAR-84's review: the mover took `clip` (`next`'s answer) as its action `serial` (`MoverAction.serial`). */
  started(clip: LauncherClip, serial: number): void {
    const k = this.kept.find((e) => e.clip === clip);
    if (k) k.serial = serial;
  }

  /**
   * Whether a kept clip lives on command `seq`: its own through its last before the end (`playedOutCommand`) -- and, once
   * started, only while the mover's action is still the one it started (F1 of PAR-84's review; a start the mover refused
   * holds nothing).
   */
  liveOn(seq: number): boolean {
    const action = this.onMover?.();
    return this.kept.some((e) => seq >= e.clip.at && seq < e.clip.at + launcherClipLife(e.clip)
      && (!e.started || action === undefined || (e.serial !== null && action?.serial === e.serial)));
  }
}

export class MoverSim {
  /** Jumps taken (the animator sees a take-off by the count). */
  jumps = 0;
  /** The weapon in hand: 0 the rifle, 1 the sidearm (`Button.Swap` moves it). */
  weapon: 0 | 1 = 0;
  /** The last command applied. */
  seq = 0;
  /**
   * The turn the last command was let make (rad/s, left positive): derived from its look by the gate (`./lookGate`,
   * OT.R38), never the page's own report -- what cuts an interruptible action (`INTERRUPT_STICK`) and turns the body.
   */
  turn = 0;
  /** NET-LOOK (OT.R38): the look held to the stick's law, the same gate the page's prediction runs (`./lookGate`). */
  gate = new LookGate();
  /**
   * NET-WIRE (research 224 §4): the page's record of the gate's steps, for the facing's replay (`replayLook`); absent on
   * the room's movers, which reconcile nothing.
   */
  lookLog: LookLog | null = null;
  /** What the gate let the last command do: its look and derived turn (the room's cone reads them). */
  looked: Looked = { yaw: 0, pitch: 0, turn: 0, clampedYaw: false, clampedPitch: false };
  /** The weapon in hand's scope and kick for the gate (the room's records); absent, `OPEN_LOOK_CONTEXT`. */
  lookContext: ((weapon: 0 | 1) => LookContext) | null = null;
  /**
   * The seconds a hold clip plays over when not its `playback` (`Walker.hold`'s `period`): a still reload with the held
   * record's `ReloadTime` (`FUN_005a82e0` 462935-462940). The room answers `reloadHoldPeriod` over the same
   * `reloadSeconds` the page's `Fire` announced (review F-A); undefined is the clip's own. Absent: every hold is the
   * clip's own (the page's respawn replay: research 150 §5, owed).
   */
  holdPeriod: ((clip: HoldClip, weapon: 0 | 1) => number | undefined) | null = null;
  /**
   * PAR-74 (research 251 section 12.5, "PAR-74"): the pass of the push a command's hold code stands for (`Walker.hold`'s
   * `pass`, `holdPassOf`) -- asked for `seal_place_claymore` alone, the one code pushed from both sides of the driver. The
   * command carries the code only: the room answers from its own bomb (`room.ts`: its placement's clip `'before'`), the
   * page's run under the dance from the pass it kept with the command (`./walk` `KeptCommand`); absent or undefined, the
   * code's default (the claymore's and the PMN's, after the driver).
   */
  holdPass: ((clip: HoldClip) => HoldPass | undefined) | null = null;
  /**
   * PAR-84 (research 230 section 5.2.10): the launcher clip command `seq` starts, asked in `prepare` before its swap and
   * its hold -- the page's run under a victory dance answers from the clip it kept with the command (`./walk`
   * `KeptCommand`). Absent: the room's kept clips (`launcherClips`).
   */
  launcherClip: ((seq: number) => LauncherClip | null) | null = null;
  /** PAR-84: the room's kept launcher clips (`room.ts` `raiseLauncher`, `launcherDown`), asked when `launcherClip` is absent. */
  readonly launcherClips: LauncherClips = new LauncherClips(() => this.walker.action);

  /**
   * COMBINED-CUT (OT.R93): the controller's `IsAi` (slot +0x30, research 191 section 4) -- true for a bot's mover, whose
   * stance transitions the original refuses to the stick by id (`FUN_00587c20` D:L445536-445545): `prepare` then never
   * lays the cut, whatever the command says. The room marks it, never the wire: a CPU's connection at the seat (match
   * `room.ts` `newSim`, `Conn.cpu`; a respawn's mover carries it) and a seat the bots' brain adopts while it drives it
   * (match `MatchBots.adopt`, cleared at `release`: a Forge NPC on patrol). False: a player's.
   */
  ai = false;

  constructor(readonly walker: Walker, readonly moves: Moves | null) {
    walker.driver = moves;
  }

  /**
   * The command's look and buttons laid on the mover; returns the stick for its tick. Call `walker.tick` with it (the
   * server: `apply`) or hand this to `Walker.advance` as its `beforeTick` (the page).
   */
  prepare(cmd: Command, out?: TickResult): WalkInput {
    const w = this.walker, m = this.moves;
    this.seq = cmd.seq;
    // SEP-POP / COMBINED-CUT (OT.R93): a command that states the mode lays the cut in both modes unless the room has marked
    // this seat AI (`ai`: `IsAi`, the refusal by id), and its mode SEPARATE's own (`Walker.stanceSeparate`).
    if (cmd.separate !== undefined) { w.stanceCut = !this.ai; w.stanceSeparate = cmd.separate; }
    w.commandSeq = cmd.seq;                                      // the heavy landing's coin (LANDING_HIT_DRAW_READING)
    // OT.R38: the look held to the stick's law from where the mover faces, its turn derived (`./lookGate`); a move that
    // holds the yaw (a ladder, its "180") lays its own in the tick, as before.
    const ctx = this.lookContext?.(this.weapon) ?? OPEN_LOOK_CONTEXT, held = (m?.yaw() ?? null) !== null, limits = aimPitchLimitsOf(w);
    this.lookLog?.record(cmd.seq, this.gate, cmd, ctx, held, limits);
    const looked = this.gate.step(w.state, cmd, ctx, held, limits);
    this.looked = looked;
    this.turn = looked.turn;
    w.state.yaw = looked.yaw;
    w.state.pitch = looked.pitch;
    w.turn = looked.turn;
    const b = cmd.buttons;
    const lean = (): void => m?.lean((b & Button.LeanLeft) ? -1 : (b & Button.LeanRight) ? 1 : 0);
    if (ROOM_LEAN_ORDER_READING !== 'after') lean();
    m?.holdAction?.(!w.victoryMotion && (b & Button.ActionHeld) !== 0);
    // The player update's order (`FUN_00594cf0`): the jump (D:L453208-453217), the Action (D:L453218-453243), the swap
    // (D:L453288-453312), the zoom (D:L453313-453323), the stance (D:L453331-453430), the lean (D:L453431-453458). The
    // page keeps it within a tick (`WalkMode`: a jump after any of the others, or an Action after a swap or a stance,
    // waits for the next tick; a swap after a stance is refused; the lean read after a stance), so the two movers agree.
    let jumped = false;
    if (b & Button.Jump) jumped = this.jump();
    if ((b & Button.Action) && !w.victoryMotion) m?.action();
    // PAR-84 (research 230 section 5.2.10): the launcher's raise or still lower this command rides, pushed on the item
    // swap's path before the driver (D:L476734 -> D:L461878-461886): on the stack before the command's swap and hold.
    const clip = this.launcherClip ? this.launcherClip(cmd.seq) : this.launcherClips.next(cmd.seq);
    if (clip && clip.at <= cmd.seq && w.launcherClip(clip.name, clip.reversed, (cmd.seq - clip.at) * TICK)) {
      this.launcherClips.started(clip, w.action!.serial);        // F1 of PAR-84's review: its refusal follows the mover
    }
    let swap: SwapPick | null = null;
    if (b & Button.Swap) {
      const to: 0 | 1 = cmd.weapon ? 1 : 0;
      if (to !== this.weapon && !m?.busy()) {
        swap = w.swapWeapon(to ? 'pistol' : 'rifle');
        if (swap) this.weapon = to;
      }
    }
    // FUN_005c4fd0's gate runs at the press, before the zoom (research 211 §2): the swap above is weighed against the view
    // the last command left, and only then does this command's view count -- the page weighs it against the same
    // (`WalkMode.swapWeapon`), so a zoom step between the press and the tick cannot part the two on the weapon in hand.
    w.scoped = (b & Button.Scope) !== 0;                         // FUN_005966a0: the stick x 0.2 in the 9x view or a scope
    // The kit's one-shot (a throw, the claymore, a still reload) before the stance: PAR-19 (research 251 section 2.4) -- a
    // PORT INVARIANT, not the original's order: a hold and a stance press on one command defer the stance here as on the
    // page (`WalkMode.hold` then `setStance`), so the two movers agree. The original pushes a reload's clip from the kit's
    // timer a later frame than the press (D:L476550-476558), and its same-frame order with the stance applier is unread.
    const hold = holdOf(b);
    if (hold) w.hold(hold, this.holdPeriod?.(hold, this.weapon), hold === 'seal_place_claymore' ? this.holdPass?.(hold) : undefined);
    if (b & Button.Stance) {
      // OT.R67: the prone-pop's code runs the page's own rule (`../stanceButton` `popStance`), so the two movers agree.
      // SEP-POP review N1 (STM.R2a, OT.R93): SEPARATE has no pop -- a SEPARATE walker ignores the code (a crafted command
      // would take COMBINED's pop and SEPARATE's cut together); no SEPARATE page sends it.
      if (COMMAND_STANCE_CODES[cmd.stance] === 'pop') { if (!w.stanceSeparate) popStance(w, m); }
      else this.stance(STANCE_CODES[cmd.stance] ?? 'stand');
    }
    if (ROOM_LEAN_ORDER_READING === 'after') lean();             // the lean after the stance (ROOM_LEAN_ORDER_READING)
    if (out) { out.jumped = jumped; out.stance = w.stance; out.swap = swap; }
    return { forward: cmd.forward, right: cmd.right, boost: (b & Button.Boost) !== 0 };
  }

  /**
   * NET-WIRE (research 224 §4): the room's facing after command `ack` laid on this page's mover and every later command's
   * look replayed through the gate from it (`LookLog.replay`): the facing after each replayed command, or null (no record).
   */
  replayLook(ack: number, facing: { yaw: number; pitch: number }): Map<number, [number, number]> | null {
    const r = this.lookLog?.replay(ack, facing, this.gate) ?? null;
    if (!r) return null;
    this.gate = r.gate;
    this.walker.state.yaw = r.ref.yaw;
    this.walker.state.pitch = r.ref.pitch;
    return r.facings;
  }

  /** A facing the room set (a turret's mount): the next command's look is laid as given (`LookGate.allowSnap`). */
  allowSnap(): void {
    this.gate.allowSnap();
  }

  /** The whole tick: `prepare`, then the mover's step. */
  apply(cmd: Command): TickResult {
    const out: TickResult = { jumped: false, stance: this.walker.stance, swap: null };
    this.walker.tick(this.prepare(cmd, out));
    out.stance = this.walker.stance;
    return out;
  }

  /**
   * `WalkMode.setStance` while walking. Under a held peek the press is the peek's (`TraversalHooks.stanceButton`: the
   * peek ends, no transition, the stance kept; PF-20, `PEEK_STANCE_ENDS_PEEK_READING`). The dive asks no stance gate: the original's full press runs `FUN_0057e540`
   * itself when `FUN_00584b00` passes (`FUN_00594cf0` D:L453386-453390), and `FUN_00552ec0` is asked only by the
   * per-tick applier `FUN_00552d60` (D:L418875) -- so an obstacle 11.2 ahead refuses a still prone, not a running dive
   * (PF-15, research 217 §1.5). Every other change is `Walker.changeStance`'s, gated there for both ends.
   */
  private stance(stance: Stance): void {
    if (!STANCES.includes(stance)) return;
    const w = this.walker, m = this.moves;
    if (m?.busy() || m?.peeking()) { m.stanceButton(w, stance); return; }
    if (stance === 'prone' && w.stance !== 'prone' && m?.dive(w)) return;
    w.changeStance(stance);
  }

  /** `WalkMode.jump` while walking. */
  private jump(): boolean {
    const w = this.walker, m = this.moves;
    if (m?.busy()) return m.jump(w);
    if (!w.jump()) return false;
    this.jumps++;
    return true;
  }

  /** The body as the animator reads it, at the mover's own feet (a server steps whole ticks: nothing to draw between). */
  body(): PlaySnapshot {
    const s = moverSnapshot(this.walker, this.moves, this.jumps, this.turn);
    s.feet = [this.walker.state.x, this.walker.state.y, this.walker.state.z];
    return s;
  }
}
