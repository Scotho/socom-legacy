import type { DialogWidget } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { drawnAlpha } from '../compositor/frame';
import type { TextFace } from '../text/face';
import { engineCodes } from '../text/codes';
import { f32, fadd, fdiv, fmul, fsub, toInt } from '../text/f32';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { baseTextCommand, textCodes } from './button';
import { glyphsAt, pushIf } from './draw';
import { nodeOp, type Widget, type WidgetCommandAnswer, type WidgetContext, type WidgetHost } from './host';
import type { WidgetPad } from './pad';

/**
 * COUNTER -- `C2DCounter` (run-time vtable 0x407be0; web research 117 §7): a TEXT (`CRenderableString`) that counts
 * its caption from 0 up to the value of its `ValVar` UIVAR. Made by `FUN_00381be0` (D:L277427-277482): the target
 * +0xcc is the var's value read **once** (an integer, a real truncated, else 0), `StartTime` +0xc0, `EndTime` or
 * `Duration` +0xc8 with the flag +0xc4 (`FUN_00381e10` D:L277574-277592), the clock +0xd0 at 0, the number shown +0xd4
 * at -1; then the face and the text's set-up `FUN_003792f0`. Its walk fade writes the text's alpha (+0x34 is
 * `FUN_001f9150`, +0x54).
 */

/** `DAT_003e0380`: the clock's rate, 1.0 (read in the ELF). */
export const COUNTER_CLOCK_RATE = 1;

type CounterSpec = Extract<DialogWidget, { type: 'COUNTER' }>;

export class CounterWidget implements Widget {
  readonly type = 'COUNTER';
  readonly target: number;
  startTime: number;
  endTime: number;
  isDuration: boolean;
  clock = 0;
  shown = -1;
  codes: number[];
  alpha: number;
  readonly face: TextFace | null;

  constructor(readonly name: string, readonly spec: CounterSpec, private readonly ctx: WidgetContext) {
    const v = spec.valVar !== null ? ctx.uiVars?.find(spec.valVar) : undefined;
    this.target = !v ? 0 : v.value.type === 'int' ? v.value.value : v.value.type === 'real' ? toInt(v.value.value) : 0;
    this.startTime = spec.startTime;
    this.endTime = spec.endTime;
    this.isDuration = spec.isDuration;
    const fontName = spec.text.font ?? ctx.font;
    this.face = fontName === null ? null : ctx.face(fontName);
    this.alpha = this.face ? fmul(this.face.opacity, 128) : 128;    // FUN_00362b20 at 128 (as PLAT-14's text objects)
    this.codes = spec.text.caption === null ? [] : textCodes(ctx, spec.text.caption);
  }

  private show(n: number): void {
    this.shown = n;
    this.codes = engineCodes(String(n));                             // "%d" (0x3f9218), then vtable +0x70
  }

  /** +0x38 `FUN_0037b5c0` (D:L274186-274245). */
  tick(dt: number, host: WidgetHost): void {
    const end = this.isDuration ? fadd(this.startTime, this.endTime) : this.endTime;
    if (!(this.clock <= end)) return;
    this.clock = fadd(this.clock, fmul(dt, COUNTER_CLOCK_RATE));
    if (!(this.startTime <= this.clock)) return;
    let n: number;
    if (this.clock < end) {
      const span = this.isDuration ? this.endTime : fsub(end, this.startTime);
      n = toInt(fmul(f32(this.target), fdiv(fsub(this.clock, this.startTime), span)));
    } else n = this.target;
    if (this.shown !== n) { this.show(n); host.sound('TELETYPE'); }
  }

  input(_pad: WidgetPad, _host: WidgetHost): boolean { return false; }
  setActive(_host: WidgetHost): void {}
  setNormal(): void {}

  /**
   * +0x64 `FUN_0037b490` (D:L274143-274181), the ops of `FUN_0037b840` (D:L274287-274341): 4 `Start` -- `StartTime` =
   * the clock now; 5 `Finish` -- the flag and the end cleared (the clock stops), the target shown (answer 1); else the
   * base handler's `Caption` / `Valve`.
   */
  command(cmd: ZAnimUiCommand, _host: WidgetHost): WidgetCommandAnswer {
    const op = nodeOp(cmd);
    if (op === 4) { this.startTime = this.clock; return { answer: true }; }
    if (op === 5) { this.isDuration = false; this.endTime = 0; this.show(this.target); return { answer: true }; }
    const codes = baseTextCommand(cmd, this.ctx);
    if (codes === null) return null;
    this.codes = codes;
    return { answer: true };
  }

  /** +0x10 `FUN_0037a540` (D:L273602-273622): the text at the node's place (PLAT-14's `TEXT_PEN_READING`). */
  draw(x: number, y: number, opacity: number): UiDrawItem[] {
    const held = { alpha: this.alpha };
    this.alpha = drawnAlpha(opacity, held);
    const out: UiDrawItem[] = [];
    pushIf(out, glyphsAt(this.name, this.face, this.codes, x, y, {
      scale: this.spec.text.scale, hcentered: this.spec.text.hcentered, rightJustified: this.spec.text.rightJustified,
      color: this.spec.text.color, alpha: this.alpha,
    }));
    return out;
  }
}
