import { diagnostic, type Diagnostic } from '@s2u/creator-contracts';
import { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION }
  from '@s2u/forge-agent-protocol';

/** Forge cinematic instrument: a browser adaptation, never the original player camera. */
export type ShotVector = readonly [number, number, number];
export interface ShotPoint {
  readonly at: ShotVector;
  /** World look-at point, not a direction vector. */
  readonly look: ShotVector;
}
export interface ShotSpec {
  readonly points: readonly ShotPoint[];
  readonly seconds: number;
  readonly hold?: number;
}
export interface ShotPose {
  readonly at: [number, number, number];
  readonly look: [number, number, number];
}

export const SHOT_MIN_POINTS_ADAPTATION = CAMERA_SHOT_POINTS_ADAPTATION.min;
export const SHOT_MAX_POINTS_ADAPTATION = CAMERA_SHOT_POINTS_ADAPTATION.max;
export const SHOT_MIN_SECONDS_ADAPTATION = CAMERA_SHOT_SECONDS_ADAPTATION.min;
export const SHOT_MAX_SECONDS_ADAPTATION = CAMERA_SHOT_SECONDS_ADAPTATION.max;
export const SHOT_MIN_HOLD_ADAPTATION = CAMERA_SHOT_HOLD_ADAPTATION.min;
export const SHOT_MAX_HOLD_ADAPTATION = CAMERA_SHOT_HOLD_ADAPTATION.max;
/** Angular timing budget agreed for this Forge instrument, in metres per radian (not world units). */
export const CAMERA_PAN_METRES_PER_RADIAN_ADAPTATION = 2;
/** Strictly closer authored eyes form one stop, while both distinct positions remain on the path. */
export const CAMERA_SAME_POINT_UNITS_ADAPTATION = 1e-3;

/** Fixed numerical work budget, not an original camera value or a rendered quality measurement.
 * At most 63 * 3 * 129 = 24,381 speed samples per invocation; binary inversion needs at most 15 comparisons.
 * Timing integrates piecewise-linear nonnegative cubic speed (a trapezoidal arc approximation).
 * Its cumulative arc is C1 and has exact shared endpoint speed; there is no adaptive recursion or caller cache.
 */
export const SHOT_ARC_STEPS_ADAPTATION = 128;
/** Near-parallel directions use normalized lerp; the antipodal tie uses a deterministic orthogonal axis. */
const SHOT_DIRECTION_EPSILON_ADAPTATION = 1e-10;
/** A common derivative root is a numerical zero only within this relative coefficient residual. */
const SHOT_CUSP_RESIDUAL_ADAPTATION = 1e-10;
type V3 = [number, number, number];

function record(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.get === undefined
    && Object.getOwnPropertyDescriptor(value, key)?.set === undefined);
}
function vector(value: unknown): value is ShotVector {
  return Array.isArray(value) && value.length === 3
    && Reflect.ownKeys(value).every((key) => ['0', '1', '2', 'length'].includes(String(key)))
    && [0, 1, 2].every((i) => {
      const field = Object.getOwnPropertyDescriptor(value, String(i));
      return field !== undefined && 'value' in field && typeof field.value === 'number' && Number.isFinite(field.value);
    });
}
function pointArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length < SHOT_MIN_POINTS_ADAPTATION || value.length > SHOT_MAX_POINTS_ADAPTATION) return false;
  // Only own dense data indices and the native length field. Never invoke authored array methods/iterators.
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor)) return false;
  }
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  return length !== undefined && 'value' in length && length.value === value.length;
}
function finding(code: string, text: string, field: string): Diagnostic {
  return diagnostic({ source: 'check', severity: 'error', code: `camera.${code}`, text, field, evidence: 'validation' });
}

