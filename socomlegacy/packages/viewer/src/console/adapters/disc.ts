import { discIdentity, type AssetSource } from '@s2u/archive';
import type { DiscExtractRecord, ExtractEnv, ExtractionState } from '../../discExtract';
import { extractionState, storedExtraction } from '../../discExtractRecord';
import type { ExtractBackend } from '../../discExtractStore';
import { canPickDiscFolder, pickDiscFolder, type PickerScope } from '../../discMemory';
import { folderRequestFromInput, noteKeptDisc, openFrontEndDisc, openFrontEndImage, watchDiscPrompt } from '../../discPrompt';
import { assetSourceFor, discLabel, discName, type DirRequest, type DiscRequest, type SourceRequest } from '../../discSource';
import { EVICTED_LINE, discForStart, runExtraction, storedRequestOf, type ExtractPopover, type RunDeps } from '../../discStart';
import { sameIdentity } from '../../discStored';
import { publishDiscImage } from '../../modern/discImage';
import { onDiscChange, publishDisc, readDisc } from '../../modern/discStore';
import type { ExtractAct, ExtractView } from '../render/extract';
import type { Adapters, DiscSource, DiscState } from '../state';

/**
 * The console launcher's disc (slice 2, part a): the visitor's own SOCOM II image, chosen by the Disc item or the
 * legend's chip (a file picker) or dropped on the window, opened in this page by the reader the setup page uses
 * (`../../discPrompt` `openFrontEndImage`: a 2048-byte-sector ISO9660 image holding `RUN/UI/READERC.ZAR`, read by range
 * and never uploaded; it also keeps the opened `File` for the replay viewer, `openedDiscImage`). Its state goes into the
 * page's disc store (`../../modern/discStore`, per Document: `reading`, `ready`, `error`) and the opened source into
 * `../../modern/discImage` -- the two writes `../../pageEntry` `offerDisc` makes -- and is read back from them, so the
 * modern readers (`launcherState`, `discAssets`) see this page's disc. The picker and the drop are `watchDiscPrompt`'s
 * (the setup page's own events: the input's `change`, the document's drag and drop, `body.disc-over`) over a hidden
 * `input#disc-page-file` this adapter adds to the page. Nothing is remembered: the next visit asks again. A browser
 * adaptation with no original (OT.R28).
 *
 * CX-10a (the console plan's CX-10, first half; the disc-access lane's DA-4 / DA-7 plumbing): a disc in a drive, a
 * mounted image or a copy of the disc's files, chosen as a folder (`chooseFolder`) -- by the browser's folder picker
 * where it has one (`../../discMemory` `canPickDiscFolder` / `pickDiscFolder`; the handle is not kept: remembering the
 * disc is CX-10b's) or else by a hidden `input#disc-page-folder` with `webkitdirectory` this adapter adds beside the
 * image's (`../../discPrompt` `folderRequestFromInput`) -- or dropped on the window (`watchDiscPrompt`'s `onFolder`,
 * `folderRequestFromDrop`). Each is opened by `openFrontEndDisc` exactly where the image goes (DA.R8: its `SYSTEM.CNF`
 * first), its states published into the same store under the folder's own name (`../../discSource` `discName`), its
 * refusal kept in the reader's words. START hands it on as the image's (`./launch`: `openedDiscRequest`).
 *
 * CX-16 (CX.R9, the owner: "Only one needs/should be active to launch"): one source is active (`source`), the image's
 * until another is set (`setSource`, the dropdown beside Home's Disc action); the console's Disc action opens only its
 * chooser. A disc chosen any way -- picked, dropped -- makes its own kind the source. Setting the source opens and closes
 * nothing: the disc open stays the disc (and START's) until a new one is chosen. `label` names the image too now
 * (`discLabel`: `the disc image <file>`).
 *
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6, FI.R7), with `extraction` given (the
 * page's adapters give it; absent, the adapter is as it was): the disc's read set kept in this browser (`../../discExtract`).
 * - **On load**, the kept extraction's state (`extractionState`): `whole`, the disc is ready from storage -- the store
 *   says `ready` under `KEPT_DISC_TITLE`, the published source is the stored one -- and START hands on `{ kind: 'stored' }`
 *   with no chooser and no prompt; `none` or `partial`, the chooser asks as before; `evicted`, the same with one line
 *   (`EVICTED_LINE`, the Disc item's `note`).
 * - **A disc chosen and validated** while the state is not `whole`: the popover (the overlay `extract`, drawn from
 *   `extract()`; its presses back through `extractAct`) runs `extractDisc` over it (`../../discStart` `runExtraction`,
 *   the extraction imported at that first need). Cancel keeps what is done; retry resumes; "Continue from the disc"
 *   closes it, and START hands on the disc's own request as before; done, the disc is ready from storage. A disc refused
 *   (another disc, files missing) closes into CHECK DISC with its words.
 * - **Already `whole`, a disc chosen anyway**: the same disc (`SYSTEM.CNF`'s identity) is not needed -- storage is used,
 *   and the Disc item says so -- and it stays open as the fallback of the movies the read set cuts; another disc is
 *   extracted as a new extraction, which replaces the old.
 * - START's disc is `discForStart`'s (`start`), through this adapter's own seams. Options' "Delete the kept disc"
 *   (`./options`) is `forgetKept`.
 */

