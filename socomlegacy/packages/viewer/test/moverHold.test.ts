// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrid, GAME_FRAME_DT, PLACE_CLAYMORE_ANIM, SEAL_TUNING, THROW_ANIMS, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import {
  ACTION_CLIPS, actionRoots, HOLD_CLIPS, HOLD_CODES, HOLD_SECONDS, LAUNCHER_RAISE_AIR_READING, launcherClipName, moverSnapshot, playedOutCommand, reloadHold, SCOPED_STICK, TICK, Walker, type HoldClip, type WalkInput,
} from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import { Traversal } from '../src/traversal';
import { decodeCommands, encodeCommands } from '../src/net/codec';
import { Button, HOLD_SHIFT, holdBits, holdOf, type Command } from '../src/net/protocol';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { SCOPE_SLOW } from '../src/zoom';
import { RUNNING_THROW_BODY_READING } from '../src/throwPose';

/**
 * The movement locks (the owner, 2026-09-29: "SOCOM should lock your movement when throwing a grenade or planting
 * certain equipment") and the scoped stick (research 84 section 17). The game's rule, read in the header of
 * `HOLD_CLIPS` (`./mover`): a throw, the claymore's placing and the crouched and prone reloads are one-shots pushed on
 * the actor's action stack (`FUN_00588bc0`); while a one-shot is on top the ground state does not run
 * (`FUN_00550ef0` 418172-418246, `FUN_005870e0` only on a cut), so the SEAL moves by the clip's root alone -- and the
 * stick cuts it only past the clip's `NoInterrupt` (`FUN_00587c20`). The scope's x 0.2 is the controller's, on the move
 * stick before anything reads it (`FUN_005966a0` 453818-453821).
 */

const RUN = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'), 'RUN');
const READERC = resolve(RUN, 'READERC.ZAR'), PACK = resolve(RUN, 'MOTION_P.ZAR');
const noDisc = !existsSync(READERC) || !existsSync(PACK);

function floor(): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
  };
}
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const plain = buildGrid(PARAMS, [], [], [floor()], OWNERS);

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

function walker(): Walker {
  const w = new Walker(plain);
  w.place(0, 10, 0);
  return w;
}

/** The phase a one-shot of `clip` is at `t` seconds in: `t / (playback (n - 1) / n)` (`FUN_0028c4f0`). */
const phaseAt = (clip: HoldClip, t: number): number => t / (HOLD_CLIPS[clip].playback * ((HOLD_CLIPS[clip].frames - 1) / HOLD_CLIPS[clip].frames));

describe.skipIf(noDisc)(`HOLD_CLIPS are the disc's${noDisc ? ' (READERC.ZAR or MOTION_P.ZAR absent)' : ''}`, () => {
  it("motion.rdr's playback and NoInterrupt, MOTION_P.ZAR's key counts and root travel; none a BlendOverlay or looped", () => {
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!;
    const names = Object.keys(HOLD_CLIPS) as HoldClip[];
    const clips = new Map(clipsFromPack(new Uint8Array(readFileSync(PACK)), names).map((c) => [c.name, c]));
    for (const n of names) {
      const c = HOLD_CLIPS[n], e = table.get(n)!, clip = clips.get(n)!;
      expect(e, n).toBeDefined();
      expect(e.playback, n).toBeCloseTo(c.playback, 6);
      expect(e.looped, n).toBe(false);
      expect(e.noInterrupt ?? 0, n).toBeCloseTo(c.noInterrupt, 6);
      expect(clip.frameCount, n).toBe(c.frames);
      // The pistol's upper-body clips (`seal_p_tossgrenade`, `seal_p_put_onwall`) carry no root track at all: in place.
      const root = clip.parts.find((p) => p.name === 'skel_root')?.translations ?? [];
      const last = 3 * (clip.frameCount - 1);
      if (root.length > 3) {
        expect(root[last]! - root[0]!, n).toBeCloseTo(c.travel[0], 1);
        expect(root[last + 2]! - root[2]!, n).toBeCloseTo(c.travel[1], 1);
      } else {
        expect(c.travel, n).toEqual([0, 0]);                       // one root key: the throws stand still
      }
    }
    // The moving reload is the upper body's (BlendOverlay): it holds nothing, so it is not a hold.
    expect(table.get('seal_mv_reload')).toBeDefined();
    expect('seal_mv_reload' in HOLD_CLIPS).toBe(false);
  });

  it('every throw clip GetThrowAnim picks and the claymore\'s placing are holds; the root keys reach the sim', () => {
    for (const a of [...Object.values(THROW_ANIMS), PLACE_CLAYMORE_ANIM]) expect(a.clip in HOLD_CLIPS, a.clip).toBe(true);
    const roots = actionRoots(clipsFromPack(new Uint8Array(readFileSync(PACK)), Object.keys(HOLD_CLIPS)));
    expect(roots.has('seal_place_claymore')).toBe(true);
    expect(roots.has('seal_crouch_reload')).toBe(true);
  });
});

