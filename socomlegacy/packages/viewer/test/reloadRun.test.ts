import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrid, DEFAULT_RIFLE, GAME_FRAME_DT, HELD_SIDEARM, M67, type KitRound, type SpawnSlot, type WeaponRecord, IDENTITY, partMatrix, sampleClip, Skeleton, type CollisionOwner, type GridParams, type MotionClip, type MotionPart, type SkeletonPart, type WorldPoly } from '@s2u/scene';
import { Zar } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import { Animator, blendWeight, type MoverSnapshot } from '../src/animator';
import { Fire } from '../src/fire';
import { BLEND_TIME_DEFAULT } from '../src/locomotion';
import { clipsFromPack, motionTableFromArchive, type MotionEntry } from '../src/motionTable';
import { HOLD_SECONDS, TICK, Walker } from '../src/mover';
import { OVERLAY_BLEND, WeaponPose } from '../src/weaponPose';
import { reloadHold, type HoldClip, type Stance } from '../src/mover';
import { MagazineRing } from '../src/magazines';
import { reloadHoldPeriod, reloadSeconds } from '../src/reloadClip';
import { RELOAD_CUT_DELAY_READING, RELOAD_CUT_MARGIN_TICKS } from '../src/reloadLock';
import { landingPops, reloadPopped, StillReloadLife } from '../src/stillReloadLife';
import { Button, encodeCommands, groundGrid, holdBits, packGround, PROTOCOL_VERSION, simClipsFromBytes, type Command, type SimClips, type SimMap } from '../src/sim';
import { Room } from '../../match/src/room';

/**
 * The reload while running (research 150; the owner, 2026-10-03: "while reloading and running, the character can end up
 * in an odd animation"). The game's rule, driven here on synthetic clips under the disc's names and `motion.rdr` fields:
 *
 * - `FUN_005a82e0` (462821-462923) picks the clip once, at the start: still (`|v|^2 <= 400`) the stance's full-body
 *   reload, pushed on the action stack; moving the `BlendOverlay` motion `Moving rifle reload` (`seal_mv_reload`) on the
 *   second channel (`FUN_00588bc0` 446083-446086, `FUN_00587780`), laid over the parts it carries at 1.0
 *   (`FUN_00577ea0` 437455-437461, `FUN_00576bb0` 436734): the spine from `spinehi`, the arms, the head, the rifle --
 *   never the legs or the root.
 * - `FUN_00550ef0` (418176-418226): past the clip's `NoInterrupt` (none standing, 0.35 crouched, 0.5 prone), a move axis
 *   or the turn axis over 0.1 cuts the still clip; `Rifle reload`, `Rifle crouch reload` and `Rifle m203 reload` go
 *   on as `Moving rifle reload` at the phase reached (418213: the overlay's clock set to phase x length x (n-1)/n),
 *   the pistol's two as `Moving pistol reload`; every other reload (prone, the shotgun's, the pump) just ends. Nothing
 *   ever goes back to a still clip.
 * - The overlay's clock (`FUN_0028d170` 134692-134757): keys 0..n-1 at n / playback a second, freed at the last key;
 *   at its start and its end the body cross-fades from the pose on screen over 0.4 s (`FUN_0057a010` 438627-438633,
 *   `FUN_00579ef0` 438544-438547, `FUN_00576860` 436643 / 436664, the ease `FUN_002874f0`).
 * - The twist gate `FUN_00587a30` (445469-445473) reads the main channel's last node: a still reload (`NoPitchtwist`)
 *   turns the aim's twist off; the overlay leaves the locomotion's own flag.
 */

const Q_ID: [number, number, number, number] = [0, 0, 0, 1];
const qx = (deg: number): [number, number, number, number] => {
  const a = (deg * Math.PI) / 360;
  return [Math.sin(a), 0, 0, Math.cos(a)];
};

function clip(name: string, frames: number, parts: { name: string; t: number[][]; q: number[][] }[]): MotionClip {
  const mparts: MotionPart[] = parts.map((p, index) => ({
    index, name: p.name, flags: 0x0c | (p.q.length === 1 ? 0x10 : 0) | (p.t.length === 1 ? 0x20 : 0),
    translations: Float32Array.from(p.t.flat()), rotations: Float32Array.from(p.q.flat()),
  }));
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: mparts };
}
/** `n + 1` keys, the last equal to the first (77 §5). */
const keys = <T>(frames: number, f: (i: number) => T): T[] => Array.from({ length: frames + 1 }, (_, i) => f(i === frames ? 0 : i));

const ROOT = { name: 'skel_root', t: [[0.5, 11, 20]], q: [Q_ID] };
const SPINE = [{ name: 'spinelo', t: [[0, 3, 0]], q: [Q_ID] }, { name: 'spinehi', t: [[0, 3, 0]], q: [Q_ID] }];
/** A full-body clip: the root, the spine, a leg held at `legDeg`, an arm turning `armDeg(i)` a key. */
const whole = (name: string, frames: number, legDeg: number, armDeg: (i: number) => number): MotionClip => clip(name, frames, [
  ROOT, ...SPINE, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(legDeg)] }, { name: 'lbicep', t: [[2, 6, 0]], q: keys(frames, (i) => qx(armDeg(i))) },
]);
/** An upper-body overlay as `seal_mv_reload` is laid out: from `spinehi` up, the arm and the rifle; no root, spinelo or legs. */
const upper = (name: string, frames: number, armDeg: (i: number) => number): MotionClip => clip(name, frames, [
  SPINE[1]!, { name: 'lbicep', t: [[2, 6, 0]], q: keys(frames, (i) => qx(armDeg(i))) }, { name: 'rifle', t: [[0, 0, 0]], q: [Q_ID] },
]);
/** A run whose leg turns 4 degrees a key and whose root travels 57.7 a second along -z. */
const run_ = clip('seal_run', 19, [
  { name: 'skel_root', t: keys(19, (i) => [0.5, 11, 20 - (57.7 / 30) * i]), q: [Q_ID] }, ...SPINE,
  { name: 'lthigh', t: [[1, -1, 0]], q: keys(19, (i) => qx(4 * i)) }, { name: 'lbicep', t: [[2, 6, 0]], q: [qx(0)] },
]);

function skeleton(): Skeleton {
  const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  return new Skeleton('test', IDENTITY, [
    part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'spinelo', 0, [0, 3, 0]), part(2, 'spinehi', 1, [0, 3, 0]),
    part(3, 'lthigh', 0, [1, -1, 0]), part(4, 'lbicep', 2, [2, 6, 0]),
  ]);
}
const LTHIGH = 3, LBICEP = 4;

const entry = (e: Partial<MotionEntry>): MotionEntry => ({
  looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
});
/** A reload's `motion.rdr` record as the disc has it (research 150 §2): one-shot, `max_velocity -1`, no `BlendTime`. */
const reload = (playback: number, e: Partial<MotionEntry> = {}): MotionEntry => entry({ looped: false, maxVelocity: -1, playback, noPitchtwist: true, ...e });

/** The kit: the stand (BlendTime 0.5), the run, the crouch and prone idles, and the reload clips under the disc's names. */
function kit(): { clips: MotionClip[]; table: Map<string, MotionEntry> } {
  const clips = [
    whole('seal_stand', 16, 0, () => 0), run_, whole('seal_crouch', 21, 0, () => 0), whole('seal_prone', 10, 0, () => 0),
    whole('seal_reload', 45, 30, (i) => 10 + i),                 // 45 keys: key 0 at 10 degrees, key 44 at 54
    upper('seal_mv_reload', 33, (i) => -10 - i),                 // 33 keys: key 0 at -10, key 32 at -42
    whole('seal_crouch_reload', 28, 30, (i) => 10 + i), whole('seal_prone_reload', 30, 30, (i) => 10 + i),
    whole('seal_p_reload', 26, 30, (i) => 10 + i), upper('seal_p_mv_reload', 21, (i) => -10 - i),
    whole('seal_reload_shotgun', 18, 30, (i) => 10 + i), upper('seal_mv_reload_shotgun', 18, (i) => -10 - i),
    whole('seal_reload_m203', 37, 30, (i) => 10 + i), whole('seal_pump_shotgun', 27, 30, (i) => 10 + i),
  ];
  const table = new Map<string, MotionEntry>([
    ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
    ['seal_run', entry({ looped: true, playback: 1, maxVelocity: 6.5, transitionA: 4.01, transitionB: 6.5 })],
    ['seal_crouch', entry({ looped: true, playback: 6, maxVelocity: -0.1 })], ['seal_prone', entry({ looped: true, playback: 6, maxVelocity: -0.1 })],
    ['seal_reload', reload(1.6)], ['seal_mv_reload', reload(1.2, { blendOverlay: true })],
    ['seal_crouch_reload', reload(1.9, { noInterrupt: 0.35 })], ['seal_prone_reload', reload(1.7, { noInterrupt: 0.5 })],
    ['seal_p_reload', reload(1.8)], ['seal_p_mv_reload', reload(1.2, { blendOverlay: true })],
    ['seal_reload_shotgun', reload(1.6)], ['seal_mv_reload_shotgun', reload(1.6, { blendOverlay: true })],
    ['seal_reload_m203', reload(1.3)], ['seal_pump_shotgun', reload(0.9, { noPitchtwist: false })],
  ]);
  return { clips, table };
}

