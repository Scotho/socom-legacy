import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { readMeshLibrary, skinSubMesh, type SkinnedMeshData } from '@s2u/mesh';
import {
  IDENTITY, partMatrix, readSkeleton, sampleClip, Skeleton, type MotionClip, type MotionPart, type SkeletonPart,
} from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import {
  Animator, BANK_FACTOR, BODY_PARTS, SAMPLED_TRANSLATIONS, HELD_ALIAS, HELD_PART, PLAY_CLIPS, TWIST_SHARE, blendWeight, crosses, isCycle, layerName,
  mergeRotations, OVERLAY_BLEND, partIndex, PRONE_POP_RISE_S_ADAPTATION, qmul, qrot, quatOfMatrix, slerp, turnStepSpeed, writePose,
  type AnimEvent, type LayerContext, type MoverSnapshot,
} from '../src/animator';
import { BLEND_TIME_DEFAULT, MOTION_CLIPS, SEAL_ANIMS, oneShotSeconds } from '../src/locomotion';
import { clipsFromPack, motionTableFromArchive, type MotionEntry } from '../src/motionTable';
import { moverSnapshot, SWAP_OVERLAY_SECONDS, TICK, Walker, type GroundMotion, type MoverAction, type WalkInput } from '../src/walk';
import { buildGrid, handAnim, PLACE_CLAYMORE_ANIM, THROW_ANIMS, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { bodyOf, snapshotOf } from '../src/net/body';
import { ThrowPose, throwPoseEnds } from '../src/throwPose';
import { WeaponPose } from '../src/weaponPose';
import { WeaponRaise } from '../src/weaponRaise';

/**
 * The animator (web sprint 2 W2.2b; the motion workstream, socomlegacy/docs/research/80-the-jump.md): the mover's action or
 * ground state names a play -- nodes sharing one phase, `./locomotion`'s port of the game's pick and blend -- which
 * starts with a cross-fade, advances as `FUN_0028c4f0` does, fires its events, and poses the skeleton. Synthetic clips
 * pin the rules with made-up numbers; the owner's `MOTION_P.ZAR`, `READERC.ZAR` and Frostfire's SEAL pin the rest.
 */

// ---- synthetic clips and a synthetic skeleton ----------------------------------------------------------------------

const Q_ID: [number, number, number, number] = [0, 0, 0, 1];
/** A unit quaternion turning `deg` about x. */
const qx = (deg: number): [number, number, number, number] => {
  const a = (deg * Math.PI) / 360;
  return [Math.sin(a), 0, 0, Math.cos(a)];
};

/** Two 16-float matrices equal to float32's rounding. */
const expectMatrix = (a: ArrayLike<number>, b: ArrayLike<number>): void => {
  expect(a.length).toBe(16);
  for (let i = 0; i < 16; i++) expect(a[i]!, `element ${i}`).toBeCloseTo(b[i]!, 5);
};

/** A clip of `frames` keys at 30 a second; each part a constant or per-key channel. */
function clip(name: string, frames: number, parts: { name: string; t: number[][]; q: number[][] }[]): MotionClip {
  const mparts: MotionPart[] = parts.map((p, index) => ({
    index, name: p.name, flags: 0x0c | (p.q.length === 1 ? 0x10 : 0) | (p.t.length === 1 ? 0x20 : 0),
    translations: Float32Array.from(p.t.flat()), rotations: Float32Array.from(p.q.flat()),
  }));
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: mparts };
}

/** `n + 1` keys, the last equal to the first (77 §5), from a per-key function. */
const keys = <T>(frames: number, f: (i: number) => T): T[] =>
  Array.from({ length: frames + 1 }, (_, i) => f(i === frames ? 0 : i));

/** A clip whose root travels `speed` units a second along the model's -z and whose left thigh turns `legDeg` a key. */
function walker(name: string, frames: number, speed: number, legDeg: number, rootY = 11): MotionClip {
  return clip(name, frames, [
    { name: 'skel_root', t: keys(frames, (i) => [0.5, rootY, 20 - (speed / 30) * i]), q: [Q_ID] },
    { name: 'lthigh', t: [[1, -1, 0]], q: keys(frames, (i) => qx(legDeg * i)) },
    { name: 'lbicep', t: [[2, 6, 0]], q: [qx(0)] },
    { name: 'rifle', t: [[0, 0, 0]], q: [Q_ID] },               // a prop the skeleton does not have
  ]);
}

/** A still clip whose root stands at `rootY` (a curve when given per key) and whose thigh holds `legDeg`. */
function pose(name: string, frames: number, legDeg: number, rootY: number | number[] = 11): MotionClip {
  const t = Array.isArray(rootY) ? rootY.map((y) => [0.5, y, 20]) : [[0.5, rootY, 20]];
  return clip(name, frames, [{ name: 'skel_root', t, q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(legDeg)] }]);
}

/** skel_root -> lthigh, skel_root -> lbicep, and `body` beside the root: bind locals with made-up translations. */
function skeleton(): Skeleton {
  const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  return new Skeleton('test', IDENTITY, [
    part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0]), part(2, 'lbicep', 0, [2, 6, 0]), part(3, 'body', -1, [0, 0, 0]),
  ]);
}

/** A `motion.rdr` entry, made up: every field absent unless given. */
const entry = (e: Partial<MotionEntry>): MotionEntry => ({
  looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
});
/** A locomotion cycle's entry: looped, `playback` 1, `max_velocity` and the band in metres a second. */
const cycle = (maxVelocity: number, a: number, b: number, extra: Partial<MotionEntry> = {}): MotionEntry =>
  entry({ looped: true, playback: 1, maxVelocity, transitionA: a, transitionB: b, ...extra });
/** A one-shot's entry. */
const once = (playback: number, extra: Partial<MotionEntry> = {}): MotionEntry => entry({ looped: false, playback, maxVelocity: -1, ...extra });

const IDLE: GroundMotion = { state: 'idle', forward: 0, right: 0, cls: -1 };
/** The mover at rest on the floor, standing, facing yaw 0. */
const REST: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand', ground: IDLE, action: null };
/** The standing ground state with its stick (forward, right), moving at `speed`. */
const running = (forward: number, right = 0, speed = 65 * Math.hypot(forward, right)): MoverSnapshot =>
  ({ ...REST, vz: -speed, ground: { state: 'stand', forward, right, cls: 1 } });
const acting = (name: MoverAction['name'], serial = 1, extra: Partial<MoverAction> = {}): MoverSnapshot =>
  ({ ...REST, action: { name, serial, t: 0, seconds: null, reversed: false, ...extra } });

// ---- the plays --------------------------------------------------------------------------------------------------------

/** The standing sets' clips with bands like the Seal anim set's, and the stand. */
function standingKit(): { clips: MotionClip[]; table: Map<string, MotionEntry> } {
  const clips = [
    pose('seal_stand', 16, 0), walker('seal_walk_alert', 16, 32, 2), walker('seal_jog_alert', 18, 47, 3), walker('seal_run', 19, 57.7, 4),
    walker('seal_walk_bw', 16, -32, 1), walker('seal_run_bw', 18, -34, 1),
    clip('seal_rstrafe', 22, [{ name: 'skel_root', t: keys(22, (i) => [0.5 + (15 / 30) * i, 10.8, 20]), q: [Q_ID] }]),
    clip('seal_run_90r', 18, [{ name: 'skel_root', t: keys(18, (i) => [0.5 + (55 / 30) * i, 10, 20]), q: [Q_ID] }]),
  ];
  const table = new Map<string, MotionEntry>([
    ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
    ['seal_walk_alert', cycle(6.5, 0, 4)], ['seal_jog_alert', cycle(6.5, 2, 6.15)], ['seal_run', cycle(6.5, 4.01, 6.5)],
    ['seal_walk_bw', cycle(3.7, 0, 2.8)], ['seal_run_bw', cycle(3.7, 2, 3.7)],
    ['seal_rstrafe', cycle(6.5, 0, 2.8)], ['seal_run_90r', cycle(6.5, 3, 6.5)],
  ]);
  return { clips, table };
}

describe("PRONE-TILT: the root takes the walker's tilt after the cross-fade (FUN_00548090 D:L413274-413282, research 217 s7)", () => {
  it("a snapshot's rootTilt is the root's rotation as posed; none (null or absent) leaves the clip's root", () => {
    const { clips, table } = standingKit();
    const tilt = qx(20);
    const anim = new Animator(skeleton(), clips, table);
    const sk = (anim as unknown as { skeleton: Skeleton }).skeleton;
    anim.step(1 / 60, REST);
    expectMatrix(sk.local[0]!, partMatrix(Q_ID, [0, anim.rootY()!, 0]));
    anim.step(1 / 60, { ...REST, rootTilt: tilt });
    expectMatrix(sk.local[0]!, partMatrix(tilt, [0, anim.rootY()!, 0]));
    anim.step(1 / 60, { ...REST, rootTilt: null });
    expectMatrix(sk.local[0]!, partMatrix(Q_ID, [0, anim.rootY()!, 0]));
  });
});

describe('the play the mover asks for (research 80 §4)', () => {
  it('stands at rest; standing locomotion is the pick and blend -- full ahead the run, half the walk and the jog', () => {
    const { clips, table } = standingKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, REST);
    expect(anim.stats()).toMatchObject({ clip: 'seal_stand', play: 'idle:stand' });
    anim.step(1 / 60, running(1));
    expect(anim.stats().play).toBe('loco:stand');
    expect(anim.stats().nodes.map((n) => n.clip)).toEqual(['seal_run']);
    anim.step(1 / 60, running(0.5));                     // 32.5 in walk_alert 0-40 and jog_alert 20-61.5
    const half = anim.stats().nodes;
    expect(half.map((n) => n.clip)).toEqual(['seal_walk_alert', 'seal_jog_alert']);
    expect(half[0]!.weight).toBeCloseTo(1 - (32.5 - 20) / (40 - 20), 9);
    expect(half[1]!.weight).toBeCloseTo((32.5 - 20) / (40 - 20), 9);
  });

  it('strafes with the strafe set, at full stick the running strafe -- not the slow strafe flailing at 65', () => {
    const { clips, table } = standingKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, running(0, 1));
    expect(anim.stats().nodes.map((n) => n.clip)).toEqual(['seal_run_90r']);
    anim.step(1 / 60, running(0, 0.3));                  // 19.5: the slow strafe's band
    expect(anim.stats().nodes.map((n) => n.clip)).toEqual(['seal_rstrafe']);
    anim.step(1 / 60, running(Math.SQRT1_2, Math.SQRT1_2));
    const diag = anim.stats().nodes;
    expect(diag.map((n) => n.clip)).toEqual(['seal_run', 'seal_run_90r']);
    diag.forEach((n) => expect(n.weight).toBeCloseTo(0.5, 12));
  });

  it('plays each clip at the speed that makes its root travel the mover\'s speed: the rate follows the stick', () => {
    const { clips, table } = standingKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, running(1));
    const runRate = anim.stats().rate;                   // keys a second
    // seal_run: 19 keys; its root travels 57.7 a second at 30 keys a second -> 65 needs 30 x 65 / 57.7
    expect(runRate).toBeCloseTo((30 * 65) / 57.7, 1);
    anim.step(1 / 60, running(0, 1));
    expect(anim.stats().rate).toBeCloseTo((30 * 65) / 55, 1);
  });

  it('every node samples the one phase, which advances by sum(weight x speed / T) (FUN_0028c4f0)', () => {
    const { clips, table } = standingKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, running(0.5));
    const f0 = anim.stats().frame;
    for (let i = 0; i < 6; i++) anim.step(1 / 60, running(0.5));
    // weighted cycles a second: walk 32.5 / D_walk, jog 32.5 / D_jog, D the root's travel a cycle
    const dWalk = 32 * 16 / 30, dJog = 47 * 18 / 30;
    const w = (32.5 - 20) / 20;
    const cycles = (1 - w) * 32.5 / dWalk + w * 32.5 / dJog;
    const main = anim.stats();
    expect(main.clip).toBe('seal_jog_alert');
    expect((main.frame - f0 + 18) % 18).toBeCloseTo(cycles * 6 / 60 * 18, 3);
  });

  it('crouched: the one set of the direction class; the right strafe half a cycle on (FUN_00582d10)', () => {
    const clips = [pose('seal_crouch', 10, 0, 5.5), walker('seal_crouchwalk', 28, 13, 1, 9.3),
      clip('seal_crouchstrafe_right_fast', 20, [{ name: 'skel_root', t: keys(20, (i) => [0.5 + 0.4 * i, 9, 20]), q: [Q_ID] }])];
    const table = new Map<string, MotionEntry>([['seal_crouchwalk', cycle(1.48, 0, 2)], ['seal_crouchstrafe_right_fast', cycle(1.5, 0, 2)]]);
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, { ...REST, stance: 'crouch', ground: { state: 'crouch', forward: 0.946, right: 0, cls: 1 } });
    expect(anim.stats()).toMatchObject({ play: 'loco:crouch:1', clip: 'seal_crouchwalk' });
    anim.step(1 / 60, { ...REST, stance: 'crouch', ground: { state: 'crouch', forward: 0, right: 0.946, cls: 0 } });
    expect(anim.stats()).toMatchObject({ play: 'loco:crouch:0', clip: 'seal_crouchstrafe_right_fast' });
    expect(anim.stats().frame).toBeGreaterThanOrEqual(10 - 1e-9);          // the phase kept, plus the 0.5 offset
  });

  it('prone: the crawl, backwards when backing up; the prone strafes across (FUN_00583500)', () => {
    const clips = [pose('seal_prone', 10, 0, 2.2), walker('seal_prone_crawl', 26, 10, 1, 2.3)];
    const table = new Map<string, MotionEntry>([['seal_prone_crawl', cycle(1.1, 0, 0.4)]]);
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, { ...REST, stance: 'prone' });
    expect(anim.stats().clip).toBe('seal_prone');
    anim.step(1 / 60, { ...REST, stance: 'prone', ground: { state: 'prone', forward: 1, right: 0, cls: 1 } });
    expect(anim.stats().nodes[0]!.speed).toBeGreaterThan(0);
    anim.step(1 / 60, { ...REST, stance: 'prone', ground: { state: 'prone', forward: -1, right: 0, cls: 3 } });
    expect(anim.stats()).toMatchObject({ clip: 'seal_prone_crawl', play: 'loco:prone:3' });
    expect(anim.stats().nodes[0]!.speed).toBeLessThan(0);
    expect(anim.stats().rate).toBeLessThan(0);
  });

  it("prone and still, a turn plays seal_prone_turn (FUN_0054aa30); standing, a turn plays nothing: the body pivots", () => {
    const clips = [pose('seal_stand', 16, 0), pose('seal_prone', 10, 0, 2.2), pose('seal_prone_turn', 21, 10, 2.2)];
    const anim = new Animator(skeleton(), clips, null);
    anim.step(1 / 60, { ...REST, stance: 'prone', turnRate: 0 });
    expect(anim.stats().clip).toBe('seal_prone');
    anim.step(1 / 60, { ...REST, stance: 'prone', turnRate: 1.2 });
    expect(anim.stats()).toMatchObject({ clip: 'seal_prone_turn', play: 'turn:prone' });
    anim.step(1 / 60, { ...REST, stance: 'stand', turnRate: 1.2 });
    expect(anim.stats().clip).toBe('seal_stand');
  });

  it('the crouch idle draws one of the Seal anim set\'s three by their chances, and keeps it while it plays', () => {
    const clips = ['seal_crouch', 'seal_crouch_alert01', 'seal_crouch_alert02'].map((n, i) => pose(n, 10, i * 10, 5.5));
    const drawn = (r: number): string => {
      const anim = new Animator(skeleton(), clips, null, { random: () => r });
      anim.step(1 / 60, { ...REST, stance: 'crouch' });
      return anim.stats().clip;
    };
    expect([drawn(0), drawn(0.29), drawn(0.31), drawn(0.59), drawn(0.61), drawn(0.99)])
      .toEqual(['seal_crouch', 'seal_crouch', 'seal_crouch_alert01', 'seal_crouch_alert01', 'seal_crouch_alert02', 'seal_crouch_alert02']);
    let r = 0;
    const anim = new Animator(skeleton(), clips, null, { random: () => (r += 0.37) % 1 });
    anim.step(1 / 60, { ...REST, stance: 'crouch' });
    const first = anim.stats().clip;
    for (let i = 0; i < 30; i++) anim.step(1 / 60, { ...REST, stance: 'crouch' });
    expect(anim.stats().clip).toBe(first);
  });
});

