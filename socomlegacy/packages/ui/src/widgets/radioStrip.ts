import type { DialogWidget, RadioStripPage } from '../dialog';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { ButtonWidget } from './button';
import { CheckboxWidget } from './checkbox';
import { nodeOp, type Widget, type WidgetCommandAnswer, type WidgetContext, type WidgetHost } from './host';
import { PAD, padByte, type WidgetPad } from './pad';

/**
 * RADIOSTRIP -- `CRadioStrip` (run-time vtable 0x407430; web research 117 §5.1): a button whose children are its
 * `SUBORDINATES` (the disc's are CHECKBOXes), the selection +0x440 (0 when made, `FUN_003874e0` D:L280444-280464) and
 * a mark +0x444 "to apply" (`FUN_003710c0` D:L268728-268734). The children follow the selection, not the focus.
 */

type StripSpec = Extract<DialogWidget, { type: 'RADIOSTRIP' }>;

export class RadioStripWidget extends ButtonWidget {
  selection = 0;
  private toApply = true;
  /** CPS-4b's page binding (`RadioStripPage`, a browser adaptation): none on a disc strip. */
  private readonly page: RadioStripPage | null;
  /** The selection the page last holds (read at the make, or handed back since). */
  private pageSelection = -1;

  constructor(name: string, spec: StripSpec, ctx: WidgetContext, children: readonly Widget[]) {
    super(name, 'RADIOSTRIP', spec.button, ctx, spec.uivar);
    this.children = children;
    this.page = spec.page ?? null;
    // A page strip is made at the page's value (an adaptation; the original's strip starts at 0, `FUN_003874e0`).
    if (this.page) this.selection = this.pageSelection = Math.max(0, Math.trunc(this.page.get()) || 0);
  }

  /** `FUN_00370d10` (D:L268592-268613): the child at the selection set active (its `ONACTIVATE` runs), every other set normal. */
  private apply(host: WidgetHost): void {
    this.children.forEach((c, i) => (i === this.selection ? c.setActive(host) : c.setNormal()));
  }

  /**
   * `FUN_00370db0` (D:L268618-268666): every checked child other than the selection unchecked (`ONUNCHECK`), then the
   * selection, if unchecked, checked (`ONCHECK`).
   */
  private check(host: WidgetHost): void {
    this.children.forEach((c, i) => { if (c instanceof CheckboxWidget && c.checked && i !== this.selection) c.setUnchecked(host); });
    this.children.forEach((c, i) => { if (c instanceof CheckboxWidget && !c.checked && i === this.selection) c.setChecked(host); });
    // CPS-4b (an adaptation): a page strip hands a changed selection to its page at once -- a step, a click, a Selection.
    if (this.page && this.selection !== this.pageSelection) { this.pageSelection = this.selection; this.page.set(this.selection); }
  }

  /** +0x38 `FUN_00370cb0` (D:L268577-268587): apply and check once if marked, then the button's tick. */
  override tick(dt: number, host: WidgetHost): void {
    if (this.toApply) { this.apply(host); this.check(host); this.toApply = false; }
    super.tick(dt, host);
  }

  /** +0x44 `FUN_00370f60` (D:L268669-268722): LEFT back, RIGHT or CROSS forward, both wrapping; press edges only. */
  override input(pad: WidgetPad, host: WidgetHost): boolean {
    if (!this.enabled) return false;
    const n = this.children.length;
    if (padByte(pad, 3) === PAD.FALLING) this.selection = this.selection === 0 ? n - 1 : this.selection - 1;
    else if (padByte(pad, 2) === PAD.FALLING || padByte(pad, 9) === PAD.FALLING) this.selection = this.selection < n - 1 ? this.selection + 1 : 0;
    else return false;
    this.apply(host);
    this.check(host);
    host.sound('SELECTION');
    return true;
  }

  /**
   * A browser adaptation (no original: the PS2 had no pointer): a click on box `i` chooses it -- the selection set there,
   * applied and checked with the step's sound, as the pad's steps would reach it (`MENU_TOUCH_READING`, the merge
   * controller's ruling of 2026-10-23 for CTL-1). The pad's input above is untouched. False when disabled, out of range or
   * already chosen (nothing happens).
   */
  choose(i: number, host: WidgetHost): boolean {
    if (!this.enabled || i < 0 || i >= this.children.length || i === this.selection) return false;
    this.selection = i;
    this.apply(host);
    this.check(host);
    host.sound('SELECTION');
    return true;
  }

  /**
   * +0x64 (`FUN_003710d0`, ELF 0x3710d0-0x371198; name `FUN_00371290` D:L268769-268814): op 4 `Selection` -- the
   * INDEX the parse `FUN_003711a0` (D:L268737-268764) put in the u16 at +8; past the last, ignored; else apply and
   * check, no sound. Else the button's.
   */
  override command(cmd: ZAnimUiCommand, host: WidgetHost): WidgetCommandAnswer {
    if (nodeOp(cmd) !== 4) return super.command(cmd, host);
    const i = this.u16(cmd);
    if (i < this.children.length) {
      this.selection = i;
      this.apply(host);
      this.check(host);
    }
    return { answer: true };
  }
}
