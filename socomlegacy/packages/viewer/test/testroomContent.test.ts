import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Texture } from 'three';
import type { ContentRef } from '@s2u/creator-contracts';
import { MAP_REF, minimalMapJson, PROP_PACK } from '../../creator-contracts/test/contentMapFixtures';
import { LoadingJoin, pageLanes } from '../src/loadingJoin';
import type { LoadedMap } from '../src/loadMap';
import { readAssetDefinition, type AssetDefinition } from '../src/packs/content/assets';
import { contentLaneAnswers, contentPropsObject, loadTestroomContent, type TestroomContentDeps, type TestroomContentSource } from '../src/testroomContent';
import { solidJson } from './packs/contentFixtures';

/**
 * FP-6 item 5 (FP.R13; product track, a test instrument -- a browser adaptation with no original): the test room opens an
 * authored map on the main thread (`../src/testroomContent` `loadTestroomContent`, wired by `../src/main.ts` `loadContent`)
 * beside its worker's disc load, under the SAME load hold (`../src/loadingJoin` `LoadingJoin`). Here the page is a fake:
 * the hold is the real `LoadingJoin` (hold 0, the solo room's), its lanes read by the real `pageLanes`, so each pin says
 * whether the load screen releases. The load screen must always release: a refused, failed or thrown load lets it go.
 */

const crate = (): AssetDefinition => {
  const got = readAssetDefinition(solidJson(), { kind: 'pack', pack: PROP_PACK, assetId: 'crate' });
  if (Array.isArray(got)) throw new Error('no crate');
  return got as AssetDefinition;
};
const tick = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await Promise.resolve(); };

/** A disc map standing in for the room's shown map (the content map's library): its path, archive and a body. */
const LIBRARY = { path: 'RUN/MP2.ZDB', archive: 'MP2', name: 'Frostfire', body: { id: 'seal' } } as unknown as LoadedMap;

function fakePage(over: Partial<TestroomContentDeps> = {}, src: Partial<TestroomContentSource> = {}) {
  const join = new LoadingJoin(0);
  let wanted = 0;
  const facts = { loadedSound: -1, loadedEffects: -1, loadedArmory: -1 };
  const shown: { map: LoadedMap; load: number }[] = [];
  const asked: { load: number; path: string; archive: string }[] = [];
  const failed: { load: number; words: string }[] = [];
  const libraries: (string | null)[] = [];
  const drawn: { load: number; count: number }[] = [];
  const source: TestroomContentSource = {
    map: (ref) => (ref.assetId === MAP_REF.assetId ? minimalMapJson() : null),
    asset: () => null,
    ...src,
  };
  const deps: TestroomContentDeps = {
    begin: () => { wanted++; join.begin(wanted, undefined, 0); return wanted; },
    wanted: () => wanted,
    source: async () => source,
    library: async (stem) => { libraries.push(stem); return null; },
    show: (map, load) => { shown.push({ map, load }); },
    answer: (load, library) => {
      const a = contentLaneAnswers(load, library);
      if (a.kind === 'ask') asked.push({ load, path: a.path, archive: a.archive });
      else Object.assign(facts, { loadedSound: a.loadedSound, loadedEffects: a.loadedEffects, loadedArmory: a.loadedArmory });
    },
    drawProps: (load, props) => { drawn.push({ load, count: props.length }); },
    fail: (load, words) => { join.failed(load); failed.push({ load, words }); },
    ...over,
  };
  const view = {};
  /** One frame of the page's hold, the scene warmed and the player's lane off (a walk-less room). */
  const frame = (): string => join.frame(wanted, pageLanes({
    load: wanted, playOn: false, view, worldWarmed: view, worldWarmFailed: null, playAnswer: 'none', walkWarmed: true,
    noArmory: false, armoryReady: false, url: false, netLoad: -1, status: null, ...facts,
  }), 1, 0);
  return { join, deps, shown, asked, failed, libraries, drawn, frame, facts, wanted: () => wanted };
}

