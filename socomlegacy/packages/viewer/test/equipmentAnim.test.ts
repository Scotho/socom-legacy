// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import {
  buildGrid, CLAYMORE, IDENTITY, partMatrix, Skeleton, HAND_ANIMS, handAnim, PISTOL_HAND_ANIMS, PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM, releaseSeconds, THROW_ANIMS,
  type Grid, type GridParams, type ThrowableRecord, type ThrowAnim, type WorldPoly,
} from '@s2u/scene';
import { C4_PLANT_SECONDS } from '../src/equipment';
import { GrenadeThrower, holdClipOf, type GrenadeSource } from '../src/grenade';
import { ITEM_NODE } from '../src/heldItem';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { HOLD_CLIPS, isHoldClip, type PlaySnapshot } from '../src/mover';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { bodyOf, snapshotOf } from '../src/net/body';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';
import { BODY_HOLD_SHIFT, BodyFlag, bodyHoldBits, bodyHoldOf } from '../src/net/protocol';
import { PlayerLoadout } from '../src/loadout';
import { holdAnim, THROW_CLIPS, ThrowPose } from '../src/throwPose';
import { Animator, BODY_PARTS, PLAY_CLIPS, quatOfMatrix, type MoverSnapshot } from '../src/animator';
import { TICK } from '../src/mover';

/**
 * The equipment's hand pass (research 85 s8.1; the owner's playtest of 2026-10-06: "We appear to be missing animations
 * for equipment ... do the same pass ... as we have accurately done for mainhand and offhand"): the clips the body plays
 * for a throw and a placing, by the type and the hand, as the original picks them -- C4's own `Put on wall`
 * (`FUN_005be9a0` -0x69, D:L475420), the pistol's versions through `FUN_0058c820`'s pairs (D:L446077, D:L494720-494772),
 * the firearm left in the hand and the item on the `grenade` node under `rhand` (`FUN_005a64c0`, `FUN_00553290`) -- and
 * the others seeing them (the mover's hold on the wire, `BODY_HOLD_SHIFT`).
 */

const RUN = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'), 'RUN');
const READERC = resolve(RUN, 'READERC.ZAR'), PACK = resolve(RUN, 'MOTION_P.ZAR');
const noDisc = !existsSync(READERC) || !existsSync(PACK);

/** `animset.rdr`'s Seal anim set with its includes: each `type_name` to its single `anim_name`. */
function sealTypes(): Map<string, string> {
  const zar = Zar.parse(new Uint8Array(readFileSync(READERC)));
  const root = parseRdr(zar.data(zar.find('animset.rdr')!));
  const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
  const sets = flat(root);
  const byName = (n: string): RdrNode => sets.find((s) => rdrGet(s, 'anim_set_name') === n)!;
  const out = new Map<string, string>();
  const add = (set: RdrNode): void => {
    for (const a of rdrGet(set, 'anim_set_anims') as RdrNode[]) {
      const type = rdrGet(a, 'type_name'), clip = rdrGet(a, 'anim_name');
      if (typeof type === 'string' && typeof clip === 'string' && !out.has(type)) out.set(type, clip);
    }
  };
  const seal = byName('Seal anim set');
  add(seal);
  for (const inc of rdrGet(seal, 'include') as string[]) add(byName(inc));
  return out;
}

