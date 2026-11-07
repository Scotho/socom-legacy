import type { UiFramePlan, UiPlanTriangle } from '../src/uiFramePlan';
import { wrap } from '../src/uiRasterRules';

/**
 * GM-15c (plan `docs/plans/2026-11-01-gpu-menus.md`, the GM-15 row's 15c and the Log 2026-11-05T02:00Z, R1 with GM-15b
 * review F1's correction; research 380 M3, §5): **the seam double-add count**, a test instrument (it changes nothing the
 * port draws). The software's depth (`drawModels`, `uiCompositorView.ts`, the depth buffer a `Float32Array`; the plan's
 * f64 executor the same, `drawTriangle` in `uiFramePlanCpu.ts`) tests a pixel's f64 `invW` against the f32 it stored:
 * `depth[i] > 0 && invW <= depth[i]` fails, so the triangle draws, where `invW` is above the stored f32 although its
 * own f32 equals it. A GPU (and the twin, T4/T5) compares f32 with f32 under GREATER, so the second draw fails there:
 * the software adds the texel twice where the GPU adds it once (GM-15b's pinned finding at `invW` 0.7, and GM-08's
 * coplanar faces). Since `Math.fround` is monotone and the store is an f32, the other direction cannot occur: an f64
 * `invW` at or under the store never has an f32 above it.
 *
 * This walks the plan's passes in order with the executor's decisions -- the same barycentrics at the integer point,
 * every edge inclusive (M2), the strict f64 test against the f32 store (M3), the perspective-correct weights (M4), the
 * texel's alpha by `sample`'s bilinear REPEAT at `(u W, (1 - v) H)` (M5) and no write at `al <= 0` (M6) -- and counts
 * every pixel a triangle **writes** where its f32 `invW` equals the stored depth while its f64 one is above it. Each
 * such write is classed by the triangle that stored the depth: `seam` when the two share exactly two vertices (an edge,
 * GM-15b's case), `coplanar` when they share all three (the same face drawn again: the roller's `_on`/`_off` labels,
 * GM-08's finding), `other` otherwise. A vertex is shared when its target-grid x, y and its `invW` are equal.
 *
 * Its decisions are held to the executor's frame by `uiGpuSeamCount.test.ts` (the seam lists: 0 at dyadic depths, every
 * seam pixel at 0.7). The colour is not computed: only whether, and over what, a triangle writes.
 */

export interface UiSeamDoubleAdds {
  /** Writes over a stored depth equal in f32 and below in f64, by the stored triangle's relation to the writer. */
  seam: number;
  coplanar: number;
  other: number;
  /** Every model write the instrument made (a pixel drawn by a triangle), and the passes and triangles walked. */
  writes: number;
  passes: number;
  triangles: number;
}

/** The texel's alpha (0..255) of `sample` (`uiCompositorView.ts`), bilinear and repeating at texel coordinates (u, v). */
function sampleAlpha(t: { width: number; height: number; data: Uint8ClampedArray }, u: number, v: number): number {
  const x = u - 0.5, y = v - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = wrap(x0, t.width), xb = wrap(x0 + 1, t.width), ya = wrap(y0, t.height), yb = wrap(y0 + 1, t.height);
  const d = t.data;
  const a = d[(ya * t.width + xa) * 4 + 3]!, b = d[(ya * t.width + xb) * 4 + 3]!;
  const e = d[(yb * t.width + xa) * 4 + 3]!, g = d[(yb * t.width + xb) * 4 + 3]!;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + g * fx) * fy;
}

const sameVertex = (p: UiPlanTriangle['a'], q: UiPlanTriangle['a']): boolean => p.x === q.x && p.y === q.y && p.invW === q.invW;
function shared(s: UiPlanTriangle, t: UiPlanTriangle): number {
  let n = 0;
  for (const p of [s.a, s.b, s.c]) if (sameVertex(p, t.a) || sameVertex(p, t.b) || sameVertex(p, t.c)) n++;
  return n;
}

/** The seam double-add count of one plan (a `gpu` or a `software` verdict alike: the triangles are planned either way). */
export function seamDoubleAdds(plan: UiFramePlan): UiSeamDoubleAdds {
  const out: UiSeamDoubleAdds = { seam: 0, coplanar: 0, other: 0, writes: 0, passes: 0, triangles: 0 };
  const { width: W, height: H } = plan.target;
  let depth: Float32Array | null = null, writer: Int32Array | null = null;
  for (const step of plan.steps) {
    if (step.kind === 'pass') {
      out.passes++;
      if (depth) { depth.fill(0); writer!.fill(-1); } else { depth = new Float32Array(W * H); writer = new Int32Array(W * H).fill(-1); }
      continue;
    }
    if (step.kind !== 'triangles') continue;
    for (const ti of step.triangles) {
      out.triangles++;
      const t = plan.triangles[ti]!, { a, b, c, box } = t;
      const tex = t.texture === null ? null : plan.textures[t.texture]!.image;
      const inv = 1 / t.area;
      for (let y = box.ys; y < box.ye; y++) {
        for (let x = box.xs; x < box.xe; x++) {
          let w0 = ((b.x - x) * (c.y - y) - (c.x - x) * (b.y - y)) * inv;
          let w1 = ((c.x - x) * (a.y - y) - (a.x - x) * (c.y - y)) * inv;
          let w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;                     // M2
          const invW = w0 * a.invW + w1 * b.invW + w2 * c.invW;
          const i = y * W + x, stored = depth![i]!;
          if (stored > 0 && invW <= stored) continue;                   // M3, f64 against the f32 store
          w0 *= a.invW / invW; w1 *= b.invW / invW; w2 *= c.invW / invW; // M4
          const r3 = w0 * a.rgba[3] + w1 * b.rgba[3] + w2 * c.rgba[3];
          let al: number;
          if (tex) {
            const u = w0 * a.u + w1 * b.u + w2 * c.u, v = w0 * a.v + w1 * b.v + w2 * c.v;
            al = (sampleAlpha(tex, u * tex.width, (1 - v) * tex.height) / 255) * (r3 / 128);   // M5
          } else al = r3 / 128;
          if (al <= 0) continue;                                        // M6
          out.writes++;
          if (stored > 0 && Math.fround(invW) === stored) {
            const k = shared(plan.triangles[writer![i]!]!, t);
            if (k === 3) out.coplanar++; else if (k === 2) out.seam++; else out.other++;
          }
          depth![i] = invW;
          writer![i] = ti;
        }
      }
    }
  }
  return out;
}