const IDLE = { state: 'idle', forward: 0, right: 0, cls: -1 } as const;
/** At rest, standing, the aim 9 degrees down with the rifle up: the twist runs unless a clip turns it off. */
const REST: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand', ground: IDLE, action: null, pitch: -9, aimWeight: 1 };
/** The standing ground state with the stick forward at `forward`, moving at `speed` units a second. */
const running = (forward: number, speed: number): MoverSnapshot => ({ ...REST, vz: -speed, ground: { state: 'stand', forward, right: 0, cls: 1 } });
const DT = 1 / 60;

/** The animator and the weapon layers over one skeleton; `go` runs frames with a mover and a stick cut flag. */
function rig(weapon: 'rifle' | 'pistol' = 'rifle') {
  const { clips, table } = kit();
  const sk = skeleton();
  const anim = new Animator(sk, clips, table, { weapon });
  const pose = new WeaponPose(new Map(clips.map((c) => [c.name, c])), table);
  pose.item = weapon;
  anim.addPoseLayer(pose.fireLayer);
  anim.addPoseLayer(pose.reloadLayer);
  const go = (seconds: number, mover: MoverSnapshot, cut = false): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) { pose.step(DT, cut); anim.step(DT, mover); }
  };
  return { sk, anim, pose, go, clips: new Map(clips.map((c) => [c.name, c])) };
}

/** Two skeletons' part locals agree (the first 12 elements: the rotation and the clip's translation). */
const expectSame = (a: Skeleton, b: Skeleton, index: number, what: string): void => {
  for (let i = 0; i < 12; i++) expect(a.local[index]![i]!, `${what} element ${i}`).toBeCloseTo(b.local[index]![i]!, 5);
};

/** A part's local rotation matrix on the skeleton equals the clip's key `frame` of `part` (the first 12 elements). */
const expectPart = (sk: Skeleton, index: number, c: MotionClip, frame: number, part: string): void => {
  const p = sampleClip(c, frame / c.rate, { loop: false }).parts.find((q) => q.name === part)!;
  const want = partMatrix(p.rotation, p.translation);
  for (let i = 0; i < 12; i++) expect(sk.local[index]![i]!, `${part} element ${i} at key ${frame}`).toBeCloseTo(want[i]!, 3);
};