function checkSpec(value: unknown): Diagnostic[] {
  try {
    if (!record(value, ['points', 'seconds', 'hold'])) {
      return [finding('SCHEMA', 'A shot must contain only points, seconds and optional hold.', 'shot')];
    }
    const out: Diagnostic[] = [];
    if (typeof value.seconds !== 'number' || !Number.isFinite(value.seconds)
      || value.seconds < SHOT_MIN_SECONDS_ADAPTATION || value.seconds > SHOT_MAX_SECONDS_ADAPTATION) {
      out.push(finding('SECONDS', 'Shot seconds must be a finite number from 1 through 120.', 'seconds'));
    }
    if (value.hold !== undefined && (typeof value.hold !== 'number' || !Number.isFinite(value.hold)
      || value.hold < SHOT_MIN_HOLD_ADAPTATION || value.hold > SHOT_MAX_HOLD_ADAPTATION)) {
      out.push(finding('HOLD', 'Final hold must be a finite number from 0 through 10.', 'hold'));
    }
    if (!pointArray(value.points)) {
      out.push(finding('POINTS', 'A shot needs a plain dense data array of 2 through 64 points, with no extra fields.', 'points'));
      return out;
    }
    for (let i = 0; i < value.points.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value.points, String(i));
      const p: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      if (!record(p, ['at', 'look']) || !vector(p.at) || !vector(p.look)) {
        out.push(finding('POINT', 'Each point needs finite three-number at and world look-at vectors only.', `points[${i}]`));
      } else {
        const at = p.at;
        const look = p.look;
        if (at[0] === look[0] && at[1] === look[1] && at[2] === look[2]) {
          out.push(finding('ZERO_LOOK', 'The world look-at point must differ from the eye position.', `points[${i}].look`));
        }
      }
    }
    return out;
  } catch {
    // Unknown objects (including throwing proxies) cannot escape structured validation.
    return [finding('SCHEMA', 'The shot could not be read as finite authored data.', 'shot')];
  }
}
export function checkShot(value: unknown, metersPerUnit: number): Diagnostic[] {
  const findings = checkSpec(value);
  if (typeof metersPerUnit !== 'number' || !Number.isFinite(metersPerUnit) || metersPerUnit <= 0) {
    findings.push(finding('MAP_SCALE', 'The map must supply a positive finite metres-per-world-unit scale.', 'metersPerUnit'));
  }
  return findings;
}
function requireShot(spec: ShotSpec): void {
  const findings = checkSpec(spec);
  if (findings.length) throw new Error(findings[0]!.code);
}
export function shotLength(spec: ShotSpec): number {
  requireShot(spec);
  return spec.seconds + (spec.hold ?? 0);
}

