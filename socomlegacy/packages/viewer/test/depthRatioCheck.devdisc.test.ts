// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { segmentHits, type Grid } from '@s2u/scene';
import { Animator, PLAY_CLIPS, type MoverSnapshot } from '../src/animator';
import { CAM_MARGIN, localCamera, toWorld, type Vec3 } from '../src/cameraRig';
import { heldSkeleton, muzzleOf, muzzlePoint } from '../src/heldItem';
import { loadMap } from '../src/loadMap';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { rootY } from '../src/mover';
import { PLANT_PICK_FIREPOINT_READING, plantReachFrom } from '../src/net/objective';
import { bodySkeleton } from '../src/play';
import { INIT_AIM_PITCH } from '../src/playerCamera';
import { simMapFromBytes } from '../src/simMap';
import { FIRE_VERSIONS, WEAPON_CLIPS, WeaponPose } from '../src/weaponPose';

/**
 * A MEASUREMENT, not a pin (LATER 1141): the depth ratio f = (d_aim - d_fire) / d_aim the original's reticle-climb cap
 * scales ReticuleKnockMax by, computed from the PORT's own geometry at the cap552 capture's two poses on MP6 (feet
 * (1197.12, 0, 1780) and (1127.12, 0, 1780), crouched, facing +x toward the interior wall at the lane z 1780). d(P) =
 * (camPos - P) . camAxis. The camera: `localCamera` / `toWorld` (../src/cameraRig); the crouched root: `rootY('crouch')`
 * (../src/mover); the wall: the first hit of the camera's centre ray in MP6's collision grid (`simMapFromBytes`); the
 * firepoint: the crouch IDLE firepoint `PLANT_PICK_FIREPOINT_READING.crouch` (research 217 s1.3; not the firing pose).
 * Asserts only finiteness; writes JSON to env P1_OUT when set. Skipped -- and said so -- without the dev disc.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '';

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): Vec3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** toWorld's ahead (0,0,-1) maps to world (-sin yaw, 0, -cos yaw): yaw 270 gives (+1, 0, 0), facing +x. */
const YAW = 270;
const POSES = { 'A-d30': [1197.12, 0, 1780], 'A-d100': [1127.12, 0, 1780] } as const;
const PITCHES = [0, -5, 5];
const KNOCK_MAX_CROUCH = 54;
const PORT_OFFSET_PER_PX = 0.0023822;
const REACH = 3000;

/**
 * LATER 1141 / LATER 1159 (research 441 s2-s3; the main controller's ruling (a), 2026-11-18): the depth ratio the
 * capture-scored caps imply at the two poses -- the climb held at -21.5..-21.6 and -37.5..-37.6 of the crouch's
 * ReticuleKnockMax 54 (`bugs/captures/cap552`, scored by the bugs seat and a fresh reviewer) -- as a band. LATER 1159 (closed
 * 2026-11-18): the original's own f from its memory (`ORIGINAL_L1159_READ`) sits at the band (A-d30 at its lower edge),
 * and the port's camera at the spawn pitch is the original's; what is left is the port's posed FIRING firepoint
 * (LATER 1202), an `it.fails` below.
 */
const CAP552_MEASURED_F_READING = { 'A-d30': [21.5 / 54, 21.6 / 54], 'A-d100': [37.5 / 54, 37.6 / 54] } as const;

/**
 * LATER 1159: the ORIGINAL at the cap552 poses, read from its memory (PC 3, r0004 on stock PCSX2 2.8.2, MP6, one console,
 * 2026-11-18 09:58-10:00Z; the posture word actor+0x174 1 crouched, 0 standing, on every row; 30 rows a set, torn 0; a
 * trace of the original; agent-mail evidence/bugs-2026-11-18/l1159-crouch-read). The FIRING sets' means (the caps were
 * scored on a burst): the eye cam+0x30 less the feet +0x1c, the axis cam+0x20 (the look rests 9.17 deg down -- +0x1070
 * (-0.0799, 0, 0), the spawn pitch -- and 1.5 deg off +x in yaw), the aimed point +0x1458 (A-d30 the wall face x 1233,
 * A-d100 the floor), the firepoint +0x14b0 (in world axes; its own frame unread). `eyeStand` is the standing set's.
 */
