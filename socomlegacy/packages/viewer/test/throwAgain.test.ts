// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { GrenadeThrower, type GrenadeItem } from '../src/grenade';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';
import { packGround, WalkMode, type GroundData, type PlaySnapshot } from '../src/walk';

/**
 * LATER 247 (the owner's report, 2026-10-21): "in matches ... the first grenade throws, but then the next few the arc
 * animation shows but the grenade is not thrown ... switching from one grenade type to the other allows the other nade
 * to throw." The second press, hold and release of the same throwable after the first throw's clip is waited out must
 * throw as the first did: the release request (`FUN_005be9a0`'s hand-grenade branch, D:L475490-475511) pushes the clip
 * and the hand opens at its timer (`FUN_005c1970`), one spent, the next of the same in the hand (`finishThrow`).
 *
 * Two rigs: the thrower alone over a still snapshot, online (`GrenadeSource.online`: NET-CAP asked) and offline; and the
 * part (`./matchThrow` `mountThrowables`) on the real `WalkMode` over a floor, the trigger through `hands.trigger`, with a
 * room (`net`) and without -- the throw's hold laid on the walk (`throwStart` -> `WalkMode.hold`) as both pages lay it.
 */

const DT = 1 / 60;
const KINDS: readonly GrenadeItem[] = ['M67', 'AN-M8', 'Mark141', 'HE'];

/** What one throw attempt came to. */
interface Attempt { arc: boolean; started: boolean; thrown: boolean; spent: number; phase: string }

// ---- rig 1: the thrower alone ---------------------------------------------------------------------------------------

const STILL = {
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
};

function bare(online: boolean, kit: (string | null)[]) {
  let hold: { clip: string; serial: number } | null = null;
  let serial = 0;
  const snapshot = (): PlaySnapshot => ({ ...STILL, ...(hold ? { hold: hold.clip, holdSerial: hold.serial } : {}) }) as unknown as PlaySnapshot;
  const g = new GrenadeThrower({ grid: () => null, snapshot, view: () => 'third' as never, online: () => online });
  g.setKit(kit);
  let started = 0, thrown = 0;
  g.on('throwStart', (s) => { started++; hold = { clip: s.hold, serial: ++serial }; });
  g.on('throw', () => { thrown++; });
  /** One update; the body's hold off once the throw's clip is done, as the mover's one-shot ends. */
  const frame = (): void => {
    g.update(DT);
    if (g.phase() !== 'throwing') hold = null;
  };
  const attempt = (holdSeconds = 0.5): Attempt => {
    const s0 = started, t0 = thrown, left0 = g.stats().left;
    g.pull();
    let arc = false;
    for (let i = 0; i < Math.round(holdSeconds / DT); i++) { frame(); arc ||= g.stats().arc?.visible === true || g.phase() === 'holding'; }
    g.release();
    for (let i = 0; i < 3 * 60 && g.phase() !== 'ready' && g.phase() !== 'holstered'; i++) frame();
    for (let i = 0; i < 30; i++) frame();                           // the clip waited out, and a beat more
    return { arc, started: started > s0, thrown: thrown > t0, spent: left0 - g.stats().left, phase: g.phase() };
  };
  return { g, attempt, frame };
}

describe('LATER 247: the same throwable thrown again, the thrower alone (a still SEAL, no hull)', () => {
  for (const online of [false, true]) {
    for (const kind of KINDS) {
      it(`${online ? 'online' : 'offline'}, ${kind}: the second and third press, hold and release each throw, one spent each`, () => {
        const r = bare(online, [kind, null, null]);
        expect(r.g.select(kind)).toBe(true);
        const first = r.attempt();
        const second = r.attempt();
        const third = r.attempt();
        expect([first, second, third]).toEqual([
          { arc: true, started: true, thrown: true, spent: 1, phase: 'ready' },
          { arc: true, started: true, thrown: true, spent: 1, phase: 'ready' },
          { arc: true, started: true, thrown: true, spent: 1, phase: 'ready' },
        ]);
        expect(r.g.held()).toBe(kind);
        expect(r.g.heldSlot()).toBe(2);
        if (kind !== 'Mark141') {
          // Research 361 §2: an exhausted manually selected slot stays in hand; its next trigger is refused.
          expect(r.g.stats().left).toBe(0);
          expect(r.attempt()).toEqual({ arc: false, started: false, thrown: false, spent: 0, phase: 'ready' });
          expect(r.g.held()).toBe(kind);
          expect(r.g.heldSlot()).toBe(2);
        }
      });
    }
  }
});

