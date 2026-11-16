// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MATCH_NO_BACKEND_BOUND_MS_ADAPTATION, MATCH_NO_BACKEND_LEAVE_LABEL, MATCH_NO_BACKEND_TEXT, MATCH_NO_BACKEND_XBOX_STEPS,
  watchMatchBackend,
} from '../src/matchNoBackend';

/**
 * NO-BACKEND-NOTICE (#790, 2026-11-14; a browser adaptation, product track): two players on Xbox Edge were in matches
 * whose renderer never came up (inputdiag `bk: null`, three matches in a row) -- a black match and no word. A match whose
 * renderer's promise rejects, or is still pending `MATCH_NO_BACKEND_BOUND_MS_ADAPTATION` after the attach, shows a notice
 * with the remedy and a "Leave match" button (the START menu's ABORT path; the player chooses), and sends one beacon row.
 */
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const notice = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-match-no-backend]');

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('NO-BACKEND-NOTICE: a match with no renderer says so, offers the leave, and reports once', () => {
  it('a renderer that never resolves: nothing before the bound; after it the notice, its button, and one report', async () => {
    vi.useFakeTimers();
    const leave = vi.fn(), report = vi.fn();
    watchMatchBackend(new Promise<never>(() => {}), { doc: document, leave, report });
    await vi.advanceTimersByTimeAsync(MATCH_NO_BACKEND_BOUND_MS_ADAPTATION - 1);
    expect(notice()).toBeNull();
    expect(report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const el = notice()!;
    expect(el).not.toBeNull();
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.classList.contains('s2u-notice')).toBe(true);
    expect(el.textContent).toContain(MATCH_NO_BACKEND_TEXT);
    expect(el.textContent).toContain(MATCH_NO_BACKEND_XBOX_STEPS);
    expect(report.mock.calls).toEqual([['no-backend']]);
    const button = el.querySelector<HTMLButtonElement>('[data-match-no-backend-leave]')!;
    expect(button.textContent).toBe(MATCH_NO_BACKEND_LEAVE_LABEL);
    button.click();
    button.click();                                                    // one leave, however often it is pressed
    expect(leave).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(MATCH_NO_BACKEND_BOUND_MS_ADAPTATION * 3);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('a renderer that rejects: the notice at once, one report', async () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const why = new Error('no adapter');
    watchMatchBackend(Promise.reject(why), { doc: document, leave: () => {}, report });
    await flush();
    expect(notice()).not.toBeNull();
    expect(report.mock.calls).toEqual([['no-backend', why]]);          // MATCH-RENDERER-RETRY A: the rejection handed on
    await vi.advanceTimersByTimeAsync(MATCH_NO_BACKEND_BOUND_MS_ADAPTATION * 2);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('a renderer in before the bound: no notice and no report, ever', async () => {
    vi.useFakeTimers();
    const report = vi.fn();
    watchMatchBackend(Promise.resolve({}), { doc: document, leave: () => {}, report });
    await vi.advanceTimersByTimeAsync(MATCH_NO_BACKEND_BOUND_MS_ADAPTATION * 2);
    expect(notice()).toBeNull();
    expect(report).not.toHaveBeenCalled();
  });

  it('a renderer in late: the notice goes; the stop clears the timer and the notice', async () => {
    vi.useFakeTimers();
    let done: (v: unknown) => void = () => {};
    watchMatchBackend(new Promise((r) => { done = r; }), { doc: document, leave: () => {}, report: () => {} });
    await vi.advanceTimersByTimeAsync(MATCH_NO_BACKEND_BOUND_MS_ADAPTATION);
    expect(notice()).not.toBeNull();
    done({});
    await flush();
    expect(notice()).toBeNull();
    const report = vi.fn();
    const stop = watchMatchBackend(new Promise<never>(() => {}), { doc: document, leave: () => {}, report });
    stop();
    await vi.advanceTimersByTimeAsync(MATCH_NO_BACKEND_BOUND_MS_ADAPTATION * 2);
    expect(notice()).toBeNull();
    expect(report).not.toHaveBeenCalled();
  });

  it('the mount wires it at the attach: the renderer\'s promise, the ABORT path, the contextdiag lane; stopped at the teardown', () => {
    const src = readFileSync(resolve(__dirname, '../src/matchMount.ts'), 'utf8');
    expect(src).toMatch(/const made = rendererWithRetry\(canvas, o\.renderer \?\? pageRenderer, \{/);
    expect(src).toMatch(/noBackend = watchMatchBackend\(made, \{ doc, leave: \(\) => \{ matchAbort\.abort\(\); \}, report: \(why, reason\) => \{ matchDiag\.lost\(why, globalThis\.performance\?\.now\(\) \?\? 0, noBackendExtra\(reason, creationError\.last\(\)\)\); \} \}\);/);
    expect(src.indexOf('noBackend = watchMatchBackend(')).toBeGreaterThan(src.indexOf('attached = true;'));
    expect(src).toMatch(/noBackend\?\.\(\);/);
  });
});
