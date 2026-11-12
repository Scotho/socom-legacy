import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { REFUSAL_HINTS, type AgentRequest } from '@s2u/forge-agent-protocol';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { createTestroomPageTarget } from '../src/agent/testroomTarget';
import { AGENT_CODE_WORDS } from '../src/agent/codes';
import { createSoloTestroomTarget, type SoloHostState } from '../src/testroom/agent/target';
import type { ForgeAgentApi, ForgeAgentSnapshot } from '../src/forge/agent/api';
import type { LocalPackApi } from '../src/agent/localPacks';

// AX-3 (C2, C3; a browser adaptation): `expectedRevision: "current"` resolved at admission, and refusals that teach.
function forge() {
  const snapshot: ForgeAgentSnapshot = { ready: true, mode: 'forge-editor', revision: 5,
    layout: { v: 2, name: 'Blank floor', base: 'blank', assets: [], pieces: [], spawns: [] },
    selection: [], refs: [], catalogue: { assets: [] }, issues: [], view: {}, canUndo: false, canRedo: false };
  const execute = vi.fn<ForgeAgentApi['execute']>(async () => ({ ok: true, revision: snapshot.revision + 1 }));
  const status = vi.fn(() => ({ ready: true, mode: snapshot.mode, revision: snapshot.revision, viewRevision: 0, name: 'Forge', map: 'blank' }));
  const api: ForgeAgentApi = { read: () => snapshot, status, execute, subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn() };
  const target = createForgePageTarget({ api, build: 'test' });
  let n = 0;
  const request = (operation: string, args: unknown, expectedRevision?: number | 'current'): AgentRequest =>
    ({ version: 1, requestId: `r${++n}`, sessionId: 's', targetId: 't', epoch: 'e', operation, args, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
  return { snapshot, execute, target, request };
}
function room() {
  const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP72', path: 'MP72.ZAR', name: 'Crossroads', actions: [{ node: 'seal_tent', path: 'world/seal_tent', type: 'MPBOMB', team: 0, at: [1, 2, 3] }], destinations: [] },
    name: 'guest', pose: null, feet: null, equipment: {}, action: {}, plant: null };
  const teleport = vi.fn(() => true);
  const api = createSoloTestroomTarget({ state: () => state, maps: () => [], loadMap: () => {}, teleport, setCamera: () => true, equip: () => true, release() {}, now: Date.now });
  const packs = { list: vi.fn(async () => []), import: vi.fn(async () => ({ id: 'map:one' })), remove: vi.fn() } as unknown as LocalPackApi;
  const target = createTestroomPageTarget(api, packs);
  let n = 0;
  const request = (operation: string, args: unknown, expectedRevision?: number | 'current'): AgentRequest =>
    ({ version: 1, requestId: `r${++n}`, sessionId: 's', targetId: 't', epoch: 'e', operation, args, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
  return { api, target, request, teleport };
}
describe('expectedRevision current in the Forge target', () => {
  it('resolves to the editor revision read at admission and passes that number on', async () => {
    const r = forge(), signal = new AbortController().signal;
    const result = await r.target.dispatch(r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'X' } }, 'current'), signal);
    expect(result.outcome).toBe('ok');
    expect(r.execute).toHaveBeenCalledWith('layout.name', { name: 'X' }, 5, 's:r1', { signal, sessionId: 's' });
  });
  it('a stale number still refuses, and the refusal teaches with the current revision', async () => {
    const r = forge(), signal = new AbortController().signal;
    const result = await r.target.dispatch(r.request('forge.edit', { operation: 'layout.name', arguments: { name: 'X' } }, 4), signal);
    expect(result).toMatchObject({ outcome: 'refused', code: 'REVISION_CONFLICT', hint: REFUSAL_HINTS.REVISION_CONFLICT, retry: { revision: 5 } });
    expect(r.execute).not.toHaveBeenCalled();
  });
  it('a refusal the target returns carries the table hint', async () => {
    const r = forge(), signal = new AbortController().signal;
    r.snapshot.mode = 'forge-play';
    expect(await r.target.dispatch(r.request('forge.read', { section: 'metadata' }), signal)).toMatchObject({ code: 'SURFACE_DENIED', hint: REFUSAL_HINTS.SURFACE_DENIED });
  });
});
describe('expectedRevision current in the test-room target', () => {
  it('resolves to the room revision read at admission', async () => {
    const r = room(), signal = new AbortController().signal;
    const result = await r.target.dispatch(r.request('testroom.teleport', { destination: 'seal_tent' }, 'current'), signal);
    expect(result.outcome).toBe('ok');
    expect(r.teleport).toHaveBeenCalled();
    r.api.dispose();
  });
  it('a stale number refuses with the hint and the current revision', async () => {
    const r = room(), signal = new AbortController().signal;
    const now = r.api.read().revision;
    const result = await r.target.dispatch(r.request('testroom.teleport', { destination: 'seal_tent' }, now + 7), signal);
    expect(result).toMatchObject({ outcome: 'refused', code: 'REVISION_CONFLICT', hint: REFUSAL_HINTS.REVISION_CONFLICT, retry: { revision: now } });
    expect(r.teleport).not.toHaveBeenCalled();
    r.api.dispose();
  });
});
describe('REFUSAL_HINTS covers the page', () => {
  it('has a hint for every code the page words for a person', () => {
    expect(Object.keys(AGENT_CODE_WORDS).filter((code) => !REFUSAL_HINTS[code])).toEqual([]);
  });
  // REVIEW-1 9: every code literal the page targets, the room target, the Forge facade and its api emit has an agent hint
  // and person words (a code with no row falls to the generic sentence, which teaches nothing).
  it('has a hint and words for every code the targets, the facade and api.ts emit', () => {
    const emitted = new Set<string>();
    const forms = [
      /\b(?:fail|refuse|failure)\(\s*'([A-Z][A-Z0-9_]+)'/g,
      /\bForgeAgentError\(\s*(?:[^'()]*\?\s*)?'([A-Z][A-Z0-9_]+)'(?:\s*:\s*'([A-Z][A-Z0-9_]+)')?/g,
      /\bCaptureRefusal\(\s*'([A-Z][A-Z0-9_]+)'/g,
      /\bresult\(\s*false\s*,\s*(?:[^'()]*\?\s*)?'([A-Z][A-Z0-9_]+)'(?:\s*:\s*'([A-Z][A-Z0-9_]+)')?/g,
    ];
    for (const file of ['../src/agent/forgeTarget.ts', '../src/agent/testroomTarget.ts', '../src/testroom/agent/target.ts', '../src/forge/agent/editorFacade.ts', '../src/forge/agent/api.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      for (const form of forms) for (const match of text.matchAll(form)) for (const code of match.slice(1)) if (code) emitted.add(code);
    }
    expect(emitted.size).toBeGreaterThan(30);
    for (const code of ['MAP_ISSUES', 'ABSENT_ASSET', 'NO_HISTORY', 'NO_MAP', 'REQUIREMENTS_UNMET', 'SAVE_REFUSED', 'EMPTY_CLIPBOARD', 'UNAVAILABLE', 'LOAD_FAILED', 'LOAD_TIMEOUT'])
      expect(emitted, code).toContain(code);
    expect([...emitted].filter((code) => !REFUSAL_HINTS[code]).sort()).toEqual([]);
    expect([...emitted].filter((code) => !AGENT_CODE_WORDS[code]).sort()).toEqual([]);
  });
});
