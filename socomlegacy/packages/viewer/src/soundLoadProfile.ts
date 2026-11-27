import type { RenderedSound } from '@s2u/sound';
import type { SoundData } from './soundData';

/** Optional loading instrument, not an audio rule or total memory measurement.
 * Each category counts entire unique backing buffers among the inspected views,
 * including PCM16 streams. Categories may overlap; sourceBytes is their unique
 * union. No decoded worker sample cache, per-voice scratch, JS object overhead,
 * native AudioBuffer or browser/driver allocation is included.
 */
export function soundPayload(data: Pick<SoundData, 'banks' | 'streams' | 'reverb'> | null,
  loops: readonly { sound: RenderedSound }[] = []) {
  const all = new Set<ArrayBufferLike>();
  const bytes = (views: readonly (ArrayBufferView | null | undefined)[]) => {
    const category = new Set<ArrayBufferLike>();
    // Even an empty subview can keep a whole nonempty buffer alive.
    for (const view of views) if (view) { category.add(view.buffer); all.add(view.buffer); }
    let total = 0; for (const buffer of category) total += buffer.byteLength; return total;
  };
  const bankBytes = bytes(data?.banks.map(bank => bank.bytes) ?? []);
  const streamBytes = bytes(data?.streams?.flatMap(stream => [stream.sound.left, stream.sound.right]) ?? []);
  const ir = data?.reverb.ir;
  const reverbBytes = bytes(ir ? [ir.ll, ir.lr, ir.rl, ir.rr] : []);
  const loopBytes = bytes(loops.flatMap(({ sound }) => [sound.left, sound.right, sound.sendLeft, sound.sendRight]));
  let sourceBytes = 0; for (const buffer of all) sourceBytes += buffer.byteLength;
  return { bankBytes, streamBytes, reverbBytes, loopBytes, sourceBytes };
}

const PHASES = ['worker-data-ready', 'worker-loops-ready', 'worker-reverb-ready', 'worker-data-sent',
  'main-data-installed', 'main-loops-received', 'main-loops-installed', 'main-first-queues-idle'] as const;
export type SoundLoadPhaseName = typeof PHASES[number];
const NUMBERS = ['bankBytes', 'streamBytes', 'reverbBytes', 'loopBytes', 'sourceBytes',
  'decodedCacheBytes', 'decodePending', 'jobsPending'] as const;
export type SoundLoadPhaseSample = { phase: SoundLoadPhaseName; atUnixMs: number } & Partial<Record<typeof NUMBERS[number], number>>;
type NumericRecord = Record<string, unknown>;
const object = (value: unknown): NumericRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as NumericRecord : {};
const count = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Copies the existing queue/cache counters. Empty queues are only an observed
 * snapshot; they never establish that native audio allocations were released. */
export function soundQueueSample(value: unknown) {
  const stats = object(value), decode = object(stats.decode), timing = object(stats.timing);
  const out: Pick<SoundLoadPhaseSample, 'decodedCacheBytes' | 'decodePending' | 'jobsPending'> = {};
  if (count(decode.bytes)) out.decodedCacheBytes = decode.bytes;
  if (count(decode.pending)) out.decodePending = decode.pending;
  if (count(timing.pending)) out.jobsPending = timing.pending;
  return out;
}

/** At most one numeric record for each of eight fixed phases. Caller objects,
 * arrays, arbitrary labels and samples are never retained. Unix milliseconds
 * allow comparison with the external process sampler, not a cross-thread timer. */
export function soundLoadHistory() {
  const samples: SoundLoadPhaseSample[] = [], seen = new Set<SoundLoadPhaseName>();
  return {
    has: (phase: SoundLoadPhaseName) => seen.has(phase),
    record(value: unknown): void {
      if (samples.length >= PHASES.length) return;
      const input = object(value), phase = input.phase as SoundLoadPhaseName;
      if (!PHASES.includes(phase) || seen.has(phase) || !count(input.atUnixMs)) return;
      const sample: SoundLoadPhaseSample = { phase, atUnixMs: input.atUnixMs };
      for (const key of NUMBERS) { const value = input[key]; if (count(value)) sample[key] = value; }
      seen.add(phase); samples.push(sample);
    },
    snapshot: () => samples.map(sample => ({ ...sample })),
  };
}

/** The diagnostic export has the same whitelist and bounded input scan. */
export function soundLoadPhases(value: unknown): SoundLoadPhaseSample[] {
  const history = soundLoadHistory();
  if (Array.isArray(value)) for (const sample of value.slice(0, PHASES.length)) history.record(sample);
  return history.snapshot();
}
