/**
 * A tracer's launch and flight (research 89 §19). The round's tracer branch (`FUN_003cabe0` D:L320537-320553: every
 * fourth round of the weapon's count `+0xb8`) launches it into the pool at `0x4b5260` (`FUN_003d5030`), and the world's
 * projectile tick steps it a game frame at a time (`FUN_003d1f90` -> `FUN_003cc990` -> `FUN_003d4bf0`, research 215
 * §7.6) until it reaches the round's end or its speed passes the range. What draws is the zAnim on the tracer's object
 * (`TRACER_ANIM`): the launch clears the object's model (`FUN_003178a0(obj, 0)`) whenever `DAT_003e1568` is set, and it
 * is 1 in the disc's ELF (D:L327199-327211; #425's review). Was (#425 as filed): the map's line-strip model drawn and flown
 * at `½·a·t²` per page frame from the muzzle.
 */

/** The acceleration the round hands the launch, units per second per game frame's dt (`DAT_003e1570`, D:L320550). */
export const TRACER_ACCEL = 400;

/** The tracer pool (`0x4b5260`; research 89 §4). A full pool launches nothing (`FUN_003d5030` D:L327184-327186). */
export const TRACER_POOL = 100;

/** A shot shorter than this launches no tracer, units (`FUN_003d5030` D:L327195-327196). */
export const TRACER_MIN_SHOT = 70;

/** The range without a weapon record, units (`0x43960000`, D:L327232-327233). */
export const TRACER_DEFAULT_RANGE = 300;

/**
 * Whose zAnim a round plays. The launch takes the ally's anim (`DAT_004b5340`) unless the round's model is the enemy's
 * (`DAT_004b5320 == DAT_004b5330`), then the enemy's (`DAT_004b5348`) (D:L327204-327207); the round sets the model by its
 * `+0xb4` -- 0 the ally's (`DAT_004b5338`), 1 the enemy's -- and the turret's round sets 1 (`FUN_003cabe0` D:L320544-320548,
 * D:L300350). Ally and enemy are the viewer's own side and the other (`TRACER_SIDE_READING`).
 */
export const TRACER_SIDE_READING = 'viewer-team' as const;

export type TracerKind = 'ally' | 'enemy' | 'turret';

/** The zAnim a kind plays: the turret's round is the enemy model's, so the enemy's anim. */
export const TRACER_ANIM: Record<TracerKind, string> = {
  ally: 'tracer_ally_anim',
  enemy: 'tracer_enemy_anim',
  turret: 'tracer_enemy_anim',
};

/**
 * TRACER_START_ROLL_READING: the start's roll is `rand() % 990` (`FUN_00197740`, D:L327213). The page rolls it with its
 * effects' own generator (`Math.random` in the match pages), not the console's `rand()`: a cosmetic offset on one page,
 * which no other page or the room needs to share. [reading]
 */
export const TRACER_START_ROLL_READING = "the page's effects generator" as const;

export interface TracerFlight {
  /** Where it is (the object's place, `+0x8..+0x10`). */
  readonly pos: [number, number, number];
  /** The round's end (`+0x14..+0x1c`). */
  readonly end: readonly [number, number, number];
  /** Units a step, less one (`+0x24`), grown by `dt x accel` a frame. */
  speed: number;
  /** Past this speed it retires (`+0x28`). */
  readonly range: number;
  /** Retired (`+0x2c`): at its end or past its range. */
  done: boolean;
}

/**
 * A round's tracer kind. Turret weapon ids are 205-229 (`FUN_003cb1a0`, the same range `tracerRound` uses). Otherwise
 * `TRACER_SIDE_READING`: the viewer's own side is ally.
 */
export function tracerKindFor(weaponId: number, sameSide: boolean): TracerKind {
  if (weaponId >= 205 && weaponId <= 229) return 'turret';
  if (TRACER_SIDE_READING === 'viewer-team') return sameSide ? 'ally' : 'enemy';
  return 'ally';
}

/**
 * `FUN_003d5030`: a tracer for the round from `from` to `to`, or null for a shot under `TRACER_MIN_SHOT`. It starts
 * `(rand() % 990 + 1) / 10` units -- 0.1 to 99.0 -- down the shot (D:L327213-327223; `TRACER_START_ROLL_READING`) at speed
 * 0 (D:L327231); `range` the weapon's (`FUN_003d27f0`, its record's `+0x3c`), else `TRACER_DEFAULT_RANGE`.
 */
export function launchTracer(from: readonly number[], to: readonly number[], random: () => number, range: number = TRACER_DEFAULT_RANGE): TracerFlight | null {
  const dx = to[0]! - from[0]!, dy = to[1]! - from[1]!, dz = to[2]! - from[2]!;
  const length = Math.hypot(dx, dy, dz);
  if (!(length >= TRACER_MIN_SHOT)) return null;
  const roll = Math.min(989, Math.max(0, Math.floor(random() * 990)));
  const r = (roll + 1) / 10;
  return {
    pos: [from[0]! + (dx / length) * r, from[1]! + (dy / length) * r, from[2]! + (dz / length) * r],
    end: [to[0]!, to[1]!, to[2]!],
    speed: 0,
    range,
    done: false,
  };
}

/**
 * `FUN_003d4bf0`, one game frame of `dt` seconds (D:L327055-327093): the speed grows by `dt x TRACER_ACCEL`; past the
 * range it retires where it is; otherwise it steps `speed + 1` units toward its end -- the direction taken afresh each
 * frame, the step not scaled by `dt` -- and a step that would pass the end puts it there and retires it. True once retired.
 */
export function stepTracer(flight: TracerFlight, dt: number): boolean {
  if (flight.done) return true;
  flight.speed += dt * TRACER_ACCEL;
  if (flight.range < flight.speed) { flight.done = true; return true; }
  const p = flight.pos, e = flight.end;
  const ex = e[0] - p[0], ey = e[1] - p[1], ez = e[2] - p[2];
  const left = Math.hypot(ex, ey, ez), step = flight.speed + 1;
  if (left < step) {
    p[0] = e[0]; p[1] = e[1]; p[2] = e[2];
    flight.done = true;
    return true;
  }
  p[0] += (ex / left) * step; p[1] += (ey / left) * step; p[2] += (ez / left) * step;
  return false;
}

/** The tracer's place (the object's position, `FUN_003157d0`). */
export function tracerHead(flight: TracerFlight): [number, number, number] {
  return [flight.pos[0], flight.pos[1], flight.pos[2]];
}
