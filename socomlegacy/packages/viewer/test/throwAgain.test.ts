// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { GrenadeThrower, type GrenadeItem } from '../src/grenade';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { mountFirearm, SWAP_HELD_EDGE_READING, type MatchFirearm } from '../src/matchFirearm';
import { Fire } from '../src/fire';
import { Hud } from '../src/hud';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
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

/**
 * The part on the real walk. `assembled` (LATER 792): the page's assembly instead of the firearm's and the body's stand-ins
 * -- the one firearm (`mountFirearm`, its hands the part's) and a real `Play`, whose raise steps the controller's trigger
 * edge `+0x118` (`./weaponRaise`) -- in `./main`'s frame order; the trigger pressed through the firearm, as the page does.
 */
function part(online: boolean, kit: (string | null)[], hand: 'rifle' | 'pistol' = 'rifle', assembled = false) {
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
  const stand = {
    partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
    setRifleStowed: () => {}, addPoseLayer: () => {},
  };
  const scene = new Scene(), loadouts = new PlayerLoadout(), camera = new PerspectiveCamera();
  const play = assembled ? new Play() : null;
  let real: MatchFirearm | null = null;
  const deps: MatchThrowDeps = {
    scene, walk, fly: { shakeScreen: () => {} }, play: (play ?? stand) as never, loadouts,
    view: () => null, map: () => null, net: () => (online ? net as never : null), firearm: () => (real ?? firearm) as never,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as never,
  };
  const t = mountThrowables(deps);
  t.grenade.setKit(kit);
  const hands = t.hands();
  if (play) {
    real = mountFirearm({
      scene, fly, walk, play, loadouts, remote: new RemotePlayers(scene), hud: new Hud(), view: () => null, map: () => null,
      body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, hands,
    });
  }
  const firearmOf = real;
  let started = 0, thrown = 0;
  t.grenade.on('throwStart', () => { started++; });
  t.grenade.on('throw', () => { thrown++; });
  /**
   * One page frame in `main.ts`'s order: the walk's ticks, the pose's frame, the throws'. Assembled: the walk's, the pose's,
   * the body's (the raise: the controller's edge), the firearm's, the throws' (`./main` ~:2161-2189).
   */
  const frame = (): void => {
    walk.frame(DT); t.poseFrame(DT);
    if (play && firearmOf) { play.frame(DT, walk, camera); firearmOf.fireFrame(DT, true); }
    t.frame(DT);
  };
  /** The pad's R1: through the firearm, which asks its hands first (`MatchFirearm.trigger`); the part alone, its hands. */
  const press = (down: boolean): void => { if (firearmOf) firearmOf.trigger(down); else hands.trigger(down); };
  for (let i = 0; i < 10; i++) frame();
  const attempt = (holdSeconds = 0.5, settle = 30): Attempt => {
    const s0 = started, t0 = thrown, left0 = t.grenade.stats().left;
    press(true);
    let arc = false;
    for (let i = 0; i < Math.round(holdSeconds / DT); i++) { frame(); arc ||= t.grenade.stats().arc?.visible === true; }
    press(false);
    for (let i = 0; i < 3 * 60 && t.grenade.phase() !== 'ready' && t.grenade.phase() !== 'holstered'; i++) frame();
    for (let i = 0; i < settle; i++) frame();
    return { arc, started: started > s0, thrown: thrown > t0, spent: left0 - t.grenade.stats().left, phase: t.grenade.phase() };
  };
  return {
    t, walk, fly, wish, hands, attempt, frame, press, sentKinds, firearm: firearmOf, play,
    dispose: () => { firearmOf?.dispose(); t.dispose(); walk.unbindKey(); },
  };
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
    // GRENADE-RETHROW (reading, pending review): the press held past the pop re-arms the wind-up there (D:L453484-453500,
    // D:L453543-453637), so its let-go throws, and the next press throws after it. Was: `mid` 'ready' (the press dropped).
    it(`${tag}: pressed during the first throw's clip and held past it: the wind-up re-armed at the pop; let go, pressed again: both throw`, () => {
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
      const left = r.t.grenade.stats().left;
      r.hands.trigger(false);
      for (let i = 0; i < 3 * 60 && r.t.grenade.phase() !== 'ready'; i++) r.frame();
      const spentByHeld = left - r.t.grenade.stats().left;
      for (let i = 0; i < 30; i++) r.frame();
      const b = r.attempt();
      expect(mid).toBe('holding');
      expect(spentByHeld).toBe(1);
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

// ---- GRENADE-RETHROW: a trigger held through the follow-through re-arms at the pop --------------------------------------

/**
 * GRENADE-RETHROW (the tester's report, Discord 2026-11-09: "when u throw ur first nade and go into ur 2nd nade throw it
 * has a delay; its more instant on emu"; reading, pending review). No cooldown stands between two grenades of one slot
 * (`FUN_005c5340`'s after-shot lock wants `ReloadAfterShot`, D:L479318-479343, which no throwable has): the gate is the
 * throw clip's pop. Under the clip the plain trigger branch reads the button's level (D:L453543-453567) and a press with
 * a grenade left sets the wind-up bit (D:L453633-453637); at the pop the bit-0x80 branch clears it and remaps the edge
 * (D:L453484-453500), so a button still down reads as a fresh press on the next update and the wind-up chases from 0 on
 * the update after (`THROW_REARM_UPDATES_READING`, 2). A tap under the clip throws nothing; nothing re-arms with the
 * slot empty (`FUN_005bdb00` -> `FUN_005bda70`, D:L474519-474538).
 */
describe('GRENADE-RETHROW: a press held through the first throw starts the second wind-up at the pop (the thrower alone)', () => {
  function rig(kind: GrenadeItem, opts: { dead?: () => boolean } = {}) {
    let hold: { clip: string; serial: number } | null = null;
    let serial = 0;
    const snapshot = (): PlaySnapshot => ({ ...STILL, ...(hold ? { hold: hold.clip, holdSerial: hold.serial } : {}) }) as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: () => null, snapshot, view: () => 'third' as never, online: () => false, ...(opts.dead ? { dead: opts.dead } : {}) });
    g.setKit([kind, null, null]);
    expect(g.select(kind)).toBe(true);
    const log = { started: 0, thrown: 0 };
    g.on('throwStart', (s) => { log.started++; hold = { clip: s.hold, serial: ++serial }; });
    g.on('throw', () => { log.thrown++; });
    const frame = (): void => { g.update(DT); if (g.phase() !== 'throwing') hold = null; };
    /** A throw: held 0.5 s and let go; runs until its 'throwStart' (the clip pushed). */
    const throwOne = (): void => {
      const s0 = log.started;
      g.pull();
      for (let i = 0; i < 120 && log.started === s0; i++) { if (i === 30) g.release(); frame(); }
      expect(log.started).toBe(s0 + 1);
    };
    /** Frames until `pred` holds (at most `max`): the count it took, -1 if never. */
    const until = (pred: () => boolean, max = 240): number => {
      for (let i = 1; i <= max; i++) { frame(); if (pred()) return i; }
      return -1;
    };
    return { g, log, frame, throwOne, until };
  }

  for (const kind of KINDS) {
    it(`${kind}: pressed after the hand opens and held: the wind-up starts within 2 updates of the pop, from power 0; let go, it throws`, () => {
      const r = rig(kind);
      const left0 = r.g.stats().left;
      r.throwOne();
      expect(r.until(() => r.log.thrown === 1)).toBeGreaterThan(0);   // the hand open
      expect(r.g.phase()).toBe('throwing');
      r.g.pull();                                                      // pressed in the follow-through, held
      expect(r.until(() => r.g.phase() !== 'throwing')).toBeGreaterThan(0);
      const toHold = r.until(() => r.g.phase() === 'holding', 10);
      expect(toHold).toBeGreaterThan(0);
      expect(toHold).toBeLessThanOrEqual(2);
      expect(r.g.stats().power).toBeGreaterThan(0);                   // chased this update, from 0 (3/s x 1/60 = 0.05)
      expect(r.g.stats().power).toBeLessThan(0.1);
      for (let i = 0; i < 30; i++) r.frame();
      r.g.release();
      expect(r.until(() => r.log.thrown === 2)).toBeGreaterThan(0);
      expect(r.log.started).toBe(2);
      expect(left0 - r.g.stats().left).toBe(2);
    });
  }

  it('M67: pressed before the hand opens (the throw still pending) and held: the same re-arm at the pop', () => {
    const r = rig('M67');
    r.throwOne();
    r.frame();
    expect(r.log.thrown).toBe(0);                                      // the hand not open yet
    r.g.pull();
    expect(r.until(() => r.log.thrown === 1)).toBeGreaterThan(0);
    expect(r.until(() => r.g.phase() !== 'throwing')).toBeGreaterThan(0);
    const toHold = r.until(() => r.g.phase() === 'holding', 10);
    expect(toHold).toBeGreaterThan(0);
    expect(toHold).toBeLessThanOrEqual(2);
    for (let i = 0; i < 30; i++) r.frame();
    r.g.release();
    expect(r.until(() => r.log.thrown === 2)).toBeGreaterThan(0);
  });

  it('M67: a tap in the follow-through (pressed and let go before the pop) throws nothing', () => {
    const r = rig('M67');
    r.throwOne();
    expect(r.until(() => r.log.thrown === 1)).toBeGreaterThan(0);
    r.g.pull();
    for (let i = 0; i < 5; i++) r.frame();
    r.g.release();
    expect(r.g.phase()).toBe('throwing');
    expect(r.until(() => r.g.phase() !== 'throwing')).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) { r.frame(); expect(r.g.phase()).toBe('ready'); }
    expect(r.log).toEqual({ started: 1, thrown: 1 });
    expect(r.g.stats().power).toBe(0);
  });

  it("M67: held through the slot's last throw: nothing re-arms (the slot empty at the pop)", () => {
    const r = rig('M67');
    while (r.g.stats().left > 1) {
      r.throwOne();
      expect(r.until(() => r.g.phase() === 'ready')).toBeGreaterThan(0);
    }
    r.throwOne();
    expect(r.until(() => r.g.stats().left === 0)).toBeGreaterThan(0);
    r.g.pull();
    expect(r.until(() => r.g.phase() !== 'throwing')).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) { r.frame(); expect(r.g.phase()).not.toBe('holding'); }
    expect(r.g.phase()).toBe('ready');
    expect(r.g.held()).toBe('M67');
  });

  it('M67: a held press dropped by the menus (cancelMenuHold), a death, the turret take and the throwNow hook re-arms nothing', () => {
    // The menus and round screens take the held trigger (OBF-31: no let-go is told the hand).
    const a = rig('M67');
    a.throwOne();
    a.g.pull();
    a.g.cancelMenuHold();
    expect(a.until(() => a.g.phase() !== 'throwing')).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) { a.frame(); expect(a.g.phase()).toBe('ready'); }
    // The turret's take (A1) in the follow-through: the held press dropped with it.
    const m = rig('M67');
    m.throwOne();
    expect(m.until(() => m.log.thrown === 1)).toBeGreaterThan(0);
    m.g.pull();
    m.g.mountTake();
    expect(m.until(() => m.g.phase() !== 'throwing')).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) { m.frame(); expect(m.g.phase()).toBe('ready'); }
    // A death in the follow-through: no wind-up for the dead (D:L457349).
    let dead = false;
    const d = rig('M67', { dead: () => dead });
    d.throwOne();
    expect(d.until(() => d.log.thrown === 1)).toBeGreaterThan(0);
    d.g.pull();
    dead = true;
    for (let i = 0; i < 120; i++) { d.frame(); expect(d.g.phase()).not.toBe('holding'); }
    // The hook's throw skips the last clip's tail: no re-arm from it, its own throw only.
    const h = rig('M67');
    h.throwOne();
    expect(h.until(() => h.log.thrown === 1)).toBeGreaterThan(0);
    h.g.pull();
    expect(h.g.throwNow(0.5)).not.toBeNull();
    expect(h.log.thrown).toBe(2);
    for (let i = 0; i < 240; i++) { h.frame(); expect(h.g.phase()).not.toBe('holding'); }
  });
});

