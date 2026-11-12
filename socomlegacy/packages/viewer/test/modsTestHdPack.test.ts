// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, type PackContext } from '@s2u/creator-contracts';
import { HD_ROOT, HdNotServed, servedHdSource } from '../src/hdTexturePackServed';
import { installHdFromSource, memoryHdStore, type HdStore } from '../src/hdTexturePackStore';
import { sha256 } from '../src/texturePack';
import { createPackRegistry, type LocalPackSummary, type PackRegistryOptions } from '../src/packs/registry';
import { idbPackDatabase } from '../src/packs/storage';
import type { ChannelFactory, ModsChannel, ModsState, PackFlags } from '../src/packs/modsState';
import { memoryModLibrary } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { liveMods, modsRows, testHdDownloadWords, TEST_HD_PACK_BUTTON_ADAPTATION, TEST_HD_PACK_LABEL, TEST_HD_PACK_NOT_SERVED, type ModsRegistry } from '../src/console/adapters/mods';
import { modsHtml } from '../src/console/render/mods';
import { ConsoleController, type Host } from '../src/console/grammar';
import { sampleAdapters } from '../src/console/sampleAdapters';
import { CATS, createState, homeItems, modsRowCount, type Adapters } from '../src/console/state';

/**
 * B206 ML-12 (plan 2026-11-06-mods-loader, ML.R16; the owner, H416: "add a "add test hd texture pack" button temporarily
 * that applies it and adds it to peoples mod list (until we get it on thunderforge and i say remove that)"): the MODS
 * screen's temporary button -- the served HD pack fetched through `servedHdSource`, installed into the HD library as a
 * dropped zip is, chosen; refused in words when it is not served, nothing kept; a second press re-downloads nothing.
 * A synthetic pack only (made-up keys and payloads), no game data, no fetch leaves the test.
 */
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
async function servedPack(name = 'HD test', extra: Record<string, unknown> = {}) {
  const payloads: Record<string, Uint8Array> = { '0.dds': new Uint8Array(256).fill(7), '1.dds': new Uint8Array(256).fill(9) };
  const manifest = { format: 's2u-hd-texture-pack', version: 1, localOnly: true, game: 'SCUS-97275', name, method: 'test', totalBytes: 512, ...extra,
    entries: [
      { key: 'a'.repeat(64), width: 2, height: 2, file: '0.dds', format: 'dds', outWidth: 8, outHeight: 8, bytes: 256, sha256: 'b'.repeat(64), tier: 'A', source: 'x.dds' },
      { key: 'c'.repeat(64), width: 2, height: 2, file: '1.dds', format: 'dds', outWidth: 8, outHeight: 8, bytes: 256, sha256: 'd'.repeat(64), tier: 'A', source: 'y.dds' },
    ] };
  const mb = utf8(JSON.stringify(manifest)), id = await sha256(mb);
  const files: Record<string, Uint8Array> = { 'current.json': utf8(JSON.stringify({ version: 1, packId: id })), [`${id}/manifest.json`]: mb };
  for (const [f, b] of Object.entries(payloads)) files[`${id}/${f}`] = b;
  return { id, files, mb };
}
/** A fake server: the files under `HD_ROOT`, 404 for the rest (or the static host's HTML when `html`); every URL asked kept. */
function server(files: Record<string, Uint8Array> | null, o: { html?: boolean } = {}) {
  const asked: string[] = [], caches: (RequestCache | undefined)[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    asked.push(url); caches.push(init?.cache);
    const b = url.startsWith(HD_ROOT) ? files?.[url.slice(HD_ROOT.length)] : undefined;
    if (b) return new Response(b.slice().buffer as ArrayBuffer, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    return o.html ? new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      : new Response('', { status: 404 });
  });
  return { fetcher, asked, caches };
}

