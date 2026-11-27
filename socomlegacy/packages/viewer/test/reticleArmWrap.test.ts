// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ClampToEdgeWrapping, Mesh, RepeatWrapping, Vector2, Vector3, type DataTexture, type MeshBasicMaterial, type Scene } from 'three';
import type { Rgba } from '@s2u/gs';
import { ARM_WRAP_S_READING, Reticle } from '../src/reticle';

/**
 * N-10 (Craig's playtest screenshot, 2026-11-24): four thin dark lines at the reticle box's corners, pinwheel-wise, one
 * about 30 PS2 pixels beside each arm.
 *
 * - The arm bitmap (`ret_rifle_02`, 32x32) holds the arm at texel columns 29-31, its dark outline in column 31.
 * - The page sampled it LINEAR with WMS = REPEAT (the record's CLAMP_1 0), so the quad's S = 0 edge blended column 31 in.
 * - A rendered run of the page (N10-CORNERS-PC2, WebGPU, HD pack off) measured the four lines exactly there.
 * - The original, in the same strips on the same light wall (N10-REF-PC2: PCSX2 1x and 3x, Vulkan and Software), draws none.
 *
 * So the arms do not wrap in S as drawn (ARM_WRAP_S_READING); T keeps the record's REPEAT, which the negated T needs
 * (T runs 0..-1, D:L255143-255144 via `FUN_00361000` D:L259763-259774).
 *
 * This test renders the reticle at rest, takes each visible arm, and samples its bitmap bilinearly at every frame pixel's
 * centre inside the quad, with the texture's own wrap modes. No pixel more than 4 texels from the arm's columns may pick
 * up ink.
 */

/** `ret_rifle_02`'s shape: an arm in columns 29-31, rows 8-30, its outline (column 31) dark and part-opaque. */
function armBitmap(): Rgba {
  const w = 32, h = 32, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 8; y <= 30; y++) for (const x of [29, 30, 31]) {
    const i = (y * w + x) * 4;
    const outline = x !== 30;
    data[i] = data[i + 1] = data[i + 2] = outline ? 40 : 255;
    data[i + 3] = outline ? 131 : 255;
  }
  return { width: w, height: h, data };
}
const ring = (): Rgba => ({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) });

/** Bilinear alpha at texel coordinate (u, v) (texel units, centres at +0.5), honouring three's wrap modes. */
function alphaAt(rgba: Rgba, map: DataTexture, u: number, v: number): number {
  const w = rgba.width, h = rgba.height;
  const wrap = (i: number, n: number, mode: number): number => (mode === RepeatWrapping ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
  const x = u - 0.5, y = v - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = (xi: number, yi: number): number => rgba.data[(wrap(yi, h, map.wrapT) * w + wrap(xi, w, map.wrapS)) * 4 + 3]! / 255;
  return (a(x0, y0) * (1 - fx) + a(x0 + 1, y0) * fx) * (1 - fy) + (a(x0, y0 + 1) * (1 - fx) + a(x0 + 1, y0 + 1) * fx) * fy;
}

/** The arms as drawn at a frame `w` x `h`, and the ink each one's pixels pick up far from the arm's columns. */
function strayInk(w: number, h: number): { arms: number; worst: number } {
  const r = new Reticle();
  const bitmap = armBitmap();
  r.setBitmaps({
    fixed: ring(), floating: bitmap, accuracy: null, sets: {},
    samplers: { 'ret_rifle_01.tif': { linear: true, wrapS: 'repeat', wrapT: 'repeat' }, 'ret_rifle_02.tif': { linear: true, wrapS: 'repeat', wrapT: 'repeat' } },
  });
  r.setVisible(true);
  let scene: Scene | null = null;
  r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(w, h), render: (sc) => { scene = sc; } });
  const arms: Mesh[] = [];
  (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible && o.renderOrder === 1) arms.push(o); });
  let worst = 0;
  for (const arm of arms) {
    arm.updateMatrixWorld(true);
    const map = (arm.material as MeshBasicMaterial).map as DataTexture;
    const corners = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([x, y]) => new Vector3(x, y, 0).applyMatrix4(arm.matrixWorld));
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    for (let py = Math.floor(Math.min(...ys)); py < Math.ceil(Math.max(...ys)); py++) {
      for (let px = Math.floor(Math.min(...xs)); px < Math.ceil(Math.max(...xs)); px++) {
        const local = arm.worldToLocal(new Vector3(px + 0.5, py + 0.5, 0));
        if (Math.abs(local.x) > 0.5 || Math.abs(local.y) > 0.5) continue;   // outside the quad: not drawn
        const uv = arm.geometry.getAttribute('uv');
        // The plane's UVs at its corners (PlaneGeometry: (-0.5, 0.5), (0.5, 0.5), (-0.5, -0.5), (0.5, -0.5)).
        const u0 = uv.getX(0), u1 = uv.getX(1), vTop = uv.getY(0), vBottom = uv.getY(2);
        const s = u0 + (local.x + 0.5) * (u1 - u0), t = vBottom + (local.y + 0.5) * (vTop - vBottom);
        const texelU = s * bitmap.width;
        if (texelU > 25) continue;                                          // the arm's own columns and their blur
        worst = Math.max(worst, alphaAt(bitmap, map, texelU, t * bitmap.height));
      }
    }
  }
  return { arms: arms.length, worst };
}

