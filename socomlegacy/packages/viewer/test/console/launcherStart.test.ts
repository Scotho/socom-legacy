// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveControls } from '../../src/console/adapters/controls';
import { ARMING_MS } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS } from '../../src/console/state';
import { prompts } from '../../src/console/render/legend';
import { mountShell } from './shell';

/**
 * The launcher's START on a normal build (OT.R29, amended 2026-10-20 by Craig: the launcher is excluded from
 * controller-only). Enter, Space, the console's OPTIONS key (o) and the original menu START (P, `MENU_KEYS_READING`)
 * press START, and a click on the START button does too, including a release. The development keymap is unchanged:
 * there Enter is still Cross. In-game controls stay a development build's. A browser adaptation (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { padOn = true; vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); });

/**
 * A release build: no touch screen, the keyboard not forced on, a pad connected or not (LR-31: Play is gated on a
 * connected controller, LR.R25 -- was: a key or a click seen counted). Disc ready, as the sample adapters are.
 */
let padOn = true;
function release(): ConsolePage['ctl'] {
  vi.stubEnv('DEV', false);
  const controls = liveControls({ connected: () => padOn }, { touch: () => false, keyboard: () => false });
  expect(controls.ready(), 'the pad decides').toBe(padOn);
  page = bootConsole(document, window, { ...sampleAdapters(), controls }, { keymap: false });
  return page.ctl;
}

function key(k: string, code = ''): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }));
}

async function launched(ctl: ConsolePage['ctl']): Promise<void> {
  expect(ctl.S.start).toBe('arming');
  await vi.advanceTimersByTimeAsync(ARMING_MS);
  expect(ctl.S.start).toBe('launching');
  expect(ctl.S.overlay).toBe('launch');
  expect(document.querySelector('#overlay .cx-launch')).not.toBeNull();
}

describe('a non-dev launcher: keyboard and mouse press START', () => {
  it('pressing Enter reaches the launch screen', async () => {
    const ctl = release();
    key('Enter', 'Enter');
    await launched(ctl);
    expect(ctl.A.controls!.ready()).toBe(true);
    expect(ctl.A.controls!.line()).toBe('Controller connected');
  });

  it.each([
    ['Space', ' ', 'Space'],
    ['the console OPTIONS key', 'o', 'KeyO'],
    ['the original menu START', 'p', 'KeyP'],
  ] as const)('%s reaches the launch screen', async (_name, k, code) => {
    const ctl = release();
    key(k, code);
    await launched(ctl);
  });

  it('a click on START reaches the launch screen', async () => {
    // LR-23 (LR.R22, "Start game, gone"): on Home the START is Play (was: the legend's START pill); its click is a START press.
    const ctl = release();
    expect(document.querySelector('#legend .cx-start')).toBeNull();
    const button = document.querySelector<HTMLButtonElement>('#stage .cx-list .cx-item--play');
    expect(button).not.toBeNull();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await launched(ctl);
    expect(ctl.A.controls!.ready()).toBe(true);
    expect(ctl.A.controls!.line()).toBe('Controller connected');
  });

  it('an arrow does nothing, and Enter does not start while a popup is open', () => {
    const ctl = release();
    key('ArrowRight', 'ArrowRight');
    expect(ctl.S.start).toBe('idle');
    ctl.openSignIn();
    ctl.render();
    key('Enter', 'Enter');
    expect(ctl.S.overlay).toBe('signin');
    expect(ctl.S.start).toBe('idle');
  });
});

/** A key pressed on `target`; whether the page took it (its default prevented). */
function keyOn(target: EventTarget, k: string, code = ''): boolean {
  const ev = new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
}

// The #400 fold (its review's findings 2-4; the owner's launcher exception, 2026-10-20).
describe('the #400 fold: a focused control, the overlay, and the cue', () => {
  it('Enter and Space on a focused button stay the button\'s own; o still presses START', () => {
    const ctl = release();
    const button = document.querySelector<HTMLButtonElement>('#stage button');
    expect(button, 'a button on Home').not.toBeNull();
    button!.focus();
    expect(keyOn(button!, 'Enter', 'Enter'), 'Enter is not taken from the focused button').toBe(false);
    expect(keyOn(button!, ' ', 'Space'), 'nor Space').toBe(false);
    expect(ctl.S.start).toBe('idle');
    keyOn(button!, 'o', 'KeyO');
    expect(ctl.S.start).toBe('arming');
  });

  it('over a game page (overlay mode) the START keys are not read, and their default is left alone', () => {
    vi.stubEnv('DEV', false);
    const controls = liveControls({ connected: () => false }, { touch: () => false, keyboard: () => false });
    page = bootConsole(document, window, { ...sampleAdapters(), controls }, { keymap: false, mode: 'overlay' });
    expect(keyOn(document, 'Enter', 'Enter')).toBe(false);
    expect(keyOn(document, ' ', 'Space')).toBe(false);
    expect(page.ctl.S.start).toBe('idle');
  });

  it('a START key plays the confirm cue, as the pad\'s OPTIONS does (CX-51)', () => {
    vi.stubEnv('DEV', false);
    const played: string[] = [];
    const controls = liveControls({ connected: () => true }, { touch: () => false, keyboard: () => false });
    page = bootConsole(document, window, { ...sampleAdapters(), controls, cue: { selection: () => {}, play: (c) => { played.push(c); } } }, { keymap: false });
    key('Enter', 'Enter');
    expect(page.ctl.S.start).toBe('arming');
    expect(played).toEqual(['confirm']);
  });
});

