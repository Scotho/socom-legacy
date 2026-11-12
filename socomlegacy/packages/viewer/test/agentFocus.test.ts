// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRequest } from '@s2u/forge-agent-protocol';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { createTestroomPageTarget } from '../src/agent/testroomTarget';
import { AGENT_FOCUS_LINE, mountAgentPanel, type AgentPanelController, type AgentPanelState } from '../src/agent/panel';
import type { ForgeAgentApi, ForgeAgentFocus, ForgeAgentSnapshot } from '../src/forge/agent/api';
import { createSoloTestroomTarget, type SoloHostState } from '../src/testroom/agent/target';
import type { LocalPackApi } from '../src/agent/localPacks';

/** AX-13 (plan item 13, a browser adaptation): "point at it" -- the page targets' focus reads and the dock's line. */
const signal = new AbortController().signal;

function forgeRig(focus?: () => ForgeAgentFocus | null) {
  const snapshot: ForgeAgentSnapshot = { ready: true, mode: 'forge-editor', revision: 7, layout: null, selection: [], refs: [],
    catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false };
  const api: ForgeAgentApi = { read: () => snapshot, execute: vi.fn(), subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn(),
    status: () => ({ ready: true, mode: snapshot.mode, revision: snapshot.revision, viewRevision: 0, name: 'Forge', map: null }), ...(focus ? { focus } : {}) };
  const target = createForgePageTarget({ api, build: 'test' });
  const request = (operation: string, args: unknown = {}): AgentRequest => ({ version: 1, requestId: `r-${operation}`, sessionId: 's', targetId: 't', epoch: 'e', operation, args });
  return { snapshot, api, target, request };
}

describe('AX-13: forge.focus through the Forge target', () => {
  it('answers the facade\'s focus with its revision', async () => {
    const focus: ForgeAgentFocus = { point: [120, 0, -40], pointAt: 1_700_000_000_000, selection: ['piece:0'], camera: { x: 0, y: 300, z: -400, yaw: 0, pitch: -0.6 }, revision: 7 };
    const r = forgeRig(() => focus);
    const result = await r.target.dispatch(r.request('forge.focus'), signal);
    expect(result).toMatchObject({ outcome: 'ok', revision: 7, data: focus });
    expect(r.api.execute).not.toHaveBeenCalled();
  });
  it('is Build only: in Play it is SURFACE_DENIED; a page without the read is UNSUPPORTED_OPERATION, a blocked read NOT_READY', async () => {
    const r = forgeRig(() => null);
    expect((await r.target.dispatch(r.request('forge.focus'), signal)).code).toBe('NOT_READY');
    r.snapshot.mode = 'forge-play';
    expect((await r.target.dispatch(r.request('forge.focus'), signal)).code).toBe('SURFACE_DENIED');
    const bare = forgeRig();
    expect((await bare.target.dispatch(bare.request('forge.focus'), signal)).code).toBe('UNSUPPORTED_OPERATION');
  });
});

function roomRig(over: Partial<SoloHostState> = {}) {
  const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP72', path: 'MP72.ZAR', name: 'Crossroads', actions: [{ node: 'seal_tent', path: 'world/seal_tent', type: 'MPBOMB', team: 0, at: [100, 0, 0] }],
      destinations: [{ name: 'spawn 0:0', path: 'spawn/0/0', kind: 'spawn', team: 0, feet: [10, 0, 0] }] },
    name: 'guest', pose: { x: 0, y: 50, z: -20, yaw: 1.25, pitch: -0.1 }, feet: [0, 0, 0], equipment: {}, action: {}, plant: null, ...over };
  const api = createSoloTestroomTarget({ state: () => state, maps: () => [], loadMap: vi.fn(), teleport: () => true, setCamera: () => true, equip: () => true, release() {}, now: Date.now });
  const target = createTestroomPageTarget(api, { list: vi.fn(async () => []) } as unknown as LocalPackApi);
  const request = (operation: string): AgentRequest => ({ version: 1, requestId: 'f', sessionId: 's', targetId: 't', epoch: 'e', operation, args: {} });
  return { state, api, target, request };
}

