import { Zar, type AssetSource } from '@s2u/archive';
import { PaletteTable, parseTextureRecord, type Rgba } from '@s2u/gs';
import { UI_MODEL_FILES, UI_MODEL_FORM_READING, loadLocService, weaponLibrary, type WeaponLibrary } from '@s2u/scene';
import type { DialogDesign, UiModelGeometry } from '@s2u/ui';
import { flipRows } from './hudAssets';
import { decodeNamedTextures } from './hudBitmaps';
import type { FrontEndDisc } from './frontEnd';
import type { UiBitmap, UiBlend, UiTextures } from './uiCompositorView';

/**
 * The front end's art off the disc (MENU-02a; web research 140 §4): what `@s2u/ui`'s textures placeholder (research 115
 * §15) stood for -- the bitmaps a dialog draws, the font's atlas, the `MODELS` entries' geometry and textures, and the menus'
 * strings -- read from the served tree beside the dialogs, so the page draws the main menu as the console does.
 *
 * - **A dialog's `LIBRARIES`** (`ui/assetlib/ui2d`, `ui/assetlib/uibf` on `dlgMenu`) resolve as the engine resolves an
 *   asset library's file (`FUN_003199c0`, research 95 §5.1; `@s2u/scene`'s `assetLibStem`): the path's last segment,
 *   cut to four characters and upper-cased, names `RUN/UI/<STEM>_TXR.ZED` and its `_PAL.ZED` -- UI2D, UIBF -- and the
 *   font library every dialog without `NOFONTLIB` loads is `common/assetlib/font` (research 105 §1), `RUN/COMMON/
 *   FONT_TXR.ZED` (`font_text_01.tif`, the faces' atlas). Each library's textures cite its own palette table (research
 *   72's caveat; `hudBitmaps.ts`). A bitmap is taken from the first library that holds it, in the layout's order, as the
 *   ARMORY's are (`armoryData.ts`); the 2D ones are flipped top row first for the drawer (`hudAssets.ts` `flipRows`).
 * - **The models** are `RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED` through `weaponLibrary` in the `'bias'` form
 *   (`UI_MODEL_FORM_READING`, research 95 §5.3), their textures out of `RUN/UI/UI_TXR.ZED` / `UI_PAL.ZED`, which the
 *   drawer addresses as stored (`@s2u/ui`'s models module, its stored-rows reading: handed over flipped like the rest, flipped back by v).
 * - **The strings** are PLAT-04's `LocService` over the loose tables (`UIMn` among them: `_507_DevelopedZipper_MSG`,
 *   `_508_Copyright_MSG` under the logo); `UILd` lives in a map archive and is not read here.
 *
 * Never throws: what will not read is named in `missing`, and the front end draws what it has.
 */

/**
 * A texture library: its `texdat` by lower-case name and its own palettes (`armoryData.ts`'s shape); `blend` the
 * `ALPHA_1` the texture's own bind packet sets (`@s2u/gs`'s `GsState`: 0x44 `source`, 0x48 `additive`), which the
 * drawer draws it with and leaves for the next untextured quad (web research 141 §2). A bind of another equation
 * (none in the UI's libraries) is named in the diagnostics and drawn as `source`.
 */
interface TextureLibrary { name: string; has(name: string): boolean; decode(name: string): { rgba: Rgba | null; blend: UiBlend; diagnostics: string[] } }

function library(name: string, txr: Uint8Array, pal: Uint8Array): TextureLibrary {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars([Zar.parse(pal)]);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  return {
    name, has: (n) => keys.has(n.toLowerCase()),
    decode: (n) => {
      const got = decodeNamedTextures(texdat, palettes, [n]);
      const bytes = texdat(n);
      let bind: string | null = null;
      try { bind = bytes ? parseTextureRecord(n, bytes).gs?.blend ?? null : null; } catch { /* the decode above names it */ }
      const diagnostics = bind === null || bind === 'source' || bind === 'additive' ? got.diagnostics : [...got.diagnostics, `${n}: bind blend ${bind}, drawn as source`];
      return { rgba: got.textures[n] ?? null, blend: bind === 'additive' ? 'additive' : 'source', diagnostics };
    },
  };
}

/** `FUN_003199c0`'s file for an asset library path: the last segment, four characters, upper-cased (`OM02`, `UI2D`). */
export function libraryStem(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()!.slice(0, 4).toUpperCase();
}

/** The font library's files (`common/assetlib/font`: `RUN/COMMON/FONT_TXR.ZED`). */
export const FONT_LIBRARY = { txr: 'RUN/COMMON/FONT_TXR.ZED', pal: 'RUN/COMMON/FONT_PAL.ZED' } as const;
/** The UI models' texture library (research 95 §5.2). */
export const UI_MODEL_TEXTURES = { txr: 'RUN/UI/UI_TXR.ZED', pal: 'RUN/UI/UI_PAL.ZED' } as const;

