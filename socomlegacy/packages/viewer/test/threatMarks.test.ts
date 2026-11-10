import { describe, expect, it } from 'vitest';
import {
  THREAT_DECAY, THREAT_FALLOFF, THREAT_INV_SPLIT, THREAT_PEAK_ALPHA, THREAT_QUADS, THREAT_RANGE_SQ, THREAT_TEAM_MASKS,
  ThreatMarks, threatHostile, threatMod90, type ThreatRelease,
} from '../src/threatMarks';

/**
 * THREAT-MARKS (research 321 section 2.6; the scope's sections 1.1-1.5): the release's threat block (`FUN_005c5340`
 * D:L479135-479216) and the HUD's per-frame pass (`FUN_00216de0` D:L70472-70587), transcribed. Reading, pending review.
 * Quad order: 0 right, 1 front-right, 2 front, 3 front-left, 4 left, 5 back-left, 6 back, 7 back-right.
 */

const Q = Object.fromEntries(THREAT_QUADS.map((q, i) => [q, i])) as Record<(typeof THREAT_QUADS)[number], number>;

/** A release against a SEAL at the origin facing -z (yaw 0), from a Terrorist at `from`, reach 1100 unless given. */
const shot = (from: [number, number, number], over: Partial<ThreatRelease> = {}): ThreatRelease => ({
  from, shooterTeam: 'terrorist', localTeam: 'seal', alive: true, localPos: [0, 0, 0], localYawDeg: 0, reach: 1100, ...over,
});

describe('the constants as the ELF holds them', () => {
  it('1.21e6 (0x4993b480), 8.264463e-7 (0x355dd8f5), 1/90 (0x3c360b61), the peak 50 and the decay 120', () => {
    const word = (h: number): number => { const v = new DataView(new ArrayBuffer(4)); v.setUint32(0, h); return v.getFloat32(0); };
    expect(THREAT_RANGE_SQ).toBe(word(0x4993b480));
    expect(Math.fround(THREAT_FALLOFF)).toBe(word(0x355dd8f5));
    expect(THREAT_INV_SPLIT).toBe(word(0x3c360b61));
    expect([THREAT_PEAK_ALPHA, THREAT_DECAY]).toEqual([50, 120]);
  });

  it('the team masks share no bit across the sides and every bit with themselves (D:L479136)', () => {
    expect(THREAT_TEAM_MASKS).toEqual({ seal: 0x40000001, terrorist: 0x80000100 });
    expect(threatHostile('seal', 'terrorist')).toBe(true);
    expect(threatHostile('terrorist', 'seal')).toBe(true);
    expect(threatHostile('seal', 'seal')).toBe(false);
    expect(threatHostile('terrorist', 'terrorist')).toBe(false);
    expect(threatHostile(null, 'terrorist')).toBe(false);
    expect(threatHostile('seal', null)).toBe(false);
  });

  it('the mod-90 loop leaves [0, 90): 450 -> 0, 45 -> 45, 135 -> 45, -100 -> 10', () => {
    expect([threatMod90(450), threatMod90(45), threatMod90(135), threatMod90(-100), threatMod90(89.5)]).toEqual([0, 45, 45, 10, 89.5]);
  });
});

