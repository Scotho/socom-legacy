import { POPUP_NAME, findNode, type UiNode, type UiScreen } from '../compositor/scene';
import type { PopupObject } from './menuQueue';

/**
 * PLAT-10's overlay slot (W9.R4): where `PopUpDialog` places a popup and `KillPopUp` removes it, and the one place
 * PLAT-16's popup component is connected (the page's `FrontEndSession`: `popups.connect(parts.makePopup)`, PLAT-16's
 * `SlotPopup` in each dialog's context; the session makes one slot and hands it to every dialog host).
 *
 * What the original does (web research 115 §4.3, §6): M's popup object (+0xe40, 0xbf0 bytes) is made on demand
 * (`FUN_0027f190` D:L126907-126934), wrapped at each dialog build as the node `POPUP`, appended to the foreplane
 * **last** and hidden (D:L263666-263688) -- so it draws above MENUFADER; `PopUpDialog` shows that node
 * (`FUN_0027eff0` D:L126884-126903: the node found by name from the current dialog host, vtable +0x38 with 1),
 * `KillPopUp` hides it when M's object exists (`FUN_0027d190` D:L125846-125859), the dialog host ticks the object on
 * every branch-A frame that consumes no switch (`FUN_003654c0` A6, D:L262348-262350) and tells its focus whether the
 * node shows (A8, `POPUP_FOCUS_READING`). The popup's record, text and buttons come from the `POPUP` node's own script
 * command (research 95 §1.2) and are PLAT-16's.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** A popup component as the slot holds it: M's popup object, attached to the `POPUP` node it draws into. */
export interface PopupComponent extends PopupObject {
  /** The build wrapped the object as this node (hidden): the component draws through its content and children. */
  attach?(node: UiNode): void;
}

/** Makes the component (`FUN_0027f190`'s constructor of the 0xbf0-byte object). */
export type PopupFactory = () => PopupComponent;

/**
 * A slot no front end has connected: the dialog host's own unit tests, which hold no popup's context. Its object
 * draws and ticks nothing. The page's front end connects PLAT-16's component (`SlotPopup`, made by
 * `DialogPartsHost.makePopup` in each dialog's context) before its first dialog is built (sprint 9's connecting line;
 * this replaced `POPUP_COMPONENT_PLACEHOLDER`, research 115 §15).
 */
export const POPUP_UNCONNECTED = 'no component connected' as const;

const unconnected: PopupFactory = () => ({ kind: POPUP_UNCONNECTED, tick: () => {} }) as PopupComponent;

export class PopupSlot {
  private factory: PopupFactory = unconnected;

  /** PLAT-16's component's factory (`DialogPartsHost.makePopup`). */
  connect(factory: PopupFactory): void { this.factory = factory; }

  /** `FUN_0027f190`: a new object. */
  make(): PopupComponent { return this.factory(); }

  /** The `POPUP` node of a screen (`findNode` from its root, as the commands search from the dialog host), or null. */
  node(screen: UiScreen): UiNode | null { return findNode(screen.root, POPUP_NAME); }

  /** Build step 7 (D:L263666-263688): the object wrapped as the screen's `POPUP` node, which the build left hidden and last. */
  wrap(screen: UiScreen, object: PopupObject): void {
    const node = screen.popup ?? this.node(screen);
    if (node) (object as PopupComponent).attach?.(node);
  }

  /** `PopUpDialog`'s show: true when the node was found. */
  show(screen: UiScreen): boolean {
    const node = this.node(screen);
    if (!node) return false;
    node.visible = true;
    return true;
  }

  /** `KillPopUp`'s hide: true when the node was found. */
  hide(screen: UiScreen): boolean {
    const node = this.node(screen);
    if (!node) return false;
    node.visible = false;
    return true;
  }

  /** A8's test (D:L262357-262360): the `POPUP` node exists and its +0x5c bit 0 (shown) is set. */
  shown(screen: UiScreen): boolean { return screen.popup?.visible ?? false; }
}