describe('GRENADE-RETHROW: through hands.trigger on the real walk, the second throw needs no second press', () => {
  for (const online of [false, true]) {
    const tag = online ? 'online' : 'offline';
    for (const cut of [false, true]) {
      it(`${tag}${cut ? ', the stick cutting the clip at NoInterrupt' : ''}: trigger(true) in the follow-through, held: the second throwStart; let go, thrown`, () => {
        const r = part(online, ['M67', 'AN-M8', null]);
        r.t.takeSlot(2);
        let started = 0, thrown = 0, thrownFrame = -1, n = 0;
        r.t.grenade.on('throwStart', () => { started++; });
        r.t.grenade.on('throw', () => { thrown++; thrownFrame = n; });
        const frame = (): void => { n++; r.frame(); };
        r.hands.trigger(true);
        for (let i = 0; i < 30; i++) frame();
        r.hands.trigger(false);
        for (let i = 0; i < 120 && thrown === 0; i++) frame();
        expect(thrown).toBe(1);
        const opened = thrownFrame;
        if (cut) r.wish.forward = 1;                                   // the stick past 0.1: the cut at NoInterrupt
        r.hands.trigger(true);                                         // pressed once, in the follow-through, and held
        let popFrame = -1, holdFrame = -1;
        for (let i = 0; i < 240 && holdFrame < 0; i++) {
          frame();
          if (popFrame < 0 && r.t.grenade.phase() !== 'throwing') popFrame = n;
          if (r.t.grenade.phase() === 'holding') holdFrame = n;
        }
        expect(popFrame).toBeGreaterThan(0);
        expect(holdFrame - popFrame).toBeGreaterThan(0);              // the second wind-up, no second trigger(true)
        expect(holdFrame - popFrame).toBeLessThanOrEqual(2);
        // the uncut clip pops about 0.78 s after the hand opens standing; the stick's cut well before it
        if (cut) expect(popFrame - opened).toBeLessThan(30);
        else expect(popFrame - opened).toBeGreaterThan(30);
        r.wish.forward = 0;
        for (let i = 0; i < 20; i++) frame();
        r.hands.trigger(false);
        for (let i = 0; i < 120 && thrown < 2; i++) frame();
        expect(started).toBe(2);
        expect(thrown).toBe(2);
        r.dispose();
      });
    }
  }
});

