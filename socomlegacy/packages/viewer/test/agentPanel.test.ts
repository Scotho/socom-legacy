// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { mountAgentPanel, type AgentPanelController, type AgentPanelOptions, type AgentPanelState } from '../src/agent/panel';
import { AGENT_ACTIVITY_LIMIT, connectionNotes, createAgentActivity, observeTarget } from '../src/agent/activity';
import { AGENT_CODE_WORDS, agentCodeKnown, agentCodeWords } from '../src/agent/codes';
import type { PageAgentTarget } from '../src/agent/connection';
import type { AgentRequest } from '@s2u/forge-agent-protocol';

function rig(options: Omit<AgentPanelOptions, 'copy'> = {}) {
  let state: AgentPanelState = { status: 'idle', target: 'Forge', permissions: ['inspect'], activity: [] };
  const listeners = new Set<(s: AgentPanelState) => void>();
  const copy = vi.fn(async (_text: string) => {});
  const controller: AgentPanelController = {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prepare: vi.fn(async () => 'Connect to this Forge page with invitation one-time-code.'),
    approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(),
  };
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, controller, { copy, ...options });
  return { host, controller, copy, panel, listeners, update(next: Partial<AgentPanelState>) {
    state = { ...state, ...next }; for (const fn of listeners) fn(state);
  } };
}

