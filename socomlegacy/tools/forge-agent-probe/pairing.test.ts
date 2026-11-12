import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PAIR_WAIT_SECONDS } from '../../packages/forge-agent/src/sessions';
import { beginPair, pairBody, pairThroughPage, PROBE_PAIR_TIMEOUT_MS, PROBE_PAIR_WAIT_SECONDS } from './pairing';
import { creatorPrompt, pairPrompt, reconnectPrompt } from './scenarios';
import { initialReconnectPrompt } from './harness';

/**
 * REVIEW-1 finding 3 (product track; the probe and the e2e specs are instruments): since AX-3 the gateway holds
 * `POST /api/v1/pair` (and `agent_pair`) until the page answers. A script that awaits the pair before it clicks Allow
 * deadlocks until the wait or its request timeout ends; the pairing helper starts the call, answers in the page, then
 * awaits the call's `paired`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, rel), 'utf8');

/** A fake gateway: the pair call answers only once the page has answered. */
function heldGateway() {
  let answer!: (v: { state: string }) => void;
  const held = new Promise<{ state: string }>((r) => { answer = r; });
  const order: string[] = [];
  return {
    order,
    start: vi.fn(() => { order.push('pair started'); return held; }),
    allow: vi.fn(async () => { order.push('allow clicked'); answer({ state: 'paired' }); }),
  };
}

describe('the probe\'s pairing helper does not block the Allow click on the held pair', () => {
  it('starts the pair, clicks Allow while it is held, then resolves paired', async () => {
    const g = heldGateway();
    const outcome = await pairThroughPage(g.start, g.allow);
    expect(outcome).toEqual({ state: 'paired' });
    expect(g.order).toEqual(['pair started', 'allow clicked']);
  });

  it('a pair awaited before Allow would never settle here (the deadlock the helper avoids)', async () => {
    const g = heldGateway();
    const raced = await Promise.race([g.start().then(() => 'settled'), new Promise((r) => setTimeout(() => r('still held'), 20))]);
    expect(raced).toBe('still held');
  });

  it('beginPair returns the call itself; a rejection before it is awaited is not unhandled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const failed = beginPair(() => Promise.reject(Error('CONTEXT_CLOSED')));
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
      await expect(failed).rejects.toThrow('CONTEXT_CLOSED');
    } finally { process.off('unhandledRejection', unhandled); }
  });

  it('the body asks a wait inside the gateway\'s bounds and shorter than the request timeout', () => {
    expect(pairBody('inv1', ['inspect'], 'probe')).toEqual({ invitation: 'inv1', permissions: ['inspect'], clientName: 'probe', waitSeconds: PROBE_PAIR_WAIT_SECONDS });
    expect(PROBE_PAIR_WAIT_SECONDS).toBeGreaterThan(PAIR_WAIT_SECONDS.min);
    expect(PROBE_PAIR_WAIT_SECONDS).toBeLessThanOrEqual(PAIR_WAIT_SECONDS.max);
    expect(PROBE_PAIR_WAIT_SECONDS * 1000).toBeLessThan(PROBE_PAIR_TIMEOUT_MS);
  });
});

describe('every pairing script answers the page before it awaits the held pair', () => {
  const SPECS = ['forgeAgentNative.spec.ts', 'forgeCtf.spec.ts', 'forgePaintball.spec.ts', 'forgeCues.spec.ts'];
  it.each(SPECS)('%s starts the REST pair with beginPair and awaits it after Allow', (spec) => {
    const src = read(`../../packages/viewer/e2e/${spec}`);
    expect(src).not.toMatch(/await\s+(context\.)?request\.post\(`\$\{GATEWAY\}\/api\/v1\/pair`/);
    expect(src).toMatch(/beginPair\(\(\) => (context\.)?request\.post\(`\$\{GATEWAY\}\/api\/v1\/pair`/);
    const approve = src.indexOf("[data-agent-approve]').click()");
    const awaited = src.search(/await pairing\b/);
    expect(approve, 'clicks Allow').toBeGreaterThan(0);
    expect(awaited, 'awaits the pair after the click').toBeGreaterThan(approve);
    expect(src).toMatch(/\.state[^\n]*\)\.toBe\('paired'\)/);
  });

  it('the camera spec\'s MCP agent_pair expects pending, so it asks no wait', () => {
    const src = read('../../packages/viewer/e2e/forgeAgentCamera.spec.ts');
    expect(src).toMatch(/agent\.tool\('agent_pair', \{[^}]*waitSeconds: 0/);
  });

  it('native.py (sync Playwright: it cannot leave a call running) asks no wait, then checks paired after Allow', () => {
    const py = read('native.py');
    const pair = py.indexOf("'/api/v1/pair'");
    expect(pair).toBeGreaterThan(0);
    expect(py.slice(pair, py.indexOf('\n', pair))).toContain("'waitSeconds':0");
    expect(py).toMatch(/assert pair\['state'\]=='pending'/);
    const allow = py.indexOf("get_by_role('button',name='Allow',exact=True).click()");
    const confirmed = py.indexOf("'/api/v1/wait'");
    expect(confirmed).toBeGreaterThan(allow);
    expect(py).toMatch(/\['state'\]=='paired'/);
  });

  it('the real-client prompts ask agent_pair for no wait, so the probe sees pending and compares the code before Allow', () => {
    for (const prompt of [creatorPrompt('inv'), pairPrompt('inv', 'denial'), pairPrompt('inv', 'expiry'), reconnectPrompt('inv', {}), initialReconnectPrompt('inv')])
      expect(prompt).toMatch(/agent_pair[^\n]*waitSeconds:0/);
  });
});
