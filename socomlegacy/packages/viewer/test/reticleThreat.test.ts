import { describe, expect, it } from 'vitest';
import { Mesh, type Scene, type Vector2 } from 'three';
import {
  GRENADE_METER_BITMAP_READING, Reticle, THREAT_DIAGONAL_FACTORS, THREAT_DIAGONAL_TURNS, THREAT_GAP, THREAT_LEAVE_SETS,
  THREAT_QUAD_ORIENTATION_READING, THREAT_SET5_ARM, THREAT_UV, threatArm, threatLayout, type ThreatQuadLayout, type ThreatVertex,
} from '../src/reticle';
import { THREAT_QUADS, type ThreatValues } from '../src/threatMarks';

/**
 * THREAT-MARKS (research 321 section 2.6): the eight `ret_threat` quads as `FUN_00215250` lays them (D:L69842-69899) --
 * the boxes, the slot permutations and the diagonals' turn about a pivot corner (`FUN_00359260`, `FUN_00358cc0`,
 * `FUN_00358e20`, `FUN_003589d0`, D:L254725-255003) -- the orientation drawn from `GRENADE_METER_BITMAP_READING`, and the
 * Reticle's per-quad gates: no relayout under set 4, laid under sets 5-10, the first four hidden at a death while the last
 * four fade on (THREAT_DEAD_FADE_READING). Reading, pending review.
 */

const PS2 = { width: 640, height: 448 };
const WIDE = { width: 1920, height: 1080 };
const Q = Object.fromEntries(THREAT_QUADS.map((q, i) => [q, i])) as Record<(typeof THREAT_QUADS)[number], number>;
const all = (b: number, a: number): ThreatValues => ({ breadth: new Array(8).fill(b), alpha: new Array(8).fill(a) });
const ARM = { w: 32, h: 32 }, BITMAP = { width: 16, height: 16 };

/** The quad's four distinct corners: the slots +0xd0, +0xe0, +0xf0, +0x1c0. */
const corners = (q: ThreatQuadLayout): ThreatVertex[] => [q.vertices[0]!, q.vertices[1]!, q.vertices[2]!, q.vertices[5]!];
const centreOf = (q: ThreatQuadLayout): [number, number] => {
  const c = corners(q);
  return [c.reduce((s, v) => s + v.x, 0) / 4, c.reduce((s, v) => s + v.y, 0) / 4];
};
const extent = (q: ThreatQuadLayout): [number, number] => {
  const xs = corners(q).map((v) => v.x), ys = corners(q).map((v) => v.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};
const close = (a: readonly number[], b: readonly number[], eps = 1e-3): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= eps);

