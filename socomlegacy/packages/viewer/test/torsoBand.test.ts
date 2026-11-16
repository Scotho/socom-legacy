import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { sampleClip, transformPoint, type MotionClip, type Skeleton } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { writePose } from '../src/animator';
import { PART } from '../src/net/damage';
import { torsoPoint } from '../src/net/botAim';
import { DAMAGE_BONES, stanceVolumes, type BoneBox, type V3 } from '../src/net/hitVolumes';
import { loadSimSkeletons, type SimSkeleton } from '../src/simMap';

/**
 * SCUBA-BAND (`BOT_AIM_ADAPTATION`, a browser adaptation: where a bot points, nothing the game does): MP2's scuba SEALs
 * carry an all-zero `spinelo` box (on disc, and in the original running: shadow's live node read, 2026-11-11; research
 * 398), so the mean of the BODY bones' middles -- the bots' torso point -- fell in the band between `hips`' top and
 * `spinehi`'s bottom that no trunk box covers. The torso point is held inside a BODY box there; on every other model of
 * the fixture's maps it does not move by a bit from the mean the port took before (the base, 558e6d47f, re-made below).
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MAPS = ['MP2', 'MP6', 'MP71', 'MP72'].filter((m) => fixture(`RUN/${m}.ZDB`));
const HAVE = MAPS.includes('MP2') && !!fixture('RUN/MOTION_P.ZAR') && !!fixture('RUN/READERC.ZAR');
const STANCES = ['stand', 'crouch', 'prone'] as const;

/** The base's `aimMiddle` (558e6d47f, `hitVolumes.ts`), re-made here as the pin's reference. */
function baseAimMiddle(bbox: Float32Array, axis: V3 | null): V3 {
  const ext = [0, 1, 2].map((i) => bbox[3 + i]! - bbox[i]!), mid = [0, 1, 2].map((i) => (bbox[3 + i]! + bbox[i]!) / 2);
  const along = (v: readonly number[]): number => v.reduce((k, x, i) => (Math.abs(x) > Math.abs(v[k]!) ? i : k), 0);
  const k = axis ? along(axis) : along(ext);
  const r = Math.max(...ext.map((e, i) => (i === k ? 0 : e / 2)));
  if (!axis) return [mid[0]!, mid[1]!, mid[2]!];
  const o: V3 = [mid[0]!, mid[1]!, mid[2]!];
  o[k] = 0;
  let t0 = 0, t1 = 1;
  const ak = axis[k]!;
  if (ext[k]! > 0 && Math.abs(ak) > 1e-9) {
    let lo = (bbox[k]! + r) / ak, hi = (bbox[3 + k]! - r) / ak;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(0, lo);
    t1 = Math.min(1, hi);
    if (t0 > t1) t0 = t1 = Math.min(1, Math.max(0, mid[k]! / ak));
  }
  const t = (t0 + t1) / 2;
  return [o[0] + axis[0] * t, o[1] + axis[1] * t, o[2] + axis[2] * t];
}

/** The base's `torsoOf` at a posture's idle key 0 (as `stanceVolumes` posed it): the mean of every BODY bone's middle. */
function baseTorso(sk: Skeleton, clip: MotionClip | null): V3 {
  if (clip) writePose(sk, sampleClip(clip, 0 / clip.rate, { loop: false }).parts);
  else sk.resetToBind();
  try {
    let x = 0, y = 0, z = 0, n = 0;
    for (const d of DAMAGE_BONES) {
      if (d.part !== PART.BODY) continue;
      const i = sk.indexOf(d.bone);
      if (i < 0) continue;
      const to = d.to ? sk.indexOf(d.to) : -1;
      const t = to >= 0 ? sk.local[to]! : null;
      const m = baseAimMiddle(sk.parts[i]!.bbox, t ? [t[12]!, t[13]!, t[14]!] : null);
      const p = transformPoint(sk.world[i]!, ...m);
      x += p[0]; y += p[1]; z += p[2]; n++;
    }
    return [x / n, y / n, z / n];
  } finally { sk.resetToBind(); }
}

