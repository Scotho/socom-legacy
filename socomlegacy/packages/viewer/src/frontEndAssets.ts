import { Zar, readZdbMember, type AssetSource } from '@s2u/archive';
import { PaletteTable, type Rgba } from '@s2u/gs';
import { loadLocService } from '@s2u/scene';
import type { CaptionSource, DialogDesign } from '@s2u/ui';
import { flipRows } from './hudAssets';
import { decodeNamedTextures } from './hudBitmaps';
import type { UiTextures } from './uiCompositorView';

/**
 * The front end's bitmaps and captions on the page (ONL-01; web research 144 §5): what PLAT-14's drawer needs to draw
 * a dialog's textured quads and glyphs from the served tree, and what the dialog's captions resolve through. Until
 * this module the page handed the drawer no bitmaps (`@s2u/ui`'s textures placeholder, `frontEndMachine.ts`) and no caption tables
 * (`readFrontEndDisc`'s `captions: null`), so every `_NNN_..._MSG` was drawn as written and every bitmap came back
 * undrawn; LOGIN's score (OT.R4) needs both.
 *
 * **The banks** (`UI_TEXTURE_BANKS_READING`): a dialog's `LIBRARIES` entry `ui/assetlib/<stem>` is the loose pair
 * `RUN/UI/<STEM>_TXR.ZED` + `_PAL.ZED` (the stem cut to four characters, upper-cased: `FUN_003199c0`, research 95
 * §5.1; `tools/test/uiCompositorScore.test.ts` draws with it), and the text faces' atlases (`font_text_01.tif`,
 * `font_special_01.tif`; research 112) are in no loose bank but every map archive's `FONT_TXR.ZED` / `FONT_PAL.ZED`,
 * byte-equal copies (`armoryData.ts` reads the ARMORY's from the map's), so the page takes `RUN/MP2.ZDB`'s. The
 * titlebar face's `font_titlebar_01.tif` is in UIMP, UI2D, UIGC and UIOP alike.
 *
 * A browser adaptation in its timing: the banks load asynchronously and the lookup answers null until a bank is in,
 * so a dialog's first frames may draw without a bitmap and the drawer fills it in on a later tick (the page redraws
 * every tick); the original has every bank in memory before the dialog's first draw.
 */

/**
 * UI_TEXTURE_BANKS_READING: which texture banks a front-end dialog's bitmaps resolve through -- the `LIBRARIES` stem's
 * loose `RUN/UI/<STEM4>_TXR.ZED` (research 95 §5.1), then a map archive's `FONT_TXR.ZED` for the text faces' atlases.
 * Read off the archives' contents (where each name is found) and the ARMORY's loader, not off the dialog build's
 * texture lookup (`FUN_0036a230`, research 117 §1), whose search order was not followed. [reading]
 */
export const UI_TEXTURE_BANKS_READING = 'the LIBRARIES stem\'s loose bank, then a map\'s FONT_TXR' as const;

/**
 * The loose banks the path's dialogs name (research 144 §5): LOGIN's `uimp`, the boot dialogs' `ui2d`, the main menu's
 * `uibf` -- and `uisk`, the soft keyboard's twelve bitmaps (research 119 §2), which no dialog names: the menu state's
 * own load opens `ui/assetlib/uisk` (the string at 0x3e2dc0) right after the keyboard's file (`FUN_001f4860`
 * D:L54818-54821), before any dialog is built (ONL-06, research 153 §4: the persona form is the path's first keyboard)
 * -- and CREATE GAME's `uicg` (`dlgCreateGame.rdr`'s `LIBRARIES` are `uimp` and `uicg`): the PLAY LIST's 22 map
 * pictures `mp<n>MissPic.tif`, which `DisplayGamePic` shows as `CGPic<n>` on the focus row, are in that bank alone
 * (research 164 R164.6). Without it the picture was drawn as an empty box (the owner's report of 2026-10-06).
 */
export const FRONT_END_TEXTURE_STEMS: readonly string[] = ['UIMP', 'UI2D', 'UIBF', 'UISK', 'UICG'];

/**
 * The loose banks read only when a dialog that names them is built (FE-SWEEP; `PageUiTextures.need`, through
 * `FrontEndSessionOptions.dialogBuilt`): `uiop`, the OPTIONS pages' (`dlgOptions_Menu` and its AUDIO, VIDEO and
 * controller pages: `op_slider`, `op_knob`, `spectrum`, `contpic1-4`, `op_background`), 872,672 bytes the start does not
 * pay. On the page today they are reached by a deep link only: the main menu's OPTIONS is MENU-03's desktop notice
 * (`MENU_03_HOOKS`, removable by OPT-09), so the bank is ready for OPT-09. A read that fails is tried again at the next
 * build that needs it. Its names other than the titlebar face's (byte-equal in every bank) are in no
 * other bank, so reading it late changes no lookup the page made before. The same timing adaptation as the eager banks'
 * (the file's header): a page's first frames may draw before its bank is in.
 */
export const FRONT_END_LAZY_TEXTURE_STEMS: readonly string[] = ['UIOP'];

