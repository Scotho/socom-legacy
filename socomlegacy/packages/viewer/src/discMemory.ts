import type { FailureReport } from '@s2u/card';
import type { DiscIdentity } from '@s2u/archive';
import type { DiscEntry, DiscRequest } from './discSource';
import { storedCopy } from './discCopy';
import { DISC_HANDLE_SLOT, pageRecords, pageReport, type RecordStore } from './pageStore';

/**
 * **Remembering the disc between visits** (disc-access plan `docs/plans/2026-10-11-disc-access.md`, DA-7; research 306
 * §3). Where the browser has the File System Access API (Chrome and Edge on the desktop, Chrome on Android; not Firefox
 * nor Safari), the disc is chosen as a `FileSystemHandle` -- a file handle for an image, a directory handle for a
 * drive, a mounted image or a folder -- and the handle is kept in the page's IndexedDB through `./pageStore` (the only
 * module naming browser storage). On the next visit the handle's permission is read, and DA.R5's order says what the
 * launcher does first (`startOrder`). The `<input type=file>` stays the chooser where the API is absent.
 *
 * A **browser adaptation** (DA.R2) with no original: the original reads its own disc. Nothing here changes what the
 * game reads: a remembered handle gives the same `DiscRequest` a pick gives (`discRequestFromHandle`), read by the same
 * readers (`./discSource`). Nothing leaves the player's machine (DA.R3).
 *
 * **User activation.** `requestDisc` asks the browser's permission prompt, which a browser shows only inside a user
 * activation -- a click, a key or a touch (HTML's activation-triggering events). **A pad press is not one** (research
 * 306 §3; `startupNavigation.ts` ~232 moves the pad off the file input for the same reason). So `requestDisc` is called
 * from the launcher's own click / key / touch handler for "Continue with <name>", synchronously in that event, and
 * nothing here tries to work around it. The pickers (`pickDiscImage`, `pickDiscFolder`) need an activation likewise. A
 * start with no activation at all (a handle granted "on every visit", opened from the pad) leaves audio suspended: DA.R9
 * puts the launcher's one step before it, which is the launcher's row (CX-10), not this module's.
 *
 * This module has no control of its own: the console launcher's row CX-10 calls it.
 */

/** A remembered disc's permission: the browser's three states, or `gone` -- its file or directory no longer resolves. */
export type DiscPermission = 'granted' | 'prompt' | 'denied' | 'gone';

/** The calls of a `FileSystemHandle` this module uses (the permission calls are WICG's, not yet in TypeScript's DOM). */
interface HandleCalls {
  readonly name: string;
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  isSameEntry?(other: DiscHandle): Promise<boolean>;
}
/** An image's handle (`FileSystemFileHandle`). */
export interface DiscFileHandle extends HandleCalls {
  readonly kind: 'file';
  getFile(): Promise<File>;
}
/** A drive's, a mounted image's or a folder's handle (`FileSystemDirectoryHandle`; `values()` is its async iterator). */
export interface DiscDirectoryHandle extends HandleCalls {
  readonly kind: 'directory';
  values(): AsyncIterable<DiscHandle>;
}
/** A disc's handle: an image or a folder. */
export type DiscHandle = DiscFileHandle | DiscDirectoryHandle;

/**
 * What is remembered beside the handle: the name the launcher says ("Continue with <name>"), the kind, and the identity
 * DA-2's `discIdentity` read from a folder's `SYSTEM.CNF` (boot name, `VER`, `VMODE`) -- null for an image, whose
 * `SYSTEM.CNF` the page does not read (`./discSource` `openDisc`).
 */
export type DiscMeta = { readonly name: string; readonly kind: 'image' | 'folder'; readonly identity: DiscIdentity | null };

/** A remembered disc. */
export type RememberedDisc = { readonly handle: DiscHandle; readonly meta: DiscMeta };

/** The record in `DISC_HANDLE_SLOT`. `v` is this record's own version, ours: a later shape bumps it. */
type DiscRecord = { v: 1; handle: DiscHandle; meta: DiscMeta };

/** The meta of a handle the page has just opened: its name and kind, and the identity `openDisc` read (or null). */
export function discMeta(handle: DiscHandle, identity: DiscIdentity | null): DiscMeta {
  return { name: handle.name, kind: handle.kind === 'file' ? 'image' : 'folder', identity };
}

/**
 * Remembers `handle` (an image's or a folder's) with its meta, in place of any disc remembered before. Called once the
 * disc has opened (`openFrontEndDisc` resolved), so only a disc the readers accepted is kept. Answers whether it was
 * stored: false when the browser will not keep it (no IndexedDB, a refusal, the quota), the failure handed to the
 * page's report -- the disc still plays this visit. A meta whose kind is not the handle's is a programming error.
 */
