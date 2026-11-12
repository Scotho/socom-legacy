// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_HIDDEN_NOTE, mountAgentPanel, type AgentPanelController, type AgentPanelOptions, type AgentPanelState } from '../src/agent/panel';
import { AGENT_ACTIVITY_LIMIT, connectionNotes, createAgentActivity, observeTarget } from '../src/agent/activity';
import { AGENT_CODE_WORDS, agentCodeKnown, agentCodeWords } from '../src/agent/codes';
import type { PageAgentTarget } from '../src/agent/connection';
import { REFUSAL_HINTS, type AgentRequest } from '@s2u/forge-agent-protocol';

const LINE = 'Connect to my SOCOM 2 Legacy page: https://agent.example.com/join/one-time-code';
/** AX-U: the segmented agent picker is radio buttons; picking one is a click. */
function pick(host: HTMLElement, client: string): void {
  (host.querySelector(`[data-agent-client-picker] input[value="${client}"]`) as HTMLInputElement).click();
}
function rig(options: Omit<AgentPanelOptions, 'copy'> = {}) {
  let state: AgentPanelState = { status: 'idle', target: 'Forge', permissions: ['inspect'], activity: [] };
  const listeners = new Set<(s: AgentPanelState) => void>();
  const copy = vi.fn(async (_text: string) => {});
  const controller: AgentPanelController = {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prepare: vi.fn(async () => LINE),
    approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(),
  };
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, controller, { copy, ...options });
  return { host, controller, copy, panel, listeners, update(next: Partial<AgentPanelState>) {
    state = { ...state, ...next }; for (const fn of listeners) fn(state);
  } };
}

afterEach(() => { localStorage.clear(); document.body.replaceChildren(); });