const copy = (v: ShotVector): V3 => [v[0], v[1], v[2]];
const sub = (a: ShotVector, b: ShotVector): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const magnitude = (v: ShotVector): number => Math.hypot(v[0], v[1], v[2]);
const dot = (a: ShotVector, b: ShotVector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scaleBy = (v: ShotVector, scale: number): V3 => [v[0] * scale, v[1] * scale, v[2] * scale];
function unit(v: ShotVector): V3 {
  const length = magnitude(v);
  if (!(length > 0) || !Number.isFinite(length)) throw new Error('camera.NUMERICAL_GEOMETRY');
  return scaleBy(v, 1 / length);
}
function lerp(a: ShotVector, b: ShotVector, t: number): V3 {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}
function cubic(points: readonly V3[], tangents: readonly V3[], segment: number, t: number): V3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const a = points[segment]!;
  const b = points[segment + 1]!;
  const ma = tangents[segment]!;
  const mb = tangents[segment + 1]!;
  return [0, 1, 2].map((axis) => (2 * t3 - 3 * t2 + 1) * a[axis]!
    + (t3 - 2 * t2 + t) * ma[axis]! + (-2 * t3 + 3 * t2) * b[axis]!
    + (t3 - t2) * mb[axis]!) as V3;
}
function cubicSpeed(points: readonly V3[], tangents: readonly V3[], segment: number, t: number): number {
  const a = points[segment]!;
  const b = points[segment + 1]!;
  const ma = tangents[segment]!;
  const mb = tangents[segment + 1]!;
  const derivative = [0, 1, 2].map((axis) => (6 * t * t - 6 * t) * a[axis]!
    + (3 * t * t - 4 * t + 1) * ma[axis]! + (-6 * t * t + 6 * t) * b[axis]!
    + (3 * t * t - 2 * t) * mb[axis]!) as V3;
  return magnitude(derivative);
}
function cuspRoots(points: readonly V3[], tangents: readonly V3[], segment: number): number[] {
  const a = points[segment]!;
  const b = points[segment + 1]!;
  const ma = tangents[segment]!;
  const mb = tangents[segment + 1]!;
  const coefficients = [0, 1, 2].map((axis) => [
    3 * (2 * a[axis]! - 2 * b[axis]! + ma[axis]! + mb[axis]!),
    2 * (-3 * a[axis]! + 3 * b[axis]! - 2 * ma[axis]! - mb[axis]!), ma[axis]!,
  ] as V3);
  let dominant = coefficients[0]!;
  let coefficientScale = 0;
  for (const coefficient of coefficients) {
    const scale = Math.max(...coefficient.map(Math.abs));
    if (scale > coefficientScale) { coefficientScale = scale; dominant = coefficient; }
  }
  if (coefficientScale === 0) return [];
  const [qa, qb, qc] = dominant.map((n) => n / coefficientScale) as V3;
  const candidates: number[] = [];
  if (qa === 0) {
    if (qb !== 0) candidates.push(-qc / qb);
  } else {
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant === 0) candidates.push(-qb / (2 * qa));
    else if (discriminant > 0) {
      const q = -0.5 * (qb + (qb >= 0 ? 1 : -1) * Math.sqrt(discriminant));
      if (q === 0) candidates.push(-qb / (2 * qa));
      else candidates.push(q / qa, qc / q);
    }
  }
  return candidates.filter((t) => Number.isFinite(t) && t > 0 && t < 1
    && coefficients.every(([x, y, z]) => Math.abs((x * t + y) * t + z)
      <= SHOT_CUSP_RESIDUAL_ADAPTATION * coefficientScale))
    .sort((left, right) => left - right).filter((t, i, roots) => i === 0 || t !== roots[i - 1]);
}
function slerp(a: V3, b: V3, t: number): V3 {
  const cosine = Math.max(-1, Math.min(1, dot(a, b)));
  if (cosine > 1 - SHOT_DIRECTION_EPSILON_ADAPTATION) return unit(lerp(a, b, t));
  let tangent = sub(b, scaleBy(a, cosine));
  if (magnitude(tangent) <= SHOT_DIRECTION_EPSILON_ADAPTATION) {
    // Product camera convention: world +Y is up. A horizontal turn-around stays horizontal.
    // Exactly vertical directions have no yaw plane; break that tie toward projected world +X.
    tangent = [a[2], 0, -a[0]];
    if (magnitude(tangent) <= SHOT_DIRECTION_EPSILON_ADAPTATION) {
      const basis: V3 = [1, 0, 0];
      tangent = sub(basis, scaleBy(a, dot(a, basis)));
    }
  }
  const perpendicular = unit(tangent);
  const angle = Math.acos(cosine);
  const left = Math.cos(t * angle);
  const right = Math.sin(t * angle);
  return unit([a[0] * left + perpendicular[0] * right, a[1] * left + perpendicular[1] * right,
    a[2] * left + perpendicular[2] * right]);
}

