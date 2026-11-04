import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, validatePack } from '@s2u/creator-contracts';
import { withCallbackServer } from '../../../tools/forge-agent-probe/callback';
import { e2ePort } from './ports';

/**
 * FCW-34 (product track, OT.R53; issue #532's acceptance test, O5): the independent capture-the-flag example pack
 * (`packages/creator-contracts/examples/capture-the-flag/`) by the agent's path in a rendered page -- paired as
 * `forgeAgentNative.spec.ts` pairs (its harness copied: guest OAuth with PKCE, the page's consent, the WebRTC pair), then
 * the entity edits on the blank floor, `forge.rules.import`, `forge.rules.check`, `forge.rules.test`, Play with the
 * status "PLAY · Capture the flag", back to the editor, and `forge.rules.export` byte-equal to the input pack (the one
 * assertion never waived). The floor names no map door or switch (O4), so the pack plays on any base.
 *
 * The gateway runs in this worker on its own port, `E2E_CTF_GATEWAY_PORT` (5394 by default; never the hand probe's
 * 5360-5362, the owner's 5363 or the native spec's 5393). Needs the gateway's dependencies and the served maps
 * (`socomlegacy/public/maps`, MP2's subset); without either it is skipped and says so -- skipped, not passed.
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
const PORT = e2ePort('E2E_CTF_GATEWAY_PORT', process.env['E2E_CTF_GATEWAY_PORT'], 5394);
const GATEWAY = `http://127.0.0.1:${PORT}`;
const PAGE_GATEWAY = new URL(process.env['VITE_S2U_AGENT_URL'] || 'http://127.0.0.1:5360').origin;
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE_MAPS = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));
const PERMISSIONS = ['inspect', 'edit', 'capture', 'import', 'test', 'diagnose'];

const EXAMPLES = fileURLToPath(new URL('../../creator-contracts/examples/', import.meta.url));
const PACK = ['s2u-pack.json', 'rules/ctf.json'] as const;
const packBytes = (path: string): Buffer => readFileSync(join(EXAMPLES, 'capture-the-flag', path));
const packFiles = () => PACK.map((path) => ({ path, text: packBytes(path).toString('utf8') }));
const ctfRun = () => JSON.parse(readFileSync(join(EXAMPLES, 'capture-the-flag.run.json'), 'utf8'));

test.use({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });

// The pairing harness of forgeAgentNative.spec.ts, copied (test plumbing only).
async function guestToken(context: BrowserContext): Promise<string> {
  const metadata = await (await context.request.get(`${GATEWAY}/.well-known/oauth-authorization-server`)).json();
  return withCallbackServer(async (redirect) => {
    const registered = await (await context.request.post(metadata.registration_endpoint, { data: { redirect_uris: [redirect],
      token_endpoint_auth_method: 'none', client_name: 'FCW-34 CTF e2e', grant_types: ['authorization_code'],
      response_types: ['code'] } })).json();
    const verifier = 'v'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const auth = await context.newPage();
    try {
      await auth.goto(`${metadata.authorization_endpoint}?${new URLSearchParams({ client_id: registered.client_id, redirect_uri: redirect,
        response_type: 'code', code_challenge_method: 'S256', code_challenge: challenge, resource: `${GATEWAY}/mcp`, state: 'probe' })}`);
      await auth.getByRole('button', { name: 'Continue as guest' }).click();
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

type Command = (operation: string, args: Record<string, unknown>, revision?: number) => Promise<any>;
const agentPanel = (page: Page) => page.getByRole('region', { name: 'Connect your agent' });

async function pair(context: BrowserContext, page: Page, pageOrigin: string, query: string): Promise<Command> {
  const token = await guestToken(context);
  const headers = { Authorization: `Bearer ${token}` };
  await routeToGateway(context, pageOrigin);
  await page.goto(`/forge?${query}`);
  await page.waitForLoadState('networkidle');
  // Since FUI-22 a right-dock tab shows only its own sections (FUI.R22): the Agent section is under the Agent tab
  // (91's box run of f435c4783 found it hidden for 600 s). At 760 px and under the docks are closed drawers first.
  if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.fx-top button[aria-label="Docks"]').click();
  await page.locator('.fx-right [data-forge-tab="agent"]').click();
  // Choosing the tab opens its section when nothing of it is kept open (FUI-22's shell, `tabShows`), so a click on the
  // summary then shut it again (91's box run of e1f217063: the Copy button never showed): open it only if it is shut.
  const agentSection = page.locator('.fx-right details[data-forge-panel="agent"]');
  if (!(await agentSection.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Connect your agent', { exact: true }).click();
  const panel = agentPanel(page);
  const copy = panel.getByRole('button', { name: 'Copy connection instructions' });
  await copy.waitFor({ timeout: 60_000 });
  await copy.click();
  await panel.getByText('Waiting for your agent', { exact: true }).waitFor({ timeout: 10_000 });
  const blurb: string = await page.evaluate(() => navigator.clipboard.readText());
  const match = blurb.match(/Use agent_pair with invitation ("[^"\r\n]+")/);
  expect(match, 'the copied instructions carry an invitation').toBeTruthy();
  const paired = await context.request.post(`${GATEWAY}/api/v1/pair`, { headers, data: { invitation: JSON.parse(match![1]!),
    permissions: PERMISSIONS, clientName: 'FCW-34 CTF e2e' } });
  expect(paired.ok(), `pair: ${paired.status()}`).toBe(true);
  await panel.getByText('Allow this connection?', { exact: true }).waitFor({ timeout: 10_000 });
  // FUI-25: the panel lists all six; an unrequested row is disabled, so this grants exactly what the spec requests.
  for (const box of await panel.locator('.agent-panel__permissions input:not(:disabled)').all()) await box.check();
  await panel.getByRole('button', { name: 'Allow selected access' }).click();
  await panel.getByText('Agent connected', { exact: true }).waitFor({ timeout: 30_000 });
  const statuses = await (await context.request.get(`${GATEWAY}/api/v1/status`, { headers })).json();
  const session = statuses.sessions[0];
  expect(session, 'the status lists the paired session').toBeTruthy();
  let n = 0;
  return async (operation, args, revision) => {
    await new Promise((resolve) => setTimeout(resolve, 310));     // within the per-session command budget (native.py)
    const body: Record<string, unknown> = { version: 1, requestId: `ctf-${Date.now()}-${++n}`, sessionId: session.sessionId,
      targetId: session.targetId, epoch: session.epoch, operation, args };
    if (revision !== undefined) body['expectedRevision'] = revision;
    return (await context.request.post(`${GATEWAY}/api/v1/commands`, { headers, data: body, timeout: 35_000 })).json();
  };
}

test.describe(`FCW-34: the CTF example pack by the agent's path${MISSING.length ? ` (gateway dependencies absent: ${MISSING.join(', ')}; skipped)` : ''}`, () => {
  test.skip(MISSING.length > 0, `the gateway's dependencies are not installed (${MISSING.join(', ')}); skipped, not passed.`);
  test.skip(!HAVE_MAPS, 'needs the served maps (socomlegacy/public/maps/index.json and RUN/MP2.ZDB, not committed); skipped, not passed');

  let gateway: { listen(port: number, host?: string): Promise<unknown>; close(): Promise<unknown> } | undefined;
  test.beforeAll(async ({}, info) => {
    const page = new URL(info.project.use.baseURL!);
    const origins = [...new Set([page.origin, `${page.protocol}//localhost:${page.port}`, `${page.protocol}//127.0.0.1:${page.port}`])];
    const { createGateway } = await import(/* @vite-ignore */ pathToFileURL(join(AGENT, 'src', 'gateway.ts')).href) as {
      createGateway(config: { issuer: string; development: boolean; trustedProxies: number; origins: string[] }): NonNullable<typeof gateway>;
    };
    gateway = createGateway({ issuer: GATEWAY, development: true, trustedProxies: 0, origins });
    await gateway.listen(PORT, '127.0.0.1');
  });
  test.afterAll(async () => {
    await gateway?.close();
  });

  test('import, check, test, Play reads PLAY · Capture the flag, back, and the export is the input pack byte for byte', async ({ context, page, baseURL }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const command = await pair(context, page, new URL(baseURL!).origin, 'floor&devmode');
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
    const ctf = ctfRun();
    const input = packFiles();
    const checked = await validatePack(PACK.map((path) => ({ path, bytes: new Uint8Array(packBytes(path)) })), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION });
    expect(checked.ok, JSON.stringify(checked.report)).toBe(true);
    const ref = checked.ok ? checked.ref : null;

    // The floor: the team spawns, the two bases and the two flag stands (authored test geometry; no map door or switch).
    await edit('spawn.place', { team: 'A', at: [-1000, 0, -400], yaw: 0 });
    await edit('spawn.place', { team: 'B', at: [1000, 0, -400], yaw: 0 });
    for (const zone of ctf.layout.zones) await edit('zone.place', zone);
    for (const spawner of ctf.layout.spawners) await edit('spawner.place', spawner);
    await mutate('forge.rules.import', { files: input });

    const check = await command('forge.rules.check', {});
    expect(check.outcome, JSON.stringify(check)).toBe('ok');
    // rules.check answers `{ report, record }` (the review's F1; 91's box run of f435c4783): the rules' report is `report`.
    expect(check.data?.report?.diagnostics, JSON.stringify(check)).toEqual([]);
    expect(check.data?.report?.status, JSON.stringify(check)).toBe('pass');
    expect(check.data?.record, JSON.stringify(check)).toBeNull();

    const tested = await command('forge.rules.test', ctf.script);
    expect(tested.outcome, JSON.stringify(tested)).toBe('ok');
    expect(tested.data.fired).toEqual(ctf.expect.fired);

    // Play: the layout's rules mode on the page room's rule host.
    await edit('camera.pose', { x: -1000, y: 100, z: -400, yaw: 0, pitch: -60 });
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
    await expect(page.getByText('PLAY · Capture the flag').first()).toBeVisible({ timeout: 60_000 });
    await test.info().attach('forge-ctf-play.png', { body: await page.screenshot(), contentType: 'image/png' });

    // Back to the editor: the agent's play.stop ("Return to the editor").
    await mutate('play.stop', {});
    await wait((s) => !s?.play?.ready);

    // O5, never waived: the export is the imported pack, its reference and every file's bytes.
    const exported = await command('forge.rules.export', {});
    expect(exported.outcome, JSON.stringify(exported).slice(0, 400)).toBe('ok');
    expect(exported.data.ref).toEqual(ref);
    expect(exported.data.files).toEqual(input);
    for (const f of exported.data.files as { path: string; text: string }[])
      expect(Buffer.from(f.text, 'utf8').equals(packBytes(f.path)), f.path).toBe(true);
    expect(errors, 'no page errors').toEqual([]);
  });
});
