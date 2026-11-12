import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import { behaviourCatalogue, ENGINE_CONTRACT_VERSIONS, PACK_TARGET_US, validatePack, type LayoutBase, type PackRef } from '@s2u/creator-contracts';
import { ForgeAgentError } from '../../src/forge/agent/api';
import { adoptForgeRules, planForgeLayout } from '../../src/forge/agent/commands';
import { createForgeAgentRevisions, createForgeEditorFacade, type ForgeAgentEditor } from '../../src/forge/agent/editorFacade';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { forgeAuthoringText, importRulesPack, layoutOfAuthoring, readForgeAuthoring, type ForgeLayout, type RulesPackFile } from '../../src/forge/rulesAuthoring';

/**
 * Issue #766 (product track, OT.R53): the zombie-wave example through the Forge's editor facade, the same path as
 * paintball and capture the flag (`forge.rules.import`, `forge.rules.check`, `forge.rules.test`, `forge.rules.export`).
 * The layout's base is Crossroads (MP72). The script and the trace are `zombie-waves.run.json`.
 */

type Json = Record<string, unknown>;
const EXAMPLES = fileURLToPath(new URL('../../../creator-contracts/examples/', import.meta.url));
const PACK = ['s2u-pack.json', 'rules/waves.json'] as const;
const packFiles = (): RulesPackFile[] => PACK.map((path) => ({ path, text: readFileSync(`${EXAMPLES}zombie-waves/${path}`, 'utf8') }));
const packBytes = (path: string): Uint8Array => new Uint8Array(readFileSync(`${EXAMPLES}zombie-waves/${path}`));
interface Expectation {
  fired: string[];
  messages: string[];
  phase: string;
  wave: number;
  left: number;
  cash: number;
  awards: number;
  winner: 'seal' | null;
  releases: number;
}
interface WaveRun {
  layout: { base: LayoutBase; spawners: Json[] };
  script: Json;
  expect: Expectation;
  wipe: { script: Json; expect: Expectation };
}
const wavesRun = (): WaveRun => JSON.parse(readFileSync(`${EXAMPLES}zombie-waves.run.json`, 'utf8'));
const LAYOUT_FILE = `${EXAMPLES}zombie-waves.crossroads.json`;
async function packRef(): Promise<PackRef> {
  const checked = await validatePack(PACK.map((path) => ({ path, bytes: packBytes(path) })), { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSIONS, handlers: behaviourCatalogue() });
  if (!checked.ok) throw new Error(`the example must validate: ${JSON.stringify(checked.report.diagnostics)}`);
  return { id: checked.ref.id, version: checked.ref.version, hash: checked.ref.hash };
}