describe('the lock: a throw holds the SEAL until the stick may cut it (FUN_00550ef0, FUN_00587c20)', () => {
  it('a standing throw stops a run dead and holds it past the release, to NoInterrupt 0.49', () => {
    const w = walker();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);                  // running
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeGreaterThan(20);
    expect(w.hold('seal_throwgrenade')).toBe(true);
    const x = w.state.x, z = w.state.z;
    let ticks = 0, before = { x: w.state.x, z: w.state.z };
    while (w.holding && ticks < 600) { before = { x: w.state.x, z: w.state.z }; w.tick(FORWARD); ticks++; }
    // Held while the phase is at or under 0.49 (the release is 0.46: the grenade is out before the stick may cut).
    // PAR-70 (research 251 section 12.5): the throw's push lands after the frame's driver, as the still reload's
    // (PAR-67), so the cut reads the phase a game frame behind the hold's clock -- tick 48, not 46.
    const heldFor = ticks * TICK;
    expect(phaseAt('seal_throwgrenade', heldFor - TICK - GAME_FRAME_DT)).toBeLessThanOrEqual(0.49 + 1e-9);
    expect(phaseAt('seal_throwgrenade', heldFor - GAME_FRAME_DT)).toBeGreaterThan(0.49);
    expect(ticks).toBe(48);
    expect(heldFor).toBeGreaterThan(0.71);                        // the release, 0.46 x 1.6 x 27/28
    // The throw's root does not travel: through the hold the SEAL did not move, whatever the stick asked -- up to the
    // tick that cut it, where the ground state runs again.
    expect(Math.hypot(before.x - x, before.z - z)).toBeLessThan(1e-6);
    // Cut, the ground state runs again: the SEAL moves off.
    for (let i = 0; i < 30; i++) w.tick(FORWARD);
    expect(Math.hypot(w.state.x - x, w.state.z - z)).toBeGreaterThan(1);
  });

  it('each hold taken counts once (moverSnapshot holdSerial): a hold taken again on the same clip is told apart', () => {
    const w = walker();
    expect(moverSnapshot(w, null, 0, 0).holdSerial).toBeUndefined();
    expect(w.hold('seal_throwgrenade')).toBe(true);
    const first = moverSnapshot(w, null, 0, 0);
    expect(first.hold).toBe('seal_throwgrenade');
    w.runHold(HOLD_SECONDS.seal_throwgrenade + GAME_FRAME_DT);   // PAR-70: off on the lagged clock, past its last key
    expect(w.holding).toBeNull();
    expect(moverSnapshot(w, null, 0, 0).holdSerial).toBeUndefined();
    expect(w.hold('seal_throwgrenade')).toBe(true);
    const second = moverSnapshot(w, null, 0, 0);
    expect(second.hold).toBe('seal_throwgrenade');
    expect(second.holdSerial).toBe(first.holdSerial! + 1);
    expect(w.hold('no_such_clip')).toBe(false);                    // a refused hold does not count
    expect(moverSnapshot(w, null, 0, 0).holdSerial).toBe(first.holdSerial! + 1);
  });

  it('held with the stick at rest it runs to the clip\'s end, then lets go by itself', () => {
    const w = walker();
    expect(w.hold('seal_tossgrenade')).toBe(true);
    const n = Math.ceil(HOLD_SECONDS.seal_tossgrenade / TICK);
    for (let i = 0; i < n - 1; i++) w.tick(STILL);
    expect(w.holding?.clip).toBe('seal_tossgrenade');
    w.tick(STILL); w.tick(STILL);
    expect(w.holding).toBeNull();
  });

  it('each throw holds to its own NoInterrupt: the crouched 0.8, prone 0.9, the peeks\' tosses 0.9', () => {
    for (const clip of ['seal_crouch_throwgrenade', 'seal_prone_throwgrenade', 'seal_prone_tossgrenade', 'seal_toss_rlean', 'seal_toss_llean'] as HoldClip[]) {
      const w = walker();
      expect(w.hold(clip), clip).toBe(true);
      let ticks = 0;
      while (w.holding && ticks < 600) { w.tick(FORWARD); ticks++; }
      // PAR-70: on the phase a game frame behind the hold's clock (the push after the driver); was `ticks * TICK`.
      expect(phaseAt(clip, ticks * TICK - GAME_FRAME_DT), clip).toBeGreaterThan(HOLD_CLIPS[clip].noInterrupt);
      expect(phaseAt(clip, (ticks - 1) * TICK - GAME_FRAME_DT), clip).toBeLessThanOrEqual(HOLD_CLIPS[clip].noInterrupt + 1e-9);
    }
  });

  it('the turn stays free (no NoTurn on these clips), and a turn past NoInterrupt cuts it as the stick does', () => {
    const w = walker();
    w.hold('seal_throwgrenade');
    w.state.yaw = 90;
    w.tick(STILL);
    expect(w.state.yaw).toBe(90);
    expect(w.holding).not.toBeNull();
    while (phaseAt('seal_throwgrenade', w.holding!.t - GAME_FRAME_DT) <= 0.49) w.tick(STILL);   // PAR-70: the lagged phase
    w.turn = SEAL_TUNING.turnMaxRate * 0.5;
    w.tick(STILL);
    expect(w.holding).toBeNull();
  });

  it('no jump while a hold is on the stack (FUN_0057e1b0 wants a looped top entry)', () => {
    const w = walker();
    w.hold('seal_throwgrenade');
    expect(w.jump()).toBe(false);
  });

  it('placing the claymore holds for 0.9 of its 2.7 s, moving by its root alone', () => {
    const w = walker();
    expect(w.hold('seal_place_claymore')).toBe(true);
    let ticks = 0;
    const x = w.state.x, z = w.state.z;
    while (w.holding && ticks < 600) { w.tick(FORWARD); ticks++; }
    // PAR-74: the claymore's push lands after the driver, so the cut reads the phase a game frame behind the hold's clock
    // (was: past 0.9 x 2.7 x 54/55 on the hold's own clock, under two ticks more).
    expect(ticks * TICK).toBeGreaterThan(0.9 * 2.7 * (54 / 55) + GAME_FRAME_DT);
    expect(ticks * TICK).toBeLessThan(0.9 * 2.7 * (54 / 55) + GAME_FRAME_DT + 2 * TICK);
    expect(Math.hypot(w.state.x - x, w.state.z - z)).toBeLessThan(1);   // the root's 0.4 over the clip, not a run
  });

  // PAR-86 (research 251 section 12.8) keeps this pin: the original pushes no throw off the floor (`FUN_0059d830`
  // D:L457369-457371, asked by the chase and the release request), and refuses the reload there (`FUN_005c2a90`
  // D:L477395); the page's thrower holds its wind-up through the flight instead (`throwInAir.test.ts`).
  it('a hold is refused in the air, and dropped by a new place', () => {
    const w = walker();
    w.hold('seal_throwgrenade');
    w.place(10, 10, 10);
    expect(w.holding).toBeNull();
    w.setAirborne(true, 0);
    expect(w.hold('seal_throwgrenade')).toBe(false);
  });
});

