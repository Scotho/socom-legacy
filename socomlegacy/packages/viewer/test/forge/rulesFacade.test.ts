import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import {
  ENGINE_CONTRACT_VERSION, ENGINE_CONTRACT_VERSIONS, PACK_FORMAT, PACK_FORMAT_VERSION, PACK_TARGET_US, sha256Hex, validatePack, type PackRef,
} from '@s2u/creator-contracts';
import { decodeBase64, type AgentRequest } from '@s2u/forge-agent-protocol';
import { createForgePageTarget } from '../../src/agent/forgeTarget';
import { createForgeAgentApi, ForgeAgentError, type ForgeAgentPrepared } from '../../src/forge/agent/api';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { createForgeAgentRevisions, createForgeEditorFacade, type ForgeAgentEditor } from '../../src/forge/agent/editorFacade';
import { emptyLayout, type Layout, type LayoutBase } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { FORGE_AUTHORING_SCHEMA, UNSEALED_HASH, type ForgeLayout, type RulesPackFile } from '../../src/forge/rulesAuthoring';
import type { NamedSave } from '../../src/forge/saves';

/**
 * FCW-32 round 2 (product track; the review's F1, F8 and F2's `test` verb): the rules' MCP paths through the real
 * editor facade (`createForgeEditorFacade`, driven by a fake editor as `../forgeEditorFacade.test.ts` drives it) and the
 * real page target (`createForgePageTarget`). An imported rules pack is adopted with its own reference and digest (never
 * rebuilt), re-sealed only at the first edit of its rules; the draft is sealed at every rules edit; `rules.export`,
 * `layout.export` -> `layout.import`, `saves.load` and `forge.export.begin` carry the rules; `rules.test` runs a mode's
 * rules on the room's own rule host against a scripted run, with no room.
 */

type Json = Record<string, unknown>;
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const twoRules = (): Json => ({
  schema: 's2u-rules', vocabulary: 0, id: 'vault.run', name: 'Vault run',
  config: [{ id: 'reward', type: 'int', default: 5, min: 0, max: 50 }],
  variables: [{ id: 'gold', scope: 'player', type: 'int', start: 0, min: 0, max: 1000 }],
  entities: { zones: ['vault'] },
  rules: [
    { id: 'pay', when: { event: 'zone.enter', zone: 'vault' }, then: [{ do: 'variable.add', var: 'gold', who: 'player', amount: { param: 'reward' } }, { do: 'message.show', text: 'Paid' }] },
    { id: 'score', when: 'player.kill', then: [{ do: 'score.award', who: 'attacker', points: 1 }] },
  ],
});
const vaultFloor = (): ForgeLayout => planForgeLayout(emptyLayout({ kind: 'blank', library: 'MP2' } as LayoutBase), 'zone.place',
  { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 50, height: 100 }, []) as ForgeLayout;

/** A rules pack as a hand would write it: pretty-printed, its manifest's own words -- not the Forge's serialisation. */
async function prettyPack(): Promise<{ files: RulesPackFile[]; ref: PackRef }> {
  const member = JSON.stringify(twoRules(), null, 2);
  const bytes = utf8(member);
  const manifest = {
    format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, id: 'hand.vault', version: '2.0.0', name: 'Vault run (by hand)',
    target: PACK_TARGET_US, contract: `^${ENGINE_CONTRACT_VERSION}`, kinds: ['rules'], sides: 'server', dependencies: [],
    files: [{ path: 'rules/mode.json', sha256: await sha256Hex(bytes), size: bytes.length, role: 'rules' }],
    intents: [{ kind: 'new-behaviour', files: ['rules/mode.json'] }],
  };
  const files = [{ path: 's2u-pack.json', text: JSON.stringify(manifest, null, 2) }, { path: 'rules/mode.json', text: member }];
  const checked = await validatePack(files.map((f) => ({ path: f.path, bytes: utf8(f.text) })), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS });
  if (!checked.ok) throw new Error('the hand-written fixture must validate');
  return { files, ref: { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash } };
}

