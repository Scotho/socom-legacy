import { zoneCentre, type AiMaps } from '@s2u/scene';
import type { CompassMark } from './hud';

/**
 * HX-5 (web sprint 31; socomlegacy/docs/research/239 s5; research 190 D): EXTRACTION's compass marks, pure -- the page
 * (`NetPage.hostageMarks`) hands them to the HUD (`Hud.setHostageMarks`) once a frame (the wave-4 line, 239 s7.2).
 *
 * The compass's bitmaps load in a fixed order (`FUN_002126f0` D:L68576): 0 ret_triangle, 1 ret_bomb, 2-3 ret_base,
 * 4 ret_hostage, 5 ret_friendly, 6 ret_extraction, 7-8 ret_objective, 9 hud_talk, 10 small_compass -- the mark types.
 * Online the compass's jump table (0x3e44b0, `FUN_00211510` D:L68148) always shows types 1-8, 12 and 13, whatever the
 * distance (the port's objective marks: `./hud` `compassMarks`), at the types 1-13 pulse (`OBJECTIVE_MARK_PULSE_READING`)
 * and in their table colours (`OBJECTIVE_MARK_RGB_READING`).
 */

/**
 * HOSTAGE_MARK_READING (190 D): a hostage's mark is type 4, `ret_hostage`, made at its AI's set-up (`FUN_005434b0(actor,
 * 4, 0)` D:L434920) when its fireteam word shares a bit with the local player's (D:L410155) -- both sides, a hostage's
 * 0xC0020000 meeting each -- and on a remote by the AI word's bit 29 (`FUN_0056f4c0` D:L432836-432841); drawn in (62, 49,
 * 36), always, pulsing. [reading]
 */
export const HOSTAGE_MARK_READING = 'type 4, (62,49,36), always, pulsing';

/**
 * EXTRACTION_MARK_READING (190 D, B2): "EXTRACTION LOC" (0x3f0a68), type 6 `ret_extraction`, at each kind-1 zone's centre
 * cell with that cell's floor height, one per kind-1 zone on sub-map 0, made at the map's load (`FUN_002abd40`
 * D:L151857, `FUN_002a42b0` D:L147723; the compass list 0x436390, D:L146907) -- `@s2u/scene` `zoneCentre`; drawn in (36,
 * 40, 62), always, pulsing. [reading]
 */
export const EXTRACTION_MARK_READING = 'type 6 at the centre cell, (36,40,62)';

/**
 * MARK_REMOVED_ON_RESCUE_READING (190 D; HX-3's `RESCUED_SIGNAL_READING`): entering 0x11 online frees the hostage's
 * compass anchor (`FUN_00543480` at `FUN_005594b0` D:L422308) and nothing makes it again, so a rescued hostage has no
 * mark from its first 0x11 on -- a HOLD inside the fade too, in r0001; r0004 refuses any order in 0x11, R4B-04. A dead hostage has none (its body no longer an AI's;
 * the anchor's fate at a death is not read, the port draws none). [reading]
 */
export const MARK_REMOVED_ON_RESCUE_READING = 'freed on entering 0x11';

/** A hostage as the marks see it: where it stands, whether it lives, whether it has entered 0x11 this round. */
export interface MarkedHostage { at: readonly number[]; alive: boolean; rescued: boolean }

/**
 * The extraction marks' points (`EXTRACTION_MARK_READING`): each kind-1 zone's centre on sub-map 0, at its cell's height;
 * none without the AI maps (a zone whose centre cell the grid does not store gives none: `zoneCentre`).
 */
export function extractionPoints(ai: AiMaps | null | undefined): [number, number, number][] {
  const sub = ai?.maps[0];
  if (!sub) return [];
  return sub.zones.filter((z) => z.kind === 1).map((z) => zoneCentre(sub, z)).filter((p): p is [number, number, number] => p !== null);
}

/**
 * The compass marks of EXTRACTION: `ret_hostage.tif` on each living hostage not rescued (`HOSTAGE_MARK_READING`,
 * `MARK_REMOVED_ON_RESCUE_READING`), then `ret_extraction.tif` at each zone's centre (`EXTRACTION_MARK_READING`), all
 * pulsing.
 */
export function hostageMarks(hostages: readonly MarkedHostage[], zones: readonly (readonly number[])[]): CompassMark[] {
  const out: CompassMark[] = [];
  for (const h of hostages) if (h.alive && !h.rescued) out.push({ bitmap: 'ret_hostage.tif', x: h.at[0]!, z: h.at[2]!, pulse: true });
  for (const z of zones) out.push({ bitmap: 'ret_extraction.tif', x: z[0]!, z: z[2]!, pulse: true });
  return out;
}
