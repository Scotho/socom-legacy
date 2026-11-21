import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { flatWorkplane, isDefaultWorkplane, isFlatWorkplane, onWorkplane, pickedWorkplane, rayOnWorkplane, workplaneOffset } from '../../src/forge/mapGrid';

// The workplane (a browser adaptation, FG.R2: the original has no editor): a plane picked off a surface, its normal the
// surface's, its grid the world's lattice carried onto it.
describe('workplane', () => {
  it('a flat one: its height its offset; the default flat at 0', () => {
    expect(isDefaultWorkplane(flatWorkplane(0))).toBe(true);
    expect(isDefaultWorkplane(flatWorkplane(20))).toBe(false);
    expect(isFlatWorkplane(flatWorkplane(20))).toBe(true);
    expect(workplaneOffset(flatWorkplane(20))).toBe(20);
  });

  it('picked off a floor: flat at its height; with snap the step at or above it, never below', () => {
    expect(pickedWorkplane(new Vector3(3, 70.181, 9), new Vector3(0, 1, 0), null)).toEqual({ at: [0, 70.181, 0], n: [0, 1, 0] });
    expect(pickedWorkplane(new Vector3(3, 70.181, 9), new Vector3(0, 1, 0), 25)).toEqual({ at: [0, 75, 0], n: [0, 1, 0] });
    expect(pickedWorkplane(new Vector3(3, 75, 9), new Vector3(0, 1, 0), 25).at[1]).toBe(75);
  });

  it('picked off a wall or a ceiling: upright or facing down, the step on the side it was picked from', () => {
    const wall = pickedWorkplane(new Vector3(-10, 5, 2), new Vector3(-1, 0, 0), 25);
    expect(wall.n).toEqual([-1, 0, 0]);
    expect(wall.at[0]).toBe(-25);                                  // in front of the wall, on the camera's side
    expect(isFlatWorkplane(wall)).toBe(false);
    const ceiling = pickedWorkplane(new Vector3(0, 40, 0), new Vector3(0, -1, 0), 25);
    expect(ceiling.n).toEqual([0, -1, 0]);
    expect(ceiling.at[1]).toBe(25);                                 // under the ceiling
  });

  it('a normal within a hair of an axis is that axis', () => {
    expect(pickedWorkplane(new Vector3(0, 10, 0), new Vector3(1e-6, 1, -1e-6).normalize(), null).n).toEqual([0, 1, 0]);
  });

  it('a ray meets it ahead and within reach; parallel or behind, not', () => {
    const w = flatWorkplane(50);
    expect(rayOnWorkplane(w, new Vector3(0, 100, 0), new Vector3(0, -1, 0), 1000)?.toArray()).toEqual([0, 50, 0]);
    expect(rayOnWorkplane(w, new Vector3(0, 100, 0), new Vector3(0, 1, 0), 1000)).toBeNull();
    expect(rayOnWorkplane(w, new Vector3(0, 100, 0), new Vector3(1, 0, 0), 1000)).toBeNull();
    expect(rayOnWorkplane(w, new Vector3(0, 100, 0), new Vector3(0, -1, 0), 10)).toBeNull();
  });

  it('a point put on it, on its grid with snap: the world lattice on a flat one, tilted with a tilted one', () => {
    const flat = onWorkplane(flatWorkplane(50), new Vector3(12, 3, -38), 25);
    expect(flat.toArray().map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 50, -50]);
    const k = Math.SQRT1_2;
    const tilted = { at: [0, 0, 0] as [number, number, number], n: [-k, k, 0] as [number, number, number] };
    const p = onWorkplane(tilted, new Vector3(30, 31, 7), 10);
    expect(Math.abs(p.dot(new Vector3(-k, k, 0)))).toBeLessThan(1e-9);   // on the plane
    expect(Math.abs(p.z - 10)).toBeLessThan(1e-9);                       // z untouched by the tilt about it: the lattice
  });
});
