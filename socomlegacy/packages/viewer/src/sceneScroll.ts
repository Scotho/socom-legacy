import type { EffectOp } from '@s2u/scene';
import type { OpTick } from './effectRunner';

/**
 * LATER 782 (research 387 §12.3, §12.7): the two motions behind Fish Hook's shore, transcribed for the world's scene host
 * (`./worldState`) -- a speed-profile stroke of a placed node (`OBJECT_MOTION_FROM_TO` flags 0x800 / 0x1000) and
 * `SCROLL_MOTION` (command 24), which moves the texture coordinates of the visuals under one node by the travel of
 * another. Pure: the host lends a node's place and takes the texture steps. In doubles, where the original computes in
 * the EE's single floats.
 */

export type Vec3 = [number, number, number];
type FromTo = Extract<EffectOp, { op: 'fromTo' }>;
type Scroll = Extract<EffectOp, { op: 'scroll' }>;
export type SpeedProfile = NonNullable<FromTo['profile']>;

/**
 * SCENE_PROFILE_MOTION_READING (LATER 782; research 387 §12.3, §12.7): which `OBJECT_MOTION_FROM_TO` the world runs as a
 * speed-profile stroke of its node's translation (`profileStrokeTick`), and what of it is a reading.
 *
 * - **Run**: a translation (the position block, u16 +0x0c) with the profile (flags 0x800 / 0x1000) whose start is given
 *   (flag 2: `translation.from`) and which moves the node (flag 8; `FUN_0025f9b0` D:L108981-108999) -- and no rotation
 *   (0x40), scale block (0x200), start from the context (4) or target from elsewhere (0x10, 0x400). The disc's speed
 *   profiles are Fish Hook's (MP71, M71) shore strokes, flags 0x180a, and M51-M83's `obj_crane` (no node placed, no time);
 *   `fishHookMotion.devdisc.test.ts` sweeps them.
 * - **Read as 0**: the position block's first byte -- its bits take the start (bit 0) or the target (bit 1) from a node
 *   and the time from a speed (bit 2; `FUN_0025fe70` D:L109106-109247) -- is not decoded (`@s2u/scene` keeps no field for
 *   it); research 387 §12.3 reads it 0 on every MP71 stroke. A stroke with a bit set would take its start, target or
 *   time from elsewhere in the original.
 * - **The node only**: the stroke moves the node's own translation in the world's state (`WorldState.nodePlace`) and
 *   nothing of the hull -- no profile's node carries collision on the disc (the dev-disc pins) -- and nothing drawn
 *   moves by it: what reads it is `SCROLL_MOTION` (`scrollTick`).
 *
 * Every other translation on a placed node stays `SCENE_NODE_TRANSFORM_PLACEHOLDER`'s (`./worldState`; Desert Glory's
 * bees). Was `WASHUP_MOTION_PLACEHOLDER` ('still'). Reading, pending review.
 */
export const SCENE_PROFILE_MOTION_READING = 'givenStartNodeOnly' as const;

/** The flags under which a profile stroke takes its start, its target or its scale from something the world does not run. */
const PROFILE_REFUSED = 0x4 | 0x10 | 0x40 | 0x200 | 0x400;

/** Whether the world runs `op` as a speed-profile stroke (`SCENE_PROFILE_MOTION_READING`). */
export function runsProfileStroke(op: FromTo): boolean {
  return op.profile !== undefined && op.translation !== undefined && op.translation.from !== null
    && (op.flags & PROFILE_REFUSED) === 0 && (op.flags & 0x8) !== 0;
}

/** The profile's running half (`FUN_002606f0`'s block: +0x20 the phase's time, +0x24 the speed, +0x28 the unit direction, +0x34 the phase). */
export interface ProfileRun { phase: number; elapsed: number; speed: number; dir: Vec3 }

/**
 * The begin's profile setup (`FUN_0025fe70` D:L109263-109289): the phase's time 0; the phase the first of the three
 * times above 0 -- 1 at the start speed, 2 or 3 at the cruise speed (`speeds[1]` for both: D:L109274-109281); the
 * direction from the block's start to its target (P+0x10 less P+4, normalised by `FUN_00309110` D:L207441ff, left as it
 * is when 0). A block with no time above 0 keeps the phase and speed of the command's last run in the original (they
 * are the command's own bytes); here phase 0 and speed 0 -- no disc block has one.
 */
export function profileBegin(profile: SpeedProfile, from: Vec3, to: Vec3): ProfileRun {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.sqrt(d[2] * d[2] + d[0] * d[0] + d[1] * d[1]);
  const dir: Vec3 = len !== 0 ? [d[0] / len, d[1] / len, d[2] / len] : d;
  const [t1, t2, t3] = profile.times;
  if (t1 > 0) return { phase: 1, elapsed: 0, speed: profile.speeds[0], dir };
  if (t2 > 0) return { phase: 2, elapsed: 0, speed: profile.speeds[1], dir };
  if (t3 > 0) return { phase: 3, elapsed: 0, speed: profile.speeds[1], dir };
  return { phase: 0, elapsed: 0, speed: 0, dir };
}

