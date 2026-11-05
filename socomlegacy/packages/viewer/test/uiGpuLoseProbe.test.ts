import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_GPU_NO_LOSE_CONTEXT, uiGpuContextsWhileReleased, uiGpuLoseGate, uiGpuLoseProbe } from '../e2e/uiGpuLoseProbe';

// GM-11b box fold, review F1/F2 (product track, a test instrument): the loss specs skip a forced-loss leg only where a
// live WebGL2 context offers no WEBGL_lose_context; no context, or one lost at the probe, fails the run. The
// leave/return leg runs without the extension, the context then kept and counted. Evidence kind: unit test.

const ctx = (lost: boolean, ext: unknown) => ({ isContextLost: () => lost, getExtension: (n: string) => (n === 'WEBGL_lose_context' ? ext : null) });

describe('GM-11b review F1: the WEBGL_lose_context probe', () => {
  it('a live context with the extension: ok, the object kept', () => {
    const ext = { loseContext() {}, restoreContext() {} };
    expect(uiGpuLoseProbe(ctx(false, ext))).toEqual({ kind: 'ok', ext });
    expect(uiGpuLoseGate('ok')).toEqual({ act: 'run' });
  });

  it('a live context without it: absent, the only skip, by name', () => {
    expect(uiGpuLoseProbe(ctx(false, null)).kind).toBe('absent');
    expect(uiGpuLoseGate('absent')).toEqual({ act: 'skip', reason: UI_GPU_NO_LOSE_CONTEXT });
  });

  it('no WebGL2 context, or one lost at the probe: a failure, never a skip blamed on the extension', () => {
    expect(uiGpuLoseProbe(null).kind).toBe('no-context');
    expect(uiGpuLoseProbe(ctx(true, { loseContext() {} })).kind).toBe('lost');
    expect(uiGpuLoseGate('no-context').act).toBe('fail');
    expect(uiGpuLoseGate('lost').act).toBe('fail');
  });
});

describe('GM-11b review F2: the leave/return leg runs without the extension', () => {
  it('released: 0 contexts with the extension (let go), 1 without (kept and counted)', () => {
    expect(uiGpuContextsWhileReleased('ok')).toBe(0);
    expect(uiGpuContextsWhileReleased('absent')).toBe(1);
  });

  it('the spec gates the leave/return leg on the probe without skipping on absent, and the forced-loss legs by uiGpuLoseGate', () => {
    const spec = readFileSync(new URL('../e2e/uiGpuLoss.spec.ts', import.meta.url), 'utf8');
    const leave = spec.slice(spec.indexOf("test('leave lets the context go"), spec.indexOf('test.fixme('));
    expect(leave).not.toContain('needLoseContext');
    expect(leave).toContain('uiGpuContextsWhileReleased');
    expect(spec).toContain('uiGpuLoseGate');
    const harness = readFileSync(new URL('../e2e/uiGpuLossHarness.ts', import.meta.url), 'utf8');
    expect(harness).toContain('uiGpuLoseProbe');
    expect(harness).not.toMatch(/isContextLost\(\)\) return null/);
  });
});
