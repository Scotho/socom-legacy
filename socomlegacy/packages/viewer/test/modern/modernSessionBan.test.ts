// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BANNED_PERMANENT_ADAPTATION, LOBBY_KEEPALIVE_MS, MEDIUS_STATUS } from '@s2u/ui';
import { fetchAccountService } from '../../src/connectHost';
import { createSession, type SessionOptions } from '../../src/modern/session';

/**
 * OPS-A3 (owner row H464; product track, a browser adaptation -- a service ban has no original): the modern sign-in's
 * words for central's banned refusal (-972, its body's `ban: { until, reason? }`) and for a session a ban ended (the
 * lobby endpoint's 401 `{ reason: "banned" }`). Every other status reads as today. The zone is handed in, so no test
 * reads the machine's. Names, passwords, tickets and reasons invented; nothing leaves the process.
 */

const BASE = 'https://lobby.test';
const T = Date.UTC(2026, 10, 15, 2, 30);
const TAIL = 'To ask about it, contact the staff on the SOCOM II Legacy Discord.';
const gen = (stem: string): string => `${stem}${Math.random().toString(36).slice(2, 8)}`;
type Answer = { http?: number; body?: unknown };

function fakeFetch(answers: Partial<Record<string, Answer[]>>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const path = String(input).slice(BASE.length);
    const a = answers[path]?.shift() ?? { http: 200, body: { status: 0 } };
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.http ?? 200 });
  }) as typeof fetch;
}

function clock() {
  const reps: { ms: number; fn: () => void; on: boolean }[] = [];
  return {
    every(ms: number, fn: () => void) { const r = { ms, fn, on: true }; reps.push(r); return () => { r.on = false; }; },
    after: () => () => {},
    tick(ms: number) { for (const r of reps) if (r.on && r.ms === ms) r.fn(); },
  };
}
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

/** A sign-in answered `body`; the session made with `opts` (the zone -300 unless said). */
async function refused(body: unknown, opts: Partial<SessionOptions> = {}) {
  const s = createSession(fetchAccountService(BASE, fakeFetch({ '/account/login': [{ body }] })), { zoneOffset: () => -300, ...clock(), ...opts });
  const r = await s.signIn({ name: gen('n'), password: gen('p') });
  return { s, r };
}

