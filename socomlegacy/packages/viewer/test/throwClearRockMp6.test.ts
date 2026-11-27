import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { polygonNormal, segmentHits, SURFACE_SIDE, SURFACE_SKIP, surfaceWord, type Grid, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { groundGrid } from '../src/mover';
import { throwClear, throwClearanceSegment } from '../src/throwCommit';
import type { PlaySnapshot } from '../src/walk';

/**
 * LANE-KILL item 1 (B-06; -KiLL-FAN CLUB's video of 2026-11-20, caption 3: "unable to start grenade animation due to
 * proximity of wall"): on Desert Glory, standing in a sunken path with a rock face (MP6's hull node `g66`) on the right,
 * the release is refused -- no throw clip, nothing spent -- and a step to the left it throws.
 *
 * MEASURED: the item was measured against the original (the capture of the original, r0004 under PCSX2, legs B and C,
 * PC 3, 2026-11-21; record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip, sha256
 * b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de; summary
 * agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md; the build r0004 confirmed (SUMMARY.md,
 * Build: the title footer "SOCOM 2 r0004 10:14:38 Nov 3 2004", the disc's CRC 0F6FC6CF)). These expectations are the capture's, at its logged feet and actor matrices (the full table, with leg D:
 * `throwClearCapture.disc.test.ts`). They were the port's own answers under the r0001 transcription (`FUN_005499e0`)
 * at the lane's scanned poses until the capture ruled: the far pose standing then refused and crouched/prone cleared;
 * the original throws standing there, refuses crouched, throws prone, and refuses all three at the near pose. The port
 * answers them since it asks r0004's clearance (`0x54e6f0`; OT.R97; research 256 s5, "the r0004 clearance"). The aim
 * is the rest aim, sine 0 (`actor+0x144c` (0, 0, -1) at rest, r0004 0x559524-0x55952c).
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP6_ZDB = fixture('RUN/MP6.ZDB');

const POWER = 0.895;                                             // LATER 247's held power after a 600 ms hold
const REST_AIM_SIN = 0;

/** The port's yaw for the original's actor matrix row 0 (the right): (cos yaw, 0, -sin yaw). */
const yawOf = (row0x: number, row0z: number): number => (Math.atan2(-row0z, row0x) * 180) / Math.PI;

/** The capture's poses: the feet and row 0 as logged (legs B and C). */
const POSES = {
  farStand: { feet: [1722, 20.004, 1868] as V3, yaw: yawOf(0.929, 0.37007) },
  farLow: { feet: [1722, 20.004, 1868] as V3, yaw: yawOf(0.92512, 0.37967) },
  farLeft: { feet: [1714.61, 20, 1864.94] as V3, yaw: yawOf(0.92822, 0.37203) },
  near: { feet: [1722, 3.11719, 1838] as V3, yaw: yawOf(0.61462, 0.78883) },
  nearLeft: { feet: [1717.13, 0, 1831.65] as V3, yaw: yawOf(0.61462, 0.78883) },
} as const;

const movement = (p: Parameters<typeof surfaceWord>[0]): boolean => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE;

const snap = (feet: V3, yaw: number, stance: 'stand' | 'crouch' | 'prone'): PlaySnapshot => ({
  feet: [...feet], yaw, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: stance === 'crouch', stance,
  landing: null, jumps: 0,
} as unknown as PlaySnapshot);

/** Every face the clearance ray meets, front entries and back, with its owner and its side (a diagnostic print). */
function faces(g: Grid, s: PlaySnapshot) {
  const seg = throwClearanceSegment(s, POWER, REST_AIM_SIN);
  return segmentHits(g, seg.from, seg.to, movement).map((h) => {
    const n = polygonNormal(h.poly.points)!;
    const p0 = [h.poly.points[0]!, h.poly.points[1]!, h.poly.points[2]!];
    const side = (q: readonly number[]) => n[0] * (q[0]! - p0[0]!) + n[1] * (q[1]! - p0[1]!) + n[2] * (q[2]! - p0[2]!);
    return { owner: h.owner.path, t: h.t, front: side(seg.from) > 0 && side(seg.to) < 0 };
  });
}

describe.skipIf(!MP6_ZDB)(`LANE-KILL item 1 (B-06): on Desert Glory, at the capture's poses, the clearance answers as the original did${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let hull: Grid | undefined;
  const grid = async (): Promise<Grid> => (hull ??= groundGrid((await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP6.ZDB')).ground!));

  it('the far pose: standing THROWN (the ray passes over the wall g66), crouched REFUSED (it enters g66 from its front), prone thrown', async () => {
    const g = await grid();
    const stand = snap(POSES.farStand.feet, POSES.farStand.yaw, 'stand');
    console.log('far pose, standing: faces met', JSON.stringify(faces(g, stand)));
    expect(throwClear(g, stand, POWER, REST_AIM_SIN)).toBe(true);
    const crouch = snap(POSES.farLow.feet, POSES.farLow.yaw, 'crouch');
    const met = faces(g, crouch);
    console.log('far pose, crouched: faces met', JSON.stringify(met));
    expect(met[0]).toMatchObject({ owner: 'worldmodel/g66', front: true });
    expect(throwClear(g, crouch, POWER, REST_AIM_SIN)).toBe(false);
    expect(throwClear(g, snap(POSES.farLow.feet, POSES.farLow.yaw, 'prone'), POWER, REST_AIM_SIN)).toBe(true);
  }, 60_000);

  it('the near pose: standing, crouched and prone all REFUSED, g66 entered from its front', async () => {
    const g = await grid();
    const { feet, yaw } = POSES.near;
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const s = snap(feet, yaw, stance);
      const met = faces(g, s);
      console.log(`near pose, ${stance}: faces met`, JSON.stringify(met));
      expect(met[0], stance).toMatchObject({ owner: 'worldmodel/g66', front: true });
      expect(throwClear(g, s, POWER, REST_AIM_SIN), stance).toBe(false);
    }
  }, 60_000);

  it('a step to the left of either pose: standing THROWN', async () => {
    const g = await grid();
    for (const [name, { feet, yaw }] of [['far', POSES.farLeft], ['near', POSES.nearLeft]] as const) {
      expect(throwClear(g, snap(feet, yaw, 'stand'), POWER, REST_AIM_SIN), name).toBe(true);
    }
  }, 60_000);
});
