import { expect, it } from 'vitest';
import { accessOnlyCredential } from './credentials';
const now = 1_000_000, budget = 240_000;
const jwt = (exp: number) => `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.test`;
const refresh = ['synthetic', 'refresh', 'material'].join('-');
const codex = (exp = 3000) => ({ auth_mode: 'chatgpt', tokens: { id_token: jwt(exp), access_token: jwt(exp), refresh_token: refresh,
  account_id: 'test-account', oauth_provenance: { issuer: 'unused' }, login_owner_id: 'unused' }, unrelated: refresh });
it('converts Codex managed auth into access-only external mode without copying rotation material', () => {
  const original = codex(); const before = JSON.stringify(original);
  const result = accessOnlyCredential('codex', original, budget, now);
  expect(result.codexAuth?.auth_mode).toBe('chatgptAuthTokens');
  expect(result.codexAuth?.tokens.refresh_token).toBe('');
  expect(result.codexAuth?.tokens.access_token).toBe(original.tokens.access_token);
  expect(JSON.stringify(result)).not.toContain(refresh);
  expect(JSON.stringify(original)).toBe(before);
});
it('extracts only Claude access material for its nonrefreshing environment mode', () => {
  const access = ['synthetic', 'access'].join('-');
  const original = { claudeAiOauth: { accessToken: access, expiresAt: 3_000_000, refreshToken: refresh, scopes: ['unused'] }, other: refresh };
  const before = JSON.stringify(original);
  expect(accessOnlyCredential('claude', original, budget, now)).toEqual({ claudeAccessToken: access });
  expect(JSON.stringify(original)).toBe(before);
});
it('requires token validity beyond the complete child budget plus skew margin, with no silent refresh fallback', () => {
  for (const original of [codex(1100), codex(NaN), { tokens: { ...codex().tokens, access_token: 'bad' } }]) {
    expect(() => accessOnlyCredential('codex', original, budget, now)).toThrow('ACCESS_TOKEN_VALIDITY_REQUIRED');
  }
  for (const expiresAt of [undefined, NaN, now + budget - 1]) {
    expect(() => accessOnlyCredential('claude', { claudeAiOauth: { accessToken: 'test', expiresAt } }, budget, now)).toThrow('ACCESS_TOKEN_VALIDITY_REQUIRED');
  }
});
