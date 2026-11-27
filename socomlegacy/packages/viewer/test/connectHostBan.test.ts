// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BANNED_PERMANENT_ADAPTATION, banWords, DIALOG_EVENTS, LOGIN_FAILURE_TEXT, UiCommandHost, UiVarManager, ValveStore, type ZAnimUiCommand } from '@s2u/ui';
import {
  ACCOUNT_SERVICE_ABSENT_LABEL, connectLobby, fetchAccountService, SIGNED_IN_ELSEWHERE_ADAPTATION, SIGNED_IN_ELSEWHERE_LINE_ID, signedInElsewhereLine,
} from '../src/connectHost';

/**
 * OPS-A3 (owner row H464; product track, a browser adaptation -- a service ban has no original): the page's account
 * transport (`../src/connectHost`) for central's ban -- the login's -972 carries the reply's `ban` to the screens, the
 * dead ticket's 401 `{ reason: "banned" }` is the reason `banned`, and the page's line beside the original's dialog
 * (where a takeover says signed in elsewhere) says the permanent sentence for it, as text. Every other answer, and
 * the original's own events, as today. Names, passwords, tickets and reasons invented; nothing leaves the process.
 */

const BASE = 'https://site.test';
const PW = 'invented-pw-ban';
const T = Date.UTC(2026, 10, 15, 2, 30);
type Answer = { http: number; body?: unknown } | 'reject';
const fetchOf = (answers: Answer[]): typeof fetch => (async () => {
  const a = answers.shift() ?? { http: 200, body: { status: 0 } };
  if (a === 'reject') throw new TypeError('no network');
  return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.http });
}) as unknown as typeof fetch;

afterEach(() => { document.body.replaceChildren(); });

describe("OPS-A3: the transport carries the ban", () => {
  it("a login answered -972 carries the reply's ban: its end and its public reason; with none, no ban", async () => {
    const login = (body: unknown) => fetchAccountService(BASE, fetchOf([{ http: 200, body }])).login({ name: 'Kilo', password: PW });
    expect(await login({ status: -972, ban: { until: T, reason: 'invented' } })).toEqual({ status: -972, ban: { until: T, reason: 'invented' } });
    expect(await login({ status: -972, ban: { until: null } })).toEqual({ status: -972, ban: { until: null } });
    expect(await login({ status: -972 })).toEqual({ status: -972 });
    expect(await login({ status: -972, ban: 'x' })).toEqual({ status: -972 });
  });

  it("every other answer is as today: a ban field beside another status is not carried", async () => {
    const login = (body: unknown) => fetchAccountService(BASE, fetchOf([{ http: 200, body }])).login({ name: 'Kilo', password: PW });
    expect(await login({ status: -978, ban: { until: null } })).toEqual({ status: -978 });
    expect(await login({ status: 0, ticket: 'tkt', ban: { until: null } })).toEqual({ status: 0, ticket: 'tkt' });
    expect(await login({ status: -995 })).toEqual({ status: -995 });
  });

  it("sessionEndedWhy: a 401 { reason: \"banned\" } is banned; taken-over as today; anything else no reason", async () => {
    expect(await fetchAccountService(BASE, fetchOf([{ http: 401, body: { reason: 'banned' } }])).sessionEndedWhy!('t')).toBe('banned');
    expect(await fetchAccountService(BASE, fetchOf([{ http: 401, body: { reason: 'taken-over' } }])).sessionEndedWhy!('t')).toBe('taken-over');
    for (const a of [{ http: 401, body: { reason: 'other' } }, { http: 500, body: { reason: 'banned' } }, { http: 401 }, 'reject'] as Answer[]) {
      expect(await fetchAccountService(BASE, fetchOf([a])).sessionEndedWhy!('t')).toBeNull();
    }
  });
});