describe('the reloads (FUN_005a82e0): still, a one-shot that holds; moving, the upper body\'s overlay', () => {
  it('picks the clip by stance and weapon; standing takes none (seal_reload has no NoInterrupt: the stick cuts it at once)', () => {
    expect(reloadHold('stand', false)).toBeNull();
    expect(reloadHold('stand', true)).toBeNull();
    expect(reloadHold('crouch', false)).toBe('seal_crouch_reload');
    expect(reloadHold('crouch', true)).toBe('seal_p_crouch_reload');
    expect(reloadHold('prone', false)).toBe('seal_prone_reload');
    expect(reloadHold('prone', true)).toBe('seal_p_prone_reload');
  });

  it('crouched and still, the reload holds to NoInterrupt 0.35; moving faster than 20 it is refused (the overlay)', () => {
    const w = walker();
    w.stance = 'crouch';
    expect(w.hold('seal_crouch_reload')).toBe(true);
    let ticks = 0;
    while (w.holding && ticks < 600) { w.tick(FORWARD); ticks++; }
    // PAR-67 (research 251 section 12.5): the reload's push lands after the frame's driver, so the cut reads the clip's
    // phase a game frame behind the hold's clock (`RELOAD_PUSH_LAG`): tick 41, not 39.
    expect(phaseAt('seal_crouch_reload', ticks * TICK - GAME_FRAME_DT)).toBeGreaterThan(0.35);
    expect(phaseAt('seal_crouch_reload', (ticks - 1) * TICK - GAME_FRAME_DT)).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(ticks).toBe(41);
    const m = walker();
    m.state.vx = 25;
    m.stance = 'crouch';
    expect(m.hold('seal_crouch_reload')).toBe(false);
    // the throws take no speed test: the clip goes on whatever the SEAL was doing
    expect(m.hold('seal_throwgrenade')).toBe(true);
  });

  // PAR-69 (research 251 section 12.5): the hold is the reload's still clip, popped by the driver's end test before its
  // advance (`FUN_00582540` D:L418193 -> `FUN_0028c6e0` D:L134291-134302) on the phase a game frame behind the push's
  // clock (PAR-67) plus half the clip's own frame step: it comes off once `(t - G) / (P e) + G / (2 Q e) > e`, a
  // command past the tick that reaches its last key (`HOLD_SECONDS`).
  it("PAR-69: left uncut, a reload hold comes off on the lagged clock, a command past its last key -- the crouched 108th tick (not the 107th), the others the 97th (not the 96th); since PAR-70 a throw too (the toss's 91st, not the 90th)", () => {
    const want: [HoldClip, number, number][] = [
      ['seal_crouch_reload', 107, 108], ['seal_p_crouch_reload', 96, 97], ['seal_prone_reload', 96, 97], ['seal_p_prone_reload', 96, 97],
    ];
    for (const [clip, lastKey, end] of want) {
      expect(Math.ceil(HOLD_SECONDS[clip] / TICK - 1e-9), clip).toBe(lastKey);   // the tick that reaches the last key
      const c = HOLD_CLIPS[clip], e = (c.frames - 1) / c.frames;
      expect(Math.floor((HOLD_SECONDS[clip] + GAME_FRAME_DT / 2) * 60) + 1, clip).toBe(end);
      const w = walker();
      expect(w.hold(clip), clip).toBe(true);
      let ticks = 0;
      while (w.holding && ticks < 600) { w.tick(STILL); ticks++; }
      expect(ticks, clip).toBe(end);
      expect((ticks * TICK - GAME_FRAME_DT) / (c.playback * e) + GAME_FRAME_DT / (2 * c.playback * e), clip).toBeGreaterThan(e);
    }
    // PAR-69 had a throw's hold keep the push's own clock (its push's frame unread, HOLD_PUSH_FRAME_READING): the
    // 90th tick. PAR-70 read it after the driver too: the 91st, a command past its last key (the case below).
    const t = walker();
    expect(t.hold('seal_tossgrenade')).toBe(true);
    let ticks = 0;
    while (t.holding && ticks < 600) { t.tick(STILL); ticks++; }
    expect(Math.ceil(HOLD_SECONDS.seal_tossgrenade / TICK - 1e-9)).toBe(90);
    expect(ticks).toBe(91);
  });
});

// PAR-72 (research 251 section 12.5, "PAR-72"): the order of the cut and the end on the end's own tick. The ground
// driver asks the cut first (`FUN_00550ef0` D:L418180) and the end only when nothing cut (D:L418192-418193), but the cut's
// own test asks the end first: `FUN_00587c20` runs `FUN_0028c6e0` on the frame's dt and the top (D:L445526-445527) and
// answers 0 when it fires (D:L445528, D:L445572-445573) -- the same test, on the same arguments, that `FUN_00582540`
// then asks (D:L442925). So on the tick the end test first passes the stick cuts nothing and the play comes off uncut;
// the port's end-first order (`runClocks`' `runHold` before `holdCut`) is the original's. Pinned here, nothing changed.
describe('PAR-72: on the end\'s own tick the stick cuts no hold (FUN_00587c20 D:L445526-445528 refuses the cut when FUN_0028c6e0 fires)', () => {
  /** The tick the hold of `clip` comes off and why, the stick pushed past 0.1 on tick `pushAt` alone (0: never). */
  const offWith = (clip: HoldClip, pushAt: number, pass?: 'before'): { tick: number; reason: string } => {
    const w = walker();
    let reason = '';
    w.onActionEnd((e) => { if (e.body?.source === 'hold') reason = e.reason; });
    expect(w.hold(clip, undefined, pass), clip).toBe(true);
    let tick = 0;
    while (w.holding && tick < 600) { tick++; w.tick(tick === pushAt ? FORWARD : STILL); }
    return { tick, reason };
  };

  it("a push on the uncut end's own tick ends every hold uncut on that tick ('complete', not 'cut'); a push on the tick before cuts it there -- the four reload holds, the eight throws (lagged), the claymore's placing (lagged since PAR-74) and the bomb's plant (the push's own clock)", () => {
    // The uncut ends: PAR-69's and PAR-70's tables (research 251 section 12.5). The claymore's placing was the 157th here
    // (PAR-70: the push's own clock, its last key); PAR-74 moved it to the 158th, the claymore's and the PMN's push after
    // the driver, and the bomb's plant (the same code, pushed before it) to the 156th.
    const want: [HoldClip, number, ('before' | undefined)?][] = [
      ['seal_crouch_reload', 108], ['seal_p_crouch_reload', 97], ['seal_prone_reload', 97], ['seal_p_prone_reload', 97],
      ['seal_throwgrenade', 91], ['seal_tossgrenade', 91], ['seal_crouch_throwgrenade', 61], ['seal_prone_throwgrenade', 91],
      ['seal_prone_tossgrenade', 63], ['seal_toss_rlean', 72], ['seal_toss_llean', 68], ['seal_p_tossgrenade', 114],
      ['seal_place_claymore', 158], ['seal_place_claymore', 156, 'before'],
    ];
    for (const [clip, end, pass] of want) {
      expect(offWith(clip, 0, pass), `${clip} ${pass ?? ''} at rest`).toEqual({ tick: end, reason: 'complete' });
      expect(offWith(clip, end, pass), `${clip} ${pass ?? ''} pushed on its end's tick`).toEqual({ tick: end, reason: 'complete' });
      expect(offWith(clip, end - 1, pass), `${clip} ${pass ?? ''} pushed the tick before`).toEqual({ tick: end - 1, reason: 'cut' });
    }
  });
});

