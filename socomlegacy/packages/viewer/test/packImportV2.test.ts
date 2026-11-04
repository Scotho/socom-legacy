import { describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, sha256Hex, validatePack, type BufferedPackFile, type PackContext } from '@s2u/creator-contracts';
import { createPackRegistry, type PackRegistryOptions } from '../src/packs/registry';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { idbPackDatabase } from '../src/packs/storage';
import { memoryModLibrary } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';
import { validateLegacyPack } from '../src/packs/adapters';
import { buildTexturePack } from '../src/texturePackBuild';
import { makeZip } from './zipFixture';
import { encodePng } from '../../../tools/png';
import type { ForgeAgentApi, ForgeAgentSnapshot } from '../src/forge/agent/api';
import type { LocalPackApi } from '../src/agent/localPacks';
import type { AgentRequest } from '@s2u/forge-agent-protocol';

/**
 * FCW-33 (product track, a browser adaptation with no original): a v2 pack imported by the user or the agent reaches
 * `install`; `s2u-pack.json` decides before a root `manifest.json`; Thunderstore's store files ride along at the zip's
 * root without changing the pack's identity; a legacy texture pack with its root `manifest.json` imports as before.
 */

const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], archives: {}, handlers: [] };
const utf8 = (text: string) => new TextEncoder().encode(text);
const file = (name: string, data: Uint8Array, webkitRelativePath?: string) =>
  ({ name, size: data.length, ...(webkitRelativePath ? { webkitRelativePath } : {}), arrayBuffer: async () => data.slice().buffer });
function options(factory = new IDBFactory()): PackRegistryOptions {
  const saves = new Map<string, string>();
  return { context, database: idbPackDatabase(() => factory), mods: memoryModLibrary(),
    maps: { get: key => saves.get(key) ?? null, set: (key, value) => { saves.set(key, value); } },
    models: { read: async () => null, put: async () => {}, remove: async () => {} },
    textures: new UploadedPacks(memoryUploadBackend()),
  };
}

/** A v2 content pack carrying every payload type the import used to refuse, and Thunderstore's root files. */
async function thunderstorePack() {
  const members: BufferedPackFile[] = [
    { path: 'models/crate.gltf', bytes: utf8('{"asset":{"version":"2.0"}}') },
    { path: 'textures/crate.ktx2', bytes: utf8('KTX2') },
    { path: 'sounds/hit.ogg', bytes: utf8('OggS') },
    { path: 'sounds/step.wav', bytes: utf8('RIFF') },
    { path: 'textures/crate.png', bytes: encodePng(1, 1, new Uint8Array([1, 2, 3, 255])) },
  ];
  const roles: Record<string, string> = { gltf: 'mesh', ktx2: 'texture', ogg: 'audio', wav: 'audio', png: 'texture' };
  const manifest = {
    format: 's2u-pack', formatVersion: 2, id: 'example.yard', version: '1.2.0', name: 'Yard', description: 'A small yard.',
    target: PACK_TARGET_US, contract: '^0.1.0', kinds: ['content'], sides: 'client', dependencies: [],
    files: await Promise.all(members.map(async m => ({ path: m.path, sha256: await sha256Hex(m.bytes), size: m.bytes.length, role: roles[m.path.split('.').pop()!] }))),
    intents: [{ kind: 'cosmetic', files: members.map(m => m.path) }],
  };
  const pack = [{ path: 's2u-pack.json', bytes: utf8(JSON.stringify(manifest)) }, ...members];
  const store: BufferedPackFile[] = [
    { path: 'manifest.json', bytes: utf8(JSON.stringify({ name: 'example_yard', version_number: '1.2.0', website_url: '', description: 'A small yard.', dependencies: [] })) },
    { path: 'icon.png', bytes: encodePng(256, 256, new Uint8Array(256 * 256 * 4)) },
    { path: 'README.md', bytes: utf8('# Yard\n') },
  ];
  const checked = await validatePack(pack, context);
  if (!checked.ok) throw Error('The authored v2 fixture must validate through the published contracts.');
  return { pack, store, files: [...pack, ...store], ref: checked.ref };
}

