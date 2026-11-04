import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PC_ROOT, askHostLock } from '../captureLock';

/**
 * capture-page's host lock (PLAT-30; web research 108 §7; the Host rules of the web sprint 6 plan): a browser is
 * CPU-heavy, so the page capture starts only on the PC project's `scripts/loop_lock.sh check` answering FREE -- and
 * refuses when the lock cannot be asked at all (no PC project found, bash not run), rather than skipping the check.
 */
const script = (root: string): string => join(resolve(root), 'scripts', 'loop_lock.sh');

describe('the host lock before a browser', () => {
  it('asks SOCOM_PC_ROOT\'s loop_lock.sh, and starts only on FREE', () => {
    const asked: string[] = [];
    const run = (s: string): { stdout: string; error?: Error } => { asked.push(s); return { stdout: 'FREE\n' }; };
    expect(askHostLock({ SOCOM_PC_ROOT: 'D:/pc' }, run, (p) => p === script('D:/pc'))).toEqual({ free: true, line: 'FREE' });
    expect(asked).toEqual([script('D:/pc')]);
  });
  it('refuses a HELD answer (the check exits 0 either way: the line is read)', () => {
    const r = askHostLock({ SOCOM_PC_ROOT: 'D:/pc' }, () => ({ stdout: 'HELD launch gate (pid 1)\n' }), () => true);
    expect(r.free).toBe(false);
    expect(r.line).toBe('HELD launch gate (pid 1)');
  });
  it('without SOCOM_PC_ROOT, asks the PC project at its host path', () => {
    const asked: string[] = [];
    const r = askHostLock({}, (s) => { asked.push(s); return { stdout: 'FREE\n' }; }, (p) => p === script(DEFAULT_PC_ROOT));
    expect(r.free).toBe(true);
    expect(asked).toEqual([script(DEFAULT_PC_ROOT)]);
  });
  it('refuses when the lock cannot be asked: no loop_lock.sh anywhere, or bash did not run', () => {
    const none = askHostLock({}, () => { throw new Error('not reached'); }, () => false);
    expect(none.free).toBe(false);
    expect(none.line).toMatch(/cannot be asked/);
    const nobash = askHostLock({ SOCOM_PC_ROOT: 'D:/pc' }, () => ({ stdout: '', error: new Error('spawn bash ENOENT') }), () => true);
    expect(nobash.free).toBe(false);
    expect(nobash.line).toMatch(/cannot be asked.*ENOENT/);
  });
});
