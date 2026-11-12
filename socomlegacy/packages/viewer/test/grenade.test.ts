import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, type LineSegments } from 'three';
import {
  arcPoint, THROW_ARC, buildGrid, gridCast, CLAYMORE_RULES, GAME_FRAME_DT, GameFrameAccumulator, HE, launchGrenade, M67, PLACE_CLAYMORE_ANIM, releaseSeconds,
  stepGrenade, THROW_ANIMS, throwClipSeconds, tumbleQuaternion, type Grid, type GridParams, type V3, type WorldPoly,
  CLAYMORE, maxThrowSpeed, THROW_AIM_CLAMP, throwElevation, type ThrowAnim, type ThrowableRecord,
  CAMERA_SKIP, heldPower, stepThrowPower, segmentHits, AN_M8, SURFACE_SIDE, SURFACE_SKIP, surfaceMaterial, surfaceWord, readKitTable,
} from '@s2u/scene';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc } from '../src/effectData';
import { Effects, type EffectHandle } from '../src/effects';
import { C4_SERVER_DETONATE_GRACE_S_ADAPTATION, CLAYMORE_HELD_TRIGGER_READING, equipmentSlots, GrenadeThrower, KIT_ITEMS, RELEASE_POINT, THROW_POWER_STEP_MAX_S, THROWABLES, worldToActor, type GrenadeItem, type GrenadeSource, type KitItem, type ThrowInfo } from '../src/grenade';
import { TICK_HZ } from '../src/net/protocol';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { blindGlow, blindWash } from '../src/flash';
import { THROW_CLIPS, ThrowPose, throwPoseEnds } from '../src/throwPose';
import {
  C4_FALLBACK_PLACEHOLDER, C4_KIT_TIMER_SECONDS, releaseAimSin, releasePowerClears, THROW_ABORT_POWER, THROW_CLEARANCE_ENDS,
  THROW_CLEARANCE_QUERY_PLACEHOLDER, throwClear, throwClearanceSegment,
} from '../src/throwCommit';
import { loadMap } from '../src/loadMap';
import { Walker, groundGrid, moverSnapshot, TICK } from '../src/mover';
import { aimPick, C4_PLANT_SECONDS } from '../src/equipment';
import type { PlaySnapshot } from '../src/walk';
import { C4_TARGET_MOVED_READING, CLIMB_THROW_REFUSED_READING } from '../src/grenade';

/**
 * The grenades on the page (socomlegacy/docs/research/85): the kit's slots and their controls, the release from the posed
 * hand, and the throw's clip as a one-shot pose layer. The flight itself is `@s2u/scene`'s (`test/projectile.test.ts`).
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

function thrower(extra: Partial<GrenadeSource> = {}): { g: GrenadeThrower; events: string[] } {
  const events: string[] = [];
  const g = new GrenadeThrower({ grid: (): Grid | null => null, snapshot: () => snap(), view: () => 'third', ...extra });
  g.on('equip', (on, item) => events.push(`equip ${on} ${item}`));
  g.on('throw', (t) => events.push(`throw ${t.item} ${t.fromHand}`));
  return { g, events };
}

describe('the kit\'s slots (research 85 §9)', () => {
  it('reports the remote release zAnim once at the projectile origin without echoing a local throw', () => {
    const { g, events } = thrower();
    const sounds: unknown[] = [];
    g.on('remoteRelease', e => sounds.push(e));
    for (const item of ['M67', 'HE', 'AN-M8', 'Mark141'] as const) {
      g.launchRemote(item, [1, 50, 3], [0, 0, -100], 7);
    }
    expect(sounds).toEqual((['M67', 'HE', 'AN-M8', 'Mark141'] as const).map(item => ({
      item, id: THROWABLES[item].id, fireAnim: THROWABLES[item].fireAnim,
      from: [1, 50, 3], owner: 7,
    })));
    expect(events).toEqual([]);
    g.launchRemote('not-an-item', [1, 50, 3], [0, 0, -100], 7);
    g.launchRemote('Detonator', [1, 50, 3], [0, 0, 0], 7);
    expect(sounds).toHaveLength(4);
  });
  it('cancels a menu-owned held grenade without throwing or consuming it', () => {
    const { g, events } = thrower();
    g.select('M67'); g.pull(); expect(g.phase()).toBe('holding');
    g.cancelMenuHold(); g.release(); g.update(1);
    expect(g.phase()).toBe('ready');
    expect(events.filter(e => e.startsWith('throw '))).toEqual([]);
    g.pull(); expect(g.phase()).toBe('holding');
  });
  // Ported from Chris's browser-beta-v5 (chris/browser-beta-integration d578f347, his grenade.test.ts 'rejects
  // unsupported C4 and arbitrary item names'): a name that is no item -- an Object prototype key among them -- is
  // refused and leaves the hand as it was. His C4 half is not ours: C4 is a kit item here (research 94 §C5.1).
  it('refuses a name that is no item, prototype keys included, the item in the hand unchanged', () => {
    const { g } = thrower();
    expect(g.select('HE')).toBe(true);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'nothing']) {
      expect(() => g.select(name as KitItem)).not.toThrow();
      expect(g.select(name as KitItem)).toBe(false);
      expect(g.item()).toBe('HE');
      expect(g.held()).toBe('HE');
      expect(g.equip(true, name as GrenadeItem)).toBe(true);           // still the HE up: nothing taken
      expect(g.item()).toBe('HE');
    }
  });

  it('another player\'s throw of a name that is no item flies nothing (launchRemote: the wire\'s kind)', () => {
    const { g } = thrower();
    for (const name of ['constructor', 'toString', 'nothing']) {
      expect(() => g.launchRemote(name, [0, 50, 0], [1, 0, 0], 2)).not.toThrow();
    }
    expect(g.stats().live).toHaveLength(0);
  });

  it('selects by name and cycles like the inventory (L1 and L2 are the firearms: ./kit)', () => {
    const { g, events } = thrower();
    expect(KIT_ITEMS).toEqual(['rifle', 'M67', 'HE', 'AN-M8', 'Mark141', 'Claymore', 'Detonator']);
    expect(g.select('HE')).toBe(true);
    expect(g.item()).toBe('HE');
    expect(g.icon()).toBe(HE.icon);
    expect(g.cycleInventory()).toBe('AN-M8');
    expect(g.icon()).toBe('grenade_smoke_icon.tif');
    expect(g.cycleInventory()).toBe('Mark141');
    expect(g.icon()).toBe('grenade_flashbang_icon.tif');
    expect(g.cycleInventory()).toBe('Claymore');
    expect(g.select('Detonator')).toBe(false);               // no charge down: the Detonator is not offered
    expect(g.cycleInventory()).toBe('rifle');
    expect(g.icon()).toBeNull();
    expect(g.cycleInventory()).toBe('M67');
    expect(g.select('rifle')).toBe(true);                    // the firearm back in the hand
    expect(g.select('M67')).toBe(true);
    expect(events).toEqual([
      'equip true HE', 'equip true AN-M8', 'equip true Mark141', 'equip true Claymore', 'equip false null', 'equip true M67', 'equip false null', 'equip true M67',
    ]);
  });

  it('counts each throwable apart, and skips an empty one', () => {
    const { g } = thrower();
    g.select('HE');
    for (let i = 0; i < 3; i++) expect(g.throwNow(1)?.item).toBe('HE');
    expect(g.stats().leftByItem).toEqual({ M67: 3, HE: 0, 'AN-M8': 3, Mark141: 6, Claymore: 4 });
    expect(g.throwNow(1)).toBeNull();
    g.update(2);                                             // the last clip's tail: none left, back to the rifle
    expect(g.equipped()).toBe(false);
    expect(g.select('HE')).toBe(false);
    g.select('M67');
    expect(g.cycleInventory()).toBe('AN-M8');              // M67 -> (HE is empty) -> the smoke
  });

  it('the equipment slots, in the order of the kit: 3 takes slot 1, 4 slot 2 (the owner, 2026-09-29); no per-type keys', () => {
    expect(equipmentSlots()).toEqual(['M67', 'HE', 'AN-M8', 'Mark141', 'Claymore']);
    expect(equipmentSlots({ ...THROWABLES, M67: { ...THROWABLES.M67, capacity: 0 } }).slice(0, 2)).toEqual(['HE', 'AN-M8']);
    const { g, events } = thrower();
    expect(g.selectEquipment(1)).toBe(true);
    expect(g.item()).toBe('M67');
    expect(g.selectEquipment(1)).toBe(true);                 // already up: stays (no toggle back, as the game's switch)
    expect(g.equipped()).toBe(true);
    expect(g.selectEquipment(2)).toBe(true);
    expect(g.item()).toBe('HE');
    expect(g.selectEquipment(3)).toBe(true);                 // the page binds only 3 and 4; a third slot exists
    expect(g.selectEquipment(9)).toBe(false);                // past the kit: nothing
    expect(events).toEqual(['equip true M67', 'equip true HE', 'equip true AN-M8']);
    // The digits are the page's (`./kit`'s `hotkey`): the thrower binds none of its own.
    expect('bindKey' in g).toBe(false);
  });
});

describe('the release from the posed hand (CZKit_TickExplosives 0x5c1970)', () => {
  it('takes the right hand\'s (2, 0, 0) when the body offers it, and the table\'s point when not', () => {
    const asked: string[] = [];
    const hand: V3 = [104, 69, 199];
    const { g } = thrower({ handPoint: (part, p) => { asked.push(`${part} ${p.join(',')}`); return hand; } });
    const t = g.throwNow(1)!;
    expect(asked).toEqual([`rhand ${RELEASE_POINT.join(',')}`]);
    expect(t.from).toEqual(hand);
    expect(t.fromHand).toBe(true);
    // The launch took the hand in the actor frame: its height is the hand's 19 over the feet.
    expect(t.launch.maxSpeed).toBeCloseTo(600 / (0.707107 * Math.sqrt((19 + 600) * 2 / 98)), 6);
    const plain = thrower().g.throwNow(1)!;
    expect(plain.fromHand).toBe(false);
    expect(worldToActor([100, 50, 200], 90, plain.from).map((v) => Math.round(v * 1e6) / 1e6)).toEqual(THROW_ANIMS.standThrow.offset);
  });

  it('while the lean holds, the throw is the lean toss, the left one from the left hand', () => {
    const asked: string[] = [];
    const right = thrower({ snapshot: () => snap({ peek: 1, leanClip: true }) }).g;
    expect(right.throwNow(1)!.anim.clip).toBe('seal_toss_rlean');
    const left = thrower({ snapshot: () => snap({ peek: -1, leanClip: true }), handPoint: (part) => { asked.push(part); return [0, 60, 0]; } }).g;
    expect(left.throwNow(1)!.anim.clip).toBe('seal_toss_llean');
    expect(asked).toEqual(['lhand']);
    expect(thrower({ snapshot: () => snap({ peek: 0 }) }).g.throwNow(1)!.anim.clip).toBe('seal_throwgrenade');
  });

  it("the lean toss is thrown when the body is in state 3 with its lean clip playing -- right at release 0.55, left at 0.87 -- and never from the camera's eased peek value (GetThrowAnim D:L441773-441796)", () => {
    const right = thrower({ snapshot: () => snap({ peek: 1, leanClip: true }) }).g.throwNow(1)!;
    expect(right.anim).toBe(THROW_ANIMS.peekRightToss);
    expect(right.anim.release).toBe(0.55);                          // 0x3f0ccccd
    const crouched = thrower({ snapshot: () => snap({ peek: 1, leanClip: true, stance: 'crouch', crouched: true }) }).g.throwNow(1)!;
    expect(crouched.anim).toBe(THROW_ANIMS.peekRightToss);         // 0x20 `Crouch peek right`: the same toss
    const left = thrower({ snapshot: () => snap({ peek: -1, leanClip: true }) }).g.throwNow(1)!;
    expect(left.anim).toBe(THROW_ANIMS.peekLeftToss);
    expect(left.anim.release).toBe(0.87);                           // 0x3f5eb852
    // State 3 with no lean clip playing (and the prone leans, 0xe9/0xea, are neither 0x1d-0x20): GetThrowAnim returns 0, no throw.
    expect(thrower({ snapshot: () => snap({ peek: 1 }) }).g.throwNow(1)).toBeNull();
    expect(thrower({ snapshot: () => snap({ peek: -1, leanClip: true, stance: 'prone' }) }).g.throwNow(1)).toBeNull();
  });

  it('hangs the grenade on the held node while it is up, and lets go of it at the release', () => {
    const node = new Group(), model = new Group();
    const { g } = thrower({ heldNode: () => node });
    g.setMap({ [M67.model]: model }, null);
    g.select('M67');
    g.update(0.016);
    expect(node.children.length).toBe(1);
    expect(g.stats().inHand).toBe(true);
    g.throwNow(1);
    g.update(0.016);
    expect(g.stats().inHand).toBe(false);
  });
});

describe('the throw\'s clip (./throwPose)', () => {
  const pack = fixture('RUN/MOTION_P.ZAR'), readerc = fixture('RUN/READERC.ZAR');
  // PAR-85 (research 251 section 12.9): a throw is the stack's top -- at 1 from its first key to its pop. Was titled "plays
  // the one-shot at its playback, blends in and out, and fires throw_whoosh by its phase" (a linear fade in and out).
  it.skipIf(!pack || !readerc)('plays the one-shot at its playback at 1 from its first key, fires throw_whoosh by its phase, and with no hold carrying it pops the frame after its last key', () => {
    const clips = new Map(clipsFromPack(pack!, THROW_CLIPS).map((c) => [c.name, c]));
    const table = motionTableFromArchive(readerc!);
    expect(clips.size).toBe(THROW_CLIPS.length);
    const pose = new ThrowPose(() => ({ clips, table }));
    const a = THROW_ANIMS.standThrow;
    expect(pose.start(a)).toBe(true);
    expect(pose.stats().weight).toBe(1);                     // the stack's top: drawn alone from its first key
    const calls: string[] = [];
    let t = 0;
    for (; t < releaseSeconds(a) - 1e-9; t += 1 / 60) calls.push(...pose.step(1 / 60));
    expect(pose.stats().phase).toBeCloseTo(a.release, 1);  // the hand opens on the clip's own frame
    expect(calls).toEqual(['throw_whoosh']);                 // at phase 0.45, just before the release's 0.46
    expect(pose.stats().weight).toBe(1);                     // its push's ease is the body's cross-fade (./animator)
    for (; t < throwClipSeconds(a) - 1e-9; t += 1 / 60) pose.step(1 / 60);
    expect(pose.playing()).toBe(true);
    expect(pose.stats().weight).toBe(1);                     // to its last key at 1: no fade of its own
    for (let i = 0; i < 3; i++) pose.step(1 / 60);
    expect(pose.playing()).toBe(false);                      // no hold carries it: popped after its last key was drawn
  });

  it('without the clip it does not play, and the grenade still flies', () => {
    const pose = new ThrowPose(() => null);
    expect(pose.start(THROW_ANIMS.standThrow)).toBe(false);
    expect(pose.step(0.1)).toEqual([]);
  });
});

describe('the smoke and the flash going off', () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };

  it('the flash whites out by the game\'s rule: facing it close is level 3, turned away level 1', () => {
    const seen: (number | null)[] = [];
    const floor: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
    };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    const grid = buildGrid(params, [], [], [floor], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
    let yaw = 0;
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ yaw }) });
    g.on('explode', (e) => seen.push(e.flash));
    g.select('Mark141');
    // A weak lob: it lands a few units ahead and lies there. Four ticks' hold, the weakest the release request takes
    // (PAR-20 D10: a power under .15 throws nothing, `FUN_005be9a0` D:L475497).
    g.throwNow(4 / 60);
    run(g, 1.6);
    g.throwNow(4 / 60);
    yaw = 180;                                                // turned round once it has left the hand
    run(g, 1.6);
    expect(seen).toEqual([3, 1]);
    // P2 (the online-parity sweep's TB-1): online the page reckons no level of its own -- the room's gated blast does
    // (`blast.flash`, `NetPage`'s `whiteOut`); `FUN_005a5250`'s slot 0 only inside `FUN_005a0e70` (D:L459228).
    const online: (number | null)[] = [];
    const net = thrower({ grid: () => grid, snapshot: () => snap({ yaw: 0 }), online: () => true }).g;
    net.on('explode', (e) => online.push(e.flash));
    net.select('Mark141');
    net.throwNow(4 / 60);
    run(net, 1.6);
    expect(online).toEqual([null]);
    // The blind (PF-07b, research 202 §3.9 and V7 §8.2; `../src/flash`, `flash.test.ts`): the wash from the flash,
    // the glow full from 0.2 s; level 3 holds 60 to 8 s and clears by 10 s (glow 10.2 s), level 1 is 25 and 2 passes.
    expect(blindGlow(3, 0).fix).toBe(0);
    expect(blindGlow(3, 0.2).fix).toBe(255);
    expect(blindGlow(3, 8).fix).toBe(255);
    expect(blindGlow(3, 9.2).fix).toBe(128);
    expect(blindWash(3, 8)).toEqual([0.75, 0.75, 0.75, 60.5]);
    expect(blindWash(3, 10)).toBeNull();
    expect(blindWash(1, 0)).toEqual([0.9, 0.9, 0.9, 25.5]);
    expect(blindGlow(1, 0.2)).toEqual({ passes: 2, fix: 255 });
  });

  it('the smoke detonates with nothing to hurt, keeps its canister, and hands the effects smoke_grenade first', () => {
    const played: string[] = [];
    const { g } = thrower();
    g.setEffectPlayer((anim) => { played.push(anim); return false; });
    let info: { detonation: string; damageToPlayer: number; byEffects: boolean } | null = null;
    g.on('explode', (e) => { info = e; });
    g.select('AN-M8');
    g.throwNow(0.2);
    run(g, 3.1);
    expect(played).toEqual(['smoke_grenade']);
    expect(info).toMatchObject({ detonation: 'smoke', damageToPlayer: 0, byEffects: false });
    expect(g.stats().effects).toBeGreaterThan(0);             // the placeholder's puffs, since the effects said no
    g.setEffectPlayer(() => true);
    g.select('AN-M8');
    g.throwNow(0.2);
    const before = g.stats().effects;
    run(g, 3.1);
    expect(g.stats().explosions.at(-1)!.byEffects).toBe(true);
    expect(g.stats().effects).toBeLessThanOrEqual(before + 40);
  });

  const claymoreFloor = (): Grid => {
    const floor: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
    };
    // PF-13: a pool of WATER (byte 11) 5 deep over x 1700..1900, z -1900..-1700, far from every other placement here.
    const pool: WorldPoly = { ...floor, path: 'worldmodel/pool', material: 11, points: Float32Array.from([1700, 55, -1900, 1900, 55, -1900, 1900, 55, -1700, 1700, 55, -1700]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [floor, pool], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/pool', first: 1, count: 1 },
    ]);
  };

  it('the claymore: the placing clip, down under the hand at 1.3 s, the Detonator up, and off only when it is fired', () => {
    const grid = claymoreFloor();
    const booms: { damageToPlayer: number; anim: string }[] = [];
    const clips: string[] = [];
    const { g, events } = thrower({ grid: () => grid, snapshot: () => snap({ feet: [100, 50, 200], yaw: 0 }), handPoint: () => [102, 62, 192] });
    g.on('explode', (e) => booms.push(e));
    g.on('throwStart', ({ anim, releaseIn }) => clips.push(`${anim.clip} ${releaseIn}`));
    g.select('Claymore');
    g.pull();                                                  // R1: the `Place claymore` action, not the charge yet
    expect(clips).toEqual([`seal_place_claymore ${CLAYMORE_RULES.placeSeconds}`]);
    expect(g.stats()).toMatchObject({ placing: true, placed: 0, held: 'Claymore' });
    run(g, 1.25);
    expect(g.stats().placed).toBe(0);
    run(g, 0.1);                                               // 1.3 s in: down
    const set = g.stats().live[0]!;
    expect(set.pos).toEqual([102, 50, 192]);
    expect(set.state).toBe('rest');
    expect(g.stats()).toMatchObject({ placing: false, placed: 1, held: 'Detonator', icon: 'detonator_icon.tif' });
    expect(g.stats().leftByItem.Claymore).toBe(3);
    expect(events.at(-1)).toBe('equip true Detonator');
    run(g, 20);
    expect(booms).toEqual([]);                                 // no fuse, no tripwire: it waits
    g.pull();                                                  // R1 with the Detonator: CZKit_DetonateRemoteExplosives
    expect(g.stats().held).toBe('Claymore');                   // FUN_005c8a20(0x99): the claymore back up
    run(g, 0.1);
    expect(booms[0]!.anim).toBe('claymore_stone');             // the material variant first; the effects fall back
    // The SEAL stands behind it (its cone points the way he faced): a 32nd of the damage.
    expect(booms[0]!.damageToPlayer).toBeCloseTo(16 / 32, 9);
    // The clip is the motion pack's, and the page asks for it.
    expect(THROW_CLIPS).toContain(PLACE_CLAYMORE_ANIM.clip);
  });

  // PF-36 (research 235 s4; ruling PF.R56): the room's `placed` names the page's own charge, its `detonate` sets a copy off.
  it("tagOwn gives the page's own charge the room's pid by kind and launch point; detonateRemote sets a resting copy's trigger so its next step explodes with sound and scorch (a live event, not a hydrate); an unknown pid is ignored", () => {
    const grid = claymoreFloor();
    const booms: { item: string; material: string | null; detonation: string }[] = [];
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ feet: [100, 50, 200], yaw: 0 }), handPoint: () => [102, 62, 192] });
    g.on('explode', (e) => booms.push({ item: e.item, material: e.material, detonation: e.detonation }));
    g.select('Claymore');
    g.pull();
    run(g, 1.35);                                              // down at [102, 50, 192]
    expect(g.stats().live[0]!.pos).toEqual([102, 50, 192]);
    g.tagOwn('M67', [102, 50, 192], 4);                      // another kind: not this one
    g.tagOwn('Claymore', [140, 50, 192], 4);                 // another point: not this one
    expect(g.stats().live[0]!.pid).toBeUndefined();
    g.tagOwn('Claymore', [102.005, 50, 192], 5);             // OWN_PID_READING: the room's pid for it
    expect(g.stats().live[0]!.pid).toBe(5);
    g.launchRemote('Claymore', [300, 50.1, 200], [1, 0, 0], 3, { pid: 8 });   // another player's, told by its grenade event
    g.detonateRemote(99);                                      // no such pid: nothing
    run(g, 1);
    expect(booms).toEqual([]);
    g.detonateRemote(5);                                       // the page's own claymore, shot in the room
    run(g, 0.1);
    expect(booms).toEqual([{ item: 'Claymore', material: expect.any(String), detonation: 'blast' }]);   // a material: the scorch
    expect(g.stats().live.find((l) => l.pid === 5)!.state).toBe('detonated');
    g.detonateRemote(8);                                       // the other's copy
    run(g, 0.1);
    expect(booms.map((b) => b.item)).toEqual(['Claymore', 'Claymore']);
    expect(g.stats().live.find((l) => l.pid === 8)!.state).toBe('detonated');
    g.detonateRemote(5);                                       // gone off already: not again
    run(g, 0.5);
    expect(booms).toHaveLength(2);
  });

  it("research 386 §3.2 (LATER 63): fireScene -- a scene FIRE_WEAPON's round the room set off -- explodes the item's round where told on the next step, another's (no page blast); an unknown item is ignored", () => {
    const grid = claymoreFloor();
    const booms: { item: string; pos: number[]; detonation: string; damage: number }[] = [];
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ feet: [100, 50, 200], yaw: 0 }), handPoint: () => [102, 62, 192] });
    g.on('explode', (e) => booms.push({ item: e.item, pos: [...e.pos], detonation: e.detonation, damage: e.damageToPlayer }));
    g.fireScene('no such item', [0, 0, 0]);
    g.fireScene('C4', [120, 55, 200]);                       // no C4 record yet (the disc's kit tables): nothing
    run(g, 0.1);
    expect(booms).toEqual([]);
    // C4's record as the kit table's (research 182; this file's own C4 transcription, below): placed, Timer1 6 s.
    g.setRecords([{ ...THROWABLES.Claymore, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 }]);
    g.fireScene('C4', [120, 55, 200]);
    run(g, 0.1);
    expect(booms.map((b) => [b.item, b.pos, b.detonation])).toEqual([['C4', [120, 55, 200], 'blast']]);
    expect(g.stats().live.every((l) => l.state !== 'rest')).toBe(true);
  });

  // The regression of sprint 30's browser gate (remoteCombat.spec.ts:422; research 235 s7): the page's half, three owners.
  it("a detonate for one pid fires only that copy; tagOwn never tags another owner's copy, even laid at the same point; another player's Detonator leaves a charge it does not own", () => {
    const grid = claymoreFloor();
    const booms: V3[] = [];
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ feet: [100, 50, 200], yaw: 0 }), handPoint: () => [102, 62, 192] });
    g.on('explode', (e) => booms.push(e.pos as V3));
    g.launchRemote('Claymore', [140, 50.1, 200], [1, 0, 0], 2, { pid: 7 });    // BRAVO's
    g.launchRemote('Claymore', [180, 50.1, 200], [1, 0, 0], 3, { pid: 8 });    // CHARLIE's
    g.launchRemote('Claymore', [220, 50.1, 200], [1, 0, 0], 3);                // CHARLIE's, from an older room: no pid
    g.tagOwn('Claymore', [140, 50.1, 200], 9);                 // the point of BRAVO's copy: it is not the page's own
    g.tagOwn('Claymore', [220, 50.1, 200], 9);                 // nor the pid-less remote one
    expect(g.stats().live.map((l) => l.pid)).toEqual([7, 8, undefined]);
    g.launchRemote('Detonator', [180, 50, 220], [0, 0, 0], 3); // CHARLIE's Detonator: his own two, never BRAVO's
    run(g, 0.2);
    expect(booms.map((p) => p[0])).toEqual([180, 220]);
    expect(g.stats().live[0]!.state).toBe('rest');
    g.detonateRemote(7);                                       // the room's detonate for BRAVO's pid: that copy only
    run(g, 0.2);
    expect(booms.map((p) => p[0])).toEqual([180, 220, 140]);
  });

  it('the claymore: four down at most, set down on the move, none wading past 3.2 u or off the ground, and the Detonator reaches 500 units', () => {
    const grid = claymoreFloor();
    let feet: V3 = [100, 50, 200], vx = 0;
    const refused: string[] = [];
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ feet, yaw: 0, vx }), handPoint: () => [feet[0] + 2, feet[1] + 12, feet[2] - 8] });
    g.on('refuse', (r) => refused.push(r.text));
    const place = (): void => { g.select('Claymore'); g.pull(); run(g, 3); };
    feet = [1800, 50, -1800];                                  // wading 5 deep (> CLAYMORE_RULES.maxWaterDepth 3.2): not started
    g.select('Claymore');
    g.pull();
    expect(g.stats().placing).toBe(false);
    feet = [100, 200, 200];                                    // the hand 162 over a floor 150 below the feet: out of reach
    place();
    expect(g.stats().placed).toBe(0);
    expect(g.stats().leftByItem.Claymore).toBe(4);
    feet = [100, 50, 200];
    vx = 40;                                                   // PF-13: on the move it goes down (the game reads no speed)
    place();
    expect(g.stats().placed).toBe(1);
    vx = 0;
    feet = [700, 50, 200];                                     // 600 units along
    place();
    feet = [1300, 50, 200];
    place();
    place();
    expect(g.stats().placed).toBe(4);
    expect(g.stats().leftByItem.Claymore).toBe(0);
    expect(g.stats().held).toBe('Detonator');
    // Fired at the far end: the two at its feet go, the one 600 units back is beyond the Detonator's 500.
    expect(g.detonateCharges()).toBe(2);
    expect(g.stats().held).toBeNull();                         // no claymore left: back to the rifle
    run(g, 0.1);
    expect(g.stats().placed).toBe(2);
    expect(g.select('Detonator')).toBe(true);                  // still two down
    expect(refused).toEqual([]);
  });

  // P38 (the online-parity sweep's TB-13; research 85 §9.7.1): the original holds no FireWait between the Detonator's
  // fires -- its branch of the fire (`FUN_005be9a0`, type -0x3f, D:L475477-475478) sets no fire timer `+0x81c` (only
  // D:L475488 and D:L475517 do; it is the gate `FUN_005c0ae0`'s only timed refusal, D:L476446) -- and its fire puts it
  // down (`FUN_005c0130` -> `FUN_005c8a20(0x99)`, D:L476031). So a press at once after it is the claymore's, and the
  // Detonator taken up again fires at once. The room's old `detonate` 'rate' refusal (`p.detonateAt`) was never mirrored
  // here; P38-room dropped it (research 85 s9.7.1, "The room takes a detonate at its command").
  // The re-take's timing (the "at once" and the placing 0.05 s on): the switch (`FUN_005c8a20` -> `FUN_005c50b0` /
  // `FUN_005c6980`) sets no timer, and `+0x820` is set only through `FUN_005c32b0` from `FUN_005c5340`, a branch that
  // excludes -0x3f (read); the gate's animation checks (`FUN_00286b80(+0x1160) < 1.0` behind `FUN_003d1e20`,
  // D:L476424, D:L476434) are unread -- they may hold a fire after the switch.
  it("P38: the Detonator keeps no FireWait -- a press 0.05 s after its fire is the claymore's; taken up again, it fires at once", () => {
    const grid = claymoreFloor();
    let feet: V3 = [100, 50, 200];
    const fired: number[] = [];
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ feet, yaw: 0 }), handPoint: () => [feet[0] + 2, feet[1] + 12, feet[2] - 8] });
    g.on('detonate', (d) => fired.push(d.count));
    const frames = (n: number): void => { for (let i = 0; i < n; i++) g.update(1 / 60); };
    const place = (): void => { g.select('Claymore'); g.pull(); run(g, 3); };
    place();                                                   // one down at x 100
    feet = [700, 50, 200];
    place();                                                   // one down at x 700, 600 on from the first
    expect(g.stats()).toMatchObject({ placed: 2, held: 'Detonator' });
    g.pull();                                                  // the one at its feet; the first is beyond 500
    expect(fired).toEqual([1]);
    expect(g.stats().held).toBe('Claymore');                   // FUN_005c8a20(0x99): the Detonator down
    frames(3);                                                 // 0.05 s on
    expect(g.select('Detonator')).toBe(true);                  // the first still down: it may be taken up
    g.pull();                                                  // no FireWait: it fires (nothing in reach, the fire all the same)
    expect(fired).toEqual([1, 0]);
    expect(g.stats().held).toBe('Claymore');
    frames(3);                                                 // 0.05 s on again
    g.pull();                                                  // the claymore's fire: a placing, no third detonate
    expect(fired).toEqual([1, 0]);
    expect(g.stats().placing).toBe(true);
  });

  it('the claymore: a fifth is refused with the game\'s message', () => {
    const grid = claymoreFloor();
    const refused: string[] = [];
    const records = { ...THROWABLES, Claymore: { ...THROWABLES.Claymore, capacity: 6 } };   // more in the pouch than may be down
    const h = new GrenadeThrower({ grid: () => grid, snapshot: () => snap({ feet: [100, 50, 200], yaw: 0 }), view: () => 'third', handPoint: () => [102, 62, 192] }, records);
    h.on('refuse', (r) => refused.push(r.text));
    for (let i = 0; i < 5; i++) { h.select('Claymore'); h.pull(); run(h, 3); }
    expect(h.stats().placed).toBe(4);
    expect(h.stats().leftByItem.Claymore).toBe(2);
    expect(refused).toEqual(['Unable To Deploy: Max Equipment Items Placed (4)']);
    expect(h.stats().message).toBeNull();                      // 2 s on screen, then gone
  });
});

/**
 * PAR-96 B4 (research 256 §8.2-§8.4; R256.6): the page's count is the SEAL's own claymores at rest (`claymoresDown`):
 * `FUN_003cc1f0` counts the placed entries marked `+0xc5`, the claymore's alone (`FUN_003c51c0(charge, type == -0x67)`,
 * D:L474101), owned and live -- asked by the claymore's and the PMN's fire (D:L475306-475369) and the Detonator's slot
 * gate (`FUN_005bdc30` D:L474637-474641), never by C4's plant. B6: `CLAYMORE_HELD_TRIGGER_READING` names the page's
 * once-per-press model of the original's every-frame re-ask while the trigger is held (research 256 §8.5 U2).
 */
