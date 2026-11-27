import { expect, it } from 'vitest';
import { Fire } from '../src/fire';
import { FIRE_TRACE_MODES, renderedFireTrace, traceDigest } from './helpers/fireCoreTrace';

// First captured against the original Fire at 84311a1038, before the core/graphics split. Re-captured at the merge of
// main 009b7cb2ab (LATER 1147's kit-step trigger, LATER 1141's aim point, research 431's marks): each digest is the
// trace of main's own unsplit Fire at that commit through this harness, which the split Fire matched value for value.
// Synthetic hull only: code-behavior comparison, not original-console parity.
export const FIRE_BASELINE = {
  fallback: '560fbc218c9fee578a466cd897cd6e641e4bef4e279d876de589803371151d54',
  table: '8f8dae541dfd34f08851282116f7095237c16fc3b0124a86e1b979788e1b1b2c',
  'missing-row': '774a6ccb18c2fc2ed1db67ad95c66e61efed630c26e951a1e815c1fd88c00a40',
  'missing-material': '5412e3fb3d9678ec4c4e919dc5638a88d42cd13736a05ad1266e1bbb302bc862',
  clipped: '0e5cb6f8d70669c52a9796d26d95deea75a8fa4c9ba8d4129f14ad3fbb185bde',
  callbacks: '221435ebc057929b94354f958b27a9c490c55dc880a9e2da4ec0f569af0679b8',
};
it.each(FIRE_TRACE_MODES)('preserves pre-extraction firearm events, state and callback order: %s', mode => {
  const trace = renderedFireTrace((source, record, random) => new Fire(source, record, undefined, random), mode);
  expect(traceDigest(trace)).toBe(FIRE_BASELINE[mode]);
});
