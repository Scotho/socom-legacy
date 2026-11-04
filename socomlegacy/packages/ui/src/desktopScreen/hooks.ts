import type { DialogBinding, DialogDesign, DialogRecord } from '../dialog';
import { uiCommandFold } from '../uiCommands';

/**
 * PLAT-28's hooks (web research 142 §2): where an option the browser cannot run opens the desktop-recompilation screen
 * in place of what the original does. **A browser adaptation, not the original's behaviour**: the screen is the
 * owner's mandate (PLAT-28's block, "What the original does: none"; OT.R5), and every hook sits where the original's
 * own control starts its chain, so nothing else changes.
 *
 * A hook is a press on a control of a dialog: `(dialog, control, press)`. It takes the binding the original starts at
 * that press -- the dialog's control record's `BUTTON <press>` binding, read from the design the front end built
 * (`DialogLoader.binding`, `FUN_00365d50`) -- and replaces the start of its animation (`FUN_0026a250` then
 * `FUN_002734b0`, the button's input `FUN_00377040` D:L271915-271926): the animation is not started, so not one
 * command of its chain is dispatched. `replaces` is the animation the disc's binding names (pinned in
 * `tools/test/menuEntryCommands.pinned.json` for the main menu); the hook follows the design, and the harness
 * (`checkDesktopHook`) fails a hook whose design names another.
 *
 * **How a later task registers a hook** (ONL-02's EDIT NETWORK CONFIGURATIONS, OPT-17's HDD, ...): one entry,
 * `{ task, feature, dialog, control, press, replaces }`, either in the default list the page's `DesktopScreen` is made
 * with (`DESKTOP_SCREEN_HOOKS`: append the task's own array to it, as `MENU_03_HOOKS` and `MENU_08_HOOKS` are) or at run
 * time with `desktopScreen.hooks.register(hook)`; then one test that runs `checkDesktopHook(() => desktopHookRig(..),
 * hook)` and expects no failure (PLAT-28's acceptance: the screen at that press, CONTINUE back to the same row with
 * every valve, UI variable and card byte as the untouched twin has them, and nothing of the chain dispatched).
 *
 * **A hook is effectively per (dialog, animation).** The gate sees a binding's start, not the control pressed
 * (`UiBindingStart`: the dialog, its design, the animation): `match` takes the animation the hooked control's binding
 * names, so ANY start of that animation on that dialog -- another control's binding of it, another press, a screen
 * event, a checkbox's ONCHECK -- opens the screen too. `bindersOf` lists every binding of an animation in a design, and
 * `checkDesktopHook` fails a hook whose animation has another (`shared`): a task whose dialog binds one animation twice
 * either hooks every binder deliberately (and says so in its note) or does not hook it. On `dlgMenu.rdr` each of the
 * five animations is bound once (the pin `tools/test/menuEntryCommands.pinned.json`).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** One hook. */
export interface DesktopScreenHook {
  /** The roadmap task that registers it (MENU-03, MENU-08, ONL-02, ...). */
  task: string;
  /** The item as the player reads it (its caption on the disc), for the log and the note. */
  feature: string;
  /** The dialog, as `SWITCHMENU` names it (`dlgMenu.rdr`). */
  dialog: string;
  /** The control's `NAME` in the dialog's `CONTROLS`. */
  control: string;
  /** The `BUTTON` of the binding (`DIALOG_BUTTONS`' name: `CROSS`). */
  press: string;
  /** The animation the disc's binding starts at that press: what the hook replaces. */
  replaces: string;
  /**
   * Bound functions of the chain behind `replaces` that the original's press would reach and the acceptance names as
   * never dispatched (MENU-03's `ListSavedGames`); `replaces` itself is always checked.
   */
  chain?: readonly string[];
  /** The task whose screens run in its place, which removes this hook (OT.R5: OPTIONS by OPT-09, EXTRAS by MENU-04). */
  removableBy?: string;
}

/** A control record's bindings: a button family's (`ButtonSpec.bindings`), a list's or a map control's; else none. */
export function controlBindings(r: DialogRecord): readonly DialogBinding[] {
  const w = r.widget as { button?: { bindings: DialogBinding[] }; bindings?: DialogBinding[] };
  return w.button?.bindings ?? w.bindings ?? [];
}

/** The animation the design's control starts on the press (its first `BUTTON` binding of that name), or null. */
export function boundAnimation(design: DialogDesign, control: string, press: string): string | null {
  const r = design.controls.find((c) => c.name === control);
  if (!r) return null;
  const b = controlBindings(r).find((x) => x.kind === 'button' && x.name !== null && uiCommandFold(x.name) === uiCommandFold(press));
  return b?.animation ?? null;
}

const same = (a: string, b: string): boolean => uiCommandFold(a) === uiCommandFold(b);

/**
 * Every binding of `animation` in the design, as `<control> BUTTON <press>`, `<control> EVENT <event>`,
 * `<control> ONCHECK` / `ONUNCHECK` (a checkbox's) or `screen EVENT <event>` / `screen BUTTON <press>` (the design's
 * own): every start the gate would take for a hook on that animation.
 */
