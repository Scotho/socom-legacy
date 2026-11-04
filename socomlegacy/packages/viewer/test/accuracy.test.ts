import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RIFLE, GAME_FRAME_DT, HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Zoom } from '../src/zoom';
import { groundGrid, packGround, Walker } from '../src/mover';
import {
  Accuracy, burstScalar, DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION, defaultFireMode, enterRaises, fireInterval, kickStarts, kickTicks, lookRates, LOOK_JUMP_READING, MAP_FOV, movementSize, nextFireMode,
  originalSpawnFireMode, penetrate, perturb, RADIUS_FACTOR, roundsPerPull, SWAP_KNOCK_READING, tangentPerPixel, TICK, type AccuracyInput,
} from '../src/accuracy';

/**
 * The gunplay model (research 84) on the M4A1 SD's own record (`zweapon.rdr`, `@s2u/scene`'s `HELD_RIFLE`): every
 * expectation below is the decompilation's arithmetic on the file's numbers, worked by hand in the comment beside it.
 */

const still: AccuracyInput = {
  stance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0,
};
const sd = HELD_RIFLE.stances;

describe('the reticle size (FUN_005c2670, FUN_005c3360)', () => {
  it('rests at TargetMin; a round opens it by TargetDilateUponFire; it closes at TargetConstrict a second', () => {
    const a = new Accuracy(HELD_RIFLE);
    expect(a.state().size).toBe(1);                                  // STANCE_STAND TargetMin 1
    a.round(0, 'stand');
    expect(a.state().size).toBe(8);                                  // + 7 (AccScalar_Max 0 on the SD: no growth)
    a.update(0.1, still);                                            // continuous (MISSION R8): 0.1 s of the constrict
    expect(a.state().size).toBeCloseTo(8 - 50 * 0.1, 9);             // 50 a second (research 181 X1)
    a.update(1, still);
    expect(a.state().size).toBe(1);
    for (let i = 0; i < 10; i++) a.round(0, 'stand');
    expect(a.state().size).toBe(26);                                 // TargetMax 26
  });

  it('moving: aims at |v|^2 / 65 x Mult, opening 1 a tick; crouched the multiplier is 13', () => {
    const a = new Accuracy(HELD_RIFLE);
    const walk: AccuracyInput = { ...still, velocity: [30, 0, 0] };  // 900 / 65 = 13.85
    a.update(1, walk);
    expect(a.state().target).toBeCloseTo(900 / 65, 9);
    expect(a.state().size).toBeCloseTo(900 / 65, 9);
    const b = new Accuracy(HELD_RIFLE);
    b.update(3 * TICK, walk);
    expect(b.state().size).toBeCloseTo(1 + 3, 9);                  // TargetDilateUponMovement 1 a tick
    expect(movementSize(sd.crouch, { ...walk, velocity: [10, 0, 0] })).toBeCloseTo(100 / 65 * 13, 9);
    expect(movementSize(sd.prone, { ...walk, velocity: [3, 0, 0] })).toBeCloseTo(9 / 65 * 63, 9);
    // The standing run (65 units a second) is past TargetMax: the run opens it all the way.
    const run = new Accuracy(HELD_RIFLE);
    run.update(1, { ...still, velocity: [65, 0, 0] });
    expect(run.state().size).toBe(26);
  });

  it('turning and pitching count 158.7 x rate^2; in the air the carried speed counts twice', () => {
    expect(movementSize(sd.stand, { ...still, yawRate: 0.2 })).toBeCloseTo(5.29 * 30 * 0.04, 9);
    expect(movementSize(sd.stand, { ...still, pitchRate: 0.3 })).toBeCloseTo(5.29 * 30 * 0.09, 9);
    expect(movementSize(sd.stand, { ...still, velocity: [20, -5, 0], airborne: true })).toBeCloseTo((425 + 400) / 65, 9);
  });

  it('the M4A1 grows its bloom over a burst (AccBurstCnt 4..7, AccScalar 0..0.03); the SD does not', () => {
    expect([1, 2, 3].map((n) => burstScalar(DEFAULT_RIFLE, n))).toEqual([0, 0, 0]);
    expect(burstScalar(DEFAULT_RIFLE, 4)).toBeCloseTo(0.01, 12);    // n = 4 + 1 - 4 = 1, slope 0.03 / 3
    expect(burstScalar(DEFAULT_RIFLE, 30)).toBeCloseTo(0.07, 12);   // n capped at AccBurstCnt_Max 7 (not 3)
    expect(burstScalar(HELD_RIFLE, 30)).toBe(0);
    const wide = { ...DEFAULT_RIFLE, stances: { ...DEFAULT_RIFLE.stances, stand: { ...DEFAULT_RIFLE.stances.stand, targetMax: 100 } } };
    const a = new Accuracy(wide);
    for (let i = 0; i < 4; i++) a.round(0, 'stand');
    expect(a.state().size).toBeCloseTo(1 + 7 * 3 + 7 * 1.01, 9);
  });
});