describe("PAR-96 B4: the page counts the SEAL's claymores only (FUN_003cc1f0; research 256 §8.4)", () => {
  const DI = 'worldmodel/access1=access1/good_parts/di_good';
  const PMN: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10, model: 'pmn', icon: 'pmn.tif', capacity: 4 };
  const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
  const grid = (): Grid => {
    const f: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
    };
    const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ]);
  };
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  /** A SEAL with `kit` (the claymore, the PMN, C4 as named), a C4 target under the reticle and no actor to trip a PMN. */
  function seal(kit: (string | null)[]) {
    const map = grid();
    const g = new GrenadeThrower({
      grid: () => map, snapshot: () => snap({ yaw: 0 }), view: () => 'third', handPoint: () => [102, 62, 192],
      aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), actors: () => [],
    });
    g.setRecords([PMN, C4]);
    g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
    g.setKit(kit);
    const refused: string[] = [], placed: string[] = [];
    g.on('refuse', (r) => refused.push(r.text));
    g.on('place', (e) => placed.push(e.item));
    const place = (item: 'Claymore' | 'PMN Mine'): void => { g.select(item); g.pull(); run(g, 3); };
    return { g, refused, placed, place };
  }

  it('four PMNs of the SEAL down: a claymore is placed, no message (the PMN is never marked +0xc5)', () => {
    const s = seal(['Claymore', 'PMN Mine', 'PMN Mine']);
    for (let i = 0; i < 4; i++) s.place('PMN Mine');
    expect(s.placed).toEqual(['PMN Mine', 'PMN Mine', 'PMN Mine', 'PMN Mine']);
    expect(s.g.stats().placed).toBe(0);                        // the instrument: the SEAL's claymores down
    s.g.select('Claymore');
    s.g.pull();
    expect(s.g.stats().placing).toBe(true);
    expect(s.refused).toEqual([]);
    run(s.g, 3);
    expect(s.placed.at(-1)).toBe('Claymore');
    expect(s.g.stats().placed).toBe(1);
  });

  it('a PMN down and no claymore: the Detonator is not taken up (FUN_005bdc30 D:L474637-474641 counts claymores)', () => {
    const s = seal(['Claymore', 'PMN Mine', null]);
    s.place('PMN Mine');
    expect(s.placed).toEqual(['PMN Mine']);
    expect(s.g.select('Detonator')).toBe(false);
    expect(s.g.takeable('detonator')).toBeNull();
    expect(s.g.held()).toBe('PMN Mine');
  });

  it('the controls: four claymores down, a PMN is refused with the message (D:L475338-475340); C4 is planted (its fire asks no count)', () => {
    const s = seal(['Claymore', 'PMN Mine', 'C4']);
    for (let i = 0; i < 4; i++) s.place('Claymore');
    expect(s.g.stats().placed).toBe(4);
    expect(s.g.takeable('detonator')).toBe('Detonator');
    s.g.select('PMN Mine');
    s.g.pull();
    expect(s.g.stats().placing).toBe(false);
    expect(s.refused).toEqual([CLAYMORE_RULES.maxPlacedMessage]);
    expect(s.g.plantC4()).toBe(true);
    run(s.g, 2);
    expect(s.placed).toEqual(['Claymore', 'Claymore', 'Claymore', 'Claymore', 'C4']);
  });

  it("B6, CLAYMORE_HELD_TRIGGER_READING ('per press'): a held trigger asks the fire once -- the message once over 4.5 s held", () => {
    expect(CLAYMORE_HELD_TRIGGER_READING).toBe('per press');
    const s = seal(['Claymore', 'Claymore', null]);              // eight in the pouch: more than may be down
    for (let i = 0; i < 4; i++) s.place('Claymore');
    s.g.select('Claymore');
    s.g.pull();                                                // held: no release for 4.5 s
    run(s.g, 4.5);
    expect(s.refused).toEqual([CLAYMORE_RULES.maxPlacedMessage]);
    expect(s.g.stats().placing).toBe(false);
  });
});

/**
 * PF-28 (ruling PF.R47; research 231 s2): a late joiner's projectiles from the welcome's envelope, laid at the phase the
 * room has them in -- the flight at its age and fuse, a charge at rest with its facing and owner, an AN-M8 past its
 * fuse as its smoke from its age (`SMOKE_PHASE_ON_WIRE_READING`) -- and nothing replayed: no explode, no blast, no sound.
 * By `pid`: the same projectile told twice (the event, then a rejoin's welcome) is one entry.
 */
describe('PF-28: the joiner\'s projectiles (GrenadeThrower.launchRemote with a hydrate state)', () => {
  it('launchRemote with a hydrate state lays a flying grenade at its age and fuse, a resting charge with its facing and owner, and a detonated AN-M8 pouring smoke from its age -- no explode listener, no blast, no sound', () => {
    const { g } = thrower();
    const heard: string[] = [];
    g.on('explode', (e) => heard.push(`explode ${e.item}`));
    g.on('bounce', () => heard.push('bounce'));
    g.launchRemote('M67', [0, 500, 0], [100, 0, 0], 2, { pid: 7, state: 'flight', age: 1, fuse: 2, removal: 2.1 });
    // The same pid again (a rejoin's welcome after the event): replaced, never doubled.
    g.launchRemote('M67', [10, 490, 0], [100, -50, 0], 2, { pid: 7, state: 'flight', age: 1.1, fuse: 1.9, removal: 2 });
    g.launchRemote('Claymore', [300, 50, 200], [1, 0, 0], 3, { pid: 8, state: 'rest', age: 10, fuse: 9999989, removal: 0 });
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, state: 'detonated', age: 5, fuse: -2, removal: 35 });
    const live = g.stats().live;
    expect(live.map((l) => l.pid)).toEqual([7, 8, 9]);
    expect(live[0]).toMatchObject({ pos: [10, 490, 0], vel: [100, -50, 0], state: 'flight', age: 1.1, fuse: 1.9, removal: 2 });
    expect(live[1]).toMatchObject({ pos: [300, 50, 200], state: 'rest', age: 10, owner: 3 });
    expect(live[1]!.facing).toBeCloseTo(-90, 9);                  // facing +x: yaw atan2(-1, 0), as a placed charge's event
    expect(live[2]).toMatchObject({ state: 'detonated', age: 5 });
    // The smoke 2 s into its 37 (Timer2 - Timer1), poured from there; no explode was fired for it, nothing heard.
    expect(g.stats().smokes).toEqual([{ pos: [40, 50, 40], age: 2, until: 37, pid: 9 }]);
    expect(g.stats().explosions).toEqual([]);
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    expect(g.stats().effects).toBeGreaterThan(0);                 // the puffs
    expect(g.stats().smokes[0]!.age).toBeCloseTo(2 + 10 / 60, 9);
    expect(heard).toEqual([]);
    expect(g.stats().explosions).toEqual([]);
    // A detonated frag (its 0.1 s after the blast) lays nothing: the blast is not replayed.
    g.launchRemote('M67', [0, 50, 0], [0, 0, 0], 2, { pid: 10, state: 'detonated', age: 3.05, fuse: -0.05, removal: 0.05 });
    expect(g.stats().live.map((l) => l.pid)).toEqual([7, 8, 9]);
    expect(heard).toEqual([]);
  });
});

