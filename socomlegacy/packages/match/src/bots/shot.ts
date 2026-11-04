import { perturb } from '../../../viewer/src/accuracy';
import { cameraLook, type AimFrame } from '../../../viewer/src/net/shotCone';
import { bodyVolumes, rayBody } from '../../../viewer/src/net/hitVolumes';
import type { Room } from '../room';
import { UNITS_PER_METRE, type WeaponRecord } from '@s2u/scene';

/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored conservative decision margin, not an authoritative hitbox change (FBA.R5). */
const ALLY_RAY_MARGIN_ADAPTATION = 1;

type V3 = [number, number, number];
const unit = (a: readonly number[]): V3 => {
  const d = Math.hypot(...a) || 1; return [a[0]! / d, a[1]! / d, a[2]! / d];
};

/** CPU input samples the existing weapon dispersion/recoil. Authored aim error is additional, never a cone bypass. */
export function sampledClaim(frame: AimFrame, from: V3, range: number, random: () => number): {eye: V3; aim: V3; from: V3; dir: V3} {
  const { eye, look } = cameraLook(frame);
  const aim = unit(perturb(look, frame.cone, random));
  const point: V3 = [eye[0] + aim[0] * range, eye[1] + aim[1] * range, eye[2] + aim[2] * range];
  return { eye, aim, from, dir: unit([point[0] - from[0], point[1] - from[1], point[2] - from[2]]) };
}

/** Conservative authored ally avoidance covers the sampled ray as well as the intended lane, including beyond a miss. */
export function friendlyOnRay(room: Room, shooter: number, from: V3, dir: V3, record: Pick<WeaponRecord, 'maximumRange'>): boolean {
  const side = room.lobby.member(shooter)?.team;
  if (!side) return false;
  // Weapon records store metres; the Room's trajectory casts in world units (fireAt).
  const reach = record.maximumRange * UNITS_PER_METRE;
  for (const member of room.lobby.players()) {
    if (member.id === shooter || member.team !== side) continue;
    const p = room.player(member.id);
    if (!p?.alive) continue;
    const s = p.sim.walker.state;
    // A deliberately conservative proxy is an AI decision only; the Room still owns the actual character hit volumes.
    const capsules = bodyVolumes([s.x, s.y, s.z], s.yaw, p.sim.walker.posture).map((c) => ({ ...c, r: c.r + ALLY_RAY_MARGIN_ADAPTATION }));
    if (rayBody(from, dir, reach, capsules)) return true;
  }
  return false;
}