describe('ML-12: the served HD pack installed from its fetched source (installHdFromSource, servedHdSource)', () => {
  it('fetches the pointer uncached, the manifest and the payloads cached, keeps the pack whole and says its progress in files and bytes', async () => {
    const pack = await servedPack(), s = server(pack.files), store = memoryHdStore(), seen: [number, number, number, number, number | null][] = [];
    const r = await installHdFromSource(servedHdSource(s.fetcher), store, (files, bytes, total, ofFiles, ofBytes) => seen.push([files, bytes, total, ofFiles, ofBytes]));
    expect(r).toMatchObject({ id: pack.id, name: 'HD test', textures: 2, bytes: 512, fetched: true });
    expect(s.asked).toEqual([`${HD_ROOT}current.json`, `${HD_ROOT}${pack.id}/manifest.json`, `${HD_ROOT}${pack.id}/0.dds`, `${HD_ROOT}${pack.id}/1.dds`]);
    expect(s.caches[0]).toBe('no-store');
    expect(s.caches.slice(1).every((c) => c === 'default')).toBe(true);
    expect((await store.current())?.id).toBe(pack.id);
    expect(await store.file('1.dds')).toEqual(pack.files[`${pack.id}/1.dds`]);
    // ML-9's F3: the files fetched of the files to fetch (the manifest and each payload), the count reaching its end.
    expect(seen.map((x) => x[3])).toEqual([3, 3, 3]);
    expect(seen.at(-1)).toEqual([3, pack.mb.length + 512, 512, 3, null]);   // LATER 742: no packedBytes, no total in bytes
  });
  it('LATER 742: a manifest naming packedBytes gives the download its total -- the manifest and the payloads as served', async () => {
    const pack = await servedPack('HD test', { packedBytes: 512 }), seen: (number | null)[][] = [];
    await installHdFromSource(servedHdSource(server(pack.files).fetcher), memoryHdStore(), (files, bytes, _t, ofFiles, ofBytes) => seen.push([files, bytes, ofFiles, ofBytes]));
    expect(seen.map((x) => x[3])).toEqual([pack.mb.length + 512, pack.mb.length + 512, pack.mb.length + 512]);
    expect(seen.at(-1)![1]).toBe(seen.at(-1)![3]);   // the bytes downloaded reach the total
  });
  it('a second press with the same pack kept fetches the pointer alone and keeps the pack', async () => {
    const pack = await servedPack(), s = server(pack.files), store = memoryHdStore();
    await installHdFromSource(servedHdSource(s.fetcher), store);
    s.asked.length = 0;
    const again = await installHdFromSource(servedHdSource(s.fetcher), store);
    expect(again).toMatchObject({ id: pack.id, fetched: false });
    expect(s.asked).toEqual([`${HD_ROOT}current.json`]);
  });
  it('not served -- a 404, or the static host\'s HTML for a missing file -- is HdNotServed, and nothing is kept', async () => {
    for (const s of [server(null), server(null, { html: true })]) {
      const store = memoryHdStore();
      const e = await installHdFromSource(servedHdSource(s.fetcher), store).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(HdNotServed);
      expect(await store.current()).toBeNull();
    }
  });
  it('a manifest that is not its id, a missing payload, a payload over its entry\'s size: each refused, the kept pack untouched', async () => {
    const kept = await servedPack('Kept'), store: HdStore = memoryHdStore();
    await installHdFromSource(servedHdSource(server(kept.files).fetcher), store);
    const bad = await servedPack('Bad');
    const wrongId = { ...bad.files, 'current.json': utf8(JSON.stringify({ version: 1, packId: 'e'.repeat(64) })), [`${'e'.repeat(64)}/manifest.json`]: bad.mb };
    const missing = { ...bad.files }; delete missing[`${bad.id}/1.dds`];
    const over = { ...bad.files, [`${bad.id}/1.dds`]: new Uint8Array(256 + 2048) };
    for (const [files, why] of [[wrongId, /does not match its id/], [missing, /1\.dds is missing/], [over, /1\.dds/]] as const) {
      const e = await installHdFromSource(servedHdSource(server(files).fetcher), store).catch((x: unknown) => x);
      expect(e, String(why)).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(HdNotServed);
      expect(String((e as Error).message), String(why)).toMatch(why);
      expect((await store.current())?.name).toBe('Kept');
    }
  });
});