/** The BODY box (its bone's name) whose posed volume holds the body-frame point `p`, faces included; null: none. */
function bodyBoxHolding(b: SimSkeleton, boxes: readonly BoneBox[], p: V3): string | null {
  for (const bx of boxes) {
    if (bx.part !== PART.BODY) continue;
    const w = bx.w, box = bx.box;
    // p = L q + t: solve the 3x3 by Cramer's rule
    const c0 = [w[0]!, w[1]!, w[2]!], c1 = [w[4]!, w[5]!, w[6]!], c2 = [w[8]!, w[9]!, w[10]!];
    const r = [p[0] - w[12]!, p[1] - w[13]!, p[2] - w[14]!];
    const det3 = (a: number[], bb: number[], c: number[]): number =>
      a[0]! * (bb[1]! * c[2]! - bb[2]! * c[1]!) - bb[0]! * (a[1]! * c[2]! - a[2]! * c[1]!) + c[0]! * (a[1]! * bb[2]! - a[2]! * bb[1]!);
    const det = det3(c0, c1, c2);
    if (det === 0) continue;
    const q = [det3(r, c1, c2) / det, det3(c0, r, c2) / det, det3(c0, c1, r) / det];
    const eps = 1e-4;
    if ([0, 1, 2].every((k) => q[k]! >= box[k]! - eps && q[k]! <= box[3 + k]! + eps)) return b.skeleton.parts[bx.bone]!.name;
  }
  return null;
}

const empty = (b: Float32Array): boolean => b[0] === b[3] && b[1] === b[4] && b[2] === b[5];

describe.skipIf(!HAVE)(`SCUBA-BAND: the bots' torso point and the scuba SEAL's empty spinelo${HAVE ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const models = (async () => {
    const out: { map: string; side: string; b: SimSkeleton }[] = [];
    for (const map of MAPS) {
      const sk = await loadSimSkeletons(new FsAssetSource(FIXTURES), `RUN/${map}.ZDB`);
      for (const side of ['seal', 'terrorist'] as const) for (const b of sk[side]) if (b) out.push({ map, side, b });
    }
    return out;
  })();

  it('MP2 seal_A_scuba: its spinelo box is empty, and its standing torso point lies inside a BODY box', async () => {
    const a = (await models).find((m) => m.map === 'MP2' && m.b.model === 'seal_A_scuba')!;
    expect(a).toBeDefined();
    expect(empty(a.b.skeleton.part('spinelo').bbox)).toBe(true);
    const vols = stanceVolumes(a.b);
    const tp = torsoPoint({ feet: [0, 0, 0], yaw: 0, posture: 'stand' }, vols);
    expect(bodyBoxHolding(a.b, vols.stand, tp)).not.toBeNull();
  });

  it("every MP2 scuba SEAL's torso point lies inside a BODY box, at each posture", async () => {
    const scuba = (await models).filter((m) => m.map === 'MP2' && /_scuba$/.test(m.b.model));
    expect(scuba.map((m) => m.b.model).sort()).toEqual(['seal_A_scuba', 'seal_C_scuba', 'seal_D_scuba', 'seal_E_scuba']);
    for (const m of scuba) {
      const vols = stanceVolumes(m.b);
      for (const s of STANCES) {
        const at = vols.torso![s];
        expect(bodyBoxHolding(m.b, vols[s], at), `${m.b.model} ${s} [${at.join(', ')}]`).not.toBeNull();
      }
    }
  });

  // The review's finding 1: WHICH box the fallback picks (the nearest BODY box to the mean, `torsoOf`), not only that
  // some BODY box holds the point -- standing, seal_A/E/D_scuba land in spinehi (y 14.932) and seal_C_scuba in hips.
  it("the fallback's box: MP2 scuba A/E/D standing in spinehi, C standing in hips", async () => {
    const scuba = (await models).filter((m) => m.map === 'MP2' && /_scuba$/.test(m.b.model));
    for (const m of scuba) {
      const vols = stanceVolumes(m.b);
      const box = bodyBoxHolding(m.b, vols.stand, vols.torso!.stand);
      const want = m.b.model === 'seal_C_scuba' ? 'hips' : 'spinehi';
      expect(box, `${m.b.model} stand`).toBe(want);
    }
  });

  // MP71's and MP72's alg_officer carries an empty spinelo too, but its mean lies in its hips box: it stays in the pin.
  it('PIN: on every other model of the fixture maps the torso point is the base\'s mean, bit for bit', async () => {
    const rest = (await models).filter((m) => !(m.map === 'MP2' && /_scuba$/.test(m.b.model)));
    const names = new Set(rest.map((m) => `${m.map} ${m.b.model}`));
    for (const want of ['MP2 al_gman01', 'MP2 al_gman02', 'MP2 al_leader', 'MP2 al_captain']) expect(names.has(want), want).toBe(true);
    expect(rest.filter((m) => m.map === 'MP6').length).toBeGreaterThanOrEqual(8);
    for (const m of rest) {
      const vols = stanceVolumes(m.b);
      for (const s of STANCES) {
        const now = vols.torso![s], base = baseTorso(m.b.skeleton, m.b.idles[s]);
        for (let k = 0; k < 3; k++) expect(Object.is(now[k], base[k]), `${m.map} ${m.side} ${m.b.model} ${s}[${k}] ${now[k]} vs ${base[k]}`).toBe(true);
      }
    }
  });
});
