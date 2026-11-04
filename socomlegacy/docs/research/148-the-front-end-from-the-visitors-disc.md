# 148 -- The front end from the visitor's disc (FE-ISO, OT.R14)

Written 2026-10-03 for FE-ISO, on the owner's rule of that day (~13:30Z, verbatim: "We need to read everything from the
disk from the iso as a rule, devmode is just a convenience"; recorded by the controller as OT.R14 in
`../plans/2026-10-02-online-path-target.md`). Sources: the page's own modules, read for this change and cited by file
-- `packages/viewer/src/pageEntry.ts` (OT.R12's entry, research 129 §7), `frontEnd.ts` (PLAT-10's mount, research 115),
`source.ts` (the owner's rule of 2026-09-29: the visitor's disc by default), `ui.ts` (`onDisc`, `offerDisc`,
`hideDiscPage`, `setDiscState`), `main.ts` (`openDisc`), `worker.ts` and `movieWorker.ts` (`SourceRequest`, `sourceFor`),
`index.html` (`#disc-page`), `styles.css` ("The disc page") -- and `@s2u/archive`'s `IsoAssetSource`
(`packages/archive/src/isoAssetSource.ts`). Nothing of the game is read or changed here: this is the page's wiring, **a
browser adaptation**, and every file the front end reads is the one its own module already names.

The code: `packages/viewer/src/discPrompt.ts` (new: `openFrontEndImage`, `watchDiscPrompt`, `setDiscState`),
`packages/viewer/src/pageEntry.ts` (`bootPage` under `menuflow` without a served tree), `packages/viewer/src/frontEnd.ts`
(`mountFrontEnd` takes the image). The tests: `packages/viewer/test/entry.test.ts`, `packages/viewer/test/frontEndWiring.test.ts`,
one changed case in `packages/viewer/test/frontEnd.test.ts`, the browser spec `packages/viewer/e2e/menuflowIso.spec.ts`.
Confidence: none of the game's values is touched, so no level applies to the change itself; the browser run is a
rendered run sampled for luma, not a score.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R148.1 | Under `menuflow` without `?devmode` the page keeps `index.html`'s `#disc-page` (its heading, lede, card with `#disc-pick` / `#disc-page-file` / `#disc-state`, the notice), shows it, and removes every other element of the body; the whole window is the drop target | `pageEntry.ts` `clearPage` / `offerDisc`; `discPrompt.ts` `watchDiscPrompt` | §1 |
| R148.2 | The image is opened by `IsoAssetSource` in the page's thread and refused in the reader's words when it is not an ISO9660 image or lacks `RUN/UI/READERC.ZAR`; the opened source is the front end's `assets`, and the request handed to `mountFrontEnd` is the worker's `{ kind: 'iso', file }` | `discPrompt.ts` `openFrontEndImage`; `pageEntry.ts` | §2 |
| R148.3 | Every file class the front end reads today goes through that one `AssetSource`, so all of them come off the image: dialogs, scripts, fonts, the loader's RAW screens, the texture banks and captions, the UI sounds, `UiParams.rdr` | `frontEnd.ts` `mountFrontEnd`, `readFrontEndDisc` | §3 |
| R148.4 | The movies are the one class not read yet in either mode (`MOVIE_SOURCE_PLACEHOLDER`, black); the movie worker already takes `{ kind: 'iso', file }`, so MOVIE-WIRE hands it the `source` argument `mountFrontEnd` now receives | `movieWorker.ts` `sourceFor`; `frontEnd.ts` | §4 |
| R148.5 | `?devmode&menuflow` is unchanged: the served tree, no disc page, mounted at once | `pageEntry.ts` | §1 |
| R148.6 | Nothing is remembered: the viewer keeps no image (the disc page says "Nothing is kept either: the next visit asks for it again"), so neither does the front end | `index.html` `#disc-page` | §1 |

## 1. The page under `menuflow` (R148.1, R148.5, R148.6)

