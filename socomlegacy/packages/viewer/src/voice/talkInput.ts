import type { PadButton } from '../gamepad';
import { CHAT_HOLD_SECONDS, TauntMenu, type TauntMenuDeps } from '../tauntMenu';

/**
 * SVC-22a (web sprint 20): the talk input. The original has one talk flag (`FUN_0030e6e0(voice, on)`) set by three
 * routes, each read through the selected controller preset (research 170 §4, corrections C5-C8; research 197 §2), and
 * the pad's per-button state byte (research 116 R116.1: 0 up, 1 pressed this frame, 2 held, 3 released this frame):
 *
 * - **Route A, TeamCommand (action 11)**, the round: held past 0.3 s (`DAT_003dcaf8`) it talks (`FUN_002359a0`
 *   D:L84196-84303, the entry D:L84278-84282: the command menu object's state 5 and the flag, no stance of the soldier
 *   -- C5, `VOICE_TALK_STANCE_READING`); released without having talked, it opens the command menu (D:L84284-84300; the
 *   release has no duration test). Both are the page's Chat menu (`../tauntMenu`), which this class owns and feeds:
 *   route A reads its `voiceHeld` (W20.R9, one state machine). The talk ends on the release frame or at the cap, and
 *   the flag is cleared: no resume (C6).
 * - **Route B, SwapWeapon2 (action 10) with RUN AND TALK ON**, the round, only in the menu's ordinary state 4 (closed,
 *   route A not talking; D:L83895-83896): the flag is set in state 2, the frame after the press (D:L83904), and cleared
 *   in state 0, the frame after the release (D:L83906); its weapon swap is suppressed (`FUN_00594cf0` D:L453301-453310
 *   swaps only with the option off, C8). Its own count stops at the cap but leaves the flag set (D:L83904-83915).
 * - **The lobby's CIRCLE** (`VCButton`, research 170 §4.1): the press sets the flag, the release clears it; inert for a
 *   late joiner (game `+0xcc`, ELF 0x27e1c0-0x27e2a0; C11, `VOICE_LATE_JOINER_READING`).
 *
 * A set flag is then cycled as the voice object does: the recording is cut at 10 s and the object waits 10 s in its
 * state 4, which it leaves only on a tick with the flag set once the wait has passed (D:L211255-211265, C6). The wait
 * outlasts a release: a press inside it is silent until it ends, and talks then if still held. So a held lobby or
 * route-B talk is off from 10 s to 20 s and back on at 20 s; route A's own cap comes first. Who hears, the floor and the
 * microphone are not here: the frame says only "talk on / off" and "SwapWeapon2 pressed" (for `../matchLanes`' `swap2`,
 * which RUN AND TALK takes).
 *
 * **The shared TeamCommand timer `+0xdb4`.** A menu closed sets it to 0.3 s (`FUN_00235300` D:L83930-83946, from the
 * menu's states, D:L84328, D:L84336); route A's end sets 0.3 s and adds 1.0 s (`FUN_00236a50` D:L84677-84690); route
 * B's end sets 1.0 s (D:L83910). While it runs route A's whole branch is skipped (neither talk nor menu) and route B
 * does not start (D:L83904); the hold counter `+0xdc8` keeps running from the press (D:L84213, D:L84550), and released
 * frames re-arm the menu (`+0xdcc`, D:L84214). So a TeamCommand press made inside the timer is kept from the Chat menu
 * (whose own reopen delay would drop it) and run here: held across the timer's end it talks once the hold is past
 * 0.3 s; released after the end without having talked it opens the menu; released inside it does nothing.
 * Unread (the review's F9): how soon the menu is back in its idle state 4 after a close -- `FUN_00235300` leaves it in
 * state 3 (D:L83951) until `FUN_00231690` sees the panel's close finish (D:L82474-82495), and while it is in state 3
 * `FUN_002359a0` does not run, so a press made in that gap counts its hold from the talk's end (D:L84433), not from the
 * press. This module assumes state 4 at the press; what settles it is the close's length, or the recomp run named in
 * `VOICE_TALK_LOCKOUT_READING`'s row.
 *
 * **Browser adaptations** (research 197 §2's acceptance; no original): the pad lost (`padPresent`) or the window's focus
 * lost (`focused`) releases the talk, as a release would (its lockout included); a change of the phase, the preset,
 * RUN AND TALK, the talk gate or the late joiner state while a button is held releases the talk too. After any of them
 * every button still held is ignored until it is let go, so nothing resumes and no second action is synthesised
 * without a new press.
 *
 * The preset and RUN AND TALK are inputs: the round's caller passes the page's active controller config (CONTROLLER
 * PRESETS, OPT-14: `../controllerConfigs`, research 344 §7) and the START menu's RUN AND TALK (`DAT_0044d4f8` is .bss, C7;
 * W20.R9); the lobby's passes Default, its CIRCLE being the dialog's own binding.
 */

