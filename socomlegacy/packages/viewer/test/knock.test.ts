import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import {
  ACTION_CLIPS, ACTION_CODES, applyKnock, groundGrid, landingHitDraw, MoverSim, packGround, SEAL_ANIMS, Traversal, Walker, type Command, type Knock,
} from '../src/sim';

/**
 * The blast's knock on the shared mover (`FUN_0057e770` L440940-441092, `FUN_005807d0` L442057-442137, the landing on
 * a knock `FUN_005805b0` via L441960-441985, the get-up on its end L446653-446700): off the ground at the push, in
 * `Fall forward` / `Fall backwards`; on the ground `Land forward` / `Land backwards`, then `Get up forward` /
 * `Get up backwards`. The server's room and the page's prediction run the same `Walker`, so the two agree.
 */

const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};

function flat(): Walker {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(params, [FLOOR], owners)));
  w.place(0, 20, 0);
  w.settle();
  return w;
}

/** `flat()` with the traversal moves driving it (the peek's `leanTick`), as the room and the page run it. */
function flatWithMoves(): { w: Walker; t: Traversal } {
  const w = flat();
  const t = new Traversal(w.grid, [FLOOR]);
  w.driver = t;
  return { w, t };
}

/** The action names a run of ticks went through, in order, and whether a lean clip showed while an action held. */
function watch(w: Walker, t: Traversal | null, ticks: number): { seen: string[]; leanOverAction: boolean } {
  const seen: string[] = [];
  let leanOverAction = false;
  for (let i = 0; i < ticks; i++) {
    w.tick(still);
    const n = w.action?.name ?? 'none';
    if (seen[seen.length - 1] !== n) seen.push(n);
    if (t && /lean/.test(t.pose()?.clip ?? '') && w.action) leanOverAction = true;
  }
  return { seen, leanOverAction };
}

/** A command with nothing pressed and the stick at rest: the one `MoverSim.apply` runs a tick on. */
const idle = (seq: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });

const still = { forward: 0, right: 0, boost: false };
const PUSH: Knock = { velocity: [11.3, 48.8, 0], fall: 'fallForward' };

