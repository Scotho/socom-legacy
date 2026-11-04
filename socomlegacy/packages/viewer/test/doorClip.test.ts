// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { DoorSet, OPEN_DOOR_TYPE, openDoorClip, type DoorActor, type DoorSpec } from '../src/doors';
import { DoorPage, type DoorPageDeps } from '../src/doorPage';
import { TICK } from '../src/mover';
import { stepFlinch } from '../src/remotePlayers';
import * as remote from '../src/remotePlayers';
import { WalkMode } from '../src/walk';
import { FlyCamera } from '../src/camera';
import { flinchCovered, flinchCutAt, flinchLanded, noInterruptCommands, pushedWindow, reloadInFlinch } from '../src/net/flinchReload';
import { GAME_FRAME_DT, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { packGround } from '../src/sim';
import type { PlayClips } from '../src/play';
import { Scene } from 'three';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { Traversal, TRAVERSAL_CLIP } from '../src/traversal';
import { MoverSim } from '../src/net/moverSim';
import { applyKnock } from '../src/net/blast';
import { groundGrid, groundPolygons, Walker, type GroundData } from '../src/walk';
import type { Command } from '../src/net/protocol';

/** Ticks of `TICK` that complete `n` game frames (the ANIMATE's phases step at the game frame, PF.R8). */
const frames = (n: number): number => Math.ceil((n * GAME_FRAME_DT) / TICK - 1e-9);

/**
 * The SEAL's own motion at a door (the owner, 2026-10-23: "Animation for opening doors is non existent"; socomlegacy/docs/
 * research/92-doors.md section 2): the door program's `open` and `close` sequences run, before the valve and the swing,
 * `ai::MOVE`, `ai::ANIMATE` type 63 (`Open door`, the clip `seal_open_door` in the Seal anim set) with a 0.25 s post-wait,
 * and `ai::EVENT` (an AI noise). The ANIMATE's tick (`FUN_005d2f30` D:L487009-487284) spends one tick on the pre-wait
 * (0), pushes the type on the actor who pressed on the next (`FUN_00588bc0(actor, type, stance, 0, 0)`, D:L487256-487260),
 * then counts the post-wait down; only then the sequence reaches `VALVE`, `SOUND` and the swing. The MOVE's order is
 * not run (`DOOR_MOVE_ORDER_READING`) and the EVENT has no AI to hear it.
 */

const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`the door's ANIMATE on Frostfire's bdoor_4${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP2 ? simMapFromBytes(MP2, 'RUN/MP2.ZDB') : null;

  function opened(actor?: DoorActor) {
    const animated: { node: string; type: number; actor: DoorActor }[] = [], sounds: string[] = [];
    const doors = new DoorSet(map!.doors ?? [], map!.ground, {
      sound: (name) => sounds.push(name),
      animate: (d: DoorSpec, type: number, who: DoorActor) => animated.push({ node: d.node, type, actor: who }),
    });
    const i = doors.specs.findIndex((d) => d.node === 'bdoor_4');
    expect(actor === undefined ? doors.use(i, [582.5, 142, 1130]) : doors.use(i, [582.5, 142, 1130], actor)).toBe(true);
    return { doors, i, animated, sounds };
  }

  it('the use pushes nothing on its own tick; the first whole game frame after it pushes Open door (63) on the presser, once', () => {
    const { doors, i, animated, sounds } = opened();
    expect(animated).toEqual([]);                                 // the timeless head: IF, CALL_SEQUENCE, MOVE, the ANIMATE's pre-wait
    expect(doors.valve(i)).toBe(0);
    for (let k = 0; k < frames(1) - 1; k++) doors.step(TICK);
    expect(animated).toEqual([]);                                 // not a whole game frame yet
    doors.step(TICK);
    expect(animated).toEqual([{ node: 'bdoor_4', type: OPEN_DOOR_TYPE, actor: 'self' }]);
    expect(doors.valve(i)).toBe(0);
    expect(sounds).toEqual([]);
    for (let k = 0; k < 30; k++) doors.step(TICK);
    expect(animated).toHaveLength(1);                             // the push is one frame's
  });

  it("the valve flips, the sound plays and the swing starts at the ninth game frame after the use (the push's, then 8 for the 0.25 s), 0.300 s", () => {
    const { doors, i, sounds } = opened();
    let t = 0, ticks = 0;
    while (doors.valve(i) === 0 && t < 2) { doors.step(TICK); t += TICK; ticks++; }
    expect(ticks).toBe(frames(9));
    expect(t).toBeGreaterThanOrEqual(9 * GAME_FRAME_DT - 1e-9);
    expect(t).toBeLessThan(9 * GAME_FRAME_DT + TICK);
    expect(doors.valve(i)).toBe(1);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    expect(doors.state(i).busy).toBe(true);                       // the swing runs on
  });

  it('stepped at the room\'s or any other rate, the phases still fall on game frames: the valve at 9 x GAME_FRAME_DT', () => {
    for (const dt of [1 / 30, 1 / 144, 0.01]) {
      const { doors, i } = opened();
      let t = 0;
      while (doors.valve(i) === 0 && t < 2) { doors.step(dt); t += dt; }
      expect(t, `dt ${dt}`).toBeGreaterThanOrEqual(9 * GAME_FRAME_DT - 1e-9);
      expect(t, `dt ${dt}`).toBeLessThan(9 * GAME_FRAME_DT + dt);
    }
  });

  it('the close pushes it too, after the open has run out', () => {
    const { doors, i, animated } = opened();
    for (let k = 0; k < 600 && doors.state(i).busy; k++) doors.step(TICK);
    expect(doors.state(i)).toMatchObject({ open: true, busy: false });
    expect(doors.use(i, [582.5, 142, 1130], 7)).toBe(true);
    for (let k = 0; k < frames(1); k++) doors.step(TICK);
    expect(animated).toEqual([
      { node: 'bdoor_4', type: OPEN_DOOR_TYPE, actor: 'self' },
      { node: 'bdoor_4', type: OPEN_DOOR_TYPE, actor: 7 },
    ]);
  });

  it("a swing followed off the server's wire names the actor 'wire': the page plays no own clip for it", () => {
    const server = new DoorSet(map!.doors ?? [], map!.ground);
    const i = server.specs.findIndex((d) => d.node === 'bdoor_4');
    server.use(i, [582.5, 142, 1130], 3);
    server.step(TICK);
    const animated: DoorActor[] = [];
    const page = new DoorSet(map!.doors ?? [], map!.ground, { animate: (_d, _t, who) => animated.push(who) });
    page.applyWire(server.wire());
    for (let k = 0; k < frames(1); k++) page.step(TICK);
    expect(animated).toEqual(['wire']);
  });

  it("a swing already under way on the server: the page runs through the head to the swing, hears the sound once, and stands at the server's phase", () => {
    const server = new DoorSet(map!.doors ?? [], map!.ground);
    const i = server.specs.findIndex((d) => d.node === 'bdoor_4');
    server.use(i, [582.5, 142, 1130], 3);
    for (let k = 0; k < frames(9) + 12; k++) server.step(TICK);  // 0.2 s into the swing
    const wire = server.wire();
    expect(wire[i]!.phase).toBeGreaterThan(0);
    const sounds: string[] = [];
    const page = new DoorSet(map!.doors ?? [], map!.ground, { sound: (n) => sounds.push(n) });
    page.applyWire(wire);
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    page.step(TICK);                                              // the catch-up lands one tick short, as before (`applyWire`)
    expect(page.wire()[i]!.valve).toBe(wire[i]!.valve);
    expect(Math.abs(page.wire()[i]!.phase - wire[i]!.phase)).toBeLessThanOrEqual(1);
    for (let k = 0; k < 120; k++) { page.step(TICK); server.step(TICK); }
    expect(sounds).toEqual(['.DOOR_WOOD_OPEN']);
    expect(page.state(i)).toEqual(server.state(i));
  });

  it('the wire reads the door as running (phase 0) through the ANIMATE wait, so a page follows it from the press', () => {
    const { doors, i } = opened();
    doors.step(TICK);
    expect(doors.wire()[i]).toEqual({ valve: 0, phase: 0 });
  });
});

describe('the clip the type names (animset.rdr, the Seal anim set; the ELF type table at 0x661060)', () => {
  it('63 Open door -> seal_open_door, with the rifle or the pistol in the hand (no pistol entry in the set)', () => {
    expect(OPEN_DOOR_TYPE).toBe(63);
    expect(openDoorClip(OPEN_DOOR_TYPE, false)).toBe('seal_open_door');
    expect(openDoorClip(OPEN_DOOR_TYPE, true)).toBe('seal_open_door');
    expect(openDoorClip(1, false)).toBeNull();                    // another type: not a door's, nothing played here
  });
});

describe.skipIf(!MP2)(`DoorPage: the own body's clip${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const map = MP2 ? simMapFromBytes(MP2, 'RUN/MP2.ZDB') : null;
  function page(net: ReturnType<DoorPageDeps['net']> = null) {
    const pushed: number[] = [];
    const doors = new DoorPage({
      grid: () => null, feet: () => [582.5, 142, 1130], aim: () => null,
      sound: () => undefined, move: () => undefined, net: () => net,
      pushClip: (type) => { pushed.push(type); },
    });
    doors.setMap(map!.doors, map!.ground);
    return { doors, pushed, i: map!.doors!.findIndex((d) => d.node === 'bdoor_4') };
  }

  it('an own use, with no room: Open door pushed on the own body one game frame after the press', () => {
    const { doors, pushed, i } = page();
    expect(doors.use(i)).toBe(true);
    expect(pushed).toEqual([]);
    for (let k = 0; k < frames(1); k++) doors.frame(TICK);
    expect(pushed).toEqual([OPEN_DOOR_TYPE]);
  });

  it("a swing followed from the room's snapshot pushes none here: the room's `motion` event carries it", () => {
    const { doors, pushed } = page({ role: 'player', send: () => undefined, lastSeq: () => 0, doors: () => [{ valve: 0, phase: 0 }, { valve: 0, phase: 255 }, { valve: 0, phase: 255 }] });
    doors.frame(TICK);
    doors.frame(TICK);
    expect(pushed).toEqual([]);
  });
});

describe('a pushed motion on a remote body (stepFlinch, pushed)', () => {
  const clips = {
    clips: [{ name: 'seal_open_door', frameCount: 14 }, { name: 'ladder_climb', frameCount: 10 }],
    table: [['seal_open_door', { playback: 0.8 }]],
  } as unknown as PlayClips;
  type Snap = Parameters<typeof stepFlinch>[1];
  const ground = (over: Partial<Snap> = {}): Snap => ({ alive: true, traversal: null, action: null, ...over }) as Snap;

  it("plays over the body's play on the one-shot clock, and is not dropped by the flinch's gate (no FUN_005a2690 for an ANIMATE push)", () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0, pushed: true as const } };
    const s = ground({ action: { name: 'swapStand', serial: 1, t: 0, seconds: 1, reversed: false } as Snap['action'] });
    stepFlinch(r, s, 0.1, clips);
    expect(r.flinch).toMatchObject({ clip: 'seal_open_door', t: 0.1 });
    expect(s.traversal).toMatchObject({ clip: 'seal_open_door', loop: false });
  });

  it('played through: gone', () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0.7, pushed: true as const } };
    const s = ground();
    stepFlinch(r, s, 0.2, clips);
    expect(r.flinch).toBeNull();
  });

  // LATER 512: another's flinch the door push covered (`pushMotion` keeps it, its time frozen) is played on from that time
  // when the door clip has run or been cut; what pops the stack to its base takes both.
  const flinchClips = {
    clips: [{ name: 'seal_open_door', frameCount: 14 }, { name: 'seal_flinch_rarm', frameCount: 20 }],
    table: [['seal_open_door', { playback: 0.8 }], ['seal_flinch_rarm', { playback: 1 }]],
  } as unknown as PlayClips;
  it('RED: LATER 512 -- the covered flinch is played on from its frozen time when the door clip has run', () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0.7, pushed: true as const }, under: { clip: 'seal_flinch_rarm', t: 0.2 } } as Parameters<typeof stepFlinch>[0];
    const s = ground();
    stepFlinch(r, s, 0.2, flinchClips);
    expect(r.flinch).toEqual({ clip: 'seal_flinch_rarm', t: 0.2 });                   // today: null
    expect(s.traversal).toMatchObject({ clip: 'seal_flinch_rarm' });
  });
  it('RED: LATER 512 -- a pop to the base (a knock) takes the covered flinch too', () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0.1, pushed: true as const }, under: { clip: 'seal_flinch_rarm', t: 0.2 } } as Parameters<typeof stepFlinch>[0];
    const s = ground({ action: { name: 'fallForward', serial: 1, t: 0, seconds: 1, reversed: false } as Snap['action'] });
    stepFlinch(r, s, 0.1, flinchClips);
    expect(r.flinch).toBeNull();
    expect((r as { under?: unknown }).under ?? null).toBeNull();                       // today: the under kept
  });
  it('RED: LATER 512 -- pushOver: a door push over a flinch keeps it under, over a push keeps the one below both, over nothing none', () => {
    const pushOver = (remote as unknown as { pushOver?: (r: { flinch: unknown; under?: unknown }, clip: string) => void }).pushOver;
    expect(typeof pushOver).toBe('function');                                         // today: absent
    const r: { flinch: unknown; under?: unknown } = { flinch: { clip: 'seal_flinch_rarm', t: 0.3 } };
    pushOver!(r, 'seal_open_door');
    expect(r).toEqual({ flinch: { clip: 'seal_open_door', t: 0, pushed: true }, under: { clip: 'seal_flinch_rarm', t: 0.3 }, coverLand: null });
    const q: { flinch: unknown; under?: unknown } = { flinch: null };
    pushOver!(q, 'seal_open_door');
    expect(q.under ?? null).toBeNull();
    pushOver!(r, 'seal_open_door');                                                   // the review's F6: a push over the push
    expect(r).toEqual({ flinch: { clip: 'seal_open_door', t: 0, pushed: true }, under: { clip: 'seal_flinch_rarm', t: 0.3 }, coverLand: null });
  });

  // LATER 512's review F2: a landing that plays a clip pops the stack to its base (`FUN_0058a5e0` D:L466897, research 92
  // section 4) -- the room's `flinchLanding` and the page's `flinchDown` drop the door clip and the flinch together; the
  // remote copy too (its snapshot's `landing`, a clip, not `landedBare`).
  // The folds' re-look, its blocker: the snapshot's `landing` is a lasting state (the last landing since the feet left the
  // floor, `Walker.landing`), not the landing's tick -- a NEW landing that plays a clip is a landing action (`land`,
  // `landHard`, `hit`, `hitStomach`) whose serial is not the one playing at the push (`pushOver`'s `coverLand`).
  it('RED: LATER 512 F2 -- a soft landing held across frames before the push keeps the door clip (a state, not an event)', () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0.1, pushed: true as const }, under: { clip: 'seal_flinch_rarm', t: 0.2 } } as Parameters<typeof stepFlinch>[0];
    for (let k = 0; k < 3; k++) stepFlinch(r, ground({ landing: 'soft' } as Partial<Snap>), 0.05, flinchClips);
    expect(r.flinch).toMatchObject({ clip: 'seal_open_door', pushed: true });       // today: dropped at once
  });
  it('RED: LATER 512 F2 -- a landing clip begun before the push keeps the door clip; a new one (another serial) takes both', () => {
    const land = (serial: number): Snap['action'] => ({ name: 'land', serial, t: 0, seconds: 0.5, reversed: false }) as Snap['action'];
    const r = { flinch: { clip: 'seal_open_door', t: 0.1, pushed: true as const }, under: { clip: 'seal_flinch_rarm', t: 0.2 }, coverLand: 3 } as Parameters<typeof stepFlinch>[0];
    stepFlinch(r, ground({ landing: 'soft', action: land(3) } as Partial<Snap>), 0.05, flinchClips);
    expect(r.flinch).toMatchObject({ clip: 'seal_open_door' });                     // the landing playing at the push
    stepFlinch(r, ground({ landing: 'soft', action: land(4) } as Partial<Snap>), 0.05, flinchClips);
    expect(r.flinch).toBeNull();                                                     // a new landing clip pops the stack
    expect((r as { under?: unknown }).under ?? null).toBeNull();
  });
  it('LATER 512 F2 -- the landing clip playing at the push, held across frames after it (its serial unchanged), keeps the door clip', () => {
    const land: Snap['action'] = { name: 'land', serial: 3, t: 0, seconds: 0.5, reversed: false } as Snap['action'];
    const r = { flinch: { clip: 'seal_open_door', t: 0.1, pushed: true as const }, under: { clip: 'seal_flinch_rarm', t: 0.2 }, coverLand: 3 } as Parameters<typeof stepFlinch>[0];
    for (let k = 0; k < 4; k++) stepFlinch(r, ground({ landing: 'soft', action: land } as Partial<Snap>), 0.05, flinchClips);
    expect(r.flinch).toMatchObject({ clip: 'seal_open_door', pushed: true });
  });
  it("LATER 512 F2 -- pushOver records the landing clip playing at the push (`coverLand`), none when none plays", () => {
    const r: { flinch: unknown; under?: unknown; coverLand?: unknown } = { flinch: null };
    (remote as unknown as { pushOver(r: unknown, clip: string, coverLand?: number | null): void }).pushOver(r, 'seal_open_door', 7);
    expect(r.coverLand).toBe(7);
  });
});

