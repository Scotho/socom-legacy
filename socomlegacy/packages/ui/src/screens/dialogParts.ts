import type { DialogDesign } from '../dialog';
import type { UiDrawItem } from '../compositor/drawList';
import type { UiNode, UiScreen } from '../compositor/scene';
import { Popup, POPUP_NODE, type PopupContext, type PopupHost, type PopupSound } from '../popup/popup';
import { SlotPopup } from '../popup/slotPopup';
import { locTextOf, type CaptionSource } from '../text/captions';
import type { TextFace } from '../text/face';
import type { UiNodeCommandHandler } from '../uiCommands';
import type { UiVarManager } from '../uiVars';
import { ValveStore } from '../valves';
import type { WidgetHost, WidgetSound } from '../widgets/host';
import { WidgetSet } from '../widgets/widgetSet';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { PopupObject } from './menuQueue';
import type { PopupComponent, PopupFactory } from './popupSlot';
import type { ScreenScripts } from './screenScripts';

/**
 * What a built dialog holds beside PLAT-14's node tree, and the front end's hooks that reach it (sprint 9's connecting
 * lines, W9.R4; web research 115 §3, §4.3, §6, §16, 117, 118 §12.5): PLAT-16's popup component in PLAT-10's
 * overlay slot, PLAT-15's widget set made beside the node tree (`CGameMenu_LoadFromDesign`, D:L263627-263658) -- ticked
 * on A7, drawn in its items' places, its commands taken as the nodes' objects' (`FUN_002745a0` D:L121370-121385: a
 * `ui::UI_COMMAND` with a node asks the node's object first) -- and the widget host over the dialog's scripts. One `DialogParts` per build (`FUN_00367950`); the host keeps them by screen and knows the one built last --
 * the dialog host `DAT_00414e40` is the one constructed last (its constructor stores itself, `FUN_00369b60`
 * D:L264593-264680), and each build is that host's current dialog.
 *
 * The page (`packages/viewer/src/frontEnd.ts`) connects the host: `UiCommandHost({ node: parts.nodeCommand })`,
 * `popups.connect(parts.makePopup)`, and `FrontEndMachine`'s `built`, `draw`, `widgetsTick` and `setEnabled`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** A dialog as the machine's build made it (`MenuShellHost.build`): its design, screen, scripts and the launch's valves. */
export interface BuiltDialog {
  design: DialogDesign;
  screen: UiScreen;
  scripts: ScreenScripts | null;
  valves: ValveStore;
}

export interface DialogPartsOptions {
  /** M's popup object now (M+0xe40; `MenuQueue.popupObject`). */
  popupObject: () => PopupObject | null;
  /** PLAT-14's faces (the build's), for the popup's text and labels. */
  face?: (name: string) => TextFace | null;
  captions?: CaptionSource | null;
  /** A UIMnLOC string by id (a record's text id, a label's); absent, through `captions.command` (`locTextOf`); none known: null. */
  locText?: (id: number) => string | null;
  /** Whether a bitmap is found in the dialog's libraries (`FUN_0036a230`); all are, unless this says otherwise. */
  hasTexture?: (name: string) => boolean;
  /**
   * The menus' code cues (PLAT-23's `UiSoundCues`): SELECTION `FUN_0036a2c0` and TELETYPE `FUN_0036a300` from the widgets
   * and the popup's keys, `.METAL` from the popup (research 122 §6). Absent: silent.
   */
  sound?: (name: WidgetSound | PopupSound) => void;
  /**
   * The game's one `CUIVarManager` (0x437e80), shared with the soft keyboard (PLAT-17), so a TEXT / SECURETEXT prints
   * the variable a script or the keyboard writes (`FUN_00379260`). Absent: the widgets follow no variable.
   */
  uiVars?: UiVarManager;
}

