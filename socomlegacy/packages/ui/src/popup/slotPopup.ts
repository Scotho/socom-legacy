import type { UiDrawItem } from '../compositor/drawList';
import { OPACITY_STACK_BASE_READING, pushOpacity } from '../compositor/frame';
import type { UiNode, UiScreen } from '../compositor/scene';
import type { PopupComponent } from '../screens/popupSlot';
import type { WidgetCommandAnswer } from '../widgets/host';
import type { WidgetPad } from '../widgets/pad';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { POPUP_NODE, routePopupInput, type Popup, type PopupHost } from './popup';

/**
 * PLAT-16's popup as PLAT-10's overlay slot holds it (sprint 9's connecting line, W9.R4; web research 118 §12.5, 115
 * §6): M's popup object (M+0xe40), made at each dialog build (`FUN_0027f190` D:L126907-126934) and wrapped as the
 * dialog's `POPUP` node (D:L263666-263688). The node is the one place its visibility lives -- `PopUpDialog` shows it
 * and `KillPopUp` hides it through the slot (`FUN_0027eff0` D:L126884-126903, `FUN_0027d190` D:L125846-125859), the
 * popup's own close hides it (`FUN_0027ed90` D:L126731-126744), a script's `ACTIVE` writes it -- so the component reads
 * it at each input and draw and writes the popup's own close back to it. The record's place is the node's
 * (`FUN_003157d0`, D:L266844-266848): written to the node, read back from it at the draw.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */
export class SlotPopup implements PopupComponent {
  readonly kind = 'popup' as const;
  /** The `POPUP` node of the dialog it was wrapped as (build step 7), null before. */
  node: UiNode | null = null;
  /** The command being applied, for the context's `INPUT_STRING` (`FUN_00272480(ctx + 0x18, 0)` of its animation). */
  current: ZAnimUiCommand | null = null;

  constructor(readonly popup: Popup) {}

  /** Build step 7: wrapped as the dialog's `POPUP` node. */
  attach(node: UiNode): void { this.node = node; }

  /** A6 (`FUN_003654c0` D:L262348-262350): the update `FUN_00370920`, shown or not. */
  tick(step: number): void { this.popup.tick(step); }

  /** The node's object's handler (vtable +0x64, `FUN_0036da20`): the record applied; the node placed when it is `POPUP`. */
  command(cmd: ZAnimUiCommand): WidgetCommandAnswer {
    this.current = cmd;
    try {
      const a = this.popup.command(cmd);
      if (this.node && cmd.node === POPUP_NODE) { this.node.x = this.popup.x; this.node.y = this.popup.y; }
      return a;
    } finally {
      this.current = null;
    }
  }

  /**
   * The head of the menu's input (`FUN_00368650` D:L263850-263855; PLAT-11 calls it): while the node shows, the record
   * goes to the popup's input `FUN_00370990` and the menu's stops there (true); a close hides the node.
   */
  input(pad: WidgetPad, host: PopupHost): boolean {
    this.popup.visible = this.node?.visible ?? false;
    const taken = routePopupInput(this.popup, pad, host);
    if (taken && !this.popup.visible && this.node) this.node.visible = false;
    return taken;
  }

  /**
   * The foreplane's walk reaching the `POPUP` node (`FUN_00369170`, `FUN_00336a60` D:L235063-235110): nothing unless the
   * node and every node above it up to its plane is shown; else the popup's draw `FUN_00370690` at the node's place,
   * with the walk's opacity (`pushOpacity` down from the plane). The node is the foreplane's last (D:L263666-263688),
   * so these items close the screen's draw list. The planes are unscaled: the origin is the parent's translation.
   */
  drawIn(screen: UiScreen): UiDrawItem[] {
    const at = this.placeIn(screen);
    if (!at) return [];
    this.popup.visible = true;
    this.popup.x = at.node.x;
    this.popup.y = at.node.y;
    return this.popup.draw(at.opacity, at.origin);
  }

  /** The walk to the node (`drawIn`'s): null when it is not drawn; else the walk's opacity and the parent's translation. */
  private placeIn(screen: UiScreen): { node: UiNode; opacity: number; origin: [number, number] } | null {
    const node = this.node;
    if (!node || node !== screen.popup) return null;
    const chain: UiNode[] = [];
    for (let n: UiNode | null = node; n; n = n.parent) {
      chain.unshift(n);
      if (n === screen.foreplane || n === screen.backplane) break;
    }
    if (chain[0] !== screen.foreplane && chain[0] !== screen.backplane) return null;
    let f = OPACITY_STACK_BASE_READING, x = 0, y = 0;
    for (const n of chain) {
      if (!n.visible) return null;
      f = pushOpacity(f, n.opacity);
      if (n !== node) { x += n.x; y += n.y; }
    }
    return { node, opacity: f, origin: [x, y] };
  }

  /**
   * Each button's body in the frame where `drawIn` would draw it (`Popup.buttonRects`), or [null, null] when the node is
   * not drawn: the pointer's hit test (`MENU_TOUCH_READING`, a browser adaptation).
   */
  buttonRects(screen: UiScreen): ReturnType<Popup['buttonRects']> {
    const at = this.placeIn(screen);
    return at ? this.popup.buttonRects(at.origin, [at.node.x, at.node.y]) : [null, null];
  }
}