// The merge controller's call on #400 (2026-10-20, product track): an invite address's auto-START (INVITE-START,
// `adapters/invite.ts`) never fires from a click. LR-31 (LR.R25) goes further: no click or key marks the input ready at all
// -- only a connected controller (or a touch screen) does -- so no click elsewhere, and none on Play, starts without one.
describe('no click marks the input ready (LR-31)', () => {
  it('a click elsewhere (the page, another control) and a click on Play with no controller mark nothing', () => {
    padOn = false;
    const ctl = release();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    // LR-24: the page's rail has no R1 chip (LR.R23 (a)): the next category's own button (was: `.cx-crossbar__hint--r`).
    document.querySelector<HTMLElement>('#stage .cx-cat[aria-label="Online"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ctl.A.controls!.ready(), 'no controller').toBe(false);
    document.querySelector<HTMLElement>('#stage .cx-cat[aria-label="Home"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));   // LR-24 (was: the L1 chip)
    document.querySelector<HTMLButtonElement>('#stage .cx-list .cx-item--play')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ctl.A.controls!.ready(), 'a click on Play is not a controller').toBe(false);
    expect(ctl.S.start).toBe('idle');
  });
});

// LR-31 (LR.R25, the owner, 2026-10-27: "PLAY should gate playing the match if no controller is connected in the same way
// it does for the disc"): with no controller, a key or a click on Play opens the controller check instead of starting, and
// the legend's Cross says so; a pad connecting later releases it. Was: a key or a click seen counted as the input.
describe('LR-31: Play is gated on a connected controller', () => {
  const sees = (ctl: ConsolePage['ctl']): string[] => [ctl.S.start, ctl.S.screen, String(ctl.S.opt.cat)];
  it.each([
    ['Enter', 'Enter', 'Enter'],
    ['Space', ' ', 'Space'],
    ['the console OPTIONS key', 'o', 'KeyO'],
    ['the original menu START', 'p', 'KeyP'],
  ] as const)('with no controller %s does not start', (_name, k, code) => {
    padOn = false;
    const ctl = release();
    key(k, code);
    expect(ctl.S.start).toBe('idle');
    expect(ctl.A.controls!.ready()).toBe(false);
  });
  // LR-36 (LR.R30, the owner, 2026-10-28): the check Play opens is the mockup's "Before you deploy" panel over Home, on
  // its controller row (lr36LaunchCheck.test.ts); was (LR-31): Settings > System Settings > Controller, now its link.
  it('a click on Play, and Cross on Play, open the launch check (LR-36; was: Settings > Controller) and start nothing', () => {
    padOn = false;
    const ctl = release();
    document.querySelector<HTMLButtonElement>('#stage .cx-list .cx-item--play')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ctl.S.start).toBe('idle');
    expect(ctl.S.screen).toBe('home');
    expect(document.querySelector('#stage [data-panel="launch"] .cx-r.is-focused[data-id="pad"]')).not.toBeNull();
    expect(sees(ctl)[0]).toBe('idle');
  });
  it('the legend Cross names the need, in the PS2 look too, and a pad connecting releases Play', () => {
    padOn = false;
    const ctl = release();
    expect(prompts(ctl.S, ctl.A).find((x) => x.k === 'cross')?.label).toBe('Play SOCOM II: controller needed');
    padOn = true;
    expect(prompts(ctl.S, ctl.A).find((x) => x.k === 'cross')?.label).toBe('Play SOCOM II');
  });
  it('a key seen never counts as the input in a release build (note marks nothing that counts)', () => {
    padOn = false;
    const ctl = release();
    ctl.A.controls!.note!('keyboard');
    ctl.A.controls!.note!('pointer');
    expect(ctl.A.controls!.ready()).toBe(false);
    expect(ctl.A.controls!.line()).toBe('Controller needed');
  });
});

describe('a development build keeps its keymap', () => {
  it('Enter is Cross, not START', () => {
    vi.stubEnv('DEV', true);
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    // LR-23: Cross on Play is the launch itself, so Cross is read on the next item (LR-37 (4): Server status, its Cross the
    // Server screen; was Memory card's, Profile).
    key('ArrowDown', 'ArrowDown');
    key('Enter', 'Enter');
    expect(page.ctl.S.start).toBe('idle');
    expect(page.ctl.S.overlay).toBeNull();
    expect(page.ctl.S.screen).toBe('server');
  });
});
