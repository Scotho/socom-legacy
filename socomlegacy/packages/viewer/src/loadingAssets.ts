import {
  addedZdbEntries, isRanged, noteMemberArchive, noteRangedZdbMember, parseRdr, parseZdb, readZarMembers, Zar,
  ZDB_HEAD, zdbEntry, zdbMember, zdbOverrideBytes, zdbTocLength, type AssetSource, type ZdbEntry,
} from '@s2u/archive';
import { PaletteTable, type Rgba } from '@s2u/gs';
import {
  assetLibStem, decodeUiProgram, FONTS_RDR, locArchivePath, parseAnimSets, parseFontFaces, parseUiLayout, readLocArchive,
  type FontFace, type LocEntry, type UiLayout,
} from '@s2u/scene';
import { loadDialog } from '@s2u/ui';
import {
  LOADING_DIALOG, LOADING_SCRIPTS, loadingBinding, loadingFade, loadingSpin, type LoadingBinding, type LoadingFade, type LoadingSpin,
} from '@s2u/ui/loading';
import { decodeNamedTextures } from './hudBitmaps';
import { flipRows } from './hudAssets';

/**
 * The original's loading screen, read off the disc in the worker for one map (INT-LOADING, an interim ahead of ONL-18;
 * socomlegacy/docs/research/125). Ported from Chris's browser-beta-v5 `loadingAssets.ts` (chris/browser-beta-integration
 * d578f347): his reading of the map's `mission.rdr` binding, `LOAD_TXR`'s disc and `FONT_TXR`'s font is kept; the
 * libraries and bitmaps are now the ones `dlgLoad.rdr`'s own records name, the layout and the disc's spin are read too,
 * and every multiplayer map is covered. Nothing is written into the source; nothing throws.
 *
 * - **the layout**: `RUN/UI/READERC.ZAR/dlgLoad.rdr` (`parseUiLayout` for the drawing; PLAT-05's `loadDialog` for its
 *   `LIBRARY` -- `common/assetlib/loading`, which `parseUiLayout` does not read -- and its font library);
 * - **the binding**: the map's `READERM.ZAR/mission.rdr` (`loadingBinding`): the title, the picture's name and its
 *   library `LoadingScreenAssets` (OMnn / LPnn);
 * - **the spin**: the map's `LDZANIM.ZAR` set `dlgLoad.rdr`, animation `SpinLoadingCD` (`loadingSpin`);
 * - **the fade**: the same set's `OnMenuStart`, its `MENUFADER` opacity motion (`loadingFade`; `LOADING_FADE_READING`);
 * - **the strings**: the map's `UILDLOC.ZAR` (`UILd`, ids 2000-2006; research 103 R103.1) for `_2000_ToReturn_MSG`;
 * - **the font**: `RUN/READERC.ZAR/fonts.rdr`'s face the layout names (`font_text_01`);
 * - **the bitmaps**: every `FILENAME` the layout names, the background, the picture (`LoadingPicture`'s `UIVAR`
 *   through the binding) and the face's atlases, each from the first library that holds it -- the dialog's libraries
 *   in order (`LOAD`), the font library (`FONT`, the design's `fontLib`), then the picture's (the binding's stem) --
 *   each against its own `_PAL` and **flipped** top row first (`./hudAssets`). A name no library holds is listed in
 *   `unheld`, not `missing`: the progress bar's `load_back.tif` and `load_line.tif` are on no texture bank of the disc
 *   (research 125 §4), so the original has nothing to draw there either.
 */

