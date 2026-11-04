import type { UiDrawItem } from '../compositor/drawList';
import { DIALOG_EVENTS } from '../dialog';
import { measureText } from '../text/layout';
import type { TextFace } from '../text/face';
import type { UiVarManager } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import { glyphsAt, pushIf } from '../widgets/draw';
import { PAD, STICK, padByte, type WidgetPad } from '../widgets/pad';
import {
  SKB_FN, SKB_KEY_TYPE, SKB_PIECE_ATLAS_READING, findSoftKeyboard, isEmptySkbKey, sameSkbKey,
  type SkbCommon, type SkbKey, type SkbLayout, type SkbTextProps, type SoftKeyboardParams,
} from './params';
import { skbBlank, skbGridCase, skbRaise, skbString, skbWithinCaps, skbWrap } from './text';
import type { TextInputRequest } from './textInput';
import { usbKeyAction, type UsbKey } from './usb';

/**
 * The soft keyboard (PLAT-17; web research 119 §3-§10): one keyboard at a time, code-drawn over the screen (the scene
 * root `AllSkbsRoot`, `FUN_003958d0` D:L288961-289031), taking the pad before the screen does while it is up (the
 * dispatch's step 2, `FUN_0038dc00` D:L284170-284197), ticked at the dialog host's A8 (`FUN_0038d8f0`
 * D:L284051-284097). Its state is the original's globals, named: `DAT_0049ecd0` the active layout, `DAT_0049ecc0` /
 * `DAT_0049ecc8` the highlight, `DAT_004a1348` / `DAT_004a1350` the text cursor, `DAT_004a1330` the recipient edit's
 * focus, `DAT_004a0a60` the mode, `DAT_004a1078` the scale, `DAT_004a1070` / `DAT_004a10b8` the repeat. The screen
 * underneath hears it through its event records (`SoftKeyboardHost.event`, `FUN_00367810`), with the typed text as the
 * animation's argument. `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The events it posts (`FUN_001f3bf0`'s ladder, research 119 §8). */
export const SKB_EVENTS = {
  APPLY: DIALOG_EVENTS.ON_SKB_APPLY!, APPLY2: DIALOG_EVENTS.ON_SKB_APPLY2!, CLOSE: DIALOG_EVENTS.ON_SKB_CLOSE!, CANCEL: DIALOG_EVENTS.ON_SKB_CANCEL!,
} as const;

/** `FUN_00395de0`'s slots (the six `CommonSoftKeyboardProps` sounds, `SkbCommon.sounds`). */
export const SKB_SOUND = { SCALE_UP: 0, SCALE_DOWN: 1, NAVIGATION: 2, KEY_PRESS: 3, ENTER: 4, NEGATIVE: 5 } as const;

/** The valve the scripts wait on (0x3fb3b8) and the TEAM/ALL valve (0x3fabb8). */
export const SKB_DONE_VALVE = 'skb_done';
export const SKB_RECIPIENT_VALVE = 'ChatRecipient';

/** MENUFADER's opacity while a keyboard is up (`FUN_0036a210(0.5)`, D:L282681) and after its close (D:L288589). */
export const SKB_FADER_OPACITY = 0.5;

/** The four highlight moves of `FUN_0038c450`: column -1 / +1, row -1 / +1. */
type Move = 'left' | 'right' | 'up' | 'down';

/**
 * SKB_RECIP_NODES_READING: the TEAM/ALL images (`SkbRecipState0.tif` / `SkbRecipState1.tif`, D:L283007) are bound only
 * for a layout with a `Recip` key (`FUN_0038b8f0` with key 1); the toggle (the key, or the USB Tab, `FUN_00396220`
 * D:L289181-289203) acts only when both exist. `FUN_0038b8f0` was not read line by line. [reading]
 */
export const SKB_RECIP_NODES_READING = 'only a layout with a Recip key toggles' as const;

/**
 * SKB_LEGEND_ORDER_READING: the legend panel (`SkbLegend.tif`, 170 x 230) slides out to the keyboard's right from
 * under it (x from SkbWidth - 170 to SkbWidth, `FUN_003949c0` D:L288453-288477); drawn before the background so the
 * keyboard covers it while it is under. The scene's order was not read. [reading]
 */
export const SKB_LEGEND_ORDER_READING = 'before the background' as const;

/**
 * SKB_TOUCH_READING (a browser adaptation: the PS2 had no pointer, as `MENU_TOUCH_READING`): a tap on a key's button
 * (its `Pos`, its `ButtonSpec` `SIZE`, in the frame at `SkbPos`) puts the highlight on that key's first cell and presses
 * CROSS for one frame; a tap anywhere else while a keyboard is up is lost. [reading]
 */
export const SKB_TOUCH_READING = 'highlight the tapped key, then CROSS one frame' as const;

