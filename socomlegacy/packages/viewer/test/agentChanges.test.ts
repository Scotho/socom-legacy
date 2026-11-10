// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { AgentRequest } from '@s2u/forge-agent-protocol';
import { createAgentActivity, observeTarget, type AgentHistoryLink } from '../src/agent/activity';
import { mountAgentPanel, type AgentPanelController, type AgentPanelOptions, type AgentPanelState } from '../src/agent/panel';
import type { PageAgentTarget } from '../src/agent/connection';
import type { HistoryMeta } from '../src/forge/history';

/**
 * AX-15 (a browser adaptation, FG.R2): an agent edit row knows the history step it made -- undoable only while that step
 * is the top of the history, its `undo()` taking back exactly it -- and the dock's one "Undo the agent's changes" button.
 */
const request = (operation: string, requestId: string, sessionId = 's1'): AgentRequest =>
  ({ version: 1, requestId, sessionId, targetId: 't', epoch: 'e', operation, args: {} });

/** A history of metas, the last one on top, undone by `undoWhile`. */
function fakeHistory(metas: HistoryMeta[]): AgentHistoryLink & { metas: HistoryMeta[]; fire(): void } {
  const listeners = new Set<() => void>();
  return {
    metas,
    top: () => metas.at(-1) ?? null,
    undoWhile(match) {
      let n = 0;
      while (metas.length && match(metas.at(-1)!)) { metas.pop(); n++; }
      if (n) for (const l of [...listeners]) l();
      return n;
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    fire() { for (const l of [...listeners]) l(); },
  };
}
const agentStep = (requestId: string, sessionId = 's1'): HistoryMeta =>
  ({ label: 'Place', actor: { kind: 'agent', sessionId }, domain: 'layout', requestId });

describe('AX-15: the activity rows know their step', () => {
  it('an edit row is undoable only while its step is on top; undo() takes back exactly it', async () => {
    const history = fakeHistory([]);
    const activity = createAgentActivity({ history });
    const target: PageAgentTarget = {
      read: () => ({ surface: 'forge-editor', revision: 1, name: 'Forge', build: 'b' }),
      async dispatch(req) {
        if (req.operation === 'forge.edit') history.metas.push(agentStep(`${req.sessionId}:${req.requestId}`, req.sessionId));
        return { requestId: req.requestId, revision: 1, outcome: 'ok' };
      },
    };
    const watched = observeTarget(target, activity);
    const signal = new AbortController().signal;
    await watched.dispatch(request('forge.edit', 'r1'), signal);
    await watched.dispatch(request('forge.read', 'r2'), signal);
    await watched.dispatch(request('forge.edit', 'r3'), signal);
    const [first, read, last] = activity.entries();
    expect(first).toMatchObject({ requestId: 'r1', undoable: false });
    expect(read).toMatchObject({ undoable: false });
    expect(last).toMatchObject({ requestId: 'r3', undoable: true });
    expect(first!.undo()).toBe(0);
    expect(read!.undo()).toBe(0);
    expect(history.metas).toHaveLength(2);
    expect(last!.undo()).toBe(1);
    expect(history.metas.map((m) => m.requestId)).toEqual(['s1:r1']);
    const now = activity.entries();
    expect(now[0]!.undoable, 'the earlier step is on top now').toBe(true);
    expect(now[2]!.undoable, 'its step is gone').toBe(false);
  });

  it('a refusal, a read, a person\'s step on top and another session\'s step are never undoable', () => {
    const history = fakeHistory([agentStep('s1:r1')]);
    const activity = createAgentActivity({ history });
    activity.result('forge.edit', { outcome: 'refused', code: 'REVISION_CONFLICT' }, { requestId: 'r1', sessionId: 's1' });
    activity.result('forge.read', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's2' });
    expect(activity.entries().map((e) => e.undoable)).toEqual([false, false, false]);
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    expect(activity.entries().at(-1)!.undoable).toBe(true);
    history.metas.push({ label: 'Move', actor: { kind: 'human' }, domain: 'layout' });
    expect(activity.entries().at(-1)!.undoable).toBe(false);
  });

  it('without a history every row is not undoable; a history change is heard by subscribers', () => {
    const bare = createAgentActivity();
    bare.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    expect(bare.entries()[0]).toMatchObject({ undoable: false });
    expect(bare.entries()[0]!.undo()).toBe(0);
    const history = fakeHistory([]);
    const activity = createAgentActivity({ history });
    const heard = vi.fn();
    activity.subscribe(heard);
    history.fire();
    expect(heard).toHaveBeenCalled();
  });
});

