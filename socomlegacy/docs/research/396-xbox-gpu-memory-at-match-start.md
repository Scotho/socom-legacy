# 396 -- The page's GPU memory at match start, v0.4.17 against mega (the Xbox context loss)

> **Flag (2026-11-11): WebGL2 GPU bytes overstated by up to ~1/3 of the mipmapped share (instrument F1); re-derive with
> the fixed instrument.** The scratch instrument behind §2-§3 added a third of a texture's whole stored chain at
> `generateMipmap`, after `texStorage2D` had already counted the chain (three.js r186 does both), so every mipmapped
> WebGL2 texture was counted at ~4/3 of its bytes. The Xbox (WebGL2) rows and every WebGL2 figure built on them are high;
> the WebGPU rows (`createTexture` counts `mipLevelCount` once), the JS heap, the content hashes' counts and the buffer
> duplicates' bytes (2.00 and 0.37 MB) are not affected. The duplicate textures' byte figures are covered by the flag
> (§3 (b)'s 10.42 MB and its 55 % and 41 %, the 12.8 MB, §5's "about half"): model textures may be mipmapped
> (`world.ts:1978-1982`). The instrument is now in the repository, fixed and unit-tested (`packages/viewer/e2e/gpuTrace.ts`, review
> F1 of `agent/xbox-gpu-bench`).
>
> **Re-derived (2026-11-11, the second PC, rendered browser runs, one run per leg):** the same scratch legs at the same
> heads under the Xbox preset, with the fixed instrument (built from `agent/xbox-gpu-bench` 4efaa3747). The figures
> move by no more than one run's spread, so the over-count bit on few of this page's textures, and §2-§3's figures and
> readings stand as written:
>
> | head | leg | peak MB, before -> after | textures MB (count), before -> after | at READY MB, before -> after |
> |---|---|---|---|---|
> | mega 7cd782a5f | test room MP2 | 12.0 -> 12.0 | 9.2 (204) -> 9.2 (204) | - |
> | mega 7cd782a5f | test room MP6 | 12.8 -> 12.8 | 9.4 (216) -> 9.4 (216) | - |
> | mega 7cd782a5f | 16 seats MP2 | 25.3 -> 24.7 | 18.9 (481) -> 18.2 (479) | 10.6 -> 10.7 |
> | v0.4.17 8882b74b5 | test room MP2 | 11.9 -> 11.6 | 9.2 (203) -> 8.9 (201) | - |
> | v0.4.17 8882b74b5 | test room MP6 | 13.0 -> 13.0 | 9.4 (216) -> 9.4 (215) | - |
> | v0.4.17 8882b74b5 | 16 seats MP2 | 25.0 -> 24.9 | 18.6 (474) -> 18.5 (479) | 7.8 -> 7.6 |
>
> The 16-seat legs at main 6343231f0 with 30 s of play (the second PC's later runs) agree: the Xbox preset 25.8 -> 25.8,
> WebGL2 balanced 25.7 -> 25.7, WebGL2 performance 25.6 -> 26.1 MB peak. The JS heap's maxima vary between runs as
> before (here 324-436 MB in the test room and the 16-seat legs at 396's heads, 598-618 MB at 6343231f0 with 30 s).

- Date: 2026-11-10. Requested by the controller (redotcom-99) through the machinery seat after an owner report: Xbox
  players lose graphics right after a match starts ("Graphics stopped at <t>Z (WebGL: Unknown reason)":
  `packages/viewer/src/graphicsLost.ts:60`, `:56` at v0.4.17; "Unknown reason" is not the page's wording but what the
  renderer's `onDeviceLost` passes on, `graphicsLost.ts:124-134`, an empty browser message), while the test room plays
  fine. The report is the owner's, relayed by the controller; the build it names is not in this note's record. Branch
  `agent/spc-xbox-gpu` (base mega 91ba61cc8).
- Track: **product** (OT.R53). This is a measurement only: nothing of the game, its picture or its timing changes. No
  constant is named and no fix is applied. The candidate fixes are proposals for the controller (§5).
- Evidence kinds: **rendered browser runs** on the owner's second PC (RTX A4500, Chrome 157, headed; the Xbox's own
  hardware was not used), one run of each leg; and **source inspection** for §3 (b) (`remotePlayers.ts:1493`,
  `bodyView.ts:148`, `:165`, `:192-199`).
  - The instrument: an init script that wraps WebGL2 (`texImage2D`, `texStorage2D/3D`, `compressedTexImage2D`,
    `generateMipmap`, `bufferData`, `renderbufferStorage[Multisample]`, the deletes, `framebufferTexture2D`) and WebGPU
    (`createTexture`, `createBuffer`, `destroy`).
  - It estimates each allocation's bytes from its size and format, and records per-frame live totals per context, each
    context's creation, detachment and loss, and the JS heap (`performance.memory`).
  - Every number below is an **estimate of allocated GPU bytes**, not a driver reading. It does not count the canvases'
    own drawing buffers or the browser's and driver's overhead.
  - The byte rule: width x height x bytes per pixel of the format and type, per mip level stored (`texStorage*` counts
    every level it allocates; `generateMipmap` adds the chain -- in the scratch instrument used here it added a third of
    the whole stored chain even after `texStorage*`, the flag above); a compressed upload counts its data's length; a
    multisampled renderbuffer counts its samples; WebGPU textures by `mipLevelCount` and depth. "Lost" is the
    context's `webglcontextlost` event; "detached" is its canvas leaving the document. A context is named by its
    canvas's class and dataset (`uiGpuSurfaceMount.ts:40`), not by a context name. An init script wraps the page's
    prototypes only, so a context made in a worker is not seen, nor whether a lost context's memory was returned.
- Heads: **v0.4.17 8882b74b5** (the live baseline: GPU menus off) and **mega 7cd782a5f** (GPU menus on, WebGPU the
  default).
- The Xbox preset was forced the way an Xbox pick is saved: `localStorage['s2u.viewer.graphicsBackend'] = 'xbox'`,
  which is `./deviceClass`'s Xbox class: WebGL2, a 720 ceiling, shadows off, no edge smoothing, 75 % render scale,
  60 drawn (`autoQuality.ts:27`). The comparison legs used `'webgpu'`.

## 1. The legs

- **Test room, one player:** `/testroom?map=MP2|MP6&mode=play&view=modern&online=off`, from the page's open to 5 s of
  walking.
- **16 seats on MP2 through the menus:** a respawn game with BOTS: FILL on both sides (15 CPUs and the host), launched
  from the native front end. It is `botsLand.spec.ts`'s first case with the instrument added. The marks run from the
  menu's open through the briefing room, the game made, the lobby full, READY, in the match and the scoreboard full, to
  8 s of play.
- **Not run:** a 16-seat match on MP6. The front end offers bots only on Frostfire in a respawn game (BTL.R6), so it
  cannot be reached this way.
- **Not run in this window:** the optional reproduction of a context loss on the PC; done later, filed in §6.

## 2. The table

| head | backend | leg | peak MB | textures MB (count) | buffers MB (count) | flagged render targets MB | most live contexts | at READY MB | JS heap max MB |
|---|---|---|---|---|---|---|---|---|---|
| mega 7cd782a5f | Xbox (WebGL2) | test room MP2 | 12.0 | 9.2 (204) | 2.8 (5643) | 0.0 | 2 | - | 394 |
| mega 7cd782a5f | Xbox (WebGL2) | test room MP6 | 12.8 | 9.4 (216) | 3.4 (5832) | 0.0 | 2 | - | 430 |
| mega 7cd782a5f | Xbox (WebGL2) | 16 seats MP2 | **25.3** | 18.9 (481) | 6.4 (10813) | 0.0 | 2 | 10.6 | 416 |
| mega 7cd782a5f | WebGPU | test room MP2 | 39.3 | 37.0 (190) | 2.2 (3797) | 37.0 | 1 | - | 304 |
| mega 7cd782a5f | WebGPU | test room MP6 | 39.8 | 37.0 (203) | 2.8 (4050) | 37.0 | 1 | - | 351 |
| mega 7cd782a5f | WebGPU | 16 seats MP2 | **42.0** | 33.8 (483) | 6.7 (11135) | 33.8 | 2 | 41.8 | 517 |
| v0.4.17 8882b74b5 | Xbox (WebGL2) | test room MP2 | 11.9 | 9.2 (203) | 2.8 (5611) | 0.5 | 2 | - | 307 |
| v0.4.17 8882b74b5 | Xbox (WebGL2) | test room MP6 | 13.0 | 9.4 (216) | 3.6 (6690) | 0.5 | 2 | - | 351 |
| v0.4.17 8882b74b5 | Xbox (WebGL2) | 16 seats MP2 | **25.0** | 18.6 (474) | 6.4 (10779) | 0.0 | 1 | 7.8 | 435 |
| v0.4.17 8882b74b5 | WebGPU | test room MP2 | 40.1 | 37.3 (206) | 2.8 (5611) | 37.3 | 1 | - | 298 |
| v0.4.17 8882b74b5 | WebGPU | test room MP6 | 41.0 | 37.5 (218) | 3.4 (5770) | 37.5 | 1 | - | 206 |
| v0.4.17 8882b74b5 | WebGPU | 16 seats MP2 | **42.5** | 34.2 (497) | 6.7 (11095) | 34.2 | 1 | 42.3 | 597 |

How to read three columns:
- "Most live contexts" counts the page's WebGL/WebGPU contexts alive in one frame. The test room's 2 is a short-lived
  probe context (300x150, made and lost within 0.5 s at the map's start, on both heads).
- Under WebGPU the render-target flag is the texture's `RENDER_ATTACHMENT` usage. Three sets it on most textures (for
  its mip generation), so that column is not a render-target measure there.
- "At READY" is the total in the frame nearest the READY press.
- The textures and buffers columns are the last frame's split. Under WebGPU at 16 seats the peak is an earlier frame
  (near READY), so those two rows' columns sum to 40.5 and 40.9 MB, not to their peaks.

## 3. The three answers

**(a) Is there a peak at match start, how big, and what is in it?**
- Under the Xbox preset, there is no transient spike. The total climbs through the load and stands at its highest at
  the end of the window, the steady state of play. (Under WebGPU the 16-seat total is already near its peak at READY,
  41.8 and 42.3 MB: the lobby prepares the match off the Xbox class, `lobbyPrepare.ts:45-52`.)
- Under the Xbox preset on mega, the climb goes: 10.6 MB at READY, 19.7 MB in the match, 25.3 MB 8 s into play.
- At its height the 25.3 MB is:
  - 18.9 MB of textures (481, almost all PS2-sized: 205 at 64x64, 100 at 32x32, 57 at 128x128, 20 at 256x256);
  - 6.4 MB of buffers (10,813);
  - two 640x448 textures, 2.19 MB, are the match renderer's frame targets, identified by their size in the live list;
    the instrument's render-target flag did not mark them, so that column under-counts targets under WebGL.
- **mega's peak of the bytes the page itself allocates (textures, buffers, renderbuffers, as estimated) is not higher
  than v0.4.17's: 25.3 against 25.0 MB under the Xbox preset, 42.0 against 42.5 MB under WebGPU -- one run of each leg.
  The canvases' drawing buffers, one per live context, are in neither total, and mega at 7cd782a5f holds one more live
  context through the load (§3 (c)).** The JS heap's maximum over the 16-seat leg is 416 MB against 435 MB (Xbox) and
  517 against 597 MB (WebGPU).
- *Reading:* the game's own counted GPU bytes are small (12-42 MB). A spike of them is an unlikely cause of the Xbox
  loss on its own. On this PC the JS heap peaked at 300-600 MB beside them. The Xbox's GPU and heap share one pool, so
  the sum is a candidate; its heap was not measured, and this run ranks no cause; see §4.

**(b) Do player models share textures and geometry, or does each seat get its own copy?**
- From one player (the test room) to sixteen seats (the match) the live set grows by:
  - about 277 textures and 9.7 MB, the extra textures mostly 64x64 (+114), 32x32 (+75) and 128x128 (+32);
  - about 5,170 buffers and 3.6 MB.
- Per extra seat that is roughly 8 x 64x64, 5 x 32x32 and 2 x 128x128 textures and ~345 buffers. That reads as **each
  seat getting its own copy**, of geometry at least.
- **Confirmed by content (2026-11-10, mega a45cdde96, the same 16-seat leg under the Xbox preset; two separate runs,
  the texture run ending 03:49:58Z and the buffer run 04:04:08Z).** The instrument hashed every texture upload's
  pixels (FNV-1a over the ArrayBufferView passed to `texImage2D` / `texSubImage2D`), keyed with the size and format.
  The percentages below divide by the 7cd782a5f table's totals (18.9 and 25.3 MB, 481 textures); the hash run held 497.
  - Of 497 live textures, 489 carried a hash (8 had no pixel upload to hash), and those 489 hold **only 210 distinct
    contents**. 63 contents are
    uploaded more than once: **279 extra copies, 10.42 MB**, about 55% of the 18.9 MB of textures and about 41% of the
    25.3 MB total.
  - The biggest repeats come in eights, one per seat on a side: two 256x256 contents x8 (256 KB each), 128x256 x8 and
    x6, 128x128 x8. Some 64x64 contents appear x17, more than a seat's worth; what they are was not identified.
  - So each seat gets its own copy of its model's textures. Sharing them per model would take the 16-seat match from
    ~25 MB to ~15 MB of GPU bytes on the Xbox preset.
  - **Buffers, hashed in a second run** (the same leg; the contents passed to `bufferData` / `bufferSubData`):
    - vertex buffers: 3,187 live, 1,406 distinct, 1,781 extra copies = **2.00 MB**;
    - index buffers: 1,273 live, 480 distinct, 793 extra copies = **0.37 MB**;
    - (uniform buffers also repeat, 1.23 MB, but those are per-object state, identical by nature and not shareable.)
  - So the shareable duplication is about **12.8 MB of the match's 25.3 MB**: 10.4 MB of textures and 2.4 MB of
    geometry, the per-seat copies of each model's assets.
- **The code agrees (source inspection, mega).** Each seat's body is its own `buildBody` (`remotePlayers.ts:1493`; the
  page's own at `matchMount.ts:722`); it keeps a texture map local to the body (`bodyView.ts:148`) filled by
  `makeTexture` per name (`:165`), a new `DataTexture` each call (`world.ts:1965`); each sub-mesh gets a new
  `BufferGeometry` and attributes (`bodyView.ts:192-199`). Eight seats of a side share one `LoadedBody` when they share
  a type (`teamBody.ts:34-38`), hence the eights. v0.4.17 has the same lines, so the duplication is not mega's.

**(c) Are the front end's GPU resources still alive when the map's uploads begin?**
- *mega (at 7cd782a5f, before GM-XBOX1), under the Xbox preset:*
  - The GPU menus' context (`s2u-ui-gpu-standby`, 9.3 MB in the lobby) is **lost at 68.7 s, before the match context
    is created at 72.0 s**: the page calls `loseContext` on it (`uiGpuPresenter.ts:644`) before the map loads; that
    Chromium then returns the memory is the browser's behaviour, not measured here.
  - A loading screen's GPU context (`s2u-ui-gpu-standby[loadingGpu]`, made at 69.2 s, 3.1 MB) **does overlap the match
    context through the load**, and is lost at 80.1 s as the match starts. READY falls at 73.6 s, after both; so at
    READY
    mega holds 10.6 MB in two live contexts (the loading panel's 3.1 MB and the match's 7.5 MB), against v0.4.17's 7.8
    MB
    in one.
  - From the match's start on, mega holds only the match context, as v0.4.17 does.
- *v0.4.17:* the menus draw in software, and the match context is the only GPU context after the start-up probe.
- The overlap is small in bytes. A second live WebGL context during the load is the one structural difference at match
  start between the two heads. GM-XBOX1 (merged into mega at 788d20722 and 88f4367a9, after the head measured
  here) removes it on the Xbox class: the loading panel and the in-match Settings overlay draw in software there.

## 4. What this does not show

- **The Xbox itself.** These are runs on a desktop GPU with a desktop Chrome. The Xbox's memory limits, its driver, its
  reasons for a context loss and its UMA pool were not reproduced.
- **The drawing buffers and the overhead.** Each canvas's own framebuffer (at 720x480 and 640x448, a few MB each) and
  the browser's and driver's own memory are not in the totals.
- **Attribution by owner.** Three uploads lazily inside its render loop, so the allocating stack rarely names the page
  code that owns a texture. The map versus models split above comes from comparing legs, not from tags.
- **v0.4.17's own loss.** The live report is on v0.4.17 (the owner's report, relayed by the controller; its build is
  not in this record), which
  has one context and the same counted bytes as mega. Whatever
  ends the Xbox's context there is not something mega adds. A context loss on v0.4.17 points away from the menus
  (question (c)) and towards the shared memory, or a context or driver limit, on the Xbox, or a stall (the load's
  uploads and compiles holding the GPU process) --
  this note measured bytes only.

## 5. Proposals for the controller (none applied)

1. **Done: GM-XBOX1 is in mega** (788d20722, 88f4367a9). Owed: the READY frame re-measured on a mega head that
   carries it.
2. **Share per-model textures and geometry between seats** (filed as LATER 827). The content hash and the code
   confirm §3 (b)'s copies: 10.4 MB of textures and 2.4 MB of geometry at 16 seats (about half the match's counted
   bytes). The CPU-side arrays are already shared (`world.ts:1965`, `bodyView.ts:193-199`; only the colour lane and the
   skin indices are per body). The eights are a bot-filled game's, one type a side; a match of people spreads a side
   over its types (`teamBody.ts:36`), so ~12.8 MB is the most this saves at 16 seats. Sharing needs an owner outside
   the body (`bodyView.ts:294-298` frees them with it), and materials stay per body (`setOpacity`, `bodyView.ts:64-71`).
