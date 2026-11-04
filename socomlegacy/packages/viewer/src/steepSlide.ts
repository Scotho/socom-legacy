import { columnTop } from './climb';
import { SEAL_TUNING_DEFAULTS } from './physics';

/**
 * The steep-ground slide (`FUN_0054edf0`, `FUN_0054f330`; research 201 §3 and §27.3, the gap research 101 A6).
 * One step, called from `Walker`, so the room's sim and the page's prediction cannot drift.
 *
 * Reading, pending review. A capture is still owed (research 201 §3). The port does not model the column overrun
 * that can fault the original on M71's rubble ramp (research 313).
 */

/** Polygon top − bottom at least this slides a standing or crouched body (`lui 0x4080` at 0x54f3c8; research 201 §3, §27.3). */
export const SLIDE_SPAN_MIN = 4;

/**
 * Surface kind the walker passes. Research 201 §3's disc census: every collision polygon of every map is kind 4
 * (304,126 polygons, bits 28–30). `WorldPoly` does not store those bits, so the walker does not decode them.
 */
export const SLIDE_DISC_SURFACE_KIND = 4;

/**
 * [reading] How `FUN_0054f330` reads the polygon's top − bottom. Research 201 §3 leaves `FUN_002dbfb0`'s two
 * points as the remaining interpretive step, and reads them as top and bottom the way `climb.ts` `columnTop` does.
 * `'column'` (this value): the highest and lowest edge point whose xz-projection contains the feet, or null when
 * none does — a failed extent read slides. On a planar quad under the feet that span is the polygon's full height,
 * so a 3-tall face does not slide a standing body and does slide a prone one (the note's test).
 * `'vertices'`: max y − min y of the polygon, wherever the feet are.
 */
export const SLIDE_SPAN_MEASURE_READING: 'vertices' | 'column' = 'column';

/** The polygon's vertical extent, or null when the read fails ("no extent" slides; research 201 §3). */
export function slideSpanOf(
  points: ArrayLike<number>, x: number, z: number,
  measure: typeof SLIDE_SPAN_MEASURE_READING = SLIDE_SPAN_MEASURE_READING,
): number | null {
  if (measure === 'column') {
    const col = columnTop(points, x, z);
    return col ? col.top[1] - col.bottom[1] : null;
  }
  const n = points.length / 3;
  if (n < 3) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = points[i * 3 + 1]!;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return hi - lo;
}

/**
 * `FUN_0054f330` (research 201 §3, §27.3). Kind 1 never slides. Under `maxSlope` (the walk's cos 50°): prone, or
 * the extent missing, or the span at least `SLIDE_SPAN_MIN`. Walkable ground slides only for kind 0, which the
 * disc census does not use.
 */
export function slideEligible(
  normalY: number, span: number | null, prone: boolean,
  kind = SLIDE_DISC_SURFACE_KIND, maxSlope = SEAL_TUNING_DEFAULTS.max_slope,
): boolean {
  if (kind === 1) return false;
  if (normalY < maxSlope) return prone || span === null || span >= SLIDE_SPAN_MIN;
  return kind === 0;
}

export interface SlideStep { speed: number; dx: number; dz: number; clip: boolean }

/**
 * One frame of `FUN_0054edf0` (research 201 §3, §27.3). While the speed is 0 it starts as the horizontal
 * velocity's projection on the fall line (`FUN_0054edf0` D:L417112-417153, `FUN_00309110`). That line is the unit
 * vector down the slope, and its horizontal part has length n_y, so the entry is `n_y · (v_h · ĥ)`. A later frame
 * does not project again. Then `speed += (1 − n_y) · g · dt` (`g` = `DAT_0044c250` = 235). The frame's displacement,
 * written where the stick's move is written (`+0xf44`, `+0xf4c`), is `speed · dt · n_y · (n_x, n_z)` — the whole
 * move, not an extra term. `clip` is the `Slide` push: speed at or over `g / 4` (58.75 when g is 235).
 */
export function slideStep(
  speed: number, n: readonly [number, number, number], dt: number, vx: number, vz: number,
  g = SEAL_TUNING_DEFAULTS.gravity,
): SlideStep {
  const hx = n[0], hz = n[2], h = Math.hypot(hx, hz);
  if (speed === 0 && h > 0) speed = n[1] * (vx * hx + vz * hz) / h;
  speed += (1 - n[1]) * g * dt;
  const scale = speed * dt * n[1];
  return { speed, dx: scale * hx, dz: scale * hz, clip: speed >= g / 4 };
}

export interface SlideFrame { sliding: boolean; speed: number; dx: number; dz: number; clip: boolean }

/** The surface test, then one frame. Not eligible: speed 0 and no displacement (the caller keeps the stick move). */
export function steepGroundFrame(args: {
  normalY: number;
  normal: readonly [number, number, number];
  span: number | null;
  prone: boolean;
  speed: number;
  dt: number;
  vx: number;
  vz: number;
  kind?: number;
  g?: number;
  maxSlope?: number;
}): SlideFrame {
  const kind = args.kind ?? SLIDE_DISC_SURFACE_KIND;
  const maxSlope = args.maxSlope ?? SEAL_TUNING_DEFAULTS.max_slope;
  if (!slideEligible(args.normalY, args.span, args.prone, kind, maxSlope)) {
    return { sliding: false, speed: 0, dx: 0, dz: 0, clip: false };
  }
  const step = slideStep(args.speed, args.normal, args.dt, args.vx, args.vz, args.g ?? SEAL_TUNING_DEFAULTS.gravity);
  return { sliding: true, ...step };
}
