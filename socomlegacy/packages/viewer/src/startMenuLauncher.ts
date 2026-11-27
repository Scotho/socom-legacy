/*
 * WM-LAUNCHER (WM.R7; product track, a **browser adaptation**): the launcher registry the round's START menu reads
 * (`./startMenu` re-exports it), in its own module with no imports (F-WML-5) so the page and the launch adapter reach the
 * registry without naming the START menu. It saves no load today (F-WML-5b): `./pageEntry` imports `./frontEnd`
 * statically, and that imports `./startMenu` (and through it `./hud`), so the START menu is in every page's boot graph.
 */

/**
 * WM-LAUNCHER: the launcher overlay as the START menu drives it -- the overlay's own handle (`./modern/overlay` `Overlay`,
 * structurally: this module imports nothing of the overlay). `open()` may refuse (the settings lock): `isOpen()` says.
 */
export interface StartMenuLauncher {
  /** WM-6A: `target` opens it at Settings on a tab (`./settingsAdvanced`); none, the overlay as before. */
  open(target?: StartMenuLauncherTarget): void;
  isOpen(): boolean;
}

/**
 * WM-6A (a browser adaptation): where the launcher opens -- `settings`, the console's Settings tab (`./console/adapters/options`
 * group id), as the native settings screens' ADVANCED entry asks (`./settingsAdvanced`).
 */
export interface StartMenuLauncherTarget {
  settings?: string;
}

/**
 * WM-LAUNCHER: the launcher overlay each document's page offers its round's START menu. The page mounts the overlay
 * (`./pageEntry` `bootPage`, `./console/adapters/launch` at START's hand-over) and the front end mounts the match, with
 * the front end between them; the overlay's handle comes to the match here, keyed by the document both share, rather
 * than through the front end's mount. A **browser adaptation**.
 */
const launchers = new WeakMap<Document, StartMenuLauncher>();

/** Offers `launcher` for `doc` (a later offer replaces it); answers the undo, which takes back only its own. */
export function offerStartMenuLauncher(doc: Document, launcher: StartMenuLauncher): () => void {
  launchers.set(doc, launcher);
  return () => { if (launchers.get(doc) === launcher) launchers.delete(doc); };
}

/** The launcher offered for `doc`, or null where the page mounted none. */
export function startMenuLauncher(doc: Document): StartMenuLauncher | null {
  return launchers.get(doc) ?? null;
}