describe('importing v2 packs (FCW-33, product adaptation)', () => {
  it('stages a Thunderstore-shaped folder as a v2 pack, not as a texture pack', async () => {
    const t = await thunderstorePack(), api = createPackRegistry(options());
    const [staged] = await api.stage(t.files.map(f => file(f.path.split('/').pop()!, f.bytes, `yard/${f.path}`)));
    expect(staged).toMatchObject({ kind: 'pack', staged: true, files: t.files.length });
    api.dispose();
  });

  it('imports a Thunderstore-shaped zip through install, its ref the one the store files never change', async () => {
    const t = await thunderstorePack(), factory = new IDBFactory(), api = createPackRegistry(options(factory));
    const zip = makeZip(t.files.map(f => ({ name: f.path, data: f.bytes })));
    const [staged] = await api.stage([file('yard.zip', zip)]);
    const result = await api.import({ kind: 'pack', stagedId: staged!.id });
    expect(result).toMatchObject({ ref: t.ref, stored: true, enabled: false, applied: false, validation: 'validated', packKinds: ['content'], slot: 'independent' });
    api.dispose();
    const restarted = createPackRegistry(options(factory));
    expect(await restarted.list()).toEqual([expect.objectContaining({ ref: t.ref, stored: true })]);
    restarted.dispose();
  });

  it('imports a zipped folder (the one folder a zipped directory adds) as the same pack', async () => {
    const t = await thunderstorePack(), api = createPackRegistry(options());
    const zip = makeZip(t.files.map(f => ({ name: `yard/${f.path}`, data: f.bytes })));
    const [staged] = await api.stage([file('yard.zip', zip)]);
    expect(await api.import({ kind: 'pack', stagedId: staged!.id })).toMatchObject({ ref: t.ref, stored: true });
    api.dispose();
  });

  it('refuses a live apply of a v2 pack (no driver applies one) and a pack that does not validate, storing nothing', async () => {
    const t = await thunderstorePack(), api = createPackRegistry(options());
    const [staged] = await api.stage([file('yard.zip', makeZip(t.files.map(f => ({ name: f.path, data: f.bytes }))))]);
    await expect(api.import({ kind: 'pack', stagedId: staged!.id, apply: true })).rejects.toMatchObject({ code: 'UNSUPPORTED_SURFACE' });
    const broken = makeZip([...t.files.filter(f => f.path !== 'sounds/hit.ogg').map(f => ({ name: f.path, data: f.bytes }))]);
    const [bad] = await api.stage([file('broken.zip', broken)]);
    await expect(api.import({ kind: 'pack', stagedId: bad!.id })).rejects.toMatchObject({ code: 'INVALID_PACKAGE', report: { status: 'fail' } });
    expect((await api.list()).filter(item => !item.staged)).toEqual([]);
    api.dispose();
  });

  // FCW-33 fold F2: the traversal refusals of the untouched unpackLocalZip (agentLocalFiles.test.ts, 'preflights archive paths'),
  // here through importPack on the v2 route, refused by name -- a `../` member path and an absolute one.
  it.each([['../s2u-pack.json'], ['/s2u-pack.json']])('refuses a zip with the member path %s on the v2 route, storing nothing', async name => {
    const t = await thunderstorePack(), api = createPackRegistry(options());
    const zip = makeZip([{ name, data: t.files[0]!.bytes }, ...t.files.slice(1).map(f => ({ name: f.path, data: f.bytes }))]);
    const [staged] = await api.stage([file('evil.zip', zip)]);
    await expect(api.import({ kind: 'pack', stagedId: staged!.id })).rejects.toMatchObject({ code: 'INVALID_PACKAGE' });
    expect((await api.list()).filter(item => !item.staged)).toEqual([]);
    api.dispose();
  });

  // FCW-33's low (a), FCW-32 round 2: a member named with a backslash or a drive letter, riding beside a pack that would
  // otherwise store, is refused on the v2 route as the forward-slash traversal is -- by name, storing nothing.
  it.each([['a\\b.json'], ['C:/x.json']])('refuses a zip carrying the member %s on the v2 route, storing nothing', async name => {
    const t = await thunderstorePack(), api = createPackRegistry(options());
    const zip = makeZip([...t.files.map(f => ({ name: f.path, data: f.bytes })), { name, data: utf8('{}') }]);
    const [staged] = await api.stage([file('evil.zip', zip)]);
    await expect(api.import({ kind: 'pack', stagedId: staged!.id })).rejects.toMatchObject({ code: expect.stringMatching(/^INVALID_(PACKAGE|PATH)$/) });
    expect((await api.list()).filter(item => !item.staged)).toEqual([]);
    api.dispose();
  });

  it('lets s2u-pack.json decide before a root manifest.json at install', async () => {
    const t = await thunderstorePack(), api = createPackRegistry(options());
    expect(await api.install(t.ref, t.files)).toMatchObject({ ref: t.ref, stored: true, slot: 'independent', packKinds: ['content'] });
    api.dispose();
  });

  it('still installs a legacy texture pack with a root manifest.json and no s2u-pack.json as before (registry.ts:440)', async () => {
    const archive = utf8('authored archive'), archiveSha256 = await sha256Hex(archive);
    const textureContext = { ...context, archives: { 'RUN/MP51.ZDB': archiveSha256 } };
    const built = await buildTexturePack([{ key: 'fixture', library: 'MP51', record: 'fixture',
      flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
      levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }],
    }], { archiveSha256, archiveBytes: archive.length, toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
    const files = [{ path: 'manifest.json', bytes: built.manifestBytes }, ...[...built.payloads].map(([path, bytes]) => ({ path, bytes }))];
    const checked = await validateLegacyPack('texture', files, textureContext);
    if (!checked.ok) throw Error('The texture fixture must validate.');
    const config = { ...options(), context: textureContext }, api = createPackRegistry(config);
    const result = await api.install(checked.ref, files);
    expect(result).toMatchObject({ kind: 'texture', slot: 'per-map', ref: checked.ref, stored: true, packKinds: ['content'] });
    expect(result.id).toMatch(/^texture:MP51:/);
    expect(await config.textures!.file('MP51', built.id, 'manifest.json')).toEqual(built.manifestBytes);
    api.dispose();
  });

  it('reaches the v2 import from the agent bridge (packs.import kind pack)', async () => {
    const snapshot = { ready: true, mode: 'forge-editor', revision: 1, layout: null, selection: [], refs: [], catalogue: { assets: [] },
      issues: [], view: {}, canUndo: false, canRedo: false } as unknown as ForgeAgentSnapshot;
    const api = { read: () => snapshot, status: () => ({ ready: true, mode: 'forge-editor', revision: 1, viewRevision: 0, name: 'Forge', map: null }),
      execute: vi.fn(), subscribe: () => () => {}, dispose: vi.fn(), resetSession: vi.fn(), refreshExternalState: vi.fn() } as unknown as ForgeAgentApi;
    const result = { id: 'pack:example.yard@1.2.0#x', kind: 'unknown', name: 'Yard', files: 8, bytes: 1, staged: false, imported: true, stored: true, enabled: false, applied: false, diagnostics: [] };
    const packs = { import: vi.fn(async () => result) } as unknown as LocalPackApi;
    const target = createForgePageTarget({ api, packs, build: 'test' });
    const request: AgentRequest = { version: 1, requestId: 'one', sessionId: 'placeholder', targetId: 'target', epoch: 'epoch', operation: 'packs.import',
      args: { kind: 'pack', stagedId: 'picked' }, expectedRevision: 1 };
    expect(await target.dispatch(request, new AbortController().signal)).toMatchObject({ outcome: 'ok', data: result });
    expect(packs.import).toHaveBeenCalledWith({ kind: 'pack', stagedId: 'picked' }, expect.anything());
  });
});
