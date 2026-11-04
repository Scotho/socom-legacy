import type { DialogDesign } from '../dialog';
import { composeScreen, type UiDrawItem } from '../compositor/drawList';
import { FULL_FADE } from '../compositor/frame';
import { findNode, newScreen, type UiNode, type UiScreen } from '../compositor/scene';
import { f32, fadd, fmul, fsub } from '../text/f32';
import { MENU_RECORD, type MenuQueue } from './menuQueue';
import { PopupSlot } from './popupSlot';

/**
 * The dialog host G (`CGameMenu`, 0x920 bytes, constructor `FUN_00369b60` D:L264593-264680; one at a time: its
 * constructor stores itself in `DAT_00414e40`): the screen a dialog is built into, the tick that consumes M's queue,
 * the switch's state machine with its fade to black, the dispatch to a dialog or a game-state keyword, the build and
 * the unload (PLAT-10; web research 115 §1.2, §3, §4, §6). `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * The screen is PLAT-14's (`UiScreen`, built by the host's `build`, normally `buildDialogScreen`); the fader quad
 * (G+0x170) is the screen's `fader` sprite and MENUFADER (`DAT_0049ea98`) its node while a dialog is built. What the
 * shell calls but does not own enters through `MenuShellHost`: the dialog's scripts (PLAT-07), the game-state requests
 * (`GameStateMachine`), input (PLAT-11), the widgets (PLAT-15), the movie's build and unload (PLAT-21), the sounds.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries). The clock is the caller's: `tick(dt)` (W9.R10).
 */

/** `FUN_00365a00`'s keywords (strcmp, case-sensitive; the strings at 0x3f8c38..0x3f8c78). */
export const MENU_KEYWORDS = {
  LOAD_SCREEN: 'LOAD_SCREEN', POP_TO_MENU_STATE: 'POP_TO_MENU_STATE', MENU_SCREEN: 'MENU_SCREEN', SHUTDOWN: 'SHUTDOWN', REBOOT: 'REBOOT',
} as const;

/** The fader quad's opaque alpha (128.0, `0x43000000`: D:L262279, D:L264670-264673): the tick's branch test. */
export const FADER_OPAQUE_ALPHA = 128;
/** The step the shell hands scripts, the fader and the widgets: `min(dt, 0.05)` (D:L262270-262273). */
export const MENU_STEP_CLAMP = f32(0.05);
/** The countdown's first value: three frames hide the backplane, a fourth dispatches (D:L262395, D:L262450-262456). */
export const MENU_SWITCH_COUNTDOWN = 3;

/**
 * MENU_SWITCH_REENTRY_READING: a switch record consumed while one is in flight (the state >= 0) pushes the history,
 * leaves the stored target and may advance the countdown (`FUN_00365a00` with the state > 0, D:L262450-262456):
 * transcribed as read (research 115 §4.1). [reading]
 */
export const MENU_SWITCH_REENTRY_READING = 'as read' as const;
/**
 * MENU_MISSING_DIALOG_READING: a switch to a dialog not on the disc unloads the old one and builds nothing
 * (`FUN_00367430` D:L263203-263214), leaving the reset fader opaque over an empty screen: transcribed as read. [reading]
 */
export const MENU_MISSING_DIALOG_READING = 'as read' as const;

/** The dialog's scripts as the shell drives them (PLAT-07's runtime over the screen's nodes; `screenScripts`). */
export interface ShellScripts {
  /** Build step 8 (D:L263692-263731): every `SCRIPT_LIBRARY` set loaded and started (`FUN_0026c600`). */
  start(): void;
  /** `FUN_0034e070(step, 0x49ea50)`: the zAnim context ticked (A3). */
  tick(step: number): void;
  /** `FUN_00367810(G, kind, 0)` (D:L263357-263396): the dialog's event records of that kind fired; true when any. */
  event(kind: number): boolean;
  /** The unload (D:L264340-264392): the sets stopped and released. */
  stop(): void;
  /** `FUN_00272480(ctx+0x18, 0)`: the running animation's first string input, null when none (`INPUT_STRING`). */
  inputString?(anim: string): string | null;
  /** A binding's animation found (`FUN_0026a250`) and started with its `ARGUMENT` (`FUN_00272bb0`) or without; true when found. */
  startBinding?(animation: string, argument: string | null): boolean;
}

