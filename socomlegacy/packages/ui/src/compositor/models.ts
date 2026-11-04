import type { DialogModel } from '../dialog';
import type { ZAnimNode } from '../zanimRuntime';
import { UI_FRAME } from './frame';

/**
 * A dialog's `MODELS` entries as the menu state draws them (MENU-02a; web research 140 §2): the 3D pass between the
 * backplane and the foreplane (CMenuState's Tick 0x1f4640 step 8, research 115 §7 -- "the 3D scene when a model is
 * set"). The main menu's roller is one: `mainmenu_roller`, a hexagonal drum of twelve textured quads (`new_on`,
 * `new_off`, `load_on` ... one lit and one dim per item), turned by `ActivateMenuBtns` in steps of 60 degrees about x,
 * its item quads shown, hidden and scaled by the same scripts. The geometry is the page's to hand in (`RUN/UI/UI_GEO.ZED`
 * + `UI_MDL.ZED` through `@s2u/scene`'s `weaponLibrary` in the `'bias'` form, research 95 §5.3): this package keeps
 * no reader of it, as it keeps none of the bitmaps.
 *
 * **Placement** (`FUN_00366730` D:L262800-262856, called by the build at D:L263661 after the controls and the
 * objects): for each entry the model named by `MODEL` (or by the `UIVAR`'s string when `USEMODELUIVAR`) is made
 * (`FUN_00317c20(name, &pos, 0)`) at `(AZIMUTH + 320.0, ELEV, 320.0 - DISTANCE)` (D:L262819-262821; the call D:L262842), named by the
 * entry's `NAME` (`FUN_00314ee0`, D:L262845-262849), shown (`FUN_00312f20(node, 1)`), given the entry's rotation field
 * (`FUN_00315760`) and added to the host's list at G+0x8ec. The menu state's camera node sits at `(320.0, 0, 320.0)`
 * (MS's Init, D:L54812: `FUN_003157d0(320.0, 0, 320.0, camera)`), so the model is at `(AZIMUTH, ELEV, -DISTANCE)`
 * before it -- research 95's `MODEL_CAMERA_READING`, now read.
 *
 * **The nodes** a script reaches by name (`FUN_00315d00`'s search, research 112 §2): the entry's node (`Roller`) and
 * the model's own nodes under it (`new_on` ...), each with the fields `OBJECT_ACTIVE_STATE`, `OBJECT_OPACITY_FROM_TO`
 * and `OBJECT_MOTION_FROM_TO` write (research 106 §4). The decoded parts' vertices are in model space and every node
 * of `mainmenu_roller` has the identity matrix (its origin at the model's: `UI_GEO`'s `nparams`, read through
 * `flattenScene`), so a part's scale is about the model's origin, as the original's node matrix makes it.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** A part's mesh as `@s2u/scene`'s `WeaponMesh` holds it (positions xyz, uvs, rgba per vertex with 1.0 = 128, triangles). */
export interface UiModelMesh {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** The texture's name in the model's library (`UI_TXR`), or null. */
  texture: string | null;
  /** The visual's cull flag: back faces dropped when set. */
  cull: boolean;
}

/** A node of the model that carries visuals (`WeaponPart`): its name and its meshes. */
export interface UiModelPart { node: string; meshes: UiModelMesh[] }

/** A decoded model the page hands in by name. */
export interface UiModelGeometry { name: string; parts: UiModelPart[] }

/** A node of the 3D pass, as the scripts see it (`ZAnimNode`) and as the draw reads it. */
export interface UiModelNode extends ZAnimNode { name: string }

/** One `MODELS` entry realised: its node (the entry's `NAME`) and the model's part nodes under it. */
export interface UiModelInstance {
  entry: DialogModel;
  geometry: UiModelGeometry;
  /** The entry's node: at `(AZIMUTH + 320, ELEV, 320 - DISTANCE)` in the world, as D:L262819-262821 places it. */
  root: UiModelNode;
  /** The model's part nodes by name (the name as the file spells it; the lookup is the tree's, case-insensitive). */
  parts: UiModelNode[];
}

