import type { DialogUiVar, DialogWidget } from '../dialog';
import { DIALOG_EVENTS } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { newSprite, type UiSprite } from '../compositor/scene';
import { f32, fadd, fdiv, fmul, fsub, toInt } from '../text/f32';
import type { UiVariable } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { ButtonWidget } from './button';
import { pushIf, spriteAt } from './draw';
import { nodeOp, type WidgetCommandAnswer, type WidgetContext, type WidgetHost } from './host';
import { PAD, padByte, type WidgetPad } from './pad';

/**
 * SLIDERBAR -- `CSliderBar` (run-time vtable 0x4075e0; web research 117 §4): a button (0x510 bytes, `FUN_0037e730`
 * D:L275752-275794) with a knob image (+0x460), the knob's position +0x440 (0 .. 1, starting at 0.5), `CENTER_VALUE`
 * +0x450 and the step `NUM_INTERVALS` +0x500 (the factory's defaults 0.5 and 10, D:L277931-277933; the record's).
 * Set up by `FUN_003724f0` (D:L269281-269317). Its pad handler replaces the button's: CROSS does nothing on a slider
 * and its button bindings are never read.
 */

/** `0.01f` (`lui 0x3c23; ori 0xd70a` at 0x371d4c): the step is `NUM_INTERVALS` x this of the track (R117.2). */
export const SLIDER_STEP_UNIT = f32(0.01);
/** The hold clock's threshold (`0.4 <` the clock, D:L269100 and D:L269153). */
export const SLIDER_HOLD_REPEAT = 0.4;

/**
 * SLIDER_HOLD_CADENCE_READING: a held LEFT / RIGHT steps once per input call after 0.4 s (`FUN_00371d00`
 * D:L269099-269124); how often the screen calls the input is PLAT-11's (research 116). This module steps on every call
 * it is given; the call rate is the caller's. [reading]
 */
export const SLIDER_HOLD_CADENCE_READING = 'once per input call past 0.4 s' as const;

/**
 * SLIDER_KNOB_WHEN_HIDDEN_READING: the knob is drawn outside the button's visibility test (`FUN_00372220`
 * D:L269224-269230) -- a hidden slider would still draw its knob. A hidden node is passed over by PLAT-14's walk before
 * its widget is asked to draw, so here the knob of a hidden slider is not drawn; no dialog on the disc is known to hide
 * a slider (research 117 §9). [reading]
 */
export const SLIDER_KNOB_WHEN_HIDDEN_READING = 'not drawn: the walk passes a hidden node' as const;

/** `FUN_00371d00`'s write (D:L269080-269085): the knob's p to the var's u through C = `CENTER_VALUE`. */
export function sliderToUiVar(p: number, c: number): number {
  return p < 0.5 ? fmul(fmul(p, 2), c) : fadd(c, fmul(fmul(fsub(p, 0.5), 2), fsub(1, c)));
}

/** `FUN_00371c50` (ELF 0x371c50-0x371cfc, research 117 §4.2): the inverse; nothing clamps p. */
export function uiVarToSlider(u: number, c: number): number {
  return u < c ? fdiv(fmul(0.5, u), c) : fadd(0.5, fdiv(fmul(0.5, fsub(u, c)), fsub(1, c)));
}

const SLIDER_MOVED = DIALOG_EVENTS.SLIDER_MOVED!;

type SliderSpec = Extract<DialogWidget, { type: 'SLIDERBAR' }>;

export class SliderWidget extends ButtonWidget {
  /** +0x440. */
  position = 0.5;
  /** +0x504: the hold clock, `+= dt` after the button's tick (`FUN_003721e0` D:L269187-269193). */
  hold = 0;
  /** +0x460: the knob, `KNOB_SIZE`, colour 255, alpha 128 (D:L269294-269299); its texture `KNOB_TEXTURE` (none: hidden). */
  readonly knob: UiSprite;
  readonly centerValue: number;
  readonly step: number;
  private uiVarName: string | null = null;