/** The art: the bitmaps by name (top row first), the models by name, what would not read. */
export interface MenuArt {
  textures: UiTextures;
  model: (name: string) => UiModelGeometry | null;
  missing: string[];
  /** The libraries read, by stem, for a report. */
  libraries: string[];
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Reads the libraries `dialogs` name (each stem once), the font library, the UI models and their library. A library
 * that will not read is named and left out; a bitmap no library holds is null (the drawer names it undrawn).
 */
export async function readMenuArt(source: AssetSource, dialogs: readonly DialogDesign[]): Promise<MenuArt> {
  const missing: string[] = [];
  const libs: TextureLibrary[] = [];
  const read = async (path: string): Promise<Uint8Array | null> => {
    try { return await source.read(path); } catch (e) { missing.push(`${path}: ${why(e)}`); return null; }
  };
  const add = async (name: string, txr: string, pal: string): Promise<void> => {
    const t = await read(txr), p = await read(pal);
    if (!t || !p) return;
    try { libs.push(library(name, t, p)); } catch (e) { missing.push(`${txr}: ${why(e)}`); }
  };
  const stems = new Set<string>();
  for (const d of dialogs) for (const l of d.libraries) if ('name' in l) stems.add(libraryStem(l.name));
  for (const stem of stems) await add(stem, `RUN/UI/${stem}_TXR.ZED`, `RUN/UI/${stem}_PAL.ZED`);
  if (dialogs.some((d) => d.fontLib)) await add('FONT', FONT_LIBRARY.txr, FONT_LIBRARY.pal);
  let models: WeaponLibrary | null = null;
  const geo = await read(UI_MODEL_FILES.geo), mdl = await read(UI_MODEL_FILES.mdl);
  if (geo && mdl) {
    try { models = weaponLibrary(Zar.parse(geo), Zar.parse(mdl), UI_MODEL_FORM_READING); } catch (e) { missing.push(`${UI_MODEL_FILES.geo}: ${why(e)}`); }
    await add('UI', UI_MODEL_TEXTURES.txr, UI_MODEL_TEXTURES.pal);
  }
  const bitmaps = new Map<string, UiBitmap | null>();
  const textures: UiTextures = (name) => {
    const key = name.toLowerCase();
    if (!bitmaps.has(key)) {
      const lib = libs.find((l) => l.has(name));
      const got = lib ? lib.decode(name) : null;
      if (got) for (const d of got.diagnostics) missing.push(`${lib!.name}: ${d}`);
      bitmaps.set(key, got?.rgba ? { ...flipRows(got.rgba), blend: got.blend } : null);
    }
    return bitmaps.get(key)!;
  };
  const decoded = new Map<string, UiModelGeometry | null>();
  const model = (name: string): UiModelGeometry | null => {
    const key = name.toLowerCase();
    if (!decoded.has(key)) {
      let g: UiModelGeometry | null = null;
      if (models && models.names().some((n) => n.toLowerCase() === key)) {
        try {
          const d = models.decode(models.names().find((n) => n.toLowerCase() === key)!, 'high');
          for (const line of d.diagnostics) missing.push(`UI model ${name}: ${line}`);
          g = { name: d.name, parts: d.parts.map((p) => ({ node: p.node, meshes: p.meshes.map((m) => ({ positions: m.positions, uvs: m.uvs, colors: m.colors, indices: m.indices, texture: m.textureName, cull: m.cull })) })) };
        } catch (e) { missing.push(`UI model ${name}: ${why(e)}`); }
      }
      decoded.set(key, g);
    }
    return decoded.get(key)!;
  };
  return { textures, model, missing, libraries: libs.map((l) => l.name) };
}

/**
 * The disc with the art the main menu draws (`dialogs`: the names whose libraries are read; `dlgMenu.rdr` by default)
 * and the menus' strings: `art` is what `FrontEndSession` builds and draws with (`disc.art.model` through
 * `BuildOptions.model`, `disc.art.textures` to the drawer), `captions` the `LocService`. Never throws; the page's
 * `mountFrontEnd` calls it on the disc `readFrontEndDisc` read.
 */
export async function withMenuArt(source: AssetSource, disc: FrontEndDisc, dialogs: readonly string[] = ['dlgMenu.rdr']): Promise<FrontEndDisc> {
  const designs = dialogs.map((n) => disc.dialog(n)).filter((d): d is DialogDesign => d !== null);
  const art = await readMenuArt(source, designs);
  let captions = disc.captions;
  try {
    const loc = await loadLocService(source);
    captions = loc.service;
    for (const m of loc.missing) if (!/UILd/.test(m)) disc.missing.push(m);
  } catch (e) { disc.missing.push(`UIMnLOC: ${why(e)}`); }
  disc.missing.push(...art.missing);
  return { ...disc, captions, art };
}
