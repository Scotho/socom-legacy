/** Product adaptation: installed-client-owned OAuth directly to the gateway, with no recording/auth proxy. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { classify, failurePhase, payload, pngImage, safeReport, type Exchange } from './acceptance';
import { consent, copiedInstructions, createFixture, localOrigin } from './browser';
import { type CliResult } from './client';
import { ClientSetupError, clientFailureReport } from './diagnostics';
import { type HarnessOptions, initialReconnectPrompt } from './harness';
import { outsideRepository } from './isolation';
import { withNativeClient } from './nativeClient';
import { copiedSetup } from './nativeOAuth';
import { classifyNegative } from './negative';
import { CASES, creatorPrompt, pairPrompt, reconnectPrompt } from './scenarios';

async function childAndConsent(page: Page, events: Exchange[], run: (prompt: string) => Promise<CliResult>, prompt: string, approve: boolean) {
  const lifetime = new AbortController(); let browserAction = false;
  const consentTask = consent(page, events, approve, lifetime.signal).then(value => { browserAction = value; }, () => {});
  let child: CliResult;
  try { child = await run(prompt); }
  finally { lifetime.abort(); await consentTask; }
  return { child, browserAction };
}
/** The client profile's whole lifetime: every launch it makes, each bounded by one step's timeout (LATER 448). */
export function nativeCaseBudgetMs(client: HarnessOptions['client'], name: string, stepMs: number): number {
  // Claude's server registration, the login, the case's model invocations, the logout.
  const steps = (client === 'claude' ? 1 : 0) + 1 + (name === 'reconnect' ? 2 : 1) + 1;
  return stepMs * steps + (name === 'expiry' ? 301_000 : 0) + 60_000;
}
export async function runNativeAcceptance(options: HarnessOptions) {
  const pageOrigin = localOrigin(options.page), gateway = localOrigin(options.gateway);
  const out = await outsideRepository(options.out, options.repository);
  const cases: Record<string, any> = {};
  for (const name of CASES) {
    if (!options.cases.includes(name)) { cases[name] = { status: 'blocked', reason: 'NOT_SELECTED' }; continue; }
    if (name === 'missing-gateway') {
      // An unauthenticated startup warning is not an observed MCP refusal. The proxy case measures this today.
      cases[name] = { status: 'blocked', reason: 'NATIVE_MISSING_GATEWAY_RESULT_UNOBSERVABLE' }; continue;
    }
    let phase = 'BROWSER_CONTEXT';
    let fixture: Awaited<ReturnType<typeof createFixture>> | undefined;
    try {
      console.log(`FCW native-client ${options.client}: ${name} starting`);
      fixture = await createFixture(options.browser, pageOrigin, gateway, value => { phase = value; }, false);
      phase = 'COPY_NATIVE_SETUP';
      const setup = copiedSetup(await copiedInstructions(fixture.page, options.client), options.client, gateway);
      // Authentication and both reconnect invocations share this isolated profile; global credentials stay read-only.
      cases[name] = await withNativeClient({ client: options.client, endpoint: setup.endpoint, context: fixture.context,
        timeoutMs: options.timeoutMs ?? 240_000, budgetMs: nativeCaseBudgetMs(options.client, name, options.timeoutMs ?? 240_000),
        signal: options.signal, onMessage: options.onMessage, phase: value => { phase = value; } }, async client => {
        const page = fixture!.page;
        if (name === 'expiry') {
          phase = 'WAIT_REAL_EXPIRY'; const expires = Date.now() + 301_000;
          while (Date.now() < expires) {
            if (options.signal?.aborted) throw Error('INTERRUPTED');
            await page.waitForTimeout(Math.min(1000, expires - Date.now()));
          }
          phase = 'CLIENT_EXECUTION'; const child = await client.run(pairPrompt(setup.invitation, 'expiry'));
          return { status: classifyNegative('expiry', client.events, child, true) && !fixture!.pageError() && !client.invalid() ? 'pass' : 'fail',
            phase: 'EXPIRED_INVITATION_REFUSAL', childExit: child.exitCode, timedOut: child.timedOut };
        }
        if (name === 'reconnect') {
          phase = 'RECONNECT_PREPARATION';
          const first = await childAndConsent(page, client.events, client.run, initialReconnectPrompt(setup.invitation), true);
          const oldEdit = client.events.find(e => e.params?.arguments?.requestId === 'fcw-reconnect-old-edit' && payload(e)?.outcome === 'ok');
          const disconnected = client.events.some(e => e.params?.name === 'agent_disconnect' && payload(e)?.disconnected === true);
          const readback = client.events.some(e => e.params?.arguments?.operation === 'forge.read' && payload(e)?.data?.name === 'FCW reconnect baseline');
          if (first.child.exitCode !== 0 || first.child.timedOut || first.child.outputError || !first.browserAction || !oldEdit || !disconnected || !readback)
            return { status: 'fail', phase, reason: 'RECONNECT_PREPARATION_FAILED' };
          phase = 'COPY_FRESH_INVITATION'; const fresh = copiedSetup(await copiedInstructions(page, options.client), options.client, gateway);
          const offset = client.events.length;
          phase = 'RECONNECT_CLIENT';
          const second = await childAndConsent(page, client.events, client.run, reconnectPrompt(fresh.invitation, oldEdit.params!.arguments), true);
          return { status: classifyNegative('reconnect', client.events.slice(offset), second.child, second.browserAction, oldEdit.params!.arguments)
            && !fixture!.pageError() && !client.invalid() ? 'pass' : 'fail', phase: 'RECONNECT_NO_REPLAY', childExit: second.child.exitCode, timedOut: second.child.timedOut };
        }
        phase = 'CLIENT_EXECUTION';
        const result = await childAndConsent(page, client.events, client.run, name === 'creator' ? creatorPrompt(setup.invitation) : pairPrompt(setup.invitation, 'denial'), name === 'creator');
        if (name === 'denial') return { status: classifyNegative(name, client.events, result.child, result.browserAction)
          && !fixture!.pageError() && !client.invalid() ? 'pass' : 'fail', phase: 'PAGE_DENIAL_REFUSAL', childExit: result.child.exitCode, timedOut: result.child.timedOut };
        const classification = classify(client.events, { ...result.child, approved: result.browserAction,
          outputError: result.child.outputError || client.invalid() }, 'native-client-results');
        if (fixture!.pageError()) { classification.status = 'fail'; classification.checks.pageErrors = false; }
        const image = client.events.map(pngImage).find(Boolean);
        if (image) await writeFile(join(out, `${options.client}-native-mcp-canvas.png`), image);
        const safe = safeReport({ client: options.client, classification, clientEvents: result.child.clientEvents });
        return { status: safe.status, phase: failurePhase(classification), checks: safe.checks, childExit: safe.childExit, timedOut: safe.timedOut,
          clientEvents: safe.clientEvents, ...(result.child.nonMcpTool ? { reason: 'NON_MCP_TOOL_OBSERVED' } : result.child.clientError ? { reason: 'CLIENT_ERROR' } : {}) };
      });
    } catch (error) {
      if (error instanceof ClientSetupError) cases[name] = clientFailureReport(error);
      else {
        const code = error instanceof Error ? error.message : '';
        const reasons = ['COPIED_SETUP_MISMATCH', 'NATIVE_SERVER_REGISTRATION_FAILED', 'NATIVE_CLIENT_OAUTH_FAILED', 'NATIVE_CLIENT_LOGOUT_FAILED', 'NATIVE_CLIENT_BUDGET_EXHAUSTED', 'NATIVE_CLAUDE_FILE_STORE_UNVERIFIED', 'OPTIONAL_NODE_PTY_REQUIRED', 'NATIVE_PTY_LAUNCH_FAILED', 'NATIVE_PTY_TERMINATION_UNCONFIRMED'];
        cases[name] = { status: ['NATIVE_CLAUDE_FILE_STORE_UNVERIFIED', 'OPTIONAL_NODE_PTY_REQUIRED'].includes(code) ? 'blocked' : 'fail', phase,
          reason: reasons.includes(code) ? code : 'ASSERTION_OR_RESOURCE_FAILURE' };
      }
    } finally { await fixture?.context.close(); }
    console.log(`FCW native-client ${options.client}: ${name} ${cases[name].status}`);
  }
  const statuses = Object.values(cases).map(result => result.status);
  const report = { adaptation: true, client: options.client, evidence: 'actual-cli-native-oauth-direct-gateway',
    status: statuses.includes('fail') ? 'fail' : statuses.includes('blocked') ? 'blocked' : 'pass', cases,
    unmeasured: ['literal-copied-add-command-execution', 'native-missing-gateway-result', 'client-ui-image-display', 'different-subscription-profile', 'lan', 'separate-network', 'turn'],
    note: 'Copied local endpoint and invitation are validated. The same endpoint is registered in an isolated profile, then installed CLI --no-browser owns OAuth registration/PKCE/token exchange and file storage; browser performs guest consent. Native model MCP results are observed in memory without token injection or proxy. Discovery requires successful calls to all five tools. Login alone never passes creator acceptance.' };
  await writeFile(join(out, `${options.client}-native-acceptance.json`), JSON.stringify(report, null, 2));
  return report;
}
