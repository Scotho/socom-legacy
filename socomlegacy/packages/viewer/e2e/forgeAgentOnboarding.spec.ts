import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runAcceptance } from '../../../tools/forge-agent-probe/harness';
import { CASES } from '../../../tools/forge-agent-probe/scenarios';

/** Product adaptation, FCW-02: opt-in actual installed-client evidence; never SDK/native evidence. */
const client = process.env.FCW_ACTUAL_CLIENT;
const output = process.env.FCW_ACCEPTANCE_OUT;
test.skip(!['codex', 'claude'].includes(client ?? '') || !output,
  'Actual-client acceptance not selected: requires FCW_ACTUAL_CLIENT=codex|claude and FCW_ACCEPTANCE_OUT outside all git trees; skipped, not passed.');

for (const name of CASES) {
  test(`actual ${client ?? 'unselected'}: ${name}`, async ({ browser, baseURL }) => {
    test.skip(name === 'expiry' && process.env.FCW_WAIT_FOR_EXPIRY !== '1',
      'Real invitation ageing (301 seconds) not authorized by FCW_WAIT_FOR_EXPIRY=1; skipped, not passed.');
    test.setTimeout(name === 'expiry' ? 600_000 : name === 'reconnect' ? 540_000 : 300_000);
    const report = await runAcceptance({ browser, client: client as 'claude' | 'codex', cases: [name],
      page: process.env.FCW_PAGE ?? baseURL!, gateway: process.env.FCW_GATEWAY ?? 'http://127.0.0.1:5360',
      out: join(output!, name), repository: fileURLToPath(new URL('../../../../', import.meta.url)) });
    expect(report.cases[name]?.status, 'Only this actual-client case was selected; other cases remain blocked.').toBe('pass');
    expect(report.status, 'A filtered run must never claim the complete matrix passed.').toBe('blocked');
  });
}