describe.skipIf(noDisc)(`the throw and placing clips are the disc's${noDisc ? ' (READERC.ZAR or MOTION_P.ZAR absent)' : ''}`, () => {
  it("each type names its clip in the Seal anim set, with motion.rdr's playback and MOTION_P.ZAR's keys; none looped", () => {
    const types = sealTypes();
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!;
    const clips = new Map(clipsFromPack(new Uint8Array(readFileSync(PACK)), HAND_ANIMS.map((a) => a.clip)).map((c) => [c.name, c]));
    for (const a of HAND_ANIMS) {
      expect(types.get(a.type), a.type).toBe(a.clip);
      expect(table.get(a.clip)?.playback, a.clip).toBeCloseTo(a.playback, 6);
      expect(table.get(a.clip)?.looped, a.clip).toBe(false);
      expect(clips.get(a.clip)?.frameCount, a.clip).toBe(a.frames);
    }
    // The crouched and prone throws' pistol types are ELF names the Seal anim set does not hold: the rifle's clip plays.
    for (const t of ['Pistol crouch throw grenade', 'Pistol prone throw grenade', 'Pistol prone toss grenade']) expect(types.has(t), t).toBe(false);
  });

  it("C4's plant lands at Put on wall's trigger phase 0.45 -- the viewer's C4_PLANT_SECONDS", () => {
    expect(releaseSeconds(PUT_ON_WALL_ANIM)).toBeCloseTo(C4_PLANT_SECONDS, 12);
    expect(releaseSeconds(PISTOL_HAND_ANIMS.seal_put_onwall!)).toBeCloseTo(C4_PLANT_SECONDS, 12);
    expect(releaseSeconds(PISTOL_HAND_ANIMS.seal_place_claymore!)).toBeCloseTo(releaseSeconds(PLACE_CLAYMORE_ANIM), 12);
  });

  it('the pistol versions the mover holds on their rifle type keep its clock: playback, keys, NoInterrupt and root travel', () => {
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!;
    const clips = new Map(clipsFromPack(new Uint8Array(readFileSync(PACK)), HAND_ANIMS.map((a) => a.clip)).map((c) => [c.name, c]));
    /** The root's travel over the clip (x, z), [0, 0] for a clip with one root key or none (in place). */
    const travel = (name: string): [number, number] => {
      const clip = clips.get(name)!, root = clip.parts.find((p) => p.name === 'skel_root')?.translations ?? [];
      const last = 3 * (clip.frameCount - 1);
      return root.length > 3 ? [root[last]! - root[0]!, root[last + 2]! - root[2]!] : [0, 0];
    };
    let held = 0;
    for (const [rifle, pistol] of Object.entries(PISTOL_HAND_ANIMS)) {
      const hold = holdClipOf(pistol, { clip: rifle } as ThrowAnim);
      if (hold === pistol.clip) continue;                           // its own code (the toss, the plant)
      held++;
      const r = HOLD_CLIPS[rifle as keyof typeof HOLD_CLIPS], e = table.get(pistol.clip)!;
      expect(e, pistol.clip).toBeDefined();
      expect(e.playback, pistol.clip).toBeCloseTo(r.playback, 6);
      expect(pistol.playback, pistol.clip).toBeCloseTo(r.playback, 6);
      expect(clips.get(pistol.clip)?.frameCount, pistol.clip).toBe(r.frames);
      expect(pistol.frames, pistol.clip).toBe(r.frames);
      expect(e.noInterrupt ?? 0, pistol.clip).toBeCloseTo(r.noInterrupt, 6);
      const [dx, dz] = travel(pistol.clip);
      expect(dx, pistol.clip).toBeCloseTo(r.travel[0], 1);
      expect(dz, pistol.clip).toBeCloseTo(r.travel[1], 1);
    }
    expect(held).toBe(4);                                           // the standing throw, both lean tosses, the claymore
  });

  it('a pistol one-shot lays only the parts it carries (PISTOL_ONESHOT_PARTS_READING): the upper body of seal_p_throwgrenade', () => {
    const clips = new Map(clipsFromPack(new Uint8Array(readFileSync(PACK)), THROW_CLIPS).map((c) => [c.name, c]));
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)));
    const pose = new ThrowPose(() => ({ clips, table }));
    expect(pose.start(handAnim(THROW_ANIMS.standThrow, true))).toBe(true);
    pose.step(0.3);
    const parts = pose.layer.sample({ clip: clips.get('seal_p_throwgrenade')!, frame: 0, phase: 0 })!.parts.map((p) => p.name);
    expect(parts).toContain('pistol');
    expect(parts).not.toContain('lthigh');
    expect(parts).not.toContain('skel_root');
  });

  it("PAR-85 B4 (research 251 section 12.9): the rifle hand's throws carry the six leg parts and skel_root, the pistol's two lack every leg part and the root, and seal_p_throwgrenade pushed from a run holds lthigh at the run's pose drawn at the push", () => {
    const LEGS = ['lthigh', 'rthigh', 'lcalf', 'rcalf', 'lfoot', 'rfoot'];       // FUN_00576860's ten parts' legs (D:L436691-436701)
    const pack = clipsFromPack(new Uint8Array(readFileSync(PACK)), [...new Set([...PLAY_CLIPS, ...THROW_CLIPS])]);
    const clips = new Map(pack.map((c) => [c.name, c]));
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!;
    const has = (clip: string): Set<string> => new Set(clips.get(clip)!.parts.map((p) => p.name));
    for (const c of ['seal_throwgrenade', 'seal_tossgrenade', 'seal_crouch_throwgrenade', 'seal_prone_throwgrenade', 'seal_prone_tossgrenade']) {
      expect(clips.get(c)!.parts.length, c).toBe(26);
      for (const part of [...LEGS, 'skel_root']) expect(has(c).has(part), `${c} ${part}`).toBe(true);
    }
    const lower = ['skel_root', 'hips', ...LEGS, 'ltoe', 'rtoe'];
    expect(clips.get('seal_p_throwgrenade')!.parts.length).toBe(16);
    expect(clips.get('seal_p_tossgrenade')!.parts.length).toBe(15);
    for (const c of ['seal_p_throwgrenade', 'seal_p_tossgrenade']) expect(lower.filter((n) => !has(c).has(n)), c).toEqual(lower);
    // Every throw clip is NoPitchtwist (B5's flag), the rifle's and the pistol's.
    for (const a of HAND_ANIMS.filter((x) => THROW_CLIPS.includes(x.clip) && !/claymore|onwall/.test(x.clip))) expect(table.get(a.clip)?.noPitchtwist, a.clip).toBe(true);
    // The body: every SEAL part at the identity, the disc's clips and table; a run, then the pistol's throw pushed.
    const names = [...BODY_PARTS];
    const sk = new Skeleton('seal', IDENTITY, names.map((name, index) => ({
      index, name, parent: index === 0 ? -1 : 0, bindLocal: partMatrix([0, 0, 0, 1], [0, 0, 0]), bbox: new Float32Array(6), type: 0, flags: 0,
    })));
    expect(names[0]).toBe('skel_root');
    const anim = new Animator(sk, pack, table);
    const pose = new ThrowPose(() => ({ clips, table }));
    anim.addPoseLayer(pose.layer);
    const rest: MoverSnapshot = { vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand', ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null };
    const run: MoverSnapshot = { ...rest, vz: -65, ground: { state: 'stand', forward: 1, right: 0, cls: 1 } };
    for (let i = 0; i < 60; i++) { pose.step(TICK); anim.step(TICK, run); }
    expect(anim.stats().clip).toBe('seal_run');
    const thigh = sk.indexOf('lthigh'), atPush = quatOfMatrix(sk.local[thigh]!);
    expect(pose.start(handAnim(THROW_ANIMS.standThrow, true), true)).toBe(true);
    expect(pose.stats().clip).toBe('seal_p_throwgrenade');
    for (let i = 0; i < 47; i++) {                                   // to the stick's cut on the 48th command (PAR-70)
      pose.step(TICK);
      anim.step(TICK, { ...rest, hold: 'seal_throwgrenade' });
      const q = quatOfMatrix(sk.local[thigh]!), sign = q[0] * atPush[0] + q[1] * atPush[1] + q[2] * atPush[2] + q[3] * atPush[3] < 0 ? -1 : 1;
      for (let c = 0; c < 4; c++) expect(q[c]!, `${i + 1} frames on [${c}]`).toBeCloseTo(sign * atPush[c]!, 6);
    }
  });

  it('the others: a throw\'s hold starts its clip once, the pistol\'s version in a pistol hand; a reload\'s hold none', () => {
    const clips = new Map(clipsFromPack(new Uint8Array(readFileSync(PACK)), THROW_CLIPS).map((c) => [c.name, c]));
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)));
    const pose = new ThrowPose(() => ({ clips, table }));
    pose.follow('seal_throwgrenade', false);
    expect(pose.stats().clip).toBe('seal_throwgrenade');
    pose.step(0.5);
    pose.follow('seal_throwgrenade', false);                        // the same hold the next frame: not restarted
    expect(pose.stats().elapsed).toBeCloseTo(0.5, 9);
    // The hold off: the throw pops with it, as the stack's top (PAR-85 B3, research 251 section 12.9; was: "the clip runs
    // out on its own clock").
    pose.follow(null, false);
    expect(pose.playing()).toBe(false);
    pose.follow('seal_put_onwall', true);
    expect(pose.stats().clip).toBe('seal_p_put_onwall');
    pose.follow(null, false);
    // NU-8b B3 (research 326 section 3): a placing is the stack's top too and pops with its hold. *Was*: playing, "a
    // placing's runs out on its own clock (not PAR-85's)".
    expect(pose.playing()).toBe(false);
    // A new throw on the same code with no frame of no hold between: the hold's start parity flips, the clip restarts.
    pose.follow('seal_throwgrenade', false, 1);
    pose.step(0.5);
    pose.follow('seal_throwgrenade', false, 1);                     // the same throw: not restarted
    expect(pose.stats().elapsed).toBeCloseTo(0.5, 9);
    pose.follow('seal_throwgrenade', false, 0);                     // the next throw, the same code: restarted
    expect(pose.stats().clip).toBe('seal_throwgrenade');
    expect(pose.stats().elapsed).toBe(0);
    pose.follow(null, false);
    pose.stop();
    pose.follow('seal_crouch_reload', false);
    expect(pose.playing()).toBe(false);
  });
});

