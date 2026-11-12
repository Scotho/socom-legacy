import type { DestructionDebris, Vec3 } from './effects';

/**
 * LATER 850 (research 210 s6.2): the fragments a `DESTRUCTION_SOURCE` throws -- a broken pane's own triangles, split and
 * flown -- as pure logic, no renderer. The original's three functions, transcribed:
 *
 * - `FUN_00322800` (D:L222681-222831): each polygon of the node's subtree, in its stored order, fanned from its first
 *   point -- triangles (v0, vi, vi+1) for i = 1 .. n-2 (D:L222758-222828) -- each handed to `FUN_00322df0`; a piece it
 *   returns is thrown from the triangle's centroid with its own draws (`shatterPane`).
 * - `FUN_00322df0` (D:L222837-223482): a triangle is split in four at a drawn ratio, or kept, by its measure
 *   `0.6 x size / |A x B + B x C + C x A|`; the leaves are thrown (`splitOrKeep`).
 * - `FUN_003271d0` (D:L225155-225284; the fragment's vtable 0x4069e0 slot +0xc): each tick's age, expiry, position,
 *   acceleration, gravity, spin and drag (`stepGlassFragment`).
 *
 * Arithmetic is single precision in the order the instructions do it (the ELF at 0x322800-0x322de0,
 * 0x322df0-0x3234b0, 0x3271d0-0x327558), each step rounded by `Math.fround` -- a round-to-nearest stand-in: the EE's
 * FPU rounds each step toward zero (`GLASS_FRAGMENT_F32_ROUNDING_READING`). Reading, pending review.
 */

/**
 * GLASS_FRAGMENT_F32_ROUNDING_READING: how each single-precision step here rounds. `Math.fround` rounds to nearest
 * (ties to even); the R5900's FPU rounds every operation toward zero (research 200 s1.3; research 111's
 * `EE_FPU_ROUNDING_READING`, which `packages/ui/src/text/f32.ts` transcribes) -- so a step here can differ from the
 * original's in its last bit [reading: 'nearest', a round-to-nearest stand-in for the EE's toward-zero rounding; settles:
 * the steps chopped as `f32.ts` does, pinned against a trace of a pane's fragments].
 */
export const GLASS_FRAGMENT_F32_ROUNDING_READING = 'nearest' as const;

const F = Math.fround;
/** An f32 constant by its bits, as the instructions load it (`lui`/`ori`). */
const bits = (b: number): number => new Float32Array(new Uint32Array([b]).buffer)[0]!;
/** 0x30000000: 2^-31, `FUN_00197740`'s scale (written 4.656613e-10 in the decompilation). */
const R31 = bits(0x30000000);
const THIRD = bits(0x3eaaaaab);
const SPLIT_GAIN = bits(0x3f19999a);         // 0.6, D:L223084
const SPLIT_FLOOR = bits(0x3e99999a);        // 0.3, D:L223087
const RATIO_BASE = bits(0x3ecccccd);         // 0.4, D:L223102
const RATIO_SPAN = bits(0x3e4ccccd);         // 0.2, D:L223102
const SPIN_SPAN = 10, SPIN_BASE = -5;        // D:L222793-222798: r x 10 - 5
const GRAVITY = 20;                          // 0x41a00000, D:L225227
/** 100.0: the colour's fourth word as `FUN_00322800` writes it before each triangle (D:L222777; 0x322a40). */
export const GLASS_FRAGMENT_ALPHA = 100;

/**
 * GLASS_FRAGMENT_SEED_PLACEHOLDER: the state of newlib's `rand()` when a pane breaks. Every draw here is
 * `FUN_00197740` (D:L14524-14536: `state = state x 0x5851f42d4c957f2d + 1`, the high word's low 31 bits), seeded by
 * `FUN_00197728` (D:L14514-14521) -- one stream the whole game shares, so its state at the break depends on every draw
 * before it, which nothing here can know [placeholder: a page's own stream, seeded 1; a capture of a pane shot out
 * would show the population and trajectories, not the state].
 */