describe('the kit runs continuously at the per-second equivalents (MISSION R8; research 181 X1, research 208 §9)', () => {
  const wide = { ...HELD_RIFLE, stances: { ...HELD_RIFLE.stances, stand: { ...HELD_RIFLE.stances.stand, targetMax: 100 } } };

  it('TICK is GAME_FRAME_DT, 525/15734 s: FUN_005c2670 runs once per kit tick FUN_005c0fd0, once a 30 Hz frame', () => {
    expect(TICK).toBe(GAME_FRAME_DT);
    expect(TICK).toBeCloseTo(0.03336723, 8);
  });

  it('a second of 60 Hz page frames opens the bloom by TargetDilateUponMovement / GAME_FRAME_DT (29.97), not 60 or 29', () => {
    const a = new Accuracy(wide);
    const run: AccuracyInput = { ...still, velocity: [65, 0, 0] };   // 4225 / 65 = 65: far past the 1 a frame
    for (let i = 0; i < 60; i++) a.update(1 / 60, run);
    expect(a.state().size).toBeCloseTo(1 + 1 / GAME_FRAME_DT, 9);    // the per-second equivalent of 1 a 30 Hz frame
    const frame = new Accuracy(wide);
    frame.tick(TICK, run);                                           // one tick of the original's frame: exactly 1
    expect(frame.state().size).toBeCloseTo(2, 12);
  });

  it('the constrict stays TargetConstrict a second: 0.1 s of page frames closes 50 x 0.1', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.round(0, 'stand');                                             // 8
    for (let i = 0; i < 6; i++) a.update(1 / 60, still);             // 0.1 s
    expect(a.state().size).toBeCloseTo(8 - 50 * 0.1, 9);
  });

  it('each page frame reads its own look rate (FUN_00594600: (old - new) / dt over the frame it runs; MISSION R8)', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.update(GAME_FRAME_DT / 2, { ...still, yawRate: 0.4 });
    expect(a.state().target).toBeCloseTo(5.29 * 30 * 0.4 ** 2, 9);
    a.update(GAME_FRAME_DT / 2, { ...still, yawRate: 0 });
    expect(a.state().target).toBe(1);                                 // at rest: TargetMin
  });
});

describe('the knock (FUN_005c3360, FUN_005c2670)', () => {
  it('climbs 0.4 x 12 on the first round, 12 after, capped at 45; comes back at 70 a second', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.trigger();
    a.round(0, 'stand');
    expect(a.state().offset[1]).toBeCloseTo(-4.8, 9);               // KnockCount 1 x KnockEntryStrength 0.4
    a.round(0, 'stand');
    expect(a.state().offset[1]).toBeCloseTo(-16.8, 9);
    for (let i = 0; i < 5; i++) a.round(0, 'stand');
    expect(a.state().offset[1]).toBe(-45);                            // ReticuleKnockMax
    a.update(0.5, still);                                            // continuous (MISSION R8): 0.5 s x 70
    expect(a.state().offset[1]).toBeCloseTo(-45 + 70 * 0.5, 9);       // -10
    a.update(1, still);
    expect(a.state().offset[1]).toBe(0);
    // A new pull starts at the entry strength again.
    a.trigger();
    a.round(0, 'stand');
    expect(a.state().offset[1]).toBeCloseTo(-4.8, 9);
  });

  it('prone knocks 10 to a cap of 20 on the SD', () => {
    const a = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 6; i++) a.round(0, 'prone');
    expect(a.state().offset[1]).toBe(-20);
    expect(a.state().size).toBe(24);                                 // TargetMax prone 24
  });

  it('scoped (5+): no knock, no bloom; the first round kicks, the second drops the scope', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.trigger();
    expect(a.round(5, 'stand')).toEqual({ dropZoom: false, kick: true });
    expect(a.round(5, 'stand')).toEqual({ dropZoom: true, kick: false });
    expect(a.state()).toMatchObject({ size: 1, offset: [0, 0], burst: 2 });
    expect(kickStarts(0, 1)).toBe(false);                            // unscoped: the camera never kicks
    expect(kickStarts(1, 1)).toBe(false);
    expect(kickStarts(5, 1)).toBe(true);
    expect(kickTicks(4)).toBe(true);
    expect(kickTicks(1)).toBe(false);
  });

  it('first person (state 1, the owner 2026-10-01): knocked as unscoped, no kick, the reticle drawn full size', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.trigger();
    expect(a.round(1, 'stand')).toEqual({ dropZoom: false, kick: false });
    expect(a.round(1, 'stand')).toEqual({ dropZoom: false, kick: false });
    expect(a.state().offset[1]).toBeLessThan(0);                     // the knock climbs the reticle, as in third person
    const size = a.state().size;
    expect(a.reticle(1).size).toBe(size);                            // FUN_00215250: halved only in state 0
    expect(a.reticle(0).size).toBe(size * 0.5);
  });
});

