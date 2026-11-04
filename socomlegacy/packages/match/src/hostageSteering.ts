import { SEAL_TUNING } from '@s2u/scene';

/** Research 334 §5: FUN_00567900 / FUN_0056c340 / FUN_0056c550 and spawn RAM. Reading, pending review. */
export const HOSTAGE_STEERING_READING = {
  approach: 15.753800392150879, damping: 64, cruise: 8,
  turnDot: 0.9396899938583374, turnGain: 1.25, turnCap: 2, calmTurnScale: 0.3499999940395355,
  hangForward: 0.25, // FUN_0056c550 D:L431601–431607; RAM0x6500e8.
  near: 30, forwardDot: 0.8659999966621399, backwardCap: 0.25, link: 0.35,
  sideApproach: 5, sideDamping: 20, sideRise: 0.3499999940395355, directModeScale: 1,
  forwardRise: 0.44999998807907104, turnSlew: 4, modeScale: 2, snap: 0.009999999776482582,
  pointRadius: 5, corridorRadius: 5, cellInverse: 0.1,
  lateralRadius: 5.5, lateralIncrement: 5, perturbationDecay: 6, perturbationZeroSq: 0.1,
} as const;
const clamp = (v: number, cap: number) => Math.max(-cap, Math.min(cap, v));

/** FUN_00308b00 D:L207295-207373: endpoints are outside the projection's open interval. */
export function routeProjection(start: readonly number[], end: readonly number[], at: readonly number[]): { point: [number, number]; distance: number } | null {
  const x = end[0]! - start[0]!, z = end[1]! - start[1]!, lengthSq = x * x + z * z;
  const t = ((at[0]! - start[0]!) * x + (at[1]! - start[1]!) * z) / lengthSq;
  if (!(t > 0 && t < 1)) return null;
  const point: [number, number] = [start[0]! + x * t, start[1]! + z * t];
  return { point, distance: Math.hypot(at[0]! - point[0], at[1]! - point[1]) };
}

/** FUN_00567900 D:L429706-429719: positive previous facing becomes negative, with cell-distance/travel gate. */
export function passedRoutePoint(previousDot: number, dot: number, cellDistance: number, canTravelNext: boolean): boolean {
  return previousDot > 0 && dot < 0 && (cellDistance < 2 || canTravelNext);
}

