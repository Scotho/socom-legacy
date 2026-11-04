import { describe, expect, it, vi } from 'vitest';
import type { AgentRequest } from '@s2u/forge-agent-protocol';
import { createForgePageTarget } from '../../src/agent/forgeTarget';
import { createForgeAgentApi, FORGE_AGENT_OPERATIONS, type ForgeAgentApi, type ForgeAgentFacade, type ForgeAgentSnapshot } from '../../src/forge/agent/api';
import { FORGE_LAYOUT_OPERATIONS } from '../../src/forge/agent/commands';
import { emptyLayout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { FORGE_EDIT_OPERATIONS } from '../../src/forge/shell/operations';

/**
 * FCW-32 step 3 (a browser adaptation, the Forge's own authoring instrument): the rules and the three entities over the
 * agent's API and the page target -- guarded as the existing edit verbs (revisions, Play, scope).
 */

const RULE = { id: 'score', when: 'player.kill', then: [{ do: 'score.award', who: 'attacker', points: 1 }] };

function fixture() {
  let revision = 3, playing = false, commits = 0;
  const facade: ForgeAgentFacade = {
    snapshot: () => ({ ready: true, mode: playing ? 'forge-play' : 'forge-editor', revision,
      layout: recordOfLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'Test'),
      selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }),
    prepare: async () => ({ commit: () => { commits++; revision++; }, dispose: () => undefined }),
  };
  return { api: createForgeAgentApi(facade), play: () => { playing = true; }, commits: () => commits, revision: () => revision };
}

describe('FCW-32 the agent API: rules and entity verbs, guarded as the edit verbs', () => {
  it('lists each verb with its permission, and every edit is a registered, undoable layout operation', () => {
    const permission = (name: string): string | undefined => FORGE_AGENT_OPERATIONS.find((o) => o.name === name)?.permission;
    for (const name of ['zone.place', 'marker.place', 'spawner.place', 'rules.new', 'rules.set', 'rules.rule.set', 'rules.rule.delete',
      'rules.variable.set', 'rules.variable.delete', 'rules.config.set', 'rules.clear']) {
      expect(permission(name), name).toBe('edit');
      expect(FORGE_LAYOUT_OPERATIONS.has(name), name).toBe(true);
      expect(FORGE_EDIT_OPERATIONS.some((o) => o.id === name), name).toBe(true);
    }
    expect(permission('rules.import')).toBe('import');
    expect(FORGE_EDIT_OPERATIONS.some((o) => o.id === 'rules.import')).toBe(true);
    expect(permission('rules.read')).toBe('inspect');
    expect(permission('rules.export')).toBe('inspect');
    expect(permission('rules.check')).toBe('diagnose');
  });

  it('refuses a stale rules edit, and an edit during Play', async () => {
    const f = fixture();
    expect((await f.api.execute('rules.rule.set', { rule: RULE }, f.revision() - 1)).code).toBe('STALE_REVISION');
    expect((await f.api.execute('zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, f.revision() - 1)).code).toBe('STALE_REVISION');
    expect(f.commits()).toBe(0);
    expect((await f.api.execute('rules.rule.set', { rule: RULE }, f.revision())).ok).toBe(true);
    f.play();
    for (const [op, args] of [['rules.set', { spec: {} }], ['rules.rule.set', { rule: RULE }], ['marker.place', { id: 'exit', at: [0, 0, 0], yaw: 0 }], ['rules.check', {}]] as const) {
      expect((await f.api.execute(op, args, f.revision())).code, op).toBe('PLAYING');
    }
    expect(f.commits()).toBe(1);
  });

  it('refuses malformed arguments before anything is staged', async () => {
    const f = fixture();
    expect((await f.api.execute('zone.place', { id: 'vault', shape: 'cone', at: [0, 0, 0] }, f.revision())).code).toBe('INVALID_ARGUMENT');
    expect((await f.api.execute('rules.rule.set', { rule: RULE, extra: 1 }, f.revision())).code).toBe('INVALID_ARGUMENT');
    expect(f.commits()).toBe(0);
  });
});

function rig() {
  const snapshot: ForgeAgentSnapshot = { ready: true, mode: 'forge-editor', revision: 1,
    layout: { v: 2, name: 'Blank floor', base: 'blank', assets: [], pieces: [], spawns: [] },
    selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false };
  const execute = vi.fn<ForgeAgentApi['execute']>(async () => ({ ok: true, revision: snapshot.revision }));
  const api: ForgeAgentApi = { read: () => snapshot, execute, subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn(),
    status: () => ({ ready: true, mode: snapshot.mode, revision: snapshot.revision, viewRevision: 0, name: 'Blank floor', map: 'blank' }) };
  const target = createForgePageTarget({ api, build: 'test' });
  const request = (operation: string, args: unknown = {}): AgentRequest => ({ version: 1, requestId: 'one', sessionId: 'placeholder', targetId: 'target', epoch: 'epoch', operation, args, expectedRevision: snapshot.revision });
  return { execute, target, request, snapshot };
}

describe('FCW-32 the page target: the rules verbs', () => {
  it.each([
    ['forge.rules', { section: 'vocabulary' }, 'rules.read'],
    ['forge.rules.check', {}, 'rules.check'],
    ['forge.rules.export', {}, 'rules.export'],
    ['forge.rules.import', { files: [{ path: 's2u-pack.json', text: '{}' }] }, 'rules.import'],
  ])('delegates %s to the editor\'s %s', async (operation, args, native) => {
    const r = rig(), signal = new AbortController().signal;
    expect((await r.target.dispatch(r.request(operation, args), signal)).outcome).toBe('ok');
    expect(r.execute).toHaveBeenCalledWith(native, args, 1, 'placeholder:one', { signal, sessionId: 'placeholder' });
  });

  it('writes rules and entities through forge.edit, and refuses an import or a check smuggled through it', async () => {
    const r = rig(), signal = new AbortController().signal;
    expect((await r.target.dispatch(r.request('forge.edit', { operation: 'rules.rule.set', arguments: { rule: RULE } }), signal)).outcome).toBe('ok');
    expect(r.execute).toHaveBeenCalledWith('rules.rule.set', { rule: RULE }, 1, 'placeholder:one', { signal, sessionId: 'placeholder' });
    for (const operation of ['rules.import', 'rules.check', 'rules.export']) {
      const result = await r.target.dispatch({ ...r.request('forge.edit', { operation, arguments: {} }), requestId: `x-${operation}` }, signal);
      expect(result.code, operation).toBe('PERMISSION_DENIED');
    }
    expect(r.execute).toHaveBeenCalledTimes(1);
  });

  it('refuses a rules write from Play\'s surface', async () => {
    const r = rig();
    r.snapshot.mode = 'forge-play';
    const result = await r.target.dispatch(r.request('forge.rules.import', { files: [] }), new AbortController().signal);
    expect(result.code).toBe('SURFACE_DENIED');
  });
});