// ---- GRENADE-RETHROW fold (reviews F1, F3): the firearm taken under a trigger held through a throw ------------------

/**
 * The kit pull count `kit+0x818` handed to the firearm (`hands.heldPulls`) after a press held through a throw's clip. The
 * launch raises it (`FUN_005c1970` D:L477023-477025) and `FUN_005c0ae0`, run on every kit frame `FUN_005c1970` passes --
 * the launch's own among them (D:L476564-476569; it returns 1 with an item in the slot, D:L476877-476902,
 * D:L477144-477150) -- zeroes it at edge 0 or 3 (D:L476380-476382, D:L476399-476400). The edge (`+0x118`): 2 a press, 1
 * held, 3 a let-go, 0 idle (D:L453543-453567).
 * - A press after the hand opened: the button was up at the launch, so the launch's 1 is zeroed in that same kit frame;
 *   0, last grenade or not.
 * - A press while the throw was pending: 0 as well, last grenade or not -- capture GR-1 (research 326 §7.2; the class-0x79
 *   path, 3/3, ±0) reads `+0x818` 0 from the launch through the pop and after: with a grenade in the slot the re-arm's
 *   remap holds the edge at 0 through the pending window (D:L453633-453660), so the launch's own kit frame zeroes the
 *   count at the edge 0 (D:L476380-476382, D:L476566-476569). Was: the edge 1 through the launch, and on the slot's last
 *   `LAST_GRENADE_PENDING_PRESS_PULLS_READING` 1 (retired by GR-1).
 */
