// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIUS_STATUS, type UsagePolicyService } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveCard } from '../../src/console/adapters/card';
import { AGREEMENT_ACCEPTED_KEY, AGREEMENT_ACCEPTED_WORDS, liveSession } from '../../src/console/adapters/session';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { fetchAccountService } from '../../src/connectHost';
import { cardProfileEdits } from '../../src/modern/profile/cardEdits';
import { createSession, type ModernSession } from '../../src/modern/session';
import { PAGE_SETTING_KEYS } from '../../src/pageStore';
import { PERSONA_LIST_ROWS } from '@s2u/ui';
import { mountShell } from './shell';

/**
 * AGREEMENT-ONCE (MU.R14 amended, the owner, 2026-10-19, in the merge controller's seat: "Once per device and
 * account"): the modern site's USER AGREEMENT is asked at the first sign-in of an account on this browser; a later
 * sign-in of the same account on the same server -- the reload's quick sign-in included -- accepts it silently and says
 * so in one line, until the agreement's text changes. Decline still signs out. Kept in this browser only (the server
 * records nothing, research 156 §1.4); a storage that refuses simply asks again. A browser adaptation (OT.R28). Over a
 * faked `fetch`, as `persist.test.ts`.
 */
const BASE = 'https://lobby.test';
const HERE = { host: 'lobby.test', port: 10075 } as const;
/** fetch's credentials mode of the remember service (`AccountRequestOptions`). */
const INCLUDE = 'include' as const;
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 7)}`;
type Answer = { http?: number; body?: unknown; wait?: Promise<void> };
interface Call { path: string; body: Record<string, unknown> | null }
function fakeFetch(answers: Partial<Record<string, Answer[]>>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).slice(BASE.length);
    calls.push({ path, body: typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null });
    const a = answers[path]?.shift() ?? { http: 200, body: { status: 0 } };
    if (a.wait) await a.wait;
    return new Response(JSON.stringify(a.body ?? null), { status: a.http ?? 200 });
  }) as typeof fetch;
  return { fetch: fn, calls };
}
const NO_TIMERS = { every: () => () => {}, after: () => () => {} };
const policyOf = (text: string): UsagePolicyService => ({ policy: async () => [{ status: 0, policy: text, endOfText: true }] });
const flush = async (): Promise<void> => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
const success = (): Answer => ({ body: { status: MEDIUS_STATUS.Success, ticket: gen('t') } });
function seedPersona(name: string, remembered = false): void {
  expect(cardProfileEdits().createPersona({ name, host: HERE.host, port: HERE.port, town: '', gender: 0 })).toBe(true);
  if (remembered) expect(cardProfileEdits().setPersonaLogin!({ host: HERE.host, port: HERE.port, name }, { savePassword: true, password: 'xxxxxx' })).toBe(true);
}

let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

function boot(answers: Partial<Record<string, Answer[]>> = {}, policy: UsagePolicyService = policyOf('PLAY FAIR.'), here: { host: string; port: number } = HERE) {
  page?.dispose();
  mountShell(document);
  const f = fakeFetch(answers);
  const plain = fetchAccountService(BASE, f.fetch);
  const remember = fetchAccountService(BASE, f.fetch, undefined, undefined, { credentials: INCLUDE });
  const forget = fetchAccountService(BASE, f.fetch, undefined, undefined, { credentials: INCLUDE, forget: true });
  const modern: ModernSession = createSession(plain, { ...NO_TIMERS, services: { remember, forget } });
  const session = liveSession(() => { page?.render(); }, { session: modern, policy, here: async () => here, card: cardProfileEdits() });
  const A: Adapters = { ...sampleAdapters(), data: 'live', states: undefined, card: liveCard(), session };
  page = bootConsole(document, window, A, { keymap: true, mode: 'page' });
  return { f, modern, ctl: page.ctl };
}
/** The sign-in of `name` typed and submitted, Remember me as `remember`. */
async function signIn(ctl: ReturnType<typeof boot>['ctl'], remember = false): Promise<void> {
  ctl.openSignIn();
  if (!remember && ctl.S.si.remember) ctl.press('l1');
  ctl.S.si.text = gen('pw');
  ctl.siSubmit();
  await flush();
}
/** Accept on the agreement (Cross on its first row), its text answered first. */
async function accept(ctl: ReturnType<typeof boot>['ctl']): Promise<void> {
  await flush();
  expect(ctl.S.overlay).toBe('agreement');
  ctl.press('cross');
  await flush();
}
async function signOut(ctl: ReturnType<typeof boot>['ctl'], modern: ModernSession): Promise<void> {
  await modern.signOut({});
  await flush();
  ctl.render();
}

describe('AGREEMENT-ONCE: the USER AGREEMENT once per device and account (MU.R14 amended, the owner 2026-10-19)', () => {
  it('the first sign-in asks it; after Accept, the same account\'s next sign-in is signed in with the one line, no agreement', async () => {
    const name = gen('n');
    seedPersona(name);
    const { ctl, modern } = boot({ '/account/login': [success(), success()] });
    await flush();
    await signIn(ctl);
    expect(modern.state()).toBe('agreement');
    await accept(ctl);
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.toast).toBe(`Signed in as ${name}`);             // a shown Accept: the plain line
    await signOut(ctl, modern);
    await signIn(ctl);
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.toast).toBe(`Signed in as ${name}. ${AGREEMENT_ACCEPTED_WORDS}`);
  });

  it('the reload\'s quick sign-in of an accepted account is signed in at once, the agreement not shown', async () => {
    const name = gen('n');
    seedPersona(name, true);
    const first = boot({ '/account/login': [success()] });
    await flush();                                                   // the load's quick sign-in: the agreement, the first time
    await accept(first.ctl);
    expect(first.modern.state()).toBe('signed-in');
    const { ctl, modern } = boot({ '/account/login': [success()] });   // the reload, the same browser
    await flush();
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.toast).toBe(`Signed in as ${name}. ${AGREEMENT_ACCEPTED_WORDS}`);
  });

  it('a changed agreement text is asked again', async () => {
    const name = gen('n');
    seedPersona(name);
    const first = boot({ '/account/login': [success()] }, policyOf('PLAY FAIR.'));
    await flush();
    await signIn(first.ctl);
    await accept(first.ctl);
    const { ctl, modern } = boot({ '/account/login': [success()] }, policyOf('PLAY FAIR. NO CHEATS.'));
    await flush();
    await signIn(ctl);
    expect(modern.state()).toBe('agreement');
    expect(ctl.S.overlay).toBe('agreement');
  });

  it('another account on the same browser is asked; the acceptance is the account\'s, not the device\'s', async () => {
    const a = gen('a');
    const b = gen('b');
    seedPersona(a);
    seedPersona(b);
    const { ctl, modern } = boot({ '/account/login': [success(), success()] });
    await flush();
    ctl.openSignIn();
    await signIn(ctl);                                               // the card's first persona
    const first = modern.account()!.name;
    await accept(ctl);
    await signOut(ctl, modern);
    ctl.openSignIn();
    ctl.S.si.persona = ctl.S.si.persona === 0 ? 1 : 0;               // the other persona
    if (ctl.S.si.remember) ctl.press('l1');
    ctl.S.si.text = gen('pw');
    ctl.siSubmit();
    await flush();
    expect(modern.account()!.name).not.toBe(first);
    expect(modern.state()).toBe('agreement');
  });

  it('Decline still signs out, and nothing is remembered', async () => {
    seedPersona(gen('n'));
    const { ctl, modern } = boot({ '/account/login': [success(), success()] });
    await flush();
    await signIn(ctl);
    await flush();
    ctl.press('circle');                                             // Decline's question
    ctl.press('right');
    ctl.press('cross');                                              // Yes: signs out
    await flush();
    expect(modern.state()).toBe('signed-out');
    expect(localStorage.getItem(AGREEMENT_ACCEPTED_KEY)).toBeNull();
    await signIn(ctl);
    expect(modern.state()).toBe('agreement');
  });

  it('an agreement whose text never arrived is not remembered: the next sign-in asks it again', async () => {
    seedPersona(gen('n'));
    const silent: UsagePolicyService = { policy: async () => { throw new Error('no answer'); } };
    const { ctl, modern } = boot({ '/account/login': [success(), success()] }, silent);
    await flush();
    await signIn(ctl);
    await accept(ctl);
    expect(modern.state()).toBe('signed-in');
    expect(localStorage.getItem(AGREEMENT_ACCEPTED_KEY)).toBeNull();
    await signOut(ctl, modern);
    await signIn(ctl);
    expect(modern.state()).toBe('agreement');
  });

  it('a storage that refuses (a private window) simply asks again; the sign-in itself goes through', async () => {
    seedPersona(gen('n'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const { ctl, modern } = boot({ '/account/login': [success(), success()] });
    await flush();
    await signIn(ctl);
    await accept(ctl);
    expect(modern.state()).toBe('signed-in');
    await signOut(ctl, modern);
    await signIn(ctl);
    expect(modern.state()).toBe('agreement');
  });

  it('"Forget this device" forgets the account\'s acceptance too', async () => {
    seedPersona(gen('n'));
    const { ctl, modern } = boot({ '/account/login': [success(), success()] });
    await flush();
    await signIn(ctl);
    await accept(ctl);
    await page!.ctl.A.session.signOut(true);
    await flush();
    await signIn(ctl);
    expect(modern.state()).toBe('agreement');
  });

  it('keeps no password, and its key is the page\'s inventory', async () => {
    const name = gen('n');
    seedPersona(name);
    const { ctl } = boot({ '/account/login': [success()] });
    await flush();
    ctl.openSignIn();
    if (ctl.S.si.remember) ctl.press('l1');
    const pw = gen('pw');
    ctl.S.si.text = pw;
    ctl.siSubmit();
    await accept(ctl);
    const kept = localStorage.getItem(AGREEMENT_ACCEPTED_KEY) ?? '';
    expect(kept).toContain(name);
    expect(kept).not.toContain(pw);
    expect(kept).not.toContain('PLAY FAIR');                         // a digest of the text, not the text
    expect(PAGE_SETTING_KEYS).toContain(AGREEMENT_ACCEPTED_KEY);
  });
});

/** The review's folds (AGREEMENT-ONCE's fresh review, 2026-10-19). */
describe('AGREEMENT-ONCE, the review\'s folds', () => {
  /** The sign-in's Add new tile, a typed name and password (`persist.test.ts`'s fold A helper). */
  function addNew(ctl: ReturnType<typeof boot>['ctl'], name: string, remember: boolean): void {
    ctl.openSignIn();
    if (ctl.S.si.remember !== remember) ctl.press('l1');
    ctl.S.si.persona = ctl.A.card.personas();
    ctl.S.si.name = name;
    ctl.S.si.target = 'password';
    ctl.S.si.text = gen('pw');
    ctl.siSubmit();
  }

  it('F1: a remembered sign-in the card refuses still says why, beside the agreement\'s line', async () => {
    for (let i = 0; i < PERSONA_LIST_ROWS; i++) seedPersona(gen(`p${i}`));
    const name = gen('new');
    const { ctl, modern } = boot({ '/account/login': [success(), success()] });
    await flush();
    addNew(ctl, name, false);                                        // unticked: nothing filed, the agreement asked
    await accept(ctl);
    await signOut(ctl, modern);
    addNew(ctl, name, true);                                         // ticked: the card is full, so not remembered
    await flush();
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.toast).toContain(AGREEMENT_ACCEPTED_WORDS);
    expect(ctl.S.toast).toMatch(/not remembered/i);
  });

  it('F3: the same name on another server is asked: the acceptance is the server\'s too', async () => {
    const name = gen('n');
    seedPersona(name);
    const first = boot({ '/account/login': [success()] });
    await flush();
    await signIn(first.ctl);
    await accept(first.ctl);
    const { ctl, modern } = boot({ '/account/login': [success()] }, policyOf('PLAY FAIR.'), { host: HERE.host, port: HERE.port + 1 });
    await flush();
    addNew(ctl, name, false);
    await flush();
    expect(modern.state()).toBe('agreement');
  });

  it('F3: the reload\'s quick sign-in asks again when the text changed', async () => {
    seedPersona(gen('n'), true);
    const first = boot({ '/account/login': [success()] }, policyOf('PLAY FAIR.'));
    await flush();
    await accept(first.ctl);
    const { ctl, modern } = boot({ '/account/login': [success()] }, policyOf('PLAY FAIR. NO CHEATS.'));
    await flush();
    expect(modern.state()).toBe('agreement');
    expect(ctl.S.overlay).toBe('agreement');
  });

  it('F3: an accepted quick sign-in arriving while another dialog is open says its line when that dialog closes (fold B)', async () => {
    const name = gen('n');
    seedPersona(name, true);
    const first = boot({ '/account/login': [success()] });
    await flush();
    await accept(first.ctl);
    let release!: () => void;
    const wait = new Promise<void>((r) => { release = r; });
    const { ctl, modern } = boot({ '/account/login': [{ ...success(), wait }] });
    await flush();
    ctl.doAct('news');                                               // a dialog the player opened meanwhile
    ctl.render();
    release();
    await flush();
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.overlay).toBe('news');                              // not taken from the player
    ctl.press('circle');                                             // closed: the pending answer is said
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.toast).toBe(`Signed in as ${name}. ${AGREEMENT_ACCEPTED_WORDS}`);
  });
});
