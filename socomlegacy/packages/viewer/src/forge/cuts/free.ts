import { Matrix4 } from 'three';
import type { CutMarker } from '../layout';
import { ALL_FACES, makeCutBox, type CutBox, type CutFaces } from './geometry';

/**
 * FORGE CUTS, the free cut box (a browser adaptation, FG.R2): a box the layout places anywhere (`Layout.cuts`), moved,
 * turned about y and sized like any marker, clipping what it holds out of the map. Its `faces` say which surfaces it
 * takes, by the axis of its own frame their normals run along: "xyz" (all, the default), "xz" (walls only: a window or
 * a doorway with its floor kept), "y" (floors and ceilings only: a hatch).
 */

/** A new cut box's size, world units (about 10 cm each): a doorway, 1.4 m wide, 2.4 m tall, 1 m deep. */
export const CUT_DEFAULT_SIZE_ADAPTATION: [number, number, number] = [14, 24, 10];

/** A cut's faces from its marker's word ("xyz" when absent). */
export function facesOf(word: string | undefined): CutFaces {
  if (word === undefined) return ALL_FACES;
  return { x: word.includes('x'), y: word.includes('y'), z: word.includes('z') };
}
/** A cut's faces as its marker's word: absent for all three. */
export function wordOf(faces: CutFaces): string | undefined {
  const w = `${faces.x ? 'x' : ''}${faces.y ? 'y' : ''}${faces.z ? 'z' : ''}`;
  return w === 'xyz' ? undefined : w;
}

/** A free cut's box: centred on its place, turned by its yaw, its size about its centre. */
export function freeCutBox(c: Pick<CutMarker, 'at' | 'yaw' | 'size' | 'faces'>): CutBox {
  const world = new Matrix4().makeRotationY(c.yaw).setPosition(c.at[0], c.at[1], c.at[2]);
  const h = c.size.map((v) => v / 2) as [number, number, number];
  return makeCutBox(world, [-h[0], -h[1], -h[2]], h, facesOf(c.faces));
}
