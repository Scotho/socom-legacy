import { describe, expect, it } from 'vitest';
import type { UiModelGeometry } from '@s2u/ui';
import { ARMORY_WHITE, MENUFADER, MODEL_CAMERA_READING, WHITE_TEXEL, type ArmoryQuad, type ShownModel } from '../src/armoryLayout';
import { ARMORY_MODEL_TEXTURE, armoryDrawList, armoryTextures } from '../src/armoryRaster';
import { modelFramePoint } from '../src/armoryView';
import { rasterizeUiDrawList } from '../src/uiCompositorView';

/**
 * The shared ARMORY's software presenter (`./armoryRaster`): the screen `Armory` steps -- its quads and its shown
 * models -- as the front end's draw list, so the game lobby's ARMORY draws what the test room's draws (`./armoryView`
 * is the WebGL presenter of the same quads and models), through the menus' own rasteriser.
 */

const quad = (object: string, texture: string, o: Partial<ArmoryQuad> = {}): ArmoryQuad => ({
  object, texture, x: 10, y: 20, w: 30, h: 40, u0: 1, v0: 2, u1: 31, v1: 42, rgb: [128, 64, 32], alpha: 96, ...o,
});
const SIZES = { 'backsolid.tif': { width: 64, height: 128 }, [ARMORY_WHITE]: { width: 2, height: 2 } };
// One triangle of each part, a unit square's corner at the model's origin, each part its own texture.
const tri = (texture: string | null) => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array([0, 0, 1, 0, 0, 1]), colors: new Float32Array(12).fill(1),
  indices: new Uint16Array([0, 1, 2]), texture, cull: false,
});
const GEOMETRY: UiModelGeometry = { name: 'sig_commandoUI', parts: [{ node: 'commando_high', meshes: [tri('sig_commando')] }, { node: 'silencer', meshes: [tri('sig_silencer')] }] };
const ENTRY = { name: 'Equipsig_commando', model: 'sig_commandoUI', azimuth: 10.5, elev: 2.75, distance: 27 };
const shown = (hidden: string[] = []): ShownModel => ({ entry: ENTRY, rotation: [0, 0, 0, 1], hidden });

describe('armoryDrawList: the shared ARMORY on the menus\' rasteriser', () => {
  it('each quad is a sprite of its bitmap: the corners, the texels over the bitmap\'s size, the GS colour and alpha', () => {
    const items = armoryDrawList([quad('eq_title_back', 'backsolid.tif')], [], SIZES, () => null);
    expect(items).toEqual([{
      kind: 'sprite', node: 'eq_title_back', texture: 'backsolid.tif', x0: 10, y0: 20, x1: 40, y1: 60,
      u0: 1 / 64, v0: 2 / 128, u1: 31 / 64, v1: 42 / 128, rgba: [128, 64, 32, 96], clip: null,
    }]);
    // A bitmap the screen has no size for is not drawn (as the WebGL pass skips a run with no map).
    expect(armoryDrawList([quad('x', 'missing.tif')], [], SIZES, () => null)).toEqual([]);
  });

  it('the models go after the dialog\'s objects and under the fader and the popup (UI_MODEL_DRAW_ORDER_READING)', () => {
    const items = armoryDrawList([quad('a', 'backsolid.tif'), quad(MENUFADER, ARMORY_WHITE), quad('POPUP', 'backsolid.tif')], [shown()], SIZES, () => GEOMETRY);
    expect(items.map((i) => (i.kind === 'sprite' ? i.node : i.kind))).toEqual(['a', 'models', MENUFADER, 'POPUP']);
  });

  it('a model stands at its entry\'s place at the UI camera\'s focal (MODEL_CAMERA_READING), its textures named apart', () => {
    const items = armoryDrawList([], [shown()], SIZES, () => GEOMETRY);
    const models = items.find((i) => i.kind === 'models');
    if (models?.kind !== 'models' || !models.triangles) throw new Error('no models pass');
    const [x, y] = modelFramePoint(ENTRY);
    expect(models.triangles[0]!.a.x).toBeCloseTo(x, 6);
    expect(models.triangles[0]!.a.y).toBeCloseTo(y, 6);
    expect(models.triangles[0]!.b.x - models.triangles[0]!.a.x).toBeCloseTo(MODEL_CAMERA_READING.focal / ENTRY.distance, 6);
    expect(models.triangles.map((t) => [t.node, t.texture])).toEqual([
      ['commando_high', `${ARMORY_MODEL_TEXTURE}sig_commando`], ['silencer', `${ARMORY_MODEL_TEXTURE}sig_silencer`],
    ]);
  });

  it('a part the scripts switched off draws nothing (ARMORY_MODEL_PART_REF: the 552\'s silencer); a model not held, nothing', () => {
    const items = armoryDrawList([], [shown(['silencer'])], SIZES, () => GEOMETRY);
    const models = items.find((i) => i.kind === 'models');
    expect(models?.kind === 'models' ? models.triangles?.map((t) => t.node) : null).toEqual(['commando_high']);
    expect(armoryDrawList([], [shown()], SIZES, () => null)).toEqual([]);
  });

  it('the textures: the screen\'s bitmaps by name, the white texel, a model\'s through the UI models\' library', () => {
    const backsolid = { width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) };
    const gun = { width: 1, height: 1, data: new Uint8ClampedArray([200, 0, 0, 255]) };
    const textures = armoryTextures(new Map([['backsolid.tif', backsolid]]), (n) => (n === 'sig_commando' ? gun : null));
    expect(textures('backsolid.tif')).toBe(backsolid);
    expect(textures('BACKSOLID.TIF')).toBe(backsolid);
    expect(textures(ARMORY_WHITE)).toBe(WHITE_TEXEL);
    expect(textures(`${ARMORY_MODEL_TEXTURE}sig_commando`)).toBe(gun);
    expect(textures('sig_commando')).toBe(null);                                 // a model's texture is not a 2D bitmap
    // End to end: a white quad modulated by its colour lands on the frame.
    const { frame } = rasterizeUiDrawList(armoryDrawList([quad('w', ARMORY_WHITE, { x: 0, y: 0, w: 2, h: 2, u0: 0, v0: 0, u1: 2, v1: 2, rgb: [128, 0, 0], alpha: 128 })], [], SIZES, () => null), textures);
    expect([...frame.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });
});
