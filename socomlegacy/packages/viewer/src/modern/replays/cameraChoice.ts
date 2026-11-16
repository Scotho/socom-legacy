import { pageSettings } from '../../pageStore';
import type { SpectatorMode } from '../../spectatorView';

/**
 * RV2-06 (RV2.R1, the owner's word "make the default camera type be player"; the replay viewer redesign plan,
 * `docs/plans/2026-11-02-replay-viewer-redesign.md`): the replay viewer's camera choice, kept in this browser. A browser
 * adaptation (REPLAY_ADAPTATION; product track, OT.R53): SOCOM II plays no recording back, so it has no viewer camera to
 * remember. The live spectator's start is the original's and is not this module's: `../../spectatorView`
 * `SPECTATOR_START_READING` (free, remembered free; `FUN_00295260`) stands, and the viewer reaches the chosen mode by
 * pressing the original's own controls on that view (`./worldStage` `cameraPresses`).
 *
 * One key, `REPLAY_CAMERA_KEY`, through the page's guarded settings (`../../pageStore` `pageSettings`, the one place the
 * page reaches its storage): the mode's id as text. Nothing kept, a storage that throws or is absent, or a value naming
 * no mode reads as `REPLAY_CAMERA_DEFAULT`; a write that fails is reported by the settings and otherwise dropped -- the
 * choice then lasts this watch only.
 */

/** The one key the replay viewer's camera choice is kept under. */
export const REPLAY_CAMERA_KEY = 's2u.replay.camera.v1';

/** RV2.R1: the viewer's camera with nothing kept -- PLAYER, the spectator's follow mode. */
export const REPLAY_CAMERA_DEFAULT: SpectatorMode = 'follow';

/**
 * PV-8 (the player's-view lane; a browser adaptation, no original): a camera of the replay strip -- one of the spectator
 * camera's three modes, or `'pov'`, the follow with the player's view on (`../../spectatorView` `SpectatorView.pov`,
 * PV-6a). `'pov'` is no `SpectatorMode`: the strip reaches it by the follow's presses, then `setPov` (`./worldStage`).
 */
export type ReplayCamera = SpectatorMode | 'pov';

/**
 * The cameras a kept value may name: the strip's (PV-8: the spectator camera's three and the player's view). The kept
 * choice is the replay viewer's (RV2-06), not the live watch's -- the live page keeps no choice of the view (PV.R5).
 */
const MODES: readonly ReplayCamera[] = ['follow', 'pov', 'free', 'scenic'];

/** Where the choice is kept: the page's settings (`pageSettings`), or a test's. */
export interface CameraChoiceStore {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
}

const isMode = (v: unknown): v is ReplayCamera => typeof v === 'string' && (MODES as readonly string[]).includes(v);

/**
 * The kept camera choice, or `follow` (nothing kept, a storage that throws, a value that names no camera). PV-8: a kept
 * `'pov'` is read as it is; a recording that carries no view shows PLAYER for that watch without writing here.
 */
export function readCameraChoice(store: CameraChoiceStore = pageSettings): ReplayCamera {
  try {
    const v = store.get(REPLAY_CAMERA_KEY);
    return isMode(v) ? v : REPLAY_CAMERA_DEFAULT;
  } catch {
    return REPLAY_CAMERA_DEFAULT;
  }
}

/** Keeps `mode` as the choice (a camera button's press); a value naming no mode is not kept, a failing write dropped. */
export function keepCameraChoice(mode: string, store: CameraChoiceStore = pageSettings): void {
  if (!isMode(mode)) return;
  try {
    store.set(REPLAY_CAMERA_KEY, mode);
  } catch {
    // the settings report their own failures; a store that throws leaves the choice to this watch
  }
}
