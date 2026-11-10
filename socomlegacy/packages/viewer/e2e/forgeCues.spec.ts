import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, validatePack } from '@s2u/creator-contracts';
import { withCallbackServer } from '../../../tools/forge-agent-probe/callback';
import { e2ePort } from './ports';
import { beginPair, pairBody, PROBE_PAIR_TIMEOUT_MS } from '../../../tools/forge-agent-probe/pairing';

/**
 * FUI-23 (FUI.R24; product track, OT.R53 -- a browser adaptation with no original, FORGE_RULES_CUES_ADAPTATION): a rules
 * pack's `cue.play` heard in a rendered page. A small pack built here (one rule: `round.start` -> `message.show` and
 * `cue.play` of `CUE`, a sound the match's goggles play on every map, `matchSound.ts`) imported by the agent's path on
 * MP2 (the Forge's default base) as `forgeCtf.spec.ts` imports its pack -- its pairing harness copied -- and played. The
 * autoplay-denied path is made, not hoped for: the pairing's clicks gave the page its activation, so an init script holds
 * every `AudioContext` made after it is armed (just before Play) suspended, its `resume` refused, until the next trusted
 * pointer press (test plumbing only; the page's code is untouched). Then: "PLAY · Cue party" and the pack's message
 * beside Back (the rule fired), the chip "Press ✕ to hear the cues" and no "not on this map" line, a click on the
 * chip, the chip gone, and no page error and no console error.
 *
 * The gateway runs in this worker on its own port, `E2E_CUES_GATEWAY_PORT` (5404 by default; never the hand probe's
 * 5360-5362, the owner's 5363, the native spec's 5393, the CTF spec's 5394, the paintball spec's 5391, the merge
 * controller's 5390 or the modern lane's 5395-5399). Needs the gateway's dependencies and the served maps
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
const PORT = e2ePort('E2E_CUES_GATEWAY_PORT', process.env['E2E_CUES_GATEWAY_PORT'], 5404);
const GATEWAY = `http://127.0.0.1:${PORT}`;
const PAGE_GATEWAY = new URL(process.env['VITE_S2U_AGENT_URL'] || 'http://127.0.0.1:5360').origin;
const MAPS = fileURLToPath(new URL('../../../public/maps', import.meta.url));
const HAVE_MAPS = existsSync(join(MAPS, 'index.json')) && existsSync(join(MAPS, 'RUN', 'MP2.ZDB'));
const PERMISSIONS = ['inspect', 'edit', 'capture', 'import', 'test', 'diagnose'];

/** The goggles' sound (`../src/matchSound.ts`, DAT_0044ce30): a bank name the match's audio holds on MP2. */
const CUE = '.NV_GOGGLES_ON';
const RULES = `${JSON.stringify({
  schema: 's2u-rules', vocabulary: 0, id: 'cue.party', name: 'Cue party',
  rules: [{ id: 'start', when: 'round.start', then: [{ do: 'message.show', text: 'Cue party on' }, { do: 'cue.play', cue: CUE }] }],
}, null, 2)}\n`;
const RULES_PATH = 'rules/party.json';
const manifest = (): string => `${JSON.stringify({
  format: 's2u-pack', formatVersion: 2, id: 'e2e.cue-party', version: '1.0.0', name: 'Cue party (FUI-23 e2e)',
  description: 'One rule: at the round start a message and one cue of the disc\'s own sounds.',
  target: PACK_TARGET_US, contract: `^${ENGINE_CONTRACT_VERSION}`, kinds: ['rules'], sides: 'server', dependencies: [],
  files: [{ path: RULES_PATH, sha256: createHash('sha256').update(RULES, 'utf8').digest('hex'), size: Buffer.byteLength(RULES, 'utf8'), role: 'rules' }],
  intents: [{ kind: 'new-behaviour', files: [RULES_PATH] }],
}, null, 2)}\n`;
const packFiles = () => [{ path: 's2u-pack.json', text: manifest() }, { path: RULES_PATH, text: RULES }];

test.use({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });

