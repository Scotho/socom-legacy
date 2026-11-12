// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentConnectionSettings, agentGatewaySource } from '../src/agent/install';
import { mountAgentPanel, type AgentPanelController, type AgentPanelState } from '../src/agent/panel';
import { AGENT_GATEWAY_KEY, agentHealthOnShow } from '../src/agent/setup';
import { PAGE_SETTING_KEYS, pageSettings } from '../src/pageStore';
import { StoreError } from '@s2u/card';

/**
 * LATER 423 (fixed by FP-14; a browser adaptation, FG.R2): the gateway's address is the build's VITE_S2U_AGENT_URL, else
 * the page's own setting (step 1's "Connection service" field, held to the connection's URL rule), else the loopback in
 * development, else the page's origin.
 */
const page = { location: { origin: 'https://nightly.socom2legacy.com' } } as unknown as Document;
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.body.replaceChildren(); });

describe('LATER 423: the gateway address from the page, not only the build', () => {
  it('the order: the build, then the page setting, then the loopback in development, then the origin', () => {
    expect(agentConnectionSettings(page, { VITE_S2U_AGENT_URL: 'https://built.example.com', DEV: false }, 'https://saved.example.com').gateway).toBe('https://built.example.com');
    expect(agentConnectionSettings(page, { DEV: true }, 'https://saved.example.com').gateway).toBe('https://saved.example.com');
    expect(agentConnectionSettings(page, { DEV: true }, null).gateway).toBe('http://127.0.0.1:5360');
    expect(agentConnectionSettings(page, { DEV: false }, null).gateway).toBe('https://nightly.socom2legacy.com');
    expect(agentGatewaySource({ VITE_S2U_AGENT_URL: 'https://b.example.com' }, 'https://s.example.com')).toBe('build');
    expect(agentGatewaySource({}, 'https://s.example.com')).toBe('page');
    expect(agentGatewaySource({}, null)).toBe('default');
  });

  it('the panel checks /health when shown, except at the development default loopback (no service set there)', () => {
    // viewer.spec.ts at agent/mega 7cd782a5f: a refused GET of 127.0.0.1:5360/health is a console error on a page
    // where nobody runs the optional connection service. A browser adaptation.
    expect(agentHealthOnShow({ DEV: true }, null)).toBe(false);
    expect(agentHealthOnShow({ DEV: true }, 'https://saved.example.com')).toBe(true);
    expect(agentHealthOnShow({ DEV: true, VITE_S2U_AGENT_URL: 'https://b.example.com' }, null)).toBe(true);
    expect(agentHealthOnShow({ DEV: false }, null)).toBe(true);       // a release's default is the page's own origin
  });

  it('a stored address the URL rule refuses is ignored', () => {
    expect(agentConnectionSettings(page, { DEV: false }, 'http://evil.example.com').gateway).toBe('https://nightly.socom2legacy.com');
    expect(agentGatewaySource({}, 'http://evil.example.com')).toBe('default');
  });

  it('the default reads the page setting from its key, which is in the inventory', () => {
    expect(PAGE_SETTING_KEYS).toContain(AGENT_GATEWAY_KEY);
    localStorage.setItem(AGENT_GATEWAY_KEY, 'https://saved.example.com');
    expect(agentConnectionSettings(page, { DEV: false }).gateway).toBe('https://saved.example.com');
  });

  function panel(source: 'build' | 'page' | 'default') {
    const state: AgentPanelState = { status: 'idle', target: 'Forge', permissions: [], activity: [] };
    const controller: AgentPanelController = { state: () => state, subscribe: () => () => undefined, prepare: vi.fn(), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn() };
    const host = document.createElement('div'); document.body.append(host);
    mountAgentPanel(host, controller, { gateway: 'https://agent.example.com', gatewaySource: source, copy: async () => {} });
    return { host, field: host.querySelector<HTMLInputElement>('input[data-agent-gateway]')!, save: host.querySelector<HTMLButtonElement>('[data-agent-gateway-save]')! };
  }

  it('the Connect moment\'s "Connection service" field saves a valid address and refuses an invalid one, naming the stage', () => {
    const r = panel('default');
    // AX-U: folded under the Connect moment's "Connection service" disclosure (the stepper's step 1 is gone).
    expect(r.field.closest('details')!.dataset['agentService']).toBe('');
    expect(r.field.closest<HTMLElement>('[data-agent-moment]')!.dataset['agentMoment']).toBe('connect');
    expect(r.field.value).toBe('https://agent.example.com');
    r.field.value = 'http://far.example.com'; r.save.click();
    expect(localStorage.getItem(AGENT_GATEWAY_KEY)).toBeNull();
    expect(r.host.querySelector('[data-agent-gateway-note]')!.textContent).toMatch(/^Connect failed: The connection service must use HTTPS/);
    r.field.value = 'https://far.example.com/mcp'; r.save.click();
    expect(localStorage.getItem(AGENT_GATEWAY_KEY)).toBe('https://far.example.com');
    expect(r.host.querySelector('[data-agent-gateway-note]')!.textContent).toContain('Reload this page');
  });

  it('PR #760 P2: a write or removal the browser refuses says "Connect failed", not the reload confirmation', () => {
    const r = panel('default');
    const note = () => r.host.querySelector('[data-agent-gateway-note]')!.textContent;
    const set = vi.spyOn(pageSettings, 'set').mockReturnValue({ ok: false, error: new StoreError('quota', 'write', AGENT_GATEWAY_KEY) });
    r.field.value = 'https://far.example.com'; r.save.click();
    expect(set).toHaveBeenCalledWith(AGENT_GATEWAY_KEY, 'https://far.example.com');
    expect(note()).toMatch(/^Connect failed: /); expect(note()).not.toContain('Reload this page');
    const remove = vi.spyOn(pageSettings, 'remove').mockReturnValue({ ok: false, error: new StoreError('unavailable', 'delete', AGENT_GATEWAY_KEY) });
    r.field.value = ''; r.save.click();
    expect(remove).toHaveBeenCalledWith(AGENT_GATEWAY_KEY);
    expect(note()).toMatch(/^Connect failed: /); expect(note()).not.toContain('Reload this page');
  });

  it('an empty field clears the setting; a build\'s address is shown and not editable', () => {
    localStorage.setItem(AGENT_GATEWAY_KEY, 'https://far.example.com');
    const r = panel('page');
    r.field.value = ''; r.save.click();
    expect(localStorage.getItem(AGENT_GATEWAY_KEY)).toBeNull();
    document.body.replaceChildren();
    const b = panel('build');
    expect(b.field.disabled).toBe(true); expect(b.save.disabled).toBe(true);
    expect(b.host.querySelector('[data-agent-gateway-note]')!.textContent).toContain('set by this build');
  });
});