// LATER 512 (research 92 section 4; the folds' re-look): the door play's state is its `ai::ANIMATE` command's byte +0x21
// (`FUN_005d2f30` D:L487194, the third argument of `FUN_00588bc0`), 0 on every door program on the disc -- so a climb
// started under a door clip pops to one play, the covered flinch with it. A dev-disc test: skipped without SOCOM_DISC.
const DISC = process.env.SOCOM_DISC;
describe.skipIf(!DISC)(`LATER 512: the door programs' ai::ANIMATE byte +0x21${DISC ? '' : ' (SOCOM_DISC absent)'}`, () => {
  it('is 0 on every door program of every MP*.ZDB (the opens and the kicks), 29 commands on 9 maps', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { parseZdb, Zar, zdbMember } = await import('@s2u/archive');
    const { parseAnimSets } = await import('@s2u/scene');
    const { ACTION_TYPE_CODES, readActionRecords } = await import('../src/mapActions');
    const run = join(DISC!, 'RUN');
    let commands = 0, maps = 0;
    const programs = new Set<string>();
    const bytes21: number[] = [];
    for (const f of readdirSync(run).filter((n) => /^MP\d+\.ZDB$/i.test(n))) {
      const data = new Uint8Array(readFileSync(join(run, f)));
      const toc = parseZdb(data);
      const { records, error } = readActionRecords(data, toc);
      if (error !== undefined) continue;
      const names = new Set(records.filter((r) => r.typeCode === ACTION_TYPE_CODES.DOOR).flatMap((r) => r.anims.map((a) => a.toLowerCase())));
      if (names.size === 0) continue;
      maps++;
      const anims = parseAnimSets(Zar.parse(zdbMember(data, toc, 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims);
      for (const a of anims) {
        if (!names.has(a.name.toLowerCase())) continue;
        programs.add(`${f}:${a.name.toLowerCase()}`);
        for (const s of a.sequences) for (const c of s.commands) if (c.set === 2 && c.cmd === 20) { commands++; bytes21.push(c.bytes[0x21]!); }
      }
    }
    expect(maps).toBe(9);
    expect(programs.size).toBe(16);                                                  // the fix's re-look (1): 92 section 4's count
    expect(commands).toBe(29);
    expect(new Set(bytes21)).toEqual(new Set([0]));
  });
});

describe("the clip's NoInterrupt (motion.rdr 0.5) in the stick's cut window", () => {
  it('noInterruptCommands: the first command whose one-shot phase is strictly past 0.5 -- 23 for seal_open_door (0.8 s, 14 keys); 0 with none', () => {
    expect(noInterruptCommands(0.8, 14, 0.5)).toBe(23);           // 0.5 x 0.8 x 13/14 x 60 = 22.29 -> the 23rd command
    expect(noInterruptCommands(0.8, 25, null)).toBe(0);
    expect(noInterruptCommands(0.8, 25, 0)).toBe(0);
  });

  it('flinchCutAt honours cutFrom: a stick before it does not cut, at or past it does, inside the window', () => {
    const w = { start: 100, until: 142, cutFrom: 123 };
    expect(flinchCutAt(w, 105)).toBe(false);                      // past FLINCH_CUT_COMMANDS, before NoInterrupt
    expect(flinchCutAt(w, 122)).toBe(false);
    expect(flinchCutAt(w, 123)).toBe(true);
    expect(flinchCutAt(w, 141)).toBe(true);
    expect(flinchCutAt(w, 142)).toBe(false);
    expect(flinchCutAt({ start: 100, until: 142 }, 105)).toBe(true);   // a flinch: no NoInterrupt, as before
  });
});

describe("the walk's own pushed clip: drawn as a flinch is, without the reload gate or the flinch's own gate", () => {
  const canvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    return c;
  };
  const pose = () => ({ clip: 'seal_open_door', frame: 3, loop: false, rootY: null });

  it('setFlinchPose with reloadGate false: flinching() stays false while the pose plays; a flinch after it holds the gate', () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    walk.setFlinchPose(pose, null, { reloadGate: false, pushed: true });
    expect(walk.flinching()).toBe(false);
    walk.setFlinchPose(() => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null }));
    expect(walk.flinching()).toBe(true);
  });

  // FUN_005a2690's gate (`flinchRefused`: a swap among its refusals, D:L460005-460010) is the flinch's; an ANIMATE push
  // goes through FUN_00588bc0 alone (D:L487256-487260), so the own body draws it over a swap where a flinch is dropped.
  it("a pushed pose is drawn over the body's swap (snapshot), where a flinch's is dropped", () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const floor: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    };
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    walk.setGround(packGround(params, [floor], owners), null);
    expect(walk.respawn([0, 0, 0], 0)).toBe(true);
    walk.walkFor(30 * TICK, { forward: 0, right: 0, boost: false });
    expect(walk.swapWeapon('pistol')).not.toBeNull();
    expect(walk.snapshot()?.action?.name).toBe('swapStand');
    walk.setFlinchPose(pose, null);                                // a flinch: refused over the swap
    expect(walk.snapshot()?.traversal).toBeNull();
    walk.setFlinchPose(pose, null, { reloadGate: false, pushed: true });
    expect(walk.snapshot()?.traversal).toMatchObject({ clip: 'seal_open_door' });
    walk.unbindKey();
  });
});

// Review of #485, F2: the door clip's window is the walk's one-shot slot, so the fall's cover and the clipless landing's
// hand-back (PAR-65, PAR-71) apply to it -- but the hand-back must not turn the reload's gate back on: the push set no
// motion flag 0x4 (FUN_005b4340 D:L469494-469504), and the room takes the reload. A flinch in the same place is refused.
describe("F2: a door clip covered by a fall and handed back by a clipless landing gates no reload", () => {
  const canvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    return c;
  };
  const pose = () => ({ clip: 'seal_open_door', frame: 3, loop: false, rootY: null });
  /** A walk whose commands 99-102 have run: in the air from before 100, landed with no clip on 102. */
  function handedBack(opts: { reloadGate?: boolean; pushed?: boolean }): WalkMode {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[] };
    w.taps = 102;
    w.cutLog.push(
      { seq: 99, push: false, air: true, bare: false }, { seq: 100, push: false, air: true, bare: false },
      { seq: 101, push: false, air: true, bare: false }, { seq: 102, push: false, air: false, bare: true },
    );
    walk.setFlinchPose(pose, { start: 100, until: 142, cutFrom: 123 }, opts);
    return walk;
  }

  it('the door clip (reloadGate false): flinching() false after the hand-back -- the reload goes through, as in the room', () => {
    expect(handedBack({ reloadGate: false, pushed: true }).flinching()).toBe(false);
  });

  it('a flinch in the same place (the control): handed back, it refuses the reload', () => {
    expect(handedBack({}).flinching()).toBe(true);
  });
});

