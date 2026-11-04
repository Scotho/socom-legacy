// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIUS_STATUS, type UsagePolicyService } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveCard } from '../../src/console/adapters/card';
import { liveSession } from '../../src/console/adapters/session';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { fetchAccountService } from '../../src/connectHost';
import { cardProfileEdits } from '../../src/modern/profile/cardEdits';
import { createSession, type ModernSession } from '../../src/modern/session';
import { PERSONA_LIST_ROWS } from '@s2u/ui';
import { PERSONA_TOWN_READING } from '@s2u/card';
import { mountShell } from './shell';

/**
 * PERSONA-PERSIST (a) (the console launcher plan; MISSION OT.R61, the owner, 2026-10-17: "i was hoping for the page to
 * persist logged in personas into the game and as well as across refreshes"): the console's sign-in persists across a
 * reload through the server's remember cookie (SVC-03a, `packages/central/src/accountHttp.ts` steps 1 to 7). "Remember me"
 * is ticked by default and may be unticked; a remembered sign-in files the persona through the card package's own writer
 * with SAVE PASSWORD: YES and the password's length only; at the launcher's load the card's remembered persona for this
 * server is tried once by a quick sign-in; -978 asks for the password once; Sign out keeps the token, and "Forget this
 * device" drops it and files NO. No password is stored anywhere, and the page never reads `document.cookie` (the cookie
 * is HttpOnly). A browser adaptation of the console's sign-in (OT.R28; product track, OT.R53). Generated names and
 * passwords only, over a faked `fetch`; the card is the page's own (`pageCard`, on jsdom's localStorage).
 */
