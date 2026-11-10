import { describe, expect, it, vi } from 'vitest';
import { OPERATION_MANUAL, parseCaptureArgs, type AgentRequest, type ManualEntry, type Surface } from '@s2u/forge-agent-protocol';
import { FORGE_AGENT_OPERATIONS, validateForgeAgentArguments, type ForgeAgentApi, type ForgeAgentSnapshot } from '../src/forge/agent/api';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { createTestroomPageTarget, SCENARIO_WIRE_STEPS } from '../src/agent/testroomTarget';
import { createSoloTestroomTarget, type SoloHostState } from '../src/testroom/agent/target';
import type { LocalPackApi } from '../src/agent/localPacks';

/**
 * REVIEW-1 20, its drift part (FOLD-2 of REVIEW-2; a browser adaptation): the manual's hand-written wire entries
 * (`@s2u/forge-agent-protocol` `manual.ts` `WIRE`) held to what the page targets parse. Every wire example the manual
 * serves is sent through the real page target of each surface it names: the target must route it (never a parse or
 * routing refusal -- UNSUPPORTED_OPERATION, INVALID_ARGUMENT, INVALID_SECTION, SURFACE_DENIED), run the inner operation
 * the manual's `runs` names with arguments the page's own validator accepts, and a wrapper must admit exactly the
 * manual's nested operations. target.capture is not dispatched: its arguments go through `parseCaptureArgs`.
 */
const PARSE_REFUSALS = ['UNSUPPORTED_OPERATION', 'INVALID_ARGUMENT', 'INVALID_SECTION', 'SURFACE_DENIED'];
/** The chunked import: one transfer's begin, chunk and finish, sent in order (their own test below). */
const STATEFUL = ['forge.import.begin', 'forge.import.chunk', 'forge.import.finish'];
const FORGE_NAMES = new Set(FORGE_AGENT_OPERATIONS.map((o) => o.name as string));
const examplesOf = (entry: ManualEntry): unknown[] => [entry.example, ...(entry.examples ?? [])];
const entries = (surface: Surface): [string, ManualEntry][] =>
  Object.entries(OPERATION_MANUAL).filter(([name, e]) => name !== 'target.capture' && e.surfaces.includes(surface));

function forgeRig() {
  const snapshot: ForgeAgentSnapshot = { ready: true, mode: 'forge-editor', revision: 1,
    layout: { v: 2, name: 'Blank floor', base: 'blank', assets: [], pieces: [], spawns: [] },
    selection: [], refs: [], catalogue: { assets: [], palette: [] }, issues: [], view: {}, canUndo: false, canRedo: false };
  const execute = vi.fn<ForgeAgentApi['execute']>(async (operation) =>
    ({ ok: true, revision: snapshot.revision, ...(operation === 'saves.list' ? { data: [] } : {}) }));
  const api: ForgeAgentApi = { read: () => snapshot, execute, subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn(),
    status: () => ({ ready: true, mode: snapshot.mode, revision: snapshot.revision, viewRevision: 0, name: 'Forge', map: 'blank' }),
    focus: () => ({ point: null, pointAt: null, selection: [], camera: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, revision: snapshot.revision }) };
  const packs = { list: vi.fn(async () => []), import: vi.fn(async () => ({ id: 'mod:demo' })), remove: vi.fn(async () => ({ removed: true })) } as unknown as LocalPackApi;
  return { snapshot, execute, target: createForgePageTarget({ api, build: 'test', packs }) };
}

function roomRig() {
  const state: SoloHostState = { scope: 'testroom', online: false, replay: false, visible: true, ready: true, building: true,
    map: { archive: 'MP2', path: 'MP2.ZAR', name: 'Frostfire', actions: [], destinations: [] },
    name: 'guest', pose: null, feet: null, equipment: {}, action: {}, plant: null };
  const api = createSoloTestroomTarget({ state: () => state, maps: () => [{ archive: 'MP2', path: 'MP2.ZAR', name: 'Frostfire' }], loadMap: () => {},
    teleport: () => true, setCamera: () => true, equip: () => true, release() {}, now: Date.now });
  const packs = { list: vi.fn(async () => []), import: vi.fn(async () => ({ id: 'map:one' })), remove: vi.fn(async () => ({ removed: true })) } as unknown as LocalPackApi;
  return { api, target: createTestroomPageTarget(api, packs) };
}

let n = 0;
const request = (operation: string, args: unknown, expectedRevision: number): AgentRequest =>
  ({ version: 1, sessionId: 's', targetId: 't', epoch: 'e', requestId: `w${++n}`, operation, args, expectedRevision });