describe('the reload while running: the moving overlay (FUN_005a82e0 462821-462923, FUN_00588bc0 446083-446086)', () => {
  it('the body cross-fades the second channel in and out over the literal 0.4 s (FUN_0057a010 438633, FUN_00579ef0 438547, FUN_00576860 436643)', () => {
    expect(OVERLAY_BLEND).toBe(0.4);
  });

  it('a reload started running plays seal_mv_reload over the run -- the arms its own, the legs the run\'s -- and stays it when the mover slows under 20', () => {
    const { sk, pose, go, clips } = rig();
    const ctrl = rig();                                                           // the same frames with no reload
    const both = (seconds: number, mover: MoverSnapshot, cut = false): void => { go(seconds, mover, cut); ctrl.go(seconds, mover, cut); };
    both(0.5, running(1, 65), true);
    // FUN_005a82e0 462821-462823: |v|^2 > 400 at the start -> Moving rifle reload, the second channel, from its key 0.
    pose.startReload('stand', 1.2, 'rifle', true);
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true });
    both(0.5, running(1, 65), true);
    expect(pose.stats().reloadWeight).toBe(1);                                   // 0.5 s in: the 0.4 s cross-fade is over
    // FUN_00577ea0 437455-437461: laid over the parts the clip carries, at 1.0; the legs and the root are the run's own.
    expectSame(sk, ctrl.sk, LTHIGH, 'lthigh');
    expectSame(sk, ctrl.sk, 0, 'skel_root');
    // FUN_0028d170 134703: the overlay's key is t x n / playback -- 0.5 s in, key 13.75 of 33.
    expect(pose.stats().reloadFrame).toBeCloseTo((0.5 / 1.2) * 33, 6);
    expectPart(sk, LBICEP, clips.get('seal_mv_reload')!, (0.5 / 1.2) * 33, 'lbicep');
    // The stick let go, the mover slowing to a stop: nothing in the game goes back to a still clip.
    both(0.3, running(0.2, 12), true);
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true });
    both(0.2, REST, false);
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true, reloadWeight: 1 });
    expectSame(sk, ctrl.sk, LTHIGH, 'lthigh');                                   // the idle's legs under it
  });

  it('a still standing reload is seal_reload, whole body, the twist off; the first push over 0.1 cuts it and seal_mv_reload carries on at the phase the cut reads (PAR-67: a game frame behind the drawn one)', () => {
    const { sk, anim, pose, go, clips } = rig();
    const ctrl = rig();                                                           // the same frames with no reload
    go(0.5, REST); ctrl.go(0.5, REST);
    expect(anim.stats().twist).toBeGreaterThan(0);                               // the aim's twist runs on the idle
    pose.startReload('stand', 1.6, 'rifle', false);
    expect(pose.stats()).toMatchObject({ reload: 'seal_reload', reloadOverlay: false });
    // FUN_0028dc90: a new play cross-fades over its BlendTime, 0.4 when motion.rdr gives none (FUN_00287620) -- since
    // PAR-95 (research 251 section 12.9) the body's cross-fade from the pose drawn, the layer at 1. *Was:* the layer's
    // own weight, `reloadWeight` blendWeight(0.1 / 0.4).
    go(0.1, REST); ctrl.go(0.1, REST);
    expect(pose.stats().reloadWeight).toBe(1);
    expect(anim.stats().blend).toBeCloseTo(blendWeight(0.1 / BLEND_TIME_DEFAULT), 6);
    go(0.4, REST); ctrl.go(0.4, REST);
    expect(pose.stats().reloadWeight).toBe(1);
    expectPart(sk, LTHIGH, clips.get('seal_reload')!, 0, 'lthigh');               // the still clip's own legs
    // FUN_00587a30 445469-445473: the main channel's clip is NoPitchtwist -> no twist toward the aim.
    expect(anim.stats().twist).toBe(0);
    // FUN_0028c4f0: a one-shot's key at t is t / (playback x (n-1)/n) x n -- 0.5 s in, key 14.38 of 45.
    const phase = 0.5 / (1.6 * (44 / 45));
    expect(pose.stats().reloadFrame).toBeCloseTo(phase * 45, 6);
    // FUN_00550ef0 418185: a move axis over 0.1 (here 0.3, the mover at 19.5 a second -- under the old speed test's 20)
    // cuts Rifle reload (no NoInterrupt) on the tick that advanced it; 418205-418214: Moving rifle reload goes on the
    // second channel with its clock at phase x 1.2 x 32/33 (418213), so its key is phase x 32, advancing from the next tick.
    // The phase is the one the cut read (D:L418187, before the tick's advance): a game frame behind the push's clock
    // (PAR-67, research 251 section 12.5; `reloadCutPhase`) -- not the drawn still clip's, which is drawn after the advance.
    const mover = running(0.3, 19.5);
    let frames = 0;
    const run = (n: number): void => { for (let i = 0; i < n; i++) { pose.step(DT, true); anim.step(DT, mover); } frames += n; ctrl.go(n * DT, mover, true); };
    run(1);
    const phase1 = (0.5 + DT - GAME_FRAME_DT) / (1.6 * (44 / 45));
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true, reloadWeight: 1 });
    expect(pose.stats().reloadFrame).toBeCloseTo(phase1 * 32, 6);
    expect(anim.stats().twist).toBeGreaterThan(0);                               // the overlay leaves the run's own flag
    const t0 = phase1 * 1.2 * (32 / 33), lastAt = 1.2 * (32 / 33);
    frames = 0;
    // The animator's own cross-fade carries the legs from the frozen reload pose into the run (FUN_005870e0's new play).
    run(36);
    expectSame(sk, ctrl.sk, LTHIGH, 'lthigh');
    expect(pose.stats().reloadFrame).toBeCloseTo(((t0 + frames * DT) / 1.2) * 33, 6);
    expectPart(sk, LBICEP, clips.get('seal_mv_reload')!, pose.stats().reloadFrame, 'lbicep');
    // FUN_0028d170 134737: freed at the last key, t = 1.2 x 32/33 on its own clock; the 0.4 s cross-fade out follows.
    run(Math.floor((lastAt - t0) / DT) - 1 - frames);
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadWeight: 1 });
    expect(pose.stats().reloadFrame).toBeLessThan(32);
    run(14);
    const over = t0 + frames * DT - lastAt;
    expect(over).toBeGreaterThan(0.15);
    expect(pose.stats().reload).toBe('seal_mv_reload');
    expect(pose.stats().reloadFrame).toBe(32);                                    // held at key n-1, never key n (= key 0)
    expect(pose.stats().reloadWeight).toBeCloseTo(1 - blendWeight(over / OVERLAY_BLEND), 6);
    run(15);
    expect(pose.stats().reload).toBeNull();
    expect(pose.reloading()).toBe(false);
  });

  it('a turn-only cut (the stick inside 0.1, the look turning) changes no play: the body cross-fades over 0.4 s from the pose on screen, no joint jumping in one tick', () => {
    const { sk, anim, pose, go, clips } = rig();
    go(0.5, REST);
    pose.startReload('stand', 1.6, 'rifle', false);
    go(0.5, REST);
    expect(pose.stats()).toMatchObject({ reload: 'seal_reload', reloadWeight: 1 });
    // FUN_00550ef0 418185: the turn axis (actor+0x23c, turnRate / turn_maxrate 2) over 0.1 cuts as a move axis does; the
    // ground state stays the idle (no turn-in-place clip in this kit), so the animator starts no new play of its own.
    const turning: MoverSnapshot = { ...REST, turnRate: 0.3 };
    const play = anim.stats().play;
    const frozenLeg = [...sk.local[LTHIGH]!], frozenArm = [...sk.local[LBICEP]!];
    let prevLeg = frozenLeg, prevArm = frozenArm, worstLeg = 0, worstArm = 0;
    const steps: { leg: number[]; arm: number[] }[] = [];
    for (let i = 0; i < 30; i++) {
      pose.step(DT, true); anim.step(DT, turning);
      expect(anim.stats().play).toBe(play);
      const leg = [...sk.local[LTHIGH]!], arm = [...sk.local[LBICEP]!];
      steps.push({ leg: leg.map((v, k) => Math.abs(v - prevLeg[k]!)), arm: arm.map((v, k) => Math.abs(v - prevArm[k]!)) });
      prevLeg = leg; prevArm = arm;
    }
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true });
    // After 0.5 s the cross-fade is over: the legs are the idle's, the arms the overlay's.
    expectPart(sk, LTHIGH, clips.get('seal_stand')!, anim.stats().frame, 'lthigh');
    expectPart(sk, LBICEP, clips.get('seal_mv_reload')!, pose.stats().reloadFrame, 'lbicep');
    // FUN_0057a010 438628-438633, FUN_00576860 436643: the body's 0.4 s smoothstep from the pose on screen -- one tick
    // may move a joint by at most blendWeight's steepest step (2 x dt / 0.4) of the whole change, plus the overlay's own
    // drift (its arm turns a degree a key, 0.46 key a tick).
    const slope = (2 * DT) / OVERLAY_BLEND;
    const legFull = [...sk.local[LTHIGH]!].map((v, k) => Math.abs(v - frozenLeg[k]!));
    const armFull = [...sk.local[LBICEP]!].map((v, k) => Math.abs(v - frozenArm[k]!));
    for (const st of steps) {
      for (let k = 0; k < 12; k++) {
        worstLeg = Math.max(worstLeg, st.leg[k]! - slope * legFull[k]!);
        worstArm = Math.max(worstArm, st.arm[k]! - slope * armFull[k]!);
      }
    }
    expect(Math.max(...legFull)).toBeGreaterThan(0.1);                            // the cut did move the legs (qx(30) -> qx(0))
    expect(worstLeg).toBeLessThan(0.005);
    expect(worstArm).toBeLessThan(0.03);
  });

  it('a crouched still reload is cut only past NoInterrupt 0.35 (FUN_00587c20 445555); a push before it changes nothing', () => {
    const { pose, go } = rig();
    const crouched: MoverSnapshot = { ...REST, crouched: true, stance: 'crouch' };
    go(0.2, crouched);
    pose.startReload('crouch', 1.9, 'rifle', false);
    go(0.3, crouched, true);                                                      // phase 0.16: held
    expect(pose.stats()).toMatchObject({ reload: 'seal_crouch_reload', reloadOverlay: false });
    go(0.4, crouched, true);                                                      // phase 0.38: cut -> the overlay
    expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true });
  });

  it('the prone, the shotgun\'s and the pump\'s reloads end at the cut; the pistol\'s goes on as seal_p_mv_reload; the m203\'s as seal_mv_reload (FUN_00550ef0 418205-418226)', () => {
    const prone: MoverSnapshot = { ...REST, stance: 'prone' };
    {
      const { pose, go } = rig();
      pose.startReload('prone', 1.7, 'rifle', false);
      go(0.9, prone, true);                                                       // phase 0.55 > 0.5: cut, nothing after
      expect(pose.stats().reload).toBeNull();
    }
    {
      const { pose, go } = rig();
      pose.startReload('stand', 1.6, 'shotgun', false);
      go(0.1, REST, false);
      expect(pose.stats().reload).toBe('seal_reload_shotgun');
      go(DT, REST, true);
      expect(pose.stats().reload).toBeNull();                                     // no Moving shotgun reload follows a cut
    }
    {
      const { pose, go } = rig('pistol');
      pose.startReload('stand', 1.8, 'pistol', false);
      go(0.2, REST, true);
      expect(pose.stats()).toMatchObject({ reload: 'seal_p_mv_reload', reloadOverlay: true });
    }
    {
      const { pose, go } = rig();
      pose.startReload('stand', 1.3, 'm203', false);
      expect(pose.stats().reload).toBe('seal_reload_m203');
      go(0.2, REST, true);
      expect(pose.stats()).toMatchObject({ reload: 'seal_mv_reload', reloadOverlay: true });
    }
  });

  // PAR-73 (research 251 section 12.5): the still clip is drawn at its held stop (n-1)/n (`FUN_0028c4f0`'s clamp,
  // D:L134260-134266) until the driver's end test pops it (`FUN_00582540` D:L418193 -> `FUN_0028c6e0`, PAR-69's
  // `reloadEnded`: the 93rd frame for `seal_reload`, a frame past its last key's 92nd); the body's cross-fade starts at
  // the pop (`FUN_005870e0` D:L418203), not at the last key, and the twist stays off while the clip is the main play.
  it("an uncut still reload plays keys 0..n-1 over playback x ((n-1)/n)^2, holds the last until the driver's end pops it a frame later (PAR-73), and fades from the pop over the idle's BlendTime (seal_stand 0.5)", () => {
    const { anim, pose, go } = rig();
    go(0.2, REST);
    pose.startReload('stand', 1.6, 'rifle', false);
    const end = 1.6 * (44 / 45) ** 2;                                             // 1.5296 s: the last key
    let frames = 0;
    const run = (n: number): void => { for (let i = 0; i < n; i++) { pose.step(DT); anim.step(DT, REST); } frames += n; };
    run(Math.floor(end / DT) - 1);
    expect(pose.stats().reloadFrame).toBeLessThan(44);
    run(2);
    expect(frames).toBe(92);
    expect(pose.stats().reloadFrame).toBe(44);                                    // keys 0..n-1: never the closing key n
    expect(pose.stats().reloadWeight).toBe(1);                                    // held at the stop: not fading yet
    expect(anim.stats().twist).toBe(0);                                           // still the main play: NoPitchtwist
    // The 93rd: the end test pops it. Since PAR-95 (research 251 section 12.9) the pop is the body's cross-fade from the
    // pose drawn (the held key 44) over the idle's 0.5 (`FUN_0028da00` D:L135042-135043, D:L135100-135103), the layer
    // gone from the pop's frame. *Was* (PAR-73): the layer held on the pop's frame ({ reload: 'seal_reload',
    // reloadFrame: 44, reloadWeight: 1 }), then its own weight 1 - blendWeight(t / 0.5) at key 44.
    run(1);
    expect(pose.stats().reload).toBeNull();
    expect(anim.stats().blend).toBe(0);                                          // the pose drawn: the held key
    expect(anim.stats().from).not.toBeNull();
    const pop = frames;
    run(15);
    expect(anim.stats().blend).toBeCloseTo(blendWeight(((frames - pop) * DT) / 0.5), 6);
    // Fire's reloadEnd at the lock's 1.6 s leaves the body's cross-fade to finish (*was:* `reloading()` true, the
    // layer's fade); a cut-short end stops a playing clip at once.
    pose.stopReload(true);
    expect(pose.reloading()).toBe(false);
    run(20);
    expect(anim.stats().blend).toBe(1);
    expect(pose.stats().reload).toBeNull();
    pose.startReload('stand', 1.6, 'rifle', false);
    pose.stopReload(false);
    expect(pose.reloading()).toBe(false);
  });
});

