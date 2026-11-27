// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import type { WeaponRecord } from '@s2u/scene';
import { buildGrid, CLAYMORE, type Grid, type GridParams, type MotionClip, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { BombPage, ownBombBody, PLANT_ANIM } from '../src/bombPage';
import { GrenadeCore, type GrenadeSource } from '../src/grenadeCore';
import { GrenadeThrower } from '../src/grenade';
import type { MotionEntry } from '../src/motionTable';
import type { BombWire } from '../src/net/objective';
import type { ServerEvent } from '../src/net/protocol';
import { ThrowPose } from '../src/throwPose';
import { mountFirearm, type FirearmHands } from '../src/matchFirearm';
import { FlyCamera } from '../src/camera';
import { WalkMode, type PlaySnapshot } from '../src/walk';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import {
  ZOOM_UP_PLACING_REFUSED_READING, ZOOM_UP_PLACING_TYPES, zoomUpPlacingRefused, zoomUpPlacingType,
} from '../src/zoom';

/**
 * LATER 1427 (research 84 §7.2, "Up under a placing"; ZOOM_UP_PLACING_REFUSED_READING; reading, pending review). r0004 (the
 * specification): the controller's Up branch (after the zoom gate 0x5aeac0 at 0x59b278, the Up press byte at 0x59b2f0 and
 * `+0x221` at 0x59b300) reads the view byte `+0x200` signed (0x59b30c) and, when it is above 0, calls Up (0x548fc0 at
 * 0x59b368) only when the action test 0x57d220 answers no for each of `Place claymore` (the word 0x409d18, 0x59b318),
 * 0x3d `Put on ground` (0x59b338) and 0x3e `Put on wall` (0x59b34c); at 0 (third person) Up runs as before. 0x57d220
 * compares the body's action word `+0x534` (the base of the top play's type: 0x58eadc-0x58eae8 at the push, 0x58f120-
 * 0x58f128 when the top changes, -1 with none, 0x58f104) with the type or with its pair's back-link (0x5e9260). The pistol
 * types' back-links are their rifle types (the pairing 0x5e94c0 writes `+2` at 0x5e95b0; called with 0x3d/0x82 at
 * 0x5e82b8, 0x3e/0x83 at 0x5e82c8, `Place claymore`/`Pistol place claymore` at 0x5e857c-0x5e858c), so a pistol placing
 * refuses too. Down (0x548e10, 0x59b2a4) has no such term. r0001 calls Up straight (`FUN_00594cf0` D:L453322-453324).
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);
const run = (g: GrenadeCore, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };

function placer(extra: Partial<GrenadeSource> = {}): { g: GrenadeCore; played: string[] } {
  const g = new GrenadeCore({ grid: () => null, snapshot: () => snap(), view: () => 'third', ...extra });
  g.setKit(['Claymore', 'M67', null]);
  const played: string[] = [];
  g.on('throwStart', (e) => { played.push(e.anim.type); });
  return { g, played };
}

function firearmRig(placing: { on: boolean }, throwClip: { on: boolean } = { on: false }) {
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const hands: FirearmHands = {
    launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
    putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
    mounted: () => false, throwClip: () => throwClip.on, placingClip: () => placing.on,
  };
  const firearm = mountFirearm({
    scene: new Scene(), fly, walk, play: new Play(), remote: new RemotePlayers(new Scene()), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, hands,
  });
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  return firearm;
}

describe('LATER 1427: the placing types r0004 asks (0x59b318-0x59b350) and their pistol pairs', () => {
  it('names the three: `Place claymore`, 0x3d `Put on ground`, 0x3e `Put on wall`', () => {
    expect([...ZOOM_UP_PLACING_TYPES].sort()).toEqual(['Place claymore', 'Put on ground', 'Put on wall']);
  });
  it('a played type counts by itself or through its pistol pair (0x57d220 on `+0x534`, the back-link 0x5e95b0)', () => {
    for (const t of ['Place claymore', 'Put on ground', 'Put on wall', 'Pistol place claymore', 'Pistol put on ground', 'Pistol put on wall']) {
      expect(zoomUpPlacingType(t), t).toBe(true);
    }
    for (const t of ['Throw grenade', 'Pistol throw grenade', 'Toss grenade', 'Get from ground', 'Open door']) {
      expect(zoomUpPlacingType(t), t).toBe(false);
    }
  });
  it('the views: every state above 0 (0x59b30c `lb +0x200`, `blez`) -- first person, the goggles, the binoculars, the scopes', () => {
    expect(zoomUpPlacingRefused(0, true), 'third person: free').toBe(false);
    for (let s = 1; s <= 12; s++) expect(zoomUpPlacingRefused(s, true), `state ${s}`).toBe(true);
    for (let s = 0; s <= 12; s++) expect(zoomUpPlacingRefused(s, false), `state ${s}, no placing`).toBe(false);
  });
  it('names the rule', () => {
    expect(ZOOM_UP_PLACING_REFUSED_READING).toBe('Up refused above third person while a placing type is the body action');
  });
});

describe('LATER 1427: GrenadeCore.placingClipActive -- a placing type played, from the placing\'s start to its clip\'s end', () => {
  it('the claymore placing (`Place claymore`): active in the clip, over once it ends; not a throw clip', () => {
    const { g, played } = placer();
    expect(g.placingClipActive(), 'the ready hand').toBe(false);
    g.select('Claymore');
    g.pull();
    run(g, 0.5);
    expect(played).toEqual(['Place claymore']);
    expect(g.phase()).toBe('throwing');
    expect(g.placingClipActive(), 'in the placing').toBe(true);
    expect(g.throwClipActive(), 'not a throw clip (R4P-111 unchanged)').toBe(false);
    run(g, 3);
    expect(g.phase()).not.toBe('throwing');
    expect(g.placingClipActive(), 'after the clip').toBe(false);
  });
  it('the sidearm\'s placing counts too (LATER 1442: it plays the rifle\'s `Place claymore`)', () => {
    const { g, played } = placer({ pistol: () => true });
    g.select('Claymore');
    g.pull();
    run(g, 0.5);
    expect(played).toEqual(['Place claymore']);                  // LATER 1442 (merged with 1427): the sidearm plays the rifle's placing
    expect(g.placingClipActive()).toBe(true);
  });
  it('a throw is no placing (the control): throwClipActive as R4P-111, placingClipActive false', () => {
    const { g } = placer();
    expect(g.select('M67')).toBe(true);
    run(g, 1);
    expect(g.throwNow(1, false)).toBeNull();
    run(g, 0.2);
    expect(g.throwClipActive()).toBe(true);
    expect(g.placingClipActive()).toBe(false);
  });
});

describe('LATER 1427: matchFirearm.stepZoom -- Up refused under a placing from first person or the scope', () => {
  it('a claymore placing in first person: Up refused; Down still steps (no term on it)', () => {
    const placing = { on: false };
    const f = firearmRig(placing);
    expect(f.stepZoom('in'), 'to first person').toBe(1);
    placing.on = true;
    const mag = f.zoom.target();
    expect(f.stepZoom('in'), 'Up under the placing').toBe(1);
    expect(f.zoom.target()).toBe(mag);
    expect(f.stepZoom('cycle'), 'the page\'s cycle over Up: refused with it').toBe(1);
    expect(f.stepZoom('out'), 'Down: free').toBe(0);
  });
  it('the same placing in third person: Up steps from 0 as today', () => {
    const f = firearmRig({ on: true });
    expect(f.stepZoom('in')).toBe(1);
    expect(f.zoom.target()).toBeCloseTo(1.01, 12);
  });
  it('`Put on wall` from the scope: Up refused; after the placing ends, Up steps', () => {
    const placing = { on: false };
    const f = firearmRig(placing);
    f.zoom.setWeapon({ id: 1, zoomModes: [1.5, 2.5, 5] } as unknown as WeaponRecord);
    f.zoom.set(5);
    placing.on = true;
    expect(f.stepZoom('in'), 'Up in the scope under the placing').toBe(5);
    placing.on = false;
    expect(f.stepZoom('in'), 'after the placing').toBe(6);
  });
  it('the core\'s claymore placing drives the hook: refused in it, free after', () => {
    const { g } = placer();
    const f = firearmRig({ get on() { return g.placingClipActive(); } });
    expect(f.stepZoom('in')).toBe(1);
    g.select('Claymore');
    g.pull();
    run(g, 0.5);
    expect(f.stepZoom('in'), 'in the placing').toBe(1);
    run(g, 3);
    expect(f.stepZoom('in'), 'after: first person steps on').not.toBe(1);
  });
  it('a throw clip (R4P-111) still refuses every step with no placing', () => {
    const throwClip = { on: false };
    const f = firearmRig({ on: false }, throwClip);
    expect(f.stepZoom('in')).toBe(1);
    throwClip.on = true;
    expect(f.stepZoom('out')).toBe(1);
    expect(f.stepZoom('in')).toBe(1);
  });
});

/**
 * LATER 1427 review F5: C4's own placing, 0x3e `Put on wall` (r0004's push at 0x5c5aa4 -> 0x582720 at 0x5c5b10, the twin of
 * r0001's C4 branch D:L475420), started by the Action button's plant (`plantC4` -> the core's `startPlacing`) as the
 * claymore's is: the hook answers in it. The rig is `equipmentAnim.test.ts`'s: a floor and a C4 wall 15 u off.
 */
describe("LATER 1427 review F5: C4's `Put on wall` through the core (plantC4)", () => {
  const DI = 'worldmodel/access1=access1/good_parts/di_good';
  const c4Grid = (): Grid => {
    const f: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
    };
    const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([115, 50, 150, 115, 50, 250, 115, 110, 250, 115, 110, 150]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ]);
  };
  const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
  for (const pistol of [false, true]) {
    it(`C4 planted${pistol ? ' with the sidearm in the hand' : ''}: Up refused in first person, free in third, free after the clip`, () => {
      const grid = c4Grid();
      const g = new GrenadeThrower({
        grid: () => grid, snapshot: () => snap({ yaw: 0 }), view: () => 'third', handPoint: () => [102, 62, 192],
        aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), pistol: () => pistol,
      });
      const played: string[] = [];
      g.on('throwStart', (e) => { played.push(e.anim.type); });
      g.setRecords([C4]);
      g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
      g.setKit(['M67', 'AN-M8', 'C4']);
      const first = firearmRig({ get on() { return g.placingClipActive(); } });
      const third = firearmRig({ get on() { return g.placingClipActive(); } });
      expect(first.stepZoom('in'), 'to first person').toBe(1);
      for (let t = 0; t < 0.3 - 1e-9; t += 1 / 60) g.update(1 / 60);      // the reticle settles on the target (0.2 s)
      expect(g.plantC4()).toBe(true);
      expect(played).toEqual(['Put on wall']);                     // LATER 1442: the sidearm plays the rifle's type too
      expect(g.placingClipActive(), 'in the placing').toBe(true);
      expect(first.stepZoom('in'), 'first person: Up refused').toBe(1);
      expect(third.stepZoom('in'), 'third person: Up steps').toBe(1);
      for (let t = 0; t < 3; t += 1 / 60) g.update(1 / 60);
      expect(g.placingClipActive(), 'after the clip').toBe(false);
      expect(first.stepZoom('in'), 'after: steps on').not.toBe(1);
    });
  }
});

