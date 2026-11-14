import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { planForgeLayout } from '../../../src/forge/agent/commands';
import { emptyLayout } from '../../../src/forge/layout';
import { worldPart } from '../../../src/forge/cuts/geometry';
import type { LoadedMesh } from '../../../src/loadMap';
import {
  CUT_CAP_LEVEL_ADAPTATION, CUT_CAP_LOOK_REACH_ADAPTATION, CUT_CAP_SQUARE_ADAPTATION, CUT_CAP_TEXELS_ADAPTATION,
  CUT_CAP_THICKEST_ADAPTATION, CUT_CAP_THINNEST_ADAPTATION, CUT_DEFAULT_SIZE_ADAPTATION, CUT_SLIVER_AREA_ADAPTATION,
  DOOR_CUT_FACES_ADAPTATION, DOOR_CUT_FLOOR_CLEAR_ADAPTATION, DOOR_CUT_HALF_DEPTH_ADAPTATION, DOOR_CUT_PAD_ADAPTATION,
  DOOR_SNAP_ALONG_SLACK_ADAPTATION, DOOR_SNAP_FOOT_ADAPTATION, DOOR_SNAP_OPPOSED_ADAPTATION, DOOR_SNAP_REACH_ADAPTATION,
  DOOR_SNAP_THICKEST_ADAPTATION, DOOR_SNAP_THINNEST_ADAPTATION, DOOR_SNAP_UPRIGHT_ADAPTATION,
} from '../../../src/forge/cuts';
import {
  DOOR_FRAME_FIT_ADAPTATION, DOOR_FRAME_REACH_ADAPTATION, DOOR_FRAME_SIZE_ADAPTATION, DOOR_REVEAL_FACING_ADAPTATION,
} from '../../../src/forge/placedDoors';
import { CUT_SIZE_MIN_ADAPTATION, RECORD_LIMITS } from '@s2u/creator-contracts';

/**
 * FORGE CUTS, the editor's and the agent's edits of a cut box (`cut.place`, `placement.set` on `cut:<n>`; a browser
 * adaptation, FG.R2), the adaptation values pinned, and a redrawn prop keeping its node path.
 */

const blank = () => emptyLayout({ kind: 'blank', library: 'floor' });

describe('cut.place and placement.set on a cut box', () => {
  it('places a doorway-sized box taking every face, or the size and faces given', () => {
    let l = planForgeLayout(blank(), 'cut.place', { at: [10, 12, 20] }, []);
    expect(l.cuts).toEqual([{ at: [10, 12, 20], yaw: 0, size: CUT_DEFAULT_SIZE_ADAPTATION }]);
    l = planForgeLayout(l, 'cut.place', { at: [0, 5, 0], size: [4, 10, 2], faces: 'xz' }, []);
    expect(l.cuts![1]).toMatchObject({ size: [4, 10, 2], faces: 'xz' });
  });
  it('refuses a size too small, too large or not three numbers, and faces outside xyz', () => {
    for (const size of [[0, 1, 1], [-1, 1, 1], [0.05, 1, 1], [1, RECORD_LIMITS.coord + 1, 1], [1, 1], [1, '2', 1]]) {
      expect(() => planForgeLayout(blank(), 'cut.place', { at: [0, 0, 0], size }, []), JSON.stringify(size)).toThrow(/size/);
    }
    expect(() => planForgeLayout(blank(), 'cut.place', { at: [0, 0, 0], faces: 'w' }, [])).toThrow(/faces/);
  });
  it('sets its width, height, depth and faces; a new height keeps its foot where it stands', () => {
    let l = planForgeLayout(blank(), 'cut.place', { at: [0, 12, 0], size: [14, 24, 10] }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'cut:0', field: 'height', value: 10 }, []);
    expect(l.cuts![0]!.size).toEqual([14, 10, 10]);
    expect(l.cuts![0]!.at[1] - l.cuts![0]!.size[1] / 2).toBeCloseTo(0, 9);       // its foot stays at y 0
    l = planForgeLayout(l, 'placement.set', { ref: 'cut:0', field: 'width', value: 3 }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'cut:0', field: 'depth', value: 2 }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'cut:0', field: 'faces', value: 'y' }, []);
    expect(l.cuts![0]).toMatchObject({ size: [3, 10, 2], faces: 'y' });
    l = planForgeLayout(l, 'placement.set', { ref: 'cut:0', field: 'faces', value: 'xyz' }, []);
    expect(l.cuts![0]!.faces).toBeUndefined();
    for (const [field, value] of [['height', CUT_SIZE_MIN_ADAPTATION / 2], ['width', RECORD_LIMITS.coord * 2], ['faces', 'zx'], ['name', 'x']] as const) {
      expect(() => planForgeLayout(l, 'placement.set', { ref: 'cut:0', field, value }, []), `${field} ${value}`).toThrow();
    }
  });
});