// PAR-70 (research 251 section 12.5; reading, pending review): where each hold's push lands in the frame. A throw's
// push is the kit's frame's -- `FUN_005c0fd0` (the actor update's, D:L417907, `entity_post_tick`) calls `FUN_005be9a0`
// (D:L476624, D:L476638), whose hand-grenade branch pushes `GetThrowAnim`'s clip through `FUN_005802b0` (D:L475501 ->
// D:L441900); `FUN_005be9a0`'s other caller `FUN_005c0020` (D:L475994) fires only 0x97, 0x98 and 0x9a, whose branches
// come before it -- so every throw lands after the frame's driver (`FUN_001ec480` D:L50925, D:L50929), its cut and its
// uncut end a game frame behind the push's clock, as the still reload's (PAR-67, PAR-69). C4's `Put on wall` is pushed
// from the Action button in the player controller's tick (`FUN_00594cf0` D:L453222/D:L453243 -> `FUN_00592d50`
// D:L452055 -> `FUN_005c0020` -> D:L475420), the pad's copy's (`entity_pre_tick`, D:L418526): before the driver, the
// push's own clock. `Place claymore` is pushed from both (the claymore's and the PMN's from the kit's frame, D:L475322,
// D:L475354; the bomb's plant from the controller's tick, D:L453273 -> D:L451514 -> D:L475481) and from the bomb's drop
// (D:L457611, its pass unread): one hold code for all, so it keeps the push's own clock (HOLD_PUSH_FRAME_READING).
// PAR-82 (research 251 section 12.3, "PAR-82"; PTW.R3 with roomReloadLock.test and stillReloadLife.test): the reload holds
// the fall covers and a clipless landing hands back (PAR-79, `COVERED_HOLDS`) stand in for every family's crouched and
// prone still clip (H77) -- `Rifle m203 reload` among them, which no fall covers (`FUN_005af930` D:L466816-466828) and
// any landing pops (D:L466897, D:L466900-466901). The mover cannot tell the stand-in apart: the room and the page tell it
// (`Walker.holdCovered`, from the still clip's life). Unasked (null), every hold of the set is covered, as PAR-79 built.
describe('PAR-82: a reload hold the fall does not cover is never handed back (Walker.holdCovered)', () => {
  /** A crouched reload hold taken off the floor 10 ticks in, run to a clipless landing (the stick at full): the hold after it. */
  const flown = (covers: boolean | null): string | null => {
    const w = walker();
    w.stance = 'crouch';
    for (let i = 0; i < 60; i++) w.tick(STILL);
    if (covers !== null) { const told: boolean = covers; w.holdCovered = () => told; }
    expect(w.hold('seal_crouch_reload')).toBe(true);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(w.holding?.clip).toBe('seal_crouch_reload');
    w.state.y += 6;
    w.setAirborne(true);
    expect(w.holding).toBeNull();                                                 // the one hold slot: the fall's
    for (let i = 0; i < 120 && w.airborne; i++) w.tick(FORWARD);
    expect(w.landing?.clip).toBeNull();
    return w.holding?.clip ?? null;
  };

  it("covered (PAR-79's: unasked, or asked yes) the hold is handed back at a clipless landing; asked no (the m203's stand-in) it is not -- the take-off ended it, replaced", () => {
    expect(flown(null)).toBe('seal_crouch_reload');
    expect(flown(true)).toBe('seal_crouch_reload');
    expect(flown(false)).toBeNull();
  });
});

describe('PAR-70: the throws\' holds lag the push by a game frame, as the still reload\'s; the plants\' keep its clock', () => {
  /** The tick a hold comes off, the stick held at `input` from its first. */
  const offAt = (clip: HoldClip, input: WalkInput): number => {
    const w = walker();
    expect(w.hold(clip), clip).toBe(true);
    let ticks = 0;
    while (w.holding && ticks < 600) { w.tick(input); ticks++; }
    return ticks;
  };

  it('each throw is cut two commands later and comes off uncut one command later than on the push\'s own clock (the stick held from the push; at rest)', () => {
    // [clip, first cut on the push's clock, PAR-70's, the uncut end on the push's clock (the last key), PAR-70's]
    const want: [HoldClip, number, number, number, number][] = [
      ['seal_throwgrenade', 46, 48, 90, 91], ['seal_tossgrenade', 70, 72, 90, 91],
      ['seal_crouch_throwgrenade', 51, 53, 60, 61], ['seal_prone_throwgrenade', 84, 86, 90, 91],
      ['seal_prone_tossgrenade', 58, 60, 62, 63], ['seal_toss_rlean', 66, 68, 71, 72],
      ['seal_toss_llean', 63, 65, 67, 68], ['seal_p_tossgrenade', 93, 95, 113, 114],
    ];
    for (const [clip, cutBefore, cut, endBefore, end] of want) {
      const c = HOLD_CLIPS[clip], e = (c.frames - 1) / c.frames;
      expect(Math.floor(c.noInterrupt * c.playback * e * 60) + 1, clip).toBe(cutBefore);   // the first k with k / 60 / (P e) past it
      expect(Math.ceil(HOLD_SECONDS[clip] / TICK - 1e-9), clip).toBe(endBefore);
      expect(offAt(clip, FORWARD), clip).toBe(cut);
      expect(offAt(clip, STILL), clip).toBe(end);
    }
  });

  // PAR-70 pinned here the claymore's placing on the push's own clock (cut on the 144th, off on its last key's 157th) and
  // C4 off on its last key's 143rd. Moved by PAR-74 and PAR-75 (the describe below): the claymore's and the PMN's push
  // lands after the driver (the 146th, the 158th), the bomb's plant keeps the 144th and ends on the push's own end test
  // (the 156th), C4 ends on it too (the 142nd).
  it("C4's plant is never cut ('NoInterrupt ()' bare), its last key the 143rd command (its end: PAR-75 below)", () => {
    for (const clip of ['seal_put_onwall', 'seal_p_put_onwall'] as HoldClip[]) {
      expect(offAt(clip, FORWARD), clip).toBe(offAt(clip, STILL));   // `NoInterrupt ()` bare: the stick never cuts it
      expect(Math.ceil(HOLD_SECONDS[clip] / TICK - 1e-9), clip).toBe(143);
    }
  });
});

