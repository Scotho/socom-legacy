import { describe, expect, it } from 'vitest';
import { LOAD_DIAG_LATE_MS_ADAPTATION, loadDiagMessage, loadDiagReporter } from '../src/net/loadDiag';
import { DIAG_KINDS } from '../src/clientErrorBeacon';

/** LATER 753's page instrument (product track, a browser adaptation): the loaddiag diagnostic's fields and its once. */
describe('LATER 753: the loaddiag diagnostic', () => {
  it('numbers and flags only; a bad number null', () => {
    expect(LOAD_DIAG_LATE_MS_ADAPTATION).toBe(30_000);
    expect(JSON.parse(loadDiagMessage({ assetsMs: 41_999.6, loadMs: 102_000, boundHit: true, failed: false, prepared: true })))
      .toEqual({ v: 1, assetsMs: 42_000, loadMs: 102_000, boundHit: true, failed: false, prepared: true });
    expect(JSON.parse(loadDiagMessage({ assetsMs: null, loadMs: -5, boundHit: false, failed: true, prepared: false })))
      .toEqual({ v: 1, assetsMs: null, loadMs: null, boundHit: false, failed: true, prepared: false });
  });

  it('once a page load; a throwing send never escapes; a diagnostic kind of the beacon', () => {
    const sent: string[] = [];
    const tell = loadDiagReporter((m) => { sent.push(m); });
    const p = { assetsMs: 1, loadMs: 40_000, boundHit: false, failed: false, prepared: false };
    tell(p); tell(p);
    expect(sent).toHaveLength(1);
    expect(() => loadDiagReporter(() => { throw new Error('no'); })(p)).not.toThrow();
    expect(DIAG_KINDS).toContain('loaddiag');
  });
});
