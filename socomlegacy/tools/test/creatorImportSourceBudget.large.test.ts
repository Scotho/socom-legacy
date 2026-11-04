import { describe, expect, it } from 'vitest';
import { PACK_MEMBER_BYTES_ADAPTATION } from '@s2u/creator-contracts';
import { preflightOriginalGlb, type OriginalGlbAuthoringSource } from '../creator-import/src/originalGlb';

/** SOURCE-ONLY PREPARATION; NOT RUN. These are real byte-boundary inputs, not fake lengths or altered caps.
 * The ordinary suite/file run explicitly skips them. Enabling this flag requires a separate controller memory
 * grant; a flag's presence is not itself permission. Do not enable it during an ordinary single-file slot.
 * Additional backing store allocated by this test: 500 MiB + 1 byte. Total RSS/peak is unmeasured and includes
 * the runtime/test harness; no virtual-memory or lazy-zeroing assumption is relied on for authorization.
 */
const memoryGranted = process.env.FORGE_GLB_LARGE_SOURCE_BUDGET_TESTS === '1';
const authoring: OriginalGlbAuthoringSource = {
  unit: 'metre', up: '+Y', transformsBaked: true,
  nodeMatrixColumnMajor: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], collision: { intent: 'none', hulls: [] },
};
describe('SOURCE_BUDGET real-size boundary checks [explicit controller memory grant required]', () => {
  it.skipIf(!memoryGranted)('refuses a source member over the published member cap before parsing/copying', () => {
    const result = preflightOriginalGlb(new Uint8Array(PACK_MEMBER_BYTES_ADAPTATION+1),authoring);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('over-cap source was accepted');
    expect(result.diagnostics[0]!.code).toBe('SOURCE_BUDGET');
  });
});