/**
 * MISSING_UI_LIBRARY_READING: a dialog's `LIBRARIES` stem with no bank on the disc -- `uici` (`dlgCreateClan.rdr`, beside
 * `uimp`) and `hype` (`dlgHype.rdr`, unplaced: research 114) -- loads nothing: neither `RUN/UI` nor `RUN/COMMON` holds
 * the pair and no map archive's table names it, and every bitmap `dlgCreateClan.rdr`'s records name (its eleven: the
 * medals, `NetMonY` / `NetMonB`, the backs) is in UIMP. Read off the disc's contents; the library loader's failure path
 * (`FUN_003199c0`, research 95 §5.1) was not followed. [reading]
 */
export const MISSING_UI_LIBRARY_READING = 'loads nothing; the dialog\'s other banks hold its bitmaps' as const;

/** The single-player missions whose briefing and map dialogs name their own banks (`EQnn`, `BFnn`, `MMnn`). */
const CAMPAIGN = ['51', '52', '53', '61', '62', '63', '71', '72', '73', '81', '82', '83'] as const;

/**
 * Every bank a dialog's `LIBRARIES` name (over `READERC.ZAR` and `READERX.ZAR`, FE-SWEEP) that this module does not load,
 * and why: read by another module (`elsewhere`), on no file of the disc (`absent`, `MISSING_UI_LIBRARY_READING`), or
 * named only by dialogs the page does not reach yet (`later`: the single-player campaign's). The disc test
 * (`frontEndAssets.test.ts`) refuses a bank that is neither loaded nor listed here, and a `later` bank named by a
 * dialog on the page's path. Sizes are the TXR and PAL pair's bytes.
 */
export const FRONT_END_BANKS_NOT_LOADED: Readonly<Record<string, string>> = {
  WSMP: 'elsewhere: the ARMORY (dlg_equipment_mp), from the map archive by armoryData.ts (no loose copy; 118,592 B)',
  WSLC: 'elsewhere: the ARMORY (dlg_equipment_mp), from the map archive by armoryData.ts (474,800 B); also dlg_CharUnlock (the campaign\'s, not reached)',
  LOAD: 'elsewhere: the loading screen (dlgLoad, common/assetlib/loading), from the map archive by loadingAssets.ts (6,608 B)',
  SPMP: 'elsewhere: the round screens (dlgMultiplayerRound/Final/FinalReally), their two bitmaps UIMP\'s byte-equal copies (roundScreens.ts; RUN/COMMON, 264,336 B)',
  SPLA: 'later: dlgExitState only (common/assetlib/splash, RUN/COMMON, 265,184 B; unplaced, research 114)',
  UICI: 'absent: dlgCreateClan names it; no file on the disc (MISSING_UI_LIBRARY_READING)',
  HYPE: 'absent: dlgHype names it (unplaced, research 114); no file on the disc (MISSING_UI_LIBRARY_READING)',
  UIGC: 'later: dlgGameComplete, the campaign\'s end (396,736 B)',
  WSSP: 'later: the single-player ARMORY (dlg_equipment_main) and dlg_WeapUnlock (97,776 B)',
  UIMM: 'later: the campaign\'s map dialogs (dlg_Map51-83), in the single-player archives M51-M83.ZDB (415,120 B)',
  ...Object.fromEntries(CAMPAIGN.flatMap((m) => [
    [`EQ${m}`, `later: the campaign briefing dlg_Brief (mission ${m}), loose (about 71 KB)`],
    [`BF${m}`, `later: the campaign briefing dlg_Brief (mission ${m}${m === '51' ? ', and dlg_WeapUnlock' : ''}), loose (463,872 B)`],
    [`MM${m}`, `later: the campaign map dialog dlg_Map${m}, in M${m}.ZDB (about 1.6 MB)`],
  ])),
};

/** The `elsewhere` banks and the module that reads (or stands in for) each, from the package root (the disc test reads it). */
export const FRONT_END_BANKS_ELSEWHERE: Readonly<Record<string, string>> = {
  WSMP: 'packages/viewer/src/armoryData.ts',
  WSLC: 'packages/viewer/src/armoryData.ts',
  LOAD: 'packages/viewer/src/loadingAssets.ts',
  SPMP: 'packages/viewer/src/roundScreens.ts',
};
/** The `absent` banks: on no file of the disc (`MISSING_UI_LIBRARY_READING`; the disc test checks `RUN/UI` and `RUN/COMMON`). */
export const FRONT_END_BANKS_ABSENT: readonly string[] = ['UICI', 'HYPE'];