/**
 * `FUN_002606f0` (D:L109348-109434): `pos` moved along the direction for `dt` seconds. Phase 1 adds `accel` x dt to the
 * speed for `times[0]`, then hands on to phase 2 (when `times[1]` is above 0) or 3; phase 2 holds `speeds[1]` for
 * `times[1]`; phase 3 adds `decel` x dt with no end of its own (the command's time ends it). Each step moves by the
 * speed after its change times the step's time; a step that crosses a phase's end is split there and the rest taken in
 * the next phase.
 */
export function profileAdvance(run: ProfileRun, profile: SpeedProfile, dt: number, pos: Vec3): void {
  while (dt > 0) {
    let rest = 0;
    if (run.phase === 3) {
      run.speed += profile.decel * dt;
      run.elapsed += dt;
    } else if (run.phase === 2) {
      run.speed = profile.speeds[1];
      const t = run.elapsed + dt;
      if (profile.times[1] < t) {
        const used = profile.times[1] - run.elapsed;
        run.elapsed = 0;
        run.phase = 3;
        rest = dt - used;
        dt = used;
      } else run.elapsed = t;
    } else if (run.phase === 1) {
      const t = run.elapsed + dt;
      if (profile.times[0] < t) {
        const used = profile.times[0] - run.elapsed;
        run.elapsed = 0;
        rest = dt - used;
        run.phase = profile.times[1] > 0 ? 2 : 3;
        dt = used;
      } else run.elapsed = t;
      run.speed += profile.accel * dt;
    }
    pos[0] += run.dir[0] * run.speed * dt;
    pos[1] += run.dir[1] * run.speed * dt;
    pos[2] += run.dir[2] * run.speed * dt;
    dt = rest;
  }
}

/** A node's translation as the world holds it: read and written whole (`FUN_003157d0` D:L215063ff, the node's +0x30). */
export interface NodeTranslation { get(): Vec3; set(t: Vec3): void }

/**
 * A speed-profile stroke (`runsProfileStroke`): the begin (`FUN_0025fe70`) sets the node's translation to the start
 * (D:L109141-109143) and sets the profile up (`profileBegin`); the returned tick (`FUN_0025f9b0` D:L108850-109031)
 * answers done when the command's time is up -- the elapsed time plus this tick past `seconds` (D:L108911-108919, as
 * `./effectRunner` `opacityTick`) -- setting the target (P+0x10, plus the start under flag 1) unless flag 0x2000
 * (D:L108958-108977) and handing on the rest of the tick; else it moves the node from where it stands by
 * `profileAdvance` (D:L108981-108999).
 */
export function profileStrokeTick(op: FromTo, node: NodeTranslation): OpTick {
  const t = op.translation!, profile = op.profile!;
  const start: Vec3 = [...t.from!];
  const target: Vec3 = (op.flags & 1) !== 0 ? [start[0] + t.to[0], start[1] + t.to[1], start[2] + t.to[2]] : [...t.to];
  node.set([...start]);
  const run = profileBegin(profile, start, t.to);
  let elapsed = 0;
  return (dt) => {
    if (op.seconds < dt + elapsed) {
      if ((op.flags & 0x2000) === 0) node.set([...target]);
      return dt - (op.seconds - elapsed);
    }
    elapsed += dt;
    const pos = node.get();
    profileAdvance(run, profile, dt, pos);
    node.set(pos);
    return false;
  };
}

/** `(short)(int)x`: the step truncated toward zero, then kept to 16 bits as the vertex's texture coordinate is. */
const toShort = (x: number): number => (Math.trunc(x) << 16) >> 16;

/**
 * `FUN_003bfee0` (D:L313770-313839): one texture step of a registered visual -- `du`, `dv` (texture repeats) plus the
 * fraction it carries, in 1/4096ths truncated toward zero, added to each of its vertices' u and v. The carry of an
 * axis is cleared when a step was taken on it or its input was 0, else grows by the input: a travel too small for one
 * step is kept until the sum makes one. Returns the steps taken, in 1/4096ths (`[0, 0]`: none).
 */
export function uvStep(carry: [number, number], du: number, dv: number): [number, number] {
  const su = toShort((du + carry[0]) * 4096), sv = toShort((dv + carry[1]) * 4096);
  carry[0] = du === 0 || su !== 0 ? 0 : carry[0] + du;
  carry[1] = dv === 0 || sv !== 0 ? 0 : carry[1] + dv;
  return [su, sv];
}