// ---- rig 2: the part on the real walk -------------------------------------------------------------------------------

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
};
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const GROUND: GroundData = packGround(PARAMS, [FLOOR], OWNERS);

function part(online: boolean, kit: (string | null)[], hand: 'rifle' | 'pistol' = 'rifle') {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(GROUND, [0, 0, 0]);
  fly.setPose({ x: 0, y: 20, z: 0, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  const wish = { forward: 0, right: 0, boost: false };
  fly.groundWish = () => wish;
  const sentKinds: string[] = [];
  const net = {
    throwEvent: (kind: string) => { sentKinds.push(kind); },
    throwStartEvent: () => sentKinds.length,
    client: { bodies: () => [] },
  };
  const firearm = {
    shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
    fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
    zoom: { state: () => 0 }, kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
    setZoom: () => {}, showFireMode: () => {}, item: () => hand, record: () => ({ name: 'M4A1' }), records: () => [{}, {}],
    icon: () => 'm4.tif', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    effects: { play: () => false, run: () => null },
  };
  const play = {
    partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
    setRifleStowed: () => {}, addPoseLayer: () => {},
  };
  const deps: MatchThrowDeps = {
    scene: new Scene(), walk, fly: { shakeScreen: () => {} }, play: play as never, loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, net: () => (online ? net as never : null), firearm: () => firearm as never,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as never,
  };
  const t = mountThrowables(deps);
  t.grenade.setKit(kit);
  const hands = t.hands();
  let started = 0, thrown = 0;
  t.grenade.on('throwStart', () => { started++; });
  t.grenade.on('throw', () => { thrown++; });
  /** One page frame in `main.ts`'s order: the walk's ticks, the pose's frame, the throws'. */
  const frame = (): void => { walk.frame(DT); t.poseFrame(DT); t.frame(DT); };
  for (let i = 0; i < 10; i++) frame();
  const attempt = (holdSeconds = 0.5, settle = 30): Attempt => {
    const s0 = started, t0 = thrown, left0 = t.grenade.stats().left;
    hands.trigger(true);
    let arc = false;
    for (let i = 0; i < Math.round(holdSeconds / DT); i++) { frame(); arc ||= t.grenade.stats().arc?.visible === true; }
    hands.trigger(false);
    for (let i = 0; i < 3 * 60 && t.grenade.phase() !== 'ready' && t.grenade.phase() !== 'holstered'; i++) frame();
    for (let i = 0; i < settle; i++) frame();
    return { arc, started: started > s0, thrown: thrown > t0, spent: left0 - t.grenade.stats().left, phase: t.grenade.phase() };
  };
  return { t, walk, fly, wish, hands, attempt, frame, sentKinds, dispose: () => { t.dispose(); walk.unbindKey(); } };
}

describe('LATER 247: the same throwable thrown again through the part on the real walk (hands.trigger, the hold laid)', () => {
  for (const online of [false, true]) {
    for (const kind of KINDS) {
      it(`${online ? 'online' : 'offline'}, ${kind}: the second and third throws go as the first`, () => {
        const r = part(online, [kind, null, null]);
        expect(r.t.takeSlot(2)).toBe(true);
        expect(r.t.grenade.held()).toBe(kind);
        const first = r.attempt();
        const second = r.attempt();
        const third = r.attempt();
        expect([first, second, third]).toEqual([
          { arc: true, started: true, thrown: true, spent: 1, phase: 'ready' },
          { arc: true, started: true, thrown: true, spent: 1, phase: 'ready' },
          { arc: true, started: true, thrown: true, spent: 1, phase: 'ready' },
        ]);
        expect(r.t.grenade.held()).toBe(kind);
        expect(r.t.grenade.heldSlot()).toBe(2);
        if (kind !== 'Mark141') {
          expect(r.t.grenade.stats().left).toBe(0);
          expect(r.attempt()).toEqual({ arc: false, started: false, thrown: false, spent: 0, phase: 'ready' });
          expect(r.t.grenade.held()).toBe(kind);
          expect(r.t.grenade.heldSlot()).toBe(2);
        }
        if (online) expect(r.sentKinds).toEqual([kind, kind, kind]);
        r.dispose();
      });
    }
  }

  for (const online of [false, true]) {
    it(`${online ? 'online' : 'offline'}: M67 thrown, AN-M8 taken and thrown, M67 back and thrown again`, () => {
      const r = part(online, ['M67', 'AN-M8', null]);
      expect(r.t.takeSlot(2)).toBe(true);
      const a = r.attempt();
      expect(r.t.takeSlot(3)).toBe(true);
      expect(r.t.grenade.held()).toBe('AN-M8');
      const b = r.attempt();
      expect(r.t.takeSlot(2)).toBe(true);
      expect(r.t.grenade.held()).toBe('M67');
      const c = r.attempt();
      for (const x of [a, b, c]) expect(x).toEqual({ arc: true, started: true, thrown: true, spent: 1, phase: 'ready' });
      r.dispose();
    });
  }
});

/**
 * The match's ways of throwing again that the plain rigs leave out: the press taken the frame the hand is ready again
 * (the body's lagged hold of the first throw maybe still on), the trigger pressed during the first throw's clip and held
 * past it, a running SEAL, the aim down (a toss), crouched.
 */
describe('LATER 247: throwing again as a match throws (the part on the real walk)', () => {
  const OK = { arc: true, started: true, thrown: true, spent: 1 };
  for (const online of [false, true]) {
    const tag = online ? 'online' : 'offline';
    it(`${tag}: the next press the frame the hand is ready again throws`, () => {
      const r = part(online, ['M67', 'AN-M8', null]);
      r.t.takeSlot(2);
      const a = r.attempt(0.5, 0);
      const b = r.attempt(0.5, 0);
      const c = r.attempt(0.5, 0);
      for (const x of [a, b, c]) expect(x).toMatchObject(OK);
      r.dispose();
    });
    it(`${tag}: pressed during the first throw's clip and held past it, then let go and pressed again: the second press throws`, () => {
      const r = part(online, ['M67', 'AN-M8', null]);
      r.t.takeSlot(2);
      r.hands.trigger(true);
      for (let i = 0; i < 30; i++) r.frame();
      r.hands.trigger(false);
      for (let i = 0; i < 10; i++) r.frame();
      expect(r.t.grenade.phase()).toBe('throwing');
      r.hands.trigger(true);                                     // pressed again mid-clip, held past its end
      for (let i = 0; i < 120; i++) r.frame();
      const mid = r.t.grenade.phase();
      r.hands.trigger(false);
      for (let i = 0; i < 30; i++) r.frame();
      const b = r.attempt();
      expect(mid).toBe('ready');
      expect(b).toMatchObject(OK);
      r.dispose();
    });
    it(`${tag}: running forward, three throws`, () => {
      const r = part(online, ['M67', 'AN-M8', null]);
      r.t.takeSlot(2);
      r.wish.forward = 1;
      const xs = [r.attempt(0.3, 5)];
      r.fly.setPose({ x: 0, y: 20, z: 0, yaw: 0, pitch: 0 });
      xs.push(r.attempt(0.3, 5));
      r.fly.setPose({ x: 0, y: 20, z: 0, yaw: 0, pitch: 0 });
      xs.push(r.attempt(0.3, 5));
      for (const x of xs) expect(x).toMatchObject(OK);
      r.dispose();
    });
    it(`${tag}: the aim down (a toss), three throws`, () => {
      const r = part(online, ['M67', 'AN-M8', null]);
      r.t.takeSlot(2);
      r.fly.setPose({ x: 0, y: 20, z: 0, yaw: 0, pitch: -40 });
      for (let i = 0; i < 10; i++) r.frame();
      const xs = [r.attempt(0.2), r.attempt(0.2), r.attempt(0.2)];
      for (const x of xs) expect(x).toMatchObject(OK);
      r.dispose();
    });
    it(`${tag}: the sidearm in the hand (the pistol's throw clips), three throws`, () => {
      const r = part(online, ['M67', 'AN-M8', null], 'pistol');
      r.t.takeSlot(2);
      const xs = [r.attempt(), r.attempt(), r.attempt()];
      for (const x of xs) expect(x).toMatchObject(OK);
      r.dispose();
    });
    it(`${tag}: crouched, three throws`, () => {
      const r = part(online, ['M67', 'AN-M8', null]);
      r.t.takeSlot(2);
      r.walk.crouch();
      for (let i = 0; i < 60; i++) r.frame();
      expect(r.walk.snapshot()?.stance).toBe('crouch');
      const xs = [r.attempt(), r.attempt(), r.attempt()];
      for (const x of xs) expect(x).toMatchObject(OK);
      r.dispose();
    });
  }
});