export async function rememberDisc(
  handle: DiscHandle, meta: DiscMeta, store: RecordStore = pageRecords(), report: FailureReport = pageReport,
): Promise<boolean> {
  if ((handle.kind === 'file') !== (meta.kind === 'image')) throw new TypeError(`a ${handle.kind} handle remembered as kind ${meta.kind}`);
  const record: DiscRecord = { v: 1, handle, meta: { name: meta.name, kind: meta.kind, identity: meta.identity } };
  try {
    await store.put(DISC_HANDLE_SLOT, record);
    return true;
  } catch (e) {
    report(e as Parameters<FailureReport>[0]);
    return false;
  }
}

/** The remembered disc, or null: none, or a record of another shape (nothing this version wrote). */
export async function rememberedDisc(store: RecordStore = pageRecords()): Promise<RememberedDisc | null> {
  const record = await store.get(DISC_HANDLE_SLOT);
  if (!isRecord(record)) return null;
  return { handle: record.handle, meta: record.meta };
}

/** Forgets the remembered disc ("Forget this disc"; a gone one). The browser's own permission grant is the browser's. */
export async function forgetDisc(store: RecordStore = pageRecords()): Promise<void> {
  try { await store.delete(DISC_HANDLE_SLOT); } catch (e) { pageReport(e as Parameters<FailureReport>[0]); }
}

function isRecord(value: unknown): value is DiscRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<DiscRecord>;
  const h = r.handle as Partial<DiscHandle> | undefined;
  const m = r.meta as Partial<DiscMeta> | undefined;
  return r.v === 1 && !!h && (h.kind === 'file' || h.kind === 'directory') && typeof h.name === 'string'
    && !!m && typeof m.name === 'string' && (m.kind === 'image' || m.kind === 'folder');
}

const isNotFound = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'NotFoundError';

/**
 * The read permission of `handle`, without a prompt (`queryPermission({ mode: 'read' })`): `granted`, `prompt` (the
 * browser will ask, inside a user activation: `requestDisc`) or `denied`. A granted handle is then tried -- an image's
 * `getFile()`, a folder's first entry -- and one whose file or directory no longer resolves (`NotFoundError`: the image
 * moved or deleted, the drive empty, the image unmounted) is `gone`, and, when it is the remembered disc, forgotten.
 * Only a granted handle can be tried (a read without permission is refused, not "not found"), so a lapsed handle whose
 * entry is also gone reads `prompt` until it is granted. A handle with no `queryPermission` reads `denied`. Any other
 * error of the query or the read is thrown (`readStartState` catches it, and carries it as its `reason`). **Unmeasured:**
 * which error Chromium raises for an ejected drive or an unmounted image -- `NotFoundError`, another `DOMException`, or
 * none, the drive's letter answering an empty directory (which reads `granted` here and is refused when it is opened,
 * `discIdentity` finding no `SYSTEM.CNF`, DA.R8). DA-10's run by hand records it.
 */
export async function discPermission(handle: DiscHandle, store: RecordStore = pageRecords()): Promise<DiscPermission> {
  let state: PermissionState;
  try {
    if (typeof handle.queryPermission !== 'function') return 'denied';
    state = await handle.queryPermission({ mode: 'read' });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await forgetIfRemembered(handle, store);
    return 'gone';
  }
  if (state !== 'granted') return state === 'prompt' ? 'prompt' : 'denied';
  try {
    if (handle.kind === 'file') await handle.getFile();
    else await handle.values()[Symbol.asyncIterator]().next();
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await forgetIfRemembered(handle, store);
    return 'gone';
  }
  return 'granted';
}

/** Forgets the remembered disc when it is `handle`'s entry (`isSameEntry`; the very object when that is absent). */
async function forgetIfRemembered(handle: DiscHandle, store: RecordStore): Promise<void> {
  const remembered = await rememberedDisc(store);
  if (!remembered) return;
  let same = remembered.handle === handle;
  if (!same && typeof remembered.handle.isSameEntry === 'function') {
    try { same = await remembered.handle.isSameEntry(handle); } catch { same = false; }
  }
  if (same) await forgetDisc(store);
}

/**
 * Asks the browser for read permission on `handle` (`requestPermission({ mode: 'read' })`) and answers the state it
 * leaves. **Call it only inside a user activation** -- the launcher's click, key or touch handler for "Continue with
 * <name>", before anything awaits -- or the browser refuses to prompt; a pad press is not an activation (research 306
 * §3, DA.R9). This module does not work around that. A handle with no `requestPermission` reads `denied`.
 */
export async function requestDisc(handle: DiscHandle): Promise<'granted' | 'prompt' | 'denied'> {
  if (typeof handle.requestPermission !== 'function') return 'denied';
  const state = await handle.requestPermission({ mode: 'read' });
  return state === 'granted' ? 'granted' : state === 'prompt' ? 'prompt' : 'denied';
}