function rig(start: ForgeLayout = emptyLayout({ kind: 'map', archive: 'MP72' }) as ForgeLayout) {
  const base: LayoutBase = { kind: 'map', archive: 'MP72' };
  let layout: ForgeLayout = start;
  const picks: Object3D[] = [];
  const committed: ForgeLayout[] = [];
  const editor: ForgeAgentEditor = {
    revisions: createForgeAgentRevisions(),
    play: { execute: vi.fn(() => ({ ok: true, data: null })), status: () => null, read: () => null, cancel: vi.fn() } as unknown as ForgeAgentEditor['play'],
    operations: { active: () => null, get: () => undefined } as unknown as ForgeAgentEditor['operations'],
    shotDriver: null, mapBounds: () => null, savedElsewhereWords: 'Saved elsewhere, reloaded',
    mode: () => 'forge-editor', picks: () => picks, base: () => base, busy: () => false, checking: () => false,
    layoutName: () => 'Zombie waves', layoutNow: () => JSON.parse(JSON.stringify(layout)) as ForgeLayout,
    selectionIds: () => [], placementIds: () => new Map(), npcOf: () => undefined, bombKindOf: () => null, lockedOf: () => false,
    entries: () => [], palette: () => [], characters: () => [], charLabel: () => '', absent: () => new Set(), paletteArchive: () => 'MP72',
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
async function crossroads(): Promise<ReturnType<typeof rig>> {
  const r = rig();
  for (const spawner of wavesRun().layout.spawners) await r.run('spawner.place', spawner);
  return r;
}
/** The authoring file a browser build opens: Crossroads, the horde placed, the pack imported. */
export async function zombieWaveEnvelope(): Promise<string> {
  const { layout } = wavesRun();
  let current = emptyLayout(layout.base) as ForgeLayout;
  for (const spawner of layout.spawners) current = planForgeLayout(current, 'spawner.place', spawner, []);
  current = adoptForgeRules(current, await importRulesPack(packFiles()));
  const text = forgeAuthoringText(current, 'Zombie waves');
  if ('why' in text) throw new Error(text.why);
  return text.text;
}
type TestRun = { state: string; fired: string[]; variables: Json; phase: string | null; shows: Json[]; applied: Json[]; diagnostics: { code: string; text: string }[] };

function expectTrace(out: TestRun, want: Expectation): void {
  expect(out.diagnostics, JSON.stringify(out.diagnostics)).toEqual([]);
  expect(out.state).toBe('on');
  expect(out.fired).toEqual(want.fired);
  expect(out.phase).toBe(want.phase);
  expect(out.variables['wave']).toBe(want.wave);
  expect(out.variables['left']).toBe(want.left);
  expect(out.variables['cash@1']).toBe(want.cash);
  const awards = out.applied.filter((a) => a['do'] === 'award');
  expect(awards).toHaveLength(want.awards);
  for (const a of awards) expect([a['to'], a['points']], JSON.stringify(a)).toEqual([{ player: 1 }, 1]);
  const ends = out.applied.filter((a) => a['do'] === 'round.end');
  expect(ends, JSON.stringify(out.applied)).toEqual([{ tick: expect.any(Number), do: 'round.end', winner: want.winner }]);
  expect(out.shows.filter((s) => s['kind'] === 'message').map((s) => s['text'])).toEqual(want.messages);
}

describe('issue #766: zombie waves through the Forge facade (Crossroads, offline)', () => {
  it('rules.import on Crossroads without the horde is refused, naming the missing spawner', async () => {
    const e = await refusal(rig().run('rules.import', { files: packFiles() }));
    expect(e.message).toMatch(/ENTITY_MISSING/);
  });

  it('rules.import keeps the pack\'s own digest; the layout requires it and plays its mode on MP72', async () => {
    const ref = await packRef();
    const r = await crossroads();
    await r.run('rules.import', { files: packFiles() });
    const l = r.now();
    expect(l.base).toEqual({ kind: 'map', archive: 'MP72' });
    expect(l.spawners?.map((s) => s.id)).toEqual(['horde']);
    expect(l.rules!.pack).toEqual(ref);
    expect(l.requires).toEqual([ref]);
    expect(l.mode).toEqual({ id: 'zombie-waves', version: '1.0.0', params: {} });
    expect(JSON.stringify(l.rules!.spec)).not.toContain('chase-melee');
  });

  it('rules.check passes with the horde placed', async () => {
    const r = await crossroads();
    await r.run('rules.import', { files: packFiles() });
    const answer = await r.run('rules.check') as { report: { status: string; diagnostics: unknown[] }; record: unknown };
    expect(answer.report.diagnostics, JSON.stringify(answer)).toEqual([]);
    expect(answer.report.status).toBe('pass');
    expect(answer.record).toBeNull();
  });

  it('rules.test: three waves clear, and a second empty report during the rest does not open the next wave', async () => {
    const r = await crossroads();
    await r.run('rules.import', { files: packFiles() });
    const run = wavesRun();
    const out = await r.run('rules.test', run.script) as TestRun;
    expectTrace(out, run.expect);
  });

  it('rules.test: the squad wiped during wave 1 ends the round and does not start wave 2', async () => {
    const r = await crossroads();
    await r.run('rules.import', { files: packFiles() });
    const { wipe } = wavesRun();
    const out = await r.run('rules.test', wipe.script) as TestRun;
    expectTrace(out, wipe.expect);
  });

  it('rules.export gives back the imported pack, byte-equal', async () => {
    const ref = await packRef();
    const r = await crossroads();
    await r.run('rules.import', { files: packFiles() });
    const out = await r.run('rules.export') as { ref: PackRef; files: RulesPackFile[] };
    expect(out.ref).toEqual(ref);
    expect(out.files).toEqual(packFiles());
    for (const f of out.files) expect(new TextEncoder().encode(f.text)).toEqual(packBytes(f.path));
  });

  it('a clean disable: rules.clear leaves no mode and no requirement, and rules.test has nothing to run', async () => {
    const ref = await packRef();
    const r = await crossroads();
    await r.run('rules.import', { files: packFiles() });
    await r.run('rules.clear');
    const l = r.now();
    expect(l.rules).toBeUndefined();
    expect(l.mode).toBeUndefined();
    expect(l.requires ?? []).not.toContainEqual(ref);
    expect(l.base).toEqual({ kind: 'map', archive: 'MP72' });
    expect((await refusal(r.run('rules.test', wavesRun().script))).code).toBe('NO_RULES');
  });

  it('the Crossroads authoring file is that import: MP72, the horde, the pack\'s own draft', async () => {
    const ref = await packRef();
    const text = readFileSync(LAYOUT_FILE, 'utf8');
    expect(text).toBe(await zombieWaveEnvelope());
    const opened = layoutOfAuthoring(readForgeAuthoring(text, 'Zombie waves'));
    expect(opened.base).toEqual({ kind: 'map', archive: 'MP72' });
    expect(opened.spawners?.map((s) => [s.id, s.source, s.side, s.type])).toEqual([['horde', 'npc', 'terrorist', 0]]);
    expect(opened.rules!.pack).toEqual(ref);
    expect(opened.mode).toEqual({ id: 'zombie-waves', version: '1.0.0', params: {} });
    expect(opened.requires).toEqual([ref]);
  });
});
