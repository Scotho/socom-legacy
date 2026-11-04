import type { ButtonSpec, ButtonState } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { drawnAlpha } from '../compositor/frame';
import { newSprite, type UiSprite } from '../compositor/scene';
import { decodedCodes, locTextBytes } from '../text/codes';
import { f32, fmul, toInt } from '../text/f32';
import type { TextFace } from '../text/face';
import { measureText } from '../text/layout';
import { placeWrapped, wrapLines, type WrappedLine } from '../text/wrapped';
import { VALVE_TYPE, type Valve, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { ButtonWidget, textCodes } from '../widgets/button';
import { glyphsAt, pushIf, spriteAt } from '../widgets/draw';
import type { WidgetCommandAnswer, WidgetContext, WidgetHost } from '../widgets/host';
import { padOf, PAD, type WidgetPad } from '../widgets/pad';
import { readPopupRecord, type PopupButtonSlot } from './record';

/**
 * The popup (web research 118): the one modal dialog a menu holds, hung hidden as the node `POPUP` after `MENUFADER`
 * at the menu's load and destroyed at its teardown (D:L263670-263688, D:L264301-264308). It is two halves:
 * `PopUpDialog` shows the node and plays `.METAL` (`show`), and a `ui::UI_COMMAND` on the node `POPUP` carries the
 * record that fills it (`command`, `FUN_0036da20`). While it is shown the menu's input goes to it alone
 * (`routePopupInput`); CROSS, TRIANGLE (when the record allows it), LEFT and RIGHT are its keys; the answer goes into
 * the record's valve, which the script waits on. `KillPopUp` (`killPopUp`) only hides it.
 *
 * The object (`FUN_0027f190` D:L126907-126934, 0xbf0 bytes, vtable 0x4073a0): a 2D image (`FUN_0020cd50`) that is the
 * panel, a WRAPPEDTEXT-class text object at +0xb0 (`FUN_0027f250`, vtable 0x4079e0), two `C2DButton`s at +0x340 and
 * +0x790 (`FUN_00377800`, vtable 0x407790 -- PLAT-15's `ButtonWidget`). Its slots: +0x10 draw `FUN_00370690`, +0x38
 * update `FUN_00370920`, +0x44 input `FUN_00370990`, +0x64 the record `FUN_0036da20`. The +0x32c delegate, which would
 * take the draw, the update and the input, is never set by anything found (research 118 §10) and is not modelled.
 */

/** The node's name (0x3ef340, 0x3f8df8, 0x3f9130 in the ELF). */
export const POPUP_NODE = 'POPUP';

/** The sounds the popup plays: `.METAL` (0x3ef3c0) when PopUpDialog shows it, `SELECTION` (`FUN_0036a2c0`) on a key. */
export type PopupSound = '.METAL' | 'SELECTION';

/** The screen's side (PLAT-23 resolves the sounds; PLAT-10 holds the popup). */
export interface PopupHost { sound(name: PopupSound): void }

/** What the popup reads: PLAT-15's widget context with the valve store it writes, and the script's input string. */
export interface PopupContext extends Omit<WidgetContext, 'valves'> {
  valves: ValveStore;
  /** The running zAnim context's input string (`FUN_00272480(ctx + 0x18, 0)`), which a text `INPUT_STRING` takes. */
  inputString?: () => string | null;
}

/** The line height the menu's load gives the text object (+0x16c = 20.0, `FUN_00370610` D:L268382): the pitch. */
export const POPUP_LINE_HEIGHT = 20;
/** The text object's wrap width before any record (+0x170 = 100.0, D:L268381). */
export const POPUP_START_WRAP = 100;
/** The text object's scale word before any record (+0xf0 = 1.0, D:L268380). */
export const POPUP_START_TEXT_SCALE = 1;
/** The text object's colour before any record: 255 thrice, `FUN_0037a770`'s (D:L273681-273683). */
export const POPUP_START_TEXT_COLOR: readonly [number, number, number] = [255, 255, 255];
/**
 * A text line's alpha before its font is set: each line node starts at 128 (`FUN_00363e70` D:L261476). The setter then
 * hands the line the object's font through `FUN_00362b20` (D:L273492), which rewrites an alpha of 128 to the face's
 * opacity x 128 (D:L260716-260719) -- so a popup's text draws at its face's opacity, as every text object does
 * (`textOf`, `compositor/dialogScreen.ts`). Until ONL-07 the lines were drawn at this 128 ("nothing in the popup writes
 * it"): the text was white where both captures of the write-down notice show it at the body text's level (peak 191 of
 * 255 in `A_41` and `A_42`, 193 in the recomp's `07_write_down.png`; research 157 §8).
 */
export const POPUP_TEXT_ALPHA = 128;
/** What TRIANGLE writes into the valve when the record allows it (0x42, D:L268517). */
export const POPUP_TRIANGLE_ANSWER = 66;
/**
 * The focused state's glow: the state block's +0x10 bottom 0.5, +0x14 top 1.0, +0x18 the flag 1, +0x20 the period
 * 0.5 (D:L266914-266917 for button 1, the same for button 2), which `FUN_003773f0` (D:L271967-272000) copies to the
 * label's +0x80 / +0x7c / +0x84 / +0x78 -- PLAT-13's TEXT_GLOW, run by the button's tick `FUN_003723b0`. The normal
 * and pressed states carry the flag 0. (Research 118's `POPUP_FOCUS_PULSE_READING`, settled here.)
 */
export const POPUP_FOCUS_GLOW: { range: [number, number]; time: number } = { range: [0.5, 1], time: 0.5 };

/**
 * POPUP_FONT_READING: the face the popup's text and labels draw in. The menu's load points the popup's +0x300 at the
 * menu's +0x210 and `FUN_00370610` sets it on all three (D:L263670-263672, D:L268377-268379); what fills +0x210
 * (`FUN_0038dea0`) was not traced. The reading: the dialog's `FONT`, the face PLAT-15's widgets take when they name
 * none (`WidgetContext.font`). [reading]
 */
export const POPUP_FONT_READING = 'the dialog\'s FONT' as const;

/**
 * POPUP_TEXT_SCALE_READING: the record's +32 f32 goes to the text object's +0x40 (popup +0xf0, D:L267147), the word a
 * WRAPPEDTEXT reads as its `SCALE` (`FUN_0037a430`; research 111 §5); read as that scale. 1.0 on all 285 records.
 * [reading]
 */
export const POPUP_TEXT_SCALE_READING = 'the text object\'s SCALE' as const;

/**
 * POPUP_STALE_FOCUS_READING: a record without buttons writes no answer, focus or width (D:L266856-266863: only the
 * valve pointer is cleared), so LEFT and RIGHT on it toggle the last record's answer between slots whose widths are
 * the last record's, with the `SELECTION` sound, unseen. Read from the lines, not seen running. [reading]
 */
export const POPUP_STALE_FOCUS_READING = 'the last record\'s answer and widths' as const;

/** The popup's buttons have no bindings, so their entries never reach a widget host's animations or events. */
const buttonHost = (host: PopupHost | null): WidgetHost => ({
  animation: () => false, hasAnimation: () => false, screenEvent: () => undefined,
  sound: (name) => { if (name === 'SELECTION') host?.sound(name); },
});

type Rgb = [number, number, number];

const state = (image: string | null, textColor: Rgb, scale: number, glow: ButtonState['glow']): ButtonState =>
  ({ block: true, image, textColor, pulse: 0, scale, glow });

/**
 * `FUN_00377800` (D:L272105-272195) as a spec: the label offset 10, 5, the scale 1.5 (+0x5c), the size 0 x 0
 * (+0x240/+0x244), the states empty at colour 128. Never drawn as it stands: the buttons draw only after a record with
 * buttons, which writes every field drawn.
 */
const emptyButton = (): ButtonSpec => {
  const blank = (): ButtonState => state(null, [128, 128, 128], 1.5, null);
  return {
    size: [0, 0], offset: [10, 5], scale: 1.5, caption: null,
    normal: blank(), active: blank(), pressed: blank(), disabled: blank(), hcentered: false, font: null, bindings: [],
  };
};

/** The text object at +0xb0, as far as the popup drives it. */
export interface PopupText {
  /** +0x40 (`POPUP_TEXT_SCALE_READING`), +0xc0 the wrap width, +0x48..+0x50 the colour new lines are made in. */
  scale: number;
  width: number;
  color: Rgb;
  /** The lines the setter made (`wrapLines`); each keeps the colour it was made with. */
  lines: WrappedLine[];
}

export class Popup {
  /** The `POPUP` node's visibility (bit 0 of its +0x5c): hidden when made (D:L263688). */
  visible = false;
  /** The node's place (the record's +8 / +12, `FUN_003157d0`); the panel's size (+0x30c / +0x310). */
  x = 0; y = 0; w = 0; h = 0;
  /** The text's offsets in the panel: +0x304 (x, and the side margin) and +0x308 (y). */
  textX = 0; textY = 0;
  /** +0x339 TRIANGLE answers; +0xbe0 keep open on CROSS. */
  triangle = false;
  keep = false;
  /** +0x330: the answer valve, or null for a record without buttons (the draw and CROSS test it). */
  valve: Valve | null = null;
  /**
   * +0x334: 1 or 2, the focused slot. The constructor does not write it; every reader before the first record with
   * buttons is gated by a valve (null) or a width (0), so its first value is never seen.
   */
  answer = 0;
  /**
   * The record's text id (0 for a named text): a browser read, not a field of the original's object -- kept so the
   * in-match Options can answer the card's save chain by its questions (`NativeOptionsHost` `saveOnReturn`).
   */
  textId = 0;
  /** The panel: the object's own quad (`FUN_0020cd50`: colour 128, alpha 128, no pulse), textured, no texture yet. */
  readonly panel: UiSprite = newSprite(null, 0, 0);
  readonly buttons: [ButtonWidget, ButtonWidget];
  /** Each button's place in the panel (+0x780/+0x784, +0xbd0/+0xbd4). */
  readonly buttonAt: [[number, number], [number, number]] = [[0, 0], [0, 0]];
  readonly text: PopupText = { scale: POPUP_START_TEXT_SCALE, width: POPUP_START_WRAP, color: [...POPUP_START_TEXT_COLOR], lines: [] };
  readonly face: TextFace | null;

  /**
   * `FUN_0027f190` and the menu's load (D:L263670-263688): made per menu, given the menu's font (`POPUP_FONT_READING`),
   * the text "" (0x3ef8d0, which the setter ignores), hidden.
   */
  constructor(readonly ctx: PopupContext) {
    this.face = ctx.font === null ? null : ctx.face(ctx.font);
    const wctx: WidgetContext = { ...ctx };
    this.buttons = [new ButtonWidget(POPUP_NODE, 'BUTTON', emptyButton(), wctx, null), new ButtonWidget(POPUP_NODE, 'BUTTON', emptyButton(), wctx, null)];
  }

  /** PopUpDialog's show (`FUN_0027eff0` D:L126894-126900): the node shown, `.METAL` played. Its argument is unused. */
  show(host: PopupHost): void {
    this.visible = true;
    host.sound('.METAL');
  }

  /** `FUN_0027ed90` (D:L126731-126744) and KillPopUp: the node hidden; nothing else. */
  hide(): void {
    this.visible = false;
  }

  /** A name index of the command's animation (`FUN_0026ed60`): null past the table. */
  private nameOf(cmd: ZAnimUiCommand, index: number): string | null {
    return this.ctx.name(cmd, index);
  }

  /** The text object's setter `FUN_00379f70` with translation off: an empty or missing text changes nothing (D:L273439). */
  private setText(bytes: string | null): void {
    if (bytes === null || bytes === '' || bytes.charCodeAt(0) === 0) return;
    this.text.lines = this.face ? wrapLines(this.face, bytes, { width: this.text.width, scale: this.text.scale, color: this.text.color }) : [];
  }

  /**
   * `FUN_0036da20` (D:L266787-267160): the record applied, in the original's order -- the texts resolved; the node
   * placed when it is `POPUP`; the size, the offsets and the flags; the valve cleared, then, with buttons, the valve
   * found or made at TEMP, the answer 1, both slots read and button 1 focused, button 2 normal; then the text's scale,
   * its wrap width, the text set, its colour (after the setter: the lines take the colour held before), and the
   * panel's quad. Answers 1.
   */
  command(cmd: ZAnimUiCommand): WidgetCommandAnswer {
    const r = readPopupRecord(cmd.bytes);
    this.textId = r.textId;
    const panel = this.nameOf(cmd, r.panel);
    let text: string | null;
    if (r.textId === 0) text = this.nameOf(cmd, r.textName);
    else { const s = this.ctx.locText(r.textId); text = s === null ? null : locTextBytes(s); }
    if (text === 'INPUT_STRING') text = this.ctx.inputString?.() ?? null;          // D:L266839-266843
    if (cmd.node === POPUP_NODE) { this.x = r.x; this.y = r.y; }                     // D:L266844-266848
    this.w = r.w; this.h = r.h; this.textX = r.textX; this.textY = r.textY;          // D:L266849-266853
    this.triangle = r.triangle; this.keep = r.keep;                                  // D:L266854-266855
    this.valve = null;                                                               // D:L266856-266858
    if (r.hasButtons) {
      this.valve = this.ctx.valves.acquire(this.nameOf(cmd, r.valve) ?? '', VALVE_TYPE.TEMP);   // D:L266859-266862
      this.answer = 1;                                                               // D:L266863
      r.buttons.forEach((slot, k) => this.applySlot(cmd, k, slot));
      this.buttons[0].setActive(buttonHost(null));                                   // D:L267136
      this.buttons[1].setNormal();                                                   // D:L267137
    }
    this.text.scale = r.textScale;                                                   // D:L267147
    this.text.width = f32(this.w - 2 * this.textX);                                 // D:L267148
    this.setText(text);                                                              // D:L267149
    // D:L267150: the text's vtable +0xa0 is 0x37a630, `jr ra` (read in the ELF): nothing.
    this.text.color = [...r.textColor];                                              // D:L267151-267155
    const tex = panel !== null && this.ctx.hasTexture(panel) ? panel : null;         // FUN_0036a230
    Object.assign(this.panel, { x: 0, y: 0, w: this.w, h: this.h, texture: tex });  // D:L267156-267157
    return { answer: true };
  }

  /** One slot into its button (D:L266864-267005 for button 1, D:L267006-267135 for button 2). */
  private applySlot(cmd: ZAnimUiCommand, k: number, s: PopupButtonSlot): void {
    const b = this.buttons[k]!;
    let label: number[] | null;
    if (s.labelId === 0) { const n = this.nameOf(cmd, s.labelName); label = n === null ? null : textCodes(this.ctx as WidgetContext, n); }
    else { const t = this.ctx.locText(s.labelId); label = t === null ? null : decodedCodes(t); }
    // +0x18 is the label's pointer, written either way; the text node is set only when there is one.
    if (label === null) b.caption = false;
    else b.setCaption(label);
    b.size[0] = s.w; b.size[1] = s.h;
    this.buttonAt[k] = [s.x, s.y];
    const spec = b.spec;
    spec.scale = s.scale;
    spec.offset = [s.labelOffset[0], s.labelOffset[1]];
    const image = (i: number): string | null => this.nameOf(cmd, i);
    spec.active = state(image(s.focused), [...s.colors.focused], s.scale, { range: [...POPUP_FOCUS_GLOW.range], time: POPUP_FOCUS_GLOW.time });
    spec.normal = state(image(s.normal), [...s.colors.normal], s.scale, null);
    spec.pressed = state(image(s.pressed), [...s.colors.pressed], s.scale, null);
    spec.hcentered = s.centred;
  }

  /** The valve written through its watchers (`FUN_003519f0`), as the VALVE `=` writes it; nothing when it is gone. */
  private write(value: number): void {
    if (this.valve) this.ctx.valves.apply({ valve: this.valve, op: 11, operand: value });
  }

  /**
   * The input `FUN_00370990` (D:L268476-268549): each key tested for a press (its byte 1), in this order -- CROSS,
   * TRIANGLE, then LEFT or RIGHT -- each its own test. Every record is handled: the screen sees nothing.
   */
  input(pad: WidgetPad, host: PopupHost): boolean {
    const [b1, b2] = this.buttons;
    const pressed = (n: 'CROSS' | 'TRIANGLE' | 'LEFT' | 'RIGHT'): boolean => padOf(pad, n) === PAD.FALLING;
    if (pressed('CROSS')) {
      if (this.valve) {
        this.write(this.answer);                                                     // D:L268488-268499
        (this.answer === 1 ? b1 : b2).press();                                       // D:L268500-268505
      }
      if (!this.keep) { this.setText(''); this.hide(); }                             // D:L268507-268511
      host.sound('SELECTION');                                                       // D:L268512
    }
    if (this.triangle && pressed('TRIANGLE')) {
      if (this.valve) this.write(POPUP_TRIANGLE_ANSWER);                             // D:L268515-268519
      if (!this.keep) { this.setText(''); this.hide(); }                             // D:L268520-268524
      host.sound('SELECTION');                                                       // D:L268525
    }
    if (pressed('LEFT') || pressed('RIGHT')) this.step(host);
    return true;
  }

  /**
   * LEFT or RIGHT's body (D:L268528-268541): the focus to the other slot when that button has a width -- the answer,
   * the old button normal, the new one active, `SELECTION`; else nothing. A pointer's click on the unfocused button
   * takes this same step (`MENU_TOUCH_READING`, a browser adaptation).
   */
  step(host: PopupHost): void {
    const [b1, b2] = this.buttons;
    if (this.answer === 1) {
      if (b2.size[0] > 0) {                                                          // D:L268529
        this.answer = 2; b1.setNormal(); b2.setActive(buttonHost(host)); host.sound('SELECTION');
      }
    } else if (b1.size[0] > 0) {                                                     // D:L268536
      this.answer = 1; b1.setActive(buttonHost(host)); b2.setNormal(); host.sound('SELECTION');
    }
  }

  /** Button k's pen in the frame: the popup's place (`x`, `y`, from the draw's origin) plus its slot's (+0x780/+0x784, +0xbd0/+0xbd4). */
  private buttonPen(k: number, x: number, y: number): [number, number] {
    return [x + this.buttonAt[k]![0], y + this.buttonAt[k]![1]];
  }

  /**
   * Each button's body in the frame (640 x 448) as the draw places it, [x0, y0, x1, y1], at the draw's `origin` and the
   * node's place `at`: null for a button not drawn (no valve) or with no width (the pad cannot focus it, D:L268529).
   * A browser read for the pointer (`MENU_TOUCH_READING`); the original has none.
   */
  buttonRects(origin: readonly [number, number] = [0, 0], at: readonly [number, number] = [this.x, this.y]): [[number, number, number, number] | null, [number, number, number, number] | null] {
    const x = origin[0] + at[0], y = origin[1] + at[1];
    const rect = (k: number): [number, number, number, number] | null => {
      const b = this.buttons[k]!;
      if (!this.valve || !(b.size[0] > 0)) return null;
      const [px, py] = this.buttonPen(k, x, y);
      const [x0, y0, x1, y1] = b.bodySpan();
      return [px + x0, py + y0, px + x1, py + y1];
    };
    return [rect(0), rect(1)];
  }

  /** The update `FUN_00370920` (D:L268462-268473): both buttons' ticks. The menu runs it every frame, shown or not. */
  tick(dt: number): void {
    const h = buttonHost(null);
    this.buttons[0].tick(dt, h);
    this.buttons[1].tick(dt, h);
  }

  /**
   * The draw `FUN_00370690` (D:L268388-268459) at the node's place, `origin` the menu's 2D root: the panel, then the
   * buttons when there is a valve, then the text from (x + [+28], y + [+24]), line i's pen 20 i - 3 below
   * (`FUN_003794b0` D:L273144; no scissor: the object's +0xc4 is -1, `FUN_0027f250`). `opacity` is the walk's: its
   * write goes through the popup's +0x34 (0x364860, the 2D object's alpha) to the panel alone (`drawnAlpha`).
   */
  draw(opacity = 1, origin: readonly [number, number] = [0, 0]): UiDrawItem[] {
    if (!this.visible) return [];
    const out: UiDrawItem[] = [];
    const x = origin[0] + this.x, y = origin[1] + this.y;
    drawnAlpha(opacity, this.panel);
    pushIf(out, spriteAt(POPUP_NODE, this.panel, x, y));
    if (this.valve) {
      this.buttons.forEach((b, k) => out.push(...b.draw(...this.buttonPen(k, x, y), opacity)));
    }
    const face = this.face;
    if (face) {
      const scale = fmul(this.text.scale, face.scale);                              // a line node's scale (research 111 §5)
      const widths = this.text.lines.map((l) => measureText(face, l.codes, scale).width);
      const place = placeWrapped(
        { width: this.text.width, spacing: POPUP_LINE_HEIGHT, height: -1, autoScroll: false, displayOneLine: false },
        toInt(x + this.textX), toInt(y + this.textY), widths,
      );
      for (const l of place.lines) {
        if (!l.drawn) continue;
        const line = this.text.lines[l.index]!;
        pushIf(out, glyphsAt(POPUP_NODE, face, line.codes, l.x, l.y, { scale, color: line.color, alpha: fmul(face.opacity, POPUP_TEXT_ALPHA), bold: line.bold }));   // FUN_00362b20 (D:L273492)
      }
    }
    return out;
  }
}

/** `KillPopUp` (`FUN_0027d190` D:L125846-125859): the popup hidden when the menu has one; it answers 1 either way. */
export function killPopUp(popup: Popup | null): true {
  popup?.hide();
  return true;
}

/**
 * The head of the menu's input `FUN_00368650` (D:L263850-263855): while the `POPUP` node is shown the pad record goes
 * to the popup's input and the menu's own input stops there. True when the popup took it.
 */
export function routePopupInput(popup: Popup | null, pad: WidgetPad, host: PopupHost): boolean {
  if (!popup || !popup.visible) return false;
  popup.input(pad, host);
  return true;
}
