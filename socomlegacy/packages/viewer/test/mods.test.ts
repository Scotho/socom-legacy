import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpAssetSource } from '@s2u/archive';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_MOD_CHOICES, formatModChoices, moveMod, parseModChoices, toggleMod, type ModChoices } from '../src/mods/choices';
import { loadMods, type ModSource } from '../src/mods/load';
import { MOD_GAME_TARGET, ModManifestError, parseModManifest, parseModManifestBytes } from '../src/mods/manifest';
import { installMemberOverrides, parseZdb, zdbMember } from '@s2u/archive';
import { applyOverrideSource, installModOverrides, MOD_ADDED_FILE_LBN, modOverridesActive } from '../src/mods/override';
import { idbModLibrary, memoryModLibrary, MOD_QUOTA_MESSAGE, ModStoreError } from '../src/mods/store';
import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { modPackageFromEntries, modPackageFromZip } from '../src/mods/readPackage';
import { sourceCache } from '../src/discSource';
import { makeZip } from './zipFixture';

const enc = new TextEncoder();
const dec = new TextDecoder();
const text = (value: string): Uint8Array => enc.encode(value);

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 's2u-mod', formatVersion: 1, id: 'hello-notes', name: 'Hello notes', version: '0.1.0',
    author: 'Dustin', description: 'A synthetic text override.', target: MOD_GAME_TARGET,
    files: [{ path: 'NOTES/HELLO.TXT', file: 'HELLO.TXT' }], ...over,
  };
}

function source(id: string, body: string, path = 'NOTES/HELLO.TXT', file = 'HELLO.TXT'): ModSource {
  const man = manifest({ id, name: id, files: [{ path, file }] });
  return { label: `${id}.zip`, files: new Map([['mod.json', text(JSON.stringify(man))], [file, text(body)]]) };
}

const off: ModChoices = { enabled: true, order: [], disabled: [] };

/** A one-member ZDB, large enough for `data` and 2048-aligned the way `zdb.test.ts` builds one. */
function syntheticZdb(entries: { name: string; data: number[] }[]): Uint8Array {
  const dataStart = 2048;
  const out = new Uint8Array(dataStart + 2048 * entries.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0x98, entries.length, true);
  dv.setUint32(0x9c, 0x5c, true);
  entries.forEach((entry, i) => {
    const o = 0xa0 + i * 0x5c;
    dv.setUint32(o, 0x5c, true);
    for (let k = 0; k < entry.name.length; k++) out[o + 4 + k] = entry.name.charCodeAt(k);
    dv.setUint32(o + 68, dataStart + i * 2048, true);
    dv.setUint32(o + 72, entry.data.length, true);
    out.set(entry.data, dataStart + i * 2048);
  });
  return out;
}

class Disc {
  readonly reads: string[] = [];
  readonly ranges: string[] = [];
  readonly sizes: string[] = [];
  readonly streams: string[] = [];
  readonly blobs: string[] = [];
  listed: string[];
  constructor(private readonly files: Record<string, Uint8Array>) { this.listed = Object.keys(files); }
  async list(): Promise<string[]> { return this.listed; }
  async read(path: string): Promise<Uint8Array> {
    this.reads.push(path);
    const bytes = this.files[path];
    if (!bytes) throw new Error(`disc miss ${path}`);
    return bytes;
  }
  async size(path: string): Promise<number> {
    this.sizes.push(path);
    const bytes = this.files[path];
    if (!bytes) throw new Error(`disc miss ${path}`);
    return bytes.byteLength;
  }
  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    this.ranges.push(path);
    const bytes = this.files[path];
    if (!bytes) throw new Error(`disc miss ${path}`);
    return bytes.slice(offset, offset + length);
  }
  async *stream(path: string): AsyncGenerator<Uint8Array> {
    this.streams.push(path);
    const bytes = this.files[path];
    if (!bytes) throw new Error(`disc miss ${path}`);
    yield bytes;
  }
  async fileBlob(path: string): Promise<Blob> {
    this.blobs.push(path);
    const bytes = this.files[path];
    if (!bytes) throw new Error(`disc miss ${path}`);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy.buffer]);
  }
}

