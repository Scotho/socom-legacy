import {
  DirectoryAssetSource, HttpAssetSource, IsoAssetSource, discIdentity, type AssetSource, type DiscIdentity,
} from '@s2u/archive';
import type { ExtractEnv } from './discExtract';
import { StoredDiscSource } from './discStored';
import { applyOverrideSource } from './mods/override';

/**
 * Where the page's and the workers' disc reads come from (disc-access plan `docs/plans/2026-10-11-disc-access.md`,
 * DA-3; research 306 §1-§2): the served tree under a base URL (`?devmode`), the player's own disc image, or a disc in a
 * drive, a mounted image or a copy of the disc's files picked as a folder. One module for the map worker (`./worker`),
 * the movie worker (`./movieWorker`), the front end and the disc prompt, so the image's path and the folder's are each
 * written once.
 *
 * A **browser adaptation** (DA.R2): the original reads its own disc by LBN; here every kind is read by path through the
 * same `@s2u/archive` readers, and `DirectoryAssetSource`'s dev-disc test pins that a folder and the image answer the
 * same bytes for a path. Nothing here changes what the game reads.
 */

/**
 * One file of a picked folder: its path below the pick, read on the page at the pick (`dirRequest`), and its bytes. The
 * path travels beside the `File` because a `File` posted to a worker keeps its name, type, date and bytes but probably
 * not its `webkitRelativePath`, which the HTML serialisation does not list (the plan's DA-3 contract; to be pinned by a
 * browser test in DA-6).
 */
export type DiscEntry = { readonly path: string; readonly file: File };

/**
 * What a request reads (design spec §3.1): the served tree, the player's image (W1.7, milestone M5) or a picked folder
 * (DA-3). A `File` crosses to a worker by structured clone as a handle on the file, not a copy of its bytes, so posting
 * one -- or a folder's 349 -- with every request costs nothing.
 */
export type SourceRequest =
  | { kind: 'http'; baseUrl: string }
  | { kind: 'iso'; file: File }
  | { kind: 'dir'; entries: readonly DiscEntry[] }
  | StoredRequest;

/**
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): the disc's read set kept in this
 * browser (`./discExtract`), named by the disc's identity only: each thread opens the extraction itself (`./discStored`;
 * OPFS and IndexedDB are both reachable from a worker), so nothing but the identity -- and, when a disc was opened on this
 * visit, that disc's request (its `File` handles, never its bytes) -- is posted. `disc` is the fallback for what the
 * extraction does not hold, as `fallback` allows: `movies` (the default, the front end's cut movies) or `outside` (the
 * forge: any path outside the read set; its campaign maps are in it since FI.R6's second revision). A browser adaptation: nothing the game reads changes.
 */
export type StoredRequest = {
  kind: 'stored';
  identity: DiscIdentity;
  disc?: Exclude<SourceRequest, { kind: 'http' } | { kind: 'stored' }>;
  fallback?: 'movies' | 'outside';
};

/** A request for a disc, image or folder, read where it is: every kind but the served tree and the kept extraction. */
export type DiscRequest = Exclude<SourceRequest, { kind: 'http' } | { kind: 'stored' }>;

/**
 * LATER 322 (issue #454): a disc as one page hands it to another -- an image or a folder opened on this visit, or the
 * copy kept in this browser (`StoredRequest`, which every worker opens through `sourceCache`, `./worker`). The replay
 * viewer's hand-over to the test room it frames (`./discPrompt` `replayDiscRequest`, `./modern/replays/worldHost`). A
 * browser adaptation.
 */
export type HandedDiscRequest = DiscRequest | StoredRequest;

/** A picked or dropped folder's request (DA-4). */
export type DirRequest = Extract<SourceRequest, { kind: 'dir' }>;

/**
 * Whether a request of `kind` reads the visitor's disc -- an image or a folder (DA-4) -- rather than the served tree:
 * the test room's tests of "a disc is open" (`main.ts`'s verdict note, its pending disc, its empty picker's source).
 */
export function isDiscRequest(kind: SourceRequest['kind']): boolean {
  return kind !== 'http';
}

/**
 * What the page opens and checks (`openDisc`): the image (as a `Blob`, which is what `IsoAssetSource` and the front
 * end's `openFrontEndImage` have always taken) or a picked folder. Every disc `SourceRequest` is one.
 */
