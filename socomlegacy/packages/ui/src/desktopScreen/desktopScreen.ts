import { Popup, type PopupContext, type PopupHost } from '../popup/popup';
import { SlotPopup } from '../popup/slotPopup';
import type { UiNode } from '../compositor/scene';
import type { UiBindingStart, UiCommandHost } from '../uiCommands';
import { ValveStore } from '../valves';
import type { WidgetCommandAnswer } from '../widgets/host';
import type { WidgetPad } from '../widgets/pad';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { MenuQueue, PopupObject } from '../screens/menuQueue';
import type { MenuShell } from '../screens/menuShell';
import { DESKTOP_SCREEN_HOOKS, DesktopScreenHooks, type DesktopScreenHook } from './hooks';
import { DESKTOP_SCREEN_NAMES, DESKTOP_SCREEN_POPUP_NAME, desktopNoticeCommand } from './notice';

/**
 * The desktop-recompilation screen (PLAT-28; web research 142): **a browser adaptation** -- the owner's notice where
 * the browser cannot run what the original's control starts (OT.R5). It is registered in PLAT-08's command host as a
 * binding gate (`UiCommandHost.setBindingGate`), so a hooked press needs no drawn menu: the dialog's scripts ask the
 * gate before they start a binding's animation (`screenScripts`' `startBinding`, the path of every button's, screen's
 * and event's binding), and a hooked start opens the notice instead -- the animation is not started (the original's
 * "found": the dispatch ends there, as `FUN_00377040` D:L271915-271926 ends on a started binding).
 *
 * The notice is PLAT-16's popup in the dialog's own `POPUP` node, opened as `PopUpDialog` opens one (`MenuShell.popUp`:
 * the node shown, `.METAL`), so PLAT-11's input routes the pad to it alone while it shows (`FUN_00368650`
 * D:L263850-263855) and the dialog's draw puts it last (`SlotPopup.drawIn`), at its record's place written to the
 * node as `FUN_0036da20` places a popup (D:L266844-266848; research 142 §3a) and handed back at the close. It is not
 * M's popup object: M's is set aside while the notice shows and handed back the moment it closes, untouched -- its
 * text, buttons, answer and focus as they were -- and ticked meanwhile, as A6 ticks it shown or not (`FUN_003654c0`
 * D:L262348-262350). The notice's answer goes into a valve store of its own. CROSS on CONTINUE closes it (the
 * popup's own close, `keep` 0, `SELECTION`); the dialog, its focused row, every valve, UI variable and card byte are
 * as before (`checkDesktopHook`).
 * A script that raises the game's own popup while the notice shows (a card change's) hands M's object back first:
 * the record goes to M's popup as the original's would.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The gate's owner name in the command host. */
export const DESKTOP_SCREEN_GATE = 'PLAT-28';

/** What the screen reaches of the front end: the dialog host built now (`DAT_00414e40`) and M's queue (its +0xe40). */
export interface DesktopScreenMachine {
  shell(): MenuShell | null;
  readonly queue: MenuQueue;
}

export type DesktopScreenEvent =
  | { kind: 'open'; hook: DesktopScreenHook }
  | { kind: 'close'; hook: DesktopScreenHook; by: 'continue' | 'game' };

export interface DesktopScreenOptions {
  machine: () => DesktopScreenMachine;
  /** The hooks (default: `DESKTOP_SCREEN_HOOKS`, MENU-03's and MENU-08's). */
  hooks?: DesktopScreenHooks;
  log?: (e: DesktopScreenEvent) => void;
}

/** The notice as the overlay slot holds it while it shows: PLAT-16's `SlotPopup`, M's object set aside beside it. */
class NoticeSlot extends SlotPopup {
  /** The `POPUP` node's place before the notice moved it (M's last record's, or the build's): handed back at the close. */
  private before: [number, number] | null = null;

  constructor(popup: Popup, readonly aside: PopupObject | null, private readonly done: (by: 'continue' | 'game') => void) {
    super(popup);
  }

  /**
   * The record's place written to the node, as `FUN_0036da20` does for a record on `POPUP` (`FUN_003157d0` with the
   * record's +8 / +12, D:L266844-266848): the draw reads the place back from the node (`drawIn`, `FUN_00370690`
   * D:L268434-268444), so a record applied to the bare popup before the attach would draw at the node's old place.
   */
  place(node: UiNode): void {
    this.attach(node);
    this.before = [node.x, node.y];
    node.x = this.popup.x;
    node.y = this.popup.y;
  }

