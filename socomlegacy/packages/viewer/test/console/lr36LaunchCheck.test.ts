// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveControls } from '../../src/console/adapters/controls';
import { ARMING_MS } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { optCategories, type Adapters } from '../../src/console/state';
import { prompts } from '../../src/console/render/legend';
import { mountShell } from './shell';

/**
 * LR-36 (LR.R30, the owner, 2026-10-28, the dispatch seat: "pressing PLAY SOCOM 2 while controller is not connected was
 * meant to bring up the right aligned pre-launch UI that the mockup contained, not take them directly to controller
 * setttings"): with no controller, Play's Cross opens the mockup's "Before you deploy" panel (S2 Launcher v2.dc.html,
 * `playPressed` -> `openCheck`, its `case 'launch'` rows: the disc check, the controller check, a spacer, Deploy, the
 * "Controller settings" link), the cursor on the first check not ready; a pad waking while it is open moves the cursor to
 * Deploy (the mockup's `autoF`), and Deploy then launches. Was (LR-31, LR.R25): Play's Cross jumped to Settings > System
 * Settings > Controller. The dispatcher's reading (LR.R30): no "Deploy with keyboard" -- with no pad Deploy is muted and
 * its Cross only says why (LR.R25's gate stands). A release build here: the pad decides, a key or a click never counts
 * (LR-31, `launcherStart.test.ts`). A browser adaptation: the launcher's flow, nothing of the game.
 */