/**
 * The `DiscRequest` a handle gives, for `openFrontEndDisc` (`./discPrompt`) and the workers: an image's handle is `{
 * kind: 'iso', file }` over its `File`; a folder's is a `{ kind: 'dir' }` request from a walk of its entries (`values()`,
 * recursively), each path rooted at the handle's own name -- the shape a directory pick's `webkitRelativePath` and a
 * dropped folder's walk give (DA-4; `DirectoryAssetSource` strips the root name, `discName` names the disc by it). The
 * walk is ordered: each directory's entries by name (UTF-16 code units), depth first, so the same disc gives the same
 * request (and `sourceKey`) whatever order the browser lists it in. Needs read permission (`discPermission` granted).
 */
export async function discRequestFromHandle(handle: DiscHandle): Promise<DiscRequest> {
  if (handle.kind === 'file') return { kind: 'iso', file: await handle.getFile() };
  return { kind: 'dir', entries: await walkHandle(handle, handle.name) };
}

async function walkHandle(dir: DiscDirectoryHandle, at: string): Promise<DiscEntry[]> {
  const children: DiscHandle[] = [];
  for await (const child of dir.values()) children.push(child);
  children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out: DiscEntry[] = [];
  for (const child of children) {
    const path = `${at}/${child.name}`;
    if (child.kind === 'file') out.push({ path, file: await child.getFile() });
    else out.push(...await walkHandle(child, path));
  }
  return out;
}

/** A disc chosen through the API: its handle (to remember) and its request (to open). */
export type PickedDisc = { readonly handle: DiscHandle; readonly request: DiscRequest };

