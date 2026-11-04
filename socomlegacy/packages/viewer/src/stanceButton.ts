import type { PopOutcome, TraversalHooks, Walker } from './mover';
import type { Stance } from './walk';

/**
 * The stance button's tap and hold: the pad's Triangle (`./play`, `main.ts`) and the PC's `C` (`./walk`), one state
 * machine with each its own rules -- and (OT.R67) the stance mode it runs in: the prone-pop by default
 * (`PRONE_POP_ADAPTATION`), else the original's tap and hold with the Crouch and Prone binds (`StanceButton.lanes`).
 */

/**
 * How long the stance button is held before it means prone, seconds -- Triangle on the pad and `C` on the keyboard. A
 * guess: the game does not time the button, it reads its pressure (a light press toggles crouch at release, a full
 * press goes prone at once; `host_crouch_shortcut.h:4-7`, docs/KNOWN.md R139), and a browser pad's button is only on
 * or off, so the owner's rule (2026-09-28: tap crouches, hold goes prone) needs a length, and none is in the
 * repository. 0.4 s is a comfortable tap's ceiling.
 */
export const STANCE_HOLD_S_PLACEHOLDER = 0.4;
/**
 * Research 373 §1 (reading, pending review): the full press's pressure -- `FUN_00594cf0` D:L453336-453341
 * (`0.3 <= pressure` decides at once) and D:L453351 / D:L453380 (the peak `DAT_0066b410` under 0.3 the light press,
 * else the full). Read where a pad gives its stance button's pressure (`./controllerInput` `StancePress`, SEPARATE
 * only); the digital pad keeps the timed hold.
 */
export const STANCE_FULL_PRESS_READING = 0.3;
/**
 * Research 373 §1: the pressure at or under which the button reads released in the pad record's press state (`+7`) --
 * a press begins above it. MOVE-S6's capture (r0004, eph-hunt 2026-11-01 probes `r0004-s6-delivery`) shows `+7` held
 * (1, 2) at 0.2 and 1.0 and idle (0) at 0; under 0.2 the pad's own threshold is not measured.
 */
export const STANCE_PRESS_ACTIVE_PLACEHOLDER = 0;
/**
 * MOVE-S6 (research 373 §1, research 80 §6g; proven by capture 2026-11-03, S6-PROVEN -- the cited lines' re-read by
 * a reviewer still owed): the idle game frames a new stance press needs
 * after the release frame. The press re-arms only when the pad record's `+7` reads 0 (`FUN_00594cf0` D:L453332-453333;
 * r0004's twin 0x59a6e0, the same test at 0x59b448-0x59b458), and `+7` is a press state -- 1 on the press frame, 2
 * held, 3 on the release frame, then 0 (r0004 capture, `r0004-s6-delivery`): a light press 50 ms after a full one's
 * release arrives with no idle frame before it -- while `+7` is still 3, or on the next frame (3 -> 1) -- and is not
 * taken (2/2), one 100 or 150 ms after is (3/3 each). The one-idle-frame probe (r0004 slot 5,
 * `probe-s6-light-after-67.txt` / `-50.txt`, 4 trials each; agent-mail `evidence/eph-hunt-2026-11-01/probes/
 * S6-DELIVERY.md` "2026-11-03", data `r0004-s6-idle`) takes the light press about 67 ms after the release 4/4 and
 * refuses it at about 50 ms 4/4: the timing boundary is proven, within one 30 Hz frame, and 1 fits it. The byte-level
 * rule is narrower: a single release frame then the press is refused, a press after an idle (0) frame taken, and a
 * [3, 3] prefix splits (50 ms t2 refused, 67 ms t3 taken; the light press's first byte 2 against 1) -- the 30 Hz
 * sampled byte alone does not decide [3, 3], by its sampling phase against the function's test.
 */
export const STANCE_PRESS_REARM_READING = 1;

/** What a tap on the pad's stance button does: stand and crouch toggle, and from prone it stands up. */
export function stanceOnTap(stance: Stance): Stance {
  return stance === 'stand' ? 'crouch' : 'stand';
}

/**
 * H338 (the owner, 2026-10-26: follow the original): what a tap on the pad's stance button does in `'separate'` -- the
 * original's (`FUN_00594cf0` D:L453358-453378): stand and crouch toggle, and from prone it crouches (request 2 to 1,
 * D:L453370-453371); where no crouch is allowed, stand (`FUN_005857e0`, `pressInWater`, LATER 492). `stanceOnTap` stays
 * the `'pop'` mode's.
 */
