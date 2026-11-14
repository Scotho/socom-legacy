import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { faceOf, leafFrame, snapDoor, wallFaces, type WallFace } from '../../../src/forge/cuts';

/**
 * FORGE door snapping (a browser adaptation, FG.R2): a door dropped by a wall turns square to it and sits in the middle
 * of its thickness; along the wall and up it stays where it was put; with no wall in reach it is left alone.
 */

/** A leaf 13 wide (x 0..13), 23 tall and 2 thick (z -1..1), its hinge at the origin: a box's six faces. */
const LEAF = (() => {
  const c = (x: number, y: number, z: number) => [x, y, z];
  const quads = [
    [c(0, 0, -1), c(13, 0, -1), c(13, 23, -1), c(0, 23, -1)], [c(0, 0, 1), c(0, 23, 1), c(13, 23, 1), c(13, 0, 1)],
    [c(0, 0, -1), c(0, 0, 1), c(13, 0, 1), c(13, 0, -1)], [c(0, 23, -1), c(13, 23, -1), c(13, 23, 1), c(0, 23, 1)],
    [c(0, 0, -1), c(0, 23, -1), c(0, 23, 1), c(0, 0, 1)], [c(13, 0, -1), c(13, 0, 1), c(13, 23, 1), c(13, 23, -1)],
  ];
  return quads.map((q) => ({ points: Float32Array.from(q.flat()) }));
})();
const place = (at: readonly number[], yaw: number) => new Matrix4().makeRotationY(yaw).setPosition(at[0]!, at[1]!, at[2]!);
/** A wall 3 thick between z 10 and z 13, x -50..50, y 0..40: its near face looks -z, its far face +z. */
const WALL: WallFace[] = [
  faceOf([-50, 0, 10, -50, 40, 10, 50, 40, 10, 50, 0, 10])!,
  faceOf([-50, 0, 13, 50, 0, 13, 50, 40, 13, -50, 40, 13])!,
];
const leafAt = (at: readonly number[], yaw: number) => {
  const m = place(at, yaw), v = new Vector3();
  return leafFrame(LEAF.flatMap((p) => Array.from({ length: p.points.length / 3 }, (_, i) => {
    v.set(p.points[i * 3]!, p.points[i * 3 + 1]!, p.points[i * 3 + 2]!).applyMatrix4(m);
    return [v.x, v.y, v.z] as [number, number, number];
  })))!;
};

describe('snapDoor', () => {
  it('reads both faces of the wall, facing away from each other', () => {
    expect(WALL[0]!.n[1]).toBeCloseTo(-1, 6);
    expect(WALL[1]!.n[1]).toBeCloseTo(1, 6);
  });
  it('turns a door dropped askew by the wall square to it and sets it in the wall\'s middle, its height and place along kept', () => {
    const s = snapDoor([2, 0, 8], 0.3, place, LEAF, WALL)!;
    expect(s).not.toBeNull();
    const f = leafAt(s.at, s.yaw);
    expect(Math.abs(f.n[1])).toBeCloseTo(1, 6);                // its way through the leaf is the wall's normal
    expect(f.c[2]).toBeCloseTo(11.5, 4);                        // halfway between z 10 and z 13
    expect(s.at[1]).toBe(0);
    expect(f.c[0]).toBeCloseTo(leafAt(s.at, s.yaw).c[0], 6);
  });
  it('a door square already moves only across the wall', () => {
    const s = snapDoor([4, 0, 9], 0, place, LEAF, WALL)!;
    expect(s.yaw).toBeCloseTo(0, 9);
    expect(s.at[0]).toBeCloseTo(4, 9);
    expect(leafAt(s.at, s.yaw).c[2]).toBeCloseTo(11.5, 4);
  });
  it('a one-faced wall takes the door onto its face', () => {
    const s = snapDoor([0, 0, 8], 0, place, LEAF, [WALL[0]!])!;
    expect(leafAt(s.at, s.yaw).c[2]).toBeCloseTo(10, 4);
  });
  it('no wall in reach, no snap', () => {
    expect(snapDoor([0, 0, -20], 0, place, LEAF, WALL)).toBeNull();
    expect(snapDoor([0, 0, 8], 0, place, LEAF, [])).toBeNull();
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))("snapping into Frostfire's barracks wall (SOCOM_ISO)", () => {
  it("bdoor_4 dropped askew 4 units off the wall at z 1001..1004 lands square, its frame (dfram2) centred in the wall", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../../tools/fmv-spike');
    const { loadMap } = await import('../../../src/loadMap');
    const { doorFramePoints, doorTemplates, doorMove } = await import('../../../src/forge/placedDoors');
    const map = await loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP2.ZDB');
    const t = doorTemplates(map, 'MP2').find((d) => d.name === 'bdoor_4')!;
    const leaf = t.owners.flatMap((o) => o.polys);
    const frame = doorFramePoints(t);
    expect(frame.length).toBeGreaterThan(0);
    const s = snapDoor([609.5, 142, 998], Math.PI + 0.25, (at, yaw) => doorMove(t, at, yaw), leaf, wallFaces(map.ground!), frame)!;
    expect(s).not.toBeNull();
    const m = doorMove(t, s.at, s.yaw), v = new Vector3();
    const f = leafFrame(leaf.flatMap((p) => Array.from({ length: p.points.length / 3 }, (_, i) => {
      v.set(p.points[i * 3]!, p.points[i * 3 + 1]!, p.points[i * 3 + 2]!).applyMatrix4(m);
      return [v.x, v.y, v.z] as [number, number, number];
    })))!;
    // The frame stands square to the wall; the disc's leaf rests 4 degrees ajar inside it, as on Frostfire.
    const moved = frame.map((p) => { v.set(p[0], p[1], p[2]).applyMatrix4(m); return [v.x, v.y, v.z] as [number, number, number]; });
    expect(Math.abs(leafFrame(moved)!.n[1])).toBeCloseTo(1, 4);
    expect(Math.abs(f.n[1])).toBeCloseTo(Math.cos((4 * Math.PI) / 180), 2);
    const zs = moved.map((p) => p[2]);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(1002.5, 1);   // the frame's middle on the wall's
    expect(s.at[1]).toBe(142);
  }, 180_000);
});
