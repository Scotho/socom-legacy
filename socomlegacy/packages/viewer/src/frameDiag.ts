import type { Camera, Object3D, SkinnedMesh } from 'three';
import { fnv1a64, type FollowableSpectator } from './frameHash';
import type { SpectatorKey } from './spectatorView';

/**
 * cps-frame-hash-4 (product track, a test-only instrument: CPS.R9 (e)'s frame identity gate, `./frameHash`): the gate's
 * diagnosis when a paused frame with a followed body hashes differently from one read to the next (attempt 4 on the
 * owner's PC, 2026-11-03: the third read equal to the first, the second apart by one channel step in 13 to 46 pixels on
 * the body -- a two-state toggle with every clock held and the pose the same). It reads what the frame is drawn from
 * (`frameState`: the camera's whole world and projection matrices, each body's local pose and three's bone palette, as
 * hashes) and switches one input off at a time (`FrameDiagVariant`) so the spec (`S2U_FRAME_DIAG=1`) can say which one
 * makes consecutive reads equal. A development build's only, under the dev panel's gate (`./main`); it changes nothing
 * the game does and every variant is put back by `set(null)`.
 */

/**
 * The inputs switched off, one at a time:
 * - `staticCamera`: the follow left after its last placement -- the spectator's own X released (follow -> free, the
 *   fly camera left where it stands; `./spectatorView` `spectatorToggle`), and X again to go back to the follow.
 * - `noBodies`: the drawn bodies' objects off every layer the camera draws (their layer masks kept and put back).
 * - `noShadow`: the characters' shadow's strength 0 (`./charShadow` `CharacterShadow.clear`) right before each read's
 *   render (the page's frame sets it again; nothing to put back).
 * - `noEffectLight`: the effect lights' overlays (`userData.effectLightPass`, `./effectLights`) hidden, each put back.
 */
export type FrameDiagVariant = 'staticCamera' | 'noBodies' | 'noShadow' | 'noEffectLight';
export const FRAME_DIAG_VARIANTS: readonly FrameDiagVariant[] = ['staticCamera', 'noBodies', 'noShadow', 'noEffectLight'];

/** One body as the frame draws it: its local pose (every object's `matrix` and visibility) and three's bone palettes. */
export interface BodyFrameState { id: number; pose: string; palette: string | null }

/** What one read was drawn from: the camera's world and projection matrices whole, each drawn body's hashes. */
export interface FrameState { camera: number[]; projection: number[]; bodies: BodyFrameState[] }

/** FNV-1a 64 over the float32 bytes of `values`. */
export function floatHash(values: ArrayLike<number>): string {
  const f = Float32Array.from(values as ArrayLike<number>);
  return fnv1a64(new Uint8Array(f.buffer));
}

/** Each object's local `matrix` and `visible` under `group` (depth first), hashed: the pose the body was stood in. */
export function poseHash(group: Object3D): string {
  const values: number[] = [];
  group.traverse((o) => { values.push(...o.matrix.elements, o.visible ? 1 : 0); });
  return floatHash(values);
}

/** The bone palettes (`Skeleton.boneMatrices`, what the skinning reads) of every skinned mesh under `group`, hashed; null with none. */
export function paletteHash(group: Object3D): string | null {
  const seen = new Set<unknown>();
  const values: number[] = [];
  group.traverse((o) => {
    const s = (o as SkinnedMesh).isSkinnedMesh ? (o as SkinnedMesh).skeleton : null;
    if (!s || seen.has(s) || !s.boneMatrices) return;
    seen.add(s);
    values.push(...s.boneMatrices);
  });
  return seen.size ? floatHash(values) : null;
}

/** The frame's inputs as the last page frame left them. */
export function frameState(camera: Camera, bodies: readonly { readonly id: number; readonly group: Object3D }[]): FrameState {
  return {
    camera: Array.from(camera.matrixWorld.elements), projection: Array.from(camera.projectionMatrix.elements),
    bodies: bodies.map((b) => ({ id: b.id, pose: poseHash(b.group), palette: paletteHash(b.group) })),
  };
}

/** What `frameDiag` switches. */
export interface FrameDiagDeps {
  scene: () => Object3D;
  bodies: () => readonly { readonly id: number; readonly group: Object3D }[];
  spectator: () => FollowableSpectator | null;
  clearShadow: () => void;
}

/** The variant set: `set(v)` switches `v` on (and the previous off), `set(null)` puts everything back; `beforeRead` before each render. */
export interface FrameDiag {
  set(variant: FrameDiagVariant | null): FrameDiagVariant | null;
  beforeRead(): void;
  readonly variant: FrameDiagVariant | null;
}

export function frameDiag(deps: FrameDiagDeps): FrameDiag {
  let variant: FrameDiagVariant | null = null;
  let undo: (() => void) | null = null;
  const toggle = (): boolean => {
    const s = deps.spectator();
    const release: SpectatorKey = { type: 'keyup', code: 'KeyX', repeat: false, preventDefault: () => {} };
    return s ? s.key(release) : false;
  };
  const on = (v: FrameDiagVariant): (() => void) | null => {
    switch (v) {
      case 'staticCamera': {
        const s = deps.spectator();
        if (!s || s.mode !== 'follow' || !toggle()) return null;
        return () => { if (deps.spectator()?.mode === 'free') toggle(); };
      }
      case 'noBodies': {
        const kept: [Object3D, number][] = [];
        for (const b of deps.bodies()) b.group.traverse((o) => { kept.push([o, o.layers.mask]); o.layers.disableAll(); });
        return () => { for (const [o, mask] of kept) o.layers.mask = mask; };
      }
      case 'noEffectLight': {
        const kept: Object3D[] = [];
        deps.scene().traverse((o) => { if (o.userData['effectLightPass'] === true && o.visible) kept.push(o); });
        for (const o of kept) o.visible = false;
        return () => { for (const o of kept) o.visible = true; };
      }
      case 'noShadow':
        return () => {};
    }
  };
  return {
    set(v) {
      undo?.();
      undo = null;
      variant = null;
      if (v === null) return null;
      undo = on(v);
      variant = undo ? v : null;
      return variant;
    },
    beforeRead() { if (variant === 'noShadow') deps.clearShadow(); },
    get variant() { return variant; },
  };
}