describe('the stance the round and the exertion read (FUN_0058a720: (body, 1) the round, (body, 0) the exertion)', () => {
  /** A crouched SEAL at full stick on a flat floor: the crouch run (`FUN_00584c60` 444172), posture 'stand'. */
  function crouchRunner(): Walker {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const floor: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    };
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
    const w = new Walker(groundGrid(packGround(params, [floor], owners)));
    w.place(0, 20, 0);
    w.settle();
    w.stance = 'crouch';
    for (let i = 0; i < 60; i++) w.tick({ forward: 1, right: 0, boost: false });
    return w;
  }

  it("a crouch-run round knocks the stand row's 12, not the crouch row's 11 (477722: FUN_0058a720(body, 1))", () => {
    const w = crouchRunner();
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe('stand');
    expect(sd.stand.knock).toBe(12);
    expect(sd.crouch.knock).toBe(11);
    const a = new Accuracy(HELD_RIFLE);
    a.trigger();
    a.round(0, w.posture);
    const first = a.state().offset[1];
    a.round(0, w.posture);
    expect(first - a.state().offset[1]).toBeCloseTo(12, 9);
    // The page's gun (`./matchFirearm`, both pages': ONE-WIRE) reads the posture (walk.posture(), the (body, 1) value), never the raw stance.
    const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchFirearm.ts'), 'utf8');
    expect(main).toMatch(/const stance = walk\.posture\(\);\s*if \(accuracy\.round\(zoom\.state\(\), stance\)/);
    // TURRET-RETICLE (#283): mounted, the reticle's stance is the turret's named reading; on foot, the raw stance as before.
    expect(main).toMatch(/rawStance: turret \? TURRET_RETICLE_STANCE_READING : walk\.stance\(\)/);
  });

  it("the exertion decays at the raw stance's SniperDecayRate (418349: FUN_0058a720(body, 0))", () => {
    expect(sd.crouch.sniperDecay).toBe(-0.05);
    expect(sd.stand.sniperDecay).toBe(-0.04);
    const a = new Accuracy(HELD_RIFLE);
    a.enterView(0, 5);
    a.update(TICK, { ...still, zoomState: 5, stance: 'stand', rawStance: 'crouch' });
    expect(a.state().exertion).toBeCloseTo(1 - 0.05 * TICK, 12);
    const b = new Accuracy(HELD_RIFLE);
    b.enterView(0, 5);
    b.update(TICK, { ...still, zoomState: 5, stance: 'stand' });           // no raw stance: the stance's row
    expect(b.state().exertion).toBeCloseTo(1 - 0.04 * TICK, 12);
  });
});

describe("the look rates the bloom reads (LOOK_JUMP_READING: the page's and the server's one rule)", () => {
  it('a look change is a turn at its rate; past LOOK_JUMP_READING in one sample it is a placement: no rate', () => {
    expect(LOOK_JUMP_READING).toBe(45);
    const r = lookRates(10, -5, 1 / 60);
    expect(r.yawRate).toBeCloseTo((10 * Math.PI) / 180 * 60, 12);
    expect(r.pitchRate).toBeCloseTo((-5 * Math.PI) / 180 * 60, 12);
    expect(lookRates(180, 0, 1 / 60)).toEqual({ yawRate: 0, pitchRate: 0 });             // a respawn's turn-about
    expect(lookRates(0, LOOK_JUMP_READING + 1, 1 / 60)).toEqual({ yawRate: 0, pitchRate: 0 });
    expect(lookRates(10, 0, 0)).toEqual({ yawRate: 0, pitchRate: 0 });
  });

  it("a 180 degree respawn turn leaves the page's cone as it was", () => {
    const a = new Accuracy(HELD_RIFLE), b = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 60; i++) { a.update(TICK, still); b.update(TICK, still); }
    a.update(TICK, { ...still, ...lookRates(180, 0, TICK) });
    b.update(TICK, still);
    expect(a.state()).toEqual(b.state());
  });
});

describe('the cone (FUN_005bd100, FUN_00592260)', () => {
  it('turns pixels to tangents as the game does: tan(tan(hfov)) over the half frame', () => {
    const t = tangentPerPixel(MAP_FOV);
    expect(t.x).toBeCloseTo(Math.tan(Math.tan(0.6109)) / 320, 12);
    expect(t.y).toBeCloseTo(Math.tan(Math.tan(0.6109) * 448 / 640) / 224, 12);
    expect(t.y).toBeCloseTo(0.0023818, 6);
    const a = new Accuracy(HELD_RIFLE);
    a.round(0, 'stand');                                             // size 8, knock -4.8
    const c = a.cone(0, 1);
    expect(c.radius).toBeCloseTo(8 * t.y * RADIUS_FACTOR, 12);
    expect(c.offsetY).toBeCloseTo(4.8 * t.y, 12);                    // up is positive: the rounds climb with it
    expect(c.offsetX).toBe(0);
    expect(a.cone(5, 3).radius).toBe(0);                             // scoped: a point
  });

  it('spreads a round over a square, densest at its centre, never past its corners', () => {
    let i = 0;
    const seq = [0.5, 0.5, 1 - 1e-12, 0, 0.75, 0.25];
    const rand = (): number => seq[i++ % seq.length]!;
    const cone = { offsetX: 0, offsetY: 0, radius: 0.01 };
    expect(perturb([0, 0, -1], cone, rand)).toEqual([0, 0, -1]);    // u = 0 both: dead centre
    const edge = perturb([0, 0, -1], cone, rand);                   // u = +1, -1: the corner (+r, -r)
    expect(edge[0]).toBeCloseTo(0.01, 9);
    expect(edge[1]).toBeCloseTo(-0.01, 9);
    const mid = perturb([0, 0, -1], cone, rand);                    // u = 0.5, -0.5: a quarter of the way
    expect(mid[0]).toBeCloseTo(0.0025, 9);
    expect(mid[1]).toBeCloseTo(-0.0025, 9);
    // The axes: right = dir x up, up = right x dir -- for a level look along -z, +x and +y.
    const off = perturb([0, 0, -1], { offsetX: 0.02, offsetY: 0.03, radius: 0 }, () => 0.5);
    expect(off).toEqual([0.02, 0.03, -1]);
    // Looking 60 degrees down the axes shorten to cos 60 (the game does not normalise them).
    const d: [number, number, number] = [0, -Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3)];
    const down = perturb(d, { offsetX: 0.02, offsetY: 0, radius: 0 }, () => 0.5);
    expect(down[0]).toBeCloseTo(0.02 * 0.5, 9);
  });

  it('a thousand rounds land inside the square, three quarters of them in its inner half', () => {
    const a = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 3; i++) a.round(0, 'stand');
    const c = a.cone(0, 1);
    let inner = 0;
    let seed = 7;
    const rand = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 1000; i++) {
      const [x, y] = perturb([0, 0, -1], c, rand);
      expect(Math.abs(x - c.offsetX)).toBeLessThanOrEqual(c.radius + 1e-12);
      expect(Math.abs(y - c.offsetY)).toBeLessThanOrEqual(c.radius + 1e-12);
      if (Math.abs(x - c.offsetX) < c.radius / 2) inner++;
    }
    // P(|u|^2 < 1/2) = 1/sqrt(2) = 0.707 per axis.
    expect(inner / 1000).toBeGreaterThan(0.65);
    expect(inner / 1000).toBeLessThan(0.76);
  });
});