describe('GRENADE-RETHROW fold (reviews F1, F3): the firearm taken under a trigger held through a throw', () => {
  /** The first throw let go; the trigger pressed again and held -- while the throw is pending, or once the hand opened. */
  const holdThrough = (r: ReturnType<typeof part>, when: 'pending' | 'opened'): void => {
    let thrown = 0;
    r.t.grenade.on('throw', () => { thrown++; });
    r.press(true);
    for (let i = 0; i < 30; i++) r.frame();
    r.press(false);
    if (when === 'pending') {
      for (let i = 0; i < 120 && r.t.grenade.phase() !== 'throwing'; i++) r.frame();
      expect(r.t.grenade.phase()).toBe('throwing');
      expect(thrown).toBe(0);                                       // the hand not yet open
    } else {
      for (let i = 0; i < 120 && thrown === 0; i++) r.frame();
      expect(thrown).toBe(1);
    }
    r.press(true);                                                  // pressed, and held
    for (let i = 0; i < 120 && thrown === 0; i++) r.frame();
    expect(thrown).toBe(1);
  };
  const lastOne = (r: ReturnType<typeof part>): void => {
    for (let n = 0; n < 8 && r.t.grenade.stats().left > 1; n++) r.attempt();
    expect(r.t.grenade.stats().left).toBe(1);
  };
  /** Past the pop, with no re-arm: the slot's empty grenade still in the hand (research 361 §2; `+0x824` 4, research 326 §7.3). */
  const popNoRearm = (r: ReturnType<typeof part>): void => {
    for (let i = 0; i < 240 && r.t.grenade.phase() === 'throwing'; i++) r.frame();
    for (let i = 0; i < 10; i++) { r.frame(); expect(r.t.grenade.phase()).not.toBe('holding'); }
    expect(r.t.grenade.stats().left).toBe(0);
    expect(r.t.grenade.equipped()).toBe(true);
  };
  /**
   * LATER 792 (research 326 §7.3, `agent/last-grenade` 58cbcf94d; measured, upload pending): L1 under the R1 held since
   * before the last launch is not taken -- the edge reads 1, and the swap gate `FUN_005a8cb0` refuses it
   * (D:L463174-463181) -- and no round leaves; let go, L1 is taken (4 -> 0) with nothing owed to the firearm.
   */
  const l1UnderHeld = (r: ReturnType<typeof part>): void => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    for (let i = 0; i < 4; i++) r.frame();
    expect(r.play!.weaponStats().raise.edge).toBe(1);              // the slot empty: the press no longer remapped
    r.firearm!.selectFirearm('rifle');                              // L1, R1 still held
    expect(r.t.grenade.equipped()).toBe(true);                      // was: put away, the rifle up and firing
    for (let i = 0; i < 30; i++) r.frame();
    expect(r.t.grenade.equipped()).toBe(true);
    expect(r.hands.heldPulls?.()).toBeNull();                       // the hand still the grenade's
    expect(pull).not.toHaveBeenCalled();                            // no round
    r.press(false);                                                 // R1 let go
    for (let i = 0; i < 4; i++) r.frame();
    expect(r.play!.weaponStats().raise.edge).not.toBe(1);
    r.firearm!.selectFirearm('rifle');                              // L1 again
    expect(r.t.grenade.equipped()).toBe(false);                     // taken
    expect(r.hands.heldPulls?.()).toBe(0);
    for (let i = 0; i < 30; i++) r.frame();
    expect(pull).not.toHaveBeenCalled();                            // nothing owed: the trigger was let go
    pull.mockRestore();
  };
  for (const online of [false, true]) {
    const tag = online ? 'online' : 'offline';
    for (const when of ['opened', 'pending'] as const) {
      it(`${tag}: an M67 with grenades left, pressed ${when === 'opened' ? 'after the hand opened' : 'while pending'}, re-armed, the firearm taken -- heldPulls 0`, () => {
        const r = part(online, ['M67', 'AN-M8', null]);
        r.t.takeSlot(2);
        expect(r.t.grenade.stats().left).toBeGreaterThan(1);
        holdThrough(r, when);
        for (let i = 0; i < 240 && r.t.grenade.phase() !== 'holding'; i++) r.frame();
        expect(r.t.grenade.phase()).toBe('holding');                // the re-armed wind-up, no second press
        r.hands.putAway();                                           // the firearm's swap
        expect(r.t.grenade.equipped()).toBe(false);
        expect(r.hands.heldPulls?.()).toBe(0);                       // review F1, was: 1 -- the firearm refused its round
        r.frame();
        expect(r.hands.heldPulls?.()).toBe(0);
        r.hands.trigger(false);
        expect(r.hands.heldPulls?.()).toBe(0);
        r.dispose();
      });
    }
    // LATER 792: was "no re-arm, the firearm taken with heldPulls 0" -- the part's stand-in firearm took any L1; on the
    // page's assembly the held R1 refuses it (research 326 §7.3), and the let-go takes it with nothing owed.
    it(`${tag}: the slot's last grenade, pressed after the hand opened and held -- no re-arm; L1 refused under the held R1, taken at the let-go`, () => {
      const r = part(online, ['M67', 'AN-M8', null], 'rifle', true);
      r.t.takeSlot(2);
      lastOne(r);
      holdThrough(r, 'opened');
      popNoRearm(r);
      l1UnderHeld(r);
      r.dispose();
    });
    it(`${tag}: the slot's last grenade, pressed while pending and held -- no re-arm; L1 refused under the held R1, taken at the let-go (GR-1, LATER 792)`, () => {
      const r = part(online, ['M67', 'AN-M8', null], 'rifle', true);
      r.t.takeSlot(2);
      lastOne(r);
      holdThrough(r, 'pending');
      popNoRearm(r);
      l1UnderHeld(r);
      r.dispose();
    });
  }
});