/** The repeats owed by `t` seconds past `RepeatDelay` (`FUN_003949c0` D:L288488-288540): 0 at or before it. */
export function skbRepeats(t: number, c: Pick<SkbCommon, 'repeatSpeedStart' | 'repeatSpeedEnd' | 'repeatAccelTime'>): number {
  if (t <= 0) return 0;
  const A = c.repeatAccelTime, S = c.repeatSpeedStart, E = c.repeatSpeedEnd;
  const a = Math.min(t, A), ramp = t >= A ? 1 : a / A;
  return Math.trunc(Math.fround(a * (S + (E - S) * 0.5 * ramp) + E * Math.max(0, t - A))) + 1;
}

export interface SoftKeyboardHost {
  /** `FUN_00367810(G, code, text)`: the dialog's event records of `code` started, with `text` (null: each its own `ARGUMENT`). */
  event(code: number, text: string | null): void;
  /** The launch's valves (`skb_done`, `ChatRecipient`); null: none. */
  valves(): ValveStore | null;
  /** The UI variables (`0x437e80`) the text is written to. */
  uiVars(): UiVarManager;
  /** `FUN_00395de0(slot)` (PLAT-23's `UiSoundCues.keyboard`); absent: silent. */
  sound?(slot: number): void;
  /** `FUN_0036a210`: MENUFADER's opacity, when a dialog is built (`DAT_0049ea98`). */
  fader?(opacity: number): void;
  /** One key of the USB queue (`FUN_002dbd90`), null when none. */
  usbKey?(): UsbKey | null;
  /** PLAT-13's faces by name, for the texts and the fit; absent or null: no glyphs, no width test. */
  face?(name: string): TextFace | null;
  /** A `UIMnLOC` key's text (the purpose line); absent or null: the key as written. */
  locText?(key: string): string | null;
}

export interface SoftKeyboardOptions { params: SoftKeyboardParams; host: SoftKeyboardHost }

export class SoftKeyboard {
  params: SoftKeyboardParams;
  /** `DAT_0049ecd0`: the layout up (from the open until the close's scale ends), else null. */
  layout: SkbLayout | null = null;
  /** `DAT_0049ecc0` / `DAT_0049ecc8`: the highlight's cell. */
  col = 0;
  row = 0;
  /** The two lines of the main edit (`0x4a1450`, `0x4a1520`) and the recipient edit (`0x4a1370`), as code points. */
  lines: [number[], number[]] = [[], []];
  recipientCodes: number[] = [];
  /** `DAT_004a1348` / `DAT_004a1350`: the cursor's line and column (in the focused edit). */
  curLine = 0;
  curCol = 0;
  /** `DAT_004a1330`: the recipient edit has the focus. */
  focusRecipient = false;
  /** `DAT_004a0a60`: 0 normal, 1 message mode, 2 Action2 mode. */
  mode = 0;
  /** The `CapsLockOn`, `ShiftOn` and `LegendOn` indicators' visibility: the states themselves. */
  caps = false;
  shift = false;
  legendOn = false;
  /** The legend panel's node, and `DAT_003e04c8` its slide timer (-1 idle). */
  legendShown = false;
  legendTimer = -1;
  /** `DAT_004a1078`: 0 still, 1 scaling up, 2 scaling down; `DAT_004a10c0` its time. */
  scale = 0;
  scaleTime = 0;
  /** `DAT_004a1090`: the cursor's blink clock. */
  blink = 0;
  /** `DAT_004a1070` (an action, 0 none) and `DAT_004a10b8` (its time held). */
  repeatAction = 0;
  repeatTime = 0;
  /** The highlighted key's button shows `PRESSED`. */
  pressed = false;
  /** The background set shown (`FUN_00394520`): 0 normal, 1 shift, 2 two edits, 3 two edits shifted. */
  bgIndex = 0;
  /** The keys, cursor and title shown (from the open's end to the close's start). */
  keysShown = false;
  /** The TEAM/ALL image shown: null none, else the state's. */
  recipShown: 0 | 1 | null = null;
  /** The request (`FUN_00397640`'s stash) and the variable's name (`0x4a1300`). */
  request: TextInputRequest | null = null;
  varName = '';
  /** `DAT_0049ecb8`: the layout's `IgnoreUnchangedString`, latched at the activation. */
  private ignoreUnchanged = false;
  /** The pad of the last input (`DAT_0044f108` as the tick's repeats pass it). */
  private lastPad: WidgetPad = { bytes: [], stick: STICK.NONE };

  constructor(private readonly o: SoftKeyboardOptions) { this.params = o.params; }

  get isOpen(): boolean { return this.layout !== null; }
  /** `FUN_00396ec0`: the scale animation runs. */
  get busy(): boolean { return this.scale !== 0; }
  /** The main text: the two lines joined (`FUN_00399d20`'s join). */
  get codes(): number[] { return [...this.lines[0], ...this.lines[1]]; }
  get text(): string { return skbString(this.codes); }
  get recipient(): string { return skbString(this.recipientCodes); }
  /** The cursor as an index into the focused edit's text. */
  get cursor(): number { return this.curCol + (this.curLine === 1 ? this.lines[0].length : 0); }
  /** The title shown: the purpose, or the mode's (`FUN_00394840`, `FUN_00394920`). */
  get title(): string {
    const r = this.request;
    if (!r) return '';
    return this.mode === 1 ? r.msgPlayerTitle : this.mode === 2 ? r.action2Title : r.purpose;
  }

