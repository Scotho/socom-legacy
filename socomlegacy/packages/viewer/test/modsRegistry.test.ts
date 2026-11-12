import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { zipSync } from 'fflate';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, sha256Hex, validatePack, type PackContext } from '@s2u/creator-contracts';
import { createPackRegistry, type PackRegistryOptions } from '../src/packs/registry';
import { classifyDrop, type ReadSmall } from '../src/packs/classify';
import { PACKS_ENABLED_KEY, type ChannelFactory, type ModsChannel, type PackFlags } from '../src/packs/modsState';
import { idbPackDatabase } from '../src/packs/storage';
import { memoryModLibrary } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { memoryHdStore } from '../src/hdTexturePackStore';
import { buildTexturePack } from '../src/texturePackBuild';
import { sha256 } from '../src/texturePack';
import { encodePng } from '../../../tools/png';

/**
 * B206 ML-1 (ML.R3, R7, R8; product track, ML.R2): the one registry MODS and every page read -- the HD store as its
 * fourth library, the MODS state record and its notice, the drop classifier. Synthetic packs only (made-up keys and
 * payloads), no game data.
 */
const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const zipFile = (name: string, members: Record<string, Uint8Array>): File => new File([zipSync(members).slice().buffer as ArrayBuffer], name);
const flagsOf = (): PackFlags & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => { map.set(k, v); }, remove: (k) => { map.delete(k); } };
};
/** One in-process "origin": every channel of one bus hears every other's post, never its own (BroadcastChannel's rule). */
function busOf(): ChannelFactory {
  const open = new Set<ModsChannel>();
  return () => {
    const ch: ModsChannel = { onmessage: null, close: () => { open.delete(ch); },
      postMessage: (data) => { for (const other of open) if (other !== ch) queueMicrotask(() => other.onmessage?.({ data })); } };
    open.add(ch); return ch;
  };
}
function options(factory = new IDBFactory(), extra: Partial<PackRegistryOptions> = {}): PackRegistryOptions {
  const saves = new Map<string, string>();
  return { context, database: idbPackDatabase(() => factory), mods: memoryModLibrary(),
    maps: { get: (k) => saves.get(k) ?? null, set: (k, v) => { saves.set(k, v); } },
    models: { read: async () => null, put: async () => {}, remove: async () => {} },
    textures: new UploadedPacks(memoryUploadBackend()), hd: memoryHdStore(), flags: flagsOf(), channel: busOf(), ...extra };
}

/** Thunderstore's root files: the store manifest with its five keys, a 256x256 PNG icon, the README. */
const storeFiles = (name = 'SOCOM_II_HD_Textures'): Record<string, Uint8Array> => ({
  'manifest.json': utf8(JSON.stringify({ name, version_number: '1.0.0', website_url: '', description: 'A test pack.', dependencies: [] })),
  'icon.png': encodePng(256, 256, new Uint8Array(256 * 256 * 4)),
  'README.md': utf8('# A test pack\n'),
});
/** A synthetic HD pack in the served layout (`importHdZip`'s), one made-up entry. */
async function hdMembers(prefix = ''): Promise<{ id: string; members: Record<string, Uint8Array> }> {
  const payload = new Uint8Array(128 + 8 * 8 * 4);
  const manifest = { format: 's2u-hd-texture-pack', version: 1, localOnly: true, game: 'SCUS-97275', name: 'HD test', method: 'test', totalBytes: 256,
    entries: [{ key: 'a'.repeat(64), width: 2, height: 2, file: '0.dds', format: 'dds', outWidth: 8, outHeight: 8, bytes: 256, sha256: 'b'.repeat(64), tier: 'A', source: 'x.dds' }] };
  const mb = utf8(JSON.stringify(manifest)), id = await sha256(mb), p = `${prefix}experimental-packs/hd/`;
  return { id, members: { [`${p}current.json`]: utf8(JSON.stringify({ version: 1, packId: id })), [`${p}${id}/manifest.json`]: mb, [`${p}${id}/0.dds`]: payload } };
}
const modMembers = (prefix = ''): Record<string, Uint8Array> => ({
  [`${prefix}mod.json`]: utf8(JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'wrapped', name: 'Wrapped mod', version: '1', author: 'Fixture',
    description: '', target: 'socom2-us-r0001', files: [{ path: 'NOTES/HELLO.TXT', file: 'hello.txt' }] })),
  [`${prefix}hello.txt`]: utf8('hello'),
});
async function gxMembers(prefix = ''): Promise<{ id: string; members: Record<string, Uint8Array> }> {
  const built = await buildTexturePack([{ key: 'fixture', library: 'MP51', record: 'fixture',
    flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
    levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }],
  }], { archiveSha256: 'a'.repeat(64), archiveBytes: 16, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
  const members: Record<string, Uint8Array> = { [`${prefix}manifest.json`]: built.manifestBytes };
  for (const [path, bytes] of built.payloads) members[`${prefix}${path}`] = bytes;
  return { id: built.id, members };
}
const reader = (members: Record<string, Uint8Array>): ReadSmall => async (name) => members[name] ?? null;

