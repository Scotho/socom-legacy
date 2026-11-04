import type { Object3D } from 'three';
import { isWorldPieceId } from './worldPieces';

/**
 * The seam `buildWorld` asks (`TEST_ROOM_MODEL_PACK_ADAPTATION`). With no source installed it answers nothing, and
 * the world builds the game's own meshes. The test room installs a source only while `modelPackActive` is true.
 * The launcher never imports the loader.
 */
export interface ModelVisualSource {
  has(id: string): boolean;
  /** A new object each call. The template stays with the pack. */
  clone(id: string): Object3D;
  /** Ids whose GLB loaded. The test-room pack sets this; a source without it maps nothing by list. */
  ids?: readonly string[];
}

let source: ModelVisualSource | null = null;

export function setModelVisualSource(next: ModelVisualSource | null): void {
  source = next;
}

/** Browser adaptation: live installation, including a pack enabled before an agent connection existed. */
export function modelVisualSourceInstalled(): boolean { return source !== null; }

export function hasMappedModel(id: string): boolean {
  return source?.has(id) === true;
}

/**
 * Set on every object of a pack clone. The animated-light pass (`effectLights` `receiverMeshes`) leaves these out:
 * a remake is one unlit mesh the size of a building, and the pass would draw see-through copies of the whole thing.
 */
export const MODEL_PACK_DRAW = 'modelPackDraw';

/** A clone of the mapped model, or null when nothing is installed or this id is not mapped. */
export function cloneMappedModel(id: string): Object3D | null {
  if (!source || !source.has(id)) return null;
  const clone = source.clone(id);
  clone.traverse((obj) => { obj.userData[MODEL_PACK_DRAW] = true; });
  return clone;
}

/** Every id whose GLB loaded. Props and weapons are in here; `mappedWorldPieceIds` is the level-piece subset. */
export function mappedModelIds(): readonly string[] {
  return source?.ids ?? [];
}

/** Level-piece ids whose GLB loaded (`world:<name>#<n>`). Empty when no pack is installed. Props are not here. */
export function mappedWorldPieceIds(): readonly string[] {
  return mappedModelIds().filter(isWorldPieceId);
}