// LATER 363 (research 92 section 4, "A flinch under the push"; PTW.R3 with `room.ts` `flinchUncover`): the door push
// covers the own flinch without popping it, so the push's pop -- its window's end, or the stick's cut -- hands the flinch
// back with its 0x4: `flinching()` refuses the reload for the commands it had left at the push (`flinchLanded`'s count).
describe("LATER 363: the walk's flinch under its door clip is handed back at the push's pop", () => {
  const canvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    return c;
  };
  const door = () => ({ clip: 'seal_open_door', frame: 3, loop: false, rootY: null });
  const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
  /** A flinch (90-130) told at command 95, then the door push 101-143 (cut from 124) told once commands to `ran` had run. */
  function underDoor(ran: number, push: (seq: number) => boolean): WalkMode {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[] };
    w.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    expect(walk.flinching()).toBe(true);
    w.taps = ran;
    for (let seq = 96; seq <= ran; seq++) w.cutLog.push({ seq, push: push(seq), air: false, bare: false });
    walk.setFlinchPose(door, { start: 101, until: 143, cutFrom: 124 }, { reloadGate: false, pushed: true });
    return walk;
  }
  const set = (walk: WalkMode, taps: number): WalkMode => { (walk as unknown as { taps: number }).taps = taps; return walk; };
  const set143 = (walk: WalkMode): boolean => set(walk, 143).flinching();

  it('RED: played through -- from the pop (143) for the 29 commands it had left at the push (101): refused, then taken', () => {
    expect(set(underDoor(142, () => false), 142).flinching(), 'under the door clip').toBe(false);
    expect(set(underDoor(143, () => false), 143).flinching(), 'the pop: the flinch on top again').toBe(true);   // today: false
    expect(set(underDoor(143, () => false), 171).flinching(), 'its last command left').toBe(true);
    expect(set(underDoor(143, () => false), 172).flinching(), 'past it').toBe(false);
  });

  // LATER 363's review F1: a pop of the stack to its base takes the covered flinch with the door clip, on the page as in
  // the room -- a landing with a clip (`flinchDown`, already), a knock, a ladder's mount (`stackPopped`).
  it("LATER 363's review F1 (the room's agreement): a landing with a clip under the covered door clip leaves no flinch", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[] };
    w.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    w.taps = 112;
    for (let seq = 96; seq <= 112; seq++) w.cutLog.push({ seq, push: false, air: seq >= 105 && seq < 112, bare: false });
    walk.setFlinchPose(door, { start: 101, until: 143, cutFrom: 124 }, { reloadGate: false, pushed: true });
    for (const t of [112, 143, 150]) expect(set(walk, t).flinching(), `${t}`).toBe(false);
  });
  for (const pop of ['knock', 'ladder'] as const) {
    it(`RED: LATER 363's review F1 -- a ${pop} under the door clip pops the flinch with it: none handed back at the door's end`, () => {
      const walk = underDoor(110, () => false);
      (walk as unknown as { stackPopped(p: string, n: number): void }).stackPopped(pop, 110);
      const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[]; flinchStep(e: unknown): void };
      for (let seq = 111; seq <= 143; seq++) { const e = { seq, push: false, air: false, bare: false }; w.cutLog.push(e); w.taps = seq; w.flinchStep(e); }
      expect(set(walk, 143).flinching()).toBe(false);              // today: true
    });
  }

  // LATER 512 (research 92 section 4, "LATER 512's reading"): the handed-back flinch is drawn again from the phase it had
  // reached at the push -- its pose's clock set to the commands it had run (101 - 90) -- not the wall clock's.
  it('RED: LATER 512 -- handed back at the pop, the flinch is drawn again, its clock set to the phase it reached at the push', () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[]; flinchPose: unknown };
    const set: number[] = [];
    const pose = Object.assign(() => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null }), { at: (s: number) => { set.push(s); } });
    w.taps = 95;
    walk.setFlinchPose(pose, { start: 90, until: 130 });
    w.taps = 143;
    for (let seq = 96; seq <= 143; seq++) w.cutLog.push({ seq, push: false, air: false, bare: false });
    walk.setFlinchPose(door, { start: 101, until: 143, cutFrom: 124 }, { reloadGate: false, pushed: true });
    expect(walk.flinching()).toBe(true);
    expect(w.flinchPose, 'the flinch drawn again').toBe(pose);                           // today: null
    expect(set).toEqual([(101 - 90) / 60]);
  });
  // LATER 512's review F1: on a slow link the push's event arrives after its pop has run (replayed from the walk's log):
  // the flinch has played on since the pop, so its clock is the phase at the push plus the commands since the pop.
  it('RED: LATER 512 F1 -- a push event arriving after its pop (150, the pop at 143): the clock adds the commands since the pop', () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[]; flinchPose: unknown };
    const set: number[] = [];
    const pose = Object.assign(() => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null }), { at: (s: number) => { set.push(s); } });
    w.taps = 95;
    walk.setFlinchPose(pose, { start: 90, until: 130 });
    w.taps = 150;
    for (let seq = 96; seq <= 150; seq++) w.cutLog.push({ seq, push: false, air: false, bare: false });
    walk.setFlinchPose(door, { start: 101, until: 143, cutFrom: 124 }, { reloadGate: false, pushed: true });
    expect(w.flinchPose).toBe(pose);
    expect(set).toEqual([((101 - 90) + (150 - 143)) / 60]);                           // today: (101 - 90) / 60
  });

  it("RED: LATER 512 -- the mount's take pops the stack to its base: a covered flinch goes with the door clip", () => {
    const walk = underDoor(110, () => false);
    (walk as unknown as { mountTake(): void }).mountTake();
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[]; flinchStep(e: unknown): void };
    for (let seq = 111; seq <= 143; seq++) { const e = { seq, push: false, air: false, bare: false }; w.cutLog.push(e); w.taps = seq; w.flinchStep(e); }
    expect(set143(walk)).toBe(false);                                                   // today: true
  });
  // LATER 523 (research 215 section 8.6, "The flinch at the take"): the take runs `FUN_0058c350` (D:L447964-447965), whose
  // `FUN_0058a5e0(actor, 0, 1)` (D:L447984) pops every play (D:L446796-446798) -- the flinch on top too, not only the one a
  // door clip covers: no flinch pose and no reload refusal after the take.
  it("RED: LATER 523 -- the mount's take pops the flinch on top: no pose, no reload refusal", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as { taps: number; flinchPose: unknown; mountTake(): void };
    w.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    expect(walk.flinching(), 'the flinch on top before the take').toBe(true);
    w.mountTake();
    expect(w.flinchPose, 'no flinch pose after the take').toBeNull();                   // today: the flinch's
    expect(walk.flinching(), 'no reload refusal after the take').toBe(false);           // today: true
    for (const t of [100, 129]) expect(set(walk, t).flinching(), `${t}`).toBe(false);
  });
  it("RED: LATER 523 -- a flinch handed back at the door clip's pop (on top again) goes at the take too", () => {
    const walk = underDoor(143, () => false);
    expect(set(walk, 150).flinching(), 'handed back, on top').toBe(true);
    (walk as unknown as { mountTake(): void }).mountTake();
    expect((walk as unknown as { flinchPose: unknown }).flinchPose).toBeNull();          // a plain pose (no `at`): none drawn again
    for (const t of [150, 171]) expect(set(walk, t).flinching(), `${t}`).toBe(false);   // today: true
  });
  // LATER 524 (research 215 section 8.6, "The flinch at the take"; PTW.R3 with `room.ts` `takeMount`'s LATER 523): the page
  // takes the turret at send time, before the command M it names (`./turretPage` `takeOwn` -> `took(m)` ->
  // `WalkMode.mountTake(m)`), but the room's `flinch` event for a hit before M can arrive after it. The take popped every
  // play (`FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` D:L447984; its pops D:L446796-446798), and the room cut its window
  // at M: the page's window (pushed before M) ends there too -- no pose, no clock, and the undo (`./netPage`,
  // `reloadInFlinch` on the answer) refuses no reload from M. A flinch pushed at or after M stands (whether the original
  // flinches a mounted body is unread; the room holds one), and the kept M goes at the mount's end.
  type Taken = { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[]; flinchPose: unknown; mountTake(m?: number): void };
  /** A walk whose commands 96-`ran` have run, taken by its turret before command 120 (sent after command 119). */
  function taken(ran: number): { walk: WalkMode; w: Taken } {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as Taken;
    w.taps = 119;
    w.mountTake(120);
    w.taps = ran;
    for (let seq = 96; seq <= ran; seq++) w.cutLog.push({ seq, push: false, air: false, bare: false });
    return { walk, w };
  }
  it("RED: LATER 524 -- a flinch pushed before the take (90-130), told after it (M 120): no pose, no refusal from M", () => {
    const { walk, w } = taken(125);
    const end = walk.setFlinchPose(flinch, { start: 90, until: 130 });
    expect(w.flinchPose, 'no flinch pose after the take').toBeNull();                    // today: the flinch's
    expect(walk.flinching(), 'no reload refusal after the take').toBe(false);           // today: true (its clock)
    expect(end, "the window's end the undo reads: the take's M").toBe(120);              // today: null (the event's 130)
    // `./netPage`'s undo on the answer: a reload named before M was the room's to refuse, one from M is not.
    expect(reloadInFlinch(110, { from: 90, until: end ?? 130 })).toBe(true);
    expect(reloadInFlinch(122, { from: 90, until: end ?? 130 })).toBe(false);           // today: true
  });
  it("RED: LATER 524 -- a window that ended before the take anyway (80-110): nothing runs, the event's end stands", () => {
    const { walk, w } = taken(125);
    expect(walk.setFlinchPose(flinch, { start: 80, until: 110 })).toBeNull();
    expect(w.flinchPose).toBeNull();                                                     // today: the flinch's
    expect(walk.flinching()).toBe(false);                                                // today: true (its clock)
  });
  it("LATER 524 (a pin) -- the stick's cut before M (at 112) stands as the window's end, before the take's", () => {
    const { walk, w } = taken(125);
    w.cutLog.find((e) => e.seq === 112)!.push = true;
    expect(walk.setFlinchPose(flinch, { start: 90, until: 130, cutFrom: 95 })).toBe(112);
    expect(w.flinchPose).toBeNull();
    expect(walk.flinching()).toBe(false);
  });
  // The review's F1: an in-air push (100-130) handed back by a clipless landing at 105 (window 105-125), the event heard
  // after 125 -- the replay ends it by `flinchEnded` (125) with no window left; the end answered is M's (120), not 125.
  it("RED: LATER 524 fold F1 -- an in-air push (100-130), a clipless landing at 105, M 120, the event after 125: the end is 120", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const w = walk as unknown as Taken;
    w.taps = 119;
    w.mountTake(120);
    w.taps = 126;
    for (let seq = 96; seq <= 126; seq++) w.cutLog.push({ seq, push: false, air: seq >= 99 && seq < 105, bare: seq === 105 });
    const end = walk.setFlinchPose(flinch, { start: 100, until: 130 });
    expect(w.flinchPose).toBeNull();
    expect(end, "the take's M, not the handed-back window's end").toBe(120);              // today: 125
  });
  it("LATER 524 (a pin) -- a flinch pushed at or after the take's M (124-160) is kept: pose and refusal as before", () => {
    const { walk, w } = taken(126);
    expect(walk.setFlinchPose(flinch, { start: 124, until: 160 })).toBeNull();
    expect(w.flinchPose).toBe(flinch);
    expect(walk.flinching()).toBe(true);
    const at = taken(126);
    expect(at.walk.setFlinchPose(flinch, { start: 120, until: 160 })).toBeNull();      // pushed at M itself: the room's own
    expect(at.walk.flinching()).toBe(true);
  });
  it("LATER 524 (pins) -- the kept M goes at the mount's end: a release, a death and spawn, a new numbering", () => {
    const ends: [string, (walk: WalkMode) => void][] = [
      ['release', (walk) => { walk.setLocked(true); walk.setLocked(false); }],
      ['death and spawn', (walk) => { walk.setDeathPose(() => null); walk.setDeathPose(null); }],
      ['a new numbering', (walk) => { walk.setNetTap(null, 99); }],
    ];
    for (const [name, end] of ends) {
      const { walk, w } = taken(125);
      end(walk);
      w.taps = 105;
      expect(walk.setFlinchPose(flinch, { start: 100, until: 140 }), name).toBeNull();
      expect(w.flinchPose, name).toBe(flinch);
      expect(walk.flinching(), name).toBe(true);
    }
  });
  // LATER 525 (research 215 section 8.6, "The flinch at the take" and "A1"): the room may refuse the worded take on its own
  // terms (`room.ts` `takeMount`: dead, the round over, a knock-down fall; `FUN_005463c0` D:L412134-412139) and then cuts
  // no flinch -- the body never ran `FUN_0058c350`. The page took at send time (`mountTake(m)`: the flinch ended, M kept),
  // so its refusal (`./turretPage` `untook` -> `WalkMode.mountUntake`) hands back what the take ended and clears M: the
  // flinch on the page at the take, and a pre-M flinch event heard between the take and the refusal, run as the room's.
  type Untaken = Taken & { flinchCut: { start: number; until: number } | null; mountUntake(): void };
  it("RED: LATER 525 -- a pre-M flinch (90-130) heard between the take (M 120) and the room's refusal: not cut once the refusal arrives", () => {
    const { walk, w } = taken(125);
    expect(walk.setFlinchPose(flinch, { start: 90, until: 130 })).toBe(120);           // LATER 524: cut at M while taken
    const u = w as Untaken;
    u.mountUntake();
    expect(u.flinchPose, "the pose as the room's").toBe(flinch);                         // today: null
    expect(walk.flinching(), 'the reload refused, as in the room').toBe(true);           // today: false
    expect(u.flinchCut, "the room's window, uncut").toEqual({ start: 90, until: 130 });
  });
  it("RED: LATER 525 -- a flinch on the page at the take (90-130, told at 95; M 120), the take refused: the flinch restored", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const u = walk as unknown as Untaken;
    u.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    u.taps = 119;
    u.mountTake(120);
    expect([u.flinchPose, walk.flinching()]).toEqual([null, false]);                    // LATER 523: popped at the take
    for (let seq = 96; seq <= 122; seq++) u.cutLog.push({ seq, push: false, air: false, bare: false });
    u.taps = 122;
    u.mountUntake();
    expect(u.flinchPose).toBe(flinch);                                                    // today: null
    expect(walk.flinching()).toBe(true);                                                  // today: false
    expect(u.flinchCut).toEqual({ start: 90, until: 130 });
  });
  it("RED: LATER 525 -- the refusal clears M: a pre-M flinch heard after it is kept whole", () => {
    const { walk, w } = taken(125);
    (w as Untaken).mountUntake();
    expect(walk.setFlinchPose(flinch, { start: 100, until: 140 })).toBeNull();          // today: 120
    expect(w.flinchPose).toBe(flinch);
    expect(walk.flinching()).toBe(true);
  });
  it("RED: LATER 525 -- the restored flinch keeps its stick cut on the commands run since the take (at 123: cut from 95)", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const u = walk as unknown as Untaken;
    u.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130, cutFrom: 95 } as never);
    u.taps = 119;
    u.mountTake(120);
    for (let seq = 96; seq <= 125; seq++) u.cutLog.push({ seq, push: seq === 123, air: false, bare: false });
    u.taps = 125;
    u.mountUntake();
    expect([u.flinchPose, walk.flinching()], "the stick's cut at 123 ended it, as the room's mover did").toEqual([null, false]);
  });
  it('LATER 525 (pins) -- no take, or a take that ended (a release, a death, a new numbering): mountUntake hands nothing back', () => {
    const none = new WalkMode(new FlyCamera(canvas()), () => undefined);
    (none as unknown as Untaken).mountUntake();
    expect((none as unknown as Untaken).flinchPose).toBeNull();
    const ends: [string, (walk: WalkMode) => void][] = [
      ['release', (walk) => { walk.setLocked(true); walk.setLocked(false); }],
      ['death and spawn', (walk) => { walk.setDeathPose(() => null); walk.setDeathPose(null); }],
      ['a new numbering', (walk) => { walk.setNetTap(null, 99); }],
    ];
    for (const [name, end] of ends) {
      const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
      const u = walk as unknown as Untaken;
      u.taps = 95;
      walk.setFlinchPose(flinch, { start: 90, until: 130 });
      u.taps = 119;
      u.mountTake(120);
      end(walk);
      u.mountUntake();
      expect([u.flinchPose, walk.flinching()], name).toEqual([null, false]);
    }
  });
  // LATER 526 (step 5; research 92 section 4, "A flinch under the push"; PTW.R3 with `room.ts` `flinchUncover`): a door
  // push the room pushed at or after M, heard while the take waits, covers the flinch the take ended -- the room never took
  // (`FUN_005463c0` D:L412134-412139), so its flinch was open at the push's first command and the push covers it, as a push
  // covers a flinch on foot (LATER 363). Was: the push dropped the kept flinch, so the refusal handed none back under it.
  it("RED: LATER 526 -- a door push (121-160) heard during the wait (M 120) covers the kept flinch (90-130) at the refusal", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const u = walk as unknown as Untaken & { flinchUnder: unknown };
    u.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    u.taps = 119;
    u.mountTake(120);
    for (let seq = 96; seq <= 122; seq++) u.cutLog.push({ seq, push: false, air: false, bare: false });
    u.taps = 122;
    walk.setFlinchPose(door, { start: 121, until: 160, cutFrom: 140 }, { reloadGate: false, pushed: true });
    for (let seq = 123; seq <= 124; seq++) u.cutLog.push({ seq, push: false, air: false, bare: false });
    u.taps = 124;
    u.mountUntake();
    expect(u.flinchPose, 'the push on top').toBe(door);
    expect(u.flinchUnder, 'the kept flinch covered at the push').toEqual({ cut: { start: 90, until: 130 }, at: 121, pose: flinch });   // today: null
    expect(walk.flinching(), 'under the push: no reload refusal').toBe(false);
  });
  // LATER 530 (F6 of LATER 526's review: two or more events heard in the wait; a pin of the path with no re-run). These pins
  // drive a bare WalkMode with no walker, so `rerunFrom` runs nothing and `mountUntake` takes its fallback; in a match a
  // walker always exists, and the refusal's re-run lays each event at its window's first command inside it (LATER 549,
  // `layHeard`; pinned in LATER 526's rig, 'LATER 549 review F2'). On the fallback each event the
  // take kept is laid at the refusal in the order heard (`WalkMode.mountUntake`'s `heard`), but only the first against the
  // kept flinch stepped to its own hearing (`stepTo(h.taps)`); after it `at` is the refusal's command, so a later one is
  // laid at the refusal's command, its own window replayed over the commands already run (`setFlinchPose`, PAR-71). Two door
  // pushes at or after M (121-140 heard after 122, 125-170 heard after 126): the first covers the kept flinch (90-130) at
  // 121 (LATER 363), the second covers the first and keeps the flinch below both -- the room's `doorMotion` alike ("a push
  // over a push keeps the flinch below both": its cover is taken only from a flinch on top, `flinchGatesReload`).
  it("LATER 530 (a pin) -- two door pushes heard during the wait: laid in order at the refusal, the kept flinch below both", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const u = walk as unknown as Untaken & { flinchUnder: unknown };
    const door2 = () => ({ clip: 'seal_open_door', frame: 4, loop: false, rootY: null });
    u.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    u.taps = 119;
    u.mountTake(120);
    const ran = (to: number): void => { for (let seq = (u.cutLog.at(-1)?.seq ?? 95) + 1; seq <= to; seq++) u.cutLog.push({ seq, push: false, air: false, bare: false }); u.taps = to; };
    ran(122);
    walk.setFlinchPose(door, { start: 121, until: 140, cutFrom: 135 }, { reloadGate: false, pushed: true });
    ran(126);
    walk.setFlinchPose(door2, { start: 125, until: 170, cutFrom: 160 }, { reloadGate: false, pushed: true });
    ran(128);
    const kept = (walk as unknown as { takeKept: { heard: { taps: number }[] } }).takeKept;
    expect(kept.heard.map((h) => h.taps), 'both kept, with the command each was heard after').toEqual([122, 126]);
    u.mountUntake();
    expect(u.flinchPose, 'the second push on top').toBe(door2);
    expect(u.flinchCut, 'its window as the room pushed it').toEqual({ start: 125, until: 170, cutFrom: 160 });
    expect(u.flinchUnder, 'the kept flinch below both, covered at the first push').toEqual({ cut: { start: 90, until: 130 }, at: 121, pose: flinch });
    expect(walk.flinching(), 'under the pushes: no reload refusal').toBe(false);
  });
  // LATER 549's review F1: the flinch pushed at or after M no longer drops what the take kept; it is kept as heard and laid
  // over it at the refusal (here, with no re-run, after the door push), its pop to the base replacing both: the end state
  // is LATER 530's.
  it("LATER 530 (a pin; no re-run) -- a flinch heard during the wait that the take did not cut (pushed at or after M) replaces what the take kept: it stands at the refusal", () => {
    const walk = new WalkMode(new FlyCamera(canvas()), () => undefined);
    const u = walk as unknown as Untaken;
    const flinch2 = () => ({ clip: 'seal_flinch_larm', frame: 2, loop: false, rootY: null });
    u.taps = 95;
    walk.setFlinchPose(flinch, { start: 90, until: 130 });
    u.taps = 119;
    u.mountTake(120);
    for (let seq = 96; seq <= 124; seq++) u.cutLog.push({ seq, push: false, air: false, bare: false });
    u.taps = 122;
    walk.setFlinchPose(door, { start: 121, until: 140, cutFrom: 135 }, { reloadGate: false, pushed: true });
    u.taps = 124;
    walk.setFlinchPose(flinch2, { start: 123, until: 160 });                         // pops to the base (D:L460018): supersedes
    const kept = (walk as unknown as { takeKept: { flinch: unknown; heard: { taps: number }[] } }).takeKept;
    expect([kept.flinch !== null, kept.heard.map((h) => h.taps)], "LATER 549's review F1: the take's flinch kept, both events heard").toEqual([true, [122, 124]]);
    u.mountUntake();
    expect([u.flinchPose, u.flinchCut], 'the flinch at or after M stands, as heard').toEqual([flinch2, { start: 123, until: 160 }]);
    expect(walk.flinching()).toBe(true);
  });
  // LATER 525 (a) (research 215 section 8.6, "The flinch at the take" and "A1"; PTW.R3 with `room.ts` `takeMount`): the
  // room may take the body later than the page's M -- a late word (`room.ts` `mountWord`, `r.m = Math.max(m, p.sim.seq + 1)`)
  // or the bound (`resolveMounts`, `takeMount(p, p.sim.seq + 1, false)`) -- and its take, `FUN_0058c350` ->
  // `FUN_0058a5e0(actor, 0, 1)` (D:L447984), pops the flinch there: its window ends at its take's command (`steer.after` + 1),
  // not at M (LATER 523's cut, `p.flinchUntil = seq`). The page cut at its own M (LATER 524) and kept a flinch pushed at
  // or after M; once the room's take broadcast names the later command (`./turretPage` `retook` -> `WalkMode.mountRekey`),
  // M is re-keyed there and the events heard since the take are judged again: one pushed in [M, M') is cut at M' (the room
  // cut it), one pushed before M runs on to M' (the room kept it up to there). The room's take is sent after it ran the
  // command before M', which this page sent: the windows ending at M' have run by the re-key.
  type Rekeyed = Untaken & { mountTook: number | null; mountRekey(m: number): { start: number; until: number }[] };
  it("RED: LATER 525 (a) -- a late word: M 120, the room takes at 125; a flinch pushed at 121 (121-160) ends at the room's take", () => {
    const { walk, w } = taken(122);
    expect(walk.setFlinchPose(flinch, { start: 121, until: 160 })).toBeNull();           // at or after M: kept (LATER 524)
    expect(walk.flinching()).toBe(true);
    for (let seq = 123; seq <= 126; seq++) w.cutLog.push({ seq, push: false, air: false, bare: false });
    w.taps = 126;
    const r = w as Rekeyed;
    expect(r.mountRekey(125), "the window as the room's take ends it").toEqual([{ start: 121, until: 125 }]);   // today: no mountRekey
    expect([r.flinchPose, walk.flinching()], 'cut at the room\'s take').toEqual([null, false]);
    expect(r.mountTook, "M re-keyed to the room's take").toBe(125);
  });
  it("RED: LATER 525 (a) -- the bound: M 120, the room takes at 131; a flinch pushed at 124 (124-170) ends at 131, not at the stick's cut at 133", () => {
    const { walk, w } = taken(125);
    expect(walk.setFlinchPose(flinch, { start: 124, until: 170, cutFrom: 126 })).toBeNull();
    for (let seq = 126; seq <= 134; seq++) w.cutLog.push({ seq, push: seq === 133, air: false, bare: false });
    w.taps = 134;
    const r = w as Rekeyed;
    expect(r.mountRekey(131)).toEqual([{ start: 124, until: 131 }]);                        // today: no mountRekey
    expect([r.flinchPose, walk.flinching()]).toEqual([null, false]);
  });
  it("RED: LATER 525 (a) -- a flinch pushed before M (90-130), cut at M 120 on the page, runs on to the room's take (125)", () => {
    const { walk, w } = taken(122);
    expect(walk.setFlinchPose(flinch, { start: 90, until: 130 })).toBe(120);             // LATER 524: cut at the page's M
    for (let seq = 123; seq <= 126; seq++) w.cutLog.push({ seq, push: false, air: false, bare: false });
    w.taps = 126;
    const r = w as Rekeyed;
    expect(r.mountRekey(125), "the room kept it up to its take").toEqual([{ start: 90, until: 125 }]);   // today: no mountRekey
    expect([r.flinchPose, walk.flinching()], 'over by the re-key').toEqual([null, false]);
    const late = taken(122);
    late.walk.setFlinchPose(flinch, { start: 90, until: 130 });
    for (let seq = 123; seq <= 136; seq++) late.w.cutLog.push({ seq, push: false, air: false, bare: false });
    late.w.taps = 136;
    expect((late.w as Rekeyed).mountRekey(135), 'a take past the window: its own end').toEqual([{ start: 90, until: 130 }]);
  });
  it("LATER 525 (a) (pins) -- no take, a re-key at or before M, or after the take ended: nothing judged again, M as it was", () => {
    const none = new WalkMode(new FlyCamera(canvas()), () => undefined) as unknown as Rekeyed;
    expect(none.mountRekey?.(125) ?? [], 'no take').toEqual([]);
    for (const m of [120, 118]) {
      const { walk, w } = taken(122);
      walk.setFlinchPose(flinch, { start: 121, until: 160 });
      const r = w as Rekeyed;
      expect(r.mountRekey?.(m) ?? [], `${m}`).toEqual([]);
      expect([r.flinchPose, walk.flinching(), r.mountTook], `${m}`).toEqual([flinch, true, 120]);
    }
    const { walk, w } = taken(122);
    walk.setLocked(true); walk.setLocked(false);
    expect((w as Rekeyed).mountRekey?.(125) ?? [], 'the hold let go').toEqual([]);
  });
  it("LATER 512 (LATER 363's re-look): a climb's start pops it too (stackPopped 'climb')", () => {
    const walk = underDoor(110, () => false);
    (walk as unknown as { stackPopped(p: string, n: number): void }).stackPopped('climb', 110);
    const w = walk as unknown as { taps: number; cutLog: { seq: number; push: boolean; air: boolean; bare: boolean }[]; flinchStep(e: unknown): void };
    for (let seq = 111; seq <= 143; seq++) { const e = { seq, push: false, air: false, bare: false }; w.cutLog.push(e); w.taps = seq; w.flinchStep(e); }
    expect(set143(walk)).toBe(false);
  });

  it("RED: the stick's cut of the door clip (from its NoInterrupt, 124) hands the flinch back there", () => {
    const walk = underDoor(124, (seq) => seq === 124);
    expect(walk.flinching(), 'the cut: the flinch on top again').toBe(true);                                      // today: false
    expect(set(walk, 152).flinching()).toBe(true);
    expect(set(walk, 153).flinching()).toBe(false);
  });
});