describe('the scoped sway (FUN_005b9280)', () => {
  it('drifts only scoped, within SniperDistLimit, turning at its ends', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.update(1, still);
    expect(a.state().sway).toEqual([0, 0]);
    let maxX = 0;
    // The turn stick holds the exertion at 1 before each tick's decay step (research 84 section 17): the limit is
    // 20 x (0.8 (1 - 0.04/60) + 0.2), a hair under SniperDistLimitX.
    const busy = { ...still, zoomState: 5, sticks: { forward: 0, right: 0, turn: 1, pitch: 0 } };
    for (let i = 0; i < 600; i++) { a.update(TICK, busy); maxX = Math.max(maxX, Math.abs(a.state().sway[0])); }
    expect(maxX).toBeCloseTo(20 * (0.8 * (1 - 0.04 * TICK) + 0.2), 9);
    expect(Math.abs(a.state().sway[1])).toBeLessThanOrEqual(24);
    // The first tick: x += dt x (6 + 0.25) at the centre.
    const b = new Accuracy(HELD_RIFLE);
    b.update(TICK, { ...still, zoomState: 5 });
    expect(b.state().sway[0]).toBeCloseTo(6.25 * TICK, 12);
    // The cone follows it, not the size.
    expect(b.cone(5, 1).offsetX).toBeCloseTo(-6.25 * TICK * tangentPerPixel().x, 12);
  });
});

describe('the zoom on the cone (FUN_005bd100: the offsets over cam+0x474, the magnification)', () => {
  // FUN_005bd100 decomp 474236-474266: fVar9 = d_aim / (cam+0x474 x (d_aim - d_fire)) multiplies +0x5d4 and +0x5d8 (the
  // offsets: the knock unscoped, the sway scoped), not +0x5dc (the radius). cam+0x474 is the magnification on screen
  // (FUN_0029b2f0 with DAT_003dc338, x the NTSC 1.0), so a scope's rounds wander ZoomMode[state - 4] times less.
  const sd3x = HELD_RIFLE.zoomModes[1]!;                               // the SD's one scope level, 3x
  const scopedFor = (stance: AccuracyInput['stance'], seconds: number): Accuracy => {
    const a = new Accuracy(HELD_RIFLE);
    a.update(seconds, { ...still, stance, zoomState: 5 });
    return a;
  };

  it('scoped, the sway turns into tangents divided by the magnification: 3x on the SD is a third', () => {
    expect(sd3x).toBe(3);
    const a = scopedFor('stand', 2);
    const [sx, sy] = a.state().sway;
    const t = tangentPerPixel();
    const c = a.cone(5, sd3x);
    expect(c.radius).toBe(0);
    expect(c.offsetX).toBeCloseTo((-sx * t.x) / 3, 12);
    expect(c.offsetY).toBeCloseTo((-sy * t.y) / 3, 12);
    // The same sway at 1x (the zoom's run not yet started) is three times as far off the cross.
    expect(a.cone(5, 1).offsetX).toBeCloseTo(c.offsetX * 3, 12);
  });

  it('unscoped the magnification is 1: the knock and the bloom are as they were', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.round(0, 'stand');
    const t = tangentPerPixel();
    const c = a.cone(0, 1);
    expect(c.offsetX).toBe(0);
    expect(c.offsetY).toBeCloseTo(4.8 * t.y, 12);
    expect(c.radius).toBeCloseTo(8 * t.y * RADIUS_FACTOR, 12);
  });

  it('a scoped round is never further off the cross than SniperDistLimit / ZoomMode, in every stance', () => {
    const t = tangentPerPixel();
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const a = new Accuracy(HELD_RIFLE);
      let worstX = 0, worstY = 0;
      for (let i = 0; i < 1200; i++) {
        a.update(TICK, { ...still, stance, zoomState: 5, sticks: { forward: 0, right: 0, turn: 1, pitch: 0 } });
        const c = a.cone(5, sd3x);
        worstX = Math.max(worstX, Math.abs(c.offsetX));
        worstY = Math.max(worstY, Math.abs(c.offsetY));
      }
      const k = 0.8 * (1 + sd[stance].sniperDecay * TICK) + 0.2;       // the exertion held at 1 by the turn stick
      expect(worstX).toBeCloseTo((sd[stance].swayLimitX * k * t.x) / 3, 9);
      expect(worstY).toBeLessThanOrEqual((sd[stance].swayLimitY * t.y) / 3 + 1e-12);
    }
  });

  it('measured: 600 rounds a second apart a tick -- the scope is a third of its 1x self and tighter than moving', () => {
    // The mean angle (radians) off the aim of one round a tick for 10 s, each through FUN_00592260's square.
    const spread = (input: AccuracyInput, magnification: number): number => {
      const a = new Accuracy(HELD_RIFLE);
      let seed = 11;
      const rand = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      let sum = 0;
      for (let i = 0; i < 600; i++) {
        a.update(TICK, input);
        const [x, y] = perturb([0, 0, -1], a.cone(input.zoomState, magnification), rand);
        sum += Math.hypot(x, y);
      }
      return sum / 600;
    };
    const walking = { ...still, velocity: [30, 0, 0] as [number, number, number] };
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const scoped = spread({ ...still, stance, zoomState: 5 }, sd3x);
      expect(scoped).toBeCloseTo(spread({ ...still, stance, zoomState: 5 }, 1) / 3, 12);
      expect(scoped).toBeLessThan(spread({ ...walking, stance }, 1));
    }
  });
});

