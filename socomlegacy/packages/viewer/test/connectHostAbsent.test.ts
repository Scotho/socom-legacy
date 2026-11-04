// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, LOGIN_FAILURE_TEXT, MEDIUS_STATUS, UiCommandHost, UiVarManager, ValveStore, type ZAnimUiCommand } from '@s2u/ui';
import {
  ACCOUNT_SERVICE_ABSENT_ADAPTATION, ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION, ACCOUNT_SERVICE_ABSENT_LABEL, ACCOUNT_SERVICE_ABSENT_LINE_ID, ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION,
  accountServiceAbsentLine, connectLobby,
  fetchAccountService, pageAccountService, type AccountServiceAbsentLine,
} from '../src/connectHost';

/**
 * PTT-3 (web sprint 37; issue #100; research 157 §5, §11): a 404 from the account base on the login screen's account
 * routes (`/account/login`, `/account/create`) whose body carries no Medius status -- no account service behind the
 * origin (Vite's dev server, a static host, a match server with no `DATA_DIR`) -- shows the page's own labelled line
 * (`ACCOUNT_SERVICE_ABSENT_ADAPTATION`) beside the original's Login Failure, which still shows. The original's statuses,
 * the keep-alive's 404 (`KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`) and every request the page sends are unchanged.
 */

const TYPED = 'secret';
const BASE = 'http://127.0.0.1:5304';

interface Call { url: string; init: RequestInit }
type Answer = { http: number; body?: unknown };
function fakeFetch(answer: (c: Call) => Answer) {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init: RequestInit = {}) => {
    const c = { url, init };
    calls.push(c);
    const a = answer(c);
    return Promise.resolve({ ok: a.http >= 200 && a.http < 300, status: a.http, json: () => (a.body === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(a.body)) } as Response);
  }) as typeof fetch;
  return { calls, fetchFn };
}

/** A line that counts what it was told. */
function fakeLine() {
  const told: Array<['show', string] | ['clear']> = [];
  const line: AccountServiceAbsentLine = { show: (base) => { told.push(['show', base]); }, clear: () => { told.push(['clear']); } };
  return { told, line, shown: () => told.filter((t) => t[0] === 'show').length };
}

afterEach(() => { document.body.replaceChildren(); });

describe('PTT-3 (a): a 404 with no account service behind the origin shows the page\'s own labelled line', () => {
  it('login: the line is shown with the base, and the reply is still MediusFail (the original\'s Login Failure path stands)', async () => {
    const l = fakeLine();
    const r = await fetchAccountService(BASE, fakeFetch(() => ({ http: 404 })).fetchFn, l.line).login({ name: 'socomc', password: TYPED });
    expect(r).toEqual({ status: MEDIUS_STATUS.Fail });
    expect(l.told).toEqual([['show', BASE]]);
    expect(ACCOUNT_SERVICE_ABSENT_ADAPTATION).toBe('no account service at this origin');
  });

  it('a 404 whose body is not a Medius status (HTML, text, another JSON shape) is the same absent service', async () => {
    for (const body of [undefined, 'Cannot POST /account/login', { error: 'not found' }, { status: 'x' }, null]) {
      const l = fakeLine();
      await fetchAccountService(BASE, fakeFetch(() => ({ http: 404, body })).fetchFn, l.line).login({ name: 'socomc', password: TYPED });
      expect(l.shown(), JSON.stringify(body)).toBe(1);
    }
  });

  it('create (the register question\'s YES on the login screen): a 404 shows the line; the reply is a registration failure', async () => {
    const l = fakeLine();
    expect(await fetchAccountService(BASE, fakeFetch(() => ({ http: 404 })).fetchFn, l.line).register({ name: 'newname', password: TYPED }))
      .toEqual({ status: MEDIUS_STATUS.Fail });
    expect(l.told).toEqual([['show', BASE]]);
  });

  it('a 404 that carries a Medius status is the service\'s own answer: its status, and no line', async () => {
    const l = fakeLine();
    expect(await fetchAccountService(BASE, fakeFetch(() => ({ http: 404, body: { status: MEDIUS_STATUS.InvalidPassword } })).fetchFn, l.line)
      .login({ name: 'socomc', password: TYPED })).toEqual({ status: MEDIUS_STATUS.InvalidPassword });
    expect(l.shown()).toBe(0);
  });

  it('the other answers with no status (403 a refused Origin, 500, 429 bare) keep ACCOUNT_HTTP_REFUSAL_ADAPTATION alone: no line', async () => {
    for (const http of [403, 500, 429, 405]) {
      const l = fakeLine();
      await fetchAccountService(BASE, fakeFetch(() => ({ http })).fetchFn, l.line).login({ name: 'socomc', password: TYPED });
      expect(l.shown(), String(http)).toBe(0);
    }
  });

  it('on the page (pageAccountService over the document): one labelled line, the page\'s and not the game\'s, gone at the next answer that carries a status', async () => {
    const PAGE = { protocol: 'http:', host: '127.0.0.1:5304', origin: BASE };
    let http = 404;
    const f = fakeFetch(() => (http === 404 ? { http } : { http, body: { status: MEDIUS_STATUS.InvalidPassword } }));
    const s = pageAccountService('?menuflow=dlgNetPlayerName.rdr', PAGE, false, f.fetchFn);
    await s.login({ name: 'socomc', password: TYPED });
    await s.login({ name: 'socomc', password: TYPED });
    const lines = document.querySelectorAll(`#${ACCOUNT_SERVICE_ABSENT_LINE_ID}`);
    expect(lines).toHaveLength(1);
    const el = lines[0] as HTMLElement;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${ACCOUNT_SERVICE_ABSENT_ADAPTATION} (${BASE})`);
    expect(ACCOUNT_SERVICE_ABSENT_LABEL).toMatch(/browser adaptation/i);
    expect(ACCOUNT_SERVICE_ABSENT_LABEL).toMatch(/not the game/i);
    expect(el.getAttribute('role')).toBe('status');
    expect(el.dataset['adaptation']).toBe('ACCOUNT_SERVICE_ABSENT_ADAPTATION');
    http = 200;
    await s.login({ name: 'socomc', password: TYPED });
    expect(document.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID)).toBeNull();
  });

  it('accountServiceAbsentLine: show twice is one line; clear with none shown is nothing', () => {
    const line = accountServiceAbsentLine(document);
    line.clear();
    line.show(BASE);
    line.show(BASE);
    expect(document.querySelectorAll(`#${ACCOUNT_SERVICE_ABSENT_LINE_ID}`)).toHaveLength(1);
    line.clear();
    expect(document.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID)).toBeNull();
  });
});

