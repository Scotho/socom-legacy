// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-12 (the launcher redesign plan; LR-1's leftover, review-lr-4 F4): the "Signed out" resting screen
 * (`render/signedOut.ts`) wired. When it shows: a sign-out from the launcher page (Profile > Sign out, Yes, or Yes and
 * forget this device) once the session has signed out -- not over a game (the overlay keeps its own flow). How it leaves:
 * Cross (Enter, a click on it) opens the sign-in with the persona just signed out of chosen (the quick sign-in is the
 * page load's, once: `adapters/session.ts` `quick`, so no new request); with "forget this device" none is remembered and
 * the line only signs in; Circle (Escape) closes it onto the launcher, signed out (MODAL-CLOSE, OT.R62). A browser
 * adaptation: the launcher's look, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

function boot(o: { forgets?: boolean; mode?: 'page' | 'overlay' } = {}) {
  const sample = sampleAdapters();
  let signed = true;
  const A: Adapters = {
    ...sample,
    card: { ...sample.card, names: () => ['ALPHA-1', 'WRAITH-6'] },
    session: { ...sample.session, signedIn: () => signed, persona: () => (signed ? 'WRAITH-6' : ''), async signOut() { signed = false; }, ...(o.forgets ? { forgets: () => true } : {}) },
  };
  page = bootConsole(document, window, A, { keymap: true, ...(o.mode ? { mode: o.mode } : {}) });
  return page.ctl;
}
const screen = (): HTMLElement | null => document.querySelector<HTMLElement>('#overlay .cx-signedout');
const lineOf = (el: HTMLElement): string => el.querySelector('.cx-signedout__line')!.textContent!.replace(/\s+/g, ' ').trim();

async function signOut(ctl: ReturnType<typeof boot>, forget = false): Promise<void> {
  ctl.doAct('signout');
  ctl.press('down');
  if (forget) ctl.press('down');
  ctl.press('cross');
  await flush();
}

describe('LR-12: the Signed out resting screen, wired', () => {
  it('shows after a sign-out from the launcher, as the persona signed out of, and takes the focus', async () => {
    const ctl = boot();
    await signOut(ctl);
    expect(ctl.S.overlay).toBe('signedout');
    const s = screen()!;
    expect(s).not.toBeNull();
    expect(s.querySelector('.cx-signedout__ring')!.textContent).toBe('W6');
    expect(lineOf(s)).toBe('Press Cross to sign in as WRAITH-6');
    expect(document.activeElement).toBe(s);
  });

  it('Cross opens the sign-in with that persona chosen', async () => {
    const ctl = boot();
    await signOut(ctl);
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('signin');
    expect(ctl.S.si.persona).toBe(1);
    expect(screen()).toBeNull();
  });

  it('a click on the screen is Cross', async () => {
    const ctl = boot();
    await signOut(ctl);
    screen()!.querySelector<HTMLElement>('.cx-signedout__line')!.click();
    expect(ctl.S.overlay).toBe('signin');
  });

  it('Circle closes it onto the launcher, signed out', async () => {
    const ctl = boot();
    await signOut(ctl);
    ctl.press('circle');
    expect(ctl.S.overlay).toBeNull();
    expect(screen()).toBeNull();
    expect(ctl.A.session.signedIn()).toBe(false);
  });

  it('"forget this device": none remembered, the line only signs in', async () => {
    const ctl = boot({ forgets: true });
    await signOut(ctl, true);
    expect(ctl.S.overlay).toBe('signedout');
    expect(screen()!.querySelector('.cx-signedout__ring')!.textContent).toBe('');
    expect(lineOf(screen()!)).toBe('Press Cross to sign in');
  });

  it('the sign-out\'s No draws nothing of it', async () => {
    const ctl = boot();
    ctl.doAct('signout');
    ctl.press('cross');                                                // No, first and focused
    await flush();
    expect(ctl.S.overlay).toBeNull();
    expect(screen()).toBeNull();
  });
});
