import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { maxThrowDistance, throwAnim, throwVelocity, type Grid, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GrenadeThrower, type GrenadeSource } from '../src/grenade';
import { loadMap } from '../src/loadMap';
import { groundGrid, moverSnapshot, probeLiftOf, rootY, Walker } from '../src/mover';
import { INIT_AIM_PITCH, PlayerCamera, viewFar } from '../src/playerCamera';
import * as throwAimModule from '../src/throwAim';
import {
  bodyThrowAim, THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER, THROW_AIM_ORIGIN_LATCH_READING,
  throwAimKept, throwAimOrigin, throwAimReach, throwAimVector,
} from '../src/throwAim';
import { releaseAimSin, throwClearanceSegment } from '../src/throwCommit';
import type { PlaySnapshot } from '../src/walk';

/**
 * LANE-KILL B-06 (research 256 s5.3): the body's throw aim (`./throwAim`, r0004 `0x5e6690`; reading of r0004, two
 * readers, pending review) against two captures of the original, on Desert Glory (MP6, fixture `RUN/MP6.ZDB`), through
 * the page's own camera (`PlayerCamera` settled at the pose and look, its eye ray `viewFar` as `WalkMode.fireAim` places
 * it) and the page's thrower (`GrenadeThrower`):
 *
 * - PC 3 (r0004 under PCSX2, 2026-11-21 03:05-05:10Z), record
 *   D:/s2u-captures/kill-item1-20261121T0305Z/kill-item1-20261121T0305Z.zip (sha256
 *   b65866b086c6451ff4093d6f91d8defab9e34070ab72a13c933aa1cfbafeb3de); summary
 *   agent-mail/evidence/weekend-mega-2026-11-14/rig/kill-item1-PC3/SUMMARY.md. Every kit refill after 03:29Z selected
 *   the M67 CROUCHED (`run.log`'s "REFILL done ... 1 18" lines: posture 1) and stood up after; legs B FAR standing and the
 *   calibration before it ran on the spawn's select, its posture not logged.
 * - PC 2 (r0004 under PCSX2 2.8.2, KILL-AIMORIGIN, 2026-11-21, 12 throws), record
 *   D:/s2u-records/KILL-AIMORIGIN-PC2/KILL-AIMORIGIN-PC2.zip (sha256
 *   91ec939a4637dc481c898b76511270f59c606508aa2bba185db26d187ae0947b); summary
 *   agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-AIMORIGIN-PC2/RESULTS.md. The M67 selected STANDING
 *   (`tools/aim.mjs`), `actor+0x14a4` 13.092-13.128 and constant through each throw.
 * - PC 2 (r0004 under PCSX2 2.8.2, KILL-LATCH, 2026-11-21, selects made crouched, prone and standing, each stood
 *   before the throw), record D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip (sha256
 *   5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0); summary
 *   agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-LATCH-PC2/RESULTS.md. `+0x14a4` kept bit for bit from the
 *   select through the stand, the request and the hand-open (s1); prone 1.356 (3/3); a standing select at 20 u at the
 *   default look refused 3/3 with no throw clip (s2).
 *
 * The aim's origin O is the feet raised by H, the latched height (`THROW_AIM_ORIGIN_LATCH_READING`): the same H at
 * rest, at the release request and at the hand-open, set by the posture at the M67's select (agent-mail
 * pilot/kill/item-1-aim-origin-reconcile.md s0-s4; the mechanism, r0004 `0x5e7100`'s no-write path, a reading pending
 * review).
 */

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP6_ZDB = fixture('RUN/MP6.ZDB');

type Stance = 'stand' | 'crouch' | 'prone';

/** The port's yaw for the original's actor matrix: row 0 = (cos yaw, 0, -sin yaw). */
const yawOf = (row0: readonly number[]): number => (Math.atan2(-row0[2]!, row0[0]!) * 180) / Math.PI;

/**
 * PC 3's standing rest poses, the M67 selected crouched: the logged `+0x1450` range (`aimrest.csv`: wall-1025-arrive and
 * -r2, open-1537 and -r2, canyon-900; `press.csv` T3b-d2000b and -c for 20 u, whose latch is the 8.76 one by the
 * reconcile's s1.3). The page's sine must fall within `SINE_TOL` of the range: the page's T against the logged T
 * (10.25 u: 50.04 against 50.004-50.036; x 1537: 47.01 against 47.014; the open: -24.49 against -24.542), the
 * reconcile's s6.3 tolerance.
 */
