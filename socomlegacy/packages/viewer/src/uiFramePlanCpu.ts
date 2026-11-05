import type { Rgba } from '@s2u/gs';
import { rasterizeUiDrawList } from './uiCompositorView';
import { decodeChannel, type UiFramePlan, type UiPlanQuad, type UiPlanRect, type UiPlanTriangle } from './uiFramePlan';
import { wrap } from './uiRasterRules';

/**
 * GM-06a (the GPU menus plan; research 380 §2.1, GM.R5's first proof): the f64 CPU executor of a `UiFramePlan`. It runs
 * the plan's steps the way a GPU drawer will -- clears, a destination copy before each programmable batch, runs of
 * quads whose texels come from the plan's axis tables (GM.R3) and whose colours come from its encoded numbers, codes and
 * `zeroMask` (P23), each programmable quad reading the destination from its batch's copy (layered, GM.R7) -- in
 * Float64, the software's operand order (`fillQuad` in `uiCompositorView.ts`: `d[l]·ix + d[r]·fx`, then
 * `top·iy + lower·fy`; modulate `min(255, (t·c)/128)` and `(ta/255)·(ca/128)`; blend `C + (r − C)·a` or `C + r·a`; the
 * frame alpha `A + (255 − A)·min(1, a)`; stored by `Uint8ClampedArray`, `GS_BLEND_ROUNDING_READING`). Its frame must be
 * `rasterizeUiDrawList`'s byte for byte (`test/uiFramePlan.test.ts`): a planner defect shows here, never as an f32
 * effect. Both paths, `ff` and `prog`, execute the same f64 arithmetic: the path decides only how a GPU blends.
 *
 * GM-06b: a `movie` step copies the picture's RGB at the origin, nearest `p / s`, the alpha untouched (P17); a `pass`
 * step starts a fresh Float32 depth buffer (0 = empty, `UI_MODEL_DEPTH_FORMAT_READING`); a `triangles` step draws each
 * triangle over its integer box as `drawModels` does (M2-M7): barycentrics at the integer point, every edge inclusive,
 * strictly greater f64 `invW` against the f32 depth, perspective-correct weights, `sample`'s lerp form at
 * `(u W, (1 - v) H)` with REPEAT, no write at `al <= 0`, the frame alpha untouched.
 *
 * A plan whose verdict is `software` is L1: the reference draws it from the plan's inputs, at the plan's own scale (the
 * presenter decides whether L1 at HD is drawn at 1x, GM.R9).
 */

export interface UiFramePlanCpuOptions {
  /** Programmable quads read the live frame instead of their batch's copy: equal bytes prove the batches (GM.R7). */
  sequential?: boolean;
}

export function executeFramePlanOnCpu(plan: UiFramePlan, opts: UiFramePlanCpuOptions = {}): { frame: Rgba; undrawn: string[] } {
  if (plan.verdict === 'software') {
    const { items, textures, options } = plan.source;
    return rasterizeUiDrawList(items, textures, options);
  }
  const { width: W, height: H, transparent } = plan.target;
  const data = new Uint8ClampedArray(W * H * 4);
  const words = new Uint32Array(data.buffer);
  const word = (bytes: readonly number[]): number => new Uint32Array(new Uint8ClampedArray(bytes).buffer)[0]!;
  if (!transparent) words.fill(word([0, 0, 0, 255]));
  const copies = new Map<number, { rect: UiPlanRect; bytes: Uint8ClampedArray }>();
  let depth: Float32Array | null = null;
  for (const step of plan.steps) {
    if (step.kind === 'clear') { words.fill(word(step.bytes)); continue; }
    if (step.kind === 'movie') { drawMovie(plan, step.movie, step.rect, data, W); continue; }
    if (step.kind === 'pass') { if (depth) depth.fill(0); else depth = new Float32Array(W * H); continue; }
    if (step.kind === 'triangles') {
      for (const i of step.triangles) drawTriangle(plan, plan.triangles[i]!, data, W, depth!);
      continue;
    }
    if (step.kind === 'copy') {
      if (opts.sequential) continue;
      const r = step.rect, rw = r.xe - r.xs, bytes = new Uint8ClampedArray(rw * (r.ye - r.ys) * 4);
      for (let y = r.ys; y < r.ye; y++) bytes.set(data.subarray((y * W + r.xs) * 4, (y * W + r.xe) * 4), (y - r.ys) * rw * 4);
      copies.set(step.batch, { rect: r, bytes });
      continue;
    }
    for (const i of step.quads) {
      const q = plan.quads[i]!;
      const copy = q.path === 'prog' && !opts.sequential ? copies.get(q.batch!)! : null;
      drawQuad(plan, q, data, W, copy);
    }
  }
  // P22: the transparent frame divided back to straight RGB, as the software hands it to `putImageData`.
  if (transparent) for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a > 0 && a < 1) { data[i] = data[i]! / a; data[i + 1] = data[i + 1]! / a; data[i + 2] = data[i + 2]! / a; }
  }
  return { frame: { width: W, height: H, data }, undrawn: plan.undrawn.slice() };
}