describe('release: the gates and the magnitude (FUN_005c5340 D:L479135-479172)', () => {
  it('a team-mate, the page dead, no team of its own, no feet: nothing lit', () => {
    const t = new ThreatMarks();
    expect(t.release(shot([100, 0, 0], { shooterTeam: 'seal' }))).toBe(false);
    expect(t.release(shot([100, 0, 0], { alive: false }))).toBe(false);
    expect(t.release(shot([100, 0, 0], { localTeam: null }))).toBe(false);
    expect(t.release(shot([100, 0, 0], { localPos: null }))).toBe(false);
    expect(t.values().breadth).toEqual(new Array(8).fill(0));
    expect(t.flagState()).toEqual({ right: false, front: false, left: false, back: false });
  });

  it('1100 units and beyond: nothing (the strict 1.21e6 gate); 1099: lit with m about 0', () => {
    const t = new ThreatMarks();
    expect(t.release(shot([1100, 0, 0], { reach: 5000 }))).toBe(false);
    expect(t.release(shot([1099, 0, 0], { reach: 5000 }))).toBe(true);
    expect(t.values().breadth[Q.right]).toBeCloseTo(1 - (1099 * 1099) / 1.21e6, 6);
    expect(t.values().breadth[Q.right]).toBeLessThan(0.002);
  });

  it('beyond the record\'s reach (Sound_Radius x 10, record+0x34 its square) nothing; inside it lit', () => {
    const t = new ThreatMarks();
    // The M4A1 SD's 10 x 10 = 100: a round 101 away never lights, 99 away does.
    expect(t.release(shot([101, 0, 0], { reach: 100 }))).toBe(false);
    expect(t.release(shot([99, 0, 0], { reach: 100 }))).toBe(true);
    // Equipment's 0 never lights; nor an absent record's.
    expect(new ThreatMarks().release(shot([1, 0, 0], { reach: 0 }))).toBe(false);
  });

  it('the 552SD under r0004: a stored reach of 50 (R4B-10a: +0x30 = 50, +0x34 = 2500) lights at 49, not at 51', () => {
    expect(new ThreatMarks().release(shot([49, 0, 0], { reach: 50 }))).toBe(true);
    expect(new ThreatMarks().release(shot([51, 0, 0], { reach: 50 }))).toBe(false);
    // r0001's 400 for the same shot at 51 lights.
    expect(new ThreatMarks().release(shot([51, 0, 0], { reach: 400 }))).toBe(true);
  });

  it('m = 1 - (|d|/1100)^2: 1 at point blank, 0.75 at 550', () => {
    const t = new ThreatMarks();
    t.release(shot([0, 0, 0]));
    expect(t.values().breadth[Q.front]).toBe(1);
    t.release(shot([550, 0, 0]));
    expect(t.values().breadth[Q.right]).toBeCloseTo(0.75, 6);
  });

  it('the range counts height (3D): 1000 across and 500 up is out; across alone it is in', () => {
    expect(new ThreatMarks().release(shot([1000, 500, 0]))).toBe(false);
    expect(new ThreatMarks().release(shot([1000, 0, 0]))).toBe(true);
    const t = new ThreatMarks();
    t.release(shot([300, 400, 0]));
    expect(t.values().breadth[Q.right]).toBeCloseTo(1 - 250000 * THREAT_FALLOFF, 6);
  });
});

describe('release: the directions and the stores (D:L479181-479216)', () => {
  it('yaw 0 (facing -z): front -> f08, behind -> f18, right (+x) -> f00, left (-x) -> f10', () => {
    const at = (from: [number, number, number]) => { const t = new ThreatMarks(); t.release(shot(from)); return t.values().breadth.map((b) => b > 0); };
    expect(at([0, 0, -100])[Q.front]).toBe(true);
    expect(at([0, 0, 100])[Q.back]).toBe(true);
    expect(at([100, 0, 0])[Q.right]).toBe(true);
    expect(at([-100, 0, 0])[Q.left]).toBe(true);
  });

  it('yaw 90 (facing -x): front is -x, behind +x, right -z, left +z', () => {
    const at = (from: [number, number, number]) => { const t = new ThreatMarks(); t.release(shot(from, { localYawDeg: 90 })); return t.values().breadth; };
    expect(at([-100, 0, 0])[Q.front]).toBeGreaterThan(0);
    expect(at([100, 0, 0])[Q.back]).toBeGreaterThan(0);
    expect(at([0, 0, -100])[Q.right]).toBeGreaterThan(0);
    expect(at([0, 0, 100])[Q.left]).toBeGreaterThan(0);
  });

  it('dead ahead (both dots 0 across): the else branches, f08 and f10', () => {
    const t = new ThreatMarks();
    t.release(shot([0, 0, -45]));
    const b = t.values().breadth;
    expect(b[Q.front]).toBeGreaterThan(0);
    expect(b[Q.left]).toBe(b[Q.front]);
    expect([b[Q.right], b[Q.back]]).toEqual([0, 0]);
    expect(t.flagState()).toEqual({ right: false, front: true, left: true, back: false });
  });

  it('a later release zeroes the opposite floats and leaves their flags set', () => {
    const t = new ThreatMarks();
    t.release(shot([100, 0, -100]));                 // front-right
    t.release(shot([-100, 0, 100]));                 // back-left
    const b = t.values().breadth;
    expect([b[Q.right], b[Q.front]]).toEqual([0, 0]);
    expect(b[Q.left]).toBeGreaterThan(0);
    expect(b[Q.back]).toBeGreaterThan(0);
    expect(t.flagState()).toEqual({ right: true, front: true, left: true, back: true });
  });

  it('overwrite, not max: a far release after a near one lowers the float', () => {
    const t = new ThreatMarks();
    t.release(shot([100, 0, 0]));
    const near = t.values().breadth[Q.right]!;
    t.release(shot([900, 0, 0]));
    expect(t.values().breadth[Q.right]).toBeLessThan(near);
    expect(t.values().breadth[Q.right]).toBeCloseTo(1 - 810000 * THREAT_FALLOFF, 6);
  });

  it('one per pellet: four pellets from one fire point store the same values as one', () => {
    const one = new ThreatMarks(), four = new ThreatMarks();
    one.release(shot([200, 0, -50]));
    for (let i = 0; i < 4; i++) four.release(shot([200, 0, -50]));
    one.frame(0); four.frame(0);
    expect(four.values()).toEqual(one.values());
  });
});