describe('the clip a throw and a placing play (FUN_00588bc0 -> FUN_0058c820; FUN_005be9a0)', () => {
  it('the pistol in the hand: the standing throw and toss, the lean tosses, the claymore and C4 take the pistol\'s; the crouched and prone throws keep the rifle\'s', () => {
    const p = (a: ThrowAnim): string => handAnim(a, true).clip;
    expect(p(THROW_ANIMS.standThrow)).toBe('seal_p_throwgrenade');
    expect(p(THROW_ANIMS.standToss)).toBe('seal_p_tossgrenade');
    expect(p(THROW_ANIMS.peekRightToss)).toBe('seal_p_toss_rlean');
    expect(p(THROW_ANIMS.peekLeftToss)).toBe('seal_p_toss_llean');
    expect(p(PLACE_CLAYMORE_ANIM)).toBe('seal_p_place_claymore');
    expect(p(PUT_ON_WALL_ANIM)).toBe('seal_p_put_onwall');
    for (const a of [THROW_ANIMS.crouchThrow, THROW_ANIMS.proneThrow, THROW_ANIMS.proneToss]) expect(p(a)).toBe(a.clip);
    for (const a of HAND_ANIMS) expect(handAnim(a, false)).toBe(a);   // the rifle's hand: the rifle's types
  });

  it("GetThrowAnim's fraction and hand point stand; the release is timed on the pushed motion (FUN_005802b0): the pistol's toss at 1.334 s", () => {
    const toss = handAnim(THROW_ANIMS.standToss, true);
    expect(toss.release).toBe(THROW_ANIMS.standToss.release);
    expect(toss.offset).toEqual(THROW_ANIMS.standToss.offset);
    expect(releaseSeconds(toss)).toBeCloseTo(0.69 * 2.0 * (29 / 30), 12);
    expect(releaseSeconds(THROW_ANIMS.standToss)).toBeCloseTo(0.69 * 1.6 * (29 / 30), 12);
  });

  it('the hold codes: the pistol\'s toss and plant are holds of their own; the rest hold on their rifle type', () => {
    expect(holdClipOf(handAnim(THROW_ANIMS.standToss, true), THROW_ANIMS.standToss)).toBe('seal_p_tossgrenade');
    expect(holdClipOf(handAnim(PUT_ON_WALL_ANIM, true), PUT_ON_WALL_ANIM)).toBe('seal_p_put_onwall');
    expect(holdClipOf(handAnim(THROW_ANIMS.standThrow, true), THROW_ANIMS.standThrow)).toBe('seal_throwgrenade');
    expect(holdClipOf(handAnim(PLACE_CLAYMORE_ANIM, true), PLACE_CLAYMORE_ANIM)).toBe('seal_place_claymore');
    for (const a of HAND_ANIMS) expect(isHoldClip(holdClipOf(a, a)) || !isHoldClip(a.clip)).toBe(true);
    for (const a of [...Object.values(THROW_ANIMS), PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM]) expect(isHoldClip(a.clip), a.clip).toBe(true);
    expect(holdAnim('seal_p_tossgrenade', false)?.clip).toBe('seal_p_tossgrenade');
    expect(holdAnim('seal_prone_reload', false)).toBeNull();
  });
});

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

