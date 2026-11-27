import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeTexture, PaletteTable, parseTextureRecord, type GsState } from '@s2u/gs';
import { effectMaterial } from '../src/effectMaterials';
import type { EffectTexture } from '../src/effectData';

/**
 * MP64-CREATURES (the owner's playtest 2026-11-22 on Shadow Falls: "the bugs and clutter that fly around -- the birds, the
 * butterflies, the insects, some look like they unintentionally have a background. some yellow, some white, some black";
 * simulation track: what the effects draw). A particle's texture whose bind packet sets the GS alpha test (`TEST.ATE`,
 * `AREF / 128`; `@s2u/gs` `GsState.alphaTest`) is a cutout: the texels under the reference are not drawn. `materialSpec`
 * reads it into `spec.alphaTest` (the world applies it, `world.ts`), but `effectMaterial` never put it on the material, so
 * a cutout particle drew as an opaque quad -- its transparent texels' colours (a dragonfly's (76,76,73), a leaf's (11,23,8))
 * as the background the owner saw. Old (v0.4.29 has it too); shown now by MP64, new this release, whose ambient creatures
 * (`bugs_flying`'s dragonflies, at the camera) are cutouts. The served check (Shadow PC 4, row 147) found MP5 draws no cutout
 * particle (its leaves are the WORLD's textures, already alpha-tested by the world path), so MP5 is not this bug's case.
 */
const gs = (over: Partial<GsState>): GsState => ({
  blend: 'none', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, lodK: 0, lodL: 0,
  wrapS: 'repeat', wrapT: 'repeat', ...over,
} as GsState);
const tex = (g: GsState | null): EffectTexture => ({ rgba: { width: 2, height: 2, data: new Uint8ClampedArray(16) }, gs: g });

describe('MP64-CREATURES: a cutout particle texture keeps the GS alpha test', () => {
  it('a texture whose bind packet sets the alpha test (AREF 64: 0.5) gives the material alphaTest 0.5, drawn opaque with depth', () => {
    const m = effectMaterial(tex(gs({ alphaTest: 0.5 })));
    expect(m.alphaTest).toBe(0.5);
    expect(m.transparent).toBe(false);
    expect(m.depthWrite).toBe(true);
  });

  it('a blended texture (no alpha test) keeps alphaTest 0, as before', () => {
    expect(effectMaterial(tex(gs({ blend: 'source' }))).alphaTest).toBe(0);
    expect(effectMaterial(tex(gs({ blend: 'additive' }))).alphaTest).toBe(0);
  });

  it('an untextured particle is unchanged (alphaTest 0)', () => {
    expect(effectMaterial(null, { vertexAlpha: true }).alphaTest).toBe(0);
  });
});

// The disc's own case, through the repository's readers: MP64's four alpha-tested effect textures -- the dragonflies and the
// butterflies the owner named (the review's F1: no other archive's effects load an alpha-tested texture).
// AGENTS 'How to work' 3 (the review's F6): the disc from SOCOM_DISC only; without it the legs skip, said in the title.
const discRun = process.env['SOCOM_DISC'] ? join(process.env['SOCOM_DISC'], 'RUN') : null;
const has = (arc: string): boolean => discRun !== null && existsSync(join(discRun, `${arc}.ZDB`));
describe('MP64-CREATURES on the disc (skipped without the disc)', () => {
  for (const [arc, names] of [['MP64', ['dragonfly01.tif', 'dragonfly02.tif', 'monarch01.tif', 'monarch02.tif']]] as const) {
    it.skipIf(!has(arc))(`${arc}: ${names.join(', ')} are cutouts (alpha test 0.5, transparent texels present) and their particle material tests them`, () => {
      const bytes = new Uint8Array(readFileSync(join(discRun!, `${arc}.ZDB`)));
      const toc = parseZdb(bytes);
      const txr = Zar.parse(zdbMember(bytes, toc, `${arc}_TXR.ZED`));
      const palettes = PaletteTable.fromZars([Zar.parse(zdbMember(bytes, toc, `${arc}_PAL.ZED`))]);
      for (const name of names) {
        const key = (txr.find('textures')?.children ?? []).find((k) => k.name.toLowerCase() === name)!;
        expect(key, name).toBeDefined();
        const record = parseTextureRecord(key.name, txr.data(txr.child(key, 'texdat')!));
        const rgba = decodeTexture(record, palettes).rgba;
        let clear = 0;
        for (let i = 3; i < rgba.data.length; i += 4) if (rgba.data[i] === 0) clear++;
        expect(record.gs?.alphaTest, name).toBe(0.5);
        expect(clear, `${name}: transparent texels`).toBeGreaterThan(0);
        expect(effectMaterial({ rgba, gs: record.gs }).alphaTest, name).toBe(0.5);
      }
    });
  }
});