describe('the knock on the mover', () => {
  it('leaves the ground at the push in `Fall forward`, lands in `Land forward`, then gets up forward', () => {
    const w = flat();
    expect(w.knock(PUSH.velocity, PUSH.fall)).toBe(true);
    expect(w.action?.name).toBe('fallForward');
    const seen: string[] = [];
    let air = 0, landedAt = Number.NaN;
    for (let i = 0; i < 6 * 60; i++) {
      w.tick(still);
      if (w.airborne) air++;
      const n = w.action?.name ?? 'none';
      if (seen[seen.length - 1] !== n) { seen.push(n); if (n === 'landDeath') landedAt = w.state.x; }
    }
    // 48.8 up at g 235: about 0.42 s in the air.
    expect(air / 60).toBeGreaterThan(0.3);
    expect(air / 60).toBeLessThan(0.5);
    expect(seen).toEqual(['fallForward', 'landDeath', 'getUp', 'none']);
    expect(landedAt).toBeGreaterThan(4);                         // carried along the push while in the air (11.3 x ~0.42 s)
    expect(w.state.y).toBeCloseTo(0, 6);
  });

  it('falls backwards into `Land backwards` and `Get up backwards`', () => {
    const w = flat();
    w.knock([-5, 40, 0], 'fallBackwards');
    const seen: string[] = [];
    for (let i = 0; i < 6 * 60; i++) {
      w.tick(still);
      const n = w.action?.name ?? 'none';
      if (seen[seen.length - 1] !== n) seen.push(n);
    }
    expect(seen).toEqual(['fallBackwards', 'landBackwards', 'getUpBackwards', 'none']);
  });

  it('dead (the server\'s `kill`), the knocked SEAL stays down in its landing: no get-up follows', () => {
    for (const fall of ['fallForward', 'fallBackwards'] as const) {
      const w = flat();
      w.knock([fall === 'fallForward' ? 5 : -5, 40, 0], fall);
      w.dead = true;
      const seen: string[] = [];
      for (let i = 0; i < 6 * 60; i++) {
        w.tick(still);
        const n = w.action?.name ?? 'none';
        if (seen[seen.length - 1] !== n) seen.push(n);
      }
      expect(seen).toEqual([fall, fall === 'fallForward' ? 'landDeath' : 'landBackwards']);
    }
  });

  it('a kill heard after the get-up began puts the landing back', () => {
    const w = flat();
    w.knock([-5, 40, 0], 'fallBackwards');
    for (let i = 0; i < 6 * 60 && w.action?.name !== 'getUpBackwards'; i++) w.tick(still);
    expect(w.action?.name).toBe('getUpBackwards');
    w.dead = true;
    expect(w.action?.name).toBe('landBackwards');
  });

  it('holds the SEAL: no jump while knocked', () => {
    const w = flat();
    w.knock(PUSH.velocity, PUSH.fall);
    expect(w.jump()).toBe(false);
  });

  it('is the same on two movers fed the same ticks (the room and the page agree)', () => {
    const a = flat(), b = flat();
    applyKnock(a, null, PUSH);
    applyKnock(b, null, PUSH);
    for (let i = 0; i < 120; i++) { a.tick({ forward: 1, right: 0, boost: false }); b.tick({ forward: 1, right: 0, boost: false }); }
    expect([a.state.x, a.state.y, a.state.z]).toEqual([b.state.x, b.state.y, b.state.z]);
  });

  it('a traversal move holding the mover is let go first, then the knock is laid (PF-19: KNOCK_IN_MOVE_PLACEHOLDER retired, KNOCK_LADDER_STATE_READING)', () => {
    const w = flat();
    let busy = true, resets = 0;
    const moves = { busy: () => busy, reset: () => { busy = false; resets++; } };
    expect(applyKnock(w, moves, PUSH)).toBe(true);
    expect(resets).toBe(1);
    expect(w.airborne).toBe(true);
    expect(w.action?.name).toBe('fallForward');
    // no move: nothing of the moves is touched (the held lean stays the page's and the room's alike)
    expect(applyKnock(w, moves, PUSH)).toBe(true);
    expect(resets).toBe(1);
    const sim = new MoverSim(flat(), null);
    expect(applyKnock(sim.walker, sim.moves, PUSH)).toBe(true);
  });

  it('sends the four clips on the wire and asks the pack for them', () => {
    for (const name of ['fallForward', 'fallBackwards', 'landBackwards', 'getUpBackwards'] as const) expect(ACTION_CODES).toContain(name);
    expect(SEAL_ANIMS).toMatchObject({
      fallForward: 'seal_fallforward01', fallBackwards: 'seal_fallbackwards01',
      landBackwards: 'seal_landbackwards01', getUpBackwards: 'seal_getupbackwards01',
    });
  });
});

describe('the peek and the action stack (review 2, M-1): no lean while dead or while an action will not give way', () => {
  it('a dead SEAL holding the lean stays in its landing: no peek, no lean clip, `Land forward` held at its last key', () => {
    const { w, t } = flatWithMoves();
    w.knock(PUSH.velocity, PUSH.fall);
    w.dead = true;
    for (let i = 0; i < 4 * 60; i++) w.tick(still);
    expect(w.action?.name).toBe('landDeath');
    t.lean(1);
    for (let i = 0; i < 30; i++) w.tick(still);
    expect(t.pose()).toBeNull();
    expect(t.peeking()).toBe(0);
    expect(t.peek()).toBe(0);
    expect(w.action?.name).toBe('landDeath');
    expect(w.action!.t).toBe(w.action!.seconds);
  });

  it('a knocked SEAL holding the lean lands, gets up, and only then peeks: the landing and the get-up run their clocks', () => {
    for (const fall of ['fallForward', 'fallBackwards'] as const) {
      const { w, t } = flatWithMoves();
      t.lean(-1);
      w.knock([fall === 'fallForward' ? 11.3 : -5, 45, 0], fall);
      const { seen, leanOverAction } = watch(w, t, 6 * 60);
      expect(seen).toEqual(fall === 'fallForward'
        ? ['fallForward', 'landDeath', 'getUp', 'none'] : ['fallBackwards', 'landBackwards', 'getUpBackwards', 'none']);
      expect(leanOverAction).toBe(false);
      expect(t.pose()?.clip).toMatch(/llean$/);                     // the held lean takes the SEAL once it is up
    }
  });
});

