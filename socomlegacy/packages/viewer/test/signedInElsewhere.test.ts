// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { UiCommandHost, UiVarManager, ValveStore, type ZAnimUiCommand } from '@s2u/ui';
import {
  ACCOUNT_SERVICE_ABSENT_LABEL, connectLobby, fetchAccountService, SIGNED_IN_ELSEWHERE_ADAPTATION, SIGNED_IN_ELSEWHERE_LINE_ID, signedInElsewhereLine,
} from '../src/connectHost';

/**
 * SESSION-TAKEOVER's fold (the merge controller's condition, 2026-10-15; research 157 §6 item 3): the page whose session
 * a login elsewhere took over says so -- `SIGNED_IN_ELSEWHERE_ADAPTATION`'s line beside the original's dialog (state 2,
 * UIMnLOC 450, unchanged). The transport's part: `sessionEndedWhy` reads the dead ticket's 401 `{ reason: 'taken-over' }`
 * (the server's `SESSION_TAKEN_OVER_REASON`); the line's own show and clear. The whole chain over the real services is
 * `sessionAfterMatch.test.ts`'s. Every name, password and ticket invented; nothing leaves the process.
 */

const BASE = 'https://site.test';
const PW = 'invented-pw-elsewhere';
type Answer = { http: number; body?: unknown } | 'reject';
function fakeFetch(answers: Answer[]): { fetch: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const a = answers.shift() ?? { http: 200, body: { status: 0 } };
    if (a === 'reject') throw new TypeError('no network');
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.http });
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

afterEach(() => { document.body.replaceChildren(); });

describe('SIGNED_IN_ELSEWHERE_ADAPTATION: the transport reads why the session ended', () => {
  it('sessionEndedWhy renews the dead ticket once: a 401 { reason: "taken-over" } is taken-over', async () => {
    const f = fakeFetch([{ http: 401, body: { reason: 'taken-over' } }]);
    const service = fetchAccountService(BASE, f.fetch);
    expect(await service.sessionEndedWhy!('ticket-old')).toBe('taken-over');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe(`${BASE}/lobby/update-user-state`);
    expect((f.calls[0]!.init.headers as Record<string, string>)['authorization']).toBe('Bearer ticket-old');
    expect(f.calls[0]!.init.credentials).toBe('omit');
  });

  it('any other answer is no reason: a bare 401, another reason, a 204, a 500, a body that is not JSON, no answer at all', async () => {
    for (const a of [{ http: 401 }, { http: 401, body: { reason: 'other' } }, { http: 204 }, { http: 500, body: { reason: 'taken-over' } }, 'reject'] as Answer[]) {
      expect(await fetchAccountService(BASE, fakeFetch([a]).fetch).sessionEndedWhy!('t')).toBeNull();
    }
    const text = (async () => new Response('not json', { status: 401 })) as unknown as typeof fetch;
    expect(await fetchAccountService(BASE, text).sessionEndedWhy!('t')).toBeNull();
  });
});

describe('SIGNED_IN_ELSEWHERE_ADAPTATION: the page\'s line', () => {
  it('shows one labelled line, the page\'s words and never the game\'s, taking no pointer; clear takes it down', () => {
    const line = signedInElsewhereLine(document);
    line.show();
    line.show();
    const els = document.querySelectorAll(`#${SIGNED_IN_ELSEWHERE_LINE_ID}`);
    expect(els).toHaveLength(1);
    const el = els[0] as HTMLElement;
    expect(el.textContent).toBe(`${ACCOUNT_SERVICE_ABSENT_LABEL}${SIGNED_IN_ELSEWHERE_ADAPTATION}`);
    expect(el.querySelector('b')!.textContent).toBe(ACCOUNT_SERVICE_ABSENT_LABEL);
    expect([el.dataset['adaptation'], el.getAttribute('role'), el.style.pointerEvents]).toEqual(['SIGNED_IN_ELSEWHERE_ADAPTATION', 'status', 'none']);
    expect(SIGNED_IN_ELSEWHERE_ADAPTATION).toMatch(/signed in elsewhere/);
    line.clear();
    expect(document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID)).toBeNull();
  });

  it('the next login\'s answer with a status takes the line down', async () => {
    const line = signedInElsewhereLine(document);
    line.show();
    const service = fetchAccountService(BASE, fakeFetch([{ http: 200, body: { status: 0, ticket: 'ticket-new' } }]).fetch, undefined, line);
    expect(await service.login({ name: 'Kilo', password: PW })).toEqual({ status: 0, ticket: 'ticket-new' });
    expect(document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID)).toBeNull();
  });
});

describe('SIGNED_IN_ELSEWHERE_ADAPTATION: the line lives no longer than the lobby that lost the session (the re-review\'s F1)', () => {
  const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const line = (): HTMLElement | null => document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID);

  /** A page's lobby logged in over a fake fetch; each why (the dead ticket's renewal) answered when the test says. */
  async function loggedIn() {
    const whys: ((r: Response) => void)[] = [];
    const fetchFn = ((url: string) => {
      if (String(url).endsWith('/account/login')) return Promise.resolve(new Response(JSON.stringify({ status: 0, ticket: 'tkt' }), { status: 200 }));
      if (String(url).endsWith('/lobby/update-user-state')) return new Promise<Response>((ok) => { whys.push(ok); });
      return Promise.resolve(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    }) as unknown as typeof fetch;
    const valves = new ValveStore();
    const uiVars = new UiVarManager();
    const host = new UiCommandHost();
    const c = connectLobby(host, {
      valves: () => valves, uiVars, service: fetchAccountService(BASE, fetchFn, undefined, signedInElsewhereLine(document)),
      event: () => {}, dialog: () => 'dlgNetConnect.rdr',
    });
    c.lobby.connect('', 0);
    c.frame(); await flush();
    uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'Kilo' });
    uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: PW });
    host.dispatch(cmd('LobbyLogin'));
    for (let i = 0; i < 4; i++) { c.frame(); await flush(); }
    expect(c.lobby.ticket()).toBe('tkt');
    const taken = (): void => { whys.shift()!(new Response(JSON.stringify({ reason: 'taken-over' }), { status: 401 })); };
    return { c, taken };
  }

  it('the lobby\'s disconnect (MAIN MENU\'s teardown) takes the line down', async () => {
    const t = await loggedIn();
    t.c.lobby.sessionLost('tkt');
    t.taken(); await flush();
    expect(line()?.textContent).toContain(SIGNED_IN_ELSEWHERE_ADAPTATION);
    t.c.lobby.disconnect();
    expect(line()).toBeNull();
  });

  it('a why answered after the disconnect shows nothing -- nor after a new connect on the same page', async () => {
    const t = await loggedIn();
    t.c.lobby.sessionLost('tkt');
    t.c.lobby.disconnect();
    t.taken(); await flush();
    expect(line()).toBeNull();
    const u = await loggedIn();
    u.c.lobby.sessionLost('tkt');
    u.c.lobby.disconnect();
    u.c.lobby.connect('', 0);
    u.taken(); await flush();
    expect(line()).toBeNull();
  });
});