const ORIGINAL_L1159_READ = {
  'A-d30': { eye: [-24.897, 19.603, -0.667], axis: [-0.9869, 0.1595, -0.0261], aim: [1233.0, 9.777, 1780.939], fp: [10.951, 9.416, 1.888] },
  'A-d100': { eye: [-24.896, 19.603, -0.726], axis: [-0.9868, 0.1594, -0.029], aim: [1223.573, 0.0, 1782.838], fp: [11.134, 8.213, 2.392] },
  eyeStand: [-24.905, 25.709, 0.263],
} as const;
/**
 * The tolerance on a cap: half the capture's 0.1-px reading step (the band's own width), 0.05 px of the 54-px
 * ReticuleKnockMax, as an f. A stated measurement tolerance, not a fit: the original's own f sits at the band's lower edge
 * at A-d30 (0.002 px under it), and the firepoint's frame alone moves the port's f by about 0.04 px there.
 */
const CAP_TOLERANCE_F = 0.05 / KNOCK_MAX_CROUCH;

/** The original's own f at a pose, from its own eye, axis, aimed point and firepoint (d(P) = (eye - P) . axis). */
function originalF(name: keyof typeof POSES): number {
  const r = ORIGINAL_L1159_READ[name], feet = POSES[name];
  const eye = add(feet, r.eye), fire = add(feet, r.fp);
  const dAim = dot(sub(eye, r.aim), r.axis), dFire = dot(sub(eye, fire), r.axis);
  return (dAim - dFire) / dAim;
}
/**
 * The original's firepoint carried into the port's pose: its ahead and across parts along the original's OWN heading
 * (the axis's horizontal, reversed), laid on +x from the port's feet -- so its 1.5-deg yaw is not read as a lateral offset.
 */
function originalFireInPortPose(name: keyof typeof POSES): Vec3 {
  const r = ORIGINAL_L1159_READ[name], feet = POSES[name];
  const n = Math.hypot(r.axis[0], r.axis[2]);
  const hx = -r.axis[0] / n, hz = -r.axis[2] / n;
  const ahead = r.fp[0] * hx + r.fp[2] * hz, across = -r.fp[0] * hz + r.fp[2] * hx;
  return [feet[0] + ahead, feet[1] + r.fp[1], feet[2] + across];
}

/**
 * The rested eye in actor space at `INIT_AIM_PITCH` (the page camera's spawn pitch: `walk.ts` `setPose`): `localCamera`'s
 * target plus its back axis at the pass's settled reach, `dist + CAM_MARGIN` (`cameraRig.ts` `reach`, nothing in the way;
 * playerCamera.ts's note has the console dump's 24.906 behind, 19.603 up).
 */
function restEye(stance: 'crouch' | 'stand'): Vec3 {
  const c = localCamera(rootY(stance), INIT_AIM_PITCH, 0);
  return add(c.target, scale(c.back, c.dist + CAM_MARGIN));
}
/** The rested crouched eye, the look's axis and its first hit in the grid, from `feet` facing +x. */
function restAim(grid: Grid, feet: readonly number[]): { eye: Vec3; axis: Vec3; aim: Vec3 } {
  const c = localCamera(rootY('crouch'), INIT_AIM_PITCH, 0);
  const eye = toWorld(feet, YAW, restEye('crouch')), axis = toWorld([0, 0, 0], YAW, c.ahead);
  return { eye, axis, aim: segmentHits(grid, eye, add(eye, scale(axis, REACH)))[0]!.point };
}
/** f at the rest pose for a world firepoint. */
function restF(grid: Grid, feet: readonly number[], fire: readonly number[]): number {
  const { eye, axis, aim } = restAim(grid, feet);
  const dAim = dot(sub(eye, aim), axis), dFire = dot(sub(eye, fire), axis);
  return (dAim - dFire) / dAim;
}

/** The posing files `portFiringFirepoint` reads beside MP6 (LATER 1159 review F5: checked, not assumed). */
const POSE_DISC = HAVE_DISC && ['RUN/MP6.ZDB', 'RUN/MP2.ZDB', 'RUN/MOTION_P.ZAR', 'RUN/READERC.ZAR'].every((q) => existsSync(join(DISC, q)));
/**
 * The port's posed firing firepoint (actor space) of a crouched SEAL holding the 552 SD (item 67) at `pitch`, posed
 * exactly as firepointPose.devdisc.test.ts poses it: raise 1 (the crouch's Fire version), 3 s settled, then 4 s sampled
 * and the sample at the clip's lowest key frame taken.
 */
