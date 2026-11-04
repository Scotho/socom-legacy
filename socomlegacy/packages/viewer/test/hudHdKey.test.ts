import { describe, expect, it } from 'vitest';
import { hdTextures } from '../src/hdTexturePack';
import { Hud } from '../src/hud';
import { ArmoryView } from '../src/armoryView';
import { Reticle } from '../src/reticle';
import { flipRows } from '../src/hudAssets';

/**
 * OT.R92 (HD.R8): the HUD's bitmaps arrive from the map worker already turned top row first (`flipRows`, `readHud`), so the
 * HUD registers each with the HD pack keyed by its bytes turned back -- the disc's decode, the pack's key.
 */
describe('the HUD keys its bitmaps for the HD pack by the disc decode', () => {
  it('registers a worker-flipped bitmap with its rows turned back', () => {
    hdTextures.collect();
    const decode = { width: 2, height: 2, data: new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]) };
    const hud = new Hud();
    hud.setBitmaps({ 'newweapnbkrnd.tif': structuredClone(flipRows(decode)) });
    const keyed = hdTextures.textures().map((t) => hdTextures.source(t)!).filter((r) => r.width === 2 && r.height === 2);
    expect(keyed.map((r) => Array.from(r.data))).toContainEqual(Array.from(decode.data));
  });
  const decode = { width: 2, height: 2, data: new Uint8ClampedArray([5, 5, 5, 255, 6, 6, 6, 255, 7, 7, 7, 255, 8, 8, 8, 255]) };
  const keyedDecode = (): boolean =>
    hdTextures.textures().map((t) => hdTextures.source(t)!).some((r) => r.width === 2 && r.height === 2 && Array.from(r.data).join() === Array.from(decode.data).join());
  it('the ARMORY registers its flipped bitmaps turned back', () => {
    hdTextures.collect();
    new ArmoryView().setBitmaps([['b', structuredClone(flipRows(decode))]]);
    expect(keyedDecode()).toBe(true);
  });
  it("the reticle registers the HUD's flipped font atlas turned back (the target's name)", () => {
    hdTextures.collect();
    const px = (n: number) => ({ width: n, height: n, data: new Uint8ClampedArray(n * n * 4).fill(255) });
    new Reticle().setBitmaps({ fixed: px(4), floating: px(4), accuracy: null }, structuredClone(flipRows(decode)));
    expect(keyedDecode()).toBe(true);
  });
});
