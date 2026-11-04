import { controllerStanceMode, PAD_BUTTON_NAMES, savePreference, type ControllerConfig } from '../../startupSettings';
import { OVERLAY_BUTTON_KEY, OVERLAY_HOME_BUTTON, OVERLAY_MAX_BUTTON as MAX_BUTTON, readOverlayButton } from '../../overlayButtonSetting';
import type { StanceMode } from '../../stanceButton';
import { padFamily } from '../../padFamily';
import { FORGE_MATCH_EXIT_CHORD, ForgePad, type PadSnapshot } from '../../forge/pad';
import type { OverlayPageKind } from './page';

/**
 * The overlay's opening button, a binding (MU2-16 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`; MU2.R8,
 * MISSION's OT.R51: "not all controllers have it so allow a rebind on it"). A **browser adaptation** (the original has no
 * overlay), labelled as one: this browser's choice, never sent anywhere (MU.R6: no server contact).
 *
 * **The default** is the standard mapping's button 16 -- the centre button, the PlayStation button, the Xbox Guide
 * (W3C Gamepad, "Remapping") -- which the original never reads: the game's pad stops at 15 (`../../gamepad` `PAD_BUTTON`,
 * the PS2 pad's sixteen), and the game's every read of a pad goes through the player's sixteen bindings
 * (`../../controllerInput` `ControllerInput.poll`, the logical pad's `buttons` made from `config.bindings` alone), so a
 * physical button no binding names never reaches it.
 *
 * **Where it is kept**: with the player's other pad bindings, in this browser's setup store (`../../startupSettings`
 * `readPreference` / `savePreference`, the page's one storage door) under the pad prefix `s2u.startup.v1.pad.` beside
 * `PAD_SELECTION_KEY` (`.pad.selection`) and each pad's own profile (`.pad.<id JSON>`); one for the browser, not per pad
 * (the controller's call, MU2-16's Log entry): the button a player chose for a pad without a centre button opens the
 * overlay whichever pad is in. The pad's profile itself is the game's (`parseController` keeps only its five fields), so
 * the overlay's button is a key of its own beside it.
 *
 * **How it opens** (`overlayOpensBy`; the controller's call, a matter of taste on the product track, logged for the
 * owner): a button the game never reads opens and closes the overlay by a **press**; a button the game also reads -- one
 * the player's game bindings drive, or the crouch shortcut's; over the forge also one the forge's own map reads, LATER 87
 * -- by a **hold** of `SELECT_HOLD_MS_ADAPTATION`
 * (`./index`), so that its tap stays the game's, and never in a running round (the original's use of that button wins
 * there, as MU2-11's review found of SELECT and the scoreboard, `FUN_0022be20`).
 */

/**
 * The default (16), the key and the reader live in `../../overlayButtonSetting`, the saved value alone, so a page reads it
 * without loading the overlay (the console's pad adapter, MU2-10c); re-exported here, the overlay's binding as before.
 */
export { OVERLAY_BUTTON_KEY, OVERLAY_HOME_BUTTON, readOverlayButton };

const subs = new Set<(button: number) => void>();

/** Keeps `button` as the opening button and tells every mounted reader (the overlay follows it without a remount). */
export function saveOverlayButton(button: number): void {
  if (!Number.isInteger(button) || button < 0 || button > MAX_BUTTON) return;
  savePreference(OVERLAY_BUTTON_KEY, String(button));
  for (const cb of [...subs]) { try { cb(button); } catch (e) { console.error('overlay: a binding reader failed', e); } }
}