/** What the shell calls; every member but `open`, `build`, `states` and `reboot` is optional (absent: nothing). */
export interface MenuShellHost {
  /** `FUN_00367430`'s open of `data/common/zrdr/dialog/<name>` (`FUN_0032f630`): the design, or null when not found. */
  open(name: string): DialogDesign | null;
  /** Build steps 2-7 (`FUN_00367950`): the dialog's screen (PLAT-14's `buildDialogScreen`) and its scripts (null: none). */
  build(design: DialogDesign, name: string): { screen: UiScreen; scripts: ShellScripts | null };
  /** The dispatch's game-state requests (research 115 §4.2; `GameStateMachine`). */
  states: { loadScreen(): void; popToMenu(): void; menuScreen(): void; shutdown(): void };
  /** `FUN_0022ed10`: the relaunch (research 115 §9). */
  reboot(): void;
  /** `DAT_0049e2cd`: booted from the disc (REBOOT then seeks ahead first, `FUN_0039dfc0`). */
  bootedFromDisc?: boolean;
  seekAhead?(): void;
  /** `FUN_00368650(G, pad)`: the menu's input (PLAT-11), read only while no switch is in flight and no suspend runs. */
  input?(): void;
  /** Record types 7 and 8: the named control's widget enabled or disabled (its +0x4c; PLAT-15's widget). */
  setEnabled?(node: UiNode, enabled: boolean): void;
  /** Record type 6: `FUN_00366b60(G, name)`, the named button activated (PLAT-15). */
  activate?(name: string): void;
  /** A7 (D:L262351-262356): every object, then every control, ticked with the step (PLAT-15). */
  widgetsTick?(step: number): void;
  /** A8: `FUN_0038d8f0(step, G, popupHidden)` (PLAT-11 / PLAT-16; `POPUP_FOCUS_READING`). */
  focusTick?(step: number, popupHidden: boolean): void;
  /** A9: the subclass's tick (G+0x910 vtable +0xc). */
  subclassTick?(step: number): void;
  /** `PopUpDialog`'s `.METAL` (`MENU_SOUND_PLAY_READING`; PLAT-23). */
  playMetal?(): void;
  /** The unload's movie part (D:L264407-264422; PLAT-21's background player `unload`). */
  onUnload?(): void;
  /** Build step 9 (D:L263745-263764), after ONSTART: the dialog's movie background (PLAT-21's `load`). */
  onBuilt?(design: DialogDesign): void;
  /**
   * The draw's parts this package's compositor leaves to others (PLAT-15's widgets in their `widget` items, PLAT-16's
   * popup at the `POPUP` node): the screen's list completed. Absent: the list as `composeScreen` makes it.
   */
  draw?(screen: UiScreen, items: UiDrawItem[]): UiDrawItem[];
}

export class MenuShell {
  /** The screen drawn: the built dialog's, or an empty one (no dialog, or one not found). */
  screen: UiScreen = newScreen();
  /** The design built, null when none. */
  design: DialogDesign | null = null;
  /** +0x8e0: the current screen's name (the last switch target accepted, or the dialog last built). */
  currentName = '';
  /** +0x8fc: -1 idle, 3..0 the switch's countdown. */
  switchState = -1;
  /** +0x900: the input-suspend timer, seconds. */
  inputTimer = 0;
  /** `DAT_0049eaa0`: the built dialog has event records (its scripts run). */
  hasEvents = false;
  private scripts: ShellScripts | null = null;
  /** `DAT_0049ea98` set: MENUFADER is the built dialog's node (null between an unload and the next build). */
  private faderLive = false;

  constructor(readonly queue: MenuQueue, private readonly host: MenuShellHost, readonly popups: PopupSlot = new PopupSlot()) {}

  /** The fader quad's alpha (G+0x170's +0x3c, `FUN_00364850`). */
  get faderAlpha(): number {
    const c = this.screen.fader.content;
    return c?.kind === 'sprite' ? c.sprite.alpha : FADER_OPAQUE_ALPHA;
  }
  set faderAlpha(a: number) {
    const c = this.screen.fader.content;
    if (c?.kind === 'sprite') c.sprite.alpha = a;
  }

