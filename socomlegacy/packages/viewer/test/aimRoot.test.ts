import { describe, expect, it } from 'vitest';
import { aimRoot, JUMP_AIM_ROOT_BODIES_READING } from '../src/net/shotCone';
import { rootY } from '../src/mover';

/**
 * JUMP-AIM-ROOT (research 80 s7, 2026-11-11; reading, pending review): the aim frame's root rule (`aimRoot`), the room's
 * `Room.aimRootOf` and every frame it fills (`Room.aim`, `startBody`, `orderOrigin`), and the page's start body
 * (`WalkMode.startBody`). A traversal move's root wins as before; a crouched body stands on the posed root in the jump
 * action and, the fold's blend-out, whenever the posed root stands above the crouch root (the ease back to the crouch
 * idle after the clip: shadow's capture of the original, 2026-11-11, research 80 s7); every other body is today's (null:
 * the stance's measured root stands in). Unit-test evidence only.
 */
describe('JUMP-AIM-ROOT: the aim frame\'s root', () => {
  const posed = (r: number | null) => () => r;
  it('a traversal move keeps its own root, jump or not (the posed root is not asked)', () => {
    let asked = 0;
    const ask = (): number => { asked++; return 14; };
    expect(aimRoot(7.25, { action: 'jump', posture: 'crouch' }, ask)).toBe(7.25);
    expect(aimRoot(7.25, { action: null, posture: 'crouch' }, ask)).toBe(7.25);
    expect(aimRoot(7.25, { action: null, posture: 'stand' }, ask)).toBe(7.25);
    expect(asked).toBe(0);
  });
  it('a crouched body in the jump action stands on the posed root', () => {
    expect(aimRoot(null, { action: 'jump', posture: 'crouch' }, posed(12.5))).toBe(12.5);
  });
  it('the blend-out: a crouched body out of the jump stands on the posed root while it stands above the crouch root', () => {
    // The capture's ease-down after the clip (frames 30-44: 11.207 ... 5.554), then the crouch idle's 5.504.
    for (const r of [11.207, 10.438, 7.34, 5.554]) expect(aimRoot(null, { action: null, posture: 'crouch' }, posed(r)), `${r}`).toBe(r);
    expect(aimRoot(null, { action: null, posture: 'crouch' }, posed(rootY('crouch')))).toBeNull();
    // The ruling's reach: any crouched body whose posed root stands above the crouch root -- the crouch walk's (up to
    // 9.33), a stance change's into the crouch (stand -> crouch from 11.484) -- as the page's camera stands on it.
    expect(aimRoot(null, { action: null, posture: 'crouch' }, posed(9.33))).toBe(9.33);
    expect(aimRoot(null, { action: 'standToCrouch', posture: 'crouch' }, posed(11.484))).toBe(11.484);
  });
  it('no posed root (no poser, no motion) or a non-finite one: the stance root, as before', () => {
    expect(aimRoot(null, { action: 'jump', posture: 'crouch' }, posed(null))).toBeNull();
    expect(aimRoot(null, { action: 'jump', posture: 'crouch' }, posed(Number.NaN))).toBeNull();
    expect(aimRoot(null, { action: null, posture: 'crouch' }, posed(Number.POSITIVE_INFINITY))).toBeNull();
  });
  it(`a standing body (JUMP_AIM_ROOT_BODIES_READING '${JUMP_AIM_ROOT_BODIES_READING}'), a prone one, a still crouch at or under the crouch root: unchanged (null)`, () => {
    expect(JUMP_AIM_ROOT_BODIES_READING).toBe('crouched');
    expect(aimRoot(null, { action: 'jump', posture: 'stand' }, posed(15))).toBeNull();
    expect(aimRoot(null, { action: null, posture: 'stand' }, posed(14))).toBeNull();
    expect(aimRoot(null, { action: null, posture: 'prone' }, posed(9))).toBeNull();
    // The crouch idles' roots as the room's and the page's animators pose them (seal_crouch 5.5039, the two alert idles
    // 5.0313 and 4.7070: the seat-box probe jf-1 on the fixture disc's clips): never above the crouch root.
    for (const r of [5.50390625, 5.0313, 4.707]) expect(aimRoot(null, { action: null, posture: 'crouch' }, posed(r)), `${r}`).toBeNull();
    for (const a of ['launch', 'fall', 'land', 'landHard', 'standToCrouch', 'crouchToProne', 'standToProne']) {
      expect(aimRoot(null, { action: a, posture: 'crouch' }, posed(5.2)), a).toBeNull();
    }
  });
});
