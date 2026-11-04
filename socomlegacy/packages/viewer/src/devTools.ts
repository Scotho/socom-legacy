import { mayEnter, type FlyAccess } from './flyAccess';
import { devSwitches } from './source';

/**
 * The key that opens and closes the test room's developer panel (`./devPanel`): its one assignment, here beside the
 * panel's switch so the browser spec reads it without loading the panel module and its stylesheet.
 */
export const DEV_PANEL_KEY = 'F2';

/**
 * Whether `/testroom`'s developer tools are on. That is `./source`'s tools switch: `?devmode`, which turns the tools on
 * in every build, or `?devtools` on a development build. The fly switch and the served-tree switch do not open the
 * panel. This is the only function the in-game panel asks.
 *
 * A browser adaptation. It does not change what the game does. `./main` loads the panel only under
 * `import.meta.env.DEV`, so a release build does not ship it.
 */
export function devToolsEnabled(search: string): boolean {
  return devSwitches(search).tools;
}

/**
 * The panel key while the loading screen holds every other key. The panel toggles when it is already mounted.
 * Before the development import resolves, the open is queued (`queued` flips, so a second press of the panel key
 * takes it back). Other keys are not taken. A browser adaptation, a development instrument with no original; `./main` asks it
 * only under the panel's switch (`devToolsEnabled`).
 */
export function devPanelLoadingKey(
  code: string, repeat: boolean, ctrl: boolean, meta: boolean, alt: boolean,
  panel: { isOpen(): boolean; setOpen(on: boolean): void } | null,
  queued: boolean,
): { taken: boolean; queued: boolean } {
  if (code !== DEV_PANEL_KEY || repeat || ctrl || meta || alt) return { taken: false, queued };
  if (panel) panel.setOpen(!panel.isOpen());
  return { taken: true, queued: panel ? false : !queued };
}

/**
 * The camera the fly/walk control would enter, or null when `mayEnter` (`./flyAccess`) refuses it. The panel and the
 * hook ask that one rule; this does not restate it.
 */
export function nextCameraMode(mode: 'walk' | 'fly', play: boolean, access: Pick<FlyAccess, 'toggle'>): 'walk' | 'fly' | null {
  const next = mode === 'walk' ? 'fly' : 'walk';
  return mayEnter(next, play, access) ? next : null;
}

/** The local seat's measured spawn: B for a terrorist, A otherwise (the page opens as a SEAL). Null with no table. */
export function ownSpawnPoint(
  spawns: { a: readonly number[]; b: readonly number[] } | null | undefined,
  team: string | null | undefined,
): readonly number[] | null {
  if (!spawns) return null;
  return team === 'terrorist' ? spawns.b : spawns.a;
}

/**
 * Where "teleport to own spawn" stands the player. Already walking: the point alone. Flying: walk first, when
 * `mayEnter` allows it, then the point. Null when there is no spawn, or the walk is refused.
 */
export function planOwnSpawnTeleport(
  mode: 'walk' | 'fly',
  play: boolean,
  access: Pick<FlyAccess, 'toggle'>,
  spawns: { a: readonly number[]; b: readonly number[] } | null | undefined,
  team: string | null | undefined,
): { mode: 'walk'; at: readonly number[] } | null {
  const at = ownSpawnPoint(spawns, team);
  if (!at) return null;
  if (mode === 'walk') return { mode, at };
  if (!mayEnter('walk', play, access)) return null;
  return { mode: 'walk', at };
}

/**
 * Whether one of the developer panel's own drawings -- its bullet traces, its markers -- is drawn: only while the panel
 * is open and its switch is on (the owner, 2026-11-01: "make the overlay fuse added only show when it's active"). The
 * switch stays set while the panel is closed and draws again when it reopens. A browser adaptation, a development
 * instrument with no original; the page's own collision, wireframe and spawns switches are not the panel's and stay.
 */
export function devOverlayDrawn(panelOpen: boolean, switchedOn: boolean): boolean {
  return panelOpen && switchedOn;
}

/** The spawn overlay stays while the developer markers or the settings checkbox wants it. */
export function spawnOverlayOn(devMarkers: boolean, settingsSpawns: boolean): boolean {
  return devMarkers || settingsSpawns;
}