/**
 * LATER 643 (research 85 §6.1): the room's `grenade` event carries the throw's age (ticks of the room's clock from the
 * release, as the room flew it), and the page starts its copy of another's throw that far into its flight -- the same
 * flight, a game frame at a time with the hull (`stepGrenade`), not a jump -- so it bursts when the room's does.
 */
describe("LATER 643: another's copy started at the room's age (launchRemote's ageTicks)", () => {
  /** A floor at y 50 (a bouncing material). */
  const floorGrid = (): Grid => {
    const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/p0', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [poly], [{ modelName: 'worldmodel', path: 'worldmodel/p00', first: 0, count: 1 }]);
  };
  const FROM: V3 = [0, 56, 0], VEL: V3 = [60, -30, 0];

  it('a copy told age 30 stands where the flight is 15 game frames on, bounced off the floor on the way, before the page draws a frame', () => {
    const grid = floorGrid(), cast = gridCast(grid, '');
    const ref = launchGrenade([...FROM], [...VEL], M67);
    const frames = Math.round(30 / TICK_HZ / GAME_FRAME_DT);
    expect(frames).toBe(15);
    for (let k = 0; k < frames; k++) stepGrenade(ref, GAME_FRAME_DT, cast);
    expect(ref.bounces).toBeGreaterThanOrEqual(1);                 // the fast-forward meets the hull, as the flight does
    const { g } = thrower({ grid: () => grid });
    g.launchRemote('M67', [...FROM], [...VEL], 2, { pid: 1 }, 30);
    const live = g.stats().live[0]!;
    for (let k = 0; k < 3; k++) expect(live.pos[k]).toBeCloseTo(ref.pos[k]!, 6);
    expect(live.bounces).toBe(ref.bounces);
  });

  it('a copy told age 30 bursts 30 ticks (15 game frames) sooner than one told none, at the same point', () => {
    const grid = floorGrid();
    const burst = (age?: number): { frame: number; pos: V3 } => {
      const { g } = thrower({ grid: () => grid });
      let frame = 0, at: { frame: number; pos: V3 } | null = null;
      g.on('explode', (e) => { at ??= { frame, pos: [...e.pos] as V3 }; });
      g.launchRemote('M67', [...FROM], [...VEL], 2, { pid: 1 }, age);
      for (; frame < 5 * 60 && !at; frame++) g.update(1 / 60);
      if (!at) throw new Error('no burst');
      return at;
    };
    const fresh = burst(), aged = burst(30);
    expect(fresh.frame - aged.frame).toBeGreaterThanOrEqual(29);   // page frames at 60 Hz: 15 game frames = 30.03 ticks
    expect(fresh.frame - aged.frame).toBeLessThanOrEqual(31);
    for (let k = 0; k < 3; k++) expect(aged.pos[k]).toBeCloseTo(fresh.pos[k]!, 6);
  });

  it('no age, or 0: the copy starts at its release, as before', () => {
    const { g } = thrower({ grid: () => floorGrid() });
    g.launchRemote('M67', [...FROM], [...VEL], 2, { pid: 1 }, 0);
    g.launchRemote('M67', [...FROM], [...VEL], 2, { pid: 2 });
    for (const l of g.stats().live) for (let k = 0; k < 3; k++) expect(l.pos[k]).toBe(FROM[k]);
  });
});

describe("PF-28 fix round: the joiner's copy steps as the room's, and its smoke is one (research 231 s2)", () => {
  /** A floor at y 50 (a bouncing material) and, for the rounds, a wall across z = -300. */
  const floorGrid = (): Grid => {
    const poly = (points: number[], i: number): WorldPoly => ({ modelName: 'worldmodel', path: `worldmodel/p${i}`, region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
    const polys = [poly([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000], 0), poly([-2000, 0, -300, 2000, 0, -300, 2000, 400, -300, -2000, 400, -300], 1)];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
  };

  it("a grenade joined after its first bounce damps as the room's copy (no second FIRST_BOUNCE_DAMPING), and a dudded round stays a dud on the joiner's page", () => {
    const grid = floorGrid(), cast = gridCast(grid, '');
    // The room's M67, stepped by game frames to just after its first bounce.
    const ref = launchGrenade([0, 100, 0], [60, 0, 0], M67);
    while (ref.bounces === 0) stepGrenade(ref, GAME_FRAME_DT, cast);
    expect(ref.firstBounce).toBe(false);
    const { g } = thrower({ grid: () => grid });
    g.launchRemote('M67', [...ref.pos], [...ref.vel], 2, { pid: 1, state: 'flight', age: ref.age, fuse: ref.fuse, removal: ref.removal, bounces: ref.bounces, dud: ref.dud });
    const acc = new GameFrameAccumulator();
    for (let i = 0; i < 60; i++) {
      g.update(1 / 60);
      for (let n = acc.advance(1 / 60); n > 0; n--) stepGrenade(ref, GAME_FRAME_DT, cast);
    }
    expect(ref.bounces).toBeGreaterThanOrEqual(2);                 // a later bounce happened in the window
    const live = g.stats().live[0]!;
    expect(live.bounces).toBe(ref.bounces);
    for (let k = 0; k < 3; k++) expect(live.pos[k]).toBeCloseTo(ref.pos[k]!, 6);

    // A launched round that dudded in the room (fuse 9999999, research 94 s4.3): the joiner's copy stays a dud at the wall.
    const frag = { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1, explosionRadius: 150 };
    const r = thrower({ grid: () => grid });
    const heard: string[] = [];
    r.g.on('explode', (e) => heard.push(e.item));
    r.g.setRounds([frag]);
    r.g.launchRemote('M203 FRAG', [0, 70, -150], [0, 0, -270], 2, { pid: 2, state: 'flight', age: 1, fuse: 9999999, removal: 9.1, bounces: 1, dud: true });
    for (let i = 0; i < 180; i++) r.g.update(1 / 60);
    expect(r.g.stats().live[0]!.bounces).toBeGreaterThanOrEqual(2);  // it met the wall 150 on (past the arming 100) and bounced
    expect(heard).toEqual([]);
  });

  it("a rejoin's second welcome with the same AN-M8 pid keeps one smoke; with the effects player the joiner's smoke is the game's animation, played once, not the puffs (JOIN_SMOKE_LOOK_READING)", () => {
    const { g } = thrower();
    const phase = { state: 'detonated' as const, age: 5, fuse: -2, removal: 35 };
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase, age: 6, fuse: -3, removal: 34 });
    expect(g.stats().smokes).toEqual([{ pos: [40, 50, 40], age: 3, until: 37, pid: 9 }]);
    expect(g.stats().live.filter((l) => l.pid === 9)).toHaveLength(1);
    // The page that runs the effects (main.ts's `setEffectPlayer`): the AN-M8's animation, as an observer's explode plays it.
    const e = thrower();
    const played: string[] = [];
    e.g.setEffectPlayer((anim) => { played.push(anim); return true; });
    e.g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 11, ...phase });
    e.g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 11, ...phase, age: 6, fuse: -3, removal: 34 });
    expect(played).toEqual(['smoke_stream']);                     // the stream alone: no canister's burst (fix round 3)
    expect(e.g.stats().smokes).toEqual([]);
    expect(e.g.stats().explosions).toEqual([]);
  });
});

describe('PF-28 fix round 3: the smokes\' pids are this round\'s, and only a hydrate replaces one', () => {
  it("only a joiner's hydrate replaces a smoke by its pid: an ordinary grenade event with the same pid leaves it, and the cleared air (a new round) frees the pids", () => {
    const { g } = thrower();
    const phase = { state: 'detonated' as const, age: 5, fuse: -2, removal: 35 };
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 2, ...phase });
    g.launchRemote('M67', [0, 500, 0], [10, 0, 0], 3, { pid: 2 });         // an event's pid, no phase: not a hydrate
    expect(g.stats().smokes).toHaveLength(1);
    // The round's end clears the air; the smoke pours on (its 37 s outlast the gap), its pid no longer this round's.
    g.clearAir();
    g.launchRemote('AN-M8', [90, 50, 90], [0, 0, 0], 2, { pid: 2, ...phase });   // round N+1's pid 2, a rejoin's
    expect(g.stats().smokes.map((s) => s.pos[0])).toEqual([40, 90]);
  });
});

/**
 * PAR-45 (research 283; a browser adaptation for the replay's seek, `REPLAY_ADAPTATION`): `clearSmokes()` stops every
 * smoke pouring on the page -- the effects player's runs (the door now hands their handles) and the placeholder puffs'
 * sources -- and nothing else. An ordinary match never calls it; `clearAir` still stops nothing that pours (a round's
 * start stops the smokes by `clearRoundEffects`, ROUND_END_EFFECTS_READING, research 283 §9).
 */
describe('PAR-45: clearSmokes() stops the smokes pouring, and only on its call', () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };
  /** A handle as `Effects.run` hands one, recording its stop. */
  const door = () => {
    const handles: (EffectHandle & { anim: string })[] = [];
    const play = (anim: string): EffectHandle => {
      let stopped = false;
      const h = { anim, name: anim, place: { position: [0, 0, 0] as V3 }, alive: () => !stopped, get finished() { return stopped; }, stop: () => { stopped = true; } };
      handles.push(h);
      return h;
    };
    return { handles, play, alive: () => handles.filter((h) => h.alive()).map((h) => h.anim) };
  };
  const phase = { state: 'detonated' as const, age: 5, fuse: -2, removal: 35 };

  it("an observer's smoke: its smoke_grenade run is stopped and the puffs' list is empty", () => {
    const { g } = thrower();
    const d = door();
    g.setEffectPlayer(d.play);
    g.select('AN-M8');
    g.throwNow(0.2);
    run(g, 3.1);
    expect(d.alive()).toEqual(['smoke_grenade']);
    g.clearSmokes();
    expect(d.alive()).toEqual([]);
    expect(g.stats().smokes).toEqual([]);
  });

  it("a joiner's stream (launchRemote's hydrate): stopped; a rejoin after it starts the stream again", () => {
    const { g } = thrower();
    const d = door();
    g.setEffectPlayer(d.play);
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    expect(d.alive()).toEqual(['smoke_stream']);
    g.clearSmokes();
    expect(d.alive()).toEqual([]);
    // The same pid told again with no clearAir between: the stream it would not start twice is stopped, so it starts.
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase, age: 6, fuse: -3, removal: 34 });
    expect(d.alive()).toEqual(['smoke_stream']);
  });

  it('the placeholder (a map without the program): the puffs pouring, an observer\'s and a joiner\'s, are emptied', () => {
    const { g } = thrower();
    g.setEffectPlayer(() => null);
    g.select('AN-M8');
    g.throwNow(0.2);
    run(g, 3.1);
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    expect(g.stats().smokes).toHaveLength(2);
    const sprites = g.stats().effects;
    g.clearSmokes();
    expect(g.stats().smokes).toEqual([]);
    expect(g.stats().effects).toBe(sprites);           // the puffs in the air run out (CLEAR_SMOKES_PUFFS_READING)
    run(g, 1);
    expect(g.stats().smokes).toEqual([]);              // nothing pours again
  });

  it('the control: without clearSmokes the smokes pour on, and clearAir stops none of them (231 s2)', () => {
    const { g } = thrower();
    const d = door();
    g.setEffectPlayer(d.play);
    g.select('AN-M8');
    g.throwNow(0.2);
    run(g, 3.1);
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    const p = thrower();
    p.g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    g.clearAir();
    p.g.clearAir();
    run(g, 2);
    run(p.g, 2);
    expect(d.alive()).toEqual(['smoke_grenade', 'smoke_stream']);
    expect(p.g.stats().smokes).toHaveLength(1);
  });
});

/**
 * ROUND_END_EFFECTS_READING (research 283 §9): a round's end stops the effects playing. The original's online round end
 * (`FUN_002a9b30`, the host D:L150668, a page on game state 4 D:L150626) runs `FUN_002aa910`, which stops every run of
 * the `common` and `mission` zAnim sets (D:L151211-151218, `FUN_0026c2e0` -> `FUN_0026fe90`) and ages every live particle
 * past its life (D:L151219 `FUN_00326fb0`, D:L225080-225082). The page clears its copy at the next `roundStart`
 * (`clearRoundEffects`): the smokes pouring and the placeholder puffs already in the air -- not left to run out.
 */
describe('ROUND_END_EFFECTS_READING: clearRoundEffects() -- a smoke thrown at the round\'s end does not pour into the next', () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };
  const phase = { state: 'detonated' as const, age: 5, fuse: -2, removal: 35 };

  it('the effects player\'s runs stopped, an observer\'s and a joiner\'s', () => {
    const { g } = thrower();
    const handles: { anim: string; stopped: boolean }[] = [];
    g.setEffectPlayer((anim) => {
      const h = { anim, stopped: false };
      handles.push(h);
      return { name: anim, place: { position: [0, 0, 0] as V3 }, alive: () => !h.stopped, get finished() { return h.stopped; }, stop: () => { h.stopped = true; } };
    });
    g.select('AN-M8');
    g.throwNow(0.2);
    run(g, 3.1);
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    expect(handles.filter((h) => !h.stopped).map((h) => h.anim)).toEqual(['smoke_grenade', 'smoke_stream']);
    g.clearAir();
    g.clearRoundEffects();
    expect(handles.filter((h) => !h.stopped)).toEqual([]);
  });

  it('the placeholder (no program): the smokes pouring gone and the puffs already in the air gone with them', () => {
    const { g } = thrower();
    g.setEffectPlayer(() => null);
    g.select('AN-M8');
    g.throwNow(0.2);
    run(g, 4);
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, ...phase });
    run(g, 1);
    expect(g.stats().smokes).toHaveLength(2);
    expect(g.stats().effects).toBeGreaterThan(0);
    g.clearAir();
    g.clearRoundEffects();
    expect(g.stats().smokes).toEqual([]);
    expect(g.stats().effects).toBe(0);                 // FUN_00326fb0: every live particle, not left to run out
    run(g, 2);
    expect(g.stats().smokes).toEqual([]);
    expect(g.stats().effects).toBe(0);                 // nothing pours again
  });
});

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2_ZDB = fixture('RUN/MP2.ZDB');

/**
 * PF-28 fix round 3 (PF.R47: nothing replayed): a joiner's smoke through the REAL effects player on the game's data. The
 * AN-M8's own `smoke_grenade` is the detonation -- sparks, a flash, `!SMK_CANISTER` and a call to `smoke_stream`
 * (research 85 s9.6) -- so a joiner runs `smoke_stream` alone, the two particle sources (research 89 s12): no sound op,
 * no flash, no sparks. An observer's explode still plays the whole of `smoke_grenade`.
 */
