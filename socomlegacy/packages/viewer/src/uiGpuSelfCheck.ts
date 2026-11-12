import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import type { UiBitmap, UiTextures } from './uiCompositorView';

/**
 * UIGPU-SELFCHECK (a PRODUCT-TRACK browser adaptation with no original; the GPU menus plan's fallback ladder, L4): before
 * a GPU menu surface's first frame is trusted -- each time its programs finish linking: at its first make, after a
 * context restore, after a match gives the menus back -- the surface draws one small known scene through the SAME
 * drawer and the same plan its frames use (`GpuUiPresenter.drawOffscreen`, the surface's blend), reads the frame target
 * back, and compares it with the software drawer's frame of the same scene. A gross mismatch -- a batch the GPU silently
 * did not draw, as on the player's MacBook Air (Intel HD Graphics 6000, Chrome, 2026-11-11: the backdrop drawn, the rows
 * and text not; `agent-mail/evidence/v0419-window/MAC-BLANK-MENU-READ.md`) -- puts every menu surface on the software
 * for the session. Nothing changes on a device whose GPU draws the scene as the software does.
 *
 * The scene stands for what a menu frame is made of: a textured opaque backdrop, an untextured half-alpha panel over
 * it, and glyph quads from a font-like atlas with alpha (a drop shadow pass, then the glyphs, one of them tinted) -- the
 * three kinds of quad the rows and the text draw with. Whole frame pixels only, so the two drawers' known differences
 * (the f32 twin's, research 380 §1: a few units) stay far under the bound.
 */

/**
 * UI_GPU_SELF_CHECK_ADAPTATION: no original; the self-check's bounds. A probe pixel is "off" when any channel differs
 * from the software's by more than `byteTolerance` (the twin's known differences are a few units: far under it); the
 * surface fails when more than `maxShare` of the probe's pixels are off (a dropped batch is a fifth to a half of them).
 * The probe's region is `region`, in frame pixels at scale 1. Start values: the evidence for them is the twin's bounds,
 * not a measurement of a failing device beyond the one report.
 */
export const UI_GPU_SELF_CHECK_ADAPTATION = Object.freeze({
  byteTolerance: 24, maxShare: 0.02, region: Object.freeze({ x0: 8, y0: 8, x1: 120, y1: 64 }),
  /** The blend modes drawn: both the GPU path has (`UiPlanBlendMode`: `exact` at scale 1, `ff` at HD; GM.R6), each its own draw. */
  blends: Object.freeze(['exact', 'ff'] as const),
} as const);

const BACKDROP = 'uigpu-selfcheck/backdrop';
const FONT = 'uigpu-selfcheck/font';

