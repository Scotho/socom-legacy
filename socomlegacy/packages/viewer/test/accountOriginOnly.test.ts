// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ACCOUNT_ORIGIN_ONLY_ENV, accountOriginOnly, accountServiceBase, matchSocketUrl } from '../src/connectHost';

/**
 * The nightly's account requests stay on the page's own origin (the NB-6 review's M-1, the merge controller's default in
 * the owner's stead, 2026-10-12; the owner's row in the nightly plan). The nightly is a development build (OT.R47), and a
 * development build honours `server=` under `?devmode` for the account requests (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`)
 * -- so a link to the genuine nightly with `?devmode&server=https://evil.example` would send a gated tester's name and
 * typed password elsewhere. The build-time flag `VITE_S2U_ACCOUNT_ORIGIN_ONLY=1` (set by `deploy/nightly.sh`) keeps the
 * account base, and the ticket-bearing match socket that follows it, on the page's origin whatever the address says.
 */
const PAGE = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const EVIL = '?devmode&server=https://evil.example';

describe('VITE_S2U_ACCOUNT_ORIGIN_ONLY: the account base on the page\'s own origin, even in a development build', () => {
  it('the flag reads 1 as on, anything else as off', () => {
    expect(ACCOUNT_ORIGIN_ONLY_ENV).toBe('VITE_S2U_ACCOUNT_ORIGIN_ONLY');
    expect(accountOriginOnly({ [ACCOUNT_ORIGIN_ONLY_ENV]: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'yes']) expect(accountOriginOnly({ [ACCOUNT_ORIGIN_ONLY_ENV]: v }), String(v)).toBe(false);
  });

  it('on: ?devmode&server= no longer moves the account requests, nor the ticket-bearing socket', () => {
    expect(accountServiceBase(EVIL, PAGE, true, true)).toBe('https://site.test');
    expect(matchSocketUrl(EVIL, PAGE, true, true)).toBe('wss://site.test/ws');
  });

  it('off (every other development build): the developer\'s ?devmode&server= still does, as before', () => {
    expect(accountServiceBase(EVIL, PAGE, true, false)).toBe('https://evil.example');
    expect(matchSocketUrl(EVIL, PAGE, true, false)).toBe('wss://evil.example/ws');
  });

  it('the default reads the build\'s own flag (unset in this test run: off)', () => {
    expect(accountServiceBase(EVIL, PAGE, true)).toBe('https://evil.example');
  });
});