/**
 * LATER 27 (a) (the merge controller's call, product taste, 2026-10-19): on a window wider than the front end's frame
 * (`frontEnd.ts`: the 640 x 448 canvas, `object-fit: contain`) the line goes into the right-hand letterbox bar -- its width
 * capped to the bar less its 8 px gutters -- so it never lies over the frame's dialog title (a phone held sideways, 812 x
 * 375: each bar ~138 px); with no bar wide enough (`ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION`) it stays at the window's
 * top right as RV-10 left it. Placed again on a resize (a phone turned). The exact 640 x 448 window has no bar: known.
 */
describe('LATER 27 (a): the line in the right letterbox bar when the window has one', () => {
  const size = (w: number, h: number): void => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true });
  };
  const el = (): HTMLElement => document.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID)!;
  afterEach(() => { accountServiceAbsentLine(document).clear(); size(1024, 768); });

  it('812 x 375 (a phone sideways): in the right bar, its width the bar less 16 px, top right of the window', () => {
    size(812, 375);
    accountServiceAbsentLine(document).show(BASE);
    const bar = (812 - 375 * 640 / 448) / 2;
    expect(el().style.maxWidth).toBe(`${Math.floor(bar - 16)}px`);
    expect([el().style.top, el().style.right]).toEqual(['8px', '8px']);
  });

  it('a window with no bar wide enough (640 x 448, 375 x 812): RV-10\'s cap at the top right, as before', () => {
    for (const [w, h] of [[640, 448], [375, 812]] as const) {
      size(w, h);
      const line = accountServiceAbsentLine(document);
      line.show(BASE);
      expect(el().style.maxWidth, `${w} x ${h}`).toBe(ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION);
      line.clear();
    }
    expect(ACCOUNT_SERVICE_ABSENT_BAR_MIN_ADAPTATION).toBeGreaterThan(0);
  });

  it("its review's F1: with the front end's canvas on the page, the bar is measured from its box (a cutout's inset on one side moves the frame)", () => {
    size(812, 375);
    const canvas = document.createElement('canvas');
    canvas.id = 'front-end';
    canvas.getBoundingClientRect = () => ({ left: 40, top: 0, width: 772, height: 375, right: 812, bottom: 375, x: 40, y: 0, toJSON() {} }) as DOMRect;
    document.body.append(canvas);
    try {
      accountServiceAbsentLine(document).show(BASE);
      const frame = Math.min(772, 375 * 640 / 448), right = 40 + (772 + frame) / 2;   // the contained frame, centred in its box
      expect(el().style.maxWidth).toBe(`${Math.floor(812 - right - 16)}px`);       // 102, not the centred window's 122
    } finally { canvas.remove(); }
  });

  it('a resize places it again (the phone turned): bar -> no bar -> bar', () => {
    size(375, 812);
    accountServiceAbsentLine(document).show(BASE);
    expect(el().style.maxWidth).toBe(ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION);
    size(812, 375);
    window.dispatchEvent(new Event('resize'));
    expect(el().style.maxWidth).toBe(`${Math.floor((812 - 375 * 640 / 448) / 2 - 16)}px`);
  });
});