describe('agent connection panel', () => {
  it('prepares and copies the connect link for the selected client with one action', async () => {
    const r = rig();
    pick(r.host, 'codex');
    (r.host.querySelector('[data-agent-copy]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(r.copy).toHaveBeenCalledOnce());
    expect(r.controller.prepare).toHaveBeenCalledWith('codex');
    expect(r.copy).toHaveBeenCalledWith(LINE);
    expect(r.host.textContent).toContain('Copied');
    r.panel.dispose();
  });

  it('requires a visible page approval and grants every requested permission unless the person opts out', () => {
    const r = rig();
    r.update({ status: 'approval', pending: { clientName: '<img src=x>', comparisonCode: '428193', permissions: ['inspect', 'edit', 'capture'] } });
    expect(r.host.querySelector('img')).toBeNull();
    expect(r.host.textContent).toContain('428193');
    const capture = r.host.querySelector('input[value="capture"]') as HTMLInputElement;
    expect(capture.checked).toBe(true);
    capture.click();
    (r.host.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenCalledWith(['inspect', 'edit']);
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

  it('shows the link to copy by hand when clipboard permission is unavailable, naming the failure', async () => {
    const r = rig(); r.copy.mockRejectedValueOnce(new Error('denied'));
    (r.host.querySelector('[data-agent-copy]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect((r.host.querySelector('textarea') as HTMLTextAreaElement).hidden).toBe(false));
    expect((r.host.querySelector('textarea') as HTMLTextAreaElement).value).toBe(LINE);
    expect(r.host.querySelector('[data-agent-copy]')!.textContent).toMatch(/^Copy failed/);
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

  // AX-8 (AX.R4): the Forge page's target is always the observed one (`install.ts`), so the hidden tab's pause must pass
  // through it -- found beside RC1's SURFACE_DENIED reds (088766214): without it a hidden tab never stopped a scenario.
  it('the target observed passes the hidden tab\'s pause through to the page\'s target', () => {
    const pause = vi.fn();
    const target: PageAgentTarget = {
      read: () => ({ surface: 'forge-play', revision: 3, name: 'Forge', build: 'b' }),
      dispatch: async (req) => ({ requestId: req.requestId, revision: 3, outcome: 'ok' }),
      pause,
    };
    const watched = observeTarget(target, createAgentActivity());
    expect(watched.pause).toBeTypeOf('function');
    watched.pause!('PAGE_HIDDEN');
    expect(pause).toHaveBeenCalledWith('PAGE_HIDDEN');
    expect(observeTarget({ read: target.read, dispatch: target.dispatch }, createAgentActivity()).pause).toBeUndefined();
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


/**
 * AX-U (AX.R2, AX.R3; a browser adaptation, the agent dock has no original): the consent lists every permission; every
 * one the agent asked for is a switch, on by default, the person opting out; one it did not ask for is shown disabled;
 * the comparison code is small print, never a step.
 */
describe('AX-U: Allow -- every requested permission on, plain opt-outs', () => {
  const ALL = ['inspect', 'edit', 'import', 'test', 'diagnose', 'capture'];
  const NAMES = ['Read this session', 'Edit the map', 'Import local packs', 'Run tests', 'Read diagnostics', 'See the game canvas'];
  const pending = { clientName: 'Claude Code', comparisonCode: '111222', permissions: ['inspect', 'edit', 'test'] as AgentPanelState['permissions'] };
  const rows = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('.agent-panel__permissions .agent-panel__permission'));
  const box = (host: HTMLElement, name: string) => host.querySelector(`input[value="${name}"]`) as HTMLInputElement;

  it('keeps the labels list covering the AgentPermission union (a new permission fails here until it has its row)', async () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/agent/panel.ts'), 'utf8');
    const union = /export type AgentPermission = ([^;]+);/.exec(src)![1]!.split('|').map(s => s.trim().replace(/'/g, ''));
    const { AGENT_PERMISSIONS, PERMISSION_LABELS, PERMISSION_DETAILS } = await import('../src/agent/panel');
    expect([...AGENT_PERMISSIONS]).toEqual(union);
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...union].sort());
    expect(Object.keys(PERMISSION_DETAILS).sort()).toEqual([...union].sort());
    expect([...AGENT_PERMISSIONS]).toEqual(ALL);
  });

  // REVIEW-2 14: the person consents knowing what the agent is told -- a picture can move the camera for a framed view
  // and put it back, and it ends a running camera shot (the manual's target.capture, guide PERMISSION_NOTES.capture).
  it('says capture can move the camera for a framed view, puts it back, and ends a running shot, in one short sentence', async () => {
    const { PERMISSION_DETAILS } = await import('../src/agent/panel');
    const words = PERMISSION_DETAILS.capture;
    expect(words).toMatch(/pictures? of the game view/i);
    expect(words).toMatch(/move the camera/i);
    expect(words).toMatch(/puts? it back/i);
    expect(words).toMatch(/camera shot/i);
    expect(words.split(/[.!?](\s|$)/).filter(part => part && part.trim()).length).toBe(1);
    expect(words.length).toBeLessThanOrEqual(120);
    const r = rig(); r.update({ status: 'approval', pending });
    expect(rows(r.host).find(row => row.dataset.permission === 'capture')!.textContent).toContain(words);
    r.panel.dispose();
  });

  it('"<client> wants to connect", the name said to be self-reported', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    const allow = r.host.querySelector<HTMLElement>('[data-agent-moment="allow"]')!;
    expect(allow.hidden).toBe(false);
    expect(allow.querySelector('h3')!.textContent).toBe('Claude Code wants to connect');
    expect(allow.textContent).toMatch(/name is reported by the agent/i);
    r.panel.dispose();
  });

  it('all six listed in the labels\' order, each a labelled switch with what it can do; every requested one on', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    const list = rows(r.host);
    expect(list.map(row => row.dataset.permission)).toEqual(ALL);
    list.forEach((row, i) => {
      expect(row.textContent).toContain(NAMES[i]!);
      expect(row.querySelector('.agent-panel__permission-detail')!.textContent!.length, ALL[i]).toBeGreaterThan(10);
      const input = row.querySelector('input')!;
      expect(input.type).toBe('checkbox');
      expect(input.getAttribute('role')).toBe('switch');
      expect(input.closest('label'), 'the switch is its row\'s label').toBe(row);
    });
    for (const name of ['inspect', 'edit', 'test']) { expect(box(r.host, name).checked, name).toBe(true); expect(box(r.host, name).disabled).toBe(false); }
    r.panel.dispose();
  });

  it('a permission the agent did not request is shown disabled, "Not requested", never offered', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    for (const name of ['import', 'diagnose', 'capture']) {
      expect(box(r.host, name).disabled, name).toBe(true);
      expect(box(r.host, name).checked, name).toBe(false);
      expect(rows(r.host).find(row => row.dataset.permission === name)!.dataset.state).toBe('not-requested');
      expect(rows(r.host).find(row => row.dataset.permission === name)!.textContent).toContain('Not requested');
    }
    (r.host.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenCalledWith(['inspect', 'edit', 'test']);
    r.panel.dispose();
  });

  it('an opt-out removes that one from the approval; switching it back on restores it', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    box(r.host, 'edit').click();
    expect(rows(r.host).find(row => row.dataset.permission === 'edit')!.dataset.state).toBe('off');
    (r.host.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenLastCalledWith(['inspect', 'test']);
    box(r.host, 'edit').click();
    (r.host.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenLastCalledWith(['inspect', 'edit', 'test']);
    r.panel.dispose();
  });

  it('every switch off disables Allow (an approval of nothing is not sent)', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    const allow = r.host.querySelector<HTMLButtonElement>('[data-agent-approve]')!;
    for (const name of ['inspect', 'edit', 'test']) box(r.host, name).click();
    expect(allow.disabled).toBe(true);
    box(r.host, 'test').click();
    expect(allow.disabled).toBe(false);
    r.panel.dispose();
  });

  it('a fresh request starts all on again, whatever the last one was', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    box(r.host, 'edit').click();
    r.update({ status: 'approval', pending: { ...pending, comparisonCode: '333444' } });
    expect(box(r.host, 'edit').checked).toBe(true);
    r.panel.dispose();
  });

  it('the comparison code is small print under the buttons -- "Check: the code <CODE> matches your agent\'s" -- never a step', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    const allow = r.host.querySelector<HTMLElement>('[data-agent-moment="allow"]')!;
    const check = allow.querySelector<HTMLElement>('.agent-panel__comparison')!;
    expect(check.textContent).toBe('Check: the code 111222 matches your agent\'s');
    expect(check.querySelector('[data-agent-comparison-code]')!.textContent).toBe('111222');
    expect(check.classList.contains('agent-panel__fine')).toBe(true);
    const buttons = allow.querySelector('.agent-panel__buttons')!;
    expect(buttons.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING, 'after the buttons').toBeTruthy();
    expect(allow.querySelectorAll('input:not([type="checkbox"]), textarea').length, 'nothing to type or match').toBe(0);
    (allow.querySelector('[data-agent-approve]') as HTMLButtonElement).click();
    expect(r.controller.approve).toHaveBeenCalledOnce();
    r.panel.dispose();
  });

  it('Allow is the primary, Decline the secondary; Decline declines', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    const approve = r.host.querySelector<HTMLButtonElement>('[data-agent-approve]')!;
    const deny = r.host.querySelector<HTMLButtonElement>('[data-agent-deny]')!;
    expect(approve.textContent).toBe('Allow'); expect(approve.classList.contains('agent-panel__primary')).toBe(true);
    expect(deny.textContent).toBe('Decline'); expect(deny.classList.contains('agent-panel__secondary')).toBe(true);
    deny.click(); expect(r.controller.deny).toHaveBeenCalledOnce();
    r.panel.dispose();
  });

  it('no "only what the agent asked for" toggle any more', () => {
    const r = rig(); r.update({ status: 'approval', pending });
    expect(r.host.querySelector('[data-agent-short-form]')).toBeNull();
    expect(r.host.textContent).not.toContain('Show only what the agent asked for');
    r.panel.dispose();
  });
});

/**
 * AX-U (AX.R7, C6; a browser adaptation, FG.R2): one card, three moments -- Connect (pick your agent, first time: its
 * setup line, copy one link), Allow, Connected -- one shown at a time by the connection's state, one primary action each.
 */
describe('AX-U: one card, three moments', () => {
  const moments = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('[data-agent-moment]'));
  const shown = (host: HTMLElement) => moments(host).filter(m => !m.hidden).map(m => m.dataset['agentMoment']);
  const gatewayRig = (options: Omit<AgentPanelOptions, 'copy'> = {}) => rig({ gateway: 'https://agent.example.com', ...options });
  const firstTime = (host: HTMLElement) => host.querySelector<HTMLDetailsElement>('details[data-agent-first-time]')!;

  it('three moments, the stepper gone, Connect shown first with its heading and intro', () => {
    const r = gatewayRig();
    expect(moments(r.host).map(m => m.dataset['agentMoment'])).toEqual(['connect', 'allow', 'connected']);
    expect(r.host.querySelectorAll('details[data-agent-step]').length).toBe(0);
    expect(shown(r.host)).toEqual(['connect']);
    expect(r.host.querySelector('[data-agent-moment="connect"] h3')!.textContent).toBe('Connect an agent');
    expect(r.host.querySelector('[data-agent-moment="connect"] .agent-panel__intro')!.textContent!.length).toBeGreaterThan(10);
    r.panel.dispose();
  });

  it('each state shows its moment, and each moment has one primary action', () => {
    const r = gatewayRig();
    const want: [AgentPanelState['status'], string][] = [['idle', 'connect'], ['creating', 'connect'], ['waiting', 'connect'], ['approval', 'allow'],
      ['connecting', 'connected'], ['connected', 'connected'], ['paused', 'connected'], ['disconnected', 'connect']];
    const onStage = vi.fn();
    r.panel.dispose();
    const s = gatewayRig({ onStage });
    for (const [status, moment] of want) {
      s.update({ status, ...(status === 'approval' ? { pending: { clientName: 'C', comparisonCode: '1', permissions: ['inspect'] } } : { pending: undefined }) });
      expect(shown(s.host), status).toEqual([moment]);
      expect(s.host.querySelector<HTMLElement>('.agent-panel')!.dataset['moment']).toBe(moment);
      const primaries = moments(s.host).find(m => !m.hidden)!.querySelectorAll('.agent-panel__primary');
      expect(primaries.length, `${status}: one primary`).toBeLessThanOrEqual(1);
    }
    expect(onStage.mock.calls.map(c => c[0])).toEqual(['connect', 'allow', 'connected', 'connect']);
    s.panel.dispose();
  });

  it('the agent picker: a compact segmented control of the four clients, keyboard-operable radios with labels', () => {
    const r = gatewayRig();
    const picker = r.host.querySelector<HTMLElement>('[data-agent-client-picker]')!;
    expect(picker.getAttribute('role')).toBe('radiogroup');
    const radios = Array.from(picker.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map(i => i.value)).toEqual(['claude', 'codex', 'desktop', 'other']);
    expect(radios.map(i => i.closest('label')!.textContent)).toEqual(['Claude Code', 'Codex', 'Claude Desktop', 'Another MCP client']);
    expect(new Set(radios.map(i => i.name)).size).toBe(1);
    expect(radios.filter(i => i.checked).map(i => i.value)).toEqual(['claude']);
    r.panel.dispose();
  });

  it('"First time with <client>?" holds that client\'s setup command with its own Copy and the sign-in line', async () => {
    const r = gatewayRig();
    expect(firstTime(r.host).querySelector('summary')!.textContent).toBe('First time with Claude Code?');
    pick(r.host, 'codex');
    expect(firstTime(r.host).querySelector('summary')!.textContent).toBe('First time with Codex?');
    expect(firstTime(r.host).querySelector('[data-agent-sign-in]')!.textContent).toContain('codex mcp login socom2legacy');
    (firstTime(r.host).querySelector('[data-agent-copy-commands]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(r.copy).toHaveBeenCalledOnce());
    expect(r.copy).toHaveBeenCalledWith('codex mcp add socom2legacy --url https://agent.example.com/mcp\ncodex mcp login socom2legacy');
    expect(r.controller.prepare).not.toHaveBeenCalled();
    pick(r.host, 'claude');
    expect(Array.from(firstTime(r.host).querySelectorAll('.agent-panel__row code')).map(c => c.textContent)).toEqual([
      'claude mcp add --transport http --scope user socom2legacy https://agent.example.com/mcp',
      'claude mcp add --transport http --scope local socom2legacy https://agent.example.com/mcp']);
    expect(firstTime(r.host).querySelector('[data-agent-sign-in]')!.textContent).toContain('/mcp');
    pick(r.host, 'desktop');
    expect(firstTime(r.host).querySelector('.agent-panel__row code')!.textContent).toContain('"mcp-remote"');
    expect(firstTime(r.host).textContent).toContain('claude_desktop_config.json');
    const note = firstTime(r.host).querySelector<HTMLElement>('[data-agent-client-note]')!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Claude Desktop: listed, not yet measured.');
    pick(r.host, 'other');
    expect(note.hidden).toBe(true);
    r.panel.dispose();
  });

  it('the disclosure starts open until this browser has paired that client once, then folded', () => {
    const r = gatewayRig();
    expect(firstTime(r.host).open).toBe(true);
    r.update({ status: 'approval', pending: { clientName: 'Claude Code', comparisonCode: '1', permissions: ['inspect'] } });
    r.update({ status: 'connected', pending: undefined, permissions: ['inspect'] });
    expect(localStorage.getItem('forge.agent.pairedClients')).toBe('claude');
    r.panel.dispose();
    const again = gatewayRig();
    expect(firstTime(again.host).open, 'claude paired before: folded').toBe(false);
    pick(again.host, 'codex');
    expect(firstTime(again.host).open, 'codex never paired: open').toBe(true);
    again.panel.dispose();
  });

  it('the picker starts on the client this browser paired last', () => {
    localStorage.setItem('forge.agent.pairedClients', 'codex,claude');
    const r = gatewayRig();
    expect(r.host.querySelector<HTMLInputElement>('[data-agent-client-picker] input:checked')!.value).toBe('codex');
    expect(firstTime(r.host).open).toBe(false);
    r.panel.dispose();
  });

  it('one primary button, "Copy connect link"; after it, the hint naming the client and the countdown', async () => {
    const r = gatewayRig();
    const copy = r.host.querySelector<HTMLButtonElement>('[data-agent-copy]')!;
    expect(copy.textContent).toBe('Copy connect link');
    expect(copy.classList.contains('agent-panel__primary')).toBe(true);
    pick(r.host, 'codex');
    const hint = r.host.querySelector<HTMLElement>('[data-agent-link-hint]')!;
    expect(hint.hidden).toBe(true);
    r.controller.prepare = vi.fn(async () => { r.update({ status: 'waiting', expiresAt: Date.now() + 90_000 }); return LINE; });
    copy.click();
    await vi.waitFor(() => expect(r.copy).toHaveBeenCalledOnce());
    expect(r.copy).toHaveBeenCalledWith(LINE);
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe('Paste it into Codex. You’ll approve here.');
    const timer = r.host.querySelector<HTMLElement>('[data-agent-expiry]')!;
    expect(timer.textContent).toMatch(/1:(29|30)/);
    expect(timer.getAttribute('aria-live')).toBe('off');
    r.update({ status: 'connected', expiresAt: undefined });
    expect(timer.hidden).toBe(true);
    r.panel.dispose();
  });

  it('Connected: the agent\'s name with a live dot, the grants as chips, the activity, the files, Disconnect', () => {
    const r = gatewayRig({ stageFiles: async () => undefined });
    r.update({ status: 'approval', pending: { clientName: 'Claude Code', comparisonCode: '1', permissions: ['inspect', 'edit'] } });
    r.update({ status: 'connected', pending: undefined, permissions: ['inspect', 'edit'], activity: [{ text: 'Read session', kind: 'success' }] });
    const connected = r.host.querySelector<HTMLElement>('[data-agent-moment="connected"]')!;
    expect(connected.querySelector('[data-agent-connected-name]')!.textContent).toBe('Claude Code');
    expect(connected.querySelector('.agent-panel__live')).not.toBeNull();
    const chips = Array.from(connected.querySelectorAll<HTMLElement>('.agent-panel__granted li'));
    expect(chips.map(li => li.dataset.permission)).toEqual(['inspect', 'edit', 'import', 'test', 'diagnose', 'capture']);
    expect(chips.map(li => li.dataset.granted)).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
    expect(chips[0]!.className).toContain('agent-panel__chip');
    expect(chips[0]!.getAttribute('aria-label')).toBe('Read this session: granted');
    expect(chips[5]!.getAttribute('aria-label')).toBe('See the game canvas: not granted');
    expect(connected.querySelector('[data-agent-activity] li')!.textContent).toBe('Read session');
    expect(connected.querySelector('input[type="file"]')).not.toBeNull();
    const disconnect = connected.querySelector<HTMLButtonElement>('[data-agent-disconnect]')!;
    expect(disconnect.textContent).toBe('Disconnect');
    expect(r.host.querySelector('[role="status"]')!.textContent).toContain('Agent connected');
    r.update({ status: 'idle', permissions: [] });
    expect(connected.hidden).toBe(true);
    r.panel.dispose();
  });

  it('an error names its stage, with one retry button that copies a fresh link', async () => {
    const r = gatewayRig();
    r.update({ status: 'waiting' });
    r.update({ status: 'error', error: 'Could not reach the connection service.' });
    const alert = r.host.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.hidden).toBe(false);
    expect(alert.querySelector('.agent-panel__error-text')!.textContent).toBe('Connect failed: Could not reach the connection service.');
    expect(shown(r.host)).toEqual(['connect']);
    const retries = alert.querySelectorAll<HTMLButtonElement>('[data-agent-retry]');
    expect(retries.length).toBe(1);
    retries[0]!.click();
    await vi.waitFor(() => expect(r.controller.prepare).toHaveBeenCalledOnce());
    r.update({ status: 'connected', error: undefined });
    r.update({ status: 'error', error: 'The network route could not be established.' });
    expect(alert.querySelector('.agent-panel__error-text')!.textContent).toMatch(/^Connection lost: /);
    r.update({ status: 'idle', error: undefined });
    expect(alert.hidden).toBe(true);
    r.panel.dispose();
  });

  it('every button names its key, and the card carries its pad prompts -- the d-pad moves, Cross selects', () => {
    const r = gatewayRig();
    for (const b of Array.from(r.host.querySelectorAll<HTMLButtonElement>('button'))) expect(b.title, b.textContent ?? '').toMatch(/ · Enter$/);
    const words = Array.from(r.host.querySelectorAll('ul.s2u-prompts.fx-legend-inline li')).map(li => li.textContent ?? '');
    expect(words.map(w => w.replace(/^.*:/, ''))).toEqual(['Move', 'Select']);
    r.panel.dispose();
  });

  it('the status is announced politely and the countdown is not', () => {
    const r = gatewayRig();
    const status = r.host.querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    const timer = r.host.querySelector('[data-agent-expiry]')!;
    expect(timer.getAttribute('aria-live')).toBe('off');
    expect(timer.closest('[aria-live="polite"]')).toBeNull();
    r.panel.dispose();
  });
});

/** AX-U (AX.R7): the dock's sheet -- tokens only, nothing under 12 px, a visible focus ring, switches that are checkboxes. */
describe('AX-U: the dock\'s design', () => {
  const css = readFileSync(resolve(here, '../src/agent/panel.css'), 'utf8');
  it('nothing under 12 px', () => {
    for (const m of css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(12);
  });
  it('colours are tokens, never raw values', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
  it('the switch is a styled checkbox with a visible focus ring', () => {
    expect(css).toMatch(/\.agent-panel__switch[^{]*\{[^}]*appearance:\s*none/);
    expect(css).toMatch(/\.agent-panel__switch:focus-visible\s*\{[^}]*outline/);
    expect(css).toMatch(/\.agent-panel__segment input:focus-visible[^{]*\{[^}]*outline/);
  });
  it('REVIEW-1 finding 18: type is the --fx-type-* tokens; the raw px sizes left are the ones the header names', () => {
    const raw = [...css.matchAll(/([.\w-]+)\s*\{[^}]*font-size:\s*(\d+)px/g)].map((m) => `${m[1]} ${m[2]}px`);
    expect(raw).toEqual(['.agent-panel__mark 20px', '.agent-panel__manual 12px']);
    expect(css).toMatch(/Raw px type, named: the mark's 20 px glyph and the link box's 12 px/);
    expect(css).not.toMatch(/Tokens only;/);
  });
  it('a self-sufficient base for the test room\'s dock (unstyled by .fx-section): its own background, edge and type', () => {
    expect(css).toMatch(/\.agent-panel\s*\{[^}]*background:[^}]*border:[^}]*font:/);
  });
});

describe('AX-8: a hidden tab in the agent section', () => {
  it('AX-8 (AX.R4): a connected pairing in a hidden tab says it is paused, and says connected again when the tab is back', () => {
    const r = rig(); r.update({ status: 'connected', permissions: ['inspect', 'test'] });
    const root = r.host.querySelector<HTMLElement>('.agent-panel__status')!;
    const said = (): string => root.textContent ?? '';
    expect(said()).toContain('Agent connected');
    r.update({ hidden: true });
    expect(said()).toContain(AGENT_HIDDEN_NOTE);
    // REVIEW-1 finding 15 (AX.R4): nothing resumes by itself -- the player comes back and runs tests again.
    expect(AGENT_HIDDEN_NOTE).toBe('Paused while this tab is hidden: come back to run tests again.');
    r.update({ hidden: false });
    expect(said()).not.toContain(AGENT_HIDDEN_NOTE);
    expect(said()).toContain('Agent connected');
    r.panel.dispose();
  });
  it('AX-8: PAGE_HIDDEN has person words and an agent hint; PAGE_PAUSED stays known for an older page (AX.R8)', () => {
    expect(AGENT_CODE_WORDS['PAGE_HIDDEN']).toBe('Paused while this tab is hidden. Come back to the tab to continue tests.');
    expect(agentCodeKnown('PAGE_PAUSED')).toBe(true);
    expect(REFUSAL_HINTS['PAGE_HIDDEN']).toMatch(/hidden/);
  });
});
