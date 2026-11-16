import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import type { SkeletonPart } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { PART } from '../src/net/damage';
import * as hv from '../src/net/hitVolumes';
import {
  bodyRecords, bodyVolumes, boneTable, boxBounds, ownedBoxes, posedBoxes, rayRecords, refreshBoxes,
  stanceVolumes, type BoneBox, type HitBody, type V3,
} from '../src/net/hitVolumes';
import { loadSimSkeleton, type SimSkeleton } from '../src/simMap';
import { writePose } from '../src/animator';
import { sampleClip, transformPoint } from '@s2u/scene';
import type { Stance } from '../src/mover';

/**
 * SPINELO-EMPTY (research 217 s3.6b, "The shooting legs on the original" and "The verdict"; reading, pending review):
 * `spinelo` is a BODY damage bone (`FUN_005abbc0` D:L464740-464766) whose disc bbox is all zero on MP2's scuba SEALs, and
 * the original's live `spinelo` PERSON polygon keeps those six zeros (217 s3.6b, "The scuba SEALs' belly band": shadow's
 * live node read, 2026-11-11). On the original a round through the standing trunk between the hips' box and `spinehi`'s
 * takes the scuba SEAL's arm and no BODY, and the terrorist's arm and BODY (the shooting legs, 2026-11-12). So the
 * table keeps an all-zero box all zero -- a box nothing enters (`entry`) -- and the band box that stood in for it
 * (SPINELO-FALLBACK, a placeholder, retired 2026-11-12) is gone: no BODY there on the SEAL, and the body's cull bounds
 * are the disc boxes' own. The rounds the original logged are replayed in `match/test/bellyBandReplay.test.ts`.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

const T16 = (x: number, y: number, z: number): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1);
const part = (index: number, name: string, parent: number, bbox: number[], t: [number, number, number] = [0, 0, 0]): SkeletonPart =>
  ({ index, name, parent, bindLocal: T16(...t), bbox: Float32Array.from(bbox), type: 0, flags: 0 }) as SkeletonPart;

describe('SPINELO-EMPTY: an all-zero box stays empty, on the table', () => {
  it('the band placeholder is gone: no SPINELO_BAND_PLACEHOLDER export', () => {
    expect('SPINELO_BAND_PLACEHOLDER' in hv).toBe(false);
  });

  it('an all-zero BODY bone with a next joint keeps its six zeros; every other box is the disc\'s', () => {
    const parts = [
      part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0], [0, 10, 0]), part(1, 'hips', 0, [-2, -1, -2, 2, 1.5, 2]),
      part(2, 'aimnodes', 1, [0, 0, 0, 0, 0, 0]), part(3, 'spinelo', 2, [0, 0, 0, 0, 0, 0], [0, 1, 0]),
      part(4, 'spinehi', 3, [-2, 0.5, -2, 2, 4, 2], [0.25, 1.5, -0.5]), part(5, 'neck', 4, [-1, 0, -1, 1, 1, 1], [0, 4, 0]),
    ];
    const t = boneTable(parts);
    expect([...t.box[3]!]).toEqual([0, 0, 0, 0, 0, 0]);                 // spinelo: empty, as the disc and the live node
    expect(t.part[3]).toBe(PART.BODY);                                  // still a BODY bone: its part is the branch's
    expect([...t.box[0]!]).toEqual([0, 0, 0, 0, 0, 0]);                 // skel_root
    expect([...t.box[2]!]).toEqual([0, 0, 0, 0, 0, 0]);                 // aimnodes
    expect([...t.box[1]!]).toEqual([-2, -1, -2, 2, 1.5, 2]);
    expect([...t.box[4]!]).toEqual([-2, 0.5, -2, 2, 4, 2]);
  });

  it('the cull bounds are the non-empty boxes\' own: the empty spinelo widens nothing', () => {
    const parts = [
      part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0]), part(1, 'spinelo', 0, [0, 0, 0, 0, 0, 0]),
      part(2, 'spinehi', 1, [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], [3, 0.2, 0.1]),
    ];
    const t = boneTable(parts);
    const boxes: BoneBox[] = [...t.index].map((bone, n) => ({ part: t.part[n]!, bone, box: t.box[n]!, w: bone === 2 ? T16(3, 0.2, 0.1) : T16(0, 0, 0) }));
    const k = boxBounds(boxes, new Float64Array(6));
    // spinehi's cube at (3, 0.2, 0.1) alone, grown by the 1e-3 slack
    const want = [2.5, -0.3, -0.4, 3.5, 0.7, 0.6].map((v, i) => v + (i < 3 ? -1e-3 : 1e-3));
    for (let r = 0; r < 6; r++) expect(k[r]!).toBeCloseTo(want[r]!, 6);
  });

  it('a BODY bone whose disc box is not empty keeps it', () => {
    const live = boneTable([part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0]), part(1, 'spinelo', 0, [-3, 0, -3, 3, 2, 3]),
      part(2, 'spinehi', 1, [-1, 0, -1, 1, 1, 1], [0, 2, 0])]);
    expect([...live.box[1]!]).toEqual([-3, 0, -3, 3, 2, 3]);
  });
});

/** A level line's direction from the yaw `deg` (0: from the front, the body facing -z, the line along +z). */
const dirOf = (deg: number): V3 => { const a = (deg * Math.PI) / 180; return [Math.sin(a), 0, Math.cos(a)]; };
type Rec = [number, number, number];
const records = (o: readonly number[], d: readonly number[], body: HitBody): Rec[] => {
  const out: Rec[] = [];
  rayRecords(o, d, 200, body, (p, t, b) => { out.push([p, t, b]); });
  return out;
};
const sameRecords = (a: readonly Rec[], b: readonly Rec[]): boolean =>
  a.length === b.length && a.every((r, i) => Object.is(r[0], b[i]![0]) && Object.is(r[1], b[i]![1]) && Object.is(r[2], b[i]![2]));