describe("OPS-A3: the modern sign-in says a banned account is banned", () => {
  it("-972, until null: the permanent sentence, the code 'banned', the status kept; signed out", async () => {
    const { s, r } = await refused({ status: -972, ban: { until: null } });
    expect(r).toEqual({ ok: false, error: { code: 'banned', status: -972, message: `This account is banned. ${TAIL}` } });
    expect([s.state(), s.error()]).toEqual(['signed-out', r.ok ? null : r.error]);
  });

  it("-972 with an end: the timed sentence, local and UTC; a negative offset crossing midnight and a positive one", async () => {
    expect((await refused({ status: -972, ban: { until: T } })).s.error()?.message)
      .toBe(`This account is banned until 14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC). ${TAIL}`);
    expect((await refused({ status: -972, ban: { until: Date.UTC(2026, 11, 31, 22, 0) } }, { zoneOffset: () => 120 })).s.error()?.message)
      .toBe(`This account is banned until 1 Jan 2027 00:00 (31 Dec 2026 22:00 UTC). ${TAIL}`);
  });

  it("the zone is the browser's own when none is handed in (asked at the ban's end)", async () => {
    const s = createSession(fetchAccountService(BASE, fakeFetch({ '/account/login': [{ body: { status: -972, ban: { until: T } } }] })), clock());
    await s.signIn({ name: gen('n'), password: gen('p') });
    expect(s.error()?.message).toContain('UTC). To ask about it');
  });

  it("a public reason: its own line, as text -- <b> and & come out as they are; none: no reason line", async () => {
    expect((await refused({ status: -972, ban: { until: null, reason: 'invented <b>x</b> & y' } })).s.error()?.message)
      .toBe(`${BANNED_PERMANENT_ADAPTATION}\nReason: invented <b>x</b> & y`);
    expect((await refused({ status: -972, ban: { until: null } })).s.error()?.message).not.toContain('Reason');
  });

  it("a reason holding #C1, #B, <b>, &amp; and a newline comes out literally, as text, on one line of its own", async () => {
    const msg = (await refused({ status: -972, ban: { until: null, reason: 'aim #C1 bot #B\n<b>x</b> &amp; y' } })).s.error()?.message ?? '';
    expect(msg).toBe(`${BANNED_PERMANENT_ADAPTATION}\nReason: aim #C1 bot #B <b>x</b> &amp; y`);
    expect(msg.split('\n')).toHaveLength(2);                            // the sentence and the reason: no third, fake line
  });

  it("a reason past 500 characters is cut at 500", async () => {
    const msg = (await refused({ status: -972, ban: { until: null, reason: 'z'.repeat(700) } })).s.error()?.message ?? '';
    expect(msg).toBe(`${BANNED_PERMANENT_ADAPTATION}\nReason: ${'z'.repeat(500)}`);
  });

  it("-972 with no ban field (an older central), or one out of shape: the permanent sentence", async () => {
    for (const body of [{ status: -972 }, { status: -972, ban: 'x' }, { status: -972, ban: { until: 'soon' } }]) {
      expect((await refused(body)).s.error()).toEqual({ code: 'banned', status: -972, message: BANNED_PERMANENT_ADAPTATION });
    }
  });

  it("every other status reads as today (the strings this file held before), a ban field beside it ignored", async () => {
    const today: Array<[number, string, string]> = [
      [MEDIUS_STATUS.AccountNotFound, 'not-found', 'No account by that name'],
      [MEDIUS_STATUS.AccountLoggedIn, 'logged-in', 'That account is already signed in'],
      [MEDIUS_STATUS.InvalidPassword, 'bad-password', 'Wrong password'],
      [MEDIUS_STATUS.LoginFailed, 'failed', 'Sign-in failed. Try again'],
      [MEDIUS_STATUS.Fail, 'failed', 'Sign-in failed. Try again'],
      [-971, 'failed', 'Sign-in failed. Try again'],
      [-973, 'failed', 'Sign-in failed. Try again'],
    ];
    for (const [status, code, message] of today) {
      expect((await refused({ status, ban: { until: null, reason: 'invented' } })).s.error()).toEqual({ code, status, message });
    }
  });

  it("a session a ban ended (the keep-alive's 401, the why { reason: \"banned\" }): the permanent sentence, signed out", async () => {
    const c = clock();
    const s = createSession(fetchAccountService(BASE, fakeFetch({
      '/account/login': [{ body: { status: 0, ticket: gen('t') } }],
      '/lobby/update-user-state': [{ http: 401, body: { reason: 'banned' } }, { http: 401, body: { reason: 'banned' } }],
    })), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    s.accept!();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect([s.state(), s.error()]).toEqual(['signed-out', { code: 'banned', status: null, message: BANNED_PERMANENT_ADAPTATION }]);
  });

  it("taken-over is unchanged: signed in elsewhere", async () => {
    const c = clock();
    const s = createSession(fetchAccountService(BASE, fakeFetch({
      '/account/login': [{ body: { status: 0, ticket: gen('t') } }],
      '/lobby/update-user-state': [{ http: 401, body: { reason: 'taken-over' } }, { http: 401, body: { reason: 'taken-over' } }],
    })), c);
    await s.signIn({ name: gen('n'), password: gen('p') });
    s.accept!();
    c.tick(LOBBY_KEEPALIVE_MS); await flush();
    expect(s.error()).toEqual({ code: 'signed-in-elsewhere', status: null, message: 'Signed out: this account signed in elsewhere' });
  });
});