describe('the actions: the jumps, the landings and the stance transitions', () => {
  const jumpKit = () => {
    const rise = [10.51, 10.51, 10.53, 10.54, 10.55, 10.56, 10.57, 10.65, 10.77, 11.46, 13.09, 14.55, 15.08, 14.94, 14.33, 12.83, 11.27, 11.25, 11.26, 11.26, 10.51];
    const clips = [pose('seal_stand', 16, 0, 11.48), pose(SEAL_ANIMS.jump, 20, 20, rise), pose(SEAL_ANIMS.launch, 25, 30),
      pose(SEAL_ANIMS.inAir, 14, 40), pose(SEAL_ANIMS.land, 20, 50), pose(SEAL_ANIMS.landHard, 20, 60),
      pose(SEAL_ANIMS.standToCrouch, 27, 0, keys(27, (i) => 11.5 - (6 * i) / 26)), pose('seal_crouch', 10, 0, 5.5)];
    const table = new Map<string, MotionEntry>([
      ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
      [SEAL_ANIMS.jump, once(1.1, { blendTime: 0.32, noInterrupt: 0.7, callbacks: [{ name: 'jump_whoosh', time: 0.4 }] })],
      [SEAL_ANIMS.launch, entry({ looped: false, playback: 2.4, maxVelocity: 6.5, blendTime: 0.2, callbacks: [{ name: 'jump_whoosh', time: 0.1 }] })],
      [SEAL_ANIMS.inAir, once(5, { blendTime: 0.75 })], [SEAL_ANIMS.land, once(0.7)], [SEAL_ANIMS.landHard, once(1)],
      [SEAL_ANIMS.standToCrouch, once(0.65)],
    ]);
    return { clips, table };
  };

  it('each action plays its clip: the Jump, the launch, the fall, the landings', () => {
    const { clips, table } = jumpKit();
    const anim = new Animator(skeleton(), clips, table);
    for (const [name, clipName] of [['jump', SEAL_ANIMS.jump], ['launch', SEAL_ANIMS.launch], ['fall', SEAL_ANIMS.inAir],
      ['land', SEAL_ANIMS.land], ['landHard', SEAL_ANIMS.landHard]] as const) {
      anim.step(1 / 60, acting(name));
      expect(anim.stats().clip, name).toBe(clipName);
    }
  });

  it('a one-shot runs keys 0 to n - 1 in playback x ((n - 1) / n)^2 and holds the last (FUN_0028c4f0, FUN_0028d670)', () => {
    const { clips, table } = jumpKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, REST);
    anim.step(0, acting('jump'));
    const seconds = oneShotSeconds(1.1, 20);
    expect(seconds).toBeCloseTo(0.99275, 6);
    let t = 0;
    while (anim.stats().frame < 19 - 1e-9 && t < 3) { anim.step(1 / 120, acting('jump')); t += 1 / 120; }
    expect(t).toBeCloseTo(seconds, 1);
    for (let i = 0; i < 60; i++) anim.step(1 / 60, acting('jump'));
    expect(anim.stats().frame).toBeCloseTo(19, 9);
  });

  it('the standing jump lifts the root as the clip does -- 10.5 to 15.1 -- after the 0.32 s blend in: rootY for the camera', () => {
    const { clips, table } = jumpKit();
    const anim = new Animator(skeleton(), clips, table);
    for (let i = 0; i < 60; i++) anim.step(1 / 60, REST);
    expect(anim.rootY()).toBeCloseTo(11.48, 5);
    anim.step(0, acting('jump'));
    let top = 0;
    for (let i = 0; i < 70; i++) { anim.step(1 / 60, acting('jump')); top = Math.max(top, anim.rootY()!); }
    expect(top).toBeGreaterThan(14.8);
    expect(top).toBeLessThanOrEqual(15.08 + 1e-6);
  });

  it('a transition played backwards (getting up) starts at its last key and runs to key 0 (FUN_0028c160)', () => {
    const { clips, table } = jumpKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(0, { ...acting('standToCrouch', 1, { reversed: true }), stance: 'stand' });
    expect(anim.stats().frame).toBeCloseTo(26, 6);
    expect(anim.stats().rate).toBeLessThan(0);
    for (let i = 0; i < 60; i++) anim.step(1 / 60, { ...acting('standToCrouch', 1, { reversed: true }), stance: 'stand' });
    expect(anim.stats().frame).toBe(0);
  });

  it('a new play cross-fades from the pose on screen over the new clip\'s BlendTime -- 0.4 when motion.rdr gives none', () => {
    const { clips, table } = jumpKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, REST);
    anim.step(1 / 60, acting('jump'));
    expect(anim.stats()).toMatchObject({ clip: SEAL_ANIMS.jump, from: 'seal_stand', blend: 0 });
    for (let i = 0; i < 9; i++) anim.step(1 / 60, acting('jump'));
    expect(anim.stats().blend).toBeCloseTo(blendWeight(9 / 60 / 0.32), 9);   // seal_jump's BlendTime 0.32
    anim.step(1 / 60, acting('land', 2));
    expect(BLEND_TIME_DEFAULT).toBe(0.4);                                   // FUN_00287620's default
    for (let i = 0; i < 12; i++) anim.step(1 / 60, acting('land', 2));
    expect(anim.stats().blend).toBeCloseTo(blendWeight(12 / 60 / 0.4), 9);
  });

  it('SEP-POP (3): the pop\'s cut into the run raises the root over the run\'s 0.4 blend -- 1.7 to ~10 in 0.35 s (EPH Q3)', () => {
    // EPH FINDINGS Q3 (proven; runs 20261031T162343Z..162614Z): the root rises 1.7 -> 10.0 over about 0.35 s after the
    // reversed Crouch -> Prone is cut, a blend into the run clip; EPH round 4 (runs 20261031T170731Z..171148Z, every stick
    // case): the first 12 guest frames follow 2(k/12)^2, then 1 - 2(1 - k/12)^2 -- a 0.400 s quadratic ease-in-out, which
    // is `blendWeight` over FUN_00287620's 0.4. The mover cuts on the push's tick (`Walker.stanceCut`); the animator's new
    // play fades from the pose on screen over the run's BlendTime, none on the disc: 0.4.
    const N = 33;
    const clips = [pose('seal_prone', 10, 0, 1.7), pose(SEAL_ANIMS.crouchToProne, N, 0, keys(N, (i) => 5.5 - (3.8 * i) / (N - 1))),
      ...[SEAL_ANIMS.strafeRight, SEAL_ANIMS.strafeRightFast, SEAL_ANIMS.runRight].map((n) =>
        clip(n, 18, [{ name: 'skel_root', t: keys(18, (i) => [0.5 + (55 / 30) * i, 10, 20]), q: [Q_ID] }]))];
    const table = new Map<string, MotionEntry>([
      ['seal_prone', entry({ looped: true, playback: 3, maxVelocity: -0.1 })], [SEAL_ANIMS.crouchToProne, once(0.9)],
      [SEAL_ANIMS.strafeRight, cycle(6.5, 0, 2.8)], [SEAL_ANIMS.strafeRightFast, cycle(6.5, 1, 5)], [SEAL_ANIMS.runRight, cycle(6.5, 3, 6.5)],
    ]);
    const anim = new Animator(skeleton(), clips, table);
    const prone: MoverSnapshot = { ...REST, stance: 'prone' };
    for (let i = 0; i < 60; i++) anim.step(1 / 60, prone);
    expect(anim.rootY()).toBeCloseTo(1.7, 5);
    const run: MoverSnapshot = { ...REST, stance: 'crouch', vx: 0.963 * 65, ground: { state: 'stand', forward: 0, right: 0.963, cls: 0 } };
    anim.step(1 / 60, run);
    const t = 0.35;
    for (let i = 0; i < Math.round(t * 60); i++) anim.step(1 / 60, run);   // the start's step fades from 0: t after these
    expect(anim.rootY()!).toBeCloseTo(1.7 + (10 - 1.7) * blendWeight(t / BLEND_TIME_DEFAULT), 1);
    expect(anim.rootY()!).toBeGreaterThan(9.5);
    for (let i = 0; i < 6; i++) anim.step(1 / 60, run);
    expect(anim.rootY()!).toBeCloseTo(10, 5);
  });

  it('is continuous across a switch: no step turns a part further than the blend allows, and it arrives', () => {
    const { clips, table } = jumpKit();
    const sk = skeleton();
    const anim = new Animator(sk, clips, table);
    anim.step(1 / 60, REST);
    const angle = (): number => 2 * Math.acos(Math.min(1, Math.abs(quatOfMatrix(sk.local[1]!)[3])));
    let last = angle(), worst = 0;
    anim.step(1 / 60, acting('landHard'));                              // 0 to 60 degrees over 0.4 s
    for (let i = 0; i < 40; i++) {
      const now = angle();
      worst = Math.max(worst, Math.abs(now - last));
      last = now;
      anim.step(1 / 60, acting('landHard'));
    }
    expect(worst * 180 / Math.PI).toBeLessThan(5.1);                    // 60 over 0.4 s at the ease's steepest
    expect(anim.stats().blend).toBe(1);
    expect(last * 180 / Math.PI).toBeCloseTo(60, 3);
  });
});

describe('the events for the page (the audio): callbacks, footfalls, plays', () => {
  it('fires a zanim_callback as the phase crosses it -- seal_jump\'s jump_whoosh at 0.4 of its phase, 0.418 s in', () => {
    const clips = [pose('seal_stand', 16, 0), pose(SEAL_ANIMS.jump, 20, 20)];
    const table = new Map<string, MotionEntry>([[SEAL_ANIMS.jump, once(1.1, { callbacks: [{ name: 'jump_whoosh', time: 0.4 }] })]]);
    const anim = new Animator(skeleton(), clips, table);
    const seen: { e: AnimEvent; t: number }[] = [];
    let t = 0;
    anim.onEvent((e) => seen.push({ e, t }));
    anim.step(1 / 60, REST);
    for (let i = 0; i < 90; i++) { t += 1 / 60; anim.step(1 / 60, acting('jump')); }
    const whoosh = seen.filter((s) => s.e.kind === 'callback');
    expect(whoosh).toHaveLength(1);
    expect(whoosh[0]!.e).toEqual({ kind: 'callback', clip: SEAL_ANIMS.jump, name: 'jump_whoosh', phase: 0.4 });
    expect(whoosh[0]!.t).toBeCloseTo(0.4 * 1.1 * 0.95, 1);
    expect(seen.filter((s) => s.e.kind === 'play').map((s) => (s.e as { play: string }).play)).toEqual(['idle:stand', 'jump#1']);
  });

  it('a time over 1 is seconds, turned into the phase by playback x (n - 1) / n (FUN_00287620)', () => {
    const anim = new Animator(skeleton(), [pose('x', 21, 0)], new Map([['x', once(4, { callbacks: [{ name: 'late', time: 2 }] })]]));
    expect(anim.motion('x')!.callbacks).toEqual([{ name: 'late', phase: 2 / (4 * 20 / 21) }]);
  });

  it('a moving locomotion play steps left as its phase enters (0, 0.5), right as it enters (0.5, 1) (FUN_005a3570)', () => {
    const { clips, table } = standingKit();
    const anim = new Animator(skeleton(), clips, table);
    const feet: string[] = [];
    anim.onEvent((e) => { if (e.kind === 'footfall') feet.push(e.foot); });
    for (let i = 0; i < 120; i++) anim.step(1 / 60, running(1));        // 1.78 cycles a second for 2 s
    expect(feet.length).toBeGreaterThanOrEqual(6);
    expect(feet.length).toBeLessThanOrEqual(8);
    feet.forEach((f, i) => expect(f).toBe(i % 2 === 0 ? 'left' : 'right'));
    feet.length = 0;
    for (let i = 0; i < 60; i++) anim.step(1 / 60, REST);
    for (let i = 0; i < 60; i++) anim.step(1 / 60, acting('fall'));
    expect(feet).toEqual([]);                                           // not standing still, not in the air
  });

  it('crosses: forward, wrapped, backwards, and never on no step (FUN_0028c7c0)', () => {
    expect(crosses(0.4, 0.3, 0.5, false, false)).toBe(true);
    expect(crosses(0.4, 0.4, 0.5, false, false)).toBe(true);
    expect(crosses(0.4, 0.5, 0.6, false, false)).toBe(false);
    expect(crosses(0.1, 0.9, 0.2, true, false)).toBe(true);            // a loop wrapping past its start
    expect(crosses(0.95, 0.9, 0.2, true, false)).toBe(false);          // the game's own rule: from - 1 <= t <= to
    expect(crosses(0.4, 0.5, 0.3, false, true)).toBe(true);
    expect(crosses(0.4, 0.4, 0.4, false, false)).toBe(false);
  });
});

// ---- the cross-fade's weight and the pose -----------------------------------------------------------------------------

describe('the cross-fade (research 17 §4.2\'s weight; MOTION_BLEND\'s shorter arc)', () => {
  it('eases in and out as the game\'s node blend was traced: 0.020, 0.080, 0.180, 0.320, 0.500 at tenths', () => {
    expect([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1].map((s) => Number(blendWeight(s).toFixed(3))))
      .toEqual([0, 0.02, 0.08, 0.18, 0.32, 0.5, 0.68, 0.82, 1]);
    expect(blendWeight(-1)).toBe(0);
    expect(blendWeight(2)).toBe(1);
  });

  it('blends on the shorter arc: a key stored as -q does not spin the part the long way round', () => {
    const sk = skeleton();
    const q = qx(10);
    const a = clip('seal_stand', 10, [{ name: 'lthigh', t: [[1, -1, 0]], q: [q] }]);
    const b = clip('seal_crouch', 10, [{ name: 'lthigh', t: [[1, -1, 0]], q: [q.map((v) => -v)] }]);
    const anim = new Animator(sk, [a, b], null);
    anim.step(1 / 60, REST);
    anim.step(1 / 60, { ...REST, stance: 'crouch' });
    for (let i = 0; i < 6; i++) {
      anim.step(1 / 60, { ...REST, stance: 'crouch' });
      const turn = 2 * Math.acos(Math.min(1, Math.abs(quatOfMatrix(sk.local[1]!)[3])));
      expect(turn * 180 / Math.PI).toBeCloseTo(10, 3);
    }
  });
});

