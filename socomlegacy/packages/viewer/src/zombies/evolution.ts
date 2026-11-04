/**
 * Zombie kinds and what one of them last saw (`TEST_ROOM_ZOMBIES_ADAPTATION`). Phoenix's chase, not reconstructed
 * rules of any other game. Weapon levels and power-ups are not part of this port.
 */
import type { NavPoint, NavStep } from './navigation';

export type ZombieKind = 'shambler' | 'runner' | 'armored' | 'brute';

export const ZOMBIE_TYPES = {
  shambler: { label: 'Shambler', health: 1, speed: 0.8, body: 1, damage: 25, color: 0xb8b8b8 },
  runner: { label: 'Runner', health: 0.8, speed: 1.25, body: 1, damage: 20, color: 0xffa78c },
  armored: { label: 'Armored', health: 1.5, speed: 0.65, body: 0.55, damage: 30, color: 0x9daec4 },
  brute: { label: 'Brute', health: 3, speed: 0.7, body: 0.5, damage: 40, color: 0xc899f0 },
} as const;

export function zombieKind(wave: number, index: number): ZombieKind {
  if (wave % 5 === 0 && index === 3) return 'brute';
  if (wave >= 5 && index % 7 === 4) return 'armored';
  if (wave >= 3 && index % 4 === 2) return 'runner';
  return 'shambler';
}

/** Each hunter remembers evidence rather than tracking through walls every frame. */
export class ZombiePursuit {
  private last: NavPoint | null = null;
  private age = 0;
  private mode = 'search';
  private approach: NavPoint | null = null;
  private approachOrigin: NavPoint | null = null;
  private approachTime = 0;

  goal(at: NavPoint, player: NavPoint, visible: boolean, noise: { point: NavPoint; age: number } | null, dt: number, id: number, step: NavStep): NavPoint {
    this.age += dt;
    this.approachTime -= dt;
    const distance = Math.hypot(player[0] - at[0], player[2] - at[2]);
    if (visible || distance < 25) { this.last = [...player]; this.age = 0; this.mode = 'sight'; }
    else if (noise && noise.age < 5 && Math.hypot(noise.point[0] - at[0], noise.point[2] - at[2]) < 650) {
      this.last = [...noise.point]; this.age = 0; this.mode = 'sound';
    } else if (!this.last || this.age > 6) { this.last = [...player]; this.age = 0; this.mode = 'search'; }
    else this.mode = 'memory';
    const goal = this.last!;
    // Spread approaches only in the open area near the target. Never offset through cover.
    if (visible && distance > 20 && distance < 140) {
      if (this.approachOrigin && this.approachTime > 0 && Math.hypot(this.approachOrigin[0] - goal[0], this.approachOrigin[2] - goal[2]) < 8) {
        return [...(this.approach ?? goal)];
      }
      this.approachTime = 0.5;
      this.approach = null;
      this.approachOrigin = [...goal];
      const angle = (id % 8) * Math.PI / 4;
      const point = step(goal, goal[0] + Math.cos(angle) * 10, goal[2] + Math.sin(angle) * 10);
      if (point && Math.abs(point[1] - goal[1]) < 4 && step(at, point[0], point[2])) { this.approach = point; return [...point]; }
    }
    return [...goal];
  }

  stats(): { mode: string; last: NavPoint | null; age: number } {
    return { mode: this.mode, last: this.last, age: this.age };
  }
}
