import type { ButtonSpec, ButtonState, DialogBinding, DialogUiVar } from '../dialog';
import { DIALOG_EVENTS } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { newSprite, stepImagePulse, type UiSprite } from '../compositor/scene';
import { captionCodes } from '../text/captions';
import { decodedCodes, engineCodes } from '../text/codes';
import type { TextFace } from '../text/face';
import { toInt } from '../text/f32';
import {
  deactivateButton, enterButtonState, newButtonLook, pressButton, setButtonEnabled, tickButton,
  type ButtonStateName, type ButtonTextLook,
} from '../text/states';
import type { UiVariable } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { glyphsAt, pushIf, spriteAt } from './draw';
import {
  commandU16, nodeOp, printUiVar, startBinding, uiVarValueOfSpec,
  type Widget, type WidgetCommandAnswer, type WidgetContext, type WidgetHost,
} from './host';
import { PAD, STICK, padByte, type WidgetPad } from './pad';

/**
 * BUTTON -- `C2DButton` (run-time vtable 0x407790), and the base SLIDERBAR, CHECKBOX and RADIOSTRIP build on (web
 * research 117 §2). The caption's colour states and its glow are PLAT-13's (`text/states.ts`, research 111 §4), which
 * this class drives; the body (+0x1a0, the state's `IMAGE`) and its `PULSE`, the bindings and the commands are here.
 *
 * Made by `FUN_00380470` (D:L276659-276672): the constructor `FUN_00377800`, the face, the set-up `FUN_00376bd0`
 * (D:L271696-271854: sizes, offsets, the four states, the `ANIMATIONS`, the `UIVAR` attached and read), then
 * `FUN_00380500` (D:L276677-276718): the four textures and the caption through `FUN_0036a3b0` (D:L264903-264925: the
 * caption set, then the attached var's value over it), and **set normal** (vtable +0x54) -- so a new button is NORMAL
 * (research 111's `BUTTON_START_STATE_READING`, here traced).
 */

/** The run-time entries' event: `ONACTIVATE` (`ParseButtonAnim`, code 2). */
const ON_ACTIVATE = DIALOG_EVENTS.ONACTIVATE!;

/** The `Valve` command's text when the name at +8 is empty: the 16-byte buffer at 0x3e03f0, `"0"` (read in the ELF). */
export const VALVE_COMMAND_EMPTY_TEXT = '0';

/** The caption's text through the setter with translation on (vtable +0x70 with 1, `FUN_003631f0`): PLAT-13's rule. */
export function textCodes(ctx: WidgetContext, text: string): number[] {
  return captionCodes(text, ctx.captions).codes;
}

/**
 * The base handler `FUN_0036fcc0` (D:L268005-268080) on a text: op 1 `Caption` -- the UIMnLOC string of the s16 at
 * +0xc when non-zero (vtable +0x74), else the name at +8 through the setter -- and op 2 `Valve` -- `"%d"` of the valve
 * named at +8, acquired PERM (`FUN_00351ff0(v, 1)`), or `VALVE_COMMAND_EMPTY_TEXT` when the name is empty. Returns the
 * new text's codes, or null when the op is neither. `Caption` writes the answer 1 (D:L268076); `Valve` writes none,
 * which the dispatcher reads as 1 (D:L121365).
 */
export function baseTextCommand(cmd: ZAnimUiCommand, ctx: WidgetContext): number[] | null {
  const op = nodeOp(cmd);
  if (op === 2) {
    let text = VALVE_COMMAND_EMPTY_TEXT;
    if (cmd.arg !== '' && ctx.valves) text = String(ctx.valves.acquire(cmd.arg, 1).value);
    return engineCodes(text);
  }
  if (op === 1) {
    if (cmd.loc !== 0) { const s = ctx.locText(cmd.loc); return s === null ? [] : decodedCodes(s); }
    return textCodes(ctx, cmd.arg);
  }
  return null;
}

/** A state's block by name (the run-time order: PRESSED +0xc8, ACTIVE +0xfc, NORMAL +0x130, DISABLED +0x164). */
const blockOf = (spec: ButtonSpec, s: ButtonStateName): ButtonState =>
  (s === 'NORMAL' ? spec.normal : s === 'ACTIVE' ? spec.active : s === 'PRESSED' ? spec.pressed : spec.disabled);