/** One built dialog's parts. */
export class DialogParts {
  /** PLAT-15's widgets of the design's controls and objects, over the screen's nodes. */
  readonly widgets: WidgetSet;
  /**
   * What a widget asks of the screen (PLAT-15's `WidgetHost`): an animation of the dialog's scripts started with its
   * argument (`FUN_0026a250` then `FUN_002734b0` / `FUN_00272bb0`), found, a cue played, the screen's event records
   * fired (`FUN_00367810(screen, code, 0)`).
   */
  readonly widgetHost: WidgetHost;
  /** The widgets' items the last draw could not fill (a control no widget is made for: MAPCONTROL). */
  undrawn: string[] = [];

  constructor(readonly dialog: BuiltDialog, private readonly host: DialogPartsHost) {
    const o = host.o, scripts = dialog.scripts;
    // A LISTBOX's `UIVAR` attach fires its watcher during the build (`FUN_00375e20` D:L271185-271186), and its
    // ON_UPDATE_UIVAR bindings reach their animation by name through the script library (`FUN_0026a250(0x414bb0, ..)`,
    // `FUN_003754d0` D:L270808-270822): `animation` below closes over the scripts, whose sets are built but not started
    // at the parts' build (steps 2-7; `scripts.start()` is step 8, as the original loads its sets into 0x414bb0 after the
    // controls, research 139 §4), so an attach-time fire finds its animation inactive and starts nothing -- the original
    // finds nothing at that moment. The build needs no host object (ONL-01, research 144 §3; ONL-04, research 147 §2;
    // merged 2026-10-03).
    this.widgetHost = {
      animation: (name, argument) => name !== null && scripts !== null && scripts.startBinding(name, argument),
      hasAnimation: (name) => name !== null && scripts !== null && scripts.runtime.find(name) !== null,
      sound: (name) => { o.sound?.(name); },
      screenEvent: (code) => { scripts?.event(code); },
    };
    this.widgets = WidgetSet.build(dialog.design, dialog.screen, {
      face: o.face, captions: o.captions, valves: dialog.valves, locText: o.locText ?? locTextOf(o.captions), name: (cmd, i) => this.name(cmd, i),
      hasTexture: o.hasTexture, uiVars: o.uiVars,
      animation: (name, argument) => scripts !== null && scripts.startBinding(name, argument),
    });
  }

  /** `names[index]` of the command's running animation (`FUN_0026ed60`): the dialog's runtime's definition; null past the table. */
  name = (cmd: ZAnimUiCommand, index: number): string | null =>
    this.dialog.scripts?.runtime.find(cmd.anim)?.anim.names[index] ?? null;

  /** The popup this dialog's `POPUP` node holds: M's object when it was wrapped as this screen's node. */
  popup(): SlotPopup | null {
    const p = this.host.o.popupObject();
    return p instanceof SlotPopup && p.node !== null && p.node === this.dialog.screen.popup ? p : null;
  }

  /**
   * The node's object (D:L121370-121385): `POPUP`'s record to the popup; a widget's or a plain object's command to
   * PLAT-15's set by its op; anything else declined (the table answers).
   */
  nodeCommand(cmd: ZAnimUiCommand): { answer: boolean } | null {
    if (cmd.node === POPUP_NODE) {
      const p = this.popup();
      return p ? p.command(cmd) : null;
    }
    return this.widgets.nodeCommand(cmd, this.widgetHost);
  }

  /** A7 (`FUN_003654c0` D:L262351-262356): every widget ticked with the clamped step. */
  tick(step: number): void { this.widgets.tick(step, this.widgetHost); }

  /**
   * Record types 7 / 8 (D:L262291-262316): the named node's element's +0x4c with 1 / 0, whatever its class -- the button
   * family restyles (`FUN_00377380`), every other class writes the bit alone (0x1fde10), so `EnableButton` on an IMAGE
   * or a WRAPPEDTEXT listed under `CONTROLS` makes it a stop of the focus ring and `DisableButton` takes a LISTBOX off it.
   */
  setEnabled(node: UiNode, enabled: boolean): void {
    const spec = this.widgets.specOf(node.name);
    if (spec) this.widgets.setEnabled(spec, enabled);
  }

