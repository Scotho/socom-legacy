import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, validatePack, type PackRef } from '@s2u/creator-contracts';
import { ForgeAgentError } from '../../src/forge/agent/api';
import { createForgeAgentRevisions, createForgeEditorFacade, type ForgeAgentEditor } from '../../src/forge/agent/editorFacade';
import { emptyLayout, type Layout, type LayoutBase } from '../../src/forge/layout';
import type { ForgeLayout, RulesPackFile } from '../../src/forge/rulesAuthoring';

/**
 * FCW-34 (product track, OT.R53; issue #532's acceptance test): the independent capture-the-flag example pack
 * (`packages/creator-contracts/examples/capture-the-flag/`) driven through the Forge's real editor facade, the agent's
 * path (`forge.rules.import`, the entity edits, `forge.rules.check`, `forge.rules.test`, `forge.rules.export`). The
 * facade is driven by a fake editor exactly as `rulesFacade.test.ts` drives it (its rig, copied: the harness only).
 * The layout is the blank floor with the entities the pack names (O4: no map door or switch, so any base plays it);
 * the scripted run and its expected rule trace are the example's own data (`capture-the-flag.run.json`).
 */

type Json = Record<string, unknown>;
const EXAMPLES = fileURLToPath(new URL('../../../creator-contracts/examples/', import.meta.url));
const PACK = ['s2u-pack.json', 'rules/ctf.json'] as const;
/** The pack's files as the import takes them: each member's text, read from the example as it is on disk. */
const packFiles = (): RulesPackFile[] => PACK.map((path) => ({ path, text: readFileSync(`${EXAMPLES}capture-the-flag/${path}`, 'utf8') }));
const packBytes = (path: string): Uint8Array => new Uint8Array(readFileSync(`${EXAMPLES}capture-the-flag/${path}`));
const ctfRun = (): Json & { layout: { zones: Json[]; spawners: Json[] }; script: Json; expect: { fired: string[] }; dropped: { ticks: Json[]; expect: { fired: string[] } } } =>
  JSON.parse(readFileSync(`${EXAMPLES}capture-the-flag.run.json`, 'utf8'));
async function packRef(): Promise<PackRef> {
  const checked = await validatePack(PACK.map((path) => ({ path, bytes: packBytes(path) })), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION });
  if (!checked.ok) throw new Error(`the example must validate: ${JSON.stringify(checked.report.diagnostics)}`);
  return { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash };
}

