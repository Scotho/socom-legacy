/** Authored CPU decisions; the projectile and Room still enforce the game's throw physics and inventory. */
import { impactRange, maxThrowDistance, throwAnim, throwVelocity } from '@s2u/scene';
import type { BotRole } from './roles';

/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. A tactical throw's bounds around the native trajectory: its distances and tolerance, the settle and cooldown ticks, the landing and lane margins (world units, ticks). */
export const BOT_THROW_ADAPTATION = {
  minimumDistance: 195, maximumDistance: 295, rangeTolerance: 12, settleTicks: 45,
  cooldownTicks: 18 * 60, impactMargin: 25, laneMargin: 14,
} as const;

export interface BotThrowSolution { power: number; distance: number; from: [number, number, number]; velocity: [number, number, number] }

/** Invert the native standing overhand trajectory. A distance/max-distance ratio is not throw power. */
export function solveBotThrow(wanted: number): BotThrowSolution | null {
  if (wanted < BOT_THROW_ADAPTATION.minimumDistance || wanted > BOT_THROW_ADAPTATION.maximumDistance) return null;
  let best: BotThrowSolution | null = null;
  for (let step = 0; step <= 80; step++) {
    const power = 0.6 + step * 0.005, anim = throwAnim(power, 0, 'stand');
    if (anim.toss) continue;
    const velocity = throwVelocity(power, 0, anim.offset, maxThrowDistance('stand')).velocity;
    const horizontal = Math.hypot(velocity[0], velocity[2]);
    const flight = impactRange(horizontal, velocity[1], anim.offset[1]);
    const distance = -anim.offset[2] - velocity[2] / horizontal * flight;
    if (!best || Math.abs(distance - wanted) < Math.abs(best.distance - wanted))
      best = { power, distance, from: [...anim.offset], velocity: [...velocity] };
  }
  return best && Math.abs(best.distance - wanted) <= BOT_THROW_ADAPTATION.rangeTolerance ? best : null;
}

export interface TacticalThrowSituation {
  distance: number; visibleTicks: number; enemiesAtLanding: number; underFire: boolean; gunBlocked: boolean;
  pursuing: boolean; allyNearLanding: boolean; allyInFlight: boolean;
  frag: boolean; smoke: boolean; flash: boolean; role: BotRole;
}

/** A tactical reason is required; a lone exposed enemy within gun range gets the firearm. */
export function chooseTacticalThrow(s: TacticalThrowSituation): 'frag' | 'smoke' | 'flash' | null {
  if (s.distance < BOT_THROW_ADAPTATION.minimumDistance || s.distance > BOT_THROW_ADAPTATION.maximumDistance
    || s.visibleTicks < BOT_THROW_ADAPTATION.settleTicks || s.allyNearLanding || s.allyInFlight) return null;
  if (s.underFire && s.pursuing && s.smoke) return 'smoke';
  if (s.enemiesAtLanding >= 2 && s.frag) return 'frag';
  if (s.gunBlocked && s.role === 'rusher' && s.flash) return 'flash';
  if (s.gunBlocked && s.frag) return 'frag';
  return null;
}