describe('the pose into Skeleton.setLocal (W2.2b)', () => {
  it('writes each part the skeleton has, pins the root over the feet (the mover owns the position), keeps its height', () => {
    const sk = skeleton();
    const w = walker('seal_walk', 20, 30, 0, 10.25);
    writePose(sk, sampleClip(w, 5 / 30).parts);
    expect(Array.from(sk.local[0]!.subarray(12, 15))).toEqual([0, 10.25, 0.5]);
    expectMatrix(sk.local[1]!, partMatrix(qx(0), [1, -1, 0]));
    expectMatrix(sk.local[3]!, sk.parts[3]!.bindLocal);                              // `body`: no track, the bind
    expect(sk.world[1]![13]).toBeCloseTo(10.25 - 1, 5);
  });

  it('decomposes a bind matrix to the quaternion partMatrix builds it from', () => {
    for (const q of [qx(0), qx(35), qx(-170), [0.5, 0.5, 0.5, 0.5] as [number, number, number, number]]) {
      const back = quatOfMatrix(partMatrix(q, [1, 2, 3]));
      const sign = Math.sign(back[3] || 1) * Math.sign(q[3] || 1);
      back.forEach((v, i) => expect(v * sign).toBeCloseTo(q[i]!, 6));
    }
  });

  it('a blend of two nodes is their weighted pose: half the run and half the running strafe splits the thigh', () => {
    const sk = skeleton();
    const a = pose('seal_run', 10, 0), b = pose('seal_run_90r', 10, 40);
    const table = new Map<string, MotionEntry>([['seal_run', cycle(6.5, 4.01, 6.5)], ['seal_run_90r', cycle(6.5, 3, 6.5)]]);
    const anim = new Animator(sk, [a, b], table);
    anim.step(1 / 60, running(Math.SQRT1_2, Math.SQRT1_2));
    const turn = 2 * Math.acos(Math.min(1, Math.abs(quatOfMatrix(sk.local[1]!)[3])));
    expect(turn * 180 / Math.PI).toBeCloseTo(20, 1);
  });

  it('layers the pistol\'s upper-body clip over the legs when the weapon is the pistol; the rifle takes none', () => {
    const base = pose('seal_stand', 16, 30);
    const upper = clip('seal_p_stand', 16, [{ name: 'lbicep', t: [[2, 6, 0]], q: [qx(60)] }]);   // no root, no legs
    const rifle = skeleton();
    new Animator(rifle, [base, upper], null).step(1 / 60, REST);
    expectMatrix(rifle.local[2]!, partMatrix(qx(0), [2, 6, 0]));
    const pistol = skeleton();
    const anim = new Animator(pistol, [base, upper], null, { weapon: 'pistol' });
    anim.step(1 / 60, REST);
    expect(anim.stats().layer).toBe('seal_p_stand');
    expectMatrix(pistol.local[2]!, partMatrix(qx(60), [2, 6, 0]));
    expectMatrix(pistol.local[1]!, partMatrix(qx(30), [1, -1, 0]));                 // the legs stay the base's
    expect(layerName('seal_run')).toBe('seal_p_run');
  });

  it('asks the worker for every clip the plays name, and each one\'s pistol version', () => {
    for (const n of MOTION_CLIPS) {
      expect(PLAY_CLIPS).toContain(n);
      expect(PLAY_CLIPS).toContain(layerName(n));
    }
    for (const n of Object.values(SEAL_ANIMS)) expect(PLAY_CLIPS).toContain(n);
  });

  it("a pose layer blends over the play by its weight and sees the main clip, its key and its phase (the weapon's seam)", () => {
    const sk = skeleton();
    const anim = new Animator(sk, [pose('seal_stand', 16, 0)], null);
    const seen: LayerContext[] = [];
    let weight = 1;
    anim.addPoseLayer({ sample: (c) => { seen.push(c); return { parts: [{ index: 0, name: 'lthigh', rotation: qx(40), translation: [1, -1, 0] }], weight }; } });
    anim.step(1 / 60, REST);
    expectMatrix(sk.local[1]!, partMatrix(qx(40), [1, -1, 0]));
    expect(seen[0]!.clip.name).toBe('seal_stand');
    expect(seen[0]!.frame).toBeCloseTo(seen[0]!.phase * 16, 9);
    weight = 0.5;
    anim.step(1 / 60, REST);
    expectMatrix(sk.local[1]!, partMatrix(qx(20), [1, -1, 0]));
  });

  it("the held item's node: a clip's weapon track moves the rifle when the clip has no rifle track", () => {
    const part = (index: number, name: string, parent: number): SkeletonPart => ({
      index, name, parent, bindLocal: partMatrix(Q_ID, [0, 0, 0]), bbox: new Float32Array(6), type: 0, flags: 0,
    });
    const sk = new Skeleton('t', IDENTITY, [part(0, 'skel_root', -1), part(1, HELD_PART, 0)]);
    expect(partIndex(sk, [{ name: HELD_ALIAS }], HELD_ALIAS)).toBe(1);
    expect(partIndex(sk, [{ name: HELD_ALIAS }, { name: HELD_PART }], HELD_ALIAS)).toBe(-1);
    expect(partIndex(sk, [], 'skel_root')).toBe(0);
  });

  it("names the locomotion cycles (the footfalls' clips), a pistol version as its rifle clip", () => {
    for (const n of ['seal_walk_alert', 'seal_run', 'seal_run_90l', 'seal_crouchwalk_bw', 'seal_prone_crawl', 'seal_p_run']) expect(isCycle(n), n).toBe(true);
    for (const n of ['seal_stand', 'seal_jump', 'seal_crouch', 'seal_walk']) expect(isCycle(n), n).toBe(false);
  });
});

// ---- the owner's pack on Frostfire's SEAL -----------------------------------------------------------------------------

const RUN = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'), 'RUN');
const PACK = resolve(RUN, 'MOTION_P.ZAR'), READERC = resolve(RUN, 'READERC.ZAR');
const MP2 = fixture('RUN/MP2.ZDB');
const noData = !existsSync(PACK) || !existsSync(READERC) || MP2 === null;

describe.skipIf(noData)(`seal_A_scuba on MOTION_P.ZAR and motion.rdr${noData ? ' (MOTION_P.ZAR, READERC.ZAR or MP2 absent)' : ''}`, () => {
  const load = (): { sk: Skeleton; mesh: SkinnedMeshData; clips: MotionClip[]; table: Map<string, MotionEntry> } => {
    const toc = parseZdb(MP2!);
    const sk = readSkeleton(Zar.parse(zdbMember(MP2!, toc, 'CLIB_GEO.ZED')), 'seal_A_scuba');
    const mesh = readMeshLibrary(Zar.parse(zdbMember(MP2!, toc, 'CLIB_MDL.ZED')), ['seal_A_scuba'])[0]!.mesh!;
    return {
      sk, mesh, clips: clipsFromPack(new Uint8Array(readFileSync(PACK)), PLAY_CLIPS),
      table: motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!,
    };
  };
  /** The lowest point of the skinned mesh in the skeleton's current pose, every influence summed (`skinSubMesh`). */
  const lowest = (sk: Skeleton, mesh: SkinnedMeshData): number => {
    let y = Infinity;
    for (const sub of mesh.subMeshes) {
      const { positions } = skinSubMesh(sub, sk.palette());
      for (let i = 1; i < positions.length; i += 3) y = Math.min(y, positions[i]!);
    }
    return y;
  };

  it('finds every clip the plays name in the pack', () => {
    const { clips } = load();
    const names = clips.map((c) => c.name);
    for (const n of MOTION_CLIPS) expect(names, n).toContain(n);
  });

  it('full ahead plays seal_run at the node speed research 25 traced in memory, 1.1265 (65 / 57.7)', () => {
    const { sk, clips, table } = load();
    const anim = new Animator(sk, clips, table);
    anim.step(1 / 60, running(1));
    const [run] = anim.stats().nodes;
    expect(run).toMatchObject({ clip: 'seal_run', weight: 1 });
    expect(run!.speed).toBeCloseTo(1.1265, 2);
  });

  it('driven at 60 Hz through a walk, a run, a strafe, a stop and a crouch, the soles stay within a unit of the floor', () => {
    const { sk, mesh, clips, table } = load();
    const anim = new Animator(sk, clips, table, { random: () => 0 });
    const worst: Record<string, number> = {};
    const run = (steps: number, mover: MoverSnapshot): void => {
      for (let i = 0; i < steps; i++) {
        anim.step(1 / 60, mover);
        if (anim.stats().blend < 1) continue;          // a settled play; the cross-fade is not the floor's test
        const y = Math.abs(lowest(sk, mesh));
        const c = anim.stats().clip;
        worst[c] = Math.max(worst[c] ?? 0, y);
      }
    };
    run(90, running(0.3));
    run(90, running(1));
    run(90, running(0, 1));
    run(60, REST);
    run(60, { ...REST, stance: 'crouch' });
    expect(Object.keys(worst).sort()).toEqual(['seal_crouch', 'seal_run', 'seal_run_90r', 'seal_stand', 'seal_walk_alert']);
    for (const [c, y] of Object.entries(worst)) expect(y, c).toBeLessThan(1);
  });
});

// ---- the engine's node blend, the turn in place, the aim's twist and the run's bank ------------------------------------

/** A skeleton with the two spine nodes FUN_005aca70 turns: skel_root -> spinelo -> spinehi, bind at the identity. */
function spine(): Skeleton {
  const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  return new Skeleton('spine', IDENTITY, [part(0, 'skel_root', -1, [0, 11, 0]), part(1, 'spinelo', 0, [0, 1, 0]), part(2, 'spinehi', 1, [0, 3, 0])]);
}
const still = (name: string): MotionClip => clip(name, 10, [
  { name: 'skel_root', t: [[0, 11, 0]], q: [Q_ID] }, { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
]);
/** The angle of a unit quaternion, radians. */
const angleOf = (q: readonly number[]): number => 2 * Math.acos(Math.min(1, Math.abs(q[3]!)));

describe('the engine\'s node blend (FUN_00577000, FUN_00576e30, FUN_00306ae0)', () => {
  it('the slerp: the shorter arc, a normalised lerp over a dot of 0.95, the true slerp under it', () => {
    const a = qx(0), b = qx(10);                                    // dot 0.996: the lerp
    const mid = slerp(a, b, 0.5);
    expect(angleOf(mid) * 180 / Math.PI).toBeCloseTo(5, 3);
    const c = qx(90);                                               // dot 0.707: the slerp
    expect(angleOf(slerp(a, c, 0.25)) * 180 / Math.PI).toBeCloseTo(22.5, 6);
    expect(slerp(a, c.map((v) => -v), 0.5)[3]).toBeGreaterThan(0.9);   // -q is the same turn
  });

  it('merges the lateral clips first, then the others, then the two results, each pair by wb / (wa + wb)', () => {
    const f1 = qx(0), f2 = qx(20), l1 = qx(60), l2 = qx(80);
    const got = mergeRotations([
      { q: f1, w: 0.3, lateral: false }, { q: f2, w: 0.3, lateral: false }, { q: l1, w: 0.2, lateral: true }, { q: l2, w: 0.2, lateral: true },
    ])!;
    const lat = slerp(l1, l2, 0.5), fwd = slerp(f1, f2, 0.5);
    const want = slerp(lat, fwd, 0.6 / 1.0);                        // the lateral pair survives first in the list's order
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 9));
    expect(mergeRotations([{ q: null, w: 0.5, lateral: false }, { q: f2, w: 0.5, lateral: false }])).toEqual(f2);
  });
});

describe('the turn in place (FUN_00586050, FUN_00583960)', () => {
  it('the step\'s speed: |turn / turn_maxrate| x the stance\'s share, capped; backwards turning left', () => {
    expect(turnStepSpeed(-2.236, 'stand')).toBeCloseTo(0.6, 9);    // full right: 1.118 x 0.6 capped at 0.6
    expect(turnStepSpeed(2.236, 'stand')).toBeCloseTo(-0.6, 9);    // full left: backwards
    expect(turnStepSpeed(-1, 'stand')).toBeCloseTo(0.3, 9);
    expect(turnStepSpeed(-1, 'crouch')).toBeCloseTo(0.15, 9);
    expect(turnStepSpeed(-4, 'prone')).toBeCloseTo(0.35, 9);
  });

  it('standing still and turning plays seal_step, crouched seal_crouch_step, prone seal_prone_turn, at that speed', () => {
    const clips = ['seal_stand', 'seal_step', 'seal_crouch', 'seal_crouch_step', 'seal_prone', 'seal_prone_turn'].map((n) => pose(n, 20, 0));
    const table = new Map<string, MotionEntry>([
      ['seal_step', entry({ looped: true, playback: 0.65, maxVelocity: -2, blendTime: 0.9 })],
      ['seal_crouch_step', entry({ looped: true, playback: 0.4, maxVelocity: -2, blendTime: 0.9 })],
    ]);
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, { ...REST, turnRate: -2.236 });
    expect(anim.stats()).toMatchObject({ clip: 'seal_step', play: 'turn:stand' });
    expect(anim.stats().nodes[0]!.speed).toBeCloseTo(0.6, 9);
    expect(anim.stats().rate).toBeCloseTo((0.6 / 0.65) * 20, 6);   // 0.6 of a cycle per 0.65 s
    anim.step(1 / 60, { ...REST, turnRate: -1 });
    expect(anim.stats().nodes[0]!.speed).toBeCloseTo(0.3, 9);       // the speed follows the turn, no new play
    anim.step(1 / 60, { ...REST, stance: 'crouch', turnRate: 1 });
    expect(anim.stats()).toMatchObject({ clip: 'seal_crouch_step', play: 'turn:crouch' });
    expect(anim.stats().nodes[0]!.speed).toBeCloseTo(-0.15, 9);
    anim.step(1 / 60, { ...REST, stance: 'prone', turnRate: 1 });
    expect(anim.stats().clip).toBe('seal_prone_turn');
    anim.step(1 / 60, { ...REST, turnRate: 0 });
    expect(anim.stats().clip).toBe('seal_stand');
  });
});