describe.skipIf(!MP2_ZDB)(`PF-28 fix round 3: a joiner's smoke on the real effects player${MP2_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('a joiner\'s AN-M8 smoke runs smoke_stream alone on the real Effects: no sound reaches it (no !SMK_CANISTER), no flash, no sparks -- while an observer\'s explode plays smoke_grenade whole', async () => {
    const data = await effectsFromDisc(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP2.ZDB', 'MP2');
    const camera = new PerspectiveCamera();
    camera.position.set(40, 60, 140);
    camera.updateMatrixWorld();
    const rig = () => {
      const heard: string[] = [];
      const fx = new Effects(() => 0.5, (name) => heard.push(name));
      fx.setData(data);
      const base = { ...fx.stats().played };                       // the map's own ambient runs (MP2's firey_flames)
      const ran = (): string[] => Object.entries(fx.stats().played).filter(([k, n]) => n !== (base[k] ?? 0)).map(([k]) => k);
      const { g } = thrower();
      g.setEffectPlayer((anim, at) => fx.play(anim, { position: at.position, normal: at.normal ?? [0, 1, 0], velocity: at.velocity ?? [0, 0, 0] }));
      return { heard, fx, g, ran };
    };
    // The joiner: 2 s into the smoke.
    const j = rig();
    j.g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, state: 'detonated', age: 5, fuse: -2, removal: 35, bounces: 1, dud: false });
    for (let i = 0; i < 3 * 30; i++) j.fx.update(1 / 30, camera);
    expect(j.ran()).toEqual(['smoke_stream']);                   // not smoke_grenade: no burst, no flash, no sparks
    expect(j.heard).toEqual([]);
    expect(j.fx.stats().sounds).toEqual([]);
    expect(j.fx.stats().particles).toBeGreaterThan(0);           // the screen pours
    expect(j.g.stats().smokes).toEqual([]);                      // the game's stream, not the puffs
    // The observer who saw it go off: the detonation's program, its canister's sound with it.
    const o = rig();
    o.fx.play(THROWABLES['AN-M8'].explosionAnim, { position: [40, 50, 40], normal: [0, 1, 0], velocity: [0, 0, 0] });
    for (let i = 0; i < 3 * 30; i++) o.fx.update(1 / 30, camera);
    expect(o.ran()).toContain('smoke_grenade');
    expect(o.heard.length).toBeGreaterThan(0);
  });

  // PAR-45 (research 283): the door hands `Effects.run`'s handle (matchThrow.ts), so clearSmokes reaches the real runs --
  // smoke_grenade and the smoke_stream it called -- and an ordinary match's smoke pours as `Effects.play`'s did.
  it("PAR-45: clearSmokes stops an observer's smoke_grenade and the smoke_stream it called, and a joiner's stream; without it the smoke pours as Effects.play's, run for run, puff for puff", async () => {
    const data = { ...(await effectsFromDisc(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP2.ZDB', 'MP2')), ambient: [] };
    const camera = new PerspectiveCamera();
    camera.position.set(40, 60, 140);
    camera.updateMatrixWorld();
    const rig = (door: 'run' | 'play') => {
      let r = 0.37;
      const fx = new Effects(() => ((r = (r * 9.7 + 0.31) % 1)), () => {});
      fx.setData(data);
      const { g } = thrower();
      const at = (p: { position: V3; normal?: V3 | null; velocity?: V3 | null }) => ({ position: p.position, normal: p.normal ?? [0, 1, 0] as V3, velocity: p.velocity ?? [0, 0, 0] as V3 });
      if (door === 'run') g.setEffectPlayer((anim, p) => fx.run(anim, at(p)));
      else g.setEffectPlayer((anim, p) => fx.play(anim, at(p)));
      const frames = (seconds: number): void => { for (let i = 0; i < seconds * 30; i++) { g.update(1 / 30); fx.update(1 / 30, camera); } };
      return { fx, g, frames };
    };
    // The observer: thrown, gone off at Timer1, pouring 3 s; then the joiner's stream beside it.
    const o = rig('run');
    o.g.select('AN-M8');
    o.g.throwNow(0.2);
    o.frames(6);
    o.g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, state: 'detonated', age: 5, fuse: -2, removal: 35, bounces: 1, dud: false });
    o.frames(1);
    expect(o.fx.stats().played).toMatchObject({ smoke_grenade: 1, smoke_stream: 2 });
    expect(o.fx.stats().sources).toBeGreaterThan(0);
    o.g.clearSmokes();
    o.frames(1 / 30);
    expect(o.fx.stats().runs).toBe(0);                      // no smoke run alive, the called stream's included
    expect(o.fx.stats().sources).toBe(0);
    expect(o.fx.stats().particles).toBeGreaterThan(0);      // the puffs in the air run out (CLEAR_SMOKES_PUFFS_READING)
    const emitted = o.fx.stats().emitted;
    o.frames(2);
    expect(o.fx.stats().emitted).toBe(emitted);             // nothing pours on
    // The control: the same smoke, never cleared, through the handle's door and through play's yes or no.
    const a = rig('run'), b = rig('play');
    for (const x of [a, b]) { x.g.select('AN-M8'); x.g.throwNow(0.2); x.frames(10); x.g.clearAir(); x.frames(5); }
    expect(a.fx.stats().runs).toBeGreaterThan(0);           // clearAir stopped nothing pouring
    expect([a.fx.stats().runs, a.fx.stats().emitted, a.fx.stats().particles]).toEqual([b.fx.stats().runs, b.fx.stats().emitted, b.fx.stats().particles]);
  });

  // ROUND_END_EFFECTS_READING (research 283 §9): the round's clear on the real effects player -- the smoke_grenade, the
  // smoke_stream it called and a joiner's stream stopped, and every puff in the air gone (`FUN_002aa910` D:L151211-151219).
  it('ROUND_END_EFFECTS_READING: a smoke pouring at the round\'s end is gone at the next roundStart -- no run, no source, no puff', async () => {
    const data = { ...(await effectsFromDisc(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP2.ZDB', 'MP2')), ambient: [] };
    const camera = new PerspectiveCamera();
    camera.position.set(40, 60, 140);
    camera.updateMatrixWorld();
    const fx = new Effects(() => 0.5, () => {});
    fx.setData(data);
    const { g } = thrower();
    g.setEffectPlayer((anim, p) => fx.run(anim, { position: p.position, normal: p.normal ?? [0, 1, 0], velocity: p.velocity ?? [0, 0, 0] }));
    const frames = (seconds: number): void => { for (let i = 0; i < seconds * 30; i++) { g.update(1 / 30); fx.update(1 / 30, camera); } };
    g.select('AN-M8');
    g.throwNow(0.2);
    frames(6);
    g.launchRemote('AN-M8', [40, 50, 40], [0, 0, 0], 2, { pid: 9, state: 'detonated', age: 5, fuse: -2, removal: 35, bounces: 1, dud: false });
    frames(1);
    expect(fx.stats().particles).toBeGreaterThan(0);
    g.clearAir();
    g.clearRoundEffects();
    fx.clearRound();
    expect(fx.stats().particles).toBe(0);
    frames(1 / 30);
    expect([fx.stats().runs, fx.stats().sources, fx.stats().particles]).toEqual([0, 0, 0]);
    const emitted = fx.stats().emitted;
    frames(5);
    expect(fx.stats().emitted).toBe(emitted);               // nothing pours into the new round
  });
});

describe('the yellow arc while the throw is held (FUN_005970b0, research 85 §11)', () => {
  /** Holds the trigger `frames` frames of 1/60 s. */
  const hold = (g: GrenadeThrower, frames: number): void => {
    g.pull();
    for (let i = 0; i < frames; i++) g.update(1 / 60);
  };

  it('shows from the press, grows with the power, and is gone at the let-go', () => {
    const { g } = thrower();
    g.select('M67');
    g.update(1 / 60);
    expect(g.stats().arc).toBeNull();                          // up, not held: no arc
    hold(g, 6);
    const early = g.stats().arc!;
    expect(early.visible).toBe(true);
    expect(early.segments).toBe(101);
    expect(early.color).toEqual([...THROW_ARC.color]);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const late = g.stats().arc!;
    expect(Math.hypot(...late.velocity)).toBeGreaterThan(Math.hypot(...early.velocity));
    g.release();
    g.update(1 / 60);                                          // the let-go: the clip starts, the arc goes
    expect(g.stats().phase).toBe('throwing');
    expect(g.stats().arc).toBeNull();
  });

  it('is the throw that follows: without a posed body the toss leaves from the arc\'s point at the arc\'s velocity', () => {
    const { g } = thrower();
    g.select('M67');
    hold(g, 40);
    const arc = g.stats().arc!;
    g.release();
    g.update(1 / 60);
    for (let i = 0; i < 60 && !g.stats().lastThrow; i++) g.update(1 / 60);
    const t = g.stats().lastThrow!;
    expect(t.fromHand).toBe(false);
    t.from.forEach((c, i) => expect(c).toBeCloseTo(arc.from[i]!, 9));
    t.velocity.forEach((c, i) => expect(c).toBeCloseTo(arc.velocity[i]!, 9));
  });

  it('starts from GetThrowAnim\'s table point, as the game\'s does, even with a posed hand', () => {
    const { g } = thrower({ handPoint: () => [104, 69, 199] });
    g.select('M67');
    hold(g, 40);
    const arc = g.stats().arc!;
    expect(worldToActor([100, 50, 200], 90, arc.from).map((v) => Math.round(v * 1e6) / 1e6)).toEqual(THROW_ANIMS.standThrow.offset);
    expect(arc.start).toEqual(arcPoint(arc.from, arc.velocity, -1));
  });

  // NU-2 D7 (research 320 sections 4 and 7): the controller keeps `ctrl+0x11c` through the throw clip and zeroes it only
  // when the release bit is set and `FUN_005a7d10` finds no throw (D:L453483-453489) -- the throw meter holds to the
  // clip's end. Was: the page zeroed it when the hand opened (`letGo`).
  it('NU-2 D7: the power holds from the hand opening to the clip\'s end, then is cleared', () => {
    const { g, events } = thrower();
    g.select('M67');
    g.pull();
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const atRelease = g.stats().power;
    expect(atRelease).toBeGreaterThan(0.5);
    g.release();
    let n = 0;
    while (!events.some((e) => e.startsWith('throw '))) { g.update(1 / 60); if (++n > 600) throw new Error('no throw'); }
    expect(g.stats().phase).toBe('throwing');                  // the hand open, the clip still playing
    let through = 0;
    while (g.stats().phase === 'throwing') {
      expect(g.stats().power).toBe(atRelease);
      g.update(1 / 60);
      through++;
      if (through > 600) throw new Error('the clip never ended');
    }
    expect(through).toBeGreaterThan(1);
    expect(g.stats().power).toBe(0);                            // the clip done: cleared
  });

  it('pale in the night vision (view mode 3), none in the 9x view or a scope (4 and up), none for the claymore', () => {
    let mode = 3;
    const { g } = thrower({ viewState: () => mode });
    g.select('M67');
    hold(g, 10);
    expect(g.stats().arc!.color).toEqual([...THROW_ARC.nightColor]);
    mode = 4;
    g.update(1 / 60);
    expect(g.stats().arc).toBeNull();
    mode = 5;
    g.update(1 / 60);
    expect(g.stats().arc).toBeNull();
    mode = 1;
    g.update(1 / 60);
    expect(g.stats().arc!.color).toEqual([...THROW_ARC.color]);
    const c = thrower().g;
    c.select('Claymore');
    hold(c, 10);
    expect(c.stats().arc).toBeNull();
  });

  it('draws the strip as line segments, each with its alpha, and hides it after the throw', () => {
    const { g } = thrower();
    g.select('M67');
    hold(g, 20);
    const line = g.object.getObjectByName('throwArc') as LineSegments;
    expect(line.visible).toBe(true);
    const pos = line.geometry.getAttribute('position'), col = line.geometry.getAttribute('color');
    expect(pos.count).toBe(202);
    expect(col.itemSize).toBe(4);
    expect(col.getW(0)).toBeCloseTo(0.75 * 0.99 + 0.1 * 0.01, 5);
    expect(col.getW(201)).toBeCloseTo(0.1, 5);
    g.release();
    g.update(1 / 60);
    expect(line.visible).toBe(false);
  });
});

/**
 * PF-04 (ruling PF.R8, research 208; research 179 §9.13 FLIGHT_TICK, 181 §6.4 X4): the projectile steps once per game
 * frame with the frame's dt (`FUN_003c9fb0`'s `param_1`), and the frame is 525/15734 s -- not the port's 60 Hz tick.
 * The page feeds its 60 Hz frames through a `GameFrameAccumulator` and steps the flight at `GAME_FRAME_DT`.
 */
/**
 * PAR-34 group 3 (research 252 s3; ACT.R8): the throwables' timed rules count the frame's real seconds
 * (`GrenadeThrower.update(dt, real)`, handed by `./matchThrow`'s frame). A 5-fps frame is 0.2 s of real time, which the
 * page's clamp hands on as 0.1 s. Converted: the held throw's power (`FUN_00594cf0`'s chase), the flight's game frames
 * (the fuse, as the room steps its copy each room tick, `room.ts` `flyGrenades`), a smoke's life (Timer2 - Timer1), and
 * the C4 settle (`FUN_005be6f0`). The throw's clips (the release, the recovery, a placing) stay on the clamped step:
 * they are the body's clips, and the room counts a throw's repeat on the command clock (`room.ts` `throwGrenade`).
 */
describe('PAR-34 group 3: the throwables\' timed rules in real time at 5 fps (research 252 s3; ACT.R8)', () => {
  const DT = 0.1, REAL = 0.2;

  it("the held throw's power after 1 s held at 5 fps is 1 s of the chase (stepped at most THROW_POWER_STEP_MAX_S at a time), not the clamp's 0.5 s; a stall cannot carry it past 1", () => {
    const { g } = thrower();
    g.select('M67'); g.pull();
    for (let i = 0; i < 5; i++) g.update(DT, REAL);
    expect(g.stats().power).toBeCloseTo(heldPower(1, THROW_POWER_STEP_MAX_S), 12);     // the lane: heldPower(0.5, 0.1)
    const stalled = thrower().g;
    stalled.select('M67'); stalled.pull();
    stalled.update(DT, 1);                                                               // one 1 s frame
    expect(stalled.stats().power).toBeCloseTo(heldPower(1, THROW_POWER_STEP_MAX_S), 12);
    expect(stalled.stats().power).toBeLessThan(1);
    const sixty = thrower().g;                                                           // at or above 10 fps nothing changes
    sixty.select('M67'); sixty.pull();
    for (let i = 0; i < 60; i++) sixty.update(1 / 60, 1 / 60);
    expect(sixty.stats().power).toBeCloseTo(heldPower(1), 12);
  });

  it("a grenade's fuse at 5 fps goes off after Timer1 (3 s) of real time, within a frame, not 6 s: the flight's game frames take the real seconds", () => {
    const { g } = thrower();
    let real = 0, at: number | null = null;
    g.on('explode', () => { at ??= real; });
    g.launchRemote('M67', [0, 500, 0], [0, 0, 0]);
    for (let i = 0; i < 60 && at === null; i++) { real += REAL; g.update(DT, REAL); }
    expect(at).toBeGreaterThanOrEqual(M67.fuse - 1e-9);
    expect(at).toBeLessThanOrEqual(M67.fuse + REAL + 1e-9);                             // the lane: 6 s
  });

  it("an AN-M8's smoke pours for its record's life of real time at 5 fps (removal 40 s from the throw), not 80 s", () => {
    const { g } = thrower();
    let real = 0, poured = false, gone: number | null = null;
    g.launchRemote('AN-M8', [0, 500, 0], [0, 0, 0]);
    for (let i = 0; i < 600 && gone === null; i++) {
      real += REAL; g.update(DT, REAL);
      if (g.stats().smokes.length) poured = true;
      else if (poured) gone = real;
    }
    expect(gone).toBeGreaterThanOrEqual(AN_M8.removal - 1e-9);
    expect(gone).toBeLessThanOrEqual(AN_M8.removal + 2 * REAL + 1e-9);
  });

  it('the C4 settle (FUN_005be6f0, C4_AIM_SETTLE_S) is credited the real seconds', () => {
    const { g } = thrower();
    const tick = vi.spyOn(g as unknown as { c4Tick(dt: number): void }, 'c4Tick');
    g.update(DT, REAL);
    expect(tick).toHaveBeenCalledWith(REAL);
  });
});

describe('the flight at the game frame (PF-04: research 208, 179 §9.13)', () => {
  it('steps once per game frame at GAME_FRAME_DT, not at 60 Hz: one second of 60 Hz page frames is 29 flight steps', () => {
    const { g } = thrower();
    const from: V3 = [0, 500, 0], vel: V3 = [100, 200, 0];
    g.launchRemote('M67', from, vel);
    const ref = launchGrenade(from, vel, M67);
    const acc = new GameFrameAccumulator();
    const nothing = (): [] => [];
    let frames = 0;
    for (let i = 0; i < 60; i++) {
      g.update(1 / 60);
      for (let n = acc.advance(1 / 60); n > 0; n--, frames++) stepGrenade(ref, GAME_FRAME_DT, nothing);
    }
    expect(frames).toBe(29);
    const live = g.stats().live[0]!;
    expect(live.age).toBeCloseTo(29 * GAME_FRAME_DT, 12);
    for (let k = 0; k < 3; k++) expect(live.pos[k]).toBeCloseTo(ref.pos[k]!, 9);
    // Symplectic Euler sits g t dt / 2 under the parabola: at the game frame, twice the 60 Hz figure (179 §9.13).
    const t = live.age;
    const parabola = from[1] + vel[1] * t - (98 * t * t) / 2;
    expect(parabola - live.pos[1]).toBeCloseTo((98 * t * GAME_FRAME_DT) / 2, 6);
    expect(parabola - live.pos[1]).toBeGreaterThan(1.9 * (98 * t * (1 / 60)) / 2);
  });
});

/**
 * PF-07a (research 202 §2.6 item 20 and its V5 §7.2; research 206 §1.1 overrides C3/V1): a hand grenade's model turns
 * by the projectile's own tumble -- `FUN_003c9530`'s angles, built by `FUN_00307360` into the node's turn -- the page's
 * throw and another player's alike, in place of the random-axis spin.
 */
describe('the tumble drawn (PF-07a: research 202 §2.6, 206 §1.1)', () => {
  it('a thrown and a remote hand grenade are drawn turned by tumbleQuaternion of their own angles', () => {
    const { g } = thrower();
    const template = new Group();
    template.name = 'tumble-model';
    g.setMap({ [M67.model]: template }, null);
    g.select('M67');
    expect(g.throwNow(1)).not.toBeNull();
    g.launchRemote('M67', [0, 500, 0], [300, 0, 0]);
    const acc = new GameFrameAccumulator();
    for (let i = 0; i < 20; i++) { g.update(1 / 60); acc.advance(1 / 60); }
    // MISSION R8 draws the flight a game frame behind, between the last two (`drawLive`): on a frame's boundary the
    // drawn position and turn are exactly the frame before's, its own angles.
    const live = g.stats().live.filter((l) => l.state === 'flight');
    g.update(GAME_FRAME_DT - acc.remainder);
    expect(live).toHaveLength(2);
    for (const l of live) {
      expect(l.tumble.some((a) => a > 0)).toBe(true);                          // it has turned: 10 frames of free steps
      const drawn = g.object.children.find((o) => o.name === 'tumble-model' && o.position.distanceTo({ x: l.pos[0], y: l.pos[1], z: l.pos[2] } as never) < 1e-9);
      expect(drawn).toBeDefined();
      const q = tumbleQuaternion(l.tumble);
      expect([drawn!.quaternion.x, drawn!.quaternion.y, drawn!.quaternion.z, drawn!.quaternion.w].map((v, k) => Math.abs(v - q[k]!) < 1e-6)).toEqual([true, true, true, true]);
    }
  });
});

describe('M4: a launcher\'s round in flight on the page (research 94 §C4.3)', () => {
  /** A floor at y 50 and a wall across z at `wallZ`, x -2000..2000. */
  const range = (wallZ: number): Grid => {
    const poly = (points: number[], i: number): WorldPoly => ({ modelName: 'worldmodel', path: `worldmodel/p${i}`, region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
    const polys = [poly([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000], 0), poly([-2000, 0, wallZ, 2000, 0, wallZ, 2000, 400, wallZ, -2000, 400, wallZ], 1)];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
  };
  /** `zweapon.rdr`'s M203 FRAG as `throwableRecord` reads it: 270 u/s, arming 100 u, impact, a 10 s self-destruct. */
  const frag = { ...M67, name: 'M203 FRAG', id: 175, muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1, explosionRadius: 150 };

  it.each([
    // the wall's z, whether it goes off on the wall, a dud first
    [-300, true, false],      // past the arming distance: it goes off where it hits (FUN_003c8920)
    [-60, false, true],       // inside 100 u: a dud -- half speed, the fuse at 9999999, a bounce (L319439-319462)
  ] as const)('fired at a wall %i units off: explodes on it %s, a dud %s', (wallZ, onWall, dud) => {
    const grid = range(wallZ);
    const { g } = thrower({ grid: () => grid });
    const booms: { pos: V3; item: string }[] = [];
    g.on('explode', (e) => booms.push({ pos: e.pos, item: e.item }));
    g.launchRound(frag, [0, 150, 0], [0, 0, -270]);
    expect(g.stats().live).toHaveLength(1);
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    if (onWall) {
      expect(booms).toHaveLength(1);
      expect(booms[0]!.item).toBe('M203 FRAG');
      expect(booms[0]!.pos[2]).toBeCloseTo(wallZ, 3);
    } else expect(booms).toHaveLength(0);
    // A dud's fuse is 9999999: it lies there and never goes off by impact.
    expect(g.stats().live[0]!.fuse > 1000).toBe(dud);
  });

  it('another player\'s round is flown by its name, once the kit tables\' rounds are known', () => {
    const { g } = thrower({ grid: () => range(-300) });
    g.launchRemote('M203 FRAG', [0, 70, 0], [0, 0, -270]);
    expect(g.stats().live).toHaveLength(0);
    g.setRounds([frag]);
    g.launchRemote('M203 FRAG', [0, 70, 0], [0, 0, -270]);
    expect(g.stats().live).toHaveLength(1);
    expect(g.stats().live[0]!.vel).toEqual([0, 0, -270]);
  });

  /**
   * A round's start is a fresh level (research 95 §8 ROUND_START_PROJECTILES_READING; the room's `startRound`): what is
   * in the air or lies set down -- the page's own and the others' copies -- goes, and never goes off in the new round.
   */
  it('clearAir: a remote round in flight is gone at a round\'s start and never explodes', () => {
    const { g } = thrower({ grid: () => range(-300) });
    g.setRounds([frag]);
    const booms: string[] = [];
    g.on('explode', (e) => booms.push(e.item));
    g.launchRemote('M203 FRAG', [0, 70, 0], [0, 0, -270]);
    expect(g.stats().live).toHaveLength(1);
    g.clearAir();
    expect(g.stats().live).toHaveLength(0);
    for (let i = 0; i < 600; i++) g.update(1 / 60);
    expect(booms).toEqual([]);
  });
});

describe('XR-06: the world bomb (research 214 s3; BOMB_MODEL_READING)', () => {
  it("draws FLIB's Satchel where the bomb lies, unturned (FUN_0059dab0 D:L457497-457500: FUN_0031fd10(\"Satchel\") -> FUN_00317d90 at the point, rotation 0), never C4's placed model; hidden when taken away", () => {
    const { g } = thrower();
    const satchel = new Group(), c4 = new Group();
    satchel.name = 'Satchel';
    c4.name = 'c4';
    g.setMap({ c4, Satchel: satchel }, null);
    const bomb = g.worldBomb();
    bomb.place([1279.762, 47.334, 1446.111]);
    const drawn = g.object.children.filter((o) => o.name === 'Satchel' || o.name === 'c4');
    expect(drawn.map((o) => o.name)).toEqual(['Satchel']);
    expect(drawn[0]!.position.toArray()).toEqual([1279.762, 47.334, 1446.111]);
    expect([drawn[0]!.rotation.x, drawn[0]!.rotation.y, drawn[0]!.rotation.z]).toEqual([0, 0, 0]);
    expect(drawn[0]!.visible).toBe(true);
    bomb.place(null);
    expect(drawn[0]!.visible).toBe(false);
    // A map whose fittings lack the Satchel draws no bomb (no stand-in).
    const { g: bare } = thrower();
    bare.setMap({ c4 }, null);
    bare.worldBomb().place([0, 0, 0]);
    expect(bare.object.children.filter((o) => o.name === 'c4')).toEqual([]);
  });
});

/**
 * PAR-41 (RE-5's dev read, `./devSeen`): the world bomb's drawn model as the development instrument reads it, through
 * `GrenadeThrower.worldBombForDev` -- a copy (shown, where), never the model itself. A browser adaptation: no original.
 */
describe('PAR-41: the world bomb as the dev read sees it (GrenadeThrower.worldBombForDev)', () => {
  it('none before its first placing; then whether shown and where, as worldBomb placed it; none again on a new map', () => {
    const { g } = thrower();
    expect(g.worldBombForDev()).toBeNull();
    const satchel = new Group();
    satchel.name = 'Satchel';
    g.setMap({ Satchel: satchel }, null);
    expect(g.worldBombForDev()).toBeNull();
    g.worldBomb().place([1279.762, 47.334, 1446.111]);
    expect(g.worldBombForDev()).toEqual({ visible: true, pos: [1279.762, 47.334, 1446.111] });
    g.worldBomb().place(null);
    expect(g.worldBombForDev()).toEqual({ visible: false, pos: [1279.762, 47.334, 1446.111] });
    g.setMap({ Satchel: satchel }, null);                           // XR-06: the last map's bomb taken away
    expect(g.worldBombForDev()).toBeNull();
  });

  it('a copy: writing the read moves and hides nothing drawn', () => {
    const { g } = thrower();
    const satchel = new Group();
    satchel.name = 'Satchel';
    g.setMap({ Satchel: satchel }, null);
    g.worldBomb().place([1, 2, 3]);
    const read = g.worldBombForDev()!;
    read.pos[0] = 99;
    read.visible = false;
    expect(g.worldBombForDev()).toEqual({ visible: true, pos: [1, 2, 3] });
    const drawn = g.object.children.find((o) => o.name === 'Satchel')!;
    expect(drawn.position.toArray()).toEqual([1, 2, 3]);
    expect(drawn.visible).toBe(true);
  });
});

/**
 * PAR-20 (research 256): the explosives' commit rules as the original's. D10 (s1): `FUN_005be9a0`'s hand-grenade branch
 * refuses a release whose power is under the dynamics block's `+0x198` (`FUN_002ce1a0` D:L171508: 0x3e19999a) before any
 * throw is pushed (D:L475497-475498): `FUN_00592d40` zeroes the power (D:L451964) and nothing is spent (the count falls
 * at hand-open, `FUN_005c1970` D:L477039-477042).
 */
describe('PAR-20 D10: the release under the threshold is refused before the commit (research 256 s1)', () => {
  const f32bits = (v: number): number => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v); return d.getUint32(0); };
  const f32of = (bits: number): number => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, bits); return d.getFloat32(0); };

  it("the threshold is FUN_002ce1a0's float32 0x3e19999a: a power of exactly it clears, the next float32 under it does not (FUN_005be9a0 D:L475497)", () => {
    expect(f32bits(THROW_ABORT_POWER)).toBe(0x3e19999a);
    expect(releasePowerClears(THROW_ABORT_POWER)).toBe(true);
    expect(releasePowerClears(0.15)).toBe(true);                          // .15 is stored as that float32: no less than it
    expect(releasePowerClears(f32of(0x3e199999))).toBe(false);            // the float32 just under it
    expect(releasePowerClears(f32of(0x3e19999b))).toBe(true);
    // The port model's digital taps at 60 Hz (research 230 s2.2): 0, 1, 3 ticks under it; 4 ticks over it.
    for (const [ticks, clears] of [[0, false], [1, false], [3, false], [4, true]] as const) expect(releasePowerClears(1 - 0.95 ** ticks)).toBe(clears);
  });

  it('a tap under the threshold starts no throw and spends nothing: no throwStart, no throw, the grenade still up, the power zeroed; the next hold throws', () => {
    for (const ticks of [0, 1, 3]) {
      const { g, events } = thrower();
      const starts: string[] = [];
      g.on('throwStart', (e) => starts.push(e.anim.clip));
      g.select('M67');
      const left = g.stats().leftByItem;
      g.pull();
      for (let i = 0; i < ticks; i++) g.update(1 / 60);
      g.release();
      for (let i = 0; i < 120; i++) g.update(1 / 60);
      expect(starts, `${ticks} ticks`).toEqual([]);
      expect(events.filter((e) => e.startsWith('throw '))).toEqual([]);
      expect(g.stats().leftByItem).toEqual(left);
      expect(g.stats()).toMatchObject({ phase: 'ready', equipped: true, held: 'M67', power: 0, thrown: 0 });
      g.pull();
      for (let i = 0; i < 4; i++) g.update(1 / 60);
      g.release();
      for (let i = 0; i < 120; i++) g.update(1 / 60);
      expect(starts).toHaveLength(1);
      expect(g.stats().leftByItem.M67).toBe(left.M67! - 1);
    }
  });

  it('a release with no throw for the state (a prone peek, a lean with no lean clip) is refused as a short tap is: the power zeroed (FUN_005499e0 D:L414008-414012 -> FUN_005be9a0 D:L475497-475498, research 256 s5)', () => {
    for (const body of [{ peek: -1, leanClip: true, stance: 'prone' }, { peek: 1 }] as Partial<PlaySnapshot>[]) {
      const { g } = thrower({ snapshot: () => snap(body) });
      g.select('M67');
      const left = g.stats().leftByItem;
      g.pull();
      for (let i = 0; i < 40; i++) g.update(1 / 60);
      expect(g.stats().power).toBeGreaterThan(THROW_ABORT_POWER);
      g.release();
      g.update(1 / 60);
      expect(g.stats().leftByItem).toEqual(left);
      expect(g.stats(), JSON.stringify(body)).toMatchObject({ phase: 'ready', equipped: true, held: 'M67', power: 0, thrown: 0 });
    }
  });

  it("the hook's throw obeys it too: throwNow(0) is refused and spends nothing; four ticks' hold throws", () => {
    const { g } = thrower();
    g.select('M67');
    const left = g.stats().left;
    expect(g.throwNow(0)).toBeNull();
    expect(g.stats().left).toBe(left);
    expect(g.phase()).toBe('ready');
    expect(g.throwNow(4 / 60)).not.toBeNull();
    expect(g.stats().left).toBe(left - 1);
  });
});

/**
 * PAR-20 D11 (research 256 s2): the hand-open (`FUN_005c1970`) reads the body as it is then -- the aim's sine
 * `+0x1450` through `asinf`, clamped to 0..55 degrees, plus the power's elevation (D:L477105-477109), the stance's
 * range (`+0x174`: stand's `+0x19c`, any other's `+0x1a0`, D:L477069-477075) and the hand (`+0x300`, the left lean's
 * `+0x2f8`, D:L477060-477067) -- while the clip stays the release request's (`GetThrowAnim` at `FUN_005be9a0`).
 */
describe('PAR-20 D11: the hand-open reads the body as it is then (research 256 s2)', () => {
  /** A throw held `ticks` with the body `at` the release, turned to `then` before the hand opens. */
  function late(at: Partial<PlaySnapshot>, then: Partial<PlaySnapshot>, ticks = 40): { started: ThrowAnim[]; thrown: ThrowInfo[]; power: number } {
    let now = snap(at);
    const { g } = thrower({ snapshot: () => now });
    const started: ThrowAnim[] = [], thrown: ThrowInfo[] = [];
    g.on('throwStart', (e) => started.push(e.anim));
    g.on('throw', (t) => thrown.push(t));
    g.select('M67');
    g.pull();
    for (let i = 0; i < ticks; i++) g.update(1 / 60);
    const power = g.stats().power;
    g.release();
    g.update(1 / 60);
    expect(g.phase()).toBe('throwing');
    expect(thrown).toEqual([]);                                   // the hand not open yet
    now = snap({ ...at, ...then });
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(thrown).toHaveLength(1);
    return { started, thrown, power };
  }

  it("the aim is the elevation when the hand opens: 0 at the release, 45 at the hand-open launches at 45 degrees plus the power's 10..12; the clip stays the release's (D:L477105-477109)", () => {
    const t = late({ pitch: 0 }, { pitch: 45 });
    expect(t.started.map((a) => a.clip)).toEqual(['seal_throwgrenade']);
    expect(t.thrown[0]!.anim).toBe(THROW_ANIMS.standThrow);
    expect(t.thrown[0]!.aimSin).toBeCloseTo(Math.sin(Math.PI / 4), 12);
    expect(t.thrown[0]!.launch.pitch).toBeCloseTo(Math.PI / 4 + throwElevation(t.power), 12);
    // A light throw aimed low at the release is GetThrowAnim's toss (power < .6, sine < .3); raised before the hand
    // opens, it is still the toss, launched at the raised aim.
    const toss = late({ pitch: 0 }, { pitch: 45 }, 6);
    expect(toss.started.map((a) => a.clip)).toEqual(['seal_tossgrenade']);
    expect(toss.thrown[0]!.anim).toBe(THROW_ANIMS.standToss);
    expect(toss.thrown[0]!.launch.pitch).toBeCloseTo(Math.PI / 4 + throwElevation(toss.power), 12);
  });

  it('the current aim is clamped as the release clamps it: over 55 degrees is 55, under 0 is 0 (FUN_00539b70, 0x65e630/0x65e638, D:L477107)', () => {
    const high = late({ pitch: 0 }, { pitch: 70 });
    expect(high.thrown[0]!.launch.pitch).toBeCloseTo(THROW_AIM_CLAMP[1] + throwElevation(high.power), 12);
    const low = late({ pitch: 20 }, { pitch: -30 });
    expect(low.thrown[0]!.launch.pitch).toBeCloseTo(THROW_AIM_CLAMP[0] + throwElevation(low.power), 12);
  });

  it("the range is the stance's when the hand opens: standing 600, else 300, the hand point the clip's (D:L477069-477075)", () => {
    const up = late({ stance: 'crouch', crouched: true }, { stance: 'stand', crouched: false });
    expect(up.thrown[0]!.anim).toBe(THROW_ANIMS.crouchThrow);
    expect(up.thrown[0]!.launch.maxSpeed).toBeCloseTo(maxThrowSpeed(600, THROW_ANIMS.crouchThrow.offset[1]).speed, 9);
    expect(up.thrown[0]!.stance).toBe('stand');
    const down = late({}, { stance: 'crouch', crouched: true });
    expect(down.thrown[0]!.anim).toBe(THROW_ANIMS.standThrow);
    expect(down.thrown[0]!.launch.maxSpeed).toBeCloseTo(maxThrowSpeed(300, THROW_ANIMS.standThrow.offset[1]).speed, 9);
    expect(down.thrown[0]!.stance).toBe('crouch');
  });
});

/**
 * PAR-20 D09 (research 256 s3): C4's `Put on wall` arms the kit's timer at 99 s (D:L475447-475451) and hangs a callback on
 * the clip at phase .45 (`LAB_005bfe40`, D:L475443-475445) that zeroes it -- the normal plant 1.098 s in. A forced pop of
 * the clip (the knock, D:L440992-440998 -> D:L446515 -> `FUN_0028da00` D:L135092-135104) removes the callback without
 * running it, so the normal deadline cannot place the charge. Only that is the original's rule here: what the 99 s
 * timer comes to is `C4_FALLBACK_PLACEHOLDER` (the owner's row), held below as the port's interim for an in-game end
 * (a knock or `replaced`), not as parity. Two browser-only exits cancel at once, unspent
 * (`C4_PLANT_LEAVE_CANCEL_ADAPTATION`): no snapshot, and the hold gone with no end heard.
 */
describe('PAR-20 D09: a C4 placing whose callback was removed is not committed at the normal deadline (research 256 s3)', () => {
  const DI = 'worldmodel/access1=access1/good_parts/di_good';
  const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
  const grid = (): Grid => {
    const f: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
    };
    const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], [f, wall], [
      { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
    ]);
  };
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  /** A planter whose body shows the placing's hold until `pop()` (a knock) or `leave()` takes it off, or until `away()` leaves the walk. */
  function planter(item: 'C4' | 'Claymore') {
    const map = grid();
    let hold: string | null = null;
    let here = true;
    const g = new GrenadeThrower({
      grid: () => map,
      snapshot: () => here ? snap({ yaw: 0, ...(hold ? { hold: hold as never, holdSerial: 1 } : {}) }) : null,
      view: () => 'third',
      handPoint: () => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }),
    });
    const placed: string[] = [];
    g.on('place', (e) => placed.push(e.item));
    g.on('throwStart', (e) => { hold = e.hold; });
    if (item === 'C4') {
      g.setRecords([C4]);
      g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
      g.setKit(['M67', 'AN-M8', 'C4']);
      run(g, 0.3);                                                  // the reticle settles on the target (0.2 s)
      expect(g.plantC4()).toBe(true);
    } else {
      g.select('Claymore');
      g.pull();
    }
    expect(hold).not.toBeNull();
    return {
      g, placed,
      /** A knock: the hold comes off and the thrower is told when it can be (`C4_FALLBACK_PLACEHOLDER`). */
      pop: () => { g.noteHoldEnd?.('knock'); hold = null; },
      /** The plant hold vanishes with no end heard (the debug re-place). */
      leave: () => { hold = null; },
      /** The walk's snapshot is gone (fly, or the page left the walk). */
      away: () => { here = false; },
    };
  }

  it('an online C4 with a server id does not explode at fuse expiry; it explodes on the frame after detonateRemote', () => {
    const map = grid();
    const g = new GrenadeThrower({
      grid: () => map, snapshot: () => snap({ yaw: 0 }), view: () => 'third', handPoint: () => [102, 62, 192],
      aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), online: () => true,
    });
    g.setRecords([C4]);
    g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
    g.setKit(['M67', 'AN-M8', 'C4']);
    const booms: number[] = [];
    g.on('explode', () => booms.push(g.stats().live.length));
    run(g, 0.3);
    expect(g.plantC4()).toBe(true);
    run(g, C4_PLANT_SECONDS + 0.1);
    const own = g.stats().live[0]!;
    g.tagOwn('C4', own.pos, 5);
    // The remote charge is already inside its last fraction of Timer1. Half a second more passes both fuses
    // and stays inside the one-second grace, so neither copy goes off on its own.
    run(g, C4.fuse - 0.25);
    g.launchRemote('C4', [130, 80, 200], [0, 0, 1], 2, { pid: 8, state: 'rest', fuse: 0.2 });
    run(g, 0.5);
    expect(booms).toEqual([]);
    expect(g.stats().live.map((l) => l.state)).toEqual(['rest', 'rest']);
    expect(g.stats().live.every((l) => l.fuse > 0 && l.fuse <= GAME_FRAME_DT * 2)).toBe(true);
    g.detonateRemote(5);
    expect(booms).toEqual([]);
    g.update(GAME_FRAME_DT);
    expect(booms).toHaveLength(1);
    expect(g.stats().live.map((l) => l.pid)).toEqual([8]);
    g.detonateRemote(8);
    expect(booms).toHaveLength(1);
    g.update(GAME_FRAME_DT);
    expect(booms).toHaveLength(2);
    // The own charge's removal had already run out, so that frame dropped it. The remote copy was hydrated
    // without a removal clock, so it stays, detonated, until one is set.
    expect(g.stats().live.map((l) => [l.pid, l.state])).toEqual([[8, 'detonated']]);
  });

  it('an online C4 with no detonate still explodes about a second after its fuse; one with no server id does not wait', () => {
    const map = grid();
    const make = (): GrenadeThrower => {
      const g = new GrenadeThrower({
        grid: () => map, snapshot: () => snap({ yaw: 0 }), view: () => 'third', handPoint: () => [102, 62, 192],
        aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), online: () => true,
      });
      g.setRecords([C4]);
      g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
      g.setKit(['M67', 'AN-M8', 'C4']);
      return g;
    };
    const held = make();
    const late: string[] = [];
    held.on('explode', (e) => late.push(e.item));
    run(held, 0.3);
    expect(held.plantC4()).toBe(true);
    run(held, C4_PLANT_SECONDS + 0.1);
    held.tagOwn('C4', held.stats().live[0]!.pos, 5);
    run(held, C4.fuse + 0.2);
    expect(late).toEqual([]);
    run(held, 1.2);
    expect(late).toEqual(['C4']);
    const local = make();
    const soon: string[] = [];
    local.on('explode', (e) => soon.push(e.item));
    run(local, 0.3);
    expect(local.plantC4()).toBe(true);
    run(local, C4_PLANT_SECONDS + C4.fuse + 0.3);
    expect(soon).toEqual(['C4']);
  });

  it('an online C4 with a room tick holds through 59 ticks past the fuse and goes off at 60', () => {
    const map = grid();
    let tick = 0;
    const g = new GrenadeThrower({
      grid: () => map, snapshot: () => snap({ yaw: 0 }), view: () => 'third', handPoint: () => [102, 62, 192],
      aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), online: () => true, simTick: () => tick,
    });
    g.setRecords([C4]);
    g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
    g.setKit(['M67', 'AN-M8', 'C4']);
    const late: string[] = [];
    g.on('explode', (e) => late.push(e.item));
    run(g, 0.3);
    expect(g.plantC4()).toBe(true);
    run(g, C4_PLANT_SECONDS + 0.1);
    g.tagOwn('C4', g.stats().live[0]!.pos, 5);
    run(g, C4.fuse + 0.2);
    expect(late).toEqual([]);
    const grace = C4_SERVER_DETONATE_GRACE_S_ADAPTATION * TICK_HZ;
    expect(grace).toBe(60);
    tick = grace - 1;
    for (let i = 0; i < 12; i++) g.update(1 / 60);
    expect(late).toEqual([]);
    tick = grace;
    for (let i = 0; i < 20 && late.length === 0; i++) g.update(1 / 60);
    expect(late).toEqual(['C4']);
  });

  it('C4 fuse readout starts only at placement, follows the live fuse through weapon changes, and clears on explosion/reset', () => {
    const { g } = planter('C4');
    expect(g.c4Fuse()).toBeNull();
    const start: number[] = [];
    g.on('place', () => start.push(g.c4Fuse()!.fill));
    run(g, C4_PLANT_SECONDS + 0.1);
    expect(start).toEqual([1]);
    run(g, 3);
    expect(g.c4Fuse()!.fill).toBeCloseTo(g.stats().live[0]!.fuse / C4.fuse, 10);
    expect(g.c4Fuse()!.fill).toBeLessThan(0.5);
    g.select('rifle');
    expect(g.c4Fuse()).not.toBeNull();
    run(g, 3);
    expect(g.c4Fuse()).toBeNull();
    const reset = planter('C4').g;
    run(reset, C4_PLANT_SECONDS + 0.1);
    reset.clearAir();
    expect(reset.c4Fuse()).toBeNull();
    reset.launchRemote('C4', [130, 62, 200], [0, 0, 1], 2);
    expect(reset.c4Fuse()).toBeNull();
    const mine = planter('Claymore').g;
    run(mine, 2);
    expect(mine.c4Fuse()).toBeNull();
  });

  it('C4 readout selects the soonest own fuse, then the remaining charge, never a remote charge', () => {
    const { g } = planter('C4');
    run(g, C4_PLANT_SECONDS + 2);
    expect(g.plantC4()).toBe(true);
    run(g, C4_PLANT_SECONDS + 0.1);
    const own = g.stats().live.map(l => l.fuse).sort((a, b) => a - b);
    expect(own).toHaveLength(2);
    expect(g.c4Fuse()!.fill).toBeCloseTo(own[0]! / C4.fuse, 10);
    g.launchRemote('C4', [130, 62, 200], [0, 0, 1], 2, { pid: 99, fuse: 0.5, state: 'rest' });
    expect(g.c4Fuse()!.fill).toBeCloseTo(own[0]! / C4.fuse, 10);
    run(g, own[0]! + 0.1);
    expect(g.c4Fuse()).not.toBeNull();
    expect(g.c4Fuse()!.fill).toBeLessThan(0.6);
    g.clearAir();
    expect(g.c4Fuse()).toBeNull();
  });

  it('the plant hold vanishing with no end heard cancels at once: no charge later, the firearm back, nothing spent', () => {
    const p = planter('C4');
    const left = p.g.stats().leftByItem.C4;
    run(p.g, 0.2);                                               // the body has shown the hold
    p.leave();
    p.g.update(1 / 60);
    expect(p.placed).toEqual([]);
    expect(p.g.stats()).toMatchObject({ placing: false, phase: 'holstered', equipped: false });
    expect(p.g.equipped()).toBe(false);
    expect(p.g.stats().leftByItem.C4).toBe(left);
    expect(p.g.select('rifle')).toBe(true);
    run(p.g, C4_KIT_TIMER_SECONDS);
    expect(p.placed).toEqual([]);
    expect(p.g.stats().leftByItem.C4).toBe(left);
    expect(p.g.stats().placing).toBe(false);
  });

  it('leaving the walk during a C4 plant cancels it at once, and the 99 s timer does not plant later', () => {
    const p = planter('C4');
    const left = p.g.stats().leftByItem.C4;
    run(p.g, 0.2);
    p.away();
    p.g.update(1 / 60);
    expect(p.placed).toEqual([]);
    expect(p.g.stats()).toMatchObject({ placing: false, phase: 'holstered', equipped: false });
    expect(p.g.stats().leftByItem.C4).toBe(left);
    expect(p.g.select('rifle')).toBe(true);
    run(p.g, 2);
    expect(p.placed).toEqual([]);
  });

  it('a replaced end keeps the 99 s interim; a silent re-place cancels; a knock keeps the timer; the stick still plants', () => {
    const map = grid();
    const still = { forward: 0, right: 0, boost: false };
    const make = () => {
      const w = new Walker(map);
      expect(w.place(100, 60, 200)).toBe(true);
      for (let i = 0; i < 30; i++) w.tick(still);
      const g = new GrenadeThrower({
        grid: () => map, snapshot: () => moverSnapshot(w, null, 0, 0), view: () => 'third',
        handPoint: () => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }),
      });
      g.setRecords([C4]);
      g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
      g.setKit(['M67', 'AN-M8', 'C4']);
      const placed: string[] = [];
      g.on('place', (e) => placed.push(e.item));
      g.on('throwStart', (e) => { expect(w.hold(e.hold)).toBe(true); });
      w.onActionEnd((e) => { if (throwPoseEnds(e)) g.noteHoldEnd?.(e.reason); });
      const step = (cmd = still) => { w.tick(cmd); g.update(1 / 60); };
      for (let i = 0; i < 20; i++) step();
      expect(g.plantC4()).toBe(true);
      for (let i = 0; i < 12; i++) step();
      return { w, g, placed, step };
    };
    const risen = make();
    const risenAmmo = risen.g.stats().leftByItem.C4;
    risen.w.setAirborne(true);                                          // in-game `replaced`: the interim, not a cancel
    risen.g.update(1 / 60);
    expect(risen.placed).toEqual([]);
    expect(risen.g.stats()).toMatchObject({ placing: true, phase: 'throwing' });
    expect(risen.g.select('rifle')).toBe(false);
    for (let i = 0; i < Math.ceil(C4_PLANT_SECONDS * 60) + 8; i++) risen.g.update(1 / 60);
    expect(risen.placed).toEqual([]);
    expect(risen.g.stats().leftByItem.C4).toBe(risenAmmo);
    expect(risen.g.stats().placing).toBe(true);
    const moved = make();
    const movedAmmo = moved.g.stats().leftByItem.C4;
    expect(moved.w.place(101, 60, 200)).toBe(true);                      // debug re-place: the hold goes, no end is heard
    moved.g.update(1 / 60);
    expect(moved.placed).toEqual([]);
    expect(moved.g.stats()).toMatchObject({ placing: false, phase: 'holstered', equipped: false });
    expect(moved.g.stats().leftByItem.C4).toBe(movedAmmo);
    expect(moved.g.select('rifle')).toBe(true);
    for (let i = 0; i < 90; i++) moved.g.update(1 / 60);
    expect(moved.placed).toEqual([]);
    const knocked = make();
    knocked.w.knock([0, 15, -5], 'fallBackwards');
    knocked.g.update(1 / 60);
    expect(knocked.placed).toEqual([]);
    expect(knocked.g.stats()).toMatchObject({ placing: true, phase: 'throwing' });
    const walked = make();
    const frames = Math.ceil(C4_PLANT_SECONDS * 60) + 2;
    for (let i = 0; i < frames; i++) walked.step({ forward: 1, right: 0, boost: false });
    expect(walked.placed).toEqual(['C4']);
  });

  it("a knock before the callback's phase: no charge at the normal deadline, nothing spent (D:L475443-475451, D:L135092-135104)", () => {
    const p = planter('C4');
    const left = p.g.stats().leftByItem.C4;
    run(p.g, 0.1);
    p.pop();
    run(p.g, C4_PLANT_SECONDS + 1);
    expect(p.placed).toEqual([]);
    expect(p.g.stats().leftByItem.C4).toBe(left);
  });

  /**
   * LATER 122 (`FUN_005c1970` D:L476938-476940): the clip's callback -- and the kit timer's 99 s fallback, which runs the
   * same block (D:L476883-476905) -- gives up on exactly three things: the saved object gone, refusing the charge, or
   * moved since the save (`C4_TARGET_MOVED_READING`). Nothing is spent then. It asks neither reach, nor the reticle,
   * nor the line: the charge goes to the saved point (D:L476979-476985), and the room judges the start's eye (LATER 144).
   * The body shows the placing's hold (as `planter`), so a knock (`pop`) hands the plant to the 99 s fallback.
   */
  function commitPlant() {
    const map = grid();
    const state = { accept: true, gone: false, far: [400, 62, 200] as V3, feet: [100, 50, 200] as V3 };
    let hold: string | null = null;
    const g = new GrenadeThrower({
      grid: () => map, snapshot: () => snap({ yaw: 0, feet: state.feet, ...(hold ? { hold: hold as never, holdSerial: 1 } : {}) }),
      view: () => 'third', handPoint: () => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: state.far }),
    });
    g.setRecords([C4]);
    g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (!state.gone && state.accept && path === DI && damage >= 17 ? 0 : null) } }));
    g.setKit(['M67', 'AN-M8', 'C4']);
    const placed: { item: string; pos: V3 }[] = [];
    g.on('place', (e) => placed.push({ item: e.item, pos: [...e.pos] }));
    g.on('throwStart', (e) => { hold = e.hold; });
    run(g, 0.3);
    expect(g.plantC4()).toBe(true);
    // The pane struck at the plant's start: the wall at x 130 (the saved point [130, 62, 200]).
    const pane = aimPick(map, [100, 62, 200], [400, 62, 200])!.poly;
    return {
      g, placed, state, left: g.stats().leftByItem.C4!,
      /** The struck pane moved in its own plane (z + 5): the reticle, the reach and the eye's line all still meet it. */
      slide: () => { for (let k = 2; k < pane.points.length; k += 3) pane.points[k] = pane.points[k]! + 5; },
      /** A knock: the hold comes off with an in-game end heard (`C4_FALLBACK_PLACEHOLDER`, the 99 s kit timer). */
      pop: () => { g.noteHoldEnd?.('knock'); hold = null; },
    };
  }
  const refused = (p: ReturnType<typeof commitPlant>, seconds = C4_PLANT_SECONDS + 0.2): void => {
    run(p.g, seconds);
    expect(p.placed).toEqual([]);
    expect(p.g.stats().leftByItem.C4).toBe(p.left);
    expect(p.g.stats().live).toEqual([]);
    expect(p.g.stats().placing).toBe(false);
    expect(p.g.c4Fuse()).toBeNull();
  };
  const plantedAtSave = (p: ReturnType<typeof commitPlant>, seconds = C4_PLANT_SECONDS + 0.2): void => {
    run(p.g, seconds);
    expect(p.placed).toEqual([{ item: 'C4', pos: [130, 62, 200] }]);
    expect(p.g.stats().leftByItem.C4).toBe(p.left - 1);
    expect(p.g.stats().live.map((l) => l.pos)).toEqual([[130, 62, 200]]);
  };

  it('LATER 122: a target that stops taking the charge, or is gone, mid-clip plants nothing; the C4 is kept', () => {
    const refusing = commitPlant();
    run(refusing.g, 0.5);
    refusing.state.accept = false;
    refused(refusing);
    const gone = commitPlant();
    run(gone.g, 0.5);
    gone.state.gone = true;
    refused(gone);
  });

  it('LATER 122: the struck pane moved mid-clip (slid in its own plane) plants nothing (C4_TARGET_MOVED_READING)', () => {
    expect(C4_TARGET_MOVED_READING).toBe('struck-polygon');
    const p = commitPlant();
    run(p.g, 0.5);
    p.slide();
    refused(p);
  });

  it('LATER 122: the camera turned off the node, or the feet out of reach, mid-clip still plants at the saved point', () => {
    const looked = commitPlant();
    run(looked.g, 0.5);
    looked.state.far = [100, 200, 200];
    plantedAtSave(looked);
    const walked = commitPlant();
    run(walked.g, 0.5);
    walked.state.feet = [60, 50, 200];
    plantedAtSave(walked);
  });

  it('LATER 122: the 99 s fallback asks the same three -- walked away and looking off, it plants at the saved point; the target gone, nothing', () => {
    const away = commitPlant();
    run(away.g, 0.1);
    away.pop();
    run(away.g, C4_PLANT_SECONDS + 1);
    expect(away.placed).toEqual([]);                                  // the callback cut: the kit timer runs on
    away.state.feet = [-400, 50, 200];
    away.state.far = [100, 200, 200];
    plantedAtSave(away, C4_KIT_TIMER_SECONDS);
    const gone = commitPlant();
    run(gone.g, 0.1);
    gone.pop();
    run(gone.g, C4_PLANT_SECONDS + 1);
    gone.state.gone = true;
    refused(gone, C4_KIT_TIMER_SECONDS);
  });

  it("the controls: uncut, C4 is down at the callback's 1.098 s; a claymore's 1.3 s placing timer has no callback and a pop does not stop it", () => {
    const uncut = planter('C4');
    run(uncut.g, C4_PLANT_SECONDS - 1 / 60);
    expect(uncut.placed).toEqual([]);
    run(uncut.g, 2 / 60);
    expect(uncut.placed).toEqual(['C4']);
    const late = planter('C4');                                     // a pop after the callback ran changes nothing
    run(late.g, C4_PLANT_SECONDS + 1 / 60);
    late.pop();
    expect(late.placed).toEqual(['C4']);
    const claymore = planter('Claymore');
    run(claymore.g, 0.1);
    claymore.pop();
    run(claymore.g, CLAYMORE_RULES.placeSeconds);
    expect(claymore.placed).toEqual(['Claymore']);
  });

  it("C4_FALLBACK_PLACEHOLDER (the port's interim, not parity): the kit's 99 s timer runs on and its end runs the commit's checks", () => {
    expect(C4_KIT_TIMER_SECONDS).toBe(99);                           // 0x42c60000 at +0x87c, D:L475448-475451
    expect(C4_FALLBACK_PLACEHOLDER).toBe('kitTimer');
    const p = planter('C4');
    run(p.g, 0.1);
    p.pop();
    run(p.g, C4_PLANT_SECONDS + 1);
    expect(p.g.stats()).toMatchObject({ placing: true, phase: 'throwing' });   // the kit still busy: the interim's
    run(p.g, C4_KIT_TIMER_SECONDS - 0.2 - (C4_PLANT_SECONDS + 1));
    expect(p.placed).toEqual([]);
    run(p.g, 0.2);
    expect(p.placed).toEqual(['C4']);
    expect(p.g.stats().placing).toBe(false);
  });
});

/**
 * PAR-20 D12 (research 256 s5): the release request's clearance (`FUN_005499e0` D:L413977-414063, asked by `FUN_005be9a0`
 * D:L475493-475497 before anything is committed): a segment in the actor frame from `GetThrowAnim`'s hand point (its z
 * forward of the feet taken back to 0, D:L414020-414052) to a point by the body's state -- standing a toss's or a throw's,
 * crouched one, prone a toss's or a throw's (D:L414022-414049) -- through the actor's matrix (D:L414053-414054) and the
 * world's segment query (`FUN_0031e250` D:L414055): a hit refuses the throw. Any other state -- the lean, 3 -- returns 1
 * before the query (D:L414037-414039): never refused by it.
 */
describe('PAR-20 D12: the stance-specific clearance before the commit (research 256 s5)', () => {
  const f32 = (bits: number): number => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, bits); return d.getFloat32(0); };
  const close = (a: readonly number[], b: readonly number[]): void => { for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k]!, 5); };
  /**
   * A floor at y 50 and, when `wallZ` is given, a wall across z there, x 0..200, y 50..100 -- wound so its normal is +z
   * (facing a thrower at z 200 throwing toward -z), or, `back`, wound the other way (LATER 250: its normal -z, so the
   * throw's segment enters it from behind).
   */
  const world = (wallZ?: number, back = false): Grid => {
    const poly = (points: number[], i: number, ditype = 3): WorldPoly => ({ modelName: 'worldmodel', path: `worldmodel/c${i}`, region: 0, ditype, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
    const polys = [poly([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000], 0)];
    if (wallZ !== undefined) {
      polys.push(poly(back ? [0, 100, wallZ, 200, 100, wallZ, 200, 50, wallZ, 0, 50, wallZ] : [0, 50, wallZ, 200, 50, wallZ, 200, 100, wallZ, 0, 100, wallZ], 1, 2));
    }
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
  };
  const at = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => snap({ yaw: 0, ...over });

  it("the five end points are FUN_005499e0's float32 words, in the actor frame (D:L414004-414006, D:L414025-414047)", () => {
    expect(THROW_CLEARANCE_ENDS.standToss).toEqual([f32(0x405d4092), f32(0x414744f2), f32(0xc1200000)]);
    expect(THROW_CLEARANCE_ENDS.standThrow).toEqual([f32(0x3f93dffc), f32(0x4155abbf), f32(0xc17c0000)]);
    expect(THROW_CLEARANCE_ENDS.crouch).toEqual([f32(0x3f6ca633), f32(0x412a1a13), f32(0xc141999a)]);
    expect(THROW_CLEARANCE_ENDS.proneToss).toEqual([f32(0x3fe8e697), f32(0x40b290cf), f32(0xc129999a)]);
    expect(THROW_CLEARANCE_ENDS.proneThrow).toEqual([f32(0x3f18110a), f32(0x411150d9), f32(0xc0d80000)]);
    expect(THROW_CLEARANCE_QUERY_PLACEHOLDER).toBe('movement surfaces, every gated owner');
  });

  it("the exact segment: from GetThrowAnim's hand point (z forward of the feet taken to 0) to the state's end point, turned by the yaw; the lean has none", () => {
    const feet: V3 = [100, 50, 200];
    // Standing, power .9 aimed level: the throw (hand 3.34, 19.35, 3.91 -- behind, kept) to (1.155, 13.354, -15.75).
    let seg = throwClearanceSegment(at(), 0.9, 0)!;
    close(seg.from, [feet[0] + 3.343816, feet[1] + 19.34775, feet[2] + 3.913763]);
    close(seg.to, [feet[0] + 1.1552730, feet[1] + 13.354430, feet[2] - 15.75]);
    // Standing, power .3 aimed level: the toss (hand 3.13, 13.8, -10.5: forward, so z 0) to (3.457, 12.454, -10).
    seg = throwClearanceSegment(at(), 0.3, 0)!;
    close(seg.from, [feet[0] + 3.13, feet[1] + 13.8, feet[2]]);
    close(seg.to, [feet[0] + 3.4570661, feet[1] + 12.454332, feet[2] - 10]);
    // Crouched still: the crouch throw's hand; crouched moving: the standing throw's hand, the crouch's end point both.
    seg = throwClearanceSegment(at({ stance: 'crouch', crouched: true }), 0.9, 0)!;
    close(seg.from, [feet[0] + 6.05, feet[1] + 15.59, feet[2] + 1.96]);
    close(seg.to, [feet[0] + 0.9244110, feet[1] + 10.631366, feet[2] - 12.1]);
    seg = throwClearanceSegment(at({ stance: 'crouch', crouched: true, vx: 20 }), 0.9, 0)!;
    close(seg.from, [feet[0] + 3.343816, feet[1] + 19.34775, feet[2] + 3.913763]);
    close(seg.to, [feet[0] + 0.9244110, feet[1] + 10.631366, feet[2] - 12.1]);
    // Prone: the throw and the toss (hand -0.97 and -8.53 forward: z 0).
    seg = throwClearanceSegment(at({ stance: 'prone' }), 0.9, 0)!;
    close(seg.from, [feet[0] + 6.29, feet[1] + 15.05, feet[2]]);
    close(seg.to, [feet[0] + 0.5940100, feet[1] + 9.0822382, feet[2] - 6.75]);
    seg = throwClearanceSegment(at({ stance: 'prone' }), 0.3, 0)!;
    close(seg.from, [feet[0] + 2.39, feet[1] + 7.87, feet[2]]);
    close(seg.to, [feet[0] + 1.8195370, feet[1] + 5.5801768, feet[2] - 10.6]);
    // Turned: yaw 90 takes the actor's -z to the world's -x.
    seg = throwClearanceSegment(at({ yaw: 90 }), 0.9, 0)!;
    close(seg.to, [feet[0] - 15.75, feet[1] + 13.354430, feet[2] - 1.1552730]);
    // The lean (state 3): no segment, FUN_005499e0 returns 1 before the query.
    expect(throwClearanceSegment(at({ peek: 1, leanClip: true }), 0.9, 0)).toBeNull();
    expect(throwClearanceSegment(at({ peek: -1, leanClip: true, stance: 'crouch', crouched: true }), 0.3, 0)).toBeNull();
  });

  // LATER 250 (research 281 §4.3; reading, pending review): the clearance asks the hull's one-sided test -- a face counts
  // only entered from its front (`FUN_002d2890` side mode 0x20 for a hull collider, D:L174831-174837, D:L215827-215828).
  it('LATER 250: the same wall wound the other way -- the segment entering it from behind -- does not refuse the throw; wound to face the thrower, it does', () => {
    expect(throwClear(world(190, true), at(), 0.9, 0)).toBe(true);           // a back entry: no hit, the throw goes
    expect(throwClear(world(190), at(), 0.9, 0)).toBe(false);                // a front entry: refused, as before
  });

  it("a wall across the standing throw's segment refuses it before the commit, nothing spent; the same wall clears the prone throw (whose end stops short) and the lean (no query)", () => {
    const wall = world(190);
    expect(throwClear(wall, at(), 0.9, 0)).toBe(false);
    expect(throwClear(world(), at(), 0.9, 0)).toBe(true);
    expect(throwClear(world(180), at(), 0.9, 0)).toBe(true);                       // past the end point (z 184.25)
    expect(throwClear(wall, at({ stance: 'prone' }), 0.9, 0)).toBe(true);          // the prone end is z 193.25
    expect(throwClear(wall, at({ peek: 1, leanClip: true }), 0.9, 0)).toBe(true);  // the lean's early return
    expect(throwClear(null, at(), 0.9, 0)).toBe(true);                             // no hull loaded: nothing to hit
    // Through the thrower: refused like a short tap (FUN_00592d40), no clip, no hold, nothing spent; the lean throws.
    let now = at();
    const { g, events } = thrower({ grid: () => wall, snapshot: () => now });
    const starts: string[] = [];
    g.on('throwStart', (e) => starts.push(e.anim.clip));
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(starts).toEqual([]);
    expect(events.filter((e) => e.startsWith('throw '))).toEqual([]);
    expect(g.stats()).toMatchObject({ phase: 'ready', equipped: true, power: 0, left });
    now = at({ peek: 1, leanClip: true });
    g.pull();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(starts).toEqual(['seal_toss_rlean']);
    expect(g.stats().left).toBe(left - 1);
  });
});

/**
 * PAR-20 D12 on the disc's hull (research 256 s5, "Measured at Frostfire's spawn A"): standing at A (feet 796, 100,
 * 614, as `e2e/grenade.spec.ts` and `e2e/fire.spec.ts` stand) facing yaw 90 (-x) at `init_aim_pitch`, a second's hold
 * is the standing throw, and its clearance segment -- from the hand's table point, behind the feet, to the end point
 * 15.75 ahead -- crosses `container_blue01`'s side 12 units west of A (the face `fire.test.ts` shoots): a vertical
 * METAL_THICK movement surface of a static world node, which no variant of `FUN_002d2890`'s surface filter drops (bit 1
 * set; bits 18 and 19 clear; the material not VOLUMETRIC, D:L174845-174864). So the release request refuses it, as
 * `FUN_005499e0` reads (D:L414053-414061) under `THROW_CLEARANCE_QUERY_PLACEHOLDER`. Yaws 210 and 240, the spec's
 * throws, are clear.
 */
describe.skipIf(!MP2_ZDB)(`PAR-20 D12 on Frostfire's hull: the container west of spawn A refuses the standing throw${MP2_ZDB ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const SPAWN_A: [number, number, number] = [796, 100, 614];
  const REST_PITCH = -9.167;                            // `dynamics.rdr`'s `init_aim_pitch`, the spec's
  const FULL = heldPower(1);                            // the hook's `throwGrenade(1)`: a second's hold
  let hull: Grid | undefined;
  const grid = async (): Promise<Grid> => (hull ??= groundGrid((await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP2.ZDB')).ground!));
  const at = (yaw: number): PlaySnapshot => snap({ feet: SPAWN_A, yaw, pitch: REST_PITCH });
  const near = (a: readonly number[], b: readonly number[], digits = 3): void => { for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k]!, digits); };

  it("yaw 90: the standing throw's segment meets container_blue01's side 12 units west of A -- a movement surface of a static world node -- and the clearance refuses", async () => {
    const g = await grid();
    const s = at(90), aimSin = releaseAimSin(s);
    expect(FULL).toBeCloseTo(1 - 0.95 ** 60, 9);
    const seg = throwClearanceSegment(s, FULL, aimSin)!;
    // The throw (not the toss): hand (3.344, 19.348, 3.914) behind the feet, kept; end (1.155, 13.354, -15.75), both
    // turned by yaw 90 (the actor's -z is the world's -x, its +x the world's -z).
    near(seg.from, [799.913763, 119.34775, 610.656184]);
    near(seg.to, [780.25, 113.354430, 612.844727]);
    const hits = segmentHits(g, seg.from, seg.to, (p) => (surfaceWord(p) & (SURFACE_SIDE | SURFACE_SKIP)) === SURFACE_SIDE);
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit!.owner.path).toBe('worldmodel/container_blue01=container_blue01/climb');
    expect(hit!.owner.sweep).toBeUndefined();                                     // a static node, not a door's leaf
    expect(hit!.t).toBeCloseTo(0.79466, 4);                                       // 16.43 of the segment's 20.67
    near(hit!.point, [784.288, 114.585, 612.395]);
    // The side: vertical (its normal 10 degrees off +x), y 100..130 -- the segment crosses it at 114.6, the floor never.
    expect(hit!.normal[1]).toBe(0);
    expect(hit!.normal[0]).toBeCloseTo(Math.cos(Math.PI / 18), 6);
    const ys = [...hit!.poly.points].filter((_, i) => i % 3 === 1);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([100, 130]);
    // Every variant of the surface filter keeps it: bit 1 set, bits 18 and 19 clear, METAL_THICK not VOLUMETRIC.
    expect(surfaceWord(hit!.poly) & (SURFACE_SIDE | SURFACE_SKIP | CAMERA_SKIP)).toBe(SURFACE_SIDE);
    expect(surfaceMaterial(hit!.poly.material, 'METAL_THICK')).toMatchObject({ name: 'METAL_THICK', volumetric: false, liquid: false });
    expect(throwClear(g, s, FULL, aimSin)).toBe(false);
  }, 60_000);

  it("yaws 210 and 240 (the spec's throws from A) are clear; yaw 90's lean asks no query", async () => {
    const g = await grid();
    for (const yaw of [210, 240]) expect(throwClear(g, at(yaw), FULL, releaseAimSin(at(yaw)))).toBe(true);
    expect(throwClear(g, snap({ feet: SPAWN_A, yaw: 90, pitch: REST_PITCH, peek: 1, leanClip: true }), FULL, releaseAimSin(at(90)))).toBe(true);
  }, 60_000);

  it("through the thrower, as the hook's throwGrenade(1) asks it: at yaw 90 refused -- nothing thrown, nothing spent, the grenade still up, the power zeroed; at yaw 210 thrown", async () => {
    const hullGrid = await grid();
    let now = at(90);
    const { g, events } = thrower({ grid: () => hullGrid, snapshot: () => now });
    expect(g.select('M67')).toBe(true);
    const left = g.stats().left;
    expect(g.throwNow(1)).toBeNull();
    expect(events.filter((e) => e.startsWith('throw '))).toEqual([]);
    expect(g.stats()).toMatchObject({ phase: 'ready', equipped: true, power: 0, left, thrown: 0, lastThrow: null });
    now = at(210);
    expect(g.throwNow(1)).not.toBeNull();
    expect(g.stats().left).toBe(left - 1);
  }, 60_000);
});

