// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { adaptersFor, liveAdapters } from '../../../src/console/adapters';
import { beforeLaunch } from '../../../src/modern/launchGate';
import { pageSession } from '../../../src/modern/session';
import { SAMPLE_DATA, type Adapters } from '../../../src/console/state';

/**
 * The console page's adapters (slice 2): the server's and the emulator's by default; the prototype's sample adapters
 * (`SAMPLE_DATA`, the header's "Prototype states" tag) only under `?sample`, for screenshots. A browser adaptation with
 * no original (OT.R28).
 */
describe('which adapters the page runs on', () => {
  it('the live ones by default, made once', () => {
    const live = { data: 'live' } as Adapters;
    const make = vi.fn(() => live);
    expect(adaptersFor('', make)).toBe(live);
    expect(adaptersFor('?server=x', make)).toBe(live);
    expect(make).toHaveBeenCalledTimes(2);
  });
  it('the sample ones under ?sample, the live ones never made', () => {
    const make = vi.fn(() => ({ data: 'live' }) as Adapters);
    for (const q of ['?sample', '?devmode&sample', '?sample=1']) expect(adaptersFor(q, make).data).toBe(SAMPLE_DATA);
    expect(make).not.toHaveBeenCalled();
  });
});

// The merge controller's call on #400 (2026-10-20): any key no longer marks the keyboard ready -- only the START keys
// (`../input` `onLauncherStart`), so an invite address's auto-START waits for a START press or a pad.
describe('the live page: a key that is not START marks nothing', () => {
  it('Tab, an arrow or a letter leave the controls not ready', () => {
    document.body.innerHTML = '';
    const A = liveAdapters(document, window);
    try {
      for (const key of ['Tab', 'ArrowDown', 'x']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(A.controls!.ready()).toBe(false);
    } finally {
      A.dispose();
    }
  });
});

describe('the live page and the START boundary (the slice-3 review, finding 2)', () => {
  it('the session is not ended at the boundary: after a START that does not mount, a sign-in is tried again, not refused busy', async () => {
    document.body.innerHTML = '';
    const A = liveAdapters(document, window);
    try {
      await beforeLaunch(document);                       // the boundary's hooks, as a START runs them
      const r = await pageSession(window).signIn({ name: 'RANGER7', password: 'pw' });
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.error.code).not.toBe('busy');  // tried (no server here: unreachable), not refused after START
    } finally {
      A.dispose();
    }
  });
});
