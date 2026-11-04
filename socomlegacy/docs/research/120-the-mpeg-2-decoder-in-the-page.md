# 120 -- The MPEG-2 decoder in the page: the core, the worker, the conversion, the texture, the full movies (PLAT-19b)

Written 2026-10-02 for task PLAT-19b (the block is `../roadmap/01-platform.md` "PLAT-19b"; web sprint 9's plan
`../plans/2026-10-02-web-sprint-9-screens-widgets.md`, stream "mpeg", ruling W9.R5 gives this note its number).
Sources: research 98 §7 (PLAT-19a's record: the build, the glue, the epsilon, the IPU's conversion), research 109
(PLAT-18's demuxer), research 121 (what PLAT-21's player asks of a picture source); the disc tree (`SOCOM_DISC`) and
the retail image (`SOCOM_ISO`), read through `@s2u/archive`; ffmpeg 8.1 (`8.1-full_build-www.gyan.dev`), one thread;
emcc 6.0.10 and the pinned libmpeg2 0.5.1 tarball of research 98 §7.1; headless Chromium through Playwright. No disc
bytes, pictures or hashes of them are copied here; the numbers are counts and differences.

The code: `packages/fmv/src/decodeEngine.ts`, `decodeStream.ts`, `decodeProtocol.ts`, `ipuCsc.ts` (one index line,
`decode.ts`), `packages/fmv/wasm/glue.c` and `build.sh`; `packages/viewer/src/movieWorker.ts`, `movieTexture.ts` and
`vite.config.ts`; `tools/fmvShip.ts`, `tools/fmvPlanes.ts`, `tools/fmvStream.ts`, `tools/fmv-spike.ts`. The tests:
`packages/fmv/test/decodeStream.test.ts`, `decodeProtocol.test.ts`, `ipuCsc.test.ts` (CI, a fake decoder over
synthetic streams), `decodeWasm.test.ts` (the built wasm; the disc for two of its three), `tools/test/fmvShip.test.ts`,
`fmvSpike.test.ts`, `fmvStream.test.ts`, `fmvPlanes.test.ts` (CI), `tools/test/fmvDecodeDisc.test.ts` (the dev-disc
acceptance), `packages/viewer/test/movieTexture.test.ts` (CI) and `packages/viewer/e2e/movieDecode.spec.ts` (a real
browser, dev host).

## 0. Answers

| # | finding | section |
|---|---|---|
| R120.1 | **Every picture of SONY448, INTRO_2 and MENULOOP comes out once and in order**, decoded by the page's core from the retail image by range: 310, 3836 and 3732 pictures, equal to libavcodec's decode of the same file and to research 109's counts; every coded picture displayed once in the standard's order by the decoder's own tags (research 98 §7.8's check, now on the whole movies); 0 invalid states | §8 |
| R120.2 | **The epsilon moves on INTRO_2 past its first 300 pictures: at most 5 per sample (picture 1284, Cr) and a worst per-picture mean of 0.0209 (picture 2247, Y)**, against research 98 §7.1's 3 and 0.015. SONY448 (1 / 0.0020) and MENULOOP (1 / 0.0116) stay inside the old bound. libavcodec against itself with another IDCT moves as far or further on the same movie (`faani` 5 / 0.0398, `int` 6 / 0.0835), and every I picture of INTRO_2 is within 1: the IDCT difference carried by prediction, as research 98 §7.9 attributed it. Raised in research 98 §7.11 with this evidence | §8 |
| R120.3 | **"0 pictures with extra black 16x16 blocks" is not met to the letter: 87 INTRO_2 and 9 MENULOOP pictures have a block that converts to all-zero RGB in ours and not in libavcodec's**; in every one of them the block's samples are within 1 of libavcodec's and libavcodec's brightest RGB byte there is 1 -- the black level's rounding, not a lost block. libavcodec with `-idct faani` against its default finds 84 such pictures on INTRO_2, `-idct int` 165. No block anywhere is black in ours with samples beyond the bound (a lost block) | §8 |
| R120.4 | **The page decodes as Node does**: in headless Chromium the worker, fed by a `File` of the 4.38 GB image, gives RGBA byte-identical to the Node core's on all 7,878 pictures of the three movies (reproduced in review). The cost a picture end to end (decode, conversion, transfer, the test's own hash) is host- and load-dependent and not settled here: 2.6-4.9 ms in two runs, 4.2-35.1 ms in the reviewer's; PLAT-19c's | §8 |
| R120.5 | **The two glue defects carried from sprint 6's close review are real and fixed**: on PLAT-19a's build a feed past a buffer the glue could not grow was not refused, and a handle fed on after a flush lost its second stream's last picture (39 of 40); the rebuilt wasm refuses the feed and shows all 40, and `s2u_fmv_reset` starts a new stream on the same handle | §2 |
| R120.6 | **The worker's interface**: `open` a movie on the page's disc source, then "the next picture" -- one picture or the end per request -- with the RGBA moved in the transfer list and handed back for reuse; at most 3 pictures decoded ahead; a second movie on the same decoder; a broken or missing movie ends with its reason; a per-tick hand-off that never waits | §3, §4 |
| R120.7 | **No movie ships, and the decoder ships with its licence**: the build fails if its output holds a movie by name or by its first bytes, which CI's `npm run build` therefore checks; the dev host's wasm goes to `<out>/fmv/` with upstream's `COPYING` and a source offer | §6 |
| R120.8 | *(PLAT-19c, 2026-10-02)* **The opener's three movies play in real time in a page on the dev host**: SONY448, INTRO_2 and MENULOOP, decoded in the worker from the retail image and played by PLAT-21's background player one picture a tick of PLAT-12's 29.97 Hz clock, every picture once and in order (310, 3836, 3732), **0 dropped, 0 repeated in every run**; late ticks (the movie slowed by a tick, nothing lost) **INTRO_2 0, 0, 1, 2, 0, 0 over six runs**, SONY448 and MENULOOP 0 in all five runs of each -- one host stall of about 40 ms can miss a tick, so "sustained" on this shared host is not robust and the spec holds a stated tolerance (1 per 1000 pictures; 0 with `SUSTAINED=1`, the owner's-machine acceptance); presented at 29.958-29.974 / 29.973 pictures a second (INTRO_2 / MENULOOP). The decoder's cost is 2.3-3.2 ms a picture (mean; p95 2.9-5.1 ms, worst 56.9 ms) of the tick's 33.4 ms; start-up 82-97 ms from the open to the first picture, one tick later than the console's (`MOVIE_FIRST_PICTURE_TICK_READING`) | §11 |

