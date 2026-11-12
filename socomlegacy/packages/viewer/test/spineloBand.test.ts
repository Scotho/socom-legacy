import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import type { SkeletonPart } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { PART } from '../src/net/damage';
import * as hv from '../src/net/hitVolumes';
import {
  bodyRecords, bodyVolumes, boneTable, boxBounds, ownedBoxes, placedVolumes, posedBoxes, rayRecords, refreshBoxes,
  skeletonVolumes, stanceVolumes, type BoneBox, type HitBody, type StanceVolumes, type V3,
} from '../src/net/hitVolumes';
import { loadSimSkeleton, type SimSkeleton } from '../src/simMap';
import { writePose } from '../src/animator';
import { sampleClip, transformPoint } from '@s2u/scene';
import type { Stance } from '../src/mover';

/**
 * SPINELO-FALLBACK (research 217 s3.6b, `SPINELO_BAND_PLACEHOLDER`; reading, pending review): `spinelo` is a BODY damage
 * bone (`FUN_005abbc0` D:L464740-464766) whose disc bbox is all zero on the SEAL, so BONE-BOXES gave it a box nothing
 * enters (`entry`), and a level round through the standing trunk between the hips' top and `spinehi`'s bottom met an
 * arm, a hand or nothing -- no BODY record (the v0.4.19 hit-registration review's probe). The fallback: an all-zero box
 * of a BODY bone with a next joint (`spinelo` -> `spinehi`) is replaced by a box in the bone's own frame from its joint
 * to the next one's bind translation, `SPINELO_BAND_PLACEHOLDER` (2.0, v0.4.18's spinelo capsule radius) across, BODY.
 * Every other bone's box is the disc's; a line that misses the band makes the records it made before, to the bit.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');

const T16 = (x: number, y: number, z: number): Float32Array => Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1);
const part = (index: number, name: string, parent: number, bbox: number[], t: [number, number, number] = [0, 0, 0]): SkeletonPart =>
  ({ index, name, parent, bindLocal: T16(...t), bbox: Float32Array.from(bbox), type: 0, flags: 0 }) as SkeletonPart;

describe('SPINELO-FALLBACK: the band box, on the table', () => {
  it('names its stand-in: SPINELO_BAND_PLACEHOLDER, 2.0 (v0.4.18\'s spinelo capsule radius)', () => {
    expect((hv as unknown as Record<string, unknown>).SPINELO_BAND_PLACEHOLDER).toBe(2);
  });

  it('an all-zero BODY bone with a next joint gets its joint-to-joint box, +-2.0 across; every other box is the disc\'s', () => {
    const parts = [
      part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0], [0, 10, 0]), part(1, 'hips', 0, [-2, -1, -2, 2, 1.5, 2]),
      part(2, 'aimnodes', 1, [0, 0, 0, 0, 0, 0]), part(3, 'spinelo', 2, [0, 0, 0, 0, 0, 0], [0, 1, 0]),
      part(4, 'spinehi', 3, [-2, 0.5, -2, 2, 4, 2], [0.25, 1.5, -0.5]), part(5, 'neck', 4, [-1, 0, -1, 1, 1, 1], [0, 4, 0]),
    ];
    const t = boneTable(parts);
    // spinelo: along y (the translation's largest) from its joint to spinehi's, across x and z the segment +-2.0
    expect([...t.box[3]!]).toEqual([0.25 - 2.25, 0, -0.5 - 2, 0.25 + 2, 1.5, 2].map(Math.fround));
    expect(t.part[3]).toBe(PART.BODY);
    expect([...t.box[0]!]).toEqual([0, 0, 0, 0, 0, 0]);                 // skel_root: NO_PART, still empty
    expect([...t.box[2]!]).toEqual([0, 0, 0, 0, 0, 0]);                 // aimnodes: NO_PART, still empty
    expect([...t.box[1]!]).toEqual([-2, -1, -2, 2, 1.5, 2]);
    expect([...t.box[4]!]).toEqual([-2, 0.5, -2, 2, 4, 2]);
    expect([...parts[3]!.bbox]).toEqual([0, 0, 0, 0, 0, 0]);             // the part's own bbox is not written
  });

  it('the cull bounds widen to the band: boxBounds holds its eight corners where every other box lies far inside (the review\'s M4)', () => {
    // spinelo -> spinehi along x (3 u); the only other non-empty box is spinehi's +-0.5 cube at the next joint, so the
    // band's corners (x 0..3, y and z about +-2) lie outside every other box's bounds: a bounds pass that skips the band
    // (M4: `if (b.part === 3 && x[0] === 0) continue;`) leaves them out.
    const parts = [
      part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0]), part(1, 'spinelo', 0, [0, 0, 0, 0, 0, 0]),
      part(2, 'spinehi', 1, [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], [3, 0.2, 0.1]),
    ];
    const t = boneTable(parts);
    const at = (x: number, y: number, z: number): Float32Array => T16(x, y, z);
    const boxes: BoneBox[] = [...t.index].map((bone, n) => ({ part: t.part[n]!, bone, box: t.box[n]!, w: bone === 2 ? at(3, 0.2, 0.1) : at(0, 0, 0) }));
    const band = boxes.find((b) => b.bone === 1)!.box;
    expect([...band]).toEqual([0, -2, -2, 3, 0.2 + 2, 0.1 + 2].map(Math.fround));   // along x 0..3; y, z the segment +-2
    const k = boxBounds(boxes, new Float64Array(6));
    for (let n = 0; n < 8; n++) {
      const p = [n & 1 ? band[3]! : band[0]!, n & 2 ? band[4]! : band[1]!, n & 4 ? band[5]! : band[2]!];
      for (let r = 0; r < 3; r++) {
        expect(p[r]!, `corner ${n} axis ${r} >= the bound`).toBeGreaterThanOrEqual(k[r]!);
        expect(p[r]!, `corner ${n} axis ${r} <= the bound`).toBeLessThanOrEqual(k[3 + r]!);
      }
    }
  });

  it('a BODY bone whose disc box is not empty keeps it; an empty BODY bone with no next joint stays empty', () => {
    const live = boneTable([part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0]), part(1, 'spinelo', 0, [-3, 0, -3, 3, 2, 3]),
      part(2, 'spinehi', 1, [-1, 0, -1, 1, 1, 1], [0, 2, 0])]);
    expect([...live.box[1]!]).toEqual([-3, 0, -3, 3, 2, 3]);
    const alone = boneTable([part(0, 'skel_root', -1, [0, 0, 0, 0, 0, 0]), part(1, 'spinelo', 0, [0, 0, 0, 0, 0, 0])]);
    expect([...alone.box[1]!]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

/** A level line's direction from the yaw `deg` (0: from the front, the body facing -z, the line along +z). */
const dirOf = (deg: number): V3 => { const a = (deg * Math.PI) / 180; return [Math.sin(a), 0, Math.cos(a)]; };
const rightOf = (deg: number): V3 => { const a = (deg * Math.PI) / 180; return [Math.cos(a), 0, -Math.sin(a)]; };
type Rec = [number, number, number];
const records = (o: readonly number[], d: readonly number[], body: HitBody): Rec[] => {
  const out: Rec[] = [];
  rayRecords(o, d, 200, body, (p, t, b) => { out.push([p, t, b]); });
  return out;
};
/** The set as BONE-BOXES left it: the band bone's box all zero again (`entry`: entered by nothing). */
const baseOf = (boxes: readonly BoneBox[], bone: number): BoneBox[] =>
  boxes.map((b) => (b.bone === bone ? { ...b, box: new Float32Array(6) } : b));
