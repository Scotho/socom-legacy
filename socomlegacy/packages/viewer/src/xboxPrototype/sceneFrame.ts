import { Matrix4, type Group, type PerspectiveCamera } from 'three';
import type { BodyRig } from './runtimeAssets';
import type { prototypePose } from './model';
import { MAX_PLAYERS } from '../net/protocol';
import type { HudState } from '../hudState';
import type { ReticleFrame } from './reticleFrame';
import type { WorldFrame } from './worldFrame';
import type { EffectMeshFrame } from './particleStyle';

/** Experimental render boundary. The simulation owns time/pose/placement; a backend
 * only draws the supplied frame. Three's camera/math types here own no GPU resources.
 * Arrays are borrowed for this synchronous draw, never cloned or advanced by a renderer.
 * This is not yet the complete production MatchRenderer contract (HUD/effects remain owed).
 */
export interface SceneFrame {
  camera: PerspectiveCamera;
  seconds?: number;
  magnification?: number;
  farExtra?: number;
  deltaSeconds?: number;
  realDeltaSeconds?: number;
  reticle?: ReticleFrame;
  world?: WorldFrame;
  objects?: readonly SceneObject[];
  /** The effects' particle geometry, in the world's space (`./walkingEffects`): borrowed, CPU arrays only. */
  particles?: Group;
  /** The effect models' triangles for this frame, in the world's space (`./walkingEffects`): borrowed for the draw. */
  effectMeshes?: EffectMeshFrame;
  /** The flashbang's blind this frame (`../flashRules`): the wash's row on the lit colours and the fog (`[grey, grey, grey, w]`, w in 0..255 units), and the glow's passes and FIX. Absent or null: none. */
  wash?: readonly [number, number, number, number] | null;
  glow?: { passes: number; fix: number } | null;
  body: {
    id: number; modelIndex: number;
    /** Shared Play owns corpse/scope visibility; omitted actors remain visible. */
    visible?: boolean;
    /** Borrowed per-body Play/BombPage gear visibility; the renderer does not mutate it. */
    gear?: ReadonlyMap<string, boolean>;
    position: readonly [number, number, number]; yawRadians: number;
    palette: Float32Array; local: readonly ArrayLike<number>[]; world: readonly ArrayLike<number>[];
    held?: readonly { name: string; matrix: Float32Array }[];
  };
  others: readonly SceneFrame['body'][];
}
/** Reused numeric placements; model geometry belongs to the renderer's upload. */
export interface SceneObject { id: number; model: string; matrix: Float32Array }
/** Same default as bodyView.HIDDEN_AT_SPAWN, without importing its GPU graph. */
export function gearVisible(name: string, flags?: ReadonlyMap<string, boolean>): boolean {
  return flags?.get(name) ?? name !== 'Satchel';
}
export function actorsOf(frame: SceneFrame, models: number): SceneFrame['body'][] {
  const actors = [frame.body, ...frame.others];
  if (actors.length > MAX_PLAYERS) throw new Error('Prototype actor limit exceeded');
  const ids = new Set<number>();
  for (const actor of actors) {
    if (ids.has(actor.id)) throw new Error('Duplicate prototype actor');
    ids.add(actor.id);
    if (!Number.isInteger(actor.modelIndex) || actor.modelIndex < 0 || actor.modelIndex >= models) throw new Error('Unknown actor model');
  }
  return actors.filter(actor => actor.visible !== false);
}
export interface SceneRenderer {
  stats: object;
  hud?: PrototypeHud;
  render(frame: SceneFrame): void;
  /** Whether the GPU has finished the frame before (`./raw`); absent: always. A live loop asks before it steps a frame. */
  ready?(): boolean;
  dispose(): void | Promise<void>;
}

/** The experiment consumes the match-facing HUD methods shared by the current
 * renderer and the isolated raw HUD. It does not require either implementation's
 * internal layout/state base class.
 */
export type PrototypeHud = Pick<HudState,
  'setVisible' | 'setWeaponIcon' | 'setFireMode' | 'setPlayerName' | 'setHealth' | 'setScoreRows' | 'setTimer' | 'setScoreboard' |
  'setSpectator' | 'setRoundScreen' | 'startRound' | 'postMessage' | 'setAction' | 'setZoom' | 'feed' | 'state' |
  'setExtraMarks' | 'setDefuseTimer' | 'setHoldBar' | 'setBombCarrier' | 'setNearbyAction' | 'setClimbPrompt' |
  'setOverlay' | 'setStartMenu' | 'setSpectatorHud' | 'setVoice' | 'setTalkMarks' | 'setCommandMenu' | 'setTextLine' | 'addBitmaps'>;
export function sceneFrame(camera: PerspectiveCamera, body: Pick<BodyRig, 'at'>, pose: ReturnType<typeof prototypePose>,
  origin: readonly [number, number, number]): SceneFrame {
  return { camera, others: [], body: { id: 0, modelIndex: 0, position: body.at?.position ?? origin, yawRadians: body.at?.yaw ?? 0,
    palette: pose.palette, local: pose.skeleton.local, world: pose.skeleton.world } };
}
export function bodyModel(body: SceneFrame['body'], out: Matrix4): Matrix4 {
  return out.makeRotationY(body.yawRadians).setPosition(...body.position);
}