describe('the exertion (body+0xeb0: FUN_00550ef0 418340-418390, FUN_00578150, FUN_005b9280)', () => {
  // {cur 1, target 0, mode 0} at the body's creation (decomp 419589-419598). Each tick: raised (clamped to 1) by
  // |+0x240| + 0.1 |+0x23c| + |+0x244| + 0.05 |controller+0x138|, then pulled toward 0 at -SniperDecayRate a second
  // (cur += -rate x dt x (0 - cur)), snapped to 0 within 0.005. The sway's limit is SniperDistLimit x (0.8 cur + 0.2)
  // and it moves only while cur > 0.2.
  const scope = { ...still, zoomState: 5 };
  const ticksTo = (a: Accuracy, input: AccuracyInput, n: number): void => { for (let i = 0; i < n; i++) a.update(TICK, input); };

  it('starts at 1; still in the scope it decays at the stance SniperDecayRate a second', () => {
    expect(sd.stand.sniperDecay).toBe(-0.04);
    expect(sd.prone.sniperDecay).toBe(-0.2);
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const a = new Accuracy(HELD_RIFLE);
      expect(a.state().exertion).toBe(1);
      a.enterView(0, 5);
      ticksTo(a, { ...scope, stance }, 120);                              // 4 s: 120 game frames
      const r = -sd[stance].sniperDecay * TICK;
      expect(a.state().exertion).toBeCloseTo((1 - r) ** 120, 9);
    }
  });

  it('prone, the sway reaches its floor in about 8 s and stops: the limit 0.36 of SniperDistLimit', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.enterView(0, 5);
    const prone = { ...scope, stance: 'prone' as const };
    // (1 - 0.2 x 525/15734)^n <= 0.2: n = 241 game frames, 8.04 s (PF-02; at the port's old 60 Hz, 483 ticks, 8.05 s).
    expect(Math.ceil(Math.log(0.2) / Math.log(1 - 0.2 * TICK))).toBe(241);
    ticksTo(a, prone, 240);
    expect(a.state().exertion).toBeGreaterThan(0.2);
    ticksTo(a, prone, 1);
    expect(a.state().exertion).toBeLessThanOrEqual(0.2);
    const frozen = a.state().sway;
    ticksTo(a, prone, 600);
    expect(a.state().sway).toEqual(frozen);                              // below 0.2 the sway stops where it is
    expect(Math.abs(frozen[0])).toBeLessThanOrEqual(sd.prone.swayLimitX * (0.8 * 0.2 + 0.2) + 1e-3);
    expect(Math.abs(frozen[1])).toBeLessThanOrEqual(sd.prone.swayLimitY * (0.8 * 0.2 + 0.2) + 1e-3);
    expect(a.swayLimit('prone')).toEqual([sd.prone.swayLimitX * (0.8 * a.state().exertion + 0.2), sd.prone.swayLimitY * (0.8 * a.state().exertion + 0.2)]);
  });

  it('standing the limit narrows slowly: 10 s still is 0.8 x 0.67 + 0.2 of it', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.enterView(0, 5);
    ticksTo(a, scope, 300);                                              // 10 s: 300 game frames (10.01 s)
    const f = (1 - 0.04 * TICK) ** 300;
    expect(f).toBeCloseTo(0.670, 3);
    expect(a.swayLimit('stand')[0]).toBeCloseTo(20 * (0.8 * f + 0.2), 9);
    let worst = 0;
    for (let i = 0; i < 1200; i++) { a.update(TICK, scope); worst = Math.max(worst, Math.abs(a.state().sway[0])); }
    expect(worst).toBeLessThanOrEqual(20 * (0.8 * f + 0.2) + 1e-9);
  });

  it('the sticks, a round and the scope raise it: a move stick pins it at 1, a round adds 0.35, the scope 0.5', () => {
    const a = new Accuracy(HELD_RIFLE);
    ticksTo(a, { ...scope, stance: 'prone' }, 600);
    const low = a.state().exertion;
    expect(low).toBeLessThan(0.2);
    a.round(0, 'prone');
    expect(a.state().exertion).toBeCloseTo(low + 0.35, 12);
    a.enterView(0, 5);
    expect(a.state().exertion).toBeCloseTo(low + 0.35 + 0.5, 12);
    a.round(0, 'prone');
    expect(a.state().exertion).toBe(1);                                  // clamped at 1
    const b = new Accuracy(HELD_RIFLE);
    ticksTo(b, { ...scope, stance: 'prone' }, 600);
    const before = b.state().exertion;
    b.update(TICK, { ...scope, stance: 'prone', sticks: { forward: 0, right: 0, turn: 0.1, pitch: 0 } });
    // + 0.1 x 0.1, then the decay's step on the sum.
    expect(b.state().exertion).toBeCloseTo((before + 0.01) * (1 - 0.2 * TICK), 12);
    const mid = b.state().exertion;
    b.update(TICK, { ...scope, stance: 'prone', sticks: { forward: 0.05, right: 0.05, turn: 0, pitch: 0.2 } });
    expect(b.state().exertion).toBeCloseTo((mid + 0.05 + 0.05 + 0.05 * 0.2) * (1 - 0.2 * TICK), 12);
    const c = new Accuracy(HELD_RIFLE);
    ticksTo(c, { ...scope, stance: 'prone' }, 300);                    // 10 s: 0.135 left, + 0.9 is past 1
    c.update(TICK, { ...scope, stance: 'prone', sticks: { forward: 0.9, right: 0, turn: 0, pitch: 0 } });
    expect(c.state().exertion).toBeCloseTo(1 - 0.2 * TICK, 12);          // pinned at 1, then one step of decay
    expect(enterRaises(0, 5)).toBe(true);
    expect(enterRaises(6, 5)).toBe(false);                               // FUN_005448a0: not from state 6
    expect(enterRaises(5, 6)).toBe(true);
    expect(enterRaises(0, 4)).toBe(true);
    expect(enterRaises(4, 3)).toBe(false);
  });

  it('running (|v| of 20 a second or more) the pull is 1 - |forward| instead of the decay: it climbs', () => {
    const a = new Accuracy(HELD_RIFLE);
    ticksTo(a, { ...still, stance: 'prone' }, 600);
    const low = a.state().exertion;
    // FUN_0058a820 class 3; the throttle 0 so nothing is raised: cur += -(1 - 0) dt (0 - cur).
    a.update(TICK, { ...still, stance: 'prone', velocity: [25, 0, 0] });
    expect(a.state().exertion).toBeCloseTo(low * (1 + TICK), 12);
  });

  it('the scoped spread, still for 20 s: prone settles to a frozen point, a fraction of its first seconds', () => {
    const t = tangentPerPixel();
    const a = new Accuracy(HELD_RIFLE);
    a.enterView(0, 5);
    const prone = { ...scope, stance: 'prone' as const };
    let early = 0;
    for (let i = 0; i < 120; i++) { a.update(TICK, prone); early = Math.max(early, Math.abs(a.cone(5, 3).offsetX)); }
    ticksTo(a, prone, 1080);
    const late = Math.abs(a.cone(5, 3).offsetX);
    expect(late).toBeLessThanOrEqual((sd.prone.swayLimitX * 0.36 * t.x) / 3 + 1e-6);
    expect(a.cone(5, 3)).toEqual((a.update(TICK, prone), a.cone(5, 3)));
    expect(early).toBeGreaterThan(0);
  });
});