## 1. The shape

```
disc image (File) --streamFile, 16 KB--> demuxPss --video PES--> CodedPictureSplitter --one coded picture, tagged-->
  Mpeg2Engine (libmpeg2.wasm) --display order, planes--> MovieDecoder (queue <= 3) --ipuCscRgba--> RGBA
  ==transfer==> MovieClient / MovieStream (the page) --> MovieTexture (three.js DataTexture) --> the movie layer
```

Everything left of the transfer runs in `movieWorker.ts`; everything in `@s2u/fmv` is pure (W9.R6): the wasm
instance, the message port and the disc source enter as parameters (`wasmMpeg2Engine(instance.exports)`,
`serveMovies(port, host)`, `new MovieClient(worker)`), and no browser global is named in the package
(`tools/test/packageBoundaries.test.ts`). There is no clock in the package (W9.R10, §4).

## 2. The decoder behind `Mpeg2Engine`, and the glue's fixes

`Mpeg2Engine` is `glue.c`'s state machine as research 98 §7.1 describes it -- `feed` (copied into the glue's buffer,
optionally tagged), `next` (1 a picture, 0 bytes wanted, -1 an invalid state), `picture` (the decoder's own planes,
valid until the next `next`), `flush`, `invalid`, `close` -- plus `reset`, new here. `wasmMpeg2Engine` checks the
exports and the release (`MPEG2_RELEASE` = 0.5.1) and wraps an instance; `mpeg2ImportStubs` stubs the one import
(`env.emscripten_notify_memory_growth`, research 98 §7.1). An older build without `s2u_fmv_reset` is reset by closing
and reopening its handle.

**The carried findings, verified first, then fixed** (`packages/fmv/test/decodeWasm.test.ts`; `S2U_FMV_WASM` points
it at another build):

- *A failed realloc.* `s2u_fmv_buffer` returned NULL when it could not grow, and its callers went on: `s2u_fmv_flush`
  copied the end code through the null pointer (a write at address 0) and `s2u_fmv_feed(h, n)` handed libmpeg2
  `h->in + n`, past the old buffer. Now the feeds refuse (return -1) any size the buffer does not hold, the flush
  returns -1 when it cannot get its 4 bytes, and the old buffer stays the handle's. On PLAT-19a's build
  (`f351bf84...`): `s2u_fmv_feed(h, 0xfff00000)` after a refused buffer returned nothing (`undefined`, a `void`
  function that read on); on the rebuilt one, -1.
- *The flush latch.* `flushed` was set by the first flush and never cleared, so a handle fed on after a flush (a second
  stream, or the same one again) was never flushed again and its last picture never left the decoder. Now every feed
  clears it. MENULOOP's first 40 coded pictures (no end code) fed twice on one handle, each followed by a flush: PLAT-19a's
  build shows 40 then **39**, the rebuilt one 40 and 40.
- *A second movie on one handle.* `s2u_fmv_reset` calls libmpeg2's full reset (`mpeg2_reset(dec, 1)`, which frees the
  frame buffers it allocated; the next sequence header allocates them again, `header.c` `mpeg2_header_state_init`)
  and returns the glue's own fields to `s2u_fmv_open`'s. Half of a stream, a reset, then the stream whole: 40 pictures
  numbered from 0, no invalid state.

**The build** (`build.sh` unchanged but for the new export; the pin kept): **85,364 B raw, 23,835 B `gzip -9`** at
-O3, sha256 `2dc598cab0ce6fc3edd368bfcc52bbe6cb7462e0ae6f890c9d8cbd5ccb8188ee`, two builds byte-identical; -Oz
58,986 / 19,105 B. (PLAT-19a's: 85,001 / 23,687.) On this Windows host the tarball must be given as a POSIX path
(`/c/...`): GNU tar reads `C:/...` as a remote host and fails ("Cannot connect to C: resolve failed").

## 3. The worker's protocol (`decodeProtocol.ts`)

| from | message | answer |
|---|---|---|
| page | `open {movie, path, source, wasm}` -- `source` is the viewer's `SourceRequest` (`{kind:'iso', file}` or `{kind:'http', baseUrl}`), opaque to the package | none; any movie open before it is superseded |
| page | `next {movie, recycle[]}` -- `recycle`: buffers the page is done with, in the transfer list | one `picture {movie, frame}` (the RGBA `ArrayBuffer` in the transfer list) or one `end {movie, end}` |
| page | `close {movie}` | none; later `next`s of that movie answer the end |

- **One movie at a time, one decoder** -- the console's: one global decoder handle (`DAT_00451cf8`, research 121
  R121.1). An `open` aborts the previous movie's reads (its `AbortSignal`, which `streamFile` checks before every
  read) and resets the engine; the wasm is compiled and instantiated once per worker (`host.engine`, asked once).
- **Requests are answered in order**, one answer each; a request for a superseded movie is answered with its end.
  The page's `MovieStream` answers locally once its movie has ended, been closed or been superseded.