export interface LoadingScreen {
  /** The map archive it was read for (`RUN/MP2.ZDB`): the page matches it to the load it asked for. */
  map: string;
  layout: UiLayout | null;
  /** The libraries the bitmaps were looked up in, in order (the dialog's, then the font's). */
  libraries: string[];
  binding: LoadingBinding | null;
  spin: LoadingSpin | null;
  /** `OnMenuStart`'s fade from black (`MENUFADER` 1 -> 0 in 1.5 s on the disc), or null. */
  fade: LoadingFade | null;
  /** The face(s) the layout draws with. */
  fonts: FontFace[];
  /** `UILd`'s strings (`_2000_ToReturn_MSG` ...). */
  strings: LocEntry[];
  /** The 2D bitmaps by lower-case name, top row first. */
  bitmaps: [string, Rgba][];
  /** Bitmaps the layout names that no loaded library holds (lower case, sorted). */
  unheld: string[];
  missing: string[];
}

/** The font library a dialog loads unless it says `NOFONTLIB` (research 105: `FUN_00381550` D:L277316-277322). */
export const FONT_LIBRARY = 'common/assetlib/font';

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Reads the loading screen for the map archive `mapPath` (`RUN/MP2.ZDB`). Never throws: what will not read is in
 * `missing`. Without `dlgLoad.rdr`'s layout it stops there: nothing else is read.
 */
