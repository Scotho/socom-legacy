import type { UiFramePlan, UiPlanTriangle } from '../src/uiFramePlan';
import { T2_edge, T3_inside, T4_invW, T5_depth, T5_depthPasses, T2_third, T2_weight } from '../src/uiGpuTwin';
import { modelDepthF32, modelEdgeF32, modelEdgeOwns, wrap } from '../src/uiRasterRules';

/**
 * R1's instrument (plan `docs/plans/2026-11-01-gpu-menus.md`: the GM-15 row's 15c, the Log 2026-11-05T02:00Z R1 with
 * GM-15b review F1's correction, and GM-15d's ruling; research 380 M2, M3, §5), a test instrument: it changes nothing the
 * port draws.
 *
 * **What it counts (GM-15d): the ties on which the software and the twin decide differently.** A tie is a pixel a
 * triangle's edge function is exactly 0 at (the fill rule decides it: M2, `UI_MODEL_EDGE_RULE_READING`, the GS's
 * top-left rule) or a write whose depth equals the stored one (the depth test decides it: M3,
 * `UI_MODEL_DEPTH_FORMAT_READING`, GEQUAL against the f32 store). It walks the plan's passes in order twice over, side by
 * side, each with its own depth buffer:
 * - **the software** (the executor's decisions, `drawTriangle` in `uiFramePlanCpu.ts`, `drawModels` in
 *   `uiCompositorView.ts`): `modelEdgeF32` and `modelEdgeOwns`, `modelDepthF32` tested `>=` the f32 store -- since
 *   GM-15d's disc fold the GPU's f32 arithmetic (before it, f64 edges and invW with only the store rounded: the disc
 *   run at 4d62d9c02 counted seam 1,479 / coplanar 53 / other 410 depth ties decided differently on the ARMORY);
 * - **the twin** (`drawTriangleTwin`, `uiGpuTwin.ts`, so the GPU's programs): `T2_edge` and `T3_inside` in f32, T4's
 *   f32 `invW` times the pass's `depthScale`, `T5_depthPasses`.
 * Both take the software's alpha decision (M5's texel alpha by `sample`'s bilinear REPEAT at `(u W, (1 - v) H)`, M6's no
 * write at `al <= 0`): the instrument judges coverage and depth, the two rules a tie meets, not the f32 texel.
 * Each pixel where a tie is met on either side and the two decide differently (one writes, the other does not) is
 * counted, classed by the triangle that last wrote the pixel (on the software's side, else the twin's): `seam` when the
 * two share exactly two vertices (an edge), `coplanar` when they share all three (the same face drawn again: the
 * roller's `_on`/`_off` labels), `other` otherwise (or no writer yet). A vertex is shared when its target-grid x, y and
 * its `invW` are equal.
 *
 * **Before GM-15d** this file counted the software's double adds (its f64 `invW` passing an f32 store its own f32
 * equalled, under inclusive edges and a strict `>`): seam 3,622 / coplanar 88,465 / other 814 on GM-04's corpus. That was
 * the port's artefact (the R1 report, 2026-11-09), not the original's rule; under the GS's rules the software and the
 * twin agree on every tie the cases reach, which `uiGpuSeamCount.test.ts` holds, and GM-17's R1 precondition is now
 * "software and twin agree on every tie" (0 here over the corpus).
 *
 * What it does not see: a tie a 16-bit Z would make and f32 does not (`UI_MODEL_DEPTH_QUANTISE_READING`); a
 * disagreement that is not at a tie (the f32 B class: a weight or a texel an ulp apart).
 *
 * **What its 0 means (GM-15d review F1).** Since GM-15d's disc fold the software side is a transcription of the
 * executor's decisions in the same f32 helpers (`modelEdgeF32`, `modelEdgeOwns`, `modelDepthF32`) the twin's T2-T5
 * mirror; it never runs `drawModels` or the executor. Its 0 is therefore a consistency check of the two transcriptions
 * (the helpers against the twin's step functions), not an independent measure of what the drawers wrote. The
 * independent evidence for GM-17's R1 precondition is the byte compares of the real paths: `uiFramePlan.disc` (the
 * executor against `rasterizeUiDrawList`, 0 bytes) and `uiGpuTwin.disc` (the twin against the software, B within its
 * record) over the whole corpus, and the fake-GL sample against the twin in the corpus test. An instrument fed by the
 * real paths' writes (per-pixel write counts or a depth readback from `drawModels`) would need those paths to expose
 * them; not done here.
 */

