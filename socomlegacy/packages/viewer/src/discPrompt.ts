import type { AssetSource, IsoAssetSource } from '@s2u/archive';
import {
  dirRequest, droppedFolder, openDisc, type DirRequest, type DiscOpen, type DiscRequest, type HandedDiscRequest, type StoredRequest,
} from './discSource';
import { FRONT_END_FILES } from './frontEnd';
import { noteDiscSource } from './pwa/fileDisc';

/**
 * The disc page under `menuflow` (OT.R14 in `docs/plans/2026-10-02-online-path-target.md`; the owner, 2026-10-03
 * ~13:30Z: "We need to read everything from the disk from the iso as a rule, devmode is just a convenience"; web
 * research 148). Without `?devmode` the front end reads the visitor's own disc image, as the map viewer does
 * (`./source`, the owner's rule of 2026-09-29): the page keeps `index.html`'s `#disc-page` -- its heading, its file
 * input `#disc-page-file`, its status line `#disc-state`, styled as it is (`styles.css` "The disc page") -- and the
 * whole window is a drop target, the way `./ui` `Ui.onDisc` makes it for the viewer (the same events, the same
 * `body.disc-over` light); `Ui` itself is the viewer's page object and is not loaded under `menuflow` (`./pageEntry`).
 * The image is opened by `@s2u/archive`'s `IsoAssetSource`, the reader the viewer's worker uses (`./discSource`
 * `sourceCache`), in this page's thread, read by range and never uploaded; a picked folder (DA-3) likewise by
 * `DirectoryAssetSource`. Nothing is remembered: as the disc page says,
 * "the next visit asks for it again" (the viewer keeps no image either).
 *
 * A browser adaptation: the page's wiring, nothing of the game.
 */

/**
 * Opens the visitor's disc for the front end (`./discSource` `openDisc`, DA-3), refused in the reader's own words. An
 * image: `IsoAssetSource` over it, refused when it is not a 2048-byte-sector ISO9660 image (`not an ISO9660 image ...`)
 * or holds no `RUN/UI/READERC.ZAR`, the front end's first dialog archive (`FRONT_END_FILES.dialogs`; `ISO: no
 * RUN/UI/READERC.ZAR on the disc image`). A picked folder: `DirectoryAssetSource` over its entries, refused when its
 * `SYSTEM.CNF` boots no release of SOCOM II (`discIdentity`'s words, DA.R8) or it holds no `RUN/UI/READERC.ZAR`. One
 * directory walk (or `SYSTEM.CNF` and a size) and no other file's bytes: the front end reads the rest as it needs it.
 */
export async function openFrontEndDisc(request: DiscOpen): Promise<AssetSource> {
  const call = ++opening;
  opened = null;                                            // a newer disc being read: none handed until it opens
  kept = null;                                              // LATER 322: nor the kept copy, until the console notes it again
  const { source } = await openDisc(request, FRONT_END_FILES.dialogs[0]);
  // MU-11 and the console's hand-over take the disc as a request (DA-4; DA-3's review F2): a folder's as it was picked, an
  // image's as `{ kind: 'iso' }` over its `File` (a bare `Blob` has no name to hand on).
  if (call === opening) {
    opened = request.kind === 'dir' ? request : request.file instanceof File ? { kind: 'iso', file: request.file } : null;
    if (opened) noteDiscSource(opened);
  }
  return source;
}

/** `openFrontEndDisc` for an image: `IsoAssetSource` over it, exactly as before DA-3 (`./discSource` `openDisc`, iso). */
export async function openFrontEndImage(file: Blob): Promise<IsoAssetSource> {
  return await openFrontEndDisc({ kind: 'iso', file }) as IsoAssetSource;
}

/** The calls of `openFrontEndDisc`, and the disc the last of them opened (MU-11; DA-4). */
let opening = 0;
let opened: DiscRequest | null = null;

/**
 * MU-11 (the modern replay viewer, MU.R9): the disc the last `openFrontEndDisc` opened, as its request -- the image's
 * `{ kind: 'iso' }` or a picked or dropped folder's `{ kind: 'dir' }` (DA-4; DA-3's review F2) -- or null while a newer
 * disc is read or after one is refused; in this page's memory only, never stored ("nothing is remembered" holds across
 * visits). The replay viewer hands it to the game page it frames for the match's world (`./modern/replays/worldStage`),
 * so the visitor is not asked for the disc a second time, and the console's START hands it to the front end
 * (`./console/adapters/launch`); the viewer's own lock (the setup page's disc `ready`) decides whether it is asked at
 * all. A browser adaptation.
 */
export function openedDiscRequest(): DiscRequest | null {
  return opened;
}

/**
 * LATER 322 (issue #454; the owner, 2026-10-22: "the replay requests the ISO again despite it already being provided on
 * the page"): the copy kept in this browser that the console started from, as its request -- noted by the console's disc
 * adapter each time it publishes the kept copy as the disc (`./console/adapters/disc` `publishKept`), read through its
 * getter so it answers null once the adapter no longer keeps it (Options' delete, another disc extracted), and cleared
 * when another disc is opened (`openFrontEndDisc`; the console notes it again if the kept copy stays the disc). Memory
 * only. `noteKeptDisc(null)` clears it.
 */
let kept: (() => StoredRequest | null) | null = null;

