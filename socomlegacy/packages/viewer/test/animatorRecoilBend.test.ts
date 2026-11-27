import { describe, expect, it } from 'vitest';
import { IDENTITY, partMatrix, Skeleton, type MotionClip, type MotionPart, type SkeletonPart } from '@s2u/scene';
import { Animator, BANK_FACTOR, qmul, quatOfMatrix, type MoverSnapshot } from '../src/animator';
import { bendQuat, bendTable } from '../src/recoilBend';
import type { MotionEntry } from '../src/motionTable';

/**
 * Research 442 (LATER 1144): the body's recoil bend laid in the animator's after-clip block, as `CZSealBody_Tick_0`
 * `FUN_0057a330` orders it -- after the head look (D:L439152-439191) and the aim's twist, `FUN_0057b550` (D:L439196),
 * then the run's bank on `spinelo` (D:L439197-439204). The mover carries the body's value and the hand's item
 * (`MoverSnapshot.recoilBend`); the table is the stance's by the hand (`bendTable`).
 */
const Q_ID: [number, number, number, number] = [0, 0, 0, 1];
const BONES: [string, number, number[]][] = [
  ['skel_root', -1, [0, 11, 0]], ['hips', 0, [0, 0, 0]], ['spinelo', 1, [0, 1, 0]], ['spinehi', 2, [0, 3, 0]], ['rbicep', 3, [-2, 2, 0]],
];
function skeleton(): Skeleton {
  const part = ([name, parent, t]: [string, number, number[]], index: number): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  return new Skeleton('bend', IDENTITY, BONES.map(part));
}
function still(name: string): MotionClip {
  const parts: MotionPart[] = BONES.map(([bone, , t], index) => ({
    index, name: bone, flags: 0x0c | 0x10 | 0x20, translations: Float32Array.from(t), rotations: Float32Array.from(Q_ID),
  }));
  return { name, version: 5, duration: 10 / 30, frameCount: 10, rate: 30, unknown10: -1, unknown14: 1, parts };
}
const REST: MoverSnapshot = {
  vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
  ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
};
const local = (sk: Skeleton, name: string): { q: number[]; t: number[] } => {
  const m = sk.local[sk.indexOf(name)]!;
  return { q: quatOfMatrix(m), t: [m[12]!, m[13]!, m[14]!] };
};
const row = (stance: string, hand: string, bone: string) => bendTable(stance, hand)!.find((r) => r.bone === bone)!;
const closeQ = (a: readonly number[], b: readonly number[]): void => {
  const s = Math.sign(a[3]! * b[3]! + a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) || 1;
  a.forEach((c, i) => expect(c).toBeCloseTo(s * b[i]!, 5));
};
const bent = (stance: MoverSnapshot['stance'], value: number, hand: 'rifle' | 'pistol' | null, extra: Partial<MoverSnapshot> = {}) => {
  const sk = skeleton();
  const anim = new Animator(sk, [still('seal_stand'), still('seal_crouch'), still('seal_prone')], null);
  anim.step(1 / 60, { ...REST, stance, crouched: stance === 'crouch', recoilBend: { value, hand }, ...extra } as MoverSnapshot);
  return sk;
};