describe('threatLayout: the laid centres (D:L69842-69898)', () => {
  const r = 10, cx = 320, cy = 224, ox = ARM.w + THREAT_GAP, oy = ARM.h + THREAT_GAP;
  /** The laid centre P of each quad, PS2 pixels, as the code writes it. */
  const P: [number, number][] = [
    [cx + r + ox, cy - 1],
    [cx + r + 0.9 * ox, cy - r - 0.6 * oy],
    [cx + 1, cy - r - oy],
    [cx - r - 0.9 * ox, cy - r - 0.6 * oy],
    [cx - r - ox, cy - 1],
    [cx - r - 0.65 * ox, cy + r + 0.52 * oy],
    [cx + 1, cy + r + oy],
    [cx + r + 0.65 * ox, cy + r + 0.5 * oy],
  ];

  it('the constants: 15 past the arm, the factors 0.9/0.6, 0.65/0.5, 0.9/0.6, 0.65/0.52, the turns -45/+45/+45/-45, UVs 0.03-1', () => {
    expect(THREAT_GAP).toBe(15);
    expect(THREAT_DIAGONAL_FACTORS).toEqual({ frontRight: [0.9, 0.6], backRight: [0.65, 0.5], frontLeft: [0.9, 0.6], backLeft: [0.65, 0.52] });
    expect(THREAT_DIAGONAL_TURNS).toEqual({ frontRight: -45, backRight: 45, frontLeft: 45, backLeft: -45 });
    expect(THREAT_UV).toEqual({ u0: 0.03, v0: 0.03, u1: 1, v1: 1 });
  });

  it('on 640x448: the cardinals centred on P (r + Aw + 15 out), the diagonals at P moved by the corner turn at full breadth', () => {
    const l = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(1, 50));
    for (const i of [Q.right, Q.front, Q.left, Q.back]) expect(close(centreOf(l[i]!), P[i]!), THREAT_QUADS[i]).toBe(true);
    const k = 8 - 8 * Math.SQRT2;                         // -3.3137: the corner turn's shift at 16 x 16
    expect(close(centreOf(l[Q.frontRight]!), [P[1]![0] - 8, P[1]![1] + k])).toBe(true);
    expect(close(centreOf(l[Q.backRight]!), [P[7]![0] - k, P[7]![1] + 8])).toBe(true);
    expect(close(centreOf(l[Q.frontLeft]!), [P[3]![0] + 8, P[3]![1] + k])).toBe(true);
    expect(close(centreOf(l[Q.backLeft]!), [P[5]![0] + k, P[5]![1] + 8])).toBe(true);
  });

  it('on 16:9 (1920x1080): the same layout in PS2 pixels scaled by height / 448 about the frame\'s centre', () => {
    const s = WIDE.height / 448, c: [number, number] = [WIDE.width / 2, WIDE.height / 2];
    const ps2 = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(1, 50));
    const wide = threatLayout(WIDE, c, r, ARM, BITMAP, all(1, 50));
    for (let i = 0; i < 8; i++) {
      const [px, py] = centreOf(ps2[i]!), [wx, wy] = centreOf(wide[i]!);
      expect(close([wx, wy], [c[0] + (px - cx) * s, c[1] + (py - cy) * s]), THREAT_QUADS[i]).toBe(true);
    }
  });

  it('the breadth scales the mark\'s breadth: the sides Tw x Th f, the top and bottom Tw f x Th', () => {
    const l = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(0.5, 50));
    expect(close(extent(l[Q.right]!), [16, 8])).toBe(true);
    expect(close(extent(l[Q.left]!), [16, 8])).toBe(true);
    expect(close(extent(l[Q.front]!), [8, 16])).toBe(true);
    expect(close(extent(l[Q.back]!), [8, 16])).toBe(true);
  });

  it('the diagonals turn about a pivot corner: bottom-left for front-right and back-right, bottom-right for front-left and back-left', () => {
    for (const f of [1, 0.5]) {
      const l = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(f, 50));
      const h = 16 * f;
      const pivot: Record<number, [number, number]> = {
        [Q.frontRight]: [P[1]![0] - 8, P[1]![1] + h / 2], [Q.backRight]: [P[7]![0] - 8, P[7]![1] + h / 2],
        [Q.frontLeft]: [P[3]![0] + 8, P[3]![1] + h / 2], [Q.backLeft]: [P[5]![0] + 8, P[5]![1] + h / 2],
      };
      for (const [i, k] of Object.entries(pivot)) {
        const q = l[Number(i)]!;
        expect(corners(q).some((v) => close([v.x, v.y], k)), `${THREAT_QUADS[Number(i)]} at ${f}`).toBe(true);
        // A turn of +-45 keeps the sides: the corners stay 16 and h from the pivot.
        const d = corners(q).map((v) => Math.hypot(v.x - k[0], v.y - k[1])).sort((a, b) => a - b);
        expect(close(d, [0, Math.min(16, h), Math.max(16, h), Math.hypot(16, h)])).toBe(true);
      }
    }
  });

  it('a positive turn is clockwise on the y-down screen: back-right\'s far corner lies below its pivot, front-right\'s above', () => {
    const l = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(1, 50));
    // The front-right quad (-45) leans up and right from its pivot; the back-right (+45) down and right.
    expect(centreOf(l[Q.frontRight]!)[1]).toBeLessThan(P[1]![1] + 8);
    expect(centreOf(l[Q.backRight]!)[0]).toBeGreaterThan(P[7]![0] - 8);
  });

  it('the drawn centre of a diagonal depends on the breadth (f = 1 against f = 0.5)', () => {
    const one = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(1, 50)), half = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(0.5, 50));
    for (const i of [Q.frontRight, Q.backRight, Q.frontLeft, Q.backLeft]) expect(close(centreOf(one[i]!), centreOf(half[i]!), 0.5)).toBe(false);
  });

  it('a diagonal whose alpha is 0 is not laid; the cardinals always are', () => {
    const l = threatLayout(PS2, [cx, cy], r, ARM, BITMAP, all(1, 0));
    expect(l.map((q) => q !== null)).toEqual([true, false, true, false, true, false, true, false]);
  });
});