/** Normal, unarmed route mode 3; special strafe/aim-state branches remain in FOLLOW_STEERING_PLACEHOLDER. */
export class HostageSteering {
  forward = 0;
  turn = 0;
  side = 0;
  private perturbation = 0;
  reset(): void { this.forward = this.side = this.turn = this.perturbation = 0; }
  /** FUN_00567900 D:L429876-429890, FUN_0056fd00 D:L433131-433169, FUN_0054d9a0 D:L416463-416467.
   * The normal path's side correction is a decaying local velocity perturbation, not a strafe command.
   */
  lateral(dt: number, yaw: number, toLine: readonly [number, number] | null): number {
    const r = HOSTAGE_STEERING_READING;
    this.perturbation = this.perturbation * this.perturbation < r.perturbationZeroSq ? 0 : this.perturbation * (1 - r.perturbationDecay * dt);
    if (toLine && Math.hypot(...toLine) > r.lateralRadius) {
      const angle = yaw * Math.PI / 180;
      this.perturbation += clamp((Math.cos(angle) * toLine[0] - Math.sin(angle) * toLine[1]) / dt, r.lateralIncrement);
    }
    return this.perturbation;
  }
  step(dt: number, input: { yaw: number; dx: number; dz: number; throttle: number; final: boolean; link: boolean; hanging?: boolean }): { yaw: number; forward: number; dot: number } {
    this.side = 0; // Normal route mode supplies a zero side command; decreasing magnitude is immediate.
    const r = HOSTAGE_STEERING_READING, d = Math.hypot(input.dx, input.dz);
    const yaw = input.yaw * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const tx = d ? input.dx / d : fx, tz = d ? input.dz / d : fz;
    const dot = fx * tx + fz * tz, cross = fz * tx - fx * tz;
    // FUN_0056c340 D:L431374-431420. The constructor starts alert at zero (FUN_00574080).
    const turnCap = r.turnCap * (r.calmTurnScale * (1 - input.throttle) + input.throttle);
    const desiredTurn = dot > 1 ? 0 : dot > r.turnDot ? clamp(cross * r.turnGain, turnCap) : (cross >= 0 ? 1 : -1) * turnCap;
    const requested = input.final ? 0 : input.link ? r.link : input.throttle;
    let desiredForward = 0;
    // FUN_00567900 D:L429851-429874, ordinary actor (not subtype4).
    if (d > r.near || dot >= r.forwardDot || input.hanging) {
      desiredForward = requested === 0
        ? this.forward + (r.approach * d - r.damping * this.forward) * dt
        : this.forward - r.cruise * (this.forward - requested) * dt;
      desiredForward = clamp(desiredForward, input.throttle);
    }
    if (dot < 0) desiredForward = clamp(desiredForward, r.backwardCap);
    // FUN_0056c550 D:L431492-431606: mode3 rate multiplier2; forward deceleration is immediate.
    this.forward = this.slew(this.forward, desiredForward, Math.abs(desiredForward) < Math.abs(this.forward) ? 0 : r.forwardRise * r.modeScale, dt);
    this.turn = this.slew(this.turn, desiredTurn, r.turnSlew * r.modeScale, dt);
    if (input.hanging) this.hang();
    return { yaw: input.yaw + this.turn * SEAL_TUNING.turnMaxRate * dt * 180 / Math.PI, forward: this.forward, dot };
  }
  /** FUN_00566dc0 D:L429105-429154; priority6 recovery requests have no separate look direction.
   * Mode4 multiplier RAM0x6500b0=1; side gains RAM0x650128=5, 0x65012c=20,
   * side rise RAM0x64ffb4=.35 (FUN_0056c550 D:L431492-431606).
   */
  directStep(dt: number, input: { yaw: number; dx: number; dz: number; throttle: number; radius: number }): { yaw: number; forward: number; side: number; arrived: boolean } {
    const r = HOSTAGE_STEERING_READING, angle = input.yaw * Math.PI / 180;
    const forwardDistance = -Math.sin(angle) * input.dx - Math.cos(angle) * input.dz;
    const sideDistance = Math.cos(angle) * input.dx - Math.sin(angle) * input.dz;
    const forward = clamp(this.forward + (r.approach * forwardDistance - r.damping * this.forward) * dt, input.throttle);
    const side = clamp(this.side + (r.sideApproach * sideDistance - r.sideDamping * this.side) * dt, Math.min(input.throttle, 1));
    this.forward = this.slew(this.forward, forward, Math.abs(forward) < Math.abs(this.forward) ? 0 : r.forwardRise * r.directModeScale, dt);
    this.side = this.slew(this.side, side, Math.abs(side) < Math.abs(this.side) ? 0 : r.sideRise * r.directModeScale, dt);
    this.turn = this.slew(this.turn, 0, r.turnSlew * r.directModeScale, dt);
    return { yaw: input.yaw + this.turn * SEAL_TUNING.turnMaxRate * dt * 180 / Math.PI, forward: this.forward, side: this.side,
      arrived: Math.hypot(input.dx, input.dz) <= input.radius };
  }
  /** FUN_0056c550 D:L431601–431607, actor state4 after command slew. */
  hang(): void {
    this.side = this.turn = 0;
    if (this.forward === 0) this.forward = HOSTAGE_STEERING_READING.hangForward;
  }
  private slew(value: number, target: number, rate: number, dt: number): number {
    const next = rate > 0 ? value + clamp(target - value, dt * rate) : target;
    return Math.abs(next - target) <= HOSTAGE_STEERING_READING.snap ? target : next;
  }
}

/** FUN_00556370 D:L420690-420718: rotate local [side,0,-forward] into the map plane. */
export function steeringDirection(yaw: number, forward: number, side: number): [number, number] {
  const angle = yaw * Math.PI / 180;
  return [-Math.sin(angle) * forward + Math.cos(angle) * side, -Math.cos(angle) * forward - Math.sin(angle) * side];
}