// ---- LATER 792: the swap refused under a held trigger ----------------------------------------------------------------

/**
 * LATER 792 (research 326 §7.3 on `agent/last-grenade` 58cbcf94d: r0004, PINE reads, 3 trials a leg; measured, upload
 * pending). Every L1, L2 and inventory take passes `FUN_005a8cb0` (D:L453290, D:L453302, D:L72691, D:L72830), whose last
 * clause takes the body's controller (`body+0xc0`, `FUN_002a26f0` D:L146774-146781) and refuses while its trigger edge
 * `+0x118` reads exactly 1 -- held (D:L463174-463181; `SWAP_HELD_EDGE_READING`). The edge is the one the rifle's raise
 * steps (`./weaponRaise`, `FUN_00594cf0` D:L453543-453567): a press is 2 on its own update and 1 after; a hand grenade
 * with one left in its slot remaps a press 2 -> 3 -> 0 (D:L453633-453661) and the wind-up leaves it there
 * (D:L453507-453518), so a held R1 over a grenade that can still be thrown reads 0.
 *
 * The capture's rows: the empty MARK141 with R1 held since before its last launch, L1 not taken (`+0x824` 4); R1 let go
 * first, L1 taken (4 -> 0); the pistol with R1 up, L1 taken (1 -> 0), held (one round), not taken; the rifle up, L1 changes
 * no slot; a grenade left, R1 held since 2.00 under the re-armed wind-up, L1 at 3.30 taken and the rifle fires (the edge 0,
 * research 326 §7.2). The M67 here: the same class 'y' path (research 326 §7.2's substitution, the other way about).
 */