describe('FP-6 item 5: the test room loads a content map under the load hold', () => {
  it('a bare content map (no library, no archive) shows, its lanes are answered "none", and the hold releases', async () => {
    const p = fakePage();
    const out = await loadTestroomContent({ ref: MAP_REF, library: null }, p.deps);
    expect(out).toBe('shown');
    expect(p.libraries).toEqual([null]);                     // a bare content map names no library: the room's own is asked
    expect(p.shown.map((s) => [s.map.name, s.load, s.map.ground ? 'ground' : 'none', s.map.slots.length])).toEqual([['Yard', 1, 'ground', 2]]);
    expect(p.asked).toEqual([]);
    expect(p.facts).toEqual({ loadedSound: 1, loadedEffects: 1, loadedArmory: 1 });
    expect(p.join.blocked).toBe(true);
    expect(p.frame()).toBe('released');
    expect(p.join.blocked).toBe(false);
    expect(p.failed).toEqual([]);
  });

  it('with a library the lanes are asked of the library map (its path and archive), as a disc map\'s are of its own', async () => {
    const libraries: (string | null)[] = [];
    const p = fakePage({ library: async (stem) => { libraries.push(stem); return LIBRARY; } });
    expect(await loadTestroomContent({ ref: MAP_REF, library: 'MP2' }, p.deps)).toBe('shown');
    expect(libraries).toEqual(['MP2']);
    expect(p.asked).toEqual([{ load: 1, path: 'RUN/MP2.ZDB', archive: 'MP2' }]);
    expect((p.shown[0]!.map as unknown as { body: unknown }).body).toEqual({ id: 'seal' });   // the library's characters
    expect(p.shown[0]!.map.archive).toBe('MP2');
  });

  it('a map whose pack is not here is refused in words: the hold releases, nothing is shown', async () => {
    const p = fakePage();
    const other: ContentRef = { ...MAP_REF, assetId: 'gone' };
    expect(await loadTestroomContent({ ref: other, library: null, name: 'Gone Yard' }, p.deps)).toBe('refused');
    expect(p.shown).toEqual([]);
    expect(p.failed).toEqual([{ load: 1, words: 'Gone Yard did not load: its pack fcw10.maps@1.0.0 is not on this device' }]);
    expect(p.join.blocked).toBe(false);
  });

  it('a map the loader refuses (an unresolved prop) says the loader\'s own words and releases the hold', async () => {
    const prop = { content: { kind: 'pack', pack: PROP_PACK, assetId: 'crate' }, at: [5, 0, 5], yaw: 0 };
    const p = fakePage({}, { map: () => minimalMapJson({ props: [prop], dependencies: [PROP_PACK] }) });
    expect(await loadTestroomContent({ ref: MAP_REF, library: null }, p.deps)).toBe('refused');
    expect(p.failed.length).toBe(1);
    expect(p.failed[0]!.words).toMatch(/^Yard did not load: map\.[A-Z_]+: /);
    expect(p.join.blocked).toBe(false);
  });

  it('the map\'s own props resolve through the shared source: solid in the hull and handed to the draw', async () => {
    const prop = { content: { kind: 'pack', pack: PROP_PACK, assetId: 'crate' }, at: [5, 0, 5], yaw: 0 };
    const p = fakePage({}, { map: () => minimalMapJson({ props: [prop], dependencies: [PROP_PACK] }), asset: (r) => (r.assetId === 'crate' ? crate() : null) });
    expect(await loadTestroomContent({ ref: MAP_REF, library: null }, p.deps)).toBe('shown');
    expect(p.shown[0]!.map.ground!.owners.map((o) => o.path)).toEqual(['content/floor', 'content/divider', 'content/prop_0']);
    expect(p.drawn).toEqual([{ load: 1, count: 1 }]);
  });

  it('a show that throws still releases the hold, with the error\'s words', async () => {
    const p = fakePage({ show: () => { throw new Error('no body to stand'); } });
    expect(await loadTestroomContent({ ref: MAP_REF, library: null }, p.deps)).toBe('refused');
    expect(p.failed).toEqual([{ load: 1, words: 'Yard did not load: no body to stand' }]);
    expect(p.join.blocked).toBe(false);
  });

  it('a begin that throws after the hold began still ends the hold through fail (review N3)', async () => {
    const p = fakePage();
    const begin = p.deps.begin;
    p.deps.begin = () => { begin(); throw new Error('the screen would not cover'); };
    expect(await loadTestroomContent({ ref: MAP_REF, library: null, name: 'Yard' }, p.deps)).toBe('refused');
    expect(p.failed).toEqual([{ load: 1, words: 'Yard did not load: the screen would not cover' }]);
    expect(p.join.blocked).toBe(false);
    expect(p.shown).toEqual([]);
  });

  it('a source that cannot open is refused in words and releases the hold', async () => {
    const p = fakePage({ source: async () => { throw new Error('IndexedDB refused'); } });
    expect(await loadTestroomContent({ ref: MAP_REF, library: null, name: 'Yard' }, p.deps)).toBe('refused');
    expect(p.failed).toEqual([{ load: 1, words: 'Yard did not load: IndexedDB refused' }]);
    expect(p.join.blocked).toBe(false);
  });

  it('a load superseded while it reads shows nothing and fails nothing: the newer load owns the hold', async () => {
    let open!: (v: unknown) => void;
    const p = fakePage({}, { map: () => new Promise((r) => { open = r; }) });
    const first = loadTestroomContent({ ref: MAP_REF, library: null }, p.deps);
    await tick();
    p.deps.begin();                                           // another map asked (a disc load bumps the same counter)
    open(minimalMapJson());
    expect(await first).toBe('superseded');
    expect(p.shown).toEqual([]);
    expect(p.failed).toEqual([]);
    expect(p.join.blocked).toBe(true);                        // the newer load's hold, untouched
  });

  it('PR #756 P2 (2): dispose frees a visual\'s textures too, once each replacement (modelPackRuntime disposeObject)', async () => {
    const textured = (): { mesh: Mesh; disposed: () => number } => {
      const map = new Texture();
      let n = 0;
      map.addEventListener('dispose', () => { n++; });
      return { mesh: new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ map })), disposed: () => n };
    };
    const counts: number[] = [];
    for (let open = 0; open < 2; open++) {                     // two opens: each replacement frees its own texture
      const g = await contentPropsObject([{ def: crate(), m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }], () => null);
      const t = textured();
      g.children[0]!.add(t.mesh);                              // a parsed GLB's textured mesh, as parseGlb gives one
      (g.userData['dispose'] as () => void)();
      counts.push(t.disposed());
    }
    expect(counts).toEqual([1, 1]);
  });

  it('draws each prop at its matrix, its bounds\' stand-in where its visual is not here; dispose frees it', async () => {
    const g = await contentPropsObject([{ def: crate(), m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 20, 1] }], () => null);
    expect(g.children.length).toBe(1);
    expect(g.children[0]!.position.toArray()).toEqual([10, 0, 20]);
    expect(g.children[0]!.children.length).toBe(1);
    expect(() => (g.userData['dispose'] as () => void)()).not.toThrow();
  });
});