/** A floor and a wall across x 130, a scene destructible (`DI`), as `equipmentPage.test.ts`'s C4 barrier. */
const DI = 'worldmodel/access1=access1/good_parts/di_good';
function c4Grid(): Grid {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, -2000, 2000, 50, -2000, 2000, 50, 2000, -2000, 50, 2000]),
  };
  const wall: WorldPoly = { ...f, path: DI, ditype: 2, points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f, wall], [
    { modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 },
  ]);
}
const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: 0.1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };

describe('the page\'s thrower plays the type\'s clip for its hand (GrenadeThrower throwStart)', () => {
  const run = (g: GrenadeThrower, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
  const starts = (extra: Partial<GrenadeSource>) => {
    const grid = c4Grid();
    const g = new GrenadeThrower({
      grid: () => grid, snapshot: () => snap(), view: () => 'third', handPoint: () => [102, 62, 192],
      aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), ...extra,
    });
    const seen: string[] = [];
    g.on('throwStart', ({ anim, hold, releaseIn }) => seen.push(`${anim.clip} ${hold} ${releaseIn.toFixed(3)}`));
    return { g, seen };
  };

  it('C4 is planted with Put on wall (the rifle\'s or the pistol\'s), not the claymore\'s clip', () => {
    for (const pistol of [false, true]) {
      const { g, seen } = starts({ pistol: () => pistol });
      g.setRecords([C4]);
      g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
      g.setKit(['M67', 'AN-M8', 'C4']);
      run(g, 0.3);                                                  // the reticle settles on the target (0.2 s)
      expect(g.plantC4(), `pistol ${pistol}`).toBe(true);
      expect(seen).toEqual([pistol ? `seal_p_put_onwall seal_p_put_onwall ${C4_PLANT_SECONDS.toFixed(3)}` : `seal_put_onwall seal_put_onwall ${C4_PLANT_SECONDS.toFixed(3)}`]);
    }
  });

  it('the claymore with the pistol in the hand plays seal_p_place_claymore and holds the mover on the claymore\'s code', () => {
    const { g, seen } = starts({ pistol: () => true });
    g.select('Claymore');
    g.pull();
    expect(seen).toEqual(['seal_p_place_claymore seal_place_claymore 1.300']);
  });

  it('a throw with the pistol in the hand: seal_p_throwgrenade; a light one, the pistol\'s toss, let go at 1.334 s', () => {
    for (const [frames, want] of [[40, 'seal_p_throwgrenade seal_throwgrenade 0.710'], [6, 'seal_p_tossgrenade seal_p_tossgrenade 1.334']] as const) {
      const { g, seen } = starts({ pistol: () => true });
      g.select('M67');
      g.pull();
      for (let i = 0; i < frames; i++) g.update(1 / 60);
      g.release();
      g.update(1 / 60);
      expect(seen).toEqual([want]);
    }
  });
});