/**
 * PAR-46 / PAR-46a (research 283 s8): a throw drawn by a page that is not walking -- a spectator, a dead player watching,
 * the replay's viewer, the map viewer's fly mode -- flew over no hull. `GrenadeThrower.hull()` reads `source.grid()`,
 * which the page wires to `walk.grid()` (null off the walk), so a page that never walked had no cast and the flight
 * passed through the world. The room flies every throw over the map's grid with its `DefaultMaterial` (`room.ts`
 * `hullCast()`; research 276 s6): the page's drawn flight is the same whether or not its own player walks. The map's
 * grid is a second read of the source (`hullGrid`, PAR-46a; the part wires it to `walk.gridOfGround()`), which `hull()`
 * prefers; the control holds the walking page's flight unchanged.
 */
describe('PAR-46: a throw drawn off the walk flies over the map\'s hull', () => {
  /** A floor at y 50 and a wall across z = -300, x -2000..2000 (the PF-28 fix round's ground). */
  const mapGrid = (): Grid => {
    const poly = (points: number[], i: number): WorldPoly => ({ modelName: 'worldmodel', path: `worldmodel/p${i}`, region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
    const polys = [poly([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000], 0), poly([-2000, 0, -300, 2000, 0, -300, 2000, 400, -300, -2000, 400, -300], 1)];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
    return buildGrid(params, [], [], polys, polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 })));
  };
  /** The room's flight of the same throw (`stepGrenade` over the map's grid, `DefaultMaterial` '' as the page's here). */
  const roomFlight = (grid: Grid, from: V3, vel: V3, seconds: number): ReturnType<typeof launchGrenade> => {
    const ref = launchGrenade(from, [vel[0] / M67.muzzleVelocity, vel[1] / M67.muzzleVelocity, vel[2] / M67.muzzleVelocity], M67);
    const cast = gridCast(grid, ''), acc = new GameFrameAccumulator();
    for (let i = 0; i < seconds * 60; i++) for (let n = acc.advance(1 / 60); n > 0; n--) stepGrenade(ref, GAME_FRAME_DT, cast);
    return ref;
  };
  /** Another player's M67 thrown at the wall from 100 u in front of it, drawn for `seconds` on a page with `source`. */
  const drawn = (source: Partial<GrenadeSource>, seconds: number): { live: ReturnType<GrenadeThrower['stats']>['live']; bounces: V3[] } => {
    const { g } = thrower(source);
    const bounces: V3[] = [];
    g.on('bounce', (b) => bounces.push([...b.pos]));
    g.launchRemote('M67', [0, 100, -200], [0, 0, -300], 2);
    for (let i = 0; i < seconds * 60; i++) g.update(1 / 60);
    return { live: g.stats().live, bounces };
  };
  const FROM: V3 = [0, 100, -200], VEL: V3 = [0, 0, -300], SECONDS = 1.5;

  it('control: on a walking page (its source\'s grid the map\'s) the throw bounces off the wall as the room\'s flight does', () => {
    const grid = mapGrid();
    const ref = roomFlight(grid, FROM, VEL, SECONDS);
    expect(ref.bounces).toBeGreaterThanOrEqual(1);
    expect(ref.pos[2]).toBeGreaterThan(-300);                        // the room's copy never passes the wall
    const walking = drawn({ grid: () => grid }, SECONDS);
    expect(walking.bounces.some((p) => Math.abs(p[2] + 300) < 1e-3)).toBe(true);
    expect(walking.live[0]!.bounces).toBe(ref.bounces);
    for (let k = 0; k < 3; k++) expect(walking.live[0]!.pos[k]).toBeCloseTo(ref.pos[k]!, 6);
  });

  it('on a page that is not walking (no walking grid, the map\'s grid held) the throw bounces off the wall as the room\'s flight does', () => {
    const grid = mapGrid();
    const ref = roomFlight(grid, FROM, VEL, SECONDS);
    // The page's source as PAR-46a wires it off the walk: `grid()` null (`walk.grid()`), the map's grid held apart.
    const offWalk = { grid: (): Grid | null => null, hullGrid: (): Grid | null => grid };
    const watching = drawn(offWalk, SECONDS);
    expect(watching.bounces.some((p) => Math.abs(p[2] + 300) < 1e-3)).toBe(true);
    expect(watching.live[0]!.bounces).toBe(ref.bounces);
    for (let k = 0; k < 3; k++) expect(watching.live[0]!.pos[k]).toBeCloseTo(ref.pos[k]!, 6);
  });
});