/** The bank stems a dialog's `LIBRARIES` name (`libraryStem`'s cut: the path's last part, four characters, upper case); a UIVAR entry has none. */
export function dialogTextureStems(design: Pick<DialogDesign, 'libraries'>): string[] {
  const out: string[] = [];
  for (const l of design.libraries) {
    if (!('name' in l)) continue;
    const s = l.name.replace(/\\/g, '/').split('/').pop()!.slice(0, 4).toUpperCase();
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
/** The map archive whose `FONT_TXR` the page reads (any map's: the copies are byte-equal). */
export const FRONT_END_FONT_MAP = 'RUN/MP2.ZDB';

interface Bank { has(name: string): boolean; decode(name: string): Rgba | null }

/** One bank: its textures by lower-cased name against its own palettes, each bitmap flipped top row first. */
function bank(txr: Uint8Array, pal: Uint8Array): Bank {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars([Zar.parse(pal)]);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  return {
    has: (n) => keys.has(n.toLowerCase()),
    decode: (n) => { const got = decodeNamedTextures(texdat, palettes, [n]).textures[n] ?? null; return got ? flipRows(got) : null; },
  };
}

export interface PageUiTextures {
  /** The lookup PLAT-14's drawer takes (`FrontEndSessionOptions.textures`): null until the name's bank is in. */
  textures: UiTextures;
  /** Every bank loaded or failed (for a test or a run that waits); the names of what would not read. */
  ready: Promise<string[]>;
  /**
   * A dialog built (`FrontEndSessionOptions.dialogBuilt`): the lazy banks its `LIBRARIES` name that are not asked for
   * yet, read now; answers what of them would not read. Every other stem it names is left (loaded at the start, or listed).
   */
  need(design: Pick<DialogDesign, 'libraries'>): Promise<string[]>;
}

/**
 * The page's bitmaps: the loose banks `stems` name and the font bank from `fontMap`, loaded from `source` at once; the
 * lookup answers from the banks loaded so far (the first bank holding the name), caching each decode. Never throws:
 * a bank that will not read is a line in `ready`'s answer and its names stay undrawn.
 */
export function pageUiTextures(source: AssetSource, stems: readonly string[] = FRONT_END_TEXTURE_STEMS, fontMap: string | null = FRONT_END_FONT_MAP,
  lazy: readonly string[] = FRONT_END_LAZY_TEXTURE_STEMS): PageUiTextures {
  const banks: Bank[] = [];
  const missing: string[] = [];
  const cache = new Map<string, Rgba | null>();
  const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  const asked = new Set<string>();
  // A stem is asked from its read's start (no second read while one is out) and let go again if the read fails, so the
  // next build that needs it tries again.
  const load = (stem: string, into: string[]): Promise<void> => {
    const s = stem.slice(0, 4).toUpperCase();
    asked.add(s);
    return Promise.all([source.read(`RUN/UI/${s}_TXR.ZED`), source.read(`RUN/UI/${s}_PAL.ZED`)])
      .then(([t, p]) => { banks.push(bank(t, p)); cache.clear(); }, (e) => { asked.delete(s); into.push(`RUN/UI/${s}_TXR.ZED: ${why(e)}`); });
  };
  const loads: Promise<void>[] = stems.map((stem) => load(stem, missing));
  if (fontMap) {
    loads.push(Promise.all([readZdbMember(source, fontMap, 'FONT_TXR.ZED'), readZdbMember(source, fontMap, 'FONT_PAL.ZED')])
      .then(([t, p]) => { banks.push(bank(t, p)); cache.clear(); }, (e) => { missing.push(`${fontMap}:FONT_TXR.ZED: ${why(e)}`); }));
  }
  const textures: UiTextures = (name) => {
    const k = name.toLowerCase();
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const b = banks.find((x) => x.has(name));
    if (!b) return null;                                                     // not cached: a later bank may hold it
    const got = b.decode(name);
    cache.set(k, got);
    return got;
  };
  const lazySet = new Set(lazy.map((s) => s.slice(0, 4).toUpperCase()));
  const need = (design: Pick<DialogDesign, 'libraries'>): Promise<string[]> => {
    const out: string[] = [];
    const now = dialogTextureStems(design).filter((s) => lazySet.has(s) && !asked.has(s)).map((s) => load(s, out));
    return Promise.all(now).then(() => out);
  };
  return { textures, ready: Promise.all(loads).then(() => [...missing]), need };
}

/**
 * A caption name's text through the tables, for PLAT-17's soft keyboard (`SoftKeyboardFrontEnd`'s `locText`): its title is
 * the `GetTextInput` block's `Purpose`, a `_NNN_..._MSG` name the original's text setter translates (`_455_EnterPlayerName_MSG`
 * on the persona form: "Enter Player Name", `A_37`). Null for a literal, a name no table holds, or no tables: the
 * keyboard then draws the purpose as written. (ONL-06, research 153 §4: the page handed the keyboard no tables.)
 */
export function captionTextOf(captions: CaptionSource | null): (key: string) => string | null {
  return (key) => { const r = captions?.caption(key); return r?.kind === 'loc' ? r.text : null; };
}

/**
 * The caption tables (PLAT-04's `LocService`, research 103) from the served tree: the four loose `RUN/LOCALE/STATES/`
 * archives and `UILd` from `fontMap`; null when none read, the reasons pushed into `missing`. Never throws.
 */
export async function pageCaptions(source: AssetSource, missing: string[] = [], fontMap: string = FRONT_END_FONT_MAP): Promise<CaptionSource | null> {
  try {
    const got = await loadLocService(source, fontMap);
    missing.push(...got.missing);
    return got.service.tables.size ? got.service : null;
  } catch (e) {
    missing.push(`RUN/LOCALE: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