async function portFiringFirepoint(pitch: number): Promise<Vec3> {
  const bytes = (q: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, q)));
  const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP2.ZDB');
  if (!map.body) throw new Error('MP2 loaded no body');
  const clips = clipsFromPack(bytes('RUN/MOTION_P.ZAR'), [...new Set([...PLAY_CLIPS, ...WEAPON_CLIPS, ...Object.values(FIRE_VERSIONS)])]);
  const table = motionTableFromArchive(bytes('RUN/READERC.ZAR'));
  const rec = map.arsenal?.table.arsenal.items.get(67) as { model?: string } | undefined;
  const model = rec?.model ?? '';
  const weapon = map.weapons?.[model] ?? Object.values(map.weapons ?? {}).find((w) => w.name.toLowerCase() === model.toLowerCase());
  const muzzle = weapon ? muzzlePoint(weapon.points) : null;
  if (!muzzle) throw new Error('no 552 SD muzzle');
  const still: MoverSnapshot = {
    vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: true, landing: null, jumps: 0, stance: 'crouch',
    ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0, pitch,
  };
  const sk = heldSkeleton(bodySkeleton(map.body));
  const anim = new Animator(sk, clips, table, { random: () => 0 });
  const pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
  anim.setWeapon('rifle');
  pose.item = 'rifle';
  anim.addPoseLayer(pose.fireLayer);
  anim.addPoseLayer(pose.reloadLayer);
  const dt = 1 / 60;
  const step = (): void => { pose.fireWeight = 1; pose.step(dt); anim.step(dt, { ...still, aimWeight: 1 }); };
  for (let t = 0; t < 3; t += dt) step();
  let best: { frame: number; fp: Vec3 } | null = null;
  for (let t = 0; t < 4; t += dt) {
    step();
    sk.update();
    const fp = muzzleOf(sk, muzzle, 'rifle')!;
    const frame = (anim.stats() as unknown as { frame: number }).frame;
    if (!best || frame < best.frame) best = { frame, fp: [fp[0], fp[1], fp[2]] };
  }
  return best!.fp;
}