/**
 * NU-1b B6 (research 313 sections 5 and 8.1, re-filed by NU-1b's read; research 251 section 12.8's PAR-86, the air's
 * case; `CLIMB_THROW_REFUSED_READING`): the controller chases the throw's power and asks its release only while
 * `FUN_0059d830` answers (`FUN_00594cf0` D:L453478-453480), which asks `FUN_005a7de0(actor, 1, 1)` (D:L457365) -- the
 * climb's bare `NoFire` refuses. So under a climb the wind-up is held, its power frozen, and no release is asked; at the
 * climb's end the chase runs and a button let go asks the release at once. A release asked on the frame the climb is
 * pushed (the driver's, after the controller's update) meets the request's own refusal (D:L475491-475498): nothing
 * spent, the power zeroed. #96 (deferred by the owner, H162): a claymore's placing mid-climb is unchanged.
 */
describe('NU-1b B6: a grenade under a climb (research 313 section 5)', () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  const crate = { clip: 'seal_climbcrate', frame: 5, loop: false, rootY: null };
  function rig() {
    const body = { climb: false };
    const starts: number[] = [];
    const { g, events } = thrower({ snapshot: () => snap({ traversal: body.climb ? crate : null }) });
    g.on('throwStart', ({ power }) => starts.push(power));
    expect(g.select('M67')).toBe(true);
    return { g, events, body, starts };
  }

  it('held through the climb: the power frozen, no throw while it plays; let go under it, thrown at the climb\'s end at the frozen power', () => {
    const { g, events, body, starts } = rig();
    const left = g.stats().leftByItem.M67 ?? 0;
    g.pull();
    run(g, 0.3);
    body.climb = true;
    run(g, 1 / 60);                                          // the climb's first update: the last update's floor, chased
    const frozen = g.stats().power;
    run(g, 0.3);
    expect(g.stats().power).toBe(frozen);                    // RED before B6: chased on
    g.release();
    run(g, 0.5);
    expect(starts).toEqual([]);                              // RED before B6: thrown mid-climb
    expect(g.phase()).toBe('holding');
    expect(g.stats().leftByItem.M67).toBe(left);
    body.climb = false;
    run(g, 2 / 60);                                          // the end's update reads the last (the climb's), then the chase
    expect(starts).toEqual([frozen]);
    run(g, 2);
    expect(events.filter((e) => e.startsWith('throw '))).toHaveLength(1);
    expect(g.stats().leftByItem.M67).toBe(left - 1);
    expect(CLIMB_THROW_REFUSED_READING).toBe('held');
  });

  it('a release asked on the climb\'s first update is refused as a short tap: nothing spent, the power zeroed, the grenade still up', () => {
    const { g, events, body, starts } = rig();
    const left = g.stats().leftByItem.M67;
    g.pull();
    run(g, 0.5);
    g.release();
    body.climb = true;                                       // the climb pushed on the frame the release is asked
    run(g, 1 / 60);
    expect(starts).toEqual([]);                              // RED before B6: the throw's clip started
    expect(g.phase()).toBe('ready');
    expect(g.stats().power).toBe(0);
    run(g, 1);
    expect(events.filter((e) => e.startsWith('throw '))).toEqual([]);
    expect(g.stats().leftByItem.M67).toBe(left);
  });

  it('#96 fenced: a claymore\'s placing mid-climb starts as it did (no FUN_0059d830 on the placing\'s path, D:L475305-475340)', () => {
    const grid = claymoreFloorNu1b();
    const body = { climb: true };
    const clips: string[] = [];
    const { g } = thrower({ grid: () => grid, snapshot: () => snap({ feet: [100, 50, 200], yaw: 0, traversal: body.climb ? crate : null }), handPoint: () => [102, 62, 192] });
    g.on('throwStart', ({ anim }) => clips.push(anim.clip));
    g.select('Claymore');
    g.pull();
    expect(clips).toEqual(['seal_place_claymore']);
    expect(g.stats().placing).toBe(true);
  });
});

