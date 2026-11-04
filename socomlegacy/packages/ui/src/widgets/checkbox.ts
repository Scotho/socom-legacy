import type { DialogBinding, DialogWidget } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import { newSprite, type UiSprite } from '../compositor/scene';
import { toInt } from '../text/f32';
import { ButtonWidget } from './button';
import { pushIf, spriteAt } from './draw';
import { startBinding, type WidgetContext, type WidgetHost } from './host';
import { PAD, padByte, type WidgetPad } from './pad';

/**
 * CHECKBOX -- `CCheckBox` (run-time vtable 0x4074c0; web research 117 §5.2): a button plus a check image (+0x480)
 * drawn while checked (+0x440, false when made, `FUN_0037de60` D:L275419-275467). Set up by `FUN_00371550`
 * (D:L268862-268891): the check image at `CHECK_OFFSET`, `CHECK_SIZE`, colour 255, alpha 100, its texture
 * `CHECK_TEXTURE`; `ONCHECK` (+0x454) and `ONUNCHECK` (+0x464). On the disc every checkbox is a RADIOSTRIP's
 * subordinate, so its own CROSS toggle is never reached: the strip drives `check` / `uncheck`.
 */

type CheckboxSpec = Extract<DialogWidget, { type: 'CHECKBOX' }>;

export class CheckboxWidget extends ButtonWidget {
  checked = false;
  /** +0x480. */
  readonly check: UiSprite;
  readonly onCheck: DialogBinding;
  readonly onUncheck: DialogBinding;
  readonly checkOffset: [number, number];

  constructor(name: string, spec: CheckboxSpec, ctx: WidgetContext) {
    super(name, 'CHECKBOX', spec.button, ctx, spec.uivar);
    const tex = spec.checkTexture !== null && ctx.hasTexture(spec.checkTexture) ? spec.checkTexture : null;
    this.check = newSprite(tex, spec.checkSize[0], spec.checkSize[1]);
    this.check.color = [255, 255, 255];
    this.check.alpha = 100;
    this.onCheck = spec.onCheck;
    this.onUncheck = spec.onUncheck;
    this.checkOffset = [spec.checkOffset[0], spec.checkOffset[1]];
  }

  /** Checked, with `ONCHECK` started (`FUN_00370db0`'s second loop, D:L268647-268664; `FUN_00371680` D:L268906-268918). */
  setChecked(host: WidgetHost): void {
    this.checked = true;
    startBinding(host, this.onCheck);
  }

  /** Unchecked, with `ONUNCHECK` started (`FUN_00370db0`'s first loop, D:L268628-268645; `FUN_00371680` D:L268919-268930). */
  setUnchecked(host: WidgetHost): void {
    this.checked = false;
    startBinding(host, this.onUncheck);
  }

  /** +0x44 `FUN_00371680` (D:L268896-268937): CROSS falling toggles; nothing else is handled. */
  override input(pad: WidgetPad, host: WidgetHost): boolean {
    if (!this.enabled) return false;
    if (padByte(pad, 9) !== PAD.FALLING) return false;
    if (this.checked) this.setUnchecked(host); else this.setChecked(host);
    return true;
  }

  /**
   * +0x10 `FUN_003713a0` (D:L268819-268857): the button, then while checked the check image from
   * (int)(x + CHECK_OFFSET x) to + CHECK_SIZE -- outside the visibility test (`SLIDER_KNOB_WHEN_HIDDEN_READING`).
   */
  override draw(x: number, y: number, _opacity: number): UiDrawItem[] {
    const out: UiDrawItem[] = [];
    this.drawButton(out, x, y);
    if (this.checked) {
      const cx = x + this.checkOffset[0], cy = y + this.checkOffset[1];
      this.check.x = 0; this.check.y = 0;
      pushIf(out, spriteAt(this.name, this.check, toInt(cx), toInt(cy)));
    }
    return out;
  }
}