/**
 * `FUN_00260b40`'s travel (D:L109635-109655, flag 8 clear): the length of the mover's move since the last tick, negative
 * when its x and z run against the axis carried into the world (the y of both is not asked).
 */
export function scrollTravel(axisWorld: Vec3, from: Vec3, to: Vec3): number {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.sqrt(d[2] * d[2] + d[0] * d[0] + d[1] * d[1]);
  return axisWorld[2] * d[2] + axisWorld[0] * d[0] < 0 ? -len : len;
}

/** What a scroll reads of its mover: its world place now, and the command's axis carried through its world matrix. */
export interface ScrollMover { place(): Vec3; axis(): Vec3 }

/** Whether the world runs `op` (`SCROLL_MOTION_PLACEHOLDER`, `./worldState`): the travel form -- flag 8 clear. */
export function runsScroll(op: Scroll): boolean {
  return (op.flags & 8) === 0;
}

/**
 * `SCROLL_MOTION`, the travel form (`runsScroll`): the begin (`FUN_00260fb0` D:L109681-109703) keeps the mover's world
 * place; each tick (`FUN_00260b40` D:L109507-109676) measures the travel since the last (`scrollTravel`), keeps the
 * place, and hands `uv` times it to the registered visuals (`FUN_003c0280` D:L313876ff -> `uvStep`): `step` takes the
 * steps of one tick, in 1/4096ths. It answers not done for ever, unless flag 1, which ends it once its `seconds` are up
 * (D:L109663-109674, timed as the other commands).
 */
export function scrollTick(op: Scroll, mover: ScrollMover, step: (su: number, sv: number) => void): OpTick {
  let last = mover.place();
  const carry: [number, number] = [0, 0];
  let elapsed = 0;
  return (dt) => {
    const now = mover.place();
    const travel = scrollTravel(mover.axis(), last, now);
    last = now;
    const [su, sv] = uvStep(carry, op.uv[0] * travel, op.uv[1] * travel);
    if (su !== 0 || sv !== 0) step(su, sv);
    if ((op.flags & 1) === 0 || op.seconds === null) return false;
    if (op.seconds < dt + elapsed) return dt - (op.seconds - elapsed);
    elapsed += dt;
    return false;
  };
}

/**
 * A placed node's frame (`MapMeta.motion`): its own matrix and its world matrix (row-major, row vectors: world = own x
 * parent, `@s2u/scene` `multiply`). Its world place with its own translation at `t`, and a world direction.
 */
export class NodeFrame {
  /** The parent's world 3x3 (own^-1 x world, the 3x3s), which carries a change of the own translation into the world. */
  private readonly parent: number[];

  constructor(readonly own: readonly number[], readonly world: readonly number[]) {
    this.parent = mul3(inverse3(own), world);
  }

  /** The own translation at rest. */
  get rest(): Vec3 { return [this.own[12]!, this.own[13]!, this.own[14]!]; }

  /** The world place with the own translation at `t` (the rest's world place, plus the change through the parent). */
  place(t: Vec3): Vec3 {
    const d: Vec3 = [t[0] - this.own[12]!, t[1] - this.own[13]!, t[2] - this.own[14]!];
    const p = this.parent;
    return [
      this.world[12]! + d[0] * p[0]! + d[1] * p[3]! + d[2] * p[6]!,
      this.world[13]! + d[0] * p[1]! + d[1] * p[4]! + d[2] * p[7]!,
      this.world[14]! + d[0] * p[2]! + d[1] * p[5]! + d[2] * p[8]!,
    ];
  }

  /** `v` as a direction through the world matrix (`FUN_00310980` of a point, less the place: the 3x3 alone). */
  direction(v: Vec3): Vec3 {
    const w = this.world;
    return [
      v[0] * w[0]! + v[1] * w[4]! + v[2] * w[8]!,
      v[0] * w[1]! + v[1] * w[5]! + v[2] * w[9]!,
      v[0] * w[2]! + v[1] * w[6]! + v[2] * w[10]!,
    ];
  }
}

/** The 3x3 of a row-major 4x4, inverted (row-major 9); the identity for a singular one. */
function inverse3(m: readonly number[]): number[] {
  const a = m[0]!, b = m[1]!, c = m[2]!, d = m[4]!, e = m[5]!, f = m[6]!, g = m[8]!, h = m[9]!, i = m[10]!;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (det === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const k = 1 / det;
  return [
    A * k, (c * h - b * i) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, (c * d - a * f) * k,
    C * k, (b * g - a * h) * k, (a * e - b * d) * k,
  ];
}

/** A row-major 3x3 times a row-major 4x4's 3x3. */
function mul3(l: readonly number[], m: readonly number[]): number[] {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(l[r * 3]! * m[c]! + l[r * 3 + 1]! * m[4 + c]! + l[r * 3 + 2]! * m[8 + c]!);
  return out;
}