/**
 * P36 (TB-12; research 256 section 6, `FUN_0059d830`'s other refusals; research 251 section 12.8): `FUN_0059d830` asks
 * `FUN_005a7de0(actor, 1, 1)` (D:L457365) -- the playing clip's `NoFire` through its phase test, whatever the clip, the
 * frame's `fire` the room's `takeThrowStart` refuses as 'nofire'. The page asks the walk's `fireAllowed` (the same
 * `./net/fireCapability`), so the chase stands under any `NoFire` top (`FUN_00594cf0` D:L453478-453480) and a release
 * asked on the frame the clip is pushed is refused as a short tap (D:L475491-475498): no `throwStart`, no clip, nothing
 * spent. The climb (NU-1b B6) is one instance. Reading, pending review.
 */
describe('P36: a grenade under the playing clip\'s NoFire (research 256 section 6)', () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  function rig() {
    const body = { noFire: false };
    const starts: number[] = [];
    const { g, events } = thrower({ fireAllowed: () => !body.noFire } as Partial<GrenadeSource>);
    g.on('throwStart', ({ power }) => starts.push(power));
    expect(g.select('M67')).toBe(true);
    return { g, events, body, starts };
  }

  it('a release asked on the frame a NoFire clip is pushed is refused as a short tap: no throwStart, nothing spent', () => {
    const { g, events, body, starts } = rig();
    const left = g.stats().leftByItem.M67;
    g.pull();
    run(g, 0.5);
    g.release();
    body.noFire = true;                                      // a stance change's clip pushed on the release's frame
    run(g, 1 / 60);
    expect(starts).toEqual([]);                              // RED before P36: the throw's clip started
    expect(g.phase()).toBe('ready');
    expect(g.stats().power).toBe(0);
    expect(g.diag().lastRefusal?.reason).toBe('nofire');
    run(g, 1);
    expect(events.filter((e) => e.startsWith('throw '))).toEqual([]);
    expect(g.stats().leftByItem.M67).toBe(left);
    body.noFire = false;                                     // the clip over: the same press and release are taken
    g.pull();
    run(g, 0.5);
    g.release();
    run(g, 1 / 60);
    expect(starts).toHaveLength(1);
    run(g, 2);
    expect(g.stats().leftByItem.M67).toBe(left! - 1);
  });

  it('held through the clip: the power frozen, no throw while it plays; let go under it, thrown at its end at the frozen power', () => {
    const { g, events, body, starts } = rig();
    const left = g.stats().leftByItem.M67 ?? 0;
    g.pull();
    run(g, 0.3);
    body.noFire = true;
    run(g, 1 / 60);                                          // the clip's first update: the last update's motion, chased
    const frozen = g.stats().power;
    run(g, 0.3);
    expect(g.stats().power).toBe(frozen);                    // RED before P36: chased on
    g.release();
    run(g, 0.5);
    expect(starts).toEqual([]);                              // RED before P36: thrown under the clip
    expect(g.phase()).toBe('holding');
    expect(g.stats().leftByItem.M67).toBe(left);
    body.noFire = false;
    run(g, 2 / 60);                                          // the end's update reads the last (the clip's), then the chase
    expect(starts).toEqual([frozen]);
    run(g, 2);
    expect(events.filter((e) => e.startsWith('throw '))).toHaveLength(1);
    expect(g.stats().leftByItem.M67).toBe(left - 1);
  });

  it('no hook (a source without the walk): open, as before', () => {
    const { g } = thrower();
    const starts: number[] = [];
    g.on('throwStart', ({ power }) => starts.push(power));
    g.select('M67');
    g.pull();
    run(g, 0.5);
    g.release();
    run(g, 1 / 60);
    expect(starts).toHaveLength(1);
  });
});

