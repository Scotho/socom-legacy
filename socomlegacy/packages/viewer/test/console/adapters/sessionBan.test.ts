// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BANNED_PERMANENT_ADAPTATION, type UsagePolicyService } from '@s2u/ui';
import { liveSession, type LiveSession, type RememberCard } from '../../../src/console/adapters/session';
import { fetchAccountService } from '../../../src/connectHost';
import { createSession } from '../../../src/modern/session';

/**
 * OPS-A3 (owner row H464; product track, a browser adaptation): the console launcher's session adapter
 * (`../../../src/console/adapters/session`) for central's banned refusal (-972) -- the sign-in and the load's quick
 * sign-in say the ban's words (the session's), and the quick sign-in does not ask the password as a wrong password's
 * (-978, the cookie gone) does, nor files anything on the card. Names, passwords and reasons invented.
 */

const BASE = 'https://lobby.test';
const HERE = { host: 'lobby.test', port: 10075 };
const T = Date.UTC(2026, 10, 15, 2, 30);
const TAIL = 'To ask about it, contact the staff on the SOCOM II Legacy Discord.';
/** fetch's credentials mode of the remember service. */
const REMEMBERED = 'include' as const;
/** Invented, never a real credential. */
const PW = 'invented-pw';
const NO_TIMERS = { every: () => () => {}, after: () => () => {} };
const POLICY: UsagePolicyService = { policy: async () => [{ status: 0, policy: 'PLAY FAIR.', endOfText: true }] };

function adapter(body: unknown) {
  const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  const modern = createSession(fetchAccountService(BASE, fetchFn), {
    ...NO_TIMERS, zoneOffset: () => -300,
    services: { remember: fetchAccountService(BASE, fetchFn, undefined, undefined, { credentials: REMEMBERED }) },
  });
  const filed: unknown[] = [];
  const card = {
    personas: () => [{ HOST: HERE.host, PORT: HERE.port, NAME: 'KILO', SAVEPASSWORD: 1, PASSWORD: 'xxxxxx' }],
    setPersonaLogin: (...a: unknown[]) => { filed.push(a); return true; },
    rememberNewPersona: (...a: unknown[]) => { filed.push(a); return true; },
  } as unknown as RememberCard;
  const s = liveSession(() => {}, { session: modern, policy: POLICY, card, here: async () => HERE, agreements: { get: () => null, set: () => { filed.push('agreement'); } } as never });
  return { s, filed };
}

/** The load's quick sign-in (`quick`, optional on the adapters' type; the live session always has it): asserted, then called. */
function quick(s: LiveSession): ReturnType<NonNullable<LiveSession['quick']>> {
  expect(s.quick).toBeDefined();
  if (!s.quick) throw new Error('the live session has no quick sign-in');
  return s.quick();
}

describe("OPS-A3: the console's sign-in for a banned account", () => {
  it("a sign-in refused -972 says the ban's words, with the date and the public reason", async () => {
    const { s, filed } = adapter({ status: -972, ban: { until: T, reason: 'invented <b>&' } });
    expect(await s.signIn('KILO', PW, true)).toEqual({
      ok: false, error: `This account is banned until 14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC). ${TAIL}\nReason: invented <b>&`,
    });
    expect(filed).toEqual([]);
  });

  it("the load's quick sign-in refused -972: banned, no password asked (as -978 asks), nothing filed on the card", async () => {
    const { s, filed } = adapter({ status: -972, ban: { until: null } });
    expect(await quick(s)).toEqual({ ok: false, persona: 'KILO', askPassword: false, banned: true, error: BANNED_PERMANENT_ADAPTATION });
    expect(filed).toEqual([]);
  });

  it("-972 with no ban field (an older central): the permanent sentence", async () => {
    const { s } = adapter({ status: -972 });
    expect(await s.signIn('KILO', PW)).toEqual({ ok: false, error: BANNED_PERMANENT_ADAPTATION });
  });

  it("a wrong password's quick sign-in is as today: the password asked, NO filed", async () => {
    const { s, filed } = adapter({ status: -978 });
    expect(await quick(s)).toEqual({ ok: false, persona: 'KILO', askPassword: true, error: 'This browser no longer remembers KILO. Enter its password.' });
    expect(filed).toHaveLength(1);
  });

  it("any other refusal is as today: the session's words", async () => {
    expect(await adapter({ status: -995 }).s.signIn('KILO', PW)).toEqual({ ok: false, error: 'Sign-in failed. Try again' });
    expect(await quick(adapter({ status: -998 }).s)).toEqual({ ok: false, persona: 'KILO', askPassword: false, error: 'No account by that name' });
  });
});
