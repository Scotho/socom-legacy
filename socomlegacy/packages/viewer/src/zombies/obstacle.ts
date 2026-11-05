/**
 * A short climb or jump, proved on a spare mover before the live one tries it (`TEST_ROOM_ZOMBIES_ADAPTATION`).
 * Uses the test room's own walker and traversal.
 */
import { segmentHit, type Grid } from '@s2u/scene';
import { Walker, type WalkInput } from '../mover';
import { Traversal } from '../traversal';
import { WEAPON_LINE_BOTS_READING } from '../weaponLine';
import type { PlayClips } from '../play';

type Point = readonly number[];
const PUSH: WalkInput = { forward: 1, right: 0, boost: false };

export function botTraversal(grid: Grid, clips: PlayClips | null): Traversal {
  const moves = new Traversal(grid, []);
  if (clips) moves.setClips(clips.clips, clips.table ? new Map(clips.table) : null);
  return moves;
}

export class ObstacleMove {
  ticks = 0;
  jumped = false;

  constructor(readonly yaw: number, readonly jump: boolean, readonly duration = 300) {}

  input(w: Walker, moves: Traversal): WalkInput {
    this.ticks++;
    w.state.yaw = moves.yaw() ?? this.yaw;
    if (moves.state().kind === 'hang') moves.stanceButton(w, 'stand');
    else if (!moves.busy()) moves.action();
    if (this.jump && !this.jumped && this.ticks === 8) this.jumped = w.jump();
    return PUSH;
  }
}

/** Prove a short crossing before the live zombie attempts it. */
export function planObstacle(w: Walker, goal: Point, clips: PlayClips | null): ObstacleMove | null {
  if (w.airborne || (w.driver instanceof Traversal && w.driver.busy())) return null;
  const s = w.state, dx = goal[0]! - s.x, dz = goal[2]! - s.z, distance = Math.hypot(dx, dz);
  if (distance < 12) return null;
  const reach = Math.min(65, distance), fx = dx / distance, fz = dz / distance;
  const wall = segmentHit(w.grid, [s.x, s.y + 7, s.z], [s.x + fx * reach, s.y + 7, s.z + fz * reach]);
  if (!wall) return null;
  const wallDistance = Math.hypot(wall.point[0] - s.x, wall.point[2] - s.z);
  const yaw = Math.atan2(-fx, -fz) * 180 / Math.PI;
  for (const jump of [false, true]) {
    if (jump && wallDistance > 30) continue;
    const probe = new Walker(w.grid);
    probe.weaponLineCast = WEAPON_LINE_BOTS_READING === 'cast';   // SEGMENT-BODY (review 2 F3): the zombie's own body's
    if (!probe.place(s.x, s.y + 5, s.z)) return null;
    Object.assign(probe.state, s);
    const moves = botTraversal(w.grid, clips);
    probe.driver = moves;
    const control = new ObstacleMove(yaw, jump);
    let traversed = false;
    for (let tick = 0; tick < 300; tick++) {
      probe.tick(control.input(probe, moves));
      traversed ||= probe.airborne || moves.busy();
      const p = probe.state, progress = (p.x - s.x) * fx + (p.z - s.z) * fz;
      if (p.y < s.y - 16) break;
      if (traversed && progress > wallDistance + 10 && !probe.airborne && !moves.busy() && Math.abs(p.y - goal[1]!) < 35) return new ObstacleMove(yaw, jump, tick + 1);
    }
  }
  return null;
}