describe('threatLayout: which way the wedges point (THREAT_QUAD_ORIENTATION_READING, from GRENADE_METER_BITMAP_READING)', () => {
  /** The screen direction in which the decoded rows run toward the wedge's tip (rows 4 wide to 11 tip: increasing t). */
  const tipward = (q: ThreatQuadLayout): [number, number] => {
    const c = corners(q), tMax = Math.max(...c.map((v) => v.t)), tMin = Math.min(...c.map((v) => v.t));
    const mean = (vs: ThreatVertex[]): [number, number] => [vs.reduce((s, v) => s + v.x, 0) / vs.length, vs.reduce((s, v) => s + v.y, 0) / vs.length];
    const hi = mean(c.filter((v) => v.t === tMax)), lo = mean(c.filter((v) => v.t === tMin));
    return [hi[0] - lo[0], hi[1] - lo[1]];
  };
  const outward = (q: ThreatQuadLayout, c: [number, number]): number => {
    const [dx, dy] = tipward(q), [qx, qy] = centreOf(q);
    return (dx * (qx - c[0]) + dy * (qy - c[1])) / (Math.hypot(dx, dy) * Math.hypot(qx - c[0], qy - c[1]));
  };

  it('with GRENADE_METER_BITMAP_READING as on main (v 0 the decoded last rows) every tip points away from the reticle', () => {
    expect(GRENADE_METER_BITMAP_READING).toBe('first row on the centre line');
    expect(THREAT_QUAD_ORIENTATION_READING).toBe('outward, from GRENADE_METER_BITMAP_READING');
    const l = threatLayout(PS2, [320, 224], 10, ARM, BITMAP, all(1, 50));
    for (let i = 0; i < 8; i++) expect(outward(l[i]!, [320, 224]), THREAT_QUADS[i]).toBeGreaterThan(0.6);
  });

  it('with the reading flipped (test only) every tip points inward, all eight together', () => {
    const l = threatLayout(PS2, [320, 224], 10, ARM, BITMAP, all(1, 50), 'last row on the centre line');
    for (let i = 0; i < 8; i++) expect(outward(l[i]!, [320, 224]), THREAT_QUADS[i]).toBeLessThan(-0.6);
  });

  // Review F3: GRENADE_METER_BITMAP_READING's one read mirrors u as well as v ("the same read mirrors u (u 0 at the right
  // edge)", reticle.ts), invisible on the meter's symmetric bitmaps; ret_threat's row 5 is not symmetric (alpha 169 at
  // x 5-9, 255 at x 10-12; hudBitmaps.test.ts), so the column order shows and is pinned here.
  /** Where decoded column `c` (texel centre) lands across the top quad's top edge: screen x (the quad is unpermuted). */
  const columnX = (q: ThreatQuadLayout, c: number): number => {
    const tl = q.vertices[0]!, tr = q.vertices[5]!;               // slots +0xd0 (u0, v0) and +0x1c0 (u1, v0)
    const f = (c + 0.5) / 16;
    return tl.x + ((tr.x - tl.x) * (f - tl.s)) / (tr.s - tl.s);
  };

  it('under the reading the columns mirror too: the top mark shows row 5\'s 255s (x 10-12) left of its 169s (x 5-9)', () => {
    const top = threatLayout(PS2, [320, 224], 10, ARM, BITMAP, all(1, 50))[Q.front]!;
    expect(top.vertices[0]!.s).toBeCloseTo(1 - THREAT_UV.u0, 9);   // u0 at the left edge shows the decoded right columns
    expect(top.vertices[5]!.s).toBeCloseTo(1 - THREAT_UV.u1, 9);
    expect(columnX(top, 11)).toBeLessThan(columnX(top, 7));
  });

  it('with the reading flipped (test only) both mirrors go together: the 255s right of the 169s', () => {
    const top = threatLayout(PS2, [320, 224], 10, ARM, BITMAP, all(1, 50), 'last row on the centre line')[Q.front]!;
    expect(top.vertices[0]!.s).toBeCloseTo(THREAT_UV.u0, 9);
    expect(columnX(top, 11)).toBeGreaterThan(columnX(top, 7));
  });
});