describe('ML-1: the drop classifier (ML.R3)', () => {
  it('names a wrapped HD pack, a wrapped s2u-mod and a wrapped GX pack, the store files set aside', async () => {
    const hd = { ...storeFiles(), ...(await hdMembers('SOCOM_II_HD/')).members };
    const h = await classifyDrop(Object.keys(hd), reader(hd));
    expect(h).toMatchObject({ kind: 'hd', wrapping: { name: 'SOCOM_II_HD_Textures', version: '1.0.0' } });
    if (h.kind === 'refused') return;
    expect(h.payload.some((n) => n === 'icon.png' || n === 'manifest.json' || n === 'README.md')).toBe(false);
    const mod = { ...storeFiles('Wrapped_mod'), ...modMembers('payload/') };
    expect(await classifyDrop(Object.keys(mod), reader(mod))).toMatchObject({ kind: 'mod', root: 'payload/', wrapping: { name: 'Wrapped_mod' } });
    const gx = { ...storeFiles('GX_pack'), ...(await gxMembers('MP51/')).members };
    expect(await classifyDrop(Object.keys(gx), reader(gx))).toMatchObject({ kind: 'texture', texture: 'built', root: 'MP51/', wrapping: { name: 'GX_pack' } });
  });

  it('does not mistake a GX pack\'s own root manifest.json for a store manifest', async () => {
    const gx = (await gxMembers()).members;
    expect(await classifyDrop(Object.keys(gx), reader(gx))).toMatchObject({ kind: 'texture', texture: 'built', wrapping: null, root: '' });
  });

  it('refuses a wrapping that breaks the store\'s rules, and a drop that is no pack, each with its reason', async () => {
    const bad = { ...storeFiles(), 'icon.png': encodePng(8, 8, new Uint8Array(8 * 8 * 4)), ...modMembers('p/') };
    const b = await classifyDrop(Object.keys(bad), reader(bad));
    expect(b).toMatchObject({ kind: 'refused' });
    if (b.kind === 'refused') expect(b.reason).toMatch(/Thunderstore.*icon\.png/);
    const none = { 'notes.txt': utf8('x') };
    const n = await classifyDrop(Object.keys(none), reader(none));
    expect(n.kind).toBe('refused');
    if (n.kind === 'refused') expect(n.reason).toMatch(/^Not a pack MODS reads/);
  });
});

describe('ML-1: the HD store as the registry\'s fourth library (ML.R7)', () => {
  it('installs a wrapped HD zip by importHdZip, lists it as kind hd, and removes it through the registry', async () => {
    const config = options(), api = createPackRegistry(config);
    const { id, members } = await hdMembers('SOCOM_II_HD/');
    const result = await api.importDrop([zipFile('SOCOM_II_HD.zip', { ...storeFiles(), ...members })]);
    expect(result).toMatchObject({ id: `hd:${id}`, kind: 'hd', name: 'HD test', files: 1, stored: true });
    expect((await config.hd!.current())?.id).toBe(id);
    expect(await api.hd.list()).toMatchObject({ id: `hd:${id}`, kind: 'hd' });
    expect((await api.list()).filter((p) => p.kind === 'hd').map((p) => p.id)).toEqual([`hd:${id}`]);
    expect(await api.remove(`hd:${id}`)).toMatchObject({ id: `hd:${id}`, removed: true, stored: false });
    expect(await config.hd!.current()).toBeNull();
    expect(await api.hd.list()).toBeNull();
    api.dispose();
  });
});

