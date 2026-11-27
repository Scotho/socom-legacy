import type { ModsAdapter, ModsView, OptRow } from './state';

/**
 * WM-PACKS-SETTING (the owner's ruling, 2026-11-15, verbatim: "11 is good but scrap the entire download portion of
 * settings. it can slect your added texture packs and link you to mods. we'll have this on thunderstore when we're done.
 * the test download link can stay in mods for now"; WM.R20): Settings > Display's TEXTURES rows. A BROWSER ADAPTATION,
 * product track, with no original: the game's own textures and drawing are not changed by these rows, only which of the
 * packs added in MODS is chosen, as the MODS screen's own selector chooses it.
 *
 * - "Texture pack": Original, then every texture pack added, read from the MODS adapter's own view (`ModsView.textures`,
 *   `texture`, `rows`); chosen only through its own `setTexture` (the one write path: `s2u-packs` scope `state`,
 *   `StoredModsState` v1 `texture`, and the `s2u.packs.enabled.v1` hint, `../packs/modsState`). No key of its own, no
 *   fetch, no download. Reading or drawing the row writes nothing; a view not read yet is asked once, through the
 *   adapter's own `open()` (as the MODS screen asks it), and only from the Settings screen's draw (`./render/options`),
 *   so the launcher's boot still opens no pack database.
 * - "Add or remove packs in Mods": an action row; the grammar opens MODS with the launcher's own `doAct('mods')`.
 *
 * The MODS adapter hands itself here when it is made (`./adapters/mods` `liveMods`) and takes itself back at its dispose;
 * with none, the rows still draw (Original alone).
 */
export const TEXTURE_PACK_SETTING_ADAPTATION = 'WM-PACKS-SETTING: a browser adaptation -- Settings chooses among the texture packs added in MODS, through MODS\' own setTexture, and links to MODS' as const;
export const TEXTURE_PACK_ROW = 'texture-pack';
export const MODS_LINK_ROW = 'texture-pack-mods';
export const TEXTURES_SECTION = 'Textures';
export const NO_TEXTURE_PACKS_LINE = 'No texture packs added yet.';
/** The line while the MODS list has not been read yet (one short word: the row's line is one line at 400 px). */
export const TEXTURE_PACKS_READING_LINE = 'Reading…';

/** A pack's size in words, by its id (the MODS adapter's; null when it is not listed). */
export type PackSize = (id: string) => string | null;
/** One row's behaviour, in the options adapter's own shape (`./adapters/options` `Spec`). */
export interface TexturePackSpec {
  row: Omit<OptRow, 'values' | 'def' | 'locked' | 'warn'>;
  values(): readonly string[];
  get(): number | undefined;
  def(): number | undefined;
  lock(): string | undefined;
  set(i: number): boolean;
}

let source: { adapter: ModsAdapter; sizeOf: PackSize } | null = null;
let asked = false;

/** The MODS adapter hands itself here; the returned release takes it back (only if it is still the one held). */
export function setTexturePackSource(adapter: ModsAdapter, sizeOf: PackSize): () => void {
  const mine = { adapter, sizeOf };
  source = mine;
  asked = false;
  return () => { if (source === mine) { source = null; asked = false; } };
}

/** The MODS adapter's view as it stands: a read, nothing asked or written. */
export const texturePackView = (): ModsView | null => source?.adapter.view() ?? null;

/** Asks the MODS adapter to read its list once, through its own `open()`, when its view has not been read. */
export function askTexturePacks(): void {
  if (!source || asked || source.adapter.view().ready) return;
  asked = true;
  source.adapter.open();
}

const ORIGINAL = [{ id: null, label: 'Original' }] as const;
const choicesOf = (v: ModsView | null): ModsView['textures'] => (v?.textures.length ? v.textures : ORIGINAL);

/**
 * The row's line, one short line: how many packs are added; with none added, "No texture packs added yet.". The chosen
 * pack's size is not repeated here: it is shown quietly beside the pack's name in the choice (`texturePackChoiceSizes`).
 */
export function texturePackLine(v: ModsView | null): string {
  const added = choicesOf(v).filter((c) => c.id !== null).length;
  if (v && !v.ready && added === 0) return TEXTURE_PACKS_READING_LINE;
  if (!v || added === 0) return NO_TEXTURE_PACKS_LINE;
  return `${added} pack${added === 1 ? '' : 's'} added`;
}

/**
 * INTAKE 56 (the owner's ruling, verbatim "quietly shown size"): each choice's size, in the order of the row's values --
 * null for Original and for a pack the MODS adapter does not list; drawn quietly beside the pack's name (`./render/options`),
 * no warning, no dialog. A read: nothing asked or written.
 */
export function texturePackChoiceSizes(v: ModsView | null = texturePackView(), sizeOf: PackSize | undefined = source?.sizeOf): (string | null)[] {
  return choicesOf(v).map((c) => (c.id === null || !sizeOf ? null : sizeOf(c.id)));
}

/** The two rows, read afresh at each build of the options' rows. */
export function texturePackSpecs(): TexturePackSpec[] {
  const v = texturePackView();
  const choices = choicesOf(v);
  const at = Math.max(0, choices.findIndex((c) => c.id === (v?.texture ?? null)));
  return [{
    row: {
      id: TEXTURE_PACK_ROW, label: 'Texture pack', hint: texturePackLine(v), section: TEXTURES_SECTION,
      about: 'Which of the texture packs added in this browser the game draws with. Original is the textures on the disc.',
      note: 'Saved to this browser, as Mods saves it. Packs are added and removed in Mods.',
    },
    values: () => choices.map((c) => c.label),
    get: () => at,
    def: () => 0,
    lock: () => undefined,
    set: (i) => {
      const c = choices[i];
      // The id it holds writes nothing -- compared by id, as MODS' own selector does (`./grammar`, MODS_TEXTURE_ROW): a
      // stored id MODS no longer lists reads as Original, and choosing Original then writes null. A change while MODS is
      // busy is refused here (MODS' own `change` drops it).
      if (!c || c.id === (v?.texture ?? null) || !source || v?.busy) return false;
      source.adapter.setTexture(c.id);
      return true;
    },
  }, {
    row: {
      id: MODS_LINK_ROW, label: 'Add or remove packs in Mods', action: 'Open Mods',
      about: 'The Mods screen keeps every pack added in this browser: add one from a file, or remove one.',
      note: 'Experiments > Mods.',
    },
    values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false,
  }];
}
