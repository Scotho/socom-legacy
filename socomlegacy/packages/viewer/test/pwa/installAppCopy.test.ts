// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions } from '../../src/console/adapters/options';
import { INSTALL_POINTER_WORDS } from '../../src/console/grammar';
import { installAppHtml } from '../../src/console/render/installApp';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import {
  COPY_LAUNCHER_ADDRESS, copyLauncherAddress, installCopyOffered, IOS_INSTALL_ROWS, launcherAddress, onInstallClick, resetInstallCopyForTest,
  setInstallPromptForTest, type InstallSurface,
} from '../../src/pwa/install';
import { mountShell } from '../console/shell';

/**
 * RB-39 (the replay batch plan, the row RB-39; the design `S2 Launcher v2`, its App panel): the Install app dialog
 * offers "Copy launcher address" where the browser cannot install from the page (Firefox and the other browsers), with
 * the clipboard fallback of the Copy performance line (`console/adapters/options.ts`, CPS-5): a refused clipboard puts
 * the address in the dialog's note to select by hand. A pad press is not a user activation, so the clipboard may refuse
 * it; the note is how. The iOS steps are rows. A browser adaptation: nothing of the game.
 */

const ADDRESS = 'https://example.test/';
const refusing = { writeText: vi.fn(() => Promise.reject(new DOMException('no activation', 'NotAllowedError'))) };
const working = (): { writeText: ReturnType<typeof vi.fn> } => ({ writeText: vi.fn(() => Promise.resolve()) });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => { resetInstallCopyForTest(); setInstallPromptForTest(null, false); });

