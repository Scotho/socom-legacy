// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, MEDIUS_STATUS, UiCommandHost, UiVarManager, VALVE_TYPE, ValveStore, type ZAnimUiCommand } from '@s2u/ui';
import {
  ACCOUNT_HTTP_REFUSAL_ADAPTATION, ACCOUNT_SERVICE_ABSENT_LABEL, ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION, KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION, PAGEHIDE_LOGOUT_ADAPTATION,
  SAVED_PASSWORD_BY_COOKIE_ADAPTATION, SAVED_PASSWORD_REGISTER_LINE_ADAPTATION, SAVED_PASSWORD_REGISTER_LINE_ID, SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION,
  SAVED_PASSWORD_LOGIN_LINE_ADAPTATION, SAVED_PASSWORD_LOGIN_LINE_ID, savedPasswordLoginLine,
  accountServiceBase, savedPasswordRegisterLine, connectLobby, fetchAccountService, matchSocketUrl,
  pageAccountService, pageLoginService, savedPasswordLogin,
} from '../src/connectHost';
import { PageAcctDb, savedPasswordStandIn } from '../src/personaHost';
import { netSettings } from '../src/netPage';

/**
 * ONL-07's page half (web research 157 §5): the login asked of SVC-03's endpoint as it answers today
 * (`packages/central/src/accountHttp.ts`), and the lobby client and its two rows wired over a session's parts. The
 * transport is ours; what is held here is what goes over it (the name and the password, once, in a POST body and
 * nowhere else), how each answer reads, and where the ticket lives (the client's memory only).
 */

/** A typed password, made up for the tests. */
const TYPED = 'secret';
const BASE = 'http://localhost:8868';
/** OT.R61: fetch's credentials mode the remember service asks for (`AccountRequestOptions`). */
const INCLUDE = 'include' as const;