function rig(start: ForgeLayout = vaultFloor(), named: NamedSave[] = []) {
  const base: LayoutBase = { kind: 'blank', library: 'MP2' } as LayoutBase;
  let layout: ForgeLayout = start;
  const picks: Object3D[] = [];
  const committed: ForgeLayout[] = [];
  const editor: ForgeAgentEditor = {
    revisions: createForgeAgentRevisions(),
    play: { execute: vi.fn(() => ({ ok: true, data: null })), status: () => null, read: () => null, cancel: vi.fn() } as unknown as ForgeAgentEditor['play'],
    operations: { active: () => null, get: () => undefined } as unknown as ForgeAgentEditor['operations'],
    shotDriver: null, mapBounds: () => null, savedElsewhereWords: 'Saved elsewhere, reloaded',
    mode: () => 'forge-editor', picks: () => picks, base: () => base, busy: () => false, checking: () => false,
    layoutName: () => 'Vault', layoutNow: () => JSON.parse(JSON.stringify(layout)) as ForgeLayout,
    selectionIds: () => [], placementIds: () => new Map(), npcOf: () => undefined, bombKindOf: () => null, lockedOf: () => false,
    entries: () => [], palette: () => [], characters: () => [], charLabel: () => '', absent: () => new Set(), paletteArchive: () => 'MP2',
    chosen: () => null, npcChoice: () => null, favourites: () => new Set(), filter: () => 'all', showChars: () => false, query: () => '',
    hiddenKeys: () => new Set(), baseMap: () => null, charMap: () => null,
    view: () => ({ wireframe: false } as unknown as ReturnType<ForgeAgentEditor['view']>), snap: () => false, gridStep: () => 25,
    turnStep: () => 15, tool: () => 'select', gizmoMode: () => 'translate', camera: () => ({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }),
    named: () => named, namedAt: () => 0,
    history: { canUndo: () => false, canRedo: () => false, peekUndo: () => null, peekRedo: () => null, undo: vi.fn(), redo: vi.fn() } as unknown as ForgeAgentEditor['history'],
    inMatch: () => false, matchOfLobby: () => false, playing: () => false, statusText: () => '', clipboard: () => [],
    queryAssets: vi.fn(), checkPlacement: vi.fn(), starterContext: vi.fn(), missingPacks: () => [], missingPacksWords: () => '',
    prepareLayout: vi.fn(async (l: Layout) => ({ missing: 0, dispose: vi.fn(), commit: () => { committed.push(l as ForgeLayout); layout = JSON.parse(JSON.stringify(l)) as ForgeLayout; } })),
    applyPicked: vi.fn(), changed: vi.fn(), refreshUndo: vi.fn(), edit: vi.fn(), noteMissingPacks: vi.fn(), adoptLayoutCamera: vi.fn(),
    copySelection: vi.fn(), collectCheck: vi.fn(async () => null), loadArchive: vi.fn(), setPalette: vi.fn(), lookAtPoint: vi.fn(),
    saveCamera: vi.fn(), persistNamed: vi.fn(async () => 'written' as const), startMatch: vi.fn(async () => undefined),
    startPlay: vi.fn(async () => undefined), setView: vi.fn(), setCameraPose: vi.fn(), lookFrom: vi.fn(), focusOn: vi.fn(), setQuery: vi.fn(),
    setPaletteFilter: vi.fn(), choose: vi.fn(), setFavourite: vi.fn(), setSnap: vi.fn(), setTool: vi.fn(), stopPlay: vi.fn(), endMatch: vi.fn(), rereadLists: vi.fn(),
  };
  const facade = createForgeEditorFacade(editor);
  const run = async (operation: string, args: Json = {}): Promise<unknown> => (await facade.prepare(operation, args, () => undefined)).commit();
  return { editor, facade, committed, run, now: () => layout };
}
const refusal = async (p: Promise<unknown>): Promise<ForgeAgentError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ForgeAgentError);
  return e as ForgeAgentError;
};