export type DiscOpen = { kind: 'iso'; file: Blob } | Extract<SourceRequest, { kind: 'dir' }>;

/** A disc opened and checked on the page: its source, and what its `SYSTEM.CNF` says (null for an image, not read). */
export type OpenedDisc = { source: AssetSource; identity: DiscIdentity | null };

/**
 * The `{ kind: 'dir' }` request for the `File`s of a directory pick (`<input webkitdirectory>`): each file's
 * `webkitRelativePath` -- the picked folder's own name first -- read here, on the page, where it is still there; a file
 * without one (a dropped file) goes by its name.
 */
export function dirRequest(files: readonly File[]): Extract<SourceRequest, { kind: 'dir' }> {
  return { kind: 'dir', entries: files.map((file) => ({ path: file.webkitRelativePath || file.name, file })) };
}

/**
 * DA-4: a dropped folder (a drive's root, a mounted image's, a copy of the disc's files) walked into a request -- or
 * null when the item is not a folder, and the drop is an image's as before (also in a browser without
 * `DataTransferItem.webkitGetAsEntry`). The entry is taken now, in the drop's own event (a `DataTransfer`'s items are
 * gone once it returns), and walked after: each directory's `readEntries` called until it answers an empty batch (it
 * answers in batches). Each file's path is its place below the drop, the dropped folder's own name first -- what a
 * pick's `webkitRelativePath` carries, so the two make one request shape: `DirectoryAssetSource` strips that name (DA-1)
 * and `discName` names the folder by it. A file or folder the browser will not read is left out: the folder reader then
 * names what is missing, in its words, when it is asked for it. Here rather than in `./discPrompt` so the test room's
 * page object (`./ui`) walks a drop without importing the front end; `./discPrompt` `folderRequestFromDrop` is its name
 * there.
 */
export function droppedFolder(item: DataTransferItem | null | undefined): Promise<DirRequest> | null {
  const entry = item && typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
  if (!entry?.isDirectory) return null;
  return walkEntry(entry, '').then((entries) => ({ kind: 'dir', entries }));
}

/** What `discOpener` needs of the test room's page (`main.ts`): its parts, so the order is testable without the page. */
export interface DiscOpenerParts {
  /** A map switch is under way (`main.ts` `switching`, the release review's MJ-3): no disc is opened over it. */
  switching(): boolean;
  /** The chosen disc's mark is put down, or taken back (`@s2u/ui` `DiscChoice`, research 100). */
  chosen(): void;
  refused(): void;
  /** The panel's status line and the disc page's line. */
  status(text: string): void;
  discState(text: string): void;
  /** Asks the worker for the disc's map list (`askIndex`): an image, a checked folder, or (LATER 322) the kept copy. */
  ask(disc: HandedDiscRequest): void;
  /** Forgets the index request still under way (an older disc's), so no answer to it opens that disc. */
  forget(): void;
  /** Says a refusal as the worker's refusals are said. */
  failed(text: string): void;
  /** The page's check of a folder; absent, `openDisc` (DA.R8), probing `SYSTEM.CNF`, the file the identity reads. */
  check?: (disc: DirRequest) => Promise<unknown>;
}

/**
 * The test room's `openDisc` (`main.ts`; DA-3's review F1, DA-4's review F-a / F-b): a `File` or a disc request. Not
 * over a map switch (MJ-3: its world would be orphaned under the disc's first map). An image is asked of the worker at
 * once, as since W1.7. A folder is checked first, once, on the page (`openDisc`, DA.R8: the workers trust only a request
 * the page resolved), the older disc's index request forgotten at once, so whatever that disc answers no longer opens it
 * (a disc chosen meanwhile wins); then asked -- unless a newer disc was chosen meanwhile (dropped), or a map switch began
 * during the check (dropped, its mark taken back, asked for again in the entry's words). A refusal takes the mark back
 * and is said in the reader's words.
 *
 * LATER 322 (issue #454): the copy kept in this browser (`{ kind: 'stored' }`), handed by the replay viewer when the
 * launcher started from it, is asked of the worker at once, as an image is -- the page that hands it read it from its
 * record and checked it at its extraction (DX-3), and the worker opens it as it opens any stored request -- named "the
 * disc kept in this browser" (`requestLabel`).
 */