export function stanceOnTapOriginal(stance: Stance): Stance {
  return stance === 'crouch' ? 'stand' : 'crouch';
}

/** What a hold on the pad's does: prone, or from prone up on its feet (the game's full press stands a prone SEAL). */
export function stanceOnHold(stance: Stance): Stance {
  return stance === 'prone' ? 'stand' : 'prone';
}

/** What a tap on `C` does (owner, 2026-09-29): stand and crouch toggle, and from prone it crouches. */
export function stanceKeyOnTap(stance: Stance): Stance {
  return stance === 'crouch' ? 'stand' : 'crouch';
}

/** What a hold on `C` does (owner, 2026-09-29): prone; already prone, nothing. */
export function stanceKeyOnHold(stance: Stance): Stance | null {
  return stance === 'prone' ? null : 'prone';
}

/** LATER 492: what the water allows the local press (`FUN_005857e0`, `FUN_00584c10`), as `Traversal.stanceAllows` reads it. */
export interface StanceAllows { crouch: boolean; prone: boolean }

/**
 * LATER 492 (LATER 434's review, F1; research 87 1.13): the local press's water columns, `FUN_00594cf0`'s own table --
 * the tap (a press whose pressure peaked under 0.3: `DAT_0066b410`, D:L453336-453351; D:L453358-453369; the port's tap
 * and hold are by time, `STANCE_HOLD_S_PLACEHOLDER`) and the hold (D:L453393-453416), from the request, with `FUN_005857e0`
 * (crouch allowed: water no deeper than 8.5, D:L444334-444355) and `FUN_00584c10` (prone allowed: no deeper than 2,
 * D:L444022-444031). Crouch not allowed: stand, tap or hold. A hold with crouch allowed and prone not: stand to crouch,
 * the others to stand. Otherwise the dry rule (`dry`: the button's own -- the original's where both are allowed, the
 * owner's tap from prone aside). The hold's dive comes first in the original (`FUN_00584b00`, which also needs water no
 * deeper than 2), so it only ever meets the dry column. `FUN_00552ec0` refuses a local actor's deep requests
 * (D:L418945-418946, D:L418973-418974): the press never asks one. Null `allows`: no water known, the dry rule.
 */
export function pressInWater(kind: 'tap' | 'hold', stance: Stance, allows: StanceAllows | null, dry: Stance | null): Stance | null {
  if (!allows) return dry;
  if (!allows.crouch) return 'stand';
  if (kind === 'hold' && !allows.prone) return stance === 'stand' ? 'crouch' : 'stand';
  return dry;
}

/**
 * STANCE_LAUNCHER_WATER_READING (LATER 492's review, F2): `FUN_005857e0` allows the launcher's anim set (`+0x528` ==
 * `DAT_0044d408`) a crouch at any depth, before its depth test (D:L444334-444340); the request is then accepted and,
 * over 8.5 deep, `FUN_00581990` stands the SEAL with the stance word's bit (D:L442580). The port's press table takes the
 * depth alone (`Traversal.stanceAllows`): with the launcher raised 9 deep a tap asks stand, where the original asks
 * crouch and is stood up with its word. Settles it: the launcher's set read into `stanceAllows`, the accepted deep crouch
 * then stood by the water with its bit.
 */
export const STANCE_LAUNCHER_WATER_READING = 'the depth alone: the launcher set not asked' as const;

/** A button's two meanings: the stance a tap and a hold go to from a stance (null: nothing). */
export interface StanceRules {
  tap(stance: Stance): Stance | null;
  hold(stance: Stance): Stance | null;
}

/** The pad's Triangle (owner, 2026-09-28). */
export const PAD_STANCE: StanceRules = { tap: stanceOnTap, hold: stanceOnHold };
/** H338: the pad's Triangle in `'separate'` -- the original's tap (`stanceOnTapOriginal`). */
export const PAD_STANCE_SEPARATE: StanceRules = { tap: stanceOnTapOriginal, hold: stanceOnHold };
/** The PC's `C` (owner, 2026-09-29). */
export const KEY_STANCE: StanceRules = { tap: stanceKeyOnTap, hold: stanceKeyOnHold };

