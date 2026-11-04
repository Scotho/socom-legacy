/** Product adaptation: opt-in actual installed-client creator-loop acceptance, independent of native.py. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { classify, failurePhase, payload, pngImage, safeReport } from './acceptance';
import { consent, createFixture, invitation, localOrigin } from './browser';
import { runClient, type CliResult, type ClientMessage } from './client';
import { outsideRepository, type ClientName } from './isolation';
import { classifyNegative } from './negative';
import { ClientSetupError, clientFailureReport } from './diagnostics';
import type { ClientEvents } from './events';
import { startRecordingProxy } from './proxy';
import { CASES, creatorPrompt, missingGatewayPrompt, pairPrompt, reconnectPrompt, MCP_RULES, type CaseName } from './scenarios';

export interface HarnessOptions { client: ClientName; browser: Browser; page: string; gateway: string; out: string;
  repository: string; cases: readonly CaseName[]; timeoutMs?: number; signal?: AbortSignal; onMessage?: (message: ClientMessage) => void }
interface CaseReport { status: 'pass' | 'fail' | 'blocked'; reason?: string; phase?: string; systemCode?: string; checks?: Record<string, boolean>; childExit?: number | null; timedOut?: boolean; clientEvents?: ClientEvents }
async function childAndConsent(options: HarnessOptions, page: Page, proxy: Awaited<ReturnType<typeof startRecordingProxy>>, prompt: string, approve: boolean) {
  const lifetime = new AbortController();
  const abort = () => lifetime.abort(); options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let action = false;
  try {
    const child = runClient({ client: options.client, endpoint: proxy.endpoint, prompt, timeoutMs: options.timeoutMs ?? 240_000, signal: lifetime.signal, onMessage: options.onMessage });
    const consentTask = consent(page, proxy.events, approve, lifetime.signal).then(value => { action = value; }, () => { lifetime.abort(); });
    let result: CliResult;
    try { result = await child; } finally { lifetime.abort(); await consentTask; }
    return { child: result, browserAction: action };
  } finally { lifetime.abort(); options.signal?.removeEventListener('abort', abort); }
}
export function initialReconnectPrompt(code: string): string {
  return `${MCP_RULES}\nCall agent_capabilities then agent_pair invitation ${JSON.stringify(code)},clientName:"FCW before reconnect",permissions:["inspect","edit"].
The browser will approve. Poll agent_status until paired. Read target.status. Send agent_request {version:1,requestId:"fcw-reconnect-old-edit",sessionId,targetId,epoch,expectedRevision:<status revision>,operation:"forge.edit",args:{operation:"layout.name",arguments:{name:"FCW reconnect baseline"}}}.
Require outcome:ok, then forge.read {section:"metadata"} must confirm the name. Call agent_disconnect with this sessionId. Do not pair again.`;
}
async function runCase(options: HarnessOptions, name: CaseName): Promise<CaseReport> {
  let phase = 'BROWSER_CONTEXT';
  let fixture: Awaited<ReturnType<typeof createFixture>> | undefined;
  let proxy: Awaited<ReturnType<typeof startRecordingProxy>> | undefined;
  try {
    fixture = name === 'missing-gateway' ? undefined : await createFixture(options.browser, options.page, options.gateway, value => { phase = value; });
    phase = 'PROXY_START';
    proxy = await startRecordingProxy(name === 'missing-gateway' ? 'http://127.0.0.1:1' : options.gateway, fixture?.token ?? 'unused');
    if (name === 'missing-gateway') {
      phase = 'CLIENT_EXECUTION';
      const child = await runClient({ client: options.client, endpoint: proxy.endpoint, prompt: missingGatewayPrompt,
        timeoutMs: options.timeoutMs ?? 240_000, signal: options.signal });
      return { status: classifyNegative(name, proxy.events, child, true) ? 'pass' : 'fail', phase: 'MISSING_GATEWAY_REFUSAL', childExit: child.exitCode, timedOut: child.timedOut };
    }
    const page = fixture!.page;
    phase = 'COPY_INVITATION'; const code = await invitation(page, options.client);
    if (name === 'expiry') {
      // Real wall time: do not fake the gateway clock or forge an invalid invitation and call it expiry.
      phase = 'WAIT_REAL_EXPIRY'; const expires = Date.now() + 301_000;
      while (Date.now() < expires) {
        if (options.signal?.aborted) throw Error('INTERRUPTED');
        await page.waitForTimeout(Math.min(1000, expires - Date.now()));
      }
      phase = 'CLIENT_EXECUTION'; const child = await runClient({ client: options.client, endpoint: proxy.endpoint, prompt: pairPrompt(code, name),
        timeoutMs: options.timeoutMs ?? 240_000, signal: options.signal });
      return { status: classifyNegative(name, proxy.events, child, true) && !fixture!.pageError() ? 'pass' : 'fail', phase: 'EXPIRED_INVITATION_REFUSAL', childExit: child.exitCode, timedOut: child.timedOut };
    }
    if (name === 'reconnect') {
      phase = 'RECONNECT_PREPARATION'; const first = await childAndConsent(options, page, proxy, initialReconnectPrompt(code), true);
      const oldEdit = proxy.events.find(e => e.params?.arguments?.requestId === 'fcw-reconnect-old-edit' && payload(e)?.outcome === 'ok');
      const disconnected = proxy.events.some(e => e.params?.name === 'agent_disconnect' && payload(e)?.disconnected === true);
      const readback = proxy.events.some(e => e.params?.arguments?.operation === 'forge.read' && payload(e)?.data?.name === 'FCW reconnect baseline');
      if (first.child.exitCode !== 0 || first.child.timedOut || first.child.outputError || !first.browserAction || !oldEdit || !disconnected || !readback) return { status: 'fail', reason: 'RECONNECT_PREPARATION_FAILED' };
      const offset = proxy.events.length;
      phase = 'COPY_FRESH_INVITATION'; const fresh = await invitation(page, options.client);
      phase = 'RECONNECT_CLIENT';
      const second = await childAndConsent(options, page, proxy, reconnectPrompt(fresh, oldEdit.params!.arguments), true);
      return { status: classifyNegative(name, proxy.events.slice(offset), second.child, second.browserAction, oldEdit.params!.arguments)
        && !fixture!.pageError() ? 'pass' : 'fail', phase: 'RECONNECT_NO_REPLAY', childExit: second.child.exitCode, timedOut: second.child.timedOut };
    }
    phase = 'CLIENT_EXECUTION'; const result = await childAndConsent(options, page, proxy, name === 'creator' ? creatorPrompt(code) : pairPrompt(code, 'denial'), name === 'creator');
    if (name === 'denial') return { status: classifyNegative(name, proxy.events, result.child, result.browserAction)
      && !fixture!.pageError() ? 'pass' : 'fail', phase: 'PAGE_DENIAL_REFUSAL', childExit: result.child.exitCode, timedOut: result.child.timedOut };
    const classification = classify(proxy.events, { exitCode: result.child.exitCode, outputError: result.child.outputError,
      timedOut: result.child.timedOut, approved: result.browserAction });
    if (fixture!.pageError()) { classification.status = 'fail'; classification.checks.pageErrors = false; }
    const image = proxy.events.map(pngImage).find(Boolean);
    if (image) await writeFile(join(options.out, `${options.client}-mcp-canvas.png`), image);
    const safe = safeReport({ client: options.client, classification, clientEvents: result.child.clientEvents });
    return { status: safe.status, phase: failurePhase(classification), ...(result.child.nonMcpTool ? { reason: 'NON_MCP_TOOL_OBSERVED' } : result.child.clientError ? { reason: 'CLIENT_ERROR' } : {}),
      checks: safe.checks, childExit: safe.childExit, timedOut: safe.timedOut, clientEvents: safe.clientEvents };
  } catch (error) {
    if (error instanceof ClientSetupError) return clientFailureReport(error);
    const code = error instanceof Error ? error.message : '';
    const prerequisite = ['EXISTING_SUBSCRIPTION_REQUIRED', 'INSTALLED_CLIENT_REQUIRED', 'ACCESS_TOKEN_VALIDITY_REQUIRED'].includes(code);
    return { status: prerequisite ? 'blocked' : 'fail', phase, reason: prerequisite ? code : 'ASSERTION_OR_RESOURCE_FAILURE' };
  } finally { try { await proxy?.close(); } finally { await fixture?.context.close(); } }
}
export async function runAcceptance(options: HarnessOptions) {
  const page = localOrigin(options.page), gateway = localOrigin(options.gateway);
  const out = await outsideRepository(options.out, options.repository);
  const cases: Record<string, CaseReport> = {};
  for (const name of CASES) {
    if (!options.cases.includes(name)) { cases[name] = { status: 'blocked', reason: 'NOT_SELECTED' }; continue; }
    if (options.signal?.aborted) { cases[name] = { status: 'fail', reason: 'INTERRUPTED' }; continue; }
    // Print only fixed case identifiers, never child output, prompts, token material or user paths.
    console.log(`FCW actual-client ${options.client}: ${name} starting`);
    try { cases[name] = await runCase({ ...options, page, gateway, out }, name); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      const prerequisite = ['EXISTING_SUBSCRIPTION_REQUIRED', 'INSTALLED_CLIENT_REQUIRED', 'ACCESS_TOKEN_VALIDITY_REQUIRED'].includes(code);
      cases[name] = { status: prerequisite ? 'blocked' : 'fail', reason: prerequisite ? code : 'ASSERTION_OR_RESOURCE_FAILURE' };
    }
    console.log(`FCW actual-client ${options.client}: ${name} ${cases[name]!.status}`);
  }
  const statuses = Object.values(cases).map(result => result.status);
  const report = { adaptation: true, client: options.client, evidence: 'actual-cli-via-loopback-proxy',
    status: statuses.includes('fail') ? 'fail' : statuses.includes('blocked') ? 'blocked' : 'pass', cases,
    unmeasured: ['copied-blurb-client-oauth', 'client-ui-image-display', 'different-subscription-profile', 'lan', 'separate-network', 'turn'],
    note: 'Guest OAuth is rendered harness bootstrap; actual CLI tool calls use an already-authorized in-memory HTTP proxy. PNG receipt proves MCP image delivery, not client UI display. Native/SDK tests are separate.' };
  await writeFile(join(out, `${options.client}-acceptance.json`), JSON.stringify(report, null, 2));
  return report;
}