interface Call { url: string; init: RequestInit }
function fakeFetch(answer: (c: Call) => { http: number; body?: unknown } | 'network') {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init: RequestInit = {}) => {
    const c = { url, init };
    calls.push(c);
    const a = answer(c);
    if (a === 'network') return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve({ ok: a.http >= 200 && a.http < 300, status: a.http, json: () => (a.body === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(a.body)) } as Response);
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe('fetchAccountService (SVC-03\'s endpoint as it answers today)', () => {
  it('login: POST <base>/account/login with the name, the password and savePassword false, JSON, no credentials, nothing in the URL', async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0, ticket: 'tkt' } }));
    const r = await fetchAccountService(BASE, f.fetchFn).login({ name: 'socomc', password: TYPED });
    expect(r).toEqual({ status: 0, ticket: 'tkt' });
    expect(f.calls).toHaveLength(1);
    const c = f.calls[0]!;
    expect(c.url).toBe(`${BASE}/account/login`);
    expect(c.url).not.toContain(TYPED);
    expect([c.init.method, c.init.credentials, c.init.cache]).toEqual(['POST', 'omit', 'no-store']);
    expect(c.init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(c.init.body as string)).toEqual({ name: 'socomc', password: TYPED, savePassword: false });   // OT.R17: no remember token yet
  });

  it("each refusal's status is the body's, whatever the HTTP code that carries it (200; 429 at the attempt limit)", async () => {
    for (const [http, status] of [[200, MEDIUS_STATUS.AccountNotFound], [200, MEDIUS_STATUS.InvalidPassword], [200, MEDIUS_STATUS.AccountLoggedIn], [429, MEDIUS_STATUS.LoginFailed]] as const) {
      const f = fakeFetch(() => ({ http, body: { status } }));
      expect(await fetchAccountService(BASE, f.fetchFn).login({ name: 'socomc', password: TYPED })).toEqual({ status });
    }
  });

  it('an HTTP answer that carries no status (403 a refused Origin, 404 no endpoint mounted, 500, a body of another shape) reads as MediusFail: the callback\'s "any other" branch', async () => {
    for (const a of [{ http: 403 }, { http: 404 }, { http: 500 }, { http: 200, body: { ok: true } }, { http: 200, body: { status: 'x' } }, { http: 200, body: null }]) {
      const f = fakeFetch(() => a);
      expect(await fetchAccountService(BASE, f.fetchFn).login({ name: 'socomc', password: TYPED })).toEqual({ status: MEDIUS_STATUS.Fail });
    }
    expect(ACCOUNT_HTTP_REFUSAL_ADAPTATION).toMatch(/MediusFail/);
  });

  it('no answer at all (the request fails) rejects: a request never answered, the screen\'s watchdog decides', async () => {
    const f = fakeFetch(() => 'network');
    await expect(fetchAccountService(BASE, f.fetchFn).login({ name: 'socomc', password: TYPED })).rejects.toThrow();
  });

  it('a ticket that is no string, or empty, is no ticket', async () => {
    for (const ticket of [5, '', null]) {
      const f = fakeFetch(() => ({ http: 200, body: { status: 0, ticket } }));
      expect(await fetchAccountService(BASE, f.fetchFn).login({ name: 'socomc', password: TYPED })).toEqual({ status: 0 });
    }
  });

  it('register: POST <base>/account/create with the name and the password; its status the body\'s (429: -994)', async () => {
    const f = fakeFetch(() => ({ http: 429, body: { status: MEDIUS_STATUS.RegistrationFailed } }));
    expect(await fetchAccountService(BASE, f.fetchFn).register({ name: 'newname', password: TYPED })).toEqual({ status: MEDIUS_STATUS.RegistrationFailed });
    expect([f.calls[0]!.url, JSON.parse(f.calls[0]!.init.body as string)]).toEqual([`${BASE}/account/create`, { name: 'newname', password: TYPED }]);
  });

  it('logout: POST <base>/account/logout with the ticket in the body', async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0 } }));
    expect(await fetchAccountService(BASE, f.fetchFn).logout!('tkt')).toEqual({ status: 0 });
    expect([f.calls[0]!.url, JSON.parse(f.calls[0]!.init.body as string), f.calls[0]!.init.credentials]).toEqual([`${BASE}/account/logout`, { ticket: 'tkt' }, 'omit']);
  });

  it('NU-16b (PAGEHIDE_LOGOUT_ADAPTATION): the logout goes out keepalive, so a page going away (pagehide, the mount\'s stop) still ends its session; the login, the create and the keep-alive do not', async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0, ticket: 'tkt' } }));
    const s = fetchAccountService(BASE, f.fetchFn);
    await s.login({ name: 'socomc', password: TYPED });
    await s.register({ name: 'newname', password: TYPED });
    await s.keepAlive!('tkt');
    await s.logout!('tkt');
    expect(f.calls.map((c) => [c.url.slice(BASE.length), c.init.keepalive === true])).toEqual([
      ['/account/login', false], ['/account/create', false], ['/lobby/update-user-state', false], ['/account/logout', true],
    ]);
    expect(PAGEHIDE_LOGOUT_ADAPTATION).toMatch(/pagehide/);
  });

  it("N3: keepAlive posts <base>/lobby/update-user-state { userAction: 1 } with the ticket as its bearer; 2xx alive, 401 gone, 403 and 404 gone (KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION), 5xx alive-unknown", async () => {
    for (const [http, alive] of [[204, true], [200, true], [401, false], [403, false], [404, false], [500, true], [503, true]] as const) {
      const f = fakeFetch(() => ({ http }));
      expect(await fetchAccountService(BASE, f.fetchFn).keepAlive!('tkt'), String(http)).toBe(alive);
      const c = f.calls[0]!;
      expect([c.url, c.init.method, c.init.credentials, c.init.cache]).toEqual([`${BASE}/lobby/update-user-state`, 'POST', 'omit', 'no-store']);
      expect(c.init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tkt' });
      expect(JSON.parse(c.init.body as string)).toEqual({ userAction: 1 });
      expect(c.url).not.toContain('tkt');
    }
    await expect(fetchAccountService(BASE, fakeFetch(() => 'network').fetchFn).keepAlive!('tkt')).rejects.toThrow();   // never answered: retried next period
    expect(KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION).toMatch(/403.*404/);
  });

  /**
   * OT.R61's console half (PERSONA-PERSIST (a); MISSION OT.R61; the remember cookie's contract, SVC-03a,
   * `packages/central/src/accountHttp.ts` steps 1, 2, 5 and 6). The default is the original's: every request 'omit', the
   * login `savePassword: false`, so the original's LOGIN (`../src/frontEnd.ts`) neither shows nor gets the cookie.
   */
  it("OT.R61: the default stays 'omit' and savePassword false for the original LOGIN's requests, with the option absent, empty or 'omit'", async () => {
    for (const make of [
      (fn: typeof fetch) => fetchAccountService(BASE, fn),
      (fn: typeof fetch) => fetchAccountService(BASE, fn, undefined, undefined, {}),
      (fn: typeof fetch) => fetchAccountService(BASE, fn, undefined, undefined, { credentials: 'omit' }),
      (fn: typeof fetch) => pageAccountService('', { protocol: 'http:', host: 'localhost:8868', origin: BASE }, false, fn, null, null),
    ]) {
      const f = fakeFetch(() => ({ http: 200, body: { status: 0, ticket: 'tkt' } }));
      const s = make(f.fetchFn);
      await s.login({ name: 'socomc', password: TYPED });
      await s.register({ name: 'newname', password: TYPED });
      await s.keepAlive!('tkt');
      await s.logout!('tkt');
      expect(f.calls.map((c) => c.init.credentials)).toEqual(['omit', 'omit', 'omit', 'omit']);
      expect(f.calls.map((c) => JSON.parse(c.init.body as string))).toEqual([
        { name: 'socomc', password: TYPED, savePassword: false }, { name: 'newname', password: TYPED }, { userAction: 1 }, { ticket: 'tkt' },
      ]);
    }
    // The original LOGIN's own call (`../src/frontEnd.ts`) is SAVE-PASSWORD's `pageLoginService` (OT.R61, the game half):
    // a plain service -- the default's, as above -- and an 'include' one, picked per login (the line and this check
    // changed together, SAVE-PASSWORD).
    const fe = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf-8');
    expect(fe).toMatch(/guardInviteLogin\(pageLoginService\(search, win\.location, devBuild\(\)\), invite,/);
  });

  it("OT.R61: a service made with credentials 'include' and no forget logs out as step 5, omitted (its logout and every pagehide plain)", async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0 } }));
    await fetchAccountService(BASE, f.fetchFn, undefined, undefined, { credentials: INCLUDE }).logout!('tkt');
    await fetchAccountService(BASE, f.fetchFn, undefined, undefined, { credentials: INCLUDE, forget: false }).logout!('tkt');
    expect(f.calls.map((c) => [c.url.slice(BASE.length), c.init.credentials, c.init.keepalive, JSON.parse(c.init.body as string)])).toEqual([
      ['/account/logout', 'omit', true, { ticket: 'tkt' }], ['/account/logout', 'omit', true, { ticket: 'tkt' }],
    ]);
  });

  it("OT.R61: forget is Forget this device (step 6), credentials included, with or without 'include' for the login", async () => {
    for (const opts of [{ forget: true }, { credentials: INCLUDE, forget: true }]) {
      const f = fakeFetch(() => ({ http: 200, body: { status: 0 } }));
      const s = fetchAccountService(BASE, f.fetchFn, undefined, undefined, opts);
      await s.logout!('tkt');
      await s.register({ name: 'newname', password: TYPED });
      await s.keepAlive!('tkt');
      expect(f.calls.map((c) => [c.url.slice(BASE.length), c.init.credentials, JSON.parse(c.init.body as string)])).toEqual([
        ['/account/logout', 'include', { ticket: 'tkt', forget: true }],
        ['/account/create', 'omit', { name: 'newname', password: TYPED }],
        ['/lobby/update-user-state', 'omit', { userAction: 1 }],
      ]);
    }
  });

  it("OT.R61: 'include' is the remember cookie's two logins -- the remembered login and the quick sign-in -- and nothing else", async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0, ticket: 'tkt' } }));
    const s = fetchAccountService(BASE, f.fetchFn, undefined, undefined, { credentials: INCLUDE });
    expect(await s.login({ name: 'socomc', password: TYPED })).toEqual({ status: 0, ticket: 'tkt' });   // step 1
    await s.login({ name: 'socomc', password: '' });                                                    // step 2: no password
    await s.logout!('tkt');                                                                             // step 5: no forget
    await s.register({ name: 'newname', password: TYPED });
    await s.keepAlive!('tkt');
    expect(f.calls.map((c) => [c.url.slice(BASE.length), c.init.credentials, JSON.parse(c.init.body as string)])).toEqual([
      ['/account/login', 'include', { name: 'socomc', password: TYPED, savePassword: true }],
      ['/account/login', 'include', { name: 'socomc', savePassword: true }],
      ['/account/logout', 'omit', { ticket: 'tkt' }],
      ['/account/create', 'omit', { name: 'newname', password: TYPED }],
      ['/lobby/update-user-state', 'omit', { userAction: 1 }],
    ]);
    expect('password' in JSON.parse(f.calls[1]!.init.body as string)).toBe(false);
    for (const c of f.calls) expect(c.url).not.toContain(TYPED);
  });

  it('has no SessionBegin, name filter or lobby-server step of its own: the client\'s adaptations and placeholder stand', () => {
    const s = fetchAccountService(BASE, fakeFetch(() => ({ http: 200, body: { status: 0 } })).fetchFn);
    expect([s.sessionBegin, s.filterName, s.enterLobby]).toEqual([undefined, undefined, undefined]);
  });
});