export class ButtonWidget implements Widget {
  /** The caption: its look (PLAT-13's state machine) and its codes; `caption` false while +0x18 is null. */
  readonly look: ButtonTextLook;
  captionCodes: number[] = [];
  caption = false;
  /** +0x1a0: the body, the state's texture over XSIZE x YSIZE (`FUN_0036e840`). */
  readonly body: UiSprite;
  readonly face: TextFace | null;
  /** +0x240 / +0x244 as floats (D:L271723-271724). */
  readonly size: [number, number];
  /**
   * The children (the list at +4/+8; its count at +0): a RADIOSTRIP's subordinates, which its own +0x44 does not hand
   * the pad to; a plain BUTTON's record has none (research 117 §2.3: the screen's control list is the case).
   */
  children: readonly Widget[] = [];

  constructor(readonly name: string, readonly type: string, readonly spec: ButtonSpec, protected readonly ctx: WidgetContext, uivar: DialogUiVar | null) {
    this.look = newButtonLook(spec);
    this.size = [spec.size[0], spec.size[1]];
    this.body = newSprite(null, this.size[0], this.size[1]);
    const fontName = spec.font ?? ctx.font;
    this.face = fontName === null ? null : ctx.face(fontName);
    // FUN_0036a3b0: the caption, then the attached var's value over it.
    if (spec.caption !== null) this.setCaption(textCodes(ctx, spec.caption));
    this.attachUiVar(uivar);
    this.setNormal();                                                // FUN_00380500 (D:L276718)
  }

  get enabled(): boolean { return this.look.enabled; }

  setCaption(codes: number[]): void { this.captionCodes = codes; this.caption = true; }

  /** `FUN_00376bd0` D:L271841-271852: the var added (`FUN_003857c0`), the widget attached, then told (+0x8c). */
  protected attachUiVar(uivar: DialogUiVar | null): void {
    const vars = this.ctx.uiVars;
    if (!vars || !uivar || uivar.name === null) return;
    const v = vars.add(uivar.name, uiVarValueOfSpec(uivar.value), uivar.longevity);
    vars.attach(v, (x) => this.uiVarChanged(x));
    this.uiVarChanged(v);
  }

  /** +0x8c, `FUN_00376b40` (D:L271662-271691): the var printed into the caption. */
  protected uiVarChanged(v: UiVariable): void {
    const s = printUiVar(v.value);
    this.caption = s !== null;
    this.captionCodes = s === null ? [] : textCodes(this.ctx, s);
  }

  /** Applying a state (`FUN_0036e840`, `FUN_0036e830`, `FUN_0036e790` via PLAT-13, `FUN_0036e730`). */
  protected applyBody(s: ButtonStateName): void {
    const st = blockOf(this.spec, s);
    const tex = st.image !== null && this.ctx.hasTexture(st.image) ? st.image : null;
    this.body.texture = tex;
    this.body.x = 0; this.body.y = 0; this.body.w = toInt(this.size[0]); this.body.h = toInt(this.size[1]);
    // FUN_0036e730 (D:L267204-267218): PULSE 0 -> alpha 128 and the pulse off; else on with that period, its phase kept.
    if (st.pulse === 0) { this.body.alpha = 128; this.body.pulse = null; }
    else this.body.pulse = { period: st.pulse, phase: this.body.pulse?.phase ?? 0 };
  }

  protected enter(s: ButtonStateName): void {
    enterButtonState(this.look, this.spec, s);
    this.applyBody(s);
  }

  /** +0x54 `FUN_0036e6b0` (D:L267182-267201). */
  setNormal(): void {
    if (!this.look.enabled) return;
    deactivateButton(this.look, this.spec);
    this.applyBody('NORMAL');
  }

  /** +0x50 (ELF 0x3766a0-0x3767bc): ACTIVE, then every `EVENT ONACTIVATE` binding in list order with its `ARGUMENT`. */
  setActive(host: WidgetHost): void {
    if (!this.look.enabled) return;
    this.enter('ACTIVE');
    for (const b of this.spec.bindings) if (b.kind === 'event' && b.code === ON_ACTIVATE) startBinding(host, b);
  }

  /** +0x74 `FUN_00370c20` (D:L268554-268572): PRESSED for 0.2 s. */
  press(): void {
    if (!this.look.enabled) return;
    pressButton(this.look, this.spec);
    this.applyBody('PRESSED');
  }

  /** +0x4c `FUN_00377380` (D:L271950-271962). */
  setEnabled(on: boolean): void {
    const was = this.look.state;
    setButtonEnabled(this.look, this.spec, on);
    if (this.look.state !== was || !on) this.applyBody(this.look.state);
  }