/**
 * The menu state's camera node (D:L54812): at `(320, 0, 320)` in the world. Its orientation is the node's default --
 * the UI models stand before it along -z with y up (research 95's `MODEL_CAMERA_READING`, `SPIN_SCREEN_SENSE_READING`,
 * confirmed by the roller: `ActivateMenuBtns` turns it +60 degrees about x for LOAD GAME, which sits at +y in the
 * file, and that brings +y to +z, toward the camera).
 */
export const UI_MODEL_CAMERA = { x: 320, y: 0, z: 320 } as const;

/**
 * UI_MODEL_FOCAL_READING: the pixels one unit covers at unit depth before the menu's camera, the same across and down
 * (square pixels). The camera record of `RUN/UI/UI.ZED` (`cameras/camera`, 144 bytes) carries the half field of view
 * 0.7854 at +32 and 0.54978 at +36 (reCOM's `tag_CAMERA_PARAMS` `m_hfov`, `m_vfov`; the engine rewrites the vertical as
 * the horizontal x 448 / 640, `FUN_002911b0` D:L137370-137372, and keeps its tangent at +0x1d4), which as half angles
 * would give 320 px/unit across and 365 down -- not what the console draws: PCSX2's main menu (`logs/parity/s4_pcsx2/
 * A_04.png`, `scripts/parity/ref_main_menu_ours.pcsx2.png`) puts the lit NEW GAME quad's centre 97 rows under the
 * frame's middle and LOAD GAME's 58 (the roller's centres at depth 54.7 and 58.1, 11.5 and 7.5 units under the camera's
 * row), both 455 +- 5 px/unit, and the word's glyphs 150 px wide, 455 again. The projection matrix's build
 * (`FUN_00294070` D:L138868-139100: the viewport scales at +0x470 / +0x474, +0x290 and +0x4b0 into the matrix at
 * +0x370) was not read to the number, so the value is chosen from the measurement: what settles it is that read, or a
 * burst of the original's roller at two depths. [reading]
 */
export const UI_MODEL_FOCAL_READING = 455;

/**
 * UI_MODEL_TEXTURE_ROWS_READING: a model's texture is addressed as stored -- v 0 the first stored row -- unlike the 2D
 * quads, whose T wraps onto the stored bottom-first bitmap to stand it upright (`UV_REPEAT_READING`). The roller's
 * quads carry v 1 at their top edge and the lit `menu_*_on.tif` bitmaps hold their letters bottom row first, so the
 * stored order is the upright one for them; the ARMORY's previews draw the same bitmaps the same way (research 95
 * §5.2, `armoryView.ts`, unflipped). `CLAMP_1` / the GS's row order for the model packets was not read. [reading]
 */
export const UI_MODEL_TEXTURE_ROWS_READING = 'as stored, v 0 the first row' as const;

/**
 * UI_MODEL_ZWRITE_READING: a texel whose alpha comes out 0 writes neither colour nor depth, so a quad's clear texels
 * occlude nothing behind them -- what the GS does with the alpha test on (TEST.ATE, ATST GREATER 0, AFAIL KEEP), which
 * the UI models' packets were not read for. The roller's six faces never overlap in depth, so the main menu's frame is
 * the same either way; a dialog whose MODELS parts do overlap is where it tells.
 */
export const UI_MODEL_ZWRITE_READING = 'alpha 0: no colour, no depth' as const;

export type ModelVec3 = [number, number, number];
export type ModelQuat = [number, number, number, number];