export async function loadingFromDisc(source: AssetSource, mapPath: string): Promise<LoadingScreen> {
  const missing: string[] = [];
  const out: LoadingScreen = { map: mapPath, layout: null, libraries: [], binding: null, spin: null, fade: null, fonts: [], strings: [], bitmaps: [], unheld: [], missing };
  const member = async (path: string, name: string): Promise<Uint8Array | null> => {
    try {
      const got = (await readZarMembers(source, path, [name])).get(name);
      if (!got) missing.push(`${path}: no ${name}`);
      return got ?? null;
    } catch (e) { missing.push(`${path}: ${why(e)}`); return null; }
  };
  // The map archive's table of contents is read once for the whole screen (over a ranged source: its size, head and
  // table, then each member's own range; otherwise the archive whole, once) -- `readZdbMember` per member re-read the
  // three each time, nine members' worth of serial requests before the map's first byte (review F2).
  let toc: Promise<(suffix: string) => Promise<Uint8Array>> | null = null;
  const openMap = (): Promise<(suffix: string) => Promise<Uint8Array>> => (toc ??= openZdb(source, mapPath));
  const mapMember = async (suffix: string): Promise<Uint8Array | null> => {
    try { return await (await openMap())(suffix); } catch (e) { missing.push(`${mapPath} ${suffix}: ${why(e)}`); return null; }
  };
  const attempt = <T>(what: string, f: () => T): T | null => {
    try { return f(); } catch (e) { missing.push(`${what}: ${why(e)}`); return null; }
  };

  // The layout, and the libraries its design names.
  const dlg = await member(LOADING_DIALOG.archive, LOADING_DIALOG.member);
  let fontLib = true;
  if (dlg) {
    attempt(LOADING_DIALOG.member, () => {
      const root = parseRdr(dlg);
      out.layout = parseUiLayout(root);
      const design = loadDialog(root);
      out.libraries = design.libraries.flatMap((l) => ('name' in l ? [l.name] : []));
      fontLib = design.fontLib;
    });
  }
  // No layout, no screen (`./loadingPanel`'s `attachLoadingScreen` shows none): the rest is not read, so the worker's
  // map, which waits on this read, waits on nothing it will not use (a served or partial tree without the dialog).
  if (!out.layout) return out;
  if (fontLib) out.libraries.push(FONT_LIBRARY);

  // The map's binding, its spin, its strings and the face, asked for together (none needs another's answer).
  const loc = locArchivePath('UILd');
  const [readerm, ld, strings, fonts] = await Promise.all([
    mapMember('READERM.ZAR'), mapMember(LOADING_SCRIPTS.member), mapMember(loc.archive.split('/').pop()!),
    member(FONTS_RDR.archive, FONTS_RDR.member),
  ]);
  if (readerm) {
    out.binding = attempt(`${mapPath} mission.rdr`, () => {
      const rm = Zar.parse(readerm);
      const key = rm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
      if (!key) throw new Error('READERM.ZAR has no mission.rdr');
      return loadingBinding(parseRdr(rm.data(key)));
    });
  }
  const set = ld ? attempt(`${mapPath} ${LOADING_SCRIPTS.member}`, () => {
    const found = parseAnimSets(Zar.parse(ld)).sets.find((s) => s.name === LOADING_SCRIPTS.set);
    if (!found) throw new Error(`no set ${LOADING_SCRIPTS.set}`);
    return found;
  }) : null;
  if (set) {
    const program = (name: string) => {
      const anim = set.anims.find((a) => a.name === name);
      if (!anim) throw new Error(`no animation ${name}`);
      return decodeUiProgram(anim);
    };
    out.spin = attempt(`${mapPath} ${LOADING_SCRIPTS.spin}`, () => {
      const spin = loadingSpin(program(LOADING_SCRIPTS.spin));
      if (!spin) throw new Error(`${LOADING_SCRIPTS.spin} has no scale motion`);
      return spin;
    });
    out.fade = attempt(`${mapPath} ${LOADING_SCRIPTS.fade}`, () => {
      const fade = loadingFade(program(LOADING_SCRIPTS.fade));
      if (!fade) throw new Error(`${LOADING_SCRIPTS.fade} has no MENUFADER opacity motion`);
      return fade;
    });
  }
  if (strings) out.strings = attempt(`${mapPath} UILDLOC.ZAR`, () => [...readLocArchive(strings, 'UILd').entries]) ?? [];

  // The face the layout draws with.
  if (fonts) {
    const want = (out.layout?.font ?? 'font_text_01').toLowerCase();
    out.fonts = attempt(FONTS_RDR.member, () => parseFontFaces(parseRdr(fonts)).filter((f) => f.name.toLowerCase() === want)) ?? [];
  }

  // The bitmaps, each from the first library that holds it.
  const stems = [...new Set([...out.libraries.map(assetLibStem), ...(out.binding?.stem ? [out.binding.stem] : [])])];
  const libraries: { stem: string; keys: Map<string, ReturnType<Zar['child']>>; zar: Zar; palettes: PaletteTable }[] = [];
  const banks = await Promise.all(stems.map((stem) => Promise.all([mapMember(`${stem}_TXR.ZED`), mapMember(`${stem}_PAL.ZED`)])));
  for (const [i, stem] of stems.entries()) {
    const [txr, pal] = banks[i]!;
    if (!txr || !pal) continue;
    const lib = attempt(`${stem}_TXR/${stem}_PAL`, () => {
      const zar = Zar.parse(txr);
      const keys = new Map((zar.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), zar.child(k, 'texdat')]));
      return { stem, keys, zar, palettes: PaletteTable.fromZars([Zar.parse(pal)]) };
    });
    if (lib) libraries.push(lib);
  }
  const wanted = new Set<string>();
  const layout = out.layout;
  if (layout?.background) wanted.add(layout.background);
  for (const o of layout?.objects ?? []) {
    if (o.filename) wanted.add(o.filename);
    else if (o.type === 'IMAGE' && o.uivar) {
      const value = out.binding?.vars.get(o.uivar);
      if (value && value.trim()) wanted.add(value);
    }
  }
  for (const f of out.fonts) for (const t of f.textures) wanted.add(t);
  const bitmaps = new Map<string, Rgba>();
  const unheld = new Set<string>();
  for (const name of wanted) {
    const key = name.toLowerCase();
    if (bitmaps.has(key)) continue;
    const lib = libraries.find((l) => l.keys.get(key));
    if (!lib) { unheld.add(key); continue; }
    const got = decodeNamedTextures(() => { const k = lib.keys.get(key); return k ? lib.zar.data(k) : null; }, lib.palettes, [name]);
    for (const d of got.diagnostics) missing.push(`${lib.stem}: ${d}`);
    const rgba = got.textures[name];
    if (rgba) bitmaps.set(key, flipRows(rgba));
  }
  // Only when every library opened is a name's absence a fact about the disc; otherwise it is the read's failure.
  if (libraries.length === stems.length) out.unheld = [...unheld].sort();
  else for (const n of [...unheld].sort()) missing.push(`bitmap ${n}: in none of ${libraries.map((l) => l.stem).join(', ') || 'no library'}`);
  out.bitmaps = [...bitmaps];
  return out;
}