// LATER 512c (research 92 section 4, "LATER 512c's reading"; PTW.R3 with `room.ts`): a stance press is asked of
// `FUN_00552ec0`, which takes it only under a looped top or a stance transition (D:L418927-418930) -- the door clip
// (`seal_open_door`, looped 0) and the flinch it covers are neither, so the request (`actor+0x374`) waits, asked again each
// frame (`FUN_00552d60`), through the door clip and the flinch handed back at its pop, and is taken with the base on top.
// The press pops to one play before its push (D:L442454-442466, D:L442562-442574, D:L442664-442676): nothing is left above
// the base by then, so no door clip is popped by a press.
describe("LATER 512c: a stance press under the door clip (and the flinch below it) waits for both", () => {
  const canvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    return c;
  };
  const GROUND: GroundData = packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
    }],
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
  );
  const door = () => ({ clip: 'seal_open_door', frame: 3, loop: false, rootY: null });
  const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
  /** The page's walk on the floor, settled; `taps` the commands it has run, `to(n)` runs it to command `n`. */
  function rig() {
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
    walk.setMode('walk');
    const taps = (): number => (walk as unknown as { taps: number }).taps;
    const to = (n: number): void => { for (let k = 0; k < 10000 && taps() < n; k++) walk.frame(TICK); };
    const page = (): Walker => walk['walker'] as Walker;
    to(taps() + 10);                                             // settled on the floor
    return { walk, taps, to, page, fly };
  }

  it("RED: LATER 512c -- a crouch pressed under the door clip is kept through it and the flinch handed back, then taken", () => {
    const { walk, taps, to, page } = rig();
    const t = taps();
    walk.setFlinchPose(flinch, { start: t - 5, until: t + 40 });                                        // the flinch, on top
    walk.setFlinchPose(door, { start: t + 1, until: t + 43, cutFrom: t + 24 }, { reloadGate: false, pushed: true });   // the door over it
    walk.setStance('crouch');                                    // pressed for command t + 1, under the door clip
    expect(page().stance, 'under the door clip').toBe('stand');                                       // today: crouch
    expect(walk.stanceIntent(), 'the request kept (actor+0x374)').toBe('crouch');
    to(t + 42);
    expect(page().stance, "the door clip's last command").toBe('stand');
    to(t + 43);
    expect(walk.flinching(), "the door clip's pop: the flinch on top again").toBe(true);
    expect(page().stance, 'under the flinch handed back').toBe('stand');
    to(t + 81);                                                  // its 39 commands left at the push (t + 40 - (t + 1)): t + 43 .. t + 81
    expect(page().stance, "the flinch's last command").toBe('stand');
    to(t + 82);
    expect(page().stance, 'the base on top: taken').toBe('crouch');
    expect(walk.stanceIntent()).toBe('crouch');
  });

  it("RED: LATER 512c -- the flinch alone keeps the press to its last command (research 230 section 5.2.5's stance under a flinch)", () => {
    const { walk, taps, to, page } = rig();
    const t = taps();
    walk.setFlinchPose(flinch, { start: t + 1, until: t + 30 });
    walk.setStance('prone');
    expect(page().stance).toBe('stand');                                                              // today: prone
    to(t + 29);
    expect(page().stance).toBe('stand');
    to(t + 30);
    expect(page().stance).toBe('prone');
  });

  it("LATER 512c (pins) -- no window, or a window already run: the press is taken at once", () => {
    const a = rig();
    a.walk.setStance('crouch');
    expect(a.page().stance, 'no window').toBe('crouch');
    const b = rig();
    const t = b.taps();
    b.walk.setFlinchPose(flinch, { start: t - 40, until: t - 2 });
    b.walk.setStance('crouch');
    expect(b.page().stance, 'a window already run').toBe('crouch');
  });

  // The review's F5 (pins; reading, as the cases above): the fall-covered branch, a door clip alone, the cut's command.
  it("LATER 512c review F5 (pin) -- a flinch the fall covers (`flinchAir`) holds no press: a crouch is taken at once", () => {
    const { walk, taps, page } = rig();
    const t = taps();
    walk.setFlinchPose(flinch, { start: t + 1, until: t + 30 });
    (walk as unknown as { flinchAir: number }).flinchAir = t + 1;                                     // covered from its first command
    walk.setStance('crouch');
    expect(page().stance, 'the fall is the top, not the flinch').toBe('crouch');
  });

  it("LATER 512c review F5 (pin) -- a door clip alone, no flinch under it: the press waits through it and is taken at its end", () => {
    const { walk, taps, to, page } = rig();
    const t = taps();
    walk.setFlinchPose(door, { start: t + 1, until: t + 43, cutFrom: t + 24 }, { reloadGate: false, pushed: true });
    walk.setStance('crouch');
    expect(page().stance, 'under the door clip').toBe('stand');
    to(t + 42);
    expect(page().stance, "the door clip's last command").toBe('stand');
    to(t + 43);
    expect(page().stance, 'its end, nothing under it: taken').toBe('crouch');
  });

  // LATER 543 (research 92 section 4, "LATER 543's reading"; reading, pending review): the original's order -- the gate
  // (`FUN_00551ec0`, entity_pre_tick, D:L418609 -> D:L418875) runs before the stick's cut (`FUN_00550ef0`, entity_tick,
  // D:L418180-418203) each frame, so the press is refused on the cut's frame and taken on the next: the order is the
  // original's; the count is the port's mapping, unread (LATER 546).
  it("LATER 512c review F5 (pin) -- the cut's command: the stick cuts the door clip on command cutFrom, which still holds the press; the next takes it", () => {
    const { walk, taps, to, page, fly } = rig();
    const t = taps();
    walk.setFlinchPose(door, { start: t + 1, until: t + 43, cutFrom: t + 24 }, { reloadGate: false, pushed: true });
    fly.groundWish = () => ({ forward: 1, right: 0, boost: false });
    walk.setStance('crouch');
    to(t + 23);
    expect(page().stance, 'before the cut').toBe('stand');
    to(t + 24);
    expect(page().stance, 'the command the window is cut on (the cut is learned after it ran)').toBe('stand');
    to(t + 25);
    expect(page().stance, 'the command after the cut').toBe('crouch');
  });

  // The review's F1 (OT.R67's prone-pop under a flinch): `popStand`'s contract is no pop while a hit owns the body; the
  // flinch's slot (`oneShotOnTop`) is one, so the pop is the ordinary press, which waits out the window.
  it("RED: LATER 512c review F1 -- the prone-pop under a flinch is not taken: the body stays prone until the window ends", () => {
    const { walk, taps, to, page } = rig();
    walk.setStance('prone');
    to(taps() + 150);                                            // the drop run out, settled prone
    expect(page().stance).toBe('prone');
    const t = taps();
    walk.setFlinchPose(flinch, { start: t + 1, until: t + 30 });
    expect(walk.popStance(), 'no pop under the flinch').toBeNull();                                   // today: 'prone'
    expect(page().stance).toBe('prone');                                                              // today: stand
    walk.setStance('stand');                                     // the ordinary press waits
    expect(page().stance).toBe('prone');
    to(t + 29);
    expect(page().stance).toBe('prone');
    to(t + 30);
    expect(page().stance).toBe('stand');
  });

  // LATER 544 (research 92 section 4, "LATER 544's reading"; reading, pending review): the dive is decided at the press,
  // not by the stance gate -- `FUN_00594cf0` runs `FUN_0057e540` itself when `FUN_00584b00` passes (D:L453387-453389), and
  // `FUN_00584b00` asks no flinch: not already diving (`FUN_00577e40`), `+0xeac`, the water, no swap (`FUN_005a7980`), 30
  // a second (D:L443998) and `FUN_00589900` (D:L446425-446474), whose refusals are the death's bit, a fall or a landing,
  // a top at posture 8 and the slide -- a flinch's play carries the posture word (`FUN_005a2690` D:L460019 -> `FUN_00588bc0`
  // D:L446292 -> `FUN_0028dc90` D:L135204). So a full press while running under a flinch dives, on the page as in the original.
  // (What the dive does to the flinch -- `FUN_0057e540` pops the whole stack, D:L440882-440885 -- is LATER 547.)
  it("LATER 544 (pin) -- a prone press while running under a flinch dives at once (the gate is not asked)", () => {
    const { walk, taps, to, page, fly } = rig();
    fly.groundWish = () => ({ forward: 1, right: 0, boost: false });
    to(taps() + 40);                                             // up to speed
    const s = page().state;
    expect(s.vx * s.vx + s.vz * s.vz, 'moving at 30 a second or more (D:L443998)').toBeGreaterThanOrEqual(900);
    const t = taps();
    walk.setFlinchPose(flinch, { start: t - 2, until: t + 30 });
    walk.setStance('crouch');
    expect(page().stance, 'the ordinary crouch waits under the flinch (LATER 512c)').toBe('stand');
    walk.setStance('prone');
    expect((walk['moves'] as Traversal).inDive(), 'the dive taken under the flinch').toBe(true);
    expect(page().stance).toBe('prone');
  });
});

