// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { contentAssetKey, readContentMapDefinition, type ContentMapDefinition, type ContentRef, type CreatorLayoutRecord, type Layout } from '@s2u/creator-contracts';
import { MAP_PACK, MAP_REF, minimalMapJson, PROP_PACK } from '../../creator-contracts/test/contentMapFixtures';
import { emptyLayout } from '../src/forge/layout';
import { recordOfLayout } from '../src/forge/record';
import { FORGE_SAVES_KEY, writeSaves, type NamedSave } from '../src/forge/saves';
import { SAVES_DB_NAME, SavesStore } from '../src/forge/savesStore';
import { customMapRows } from '../src/forge/customMaps';
import { readAssetDefinition, type AssetDefinition } from '../src/packs/content/assets';
import { loadContentMap } from '../src/packs/content/map';
import { LoadingJoin } from '../src/loadingJoin';
import type { LoadedMap } from '../src/loadMap';
import {
  composeStaticPieces, customPlan, listCustomMaps, loadTestroomContent, mountCustomMapsSelect, readTestroomSaves, type TestroomContentDeps,
} from '../src/testroomContent';
import { solidJson } from './packs/contentFixtures';

/**
 * FP-6 item 5 (FP.R13; product track, a test instrument -- a browser adaptation with no original): the room's Custom Maps
 * select (a second select beside its map select, which stays as it is) lists the Forge's own rows (`../src/forge/customMaps`
 * `customMapRows`: bundles, bare content maps, saves) and opens each: a content map as itself, a bundle or a save on its
 * base with the layout's STATIC PIECES only (`composeStaticPieces`: the Forge's piece compose, `../src/forge/matchMap`
 * `composeMatchMap`) -- none of a layout's spawns, NPCs, rules or objectives.
 */

const CRATE: ContentRef = { kind: 'pack', pack: PROP_PACK, assetId: 'crate' };
const crate = (): AssetDefinition => {
  const got = readAssetDefinition(solidJson(), CRATE);
  if (Array.isArray(got)) throw new Error('no crate');
  return got as AssetDefinition;
};
const defOf = (): ContentMapDefinition => readContentMapDefinition(minimalMapJson(), MAP_REF) as ContentMapDefinition;
const resolve = (r: ContentRef): AssetDefinition | null => (r.assetId === 'crate' ? crate() : null);
const M = (x: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1];