function rig(options: Omit<AgentPanelOptions, 'copy'>) {
  const state: AgentPanelState = { status: 'connected', target: 'Forge', permissions: ['inspect', 'edit'], activity: [] };
  const controller: AgentPanelController = {
    state: () => state, subscribe: () => () => undefined, prepare: vi.fn(async () => ''), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(),
  };
  const host = document.createElement('div'); document.body.append(host);
  return { host, panel: mountAgentPanel(host, controller, { copy: async () => {}, ...options }) };
}

describe('AX-15: the dock\'s hook', () => {
  it('one "Undo the agent\'s changes" button calls through and says what happened', () => {
    let count = 3;
    const undoAgentRun = vi.fn(() => { count = 0; return { undone: 3, message: 'Stopped at your own edit: 3 agent changes undone' }; });
    const r = rig({ undoAgentRun, agentChanges: () => ({ count, undoable: count > 0 }) });
    const b = r.host.querySelector<HTMLButtonElement>('[data-agent-undo-run]')!;
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('Undo the agent’s changes');
    expect(b.disabled).toBe(false);
    b.click();
    expect(undoAgentRun).toHaveBeenCalledOnce();
    expect(r.host.textContent).toContain('Stopped at your own edit: 3 agent changes undone');
    expect(b.disabled).toBe(true);
    r.panel.dispose();
  });

  it('no button without the hook; disabled while nothing of the agent\'s is on top', () => {
    const none = rig({});
    expect(none.host.querySelector('[data-agent-undo-run]')).toBeNull();
    none.panel.dispose();
    const idle = rig({ undoAgentRun: vi.fn(), agentChanges: () => ({ count: 2, undoable: false }) });
    expect(idle.host.querySelector<HTMLButtonElement>('[data-agent-undo-run]')!.disabled).toBe(true);
    idle.panel.dispose();
  });
});

describe('AX-15 (REVIEW-1 finding 12): each undoable row has its own Undo', () => {
  it('an undoable row draws a small Undo that takes back exactly its step; other rows draw none', () => {
    const history = fakeHistory([agentStep('s1:r1')]);
    const activity = createAgentActivity({ history });
    activity.result('forge.read', { outcome: 'ok' }, { requestId: 'r0', sessionId: 's1' });
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    const r = rig({ activity });
    const rows = () => [...r.host.querySelectorAll<HTMLElement>('[data-agent-activity] li')];
    const buttons = () => [...r.host.querySelectorAll<HTMLButtonElement>('[data-agent-activity] [data-agent-undo-row]')];
    expect(rows()).toHaveLength(2);
    expect(buttons()).toHaveLength(1);
    const [undo] = buttons();
    expect(undo!.textContent).toBe('Undo');
    expect(undo!.type).toBe('button');
    expect(undo!.getAttribute('aria-label')).toBe('Undo: Changed the map');
    // newest first: the edit's row holds the button, the read's row none
    expect(rows()[0]!.contains(undo!)).toBe(true);
    expect(rows()[0]!.textContent).toContain('Changed the map');
    expect(rows()[1]!.querySelector('[data-agent-undo-row]')).toBeNull();
    undo!.click();
    expect(history.metas).toEqual([]);
    // the store heard the history change: the row is redrawn without its button
    expect(buttons()).toHaveLength(0);
    r.panel.dispose();
  });

  it('a row whose step is no longer on top (a person edited after it) draws no Undo', () => {
    const history = fakeHistory([agentStep('s1:r1'), { label: 'Move', actor: { kind: 'human' }, domain: 'layout' }]);
    const activity = createAgentActivity({ history });
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    const r = rig({ activity });
    expect(r.host.querySelector('[data-agent-undo-row]')).toBeNull();
    r.panel.dispose();
  });
});