/** One quad over its rectangle; the destination read from `copy` (its batch's) when given, else from the frame. */
function drawQuad(plan: UiFramePlan, q: UiPlanQuad, frame: Uint8ClampedArray, W: number, copy: { rect: UiPlanRect; bytes: Uint8ClampedArray } | null): void {
  const { xs, ys, xe, ye } = q.rect;
  const red = decodeChannel(q.colour[0], q.codes[0]), green = decodeChannel(q.colour[1], q.codes[1]);
  const blue = decodeChannel(q.colour[2], q.codes[2]), alpha = decodeChannel(q.colour[3], q.codes[3]) / 128;
  const additive = q.blend === 'additive';
  const zero = q.zeroMask;
  const src = copy ? copy.bytes : frame;
  const cw = copy ? copy.rect.xe - copy.rect.xs : 0;
  const at = (x: number, y: number): number => (copy ? ((y - copy.rect.ys) * cw + (x - copy.rect.xs)) * 4 : (y * W + x) * 4);
  const tex = q.texture === null ? null : plan.textures[q.texture]!;
  const axis = plan.axis;
  for (let y = ys; y < ye; y++) {
    let top = 0, bottom = 0, fy = 0, iy = 0;
    if (tex) { const o = q.axis!.row + (y - ys) * 4; top = axis[o]! * tex.width; bottom = axis[o + 1]! * tex.width; fy = axis[o + 2]!; iy = axis[o + 3]!; }
    for (let x = xs; x < xe; x++) {
      const i = (y * W + x) * 4, j = at(x, y);
      let r: number, g: number, b: number, a: number;
      if (tex) {
        const o = q.axis!.column + (x - xs) * 4, l = axis[o]!, rt = axis[o + 1]!, fx = axis[o + 2]!, ix = axis[o + 3]!;
        const d = tex.image.data;
        const tl = (top + l) * 4, tr = (top + rt) * 4, bl = (bottom + l) * 4, br = (bottom + rt) * 4;
        // The software's horizontal pass per source row, then the vertical (`fillQuad`'s `horizontal`, its pixel loop).
        r = (d[tl]! * ix + d[tr]! * fx) * iy + (d[bl]! * ix + d[br]! * fx) * fy;
        g = (d[tl + 1]! * ix + d[tr + 1]! * fx) * iy + (d[bl + 1]! * ix + d[br + 1]! * fx) * fy;
        b = (d[tl + 2]! * ix + d[tr + 2]! * fx) * iy + (d[bl + 2]! * ix + d[br + 2]! * fx) * fy;
        a = (d[tl + 3]! * ix + d[tr + 3]! * fx) * iy + (d[bl + 3]! * ix + d[br + 3]! * fx) * fy;
        r = Math.min(255, (r * red) / 128); g = Math.min(255, (g * green) / 128); b = Math.min(255, (b * blue) / 128);
        a = (a / 255) * alpha;
      } else { r = red; g = green; b = blue; a = alpha; }
      if (zero & 0b1000) { frame[i] = 0; frame[i + 1] = 0; frame[i + 2] = 0; frame[i + 3] = 0; continue; }
      const A = src[j + 3]!;
      frame[i + 3] = A + (255 - A) * Math.min(1, a);
      const C0 = src[j]!, C1 = src[j + 1]!, C2 = src[j + 2]!;
      if (additive) {                                           // 0x48: Cd + Cs x As
        frame[i] = zero & 1 ? 0 : C0 + r * a;
        frame[i + 1] = zero & 2 ? 0 : C1 + g * a;
        frame[i + 2] = zero & 4 ? 0 : C2 + b * a;
      } else {                                                  // 0x44: Cd + (Cs - Cd) x As
        frame[i] = zero & 1 ? 0 : C0 + (r - C0) * a;
        frame[i + 1] = zero & 2 ? 0 : C1 + (g - C1) * a;
        frame[i + 2] = zero & 4 ? 0 : C2 + (b - C2) * a;
      }
    }
  }
}