const POSES: readonly { name: string; feet: V3; yaw: number; lo: number; hi: number }[] = [
  { name: '10.25 u from wc1di2', feet: [1555.75, 30, 2090], yaw: 270, lo: 0.738942, hi: 0.739879 },
  { name: '20 u from wc1di2', feet: [1546, 30, 2090], yaw: 270, lo: 0.4357, hi: 0.4362 },
  { name: 'x 1537', feet: [1537, 30.004, 2092], yaw: 270, lo: 0.272057, hi: 0.273535 },
  { name: 'the open', feet: [900, -29.996, 1898.6], yaw: 270, lo: -0.033212, hi: -0.032527 },
];
const SINE_TOL = 0.005;
/**
 * PC 3's other crouched latch, about 8.27 -- the capture's own height, not a port value: one of the three steady crouch
 * idle heights (KILL-LATCH s1: 6.89, 8.28, 8.78; agent-mail pilot/kill/item-1-latch-timing.md s3), which the port's one
 * crouch constant does not model (`THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER`, (b)). T3b-d1025's five releases
 * (0.7531-0.7539) and T3b-d2000d (0.4529) and T3b-d2000 (0.4535) at 20 u (`press.csv`; the reconcile's s1.3).
 */
const PC3_OTHER_CROUCH_IDLE_H = 8.27;
const OTHER_IDLE_POSES: readonly { name: string; feet: V3; lo: number; hi: number }[] = [
  { name: '10.25 u from wc1di2 (T3b-d1025)', feet: [1555.75, 30, 2090], lo: 0.7531, hi: 0.7539 },
  { name: '20 u from wc1di2 (T3b-d2000, -d2000d)', feet: [1546, 30, 2090], lo: 0.4529, hi: 0.4535 },
];

const FAR: V3 = [1722, 20.004, 1868], NEAR: V3 = [1722, 3.11719, 1838];
/**
 * PC 3's legs, each with the posture its M67 was selected at: crouched after every refill from 03:29Z; B FAR standing
 * (03:25Z) on the spawn's select, not logged -- asked at both latches.
 */
const VERDICTS: readonly { name: string; feet: V3; yaw: number; stance: Stance; latch: readonly Stance[]; thrown: boolean }[] = [
  { name: 'B FAR standing', feet: FAR, yaw: yawOf([0.929, 0, 0.37007]), stance: 'stand', latch: ['crouch', 'stand'], thrown: true },
  { name: 'B FAR crouched', feet: FAR, yaw: yawOf([0.92512, 0, 0.37967]), stance: 'crouch', latch: ['crouch'], thrown: false },
  { name: 'B FAR prone', feet: FAR, yaw: yawOf([0.92512, 0, 0.37967]), stance: 'prone', latch: ['crouch'], thrown: true },
  { name: 'C NEAR standing', feet: NEAR, yaw: yawOf([0.61462, 0, 0.78883]), stance: 'stand', latch: ['crouch'], thrown: false },
  { name: 'C NEAR crouched', feet: NEAR, yaw: yawOf([0.61462, 0, 0.78883]), stance: 'crouch', latch: ['crouch'], thrown: false },
  { name: 'C NEAR prone', feet: NEAR, yaw: yawOf([0.61462, 0, 0.78883]), stance: 'prone', latch: ['crouch'], thrown: false },
  // The seven legs the review of c5629fb494 found missing here (rows as `throwClearCapture.disc.test.ts`'s).
  { name: 'B LEFT of FAR standing', feet: [1714.61, 20, 1864.94], yaw: yawOf([0.92822, 0, 0.37203]), stance: 'stand', latch: ['crouch'], thrown: true },
  { name: 'C LEFT of NEAR standing', feet: [1717.13, 0, 1831.65], yaw: yawOf([0.61462, 0, 0.78883]), stance: 'stand', latch: ['crouch'], thrown: true },
  { name: 'D along-R', feet: [1560.2, 30, 2125], yaw: yawOf([0.99993, 0, -0.01193]), stance: 'stand', latch: ['crouch'], thrown: true },
  { name: 'D along-Rb', feet: [1560.2, 30, 2125], yaw: yawOf([0.99992, 0, 0.01299]), stance: 'stand', latch: ['crouch'], thrown: true },
  { name: 'D T10', feet: [1560.2, 30, 2125], yaw: yawOf([0.98695, 0, 0.161]), stance: 'stand', latch: ['crouch'], thrown: false },
  { name: 'D T20', feet: [1560.2, 30, 2125], yaw: yawOf([0.94467, 0, 0.32804]), stance: 'stand', latch: ['crouch'], thrown: false },
  { name: 'D along-L', feet: [1560.2, 30.004, 2060], yaw: yawOf([-0.99992, 0, -0.01234]), stance: 'stand', latch: ['crouch'], thrown: true },
  { name: '10.25 u from wc1di2', feet: [1555.75, 30, 2090], yaw: 270, stance: 'stand', latch: ['crouch'], thrown: false },
  { name: '20 u from wc1di2', feet: [1546, 30, 2090], yaw: 270, stance: 'stand', latch: ['crouch'], thrown: true },
];