describe('ML-1: the drop installs each earlier format, bare or wrapped (ML.R3)', () => {
  it('a wrapped s2u-mod reaches the mod library', async () => {
    const config = options(), api = createPackRegistry(config);
    const result = await api.importDrop([zipFile('mod.zip', { ...storeFiles('Wrapped_mod'), ...modMembers('payload/') })]);
    expect(result).toMatchObject({ id: 'mod:wrapped', kind: 'mod', stored: true });
    expect((await config.mods!.read()).packages.map((p) => p.id)).toEqual(['wrapped']);
    api.dispose();
  });

  it('a wrapped built GX pack reaches the texture library', async () => {
    const config = options(), api = createPackRegistry(config);
    const { id, members } = await gxMembers('MP51/');
    const result = await api.importDrop([zipFile('gx.zip', { ...storeFiles('GX_pack'), ...members })]);
    expect(result).toMatchObject({ id: `texture:MP51:${id}`, kind: 'texture', stored: true });
    expect((await config.textures!.catalogue()).map(({ record }) => record.id)).toEqual([id]);
    api.dispose();
  });

  it('a v2 pack is stored, never applied', async () => {
    const config = options(), api = createPackRegistry(config);
    const member = utf8('owned authored data');
    const manifest = { format: 's2u-pack', formatVersion: 2, id: 'fixture.content', version: '1.0.0', name: 'Fixture',
      target: context.target, contract: '*', kinds: ['content'], sides: 'client', dependencies: [],
      files: [{ path: 'data.txt', sha256: await sha256Hex(member), size: member.length, role: 'data' }], intents: [{ kind: 'cosmetic', files: ['data.txt'] }] };
    const files = { 's2u-pack.json': utf8(JSON.stringify(manifest)), 'data.txt': member };
    expect((await validatePack(Object.entries(files).map(([path, bytes]) => ({ path, bytes })), context)).ok).toBe(true);
    const result = await api.importDrop([zipFile('v2.zip', files)]);
    expect(result).toMatchObject({ stored: true, enabled: false, applied: false, slot: 'independent' });
    const zipped = zipSync(files);
    const [staged] = await api.stage([{ name: 'v2.zip', size: zipped.length, arrayBuffer: async () => zipped.slice().buffer }]);
    await expect(api.import({ kind: 'pack', stagedId: staged!.id, apply: true })).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    api.dispose();
  });

  it('refuses a drop that is no pack, storing nothing', async () => {
    const config = options(), api = createPackRegistry(config);
    await expect(api.importDrop([zipFile('x.zip', { 'notes.txt': utf8('x') })])).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT', message: expect.stringMatching(/^Not a pack MODS reads/) });
    expect((await api.list()).filter((p) => !p.staged)).toEqual([]);
    api.dispose();
  });
});

describe('ML-1: the MODS state record, its hint and its notice (ML.R7, ML.R8)', () => {
  it('keeps the chosen texture pack and the model switches, and a second registry hears the change', async () => {
    const factory = new IDBFactory(), flags = flagsOf(), channel = busOf(), hd = memoryHdStore();
    const a = createPackRegistry(options(factory, { flags, channel, hd })), b = createPackRegistry(options(factory, { flags, channel, hd }));
    const { id, members } = await hdMembers();
    await a.importDrop([zipFile('hd.zip', members)]);
    let heard = 0;
    b.modsState.subscribe(() => { heard++; });
    expect(await a.modsState.setTexture(`hd:${id}`)).toMatchObject({ texture: `hd:${id}` });
    await new Promise((r) => setTimeout(r, 0));
    expect(heard).toBeGreaterThan(0);
    expect(flags.map.get(PACKS_ENABLED_KEY)).toBe('1');
    expect(await b.modsState.read()).toMatchObject({ texture: `hd:${id}`, models: { primary: false, second: false } });
    await a.modsState.setModel('primary', true);
    expect((await b.modsState.read()).models).toEqual({ primary: true, second: false });
    // Removing the chosen pack reads Original (ML.R8: the selector never names a pack not kept).
    await a.remove(`hd:${id}`);
    expect((await b.modsState.read()).texture).toBeNull();
    await expect(a.modsState.setTexture(`hd:${id}`)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    a.dispose(); b.dispose();
  });

  it("removing a model pack switches its slot off (the merge review's nit 5: a removed pack is never left on)", async () => {
    const factory = new IDBFactory(), flags = flagsOf();
    let kept: { path: string; bytes: Uint8Array }[] | null = [{ path: 'models.json', bytes: utf8('{}') }];
    const models = { read: async () => kept, put: async () => {}, remove: async () => { kept = null; } };
    const api = createPackRegistry(options(factory, { flags, models }));
    await api.modsState.setModel('primary', true);
    await api.modsState.setModel('second', true);
    expect(await api.remove('model:current')).toMatchObject({ id: 'model:current', removed: true });
    expect((await api.modsState.read()).models).toEqual({ primary: false, second: true });
    api.dispose();
  });

  it('a boot with no pack opens no database', async () => {
    let opened = 0;
    const inner = new IDBFactory();
    const counting = { open: (...args: Parameters<IDBFactory['open']>) => { opened++; return inner.open(...args); } } as unknown as IDBFactory;
    const api = createPackRegistry({ ...options(inner, { mods: undefined, hd: null }), database: idbPackDatabase(() => counting), flags: flagsOf() });
    expect(await api.modsState.read()).toEqual({ texture: null, models: { primary: false, second: false }, mods: { enabled: false, order: [], disabled: [] } });
    expect(opened).toBe(0);
    api.dispose();
  });
});