const sameRecords = (a: readonly Rec[], b: readonly Rec[]): boolean =>
  a.length === b.length && a.every((r, i) => Object.is(r[0], b[i]![0]) && Object.is(r[1], b[i]![1]) && Object.is(r[2], b[i]![2]));

describe.skipIf(!MP2 || !PACK || !READERC)(`SPINELO-FALLBACK on Frostfire's SEAL${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let sim: SimSkeleton;
  const get = async (): Promise<SimSkeleton> => {
    if (!sim) {
      const loaded = await loadSimSkeleton(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
      if (!loaded) throw new Error('no skeleton');
      sim = loaded;
    }
    return sim;
  };

  it('standing idle: a level line through the band between the spinelo and spinehi joints makes a BODY record (spinelo\'s), front, sides and behind', async () => {
    const s = await get();
    const sk = s.skeleton, lo = sk.indexOf('spinelo'), hiI = sk.indexOf('spinehi');
    const clip = s.idles.stand!;
    writePose(sk, sampleClip(clip, 0, { loop: false }).parts);
    const a = transformPoint(sk.world[lo]!, 0, 0, 0), b = transformPoint(sk.world[hiI]!, 0, 0, 0);
    const posedT = [...sk.local[hiI]!.slice(12, 15)], bindT = [...sk.parts[hiI]!.bindLocal.slice(12, 15)];
    sk.resetToBind();
    const m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    console.log(`SPINELO-FALLBACK stand: spinelo joint ${a.map((x) => x.toFixed(3))}, spinehi joint ${b.map((x) => x.toFixed(3))}; `
      + `spinehi's local translation at the idle ${posedT.map((x) => x.toFixed(4))}, bind ${bindT.map((x) => x.toFixed(4))}; `
      + `the band box ${[...boneTable(sk.parts).box[boneTable(sk.parts).index.indexOf(lo)]!].map((x) => x.toFixed(3))}`);
    const vols = stanceVolumes(s);
    const body = bodyVolumes([0, 0, 0], 0, 'stand', vols), base = placedVolumes([0, 0, 0], 0, baseOf(vols.stand, lo));
    for (const deg of [0, 90, 180, 270]) {
      const d = dirOf(deg), o = [m[0] - d[0] * 60, m[1], m[2] - d[2] * 60];
      const was = records(o, d, base), now = records(o, d, body);
      console.log(`SPINELO-FALLBACK band line from ${deg}: base ${JSON.stringify(was.map((r) => [r[0], +r[1].toFixed(3), sk.parts[r[2]]!.name]))}; `
        + `now ${JSON.stringify(now.map((r) => [r[0], +r[1].toFixed(3), sk.parts[r[2]]!.name]))}`);
      expect(was.some((r) => r[0] === PART.BODY), `base, from ${deg}`).toBe(false);   // the gap the review found
      expect(now.some((r) => r[0] === PART.BODY && r[2] === lo), `now, from ${deg}`).toBe(true);
    }
  }, 120_000);

  it('the review\'s grid (0.1 level lines, the idles): the band\'s share, and every line\'s records but spinelo\'s Object.is the base\'s', async () => {
    const s = await get();
    const vols = stanceVolumes(s);
    const lo = s.skeleton.indexOf('spinelo');
    const sets: [string, readonly BoneBox[]][] = (['stand', 'crouch', 'prone'] as const).map((k) => [k, vols[k]]);
    for (const k of ['stand', 'crouch', 'prone'] as const) {
      if (!vols.lean) break;
      sets.push([`${k} lean l`, vols.lean[k].l], [`${k} lean r`, vols.lean[k].r]);
    }
    for (const [name, boxes] of sets) {
      const step = name.includes('lean') ? 0.25 : 0.1;
      for (const deg of [0, 45, 90, 180, 270]) {
        const body = placedVolumes([0, 0, 0], 0, boxes), base = placedVolumes([0, 0, 0], 0, baseOf(boxes, lo));
        const d = dirOf(deg), right = rightOf(deg);
        let lines = 0, band = 0, bodyNow = 0, bodyWas = 0, outside = 0;
        for (let y = -0.5; y <= 21; y += step) for (let u = -14; u <= 14; u += step) {
          const o = [right[0] * u - d[0] * 60, y, right[2] * u - d[2] * 60];
          const now = records(o, d, body), was = records(o, d, base);
          if (now.length || was.length) lines++;
          const mine = now.some((r) => r[2] === lo);
          if (mine) band++; else outside++;
          if (now.some((r) => r[0] === PART.BODY)) bodyNow++;
          if (was.some((r) => r[0] === PART.BODY)) bodyWas++;
          if (!mine) { if (!sameRecords(now, was)) expect.fail(`${name} from ${deg}: a line off the band at y ${y.toFixed(1)} u ${u.toFixed(1)} changed`); }
          else if (!sameRecords(now.filter((r) => r[2] !== lo), was)) expect.fail(`${name} from ${deg}: the band's line at y ${y.toFixed(1)} u ${u.toFixed(1)} changed another record`);
        }
        console.log(`SPINELO-FALLBACK grid ${name} from ${deg} (step ${step}): ${lines} lines meet the body; ${band} meet the band box; BODY ${bodyWas} -> ${bodyNow} (+${bodyNow - bodyWas}); ${outside} off it unchanged`);
      }
    }
  }, 600_000);

  it('the room\'s and the page\'s paths carry the band: posedBoxes, refreshBoxes and its kept bounds, bodyRecords = rayRecords', async () => {
    const s = await get();
    const sk = s.skeleton, lo = sk.indexOf('spinelo');
    const clip = s.idles.stand!;
    writePose(sk, sampleClip(clip, 0, { loop: false }).parts);
    const posedSet = posedBoxes(sk), owned = ownedBoxes(), refreshed = refreshBoxes(sk, owned);
    sk.resetToBind();
    const band = posedSet.find((b) => b.bone === lo)!;
    expect(band.part).toBe(PART.BODY);
    expect(band.box.some((x) => x !== 0)).toBe(true);
    expect(refreshed.find((b) => b.bone === lo)!.box).toBe(band.box);             // one table box, shared
    // the kept bounds hold every corner of the band box, posed
    const k = owned.bounds;
    expect([...k]).toEqual([...boxBounds(refreshed, new Float64Array(6))]);
    for (let n = 0; n < 8; n++) {
      const x = band.box, w = band.w;
      const p = [n & 1 ? x[3]! : x[0]!, n & 2 ? x[4]! : x[1]!, n & 4 ? x[5]! : x[2]!];
      for (let r = 0; r < 3; r++) {
        const v = p[0]! * w[r]! + p[1]! * w[4 + r]! + p[2]! * w[8 + r]! + w[12 + r]!;
        expect(v).toBeGreaterThanOrEqual(k[r]!);
        expect(v).toBeLessThanOrEqual(k[3 + r]!);
      }
    }
    // the kept bounds, computed apart from `boxBounds`: every non-empty posed box's eight corners, grown by the slack
    // (1e-3); the band's share of them logged (how far it widens the posed SEAL's bounds)
    const ind = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], off = [...ind];
    for (const b of refreshed) {
      const x = b.box, w = b.w;
      if (x.every((v) => v === 0)) continue;
      for (let n = 0; n < 8; n++) {
        const p = [n & 1 ? x[3]! : x[0]!, n & 2 ? x[4]! : x[1]!, n & 4 ? x[5]! : x[2]!];
        for (let r = 0; r < 3; r++) {
          const v = p[0]! * w[r]! + p[1]! * w[4 + r]! + p[2]! * w[8 + r]! + w[12 + r]!;
          ind[r] = Math.min(ind[r]!, v); ind[3 + r] = Math.max(ind[3 + r]!, v);
          if (b.bone !== lo) { off[r] = Math.min(off[r]!, v); off[3 + r] = Math.max(off[3 + r]!, v); }
        }
      }
    }
    console.log(`SPINELO-FALLBACK bounds (stand idle, body frame): with the band ${ind.map((v) => v.toFixed(3))}; without it ${off.map((v) => v.toFixed(3))}`);
    for (let r = 0; r < 6; r++) expect(k[r]!).toBeCloseTo(ind[r]! + (r < 3 ? -1e-3 : 1e-3), 5);
    // the room's hot path gives the same records as the placed body's, the band's among them
    const vols: StanceVolumes = stanceVolumes(s);
    const stand = skeletonVolumes(sk, clip);
    expect(vols.stand).toBe(stand);
    const m = transformPoint(band.w as Float32Array, ...([0, 1, 2].map((i) => (band.box[i]! + band.box[3 + i]!) / 2) as V3));
    for (const deg of [0, 90, 180, 270]) {
      const d = dirOf(deg), o = [m[0] - d[0] * 60 + 5, m[1] + 3, m[2] - d[2] * 60 - 7];
      const feet = [5, 3, -7];
      const a: Rec[] = [], b: Rec[] = [];
      bodyRecords(o, d, 200, feet, 0, 'stand' as Stance, vols, null, 0, (p, t, bone) => { a.push([p, t, bone]); });
      rayRecords(o, d, 200, bodyVolumes(feet, 0, 'stand', vols), (p, t, bone) => { b.push([p, t, bone]); });
      expect(sameRecords(a, b)).toBe(true);
      expect(a.some((r) => r[2] === lo && r[0] === PART.BODY), `from ${deg}`).toBe(true);
    }
  }, 120_000);
});
