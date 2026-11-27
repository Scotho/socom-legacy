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

describe('B-84: the launcher page offers the Overlay button row', () => {
  it('Options > Controller lists it, and a save writes the key the overlay reads', async () => {
    localStorage.clear();
    document.body.innerHTML = '';
    const A = liveAdapters(document, window);
    try {
      const { OVERLAY_BUTTON_ROW } = await import('../../../src/console/adapters/options');
      const { readOverlayButton, OVERLAY_BUTTON_KEY } = await import('../../../src/overlayButtonSetting');
      const { readPreference } = await import('../../../src/startupSettings');
      const rows = A.options!.categories().find((c) => c.id === 'controller')!.rows;
      expect(rows.map((r) => r.id)).toContain(OVERLAY_BUTTON_ROW);
      A.options!.set(OVERLAY_BUTTON_ROW, 2);               // choices: Home (16) first, then 0, 1, ...: index 2 is button 1
      expect(readPreference(OVERLAY_BUTTON_KEY)).toBe('1');
      expect(readOverlayButton()).toBe(1);
      const binding = await import('../../../src/modern/overlay/binding');
      expect(binding.readOverlayButton()).toBe(1);
    } finally {
      A.dispose();
      localStorage.clear();
    }
  });
});
