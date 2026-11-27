import { expect, it } from 'vitest';
import type { RenderedSound } from '@s2u/sound';
import type { SoundData } from '../src/soundData';
import { soundLoadHistory, soundLoadPhases, soundPayload, soundQueueSample } from '../src/soundLoadProfile';

it('counts unique entire backing buffers and observes a transfer without retaining or changing sample views', () => {
  const bank = new Uint8Array(32), mono = Int16Array.of(-32768, -1, 0, 32767), wet = new Float32Array(2);
  const data = { banks: [{ file: 'fixture', bytes: bank.subarray(4, 12) }],
    streams: [{ sound: { left: mono, right: mono } }], reverb: { ir: { ll: wet, lr: wet, rl: wet, rr: wet } },
  } as unknown as SoundData;
  const left = Float32Array.of(0.25, 0.5), right = Float32Array.of(-0.25, -0.5);
  const loops = [{ sound: { left, right, sendLeft: null, sendRight: null } as RenderedSound }];
  const payload = soundPayload(data, loops);
  expect(payload).toEqual({ bankBytes: 32, streamBytes: 8, reverbBytes: 8, loopBytes: 16, sourceBytes: 64 });
  expect(data.banks[0]!.bytes.buffer).toBe(bank.buffer); expect(loops[0]!.sound.left).toBe(left);
  structuredClone(data, { transfer: [bank.buffer, mono.buffer, wet.buffer] });
  expect(soundPayload(data, loops)).toEqual({ bankBytes: 0, streamBytes: 0, reverbBytes: 0, loopBytes: 16, sourceBytes: 16 });
  expect(payload.sourceBytes).toBe(64); expect(Object.values(payload).every(value => typeof value === 'number')).toBe(true);
});

it('deduplicates PCM16 aliases globally even when a backing buffer appears in multiple payload categories', () => {
  const shared = new ArrayBuffer(64), pcm = new Int16Array(shared, 8, 4), wet = new Float32Array(shared, 48, 2);
  const data = { banks: [{ bytes: new Uint8Array(shared, 0, 8) }], streams: [{ sound: { left: pcm, right: pcm } }],
    reverb: { ir: { ll: wet, lr: wet, rl: wet, rr: wet } } } as unknown as SoundData;
  const loops = [{ sound: { left: new Float32Array(shared, 16, 4), right: new Float32Array(2), sendLeft: null, sendRight: null } as RenderedSound }];
  // Categories are independently unique and can overlap; sourceBytes is their
  // globally unique union, not their arithmetic sum or a process-memory claim.
  expect(soundPayload(data, loops)).toEqual({ bankBytes: 64, streamBytes: 64, reverbBytes: 64, loopBytes: 72, sourceBytes: 72 });
});

it('keeps only eight known phases and numeric values, without retaining caller objects or replacing the first observation', () => {
  const history = soundLoadHistory();
  const sample = { phase: 'worker-data-ready', atUnixMs: 1000, sourceBytes: 12, note: 'private', nested: { bytes: new Uint8Array(50) } };
  history.record(sample); sample.sourceBytes = 99;
  history.record({ phase: 'worker-data-ready', atUnixMs: 1001, sourceBytes: 999 });
  history.record({ phase: 'private stage', atUnixMs: 1002, sourceBytes: 1 });
  history.record({ phase: 'worker-loops-ready', atUnixMs: NaN });
  expect(history.snapshot()).toEqual([{ phase: 'worker-data-ready', atUnixMs: 1000, sourceBytes: 12 }]);
  for (const phase of ['worker-loops-ready', 'worker-reverb-ready', 'worker-data-sent', 'main-data-installed',
    'main-loops-received', 'main-loops-installed', 'main-first-queues-idle']) history.record({ phase, atUnixMs: 1003, sourceBytes: -1, jobsPending: 0 });
  expect(history.snapshot()).toHaveLength(8);
  const saved = history.snapshot(); saved[0]!.sourceBytes = 111;
  expect(history.snapshot()[0]!.sourceBytes).toBe(12);
  expect(soundLoadPhases([...history.snapshot(), ...history.snapshot()])).toEqual(history.snapshot());
  expect(JSON.stringify(history.snapshot())).not.toMatch(/private|nested|note/);
});

it('counts an empty subview that still owns a nonempty backing allocation', () => {
  const data = { banks: [{ bytes: new Uint8Array(new ArrayBuffer(64), 0, 0) }], reverb: {} } as unknown as SoundData;
  expect(soundPayload(data).bankBytes).toBe(64);
});

it('reads existing queues as observed counters without claiming native audio residency or completion', () => {
  expect(soundQueueSample({ decode: { bytes: 512, pending: 2 }, timing: { pending: 3 }, nativeBytes: 999 })).toEqual({ decodedCacheBytes: 512, decodePending: 2, jobsPending: 3 });
  expect(soundQueueSample({ decode: { bytes: NaN, pending: -1 }, timing: { pending: Infinity } })).toEqual({});
  expect(soundQueueSample(null)).toEqual({});
});
