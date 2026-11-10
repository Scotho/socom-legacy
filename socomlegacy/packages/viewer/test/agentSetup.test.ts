// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_CLIENTS, AGENT_CONNECT_LINE_PREFIX, AGENT_GUIDE_URL_ADAPTATION, AGENT_PAIRED_CLIENTS_KEY, AGENT_STAGES, agentClientPaired, agentEndpoint,
  agentGuideLine, agentJoinLink, agentSetupRows, agentStageError, agentStageFor, lastPairedAgentClient, pairingInvitation, pairingText,
  rememberAgentClientPaired,
} from '../src/agent/setup';
import { agentSetupPage } from '../src/agent/setupPage';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

/**
 * MC-12's test (the Forge agent plan, `docs/plans/2026-10-24-forge-agent-webrtc.md` MC-12; built by FP-14, FP.R10;
 * reworked by AX-U, AX.R2/C6; a browser adaptation, FG.R2): the exact client commands and endpoint per client, the one
 * copied line, that a public link carries no invitation or token, the three moments' names, and that an error names the
 * stage that failed.
 */
const at = 'https://agent.socom2legacy.com';
const endpoint = 'https://agent.socom2legacy.com/mcp';
afterEach(() => localStorage.clear());

describe('MC-12: the connection setup', () => {
  it('the four clients, in order, with their agent pages', () => {
    expect(AGENT_CLIENTS.map((c) => [c.id, c.label])).toEqual([['claude', 'Claude Code'], ['codex', 'Codex'], ['desktop', 'Claude Desktop'], ['other', 'Another MCP client']]);
    expect(AGENT_CLIENTS.map((c) => agentGuideLine(c.id))).toEqual(['claude-code', 'codex', 'claude-desktop', 'other']
      .map((slug) => `Agent: read ${AGENT_GUIDE_URL_ADAPTATION}/connect/${slug}`));
  });

  it('the exact commands and endpoint per client', () => {
    expect(agentEndpoint(at)).toBe(endpoint);
    expect(agentEndpoint(`${at}/mcp`)).toBe(endpoint);
    expect(agentSetupRows('claude', at).map((r) => r.text)).toEqual([
      `claude mcp add --transport http --scope user socom2legacy ${endpoint}`,
      `claude mcp add --transport http --scope local socom2legacy ${endpoint}`]);
    expect(agentSetupRows('codex', at).map((r) => r.text)).toEqual([`codex mcp add socom2legacy --url ${endpoint}\ncodex mcp login socom2legacy`]);
    const desktop = agentSetupRows('desktop', at);
    expect(desktop.map((r) => r.caption)).toEqual(['claude_desktop_config.json']);
    expect(JSON.parse(desktop[0]!.text)).toEqual({ mcpServers: { socom2legacy: { command: 'npx', args: ['-y', 'mcp-remote', endpoint] } } });
    expect(agentSetupRows('other', at).map((r) => r.text)).toEqual([endpoint]);
  });

  it('the endpoint is held to the connection\'s URL rule', () => {
    expect(() => agentEndpoint('http://agent.example.com')).toThrow('HTTPS');
    expect(() => agentEndpoint(`https://u:p${'@'}agent.example.com`)).toThrow('credentials');
    expect(() => agentEndpoint('https://agent.example.com/other')).toThrow('/mcp');
    expect(agentEndpoint('http://127.0.0.1:5360')).toBe('http://127.0.0.1:5360/mcp');
  });

  it('a public link carries no invitation or token: the commands, the agent page and the setup page\'s links', () => {
    for (const c of AGENT_CLIENTS) {
      for (const row of agentSetupRows(c.id, at)) expect(row.text, c.id).not.toMatch(/invitation|token|join|\?/i);
      const guide = agentGuideLine(c.id).replace(/^Agent: read /, '');
      expect(new URL(guide).search, c.id).toBe('');
      expect(new URL(guide).hash, c.id).toBe('');
    }
    const page = agentSetupPage({ gateway: at });
    for (const a of Array.from(page.querySelectorAll('a'))) expect(a.getAttribute('href') ?? '').not.toMatch(/invitation|token|join|\?/i);
  });
});