describe('AX-13: testroom.focus through the room target', () => {
  it('answers the player\'s feet and look and the nearest named objective, at the room\'s revision', async () => {
    const r = roomRig();
    const result = await r.target.dispatch(r.request('testroom.focus'), signal);
    expect(result).toMatchObject({ outcome: 'ok', revision: r.api.read().revision, data: {
      map: 'Crossroads', feet: [0, 0, 0], look: { yaw: 1.25, pitch: -0.1 }, camera: { x: 0, y: 50, z: -20, yaw: 1.25, pitch: -0.1 },
      nearest: { name: 'spawn 0:0', kind: 'spawn', team: 0, path: 'spawn/0/0', feet: [10, 0, 0], distance: 10 },
    } });
    r.api.dispose();
  });
  it('measures from the camera when the walker has no feet (fly), and answers no objective on a map without one', async () => {
    const r = roomRig({ feet: null, pose: { x: 100, y: 0, z: 30, yaw: 0, pitch: 0 } });
    expect((await r.target.dispatch(r.request('testroom.focus'), signal)).data).toMatchObject({ feet: null, nearest: { name: 'seal_tent', kind: 'bombsite', distance: 30 } });
    r.state.map = { ...r.state.map!, actions: [], destinations: [] };
    expect((await r.target.dispatch(r.request('testroom.focus'), signal)).data).toMatchObject({ nearest: null });
    r.api.dispose();
  });
});

function panelRig(point: { read: () => readonly [number, number, number] | null; subscribe?: (listener: () => void) => () => void }) {
  let state: AgentPanelState = { status: 'connected', target: 'Forge', permissions: ['inspect', 'edit'], activity: [] };
  const listeners = new Set<(s: AgentPanelState) => void>();
  const controller: AgentPanelController = { state: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prepare: vi.fn(async () => ''), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn() };
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, controller, { lastPoint: point });
  return { host, panel, update(next: Partial<AgentPanelState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); } };
}
afterEach(() => { localStorage.clear(); document.body.replaceChildren(); });

describe('AX-13: the agent section says what the agent can see', () => {
  it('a line in the connected moment, "Your agent can see where you last clicked", with the point rounded', () => {
    let at: readonly [number, number, number] | null = null;
    let tell = (): void => undefined;
    const r = panelRig({ read: () => at, subscribe: (listener) => { tell = listener; return () => { tell = () => undefined; }; } });
    const line = r.host.querySelector('[data-agent-focus]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.hidden).toBe(false);
    expect(line.textContent).toBe(`${AGENT_FOCUS_LINE}.`);
    expect(AGENT_FOCUS_LINE).toBe('Your agent can see where you last clicked');
    at = [120.4, -0.6, -40.5];
    tell();
    expect(line.textContent).toBe(`${AGENT_FOCUS_LINE}: 120, -1, -40.`);
    expect(r.host.querySelector('[data-agent-moment="connected"]')?.contains(line)).toBe(true);
    r.panel.dispose();
  });
  it('hidden while not connected, without inspect, or on a page that shares no point', () => {
    const r = panelRig({ read: () => [1, 2, 3] });
    const line = r.host.querySelector('[data-agent-focus]') as HTMLElement;
    r.update({ permissions: ['edit'] });
    expect(line.hidden).toBe(true);
    r.update({ permissions: ['inspect'], status: 'disconnected' });
    expect(line.hidden).toBe(true);
    r.panel.dispose();
    const host = document.createElement('div'); document.body.append(host);
    const bare = mountAgentPanel(host, { state: () => ({ status: 'connected', target: 'Room', permissions: ['inspect'], activity: [] }), subscribe: () => () => true,
      prepare: vi.fn(async () => ''), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn() });
    expect(host.querySelector('[data-agent-focus]')).toBeNull();
    bare.dispose();
  });
});
