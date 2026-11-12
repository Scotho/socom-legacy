import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { withCallbackServer } from '../../../tools/forge-agent-probe/callback';
import { e2ePort } from './ports';
import { beginPair, pairBody, PROBE_PAIR_TIMEOUT_MS } from '../../../tools/forge-agent-probe/pairing';

/**
 * Product adaptation, LATER 424 (no original: the Forge agent connection is a browser tool): the gate's copy of the
 * native pairing probe (`tools/forge-agent-probe/native.py`, kept for hand runs) -- guest OAuth with PKCE, the page's
 * consent, the WebRTC pairing, an edit sent twice under one request ID (the retry answers the first's receipt), the
 * readback, a canvas capture, and the page's disconnect refusing the next command NOT_PAIRED, with no page error.
 *
 * The gateway runs in this worker (`packages/forge-agent/src/gateway.ts`, development mode) on a port of its own:
 * `E2E_AGENT_GATEWAY_PORT`, 5393 by default -- never 5360-5362 (the hand probe's) nor 5363 (the owner's hand gateway, the plan's Log 2026-10-25). Its dependencies (express, ws, werift,
 * zod, the MCP SDK) come with `npm ci`; where they are not installed the file is skipped, and its title says so --
 * skipped, not passed.
 *
 * The page's gateway address is fixed when Vite starts (`src/agent/install.ts`: `VITE_S2U_AGENT_URL`, else
 * `http://127.0.0.1:5360` on the dev server), and the run's config names none, so this spec carries the page's requests
 * to its own gateway: HTTP by `context.route` (the page's Origin kept; Playwright answers the CORS preflight), and the
 * `/signal` WebSocket by an init script that opens it at this gateway's address from the page itself, so its Origin is
 * the page's. Nothing of the page's own behaviour changes; WebRTC runs browser to gateway as on a hand run.
 *
 * The second test is the probe's `--plant`: a Demolition test layout built through the agent, then pickup and plant by
 * normal input in Forge Play. It needs the served maps (`?devmode`, `socomlegacy/public/maps`), skipped and said without.
 */
const AGENT = fileURLToPath(new URL('../../forge-agent/', import.meta.url));
const NEEDS = ['express', 'ws', 'werift', 'zod', '@modelcontextprotocol/sdk', '@s2u/forge-agent-protocol'];
function installed(name: string): boolean {
  for (let dir = AGENT; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', name, 'package.json'))) return true;
    if (dirname(dir) === dir) return false;
  }
}
const MISSING = NEEDS.filter((name) => !installed(name));
const ABSENT = MISSING.length ? ` (gateway dependencies absent: ${MISSING.join(', ')}; skipped)` : '';

const PORT = e2ePort('E2E_AGENT_GATEWAY_PORT', process.env['E2E_AGENT_GATEWAY_PORT'], 5393);
const GATEWAY = `http://127.0.0.1:${PORT}`;
/** The address the dev server's page dials (`src/agent/install.ts`, `gateway()`). */
const PAGE_GATEWAY = new URL(process.env['VITE_S2U_AGENT_URL'] || 'http://127.0.0.1:5360').origin;

const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE_MAPS = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));

const PERMISSIONS = ['inspect', 'edit', 'capture', 'import', 'test'];
const NAME = 'Agent acceptance floor';

test.use({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });

/** One guest's access token: dynamic registration with a loopback redirect, PKCE S256 with a fixed verifier (native.py). */
async function guestToken(context: BrowserContext): Promise<string> {
  const metadata = await (await context.request.get(`${GATEWAY}/.well-known/oauth-authorization-server`)).json();
  for (const field of ['registration_endpoint', 'authorization_endpoint', 'token_endpoint'])
    expect(new URL(metadata[field]).origin, field).toBe(GATEWAY);
  // A real loopback listener on a free port (`callback.ts`): redirected navigations do not reliably reach route interception.
  return withCallbackServer(async (redirect) => {
    const registered = await (await context.request.post(metadata.registration_endpoint, { data: { redirect_uris: [redirect],
      token_endpoint_auth_method: 'none', client_name: 'Native browser acceptance e2e', grant_types: ['authorization_code'],
      response_types: ['code'] } })).json();
    const verifier = 'v'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const auth = await context.newPage();
    try {
      await auth.goto(`${metadata.authorization_endpoint}?${new URLSearchParams({ client_id: registered.client_id, redirect_uri: redirect,
        response_type: 'code', code_challenge_method: 'S256', code_challenge: challenge, resource: `${GATEWAY}/mcp`, state: 'probe' })}`);
      await auth.getByRole('button', { name: 'Approve' }).click();
      await auth.waitForURL(`${redirect}**`, { timeout: 5_000 });
      const code = new URL(auth.url()).searchParams.get('code');
      expect(code, 'the callback carries a code').toBeTruthy();
      const tokens = await (await context.request.post(metadata.token_endpoint, { form: { grant_type: 'authorization_code',
        client_id: registered.client_id, code: code!, code_verifier: verifier, redirect_uri: redirect, resource: `${GATEWAY}/mcp` } })).json();
      expect(typeof tokens.access_token, 'the token exchange answers an access token').toBe('string');
      return tokens.access_token as string;
    } finally {
      await auth.close();
    }
  });
}

/** The page's gateway requests carried to this spec's gateway (test plumbing; see the header). */
async function routeToGateway(context: BrowserContext, pageOrigin: string): Promise<void> {
  if (PAGE_GATEWAY === GATEWAY) return;
  await context.route(`${PAGE_GATEWAY}/**`, async (route) => {
    const from = new URL(route.request().url());
    const response = await route.fetch({ url: `${GATEWAY}${from.pathname}${from.search}`,
      headers: { ...route.request().headers(), origin: pageOrigin } });
    await route.fulfill({ response });
  });
  const wsFrom = PAGE_GATEWAY.replace(/^http/, 'ws'), wsTo = GATEWAY.replace(/^http/, 'ws');
  await context.addInitScript(([from, to]) => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        const href = String(url);
        super(href.startsWith(`${from}/`) ? to + href.slice(from.length) : href, protocols);
      }
    };
  }, [wsFrom, wsTo] as const);
}

type Command = (operation: string, args: Record<string, unknown>, revision?: number, requestId?: string) => Promise<any>;

/**
 * The agent panel (`src/agent/panel.ts`: a `section` named "Connect your agent"). Its words are read inside it: the
 * header's presence chip says "Agent connected" too (`src/agent/activity.ts`), and a page-wide `getByText` is then a
 * strict-mode violation (the seat box's first run, 2026-10-26).
 */
const agentPanel = (page: Page) => page.getByRole('region', { name: 'Connect your agent' });

/** The probe's page screenshots (`native.py`'s three), attached to the report, never written into the tree. */
const shot = async (page: Page, name: string): Promise<void> => {
  await test.info().attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
};