/** A layout on the yard: one pack piece (a crate), one disc piece of an archive not loaded, two spawns and an NPC. */
const yardLayout = (): Layout => ({
  ...emptyLayout({ kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP2' } as never),
  pieces: [
    { asset: contentAssetKey(CRATE), m: M(400, 400), content: CRATE },
    { asset: 'MP5:a_dumpster', m: M(-400, 400) },
  ],
  spawns: [{ team: 'A', p: [100, 0, 100], yaw: 0 }, { team: 'B', p: [-100, 0, -100], yaw: 0 }],
  npcs: [{ side: 1, type: 0, p: [0, 0, 300], yaw: 0 }],
  objectives: { gameType: 2 },
} as unknown as Layout);
const yardRecord = (): CreatorLayoutRecord => recordOfLayout({ ...yardLayout(), name: 'Sample Yard' }, 'Sample Yard') as CreatorLayoutRecord;
const discSave = (): NamedSave => ({ id: 's1', name: 'Crates on MP2', savedAt: 1, record: recordOfLayout({ ...emptyLayout({ kind: 'map', archive: 'MP2' }), pieces: [{ asset: contentAssetKey(CRATE), m: M(0, 0), content: CRATE }] }, 'Crates on MP2') });
const blankSave = (): NamedSave => ({ id: 's2', name: 'Flat', savedAt: 1, record: recordOfLayout(emptyLayout({ kind: 'blank', library: 'MP2' }), 'Flat') });
const lists = () => ({
  records: [{ digest: 'abc123', name: 'Sample Yard', layout: yardRecord() }],
  mapIndex: [{ ref: { kind: 'pack' as const, pack: { ...MAP_PACK, id: 'example.dunes' }, assetId: 'dunes' }, name: 'Dunes' }],
  saves: [discSave(), blankSave()],
});

describe('FP-6 item 5: what each Custom Maps row opens', () => {
  it('a bundle opens its content base with the base\'s library, carrying its layout for the pieces', () => {
    const plan = customPlan('custom:abc123', lists());
    expect(plan.kind).toBe('content');
    if (plan.kind !== 'content') return;
    expect(plan.open).toEqual({ ref: MAP_REF, library: 'MP2', name: 'Sample Yard' });
    expect(plan.layout?.pieces.length).toBe(2);
  });
  it('a bare content map opens as itself, no library named, no layout', () => {
    const plan = customPlan('content:example.dunes@1.0.0/dunes', lists());
    expect(plan).toEqual({ kind: 'content', open: { ref: lists().mapIndex[0]!.ref, library: null, name: 'Dunes' }, layout: null });
  });
  it('a save on a disc map opens that map through the room\'s own load, with its pieces', () => {
    const plan = customPlan('save:s1', lists());
    expect(plan.kind).toBe('disc');
    if (plan.kind !== 'disc') return;
    expect([plan.archive, plan.name, plan.layout.pieces.length]).toEqual(['MP2', 'Crates on MP2', 1]);
  });
  it('a blank-floor save, a row gone and an unknown value are refused in words', () => {
    expect(customPlan('save:s2', lists())).toEqual({ kind: 'refused', words: 'Flat stands on the Forge\'s blank floor: open it in the Forge' });
    expect(customPlan('custom:gone', lists())).toEqual({ kind: 'refused', words: 'That custom map is no longer installed' });
    expect(customPlan('save:gone', lists())).toEqual({ kind: 'refused', words: 'That save is no longer in this browser' });
    expect(customPlan('content:x@1/y', lists())).toEqual({ kind: 'refused', words: 'That content map is no longer installed' });
    expect(customPlan('MP2', lists())).toEqual({ kind: 'refused', words: 'That is not a custom map' });
  });
});

describe('FP-6 item 5: a layout\'s static pieces on its base, nothing else', () => {
  it('the pack piece is solid and drawn, a disc piece of an archive not here is left out and counted; the base keeps its own spawns', async () => {
    const base = await loadContentMap(defOf());
    const out = composeStaticPieces(base, yardLayout(), new Map(), resolve);
    expect(out.map.ground!.owners.map((o) => o.path)).toEqual(['content/floor', 'content/divider', 'forge/piece_0']);
    expect(out.props.map((p) => [p.def.ref.assetId, p.m[12], p.m[14]])).toEqual([['crate', 400, 400]]);
    expect(out.missing).toBe(1);
    expect(out.map.slots).toEqual(base.slots);              // the layout's spawns and NPC seats are not taken
    expect(out.map.respawns).toEqual(base.slots);
    expect(out.map.gameType).toBe(base.gameType);           // the layout's objectives are not taken
    expect(out.map.actions).toEqual(base.actions);
    expect(out.map.collision!.positions.length).toBeGreaterThan(base.collision!.positions.length);   // the overlay's lines too
  });
  it('a layout with no pieces leaves the base as it is', async () => {
    const base = await loadContentMap(defOf());
    const out = composeStaticPieces(base, { ...yardLayout(), pieces: [] }, new Map(), resolve);
    expect(out).toEqual({ map: base, props: [], missing: 0 });
  });
  it('loadTestroomContent with a layout shows the base with its pieces and draws the pieces with the map\'s own props', async () => {
    const join = new LoadingJoin(0);
    let wanted = 0;
    const shown: LoadedMap[] = [];
    const drawn: number[] = [];
    const deps: TestroomContentDeps = {
      begin: () => { wanted++; join.begin(wanted, undefined, 0); return wanted; }, wanted: () => wanted,
      source: async () => ({ map: () => minimalMapJson(), asset: resolve }), library: async () => null,
      show: (m) => { shown.push(m); }, answer: () => undefined, drawProps: (_l, p) => { drawn.push(p.length); },
      fail: (l) => { join.failed(l); },
    };
    expect(await loadTestroomContent({ ref: MAP_REF, library: 'MP2' }, deps, yardLayout())).toBe('shown');
    expect(shown[0]!.ground!.owners.map((o) => o.path)).toContain('forge/piece_0');
    expect(drawn).toEqual([1]);
  });
});

describe('FP-6 item 5: the room\'s Custom Maps select', () => {
  const page = (): { anchor: HTMLElement; chosen: string[]; select: ReturnType<typeof mountCustomMapsSelect> } => {
    document.body.innerHTML = '<section id="map-section"><div class="s2u-field" id="maps-field"><select id="maps"><option value="RUN/MP2.ZDB">Frostfire</option></select></div></section>';
    const anchor = document.getElementById('maps-field')!;
    const chosen: string[] = [];
    return { anchor, chosen, select: mountCustomMapsSelect(document, anchor, (v) => { chosen.push(v); }) };
  };
  it('is a second select after the map select, hidden while there is no row; the map select is untouched', () => {
    const p = page();
    const field = document.getElementById('custom-maps-field')!;
    expect(p.anchor.nextElementSibling).toBe(field);
    expect(field.hidden).toBe(true);
    expect(document.querySelector('label[for="custom-maps"]')?.textContent).toBe('Custom Maps');
    p.select.set([]);
    expect(field.hidden).toBe(true);
    expect(document.querySelectorAll('#maps option').length).toBe(1);
  });
  it('PR #756 P2 (3): a choice resets the select to its prompt, so A, then a disc map, then A again opens A again', () => {
    const p = page();
    p.select.set(customMapRows({ ...lists(), available: [MAP_PACK, PROP_PACK] }));
    const select = document.getElementById('custom-maps') as HTMLSelectElement;
    const pick = (v: string): void => { select.value = v; select.dispatchEvent(new Event('change')); };
    pick('custom:abc123');                                      // A
    expect(select.value).toBe('');                              // back on the prompt once handed on
    (document.getElementById('maps') as HTMLSelectElement).value = 'RUN/MP2.ZDB';   // B, by the room's own map select
    pick('custom:abc123');                                      // A again: a change, so it opens
    expect(p.chosen).toEqual(['custom:abc123', 'custom:abc123']);
  });

  it('lists the rows by the Forge\'s labels; choosing one hands its value on', () => {
    const p = page();
    p.select.set(customMapRows({ ...lists(), available: [MAP_PACK, PROP_PACK] }));
    expect(document.getElementById('custom-maps-field')!.hidden).toBe(false);
    const options = [...document.querySelectorAll<HTMLOptionElement>('#custom-maps option')];
    expect(options.map((o) => o.textContent)).toEqual(['Choose a custom map', 'Sample Yard · Ready', 'Dunes · Ready', 'Crates on MP2 · Ready', 'Flat · Ready']);
    const select = document.getElementById('custom-maps') as HTMLSelectElement;
    select.value = 'custom:abc123';
    select.dispatchEvent(new Event('change'));
    expect(p.chosen).toEqual(['custom:abc123']);
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(p.chosen).toEqual(['custom:abc123']);              // the prompt row opens nothing
  });
});

/** The page's wiring, read from its source (`../src/main.ts` is not mountable in a unit test). */
const MAIN = readFileSync(resolvePath(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');
const body = (from: string, to: string): string => { const a = MAIN.indexOf(from); const b = MAIN.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : MAIN.slice(a, b); };

describe('FP-6 item 5: main.ts opens each row by its kind', () => {
  const open = body('const openCustom = ', '\n};\n');
  it('mounts the select after the map select\'s field, outside the replay\'s world, listing the Forge\'s rows', () => {
    expect(MAIN).toContain("mountCustomMapsSelect(document, document.getElementById('maps')?.closest('.s2u-field') ?? null, (v) => { void openCustom(v); })");
    expect(MAIN).toContain('customSelect.set(await tc.listCustomMaps(await tc.pageContentSource(), pageIndexedDb()));');
  });
  it('a refusal is said; a content row (bare, or a bundle\'s or save\'s base) goes to loadContent with its layout', () => {
    // PR #756 P2: the row's plan, its refusal and its waits are `openCustomRow`'s (`../src/testroomContent`, pinned in
    // `./testroomCustomSelection.test.ts`); main.ts hands it the room's loads.
    expect(open).toContain('await tc.openCustomRow(value, {');
    expect(open).toContain('loadContent: (o, layout) => { void loadContent(o, layout, current).catch(');
  });
  it('a save on a disc map goes through the room\'s own load, its pieces composed when the worker gives the map', () => {
    expect(open).toContain('load(path);');
    expect(open).toContain('pendingPieces = { load: wantedMap, tc: chunk, compose };');
    expect(MAIN).toContain('const pieced = piecesOnShow(message.id, message.map);');
    expect(MAIN).toContain('show(pieced ? customOffline.mark(pieced.map) : message.map);');
    expect(MAIN).toContain('if (pieced) drawContentProps(pieced.tc, message.id, pieced.props);');
  });
  it('the disc save\'s pieces are drawn: the page\'s own line hands drawContentProps the chunk, the load and the props', () => {
    // The batch review's F1: the line ran with two arguments after drawContentProps took three -- the pieces' hull composed
    // and nothing drawn (invisible walls). The line as main.ts holds it, run against a fake drawContentProps.
    const line = MAIN.match(/^\s*(if \(pieced\) drawContentProps\([^;]*\);)$/m)?.[1];
    expect(line).toBeDefined();
    const seen: unknown[][] = [];
    const tc = { chunk: true };
    const props = [{ def: { id: 'crate' }, m: [] }];
    new Function('pieced', 'message', 'drawContentProps', line!)({ map: {}, props, tc }, { id: 7 }, (...a: unknown[]) => { seen.push(a); });
    expect(seen).toEqual([[tc, 7, props]]);
    // The definition's three parameters, the line's three arguments.
    expect(MAIN).toContain("function drawContentProps(tc: typeof import('./testroomContent'), load: number, props: readonly ContentPropPlacement[]): void {");
  });
});

describe('FP-6 item 5: the room reads the Forge\'s saves, never writing them', () => {
  it('lists the rows over the source and the saves (listCustomMaps: the Forge\'s customMapRows)', async () => {
    const idb = new FakeFactory() as unknown as IDBFactory;
    const l = lists();
    const rows = await listCustomMaps({ customMaps: () => l.records as never, mapIndex: () => l.mapIndex, availablePacks: () => [MAP_PACK] }, idb);
    expect(rows.map((r) => [r.kind, r.value])).toEqual([['bundle', 'custom:abc123'], ['content', 'content:example.dunes@1.0.0/dunes']]);
  });
  it('no saves database: none, and none is made', async () => {
    const idb = new FakeFactory() as unknown as IDBFactory;
    expect(await readTestroomSaves(idb)).toEqual([]);
    expect((await idb.databases()).map((d) => d.name)).toEqual([]);
  });
  it('reads the named saves the Forge wrote', async () => {
    const idb = new FakeFactory() as unknown as IDBFactory;
    let text: string | null = null;
    writeSaves([discSave()], { get: () => text, set: (k, v) => { if (k === FORGE_SAVES_KEY) text = v; } });
    const store = new SavesStore(idb, SAVES_DB_NAME);
    await store.open();
    expect(await store.write('saves', text!, 0)).toBe('written');
    store.close();
    expect((await readTestroomSaves(idb)).map((s) => [s.id, s.name])).toEqual([['s1', 'Crates on MP2']]);
  });
});