describe('REVIEW-2 20: the manual\'s wire entries agree with what the page targets parse', () => {
  it('routes every Forge wire example, and runs the inner operation the manual names with arguments the page accepts', async () => {
    const failures: string[] = [];
    for (const [name, entry] of [...entries('forge-editor'), ...entries('forge-play').filter(([, e]) => !e.surfaces.includes('forge-editor'))]) {
      if (STATEFUL.includes(name)) continue;
      const ranAll: string[] = [];
      for (const example of examplesOf(entry)) {
        const r = forgeRig();
        r.snapshot.mode = entry.surfaces.includes('forge-editor') ? 'forge-editor' : 'forge-play';
        const answer = await r.target.dispatch(request(name, example, r.snapshot.revision), new AbortController().signal);
        if (answer.code && PARSE_REFUSALS.includes(answer.code)) { failures.push(`${name} ${JSON.stringify(example)}: ${answer.code}`); continue; }
        const ran = r.execute.mock.calls.map(([op, value]) => ({ op, value }));
        ranAll.push(...ran.map((c) => c.op));
        for (const c of ran) if (entry.runs?.includes(c.op) && FORGE_NAMES.has(c.op))
          try { validateForgeAgentArguments(c.op, c.value); } catch (e) { failures.push(`${name} -> ${c.op}: ${String(e)}`); }
        if (entry.nested) {
          const call = example as { operation: string; arguments?: unknown };
          const hit = ran.find((c) => c.op === call.operation);
          if (!hit || !Object.hasOwn(entry.nested, call.operation)) failures.push(`${name}: its example's ${call.operation} is not what the page ran`);
        }
      }
      // the manual's runs: each one is what the page runs for one of the entry's examples, and nothing else it names
      for (const inner of entry.runs ?? []) if (!ranAll.includes(inner)) failures.push(`${name}: runs ${inner}, which none of its examples reaches`);
      if (entry.runs) for (const op of ranAll) if (!entry.runs.includes(op)) failures.push(`${name}: the page ran ${op}, which its runs does not name`);
    }
    expect(failures).toEqual([]);
  });

  it('the chunked import, sent as the manual\'s examples say, assembles and runs layout.import', async () => {
    const r = forgeRig(), signal = new AbortController().signal;
    const [begin, chunk, finish] = STATEFUL.map((name) => OPERATION_MANUAL[name]!) as [ManualEntry, ManualEntry, ManualEntry];
    const data = new TextEncoder().encode(JSON.stringify({ v: 2, name: 'x', base: 'blank', assets: [], pieces: [], spawns: [] }));
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const send = async (name: string, args: unknown) => r.target.dispatch(request(name, args, r.snapshot.revision), signal);
    // the examples' shapes, with this file's size, digest and bytes
    expect((await send('forge.import.begin', { ...(begin.example as object), size: data.length, digest })).outcome).toBe('ok');
    expect((await send('forge.import.chunk', { ...(chunk.example as object), data: btoa(String.fromCharCode(...data)) })).outcome).toBe('ok');
    expect((await send('forge.import.finish', finish.example)).outcome).toBe('ok');
    expect(r.execute.mock.calls.map(([op]) => op)).toEqual(finish.runs);
    validateForgeAgentArguments('layout.import', r.execute.mock.calls[0]![1]);
  });

  it('routes every test-room wire example through the room target, whose own validator checks the arguments', async () => {
    const failures: string[] = [];
    for (const [name, entry] of entries('testroom-solo')) {
      for (const example of examplesOf(entry)) {
        const r = roomRig();
        const answer = await r.target.dispatch(request(name, example, r.api.read().revision), new AbortController().signal);
        if (answer.code && PARSE_REFUSALS.includes(answer.code)) failures.push(`${name} ${JSON.stringify(example)}: ${answer.code}`);
      }
      // a wrapper's nested examples, as {operation, arguments}, pass the room's validator too
      if (name === 'testroom.input' || name === 'testroom.settings')
        for (const [inner, nested] of Object.entries(entry.nested ?? {})) {
          const r = roomRig();
          const answer = await r.target.dispatch(request(name, { operation: inner, arguments: nested.example }, r.api.read().revision), new AbortController().signal);
          if (answer.code && PARSE_REFUSALS.includes(answer.code)) failures.push(`${name} ${inner}: ${answer.code}`);
        }
    }
    expect(failures).toEqual([]);
  });

  it('a wrapper admits exactly the manual\'s nested operations (the refusal\'s data.admitted)', async () => {
    const forge = forgeRig();
    for (const [wire, mode] of [['forge.edit', 'forge-editor'], ['forge.input', 'forge-play']] as const) {
      forge.snapshot.mode = mode;
      const answer = await forge.target.dispatch(request(wire, { operation: 'no.such', arguments: {} }, 1), new AbortController().signal);
      expect(answer.code, wire).toBe('UNSUPPORTED_OPERATION');
      expect([...(answer.data as { admitted: string[] }).admitted].sort(), wire).toEqual(Object.keys(OPERATION_MANUAL[wire]!.nested!).sort());
    }
    for (const wire of ['testroom.input', 'testroom.settings']) {
      const room = roomRig();
      const answer = await room.target.dispatch(request(wire, { operation: 'no.such', arguments: {} }, room.api.read().revision), new AbortController().signal);
      expect(answer.code, wire).toBe('UNSUPPORTED_OPERATION');
      expect([...(answer.data as { admitted: string[] }).admitted].sort(), wire).toEqual(Object.keys(OPERATION_MANUAL[wire]!.nested!).sort());
    }
  });

  it('the scenario steps the room admits over the wire are the ones the manual\'s scenario.start names', () => {
    const words = OPERATION_MANUAL['scenario.start']!.description;
    // REVIEW-3-SHADOW 5: the whole step list, in the description's own forms -- "action.press/hold/release/cancel" is four
    // steps, a parenthesis is a step's own note -- so dropping one step from the words (or adding one) fails.
    const lists = /Forge steps: (.*?)\.\s+The room adds (.*?)\.(?:\s|$)/.exec(words);
    expect(lists, 'the description names the Forge steps and the room\'s added ones').not.toBeNull();
    const named = [lists![1]!, lists![2]!].flatMap((list) => list.replace(/\([^)]*\)/g, '').split(','))
      .map((item) => item.trim().split(/\s+/)[0]!)
      .flatMap((item) => { const [head, ...rest] = item.split('.'); return rest.length ? rest.join('.').split('/').map((tail) => `${head}.${tail}`) : [head!]; });
    expect([...named].sort()).toEqual([...SCENARIO_WIRE_STEPS].sort());
    expect(words).not.toMatch(/camera\.set/);
  });

  it('every target.capture example parses through the page\'s capture parser', () => {
    for (const example of examplesOf(OPERATION_MANUAL['target.capture']!)) expect(() => parseCaptureArgs(example), JSON.stringify(example)).not.toThrow();
  });
});
