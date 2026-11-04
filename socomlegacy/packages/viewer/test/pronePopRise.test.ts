import { describe, expect, it } from 'vitest';
import { IDENTITY, partMatrix, Skeleton, type MotionClip, type MotionPart, type SkeletonPart } from '@s2u/scene';
import { flat } from './parity/world';
import {
  Animator, blendWeight, popSeen, PRONE_POP_RISE_S_ADAPTATION, showsPronePop, type MoverSnapshot,
} from '../src/animator';
import type { MotionEntry } from '../src/motionTable';
import type { GroundMotion, PlaySnapshot } from '../src/mover';
import { bodyOf, snapshotOf } from '../src/net/body';
import { popStance, StanceButton, type StanceTarget } from '../src/stanceButton';

/**
 * OT.R67 (`PRONE_POP_RISE_S_ADAPTATION`; no original -- the owner's word, MISSION OT.R67): the prone-pop's rise on every
 * body. The animator reads the pop off the body it draws (`showsPronePop`) -- the page's own and, through the wire
 * (`./net/body`), the others' -- and cross-fades into the standing play over 0.26 s (Benny's `client.js`, which did it
 * for the local body alone by patching the animator), keeping the rise's end and progress across a change of play.
 */

const EXTRAS = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false };
/** The body drawn here, and the same body as another page draws it (the wire's round trip). */
const both = (s: PlaySnapshot): PlaySnapshot[] => [s, snapshotOf(bodyOf(1, s, EXTRAS))];