describe("PTT-3 (a), (b): through the lobby client, the original's events are unchanged; the line only beside the 404's Login Failure", () => {
  const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  async function loginAnswered(login: Answer): Promise<{ events: Array<[number, string | null]>; shown: number }> {
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const events: Array<[number, string | null]> = [];
    const l = fakeLine();
    const f = fakeFetch((c) => (c.url.endsWith('/account/login') ? login : { http: 200, body: { status: 0 } }));
    const c = connectLobby(host, { valves: () => valves, uiVars, service: fetchAccountService(BASE, f.fetchFn, l.line), event: (k, t) => { events.push([k, t]); }, dialog: () => 'dlgNetConnect.rdr' });
    c.lobby.connect('', 0);
    c.frame();
    await flush();
    uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomc' });
    uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: TYPED });
    host.dispatch(cmd('LobbyLogin'));
    for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    return { events: events.slice(1), shown: l.shown() };   // the connect's MP_SUCCESS aside
  }

  it("(a) a login 404: the original's MP_MEDIUS_ERROR \"Login Failure\" as before, and the page's line beside it", async () => {
    expect(await loginAnswered({ http: 404 })).toEqual({ events: [[DIALOG_EVENTS.MP_MEDIUS_ERROR, LOGIN_FAILURE_TEXT]], shown: 1 });
  });

  it('(b) a wrong password (-978), already logged in (-997) and a refusal the service answers (-995 at 429): their own events, no line', async () => {
    expect(await loginAnswered({ http: 200, body: { status: MEDIUS_STATUS.InvalidPassword } })).toEqual({ events: [[DIALOG_EVENTS.MP_INVALID_PASSWORD, null]], shown: 0 });
    expect(await loginAnswered({ http: 200, body: { status: MEDIUS_STATUS.AccountLoggedIn } })).toEqual({ events: [[DIALOG_EVENTS.MP_PLAYER_LOGGED_IN, null]], shown: 0 });
    expect(await loginAnswered({ http: 429, body: { status: MEDIUS_STATUS.LoginFailed } })).toEqual({ events: [[DIALOG_EVENTS.MP_MEDIUS_ERROR, LOGIN_FAILURE_TEXT]], shown: 0 });
  });
});

