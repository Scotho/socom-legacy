/**
 * LATER 1245 (research 445 s3; simulation track, reading, pending review; checked against PC 1's MP6 capture): the
 * hostage's danger visibility as the original's -- `FUN_00538d10(18.0, map, the hostage's cell, the object's +0x48, 0)`
 * (D:L403738-403775) -- a walk over the AI navigation grid, not the collision hull. The eye is the hostage's cell height
 * plus 18 (`FUN_0052d480`); the walk `FUN_005352d0` (D:L401979-402107) samples the line every 0.2 cell, calling its
 * occluder at each new cell and once more at the end point (the planner's `worldProbeCells`, the same sampling); the
 * occlusion accumulates; the visibility is 1 - clamp(occlusion, 0, 1) (`FUN_00539b70` with 0x64fa28 / 0x64fa30), 0 when
 * the walk fails.
 * - `LAB_005390d0` (machine code 0x5390d0-0x539234): a cell of kind 0, 8 or 10 occludes whole; a bit-7 cell's record
 *   (`FUN_00530d10`) of type 1 or 7 too -- `HOSTAGE_VISIBILITY_RECORD_PLACEHOLDER`; then `FUN_00539240`.
 * - `FUN_00539240` (D:L403883-403932): the line's height at the sample, `lerp(eye, target, t)`, against the cell's floor:
 *   above the line, and the cell neither kind 10 nor flagged (its byte 3 bit 1), it occludes whole; else, past 30 u along
 *   the line, a cell of kind 12, 4 or 5 adds 0.35, 0.5 or 0.85 when the line is within 15, 18 or 20 u of its floor.
 */
import type { AiLoc } from '@s2u/scene';
import type { HostageProbeCell } from './hostagePath';

type V3 = readonly [number, number, number];

/**
 * LATER 1245 (research 445 s3; the disc ELF): the walk's constants -- `eye` the height over the cell (`FUN_00538d10`'s
 * 18.0), `cover` `FUN_00539240`'s partial occluders: past `minDistance` (`DAT_0064f9e0` 30), by cell kind `within` u of
 * the floor (0x64f9e8 / f0 / f8: 15, 18, 20) adding `add` (0x64fa00 / 08 / 10: 0.35, 0.5, 0.85).
 */
export const HOSTAGE_DANGER_VISIBILITY_READING = {
  eye: 18,
  cover: { minDistance: 30, kinds: { 12: { within: 15, add: 0.35 }, 4: { within: 18, add: 0.5 }, 5: { within: 20, add: 0.85 } } },
} as const;

/**
 * LATER 1245 (the review's F3): `LAB_005390d0`'s second occluder -- a bit-7 cell's marker record (`FUN_00530d10(map,
 * cell)`) of type 1 or 7 (the door types) with its +8 bit 4 and +6 bits 4-6 clear occludes whole. The load clears those
 * bits on every marker (D:L385775-385780; research 404), so the port occludes every type-1 or type-7 marker cell, as
 * loaded; who sets them again at run time (a door opening?) is unread.
 */
export const HOSTAGE_VISIBILITY_RECORD_PLACEHOLDER = 'type 1 or 7 occludes, as loaded' as const;

/** What the walk asks of the navigation (the room's `HostagePathPlanner`). */
export interface VisibilityNav {
  point(loc: AiLoc): [number, number, number];
  /** A bit-7 cell's marker type, or null (`HostagePathPlanner.markerType`). */
  markerType?(loc: AiLoc): number | null;
  worldProbeCells(from: AiLoc, to: V3, visit: (sample: HostageProbeCell) => boolean): boolean;
}

const BLOCKING = new Set([0, 8, 10]);

/** `FUN_00538d10`: the visibility, 0..1, from the hostage's cell `from` to the object at `target`. */
export function navVisibility(nav: VisibilityNav, from: AiLoc, target: V3): number {
  const R = HOSTAGE_DANGER_VISIBILITY_READING;
  const eye = nav.point(from)[1] + R.eye;
  let occlusion = 0;
  const walked = nav.worldProbeCells(from, target, (s) => {
    const kind = s.word & 31;
    if (BLOCKING.has(kind)) occlusion = 1;                       // LAB_005390d0
    else if (s.word & 128) {                                      // a bit-7 cell: HOSTAGE_VISIBILITY_RECORD_PLACEHOLDER
      const type = nav.markerType?.(s.loc) ?? null;
      if (type === 1 || type === 7) occlusion = 1;
    }
    if (s.height !== null) {                                     // FUN_00539240
      const line = target[1] * s.fraction + eye * (1 - s.fraction);
      const flagged = ((s.word >>> 25) & 1) !== 0;
      if (s.height <= line || flagged || kind === 10) {
        const c = (R.cover.kinds as Readonly<Record<number, { within: number; add: number }>>)[kind];
        if (s.distance > R.cover.minDistance && c && line <= s.height + c.within) occlusion += c.add;
      } else occlusion = 1;
    }
    return occlusion < 1;
  });
  if (!walked) return 0;
  return 1 - Math.min(1, Math.max(0, occlusion));
}