/**
 * OT.R67: the stance modes -- `'pop'`, the prone-pop (`PRONE_POP_ADAPTATION`); `'separate'`, the original's tap and hold
 * on the stance button, with Crouch and Prone as two binds of their own (unbound by default; the console seat's).
 * STM.R1 (the owner, 2026-10-30): named COMBINED and SEPARATE on screen (`./startupSettings` `STANCE_MODE_WORDS`); in
 * SEPARATE the pad's Triangle is taken from the game while Prone is bound and the binds act there only (`./controllerInput`
 * `poll`; STM.R1a, the review's F1)
 * -- this machine stays mode-generic: the keyboard's C and the touch C still take the stance button in SEPARATE.
 */
export type StanceMode = 'pop' | 'separate';

/**
 * OT.R76 -- ADAPTATION (no original; the owner's word, 2026-10-23, in the merge controller's seat, on Benny's PR #461:
 * "port it into the live controls, replacing the double tap"; the original's quirk is not claimed): what `'pop'` is
 * since -- the stance button the original's tap and hold (`update`: a tap toggles stand and crouch at the release, a
 * hold of `STANCE_HOLD_S_PLACEHOLDER` goes prone, the dive while running); a hold's prone, or the Prone bind's press,
 * that starts a new drop to prone or a dive opens the pop's window on that motion (`StanceTarget.pronePress`); the
 * jump button's next fresh press inside it pops (`./walk` `WalkMode.jumpPress`: the existing pop, its command code, its
 * 260 ms rise, the headroom asked), else it is the native jump. The window is the motion's life and closes on a fresh
 * stance press, a menu, focus lost, a mode change, or a new mover. The second press of the stance button no longer
 * pops (OT.R67's double tap, retired). It follows the binds: whatever the stance button, Prone and Jump are bound to.
 * The window is COMBINED's (`'pop'`) only. STM.R2a (the owner, 2026-10-30: "Separate should function EXACTLY as the
 * original"): SEPARATE is the original's stance machine with no adaptation of its own, so the window never opens there
 * and the jump inside a dive or a drop is the native jump (`StanceButton.lanes`; STM-2's first build, 7c237f64c, which
 * had carried the window into SEPARATE on STM.R2, undone).
 */
export const TRIANGLE_SQUARE_POP_ADAPTATION = 'a hold\'s drop or dive, then a fresh jump press: the pop' as const;

/**
 * OT.R67 -- ADAPTATION (no original; the owner's word, 2026-10-20, in the merge controller's seat: "put it in the game.
 * It should be the default option. the fallback option should be having the ability to bind prone and crouch as two
 * separate keybinds, as those who use emulators do"): the stance mode a browser starts in, the prone-pop. Benny's
 * playtest (`playtests/prone-pop/`, PRs #390 and #403, retired with this) made the game's, on the stance button of every
 * lane -- the pad's Triangle, the keyboard's `C`, the touch C -- online too, with the room (`./net/moverSim`):
 * the pop itself (`popStance`): no get-up clip and no mover hold, the stance word and the posture stand's (the hull, the
 * headroom and the hit volumes with them), the place's headroom still asked; the body's rise is
 * `PRONE_POP_RISE_S_ADAPTATION` (`./animator`). OT.R76 changed what asks it: no longer a second press of the stance
 * button (the double tap, retired) but a fresh jump press inside a hold's drop or dive (`TRIANGLE_SQUARE_POP_ADAPTATION`).
 * The parity rule's clause on playtest preferences is not changed: this one is applied by the owner's word (MISSION
 * OT.R67). `'separate'` (a browser-wide controller setting, the console seat's) runs the original's machine unchanged:
 * no adaptation of its own, no pop and no pop window (STM.R2a, the owner, 2026-10-30: "Separate should function EXACTLY
 * as the original"); only STM.R1's layout of the buttons (Prone on Triangle's button, Crouch its own) is its.
 */
export const PRONE_POP_ADAPTATION: StanceMode = 'pop';

/** OT.R67: what a frame of the stance lanes did -- nothing, refused, an ordinary stance asked, or a pop (`PopOutcome`). */
export type StanceAct = 'none' | 'blocked' | 'stance' | 'dive' | 'drop' | 'prone';