describe.skipIf(!MP2 || !PACK || !READERC)(`SPINELO-EMPTY on Frostfire's scuba SEAL${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let sim: SimSkeleton;
  const get = async (): Promise<SimSkeleton> => {
    if (!sim) {
      const loaded = await loadSimSkeleton(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
      if (!loaded) throw new Error('no skeleton');
      sim = loaded;
    }
    return sim;
  };

  it('standing idle: a level line between the spinelo and spinehi joints makes no spinelo record, front, sides and behind', async () => {
    const s = await get();
    expect(s.model).toBe('seal_A_scuba');
    const sk = s.skeleton, lo = sk.indexOf('spinelo'), hiI = sk.indexOf('spinehi');
    expect([...sk.parts[lo]!.bbox].every((x) => x === 0), 'seal_A_scuba spinelo decoded all zero').toBe(true);
    const clip = s.idles.stand!;
    writePose(sk, sampleClip(clip, 0, { loop: false }).parts);
    const a = transformPoint(sk.world[lo]!, 0, 0, 0), b = transformPoint(sk.world[hiI]!, 0, 0, 0);
    sk.resetToBind();
    const m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const body = bodyVolumes([0, 0, 0], 0, 'stand', stanceVolumes(s));
    for (const deg of [0, 90, 180, 270]) {
      const d = dirOf(deg), o = [m[0] - d[0] * 60, m[1], m[2] - d[2] * 60];
      const now = records(o, d, body);
      console.log(`SPINELO-EMPTY band line from ${deg} at y ${m[1].toFixed(3)}: ${JSON.stringify(now.map((r) => [r[0], +r[1].toFixed(3), sk.parts[r[2]]!.name]))}`);
      expect(now.some((r) => r[2] === lo), `from ${deg}: no spinelo record`).toBe(false);
    }
    // from the front, the band's middle meets no BODY at all (the original: the arm alone, or nothing behind it)
    const front = records([m[0], m[1], m[2] - 60], dirOf(0), body);
    expect(front.some((r) => r[0] === PART.BODY), `front: ${JSON.stringify(front)}`).toBe(false);
  }, 120_000);

  it('the room\'s and the page\'s paths: posedBoxes and refreshBoxes carry the empty box, the kept bounds are the disc boxes\' own, bodyRecords = rayRecords', async () => {
    const s = await get();
    const sk = s.skeleton, lo = sk.indexOf('spinelo');
    const clip = s.idles.stand!;
    writePose(sk, sampleClip(clip, 0, { loop: false }).parts);
    const posedSet = posedBoxes(sk), owned = ownedBoxes(), refreshed = refreshBoxes(sk, owned);
    sk.resetToBind();
    const empty = posedSet.find((b) => b.bone === lo)!;
    expect(empty.part).toBe(PART.BODY);
    expect([...empty.box]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(refreshed.find((b) => b.bone === lo)!.box).toBe(empty.box);              // one table box, shared
    // the kept bounds, computed apart from `boxBounds`: every non-empty posed box's eight corners, grown by the slack
    const ind = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const b of refreshed) {
      const x = b.box, w = b.w;
      if (x.every((v) => v === 0)) continue;
      for (let n = 0; n < 8; n++) {
        const p = [n & 1 ? x[3]! : x[0]!, n & 2 ? x[4]! : x[1]!, n & 4 ? x[5]! : x[2]!];
        for (let r = 0; r < 3; r++) {
          const v = p[0]! * w[r]! + p[1]! * w[4 + r]! + p[2]! * w[8 + r]! + w[12 + r]!;
          ind[r] = Math.min(ind[r]!, v); ind[3 + r] = Math.max(ind[3 + r]!, v);
        }
      }
    }
    const k = owned.bounds;
    console.log(`SPINELO-EMPTY bounds (stand idle, body frame): ${[...k].map((v) => v.toFixed(3))}`);
    for (let r = 0; r < 6; r++) expect(k[r]!).toBeCloseTo(ind[r]! + (r < 3 ? -1e-3 : 1e-3), 5);
    // the room's hot path gives the same records as the placed body's, and no spinelo record among them
    const vols = stanceVolumes(s);
    const m = transformPoint(empty.w as Float32Array, 0, 0, 0);
    for (const deg of [0, 90, 180, 270]) {
      const d = dirOf(deg), o = [m[0] - d[0] * 60 + 5, m[1] + 3, m[2] - d[2] * 60 - 7];
      const feet = [5, 3, -7];
      const a: Rec[] = [], b: Rec[] = [];
      bodyRecords(o, d, 200, feet, 0, 'stand' as Stance, vols, null, 0, (p, t, bone) => { a.push([p, t, bone]); });
      rayRecords(o, d, 200, bodyVolumes(feet, 0, 'stand', vols), (p, t, bone) => { b.push([p, t, bone]); });
      expect(sameRecords(a, b)).toBe(true);
      expect(a.some((r) => r[2] === lo), `from ${deg}`).toBe(false);
    }
  }, 120_000);
});