let page: ConsolePage | null = null;
let padOn = false;
let disc: 'ready' | 'empty' | 'reading' = 'ready';
beforeEach(() => { padOn = false; disc = 'ready'; vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

/** A release build: the live controls over a pad that is `padOn`, the sample adapters' disc as `disc` says. */
function release(): { ctl: ConsolePage['ctl']; A: Adapters } {
  vi.stubEnv('DEV', false);
  const A: Adapters = { ...sampleAdapters(), controls: liveControls({ connected: () => padOn }, { touch: () => false, keyboard: () => false }) };
  A.disc.state = () => disc;
  page = bootConsole(document, window, A, { keymap: false });
  return { ctl: page.ctl, A };
}

/** The "Before you deploy" panel on the launcher page's Home; null while it is shut. */
const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage .cx-home [data-panel="launch"]');
/** The panel's focused row's id (`disc`, `pad`, `deploy`, `skipmenu`, `padsettings`); null with none. */
const focused = (): string | null => panel()?.querySelector<HTMLElement>('.cx-r.is-focused')?.dataset['id'] ?? null;
const word = (ctl: ConsolePage['ctl'], k: string): string | undefined => prompts(ctl.S, ctl.A).find((x) => x.k === k)?.label;
const clickPlay = (): void => { document.querySelector<HTMLElement>('#stage .cx-list .cx-item--play')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };

describe('LR-36: Play with no controller opens the "Before you deploy" panel (was LR-31: the jump to Settings > Controller)', () => {
  it('Cross on Play: Home stays, the panel opens on the controller check, nothing starts', () => {
    const { ctl } = release();
    ctl.press('cross');
    expect(ctl.S.screen, 'Home stays under the panel (was: Settings > System Settings > Controller)').toBe('home');
    expect(panel(), 'the launch check panel').not.toBeNull();
    expect(focused(), 'the cursor on the first check not ready: the controller').toBe('pad');
    expect(ctl.S.start).toBe('idle');
    expect(panel()!.querySelector('.cx-title')!.textContent).toBe('Before you deploy');
    // the mockup's rows, in its order: the two checks, a spacer, Deploy (muted: no keyboard deploy), the link
    expect([...panel()!.querySelectorAll<HTMLElement>('.cx-r[data-id]')].map((r) => r.dataset['id'])).toEqual(['disc', 'pad', 'deploy', 'skipmenu', 'padsettings']);   // SKIP-MENU (LR.R33): its toggle above the link
    expect(panel()!.querySelector('.cx-r.is-spacer')).not.toBeNull();
    expect(panel()!.querySelector('[data-id="deploy"]')!.classList.contains('is-muted')).toBe(true);
    expect(panel()!.querySelector('[data-id="deploy"] .cx-r__hint')!.textContent).toBe('Connect a controller');
    expect(panel()!.querySelector('[data-id="pad"]')!.classList.contains('is-ok')).toBe(false);
    expect(panel()!.querySelector('[data-id="disc"]')!.classList.contains('is-ok')).toBe(true);
    // one focus: Play's row is not lit while the panel has it
    expect(document.querySelector('#stage .cx-list .cx-item--play')!.classList.contains('is-focused')).toBe(false);
  });

  it('a click on Play opens the same panel', () => {
    const { ctl } = release();
    clickPlay();
    expect(ctl.S.screen).toBe('home');
    expect(focused()).toBe('pad');
    expect(ctl.S.start).toBe('idle');
  });

  it('the legend names the panel\'s presses: the row\'s Cross, Circle Back; Deploy muted names its need', () => {
    const { ctl } = release();
    expect(word(ctl, 'cross'), 'Play\'s Cross before it opens (LR-23\'s words, unchanged)').toBe('Play SOCOM II: controller needed');
    ctl.press('cross');
    expect(word(ctl, 'circle')).toBe('Back');
    ctl.press('down');
    expect(focused()).toBe('deploy');
    expect(word(ctl, 'cross')).toBe('Deploy: controller needed');
    ctl.press('down');
    expect(focused()).toBe('skipmenu');                                // SKIP-MENU (LR.R33)
    expect(word(ctl, 'cross')).toBe('Toggle');
    ctl.press('down');
    expect(focused()).toBe('padsettings');
    expect(word(ctl, 'cross')).toBe('Open');
  });

  it('Deploy with no controller does nothing but say why (no keyboard deploy, LR.R30)', () => {
    const { ctl } = release();
    ctl.press('cross');
    ctl.press('down');
    ctl.press('cross');
    expect(ctl.S.start).toBe('idle');
    expect(ctl.S.legendError).toBe('Connect a controller to start.');
    expect(panel(), 'the panel stays open').not.toBeNull();
  });

  it('a pad waking while the panel is open moves the cursor to Deploy, and Deploy launches', async () => {
    const { ctl } = release();
    ctl.press('cross');
    expect(focused()).toBe('pad');
    padOn = true;
    ctl.render();                                                    // the pad adapter's change re-draws the page
    expect(focused(), 'the mockup\'s autoF: the cursor to Deploy').toBe('deploy');
    expect(panel()!.querySelector('.cx-title')!.textContent).toBe('Ready to deploy');
    expect(panel()!.querySelector('[data-id="deploy"]')!.classList.contains('is-primary')).toBe(true);
    expect(word(ctl, 'cross')).toBe('Deploy');
    ctl.press('cross');
    expect(ctl.S.start).toBe('arming');
    expect(panel(), 'the panel closes as the launch arms').toBeNull();
    await vi.advanceTimersByTimeAsync(ARMING_MS);
    expect(ctl.S.start).toBe('launching');
    expect(ctl.S.overlay).toBe('launch');
  });

  it('the cursor moves to Deploy once: moved back up, it stays where the player put it', () => {
    const { ctl } = release();
    ctl.press('cross');
    padOn = true;
    ctl.render();
    ctl.press('up');
    ctl.render();
    expect(focused()).toBe('pad');
  });

  it('"Controller settings" goes where LR-31 jumped: Settings > System Settings > Controller, the panel shut', () => {
    const { ctl, A } = release();
    ctl.press('cross');
    ctl.press('down');
    ctl.press('down');
    ctl.press('down');                                                 // SKIP-MENU (LR.R33): past its toggle
    expect(focused()).toBe('padsettings');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('options');
    expect(optCategories(ctl.S, A)[ctl.S.opt.cat]?.id).toBe('controller');
    expect(ctl.S.start).toBe('idle');
  });

  it('a click on "Controller settings" does the same', () => {
    const { ctl, A } = release();
    ctl.press('cross');
    panel()!.querySelector<HTMLElement>('[data-id="padsettings"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ctl.S.screen).toBe('options');
    expect(optCategories(ctl.S, A)[ctl.S.opt.cat]?.id).toBe('controller');
  });

  it('Circle shuts the panel, the focus back on Play, nothing started', () => {
    const { ctl } = release();
    ctl.press('cross');
    ctl.press('circle');
    expect(panel()).toBeNull();
    expect(ctl.S.screen).toBe('home');
    expect(document.querySelector('#stage .cx-list .cx-item--play')!.classList.contains('is-focused')).toBe(true);
    expect(ctl.S.start).toBe('idle');
  });

  it('the panel holds the pad: L1 / R1 and Left / Right move nothing behind it', () => {
    const { ctl } = release();
    const cat = ctl.S.cat;
    ctl.press('cross');
    ctl.press('r1');
    ctl.press('right');
    expect(ctl.S.cat).toBe(cat);
    expect(panel()).not.toBeNull();
  });

  it('the disc gone while the panel is open: Deploy says "Disc required"', () => {
    const { ctl } = release();
    ctl.press('cross');
    disc = 'empty';
    ctl.render();
    expect(panel()!.querySelector('[data-id="disc"]')!.classList.contains('is-ok')).toBe(false);
    expect(panel()!.querySelector('[data-id="deploy"] .cx-r__hint')!.textContent).toBe('Disc required');
    ctl.press('down');
    expect(focused()).toBe('deploy');
    ctl.press('cross');
    expect(ctl.S.legendError).toBe('Disc required');
    expect(ctl.S.start).toBe('idle');
  });

  // The LR-36 fold (the dispatcher, 2026-10-28, following the mockup's `openCheck`: start = !disc ? 0 : !pads ? 1 : 2;
  // LR.R30 amended): with no disc Play opens the panel too, on its disc row (was: LR-23's chooser at once, LR.R30 (b)).
  it('no disc: Play\'s Cross opens the panel on the disc row, no chooser; a click on the row opens it, in the click\'s own event', () => {
    disc = 'empty';
    const { ctl, A } = release();
    const choose = vi.fn(async () => false);
    A.disc.choose = choose;
    expect(word(ctl, 'cross'), 'Play\'s Cross names the need before it opens').toBe('Play SOCOM II: disc needed');
    ctl.press('cross');
    expect(choose, 'no chooser from Play itself').not.toHaveBeenCalled();
    expect(ctl.S.screen).toBe('home');
    expect(panel(), 'the launch check panel').not.toBeNull();
    expect(focused(), 'the first check not ready: the disc').toBe('disc');
    expect(panel()!.querySelector('[data-id="disc"]')!.classList.contains('is-ok')).toBe(false);
    expect(panel()!.querySelector('[data-id="deploy"] .cx-r__hint')!.textContent).toBe('Disc required');
    expect(word(ctl, 'cross')).toBe('Choose disc');
    panel()!.querySelector<HTMLElement>('[data-id="disc"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(ctl.S.start).toBe('idle');
  });

  it('no disc, a click on Play: the same panel on the disc row (the real page: a click there opened the chooser, unseen headless)', () => {
    disc = 'empty';
    const { ctl, A } = release();
    const choose = vi.fn(async () => false);
    A.disc.choose = choose;
    clickPlay();
    expect(choose).not.toHaveBeenCalled();
    expect(focused()).toBe('disc');
    expect(ctl.S.start).toBe('idle');
  });

  it('no disc, the pad\'s Cross on the disc row: no chooser (a pad press is no user gesture), LR-25\'s line says to use the pointer', () => {
    disc = 'empty';
    const { ctl, A } = release();
    const choose = vi.fn(async () => false);
    A.disc.choose = choose;
    ctl.S.input = 'pad';
    ctl.press('cross');
    expect(focused()).toBe('disc');
    ctl.press('cross');
    expect(choose).not.toHaveBeenCalled();
    expect(ctl.S.legendError).toContain('with the pointer');
    expect(panel(), 'the panel stays open').not.toBeNull();
  });

  it('no disc and no pad: the disc chosen while the panel is open, its cursor stays where the player put it; Deploy then needs the controller', () => {
    disc = 'empty';
    const { ctl } = release();
    ctl.press('cross');
    expect(focused()).toBe('disc');
    disc = 'ready';
    ctl.render();
    expect(focused(), 'no move to Deploy: the launch is not ready yet').toBe('disc');
    expect(panel()!.querySelector('[data-id="deploy"] .cx-r__hint')!.textContent).toBe('Connect a controller');
    padOn = true;
    ctl.render();
    expect(focused(), 'ready: the cursor to Deploy').toBe('deploy');
  });

  it('the disc still read: Play\'s Cross opens the panel on the disc row; its Cross there says the disc is being read', () => {
    disc = 'reading';
    const { ctl, A } = release();
    const choose = vi.fn(async () => false);
    A.disc.choose = choose;
    ctl.press('cross');
    expect(focused()).toBe('disc');
    ctl.press('cross');
    expect(choose).not.toHaveBeenCalled();
    expect(ctl.S.legendError).toBe('Your disc is still being read.');
  });

  it('with a disc and a pad Play\'s Cross launches at once, no panel (unchanged)', () => {
    padOn = true;
    const { ctl } = release();
    ctl.press('cross');
    expect(ctl.S.start).toBe('arming');
    expect(panel()).toBeNull();
  });
});