describe.skipIf(!HAVE_DISC)(`LATER 1141: the port's depth ratio at the cap552 poses on MP6${HAVE_DISC ? '' : ' (no dev disc -- skipped)'}`, () => {
  it('computes eye, axis, aimed point, firepoint, d_aim, d_fire, f, the cap and the offset per pixel', () => {
    const grid: Grid = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP6.ZDB'))), 'RUN/MP6.ZDB').grid;
    const root = rootY('crouch');
    const rows: Record<string, unknown>[] = [];
    // The wall along the lane: a level ray at the root's height and at y 10 from each pose's feet, toward +x.
    const wall: Record<string, unknown>[] = [];
    for (const [name, feet] of Object.entries(POSES)) {
      for (const h of [root, 10, 15]) {
        const a: Vec3 = [feet[0], feet[1] + h, feet[2]];
        const hs = segmentHits(grid, a, add(a, [REACH, 0, 0]));
        wall.push({ pose: name, y: h, hits: hs.slice(0, 3).map((x) => ({ point: x.point, normal: x.normal, kind: x.owner.modelName })) });
      }
    }
    for (const [name, feet] of Object.entries(POSES)) {
      for (const pitch of PITCHES) {
        const local = localCamera(root, pitch, 0);
        const eye = toWorld(feet, YAW, local.eye);
        const target = toWorld(feet, YAW, local.target);
        const axis = toWorld([0, 0, 0], YAW, local.ahead);
        const hs = segmentHits(grid, eye, add(eye, scale(axis, REACH)));
        const hit = hs[0] ?? null;
        const aim: Vec3 | null = hit ? hit.point : null;
        const fire = plantReachFrom(feet, YAW, 'crouch');
        // d(P) = (camPos - P) . camAxis: negative ahead of the eye; f is a ratio, so the sign cancels.
        const dAim = aim ? dot(sub(eye, aim), axis) : NaN;
        const dFire = dot(sub(eye, fire), axis);
        const f = (dAim - dFire) / dAim;
        rows.push({
          pose: name, pitch, yaw: YAW, rootY: root, feet, eye, target, axis, aim, aimKind: hit ? (hit.owner.modelName) : null,
          aimNormal: hit?.normal ?? null, fire, dAim, dFire, f, cap: KNOCK_MAX_CROUCH * f, offsetPerPx: PORT_OFFSET_PER_PX / f,
        });
      }
    }
    const out = { firepoint: { source: 'PLANT_PICK_FIREPOINT_READING.crouch (idle pose)', body: PLANT_PICK_FIREPOINT_READING.crouch }, wall, rows };
    const json = JSON.stringify(out, null, 1);
    console.log(json);
    if (process.env.P1_OUT) writeFileSync(process.env.P1_OUT, json);
    for (const r of rows) expect(Number.isFinite(r.f as number)).toBe(true);
  });

  // LATER 1159 (closed): the pitch-0 check this replaces missed because the original rests at the spawn pitch, not at 0.
  it('LATER 1159: at init_aim_pitch with the pass\u2019s reach the port\u2019s eye and aimed point are the original\u2019s (PC 3 read)', () => {
    const grid: Grid = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP6.ZDB'))), 'RUN/MP6.ZDB').grid;
    for (const [stance, read] of [['crouch', ORIGINAL_L1159_READ['A-d30'].eye], ['stand', ORIGINAL_L1159_READ.eyeStand]] as const) {
      const eye = restEye(stance);
      expect(Math.abs(Math.hypot(eye[0], eye[2]) - Math.hypot(read[0], read[2])), `${stance}: the eye behind the feet`).toBeLessThan(0.05);
      expect(Math.abs(eye[1] - read[1]), `${stance}: the eye over the feet`).toBeLessThan(0.05);
    }
    for (const [name, feet] of Object.entries(POSES)) {
      const { aim } = restAim(grid, feet);
      const want = ORIGINAL_L1159_READ[name as keyof typeof POSES].aim;
      expect(Math.abs(aim[0] - want[0]), `${name}: the aimed point's x`).toBeLessThan(0.5);
      expect(Math.abs(aim[1] - want[1]), `${name}: the aimed point's y`).toBeLessThan(0.5);
    }
  });

  it('LATER 1159: the original\u2019s own f from its memory agrees with the capture\u2019s band to within half a reading step', () => {
    for (const name of Object.keys(POSES) as (keyof typeof POSES)[]) {
      const f = originalF(name);
      const [lo, hi] = CAP552_MEASURED_F_READING[name];
      expect(f, name).toBeGreaterThanOrEqual(lo - CAP_TOLERANCE_F);
      expect(f, name).toBeLessThanOrEqual(hi + CAP_TOLERANCE_F);
    }
  });

  it('LATER 1159: with the original\u2019s firing firepoint the port\u2019s eye and aim give the original\u2019s own f (0.05 px) at both poses', () => {
    const grid: Grid = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP6.ZDB'))), 'RUN/MP6.ZDB').grid;
    for (const name of Object.keys(POSES) as (keyof typeof POSES)[]) {
      const f = restF(grid, POSES[name], originalFireInPortPose(name));
      expect(Math.abs(f - originalF(name)), name).toBeLessThan(CAP_TOLERANCE_F);
    }
  });

  // NOT YET MET (LATER 1202): the port's own posed FIRING firepoint at the spawn pitch sits about 1.6 u under the original's
  // at A-d30 (the original's own height moves 1.2 u between the poses: the burst's climb); `it.fails` holds the miss.
  it.skipIf(!POSE_DISC).fails('the port f with its own posed firing firepoint at init_aim_pitch is the original\u2019s own f (0.05 px) at both poses -- not yet: LATER 1202', async () => {
    const grid: Grid = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP6.ZDB'))), 'RUN/MP6.ZDB').grid;
    const local = await portFiringFirepoint(INIT_AIM_PITCH);
    for (const name of Object.keys(POSES) as (keyof typeof POSES)[]) {
      const f = restF(grid, POSES[name], toWorld(POSES[name], YAW, local));
      expect(Math.abs(f - originalF(name)), name).toBeLessThan(CAP_TOLERANCE_F);
    }
  }, 120_000);
});