/** `v` turned by the unit quaternion `q` (x, y, z, w). */
export function rotate(q: ModelQuat, v: ModelVec3): ModelVec3 {
  const [qx, qy, qz, qw] = q;
  // t = 2 q x v; v' = v + w t + q x t
  const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

const node = (name: string, position: ModelVec3): UiModelNode => ({ name, position, rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1, active: true });

/**
 * `FUN_00366730`'s one entry: the node at its world place, the model's part nodes under it. Null with no name or no
 * geometry. With `USEMODELUIVAR` the MODEL field names a UI variable and the model is that variable's string
 * (D:L262822-262841: `FUN_00385900` finds it; a string one -- type 3 -- gives its text; found but not a string, the
 * name is null (D:L262835-262839); not found, the name stays its default, the empty string at 0x3f8c90, and
 * `FUN_00317c20` is still called with it -- taken to load nothing), so `uiVarString` is asked; absent, or the
 * variable not a string, none is made.
 */
export function makeModelInstance(entry: DialogModel, model: (name: string) => UiModelGeometry | null, uiVarString?: (name: string) => string | null): UiModelInstance | null {
  if (entry.name === null || entry.model === null) return null;
  const name = entry.useModelUiVar ? uiVarString?.(entry.model) ?? null : entry.model;
  if (name === null) return null;
  const geometry = model(name);
  if (!geometry) return null;
  return {
    entry, geometry,
    root: node(entry.name, [entry.azimuth + UI_MODEL_CAMERA.x, entry.elev, UI_MODEL_CAMERA.z - entry.distance]),
    parts: geometry.parts.map((p) => node(p.node, [0, 0, 0])),
  };
}

/** The instance's nodes in the search's order: the entry's, then the parts'. */
export function modelNodes(m: UiModelInstance): UiModelNode[] {
  return [m.root, ...m.parts];
}

/** One vertex of a projected triangle: frame pixels, 1/depth for the perspective-correct texel, the texel and the colour (0..255, alpha 0..128). */
export interface UiModelVertex { x: number; y: number; invW: number; u: number; v: number; rgba: [number, number, number, number] }

/** A triangle of the 3D pass, projected onto the 640 x 448 frame; `texture` null draws its colour. */
export interface UiModelTriangle { node: string; texture: string | null; cull: boolean; a: UiModelVertex; b: UiModelVertex; c: UiModelVertex }

/**
 * The shown instances projected: every active part of an active entry node, each vertex taken through the part's scale
 * and rotation, the entry's scale, rotation and place, into the camera's frame and onto the screen (a point behind the
 * camera, or at it, drops its triangle). The colour is the vertex's times the part's and the entry's opacity.
 */
export function projectModels(models: readonly UiModelInstance[], focal = UI_MODEL_FOCAL_READING): UiModelTriangle[] {
  const out: UiModelTriangle[] = [];
  const cx = UI_FRAME.width / 2, cy = UI_FRAME.height / 2;
  for (const m of models) {
    if (!m.root.active) continue;
    for (let i = 0; i < m.geometry.parts.length; i++) {
      const part = m.geometry.parts[i]!, pn = m.parts[i]!;
      if (!pn.active) continue;
      const alpha = Math.max(0, Math.min(1, pn.opacity * m.root.opacity));
      for (const mesh of part.meshes) {
        const n = mesh.positions.length / 3;
        const verts: (UiModelVertex | null)[] = new Array(n);
        for (let k = 0; k < n; k++) {
          let p: ModelVec3 = [mesh.positions[k * 3]! * pn.scale[0], mesh.positions[k * 3 + 1]! * pn.scale[1], mesh.positions[k * 3 + 2]! * pn.scale[2]];
          p = rotate(pn.rotation, p);
          p = [p[0] + pn.position[0], p[1] + pn.position[1], p[2] + pn.position[2]];
          p = [p[0] * m.root.scale[0], p[1] * m.root.scale[1], p[2] * m.root.scale[2]];
          p = rotate(m.root.rotation, p);
          const vx = p[0] + m.root.position[0] - UI_MODEL_CAMERA.x, vy = p[1] + m.root.position[1] - UI_MODEL_CAMERA.y, vz = p[2] + m.root.position[2] - UI_MODEL_CAMERA.z;
          const depth = -vz;
          if (depth <= 0) { verts[k] = null; continue; }
          const invW = 1 / depth;
          const r = mesh.colors[k * 4] ?? 1, g = mesh.colors[k * 4 + 1] ?? 1, b = mesh.colors[k * 4 + 2] ?? 1, a = mesh.colors[k * 4 + 3] ?? 1;
          verts[k] = {
            x: cx + focal * vx * invW, y: cy - focal * vy * invW, invW,
            u: mesh.uvs[k * 2] ?? 0, v: mesh.uvs[k * 2 + 1] ?? 0,
            rgba: [r * 128, g * 128, b * 128, a * 128 * alpha],
          };
        }
        for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
          const a = verts[mesh.indices[t]!], b = verts[mesh.indices[t + 1]!], c = verts[mesh.indices[t + 2]!];
          if (!a || !b || !c) continue;
          out.push({ node: pn.name, texture: mesh.texture, cull: mesh.cull, a, b, c });
        }
      }
    }
  }
  return out;
}
