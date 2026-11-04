// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MEDIUS_STATUS, type UsagePolicyService, USAGE_POLICY_RETRIEVING } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveSession } from '../../../src/console/adapters/session';
import { SIGNIN_ADD_NEW_WORDS } from '../../../src/console/render/overlay';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { fetchAccountService } from '../../../src/connectHost';
import { createSession, type ModernSession } from '../../../src/modern/session';
import { mountShell } from '../shell';

/**
 * The console launcher's session adapter (slice 2, part e): the modern session (`../../src/modern/session`, over the
 * original page's account client, `fetchAccountService`; here over a faked `fetch`) behind the SignInDialog -- persona
 * tiles from the card, a name of at most 14 and a password of at most 12 (`@s2u/card`'s persona caps), the session's
 * refusals in its own words -- then the USER AGREEMENT, which is real: after a login the session waits in `agreement`
 * until Accept (Decline asks UIMnLOC #763, Yes signs out); and the sign-out confirm in #793's words, No first. Generated
 * names and passwords only. A browser adaptation with no original (OT.R28).
 */
const BASE = 'https://lobby.test';
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 7)}`;
type Answer = { http?: number; body?: unknown };
interface Call { path: string; body: Record<string, unknown> | null }

function fakeFetch(answers: Partial<Record<string, Answer[]>>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).slice(BASE.length);
    calls.push({ path, body: typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null });
    const a = answers[path]?.shift() ?? { http: 200, body: { status: 0 } };
    return new Response(JSON.stringify(a.body ?? null), { status: a.http ?? 200 });
  }) as typeof fetch;
  return { fetch: fn, calls };
}
const NO_TIMERS = { every: () => () => {}, after: () => () => {} };
const POLICY: UsagePolicyService = { policy: async () => [{ status: 0, policy: 'PLAY FAIR. ', endOfText: false }, { status: 0, policy: 'NO CHEATING.', endOfText: true }] };
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

let page: ConsolePage | null = null;
beforeEach(() => { sessionStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; sessionStorage.clear(); });

function boot(answers: Partial<Record<string, Answer[]>> = {}, policy: UsagePolicyService = POLICY) {
  const f = fakeFetch(answers);
  const modern: ModernSession = createSession(fetchAccountService(BASE, f.fetch), NO_TIMERS);
  const session = liveSession(() => { page?.render(); }, { session: modern, policy });
  const card = { ...sampleAdapters().card, persona: () => 'RANGER7', personas: () => 2, names: () => ['RANGER7', 'NIGHTOWL'] };
  page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, card, session }, { keymap: true });
  return { f, modern, ctl: page.ctl };
}
const success = (): Answer => ({ body: { status: MEDIUS_STATUS.Success, ticket: gen('t') } });
const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';

describe('the session adapter: signing in', () => {
  it('signed out: the player card says Sign in; Triangle opens the dialog with a tile per card persona, then Add new', () => {
    const { ctl } = boot();
    expect(text('#header .cx-player__name')).toBe('Sign in');
    ctl.press('triangle');
    expect(ctl.S.overlay).toBe('signin');
    expect([...document.querySelectorAll('#overlay .cx-persona__name')].map((e) => e.textContent)).toEqual(['RANGER7', 'NIGHTOWL', 'Add new']);
    // ADD-NEW (the owner, 2026-10-17: ""ANOTHER" should just be replaced with "ADD NEW""): the tile's title in the card's
    // personas' casing, drawn upper-case by part G's .cx-persona__name as theirs are; the word Another nowhere in the dialog.
    const last = document.querySelector('#overlay .cx-persona:last-child')!;
    expect([last.getAttribute('role'), last.querySelector('.cx-persona__sub')!.textContent]).toEqual(['radio', 'Type a persona name']);
    expect(text('#overlay')).not.toMatch(/another/i);
    expect(SIGNIN_ADD_NEW_WORDS).toEqual({ title: 'Add new', sub: 'Type a persona name' });
    ctl.press('up');
    ctl.press('up');
    for (let i = 0; i < 5; i++) ctl.press('right');
    expect(ctl.S.si.persona).toBe(2);                    // clamped at Add new
  });

  // CX-25's fold (the merge controller's call, product track): account creation stays in the game's ONLINE flow (its
  // LOGIN, as the original's); the console has no form for it, so its sign-in says where a player with no account goes.
  it('a player with no account is told where to make one: the game\'s ONLINE, before and after a name the server does not know', async () => {
    const { ctl } = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.AccountNotFound } }] });
    ctl.press('triangle');
    const line = (): string => text('#overlay [data-signin-account]');
    expect(line()).toBe('No account yet? Start the game and choose ONLINE to create one.');
    ctl.press('cross');                                   // a key typed into the password
    ctl.press('r2');                                      // SIGN IN: the server knows no such name
    await flush();
    expect(ctl.S.overlay).toBe('signin');
    expect(text('#overlay .cx-field__error')).toBe('No account by that name');
    expect(line()).toBe('No account yet? Start the game and choose ONLINE to create one.');
  });

  /** Signed in as far as the agreement, through the first persona, under `policy`. */
  async function toAgreement(policy: UsagePolicyService): Promise<ConsolePage['ctl']> {
    const { ctl } = boot({ '/account/login': [success()] }, policy);
    ctl.press('triangle');
    ctl.press('cross');
    ctl.press('r2');
    await flush();
    expect(ctl.S.overlay).toBe('agreement');
    return ctl;
  }

  it('CX-26 review F3: a policy that never answers leaves the original\'s first line, "Retrieving Usage Policy....."', async () => {
    await toAgreement({ policy: async () => { throw new Error('offline'); } });
    expect(text('#overlay [data-agreement-text]')).toBe(USAGE_POLICY_RETRIEVING);
  });

  it('CX-26 review F3: a policy that answers with no text leaves the same line', async () => {
    await toAgreement({ policy: async () => [] });
    expect(text('#overlay [data-agreement-text]')).toBe(USAGE_POLICY_RETRIEVING);
  });

  it('CX-26 review F3: the policy\'s text is set as text, never as markup', async () => {
    const raw = '<b>BOLD</b> & <img src=x onerror=alert(1)>';
    await toAgreement({ policy: async () => [{ status: 0, policy: raw, endOfText: true }] });
    const box = document.querySelector('#overlay [data-agreement-text]')!;
    expect(box.textContent).toBe(raw);
    expect(box.querySelector('b, img')).toBeNull();
  });

  it('a login is the agreement, not signed in: the USER AGREEMENT shows its text, Accept first; Accept signs in', async () => {
    const { ctl, f, modern } = boot({ '/account/login': [success()] });
    ctl.press('triangle');
    ctl.press('cross');
    ctl.press('r2');
    expect(ctl.S.si.busy).toBe(true);
    await flush();
    expect(f.calls.find((c) => c.path === '/account/login')!.body).toMatchObject({ name: 'RANGER7', password: 't' });
    expect(modern.state()).toBe('agreement');
    expect(ctl.S.overlay).toBe('agreement');
    expect(text('#overlay .cx-dialog__title')).toBe('User agreement');
    expect(text('#overlay [data-agreement-text]')).toBe('PLAY FAIR. NO CHEATING.');
    expect(document.querySelectorAll('#overlay .cx-toggle')[0]!.classList.contains('is-focused')).toBe(true);
    expect(text('#header .cx-player__name')).toBe('Sign in');               // the agreement is not signed in
    ctl.press('cross');
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.toast).toBe('Signed in as RANGER7');
    expect(text('#header .cx-player__name')).toBe('RANGER7');
  });

  it('a refusal is the session\'s words, once, in the field; the dialog stays', async () => {
    const { ctl } = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.InvalidPassword } }] });
    ctl.press('triangle');
    ctl.press('cross');
    ctl.press('r2');
    await flush();
    expect(ctl.S.overlay).toBe('signin');
    expect(ctl.S.si.busy).toBe(false);
    expect(text('#overlay .cx-field__error')).toBe('Wrong password');
  });

  it('Decline asks #763, No first: No returns to the agreement, Yes signs out', async () => {
    const { ctl, modern, f } = boot({ '/account/login': [success()] });
    ctl.press('triangle');
    ctl.press('cross');
    ctl.press('r2');
    await flush();
    ctl.press('right');                                   // Decline
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('confirm');
    expect(text('#overlay .cx-dialog__lead')).toBe('Not accepting the User Agreement will disconnect you from SOCOM II Online. Are you sure you want to disconnect?');
    expect(ctl.S.confirmRow).toBe(0);
    ctl.press('cross');                                   // No
    expect(ctl.S.overlay).toBe('agreement');
    ctl.press('circle');                                  // Circle is Decline, as Escape is in the modern panel
    ctl.press('down');
    ctl.press('cross');                                   // Yes
    await flush();
    expect(modern.state()).toBe('signed-out');
    expect(ctl.S.overlay).toBeNull();
    expect(f.calls.some((c) => c.path === '/account/logout')).toBe(true);
  });

  it('the password is held to 12 characters; Add new takes a name of at most 14, Done moving on to the password', async () => {
    const { ctl, f } = boot({ '/account/login': [success()] });
    ctl.press('triangle');
    for (let i = 0; i < 20; i++) ctl.press('cross');
    expect(ctl.S.si.text).toHaveLength(12);
    ctl.press('circle');
    ctl.press('triangle');
    ctl.press('up');
    ctl.press('up');
    ctl.press('right');
    ctl.press('right');                                   // Add new
    ctl.press('down');                                    // into the keys: the name field
    expect(ctl.S.si.target).toBe('name');
    expect(document.querySelector('#overlay .cx-osk__key.is-done')!.textContent).toContain('NEXT');
    for (let i = 0; i < 20; i++) ctl.press('cross');      // 1 x 20
    expect(ctl.S.si.name).toHaveLength(14);
    ctl.press('r2');
    expect(ctl.S.si.target).toBe('password');
    ctl.press('cross');
    ctl.press('r2');
    await flush();
    expect(f.calls.find((c) => c.path === '/account/login')!.body).toMatchObject({ name: '1'.repeat(14) });
  });
});

describe('the session adapter: signing out', () => {
  it('the confirm asks #793, No first and focused; Yes logs out and clears the launch target', async () => {
    const { ctl, modern, f } = boot({ '/account/login': [success()] });
    ctl.press('triangle');
    ctl.press('cross');
    ctl.press('r2');
    await flush();
    ctl.press('cross');
    expect(modern.state()).toBe('signed-in');
    ctl.doAct('signout');
    page!.render();                                       // doAct is press's verb; press renders
    expect(text('#overlay .cx-dialog__lead')).toBe('You will be logging off of SOCOM II Online. Are you sure you want to do this?');
    expect([...document.querySelectorAll('#overlay .cx-toggle')].map((e) => e.textContent)).toEqual(['No', 'Yes']);
    expect(document.querySelectorAll('#overlay .cx-toggle')[0]!.classList.contains('is-focused')).toBe(true);
    ctl.press('down');
    ctl.press('cross');
    await flush();
    expect(modern.state()).toBe('signed-out');
    expect(f.calls.some((c) => c.path === '/account/logout')).toBe(true);
    // Was `expect(ctl.S.toast).toBe('Signed out')`: LR-20 (the LR.R11 side-by-side's Q8) removed that toast where the Signed out
    // screen shows -- the screen is the message (grammar.ts `restSignedOut`); the toast stays only elsewhere (over a game).
    expect(ctl.S.overlay).toBe('signedout');
    expect(ctl.S.toast).toBe('');
    expect(text('#header .cx-player__name')).toBe('Sign in');
  });
});