describe('RB-39: Copy launcher address', () => {
  it('Firefox and the other browsers show a real Copy button; the surfaces that install or are installed do not', () => {
    for (const surface of ['firefox', 'other'] as const) {
      expect(installCopyOffered(surface), surface).toBe(true);
      const host = document.createElement('div');
      host.innerHTML = installAppHtml(surface);
      const copy = host.querySelector<HTMLElement>('[data-pwa-copy]');
      expect(copy?.tagName, surface).toBe('BUTTON');
      expect(copy!.textContent, surface).toContain('Copy launcher address');
      expect(host.querySelector('[data-pwa-copy-note]'), surface).toBeNull();
    }
    for (const surface of ['installed', 'chromium', 'ios', 'android'] as const) {
      expect(installCopyOffered(surface), surface).toBe(false);
      expect(installAppHtml(surface), surface).not.toContain('data-pwa-copy');
    }
  });

  it('the launcher address is the installed app\'s start address: the page\'s base, not the screen it is on', () => {
    expect(launcherAddress('https://example.test/options/app?x=1#y')).toBe('https://example.test/');
  });

  it('a pad press without activation, refused by the clipboard, shows the note with the address to copy by hand', async () => {
    const redraw = vi.fn();
    await expect(copyLauncherAddress({ clipboard: refusing, href: ADDRESS, redraw })).resolves.toBe('refused');
    expect(refusing.writeText).toHaveBeenCalledWith(ADDRESS);
    expect(redraw).toHaveBeenCalled();
    const host = document.createElement('div');
    host.innerHTML = installAppHtml('firefox');
    const note = host.querySelector('[data-pwa-copy-note]');
    expect(note?.textContent).toContain(ADDRESS);
    expect(note?.textContent).toContain('the browser refused the clipboard');
    expect(host.querySelector('[data-pwa-copy]')!.textContent).toContain('Copy launcher address');
  });

  it('no clipboard at all is the same refusal, with the note', async () => {
    await expect(copyLauncherAddress({ clipboard: null, href: ADDRESS })).resolves.toBe('refused');
    expect(installAppHtml('other')).toContain(ADDRESS);
  });

  it('a copy that lands says Copied for two seconds and drops the note', async () => {
    vi.useFakeTimers();
    try {
      await copyLauncherAddress({ clipboard: null, href: ADDRESS });
      const clip = working();
      const redraw = vi.fn();
      await expect(copyLauncherAddress({ clipboard: clip, href: ADDRESS, redraw })).resolves.toBe('copied');
      expect(clip.writeText).toHaveBeenCalledWith(ADDRESS);
      let html = installAppHtml('firefox');
      expect(html).not.toContain('data-pwa-copy-note');
      expect(html).toContain('Copied');
      vi.advanceTimersByTime(2000);
      html = installAppHtml('firefox');
      expect(html).not.toContain('Copied');
      expect(redraw).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it('a click on the button copies, trusted or not (the clipboard decides); a click elsewhere does not', async () => {
    const clip = working();
    Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
    try {
      onInstallClick({ isTrusted: true, target: { closest: () => null } });
      await flush();
      expect(clip.writeText).not.toHaveBeenCalled();
      onInstallClick({ isTrusted: true, target: { closest: (sel: string) => (sel === '[data-pwa-copy]' ? {} : null) } });
      await flush();
      expect(clip.writeText).toHaveBeenCalledTimes(1);
    } finally { Reflect.deleteProperty(navigator, 'clipboard'); }
  });
});

describe('RB-39: the iOS steps as rows (the design\'s App panel, iOS)', () => {
  it('three numbered rows, each a step and its detail, after the one-line steps', () => {
    expect(IOS_INSTALL_ROWS).toEqual([
      ['1 · Tap Share', 'The square with an arrow, bottom of Safari'],
      ['2 · Add to Home Screen', 'Scroll the share sheet to find it'],
      ['3 · Open from your Home Screen', 'It launches full screen'],
    ]);
    const host = document.createElement('div');
    host.innerHTML = installAppHtml('ios');
    const rows = [...host.querySelectorAll('[data-pwa-ios-steps] [role="listitem"]')];
    expect(rows.map((r) => [r.querySelector('.cx-dialog__lead')?.textContent, r.querySelector('.cx-dialog__note')?.textContent])).toEqual(IOS_INSTALL_ROWS);
    expect(host.querySelector('[data-pwa-ios-steps]')!.getAttribute('role')).toBe('list');
    for (const surface of ['installed', 'chromium', 'firefox', 'android', 'other'] as const) expect(installAppHtml(surface)).not.toContain('data-pwa-ios-steps');
  });
});

describe('RB-39: in the launcher', () => {
  let page: ConsolePage | null = null;
  beforeEach(() => { localStorage.clear(); mountShell(document); });
  afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });
  const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
  function boot(install: InstallSurface) {
    const options = liveOptions(() => { page?.render(); }, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false, install: () => install });
    const sample = sampleAdapters();
    page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
    page.ctl.doAct('opt:app'); page.render();
    page.ctl.press('cross');
    return page.ctl;
  }

  it('Firefox: the dialog shows Copy; a click the clipboard refuses redraws the dialog with the note; Circle still closes', async () => {
    const ctl = boot('firefox');
    expect(ctl.S.overlay).toBe('install');
    const copy = document.querySelector<HTMLElement>('[data-key="install"] [data-pwa-copy]');
    expect(copy).not.toBeNull();
    copy!.click();   // jsdom: no navigator.clipboard, the refusal
    await flush();
    expect(ctl.S.overlay).toBe('install');
    expect(document.querySelector('[data-key="install"] [data-pwa-copy-note]')?.textContent).toContain(launcherAddress());
    ctl.press('circle');
    expect(ctl.S.overlay).toBeNull();
  });

  // RB-45 (b), wave 1's review: a pad's Cross on the dialog copied nothing and said nothing. Cross is the Copy now, the
  // clipboard deciding (a refusal shows the note with the address), and the legend names it.
  it('Firefox: a pad Cross copies (the refusal shows the note) and the legend names Cross Copy launcher address', async () => {
    const ctl = boot('firefox');
    ctl.S.input = 'pad';
    expect(prompts(ctl.S, ctl.A).map((p) => [p.k, p.label])).toContainEqual(['cross', COPY_LAUNCHER_ADDRESS]);
    ctl.press('cross');   // jsdom: no navigator.clipboard, the refusal
    await flush();
    expect(ctl.S.overlay).toBe('install');
    expect(document.querySelector('[data-key="install"] [data-pwa-copy-note]')?.textContent).toContain(launcherAddress());
  });

  it('a pad Cross whose clipboard takes it says Copied; a click on the button writes once, not twice', async () => {
    const clip = working();
    Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
    try {
      const ctl = boot('other');
      ctl.S.input = 'pad';
      ctl.press('cross');
      await flush();
      expect(clip.writeText).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-key="install"] [data-pwa-copy]')?.textContent).toContain('Copied');
      ctl.S.input = 'pointer';
      document.querySelector<HTMLElement>('[data-key="install"] [data-pwa-copy]')!.click();
      await flush();
      expect(clip.writeText).toHaveBeenCalledTimes(2);
    } finally { Reflect.deleteProperty(navigator, 'clipboard'); }
  });

  it('Chromium: a pad Cross cannot install (no activation) and says how on the legend line; no Cross prompt', () => {
    const prompt = vi.fn();
    setInstallPromptForTest(prompt, true);
    const ctl = boot('chromium');
    ctl.S.input = 'pad';
    expect(prompts(ctl.S, ctl.A).map((p) => p.k)).not.toContain('cross');
    ctl.press('cross');
    expect(prompt).not.toHaveBeenCalled();
    expect(ctl.S.overlay).toBe('install');
    expect(ctl.S.legendError).toBe(INSTALL_POINTER_WORDS);
  });
});