/** Calls `cb` with each new opening button saved on this page; answers the unsubscribe. */
export function onOverlayButtonChange(cb: (button: number) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/**
 * Whether the game reads the physical `button` under the player's `config`: a binding drives it, or the Crouch or Prone
 * bind (PP-5) -- in SEPARATE only (STM.R1a: COMBINED keeps them in the profile, unread; `../../controllerInput` `poll`).
 */
export function gameReadsButton(button: number, config: ControllerConfig, mode: StanceMode = controllerStanceMode()): boolean {
  return config.bindings.includes(button) || (mode === 'separate' && (config.crouch === button || config.prone === button));
}

/** The buttons the forge's own map reads, probed once (`forgeReadsButton`). */
let forgeRead: ReadonlySet<number> | null = null;

/**
 * LATER 87 (a browser adaptation): whether the forge's own pad map reads the physical `button` -- read through what the
 * forge already exports, its edge map itself (`../../forge/pad` `ForgePad`, a module with no imports; nothing new
 * exported from the forge, whose sprint is paused): a fresh map is armed, `button` pressed, held past the map's
 * tap-or-hold and its repeat, and let go, with Cross both at its press and as a tap-or-hold; a button that yields an
 * action, a grab or a lift is one the forge reads. Probed once per page, as the map is fixed (FG-12: the standard
 * mapping's 0-15; not rebindable). The forge's lobby window reads the same snapshot by the same loop.
 */
export function forgeReadsButton(button: number): boolean {
  forgeRead ??= probeForgeMap();
  return forgeRead.has(button);
}

function probeForgeMap(): Set<number> {
  const read = new Set<number>();
  const snap = (down: number): PadSnapshot => ({
    buttons: Array.from({ length: MAX_BUTTON + 1 }, (_, i) => ({ pressed: i === down, value: i === down ? 1 : 0 })),
    axes: [0, 0, 0, 0],
  });
  for (let b = 0; b <= MAX_BUTTON; b++) {
    for (const crossHolds of [false, true]) {
      const map = new ForgePad();
      map.crossHolds = crossHolds;
      map.frame(snap(-1), 0);                                            // armed: every button up once
      const frames = [map.frame(snap(b), 16), map.frame(snap(b), 2016), map.frame(snap(-1), 2032)];
      if (frames.some((f) => f.actions.length > 0 || f.grab || f.lift !== 0)) read.add(b);
    }
  }
  return read;
}

/**
 * How `button` opens the overlay under the player's `config`, over a page of `kind`: a hold where the page reads it, else
 * a press. The game's bindings on every page; **over the forge** (LATER 87) the forge's own map as well
 * (`forgeReadsButton`): the forge reads the pad first in the frame (`../../forge/page` `padFrame`), so a button its map
 * reads would act there and open the overlay at once by a press -- twice; by a hold its tap stays the forge's. **In the
 * forge's Play match** (`forgeMatching`: the forge's body class, `./page` `FORGE_MATCH_CLASS`, read by the overlay as the
 * forge's round) the forge's edge map is not read -- the match is the game's own `mountMatch`, over the player's
 * bindings -- so the game's bindings alone decide, as over a game page (the seat's call on LATER 87) -- **but for the
 * match's exit chord** (LATER 92, the merge controller's product-track call): the forge's frame reads SELECT and START
 * held together in its Play match and its lobby's (`FORGE_MATCH_EXIT_CHORD`), so either is a hold there -- and in the
 * match, the overlay's running round, a hold-opener is the page's alone (`./index`): neither a tap nor a hold opens
 * the overlay there, and the chord always reaches the page (by a press it opened at once, and its shadow hid the pad
 * from the chord, which then never completed). Absent a kind, the game's bindings alone (as before LATER 87).
 */
export function overlayOpensBy(button: number, config: ControllerConfig, kind?: OverlayPageKind, forgeMatching = false): 'press' | 'hold' {
  if (gameReadsButton(button, config)) return 'hold';
  if (kind === 'forge' && forgeMatching) return (FORGE_MATCH_EXIT_CHORD as readonly number[]).includes(button) ? 'hold' : 'press';
  return kind === 'forge' && forgeReadsButton(button) ? 'hold' : 'press';
}

/**
 * The button's name as the controller page named a binding (its view retired with CX-26; `../../padBinding` names them
 * alike: the PS2 pad's names, an Xbox pad's own, else "Button <n>"), and 16 the centre button.
 */
export function overlayButtonName(button: number, padId = ''): string {
  const xbox = padFamily(padId) === 'xbox';
  if (button === OVERLAY_HOME_BUTTON) return xbox ? 'Guide' : 'Home (PS / Xbox Guide)';
  if (xbox) {
    const names = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS'];
    if (names[button]) return names[button]!;
  }
  return PAD_BUTTON_NAMES[button] ?? `Button ${button + 1}`;
}

/**
 * The seat's frames' F-A: the button's short cap for the console header's compact back control (a legend-style prompt):
 * 16 "Home" ("Guide" on an Xbox pad), else its name as `overlayButtonName` gives it (the full name is the control's label).
 */
export function overlayButtonCap(button: number, padId = ''): string {
  if (button === OVERLAY_HOME_BUTTON) return padFamily(padId) === 'xbox' ? 'Guide' : 'Home';
  return overlayButtonName(button, padId);
}
