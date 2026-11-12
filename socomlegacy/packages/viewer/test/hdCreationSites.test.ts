import { describe, expect, it } from 'vitest';
import type { DataTexture } from 'three';
import { HdPackRuntime, hdTextures, type HdEntry, type HdManifest } from '../src/hdTexturePack';
import { sha256 } from '../src/texturePack';
import { makeTexture } from '../src/world';
import type { MaterialSpec } from '../src/materialSpec';
import { effectMaterial } from '../src/effectMaterials';
import { EffectLights } from '../src/effectLights';
import { Fire } from '../src/fire';
import { GrenadeThrower } from '../src/grenade';
import { ArmoryView } from '../src/armoryView';
import type { Rgba } from '@s2u/gs';

/**
 * HD-3 (plan 2026-10-31-hd-texture-pack-parity; OT.R92; product track -- the HD pack is a browser adaptation, the game's
 * look with no pack untouched): every site that makes a texture from the disc's decode reaches the pack's replacement.
 * One fake pack a site, with one entry keyed by that site's decode (the pack's key, `hdKeyOf`: the decode's sha256): the
 * replacement is drawn; a pack with no entry for it leaves the site's image as it was. The HUD's, the ARMORY bitmaps'
 * and the reticle's flipped sites are pinned in `hudHdKey.test.ts`; the menus' in `hdMenuTextures.test.ts`.
 */

let colour = 10;
/** A 2x2 decode no other site in the file shares (its key is unique). */
const decode = (): Rgba => { const c = colour++; return { width: 2, height: 2, data: new Uint8ClampedArray(Array.from({ length: 4 }, () => [c, 255 - c, c, 255]).flat()) }; };
const hdOf = (): Rgba => ({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(200) });
const keyOf = (r: Rgba): Promise<string> => sha256(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));

async function pack(src: Rgba, hd: Rgba): Promise<HdManifest> {
  const entry: HdEntry = { key: await keyOf(src), width: src.width, height: src.height, file: '0.png', format: 'png', outWidth: hd.width,
    outHeight: hd.height, bytes: hd.data.length, sha256: await keyOf(hd), tier: 'A', source: 'deadbeef-0000abcd' };
  return { format: 's2u-hd-texture-pack', version: 1, localOnly: true, game: 'SCUS-97275', name: 'HD-3 site', method: 'pcsx2 replacements',
    entries: [entry], totalBytes: hd.data.length };
}

/** The textures `act` registers whose source is `src` (the site's decode). */
function made(src: Rgba, act: () => void): DataTexture[] {
  hdTextures.collect();
  const got: DataTexture[] = [];
  const off = hdTextures.onRegister((t) => { if (hdTextures.source(t) === src) got.push(t); });
  try { act(); } finally { off(); }
  return got;
}

/** The site's texture under a pack naming its decode (replaced), and under one that does not (unchanged). */
async function pinned(src: Rgba, act: () => void): Promise<void> {
  const textures = made(src, act);
  expect(textures.length).toBeGreaterThan(0);
  const t = textures[0]!;
  const original = t.image;
  const hd = hdOf();
  const runtime = new HdPackRuntime(hdTextures, async () => hd);
  try {
    await runtime.setPack(await pack(decode(), hd));   // an entry, but for another decode
    expect(t.image).toBe(original);
    await runtime.setPack(await pack(src, hd));
    expect(t.image.width).toBe(8);
    expect(t.image.height).toBe(8);
    await runtime.setPack(null);
    expect(t.image).toBe(original);
  } finally { await runtime.setPack(null); }
}

const SPEC = { bilinear: true, mipmaps: false, wrapS: 'clamp', wrapT: 'clamp' } as unknown as MaterialSpec;

describe('HD-3: every disc texture creation site takes the pack replacement', () => {
  it("world.makeTexture (the map's textures, the bodies' through bodyView, the effects' through effectMaterials)", async () => {
    const src = decode();
    await pinned(src, () => { makeTexture(src, SPEC); });
  });
  it("effectMaterials.effectMaterial (an effect's EFFE_TXR texture)", async () => {
    const src = decode();
    await pinned(src, () => { effectMaterial({ rgba: src, gs: null }); });
  });
  it('EffectLights.setTexture (light_map.tif)', async () => {
    const src = decode();
    await pinned(src, () => { new EffectLights().setTexture({ rgba: src, gs: null }); });
  });
  it("Fire.setBitmap (the bullet mark's bitmap)", async () => {
    const src = decode();
    const fire = new Fire({ grid: () => null, aim: () => null });
    await pinned(src, () => { fire.setBitmap(src); });
  });
  it("Fire's mark material by surface (MarkTable.bitmap)", async () => {
    const src = decode();
    const fire = new Fire({ grid: () => null, aim: () => null });
    fire.setMarks({ row: () => null, bitmap: () => src });
    await pinned(src, () => { (fire as unknown as { markMaterial(texture: string): unknown }).markMaterial('bullet_mark_wood.tif'); });
  });
  it("GrenadeThrower.setMap (the throwables' bitmaps)", async () => {
    const src = decode();
    const g = new GrenadeThrower({ grid: () => null, view: () => 'third', snapshot: () => null });
    await pinned(src, () => { g.setMap(null, { models: [], bitmaps: { 'grenade_mark.tif': src } } as never); });
  });
  it("ArmoryView.setModels (the ARMORY's weapon models' textures)", async () => {
    const src = decode();
    const view = new ArmoryView();
    await pinned(src, () => { view.setModels([], [['weapon.tif', src]]); });
  });
});
