// @vitest-environment node
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb } from '@s2u/archive';
import { assetLibs, libraryTexture, textureCatalog, textureLibrary } from '../src/mapTextures';

/**
 * A map's texture catalog off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped without it, and a
 * skip is no pass). A probe over the US disc's 34 archives (2026-11-16) found the guns' library 51 textures on every
 * one, and MP61's own (`//mp/mp61/...`) its flib, clib, junkyard, bcar and its own library.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : '';
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';

describe.skipIf(DISC === '')('texture catalog on the dev disc (skipped without SOCOM_DISC)', () => {
  it('MP61: the guns\' 51, the common libraries shared, the rest its own; a texture decodes', async () => {
    const bytes = await new FsAssetSource(DISC).read('RUN/MP61.ZDB');
    const toc = parseZdb(bytes);
    const notes = { add() {} };
    const libs = assetLibs(bytes, toc, 'MP61', notes);
    const lib = textureLibrary(bytes, toc, 'MP61', notes, libs.map((l) => l.stem))!;
    const cat = textureCatalog(lib, libs);
    expect(cat.filter((t) => t.scope === 'weapons')).toHaveLength(51);
    expect(new Set(cat.filter((t) => t.scope === 'weapons').map((t) => t.library))).toEqual(new Set(['WEAP']));
    expect(new Set(cat.filter((t) => t.scope === 'own').map((t) => t.library))).toEqual(new Set(['FLIB', 'CLIB', 'JUNK', 'BCAR', 'MP61']));
    expect(cat.some((t) => t.scope === 'shared' && t.library === 'TURR')).toBe(true);
    const own = cat.find((t) => t.library === 'MP61')!;
    const got = libraryTexture(lib, own.name);
    expect(got?.library).toBe('MP61');
    expect(got!.rgba.width).toBeGreaterThan(0);
  }, 120_000);
});