/** The hidden picker's container (the input is `#disc-page-file`, as `watchDiscPrompt` reads it). */
export const DISC_PICKER_ID = 'cx-disc-picker';

export type LiveDisc = Adapters['disc'] & {
  error(): string; hold(on: boolean): void; dispose(): void;
  chooseFolder(): Promise<boolean>; kind(): 'image' | 'folder' | null; label(): string;
  source(): DiscSource; setSource(src: DiscSource): void;
  /** DX-3: the extraction's popover view, or null when none is shown. */
  extract(): ExtractView | null;
  /** DX-3: the popover's answer (`../render/extract` `extractPress`'s act, or a click). */
  extractAct(act: ExtractAct): void;
  /** DX-3: one line about the kept disc for the Disc item ('' none). */
  note(): string;
  /** INVITE-START (FI.R8 b): an extraction is running, from the pick until it ends and its outcome is published. */
  extracting(): boolean;
  /** DX-3: whether START reads from storage now. */
  stored(): boolean;
  /** DX-3: what is kept (any extraction recorded, whole or not), for Options; null when nothing is. */
  kept(): { bytes: number; backend: ExtractBackend; whole: boolean } | null;
  /** DX-3: deletes the kept disc (`deleteExtraction`); the disc open on this visit, if any, stays open. */
  forgetKept(): Promise<void>;
  /** DX-3: START's disc (`../../discStart` `discForStart`), or absent without `extraction`. */
  start?: () => Promise<SourceRequest>;
  /** Resolves once the load's read of the kept extraction is done. */
  loaded(): Promise<void>;
  /**
   * DSH-4 (the disc share plan, DSH.R4): a copy received whole from another device (`../../discShare`), its record
   * written in the extraction's form, taken as the load takes a kept extraction: re-read, and `whole` -> ready from
   * storage. A browser adaptation.
   */
  adoptKept(): Promise<void>;
};

/** DX-3: the disc's name while it is read from storage (the plan's words). */
export const KEPT_DISC_TITLE = 'Your disc, kept in this browser';
/** DX-3's review F5: the Disc item's line when a disc chosen is refused while a disc is kept whole. */
export const keptRefusal = (name: string, words: string): string =>
  `${name} could not be read (${words}); the game still starts from the disc kept in this browser.`;

/** DX-3: the line when the disc chosen is the one kept already. */
export const KEPT_NOT_NEEDED = 'This disc is already kept in this browser, so it is not needed: the game starts from storage.';

/** The hidden folder input's id (beside `#disc-page-file`, in the same hidden container). */
export const DISC_FOLDER_INPUT_ID = 'disc-page-folder';

export interface DiscDeps {
  /** The reader; absent, the page's (`openFrontEndImage`). */
  open?: (file: File) => Promise<AssetSource>;
  /** A folder's reader; absent, the page's (`openFrontEndDisc`, a `{ kind: 'dir' }` request). */
  openFolder?: (request: DirRequest) => Promise<AssetSource>;
  /** The window's pickers (`../../discMemory` `PickerScope`); absent, the browser's. */
  scope?: PickerScope;
  /**
   * DX-3: the extraction (the page's adapters give `{}`: the browser's storage); absent, none -- the adapter is as it was
   * before DX-3 (the console's tests of the disc alone). `state` stands in for `extractionState` (a test's).
   */
  extraction?: RunDeps & { state?: (env: ExtractEnv) => Promise<ExtractionState> };
}