describe('REVIEW-2 23: a row\'s Undo says so when the Forge holds edits', () => {
  /** A history whose step is on top, but whose undo the page refuses (Play, busy, a lobby): `undoWhile` answers 0. */
  function heldHistory(metas: HistoryMeta[]): AgentHistoryLink & { held: boolean; metas: HistoryMeta[]; fire(): void } {
    const link = fakeHistory(metas);
    const held = { ...link, held: true, undoWhile: (match: (meta: HistoryMeta) => boolean) => (held.held ? 0 : link.undoWhile(match)) };
    return held;
  }

  it('a row Undo that undoes nothing shows the run Undo\'s held note; a later one that works clears it', async () => {
    const history = heldHistory([agentStep('s1:r1')]);
    const activity = createAgentActivity({ history });
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    const r = rig({ activity });
    const note = () => r.host.querySelector<HTMLElement>('[data-agent-undo-row-note]');
    expect(note()).not.toBeNull();
    expect(note()!.hidden).toBe(true);
    expect(note()!.getAttribute('role')).toBe('status');
    r.host.querySelector<HTMLButtonElement>('[data-agent-undo-row]')!.click();
    expect(history.metas).toHaveLength(1);
    expect(note()!.hidden).toBe(false);
    const { AGENT_EDITS_HELD_NOTE } = await import('../src/agent/panel');
    expect(note()!.textContent).toBe(AGENT_EDITS_HELD_NOTE);
    // the run Undo's own words on a held page (`../forge/page.ts` undoAgentRunNow), one sentence for both buttons
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const pageSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/forge/page.ts'), 'utf8');
    expect(pageSource).toContain(`message: '${AGENT_EDITS_HELD_NOTE}'`);
    // the row stays (nothing was undone); once edits are free again, its Undo works and the note goes
    history.held = false;
    r.host.querySelector<HTMLButtonElement>('[data-agent-undo-row]')!.click();
    expect(history.metas).toEqual([]);
    expect(note()!.hidden).toBe(true);
    r.panel.dispose();
  });

  it('REVIEW-3-SHADOW 2: a row Undo whose step a later edit covered (clicked before the redraw) says nothing of held edits', () => {
    const history = fakeHistory([agentStep('s1:r1')]);
    const activity = createAgentActivity({ history });
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    const r = rig({ activity });
    const note = () => r.host.querySelector<HTMLElement>('[data-agent-undo-row-note]')!;
    // a person's edit lands on top before the feed redraws: the row still shows its Undo, but its step is covered
    history.metas.push({ label: 'Move', actor: { kind: 'human' }, domain: 'layout' });
    r.host.querySelector<HTMLButtonElement>('[data-agent-undo-row]')!.click();
    expect(history.metas).toHaveLength(2);
    expect(note().hidden).toBe(true);
    r.panel.dispose();
  });

  it('REVIEW-3-SHADOW 2: the held note goes on the next redraw where no row is held back (no row undoable)', () => {
    const history = heldHistory([agentStep('s1:r1')]);
    const activity = createAgentActivity({ history });
    activity.result('forge.edit', { outcome: 'ok' }, { requestId: 'r1', sessionId: 's1' });
    const r = rig({ activity });
    const note = () => r.host.querySelector<HTMLElement>('[data-agent-undo-row-note]')!;
    r.host.querySelector<HTMLButtonElement>('[data-agent-undo-row]')!.click();
    expect(note().hidden).toBe(false);
    // a redraw while the row is still held back keeps the note
    activity.result('forge.read', { outcome: 'ok' }, { requestId: 'r2', sessionId: 's1' });
    expect(r.host.querySelector('[data-agent-undo-row]')).not.toBeNull();
    expect(note().hidden).toBe(false);
    // a person's edit covers the step: the row has nothing to undo, nothing is held, and the redraw clears the note
    history.metas.push({ label: 'Move', actor: { kind: 'human' }, domain: 'layout' });
    history.fire();
    expect(r.host.querySelector('[data-agent-undo-row]')).toBeNull();
    expect(note().hidden).toBe(true);
    r.panel.dispose();
  });
});