// LATER 526 (research 215 section 8.6, "A1"; PTW.R3 with `room.ts` `takeMount`): the room refused the take this page made
// at send time (`./turretPage` `untook` -> `WalkMode.mountUntake`) -- `FUN_005463c0` refuses before any of its take's steps
// (D:L412131-412166), so the room's body never ran `FUN_0058c350` (D:L447957-447994): no pop to the base (D:L447983-447992),
// no traversal ended, never placed by the hold. It ran the commands this page sent meanwhile on foot. The page's body is
// put back to the room's: its state as it stood after the command before M (`kept`), the move under way with it, and the
// commands since run again through the room's own rule (`MoverSim`), their predictions not compared (`replayed`).
describe("LATER 526: a refused take's pop and hold placement undone on the walk (the room's body never taken)", () => {
  const canvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    return c;
  };
  /** The floor, and `extra` in the hull with it (LDR-1: a ladder is mounted on the walk's contact with its quad). */
  const groundWith = (extra: readonly WorldPoly[] = []): GroundData => packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
    }, ...extra],
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 },
      ...extra.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i + 1, count: 1 }))],
  );
  const GROUND: GroundData = groundWith();
  type Takes = { mountTake(m?: number): void; mountUntake(replayed?: (after: number) => void): void };
  /**
   * The page's walk with its moves, and the room's mover running every command it sends (it never takes the body).
   * `extra`: polygons the hull holds beside the floor (LATER 560: a ladder's quad). *Was* (before LDR-1): the moves alone
   * saw them, not the ground -- the ladder's mount took nearness to its plane, not a contact.
   */
  function rig(extra: readonly WorldPoly[] = []) {
    const ground = extra.length > 0 ? groundWith(extra) : GROUND;
    const fly = new FlyCamera(canvas());
    const walk = new WalkMode(fly);
    walk.setGround(ground, [0, 0, 0]);
    walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    let wish = { forward: 0, right: 0, boost: false };
    fly.groundWish = () => wish;
    const grid = groundGrid(ground);
    const room = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(ground)));
    room.walker.place(5, 40 - 10, 6);
    const sent: Command[] = [];
    walk.setNetTap((cmd) => { const c = { ...cmd, seq: sent.length + 1 }; sent.push(c); room.apply(c); });
    walk.setMode('walk');
    const page = (): Walker => walk['walker'] as Walker;
    const moves = (): Traversal => walk['moves'] as Traversal;
    const frames = (n = 1): void => { for (let i = 0; i < n; i++) walk.frame(1 / 60); };
    const agree = (what: string): void => {
      const a = page(), b = room.walker;
      for (const k of ['x', 'y', 'z', 'vx', 'vz'] as const) expect(Math.abs(a.state[k] - b.state[k]), `${what}: ${k}`).toBeLessThan(1e-6);
      expect(a.stance, `${what}: the stance`).toBe(b.stance);
      expect(a.action?.name ?? null, `${what}: the action`).toBe(b.action?.name ?? null);
      expect(moves().inDive(), `${what}: the dive`).toBe((room.moves as Traversal).inDive());
    };
    /** The send-time take before the next command (M), the walk locked as the hold locks it (`./turretPage` `setHeld`). */
    const take = (): number => { const m = sent.length + 1; (walk as unknown as Takes).mountTake(m); walk.setLocked(true); return m; };
    /** The room's refusal: the walk's take handed back (`untook`), then the hold let go (`setHeld(null)`). */
    const refuse = (replayed?: (after: number) => void): void => { (walk as unknown as Takes).mountUntake(replayed); walk.setLocked(false); };
    frames(10);                                                  // settled on the floor
    return { walk, room, sent: () => sent, page, moves, frames, agree, take, refuse, setWish: (forward: number) => { wish = { forward, right: 0, boost: false }; } };
  }

  it("RED: LATER 526 (step 1, the pop) -- crouched at the take, refused: crouched again, as the room's body (never stood)", () => {
    const r = rig();
    r.walk.setStance('crouch');
    r.frames(60);
    expect(r.page().stance).toBe('crouch');
    r.agree('crouched before the take');
    r.take();
    expect(r.page().stance, 'the take stood the body (D:L447989)').toBe('stand');
    r.frames(12);                                                // the wait: the room runs the commands on foot, crouched
    r.refuse();
    expect(r.page().stance, "the room's stance").toBe('crouch');                         // today: stand
    r.agree('at the refusal');
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(`after the refusal, frame ${i}`); }
  });

  it("RED: LATER 526 (step 1, the move) -- a dive under way at the take, refused: the dive runs on as the room's", () => {
    const r = rig();
    r.setWish(1);
    for (let i = 0; i < 90; i++) r.frames();
    r.walk.stanceTouch('down');
    for (let i = 0; i < 27 && !r.moves().inDive(); i++) r.frames();
    expect(r.moves().inDive()).toBe(true);
    r.walk.stanceTouch('up');
    r.frames(2);
    r.agree('diving before the take');
    r.take();
    expect(r.moves().inDive(), "the take's pop ended the dive").toBe(false);
    r.frames(4);
    r.refuse();
    expect(r.moves().inDive(), "the room's dive").toBe((r.room.moves as Traversal).inDive());   // today: false against true
    r.agree('at the refusal');
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(`after the refusal, frame ${i}`); }
  });

  it("RED: LATER 526 (step 4, the hold) -- placed by the hold through the wait, refused: at the room's feet, the wait's predictions not compared", () => {
    const r = rig();
    const before = [r.page().state.x, r.page().state.z];
    const m = r.take();
    r.walk.setTurretHold((w) => { w.state.x = 60; w.state.z = 60; });     // the hold's place (`./turretPage` `holdTick`)
    r.frames(8);
    expect([r.page().state.x, r.page().state.z]).toEqual([60, 60]);
    r.walk.setTurretHold(null);
    const replayed: number[] = [];
    r.refuse((after) => replayed.push(after));
    expect([r.page().state.x, r.page().state.z], 'where the room ran the body on foot').toEqual(before);   // today: [60, 60]
    expect(replayed, "the commands from M not compared (`NetClient.replayed`)").toEqual([m - 1]);
    r.agree('at the refusal');
    for (let i = 0; i < 20; i++) { r.frames(); r.agree(`after the refusal, frame ${i}`); }
  });

  // LATER 544 (research 92 section 4, "LATER 544's reading", path 3; reading, pending review): LATER 529's and 530's
  // handed-back clips -- the throw's and the reload's -- never left the original's stack (`FUN_005463c0` refuses before
  // its take's steps, D:L412131-412166; the pop `FUN_0058c350` D:L447983-447992 is in the take block), one-shots there
  // (looped 0), so `FUN_00552ec0` keeps a stance request under them (D:L418927-418930). The page's mover gets its hold back
  // with the state kept after M - 1 (`Walker.saveState`/`restoreState`, LATER 526's re-run) and asks it of the gate
  // (`bodyRefuses` -> `bodyOwner`'s hold): the request waits as on the room's mover, which never took the body.
  for (const clip of ['seal_crouch_reload', 'seal_crouch_throwgrenade'] as const) {
    it(`LATER 544 (pin) -- ${clip} on the mover at a refused take: the stand pressed under it waits through the re-run, as the room's`, () => {
      const r = rig();
      r.walk.setStance('crouch');
      r.frames(60);
      expect(r.page().stance).toBe('crouch');
      expect(r.page().hold(clip), 'the hold on the page').toBe(true);
      expect(r.room.walker.hold(clip), "and on the room's mover").toBe(true);
      r.walk.setStance('stand');                                   // pressed under the hold: a request on both
      r.frames(2);
      expect(r.page().pendingStance).toBe('stand');
      expect(r.room.walker.pendingStance).toBe('stand');
      r.take();
      expect(r.page().holding, "the take's pop (the page's send time)").toBeNull();
      r.frames(6);
      r.refuse();
      expect(r.page().holding?.clip, 'the hold handed back').toBe(clip);
      expect(r.page().stance, 'the request still waits').toBe('crouch');
      expect(r.page().pendingStance).toBe('stand');
      r.agree('at the refusal');
      let taken = -1;
      for (let i = 0; i < 150; i++) {
        r.frames();
        r.agree(`after the refusal, frame ${i}`);
        expect(r.page().pendingStance, `frame ${i}: the request`).toBe(r.room.walker.pendingStance);
        if (r.page().holding !== null) expect(r.page().stance, `frame ${i}: under the hold`).toBe('crouch');
        if (taken < 0 && r.page().stance === 'stand') taken = i;
      }
      expect(taken, 'the stand taken once the hold has run').toBeGreaterThan(0);
    });
  }

  // LATER 549 (research 92 section 4, "LATER 544's reading", path 3; reading, pending review): the room's body never left
  // its flinch -- `FUN_005463c0` refuses before its take's steps (D:L412131-412166) -- so on every command of the wait its
  // window was on top, and `FUN_00552ec0` kept the crouch pressed under it (D:L418927-418930; the room's mover asks
  // `[flinchFrom, flinchUntil)` on `sim.seq`, LATER 512c). The page's re-run (LATER 526's `rerunFrom` from M - 1) must ask
  // the flinch's slot as it stood at each command it runs again, not the live slot the take ended (`taps + 1`).
  it("RED: LATER 549 -- a crouch pressed 18 commands into a 39-command flinch window, the take refused: the re-run keeps it pending, as the room's", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const t = r.sent().length;
    expect((r.walk as unknown as { taps: number }).taps, "the page's numbering is the room's").toBe(t);
    const from = t + 1, until = t + 40;                          // 39 commands
    // The room's flinch slot on its mover (`room.ts`'s `oneShotOnTop`: `[flinchFrom, flinchUntil)` on `sim.seq`).
    r.room.walker.oneShotOnTop = () => r.room.seq >= from && r.room.seq < until;
    const roomRan = new Map<number, { stance: string; pending: string | null }>();
    const apply = r.room.apply.bind(r.room);
    r.room.apply = (c: Command) => {
      const out = apply(c);
      roomRan.set(c.seq, { stance: r.room.walker.stance, pending: r.room.walker.pendingStance });
      return out;
    };
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(17);                                                // the window's commands t + 1 .. t + 17
    r.walk.setStance('crouch');                                  // pressed for command t + 18, the window's 18th
    r.frames(1);
    expect(r.page().stance).toBe('stand');
    expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
    expect(r.room.walker.pendingStance, "and on the room's mover").toBe('crouch');
    const m = r.take();
    r.frames(6);                                                 // the wait: M .. M + 5, the room's body on foot under its flinch
    r.refuse();
    expect(r.page().stance, 'the request still waits under the flinch').toBe('stand');           // today: crouch
    expect(r.page().pendingStance, 'the request kept').toBe('crouch');                            // today: null
    // Every command the re-run ran again: the page's stance after it is the room's.
    const kept = (r.walk as unknown as { kept: { seq: number; stance: string }[] }).kept.filter((k) => k.seq >= m);
    expect(kept.length, 'the wait re-run').toBe(6);
    for (const k of kept) expect(k.stance, `command ${k.seq} re-run`).toBe(roomRan.get(k.seq)?.stance);
    r.agree('at the refusal');
    let taken = -1;
    for (let i = 0; taken < 0 && i < 80; i++) {
      r.frames();
      r.agree(`after the refusal, frame ${i}`);
      expect(r.page().pendingStance, `frame ${i}: the request`).toBe(r.room.walker.pendingStance);
      if (r.page().stance === 'crouch') taken = r.sent().length;
    }
    expect(taken, "taken at the window's end, the room's command").toBe(until);
    expect(roomRan.get(until)?.stance).toBe('crouch');
    expect(roomRan.get(until - 1)?.stance).toBe('stand');
  });

  // LATER 549's review, F1 (reading, pending review): the window open at the take (`[from, until)`, M inside it) ends during
  // the wait, and the room pushes a fresh flinch at `s` >= `until` (`room.ts` `flinch`: a new window from there), heard
  // during the wait. The room's body kept the first window to its end -- `FUN_005463c0` refuses before its take's steps
  // (D:L412131-412166) -- so `FUN_00552ec0` kept the crouch under it to `until` (D:L418927-418930). The page's re-run must
  // ask the first window on M .. until - 1 and the second from `s`: the second replaces the first only at its own start
  // (its pop to the base, `FUN_005a2690` -> `FUN_0058a4d0` D:L460018-460019), not at its hearing.
  it("RED: LATER 549 review F1 -- the kept window ends in the wait, a fresh flinch pushed after it is heard, the take refused: the re-run asks both, as the room's", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const flinch2 = () => ({ clip: 'seal_flinch_larm', frame: 2, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 20, s = until + 2, until2 = s + 30;
    r.room.walker.oneShotOnTop = () => (r.room.seq >= from && r.room.seq < until) || (r.room.seq >= s && r.room.seq < until2);
    const roomRan = new Map<number, { stance: string; pending: string | null }>();
    const apply = r.room.apply.bind(r.room);
    r.room.apply = (c: Command) => {
      const out = apply(c);
      roomRan.set(c.seq, { stance: r.room.walker.stance, pending: r.room.walker.pendingStance });
      return out;
    };
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(9);                                                 // the window's commands t + 1 .. t + 9
    r.walk.setStance('crouch');                                  // pressed for command t + 10, inside the window
    r.frames(1);
    expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
    expect(r.room.walker.pendingStance, "and on the room's mover").toBe('crouch');
    const m = r.take();                                          // M = t + 11, inside [from, until)
    expect(m).toBeLessThan(until);
    r.frames(s + 2 - m + 1);                                     // the wait past the window's end and the second push
    expect(r.sent().length).toBe(s + 2);
    r.walk.setFlinchPose(flinch2, { start: s, until: until2 });  // heard after s + 2: pushed at or after M, not cut
    r.frames(2);
    r.refuse();
    const kept = (r.walk as unknown as { kept: { seq: number; stance: string }[] }).kept.filter((k) => k.seq >= m);
    expect(kept.length, 'the wait re-run').toBe(s + 4 - m + 1);
    for (const k of kept) expect(k.stance, `command ${k.seq} re-run`).toBe(roomRan.get(k.seq)?.stance);   // today: crouch at M
    expect(roomRan.get(until - 1)?.stance, "the room's crouch waits to the first window's end").toBe('stand');
    expect(roomRan.get(until)?.stance).toBe('crouch');
    const u = r.walk as unknown as { flinchPose: unknown; flinchCut: unknown };
    expect([u.flinchPose, u.flinchCut], 'the second flinch on top, as the room pushed it').toEqual([flinch2, { start: s, until: until2 }]);
    r.agree('at the refusal');
    for (let i = 0; i < 20; i++) { r.frames(); r.agree(`after the refusal, frame ${i}`); }
  });

  // LATER 549's review F2 (pins of the in-run laying; reading, pending review). LATER 526's step 5 and LATER 530's pins
  // drive a bare WalkMode (no walker: `rerunFrom` runs nothing, `mountUntake`'s fallback); here the walker exists, as in a
  // match, so the refusal's re-run lays each event heard in the wait before its window's first command (`layHeard`, with
  // `rerunAt` the command before it). A door push the room pushed at `s` (M <= s < the kept window's end), heard after that
  // end: inside the re-run it covers the kept flinch at `s`, still open there (LATER 363; the room's `doorMotion`).
  it("LATER 549 review F2 (pin) -- a door push at s heard after the kept window's end: laid inside the re-run at s - 1, the kept flinch covered at s", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const door = () => ({ clip: 'seal_open_door', frame: 1, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 20;
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(10);
    const m = r.take();                                          // M = t + 11
    const s = m + 2;
    r.frames(until + 4 - (m - 1));                               // the wait past the kept window's end
    const doorCut = { start: s, until: s + 40, cutFrom: s + 30 };
    r.walk.setFlinchPose(door, doorCut, { reloadGate: false, pushed: true });   // heard after until + 4
    r.frames(2);
    const w = r.walk as unknown as { rerunAt: number | null; flinchPose: unknown; flinchCut: unknown; flinchUnder: unknown; setFlinchPose: WalkMode['setFlinchPose'] };
    const laidAt: (number | null)[] = [];
    const set = r.walk.setFlinchPose.bind(r.walk);
    w.setFlinchPose = (pose, cut, opts) => { laidAt.push(w.rerunAt); return set(pose, cut, opts); };
    r.refuse();
    expect(laidAt, 'laid once, inside the re-run, after command s - 1').toEqual([s - 1]);
    expect(w.flinchPose, 'the push on top').toBe(door);
    expect(w.flinchCut).toEqual(doorCut);
    expect(w.flinchUnder, 'the kept flinch covered at s').toEqual({ cut: { start: from, until }, at: s, pose: flinch });
    expect(r.walk.flinching(), 'under the push: no reload refusal').toBe(false);
  });

  // LATER 549, a pin of its FIRST change (8de8b2ca8), NOT a cover of the review's fold: it passes on 76f2c2fb6 too (seat
  // 91's run); the fold's F2 cover is the door push's `rerunAt` record above. The knock's re-run (`replayKnock` ->
  // `rerunFrom`) asks each command's slot as the re-run has it, not the live slot at `taps + 1` (LATER 551: the flinch
  // stepped per command; was: as `cutLog` kept it). Re-aimed by LATER 555 (research 92 section 4, "LATER 551"; reading,
  // pending review): its first shape -- a Prone cover knock replayed from inside a window that passed live, the crouch
  // held to the window's end -- asserted the room's old model; the original pops the flinch on top at the knock
  // (`FUN_0057e770` -> `FUN_0058a4d0(actor, 0)` D:L440997, D:L441004; the pop D:L446762-446768), so on one ordered stream
  // no window is open after a Prone cover knock's command and the live slot and the per-command slot agree there (the
  // fall's knocks: the slot is on its first command only, under the fall's own clip). The pin now holds the window a
  // re-run lays after the knock: prone, a Prone cover knock the room laid after command a, then a flinch window from
  // a + 5 told BEFORE the knock is heard (the told-entry order LATER 551 (b) pins, one stream never delivers it for a
  // knock), a crouch pressed inside it. The room's crouch waits for the window's end, Prone cover's end long past
  // (`FUN_00552ec0` D:L418927-418930); so does the re-run, which lays the window at its first command and asks it per
  // command. Before LATER 549's first change (a28abf3ed) the re-run read the live slot at `taps + 1`, false once the
  // window had passed live, so the crouch was taken at Prone cover's end, before the window's.
  it("LATER 549 (pin of the first change; re-aimed by LATER 555) -- prone, a Prone cover knock after a, a window from a + 5 told before it is heard: the re-run asks each command's slot, the crouch held to the window's end, as the room's", () => {
    const r = rig();
    r.walk.setStance('prone');
    r.frames(120);
    expect(r.page().stance).toBe('prone');
    r.agree('prone');
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const knock = { velocity: [0, 0, 0] as [number, number, number], fall: 'proneCover' as const };
    const after = r.sent().length;                               // the room laid the knock after this command
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    const from = after + 5, until = after + 305;                 // the window the room pushed after the knock
    r.room.walker.oneShotOnTop = () => r.room.seq >= from && r.room.seq < until;
    const roomRan = new Map<number, { stance: string; action: string | null }>();
    const apply = r.room.apply.bind(r.room);
    r.room.apply = (c: Command) => {
      const out = apply(c);
      roomRan.set(c.seq, { stance: r.room.walker.stance, action: r.room.walker.action?.name ?? null });
      return out;
    };
    r.frames(from - 1 - after);
    r.walk.setFlinchPose(flinch, { start: from, until });        // told on its first command, the knock not yet heard
    r.frames(9);
    r.walk.setStance('crouch');                                  // pressed for command from + 9, inside the window
    r.frames(1);
    expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
    expect(r.room.walker.pendingStance, "and on the room's mover").toBe('crouch');
    r.frames(until + 5 - r.sent().length);                       // the window passed live, the knock not yet heard
    const coverEnd = [...roomRan].find(([seq, x]) => seq > after && x.action !== 'proneCover')?.[0] ?? -1;
    expect(coverEnd, "the room's Prone cover over long before the window's end").toBeGreaterThan(after);
    expect(coverEnd).toBeLessThan(until - 20);
    expect(r.walk.knock(knock, after), 'heard after the window, replayed from before it').toBe(true);
    const kept = (r.walk as unknown as { kept: { seq: number; stance: string }[] }).kept.filter((k) => k.seq > after);
    expect(kept.length).toBe(until + 5 - after);
    for (const k of kept) expect(k.stance, `command ${k.seq} re-run`).toBe(roomRan.get(k.seq)?.stance);
    const first = [...roomRan].find(([seq, x]) => seq > after && x.stance === 'crouch')?.[0] ?? -1;
    expect(first, "the room's crouch held to the window's end").toBe(until);
    r.agree('after the replay');
    for (let i = 0; i < 20; i++) { r.frames(); r.agree(`after the replay, frame ${i}`); }
  });

  // LATER 526's review, F1: a dive, the take (M), then a knock the room laid after a command a < M - 1, heard after the
  // take: the page replays the knock from a (`replayKnock`), rewriting the kept states through M - 1, so the move kept at
  // the take is no longer the body's -- the room's knock ended the dive. The refusal must not lay the dive back.
  it("RED: LATER 526 review F1 -- a dive, the take, a knock heard at a < M - 1, the refusal: the page agrees with the room that took the knock", () => {
    const r = rig();
    r.setWish(1);
    for (let i = 0; i < 90; i++) r.frames();
    r.walk.stanceTouch('down');
    for (let i = 0; i < 27 && !r.moves().inDive(); i++) r.frames();
    expect(r.moves().inDive()).toBe(true);
    r.walk.stanceTouch('up');
    r.frames(2);
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = r.sent().length;                               // the room laid the knock after this command
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    r.frames(3);                                                 // the page, not yet told, runs on: M - 1 = after + 3
    const m = r.take();
    expect(m - 1).toBeGreaterThan(after);
    r.frames(3);
    expect(r.walk.knock(knock, after), 'the knock heard during the wait, replayed from a').toBe(true);
    r.refuse();
    expect(r.moves().inDive(), "the room's knock ended the dive").toBe((r.room.moves as Traversal).inDive());
    r.agree('at the refusal');
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(`after the refusal, frame ${i}`); }
  });

  // LATER 551 (research 92 section 4, "LATER 551"; reading, pending review): the room's flinch on its mover as `room.ts`
  // keeps it -- the slot `[flinchFrom, flinchUntil)` on `sim.seq`, not under the fall (`oneShotOnTop`, LATER 512c), and
  // after each command `watchCut`'s `flinchLanding`: covered at the first command its body runs in the air inside the
  // window (PAR-71, `flinchCovered`: `FUN_005af930` D:L466956-466970), and at the command it is back on the floor handed
  // back by a landing with no clip with the commands it had left, else popped there (`flinchLanded`; PAR-65, PAR-71:
  // `FUN_00589aa0` D:L466900-466901, `FUN_0028da00` D:L135104-135107). A fall's knock leaves the window to the fall's
  // cover; a Prone cover knock ends it at the knock (`proneKnock`; LATER 555: `layKnock`, `FUN_0057e770` ->
  // `FUN_0058a4d0(actor, 0)` D:L440997, D:L441004). Each command the room ran: its stance after it, its request, its slot.
  const roomFlinch = (r: ReturnType<typeof rig>, from: number, until: number) => {
    // Pushed in the air: the fall covers it from its first command (PAR-65, `room.ts` `flinchState` / `doorMotion`).
    const f = { from, at: from, until, air: r.room.walker.airborne ? from : -1 };
    let last = r.room.walker.landing;
    const slot = (seq: number): boolean => seq >= f.from && seq < f.until && !(f.air >= 0 && seq >= f.air);
    r.room.walker.oneShotOnTop = () => slot(r.room.seq);
    const ran = new Map<number, { stance: string; pending: string | null; slot: boolean }>();
    const apply = r.room.apply.bind(r.room);
    let popAt = -1;                                              // LATER 560: a start or a mount heard in the command's run
    r.room.apply = (c: Command) => {
      const asked = slot(c.seq);
      const out = apply(c);
      // LATER 560's review F1: the pop heard inside command `seq`'s run ends the window at it, laid after the command
      // (`room.ts` `watchCut`), so the stance asked in the run still sees it.
      if (popAt === c.seq && f.until > c.seq) { f.until = c.seq; f.air = -1; }
      popAt = -1;
      const w = r.room.walker, seq = c.seq, win = { start: f.at, until: f.until };
      if (f.air < 0) { if (flinchCovered(win, seq, w.airborne)) f.air = seq; }
      else if (!w.airborne) {
        const l = w.landing, bare = l !== null && l !== last && l.clip === null;
        const back = flinchLanded(win, seq, bare, f.air);
        f.air = -1; f.at = back.start; f.until = back.until;
      }
      last = w.landing;
      ran.set(seq, { stance: w.stance, pending: w.pendingStance, slot: asked });
      return out;
    };
    // LATER 555: a Prone cover knock laid after command `after` ends the window there (`room.ts` `layKnock`).
    const proneKnock = (after: number): void => { if (f.until > after + 1) { f.until = after + 1; f.air = -1; } };
    // LATER 560: a climb's start or a ladder's mount heard inside command `seq`'s run pops the flinch on top with the
    // stack (`FUN_00580b70` D:L442186-442214, `FUN_00580a80` D:L442151-442163, `FUN_0057f880` D:L441547-441558): the
    // window ends at that command (LATER 560's review F1: the reload's flag asked after the driver's pass, D:L417907;
    // `room.ts` `watchMoves` marks it, `watchCut` ends it after the command, before the command's cut is asked).
    const pops: number[] = [];
    (r.room.moves as Traversal).on((e) => {
      if (e.type !== 'climbStart' && e.type !== 'ladderMount') return;
      const seq = r.room.seq;
      pops.push(seq);
      popAt = seq;
    });
    /** The room's 'flinch' drop of a reload named at `seq` (`room.ts` `reload`: `[flinchFrom, flinchUntil)`). */
    const refuses = (seq: number): boolean => seq >= f.from && seq < f.until;
    return { f, ran, proneKnock, pops, refuses };
  };
  const keptOf = (r: ReturnType<typeof rig>) => (r.walk as unknown as { kept: { seq: number; stance: string }[] }).kept;
  const slotsOf = (r: ReturnType<typeof rig>) => (r.walk as unknown as { cutLog: { seq: number; slot?: boolean }[] }).cutLog;

  // LATER 551 (a): a crouch pending inside a long flinch window; a knock the room laid after a command inside it (a fall:
  // `FUN_0057e770`, the body off the floor), heard after the page has run on under the window. The room's fall covers the
  // flinch from the next command (PAR-71), its landing's clip pops it (`landBackwards`), and the request is over with the
  // get-up -- before the window's end; a crouch pressed after it is taken at once, where the page's live run kept it under
  // the window to its end. The page's re-run of the knock must ask the room's slot on each command, and so its stance.
  it("RED: LATER 551 (a) -- a knock replayed into an open flinch window, the get-up over before its end: a crouch taken where the room takes it", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 470;
    const room = roomFlinch(r, from, until);
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(9);
    r.walk.setStance('crouch');                                  // pressed for command t + 10, inside the window
    r.frames(1);
    expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
    expect(r.room.walker.pendingStance, "and on the room's mover").toBe('crouch');
    r.frames(5);
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = r.sent().length;                               // the room laid it after this command, inside the window
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    // A second crouch, pressed once the room's get-up is over: the room takes it at once (its slot off since the fall),
    // the page's live run keeps it under the window to its end.
    const second = after + 250;
    r.frames(second - 1 - after);
    r.walk.setStance('crouch');
    r.frames(until + 5 - second + 1);                            // the window passed live, the knock not yet heard
    expect(room.ran.get(second)?.stance, "the room's second crouch taken at once").toBe('crouch');
    expect(slotsOf(r).filter((e) => e.seq > after && e.seq < until).every((e) => e.slot === true), "the live ticks' slot").toBe(true);
    // The room's request ends with the get-up, long before the window's end (its slot off from the fall's cover on).
    const ended = [...room.ran].find(([seq, x]) => seq > after && x.pending === null)?.[0] ?? -1;
    expect(ended, "the room's request over after the get-up, before the window's end").toBeGreaterThan(after);
    expect(ended).toBeLessThan(until);    expect(r.walk.knock(knock, after), 'heard after the window, replayed from inside it').toBe(true);
    const kept = keptOf(r).filter((k) => k.seq > after);
    expect(kept.length).toBe(until + 5 - after);
    for (const k of kept) expect(k.stance, `command ${k.seq} re-run`).toBe(room.ran.get(k.seq)?.stance);   // today: stand to until
    for (const e of slotsOf(r).filter((x) => x.seq > after)) expect(e.slot, `command ${e.seq}: the slot`).toBe(room.ran.get(e.seq)?.slot);
    r.agree('after the replay');
    for (let i = 0; i < 20; i++) { r.frames(); r.agree(`after the replay, frame ${i}`); }
  });

  // LATER 551 (b): a window handed back on the page's live run -- pushed while a running jump is in the air, so the fall
  // covers it from its first command (PAR-65; the jump is refused inside a window, PAR-78), and the landing with no clip
  // hands it back whole from there, past its first end -- and a knock the room laid before the jump, heard after. On the
  // room the knock's fall covered the window and its landing's clip popped it (`flinchLanded`, not bare): nothing handed
  // back, and a crouch pressed after the get-up is taken at once. The page's re-run must drop the hand-back its live run
  // made, command by command, as the room's never had it. The window is a door's `Open door` push (DOORS, `room.ts`
  // `doorMotion`: the same slot, LATER 512c), cuttable only from its `NoInterrupt` (`cutFrom`), here its end: the
  // running stick would cut a flinch's once on the floor (the six flinches carry none, PAR-60).
  // LATER 551's review F3: a PIN of the told-entry mechanism (a window told before the re-run's event, laid again inside
  // the re-run at its first command), not a reachable order: the blast's `after` is the room's `sim.seq` at the blast
  // (`room.ts`, the blast's send) and a push's first command its `sim.seq + 1` (`doorMotion`), so on one ordered stream a
  // window starting after the knock's command is always told after the knock -- this order never reaches the page. The
  // mechanism it pins also serves a push and a knock between the same two commands (review F2's pins above), and the
  // dance's deferred run (LATER 556).
  it("LATER 551 (b) (a pin of the told-entry mechanism; review F3: an order one stream never delivers) -- a handed-back window, a knock replayed from before its jump: the room's pop", () => {
    const r = rig();
    const door = () => ({ clip: 'seal_open_door', frame: 1, loop: false, rootY: null });
    r.setWish(1);
    r.frames(90);                                                // running
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = r.sent().length;
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    r.frames(2);
    expect(r.walk.jump(), 'the running jump on the page').toBe(true);
    for (let i = 0; i < 30 && !r.page().airborne; i++) r.frames();
    expect(r.page().airborne, 'off the floor').toBe(true);
    expect(r.room.walker.airborne, "the room's body off the floor too, by the knock").toBe(true);
    const t = r.sent().length;
    const from = t + 1, until = t + 260;
    const room = roomFlinch(r, from, until);
    r.walk.setFlinchPose(door, { start: from, until, cutFrom: until }, { reloadGate: false, pushed: true });
    let landed = -1;
    for (let i = 0; i < 200 && landed < 0; i++) { r.frames(); if (!r.page().airborne) landed = r.sent().length; }
    expect(landed, 'back on the floor').toBeGreaterThan(from);
    expect(r.page().landing?.clip ?? null, 'a landing with no clip: the window handed back').toBeNull();
    const back = (r.walk as unknown as { flinchCut: { start: number; until: number } | null }).flinchCut;
    expect(back?.until ?? -1, 'handed back past its first end').toBeGreaterThan(until);
    r.setWish(0);
    r.frames(back!.until - 20 - r.sent().length);                // inside the handed-back window
    r.walk.setStance('crouch');
    r.frames(1);
    const pressed = r.sent().length;
    expect(pressed).toBeLessThan(back!.until);
    expect(r.page().stance, 'the crouch waits under the hand-back on the live run').toBe('stand');
    r.frames(30);
    expect(room.ran.get(pressed)?.slot, "the room's slot: the knock's landing popped it").toBe(false);
    expect(room.ran.get(pressed)?.stance, "the room's crouch taken at once").toBe('crouch');
    expect(r.walk.knock(knock, after), 'heard after, replayed from before the jump').toBe(true);
    for (const k of keptOf(r).filter((x) => x.seq >= from)) expect(k.stance, `command ${k.seq} re-run`).toBe(room.ran.get(k.seq)?.stance);   // before LATER 551: stand under the hand-back
    for (const e of slotsOf(r).filter((x) => x.seq >= from)) expect(e.slot, `command ${e.seq}: the slot`).toBe(room.ran.get(e.seq)?.slot);
    r.agree('after the replay');
    for (let i = 0; i < 20; i++) { r.frames(); r.agree(`after the replay, frame ${i}`); }
  });

  // LATER 551 (c), the same family (LATER 549's review F3): a knock the room laid at a < M - 1, heard during a refused take's
  // wait. The take kept the flinch as the live run had it at M - 1 -- open, never covered -- but on the room the knock's fall
  // covered it from a + 1 and its landing's clip popped it before M (`FUN_005463c0` refuses before its steps,
  // D:L412131-412166: the room's body ran the wait on foot). The refusal must lay back the flinch the knock's re-run left
  // at M - 1, not the one the take kept: a crouch pressed after the get-up is taken at once, as the room's.
  it("RED: LATER 551 (c) -- a knock at a < M - 1 heard in a refused take's wait: the flinch laid back is the one the knock's fall left", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 470;
    const room = roomFlinch(r, from, until);
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(9);
    r.walk.setStance('crouch');
    r.frames(1);
    expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
    r.frames(2);
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = r.sent().length;
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    let down = -1;
    for (let i = after + 1; i <= after + 300 && down < 0; i++) { r.frames(); if (!r.room.walker.airborne) down = r.sent().length; }
    expect(down, "the room's body back on the floor").toBeGreaterThan(after);
    expect(room.ran.get(down)?.slot, 'covered by the fall').toBe(false);
    r.frames(5);
    const m = r.take();
    expect(m - 1).toBeGreaterThan(after);
    r.frames(4);
    expect(r.walk.knock(knock, after), 'the knock heard during the wait, replayed from a').toBe(true);
    r.refuse();
    const kept = keptOf(r).filter((x) => x.seq >= m);
    for (const k of kept) expect(k.stance, `command ${k.seq} re-run`).toBe(room.ran.get(k.seq)?.stance);
    r.agree('at the refusal');
    for (const e of slotsOf(r).filter((x) => x.seq >= m)) expect(e.slot, `command ${e.seq}: the slot`).toBe(room.ran.get(e.seq)?.slot);
    for (let i = 0; r.sent().length < after + 250; i++) { r.frames(); r.agree(`after the refusal, frame ${i}`); }
    r.walk.setStance('crouch');                                  // the get-up over on both
    let taken = -1;
    for (let i = 0; i < 300 && taken < 0; i++) {
      r.frames();
      r.agree(`after the press, frame ${i}`);
      expect(r.page().pendingStance, `frame ${i}: the request`).toBe(r.room.walker.pendingStance);   // today: kept to until
      if (r.page().stance === 'crouch') taken = r.sent().length;
    }
    expect(taken, "taken at once, before the window's end, as the room's").toBe(after + 251);
  });

  // LATER 551's review F1 (reading, pending review): the take accepted -- the room's take pops every play at M
  // (`FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` D:L447984, its pops D:L446796-446798; `room.ts` `takeMount`, LATER 523)
  // -- a flinch the room pushed before M heard after the take (cut at M on the page, nothing drawn: LATER 524), then a
  // knock the room laid after a command a >= M heard: its re-run lays back the flinch kept after a (`KeptCommand.flinch`).
  // The room's flinch was gone from M: no pose, no reload refused, on every command from M. The same after a re-key
  // (`mountRekey`: the room took later, at m), from m.
  type Rekeys = { mountRekey(m: number): unknown };
  const keptFlinch = (r: ReturnType<typeof rig>) =>
    (r.walk as unknown as { kept: { seq: number; flinch?: { cut: unknown; pose: unknown; clock: unknown } }[] }).kept;
  it("RED: LATER 551 review F1 -- the take accepted, a flinch pushed before M heard after it, a knock at a >= M heard: the take's pop stands, as the room's", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const m = r.take();
    r.frames(6);                                                 // M .. M + 5, the take standing
    r.walk.setFlinchPose(flinch, { start: m - 2, until: m + 60 });   // pushed at M - 2, heard after the take: cut at M
    const u = r.walk as unknown as { flinchPose: unknown; flinchCut: unknown };
    expect(u.flinchPose, "the take's pop: nothing drawn").toBeNull();
    expect(r.walk.flinching(), 'nor a reload refused').toBe(false);
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = m + 2;                                         // a in [M, taps]
    expect(r.walk.knock(knock, after), 'heard after, replayed from a >= M').toBe(true);
    expect(u.flinchPose, "no pose: the room's take popped the flinch at M").toBeNull();          // was: the flinch's pose
    expect(r.walk.flinching(), 'no reload refused').toBe(false);                                 // was: true
    for (const k of keptFlinch(r).filter((x) => x.seq >= m)) {
      expect([k.flinch?.cut ?? null, k.flinch?.pose ?? null, k.flinch?.clock ?? null], `command ${k.seq}: the flinch kept`).toEqual([null, null, null]);
    }
  });

  it("RED: LATER 551 review F1 -- the same after a re-key (the room took at m > M): the flinch cut at m, none from m after a knock at a >= m", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const m0 = r.take();
    r.frames(8);                                                 // M .. M + 7
    r.walk.setFlinchPose(flinch, { start: m0 - 2, until: m0 + 60 });
    const m = m0 + 3;
    (r.walk as unknown as Rekeys).mountRekey(m);                 // the room's take at m: the flinch ran on to m
    const u = r.walk as unknown as { flinchPose: unknown };
    expect(u.flinchPose).toBeNull();
    for (const k of keptFlinch(r).filter((x) => x.seq >= m0 && x.seq < m)) expect(k.flinch?.cut ?? null, `command ${k.seq}: standing before m`).not.toBeNull();
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    expect(r.walk.knock(knock, m + 1), 'heard after, replayed from a >= m').toBe(true);
    expect(u.flinchPose, "no pose: the room's take popped the flinch at m").toBeNull();          // was: the flinch's pose
    expect(r.walk.flinching(), 'no reload refused').toBe(false);                                 // was: true
    for (const k of keptFlinch(r).filter((x) => x.seq >= m)) {
      expect([k.flinch?.cut ?? null, k.flinch?.pose ?? null, k.flinch?.clock ?? null], `command ${k.seq}: the flinch kept`).toEqual([null, null, null]);
    }
  });

  // LATER 551's review F2 (reading, pending review): the room derives a push's cover at the push from its own flinch
  // (`room.ts` `doorMotion`, LATER 363) and its knock drops the covered one (`layKnock` clears `flinchUnder`, PAR-28),
  // in the order it ran them -- the order the wire tells them. (i) A door push the room pushed after command a, told first,
  // then a knock it laid after the same command: the push covered the open flinch, the knock dropped it -- nothing handed
  // back at the push's end. The re-run lays the push, told before the knock, ahead of the knock. (ii) A door push told
  // inside the window, then a knock laid before it (a fall whose landing's clip popped the window): the push covered
  // nothing on the room; the re-run reads its cover from the flinch it has stepped, not the live one at the hearing.
  it("RED: LATER 551 review F2 (i) -- a door push told at a + 1 over an open flinch, then a Prone cover knock after a: the knock drops the covered flinch, as the room's", () => {
    const r = rig();
    r.walk.setStance('prone');
    r.frames(120);
    expect(r.page().stance).toBe('prone');
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const door = () => ({ clip: 'seal_open_door', frame: 1, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 300;
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(10);
    const after = r.sent().length;                               // a: the push and the knock both after this command
    const s = after + 1;
    const doorCut = { start: s, until: s + 40, cutFrom: s + 40 };
    r.walk.setFlinchPose(door, doorCut, { reloadGate: false, pushed: true });   // told first
    const u = r.walk as unknown as { flinchCut: unknown; flinchUnder: unknown };
    expect(u.flinchUnder, 'the push covers the open flinch').toMatchObject({ cut: { start: from, until }, at: s });
    r.frames(3);
    const knock = { velocity: [0, 0, 0] as [number, number, number], fall: 'proneCover' as const };
    expect(r.walk.knock(knock, after), 'told after the push, replayed from a').toBe(true);
    // LATER 555: the knock pops the push on top too (`FUN_0058a4d0(actor, 0)` D:L440997, D:L446762-446768): the room's
    // window, the push's from a + 1, ends at a + 1 (`layKnock`).
    expect(u.flinchCut, 'the push popped by the knock').toBeNull();                              // 551: the push on top
    expect(u.flinchUnder, "the room's knock dropped the covered flinch").toBeNull();             // was: the flinch under
    r.frames(s + 45 - r.sent().length);                          // past the push's end
    expect(slotsOf(r).filter((e) => e.seq >= s + 40).every((e) => e.slot === false), 'nothing handed back at its end').toBe(true);   // was: the flinch
    expect(r.walk.flinching(), 'no reload refused').toBe(false);                                 // was: true
  });

  // F2 (ii) tells a push, then a knock from before it: the order review F3 says one stream never delivers for a knock. It
  // pins the cover's re-derivation from the re-run's flinch, which the dance's deferred run reaches (LATER 556).
  it("RED: LATER 551 review F2 (ii) -- a door push told inside the window, then a knock from before it heard: the push's cover read from the re-run's flinch (popped by the fall's landing), as the room's", () => {
    const r = rig();
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const door = () => ({ clip: 'seal_open_door', frame: 1, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 470;
    const room = roomFlinch(r, from, until);
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(5);
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = r.sent().length;
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    let down = -1;
    for (let i = 0; i < 300 && down < 0; i++) { r.frames(); if (!r.room.walker.airborne) down = r.sent().length; }
    expect(down, "the room's body back on the floor").toBeGreaterThan(after);
    expect(room.f.until, "the room's window popped by the landing's clip").toBeLessThanOrEqual(down);
    const s = down + 20;
    r.frames(s - 1 - r.sent().length);
    const doorCut = { start: s, until: s + 40, cutFrom: s + 40 };
    r.walk.setFlinchPose(door, doorCut, { reloadGate: false, pushed: true });   // told live: the page's flinch still open
    const u = r.walk as unknown as { flinchCut: unknown; flinchUnder: unknown };
    expect(u.flinchUnder, "the live run's push covers its open flinch").toMatchObject({ cut: { start: from, until }, at: s });
    r.frames(3);
    expect(r.walk.knock(knock, after), 'heard after, replayed from before the push').toBe(true);
    expect(u.flinchCut, 'the push on top').toEqual(doorCut);
    expect(u.flinchUnder, "nothing covered: the room's flinch was popped before s").toBeNull();   // was: the live flinch under
    r.frames(s + 45 - r.sent().length);
    expect(slotsOf(r).filter((e) => e.seq >= s + 40).every((e) => e.slot === false), 'nothing handed back at its end').toBe(true);   // was: the flinch
  });

  // LATER 555 (research 92 section 4, "LATER 551"; reading, pending review; PTW.R3 with `room.ts` `layKnock`): a knock
  // pops the flinch on top -- `FUN_0057e770` calls `FUN_0058a4d0(actor, 0)` (D:L440997), which pops while the stack holds
  // more than its base and the top is not Stand, Crouch or Prone (types 1, 0x12, 0x1a: D:L446762-446768), and a prone
  // body's pops again (D:L441003-441004) before `Prone cover` is pushed (D:L441017-441018). A Prone cover knock has no fall
  // to cover the window, so the window ends at the knock, its reload refusal with it, and a crouch pending under it waits
  // only for Prone cover's end (`FUN_00552ec0` D:L418927-418930). Was: kept to the window's end, on the room and the page.
  // A fall's knock is LATER 551's (the fall's cover, then the landing's clip, pop the window either way).
  const proneThenWindow = (r: ReturnType<typeof rig>) => {
    r.walk.setStance('prone');
    r.frames(120);
    expect(r.page().stance).toBe('prone');
    r.agree('prone');
    const flinch = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
    const t = r.sent().length;
    const from = t + 1, until = t + 300;
    const room = roomFlinch(r, from, until);
    r.walk.setFlinchPose(flinch, { start: from, until });
    r.frames(9);
    r.walk.setStance('crouch');                                  // pressed for command t + 10, inside the window
    r.frames(1);
    expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
    expect(r.room.walker.pendingStance, "and on the room's mover").toBe('crouch');
    r.frames(10);
    const knock = { velocity: [0, 0, 0] as [number, number, number], fall: 'proneCover' as const };
    const after = r.sent().length;                               // the room laid it after this command, inside the window
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);
    room.proneKnock(after);
    return { from, until, room, knock, after };
  };

  it("RED: LATER 555 -- prone, a crouch pending in a flinch window, a Prone cover knock replayed from inside it: the window ends at the knock, the crouch taken at Prone cover's end, as the room's", () => {
    const r = rig();
    const { until, room, knock, after } = proneThenWindow(r);
    r.frames(until + 5 - after);                                 // the window passed live, the knock not yet heard
    expect(slotsOf(r).filter((e) => e.seq > after && e.seq < until).every((e) => e.slot === true), "the live ticks' slot").toBe(true);
    const first = [...room.ran].find(([seq, x]) => seq > after && x.stance === 'crouch')?.[0] ?? -1;
    expect(first, "the room's crouch at Prone cover's end, before the window's").toBeGreaterThan(after);
    expect(first).toBeLessThan(until - 20);
    expect(r.walk.knock(knock, after), 'heard after the window, replayed from inside it').toBe(true);
    const kept = keptOf(r).filter((k) => k.seq > after);
    expect(kept.length).toBe(until + 5 - after);
    for (const k of kept) expect(k.stance, `command ${k.seq} re-run`).toBe(room.ran.get(k.seq)?.stance);   // was: prone to until
    for (const e of slotsOf(r).filter((x) => x.seq > after)) expect(e.slot, `command ${e.seq}: the slot`).toBe(room.ran.get(e.seq)?.slot);
    expect(r.walk.flinching(), 'no reload refused after the knock').toBe(false);
    r.agree('after the replay');
    for (let i = 0; i < 20; i++) { r.frames(); r.agree(`after the replay, frame ${i}`); }
  });

  it("RED: LATER 555 -- the same Prone cover knock heard on its own command (laid live): the window and its reload refusal end there, the crouch taken at Prone cover's end, as the room's", () => {
    const r = rig();
    const { until, room, knock, after } = proneThenWindow(r);
    expect(r.walk.flinching(), 'inside the window').toBe(true);
    expect(r.walk.knock(knock, after), 'laid on the mover as it stands').toBe(true);
    expect(r.walk.flinching(), "the reload's refusal ended with the window").toBe(false);        // was: true
    let taken = -1;
    for (let i = 0; i < until + 5 - after; i++) {
      r.frames();
      const seq = r.sent().length;
      expect(r.page().stance, `command ${seq}`).toBe(room.ran.get(seq)?.stance);                  // was: prone to until
      expect(slotsOf(r).find((e) => e.seq === seq)?.slot, `command ${seq}: the slot`).toBe(room.ran.get(seq)?.slot);
      if (taken < 0 && r.page().stance === 'crouch') taken = seq;
    }
    expect(taken, "taken at Prone cover's end, before the window's").toBeGreaterThan(after);
    expect(taken).toBeLessThan(until - 20);
    r.agree('after the window');
  });

  // LATER 560 (research 92 section 4, "LATER 560"; reading, pending review; PTW.R3 with `room.ts` `watchMoves`): a climb's
  // start, a `Climb over` start and a ladder's mount pop the stack to its base -- `FUN_00580b70` D:L442186-442214,
  // `FUN_00580a80` D:L442151-442163, `FUN_0057f880` D:L441547-441558 -- the flinch on top with it (LATER 512b's (a)-(b)),
  // and no gate on their path refuses them under a flinch (`FUN_00550ef0` D:L418119-418132, `FUN_005a7de0`,
  // `FUN_005b4340(actor, 2)`, `FUN_005b2620`: the reading). The window ends at the command the start falls in (LATER 560's
  // review F1: the reload's flag 0x4 is asked from the kit's frame `FUN_005c0fd0` in the actor's post-tick, D:L417907,
  // after the driver's pass that pops it, D:L418132 -- research 230, PAR-67 -- as the stick's cut, D:L418174-418190, ends
  // the window at its own command): its slot after it and its reload refusal (`flinching`) with it; the slot on the
  // command itself stands (the stance asked in its run, before the pop is laid). Was: the page and the room cleared only
  // the covered flinch (`flinchUnder`), so the window ran on to its end or the stick's cut; then (the first build) it
  // ended after the command, C + 1.
  /** A ladder's span (appflags 2, `APP_LADDER`) in the plane z = 4, climbed from +z: the rig's mover (x 5, z 6, facing -z) is at it. */
  const LADDER: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/ladder', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, appflags: 2,
    points: Float32Array.from([0, 0, 4, 10, 0, 4, 10, 100, 4, 0, 100, 4]),
  };
  const flinch560 = () => ({ clip: 'seal_flinch_rarm', frame: 3, loop: false, rootY: null });
  const tapsOf = (r: ReturnType<typeof rig>): number => (r.walk as unknown as { taps: number }).taps;
  /** The commands the page's moves started a climb or mounted a ladder on (heard inside the tick: `taps + 1`). */
  const startsOf = (r: ReturnType<typeof rig>): number[] => {
    const at: number[] = [];
    r.moves().on((e) => { if (e.type === 'climbStart' || e.type === 'ladderMount') at.push(tapsOf(r) + 1); });
    return at;
  };

  it("RED: LATER 560 -- a ladder mounted inside a flinch window told live: the window ends at the mount's command, its slot and its reload refusal with it, as the room's", () => {
    const r = rig([LADDER]);
    const t = r.sent().length, from = t + 1, until = t + 40;
    const room = roomFlinch(r, from, until);
    const starts = startsOf(r);
    r.walk.setFlinchPose(flinch560, { start: from, until });
    r.frames(1);                                                 // command `from`, the stick still
    expect(r.walk.flinching(), 'inside the window').toBe(true);
    r.setWish(1);                                                // into the ladder: mounted on the touch (`touchLadder`)
    r.frames(1);
    const at = from + 1;
    expect(starts, "the page's mount, on its command").toEqual([at]);
    expect(room.pops, "the room's, on the same").toEqual([at]);
    expect(room.f.until, "the room's window ends at the mount's command").toBe(at);            // review F1; was: at + 1
    expect(r.walk.flinching(), "the reload's refusal ended with it").toBe(false);               // was: true
    for (let i = 0; i < until + 5 - at; i++) r.frames();
    const run = slotsOf(r).filter((e) => e.seq >= from && e.seq <= r.sent().length);
    expect(run.length).toBe(until + 5 - t);
    for (const e of run) expect(e.slot, `command ${e.seq}: the slot`).toBe(room.ran.get(e.seq)?.slot);   // was: true to the cut
    expect(r.walk.flinching()).toBe(false);
    r.agree('on the ladder');
  });

  it("RED: LATER 560 -- the same ladder mount, the flinch told a round trip later: its replay ends the window at the mount's command and answers that end, as the room's", () => {
    const r = rig([LADDER]);
    const t = r.sent().length, from = t + 1, until = t + 40;
    const room = roomFlinch(r, from, until);                     // the room's window from `from`; the page not yet told
    const starts = startsOf(r);
    r.frames(1);
    r.setWish(1);
    r.frames(1);
    const at = from + 1;
    expect(starts).toEqual([at]);
    expect(room.pops).toEqual([at]);
    r.frames(6);                                                 // the event's round trip
    const end = r.walk.setFlinchPose(flinch560, { start: from, until });
    expect(end, "the window's end on the commands already run: the mount's command").toBe(at);   // was: at + 2, the stick's cut; then at + 1
    expect(room.f.until, "the room's, the same").toBe(at);
    expect(r.walk.flinching(), 'no reload refused').toBe(false);
    for (const e of slotsOf(r).filter((x) => x.seq >= from)) expect(e.slot, `command ${e.seq}: the slot`).toBe(room.ran.get(e.seq)?.slot);   // was: true at at + 1
    r.frames(10);
    r.agree('on the ladder');
  });

  // LATER 560's review F1 (the shape it names): a ladder mounted inside a flinch's first three commands -- before the
  // stick's cut can pop it (`flinchCutAt`) -- then a reload pressed the frame after the mount's command C: the page takes
  // it (`flinching` false) and names C (its last command sent, `netPage`'s `lastSeq`); the room must drop none named C.
  // Was: the page's window ended at C, the room's at C + 1 -- the reload taken on the page and dropped 'flinch' by the room.
  it("RED: LATER 560 review F1 -- a ladder mounted on a flinch's second command, a reload the frame after: the page takes it and the room refuses none at the mount's command (both end at C)", () => {
    const r = rig([LADDER]);
    const t = r.sent().length, from = t + 1, until = t + 40;
    const room = roomFlinch(r, from, until);
    const starts = startsOf(r);
    r.walk.setFlinchPose(flinch560, { start: from, until });
    r.frames(1);                                                 // command `from`, the stick still
    r.setWish(1);
    r.frames(1);                                                 // command C = from + 1: the mount
    const at = from + 1;
    expect(starts).toEqual([at]);
    expect(room.pops).toEqual([at]);
    expect(r.sent().length, 'the reload pressed now names C').toBe(at);
    expect(r.walk.flinching(), 'the page takes it').toBe(false);
    expect((r.walk as unknown as { flinchEnded: number | null }).flinchEnded, "the page's window ends at C").toBe(at);   // was: at + 1
    expect(room.refuses(from), 'a reload named before C: the flinch').toBe(true);
    expect(room.refuses(at), 'named C: no drop, as the page').toBe(false);                     // was: true ('flinch')
    expect(room.f.until).toBe(at);
  });

  // LATER 560's review F4: a respawn's replay (`respawn` -> `sim.apply` with no tap) that mounts a ladder marks the pop
  // (`stackPopped`) with no command step to take it, so the mark waits for the first live `flinchRan` and cuts a window
  // there. The replay leaves no mark. A mechanism pin (the mark itself), as LATER 551 (b).
  it("RED: LATER 560 review F4 (a mechanism pin) -- a respawn whose replay mounts a ladder leaves no base-pop mark for the first live command", () => {
    const r = rig([LADDER]);
    const s = r.page().state, feet = [s.x, s.y, s.z] as const, yaw = s.yaw;
    const t = r.sent().length;
    r.setWish(1);
    r.frames(3);                                                 // mounted on the touch
    const replay = r.sent().slice(t);
    expect(replay.length).toBe(3);
    expect(r.walk.respawn(feet, yaw, replay)).toBe(true);
    expect((r.moves() as unknown as { ladder: unknown }).ladder, "the replay's mount").not.toBe(null);
    expect((r.walk as unknown as { basePopped: boolean }).basePopped, 'no mark carried past the replay').toBe(false);   // was: true
  });

  // A climb's start and a `Climb over` start, heard from the moves inside a command's run on both ends (the rig's floor has
  // no ledge: the event is laid on the moves' tick, after the driver's own step, where `startClimb` emits it).
  // LATER 560's review F3: MECHANISM PINS, as LATER 551 (b) -- a real `startClimb` clears a standing body's pending crouch
  // (`Traversal.startClimb`, `requestStance(null)`) and the climb's one-shot holds the stance (R313.6 / B3), so "the
  // crouch taken at C + 1" never happens with a real climb. What they hold is the window's end on the start's command, the
  // slot standing on that command (the stance asked in its run), page against room.
  const emitIn = (m: Traversal, seq: () => number, at: number, e: { type: 'climbStart'; kind: 'med' | 'over' }): void => {
    const tick = m.tick.bind(m);
    m.tick = (w, input, dt) => {
      const out = tick(w, input, dt);
      if (seq() === at) (m as unknown as { emit(x: unknown): void }).emit(e);
      return out;
    };
  };
  for (const kind of ['med', 'over'] as const) {
    it(`RED: LATER 560 (a mechanism pin) -- ${kind === 'over' ? 'a Climb over start' : "a climb's start"} inside a flinch window: the window ends at its command, a crouch pending under it taken on the next command, as the room's`, () => {
      const r = rig();
      const t = r.sent().length, from = t + 1, until = t + 40;
      const room = roomFlinch(r, from, until);
      r.walk.setFlinchPose(flinch560, { start: from, until });
      r.frames(4);
      r.walk.setStance('crouch');                                // pressed for command from + 4, inside the window
      r.frames(1);
      expect(r.page().pendingStance, 'pending on the page').toBe('crouch');
      expect(r.room.walker.pendingStance, "and on the room's mover").toBe('crouch');
      const at = r.sent().length + 3;
      emitIn(r.moves(), () => tapsOf(r) + 1, at, { type: 'climbStart', kind });
      emitIn(r.room.moves as Traversal, () => r.room.seq, at, { type: 'climbStart', kind });
      let taken = -1;
      for (let i = 0; i < until + 5 - from; i++) {
        r.frames();
        const seq = r.sent().length;
        expect(r.page().stance, `command ${seq}`).toBe(room.ran.get(seq)?.stance);                  // was: stand to until
        expect(slotsOf(r).find((e) => e.seq === seq)?.slot, `command ${seq}: the slot`).toBe(room.ran.get(seq)?.slot);
        if (taken < 0 && r.page().stance === 'crouch') taken = seq;
      }
      expect(room.pops, "the room's start").toEqual([at]);
      expect(room.f.until).toBe(at);                             // review F1; was: at + 1
      expect((r.walk as unknown as { flinchEnded: number | null }).flinchEnded, "the page's, the same").toBe(at);
      expect(taken, 'the crouch refused on the start, taken on the command after it').toBe(at + 1);
      expect(r.walk.flinching(), 'no reload refused').toBe(false);
      r.agree('after the window');
    });
  }

  // LATER 530 (F6 of LATER 526's review: the re-run impossible; a pin of today's behaviour). The record does not reach back
  // to M - 1 (`canReplay` false): a knock laid at or after it (`knockedAfter`), or the kept commands pruned past
  // `KEPT_COMMANDS`. Then `mountUntake` runs nothing again: the mover stands where the page left it, nothing is marked
  // replayed, the move the take ended stays ended, and the room's snapshots correct the body (`./net/client` `reconcile`,
  // its feet compared and nudged: not driven here -- `takeReconcile.test.ts` drives the client).
  it("LATER 530 (a pin) -- the re-run impossible (a knock laid after M - 1): the mover stands, nothing marked replayed, the take's pop not undone", () => {
    const r = rig();
    r.walk.setStance('crouch');
    r.frames(60);
    r.take();
    r.frames(3);
    const knock = { velocity: [30, 40, 0] as [number, number, number], fall: 'fallBackwards' as const };
    expect(r.walk.knock(knock), 'heard with no command: laid now (`knockedAfter` the last command)').toBe(true);
    r.frames(3);
    const before = { ...r.page().state }, stance = r.page().stance;
    const replayed: number[] = [];
    r.refuse((after) => replayed.push(after));
    expect(replayed, 'nothing marked replayed').toEqual([]);
    expect({ ...r.page().state }, 'the mover stands').toEqual(before);
    expect(r.page().stance, "the take's stand stays: no re-run to lay the crouch back").toBe(stance);
  });
  it("LATER 530 (a pin) -- the re-run impossible (the wait past `KEPT_COMMANDS`, 600): the mover stands, nothing marked replayed", () => {
    const r = rig();
    const m = r.take();
    r.walk.setTurretHold((w) => { w.state.x = 60; w.state.z = 60; });
    r.frames(605);
    expect(r.sent().length - (m - 1)).toBeGreaterThan(600);
    r.walk.setTurretHold(null);
    const replayed: number[] = [];
    r.refuse((after) => replayed.push(after));
    expect(replayed).toEqual([]);
    expect([r.page().state.x, r.page().state.z], "the hold's place stands, for the room's snapshots to correct").toEqual([60, 60]);
  });

  // LATER 532: the wind-up's chase over the wait stands off the floor (`FUN_00594cf0` D:L453478-453480, D:L457369-457371),
  // so `./matchActions` asks the walk whether the body was in the air after each command -- after the refusal, as the
  // re-run (the room's run on foot) left it (`cutLog`, `relog`); null for a command the log does not hold.
  it("RED: LATER 532 -- the walk's air after each command of the wait (`airAfter`) is the room's, after the refusal's re-run", () => {
    type Air = { airAfter(seq: number): boolean | null };
    const r = rig();
    const air = (seq: number): boolean | null => (r.walk as unknown as Air).airAfter?.(seq) ?? null;
    r.frames(2);
    expect(air(r.sent().length), 'on the floor').toBe(false);           // today: no reader
    expect(air(r.sent().length + 5), 'not yet run').toBeNull();
    const knock = { velocity: [30, 200, 0] as [number, number, number], fall: 'fallBackwards' as const };
    const after = r.sent().length;
    expect(applyKnock(r.room.walker, r.room.moves as Traversal, knock)).toBe(true);   // the room laid it after `after`
    r.frames(2);
    r.take();
    const room = new Map<number, boolean>();
    r.frames(1); room.set(r.sent().length, r.room.walker.airborne);
    expect(r.walk.knock(knock, after), 'heard in the wait, replayed from before M - 1').toBe(true);
    for (let i = 0; i < 8; i++) { r.frames(); room.set(r.sent().length, r.room.walker.airborne); }
    r.refuse();
    expect([...room.values()].some((a) => a), 'the room ran some of the wait in the air').toBe(true);
    for (const [seq, a] of room) expect(air(seq), `after ${seq}`).toBe(a);
  });
});