describe('OT.R67: the frame that shows the pop (showsPronePop), on the page and through the wire', () => {
  it('settled prone, the drop, the dive: each pop shows; the ordinary get-up does not', () => {
    // Settled prone, popped.
    let r = flat();
    r.walker.changeStance('prone');
    for (let i = 0; i < 90; i++) r.sim.apply({ seq: i + 1, forward: 0, right: 0, yaw: -90, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    let before = r.sim.body();
    expect(popStance(r.walker, r.moves)).toBe('prone');
    const [hereBefore, wireBefore] = both(before), [hereAfter, wireAfter] = both(r.sim.body());
    expect(showsPronePop(popSeen(hereBefore!), hereAfter!)).toBe(true);
    expect(showsPronePop(popSeen(wireBefore!), wireAfter!)).toBe(true);
    // The drop under way, popped.
    r = flat();
    r.walker.changeStance('prone');
    r.walker.tick({ forward: 0, right: 0, boost: false });
    before = r.sim.body();
    expect(before.action?.name).toBe('standToProne');
    expect(popStance(r.walker, r.moves)).toBe('drop');
    expect(showsPronePop(popSeen(before), r.sim.body())).toBe(true);
    expect(showsPronePop(popSeen(snapshotOf(bodyOf(1, before, EXTRAS))), snapshotOf(bodyOf(1, r.sim.body(), EXTRAS)))).toBe(true);
    // The ordinary get-up: the reversed drop plays -- no rise.
    r = flat();
    r.walker.stance = 'prone';
    before = r.sim.body();
    r.walker.changeStance('stand');
    expect(r.walker.action?.reversed).toBe(true);
    expect(showsPronePop(popSeen(before), r.sim.body())).toBe(false);
  });

  it('a body that stays prone, or comes up through an action of its own (a get-up), shows no pop', () => {
    const prone: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'prone', action: null };
    const stand: MoverSnapshot = { ...prone, stance: 'stand' };
    expect(showsPronePop(popSeen(prone), prone)).toBe(false);
    expect(showsPronePop(null, stand)).toBe(false);
    expect(showsPronePop(popSeen({ ...prone, action: { name: 'getUp', serial: 1, t: 1, seconds: 1, reversed: false } }), stand)).toBe(false);
    expect(showsPronePop(popSeen({ ...prone, action: { name: 'standToProne', serial: 1, t: 0.2, seconds: 1, reversed: true } }), stand)).toBe(false);
    expect(showsPronePop(popSeen(prone), { ...stand, airborne: true })).toBe(false);
    expect(showsPronePop(popSeen(prone), stand)).toBe(true);
  });
});

// ---- the rise on the animator: synthetic clips, as animator.test.ts's ---------------------------------------------

const Q_ID: [number, number, number, number] = [0, 0, 0, 1];
const qx = (deg: number): [number, number, number, number] => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
function clip(name: string, frames: number, parts: { name: string; t: number[][]; q: number[][] }[]): MotionClip {
  const mparts: MotionPart[] = parts.map((p, index) => ({
    index, name: p.name, flags: 0x0c | (p.q.length === 1 ? 0x10 : 0) | (p.t.length === 1 ? 0x20 : 0),
    translations: Float32Array.from(p.t.flat()), rotations: Float32Array.from(p.q.flat()),
  }));
  return { name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: mparts };
}
const pose = (name: string, legDeg: number, rootY: number): MotionClip =>
  clip(name, 16, [{ name: 'skel_root', t: [[0.5, rootY, 20]], q: [Q_ID] }, { name: 'lthigh', t: [[1, -1, 0]], q: [qx(legDeg)] }]);
function skeleton(): Skeleton {
  const part = (index: number, name: string, parent: number, t: number[]): SkeletonPart => ({
    index, name, parent, bindLocal: partMatrix(Q_ID, t as [number, number, number]), bbox: new Float32Array(6), type: 0, flags: 0,
  });
  return new Skeleton('test', IDENTITY, [part(0, 'skel_root', -1, [0, 11.5, 0.5]), part(1, 'lthigh', 0, [1, -1, 0])]);
}
const entry = (e: Partial<MotionEntry>): MotionEntry => ({
  looped: null, playback: null, maxVelocity: null, blendTime: null, transitionA: null, transitionB: null, noInterrupt: null, callbacks: [], ...e,
});
const IDLE: GroundMotion = { state: 'idle', forward: 0, right: 0, cls: -1 };
const STAND: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand', ground: IDLE, action: null, stickSnaps: 0 };
const PRONE: MoverSnapshot = { ...STAND, stance: 'prone' };

/** An animator with the stand (its `BlendTime` 0.5, as the disc's) and the prone, settled prone. */
function lying(): Animator {
  const table = new Map<string, MotionEntry>([
    ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
    ['seal_prone', entry({ looped: true, playback: 6, maxVelocity: -0.1 })],
  ]);
  const anim = new Animator(skeleton(), [pose('seal_stand', 0, 11), pose('seal_prone', 60, 2.2)], table);
  for (let i = 0; i < 60; i++) anim.step(1 / 60, PRONE);
  expect(anim.stats().blend).toBe(1);
  return anim;
}

describe('OT.R67: the rise (PRONE_POP_RISE_S_ADAPTATION) on the animator, every body\'s', () => {
  it('is 0.26 s, the owner\'s word', () => {
    expect(PRONE_POP_RISE_S_ADAPTATION).toBe(0.26);
  });

  it('the pop cross-fades into the stand over 0.26 s with the play\'s ease, not the stand\'s own 0.5 s', () => {
    const anim = lying();
    anim.step(1 / 60, STAND);                                    // the pop's frame: the prone pose frozen, the rise begun
    expect(anim.stats()).toMatchObject({ play: 'idle:stand', from: 'seal_prone', blend: 0 });
    for (let k = 1; k <= 8; k++) anim.step(1 / 60, STAND);
    expect(anim.stats().blend).toBeCloseTo(blendWeight((8 / 60) / PRONE_POP_RISE_S_ADAPTATION), 9);
    for (let k = 9; k <= 16; k++) anim.step(1 / 60, STAND);    // 16 / 60 > 0.26: done
    expect(anim.stats()).toMatchObject({ blend: 1, from: null });
  });

  it('a fresh cross-fade under the rise (a stick snap\'s 0.2 s) keeps the rise\'s end: done at 0.26 s', () => {
    const anim = lying();
    anim.step(1 / 60, STAND);
    for (let k = 1; k <= 6; k++) anim.step(1 / 60, STAND);
    const snapped = { ...STAND, stickSnaps: 1 };                 // FUN_00586c10's snap: the pose frozen again under the rise
    anim.step(1 / 60, snapped);
    expect(anim.stats().blend).toBeLessThan(1);
    for (let k = 8; k <= 16; k++) anim.step(1 / 60, snapped);
    expect(anim.stats()).toMatchObject({ blend: 1, from: null });   // was: the snap's own 0.2 s, still running
  });
});

describe('OT.R67 (the merge controller\'s word): no rise but the pop\'s -- the fallback\'s get-up, a respawn\'s blend', () => {
  it('the fallback (separate): the get-up from prone plays its clip and gets no rise, before, under or after it', () => {
    const r = flat();
    r.walker.stance = 'prone';                                   // settled prone, as the parity world lays it
    const table = new Map<string, MotionEntry>([
      ['seal_stand', entry({ looped: true, playback: 6, maxVelocity: -0.1, blendTime: 0.5 })],
      ['seal_prone', entry({ looped: true, playback: 6, maxVelocity: -0.1 })],
    ]);
    const anim = new Animator(skeleton(), [
      pose('seal_stand', 0, 11), pose('seal_prone', 60, 2.2), pose('seal_stand2prone', 30, 6), pose('seal_crouch2prone', 45, 4),
    ], table);
    let seq = 0;
    const frame = (): PlaySnapshot => {
      r.sim.apply({ seq: ++seq, forward: 0, right: 0, yaw: -90, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
      const body = r.sim.body();
      anim.step(1 / 60, body);
      expect(anim['rise']).toBeNull();
      return body;
    };
    for (let i = 0; i < 60; i++) frame();
    // The fallback's stance button (H338: a tap from prone crouches, the original's; was PAD_STANCE's stand) on the
    // mover: the ordinary get-up to crouch, its clip.
    const button = new StanceButton();
    const t: StanceTarget = {
      stanceIntent: () => r.walker.pendingStance ?? r.walker.stance,
      setStance: (s) => { r.walker.changeStance(s); return true; },
    };
    let clipped = false;
    for (let i = 0; i < 240; i++) {
      button.lanes('separate', { triangle: i < 3 }, 1 / 60, t);
      const body = frame();
      if (body.action?.reversed) clipped = true;
    }
    expect(clipped).toBe(true);                                  // the get-up's clip played
    expect(r.walker.stance).toBe('crouch');
    expect(r.walker.action).toBeNull();
  });

  it('a respawn\'s blend -- prone, then standing with no clip outside a pop -- is bounded at the rise\'s 0.26 s', () => {
    // `Play.respawn` rebuilds the page's own animator (NU-12 B1: nothing blended); a body drawn without that rebuild
    // sees a prone-to-stand change with no clip, which reads as the pop: its blend is the rise, never longer.
    for (const seen of ['here', 'wire'] as const) {
      const anim = lying();
      const body = (s: MoverSnapshot): MoverSnapshot => seen === 'here' ? s
        : snapshotOf(bodyOf(1, { ...s, feet: [0, 0, 0], pitch: 0, turnRate: 0, ground: IDLE } as PlaySnapshot, EXTRAS));
      anim.step(1 / 60, body(STAND));                              // the respawn's frame: standing, elsewhere, no clip
      const bound = 0.26;                                          // the rise's (PRONE_POP_RISE_S_ADAPTATION, pinned above)
      let checked = 0;
      for (let k = 1; k <= 40; k++) {
        anim.step(1 / 60, body(STAND));
        if (k / 60 >= bound) { expect(anim.stats().blend, `${seen}, ${k} frames`).toBe(1); checked++; }
      }
      expect(checked).toBe(40 - 15);                               // frames 16..40: 16 / 60 is the first past 0.26 s
      expect(blendWeight((16 / 60) / 0.5)).toBeLessThan(1);        // the stand's own BlendTime (0.5 s) would still run
    }
  });
});