// PAR-74 and PAR-75 (research 251 section 12.5, "PAR-74"; reading, pending review): each placing on its own push's pass.
// `Place claymore` is one hold code for pushes on both sides of the driver: the claymore's and the PMN's from the kit's
// frame (`FUN_005be9a0` -0x67 D:L475322, -0x62 D:L475354, reached from `FUN_005c0fd0` D:L476624/D:L476638 in
// `entity_post_tick`) -- after it, the phase a game frame behind the push's clock, as the throws' (PAR-70); the bomb's
// plant from the controller's tick (`FUN_00594cf0` D:L453273 -> `FUN_005920c0` D:L451514 -> D:L475481, `entity_pre_tick`)
// -- before it, on the push's own clock. C4's `Put on wall` (0x3e; the pistol's 0x83) is pushed before it too
// (`FUN_00592d50` D:L452055 -> D:L475420). Neither the placing's nor the plant's play carries an end callback
// (D:L475322-475330, D:L475480-475488); C4's (`LAB_005bfe40` at 0.45, D:L475443-475445) is run and cleared by the advance
// at its key (`FUN_0057a330` D:L438996-439003), long before the stop -- so `FUN_00582540` answers 1 on the end test's first
// pass for all three (D:L443131-443132). The end test (`FUN_0028c6e0` D:L134283-134308): after the driver
// `reloadPlayedOut`'s, before it `swapPlayedOut`'s. The pass is the item's: the mover takes it with the hold (`Walker.hold`'s
// `pass`), for `seal_place_claymore` alone; every other code fixes its own.
describe("PAR-74 and PAR-75: the placings on their own push's pass -- the claymore's and the PMN's after the driver, the bomb's plant and C4's before it", () => {
  const offAt = (clip: HoldClip, input: WalkInput, pass?: 'before' | 'after'): number => {
    const w = walker();
    expect(w.hold(clip, undefined, pass), clip).toBe(true);
    let ticks = 0;
    while (w.holding && ticks < 600) { w.tick(input); ticks++; }
    return ticks;
  };

  it("the claymore's and the PMN's placing (the default for the code): cut on the 146th command, off uncut on the 158th (the push's own clock: 144, 157)", () => {
    const c = HOLD_CLIPS.seal_place_claymore, e = (c.frames - 1) / c.frames, G = GAME_FRAME_DT;
    expect(Math.floor((c.noInterrupt * c.playback * e + G) * 60) + 1).toBe(146);   // (t - G) / (P e) past 0.9
    expect(Math.floor((c.playback * e * e + G / 2) * 60) + 1).toBe(158);            // (t - G) / (P e) + G / (2 P e) past e
    expect(offAt('seal_place_claymore', FORWARD)).toBe(146);
    expect(offAt('seal_place_claymore', STILL)).toBe(158);
    expect(offAt('seal_place_claymore', FORWARD, 'after')).toBe(146);
    expect(offAt('seal_place_claymore', STILL, 'after')).toBe(158);
  });

  it("the bomb's plant (the same code, pushed before the driver): cut on the 144th (the push's own clock), off uncut on the 156th (its end test, not the last key's 157th)", () => {
    const c = HOLD_CLIPS.seal_place_claymore, e = (c.frames - 1) / c.frames, G = GAME_FRAME_DT;
    expect(Math.floor((c.playback * e * e - G / 2) * 60) + 1).toBe(156);            // t / (P e) + G / (2 P e) past e
    expect(offAt('seal_place_claymore', FORWARD, 'before')).toBe(144);
    expect(offAt('seal_place_claymore', STILL, 'before')).toBe(156);
  });

  it("PAR-75: C4's plant, rifle and pistol, never cut, off on the 142nd command -- the end test on the push's own clock, its callback already cleared (was the last key's 143rd)", () => {
    for (const clip of ['seal_put_onwall', 'seal_p_put_onwall'] as HoldClip[]) {
      const c = HOLD_CLIPS[clip], e = (c.frames - 1) / c.frames;
      expect(Math.floor((c.playback * e * e - GAME_FRAME_DT / 2) * 60) + 1, clip).toBe(142);
      expect(offAt(clip, FORWARD), clip).toBe(142);
      expect(offAt(clip, STILL), clip).toBe(142);
      // C4's callback key (0.45 of the clip) lies 76 commands before its end: the advance clears it long before.
      expect(Math.floor(0.45 * c.playback * e * 60) + 1, clip).toBeLessThan(80);
    }
  });

  it('the pass is the code\'s for every hold but the claymore\'s placing: a pass asked of a throw, a reload or C4 changes nothing', () => {
    expect(offAt('seal_throwgrenade', FORWARD, 'before')).toBe(48);              // PAR-70's lagged cut kept
    expect(offAt('seal_throwgrenade', STILL, 'before')).toBe(91);
    expect(offAt('seal_put_onwall', STILL, 'after')).toBe(142);
    const w = walker();
    w.stance = 'crouch';
    expect(w.hold('seal_crouch_reload', undefined, 'before')).toBe(true);
    let ticks = 0;
    while (w.holding && ticks < 600) { w.tick(STILL); ticks++; }
    expect(ticks).toBe(108);                                                         // PAR-69's lagged end kept
  });

  it('the room\'s mover takes the pass through MoverSim (holdPass, beside holdPeriod), on the command that carries the code', () => {
    const run = (pass: 'before' | undefined): number => {
      const sim = new MoverSim(walker(), null);
      sim.holdPass = () => pass;
      let seq = 0, n = 0;
      const cmd = (buttons: number): Command => ({ seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0 });
      sim.apply(cmd(holdBits('seal_place_claymore')));
      n = 1;
      while (sim.walker.holding && n < 600) { sim.apply(cmd(0)); n++; }
      return n;
    };
    expect(run('before')).toBe(156);
    expect(run(undefined)).toBe(158);
  });
});