describe('the aim\'s twist and the run\'s bank on the spine (FUN_005aca70, FUN_0057a330)', () => {
  const at = (sk: Skeleton, name: string): number[] => quatOfMatrix(sk.local[sk.indexOf(name)]!);

  it('the upper body takes the pitch: spinelo 2 x 0.1 x sin, spinehi 2 x 0.4 x sin, about x, upward for up', () => {
    const sk = spine();
    const anim = new Animator(sk, [still('seal_stand')], null);
    anim.step(1 / 60, { ...REST, pitch: 30 });
    const lo = at(sk, 'spinelo'), hi = at(sk, 'spinehi');
    expect(angleOf(lo)).toBeCloseTo(2 * TWIST_SHARE.spinelo * Math.sin(Math.PI / 6), 5);
    expect(angleOf(hi)).toBeCloseTo(2 * TWIST_SHARE.spinehi * Math.sin(Math.PI / 6), 5);
    // the chest's forward (-z) turned up: y > 0
    const fwd = qrot(qmul(lo, hi), [0, 0, -1]);
    expect(fwd[1]).toBeGreaterThan(0.4);
    expect(anim.stats().twist).toBeCloseTo(2 * 0.5 * 0.5, 5);
  });

  it('none on a NoPitchtwist clip, none prone, none with no pitch given', () => {
    const table = new Map<string, MotionEntry>([['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, noPitchtwist: true })]]);
    const a = spine();
    new Animator(a, [still('seal_stand')], table).step(1 / 60, { ...REST, pitch: 30 });
    expect(angleOf(at(a, 'spinehi'))).toBeCloseTo(0, 9);
    const b = spine();
    new Animator(b, [still('seal_prone')], null).step(1 / 60, { ...REST, stance: 'prone', pitch: 30 });
    expect(angleOf(at(b, 'spinehi'))).toBeCloseTo(0, 9);
  });

  it('the bank: -0.000375 x the turn x the local z speed about spinelo\'s parent z -- 3.1 degrees into a full turn at 65', () => {
    const sk = spine();
    const anim = new Animator(sk, [still('seal_stand'), still('seal_run')], new Map([['seal_run', cycle(6.5, 4.01, 6.5)]]));
    anim.step(1 / 60, { ...running(1), turnRate: 2.236, pitch: 0 });
    const want = 2.236 * -65 * BANK_FACTOR;
    expect(want * 180 / Math.PI).toBeCloseTo(3.1, 1);
    expect(anim.stats().bank).toBeCloseTo(want, 6);
    const lo = at(sk, 'spinelo');
    expect(lo[2]).toBeCloseTo(Math.sin(want / 2), 5);               // about z: a left turn leans left (+z)
    anim.step(1 / 60, { ...running(1), turnRate: 2.236, airborne: true });
    expect(anim.stats().bank).toBe(0);
  });
});

// ---- TRAVERSAL SEAM: a traversal move's clip (web research 86) ----------------------------------------------------

describe('a traversal move\'s clip in place of the mover\'s play (web research 86)', () => {
  it('plays the move\'s clip at the move\'s key, the root at the move\'s height, and fires its callbacks as it passes them', () => {
    const { clips, table } = standingKit();
    const rung = clip('seal_climbladder', 16, [{ name: 'skel_root', t: keys(16, (i) => [0, 15.6 + 0.625 * i, -7.6]), q: [Q_ID] }]);
    table.set('seal_climbladder', entry({ looped: true, playback: 3, maxVelocity: 1.35, callbacks: [{ name: 'ladder_rung', time: 0.01 }, { name: 'ladder_rung', time: 0.5 }] }));
    const anim = new Animator(skeleton(), [...clips, rung], table);
    const heard: string[] = [];
    anim.onEvent((e) => { if (e.kind === 'callback') heard.push(e.name); });
    anim.step(1 / 60, REST);
    expect(anim.stats().clip).toBe('seal_stand');
    const at = (frame: number): MoverSnapshot => ({ ...REST, traversal: { clip: 'seal_climbladder', frame, loop: true, rootY: 15.6 } });
    anim.step(1 / 60, at(0));
    expect(anim.stats().play).toBe('trav:seal_climbladder');
    expect(anim.stats().frame).toBeCloseTo(0, 6);
    for (let f = 0.7; f < 9; f += 0.7) anim.step(1 / 60, at(f));
    anim.step(1 / 60, at(9));
    expect(anim.stats().frame).toBeCloseTo(9, 6);
    expect(heard).toEqual(['ladder_rung', 'ladder_rung']);           // 0.01 and 0.5 of the cycle, each crossed once
    for (let i = 0; i < 60; i++) anim.step(1 / 60, at(9));           // the cross-fade settles
    expect(anim.rootY()).toBeCloseTo(15.6, 6);                       // the move's root, not the clip's 15.6 + 0.625 x 9
    anim.step(1 / 60, REST);
    expect(anim.stats().play).toBe('idle:stand');                    // the move over: the mover's own play again
  });
});

describe('the translations the engine takes from a clip (FUN_005777d0) and the zeroed root (FUN_0057a330)', () => {
  it('the six parts and the props take the clip\'s translation; the other body parts keep the skeleton\'s own', () => {
    expect([...SAMPLED_TRANSLATIONS].sort()).toEqual(['hips', 'lbicep', 'lshoulder_wgt', 'rbicep', 'rshoulder_wgt', 'skel_root']);
    expect(BODY_PARTS.has('rifle')).toBe(false);
    expect(BODY_PARTS.size).toBe(26);
    const sk = skeleton();                                          // skel_root, lthigh (body), lbicep (sampled), body
    const moved = clip('seal_stand', 10, [
      { name: 'skel_root', t: [[3, 11, 4]], q: [Q_ID] }, { name: 'lthigh', t: [[5, -5, 5]], q: [Q_ID] },
      { name: 'lbicep', t: [[7, 7, 7]], q: [Q_ID] },
    ]);
    new Animator(sk, [moved], null).step(1 / 60, REST);
    expect(Array.from(sk.local[0]!.subarray(12, 15))).toEqual([0, 11, 0]);   // the root: x and z zeroed, the clip's y
    expect(Array.from(sk.local[1]!.subarray(12, 15))).toEqual([1, -1, 0]);   // lthigh: the bind's
    expect(Array.from(sk.local[2]!.subarray(12, 15))).toEqual([7, 7, 7]);    // lbicep: the clip's
  });
});

/**
 * PB-2b (issue #81; research 77 §10, research 215 §7.3; reading, pending review): the pose writes a node only from a clip
 * that tracks it. `FUN_005777d0` (D:L437177-437295) marks every node of a layer unwritten (`+0x0c` = -1, D:L437201-437230)
 * and samples only a node the body has and the clip has a track for (D:L437257-437291); the pop `FUN_00577700`
 * (D:L437136-437174) writes the skeleton's locals from the entries marked written alone; the merge (`FUN_00577000`) and
 * the lay-over (`FUN_00576bb0`) carry only written entries. Nothing resets the locals each frame -- the bind is laid once,
 * at the body's build (`FUN_0028e480`, D:L419660) -- and the cross-fade (`FUN_0028e0d0`, D:L135285-135306) mixes a node
 * with its own snapshot. So a node the playing clip has no track for keeps its last local: every clip, every node.
 */
describe('PB-2b: a node the playing clip has no track for keeps its last local (FUN_005777d0, FUN_00577700)', () => {
  const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  /** `skeleton()`'s four and a held `rifle` under the root, its bind the identity (`./heldItem` `heldSkeleton`'s). */
  const withRifle = (): Skeleton => new Skeleton('test', IDENTITY, [
    part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0]), part(2, 'lbicep', 0, [2, 6, 0]),
    part(3, 'body', -1, [0, 0, 0]), part(4, 'rifle', 0, [0, 0, 0]),
  ]);
  const deg = (m: ArrayLike<number>): number => angleOf(quatOfMatrix(m)) * 180 / Math.PI;

  it('across a traversal play change (the turret: the mount clip, then the hold with no prop track): the thigh and the rifle where the mount clip left them, not the bind; a node no clip tracked keeps its bind', () => {
    const sk = withRifle();
    const mount = clip('seal_stand2turret', 26, [
      { name: 'skel_root', t: [[0.5, 11, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(30)] },
      { name: 'rifle', t: [[3, 4, 5]], q: [qx(40)] },
    ]);
    const hold = clip('seal_turret_poses', 3, [{ name: 'skel_root', t: [[0.5, 10, 20]], q: [Q_ID] }, { name: 'lbicep', t: [[2, 6, 0]], q: [qx(10)] }]);
    const anim = new Animator(sk, [pose('seal_stand', 16, 0), mount, hold], new Map([
      ['seal_stand2turret', once(0.3)], ['seal_turret_poses', entry({ looped: true, playback: 1 })],
    ]));
    const at = (name: string, frame: number): MoverSnapshot => ({ ...REST, traversal: { clip: name, frame, loop: false, rootY: null } });
    for (let f = 0; f <= 25; f++) anim.step(1 / 60, at('seal_stand2turret', f));
    for (let f = 0; f < 60; f++) anim.step(1 / 60, at('seal_turret_poses', 1));     // the hold, its cross-fade run out
    expect(anim.stats()).toMatchObject({ clip: 'seal_turret_poses', blend: 1 });
    expect(deg(sk.local[1]!)).toBeCloseTo(30, 3);                                   // lthigh: the mount clip's last (the bind is 0)
    expect(deg(sk.local[2]!)).toBeCloseTo(10, 3);                                   // lbicep: the hold's own
    expectMatrix(anim.heldLocal('rifle')!, partMatrix(qx(40), [3, 4, 5]));          // the rifle: the mount clip's last, drawn
    expectMatrix(sk.local[4]!, partMatrix(qx(40), [3, 4, 5]));
    expectMatrix(sk.local[3]!, sk.parts[3]!.bindLocal);                             // `body`: never tracked, its bind
  });

  it("across the mover's own play change (a one-shot's end into the idle): the part the action's clip held stays there, the cross-fade easing nothing", () => {
    const sk = withRifle();
    const jump = clip(SEAL_ANIMS.jump, 20, [{ name: 'skel_root', t: [[0.5, 11, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(25)] }]);
    const stand = clip('seal_stand', 16, [{ name: 'skel_root', t: [[0.5, 11, 20]], q: [Q_ID] }]);
    const anim = new Animator(sk, [stand, jump], new Map([['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1 })], [SEAL_ANIMS.jump, once(0.5)]]));
    anim.step(1 / 60, REST);
    expect(deg(sk.local[1]!)).toBeCloseTo(0, 6);                                    // the stand first: the thigh never tracked, its bind
    for (let f = 0; f < 40; f++) anim.step(1 / 60, acting('jump'));
    expect(deg(sk.local[1]!)).toBeCloseTo(25, 3);
    anim.step(1 / 60, REST);
    expect(anim.stats().play).toBe('idle:stand');
    for (let f = 0; f < 60; f++) {
      anim.step(1 / 60, REST);
      expect(deg(sk.local[1]!), `frame ${f}`).toBeCloseTo(25, 3);                   // held: no ease toward the bind
    }
  });
});

describe('the pistol action set (FUN_0058c9e0, FUN_00576bb0)', () => {
  it('each node takes its own pistol version over the parts it carries, and setWeapon switches with a cross-fade', () => {
    const sk = skeleton();
    const run = walker('seal_run', 19, 57.7, 0), side = clip('seal_run_90r', 18, [{ name: 'skel_root', t: [[0.5, 10, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(10)] }]);
    const pRun = clip('seal_p_run', 19, [{ name: 'lbicep', t: [[2, 6, 0]], q: [qx(60)] }]);
    const pSide = clip('seal_p_run_90r', 18, [{ name: 'lbicep', t: [[2, 6, 0]], q: [qx(20)] }]);
    const table = new Map<string, MotionEntry>([['seal_run', cycle(6.5, 4.01, 6.5)], ['seal_run_90r', cycle(6.5, 3, 6.5, { lateral: true })]]);
    const anim = new Animator(sk, [run, side, pRun, pSide], table);
    anim.step(1 / 60, running(Math.SQRT1_2, Math.SQRT1_2));
    expect(angleOf(quatOfMatrix(sk.local[2]!))).toBeCloseTo(0, 6);             // the rifle: no pistol arms
    anim.setWeapon('pistol');
    anim.step(0, running(Math.SQRT1_2, Math.SQRT1_2));
    expect(anim.stats().blend).toBe(0);                                          // the cross-fade from the rifle's pose
    for (let i = 0; i < 40; i++) anim.step(1 / 60, running(Math.SQRT1_2, Math.SQRT1_2));
    // each node's arm its own pistol clip's, merged half and half: 40 degrees
    expect(angleOf(quatOfMatrix(sk.local[2]!)) * 180 / Math.PI).toBeCloseTo(40, 1);
    expect(anim.stats().layer).not.toBeNull();
  });
});

// LATER 504: under the launcher set the body's crouch is the set's own "Crouch" row, `seal_launcher` (`animset.rdr`
// "launcher anim set"; the raise pushes it, `FUN_005a6d30` D:L462105), not the Seal set's `seal_crouch`.
describe('the launcher set (LATER 504)', () => {
  it("a crouched body under the launcher set plays seal_launcher; off the set, seal_crouch", () => {
    const sk = skeleton();
    const anim = new Animator(sk, [pose('seal_crouch', 10, 0, 5.5), pose('seal_launcher', 10, 30, 5.5)], new Map());
    const thigh = (): number => angleOf(quatOfMatrix(sk.local[1]!)) * 180 / Math.PI;
    for (let i = 0; i < 40; i++) anim.step(1 / 60, { ...REST, stance: 'crouch' });
    expect(thigh()).toBeCloseTo(0, 3);
    anim.setLauncherSet(true);
    anim.step(0, { ...REST, stance: 'crouch' });
    expect(anim.stats().blend).toBe(0);                                          // the review's F3: a cross-fade, no snap
    for (let i = 0; i < 40; i++) anim.step(1 / 60, { ...REST, stance: 'crouch' });
    expect(thigh()).toBeCloseTo(30, 1);                                         // today: no setLauncherSet
    anim.setLauncherSet(false);
    for (let i = 0; i < 40; i++) anim.step(1 / 60, { ...REST, stance: 'crouch' });
    expect(thigh()).toBeCloseTo(0, 1);
  });
});

describe("the running jump through the animator: launch, then the run, never a frame of the stand (FUN_005af930, FUN_00589aa0)", () => {
  it('each frame of a flat running jump with the stick held plays the run, the launch, the run', () => {
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
    const owners: CollisionOwner[] = [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }];
    const w = new Walker(buildGrid(params, [], [], [poly], owners));
    w.place(0, 0, 300);
    w.state.yaw = 0;
    const clips = [
      pose('seal_stand', 10, 0), walker('seal_run', 19, 57.7, 0), pose('seal_runningjump_launch', 25, 30),
      pose('seal_runningjump_in_air', 14, 50), pose('seal_land_soft', 20, 10),
    ];
    const table = new Map<string, MotionEntry>([
      ['seal_stand', cycle(-1, 0, 0)], ['seal_run', cycle(6.5, 4.01, 6.5)], ['seal_runningjump_launch', once(2.4)],
      ['seal_runningjump_in_air', once(5)], ['seal_land_soft', once(0.7)],
    ]);
    const anim = new Animator(skeleton(), clips, table);
    const plays: string[] = [];
    const frame = (): void => {
      w.tick({ forward: 1, right: 0, boost: false });
      const s = w.state;
      anim.step(1 / 60, {
        vx: s.vx, vz: s.vz, vy: s.vy, yaw: s.yaw, airborne: w.airborne, crouched: false, stance: 'stand',
        landing: w.landing?.kind ?? null, jumps: 0, ground: { ...w.ground }, action: w.action && { ...w.action },
      });
      plays.push(`${anim.stats().play}:${anim.stats().clip}`);
    };
    for (let i = 0; i < 60; i++) frame();
    expect(w.jump()).toBe(true);
    while (w.airborne) frame();
    for (let i = 0; i < 10; i++) frame();
    const runs = plays.filter((x, i) => i === 0 || x !== plays[i - 1]).map((x) => x.replace(/#\d+/, ''));
    expect(runs.filter((x) => x.startsWith('loco') || x.startsWith('launch') || x.startsWith('idle'))).toEqual(
      expect.arrayContaining(['launch:seal_runningjump_launch']));
    const after = runs.slice(runs.indexOf('launch:seal_runningjump_launch'));
    expect(after).toEqual(['launch:seal_runningjump_launch', 'loco:stand:seal_run']);
    expect(plays.some((p) => p.includes('seal_runningjump_in_air'))).toBe(false);
  });
});

describe('the overlay play over the locomotion (the moving swap, FUN_0028d860(anim+0x60))', () => {
  /**
   * At 1.0 from its first key to its last (`FUN_00577ea0` 437456-437461), on the second channel's clock (the mover's
   * `seconds`); its blend in and out is the body's cross-fade from the pose on screen over `OVERLAY_BLEND`, at its start
   * and after its last key (`body+0x10d0`, research 150 §3.5) -- not a ramp of its own weight inside the clip (research
   * 211 G2).
   */
  it('lays its parts over the play at 1.0, the body cross-fading from the pose on screen over 0.4 s at both ends', () => {
    const sk = skeleton();
    const over = clip('seal_mv_rifle2pistol', 21, [{ name: 'lbicep', t: [[2, 6, 0]], q: [qx(50)] }]);
    const anim = new Animator(sk, [walker('seal_run', 19, 57.7, 0), over], new Map([['seal_run', cycle(6.5, 4.01, 6.5)], ['seal_mv_rifle2pistol', once(1.32)]]));
    const seconds = SWAP_OVERLAY_SECONDS;
    const deg = (): number => angleOf(quatOfMatrix(sk.local[2]!)) * 180 / Math.PI;
    for (let f = 0; f < 30; f++) anim.step(1 / 60, running(1));         // the run, settled
    expect(deg()).toBeCloseTo(0, 6);
    const ov = (t: number) => ({ ...running(1), overlay: { clip: 'seal_mv_rifle2pistol', t, seconds, reversed: false, serial: 1 } });
    anim.step(1 / 60, ov(0));
    expect(anim.stats().overlay).toBe('seal_mv_rifle2pistol');
    expect(anim.stats().clip).toBe('seal_run');
    expect(deg()).toBeCloseTo(0, 6);                                    // its first frame: the pose on screen, frozen
    expect(anim.stats().blend).toBe(0);
    let t = 0;
    for (; t < OVERLAY_BLEND + 0.05; t += 1 / 60) anim.step(1 / 60, ov(t));
    expect(deg()).toBeCloseTo(50, 3);                                   // in at 1.0 once the body's 0.4 s ran
    for (; t < seconds - 1 / 60; t += 1 / 60) anim.step(1 / 60, ov(t));
    expect(deg()).toBeCloseTo(50, 3);                                   // still at 1.0 at its last key
    anim.step(1 / 60, running(1));
    expect(anim.stats().overlay).toBeNull();
    expect(deg()).toBeCloseTo(50, 3);                                   // after it: the frozen last key, easing out
    for (let f = 0; f < 3; f++) anim.step(1 / 60, running(1));
    expect(deg()).toBeGreaterThan(45);
    expect(deg()).toBeLessThan(50);
    for (let f = 0; f < 24; f++) anim.step(1 / 60, running(1));
    expect(deg()).toBeCloseTo(0, 6);                                    // the run's own after 0.4 s
  });

  /**
   * The cut mid-swap (the review of C3-MOUNT, 2026-10-04): a standing swap the stick turns into the moving one changes
   * the play to the run and lays the moving swap over it, the body cross-fading from the pose on screen over 0.4 s
   * (research 150 §3). No re-parent runs there -- the rifle stays on `spinelo`, posed by both swap clips in that frame
   * (`SPINE_HELD_CLIPS`) -- so the rifle's node cross-fades with the body rather than snapping to the overlay's key.
   */
  it('cross-fades the rifle at a standing swap cut into the moving one: both clips hold it on spinelo', () => {
    const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
      index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
    });
    const sk = new Skeleton('test', IDENTITY, [
      part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0]), part(2, 'lbicep', 0, [2, 6, 0]),
      part(3, 'body', -1, [0, 0, 0]), part(4, 'rifle', 0, [0, 0, 0]),
    ]);
    const stand = clip(SEAL_ANIMS.swapStand, 32, [{ name: 'skel_root', t: [[0.5, 11, 20]], q: [Q_ID] }, { name: 'rifle', t: [[0, 0, 0]], q: [Q_ID] }]);
    const moving = clip(SEAL_ANIMS.swapMoving, 21, [{ name: 'rifle', t: [[4, 0, 0]], q: [Q_ID] }]);
    const anim = new Animator(sk, [pose('seal_stand', 16, 0), walker('seal_run', 19, 57.7, 0), stand, moving], new Map([
      ['seal_run', cycle(6.5, 4.01, 6.5)], [SEAL_ANIMS.swapStand, once(1.32)], [SEAL_ANIMS.swapMoving, once(1.32)],
    ]));
    const seconds = oneShotSeconds(1.32, 21);
    for (let f = 0; f < 25; f++) anim.step(1 / 60, acting('swapStand', 1, { t: f / 60, seconds: oneShotSeconds(1.32, 32) }));
    const before = anim.heldLocal('rifle')!;
    expect(before[12]).toBeCloseTo(0, 6);                                    // the standing swap's key, on spinelo
    anim.step(1 / 60, { ...running(1), overlay: { clip: SEAL_ANIMS.swapMoving, t: 0.35 * seconds, seconds, reversed: false } });
    const cut = anim.heldLocal('rifle')!;
    expect(Math.abs(cut[12]! - before[12]!), 'the rifle\'s step at the cut').toBeLessThan(0.5);
    for (let f = 0; f < 30; f++) anim.step(1 / 60, { ...running(1), overlay: { clip: SEAL_ANIMS.swapMoving, t: (0.35 + f / 60 / seconds) * seconds, seconds, reversed: false } });
    expect(anim.heldLocal('rifle')![12]).toBeCloseTo(4, 3);                  // in on the moving swap's key after 0.4 s
  });
});

// PAR-84 (research 230 section 5.2.10, build step 7): the own page draws the launcher's raise and still lower -- the
// original's console plays the push it made (`FUN_00588bc0` onto the stack) -- by the action's clip, `Rifle -> Launcher`
// / `Pistol -> Launcher` (`SEAL_ANIMS`), the still lower the same clip backwards (`FUN_0028c160`, the push's reverse).
describe("PAR-84: the own body plays the launcher's raise and still lower", () => {
  it("the animator's wanted play for the code: seal_rifle2launcher for rifleToLauncher, seal_pistol2launcher for pistolToLauncher, a new play at each start", () => {
    const clips = [pose('seal_stand', 16, 0), pose('seal_rifle2launcher', 35, 10), pose('seal_pistol2launcher', 24, 20)];
    const table = new Map<string, MotionEntry>([['seal_rifle2launcher', once(1.5)], ['seal_pistol2launcher', once(1.5)]]);
    const anim = new Animator(skeleton(), clips, table);
    const plays: { clip: string; play: string }[] = [];
    anim.onEvent((e) => { if (e.kind === 'play') plays.push({ clip: e.clip, play: e.play }); });
    anim.step(1 / 60, REST);
    for (let i = 0; i < 10; i++) anim.step(1 / 60, acting('rifleToLauncher', 3));
    for (let i = 0; i < 10; i++) anim.step(1 / 60, acting('pistolToLauncher', 4, { reversed: true }));
    expect(SEAL_ANIMS.rifleToLauncher).toBe('seal_rifle2launcher');
    expect(SEAL_ANIMS.pistolToLauncher).toBe('seal_pistol2launcher');
    expect(MOTION_CLIPS).toEqual(expect.arrayContaining(['seal_rifle2launcher', 'seal_pistol2launcher']));   // asked of the pack
    expect(plays).toEqual([
      { clip: 'seal_stand', play: 'idle:stand' },
      { clip: 'seal_rifle2launcher', play: 'rifleToLauncher#3' },
      { clip: 'seal_pistol2launcher', play: 'pistolToLauncher#4' },
    ]);
  });
});

// ---- PAR-85 (research 251 section 12.9): the legs under a running throw ---------------------------------------------

/**
 * PAR-85 (research 251 section 12.9, build rows B1-B5; reading, pending review): the throw is the action stack's top
 * play. The stack draws its top alone (`FUN_00577ea0` D:L437430-437455); the push snapshots the pose drawn and eases it
 * out over the throw's `BlendTime` (`FUN_0028dc90` D:L135215-135220, `FUN_00576860` D:L436624-436634, the 2s^2 ease
 * `FUN_002874f0`); the covered play keeps its phase, stopped (`FUN_0057a330` D:L438899-438901), and the pop eases the
 * throw's last drawn pose back onto it over its `BlendTime` (`FUN_0028da00` D:L135100-135107); a part the top's clip
 * lacks is not written and holds the pose drawn (`FUN_005777d0` D:L437202-437285, `FUN_00577700` D:L437155-437167);
 * every throw clip is `NoPitchtwist` (`FUN_00587a30`). Synthetic clips with the throws' `motion.rdr` fields; the real
 * mover (`Walker`) and the page's order: the ticks (the hold's end heard), the throw's clock, the body.
 */
describe('PAR-85: the throw on top of the stack, its legs and its blends (research 251 section 12.9)', () => {
  const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
  const STILL: WalkInput = { forward: 0, right: 0, boost: false };
  const THROW = THROW_ANIMS.standThrow.clip;
  const AIM = { pitch: 30, aimWeight: 1 } as const;
  /** skel_root -> lthigh, lbicep, spinelo -> spinehi; bind at the identity. */
  const body = (): Skeleton => {
    const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
      index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
    });
    return new Skeleton('test', IDENTITY, [
      part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0]), part(2, 'lbicep', 0, [2, 6, 0]),
      part(3, 'spinelo', 0, [0, 1, 0]), part(4, 'spinehi', 3, [0, 3, 0]),
    ]);
  };
  /** The standing throw: 28 keys over 1.6 s, the whole body, its thigh turning 2 degrees a key from 60. */
  const throwClip = clip(THROW, 28, [
    { name: 'skel_root', t: [[0.5, 10, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(28, (i) => qx(60 + 2 * i)) },
    { name: 'lbicep', t: [[2, 6, 0]], q: [qx(40)] }, { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
  ]);
  /** The pistol's: the upper body only (no root, no legs: research 85 s8.1). */
  const pistolClip = clip('seal_p_throwgrenade', 28, [
    { name: 'lbicep', t: [[2, 6, 0]], q: [qx(70)] }, { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
  ]);
  /** `motion.rdr`'s throws: one-shots, `BlendTime` none (the loader's 0.4), `NoPitchtwist`; the standing one's NoInterrupt 0.49. */
  const throwEntry = once(1.6, { noInterrupt: 0.49, noPitchtwist: true });
  /** The crouched throw: 19 keys over 1.1 s, `BlendTime` 0.2 (`motion.rdr`'s `seal_crouch_throwgrenade`), NoInterrupt 0.8. */
  const CROUCH_THROW = THROW_ANIMS.crouchThrow.clip;
  const crouchClip = clip(CROUCH_THROW, 19, [
    { name: 'skel_root', t: [[0.5, 7, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(19, (i) => qx(20 - 3 * i)) },
    { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
  ]);
  const crouchEntry = once(1.1, { blendTime: 0.2, noInterrupt: 0.8, noPitchtwist: true });
  /** The claymore's placing: 55 keys over 2.7 s, the whole body, its thigh turning 1 degree a key from 30 (`motion.rdr`: BlendTime none, NoInterrupt 0.9, NoPitchtwist). */
  const PLACE = PLACE_CLAYMORE_ANIM.clip;
  const placeClip = clip(PLACE, 55, [
    { name: 'skel_root', t: [[0.5, 8, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(55, (i) => qx(30 + i)) },
    { name: 'lbicep', t: [[2, 6, 0]], q: [qx(50)] }, { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
  ]);
  /** The pistol's placing as a synthetic upper-body clip (no root, no legs), to pin what a part the top lacks holds. */
  const pistolPlaceClip = clip('seal_p_place_claymore', 55, [
    { name: 'lbicep', t: [[2, 6, 0]], q: [qx(80)] }, { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
  ]);
  const placeEntry = once(2.7, { noInterrupt: 0.9, noPitchtwist: true });

  function rig() {
    const sk = body();
    const { clips, table } = standingKit();
    clips.push(throwClip, pistolClip, pose('seal_step', 20, 25), walker('seal_crouchwalk', 20, 30, 5), pose('seal_crouch', 16, 35), crouchClip, placeClip, pistolPlaceClip);
    // PB-2b: every clip tracks the spine at the bind, as the disc's whole-body clips do (the clip-pair survey, research
    // 215 s7.3: of the pack's 334 and the 7 victory clips only nine lack `spinelo` -- the moving overlays `seal_mv_*` and
    // `seal_p_mv_reload`, `seal_rifle2handsfree`, `guard_restrained_arms`): an untracked node keeps its last local
    // (`FUN_005777d0`, `FUN_00577700`), the twist laid in it included. *Was:* the locomotion's synthetic clips carried no
    // spine, which the bind stood in for.
    for (const c of clips) {
      for (const [name, t] of [['spinelo', [0, 1, 0]], ['spinehi', [0, 3, 0]]] as const) {
        if (!c.parts.some((p) => p.name === name)) {
          c.parts.push({ index: c.parts.length, name, flags: 0x0c | 0x10 | 0x20, translations: Float32Array.from(t), rotations: Float32Array.from(Q_ID) });
        }
      }
    }
    table.set(THROW, throwEntry).set('seal_p_throwgrenade', throwEntry).set(CROUCH_THROW, crouchEntry).set(PLACE, placeEntry).set('seal_p_place_claymore', placeEntry)
      .set('seal_step', entry({ looped: true, playback: 0.65, maxVelocity: -2, blendTime: 0.9 }))
      .set('seal_crouchwalk', cycle(3, 0, 3)).set('seal_crouch', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 }));
    const byName = new Map(clips.map((c) => [c.name, c]));
    const anim = new Animator(sk, clips, table);
    const throwPose = new ThrowPose(() => ({ clips: byName, table }));
    anim.addPoseLayer(throwPose.layer);
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
    const w = new Walker(buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }]));
    w.place(0, 0, 300);
    w.state.yaw = 0;
    w.onActionEnd((e) => { if (throwPoseEnds(e)) throwPose.cut(); });   // the page's wiring (`./matchThrow`)
    const at = (name: string): number[] => quatOfMatrix(sk.local[sk.indexOf(name)]!);
    const phase = (): number => anim.stats().frame / anim.stats().frames;
    /** One page frame: the mover's tick (its ends heard), the throw's clock, the body (`./main`'s order). */
    const frame = (input: WalkInput, extra: Partial<MoverSnapshot> = {}): void => {
      w.tick(input);
      throwPose.step(TICK);
      anim.step(TICK, { ...moverSnapshot(w, null, 0, extra.turnRate ?? 0), ...extra });
    };
    /** The release on the page: the mover's hold, then the throw's clip it carries (`./matchThrow` `throwStart`). */
    const push = (pistol = false): void => {
      expect(w.hold(THROW)).toBe(true);
      expect(throwPose.start(handAnim(THROW_ANIMS.standThrow, pistol), true)).toBe(true);
    };
    const key = (name: string, part: string, time: number, loop: boolean): number[] =>
      sampleClip(byName.get(name)!, time, { loop }).parts.find((p) => p.name === part)!.rotation;
    return { sk, anim, throwPose, w, at, phase, frame, push, key };
  }
  /** Two turns equal (q and -q the same), to the skeleton's float32 matrices. */
  const sameTurn = (a: readonly number[], b: readonly number[], label: string): void => {
    const sign = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]! < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) expect(a[i]!, `${label} [${i}]`).toBeCloseTo(sign * b[i]!, 6);
  };

  it("B1: the push eases the drawn run into the throw over its BlendTime (0.4), the cut eases the throw back onto the run over the run's 0.4", () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame(FORWARD);
    expect(r.anim.stats()).toMatchObject({ play: 'loco:stand', clip: 'seal_run' });
    const frozen = r.at('lthigh');
    r.push();
    let k = 0, held = frozen;
    while (r.w.holding && k < 200) {
      held = r.at('lthigh');
      r.frame(FORWARD);
      k++;
      if (!r.w.holding) break;
      // t after the push: the throw's key slerped toward the frozen run by E((B - t) / B)
      const t = k * TICK, throwKey = r.key(THROW, 'lthigh', (r.throwPose.stats().phase * 28) / 30, false);
      sameTurn(r.at('lthigh'), slerp(throwKey, frozen, blendWeight((0.4 - t) / 0.4)), `the push, ${k} frames on`);
    }
    expect(k).toBe(48);                                                  // the stick's cut (PAR-70)
    expect(r.throwPose.playing()).toBe(false);                           // popped on the cut's frame
    for (let j = 0; j < 30; j++) {
      if (j > 0) r.frame(FORWARD);
      // t after the cut: the throw's held pose slerped toward the live run by E((0.4 - t) / 0.4)
      const t = (j + 1) * TICK, run = r.key('seal_run', 'lthigh', (r.phase() * 19) / 30, true);
      expect(r.anim.stats().nodes.filter((n) => n.weight > 0).map((n) => n.clip)).toEqual(['seal_run']);
      sameTurn(r.at('lthigh'), slerp(run, held, blendWeight(Math.max(0, (0.4 - t) / 0.4))), `the cut, ${j} frames on`);
    }
  });

  it('B2: standing, no play change beneath the hold -- loco:stand throughout, its phase stopped until the cut and on from there; a turn under it plays no step', () => {
    const r = rig();
    for (let i = 0; i < 59; i++) r.frame(FORWARD);
    const p0 = r.phase();
    r.frame(FORWARD);
    const p = r.phase(), step = (((p - p0) % 1) + 1) % 1;                 // the run's phase a frame
    expect(step).toBeGreaterThan(0);
    r.push();
    let k = 0;
    while (r.w.holding && k < 200) {
      r.frame(FORWARD, k >= 10 && k < 30 ? { turnRate: 2 } : {});         // a turn under the hold
      k++;
      if (!r.w.holding) break;
      expect(r.anim.stats().play, `${k} frames on`).toBe('loco:stand');
      expect(r.phase(), `${k} frames on`).toBeCloseTo(p, 9);
      expect(r.anim.stats().rate).toBe(0);
    }
    expect(k).toBe(48);
    for (let j = 0; j < 20; j++) {
      if (j > 0) r.frame(FORWARD);
      expect(r.anim.stats().play).toBe('loco:stand');
      const want = (p + (j + 1) * step) % 1;                             // from where it stopped, a frame on at the cut
      expect(Math.abs(((r.phase() - want + 1.5) % 1) - 0.5), `${j} frames after the cut`).toBeLessThan(1e-9);
    }
  });

  it("B3: uncut, the throw stays on top at weight 1 past its clip's last key to the hold's own end (the 91st command), then pops onto the idle over seal_stand's 0.5, eased", () => {
    const r = rig();
    for (let i = 0; i < 30; i++) r.frame(STILL);
    expect(r.anim.stats().play).toBe('idle:stand');
    r.push();
    let k = 0, held = r.at('lthigh');
    while (r.w.holding && k < 200) {
      held = r.at('lthigh');
      r.frame(STILL);
      k++;
      if (!r.w.holding) break;
      expect(r.throwPose.stats().weight, `${k} frames on`).toBe(1);
      expect(r.throwPose.playing()).toBe(true);
    }
    expect(k).toBe(91);                                                  // the lagged clock's uncut end (PAR-70)
    expect(oneShotSeconds(1.6, 28)).toBeLessThan((k - 1) * TICK);       // the clip held its last key before it
    expect(r.throwPose.playing()).toBe(false);
    expect(r.anim.stats().play).toBe('idle:stand');                     // the idle kept beneath the throw
    for (let j = 0; j < 40; j++) {
      if (j > 0) r.frame(STILL);
      const t = (j + 1) * TICK, idle = r.key('seal_stand', 'lthigh', 0, true);
      sameTurn(r.at('lthigh'), slerp(idle, held, blendWeight(Math.max(0, (0.5 - t) / 0.5))), `the pop, ${j} frames on`);
    }
  });

  // NU-8b B2 (research 326 section 2.3): crouched, the play beneath is kept too. *Was* (PAR-85): "from a crouch-walk whose
  // play beneath turns to the idle", ending on `idle:crouch` (`THROW_LOW_STANCE_POP_READING` `'beneath'` crouched).
  it('B4: a part the pistol throw lacks holds the pose drawn at the push -- from a run, and from a crouch-walk whose play beneath is kept', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame(FORWARD);
    const thigh = r.at('lthigh');
    r.push(true);
    let k = 0;
    while (r.w.holding && k < 200) {
      r.frame(FORWARD);
      k++;
      if (r.w.holding) sameTurn(r.at('lthigh'), thigh, `from the run, ${k} frames on`);
    }
    expect(k).toBe(48);
    // Crouched (THROW_LOW_STANCE_POP_READING `'kept'`, NU-8b B2; *was* `'beneath'`, the play changing): the legs hold the push's pose.
    const c = rig();
    const crouchWalk: MoverSnapshot = { ...REST, stance: 'crouch', crouched: true, vz: -30, ground: { state: 'crouch', forward: 1, right: 0, cls: 1 } };
    for (let i = 0; i < 40; i++) { c.throwPose.step(TICK); c.anim.step(TICK, crouchWalk); }
    expect(c.anim.stats().play).toBe('loco:crouch:1');
    const legs = Array.from(c.sk.local[1]!), root = Array.from(c.sk.local[0]!);
    expect(c.throwPose.start(handAnim(THROW_ANIMS.standThrow, true), true)).toBe(true);
    const holding: MoverSnapshot = { ...REST, stance: 'crouch', crouched: true, hold: THROW };
    for (let i = 0; i < 60; i++) {
      c.throwPose.step(TICK);
      c.anim.step(TICK, holding);
      expectMatrix(c.sk.local[1]!, legs);
      expectMatrix(c.sk.local[0]!, root);
    }
    expect(c.anim.stats().play).toBe('loco:crouch:1');                   // kept beneath (NU-8b B2; *was* 'idle:crouch')
  });

  it("F4: the crouched throw pushed from a crouch-walk eases in over its own BlendTime, 0.2 (seal_crouch_throwgrenade); the covered play beneath starts no cross-fade", () => {
    const c = rig();
    const crouchWalk: MoverSnapshot = { ...REST, stance: 'crouch', crouched: true, vz: -30, ground: { state: 'crouch', forward: 1, right: 0, cls: 1 } };
    for (let i = 0; i < 40; i++) { c.throwPose.step(TICK); c.anim.step(TICK, crouchWalk); }
    expect(c.anim.stats().play).toBe('loco:crouch:1');
    const frozen = c.at('lthigh');
    expect(c.throwPose.start(THROW_ANIMS.crouchThrow, true)).toBe(true);
    const holding: MoverSnapshot = { ...REST, stance: 'crouch', crouched: true, hold: CROUCH_THROW };
    for (let k = 1; k <= 30; k++) {
      c.throwPose.step(TICK);
      c.anim.step(TICK, holding);
      const t = k * TICK, key = c.key(CROUCH_THROW, 'lthigh', (c.throwPose.stats().phase * 19) / 30, false);
      sameTurn(c.at('lthigh'), slerp(key, frozen, blendWeight(Math.max(0, (0.2 - t) / 0.2))), `${k} frames on`);
    }
    expect(c.anim.stats().play).toBe('loco:crouch:1');                   // kept beneath (NU-8b B2; *was* 'idle:crouch', the port's play beneath)
  });

  // NU-8b, research 326 section 6 B2 (D5; reading, pending review): the crouched and the prone pop hand the covered play
  // back at its kept phase, as the standing one does -- `FUN_00584c60` pushes the crouch play only when it is not the
  // play (D:L444151-444155) and the crouch run's set only when none of it is (D:L444180-444184), else re-weighs it;
  // `FUN_005845c0` -> `FUN_00583500` the crawl the same (D:L443415-443430), the prone rest branch the prone idle
  // (D:L443934-443963) -- so `THROW_LOW_STANCE_POP_READING` is `'kept'` in every stance (research 326 section 2.3).
  // *Was* `'beneath'` crouched and prone: the play under the hold turned to the idle and the pop landed on it.
  /** The real mover in a low stance at the stick `forward`, its play settled; the throw's clip and its prone entries added. */
  function lowRig(stance: 'crouch' | 'prone', forward: number) {
    const r = rig();
    r.w.stance = stance;
    const input: WalkInput = { forward, right: 0, boost: false };
    for (let i = 0; i < 59; i++) r.frame(input);
    const p0 = r.phase(), play = r.anim.stats().play;
    r.frame(input);
    const p = r.phase(), step = (((p - p0) % 1) + 1) % 1;
    return { ...r, input, play, p, step };
  }
  /** The prone kit: the prone idle, the crawl and the prone throw (27 keys over 1.6 s, `NoInterrupt` 0.9, `NoPitchtwist`). */
  const PRONE_THROW = THROW_ANIMS.proneThrow.clip;
  function proneRig() {
    const sk = body();
    const { clips, table } = standingKit();
    const proneClip = clip(PRONE_THROW, 27, [
      { name: 'skel_root', t: [[0.5, 2, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(27, (i) => qx(10 + i)) },
      { name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] },
    ]);
    clips.push(pose('seal_prone', 10, 15, 2.2), walker('seal_prone_crawl', 26, 10, 1, 2.3), proneClip);
    table.set('seal_prone', entry({ looped: true, playback: 6, maxVelocity: -0.1 })).set('seal_prone_crawl', cycle(1, 0, 1))
      .set(PRONE_THROW, once(1.6, { noInterrupt: 0.9, noPitchtwist: true }));
    const anim = new Animator(sk, clips, table);
    const throwPose = new ThrowPose(() => ({ clips: new Map(clips.map((c) => [c.name, c])), table }));
    anim.addPoseLayer(throwPose.layer);
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
    const w = new Walker(buildGrid(params, [], [], [poly], [{ modelName: poly.modelName, path: poly.path, first: 0, count: 1 }]));
    w.place(0, 0, 300);
    w.state.yaw = 0;
    w.stance = 'prone';
    w.onActionEnd((e) => { if (throwPoseEnds(e)) throwPose.cut(); });
    const phase = (): number => anim.stats().frame / anim.stats().frames;
    const frame = (input: WalkInput): void => { w.tick(input); throwPose.step(TICK); anim.step(TICK, moverSnapshot(w, null, 0, 0)); };
    return { anim, throwPose, w, phase, frame };
  }
  /**
   * Under the hold the play stays, its phase stopped at `p`; from the cut it runs on from there, a frame of its own rate
   * on at the cut (`stats().rate`, keys a second: the crouch walk's speed follows the mover's ramped stick, which the
   * hold left at the raw stick -- `FUN_00584c60` normalizes and ramps it again, D:L444160-444165) -- and, with
   * `sameStep`, at the step it ran at before the push (the standing run's and the prone crawl's: no ramp).
   */
  const keptThrough = (r: { anim: Animator; w: Walker; phase: () => number; frame: (i: WalkInput) => void }, input: WalkInput, play: string, p: number, step: number, cutAt: number, sameStep: boolean): void => {
    let k = 0;
    while (r.w.holding && k < 200) {
      r.frame(input);
      k++;
      if (!r.w.holding) break;
      expect(r.anim.stats().play, `${k} frames on`).toBe(play);
      expect(r.phase(), `${k} frames on`).toBeCloseTo(p, 9);
      expect(r.anim.stats().rate, `${k} frames on`).toBe(0);
    }
    expect(k).toBe(cutAt);                                               // the stick's cut (PAR-70's count)
    let was = p;
    for (let j = 0; j < 20; j++) {
      if (j > 0) r.frame(input);
      const s = r.anim.stats();
      expect(s.play, `${j} frames after the cut`).toBe(play);
      expect(s.rate, `${j} frames after the cut`).toBeGreaterThan(0);
      const want = (was + (s.rate * TICK) / s.frames) % 1;
      expect(Math.abs(((r.phase() - want + 1.5) % 1) - 0.5), `${j} frames after the cut`).toBeLessThan(1e-9);
      if (sameStep) expect(Math.abs(((r.phase() - (p + (j + 1) * step) + 1.5) % 1) - 0.5), `${j} frames after the cut, the step`).toBeLessThan(1e-9);
      was = r.phase();
    }
  };

  it("NU-8b B2: a crouch-walk's throw (the standing clip, crouched) keeps the crouch walk beneath -- stopped at its phase to the 48th command's cut, on from there", () => {
    const c = lowRig('crouch', 0.6);
    expect(c.play).toMatch(/^loco:crouch/);
    expect(c.step).toBeGreaterThan(0);
    c.push();
    keptThrough(c, c.input, c.play, c.p, c.step, 48, false);
  });

  it("NU-8b B2: a prone crawl's throw (seal_prone_throwgrenade) keeps the crawl beneath -- stopped at its phase to the 86th command's cut, on from there", () => {
    const r = proneRig();
    const input: WalkInput = { forward: 1, right: 0, boost: false };
    for (let i = 0; i < 59; i++) r.frame(input);
    const p0 = r.phase();
    r.frame(input);
    const play = r.anim.stats().play, p = r.phase(), step = (((p - p0) % 1) + 1) % 1;
    expect(play).toMatch(/^loco:prone/);
    expect(step).toBeGreaterThan(0);
    expect(r.w.hold(PRONE_THROW)).toBe(true);
    expect(r.throwPose.start(THROW_ANIMS.proneThrow, true)).toBe(true);
    keptThrough(r, input, play, p, step, 86, true);
  });

  // NU-8b, research 326 section 6 B3 (D6; reading, pending review): the placings are the same stack push and the same
  // sampler as the throws (R326.6: `Place claymore` through `FUN_0057d540` -> `FUN_00588bc0` -> `FUN_0028dc90`, D:L446292)
  // -- the top drawn alone, the push's snapshot over its BlendTime (none: 0.4), the pop at the hold's end over the
  // uncovered play's, a part the pistol's version lacks holding the pose drawn. *Was*: a layer fading in linearly over
  // 0.4 over the live play beneath, out over 0.4 from its last key on its own clock.
  /** The placing on the page: the mover's hold, then the clip it carries (`./matchThrow` `throwStart`). */
  const place = (r: ReturnType<typeof rig>, pistol = false): void => {
    expect(r.w.hold(PLACE)).toBe(true);
    expect(r.throwPose.start(handAnim(PLACE_CLAYMORE_ANIM, pistol), true)).toBe(true);
  };

  it("NU-8b B3: a claymore's placing from the run eases the drawn run into the clip over its BlendTime (0.4), the run kept beneath, the layer at 1", () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame(FORWARD);
    expect(r.anim.stats()).toMatchObject({ play: 'loco:stand', clip: 'seal_run' });
    const frozen = r.at('lthigh'), p = r.phase();
    place(r);
    for (let k = 1; k <= 40; k++) {
      r.frame(FORWARD);
      expect(r.w.holding, `${k} frames on`).not.toBeNull();
      const t = k * TICK, key = r.key(PLACE, 'lthigh', (r.throwPose.stats().phase * 55) / 30, false);
      sameTurn(r.at('lthigh'), slerp(key, frozen, blendWeight(Math.max(0, (0.4 - t) / 0.4))), `the push, ${k} frames on`);
      expect(r.throwPose.stats().weight, `${k} frames on`).toBe(1);
      expect(r.anim.stats().play, `${k} frames on`).toBe('loco:stand');
      expect(r.phase(), `${k} frames on`).toBeCloseTo(p, 9);
    }
  });

  it("NU-8b B3: uncut, the claymore's placing stays on top at 1 past its last key to the hold's own end (the lagged 158th command), then pops onto the idle over seal_stand's 0.5, eased", () => {
    const r = rig();
    for (let i = 0; i < 30; i++) r.frame(STILL);
    expect(r.anim.stats().play).toBe('idle:stand');
    place(r);
    let k = 0, held = r.at('lthigh');
    while (r.w.holding && k < 300) {
      held = r.at('lthigh');
      r.frame(STILL);
      k++;
      if (!r.w.holding) break;
      expect(r.throwPose.stats().weight, `${k} frames on`).toBe(1);
      expect(r.throwPose.playing(), `${k} frames on`).toBe(true);
    }
    expect(k).toBe(158);                                                 // PAR-74: the lagged clock's uncut end
    expect(oneShotSeconds(2.7, 55)).toBeLessThan((k - 1) * TICK);       // the clip held its last key before it
    expect(r.throwPose.playing()).toBe(false);
    expect(r.anim.stats().play).toBe('idle:stand');
    for (let j = 0; j < 40; j++) {
      if (j > 0) r.frame(STILL);
      const t = (j + 1) * TICK, idle = r.key('seal_stand', 'lthigh', 0, true);
      sameTurn(r.at('lthigh'), slerp(idle, held, blendWeight(Math.max(0, (0.5 - t) / 0.5))), `the pop, ${j} frames on`);
    }
  });

  it("NU-8b B3: a part the pistol's placing lacks holds the pose drawn at the push (PISTOL_ONESHOT_PARTS_READING.place 'push') -- seal_p_place_claymore from the run", () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame(FORWARD);
    const thigh = Array.from(r.sk.local[1]!), root = Array.from(r.sk.local[0]!);
    place(r, true);
    for (let k = 1; k <= 120; k++) {
      r.frame(FORWARD);
      expect(r.w.holding, `${k} frames on`).not.toBeNull();
      expectMatrix(r.sk.local[1]!, thigh);
      expectMatrix(r.sk.local[0]!, root);
    }
  });

  it('B5: no twist on spinelo or spinehi from the push to the pop (the throws are NoPitchtwist); drawn before it and after', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame(FORWARD, AIM);
    expect(r.anim.stats().twist).toBeGreaterThan(0);
    r.push();
    let k = 0;
    while (r.w.holding && k < 200) {
      r.frame(FORWARD, AIM);
      k++;
      if (!r.w.holding) break;
      expect(r.anim.stats().twist, `${k} frames on`).toBe(0);
      if (k * TICK > 0.4) { sameTurn(r.at('spinelo'), Q_ID, 'spinelo'); sameTurn(r.at('spinehi'), Q_ID, 'spinehi'); }   // the throw's own key
    }
    expect(k).toBe(48);
    expect(r.anim.stats().twist).toBeGreaterThan(0);                    // the pop: the run's twist again
  });

  // PAR-95 (research 251 section 12.9, Owed; reading, pending review): the original lays the twist in the pose it builds
  // (`FUN_005aca70` from `FUN_0057a330`, D:L439192-439193, writing the spine parts' rotations, D:L465304-465307 and
  // D:L465326-465329) before the snapshot blend mixes the snapshot over it (the build at D:L418454, `FUN_00576860` at
  // D:L418455): the pop's snapshot, drawn without the twist, eases it back in. Was: the twist at once on the pop's frame.
  it("PAR-95: the pop eases the twist back in -- spinelo's and spinehi's turn is the pop's cross-fade weight times the full twist", () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame(FORWARD, AIM);
    const fullLo = r.at('spinelo'), fullHi = r.at('spinehi');          // the run's spine is the bind's: the turn is the twist
    expect(angleOf(fullLo)).toBeCloseTo(2 * TWIST_SHARE.spinelo * Math.sin(Math.PI / 6), 5);
    expect(angleOf(fullHi)).toBeCloseTo(2 * TWIST_SHARE.spinehi * Math.sin(Math.PI / 6), 5);
    r.push();
    let k = 0;
    while (r.w.holding && k < 200) { r.frame(FORWARD, AIM); k++; }
    expect(k).toBe(48);
    expect(r.throwPose.playing()).toBe(false);                           // the pop's frame
    for (let j = 0; j < 30; j++) {
      if (j > 0) r.frame(FORWARD, AIM);
      const w = r.anim.stats().blend, t = (j + 1) * TICK;
      expect(w, `the cross-fade, ${j} frames on`).toBeCloseTo(blendWeight(Math.min(1, t / 0.4)), 9);
      sameTurn(r.at('spinelo'), slerp(Q_ID, fullLo, w), `spinelo, ${j} frames on`);
      sameTurn(r.at('spinehi'), slerp(Q_ID, fullHi, w), `spinehi, ${j} frames on`);
      expect(angleOf(r.at('spinehi')), `spinehi's angle, ${j} frames on`).toBeCloseTo(w * angleOf(fullHi), 3);
    }
    expect(r.anim.stats().blend).toBe(1);
    sameTurn(r.at('spinehi'), fullHi, 'spinehi, the cross-fade over');
  });

  // NU-8a, research 326 §6 B1 (D1; reading, pending review): with a grenade left the rifle is asked up at the release
  // (D:L453520) and down two updates later under the clip (D:L453598-453600: the class 'y', the plain trigger branch run
  // because `FUN_0059d830` answers 0 under the throw, D:L457352-457362), so at the pop its weight -- the Fire versions'
  // blend and the twist's scale (`FUN_0057a330` D:L439152-439193) -- is 0. Was (PAR-95's case): a rifle hot within its
  // 5 s countdown stayed at 1 through the clip, and the pop eased the twist back in.
  it("NU-8a B1: the frame after a standing throw's pop with a grenade left draws the play beneath's plain version with no twist", () => {
    const r = rig();
    const raise = new WeaponRaise();
    const DT = TICK;
    for (let i = 0; i < 12; i++) raise.frame(DT, { trigger: true, aiming: false });   // a rifle hot within its countdown
    let w = 0;
    for (let i = 0; i < 60; i++) { w = raise.frame(DT, { trigger: false, aiming: false }); r.frame(FORWARD, { ...AIM, aimWeight: w }); }
    expect(w).toBe(1);
    expect(r.anim.stats().twist).toBeGreaterThan(0);
    r.push();
    let k = 0;
    while (r.w.holding && k < 200) {
      // the grenade taken up on the release's frame, one left: the release seen by the raise on the push's next frame
      w = raise.frame(DT, { trigger: false, aiming: false, grenade: true, ...(k === 0 ? { release: 'gated' as const } : {}) });
      r.frame(FORWARD, { ...AIM, aimWeight: w });
      k++;
    }
    expect(k).toBe(48);                                                  // the stick's cut (PAR-70)
    expect(r.throwPose.playing()).toBe(false);                           // the pop's frame
    expect(w).toBe(0);                                                   // the Fire version's weight: the plain one drawn
    expect(r.anim.stats().twist).toBe(0);                                // no twist to ease back in
    for (let j = 0; j < 30; j++) {
      w = raise.frame(DT, { trigger: false, aiming: false, grenade: true });
      r.frame(FORWARD, { ...AIM, aimWeight: w });
      expect(w, `${j} frames after the pop`).toBe(0);
      expect(r.anim.stats().twist, `${j} frames after the pop`).toBe(0);
      sameTurn(r.at('spinehi'), Q_ID, `spinehi, ${j} frames after the pop`);
    }
  });

  it("the others' bodies take the same: the hold on the wire keeps their play stopped, and their throw stays at 1 to the frame the hold leaves the body", () => {
    const r = rig();
    const sk = body();
    const { clips, table } = standingKit();
    clips.push(throwClip);
    table.set(THROW, throwEntry);
    const anim = new Animator(sk, clips, table);
    const hands = new ThrowPose(() => ({ clips: new Map(clips.map((c) => [c.name, c])), table }));
    anim.addPoseLayer(hands.layer);
    const extras = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false };
    /** The page's frame, then the other console's: the body off the wire, its hands following its hold (`./remotePlayers`). */
    const both = (input: WalkInput): void => {
      r.frame(input);
      const wire = snapshotOf(bodyOf(2, moverSnapshot(r.w, null, 0, 0), extras));
      hands.follow(wire.hold ?? null, false, wire.holdSerial);
      hands.step(TICK);
      anim.step(TICK, wire);
    };
    for (let i = 0; i < 60; i++) both(FORWARD);
    expect(anim.stats().play).toBe('loco:stand');
    const p = anim.stats().frame;
    r.push();
    let k = 0;
    while (r.w.holding && k < 200) {
      both(FORWARD);
      k++;
      if (!r.w.holding) break;
      expect(anim.stats().play).toBe('loco:stand');
      expect(anim.stats().frame).toBeCloseTo(p, 9);
      expect(hands.stats().weight).toBe(1);
    }
    expect(k).toBe(48);
    expect(hands.playing()).toBe(false);                                 // popped with the hold, not run out on its clock
  });
});