describe('the hold on the wire (BODY_HOLD_SHIFT: additive, the version kept)', () => {
  it('rides four bits of the body\'s flags clear of every BodyFlag, and comes back as the snapshot\'s hold', () => {
    for (const f of Object.values(BodyFlag)) expect(f & (0xf << BODY_HOLD_SHIFT), `flag ${f}`).toBe(0);
    expect(BODY_HOLD_SHIFT + 4).toBeLessThanOrEqual(16);             // the body's u16 of flags
    expect(bodyHoldBits(null)).toBe(0);
    expect(bodyHoldOf(BodyFlag.Alive | BodyFlag.Binoculars)).toBeNull();
    const extras = { alive: true, weapon: 1 as const, aiming: false, trigger: false, boost: false, binoculars: true };
    const body = bodyOf(3, snap({ hold: 'seal_put_onwall', ground: { state: 'idle', forward: 0, right: 0, cls: 0 }, action: null, turnRate: 0 } as Partial<PlaySnapshot>), extras);
    expect(body.flags & BodyFlag.Binoculars).not.toBe(0);
    const wire = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [body], doors: [], env: { revision: 0, epoch: 0, states: [] } }));
    const back = snapshotOf(wire.bodies[0]!);
    expect(back.hold).toBe('seal_put_onwall');
    expect(back.binoculars).toBe(true);
    const none = snapshotOf(bodyOf(3, snap({ ground: { state: 'idle', forward: 0, right: 0, cls: 0 }, action: null, turnRate: 0 } as Partial<PlaySnapshot>), extras));
    expect(none.hold).toBeUndefined();
  });

  it("a hold start's parity rides the last flag bit (BodyFlag.HoldSerial): the next throw on the same code is a new one", () => {
    expect(BodyFlag.HoldSerial).toBe(1 << 15);
    expect(((0xf << BODY_HOLD_SHIFT) & BodyFlag.HoldSerial)).toBe(0);
    const extras = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false };
    const base = { ground: { state: 'idle', forward: 0, right: 0, cls: 0 }, action: null, turnRate: 0 } as Partial<PlaySnapshot>;
    const round = (s: PlaySnapshot) => snapshotOf(decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [bodyOf(3, s, extras)], doors: [], env: { revision: 0, epoch: 0, states: [] } })).bodies[0]!);
    expect(round(snap({ ...base, hold: 'seal_throwgrenade', holdSerial: 3 }))).toMatchObject({ hold: 'seal_throwgrenade', holdSerial: 1 });
    expect(round(snap({ ...base, hold: 'seal_throwgrenade', holdSerial: 4 }))).toMatchObject({ hold: 'seal_throwgrenade', holdSerial: 0 });
    expect(round(snap(base)).holdSerial).toBeUndefined();
  });
});