  /** +0x38 `FUN_003723b0` (D:L269237-269276): the caption's glow, the body's pulse, then the press clock. */
  tick(dt: number, _host: WidgetHost): void {
    const before = this.look.state;
    if (this.body.pulse) stepImagePulse(this.body, dt);
    tickButton(this.look, this.spec, dt);
    if (this.look.state !== before) this.applyBody(this.look.state);
  }

  /**
   * +0x44 `FUN_00377040` (D:L271859-271945), a leaf: disabled, not handled; CROSS falling presses (whatever the
   * bindings); then the first `BUTTON` binding (kind byte +0x250 not 1, D:L271881) whose button's byte equals its
   * `STATE` -- or, bound FALLING on a direction, the stick's edge that way -- starts its animation and is handled,
   * found or not (D:L271915-271926).
   */
  input(pad: WidgetPad, host: WidgetHost, focus = 0): boolean {
    if (!this.look.enabled) return false;
    if (this.children.length > 0) {
      // Not a leaf (D:L271933-271941): the child at the focus index takes the record with focus 0; nothing else runs.
      return this.children[focus]?.input(pad, host, 0) ?? false;
    }
    if (padByte(pad, 9) === PAD.FALLING) this.press();
    for (const b of this.spec.bindings) {
      if (b.kind === 'event') continue;
      if (b.state === padByte(pad, b.code) || stickFires(b, pad.stick)) {
        startBinding(host, b);
        return true;
      }
    }
    return false;
  }

  /** +0x64 `FUN_00376870` (D:L271548-271614): `Caption` and `Valve` (names `FUN_003767c0`, ops 1 and 2). */
  command(cmd: ZAnimUiCommand, _host: WidgetHost): WidgetCommandAnswer {
    const codes = baseTextCommand(cmd, this.ctx);
    if (codes === null) return null;
    this.setCaption(codes);
    return { answer: true };
  }

  /** The u16 at +8 (a SetValue's or a Selection's number). */
  protected u16(cmd: ZAnimUiCommand): number { return commandU16(cmd, 8); }

  /**
   * +0x10 `FUN_00377aa0` (D:L272218-272240): the body (+0x78 `FUN_0037c220` D:L274561-274576; with `HCENTERED` placed
   * from -(w >> 1) to (int)(XSIZE / 2), `FUN_00364660`), then the caption at (int)(x + XOFFSET), (int)(y + YOFFSET),
   * its own centring the `HCENTERED` flag (+0x85). The walk's fade writes nothing: the button's vtable +0x34 is
   * `jr ra` (0x1fe320, read in the ELF), so `opacity` is not used.
   */
  draw(x: number, y: number, _opacity: number): UiDrawItem[] {
    const out: UiDrawItem[] = [];
    this.drawButton(out, x, y);
    return out;
  }

  /**
   * The body's span from the pen, [x0, y0, x1, y1], as the draw places it: with `HCENTERED` from -(w >> 1) -- the quad's
   * own width (+0x214), XSIZE after a state's apply, the last draw's after that (D:L274565-274571) -- to (int)(XSIZE / 2),
   * down (int)YSIZE; else the quad as its state left it. Pure: the draw writes it, a pointer's hit test reads it.
   */
  bodySpan(): [number, number, number, number] {
    if (this.spec.hcentered) return [-Math.trunc(this.body.w / 2), 0, toInt(this.size[0] / 2), toInt(this.size[1])];
    return [this.body.x, this.body.y, this.body.x + this.body.w, this.body.y + this.body.h];
  }

  protected drawButton(out: UiDrawItem[], x: number, y: number): void {
    if (this.spec.hcentered) {
      const [x0, , x1, y1] = this.bodySpan();
      this.body.x = x0; this.body.y = 0; this.body.w = x1 - x0; this.body.h = y1;
    }
    pushIf(out, spriteAt(this.name, this.body, x, y));
    if (this.caption) {
      pushIf(out, glyphsAt(this.name, this.face, this.captionCodes, toInt(x + this.spec.offset[0]), toInt(y + this.spec.offset[1]), {
        scale: this.look.scale, hcentered: this.spec.hcentered, color: this.look.color, alpha: this.look.alpha,
      }));
    }
  }
}

/** D:L271887-271914: a FALLING binding on UP (4), DOWN (5), LEFT (3) or RIGHT (2) fires on the stick's edge that way. */
function stickFires(b: DialogBinding, stick: number): boolean {
  if (b.state !== PAD.FALLING) return false;
  return (b.code === 4 && stick === STICK.UP) || (b.code === 5 && stick === STICK.DOWN)
    || (b.code === 3 && stick === STICK.LEFT) || (b.code === 2 && stick === STICK.RIGHT);
}