  /**
   * The typed text let go once the keyboard is down (ONL-07; the owner's ruling OT.R17 on a typed password,
   * `screens/connectCommands.ts` `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`). The original keeps its edit lines until the
   * next activation clears them (`FUN_0038b440`); here the page clears them when the login is answered. Nothing while
   * a keyboard is up (its text is the player's own typing).
   */
  forgetText(): void {
    if (this.layout !== null) return;
    this.lines = [[], []];
    this.recipientCodes = [];
  }

  private sound(slot: number): void { this.o.host.sound?.(slot); }

  // -------------------------------------------------------------------------------------------------------------------
  // The open and the close.

  /**
   * `GetTextInput`'s body (`FUN_0038d770` D:L283990-284046): the request stashed, the layout found by name, activated
   * when none is up, `skb_done` made at PERM and set to 0 (1 when no layout matched), the open sound. True when found.
   */
  open(req: TextInputRequest, varName: string): boolean {
    this.request = req;
    this.varName = varName;
    this.repeatAction = 0;
    this.repeatTime = 0;
    const layout = findSoftKeyboard(this.params.layouts, req.skbName);
    if (layout && !this.layout) this.activate(layout);
    this.o.host.valves()?.set(SKB_DONE_VALVE, layout ? 0 : 1, VALVE_TYPE.PERM);
    this.sound(SKB_SOUND.SCALE_UP);
    return layout !== null;
  }

  /** `FUN_0038b440` (D:L282659-282685) with `FUN_00398ea0` and `FUN_00395540` (D:L288846-288937). */
  private activate(l: SkbLayout): void {
    this.col = l.startGridPos[0] - 1;
    this.row = l.startGridPos[1] - 1;
    this.focusRecipient = false;
    this.lines = [[], []];
    this.recipientCodes = [];
    this.curLine = 0;
    this.curCol = 0;
    this.mode = 0;
    this.o.host.usbKey?.();                                                              // two pending USB keys discarded
    this.o.host.usbKey?.();
    this.keysShown = false;
    this.legendShown = false;
    this.legendTimer = -1;
    this.caps = false;
    this.shift = false;
    this.legendOn = false;
    this.bgIndex = 0;
    this.pressed = false;
    this.scale = 1;
    this.scaleTime = 0;
    this.layout = l;
    this.recipShown = null;
    this.o.host.fader?.(SKB_FADER_OPACITY);
    this.ignoreUnchanged = l.ignoreUnchangedString;
  }

  /** `FUN_0038b390` (D:L282632-282654): the button back, the TEAM/ALL image hidden, the scale-down, `ON_SKB_CLOSE`, the close sound. */
  private close(): void {
    this.pressed = false;
    this.recipShown = null;
    this.scaleTime = 0;                                                                  // FUN_00394420 D:L288249-288273
    this.scale = 2;
    this.caps = false;
    this.shift = false;
    this.legendOn = false;
    this.keysShown = false;
    this.legendShown = false;
    this.o.host.event(SKB_EVENTS.CLOSE, null);
    this.sound(SKB_SOUND.SCALE_DOWN);
  }