export type ControllerPreset = 'Default' | 'Reverse' | 'Config4' | 'Goldeneye';

/** One frame's context. */
export interface TalkOptions {
  phase: 'lobby' | 'round';
  preset: ControllerPreset;
  runAndTalk: boolean;
  /** The Chat menu's own gate (`TauntMenu.frame`'s `allowed`): off for the dead and spectators today (`../matchTaunts`). */
  menuAllowed: boolean;
  /**
   * The talk's gate, apart from the menu's: the original's talk start has no alive test online (D:L84278-84281,
   * D:L83895-83920), so whether the dead talk is the caller's, by `VOICE_DEAD_TALK_READING` (research 170 C4, two
   * readings kept). With the menu refused and the talk allowed, route A still talks and a tap opens nothing.
   */
  talkAllowed: boolean;
  /** The late joiner (game `+0xcc`): the lobby's CIRCLE is inert (`VCButton`'s guard). */
  lateJoiner: boolean;
  /** A pad is connected (browser adaptation). */
  padPresent: boolean;
  /** The window has the focus (browser adaptation). */
  focused: boolean;
}

/** One frame's result: the talk flag after the voice object's cycle, and SwapWeapon2's press edge for the swap lane. */
export interface TalkFrame { talk: boolean; swap2: boolean }

/** The two actions a preset binds for voice: TeamCommand (11) and SwapWeapon2 (10); `null` = unbound (slot 0x10). */
export interface TalkBinding { teamCommand: PadButton; swapWeapon2: PadButton | null }

/**
 * The round's talk buttons by preset (research 197 §2's table, read from the disc's `RUN/READERC.ZAR/controller.rdr`
 * through `FUN_002c67f0` D:L167137-167154 and `FUN_002c64e0` D:L166917-166931; research 170 C7, R2-AV §1.7 and W2-R-02
 * agreeing; the table not re-read in this tree, which has no reader for it). Goldeneye binds TeamCommand to SQUARE and
 * leaves SwapWeapon2 unbound, so RUN AND TALK cannot talk there and nothing swaps. [reading]
 */
export const VOICE_ROUND_TALK_BUTTON_READING: Readonly<Record<ControllerPreset, Readonly<TalkBinding>>> = {
  Default: { teamCommand: 'Circle', swapWeapon2: 'L2' },
  Reverse: { teamCommand: 'Circle', swapWeapon2: 'L2' },
  Config4: { teamCommand: 'Circle', swapWeapon2: 'L2' },
  Goldeneye: { teamCommand: 'Square', swapWeapon2: null },
};

/**
 * The game lobby's talk button: CIRCLE, whatever the preset -- `dlgGameLobby`'s own binding of `do_team_button_down` /
 * `_up` (`VCButton(1T)` / `(0T)`, research 170 §4.1; the edges R2-AV §1.6). No hold time, no lockout, no cap of its own.
 */
export const LOBBY_TALK_BUTTON: PadButton = 'Circle';

/**
 * The shared TeamCommand timer `+0xdb4`, seconds: a menu closed, 0.3 s (`FUN_00235300`'s 0x3e99999a); route A's end,
 * that 0.3 s plus 1.0 s (`DAT_003dcb08`, `FUN_002360d0` case 5 D:L84432 through `FUN_00236a50` D:L84677-84690); route
 * B's end, 1.0 s (`DAT_003dcb08`, D:L83910). Research 170 C6; the floats read off the ELF by the review of 2026-10-08
 * (0x3dcb08 = 1.0). [reading]
 */
export const VOICE_TALK_LOCKOUT_READING = { menuClose: .3, teamCommand: 1.3, swapWeapon2: 1 } as const;

/**
 * Route A's cap, seconds: `FUN_002360d0` case 5 ends the talk when the TeamCommand hold counter `+0xdc8` passes
 * `DAT_003dcb00` (D:L84418-84433). The counter runs from the press (cleared on every released frame, D:L84213, and
 * added each tick, `FUN_00236430` D:L84550), so the talk ends 10 s after the press, 9.7 s after it began. Route B
 * compares its own count `DAT_004130a8` with the same constant and only stops counting (D:L83904-83915). The float read
 * off the ELF by the review of 2026-10-08 (0x3dcb00 = 10.0). [reading]
 */
export const VOICE_TALK_CAP_READING = 10;