export interface UiSeamDoubleAdds {
  /** Pixels where a tie is met and the software and the twin decide differently, by the last writer's relation. */
  seam: number;
  coplanar: number;
  other: number;
  /** Pixel evaluations where an edge function is exactly 0 on either side, and writes at an equal stored depth on either. */
  edgeTies: number;
  depthTies: number;
  /** Every model write the software side made (a pixel drawn by a triangle), and the passes and triangles walked. */
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

const f = Math.fround;

/** R1's count of one plan (a `gpu` or a `software` verdict alike: the triangles are planned either way). */
export function seamDoubleAdds(plan: UiFramePlan): UiSeamDoubleAdds {
  const out: UiSeamDoubleAdds = { seam: 0, coplanar: 0, other: 0, edgeTies: 0, depthTies: 0, writes: 0, passes: 0, triangles: 0 };
  const { width: W, height: H } = plan.target;
  let sw: Float32Array | null = null, tw: Float32Array | null = null, writer: Int32Array | null = null, twinWriter: Int32Array | null = null;
  let depthScale = 1;
  for (const step of plan.steps) {
    if (step.kind === 'pass') {
      out.passes++;
      depthScale = plan.passes[step.pass]!.depthScale;
      if (sw) { sw.fill(0); tw!.fill(0); writer!.fill(-1); twinWriter!.fill(-1); } else {
        sw = new Float32Array(W * H); tw = new Float32Array(W * H); writer = new Int32Array(W * H).fill(-1); twinWriter = new Int32Array(W * H).fill(-1);
      }
      continue;
    }
    if (step.kind !== 'triangles') continue;
    for (const ti of step.triangles) {
      out.triangles++;
      const t = plan.triangles[ti]!, { a, b, c, box } = t;
      const tex = t.texture === null ? null : plan.textures[t.texture]!.image;
      const inv = 1 / t.area;
      // The twin's numbers, as the GPU receives them (drawTriangleTwin).
      const ax = f(a.x), ay = f(a.y), bx = f(b.x), by = f(b.y), cx = f(c.x), cy = f(c.y);
      const aw = f(a.invW), bw = f(b.invW), cw = f(c.invW), finv = f(inv), fs = finv < 0 ? -1 : 1;
      for (let y = box.ys; y < box.ye; y++) {
        for (let x = box.xs; x < box.xe; x++) {
          const i = y * W + x;
          // The software (drawModels, drawTriangle): M2 by the top-left rule and M3 GEQUAL, both in its f32 helpers.
          const e0 = modelEdgeF32(bx, by, cx, cy, x, y), e1 = modelEdgeF32(cx, cy, ax, ay, x, y), e2 = modelEdgeF32(ax, ay, bx, by, x, y);
          const swIn = modelEdgeOwns(e0, f(by - cy), f(cx - bx), fs) && modelEdgeOwns(e1, f(cy - ay), f(ax - cx), fs) && modelEdgeOwns(e2, f(ay - by), f(bx - ax), fs);
          // The twin: T2 and T3 in f32.
          const g0 = T2_edge(bx, by, cx, cy, x, y), g1 = T2_edge(cx, cy, ax, ay, x, y), g2 = T2_edge(ax, ay, bx, by, x, y);
          const twIn = T3_inside(g0, g1, g2, ax, ay, bx, by, cx, cy, fs);
          const edgeTie = e0 === 0 || e1 === 0 || e2 === 0 || g0 === 0 || g1 === 0 || g2 === 0;
          if (edgeTie) out.edgeTies++;
          if (!swIn && !twIn) continue;
          // The alpha decision (M4-M6), the software's (f64 attributes) for both sides.
          let w0 = ((b.x - x) * (c.y - y) - (c.x - x) * (b.y - y)) * inv, w1 = ((c.x - x) * (a.y - y) - (a.x - x) * (c.y - y)) * inv, w2 = 1 - w0 - w1;
          const invW = w0 * a.invW + w1 * b.invW + w2 * c.invW;
          w0 *= a.invW / invW; w1 *= b.invW / invW; w2 *= c.invW / invW;
          const r3 = w0 * a.rgba[3] + w1 * b.rgba[3] + w2 * c.rgba[3];
          let al: number;
          if (tex) {
            const u = w0 * a.u + w1 * b.u + w2 * c.u, v = w0 * a.v + w1 * b.v + w2 * c.v;
            al = (sampleAlpha(tex, u * tex.width, (1 - v) * tex.height) / 255) * (r3 / 128);
          } else al = r3 / 128;
          if (al <= 0) continue;
          // The depths.
          const z = modelDepthF32(e0, e1, finv, aw, bw, cw), swStored = sw![i]!;
          const swWrites = swIn && z >= swStored;
          const tw0 = T2_weight(bx, by, cx, cy, x, y, finv), tw1 = T2_weight(cx, cy, ax, ay, x, y, finv);
          const tz = T5_depth(T4_invW(tw0, tw1, T2_third(tw0, tw1), aw, bw, cw), depthScale), twStored = tw![i]!;
          const twWrites = twIn && T5_depthPasses(tz, twStored);
          const depthTie = (swIn && swStored > 0 && z === swStored) || (twIn && twStored > 0 && tz === twStored);
          if (depthTie) out.depthTies++;
          if ((edgeTie || depthTie) && swWrites !== twWrites) {
            const last = writer![i]! >= 0 ? writer![i]! : twinWriter![i]!;
            const k = last >= 0 ? shared(plan.triangles[last]!, t) : 0;
            if (k === 3) out.coplanar++; else if (k === 2) out.seam++; else out.other++;
          }
          if (swWrites) { out.writes++; sw![i] = z; writer![i] = ti; }
          if (twWrites) { tw![i] = tz; twinWriter![i] = ti; }
        }
      }
    }
  }
  return out;
}