/** P17: the picture's RGB at the origin over `rect`, each pixel the picture's at `p / s` (nearest); alpha untouched. */
function drawMovie(plan: UiFramePlan, index: number, rect: UiPlanRect, frame: Uint8ClampedArray, W: number): void {
  const s = plan.target.scale, pic = plan.movies[index]!.image, pw = pic.width, d = pic.data;
  for (let y = rect.ys; y < rect.ye; y++) {
    const sy = s === 1 ? y : Math.floor(y / s);
    for (let x = rect.xs; x < rect.xe; x++) {
      const sx = s === 1 ? x : Math.floor(x / s);
      const p = (sy * pw + sx) * 4, o = (y * W + x) * 4;
      frame[o] = d[p]!; frame[o + 1] = d[p + 1]!; frame[o + 2] = d[p + 2]!;
    }
  }
}

/** `sample` (`uiCompositorView.ts`, M5): bilinear at `u - .5`, REPEAT, `(a(1 - fx) + b fx)(1 - fy) + (e(1 - fx) + g fx) fy`. */
function sample(t: Rgba, u: number, v: number, out: number[]): void {
  const x = u - 0.5, y = v - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = wrap(x0, t.width), xb = wrap(x0 + 1, t.width), ya = wrap(y0, t.height), yb = wrap(y0 + 1, t.height);
  const d = t.data;
  for (let c = 0; c < 4; c++) {
    const a = d[(ya * t.width + xa) * 4 + c]!, b = d[(ya * t.width + xb) * 4 + c]!;
    const e = d[(yb * t.width + xa) * 4 + c]!, g = d[(yb * t.width + xb) * 4 + c]!;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + g * fx) * fy;
  }
}

/** One model triangle over its box against the pass's depth (M2-M7), in `drawModels`' operand order. */
function drawTriangle(plan: UiFramePlan, t: UiPlanTriangle, frame: Uint8ClampedArray, W: number, depth: Float32Array): void {
  const { a, b, c, box } = t;
  const tex = t.texture === null ? null : plan.textures[t.texture]!.image;
  const additive = t.blend === 'additive';
  const inv = 1 / t.area;
  const s: number[] = [0, 0, 0, 0];
  for (let y = box.ys; y < box.ye; y++) {
    for (let x = box.xs; x < box.xe; x++) {
      let w0 = ((b.x - x) * (c.y - y) - (c.x - x) * (b.y - y)) * inv;
      let w1 = ((c.x - x) * (a.y - y) - (a.x - x) * (c.y - y)) * inv;
      let w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;                  // M2: inclusive on every edge
      const invW = w0 * a.invW + w1 * b.invW + w2 * c.invW;
      const i = y * W + x;
      if (depth[i]! > 0 && invW <= depth[i]!) continue;         // M3: strictly greater wins, 0 empty
      w0 *= a.invW / invW; w1 *= b.invW / invW; w2 *= c.invW / invW;   // M4
      const r0 = w0 * a.rgba[0] + w1 * b.rgba[0] + w2 * c.rgba[0];
      const r1 = w0 * a.rgba[1] + w1 * b.rgba[1] + w2 * c.rgba[1];
      const r2 = w0 * a.rgba[2] + w1 * b.rgba[2] + w2 * c.rgba[2];
      const r3 = w0 * a.rgba[3] + w1 * b.rgba[3] + w2 * c.rgba[3];
      let r: number, g: number, bl: number, al: number;
      if (tex) {
        const u = w0 * a.u + w1 * b.u + w2 * c.u, v = w0 * a.v + w1 * b.v + w2 * c.v;
        sample(tex, u * tex.width, (1 - v) * tex.height, s);     // M5: stored row v = 0 is the map's last row
        r = Math.min(255, (s[0]! * r0) / 128); g = Math.min(255, (s[1]! * r1) / 128); bl = Math.min(255, (s[2]! * r2) / 128);
        al = (s[3]! / 255) * (r3 / 128);
      } else { r = r0; g = r1; bl = r2; al = r3 / 128; }
      if (al <= 0) continue;                                     // M6: no colour, no depth
      depth[i] = invW;
      const o = i * 4;                                           // M7: the frame alpha untouched
      if (additive) {
        frame[o] = frame[o]! + r * al;
        frame[o + 1] = frame[o + 1]! + g * al;
        frame[o + 2] = frame[o + 2]! + bl * al;
      } else {
        frame[o] = frame[o]! + (r - frame[o]!) * al;
        frame[o + 1] = frame[o + 1]! + (g - frame[o + 1]!) * al;
        frame[o + 2] = frame[o + 2]! + (bl - frame[o + 2]!) * al;
      }
    }
  }
}