/**
 * The page's voice object: its recording cap, seconds (`voice+0x30` = 10 000 ms, D:L158881, D:L211217; research 170
 * §10). The client's own state machine; the server's floor constants (`voiceFloor.ts`, SVC-20a) hold the same original
 * value in ms (W20.R5). [reading]
 */
export const VOICE_PAGE_RECORD_CAP_READING = 10;

/**
 * The page's voice object: its wait after a cut, seconds (its state 4, D:L211257-211265; research 170 C6), left only on
 * a tick with the flag set once it has passed, so a held talk is asked again 20 s after it began. The client's own
 * state machine; the server's floor constants (`voiceFloor.ts`, SVC-20a) hold the same original value in ms (W20.R5).
 * [reading]
 */
export const VOICE_PAGE_CUTOFF_WAIT_READING = 10;

type Route = 'none' | 'teamCommand' | 'swapWeapon2' | 'lobby';

/**
 * The talk state machine. Owns the round's Chat menu (`menu`), whose TeamCommand button follows the preset; the page
 * draws and reads that menu as it did its own. `frame` once a frame, with the pad's held set.
 */
export class TalkInput {
  readonly menu: TauntMenu;
  private preset: ControllerPreset = 'Default';
  private context: string | null = null;
  /** The held set of the last frame after the ignored buttons were taken out. */
  private last = new Set<PadButton>();
  /** Buttons still held that are ignored until let go (a loss, a change of context, route A's cap). */
  private ignored = new Set<PadButton>();
  /** The shared TeamCommand timer `+0xdb4`: nothing on either round route before this clock. */
  private lockUntil = -Infinity;
  private route: Route = 'none';
  /** The TeamCommand press: when (the hold counter's start), made inside the timer (kept from the menu), talked, blocked by route B. */
  private pressAt: number | null = null;
  private pressInLock = false;
  private pressTalked = false;
  private pressBlocked = false;
  /** The voice object: recording since `recordAt`, or waiting after a cut until `waitUntil`. */
  private recording = false;
  private recordAt = 0;
  private waitUntil: number | null = null;

  constructor(deps: TauntMenuDeps) {
    const binding = (): PadButton => VOICE_ROUND_TALK_BUTTON_READING[this.preset].teamCommand;
    this.menu = new TauntMenu(Object.create(deps, { teamCommand: { get: binding, enumerable: true } }) as TauntMenuDeps);
  }

  frame(now: number, held: ReadonlySet<PadButton>, o: TalkOptions): TalkFrame {
    const context = `${o.phase}/${o.preset}/${o.runAndTalk}/${o.talkAllowed}/${o.lateJoiner}`;
    const changed = this.context !== null && this.context !== context;
    this.context = context;
    this.preset = o.preset;
    if (!o.padPresent || !o.focused) {
      // Lost: a release, and every button seen held is ignored until it is seen let go with the pad back.
      this.release(now);
      this.menu.reset();
      for (const b of [...this.last, ...held]) this.ignored.add(b);
      this.last = new Set();
      return { talk: this.cycle(now), swap2: false };
    }
    if (changed) {
      this.release(now);
      this.menu.reset();
      for (const b of held) this.ignored.add(b);
    }
    for (const b of [...this.ignored]) if (!held.has(b)) this.ignored.delete(b);
    const pad = new Set([...held].filter((b) => !this.ignored.has(b)));
    const pressed = (b: PadButton): boolean => pad.has(b) && !this.last.has(b);
    let swap2 = false;
    if (o.phase === 'lobby') {
      if (!o.talkAllowed || o.lateJoiner) { if (this.route === 'lobby') this.release(now); }
      else if (pressed(LOBBY_TALK_BUTTON) && this.route === 'none') this.route = 'lobby';
      else if (this.route === 'lobby' && !pad.has(LOBBY_TALK_BUTTON)) this.release(now);
    } else {
      const binding = VOICE_ROUND_TALK_BUTTON_READING[o.preset];
      this.routeB(now, pad, o, binding);
      this.routeA(now, pad, pressed, o, binding);
      const sw = binding.swapWeapon2;
      swap2 = !o.runAndTalk && sw !== null && pressed(sw);
    }
    this.last = pad;
    return { talk: this.cycle(now), swap2 };
  }

  /** Route B, run before route A as `FUN_00236430` runs before `FUN_002360d0` (D:L56689, D:L56691). */
  private routeB(now: number, pad: ReadonlySet<PadButton>, o: TalkOptions, binding: TalkBinding): void {
    const sw = binding.swapWeapon2;
    if (!o.runAndTalk || sw === null || this.menu.isOpen() || this.route === 'teamCommand') return;
    const isHeld = pad.has(sw) && this.last.has(sw);
    const isUp = !pad.has(sw) && !this.last.has(sw);
    if (this.route === 'swapWeapon2') { if (isUp || !o.talkAllowed) this.release(now); }
    else if (this.route === 'none' && isHeld && now >= this.lockUntil && o.talkAllowed) this.route = 'swapWeapon2';
  }