describe('the fire modes (FUN_005c0940, FUN_005c09f0, FUN_005c4600)', () => {
  it('single 1 round a pull at FireWait, burst 3 and automatic at 0.8 x FireWait', () => {
    expect([0, 1, 2, 3].map(roundsPerPull)).toEqual([0, 1, 3, 10000]);
    expect(fireInterval(0.14, 1)).toBe(0.14);
    expect(fireInterval(0.14, 2)).toBeCloseTo(0.112, 12);
    expect(fireInterval(0.14, 3)).toBeCloseTo(0.112, 12);           // 536 rounds a minute on the SD
  });

  it('the original comes up on burst, else its first mode (FUN_005c0250); the switch goes single, burst, automatic and round; not while scoped', () => {
    // The original's spawn (FUN_005c0250 D:L476185-476192): FUN_005c4600 steps the zero mode to the first one enabled,
    // then burst where the weapon has it.
    expect(originalSpawnFireMode(HELD_RIFLE)).toBe(2);
    expect(originalSpawnFireMode({ ...HELD_RIFLE, maxFireMode: 3, fireModes: [1, 3] })).toBe(1);
    expect(originalSpawnFireMode({ ...HELD_RIFLE, maxFireMode: 3, fireModes: [3] })).toBe(3);
    expect(originalSpawnFireMode({ ...HELD_RIFLE, maxFireMode: 2, fireModes: [1, 2] })).toBe(2);
    expect(originalSpawnFireMode({ ...HELD_RIFLE, maxFireMode: 1, fireModes: [1] })).toBe(1);
    // A sidearm with no primary (D:L476105): selected (a step, D:L478930-478931), then stepped again (D:L476185).
    const model18 = { ...HELD_SIDEARM, maxFireMode: 3, fireModes: [1, 3] };
    expect([originalSpawnFireMode(model18), originalSpawnFireMode(model18, [], true)]).toEqual([1, 3]);
    expect(originalSpawnFireMode(HELD_SIDEARM, [], true)).toBe(1);
    expect(originalSpawnFireMode({ ...HELD_SIDEARM, maxFireMode: 3, fireModes: [1, 2, 3] }, [], true)).toBe(2);
    expect(originalSpawnFireMode({ ...HELD_SIDEARM, maxFireMode: 3, fireModes: [3] }, [], true)).toBe(3);
    // OT.R100 (DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION): every weapon with automatic comes up on it; the rest as the original.
    expect(DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION).toBe(true);
    expect(defaultFireMode(HELD_RIFLE)).toBe(3);
    expect(defaultFireMode({ ...HELD_RIFLE, maxFireMode: 3, fireModes: [1, 3] })).toBe(3);
    expect(defaultFireMode({ ...HELD_RIFLE, maxFireMode: 2, fireModes: [1, 2] })).toBe(2);
    expect(defaultFireMode({ ...HELD_RIFLE, maxFireMode: 1, fireModes: [1] })).toBe(1);
    expect(nextFireMode(HELD_RIFLE, 3)).toBe(1);
    expect(nextFireMode(HELD_RIFLE, 1)).toBe(2);
    expect(nextFireMode(HELD_RIFLE, 2)).toBe(3);
    expect(nextFireMode(HELD_RIFLE, 3, true)).toBe(3);
    const m14 = { ...HELD_RIFLE, maxFireMode: 3, fireModes: [1, 3] };   // SingleMode + AutoMode, no burst
    expect(nextFireMode(m14, 1)).toBe(3);
  });
});

