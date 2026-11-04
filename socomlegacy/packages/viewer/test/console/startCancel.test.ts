// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { ARMING_MS } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, optCategories, type Adapters, type LaunchResult } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * #356's review N2 (the console seat's fix of Fuse's #356, the owner's word through the merge controller): a START that
 * does not mount -- Circle on the launch screen ("Back to launcher"), a refused disc source, the disc gone -- gives the
 * launcher's history back. Before, `release` ran only from the host's `resume`, so after START's walk back the address
 * showed the first launcher entry over the page the player was on, and nothing was written again. A browser adaptation.
 */
let page: ConsolePage | null = null;
const settle = async (ms = 0): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};
beforeEach(() => { window.history.replaceState(null, '', '/'); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; window.history.pushState(null, '', '/'); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

function bootAt(run: () => Promise<LaunchResult>) {
  const sample = sampleAdapters();
  const A: Adapters = { ...sample, disc: { ...sample.disc, state: () => 'ready' }, launch: { run, cancel: vi.fn() } };
  page = bootConsole(document, window, A, { keymap: true, mode: 'page' });
  const ctl = page.ctl;
  ctl.S.cat = CATS.findIndex((c) => c.id === 'options');
  page.render();
  ctl.S.screen = 'options';
  ctl.S.opt.cat = optCategories(ctl.S, ctl.A).findIndex((c) => c.id === 'audio');
  page.render();
  expect(window.location.pathname).toBe('/settings/audio');
  return ctl;
}

describe('#356 review N2: a START that does not mount gives the history back', () => {
  it('Circle on the launch screen after the walk back: the address follows the page again, and later pages write', async () => {
    const ctl = bootAt(() => new Promise<LaunchResult>(() => {}));   // never mounts: the player leaves first
    ctl.press('options');                                            // START
    expect(ctl.S.start).toBe('arming');
    await settle(ARMING_MS);
    expect(ctl.S.overlay).toBe('launch');
    ctl.press('circle');                                             // Back to launcher
    await settle();
    expect(ctl.S.overlay).toBeNull();
    expect(window.location.pathname).toBe('/settings/audio');
    ctl.S.opt.cat = optCategories(ctl.S, ctl.A).findIndex((c) => c.id === 'display');
    page!.render();
    expect(window.location.pathname).toBe('/settings/display');
  });

  it('a START refused after the walk back (the disc gone): the history writes again', async () => {
    const ctl = bootAt(async () => ({ ok: false, error: 'The disc image is no longer open: choose it again' }));
    ctl.press('options');
    await settle(ARMING_MS);
    expect(ctl.S.launch.error).toMatch(/no longer open/);
    ctl.press('circle');                                             // the error read, back to the launcher
    await settle();
    ctl.S.opt.cat = optCategories(ctl.S, ctl.A).findIndex((c) => c.id === 'display');
    page!.render();
    expect(window.location.pathname).toBe('/settings/display');
  });

  it('#356 fix review: Circle while START\'s walk back is still in flight gives the history back once it lands', async () => {
    const ctl = bootAt(() => new Promise<LaunchResult>(() => {}));
    ctl.press('options');
    await new Promise((r) => setTimeout(r, ARMING_MS + 1));          // the arming fired: the walk is queued, not landed
    expect(ctl.S.overlay).toBe('launch');
    ctl.press('circle');
    await settle();
    expect(ctl.S.overlay).toBeNull();
    expect(window.location.pathname).toBe('/settings/audio');
    ctl.S.opt.cat = optCategories(ctl.S, ctl.A).findIndex((c) => c.id === 'display');
    page!.render();
    expect(window.location.pathname).toBe('/settings/display');
  });
});

