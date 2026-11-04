# 125 -- The loading screen: `dlgLoad`'s records, the map's picture through `LoadingScreenAssets`, the disc's spin in each map's `LDZANIM.ZAR` (INT-LOADING)

Written 2026-10-02 for INT-LOADING, an interim viewer task ahead of ONL-18 (`../roadmap/05-online-front-end.md`
"ONL-18", the online table's N15), part of integrating Chris's browser-beta-v5 (`chris/browser-beta-integration`
d578f347: his `loadingAssets.ts`, `loadingPanel.ts`, `beta5LoadingAssets.test.ts`, and `docs/BETA5-ISO-FINDINGS.md`'s
"SpinLoadingCD has two 0.75-second segments"). Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line), the retail ELF on the disc (strings
by address), the dev disc `C:/Projects/socom_pc/game/disc` read with the repository's readers (`tools/dump-dialogs.ts
--dialog dlgLoad.rdr`; `@s2u/scene` `parseAnimSets`/`decodeUiProgram`/`missionUiVars`; probes outside the tree, names,
positions, sizes and counts only), and the owner's PCSX2 capture `C:/Projects/socom_pc/logs/parity/s4_pcsx2/A_ready012.png`
(Vigilance's loading screen; not in the tree). It builds on research 96 §7 (the dialog's fields), 103 R103.1 (`UILDLOC`),
105 (the dialog loader), 115 (LoadState) and 117 R117.13 (the bar); it does not restate them.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R125.1 | **`dlgLoad.rdr`'s records give every place, size, colour and scale** the screen draws: nine objects, background `LittleBlack.tif`, `LIBRARY common/assetlib/loading` (the map's `LOAD_TXR`), `FONT font_text_01` | `RUN/UI/READERC.ZAR` | §1 |
| R125.2 | **The picture's library is `mission.rdr`'s `LoadingScreenAssets`**, kept by the level load and opened by LoadingState: **`OMnn` on MP1-MP12, `LPnn` on MP51-MP83** (all 22 checked), the picture `ld_mp<n>_prog.tif` (512x256) by the `UiVars` entry `load_picture`. Research 91's "LPnn per ZDB" was wrong for the first twelve | `FUN_002acc10` D:L152347-152354, `FUN_001f6660` D:L55800-55814 | §2 |
| R125.3 | **`SpinLoadingCD` lives in each map's own `LDZANIM.ZAR`** (set `dlgLoad.rdr`, 6 animations, on all 22 MP maps), and in none of `UIZANIM`, `EXTZANIM` or `MPZANIM` -- Chris's finding, confirmed. It is two `OBJECT_MOTION_FROM_TO` scale motions of 0.75 s on `load_CD_Parent`, (1.1, 1.1) -> (0, 1) -> (1.1, 1.1), and a `LOOP`: a 1.5 s turn | the maps' `LDZANIM.ZAR` | §3 |
| R125.4 | **The spin is linear** at the stored rate (-1.4667 / s in x), snapped to "to" at each motion's end: read from the motion's tick, not chosen | `FUN_0025f9b0` D:L108850-109034 | §3 |
| R125.5 | **The progress bar's `load_back.tif` and `load_line.tif` are on no texture bank of the disc** (every `*_TXR.ZED`, loose and in the maps): the original has nothing to draw there, and the capture shows no bar | the disc | §4 |
| R125.6 | **The description is blank** (`mission_description` is `" "` on 21 maps, empty on MP64): the game type's instructions on the capture are part of the picture itself | `mission.rdr` | §2 |

## 1. The screen's records

`tools/dump-dialogs.ts --dialog dlgLoad.rdr` (the layout's own positions; `CHILDOF` relative):

| object | type | at | size / scale | source of its content |
|---|---|---|---|---|
| (background) | IMAGE | 0, 0 | the frame | `LittleBlack.tif` (8x8, `LOAD_TXR`) |
| `LoadingPicture` | IMAGE | 30, 120 | 580x210 | `UIVAR load_picture` |
| `LoadingBackground` | IMAGE | 337, 108 | 270x6 | `load_back.tif` -- on no bank (§4) |
| `load_progress_filling` | PROGRESSBAR | 337, 110 | 270x2 | `load_line.tif`, `UIVAR Load_progress` (R117.13) |
| `title` | TEXT | 30, 120 | scale 1.2, colour (14, 57, 65) | `UIVAR mission_title` |
| `description` | TEXT | 30, 357 | scale 1, `WIDTH 640`, `SPACING 15` | `UIVAR mission_description` |
| `ReturnToLobby` | TEXT | 320, 420 | scale 1.2, `HCENTERED` | `_2000_ToReturn_MSG` (`UILd` 2000) |
| `RateLevel` | TEXT | 30, 377 | scale 0.8 | `" "` (the script writes it, §3) |
| `load_CD_Parent` | IMAGE | 590, 360 | 40x40, no file | the spin's node |
| `load_CD_spinning` | IMAGE | -15, -15 under the parent | 30x30 | `loading_CD.tif` (64x64, `LOAD_TXR`) |

The screen's bindings: `ONSTART` -> `SpinLoadingCD`, `OnMenuStart`, `WatchForHDDError`; `ON_LOAD_COMPLETE` ->
`load_complete`; `MP_VERSION_NUMBER_ERROR` and `TRIANGLE` -> `exit_load_screen`. The font is `fonts.rdr`'s
`font_text_01` (`font_text_01.tif` 512x128 and `font_special_01.tif` 256x64, the map's `FONT_TXR`); the lobby line's
triangle is a `font_special_01` glyph.

## 2. The map's binding

The level load `FUN_002acc10` (called with 0x4364e0 from D:L47903, D:L123881, D:L126674) opens `mission.rdr` (0x3f19d0),
looks `LoadingScreenAssets` (0x3f19e0) up with `FUN_0032ee10` (D:L230104, a depth-first `FUN_0032f0e0`) and assigns it
to the string at 0x4364e0 + 0x183c = **0x437d1c** (`FUN_001eeb40`, a string assign; empty when absent), then registers
`UiVars` (0x3f19f8, `FUN_002af410`). LoadingState's Init `FUN_001f6660` reads that string (D:L55800-55814) and, when
it is not empty, opens the library through `FUN_00320d70`; a library path's file is its last element cut to four
characters (`FUN_003199c0`, `assetLibStem`). On the dev disc, every MP map:

- `LoadingScreenAssets` = `ui/assetlib/ld/om01` .. `om12` on MP1-MP12, `ui/assetlib/ld/lp51` .. `lp83` on MP51-MP83;
  the bank (`RUN\UI\OMnn_TXR.ZED` / `LPnn_TXR.ZED` in the map's ZDB) holds one texture, the picture;
- `load_picture` = `ld_mp<n>_prog.tif`, 512x256, drawn stretched over the 580x210 box;
- `mission_title` = the map's name; `mission_description` = `" "` (empty on MP64); the maps 51-83 also carry
  `load_progress_line`/`load_progress_back` (`load_line.tif`/`load_back.tif`) and `LOAD_PROGRESS`, which nothing on
  the screen names.

## 3. The scripts: `LDZANIM.ZAR`'s set `dlgLoad.rdr`

Every MP map's `LDZANIM.ZAR` (95 sets, research 77 §9) opens on the set `dlgLoad.rdr`: 32 names, 6 animations --
`SpinLoadingCD`, `OnMenuStart`, `WatchForHDDError`, `exit_load_screen`, `DisplayHDDError`, `load_complete`. None of
the three loose zAnim archives holds the set or the animation (the test `packages/ui/test/loading.test.ts`), which
answers research 96 §8's open question and ONL-18's "whether SpinLoadingCD/OnMenuStart/load_complete exist anywhere":
they exist, in the map. `dump-dialogs`' "(no set defines it)" is right of the three archives it reads, not of the game.

- **`SpinLoadingCD`**: one sequence -- `MOVE load_CD_Parent` flags 0x300 (scale, "from" stored), 0.75 s, scale (1.1,
  1.1) -> (0, 1), rate (-1.4667, -0.1333); the same back, (0, 1) -> (1.1, 1.1); `LOOP`. The motion's tick
  `FUN_0025f9b0` adds rate x dt to the current scale each tick (`FUN_003156e0` read, `FUN_00309180` scale,
  `FUN_00309240` add, `FUN_00315710` write; D:L109021-109027) and, once the elapsed time passes the motion's +0x34,
  writes "to" (D:L108922-108938) and passes the overrun on: **linear, exactly "to" at 0.75 s and 1.5 s**. So the disc
  narrows to nothing and widens again over 1.5 s, a coin turning on its upright axis -- the capture's disc is mid-turn.
  The scale is the parent's; the disc, hung at (-15, -15) under it, turns about the parent's place (590, 360) --
  `CHILD_SCALE_READING` (§7).
- **`OnMenuStart`**: `MENUFADER` opacity 1 -> 0 in 1.5 s; then on a network game (`IsNetwork`) `RateLevel` = `" "` and,
  for the session master, the valve `mp_locked_game` = 0 and `ForceMediusStatusReport`; offline, `ReturnToLobby` is
  hidden and `RateLevel` shows `UILd` 2001-2005 by the valve `ForGameCompleteScreen` (1-6) -- **the rank strings of
  N15 are the offline game-complete ratings**, not a ranked persona's.
- **`load_complete`**: on a late joiner hides `RedDown` and `LoadingText` (no such objects in `dlgLoad.rdr`).
- **`exit_load_screen`**: `AbortLoad` with `dlgNetAbort.rdr`; its second sequence fails offline.
- **`WatchForHDDError` / `DisplayHDDError`**: the HDD-error popups.

## 4. The bitmaps

`LOAD_TXR` holds two textures, `LittleBlack.tif` and `loading_CD.tif`. **`load_back.tif` and `load_line.tif` are on no
`*_TXR.ZED` of the disc**, loose or in a map (a probe over every bank). With R117.13 (the bar full from the first tick)
the original draws no bar; the capture `A_ready012.png` shows none. The reader lists the two as `unheld`.

## 5. The interim and what ONL-18 replaces

INT-LOADING draws the screen as a DOM canvas over the page (`packages/viewer/src/loadingPanel.ts`) while a map loads:
the worker reads the screen first and posts it (`loadingAssets.ts` `loadWithScreen`, the message `loading`) before the
map's load begins, as the load state builds `dlgLoad` before it loads (research 115 R115.10) -- read beside the map, it
came a few milliseconds before the map on a served tree; the map waits on it at most `LOADING_SCREEN_WAIT_PLACEHOLDER`
(§7) -- and the page shows it for the wanted load, hiding it when that map (or its error) arrives. The frame is
`loadingLayout.ts`'s quads -- `dlgLoad.rdr`'s objects through the dialogs' drawing rules of `armoryLayout.ts` (the
tree, the face, the colour on the GS's 128 scale, the face's 0.7 opacity) -- with the disc's scale from §3's keys,
and over it the fader, black at `loadingFaderAlpha` (`packages/ui/src/loading.ts`).

**The fade (review F1, 2026-10-02).** Two writers set the fader quad's (G+0x170, research 115 §1) alpha on every
frame of the load state. Its Tick `FUN_001f5e70` writes its own ramp first -- (1 - t/0.5) x 128 while it fades in
(D:L55662-55675), (t/0.5) x 128 once the map is loaded (D:L55748-55762), the switch to the core state at t > 0.5 s --
then runs G's tick, which plays `OnMenuStart` (an `ONSTART` binding beside `SpinLoadingCD`; its first command takes
`MENUFADER`'s opacity 1 -> 0 in 1.5 s on all 22 maps, the test `packages/ui/test/loading.test.ts`), then G's draw
`FUN_003691c0` (D:L55768-55769), whose 2D adaptor `FUN_0036d8b0` SETS the quad's alpha to opacity x 128 whenever the
stack's top is under 1 (research 112 R112.3). `dlgLoad` does not list `UIanim.rdr` (research 115 §5), so
`menu_fade_up` (R115.6) is not in play; `OnMenuStart`'s is. Read together: the drawn fade in is `OnMenuStart`'s
**1.5 s** from black, the load state's 0.5 s ramp overwritten from the first frame MENUFADER's opacity is under 127/128,
and the load state's fade out overwritten with 0 (the opacity held at "to") -- **no fade out is drawn**: the screen
holds 0.5 s after the load and cuts. `LOADING_FADE_READING` (§7); the interim draws it so, and now holds through browser readiness plus the 0.5 s completion hold (section 8).

ONL-18 replaces it with the generic dialog runtime and compositor (PLAT-05..PLAT-10, PLAT-13), and with what the
interim does not do: the TRIANGLE
binding (`exit_load_screen` -> `AbortLoad dlgNetAbort.rdr`), `ON_LOAD_COMPLETE`, the HDD watch, and the time the
original holds the screen (the map's own load, not the browser's decode). Since 2026-10-05 the interim holds through
the join's readiness (PR #10, section 8): `viewer/src/loadingJoin.ts`'s `LoadingJoin` is the completion source
`dlgLoad`'s `ON_LOAD_COMPLETE` can use. `ReturnToLobby` is drawn, as the original
draws it on a network game (§3 and the capture), though TRIANGLE does nothing yet.

## 6. Chris's work, compared

His reader took the same binding (`mission_title`, `load_picture`, `LoadingScreenAssets` -> its stem) and the same
banks (`LOAD`, `FONT`); ours keeps that and takes the dialog's own library and font names, reads the layout, the
spin and `UILd`, skips cleanly without a disc, and covers all 22 maps. His panel's numbers -- the picture at (30, 120,
580, 210), the title at (30, 120) x 1.2 in rgb(28, 114, 130), the disc 30 px at (575, 345), the scale 1.1 -> (0, 1)
-> 1.1 over 1.5 s -- **are the records' and the script's** (the colour is (14, 57, 65) x 2), read by hand and typed
in; ours reads them. His "SUPPRESSION COMBAT TEST" notice and its Arial fallback are not ported (no text of the page's
own is drawn); the triage's concern that the Crossroads picture describes Demolition while the browser runs other
rules is ONL-18's, with the game-mode work.

## 7. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `CHILD_SCALE_READING` (`viewer/src/loadingLayout.ts`) | how a node's scale reaches its children | a scale motion writes the node's matrix diagonal (`FUN_00315710`); the child's offset and size scale with it about the node's place. The 2D draw's matrix composition was not traced; the layout centres the 30x30 disc on its 40x40 parent, which only a scale about the parent's place keeps in place, and the capture's narrow disc sits at x 590 | open |
| `LOADING_SCREEN_WAIT_PLACEHOLDER` (`viewer/src/loadingAssets.ts`) | the most a map's load waits on its screen's reads, 3000 ms | a **browser adaptation**: the original reads both off its own disc and never stalls; a served tree can, and the map must not wait forever. The reads (the map archive's table of contents once, the members together: 18 requests, about eight round trips) took 0.54-0.61 s on MP2/MP72 at a simulated 50 ms a request, against 42 serial requests and 2.8-3.1 s when each member re-read the table (review F2, 2026-10-02) | open |
| `LOADING_FADE_READING` (`ui/src/loading.ts`) | what the fader over `dlgLoad` draws, with the load state's 0.5 s ramps and `OnMenuStart`'s MENUFADER fade both writing the one quad's alpha | `OnMenuStart`'s 1.5 s fade in from black, no fade out (§5): the order of the writes is the Tick's (`FUN_001f5e70`) and the overwrite the adaptor's (`FUN_0036d8b0`, R112.3); the walk's push for MENUFADER at the stack's base (`OPACITY_STACK_BASE_READING`, research 112) was read, not traced on a frame. A capture series of a load from black (`A_ready009..020`, ONL-18) settles it | open |
| `LOAD_NET_HOLD_READING` (`viewer/src/loadingJoin.ts`) | what the game object's byte +0xd0 that CLoadState's completion waits on online stands for (`FUN_001f5e70` D:L55748-55749) | its writers read (§8: D:L55685, D:L55707, D:L55733, all in the tick; conditions on +0xb0, +0xcc, +0xcd, +0x112 and the game state +0x113); those fields' meaning and the net layer's time-out (`FUN_002b83e0`, `FUN_002c2fa0`) not read. The browser's stand-in is the room's welcome (the net client `online`); the gap that the server's clock runs while a slow client loads is owed to ONL-18 / SVC-07a | open |
| `LOAD_NET_HOLD_CEILING_PLACEHOLDER` (`viewer/src/loadingJoin.ts`) | the most the screen holds on the wanted load's net client while it is `connecting`, 20 s | a **browser adaptation** (review F3 of the carry, 2026-10-05): the original's load state has no timer and exits to `dlgNetError` when its net layer fails (`FUN_002b83e0` D:L55718, `FUN_002c2fa0` D:L55725, not read); the page's client has no hello timeout and reaches `retrying` only on a close, so a server that opens the socket and never welcomes would hold forever. 20 s is the page's own choice, four times the server's heartbeat sweep (`HEARTBEAT_MS`, 5 s; a socket dropped 5-10 s after it stops answering). Reading the net layer's own time-out settles it | open |
| `UNHELD_BITMAP_READING` | what the engine draws for a `FILENAME` no loaded bank holds | nothing (the bar's two, §4); the texture lookup's failure path was not read | *note only* |

## 8. Frostfire join readiness (2026-10-02)

The `chris/map-loading-screen` adaptation reuses the disc-derived presentation. Its gate covers the scene before
the worker's bitmap reply, and holds the CD animation through world/prop warm-up, player clips and shader warm-up,
current-map Armory, effects and sound data, and the network room's welcome. The welcome is the readiness boundary,
not round start: the player still needs to use the Armory before telling the room they are ready. Offline mode
must likewise reach its Armory before its loopback room can be created. Releasing into the ARMORY is the browser's own
flow (W5.R1: the room opens it on a seat before its first spawn), not the console's: there the ARMORY is a row of the
game lobby before the load (`C:/Projects/socom_pc/logs/parity/s4_pcsx2/A_ready007`), and the load cuts from the loading
screen straight into the round (`A_ready020` the screen, `A_ready021` "STARTING ROUND 1 OF 11"; the series
`A_ready007..021`).

The original does hold its screen on a network condition: `FUN_001f5e70` (CLoadState's tick) starts the 0.5 s
completion only when `IsNetwork` (the byte 0x45a0c1, research 107) is 0 or the game object's (`DAT_00437ce8`, research
91) byte +0xd0 is set (D:L55748-55749). Its three writers are all in that tick, inside its network branch (the load
state's +0xd set and `IsNetwork`, D:L55678): set on a client (the host byte 0x45a0c0 clear, the branch D:L55679-55688)
when the object's +0xcc is clear, its word +0xb0 is not negative and its +0xcd is set (D:L55685); set on either machine
-- after the client/host branch (D:L55679-55698), with no host gate -- when +0xb0 is not negative and either +0x112 is 2
(written to 2 only in the host's branch, D:L55694) or +0xcc is clear and the game state +0x113 (written by
`FUN_002a7490`, D:L149349; the host's 3 in `FUN_002a7d40` D:L149762) is 3 (D:L55704-55707); cleared, while +0xcd is set
(D:L55731), when +0xb0 is negative (D:L55732-55733). Its failures do not hold: the tick
writes `dlgNetError.rdr` (0x3e2f60, D:L55712, D:L55720) or `dlgNetAbandoned.rdr` (0x3e2f70, D:L55737, D:L55742) into
the menu state's start dialog (0x408568, research 115 §7) and sets the load state's +0x1a, which ends the tick into the
menu state (D:L55598, D:L55781). What +0xb0, +0xcc, +0xcd and +0x112 stand for, and what times a silent server out
(the net layer's `FUN_002b83e0`, `FUN_002c2fa0`), were not read: `LOAD_NET_HOLD_READING` (§7). The browser's stand-in
for the byte is the room's welcome (the net client's `online`), the connection lane of `joinVerdict`. Only the client
made for the wanted load answers for it (`pageLanes`, review F1 of the carry, 2026-10-05): until `show` makes one --
the net client is made once the decoded map is back -- a named server holds on the connection lane, and a previous
map's client (its `online`, or its `refused`) never answers for the new load.

**A lane that cannot complete does not hold the screen** (review B1, 2026-10-05; `joinVerdict`, its tests
`viewer/test/loadingJoin.test.ts`). A refused join (room full, version mismatch, closed by the server) and a named
server whose client could not be made release the screen at once through `LoadingJoin.failed`: the map shows with the
Online line and the HUD saying why, as before the hold -- a **browser adaptation** of the original's exit to
`dlgNetError` (the front end's net error is ONL's, not the viewer's). A server that never answers holds the screen
while the net client is `connecting` and releases it, after the local lanes and the 0.5 s, once the client reaches its
own `retrying` state -- which follows only a socket that closes. A server that opens the socket and never sends the
welcome never closes it (the net client has no hello timeout), so its hold is capped at
`LOAD_NET_HOLD_CEILING_PLACEHOLDER` (20 s from this load's client first `connecting`, §7), after which the screen
releases the same way. Both are **browser adaptations**: no time is given in the load state's tick (above) -- the
original leaves for its net error screen when its net layer says so -- and the hold must not outlast what the client
itself calls a failed attempt, nor wait forever on a socket no one answers; the release ends the hold, not the
connection: the map shows and the status line keeps reporting the retry or the wait. The play answer without clips (no `MOTION_P.ZAR`: the bind
pose), a world whose warm-up rejected (the rejection surfaced as before) and an ARMORY whose data came with no context
count as done; a failed sound, effects, ARMORY or play request is an answer.

After those lanes finish it uses existing `LOAD_STATE_FADE_SECONDS` (0.5), from `FUN_001f5e70` D:L55748-55762,
before cutting to the prepared scene/Armory. This timing is reading, pending independent review; no new authored
delay or spin curve is introduced. Chris requested approximately 5–7 seconds. The original waits on actual loading;
the available Vigilance capture interval is about 12 seconds (research 91), not a Frostfire timing measurement.
That preference is H88, pending Craig. A deliberate minimum is not applied.

Full local retail ISO inspection through `IsoAssetSource`/`loadingFromDisc`, using read-only ranged reads, resolves
`RUN/MP2.ZDB`, `READERM.ZAR/mission.rdr` -> `OM02_TXR.ZED` / `OM02_PAL.ZED` -> `ld_mp2_prog.tif` (512x256),
`LOAD_TXR.ZED` -> `loading_cd.tif` (64x64), `FONT_TXR.ZED` -> `font_text_01.tif` (512x128), global
`RUN/UI/READERC.ZAR/dlgLoad.rdr` (nine objects), `RUN/READERC.ZAR/fonts.rdr`, and MP2's `LDZANIM.ZAR` ->
`SpinLoadingCD` (1.5-second loop). These are readings from the ISO, pending review, not console capture parity.
No ISO bytes or rendered asset screenshots are added to Git. Native layout, colour, font and spin readers remain
unchanged. Existing child-scale/fader readings and unimplemented Triangle return-to-lobby binding remain open.

### Validation and handoff

Results: 109 focused unit/dev-disc/doc checks passed, 0 failed, 0 skipped in the final combined run. All three
workspace type checks passed; the viewer production build passed. The rendered two-client regression passed
(1 test, 0 skipped) with movement/yaw and zero-shot assertions, before the final unit-covered map-switch retirement
and defensive canvas-tap guard. The map-switch cleanup was checked by the focused tests, not a new rendered
multi-map run. Existing original-capture and physical-controller gaps remain as listed below.

- Base: `origin/main` at `56c19e548165bbc9844bba50a97ce1272284a660`. Branch: `chris/map-loading-screen`.
- Source: `viewer/src/loadingJoin.ts` (readiness gate), `loadingPanel.ts` (deferred lifetime and immediate cover),
  `main.ts` (current-request lanes, input suspension), `styles.css` (pointer coverage), `hook.ts` (read-only diagnostics).
- Unit/dev-disc/doc command from `redotcom`: `npx vitest run packages/viewer/test/loadingJoin.test.ts
  packages/viewer/test/loadingPanel.test.ts packages/viewer/test/loadingAssets.test.ts
  packages/viewer/test/loadingLayout.test.ts packages/ui/test/loading.test.ts packages/viewer/test/flyAccess.test.ts
  tools/test/conventions.test.ts tools/test/placeholderLedger.test.ts --maxWorkers=1`, with `SOCOM_DISC` and
  `SOCOM_ISO`. The asset tests read all 22 existing loading bindings; no 22-map multiplayer suite was run.
- Rendered: `viewer/e2e/loadingJoin.spec.ts`, two Chromium WebGL2/SwiftShader clients using their own local ISO,
  one dedicated local MP2 server. A test-only delayed welcome verifies the original screen stays visible even
  after world warm-up; Enter, W, mouse click and a simulated standard controller cannot confirm, fire, move or
  turn during loading. Both clients release into a complete map, with normal Armory navigation where the menu
  remains open, and an active round. This is automated controller input, not a physical PC/Mac controller test.
- Run with `SOCOM_ISO`, a dedicated `LOADING_E2E_SERVER`, and optionally `LOADING_REVIEW_SCREENSHOT` pointing
  outside Git. Use the repository's Playwright config on unused ports (`E2E_PORT` / `E2E_LOCAL_PORT`). Stop/reset
  only your dedicated match between runs. Review screenshots are private local evidence, delivered in the task
  response; no original asset images are committed or uploaded as fixtures.
- Red: readiness tests initially could not import the new module; the new map-switch retirement test initially
  failed on the absent `begin` API. Existing lifetime behavior was also re-read: decode previously hid the panel.
- Earlier browser runs did not pass: an assertion confused asynchronous Armory initialization with navigation;
  another assumed a not-yet-created Armory's `committed` was false rather than null; one run was invalidated by
  a source edit causing Vite reload. A repeated Armory-open assertion exposed an actual existing countdown
  boundary, not missing loading data. `Room.countdownWith` starts when both sides are seated; the original
  pull-out/round-start callbacks can close the second client's menu behind its loading cover. The focused test
  keeps all loading/input assertions and tests the first-seat Armory; it does not require a second-seat menu
  after the existing countdown has closed it. No server countdown, balance, protocol or Armory rule is changed.
- Open multiplayer limitation: server round time can advance while a slow client is still loading. This patch
  guards the client presentation/input; it introduces no server-side all-clients-loaded barrier. That is a parity gap -- the original's
  hold waits on the game object's byte (`LOAD_NET_HOLD_READING`), which a server-side barrier would answer -- owed
  to ONL-18 and SVC-07a (readiness and launch). No claim of original network state-machine parity.
- Full suite, physical controllers, PC/Mac gameplay and console capture scoring were not run. The original
  capture archive remains unavailable on this host (H3); screenshot similarity is not a scored parity result.
- Existing build setup limitation: no compiled `libmpeg2.wasm`; loading does not depend on the movie decoder.
  The production build ships no disc files (`copyPublicDir: false`), only application code and shared web fonts.
- Separate unfinished audio-unlock work remains in its named local stash on `chris/armory-audio-unlock`;
  existing playable V5 ZIPs/folders are unchanged. No dependency on that patch is introduced here.
- Craig/fresh-session review requested through the draft PR: re-read layout/spin/timing citations and decide H88;
  no merge or publish is performed by this task.

CI follow-up (2026-10-05): GitHub Actions were removed from this repository on 2026-10-04 by the owner's ruling
(OT.R15), so the pull-request metadata check this note waited on no longer exists and its row was dropped at the merge
into Craig's lane; the gate is local (the pre-commit and pre-push leak check, and the suites run before a merge).
