// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAgentPanel, type AgentPanelController, type AgentPanelState } from '../src/agent/panel';
import { AGENT_REMEMBERED_KEY, findRememberedAgent, rememberAgent, rememberedAgents, sameAgent } from '../src/agent/remembered';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

// AX-10 (a browser adaptation, AX.R2): "Remember <client> on this browser" -- a remembered agent's next pairing is one
// explicit Allow with its last grants; the list visible and revocable in the Connect moment.
type Pending = NonNullable<AgentPanelState['pending']>;
const ALL: Pending['permissions'] = ['inspect', 'edit', 'import', 'test', 'diagnose', 'capture'];
const claude = (code: string, extra: Partial<Pending> = {}): Pending =>
  ({ clientName: 'Claude Code', gatewayClientId: 'client-claude', comparisonCode: code, permissions: ALL, ...extra });

function rig() {
  let state: AgentPanelState = { status: 'idle', target: 'Forge', permissions: [], activity: [] };
  const listeners = new Set<(s: AgentPanelState) => void>();
  const controller: AgentPanelController = {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prepare: vi.fn(async () => 'Connect to my SOCOM 2 Legacy page: https://agent.example.com/join/x'),
    approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(),
  };
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, controller, { copy: async () => {} });
  const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
  return {
    host, controller, panel, q,
    update(next: Partial<AgentPanelState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); },
    switchOf: (p: string) => q<HTMLInputElement>(`[data-agent-moment="allow"] input[value="${p}"]`)!,
    allowIsCompact: () => q('[data-agent-moment="allow"]')!.hasAttribute('data-agent-remembered'),
    title: () => q('[data-agent-client-name]')!.textContent,
    clickAllow: () => q<HTMLButtonElement>('[data-agent-approve]')!.click(),
  };
}
/** Pair once with the box ticked and capture switched off, then end that pairing. */
function rememberOnce(r: ReturnType<typeof rig>, pending = claude('AAA111')): void {
  r.update({ status: 'approval', pending });
  r.q<HTMLInputElement>('[data-agent-remember]')!.click();
  r.switchOf('capture').click();
  r.clickAllow();
  r.update({ status: 'connected', pending: undefined, permissions: ['inspect', 'edit', 'import', 'test', 'diagnose'] });
  r.update({ status: 'disconnected', permissions: [] });
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.body.replaceChildren(); });

