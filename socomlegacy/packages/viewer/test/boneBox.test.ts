import { describe, expect, it } from 'vitest';
import type { SkeletonPart } from '@s2u/scene';
import { PART } from '../src/net/damage';
import { BODY_CULL_BOX, bodyCulled, boneTable, NO_PART, rayBox, SPINEHI_MAX_X } from '../src/net/hitVolumes';

/**
 * BONE-BOXES (research 398 s1, "The box's test"; reading, pending review): the box class's test on a bone's box, pure.
 * The line in the box's frame; the faces tried in the order +y, +z, +x, -z, -x, -y, each only when the start lies
 * outside its plane, the first whose crossing lies in its rectangle the record -- so a start outside makes one record at
 * the entry face, a start inside none. The body's cull (`FUN_003124f0` D:L213172-213244 on the 24 x 20 x 28 box of
 * `FUN_00553ea0` D:L419728-419742): a line is refused only when both its ends lie past one face. The box list
 * (`FUN_0058b960` D:L447559-447593): the root and every bone under it, `spinehi`'s maximum x held to 3.01.
 */

const UNIT = Float32Array.of(0, 0, 0, 1, 1, 1);

describe('BONE-BOXES: the box\'s test', () => {
  it('a start outside: one record, at the face it enters by', () => {
    expect(rayBox([0.5, 0.5, -1], [0, 0, 1], UNIT, 100)).toBe(1);          // -z face
    expect(rayBox([2, 0.5, 0.5], [-1, 0, 0], UNIT, 100)).toBe(1);          // +x face
    expect(rayBox([0.5, 3, 0.5], [0, -1, 0], UNIT, 100)).toBe(2);          // +y face
    expect(rayBox([0.5, 0.25, -2], [0, 0, 2], UNIT, 100)).toBe(1);         // the distance in d's units (an affine map keeps it)
    // diagonal, outside two planes: only the face whose crossing lies in its rectangle is the record
    expect(rayBox([-1, 0.5, -0.5], [1, 0, 1], UNIT, 100)).toBeCloseTo(1, 12); // crosses x = 0 at z = 0.5: the -x face
  });

  it('a start inside: no record, whatever the direction (no exit record)', () => {
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.6, 0.8, 0]]) {
      expect(rayBox([0.5, 0.5, 0.5], d, UNIT, 100), d.join()).toBe(-1);
    }
  });

  it('a line parallel to a face never crosses it; one beside the box misses', () => {
    expect(rayBox([0.5, 2, 0.5], [1, 0, 0], UNIT, 100)).toBe(-1);         // above, along x
    expect(rayBox([-1, 0.5, 0.5], [1, 0, 0], UNIT, 100)).toBe(1);         // parallel to four faces, enters by -x
    expect(rayBox([-1, 1.5, 0.5], [1, 0, 0], UNIT, 100)).toBe(-1);        // beside it
    expect(rayBox([-1, 0.5, 0.5], [-1, 0, 0], UNIT, 100)).toBe(-1);       // going away
  });

  it('the reach bounds it; an edge counts; a start on a face\'s plane does not try that face', () => {
    expect(rayBox([0.5, 0.5, -5], [0, 0, 1], UNIT, 3)).toBe(-1);
    expect(rayBox([0.5, 0.5, -5], [0, 0, 1], UNIT, 5)).toBe(5);
    expect(rayBox([1, 1, -1], [0, 0, 1], UNIT, 100)).toBe(1);             // along the +x/+y edge
    expect(rayBox([0.5, 0.5, 0], [0, 0, 1], UNIT, 100)).toBe(-1);         // on the -z plane: not outside it
  });

  it('an empty bbox (all six zero, as spinelo\'s on the SEAL) is entered by nothing, a line through its point included; an inverted one neither', () => {
    const zero = new Float32Array(6), inverted = Float32Array.of(1, 1, 1, -1, -1, -1);
    for (const o of [[0, 0, -5], [0, 5, 0], [5, 0, 0]]) {
      expect(rayBox(o, [-o[0]! / 5, -o[1]! / 5, -o[2]! / 5], zero, 100)).toBe(-1);
      expect(rayBox(o, [-o[0]! / 5, -o[1]! / 5, -o[2]! / 5], inverted, 100)).toBe(-1);
    }
  });
});

describe('BONE-BOXES: the body\'s cull box (FUN_003124f0 on FUN_00553ea0\'s box)', () => {
  it('is 24 x 20 x 28 over the soles: (-12, 0, -14) to (12, 20, 14)', () => {
    expect([...BODY_CULL_BOX]).toEqual([-12, 0, -14, 12, 20, 14]);
  });

  it('refuses a line only when both its ends lie past one face, in the body\'s frame at its feet and yaw', () => {
    const feet = [100, 5, 50];
    expect(bodyCulled([0, 15, 50], [1, 0, 0], 1000, feet, 0)).toBe(false);          // through the body
    expect(bodyCulled([0, 26, 50], [1, 0, 0], 1000, feet, 0)).toBe(true);           // over the box (y 21 > 20)
    expect(bodyCulled([0, 4, 50], [1, 0, 0], 1000, feet, 0)).toBe(true);            // under the soles
    expect(bodyCulled([0, 15, 63], [1, 0, 0], 1000, feet, 0)).toBe(false);          // z 13: inside the 14
    expect(bodyCulled([0, 15, 63], [1, 0, 0], 1000, feet, 90)).toBe(true);          // turned: x 13 is past the 12
    expect(bodyCulled([0, 15, 50], [1, 0, 0], 50, feet, 0)).toBe(true);             // the line ends 50 short of the box
    // not an intersection test: a diagonal line wide of the box keeps one end each side of every face
    expect(bodyCulled([0, 15, 30], [Math.SQRT1_2, 0, Math.SQRT1_2], 1000, feet, 0)).toBe(false);
  });
});

describe('BONE-BOXES: the boxed bones', () => {
  const part = (index: number, name: string, parent: number, bbox: number[]): SkeletonPart =>
    ({ index, name, parent, bindLocal: new Float32Array(16), bbox: Float32Array.from(bbox), type: 0, flags: 0 }) as SkeletonPart;
  it('skel_root and every part under it, in order; `body` (a sibling) none; damage parts by bone; spinehi\'s max x held to 3.01', () => {
    const parts = [
      part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0]), part(1, 'hips', 0, [-1, -1, -1, 1, 1, 1]),
      part(2, 'spinehi', 1, [-3, -1, -1, 4, 1, 1]), part(3, 'rhand', 2, [0, 0, 0, 1, 1, 1]), part(4, 'body', -1, [0, 0, 0, 1, 1, 1]),
    ];
    const t = boneTable(parts);
    expect([...t.index]).toEqual([0, 1, 2, 3]);
    expect([...t.part]).toEqual([NO_PART, PART.BODY, PART.BODY, NO_PART]);
    expect(t.box[2]![3]).toBe(SPINEHI_MAX_X);
    expect(SPINEHI_MAX_X).toBe(Math.fround(3.01));
    expect(t.box[2]![0]).toBe(-3);
    expect(parts[2]!.bbox[3]).toBe(4);                              // the part's own bbox is not written
    expect(boneTable(parts)).toBe(t);                               // one table a parts list
  });
});
