/** Product adaptation: access-only snapshots never expose a rotating grant to an isolated child. */
import type { ClientName } from './isolation';
export interface AccessOnlyCredential {
  codexAuth?: { auth_mode: 'chatgptAuthTokens'; OPENAI_API_KEY: null; tokens: { id_token: string; access_token: string; refresh_token: ''; account_id: string }; last_refresh: string };
  claudeAccessToken?: string;
}
export function accessOnlyCredential(client: ClientName, original: any, budgetMs: number, now = Date.now()): AccessOnlyCredential {
  const minimumExpiry = now + budgetMs + 300_000;
  const valid = (expiry: unknown): void => {
    if (!Number.isFinite(budgetMs) || budgetMs < 1 || typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= minimumExpiry) throw Error('ACCESS_TOKEN_VALIDITY_REQUIRED');
  };
  if (client === 'claude') {
    const oauth = original?.claudeAiOauth;
    if (typeof oauth?.accessToken !== 'string' || !oauth.accessToken) throw Error('EXISTING_SUBSCRIPTION_REQUIRED');
    valid(oauth.expiresAt);
    // Official CLAUDE_CODE_OAUTH_TOKEN mode uses this access token for the whole session; no refresh credential.
    return { claudeAccessToken: oauth.accessToken };
  }
  const tokens = original?.tokens;
  if (typeof tokens?.access_token !== 'string' || typeof tokens?.id_token !== 'string' || !tokens.id_token
    || typeof tokens?.account_id !== 'string' || !tokens.account_id) throw Error('EXISTING_SUBSCRIPTION_REQUIRED');
  try { valid(JSON.parse(Buffer.from(tokens.access_token.split('.')[1] ?? '', 'base64url').toString('utf8')).exp * 1000); }
  catch { throw Error('ACCESS_TOKEN_VALIDITY_REQUIRED'); }
  // Official Codex external-token mode has no managed refresh path. Its TokenData parser requires the empty field.
  return { codexAuth: { auth_mode: 'chatgptAuthTokens', OPENAI_API_KEY: null,
    tokens: { id_token: tokens.id_token, access_token: tokens.access_token, refresh_token: '', account_id: tokens.account_id },
    last_refresh: new Date(now).toISOString() } };
}
