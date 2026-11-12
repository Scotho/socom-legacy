import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { authorizationFromLine, validateCallback, copiedSetup } from './nativeOAuth';

const gateway = 'http://127.0.0.1:5368';
const auth = `${gateway}/authorize?state=synthetic-state&redirect_uri=${encodeURIComponent('http://127.0.0.1:54321/callback')}&code_challenge=synthetic-challenge&code_challenge_method=S256&response_type=code`;
it('accepts only the copied local setup endpoint and invitation, never shell text as executable input', () => {
  // AX-U: the first-time disclosure's copied command, then the one connect line (its join link on this gateway).
  const blurb = `codex mcp add socom2legacy --url ${gateway}/mcp\ncodex mcp login socom2legacy\nConnect to my SOCOM 2 Legacy page: ${gateway}/join/synthetic-invitation`;
  expect(copiedSetup(blurb, 'codex', gateway)).toEqual({ endpoint: `${gateway}/mcp`, invitation: 'synthetic-invitation' });
  expect(() => copiedSetup(blurb.replace(gateway, 'https://unrelated.invalid'), 'codex', gateway)).toThrow('COPIED_SETUP_MISMATCH');
  expect(() => copiedSetup(blurb.replace('/mcp', '/mcp?access_token=private'), 'codex', gateway)).toThrow('COPIED_SETUP_MISMATCH');
  expect(() => copiedSetup(`${blurb}?x=1`, 'codex', gateway)).toThrow('COPIED_SETUP_MISMATCH');
  expect(() => copiedSetup(blurb.replace('/join/synthetic-invitation', '/join/a b'), 'codex', gateway)).toThrow('COPIED_SETUP_MISMATCH');
  expect(() => copiedSetup(blurb.replace(`${gateway}/join`, 'https://unrelated.invalid/join'), 'codex', gateway)).toThrow('COPIED_SETUP_MISMATCH');
});
it('validates CLI authorization origin, PKCE and loopback callback before opening any browser', () => {
  expect(authorizationFromLine(auth, gateway)?.href).toBe(auth);
  expect(authorizationFromLine('ordinary output', gateway)).toBeUndefined();
  for (const line of [auth.replace(gateway, 'https://unrelated.invalid'), auth.replace('S256', 'plain'), auth.replace('127.0.0.1%3A54321', 'unrelated.invalid%3A54321')]) {
    expect(() => authorizationFromLine(line, gateway)).toThrow('NATIVE_OAUTH_URL_INVALID');
  }
});
const frames = [
  { label: 'single quotes', before: "'", after: "'" },
  { label: 'double quotes', before: '"', after: '"' },
  { label: 'parentheses', before: '(', after: ')' },
  { label: 'angle brackets', before: '<', after: '>' },
];
it.each(frames)('extracts a CLI URL in paired $label without appending framing to the last resource', ({ before, after }) => {
  const expected = `${auth}&resource=${encodeURIComponent(`${gateway}/mcp`)}`;
  const parsed = authorizationFromLine(`Open ${before}${expected}${after} to authorize.`, gateway);
  expect(parsed?.href).toBe(new URL(expected).href);
  expect(parsed?.searchParams.get('resource')).toBe(`${gateway}/mcp`);
});
it.each(frames)('preserves opaque URI punctuation inside paired $label', ({ before, after }) => {
  // RFC 3986 sections 2.2/3.4 permit these characters in query data; framing must not trim them.
  const state = "synthetic'(),.";
  const expected = `${auth.replace('state=synthetic-state&', '')}&state=${state}`;
  const parsed = authorizationFromLine(`Open ${before}${expected}${after} to authorize.`, gateway);
  expect(parsed?.href).toBe(new URL(expected).href);
  expect(parsed?.searchParams.get('state')).toBe(state);
});
it.each([
  { label: 'single-quote data', before: "'", after: "'", state: "synthetic'" },
  { label: 'closing-parenthesis data', before: '(', after: ')', state: 'synthetic)' },
])('removes one outer delimiter while retaining terminal $label', ({ before, after, state }) => {
  const expected = `${auth.replace('state=synthetic-state&', '')}&state=${state}`;
  const parsed = authorizationFromLine(`Open ${before}${expected}${after} to authorize.`, gateway);
  expect(parsed?.href).toBe(new URL(expected).href);
  expect(parsed?.searchParams.get('state')).toBe(state);
});
it.each([
  { label: 'period after single quotes', before: "'", after: "'." },
  { label: 'comma after parentheses', before: '(', after: '),' },
])('explicitly refuses ambiguous adjacent prose: $label instead of guessing a URL suffix', ({ before, after }) => {
  const expected = `${auth}&resource=${encodeURIComponent(`${gateway}/mcp`)}`;
  expect(() => authorizationFromLine(`Open ${before}${expected}${after}`, gateway)).toThrow('NATIVE_OAUTH_URL_INVALID');
});
it.each(["'", ')', ',', '.'])('preserves an unframed state tail %s without guessing that it is prose', (tail) => {
  const state = `synthetic${tail}`;
  const expected = `${auth.replace('state=synthetic-state&', '')}&state=${state}`;
  const parsed = authorizationFromLine(`Open ${expected}`, gateway);
  expect(parsed?.href).toBe(new URL(expected).href);
  expect(parsed?.searchParams.get('state')).toBe(state);
});
it.each(["'", ')', ',', '.'])('preserves an unframed resource tail %s without changing opaque query data', (tail) => {
  const resource = `${gateway}/mcp${tail}`;
  const expected = `${auth}&resource=${resource}`;
  const parsed = authorizationFromLine(`Open ${expected}`, gateway);
  expect(parsed?.href).toBe(new URL(expected).href);
  expect(parsed?.searchParams.get('resource')).toBe(resource);
});
it('preserves percent-encoded opaque state bytes and escape spelling during extraction', () => {
  const expected = `${auth.replace('state=synthetic-state&', '')}&state=synthetic%2fopaque%2B%27%29%2c%2e`;
  expect(authorizationFromLine(`Open '${expected}' to authorize.`, gateway)?.search).toBe(new URL(expected).search);
});
it('binds callback origin, path and state without exposing codes in errors', () => {
  const good = 'http://127.0.0.1:54321/callback?state=synthetic-state&code=synthetic-code';
  expect(validateCallback(new URL(auth), good)).toBe(good);
  for (const value of [good.replace('synthetic-state', 'wrong'), good.replace('54321', '54322'), good.replace('/callback', '/wrong'), good.replace('&code=synthetic-code', '')]) {
    expect(() => validateCallback(new URL(auth), value)).toThrow('NATIVE_OAUTH_CALLBACK_INVALID');
  }
});