describe('penetrate (FUN_003c8920)', () => {
  it('passes over 1.0, strikes the rest, and cuts the range by (1 + Piercing x 0.1) x PENETRATION', () => {
    // range 100, Piercing 3: glass 0.99 -> 128.7, not less, kept 100; metal 0.35 -> 45.5.
    expect(penetrate([{ distance: 10, penetration: 1 }, { distance: 20, penetration: 0.99 }, { distance: 30, penetration: 0.35 },
      { distance: 40, penetration: 0 }], 100, 3)).toMatchObject({ struck: [1, 2, 3], through: false });
    expect(penetrate([{ distance: 30, penetration: 0.35 }, { distance: 50, penetration: 0 }], 100, 3)).toEqual({ struck: [0], through: true, range: 45.5 });   // 45.5: spent
    expect(penetrate([{ distance: 120, penetration: 0 }], 100, 3)).toEqual({ struck: [], through: true, range: 100 });   // out of range
    expect(penetrate([{ distance: 20, penetration: 0.99 }], 100, 3)).toEqual({ struck: [0], through: true, range: 100 });
    expect(penetrate([{ distance: 50, penetration: 0.35 }], 100, 0)).toEqual({ struck: [0], through: false, range: 35 });   // 35 < 50
  });
});

/**
 * NU-3a C3 (research 321 section 3.2, D3): a swap carries the kit's state. The kit's size `+0x84c` has no writer but the
 * tick (D:L477295-477297, D:L477356-477368) and the round (D:L477797-477804), and the switch (`FUN_005c4b10`
 * D:L478779-478938) writes none of the knock (`+0x20/+0x24`), the sway (`+0x28/+0x2c`), the pull's count (`+0x818`) or the
 * body's exertion (`body+0xeb0`): the new record's first tick lifts the size to its `TargetMin` if under and moves it at
 * its own rates. A set changed by the switch is marked (D:L478908-478911) and the HUD frame's take of the mark
 * (`FUN_005be5f0` D:L475036-475047, from `FUN_00216770` D:L70394, D:L70401) adds 0.5 to the exertion, capped at 1
 * (`FUN_00578150` D:L437518-437540). `reset()` stays for a life and a map. Was, before NU-3a: `setWeapon` called `reset()`.
 */
describe('NU-3a C3: a swap carries the size, the knock, the sway, the pull and the exertion (FUN_005c4b10)', () => {
  /** The M4A1 SD's exertion run down to exactly `x` standing still (its SniperDecayRate -0.04: x 0.96 a second). */
  const decayTo = (a: Accuracy, x: number): void => {
    while (a.state().exertion * 0.96 > x) a.tick(1, still);
    a.tick((1 - x / a.state().exertion) / 0.04, still);
  };

  it('the Mark 23 bloomed to 30, swapped to the M4A1 SD: 30 - 50/60 after one 1/60 s tick, closing at 50 a second to 1 after 0.58 s', () => {
    const a = new Accuracy(HELD_SIDEARM);
    a.round(0, 'stand');
    expect(a.state().size).toBe(30);                                  // TargetMin 10 + TargetDilateUponFire 20
    a.setWeapon(HELD_RIFLE);
    expect(a.state().size).toBe(30);                                  // carried: the switch writes no +0x84c
    a.update(1 / 60, still);                                          // the lift (none: over 1), the target 1, closing 50/s
    expect(a.state().size).toBeCloseTo(30 - 50 / 60, 12);           // about 29.17
    for (let i = 1; i < 34; i++) a.update(1 / 60, still);
    expect(a.state().size).toBeCloseTo(30 - 50 * (34 / 60), 9);       // 1.67 after 34 frames
    a.update(1 / 60, still);
    expect(a.state().size).toBe(1);                                   // (30 - 1) / 50 = 0.58 s: at rest on the 35th
  });

  it('the M4A1 SD at rest (1) taken to the Mark 23: lifted to its TargetMin 10 on the first tick', () => {
    const a = new Accuracy(HELD_RIFLE);
    a.setWeapon(HELD_SIDEARM);
    expect(a.state().size).toBe(1);
    a.update(1 / 60, still);
    expect(a.state().size).toBe(10);
  });

  it('the knock carried (SWAP_KNOCK_READING) and returning at the new record\'s ReticuleKnockReturn; the pull\'s count and the sway kept', () => {
    expect(SWAP_KNOCK_READING).toBe('carried');
    const a = new Accuracy(HELD_SIDEARM);
    a.trigger();
    a.round(0, 'stand');
    a.round(0, 'stand');
    expect([a.state().offset[1], a.rounds()]).toEqual([-40, 2]);       // ReticuleKnockMax 40
    a.setWeapon(HELD_RIFLE);
    expect([a.state().offset[1], a.rounds()]).toEqual([-40, 2]);
    a.update(1 / 60, still);
    expect(a.state().offset[1]).toBeCloseTo(-40 + 70 / 60, 12);        // the SD's 70 a second, not the Mark 23's 60
    // The scoped sway (kit +0x28/+0x2c): the SD's, carried to the Mark 23 as it stood.
    const b = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 20; i++) b.tick(TICK, { ...still, zoomState: 5 });
    const sway = b.state().sway;
    expect(sway[0]).not.toBe(0);
    b.setWeapon(HELD_SIDEARM);
    expect(b.state().sway).toEqual(sway);
  });

  it('the exertion carried; the set the swap changed adds 0.5, capped at 1: from 0.3 it reads 0.8 (the page\'s reset read 1)', () => {
    const a = new Accuracy(HELD_RIFLE);
    decayTo(a, 0.3);
    expect(a.state().exertion).toBeCloseTo(0.3, 12);
    a.setWeapon(HELD_SIDEARM);
    expect(a.state().exertion).toBeCloseTo(0.3, 12);                  // the switch writes no body+0xeb0
    a.reticleSetChanged();                                            // set 1 -> 0: FUN_005be5f0's take of the mark
    expect(a.state().exertion).toBeCloseTo(0.8, 12);
    a.reticleSetChanged();
    expect(a.state().exertion).toBe(1);                               // capped (FUN_00578150)
    const b = new Accuracy(HELD_RIFLE);
    decayTo(b, 0.6);
    b.reticleSetChanged();
    expect(b.state().exertion).toBe(1);                               // 0.6 + 0.5 over 1: 1
  });

  it('reset() stays for a life and a map: the record\'s TargetMin, the knock, the sway and the pull at 0, the exertion 1', () => {
    const a = new Accuracy(HELD_SIDEARM);
    a.trigger();
    a.round(0, 'stand');
    a.setWeapon(HELD_RIFLE);
    a.reset();
    expect(a.state()).toEqual({ size: 1, target: 1, offset: [0, 0], sway: [0, 0], burst: 0, exertion: 1 });
  });
});