afterEach(() => { installModOverrides(null); installMemberOverrides(null); vi.unstubAllGlobals(); });

describe('mod.json', () => {
  it('parses a manifest and canonicalises the disc path', () => {
    const parsed = parseModManifest(manifest({ files: [{ path: 'notes\\hello.txt;1', file: './HELLO.TXT' }] }));
    expect(parsed).toMatchObject({ id: 'hello-notes', version: '0.1.0', author: 'Dustin', target: MOD_GAME_TARGET });
    expect(parsed).not.toHaveProperty('priority');
    expect(parsed.files).toEqual([{ kind: 'file', path: 'NOTES/HELLO.TXT', file: 'HELLO.TXT' }]);
    expect(parseModManifest(manifest({ priority: 9 })).id).toBe('hello-notes');
  });

  it('names the field when the manifest is refused', () => {
    expect(() => parseModManifest(manifest({ format: 'pack' }))).toThrow(ModManifestError);
    expect(() => parseModManifest(manifest({ format: 'pack' }))).toThrow('mod.json: format must be "s2u-mod"');
    expect(() => parseModManifest(manifest({ formatVersion: 2 }))).toThrow('formatVersion must be 1');
    expect(() => parseModManifest(manifest({ id: 'Hello' }))).toThrow('id must be');
    expect(() => parseModManifest(manifest({ id: '-no' }))).toThrow('id must be');
    expect(() => parseModManifest(manifest({ target: 'socom2-eu' }))).toThrow(`target must be "${MOD_GAME_TARGET}"`);
    expect(() => parseModManifest(manifest({ files: [{ path: '../SECRET.TXT', file: 'X.TXT' }] }))).toThrow('files[0].path');
    expect(() => parseModManifest(manifest({ files: [{ path: 'A.TXT', file: 'mod.json' }] }))).toThrow('files[0].file');
    expect(() => parseModManifest(manifest({ files: [{ path: 'A.TXT', file: 'A.TXT' }, { path: 'a.txt', file: 'B.TXT' }] }))).toThrow('repeats A.TXT');
    const member = parseModManifest(manifest({
      files: [{ archive: 'run/mp61.zdb', member: 'HUD_PAL.ZED', file: 'HUD_PAL.ZED' }],
    }));
    expect(member.files).toEqual([{ kind: 'member', archive: 'RUN/MP61.ZDB', member: 'HUD_PAL.ZED', file: 'HUD_PAL.ZED' }]);
    expect(() => parseModManifest(manifest({
      files: [{ path: 'RUN/MP61.ZDB', archive: 'RUN/MP61.ZDB', member: 'A.ZED', file: 'A.ZED' }],
    }))).toThrow('names a disc path and an archive member');
    expect(() => parseModManifestBytes(text('{'))).toThrow('mod.json: not JSON');
    expect(() => parseModManifest(null)).toThrow('must be a JSON object');
  });
});