const absent = fixture('RUN/READERC.ZAR') === null || fixture('RUN/MOTION_P.ZAR') === null;

describe.skipIf(absent)('the disc\'s reload clips (research 150 §2)', () => {
  it('motion.rdr flags the four moving reloads BlendOverlay and no still one; NoInterrupt 0.35 crouched, 0.5 prone, none standing; NoPitchtwist on all but the pump', () => {
    const table = motionTableFromArchive(fixture('RUN/READERC.ZAR')!)!;
    const flags = (n: string) => { const e = table.get(n)!; return [e.blendOverlay ?? false, e.noInterrupt, e.noPitchtwist ?? false, e.playback]; };
    expect(flags('seal_reload')).toEqual([false, null, true, 1.6]);
    expect(flags('seal_crouch_reload')).toEqual([false, 0.35, true, 1.9]);
    expect(flags('seal_prone_reload')).toEqual([false, 0.5, true, 1.7]);
    expect(flags('seal_mv_reload')).toEqual([true, null, true, 1.2]);
    expect(flags('seal_p_reload')).toEqual([false, null, true, 1.8]);
    expect(flags('seal_p_mv_reload')).toEqual([true, null, true, 1.2]);
    expect(flags('seal_mv_reload_shotgun')).toEqual([true, null, true, 1.6]);
    expect(flags('seal_mv_pump_shotgun')).toEqual([true, null, false, 0.9]);
    expect(flags('seal_pump_shotgun')).toEqual([false, null, false, 0.9]);
    expect(flags('seal_reload_m203')).toEqual([false, null, true, 1.3]);
  });

  it('seal_mv_reload carries 14 parts from spinehi up with the rifle -- no skel_root, hips, spinelo or legs; seal_reload the whole body, 45 keys', () => {
    const [still, mv] = clipsFromPack(fixture('RUN/MOTION_P.ZAR')!, ['seal_reload', 'seal_mv_reload']);
    expect(still!.frameCount).toBe(45);
    expect(mv!.frameCount).toBe(33);
    expect(mv!.parts.map((p) => p.name)).toEqual(['spinehi', 'lbicep', 'lforearm', 'lhand', 'rbicep', 'rforearm', 'rhand', 'rifle', 'rshoulder_wgt', 'lshoulder_wgt', 'lscap', 'rscap', 'neck', 'head']);
    for (const n of ['skel_root', 'hips', 'spinelo', 'lthigh', 'rthigh', 'lcalf', 'rcalf']) expect(still!.parts.some((p) => p.name === n), n).toBe(true);
    const zar = Zar.parse(fixture('RUN/MOTION_P.ZAR')!);
    expect(zar.find('seal_mv_pistol2rifle')).toBeUndefined();                     // the moving swap back is the same clip backwards
  });
});

const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
};
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const plain = buildGrid(PARAMS, [], [], [FLOOR], OWNERS);
const crouchedWalker = (): Walker => { const w = new Walker(plain); w.place(0, 10, 0); w.stance = 'crouch'; return w; };

describe('the hold and the layer on one clock (FUN_005a82e0 462935-462940: ReloadTime slows the still clip)', () => {
  it('crouched with a ReloadTime 3 weapon (the M60E3) the mover lets the stick through on the tick the layer\'s phase passes 0.35; without one, the clip\'s own playback', () => {
    const w = crouchedWalker();
    expect(w.hold('seal_crouch_reload', 3)).toBe(true);                          // the period the page passes: reloadSeconds, 3 s still
    const { pose } = rig();
    pose.startReload('crouch', 3, 'rifle', false);
    let holdTick = -1, layerTick = -1;
    for (let i = 1; i <= 180 && (holdTick < 0 || layerTick < 0); i++) {
      w.tick({ forward: 1, right: 0, boost: false });
      if (holdTick < 0 && !w.holding) holdTick = i;
      pose.step(TICK, true);
      if (layerTick < 0 && pose.stats().reloadOverlay) layerTick = i;
    }
    expect(holdTick).toBeGreaterThan(0);
    expect(layerTick).toBe(holdTick);
    // PAR-67 (research 251 section 12.5): the cut reads the clip's phase a game frame behind the push's clock -- the hold
    // and the layer both, so they stay on one tick, a game frame later than PAR-61's `holdTick x TICK > at035`.
    const at035 = 3 * (27 / 28) * 0.35;                                          // 1.0125 s on the slowed clock
    expect(holdTick * TICK).toBeGreaterThan(at035 + GAME_FRAME_DT);
    expect((holdTick - 1) * TICK).toBeLessThanOrEqual(at035 + GAME_FRAME_DT + 1e-9);
    const v = crouchedWalker();
    expect(v.hold('seal_crouch_reload')).toBe(true);
    expect(v.holding!.seconds).toBeCloseTo(HOLD_SECONDS.seal_crouch_reload, 9);  // playback 1.9: the table's own
  });

  // PAR-69 (research 251 section 12.5): uncut, the hold is popped by the driver's end test (`FUN_00582540` D:L418193 ->
  // `FUN_0028c6e0` D:L134291-134302) on the phase a game frame behind the push's clock plus half a frame's step at the
  // clip's own playback (motion+0x10, D:L134294-134296) -- the ReloadTime's speed (entry+0x18, D:L462939) is not in it.
  it("PAR-69: uncut, the crouched hold comes off on the lagged clock with half the clip's own frame step: the M4A1's on tick 108 (its last key on 107), the M60E3's (ReloadTime 3) on 168 (at the period's step it would be 169)", () => {
    const at = (period: number): number => {
      const w = crouchedWalker();
      expect(w.hold('seal_crouch_reload', period)).toBe(true);
      let ticks = 0;
      while (w.holding && ticks < 400) { w.tick({ forward: 0, right: 0, boost: false }); ticks++; }
      return ticks;
    };
    const e = 27 / 28, G = GAME_FRAME_DT;
    expect(Math.ceil(1.9 * e * e * 60)).toBe(107);                                // the tick that reaches the last key
    expect(at(1.9)).toBe(108);
    expect(Math.floor((3 * e * e + G - (G * 3) / (2 * 1.9)) * 60) + 1).toBe(168);
    expect(Math.floor((3 * e * e + G / 2) * 60) + 1).toBe(169);                 // the speed folded into the step: not the read
    expect(at(3)).toBe(168);
  });
});