// Review of #485, F3 (N4: the citation corrected): a knock pops the stack (`FUN_0057e770` -> `FUN_0058a4d0` D:L440997,
// before its fall's push) and a ladder's mount pops it to its base
// (D:L441547-441558, D:L442186-442214), so the door clip goes with them; a swap does not pop it (it is not FUN_005a2690's
// gate that applies to a push, only these pops).
describe('F3: a pushed clip is popped by a knock or a ladder, not by a swap', () => {
  const clips = {
    clips: [{ name: 'seal_open_door', frameCount: 14 }],
    table: [['seal_open_door', { playback: 0.8 }]],
  } as unknown as PlayClips;
  type Snap = Parameters<typeof stepFlinch>[1];
  const body = (over: Partial<Snap> = {}): Snap => ({ alive: true, traversal: null, action: null, ...over }) as Snap;
  const act = (name: string) => ({ name, serial: 1, t: 0, seconds: 1, reversed: false }) as Snap['action'];

  // N3: Prone cover too -- the knock's prone branch pushes it after the same pop (D:L440997, its push D:L441018).
  for (const name of ['fallForward', 'fallBackwards', 'landBackwards', 'proneCover']) {
    it(`a knock (${name}) drops it`, () => {
      const r = { flinch: { clip: 'seal_open_door', t: 0, pushed: true as const } };
      stepFlinch(r, body({ action: act(name) }), 0.1, clips);
      expect(r.flinch).toBeNull();
    });
  }

  it('a ladder clip drops it', () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0, pushed: true as const } };
    stepFlinch(r, body({ traversal: { clip: 'seal_ladder_climb', frame: 2, loop: true, rootY: null } }), 0.1, clips);
    expect(r.flinch).toBeNull();
  });

  it('a swap keeps it (drawn over the swap)', () => {
    const r = { flinch: { clip: 'seal_open_door', t: 0, pushed: true as const } };
    const s = body({ action: act('swapStand') });
    stepFlinch(r, s, 0.1, clips);
    expect(s.traversal).toMatchObject({ clip: 'seal_open_door' });
  });
});