describe('FCW-32 round 2 (F1): rules.import adopts the pack as it is', () => {
  it('a pretty-printed pack: the layout requires the imported pack\'s own digest, and rules.export gives its files back', async () => {
    const pack = await prettyPack();
    const r = rig();
    await r.run('rules.import', { files: pack.files });
    const l = r.now();
    expect(l.rules!.pack).toEqual(pack.ref);
    expect(l.requires).toEqual([pack.ref]);
    expect(l.mode).toEqual({ id: 'vault.run', version: '2.0.0', params: {} });
    const out = await r.run('rules.export') as { ref: PackRef; files: RulesPackFile[] };
    expect(out.ref).toEqual(pack.ref);
    expect(out.files).toEqual(pack.files);
  });

  it('an edit that leaves the rules as they are keeps the digest; the first edit of the rules re-seals them', async () => {
    const pack = await prettyPack();
    const r = rig();
    await r.run('rules.import', { files: pack.files });
    await r.run('zone.place', { id: 'gate', shape: 'cylinder', at: [100, 0, 0], radius: 5, height: 5 });
    expect(r.now().rules!.pack).toEqual(pack.ref);
    expect(r.now().requires).toEqual([pack.ref]);
    await r.run('rules.rule.set', { rule: { id: 'start', when: 'round.start', then: [{ do: 'message.show', text: 'Go' }] } });
    const sealed = r.now().rules!.pack;
    expect(sealed.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.hash).not.toBe(pack.ref.hash);
    expect(sealed.hash).not.toBe(UNSEALED_HASH);
    expect(r.now().requires).toEqual([sealed]);
    const out = await r.run('rules.export') as { ref: PackRef; files: RulesPackFile[] };
    expect(out.ref).toEqual(sealed);
  });
});

describe('FCW-32 round 2 (F8): the facade\'s rules paths', () => {
  it('seals the draft at every rules edit: rules.new gives a real digest the layout requires', async () => {
    const r = rig();
    await r.run('rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' });
    const pack = r.now().rules!.pack;
    expect(pack.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.hash).not.toBe(UNSEALED_HASH);
    expect(r.now().requires).toEqual([pack]);
    await r.run('rules.set', { spec: twoRules() });
    expect(r.now().rules!.pack.hash).not.toBe(pack.hash);
    expect(r.now().requires).toEqual([r.now().rules!.pack]);
  });

  it('layout.export gives the authoring envelope, which layout.import reads back whole', async () => {
    const r = rig();
    await r.run('rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' });
    await r.run('rules.set', { spec: twoRules() });
    const envelope = await r.run('layout.export') as Json;
    expect(envelope['schema']).toBe(FORGE_AUTHORING_SCHEMA);
    const other = rig(emptyLayout({ kind: 'blank', library: 'MP2' } as LayoutBase));
    await other.run('layout.import', { layout: envelope });
    expect(other.now().rules).toEqual(r.now().rules);
    expect(other.now().zones).toEqual(r.now().zones);
    expect(other.now().mode).toEqual(r.now().mode);
  });

  it('saves.load opens a named save with its rules', async () => {
    const r0 = rig();
    await r0.run('rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' });
    await r0.run('rules.set', { spec: twoRules() });
    const l = r0.now();
    const save: NamedSave = { id: 's1', name: 'Vault', savedAt: 1, record: recordOfLayout(l, 'Vault'), rules: l.rules! };
    const r = rig(emptyLayout({ kind: 'blank', library: 'MP2' } as LayoutBase), [save]);
    await r.run('saves.load', { id: 's1' });
    expect(r.now().rules).toEqual(l.rules);
    expect(r.now().mode).toEqual(l.mode);
  });

  it('forge.export.begin sends the envelope with the rules over the page target', async () => {
    const r = rig();
    await r.run('rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' });
    await r.run('rules.set', { spec: twoRules() });
    const api = createForgeAgentApi(r.facade);
    const target = createForgePageTarget({ api, build: 'test' });
    const request = (operation: string, args: Json, id: string): AgentRequest => ({ version: 1, requestId: id, sessionId: 'placeholder', targetId: 't', epoch: 'e', operation, args });
    const begin = await target.dispatch(request('forge.export.begin', {}, 'a'), new AbortController().signal);
    expect(begin.outcome, JSON.stringify(begin)).toBe('ok');
    const { transferId, size, chunkBytes } = begin.data as { transferId: string; size: number; chunkBytes: number };
    const parts: Uint8Array[] = [];
    for (let i = 0; i * chunkBytes < size; i++) {
      const chunk = await target.dispatch(request('forge.export.chunk', { transferId, index: i }, `c${i}`), new AbortController().signal);
      parts.push(decodeBase64((chunk.data as { data: string }).data, chunkBytes));
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    const doc = JSON.parse(new TextDecoder().decode(all)) as Json;
    expect(doc['schema']).toBe(FORGE_AUTHORING_SCHEMA);
    expect(doc['rules']).toEqual(r.now().rules);
    api.dispose();
  });
});

