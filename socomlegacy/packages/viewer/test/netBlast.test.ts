import { describe, expect, it } from 'vitest';
import { buildGrid, flashLevel, HE, M67, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import {
  ACTION_CLIPS, ACTION_SECONDS, applyKnock, BLAST_RING_SECONDS, BLAST_RING_VOLUME, blastKnock, Button, fragmentDamage, freshHealth, isDead,
  KNOCK_LADDER_STATE_READING, KNOCK_MASS, KNOCK_SPEED_MAX, KNOCK_SWAP_COMPLETE_READING, MoverSim, resolveBlast, ROOT_HEIGHT, SEAL_ANIMS, TICK,
  Traversal, Walker, type BlastVictim, type Command, type Knock, type WalkInput,
} from '../src/sim';
import { blastFlashLevel } from '../src/net/blast';
import { Kit, type Firearm } from '../src/kit';
import { clipsFromPack, motionTableFromArchive, readMotionTable } from '../src/motionTable';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GATE_MOTION_RECORDS } from './helpers/gateTable';

/**
 * A grenade's blast on one SEAL (web research 85 section 7, 91 section 5): `FUN_005ac070` (who it reaches: the line to
 * the head), `FUN_005a0e70` (the reach factor, the ringing ears, the fragments, the push), `FUN_005a18b0` (how many
 * fragments), `FUN_0057ed10` / `FUN_0057e770` (the knock: an impulse and `Fall forward` / `Fall backwards`).
 */

/** A seeded draw (the Park-Miller the room tests use). */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const M67_BLAST = { record: M67, piercing: 4, fragments: true } as const;
const standing = (x: number, z = 0): BlastVictim => ({ feet: [x, 0, z], posture: 'stand', yaw: 0 });

describe('the blast\'s reach (FUN_005a0e70 L459207-459224)', () => {
  it('reaches inside the radius only: factor 1 - d^2 / r^2 at the feet, nothing at or past 150 for the M67', () => {
    const a = resolveBlast(freshHealth(), standing(20), [0, 0, 0], M67_BLAST, seeded(), true);
    expect(a!.factor).toBeCloseTo(1 - 400 / 22500, 9);
    expect(resolveBlast(freshHealth(), standing(150), [0, 0, 0], M67_BLAST, seeded(), true)).toBeNull();
    expect(resolveBlast(freshHealth(), standing(151), [0, 0, 0], M67_BLAST, seeded(), true)).toBeNull();
  });

  it('a wall between the blast and the head: nothing at all (FUN_005ac070 queues the blast only with the line)', () => {
    const h = freshHealth();
    expect(resolveBlast(h, standing(5), [0, 0, 0], M67_BLAST, seeded(), false)).toBeNull();
    expect(h.hp).toEqual(freshHealth().hp);
  });

  it('rings the ears for 5 s at 0.35 whenever it reaches, fragments or none (L459229-459235, FUN_003412f0)', () => {
    expect(BLAST_RING_SECONDS).toBe(5);
    expect(BLAST_RING_VOLUME).toBeCloseTo(0.35, 6);
    // Past 30 units the fragments thin as 900 / d^2: at 140 units, fewer than one.
    const far = resolveBlast(freshHealth(), standing(140), [0, 0, 0], M67_BLAST, () => 0.999, true)!;
    expect(far.fragments).toBe(0);
    expect(far.ring).toBe(true);
    const smoke = resolveBlast(freshHealth(), standing(5), [0, 0, 0], { record: M67, piercing: 0, fragments: false }, seeded(), true)!;
    expect(smoke.fragments).toBe(0);
    expect(smoke.hits).toEqual([]);
  });
});