export function discOpener(p: DiscOpenerParts): (chosen: File | HandedDiscRequest) => void {
  const check = p.check ?? ((disc: DirRequest) => openDisc(disc, 'SYSTEM.CNF'));
  const nameOf = (disc: HandedDiscRequest): string => (disc.kind === 'stored' ? requestLabel(disc) : discName(disc));
  const againWords = (disc: HandedDiscRequest): string => `a map is still loading: open ${nameOf(disc)} again once it is drawn`;
  const again = (disc: HandedDiscRequest): void => { p.status(againWords(disc)); };
  let opening = 0;
  return (chosen) => {
    const disc: HandedDiscRequest = chosen instanceof File ? { kind: 'iso', file: chosen } : chosen;
    if (p.switching()) { again(disc); return; }
    p.chosen();
    p.status(`reading ${requestLabel(disc)} ...`);
    p.discState(`reading ${requestLabel(disc)} ...`);
    const call = ++opening;
    if (disc.kind === 'iso' || disc.kind === 'stored') { p.ask(disc); return; }
    p.forget();
    check(disc).then(() => {
      if (call !== opening) return;
      // Dropped mid-switch: both lines ask again, so the disc page's no longer says the folder is being read.
      if (p.switching()) { p.refused(); again(disc); p.discState(againWords(disc)); return; }
      p.ask(disc);
    }, (e: unknown) => {
      if (call !== opening) return;
      p.refused();
      p.failed(`failed while reading ${discLabel(disc)}: ${e instanceof Error ? e.message : String(e)}`);
    });
  };
}

/** One dropped entry's files, each with its path below the drop (`at` the path of the folder holding it). */
async function walkEntry(entry: FileSystemEntry, at: string): Promise<DiscEntry[]> {
  const path = at && entry.name ? `${at}/${entry.name}` : at || entry.name;
  if (entry.isFile) {
    const file = await new Promise<File | null>((ok) => { (entry as FileSystemFileEntry).file(ok, () => { ok(null); }); });
    return file ? [{ path, file }] : [];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((ok) => { reader.readEntries(ok, () => { ok([]); }); });
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map((c) => walkEntry(c, path)))).flat();
}

/**
 * A disc's name for the page's lines: the image's file name, or the picked folder's own name (the first segment every
 * entry shares: a drive's letter, a mounted volume's or a folder's name), or "the picked folder" when they share none.
 */
export function discName(request: DiscRequest): string {
  if (request.kind === 'iso') return request.file.name;
  const firsts = new Set(request.entries.map((e) => {
    const parts = e.path.split(/[\\/]+/).filter((p) => p.length > 0);
    return parts.length > 1 ? parts[0]! : '';
  }));
  const [only] = firsts;
  return firsts.size === 1 && only ? only : 'the picked folder';
}

/**
 * A disc as the page's status and error lines name it: `the disc image <file>` (the words since W1.7), or `the disc
 * folder <name>`.
 */
export function discLabel(request: DiscRequest): string {
  const name = discName(request);
  if (request.kind === 'iso') return `the disc image ${name}`;
  return name === 'the picked folder' ? name : `the disc folder ${name}`;
}

/**
 * DX-3: a request as the workers' error lines name what they were reading: a disc's `discLabel`, the kept extraction
 * ("the disc kept in this browser"), or the served tree.
 */
export function requestLabel(request: SourceRequest): string {
  if (request.kind === 'http') return 'the served tree';
  if (request.kind === 'stored') return 'the disc kept in this browser';
  return discLabel(request);
}

/**
 * The cache identity of a request. **Not `discIdentity`** (DA-2's boot name, `VER` and `VMODE`): that is an
 * asynchronous read, and two copies of the same disc -- one whole, one missing files -- share it. So the key is what
 * the page's `File`s carry, known with no read: for an image its name, size and modification time (as `worker.ts` has
 * keyed it since W1.7); for a folder the same three for every entry, with its path. A posted `File` is a fresh clone
 * each time, so its object identity is never the key. The kind leads, so the three kinds never share one.
 */
