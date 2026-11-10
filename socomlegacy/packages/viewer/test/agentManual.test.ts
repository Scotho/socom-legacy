import { describe, expect, it, vi } from 'vitest';
import { FORGE_OPERATIONS, OPERATION_MANUAL, TESTROOM_INNER_OPERATIONS, type AgentRequest } from '@s2u/forge-agent-protocol';
import { FORGE_AGENT_OPERATIONS, validateForgeAgentArguments, type ForgeAgentApi, type ForgeAgentSnapshot } from '../src/forge/agent/api';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { SOLO_TESTROOM_OPERATIONS } from '../src/testroom/agent/target';

/**
 * AX-1 (contract C1, ruling AX.R6; a browser adaptation): the manual the gateway serves before pairing and the schemas
 * the page validates against are one source; a Forge operation no wire operation reaches is named here, never silent.
 */
const PAGE_ONLY = [
  // The page's own panels read these; the wire reads the same snapshot through forge.read, forge.catalogue and forge.issues.
  'layout.read', 'layout.export', 'catalogue.read', 'issues.read',
  // Offline Walk and a named save's load are the person's (an import-permission load has no wire operation).
  'walk.start', 'walk.stop', 'saves.load',
  // The wire's request.receipt is answered from the target's own receipt store (`forgeTarget.ts` `dispatch`).
  'request.receipt',
].sort();

describe('the operation manual and the page', () => {
  it('validates against the very schemas the manual holds', () => {
    expect(FORGE_AGENT_OPERATIONS).toBe(FORGE_OPERATIONS);
  });

  it('reaches every Forge operation from a wire operation, or names it page-only', () => {
    const reached = new Set<string>();
    for (const entry of Object.values(OPERATION_MANUAL)) {
      if (!entry.surfaces.some((s) => s === 'forge-editor' || s === 'forge-play')) continue;
      for (const inner of Object.keys(entry.nested ?? {})) reached.add(inner);
      for (const inner of entry.runs ?? []) reached.add(inner);
    }
    const names = FORGE_AGENT_OPERATIONS.map((o) => o.name as string);
    expect([...reached].filter((n) => !names.includes(n) && !Object.hasOwn(TESTROOM_INNER_OPERATIONS, n))).toEqual([]);
    expect(names.filter((n) => !reached.has(n)).sort()).toEqual(PAGE_ONLY);
  });

  it('accepts every Forge example through the page validator', () => {
    const failures: string[] = [];
    for (const entry of [OPERATION_MANUAL['forge.edit']!, OPERATION_MANUAL['forge.input']!])
      for (const [name, nested] of Object.entries(entry.nested ?? {})) {
        try { validateForgeAgentArguments(name, nested.example); } catch (e) { failures.push(`${name}: ${String(e)}`); }
      }
    expect(failures).toEqual([]);
  });

  it('describes the test room with the schemas the room validates against', () => {
    const room = Object.fromEntries(SOLO_TESTROOM_OPERATIONS.map((o) => [o.name, JSON.parse(JSON.stringify(o.inputSchema))]));
    expect(Object.keys(TESTROOM_INNER_OPERATIONS).sort()).toEqual(Object.keys(room).sort());
    for (const [name, inner] of Object.entries(TESTROOM_INNER_OPERATIONS)) expect(JSON.parse(JSON.stringify(inner.args)), name).toEqual(room[name]);
  });

  it("forwards exactly the manual's nested operations through forge.edit and forge.input", async () => {
    const snapshot: ForgeAgentSnapshot = { ready: true, mode: 'forge-editor', revision: 1, layout: null, selection: [], refs: [],
      catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false };
    const execute = vi.fn<ForgeAgentApi['execute']>(async () => ({ ok: true, revision: 1 }));
    const api: ForgeAgentApi = { read: () => snapshot, execute, subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn(),
      status: () => ({ ready: true, mode: snapshot.mode, revision: 1, viewRevision: 0, name: 'Forge', map: null }) };
    const target = createForgePageTarget({ api, build: 'test' });
    let n = 0;
    const call = async (wire: string, operation: string): Promise<string> => {
      const request: AgentRequest = { version: 1, requestId: `r${n++}`, sessionId: 's', targetId: 't', epoch: 'e', expectedRevision: 1,
        operation: wire, args: { operation, arguments: {} } };
      const result = await target.dispatch(request, new AbortController().signal);
      return result.code ?? result.outcome;
    };
    for (const name of Object.keys(OPERATION_MANUAL['forge.edit']!.nested ?? {})) expect(await call('forge.edit', name), name).toBe('ok');
    for (const name of ['layout.import', 'saves.load', 'checkMap']) expect(await call('forge.edit', name), name).toBe('UNSUPPORTED_OPERATION');   // REVIEW-1 9
    snapshot.mode = 'forge-play';
    for (const name of Object.keys(OPERATION_MANUAL['forge.input']!.nested ?? {})) expect(await call('forge.input', name), name).toBe('ok');
    for (const name of ['scenario.start', 'layout.name']) expect(await call('forge.input', name), name).toBe('UNSUPPORTED_OPERATION');
  });
});