/**
 * LATER 1427 review F1: the bomb's plant and its manual drop push `Place claymore` too -- r0004's MPBOMB branch (-0x66) at
 * 0x5c5d08 and the bomb's state-1 handler 0x5a3860 at 0x5a3960 (r0001 `FUN_005be9a0` D:L475480-475481, `FUN_0059ddb0`
 * D:L457606-457612), each through the push 0x582720 that writes `+0x534`. The port plays both on the own body outside the
 * core (`BombPage`'s `startOwnClip`, `PLANT_ANIM` = `PLACE_CLAYMORE_ANIM`), so the page's hands also ask the bomb page
 * (`BombPage.ownPlacingClip`, `PageHands.placingClip`): while that clip is the own body's top, Up is refused above view 0.
 */
describe("LATER 1427 review F1: the bomb's own plant and manual drop refuse Up past third person", () => {
  const keys = 55;
  const clip = (name: string): MotionClip => ({
    name, version: 5, duration: keys / 30, frameCount: keys, rate: 30, unknown10: -1, unknown14: 1,
    parts: [{ index: 0, name: 'lthigh', flags: 0x0c | 0x10 | 0x20, translations: Float32Array.from([1, -1, 0]), rotations: Float32Array.from([0, 0, 0, 1]) }],
  });
  const entry: MotionEntry = {
    looped: false, playback: 2.7, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: 0.9, noPitchtwist: true, callbacks: [],
  };
  function bombRig(pistol = false) {
    const clips = new Map([PLANT_ANIM.clip, 'seal_p_place_claymore'].map((n) => [n, clip(n)]));
    const pose = new ThrowPose(() => ({ clips, table: new Map([...clips.keys()].map((n) => [n, entry])) }));
    const listeners = new Set<(ev: ServerEvent) => void>();
    const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
    const page = new BombPage({ on: (l) => { listeners.add(l); return () => listeners.delete(l); } }, {
      id: () => 2, team: () => 'seal', alive: () => true, feet: () => [0, 0, 0], actions: () => [],
      look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => 1000,
    }, { ownBody: ownBombBody({ setGearVisible: () => true }, pose, { hold: () => true }, () => pistol) });
    const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
    emit({
      type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
      rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, objective: ground,
    });
    const carried: BombWire = { ...ground, state: 2, carrier: 2 };
    emit({ type: 'bomb', ...carried });
    return { page, pose, emit, ground, carried };
  }
  const plant = (r: ReturnType<typeof bombRig>): void => { r.emit({ type: 'bomb', ...r.carried, hold: { by: 2, kind: 'place', sinceTick: 1300 } }); };
  const drop = (r: ReturnType<typeof bombRig>): void => {
    r.emit({ type: 'bomb', ...r.ground, state: 1, pos: [60, 0, 60], pickupAfterTick: 1240, dropWhy: 'manual' } as ServerEvent);
  };

  for (const [what, act] of [['the plant', plant], ['the manual drop', drop]] as const) {
    for (const pistol of [false, true]) {
      it(`${what}${pistol ? ' (the pistol pair)' : ''}: Up refused in first person while its clip is the own body's top; free in third; free after the pop`, () => {
        const r = bombRig(pistol);
        const hooked = { get on() { return r.page.ownPlacingClip(); } };
        const first = firearmRig(hooked);
        const third = firearmRig(hooked);
        expect(r.page.ownPlacingClip(), 'before').toBe(false);
        expect(first.stepZoom('in'), 'to first person').toBe(1);
        act(r);
        expect(r.page.ownPlacingClip(), 'its clip on top').toBe(true);
        expect(first.stepZoom('in'), 'first person: Up refused').toBe(1);
        expect(first.stepZoom('out'), 'Down: free').toBe(0);
        expect(first.stepZoom('in'), 'third person: Up steps').toBe(1);
        expect(third.stepZoom('in'), 'third person: Up steps').toBe(1);
        r.pose.cut();                                                         // the hold's end pops it (`throwPoseEnds`)
        expect(r.page.ownPlacingClip(), 'popped').toBe(false);
        expect(first.stepZoom('in'), 'after: steps on').not.toBe(1);
      });
    }
  }

  it("another clip on the own body (a throw started after it) is not the bomb's placing", () => {
    const r = bombRig();
    plant(r);
    expect(r.page.ownPlacingClip()).toBe(true);
    r.pose.stop();
    expect(r.page.ownPlacingClip()).toBe(false);
  });
});
