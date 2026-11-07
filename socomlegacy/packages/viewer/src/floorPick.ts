import { probeGround, type Grid, type Hit } from '@s2u/scene';

/**
 * The camera's floor probe, one transcription for every reader (research 89 §21, research 81 §9-§10). `FUN_00295b00`
 * probes once a frame under the camera node's world origin (`FUN_00310980`, D:L140037) with `FUN_0031dfd0` (D:L140038)
 * and, from that one hit, writes the camera's region mask (`FUN_00290c00`, D:L140043-140050), `+0x2c0` (D:L140051-140052)
 * and, when the polygon has params (D:L140053), `+0x2b8` (`m_inside`, `FUN_002dc180`, D:L140054-140055) and `+0x2bc`
 * (the reverb zone, `FUN_002dc150`, D:L140056-140057) -- nothing at all with no hit (D:L140039). Its readers here:
 * - the effects' `CAMERA_INDOORS` (66, its tick 0x2936b0 reads `+0x2b8`; `./effects` `Effects.indoors`);
 * - the sound's reverb and beds (`FUN_00341a60` reads `+0x2bc` and `+0x2b8`, D:L241520-241521; `./walkSounds`
 *   `WalkSounds.frame` -> `GameAudio.setEnvironment`);
 * - the eye's region (`./regionCull` `regionUnder`, LATER 415).
 */

/**
 * INV-RAIN's review F1 (research 89 §21; reading, pending review): how far over the camera's place its floor probe takes a
 * floor. `FUN_00295b00` loads 0.0 into `$f12` (`mtc1 $zero, $f12` at 0x295e40, the ELF's code; Ghidra's call reads the
 * float argument as the leading 0, D:L140038) before `FUN_0031dfd0` (0x31dfd0), which keeps it in `$f20` (0x31e004) and
 * hands it back in `$f12` to `FUN_002d4c20` (0x31e05c) -- the pick's `pos.y + param_1` (D:L175882).
 */
export const CAMERA_FLOOR_ABOVE = 0;

/**
 * The camera's floor (INV-RAIN's review F1): `FUN_00295b00`'s probe under the camera node's origin (D:L140037-140038),
 * `FUN_0031dfd0(world, pos, 1)` -- the world column at its x and z (`FUN_002d49c0`; the port's `probeGround`) -- then
 * `FUN_002d4c20` (D:L175859-175900): of the column's hits the highest at or below `y + CAMERA_FLOOR_ABOVE`, the first
 * of equal heights (a later entry replaces only a strictly higher one, D:L175888); null with none. Not the actor's pick
 * (`probeFloor`, `FUN_005b5d40`): no lowest-hit fallback and no 20-over cut-off, nothing over the point. The original
 * writes nothing when the hit is a SEAL's polygon (`FUN_0059acd0`, D:L140040); the port's grid holds no body (as
 * `regionCull.ts`'s `REGION_EYE_BODY_READING`). The column's order is the grid's.
 */
export function cameraFloor(grid: Grid, x: number, y: number, z: number): Hit | null {
  let best: Hit | null = null;
  for (const h of probeGround(grid, x, z)) if (h.y <= y + CAMERA_FLOOR_ABOVE && (best === null || h.y > best.y)) best = h;
  return best;
}