3. **Measure on the Xbox itself** (the owner's to arrange; the controller will ask him). The client error beacon
   already reports a lost WebGL context with the release, backend, adapter, map and match time
   (`clientErrorBeacon.ts:11-27`, `:38`, `:354`); central's store may already hold Xbox records. Otherwise: the same
   instrument as an injected dev switch, or an Xbox tester's console log
   around the loss with `performance.memory` and the context count. That would settle whether the pressure is the
   heap, the GPU or the contexts.

## 6. Owed

- ~~**The WebGL2 figures re-derived** with the fixed instrument (the flag above).~~ Done 2026-11-11 (the flag's table):
  within one run's spread of §2's; nothing in §2-§3 changes.
- ~~The optional PC reproduction of a context loss at match start (a capped GPU process, or a low-memory WebGL setting),
  so fixes could be tested without an Xbox.~~ Done 2026-11-10/11 on the second PC (main 6343231f0 and the Xbox hotfix
  head 4b8143cd5; rendered browser runs, 16 seats on MP2), now `packages/viewer/e2e/zz-gpu-trace.spec.ts`'s faults
  (`docs/TESTING.md`, "The GPU trace and fault bench"):
  - a forced WebGL loss 10 s into play (`WEBGL_lose_context`) reproduces the field's notice word for word, and asking
    the context back does not recover the match: an in-match WebGL loss is terminal on this build;
  - one failed WebGPU buffer creation (a simulated allocation failure) freezes the match on a black screen with no
    notice; ending it through `match.stop()` throws the field's "reading 'destroy'" at main and not at the hotfix head;
  - a GPU memory budget of 1024 MB (`--force-gpu-mem-available-mb`, a hint, not a driver cap) changes neither the
    counted bytes nor the outcome: no loss.
  - *Caveat (review F3 of `agent/xbox-gpu-bench`):* the scratch loss fault called `getContext('webgl2')` on every canvas,
    which would make a context on a canvas that had none. In the run behind the first point the trace records no
    context made at the loss (the instrument records each one) and the loss reached only the match's canvas, so its
    counts stand for that run; the committed fault touches only the contexts the page made.
- ~~A content hash of the player-model uploads for §3 (b).~~ Done 2026-11-10 (§3 (b)): 10.42 MB of the textures are duplicate copies.

Evidence (host-local, not in git): the second PC's bucket upload for 2026-11-10, `xbox-gpu/`. It holds the scratch
instrument (`gpuTrace.js`; superseded by `packages/viewer/e2e/gpuTrace.ts`), the spec (`zzGpuTrace.spec.ts`), the
analyser (`analyze.mjs`), each leg's trace JSON and run log, and `table.md`. The fault runs of §6 (2026-11-10/11) are
held on the same PC beside it, not yet uploaded: `xbox-gpu-x3-bench/` (the WebGL loss -- its `webgl2bal/` trace JSON
and console record, the F3 caveat's run -- and the WebGPU buffer failure at both heads, each with its trace and
record), `xbox-gpu-x4-cap-6343231f0/` (the 1024 MB budget), `xbox-gpu-bench-verify*/` (the committed spec's runs),
and `xbox-gpu-rederive/` (the flag's re-derivation: the generated instrument, each leg's trace JSON and run log).