describe('threatArm: ChangeReticule\'s Aw/Ah (D:L69298-69316)', () => {
  it('the set\'s bitmap; Aw halved under set 4; 32 x 32 under set 5; none under -1 or with no bitmap', () => {
    expect(threatArm(1, { width: 32, height: 32 })).toEqual({ w: 32, h: 32 });
    expect(threatArm(0, { width: 16, height: 16 })).toEqual({ w: 16, h: 16 });
    expect(threatArm(4, { width: 64, height: 64 })).toEqual({ w: 32, h: 64 });
    expect(threatArm(5, { width: 256, height: 256 })).toEqual({ w: THREAT_SET5_ARM, h: THREAT_SET5_ARM });
    expect(THREAT_SET5_ARM).toBe(32);
    expect(threatArm(-1, { width: 32, height: 32 })).toBeNull();
    expect(threatArm(6, null)).toBeNull();
    expect([...THREAT_LEAVE_SETS].sort()).toEqual([10, 6, 8]);
  });
});

// ---- The Reticle's eight meshes ---------------------------------------------------------------------------------------

const rgbaOf = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const BITMAPS = {
  fixed: rgbaOf(64, 64), floating: rgbaOf(32, 32), accuracy: null,
  sets: {
    'ret_threat.tif': rgbaOf(16, 16), 'ret_rifle_01.tif': rgbaOf(64, 64), 'ret_rifle_02.tif': rgbaOf(32, 32),
    'ret_sidearm_01.tif': rgbaOf(32, 32), 'ret_sidearm_02.tif': rgbaOf(16, 16),
    'ret_grenade_01.tif': rgbaOf(64, 64), 'ret_grenade_02.tif': rgbaOf(64, 64),
    'ret_scope_01.tif': rgbaOf(256, 256), 'ret_scope_02.tif': rgbaOf(256, 256),
  },
};
const draw = (r: Reticle): Mesh[] => {
  let scene: Scene | null = null;
  r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (s) => { scene = s; } });
  const out: Mesh[] = [];
  (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible && o.userData.threat !== undefined) out.push(o); });
  return out;
};
const rightX = (r: Reticle): number => r.threatState()[Q.right]!.vertices!.reduce((s, v) => s + v.x, 0) / 6;