/** The page's own wiring, read from its source (`../src/main.ts` is not mountable in a unit test). */
const MAIN = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf-8');
const body = (from: string, to: string): string => { const a = MAIN.indexOf(from); const b = MAIN.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : MAIN.slice(a, b); };

describe('FP-6 item 5: main.ts wires loadContent beside load', () => {
  const content = body('const loadContent = ', '\n  }, layout);\n};\n');
  it('the content path is a chunk of its own: main.ts imports its values only dynamically (S3b item 8\'s reason)', () => {
    expect(MAIN).not.toMatch(/^import \{[^}]*\} from '\.\/testroomContent';/m);
    expect(MAIN).toMatch(/^import type \{[^}]*\} from '\.\/testroomContent';/m);
    expect(MAIN).toContain("const testroomContent = (): Promise<typeof import('./testroomContent')> => import('./testroomContent');");
    expect(content).toContain('const tc = await testroomContent();');
  });
  it('loadContent begins the same hold as load, on a new wanted load, and covers the screen', () => {
    expect(content).toContain('loadTestroomContent(');
    expect(content).toContain('wantedMap = ++requests;');
    expect(content).toContain('loadingJoin.begin(wantedMap, () => { if (netLoad === wantedMap) net?.client.reportLoaded(); }, soloLoadHold(loadKindNow()));');
    expect(content).toContain('loadingScreen.panel.cover();');
  });
  it('a refusal ends the hold for its load, hides the panel and says the words; the lanes are answered by contentLaneAnswers', () => {
    expect(content).toMatch(/fail: \(load, words\) => \{ loadingJoin\.failed\(load\); loadingScreen\.panel\.hide\(\);/);
    expect(content).toContain('reportDecodeFailure(ui, words');
    expect(content).toContain('contentLaneAnswers(load, library)');
    expect(content).toContain('askSound(mapSource, a.path, a.archive);');
    expect(content).toContain('loadedSound = a.loadedSound; loadedEffects = a.loadedEffects; loadedArmory = a.loadedArmory;');
    // A room with no source never asked the play lane: it is answered too, so the player's lane cannot hold the screen.
    expect(content).toContain("if (wantedPlay < 0) playAnswer = 'none';");
    expect(content).toContain('pageContentSource()');
  });
  it('the library asked of the worker resolves on its own id and is never shown; its failure answers it', () => {
    expect(MAIN).toMatch(/if \(libraryAsk && message\.id === libraryAsk\.id\) \{ const l = libraryAsk; libraryAsk = null; l\.resolve\(message\.map\); return; \}/);
    expect(MAIN).toMatch(/if \(libraryAsk && message\.id === libraryAsk\.id\) \{ const l = libraryAsk; libraryAsk = null; l\.reject\(/);
    expect(MAIN).toContain('roomLibrary = message.map;');
  });
});