describe('research 442: the recoil bend in the after-clip block (FUN_0057a330 D:L439196)', () => {
  it('stand, rifle, v 1: each table bone turned by bendQuat(1, axis) before its pose, the offset times v added', () => {
    const sk = bent('stand', 1, 'rifle');
    closeQ(local(sk, 'spinehi').q, bendQuat(1, row('stand', 'rifle', 'spinehi').axis!));
    closeQ(local(sk, 'rbicep').q, bendQuat(1, row('stand', 'rifle', 'rbicep').axis!));
    const off = row('stand', 'rifle', 'rbicep').offset;
    local(sk, 'rbicep').t.forEach((c, i) => expect(c).toBeCloseTo([-2, 2, 0][i]! + off[i]!, 5));
    const hips = row('stand', 'rifle', 'hips');
    expect(hips.axis).toBeNull();                                        // the default rotation: the hips keep theirs
    closeQ(local(sk, 'hips').q, Q_ID);
    local(sk, 'hips').t.forEach((c, i) => expect(c).toBeCloseTo(hips.offset[i]!, 5));
  });

  it('no value, no gun in the hand, or no field: the pose is the clip\'s', () => {
    for (const sk of [bent('stand', 0, 'rifle'), bent('stand', 2, null), (() => {
      const s = skeleton();
      new Animator(s, [still('seal_stand')], null).step(1 / 60, REST);
      return s;
    })()]) {
      for (const [bone, , t] of BONES) {
        closeQ(local(sk, bone).q, Q_ID);
        local(sk, bone).t.forEach((c, i) => expect(c).toBeCloseTo(t[i]!, 5));
      }
    }
  });

  it('prone, pistol: the prone pistol table (its spine keeps the default rotation)', () => {
    const sk = bent('prone', 1.5, 'pistol');
    expect(row('prone', 'pistol', 'spinelo').axis).toBeNull();
    closeQ(local(sk, 'spinelo').q, Q_ID);
    closeQ(local(sk, 'rbicep').q, bendQuat(1.5, row('prone', 'pistol', 'rbicep').axis!));
  });

  it('the run\'s bank is laid after the bend on spinelo (D:L439196 before D:L439197-439204)', () => {
    const turnRate = 2, speed = 65;
    // A running stand needs a run cycle to pose at all (as animator.test.ts's bank case): without one the play has no
    // nodes and the step returns before the after-clip block (the box's red at fa929eb3f6 was this test's fault).
    const run: MotionEntry = { looped: true, playback: 1, maxVelocity: 6.5, blendTime: null, transitionA: 4.01, transitionB: 6.5, noInterrupt: null, callbacks: [] };
    const spinelo = (value: number): number[] => {
      const sk = skeleton();
      new Animator(sk, [still('seal_stand'), still('seal_run')], new Map([['seal_run', run]])).step(1 / 60,
        { ...REST, vz: -speed, turnRate, ground: { state: 'stand', forward: 1, right: 0, cls: 1 }, recoilBend: { value, hand: 'rifle' } });
      return local(sk, 'spinelo').q;
    };
    const angle = turnRate * -speed * BANK_FACTOR;                 // the local z speed is -65 (animator.test.ts's bank case)
    const bank = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], unbank = [0, 0, -Math.sin(angle / 2), Math.cos(angle / 2)];
    // The turn also drives the look (the look request from turnRate), which lays its own small turn on spinelo first
    // (`looked`, the clip's rotation times the look's); the twin with no bend gives bank x look, so the look alone is
    // unbank x that. Pinned: the bend (D:L439196) before the bank (D:L439197-439204). The look multiplies on the right
    // and the bend on the left, so their order cannot show in this quaternion and is not pinned here.
    const look = qmul(unbank, spinelo(0));
    closeQ(spinelo(1), qmul(bank, qmul(bendQuat(1, row('stand', 'rifle', 'spinelo').axis!), look)));
  });

  it("PICTURE ONLY for a rifle: no rifle table moves skel_root, the camera's node and the eye's (research 442 s3)", () => {
    for (const stance of ['stand', 'crouch', 'prone']) {
      const root = row(stance, 'rifle', 'skel_root');
      expect(root.axis, stance).toBeNull();
      expect(root.offset, stance).toEqual([0, 0, 0]);
    }
  });

  it('the stand-pistol root offset is drawn but not handed to the camera (RECOIL_BEND_ROOT_TO_CAMERA_READING false): rootY unchanged', () => {
    const sk = skeleton();
    const anim = new Animator(sk, [still('seal_stand')], null);
    anim.step(1 / 60, REST);
    const before = anim.rootY();
    anim.step(1 / 60, { ...REST, recoilBend: { value: 5, hand: 'pistol' } } as MoverSnapshot);
    const off = row('stand', 'pistol', 'skel_root').offset;
    expect(local(sk, 'skel_root').t[1]).toBeCloseTo(11 + off[1]! * 5, 5);       // drawn: the body moves
    expect(anim.rootY()).toBeCloseTo(before!, 9);                               // the camera's root (setPosedRoot) does not
  });
});