  /** `FUN_00368570` (D:L263778-263801): the unload, then the start dialog opened and built (MS's Init). */
  start(name: string): void {
    this.unload();
    this.open(name);
  }

  /**
   * `FUN_003654c0` (D:L262239-262372): branch A when no switch is in flight or the fader is not yet opaque -- input,
   * scripts on the clamped step, the fade to black, the queue, the popup, the widgets, the focus, the subclass;
   * otherwise branch B, the switch's countdown alone.
   */
  tick(dt: number): void {
    dt = f32(dt);
    let o = this.faderLive ? this.screen.fader.opacity : FULL_FADE;                     // D:L262255-262260
    if (!(this.switchState < 0 || this.faderAlpha !== FADER_OPAQUE_ALPHA)) {           // D:L262262
      this.switchTo(this.currentName);                                                 // branch B, D:L262364-262370
      return;
    }
    if (this.inputTimer > 0) this.inputTimer = fsub(this.inputTimer, dt);               // A1, D:L262264-262269
    else if (this.switchState < 0) this.host.input?.();
    const step = dt <= MENU_STEP_CLAMP ? dt : MENU_STEP_CLAMP;                          // A2
    if (this.hasEvents) this.scripts?.tick(step);                                      // A3
    if (this.switchState >= 0) {                                                       // A4, D:L262277-262286
      o = fadd(o, fmul(step, 2));
      if (o >= FULL_FADE) { this.faderAlpha = FADER_OPAQUE_ALPHA; o = FULL_FADE; }
      if (this.faderLive) this.screen.fader.opacity = o;
    }
    const q = this.queue;
    while (q.count !== 0) {                                                            // A5, D:L262288-262347
      const r = q.records[q.top];
      const type = r?.type ?? -1, name = r?.name ?? '';
      if (type === MENU_RECORD.DISABLE || type === MENU_RECORD.ENABLE) {
        const node = findNode(this.screen.root, name);
        if (node) this.host.setEnabled?.(node, type === MENU_RECORD.ENABLE);
      } else if (type === MENU_RECORD.ACTIVATE) {
        this.host.activate?.(name);
      } else if (type === MENU_RECORD.BACK) {
        this.switchTo(name);
      } else if (type === MENU_RECORD.SWITCH) {
        q.pushHistory(this.currentName);                                               // FUN_0027f3f0, D:L262330
        this.switchTo(name);
        q.consume();
        return;                                                                        // A6-A9 skipped this frame
      }
      q.consume();
    }
    (q.popupObject ??= this.popups.make()).tick(step);                                  // A6, FUN_0027f190
    this.host.widgetsTick?.(step);                                                     // A7
    this.host.focusTick?.(step, !this.popups.shown(this.screen));                      // A8
    this.host.subclassTick?.(step);                                                    // A9
  }

  /** `CGameMenu_DrawForeplane` and the backplane draw (`CMenuState_Tick` steps 7-9): PLAT-14's draw list, which writes the alphas. */
  draw(): UiDrawItem[] {
    const items = composeScreen(this.screen);
    return this.host.draw ? this.host.draw(this.screen, items) : items;
  }

  /**
   * `FUN_00365a00` (D:L262375-262458): idle -- store the target and start the countdown (REBOOT seeks ahead first when
   * booted from the disc); counting -- with the fader opaque (or for REBOOT) hide the backplane and count down; at 0 --
   * show the backplane, go idle and dispatch.
   */
  switchTo(name: string): void {
    if (this.switchState < 0) {
      if (name === MENU_KEYWORDS.REBOOT && this.host.bootedFromDisc) this.host.seekAhead?.();
      this.switchState = MENU_SWITCH_COUNTDOWN;
      this.currentName = name;
    } else if (this.switchState < 1) {
      this.screen.backplane.visible = true;
      this.switchState = -1;
      this.dispatch(name);
    } else if (this.faderAlpha === FADER_OPAQUE_ALPHA || name === MENU_KEYWORDS.REBOOT) {
      this.screen.backplane.visible = false;
      this.switchState -= 1;
    }
  }