describe('the get-up leaves the SEAL standing (review 2, m-1: FUN_00589aa0 L446653-446677, FUN_0028da00 L135104)', () => {
  it('a crouched SEAL knocked forward or backwards gets up standing, whatever it was', () => {
    for (const [velocity, fall, clips] of [
      [PUSH.velocity, 'fallForward', ['fallForward', 'landDeath', 'getUp', 'none']],
      [[-5, 40, 0], 'fallBackwards', ['fallBackwards', 'landBackwards', 'getUpBackwards', 'none']],
    ] as const) {
      const w = flat();
      w.stance = 'crouch';
      w.knock(velocity, fall);
      const { seen } = watch(w, null, 6 * 60);
      expect(seen).toEqual(clips);
      expect(w.stance).toBe('stand');
      expect(w.posture).toBe('stand');
    }
  });

  it('a get-up cut by the stick stands the SEAL too', () => {
    const w = flat();
    w.stance = 'crouch';
    w.knock(PUSH.velocity, PUSH.fall);
    for (let i = 0; i < 6 * 60 && w.action?.name !== 'getUp'; i++) w.tick(still);
    expect(w.action?.name).toBe('getUp');
    for (let i = 0; i < 6 * 60 && w.action?.name === 'getUp'; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.action).toBeNull();
    expect(w.stance).toBe('stand');
  });

  it('two crouched movers fed the same ticks agree through the knock (the room and the page)', () => {
    const a = flat(), b = flat();
    a.stance = 'crouch'; b.stance = 'crouch';
    applyKnock(a, null, PUSH);
    applyKnock(b, null, PUSH);
    for (let i = 0; i < 6 * 60; i++) { a.tick(still); b.tick(still); }
    expect(a.stance).toBe('stand');
    expect(b.stance).toBe(a.stance);
    expect([a.state.x, a.state.y, a.state.z]).toEqual([b.state.x, b.state.y, b.state.z]);
  });
});

describe('the heavy landing\'s hit clip is drawn from the command (review 2, M-2: LANDING_HIT_DRAW_READING)', () => {
  /** A mover `height` over the floor, dropped, run on idle commands from `seq` until its landing clip ends. */
  const drop = (seq: number, height = 100): Walker => {
    const w = flat();
    const sim = new MoverSim(w, null);
    w.state.y = height;
    w.setAirborne(true);
    for (let i = 0; i < 8 * 60; i++) sim.apply(idle(seq + i));
    return w;
  };

  it('two movers fed the same commands land the same clip and the same feet, whatever Math.random says', () => {
    const clips = new Set<string>();
    for (let seq = 1; seq <= 50; seq++) {
      const a = drop(seq * 37), b = drop(seq * 37);
      expect(a.landing?.cls).toBe(2);                              // a heavy landing: one of the two hits
      expect(b.landing?.clip).toBe(a.landing?.clip);
      expect(Math.hypot(a.state.x - b.state.x, a.state.y - b.state.y, a.state.z - b.state.z)).toBeLessThan(1e-9);
      clips.add(a.landing!.clip!);
    }
    expect([...clips].sort()).toEqual(['hit', 'hitStomach']);    // the coin still falls both ways
  });

  it('the coin is the game\'s: at or under 0.5 `Hit stomach`, else `Hit` (FUN_005af590 L466667-466669); `random` overrides it', () => {
    for (let seq = 0; seq < 200; seq++) {
      expect(landingHitDraw(seq)).toBeGreaterThanOrEqual(0);
      expect(landingHitDraw(seq)).toBeLessThan(1);
    }
    for (const [draw, clip] of [[0.9, 'hit'], [0.5, 'hitStomach']] as const) {
      const w = flat();
      w.random = () => draw;
      w.state.y = 100;
      w.setAirborne(true);
      for (let i = 0; i < 120 && w.airborne; i++) w.tick(still);
      expect(w.landing?.clip).toBe(clip);
    }
    expect(ACTION_CLIPS.hit.travel).not.toEqual(ACTION_CLIPS.hitStomach.travel);
  });

  it('a corpse draws no coin: two dead movers holding different seqs land the one clip, `Land forward` (D:L466658-466660; review 3, A2)', () => {
    // Seqs whose coins fall apart: live, one lands `Hit stomach`, the other `Hit`.
    const low = [...Array(200).keys()].find((q) => landingHitDraw(q) <= 0.5)!;
    const high = [...Array(200).keys()].find((q) => landingHitDraw(q) > 0.5)!;
    const fall = (seq: number, dead: boolean): Walker => {
      const w = flat();
      w.dead = dead;
      w.commandSeq = seq;                                          // the server's corpse keeps the kill's; the page counts on
      w.state.y = 100;                                             // a ladder / hang victim released at a class-2 height
      w.setAirborne(true);
      for (let i = 0; i < 120 && w.airborne; i++) w.tick(still);  // the corpse's ticks: no command
      return w;
    };
    expect(fall(low, false).landing?.clip).toBe('hitStomach');
    expect(fall(high, false).landing?.clip).toBe('hit');
    const a = fall(low, true), b = fall(high, true);
    expect(a.landing?.cls).toBe(2);                              // the speed's class; the alive bit clear forces 3 (PF-21)
    expect(a.landing?.clip).toBe('landDeath');
    expect(b.landing?.clip).toBe(a.landing?.clip);
    for (let i = 0; i < 5 * 60; i++) { a.tick(still); b.tick(still); }
    expect([a.state.x, a.state.y, a.state.z]).toEqual([b.state.x, b.state.y, b.state.z]);   // one resting spot
  });
});

