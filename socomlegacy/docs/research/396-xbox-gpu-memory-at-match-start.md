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

## 7. The first investigation: PR #631 (2026-10-31 to 2026-11-01), carried here

- **Whose it is.** Written by **Chris** (GitHub `imbennyhim`) and his seat's agent, on `agent/xbox-lobby-capture`, head
  **ed3b8efd0f** (base 08cb24485, v0.3.36), as the draft pull request #631: "Handoff: unresolved Xbox Edge browser
  shutdown investigation". The physical Xbox runs are Chris's, played on his Series X. The desktop replies in its thread
  are the owner's controller seat's (Craig's Claude), from the same nights.
- **Why it is here.** The owner approved closing #631 once its measurements were saved into this note ("Approved", said in
  the main controller's seat, redotcom-2f, 2026-11-11 at about 21:20Z, and relayed by it to the Xbox lane, redotcom-c4).
  - This section keeps the handoff's findings and the thread's measurements.
  - Its numeric file is kept unchanged at
    [`data/396-pr631-xbox-browser-stability-measurements.json`](data/396-pr631-xbox-browser-stability-measurements.json).
    It is the same blob as at ed3b8efd0f (`37a083e99`).
- **Not carried.** The handoff note itself (`socomlegacy/docs/diagnostics/xbox-browser-stability-handoff.md`) and the two
  opt-in recorder scripts (`socomlegacy/tools/diagnostics/xboxEventProbe.js`, `xboxResourceProbe.js`) stay readable at
  ed3b8efd0f. The branch is kept.
  - The scripts are superseded by `packages/viewer/e2e/gpuTrace.ts` (§6) and by v0.4.19's `contextdiag` / `inputdiag`
    beacon kinds (`src/matchDiag.ts`).
  - The raw logs, the photos, the TLS material and the private launcher stayed on Chris's PC, by the handoff's own
    record.
- **Checked before it went in (2026-11-11, c4).**
  - Every key and string of the JSON was listed. It holds counts, sizes, UTC times, the source commit and fixed labels.
  - It holds no device name, account, address, path or token.
  - This section quotes the adapter and driver strings from the device report in (a). They identify a console model, not
    a person.
- **Evidence kinds**, kept apart below:
  - **Physical console observations**, reported by the player and relayed by Chris's seat. Their times are when the
    reports arrived, not instrumented event times.
  - **One injected-recorder run** on the Xbox, on a private development stack.
  - **The console's own `edge://gpu` and `edge://system` reports**, from photos and an export.
  - **Rendered desktop browser runs** by both seats. None of them is an Xbox figure.

### (a) The device, from its own report

- **The report:** the `edge://gpu` export pasted by Chris's seat. It was exported 2026-11-01T04:10:13Z, after Edge was
  reopened.
- **The console:** Xbox Series X, Edge 150.0.4078.112.
  - Active adapter `SraKmd_arden`, Microsoft driver 10.0.26100.9647.
  - GL `egl-angle` / d3d11, OpenGL ES 3.0, ANGLE 2.1.46474.
- **Memory:** "Total Physical Memory (Gb): 1", "System Commit Limit (Gb): 3", hardware concurrency 8. These are values the
  browser is told, not a measured budget for Edge.
- **Workarounds and features:** the workaround `exit_on_context_lost` is applied. "Problems Detected" says the driver
  cannot reset the D3D device in the GPU process's sandbox. The ANGLE feature `loseContextOnOutOfMemory` is **enabled**.
- *Reading (inferred, not measured on the console):* on this device a GPU-process out-of-memory **loses the WebGL context**
  rather than failing one allocation. That is the page-alive, picture-gone shape, and a candidate mechanism for the
  field's "WebGL: Unknown reason" (b0's shape 2). The empty reason fits a loss the browser does not explain to the page.
