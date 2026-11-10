// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIAGNOSIS_CLASSES, DIAGNOSIS_HINTS, type DiagnosisClass } from '@s2u/forge-agent-protocol';
import { mountAgentPanel, type AgentPanelController, type AgentPanelState } from '../src/agent/panel';
import { AGENT_DIAGNOSIS, AGENT_DOCTOR_ACTIONS, AGENT_HEALTH_WORDS, agentRouteDetails } from '../src/agent/codes';

/** AX-12 (a browser adaptation): the doctor's words, its one action per class, the details, and the health line. */
const ADDRESS = /\b\d{1,3}(\.\d{1,3}){3}\b|[0-9a-f]{1,4}(:[0-9a-f]{0,4}){3,}|candidate:|a=|sdp|token/i;
function rig(health?: () => Promise<'ready' | 'unreachable'>) {
  let state: AgentPanelState = { status: 'idle', target: 'Forge', permissions: [], activity: [] };
  const listeners = new Set<(s: AgentPanelState) => void>();
  const controller: AgentPanelController = {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prepare: vi.fn(async () => 'Connect to my SOCOM 2 Legacy page: https://agent.example.com/join/one'),
    approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(),
    ...(health ? { health: vi.fn(health) } : {}),
  };
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, controller, { copy: async () => {} });
  const q = <T extends Element>(s: string) => host.querySelector(s) as T;
  return { host, controller, panel, q, root: () => q<HTMLElement>('.agent-panel'), update(next: Partial<AgentPanelState>) {
    state = { ...state, ...next }; for (const fn of listeners) fn(state);
  } };
}
afterEach(() => { localStorage.clear(); document.body.replaceChildren(); });