describe("PTT-3 review F1: the line lives no longer than the lobby's connection", () => {
  const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const line = (): HTMLElement | null => document.getElementById(ACCOUNT_SERVICE_ABSENT_LINE_ID);

  /** A lobby over the page's line (the document's), its login answered by `answer` (a 404 unless changed). */
  function page(answer: () => Promise<Answer> = () => Promise.resolve({ http: 404 })) {
    const valves = new ValveStore(), uiVars = new UiVarManager(), host = new UiCommandHost();
    const fetchFn = ((url: string) => (url.endsWith('/account/login') ? answer() : Promise.resolve({ http: 200, body: { status: 0 } })).then((a) => ({
      ok: a.http >= 200 && a.http < 300, status: a.http, json: () => (a.body === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(a.body)),
    } as Response))) as typeof fetch;
    const c = connectLobby(host, { valves: () => valves, uiVars, service: fetchAccountService(BASE, fetchFn, accountServiceAbsentLine(document)), event: () => {}, dialog: () => 'dlgNetConnect.rdr' });
    const login = async (): Promise<void> => {
      c.lobby.connect('', 0);
      c.frame();
      await flush();
      uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'socomc' });
      uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: TYPED });
      host.dispatch(cmd('LobbyLogin'));
      for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    };
    return { c, login };
  }

  it("the front end's stop (mount.stop -> FrontEndSession.close -> the lobby's close) takes the line down", async () => {
    const p = page();
    await p.login();
    expect(line()).not.toBeNull();
    p.c.lobby.close();
    expect(line()).toBeNull();
  });

  it('backing out (LobbyDisconnect -> the lobby\'s disconnect) takes it down too, so an offline game never shows it', async () => {
    const p = page();
    await p.login();
    expect(line()).not.toBeNull();
    p.c.lobby.disconnect();
    expect(line()).toBeNull();
  });

  it('a 404 that lands after the stop shows nothing', async () => {
    let land: (a: Answer) => void = () => {};
    const p = page(() => new Promise((r) => { land = r; }));
    await p.login();
    p.c.lobby.close();
    land({ http: 404 });
    await flush();
    expect(line()).toBeNull();
  });

  it('sits at the top right, in the frame\'s empty title band, clear of the Login Failure popup, the lower band and the playtest badge', () => {
    accountServiceAbsentLine(document).show(BASE);
    const s = line()!.style;
    expect([s.position, s.top, s.right, s.bottom, s.left]).toEqual(['fixed', '8px', '8px', '', '']);
  });

  it('RV-10 (LATER 27; research 276 §12): its width is capped to the window less 8 px each side, a long base wraps inside it, the rest unchanged', () => {
    expect(ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION).toBe('calc(100vw - 16px)');
    const before = accountServiceAbsentLine(document);
    before.show(BASE);
    const el = line()!;
    const s = el.style;
    expect(s.maxWidth).toBe(ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION);
    expect(s.overflowWrap).toBe('anywhere');
    // Written as CSS declarations, not only as properties of the style object.
    expect(el.getAttribute('style')).toContain('max-width: calc(100vw - 16px)');
    expect(el.getAttribute('style')).toContain('overflow-wrap: anywhere');
    // The rest of the creation block as it was: placement, layer, no pointer, no width of its own, no new class or text.
    expect([s.position, s.top, s.right, s.bottom, s.left, s.margin, s.zIndex, s.pointerEvents, s.width])
      .toEqual(['fixed', '8px', '8px', '', '', '0px', '1001', 'none', '']);
    expect(el.className).toBe('s2u-notice');
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${ACCOUNT_SERVICE_ABSENT_ADAPTATION} (${BASE})`);
    // A second show keeps the one element and its style (the creation block runs once).
    before.show('https://a-long-host-name-with-no-break-opportunity.example:8443');
    expect(document.querySelectorAll(`#${ACCOUNT_SERVICE_ABSENT_LINE_ID}`)).toHaveLength(1);
    expect([line()!.style.maxWidth, line()!.style.overflowWrap]).toEqual([ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION, 'anywhere']);
  });
});

describe('PTT-3 (c): the keep-alive\'s 404 is still the session lost (KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION), with no line', () => {
  it('keepAlive answered 404 reads false, and the line is neither shown nor cleared', async () => {
    const l = fakeLine();
    expect(await fetchAccountService(BASE, fakeFetch(() => ({ http: 404 })).fetchFn, l.line).keepAlive!('tkt')).toBe(false);
    expect(l.told).toEqual([]);
  });

  it('logout answered 404 is not the login screen\'s: no line', async () => {
    const l = fakeLine();
    expect(await fetchAccountService(BASE, fakeFetch(() => ({ http: 404 })).fetchFn, l.line).logout!('tkt')).toEqual({ status: MEDIUS_STATUS.Fail });
    expect(l.told).toEqual([]);
  });
});

describe('PTT-3 (d): nothing the page sends changes', () => {
  it('the 404 case sends the one request a 200 case sends: the same URL, method, headers, body, credentials and cache, once', async () => {
    const sent = async (a: Answer, line?: AccountServiceAbsentLine): Promise<Call[]> => {
      const f = fakeFetch(() => a);
      const s = fetchAccountService(BASE, f.fetchFn, line);
      await s.login({ name: 'socomc', password: TYPED });
      await s.register({ name: 'newname', password: TYPED });
      return f.calls;
    };
    const absent = await sent({ http: 404 }, fakeLine().line);
    const answered = await sent({ http: 200, body: { status: 0, ticket: 'tkt' } });
    const without = await sent({ http: 404 });
    expect(absent).toHaveLength(2);
    expect(absent).toEqual(answered);
    expect(absent).toEqual(without);
    expect(absent[0]).toEqual({ url: `${BASE}/account/login`, init: {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'socomc', password: TYPED, savePassword: false }), credentials: 'omit', cache: 'no-store',
    } });
    expect(absent[1]!.url).toBe(`${BASE}/account/create`);
  });
});
