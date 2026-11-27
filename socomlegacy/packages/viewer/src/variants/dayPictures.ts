import { MAP_VARIANTS, mapArchiveId, mapRow, variantName, type MapVariant } from '@s2u/archive';
import type { LoadingScreen } from '../loadingAssets';
import { decodePngAsync } from '../png';
import type { UiBitmap, UiTextures } from '../uiCompositorView';

/**
 * DAY-PIC-OVERRIDE (product track: **a browser adaptation, display only**; the original has no Day maps, DAY.R1): where a
 * Day map is shown with its picture, the picture is the Day map's own -- our render of the variant, approved by the owner
 * ("everywhere these new first class maps are referenced (i.e lobby, loading screen, etc) the proper variant shows") --
 * and never the night parent's. Two surfaces, two maps (Abandoned and Rat's Nest by day), nothing else:
 *
 * - **CREATE GAME's focused row** (`DisplayGamePic`, research 164 R164.6): the dialog draws `CGPic<n>` from the `uicg`
 *   bank by name, `mp<n>MissPic.tif` for both the night row and its Day row (the row keeps the original's [number, name]
 *   shape, DAY.R5). The page's by-name lookup (`dayPictureTextures`, wrapped round the front end's in `../frontEnd`)
 *   answers that name with the Day picture while the focused row of `AVAILABLE_MISSIONS` is a Day row
 *   (`createGameFocusVariant`); the dialog, its script and the node's texture name are unchanged.
 * - **the loading screen's map picture** (`dlgLoad.rdr`'s `LoadingPicture`, the binding's `load_picture`,
 *   `ld_mp<n>_prog.tif`, research 125 R125.2): a load told the Day variant draws the Day picture under that name
 *   (`withDayLoadingPicture`, from `../lobbyMatch` `pageLobbyMatchScreen`); the binding and its names are unchanged.
 *
 * The HD pack matches by a hash of the decoded pixels (`../hdMenuTextures`), so the Day picture, whose pixels are its own,
 * is drawn as it is at every scale. A variant that is not `day`, a map with no row here, a picture not served (the
 * public export carries none: `workflow/public-export.json`, H439's default for game imagery) or not decoded yet: the
 * disc's night picture, as before.
 */
export const DAY_PICTURE_OVERRIDE_ADAPTATION = 'a Day map shows its own approved picture on CREATE GAME and its loading screen' as const;

export type DayPictureSurface = 'createGame' | 'loading';

export interface DayPictureRow {
  /** The map number (`MAP_VARIANTS`' level). */
  readonly level: number;
  /** The variant the pictures show. */
  readonly variant: MapVariant;
  /** CREATE GAME's bitmap for the map, lower case (`mp<n>MissPic.tif` in `RUN/UI/UICG_TXR.ZED`). */
  readonly missPic: string;
  /**
   * The files under `./pictures/`, our own renders (the owner's approved stills, 2026-11-25, Shadow PC 4): `createGame`
   * at the original `mp<n>MissPic.tif`'s 256 x 128 (the approved 256 x 128 p8, its palette expanded to RGB8 for the
   * page's PNG reader), `loading` at `ld_mp<n>_prog.tif`'s 512 x 256 (research 125 R125.2; the approved 2048 x 1024
   * render, ffmpeg Lanczos to 512 x 256, then the p8 step of the CREATE GAME picture, expanded to RGB8 the same way).
   */
  readonly files: Readonly<Record<DayPictureSurface, string>>;
}

/** The two Day maps' pictures (DAY-R1 Abandoned (Day), OT.R158 Rat's Nest (Day): both accepted in `MAP_VARIANTS`). */
export const DAY_PICTURES: readonly DayPictureRow[] = [
  { level: 5, variant: 'day', missPic: 'mp5misspic.tif', files: { createGame: 'abandoned-day-256x128.png', loading: 'abandoned-day-512x256.png' } },
  { level: 8, variant: 'day', missPic: 'mp8misspic.tif', files: { createGame: 'ratsnest-day-256x128.png', loading: 'ratsnest-day-512x256.png' } },
];

/** A row's variant, when the variant is one the table holds; anything else (`night`, undefined, a word not known) is null. */
function dayRow(pick: (r: DayPictureRow) => boolean, variant: unknown): DayPictureRow | null {
  return DAY_PICTURES.find((r) => r.variant === variant && pick(r)) ?? null;
}

/** The decoded pictures: `get` answers a file decoded (and starts its decode), `load` waits for it; null for one not read. */
export interface DayPictures {
  get(file: string): UiBitmap | null;
  load(file: string): Promise<UiBitmap | null>;
}

/** How a picture's bytes are read (the page's: the served file's URL, one fetch); undefined when it is not served. */
export type DayPictureReader = (file: string) => Promise<Uint8Array | undefined>;

/**
 * The served files, by name under `./pictures/` -> a loader of the URL. An optional glob: in the public export the
 * directory is absent and the glob is empty, so the page draws the night pictures (nothing imports a file by path).
 */
function pictureUrls(): Record<string, () => Promise<string>> {
  const found = import.meta.glob<string>('./pictures/*.png', { query: '?url', import: 'default' });
  return Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^\.\/pictures\//, ''), url]));
}