/** The M67's range (`ThrowableRecord.maximumRange`): the ray's length past the 600 floor. */
const M67_RANGE = 100000;

const snapOf = (feet: V3, yaw: number, stance: Stance, pitch = INIT_AIM_PITCH): PlaySnapshot => ({
  feet: [...feet], yaw, pitch, vx: 0, vz: 0, vy: 0, airborne: false, crouched: stance === 'crouch', stance,
  landing: null, jumps: 0,
} as unknown as PlaySnapshot);

describe.skipIf(!MP6_ZDB)(`LANE-KILL B-06: the throw aim against the captures of the original (r0004; PC 3 kill-item1-20261121T0305Z, PC 2 KILL-AIMORIGIN)${MP6_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let loaded: { grid: Grid; material: string } | undefined;
  const map = async () => {
    if (loaded) return loaded;
    const m = await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP6.ZDB');
    return (loaded = { grid: groundGrid(m.ground!), material: m.grenade?.defaultMaterial ?? '' });
  };
  /** The page's camera ray: `PlayerCamera` settled at the feet, the yaw and the look pitch (`init_aim_pitch` by default). */
  const rayAt = (grid: Grid, feet: V3, yaw: number, stance: Stance, pitch = INIT_AIM_PITCH): { eye: V3; far: V3 } => {
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 120; i++) cam.tick(feet, yaw, pitch, rootY(stance));
    cam.settle();
    const v = cam.view(1);
    return { eye: [...v.aim.eye] as V3, far: [...viewFar(v.aim.eye, v.aim.target, v.far)] as V3 };
  };
  const aimAt = async (feet: V3, yaw: number, stance: Stance, latch: Stance, pitch = INIT_AIM_PITCH) => {
    const { grid, material } = await map();
    const r = rayAt(grid, feet, yaw, stance, pitch);
    return throwAimVector(grid, { ...r, reach: throwAimReach(M67_RANGE), kept: throwAimKept(material) }, { feet, yaw, stance, latch });
  };

  it("the page's T at the logged poses is the capture's T", async () => {
    close((await aimAt(POSES[0]!.feet, 270, 'stand', 'crouch')).point, [1566, 50.0, 2090], 0.1);
    close((await aimAt(POSES[2]!.feet, 270, 'stand', 'crouch')).point, [1566, 47.0, 2092], 0.1);
    close((await aimAt(POSES[3]!.feet, 270, 'stand', 'crouch')).point, [1000.1, -24.5, 1898.6], 0.2);
  }, 60_000);

  it('the latch: ahead 0, stand 13.11, crouch 8.76 and prone 1.356 (KILL-LATCH s1, 3/3) by the select; the pose model named, the stale value retired into it', () => {
    expect(THROW_AIM_ORIGIN_LATCH_READING.stand).toEqual({ up: 13.11, ahead: 0 });
    expect(THROW_AIM_ORIGIN_LATCH_READING.crouch).toEqual({ up: 8.76, ahead: 0 });
    expect(THROW_AIM_ORIGIN_LATCH_READING.prone).toEqual({ up: 1.356, ahead: 0 });
    expect(THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER).toBe('the stance constant at the select');
    expect('THROW_AIM_ORIGIN_LATCH_STALE_PLACEHOLDER' in throwAimModule, 'retired into THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER').toBe(false);
    expect(throwAimOrigin('stand')).toBe(THROW_AIM_ORIGIN_LATCH_READING.stand);
    expect(throwAimOrigin('crouch')).toBe(THROW_AIM_ORIGIN_LATCH_READING.crouch);
    expect(throwAimOrigin('prone')).toBe(THROW_AIM_ORIGIN_LATCH_READING.prone);
  });

  for (const p of POSES) {
    it(`PC 3 at ${p.name}, standing, the M67 selected crouched: the page's rest sine is the logged one (${p.lo}..${p.hi})`, async () => {
      const crouched = (await aimAt(p.feet, p.yaw, 'stand', 'crouch')).aim[1];
      const standing = (await aimAt(p.feet, p.yaw, 'stand', 'stand')).aim[1];
      console.log(`PC 3 ${p.name}: crouch latch s ${crouched.toFixed(4)}, stand latch s ${standing.toFixed(4)} (logged ${p.lo}..${p.hi})`);
      expect(crouched, p.name).toBeGreaterThanOrEqual(p.lo - SINE_TOL);
      expect(crouched, p.name).toBeLessThanOrEqual(p.hi + SINE_TOL);
    }, 60_000);
  }

  for (const p of OTHER_IDLE_POSES) {
    it(`PC 3's other crouched latch at ${p.name}: the capture's 8.27 idle height gives the logged ${p.lo}..${p.hi} (THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER (b))`, async () => {
      const { grid, material } = await map();
      const { point } = throwAimVector(grid, { ...rayAt(grid, p.feet, 270, 'stand'), reach: throwAimReach(M67_RANGE), kept: throwAimKept(material) }, { feet: p.feet, yaw: 270, stance: 'stand' });
      const h = PC3_OTHER_CROUCH_IDLE_H, d = Math.hypot(point[0] - p.feet[0], point[2] - p.feet[2]), ty = point[1] - p.feet[1];
      const s = (ty - h) / Math.hypot(ty - h, d);
      expect(s, p.name).toBeGreaterThanOrEqual(p.lo - SINE_TOL);
      expect(s, p.name).toBeLessThanOrEqual(p.hi + SINE_TOL);
    }, 60_000);
  }

  /**
   * A held throw let go through the page's thrower on MP6 with the page's ray: the M67 selected at `latch`, then the body
   * put in `stance` before the press; whether its clip was pushed and it flew.
   */
  const pageThrow = async (feet: V3, yaw: number, stance: Stance, o: { latch?: Stance; withRay?: boolean; pitch?: number; hold?: number } = {}) => {
    const { grid, material } = await map();
    const pitch = o.pitch ?? INIT_AIM_PITCH;
    const ray = rayAt(grid, feet, yaw, stance, pitch);
    let now = o.latch ?? stance;
    const source: GrenadeSource = {
      grid: () => grid, snapshot: () => snapOf(feet, yaw, now, pitch), view: () => 'third', ...(o.withRay ?? true ? { aim: () => ray } : {}),
    };
    const g = new GrenadeThrower(source);
    g.setEnvironment(material);
    const starts: string[] = [];
    g.on('throwStart', (e) => starts.push(e.anim.clip));
    g.select('M67');
    now = stance;                                                // the stance changed after the select
    g.pull();
    for (let i = 0; i < (o.hold ?? 43); i++) g.update(1 / 60);   // about LATER 247's 0.895
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    return { started: starts.length > 0, last: g.stats().lastThrow, refusal: g.diag().lastRefusal?.reason ?? null };
  };

  for (const v of VERDICTS) {
    for (const latch of v.latch) {
      it(`${v.name}, the M67 selected ${latch === 'crouch' ? 'crouched' : 'standing'}: the page ${v.thrown ? 'THROWS' : 'REFUSES'}, as the original`, async () => {
        const r = await pageThrow(v.feet, v.yaw, v.stance, { latch });
        const aim = await aimAt(v.feet, v.yaw, v.stance, latch);
        console.log(`${v.name} (${latch} latch): aim ${aim.aim.map((x) => x.toFixed(4)).join(', ')}, started ${r.started}, flew ${r.last !== null}, refusal ${r.refusal}`);
        expect(r.started, 'the release request').toBe(v.thrown);
        if (v.thrown) expect(r.last, 'the hand-open').not.toBeNull();
        else expect(r.refusal).toBe('clear');
      }, 60_000);
    }
  }

  it("in the open the launch at rest is today's: both aims' elevations clamp to 0", async () => {
    const p = POSES[3]!;
    const now = await pageThrow(p.feet, p.yaw, 'stand', { latch: 'crouch' }), before = await pageThrow(p.feet, p.yaw, 'stand', { latch: 'crouch', withRay: false });
    expect((await aimAt(p.feet, p.yaw, 'stand', 'crouch')).aim[1]).toBeLessThan(0);
    expect(Math.sin((INIT_AIM_PITCH * Math.PI) / 180)).toBeLessThan(0);
    expect(now.last).not.toBeNull();
    expect(now.last!.velocity).toEqual(before.last!.velocity);
    expect(now.last!.pitchDeg).toBe(before.last!.pitchDeg);
  }, 60_000);

  /**
   * PC 2's launches (KILL-AIMORIGIN, RESULTS.md finding 5): a standing full throw, the M67 selected standing, R1 held
   * 1500 ms (power 0.9887-0.9898 at the hand-open); the launch elevation atan2(vy, hypot(vx, vz)) of the round's velocity
   * (pool +0x60): wall20 33.34-33.42, wall25 29.21-29.29, wall30 26.39-26.47, the canyon 14.45-14.50 at the level look
   * (-0.58..-0.69); |v| 237.94-238.19 (the reconcile's s6.4). The canyon at `init_aim_pitch`: 11.98, the aim's elevation
   * clamped to 0 plus the power term (GRENADES-A, PC 2, agent-mail/evidence/weekend-mega-2026-11-14/rig/GRENADES-A-PC2/
   * RESULTS.md "B-94: range"). Each is the page's own launch: the thrower (`pageThrow`) with the M67 selected standing,
   * the page's `PlayerCamera` ray at the pose and look, R1 held 90 updates (1.5 s, the capture's 1500 ms), its
   * `lastThrow` -- the velocity the page's hand-open gave the round -- scored, not a launch composed in the test.
   *
   * Tolerance: the elevation within 1 degree of the capture's range; the speed within 1 u/s of 238. The residual is the
   * original's T dropping between the release request and the hand-open (0.27-0.33 u; the aim about 0.5-0.8 degree lower
   * at the hand-open at the walls, 0.08 in the canyon; KILL-AIMORIGIN RESULTS point 4), which the page's camera does not follow (its ray
   * is the settled rest pose's); research 256 s7 lists it ("the hand-open aim's drift not modelled"). The level look was
   * reached only to -0.58..-0.69 and the test drives -0.6.
   */
  const LEVEL_LOOK = -0.6;
  const LAUNCHES: readonly { name: string; feet: V3; pitch: number; lo: number; hi: number }[] = [
    { name: 'the open canyon, level look', feet: [900, -30, 1898.6], pitch: LEVEL_LOOK, lo: 14.45, hi: 14.50 },
    { name: 'the open canyon, default look', feet: [900, -30, 1898.6], pitch: INIT_AIM_PITCH, lo: 11.98, hi: 11.98 },
    { name: '20 u from wc1di2, level look', feet: [1546, 30, 2090], pitch: LEVEL_LOOK, lo: 33.34, hi: 33.42 },
    { name: '25 u from wc1di2, level look', feet: [1541, 30, 2090], pitch: LEVEL_LOOK, lo: 29.21, hi: 29.29 },
    { name: '30 u from wc1di2, level look', feet: [1536, 30, 2090], pitch: LEVEL_LOOK, lo: 26.39, hi: 26.47 },
  ];
  const ELEVATION_TOL_DEG = 1, SPEED_TOL = 1, CAPTURE_SPEED = 238, CAPTURE_POWER = 0.9893;
  const elevationOf = (v: readonly number[]): number => (Math.atan2(v[1]!, Math.hypot(v[0]!, v[2]!)) * 180) / Math.PI;
  const launchAt = (aimSin: number) => {
    const anim = throwAnim(CAPTURE_POWER, aimSin, 'stand', 0);
    return throwVelocity(CAPTURE_POWER, aimSin, anim.offset, maxThrowDistance('stand'));
  };
  const caseAim = async (c: (typeof LAUNCHES)[number], latch: Stance) => {
    const { grid, material } = await map();
    const body = { feet: c.feet, yaw: 270, stance: 'stand' as const, latch, pitch: c.pitch };
    return bodyThrowAim(grid, rayAt(grid, c.feet, 270, 'stand', c.pitch), body, M67_RANGE, material);
  };

  for (const c of LAUNCHES) {
    it(`PC 2 ${c.name}, the M67 selected standing: the page's full throw leaves at the capture's elevation (${c.lo}..${c.hi} deg) and speed`, async () => {
      const r = await pageThrow(c.feet, 270, 'stand', { latch: 'stand', pitch: c.pitch, hold: 90 });
      expect(r.last, `the page's launch (refusal ${r.refusal})`).not.toBeNull();
      const v = r.last!.velocity;
      const crouch = launchAt((await caseAim(c, 'crouch'))[1]);   // for the log only
      const trunk = launchAt(releaseAimSin({ pitch: c.pitch }));   // the trunk's path (before B-06): the look's sine
      const e = elevationOf(v);
      console.log(`PC 2 ${c.name}: capture ${c.lo}..${c.hi} deg, the page's launch ${e.toFixed(2)} deg at ${Math.hypot(...v).toFixed(2)} u/s, crouch latch (composed) ${elevationOf(crouch.velocity).toFixed(2)}, trunk ${elevationOf(trunk.velocity).toFixed(2)}`);
      expect(e, 'the elevation').toBeGreaterThanOrEqual(c.lo - ELEVATION_TOL_DEG);
      expect(e, 'the elevation').toBeLessThanOrEqual(c.hi + ELEVATION_TOL_DEG);
      expect(Math.abs(Math.hypot(...v) - CAPTURE_SPEED), 'the speed').toBeLessThanOrEqual(SPEED_TOL);
    }, 60_000);
  }

  it("guard: PC 2's wall legs at the CROUCH latch read 44.5 / 38.8 / 34.7 deg, off the capture -- the test proves the latch, not the formula", async () => {
    const AT_CROUCH = [44.5, 38.8, 34.7];
    for (const [i, c] of LAUNCHES.slice(2).entries()) {
      const e = elevationOf(launchAt((await caseAim(c, 'crouch'))[1]).velocity);
      expect(Math.abs(e - AT_CROUCH[i]!), c.name).toBeLessThanOrEqual(0.5);
      expect(e, c.name).toBeGreaterThan(c.hi + ELEVATION_TOL_DEG);
    }
  }, 60_000);

  const WALL20: V3 = [1546, 30, 2090];
  it('the 20 u leg throws with the CROUCH latch at the default look (PC 3) and with the STAND latch at the level look (PC 2)', async () => {
    const pc3 = await pageThrow(WALL20, 270, 'stand', { latch: 'crouch' });
    const pc2 = await pageThrow(WALL20, 270, 'stand', { latch: 'stand', pitch: LEVEL_LOOK, hold: 90 });
    expect(pc3.started && pc3.last !== null, `PC 3: refusal ${pc3.refusal}`).toBe(true);
    expect(pc2.started && pc2.last !== null, `PC 2: refusal ${pc2.refusal}`).toBe(true);
  }, 60_000);

  // A capture of the original (KILL-LATCH-PC2 s2; record D:/s2u-records/KILL-LATCH-PC2/KILL-LATCH-PC2.zip, sha256
  // 5bcf4f60b800abcb29c421056a687fa17efce098c6579275d1457fc62670ccc0; summary
  // agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL-LATCH-PC2/RESULTS.md): a standing select at 20 u, the default
  // look, REFUSED 3/3 with no throw clip, `+0x14a4` 13.10-13.13, the aim 14.84-14.96 degrees at the request. Was the
  // reconcile s5's prediction. The 0.24 u by which the page's 25 u ray passes the wall is the PORT's figure: the
  // original's cast was NOT measured (s2: its values not read, no hand-open).
  it("a capture of the original (KILL-LATCH-PC2): the STAND latch at 20 u and the DEFAULT look is refused (3/3, no clip); the page's 25 u ray past the wall by about 0.24 u (the port's figure, not measured on the original)", async () => {
    const r = await pageThrow(WALL20, 270, 'stand', { latch: 'stand' });
    const aim = (await aimAt(WALL20, 270, 'stand', 'stand')).aim;
    const seg = throwClearanceSegment(snapOf(WALL20, 270, 'stand'), 0.895, aim);
    console.log(`KILL-LATCH s2: aim ${aim.map((x) => x.toFixed(4)).join(', ')}, the ray's end x ${seg.to[0].toFixed(3)} (the wall 1566), refusal ${r.refusal}`);
    expect(r.started).toBe(false);
    expect(r.refusal).toBe('clear');
    const elevation = (Math.asin(aim[1]) * 180) / Math.PI;
    console.log(`KILL-LATCH s2: the page's aim elevation ${elevation.toFixed(3)} deg (the capture 14.84..14.96)`);
    expect(Math.abs(seg.to[0] - 1566 - 0.24), "the port's own margin (the original's cast not measured)").toBeLessThanOrEqual(0.15);
  }, 60_000);

  // The review of 4e26b9ad0e, finding 2: the Detonator raised from the rifle took no latch, so an older crouched select's
  // H was thrown. The firearm's record writes H while it is up (the stand here), and the Detonator and the M67 after it
  // keep that value (THROW_AIM_ORIGIN_LATCH_READING's no-write path; the Detonator's write an assumption named there):
  // the stand latch at 20 u at the default look, which KILL-LATCH s2 refused 3/3. KILL-LATCH's scope: it captured a
  // standing select thrown at that pose, NOT this Detonator sequence; the sequence's verdict follows from the latch's
  // no-write path (a reading, no capture).
  it('the held item changed through the Detonator: rifle standing, crouch, M67, stand, rifle, Detonator, M67 throws from the STAND latch -- REFUSED at 20 u, the default look (KILL-LATCH s2)', async () => {
    const { grid, material } = await map();
    const ray = rayAt(grid, WALL20, 270, 'stand');
    let now: Stance = 'stand';
    const g = new GrenadeThrower({ grid: () => grid, snapshot: () => snapOf(WALL20, 270, now), view: () => 'third', aim: () => ray });
    g.setEnvironment(material);
    g.setKit(['M67', 'Claymore', null]);
    const starts: string[] = [];
    g.on('throwStart', (e) => starts.push(e.anim.clip));
    expect(g.select('Claymore'), 'harness: the claymore taken up').toBe(true);
    g.pull();
    for (let i = 0; i < 180; i++) g.update(1 / 60);
    expect(g.stats().placed, 'harness: one claymore down').toBe(1);
    expect(g.select('rifle')).toBe(true);
    now = 'crouch';
    expect(g.select('M67')).toBe(true);                          // the crouch latch
    now = 'stand';
    expect(g.select('rifle')).toBe(true);                        // the firearm up: H follows it, standing
    expect(g.select('Detonator'), 'harness: the Detonator with a claymore down').toBe(true);
    expect(g.select('M67')).toBe(true);
    starts.length = 0;
    g.pull();
    for (let i = 0; i < 43; i++) g.update(1 / 60);
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(starts, 'no throw clip').toEqual([]);
    expect(g.diag().lastRefusal?.reason ?? null).toBe('clear');
  }, 60_000);

  it('guard: a stance change after the select does not change H (selected standing, crouched and stood again; selected crouched, stood)', async () => {
    const { grid, material } = await map();
    const ray = rayAt(grid, WALL20, 270, 'stand', LEVEL_LOOK);
    const thrower = (selectAt: Stance, between: Stance | null) => {
      let now: Stance = selectAt;
      const g = new GrenadeThrower({ grid: () => grid, snapshot: () => snapOf(WALL20, 270, now, LEVEL_LOOK), view: () => 'third', aim: () => ray });
      g.setEnvironment(material);
      g.select('M67');
      if (between) { now = between; g.update(1 / 60); }
      now = 'stand';
      return g.throwNow(1.5)!;
    };
    const plain = thrower('stand', null), crouchedBetween = thrower('stand', 'crouch'), selectedCrouched = thrower('crouch', null);
    expect(plain, 'thrown').not.toBeNull();
    expect(crouchedBetween.velocity).toEqual(plain.velocity);
    expect(crouchedBetween.aimSin).toBe(plain.aimSin);
    // The latch is the select's: the crouched select throws from 8.76 whatever the stance at the press.
    expect(selectedCrouched.aimSin).toBeGreaterThan(plain.aimSin + 0.05);
  }, 60_000);

  /**
   * THE LATCH through the page's mover (box-kill-b06-7f063a0aa7: leg 8 latched stand 4/5 though the spec "selected
   * crouched"). The snapshot's `stance` is `Walker.posture` (`moverSnapshot`), which the stance setter writes when the
   * request is TAKEN (`Walker.applyStance`, `FUN_00552d60`'s dispatch D:L418877-418905): at once, the transition clip
   * (`standToCrouch`) after it -- the flag does not wait for the clip. Read through `GrenadeThrower.diag()`'s
   * `selectPosture` and `latchH` (THROW_DIAG_ADAPTATION, read only).
   */
  const bodyAt = (grid: Grid, feet: V3, yaw: number) => {
    const w = new Walker(grid);
    w.place(feet[0], feet[1] + probeLiftOf('stand'), feet[2]);
    w.state.yaw = yaw;
    const still = { forward: 0, right: 0, boost: false };
    for (let i = 0; i < 18; i++) w.tick(still);
    const g = new GrenadeThrower({ grid: () => grid, snapshot: () => moverSnapshot(w, null, 0, 0), view: () => 'third' });
    return { w, g, tick: () => w.tick(still) };
  };

  it('(i) the M67 selected after a SETTLED crouch latches crouch (8.76) -- the clip played out, the flag crouch', async () => {
    const { grid } = await map();
    const { w, g, tick } = bodyAt(grid, WALL20, 270);
    w.changeStance('crouch');
    let held = 0;
    while (w.action?.name === 'standToCrouch' && held < 600) { tick(); held++; }
    for (let i = 0; i < 30; i++) tick();
    console.log(`(i) standToCrouch held ${held} ticks at 60 Hz (${(held / 60).toFixed(3)} s); posture ${w.posture}`);
    expect(w.action, 'the crouch settled').toBeNull();
    expect(w.posture).toBe('crouch');
    expect(g.select('M67')).toBe(true);
    expect(g.diag().selectPosture).toBe('crouch');
    expect(g.diag().latchH).toBe(THROW_AIM_ORIGIN_LATCH_READING.crouch.up);
  }, 60_000);

  it("(ii) the M67 selected DURING the crouch's transition clip latches crouch's settled 8.76 -- the flag flipped at the take; the original still latches about the standing height, then part-way down (a reading, pending review): THROW_AIM_ORIGIN_LATCH_POSE_PLACEHOLDER (a)", async () => {
    const { grid } = await map();
    const { w, g, tick } = bodyAt(grid, WALL20, 270);
    w.changeStance('crouch');
    expect(w.posture, 'the flag at the press tick (the request taken)').toBe('crouch');
    tick();
    expect(w.action?.name, 'the transition clip still on').toBe('standToCrouch');
    expect(g.select('M67')).toBe(true);
    expect(g.diag().selectPosture).toBe('crouch');
    expect(g.diag().latchH).toBe(THROW_AIM_ORIGIN_LATCH_READING.crouch.up);
  }, 60_000);

  it("(iii) leg 8's pose (3.65 u off g373, facing it): the crouch gate keeps the press (`crouchRefused`, CROUCH_GATE_READING), the body never crouches, the select latches STAND", async () => {
    const { grid } = await map();
    const { w, g, tick } = bodyAt(grid, [1640.1, 0, 1383.65], 0);
    expect(w.crouchRefused('stand'), 'the crouch gate meets g373').toBe(true);
    w.changeStance('crouch');
    for (let i = 0; i < 30; i++) tick();                         // the spec's walkFor(0.5)
    expect(w.posture).toBe('stand');
    expect(w.effectiveAction().pendingStance, 'the press kept, asked each tick').toBe('crouch');
    expect(g.select('M67')).toBe(true);
    expect(g.diag().selectPosture).toBe('stand');
    expect(g.diag().latchH).toBe(THROW_AIM_ORIGIN_LATCH_READING.stand.up);
  }, 60_000);
});

function close(a: readonly number[], b: readonly number[], tol: number): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!), `axis ${k}: ${a[k]} against ${b[k]}`).toBeLessThanOrEqual(tol);
}
