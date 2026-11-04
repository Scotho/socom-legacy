import { MAX_PITCH_RATE, MAX_YAW_RATE } from '../look';
import { shortTurn, wrapYaw } from '../yaw';
import { PART } from './damage';
import { bodyVolumes, type StanceVolumes, type V3 } from './hitVolumes';
import { TICK_HZ } from './protocol';
import { cameraLook, centreClaim, type CameraBody } from './shotCone';

/**
 * NPB-1 (`docs/plans/2026-10-24-forge-npc-brains.md`; NPB.R4): the aim code the forge's NPCs (`../forge/npcs.ts`,
 * `FORGE_HOSTILE_DRIVER_ADAPTATION`) and the headless bots (`tools/mp-bots.ts`, `BOT_AIM_ADAPTATION`) shared as two
 * copies, in one place. A browser adaptation's helper with no original: the game had no bots, so nothing here changes what
 * the game does, and a look it steps is held to OT.R38's law by the room's own look gate like any page's.
 */

/** The full stick's turn a tick, degrees: `MAX_YAW_RATE` (2.236 rad/s, research 83) over the 60 Hz commands. */
export const BOT_YAW_STEP_DEG = (MAX_YAW_RATE * 180) / Math.PI / TICK_HZ;
/** The full stick's pitch a tick, degrees: `MAX_PITCH_RATE` (0.950 rad/s) over the 60 Hz commands. */
export const BOT_PITCH_STEP_DEG = (MAX_PITCH_RATE * 180) / Math.PI / TICK_HZ;

/** Where a body's round leaves from: 15.4 above the feet (the headless bots' muzzle since M9). */
export const muzzleOf = (feet: readonly number[]): V3 => [feet[0]!, feet[1]! + 15.4, feet[2]!];
export const clampTo = (v: number, lim: number): number => (v > lim ? lim : v < -lim ? -lim : v);

/** A body's torso: the mean of its BODY capsules' middles (`bodyVolumes`: the skeleton's when loaded, else the placeholder's). */
export function torsoPoint(body: { feet: readonly number[]; yaw: number; posture: CameraBody['posture'] }, volumes: StanceVolumes | null): V3 {
  const torso = bodyVolumes(body.feet, body.yaw, body.posture, volumes).filter((c) => c.part === PART.BODY);
  let x = 0, y = 0, z = 0;
  for (const c of torso) { x += (c.a[0] + c.b[0]) / 2; y += (c.a[1] + c.b[1]) / 2; z += (c.a[2] + c.b[2]) / 2; }
  return [x / torso.length, y / torso.length, z / torso.length];
}

/**
 * One tick of the look toward `want` (degrees): at most `BOT_YAW_STEP_DEG` of turn the short way and `BOT_PITCH_STEP_DEG`
 * of pitch; `turn` the yaw's step as the stick's rate (rad/s, left positive); `holds` once the look reached the wish.
 */
export function lookStep(look: { yaw: number; pitch: number }, want: { yaw: number; pitch: number }): { yaw: number; pitch: number; turn: number; holds: boolean } {
  const dYaw = shortTurn(look.yaw, want.yaw), dPitch = want.pitch - look.pitch;
  const sYaw = clampTo(dYaw, BOT_YAW_STEP_DEG), sPitch = clampTo(dPitch, BOT_PITCH_STEP_DEG);
  return {
    yaw: sYaw === dYaw ? wrapYaw(want.yaw) : wrapYaw(look.yaw + sYaw), pitch: sPitch === dPitch ? want.pitch : look.pitch + sPitch,
    turn: ((sYaw * Math.PI) / 180) * TICK_HZ, holds: sYaw === dYaw && sPitch === dPitch,
  };
}

/** The round down `b`'s look at the cone's centre, as far as the point on it nearest `point`. */
export function aimedClaim(b: CameraBody, from: readonly number[], point: readonly number[]): ReturnType<typeof centreClaim> {
  const { eye, look } = cameraLook(b);
  const t = (point[0]! - eye[0]) * look[0] + (point[1]! - eye[1]) * look[1] + (point[2]! - eye[2]) * look[2];
  return centreClaim(b, from, Math.max(1, t));
}
