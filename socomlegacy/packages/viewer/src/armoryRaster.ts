import type { Rgba } from '@s2u/gs';
import { projectModels, type UiDrawItem, type UiModelGeometry, type UiModelInstance, type UiModelNode } from '@s2u/ui';
import { ARMORY_WHITE, MODEL_CAMERA_READING, modelSplit, WHITE_TEXEL, type ArmoryQuad, type ShownModel } from './armoryLayout';
import type { UiTextures } from './uiCompositorView';

/**
 * The shared ARMORY's software presenter (the owner's playtest of 2026-10-06: the game lobby's ARMORY drew no images
 * while the test room's, much closer to the original, did -- "make them a shared component that both use in the ways
 * they need"). One screen, `./armory`'s `Armory` (its state, its scripts, its quads and its shown models, over
 * `./armoryData`'s disc data), drawn by two presenters: the test room's pre-round seat through `./armoryView` on the
 * match's WebGL renderer, and the game lobby's dialog entry (`./lobbyArmory`) through this module on the front end's own
 * 640 x 448 rasteriser (`./uiCompositorView`), which keeps the front end's bundle free of three.js (OT.R12).
 *
 * The draw list is the WebGL pass's, item for item: each quad a sprite of its bitmap in the quads' order (the texels
 * over the bitmap's size, the GS colour and alpha), and the shown models between the dialog's objects and the fader
 * (`UI_MODEL_DRAW_ORDER_READING`, `modelSplit`) -- each at its entry's place before the menu's camera, turned by the
 * scripts' spin, projected at the UI camera's focal (`MODEL_CAMERA_READING`, 457.0074 px per unit; research 182 §2.29,
 * §2.35) and drawn without the parts the scripts switched off (`ARMORY_MODEL_PART_REF`). The rasteriser draws them as it
 * draws the menus' own models: the texel times the vertex colour (`UI_MODEL_LIT_READING`), blended by the texture's
 * bind packet (`GS_MODULATE_BLEND_READING`), a clear texel writing nothing (`UI_MODEL_ZWRITE_READING`).
 */

/** The prefix a model's texture is named by in the draw list, so the screen's 2D bitmaps and `UI_TXR`'s never collide. */
export const ARMORY_MODEL_TEXTURE = 'ui-model:' as const;

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];
const node = (name: string, position: [number, number, number], rotation = IDENTITY, active = true): UiModelNode =>
  ({ name, position, rotation: [...rotation] as [number, number, number, number], scale: [1, 1, 1], opacity: 1, active });

/**
 * The shown models as the menus' model instances (`@s2u/ui`'s `makeModelInstance` shape): the entry's node at
 * `(AZIMUTH + 320, ELEV, 320 - DISTANCE)` (`FUN_00366730` D:L262819-262821) turned by the spin, its parts under it, a
 * part the scripts switched off inactive. A model `model` does not hold is left out.
 */
function instances(shown: readonly ShownModel[], model: (name: string) => UiModelGeometry | null): UiModelInstance[] {
  const out: UiModelInstance[] = [];
  for (const s of shown) {
    const geometry = model(s.entry.model);
    if (!geometry) continue;
    const e = s.entry;
    out.push({
      entry: { name: e.name, model: e.model, azimuth: e.azimuth, elev: e.elev, distance: e.distance, rot: 0, useModelUiVar: false },
      geometry,
      root: node(e.name, [e.azimuth + 320, e.elev, 320 - e.distance], s.rotation),
      parts: geometry.parts.map((p) => node(p.node, [0, 0, 0], IDENTITY, !(s.hidden ?? []).includes(p.node))),
    });
  }
  return out;
}

/**
 * The screen's frame as the front end's draw list: `quads` (`Armory.quads`, drawn with `sizes`, the bitmaps' sizes),
 * `shown` (`Armory.models`) and their geometry by model name. A quad whose bitmap has no size is left out.
 */
export function armoryDrawList(
  quads: readonly ArmoryQuad[], shown: readonly ShownModel[], sizes: Readonly<Record<string, { width: number; height: number }>>,
  model: (name: string) => UiModelGeometry | null,
): UiDrawItem[] {
  const out: UiDrawItem[] = [];
  const split = modelSplit(quads);
  const pass = (): void => {
    const triangles = projectModels(instances(shown, model), MODEL_CAMERA_READING.focal)
      .map((t) => ({ ...t, texture: t.texture === null ? null : `${ARMORY_MODEL_TEXTURE}${t.texture}` }));
    if (triangles.length) out.push({ kind: 'models', triangles });
  };
  quads.forEach((q, i) => {
    if (i === split) pass();
    const size = sizes[q.texture];
    if (!size) return;
    out.push({
      kind: 'sprite', node: q.object, texture: q.texture, x0: q.x, y0: q.y, x1: q.x + q.w, y1: q.y + q.h,
      u0: q.u0 / size.width, v0: q.v0 / size.height, u1: q.u1 / size.width, v1: q.v1 / size.height,
      rgba: [q.rgb[0], q.rgb[1], q.rgb[2], q.alpha], clip: null,
    });
  });
  if (split >= quads.length) pass();
  return out;
}

/**
 * The bitmaps the draw list names: the screen's own (`ArmoryData.bitmaps`, top row first, by lower-case name), the
 * white texel (`ARMORY_WHITE`), and a model's texture (`ARMORY_MODEL_TEXTURE` + its name) through `modelTextures` --
 * the UI models' library as the menus read it (`./menuArt`, top row first, with its bind packet's blend).
 */
export function armoryTextures(bitmaps: ReadonlyMap<string, Rgba>, modelTextures: UiTextures): UiTextures {
  return (name) => {
    if (name.startsWith(ARMORY_MODEL_TEXTURE)) return modelTextures(name.slice(ARMORY_MODEL_TEXTURE.length));
    if (name === ARMORY_WHITE) return WHITE_TEXEL;
    return bitmaps.get(name.toLowerCase()) ?? null;
  };
}