describe('the fire lock is the clip\'s life (PF-18, ruling PF.R37; research 150 §3.7, 218 §2)', () => {
  // FUN_005a7ab0 D:L462526-462555 answers while the stack's top is a reload or pump type, or while the overlay record's
  // node is `Moving rifle reload` / `Moving pistol reload`: the fire is held exactly as long as the reload clip lives.
  // `Fire` takes the cut from the pose (`FireSource.reloadCut`; main.ts's wiring, owed: `Play.takeReloadCut`) and holds
  // the carried overlay's life left plus `RELOAD_CUT_MARGIN_TICKS` -- never earlier than the room (`roomReloadLock.test.ts`).
  it("a standing reload cut as soon as it can be, on the fifth frame (RELOAD_CUT_DELAY_READING, PAR-67; the third under PAR-61): the clip is at its last key by 1.22 s and Fire fires again at the overlay's 1.164 s from its phase a game frame behind, not 1.6 (FUN_005a7ab0 D:L462548-462555)", () => {
    const r = lockRun({ stance: 'stand', seconds: 1.6, push: 0 });
    // The stick from the first frame; the push's initial skip and its place after the frame's driver hold the cut to the
    // first frame at or past two game frames (`RELOAD_CUT_DELAY_READING`: FUN_0028dc90 D:L135209-135212, FUN_00550ef0
    // D:L418180, the peek D:L418293; the push in `entity_post_tick`, FUN_001ec480 D:L50920-50935 -- PAR-67, research 251
    // section 12.5; PAR-61 took one game frame, the third).
    expect(RELOAD_CUT_DELAY_READING).toBeCloseTo(2 * GAME_FRAME_DT, 12);
    expect(4 * DT).toBeLessThan(RELOAD_CUT_DELAY_READING);
    expect(5 * DT).toBeGreaterThanOrEqual(RELOAD_CUT_DELAY_READING);
    expect(r.cut).toBeCloseTo(5 * DT, 9);                                         // the fifth frame's push: the overlay carries on
    // The overlay's life, `seal_mv_reload` 33 keys at playback 1.2: 1.2 x 32/33 = 1.164 s (FUN_0028d170 D:L134737), from
    // the phase the still clip had reached as the driver reads it (D:L418213), a game frame behind the push's clock:
    // (5 DT - G) / (1.6 x 44/45).
    const left = OVERLAY * (1 - (5 * DT - GAME_FRAME_DT) / (1.6 * (44 / 45)));
    expect(r.lastKey).not.toBeNull();
    // seal_mv_reload at key 32, its node freed: 5 DT + 1.1265 = 1.2098 s, the first frame at or past it 1.2167 s (PAR-61's
    // third-frame cut had it by 1.2 s).
    expect(r.lastKey!).toBeGreaterThanOrEqual(5 * DT + left - 1e-9);
    expect(r.lastKey!).toBeLessThanOrEqual(1.22 + 1e-9);
    expect(r.free).toBeGreaterThanOrEqual(5 * DT + left + MARGIN - 1e-9);         // never before the room's lock
    expect(r.free).toBeLessThanOrEqual(5 * DT + left + MARGIN + DT + 1e-9);
    expect(r.free).toBeLessThanOrEqual(1.25);                                     // by the overlay's 1.2 s and the margin: not 1.6
    expect(r.lockedAt(r.free - DT)).toBe(true);
    expect(r.shot).toBe(true);                                                    // and a round goes
    // Uncut, the lock is the start's length still (`reloadSeconds`).
    expect(lockRun({ stance: 'stand', seconds: 1.6, push: null }).free).toBeCloseTo(1.6, 1);
  });

  it('a crouched reload cut at 0.35 holds the fire 0.665 + 0.65 x 1.164 s; a cut prone, shotgun or pump reload holds nothing past the cut (the magazine was filled at the start)', () => {
    // Crouched: `seal_crouch_reload` 28 keys at 1.9, NoInterrupt 0.35 on the stack's phase as the driver reads it, a game
    // frame behind the push's clock (PAR-67): (t - G) / (1.9 x 27/28) -- the first frame past it is 41 x DT = 0.683 s
    // (phase 0.3548; the note's 0.665 = 0.35 x 1.9 is the phase on the playback; PAR-61's clock t / (1.9 x 27/28) gave
    // frame 39), and the overlay carries on for 1.164 x (1 - 0.3548) = 0.751 s: the lock ends 1.43 s in (+ the margin),
    // not 1.9.
    const c = lockRun({ stance: 'crouch', seconds: 1.9, push: 0 });
    expect(c.cut).toBeCloseTo(41 * DT, 9);
    const phase = (41 * DT - GAME_FRAME_DT) / (1.9 * (27 / 28));
    expect(phase).toBeGreaterThan(0.35);
    expect((40 * DT - GAME_FRAME_DT) / (1.9 * (27 / 28))).toBeLessThanOrEqual(0.35);
    const left = OVERLAY * (1 - phase);
    expect(c.free).toBeGreaterThanOrEqual(c.cut! + left + MARGIN - 1e-9);
    expect(c.free).toBeLessThanOrEqual(c.cut! + left + MARGIN + DT + 1e-9);
    // The note's figure (research 150: 0.665 + 0.65 x 1.164, on the push's clock) and the game frame the cut comes later.
    expect(Math.abs(c.free - (0.665 + 0.65 * 1.164 + GAME_FRAME_DT))).toBeLessThan(2 * TICK);
    expect(lockRun({ stance: 'crouch', seconds: 1.9, push: null }).free).toBeCloseTo(1.9, 1);   // uncut: the clip's end
    // Prone (`seal_prone_reload` 30 keys at 1.7, NoInterrupt 0.5), the shotgun reload, the pump: nothing carries on.
    const prone = lockRun({ stance: 'prone', seconds: 1.7, push: 0 });
    expect(prone.cut).toBeCloseTo(52 * DT, 9);                                    // 0.5 x 1.7 x 29/30 + G = 0.855 s: frame 52 (PAR-61: 50)
    const shotgun = lockRun({ stance: 'stand', seconds: 1.6, push: 0.1, family: 'shotgun' });
    const pump = lockRun({ stance: 'stand', seconds: 0.9, push: 0.1, afterShot: true });
    for (const [what, x] of [['prone', prone], ['shotgun', shotgun], ['pump', pump]] as const) {
      expect(x.cut, what).not.toBeNull();
      expect(x.free, what).toBeGreaterThanOrEqual(x.cut! + MARGIN - 1e-9);         // the margin, never before the room's
      expect(x.free, what).toBeLessThanOrEqual(x.cut! + MARGIN + DT + 1e-9);        // and nothing more
    }
  });
});

/** `seal_mv_reload`'s life: 33 keys at playback 1.2 -> its last key at 1.2 x 32/33 (`FUN_0028d170` D:L134737). */
const OVERLAY = 1.2 * (32 / 33);
/** The page's one-tick margin past the room's lock (`RELOAD_CUT_MARGIN_TICKS`). */
const MARGIN = RELOAD_CUT_MARGIN_TICKS * TICK;

/**
 * PF-18: `Fire` and the pose on one frame clock as `main.ts` runs them -- `Play.frame` (the pose's step) before
 * `fire.update`, `reloadStart`/`afterShot` to the pose (`Play.weaponEvent`), the source's `reloadCut` the pose's cut
 * (`Play.takeReloadCut`). `push`: the second (from the clip's start) the stick first passes 0.1, held after; null never.
 * Times are from the clip's start: `cut` the frame the still clip was cut, `lastKey` the overlay's last key, `free` the
 * first frame `Fire` holds no lock.
 */
function lockRun(o: { stance: 'stand' | 'crouch' | 'prone'; seconds: number; push: number | null; family?: 'shotgun'; afterShot?: boolean }) {
  const { pose, anim } = rig();
  const record: WeaponRecord = o.afterShot
    ? { ...DEFAULT_RIFLE, name: '870', id: 84, magazine: 8, mags: 5, reloadAfterShot: true, reloadDelayAfterShot: 0.1 }
    : o.family === 'shotgun' ? { ...DEFAULT_RIFLE, name: '870', id: 84, magazine: 8, mags: 5 } : DEFAULT_RIFLE;
  let start: number | null = null, clock = 0, cut: number | null = null, lastKey: number | null = null;
  const fire = new Fire({
    grid: () => plain, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), reloadSeconds: () => o.seconds,
    reloadCut: () => { const n = pose.takeReloadCut(); if (n && start !== null) cut = clock - start; return n; },
  }, record, undefined, () => 0.5);
  fire.subscribe((e) => {
    if (e.type === 'reloadStart' || e.type === 'afterShot') { pose.startReload(o.stance, e.seconds, e.family ?? null, false); start = clock; }
    else if (e.type === 'reloadEnd') pose.stopReload(e.completed);
  });
  const locked = (): boolean => fire.state().magazine.reloading || fire.state().afterShot;
  if (o.afterShot) expect(fire.shoot()).not.toBeNull();
  else expect(fire.reload()).toBe(true);
  const mover: MoverSnapshot = { ...REST, stance: o.stance, crouched: o.stance === 'crouch' };
  const trace: [number, boolean][] = [];
  for (let i = 0; i < 400 && !(start !== null && !locked()); i++) {
    clock += DT;
    const at = start === null ? null : clock - start;
    pose.step(DT, at !== null && o.push !== null && at >= o.push - 1e-9);         // `Play.frame`: the pose first
    anim.step(DT, mover);
    if (lastKey === null && start !== null && pose.stats().reloadOverlay && pose.stats().reloadFrame === 32) lastKey = clock - start;
    fire.update(DT);                                                              // then `fire.update`
    if (start !== null) trace.push([clock - start, locked()]);
  }
  expect(start).not.toBeNull();
  const free = clock - start!;
  const shot = fire.shoot() !== null;
  return { cut, lastKey, free, shot, lockedAt: (t: number) => trace.find(([x]) => Math.abs(x - t) < 1e-6)?.[1] ?? null };
}

// ---- review F-A of 801f3732: the page's hold and the room's on one derivation -----------------------------------------

/**
 * The game's hold is the clip `FUN_005a82e0` pushed (D:L462928) at the speed it set (D:L462935-462941): `FUN_00550ef0`
 * (D:L418176-418203) with `FUN_00587c20` (D:L445549-445565) reads that top entry's phase against that clip's own
 * `NoInterrupt`. The mover's hold (`reloadHold`) is the rifle's or the pistol's crouched or prone clip, so a period is
 * the hold's own only for those two families; the 870's pump, the bolts' shotgun reload and the m203 reload are other
 * clips (no `NoInterrupt` on the disc) the hold only stands in for. Both sides must give the stand-in one period.
 */
