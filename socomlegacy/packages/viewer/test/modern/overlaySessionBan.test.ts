// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BANNED_PERMANENT_ADAPTATION } from '@s2u/ui';
import { fetchAccountService } from '../../src/connectHost';
import { overlaySession } from '../../src/modern/overlay/session';
import { createSession, type SessionSnapshot } from '../../src/modern/session';

/**
 * OPS-A3 (owner row H464; product track, a browser adaptation): the overlay's sign-in over a page reads its own modern
 * session's refusal (`../../src/modern/overlay/session`), so a banned sign-in through it says the ban's words -- the
 * sentence with the date and the public reason, as the panel's -- and a game holding no persona changes nothing of it.
 * Names, passwords and reasons invented; nothing leaves the process.
 */

const BASE = 'https://lobby.test';
const T = Date.UTC(2026, 10, 15, 2, 30);
const TAIL = 'To ask about it, contact the staff on the SOCOM II Legacy Discord.';
/** Invented, never a real credential. */
const PW = 'invented-pw';
const NO_TIMERS = { every: () => () => {}, after: () => () => {} };
const fetchOnce = (body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;

describe("OPS-A3: the overlay's sign-in says the ban's words", () => {
  it("-972 with an end and a public reason: the overlay's error and its subscribers' snapshot carry the timed sentence and the reason line", async () => {
    const own = createSession(fetchAccountService(BASE, fetchOnce({ status: -972, ban: { until: T, reason: 'invented <b>&' } })), { ...NO_TIMERS, zoneOffset: () => -300 });
    const o = overlaySession(own, () => null);
    const seen: SessionSnapshot[] = [];
    o.session.onChange((s) => { seen.push(s); });
    const r = await o.session.signIn({ name: 'Kilo', password: PW });
    const words = `This account is banned until 14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC). ${TAIL}\nReason: invented <b>&`;
    expect(r).toEqual({ ok: false, error: { code: 'banned', status: -972, message: words } });
    expect(o.session.error()).toEqual({ code: 'banned', status: -972, message: words });
    expect(seen.at(-1)).toEqual({ state: 'signed-out', account: null, error: { code: 'banned', status: -972, message: words } });
  });

  it("-972 with no ban field: the permanent sentence", async () => {
    const own = createSession(fetchAccountService(BASE, fetchOnce({ status: -972 })), NO_TIMERS);
    const o = overlaySession(own, () => null);
    await o.session.signIn({ name: 'Kilo', password: PW });
    expect(o.session.error()?.message).toBe(BANNED_PERMANENT_ADAPTATION);
  });

  it("a wrong password through the overlay reads as today", async () => {
    const own = createSession(fetchAccountService(BASE, fetchOnce({ status: -978 })), NO_TIMERS);
    const o = overlaySession(own, () => null);
    await o.session.signIn({ name: 'Kilo', password: PW });
    expect(o.session.error()).toEqual({ code: 'bad-password', status: -978, message: 'Wrong password' });
  });
});
