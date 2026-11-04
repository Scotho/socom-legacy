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

/** The modes a kept value may name: the spectator camera's three (`../../spectatorView` `SpectatorMode`). */
const MODES: readonly SpectatorMode[] = ['follow', 'free', 'scenic'];

/** Where the choice is kept: the page's settings (`pageSettings`), or a test's. */
export interface CameraChoiceStore {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
}

const isMode = (v: unknown): v is SpectatorMode => typeof v === 'string' && (MODES as readonly string[]).includes(v);

/** The kept camera choice, or `follow` (nothing kept, a storage that throws, a value that names no mode). */
export function readCameraChoice(store: CameraChoiceStore = pageSettings): SpectatorMode {
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