describe('frame: the per-frame pass (FUN_00216de0 D:L70472-70587)', () => {
  it('the diagonals\' floats: f04 = 0.5(f00 + f08), f0c = 0.5(f10 + f08), f1c = 0.5(f00 + f18), f14 = 0.5(f10 + f18)', () => {
    const t = new ThreatMarks();
    t.release(shot([300, 0, -100]));                 // right + front
    t.frame(0);
    let b = t.values().breadth;
    expect(b[Q.frontRight]).toBeCloseTo(0.5 * (b[Q.right]! + b[Q.front]!), 12);
    t.release(shot([-300, 0, -100])); t.frame(0); b = t.values().breadth;
    expect(b[Q.frontLeft]).toBeCloseTo(0.5 * (b[Q.left]! + b[Q.front]!), 12);
    t.release(shot([300, 0, 100])); t.frame(0); b = t.values().breadth;
    expect(b[Q.backRight]).toBeCloseTo(0.5 * (b[Q.right]! + b[Q.back]!), 12);
    t.release(shot([-300, 0, 100])); t.frame(0); b = t.values().breadth;
    expect(b[Q.backLeft]).toBeCloseTo(0.5 * (b[Q.left]! + b[Q.back]!), 12);
  });

  it('the split at a side component of 450: the cardinal 50, the diagonal 0; at 45: 25 and 25', () => {
    const far = new ThreatMarks();
    far.release(shot([450, 0, 0]));                  // right; front comp 0 (the else branch: front flag)
    far.frame(0);
    expect(far.values().alpha[Q.right]).toBeCloseTo(50, 5);
    expect(far.values().alpha[Q.frontRight]).toBeCloseTo(0, 5);
    const near = new ThreatMarks();
    near.release(shot([45, 0, 0]));
    near.frame(0);
    expect(near.values().alpha[Q.right]).toBeCloseTo(25, 5);
    expect(near.values().alpha[Q.frontRight]).toBeCloseTo(25, 5);
  });

  it('the fade: 120 a second to 0, gone in 50/120 = 0.4167 s; the hit frame shows 50 - 120 dt', () => {
    const t = new ThreatMarks();
    t.release(shot([450, 0, 0]));
    t.frame(1 / 60);
    expect(t.values().alpha[Q.right]).toBeCloseTo(48, 4);
    let s = 1 / 60;
    while (t.values().alpha[Q.right]! > 0) { t.frame(1 / 60); s += 1 / 60; }
    expect(s).toBeGreaterThanOrEqual(50 / 120 - 1e-9);
    expect(s).toBeLessThan(50 / 120 + 1 / 60);
    t.frame(1 / 60);
    expect(t.values().alpha[Q.right]).toBe(0);
  });

  it('the flags clear after the pass: a second pass with no release sets nothing, only decays', () => {
    const t = new ThreatMarks();
    t.release(shot([45, 0, 0]));
    t.frame(0);
    expect(t.flagState()).toEqual({ right: false, front: false, left: false, back: false });
    const before = t.values().alpha;
    t.frame(0.1);
    expect(t.values().alpha.map((a, i) => a - before[i]!).filter((d) => d !== 0).every((d) => Math.abs(d + 12) < 1e-9)).toBe(true);
  });
});