export const GLASS_FRAGMENT_SEED_PLACEHOLDER = 1;

/**
 * GLASS_FRAGMENT_WIND_PLACEHOLDER: the vector a fragment's drag pulls its velocity toward -- the world's
 * (`DAT_0045c380`) +0xc0..+0xc8 times the descriptor's +0x40 (1.0, `FUN_00328e90` D:L226262), `FUN_003271d0`
 * D:L225244-225247. The world's constructor (`FUN_00320310` D:L221283, `FUN_0031b130`) leaves those three words unset
 * and no writer is read [placeholder: none, (0, 0, 0)]. Only a debris with a drag reads it, and no command 29 on the
 * disc has one: +0x3c is 0 on all eleven (MP1's three `snow_window01..03`; the `breakapane` of MP2, MP71, MP73, M53,
 * M61, M63, M81 and M82; research 210 s6.1).
 */
export const GLASS_FRAGMENT_WIND_PLACEHOLDER: Readonly<Vec3> = [0, 0, 0];

/**
 * GLASS_FRAGMENT_START_ROTATION_READING: a fragment's rotation when thrown. `FUN_003271d0` adds `spin x step` to the
 * visual's own rotation (`FUN_003156a0` / `FUN_00315760`, D:L225228-225235); the visual is taken from a pool
 * (`FUN_00322470` D:L222585-222607) and handed its mesh by `FUN_00327130` (D:L225138-225152), and what rotation
 * either leaves on it is not read [reading: none, (0, 0, 0) -- the mesh's points are the triangle's own as it stood].
 */
export const GLASS_FRAGMENT_START_ROTATION_READING: Readonly<Vec3> = [0, 0, 0];

/** newlib's `rand()` (`FUN_00197728` seeds it, `FUN_00197740` draws): 0 .. 2^31 - 1. */
export class NewlibRand {
  private state: bigint;
  constructor(seed: number = GLASS_FRAGMENT_SEED_PLACEHOLDER) { this.state = BigInt(seed >>> 0); }
  next(): number {
    this.state = BigInt.asUintN(64, this.state * 0x5851f42d4c957f2dn + 1n);
    return Number((this.state >> 32n) & 0x7fffffffn);
  }
}

/** A source of `FUN_00197740`'s draws. */
export interface GlassRandom { next(): number }

/** One draw as a unit: `cvt.s.w` then times 2^-31. */
const unit = (rand: GlassRandom): number => F(F(rand.next()) * R31);
/** `lo + (hi - lo) x r` (D:L222784-222792: `sub.s`, `mul.s`, `add.s`). */
const lerp = (lo: number, hi: number, r: number): number => F(lo + F(F(hi - lo) * r));

type UV = [number, number];
const add = (a: Vec3, b: Vec3): Vec3 => [F(a[0] + b[0]), F(a[1] + b[1]), F(a[2] + b[2])];
const sub = (a: Vec3, b: Vec3): Vec3 => [F(a[0] - b[0]), F(a[1] - b[1]), F(a[2] - b[2])];
const scale = (a: Vec3, s: number): Vec3 => [F(a[0] * s), F(a[1] * s), F(a[2] * s)];
/** `FUN_001bfc78` (D:L40450-40463): VU0's outer product, `a x b`. */
const cross = (a: Vec3, b: Vec3): Vec3 => [
  F(F(a[1] * b[2]) - F(a[2] * b[1])), F(F(a[2] * b[0]) - F(a[0] * b[2])), F(F(a[0] * b[1]) - F(a[1] * b[0])),
];
/** `FUN_00309240` twice then `FUN_00309180` by 0x3eaaaaab: (a + b + c) / 3, in that order. */
const centroid = (a: Vec3, b: Vec3, c: Vec3): Vec3 => scale(add(add(a, b), c), THIRD);
/** The split's point on an edge, `from + t x (to - from)` (D:L223103-223120). */
const along = (from: Vec3, to: Vec3, t: number): Vec3 => [0, 1, 2].map((k) => F(from[k]! + F(t * F(to[k]! - from[k]!)))) as Vec3;
const alongUV = (from: UV, to: UV, t: number): UV => [F(from[0] + F(t * F(to[0] - from[0]))), F(from[1] + F(t * F(to[1] - from[1])))];