describe('AX-12: the connection doctor in the agent section', () => {
  it('every class has words and exactly one of the three actions', () => {
    const actions = new Set(Object.keys(AGENT_DOCTOR_ACTIONS));
    expect([...actions].sort()).toEqual(['check-service', 'fresh-link', 'retry']);
    expect(AGENT_DOCTOR_ACTIONS).toEqual({
      retry: 'Try again', 'fresh-link': 'Copy a fresh link', 'check-service': 'Check the connection service address',
    });
    for (const c of DIAGNOSIS_CLASSES) {
      expect(AGENT_DIAGNOSIS[c].words.length).toBeGreaterThan(10);
      expect(actions.has(AGENT_DIAGNOSIS[c].action)).toBe(true);
    }
    expect(AGENT_DIAGNOSIS['origin-refused'].action).toBe('check-service');
    expect(AGENT_DIAGNOSIS.expired.action).toBe('fresh-link');
    expect(AGENT_DIAGNOSIS['route-failed'].action).toBe('retry');
  });

  it.each(DIAGNOSIS_CLASSES.map((c) => [c] as [DiagnosisClass]))('%s: its words and its one action in the error area', (cls) => {
    const r = rig();
    r.update({ status: 'error', error: 'The connection service refused this page’s request.', diagnosis: { class: cls } });
    const area = r.q<HTMLElement>('.agent-panel__error');
    expect(area.hidden).toBe(false);
    expect(r.q<HTMLElement>('[data-agent-diagnosis]').textContent).toBe(AGENT_DIAGNOSIS[cls].words);
    const action = r.q<HTMLButtonElement>('[data-agent-retry]');
    expect(action.textContent).toBe(AGENT_DOCTOR_ACTIONS[AGENT_DIAGNOSIS[cls].action]);
    expect(action.dataset.agentAction).toBe(AGENT_DIAGNOSIS[cls].action);
    expect(area.querySelectorAll('button')).toHaveLength(1);
    expect(r.root().dataset.diagnosis).toBe(cls);
    r.panel.dispose();
  });

  it('a service end without an error (revoked, expired) still says why and offers a fresh link', () => {
    const r = rig();
    r.update({ status: 'disconnected', diagnosis: { class: 'revoked' } });
    expect(r.q<HTMLElement>('.agent-panel__error').hidden).toBe(false);
    expect(r.q<HTMLButtonElement>('[data-agent-retry]').textContent).toBe('Copy a fresh link');
    r.update({ status: 'disconnected', diagnosis: undefined });
    expect(r.q<HTMLElement>('.agent-panel__error').hidden).toBe(true);
    r.panel.dispose();
  });

  it('Retry and Copy a fresh link copy again and re-check the service; Check the address opens the setup disclosure', async () => {
    const health = vi.fn(async () => 'ready' as const);
    const r = rig(health);
    await vi.waitFor(() => expect(health).toHaveBeenCalledTimes(1));
    r.update({ status: 'error', error: 'x', diagnosis: { class: 'service-busy' } });
    r.q<HTMLButtonElement>('[data-agent-retry]').click();
    await vi.waitFor(() => expect(r.controller.prepare).toHaveBeenCalledTimes(1));
    expect(health).toHaveBeenCalledTimes(2);
    r.update({ status: 'error', error: 'x', diagnosis: { class: 'origin-refused' } });
    const service = r.q<HTMLDetailsElement>('[data-agent-service]');
    expect(service.open).toBe(false);
    r.q<HTMLButtonElement>('[data-agent-retry]').click();
    expect(service.open).toBe(true);
    expect(document.activeElement).toBe(r.q('[data-agent-gateway]'));
    expect(r.controller.prepare).toHaveBeenCalledTimes(1);
    r.panel.dispose();
  });

  it('route-failed has a details disclosure with the candidate counts, never an address', () => {
    const r = rig();
    r.update({ status: 'error', error: 'x', diagnosis: { class: 'service-busy' } });
    expect(r.q<HTMLElement>('[data-agent-route-details]').hidden).toBe(true);
    const d = { class: 'route-failed' as const, local: { host: 2, srflx: 1, relay: 0 }, remote: { host: 1, srflx: 0, relay: 0 } };
    r.update({ status: 'error', error: 'x', diagnosis: d });
    const details = r.q<HTMLDetailsElement>('[data-agent-route-details]');
    expect(details.hidden).toBe(false);
    expect(details.textContent).toContain(agentRouteDetails(d));
    expect(agentRouteDetails(d)).toMatch(/2 host, 1 srflx, 0 relay/);
    expect(agentRouteDetails(d)).toMatch(/1 host, 0 srflx, 0 relay/);
    expect(agentRouteDetails(d)).toMatch(/relay/i);
    expect(agentRouteDetails({ class: 'route-failed' })).toMatch(/no candidate/i);
    r.panel.dispose();
  });

  it('the Connect moment checks /health once on mount: checking, then ready or unreachable as small print', async () => {
    let answer!: (v: 'ready' | 'unreachable') => void;
    const r = rig(() => new Promise((resolve) => { answer = resolve; }));
    const line = r.q<HTMLElement>('[data-agent-health]');
    expect(line.closest('[data-agent-moment="connect"]')).not.toBeNull();
    expect(line.classList.contains('agent-panel__fine')).toBe(true);
    expect(line.textContent).toBe(AGENT_HEALTH_WORDS.checking);
    expect(r.controller.health).toHaveBeenCalledTimes(1);
    answer('ready');
    await vi.waitFor(() => expect(line.textContent).toBe('Connection service: ready'));
    const down = rig(async () => 'unreachable');
    await vi.waitFor(() => expect(down.q<HTMLElement>('[data-agent-health]').textContent).toBe('Connection service: unreachable'));
    // A controller without a health check shows no line.
    const none = rig();
    expect(none.q<HTMLElement>('[data-agent-health]').hidden).toBe(true);
    r.panel.dispose(); down.panel.dispose(); none.panel.dispose();
  });

  it('a panel folded in a closed details checks /health only once it is first opened (no request on a page load)', async () => {
    // The test room's dock and the Forge's Agent panel are folded `details`: a page that never opens one asks the
    // connection service nothing (a refused GET was a console error on every test-room load, the e2e view at 394ac3273).
    const health = vi.fn(async () => 'unreachable' as const);
    const controller: AgentPanelController = {
      state: () => ({ status: 'idle', target: 'Forge', permissions: [], activity: [] }), subscribe: () => () => undefined,
      prepare: vi.fn(async () => ''), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(), health,
    };
    const dock = document.createElement('details'); document.body.append(dock);
    const panel = mountAgentPanel(dock, controller, { copy: async () => {} });
    await Promise.resolve();
    expect(health).not.toHaveBeenCalled();
    dock.querySelector<HTMLDetailsElement>('[data-agent-service]')!.dispatchEvent(new Event('toggle'));   // an inner fold is not the dock's
    expect(health).not.toHaveBeenCalled();
    dock.open = true; dock.dispatchEvent(new Event('toggle'));
    expect(health).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(dock.querySelector('[data-agent-health]')!.textContent).toBe(AGENT_HEALTH_WORDS.unreachable));
    dock.open = false; dock.dispatchEvent(new Event('toggle')); dock.open = true; dock.dispatchEvent(new Event('toggle'));
    expect(health).toHaveBeenCalledTimes(1);                         // once on the first opening, as once on mount
    panel.dispose();
    // A panel mounted open checks at once, as before.
    const openDock = document.createElement('details'); openDock.open = true; document.body.append(openDock);
    const again = mountAgentPanel(openDock, { ...controller, health: vi.fn(async () => 'ready' as const) }, { copy: async () => {} });
    expect(openDock.querySelector('[data-agent-health]')!.textContent).toBe(AGENT_HEALTH_WORDS.checking);
    again.dispose();
  });

  it('with healthOnShow false the panel asks /health nothing when shown -- only a Retry asks (the dev default loopback)', async () => {
    // viewer.spec.ts "all three extracted maps" at agent/mega 7cd782a5f opens every settings fold, the agent dock among
    // them; the development default's 127.0.0.1:5360, where no connection service runs, refused the GET and the
    // console logged 'Failed to load resource: net::ERR_CONNECTION_REFUSED'. A browser adaptation.
    const health = vi.fn(async () => 'unreachable' as const);
    const controller: AgentPanelController = {
      state: () => ({ status: 'idle', target: 'Forge', permissions: [], activity: [] }), subscribe: () => () => undefined,
      prepare: vi.fn(async () => ''), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(), health,
    };
    const dock = document.createElement('details'); document.body.append(dock);
    const panel = mountAgentPanel(dock, controller, { copy: async () => {}, healthOnShow: false });
    dock.open = true; dock.dispatchEvent(new Event('toggle'));
    await Promise.resolve();
    expect(health).not.toHaveBeenCalled();
    expect(dock.querySelector<HTMLElement>('[data-agent-health]')!.hidden).toBe(true);
    panel.dispose();
    const open = document.createElement('div'); document.body.append(open);
    const shown = mountAgentPanel(open, controller, { copy: async () => {}, healthOnShow: false });
    await Promise.resolve();
    expect(health).not.toHaveBeenCalled();                           // mounted shown: no check either
    shown.dispose();
  });

  it('no address, token or SDP in any of the doctor’s text', () => {
    const texts = [
      ...DIAGNOSIS_CLASSES.map((c) => AGENT_DIAGNOSIS[c].words),
      ...DIAGNOSIS_CLASSES.map((c) => DIAGNOSIS_HINTS[c]),
      ...Object.values(AGENT_DOCTOR_ACTIONS),
      ...Object.values(AGENT_HEALTH_WORDS),
      agentRouteDetails({ class: 'route-failed', local: { host: 3, srflx: 2, relay: 1 }, remote: { host: 9, srflx: 9, relay: 9 } }),
      agentRouteDetails({ class: 'route-failed' }),
    ];
    for (const t of texts) expect(t).not.toMatch(ADDRESS);
  });
});