describe('the fragments on the player (FUN_005a18b0, FUN_005a0e70 L459236-459256)', () => {
  // The brief's distances as world units (2, 5, 10), and 20: all inside the 30 units of the full count.
  for (const d of [2, 5, 10, 20]) {
    it(`an M67 ${d} units from the feet: 9-15 fragments (8 + the roll) of 140 each, and the SEAL dies`, () => {
      const h = freshHealth();
      const out = resolveBlast(h, standing(d), [0, 0, 0], M67_BLAST, seeded(7), true)!;
      expect(out.fragments).toBeGreaterThanOrEqual(9);
      expect(out.fragments).toBeLessThanOrEqual(15);
      for (const hit of out.hits) expect(hit.damage).toBe(140);
      expect(out.died).toBe(true);
      expect(isDead(h)).toBe(true);
    });
  }

  it('an M67 50 units off (5 m): the close count x 900 / 2500, 3-6 fragments, each still the full 140 (inside 75)', () => {
    const out = resolveBlast(freshHealth(), standing(50), [0, 0, 0], M67_BLAST, seeded(7), true)!;
    expect(out.fragments).toBeGreaterThanOrEqual(3);
    expect(out.fragments).toBeLessThanOrEqual(6);
    for (const hit of out.hits) expect(hit.damage).toBe(140);
  });

  it('an M67 100 units off: each fragment 140 x (1 - 25/75) = 93.3, and 900/d^2 of the count (at most 2)', () => {
    expect(fragmentDamage(10, 150, 100)).toBeCloseTo(93.333, 3);
    const out = resolveBlast(freshHealth(), standing(100), [0, 0, 0], M67_BLAST, seeded(3), true)!;
    expect(out.fragments).toBeLessThanOrEqual(2);
    for (const hit of out.hits) expect(hit.damage).toBeCloseTo(93.333, 3);
  });

  it('the HE: 154 a fragment to 50, 0 at 100 (zweapon.rdr: 11, radius 10 m)', () => {
    const out = resolveBlast(freshHealth(), standing(10), [0, 0, 0], { record: HE, piercing: 1, fragments: true }, seeded(), true)!;
    for (const hit of out.hits) expect(hit.damage).toBe(154);
    expect(resolveBlast(freshHealth(), standing(100), [0, 0, 0], { record: HE, piercing: 1, fragments: true }, seeded(), true)).toBeNull();
  });

  it('the thrower is not spared: nothing in the blast asks who threw it (FUN_005ac070)', () => {
    // resolveBlast takes no thrower; the room's own test pins the suicide.
    expect(resolveBlast.length).toBe(6);
  });
});

describe('the knock (FUN_0057ed10 L441094, FUN_0057e770 L440940-441092, FUN_005807d0 L442057-442137, side pick FUN_0057e770 L441044-441051)', () => {
  it('stores the push only when fragments struck and the damage at the feet is over 0', () => {
    const far = resolveBlast(freshHealth(), standing(140), [0, 0, 0], M67_BLAST, () => 0.999, true)!;
    expect(far.knock).toBeNull();
  });

  it('pushes a standing SEAL from the blast: min(100, f x (dmg/14) x 120 / 90) along the line, up at least 50 f', () => {
    expect(KNOCK_MASS).toBe(90);
    expect(KNOCK_SPEED_MAX).toBe(100);
    expect(ROOT_HEIGHT).toEqual({ stand: 11.48, crouch: 5.5, prone: 2.17 });
    const v = standing(20);
    const k = blastKnock(v, [0, 0, 0], M67, fragmentDamage(10, 150, 20))!;
    const len = Math.hypot(20, 11.48), f = 1 - (len * len) / 22500, s = Math.min(100, (f * 10 * 120) / 90);
    expect(k.velocity[0]).toBeCloseTo((20 / len) * s, 6);
    expect(k.velocity[2]).toBeCloseTo(0, 9);
    expect(k.velocity[1]).toBeCloseTo(Math.max(50 * f, (11.48 / len) * s), 6);
    expect(k.velocity[1]).toBeCloseTo(50 * f, 6);                 // the rise is the 50 f floor, not the line's
  });

  it('crouched: from the crouch\'s root (5.5 over the feet); prone: no push (the game plays `Prone cover`)', () => {
    const k = blastKnock({ feet: [30, 0, 0], posture: 'crouch', yaw: 0 }, [0, 0, 0], M67, 140)!;
    const len = Math.hypot(30, 5.5), f = 1 - (len * len) / 22500;
    expect(k.velocity[1]).toBeCloseTo(50 * f, 6);
    // PF-19: alive, no push -- `Prone cover` in place (the knock's `proneCover`, research 218 s3)
    expect(blastKnock({ feet: [30, 0, 0], posture: 'prone', yaw: 0 }, [0, 0, 0], M67, 140)).toEqual({ velocity: [0, 0, 0], fall: 'proneCover' });
  });

  it('no push when the root is at or past the radius', () => {
    expect(blastKnock(standing(149.9), [0, 0, 0], M67, 1)).toBeNull();   // the root is 11.48 up: past 150
  });

  it('falls backwards from a blast in front, forwards from one behind (KNOCK_SIDE_READING)', () => {
    // yaw 0 faces -z (`Pose`): a blast at -z is in front.
    const front = blastKnock({ feet: [0, 0, 0], posture: 'stand', yaw: 0 }, [0, 0, -20], M67, 140)!;
    const behind = blastKnock({ feet: [0, 0, 0], posture: 'stand', yaw: 0 }, [0, 0, 20], M67, 140)!;
    expect(front.fall).toBe('fallBackwards');
    expect(behind.fall).toBe('fallForward');
    expect(front.velocity[2]).toBeGreaterThan(0);                 // pushed back, away from the blast
  });

  it('the resolve carries the knock of a survivor (a blast that struck but did not kill)', () => {
    // One fragment on an arm at 120 units: 140 x 0.4 = 56 -- the arm's 30 + armour take it, the SEAL lives.
    let calls = 0;
    const draws = [0.5, 0.0, 0.65];                               // the extra roll (13), the rounding (0.81 -> 1), the part (LARM)
    const out = resolveBlast(freshHealth(), standing(120), [0, 0, 0], M67_BLAST, () => draws[calls++] ?? 0.65, true)!;
    expect(out.fragments).toBe(1);
    expect(out.died).toBe(false);
    expect(out.knock).not.toBeNull();
  });
});