const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
const flagsOf = (): PackFlags => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); }, remove: (k) => { m.delete(k); } }; };
const bus = (): ChannelFactory => () => { const ch: ModsChannel = { onmessage: null, close: () => {}, postMessage: () => {} }; return ch; };
function registryOptions(hd: HdStore): PackRegistryOptions {
  const saves = new Map<string, string>();
  return { context, database: idbPackDatabase(() => new IDBFactory()), mods: memoryModLibrary(),
    maps: { get: (k) => saves.get(k) ?? null, set: (k, v) => { saves.set(k, v); } },
    models: { read: async () => null, put: async () => {}, remove: async () => {} },
    textures: new UploadedPacks(memoryUploadBackend()), hd, flags: flagsOf(), channel: bus() };
}

describe('ML-12: the registry\'s HD library installs from a fetched source (the same library a dropped zip reaches)', () => {
  it('installs, lists it as the HD pack, and a not-served source is NOT_FOUND with nothing kept', async () => {
    const pack = await servedPack(), hd = memoryHdStore(), api = createPackRegistry(registryOptions(hd));
    const result = await api.hd.installFrom(servedHdSource(server(pack.files).fetcher));
    expect(result).toMatchObject({ id: `hd:${pack.id}`, kind: 'hd', name: 'HD test', stored: true });
    expect((await api.list()).filter((p) => p.kind === 'hd').map((p) => p.id)).toEqual([`hd:${pack.id}`]);
    const empty = createPackRegistry(registryOptions(memoryHdStore()));
    await expect(empty.hd.installFrom(servedHdSource(server(null).fetcher))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const packed = await servedPack('HD packed', { packedBytes: 512 }), seen: unknown[] = [];
    await createPackRegistry(registryOptions(memoryHdStore())).hd.installFrom(servedHdSource(server(packed.files).fetcher), { onProgress: (p) => seen.push(p) });
    expect(seen.at(-1)).toEqual({ files: 3, ofFiles: 3, bytes: packed.mb.length + 512, ofBytes: packed.mb.length + 512 });   // LATER 742
    const plain = await servedPack('HD plain'), seenPlain: object[] = [];
    await createPackRegistry(registryOptions(memoryHdStore())).hd.installFrom(servedHdSource(server(plain.files).fetcher), { onProgress: (p) => seenPlain.push(p) });
    expect(seenPlain.at(-1)).toEqual({ files: 3, ofFiles: 3, bytes: plain.mb.length + 512 });
    expect(await empty.hd.list()).toBeNull();
  });
});

const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
function fakeRegistry(install: ModsRegistry['hd']['installFrom']) {
  let state: ModsState = { texture: null, models: { primary: false, second: false }, mods: { enabled: false, order: [], disabled: [] } };
  const list: LocalPackSummary[] = [];
  const r = {
    list: vi.fn(async () => list), remove: vi.fn(), importDrop: vi.fn(), subscribe: vi.fn(() => () => {}),
    hd: { installFrom: vi.fn(install) },
    modsState: { read: vi.fn(async () => state), setTexture: vi.fn(async (id: string | null) => { state = { ...state, texture: id }; return state; }),
      setModel: vi.fn(), setMods: vi.fn(), subscribe: vi.fn(() => () => {}) },
  };
  return r as typeof r & ModsRegistry;
}
const hdSummary = (id: string): LocalPackSummary => ({ id: `hd:${id}`, kind: 'hd', name: 'HD test', files: 2, bytes: 500, staged: false, imported: true,
  stored: true, enabled: false, applied: false, diagnostics: [] }) as LocalPackSummary;

describe('ML-12: the MODS screen\'s temporary button (TEST_HD_PACK_BUTTON_ADAPTATION)', () => {
  it('labelled as temporary; its press installs the served pack through the registry, chooses it, and says so', async () => {
    expect(TEST_HD_PACK_BUTTON_ADAPTATION).toMatch(/ML-12/);
    expect(TEST_HD_PACK_BUTTON_ADAPTATION).toMatch(/Thunderstore/);
    expect(TEST_HD_PACK_LABEL).toBe('Add test HD texture pack');
    const id = 'f'.repeat(64), source = { pointer: vi.fn(), manifest: vi.fn(), payload: vi.fn() };
    const reg = fakeRegistry(async (_s, o) => { o?.onProgress?.({ files: 1, ofFiles: 2, bytes: 250 }); return { ...hdSummary(id), fetched: true } as never; });
    const notify = vi.fn(), m = liveMods(document, notify, { registry: async () => reg, testHdSource: async () => source });
    expect(m.view().testHdPack).toBe(true);
    m.addTestHdPack!();
    expect(m.view().busy?.words).toMatch(/^Downloading the test HD pack/);
    await settle();
    expect(reg.hd.installFrom).toHaveBeenCalledTimes(1);
    expect(reg.hd.installFrom.mock.calls[0]![0]).toBe(source);
    expect(reg.modsState.setTexture).toHaveBeenCalledWith(`hd:${id}`);
    expect(m.view().message).toMatchObject({ tone: 'good' });
    expect(m.view().message!.words).toMatch(/HD test/);
    expect(m.view().message!.words).toMatch(/chosen/);
    m.dispose();
  });
  it('ML-9 F3: the download\'s words are the files fetched of the files to fetch and the bytes downloaded, never the decoded total', () => {
    expect(testHdDownloadWords({ files: 120, ofFiles: 4321, bytes: 8.5 * 1024 * 1024 }))
      .toEqual({ words: 'Downloading the test HD pack… 120 of 4321 files, 8.5 MB downloaded', progress: 120 / 4321 });
    expect(testHdDownloadWords({ files: 4321, ofFiles: 4321, bytes: 1536 * 1024 * 1024 }).progress).toBe(1);
    expect(testHdDownloadWords({ files: 0, ofFiles: 0, bytes: 0 })).toEqual({ words: 'Downloading the test HD pack… 0 of 0 files, 0 KB downloaded', progress: null });
  });
  it('LATER 742: with the pack\'s packed size known, the words are the MB downloaded of the MB to download', () => {
    expect(testHdDownloadWords({ files: 120, ofFiles: 4321, bytes: 8.5 * 1024 * 1024, ofBytes: 1500 * 1024 * 1024 }))
      .toEqual({ words: 'Downloading the test HD pack… 8.5 MB of 1500.0 MB', progress: 8.5 / 1500 });
    expect(testHdDownloadWords({ files: 0, ofFiles: 3, bytes: 0, ofBytes: 600 * 1024 }))
      .toEqual({ words: 'Downloading the test HD pack… 0 KB of 600 KB', progress: 0 });
    expect(testHdDownloadWords({ files: 3, ofFiles: 3, bytes: 700 * 1024, ofBytes: 600 * 1024 }).progress).toBe(1);
    // Unknown (a pack built before LATER 742): the files' words, as before.
    expect(testHdDownloadWords({ files: 1, ofFiles: 4, bytes: 1024 * 1024 }).words).toBe('Downloading the test HD pack… 1 of 4 files, 1.0 MB downloaded');
  });
  it('ML-9 F3: the installed list names an HD pack\'s size as decoded; another pack\'s as before', () => {
    const state: ModsState = { texture: null, models: { primary: false, second: false }, mods: { enabled: false, order: [], disabled: [] } };
    const tex = { ...hdSummary('e'.repeat(64)), id: 'texture:MP72:x', kind: 'texture', bytes: 3 * 1024 * 1024 } as LocalPackSummary;
    const rows = modsRows([{ ...hdSummary('f'.repeat(64)), bytes: 4658.7 * 1024 * 1024 } as LocalPackSummary, tex], state);
    expect(rows[0]!.detail).toBe('2 files · 4658.7 MB decoded');
    expect(rows[1]!.detail).toBe('2 files · 3.0 MB');
  });
  it('the download\'s progress in words through the adapter: the files of the files to fetch', async () => {
    let release: () => void = () => {};
    const reg = fakeRegistry(async (_s, o) => { o?.onProgress?.({ files: 1, ofFiles: 4, bytes: 1024 * 1024 }); await new Promise<void>((r) => { release = r; }); return hdSummary('f'.repeat(64)) as never; });
    const m = liveMods(document, () => {}, { registry: async () => reg, testHdSource: async () => ({ pointer: vi.fn(), manifest: vi.fn(), payload: vi.fn() }) });
    m.addTestHdPack!();
    await settle();
    expect(m.view().busy).toEqual({ words: 'Downloading the test HD pack… 1 of 4 files, 1.0 MB downloaded', progress: 0.25 });
    release(); await settle(); m.dispose();
  });
  it('not served: refused in words, nothing chosen', async () => {
    const { LocalPackError } = await import('../src/packs/registry');
    const reg = fakeRegistry(async () => { throw new LocalPackError('NOT_FOUND', 'The HD pack is not served here.'); });
    const m = liveMods(document, () => {}, { registry: async () => reg, testHdSource: async () => ({ pointer: vi.fn(), manifest: vi.fn(), payload: vi.fn() }) });
    m.addTestHdPack!();
    await settle();
    expect(TEST_HD_PACK_NOT_SERVED).toBe('The test HD pack is not available yet.');
    expect(m.view().message).toEqual({ words: TEST_HD_PACK_NOT_SERVED, tone: 'bad' });
    expect(reg.modsState.setTexture).not.toHaveBeenCalled();
    m.dispose();
  });
  it('drawn as the last row, its words say it is temporary; Cross on it presses it', () => {
    const calls: string[] = [];
    const mods = { open: () => {}, choose: () => {}, drop: () => {}, toggle: () => {}, remove: () => {}, move: () => {}, setTexture: () => {},
      addTestHdPack: () => { calls.push('test-hd'); },
      view: () => ({ ready: true, rows: [], busy: null, message: null, storePage: null, texture: null, textures: [{ id: null, label: 'Original' }], testHdPack: true }) };
    const A: Adapters = { ...sampleAdapters(), mods };
    const S = createState(A, 'page');
    const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn(), close: vi.fn() };
    const c = new ConsoleController(S, A, host);
    S.cat = CATS.findIndex((x) => x.id === 'experiments');
    S.item[S.cat] = homeItems('experiments', S, A).findIndex((x) => x.act === 'mods');
    c.press('cross');
    expect(S.screen).toBe('mods');
    expect(modsRowCount(A)).toBe(3);
    const html = modsHtml(S, A);
    expect(html).toContain(TEST_HD_PACK_LABEL);
    expect(html).toMatch(/[Tt]emporary/);
    c.press('down'); c.press('down');
    expect(S.md.row).toBe(2);
    c.press('cross');
    expect(calls).toEqual(['test-hd']);
  });
  it('the removal (ML-13) finds every use: the constant is named in these files and no other', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
    const files: string[] = [];
    const walk = (dir: string): void => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(n) && readFileSync(p, 'utf8').includes('TEST_HD_PACK_BUTTON_ADAPTATION')) files.push(relative(src, p).replace(/\\/g, '/')); } };
    walk(src);
    expect(files.sort()).toEqual(['console/adapters/mods.ts', 'console/grammar.ts', 'console/render/legend.ts', 'console/render/mods.ts', 'console/state.ts',
      'hdTexturePackServed.ts', 'hdTexturePackStore.ts', 'packs/registry.ts']);
  });
});
