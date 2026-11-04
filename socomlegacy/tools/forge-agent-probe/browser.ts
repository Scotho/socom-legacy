/** Product adaptation: real rendered blank-floor fixture and guest consent; never starts Play. */
import { createHash, randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { BASELINE_NAME, payload, type Exchange } from './acceptance';
import { withCallbackServer } from './callback';

export const BASELINE = BASELINE_NAME;
export const FIXTURE = { v: 2, name: 'FCW imported fixture', base: 'blank:floor', assets: [], pieces: [], spawns: [] };
export function localOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw Error('LOCAL_ORIGIN_REQUIRED');
  return url.origin;
}
export async function guestToken(context: BrowserContext, gateway: string): Promise<string> {
  const metadata = await (await context.request.get(`${gateway}/.well-known/oauth-authorization-server`)).json();
  // Metadata is network input: never send codes or verifier material to an unrelated origin.
  for (const field of ['registration_endpoint', 'authorization_endpoint', 'token_endpoint']) {
    if (new URL(metadata[field]).origin !== gateway) throw Error('OAUTH_ORIGIN_MISMATCH');
  }
  // Redirected navigations do not reliably reach Playwright route interception. Use an actual callback listener.
  return withCallbackServer(async redirect => {
    const registered = await (await context.request.post(metadata.registration_endpoint, { data: { redirect_uris: [redirect],
      token_endpoint_auth_method: 'none', client_name: 'FCW acceptance harness', grant_types: ['authorization_code'], response_types: ['code'] } })).json();
    const verifier = randomBytes(32).toString('base64url'), state = randomBytes(24).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const auth = await context.newPage();
    try {
      await auth.goto(`${metadata.authorization_endpoint}?${new URLSearchParams({ client_id: registered.client_id, redirect_uri: redirect,
        response_type: 'code', code_challenge_method: 'S256', code_challenge: challenge, resource: `${gateway}/mcp`, state })}`);
      await auth.getByRole('button', { name: 'Continue as guest' }).click();
      await auth.waitForURL(`${redirect}**`, { timeout: 15_000 });
      const callback = new URL(auth.url());
      if (callback.searchParams.get('state') !== state || !callback.searchParams.get('code')) throw Error('OAUTH_CALLBACK_INVALID');
      const response = await context.request.post(metadata.token_endpoint, { form: { grant_type: 'authorization_code', client_id: registered.client_id,
        code: callback.searchParams.get('code')!, code_verifier: verifier, redirect_uri: redirect, resource: `${gateway}/mcp` } });
      const tokens = await response.json();
      if (!response.ok() || typeof tokens.access_token !== 'string') throw Error('GUEST_AUTH_FAILED');
      return tokens.access_token;
    } finally { await auth.close(); }
  });
}
export async function createFixture(browser: Browser, pageOrigin: string, gateway: string, phase: (value: string) => void = () => {}, bootstrapGuest = true) {
  phase('BROWSER_CONTEXT');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  try {
    let token = '';
    if (bootstrapGuest) { phase('GUEST_OAUTH'); token = await guestToken(context, gateway); }
    const page = await context.newPage(); let pageError = false;
    page.on('pageerror', () => { pageError = true; });
    await page.addInitScript(name => {
      localStorage.setItem('s2u-forge-layout', JSON.stringify({ forge: 1, name, base: { kind: 'blank', library: 'floor' }, pieces: [], spawns: [] }));
    }, BASELINE);
    phase('FORGE_PAGE_LOAD'); await page.goto(`${pageOrigin}/forge?floor`);
    await page.getByText('Connect your agent', { exact: true }).click();
    await page.getByRole('button', { name: 'Copy connection instructions', exact: true }).waitFor({ timeout: 60_000 });
    phase('STAGE_LOCAL_FIXTURE'); await page.getByLabel('Add local files', { exact: true }).setInputFiles({ name: 'fcw.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(FIXTURE)) });
    await page.getByText('1 file ready for your agent.', { exact: true }).waitFor();
    return { context, page, token, pageError: () => pageError };
  } catch (error) { await context.close(); throw error; }
}
export async function invitation(page: Page, client: 'claude' | 'codex'): Promise<string> {
  const blurb = await copiedInstructions(page, client);
  const match = blurb.match(/Use agent_pair with invitation ("[^"\r\n]+")/);
  if (!match) throw Error('COPIED_INVITATION_MISSING');
  return JSON.parse(match[1]!);
}
export async function copiedInstructions(page: Page, client: 'claude' | 'codex'): Promise<string> {
  await page.getByLabel('Your agent', { exact: true }).selectOption(client);
  await page.locator('[data-agent-copy]').click();
  await page.getByText('Waiting for your agent', { exact: true }).waitFor({ timeout: 15_000 });
  return page.evaluate(() => navigator.clipboard.readText());
}
export async function consent(page: Page, events: Exchange[], approve: boolean, signal: AbortSignal): Promise<boolean> {
  // Poll only the visible consent panel; abort promptly when a child fails before pairing.
  for (let attempts = 0; attempts < 1800 && !signal.aborted; attempts++) {
    if (await page.getByText('Allow this connection?', { exact: true }).isVisible()) {
      const pair = [...events].reverse().find(e => e.params?.name === 'agent_pair' && payload(e)?.state === 'pending');
      if (!pair) { await page.waitForTimeout(100); continue; }
      const code = await page.locator('.agent-panel__comparison').textContent();
      if (code !== payload(pair).comparisonCode) throw Error('CONSENT_CODE_MISMATCH');
      if (approve) {
        for (const box of await page.locator('.agent-panel__permissions input').all()) await box.check();
        await page.getByRole('button', { name: 'Allow selected access', exact: true }).click();
        await page.getByText('Agent connected', { exact: true }).waitFor({ timeout: 30_000 });
      } else await page.getByRole('button', { name: 'Decline', exact: true }).click();
      return true;
    }
    await page.waitForTimeout(100);
  }
  return false;
}