const BASE = 'https://lobby.test';
const HERE = { host: 'lobby.test', port: 10075 } as const;
/** fetch's credentials mode of the remember service (`AccountRequestOptions`). */
const INCLUDE = 'include' as const;
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 7)}`;
/** An answer; `wait`, held until it settles (an answer that arrives later). */
type Answer = { http?: number; body?: unknown; wait?: Promise<void> };
interface Call { path: string; credentials: RequestCredentials | undefined; body: Record<string, unknown> | null }

function fakeFetch(answers: Partial<Record<string, Answer[]>>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).slice(BASE.length);
    calls.push({ path, credentials: init.credentials, body: typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null });
    const a = answers[path]?.shift() ?? { http: 200, body: { status: 0 } };
    if (a.wait) await a.wait;
    return new Response(JSON.stringify(a.body ?? null), { status: a.http ?? 200 });
  }) as typeof fetch;
  return { fetch: fn, calls };
}
const NO_TIMERS = { every: () => () => {}, after: () => () => {} };
const POLICY: UsagePolicyService = { policy: async () => [{ status: 0, policy: 'PLAY FAIR.', endOfText: true }] };
const flush = async (): Promise<void> => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };
const success = (): Answer => ({ body: { status: MEDIUS_STATUS.Success, ticket: gen('t') } });

/** The card's record of `name` for this server. */
const recordOf = (name: string) => cardProfileEdits().personas().find((p) => p.NAME === name && p.HOST === HERE.host && p.PORT === HERE.port);
/** A persona on the page's card for this server, as the console's New persona files it (NO: nothing of a password). */
function seedPersona(name: string, remembered = false, length = 0): void {
  expect(cardProfileEdits().createPersona({ name, host: HERE.host, port: HERE.port, town: '', gender: 0 })).toBe(true);
  if (remembered) {
    // As a remembered sign-in left it: SAVEPASSWORD 1 and a length (the card package's own writer).
    expect(cardProfileEdits().setPersonaLogin!({ host: HERE.host, port: HERE.port, name }, { savePassword: true, password: 'x'.repeat(length) })).toBe(true);
  }
}
/** Every string this page keeps in its storages, joined. */
const stored = (): string => [localStorage, sessionStorage].map((st) => Array.from({ length: st.length }, (_, i) => `${st.key(i)}=${st.getItem(st.key(i)!)}`).join('\n')).join('\n');

let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

function boot(answers: Partial<Record<string, Answer[]>> = {}, mode: 'page' | 'overlay' = 'page', here: () => Promise<{ host: string; port: number } | null> = async () => HERE) {
  const f = fakeFetch(answers);
  const plain = fetchAccountService(BASE, f.fetch);
  const remember = fetchAccountService(BASE, f.fetch, undefined, undefined, { credentials: INCLUDE });
  const forget = fetchAccountService(BASE, f.fetch, undefined, undefined, { credentials: INCLUDE, forget: true });
  const modern: ModernSession = createSession(plain, { ...NO_TIMERS, services: { remember, forget } });
  const card = liveCard();
  const session = liveSession(() => { page?.render(); }, {
    session: modern, policy: POLICY, here, ...(mode === 'page' ? { card: cardProfileEdits() } : { card: null }),
  });
  const A: Adapters = { ...sampleAdapters(), data: 'live', states: undefined, card, session };
  page = bootConsole(document, window, A, { keymap: true, mode, ...(mode === 'overlay' ? { page: { gameHolds: () => false, roundRunning: () => false, gamePage: () => true } } : {}) });
  return { f, modern, ctl: page.ctl };
}
const logins = (calls: Call[]) => calls.filter((c) => c.path === '/account/login');
const logouts = (calls: Call[]) => calls.filter((c) => c.path === '/account/logout');

describe('PERSONA-PERSIST (a): "Remember me" on the console\'s sign-in (OT.R61 (b))', () => {
  it('is ticked by default, and the player may untick it -- L1, or a click on its switch', async () => {
    const { ctl } = boot();
    await flush();
    ctl.openSignIn();
    ctl.render();
    expect(ctl.S.si.remember).toBe(true);
    const sw = (): HTMLElement => document.querySelector<HTMLElement>('#overlay [data-act="remember"]')!;
    expect([sw().getAttribute('role'), sw().getAttribute('aria-checked'), sw().textContent]).toEqual(['switch', 'true', 'Remember me on this browserOn']);
    ctl.press('l1');
    expect(ctl.S.si.remember).toBe(false);
    expect(sw().getAttribute('aria-checked')).toBe('false');
    sw().click();
    expect(ctl.S.si.remember).toBe(true);
    expect([...document.querySelectorAll('#legend .cx-prompts li')].map((p) => p.textContent!.trim())).toContain('L1Remember me');
  });

  it('a ticked sign-in posts { name, password, savePassword: true } with the credentials included, and files SAVE PASSWORD: YES with the length alone', async () => {
    const name = gen('n');
    const pw = gen('pw');
    seedPersona(name);
    const { f, ctl } = boot({ '/account/login': [success()] });
    await flush();
    ctl.openSignIn();
    ctl.S.si.text = pw;
    ctl.siSubmit();
    await flush();
    expect(logins(f.calls)).toEqual([{ path: '/account/login', credentials: INCLUDE, body: { name, password: pw, savePassword: true } }]);
    const r = recordOf(name)!;
    expect([r.SAVEPASSWORD, r.PASSWORD]).toEqual([1, { length: pw.length }]);
    // No password is stored anywhere: not the card's record, not localStorage, not sessionStorage.
    expect(JSON.stringify(r)).not.toContain(pw);
    expect(stored()).not.toContain(pw);
    expect(ctl.S.overlay).toBe('agreement');
  });

  it("an unticked sign-in posts savePassword false with the credentials omitted, and files NO (the cookie never shown: the chain kept)", async () => {
    const name = gen('n');
    const pw = gen('pw');
    seedPersona(name, true, 6);
    const { f, ctl } = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.InvalidPassword } }, success()] });
    await flush();                                                   // the load's quick sign-in, refused -978: the dialog
    expect(ctl.S.overlay).toBe('signin');
    ctl.press('l1');                                                 // unticked
    ctl.S.si.text = pw;
    ctl.siSubmit();
    await flush();
    expect(logins(f.calls).at(-1)).toEqual({ path: '/account/login', credentials: 'omit', body: { name, password: pw, savePassword: false } });
    const r = recordOf(name)!;
    expect([r.SAVEPASSWORD, r.PASSWORD]).toEqual([0, { length: 0 }]);
    expect(stored()).not.toContain(pw);
  });
});

describe('PERSONA-PERSIST (a): the quick sign-in at the launcher\'s load (OT.R61 (a); SVC-03a step 2)', () => {
  it('tries the card\'s remembered persona for this server once: one request, no password, the credentials included; success is the agreement, as every sign-in', async () => {
    const name = gen('n');
    seedPersona(gen('other'));                                       // NO: not tried
    seedPersona(name, true, 7);
    const { f, ctl, modern } = boot({ '/account/login': [success()] });
    await flush();
    expect(logins(f.calls)).toEqual([{ path: '/account/login', credentials: INCLUDE, body: { name, savePassword: true } }]);
    expect(ctl.S.overlay).toBe('agreement');
    expect(modern.state()).toBe('agreement');
    const r = recordOf(name)!;
    expect([r.SAVEPASSWORD, r.PASSWORD]).toEqual([1, { length: 7 }]);  // the length the card kept, unchanged
    ctl.quickSignIn();
    page!.render();
    await flush();
    expect(logins(f.calls)).toHaveLength(1);                         // once
  });

  it('-978 (the cookie is gone) asks for the password once, in the sign-in dialog with that persona chosen; no second quick try', async () => {
    const other = gen('a');
    const name = gen('n');
    seedPersona(other);
    seedPersona(name, true, 5);
    const { f, ctl } = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.InvalidPassword } }] });
    await flush();
    expect(logins(f.calls)).toHaveLength(1);
    expect(ctl.S.overlay).toBe('signin');
    expect(ctl.S.si.persona).toBe(1);                                // the card's second persona: the remembered one
    expect([ctl.S.si.zone, ctl.S.si.target]).toEqual(['keys', 'password']);
    expect(ctl.S.si.error).toContain(name);
    expect(document.querySelector('#overlay .cx-field__error')!.textContent).toBe(ctl.S.si.error);
    ctl.quickSignIn();
    page!.render();
    await flush();
    expect(logins(f.calls)).toHaveLength(1);                         // no retry loop
  });

  it('any other refusal is said in the dialog\'s words, the persona chosen', async () => {
    const name = gen('n');
    seedPersona(name, true, 5);
    const { ctl } = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.AccountLoggedIn } }] });
    await flush();
    expect(ctl.S.overlay).toBe('signin');
    expect(ctl.S.si.error).not.toBe('');
    expect(ctl.S.si.error).not.toMatch(/-?\d{3}/);                   // words, never a status number
  });

  it('nothing remembered for this server: no request at load', async () => {
    seedPersona(gen('n'));
    const { f, ctl } = boot();
    await flush();
    expect(f.calls).toEqual([]);
    expect(ctl.S.overlay).toBeNull();
  });

  it('over a game page (the overlay) no quick sign-in is tried, and no Remember me is offered (the card is the game\'s)', async () => {
    seedPersona(gen('n'), true, 5);
    const { f, ctl } = boot({}, 'overlay');
    await flush();
    expect(f.calls).toEqual([]);
    ctl.openSignIn();
    ctl.render();
    expect(document.querySelector('#overlay [data-act="remember"]')).toBeNull();
  });
});

describe('PERSONA-PERSIST (a): Sign out keeps the token; "Forget this device" drops it (SVC-03a steps 5 and 6)', () => {
  async function signedIn() {
    const name = gen('n');
    seedPersona(name, true, 5);
    const b = boot({ '/account/login': [success()] });
    await flush();                                                   // the quick sign-in
    b.ctl.press('cross');                                            // Accept
    expect(b.modern.state()).toBe('signed-in');
    return { ...b, name };
  }

  it('the Sign out confirm offers No, Yes and Forget this device; No first and focused', async () => {
    const { ctl } = await signedIn();
    ctl.doAct('signout');
    ctl.render();
    expect([...document.querySelectorAll('#overlay .cx-toggle')].map((b) => b.textContent)).toEqual(['No', 'Yes', 'Yes, and forget this device']);
    expect(ctl.S.confirmRow).toBe(0);
    ctl.press('down'); ctl.press('down'); ctl.press('down');
    expect(ctl.S.confirmRow).toBe(2);
    ctl.press('up');
    expect(ctl.S.confirmRow).toBe(1);
  });

  it('a plain sign-out posts { ticket }, omitted, and keeps the card\'s flag', async () => {
    const { f, ctl, name } = await signedIn();
    ctl.doAct('signout');
    ctl.S.confirmRow = 1;
    ctl.press('cross');
    await flush();
    expect(logouts(f.calls).map((c) => [c.credentials, Object.keys(c.body!)])).toEqual([['omit', ['ticket']]]);
    expect(recordOf(name)!.SAVEPASSWORD).toBe(1);
    expect(recordOf(name)!.PASSWORD.length).toBe(5);
  });

  it('"Forget this device" posts { ticket, forget: true } with the credentials included, and files NO: SAVEPASSWORD 0, the length 0', async () => {
    const { f, ctl, name } = await signedIn();
    ctl.doAct('signout');
    ctl.S.confirmRow = 2;
    ctl.press('cross');
    await flush();
    expect(logouts(f.calls).map((c) => [c.credentials, c.body])).toEqual([['include', { ticket: expect.any(String), forget: true }]]);
    expect([recordOf(name)!.SAVEPASSWORD, recordOf(name)!.PASSWORD]).toEqual([0, { length: 0 }]);
  });

  it('the pagehide logout is plain whichever service signed in (the remember one here)', async () => {
    const { f, modern } = await signedIn();
    modern.close();
    await flush();
    expect(logouts(f.calls).map((c) => [c.credentials, Object.keys(c.body!)])).toEqual([['omit', ['ticket']]]);
  });

  it('the hand-over at START stays a plain logout that keeps the token (`end`)', async () => {
    const { f, modern } = await signedIn();
    await modern.end!();
    expect(logouts(f.calls).map((c) => [c.credentials, Object.keys(c.body!)])).toEqual([['omit', ['ticket']]]);
  });
});

describe('PERSONA-PERSIST (a): the page never reads the cookie (HttpOnly; the browser alone presents it)', () => {
  it('no document.cookie read across a ticked sign-in, the load\'s quick sign-in, a sign-out and a forget', async () => {
    const reads = vi.fn();
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    vi.spyOn(Document.prototype, 'cookie', 'get').mockImplementation(function (this: Document) { reads(); return desc.get!.call(this) as string; });
    const name = gen('n');
    seedPersona(name, true, 5);
    const { ctl } = boot({ '/account/login': [success(), success()] });
    await flush();
    ctl.press('cross');                                              // Accept
    ctl.doAct('signout'); ctl.S.confirmRow = 1; ctl.press('cross');
    await flush();
    ctl.openSignIn(); ctl.S.si.text = gen('pw'); ctl.siSubmit();
    await flush();
    ctl.press('cross');
    ctl.doAct('signout'); ctl.S.confirmRow = 2; ctl.press('cross');
    await flush();
    expect(reads).not.toHaveBeenCalled();
  });
});

describe('PERSONA-PERSIST (a), fold A: a remembered sign-in of a persona the card does not hold files it (OT.R61)', () => {
  /** The sign-in's Add new tile, a typed name and password, sent with Remember me as it stands. */
  function addNew(ctl: ConsolePage['ctl'], name: string, pw: string): void {
    ctl.openSignIn();
    ctl.S.si.persona = ctl.A.card.personas();                        // Add new: after the card's personas
    ctl.S.si.name = name;
    ctl.S.si.target = 'password';
    ctl.S.si.text = pw;
    ctl.siSubmit();
  }

  it('ticked: the new name is filed as the original\'s LOGIN files one -- GENDER 0, the default town, SAVE PASSWORD: YES, the length alone -- and the next load quick-signs-in with it', async () => {
    seedPersona(gen('held'));
    const name = gen('new');
    const pw = gen('pw');
    const first = boot({ '/account/login': [success()] });
    await flush();
    addNew(first.ctl, name, pw);
    await flush();
    expect(logins(first.f.calls).at(-1)).toEqual({ path: '/account/login', credentials: INCLUDE, body: { name, password: pw, savePassword: true } });
    const r = recordOf(name)!;
    expect(r).toBeDefined();
    expect([r.SAVEPASSWORD, r.PASSWORD, r.GENDER, r.TOWN, r.HOST, r.PORT]).toEqual([1, { length: pw.length }, 0, PERSONA_TOWN_READING, HERE.host, HERE.port]);
    expect(JSON.stringify(r)).not.toContain(pw);
    expect(stored()).not.toContain(pw);
    page!.dispose(); page = null;
    mountShell(document);
    const next = boot({ '/account/login': [success()] });            // a reload
    await flush();
    expect(logins(next.f.calls)).toEqual([{ path: '/account/login', credentials: INCLUDE, body: { name, savePassword: true } }]);
    expect(next.ctl.S.overlay).toBe('agreement');
  });

  it('unticked: a new name files nothing, as before', async () => {
    const name = gen('new');
    const { ctl } = boot({ '/account/login': [success()] });
    await flush();
    ctl.openSignIn();
    ctl.press('l1');                                                 // unticked
    ctl.S.si.persona = ctl.A.card.personas();
    ctl.S.si.name = name; ctl.S.si.target = 'password'; ctl.S.si.text = gen('pw');
    ctl.siSubmit();
    await flush();
    expect(ctl.S.si.remember).toBe(false);
    expect(recordOf(name)).toBeUndefined();
  });

  it('the card full for this server (the form\'s persona cap): nothing filed, and the sign-in\'s toast says so in one line', async () => {
    for (let i = 0; i < PERSONA_LIST_ROWS; i++) seedPersona(gen(`p${i}`));
    const name = gen('new');
    const { ctl } = boot({ '/account/login': [success()] });
    await flush();
    addNew(ctl, name, gen('pw'));
    await flush();
    expect(recordOf(name)).toBeUndefined();
    expect(ctl.S.toast).toMatch(new RegExp(`not remembered.*${PERSONA_LIST_ROWS} personas`, 'i'));
    expect(ctl.S.toast).not.toContain('\n');
    expect(ctl.S.overlay).toBe('agreement');                         // the sign-in itself stands
  });
});

describe('PERSONA-PERSIST (a), fold B: the quick sign-in\'s answer arriving while another dialog is open is shown when it closes', () => {
  it('the agreement waits for the open dialog, then shows: the session never sits in agreement with no dialog', async () => {
    const name = gen('n');
    seedPersona(name, true, 5);
    let release!: () => void;
    const wait = new Promise<void>((r) => { release = r; });
    const { ctl, modern } = boot({ '/account/login': [{ ...success(), wait }] });
    await flush();
    ctl.doAct('news');                                               // a dialog the player opened meanwhile
    ctl.render();
    release();
    await flush();
    expect(modern.state()).toBe('agreement');
    expect(ctl.S.overlay).toBe('news');                              // not taken from the player
    ctl.press('circle');                                             // closed: the one pending step shows
    expect(ctl.S.overlay).toBe('agreement');
    ctl.press('cross');                                              // Accept
    expect(modern.state()).toBe('signed-in');
    expect(ctl.S.overlay).toBeNull();
    ctl.render();
    expect(ctl.S.overlay).toBeNull();                                // queued once: never shown twice
  });

  it('a -978 arriving while another dialog is open asks for the password once it closes, the persona chosen', async () => {
    const name = gen('n');
    seedPersona(name, true, 5);
    let release!: () => void;
    const wait = new Promise<void>((r) => { release = r; });
    const { ctl } = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.InvalidPassword }, wait }] });
    await flush();
    ctl.doAct('news');
    ctl.render();
    release();
    await flush();
    expect(ctl.S.overlay).toBe('news');
    ctl.press('circle');
    expect(ctl.S.overlay).toBe('signin');
    expect(ctl.S.si.persona).toBe(0);
    expect(ctl.S.si.error).toContain(name);
  });
});

describe('PERSONA-PERSIST (a), the review\'s F1: a -978 does not repeat across loads (each try counts against the login limit)', () => {
  it('a -978 on the quick sign-in files NO for that persona, so the next load tries none; a later ticked sign-in files YES again', async () => {
    const name = gen('n');
    seedPersona(name, true, 5);
    const first = boot({ '/account/login': [{ body: { status: MEDIUS_STATUS.InvalidPassword } }] });
    await flush();
    expect(logins(first.f.calls)).toHaveLength(1);
    expect([recordOf(name)!.SAVEPASSWORD, recordOf(name)!.PASSWORD]).toEqual([0, { length: 0 }]);
    page!.dispose(); page = null;
    mountShell(document);
    const second = boot({ '/account/login': [success()] });          // a reload, or another tab
    await flush();
    expect(logins(second.f.calls)).toEqual([]);                      // no quick sign-in: nothing remembered
    const pw = gen('pw');
    second.ctl.openSignIn();
    second.ctl.S.si.text = pw;
    second.ctl.siSubmit();
    await flush();
    expect([recordOf(name)!.SAVEPASSWORD, recordOf(name)!.PASSWORD]).toEqual([1, { length: pw.length }]);
  });
});

describe('PERSONA-PERSIST (a), the review\'s F2: a failed universe read neither sticks nor silently loses the remember', () => {
  it('a read that failed at the load is read again when the sign-in files', async () => {
    const name = gen('n');
    seedPersona(name);
    let reads = 0;
    const { ctl } = boot({ '/account/login': [success()] }, 'page', async () => { reads++; if (reads === 1) throw new TypeError('no answer'); return HERE; });
    await flush();                                                   // the load's read: failed, not kept
    const pw = gen('pw');
    ctl.openSignIn(); ctl.S.si.text = pw; ctl.siSubmit();
    await flush();
    expect(reads).toBe(2);
    expect([recordOf(name)!.SAVEPASSWORD, recordOf(name)!.PASSWORD]).toEqual([1, { length: pw.length }]);
    expect(ctl.S.toast).not.toMatch(/not remembered/i);
  });

  it('still failing when the sign-in files: the toast says it was not remembered; the sign-in itself goes through', async () => {
    const name = gen('n');
    seedPersona(name);
    const { ctl, modern } = boot({ '/account/login': [success()] }, 'page', async () => null);
    await flush();
    ctl.openSignIn(); ctl.S.si.text = gen('pw'); ctl.siSubmit();
    await flush();
    expect(ctl.S.toast).toMatch(/^Not remembered on this card: .*server.*could not be read\.$/);
    expect(recordOf(name)!.SAVEPASSWORD).toBe(0);
    expect(modern.state()).toBe('agreement');
    expect(ctl.S.overlay).toBe('agreement');
  });
});