// The rig of rulesFacade.test.ts, unchanged: a fake editor under the real facade.
function rig(start: ForgeLayout = emptyLayout({ kind: 'blank', library: 'MP2' } as LayoutBase) as ForgeLayout) {
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
    layoutName: () => 'CTF', layoutNow: () => JSON.parse(JSON.stringify(layout)) as ForgeLayout,
    selectionIds: () => [], placementIds: () => new Map(), npcOf: () => undefined, bombKindOf: () => null, lockedOf: () => false,
    entries: () => [], palette: () => [], characters: () => [], charLabel: () => '', absent: () => new Set(), paletteArchive: () => 'MP2',
    chosen: () => null, npcChoice: () => null, favourites: () => new Set(), filter: () => 'all', showChars: () => false, query: () => '',
    hiddenKeys: () => new Set(), baseMap: () => null, charMap: () => null,
    view: () => ({ wireframe: false } as unknown as ReturnType<ForgeAgentEditor['view']>), snap: () => false, gridStep: () => 25,
    turnStep: () => 15, tool: () => 'select', gizmoMode: () => 'translate', camera: () => ({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }),
    named: () => [], namedAt: () => 0,
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
/** The agent's edits that lay out the CTF floor: the two bases and the two flag stands the pack names. */
async function ctfFloor(): Promise<ReturnType<typeof rig>> {
  const r = rig();
  const { layout } = ctfRun();
  for (const zone of layout.zones) await r.run('zone.place', zone);
  for (const spawner of layout.spawners) await r.run('spawner.place', spawner);
  return r;
}
type TestRun = { state: string; fired: string[]; variables: Json; shows: Json[]; applied: Json[]; diagnostics: unknown[] };

describe('FCW-34: the CTF example through the Forge facade (the agent path)', () => {
  it('rules.import on a floor without the bases and stands is refused, naming the missing entity', async () => {
    const e = await refusal(rig().run('rules.import', { files: packFiles() }));
    expect(e.message).toMatch(/ENTITY_MISSING/);
  });

  it('rules.import keeps the pack\'s own digest; the layout requires it and plays its mode', async () => {
    const ref = await packRef();
    const r = await ctfFloor();
    await r.run('rules.import', { files: packFiles() });
    const l = r.now();
    expect(l.rules!.pack).toEqual(ref);
    expect(l.requires).toEqual([ref]);
    expect(l.mode).toEqual({ id: 'ctf', version: '1.0.0', params: {} });
  });

  it('rules.check passes with the entities placed', async () => {
    const r = await ctfFloor();
    await r.run('rules.import', { files: packFiles() });
    // rules.check answers `{ report, record }` (91's box run of f435c4783): the rules' check report is `report`.
    const answer = await r.run('rules.check') as { report: { status: string; diagnostics: unknown[] }; record: unknown };
    expect(answer.report.diagnostics, JSON.stringify(answer)).toEqual([]);
    expect(answer.report.status).toBe('pass');
    expect(answer.record).toBeNull();
  });

  it('rules.test: a SEAL takes the terrorists\' flag to his base three times -- three captures scored, then the round ends', async () => {
    const r = await ctfFloor();
    await r.run('rules.import', { files: packFiles() });
    const run = ctfRun();
    const out = await r.run('rules.test', run.script) as TestRun;
    expect(out.diagnostics).toEqual([]);
    expect(out.state).toBe('on');
    expect(out.fired).toEqual(run.expect.fired);
    const awards = out.applied.filter((a) => a['do'] === 'award');
    expect(awards).toHaveLength(3);
    for (const a of awards) expect([a['to'], a['points']], JSON.stringify(a)).toEqual([{ player: 1 }, 1]);
    expect(out.applied.filter((a) => /round/i.test(String(a['do']))), JSON.stringify(out.applied)).toHaveLength(1);
    expect(Object.entries(out.variables).filter(([k]) => k.startsWith('captures')).map(([, v]) => v), JSON.stringify(out.variables)).toContain(3);
  });

  it('rules.test: a carrier who dies does not score -- the flag goes back to its stand', async () => {
    const r = await ctfFloor();
    await r.run('rules.import', { files: packFiles() });
    const run = ctfRun();
    const out = await r.run('rules.test', { ...run.script, ticks: run.dropped.ticks }) as TestRun;
    expect(out.diagnostics).toEqual([]);
    expect(out.fired).toEqual(run.dropped.expect.fired);
    expect(out.applied.filter((a) => a['do'] === 'award')).toEqual([]);
  });

  it('rules.export gives back the imported pack: its reference and its files byte-equal (O5: never waived)', async () => {
    const ref = await packRef();
    const r = await ctfFloor();
    await r.run('rules.import', { files: packFiles() });
    const out = await r.run('rules.export') as { ref: PackRef; files: RulesPackFile[] };
    expect(out.ref).toEqual(ref);
    expect(out.files).toEqual(packFiles());
    for (const f of out.files) expect(new TextEncoder().encode(f.text)).toEqual(packBytes(f.path));
  });

  it('a clean disable: rules.clear leaves no mode, no rules and no requirement, and rules.test has nothing to run', async () => {
    const ref = await packRef();
    const r = await ctfFloor();
    await r.run('rules.import', { files: packFiles() });
    await r.run('rules.clear');
    const l = r.now();
    expect(l.rules).toBeUndefined();
    expect(l.mode).toBeUndefined();
    expect(l.requires ?? []).not.toContainEqual(ref);
    expect((await refusal(r.run('rules.test', ctfRun().script))).code).toBe('NO_RULES');
  });
});