  /** `FUN_0038c000` (D:L283106-283113): the Exit key's close, then `ON_SKB_CANCEL`, then the key sound. */
  private exitKey(): void {
    this.close();
    this.o.host.event(SKB_EVENTS.CANCEL, null);
    this.sound(SKB_SOUND.KEY_PRESS);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The pad.

  /**
   * `FUN_0038dc00`: false when no keyboard is up (the dispatch goes on); otherwise the pad is the keyboard's -- swallowed
   * while it scales, else a direction, CROSS, L2 or R2 (`FUN_00394f60`) or the rest and the USB keys (`FUN_0038c990`).
   */
  input(pad: WidgetPad, usb: (() => UsbKey | null) | undefined = this.o.host.usbKey?.bind(this.o.host)): boolean {
    if (!this.layout) return false;
    this.lastPad = pad;
    if (this.busy) return true;
    const action = this.padAction(pad);
    if (action === 0) this.otherButtons(pad, usb);
    else this.act(action, pad);
    return true;
  }

  /** `FUN_00394f60` (D:L288614-288660): the action of this frame's pad, and the repeat's start or stop. */
  private padAction(pad: WidgetPad): number {
    // The direction table at 0x3fb388 (read from the ELF): {stick, button, action}: LEFT, RIGHT, UP, DOWN.
    const DIRS: readonly [number, number, number][] = [[STICK.LEFT, 3, 2], [STICK.RIGHT, 2, 3], [STICK.UP, 4, 1], [STICK.DOWN, 5, 4]];
    let action = 0;
    for (const [stick, button, a] of DIRS) if (padByte(pad, button) === PAD.FALLING || pad.stick === stick) { action = a; break; }
    if (action === 0) {
      if (padByte(pad, 9) === PAD.FALLING) action = 5;                                    // CROSS
      else if (padByte(pad, 13) === PAD.FALLING) action = 6;                              // TRIGGER_L2
      else if (padByte(pad, 11) === PAD.FALLING) action = 7;                              // TRIGGER_R2
    }
    if (action === 0) {
      if (pad.stick === STICK.CENTRED || [3, 2, 4, 5, 9, 13, 11].some((b) => padByte(pad, b) === PAD.RISING)) this.repeatAction = 0;
      return 0;
    }
    this.repeatAction = action;
    this.repeatTime = 0;
    return action;
  }

  /** `FUN_0038dfe0` (D:L284335-284382). */
  private act(action: number, pad: WidgetPad): void {
    switch (action) {
      case 1: this.move('up'); break;
      case 2: this.move('left'); break;
      case 3: this.move('right'); break;
      case 4: this.move('down'); break;
      case 5: this.pressKey(this.keyAt(this.col, this.row), pad); break;
      case 6: this.cursorLeft(); break;
      case 7: this.cursorRight(); break;
    }
  }

  /** `FUN_0038c990` (D:L283439-283497): CROSS's look, CIRCLE, TRIANGLE, R1, SQUARE, SELECT; L1's background; the USB keys. */
  private otherButtons(pad: WidgetPad, usb: (() => UsbKey | null) | undefined): void {
    const b = (code: number): number => padByte(pad, code);
    if (b(9) === PAD.FALLING) this.pressed = true;
    else if (b(9) === PAD.RISING) this.pressed = false;
    else if (b(7) === PAD.FALLING) this.enter();
    else if (b(6) === PAD.FALLING) { this.o.host.event(SKB_EVENTS.CANCEL, null); this.close(); }
    else if (b(10) === PAD.FALLING) { this.caps = !this.caps; this.pickBackground(pad); }
    else if (b(8) === PAD.FALLING) this.backspace();
    else if (b(1) === PAD.FALLING) this.swapFocus();
    if (b(12) === PAD.FALLING || b(12) === PAD.RISING) this.pickBackground(pad);
    if (!usb) return;
    for (let k = usb(); k !== null; k = usb()) this.usbKey(k);
  }

  /** `FUN_0038c130` (D:L283151-283256): step until the cell holds a key that is neither empty nor the one started on. */
  move(dir: Move): void {
    const l = this.layout;
    if (!l || l.grid.length === 0) return;
    this.pressed = false;
    const start = this.keyAt(this.col, this.row);
    for (let guard = 0; guard < 4096; guard++) {
      if (dir === 'left' || dir === 'right') {
        const n = l.grid[this.row]?.length ?? 0;
        this.col += dir === 'right' ? 1 : -1;
        if (this.col < 0) this.col = n - 1; else if (this.col >= n) this.col = 0;
      } else {
        const n = l.grid.length;
        this.row += dir === 'down' ? 1 : -1;
        if (this.row < 0) this.row = n - 1; else if (this.row >= n) this.row = 0;
      }
      const k = this.keyAt(this.col, this.row);
      if (!sameSkbKey(k, start) && !isEmptySkbKey(k)) { this.sound(SKB_SOUND.NAVIGATION); return; }
    }
  }

  /** The key of a cell (`FUN_0038cb90`): the empty key off the grid. */
  keyAt(col: number, row: number): SkbKey {
    return this.layout?.grid[row]?.[col] ?? { type: 0, value: 0 };
  }

  /** `FUN_0038d200` (D:L283759-283850): a key pressed (CROSS, or the touch's). */
  private pressKey(k: SkbKey, pad: WidgetPad): void {
    if (k.type === SKB_KEY_TYPE.SWITCH) {
      this.switchLayout(k.value - 1);
      this.sound(SKB_SOUND.KEY_PRESS);
    } else if (k.type === SKB_KEY_TYPE.FN) {
      switch (k.value) {
        case SKB_FN.CapsLock: this.caps = !this.caps; this.pickBackground(pad); this.sound(SKB_SOUND.KEY_PRESS); break;
        case SKB_FN.Recip: this.toggleRecip(); break;
        case SKB_FN.BackSpace: this.backspace(); break;
        case SKB_FN.Clear: this.clear(); break;
        case SKB_FN.Enter: this.enter(); break;
        case SKB_FN.Exit: this.exitKey(); break;
        case SKB_FN.Apply: this.apply(); this.sound(SKB_SOUND.KEY_PRESS); break;
        case SKB_FN.Legend: this.toggleLegend(); break;
        case SKB_FN.MsgPlayer: this.toggleMessageMode(); break;
        case SKB_FN.Action2: this.toggleAction2(); break;
      }
    } else if (k.type === SKB_KEY_TYPE.CHAR && k.value !== 0) {                           // the empty key is never highlighted
      const raise = this.raised(pad);
      this.insert(skbRaise(skbGridCase(k.value), raise));
    }
    const isShift = k.type === SKB_KEY_TYPE.FN && k.value === SKB_FN.Shift;
    this.shift = isShift ? !this.shift : false;                                          // FUN_003947d0
    this.pickBackground(pad);
    if (isShift) this.sound(SKB_SOUND.KEY_PRESS);
  }

  /** `FUN_00396cb0` (D:L289533-289548): (L1 pressed or held) XOR shift XOR caps lock. */
  private raised(pad: WidgetPad): boolean {
    const l1 = padByte(pad, 12);
    return ((l1 === PAD.FALLING || l1 === PAD.DOWN) !== this.shift) !== this.caps;
  }

  /** `FUN_00394520` (D:L288279-288353): the background set by the case and the mode. */
  private pickBackground(pad: WidgetPad): void {
    const l = this.layout;
    if (!l) return;
    const up = this.raised(pad);
    if (this.mode === 1 && up && l.pieces[3].length > 0) this.bgIndex = 3;
    else if (this.mode === 1 && l.pieces[2].length > 0) this.bgIndex = 2;
    else if (up && ((l.shiftBackground ?? '') !== '' || l.pieces[1].length > 0)) this.bgIndex = 1;
    else this.bgIndex = 0;
  }

  /** `FUN_0038be80` (D:L283047-283101): the layout `SwitchTargets[i]` names, at its start key; the text stays. */
  private switchLayout(i: number): void {
    const name = this.layout?.switchTargets[i];
    const next = name ? findSoftKeyboard(this.params.layouts, name) : null;
    if (!next) return;
    this.layout = next;
    this.col = next.startGridPos[0] - 1;
    this.row = next.startGridPos[1] - 1;
  }

  /** `FUN_00396220` (D:L289181-289203): the TEAM/ALL images flipped, `ChatRecipient` set from the second's (SKB_RECIP_NODES_READING). */
  private toggleRecip(): void {
    const l = this.layout;
    if (!l?.keyProps.some((p) => p.key.type === SKB_KEY_TYPE.FN && p.key.value === SKB_FN.Recip)) return;
    const v = this.o.host.valves();
    const now = (v?.find(SKB_RECIPIENT_VALVE)?.value ?? 0) !== 0 ? 0 : 1;
    if (this.recipShown !== null) this.recipShown = now;
    v?.set(SKB_RECIPIENT_VALVE, now, VALVE_TYPE.PERM);
    this.sound(SKB_SOUND.KEY_PRESS);
  }

  /** `FUN_00396300` (D:L289208-289235): `LegendOn` flipped, the panel shown when on, the slide restarted. */
  private toggleLegend(): void {
    this.legendOn = !this.legendOn;
    if (this.legendOn) this.legendShown = true;
    this.legendTimer = 0;
    this.sound(SKB_SOUND.KEY_PRESS);
  }

  /** `FUN_00399150` (D:L290815-290829) with `FUN_00394840`: message mode toggled; the recipient edit focused, shown and emptied. */
  private toggleMessageMode(): void {
    const was = this.focusRecipient;
    this.mode = this.mode !== 1 ? 1 : 0;
    this.focusRecipient = this.mode === 1;
    if (this.focusRecipient || was) this.cursorToEnd();
    this.recipientCodes = [];
  }

  /** `FUN_00399280` (D:L290858-290873) with `FUN_00394920`: the recipient edit hidden and emptied, Action2 mode toggled. */
  private toggleAction2(): void {
    const was = this.focusRecipient;
    this.focusRecipient = false;
    this.recipientCodes = [];
    if (was) this.cursorToEnd();
    this.mode = this.mode === 2 ? 0 : 2;
  }

  /** `FUN_00399100` (D:L290799-290810): in message mode, the focus swapped. */
  private swapFocus(): void {
    if (this.mode !== 1) return;
    this.focusRecipient = !this.focusRecipient;
    this.cursorToEnd();
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The text.

  /** The face and scale the main text is laid in (`UserStringProps`), for the fit and the cursor. */
  private measure(props: SkbTextProps | null): ((c: readonly number[]) => number) | null {
    const face = props?.font ? this.o.host.face?.(props.font) ?? null : null;
    return face ? (c) => measureText(face, c, props!.scale).width : null;
  }

  /**
   * `FUN_00399ec0` (D:L291415-291530): the character inserted at the cursor of the focused edit when the caps and the
   * fit (`SKB_FIT_READING`) hold -- the cursor one on, `.SKB_TYPE`; else `.NEG` and the blink restarted.
   */
  insert(code: number): boolean {
    const l = this.layout, r = this.request;
    if (!l || !r) return false;
    const c = code === 0x22 && r.noDQuote ? 0x27 : code;
    const recip = this.focusRecipient;
    const base = recip ? this.recipientCodes : this.codes;
    const at = this.cursor;
    const next = [...base.slice(0, at), c, ...base.slice(at)];
    const ok = skbWithinCaps(next, recip ? r.maxBytes2 : r.maxBytes, recip ? r.maxChars2 : r.maxChars) && this.lay(next);
    if (!ok) {
      this.sound(SKB_SOUND.NEGATIVE);
      this.blink = 0;
      return false;
    }
    this.place(at + 1);
    this.sound(SKB_SOUND.KEY_PRESS);
    return true;
  }

  /** `FUN_0039a5b0`: the text laid into the focused edit's lines; false when it does not fit (nothing changed). */
  private lay(codes: number[]): boolean {
    const l = this.layout!;
    const recip = this.focusRecipient;
    const props = recip ? l.msgPlayerString : l.userString;
    const lines = skbWrap(codes, l.userStringWidth * (props?.scale ?? 1) || Infinity, recip || l.userStringLineHeight === 0 ? 1 : 2, this.measure(props));
    if (!lines) return false;
    if (recip) this.recipientCodes = lines[0] ?? [];
    else this.lines = [lines[0] ?? [], lines[1] ?? []];
    return true;
  }

  /** `FUN_0039a1d0` (D:L291535-291616): the cursor at an index of the focused edit's text (line 0 while the index is within it). */
  private place(index: number): void {
    if (this.focusRecipient || this.lines[1].length === 0 || index <= this.lines[0].length) { this.curLine = 0; this.curCol = index; return; }
    this.curLine = 1;
    this.curCol = index - this.lines[0].length;
  }

  /** `FUN_0039a400` (D:L291630-291701): the cursor at the end of the focused edit. */
  private cursorToEnd(): void {
    this.curLine = !this.focusRecipient && this.lines[1].length > 0 ? 1 : 0;
    this.curCol = this.focusRecipient ? this.recipientCodes.length : this.lines[this.curLine as 0 | 1].length;
  }

  /** `FUN_00399c20` (D:L291301-291343): the character before the cursor deleted; at the start the blink restarted; `.SKB_TYPE`. */
  backspace(): void {
    const at = this.cursor;
    if (at < 1) this.blink = 0;
    else {
      const base = this.focusRecipient ? this.recipientCodes : this.codes;
      this.lay([...base.slice(0, at - 1), ...base.slice(at)]);
      this.place(at - 1);
    }
    this.sound(SKB_SOUND.KEY_PRESS);
  }

  /** `FUN_00399b30` (D:L291220-291249): the focused edit emptied. On no US grid. */
  private clear(): void {
    this.lay([]);
    this.place(0);
    this.sound(SKB_SOUND.KEY_PRESS);
  }

  /** `FUN_00399320` (D:L290878-290957): one character right; from line 0's end onto line 1 when it holds text. */
  cursorRight(): void {
    const edit = this.focusRecipient ? this.recipientCodes : this.lines[this.curLine as 0 | 1];
    if (this.curCol < edit.length) this.curCol++;
    else if (this.curLine === 0 && !this.focusRecipient && this.lines[1].length > 0) { this.curCol = 0; this.curLine = 1; }
  }

  /** `FUN_00399530` (D:L290962-291023): one character left; from line 1's start to line 0's end. */
  cursorLeft(): void {
    if (this.curCol >= 1) this.curCol--;
    else if (this.curLine !== 0) { this.curLine = 0; this.curCol = this.lines[0].length; }
  }

  /**
   * ENTER (`FUN_0038c040` D:L283118-283146): a cancel (`FUN_0038c000`) when the text equals the variable's string under
   * `IgnoreUnchangedString`, or is empty or blank without `AllowEmpty`; else the apply, the close and `.THUNK`.
   */
  enter(): void {
    const r = this.request;
    if (!this.layout || !r) return;
    const codes = this.codes;
    const held = this.o.host.uiVars().find(this.varName)?.value;
    const unchanged = this.ignoreUnchanged && held?.type === 'string' && held.value === skbString(codes);
    const blank = !r.allowEmpty && skbBlank(codes);
    if (unchanged || blank) { this.exitKey(); return; }
    this.apply();
    this.close();
    this.sound(SKB_SOUND.ENTER);
  }

  /**
   * `FUN_00399d20` (D:L291348-291396): `UiVar` and `UiVar2` added (temporary when new) and set to the main text and the
   * recipient's, then `ON_SKB_APPLY2` in Action2 mode, else `ON_SKB_APPLY`, with the text.
   */
  private apply(): void {
    const r = this.request!, vars = this.o.host.uiVars();
    const text = this.text;
    vars.set(vars.add(this.varName, null, 1), { type: 'string', value: text });
    vars.set(vars.add(r.uiVar2, null, 1), { type: 'string', value: this.recipient });
    this.o.host.event(this.mode === 2 ? SKB_EVENTS.APPLY2 : SKB_EVENTS.APPLY, text);
  }

  /** `FUN_0038c630` (D:L283325-283434): one USB key. */
  private usbKey(k: UsbKey): void {
    const a = usbKeyAction(k);
    switch (a.kind) {
      case 'char': this.insert(a.code); break;
      case 'enter': this.enter(); break;
      case 'escape': this.close(); this.o.host.event(SKB_EVENTS.CANCEL, null); break;  // FUN_0038be40
      case 'backspace': this.backspace(); break;
      case 'recip': this.toggleRecip(); break;
      case 'left': this.cursorLeft(); break;
      case 'right': this.cursorRight(); break;
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The tick.

  /**
   * A8, `FUN_0038d8f0` (D:L284051-284097): the legend's slide, the blink and the repeats (`FUN_003949c0`; the repeats
   * act only while no popup shows), then the scale (`FUN_00394da0` D:L288548-288609).
   */
  tick(step: number, popupHidden: boolean): void {
    if (!this.layout) return;
    const n = this.slideBlinkRepeat(step);
    if (popupHidden) for (let i = 0; i < n; i++) this.act(this.repeatAction, this.lastPad);
    this.scaleStep(step);
  }

  /** `FUN_003949c0` (D:L288441-288543): answers the repeats owed this tick. */
  private slideBlinkRepeat(step: number): number {
    const c = this.params.common;
    if (this.legendTimer >= 0) {
      this.legendTimer = Math.fround(this.legendTimer + step);
      const sec = this.legendOn ? c.legend.slideOutSec : c.legend.slideInSec;
      if (this.legendTimer / sec > 1) { this.legendTimer = -1; if (!this.legendOn) this.legendShown = false; }
    }
    if (this.scale !== 0) return 0;
    this.blink = Math.fround(this.blink + step);
    if (this.blink > 1) this.blink = Math.fround(this.blink - 1);
    if (this.repeatAction === 0) return 0;
    const before = skbRepeats(Math.fround(this.repeatTime - c.repeatDelay), c);
    this.repeatTime = Math.fround(this.repeatTime + step);
    return skbRepeats(Math.fround(this.repeatTime - c.repeatDelay), c) - before;
  }

  /** The legend panel's x in the keyboard: SkbWidth less the slid part of its width. */
  private legendX(): number {
    const l = this.layout!, c = this.params.common;
    let f = 1;
    if (this.legendTimer >= 0) f = Math.min(1, this.legendTimer / (this.legendOn ? c.legend.slideOutSec : c.legend.slideInSec));
    if (!this.legendOn) f = 1 - f;
    if (this.legendTimer < 0 && !this.legendOn) f = 0;
    return l.skbWidth - (1 - f) * c.legend.size[0];
  }

  private scaleStep(step: number): void {
    const l = this.layout!;
    if (this.scale === 0) return;
    this.scaleTime = Math.fround(this.scaleTime + step);
    const f = Math.fround(this.scaleTime / Math.fround(this.scale === 1 ? l.scaleUpSec : l.scaleDownSec));
    if (f < 1) return;
    if (this.scale === 2) {                                                              // the close's end
      this.scale = 0;
      const v = this.o.host.valves();
      if (v?.find(SKB_DONE_VALVE)) v.set(SKB_DONE_VALVE, 1, VALVE_TYPE.TEMP);
      this.o.host.fader?.(0);
      this.layout = null;
      return;
    }
    this.scale = 0;                                                                      // the open's end
    this.keysShown = true;
    this.blink = 0;
    if (l.keyProps.some((p) => p.key.type === SKB_KEY_TYPE.FN && p.key.value === SKB_FN.Recip)) {
      this.recipShown = (this.o.host.valves()?.find(SKB_RECIPIENT_VALVE)?.value ?? 0) !== 0 ? 1 : 0;   // FUN_0038b580(l, 1)
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Touch (SKB_TOUCH_READING).

  /** A tap at a frame point: 'key' (the highlight moved there: press CROSS), 'lost', or 'none' when no keyboard is up. */
  tap(x: number, y: number): 'key' | 'lost' | 'none' {
    const l = this.layout;
    if (!l) return 'none';
    if (this.busy) return 'lost';
    const px = x - l.skbPos[0], py = y - l.skbPos[1];
    for (const p of l.keyProps) {
      const [w, h] = p.buttonSize ?? p.size ?? [0, 0];
      if (px < p.x || py < p.y || px >= p.x + w || py >= p.y + h) continue;
      for (let r = 0; r < l.grid.length; r++) {
        const c = l.grid[r]!.findIndex((k) => sameSkbKey(k, p.key));
        if (c >= 0 && !isEmptySkbKey(p.key)) { this.col = c; this.row = r; return 'key'; }
      }
    }
    return 'lost';
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The draw.

  /** The keyboard's items over the screen (PLAT-14's draw list), in frame pixels: none when no keyboard is up. */
  draw(): UiDrawItem[] {
    const l = this.layout;
    if (!l) return [];
    const out: UiDrawItem[] = [];
    const [rx, ry] = l.skbPos;
    const quad = (node: string, texture: string | null, x: number, y: number, w: number, h: number, uv: [number, number, number, number] = [0, 0, 1, 1], rgb: [number, number, number] = [128, 128, 128]): void => {
      out.push({ kind: 'sprite', node, texture, x0: x, y0: y, x1: x + w, y1: y + h, u0: uv[0], v0: uv[1], u1: uv[2], v1: uv[3], rgba: [...rgb, 128], clip: null });
    };
    const scaling = this.scale !== 0;
    const t = Math.fround(this.scaleTime / Math.fround(this.scale === 1 ? l.scaleUpSec : l.scaleDownSec));
    const f = !scaling ? 1 : Math.min(1, this.scale === 1 ? t : 1 - t);
    // FUN_00397950 (D:L290002-290050): from (-SkbPos.x, 448 - SkbPos.y) to the place, sizes x f (truncated).
    const fx = -rx, fy = 448 - ry;
    const at = (x: number, y: number): [number, number] => [rx + fx + f * (x - fx), ry + fy + f * (y - fy)];
    if (this.legendShown && !scaling) {
      const c = this.params.common.legend;
      quad('SkbLegend', c.texture, rx + this.legendX(), ry, c.size[0], c.size[1]);
    }
    const single = this.bgIndex === 0 ? l.background : this.bgIndex === 1 ? l.shiftBackground : null;
    if (single) {
      const [x, y] = at(0, 0);
      quad('SkbBackground', single, x, y, Math.trunc(f * l.skbWidth), Math.trunc(f * l.skbHeight));
    }
    for (const p of l.pieces[this.bgIndex as 0 | 1 | 2 | 3]) {
      const [x, y] = at(p.dst.x, p.dst.y);
      const A = SKB_PIECE_ATLAS_READING;
      quad('SkbPiece', p.texture, x, y, Math.trunc(f * p.dst.w), Math.trunc(f * p.dst.h), [p.src.x / A, p.src.y / A, (p.src.x + p.src.w) / A, (p.src.y + p.src.h) / A]);
    }
    if (!this.keysShown) return out;
    const ind = l.indicators;
    for (const [on, r, name] of [[this.caps, ind.capsLock, 'CapsLockOn'], [this.shift, ind.shift, 'ShiftOn'], [this.legendOn, ind.legend, 'LegendOn']] as const) {
      if (on && r) quad(name, 'SkbHighlight.tif', rx + r.x, ry + r.y, r.w, r.h);
    }
    const recipKey = l.keyProps.find((p) => p.key.type === SKB_KEY_TYPE.FN && p.key.value === SKB_FN.Recip);
    if (recipKey && this.recipShown !== null) {
      const [w, h] = recipKey.size ?? recipKey.buttonSize ?? [0, 0];
      quad('SkbRecip', `SkbRecipState${this.recipShown}.tif`, rx + recipKey.x, ry + recipKey.y, w, h);
    }
    const key = this.keyAt(this.col, this.row);
    const kp = l.keyProps.find((p) => sameSkbKey(p.key, key));
    if (kp) {
      const [w, h] = kp.buttonSize ?? kp.size ?? [0, 0];
      quad('SkbKey', this.pressed ? kp.pressed : kp.active, rx + kp.x, ry + kp.y, w, h);
    }
    this.drawText(out, l.purposeString, this.o.host.locText?.(this.title) ?? this.title, 'SkbPurpose');
    const user = l.userString;
    if (user) this.lines.forEach((line, i) => this.drawCodes(out, user, line, 0, i * l.userStringLineHeight, 'SkbUserString'));
    if (this.mode === 1 && l.msgPlayerString) this.drawCodes(out, l.msgPlayerString, this.recipientCodes, 0, 0, 'SkbRecipient');
    if (this.blink < 0.5) {
      const props = this.focusRecipient ? l.msgPlayerString : l.userString;
      const m = this.measure(props);
      const edit = this.focusRecipient ? this.recipientCodes : this.lines[this.curLine as 0 | 1];
      const x = (props?.x ?? 0) + (m ? m(edit.slice(0, this.curCol)) : 0);
      const y = (this.focusRecipient ? l.cursorY2nd : l.cursorY) + this.curLine * l.userStringLineHeight;
      quad('SkbCursor', null, rx + x, ry + y, l.cursorSize[0], l.cursorSize[1], [0, 0, 1, 1], [255, 255, 255]);
    }
    return out;
  }

  private drawText(out: UiDrawItem[], props: SkbTextProps | null, text: string, node: string): void {
    if (props) this.drawCodes(out, props, [...text].map((c) => c.codePointAt(0)! & 0xffff), 0, 0, node);
  }

  private drawCodes(out: UiDrawItem[], props: SkbTextProps, codes: readonly number[], dx: number, dy: number, node: string): void {
    const face = props.font ? this.o.host.face?.(props.font) ?? null : null;
    const [rx, ry] = this.layout!.skbPos;
    pushIf(out, glyphsAt(node, face, codes, rx + props.x + dx, ry + props.y + dy, { scale: props.scale, color: props.color, alpha: 128 }));
  }
}