/** The picture files the page serves. */
export function dayPictureFiles(): string[] {
  return Object.keys(pictureUrls());
}

const fetchPicture: DayPictureReader = async (file) => {
  const url = pictureUrls()[file];
  if (!url) return undefined;
  const res = await fetch(await url());
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined;
};

/** A store of the decoded pictures (top row first, as the PNG is): each file read and decoded once; a failure is null. */
export function createDayPictures(read: DayPictureReader = fetchPicture): DayPictures {
  const done = new Map<string, UiBitmap | null>();
  const pending = new Map<string, Promise<UiBitmap | null>>();
  const load = (file: string): Promise<UiBitmap | null> => {
    if (done.has(file)) return Promise.resolve(done.get(file)!);
    let p = pending.get(file);
    if (!p) {
      p = read(file)
        .then(async (bytes) => (bytes ? (await decodePngAsync(bytes)) as UiBitmap : null))
        .catch(() => null)
        .then((got) => { done.set(file, got); pending.delete(file); return got; });
      pending.set(file, p);
    }
    return p;
  };
  return {
    get: (file) => { if (done.has(file)) return done.get(file)!; void load(file); return null; },
    load,
  };
}

/** A list's focus and its rows' captions, as `@s2u/ui`'s ListboxWidget holds them (row: [number, name]). */
export interface FocusedRows { focus: number; items: readonly { captions: readonly string[] }[] }

/**
 * The variant of CREATE GAME's focused row: the row's name is a variant's name for its own number (`variantName`, as
 * `@s2u/ui` `playListVariants` reads a play list's rows); null for a night row, a row off the table or no list.
 */
export function createGameRowVariant(list: FocusedRows | null | undefined): MapVariant | null {
  const row = list?.items[list.focus];
  if (!row) return null;
  const [number, name] = row.captions;
  const n = Number(number);
  return MAP_VARIANTS.find((v) => v.level === n && variantName(n, v.variant) === name)?.variant ?? null;
}

/** CREATE GAME's popup list of maps (`dlgCreateGame.rdr`), whose focused row `DisplayGamePic` pictures. */
export const CREATE_GAME_MISSION_LIST = 'AVAILABLE_MISSIONS' as const;

/** The focused CREATE GAME row's variant, from the built dialog's widgets; null on any dialog without the list. */
export function createGameFocusVariant(widgets: { get(name: string): unknown } | null | undefined): MapVariant | null {
  const w = widgets?.get(CREATE_GAME_MISSION_LIST) as Partial<FocusedRows> | undefined;
  return w && typeof w.focus === 'number' && Array.isArray(w.items) ? createGameRowVariant(w as FocusedRows) : null;
}

/**
 * The by-name lookup with CREATE GAME's Day pictures: `mp5MissPic.tif` / `mp8MissPic.tif` (any case) answer the Day
 * picture while `variant()` is `day` and the picture is decoded; every other name, and those names otherwise, the
 * lookup given, unchanged.
 */
export function dayPictureTextures(base: UiTextures, variant: () => MapVariant | null | undefined, pictures: DayPictures): UiTextures {
  return (name) => {
    const v = variant();
    if (v === 'day') {
      const k = name.toLowerCase();
      const row = dayRow((r) => r.missPic === k, v);
      const got = row ? pictures.get(row.files.createGame) : null;
      if (got) return got;
    }
    return base(name);
  };
}

/**
 * DAY_PICTURE_WAIT_MS_ADAPTATION (ms; a browser adaptation, no original behind it): the most a Day load's screen waits
 * for its picture before it shows with the night one -- the same bound as the screen's own reads
 * (`../loadingAssets` `LOADING_SCREEN_WAIT_PLACEHOLDER`), so a served file that never answers never holds the screen.
 */
export const DAY_PICTURE_WAIT_MS_ADAPTATION = 3000;

/**
 * A loading screen with the Day map's picture: for a load told `day` on a map with a row here, the bitmap under the
 * binding's picture name (`load_picture`) is the Day picture; the names, the binding and every other bitmap are the
 * screen's. Otherwise (night, no variant, a word not known, no binding, a picture not served or not in within `waitMs`):
 * the screen given, the same object. The screen given is never changed.
 */
export async function withDayLoadingPicture(screen: LoadingScreen, variant: MapVariant | null | undefined, pictures: DayPictures,
  waitMs: number = DAY_PICTURE_WAIT_MS_ADAPTATION): Promise<LoadingScreen> {
  const stem = mapArchiveId(screen.map);
  const level = stem ? mapRow(stem)?.level : undefined;
  const row = level === undefined ? null : dayRow((r) => r.level === level, variant);
  const name = screen.binding?.picture?.toLowerCase();
  if (!row || !name) return screen;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((done) => { timer = setTimeout(() => { done(null); }, waitMs); });
  const got = await Promise.race([pictures.load(row.files.loading), late]).finally(() => { clearTimeout(timer); });
  if (!got) return screen;
  return { ...screen, bitmaps: [...screen.bitmaps.filter(([k]) => k !== name), [name, got]] };
}
