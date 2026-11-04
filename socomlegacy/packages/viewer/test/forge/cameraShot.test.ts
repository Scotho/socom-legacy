import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_SCHEMA, DIAGNOSTIC_VERSION } from '@s2u/creator-contracts';
import {
  checkShot, sampleShot, shotLength,
  type ShotPoint, type ShotPose, type ShotSpec, type ShotVector,
} from '../../src/forge/camera/shot.js';

// Synthetic product-adaptation fixtures: no disc, original camera or rendered-motion claim.
// Every ordinary sample/check explicitly injects a 0.1 metres-per-world-unit retail-shaped fixture scale.
// This test value is not a sampler default; the page must inject its actual per-map scale.
const point = (at: ShotVector, direction: ShotVector = [0, 0, -1]): ShotPoint => ({
  at, look: [at[0] + direction[0], at[1] + direction[1], at[2] + direction[2]],
});
const straight = (): ShotSpec => ({
  points: [point([10, 3, 5], [0, 0, -7]), point([30, 8, -4], [4, 0, 0])], seconds: 10,
});
const distance = (a: ShotVector, b: ShotVector): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const direction = (pose: ShotPose): number[] => {
  const delta = pose.look.map((value, axis) => value - pose.at[axis]!);
  const length = Math.hypot(...delta);
  return delta.map((value) => value / length);
};
function expectPoseFinite(pose: ShotPose): void {
  expect(pose.at).toHaveLength(3);
  expect(pose.look).toHaveLength(3);
  expect([...pose.at, ...pose.look].every(Number.isFinite)).toBe(true);
  expect(distance(pose.at, pose.look)).toBeGreaterThan(0);
}
function expectVectorNear(actual: readonly number[], expected: readonly number[], tolerance = 1e-8): void {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index]!)).toBeLessThanOrEqual(tolerance));
}
function expectRefusal(value: unknown): void {
  const findings = checkShot(value, 0.1);
  expect(findings.length).toBeGreaterThan(0);
  expect(findings.some((finding) => finding.severity === 'error')).toBe(true);
  for (const finding of findings) {
    expect(finding).toMatchObject({ schema: DIAGNOSTIC_SCHEMA, version: DIAGNOSTIC_VERSION, source: 'check' });
    expect(finding.code).toMatch(/^camera\./);
    expect(finding.text.trim().length).toBeGreaterThan(0);
    expect(finding.evidence).not.toBe('rendered-browser-run');
  }
  expect(() => sampleShot(value as ShotSpec, 0, 0.1)).toThrow();
  expect(() => shotLength(value as ShotSpec)).toThrow();
}

