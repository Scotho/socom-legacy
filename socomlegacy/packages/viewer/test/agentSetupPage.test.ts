// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROJECT_PAGES, sitePageRoutes } from '@s2u/ui';
import { agentSetupPage } from '../src/agent/setupPage';
import { agentSetupRows } from '../src/agent/setup';

/**
 * FP-14 (FP.R10; MC-12's public setup route; a browser adaptation, FG.R2): `/agent`, a project page that works before the
 * Forge is open -- the client picker, its setup commands and sign-in line, then the line to open the Forge or the test
 * room and press Copy connect link (AX-U); nothing of an invitation, a join link or a token on it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const at = 'https://agent.example.com';

describe('FP-14: the public setup route /agent', () => {
  it('the route is the table\'s: a project page with its own document', () => {
    expect(PROJECT_PAGES).toContain('agent');
    expect(sitePageRoutes()).toContainEqual({ page: 'agent', file: 'agent/index.html' });
    const html = readFileSync(resolve(here, '../agent/index.html'), 'utf8');
    expect(html).toContain('data-project-page="agent"');
    expect(html).toContain('SOCOM II Legacy');
    expect(readFileSync(resolve(here, '../vite.config.ts'), 'utf8')).toMatch(/agent: join\(here, 'agent\/index\.html'\)/);
  });

  it('AX-U: the clients\' setup commands, then "Open the Forge or the test room and press Copy connect link."', () => {
    const page = agentSetupPage({ gateway: at });
    document.body.append(page);
    expect(page.querySelectorAll('[data-agent-step]').length, 'no stepper').toBe(0);
    expect(page.textContent).toContain('https://agent.example.com/mcp');
    const picker = page.querySelector<HTMLElement>('[data-agent-client-picker]')!;
    expect(picker.getAttribute('role')).toBe('radiogroup');
    for (const client of ['claude', 'codex', 'desktop', 'other'] as const) {
      picker.querySelector<HTMLInputElement>(`input[value="${client}"]`)!.click();
      const shown = Array.from(page.querySelectorAll('.agent-panel__row code')).map((c) => c.textContent);
      expect(shown, client).toEqual(agentSetupRows(client, at).map((r) => r.text));
      expect(page.querySelector('[data-agent-sign-in]')!.textContent!.length, client).toBeGreaterThan(10);
    }
    expect(page.textContent).toContain('Open the Forge or the test room and press Copy connect link.');
    page.remove();
  });

  it('no invitation, join link, pairing call, code or token in its text or its links', () => {
    const page = agentSetupPage({ gateway: at });
    const text = page.textContent ?? '';
    expect(text).not.toMatch(/agent_pair|invitation|\/join\/|token/i);
    for (const a of Array.from(page.querySelectorAll('a'))) expect(a.getAttribute('href') ?? '').not.toMatch(/invitation|token|join|\?/i);
    expect(page.innerHTML).not.toMatch(/\/join\//);
  });
});

describe('FP-14 fold N1: /agent says Claude Desktop is unmeasured', () => {
  it('choosing Claude Desktop shows the guide\'s words', () => {
    const page = agentSetupPage({ gateway: at });
    document.body.append(page);
    const note = page.querySelector<HTMLElement>('[data-agent-client-note]')!;
    expect(note.hidden).toBe(true);
    page.querySelector<HTMLInputElement>('[data-agent-client-picker] input[value="desktop"]')!.click();
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Claude Desktop: listed, not yet measured.');
    page.remove();
  });
});