describe('frame: the visible alpha (D:L70485-70568; skeptic 2)', () => {
  it('the smaller-axis cardinal stays dark: a shooter mostly right and a little ahead lights right and front-right, not front', () => {
    const t = new ThreatMarks();
    t.release(shot([300, 0, -100]));
    t.frame(0);
    const a = t.values().alpha, b = t.values().breadth;
    expect(a[Q.right]).toBeGreaterThan(0);
    expect(a[Q.frontRight]).toBeGreaterThan(0);
    expect(a[Q.front]).toBe(0);                      // breadth set, no alpha
    expect(b[Q.front]).toBeGreaterThan(0);
  });

  it('dead ahead at 45: front 25 and front-LEFT 25; the left cardinal dark', () => {
    const t = new ThreatMarks();
    t.release(shot([0, 0, -45]));
    t.frame(0);
    const a = t.values().alpha;
    expect(a[Q.front]).toBeCloseTo(25, 5);
    expect(a[Q.frontLeft]).toBeCloseTo(25, 5);
    expect(a[Q.left]).toBe(0);
    expect(a[Q.frontRight]).toBe(0);
  });

  it('a tie (side component = front component) lights the front/back cardinal (the strict compare)', () => {
    const t = new ThreatMarks();
    t.release(shot([30, 0, -30]));
    t.frame(0);
    const a = t.values().alpha;
    expect(a[Q.front]).toBeCloseTo((60 / 90) * 50, 4);
    expect(a[Q.frontRight]).toBeCloseTo((30 / 90) * 50, 4);
    expect(a[Q.right]).toBe(0);
    const back = new ThreatMarks();
    back.release(shot([-30, 0, 30]));
    back.frame(0);
    expect(back.values().alpha[Q.back]).toBeGreaterThan(0);
    expect(back.values().alpha[Q.left]).toBe(0);
  });

  it('set, not max: a later weaker hit lowers a still-fading mark', () => {
    const t = new ThreatMarks();
    t.release(shot([450, 0, 0]));                    // right 50
    t.frame(0.05);                                   // 44
    expect(t.values().alpha[Q.right]).toBeCloseTo(44, 4);
    t.release(shot([45, 0, 0]));                     // right 25
    t.frame(0);
    expect(t.values().alpha[Q.right]).toBeCloseTo(25, 4);
  });

  it('two opposite releases before one pass run all four blocks in order, the later blocks winning, ghost diagonals and all', () => {
    const t = new ThreatMarks();
    t.release(shot([300, 0, -100]));                 // front-right: f00, f08 (comps 300, 100)
    t.release(shot([-100, 0, 200]));                 // back-left: f10, f18 (comps 100, 200); f00 = f08 = 0
    const m2 = 1 - (100 * 100 + 200 * 200) * THREAT_FALLOFF;
    t.frame(0);
    const { alpha: a, breadth: b } = t.values();
    // Block 1 (right+front): f28 = 0 < f20 = 0? no -> the front cardinal at (90 - 0)/90 x 50, front-right 0; f04 = 0.
    expect(b[Q.frontRight]).toBe(0);
    expect(a[Q.front]).toBeCloseTo(50, 4);
    // Block 2 (left+front): f28 0 < f30 100 -> left (90 - 10)/90 x 50 and front-left 10/90 x 50; f0c = f10 / 2.
    expect(b[Q.frontLeft]).toBeCloseTo(m2 / 2, 9);
    expect(a[Q.frontLeft]).toBeCloseTo((10 / 90) * 50, 4);
    // Block 3 (right+back): f38 200 < f20 0? no -> back (90 - 20)/90 x 50, back-right 20/90 x 50; f1c = f18 / 2.
    expect(b[Q.backRight]).toBeCloseTo(m2 / 2, 9);
    expect(a[Q.backRight]).toBeCloseTo((20 / 90) * 50, 4);
    // Block 4 (left+back): f38 200 < f30 100? no -> back again, back-left 20/90 x 50; f14 = (f10 + f18) / 2.
    expect(b[Q.backLeft]).toBeCloseTo(m2, 9);
    expect(a[Q.back]).toBeCloseTo((70 / 90) * 50, 4);
    expect(a[Q.backLeft]).toBeCloseTo((20 / 90) * 50, 4);
    // Block 2's left alpha stands (no later block sets it); the right cardinal never lit.
    expect(a[Q.left]).toBeCloseTo((80 / 90) * 50, 4);
    expect(a[Q.right]).toBe(0);
  });
});

describe('reset: the constructor\'s zeroing (FUN_00553ea0 D:L419569-419588)', () => {
  it('floats, flags and alphas back to 0', () => {
    const t = new ThreatMarks();
    t.release(shot([45, 0, 0]));
    t.frame(0);
    t.release(shot([45, 0, 0]));
    t.reset();
    expect(t.values()).toEqual({ breadth: new Array(8).fill(0), alpha: new Array(8).fill(0) });
    expect(t.flagState()).toEqual({ right: false, front: false, left: false, back: false });
  });
});