describe('the adaptation values (no original: the game cuts nothing), pinned', () => {
  it('holds each at its value', () => {
    expect({
      CUT_SLIVER_AREA_ADAPTATION, DOOR_CUT_PAD_ADAPTATION, DOOR_CUT_FLOOR_CLEAR_ADAPTATION, DOOR_CUT_HALF_DEPTH_ADAPTATION,
      DOOR_CUT_FACES_ADAPTATION, CUT_DEFAULT_SIZE_ADAPTATION, CUT_SIZE_MIN_ADAPTATION,
      CUT_CAP_THICKEST_ADAPTATION, CUT_CAP_THINNEST_ADAPTATION, CUT_CAP_SQUARE_ADAPTATION, CUT_CAP_LOOK_REACH_ADAPTATION,
      CUT_CAP_LEVEL_ADAPTATION, CUT_CAP_TEXELS_ADAPTATION,
      DOOR_SNAP_REACH_ADAPTATION, DOOR_SNAP_THICKEST_ADAPTATION, DOOR_SNAP_THINNEST_ADAPTATION, DOOR_SNAP_FOOT_ADAPTATION,
      DOOR_SNAP_UPRIGHT_ADAPTATION, DOOR_SNAP_ALONG_SLACK_ADAPTATION, DOOR_SNAP_OPPOSED_ADAPTATION,
      DOOR_FRAME_FIT_ADAPTATION, DOOR_FRAME_REACH_ADAPTATION, DOOR_FRAME_SIZE_ADAPTATION, DOOR_REVEAL_FACING_ADAPTATION,
    }).toEqual({
      CUT_SLIVER_AREA_ADAPTATION: 1e-4, DOOR_CUT_PAD_ADAPTATION: 0.2, DOOR_CUT_FLOOR_CLEAR_ADAPTATION: 0.1, DOOR_CUT_HALF_DEPTH_ADAPTATION: 5,
      DOOR_CUT_FACES_ADAPTATION: { x: true, y: false, z: true }, CUT_DEFAULT_SIZE_ADAPTATION: [14, 24, 10], CUT_SIZE_MIN_ADAPTATION: 0.1,
      CUT_CAP_THICKEST_ADAPTATION: 8, CUT_CAP_THINNEST_ADAPTATION: 0.25, CUT_CAP_SQUARE_ADAPTATION: 0.95, CUT_CAP_LOOK_REACH_ADAPTATION: 10,
      CUT_CAP_LEVEL_ADAPTATION: 0.5, CUT_CAP_TEXELS_ADAPTATION: 0.05,
      DOOR_SNAP_REACH_ADAPTATION: 6, DOOR_SNAP_THICKEST_ADAPTATION: 8, DOOR_SNAP_THINNEST_ADAPTATION: 0.5, DOOR_SNAP_FOOT_ADAPTATION: 3,
      DOOR_SNAP_UPRIGHT_ADAPTATION: 0.3, DOOR_SNAP_ALONG_SLACK_ADAPTATION: 2, DOOR_SNAP_OPPOSED_ADAPTATION: 0.95,
      DOOR_FRAME_FIT_ADAPTATION: 1.5, DOOR_FRAME_REACH_ADAPTATION: 15, DOOR_FRAME_SIZE_ADAPTATION: 2, DOOR_REVEAL_FACING_ADAPTATION: 0.5,
    });
  });
});

describe('a prop a cut reaches, redrawn as a world chunk', () => {
  it("keeps its placement's node path, so the world's state still shows and hides it", () => {
    const part = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1),
      normals: null, faceNormals: null, indices: Uint32Array.from([0, 1, 2]), textureName: 't.tif', fog: true, lit: true,
      order: 3, orderEnd: 3, cull: true, alternate: false, scroll: null,
    } as LoadedMesh;
    const chunk = worldPart(part, new Matrix4().makeTranslation(5, 0, 0), 3, undefined, 'worldmodel/access1=access1/good_parts/di_good');
    expect(chunk.switchPath).toBe('worldmodel/access1=access1/good_parts/di_good');
    expect(Array.from(chunk.positions.subarray(0, 3))).toEqual([5, 0, 0]);
    expect(worldPart(part, new Matrix4(), 3, undefined).switchPath).toBeUndefined();
  });
});
