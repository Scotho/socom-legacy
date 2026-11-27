import { soundLoadPhases, type SoundLoadPhaseName } from '../src/soundLoadProfile';

const PHASES: readonly SoundLoadPhaseName[] = ['worker-data-ready', 'worker-loops-ready', 'worker-reverb-ready',
  'worker-data-sent', 'main-data-installed', 'main-loops-received', 'main-loops-installed', 'main-first-queues-idle'];
const SOURCES = ['bankBytes', 'streamBytes', 'reverbBytes', 'loopBytes', 'sourceBytes'] as const;
const QUEUES = ['decodedCacheBytes', 'decodePending', 'jobsPending'] as const;
const NUMBERS = [...SOURCES, ...QUEUES];
type Issue = 'missing-array' | 'too-many-records' | 'invalid-record' | 'unknown-phase' | 'duplicate-phase'
  | 'invalid-timestamp' | 'missing-counter' | 'invalid-counter' | 'queues-not-idle';

/** Test evidence only: preserve bounded numeric observations alongside the raw
 * report, and reject incomplete/corrupt profiles without manufacturing samples.
 * Arrival order is not a cross-thread clock. Queue idle does not measure native
 * audio residency; these records are not process-memory totals or savings. */
export function inspectXboxSoundProfile(value: unknown) {
  const issues = new Set<Issue>(), seen = new Set<SoundLoadPhaseName>();
  if (!Array.isArray(value)) issues.add('missing-array');
  else {
    if (value.length > PHASES.length) issues.add('too-many-records');
    for (const entry of value.slice(0, PHASES.length)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { issues.add('invalid-record'); continue; }
      const row = entry as Record<string, unknown>, phase = row.phase as SoundLoadPhaseName;
      if (!PHASES.includes(phase)) { issues.add('unknown-phase'); continue; }
      if (seen.has(phase)) issues.add('duplicate-phase');
      seen.add(phase);
      if (typeof row.atUnixMs !== 'number' || !Number.isSafeInteger(row.atUnixMs) || row.atUnixMs < 0)
        issues.add('invalid-timestamp');
      const source = phase.startsWith('worker-') || phase === 'main-data-installed';
      const required = [...(source ? SOURCES : ['loopBytes']), ...(phase.startsWith('main-') ? QUEUES : [])];
      if (required.some(key => row[key] === undefined)) issues.add('missing-counter');
      for (const key of NUMBERS) {
        const number = row[key];
        if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number < 0))
          issues.add('invalid-counter');
      }
      if (phase === 'main-first-queues-idle' && (row.decodePending !== 0 || row.jobsPending !== 0)) issues.add('queues-not-idle');
    }
  }
  const phases = soundLoadPhases(value), present = new Set(phases.map(sample => sample.phase));
  const missing = PHASES.filter(phase => !present.has(phase));
  return { complete: issues.size === 0 && missing.length === 0, phases, missing, issues: [...issues] };
}