// The pairing harness of forgeCtf.spec.ts, copied (test plumbing only).
async function guestToken(context: BrowserContext): Promise<string> {
  const metadata = await (await context.request.get(`${GATEWAY}/.well-known/oauth-authorization-server`)).json();
  return withCallbackServer(async (redirect) => {
    const registered = await (await context.request.post(metadata.registration_endpoint, { data: { redirect_uris: [redirect],
      token_endpoint_auth_method: 'none', client_name: 'FUI-23 cues e2e', grant_types: ['authorization_code'],
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

/**
 * The autoplay-denied output, made (test plumbing): an `AudioContext` made while `__e2eDenyAudio` is set is suspended at
 * once, reads `suspended` and refuses `resume` until the next trusted pointer press, which clears the flag first (a
 * window capture listener, ahead of the page's own on its document).
 */
async function denyAudioWhenArmed(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { AudioContext?: typeof AudioContext; __e2eDenyAudio?: boolean; __e2eDenied?: number };
    const Native = w.AudioContext;
    if (!Native) return;
    const held = new WeakSet<object>();
    window.addEventListener('pointerdown', (e) => { if (e.isTrusted) w.__e2eDenyAudio = false; }, true);
    w.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        if (w.__e2eDenyAudio) { held.add(this); w.__e2eDenied = (w.__e2eDenied ?? 0) + 1; void super.suspend(); }
      }
      override get state(): AudioContextState { return held.has(this) && w.__e2eDenyAudio ? 'suspended' : super.state; }
      override resume(): Promise<void> {
        return held.has(this) && w.__e2eDenyAudio ? Promise.reject(new DOMException('held by the FUI-23 e2e', 'NotAllowedError')) : super.resume();
      }
    };
  });
}

type Command = (operation: string, args: Record<string, unknown>, revision?: number) => Promise<any>;
const agentPanel = (page: Page) => page.getByRole('region', { name: 'Connect your agent' });

async function pair(context: BrowserContext, page: Page, pageOrigin: string, query: string): Promise<Command> {
  const token = await guestToken(context);
  const headers = { Authorization: `Bearer ${token}` };
  await routeToGateway(context, pageOrigin);
  await page.goto(`/forge?${query}`);
  await page.waitForLoadState('networkidle');
  if ((page.viewportSize()?.width ?? 1440) <= 760) await page.locator('.fx-top button[aria-label="Docks"]').click();
  await page.locator('.fx-right [data-forge-tab="agent"]').click();
  const agentSection = page.locator('.fx-right details[data-forge-panel="agent"]');
  if (!(await agentSection.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Connect your agent', { exact: true }).click();
  const panel = agentPanel(page);
  // AX-U: one card; the Connect moment's one primary button copies the one connect line.
  const copy = panel.getByRole('button', { name: 'Copy connect link', exact: true });
  await copy.waitFor({ timeout: 60_000 });
  await copy.click();
  await panel.getByText('Waiting for your agent', { exact: true }).waitFor({ timeout: 10_000 });
  const blurb: string = await page.evaluate(() => navigator.clipboard.readText());
  const match = blurb.match(/^Connect to my SOCOM 2 Legacy page: \S+\/join\/([A-Za-z0-9_.:-]{1,128})$/);
  expect(match, 'the copied line carries the join link').toBeTruthy();
  // REVIEW-1 finding 3: the gateway holds the pair until the page answers (AX-3), so the call is started here and
  // awaited after the Allow click (`tools/forge-agent-probe/pairing.ts`).
  const pairing = beginPair(() => context.request.post(`${GATEWAY}/api/v1/pair`, { headers, timeout: PROBE_PAIR_TIMEOUT_MS,
    data: pairBody(match![1]!, PERMISSIONS, 'FUI-23 cues e2e') }));
  await panel.locator('[data-agent-moment="allow"]').waitFor({ state: 'visible', timeout: 10_000 });
  for (const box of await panel.locator('.agent-panel__permissions input:not(:disabled)').all()) await box.check();
  await panel.locator('[data-agent-approve]').click();
  const paired = await pairing;
  expect(paired.ok(), `pair: ${paired.status()}`).toBe(true);
  expect((await paired.json()).state, 'the held pair answers once Allow is clicked').toBe('paired');
  await page.locator('.agent-panel[data-state="connected"]').waitFor({ timeout: 30_000 });
  const statuses = await (await context.request.get(`${GATEWAY}/api/v1/status`, { headers })).json();
  const session = statuses.sessions[0];
  expect(session, 'the status lists the paired session').toBeTruthy();
  let n = 0;
  return async (operation, args, revision) => {
    await new Promise((resolve) => setTimeout(resolve, 310));     // within the per-session command budget (native.py)
    const body: Record<string, unknown> = { version: 1, requestId: `cues-${Date.now()}-${++n}`, sessionId: session.sessionId,
      targetId: session.targetId, epoch: session.epoch, operation, args };
    if (revision !== undefined) body['expectedRevision'] = revision;
    return (await context.request.post(`${GATEWAY}/api/v1/commands`, { headers, data: body, timeout: 35_000 })).json();
  };
}

test.describe(`FUI-23: a rules pack's cue heard, held for a gesture${MISSING.length ? ` (gateway dependencies absent: ${MISSING.join(', ')}; skipped)` : ''}`, () => {
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

  test('a cue-playing pack on MP2: the chip "Press ✕ to hear the cues" before the click, gone after; the console clean', async ({ context, page, baseURL }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
    await denyAudioWhenArmed(context);
    const command = await pair(context, page, new URL(baseURL!).origin, 'devmode');
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
    const wait = async (predicate: (state: any) => boolean, seconds = 120): Promise<any> => {
      const deadline = Date.now() + seconds * 1000;
      for (;;) {
        const state = await read();
        if (predicate(state)) return state;
        expect(Date.now() < deadline, JSON.stringify(state)).toBe(true);
        await page.waitForTimeout(150);
      }
    };
    const input = packFiles();
    const checked = await validatePack(input.map((f) => ({ path: f.path, bytes: new Uint8Array(Buffer.from(f.text, 'utf8')) })), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION });
    expect(checked.ok, JSON.stringify(checked.report)).toBe(true);
    await mutate('forge.rules.import', { files: input });

    // Armed just before Play: the match's output is the autoplay-denied one.
    await page.evaluate(() => { (window as unknown as { __e2eDenyAudio: boolean }).__e2eDenyAudio = true; });
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
    const chips = page.locator('[data-forge-chips="match"]');
    await expect(chips).toContainText('PLAY · Cue party', { timeout: 60_000 });
    await expect(chips).toContainText('Cue party on', { timeout: 60_000 });          // the rule fired at the round's start
    const cueChip = chips.locator('[data-forge-chip="rules-cue"]');
    await expect(cueChip).toHaveText('Press ✕ to hear the cues', { timeout: 30_000 });
    // The gesture at once, as a person answering the chip: a held cue is stale 5 s after it could first be heard (FUI.R24
    // C3, amended). 91's box run of 0709129e6 logged stale 1 with the click behind a full-page shot of the WebGL page,
    // which takes seconds there; the shot and the readouts now come after the click.
    const shown = Date.now();
    await cueChip.click({ force: true });
    console.log(`FUI-23 click ${Date.now() - shown} ms after the chip showed`);
    await expect(cueChip).toHaveCount(0, { timeout: 30_000 });
    // How many contexts the script held (0 when the match's output had made none before the gesture: it reads `locked`).
    const denied = await page.evaluate(() => (window as unknown as { __e2eDenied?: number }).__e2eDenied ?? 0);
    await test.info().attach('contexts-held.txt', { body: String(denied), contentType: 'text/plain' });
    await expect(page.getByText(`cue ${CUE}: not on this map`)).toHaveCount(0);
    // The chip is also gone after a stale drop (> 5 s between the cue and the click): the DEV readout's counts say it played.
    const cueStats = (): Promise<{ played: number; dropped: { stale: number } } | null> =>
      page.evaluate(() => (globalThis as unknown as { __forgeMatch?: { cueStats?: () => { played: number; dropped: { stale: number } } | null } }).__forgeMatch?.cueStats?.() ?? null);
    // FUI-23 fold: the counts as the page holds them, attached before the poll so a red names its cause (stale, or a play that did not sound).
    // The run's own log carries the counts too (the attachment stays in Playwright's report): before the poll, and again if it fails.
    const stats0 = JSON.stringify(await cueStats());
    console.log(`FUI-23 cue stats: ${stats0}`);
    await test.info().attach('cue-stats.json', { body: JSON.stringify(JSON.parse(stats0), null, 2), contentType: 'application/json' });
    try {
      await expect.poll(async () => (await cueStats())?.played ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    } catch (e) {
      console.log(`FUI-23 cue stats: ${JSON.stringify(await cueStats())} (the poll failed)`);
      throw e;
    }
    expect((await cueStats())?.dropped.stale, 'no cue went stale before the gesture').toBe(0);
    await expect(page.getByText(`cue ${CUE}: not on this map`)).toHaveCount(0);
    await test.info().attach('fui23-cue-heard.png', { body: await page.screenshot(), contentType: 'image/png' });

    await mutate('play.stop', {});
    await wait((s) => !s?.play?.ready);
    await test.info().attach('console-warnings.txt', { body: warnings.join('\n'), contentType: 'text/plain' });
    expect(errors, 'no page error and no console error').toEqual([]);
  });
});
