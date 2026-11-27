import { Group, Matrix4 } from 'three';
import { bodySkeleton } from '../play';
import { heldSkeleton } from '../heldItem';
import { PROTOTYPE_BONE_LIMIT_ADAPTATION } from './model';
import type { BodyRig } from './runtimeAssets';

/** Browser renderer adaptation: the shared Play writes the original pose into CPU
 * transforms, then the raw shader borrows its palette. There are no Three meshes,
 * materials, textures or renderer allocations in this view. The body is pruned
 * simulation metadata, never the decoded upload container.
 */
export function prototypePlayBody(body: BodyRig) {
  if (body.parts.length > PROTOTYPE_BONE_LIMIT_ADAPTATION) throw new Error('Prototype body bone limit exceeded');
  const skeleton = heldSkeleton(bodySkeleton(body));
  const group = new Group(), bones = body.parts.map(part => {
    const bone = new Group(); bone.name = part.name; bone.matrixAutoUpdate = false;
    bone.matrix.fromArray(part.bindLocal); return bone;
  });
  bones.forEach((bone, index) => (bones[body.parts[index]!.parent] ?? group).add(bone));
  const props: Group[] = [], gear = new Map(body.fittings.map(fitting => [fitting.name, fitting.name !== 'Satchel']));
  const inverses = body.parts.map(part => new Matrix4().fromArray(part.bindWorld).invert());
  const palette = new Float32Array(PROTOTYPE_BONE_LIMIT_ADAPTATION * 16), scratch = new Matrix4();
  return {
    group, skeleton, palette,
    setVisible(on: boolean) { group.visible = on; },
    setPose(locals: readonly ArrayLike<number>[]) {
      locals.forEach((matrix, index) => {
        if (index < skeleton.local.length) skeleton.setLocal(index, matrix);
        const node = bones[index] ?? props[index - bones.length];
        if (node) { node.matrix.fromArray(matrix); node.matrixWorldNeedsUpdate = true; }
      });
      skeleton.update();
      for (let index = 0; index < bones.length; index++) scratch.fromArray(skeleton.world[index]!).multiply(inverses[index]!).toArray(palette, index * 16);
    },
    place(feet: readonly [number, number, number], yaw: number) {
      group.position.set(...feet); group.rotation.y = yaw * Math.PI / 180;
    },
    addProp(name: string, parent: string) {
      const existing = props.find(prop => prop.name === name && prop.parent?.name === parent);
      if (existing) return existing;
      const prop = new Group(); prop.name = name; prop.matrixAutoUpdate = false;
      (bones.find(bone => bone.name === parent) ?? group).add(prop); props.push(prop); return prop;
    },
    setGearVisible(name: string, on: boolean) { if (!gear.has(name)) return false; gear.set(name, on); return true; },
    /** Borrowed by the raw renderer; visibility only, never decoded fittings. */
    gearVisibility(): ReadonlyMap<string, boolean> { return gear; },
  };
}