// ---- PAR-95 (research 251 section 12.9, Owed): the twist eases back in at a NoPitchtwist play's end -------------------

/**
 * PAR-95 (research 251 section 12.9's Owed entry; reading, pending review): the original builds the aim's twist into the
 * pose -- `FUN_005aca70`, gated by `FUN_00587a30`, from `FUN_0057a330` (D:L439192-439193), reads the spine parts' model
 * transforms (`FUN_002869d0`, D:L465268, D:L465272) and writes their rotations (D:L465304-465307, D:L465326-465329) --
 * and the driver builds before the snapshot blend runs (`FUN_0057a330` D:L418454, `FUN_00576860` D:L418455), which
 * slerps each part's rotation toward its snapshot (`FUN_0028e0d0` D:L135285-135306). So at a `NoPitchtwist` play's end
 * the snapshot, drawn without the twist, eases onto a pose that has it: the twist comes back with the cross-fade's
 * weight. The start is the other way: the snapshot holds the twist drawn and it eases out (research 211 G3, PAR-85 B5).
 * Synthetic clips on the spine (`spine()`), whose clips hold the bind, so the spine's turn is the twist.
 */
describe('PAR-95: the twist eases back in at a NoPitchtwist play\'s end (research 251 section 12.9)', () => {
  const AIM = { pitch: 30, aimWeight: 1 } as const;
  const at = (sk: Skeleton, name: string): number[] => quatOfMatrix(sk.local[sk.indexOf(name)]!);
  const STAND = entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 });
  /** Two turns equal (q and -q the same), to the skeleton's float32 matrices. */
  const sameTurn = (a: readonly number[], b: readonly number[], label: string): void => {
    const sign = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]! < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) expect(a[i]!, `${label} [${i}]`).toBeCloseTo(sign * b[i]!, 6);
  };
  /** From the frame the end's cross-fade starts: the spine is the cross-fade's weight of the full twist, eased in over `blend` seconds. */
  const easesIn = (sk: Skeleton, anim: Animator, step: () => void, full: { lo: number[]; hi: number[] }, blend: number): void => {
    for (let j = 0; j < 40; j++) {
      if (j > 0) step();
      const w = anim.stats().blend;
      expect(w, `the cross-fade, ${j} frames on`).toBeCloseTo(blendWeight(Math.min(1, (j * TICK) / blend)), 9);
      sameTurn(at(sk, 'spinelo'), slerp(Q_ID, full.lo, w), `spinelo, ${j} frames on`);
      sameTurn(at(sk, 'spinehi'), slerp(Q_ID, full.hi, w), `spinehi, ${j} frames on`);
      expect(angleOf(at(sk, 'spinehi')), `spinehi's angle, ${j} frames on`).toBeCloseTo(w * angleOf(full.hi), 3);
    }
    expect(anim.stats().blend).toBe(1);
    sameTurn(at(sk, 'spinehi'), full.hi, 'spinehi, the cross-fade over');
  };

  it("a still reload's end (the shotgun's, cut: no clip carries on) eases the twist back in over the play beneath's BlendTime (seal_stand's 0.5)", () => {
    const sk = spine();
    const clips = [still('seal_stand'), still('seal_reload_shotgun')];
    const table = new Map<string, MotionEntry>([['seal_stand', STAND], ['seal_reload_shotgun', once(1.6, { noPitchtwist: true })]]);
    const anim = new Animator(sk, clips, table);
    const pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
    anim.addPoseLayer(pose.reloadLayer);
    const frame = (cut = false): void => { pose.step(TICK, cut); anim.step(TICK, { ...REST, ...AIM }); };
    for (let i = 0; i < 30; i++) frame();
    const full = { lo: at(sk, 'spinelo'), hi: at(sk, 'spinehi') };
    expect(angleOf(full.hi)).toBeCloseTo(2 * TWIST_SHARE.spinehi * Math.sin(Math.PI / 6), 5);
    pose.startReload('stand', 1.6, 'shotgun');
    for (let i = 0; i < 30; i++) frame();
    expect(anim.stats().twist).toBe(0);                                  // NoPitchtwist: none under the still clip
    sameTurn(at(sk, 'spinehi'), Q_ID, 'spinehi under the reload');
    frame(true);                                                         // the cut: the clip ends, the ground's play returns
    expect(anim.stats().twist).toBeGreaterThan(0);                       // the gate is open again
    easesIn(sk, anim, () => frame(), full, 0.5);
  });

  /**
   * The still reload is a main-channel play pushed on the stack (`FUN_005a82e0` D:L462928 -> `FUN_00588bc0` ->
   * `FUN_0028dc90` D:L446292): the push sets the body's snapshot blend over the clip's `BlendTime` (D:L135215-135220);
   * the driver's end test pops it (`FUN_005870e0` D:L445128 -> `FUN_00589aa0` -> `FUN_0028da00` D:L446515), which sets
   * the blend over the uncovered play's first node's `BlendTime` (D:L135042-135043, D:L135100-135103). Both are the
   * whole body's cross-fade from the pose drawn (`FUN_00576860`, `FUN_0028e0d0`), the twist with it. A swaying idle
   * (`seal_stand`, its thigh and arm turning a key) tells the frozen pose from the live play beneath.
   */
  describe("a still reload's start and its uncut end (PAR-95 widened, 2026-10-14): the body's cross-fade, both ways", () => {
    const body = (): Skeleton => {
      const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
        index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
      });
      return new Skeleton('test', IDENTITY, [
        part(0, 'skel_root', -1, [0, 11, 0]), part(1, 'lthigh', 0, [1, -1, 0]), part(2, 'lbicep', 0, [2, 6, 0]),
        part(3, 'spinelo', 0, [0, 1, 0]), part(4, 'spinehi', 3, [0, 3, 0]),
      ]);
    };
    const SPINE = [{ name: 'spinelo', t: [[0, 1, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] }];
    /** The idle: 16 keys, the thigh turning 2 degrees a key and the arm 3 (the closing key the first's). */
    const idle = clip('seal_stand', 16, [
      { name: 'skel_root', t: [[0, 11, 0]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: keys(16, (i) => qx(2 * i)) },
      { name: 'lbicep', t: [[2, 6, 0]], q: keys(16, (i) => qx(3 * i)) }, ...SPINE,
    ]);
    /** `seal_reload`: whole body, held -- the thigh at 30, the arm at 50; `NoPitchtwist`, no `BlendTime` (the loader's 0.4). */
    const reloadClip = clip('seal_reload', 45, [
      { name: 'skel_root', t: [[0, 11, 0]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(30)] },
      { name: 'lbicep', t: [[2, 6, 0]], q: [qx(50)] }, ...SPINE,
    ]);
    /** The crouch press's transition (`Stand -> Crouch`): a one-shot, its thigh at 10; a made-up `BlendTime` of 0.3. */
    const toCrouch = clip(SEAL_ANIMS.standToCrouch, 12, [
      { name: 'skel_root', t: [[0, 11, 0]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(10)] }, ...SPINE,
    ]);
    const rig = () => {
      const sk = body();
      const clips = [idle, reloadClip, toCrouch];
      const table = new Map<string, MotionEntry>([
        ['seal_stand', STAND], ['seal_reload', once(1.6, { noPitchtwist: true })], [SEAL_ANIMS.standToCrouch, once(0.65, { blendTime: 0.3 })],
      ]);
      const anim = new Animator(sk, clips, table);
      const pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
      anim.addPoseLayer(pose.reloadLayer);
      const frame = (): void => { pose.step(TICK); anim.step(TICK, { ...REST, ...AIM }); };
      const idleKey = (part: string): number[] =>
        sampleClip(idle, anim.stats().frame / idle.rate, { loop: true }).parts.find((p) => p.name === part)!.rotation;
      return { sk, anim, pose, frame, idleKey };
    };

    it("its start eases the twist out over its BlendTime (0.4) from the pose drawn, the legs and the arms with it -- not the layer's own fade over the live idle", () => {
      const r = rig();
      for (let i = 0; i < 37; i++) r.frame();
      const full = { lo: at(r.sk, 'spinelo'), hi: at(r.sk, 'spinehi') };
      expect(angleOf(full.hi)).toBeCloseTo(2 * TWIST_SHARE.spinehi * Math.sin(Math.PI / 6), 5);
      const leg = at(r.sk, 'lthigh'), arm = at(r.sk, 'lbicep');            // the pose drawn at the push
      r.pose.startReload('stand', 1.6, 'rifle');
      for (let k = 1; k <= 30; k++) {
        r.frame();
        expect(r.anim.stats().twist, `${k} frames on`).toBe(0);
        // The push lands after last frame's driver: a frame's time run when first drawn (FUN_00576860 D:L436624-436629).
        const w = r.anim.stats().blend;
        expect(w, `the cross-fade, ${k} frames on`).toBeCloseTo(blendWeight(Math.min(1, (k * TICK) / 0.4)), 9);
        sameTurn(at(r.sk, 'spinehi'), slerp(full.hi, Q_ID, w), `spinehi, ${k} frames on`);
        sameTurn(at(r.sk, 'spinelo'), slerp(full.lo, Q_ID, w), `spinelo, ${k} frames on`);
        sameTurn(at(r.sk, 'lthigh'), slerp(leg, qx(30), w), `lthigh, ${k} frames on`);
        sameTurn(at(r.sk, 'lbicep'), slerp(arm, qx(50), w), `lbicep, ${k} frames on`);
      }
      expect(r.anim.stats().blend).toBe(1);
    });

    it("its uncut end (the driver's pop, PAR-73) eases the twist back in over the play beneath's BlendTime (seal_stand's 0.5), the legs and the arms from the pose drawn onto the live idle", () => {
      const r = rig();
      for (let i = 0; i < 30; i++) r.frame();
      const full = { lo: at(r.sk, 'spinelo'), hi: at(r.sk, 'spinehi') };
      r.pose.startReload('stand', 1.6, 'rifle');
      let k = 0;
      do { r.frame(); k++; } while (r.anim.stats().twist === 0 && k < 200);
      expect(k).toBe(93);                                                  // the 93rd frame: the end test pops it (PAR-73)
      for (let j = 0; j < 40; j++) {
        if (j > 0) r.frame();
        const w = r.anim.stats().blend;
        expect(w, `the cross-fade, ${j} frames on`).toBeCloseTo(blendWeight(Math.min(1, (j * TICK) / 0.5)), 9);
        sameTurn(at(r.sk, 'spinehi'), slerp(Q_ID, full.hi, w), `spinehi, ${j} frames on`);
        sameTurn(at(r.sk, 'spinelo'), slerp(Q_ID, full.lo, w), `spinelo, ${j} frames on`);
        sameTurn(at(r.sk, 'lthigh'), slerp(qx(30), r.idleKey('lthigh'), w), `lthigh, ${j} frames on`);
        sameTurn(at(r.sk, 'lbicep'), slerp(qx(50), r.idleKey('lbicep'), w), `lbicep, ${j} frames on`);
      }
      expect(r.anim.stats().blend).toBe(1);
    });

    // The review's F1: a push onto the stack snapshots again while a blend runs and sets the clip's `BlendTime`
    // (`FUN_0028dc90` D:L135215-135220) -- after the ground state's play started that tick, the push landing after the
    // driver (PAR-67). *Was:* the request dropped when the mover's play started the same frame (the play's 0.3 from 0).
    it("pushed on the frame a crouch press starts a play, the cross-fade is the reload's (its BlendTime 0.4, a frame run), not the play's", () => {
      const r = rig();
      for (let i = 0; i < 30; i++) r.frame();
      r.pose.startReload('stand', 1.6, 'rifle');
      r.pose.step(TICK);
      r.anim.step(TICK, { ...acting('standToCrouch', 1, { seconds: oneShotSeconds(0.65, 12) }), ...AIM });
      expect(r.anim.stats().play).toBe('standToCrouch#1');               // the mover's play started this frame
      expect(r.anim.stats().blend).toBeCloseTo(blendWeight(TICK / 0.4), 9);
      for (let k = 2; k <= 10; k++) {
        r.pose.step(TICK);
        r.anim.step(TICK, { ...acting('standToCrouch', 1, { t: (k - 1) * TICK, seconds: oneShotSeconds(0.65, 12) }), ...AIM });
        expect(r.anim.stats().blend, `${k} frames on`).toBeCloseTo(blendWeight((k * TICK) / 0.4), 9);
      }
    });

    it("Fire's completed end heard on the pop's frame, before the body is drawn, keeps the pop's cross-fade (WeaponPose.stopReload)", () => {
      const r = rig();
      for (let i = 0; i < 30; i++) r.frame();
      r.pose.startReload('stand', 1.6, 'rifle');
      for (let k = 0; k < 92; k++) r.frame();
      expect(r.anim.stats().twist).toBe(0);
      r.pose.step(TICK);                                                   // the 93rd: the pop
      r.pose.stopReload(true);                                             // the lock's end heard before the body
      r.anim.step(TICK, { ...REST, ...AIM });
      expect(r.anim.stats().blend).toBe(0);
      expect(r.anim.stats().from).not.toBeNull();
      r.frame();
      expect(r.anim.stats().blend).toBeCloseTo(blendWeight(TICK / 0.5), 9);
    });
  });

  // The review's F3: every snapshot holds the twist drawn, so a play the gate refuses for its own reason -- prone here
  // (`FUN_0057a330` D:L439192 reads the stance; a ladder, a climb and the victory dance are the others) -- eases it out
  // and back in too. *Was:* it snapped at both ends.
  it('the move into prone eases the twist out over the prone play\'s BlendTime, and standing again eases it back in', () => {
    const sk = spine();
    const clips = [still('seal_stand'), still('seal_prone')];
    const PRONE = entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 });
    const table = new Map<string, MotionEntry>([['seal_stand', STAND], ['seal_prone', PRONE]]);
    const anim = new Animator(sk, clips, table);
    for (let i = 0; i < 30; i++) anim.step(TICK, { ...REST, ...AIM });
    const full = { lo: at(sk, 'spinelo'), hi: at(sk, 'spinehi') };
    expect(angleOf(full.hi)).toBeCloseTo(2 * TWIST_SHARE.spinehi * Math.sin(Math.PI / 6), 5);
    for (let k = 0; k < 40; k++) {
      anim.step(TICK, { ...REST, stance: 'prone', ...AIM });
      expect(anim.stats().play).toBe('idle:prone');
      expect(anim.stats().twist).toBe(0);
      const w = anim.stats().blend;
      expect(w, `the cross-fade, ${k} frames on`).toBeCloseTo(blendWeight(Math.min(1, (k * TICK) / 0.5)), 9);
      sameTurn(at(sk, 'spinehi'), slerp(full.hi, Q_ID, w), `into prone, ${k} frames on`);
      sameTurn(at(sk, 'spinelo'), slerp(full.lo, Q_ID, w), `into prone, ${k} frames on`);
    }
    anim.step(TICK, { ...REST, ...AIM });                                // standing again: the idle's play starts
    expect(anim.stats().play).toBe('idle:stand');
    // OT.R67: prone to standing with no clip is the prone-pop's frame (`showsPronePop`): the cross-fade is the rise's
    // (`PRONE_POP_RISE_S_ADAPTATION`, 0.26 s) and the twist eases back in with its weight. Was: the stand's 0.5 s BlendTime.
    easesIn(sk, anim, () => anim.step(TICK, { ...REST, ...AIM }), full, PRONE_POP_RISE_S_ADAPTATION);
  });

  it("a swap's end (seal_rifle2pistol) eases the twist back in over the idle's BlendTime; its start still eases it out", () => {
    const sk = spine();
    const clips = [still('seal_stand'), still(SEAL_ANIMS.swapStand)];
    const table = new Map<string, MotionEntry>([['seal_stand', STAND], [SEAL_ANIMS.swapStand, once(1.32, { noPitchtwist: true })]]);
    const anim = new Animator(sk, clips, table);
    for (let i = 0; i < 30; i++) anim.step(TICK, { ...REST, ...AIM });
    const full = { lo: at(sk, 'spinelo'), hi: at(sk, 'spinehi') };
    expect(angleOf(full.hi)).toBeCloseTo(2 * TWIST_SHARE.spinehi * Math.sin(Math.PI / 6), 5);
    const seconds = oneShotSeconds(1.32, 10);
    for (let f = 0; f < 60; f++) {
      anim.step(TICK, { ...acting('swapStand', 1, { t: f * TICK, seconds }), ...AIM });
      expect(anim.stats().twist).toBe(0);
      const w = anim.stats().blend;                                      // the start: the twist drawn eases out (research 211 G3)
      sameTurn(at(sk, 'spinehi'), slerp(full.hi, Q_ID, w), `the swap's start, ${f} frames on`);
    }
    anim.step(TICK, { ...REST, ...AIM });                                // the swap's end: the idle's play starts
    expect(anim.stats().play).toBe('idle:stand');
    easesIn(sk, anim, () => anim.step(TICK, { ...REST, ...AIM }), full, 0.5);
  });
});