describe("OPS-A3: the page's line for a session a ban ended", () => {
  it("show(words) puts the words in the line as text, labelled; show() is the signed-in-elsewhere line as before", () => {
    const line = signedInElsewhereLine(document);
    line.show('a <b>bold</b> & claim');
    const el = document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID)!;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}a <b>bold</b> & claim`);
    expect(el.querySelectorAll('b')).toHaveLength(1);                 // the label's own, nothing parsed from the words
    expect(el.dataset['adaptation']).toBe('ACCOUNT_BANNED_LINE_ADAPTATION');
    line.show();
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${SIGNED_IN_ELSEWHERE_ADAPTATION}`);
    expect(el.dataset['adaptation']).toBe('SIGNED_IN_ELSEWHERE_ADAPTATION');
  });

  const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  /** A page's lobby over a fake fetch: the login answered `login`; each why answered `why`. */
  async function lobbyOf(login: unknown, why: unknown = { reason: 'banned' }) {
    const events: Array<[number, string | null]> = [];
    const fetchFn = ((url: string) => {
      if (String(url).endsWith('/account/login')) return Promise.resolve(new Response(JSON.stringify(login), { status: 200 }));
      if (String(url).endsWith('/lobby/update-user-state')) return Promise.resolve(new Response(JSON.stringify(why), { status: 401 }));
      return Promise.resolve(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    }) as unknown as typeof fetch;
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const c = connectLobby(host, {
      valves: () => valves, uiVars, service: fetchAccountService(BASE, fetchFn, undefined, signedInElsewhereLine(document)),
      event: (k, t) => { events.push([k, t]); }, dialog: () => 'dlgNetConnect.rdr', registerLine: null, loginLine: null,
    });
    c.lobby.connect('', 0);
    c.frame(); await flush();
    uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'Kilo' });
    uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: PW });
    host.dispatch(cmd('LobbyLogin'));
    for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    return { c, events: events.slice(1) };
  }
  const line = (): HTMLElement | null => document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID);

  it("the session lost and the why banned: the line says the permanent sentence (the 401 carries no date)", async () => {
    const t = await lobbyOf({ status: 0, ticket: 'tkt' });
    expect(t.c.lobby.ticket()).toBe('tkt');
    t.c.lobby.sessionLost('tkt');
    await flush(); await flush();
    expect(line()?.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${BANNED_PERMANENT_ADAPTATION}`);
    t.c.lobby.disconnect();
    expect(line()).toBeNull();
  });

  it("taken-over is unchanged: signed in elsewhere", async () => {
    const t = await lobbyOf({ status: 0, ticket: 'tkt' }, { reason: 'taken-over' });
    t.c.lobby.sessionLost('tkt');
    await flush(); await flush();
    expect(line()?.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${SIGNED_IN_ELSEWHERE_ADAPTATION}`);
  });

  it("the line given a reason holding #C1, #B, <b>, &amp; and a newline shows it literally, as text: no element made, one reason line", () => {
    const words = banWords({ until: null, reason: 'aim #C1 bot #B\n<b>x</b> &amp; <i>y</i>' }, () => -300);
    signedInElsewhereLine(document).show(words);
    const el = document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID)!;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${BANNED_PERMANENT_ADAPTATION}\nReason: aim #C1 bot #B <b>x</b> &amp; <i>y</i>`);
    expect(el.querySelectorAll('b')).toHaveLength(1);                 // the label's own
    expect(el.querySelectorAll('i')).toHaveLength(0);
    expect(el.textContent!.split('\n')).toHaveLength(2);
  });

  it("the original's LOGIN answered -972 with a public reason: its MP_MEDIUS_ERROR text holds no part of the reason", async () => {
    const parts = ['ZULUWORD', '#C1', '#B', 'QUEBECWORD'];
    const events = (await lobbyOf({ status: -972, ban: { until: T, reason: parts.join(' ') } })).events;
    expect(events).toHaveLength(1);
    expect(events[0]![0]).toBe(DIALOG_EVENTS.MP_MEDIUS_ERROR);
    for (const p of parts) expect(events[0]![1], p).not.toContain(p);
    expect(events[0]![1]).not.toContain('Reason');
  });

  it("the original's LOGIN answered -972: its MP_MEDIUS_ERROR carries the ban's sentence; -995 is \"Login Failure\" as before", async () => {
    expect((await lobbyOf({ status: -972, ban: { until: null, reason: 'invented' } })).events).toEqual([[DIALOG_EVENTS.MP_MEDIUS_ERROR, BANNED_PERMANENT_ADAPTATION]]);
    expect((await lobbyOf({ status: -972 })).events).toEqual([[DIALOG_EVENTS.MP_MEDIUS_ERROR, BANNED_PERMANENT_ADAPTATION]]);
    expect((await lobbyOf({ status: -995 })).events).toEqual([[DIALOG_EVENTS.MP_MEDIUS_ERROR, LOGIN_FAILURE_TEXT]]);
  });
});
