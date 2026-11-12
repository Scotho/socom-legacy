import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { PROBE_WORDS } from './browser';
import { copiedSetup } from './nativeOAuth';
import { AGENT_ALLOW_LABEL, AGENT_COPY_LINK_LABEL, agentSetupRows, pairingText } from '../../packages/viewer/src/agent/setup';
import { CONSENT_APPROVE_LABEL } from '../../packages/forge-agent/src/oauth';

/**
 * FP-14's fold B1, reworked by AX-U (product adaptation): the probe drives the dock and the consent page by their own
 * words and data attributes, so a rename there fails here rather than silently in an opt-in browser run (the controller's
 * measured pairing, `native.py`).
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => readFileSync(resolve(here, name), 'utf8');

it('the probe\'s words are the panel\'s and the consent page\'s', () => {
  expect(PROBE_WORDS).toEqual({
    consentApprove: CONSENT_APPROVE_LABEL,
    copyLink: AGENT_COPY_LINK_LABEL,
    allow: AGENT_ALLOW_LABEL,
  });
  expect(PROBE_WORDS).toEqual({ consentApprove: 'Approve', copyLink: 'Copy connect link', allow: 'Allow' });
});

it('no probe source drives the old UI, and native.py names the same words', () => {
  for (const f of ['browser.ts', 'nativeOAuth.ts', 'native.py']) {
    for (const old of ['Continue as guest', 'Copy connection instructions', 'Copy pairing instructions', 'Pair this page',
      'Allow selected access', 'Allow this connection?', 'agent_pair with invitation', 'data-agent-step', '.agent-panel__comparison\'']) {
      expect(read(f), `${f}: ${old}`).not.toContain(old);
    }
  }
  const py = read('native.py');
  for (const word of [CONSENT_APPROVE_LABEL, AGENT_COPY_LINK_LABEL, AGENT_ALLOW_LABEL]) expect(py, word).toContain(`'${word}'`);
  expect(py).toContain('[data-agent-moment="allow"]');
});

it('copiedSetup reads the first-time command and the connect line\'s endpoint and invitation', () => {
  const gateway = 'http://127.0.0.1:5368';
  for (const client of ['claude', 'codex'] as const) {
    const copied = `${agentSetupRows(client, gateway)[0]!.text}\n${pairingText(gateway, 'synthetic-invitation')}`;
    expect(copiedSetup(copied, client, gateway)).toEqual({ endpoint: `${gateway}/mcp`, invitation: 'synthetic-invitation' });
    const elsewhere = `${agentSetupRows(client, gateway)[0]!.text}\n${pairingText('https://unrelated.invalid', 'synthetic-invitation')}`;
    expect(() => copiedSetup(elsewhere, client, gateway), client).toThrow('COPIED_SETUP_MISMATCH');
    expect(() => copiedSetup(pairingText(gateway, 'x'), client, gateway), `${client}: no command`).toThrow('COPIED_SETUP_MISMATCH');
  }
});