  /**
   * The screen's draw list (`composeScreen`'s) completed: each `widget` item replaced in its place by its widget's quads
   * and glyphs (`WidgetSet.draw`), then the popup's items at the `POPUP` node's place, the list's end.
   */
  draw(items: UiDrawItem[]): UiDrawItem[] {
    const drawn = this.widgets.draw(items);
    this.undrawn = drawn.undrawn;
    const p = this.popup();
    return p ? [...drawn.items, ...p.drawIn(this.dialog.screen)] : drawn.items;
  }

  /** M's popup object for this dialog (`FUN_0027f190`), its context the dialog's: the menu's font, the valves, the names. */
  makePopup(): PopupComponent {
    const o = this.host.o, d = this.dialog;
    let slot: SlotPopup | null = null;
    const ctx: PopupContext = {
      face: o.face ?? (() => null), font: d.design.font, captions: o.captions ?? null, uiVars: o.uiVars ?? null, valves: d.valves,
      locText: o.locText ?? locTextOf(o.captions), name: this.name, hasTexture: o.hasTexture ?? (() => true),
      inputString: () => (slot?.current && d.scripts ? d.scripts.inputString(slot.current.anim) : null),
    };
    slot = new SlotPopup(new Popup(ctx));
    return slot;
  }
}

/** The front end's hooks over the dialogs' parts. */
export class DialogPartsHost {
  private readonly byScreen = new WeakMap<UiScreen, DialogParts>();
  /** The dialog built last: `DAT_00414e40`'s current dialog. */
  current: DialogParts | null = null;

  constructor(readonly o: DialogPartsOptions) {}

  /** The parts of a screen, or null (an empty screen: nothing built, or unloaded). */
  of(screen: UiScreen): DialogParts | null { return this.byScreen.get(screen) ?? null; }

  /** `FrontEndMachine`'s `built`: a dialog's build (steps 2-7, before its scripts start). */
  built = (b: BuiltDialog): void => {
    const p = new DialogParts(b, this);
    this.byScreen.set(b.screen, p);
    this.current = p;
  };

  /** `FrontEndMachine`'s `draw`: the screen's draw list, completed by its parts. */
  draw = (screen: UiScreen, items: UiDrawItem[]): UiDrawItem[] => this.of(screen)?.draw(items) ?? items;

  /** PLAT-08's node handler (`UiCommandHost`'s `node`): the current dialog's objects. */
  nodeCommand: UiNodeCommandHandler = (cmd) => this.current?.nodeCommand(cmd) ?? null;

  /** `FrontEndMachine`'s `widgetsTick` (A7): the current dialog's widgets. */
  widgetsTick = (step: number): void => { this.current?.tick(step); };

  /** `FrontEndMachine`'s `setEnabled` (record types 7 and 8). */
  setEnabled = (node: UiNode, enabled: boolean): void => { this.current?.setEnabled(node, enabled); };

  /** The popup's side for its input (`SlotPopup.input`, PLAT-11's call): `.METAL` and SELECTION to the cues. */
  readonly popupHost: PopupHost = { sound: (name) => { this.o.sound?.(name); } };

  /**
   * The overlay slot's factory (`PopupSlot.connect`): PLAT-16's component in the context of the dialog being built (build
   * step 7 follows the `built` hook). Before any build, a popup with no face, names or texts over a valve store of its own.
   */
  makePopup: PopupFactory = () => {
    if (this.current) return this.current.makePopup();
    const ctx: PopupContext = {
      face: () => null, font: null, captions: null, uiVars: null, valves: new ValveStore(), locText: () => null,
      name: () => null, hasTexture: () => true,
    };
    return new SlotPopup(new Popup(ctx));
  };
}