describe('FCW-32 round 2 (F2): rules.test runs a two-rule mode on the room\'s rule host', () => {
  it('a scripted run: entering the vault pays the configured reward and says so, a kill scores', async () => {
    const r = rig();
    await r.run('rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' });
    await r.run('rules.set', { spec: twoRules() });
    await r.run('rules.config.set', { params: { reward: 7 } });
    const out = await r.run('rules.test', {
      seed: 3,
      players: [{ id: 1, team: 'seal', at: [500, 0, 0] }, { id: 2, team: 'terrorist', at: [600, 0, 0] }],
      ticks: [{ move: { '1': [0, 0, 0] } }, { events: [{ name: 'player.kill', attacker: 1, victim: 2 }] }],
    }) as { state: string; fired: string[]; variables: Json; shows: Json[]; applied: Json[]; diagnostics: unknown[] };
    expect(out.state).toBe('on');
    expect(out.fired).toEqual(['pay', 'score']);
    expect(out.variables['gold@1']).toBe(7);
    expect(out.shows).toEqual([{ tick: 2, kind: 'message', text: 'Paid', to: null }]);
    expect(out.applied).toEqual([{ tick: 3, do: 'award', to: { player: 1 }, points: 1 }]);
    expect(out.diagnostics).toEqual([]);
  });

  it('round-2 re-look F7: the script is validated -- moves as points, alive as booleans, events by the vocabulary -- INVALID_ARGUMENT', async () => {
    const r = rig();
    await r.run('rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' });
    await r.run('rules.set', { spec: twoRules() });
    const players = [{ id: 1, team: 'seal' }];
    const bad: [string, Json][] = [
      ['a move that is no point', { players, ticks: [{ move: { '1': 5 } }] }],
      ['a point of two numbers', { players, ticks: [{ move: { '1': [1, 2] } }] }],
      ['a move for a seat id that is no integer', { players, ticks: [{ move: { one: [1, 2, 3] } }] }],
      ['alive that is no boolean', { players, ticks: [{ alive: { '1': 'yes' } }] }],
      ['an event the vocabulary does not name', { players, ticks: [{ events: [{ name: 'no.such.event' }] }] }],
      ['an event with no name', { players, ticks: [{ events: [{ attacker: 1 }] }] }],
      ['a seat that is no integer', { players, ticks: [{ events: [{ name: 'player.kill', attacker: 'x', victim: 2 }] }] }],
      ['an event field that is no number or text', { players, ticks: [{ events: [{ name: 'player.hit', fields: { amount: { a: 1 } } }] }] }],
    ];
    for (const [what, script] of bad) {
      const e = await refusal(r.run('rules.test', script));
      expect(e.code, what).toBe('INVALID_ARGUMENT');
    }
    // a good script of the same shapes still runs
    await expect(r.run('rules.test', { players, ticks: [{ move: { '1': [0, 0, 0] }, alive: { '1': true }, events: [{ name: 'player.kill', attacker: 1, victim: 2, fields: { weapon: 'm4' } }] }] })).resolves.toBeTruthy();
  });

  it('refuses a layout with no rules mode (NO_RULES), and a pack the room\'s host refuses (INVALID_RULES, its code and field)', async () => {
    expect((await refusal(rig().run('rules.test', {}))).code).toBe('NO_RULES');
    const r = rig();
    await r.run('rules.new', { pack: 'my.gate', version: '1.0.0', id: 'gate.run', name: 'Gate run' });
    await r.run('rules.set', { spec: { schema: 's2u-rules', vocabulary: 0, id: 'gate.run', name: 'Gate run', entities: { doors: ['bdoor_4'] },
      rules: [{ id: 'open', when: 'round.start', then: [{ do: 'door.open', door: 'bdoor_4' }] }] } });
    const e = await refusal(r.run('rules.test', {}));
    expect(e.code).toBe('INVALID_RULES');
    expect(e.message).toMatch(/rules\.ENTITY_MISSING at entities\.doors\[0\]: The layout has no door bdoor_4/);   // the blank floor has no doors
  });
});