// Review of #485, F4: offline (no room) the page's own press must still be cut by the stick past NoInterrupt -- its window
// sized from the walk's own commands, as the room sizes it (`Room.doorMotion`), by one helper.
describe('F4: the pushed clip\'s window from a start command (the room and the bare page alike)', () => {
  it('pushedWindow(101, playback 0.8, 14 keys, NoInterrupt 0.5): until 143, cutFrom 124', () => {
    expect(pushedWindow(101, 0.8, 14, 0.5)).toEqual({ start: 101, until: 143, cutFrom: 124 });
  });
  it('no NoInterrupt: cuttable from the push (cutFrom = start)', () => {
    expect(pushedWindow(10, 0.8, 25, null)).toEqual({ start: 10, until: 10 + 45, cutFrom: 10 });   // ceil(0.8 x (24/25)^2 x 60) = 45
  });
});

// The browser check of #485 (2026-10-24): on the real page the own body drew no `seal_open_door` and the jump under it
// was taken -- the clip was in neither the room's clips (`SIM_CLIPS`: the window is sized from its keys, `Room.doorMotion`)
// nor the pages' (`main.ts`'s and `matchMount.ts`'s asks of the worker: the pose needs its keys, `flinchPose`). The unit
// tests above hand in their own clips, so they could not see it.
describe('the door clip is loaded where it plays', () => {
  it("the room's SIM_CLIPS holds DOOR_CLIPS (seal_open_door; LATER 362: the kick's and its pistol pair), as it holds the flinches", async () => {
    const { SIM_CLIPS } = await import('../src/simMap');
    const { DOOR_CLIPS } = await import('../src/doors');
    expect(DOOR_CLIPS).toEqual(['seal_open_door', 'seal_kickopendoor', 'seal_p_kickopendoor']);
    for (const c of DOOR_CLIPS) expect(SIM_CLIPS).toContain(c);
  });

  it("both pages ask the worker for DOOR_CLIPS beside FLINCH_CLIPS (main.ts's clip list, matchMount.ts's MATCH_CLIPS)", async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    expect(src('main.ts')).toMatch(/\.\.\.FLINCH_CLIPS, \.\.\.DOOR_CLIPS,/);
    expect(src('matchMount.ts')).toMatch(/const MATCH_CLIPS = \[[^\]]*\.\.\.FLINCH_CLIPS, \.\.\.DOOR_CLIPS,/);
    // #485's narrow re-check, 1: the forge's own list (`forge/page.ts` MATCH_CLIPS), which both forge matches and the solo
    // room's sim clips load from (`forge/match.ts`).
    expect(src('forge/page.ts')).toMatch(/const MATCH_CLIPS = \[[^\]]*\.\.\.FLINCH_CLIPS, \.\.\.DOOR_CLIPS,/);
  });
});

