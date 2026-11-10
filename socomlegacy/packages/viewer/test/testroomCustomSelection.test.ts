import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentAssetKey, type ContentRef, type Layout } from '@s2u/creator-contracts';
import { MAP_PACK, MAP_REF, PROP_PACK } from '../../creator-contracts/test/contentMapFixtures';
import { emptyLayout } from '../src/forge/layout';
import { recordOfLayout } from '../src/forge/record';
import type { NamedSave } from '../src/forge/saves';
import type { LoadedMap } from '../src/loadMap';
import { openCustomRow, type OpenCustomDeps } from '../src/testroomContent';

/**
 * FP-6 item 5, PR #756's second P2 (product track, a test instrument): a Custom Maps selection owns the room's next load
 * only while it is the LATEST selection. `openCustomRow` (`../src/testroomContent`, called by `../src/main.ts`
 * `openCustom`) reads the source, the saves and the required packs before it loads; a newer selection -- a disc map
 * chosen (`load` takes the token) or another custom row -- made during any of those reads abandons it silently: no load,
 * no words. Before this an older selection resumed after its awaits and overrode the newer load.
 */

const CRATE: ContentRef = { kind: 'pack', pack: PROP_PACK, assetId: 'crate' };
const M = (x: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1];
const discSave = (): NamedSave => ({ id: 's1', name: 'Crates on MP2', savedAt: 1,
  record: recordOfLayout({ ...emptyLayout({ kind: 'map', archive: 'MP2' }), pieces: [{ asset: contentAssetKey(CRATE), m: M(0, 0), content: CRATE }] } as Layout, 'Crates on MP2') });

/** A page whose selection token a test moves on (a disc map chosen), with slow reads it releases by hand. */
function page(opts: { slowSaves?: boolean; slowReady?: boolean } = {}) {
  let token = 1;
  const mine = token;
  const did: string[] = [];
  let releaseSaves!: () => void;
  let releaseReady!: () => void;
  const savesGate = opts.slowSaves ? new Promise<void>((r) => { releaseSaves = r; }) : Promise.resolve();
  const readyGate = opts.slowReady ? new Promise<void>((r) => { releaseReady = r; }) : Promise.resolve();
  const deps: OpenCustomDeps = {
    current: () => token === mine,
    source: async () => ({ customMaps: () => [], mapIndex: () => [{ ref: MAP_REF, name: 'Yard' }], asset: () => null, ready: async () => { await readyGate; } }),
    saves: async () => { await savesGate; return [discSave()]; },
    say: (w) => { did.push(`say ${w}`); },
    pathOf: (a) => (a === 'MP2' ? 'RUN/MP2.ZDB' : null),
    loadContent: (open) => { did.push(`content ${open.ref.assetId}`); },
    loadDisc: (path) => { did.push(`disc ${path}`); },
  };
  return { deps, did, chooseDisc: () => { token++; did.push('disc chosen'); }, releaseSaves: () => releaseSaves(), releaseReady: () => releaseReady() };
}
const tick = async (n = 10): Promise<void> => { for (let i = 0; i < n; i++) await Promise.resolve(); };

describe('PR #756 P2: an older custom selection never overrides a newer one', () => {
  it('a disc map chosen while the saves are read: the custom load never begins, nothing is said', async () => {
    const p = page({ slowSaves: true });
    const out = openCustomRow(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`, p.deps);
    await tick();
    p.chooseDisc();
    p.releaseSaves();
    expect(await out).toBe('superseded');
    expect(p.did).toEqual(['disc chosen']);
  });

  it('a disc map chosen while a save\'s packs are made ready: its disc load and pieces never begin', async () => {
    const p = page({ slowReady: true });
    const out = openCustomRow('save:s1', p.deps);
    await tick();
    p.chooseDisc();
    p.releaseReady();
    expect(await out).toBe('superseded');
    expect(p.did).toEqual(['disc chosen']);
  });

  it('the control: still the latest, each kind loads (a content map by loadContent, a disc save by loadDisc with its compose)', async () => {
    const a = page();
    expect(await openCustomRow(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`, a.deps)).toBe('content');
    expect(a.did).toEqual(['say loading Yard ...', 'content yard']);
    const b = page();
    let composed: unknown = null;
    b.deps.loadDisc = (path, compose) => { b.did.push(`disc ${path}`); composed = compose; };
    expect(await openCustomRow('save:s1', b.deps)).toBe('disc');
    expect(b.did).toEqual(['say loading Crates on MP2 ...', 'disc RUN/MP2.ZDB']);
    expect(typeof composed).toBe('function');
    expect((composed as (m: LoadedMap) => unknown)({ archive: 'MP2', props: [], slots: [] } as unknown as LoadedMap)).toMatchObject({ props: [] });
  });

  it('a refusal is said when it is still the latest, and dropped when it is not', async () => {
    const a = page();
    expect(await openCustomRow('custom:gone', a.deps)).toBe('refused');
    expect(a.did).toEqual(['say That custom map is no longer installed']);
    const b = page({ slowSaves: true });
    const out = openCustomRow('custom:gone', b.deps);
    await tick();
    b.chooseDisc();
    b.releaseSaves();
    expect(await out).toBe('superseded');
    expect(b.did).toEqual(['disc chosen']);
  });
});

describe('PR #756 P2: main.ts takes the token at each selection', () => {
  const MAIN = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf-8');
  const body = (from: string, to: string): string => { const a = MAIN.indexOf(from); const b = MAIN.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : MAIN.slice(a, b); };
  it('a disc load takes it (load), a custom selection takes it (openCustom) and hands openCustomRow its check', () => {
    expect(body('const load = (path: string, armoryAfter = false): void => {', '\n};\n')).toContain('customSelection++;');
    const open = body('const openCustom = ', '\n};\n');
    expect(open).toContain('const mine = ++customSelection;');
    expect(open).toContain('const current = (): boolean => customSelection === mine;');
    expect(open).toContain('await tc.openCustomRow(value, {');
    expect(open).toContain('loadContent: (o, layout) => { void loadContent(o, layout, current)');
  });
  it('loadContent checks it once more after its chunk, before the hold begins', () => {
    expect(body('const loadContent = ', '\n  }, layout);\n};\n')).toContain("if (current && !current()) return 'superseded';");
  });
});
