import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { ACTION_CLIPS, playedOutCommand, Walker, type WalkInput } from '../src/mover';

/**
 * R4P-247 (atlas-parity ae454bc597, ready-queue row 61; simulation track; reading, pending review): raising a launcher
 * crouches the body when the raise CLIP IS POPPED, not at once -- CAPTURED twice on r0004 (QL55B-PC2): the crouch lands
 * 41 game frames after the launcher's set binds. The mechanism (the review CONFIRMED WITH CORRECTIONS, agent/spc-atlas):
 * the posture word is written by BodySetState (r0004 0x58fcb0; r0001 `FUN_0058a6b0` D:L446812-446825, called from PopBlend
 * `FUN_0028da00` D:L135104) on the frame the raise clip is popped -- every pop writes the uncovered blend's posture -- so the crouch lands on `raised + playedOutCommand` -- the 84th command from the rifle's clip, the 82nd from
 * the pistol's: the command the mover's raise action comes off (PAR-84), ONE before `launcherBaseCommand`. The port
 * crouched on the raise's first command (`Walker.followLauncherSet`), ~1.4 s early. The set's latch (`launcherSet_`,
 * which WEAPON-LINE reads) still flips when the set binds; the set's end stands the body at once, as before.
 */

function floor(): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, 0, 400, 400, 0, 400, 400, 0, -400, -400, 0, -400]),
  };
}
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const plain = buildGrid(PARAMS, [], [], [floor()], OWNERS);
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

/** A standing body on flat ground, settled, its launcher set read from `set`. */
function walker(): { w: Walker; set: { on: boolean } } {
  const w = new Walker(plain);
  w.place(0, 10, 0);
  for (let i = 0; i < 30; i++) w.tick(STILL);
  const set = { on: false };
  w.launcherSetOn = () => set.on;
  return { w, set };
}

describe('R4P-247: raising a launcher crouches the body when the raise clip ends (QL55B-PC2)', () => {
  for (const [name, clip] of [['rifleToLauncher', ACTION_CLIPS.rifleToLauncher], ['pistolToLauncher', ACTION_CLIPS.pistolToLauncher]] as const) {
    it(`${name}: standing through the raise, crouched on the command it is popped (raised + playedOutCommand)`, () => {
      const { w, set } = walker();
      expect(w.stance).toBe('stand');
      set.on = true;                                                // the set binds with the raise's push
      expect(w.launcherClip(name, false)).toBe(true);
      const off = playedOutCommand(clip.playback, clip.frames);     // the command the raise is popped (84 rifle, 82 pistol)
      let crouchedAt: number | null = null;
      for (let k = 1; k <= off + 4; k++) {
        w.tick(STILL);
        if (w.action?.name === name) expect(w.stance, `${name}: command ${k}, the raise still on`).toBe('stand');
        if (crouchedAt === null && w.stance === 'crouch') crouchedAt = k;
      }
      expect(crouchedAt).not.toBeNull();
      expect(w.action?.name).not.toBe(name);
      expect(off).toBe(name === 'rifleToLauncher' ? 84 : 82);
      expect(crouchedAt).toBe(off);                                 // on the pop's own command: not before, not the one after
    });
  }

  it('the rifle raise: the crouch lands about 41 game frames after the set binds (the capture), not at once', () => {
    const { w, set } = walker();
    set.on = true;
    expect(w.launcherClip('rifleToLauncher', false)).toBe(true);
    w.tick(STILL);
    expect(w.stance).toBe('stand');                                 // was: 'crouch' on this first command
    let k = 1;
    for (; k < 200 && w.stance !== 'crouch'; k++) w.tick(STILL);
    const frames = k / 2.002;                                       // 60 Hz commands to 30 Hz game frames
    expect(frames).toBeGreaterThan(38);
    expect(frames).toBeLessThan(44);
  });

  // The fresh review's F1 (seat-kill, keyjob-r4p247-review.md): EVERY pop writes the posture of the blend it uncovers
  // (PopBlend -> BodySetState), so a raise that comes off any way while the set stays on and the body lives crouches it --
  // a knock pops the stack (r0001 FUN_0057e770 D:L440997, FUN_0058a4d0(actor, 0)), not only the raise's own end.
  it("a knock during the raise, the set still on: the knock's pop crouches the body (not standing for good)", () => {
    const { w, set } = walker();
    set.on = true;
    expect(w.launcherClip('rifleToLauncher', false)).toBe(true);
    for (let k = 0; k < 20; k++) w.tick(STILL);
    expect(w.stance).toBe('stand');                                 // the raise still on
    expect(w.knock([0, 0, 0], 'fallForward')).toBe(true);
    expect(w.action?.name).not.toBe('rifleToLauncher');             // the knock took the raise off
    expect(w.stance).toBe('crouch');
  });

  it('the set\'s end stands the body at once (unchanged)', () => {
    const { w, set } = walker();
    set.on = true;
    w.launcherClip('rifleToLauncher', false);
    for (let k = 0; k < 120; k++) w.tick(STILL);
    expect(w.stance).toBe('crouch');
    set.on = false;
    w.tick(STILL);
    expect(w.stance).toBe('stand');
  });

  it('the set binding with no raise on (a body already past it) crouches at once (unchanged)', () => {
    const { w, set } = walker();
    set.on = true;
    w.tick(STILL);
    expect(w.stance).toBe('crouch');
  });
});