describe('the hands while an item is up (./matchThrow; FUN_005a64c0, FUN_00553290)', () => {
  function rig() {
    const stowed: boolean[] = [];
    const itemNode = { add: vi.fn(), remove: vi.fn() };
    const firearm = {
      shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
      fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
      zoom: { state: () => 0 }, kit: { swapping: () => false, item: () => 'pistol', state: () => ({ swap: null }) },
      setZoom: () => {}, showFireMode: () => {}, item: () => 'pistol', record: () => ({ name: 'Mk23' }), records: () => [{}, {}],
      icon: () => '', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    };
    const deps: MatchThrowDeps = {
      scene: new Scene(),
      walk: {
        grid: () => null, snapshot: () => null, view: () => 'third', fireAim: () => null, feet: () => null, drawnFeet: () => null,
        hold: () => true, mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
        onLauncherStickLower: () => () => {},                          // PAR-83: the part hears the walk's stick lower at its mount
      } as never,
      fly: { shakeScreen: () => {} },
      play: {
        partPoint: () => null, heldNode: () => { throw new Error('the rifle node is not the item\'s'); }, itemNode: () => itemNode,
        launcherNode: () => null, motionSource: () => null, setRifleStowed: (on: boolean) => { stowed.push(on); }, addPoseLayer: () => {},
      } as never,
      loadouts: new PlayerLoadout(),
      view: () => null, map: () => null, net: () => null,
      firearm: () => firearm as never,
      audio: { onAnimCallback: () => null, play: () => {} } as never,
    };
    return { t: mountThrowables(deps), stowed };
  }

  it('a grenade up leaves the firearm on its mount (no stow); the item node is the `grenade` node under rhand', () => {
    const { t, stowed } = rig();
    expect(t.grenade.select('M67')).toBe(true);
    expect(stowed).toEqual([false]);
    expect(ITEM_NODE).toEqual({ name: 'grenade', parent: 'rhand' });
  });
});