/**
 * OT.R67: one frame of the stance lanes (`StanceButton.lanes`) -- the stance button (`triangle`: the pad's Triangle, the
 * keyboard's or the touch C), and the Crouch and Prone binds (absent: unbound). `prone` is the full press in both modes
 * (PP-5, the merge controller's call). `crouch` is read in `'separate'` only, and the game leaves it unfed: the pad
 * profile's Crouch bind goes through `WalkMode.crouch()` on its release (`./matchLanes`), the same rule at the same
 * moment -- feeding this lane too would toggle crouch twice. STM.R1a: the pad feeds both binds in SEPARATE only
 * (`./controllerInput` `poll`); COMBINED keeps them in the profile, unread.
 */
export interface StanceLanes { triangle: boolean; crouch?: boolean; prone?: boolean }

/**
 * What the stance lanes act on (`./walk` `WalkMode`; a test's own): the request each press toggles from (PAR-19,
 * `stanceIntent`), the ordinary stance asked (`setStance`), and OT.R76's pop window's two (`pronePress`, `disarmPop`) --
 * absent, a prone is asked by `setStance` and no window opens.
 */
export interface StanceTarget {
  stanceIntent(): Stance;
  setStance(stance: Stance): boolean;
  /** OT.R76: a stance press's prone, which opens the pop's window when it starts a drop or a dive (`WalkMode.pronePress`). */
  pronePress?(): boolean;
  /** OT.R76: the pop's window closed (a fresh stance press). */
  disarmPop?(): void;
  /** LATER 492: what the water allows the press now (`Traversal.stanceAllows`); absent or null, no water known. */
  stanceAllows?(): StanceAllows | null;
}

/**
 * OT.R67 (`PRONE_POP_ADAPTATION`): the prone-pop on a mover and its moves, the page's (`WalkMode.popStance`) and the
 * room's (`MoverSim.prepare`, the command's stance code `'pop'`) alike, so the two agree: out of the dive
 * (`Traversal.cancelDive`), else -- unless a move holds the mover or the peek holds, whose press is the original's --
 * up from prone (`Walker.popStand`). Null where there is no pop (the press is then the ordinary one).
 */
export function popStance(w: Walker, m: TraversalHooks | null): PopOutcome {
  const dive = m?.cancelDive?.(w) ?? null;
  if (dive !== null) return dive;
  if (m?.busy() || m?.peeking()) return null;
  return w.popStand();
}

/**
 * The stance button as a state machine, one `update` a frame: a press let go inside `STANCE_HOLD_S_PLACEHOLDER` is a
 * tap and acts at the release, as the game's light press does; a press held that long acts at that moment (the game's
 * full press acts at once) and its release then does nothing. Returns the stance to go to, or null. `lanes` runs it in
 * a stance mode (OT.R67).
 */
export class StanceButton {
  private held = 0;
  private was = false;
  private acted = false;
  /** OT.R67: the mode last run (`lanes`): a change forgets a press under way. */
  private mode: StanceMode | null = null;
  /** OT.R76: the stance button down last frame, for its fresh press (which closes the pop's window). */
  private popWas = false;
  /** OT.R67, `'separate'`: the Crouch and Prone binds down last frame. */
  private crouchWas = false;
  private proneWas = false;

  constructor(private readonly holdSeconds = STANCE_HOLD_S_PLACEHOLDER, private readonly rules: StanceRules = PAD_STANCE) {}