const absentSim = fixture('RUN/READERC.ZAR') === null || fixture('RUN/MOTION_P.ZAR') === null;
const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)), '../../scene/test/golden/weapon-records.json');
const discRecords = (): Map<number, WeaponRecord> =>
  new Map(Object.values(JSON.parse(readFileSync(GOLDEN, 'utf8')).records as Record<string, WeaponRecord>).map((r) => [r.id, r]));
/** `zweapon.rdr`'s M203 FRAG as the kit table reads it (research 94 §C4.1; `fire.test.ts`'s). */
const FRAG: KitRound = {
  record: { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1 },
  piercing: 0, fireWait: 1, reloadAfterShot: true, reloadDelayAfterShot: 0.5, icon: null,
};
type HoldCase = 'reload' | 'afterShot' | 'roundReload' | 'roundAfterShot';

/** The page: `Fire` with `Play.reloadSeconds`'s answer still in `stance`, and `main.ts`'s line on its first reload event. */
function pagePeriod(sim: SimClips, record: WeaponRecord, stance: 'crouch' | 'prone', how: HoldCase): number | undefined | null {
  let got: number | undefined | null = null;
  const fire = new Fire({
    grid: () => plain, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
    reloadSeconds: (family, reloadTime) => reloadSeconds(sim.clips, sim.table, stance, false, family, reloadTime),
  }, { ...record, mags: Math.max(2, record.mags) }, undefined, () => 0.5);   // a spare to reload from (the M40A1 has one)
  fire.subscribe((e) => {
    if (got === null && (e.type === 'reloadStart' || e.type === 'afterShot')) got = reloadHoldPeriod(e.family, e.seconds);   // main.ts
  });
  if (how === 'roundReload' || how === 'roundAfterShot') {
    const ring = new MagazineRing(6, 2);
    if (how === 'roundReload') ring.fire();
    fire.setRound({ id: 175, round: FRAG, ring });
  }
  if (how === 'reload' || how === 'roundReload') expect(fire.reload(), `${record.name} ${how}`).toBe(true);
  else expect(fire.shoot()).not.toBeNull();
  for (let i = 0; i < 300 && got === null; i++) fire.update(TICK);
  return got;
}

function flatSimMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = { ...FLOOR, points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const ground = packGround(params, [floor], OWNERS);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: slots, notes: [] };
}

/** The room with player 1 settled in `stance`, its commands sent one a step; `send` runs one more command. */
function roomIn(sim: SimClips, stance: 'crouch' | 'prone') {
  const room = new Room(flatSimMap(), sim, { now: () => 0, random: () => 0.5, launchCountdownS: 0 });
  const conn = { send: () => undefined, close: () => undefined };
  for (const id of [1, 2]) room.hello(id, conn, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!;
  let seq = p.sim.seq;
  const send = (over: Partial<Command> = {}): void => {
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: ++seq, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over }] }));
    room.step();
  };
  send({ buttons: Button.Stance, stance: stance === 'crouch' ? 1 : 2 });
  for (let i = 0; i < 180; i++) send();
  expect(p.sim.walker.posture).toBe(stance);
  return { room, p, send, setRecord: (r: WeaponRecord) => { (p as { records: readonly [WeaponRecord, WeaponRecord] }).records = [r, HELD_SIDEARM]; } };
}

/** A hold's run on a fresh walker: the period it takes and the tick the stick forward lets it go. */
function holdRun(clip: HoldClip, period: number | undefined): { period: number; release: number } {
  const w = crouchedWalker();
  expect(w.hold(clip, period)).toBe(true);
  const at = w.holding!.period;
  for (let i = 1; i <= 300; i++) { w.tick({ forward: 1, right: 0, boost: false }); if (!w.holding) return { period: at, release: i }; }
  return { period: at, release: -1 };
}

describe('the page and the room hold for one period (review F-A of 801f3732: FUN_00550ef0 418176-418203 reads the pushed clip)', () => {
  it.skipIf(absentSim)('the 870 crouched after a shot and the M203 round-mode reload crouched: both movers let the stick through on the same tick', () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    const disc = discRecords();
    const clip = reloadHold('crouch' as Stance, false)!;
    const r = roomIn(sim, 'crouch');
    const rows: { id: number; how: HoldCase; page: number; room: number; wire: number }[] = [];
    for (const [id, how] of [[84, 'afterShot'], [61, 'roundReload']] as const) {
      const record = disc.get(id)!;
      expect(record.reloadTime ?? 0).toBe(0);                                     // research 94 §C1.2: none of the four
      const page = holdRun(clip, pagePeriod(sim, record, 'crouch', how) ?? undefined);
      r.setRecord(record);
      const room = holdRun(clip, r.p.sim.holdPeriod!(clip, 0));
      // The room's own mover, on the wire: the hold bit and the stick forward from the same command.
      r.send({ buttons: holdBits(clip), forward: 1 });
      let wire = r.p.sim.walker.holding ? -1 : 1;
      for (let i = 2; i <= 300 && wire < 0; i++) { r.send({ forward: 1 }); if (!r.p.sim.walker.holding) wire = i; }
      rows.push({ id, how, page: page.release, room: room.release, wire });
      for (let i = 0; i < 120; i++) r.send();                                    // settle again
    }
    // The page's hold, the room's period on a mover and the room's own mover on the wire: one release tick each case
    // (seal_crouch_reload's own playback, 1.9 s: 0.35 x 1.9 x 27/28 + a game frame -> tick 41; PAR-67, research 251
    // section 12.5: the cut reads a reload's phase a game frame behind the push's clock. Tick 39 before PAR-67.)
    expect(rows).toEqual(rows.map((x) => ({ ...x, room: x.page, wire: x.page })));
    expect(rows.map((x) => x.page)).toEqual([41, 41]);
  });

  it.skipIf(absentSim)('every disc record the family, the after-shot, the round mode or ReloadTime touches, crouched and prone: one period', () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    const disc = discRecords();
    const carriers = [52, 61, 63];
    const touched = [...disc.values()].filter((r) => (r.reloadTime ?? 0) > 0 || r.reloadAfterShot || carriers.includes(r.id) || r.id === 84 || (r.id >= 101 && r.id <= 103));
    expect(touched.map((r) => r.id).sort((a, b) => a - b)).toEqual([52, 61, 63, 81, 83, 84, 91, 92, 101, 102, 103]);
    const rows: { what: string; page: [number, number]; room: [number, number] }[] = [];
    for (const stance of ['crouch', 'prone'] as const) {
      const clip = reloadHold(stance, false)!;
      const r = roomIn(sim, stance);
      for (const record of touched) {
        const cases: HoldCase[] = ['reload', ...(record.reloadAfterShot ? ['afterShot' as const] : []), ...(carriers.includes(record.id) ? ['roundReload' as const, 'roundAfterShot' as const] : [])];
        r.setRecord(record);
        const room = holdRun(clip, r.p.sim.holdPeriod!(clip, 0));
        for (const how of cases) {
          const page = holdRun(clip, pagePeriod(sim, record, stance, how) ?? undefined);
          rows.push({ what: `${stance} ${record.name} ${how}`, page: [+page.period.toFixed(3), page.release], room: [+room.period.toFixed(3), room.release] });
        }
      }
    }
    expect(rows).toEqual(rows.map((x) => ({ ...x, room: x.page })));
    // F2 kept: a ReloadTime still is the hold's period on both (the M60E3's 3 s); the stand-ins keep the clip's 1.9 / 1.7.
    expect(rows.filter((x) => /M60E3 reload|870 afterShot|M4A1-M203 roundReload/.test(x.what)).map((x) => [x.what, x.page[0]])).toEqual([
      ['crouch M4A1-M203 roundReload', 1.9], ['crouch 870 afterShot', 1.9], ['crouch M60E3 reload', 3],
      ['prone M4A1-M203 roundReload', 1.7], ['prone 870 afterShot', 1.7], ['prone M60E3 reload', 3],
    ]);
  });
});

// ---- PAR-73: the page's pose asks the cut up to the pop --------------------------------------------------------------

/**
 * PAR-73 (research 251 section 12.5, "PAR-73"): a still reload's clip comes off at the driver's end test on the lagged
 * clock (PAR-69's `reloadEnded`: `FUN_00582540` D:L418193 -> `FUN_0028c6e0` D:L134291-134302), a command past its last
 * key where its period is its playback, and until then the stick still cuts it (`FUN_00550ef0` D:L418180-418187;
 * PAR-72: on the pop's own command the end wins, `FUN_00587c20` D:L445526-445528). The room's `cutAt` asks the cut up to
 * the pop; the page's pose stopped at the drawn last key, so on the command between, `Fire` kept the start's length.
 */