/** The probe's flow up to the consent: the page, the copied connect line, the pair; the panel shows its Allow moment. */
async function openConsent(context: BrowserContext, page: Page, pageOrigin: string, query: string): Promise<{ request: APIRequestContext; headers: Record<string, string>; pairing: Promise<APIResponse> }> {
  const token = await guestToken(context);
  const headers = { Authorization: `Bearer ${token}` };
  await routeToGateway(context, pageOrigin);
  await page.goto(`/forge?${query}`);
  await page.waitForLoadState('networkidle');
  // Since FUI-22 a right-dock tab shows only its own sections (FUI.R22): the Agent section is under the Agent tab
  // (91's box run of FCW-34's f435c4783 found the same click hidden in forgeCtf.spec). At 760 px and under the docks
  // are closed drawers first.
  if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.fx-top button[aria-label="Docks"]').click();
  await page.locator('.fx-right [data-forge-tab="agent"]').click();
  // Choosing the tab opens its section when nothing of it is kept open (FUI-22's shell, `tabShows`), so a click on the
  // summary then shut it again (91's box run of e1f217063: the Copy button never showed): open it only if it is shut.
  const agentSection = page.locator('.fx-right details[data-forge-panel="agent"]');
  if (!(await agentSection.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Connect your agent', { exact: true }).click();
  const panel = agentPanel(page);
  // AX-U: one card; the Connect moment's one primary button copies the one connect line.
  const copy = panel.getByRole('button', { name: 'Copy connect link', exact: true });
  await copy.waitFor({ timeout: 60_000 });
  await shot(page, 'forge-connect.png');
  await copy.click();
  await panel.getByText('Waiting for your agent', { exact: true }).waitFor({ timeout: 10_000 });
  const blurb: string = await page.evaluate(() => navigator.clipboard.readText());
  const match = blurb.match(/^Connect to my SOCOM 2 Legacy page: \S+\/join\/([A-Za-z0-9_.:-]{1,128})$/);
  expect(match, 'the copied line carries the join link').toBeTruthy();
  const request: APIRequestContext = context.request;
  // REVIEW-1 finding 3: the gateway holds the pair until the page answers (AX-3), so the call is started here and
  // awaited after the Allow click by the caller (`tools/forge-agent-probe/pairing.ts`).
  const pairing = beginPair(() => request.post(`${GATEWAY}/api/v1/pair`, { headers, timeout: PROBE_PAIR_TIMEOUT_MS,
    data: pairBody(match![1]!, PERMISSIONS, 'Native browser acceptance e2e') }));
  await panel.locator('[data-agent-moment="allow"]').waitFor({ state: 'visible', timeout: 10_000 });
  return { request, headers, pairing };
}

/**
 * FUI-25 and AX-U (AX.R2; checked here, the unit test cannot see the mounted page): six rows, every requested one a
 * switch already on, the unrequested ones disabled.
 */
async function consentSixRows(page: Page): Promise<void> {
  const rows = agentPanel(page).locator('.agent-panel__permissions label[data-permission]');
  await expect(rows, 'the consent lists all six permissions').toHaveCount(6);
  for (const permission of ['inspect', 'edit', 'capture', 'import', 'test', 'diagnose']) {
    const box = agentPanel(page).locator(`.agent-panel__permissions label[data-permission="${permission}"] input`);
    if (PERMISSIONS.includes(permission)) {
      await expect(box, `${permission} was requested: offered`).toBeEnabled();
      await expect(box, `${permission} was requested: on by default (AX.R2)`).toBeChecked();
    } else await expect(box, `${permission} was not requested: greyed`).toBeDisabled();
  }
  await shot(page, 'fui25-consent-six-rows.png');
}

/** The probe's flow up to the paired session: the page, the copied invitation, the pair, the consent; its command sender. */
async function pair(context: BrowserContext, page: Page, pageOrigin: string, query: string): Promise<{ command: Command; headers: Record<string, string> }> {
  const { request, headers, pairing } = await openConsent(context, page, pageOrigin, query);
  const panel = agentPanel(page);
  await consentSixRows(page);
  for (const box of await panel.locator('.agent-panel__permissions input:not(:disabled)').all()) await box.check();
  await shot(page, 'forge-approve.png');
  await panel.locator('[data-agent-approve]').click();
  const paired = await pairing;
  expect(paired.ok(), `pair: ${paired.status()}`).toBe(true);
  expect((await paired.json()).state, 'the held pair answers once Allow is clicked').toBe('paired');
  await page.locator('.agent-panel[data-state="connected"]').waitFor({ timeout: 30_000 });
  const statuses = await (await request.get(`${GATEWAY}/api/v1/status`, { headers })).json();
  const session = statuses.sessions[0];
  expect(session, 'the status lists the paired session').toBeTruthy();
  let n = 0;
  const command: Command = async (operation, args, revision, requestId) => {
    await new Promise((resolve) => setTimeout(resolve, 310));     // within the per-session command budget (native.py)
    const body: Record<string, unknown> = { version: 1, requestId: requestId ?? `probe-${Date.now()}-${++n}`, sessionId: session.sessionId,
      targetId: session.targetId, epoch: session.epoch, operation, args };
    if (revision !== undefined) body['expectedRevision'] = revision;
    return (await request.post(`${GATEWAY}/api/v1/commands`, { headers, data: body, timeout: 35_000 })).json();
  };
  return { command, headers };
}

/** The edit, its retry under the same request ID (the receipt), and the readback (native.py). */
async function editRetryRead(command: Command): Promise<void> {
  const before = await command('target.status', {});
  const edit = await command('forge.edit', { operation: 'layout.name', arguments: { name: NAME } }, before.revision, 'one-edit');
  expect(edit.outcome, JSON.stringify(edit)).toBe('ok');
  const retry = await command('forge.edit', { operation: 'layout.name', arguments: { name: NAME } }, before.revision, 'one-edit');
  expect(retry, 'the retry answers the first edit\'s receipt').toEqual(edit);
  const recipe = await command('forge.read', { section: 'metadata' });
  expect(recipe.data?.name, JSON.stringify(recipe)).toBe(NAME);
}

/** The capture (a PNG with bytes, attached to the report, never written into the tree), the disconnect, the refusal. */
async function captureAndDisconnect(page: Page, command: Command, info: TestInfo, beforeDisconnect?: () => Promise<void>): Promise<void> {
  const image = await command('target.capture', {});
  expect(image.outcome, JSON.stringify(image).slice(0, 300)).toBe('ok');
  expect(image.data.image.mimeType).toBe('image/png');
  const bytes = Buffer.from(image.data.image.data, 'base64');
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.some((b) => b !== 0), 'the capture has non-zero bytes').toBe(true);
  await info.attach('agent-canvas.png', { body: bytes, contentType: 'image/png' });
  await shot(page, 'forge-connected.png');
  if (beforeDisconnect) await beforeDisconnect();
  await agentPanel(page).getByRole('button', { name: 'Disconnect', exact: true }).click();
  const blocked = await command('forge.read', {});
  expect(blocked.code, JSON.stringify(blocked)).toBe('NOT_PAIRED');
}

test.describe(`LATER 424: the native Forge agent pairing, end to end${ABSENT}`, () => {
  test.skip(MISSING.length > 0, `the gateway's dependencies are not installed (${MISSING.join(', ')}; npm ci installs them); skipped, not passed.`);

  let gateway: { listen(port: number, host?: string): Promise<unknown>; close(): Promise<unknown> } | undefined;
  test.beforeAll(async ({}, info) => {
    const page = new URL(info.project.use.baseURL!);
    const origins = [...new Set([page.origin, `${page.protocol}//localhost:${page.port}`, `${page.protocol}//127.0.0.1:${page.port}`])];
    const module = pathToFileURL(join(AGENT, 'src', 'gateway.ts')).href;
    const { createGateway } = await import(/* @vite-ignore */ module) as {
      createGateway(config: { issuer: string; development: boolean; trustedProxies: number; origins: string[] }): NonNullable<typeof gateway>;
    };
    gateway = createGateway({ issuer: GATEWAY, development: true, trustedProxies: 0, origins });
    await gateway.listen(PORT, '127.0.0.1');
  });
  test.afterAll(async () => {
    await gateway?.close();
  });

  test('guest OAuth, consent, WebRTC, edit and its retry receipt, readback, capture, disconnect', async ({ context, page, baseURL }, info) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const { command } = await pair(context, page, new URL(baseURL!).origin, 'floor');
    await editRetryRead(command);
    await captureAndDisconnect(page, command, info);
    expect(errors, 'no page errors').toEqual([]);
  });

  // AX-U (a second, small test on an unpaired consent; a reload inside the paired one would end the session the tests
  // after it need): the consent has every requested permission on, the code as small print, and no short-form toggle.
  test('AX-U: an unpaired consent -- every requested permission on, the code as small print, Allow ready', async ({ context, page, baseURL }) => {
    test.setTimeout(120_000);
    await openConsent(context, page, new URL(baseURL!).origin, 'floor');
    await consentSixRows(page);
    const allow = agentPanel(page).locator('[data-agent-moment="allow"]');
    await expect(allow.locator('[data-agent-short-form]')).toHaveCount(0);
    await expect(allow.locator('.agent-panel__comparison')).toHaveText(/^Check: the code \S+ matches your agent's$/);
    await expect(allow.locator('[data-agent-approve]')).toBeEnabled();
    await shot(page, 'axu-consent-all-on.png');
  });

  test('--plant: an agent-built Demolition layout, pickup and plant by normal input in Forge Play', async ({ context, page, baseURL }, info) => {
    test.skip(!HAVE_MAPS, 'needs the served maps (socomlegacy/public/maps/index.json and RUN/MP2.ZDB, not committed); skipped, not passed');
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const { command } = await pair(context, page, new URL(baseURL!).origin, 'floor&devmode');
    await editRetryRead(command);
    const read = async (): Promise<any> => {
      const answer = await command('target.status', {});
      expect(answer.outcome, JSON.stringify(answer)).toBe('ok');
      return answer.data;
    };
    const mutate = async (operation: string, args: Record<string, unknown>): Promise<any> => {
      let answer = await command(operation, args, (await read()).revision);
      if (answer.code === 'REVISION_CONFLICT') answer = await command(operation, args, (await read()).revision);
      expect(answer.outcome, JSON.stringify(answer)).toBe('ok');
      return answer;
    };
    const edit = (operation: string, args: Record<string, unknown>) => mutate('forge.edit', { operation, arguments: args });
    const wait = async (predicate: (state: any) => boolean, seconds = 120): Promise<any> => {
      const deadline = Date.now() + seconds * 1000;
      for (;;) {
        const state = await read();
        if (predicate(state)) return state;
        expect(Date.now() < deadline, JSON.stringify(state)).toBe(true);
        await page.waitForTimeout(150);
      }
    };
    const scenario = async (steps: unknown[]): Promise<any> => {
      await mutate('scenario.start', { steps });
      const deadline = Date.now() + 35_000;
      let answer: any;
      for (;;) {
        answer = await command('scenario.status', {});
        if (answer.data?.state !== 'running') break;
        expect(Date.now() < deadline, JSON.stringify(answer)).toBe(true);
        await page.waitForTimeout(150);
      }
      expect(answer.data?.state, JSON.stringify(answer)).toBe('completed');
      return answer.data;
    };
    // Authored test geometry, a Forge adaptation: no Play position or outcome setters (native.py).
    await edit('type.set', { type: 2 });
    await edit('spawn.place', { team: 'A', at: [0, 0, 0], yaw: 0 });
    await edit('spawn.place', { team: 'B', at: [300, 0, 0], yaw: 0 });
    await edit('bomb.place', { kind: 'start', at: [0, 0, -80] });
    await edit('bomb.place', { kind: 'seal', at: [0, 0, -180] });
    await edit('bomb.place', { kind: 'terrorist', at: [200, 0, 0] });
    // Forge Play-from-here chooses the floor under the Build camera for its opening spawn.
    await edit('camera.pose', { x: 0, y: 100, z: 0, yaw: 0, pitch: -60 });
    await mutate('forge.play', {});
    let state = await wait((s) => s?.play?.ready === true);
    if (state.play.armory) {
      for (let i = 0; i < 12; i++) {
        await mutate('forge.input', { operation: 'armory.key', arguments: { code: 'Enter' } });
        state = await read();
        if (!state.play.armory) break;
      }
      expect(state.play.armory, JSON.stringify(state)).toBeFalsy();
    }
    await wait((s) => s?.play?.action?.playing === true);
    await scenario([{ operation: 'input.set', args: { moveY: 1 }, seconds: 2.8 }, { operation: 'input.release' }]);
    const picked = (await read()).play;
    expect([picked.plant.state, picked.action.prompt], JSON.stringify(picked)).toEqual([2, 'bomb']);
    await scenario([{ operation: 'action.hold', seconds: 6 }, { operation: 'action.release' },
      { operation: 'observe', args: { field: 'plant.state', equals: 3 }, seconds: 4 }]);
    const actual = (await read()).play;
    expect(actual.plant.state, JSON.stringify(actual)).toBe(3);
    await captureAndDisconnect(page, command, info, async () => { await mutate('play.stop', {}); });
    expect(errors, 'no page errors').toEqual([]);
  });
});