describe('cinematic shot validation, a Forge instrument adaptation', () => {
  it.each([
    ['missing', undefined], ['zero', 0], ['negative', -0.1], ['NaN', NaN],
    ['positive infinity', Infinity], ['negative infinity', -Infinity], ['string', '0.1'], ['null', null],
  ])('requires an explicit positive finite map scale: %s', (label, metersPerUnit) => {
    const spec = straight();
    const checkArgs = label === 'missing' ? [spec] : [spec, metersPerUnit];
    const sampleArgs = label === 'missing' ? [spec, 0] : [spec, 0, metersPerUnit];
    const findings = Reflect.apply(checkShot, undefined, checkArgs) as ReturnType<typeof checkShot>;
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((finding) => finding.severity === 'error')).toBe(true);
    for (const finding of findings) {
      expect(finding).toMatchObject({ schema: DIAGNOSTIC_SCHEMA, version: DIAGNOSTIC_VERSION, source: 'check' });
      expect(finding.code).toMatch(/^camera\./);
    }
    expect(() => Reflect.apply(sampleShot, undefined, sampleArgs)).toThrow();
    // Total authored duration is a time-only helper, independent of the injected map scale.
    expect(shotLength(spec)).toBe(10);
  });

  it('accepts a valid shot through validation, duration and initial sampling without throwing', () => {
    const spec = straight();
    expect(() => {
      checkShot(spec, 0.1);
      shotLength(spec);
      sampleShot(spec, 0, 0.1);
    }).not.toThrow();
  });

  it('admits finite world look-at points, including a stationary pan and repeated eye positions', () => {
    expect(checkShot(straight(), 0.1)).toEqual([]);
    expect(checkShot({ points: [{ at: [4, 5, 6], look: [0, 0, 0] }, point([7, 8, 9])], seconds: 2 }, 0.1)).toEqual([]);
    expect(checkShot({ points: [point([4, 5, 6]), point([4, 5, 6], [1, 0, 0])], seconds: 2 }, 0.1)).toEqual([]);
    expect(checkShot({ points: [point([0, 0, 0]), point([0, 0, 0]), point([2, 0, 0])], seconds: 2 }, 0.1)).toEqual([]);
  });

  it.each([
    { points: 2, seconds: 1, hold: 0 },
    { points: 64, seconds: 120, hold: 10 },
  ])('admits inclusive authored limits: $points points / $seconds seconds / $hold hold', ({ points, seconds, hold }) => {
    const spec = { points: Array.from({ length: points }, (_, i) => point([i, 0, 0])), seconds, hold };
    expect(checkShot(spec, 0.1)).toEqual([]);
    expect(shotLength(spec)).toBe(seconds + hold);
  });

  it.each([
    ['null', null], ['array', []], ['string', 'shot'], ['empty', {}],
    ['one point', { ...straight(), points: [point([0, 0, 0])] }],
    ['too many points', { ...straight(), points: Array.from({ length: 65 }, (_, i) => point([i, 0, 0])) }],
    ['non-array points', { ...straight(), points: {} }],
    ['null point', { ...straight(), points: [null, point([0, 0, 0])] }],
    ['short vector', { ...straight(), points: [{ at: [0, 0], look: [0, 0, -1] }, point([2, 0, 0])] }],
    ['long vector', { ...straight(), points: [{ at: [0, 0, 0, 1], look: [0, 0, -1] }, point([2, 0, 0])] }],
    ['string coordinate', { ...straight(), points: [{ at: ['0', 0, 0], look: [0, 0, -1] }, point([2, 0, 0])] }],
    ['missing look', { ...straight(), points: [{ at: [0, 0, 0] }, point([2, 0, 0])] }],
    ['unknown top-level field', { ...straight(), roll: 10 }],
    ['unknown point field', { ...straight(), points: [{ ...point([0, 0, 0]), fov: 90 }, point([2, 0, 0])] }],
    ['duration below limit', { ...straight(), seconds: 0.99 }],
    ['duration above limit', { ...straight(), seconds: 120.01 }],
    ['string duration', { ...straight(), seconds: '10' }],
    ['negative hold', { ...straight(), hold: -0.01 }],
    ['hold above limit', { ...straight(), hold: 10.01 }],
    ['string hold', { ...straight(), hold: '0' }],
    ['zero world look displacement', { points: [{ at: [4, 5, 6], look: [4, 5, 6] }, point([7, 8, 9])], seconds: 2 }],
  ])('refuses malformed input: %s', (_label, value) => expectRefusal(value));

  it.each([NaN, Infinity, -Infinity])('refuses nonfinite numbers (%s) in every numeric input', (bad) => {
    expectRefusal({ ...straight(), seconds: bad });
    expectRefusal({ ...straight(), hold: bad });
    for (const field of ['at', 'look'] as const) {
      for (let axis = 0; axis < 3; axis++) {
        const values = [1, 2, 3];
        values[axis] = bad;
        expectRefusal({ points: [{ ...point([0, 0, 0]), [field]: values }, point([2, 0, 0])], seconds: 2 });
      }
    }
  });

  it('does not mutate unknown input while validating it', () => {
    const spec = straight();
    spec.points.forEach((p) => { Object.freeze(p.at); Object.freeze(p.look); Object.freeze(p); });
    Object.freeze(spec.points);
    Object.freeze(spec);
    expect(checkShot(spec, 0.1)).toEqual([]);
  });

  it.each(['extra', 'every', 'map', 'iterator', 'symbol'])('refuses unknown own points-array fields: %s', (field) => {
    const points = [...straight().points];
    const key = field === 'iterator' ? Symbol.iterator : field === 'symbol' ? Symbol('extra') : field;
    Object.defineProperty(points, key, {
      value: field === 'extra' || field === 'symbol' ? 1 : () => { throw new Error('An authored array override must never run.'); },
      enumerable: true,
    });
    expectRefusal({ ...straight(), points });
  });
});