/** AX-U (AX.R2, C6): the copied text is one line, the same whichever client is chosen, the invitation in the join link. */
describe('AX-U: the one copied line', () => {
  it('the exact line: "Connect to my SOCOM 2 Legacy page: <gateway origin>/join/<invitation>"', () => {
    expect(AGENT_CONNECT_LINE_PREFIX).toBe('Connect to my SOCOM 2 Legacy page: ');
    expect(agentJoinLink(at, 'inv-22-characters-abcd')).toBe(`${at}/join/inv-22-characters-abcd`);
    expect(agentJoinLink(`${at}/mcp`, 'inv-22-characters-abcd')).toBe(`${at}/join/inv-22-characters-abcd`);
    expect(pairingText(at, 'inv-22-characters-abcd')).toBe(`Connect to my SOCOM 2 Legacy page: ${at}/join/inv-22-characters-abcd`);
    expect(pairingText('http://127.0.0.1:5360/mcp', 'a.b:c_d-e')).toBe('Connect to my SOCOM 2 Legacy page: http://127.0.0.1:5360/join/a.b:c_d-e');
  });

  it('one line, no permission words, no "request only", nothing but the link', () => {
    const text = pairingText(at, 'inv-22-characters-abcd');
    expect(text.split('\n')).toHaveLength(1);
    expect(text).not.toMatch(/permission|only|agent_pair|token/i);
  });

  it('an invitation outside the protocol\'s identifier form is refused, never put in a link', () => {
    for (const bad of ['', 'a/b', 'a b', 'a?b', 'a#b', 'x'.repeat(129)]) expect(() => agentJoinLink(at, bad), JSON.stringify(bad)).toThrow();
    expect(() => agentJoinLink('http://example.com', 'abc')).toThrow('HTTPS');
  });

  it('the invitation is read back from a copied line, and from nothing else', () => {
    expect(pairingInvitation(pairingText(at, 'inv-22-characters-abcd'))).toBe('inv-22-characters-abcd');
    expect(pairingInvitation(`${at}/join/abc`)).toBe('abc');
    expect(pairingInvitation('Use agent_pair with invitation "abc"')).toBeNull();
    expect(pairingInvitation(`${at}/join/abc?x=1`)).toBeNull();
    expect(pairingInvitation('nothing here')).toBeNull();
  });
});

describe('AX-U: the three moments and their errors', () => {
  it('the moments\' names, in order', () => {
    expect(AGENT_STAGES.map((s) => [s.id, s.title])).toEqual([['connect', 'Connect'], ['allow', 'Allow'], ['connected', 'Connected']]);
  });

  it('each state names its moment; an error names the moment it came from', () => {
    expect(agentStageFor('idle')).toBe('connect');
    expect(agentStageFor('creating')).toBe('connect');
    expect(agentStageFor('waiting')).toBe('connect');
    expect(agentStageFor('disconnected')).toBe('connect');
    expect(agentStageFor('approval')).toBe('allow');
    expect(agentStageFor('connecting')).toBe('connected');
    expect(agentStageFor('connected')).toBe('connected');
    expect(agentStageFor('paused')).toBe('connected');
    expect(agentStageFor('error', 'creating')).toBe('connect');
    expect(agentStageFor('error', 'waiting')).toBe('connect');
    expect(agentStageFor('error', 'approval')).toBe('allow');
    expect(agentStageFor('error', 'connecting')).toBe('connected');
    expect(agentStageFor('error', 'connected')).toBe('connected');
    expect(agentStageFor('error', 'paused')).toBe('connected');
  });

  it('an error names the stage that failed', () => {
    expect(agentStageError('connect', 'The connection service is not hosted for this page yet.')).toBe('Connect failed: The connection service is not hosted for this page yet.');
    expect(agentStageError('allow', 'x')).toBe('Approval failed: x');
    expect(agentStageError('connected', 'x')).toBe('Connection lost: x');
  });
});

/** AX-U: the "First time with <client>?" disclosure's per-viewer flag, in the page's inventory, right without storage. */
describe('AX-U: the paired-clients flag', () => {
  it('a client is new until this browser has paired it once; the last paired one is remembered', () => {
    expect(PAGE_SETTING_KEYS).toContain(AGENT_PAIRED_CLIENTS_KEY);
    expect(AGENT_PAIRED_CLIENTS_KEY).toBe('forge.agent.pairedClients');
    expect(agentClientPaired('codex')).toBe(false);
    expect(lastPairedAgentClient()).toBeNull();
    rememberAgentClientPaired('codex');
    expect(agentClientPaired('codex')).toBe(true);
    expect(agentClientPaired('claude')).toBe(false);
    expect(lastPairedAgentClient()).toBe('codex');
    rememberAgentClientPaired('claude');
    rememberAgentClientPaired('codex');
    expect(localStorage.getItem(AGENT_PAIRED_CLIENTS_KEY)).toBe('codex,claude');
    expect(lastPairedAgentClient()).toBe('codex');
  });

  it('a stored value it does not know is ignored', () => {
    localStorage.setItem(AGENT_PAIRED_CLIENTS_KEY, 'evil,<b>,codex');
    expect(agentClientPaired('codex')).toBe(true);
    expect(lastPairedAgentClient()).toBe('codex');
    rememberAgentClientPaired('desktop');
    expect(localStorage.getItem(AGENT_PAIRED_CLIENTS_KEY)).toBe('desktop,codex');
  });

  it('is right without browser storage', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      expect(agentClientPaired('codex')).toBe(false);
      expect(() => rememberAgentClientPaired('codex')).not.toThrow();
      expect(lastPairedAgentClient()).toBeNull();
    } finally { Object.defineProperty(window, 'localStorage', real); }
  });
});