describe('load order and conflicts', () => {
  it('the lower mod wins, and the upper one is named', () => {
    const session = loadMods([
      source('upper', 'from-upper'),
      source('lower', 'from-lower'),
    ], { enabled: true, order: ['upper', 'lower'], disabled: [] });
    expect(session.overrides).toEqual([{ kind: 'file', path: 'NOTES/HELLO.TXT', bytes: text('from-lower'), modId: 'lower' }]);
    expect(session.conflicts).toEqual([{ path: 'NOTES/HELLO.TXT', winnerId: 'lower', loserIds: ['upper'] }]);
    expect(session.rows.map((row) => row.kind === 'loaded' ? `${row.id}:${row.enabled ? 'loaded' : 'off'}` : row.reason)).toEqual(['upper:loaded', 'lower:loaded']);
    const flipped = loadMods([
      source('upper', 'from-upper'),
      source('lower', 'from-lower'),
    ], moveMod({ enabled: true, order: ['upper', 'lower'], disabled: [] }, 'lower', -1));
    expect(dec.decode(flipped.overrides[0]!.bytes)).toBe('from-upper');
    expect(flipped.conflicts[0]).toMatchObject({ winnerId: 'upper', loserIds: ['lower'] });
  });

  it('a priority field does not change the winner, and a wrong target is invalid', () => {
    const upper: ModSource = {
      label: 'upper.zip',
      files: new Map([
        ['mod.json', text(JSON.stringify(manifest({ id: 'upper', name: 'upper', priority: 100 })))],
        ['HELLO.TXT', text('from-upper')],
      ]),
    };
    const session = loadMods([upper, source('lower', 'from-lower')], { enabled: true, order: ['upper', 'lower'], disabled: [] });
    expect(dec.decode(session.overrides[0]!.bytes)).toBe('from-lower');
    const refused = loadMods([{ label: 'eu.zip', files: new Map([['mod.json', text(JSON.stringify(manifest({ target: 'socom2-eu' })))]]) }], off);
    expect(refused.rows[0]).toMatchObject({ kind: 'invalid', reason: expect.stringContaining(`target must be "${MOD_GAME_TARGET}"`) });
    const marked = loadMods([source('hello-notes', 'x', 'NOTES/NEW.TXT', 'NEW.TXT')], off, new Set(['NOTES/HELLO.TXT']));
    expect(marked.rows[0]).toMatchObject({ kind: 'loaded', paths: [{ path: 'NOTES/NEW.TXT', role: 'added' }] });
    const replaced = loadMods([source('hello-notes', 'x')], off, new Set(['NOTES/HELLO.TXT']));
    expect(replaced.rows[0]).toMatchObject({ kind: 'loaded', paths: [{ path: 'NOTES/HELLO.TXT', role: 'replaces' }] });
  });

  it('a mod that is off, and a master switch that is off, do not override or conflict', () => {
    const sources = [source('alpha', 'a'), source('beta', 'b', 'NOTES/OTHER.TXT', 'OTHER.TXT')];
    const disabled = loadMods(sources, toggleMod({ enabled: true, order: ['alpha', 'beta'], disabled: [] }, 'alpha', false));
    expect(disabled.overrides.map((entry) => entry.modId)).toEqual(['beta']);
    expect(disabled.conflicts).toEqual([]);
    expect(disabled.rows[0]).toMatchObject({ id: 'alpha', enabled: false });
    const masterOff = loadMods([source('alpha', 'a'), source('beta', 'a')], { ...off, order: ['alpha', 'beta'] });
    expect(masterOff.conflicts).toHaveLength(1);
    const quiet = loadMods([source('alpha', 'a'), source('beta', 'a')], { enabled: false, order: ['alpha', 'beta'], disabled: [] });
    expect(quiet.overrides).toEqual([]);
    expect(quiet.samplePath).toBeNull();
  });

  it('a ZDB member is its own override, and the lower row wins it', () => {
    const pack = (id: string, body: string): ModSource => ({
      label: `${id}.zip`,
      files: new Map([
        ['mod.json', text(JSON.stringify(manifest({
          id, name: id, files: [{ archive: 'RUN/MP61.ZDB', member: 'HUD_PAL.ZED', file: 'HUD.ZED' }],
        })))],
        ['HUD.ZED', text(body)],
      ]),
    });
    const session = loadMods([pack('upper', 'U'), pack('lower', 'L')], { enabled: true, order: ['upper', 'lower'], disabled: [] });
    expect(session.rows[0]).toMatchObject({ paths: [{ path: 'RUN/MP61.ZDB HUD_PAL.ZED', role: 'member' }] });
    expect(session.conflicts).toEqual([{ path: 'RUN/MP61.ZDB ! HUD_PAL.ZED', winnerId: 'lower', loserIds: ['upper'] }]);
    expect(session.overrides[0]).toMatchObject({ kind: 'member', archive: 'RUN/MP61.ZDB', member: 'HUD_PAL.ZED' });
    expect(dec.decode(session.overrides[0]!.bytes)).toBe('L');
  });

  it('an invalid package is reported and does not enter the order, and a repeated id is refused', () => {
    const bad = manifest({ files: [{ path: 'NOTES/HELLO.TXT', file: 'MISSING.TXT' }] });
    const session = loadMods([
      { label: 'bad.zip', files: new Map([['mod.json', text(JSON.stringify(bad))]]) },
      source('hello-notes', 'ok'),
      source('hello-notes', 'again'),
      { label: 'nope.zip', error: 'mod.json is missing' },
    ], off);
    expect(session.rows.filter((row) => row.kind === 'invalid').map((row) => row.kind === 'invalid' ? row.reason : '')).toEqual([
      'MISSING.TXT is not in the package',
      'a mod with id hello-notes is already loaded',
      'mod.json is missing',
    ]);
    expect(session.overrides).toHaveLength(1);
    expect(dec.decode(session.overrides[0]!.bytes)).toBe('ok');
  });

  it('returns file bytes and does not treat them as code', () => {
    const body = 'process.exit(1)';
    const session = loadMods([source('hello-notes', body, 'NOTES/PAYLOAD.TXT', 'PAYLOAD.TXT')], off);
    expect(dec.decode(session.overrides[0]!.bytes)).toBe(body);
    const dir = resolve(import.meta.dirname, '../src/mods');
    for (const name of readdirSync(dir)) {
      const src = readFileSync(resolve(dir, name), 'utf8');
      expect(src, name).not.toMatch(/\beval\s*\(|\bnew Function\b|\bimport\s*\(/);
    }
  });

  it('keeps a remembered id that was not picked this visit', () => {
    const session = loadMods([source('fresh', 'x', 'NOTES/FRESH.TXT', 'FRESH.TXT')], { enabled: false, order: ['remembered'], disabled: ['remembered'] });
    expect(session.choices).toEqual({ enabled: false, order: ['remembered', 'fresh'], disabled: ['remembered'] });
  });
});

describe('packages', () => {
  it('reads a zip and a folder, including one folder wrapped around mod.json', async () => {
    const man = text(JSON.stringify(manifest()));
    const hello = text('hello from the mod');
    const zip = await modPackageFromZip('hello.zip', makeZip([
      { name: 'mod.json', data: man, method: 0 },
      { name: 'HELLO.TXT', data: hello, method: 0 },
      { name: 'UNUSED.TXT', data: text('no'), method: 0 },
    ]));
    expect(dec.decode(zip.files.get('HELLO.TXT')!)).toBe('hello from the mod');
    const nested = modPackageFromEntries('Folder', [
      { path: 'Folder/mod.json', bytes: man },
      { path: 'Folder/HELLO.TXT', bytes: hello },
    ]);
    expect(nested.files.has('mod.json')).toBe(true);
    const session = loadMods([{ label: nested.label, files: nested.files }], off);
    expect(dec.decode(session.overrides[0]!.bytes)).toBe('hello from the mod');
    await expect(modPackageFromZip('bad.zip', text('not a zip'))).rejects.toThrow(/not a zip|end of central directory/);
    expect(() => modPackageFromEntries('x', [{ path: '../mod.json', bytes: man }])).toThrow(/mod.json is missing|outside|\.\./);
  });

  it('accepts a file past the old 16 MiB cap; the store quota is the size failure', async () => {
    const big = new Uint8Array(16 * 1024 * 1024 + 1);
    big[0] = 1;
    big[big.length - 1] = 2;
    const man = text(JSON.stringify(manifest({ files: [{ path: 'RUN/MP61.ZDB', file: 'MP61.ZDB' }] })));
    const packed = modPackageFromEntries('map', [
      { path: 'mod.json', bytes: man },
      { path: 'MP61.ZDB', bytes: big },
    ]);
    const session = loadMods([{ label: packed.label, files: packed.files }], { enabled: true, order: ['hello-notes'], disabled: [] });
    expect(session.rows[0]).toMatchObject({ kind: 'loaded', id: 'hello-notes' });
    expect(session.overrides[0]?.bytes).toBe(packed.files.get('MP61.ZDB'));
    expect(session.overrides[0]?.bytes.byteLength).toBe(big.byteLength);
  });
});

describe('the override hook', () => {
  it('with no mods, returns the disc source and the disc bytes, the same arrays', async () => {
    expect(modOverridesActive()).toBe(false);
    const discBytes = text('from the disc');
    const disc = new Disc({ 'NOTES/HELLO.TXT': discBytes });
    const hooked = applyOverrideSource(disc);
    expect(hooked).toBe(disc);
    expect(hooked.read).toBe(disc.read);
    expect(await hooked.read('NOTES/HELLO.TXT')).toBe(discBytes);
    expect(await hooked.readRange('NOTES/HELLO.TXT', 0, 4)).toEqual(text('from'));
    expect(disc.reads).toEqual(['NOTES/HELLO.TXT']);
    expect(disc.ranges).toEqual(['NOTES/HELLO.TXT']);
  });

  it('an overridden path is the mod bytes and the disc is not read; another path is the disc bytes unchanged', async () => {
    const discBytes = text('from the disc');
    const other = text('untouched');
    const modBytes = text('from the mod');
    const disc = new Disc({ 'NOTES/HELLO.TXT': discBytes, 'NOTES/OTHER.TXT': other });
    installModOverrides([{ path: 'notes/hello.txt', bytes: modBytes }]);
    const hooked = applyOverrideSource(disc);
    expect(hooked).not.toBe(disc);
    expect(applyOverrideSource(disc)).toBe(hooked);
    expect(await hooked.read('NOTES/HELLO.TXT')).toBe(modBytes);
    expect(await hooked.size('notes/hello.txt')).toBe(modBytes.byteLength);
    const range = await hooked.readRange('NOTES/HELLO.TXT', 5, 3);
    expect(dec.decode(range)).toBe('the');
    expect(range.buffer).not.toBe(modBytes.buffer);
    const streamed: Uint8Array[] = [];
    for await (const chunk of hooked.stream!('NOTES/HELLO.TXT')) streamed.push(chunk);
    expect(dec.decode(streamed[0]!)).toBe('from the mod');
    expect(dec.decode(new Uint8Array(await (await hooked.fileBlob!('NOTES/HELLO.TXT')).arrayBuffer()))).toBe('from the mod');
    expect(disc.reads).toEqual([]);
    expect(disc.sizes).toEqual([]);
    expect(disc.ranges).toEqual([]);
    expect(disc.streams).toEqual([]);
    expect(disc.blobs).toEqual([]);
    expect(await hooked.read('NOTES/OTHER.TXT')).toBe(other);
    expect(disc.reads).toEqual(['NOTES/OTHER.TXT']);
    expect(await hooked.list()).toBe(disc.listed);
    installModOverrides([{ path: 'NOTES/NEW.TXT', bytes: text('added') }]);
    expect(await applyOverrideSource(disc).list()).toEqual([...disc.listed, 'NOTES/NEW.TXT']);
    expect(dec.decode(await applyOverrideSource(disc).read('NOTES/NEW.TXT'))).toBe('added');
    expect(disc.reads).toEqual(['NOTES/OTHER.TXT']);
  });

  it('lists an added file beside the disc, and a replacement keeps the disc sector', async () => {
    const hello = text('from the disc');
    const extents = [{ path: 'NOTES/HELLO.TXT', lbn: 42, size: hello.byteLength }];
    const asked: string[] = [];
    const disc = {
      async list() { return ['NOTES/HELLO.TXT']; },
      async read() { return hello; },
      async extents() { return extents; },
      async extent(path: string) {
        asked.push(path);
        const found = extents.find((entry) => entry.path === path);
        if (!found) throw new Error(`miss ${path}`);
        return { lbn: found.lbn, size: found.size };
      },
    };
    installModOverrides([
      { path: 'NOTES/HELLO.TXT', bytes: text('mod-hello-bytes') },
      { path: 'NOTES/NEW.TXT', bytes: text('added') },
    ]);
    const hooked = applyOverrideSource(disc);
    expect(await hooked.extents()).toEqual([
      { path: 'NOTES/HELLO.TXT', lbn: 42, size: text('mod-hello-bytes').byteLength },
      { path: 'NOTES/NEW.TXT', lbn: MOD_ADDED_FILE_LBN, size: text('added').byteLength },
    ]);
    expect(await hooked.extent('NOTES/HELLO.TXT')).toEqual({ lbn: 42, size: text('mod-hello-bytes').byteLength });
    expect(await hooked.extent('NOTES/NEW.TXT')).toEqual({ lbn: MOD_ADDED_FILE_LBN, size: text('added').byteLength });
    installModOverrides([{ path: 'NOTES/HELLO.TXT', bytes: hello }]);
    expect(await hooked.extents()).toBe(extents);
    expect(asked).toEqual(['NOTES/HELLO.TXT', 'NOTES/NEW.TXT']);
  });

  it('clearing the table returns the disc reader, including through sourceCache', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('the disc should not be fetched')));
    vi.stubGlobal('fetch', fetchSpy);
    const cache = sourceCache();
    const request = { kind: 'http' as const, baseUrl: 'http://maps.test/maps' };
    const raw = cache(request);
    expect(raw).toBeInstanceOf(HttpAssetSource);
    expect(raw.read).toBe(HttpAssetSource.prototype.read);
    expect(cache(request)).toBe(raw);
    installModOverrides([{ path: 'NOTES/HELLO.TXT', bytes: text('mod') }]);
    const wrapped = cache(request);
    expect(wrapped).not.toBe(raw);
    expect(wrapped).toBeInstanceOf(HttpAssetSource);
    expect(cache(request)).toBe(wrapped);
    expect(dec.decode(await wrapped.read('NOTES/HELLO.TXT'))).toBe('mod');
    expect(fetchSpy).not.toHaveBeenCalled();
    installModOverrides(null);
    expect(cache(request)).toBe(raw);
    expect(modOverridesActive()).toBe(false);
  });

  it('the map worker is the place the table is installed, and sourceCache is the hook', () => {
    const worker = readFileSync(resolve(import.meta.dirname, '../src/worker.ts'), 'utf8');
    const disc = readFileSync(resolve(import.meta.dirname, '../src/discSource.ts'), 'utf8');
    const main = readFileSync(resolve(import.meta.dirname, '../src/main.ts'), 'utf8');
    expect(worker).toContain("request.kind === 'mods'");
    expect(worker).toContain('installModOverrides(request.entries)');
    expect(worker).toContain('installMemberOverrides(request.members)');
    expect(disc).toContain('return applyOverrideSource(');
    expect(main).toContain('mountModPanel(document, worker,');
    expect(main).toContain('load(loaded.path, true)');
    expect(main).toContain('reopenArmory');
    const indexCase = main.slice(main.indexOf("message.kind === 'index'"), main.indexOf("message.kind === 'play'"));
    expect(indexCase).toContain("kind: 'mod-disc'");
    expect(main).toContain("from './mods/panel'");
  });

  it('a member of a ZDB is the mod bytes, and with no member table the slice is the archive\'s own view', async () => {
    const discBytes = syntheticZdb([{ name: 'RUN\\COMMON\\HUD_PAL.ZED', data: [4, 5, 6] }]);
    const modBytes = text('palette from the mod');
    const disc = new Disc({ 'RUN/MP61.ZDB': discBytes });
    installMemberOverrides([{ archive: 'run/mp61.zdb', member: 'HUD_PAL.ZED', bytes: modBytes }]);
    const hooked = applyOverrideSource(disc);
    expect(hooked).not.toBe(disc);
    const read = await hooked.read('RUN/MP61.ZDB');
    expect(read).toBe(discBytes);
    expect(zdbMember(read, parseZdb(read), 'HUD_PAL.ZED')).toBe(modBytes);
    installMemberOverrides(null);
    const plain = new Disc({ 'RUN/MP61.ZDB': discBytes });
    expect(applyOverrideSource(plain)).toBe(plain);
    const again = zdbMember(discBytes, parseZdb(discBytes), 'HUD_PAL.ZED');
    expect(again.buffer).toBe(discBytes.buffer);
    expect(Array.from(again)).toEqual([4, 5, 6]);
  });
});