describe('N-10: the arms do not wrap in S (ARM_WRAP_S_READING)', () => {
  it('the constant names the reading', () => {
    expect(ARM_WRAP_S_READING).toBe('clamp');
  });

  for (const [w, h] of [[640, 448], [1920, 1080], [3440, 1440]] as const) {
    it(`at ${w}x${h}: no arm pixel far from the arm picks up the outline column through the wrap`, () => {
      const { arms, worst } = strayInk(w, h);
      expect(arms).toBe(4);
      expect(worst).toBeLessThan(0.005);
    });
  }

  it('the arms keep T\'s REPEAT (the negated T) and the record\'s filter; only S is clamped', () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: ring(), floating: armBitmap(), accuracy: null, sets: {},
      samplers: { 'ret_rifle_02.tif': { linear: true, wrapS: 'repeat', wrapT: 'repeat' } },
    });
    r.setVisible(true);
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (sc) => { scene = sc; } });
    let arm: Mesh | null = null;
    (scene as Scene | null)?.traverse((o) => { if (!arm && o instanceof Mesh && o.visible && o.renderOrder === 1) arm = o; });
    const map = ((arm as Mesh | null)!.material as MeshBasicMaterial).map!;
    expect([map.wrapS, map.wrapT]).toEqual([ClampToEdgeWrapping, RepeatWrapping]);
  });

  it('a weapon switch (setSet) keeps it: the cross sets 0, 1 and 9 clamp S and repeat T; 2 and 3 keep the record; the ring stays', () => {
    const lin = { linear: true, wrapS: 'repeat', wrapT: 'repeat' } as const;
    const names = ['ret_sidearm_01.tif', 'ret_sidearm_02.tif', 'ret_rifle_01.tif', 'ret_rifle_02.tif', 'ret_shotgun_01.tif',
      'ret_shotgun_02.tif', 'ret_rocket_01.tif', 'ret_rocket_02.tif', 'ret_laser_designator.tif'];
    const r = new Reticle();
    r.setBitmaps({
      fixed: ring(), floating: armBitmap(), accuracy: null,
      sets: Object.fromEntries(names.map((n) => [n, n.endsWith('_01.tif') ? ring() : armBitmap()])),
      samplers: Object.fromEntries(names.map((n) => [n, lin])),
    });
    r.setVisible(true);
    const wraps = (type: number): { arm: [number, number]; ring: [number, number] } => {
      expect(r.setSet(type)).toBe(true);
      let scene: Scene | null = null;
      r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (sc) => { scene = sc; } });
      const by = (order: number): DataTexture => {
        let m: Mesh | null = null;
        (scene as Scene | null)?.traverse((o) => { if (!m && o instanceof Mesh && o.renderOrder === order) m = o; });
        return ((m as Mesh | null)!.material as MeshBasicMaterial).map as DataTexture;
      };
      return { arm: [by(1).wrapS, by(1).wrapT], ring: [by(0).wrapS, by(0).wrapT] };
    };
    const clampRepeat: [number, number] = [ClampToEdgeWrapping, RepeatWrapping], repeat: [number, number] = [RepeatWrapping, RepeatWrapping];
    for (const type of [0, 1, 9, 1, 0]) expect(wraps(type)).toEqual({ arm: clampRepeat, ring: repeat });
    for (const type of [2, 3]) expect(wraps(type).arm).toEqual(repeat);
    expect(wraps(1)).toEqual({ arm: clampRepeat, ring: repeat });   // back to the rifle after the corners: clamped again
  });
});