describe('LATER 792: the swap gate refuses a held trigger (FUN_005a8cb0 D:L463174-463181)', () => {
  const lastOne = (r: ReturnType<typeof part>): void => {
    for (let n = 0; n < 8 && r.t.grenade.stats().left > 1; n++) r.attempt();
    expect(r.t.grenade.stats().left).toBe(1);
  };
  /** Frames until the controller's edge reads `edge` (at most 30): true once it does. */
  const untilEdge = (r: ReturnType<typeof part>, edge: number): boolean => {
    for (let i = 0; i < 30; i++) { if (r.play!.weaponStats().raise.edge === edge) return true; r.frame(); }
    return r.play!.weaponStats().raise.edge === edge;
  };
  /** The pistol in the hand (`Kit.place`), the swap's clip the walk's stand-in (no motion table here). */
  const onPistol = (r: ReturnType<typeof part>): void => {
    r.firearm!.kit.place('pistol');
    vi.spyOn(r.walk, 'swapWeapon').mockReturnValue({ action: 'swapStand', overlay: false, reversed: false, seconds: 1 } as never);
  };

  it('names its reading: the edge the gate refuses at', () => {
    expect(SWAP_HELD_EDGE_READING).toBe(1);
  });

  it('the empty grenade, R1 let go before the last launch: L1 is taken (lastrelease, 4 -> 0)', () => {
    const r = part(false, ['M67', 'AN-M8', null], 'rifle', true);
    r.t.takeSlot(2);
    lastOne(r);
    r.attempt();                                                    // the last one thrown, R1 let go at its release
    expect(r.t.grenade.stats().left).toBe(0);
    expect(r.t.grenade.equipped()).toBe(true);                      // the empty slot stays in the hand
    expect(r.play!.weaponStats().raise.edge).toBe(0);
    r.firearm!.selectFirearm('rifle');
    expect(r.t.grenade.equipped()).toBe(false);
    r.dispose();
  });

  it("the empty grenade, R1 pressed afresh and held: L1 refused once the edge reads 1; the press's own update (2) does not refuse", () => {
    const r = part(false, ['M67', 'AN-M8', null], 'rifle', true);
    r.t.takeSlot(2);
    lastOne(r);
    r.attempt();
    expect(r.t.grenade.stats().left).toBe(0);
    r.press(true);                                                  // no grenade: `FUN_005bdb00` finds none, no remap
    expect(untilEdge(r, 2)).toBe(true);
    expect(r.firearm!.shoulderGate(0)).toBe(true);                  // the edge 2: `!= 1` passes (D:L463175-463176)
    expect(untilEdge(r, 1)).toBe(true);
    r.firearm!.selectFirearm('rifle');
    expect(r.t.grenade.equipped()).toBe(true);                      // refused
    r.press(false);
    r.dispose();
  });

  it('a grenade left, R1 held through the re-armed wind-up: L1 is taken and the rifle fires on the held R1 (the edge 0)', () => {
    const r = part(false, ['M67', 'AN-M8', null], 'rifle', true);
    r.t.takeSlot(2);
    expect(r.t.grenade.stats().left).toBeGreaterThan(1);
    let thrown = 0;
    r.t.grenade.on('throw', () => { thrown++; });
    r.press(true);
    for (let i = 0; i < 30; i++) r.frame();
    r.press(false);
    for (let i = 0; i < 120 && thrown === 0; i++) r.frame();
    expect(thrown).toBe(1);
    r.press(true);                                                  // pressed after the hand opened, held past the pop
    for (let i = 0; i < 240 && r.t.grenade.phase() !== 'holding'; i++) r.frame();
    expect(r.t.grenade.phase()).toBe('holding');                    // the re-armed wind-up
    for (let i = 0; i < 20; i++) r.frame();
    expect(r.play!.weaponStats().raise.edge).toBe(0);               // the remap's 0 (research 326 §7.2: the edge 0 at L1)
    const pull = vi.spyOn(Fire.prototype, 'pull');
    r.firearm!.selectFirearm('rifle');                              // L1 under the held R1
    expect(r.t.grenade.equipped()).toBe(false);                     // taken
    for (let i = 0; i < 4; i++) r.frame();
    expect(pull).toHaveBeenCalledTimes(1);                          // the held R1 the rifle's, its count 0
    expect(pull).toHaveBeenLastCalledWith(0);
    pull.mockRestore();
    r.press(false);
    r.dispose();
  });

  it('the pistol up, R1 held (edge 1): L1 is not taken; R1 up: L1 is taken (t5p, t5pctl)', () => {
    const r = part(false, ['M67', 'AN-M8', null], 'rifle', true);
    onPistol(r);
    r.press(true);                                                  // the pistol's own trigger
    expect(untilEdge(r, 1)).toBe(true);
    expect(r.firearm!.selectFirearm('rifle')).toBe(false);          // refused: the pistol stays (`+0x824` 1)
    expect(r.firearm!.kit.swapping()).toBe(false);
    expect(r.firearm!.kit.item()).toBe('pistol');
    r.press(false);
    expect(untilEdge(r, 0)).toBe(true);
    expect(r.firearm!.selectFirearm('rifle')).toBe(true);           // taken (1 -> 0)
    expect(r.firearm!.kit.state().swap?.to).toBe('rifle');
    r.dispose();
  });

  it('the rifle up: L1 takes nothing, R1 up or held (t5ctl, t5)', () => {
    const r = part(false, ['M67', 'AN-M8', null], 'rifle', true);
    expect(r.firearm!.selectFirearm('rifle')).toBe(false);          // the slot in the hand: `FUN_005c4b10` changes nothing
    expect(r.firearm!.kit.swapping()).toBe(false);
    r.press(true);
    expect(untilEdge(r, 1)).toBe(true);
    expect(r.firearm!.selectFirearm('rifle')).toBe(false);
    expect(r.firearm!.kit.item()).toBe('rifle');
    r.press(false);
    r.dispose();
  });

  it("every swap source is refused under the held edge: L2, an equipment slot, the inventory's take; let go, each passes", () => {
    const r = part(false, ['M67', 'AN-M8', null], 'rifle', true);
    vi.spyOn(r.walk, 'swapWeapon').mockReturnValue({ action: 'swapStand', overlay: false, reversed: false, seconds: 1 } as never);
    r.press(true);                                                  // the rifle's trigger
    expect(untilEdge(r, 1)).toBe(true);
    for (const slot of [0, 1, 2, 3]) expect(r.firearm!.shoulderGate(slot)).toBe(false);
    expect(r.firearm!.kitFree()).toBe(false);                       // the inventory's own gate (`kitChangeGate`)
    expect(r.firearm!.selectFirearm('pistol')).toBe(false);         // L2
    expect(r.t.takeSlot(2)).toBe(false);                            // the M67's slot
    expect(r.t.grenade.equipped()).toBe(false);
    r.press(false);
    expect(untilEdge(r, 0)).toBe(true);
    expect(r.firearm!.shoulderGate(2)).toBe(true);
    expect(r.t.takeSlot(2)).toBe(true);
    expect(r.t.grenade.equipped()).toBe(true);
    r.dispose();
  });
});