export function bindersOf(design: DialogDesign, animation: string): string[] {
  const out: string[] = [];
  const add = (who: string, b: DialogBinding | null | undefined, as?: string): void => {
    if (b?.animation && same(b.animation, animation)) out.push(as ? `${who} ${as}` : `${who} ${b.kind.toUpperCase()} ${b.name ?? b.code}`);
  };
  for (const c of design.controls) {
    for (const b of controlBindings(c)) add(c.name, b);
    const w = c.widget as { onCheck?: DialogBinding; onUncheck?: DialogBinding };
    add(c.name, w.onCheck, 'ONCHECK');
    add(c.name, w.onUncheck, 'ONUNCHECK');
  }
  for (const b of design.bindings) add('screen', b);
  return out;
}

/** The registry the page's `DesktopScreen` asks at every binding's start. */
export class DesktopScreenHooks {
  private readonly hooks: DesktopScreenHook[] = [];

  constructor(hooks: readonly DesktopScreenHook[] = []) {
    for (const h of hooks) this.register(h);
  }

  /** A hook added; a second hook on the same `(dialog, control, press)` throws (one screen per press). */
  register(hook: DesktopScreenHook): void {
    if (this.find(hook.dialog, hook.control, hook.press)) {
      throw new Error(`DesktopScreenHooks: ${hook.dialog} ${hook.control} ${hook.press} is already hooked`);
    }
    this.hooks.push({ ...hook });
  }

  /** A hook removed (its screens now run: `removableBy`); true when there was one. */
  unregister(dialog: string, control: string, press: string): boolean {
    const i = this.hooks.findIndex((h) => same(h.dialog, dialog) && h.control === control && same(h.press, press));
    if (i < 0) return false;
    this.hooks.splice(i, 1);
    return true;
  }

  find(dialog: string, control: string, press: string): DesktopScreenHook | null {
    return this.hooks.find((h) => same(h.dialog, dialog) && h.control === control && same(h.press, press)) ?? null;
  }

  all(): readonly DesktopScreenHook[] { return this.hooks; }

  /**
   * The hook a binding's start meets: one on this dialog whose control's binding at its press, in the design built,
   * starts this animation. Null: the start goes on as the original's. Keyed on the animation, not on the control the
   * start came from (the gate is not told it): another binder of the same animation matches too (`bindersOf`).
   */
  match(dialog: string, design: DialogDesign, animation: string): DesktopScreenHook | null {
    for (const h of this.hooks) {
      if (!same(h.dialog, dialog)) continue;
      const a = boundAnimation(design, h.control, h.press);
      if (a !== null && same(a, animation)) return h;
    }
    return null;
  }
}

/**
 * MENU-03's four (ruled (a), 2026-10-01; OT.R5 for OPTIONS and EXTRAS): CROSS on the main menu's NEW GAME, LOAD GAME,
 * OPTIONS and EXTRAS -- the bindings `new_game_button` -> `UiprepMission1`, `load_game_button` -> `MainMenuOnLoad`,
 * `options_button` -> `CallOptions`, `Extras_button` -> `CallExtras` (`dlgMenu.rdr`, research 96 §3, M1's CROSS list).
 */
export const MENU_03_HOOKS: readonly DesktopScreenHook[] = [
  { task: 'MENU-03', feature: 'NEW GAME', dialog: 'dlgMenu.rdr', control: 'new_game_button', press: 'CROSS', replaces: 'UiprepMission1' },
  { task: 'MENU-03', feature: 'LOAD GAME', dialog: 'dlgMenu.rdr', control: 'load_game_button', press: 'CROSS', replaces: 'MainMenuOnLoad', chain: ['ListSavedGames'] },
  { task: 'MENU-03', feature: 'OPTIONS', dialog: 'dlgMenu.rdr', control: 'options_button', press: 'CROSS', replaces: 'CallOptions', removableBy: 'OPT-09' },
  { task: 'MENU-03', feature: 'EXTRAS', dialog: 'dlgMenu.rdr', control: 'Extras_button', press: 'CROSS', replaces: 'CallExtras', removableBy: 'MENU-04' },
];

/** MENU-08's one (OT.R5: the LAN plan paused): CROSS on the main menu's LAN item, `LAN_button` -> `go_to_LAN_play`. */
export const MENU_08_HOOKS: readonly DesktopScreenHook[] = [
  { task: 'MENU-08', feature: 'LAN', dialog: 'dlgMenu.rdr', control: 'LAN_button', press: 'CROSS', replaces: 'go_to_LAN_play' },
];

/**
 * ONL-02's one (OT.R3: Sony's network set-up program is not built; web research 145): CROSS on LOGIN's EDIT NETWORK
 * CONFIGURATIONS, `configureBtn` -> `launchNTGUI2` (`dlgNetLogin.rdr`: `.DINK`, then `SwitchMenu(SHUTDOWN)` -- the
 * ShutdownState's `LoadExecPS2` of `SCUSNGUI.ELF`, research 115). The return lands on the same row (PLAT-28's
 * CONTINUE); the original's own return rebuilds LOGIN through `dlgReturnFromNTGUI2` (`ONL_02_RETURN_FOCUS_READING`).
 */
export const ONL_02_HOOKS: readonly DesktopScreenHook[] = [
  { task: 'ONL-02', feature: 'EDIT NETWORK CONFIGURATIONS', dialog: 'dlgNetLogin.rdr', control: 'configureBtn', press: 'CROSS', replaces: 'launchNTGUI2' },
];

/** Every hook the page's screen is made with; a later task appends its own array here. */
export const DESKTOP_SCREEN_HOOKS: readonly DesktopScreenHook[] = [...MENU_03_HOOKS, ...MENU_08_HOOKS, ...ONL_02_HOOKS];
