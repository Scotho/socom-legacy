import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { actorToWorldDir, isToss, THROW_ANIMS, throwAnim, type Grid, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { groundGrid } from '../src/mover';
import { throwClear } from '../src/throwCommit';
import type { PlaySnapshot } from '../src/walk';

/**
 * LANE-KILL item 1 (B-06), scored against the capture of the original (r0004 under PCSX2, legs B/C/D, PC 3,
 * 2026-11-21), record D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256
 * b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de); summary
 * agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md. The build is CONFIRMED r0004 (SUMMARY.md,
 * Build: the title footer "SOCOM 2 r0004 10:14:38 Nov 3 2004", the disc's CRC 0F6FC6CF); r0004's clearance scores 13/13,
 * r0001's 9/13 (agent-mail pilot/kill/item-1-query-vs-capture.md s0-s1).
 *
 * Each case is a release on Desert Glory (MP6, fixture `RUN/MP6.ZDB`): the feet and the actor matrix's rows 0 and 2 as
 * the original logged them, carried into the port's frame (`actorToWorldPoint`: row 0, the right, is
 * (cos yaw, 0, -sin yaw); row 2, behind, (sin yaw, 0, cos yaw)), and whether the original threw. The aims are REST
 * AIMS LOGGED AT ANOTHER POSE, not at these legs, M67 held (PC 3 logged `actor+0x144c`, r0004; the coordinator's relay,
 * 2026-11-21): standing
 * (-0.000711, 0.280299, -0.959912) and 2 s later (0.000594, 0.228797, -0.973474) -- its sine varies 0.229-0.280, so
 * every standing leg is asked at both; crouched (0.000676, 0.028612, -0.999590); prone (-0.000661, -0.191536,
 * -0.981485). The x term (under 0.001) is dropped: the port's vector is (0, s, -sqrt(1 - s^2)). The power is the first
 * reader's fit's, 0.895 (LATER 247's held power; the capture logs none): at or over 0.6 `GetThrowAnim`'s toss test fails
 * whatever the aim, so each leg's clip is its stance's full throw (asserted below). The verdicts are insensitive across
 * the page's OWN aims at the legs (`throwAimVector` on the page's camera at rest: FAR standing 0.162, D T10 0.195, D T20
 * 0.503, along the wall about -0.066; the review of c5629fb494): each leg's verdict through the page's aim, request and
 * hand-open, is `throwAimCapture.disc.test.ts`'s.
 *
 * Under the r0001 transcription (r0001 `FUN_005499e0`, superseded under OT.R97) four of these went the other way: FAR standing, FAR crouched,
 * D-T10 and NEAR prone.
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP6_ZDB = fixture('RUN/MP6.ZDB');

const POWER = 0.895;
/** The measured aim sines by stance (`actor+0x1450` at rest, M67 held); standing at both of its readings. */
const AIM_SINS: Record<'stand' | 'crouch' | 'prone', readonly number[]> = { stand: [0.228797, 0.280299], crouch: [0.028612], prone: [-0.191536] };
const CLIP: Record<'stand' | 'crouch' | 'prone', string> = { stand: 'standThrow', crouch: 'crouchThrow', prone: 'proneThrow' };

type Stance = 'stand' | 'crouch' | 'prone';
interface Leg { name: string; feet: V3; row0: V3; row2: V3; stance: Stance; thrown: boolean }

/** The port's yaw for the original's actor matrix: row 0 = (cos yaw, 0, -sin yaw). */
const yawOf = (row0: V3): number => (Math.atan2(-row0[2], row0[0]) * 180) / Math.PI;

const FAR: V3 = [1722, 20.004, 1868];
const FAR_STAND: [V3, V3] = [[0.929, 0, 0.37007], [-0.37007, 0, 0.929]];
const FAR_LOW: [V3, V3] = [[0.92512, 0, 0.37967], [-0.37967, 0, 0.92512]];
const NEAR: V3 = [1722, 3.11719, 1838];
const NEAR_ROWS: [V3, V3] = [[0.61462, 0, 0.78883], [-0.78883, 0, 0.61462]];
const D: V3 = [1560.2, 30, 2125];

const LEGS: readonly Leg[] = [
  { name: 'B FAR standing', feet: FAR, row0: FAR_STAND[0], row2: FAR_STAND[1], stance: 'stand', thrown: true },
  { name: 'B FAR crouched', feet: FAR, row0: FAR_LOW[0], row2: FAR_LOW[1], stance: 'crouch', thrown: false },
  { name: 'B FAR prone', feet: FAR, row0: FAR_LOW[0], row2: FAR_LOW[1], stance: 'prone', thrown: true },
  { name: 'B LEFT of FAR standing', feet: [1714.61, 20, 1864.94], row0: [0.92822, 0, 0.37203], row2: [-0.37203, 0, 0.92822], stance: 'stand', thrown: true },
  { name: 'C NEAR standing', feet: NEAR, row0: NEAR_ROWS[0], row2: NEAR_ROWS[1], stance: 'stand', thrown: false },
  { name: 'C NEAR crouched', feet: NEAR, row0: NEAR_ROWS[0], row2: NEAR_ROWS[1], stance: 'crouch', thrown: false },
  { name: 'C NEAR prone', feet: NEAR, row0: NEAR_ROWS[0], row2: NEAR_ROWS[1], stance: 'prone', thrown: false },
  { name: 'C LEFT of NEAR standing', feet: [1717.13, 0, 1831.65], row0: NEAR_ROWS[0], row2: NEAR_ROWS[1], stance: 'stand', thrown: true },
  { name: 'D along-R', feet: D, row0: [0.99993, 0, -0.01193], row2: [0.01193, 0, 0.99993], stance: 'stand', thrown: true },
  { name: 'D along-Rb', feet: D, row0: [0.99992, 0, 0.01299], row2: [-0.01299, 0, 0.99992], stance: 'stand', thrown: true },
  { name: 'D T10', feet: D, row0: [0.98695, 0, 0.161], row2: [-0.161, 0, 0.98695], stance: 'stand', thrown: false },
  { name: 'D T20', feet: D, row0: [0.94467, 0, 0.32804], row2: [-0.32804, 0, 0.94467], stance: 'stand', thrown: false },
  { name: 'D along-L', feet: [1560.2, 30.004, 2060], row0: [-0.99992, 0, -0.01234], row2: [0.01234, 0, -0.99992], stance: 'stand', thrown: true },
];

const snapOf = (leg: Leg): PlaySnapshot => ({
  feet: [...leg.feet], yaw: yawOf(leg.row0), pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: leg.stance === 'crouch',
  stance: leg.stance, landing: null, jumps: 0,
} as unknown as PlaySnapshot);

describe.skipIf(!MP6_ZDB)(`LANE-KILL item 1 (B-06): the throw clearance against the capture of the original (r0004 under PCSX2, legs B/C/D, PC 3, 2026-11-21; record on the hub, kill-item1-20261121T0305Z)${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let hull: Grid | undefined;
  const grid = async (): Promise<Grid> => (hull ??= groundGrid((await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP6.ZDB')).ground!));

  it("the matrix to the port's yaw: row 0 is the actor's right and row 2 its back, as actorToWorldPoint turns them", () => {
    for (const leg of LEGS) {
      const yaw = yawOf(leg.row0);
      const right = actorToWorldDir(yaw, [1, 0, 0]), back = actorToWorldDir(yaw, [0, 0, 1]);
      for (let k = 0; k < 3; k++) {
        expect(right[k], `${leg.name} row 0`).toBeCloseTo(leg.row0[k]!, 4);
        expect(back[k], `${leg.name} row 2`).toBeCloseTo(leg.row2[k]!, 4);
      }
    }
    expect(yawOf(FAR_STAND[0])).toBeCloseTo(-21.72, 2);              // FAR standing: 338.28 in the first reader's table
  });

  it("each leg's clip at power 0.895 and its measured aim is its stance's full throw, never the toss", () => {
    for (const st of ['stand', 'crouch', 'prone'] as const) for (const s of AIM_SINS[st]) {
      expect(isToss(POWER, s), `${st} ${s}`).toBe(false);
      expect(throwAnim(POWER, s, st), `${st} ${s}`).toBe(THROW_ANIMS[CLIP[st] as keyof typeof THROW_ANIMS]);
    }
  });

  for (const leg of LEGS) {
    for (const s of AIM_SINS[leg.stance]) {
      it(`${leg.name}, aim sine ${s}: the original ${leg.thrown ? 'threw' : 'refused'}`, async () => {
        const g = await grid();
        expect(throwClear(g, snapOf(leg), POWER, s)).toBe(leg.thrown);
      }, 60_000);
    }
  }
});