// PARITY-2, PAR-76 (research 251 section 12.6; reading, pending review): a throw let go on the run is the standing
// throw's push. `GetThrowAnim` (`FUN_0057fce0`) reads no speed standing (D:L441845-441870) and gives a crouched SEAL
// moving faster than 15 the standing throw (D:L441827-441844); `FUN_005802b0` pushes it through `FUN_00588bc0`
// (D:L441900), which sends only a `BlendOverlay` motion to the second channel (D:L446083-446085) and every other one onto
// the stack (D:L446292). No throw on the disc is one, and none is a moving variant: the run stops with the ground state
// and the stick cuts the throw at the same phase as from rest (`FUN_00587c20` D:L445524-445573 reads no speed).
describe.skipIf(noDisc)(`PAR-76: no throw rides the second channel${noDisc ? ' (READERC.ZAR absent)' : ''}`, () => {
  it("every SEAL throw and toss in motion.rdr is a one-shot with BlendOverlay clear; the SEAL's BlendOverlay clips are the moving reloads, the moving pump and the moving swaps only", () => {
    const table = motionTableFromArchive(new Uint8Array(readFileSync(READERC)))!;
    const seal = [...table.keys()].filter((n) => n.startsWith('seal_'));
    const throws = seal.filter((n) => /throw|toss/.test(n));
    expect(throws.sort()).toEqual([
      'seal_crouch_throwgrenade', 'seal_p_throwgrenade', 'seal_p_toss_llean', 'seal_p_toss_rlean', 'seal_p_tossgrenade',
      'seal_prone_throwgrenade', 'seal_prone_tossgrenade', 'seal_returnthrow', 'seal_throwgrenade', 'seal_toss_llean',
      'seal_toss_rlean', 'seal_tossgrenade',
    ]);
    for (const n of throws) {
      expect(table.get(n)!.looped, n).toBe(false);
      expect(table.get(n)!.blendOverlay ?? false, n).toBe(false);
    }
    expect(seal.filter((n) => table.get(n)!.blendOverlay).sort()).toEqual([
      'seal_mv_pistol2launcher', 'seal_mv_pump_shotgun', 'seal_mv_reload', 'seal_mv_reload_shotgun',
      'seal_mv_rifle2launcher', 'seal_mv_rifle2pistol', 'seal_p_mv_reload',
    ]);
  });
});

describe('PAR-76: a throw let go on the run holds as one let go at rest (research 251 section 12.6)', () => {
  /** The tick a hold comes off, from rest or after `run` ticks of a full stick, then the stick at `input`. */
  const offAt = (clip: HoldClip, run: number, input: WalkInput): { ticks: number; moved: number; speed: number } => {
    const w = walker();
    for (let i = 0; i < run; i++) w.tick(FORWARD);
    const speed = Math.hypot(w.state.vx, w.state.vz);
    expect(w.hold(clip), clip).toBe(true);
    const x = w.state.x, z = w.state.z;
    let ticks = 0, moved = 0;
    while (w.holding && ticks < 600) {
      w.tick(input); ticks++;
      if (w.holding) moved = Math.max(moved, Math.hypot(w.state.x - x, w.state.z - z));
    }
    return { ticks, moved, speed };
  };

  it("from a full run, the stick held: cut on the 48th command (the toss the 72nd), as from rest; the SEAL not moved before it; left at rest off on the 91st", () => {
    for (const [clip, cut, end] of [['seal_throwgrenade', 48, 91], ['seal_tossgrenade', 72, 91]] as [HoldClip, number, number][]) {
      const still = offAt(clip, 0, FORWARD), running = offAt(clip, 60, FORWARD);
      expect(running.speed, clip).toBeGreaterThan(20);
      expect(still.ticks, clip).toBe(cut);
      expect(running.ticks, clip).toBe(cut);
      expect(running.moved, clip).toBeLessThan(1e-6);                // stopped dead: the throw's root has one key
      expect(offAt(clip, 60, STILL).ticks, clip).toBe(end);
    }
  });

  // PAR-85 (research 251 section 12.9): was titled "RUNNING_THROW_BODY_READING: beneath the throw the port runs the live
  // locomotion, which the hold sets idle; the original keeps the run covered on the stack" (the reading `'locomotion'`).
  it("RUNNING_THROW_BODY_READING: 'snapshot' -- the mover's ground goes idle under the hold, and the body keeps the run covered beneath the throw (./animator, PAR-85)", () => {
    expect(RUNNING_THROW_BODY_READING).toBe('snapshot');
    const w = walker();
    for (let i = 0; i < 60; i++) w.tick(FORWARD);
    expect(w.ground.state).not.toBe('idle');
    expect(w.hold('seal_throwgrenade')).toBe(true);
    w.tick(FORWARD);
    expect(w.ground.state).toBe('idle');
  });
});

describe('the scope\'s x 0.2 on the move stick (FUN_005966a0 453818-453821), in the shared mover', () => {
  it('is the literal 0.2 of FUN_005966a0 453818-453821, the same value as zoom.ts\'s SCOPE_SLOW', () => {
    expect(SCOPED_STICK).toBe(SCOPE_SLOW);
    expect(SCOPED_STICK).toBe(0.2);
  });

  it('a scoped full stick walks exactly as an unscoped stick of 0.2', () => {
    const a = walker(), b = walker();
    a.scoped = true;
    for (let i = 0; i < 120; i++) { a.tick(FORWARD); b.tick({ forward: 0.2, right: 0, boost: false }); }
    expect(a.state.x).toBeCloseTo(b.state.x, 9);
    expect(a.state.z).toBeCloseTo(b.state.z, 9);
    const c = walker();
    for (let i = 0; i < 120; i++) c.tick(FORWARD);
    expect(Math.hypot(a.state.x, a.state.z)).toBeLessThan(0.5 * Math.hypot(c.state.x, c.state.z));
  });
});