/** A fragment in flight: the original's 0x74-byte record (`FUN_00327800` D:L225388-225435). */
export interface GlassFragment {
  /** The triangle's points less its origin -- the mesh (`FUN_00322df0` D:L223216-223267, `FUN_00309200`). */
  readonly points: [Vec3, Vec3, Vec3];
  /** Each point's texture coordinate (the stored polygon's packed u, v / 4096: D:L222750-222751). */
  readonly uv: [UV, UV, UV];
  /** +0x20: where it is. */
  pos: Vec3;
  /** +0x30: its velocity. */
  vel: Vec3;
  /** +0x5c: its spin, added to `rotation` times the step (radians a second is the visual's unit; not read). */
  readonly spin: Vec3;
  /** The visual's rotation (`GLASS_FRAGMENT_START_ROTATION_READING` when thrown). */
  rotation: Vec3;
  /** +0xc: its age, seconds. */
  age: number;
  /** +0x48: its life, seconds; at or past it the visual is hidden (D:L225209-225211) and the record freed. */
  readonly life: number;
  /** False once hidden: `FUN_00328170` (D:L225813-225835) frees it at the next update. */
  alive: boolean;
}

/** A polygon of the broken node, as it stands in the world: its points (x, y, z flat) and, if known, its (u, v) flat. */
export interface GlassPolygon {
  readonly points: ArrayLike<number>;
  readonly uvs?: ArrayLike<number>;
}

/** A kept triangle not yet thrown: `FUN_00322df0`'s returned mesh, its points about `origin`. */
interface Piece { points: [Vec3, Vec3, Vec3]; uv: [UV, UV, UV]; origin: Vec3 }

/** The seven draws a throw makes, in order: velocity x, y, z; spin x, y, z; life (D:L222784-222821, D:L223428-223448). */
function throwDraws(debris: DestructionDebris, rand: GlassRandom): { vel: Vec3; spin: Vec3; life: number } {
  const vel = [0, 1, 2].map((k) => lerp(debris.velocityFrom[k]!, debris.velocityTo[k]!, unit(rand))) as Vec3;
  const spin = [0, 1, 2].map(() => F(SPIN_BASE + F(SPIN_SPAN * unit(rand)))) as Vec3;
  const life = lerp(debris.life[0], debris.life[1], unit(rand));
  return { vel, spin, life };
}

function thrown(piece: Piece, pos: Vec3, m: { vel: Vec3; spin: Vec3; life: number }): GlassFragment {
  return {
    points: piece.points.map((p) => sub(p, piece.origin)) as [Vec3, Vec3, Vec3], uv: piece.uv,
    pos: [...pos], vel: [...m.vel], spin: [...m.spin], rotation: [...GLASS_FRAGMENT_START_ROTATION_READING],
    age: 0, life: m.life, alive: true,
  };
}

interface Shatter { debris: DestructionDebris; rand: GlassRandom; out: GlassFragment[] }

/**
 * `FUN_00322df0`: split triangle (a, b, c) in four, or keep it. `origin` is the parent's centroid (the stack argument
 * at +0x30; null from `FUN_00322800`); `siblings` the three corners' kept pieces the middle carries (+0x38..+0x48).
 * Returns the kept piece for the caller to throw, or null (thrown here, or split).
 */