/** LATER 322: notes the kept copy the console publishes as the disc (its getter), or clears the note (null). */
export function noteKeptDisc(getter: (() => StoredRequest | null) | null): void {
  kept = getter;
}

/**
 * LATER 322: the disc the replay viewer hands the test room it frames (`./modern/replays/worldStage`): the disc the last
 * `openFrontEndDisc` opened (`openedDiscRequest`, an image or a folder), else the copy kept in this browser that the
 * console started from (`{ kind: 'stored' }`, `noteKeptDisc`), else null. A separate accessor: `openedDiscRequest` is
 * not widened -- the console's START hand-over (`./console/adapters/launch`), the launcher's facts and the forge expect
 * an image or a folder from it. A browser adaptation.
 */
export function replayDiscRequest(): HandedDiscRequest | null {
  return opened ?? kept?.() ?? null;
}

/** `openedDiscRequest`'s image: the `File` when the disc opened is an image, else null (a folder, or none). */
export function openedDiscImage(): File | null {
  return opened?.kind === 'iso' ? opened.file : null;
}

/**
 * DA-4 (a browser adaptation, DA.R2): the files of a directory pick -- an `<input type=file webkitdirectory>`'s `files`,
 * a disc in a drive, a mounted image or a copy of the disc's files -- as a `{ kind: 'dir' }` request (DA-3's
 * `dirRequest`: each file's `webkitRelativePath`, read now, while it is there), or null when nothing was picked. For the
 * launcher's folder chooser, which is the console launcher's to place (the controller's word, 2026-10-12): no control
 * on the old setup page calls it. `DirectoryAssetSource` strips the picked folder's own name (DA-1), and `discName`
 * names the folder by it, so the request keeps it.
 */
export function folderRequestFromInput(files: ArrayLike<File> | null | undefined): DirRequest | null {
  const picked = Array.from(files ?? []);
  return picked.length ? dirRequest(picked) : null;
}

/**
 * DA-4: a dropped `DataTransferItem` that is a folder, walked into a `{ kind: 'dir' }` request (`webkitGetAsEntry`, each
 * directory's `readEntries` called until it answers an empty batch; the dropped folder's own name first, as a pick's
 * paths have it) -- or null when it is not a folder or the browser has no `webkitGetAsEntry` (`./discSource`
 * `droppedFolder`). Call it in the drop's own event: the item is gone once the event returns.
 */
export function folderRequestFromDrop(item: DataTransferItem | null | undefined): Promise<DirRequest> | null {
  return droppedFolder(item);
}

/**
 * Hands every image the visitor picks on `#disc-page-file` or drops on the window to `onFile`, while `page` is in the
 * document (a page taken down stops answering). The events are `./ui` `Ui.onDisc`'s: the input's `change` (cleared so
 * the same image chosen again still fires), and the document's `dragover` / `dragleave` / `drop` of a drag carrying
 * files, lighting `body.disc-over` while one is over the window. Answers the detach.
 *
 * With `onFolder` (DA-4) a folder dropped on the window goes to it as a `{ kind: 'dir' }` request
 * (`folderRequestFromDrop`: walked after the drop, and handed on only if nothing newer was chosen or dropped meanwhile).
 * Without it -- the console's single "Choose disc", an image only -- a drop is an image's, as before.
 */
export function watchDiscPrompt(doc: Document, page: HTMLElement, onFile: (file: File) => void, onFolder?: (request: DirRequest) => void): () => void {
  const live = (): boolean => page.isConnected;
  const input = page.querySelector<HTMLInputElement>('#disc-page-file');
  let handed = 0;                                           // each pick or drop; a folder still being walked yields to a newer one
  const onChange = (): void => {
    handed++;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (file && live()) onFile(file);
  };
  const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const over = (on: boolean): void => { doc.body.classList.toggle('disc-over', on); };
  const onOver = (e: DragEvent): void => {
    if (!live() || !carriesFiles(e)) return;
    e.preventDefault();                                     // what makes the page a drop target at all
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    over(true);
  };
  const onLeave = (e: DragEvent): void => { if (e.relatedTarget === null) over(false); };
  const onDrop = (e: DragEvent): void => {
    if (!live() || !carriesFiles(e)) return;
    e.preventDefault();                                     // or the browser navigates to the dropped file
    over(false);
    const mine = ++handed;
    const folder = onFolder ? folderRequestFromDrop(e.dataTransfer?.items?.[0]) : null;
    if (folder) { void folder.then((request) => { if (mine === handed && live()) onFolder?.(request); }); return; }
    const file = e.dataTransfer?.files[0];
    if (file) onFile(file);
  };
  input?.addEventListener('change', onChange);
  doc.addEventListener('dragover', onOver);
  doc.addEventListener('dragleave', onLeave);
  doc.addEventListener('drop', onDrop);
  return () => {
    input?.removeEventListener('change', onChange);
    doc.removeEventListener('dragover', onOver);
    doc.removeEventListener('dragleave', onLeave);
    doc.removeEventListener('drop', onDrop);
    over(false);
  };
}

/** The disc page's status line (`#disc-state`), as `./ui` `Ui.setDiscState` writes it: the text, `is-bad` on a failure. */
export function setDiscState(page: HTMLElement, text: string, kind: 'ok' | 'error' = 'ok'): void {
  const line = page.querySelector<HTMLElement>('#disc-state');
  if (!line) return;
  line.textContent = text;
  line.classList.toggle('is-bad', kind === 'error');
}