export function liveDisc(doc: Document, notify: () => void, deps: DiscDeps = {}): LiveDisc {
  const open = deps.open ?? openFrontEndImage;
  const openFolder = deps.openFolder ?? openFrontEndDisc;
  let host = doc.getElementById(DISC_PICKER_ID);
  if (!host) {
    host = doc.createElement('div');
    host.id = DISC_PICKER_ID;
    host.hidden = true;
    const input = doc.createElement('input');
    input.type = 'file';
    input.id = 'disc-page-file';
    // Leave the picker unfiltered: iOS can grey out ISOs for unrecognised accept types.
    // openFrontEndImage validates the contents after selection, independently of filename/MIME.
    input.tabIndex = -1;
    host.append(input);
    doc.body.append(host);
  }
  const picker = host;
  // The folder's chooser where the browser has no folder picker: `webkitdirectory` as the markup attribute and as the
  // element's property (the browsers that read either).
  let folderInput = picker.querySelector<HTMLInputElement>(`#${DISC_FOLDER_INPUT_ID}`);
  if (!folderInput) {
    folderInput = doc.createElement('input');
    folderInput.type = 'file';
    folderInput.id = DISC_FOLDER_INPUT_ID;
    folderInput.setAttribute('webkitdirectory', '');
    (folderInput as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    folderInput.tabIndex = -1;
    picker.append(folderInput);
  }
  const folderPick = folderInput;
  let latest: object | null = null;
  // Every disc chosen -- picked, dropped, or a folder picker pressed -- takes the next number; a folder still being walked
  // (the picker's handle, a dropped folder's entries) is opened only if nothing newer was chosen meanwhile (CX-10a's
  // review: the newest choice wins). The image input's change and the drop are counted here too, as `watchDiscPrompt`'s
  // own `handed` counts them, so the folder input's change counts against a dropped folder's walk.
  let choice = 0;
  let kind: 'image' | 'folder' | null = null;
  let label = '';
  let source: DiscSource = 'image';
  let words = '';
  // From START's press until Back: no image is taken (the picker and the drop ignored), as `../../pageEntry` `offerDisc`
  // detaches its prompt at the launch -- the image START was pressed for is the one mounted (the slice-3 review).
  let held = false;
  let waiters: ((ok: boolean) => void)[] = [];
  const settle = (ok: boolean): void => { const w = waiters; waiters = []; for (const f of w) f(ok); };

  // DX-3: the kept extraction. `kept` is the whole one START reads from; `recorded` any record (Options' delete);
  // `present` the disc open on this visit when it is the kept one (the cut movies' fallback); `opened` the last disc read.
  const extraction = deps.extraction;
  const { env = {} }: { env?: ExtractEnv } = extraction ?? {};
  let kept: DiscExtractRecord | null = null;
  let recorded: DiscExtractRecord | null = null;
  let present: DiscRequest | null = null;
  let opened: { request: DiscRequest; source: AssetSource; filename: string } | null = null;
  let note = '';
  let view: ExtractView | null = null;
  let answer: ((act: ExtractAct) => void) | null = null;
  // INVITE-START: the runs under way, counted from `extractNow` until each one's outcome is published (the popover shows
  // only after the extraction's import, and the disc is `ready` from the disc meanwhile: the auto-START waits for this).
  let running = 0;
  const popover: ExtractPopover = {
    show(v) { view = v; notify(); },
    close() { view = null; notify(); },
    onAct(listener) { answer = listener; return () => { if (answer === listener) answer = null; }; },
  };
  const publishKept = (): void => {
    if (!kept) return;
    label = KEPT_DISC_TITLE;
    publishDiscImage(doc, assetSourceFor(storedRequestOf(kept, present), env));
    publishDisc(doc, { state: 'ready', filename: KEPT_DISC_TITLE });
    noteKeptDisc(() => (kept ? storedRequestOf(kept, present) : null));   // LATER 322: Watch's frame takes the kept copy
  };
  const reRecord = (): Promise<void> => storedExtraction(env.records).then((r) => { recorded = r; }, () => undefined);
  const loaded = extraction ? (async () => {
    const state = await (extraction.state ?? extractionState)(env);
    await reRecord();
    if (state === 'whole' && recorded && !opened && readDisc(doc).state !== 'reading') { kept = recorded; publishKept(); }
    else if (state === 'evicted') note = EVICTED_LINE;
    notify();
  })().catch(() => undefined) : Promise.resolve();

  /** DX-3: the extraction of `request` behind the console's popover, the disc ready from the disc meanwhile. */
  const extractNow = (request: DiscRequest): void => {
    kept = null;
    present = null;
    running++;
    void runExtraction(request, popover, extraction ?? {}).then(async (out) => {
      await reRecord();
      if (opened?.request !== request) return;                  // a newer disc was chosen meanwhile
      if (out.kind === 'done') { kept = out.record; recorded = out.record; present = request; note = ''; publishKept(); }
      else if (out.kind === 'close') {                          // the disc refused (F4): not this disc
        words = out.error instanceof Error ? out.error.message : String(out.error);
        opened = null;
        publishDiscImage(doc, null);
        publishDisc(doc, { state: 'error', filename: readDisc(doc).filename, refusal: words });
      }
      notify();
    }, () => { notify(); }).finally(() => { running--; notify(); });
  };

  /** DX-3: a disc read and validated: kept already (the same disc), or extracted. */
  const afterRead = async (request: DiscRequest, source: AssetSource): Promise<boolean> => {
    if (kept) {
      const id = await discIdentity(source).catch(() => null);
      if (id && sameIdentity(id, kept.identity)) { present = request; note = KEPT_NOT_NEEDED; publishKept(); return true; }
    }
    note = '';
    extractNow(request);
    return false;
  };

  /** Reads one chosen disc (`token` the image's `File` or the folder's request): the newest chosen wins. */
  const read = (token: object, filename: string, opening: () => Promise<AssetSource>, request?: DiscRequest): void => {
    latest = token;
    words = '';
    publishDiscImage(doc, null);
    publishDisc(doc, { state: 'reading', filename });
    opening().then(async (source) => {
      if (latest !== token) return;
      if (request) opened = { request, source, filename };
      if (extraction && request && (await afterRead(request, source))) { if (latest === token) settle(true); return; }
      if (latest !== token) return;
      publishDiscImage(doc, source);
      publishDisc(doc, { state: 'ready', filename });
      settle(true);
    }, (e: unknown) => {
      if (latest !== token) return;
      publishDiscImage(doc, null);
      words = e instanceof Error ? e.message : String(e);
      publishDisc(doc, { state: 'error', filename, refusal: words });   // MU2-8: the words for the modern UI's reader too
      // DX-3's review F5: a disc kept whole still starts the game; the refusal is said on the Disc item's line.
      if (kept) { note = keptRefusal(filename, words); publishKept(); }
      notify();                                               // the words change even when the state does not
      settle(false);
    });
  };
  // DX-3's review F2: while the extraction's popover is up (a run, its refusal, its end), no disc is taken: a second run
  // beside the first would write the same store, and Circle could stop only the newer.
  const busy = (): boolean => held || view !== null;
  const offer = (file: File): void => {
    if (busy()) return;
    choice++;
    kind = 'image';
    source = 'image';
    const request: DiscRequest = { kind: 'iso', file };
    label = discLabel(request);
    read(file, file.name, () => open(file), request);
  };
  const offerFolder = (request: DirRequest): void => {
    if (busy()) return;
    choice++;
    kind = 'folder';
    source = 'folder';
    label = discLabel(request);
    read(request, discName(request), () => openFolder(request), request);
  };
  const onFolderPick = (): void => {
    const request = folderRequestFromInput(folderPick.files);
    folderPick.value = '';                                    // the same folder chosen again still fires
    if (request && picker.isConnected) offerFolder(request);
  };
  folderPick.addEventListener('change', onFolderPick);
  // A folder dropped on the window goes where a dropped image goes (DA-4's `onFolder`): named by its own name, nothing kept.
  // The drop is numbered when it lands (this listener is added before `watchDiscPrompt`'s, so it runs first), and its
  // walked folder is opened only if it is still the newest choice.
  let dropped = 0;
  const onDropSeen = (e: DragEvent): void => {
    if (picker.isConnected && Array.from(e.dataTransfer?.types ?? []).includes('Files')) dropped = ++choice;
  };
  doc.addEventListener('drop', onDropSeen);
  const detach = watchDiscPrompt(doc, picker, offer, (request) => { if (dropped === choice) offerFolder(request); });
  const next = (): Promise<boolean> => new Promise<boolean>((resolve) => { waiters.push(resolve); });
  const unsubscribe = onDiscChange(doc, () => { notify(); });

  const forgetKept = async (): Promise<void> => {
    const { deleteExtraction } = await import('../../discExtract');
    await deleteExtraction(env);
    kept = null;
    recorded = null;
    present = null;
    note = '';
    if (readDisc(doc).state === 'ready' && readDisc(doc).filename === KEPT_DISC_TITLE) {
      // The disc open on this visit, if any, stays the disc; else the chooser asks again.
      if (opened) {
        label = discLabel(opened.request);
        publishDiscImage(doc, opened.source);
        publishDisc(doc, { state: 'ready', filename: opened.filename });
      } else {
        label = '';
        publishDiscImage(doc, null);
        publishDisc(doc, { state: 'empty', filename: null });
      }
    }
    notify();
  };

  const adoptKept = async (): Promise<void> => {
    if (!extraction) return;
    const state = await (extraction.state ?? extractionState)(env).catch((): ExtractionState => 'none');
    await reRecord();
    if (state === 'whole' && recorded) { kept = recorded; present = null; note = ''; publishKept(); }
    notify();
  };

  return {
    adoptKept,
    extract: () => view,
    extractAct(act: ExtractAct): void { answer?.(act); },
    note: () => note,
    extracting: () => running > 0,
    stored: () => kept !== null && readDisc(doc).filename === KEPT_DISC_TITLE,
    kept: () => (recorded ? {
      bytes: recorded.files.reduce((n, f) => n + (f.done ? f.size : 0), 0), backend: recorded.backend,
      whole: kept !== null,
    } : null),
    forgetKept,
    loaded: () => loaded,
    ...(extraction ? {
      // START's disc: storage when whole (with the disc open on this visit, when it is the kept one); else the disc open
      // now, which the player chose to go on from (the console extracts at the pick, so START is never the first ask).
      start: (): Promise<SourceRequest> => discForStart(doc, {
        ...extraction,
        // DX-3's review F1: with a disc open on this visit and no kept extraction that is current (another disc's being
        // replaced, stopped before its record went), START is that disc's, never the stored state's older disc.
        state: async (e) => (kept || !opened ? (extraction.state ?? extractionState)(e) : 'none'),
        remember: false,                                          // the console keeps its own state (F6 is the invite's)
        popover,
        present: () => present,
        chooser: {
          choose: async () => {
            if (opened && readDisc(doc).state === 'ready') return { request: opened.request, fromDisc: true };
            throw new Error('Choose your disc first: Cross on Play, or the disc mark.');
          },
        },
      }),
    } : {}),
    state(): DiscState {
      const s = readDisc(doc).state;
      return s === 'in-game' ? 'ready' : s;
    },
    title: () => readDisc(doc).filename ?? 'your disc image',
    error: () => (readDisc(doc).state === 'error' ? words : ''),
    kind: () => kind,
    label: () => label,
    source: () => source,
    setSource(src: DiscSource): void { source = src; },
    hold(on: boolean): void { held = on; },
    choose(): Promise<boolean> {
      if (busy()) return Promise.resolve(false);
      const answer = next();
      picker.querySelector<HTMLInputElement>('#disc-page-file')?.click();
      return answer;
    },
    chooseFolder(): Promise<boolean> {
      if (busy()) return Promise.resolve(false);
      if (!canPickDiscFolder(deps.scope)) {
        const answer = next();
        folderPick.click();
        return answer;
      }
      // The picker is asked now, in the press's own event (`pickDiscFolder` calls it before its first await); a cancel
      // answers false and changes nothing; a failure of the picker itself rejects with the browser's words (the grammar
      // says them). Once it answers a folder, the walk of its entries reads READING under the folder's name (so a second
      // press waits for it), and its request is opened only if nothing newer was chosen meanwhile; a walk that fails is
      // the error state in the browser's words.
      const mine = ++choice;
      const scope: PickerScope = deps.scope ?? (globalThis as unknown as PickerScope);
      let walking: object | null = null;
      const watched: PickerScope = {
        showDirectoryPicker: (options) => scope.showDirectoryPicker!.call(scope, options).then((handle) => {
          if (mine === choice && !busy()) {
            walking = handle;
            latest = handle;
            words = '';
            kind = 'folder';
            source = 'folder';
            label = '';
            publishDiscImage(doc, null);
            publishDisc(doc, { state: 'reading', filename: handle.name });
          }
          return handle;
        }),
      };
      return pickDiscFolder(watched).then((chosen) => {
        if (!chosen || busy() || mine !== choice || chosen.request.kind !== 'dir') return false;
        const answer = next();
        offerFolder(chosen.request);
        return answer;
      }, (e: unknown) => {
        if (!walking) throw e;                                  // the picker's own failure: nothing was published
        if (latest === walking) {
          words = e instanceof Error ? e.message : String(e);
          publishDisc(doc, { state: 'error', filename: readDisc(doc).filename, refusal: words });   // MU2-8
          notify();
        }
        return false;
      });
    },
    dispose(): void {
      answer?.('cancel');                                        // an extraction under way stops; what is done is kept
      detach();
      doc.removeEventListener('drop', onDropSeen);
      folderPick.removeEventListener('change', onFolderPick);
      unsubscribe();
      picker.remove();
      settle(false);
    },
  };
}