/** The window's pickers (WICG File System Access; absent in Firefox and Safari). */
export interface PickerScope {
  showOpenFilePicker?(options: {
    multiple: boolean;
    excludeAcceptAllOption?: boolean;
    id?: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<DiscFileHandle[]>;
  showDirectoryPicker?(options: { id?: string; mode: 'read' }): Promise<DiscDirectoryHandle>;
}

/**
 * The File System Access picker's type hint: `.iso`. HTML file inputs are unfiltered for iOS compatibility;
 * both paths still use the same disc readers. Widening the supported format (`.bin`, a 2048-byte-sector image under
 * another extension) is the owner's call, asked in the plan's Log (DA-7's review, Q1), not taken here.
 */
export const DISC_IMAGE_TYPES = [{ description: 'Disc image', accept: { 'application/octet-stream': ['.iso'] } }];
/** The pickers' `id`: the browser reopens each where the last disc was chosen. Ours, chosen. */
export const DISC_PICKER_ID = 's2u-disc';

const browserScope = (): PickerScope => globalThis as unknown as PickerScope;

/** Whether `pickDiscImage` can ask (else the `<input>` chooses). */
export function canPickDiscImage(scope: PickerScope = browserScope()): boolean {
  return typeof scope.showOpenFilePicker === 'function';
}
/** Whether `pickDiscFolder` can ask (else the `<input webkitdirectory>` chooses). */
export function canPickDiscFolder(scope: PickerScope = browserScope()): boolean {
  return typeof scope.showDirectoryPicker === 'function';
}

const isAbort = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';

/**
 * Asks for one disc image (`showOpenFilePicker`, `DISC_IMAGE_TYPES`), inside a user activation. Answers its handle and
 * request; null where the API is absent (`canPickDiscImage` false: the `<input>` is the chooser) or when the player
 * cancels. Any other failure is thrown, for the launcher to say.
 */
export async function pickDiscImage(scope: PickerScope = browserScope()): Promise<PickedDisc | null> {
  if (!canPickDiscImage(scope)) return null;
  let handles: DiscFileHandle[];
  try {
    handles = await scope.showOpenFilePicker!({ multiple: false, id: DISC_PICKER_ID, types: DISC_IMAGE_TYPES });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  const handle = handles[0];
  return handle ? { handle, request: await discRequestFromHandle(handle) } : null;
}

/**
 * Asks for a drive, a mounted image or a folder (`showDirectoryPicker`, read only), inside a user activation. Answers
 * its handle and `{ kind: 'dir' }` request; null where the API is absent or when the player cancels; any other failure
 * thrown. The request is not checked here: `openFrontEndDisc` checks its `SYSTEM.CNF` (DA.R8).
 */
export async function pickDiscFolder(scope: PickerScope = browserScope()): Promise<PickedDisc | null> {
  if (!canPickDiscFolder(scope)) return null;
  let handle: DiscDirectoryHandle;
  try {
    handle = await scope.showDirectoryPicker!({ id: DISC_PICKER_ID, mode: 'read' });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  return { handle, request: await discRequestFromHandle(handle) };
}

/**
 * A dropped item's handle (`DataTransferItem.getAsFileSystemHandle()`) and its request, so a dropped disc can be
 * remembered as a picked one is. Null where the API is absent (the drop goes the DA-4 way: `./discPrompt`
 * `folderRequestFromDrop` or the dropped `File`), or for an item that is not a file or folder. The handle is asked for
 * synchronously, before this function's first await -- call it in the drop's own event: the item is gone once it
 * returns.
 */
export async function handleFromDrop(item: DataTransferItem | null | undefined): Promise<PickedDisc | null> {
  const asHandle = (item as { getAsFileSystemHandle?: () => Promise<DiscHandle | null> } | null | undefined)?.getAsFileSystemHandle;
  if (typeof asHandle !== 'function') return null;
  const pending = asHandle.call(item);
  const handle = await pending;
  if (!handle || (handle.kind !== 'file' && handle.kind !== 'directory')) return null;
  return { handle, request: await discRequestFromHandle(handle) };
}

/**
 * Whether a stored copy is kept (DA-8): `DISC_COPY_SLOT` holds a record `./discCopy` `copyDisc` wrote, after the copy
 * was verified (`storedCopy`; a record of another shape is none). The record alone is read, so the start is not slowed
 * by a walk of the copy; a copy the browser evicted is found at the open (`storedCopyRequest` answers null and clears
 * the record), and the caller reads `readStartState` again: DA.R5's next step follows -- the remembered disc, else the
 * chooser.
 */
export async function hasStoredCopy(store: RecordStore = pageRecords()): Promise<boolean> {
  return (await storedCopy(store)) !== null;
}

/** What the launcher knows at start, for `startOrder`. */
export type StartState = {
  /** A stored copy is kept (DA-8; `hasStoredCopy`). */
  readonly copy: boolean;
  /** The remembered disc's meta, or null. */
  readonly remembered: DiscMeta | null;
  /** Its permission (`discPermission`), or null when nothing is remembered, the copy goes first, or it was not read. */
  readonly permission: DiscPermission | null;
  /**
   * Why the remembered disc's permission or entry could not be read -- the error's name and message, for the launcher
   * (CX-10) to say beside the chooser -- or null. When set, `permission` is null and `startOrder` answers `choose`; the
   * disc stays remembered (the error may pass: a drive spinning up, an image remounted).
   */
  readonly reason: string | null;
};

/** What the launcher does first (DA.R5). */
export type StartStep = 'copy' | 'open' | 'continue' | 'choose';

/**
 * **DA.R5's order at start**, pure: a stored copy (DA-8) if one is kept -- `copy`; else a remembered disc whose
 * permission is granted without a prompt -- `open` (`discRequestFromHandle`, then `openFrontEndDisc`); else a
 * remembered disc whose permission must be asked -- `continue`: the launcher shows "Continue with <name>" and calls
 * `requestDisc` in that control's click, key or touch (a pad press cannot answer it, research 306 §3); else -- nothing
 * remembered, denied, gone, or not read (`reason`) -- `choose`, the chooser as today. No UI: the launcher's row (CX-10) draws it, and DA.R9's
 * audio step stands before an `open` or `copy` reached from the pad.
 */
export function startOrder(state: StartState): StartStep {
  if (state.copy) return 'copy';
  if (state.remembered && state.permission === 'granted') return 'open';
  if (state.remembered && state.permission === 'prompt') return 'continue';
  return 'choose';
}

/**
 * Reads the state `startOrder` takes: the copy's slot first (when one is kept, no handle is touched), then the
 * remembered disc and its permission (a gone one forgotten, `discPermission`). **Never rejects**: an error other than
 * `NotFoundError` from the handle's query or read -- which errors Chromium raises for an ejected drive or an unmounted
 * image is unmeasured, recorded by DA-10's run by hand -- answers `permission: null` with the error as `reason`, so the
 * start is `choose` and the launcher can say why; an error of the store's own reads answers the chooser likewise.
 */
export async function readStartState(store: RecordStore = pageRecords()): Promise<StartState> {
  const why = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  let remembered: RememberedDisc | null;
  try {
    if (await hasStoredCopy(store)) return { copy: true, remembered: null, permission: null, reason: null };
    remembered = await rememberedDisc(store);
  } catch (e) {
    return { copy: false, remembered: null, permission: null, reason: why(e) };
  }
  if (!remembered) return { copy: false, remembered: null, permission: null, reason: null };
  try {
    return { copy: false, remembered: remembered.meta, permission: await discPermission(remembered.handle, store), reason: null };
  } catch (e) {
    return { copy: false, remembered: remembered.meta, permission: null, reason: why(e) };
  }
}