function splitOrKeep(s: Shatter, a: Vec3, b: Vec3, c: Vec3, ua: UV, ub: UV, uc: UV, origin: Vec3 | null,
  siblings: readonly (Piece | null)[] | null): Piece | null {
  const carries = !!siblings && siblings.some((p) => p !== null);
  let split = false, keep = false;
  if (!carries) {
    // D:L223044-223100: the measure, 0.6 x size / |A x B + B x C + C x A| (twice the area); at or under 0.3 split, else
    // one draw: under the measure keep, else split.
    const n = add(add(cross(a, b), cross(b, c)), cross(c, a));
    const len = F(Math.sqrt(F(F(F(n[0] * n[0]) + F(n[1] * n[1])) + F(n[2] * n[2]))));
    const measure = F(SPLIT_GAIN * F(s.debris.size / len));
    if (measure <= SPLIT_FLOOR) split = true;
    else if (unit(s.rand) < measure) keep = true;
    else split = true;
  }
  if (split) {
    // D:L223101-223185: one draw for the ratio, 0.4 + 0.2 r; the three edge points; the corners, then the middle
    // carrying the corners' kept pieces; a piece the middle hands back is thrown here with its own draws.
    const t = F(RATIO_BASE + F(RATIO_SPAN * unit(s.rand)));
    const m0 = along(b, a, t), m1 = along(c, b, t), m2 = along(c, a, t);
    const u0 = alongUV(ub, ua, t), u1 = alongUV(uc, ub, t), u2 = alongUV(uc, ua, t);
    const mid = centroid(m0, m1, m2);
    const k1 = splitOrKeep(s, a, m0, m2, ua, u0, u2, mid, null);
    const k2 = splitOrKeep(s, b, m0, m1, ub, u0, u1, mid, null);
    const k3 = splitOrKeep(s, c, m2, m1, uc, u2, u1, mid, null);
    const middle = splitOrKeep(s, m0, m1, m2, u0, u1, u2, mid, [k1, k2, k3]);
    if (middle) s.out.push(thrown(middle, centroid(m0, m1, m2), throwDraws(s.debris, s.rand)));
    return null;
  }
  // D:L223187-223481: a leaf. Its origin is the parent's centroid when kept and handed one, else its own. (The draw
  // `r <= 0.3` at D:L223212 is never reached: a leaf here is kept or carries a corner.) Its mesh is made, then seven
  // draws; carried, it is thrown with each corner it carries, all with the same draws (D:L223449-223474); kept, it is
  // handed back and those draws are spent unused.
  const at = keep && origin ? origin : centroid(a, b, c);
  const piece: Piece = { points: [a, b, c], uv: [ua, ub, uc], origin: at };
  const m = throwDraws(s.debris, s.rand);
  if (keep) return piece;
  s.out.push(thrown(piece, at, m));
  for (const p of siblings ?? []) if (p) s.out.push(thrown(p, at, m));
  return null;
}

/**
 * `FUN_00322800`: the fragments a mode-0 `DESTRUCTION_SOURCE` throws from `polygons` (the node's subtree's, in their
 * stored order, as they stand), drawing from `rand`. Each polygon is fanned from its first point (D:L222758-222828); a
 * piece `splitOrKeep` hands back is thrown from the triangle's centroid (D:L222783-222826). A mode other than 0 throws
 * nothing (`FUN_00322580` D:L222660-222672).
 */
export function shatterPane(polygons: readonly GlassPolygon[], debris: DestructionDebris, rand: GlassRandom): GlassFragment[] {
  const s: Shatter = { debris, rand, out: [] };
  if (debris.mode !== 0) return s.out;
  for (const poly of polygons) {
    const n = Math.floor(poly.points.length / 3);
    const pt = (i: number): Vec3 => [F(poly.points[i * 3]!), F(poly.points[i * 3 + 1]!), F(poly.points[i * 3 + 2]!)];
    const uv = (i: number): UV => (poly.uvs ? [F(poly.uvs[i * 2]!), F(poly.uvs[i * 2 + 1]!)] : [0, 0]);
    for (let i = 1; i < n - 1; i++) {
      const piece = splitOrKeep(s, pt(0), pt(i), pt(i + 1), uv(0), uv(i), uv(i + 1), null, null);
      if (piece) s.out.push(thrown(piece, centroid(pt(0), pt(i), pt(i + 1)), throwDraws(debris, rand)));
    }
  }
  return s.out;
}

/**
 * The visual's vertex colour, each of the debris's four words plus 0.5 cut to a byte (`FUN_00322df0` D:L223268-223298),
 * the fourth as `FUN_00322800` writes it (`GLASS_FRAGMENT_ALPHA`).
 */