describe('stored choices', () => {
  it('keeps ids and order and drops anything else', () => {
    expect(parseModChoices(null)).toEqual(EMPTY_MOD_CHOICES);
    expect(parseModChoices('{')).toEqual(EMPTY_MOD_CHOICES);
    const raw = formatModChoices({ enabled: true, order: ['beta', 'alpha'], disabled: ['alpha'] });
    expect(parseModChoices(raw)).toEqual({ enabled: true, order: ['beta', 'alpha'], disabled: ['alpha'] });
    expect(raw).not.toContain('HELLO');
    expect(parseModChoices(JSON.stringify({ version: 1, enabled: true, order: ['OK', '../x', 'alpha'], disabled: ['nope'] }))).toEqual({
      enabled: true, order: ['alpha'], disabled: [],
    });
  });
});

describe('the browser library', () => {
  it('keeps the bytes, the order and the switches, and a remove drops the bytes', async () => {
    const factory = new FakeFactory();
    const library = idbModLibrary(() => factory);
    const hello = text('hello from the mod');
    await library.put({
      id: 'hello-notes', label: 'hello.zip',
      files: [{ name: 'mod.json', bytes: text('{}') }, { name: 'HELLO.TXT', bytes: hello }],
    });
    await library.writeChoices({ enabled: true, order: ['hello-notes'], disabled: [] });
    const saved = await library.read();
    expect(saved.choices).toEqual({ enabled: true, order: ['hello-notes'], disabled: [] });
    const body = saved.packages[0]?.files.find((file) => file.name === 'HELLO.TXT')?.bytes;
    expect(dec.decode(body!)).toBe('hello from the mod');
    await library.remove('hello-notes');
    const after = await library.read();
    expect(after.packages).toEqual([]);
    expect(after.choices.order).toEqual(['hello-notes']);
  });

  it('a full store refuses the new package and leaves what was already kept', async () => {
    const library = memoryModLibrary(8);
    await library.put({ id: 'small', label: 'small.zip', files: [{ name: 'A.TXT', bytes: text('1234') }] });
    await expect(library.put({ id: 'big', label: 'big.zip', files: [{ name: 'B.TXT', bytes: text('12345') }] }))
      .rejects.toMatchObject({ name: 'ModStoreError', kind: 'quota', message: MOD_QUOTA_MESSAGE });
    expect((await library.read()).packages.map((mod) => mod.id)).toEqual(['small']);
  });

  it('with no store, a read is empty and a write says so', async () => {
    const library = idbModLibrary(() => null);
    // `unavailable`: not an emptied store, so the page's mods flag is kept (MODS_SCOPE_ADAPTATION, the re-review's N3).
    expect(await library.read()).toEqual({ choices: EMPTY_MOD_CHOICES, packages: [], unavailable: true });
    await expect(library.writeChoices(EMPTY_MOD_CHOICES)).rejects.toBeInstanceOf(ModStoreError);
  });
});