describe("N1: the account requests go to the page's own origin (ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION, OT.R22)", () => {
  const PAGE = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
  const EVIL = '?menuflow=dlgNetPlayerName.rdr&server=https://evil.example';
  const ok = (c: Call) => (c.url.endsWith('/account/login') ? { http: 200, body: { status: 0, ticket: 'tkt' } } : { http: 200, body: { status: 0 } });

  it('a public page with server=https://evil.example posts the login, the create and the logout to its own origin', async () => {
    for (const [search, devBuild] of [[EVIL, false], [`${EVIL}&devmode`, false], [EVIL, true]] as const) {
      const f = fakeFetch(ok);
      const s = pageAccountService(search, PAGE, devBuild, f.fetchFn);
      await s.login({ name: 'socomc', password: TYPED });
      await s.register({ name: 'newname', password: TYPED });
      await s.logout!('tkt');
      expect(f.calls.map((c) => c.url), `${search} ${devBuild}`).toEqual(['https://site.test/account/login', 'https://site.test/account/create', 'https://site.test/account/logout']);
      expect(f.calls.some((c) => c.url.includes('evil'))).toBe(false);
    }
    expect(ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION).toMatch(/own origin/);
  });

  it("under the developer's ?devmode on a development build it follows server= (OT.R14's convenience), as the universe list does", async () => {
    const f = fakeFetch(ok);
    await pageAccountService(`${EVIL}&devmode`, PAGE, true, f.fetchFn).login({ name: 'socomc', password: TYPED });
    expect(f.calls.map((c) => c.url)).toEqual(['https://evil.example/account/login']);
    expect(accountServiceBase('?devmode&server=ws://localhost:8868/ws', PAGE, true)).toBe('http://localhost:8868');
    expect(accountServiceBase('?devmode', PAGE, true)).toBe('https://site.test');
    expect(accountServiceBase('', { protocol: 'http:', host: 'localhost:5303' }, false)).toBe('http://localhost:5303');
  });

  it("frontEnd.ts builds the session's account service through pageAccountService, never from universeServiceBase", () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/frontEnd.ts'), 'utf8');
    expect(src).toMatch(/account: (?:guardInviteLogin\()?pageLoginService\(search, win\.location, /);   // LOBBY-INVITE wraps it, keeping its identity; SAVE-PASSWORD: pageLoginService
    expect(src).not.toMatch(/fetchAccountService\(universeServiceBase/);
  });
});

describe('connectLobby', () => {
  const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  function setup() {
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const events: Array<[number, string | null]> = [];
    const f = fakeFetch((c) => (c.url.endsWith('/account/login') ? { http: 200, body: { status: 0, ticket: 'tkt' } } : { http: 200, body: { status: 0 } }));
    let forgot = 0, dialog: string | null = 'dlgNetConnect.rdr';
    const c = connectLobby(host, {
      valves: () => valves, uiVars, service: fetchAccountService(BASE, f.fetchFn), event: (k, t) => { events.push([k, t]); },
      dialog: () => dialog, forget: () => { forgot++; },
    });
    return { valves, uiVars, host, events, f, c, forgot: () => forgot, leave: () => { dialog = 'dlgNetPlayerName.rdr'; } };
  }

  it('registers LobbyLogin and LobbyRegister over one lobby client, stepped by frame()', async () => {
    const t = setup();
    for (const name of ['LobbyLogin', 'LobbyRegister']) expect(t.host.dispatch(cmd(name)).kind, name).toBe('table');
    expect(t.c.lobby.connect('', 0)).toBe(true);
    t.c.frame();
    await flush();
    expect(t.events).toEqual([[DIALOG_EVENTS.MP_SUCCESS, null]]);
    expect(t.c.lobby.state()).toBe(12);
  });

  it('a login through the rows: the request once, the ticket in the client\'s memory only -- nothing in localStorage, sessionStorage or the address', async () => {
    const t = setup();
    const before = window.location.href;
    t.c.lobby.connect('', 0);
    t.c.frame();
    await flush();
    t.uiVars.set(t.uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomc' });
    t.uiVars.set(t.uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: TYPED });
    expect(t.host.dispatch(cmd('LobbyLogin')).answer).toBe(true);
    for (let i = 0; i < 4; i++) { t.c.frame(); await flush(); }
    expect(t.f.calls.map((c) => c.url)).toEqual([`${BASE}/account/login`]);
    expect([t.c.lobby.loggedIn(), t.c.lobby.ticket(), t.c.lobby.state()]).toEqual([true, 'tkt', 11]);
    expect([window.localStorage.length, window.sessionStorage.length, window.location.href]).toEqual([0, 0, before]);
    expect(document.cookie).toBe('');
    // OT.R17: the password is gone from the form's variable, and the page's other holder was told.
    expect([t.uiVars.find('PLAYERPASSWORD')!.value, t.forgot()]).toEqual([{ type: 'string', value: '' }, 1]);
  });
});

/**
 * SAVE-PASSWORD (OT.R61, the game half; web research 153 §8): the original's SAVE PASSWORD: YES honoured through the
 * remember cookie. The original's AccountLogin carries the name and the password alone (`FUN_002eede0`
 * D:L191138-191139): the strip decides what the card keeps, never the wire. So a saved password (the record's length
 * in the stand-in, `../src/personaHost`) is the cookie -- the 'include' service with no password, whatever the strip says
 * now; a typed password under YES is the remembered login, 'include'; a typed password under NO goes 'omit' and never
 * shows the cookie (the merge controller's ruling, product track).
 */
describe('SAVE-PASSWORD: the game\'s LOGIN picks its service per login (SAVED_PASSWORD_BY_COOKIE_ADAPTATION)', () => {
  const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const SAVED = '\u0001'.repeat(6);                                      // savedPasswordStandIn(6): the record's length 6
  const both = (f: ReturnType<typeof fakeFetch>) => savedPasswordLogin(fetchAccountService(BASE, f.fetchFn), fetchAccountService(BASE, f.fetchFn, undefined, undefined, { credentials: INCLUDE }));
  const sent = (f: ReturnType<typeof fakeFetch>) => f.calls.map((c) => [c.url.slice(BASE.length), c.init.credentials, JSON.parse(c.init.body as string)]);

  /** The rows over `connectLobby` with the game's service, the strip (`SecurePassword`) and the form's two variables set. */
  async function login(o: { strip: 0 | 1; password: string; status?: number; registerLine?: { show(): void; clear(): void }; loginLine?: { show(): void; clear(): void } }) {
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const events: Array<[number, string | null]> = [];
    const f = fakeFetch((c) => (c.url.endsWith('/account/login') ? { http: 200, body: o.status === undefined ? { status: 0, ticket: 'tkt' } : { status: o.status } } : { http: 200, body: { status: 0 } }));
    const db = new PageAcctDb();
    db.update('lobby.test', 10075, 'socomc', o.password, null, 0, o.strip);
    const at = { dialog: 'dlgNetConnect.rdr' };
    const c = connectLobby(host, {
      valves: () => valves, uiVars, service: both(f), event: (k, t) => { events.push([k, t]); }, dialog: () => at.dialog, db: () => db,
      registerLine: o.registerLine ?? null, loginLine: o.loginLine ?? null,
    });
    valves.set('SecurePassword', o.strip, VALVE_TYPE.PERM);   // the SAVE PASSWORD strip at the press
    c.lobby.connect('lobby.test', 10075);                     // the record's universe: `LobbyConnect` hands the form and the connection one DNS and port
    c.frame();
    await flush();
    uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomc' });
    uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: o.password });
    expect(host.dispatch(cmd('LobbyLogin')).answer).toBe(true);
    for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    const pw = (): unknown => uiVars.find('PLAYERPASSWORD')!.value;
    /** The connecting screen left (the register question's NO, `exit_connect_screen`), then a frame. */
    const leave = async (): Promise<void> => { at.dialog = 'dlgNetPlayerName.rdr'; c.frame(); await flush(); };
    /** The form's prefill from the list (`LobbyConnect` / `GetMUISPersonaInfo`: PLAYERPASSWORD from the record). */
    const prefill = (): void => { uiVars.set(uiVars.find('PLAYERPASSWORD')!, { type: 'string', value: db.records()[0]!.password }); };
    const frames = async (n = 4): Promise<void> => { for (let i = 0; i < n; i++) { c.frame(); await flush(); } };
    /** The player types a password into the form (PLAYERPASSWORD). */
    const typed = (v: string): void => { uiVars.set(uiVars.find('PLAYERPASSWORD')!, { type: 'string', value: v }); };
    return { f, events, c, db, pw, host, leave, prefill, frames, at, typed };
  }

  it('the quick LOGIN: a saved password posts { name, savePassword: true } with credentials included and no password field (SVC-03a step 2)', async () => {
    const t = await login({ strip: 1, password: SAVED });
    expect(sent(t.f)).toEqual([['/account/login', 'include', { name: 'socomc', savePassword: true }]]);
    expect('password' in JSON.parse(t.f.calls[0]!.init.body as string)).toBe(false);
    expect([t.c.lobby.loggedIn(), t.c.lobby.ticket()]).toEqual([true, 'tkt']);
    expect(SAVED_PASSWORD_BY_COOKIE_ADAPTATION).toMatch(/include/);
  });

  it('a typed password under YES posts { name, password, savePassword: true } with credentials included (step 1)', async () => {
    const t = await login({ strip: 1, password: TYPED });
    expect(sent(t.f)).toEqual([['/account/login', 'include', { name: 'socomc', password: TYPED, savePassword: true }]]);
    expect(t.pw()).toEqual({ type: 'string', value: '' });               // a typed password is still let go at the answer
  });

  it('a typed password under NO posts { name, password, savePassword: false } with credentials omitted: the cookie never shown (the ruling: (a))', async () => {
    const t = await login({ strip: 0, password: TYPED });
    expect(sent(t.f)).toEqual([['/account/login', 'omit', { name: 'socomc', password: TYPED, savePassword: false }]]);
  });

  it('NO after YES, the password not retyped: the saved password is still the cookie -- included, no password', async () => {
    const t = await login({ strip: 0, password: SAVED });
    expect(sent(t.f)).toEqual([['/account/login', 'include', { name: 'socomc', savePassword: true }]]);
  });

  // LOGIN-CRASH (Trello k3r8P8nY, bug 2; was #545's "the saved password is kept"): the stand-in's secret is the remember
  // cookie, and -978 to it says this browser holds none that signs in (cleared, another browser or device) -- keeping it
  // made every CONNECT send it again, refused each time and counted against the login limit. Now it goes as LATER 332's.
  it('k3r8P8nY: -978 on the quick LOGIN: MP_INVALID_PASSWORD (#545), the stand-in let go from the form and the record, the page says why, and the next CONNECT asks for the password', async () => {
    const line = { shown: 0, cleared: 0, show() { this.shown++; }, clear() { this.cleared++; } };
    const t = await login({ strip: 1, password: SAVED, status: MEDIUS_STATUS.InvalidPassword, loginLine: line });
    expect(t.events.map((e) => e[0])).toContain(DIALOG_EVENTS.MP_INVALID_PASSWORD);
    expect([t.c.lobby.loggedIn(), t.pw()]).toEqual([false, { type: 'string', value: '' }]);
    expect(t.db.records()[0]!.password).toBe('');                       // the record's stand-in let go
    expect(t.db.records()[0]!.savePassword).toBe(1);                    // SAVE PASSWORD stays: a typed login saves anew
    expect(line.shown).toBe(1);
    expect(SAVED_PASSWORD_LOGIN_LINE_ADAPTATION).toMatch(/password/i);
    t.prefill();
    expect(t.pw()).toEqual({ type: 'string', value: '' });              // the form's next prefill brings none back
    expect(t.host.dispatch(cmd('LobbyLogin')).answer).toBe(false);      // nothing to log in with: the stand-in not sent again
    expect(sent(t.f)).toHaveLength(1);
    const cleared = line.cleared;
    t.typed(TYPED);
    expect(t.host.dispatch(cmd('LobbyLogin')).answer).toBe(true);
    expect(line.cleared).toBeGreaterThan(cleared);                     // the next attempt takes the line down
    await t.frames();
    expect(sent(t.f)[1]).toEqual(['/account/login', 'include', { name: 'socomc', password: TYPED, savePassword: true }]);
  });

  it('k3r8P8nY: -997 or another refusal of the quick LOGIN keeps the saved password (#545), no line', async () => {
    const line = { shown: 0, cleared: 0, show() { this.shown++; }, clear() { this.cleared++; } };
    const t = await login({ strip: 1, password: SAVED, status: MEDIUS_STATUS.AccountLoggedIn, loginLine: line });
    expect([t.c.lobby.loggedIn(), t.pw()]).toEqual([false, { type: 'string', value: SAVED }]);
    expect(t.db.records()[0]!.password).toBe(SAVED);
    expect(line.shown).toBe(0);
  });

  it("k3r8P8nY: the page's line for a refused saved password -- one labelled line, the page's words, no pointer; clear takes it down", () => {
    const line = savedPasswordLoginLine(document);
    line.show();
    line.show();
    const els = document.querySelectorAll(`#${SAVED_PASSWORD_LOGIN_LINE_ID}`);
    expect(els).toHaveLength(1);
    const el = els[0] as HTMLElement;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${SAVED_PASSWORD_LOGIN_LINE_ADAPTATION}`);
    expect([el.dataset['adaptation'], el.getAttribute('role'), el.style.pointerEvents]).toEqual(['SAVED_PASSWORD_LOGIN_LINE_ADAPTATION', 'status', 'none']);
    line.clear();
    expect(document.getElementById(SAVED_PASSWORD_LOGIN_LINE_ID)).toBeNull();
  });

  it('-978 to a typed password: it is let go, never kept as the stand-in', async () => {
    const typed = await login({ strip: 1, password: TYPED, status: MEDIUS_STATUS.InvalidPassword });
    expect(typed.pw()).toEqual({ type: 'string', value: '' });          // a typed one is let go (PASSWORD_DROPPED_AT_ANSWER_ADAPTATION)
    expect(typed.db.records()[0]!.password).toBe('');                   // the review's F1: refused, it never becomes the stand-in
  });

  it("the review's F1: a typed YES password becomes the stand-in only when the login succeeds -- the card's record and the next CONNECT's", async () => {
    const t = await login({ strip: 1, password: TYPED });
    expect([t.c.lobby.loggedIn(), t.pw()]).toEqual([true, { type: 'string', value: '' }]);
    expect(t.db.records()[0]!.password).toBe(savedPasswordStandIn(TYPED.length));
  });

  it("the review's F1: a typed YES password refused (-978) leaves no stand-in -- the next CONNECT, prefilled from the list, is no quick sign-in (a live cookie would log in)", async () => {
    const t = await login({ strip: 1, password: TYPED, status: MEDIUS_STATUS.InvalidPassword });
    t.prefill();
    expect(t.pw()).toEqual({ type: 'string', value: '' });
    expect(t.host.dispatch(cmd('LobbyLogin')).answer).toBe(false);      // nothing to log in with: the player retypes, as on the console
    await t.frames();
    expect(sent(t.f)).toEqual([['/account/login', 'include', { name: 'socomc', password: TYPED, savePassword: true }]]);
  });

  it("the review's F1: -998, then the register question's YES with the typed password, still posts /account/create", async () => {
    const t = await login({ strip: 1, password: TYPED, status: MEDIUS_STATUS.AccountNotFound });
    expect(t.pw()).toEqual({ type: 'string', value: TYPED });           // -998 keeps it for the question (FUN_0027dde0 reads it)
    expect(t.host.dispatch(cmd('LobbyRegister')).answer).toBe(true);
    await t.frames();
    expect(sent(t.f).map((x) => x.slice(0, 2))).toContainEqual(['/account/create', 'omit']);
    expect(sent(t.f).find((x) => x[0] === '/account/create')![2]).toEqual({ name: 'socomc', password: TYPED });
  });

  // LATER 332 (research 365 §0.3; the merge controller's (b), 2026-10-24): a saved record whose account the server does not
  // hold answers -998, and the question's YES hands the registration a stand-in, which cannot register
  // (SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION). Putting the stand-in back made the form invite the same CONNECT again;
  // now the form's password and the record's stand-in are let go -- the original's form script lights PASSWORD and keeps
  // CONNECT dark until one is typed -- and the page says why in its own labelled line.
  it('LATER 332: -998 on the quick LOGIN, then YES: no request, the stand-in let go from the form and the record, and the page says why', async () => {
    const line = { shown: 0, cleared: 0, show() { this.shown++; }, clear() { this.cleared++; } };
    const t = await login({ strip: 1, password: SAVED, status: MEDIUS_STATUS.AccountNotFound, registerLine: line });
    expect(t.pw()).toEqual({ type: 'string', value: SAVED });           // -998 keeps it until the question is answered
    expect(t.host.dispatch(cmd('LobbyRegister')).answer).toBe(true);    // the question's YES
    await t.frames();
    expect(sent(t.f).map((x) => x[0])).toEqual(['/account/login']);     // no /account/create
    expect(t.pw()).toEqual({ type: 'string', value: '' });              // not put back: CONNECT dark until one is typed
    expect(t.db.records()[0]!.password).toBe('');                       // the record's stand-in let go
    t.prefill();
    expect(t.pw()).toEqual({ type: 'string', value: '' });              // the form's next prefill brings none back
    expect(line.shown).toBe(1);
    expect(SAVED_PASSWORD_REGISTER_LINE_ADAPTATION).toMatch(/saved password/i);
    const cleared = line.cleared;
    t.typed(TYPED);                                                     // the player types one
    t.host.dispatch(cmd('LobbyLogin'));
    expect(line.cleared).toBeGreaterThan(cleared);                     // the next attempt takes the line down
    const before = line.cleared;
    t.c.lobby.disconnect();                                             // MAIN MENU's teardown, the page's stop
    expect(line.cleared).toBeGreaterThan(before);
  });

  // #496's review, 2: the real line on the page, as the signed-in-elsewhere line is held (`signedInElsewhere.test.ts`).
  it('LATER 332: the page\'s line -- one labelled line, the page\'s words, no pointer; clear takes it down', () => {
    const line = savedPasswordRegisterLine(document);
    line.show();
    line.show();
    const els = document.querySelectorAll(`#${SAVED_PASSWORD_REGISTER_LINE_ID}`);
    expect(els).toHaveLength(1);
    const el = els[0] as HTMLElement;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${SAVED_PASSWORD_REGISTER_LINE_ADAPTATION}`);
    expect(el.querySelector('b')!.textContent).toBe(ACCOUNT_SERVICE_ABSENT_LABEL);
    expect([el.dataset['adaptation'], el.getAttribute('role'), el.style.pointerEvents]).toEqual(['SAVED_PASSWORD_REGISTER_LINE_ADAPTATION', 'status', 'none']);
    line.clear();
    expect(document.getElementById(SAVED_PASSWORD_REGISTER_LINE_ID)).toBeNull();
  });

  it('LATER 332: a typed password\'s -998 and YES change nothing of the original\'s: the registration and the second login go out, no line', async () => {
    const line = { shown: 0, cleared: 0, show() { this.shown++; }, clear() { this.cleared++; } };
    const t = await login({ strip: 1, password: TYPED, status: MEDIUS_STATUS.AccountNotFound, registerLine: line });
    expect(t.host.dispatch(cmd('LobbyRegister')).answer).toBe(true);
    await t.frames();
    expect(sent(t.f).map((x) => x[0])).toEqual(['/account/login', '/account/create', '/account/login']);
    expect(line.shown).toBe(0);
  });

  it("the review's F1: -998, then the question's NO (the screen left): the typed password is let go, never kept as a stand-in", async () => {
    const t = await login({ strip: 1, password: TYPED, status: MEDIUS_STATUS.AccountNotFound });
    await t.leave();
    expect([t.pw(), t.db.records()[0]!.password]).toEqual([{ type: 'string', value: '' }, '']);
  });

  /**
   * SAVED-AT-SUCCESS-HOST (LATER 101; product track, the cookie transport's adaptation, OT.R27): a Success keeps as the
   * stand-in only the record of the HOST, PORT and NAME logged into -- `lobby.connectedTo()`, the list's own key
   * (`FUN_002fbce0` D:L199058-199066). Universe A's row of the same name, typed under YES and never connected, is not
   * the cookie's: the answer lets its typed password go, and a later CONNECT on A sends the typed password (step 1).
   */
  it('SAVED-AT-SUCCESS-HOST: two universes, one name -- a Success on B makes only B\'s row the stand-in; a later CONNECT on A is the typed login', async () => {
    const A = { host: 'lobby.a', port: 10075 }, B = { host: 'lobby.b', port: 10076 };
    const TYPED_A = 'Zq7aaaa', TYPED_B = 'Zq7bbbbbbb';                  // made up; lengths 7 and 10
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const f = fakeFetch((q) => (q.url.endsWith('/account/login') ? { http: 200, body: { status: 0, ticket: 'tkt' } } : { http: 200, body: { status: 0 } }));
    const db = new PageAcctDb();
    db.update(A.host, A.port, 'socomc', TYPED_A, null, 0, 1);         // universe A: YES ticked, the password typed, backed out without CONNECT
    db.update(B.host, B.port, 'socomc', TYPED_B, null, 0, 1);         // universe B: the same name typed under YES (`UpdateAcctInfo` at CONNECT)
    const c = connectLobby(host, { valves: () => valves, uiVars, service: both(f), event: () => {}, dialog: () => 'dlgNetConnect.rdr', db: () => db });
    valves.set('SecurePassword', 1, VALVE_TYPE.PERM);
    const frames = async (n = 4): Promise<void> => { for (let i = 0; i < n; i++) { c.frame(); await flush(); } };
    const pwOf = (u: { host: string; port: number }): string => db.records().find((r) => r.host === u.host && r.port === u.port)!.password;
    const setPw = (value: string): void => { uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value }); };
    uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomc' });

    // CONNECT on B with the typed password: the login succeeds.
    c.lobby.connect(B.host, B.port);
    await frames(1);
    setPw(TYPED_B);
    expect(host.dispatch(cmd('LobbyLogin')).answer).toBe(true);
    await frames();
    expect([c.lobby.loggedIn(), c.lobby.connectedTo()]).toEqual([true, B]);
    expect(pwOf(B)).toBe(savedPasswordStandIn(TYPED_B.length));        // B's row: the cookie's stand-in
    expect(pwOf(A)).toBe('');                                          // A's row: no stand-in -- its typed password let go with every typed one
    expect(JSON.stringify(db.records())).not.toMatch(/Zq7/);

    // Back to SELECT UNIVERSE, then CONNECT on A: the form's prefill from A's row holds nothing, so the player types it.
    c.lobby.disconnect();
    c.lobby.connect(A.host, A.port);
    await frames(1);
    setPw(pwOf(A));                                                    // `LobbyConnect`'s prefill (PLAYERPASSWORD from the record)
    expect(host.dispatch(cmd('LobbyLogin')).answer).toBe(false);       // nothing to log in with: no quick sign-in by B's cookie
    setPw(TYPED_A);
    db.update(A.host, A.port, 'socomc', TYPED_A, null, 0, 1);         // `UpdateAcctInfo` at the CONNECT
    expect(host.dispatch(cmd('LobbyLogin')).answer).toBe(true);
    await frames();
    expect(sent(f)).toEqual([
      ['/account/login', 'include', { name: 'socomc', password: TYPED_B, savePassword: true }],
      ['/account/login', 'include', { name: 'socomc', password: TYPED_A, savePassword: true }],   // step 1, the typed password -- never { name, savePassword } alone
    ]);
    expect([pwOf(A), pwOf(B)]).toEqual([savedPasswordStandIn(TYPED_A.length), savedPasswordStandIn(TYPED_B.length)]);   // A's own Success makes A's row its stand-in
  });

  it('SAVED-AT-SUCCESS-HOST: a Success with no lobby address (`connectedTo()` null; unreachable today) keeps no stand-in', async () => {
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const f = fakeFetch((q) => (q.url.endsWith('/account/login') ? { http: 200, body: { status: 0, ticket: 'tkt' } } : { http: 200, body: { status: 0 } }));
    const db = new PageAcctDb();
    db.update('lobby.test', 10075, 'socomc', TYPED, null, 0, 1);
    const c = connectLobby(host, { valves: () => valves, uiVars, service: both(f), event: () => {}, dialog: () => 'dlgNetConnect.rdr', db: () => db });
    valves.set('SecurePassword', 1, VALVE_TYPE.PERM);
    c.lobby.connect('lobby.test', 10075);
    c.frame();
    await flush();
    c.lobby.connectedTo = () => null;                                  // the guard: an answer with no address converts nothing
    uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomc' });
    uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: TYPED });
    expect(host.dispatch(cmd('LobbyLogin')).answer).toBe(true);
    for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    expect([c.lobby.loggedIn(), db.records()[0]!.password]).toEqual([true, '']);
  });

  it('a saved password never reaches /account/create: the registration answers a failure and posts nothing (SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION)', async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0 } }));
    expect(await both(f).register({ name: 'socomc', password: SAVED })).toEqual({ status: MEDIUS_STATUS.RegistrationFailed });
    expect(f.calls).toEqual([]);
    await both(f).register({ name: 'newname', password: TYPED });
    expect(sent(f)).toEqual([['/account/create', 'omit', { name: 'newname', password: TYPED }]]);
    expect(SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION).toMatch(/registration/);
  });

  it('the game\'s service logs out plain (step 5) and renews omitted; pageLoginService keeps the page\'s own origin', async () => {
    const f = fakeFetch(() => ({ http: 200, body: { status: 0 } }));
    const s = pageLoginService('?server=https://evil.example', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false, f.fetchFn, null, null);
    await s.logout!('tkt');
    await s.keepAlive!('tkt');
    await s.login({ name: 'socomc', password: SAVED });
    expect(f.calls.map((c) => [c.url, c.init.credentials])).toEqual([
      ['https://site.test/account/logout', 'omit'], ['https://site.test/lobby/update-user-state', 'omit'], ['https://site.test/account/login', 'include'],
    ]);
  });
});

describe("HARD-SEAT, measure 7: a socket that carries the ticket goes to the page's own origin (research 169 weak point 11)", () => {
  const PAGE = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
  const EVIL = '?mp&server=wss://evil.example/ws';

  it("matchSocketUrl is the page's own /ws (wss on https), whatever server= says, unless ?devmode on a development build", () => {
    for (const [search, dev] of [[EVIL, false], [`${EVIL}&devmode`, false], [EVIL, true], ['?mp', true]] as const) {
      expect(matchSocketUrl(search, PAGE, dev), `${search} ${dev}`).toBe('wss://site.test/ws');
    }
    expect(matchSocketUrl(EVIL, { protocol: 'http:', host: 'localhost:5303' }, false)).toBe('ws://localhost:5303/ws');
    expect(matchSocketUrl('?devmode&server=ws://localhost:8868/ws', PAGE, true)).toBe('ws://localhost:8868/ws');
    expect(matchSocketUrl('?devmode&server=wss://dev.example/ws', PAGE, true)).toBe('wss://dev.example/ws');
  });

  it('netSettings with a ticket takes the pinned URL; without one (the test room, /testroom) server= is honoured as today', () => {
    expect(netSettings(EVIL, PAGE, { devBuild: false })!.url).toBe('wss://site.test/ws');
    expect(netSettings(`${EVIL}&devmode`, PAGE, { devBuild: true })!.url).toBe('wss://evil.example/ws');
    expect(netSettings(EVIL, PAGE)!.url).toBe('wss://evil.example/ws');
  });
});