export function glassFragmentColour(debris: DestructionDebris): [number, number, number, number] {
  const byte = (v: number): number => Math.trunc(F(v + 0.5)) & 0xff;
  return [byte(debris.colour[0]), byte(debris.colour[1]), byte(debris.colour[2]), byte(GLASS_FRAGMENT_ALPHA)];
}

/**
 * The drag's factor for `x = -drag x step` (D:L225248-225264): halved until at most 0.5 (counted), the polynomial
 * `1 + x(0.5 + x(0.333333 + x(0.25 + x(0.2 + x(0.166666 + x)))))` in that nesting, squared once per halving, inverted
 * when x was negative. Not `exp(x)`: the original's own series, kept as written.
 */
export function glassDragFactor(x: number): number {
  let v = F(x);
  const negative = v < 0;
  if (negative) v = F(-v);
  let halvings = 0;
  while (!(v <= 0.5)) { halvings++; v = F(v * 0.5); }
  let e = F(bits(0x3e2aaa7e) + v);
  e = F(e * v);
  e = F(bits(0x3e4ccccd) + e);
  e = F(0.25 + F(v * e));
  e = F(bits(0x3eaaaa9f) + F(v * e));
  e = F(0.5 + F(v * e));
  e = F(1 + F(v * e));
  for (; halvings > 0; halvings--) e = F(e * e);
  return negative ? F(1 / e) : e;
}

/**
 * `FUN_003271d0`: one tick of `step` seconds (`FUN_00328170` D:L225803-225835 hands the same step as the age's and the
 * integration's, `DAT_00488458`). In order: the age; at or past the life the fragment is hidden and nothing moves
 * (D:L225207-225211); else the position by the velocity it had (D:L225213-225218), the velocity by the debris's
 * acceleration (D:L225219-225224), then gravity, 20 a second squared off the vertical (D:L225227); the rotation by the
 * spin, but not on the first tick, when the age is the step (D:L225228-225234); last, with a drag, the velocity eased
 * toward the wind by `glassDragFactor` (D:L225243-225279).
 */
export function stepGlassFragment(f: GlassFragment, step: number, debris: DestructionDebris,
  wind: Readonly<Vec3> = GLASS_FRAGMENT_WIND_PLACEHOLDER): void {
  if (!f.alive) return;
  const dt = F(step);
  f.age = F(f.age + dt);
  if (!(f.age < f.life)) { f.alive = false; return; }
  f.pos = add(f.pos, scale(f.vel, dt));
  f.vel = add(f.vel, scale(debris.acceleration, dt));
  f.vel[1] = F(f.vel[1] - F(GRAVITY * dt));
  if (f.age !== dt) f.rotation = add(f.rotation, scale(f.spin, dt));
  if (debris.drag !== 0) {
    const w: Vec3 = [F(wind[0]), F(wind[1]), F(wind[2])];
    const e = glassDragFactor(F(F(-debris.drag) * dt));
    f.vel = add(w, scale(sub(f.vel, w), e));
  }
}

/** The page's set of fragments in flight: thrown by `add`, flown and freed by `step`. */
export class GlassFragments {
  readonly flying: { fragment: GlassFragment; debris: DestructionDebris }[] = [];
  constructor(readonly rand: GlassRandom = new NewlibRand()) {}
  /** A `DESTRUCTION_SOURCE`'s throw from the broken node's polygons; the fragments made. */
  add(polygons: readonly GlassPolygon[], debris: DestructionDebris): GlassFragment[] {
    const made = shatterPane(polygons, debris, this.rand);
    for (const fragment of made) this.flying.push({ fragment, debris });
    return made;
  }
  /** One tick for every fragment; the hidden ones freed. */
  step(dt: number): void {
    for (const f of this.flying) stepGlassFragment(f.fragment, dt, f.debris);
    for (let i = this.flying.length - 1; i >= 0; i--) if (!this.flying[i]!.fragment.alive) this.flying.splice(i, 1);
  }
}