/**
 * B138 (BTL.R8 run 3, the host page: `Cannot read properties of undefined (reading 'motion')` in a 15-CPU match): a
 * standing locomotion whose stick falls inside the dead zone (`standPlay`: neither axis off 0.03 -- a body slowing to a
 * stop) rebuilds no nodes. The play on screen must keep the nodes it last posed with, or the next play's start (its
 * cross-fade from `main(prev)`) and the stats read a play with none.
 */
describe('B138: a locomotion rebuilt to no nodes keeps the play it posed with', () => {
  it('the stick inside the dead zone, then the idle and an action: no throw, the cross-fade from the last posed clip', () => {
    const { clips, table } = standingKit();
    const anim = new Animator(skeleton(), clips, table);
    anim.step(1 / 60, REST);
    anim.step(1 / 60, running(1));
    expect(anim.stats().nodes.map((n) => n.clip)).toEqual(['seal_run']);
    anim.step(1 / 60, running(0.02, 0.01, 1));                    // both axes within 0.03: `standPlay` builds none
    expect(anim.stats()).toMatchObject({ play: 'loco:stand', clip: 'seal_run' });   // the last posed nodes kept
    expect(() => anim.step(1 / 60, REST)).not.toThrow();           // a new play's start reads the old play's main
    expect(anim.stats()).toMatchObject({ play: 'idle:stand', clip: 'seal_stand', from: 'seal_run' });
  });
});