describe('AX-10 remember this agent', () => {
  it('offers "Remember <client> on this browser", off by default, every permission still on', () => {
    const r = rig();
    r.update({ status: 'approval', pending: claude('AAA111') });
    const box = r.q<HTMLInputElement>('[data-agent-remember]')!;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(false);
    expect(r.q('[data-agent-remember-label]')!.textContent).toBe('Remember Claude Code on this browser');
    for (const p of ALL) expect(r.switchOf(p).checked).toBe(true);
    expect(r.allowIsCompact()).toBe(false);
    // Allow without the box: nothing remembered.
    r.clickAllow();
    expect(r.controller.approve).toHaveBeenCalledWith(ALL);
    expect(rememberedAgents()).toEqual([]);
    expect(localStorage.getItem(AGENT_REMEMBERED_KEY)).toBeNull();
    r.panel.dispose();
  });

  it('remembers the client and its grants, and its next pending shows the compact card with them', () => {
    const r = rig();
    rememberOnce(r);
    expect(r.controller.approve).toHaveBeenLastCalledWith(['inspect', 'edit', 'import', 'test', 'diagnose']);
    const [entry] = rememberedAgents();
    expect(entry).toMatchObject({ clientName: 'Claude Code', gatewayClientId: 'client-claude', grants: ['inspect', 'edit', 'import', 'test', 'diagnose'] });
    expect(typeof entry!.rememberedAt).toBe('number');
    // The next pairing: a fresh pending from the same registered client.
    r.update({ status: 'approval', pending: claude('BBB222') });
    expect(r.allowIsCompact()).toBe(true);
    expect(r.title()).toBe('Claude Code (remembered) wants to connect');
    expect(r.switchOf('capture').checked).toBe(false);
    for (const p of ['inspect', 'edit', 'import', 'test', 'diagnose']) expect(r.switchOf(p).checked).toBe(true);
    // The code stays as small print, and Allow is still one explicit click.
    expect(r.q('[data-agent-comparison-code]')!.textContent).toBe('BBB222');
    expect(r.q<HTMLButtonElement>('[data-agent-approve]')!.hidden).toBe(false);
    r.panel.dispose();
  });

  it('sends no approval for a remembered agent until the person clicks Allow', async () => {
    const r = rig();
    rememberOnce(r);
    vi.mocked(r.controller.approve).mockClear();
    r.update({ status: 'approval', pending: claude('BBB222') });
    await new Promise((done) => setTimeout(done, 20));
    expect(r.allowIsCompact()).toBe(true);
    expect(r.controller.approve).not.toHaveBeenCalled();
    r.clickAllow();
    expect(r.controller.approve).toHaveBeenCalledOnce();
    expect(r.controller.approve).toHaveBeenCalledWith(['inspect', 'edit', 'import', 'test', 'diagnose']);
    r.panel.dispose();
  });

  it('a different client shows the full card -- matched by the gateway client id when present, else by the name', () => {
    const r = rig();
    rememberOnce(r);
    // Another registered client under the same self-reported name: the id decides.
    r.update({ status: 'approval', pending: claude('CCC333', { gatewayClientId: 'someone-else' }) });
    expect(r.allowIsCompact()).toBe(false);
    expect(r.title()).toBe('Claude Code wants to connect');
    expect(r.switchOf('capture').checked).toBe(true);
    // Another name, no id.
    r.update({ status: 'disconnected', pending: undefined });
    r.update({ status: 'approval', pending: { clientName: 'Codex', comparisonCode: 'DDD444', permissions: ALL } });
    expect(r.allowIsCompact()).toBe(false);
    // REVIEW-1 finding 8: the same name with no id on the pending, while the entry carries one -- the name alone is
    // not enough: the full card, the self-report note shown.
    r.update({ status: 'disconnected', pending: undefined });
    r.update({ status: 'approval', pending: { clientName: 'Claude Code', comparisonCode: 'EEE555', permissions: ALL } });
    expect(r.allowIsCompact()).toBe(false);
    expect(r.title()).toBe('Claude Code wants to connect');
    expect(r.switchOf('capture').checked).toBe(true);
    r.panel.dispose();
  });

  it('REVIEW-1 finding 8: an entry with a client id matches only the same id; an entry without one matches by name', () => {
    const withId = { clientName: 'Claude Code', gatewayClientId: 'client-claude', grants: [], rememberedAt: 1 };
    const nameOnly = { clientName: 'Claude Code', grants: [], rememberedAt: 1 };
    expect(sameAgent(withId, { clientName: 'Claude Code', gatewayClientId: 'client-claude' })).toBe(true);
    expect(sameAgent(withId, { clientName: 'Claude Code' })).toBe(false);
    expect(sameAgent(withId, { clientName: 'Claude Code', gatewayClientId: 'other' })).toBe(false);
    expect(sameAgent(nameOnly, { clientName: 'Claude Code' })).toBe(true);
    expect(sameAgent(nameOnly, { clientName: 'Claude Code', gatewayClientId: 'client-claude' })).toBe(true);
    expect(sameAgent(nameOnly, { clientName: 'Codex' })).toBe(false);
  });

  it('REVIEW-1 finding 8: a match by name only keeps "The name is reported by the agent itself" on the compact card', () => {
    const note = (r: ReturnType<typeof rig>) =>
      [...r.host.querySelectorAll<HTMLElement>('[data-agent-moment="allow"] p')].find((p) => p.textContent === 'The name is reported by the agent itself.')!;
    // Remembered from an older gateway (no id): the next pending matches by its name alone.
    rememberAgent({ clientName: 'Claude Code' }, ['inspect', 'edit']);
    const r = rig();
    r.update({ status: 'approval', pending: { clientName: 'Claude Code', comparisonCode: 'FFF666', permissions: ALL } });
    expect(r.allowIsCompact()).toBe(true);
    expect(note(r)).toBeDefined();
    expect(note(r).hidden).toBe(false);
    r.panel.dispose();
    // Remembered with an id and matched by it: the compact card, the note folded away as before.
    localStorage.clear(); document.body.replaceChildren();
    rememberAgent({ clientName: 'Claude Code', gatewayClientId: 'client-claude' }, ['inspect', 'edit']);
    const s = rig();
    s.update({ status: 'approval', pending: claude('GGG777') });
    expect(s.allowIsCompact()).toBe(true);
    expect(note(s).hidden).toBe(true);
    s.panel.dispose();
  });

  it('lists remembered agents in the Connect moment; Disconnect keeps an entry and Forget removes it', () => {
    const r = rig();
    rememberOnce(r);
    // Disconnect (above) kept it; the Connect moment shows it.
    expect(r.q('[data-agent-moment="connect"]')!.hidden).toBe(false);
    const list = r.q('[data-agent-remembered-list]')!;
    expect(list.hidden).toBe(false);
    expect(list.textContent).toContain('Remembered agents');
    expect(list.textContent).toContain('Claude Code');
    r.q<HTMLButtonElement>('[data-agent-forget]')!.click();
    expect(rememberedAgents()).toEqual([]);
    expect(r.q('[data-agent-remembered-list]')!.hidden).toBe(true);
    expect(r.q('[data-agent-forget]')).toBeNull();
    r.update({ status: 'approval', pending: claude('FFF666') });
    expect(r.allowIsCompact()).toBe(false);
    expect(r.switchOf('capture').checked).toBe(true);
    r.panel.dispose();
  });

  it('a storage failure falls back to the full card, and a refused write does not stop Allow', () => {
    const r = rig();
    rememberOnce(r);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    r.update({ status: 'approval', pending: claude('GGG777') });
    expect(r.allowIsCompact()).toBe(false);
    expect(r.switchOf('capture').checked).toBe(true);
    vi.restoreAllMocks();
    // An unreadable value is no entry.
    localStorage.setItem(AGENT_REMEMBERED_KEY, '{not json');
    expect(findRememberedAgent({ clientName: 'Claude Code', gatewayClientId: 'client-claude' })).toBeUndefined();
    // A write the browser refuses: the approval still goes out.
    localStorage.clear();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    r.update({ status: 'disconnected', pending: undefined });
    r.update({ status: 'approval', pending: claude('HHH888') });
    r.q<HTMLInputElement>('[data-agent-remember]')!.click();
    r.clickAllow();
    expect(r.controller.approve).toHaveBeenLastCalledWith(ALL);
    r.panel.dispose();
  });

  it('is in the page store inventory', () => {
    expect(PAGE_SETTING_KEYS).toContain(AGENT_REMEMBERED_KEY);
  });
});
