import { describe, expect, it, vi } from 'vitest';
import { localPath, readLocalPath, readPickedFiles, unpackLocalZip, LOCAL_FILE_LIMITS } from '../src/agent/localFiles';
import { makeZip } from './zipFixture';

const file = (name: string, text = '{}') => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer });

describe('browser-local file capabilities (adaptation)', () => {
  it.each(['../map.json', '/map.json', 'C:/map.json', 'x\\map.json', 'https://example.com/map.json', 'a/./map.json', 'CON.json', 'a%2fmap.json', 'a./map.json', '.git/map.json'])('refuses unsafe relative path %s', path => {
    expect(() => localPath(path)).toThrowError(expect.objectContaining({ code: 'INVALID_PATH' }));
  });
  it('requires a granted root and refuses traversal before using the root', async () => {
    await expect(readLocalPath(null, 'map.json')).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    const getFileHandle = vi.fn();
    const root = { kind: 'directory' as const, name: 'root', queryPermission: async () => 'denied' as const, getFileHandle, getDirectoryHandle: vi.fn(), async *values() {} };
    await expect(readLocalPath(root, 'map.json')).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    await expect(readLocalPath(root, '../map.json')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    expect(getFileHandle).not.toHaveBeenCalled();
  });
  it('reads only beneath its granted root', async () => {
    const getFileHandle = vi.fn(async () => ({ kind: 'file' as const, name: 'map.json', getFile: async () => file('map.json') }));
    const child = { kind: 'directory' as const, name: 'maps', getFileHandle, getDirectoryHandle: vi.fn(), async *values() {} };
    const root = { ...child, name: 'root', queryPermission: async () => 'granted' as const, getDirectoryHandle: vi.fn(async () => child) };
    const entries = await readLocalPath(root, 'maps/map.json');
    expect(entries.map(e => e.path)).toEqual(['map.json']);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('maps');
    expect(getFileHandle).toHaveBeenCalledWith('map.json');
  });
  it('checks count, bytes, extensions and case-insensitive duplicates before reading', async () => {
    const read = vi.fn();
    await expect(readPickedFiles([{ name: 'map.json', size: LOCAL_FILE_LIMITS.bytes + 1, arrayBuffer: read }])).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(readPickedFiles([file('map.json'), file('MAP.json')])).rejects.toMatchObject({ code: 'DUPLICATE_PATH' });
    await expect(readPickedFiles([file('evil.js')])).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
    await expect(readPickedFiles(Array.from({ length: LOCAL_FILE_LIMITS.files + 1 }, () => file('map.json')))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(read).not.toHaveBeenCalled();
  });
  // FCW-33: the v2 roles' payload types (packs.ts ROLE_TYPES: gltf, ktx2, ogg, wav) and Thunderstore's README.md /
  // CHANGELOG.md, read as bytes like every other member; scripts stay refused.
  it.each(['README.md', 'CHANGELOG.md', 'sounds/hit.ogg', 'sounds/step.wav', 'models/crate.gltf', 'textures/crate.ktx2'])('reads the v2 and store member %s', async path => {
    expect((await readPickedFiles([{ ...file(path.split('/').pop()!), webkitRelativePath: path }]))[0]?.path).toBe(path);
    expect((await unpackLocalZip(makeZip([{ name: path, data: 'x' }])))[0]?.path).toBe(path);
  });
  it('keeps webkitRelativePath and cancels between reads', async () => {
    const abort = new AbortController();
    const files = [{ ...file('map.json'), webkitRelativePath: 'pack/map.json', arrayBuffer: async () => { abort.abort(); return new ArrayBuffer(2); } }];
    await expect(readPickedFiles(files, { signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect((await readPickedFiles([{ ...file('map.json'), webkitRelativePath: 'pack/map.json' }]))[0]?.path).toBe('pack/map.json');
  });
  it('preflights archive paths, duplicate names, scripts and declared expansion before extraction', async () => {
    for (const zip of [makeZip([{ name: '../map.json', data: '{}' }]), makeZip([{ name: 'a.json', data: '{}' }, { name: 'A.json', data: '{}' }]), makeZip([{ name: 'a.js', data: 'alert(1)' }])]) {
      await expect(unpackLocalZip(zip)).rejects.toBeDefined();
    }
    await expect(unpackLocalZip(makeZip([{ name: 'a.json', data: 'x', size: LOCAL_FILE_LIMITS.bytes + 1 }]))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });
  it('refuses symlink archive entries, including ones hidden before trailing bytes', async () => {
    const zip = makeZip([{ name: 'map.json', data: '../private/map.json', method: 0 }]);
    const view = new DataView(zip.buffer);
    for (let at = 0; at < zip.length - 46; at++) if (view.getUint32(at, true) === 0x02014b50) { view.setUint32(at + 38, 0xa1ff0000, true); break; }
    await expect(unpackLocalZip(zip)).rejects.toMatchObject({ code: 'INVALID_PATH' });
    const trailing = new Uint8Array(zip.length + 1); trailing.set(zip);
    await expect(unpackLocalZip(trailing)).rejects.toBeDefined();
  });
});