/**
 * The room's lock for weapon `w`'s still standing reload, the stick held from `push` commands past its clip's first
 * (null: never): its end in commands from that first command (`reloadUntil` less the life's start).
 */
function roomStandLock(sim: SimClips, w: 0 | 1, record: WeaponRecord | null, push: number | null): number {
  const room = new Room(flatSimMap(), sim, { now: () => 0, random: () => 0.5, launchCountdownS: 0 });
  const conn = { send: () => undefined, close: () => undefined };
  for (const id of [1, 2]) room.hello(id, conn, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!;
  if (record) (p as { records: readonly [WeaponRecord, WeaponRecord] }).records = [record, HELD_SIDEARM];
  let seq = p.sim.seq;
  const send = (over: Partial<Command> = {}): void => {
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: ++seq, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: w, ...over }] }));
    room.step();
  };
  for (let i = 0; i < 60; i++) send();
  if (w === 1) {
    send({ buttons: Button.Swap, weapon: 1 });
    for (let i = 0; i < 120; i++) send();
    expect(p.sim.weapon).toBe(1);
  }
  room.text(1, { type: 'reload', seq: p.sim.seq });
  send();
  const life = (p as unknown as { readonly reloadLife: readonly [{ start: number } | null, { start: number } | null] }).reloadLife[w];
  expect(life, 'the still clip watched').not.toBeNull();
  const start = life!.start;
  for (let i = 0; i < 200; i++) send({ forward: push !== null && p.ran + 1 - start >= push ? 1 : 0 });
  return p.reloadUntil[w] - start;
}

/**
 * The page on the disc's clips, as `main.ts` runs it (`Play.frame`'s pose step before `fire.update`, the pose's cut to
 * `Fire` through `takeReloadCut`), standing still, the stick held from `push` frames past the clip's start (null: never):
 * the first frame `Fire` holds no lock, and the pose's clip, key and weight on each frame from the start. PAR-79:
 * `flight`, the body in the air on the frames `from` .. `to - 1` past the start and back on the floor by a clipless
 * landing on `to` (the snapshot's `airborne`, which `Play.frame` hands the pose; no cut is asked in the air nor on the
 * landing's frame, `./play` `reloadCut`).
 */
function pageStandLock(sim: SimClips, record: WeaponRecord, item: 'rifle' | 'pistol', push: number | null, flight: { from: number; to: number } | null = null) {
  const pose = new WeaponPose(new Map(sim.clips.map((c) => [c.name, c])), sim.table);
  pose.item = item;
  let start: number | null = null, frame = 0;
  const fire = new Fire({
    grid: () => plain, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
    reloadSeconds: (family, reloadTime) => reloadSeconds(sim.clips, sim.table, 'stand', false, family, reloadTime),
    reloadCut: () => pose.takeReloadCut(),
  }, { ...record, mags: Math.max(2, record.mags) }, undefined, () => 0.5);
  fire.subscribe((e) => {
    if (e.type === 'reloadStart') { pose.startReload('stand', e.seconds, e.family ?? null, false); start = frame; }
    else if (e.type === 'reloadEnd') pose.stopReload(e.completed);
  });
  expect(fire.reload()).toBe(true);
  const locked = (): boolean => fire.state().magazine.reloading;
  const drawn = new Map<number, { reload: string | null; key: number; weight: number }>();
  for (let i = 0; i < 400 && !(start !== null && !locked()); i++) {
    frame++;
    const at = start === null ? null : frame - start;
    const airborne = flight !== null && at !== null && at >= flight.from && at < flight.to;
    const unasked = airborne || (flight !== null && at === flight.to);
    pose.step(DT, at !== null && push !== null && at >= push && !unasked, airborne);
    if (at !== null) { const s = pose.stats(); drawn.set(at, { reload: s.reload, key: s.reloadFrame, weight: s.reloadWeight }); }
    fire.update(DT);
  }
  expect(start).not.toBeNull();
  return { free: frame - start!, drawn };
}

describe.skipIf(absentSim)("PAR-73: the page's pose asks the cut up to the pop, not the drawn last key (research 251 section 12.5)", () => {
  it("a pistol still reload pushed on the command between its last key (the 100th) and its pop (the 101st): the room cuts it there and its lock ends on the 104th, the page's Fire one margin tick after (the 105th), not at its own 1.8 s; uncut, the pose holds key 25 until the pop and fades from there", () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    // `seal_p_reload` 26 keys at 1.8: its last key at 1.8 x (25/26)^2 = 1.6642 s (the 100th command), its pop at the
    // first command past 1.6642 + G/2 (the 101st). Cut on the 100th, `seal_p_mv_reload` (21 keys at 1.2: 1.1429 s) carries
    // on from the phase a game frame behind, (100/60 - G) / (1.8 x 25/26) = 0.9437: 0.0644 s left, four commands up.
    const e = 25 / 26;
    expect(Math.ceil(1.8 * e * e * 60)).toBe(100);
    const phase = (100 / 60 - GAME_FRAME_DT) / (1.8 * e);
    const left = 1.2 * (20 / 21) * (1 - phase);
    expect(100 + Math.ceil(left * 60 - 1e-9)).toBe(104);
    // The room (`room.ts` `cutAt` on `reloadCutAt`): cut on the 100th, the lock to the 104th; uncut, its timer's 107th.
    expect(roomStandLock(sim, 1, null, 100)).toBe(104);
    expect(roomStandLock(sim, 1, null, null)).toBe(107);
    // The page: cut, its Fire holds one tick past the room's (`RELOAD_CUT_MARGIN_TICKS`); uncut, its own timer ends on the
    // room's command -- never earlier than the room, at most the margin later.
    const cutPage = pageStandLock(sim, HELD_SIDEARM, 'pistol', 100);
    const whole = pageStandLock(sim, HELD_SIDEARM, 'pistol', null);
    expect(cutPage.free).toBe(104 + RELOAD_CUT_MARGIN_TICKS);
    expect(whole.free).toBe(107);
    expect(cutPage.drawn.get(100)).toMatchObject({ reload: 'seal_p_mv_reload' });  // the overlay carried from the cut
    // Uncut, the drawn clip: its last key on the 100th held at full weight, the pop on the 101st (the fade's start, as a
    // cut's cross-fade starts on its own frame), fading from the 102nd over the default BlendTime (no idle sampled here).
    expect(whole.drawn.get(99)!.key).toBeLessThan(25);
    expect(whole.drawn.get(100)).toEqual({ reload: 'seal_p_reload', key: 25, weight: 1 });
    // PAR-95 (research 251 section 12.9): the pop on the 101st hands the body to its cross-fade from the pose drawn (the
    // animator's, `PoseLayer.crossFade`): the layer is gone from it. *Was* (PAR-73): { reload: 'seal_p_reload', key: 25,
    // weight: 1 } on the 101st and the layer's weight 1 - blendWeight(DT / 0.4) on the 102nd.
    expect(whole.drawn.get(101)).toEqual({ reload: null, key: 0, weight: 0 });
    expect(whole.drawn.get(102)).toEqual({ reload: null, key: 0, weight: 0 });
  });

  it("the shotgun's still reload (nothing carries on) pushed between its last key (the 86th) and its pop (the 87th) ends the room's lock there, the page's a margin tick later -- not at 1.6 s; the M4A1's, whose carried tail reaches its own end, is unmoved", () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    const rec870 = discRecords().get(84)!;
    // `seal_reload_shotgun` 18 keys at 1.6: the last key at 1.6 x (17/18)^2 = 1.4272 s (the 86th), the pop the 87th.
    expect(Math.ceil(1.6 * (17 / 18) ** 2 * 60)).toBe(86);
    expect(roomStandLock(sim, 0, rec870, 86)).toBe(86);
    expect(roomStandLock(sim, 0, rec870, null)).toBe(95);
    expect(pageStandLock(sim, rec870, 'rifle', 86).free).toBe(86 + RELOAD_CUT_MARGIN_TICKS);
    expect(pageStandLock(sim, rec870, 'rifle', null).free).toBe(95);
    // `seal_reload` 45 keys at 1.6: cut on the 92nd (its last key; the pop the 93rd), the overlay to the 95th -- the
    // timer's own end (PAR-72's table): room and page as uncut.
    expect(roomStandLock(sim, 0, null, 92)).toBe(95);
    expect(pageStandLock(sim, DEFAULT_RIFLE, 'rifle', 92).free).toBe(95);
  });
});