describe('elapsed-time shot sampling', () => {
  it('preserves exact non-origin first and last world targets, including their non-unit distance', () => {
    const spec = straight();
    expect(sampleShot(spec, 0, 0.1)).toEqual(spec.points[0]);
    expect(sampleShot(spec, 10, 0.1)).toEqual(spec.points[1]);
  });

  it('clamps finite elapsed times and holds the final pose for the requested total duration', () => {
    const spec = { ...straight(), hold: 3 };
    expect(shotLength(spec)).toBe(13);
    expect(shotLength(straight())).toBe(10);
    expect(sampleShot(spec, -100, 0.1)).toEqual(spec.points[0]);
    for (const time of [10, 10.1, 12.99, 13, 100]) expect(sampleShot(spec, time, 0.1)).toEqual(spec.points[1]);
  });

  it.each([NaN, Infinity, -Infinity])('fails closed for nonfinite elapsed time %s', (time) => {
    expect(() => sampleShot(straight(), time, 0.1)).toThrow();
  });

  it('fails closed when sampling or measuring an invalid shot', () => {
    const bad = { ...straight(), seconds: 0 };
    expect(() => sampleShot(bad, 0, 0.1)).toThrow();
    expect(() => shotLength(bad)).toThrow();
  });

  it('returns owned vectors at endpoints and interior times, without mutating frozen inputs', () => {
    const spec = straight();
    const before = JSON.stringify(spec);
    spec.points.forEach((p) => { Object.freeze(p.at); Object.freeze(p.look); Object.freeze(p); });
    Object.freeze(spec.points);
    Object.freeze(spec);
    for (const t of [0, 4, 10]) {
      const a = sampleShot(spec, t, 0.1);
      const b = sampleShot(spec, t, 0.1);
      expect(a).not.toBe(b);
      expect(a.at).not.toBe(b.at);
      expect(a.look).not.toBe(b.look);
      spec.points.forEach((p) => { expect(a.at).not.toBe(p.at); expect(a.look).not.toBe(p.look); });
      a.at[0] = 900;
      a.look[0] = 901;
      expect(sampleShot(spec, t, 0.1)).toEqual(b);
    }
    expect(JSON.stringify(spec)).toBe(before);
  });

  it('does not serve stale cached geometry after a caller edits the same mutable specification', () => {
    const spec = { points: [{ at: [0, 0, 0], look: [0, 0, -1] }, { at: [10, 0, 0], look: [10, 0, -1] }], seconds: 10 };
    const before = sampleShot(spec as unknown as ShotSpec, 5, 0.1);
    spec.points[1]!.at[0] = 20;
    spec.points[1]!.look[0] = 20;
    const freshEditedSpec = JSON.parse(JSON.stringify(spec)) as ShotSpec;
    const edited = sampleShot(spec as unknown as ShotSpec, 5, 0.1);
    expect(edited).toEqual(sampleShot(freshEditedSpec, 5, 0.1));
    expect(edited.at).not.toEqual(before.at);
    expect(sampleShot(spec as unknown as ShotSpec, 10, 0.1).at).toEqual([20, 0, 0]);
    spec.points[1]!.look = [...spec.points[1]!.at];
    expect(() => sampleShot(spec as unknown as ShotSpec, 5, 0.1)).toThrow();
  });

  it('produces the same poses at equal elapsed time after 30, 60, 144 Hz and uneven presentation histories', () => {
    const spec = { ...straight(), hold: 2 };
    const targets = [0, 1.25, 5, 9.5, 11];
    const reference = targets.map((t) => sampleShot(spec, t, 0.1));
    const histories = [
      Array.from({ length: 360 }, (_, i) => i / 30),
      Array.from({ length: 720 }, (_, i) => i / 60),
      Array.from({ length: 1728 }, (_, i) => i / 144),
      [0, 0.001, 0.2, 0.201, 1.7, 4, 4.001, 8.9, 12, 3, 0],
    ];
    for (const history of histories) {
      history.forEach((t) => expectPoseFinite(sampleShot(spec, t, 0.1)));
      targets.forEach((t, i) => expect(sampleShot(spec, t, 0.1)).toEqual(reference[i]));
    }
  });
});