// Offline target/label distinction only; this is not evidence that an installed CLI emits OSC 8.
const hyperlinkVerifier = 'offline-pkce-verifier-for-unit-tests-only-0123456789';
const hyperlinkChallenge = createHash('sha256').update(hyperlinkVerifier).digest('base64url');
const hyperlinkAuth = `${gateway}/authorize?response_type=code&redirect_uri=${encodeURIComponent('http://127.0.0.1:54321/callback')}&code_challenge=${hyperlinkChallenge}&code_challenge_method=S256&state=offline%2fopaque%2B%27%29%2c%2e&resource=${encodeURIComponent(`${gateway}/mcp`)}`;
const hyperlinkFrames = [{ label: 'ST', end: '\u001b\\' }, { label: 'BEL', end: '\u0007' }];
it.each(hyperlinkFrames)('extracts the OSC 8 $label target without using its visible URI label', ({ end }) => {
  const line = `Open \u001b]8;;${hyperlinkAuth}${end}${hyperlinkAuth}VISIBLE_ONLY\u001b]8;;${end}`;
  const parsed = authorizationFromLine(line, gateway);
  expect(parsed?.href).toBe(new URL(hyperlinkAuth).href);
  expect(parsed?.search).toBe(new URL(hyperlinkAuth).search);
  expect(parsed?.searchParams.get('resource')).toBe(`${gateway}/mcp`);
  expect(parsed?.searchParams.get('state')).toBe('offline/opaque+\'),.');
});
it.each(hyperlinkFrames)('validates the OSC 8 $label target even when the visible URI is trusted', ({ end }) => {
  const target = hyperlinkAuth.replace(gateway, 'https://unrelated.invalid');
  const line = `\u001b]8;;${target}${end}${hyperlinkAuth}\u001b]8;;${end}`;
  expect(() => authorizationFromLine(line, gateway)).toThrow('NATIVE_OAUTH_URL_INVALID');
});
it.each(hyperlinkFrames.flatMap(frame => [
  `\u001b]8;;not-a-url\u001b[31m${frame.end}${hyperlinkAuth}\u001b]8;;${frame.end}`,
  `\u001b]8;id=\u001b[31m;not-a-url${frame.end}${hyperlinkAuth}\u001b]8;;${frame.end}`,
  `\u001b]8;missing-separator${frame.end}${hyperlinkAuth}\u001b]8;;${frame.end}`,
  `\u001b]8;;not-a-url ${hyperlinkAuth}`,
  `\u001b]8;missing-separator ${hyperlinkAuth}`,
].map(line => ({ ...frame, line }))))('refuses malformed or unterminated OSC 8 $label frames without selecting visible text', ({ line }) => {
  expect(() => authorizationFromLine(line, gateway)).toThrow('NATIVE_OAUTH_URL_INVALID');
});
it.each(hyperlinkFrames)('does not use a visible URI as the target of an empty OSC 8 $label closing frame', ({ end }) => {
  expect(authorizationFromLine(`${hyperlinkAuth}\u001b]8;;${end}`, gateway)).toBeUndefined();
});
it.each(hyperlinkFrames.flatMap(frame => ['https://docs.invalid/help', 'file:///offline/log.txt', 'mailto:offline@example.invalid']
  .map(other => ({ ...frame, other }))))('selects the authorization target after an unrelated OSC 8 $label link', ({ end, other }) => {
  const line = `\u001b]8;;${other}${end}Help\u001b]8;;${end} then \u001b]8;;${hyperlinkAuth}${end}Authorize\u001b]8;;${end}`;
  expect(authorizationFromLine(line, gateway)?.href).toBe(new URL(hyperlinkAuth).href);
});
it.each(hyperlinkFrames.flatMap(frame => [hyperlinkAuth, hyperlinkAuth + '&other=offline']
  .map(second => ({ ...frame, second }))))('refuses multiple authorization targets in OSC 8 $label frames', ({ end, second }) => {
  const line = `\u001b]8;;${hyperlinkAuth}${end}First\u001b]8;;${end} \u001b]8;;${second}${end}Second\u001b]8;;${end}`;
  expect(() => authorizationFromLine(line, gateway)).toThrow('NATIVE_OAUTH_URL_INVALID');
});
it.each(hyperlinkFrames.flatMap(frame => [
  'not-a-url', 'javascript:void(0)', `javascript:${hyperlinkAuth}`, `ftp://${hyperlinkAuth}`,
  `${hyperlinkAuth}"trailing`, `${hyperlinkAuth}<trailing`, `${hyperlinkAuth}>trailing`,
].map(target => ({ ...frame, target }))))('refuses a malformed or non-http OSC 8 $label target without trusting its label: $target', ({ end, target }) => {
  const line = `\u001b]8;;${target}${end}${hyperlinkAuth}\u001b]8;;${end}`;
  expect(() => authorizationFromLine(line, gateway)).toThrow('NATIVE_OAUTH_URL_INVALID');
});
it.each(hyperlinkFrames)('keeps OSC 8 $label parameters separate from opaque URI semicolons', ({ end }) => {
  const target = hyperlinkAuth + '&opaque=semi;and;more';
  const parsed = authorizationFromLine(`\u001b]8;id=offline;${target}${end}Authorize\u001b]8;;${end}`, gateway);
  expect(parsed?.search).toBe(new URL(target).search);
});
it('refuses a raw control inside an OSC 8 target rather than normalizing it into another URI', () => {
  expect(() => authorizationFromLine(`\u001b]8;;${hyperlinkAuth}\t\u0007Authorize\u001b]8;;\u0007`, gateway))
    .toThrow('NATIVE_OAUTH_URL_INVALID');
});
it.each(hyperlinkFrames.flatMap(frame => ['\u009b31m', '\u009dtitle'].map(control => ({ ...frame, control }))))(
  'refuses a C1 terminal control inside the OSC 8 $label target', ({ end, control }) => {
    const target = `${hyperlinkAuth}&opaque=${control}data`;
    expect(() => authorizationFromLine(`\u001b]8;;${target}${end}Authorize\u001b]8;;${end}`, gateway))
      .toThrow('NATIVE_OAUTH_URL_INVALID');
  });
it.each([
  { label: 'plain target', line: hyperlinkAuth },
  { label: 'CSI-colored target', line: `\u001b[32m${hyperlinkAuth}\u001b[0m` },
])('preserves opaque query escape spelling in the $label control case', ({ line }) => {
  const parsed = authorizationFromLine(line, gateway);
  expect(parsed?.search).toBe(new URL(hyperlinkAuth).search);
  expect(parsed?.searchParams.get('resource')).toBe(`${gateway}/mcp`);
});