/**
 * The review of the zoom replay (2026-10-05, L1): a switch in the tick a zoom step was taken in steps the zoom again
 * against the new slot (`./zoom` `switchWeapon`), and the view's own effects -- the scope's +0.5 exertion
 * (`FUN_005b9180`, `enterView`) and the knock cleared leaving it (`leaveScope`) -- follow the replay's path, not the first
 * pass's: the tick's view effects are undone (`undoViewTick`: the raise's applied delta taken back, the offsets put back)
 * and the replay's applied (`applyViewPath`).
 */
describe('the view effects of a tick replayed at a switch', () => {
  /** A round fired (the knock's offset) and two ticks run: the exertion under 1, so a raise shows. */
  const decayed = (): Accuracy => {
    const a = new Accuracy(HELD_RIFLE);
    a.round(0, 'stand');
    a.update(TICK, still);
    a.update(TICK, still);
    return a;
  };

  it('a raise and a leave since the tick are undone: the exertion and the knock as the tick left them', () => {
    const a = decayed();
    const before = a.state();
    expect(before.exertion).toBeLessThan(1);
    expect(before.offset).not.toEqual([0, 0]);
    a.markViewTick();
    a.enterView(1, 5);
    a.leaveScope();
    expect(a.state().exertion).toBeGreaterThan(before.exertion);
    expect(a.state().offset).toEqual([0, 0]);
    a.undoViewTick();
    expect(a.state().exertion).toBeCloseTo(before.exertion, 12);
    expect(a.state().offset).toEqual(before.offset);
  });

  it('the night vision rifle at 3, Up, then L2 on a night map: no +0.5 and no knock cleared (the pistol stays at 3)', () => {
    const a = decayed();
    const before = a.state();
    const z = new Zoom(HELD_RIFLE, true);
    z.zoomIn();
    z.zoomIn();
    expect(z.state()).toBe(3);
    z.markTick();
    a.markViewTick();
    const was = z.state();
    z.zoomIn();                                                      // the rifle's scope: the first pass's +0.5
    a.enterView(was, z.state());
    expect(a.state().exertion).toBeGreaterThan(before.exertion);
    const r = z.switchWeapon(HELD_SIDEARM, 'firearm');
    expect(r.state).toBe(3);
    if (r.replayed) a.undoViewTick();
    a.applyViewPath(r.path);
    expect(a.state().exertion).toBeCloseTo(before.exertion, 12);
    expect(a.state().offset).toEqual(before.offset);
  });

  it('the reverse: the Mark 23 at 3, Up, then L1: the rifle\'s scope reached, its +0.5 applied', () => {
    const a = decayed();
    const before = a.state();
    const z = new Zoom(HELD_SIDEARM, true);
    z.zoomIn();
    z.zoomIn();
    expect(z.state()).toBe(3);
    z.markTick();
    a.markViewTick();
    const was = z.state();
    z.zoomIn();
    a.enterView(was, z.state());
    expect(a.state().exertion).toBeCloseTo(before.exertion, 12);   // the pistol stays at 3: no raise
    const r = z.switchWeapon(HELD_RIFLE, 'firearm');
    expect(r.state).toBe(5);
    if (r.replayed) a.undoViewTick();
    a.applyViewPath(r.path);
    expect(a.state().exertion).toBeCloseTo(Math.min(1, before.exertion + 0.5), 12);
  });
});
