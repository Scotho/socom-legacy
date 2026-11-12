import type { Grid } from '@s2u/scene';
import { probeLiftOf, Walker } from '../src/mover';
import type { Team } from '../src/net/protocol';
import { victoryEligibility, type VictoryActor } from '../src/victory';

type Position = readonly [number, number, number];
export interface VictoryArrangement { spawnAt: Position; placedAt: Position; distance: number }

/** Browser test arrangement only. Without a facing, the old z+20 first; the remaining
 * finite nonzero offsets use that same fixture spacing, never map coordinates. With the
 * actor's facing (`candidates`), only the spots behind it. Placement and eligibility are
 * the production implementations, without tuning.
 */
const OFFSETS = [[0, 20], [20, 0], [0, -20], [-20, 0], [20, 20], [20, -20], [-20, -20], [-20, 20]] as const;
/**
 * The candidates for an actor facing `yaw` (degrees; the walker's, whose facing is (-sin yaw, -cos yaw), as
 * `../src/drops` `Drops.promptAt` reads it): the corpse straight behind it first, then the fixed offsets that lie behind
 * it. The room lays a dead player's weapon at its feet (PF-34, `match/src/pickups.ts` `dropsOf`) and the page offers a
 * weapon within PICKUP_REACH_READING in front of the feet (`Drops.prompt`). The corpse is laid behind so that no pickup
 * is offered beside the dance at all. (Was: "so a corpse in front would make the pickup the action" -- since AD-6 the
 * picker's list puts the victory point ahead of a pickup, `../src/actionContext` `ACTION_CONTEXT_ORDER` after
 * `FUN_0021f850`, so the dance would be the head either way.) Without a facing, the offsets as they were.
 */
function candidates(yaw: number | undefined): (readonly [number, number])[] {
  if (yaw === undefined || !Number.isFinite(yaw)) return [...OFFSETS];
  const r = (yaw * Math.PI) / 180, fx = -Math.sin(r), fz = -Math.cos(r);
  const behind: [number, number] = [-20 * fx, -20 * fz];
  return [behind, ...OFFSETS.filter(([dx, dz]) => dx * fx + dz * fz <= -10)];
}
export function findVictoryArrangement(grid: Grid, actor: VictoryActor, enemy: Team, yaw?: number): VictoryArrangement | null {
  if (!actor.position.every(Number.isFinite)) return null;
  for (const [dx, dz] of candidates(yaw)) {
    const spawnAt: Position = [actor.position[0] + dx, actor.position[1], actor.position[2] + dz];
    const w = new Walker(grid);
    // Room.spawn uses the requested feet plus this same exported probe lift.
    if (!w.place(spawnAt[0], spawnAt[1] + probeLiftOf('stand'), spawnAt[2])) continue;
    const placedAt: Position = [w.state.x, w.state.y, w.state.z];
    if (!placedAt.every(Number.isFinite)) continue;
    const distance = Math.hypot(...placedAt.map((n, i) => n - actor.position[i]!));
    if (!Number.isFinite(distance) || distance === 0) continue;
    if (victoryEligibility(actor, [{ alive: false, present: true, team: enemy, position: placedAt }]) !== 'available') continue;
    return { spawnAt, placedAt, distance };
  }
  return null;
}

/** A failed Room.spawn must never produce a corpse at its mover's zero default. */
export function requireVictoryPlacement(plan: VictoryArrangement, actual: Position): void {
  if (!actual.every((n, i) => Number.isFinite(n) && n === plan.placedAt[i])) throw Error('Actual victim spawn differs from checked placement');
}
