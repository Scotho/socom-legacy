import { Vector3 } from 'three';
import type { Node } from 'three/webgpu';
import { normalWorld, renderGroup, uniform, varying, vec3 } from 'three/tsl';
import type { GlobalLighting } from '@s2u/scene';
import { FALLBACK_RIG } from './lighting';

/**
 * The map's `GlobalLighting` rig on a moving thing, on the GPU, per vertex, every frame: the VU1 light command
 * (`0x54`/`0x18`, `./lighting`'s `applyLighting` is its CPU twin) on the normal as the frame poses it -- skinned
 * through the bones for the SEAL (three's skinning moves `normalWorld` with the vertex), turned with the hand for the
 * rifle, with the throw for a grenade. The CPU path lit the body's bind-pose normals and re-lit them only when the
 * body had turned ten degrees, so a raised arm or a crouched back kept the light of the standing pose.
 *
 * `lit = ambient + sum_k C_k * max(dot(D_k, N), 0)`, three directions in the rig's world frame -- the same frame the
 * world's normals are lit in, so a SEAL beside a wall is lit from where the wall is. Per vertex (a varying), as the VU
 * lights vertices and the GS interpolates the colour.
 */
export interface RigShading {
  /** The lit colour, rgb, 1.0 the PS2's unity; multiply the vertex's material colour by it. */
  lit: Node<'vec3'>;
  /** Puts a rig on the uniforms (the fallback when the map has none, as `applyLighting` does). */
  set(rig: GlobalLighting | null): void;
}

/** Optional gains reuse the original rig; callers that omit them keep the original graph. */
export interface RigStrength { ambient: Node<'float'>; directional: Node<'float'> }
export function rigShading(rig: GlobalLighting | null, strength?: RigStrength): RigShading {
  // The rig is one per body, the same for every draw of it: three's render group, not the per-object default (CPS H9,
  // 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame across ~550 draws; a render-group uniform is
  // compared once a render). A browser adaptation on the CPU side only: the same values, the same arithmetic.
  const vector = (name: string) => uniform(new Vector3()).setName(name).setGroup(renderGroup);
  const dirs = [0, 1, 2].map((k) => vector(`rigDir${k}`));
  const colours = [0, 1, 2].map((k) => vector(`rigColour${k}`));
  const ambient = vector('rigAmbient');
  const set = (next: GlobalLighting | null): void => {
    const r = next ?? FALLBACK_RIG;
    for (let k = 0; k < 3; k++) {
      dirs[k]!.value.set(...r.directions[k]!);
      colours[k]!.value.set(...r.colours[k]!);
    }
    ambient.value.set(...r.ambient);
  };
  set(rig);
  const n = normalWorld;
  let sum: Node<'vec3'> = strength ? vec3(ambient).mul(strength.ambient) : vec3(ambient);
  for (let k = 0; k < 3; k++) {
    const directional = vec3(colours[k]!).mul(n.dot(dirs[k]!).max(0));
    sum = sum.add(strength ? directional.mul(strength.directional) : directional);
  }
  return { lit: varying(sum) as unknown as Node<'vec3'>, set };
}