/** A flat floor at 50 under the claymore's hand (the NU-1b fence's). */
function claymoreFloorNu1b(): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: 0, originZ: 0 };
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([0, 50, 0, 400, 50, 0, 400, 50, 400, 0, 50, 400]),
  };
  return buildGrid(params, [], [], [poly], [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }]);
}

/**
 * M203-FIRE-SOUND (issue #285; research 94 §C4.5): another's launched round, the room's live `grenade` of it, is told
 * (`remoteLaunch`) so the page hears its report and its round's zAnim as the copy's release plays them (`FUN_005c5340`
 * D:L479449-479450, `FUN_003caf60` D:L320608-320613); a joiner's catch-up of the same round (a hydrate) is not.
 */
describe('M203-FIRE-SOUND: another\'s launched round told once, live only (research 94 §C4.5)', () => {
  it('a live round emits remoteLaunch with its id, zAnim, origin and owner; a hydrate and a throwable emit none', () => {
    const he = { ...M67, name: 'M203 HE', id: 171, fireAnim: 'm203he_start', muzzleVelocity: 270, armingDistance: 100, impact: true, fuse: 10, removal: 10.1 };
    const { g } = thrower();
    g.setRounds([he]);
    const told: unknown[] = [];
    g.on('remoteLaunch', (e) => told.push(e));
    g.launchRemote('M203 HE', [1, 2, 3], [0, 0, -270], 7, { pid: 11 });
    expect(told).toEqual([{ item: 'M203 HE', id: 171, fireAnim: 'm203he_start', from: [1, 2, 3], owner: 7 }]);
    g.launchRemote('M203 HE', [4, 5, 6], [0, 0, -270], 7, { pid: 12, state: 'flight', age: 0.5, fuse: 9.5, removal: 9.6, bounces: 0, dud: false });
    g.launchRemote('M67', [4, 5, 6], [0, 0, -10], 7, { pid: 13 });
    expect(told).toHaveLength(1);
    expect(g.stats().live).toHaveLength(3);                                // all three flown
  });
});

/**
 * A1, branch B (LATER 239, 217, 218, 243; research 215 s8.6 "A1"): the turret's take on the hand's throw. The take pops
 * the body's stack (`FUN_0058c350` D:L447983-447988) and its take-up zeroes the controller's power (`FUN_00592d40`
 * D:L478915), so a wind-up held, or a throw asked and its hand not yet open, throws nothing and spends nothing (`left` is
 * spent only when the hand opens); a grenade already out flies on.
 */
describe('A1: the turret\'s take cancels a held or unreleased throw (GrenadeThrower.mountTake)', () => {
  it('a wind-up held: ready, the power 0, the item kept, nothing thrown after it', () => {
    const { g, events } = thrower();
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    expect([g.phase(), g.stats().power > 0]).toEqual(['holding', true]);
    g.mountTake();
    expect([g.phase(), g.stats().power, g.stats().left]).toEqual(['ready', 0, left]);
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toEqual([]);
    expect([g.phase(), g.stats().left, g.stats().live]).toEqual(['ready', left, []]);
  });

  it('a throw asked, its hand not yet open: nothing thrown, the item kept', () => {
    const { g, events } = thrower();
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    g.update(1 / 60);
    expect(g.phase()).toBe('throwing');
    expect(events.filter((e) => e.startsWith('throw'))).toEqual([]);   // the hand not open yet
    g.mountTake();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toEqual([]);
    expect([g.phase(), g.stats().power, g.stats().left, g.stats().live]).toEqual(['ready', 0, left, []]);
  });

  it('the hand already open (the control): the grenade flies on, spent', () => {
    const { g, events } = thrower();
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    for (let i = 0; i < 120 && !events.some((e) => e.startsWith('throw')); i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toHaveLength(1);
    g.mountTake();
    g.update(1 / 60);
    expect([g.stats().left, g.stats().live.length]).toEqual([left - 1, 1]);
  });
});

/**
 * LATER 526 (research 215 s8.6 "A1"; PTW.R3 with `room.ts` `takeMount`): the room refused the take this page made at send
 * time -- `FUN_005463c0` refuses before any of its take's steps (D:L412131-412166), so the take-up's power 0 (`FUN_00592d40`
 * D:L478915) never ran there and the throw stands. The cancel is kept (`mountTake`) and handed back (`mountUntake`): the
 * wind-up at the power it had, or the throw asked with its hand still to open; the button as it is now (`held`), since a
 * let-go during the wait went to the turret's trigger.
 */
describe("LATER 526: a refused take hands the held throw back (GrenadeThrower.mountUntake)", () => {
  type Untakes = { mountUntake?(held: boolean): void };
  it('RED: LATER 526 (step 2) -- a wind-up held at the take, refused with the button still held: holding at its power, a let-go throws once', () => {
    const { g, events } = thrower();
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const power = g.stats().power;
    g.mountTake();
    for (let i = 0; i < 12; i++) g.update(1 / 60);                // the wait: the room's word not yet here
    expect(g.phase()).toBe('ready');
    (g as unknown as Untakes).mountUntake?.(true);
    expect([g.phase(), g.stats().power], 'the wind-up as the take found it').toEqual(['holding', power]);   // today: ['ready', 0]
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toHaveLength(1);
    expect(g.stats().left).toBe(left - 1);
  });

  it('RED: LATER 526 (step 2) -- a wind-up held at the take, the button let go during the wait: the refusal throws it at the next update', () => {
    const { g, events } = thrower();
    g.select('M67');
    g.pull();
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    g.mountTake();
    (g as unknown as Untakes).mountUntake?.(false);
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toHaveLength(1);                   // today: none
  });

  it('RED: LATER 526 (step 2) -- a throw asked with its hand not yet open: the refusal opens it, the item spent once', () => {
    const { g, events } = thrower();
    g.select('M67');
    const left = g.stats().left;
    g.pull();
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    g.release();
    g.update(1 / 60);
    expect([g.phase(), events.filter((e) => e.startsWith('throw'))]).toEqual(['throwing', []]);
    g.mountTake();
    for (let i = 0; i < 6; i++) g.update(1 / 60);
    (g as unknown as Untakes).mountUntake?.(false);
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toHaveLength(1);                   // today: none
    expect(g.stats().left).toBe(left - 1);
  });

  it('RED: LATER 526 (step 2, pins) -- nothing cancelled at the take, or a take granted (no refusal): mountUntake hands nothing back', () => {
    const { g, events } = thrower();
    g.select('M67');
    g.mountTake();                                                // nothing held: nothing kept
    (g as unknown as Untakes).mountUntake?.(true);
    expect([g.phase(), g.stats().power]).toEqual(['ready', 0]);
    g.pull();
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    g.mountTake();
    (g as unknown as Untakes).mountUntake?.(true);
    (g as unknown as Untakes).mountUntake?.(true);                // handed back once
    g.release();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(events.filter((e) => e.startsWith('throw'))).toHaveLength(1);
  });
});

/**
 * LATER 532 (LATER 529's F4 and the dispatcher's word, 2026-10-27): the wind-up handed back at the refusal is stepped over
 * the wait's commands as the original's controller tick chased it there (`FUN_00594cf0` D:L453508-453516: `stepThrowPower`,
 * `DAT_006505e0` up, `DAT_006505d8` down, the release at `DAT_00650668` of the power, D:L453509), each command `TICK`
 * long, the trigger's level as the page's own record kept it (`./matchActions`), not stepped after a command that left the
 * body off the floor (D:L453478-453480, D:L457369-457371). The let-go's command releases: the throw starts at the refusal.
 */
describe('LATER 532: the wind-up handed back is stepped over the wait (GrenadeThrower.mountUntake)', () => {
  type Wait = { held: boolean; air: boolean }[];
  type Untakes = { mountUntake(held: boolean, wait?: Wait): void };
  const chase = (p: number, levels: boolean[]): number => {
    for (const held of levels) { const st = stepThrowPower(p, held ? 1 : 0, TICK); if (st.release) break; p = st.power; }
    return p;
  };
  const wound = () => {
    const { g, events } = thrower();
    const starts: number[] = [];
    g.on('throwStart', (t) => starts.push(t.power));
    g.select('M67');
    g.pull();
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    const power = g.stats().power;
    g.mountTake();
    return { g, events, starts, power, untake: (held: boolean, wait: Wait) => { (g as unknown as Untakes).mountUntake(held, wait); } };
  };
  const on = (held: boolean, air = false) => ({ held, air });

  it('RED: LATER 532 -- held through the wait: the power stepped over each command, still holding', () => {
    const w = wound();
    w.untake(true, [on(true), on(true), on(true), on(true)]);
    expect(w.g.phase()).toBe('holding');
    expect(w.g.stats().power).toBeCloseTo(chase(w.power, [true, true, true, true]), 12);   // today: the take-time power
  });

  it('RED: LATER 532 -- let go in the wait: released at the let-go, the throw started at the refusal at the power reached', () => {
    const w = wound();
    w.untake(false, [on(true), on(true), on(false), on(false)]);
    const atRefusal = w.starts.length;
    w.g.update(1 / 60);
    expect(w.starts).toHaveLength(1);
    expect(w.starts[0], "the let-go's power").toBeCloseTo(chase(w.power, [true, true]), 12);   // today: the take-time power
    expect(atRefusal, 'not at the refusal (the walk is locked there): at the first update after it').toBe(0);   // review F1: was 1
    for (let i = 0; i < 120; i++) w.g.update(1 / 60);
    expect(w.events.filter((e) => e.startsWith('throw'))).toHaveLength(1);
  });

  it('RED: LATER 532 -- off the floor the chase stands: an airborne command neither steps nor releases', () => {
    const w = wound();
    w.untake(false, [on(true), on(true, true), on(false, true), on(false)]);
    w.g.update(1 / 60);
    expect(w.starts).toHaveLength(1);
    expect(w.starts[0]).toBeCloseTo(chase(w.power, [true]), 12);
    const v = wound();
    v.untake(false, [on(true), on(false, true)]);                 // let go in the air: no release in the wait
    expect([v.g.phase(), v.starts, v.g.stats().power]).toEqual(['holding', [], chase(v.power, [true])]);
  });

  it('RED: LATER 532 review F2 -- let go before the take, pressed again after it in the same frame: held with pressure 1, not thrown at the next update', () => {
    const { g, events } = thrower();
    const starts: number[] = [];
    g.on('throwStart', (t) => starts.push(t.power));
    g.select('M67');
    g.pull();
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    g.release();                                                   // before the take: pressure 0, still holding
    g.mountTake();
    (g as unknown as Untakes).mountUntake(true, [on(true), on(true)]);    // the re-press rides M: the record's last level is held
    g.update(1 / 60);
    expect([g.phase(), starts], 'still the player\'s wind-up').toEqual(['holding', []]);   // today: thrown
    expect(events.filter((e) => e.startsWith('throw'))).toHaveLength(0);
  });

  it('LATER 532 (pins) -- no wait given: as LATER 526 left it (the take-time power, the trigger as told)', () => {
    const w = wound();
    (w.g as unknown as Untakes).mountUntake(true);
    expect([w.g.phase(), w.g.stats().power]).toEqual(['holding', w.power]);
  });
});

// Codex P2 on PR #739: a scene FIRE_WEAPON's MPBOMB round (item 154, `zweapon.rdr`; research 94, research 171 §4 and §8:
// the Crossroads bridges' and the bases' blasts reuse MPBOMB's records as damage definitions) reaches the page as a
// `sceneRound` (`./netPage` -> `./matchThrow` `sceneRound` -> `GrenadeThrower.fireScene`). MPBOMB is an `explosive`
// (151-170, `@s2u/scene` `itemClass`), so its record is in `KitTable.throwables`, never `KitTable.rounds`.
const ZWEAPON_ZAR = [resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps/RUN/ZWEAPON.ZAR'),
  ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, 'RUN/ZWEAPON.ZAR')] : [])].find((p) => existsSync(p));
describe.skipIf(!ZWEAPON_ZAR)(`a scene round of MPBOMB on the disc's kit table${ZWEAPON_ZAR ? '' : ' (zweapon.rdr absent: set SOCOM_DISC)'}`, () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };
  // Codex P1 on PR #742: vitest runs a skipped suite's factory at collection, so the disc read waits for beforeAll --
  // on a host without ZWEAPON.ZAR the suite skips instead of failing the whole file's collection (the no-data view).
  let table!: ReturnType<typeof readKitTable>;
  // `KitTable.throwables` is optional in its type; the disc's ZWEAPON.ZAR always yields it, asserted once in beforeAll.
  let throwables!: NonNullable<ReturnType<typeof readKitTable>['throwables']>;
  let mpbomb!: NonNullable<ReturnType<typeof throwables.get>>['record'];
  beforeAll(() => {
    table = readKitTable(new Uint8Array(readFileSync(ZWEAPON_ZAR!)));
    expect(table.throwables).toBeDefined();
    throwables = table.throwables!;
    mpbomb = throwables.get(154)!.record;
  });

  it("fireScene('MPBOMB') explodes the record's own explosion (its effect, and the anim the page sounds), with the records setRecords had", () => {
    expect(mpbomb.name).toBe('MPBOMB');
    expect([...table.rounds.values()].some((r) => r.record.name === 'MPBOMB')).toBe(false);   // not a launched round
    const effects: [string, number[]][] = [];
    const booms: { item: string; pos: number[]; anim: string; byEffects: boolean }[] = [];
    const { g } = thrower();
    g.setEffectPlayer((anim, at) => { effects.push([anim, [...at.position]]); return true; });
    g.on('explode', (e) => booms.push({ item: e.item, pos: [...e.pos], anim: e.anim, byEffects: e.byEffects }));
    g.setRecords(throwables.values());                 // as `./matchThrow` `setMap` and `spawnEquipment` hand them
    g.setRounds([...table.rounds.values()]);
    g.fireScene('MPBOMB', [120, 55, 200]);
    run(g, 0.2);
    expect(effects).toEqual([[mpbomb.explosionAnim, [120, 55, 200]]]);   // the effect spawns: `satchel` (its sound inside)
    expect(booms).toEqual([{ item: 'MPBOMB', pos: [120, 55, 200], anim: mpbomb.explosionAnim, byEffects: true }]);
    // Without the effects' run the page's listener sounds the anim (`./matchThrow`: `audio.onAnimCallback(info.anim)`).
    const bare = thrower().g, heard: { anim: string; byEffects: boolean }[] = [];
    bare.on('explode', (e) => heard.push({ anim: e.anim, byEffects: e.byEffects }));
    bare.setRecords(throwables.values());
    bare.fireScene('MPBOMB', [0, 0, 0]);
    run(bare, 0.2);
    expect(heard).toEqual([{ anim: mpbomb.explosionAnim, byEffects: false }]);
  });

  it('MPBOMB stays out of every hand path: no record by kind, no slot, no select, no give-back, no remote throw', () => {
    const { g } = thrower();
    g.setRecords(throwables.values());
    expect(KIT_ITEMS).not.toContain('MPBOMB');
    expect(g.recordOf('MPBOMB')).toBeNull();
    expect(g.giveBack('MPBOMB')).toBe(false);
    expect(g.select('MPBOMB' as KitItem)).toBe(false);
    g.setKit(['MPBOMB', 'M67', null]);
    expect(g.takeable(1)).toBeNull();
    g.launchRemote('MPBOMB', [0, 50, 0], [0, 0, -100], 3);
    expect(g.stats().live).toEqual([]);
  });
});

/**
 * LATER 645 (research 81 s5; reading, pending review): another's rocket passing the page's player. `FUN_00598000`'s 0xb9
 * branch (D:L454640-454646) plays `.ROCKET_BY` when a rocket's segment `+0x48` -> `+0x54` -- each tick's, the last
 * position to the new one (`FUN_003ca5a0` D:L320297-320299, D:L320305-320342) -- comes strictly under 100 of the
 * actor's feet (`+0x1c`, D:L454629) at a point inside the segment (`FUN_00308b00`), once a rocket (`+6` bit 4,
 * D:L454641, set D:L454646); the console's own rocket is skipped (`+4` bit 3, D:L454627). Class 0xb9 by the ID's
 * category (`FUN_003d1e10` -> `FUN_003d1a60`, `weaponCategory`): LAW HEAT 185, RPG 186; a launched round (0xab) is not.
 */
describe("LATER 645: another's rocket passing the page's feet (GrenadeThrower 'rocketPast')", () => {
  const rocket: ThrowableRecord = { ...M67, name: 'LAW HEAT', id: 185, muzzleVelocity: 200, gravity: 0, armingDistance: 0, impact: true, fuse: 10, removal: 10.1, explosionRadius: 150 };
  const grenadeRound: ThrowableRecord = { ...rocket, name: 'M203 FRAG', id: 175 };
  /** A thrower whose page's feet are `feet`; the 'rocketPast' events it tells, and 6 s of 60 Hz frames run. */
  const flyPast = (feet: V3 | null, launch: (g: GrenadeThrower) => void): { from: V3; to: V3; actor: V3 }[] => {
    const { g } = thrower({ listenerFeet: () => feet });
    g.setRounds([rocket, grenadeRound]);
    const told: { from: V3; to: V3; actor: V3 }[] = [];
    g.on('rocketPast', (e) => told.push(e));
    launch(g);
    for (let i = 0; i < 360; i++) g.update(1 / 60);
    return told;
  };

  it('another\'s LAW flying past 50 from the feet is told once, on the frame whose segment holds the nearest point', () => {
    const told = flyPast([50, 100, -303], (g) => g.launchRemote('LAW HEAT', [0, 100, 0], [0, 0, -200], 7));
    expect(told).toHaveLength(1);
    const { from, to, actor } = told[0]!;
    expect(actor).toEqual([50, 100, -303]);
    expect(from[2]).toBeGreaterThan(-303);
    expect(to[2]).toBeLessThan(-303);
    expect(from[2] - to[2]).toBeCloseTo(200 * GAME_FRAME_DT, 4);    // one game frame's segment, not the whole flight
  });

  it('one passing at 100 or more is not told, nor one whose nearest point is an end of its flight', () => {
    expect(flyPast([100, 100, -303], (g) => g.launchRemote('LAW HEAT', [0, 100, 0], [0, 0, -200], 7))).toEqual([]);
    expect(flyPast([150, 100, -303], (g) => g.launchRemote('LAW HEAT', [0, 100, 0], [0, 0, -200], 7))).toEqual([]);
    expect(flyPast([0, 100, 30], (g) => g.launchRemote('LAW HEAT', [0, 100, 0], [0, 0, -200], 7))).toEqual([]);   // behind its muzzle
  });

  it("the page's own rocket, another's launched round (class 0xab) and a page with no feet are told nothing", () => {
    expect(flyPast([50, 100, -303], (g) => g.launchRound(rocket, [0, 100, 0], [0, 0, -200]))).toEqual([]);
    expect(flyPast([50, 100, -303], (g) => g.launchRemote('M203 FRAG', [0, 100, 0], [0, 0, -200], 7))).toEqual([]);
    expect(flyPast(null, (g) => g.launchRemote('LAW HEAT', [0, 100, 0], [0, 0, -200], 7))).toEqual([]);
  });
});