export function sourceKey(request: SourceRequest): string {
  const meta = (f: File): string => `${f.name}\u0000${f.size}\u0000${f.lastModified}`;
  if (request.kind === 'http') return `http\u0000${request.baseUrl}`;
  // DX-3: the kept extraction by the disc's identity (another extraction replaces the thread's source), its fallback and
  // the disc it falls back on.
  if (request.kind === 'stored') {
    const { boot, ver, vmode } = request.identity;
    return `stored\u0000${boot}\u0000${ver ?? ''}\u0000${vmode ?? ''}\u0000${request.fallback ?? 'movies'}\u0001${request.disc ? sourceKey(request.disc) : ''}`;
  }
  if (request.kind === 'iso') return `iso\u0000${meta(request.file)}`;
  return `dir\u0000${request.entries.map((e) => `${e.path}\u0000${meta(e.file)}`).join('\u0001')}`;
}

/**
 * The source a request names, made new (no cache): `IsoAssetSource` over the image exactly as before,
 * `DirectoryAssetSource` over a folder's entries (DA-1), `HttpAssetSource` over the served tree, and (DX-3)
 * `./discStored` `StoredDiscSource` over the kept extraction, opened at its first read (`env`: a test's storage).
 */
export function assetSourceFor(request: SourceRequest, env?: ExtractEnv): AssetSource {
  if (request.kind === 'stored') return new StoredDiscSource(request, request.disc ? assetSourceFor(request.disc) : null, env ? { env } : {});
  if (request.kind === 'iso') return new IsoAssetSource(request.file);
  if (request.kind === 'dir') return folderSource(request.entries);
  return new HttpAssetSource(request.baseUrl);
}

/** DA-1's reader over a folder's entries: each `File` is the `Blob` it reads by `slice`. */
function folderSource(entries: readonly DiscEntry[]): DirectoryAssetSource {
  return new DirectoryAssetSource(entries.map((e) => ({ path: e.path, blob: e.file })));
}

/**
 * One thread's sources (each worker makes one at its start). The disc last asked for is kept, so an image's
 * directories are walked once rather than once a request, and a different disc of either kind -- "Change disc" --
 * replaces it (`sourceKey`); the served tree is kept per base URL. A source holds only `Blob`s: nothing to close.
 * Workers trust a request: the page checked it once with `openDisc` before posting it.
 */
export interface SourceCache {
  (request: SourceRequest): AssetSource;
  /** The source last handed out, before the mod hook. Null until a request. */
  raw(): AssetSource | null;
}

export function sourceCache(env?: ExtractEnv): SourceCache {
  let disc: { key: string; source: AssetSource } | null = null;
  const served = new Map<string, AssetSource>();
  let last: AssetSource | null = null;
  const lookup = (request: SourceRequest): AssetSource => {
    // The mod hook (`./mods/override`). No mods: `applyOverrideSource` returns the source it was given, and a file
    // read is that reader's own method. The test room is what installs a table (`./mods/panel`).
    if (request.kind === 'http') {
      let made = served.get(request.baseUrl);
      if (!made) served.set(request.baseUrl, (made = assetSourceFor(request)));
      last = made;
      return applyOverrideSource(made);
    }
    const key = sourceKey(request);
    if (!disc || disc.key !== key) disc = { key, source: assetSourceFor(request, env) };
    last = disc.source;
    return applyOverrideSource(disc.source);
  };
  return Object.assign(lookup, { raw: () => last });
}

/**
 * Opens and checks a disc on the page, once, before any request for it reaches a worker. An image: `IsoAssetSource`,
 * then the size of `probe` -- one directory walk, the check the front end has always made (`openFrontEndImage`), its
 * `SYSTEM.CNF` not read. A folder: `DirectoryAssetSource`, then `discIdentity` (DA.R8: `SYSTEM.CNF` names
 * a release of SOCOM II, `SOCOM2_RELEASES`, checked before any other read), then the same probe. Resolving means the disc is ready; a rejection
 * carries the reader's own words (`not an ISO9660 image ...`, `this disc boots ...`, `disc folder: no ...`), the one
 * error shape both kinds share.
 */
export async function openDisc(request: DiscOpen, probe: string): Promise<OpenedDisc> {
  if (request.kind === 'iso') {
    const source = new IsoAssetSource(request.file);
    await source.size(probe);
    return { source, identity: null };
  }
  const source = folderSource(request.entries);
  const identity = await discIdentity(source);
  await source.size(probe);
  return { source, identity };
}