  /** The dispatch (D:L262402-262444): the keywords to the game states or the reboot, any other name a dialog. */
  private dispatch(name: string): void {
    const s = this.host.states;
    switch (name) {
      case MENU_KEYWORDS.LOAD_SCREEN: s.loadScreen(); return;
      case MENU_KEYWORDS.POP_TO_MENU_STATE: s.popToMenu(); return;
      case MENU_KEYWORDS.MENU_SCREEN: s.menuScreen(); return;
      case MENU_KEYWORDS.SHUTDOWN: s.shutdown(); return;
      case MENU_KEYWORDS.REBOOT: this.host.reboot(); return;
    }
    // FUN_00369210, then FUN_003564f0 and FUN_0027ef70 (a mission's readerm.zar re-read: not the front end's), the
    // fader quad reset to 0,0 640x448, black, alpha 128 -- the unload's fresh screen holds such a quad.
    this.unload();
    this.open(name);
  }

  /** `FUN_00367430` (D:L263179-263243): the dialog opened; found, the shell takes its name and builds it. */
  private open(name: string): void {
    const design = this.host.open(name);
    if (!design) return;                                                               // MENU_MISSING_DIALOG_READING
    this.currentName = name;
    this.build(design, name);
  }

  /** `FUN_00367950` (D:L263398-263775), in its order. */
  private build(design: DialogDesign, name: string): void {
    this.unload();                                                                     // step 1
    const built = this.host.build(design, name);                                       // steps 2-7 (PLAT-14)
    this.screen = built.screen;
    this.design = design;
    this.faderLive = true;
    // Step 8's flag is the build's own: `buildDialogScreen` leaves the fader's alpha at 0 exactly when nothing set
    // `DAT_0049eaa0` (D:L263689-263691), else at 128.
    this.hasEvents = this.faderAlpha !== 0;
    const object = (this.queue.popupObject ??= this.popups.make());                     // step 7
    this.popups.wrap(this.screen, object);
    this.scripts = this.hasEvents ? built.scripts : null;
    if (this.scripts) {                                                                // step 8
      this.scripts.start();
      this.scripts.event(0);                                                           // ONSTART
    }
    this.host.onBuilt?.(design);                                                       // step 9
  }

  /** `FUN_00369210` (D:L264277-264425). */
  unload(): void {
    this.inputTimer = 0;
    if (this.screen.popup) this.screen.popup.visible = false;
    this.queue.popupObject = null;                                                     // FUN_0027ef10
    this.scripts?.stop();
    this.scripts = null;
    this.hasEvents = false;
    this.screen = newScreen();                                                         // both roots replaced, MENUFADER 0
    this.design = null;
    this.faderLive = false;
    this.host.onUnload?.();
  }

  /** `FUN_00367810(G, kind, 0)`: the built dialog's event records of `kind` fired; true when any. */
  event(kind: number): boolean { return this.scripts?.event(kind) ?? false; }

  /** `INPUT_STRING`'s replacement for a command of the animation `anim` (the built dialog's scripts'), or null. */
  inputString(anim: string): string | null { return this.scripts?.inputString?.(anim) ?? null; }

  /** A BUTTON binding's start (the input dispatch `FUN_00368650` D:L264107-264116): the built dialog's scripts'; false when none is built. */
  startBinding(animation: string, argument: string | null): boolean { return this.scripts?.startBinding?.(animation, argument) ?? false; }

  /** `SuspendMenuInput(seconds)` (`FUN_00277220` D:L122805-122822 through `FUN_001f3bb0`): G+0x900. */
  suspendInput(seconds: number): void { this.inputTimer = f32(seconds); }

  /**
   * `PopUpDialog`'s effect on the shell (`FUN_0027eff0` D:L126862-126904): the type-3 record queued, the `POPUP` node
   * shown and `.METAL` played when the node is found. The name is not used (`POPUP_NAME_UNUSED_READING`).
   */
  popUp(name: string): void {
    this.queue.queuePopup(name);
    if (this.popups.show(this.screen)) this.host.playMetal?.();
  }

  /** `KillPopUp` (`FUN_0027d190` D:L125846-125859): the `POPUP` node hidden, only when M's popup object exists. */
  killPopUp(): void {
    if (this.queue.popupObject) this.popups.hide(this.screen);
  }
}