- **Before the export, in the handoff:**
  - automatic WebGPU reported `DXGI_ERROR_DEVICE_REMOVED` / `DXGI_ERROR_DRIVER_INTERNAL_ERROR` (shape 1's ancestor);
  - explicit WebGL2 rendered Frostfire;
  - a tiny WebGL page failed both WebGL and WebGL2 until the console was restarted.
- `performance.memory.usedJSHeapSize` sat at exactly 123,000,000 throughout. It is bucketed, so no heap reading of the
  console stands.

### (b) The physical runs

Chris's Series X. Each outcome is as the player reported it, and every time is a report's time:

| run (UTC, 2026-11-01) | client | setup | outcome |
|---|---|---|---|
| private match, 02:11:07.916 -> 02:12:07.980 (recorder samples) | dev build at 08cb24485 on a private stack, PC-served extracted assets | Frostfire, Respawn asked (the recorder kept no rules), against one desktop player; WebGL2, antialias off; the canvas settled at 960x479 (CSS 1280x639) | **the whole of Edge closed**, about 60 s between the first and last match samples; no context loss, page error or `pagehide` recorded |
| XBOXMEM, map 03:30:20, failure 03:30:43 | nightly v0.3.36 (08cb24485) | Frostfire Classic, 3 bots; **two SOCOM tabs and two others open** | a white page with a frown, Edge left open |
| XBOXMEM2, map 04:01:18, close 04:07:27 | nightly v0.3.36 | Frostfire Classic, 7 bots, 6-min rounds, one tab (a full restart not confirmed); joined late, so probably spectating round 1 | **Edge closed** at about the end of round 1; no `edge://crashes` entry for the night |
| XBOXMEM3, map 04:29:08, report 04:29:40 | nightly v0.3.36 | Frostfire Classic, 4-min rounds, READY before the launch, one tab | the map frozen on entry, then **Edge exited** to the Xbox home screen |
| after S1-S5, 21:25:32 and 21:42:55 | nightly v0.4.0 / v0.4.1 | online Respawn, Vigilance and Frostfire | "Graphics stopped at <t>Z (WebGL: Unknown reason)" **during the load**, then NET ERROR; Edge stayed open |

- **Calibration** (`edge://system` in the lobby, one game tab, displayed values, not a private-bytes total): the SOCOM tab
  149 MB, the GPU process 222 MB, the browser 73 MB, the rest under 30 MB each.
- **Frame rate** (offline Frostfire, 20 s samples, same pose, 960x479): antialias on 34.05 and 36.50 FPS; off 41.36 and
  41.63 FPS.
- **The lower-resolution variant** (`capturepixels=low`) was never run on the console.

### (c) The desktop measurements

All rendered desktop browser runs, one run each. They are not Xbox figures.

- **The handoff's own comparison** (the JSON, offline Frostfire, the Xbox graphics choice):
  - DPR 1.25 at 1600x800 and DPR 0.5 at 640x320 hold the same live objects: 233 textures, 7,508 buffers, 122 programs,
    508 vertex arrays.
  - The worker's deliveries are the same too (decimal MB): map 13.99, armory 6.36, play 2.01, effects 0.27, sound 75.47,
    sound loops 32.26.
  - So the resolution moves none of those.
- **Two desktop players in a Classic match** (the JSON):
  - The match settled by 30 s at 163 textures, 5,206 buffers, 115 programs and 521 vertex arrays, unchanged at 60 and 90 s.
  - The JS heap read 329, 324 and 408 MB at those times, which is not a monotonic leak.
  - Cumulative `bufferData` bytes climbed (214 -> 390 -> 548 MB) while the counts stood still: re-uploads, not resident
    memory.
- **The owner's seat, its first runs.** The browser's whole process tree, in private MB, with the "Xbox" seat at 1280x639
  CSS and DPR 1.5:
  - the test room peaked at 1,445;
  - a menu match peaked at 1,497 in Classic (+12 s after its start) and 1,626 in Respawn (+6 s);
  - the steady state was 1.1-1.48 GB, with no growth over 3 minutes;
  - the menus held 606-700 MB into the match's load.
- **Its later breakdown:**
  - **After a forced GC, the live JS objects were 22 MB in the lobby and 28 MB at the match's end.**
  - The GPU process grew from about 190 to 520 MB at the match's start against ~5 MB of texture uploads, and kept ~467 MB
    after the return (179 in the lobby): driver-side, not broken down further.
  - **Shader programs were refuted as the large cost:** linking the 121 programs Frostfire uses on the Xbox preset grew
    the GPU process ~44 MB, ~0.36 MB a program.
  - Three r186's per-frame uniform `bufferData` at the match's rate (~2,700 calls/s) grew it ~29 MB, then flat.
  - The sound held ~107 MB of decoded arrays, with ~130 MB of audio buffers made per match.
- **S1-S5** (shipped in v0.4.0, #633): the loss notice, and under the Xbox preset the loader freed after a match, the menus
  asleep under it, the match worker ended once loaded, and the sound held once. Its A/B, one run each on Linux SwiftShader:
  - load peak 1,266 -> 893 MB (-29 %);
  - match peak -24 %;
  - steady state -15 %;
  - after the match -16 %.

### (d) What it adds to this note

- **The context loss during the load predates mega and the GPU menus.** v0.4.0/v0.4.1 lost it there with S1-S5 in, the
  same window as b0's shape 2 (10.9-14.5 s after the mount). This agrees with §4's last point.
- **§2's counted GPU bytes are small beside the GPU process's own growth:**
  - 12-42 MB counted here, against the ~300 MB the GPU process gained at match start on the owner's desktop (driver-side,
    not given back);
  - against that, the console reports 1 GB of physical memory and a 3 GB commit limit;
  - with `loseContextOnOutOfMemory` on, the pressure that matters may be the GPU process's, not the page's uploads;
  - none of it was measured on the console.
- **The program count is not the memory lever** (~0.36 MB a program on desktop D3D11). A change to the warm-up is a change
  to its timing and its peak, not to the programs' bytes.
- **The open questions are the handoff's own:**
  - the console's termination reason;
  - its peak process and GPU memory;
  - whether the whole-Edge exit and the white page share one cause;
  - behaviour across repeated matches.
  - v0.4.19's `contextdiag` settles none of the four, but it is the first instrument that reports from the field, with
    no recorder, where in the load a loss falls: the backend, the renderer's counts and the load phase reached, every 2 s
    from the mount and at the loss.