// #485's narrow re-check, 3 (research 92 section 4): the door clip refuses no round -- its motion.rdr row has no `NoFire`,
// where the claymore's place reads 1 through the same reader (the control).
const READERC = fixture('RUN/READERC.ZAR');
describe.skipIf(!READERC)(`seal_open_door's motion.rdr row${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("has no NoFire (noFire null), NoInterrupt 0.5 and playback 0.8; the claymore's place reads NoFire 1", async () => {
    const { motionTableFromArchive } = await import('../src/motionTable');
    const table = motionTableFromArchive(READERC!);
    expect(table?.get('seal_open_door')).toMatchObject({ noFire: null, noInterrupt: 0.5, playback: 0.8, looped: false });
    expect(table?.get('seal_place_claymore')?.noFire).toBe(1);
  });
});

// LATER 512b (research 92 section 4, "LATER 512b's reading"; research 215 section 8.6, "The flinch at the take"): the
// climb's pop (`FUN_00580b70`) goes to one play standing and to two crouched or prone (`+0x174`, D:L442186-442214) --
// the posture's base, `Crouch` or `Prone` at slot 1 (`FUN_00588bc0` D:L446105-446118) -- and the flinch is pushed above
// that base (`FUN_0058a4d0` stops at `Stand`, `Crouch`, `Prone`, D:L446762-446765; the push D:L460019), so a climb takes
// the door clip and the flinch under it in every stance. The ladder pops to one (D:L441547-441558). The mount pops every
// play (`FUN_0058c350` -> `FUN_0058a5e0(actor, 0, 1)` D:L447984, D:L446796-446798), the flinch on top too.
describe('LATER 512b: a climb, a ladder and a mount pop the door clip and the flinch under it', () => {
  const clips = {
    clips: [{ name: 'seal_open_door', frameCount: 14 }, { name: 'seal_flinch_rarm', frameCount: 20 }],
    table: [['seal_open_door', { playback: 0.8 }], ['seal_flinch_rarm', { playback: 1 }]],
  } as unknown as PlayClips;
  type Snap = Parameters<typeof stepFlinch>[1];
  type Rec = Parameters<typeof stepFlinch>[0];
  const covered = (): Rec => ({ flinch: { clip: 'seal_open_door', t: 0.1, pushed: true as const }, under: { clip: 'seal_flinch_rarm', t: 0.2 } });

  const climbs = [TRAVERSAL_CLIP.stepUp, TRAVERSAL_CLIP.climbLow, TRAVERSAL_CLIP.climbMed, TRAVERSAL_CLIP.over];
  for (const stance of ['stand', 'crouch', 'prone'] as const) {
    it(`LATER 512b -- a climb's start (each climb clip) on another's body, ${stance}: the door clip and the covered flinch both gone, nothing handed back`, () => {
      for (const clip of climbs) {
        const r = covered();
        const s = { alive: true, action: null, stance, crouched: stance === 'crouch', traversal: { clip, frame: 1, loop: false, rootY: null } } as unknown as Snap;
        stepFlinch(r, s, 0.05, clips);
        expect([r.flinch, r.under ?? null], clip).toEqual([null, null]);
        expect(s.traversal?.clip, clip).toBe(clip);                                  // the climb's own clip drawn
      }
    });
  }
  it('LATER 512b -- a ladder (a ladder clip) on another\'s body: the door clip and the covered flinch both gone', () => {
    const r = covered();
    stepFlinch(r, { alive: true, action: null, traversal: { clip: TRAVERSAL_CLIP.toLadder, frame: 1, loop: false, rootY: null } } as unknown as Snap, 0.05, clips);
    expect([r.flinch, r.under ?? null]).toEqual([null, null]);
  });

  // The remote copy at the take: `RemotePlayers.frame` draws the turret's pose (`setMountPose`) over the body's play; the
  // original's take has popped the door clip and the flinch under it, so neither is drawn once the pose ends.
  it('RED: LATER 512b -- a mount on another\'s body pops its door clip and the flinch under it: nothing drawn after a short mount', () => {
    const rp = new remote.RemotePlayers(new Scene());
    rp.setClips(clips);
    let mounted = false;
    rp.setMountPose((id) => (mounted && id === 2 ? { clip: 'seal_turret_mount', frame: 0, loop: false, rootY: null } : null));
    const drawn: (string | null)[] = [];
    const stub = {
      id: 2, team: 'seal', type: 0, weapon: null, sidearm: null, item: 'rifle', snap: null, kit: null, deadFor: 0, deathClip: null, flinch: null,
      points: { rifle: [], pistol: [] }, view: { group: { visible: true } }, binocs: { update: () => undefined },
      hands: { follow: () => undefined, step: () => [] },
      play: {
        setItem: () => undefined, setMounts: () => undefined, setClips: () => undefined,
        frame: (_dt: number, src: { snapshot: () => { traversal: { clip: string } | null } }) => { drawn.push(src.snapshot().traversal?.clip ?? null); },
      },
    } as Record<string, unknown>;
    (rp as unknown as { remotes: Map<number, unknown> }).remotes.set(2, stub);
    const body = {
      id: 2, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0, ground: 0,
      groundForward: 0, groundRight: 0, groundCls: -1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1, overlay: 0, overlayT: 0,
      overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
    } as BodyState;
    rp.flinch(2, 'seal_flinch_rarm');
    rp.frame(0.1, [body], {} as never);
    rp.pushMotion(2, 'seal_open_door');
    rp.frame(0.1, [body], {} as never);
    expect(drawn).toEqual(['seal_flinch_rarm', 'seal_open_door']);
    mounted = true;                                                                    // the take
    rp.frame(0.2, [body], {} as never);
    mounted = false;                                                                   // a short mount, released
    rp.frame(0.05, [body], {} as never);
    expect(drawn.slice(2)).toEqual(['seal_turret_mount', null]);                      // today: the door clip drawn again
    expect([stub.flinch, stub.under ?? null]).toEqual([null, null]);
  });
});