describe('the wire: the server runs the same holds and the same scope (MoverSim, Button.Scope, the hold code)', () => {
  const cmd = (seq: number, buttons: number, forward = 1): Command => ({ seq, forward, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0 });

  it('HOLD_CODES name every hold, in four bits over HOLD_SHIFT, clear of every Button', () => {
    expect(HOLD_CODES.length).toBe(Object.keys(HOLD_CLIPS).length);
    expect(HOLD_CODES.length).toBeLessThanOrEqual(15);
    for (const b of Object.values(Button)) expect(b >> HOLD_SHIFT, `button ${b}`).toBe(0);
    for (const c of HOLD_CODES) expect((holdBits(c) >> HOLD_SHIFT) & 0xf).toBe(HOLD_CODES.indexOf(c) + 1);
    expect(HOLD_SHIFT + 4).toBeLessThanOrEqual(16);                // the command's u16
  });

  it("the codes are appended, never renumbered: the first twelve keep their numbers, C4 and the pistol's toss and plant take 13-15", () => {
    expect(HOLD_CODES).toEqual([
      'seal_throwgrenade', 'seal_tossgrenade', 'seal_crouch_throwgrenade', 'seal_prone_throwgrenade', 'seal_prone_tossgrenade',
      'seal_toss_rlean', 'seal_toss_llean', 'seal_place_claymore', 'seal_crouch_reload', 'seal_p_crouch_reload',
      'seal_prone_reload', 'seal_p_prone_reload', 'seal_put_onwall', 'seal_p_tossgrenade', 'seal_p_put_onwall',
    ]);
  });

  it('the bits survive the command frame (a u16 of buttons)', () => {
    const buttons = Button.Scope | Button.Trigger | holdBits('seal_p_prone_reload');
    const [back] = decodeCommands(encodeCommands({ viewTick: 3, commands: [cmd(9, buttons)] })).commands;
    expect(back!.buttons).toBe(buttons);
    expect(holdOf(back!.buttons)).toBe('seal_p_prone_reload');
    expect(holdOf(Button.Scope | Button.Trigger)).toBeNull();
  });

  it('a hold and the scope on the command move the server\'s mover as the page moved its own', () => {
    const page = walker(), server = new MoverSim(walker(), null);
    const script: number[] = [0, 0, Button.Scope, Button.Scope, holdBits('seal_throwgrenade'), 0, 0];
    let seq = 0;
    for (const buttons of script) {
      for (let i = 0; i < 20; i++) {
        seq++;
        const first = i === 0;
        page.scoped = (buttons & Button.Scope) !== 0;
        if (first && (buttons >> HOLD_SHIFT)) page.hold('seal_throwgrenade');
        page.tick(FORWARD);
        server.apply(cmd(seq, first ? buttons : buttons & ~(0xf << HOLD_SHIFT)));
      }
    }
    expect(server.walker.state.x).toBeCloseTo(page.state.x, 9);
    expect(server.walker.state.z).toBeCloseTo(page.state.z, 9);
  });
});

describe('the page: WalkMode sends what its mover did', () => {
  const GROUND: GroundData = packGround(PARAMS, [floor()], OWNERS);
  function rig() {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined;
    c.releasePointerCapture = () => undefined;
    c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    walk.setGround(GROUND, [0, 0, 0]);
    fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
    walk.setMode('walk');
    fly.groundWish = () => ({ forward: 1, right: 0, boost: false });
    const sent: Omit<Command, 'seq'>[] = [];
    walk.setNetTap((cmd) => sent.push(cmd));
    const tick = (): Omit<Command, 'seq'>[] => { const from = sent.length; walk.frame(1 / 60); return sent.slice(from); };
    for (let i = 0; i < 10; i++) tick();
    return { walk, tick, dispose: () => walk.unbindKey() };
  }

  it('a hold taken sends its code once; a clip that is not a hold is refused and sends nothing', () => {
    const { walk, tick, dispose } = rig();
    expect(walk.hold('seal_reload')).toBe(false);
    expect(tick().every((c) => (c.buttons >> HOLD_SHIFT) === 0)).toBe(true);
    expect(walk.hold('seal_throwgrenade')).toBe(true);
    const [first] = tick();
    expect((first!.buttons >> HOLD_SHIFT) & 0xf).toBe(HOLD_CODES.indexOf('seal_throwgrenade') + 1);
    expect(tick().every((c) => (c.buttons >> HOLD_SHIFT) === 0)).toBe(true);
    dispose();
  });

  it('the scoped move sets Button.Scope on every command and slows the page\'s mover', () => {
    const { walk, tick, dispose } = rig();
    walk.setScopedMove(true);
    const cmds = [...tick(), ...tick()];
    expect(cmds.length).toBeGreaterThan(0);
    for (const c of cmds) expect(c.buttons & Button.Scope).toBe(Button.Scope);
    walk.setScopedMove(false);
    for (const c of [...tick(), ...tick()]) expect(c.buttons & Button.Scope).toBe(0);
    dispose();
  });
});

/**
 * Round 3 of NET-FIX2's review (web research 223 s6): `Walker.elapse` -- the room's dropped backlog's clocks -- runs the
 * tick's clocks with the body held, and none while a traversal driver has the tick (`TickDriver.owns`), as `step60`.
 */
describe('Walker.elapse: the clocks alone, none under a traversal', () => {
  it('a hold runs its clock and nothing moves; with a driver owning the tick, no clock runs', () => {
    const w = walker();
    w.hold('seal_throwgrenade');
    const at = { ...w.state };
    w.elapse(6);
    expect(w.holding?.t).toBeCloseTo(6 * TICK, 9);
    expect([w.state.x, w.state.y, w.state.z]).toEqual([at.x, at.y, at.z]);
    const v = walker();
    v.hold('seal_throwgrenade');
    v.driver = { tick: () => true, owns: () => true };
    v.elapse(6);
    expect(v.holding?.t).toBe(0);
  });
});

describe('Traversal.owns: exactly the ticks its step takes (round 4 of NET-FIX2\'s review)', () => {
  it('a hang-drop fall: step gives the tick back (step60 runs the clocks), so a drop\'s elapse runs them too; a hang owns it', () => {
    const w = walker();
    const t = new Traversal(plain, [floor()]);
    w.driver = t;
    w.hold('seal_throwgrenade');
    (t as unknown as { kind_: string }).kind_ = 'hangDropFall';
    expect(t.owns(w)).toBe(false);
    w.elapse(6);
    expect(w.holding?.t).toBeCloseTo(6 * TICK, 9);
    (t as unknown as { kind_: string }).kind_ = 'hang';
    expect(t.owns(w)).toBe(true);
    w.elapse(6);
    expect(w.holding?.t).toBeCloseTo(6 * TICK, 9);              // no clock under the hang
  });
});