- **The end** carries the pictures shown, the coded pictures fed, the invalid states and the error, if any: a movie
  not on the disc, a decoder that would not load (`wasm` not built: the worker checks the wasm magic, since a dev
  server answers a missing file with the page's HTML), a stream that breaks.
- **The transfer.** Each picture's RGBA (640 x 448 x 4 = 1,146,880 B) travels in the transfer list: the worker's
  buffer is detached, nothing is copied. `MovieTexture.present` makes it the texture's data and returns the buffer it
  replaced; `MovieStream.release` queues it for the next request's transfer list, and the worker's pool hands it to the
  conversion of a later picture. The CI test holds a 12-picture movie, every buffer handed back, to at most 5 buffers made.
- **What PLAT-21 asks** (research 121 §2: `open(name) -> ok`, `next() -> picture | ended`, `seekStart()`, `close()`):
  `client.open(path, source, wasm)` is the open (a failed open is the first answer: the end with its error, which is
  row 4's "open failed"); `stream.next()` / `stream.tick()` the next picture or the end; `seekStart()` is
  `client.open(path, ...)` again on the same worker -- a fresh stream from picture 0 on the reset engine, the clean
  restart research 121 §5 recommends; `stream.close()` the close.

## 4. The queue bound and the pacing hand-off

- **`MOVIE_QUEUE_PICTURES = 3`** decoded pictures ahead of the caller, in the worker. Not a value of the game's: the
  console decodes one picture when its tick asks (`sceMpegGetPicture`, research 121 R121.9) and keeps no decoded
  queue. Ours bridges a worker's round trip: one picture waiting, one in flight, three decoded -- about 5.7 MB of RGBA
  at 640x448 -- so a late tick finds a picture ready while the worker refills. Decoding runs only while the queue is
  short: the core pulls packets as the decoder asks for bytes, so the file is read no further ahead than those
  pictures need (`decodeStream.test.ts`: with a bound of 2, after the first picture of a 200-picture stream, 3
  pictures decoded and fewer than a tenth of the packets read).
- **The pace is the caller's** (W9.R10). Nothing in the package reads a clock. The game presents one picture per
  menu frame, never by PTS (research 121 R121.9), so the hand-off is `MovieStream.tick()`: called once per tick of the
  caller's clock (PLAT-12's when merged, PLAT-21's player's until then), it returns the picture that has arrived (and
  asks for the next at once), `null` when none has yet -- the caller keeps its last picture and counts the tick late,
  the number PLAT-19c measures -- or the end. `MovieTexture.tick(stream)` is the same step for the texture ('picture',
  'late', 'end'). The PES PTS still rides with each picture (`MoviePicture.pts`, the PTS of the packet in which its
  picture start code is the first to begin, 13818-1 clause 2.4.3, the PES semantics of PTS) for PLAT-20's A/V sync.

## 5. The IPU's conversion in the package (`ipuCsc.ts`)

Moved from `tools/fmvPlanes.ts` (which now imports and re-exports it; no package imports from `tools/`). The integers
are research 98 §7.4's -- PCSX2's `yuv2rgb_reference` -- tabled once per term (256 entries each) and written through a
`Uint8ClampedArray` view, whose store clamps as the formula does; `ipuCsc.test.ts` holds the tabled conversion to the
formula written out, sample by sample. `ipuCscRgba` writes RGBA rows top first into a recycled buffer, with the chroma
stride the decoder gives. The alpha is `MOVIE_ALPHA_READING` (255, opaque; §9).

## 6. What the build ships (`tools/fmvShip.ts`, `vite.config.ts`'s `s2u:fmv`)

- **The wasm, its licence, the source offer and our part of its source.** When `packages/fmv/wasm/out/libmpeg2.wasm`
  exists, the build copies it to `dist/viewer/fmv/libmpeg2.wasm` with upstream's `COPYING` (GPL-2.0),
  `SOURCE-OFFER.txt`, and `glue.c`, `config.h` and `build.sh` (`FMV_SOURCE_FILES`). The offer names the release, the
  pinned tarball (shipped beside it since the next bullet; URL, size, sha256) and the three files beside it. Without
  the wasm (CI, a fresh clone) nothing is shipped and the page's open answers "no movie decoder here"; with it but
  without one of the three, the build fails. The dev server serves the same six under `<base>fmv/`, and the tarball.
  *[Changed 2026-10-18, OT.R66: until then the build shipped the wasm, `COPYING` and the offer only (85,364 + 17,992 +
  987 B), and the offer pointed at the three files in Scotho/socom-unzipped, which does not hold them. The owner
  settled W9.R9's "form of the offer at the deploy": our files ship beside the wasm, upstream's tarball named at
  Debian's archive -- and, later the same day, the tarball itself shipped too (the next bullet).]*
- **Upstream's tarball beside them.** The build also ships `fmv/mpeg2dec_0.5.1.orig.tar.gz`, the pinned tarball the
  wasm was compiled from (524,776 bytes), so the seven files under `fmv/` are the binary and its whole corresponding
  source. `build.sh` copies the tarball it was given into `packages/fmv/wasm/out/` after its sha256 and size checks
  (committed there since 2026-10-19, with the wasm: OT.R66); `shipMovieDecoder` reads the pin from `build.sh`'s `SHA256=` and `BYTES=` lines
  (`libmpeg2Pin`: the one place it is written) and fails the build when a built wasm has no tarball beside it, or one
  whose size or sha256 differs, before it copies anything. The offer names the shipped tarball first, with its size and
  sha256, and Debian's archive second, as the same file elsewhere. The dev server serves it as `<base>fmv/` +
  `mpeg2dec_0.5.1.orig.tar.gz`, `application/gzip`, with no `Content-Encoding`. The nginx configs that serve `fmv/`
  (`deploy/nightly/nginx.conf`, `shared/deploy/site/nginx.conf`) need no change: both serve it as a file through their
  extension location (`try_files $uri =404`); neither sets `gzip_static`, and their `gzip_types` lists
  `text/css application/javascript image/svg+xml` only, so it is not compressed again; neither sets a type, so the
  host's http block decides it -- nginx's stock `mime.types` has no `.gz` entry, so the stock
  `default_type application/octet-stream` answers, a download (read from the two configs and nginx's stock tables;
  not checked on a running host). The leak check's artifact mode over a stage of the seven files passes (the tarball
  is read as one binary file); over the tarball unpacked it reports upstream's own contact lines (authors' and the
  FSF's mail and postal addresses, and one standard's section number read as an IP address), third-party text,
  reported and not allowlisted. *[Added 2026-10-18, OT.R66 extended: the owner's "ship the 0.5 MB tarball beside the
  wasm", "approved", and "Yes, download once".]*
- **No movie in the output.** `movieFiles` finds a movie by extension (`.pss`, `.m2v`, `.mpg`, `.mp4`, `.webm` and the
  rest; `.ts` left out, a transport stream is caught by its bytes) or by its first bytes (a pack header, a sequence
  header, MP4's `ftyp`/`moov`/`mdat`, Matroska, AVI, Ogg, a transport stream's sync bytes); the plugin throws at the
  end of the build if any is there, so `npm run build` fails -- CI runs it after the tests (`.github/workflows/web.yml`).
  `tools/test/fmvShip.test.ts` holds the finder on a planted tree and, when `dist/viewer` is present, the real output.

## 7. The texture (`movieTexture.ts`)

`MovieTexture` holds a 640x448 RGBA `DataTexture` (the disc's size, research 98 §7.3), black and opaque until the
first picture (research 121's `MOVIE_HOLD_READING`: "black before any"). `present(frame)` swaps the transferred
buffer in as the texture's data (no copy; three uploads it at the next render), returns the buffer it replaced, and
calls the `onPicture` listeners -- the "new picture" callback for PLAT-14's movie layer and PLAT-21's player; a picture
of another size replaces the texture and calls `onTexture`. Rows are top first, so `flipY` is set; the samples are
display values, so the texture is tagged sRGB (decoded on sampling, encoded back by the renderer's sRGB output); the
filters are three's defaults for a data texture, the scaling being PLAT-14's. `startMovieWorker()` starts the worker
(`new Worker(new URL('./movieWorker.ts', import.meta.url), {type: 'module'})`) and its client.

**Not connected yet**: no page code imports `movieTexture.ts`, so the built bundle does not hold the worker until the
front end does. `frontEnd.ts` does not exist (PLAT-10's), and PLAT-21's player is not merged; W9.R4 and the plan's
"The files" give the connecting line to the controller at the later merge: the decoder handed to PLAT-21's player as
its picture source, e.g. `const movies = startMovieWorker();` and the player's source as `(path) =>
movies.client.open(path, discSource, movies.wasm)`, the player writing `MovieTexture`'s pictures into PLAT-14's layer.

## 8. The full movies: method and numbers

**Dev-disc acceptance** (`tools/test/fmvDecodeDisc.test.ts`; the lock free): the core over the built wasm, the movie
demuxed by range from the retail image (`SOCOM_ISO`), against libavcodec's decode of the same file from the disc tree
made at test time (`ffmpeg -nostdin -v error -threads 1 -i <PSS> -map 0:v:0 -threads 1 -fps_mode passthrough -f
rawvideo -pix_fmt yuv420p -`, streamed a picture at a time, never written), picture by picture:

| movie | ours / libavcodec / research 109 | tag check | max \|d\| (where) | worst picture mean (where) | pictures over 3 / 0.015 | extra-black pictures (their blocks' worst \|d\|) | lost blocks |
|---|---|---|---|---|---|---|---|
| SONY448 | 310 / 310 / 310 | PASS | 1 (11, Y) | 0.00204 (127, Cr) | 0 | 0 | 0 |
| INTRO_2 | 3836 / 3836 / 3836 | PASS (277 I, 1067 P, 2492 B) | **5** (1284, Cr) | **0.02089** (2247, Y) | 168 (118 B, 46 P, 4 I) | 87 (1) | 0 |
| MENULOOP | 3732 / 3732 / 3732 | PASS | 1 (0, Y) | 0.01161 (2471, Cr) | 0 | 9 (1) | 0 |

Picture numbers are display indices. INTRO_2's pictures by their largest |d|: 3 at 0, 1,447 at 1, 2,348 at 2, 23 at
3, 8 at 4, 7 at 5; 15 pictures pass 3, the other 153 of the 168 are over on the mean only. Every I picture is within 1
(the 4 I pictures over are over on the mean: a busy intra picture with many samples off by 1). The first picture over
is 689; the first 300 are all inside, as research 98 §7.9 measured.

**The control** (a scratch probe, the same stream, libavcodec's default decode as the reference): libavcodec with
`-idct faani` -- INTRO_2 max 5 (770, Cr), worst mean 0.0398 (2247, Y), 1,956 pictures over 3 / 0.015, 84 extra-black
pictures (their blocks within 1); with `-idct int` -- max 6, worst mean 0.0835, 3,601 over, 165 extra-black (within 2).
MENULOOP with `faani`: max 1, worst mean 0.0115, 9 extra-black pictures -- the same count as libmpeg2's. libmpeg2 sits
inside libavcodec's own spread on the whole movie, as it did on the first 300 pictures (research 98 §7.9).

**The extra black blocks.** The check is `movie_blocks.py`'s differential, which was written for two layers that
should be byte-identical (the recomp's shadow VRAM against its GL target). Between two IEEE 1180 IDCTs a near-black
block can convert to all zeros in one and to 1 in the other: on every flagged picture here the block's samples are
within 1 of libavcodec's and libavcodec's brightest RGB byte in it is 1 (a fade or a dark stretch). A lost block --
the defect the check exists for (PC research 16) -- is black where the reference has content, far outside the
sample bound. The test therefore fails on a lost block and logs the strict count. [Corrected 2026-10-02, PLAT-19b
review: a lost block was "an extra-black block whose samples differ by more than the per-sample bound", which the
per-sample bound already fails, and which misses a block lost over a near-black reference (within 5 of Y 16). It is now
a block black in ours where libavcodec's brightest RGB byte is above `BLACK_FLIP_RGB_READING` = 1 (`lostBlackBlocks`,
`tools/fmvPlanes.ts`), the black level's rounding measured above: a check that fails on its own.] **This reads the acceptance's "0 pictures with extra black
16x16 blocks" rather than meeting its letter**; the controller or the owner may hold the letter instead, which no
non-bit-exact decoder can meet on these movies (libavcodec fails it against itself).

**The order** (`fmv-spike.ts decode ... --iso <image> --check`, the same core): 310 / 3836 / 3732 coded pictures, the
same displayed, tags in the standard's display order, each with its header's type and temporal reference: PASS on all
three. Research 98 §7.1's two-sequence stream (`twoseq.m2v`, 51 pictures, a sequence end in the middle and none at the
end) through the switched harness: 51, PASS.

**Decode cost in Node** (the core: demux, cut, wasm, copy out; one shared host, not the owner's): SONY448 0.62 ms a
picture, INTRO_2 1.33, MENULOOP 0.84 (research 98 §7.10's wasm-only figures were 0.44-0.93 on the cuts). In headless
Chromium (`movieDecode.spec.ts`; the page's worker from a `File` of the image, decode, RGBA conversion, transfer, and
the test's own SHA-256 of each picture): SONY448 2.63 and 4.48 ms a picture in two runs, INTRO_2 3.37 and 4.92,
MENULOOP 2.92 and 3.48 (one shared host; the runs differ by its load); RGBA byte-identical to the Node core's on
every picture, coding indices equal. Real-time cost and pacing on the owner's machine are PLAT-19c's. [Corrected
2026-10-02, PLAT-19b review: the reviewer's run of the same spec, the lock free, measured SONY448 35.09, INTRO_2 12.54
and MENULOOP 4.23 ms a picture; the byte identity reproduced (7,878 pictures, tags equal). The browser figures are
this host's under its load at the time, not a settled row: PLAT-19c measures the cost.]

**Commands** (from `redotcom`, the lock free; `ISO`, `DISC` the image and the disc tree):

```sh
SOCOM_DISC=$DISC SOCOM_ISO=$ISO npx vitest run tools/test/fmvDecodeDisc.test.ts packages/fmv/test/decodeWasm.test.ts --maxWorkers=1
npx tsx tools/fmv-spike.ts decode packages/fmv/wasm/out/libmpeg2.wasm RUN/MOVIES/INTRO_2.PSS ../../logs/plat19b/i.yuv --iso "$ISO" --check
# the browser: the main Playwright config waits on maps/index.json (the extracted tree); with it present:
SOCOM_ISO=$ISO E2E_PORT=5317 npx playwright test packages/viewer/e2e/movieDecode.spec.ts
```

The browser run above was made with a scratch config that waited on `/fmv/SOURCE-OFFER.txt` instead (port 5317; no
extracted tree in this worktree); the spec is the committed one.

## 9. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `MOVIE_ALPHA_READING` | the alpha of a converted movie pixel | the IPU's CSC command can also give a pixel an alpha (its TH0/TH1 thresholds; not read here, nor in research 98 §7.4, which compares RGB only); the game uploads the picture into the frame buffer under the dialog (research 121 R121.10), and whether that alpha matters there was not read. Reading: 255, opaque | `packages/fmv/src/ipuCsc.ts` |
| `BLACK_FLIP_RGB_READING` | the reference block's brightest RGB byte at which a block black in ours is still the two IDCTs' rounding at the black level, not a lost block (§8, "The extra black blocks") | not a value of the game's: a test tolerance measured on SONY448, INTRO_2 and MENULOOP against one libavcodec (every flagged block has libavcodec's RGB max 1; 87 pictures in INTRO_2 and 9 in MENULOOP at the PLAT-19b review). A block lost over a reference whose RGB max is 1 passes unseen; another movie or another libavcodec may need it re-measured. Reading: 1 | `tools/fmvPlanes.ts` (test only) |
| `MOVIE_FIRST_PICTURE_TICK_READING` | the ticks from a movie dialog's build to its picture 0, and so to its event 3 (PLAT-19c, §11 "Start-up") | the console's open fills its input ring in the build (research 121 §7) and its first tick presents picture 0 (`FUN_0030b1d0` retries until it has one, D:L208692-208699); the page asks the worker for picture 0 on the first tick (`MovieStream.tick`) and has it on the second, measured on every run of §11 (`startupTicks` 1). A drift of one tick (33 ms) at the start, carried to event 3: the `dlgIntroCinematic` -> `dlgSecondCinematic` -> `dlgMenu` chain (BOOT-04) and the menu's MENULOOP (BOOT-06) each start one tick late. Reading: the page's one tick later; no constant stands in for it (it is the cadence of the source's first request). The change to try if it is ruled to matter: ask for picture 0 at the open | *note only* -- owed to BOOT-04 (the boot's wall time and binding order) |

`MOVIE_QUEUE_PICTURES` and `MOVIE_WIDTH` / `MOVIE_HEIGHT` are not stand-ins: the first is this port's bound (§4),
not a value of the game's; the second is the disc's size (research 98 §7.3).

## 10. Settled, not settled, and what PLAT-19c, PLAT-20 and PLAT-21 stand on

- **Settled**: count, order and every coded picture once on the three whole movies; the full-movie bound (5, 0.021;
  research 98 §7.11); the page's decode equal to the Node core's in a real browser; the glue's two defects; the
  conversion in the package; the licence beside the wasm and no movie in the build.
- **Not settled**:
  - FFmpeg 8.1 against the recomp's 7.1 (research 98 §7.6) -- unchanged.
  - A field-coded stream: none of the three movies has one (their picture start codes equal ffprobe's frame counts and
    the decoder's displayed pictures, research 109 §4 and §8 here). The harness pairs
    two field pictures into one frame (`codedFrames`) and says so in its message; that libmpeg2 tags the pair with the
    first field's tag (`display_picture`) is read from its headers, not run on such a stream.
  - The IPU's alpha (`MOVIE_ALPHA_READING`).
  - The lost-block check's black-level flip (`BLACK_FLIP_RGB_READING`), and whether the acceptance's "0 pictures with
    extra black 16x16 blocks" is held to its letter or read as no lost block (§8): the controller's ruling at merge.
  - The source offer's form at the deploy (the owner's, W9.R9).
  - The page's start-up one tick behind the console's, and event 3 with it (`MOVIE_FIRST_PICTURE_TICK_READING`, §9).
  - The decode cost on the owner's machine, sustained 29.97 / 30 fps with 0 late ticks, and the decoder's size and
    start-up in PLAT-29a's table -- PLAT-19c's, on `MovieStream.tick()` and §8's figures. *(Measured on the dev host
    2026-10-02, PLAT-19c: §11; the table's rows are research 100 §5.)*
- **PLAT-21** stands on §3: `MovieClient.open`, `MovieStream.next` / `tick` / `close`, the end with its error, and
  `MovieTexture`'s texture and `onPicture`. **PLAT-20** stands on `MoviePicture.pts` and on the demuxer's audio
  packets, which the core passes over (it takes 0xE0-0xEF only).

## 11. 2026-10-02, PLAT-19c: the movies in real time, and the budget

Written for PLAT-19c (the block: `../roadmap/01-platform.md` "PLAT-19c"; the opener, the owner's word of 2026-10-02),
on `agent/opener-movie` (cut from `agent/online` at 17dfea24). Sources: §§3-4 here, research 121 §§9, 14-15 (the
pace, `MOVIE_PICTURE_LATE_READING`), research 110 (PLAT-12's clock), research 100 (PLAT-29a's table). The wasm is
`build.sh`'s, rebuilt here from the pinned tarball with emcc 6.0.10: sha256 `2dc598ca...88ee`, byte-identical to §2's (rebuilt
again in the review round, 2026-10-02 22:20Z: the same hash, `cmp` equal).

**The code.** `packages/fmv/src/realtime.ts`: `MovieWorkerSource` (PLAT-21's `MoviePictureSource` over the worker's
`MovieStream`: `open` -> `client.open`, `next` -> `tick()`, `MOVIE_PENDING` when no picture has arrived, `restart` a
fresh open of the same file, a picture's buffer handed back once the next is out) and `MovieBudget` (the meter, below).
`decodeStream.ts`: an optional clock (`now`) gives each picture its `cost` -- the decoder's own calls and the
conversion (`decodeMs`), the pulls of the packet stream -- the disc's reads, the demuxer, the cut -- (`readMs`), since the picture before; `decodeProtocol.ts`
carries both and the worker's decoded queue (`queued`) in the picture message; `movieWorker.ts` passes
`performance.now`. `packages/viewer/src/movieRealtime.ts`: `playMovieInRealTime` -- `BackgroundMoviePlayer.build` on
the movie (the dialog background's path), one `tick` per tick of `UiClock` on the display's animation frames, each
picture to `present`, done at event 3 -- and `canvasPresenter` (the RGBA put on a 2D canvas at the origin). Tests:
`packages/fmv/test/realtime.test.ts`, `packages/viewer/test/movieRealtime.test.ts` (CI), and the page run
`packages/viewer/e2e/movieRealtime.spec.ts` (dev host).

**The rule for a host that cannot keep up, as the original has it.** The original never lacks a picture at a tick: its
tick retries `sceMpegGetPicture` until it gives one (`FUN_0030b1d0`, D:L208692-208699), so a slow decode stalls the
frame and the movie slows; the PTS do not pace it and no picture is dropped or repeated to keep time (the TIMESTAMP
callback's `DAT_00451db0` is read by nothing, D:L208419; research 121 §9). It has no other case: no skip-ahead, no
picture dropped. The page cannot stall its frame, so a tick whose picture has not arrived presents nothing and moves
nothing (`MOVIE_PICTURE_LATE_READING`, `'hold-tick'`, research 121 §15): the movie slows by that tick, every picture is
still shown once and in order, and the end event comes that much later -- the original's outcome, by another path.
The meter counts such a tick as late. A display stall past `UiClock`'s catch-up (`CATCHUP_LIMIT_READING`, 0.05 s) is
the clock's lost time, counted apart (`lostSeconds`), and loses no picture either. `realtime.test.ts` and
`movieRealtime.test.ts` hold both on scripted streams. No new reading: the rule is research 121's.

**The budget, as counted** (`MovieBudget`, per movie, on the page's clock): start-up -- the open to the first picture
handed out, and the ticks that found none before it; the pictures; late ticks (after the first picture); dropped
pictures (a gap in the display indices, or the decoder's count at its end past the last index handed out) and repeated
ones; the decoder's `decodeMs` and `readMs` per picture (count, mean, p50, p95 by nearest rank, max); the worker's
queue at each answer; the interval between pictures and the presented rate. **Sustained** = no late tick and no picture
dropped or repeated.

**Measured on the dev host** (2026-10-02, the host lock FREE at each start; headless Chromium through Playwright, the
scratch config of §8, `SOCOM_ISO` the retail image handed to a file input; the 2D canvas presenter; the three movies
in turn on one worker, SONY448 first and cold). Runs 1-2: 21:25Z-21:40Z, port 5303. The review's run: about 21:55Z,
port 5307, INTRO_2 alone and cold. Runs 3-5: the review round's, 22:02Z-22:17Z, port 5309, the spec with its stated
tolerance (below):

| movie | pictures (late / dropped / repeated) | presented / s | decodeMs mean / p95 / max | readMs mean / p95 / max | queue mean (min-max) | start-up ms (ticks) | sustained |
|---|---|---|---|---|---|---|---|
| SONY448, run 1 | 310 (0 / 0 / 0) | 30.003 | 2.78 / 3.5 / 7.6 | 1.78 / 3.9 / 18.0 | 1.99 (0-3) | 97.2 (1), cold | yes |
| SONY448, run 2 | 310 (0 / 0 / 0) | 30.004 | 2.33 / 2.9 / 5.0 | 1.02 / 1.8 / 6.0 | 1.99 (0-3) | 86.6 (1), cold | yes |
| INTRO_2, run 1 | 3836 (0 / 0 / 0) | 29.974 | 2.45 / 3.2 / 7.3 | 2.17 / 4.6 / 18.6 | 2.08 (0-3) | 92.5 (1) | yes |
| INTRO_2, run 2 | 3836 (0 / 0 / 0) | 29.974 | 2.55 / 3.3 / 4.6 | 1.85 / 3.8 / 16.0 | 2.08 (0-3) | 92.9 (1) | yes |
| MENULOOP, run 1 | 3732 (0 / 0 / 0) | 29.973 | 2.41 / 2.9 / 4.8 | 2.12 / 3.5 / 9.6 | 2.00 (0-3) | 92.5 (1) | yes |
| MENULOOP, run 2 | 3732 (0 / 0 / 0) | 29.973 | 2.68 / 3.6 / 23.3 | 3.37 / 10.8 / 59.3 | 1.99 (0-3) | 92.4 (1) | yes |
| INTRO_2, review | 3836 (**1** / 0 / 0) | 29.966 | 2.72 / 4.5 / 40.7 | 2.61 / 7.4 / 43.6 | 2.07 (0-3) | 82.4 (1), cold | **no** |
| SONY448, run 3 | 310 (0 / 0 / 0) | 30.000 | 2.54 / 3.5 / 6.4 | 2.49 / 8.8 / 31.1 | 1.99 (0-3) | 87.1 (1), cold | yes |
| INTRO_2, run 3 | 3836 (**2** / 0 / 0) | 29.958 | 3.23 / 5.1 / 41.3 | 4.59 / 18.3 / 83.9 | 2.06 (0-3) | 91.2 (1) | **no** |
| MENULOOP, run 3 | 3732 (0 / 0 / 0) | 29.973 | 2.92 / 3.8 / 48.2 | 4.94 / 16.3 / 75.9 | 1.99 (0-3) | 92.0 (1) | yes |
| SONY448, run 4 | 310 (0 / 0 / 0) | 30.000 | 2.46 / 3.6 / 5.5 | 2.44 / 9.1 / 43.4 | 1.99 (0-2) | 88.2 (1), cold | yes |
| INTRO_2, run 4 | 3836 (0 / 0 / 0) | 29.974 | 2.77 / 4.5 / 18.2 | 3.47 / 11.9 / 45.9 | 2.07 (0-3) | 92.5 (1) | yes |
| MENULOOP, run 4 | 3732 (0 / 0 / 0) | 29.973 | 2.74 / 3.9 / 56.9 | 3.42 / 10.6 / 74.8 | 1.99 (0-3) | 93.4 (1) | yes |
| SONY448, run 5 | 310 (0 / 0 / 0) | 30.001 | 2.53 / 3.7 / 6.8 | 1.67 / 5.6 / 9.2 | 1.99 (0-3) | 83.2 (1), cold | yes |
| INTRO_2, run 5 | 3836 (0 / 0 / 0) | 29.974 | 3.12 / 4.9 / 48.4 | 4.02 / 15.0 / 66.0 | 2.07 (0-3) | 92.5 (1) | yes |
| MENULOOP, run 5 | 3732 (0 / 0 / 0) | 29.973 | 2.84 / 4.0 / 23.5 | 4.48 / 15.4 / 64.1 | 1.99 (0-3) | 92.1 (1) | yes |

**Late ticks as a distribution** (the review's finding): INTRO_2 0, 0, 1, 2, 0, 0 over six runs (mean 0.5; at most 2
of 3836 pictures, 0.05 %); SONY448 and MENULOOP 0 in all five runs. Both runs with late ticks had a worst picture of
about 41 ms in the worker's decode and 44-84 ms in its reads, and a longest gap between pictures of 66.6-66.7 ms (two
ticks); runs with worst pictures as long (48-57 ms decode, 66-75 ms reads) passed without one when the queue held
pictures ahead. So the dev host's 0 is a property of its load at the time, not a margin the code holds: one stall of
about 40 ms that meets an empty queue misses a tick. The outcome is the original's for a slow decode (the movie slows
by the tick; no picture dropped or repeated, and every run held that), so this changes the claim, not the parity. The
spec (`movieRealtime.spec.ts`) therefore holds late ticks to a stated tolerance, `LATE_TICKS_PER_1000` = 1 (rounded up
per movie: SONY448 1, INTRO_2 and MENULOOP 4, twice the worst seen), and to 0 with `SUSTAINED=1`, the block's
acceptance run on the owner's machine.

Every end was the worker's own (`error` null, its count equal to the pictures handed out); the clock lost no time
(`lostSeconds` 0); the wall time from the build to event 3 was 10.45-10.46 s, 128.11 s and 124.64 s (research 121
§11's 10.333 s, 127.995 s and 124.400 s of stream, plus the start-up and the two end ticks, at 29.97 rather than 30 for
the two 30 fps files). The interval between two pictures (run 1): mean 33.33 / 33.36 / 33.36 ms, p95 34.4 / 34.3 / 34.3
ms, max 35.6 / 50.9 / 50.8 ms -- the 29.97 Hz tick landing on 60 Hz animation frames, an occasional third frame.

- **What it says.** The decoder takes about 2.5-3 ms of the tick's 33.4 ms (7-10 %) on average; its worst picture
  (with the reads) reaches 40-84 ms on this shared host, and such a stall can miss a tick (above). The worker keeps two
  pictures ahead on average and was found with an empty queue at some answers without a late tick. The mean leaves a
  wide margin, the worst case none: the late ticks are host stalls, not a decoder too slow on average, so the block's
  fallback order -- wasm SIMD flags, then FFmpeg's wasm -- would not remove them and was not measured. Whether a deeper
  queue would absorb them was not measured either (`MOVIE_QUEUE_PICTURES`, §4, is this port's bound). The 30 fps files are shown at the menu's 29.97 (research 121 §9): SONY448's
  10 s are too short for the 0.1 % to show in its rate; INTRO_2 and MENULOOP show it.
- **Start-up.** The first picture comes 87-97 ms after the open, cold (the worker started, the wasm fetched and
  compiled -- 0.5-4.1 ms to compile in the page, 3.2-6.9 ms to fetch from the dev server -- the image's directories
  walked) or warm alike, so the decoder's load is not what it is made of: it is the clock's cadence (the first
  animation frame only anchors `UiClock`; the first tick follows a tick later) and the first request's round trip --
  the request goes with the first tick (`MovieStream.tick`), its picture is handed out on the second. In ticks it is
  one: the tick after the build finds no picture, the next presents picture 0. **A drift from the original, named
  `MOVIE_FIRST_PICTURE_TICK_READING`** (§9, *note only*, owed to BOOT-04):
  the console's open fills its input ring synchronously in the build (research 121 §7) and presents picture 0 on the
  first tick after it; the page presents it one tick (33 ms) later, and the movie's end event comes one tick later
  with it. The tick itself does what `MOVIE_PICTURE_LATE_READING` says (nothing presented, nothing moved); the drift
  is the start-up's own, and it reaches every movie dialog's event 3 (the boot's `dlgIntroCinematic` ->
  `dlgSecondCinematic` -> `dlgMenu` chain: two ticks over its two movies). Whether asking for the first picture at the open
  (before the first tick) would bring it in time for that tick was not measured; it is the change to try if the
  one-tick drift is ruled to matter.
- **The size, for PLAT-29a's table** (research 100 §5): 85,364 B raw; 23,835 B `gzip -9` (§2), 24,013 B by Node's
  zlib at level 9 (the spec's own figure); no JS glue (the engine's wrapper is `decodeEngine.ts`, in the bundle).

**What this run is and is not.** A rendered browser run of the page's own path (the worker, the player, the clock, a
canvas presentation) on the dev host, headless, at the display's 60 Hz animation frames; not a headed run and not the
front end's session: `frontEnd.ts`'s `FrontEndSession` still builds `MoviePlayerHost<BlackPicture>` over
`BlackPictureSource`, and its renderer draws a movie picture black (`rasterizeUiDrawList` is given no `movie` reader).
Connecting it is more than the one line this task may write there (the source, the session's picture type and the
renderer's reader), so it is left to the opener's front-end task: `new MovieWorkerSource({ open: (n) =>
movies.client.open(n.toUpperCase(), disc, movies.wasm) })` in place of `new BlackPictureSource()`, the session's
picture type `MovieFrame`, and a `movie` reader for `rasterizeUiDrawList` over the frame's RGBA. No line of
`frontEnd.ts` was changed.

**Not done, owed.**
- **The menu-with-movie frame >= 90 against golden s07** (the block's third item; `../parity/golden-manifest.json` row
  `menu.main`, capture `golden/s07_CROSS.png`): owed. The page does not draw `dlgMenu` over MENULOOP yet (the front
  end's movie is black, above), so there is no frame of ours to score; the reference frame exists. It is the opener's
  menu task's (MENU-02 with the front end's movie connected), scored then with the title gate's scorer.
- **The owner's own machine, headed.** The block says "on the owner's machine"; this is the dev host, headless. A
  headed run of the same spec with `SUSTAINED=1` (`--headed`; 0 late ticks on every movie) is the confirmation.
- **The decoder's weight in the 30 s budget** stays the owner's call with PLAT-29b's threshold (the block's Owner
  calls); research 100 §5 gives it its numbers.

**Commands** (from `redotcom`; the lock FREE; the wasm built by `build.sh`; the scratch config of §8 waits on
`/fmv/SOURCE-OFFER.txt` instead of `maps/index.json`):

```sh
npx vitest run packages/fmv/test/realtime.test.ts packages/viewer/test/movieRealtime.test.ts
SOCOM_ISO=$ISO E2E_PORT=5303 npx playwright test packages/viewer/e2e/movieRealtime.spec.ts   # MOVIES=INTRO_2 for one
SUSTAINED=1 SOCOM_ISO=$ISO E2E_PORT=5303 npx playwright test packages/viewer/e2e/movieRealtime.spec.ts --headed   # the owner's machine
```

**2026-10-03, MOVIE-WIRE: the line is connected.** The front end's session plays the opener's movies from the disc
(`agent/movie-wire`, cut from `agent/online` at fd557433). `mountFrontEnd` (`frontEnd.ts`) hands `FrontEndSession`
PLAT-19c's `MovieWorkerSource` over the served tree's `SourceRequest` (the worker started with the first movie,
`startMovieWorker`; the dialog's name opened as the disc's path, upper case: `discPath`, since the served tree keeps
the disc's names and HTTP does not ignore case -- the lower-case name came back as the dev server's HTML page), the
session's picture type `MovieFrame`, and `rasterizeUiDrawList`'s `movie` reader `movieFramePicture` (a view on the
frame's RGBA, no copy; a buffer already handed back draws black) -- the three pieces this section's paragraph above
named. PLAT-20's sound is fed beside it (research 137 §5). The code is `viewer/src/frontEndMovies.ts`; the
`MOVIE_SOURCE_PLACEHOLDER` constant is removed (research 139 §8). A page without workers (the unit tests' jsdom)
keeps `BlackPictureSource`. No new reading: the pace, the late tick and the loop are this section's and research
121's. Held by `viewer/test/frontEndMovies.test.ts` (scripted sources) and the rendered run
`viewer/e2e/openerMovies.spec.ts`.

**Measured in the front end** (2026-10-03, the dev host, the host lock FREE, headless Chromium, port 5360, the served
tree and this section's wasm rebuilt from the pinned tarball, sha256 `2dc598ca...88ee` again; the canvas sampled every
second, every 4th pixel): SONY448 310 pictures, 0 late / 0 dropped / 0 repeated, start-up 100 ms (2 ticks), decode
mean 2.06 ms (p95 3.2, max 9.3), 29.86 pictures/s; an earlier run 1 late tick. INTRO_2's first 257 pictures: 4 late,
start-up 267 ms (7 ticks), decode mean 2.59 ms, the worker's reads up to 238 ms (an earlier run: 1 late in 258).
MENULOOP behind `dlgMenu`, 685 pictures: 2 late, start-up 373 ms (10 ticks); in a two-minute run 3627 pictures with 2
late. Every movie: none dropped or repeated, every end the worker's own. The canvas: SONY448 mean luma 0.0-2.4 (a
small bright logo on black; up to 2.2 % of pixels above luma 32), INTRO_2 18-54 (8-74 %), MENULOOP 25-26 (32-35 %),
changing every second -- where the stand-in's canvas was 0.0 throughout. The start-up ticks are more than the
harness's one (§11 above): the front end's first tick after the build asks while the dialog's own work and the sound's
second read of the same file run beside it; not separated further. The late ticks: SONY448's and MENULOOP's within the harness's
tolerance (`LATE_TICKS_PER_1000`: 1 and 4 a movie); INTRO_2's 4 in its first 257 pictures already reach its whole-movie
4, and came with read stalls in the worker (`readMs` max 238 ms) while the sound read the same file -- a cause
believed, not proven. The movie budget the
block names (0 late on the owner's machine, headed) is still the owner's run.