Before this change `bootPage` emptied the body under `menuflow` (OT.R12, research 129 §7) and `mountFrontEnd` refused
any source but the served tree (`if (!source || source.kind !== 'http')`: "the front end reads the served disc tree:
open the page with ?devmode&menuflow"). Since the deployed site hosts no game data (RS.R8), the public page could not
reach the menus at all.

Now `bootPage` asks `./source` `startSource` as before. With `?devmode` it is the served tree and nothing changes: every
element removed, `ps2-look`, `mountFrontEnd(search, { kind: 'http', baseUrl }, document)`. Without it:

- **What stays**: `main#disc-page` and everything inside it -- `#disc-title`, the kicker and lede, the card with
  `#disc-pick` (the label styled as a tab) holding `#disc-page-file` (`accept=".iso"`), the status line `#disc-state`
  ("waiting for a disc image"), and the notice ("Nothing is uploaded ..."). Its `hidden` attribute is cleared, as
  `Ui.offerDisc` clears it. It is styled by the rules it already has (`styles.css` "The disc page": full window, z-index
  3, `body.disc-over` lights its edge and card); no stylesheet or class was added.
- **What goes**: the rest of the body, exactly as under OT.R12 -- `#view`, `#site-links`, `#fps`, `#toast`,
  `#fullscreen`, `#loading`, `#panel` (with the panel's own `#disc-file` input), `#controls`, `#touch`, `#mobile-tip`.
  The body takes `ps2-look` (black behind the front end's frame once it mounts).
- **The words are the viewer's**: the lede reads "SOCOM II multiplayer maps" and the notice "only the map archives
  under RUN/". They are not rewritten here (`index.html` is a hot file and the brief keeps the page as styled); a
  wording of the front end's own is the owner's or the controller's call.
- **The listener** is `./ui` `Ui.onDisc`'s, re-made in `discPrompt.ts` (`Ui` is the viewer's page object, loaded only
  with `./main`; `ui.ts` is a hot file and was not touched): the file input's `change` (the input cleared so the same
  image chosen again still fires), the document's `dragover` / `dragleave` / `drop` of a drag carrying files, lighting
  `body.disc-over`. It answers only while `#disc-page` is in the document and is detached once an image opens.
- **The status line** says what `main.ts` `openDisc` says ("reading the disc image NAME ..."), and a refusal as the
  worker's `doing` and the reader's message ("failed while reading the disc image NAME: ..."), with `is-bad` as
  `Ui.setDiscState` sets it. A refused image leaves the page up for another; when two are chosen in a row the last wins.
- **Remembered image**: none. The viewer does not remember one (no storage of the `File` anywhere in `main.ts`, `ui.ts`
  or `pageStore.ts`; the disc page says so), so there is nothing to honour. The virtual card is unchanged
  (`localStorage`, PLAT-26a's store).

## 2. Opening the image (R148.2)

`openFrontEndImage(file)` makes `new IsoAssetSource(file)` -- the class `worker.ts` and `movieWorker.ts` make in their
`sourceFor` -- and asks it for `RUN/UI/READERC.ZAR`'s size (`FRONT_END_FILES.dialogs[0]`): the Primary Volume Descriptor
and the walk down `RUN/UI/`, no file's bytes. It refuses with the reader's own words: "not an ISO9660 image ..." (a
raw 2352-byte image named as such), or "ISO: no RUN/UI/READERC.ZAR on the disc image" for another game's image. The
same source, already walked, is then handed to `mountFrontEnd` as `assets`, with the request `{ kind: 'iso', file }`;
the disc page is removed first. The image is read in the page's thread, by range (`Blob.slice`), never uploaded --
the map viewer reads it in its worker because its decodes are heavy; the front end's reads are the same few files it
read over HTTP, which were already on the page's thread.

`mountFrontEnd` itself, handed `{ kind: 'iso', file }` without `assets`, makes its own `IsoAssetSource` over the file;
`null` now says "the front end reads your SOCOM II disc image (.iso): open it on the page (or the served tree with
?devmode)".

## 3. Each class off the image (R148.3)

Every read below was already through `mountFrontEnd`'s one `assets`; nothing in them knew the served tree
(`frontEndAssets.ts`, `uiSoundHost.ts`, `softKeyboardKeys.ts` make no `fetch` and name no URL):

| class | files | reader |
|---|---|---|
| dialogs | `RUN/UI/READERC.ZAR`, `RUN/UI/READERX.ZAR` | `readFrontEndDisc` (`FRONT_END_FILES.dialogs`) |
| scripts | `RUN/UIZANIM.ZAR` | `readFrontEndDisc` |
| fonts | `RUN/READERC.ZAR` `fonts.rdr` | `readFrontEndDisc` (`FONTS_RDR`) |
| the loader's screens | `RUN/RAW/PULOADGP.RAW`, `RUN/RAW/LOADING.RAW` | `readLoaderImages` (BOOT-02) |
| captions | the locale tables under `RUN/LOCALE/` (`loadLocService`) | `pageCaptions` (ONL-01, research 144 §5) |
| bitmaps | `RUN/UI/<STEM>_TXR.ZED` / `_PAL.ZED`, `RUN/MP2.ZDB`'s `FONT_TXR` / `FONT_PAL` | `pageUiTextures` (`UI_TEXTURE_BANKS_READING`) |
| UI sounds | `RUN/SOUNDRDR.ZAR`, `HUDUI.bnk` out of `RUN/SOUNDS/BNKSTORE.ZAR`, `RUN/UI/READERC.ZAR`'s `uisounds.rdr` | `pageUiSounds` (PLAT-23, `uiSoundHost.ts`) |
| the soft keyboard | `RUN/UI/READERC.ZAR`'s `UiParams.rdr` | `readUiParams` (PLAT-17) |
| the virtual card | `localStorage` | unchanged |

The browser run (§5) saw no request under `maps/` from `/?menuflow` through the opener and through LOGIN.

## 4. The movies, and what MOVIE-WIRE does (R148.4)

The front end's movies are black in both modes (`MOVIE_SOURCE_PLACEHOLDER`, unchanged here). MOVIE-WIRE (on
`agent/movie-wire`) connects PLAT-19c's `MovieWorkerSource` and PLAT-20's sound into `mountFrontEnd`. For it to read
from the image:

- **The pictures**: post the movie worker the `source` argument `mountFrontEnd` receives, as it is -- under `menuflow`
  without `?devmode` it is now `{ kind: 'iso', file }`, with `?devmode` `{ kind: 'http', baseUrl }`. `movieWorker.ts`
  `sourceFor` already makes an `IsoAssetSource` for the iso kind and keeps it across requests (keyed by name, size and
  modification time), as `e2e/movieRealtime.spec.ts` drives it from `SOCOM_ISO`. Nothing should be built from
  `baseUrl` alone or assume the http kind.
- **The sound** (PLAT-20's demuxed audio), if read on the page's thread: from `mountFrontEnd`'s `assets` (the
  `IsoAssetSource` the disc page opened), never a new `HttpAssetSource`.
- The `File` crosses to the worker by structured clone as a handle, not a copy (`worker.ts`'s note on `SourceRequest`).

## 5. The evidence

- **Unit (jsdom)**, `packages/viewer/test/entry.test.ts`: under `?menuflow` the disc prompt kept and shown, the rest of
  the chrome gone, nothing mounted until a file; a file chosen -> `openDisc` with it, `mountFrontEnd(search, { kind:
  'iso', file }, document, { assets })` with the opened (fake) source, the disc page removed; a dropped file the same; a
  refused file said in the reader's words with `is-bad`, the next one opens; `?devmode&menuflow` unchanged.
  `openFrontEndImage` refuses a non-ISO and an ISO without `RUN/UI/READERC.ZAR` in the reader's words and opens a built
  image of the fixtures' `RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR`. End to end over that built image through the
  real front end: `dlgNetLogin.rdr` boots off the image's `READERC.ZAR`, `READERX.ZAR` is reported missing in the ISO
  reader's words (so the reads went to the image), `fetch` is never called, `main` never imported.
- **Unit (jsdom)**, `packages/viewer/test/frontEndWiring.test.ts`: `mountFrontEnd` with `{ kind: 'iso', file }` and a
  fake `assets` makes its session from those assets; with no `assets`, from `IsoAssetSource` over the built image.
- **Rendered browser run**, `packages/viewer/e2e/menuflowIso.spec.ts` on the retail image (`SOCOM_ISO`), 2026-10-03,
  port 5370, the lock FREE: `/?menuflow` shows `#disc-page` alone, no request under `maps/` in 3 s; after
  `setInputFiles(SOCOM_ISO)` the loader's screens draw (mean luma 2.77 at the first sample, phases `PULOADGP fade out`,
  `PULOADGP fade in`, `LOADING fade out`) and `__frontEnd.events` carry `dlgIntroScreen.rdr`; `/?menuflow=dlgNetLogin.rdr`
  after opening the image runs LOGIN (`currentName` `dlgNetLogin.rdr`, the path `/main/online`, mean luma 24.52 after
  2 s); no request under `maps/`, no page error; `/?devmode&menuflow` reads `maps/RUN/UI/READERC.ZAR` with no disc page.
  4 passed; `menuflow.spec.ts` 2 passed and `iso.spec.ts` 4 passed beside it. Not a score: LOGIN's score is research
  144's, over the served tree.

## 6. Placeholders and readings

None added or changed. The one this change touched in passing, `MOVIE_SOURCE_PLACEHOLDER` (retired 2026-10-03 by MOVIE-WIRE; it was `packages/viewer/src/frontEnd.ts`,
research 120 §11), stays open and is MOVIE-WIRE's (§4).

| name | stands for | status |
|---|---|---|
| `MOVIE_SOURCE_PLACEHOLDER` (`packages/viewer/src/frontEnd.ts`) | the front end's movie pictures, black until PLAT-19c's worker source is handed in; from the image once MOVIE-WIRE posts the `{ kind: 'iso', file }` request (§4) | open (research 120 §11 holds it) -- retired 2026-10-03 at the merge: MOVIE-WIRE's worker source (`frontEndMovies.ts`, research 120 §11) replaced it and reads the image as this note asks |

## 7. Settled, not settled, owed

- Settled: the front end runs from the visitor's image without `?devmode`; the disc page under `menuflow`; the served
  tree under `?devmode&menuflow` unchanged.
- Not settled: the disc page's words are the map viewer's (§1); a front-end wording is a call for the owner or the
  controller. A large image's first open costs one directory walk; not measured beyond the browser run's few seconds.
- Owed: the movies from the image (MOVIE-WIRE, §4); the roadmap block for this task (none exists in
  `../roadmap/01-platform.md`; the controller adds it).