/**
 * PF-19 (ruling PF.R38; research 218 s3, 194 A04, 179 s11.7 / s11.9): the knock on a SEAL whatever it is doing --
 * `FUN_0057e770` (D:L440981-441027) has no state gate: the move let go, a pending swap completed, then the reaction; a
 * living prone SEAL plays `Prone cover` in place.
 */
const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);
function hull(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
/** The traversal test's ladder: a 40 wall across x at z 0, a deck behind at 40, the ladder's span 0..40 and cap on its face. */
const LADDER = (): WorldPoly[] => [
  floor(-100, 0, 100, 100, 0), floor(-100, -100, 100, 0, 40), quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
  quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
];
/** The traversal test's box: 20 wide, its near side at z 0, `h` high, its sides of `appflags` (1 a ledge to hang from, 4 a crate). */
const BOX = (h: number, appflags: number): WorldPoly[] => {
  const [x0, z0, x1, z1] = [-10, -30, 10, 0];
  return [
    floor(-100, -100, 100, 100, 0),
    quad([x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1], 2, appflags), quad([x0, 0, z0, x1, 0, z0, x1, h, z0, x0, h, z0], 2, appflags),
    quad([x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0], 2, appflags), quad([x1, 0, z0, x1, 0, z1, x1, h, z1, x1, h, z0], 2, appflags),
    floor(x0, z0, x1, z1, h),
  ];
};
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const PUSH: Knock = { velocity: [11.3, 48.8, 0], fall: 'fallForward' };

/** A walker driven by its traversal on `polys`, at (0, 10, z) facing -z (the box's or the wall's near side at z 0). */
function mover(polys: WorldPoly[], z: number): { w: Walker; t: Traversal } {
  const grid = hull(polys);
  const w = new Walker(grid);
  const t = new Traversal(grid, polys);
  w.driver = t;
  w.place(0, 10, z);
  w.state.yaw = 0;
  return { w, t };
}
function run(w: Walker, input: WalkInput, until: () => boolean, max = 2000): void {
  for (let i = 0; i < max && !until(); i++) w.tick(input);
}
/** The action names a run of ticks went through, in order. */
function seen(w: Walker, input: WalkInput, ticks: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) {
    w.tick(input);
    const n = w.action?.name ?? 'none';
    if (out[out.length - 1] !== n) out.push(n);
  }
  return out;
}