/**
 * NU-1a B8 (research 313 section 4, section 8.1 B8; D9): a knock mid-climb pops the stack (`FUN_0057e770` D:L440997), and
 * the climb's pop runs its end handler (`FUN_00589aa0` D:L446582-446648): the body settles at its x and z on the floor
 * pick's y first, and the fall is laid from there (`CLIMB_KNOCK_SETTLE_READING`).
 */
describe('NU-1a B8: a knock mid-climb settles the climb on its floor pick, then falls from there (research 313 section 4)', () => {
  /** A climber pressed at a face `h` high of `app` (the 12 crate by default), run to `phase` on its clip's clock
   *  (`playback`, `keys`: `seal_climbcrate`'s 1.25 and 30 by default). */
  function crateClimber(h = 12, app = 4, playback = 1.25, keys = 30, phase = 0.5): { w: Walker; t: Traversal } {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const q = (pts: number[], ditype: number, appflags: number, path: string): WorldPoly => ({
      modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
    });
    const polys = [
      FLOOR,
      q([-10, 0, 0, 10, 0, 0, 10, h, 0, -10, h, 0], 2, app, 'worldmodel/crate'),
      q([-10, h, -30, 10, h, -30, 10, h, 0, -10, h, 0], 3, 0, 'worldmodel/cratetop'),
    ];
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: `${p.path}${i}`, first: i, count: 1 }));
    const w = new Walker(groundGrid(packGround(params, polys, owners)));
    const t = new Traversal(w.grid, polys);
    w.driver = t;
    w.place(0, 10, 12);
    w.state.yaw = 0;
    const forward = { forward: 1, right: 0, boost: false };
    for (let i = 0; i < 120 && t.climbPrompt() === null; i++) w.tick(forward);
    expect(t.climbPrompt()?.kind).toBe(h > 28 ? 'high' : 'low');
    t.action();
    for (let i = 0; i < 120 && t.state().kind !== 'climb'; i++) w.tick(still);
    // To `phase` on the clip's clock, t / (playback x (n - 1) / n).
    for (let k = 1; (k * (1 / 60)) / (playback * ((keys - 1) / keys)) <= phase; k++) w.tick(still);
    expect(t.state().kind).toBe('climb');
    return { w, t };
  }

  it('a blast at phase 0.5: the fall starts from the floor pick under the feet (the ground in front), not from mid-air', () => {
    const { w, t } = crateClimber();
    const midAir = w.state.y;
    expect(midAir).toBeGreaterThan(3);                               // the clip has lifted the body
    expect(applyKnock(w, t, PUSH)).toBe(true);
    expect(t.busy()).toBe(false);
    expect(w.airborne).toBe(true);
    expect(w.action?.name).toBe('fallForward');
    expect(w.state.y).toBeCloseTo(0, 6);                             // RED before B8: the mid-air y
  });

  it('scope: a knock during "Stand -> Hang" settles nothing (FUN_00589aa0 names no case for it): the hang is dropped and the fall laid from where the clip has the body', () => {
    const { w, t } = crateClimber(30, 1, 1.4, 25, 0.5);                // seal_stand2hang: playback 1.4, 25 keys
    const y = w.state.y;
    expect(y).toBeGreaterThan(1);
    expect(applyKnock(w, t, PUSH)).toBe(true);
    expect(t.busy()).toBe(false);
    expect([w.airborne, w.action?.name]).toEqual([true, 'fallForward']);
    expect(w.state.y).toBe(y);
  });

  it('scope: no move, popSettle is not asked -- a knock on the floor lays the fall from the feet as before', () => {
    const w = flat();
    let asked = 0;
    const moves = { busy: () => false, reset: () => {}, popSettle: () => { asked++; } };
    expect(applyKnock(w, moves, PUSH)).toBe(true);
    expect(asked).toBe(0);
    expect(w.state.y).toBe(0);
  });
});