  constructor(name: string, readonly slider: SliderSpec, ctx: WidgetContext) {
    super(name, 'SLIDERBAR', slider.button, ctx, null);
    const tex = slider.knobTexture !== null && ctx.hasTexture(slider.knobTexture) ? slider.knobTexture : null;
    this.knob = newSprite(tex, slider.knobSize[0], slider.knobSize[1]);
    this.knob.color = [255, 255, 255];
    this.knob.alpha = 128;
    this.centerValue = slider.centerValue;
    this.step = slider.numIntervals;
    this.attachSliderVar(slider.uivar);
  }

  /** D:L269302-269316: the var attached, then read (+0x8c). */
  private attachSliderVar(uivar: DialogUiVar | null): void {
    this.attachUiVar(uivar);
    this.uiVarName = uivar?.name ?? null;
  }

  /** +0x8c (`FUN_00371c50`): only a real var moves the knob. */
  protected override uiVarChanged(v: UiVariable): void {
    if (v.value.type === 'real') this.position = uiVarToSlider(v.value.value, this.centerValue);
  }

  /** The var set only when it is not already that real (D:L269086-269091, `FUN_003863d0`). */
  private writeVar(u: number): void {
    const vars = this.ctx.uiVars;
    if (!vars || this.uiVarName === null) return;
    const v = vars.find(this.uiVarName);
    if (!v || (v.value.type === 'real' && v.value.value === u)) return;
    vars.set(v, { type: 'real', value: u });
  }

  /** Browser pointer adaptation: use the native var mapping and SLIDER_MOVED notification. */
  seek(position: number, host: WidgetHost): void {
    if (!this.enabled || !Number.isFinite(position)) return;
    const next = f32(Math.max(0, Math.min(1, position)));
    if (next === this.position) return;
    this.position = next;
    this.writeVar(sliderToUiVar(next, this.centerValue));
    this.hold = 0;
    host.sound('SELECTION');
    host.screenEvent(SLIDER_MOVED);
  }

  private move(dir: -1 | 1): void {
    const d = fmul(this.step, SLIDER_STEP_UNIT);
    if (dir < 0) { this.position = fsub(this.position, d); if (this.position < 0) this.position = 0; }
    else { this.position = fadd(this.position, d); if (this.position > 1) this.position = 1; }
    this.writeVar(sliderToUiVar(this.position, this.centerValue));
  }

  /** +0x38 `FUN_003721e0`: the button's tick, then the hold clock. */
  override tick(dt: number, host: WidgetHost): void {
    super.tick(dt, host);
    this.hold = fadd(this.hold, dt);
  }

  /** +0x44 `FUN_00371d00` (D:L269059-269182): LEFT (+4) then RIGHT (+3), falling or held. */
  override input(pad: WidgetPad, host: WidgetHost): boolean {
    if (!this.enabled) return false;
    for (const [code, dir] of [[3, -1], [2, 1]] as const) {
      const b = padByte(pad, code);
      if (b === PAD.FALLING) {
        this.move(dir);
        host.sound('SELECTION');
        this.hold = 0;
        host.screenEvent(SLIDER_MOVED);
        return true;
      }
      if (b === PAD.DOWN) {
        if (SLIDER_HOLD_REPEAT < this.hold) { this.move(dir); host.sound('SELECTION'); }
        return true;
      }
    }
    return false;
  }

  /** +0x64 `FUN_00372640` (D:L269324-269350): op 4 `SetValue` -- p = n / 100, the var = p (no mapping); else the button's. */
  override command(cmd: ZAnimUiCommand, host: WidgetHost): WidgetCommandAnswer {
    if (nodeOp(cmd) !== 4) return super.command(cmd, host);
    this.position = fdiv(this.u16(cmd), 100);
    this.writeVar(this.position);
    return { answer: true };
  }

  /** +0x10 `FUN_00372220` (D:L269198-269232): the button, then the knob at (int)(x + p x XSIZE), y. */
  override draw(x: number, y: number, _opacity: number): UiDrawItem[] {
    const out: UiDrawItem[] = [];
    this.drawButton(out, x, y);
    const kx = toInt(fadd(x, fmul(this.position, this.size[0])));
    this.knob.x = 0; this.knob.y = 0;
    pushIf(out, spriteAt(this.name, this.knob, kx, toInt(y)));
    return out;
  }
}
