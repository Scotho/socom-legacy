# 306 -- Disc access: a real disc, a remembered disc, a shared disc

> Written 2026-10-11 (`date -u` 17:18Z) against `main` 59b8e5692, in the owner's research seat ("making the iso more
> accessible"). The plan it feeds: [`../plans/2026-10-11-disc-access.md`](../plans/2026-10-11-disc-access.md). Every
> item is a **browser adaptation**: the original reads its own disc in its own drive, so none of this has a source in
> the original and none of it may change what the game reads or does (MISSION, the parity rule).

Evidence kinds are kept apart: **[run]** = run on this host 2026-10-11; **[source]** = read in this repository's code;
**[published]** = a published document, cited with its date; **[inference]** = reasoning, not yet run.

## 1. Nothing at run time reads by sector

- [source] Every read the page makes goes by path: the front end's files (`packages/archive/src/frontEndFiles.ts`), the
  maps and the common archives (`mapIndex.ts` `COMMON_ARCHIVES`), the movies (`movieWorker.ts` `demuxPssFile(source,
  path)`), the VAGSTORE members (found through the archive's own index, then read by range within the file:
  `soundData.ts` ~588-599, `menuMusic.ts` ~162-173; `menuMusic.ts` ~103 counts sector words from VAGSTORE's first
  sector because "the served tree has no disc sectors").
- [source] `IsoAssetSource.extents()` / `fileAt()` / `extent()` are called only by tests and `tools/map-validation.ts`.
- [source] `DATA_SOURCES.md` ~149-150 and the `addressed: 'lbn'` tags in `frontEndFiles.ts` describe how the
  **original** addresses those files, not what this code does; a reader building a non-ISO source should not take them
  as a requirement.
- **Consequence:** any source that answers `list`, `size` and `readRange` (and `stream`) by path is enough. The one
  hard requirement is **range reads**: a source with `stream` only (the node `FsAssetSource`, `fsAssetSource.ts`
  ~47-52) silently loses the round's cues, which require `readRange` (`soundData.ts` ~579; `audio.test.ts` ~390, ~711).

## 2. A mounted image and a disc in a drive are the same files

