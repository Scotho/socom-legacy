/** Product adaptation: real rendered blank-floor fixture and guest consent; never starts Play. */
import { createHash, randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { BASELINE_NAME, payload, type Exchange } from './acceptance';
import { withCallbackServer } from './callback';

export const BASELINE = BASELINE_NAME;
/**
 * AX-U (C6): the words the probe drives the dock and the consent page by -- `probeWords.test.ts` holds them to the
 * panel's (`packages/viewer/src/agent/setup.ts`) and the gateway's (`packages/forge-agent/src/oauth.ts`). The dock's
 * moments are found by their data attributes (`[data-agent-moment]`, `[data-agent-copy]`, `[data-agent-approve]`).
 */
export const PROBE_WORDS = {
  consentApprove: 'Approve',
  copyLink: 'Copy connect link',
  allow: 'Allow',
} as const;
/** Picks the client in the Connect moment's segmented control (a radio, by its label). */
export async function pickClient(page: Page, client: 'claude' | 'codex'): Promise<void> {
  await page.locator(`[data-agent-client-picker] input[value="${client}"]`).check({ force: true });
}
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
      await auth.getByRole('button', { name: PROBE_WORDS.consentApprove, exact: true }).click();
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
    // The Agent section sits under the right dock's Agent tab since FUI-22 (FUI.R22), so a bare click on its summary
    // text waits on a hidden element (the camera spec's first run, 2026-11-09). Open it as forgeAgentNative does: the
    // tab first (a drawer at 760 px and under), then the section only if the tab left it shut.
    if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.fx-top button[aria-label="Docks"]').click();
    await page.locator('.fx-right [data-forge-tab="agent"]').click();
    const agentSection = page.locator('.fx-right details[data-forge-panel="agent"]');
    if (!(await agentSection.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Connect your agent', { exact: true }).click();
    await page.getByRole('button', { name: PROBE_WORDS.copyLink, exact: true }).waitFor({ timeout: 60_000 });
    // AX-U: the local files are the Connected moment's, hidden until then; the file input takes files while hidden.
    // The page's one file chooser (R4): in the Forge it is the Assets panel's dropzone (`creator/assetFileStaging.ts` ->
    // `agent/fileDropzone.ts`; the agent section shows only "Add local files in Content"), in the test room the agent
    // section's own input. Stage through whichever this page has and wait for that chooser's own ready words (the camera
    // spec's second run, 2026-11-09: a file put into the agent section's unwired input never reads ready in the Forge).
    phase('STAGE_LOCAL_FIXTURE');
    const file = { name: 'fcw.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(FIXTURE)) };
    const dropzone = page.locator('[data-file-dropzone]');
    // The agent section names its route: "Add local files in Content" (`data-agent-open-staging`) when the page's packs are
    // shared with the Assets panel (`agent/install.ts` `openStaging`), its own input otherwise.
    if (await page.locator('[data-agent-open-staging]').count()) {
      // The dropzone takes files only while its Assets panel is shown in Build (`creator/assetsForgePanel.ts` `allowed`:
      // visible, surface build, canPlace; the camera spec's third run found it "blocked" behind the Agent tab). Reveal it
      // through the agent section's own button (hidden in the Connect moment, so dispatched), as a player would, stage,
      // then come back to the Agent tab.
      await page.locator('[data-agent-open-staging]').first().dispatchEvent('click');
      await dropzone.first().and(page.locator(':not([data-state="blocked"])')).waitFor({ state: 'visible', timeout: 60_000 });
      await dropzone.first().locator('input[type="file"]').setInputFiles(file);
      await dropzone.first().and(page.locator('[data-state="success"]')).waitFor({ state: 'attached', timeout: 60_000 });
      await page.locator('.fx-right [data-forge-tab="agent"]').click();
      if (!(await agentSection.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Connect your agent', { exact: true }).click();
    } else {
      await page.locator('[data-agent-moment="connected"] input[type="file"]').setInputFiles(file);
      await page.waitForFunction(() => document.querySelector('[data-agent-moment="connected"] .agent-panel__files')?.textContent?.includes('1 file ready for your agent.'), undefined, { timeout: 60_000 });
    }
    return { context, page, token, pageError: () => pageError };
  } catch (error) { await context.close(); throw error; }
}
export async function invitation(page: Page, client: 'claude' | 'codex'): Promise<string> {
  const blurb = await copiedInstructions(page, client);
  const match = blurb.match(/^Connect to my SOCOM 2 Legacy page: https?:\/\/[^\s/?#]+\/join\/([A-Za-z0-9_.:-]{1,128})$/m);
  if (!match) throw Error('COPIED_INVITATION_MISSING');
  return match[1]!;
}
/**
 * AX-U: what the page copies for `client` -- the "First time with <client>?" disclosure's command (the human's,
 * `[data-agent-copy-commands]`), then the one connect line (`[data-agent-copy]`), joined by a line break.
 */
export async function copiedInstructions(page: Page, client: 'claude' | 'codex'): Promise<string> {
  await pickClient(page, client);
  const firstTime = page.locator('details[data-agent-first-time]');
  if (!(await firstTime.evaluate((d) => (d as HTMLDetailsElement).open))) await firstTime.locator('summary').click();
  await firstTime.locator('[data-agent-copy-commands]').click();
  await firstTime.getByText('Copied', { exact: true }).waitFor({ timeout: 15_000 });
  const commands = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByRole('button', { name: PROBE_WORDS.copyLink, exact: true }).click();
  await page.getByText('Waiting for your agent', { exact: true }).waitFor({ timeout: 15_000 });
  return `${commands}\n${await page.evaluate(() => navigator.clipboard.readText())}`;
}
export async function consent(page: Page, events: Exchange[], approve: boolean, signal: AbortSignal): Promise<boolean> {
  // Poll only the visible Allow moment; abort promptly when a child fails before pairing.
  const allow = page.locator('[data-agent-moment="allow"]');
  for (let attempts = 0; attempts < 1800 && !signal.aborted; attempts++) {
    if (await allow.isVisible()) {
      const pair = [...events].reverse().find(e => e.params?.name === 'agent_pair' && payload(e)?.state === 'pending');
      if (!pair) { await page.waitForTimeout(100); continue; }
      const code = await allow.locator('[data-agent-comparison-code]').textContent();
      if (code !== payload(pair).comparisonCode) throw Error('CONSENT_CODE_MISMATCH');
      if (approve) {
        // AX.R2: every requested permission is on by default; the probe keeps them all on.
        for (const box of await allow.locator('.agent-panel__permissions input:not(:disabled)').all()) await box.check();
        await allow.locator('[data-agent-approve]').click();
        await page.locator('.agent-panel[data-state="connected"]').waitFor({ timeout: 30_000 });
      } else await allow.getByRole('button', { name: 'Decline', exact: true }).click();
      return true;
    }
    await page.waitForTimeout(100);
  }
  return false;
}