describe('PF-19: a nonlethal blast during traversal or prone (FUN_0057e770 D:L440981-441027, research 218 s3)', () => {
  it("a living prone SEAL inside the radius is not pushed and plays Prone cover: guard_prone_cover, 3.78 s, held still, never cut (FUN_0057e770 D:L441018-441020; motion.rdr playback 4.3, 16 frames)", () => {
    // the knock: inside the radius and alive, no velocity and `proneCover`; dead, none (the BODY list's prone death clip,
    // D:L441013-441015); outside the radius, none (D:L440981)
    const prone = (x: number): BlastVictim => ({ feet: [x, 0, 0], posture: 'prone', yaw: 0 });
    expect(blastKnock(prone(30), [0, 0, 0], M67, 140)).toEqual({ velocity: [0, 0, 0], fall: 'proneCover' });
    expect(blastKnock(prone(30), [0, 0, 0], M67, 140, true)).toBeNull();
    expect(blastKnock(prone(150), [0, 0, 0], M67, 1)).toBeNull();                // the root 2.17 up: past 150
    // the clip: `GLOBAL`'s `Prone cover` -> guard_prone_cover; motion.rdr playback 4.3, NoInterrupt bare; 16 keys
    expect(SEAL_ANIMS.proneCover).toBe('guard_prone_cover');
    expect(ACTION_CLIPS.proneCover).toMatchObject({ playback: 4.3, frames: 16, noInterrupt: 1 });
    expect(ACTION_SECONDS.proneCover).toBeCloseTo(4.3 * (15 / 16) ** 2, 9);
    expect(ACTION_SECONDS.proneCover).toBeCloseTo(3.78, 2);
    // on the mover: in place, on the floor, prone; the stick held forward the whole clip never cuts it nor moves the SEAL
    // (a twin with the stick at rest ends where it does)
    const { w } = mover([floor(-100, -100, 100, 100, 0)], 20);
    const { w: twin } = mover([floor(-100, -100, 100, 100, 0)], 20);
    for (const m of [w, twin]) { m.stance = 'prone'; run(m, STILL, () => false, 30); }
    const k = blastKnock({ feet: [w.state.x, w.state.y, w.state.z], posture: w.posture, yaw: w.state.yaw }, [w.state.x + 30, 0, w.state.z], M67, 140)!;
    expect(applyKnock(w, null, k)).toBe(true);
    expect(applyKnock(twin, null, k)).toBe(true);
    expect(w.action?.name).toBe('proneCover');
    expect(w.airborne).toBe(false);
    const ticks = Math.floor(ACTION_SECONDS.proneCover / TICK) - 1;
    for (let i = 0; i < ticks; i++) { w.tick(FORWARD); twin.tick(STILL); }
    expect(w.action?.name).toBe('proneCover');                     // NoInterrupt bare: never cut
    expect([w.state.x, w.state.y, w.state.z]).toEqual([twin.state.x, twin.state.y, twin.state.z]);   // held still
    expect(w.stance).toBe('prone');
    for (let i = 0; i < 3; i++) w.tick(STILL);
    expect(w.action).toBeNull();                                    // the clip's end: the prone ground state again
    expect(w.stance).toBe('prone');
  });

  it("applyKnock on a SEAL on a ladder, a hang or mid-climb releases the move into a fall and lays the knock (FUN_0057e770 D:L440981-441027; KNOCK_LADDER_STATE_READING)", () => {
    expect(KNOCK_LADDER_STATE_READING).toBe('released');
    const ladder = mover(LADDER(), 20);
    run(ladder.w, FORWARD, () => ladder.t.state().kind === 'ladder', 400);
    expect(ladder.t.state().kind).toBe('ladder');
    for (let i = 0; i < 60; i++) ladder.w.tick(FORWARD);            // up the rungs, about 13.5
    const hang = mover(BOX(30, 1), 12);
    run(hang.w, FORWARD, () => hang.t.climbPrompt() !== null, 120);
    hang.t.action();
    run(hang.w, STILL, () => hang.t.state().kind === 'hang', 400);
    expect(hang.t.state().kind).toBe('hang');
    const climb = mover(BOX(12, 4), 12);
    run(climb.w, FORWARD, () => climb.t.climbPrompt() !== null, 120);
    climb.t.action();
    for (let i = 0; i < 6; i++) climb.w.tick(STILL);
    expect(climb.t.busy()).toBe(true);                               // mid-climb
    expect(climb.w.state.y).toBeGreaterThan(0);                      // the clip already lifting (NU-1c B10: no align first)
    for (const { w, t } of [ladder, hang, climb]) {
      // A running climb is popped with its end handler first, the body on the floor pick (NU-1a B8,
      // CLIMB_KNOCK_SETTLE_READING): the BOX's ground at 0; the ladder and the hang fall from where they are.
      const y = w === climb.w ? 0 : w.state.y;
      expect(applyKnock(w, t, PUSH)).toBe(true);
      expect(t.busy()).toBe(false);                                  // the move released ...
      expect(w.airborne).toBe(true);                                 // ... into the air, from where it settled
      expect(w.state.y).toBe(y);
      expect(w.action?.name).toBe('fallForward');                    // ... and the knock laid
      expect([w.state.vx, w.state.vy, w.state.vz]).toEqual(PUSH.velocity);
      const clips = seen(w, STILL, 6 * 60);
      expect(clips[0]).toBe('fallForward');
      expect(clips).toContain('getUp');                              // lands and gets up, alive
      expect(w.airborne).toBe(false);
      expect(t.busy()).toBe(false);
    }
    expect(ladder.w.state.y).toBeCloseTo(0, 6);                      // off the rungs, onto the ground
  });

  it("a knock during a swap completes the swap first (FUN_005a5da0 L461653-461756): the target weapon in hand, then the fall", () => {
    expect(KNOCK_SWAP_COMPLETE_READING).toBe('completed');
    for (const to of ['pistol', 'rifle'] as const) {
      const { w } = mover([floor(-100, -100, 100, 100, 0)], 20);
      run(w, STILL, () => false, 30);
      const sim = new MoverSim(w, null);
      let item: Firearm = 'rifle';
      const kit = new Kit({ swapClip: (f) => w.swapWeapon(f), canSwap: () => true, item: (i) => { item = i; }, swapProgress: () => w.swapProgress() });
      if (to === 'rifle') {                                          // the pistol in hand first
        expect(kit.select('pistol')).toBe(true);
        sim.weapon = 1;
        for (let i = 0; i < 120 && kit.swapping(); i++) { w.tick(STILL); kit.frame(TICK); }
        expect(kit.item()).toBe('pistol');
      }
      // the room's swap: the command's press, the weapon the target at once (`MoverSim`)
      const cmd: Command = { seq: 1, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: Button.Swap, stance: 0, weapon: to === 'pistol' ? 1 : 0 };
      sim.prepare(cmd);
      expect(sim.weapon).toBe(to === 'pistol' ? 1 : 0);
      const pick = w.swapProgress()!;
      expect(pick).not.toBeNull();
      // the page's kit on the same clip of the same mover
      w['action_'] = null;
      expect(kit.select(to)).toBe(true);
      expect(w.swapProgress()?.action).toBe(pick.action);
      for (let i = 0; i < 12; i++) { w.tick(STILL); kit.frame(TICK); }   // 0.2 s: before any hand-off (0.62 or more)
      expect(kit.state().swap?.handed).toBe(false);
      expect(applyKnock(w, null, PUSH)).toBe(true);
      expect(w.swapProgress()).toBeNull();                           // the swap's clip off the mover ...
      kit.frame(TICK);
      expect(kit.state().swap).toBeNull();                           // ... the kit's swap ended at its target
      expect(kit.item()).toBe(to);
      expect(item).toBe(to);
      expect(kit.state().mounts).toEqual(to === 'pistol' ? { rifle: 'carry', pistol: 'hand' } : { rifle: 'hand', pistol: 'holster' });
      expect(sim.weapon).toBe(to === 'pistol' ? 1 : 0);              // the room's weapon the target
      expect(w.action?.name).toBe('fallForward');                    // then the fall
      expect(w.airborne).toBe(true);
    }
  });
});