  /** The node's place handed back with M's object (the notice writes nothing of the dialog's). */
  unplace(): void {
    if (this.node && this.before) { this.node.x = this.before[0]; this.node.y = this.before[1]; }
    this.before = null;
  }

  /** CONTINUE (the popup's CROSS) closes it: the node hidden, M's object handed back. */
  override input(pad: WidgetPad, host: PopupHost): boolean {
    const taken = super.input(pad, host);
    if (!this.popup.visible) this.done('continue');
    return taken;
  }

  /** A6: the notice's buttons and M's set-aside object, both ticked; a node a script hid (`KillPopUp`) hands it back. */
  override tick(step: number): void {
    super.tick(step);
    this.aside?.tick(step);
    if (this.node && !this.node.visible) this.done('game');
  }

  /** A record on `POPUP` is a script's, for M's popup: handed back first, then applied there (the original's object). */
  override command(cmd: ZAnimUiCommand): WidgetCommandAnswer {
    this.done('game');
    return this.aside instanceof SlotPopup ? this.aside.command(cmd) : null;
  }
}

export class DesktopScreen {
  readonly hooks: DesktopScreenHooks;
  private hook: DesktopScreenHook | null = null;
  /** Every open, in order (the harness's and the page's log). */
  readonly opened: DesktopScreenHook[] = [];
  private slot: NoticeSlot | null = null;

  constructor(private readonly o: DesktopScreenOptions) {
    this.hooks = o.hooks ?? new DesktopScreenHooks(DESKTOP_SCREEN_HOOKS);
  }

  /**
   * The hook whose notice shows now, or null: closed by CONTINUE, or gone with the dialog (a switch's unload destroys
   * M's popup object, `FUN_0027ef10`, and the notice in its place with it).
   */
  get current(): DesktopScreenHook | null {
    if (this.slot && this.o.machine().queue.popupObject !== this.slot) this.close('game');
    return this.hook;
  }

  /** The gate set in PLAT-08's host (`UiCommandHost.setBindingGate`); a later `register` of the same host replaces it. */
  register(host: UiCommandHost): void { host.setBindingGate(DESKTOP_SCREEN_GATE, this.gate); }

  /** A binding's start: a hooked one opens the notice and is taken (true); any other goes on (false). */
  gate = (b: UiBindingStart): boolean => {
    const hook = this.hooks.match(b.dialog, b.design, b.animation);
    if (!hook) return false;
    this.open(hook);
    return true;
  };

  /** The notice opened over the dialog built now, for the hook; false when no dialog is built (nothing shown). */
  open(hook: DesktopScreenHook): boolean {
    const m = this.o.machine(), shell = m.shell();
    const node = shell?.screen.popup ?? null;
    if (!shell || !node) return false;
    this.close('game');
    // The dialog's popup context (PLAT-16's, through the slot's factory: the face, the font, the texts); its valves,
    // names and variables replaced by the notice's own, so the notice reads and writes nothing of the game's.
    const made = shell.popups.make();
    const base: Partial<PopupContext> = made instanceof SlotPopup ? made.popup.ctx : {};
    const ctx: PopupContext = {
      face: base.face ?? (() => null), font: base.font ?? null, captions: base.captions ?? null, uiVars: null,
      valves: new ValveStore(), locText: base.locText ?? (() => null), hasTexture: base.hasTexture ?? (() => true),
      name: (_cmd, i) => DESKTOP_SCREEN_NAMES[i] ?? null, inputString: () => null,
    };
    const popup = new Popup(ctx);
    popup.command(desktopNoticeCommand());
    const slot = new NoticeSlot(popup, m.queue.popupObject, (by) => { if (this.slot === slot) this.close(by); });
    slot.place(node);                                                // the record's x, y on the node (D:L266844-266848)
    m.queue.popupObject = slot;
    this.slot = slot;
    this.hook = hook;
    this.opened.push(hook);
    this.o.log?.({ kind: 'open', hook });
    shell.popUp(DESKTOP_SCREEN_POPUP_NAME);                          // FUN_0027eff0's show: the node, `.METAL`
    return true;
  }

  /** The notice closed (CONTINUE, or the game took the popup back): M's object handed back as it was. */
  private close(by: 'continue' | 'game'): void {
    const slot = this.slot, hook = this.hook;
    if (!slot || !hook) return;
    this.slot = null;
    this.hook = null;
    slot.unplace();
    const q = this.o.machine().queue;
    if (q.popupObject === slot) q.popupObject = slot.aside;
    this.o.log?.({ kind: 'close', hook, by });
  }
}