// ---- PAR-79: the covered still clip's clock at a clipless landing ------------------------------------------------------

/**
 * PAR-79 (research 251 section 12.3, "PAR-79"; PTW.R3 with roomReloadLock.test and stillReloadLife.test): the fall covers
 * the still clip on the first driver tick in the air (`FUN_005af930` D:L466956-466970 -> `FUN_0057e050` D:L440726), and
 * the tick's advance moves only the top (`FUN_0057a330` D:L438708): the clip's phase stands. A clipless landing pops the
 * fall alone (`FUN_00589aa0` D:L466900-466901) and hands the clip back, its phase kept (`FUN_0028da00`
 * D:L135104-135107); the landing's tick asks no cut (D:L418176), the next driver tick is a game frame on.
 */

/**
 * The room's lock for a standing M4A1 still reload lifted off the floor before the command `air` past its clip's first,
 * the stick held at full from there (no cut in the air, a clipless landing): its end and the landing's command, both
 * from the clip's first command.
 */
function roomCoveredLock(sim: SimClips, air: number): { lock: number; back: number } {
  const room = new Room(flatSimMap(), sim, { now: () => 0, random: () => 0.5, launchCountdownS: 0 });
  const conn = { send: () => undefined, close: () => undefined };
  for (const id of [1, 2]) room.hello(id, conn, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' }, `10.0.0.${id}`);
  room.step();
  const p = room.player(1)!;
  const w = p.sim.walker;
  let seq = p.sim.seq;
  const send = (over: Partial<Command> = {}): void => {
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [{ seq: ++seq, forward: 0, right: 0, yaw: w.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over }] }));
    room.step();
  };
  for (let i = 0; i < 60; i++) send();
  room.text(1, { type: 'reload', seq: p.sim.seq });
  send();
  const life = (p as unknown as { readonly reloadLife: readonly [{ start: number } | null, { start: number } | null] }).reloadLife[0];
  expect(life, 'the still clip watched').not.toBeNull();
  const start = life!.start;
  let back = -1;
  for (let i = 0; i < 200; i++) {
    const next = p.ran + 1 - start;
    if (next === air) { w.state.y += 6; w.setAirborne(true); }            // the test's ledge
    send({ forward: next >= air ? 1 : 0 });
    if (back < 0 && next >= air && !w.airborne) { back = next; expect(w.landing!.clip).toBeNull(); }
  }
  return { lock: p.reloadUntil[0] - start, back };
}

describe.skipIf(absentSim)("PAR-79: the covered still clip's clock stands through the flight, room and page on one command (research 251 section 12.3)", () => {
  it("a standing M4A1 reload covered from its 20th command and handed back at a clipless landing at a full stick: the room cuts it a game frame past the landing, the overlay's life from the phase its stood clock gives, and the page's Fire frees one margin tick after -- not off the landing's next command on the clock that ran through the flight", () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    const air = 20;
    const room = roomCoveredLock(sim, air);
    const stood = room.back - air;                                                // the flight's commands
    expect(stood).toBeGreaterThan(3);
    const frame = Math.ceil(GAME_FRAME_DT * 60 - 1e-9);                          // a game frame on the commands: 3
    expect(frame).toBe(3);
    const cut = room.back + frame;
    // The phase the cut reads on the stood clock, a game frame behind the push's (PAR-67): (cut - stood)/60 - G over the
    // period x 44/45; `seal_mv_reload` carries on for 1.164 x (1 - it).
    const phase = ((cut - stood) / 60 - GAME_FRAME_DT) / (1.6 * (44 / 45));
    const left = OVERLAY * (1 - phase);
    expect(room.lock).toBe(cut + Math.ceil(left * 60 - 1e-9));
    expect(room.lock).toBeLessThan(95);                                           // the cut shortens the timer's lock
    const page = pageStandLock(sim, DEFAULT_RIFLE, 'rifle', room.back + 1, { from: air, to: room.back });
    expect(page.free).toBe(room.lock + RELOAD_CUT_MARGIN_TICKS);
  });

  it("the page's pose runs the stood clock to its end: covered 30 frames, a push on its own 92nd command cuts the clip, on its 93rd the clip has popped uncut (PAR-69's end, PAR-72's order)", () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    const pushedOn = (k: number): boolean => {
      const pose = new WeaponPose(new Map(sim.clips.map((c) => [c.name, c])), sim.table);
      pose.startReload('stand', 1.6, 'rifle', false);
      // In the air on frames 20 to 49, back on the floor on the 50th: frame f >= 50 is the clip's command f - 30.
      for (let f = 1; f < k + 30; f++) pose.step(DT, false, f >= 20 && f < 50);
      pose.step(DT, true, false);
      return pose.takeReloadCut() !== null;
    };
    expect(pushedOn(92)).toBe(true);
    expect(pushedOn(93)).toBe(false);
  });
});

// ---- PAR-82: the m203's still clip at a landing -----------------------------------------------------------------------

/**
 * PAR-82 (research 251 section 12.3, "PAR-82"; PTW.R3 with roomReloadLock.test and stillReloadLife.test): `Rifle m203
 * reload` is never covered by the fall -- it is in the set that keeps `FUN_005af930` out of its airborne branch
 * (D:L466816-466828) -- so it plays on its own clock in the air, and the landing branch pops it, a clip played or none
 * (D:L466897, D:L466900-466901). The page's pose has no landing of its own: it plays the clip on through the flight
 * (PAR-79's `fallCovers`) and is taken off by `Fire`'s `reloadEnd` when the walk's landing pop (`landingPops` with the
 * life's family, `reloadPopped`) ends the lock -- the landing's own command, the room's.
 */
describe.skipIf(absentSim)("PAR-82: the m203's still clip on the page's pose through a flight, taken off at the landing's command", () => {
  it("the pose plays seal_reload_m203 on through the flight; a clipless landing's pop ends Fire's lock and takes the clip off the pose on the landing's frame, so the stick at full never cuts it a game frame on (was: kept, then cut, its overlay carried)", () => {
    const sim = simClipsFromBytes(fixture('RUN/MOTION_P.ZAR')!, fixture('RUN/READERC.ZAR')!);
    const pose = new WeaponPose(new Map(sim.clips.map((c) => [c.name, c])), sim.table);
    const carrier = discRecords().get(61)!;
    expect(carrier.name).toBe('M4A1-M203');
    const fire = new Fire({
      grid: () => plain, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }),
      reloadSeconds: (family, reloadTime) => reloadSeconds(sim.clips, sim.table, 'stand', false, family, reloadTime),
    }, carrier, undefined, () => 0.5);
    fire.setRound({ id: 175, round: FRAG, ring: new MagazineRing(6, 1) });
    const life = new StillReloadLife();
    let count = 0, start = -1;
    // The page's wiring: `./play` `weaponEvent` (the pose) and `./matchFirearm` (the life).
    fire.subscribe((e) => {
      if (e.type === 'afterShot') {
        start = count;
        pose.startReload('stand', e.seconds, e.family, false);
        life.start(sim.clips, sim.table, 'stand', [0, 0, 0], e.family, e.seconds, count);
      } else if (e.type === 'reloadEnd') {
        pose.stopReload(e.completed);
        if (!e.completed) life.end();
      }
    });
    expect(fire.shoot()).not.toBeNull();
    for (let i = 0; i < 60 && start < 0; i++) { count++; fire.update(DT); }
    expect(start).toBeGreaterThan(0);
    expect(pose.stats().reload).toBe('seal_reload_m203');
    // On the floor to the clip's 10th command, in the air on its 10th to 29th, landed with no clip on its 30th; the stick
    // at full from the take-off (no cut in the air nor on the landing's command: `./play` `reloadCut`).
    const air = start + 10, back = start + 30;
    const keys: number[] = [];
    let cutAfter: number | null = null;
    while (count < back + 10) {
      count++;
      fire.update(DT);
      const airborne = count >= air && count < back;
      pose.step(DT, count > back, airborne);
      if (airborne) keys.push(pose.stats().reloadFrame);
      if (count === back && landingPops({ clip: null }, life.family())) reloadPopped('landing', fire, life, count);
      if (count === back) {
        expect(fire.state().afterShot, "the landing's command: the lock ends").toBe(false);
        expect(pose.stats().reload, "the landing's frame: off the pose").toBeNull();
        expect(life.lives(count + 1)).toBe(false);
      }
      if (cutAfter === null && pose.takeReloadCut() !== null) cutAfter = count;
    }
    expect(keys.every((k, i) => i === 0 || k > keys[i - 1]!), 'not covered: its key moves on in the air').toBe(true);
    expect(cutAfter).toBeNull();
    expect(pose.stats().reload).toBeNull();
  });
});
