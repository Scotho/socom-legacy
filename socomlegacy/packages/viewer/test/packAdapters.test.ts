import { describe, expect, it } from 'vitest';
import { ENGINE_CONTRACT_VERSION, PACK_TARGET_US, sha256Hex, type BufferedPackFile, type PackContext } from '@s2u/creator-contracts';
import { validateLegacyPack } from '../src/packs/adapters';
import { buildTexturePack } from '../../../tools/localTexturePack';
import type { PackSource } from '../src/texturePack';

const bytes = (text: string) => new TextEncoder().encode(text);
const context: PackContext = { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION, packs: [], handlers: [] };
function mod(version = '1'): BufferedPackFile[] {
  return [{ path: 'mod.json', bytes: bytes(JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'demo', name: 'Demo',
    version, author: 'Fixture', description: '', target: 'socom2-us-r0001', files: [{ path: 'NOTES/DEMO.TXT', file: 'demo.txt' }] })) },
  { path: 'demo.txt', bytes: bytes('authored mod bytes') }];
}
const model = (): BufferedPackFile[] => [{ path: 'models.json', bytes: bytes(JSON.stringify({
  format: 's2u-model-pack', version: 1, models: [{ id: 'crate', file: 'crate.glb' }],
})) }, { path: 'crate.glb', bytes: new Uint8Array([1, 2, 3]) }];

describe('native pack framework identity adapters (product adaptation)', () => {
  it('maps a parsed mod onto the reserved dot namespace and its canonical ref', async () => {
    const checked = await validateLegacyPack('mod', mod(), context);
    expect(checked).toMatchObject({ ok: true, ref: { id: 'mod.demo', version: '0.0.0+legacy.1' } });
    if (!checked.ok) return;
    expect(checked.ref.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(checked.manifest.legacy).toEqual({ kind: 'mod', manifest: 'mod.json' });
    expect(checked.report.status).toBe('pass');
  });

  it('keeps primary and second model identities distinct without changing the manifest or drawing a GLB', async () => {
    const files = model();
    expect(await validateLegacyPack('model', files, context)).toMatchObject({ ok: true, ref: { id: 'model.current' } });
    expect(await validateLegacyPack('model', files, context, { slot: 'second' })).toMatchObject({ ok: true, ref: { id: 'model.second' } });
    expect(new TextDecoder().decode(files[0]!.bytes)).toContain('s2u-model-pack');
  });

  it('validates a streamed native model manifest and reused payload chunks through the published hashing path', async () => {
    const files = model(), expected = await validateLegacyPack('model', files, context), reads = [0, 0];
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    const streamed = files.map((file, index) => ({ path: file.path, size: file.bytes.length,
      async *read() {
        reads[index] = (reads[index] ?? 0) + 1;
        const chunk = new Uint8Array(1);
        for (const byte of file.bytes) { chunk[0] = byte; yield chunk; }
      },
    }));
    expect(await validateLegacyPack('model', streamed, context)).toMatchObject({ ok: true, ref: expected.ref });
    expect(reads).toEqual([1, 1]);
  });

  it('keeps same-map texture uploads distinguishable by full canonical hash and checks their real legacy manifests', async () => {
    const archive = bytes('authored archive fixture'), archiveSha256 = await sha256Hex(archive);
    const source = (red: number): PackSource => ({ key: 'fixture', library: 'MP51', record: 'fixture',
      flags: { bilinear: true, transparent: false, graded: false, opaque: true, gs: null },
      levels: [{ width: 1, height: 1, data: new Uint8ClampedArray([red, 2, 3, 255]) }],
    });
    const check = async (red: number) => {
      const built = await buildTexturePack([source(red)], { archiveSha256, archiveBytes: archive.length,
        toolCommit: 'b'.repeat(40), toolSha256: 'c'.repeat(64) });
      return validateLegacyPack('texture', [{ path: 'manifest.json', bytes: built.manifestBytes },
        ...[...built.payloads].map(([path, bytes]) => ({ path, bytes }))],
      { ...context, archives: { 'RUN/MP51.ZDB': archiveSha256 } });
    };
    const a = await check(1), b = await check(9);
    expect(a).toMatchObject({ ok: true, ref: { id: 'texture.mp51', version: '1.0.0' } });
    expect(b).toMatchObject({ ok: true, ref: { id: 'texture.mp51', version: '1.0.0' } });
    if (a.ok && b.ok) expect(a.ref.hash).not.toBe(b.ref.hash);
  });

  it('reports an invalid native manifest through the published diagnostic shape', async () => {
    expect(await validateLegacyPack('mod', [{ path: 'mod.json', bytes: bytes('not JSON') }], context)).toMatchObject({
      ok: false, report: { status: 'fail', diagnostics: expect.arrayContaining([expect.objectContaining({
        source: 'pack', code: 'pack.LEGACY_INVALID', file: 'mod.json',
      })]) },
    });
  });
});