const READERC = fixture('RUN/READERC.ZAR'), PACK = fixture('RUN/MOTION_P.ZAR');
describe.skipIf(!READERC || !PACK)(`PF-19: Prone cover on the tracked fixture${READERC && PACK ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('guard_prone_cover in the fixture: motion.rdr playback 4.3, NoInterrupt and NoFire bare (research 179 s11.9); MOTION_P.ZAR 16 keys', () => {
    const e = motionTableFromArchive(READERC!)!.get(SEAL_ANIMS.proneCover)!;
    expect(e).toBeTruthy();
    expect(e.playback).toBeCloseTo(ACTION_CLIPS.proneCover.playback, 6);
    expect(e.looped).toBe(false);
    expect(e.noInterrupt).toBe(1);
    expect(e.noFire).toBe(1);
    expect(readMotionTable(GATE_MOTION_RECORDS).get(SEAL_ANIMS.proneCover)).toMatchObject({ playback: e.playback, noInterrupt: 1, noFire: 1 });
    const [clip] = clipsFromPack(PACK!, [SEAL_ANIMS.proneCover]);
    expect(clip!.frameCount).toBe(ACTION_CLIPS.proneCover.frames);
  });
});

/**
 * P2's review fold (research 85 s9.5): `blastFlashLevel`, the one reckoning of a flashbang's white-out level -- the room's
 * (`blastPlayers`, `blast.flash`) and the page's own with no room (`GrenadeThrower.explode`, the `&nomatch` free walk) --
 * the player controller's rule (`FUN_00597c00` D:L454528-454585): reach inside 150 u at the feet, full to 80 u, then
 * `1 - (d^2 - 6400) x 6.2e-5`; the forward (-sin yaw, 0, -cos yaw) against the unit direction to the blast.
 */
describe('blastFlashLevel (P2: the flash level of the room and of the free walk)', () => {
  const feet = [0, 0, 0] as const;
  /** Facing -x (yaw 90): the flash `d` ahead on the floor. */
  const ahead = (d: number): number[] => [-d, 0, 0];
  it('the distance bands, facing it: level 3 to the falloff\'s 0.3, 2 to 0.6, 1 past, none at 150 u and beyond', () => {
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(50))).toBe(3);      // inside 80 u: falloff 1, s 0
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(100))).toBe(3);     // falloff 0.7768, s 0.2232
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(120))).toBe(2);     // falloff 0.504, s 0.496
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(130))).toBe(1);     // falloff 0.349, s 0.651
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(149.9))).toBe(1);
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(150))).toBeNull();  // d^2 < 22500 only
    expect(blastFlashLevel({ feet, yaw: 90 }, ahead(400))).toBeNull();
  });
  it('the facing: away is 1 however close, half-turned (cos 0.5) close is 2, the height counts in the distance', () => {
    expect(blastFlashLevel({ feet, yaw: 270 }, ahead(10))).toBe(1);     // facing +x, the flash behind
    expect(blastFlashLevel({ feet, yaw: 90 }, [-25, 0, 25 * Math.sqrt(3)])).toBe(2);   // 60 degrees off: s 0.5
    expect(blastFlashLevel({ feet, yaw: 90 }, [-10, 149, 0])).toBe(1);  // 149.3 u off, mostly above: cos 0.067
    expect(blastFlashLevel({ feet, yaw: 90 }, [0, 150, 0])).toBeNull(); // straight up 150 u
  });
  it('value for value the page\'s former inline reckoning (grenade.ts explode before the fold), over a grid of points and yaws', () => {
    const former = (pos: readonly number[], f: readonly number[], yaw: number): 1 | 2 | 3 | null => {
      const distance = Math.hypot(pos[0]! - f[0]!, pos[1]! - f[1]!, pos[2]! - f[2]!);
      const r = (yaw * Math.PI) / 180, d = distance || 1;
      return flashLevel(distance, (-Math.sin(r) * (pos[0]! - f[0]!) - Math.cos(r) * (pos[2]! - f[2]!)) / d);
    };
    const at = [12, 3, -40];
    let n = 0;
    for (let x = -160; x <= 160; x += 20) for (let z = -160; z <= 160; z += 20) for (const y of [-30, 0, 15]) for (let yaw = 0; yaw < 360; yaw += 45) {
      const pos = [at[0]! + x, at[1]! + y, at[2]! + z];
      expect(blastFlashLevel({ feet: at, yaw }, pos), `${pos} ${yaw}`).toBe(former(pos, at, yaw));
      n++;
    }
    expect(blastFlashLevel({ feet: at, yaw: 0 }, at)).toBe(former(at, at, 0));   // the blast at the feet: distance || 1
    expect(n).toBe(17 * 17 * 3 * 8);
  });
});