/**
 * PAR-84 (research 230 section 5.2.10, build step 3; `roomEquipment.test.ts` and `walk.test.ts` "PAR-84"): the launcher's
 * raise (`FUN_005a6d30` pushes `Rifle -> Launcher` / `Pistol -> Launcher`, D:L462112-462116) and its still lower (the
 * same type reversed, `FUN_005a6b70` D:L462069-462070, D:L462078-462079) are full-body one-shots on the stack,
 * `NoInterrupt` bare: the stick never cuts them (`FUN_00587c20`; neither is 0x35, D:L418181) and no ground state runs
 * under them (`FUN_005870e0` only at a cut or the end, D:L418203) -- the SEAL stands, moved by the clip's root alone
 * (`FUN_0028c250`). They come off by the driver's end test on the push's own clock (`swapPlayedOut`): the 84th command
 * from the rifle's clip, the 82nd from the pistol's (`playedOutCommand`), where the ground state runs again. While either
 * is on top `FUN_005a7980` answers (D:L462484-462491): the swap refused (`FUN_005a8cb0` D:L463159), the jump refused
 * (the looped-top test, D:L440810), a stance press kept (`FUN_00552ec0` D:L418927-418930).
 */
describe("PAR-84: the launcher's raise and still lower hold the body (FUN_00550ef0 D:L418171-418203)", () => {
  const RAISE = [['rifleToLauncher', 84], ['pistolToLauncher', 82]] as const;

  it("a stick held from the clip's own command moves the body only by the root through its last command before the end, the 84th (rifle) / 82nd (pistol) ends it 'complete', and the stick walks it after; reversed (the still lower) the same", () => {
    for (const [name, end] of RAISE) {
      for (const reversed of [false, true]) {
        const held = walker(), still = walker();
        const ends: string[] = [];
        held.onActionEnd((e) => ends.push(`${e.body?.name}:${e.body?.family}:${e.reason}`));
        expect(held.launcherClip(name, reversed), `${name} ${reversed}`).toBe(true);
        expect(still.launcherClip(name, reversed)).toBe(true);
        expect(held.action).toMatchObject({ name, reversed });
        expect(held.bodyOwner()).toMatchObject({ source: 'action', name, family: 'swap' });
        for (let k = 1; k < end; k++) {
          held.tick(FORWARD); still.tick(STILL);
          expect(held.action?.name, `${name} ${reversed}: command ${k}`).toBe(name);
          expect(held.ground.state, `${name} ${reversed}: command ${k}`).toBe('idle');
          // The stick is read, not obeyed: the held body stands where the still one does (the root's own path).
          expect([held.state.x, held.state.z], `${name} ${reversed}: command ${k}`).toEqual([still.state.x, still.state.z]);
        }
        expect(Math.hypot(held.state.x, held.state.z)).toBeGreaterThan(0.5);   // the root moved it (2.9 over the clip)
        expect(ends).toEqual([]);
        held.tick(FORWARD);                                                       // the end's own command
        expect(held.action, `${name} ${reversed}: off on command ${end}`).toBeNull();
        expect(ends).toEqual([`${name}:swap:complete`]);
        const x = held.state.x, z = held.state.z;
        for (let i = 0; i < 30; i++) held.tick(FORWARD);
        expect(Math.hypot(held.state.x - x, held.state.z - z), `${name} ${reversed}: walks after`).toBeGreaterThan(5);
      }
    }
  });

  it('under either: the jump refused, a stance press kept (taken at the end), the swap refused; neither is the firearm swap (swapProgress, completeSwap)', () => {
    for (const [name, end] of RAISE) {
      for (const reversed of [false, true]) {
        const w = walker();
        expect(w.launcherClip(name, reversed)).toBe(true);
        w.tick(STILL);
        expect(w.jump(), `${name} ${reversed}`).toBe(false);
        expect(w.swapping()).toBe(true);                                         // FUN_005a7980's answer
        expect(w.swapRefused()).toBe(true);
        expect(w.swapWeapon('pistol')).toBeNull();
        expect(w.swapProgress()).toBeNull();                                     // not the firearm's hand-off clock
        expect(w.completeSwap()).toBe(false);
        expect(w.action?.name).toBe(name);
        expect(w.stanceGate('crouch')).toBe('owned');
        w.changeStance('crouch');
        expect([w.stance, w.pendingStance]).toEqual(['stand', 'crouch']);       // kept, asked again each tick
        for (let k = 2; k < end; k++) { w.tick(STILL); expect(w.stance, `command ${k}`).toBe('stand'); }
        w.tick(STILL);                                                           // the end: the request taken
        expect(w.stance).toBe('crouch');
        expect(w.pendingStance).toBeNull();
      }
    }
  });

  it('started in the air: refused (the take gate refuses the raise there, swapRefused); started late (the room past its command): its clock caught up, none past its end', () => {
    const w = walker();
    w.setAirborne(true);
    expect(LAUNCHER_RAISE_AIR_READING).toBe('refused');
    expect(w.launcherClip('rifleToLauncher', false)).toBe(false);
    const late = walker();
    expect(late.launcherClip('rifleToLauncher', false, 80 * TICK)).toBe(true);
    for (let k = 81; k < 84; k++) { late.tick(STILL); expect(late.action?.name, `command ${k}`).toBe('rifleToLauncher'); }
    late.tick(STILL);
    expect(late.action).toBeNull();
    expect(walker().launcherClip('rifleToLauncher', false, 84 * TICK)).toBe(false);
  });

  it('launcherClipName: the raise clip by the firearm it comes from (FUN_005a6d30; LAUNCHER_RAISE_CLIPS), the playback, keys and NoInterrupt of the disc', () => {
    expect(launcherClipName(0)).toBe('rifleToLauncher');
    expect(launcherClipName(1)).toBe('pistolToLauncher');
    expect(ACTION_CLIPS.rifleToLauncher).toMatchObject({ playback: 1.5, frames: 35, noInterrupt: 1 });
    expect(ACTION_CLIPS.pistolToLauncher).toMatchObject({ playback: 1.5, frames: 24, noInterrupt: 1 });
    expect(playedOutCommand(ACTION_CLIPS.rifleToLauncher.playback, ACTION_CLIPS.rifleToLauncher.frames)).toBe(84);
    expect(playedOutCommand(ACTION_CLIPS.pistolToLauncher.playback, ACTION_CLIPS.pistolToLauncher.frames)).toBe(82);
  });
});
