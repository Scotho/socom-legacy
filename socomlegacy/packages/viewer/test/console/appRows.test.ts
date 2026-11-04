// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { setInstallPromptForTest, type InstallSurface } from '../../src/pwa/install';
import { UPDATE_NOTICE, showUpdateNotice } from '../../src/pwa/update';
import { optRowEls, optRowLabel, optRowValue } from './optRows';
import { mountShell } from './shell';

/**
 * LR-5 (the launcher redesign plan, the row "Settings": "App: Install (trusted click), the update notice (CX.R18), delete
 * the kept disc (LP.R10), the version badge (LP.R7)"): Settings > App in LR-1's rows. Install app the primary verb where
 * the browser installs (its dialog's button still the one trusted click); the update notice's own words as a row while a
 * new build waits (its Restart the notice's; absent when none waits: nothing claims "up to date"); the kept disc's
 * removal the danger verb behind its confirm; the version the badge's, as an info row the pad still stops on. A browser
 * adaptation: nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); document.querySelector('[data-pwa-update]')?.remove(); setInstallPromptForTest(null, false); });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
function boot(install: InstallSurface = 'chromium') {
  const options = liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false, install: () => install });
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  page.ctl.doAct('opt:app');
  page.render();
  return { ctl: page.ctl, options };
}
const row = (label: string): HTMLElement | undefined => optRowEls().find((r) => optRowLabel(r) === label);

describe('LR-5: Settings > App', () => {
  it('Install app is the primary verb where the browser installs; elsewhere its word, plain', () => {
    boot('chromium');
    expect(row('Install app')!.classList.contains('is-primary')).toBe(true);
    // LR-20 (P12): "Install app / Install" repeated the verb; the line is the artifact's (the verb stays the legend's Cross).
    expect(optRowValue(row('Install app')!)).toBe('Adds the launcher to your desktop and app list');
    page!.dispose(); page = null; mountShell(document);
    boot('firefox');
    expect(row('Install app')!.classList.contains('is-primary')).toBe(false);
    expect(optRowValue(row('Install app')!)).toBe('Not supported');
  });

  // LR-20's fold (3) (the coordinator, from the box's run at 8b88093ca, `lr-20/1280x720/row-install-app.png`: no line under
  // Install app on the LIVE adapter). The box's browser had no install prompt ready (`pwa/install` `other`), whose verb is
  // still Install; the line was given only to `chromium`, and the verb ("Install") is in the label, so nothing was drawn.
  // Wherever the verb is Install the row says what it does, as the sample does; "Installed", "Add to Home Screen" and
  // "Not supported" keep their own words (the line would claim what the browser does not do there).
  it('LR-20 fold (3): Install app says what it does wherever its verb is Install', () => {
    for (const surface of ['chromium', 'other'] as const) {
      boot(surface);
      expect(optRowValue(row('Install app')!), surface).toBe('Adds the launcher to your desktop and app list');
      page!.dispose(); page = null; mountShell(document);
    }
    for (const [surface, word] of [['installed', 'Installed'], ['ios', 'Add to Home Screen'], ['firefox', 'Not supported']] as const) {
      boot(surface);
      expect(optRowValue(row('Install app')!), surface).toBe(word);
      page!.dispose(); page = null; mountShell(document);
    }
  });

  it('the version is the badge\'s, an info row the pad still stops on (the grammar\'s act, a tab stop)', () => {
    const { ctl } = boot();
    const badge = document.querySelector('#header .cx-version')!.textContent;
    const v = row('Version')!;
    expect(v.classList.contains('cx-r--info')).toBe(true);
    expect(optRowValue(v)).toBe(badge);
    expect(v.dataset['act']).toBe('optrow');
    expect(v.getAttribute('tabindex')).toBe('-1');
    const at = optRowEls().indexOf(v);
    for (let k = 0; k < at; k++) ctl.press('down');
    expect(ctl.S.opt.row).toBe(at);
    expect(row('Version')!.classList.contains('is-focused')).toBe(true);
  });

  it('no build waiting: no update row (nothing says "up to date")', () => {
    boot();
    expect(optRowEls().map(optRowLabel).some((l) => /update|version available/i.test(l))).toBe(false);
  });

  it('a build waiting (CX.R18\'s notice up): its words as a row, Restart its primary verb, Cross the notice\'s Restart', async () => {
    const restart = vi.fn();
    const { ctl } = boot();
    showUpdateNotice(document, { restart });
    page!.render();
    const u = row(UPDATE_NOTICE.replace(/, restart$/, ''))!;
    expect(u).toBeDefined();
    expect(u.classList.contains('is-primary')).toBe(true);
    expect(optRowValue(u)).toBe('Restart');
    ctl.S.opt.row = optRowEls().indexOf(u);
    ctl.press('cross');
    await flush();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('a notice mounting under a stale focus never moves the focused row: Cross on row 1 is not Restart (review-lr-5 F1)', async () => {
    const restart = vi.fn();
    const { ctl } = boot();
    ctl.S.opt.row = 1;                                              // the pad rests on the App tab's second row
    const before = optRowLabel(optRowEls()[1]!);
    showUpdateNotice(document, { restart });                        // a build lands now; no render in between
    ctl.press('cross');
    await flush();
    expect(restart).not.toHaveBeenCalled();
    expect(optRowLabel(optRowEls()[1]!)).toBe(before);              // the page was redrawn (notify) and row 1 is still that row
    const u = row(UPDATE_NOTICE.replace(/, restart$/, ''))!;
    expect(optRowEls().indexOf(u)).toBeGreaterThan(1);              // after the kept-disc row, never before
  });

  it('Remove downloaded content stays the danger verb behind its confirm (LP.R10), locked with nothing kept', () => {
    boot();
    const kept = row('Remove downloaded content')!;
    expect(kept.classList.contains('is-locked')).toBe(true);
    expect(optRowValue(kept)).toBe('Nothing stored');
  });

  it('the page is redrawn when the notice mounts and when it is dismissed, and dispose() disconnects the observer (review-lr-5 F4)', async () => {
    const notify = vi.fn();
    const options = liveOptions(notify, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false, install: () => 'chromium' });
    await flush();
    notify.mockClear();
    showUpdateNotice(document, { restart: vi.fn() });
    await flush();                                                  // the observer's microtask
    expect(notify).toHaveBeenCalledTimes(1);
    document.querySelector('[data-pwa-update]')!.setAttribute('data-pwa-dismissed', '1');
    await flush();
    expect(notify).toHaveBeenCalledTimes(2);
    options.dispose();
    notify.mockClear();
    document.querySelector('[data-pwa-update]')!.removeAttribute('data-pwa-dismissed');
    document.querySelector('[data-pwa-update]')!.setAttribute('data-pwa-dismissed', '1');
    document.querySelector('[data-pwa-update]')!.remove();
    await flush();
    expect(notify).not.toHaveBeenCalled();
  });
});
