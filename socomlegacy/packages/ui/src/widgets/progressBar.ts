import type { DialogWidget } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { drawnAlpha } from '../compositor/frame';
import { newSprite, type UiSprite } from '../compositor/scene';
import { fadd, fdiv, fmul, toInt } from '../text/f32';
import type { UiVariable } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { pushIf, spriteAt } from './draw';
import { uiVarValueOfSpec, type Widget, type WidgetCommandAnswer, type WidgetContext, type WidgetHost } from './host';
import type { WidgetPad } from './pad';

/**
 * PROGRESSBAR -- `CHProgressBar` (run-time vtable 0x407550; web research 117 §7): an image (`FILENAME` over `XSIZE` x
 * `YSIZE`) revealed left to right by a scissor `XSIZE` x fill wide. Set up by `FUN_00371a10` (D:L269003-269054): the
 * fill +0xa0 at 0, `XSIZE` at +0xa4, the `UIVAR` attached. Its `UIVAR` is a **duration in seconds** (0x371ba0, ELF):
 * a real, or an integer floated, stored at +0xa8; every change of the var restarts the fill from 0. Its tick (0x3719e0,
 * ELF) adds dt / duration and caps the fill at 1. No pad input (+0x44 is 0x1fe260, `return 0`).
 */

/**
 * PROGRESSBAR_UNSET_READING: `dlgLoad`'s bar names `Load_progress`, which no code or script on the disc sets (research
 * 117 §7): its duration stays 0 and the tick's dt / 0 fills it at the first tick. [reading]
 */
export const PROGRESSBAR_UNSET_READING = 'full at the first tick' as const;

type BarSpec = Extract<DialogWidget, { type: 'PROGRESSBAR' }>;

export class ProgressBarWidget implements Widget {
  readonly type = 'PROGRESSBAR';
  fill = 0;
  duration = 0;
  readonly image: UiSprite;
  private texVar: string | null = null;

  constructor(readonly name: string, readonly spec: BarSpec, private readonly ctx: WidgetContext) {
    const f = spec.image.filename;
    this.image = newSprite(f !== null && ctx.hasTexture(f) ? f : null, spec.image.size[0], spec.image.size[1]);
    const vars = ctx.uiVars, u = spec.uivar;
    if (vars && u && u.name !== null) {
      const v = vars.add(u.name, uiVarValueOfSpec(u.value), u.longevity);
      vars.attach(v, (x) => this.uiVarChanged(x));
      this.uiVarChanged(v);
      this.texVar = v.name;
    }
  }

  /** 0x371ba0 (ELF 0x371ba0-0x371c4c): a real or an integer var is the duration; any change zeroes the fill (`sw zero,0xa0` at 0x371c44). */
  private uiVarChanged(v: UiVariable): void {
    if (v.value.type === 'real') this.duration = v.value.value;
    else if (v.value.type === 'int') this.duration = Math.fround(v.value.value);
    this.fill = 0;
  }

  /** 0x3719e0: fill += dt / duration, capped at 1. */
  tick(dt: number, _host: WidgetHost): void {
    this.fill = fadd(this.fill, fdiv(dt, this.duration));
    if (1 < this.fill) this.fill = 1;
  }

  input(_pad: WidgetPad, _host: WidgetHost): boolean { return false; }
  setActive(_host: WidgetHost): void {}
  setNormal(): void {}
  command(_cmd: ZAnimUiCommand, _host: WidgetHost): WidgetCommandAnswer { return null; }

  /**
   * +0x10 `FUN_003717c0` (D:L268942-268998): the scissor from the node's place to (XSIZE x fill, YSIZE) through the
   * node's matrix, then the image (its texture a string UIVAR's when found, D:L268969-268984) under it. The scene node
   * `LEADING_EDGE_NODE` moved to the fill's edge (D:L268988-268996) is the 3D scene's: no dialog on the disc names one.
   */
  draw(x: number, y: number, opacity: number): UiDrawItem[] {
    drawnAlpha(opacity, this.image);
    const v = this.texVar !== null ? this.ctx.uiVars?.find(this.texVar) : undefined;
    if (v && v.value.type === 'string' && v.value.value !== this.image.texture && this.ctx.hasTexture(v.value.value)) this.image.texture = v.value.value;
    const clip = { x0: toInt(x), y0: toInt(y), x1: toInt(fadd(x, fmul(this.spec.image.size[0], this.fill))), y1: toInt(fadd(y, this.spec.image.size[1])) };
    const out: UiDrawItem[] = [];
    pushIf(out, spriteAt(this.name, this.image, x, y, clip));
    return out;
  }
}
