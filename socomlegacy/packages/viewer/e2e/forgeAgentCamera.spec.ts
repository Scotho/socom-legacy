import { expect, test, type Page } from '@playwright/test';
import { createFixture, invitation } from '../../../tools/forge-agent-probe/browser';

/**
 * R5-B (a browser adaptation, no original): the agent's camera shot end to end -- a paired agent submits ONE shot over the
 * gateway, the rendered Forge page plays it, the agent chip says "Camera shot" and its "Stop camera" ends it `stopped`.
 * Opt-in, like the onboarding spec: it needs the agent gateway running and a disc map the page can load (a blank floor
 * has no box and refuses NOT_READY). Written in round 5b and NOT RUN there (no browser in that seat): its first run is
 * its first evidence.
 */
const gateway = process.env.FCW_GATEWAY ?? 'http://127.0.0.1:5360';
const archive = process.env.FCW_CAMERA_MAP;
test.skip(process.env.FCW_CAMERA_E2E !== '1' || !archive,
  'The camera shot e2e is opt-in: requires FCW_CAMERA_E2E=1, FCW_CAMERA_MAP=<a disc archive stem> and the agent gateway; skipped, not passed.');

/** One MCP session over the gateway's streamable HTTP endpoint, as the guest the fixture authorized. */
function mcp(token: string) {
  let session: string | null = null, id = 0;
  const call = async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const response = await fetch(`${gateway}/mcp`, { method: 'POST', headers: {
      authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    session = response.headers.get('mcp-session-id') ?? session;
    const text = await response.text();
    const json = text.trimStart().startsWith('{') ? text : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).at(-1) ?? 'null';
    const message = JSON.parse(json);
    if (message?.error) throw Error(`${method}: ${JSON.stringify(message.error)}`);
    return message?.result;
  };
  const tool = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
    const result = await call('tools/call', { name, arguments: args });
    return result?.structuredContent ?? JSON.parse(result?.content?.find((b: any) => b.type === 'text')?.text ?? 'null');
  };
  return { call, tool };
}

async function approve(page: Page): Promise<void> {
  // AX-U: the Allow moment, every requested permission already on (AX.R2); its primary is Allow.
  const allow = page.locator('[data-agent-moment="allow"]');
  await allow.waitFor({ state: 'visible', timeout: 30_000 });
  for (const box of await allow.locator('.agent-panel__permissions input:not(:disabled)').all()) await box.check();
  await allow.locator('[data-agent-approve]').click();
  await page.locator('.agent-panel[data-state="connected"]').waitFor({ timeout: 30_000 });
}

test('an agent camera shot plays on the page and the chip\'s Stop camera ends it (written, not run in R5-B)', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const { context, page, token } = await createFixture(browser, process.env.FCW_PAGE ?? baseURL!, gateway);
  try {
    const agent = mcp(token);
    await agent.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'R5-B camera e2e', version: '1' } });
    // REVIEW-1 finding 3: agent_pair holds until the page answers (AX-3); no wait, so it answers pending before Allow.
    const pairing = await agent.tool('agent_pair', { invitation: await invitation(page, 'claude'), permissions: ['inspect', 'edit'], waitSeconds: 0 });
    expect(pairing?.state).toBe('pending');
    await approve(page);
    const status = await agent.tool('agent_status');
    const s = status.sessions.find((x: any) => x.state === 'paired');
    let n = 0;
    const request = (operation: string, args: unknown, expectedRevision?: number) => agent.tool('agent_request', {
      version: 1, requestId: `cam-${++n}`, sessionId: s.sessionId, targetId: s.targetId, epoch: s.epoch, operation, args,
      ...(expectedRevision === undefined ? {} : { expectedRevision }) });
    const revision = async (): Promise<number> => (await request('target.status', {})).revision;
    expect(await request('forge.edit', { operation: 'layout.base', arguments: { base: { kind: 'map', archive } } }, await revision())).toMatchObject({ outcome: 'ok' });
    const view = await request('forge.read', { section: 'view' });
    const at = view.data.camera as { x: number; y: number; z: number };
    // A short pan from where the map's own stand put the camera, looking at a point ahead of it: inside the map's box.
    const look = [at.x, at.y - 20, at.z - 200];
    const shot = await request('camera.shot', { points: [{ at: [at.x, at.y, at.z], look }, { at: [at.x + 50, at.y, at.z], look }], seconds: 20 }, await revision());
    expect(shot, JSON.stringify(shot)).toMatchObject({ outcome: 'ok', data: { shotId: expect.any(String) } });
    await expect(page.locator('.fx-status [data-forge-chip="agent"] .s2u-chip__word')).toHaveText('Camera shot', { timeout: 5_000 });
    await page.waitForTimeout(1_000);
    const running = await request('camera.status', {});
    expect(running.data).toMatchObject({ shot: shot.data.shotId });
    expect(running.data.t).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    const ended = await request('camera.status', {});
    expect(ended.data).toMatchObject({ shot: shot.data.shotId, ended: 'stopped' });
    await expect(page.locator('.fx-status [data-forge-chip="agent"] .s2u-chip__word')).toHaveText('Agent connected');
  } finally {
    await context.close();
  }
});