  private routeA(now: number, pad: ReadonlySet<PadButton>, pressed: (b: PadButton) => boolean, o: TalkOptions, binding: TalkBinding): void {
    const team = binding.teamCommand;
    const wasOpen = this.menu.isOpen();
    if (pressed(team)) {
      this.pressAt = now; this.pressTalked = false; this.pressBlocked = false;
      this.pressInLock = now < this.lockUntil && !wasOpen;
    }
    const released = !pad.has(team) && this.last.has(team);
    if (!pad.has(team) && !released) this.pressAt = null;
    // A press made inside the timer is kept from the menu, whose reopen delay would drop it; it is run below.
    const menuPad = this.pressInLock ? new Set([...pad].filter((b) => b !== team)) : pad;
    this.menu.frame(now, menuPad, o.menuAllowed || o.talkAllowed);
    if (!o.menuAllowed && this.menu.isOpen()) this.menu.reset();   // the talk without the menu: a tap opens nothing
    if (wasOpen && !this.menu.isOpen()) this.lock(now, VOICE_TALK_LOCKOUT_READING.menuClose);
    const holding = this.pressInLock
      ? pad.has(team) && this.pressAt !== null && now - this.pressAt > CHAT_HOLD_SECONDS
      : this.menu.state().voiceHeld;
    if (this.route === 'teamCommand') {
      if (!pad.has(team) || !holding || !o.talkAllowed) this.release(now);
      else if (this.pressAt !== null && now - this.pressAt > VOICE_TALK_CAP_READING) {
        // The cap: the flag cleared, and the button ignored until let go (`+0xdcc` cleared: its release opens no menu).
        this.release(now);
        this.ignored.add(team);
      }
      return;
    }
    if (holding && this.route === 'swapWeapon2') this.pressBlocked = true;
    // Route A starts only while route B is not talking (`DAT_004130a0 == 0`, D:L84279), outside the timer.
    if (this.route === 'none' && holding && o.talkAllowed && now >= this.lockUntil && !this.menu.isOpen()) {
      this.route = 'teamCommand'; this.pressTalked = true;
      return;
    }
    // The release edge opens the menu whenever this press did not talk (D:L84284-84300), outside the timer: the cases
    // the Chat menu itself does not see -- a press made inside the timer, or one held past 0.3 s while route B talked.
    if (released && !this.pressTalked && (this.pressInLock || this.pressBlocked) && now >= this.lockUntil && o.menuAllowed && !this.menu.isOpen()) {
      this.menu.frame(now, new Set([...menuPad, team]), true);
      this.menu.frame(now, menuPad, true);
    }
    if (released) { this.pressInLock = false; this.pressBlocked = false; }
  }

  /** `FUN_00236a50` with its third argument 0: set when the timer is out, else added. */
  private lock(now: number, seconds: number): void {
    this.lockUntil = now < this.lockUntil ? this.lockUntil + seconds : now + seconds;
  }

  /** The flag cleared as a release clears it, with the route's lockout. */
  private release(now: number): void {
    if (this.route === 'teamCommand') { this.lock(now, VOICE_TALK_LOCKOUT_READING.menuClose); this.lock(now, VOICE_TALK_LOCKOUT_READING.teamCommand - VOICE_TALK_LOCKOUT_READING.menuClose); }
    else if (this.route === 'swapWeapon2') this.lock(now, VOICE_TALK_LOCKOUT_READING.swapWeapon2);
    this.route = 'none';
  }

  /**
   * The voice object over the flag: records while it is set, cuts at the cap and waits; the wait outlasts a release
   * (D:L211075-211104 leave state 4 alone when the flag goes off) and ends on the first tick past it with the flag set.
   */
  private cycle(now: number): boolean {
    const flag = this.route !== 'none';
    if (this.waitUntil !== null) {
      if (now < this.waitUntil || !flag) return false;
      this.waitUntil = null;
    }
    if (!flag) { this.recording = false; return false; }
    if (!this.recording) { this.recording = true; this.recordAt = now; }
    if (now - this.recordAt >= VOICE_PAGE_RECORD_CAP_READING) {
      this.recording = false;
      this.waitUntil = now + VOICE_PAGE_CUTOFF_WAIT_READING;
      return false;
    }
    return true;
  }
}