describe('continuous position and shortest orientation paths', () => {
  it.each([1e-14, 0.0005, 0.000999])('treats a near-repeat eye separation of %s world units as one stop without moving either authored point', (delta) => {
    const second = 10 + delta;
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([10, 0, 0]), point([second, 0, 0], [1, 0, 0]), point([20 + delta, 0, 0], [1, 0, 0])], seconds: 10,
    };
    expect(checkShot(spec, 0.1)).toEqual([]);
    let previousX = 0;
    for (let i = 0; i <= 200; i++) {
      const pose = sampleShot(spec, i / 20, 0.1);
      expectPoseFinite(pose);
      expect(pose.at[0]).toBeGreaterThanOrEqual(previousX - 1e-8);
      previousX = pose.at[0];
      const facing = direction(pose);
      if (facing[0]! > 1e-6 && facing[2]! < -1e-6) {
        expect(pose.at[0]).toBeGreaterThanOrEqual(10 - 1e-10);
        expect(pose.at[0]).toBeLessThanOrEqual(second + 1e-10);
      }
    }
    // The endpoints remain distinct authored values: the near-repeat rule must not snap/replace them.
    const atFacing = (angle: number): ShotPose => {
      let low = 0;
      let high = 10;
      for (let i = 0; i < 60; i++) {
        const middle = (low + high) / 2;
        const facing = direction(sampleShot(spec, middle, 0.1));
        if (Math.atan2(facing[0]!, -facing[2]!) < angle) low = middle;
        else high = middle;
      }
      return sampleShot(spec, high, 0.1);
    };
    expectVectorNear(atFacing(1e-9).at, [10, 0, 0], 1e-10);
    expectVectorNear(atFacing(Math.PI / 2 - 1e-9).at, [second, 0, 0], 1e-10);
    for (const time of [4, 5, 6]) {
      const facing = direction(sampleShot(spec, time, 0.1));
      expect(facing[0]).toBeGreaterThan(0.01);
      expect(facing[2]).toBeLessThan(-0.01);
    }
  });

  it.each([0.001, 0.001001])('keeps the %s world-unit threshold boundary outside near-repeat stop classification', (delta) => {
    // Put the threshold chord at zero so subtraction cannot round 10 + .001 below the literal boundary.
    const spec: ShotSpec = { points: [point([-5, 0, 0]), point([0, 0, 0]), point([delta, 0, 0]), point([5 + delta, 0, 0])], seconds: 10 };
    let low = 0;
    let high = 5;
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2;
      if (sampleShot(spec, middle, 0.1).at[0] < 0) low = middle;
      else high = middle;
    }
    const join = (low + high) / 2;
    const h = 1e-7;
    const center = sampleShot(spec, join, 0.1).at;
    const before = sampleShot(spec, join - h, 0.1).at;
    const after = sampleShot(spec, join + h, 0.1).at;
    expect(Math.abs(center[0])).toBeLessThan(1e-8);
    expect(distance(before, center) / h).toBeGreaterThan(0.1);
    expect(distance(center, after) / h).toBeGreaterThan(0.1);
  });

  it('allocates angular time to a short translating turn so a ninety-degree turn cannot collapse into one frame', () => {
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([10, 0, 0]), point([10.1, 0, 0], [1, 0, 0]), point([20.1, 0, 0], [1, 0, 0])], seconds: 10,
    };
    let previous = sampleShot(spec, 0, 0.1);
    for (let frame = 1; frame <= 600; frame++) {
      const pose = sampleShot(spec, frame / 60, 0.1);
      expectPoseFinite(pose);
      expect(distance(direction(previous) as [number, number, number], direction(pose) as [number, number, number])).toBeLessThan(0.05);
      previous = pose;
    }
    for (const time of [4, 5, 6]) {
      const facing = direction(sampleShot(spec, time, 0.1));
      expect(facing[0]).toBeGreaterThan(0.01);
      expect(facing[2]).toBeLessThan(-0.01);
    }
    // The authored middle leg has two internal reversal cusps but only ONE pi-metre angular budget.
    // At global progress .104/.896 these times are in the outer legs; assigning the budget per cusp
    // piece would incorrectly keep the turn active at one or both samples.
    expectVectorNear(direction(sampleShot(spec, 2, 0.1)), [0, 0, -1], 1e-8);
    expectVectorNear(direction(sampleShot(spec, 8, 0.1)), [1, 0, 0], 1e-8);
  });

  it('matches nonzero ordinary-join velocity between angular-heavy and spatial-heavy moving legs', () => {
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([10, 0, 0]), point([11, 1, 0], [1, 0, 0]), point([21, 1, 0], [1, 0, 0])], seconds: 10,
    };
    const boundary = (y: number, start: number, end: number): number => {
      let low = start;
      let high = end;
      for (let i = 0; i < 60; i++) {
        const middle = (low + high) / 2;
        if (sampleShot(spec, middle, 0.1).at[1] < y) low = middle;
        else high = middle;
      }
      return (low + high) / 2;
    };
    const entry = boundary(0, 0.001, 5);
    const exit = boundary(1, 5, 9.999);
    expect(exit - entry).toBeGreaterThan(4);
    for (const join of [entry, exit]) {
      const center = sampleShot(spec, join, 0.1).at;
      for (const h of [1e-4, 5e-5, 2.5e-5]) {
        const before = sampleShot(spec, join - h, 0.1).at;
        const after = sampleShot(spec, join + h, 0.1).at;
        const incoming = center.map((n, i) => (n - before[i]!) / h);
        const outgoing = after.map((n, i) => (n - center[i]!) / h);
        const speed = Math.max(Math.hypot(...incoming), Math.hypot(...outgoing));
        expect(Math.min(Math.hypot(...incoming), Math.hypot(...outgoing))).toBeGreaterThan(0.01);
        expect(distance(incoming as [number, number, number], outgoing as [number, number, number]) / speed).toBeLessThan(0.02);
      }
    }
  });

  it('keeps a natural two-point stop-and-turn stationary and gives its pan the agreed metre weight', () => {
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([5, 0, 0]), point([5, 0, 0], [1, 0, 0]), point([10, 0, 0], [1, 0, 0])],
      seconds: 10,
    };
    expect(checkShot(spec, 0.1)).toEqual([]);
    let previousX = 0;
    for (let i = 0; i <= 200; i++) {
      const pose = sampleShot(spec, i / 20, 0.1);
      expectPoseFinite(pose);
      expect(pose.at[0]).toBeGreaterThanOrEqual(previousX - 1e-8);
      previousX = pose.at[0];
      const facing = direction(pose);
      if (facing[0]! > 1e-6 && facing[2]! < -1e-6) expectVectorNear(pose.at, [5, 0, 0], 1e-8);
    }
    // The 90-degree pan weighs pi metres beside just one metre of translation, so both t=3 and t=7
    // are inside it under the single global ease. Equal chords must not create a translational loop.
    for (const time of [3, 5, 7]) {
      const pose = sampleShot(spec, time, 0.1);
      expectVectorNear(pose.at, [5, 0, 0], 1e-8);
      expect(direction(pose)[0]).toBeGreaterThan(0);
      expect(direction(pose)[2]).toBeLessThan(0);
    }
  });

  it('keeps C1 translation at the natural stop-and-turn entry and exit', () => {
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([5, 0, 0]), point([5, 0, 0], [1, 0, 0]), point([10, 0, 0], [1, 0, 0])], seconds: 10,
    };
    const boundary = (angle: number): number => {
      let low = 0;
      let high = 10;
      for (let i = 0; i < 50; i++) {
        const middle = (low + high) / 2;
        const facing = direction(sampleShot(spec, middle, 0.1));
        if (Math.atan2(facing[0]!, -facing[2]!) < angle) low = middle;
        else high = middle;
      }
      return high;
    };
    const entry = boundary(1e-9);
    const exit = boundary(Math.PI / 2 - 1e-9);
    expect(exit - entry).toBeGreaterThan(5);
    for (const [time, side] of [[entry, -1], [exit, 1]] as const) {
      const at = sampleShot(spec, time, 0.1).at;
      const speeds = [0.01, 0.005, 0.0025].map((h) => distance(at, sampleShot(spec, time + side * h, 0.1).at) / h);
      expect(speeds[1]!).toBeLessThan(speeds[0]! * 0.75);
      expect(speeds[2]!).toBeLessThan(speeds[1]! * 0.75);
    }
  });

  it('samples admitted near-coincident points without numerical-geometry exceptions', () => {
    for (const xs of [[0, 1, 1 + 1e-14, 2], [0, 10, 10 + 1e-14, 20], [0, 1, 1, 1 + 1e-14, 1 + 1e-14, 2]]) {
      const spec: ShotSpec = { points: xs.map((x) => point([x, 0, 0])), seconds: 10 };
      expect(checkShot(spec, 0.1)).toEqual([]);
      for (const time of [1, 3, 5, 7, 9]) {
        expect(() => expectPoseFinite(sampleShot(spec, time, 0.1))).not.toThrow();
      }
    }
  });

  it('never silently skips a large pan angle when its virtual timing interval is unrepresentable', () => {
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([5, 0, 0]), point([5, 0, 0], [1, 0, 0]), point([10, 0, 0], [1, 0, 0])], seconds: 10,
    };
    expect(checkShot(spec, 1e20)).toEqual([]);
    const attempts = [4.999999, 5, 5.000001].map((time) => {
      try { return { ok: true as const, pose: sampleShot(spec, time, 1e20) }; }
      catch (error) { return { ok: false as const, error }; }
    });
    // Capture sampling errors only. An explicit numerical refusal is allowed by the extreme-scale qualification;
    // assertions stay outside the catch so a hidden direction jump cannot accidentally become an accepted refusal.
    const failures = attempts.filter((attempt) => !attempt.ok);
    if (failures.length) {
      for (const failure of failures) {
        if (failure.ok) continue;
        expect(failure.error).toBeInstanceOf(Error);
        expect((failure.error as Error).message).toBe('camera.NUMERICAL_GEOMETRY');
      }
      return;
    }
    let previous: ShotPose | undefined;
    for (const attempt of attempts) {
      if (!attempt.ok) continue;
      expectPoseFinite(attempt.pose);
      for (const p of spec.points) { expect(attempt.pose.at).not.toBe(p.at); expect(attempt.pose.look).not.toBe(p.look); }
      if (previous) {
        expect(attempt.pose.at).not.toBe(previous.at);
        expect(attempt.pose.look).not.toBe(previous.look);
        expect(distance(direction(previous) as [number, number, number], direction(attempt.pose) as [number, number, number])).toBeLessThan(0.05);
      }
      previous = attempt.pose;
    }
  });

  it('accepts an ordinary stationary shot whose same facing uses different world-target distances', () => {
    const spec: ShotSpec = {
      points: [{ at: [0, 0, 0], look: [0.6, 0.8, 0] }, { at: [0, 0, 0], look: [6, 8, 0] }], seconds: 4,
    };
    expect(checkShot(spec, 0.1)).toEqual([]);
    const poses: ShotPose[] = [];
    expect(() => {
      for (const time of [0, 0.01, 1, 2, 3.99, 4]) poses.push(sampleShot(spec, time, 0.1));
    }).not.toThrow();
    expect(poses[0]).toEqual(spec.points[0]);
    expect(poses[poses.length - 1]).toEqual(spec.points[1]);
    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i]!;
      expectPoseFinite(pose);
      expectVectorNear(direction(pose), [0.6, 0.8, 0], 1e-12);
      expect(pose.at).toEqual([0, 0, 0]);
      for (const p of spec.points) { expect(pose.at).not.toBe(p.at); expect(pose.look).not.toBe(p.look); }
      if (i > 0) {
        expect(pose.at).not.toBe(poses[i - 1]!.at);
        expect(pose.look).not.toBe(poses[i - 1]!.look);
        expectVectorNear(direction(pose), direction(poses[i - 1]!), 1e-12);
      }
    }
  });

  it('keeps a horizontal 180-degree turnaround horizontal rather than pitching through world up', () => {
    const spec: ShotSpec = { points: [point([4, 5, 6], [1, 0, 0]), point([4, 5, 6], [-1, 0, 0])], seconds: 4 };
    let previous = sampleShot(spec, 0, 0.1);
    for (let i = 1; i <= 200; i++) {
      const pose = sampleShot(spec, i / 50, 0.1);
      expectPoseFinite(pose);
      expect(Math.abs(direction(pose)[1]!)).toBeLessThan(1e-8);
      expect(distance(direction(previous) as [number, number, number], direction(pose) as [number, number, number])).toBeLessThan(0.05);
      previous = pose;
    }
  });

  it('supports stationary pans and entirely repeated poses without numerical drift or jumps', () => {
    const at: ShotVector = [4, 5, 6];
    const pan: ShotSpec = { points: [point(at, [0, 0, -3]), point(at, [3, 0, 0])], seconds: 4 };
    let previousAngle = 0;
    for (let i = 0; i <= 80; i++) {
      const pose = sampleShot(pan, i / 20, 0.1);
      expectPoseFinite(pose);
      expect(pose.at).toEqual(at);
      const facing = direction(pose);
      const angle = Math.atan2(facing[0]!, -facing[2]!);
      expect(Math.abs(facing[1]!)).toBeLessThan(1e-8);
      expect(angle).toBeGreaterThanOrEqual(previousAngle - 1e-8);
      expect(angle - previousAngle).toBeLessThan(0.05);
      expect(angle).toBeLessThanOrEqual(Math.PI / 2 + 1e-8);
      previousAngle = angle;
    }
    expectVectorNear(direction(sampleShot(pan, 2, 0.1)), [Math.SQRT1_2, 0, -Math.SQRT1_2], 1e-6);
    expect(direction(sampleShot(pan, 1, 0.1))[0]).toBeGreaterThan(0.01);
    expect(direction(sampleShot(pan, 3, 0.1))[2]).toBeLessThan(-0.01);
    const repeated: ShotSpec = { points: [point(at), point(at), point(at)], seconds: 4 };
    for (const t of [0, 0.1, 1, 2, 3.99, 4]) expect(sampleShot(repeated, t, 0.1)).toEqual(repeated.points[0]);
  });

  it('takes the short orientation arc across 359 to 1 degrees rather than spinning through 180', () => {
    const angle = Math.PI / 180;
    const spec: ShotSpec = {
      points: [point([7, 4, 9], [-Math.sin(angle), 0, -Math.cos(angle)]), point([7, 4, 9], [Math.sin(angle), 0, -Math.cos(angle)])],
      seconds: 4,
    };
    for (let i = 0; i <= 80; i++) {
      const pose = sampleShot(spec, i / 20, 0.1);
      expectPoseFinite(pose);
      expect(direction(pose)[2]).toBeLessThan(-0.999);
    }
    expectVectorNear(direction(sampleShot(spec, 2, 0.1)), [0, 0, -1], 1e-6);
  });

  it('resolves antipodal directions deterministically with a continuous nonzero look displacement', () => {
    const spec: ShotSpec = { points: [point([2, 3, 4], [0, 0, -2]), point([2, 3, 4], [0, 0, 2])], seconds: 4 };
    const samples = Array.from({ length: 401 }, (_, i) => sampleShot(spec, i / 100, 0.1));
    samples.forEach(expectPoseFinite);
    for (let i = 1; i < samples.length; i++) {
      // Quality tolerance is an adaptation: no 180-degree frame discontinuity at the tie.
      expect(distance(direction(samples[i]!) as [number, number, number], direction(samples[i - 1]!) as [number, number, number])).toBeLessThan(0.05);
    }
    sampleShot(spec, 3.7, 0.1);
    expect(sampleShot(spec, 2, 0.1)).toEqual(samples[200]);
    expect(sampleShot(spec, 0, 0.1)).toEqual(spec.points[0]);
    expect(sampleShot(spec, 4, 0.1)).toEqual(spec.points[1]);
  });

  it('crosses an interior waypoint with continuous tangent and nonzero speed instead of restarting an ease', () => {
    // Symmetric equal-length legs put the central waypoint halfway through global travel.
    const spec: ShotSpec = { points: [point([0, 0, 0]), point([10, 10, 0]), point([20, 0, 0])], seconds: 10 };
    const h = 0.001;
    const left = sampleShot(spec, 5 - h, 0.1).at;
    const center = sampleShot(spec, 5, 0.1).at;
    const right = sampleShot(spec, 5 + h, 0.1).at;
    expectVectorNear(center, [10, 10, 0], 0.005);
    const incoming = center.map((v, i) => (v - left[i]!) / h);
    const outgoing = right.map((v, i) => (v - center[i]!) / h);
    const beforeSpeed = Math.hypot(...incoming);
    const afterSpeed = Math.hypot(...outgoing);
    expect(beforeSpeed).toBeGreaterThan(0.5);
    expect(afterSpeed).toBeGreaterThan(0.5);
    const cosine = incoming.reduce((sum, v, i) => sum + v * outgoing[i]!, 0) / (beforeSpeed * afterSpeed);
    expect(cosine).toBeGreaterThan(0.999);
    expect(Math.abs(beforeSpeed - afterSpeed) / beforeSpeed).toBeLessThan(0.02);
  });

  it('preserves ordinary-join velocity when the two adjoining cubic legs have very different chord slopes', () => {
    const spec: ShotSpec = { points: [point([0, 0, 0]), point([100, 0, 0]), point([3.125, 0, 0])], seconds: 10 };
    const x = (time: number): number => sampleShot(spec, time, 0.1).at[0];
    // This one-dimensional path has a single maximum near its middle waypoint. Output-only refinement
    // resolves its tiny overshoot, which a coarse frame grid would miss; it does not reconstruct a LUT.
    let low = 0;
    let high = spec.seconds;
    for (let i = 0; i < 80; i++) {
      const left = low + (high - low) / 3;
      const right = high - (high - low) / 3;
      if (x(left) < x(right)) low = left;
      else high = right;
    }
    const peak = (low + high) / 2;
    low = 0;
    high = peak;
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2;
      if (x(middle) < 100) low = middle;
      else high = middle;
    }
    const join = (low + high) / 2;
    const at = x(join);
    expect(Math.abs(at - 100)).toBeLessThan(1e-8);
    for (const h of [1e-7, 5e-8, 2.5e-8]) {
      const incoming = (at - x(join - h)) / h;
      const outgoing = (x(join + h) - at) / h;
      expect(incoming).toBeGreaterThan(0.01);
      expect(outgoing).toBeGreaterThan(0.01);
      expect(Math.abs(incoming - outgoing) / Math.max(incoming, outgoing)).toBeLessThan(0.05);
    }
  });

  it('brings translation continuously to rest at a genuine reversal cusp instead of instantly reversing velocity', () => {
    const spec: ShotSpec = { points: [point([0, 0, 0]), point([5, 0, 0]), point([0, 0, 0])], seconds: 10 };
    expect(checkShot(spec, 0.1)).toEqual([]);
    for (let i = 0; i <= 100; i++) expectPoseFinite(sampleShot(spec, i / 10, 0.1));
    // Symmetric geometry and the single global eased timeline put the genuine zero-tangent reversal at t=5.
    const at = sampleShot(spec, 5, 0.1).at;
    expectVectorNear(at, [5, 0, 0], 1e-8);
    for (const side of [-1, 1]) {
      const speeds = [0.01, 0.005, 0.0025].map((h) => distance(at, sampleShot(spec, 5 + side * h, 0.1).at) / h);
      expect(speeds[1]!).toBeLessThan(speeds[0]! * 0.75);
      expect(speeds[2]!).toBeLessThan(speeds[1]! * 0.75);
    }
  });

  it('uses approximate distance timing rather than assigning equal time to unequal straight legs', () => {
    const spec: ShotSpec = { points: [point([0, 0, 0]), point([16, 0, 0]), point([17, 0, 0]), point([100, 0, 0])], seconds: 10 };
    const samples = Array.from({ length: 1001 }, (_, i) => sampleShot(spec, i / 100, 0.1).at);
    for (const at of samples) expectVectorNear(at.slice(1), [0, 0]);
    // An equal-time leg parameter would still be on the tiny 16..17 leg at halfway.
    expect(samples[500]![0]).toBeGreaterThan(35);
    expect(samples[500]![0]).toBeLessThan(65);
    const interiorSteps = samples.slice(450, 550).map((p, i) => distance(p, samples[449 + i]!));
    expect(Math.max(...interiorSteps) / Math.min(...interiorSteps)).toBeLessThan(1.2);
    const startStep = distance(samples[0]!, samples[1]!);
    const middleStep = distance(samples[499]!, samples[500]!);
    const endStep = distance(samples[999]!, samples[1000]!);
    expect(startStep).toBeLessThan(middleStep * 0.05);
    expect(endStep).toBeLessThan(middleStep * 0.05);
  });

  it('keeps repeated intermediate eye positions finite and locally continuous', () => {
    const spec: ShotSpec = {
      points: [point([0, 0, 0]), point([5, 2, 0]), point([5, 2, 0]), point([10, 0, 0])], seconds: 10,
    };
    let previous = sampleShot(spec, 0, 0.1);
    for (let i = 1; i <= 1000; i++) {
      const pose = sampleShot(spec, i / 100, 0.1);
      expectPoseFinite(pose);
      expect(distance(previous.at, pose.at)).toBeLessThan(0.2);
      previous = pose;
    }
    expect(previous).toEqual(spec.points[3]);
  });

  it('does not skip an orientation change on a zero-distance leg within an otherwise moving shot', () => {
    // The central identical-eye leg has identical-eye neighbours on both sides, hence zero cubic tangents.
    // Its look targets still differ. Assert continuity without choosing how that pan receives elapsed time.
    const spec: ShotSpec = {
      points: [
        point([0, 0, 0]), point([5, 0, 0]), point([5, 0, 0]),
        point([5, 0, 0], [1, 0, 0]), point([5, 0, 0], [1, 0, 0]), point([10, 0, 0], [1, 0, 0]),
      ],
      seconds: 10,
    };
    let previous = sampleShot(spec, 0, 0.1);
    for (let i = 1; i <= 1000; i++) {
      const pose = sampleShot(spec, i / 100, 0.1);
      expectPoseFinite(pose);
      expect(distance(previous.at, pose.at)).toBeLessThan(0.2);
      expect(distance(direction(previous) as [number, number, number], direction(pose) as [number, number, number])).toBeLessThan(0.05);
      previous = pose;
    }
    expect(previous).toEqual(spec.points[5]);
  });

  it('converts the agreed pan-only metre weight using the actual map scale', () => {
    const spec: ShotSpec = {
      points: [
        point([0, 0, 0]), point([5, 0, 0]), point([5, 0, 0]),
        point([5, 0, 0], [1, 0, 0]), point([5, 0, 0], [1, 0, 0]), point([10, 0, 0], [1, 0, 0]),
      ],
      seconds: 10,
    };
    expect(checkShot(spec, 0.1)).toEqual([]);
    expect(checkShot(spec, 1)).toEqual([]);
    const smallPhysicalMap = sampleShot(spec, 3, 0.1);
    const largePhysicalMap = sampleShot(spec, 3, 1);
    // A 90-degree pan contributes pi metres (2 metres/radian), hence much more of the small map's timeline.
    expectVectorNear(smallPhysicalMap.at, [5, 0, 0], 1e-6);
    expect(largePhysicalMap.at[0]).toBeLessThan(4.5);

    const equivalentPhysicalMap: ShotSpec = {
      ...spec,
      points: spec.points.map((p) => ({ at: p.at.map((n) => n * 10) as [number, number, number],
        look: p.look.map((n) => n * 10) as [number, number, number] })),
    };
    // Scaling all world coordinates by ten and metres-per-unit down by ten preserves the physical shot.
    for (const time of [1, 3, 5, 7, 9]) {
      const unitMetres = sampleShot(spec, time, 1);
      const tenthMetres = sampleShot(equivalentPhysicalMap, time, 0.1);
      expectVectorNear(tenthMetres.at.map((n) => n * 0.1), unitMetres.at, 1e-6);
      expectVectorNear(tenthMetres.look.map((n) => n * 0.1), unitMetres.look, 1e-6);
    }
  });

  it('decelerates translation continuously into a positive-duration pan and accelerates continuously out', () => {
    const spec: ShotSpec = {
      points: [
        point([0, 0, 0]), point([5, 0, 0]), point([5, 0, 0]),
        point([5, 0, 0], [1, 0, 0]), point([5, 0, 0], [1, 0, 0]), point([10, 0, 0], [1, 0, 0]),
      ],
      seconds: 10,
    };
    const panBoundary = (angle: number): number => {
      let low = 0;
      let high = spec.seconds;
      for (let i = 0; i < 50; i++) {
        const middle = (low + high) / 2;
        const facing = direction(sampleShot(spec, middle, 0.1));
        if (Math.atan2(facing[0]!, -facing[2]!) < angle) low = middle;
        else high = middle;
      }
      return high;
    };
    const entry = panBoundary(1e-9);
    const exit = panBoundary(Math.PI / 2 - 1e-9);
    expect(Number.isFinite(entry) && Number.isFinite(exit)).toBe(true);
    expect(exit - entry).toBeGreaterThan(1e-6);
    const middle = sampleShot(spec, (entry + exit) / 2, 0.1);
    expectVectorNear(middle.at, [5, 0, 0], 1e-6);
    expect(direction(middle)[0]).toBeGreaterThan(0.01);
    expect(direction(middle)[2]).toBeLessThan(-0.01);
    // At an intentional stationary pan the shared position derivative must tend to zero on both sides.
    // Compare shrinking windows rather than selecting an arbitrary absolute speed or a particular easing polynomial.
    for (const [boundary, side] of [[entry, -1], [exit, 1]] as const) {
      const at = sampleShot(spec, boundary, 0.1).at;
      const speeds = [0.01, 0.005, 0.0025].map((h) => distance(at, sampleShot(spec, boundary + side * h, 0.1).at) / h);
      expect(speeds[1]!).toBeLessThan(speeds[0]! * 0.75);
      expect(speeds[2]!).toBeLessThan(speeds[1]! * 0.75);
    }
  });
});