export function sampleShot(spec: ShotSpec, elapsedSeconds: number, metersPerUnit: number): ShotPose {
  const findings = checkShot(spec, metersPerUnit);
  if (findings.length) throw new Error(findings[0]!.code);
  if (!Number.isFinite(elapsedSeconds)) throw new Error('camera.TIME');
  // Snapshot validated own data before any iteration. Inherited caller array methods are never executed either.
  const points: ShotPoint[] = [];
  for (let i = 0; i < spec.points.length; i++) {
    const point = spec.points[i]!;
    points.push({ at: copy(point.at), look: copy(point.look) });
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (elapsedSeconds <= 0) return { at: copy(first.at), look: copy(first.look) };
  if (elapsedSeconds >= spec.seconds) return { at: copy(last.at), look: copy(last.look) };
  const stationary = points.every((p) => p.at.every((coordinate, axis) => coordinate === first.at[axis]));
  if (stationary && points.every((p) => p.look.every((coordinate, axis) => coordinate === first.look[axis]))) {
    return { at: copy(first.at), look: copy(first.look) };
  }

  // Normalize coordinates for finite cubic/chord arithmetic. This is local scratch, never caller state.
  let coordinateScale = 0;
  for (const point of points) for (const v of [point.at, point.look]) {
    for (const coordinate of v) coordinateScale = Math.max(coordinateScale, Math.abs(coordinate));
  }
  coordinateScale ||= 1;
  const positions = points.map((p) => p.at.map((coordinate) => coordinate / coordinateScale) as V3);
  const lookOffsets = points.map((p, i) => sub(p.look.map((coordinate) => coordinate / coordinateScale) as V3, positions[i]!));
  const directions = lookOffsets.map(unit);
  const lookLengths = lookOffsets.map(magnitude);
  const samePoint = points.slice(1).map((point, i) => magnitude(sub(point.at, points[i]!.at)) < CAMERA_SAME_POINT_UNITS_ADAPTATION);
  const tangents = positions.map((p, i) => {
    // Zero both shared tangents beside a near-repeat, without snapping either authored eye position.
    if (samePoint[i - 1] || samePoint[i]) return [0, 0, 0] as V3;
    if (i === 0) return sub(positions[1]!, p);
    if (i === positions.length - 1) return sub(p, positions[i - 1]!);
    return scaleBy(sub(positions[i + 1]!, positions[i - 1]!), 0.5);
  });
  const legs = positions.slice(1).flatMap((_, segment) => {
    const near = samePoint[segment]!;
    const fixed = positions[segment]!.every((n, axis) => n === positions[segment + 1]![axis])
      && tangents[segment]!.every((n) => n === 0) && tangents[segment + 1]!.every((n) => n === 0);
    const a = directions[segment]!;
    const b = directions[segment + 1]!;
    // Normalizing the same facing at different target distances can differ by a rounding bit.
    const angle = magnitude(sub(a, b)) <= SHOT_DIRECTION_EPSILON_ADAPTATION
      ? 0 : Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    const angularWeight = angle * CAMERA_PAN_METRES_PER_RADIAN_ADAPTATION / metersPerUnit / coordinateScale;
    if (!Number.isFinite(angularWeight) || (angle > 0 && !(angularWeight > 0))) throw new Error('camera.NUMERICAL_GEOMETRY');
    // Quadratic derivative roots bound this to at most three pieces. No sampled-node cusp search.
    // A near-repeat has zero end tangents and is a straight monotone Hermite leg: no interior cusp.
    const boundaries = [0, ...(near || fixed ? [] : cuspRoots(positions, tangents, segment)), 1];
    const pieces = boundaries.slice(1).map((end, piece) => {
      const start = boundaries[piece]!;
      const width = end - start;
      const cuspStart = start > 0 || tangents[segment]!.every((n) => n === 0);
      const cuspEnd = end < 1 || tangents[segment + 1]!.every((n) => n === 0);
      const distances = [0];
      const speeds = [cuspStart ? 0 : cubicSpeed(positions, tangents, segment, start) * width];
      if (!fixed) {
        for (let step = 1; step <= SHOT_ARC_STEPS_ADAPTATION; step++) {
          const speed = step === SHOT_ARC_STEPS_ADAPTATION && cuspEnd ? 0
            : cubicSpeed(positions, tangents, segment, start + width * step / SHOT_ARC_STEPS_ADAPTATION) * width;
          distances.push(distances[distances.length - 1]! + (speeds[speeds.length - 1]! + speed) / (2 * SHOT_ARC_STEPS_ADAPTATION));
          speeds.push(speed);
        }
      }
      const length = distances[distances.length - 1]!;
      const directionChanges = angle * width > SHOT_DIRECTION_EPSILON_ADAPTATION;
      const pan = near && angle > 0;
      const weight = length;
      return { distances, speeds, length, pan, fixed, weight, segment, start, width, cuspStart, cuspEnd, directionChanges };
    });
    let spatialWeight = 0;
    for (const piece of pieces) spatialWeight += piece.length;
    // The authored leg gets max(spatial, angular) ONCE. Internal cusp pieces share that budget;
    // an angular-heavy leg divides it by authored parameter span, never repeats the full turn budget.
    if (angularWeight > spatialWeight) for (const piece of pieces) piece.weight = angularWeight * piece.width;
    return pieces;
  });
  const cumulative = [0];
  for (const leg of legs) {
    const next = cumulative[cumulative.length - 1]! + leg.weight;
    if (!Number.isFinite(next)) throw new Error('camera.NUMERICAL_GEOMETRY');
    // A direction change must never disappear with its unrepresentable timing interval.
    if (next === cumulative[cumulative.length - 1] && leg.directionChanges) throw new Error('camera.NUMERICAL_GEOMETRY');
    // An arc too small to change this floating-point sum has no representable timeline interval.
    // Skip its search weight instead of refusing an admitted path; authored endpoint returns stay exact.
    if (leg.weight > 0 && next === cumulative[cumulative.length - 1]) leg.weight = 0;
    cumulative.push(next);
  }
  const linear = elapsedSeconds / spec.seconds;
  const progress = linear * linear * (3 - 2 * linear); // One global eased start and finish.
  if (progress <= 0) return { at: copy(first.at), look: copy(first.look) };
  if (progress >= 1) return { at: copy(last.at), look: copy(last.look) };
  const total = cumulative[cumulative.length - 1]!;
  let segment: number;
  let t: number;
  if (total === 0) {
    // All eyes and directions coincide. Only target distance can differ; it has no camera rotation.
    const parameter = progress * (positions.length - 1);
    segment = Math.min(positions.length - 2, Math.floor(parameter));
    t = parameter - segment;
  } else {
    const target = progress * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if (cumulative[middle]! <= target) low = middle;
      else high = middle;
    }
    segment = low;
    while (segment > 0 && legs[segment]!.weight === 0) segment--;
    const leg = legs[segment]!;
    const fraction = (target - cumulative[segment]!) / leg.weight;
    if (leg.pan) {
      t = fraction;
    } else {
      let previous = segment - 1;
      let next = segment + 1;
      while (previous >= 0 && legs[previous]!.weight === 0) previous--;
      while (next < legs.length && legs[next]!.weight === 0) next++;
      const rate = leg.length / leg.weight;
      if (!(rate > 0)) throw new Error('camera.NUMERICAL_GEOMETRY');
      const sharedSlope = (other: number, cusp: boolean): number => {
        if (cusp || (other >= 0 && other < legs.length && legs[other]!.pan)) return 0;
        if (other < 0 || other >= legs.length) return 1;
        const neighbour = legs[other]!;
        return Math.min(rate, neighbour.length / neighbour.weight) / rate;
      };
      const startSlope = sharedSlope(previous, leg.cuspStart);
      const endSlope = sharedSlope(next, leg.cuspEnd);
      // CAM adaptation: adjacent legs share the smaller positive spatial/weighted-time rate.
      // Dividing by this leg's own rate gives Hermite slopes in [0,1], hence a monotone arc timeline.
      // Only intentional pans and genuine zero-speed cusps stop; ordinary weighted joins remain C1/nonzero.
      const arcFraction = (startSlope + endSlope - 2) * fraction ** 3
        + (3 - 2 * startSlope - endSlope) * fraction ** 2 + startSlope * fraction;
      const distanceTarget = arcFraction * leg.length;
      let arcLow = 0;
      let arcHigh = leg.distances.length - 1;
      while (arcHigh - arcLow > 1) {
        const middle = (arcLow + arcHigh) >>> 1;
        if (leg.distances[middle]! < distanceTarget) arcLow = middle;
        else arcHigh = middle;
      }
      // Invert the exact integral of the interval's linear speed, not a linear chord length.
      // Scaling speed first avoids squaring tiny/large raw values in the quadratic discriminant.
      const speedScale = Math.max(leg.speeds[arcLow]!, leg.speeds[arcHigh]!);
      const startSpeed = speedScale > 0 ? leg.speeds[arcLow]! / speedScale : 0;
      const endSpeed = speedScale > 0 ? leg.speeds[arcHigh]! / speedScale : 0;
      const y = speedScale > 0 ? (distanceTarget - leg.distances[arcLow]!) / speedScale * SHOT_ARC_STEPS_ADAPTATION : 0;
      const denominator = startSpeed + Math.sqrt(Math.max(0, startSpeed * startSpeed + 2 * (endSpeed - startSpeed) * y));
      const within = denominator > 0 ? Math.max(0, Math.min(1, 2 * y / denominator)) : 0;
      t = (arcLow + within) / SHOT_ARC_STEPS_ADAPTATION;
    }
  }
  const leg = legs[segment]!;
  const curveSegment = leg.segment;
  t = leg.start + leg.width * t;
  const at = leg.fixed ? positions[curveSegment]! : cubic(positions, tangents, curveSegment, t);
  const facing = slerp(directions[curveSegment]!, directions[curveSegment + 1]!, t);
  // Positive endpoint target distances interpolate independently of the spherical direction arc.
  const targetDistance = lookLengths[curveSegment]! * (1 - t) + lookLengths[curveSegment + 1]! * t;
  const look: V3 = [at[0] + facing[0] * targetDistance, at[1] + facing[1] * targetDistance, at[2] + facing[2] * targetDistance];
  const pose = { at: leg.fixed ? copy(points[curveSegment]!.at) : scaleBy(at, coordinateScale), look: scaleBy(look, coordinateScale) };
  if (![...pose.at, ...pose.look].every(Number.isFinite) || pose.at.every((v, i) => v === pose.look[i])) {
    throw new Error('camera.NUMERICAL_GEOMETRY');
  }
  return pose;
}