  /**
   * OT.R67: one frame of the stance lanes in `mode` on `t` -- the seam a page feeds its setting and its buttons through
   * (`./matchLanes` `playerLanes`, `./walk`'s `C` and touch C). `'separate'`: the stance button is `update`'s (this
   * button's own rules: `PAD_STANCE` the pad's, `KEY_STANCE` the keys'); Crouch is the game's light press, at its release
   * (`FUN_00594cf0` D:L453355-453376: stand and crouch toggle, prone to crouch -- `WalkMode.crouch`'s rule); Prone the
   * full press, at once (D:L453377-453425, `stanceOnHold`); each from the request (PAR-19, D:L453351-453354). `'pop'`
   * (OT.R76, `TRIANGLE_SQUARE_POP_ADAPTATION`): the stance button is `update`'s too; its prone and the Prone bind's go
   * through `pronePress` (which can open the pop's window), and a fresh stance press closes the window (`disarmPop`).
   * The window is COMBINED's only: `'separate'` is the original's machine, no adaptation of its own (STM.R2a, the owner,
   * 2026-10-30), and asks `setStance` alone.
   */
  lanes(mode: StanceMode, lanes: StanceLanes, dt: number, t: StanceTarget): StanceAct {
    // The gameplay seat's note 1: a Prone held across a change of mode is no new press (only a fresh one acts).
    if (mode !== this.mode) { if (this.mode !== null) { this.reset(); this.proneWas = lanes.prone === true; } this.mode = mode; }
    // PP-5: a bound Prone's edge is the original's full press (`stanceOnHold`, FUN_00594cf0 D:L453377-453425) in both
    // modes, through the walk's rules (locked, dead, the hang, the peek, the air, the dive) -- never the pop itself; in
    // 'pop' its prone goes through `pronePress`, so a drop it starts opens the pop's window (OT.R76: the sequence follows
    // the binds; never in 'separate', STM.R2a). A Prone and a fresh stance press on one frame: the press closes any window
    // first, the Prone's drop then opens its own, and the stance press's tap takes the original's rule at its release.
    const prone = lanes.prone === true, proneEdge = prone && !this.proneWas;
    this.proneWas = prone;
    // OT.R76: in 'pop' a fresh stance press closes the pop's window, and a prone the stance button's hold or the Prone
    // bind asks goes through `pronePress`, which opens it on a new drop or dive; 'separate' asks `setStance` alone -- the
    // original's machine, no window (STM.R2a, the owner, 2026-10-30: "Separate should function EXACTLY as the original";
    // the gate 7c237f64c dropped, restored).
    const pop = mode === 'pop';
    if (pop && lanes.triangle && !this.popWas) t.disarmPop?.();
    this.popWas = lanes.triangle;
    const ask = (stance: Stance): boolean => (pop && stance === 'prone' && t.pronePress ? t.pronePress() : t.setStance(stance));
    let act: StanceAct = 'none';
    const allows = t.stanceAllows?.() ?? null;                // LATER 492: the press's water columns
    // H338: the pad's rules in 'separate' are the original's tap (from prone, a crouch).
    const rules = mode === 'separate' && this.rules === PAD_STANCE ? PAD_STANCE_SEPARATE : this.rules;
    const go = this.update(lanes.triangle, dt, t.stanceIntent(), allows, rules);
    if (go !== null && ask(go)) act = 'stance';
    // After the stance button's own, in both modes (the batch review's F5).
    const full = proneEdge ? pressInWater('hold', t.stanceIntent(), allows, stanceOnHold(t.stanceIntent())) : null;
    if (full !== null && ask(full)) act = 'stance';
    if (mode === 'separate') {
      const crouch = lanes.crouch === true;
      const light = !crouch && this.crouchWas
        ? pressInWater('tap', t.stanceIntent(), allows, t.stanceIntent() !== 'crouch' ? 'crouch' : 'stand') : null;
      if (light !== null && t.setStance(light)) act = 'stance';
      this.crouchWas = crouch;
    }
    return act;
  }

  update(down: boolean, dt: number, stance: Stance, allows: StanceAllows | null = null, rules: StanceRules = this.rules): Stance | null {
    let go: Stance | null = null;
    if (down) {
      // The press's own frame counts nothing: its `dt` is mostly time before the press, and a long one (a hitch) would
      // turn a tap into a hold. The hold is timed from the frame after, as late as one frame against the threshold.
      if (!this.was) { this.held = 0; this.acted = false; } else this.held += dt;
      if (!this.acted && this.held >= this.holdSeconds) { this.acted = true; go = pressInWater('hold', stance, allows, rules.hold(stance)); }
    } else if (this.was && !this.acted) {
      go = pressInWater('tap', stance, allows, rules.tap(stance));
    }
    this.was = down;
    return go;
  }

  /**
   * Forgets a press under way (the walk left, the page lost the keyboard): its release is then no tap. OT.R67: the
   * prone-pop's and the binds' too; `held`, the stance button is down now, and its press is spent until let go.
   */
  reset(held = false): void {
    this.held = 0;
    this.was = held;
    this.acted = held;
    this.popWas = held;
    this.crouchWas = false;
    this.proneWas = false;
  }

  /**
   * LATER 436 (the review's F1 on acc7ee3a6): forgets the stance button's press alone -- an agent's Triangle let go
   * (`./matchMount`'s release), whose release is then no tap -- and keeps the Crouch and Prone binds' edges, which are
   * the person's own: a Prone held across it is no new press. Not `reset`, which a menu or a lost keyboard asks.
   */
  forgetPress(): void {
    this.held = 0;
    this.was = false;
    this.acted = false;
    this.popWas = false;   // the pop lane's edge too (the review's finding 3, folded at B143's landing)
  }
}
