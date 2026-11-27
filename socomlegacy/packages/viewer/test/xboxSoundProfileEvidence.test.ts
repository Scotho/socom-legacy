import { expect, it } from 'vitest';
import { inspectXboxSoundProfile } from '../e2e/xboxSoundProfile';

const names = ['worker-data-ready', 'worker-loops-ready', 'worker-reverb-ready', 'worker-data-sent',
  'main-data-installed', 'main-loops-received', 'main-loops-installed', 'main-first-queues-idle'];
const complete = () => names.map((phase, i) => ({ phase, atUnixMs: 1000 + i,
  ...(i < 5 ? { bankBytes: 16, streamBytes: 8, reverbBytes: 4, sourceBytes: 40 } : {}),
  loopBytes: 12, ...(i >= 4 ? { decodedCacheBytes: 24, decodePending: 0, jobsPending: 0 } : {}),
}));

it('accepts all eight numeric boundaries without imposing cross-thread arrival order', () => {
  const input = complete().reverse();
  const result = inspectXboxSoundProfile(input);
  expect(result).toEqual({ complete: true, phases: input, missing: [], issues: [] });
  input[0]!.loopBytes = 99;
  expect(result.phases[0]!.loopBytes).toBe(12);
});

it('keeps partial observations and names missing boundaries instead of inventing zeroes', () => {
  const result = inspectXboxSoundProfile(complete().slice(0, 2));
  expect(result).toMatchObject({ complete: false, phases: complete().slice(0, 2), missing: names.slice(2), issues: [] });
  expect(inspectXboxSoundProfile(undefined)).toEqual({ complete: false, phases: [], missing: names, issues: ['missing-array'] });
});

it('reports a malformed record while retaining the other bounded observations', () => {
  const input: unknown[] = complete(); input[0] = null;
  const result = inspectXboxSoundProfile(input);
  expect(result).toMatchObject({ complete: false, phases: complete().slice(1), missing: [names[0]], issues: ['invalid-record'] });
});

it.each([
  ['timestamp', { atUnixMs: Infinity }, 'invalid-timestamp'],
  ['counter', { sourceBytes: -1 }, 'invalid-counter'],
  ['missing counter', { sourceBytes: undefined }, 'missing-counter'],
] as const)('refuses an invalid %s without exposing raw values', (_label, change, issue) => {
  const input = complete(); Object.assign(input[0]!, change);
  const result = inspectXboxSoundProfile(input);
  expect(result.complete).toBe(false); expect(result.issues).toContain(issue);
  expect(JSON.stringify(result)).not.toContain('Infinity');
});

it('refuses duplicate/unknown phases and oversized input while keeping at most eight whitelisted records', () => {
  const input = complete(); input[1]!.phase = input[0]!.phase;
  input[2]!.phase = 'private stage';
  const result = inspectXboxSoundProfile(input);
  expect(result.issues).toEqual(['duplicate-phase', 'unknown-phase']);
  expect(result.complete).toBe(false); expect(JSON.stringify(result)).not.toContain('private stage');
  const oversized = inspectXboxSoundProfile([...complete(), ...complete()]);
  expect(oversized.issues).toEqual(['too-many-records']); expect(oversized.phases).toHaveLength(8);
  expect(oversized.complete).toBe(false);
});

it('does not accept a queue-idle label when its observed queues are still nonempty', () => {
  const input = complete(); input[7]!.decodePending = 1;
  const result = inspectXboxSoundProfile(input);
  expect(result.complete).toBe(false); expect(result.issues).toEqual(['queues-not-idle']);
});

it('copies only permitted phase numbers and does not retain payloads or arbitrary metadata', () => {
  const input = complete().map(sample => ({ ...sample, note: 'private', nested: { bytes: new Uint8Array(8) }, nativeBytes: 999 }));
  const result = inspectXboxSoundProfile(input);
  expect(result.complete).toBe(true); expect(result.phases).toEqual(complete());
  expect(JSON.stringify(result)).not.toMatch(/private|nested|nativeBytes/);
});
