import { Zar, type AssetSource } from '@s2u/archive';
import { PaletteTable, parseTextureRecord, type Rgba } from '@s2u/gs';
import { UI_MODEL_FILES, UI_MODEL_FORM_READING, loadLocService, weaponLibrary, type WeaponLibrary } from '@s2u/scene';
import type { DialogDesign, UiModelGeometry } from '@s2u/ui';
import { flipRows } from './hudAssets';
import { decodeNamedTextures } from './hudBitmaps';
import type { FrontEndDisc } from './frontEnd';
import type { UiTexturePrefetch, UiTexturePrefetchOptions } from './frontEndAssets';
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
interface TextureLibrary {
  name: string;
  has(name: string): boolean;
  decode(name: string): { rgba: Rgba | null; blend: UiBlend; diagnostics: string[] };
  /** GM-32: the bind's blend alone (no decode), and `odd`: a blend the decode names (drawn as source, said). */
  bind(name: string): { blend: UiBlend; odd: boolean };
  /** GM-32 (the prefetch): its names, lower-cased, in the library's order; a texture's decoded bytes off its header; its files. */
  readonly names: readonly string[];
  bytesOf(name: string): number;
  readonly txr: Uint8Array;
  readonly pal: Uint8Array;
}

function library(name: string, txr: Uint8Array, pal: Uint8Array): TextureLibrary {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars([Zar.parse(pal)]);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  const bindOf = (n: string): string | null => {
    const bytes = texdat(n);
    try { return bytes ? parseTextureRecord(n, bytes).gs?.blend ?? null : null; } catch { return null; /* the decode names it */ }
  };
  return {
    name, has: (n) => keys.has(n.toLowerCase()),
    decode: (n) => {
      const got = decodeNamedTextures(texdat, palettes, [n]);
      const bind = bindOf(n);
      const diagnostics = bind === null || bind === 'source' || bind === 'additive' ? got.diagnostics : [...got.diagnostics, `${n}: bind blend ${bind}, drawn as source`];
      return { rgba: got.textures[n] ?? null, blend: bind === 'additive' ? 'additive' : 'source', diagnostics };
    },
    bind: (n) => { const b = bindOf(n); return { blend: b === 'additive' ? 'additive' : 'source', odd: !(b === null || b === 'source' || b === 'additive') }; },
    names: [...keys.keys()],
    bytesOf: (n) => {
      const d = texdat(n);
      return d && d.length >= 4 ? (d[0]! | (d[1]! << 8)) * (d[2]! | (d[3]! << 8)) * 4 : 0;     // research 36 §5: u16 width, u16 height
    },
    txr, pal,
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
  /**
   * GM-32: the libraries' bitmaps decoded ahead of the dialogs that draw them, off the main thread (`o.decoder`), for the
   * lookup to hand out (`MENU_ART_PREFETCH_ADAPTATION`). The lookup never waits on it. Absent on an art made by hand.
   */
  prefetch?(o: UiTexturePrefetchOptions): UiTexturePrefetch;
}

/**
 * MENU_ART_PREFETCH_ADAPTATION: no original (the original has its libraries in memory before a dialog's first draw;
 * `frontEndAssets.ts` names the page's late bitmaps a browser timing adaptation); bounds the browser's memory for the
 * menus' art decoded ahead of use (GM-32, plan `docs/plans/2026-11-01-gpu-menus.md`; research 380 §6). PRODUCT TRACK.
 *
 * Why: the page's lookup asks this art **before** the banks (`frontEnd.ts`: `art?.(name) ?? banks?.(name)`), so a name
 * both hold -- `multplay_back.tif` and `font_titlebar_01.tif` (512 x 512 each) and the rest of OPTIONS' first frame out of
 * UI2D, UIBF and FONT -- was decoded here, synchronously, inside the cold switch's first frame, whatever GM-29's bank
 * prefetch had decoded (the T4 profile at `82ef1260f`: `planFrame` -> `textures` -> `decode` -> `decodeNamedTextures` ->
 * `decodeTexture`, 48.4 ms on the stack in the 88.5 ms stretch). Run with the bank prefetch (`chainUiTexturePrefetch`,
 * after the page's first frame, at idle), it hands each library's names not decoded yet to the page's decode worker (the
 * banks' own decode, `./frontEndTextureBank`: the same `decodeNamedTextures` and `flipRows`, so the same bytes) and keeps
 * each answer for the lookup's first ask -- **only where its decode said nothing** (no diagnostic, a bind blend it
 * draws): a name whose decode says anything is left to the lookup, so `missing` gets the same lines in the same order. A
 * name asked before its answer is decoded synchronously, as without the prefetch, so no dialog draws later than without
 * it. At most `maxBytes` of decoded RGBA (each texture's `width x height x 4` off its header): the art the page reads
 * (dlgMenu's UI2D and UIBF, FONT and UI) is 133 bitmaps, 10,657,024 bytes decoded, none of whose decodes says anything
 * (GM-32's dev-disc count), so the cap holds it with room and stops a larger set. Beside the banks' prefetch (26,159,104
 * bytes, `UI_TEXTURE_PREFETCH_ADAPTATION`) the page so holds about 37 MB of front-end bitmaps decoded ahead, the names
 * both read (UI2D, UIBF) decoded in each. Changes when a bitmap is decoded, never its bytes.
 */
export const MENU_ART_PREFETCH_ADAPTATION = Object.freeze({ maxBytes: 16 * 1024 * 1024 } as const);

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
  // GM-32: the prefetch's answers by lower-cased name, each the bitmap the lookup would make (its decode said nothing),
  // moved into `bitmaps` at the lookup's first ask.
  const prefetched = new Map<string, UiBitmap>();
  const textures: UiTextures = (name) => {
    const key = name.toLowerCase();
    if (!bitmaps.has(key)) {
      const pre = prefetched.get(key);
      if (pre) { prefetched.delete(key); bitmaps.set(key, pre); return pre; }
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
  const prefetch = (o: UiTexturePrefetchOptions): UiTexturePrefetch => {
    const max = o.maxBytes ?? MENU_ART_PREFETCH_ADAPTATION.maxBytes;
    const st = { decoded: 0, bytes: 0, raced: 0, capped: false, stopped: false };
    const run = async (): Promise<string | null> => {
      let budget = 0;
      for (const lib of libs.slice()) {
        if (st.stopped) return null;
        // The names this library answers for the lookup (the first library holding each) that nothing decoded yet.
        const names: string[] = [];
        for (const n of lib.names) {
          if (bitmaps.has(n) || prefetched.has(n) || libs.find((x) => x.has(n)) !== lib) continue;
          const size = lib.bytesOf(n);
          if (budget + size > max) { st.capped = true; break; }
          budget += size;
          names.push(n);
        }
        if (names.length) {
          const got = await o.decoder({ txr: lib.txr, pal: lib.pal, names, hash: o.seedKey !== undefined, diagnostics: true });
          if (st.stopped) return null;
          for (const g of got) {
            if (bitmaps.has(g.name)) { st.raced++; continue; }              // the lookup decoded it first: its object stays
            const bind = lib.bind(g.name);
            // Anything said (a diagnostic, an odd bind, nothing decoded): the lookup's to decode, so it says it as before.
            if (!g.rgba || g.diagnostics === undefined || g.diagnostics.length || bind.odd) continue;
            const bitmap: UiBitmap = { ...g.rgba, blend: bind.blend };
            prefetched.set(g.name, bitmap);
            st.decoded++;
            st.bytes += g.rgba.data.length;
            if (g.fnv1a64 !== undefined) o.seedKey?.(bitmap, g.fnv1a64);
          }
        }
        if (st.capped) return null;
      }
      return null;
    };
    // A decode the stop cut short (the worker closed under it) is the stop, not a failure: no reason.
    const finished = run().catch((e: unknown) => (st.stopped ? null : why(e)));
    return {
      get decoded() { return st.decoded; }, get bytes() { return st.bytes; }, get raced() { return st.raced; }, get capped() { return st.capped; },
      finished, stop: () => { st.stopped = true; },
    };
  };
  return { textures, model, missing, libraries: libs.map((l) => l.name), prefetch };
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