/** A 16 x 16 opaque backdrop: a coarse colour field (four 8 x 8 cells), so a missing or misplaced draw shows. */
function backdrop(): UiBitmap {
  const w = 16, h = 16, data = new Uint8ClampedArray(w * h * 4);
  const cells: [number, number, number][] = [[200, 40, 40], [40, 200, 40], [40, 40, 200], [200, 200, 40]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[(y < 8 ? 0 : 2) + (x < 8 ? 0 : 1)]!, i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

/** A 16 x 8 atlas of two 8 x 8 glyph cells, white, their alpha a shape (a ring and a bar) on a clear ground. */
function font(): UiBitmap {
  const w = 16, h = 8, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, cx = x % 8;
    const ring = x < 8 && (y === 1 || y === 6 || cx === 1 || cx === 6) && y >= 1 && y <= 6 && cx >= 1 && cx <= 6;
    const bar = x >= 8 && cx >= 3 && cx <= 4 && y >= 1 && y <= 6;
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = ring || bar ? 255 : 0;
  }
  return { width: w, height: h, data };
}

// The scene's two images, made once a page and never written: the texture cache keys them by content (GM-13), so the
// same objects are hashed once a page, not at every check.
let images: Record<string, UiBitmap> | null = null;

/** The self-check's scene: its draw list and its textures (two small images, the same objects every call). */
export function uiGpuSelfCheckScene(): { items: UiDrawItem[]; textures: UiTextures } {
  const { x0, y0, x1, y1 } = UI_GPU_SELF_CHECK_ADAPTATION.region;
  const bitmaps = images ??= { [BACKDROP]: backdrop(), [FONT]: font() };
  const glyphs: Extract<UiDrawItem, { kind: 'glyphs' }>['quads'] = [];
  // Two rows of eight (review F3: the text alone dropped -- shadows, glyphs or both -- must stand well clear of the bound;
  // one row left a dropped shadow pass at 1.7x it, two rows put every text-only drop past 3x).
  for (let k = 0; k < 16; k++) {
    const left = x0 + 12 + (k % 8) * 12, top = y0 + (k < 8 ? 34 : 45), cell = k % 2;
    const glyph = { code: 65 + k, texture: FONT, u0: cell * 8, u1: cell * 8 + 8, v0: 0, v1: 8 };
    glyphs.push({ ...glyph, shadow: true, left: left + 1, top: top + 1, right: left + 9, bottom: top + 9, rgba: [0, 0, 0, 96] });
    glyphs.push({ ...glyph, shadow: false, left, top, right: left + 8, bottom: top + 8, rgba: k === 3 ? [128, 96, 32, 128] : [128, 128, 128, 128] });
  }
  const items: UiDrawItem[] = [
    { kind: 'clear', rgb: [0, 0, 0] },
    { kind: 'sprite', node: BACKDROP, texture: BACKDROP, x0, y0, x1, y1, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null },
    { kind: 'sprite', node: 'uigpu-selfcheck/panel', texture: null, x0: x0 + 8, y0: y0 + 6, x1: x1 - 8, y1: y0 + 30, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [32, 48, 160, 64], clip: null },
    { kind: 'glyphs', node: 'uigpu-selfcheck/text', quads: glyphs, clip: null },
  ];
  return { items, textures: (name) => bitmaps[name] ?? null };
}

/** The compare over the probe's region: how many pixels are off, the largest |Δ|, the first off pixel. */
export interface UiGpuSelfCheckResult {
  ok: boolean;
  pixels: number;
  off: number;
  maxAbs: number;
  first: { x: number; y: number; gpu: number[]; software: number[] } | null;
}

/** The probe's rectangle of a whole frame (straight RGBA, top row first), as `UiGpuBackend.readPixelsIn` reads the GPU's. */
export function uiGpuSelfCheckCrop(frame: Rgba, region = UI_GPU_SELF_CHECK_ADAPTATION.region): Rgba {
  const w = region.x1 - region.x0, h = region.y1 - region.y0, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((region.y0 + y) * frame.width + region.x0) * 4;
    data.set(frame.data.subarray(from, from + w * 4), y * w * 4);
  }
  return { width: w, height: h, data };
}

/**
 * The GPU's probe rectangle against the software's (both straight RGBA, top row first, the probe's size): every pixel
 * compared; the first off pixel named in frame pixels (`bounds.region`'s corner added).
 */
export function uiGpuSelfCheckCompare(gpu: Rgba, software: Rgba, bounds = UI_GPU_SELF_CHECK_ADAPTATION): UiGpuSelfCheckResult {
  if (gpu.width !== software.width || gpu.height !== software.height || gpu.data.length !== software.data.length) {
    return { ok: false, pixels: 0, off: 0, maxAbs: 255, first: null };
  }
  const W = gpu.width, a = gpu.data, b = software.data;
  let pixels = 0, off = 0, maxAbs = 0;
  let first: UiGpuSelfCheckResult['first'] = null;
  for (let y = 0; y < gpu.height; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let m = 0;
      for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(a[i + c]! - b[i + c]!));
      pixels++;
      if (m > maxAbs) maxAbs = m;
      if (m > bounds.byteTolerance) {
        off++;
        if (!first) first = { x: bounds.region.x0 + x, y: bounds.region.y0 + y, gpu: [a[i]!, a[i + 1]!, a[i + 2]!, a[i + 3]!], software: [b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!] };
      }
    }
  }
  return { ok: pixels > 0 && off <= Math.floor(pixels * bounds.maxShare), pixels, off, maxAbs, first };
}