describe('Reticle: the eight threat meshes', () => {
  it('none shown with no alpha; lit ones shown at alpha / 128 (THREAT_ALPHA_SCALE_READING)', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(true);
    r.setThreatGate(true, false);
    expect(draw(r)).toHaveLength(0);
    r.setThreat(all(1, 50));
    const shown = draw(r);
    expect(shown).toHaveLength(8);
    expect(r.threatState().every((q) => q.visible && Math.abs(q.opacity - 50 / 128) < 1e-9)).toBe(true);
  });

  it('the right quad lies r + Aw + 15 out: the rifle\'s 32 under set 1, the sidearm\'s 16 under set 0', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(true);
    r.setThreatGate(true, false);
    r.setThreat(all(1, 50));
    r.setSize(10);
    r.setSet(1);
    draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 10 + 32 + 15, 6);
    r.setSet(0);
    draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 10 + 16 + 15, 6);
  });

  it('under set 4 laid once at the change with Aw halved (64 / 2), then not relaid: the size\'s change does not move it', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(true);
    r.setThreatGate(true, false);
    r.setThreat(all(1, 50));
    r.setSize(10);
    r.setSet(1); draw(r);
    r.setSet(4); draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 10 + 32 + 15, 6);   // ret_grenade_02 64 x 0.5
    r.setSize(30); draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 10 + 32 + 15, 6);   // frozen
    r.setSet(1); draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 30 + 32 + 15, 6);   // relaid with the new size
  });

  it('laid under sets 5-10 (THREAT_SCOPED_SETS_READING): set 5 at 32 x 32, set 6 at its bitmap\'s', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(true);
    r.setThreatGate(true, false);
    r.setThreat(all(1, 50));
    r.setSize(0);
    r.setSet(5); draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 32 + 15, 6);
    r.setSet(6); draw(r);
    expect(rightX(r)).toBeCloseTo(320 + 256 + 15, 6);       // ret_scope_01's 256
  });

  it('the dead rule per quad: a death with all eight lit hides quads 0-3 and keeps 4-7 fading to 0 over alpha / 120 s', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(true);
    r.setThreatGate(true, false);
    r.setThreat(all(1, 50));
    r.setSet(1);
    expect(draw(r)).toHaveLength(8);
    // The death: the reticle's own gate shuts (`reticleShown`), the marks' gate stays with `dead`.
    r.setVisible(false);
    r.setThreatGate(true, true);
    const meshes = draw(r);
    expect(meshes.map((m) => m.userData.threat as number).sort()).toEqual([4, 5, 6, 7]);
    // Laid with the last set's Aw/Ah: the left quad still r + 32 + 15 out.
    const left = r.threatState()[Q.left]!.vertices!;
    expect(left.reduce((s, v) => s + v.x, 0) / 6).toBeCloseTo(320 - 0 - 32 - 15, 6);
    // Fading on: 50 at 120 a second is gone after 50/120 s (the alphas the pass hands it each frame).
    let alpha = 50, t = 0;
    while (alpha > 0) { alpha = Math.max(0, alpha - 120 / 60); t += 1 / 60; r.setThreat(all(1, alpha)); draw(r); }
    expect(t).toBeCloseTo(50 / 120, 1);
    expect(draw(r)).toHaveLength(0);
    // The spawn: the set shown again, all eight with it.
    r.setVisible(true);
    r.setThreatGate(true, false);
    r.setThreat(all(1, 50));
    expect(draw(r)).toHaveLength(8);
  });

  it('sets 6, 8 and 10 leave the first four as they were (ChangeReticule D:L69339-69591)', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(true);
    r.setThreatGate(true, true);
    r.setThreat(all(1, 50));
    r.setSet(1); draw(r);                                    // dead: first four hidden
    r.setThreatGate(true, false);
    r.setSet(6);
    expect(draw(r).map((m) => m.userData.threat as number).sort()).toEqual([4, 5, 6, 7]);   // left as they were
    r.setSet(5);
    expect(draw(r)).toHaveLength(8);                          // shown
  });

  it('the page\'s own gates (the tactical map, the scoreboard, a round screen) hide all eight', () => {
    const r = new Reticle();
    r.setBitmaps(BITMAPS);
    r.setVisible(false);
    r.setThreatGate(false, false);
    r.setThreat(all(1, 50));
    expect(draw(r)).toHaveLength(0);
  });
});