/**
 * A map archive opened once: its table of contents read (over a ranged source: the size, the head, the table -- as
 * `readZdbMember` does, `packages/archive/src/zarMembers.ts`), then a reader of one member by suffix (`zdbEntry`'s
 * match), each its own range. Any other source reads the archive whole, once.
 */
async function openZdb(source: AssetSource, path: string): Promise<(suffix: string) => Promise<Uint8Array>> {
  if (!isRanged(source)) {
    const bytes = await source.read(path);
    noteMemberArchive(path, bytes);
    const entries = parseZdb(bytes);
    return async (suffix) => zdbMember(bytes, entries, suffix);
  }
  const size = await source.size(path);
  const head = await source.readRange(path, 0, Math.min(ZDB_HEAD, size));
  const toc: ZdbEntry[] = parseZdb(await source.readRange(path, 0, Math.min(zdbTocLength(head), size)), size);
  const entries = [...toc, ...addedZdbEntries(path, toc)];
  return async (suffix) => {
    const entry = zdbEntry(entries, suffix);
    const hit = zdbOverrideBytes(path, entry.name);
    if (hit) { noteRangedZdbMember(path, entry.name, hit); return hit; }
    if (entry.offset < 0) throw new Error(`${path}: ${entry.name} is not in the archive`);
    const bytes = await source.readRange(path, entry.offset, entry.size);
    noteRangedZdbMember(path, entry.name, bytes);
    return bytes;
  };
}

/** The buffers a `LoadingScreen` hands over, each once (two names on one buffer would fail the post: DataCloneError). */
export function loadingTransferables(data: LoadingScreen): Transferable[] {
  const out = new Set<ArrayBufferLike>();
  for (const [, rgba] of data.bitmaps) out.add(rgba.data.buffer);
  return [...out].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);
}

/**
 * LOADING_SCREEN_WAIT_PLACEHOLDER (ms; research 125 §7) -- a **browser adaptation**, no original behind it: the most a
 * map's load waits on its loading screen's reads. The original reads both off its own disc and never stalls; a served
 * tree can (a request that never answers), and the map must not wait on it forever (review F2). The screen's reads
 * are about eight round trips and some 0.2 MB of bitmaps, well inside it on any working connection.
 */
export const LOADING_SCREEN_WAIT_PLACEHOLDER = 3000;

/**
 * A map load with its loading screen (the worker's `load`): the screen is read and handed over (`post`) first, then the
 * map is loaded and returned -- the original's order: the load state builds `dlgLoad` in its Init, then loads the map
 * (research 115 R115.10). Read beside the map instead, the screen's few small reads queued behind the map's decode on
 * this one thread and the screen came a few milliseconds before its map (a browser look, 2026-10-02: shown for 13 ms
 * and 28 ms on a served tree). A screen that will not read never stops the map; one that has not read within `waitMs`
 * (`LOADING_SCREEN_WAIT_PLACEHOLDER`) no longer holds it -- it is posted when it comes, and the page's watch drops it
 * if its map came first (`./loadingPanel` `LoadingWatch`).
 */
export async function loadWithScreen<T>(
  readScreen: () => Promise<LoadingScreen>, post: (screen: LoadingScreen) => void, load: () => Promise<T>,
  waitMs = LOADING_SCREEN_WAIT_PLACEHOLDER,
): Promise<T> {
  const screen = readScreen().then(post, () => { /* the map loads without its screen */ });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); });
  await Promise.race([screen, late]);
  clearTimeout(timer);
  return load();
}