- [run] `Mount-DiskImage -Access ReadOnly` of the retail image on this host gave a CDFS volume labelled `SOCOM_II`
  with **349 files, 4,375,813,752 bytes**; every path and size equals `tools_py/iso_lbn.py list` over the same image
  (the desktop tree's reference reader), but one: the extensionless `ENDER.` of the ISO9660 directory is `ENDER` on the
  mounted volume. Dismounted after. The largest files: `RUN/SOUNDS/VAGSTORE.ZAR` 576,593,920; `RUN/MOVIES/COMMON/
  MUSVID.PSS` 334,725,124; `ARTGALL2.PSS` 327,188,484; `CREDITS.PSS` 226,328,580.
- [inference] A pressed disc in a PC DVD drive is mounted by Windows the same way (ISO9660/UDF bridge), so a folder
  source over the drive's root reads the same bytes. Untested: no optical drive on this host.
- [published] Chromium's File System Access blocklist
  (`chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc`, main, read 2026-10-11) blocks
  system folders (Windows, Program Files, AppData, the profile), the home/Desktop/Documents/Downloads roots, admin
  shares, and any **parent** of a blocked folder; it has no rule for drive roots or removable media. [inference] So
  `C:\` is refused (it holds `C:\Windows`) and a disc's or a mounted image's letter should not be. Unrun.
- [inference] Throughput off a DVD drive is 10-20 MB/s: a 12 MB map in about a second; a movie streams below its own
  bitrate only on a slow drive. Unmeasured.
- Identity: `SYSTEM.CNF` is `BOOT2 = cdrom0:\SCUS_972.75;1`, `VER = 1.02`, `VMODE = NTSC` (roadmap `02-boot.md` B1),
  the check a folder source can make before anything else is read.

## 3. Remembering the disc between visits

- [source] Today nothing is kept, by design: `discPrompt.ts` header ("the next visit asks for it again"),
  `index.html` ~179 ("Choose the disc again next visit; only setup preferences are saved"); the startup-options plan
  ~142 and ~173 leave "remembered file handles" for later. Every thread opens its own `IsoAssetSource` over the same
  `File` (the page, the map worker, the movie worker, the taunt editor).
- [published] File System Access handles survive in IndexedDB; `requestPermission()` needs a **user activation**, and
  Chrome 122+ offers "Allow on every visit", after which the permission persists (developer.chrome.com, "Persistent
  permissions for the File System Access API", 2024-01-09). Supported on Chrome/Edge desktop (86+) and Android Chrome
  (132+, 2025-01); not Firefox (standards position negative, mozilla/standards-positions#154) nor Safari.
- [source] **A pad press is not a user activation** (HTML's activation-triggering events are keyboard, mouse and touch);
  this repository already relies on it (`startupNavigation.ts` ~232 moves the pad off the file input; `audio.ts` ~191).
  So a pad-only player cannot answer a permission prompt -- but can use a handle already granted "on every visit", and
  a copy in the origin's own storage needs no permission at all.
- [published] OPFS (`navigator.storage.getDirectory()`): Chrome/Edge up to 60% of the disk per origin, Firefox
  min(10% of disk, 10 GiB) per site (50% once `persist()` is granted, which Firefox asks the user), Safari 17+ about 60%
  and evicts unless persistent (MDN, "Storage quotas and eviction criteria", 2026-01-05). An OPFS file is read back as a
  `File` (`getFile()`), so **`IsoAssetSource` reads a copied image unchanged**.
- [inference] Copying 4.4 GB from a `File` into OPFS through a worker's `createSyncAccessHandle` should take one to a
  few minutes on an SSD. Unmeasured.
- Sizes for a copy [source + run]: the 22 maps about 224 MB; the front end and common archives a few tens of MB;
  VAGSTORE 577 MB; the movies about 1.8 GB (`tools/extractPlan.ts` ~8); the whole image 4,380,753,920 bytes.

- [source] **The one gesture, and the audio it unlocks** (the merge controller, 2026-10-11, from the online lane's
  VOICE-LATE: the owner's playtest heard voice seconds late because the playback `AudioContext` never ran). Today the
  disc's file picker is the only user activation the page is sure to get, and the voice fix creates or resumes its
  audio context inside it. A pad-only path that opens the disc with no picker -- a remembered handle granted "on every
  visit", or the stored copy -- reaches a match with **no activation at all**, so every `AudioContext` (the game's and
  the voice's) stays suspended (`audio.ts` ~191, ~300). So removing the picker removes the gesture as well. The pad-only
  path needs one click, key or touch before audio, or a visible "press to enable audio" step. The online lane
  (redotcom-8d) holds the mirror note; the two lanes agree on one mechanism.

## 4. Sharing a disc with another device on the LAN (not in the plan)

- [published] A web page cannot listen: the Direct Sockets API (`TCPServerSocket`) is for Isolated Web Apps only.
- [inference] The page-only path is a WebRTC data channel from the desktop tab (holding the `File`) to the other
  device's tab, signalled through our match server, with a ranged `AssetSource` on the far side answering `readRange`
  by request/reply. The robust path is a helper (the Node server) serving the image by HTTP `Range` on the LAN, which on
  an HTTPS page meets Chrome's Local Network Access prompt (Chrome 142, 2025-10-28; developer.chrome.com
  "local-network-access", 2025-06-09).
- [published, weak] Edge on Xbox is Chromium; the pad works after "Use game controls"; WebGPU had no adapter (2023);
  no published tab-memory limit. **The first step is a manual check that the game runs there at all**, before any
  transport. H51 makes the LAN launcher a developer tool; serving a player's disc to their other devices would change
  that, so it is the owner's call.

## 5. Other formats (not in the plan)

- [published] Play!.js (the PS2 emulator's web build) loads CSO and CHD in the browser. [inference] CSO/ZSO is a block
  index plus per-block deflate/LZ4 -- a ranged reader of about 100 lines with `DecompressionStream`; CHD needs libchdr
  in wasm. `IsoAssetSource` refuses raw 2352-byte images by name today.

## 6. DA-1/DA-2 as built

> Added 2026-10-11 on `agent/da-source` (tasks DA-1, DA-2 of the plan). **Reading, pending review** for the two
> disc facts below; the rest is a browser adaptation (DA.R2) with no source in the original. The tests were written
> first and are recorded run (RED, GREEN) in the task's report, not here.

- **`DirectoryAssetSource`** (`packages/archive/src/directoryAssetSource.ts`): a `RangedAssetSource` with `stream`
  (DA.R4) over `{ path, blob }` entries -- a picked folder's `File`s by `webkitRelativePath`, or `fs.openAsBlob` per
  file under node. Paths are named as `IsoAssetSource` names them (its `clean` / `normalise`, kept in step by copy:
  upper case, either slash, no `;1`, no bare trailing `.`, so `ENDER.` == `ENDER`, §2). The picked folder's own name is
  stripped when every entry carries it and it is not one of the disc's top-level directories; two entries naming one
  path are refused, naming both. `read` with progress, `readRange` and `stream` are each `Blob.slice`s, chunked by
  `ISO_READ_CHUNK` and checked by `streamExtent` exactly as the ISO source is; a range past the end is refused in the
  ISO source's words, prefixed `disc folder:` instead of `ISO:`.
- **`DISC_ROOT_DIRECTORIES` = `CNF`, `NETGUI`, `OVERLAY`, `RUN`** [source: the retail image's own list] -- the first
  segment of every path below the image's root (`IsoAssetSource(SOCOM_ISO).list()`, the 349 files of §2). Held by the
  dev-disc test of `test/directoryAssetSource.test.ts`, which derives the set from the image.
- **`discIdentity(source)`** (`packages/archive/src/discIdentity.ts`): reads `SYSTEM.CNF` only, parses `BOOT2`, `VER`,
  `VMODE` (CRLF or LF, spaces around `=` optional), and refuses a source without it ("not a PS2 disc's root"), one with
  no `BOOT2`, and a boot name that is none of **`SOCOM2_RELEASES`** (DA.R8 as amended 2026-10-28: every dumped
  retail release of SOCOM II, by redump.org's internal serials, no beta or demo; until then `SOCOM2_US_BOOT` = `SCUS_972.75` alone, roadmap
  `02-boot.md` B1, from `game/disc/SYSTEM.CNF`), naming what it found. `VER` / `VMODE` are null when absent; nothing
  refuses on them.
- **The dev tree is not the disc.** `SOCOM_DISC` (the desktop's extracted tree) holds 414 files on this host: the
  disc's 349 plus the desktop's own outputs -- the memory-card folders `mc0*` / `mc1` and their `*.personas.json`,
  `socom2_game.elf`, and `OVERLAY/REL/DNAS.blocks.json` / `DNAS.dec.bin` [run: a `find` over the tree, 2026-10-11].
  The dev-disc test sets those apart by name and requires every other path to equal the image's list; a folder source
  over a real disc or a mounted image has none of them (§2).
- Not built here: the page's picker and the wiring into the workers (DA-3); the ISO path keeps its present check.

## 7. DA-3 as built: one disc-source module

> Added 2026-10-12 on `agent/da-7` (DA-7's review, F3), after DA-3's review and merge into `agent/disc-access`
> (`fd72d1725`). A **browser adaptation** (DA.R2) with no original: the original reads its own disc by LBN; nothing
> here changes what the game reads. The plan's "DA-3's contract" and its Log entry of 2026-10-12 ~01:25Z hold the
> design and the differences from it.

- **What it does** [source]: `packages/viewer/src/discSource.ts` names a request's three kinds -- the served tree
  (`http`), the image (`iso`, a `File`) and a picked folder (`dir`, `{ path, file }` entries, the path read at the pick
  by `dirRequest`, because a posted `File` probably does not keep `webkitRelativePath`). `sourceCache()` is one per
  thread, shared by `worker.ts` and `movieWorker.ts`, keyed by `sourceKey` (the `File`s' name, size and modification
  time, never `discIdentity`); `assetSourceFor` makes `IsoAssetSource`, `DirectoryAssetSource` or `HttpAssetSource`.
  `openDisc(request, probe)` checks a disc once on the page before any worker sees it: an image by the probe's size, a
  folder by `discIdentity` (DA.R8) and then the probe. `discPrompt.ts` `openFrontEndDisc` takes both kinds;
  `openFrontEndImage` stays its image case.
- **Tests** [run, in DA-3's report]: `test/discSource.test.ts`, 17 cases, one of them dev-disc (`SOCOM_DISC` /
  `SOCOM_ISO`; skipped without them): the type-level check that `iso` and `http` are still `SourceRequest`s from
  `./worker`; the cache (the same `File` posted twice, a changed folder, a kind replacing another, one served tree per
  base URL, one cache per thread); a `dir` request loading the map index an `iso` one loads; `openDisc`'s refusals in
  the readers' words; that both workers take their sources from `sourceCache`.
- **Unmeasured**: whether a `File` posted to a worker keeps `webkitRelativePath` (assumed not; DA-6's browser test
  pins it); a folder source's read speed off a real drive (§2's 10-20 MB/s is an inference).

## 8. DA-4 as built: the folder plumbing

> Added 2026-10-12 on `agent/da-7` (DA-7's review, F3), after DA-4's review (`4ab233471`, PASS WITH FINDINGS; F-a,
> F-b, F-d closed in `c02a34829` and `6a79a4267`) and merge (`de9034e20`). A **browser adaptation** (DA.R2) with no
> original. The visible chooser is the console launcher's (the controller's scope, 2026-10-12); this is the plumbing
> under it.

- **What it does** [source]: `discPrompt.ts` `folderRequestFromInput(files)` turns a directory pick's files into a `dir`
  request (DA-3's `dirRequest`); `folderRequestFromDrop(item)` walks a dropped folder (`discSource.ts`
  `droppedFolder`: `webkitGetAsEntry`, each directory's `readEntries` until an empty batch, the folder's own name
  first). `watchDiscPrompt`'s `onFolder` opens a dropped folder where a dropped image goes; without it (the console's
  single "Choose disc") a drop is an image's as before. `/testroom`'s `openDisc` is `discSource.ts` `discOpener`: an
  image asked of the worker at once; a folder checked first (DA.R8), the older disc's index request forgotten, dropped
  if a newer disc or a map switch came meanwhile. The disc request opened last is handed on by `openedDiscRequest()`
  (the console's hand-over, the replay viewer's frame).
- **Tests** [run, in DA-4's reports]: `test/discPrompt.test.ts`, 17 cases (the input's paths; the drop's walk; a dropped
  folder mounting the front end, refused for another game; an image's drop unchanged; no folder control on the old setup
  page; `discOpener`'s order: an image at once, a folder after its check, a refusal, a late answer dropped, a map
  switch during or before the check), and DA-4's edits to `console/launch.test.ts`, `modern/replays/worldHost.test.ts`,
  `worldStage.test.ts`, `modes.test.ts` and `discSource.test.ts`.
- **Unmeasured**: a real directory pick and a real drop in a browser (Chromium's folder picker on a mounted image's
  drive letter, a drop from the file manager) -- DA-6's spec and rendered run; the words "the disc image holds no ...",
  still said for a folder at the three `isDiscRequest` sites, are DA-9's.

## 9. DA-7 as built: remembering the disc (the module)

> Added 2026-10-12 on `agent/da-7`; reviewed once (PASS WITH FINDINGS), its fix round's review pending. Nothing in it is
> transcribed from the original, so no confidence level of a game fact applies. A **browser adaptation** (DA.R2, DA.R3) with no original; its controls ("Continue with <name>", "Forget this
> disc", the pickers' buttons, DA.R9's audio step) are the console launcher's row CX-10.

- **What it does** [source]: `packages/viewer/src/discMemory.ts`. `rememberDisc(handle, meta)` keeps a
  `FileSystemHandle` (a file handle for an image, a directory handle for a folder) with its name, kind and DA-2's
  identity (null for an image) in `pageStore.ts`'s new records store (database `s2u.page`, slots `disc.handle` and
  `disc.copy`; pageStore stays the only module naming IndexedDB); `rememberedDisc()`, `forgetDisc()`.
  `discPermission(handle)` reads `queryPermission({ mode: 'read' })` -- `granted`, `prompt`, `denied` -- and tries a
  granted handle (an image's `getFile()`, a folder's first entry): `NotFoundError` is `gone`, and the remembered disc is
  forgotten when it is that entry (`isSameEntry`). `requestDisc(handle)` calls `requestPermission` and works only inside a
  click, key or touch (§3; not worked around). `discRequestFromHandle(handle)` gives the `iso` or `dir` request DA-3
  opens (a folder walked by name at each level, paths rooted at its name). `pickDiscImage()` (`.iso` only, as
  `#disc-page-file`), `pickDiscFolder()` and `handleFromDrop(item)` answer the handle and its request, null where the API
  is absent or the player cancels. `startOrder(state)` is DA.R5's order, pure: `copy`, `open`, `continue`, `choose`;
  `readStartState()` never rejects -- an error other than `NotFoundError` from the handle is `choose` with the error as
  the state's `reason`, for CX-10 to say.
- **Tests** [run, in DA-7's report]: `test/discMemory.test.ts` over fake-indexeddb and fake handles with a settable
  permission (remember, recall, forget; granted, prompt, denied; gone for an image and a folder, forgotten only when
  `isSameEntry` says it is the remembered entry; the request for a file and a nested folder, in name order, opened by
  `openDisc`; every branch of `startOrder`; `readStartState`'s reasons; the pickers and the drop with and without the
  APIs), and four cases of the records store in `test/pageStore.test.ts`. The handle's survival in IndexedDB is modelled
  (Node's `structuredClone` cannot copy a fake handle), not run.
- **Unmeasured** (DA-10's run by hand in Chrome): which error Chromium raises for an ejected drive or an unmounted image
  (`NotFoundError`, another `DOMException`, or an empty directory, which reads `granted` and is refused at the open by
  `discIdentity`); that a real handle survives a reload; "Allow on every visit" answering `granted` with no prompt.
- **Asked of the owner** (the plan's Log, DA-7's review Q1): whether the image picker should also accept `.bin`.

## 10. DA-8 as built: keeping a copy (the module)

> Added 2026-10-12 on `agent/da-8` (base `cd4b13954`, the lane with DA-3, DA-4 and DA-7); review pending. Nothing in it is
> transcribed from the original, so no confidence level of a game fact applies. A **browser adaptation** (DA.R2, DA.R3,
> DA.R6) with no original; its controls ("Keep a copy in this browser", its progress and cancel, "Delete the stored
> copy") are the console launcher's row CX-10, its words DA-9's.

- **What it does** [source]: `packages/viewer/src/discCopy.ts`. `copyDisc(request, hooks)` takes a disc the page has
  opened (an `iso` request's `File`, or a `dir` request's files), reads its identity (`discIdentity`, DA.R8) and the size
  of `RUN/UI/READERC.ZAR` (refused without either, before anything is written), checks
  `navigator.storage.estimate()` -- refused with the shortfall in bytes when the space left (the quota less the usage,
  plus the space a kept copy holds) is under the disc's size and `DISC_COPY_MARGIN` -- asks `persist()` (the answer
  recorded in the record, not required), deletes the kept copy and any partial a closed tab left (a directory another tab
  holds open stops the copy, saying so), and has the module worker `discCopyWorker.ts` write the disc into the page's origin private file system under `s2u.disc.copy/<boot>_<VER>_<VMODE>`
  (`disc.iso` for an image; a folder's files at the paths `DirectoryAssetSource` names them, so the picked folder's own
  name is stripped and the copy lists as the folder did). The worker opens each file's `createSyncAccessHandle()`, writes
  `DISC_COPY_CHUNK` bytes at a time, flushes each chunk, posts its progress, and reads a cancel between chunks; the
  page's `AbortSignal` posts that cancel (one pressed before the worker started is posted right after the copy, so it
  stops it before the first chunk), and the partial copy is removed once the worker has closed its handles. The loop
  and the messages are `discCopyProtocol.ts`, which has no side effect on import; the worker entry is the one file that
  serves its scope, loaded only by URL, so no other worker importing the page's modules answers a message of its own. The copy
  is then read back through the start path's own readers and verified -- the image's size (or every file's, and the
  list), its `SYSTEM.CNF`'s identity, and a SHA-256 of `RUN/UI/READERC.ZAR` equal to the disc's -- a difference removing
  the copy and naming what differed; then recorded in `pageStore.ts`'s `disc.copy` slot (`v`, kind, identity, size,
  files, directory, when, `persisted`). `storedCopyRequest()` gives the start path an `iso` request over the stored
  file's `getFile()` or a `dir` request over the stored files (what the workers are posted); `storedCopySource()` the
  source over it (`IsoAssetSource` / `DirectoryAssetSource`); a record whose directory the browser evicted is cleared and
  answers null, and the caller reads `readStartState()` again, DA.R5's next step following (the remembered disc, else
  the chooser). A request over the stored copy's own files (those `storedCopyRequest()` handed out) is refused by
  `copyDisc`, which would otherwise delete them before reading them. Every refusal and failure is a `DiscCopyError`
  (`refused`, `unavailable`, `quota`, `cancelled`, `mismatch`, `failed`), the readers' and the browser's words in its
  message. `deleteStoredCopy()` removes the record, then `s2u.disc.copy` whole.
  `discMemory.ts` `hasStoredCopy()` (DA-7's stub) now reads the record by its shape. `pageStore.ts`
  `pageOriginStorage()` names `navigator.storage`, so pageStore stays the only module naming the browser's storages
  (`pageStore.test.ts`'s scan now covers `navigator.storage`). Nothing reaches the network (DA.R3; a test holds both
  modules to it).
- **The adaptation values** [source], ours, with no original and so no `*_PLACEHOLDER`: `DISC_COPY_CHUNK` = 8 MiB (about
  520 writes for the 4,380,753,920-byte image, §3; a cancel waits one chunk) and `DISC_COPY_MARGIN` = 256 MiB (the
  page's other origin data, and `estimate()`'s rounding). Chosen, not measured against other sizes.
- **Tests** [run, in DA-8's report]: `test/discCopy.test.ts` over a fake origin private file system (directory and file
  handles, a fake sync access handle with short writes and a corruptible byte), a fake `navigator.storage` and a fake
  worker running `serveDiscCopy` in-process, over the committed fixture `RUN/UI/READERC.ZAR` (skipped, and said, without
  it): the chunk loop (chunks, flushes, short writes, a cancel between chunks, every handle closed); an image and a
  folder (two files, one nested) copied and verified; the refusals (another disc, no `READERC.ZAR`, the quota with its
  shortfall, no OPFS, a folder naming one path twice, the stored copy itself); a cancel mid-copy, before the start and
  during the setup; a records store failing its read or its delete, and a kept copy another tab holds open (each a
  `DiscCopyError`); the protocol module's import leaving the scope untouched; the mismatches (`READERC.ZAR` in an image and a folder,
  `SYSTEM.CNF`'s `VER`); a replacement; the stored copy's source listing and reading as the original for both kinds; an
  evicted copy; `hasStoredCopy`, `readStartState` and `deleteStoredCopy`. `discMemory.test.ts`'s copy case writes a
  whole record.
- **Unmeasured** (DA-10's spec and run by hand): the copy's time for the whole image (§3's "one to a few minutes" is an
  inference); a real `FileSystemFileHandle` posted to the worker and its sync access handle in Chromium, Firefox and
  Safari; whether a browser grants `persist()` without asking (Firefox asks the player); a build's bundling of the worker
  (the same `new Worker(new URL(...))` form as `worker.ts`, held by a source check, not built here).