describe('agent connection panel', () => {
  it('prepares and copies instructions for the selected client with one action', async () => {
    const r = rig();
    const client = r.host.querySelector('select')!; client.value = 'codex'; client.dispatchEvent(new Event('change'));
    (r.host.querySelector('[data-agent-copy]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(r.copy).toHaveBeenCalledOnce());
    expect(r.controller.prepare).toHaveBeenCalledWith('codex');
    expect(r.copy).toHaveBeenCalledWith('Connect to this Forge page with invitation one-time-code.');
    expect(r.host.textContent).toContain('Copied');
    r.panel.dispose();
  });

  it('requires a visible page approval and grants only selected requested permissions', () => {
    const r = rig();
    r.update({ status: 'approval', pending: { clientName: '<img src=x>', comparisonCode: '428193', permissions: ['inspect', 'edit', 'capture'] } });
    expect(r.host.querySelector('img')).toBeNull();
    expect(r.host.textContent).toContain('428193');
    const capture = r.host.querySelector('input[value="capture"]') as HTMLInputElement;
    expect(capture.checked).toBe(false);
    (r.host.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenCalledWith(['inspect']);
    r.panel.dispose();
  });

  it('always exposes disconnect while paired and bounds recent visual activity', () => {
    const r = rig();
    r.update({ status: 'connected', activity: Array.from({ length: 30 }, (_, i) => ({ text: `Edit ${i}`, kind: 'success' as const })) });
    expect(r.host.querySelectorAll('[data-agent-activity] li').length).toBeLessThanOrEqual(8);
    (r.host.querySelector('[data-agent-disconnect]') as HTMLButtonElement).click();
    expect(r.controller.disconnect).toHaveBeenCalledOnce();
    expect(r.host.querySelector('[role="status"]')).not.toBeNull();
    r.panel.dispose(); expect(r.listeners.size).toBe(0); expect(r.host.children.length).toBe(0);
  });

  it('shows usable manual instructions when clipboard permission is unavailable', async () => {
    const r = rig(); r.copy.mockRejectedValueOnce(new Error('denied'));
    (r.host.querySelector('[data-agent-copy]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect((r.host.querySelector('textarea') as HTMLTextAreaElement).hidden).toBe(false));
    expect((r.host.querySelector('textarea') as HTMLTextAreaElement).value).toContain('one-time-code');
    expect(r.host.textContent).toContain('Select and copy'); r.panel.dispose();
  });
});

/**
 * FUI-4 (the review's AI-3's words and AI-15's store; a browser adaptation, FG.R2): the dock's activity feed reads one
 * typed store (`agent/activity.ts`) and one table of the protocol's codes (`agent/codes.ts`): a person reads a sentence,
 * never `REVISION_CONFLICT`. FUI-11 builds the rest of the dock on them.
 */
const here = dirname(fileURLToPath(import.meta.url));
const request = (operation: string, requestId = 'r1'): AgentRequest =>
  ({ version: 1, requestId, sessionId: 's', targetId: 't', epoch: 'e', operation, args: {} });

describe('the agent dock\'s activity and its codes (FUI-4)', () => {
  it('the dock\'s activity feed reads the code table: a refusal\'s words, never the bare code', () => {
    const activity = createAgentActivity();
    activity.result('forge.edit', { outcome: 'refused', code: 'REVISION_CONFLICT' });
    const r = rig({ activity });
    r.update({ status: 'connected' });
    const row = r.host.querySelector<HTMLElement>('[data-agent-activity] li')!;
    expect(row.textContent).toContain(AGENT_CODE_WORDS['REVISION_CONFLICT']);
    expect(row.textContent).not.toContain('REVISION_CONFLICT');
    expect(row.dataset['agentCode']).toBe('REVISION_CONFLICT');
    expect(row.className).toBe('agent-panel__activity-error');
    activity.result('forge.edit', { outcome: 'refused', code: 'STALE_REVISION' });
    const newest = r.host.querySelector<HTMLElement>('[data-agent-activity] li')!;
    expect(newest.textContent, 'the two conflict codes read one sentence (AI-15)').toContain(AGENT_CODE_WORDS['REVISION_CONFLICT']);
    expect(agentCodeWords('STALE_REVISION')).toBe(agentCodeWords('REVISION_CONFLICT'));
    expect(agentCodeWords('NO_SUCH_CODE'), 'an unlisted code still reads a sentence').toMatch(/^The page refused the request \(NO_SUCH_CODE\)\.$/);
    r.panel.dispose();
    activity.note('After the dock is gone');
    expect(r.host.children.length).toBe(0);
  });

  const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
  it('every code the agent\'s sources send has words in the table', () => {
    const files = ['../../forge-agent-protocol/src/index.ts', '../src/agent/connection.ts', '../src/agent/forgeTarget.ts', '../src/agent/localPacks.ts',
      '../src/agent/localFiles.ts', '../src/forge/agent/api.ts', '../src/forge/agent/commands.ts', '../src/forge/agent/play.ts'];
    const codes = new Set<string>();
    for (const f of files) {
      const text = readFileSync(resolve(here, f), 'utf8');
      // R3-A (6): single-word codes too (LOCKED, REFUSED, BUSY ...); an HTTP method is not a code.
      for (const m of text.matchAll(/["']([A-Z][A-Z0-9_]+[A-Z0-9])["']/g)) if (!m[1]!.startsWith('VITE_') && !HTTP_METHODS.has(m[1]!)) codes.add(m[1]!);
    }
    for (const single of ['LOCKED', 'REFUSED', 'UNSUPPORTED', 'BUSY', 'REVOKED']) expect(codes, single).toContain(single);
    expect(codes.size).toBeGreaterThan(40);
    expect([...codes].filter((c) => !agentCodeKnown(c))).toEqual([]);
  });

  it('a store of about fifty typed entries: reads merged, the dock showing the newest eight', () => {
    const activity = createAgentActivity();
    activity.result('forge.read', { outcome: 'ok' });
    activity.result('forge.read', { outcome: 'ok' });
    activity.result('forge.read', { outcome: 'ok' });
    expect(activity.entries()).toHaveLength(1);
    expect(activity.entries()[0]!.count).toBe(3);
    activity.result('forge.edit', { outcome: 'ok' });
    activity.result('forge.read', { outcome: 'ok' });
    expect(activity.entries()).toHaveLength(3);
    for (let i = 0; i < 70; i++) activity.result('forge.edit', { outcome: 'ok' });
    expect(activity.entries()).toHaveLength(AGENT_ACTIVITY_LIMIT);
    const r = rig({ activity });
    expect(r.host.querySelectorAll('[data-agent-activity] li').length).toBe(8);
    r.panel.dispose();
  });

  it('the target observed: acting while a request is in flight, its result kept with its code', async () => {
    const activity = createAgentActivity();
    let finish!: (code?: string) => void;
    const target: PageAgentTarget = {
      read: () => ({ surface: 'forge-editor', revision: 3, name: 'Forge', build: 'b' }),
      dispatch: (req) => new Promise((done) => { finish = (code) => done({ requestId: req.requestId, revision: 3, outcome: code ? 'refused' : 'ok', ...(code ? { code } : {}) }); }),
    };
    const watched = observeTarget(target, activity);
    const heard = vi.fn();
    activity.subscribe(heard);
    const pending = watched.dispatch(request('forge.edit'), new AbortController().signal);
    expect(activity.acting()).toBe(true);
    finish('PERMISSION_REQUIRED');
    expect((await pending).code).toBe('PERMISSION_REQUIRED');
    expect(activity.acting()).toBe(false);
    expect(activity.entries().at(-1)).toMatchObject({ operation: 'forge.edit', code: 'PERMISSION_REQUIRED', kind: 'error' });
    expect(activity.entries().at(-1)!.text).toContain(AGENT_CODE_WORDS['PERMISSION_REQUIRED']);
    expect(heard).toHaveBeenCalled();
    expect(watched.read().revision).toBe(3);
  });

  it('the connection\'s own lines join the store once each; its per-request lines are the store\'s typed rows instead', () => {
    const activity = createAgentActivity();
    const ingest = connectionNotes(activity);
    const connected = { text: 'Connected to this page. You are in control.', kind: 'info' as const };
    const result = { text: 'Updated map: needs attention', kind: 'error' as const };
    ingest([connected]);
    ingest([connected, result]);
    expect(activity.entries().map((e) => e.text)).toEqual(['Connected to this page. You are in control.']);
    // R3-A (5): a line the target answered (`routed`) is the store's typed row already; one refused before it is recorded,
    // typed, with its code -- never dropped.
    const routed = { text: 'Updated map: needs attention', kind: 'error' as const, request: { operation: 'forge.edit', outcome: 'refused' as const, code: 'REVISION_CONFLICT', routed: true } };
    const denied = { text: 'Updated map: needs attention', kind: 'error' as const, request: { operation: 'forge.edit', outcome: 'refused' as const, code: 'PERMISSION_DENIED', routed: false } };
    ingest([connected, result, routed, denied]);
    expect(activity.entries().slice(1)).toEqual([expect.objectContaining({ kind: 'error', operation: 'forge.edit', code: 'PERMISSION_DENIED' })]);
    expect(activity.entries()[1]!.text).toContain(AGENT_CODE_WORDS['PERMISSION_DENIED']);
  });

  it('R5-B: while an agent camera shot runs the agent chip says "Camera shot" with the action "Stop camera"', async () => {
    const { forgeAgentPanel } = await import('../src/agent/install');
    const { createLocalPackApi } = await import('../src/agent/localPacks');
    let running = false;
    const stopShot = vi.fn(() => { const was = running; running = false; return was ? 'shot-1' : null; });
    const forge = { read: () => ({}), status: () => ({ ready: true, mode: 'forge-editor', revision: 0, viewRevision: 0, name: 'Forge', map: null }),
      execute: vi.fn(), subscribe: () => () => undefined, resetSession: vi.fn(), refreshExternalState: vi.fn(), dispose: vi.fn(),
      shotRunning: () => running, stopShot };
    let chip: { text(): string | null; tone(): string; action?: () => { label: string; run(): void } | null } | null = null;
    const abort = new AbortController();
    const ctx = { doc: document, forge, signal: abort.signal, ui: {
      reveal: vi.fn(), notify: vi.fn(),
      registerStatusChip: (spec: NonNullable<typeof chip>) => { chip = spec; return { update: () => undefined, remove: () => undefined }; },
    } };
    const host = document.createElement('div'); document.body.append(host);
    const packs = createLocalPackApi();
    const instance = forgeAgentPanel({ packs }).mount(host, ctx as never);
    expect(chip).not.toBeNull();
    expect(chip!.text(), 'idle: nothing to say').toBeNull();
    expect(chip!.action?.() ?? null).toBeNull();
    running = true;
    expect(chip!.text()).toBe('Camera shot');
    expect(chip!.tone()).toBe('live');
    const action = chip!.action!()!;
    expect(action.label).toBe('Stop camera');
    action.run();
    expect(stopShot).toHaveBeenCalledOnce();
    expect(chip!.text()).toBeNull();
    instance.dispose?.();
    abort.abort();
    host.remove();
  });
});

// FUI-25 (FUI.R25; a browser adaptation, the agent dock has no original): the grant panel shows every permission.
describe('agent grant panel lists every permission (FUI-25)', () => {
  const ALL = ['inspect', 'edit', 'import', 'test', 'diagnose', 'capture'];
  const NAMES = ['Read this session', 'Edit the map', 'Import local packs', 'Run tests', 'Read diagnostics', 'See the game canvas'];
  const pending = { clientName: 'Claude', comparisonCode: '111222', permissions: ['inspect', 'edit'] as AgentPanelState['permissions'] };
  const rows = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('.agent-panel__permissions .agent-panel__permission'));
  const toggle = (host: HTMLElement) => host.querySelector('input[data-agent-short-form]') as HTMLInputElement;

  it('keeps the labels list covering the AgentPermission union (a new permission fails here until it has its row)', async () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/agent/panel.ts'), 'utf8');
    const union = /export type AgentPermission = ([^;]+);/.exec(src)![1]!.split('|').map(s => s.trim().replace(/'/g, ''));
    const { AGENT_PERMISSIONS, PERMISSION_LABELS } = await import('../src/agent/panel');
    expect([...AGENT_PERMISSIONS]).toEqual(union);
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...union].sort());
    expect([...AGENT_PERMISSIONS]).toEqual(ALL);
  });

  it('lists all six by label in the fixed order for a request of inspect and edit only, with each row saying what it is', () => {
    localStorage.clear();
    const r = rig(); r.update({ status: 'approval', pending });
    const list = rows(r.host);
    expect(list.map(row => row.dataset.permission)).toEqual(ALL);
    list.forEach((row, i) => expect(row.textContent).toContain(NAMES[i]!));
    const state = (name: string) => rows(r.host).find(row => row.dataset.permission === name)!.querySelector('.agent-panel__permission-state')!.textContent;
    expect(state('inspect')).toContain('Requested'); expect(state('edit')).toContain('Requested');
    for (const name of ['import', 'test', 'diagnose', 'capture']) {
      expect(state(name)).toBe('Not requested by the agent');
      const box = r.host.querySelector(`input[value="${name}"]`) as HTMLInputElement;
      expect(box.disabled).toBe(true); expect(box.checked).toBe(false);
    }
    const inspect = r.host.querySelector('input[value="inspect"]') as HTMLInputElement;
    expect(inspect.checked).toBe(true); expect(inspect.disabled).toBe(false);
    expect(state('inspect')).toContain('will be allowed');
    (r.host.querySelector('input[value="edit"]') as HTMLInputElement).click();
    expect(state('edit')).toContain('will be allowed');
    (r.host.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenCalledWith(['inspect', 'edit']);
    r.panel.dispose();
  });

  it('the short form is a toggle, off by default, that shows only the requested rows and is kept per viewer', () => {
    localStorage.clear();
    const r = rig(); r.update({ status: 'approval', pending });
    expect(toggle(r.host).checked).toBe(false);
    expect(r.host.textContent).toContain('Show only what the agent asked for');
    expect(rows(r.host).every(row => !row.hidden)).toBe(true);
    toggle(r.host).click();
    expect(rows(r.host).filter(row => !row.hidden).map(row => row.dataset.permission)).toEqual(['inspect', 'edit']);
    r.panel.dispose();
    const again = rig(); again.update({ status: 'approval', pending });
    expect(toggle(again.host).checked).toBe(true);
    expect(rows(again.host).filter(row => !row.hidden).length).toBe(2);
    toggle(again.host).click();
    expect(rows(again.host).filter(row => !row.hidden).length).toBe(6);
    again.panel.dispose(); localStorage.clear();
  });

  it('is right without browser storage', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      const r = rig(); r.update({ status: 'approval', pending });
      expect(rows(r.host).length).toBe(6);
      toggle(r.host).click();
      expect(rows(r.host).filter(row => !row.hidden).length).toBe(2);
      r.panel.dispose();
    } finally { Object.defineProperty(window, 'localStorage', real); }
  });

  it('the connected state shows every permission as granted or not granted', () => {
    localStorage.clear();
    const r = rig(); r.update({ status: 'connected', pending: undefined, permissions: ['inspect', 'edit'] });
    const list = Array.from(r.host.querySelectorAll<HTMLElement>('.agent-panel__granted li'));
    expect(list.map(li => li.dataset.permission)).toEqual(ALL);
    expect(list.map(li => li.dataset.granted)).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
    expect(list[0]!.textContent).toContain('Read this session'); expect(list[0]!.textContent).toContain('Granted');
    expect(list[5]!.textContent).toContain('Not granted');
    expect(r.host.querySelector<HTMLElement>('.agent-panel__granted')!.hidden).toBe(false);
    r.update({ status: 'idle', permissions: [] });
    expect(r.host.querySelector<HTMLElement>('.agent-panel__granted')!.hidden).toBe(true);
    r.panel.dispose();
  });
});
