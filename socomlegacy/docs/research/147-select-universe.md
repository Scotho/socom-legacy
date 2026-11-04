# 147 -- SELECT UNIVERSE (`dlgNetServerSelect`): the universe list from SVC-05's texts (ONL-04)

Written 2026-10-03 for ONL-04 (`../roadmap/05-online-front-end.md` "ONL-04", on the plan
`../plans/2026-10-02-online-path-target.md`, OT.R1-OT.R12). Sources: `dlgNetServerSelect.rdr`'s layout and set as
ONL-33's chapter reader decoded them (research 128 §4.3; `tools/test/onlineDialogs.pinned.json`); the dialog's record
through PLAT-05's `loadDialog` (the SERVERLIST's columns below are decoded data, RS.R8); the US disc's `UIMnLOC.rdr`
through `@s2u/scene`'s `readLocArchive`; the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`
(`D:L<n>` its line; `FUN_<addr>` its functions; cited, never pasted); the retail ELF's words and strings by address
(`tools/elfImage.ts`; the vtables and the one thunk read as instructions); the archived captures `A_34_universe.png`
(`logs/parity/s4_pcsx2/`, PCSX2 against our local Horizon) and `scripts/parity/refs/universe.png` (the recomp
harness's title crop). It stands on research 115 (the dialog host), 117 (the widgets; §2 below corrects its §13.1),
128 (the online dialogs), 131-133 (the services; SVC-05's texts) and 146 (the DNAS screen, whose `GetServerList` this
task's worker answers), and does not restate them.

The code: `packages/ui/src/screens/universeCommands.ts` (the query, the client's two lists, `LobbyDisconnect`,
`UpdateServerInfo`, `UNIVERSE_ENTRY_COMMANDS`); `packages/ui/src/widgets/listbox.ts` (the list's UIVAR rebuild, the
IMAGE cells); `packages/ui/src/widgets/host.ts` (`printUiVar` over an array); `packages/match/src/server.ts` (the
services' `http` handlers) and `main.ts` (`DATA_DIR`, `ALLOWED_ORIGINS`); `packages/viewer/src/universeHost.ts` (the
page's service) and `frontEnd.ts` (the session's list, the worker, the deep link; claimed in HANDOFF §3). The tests:
`packages/ui/test/screens/universeCommands.test.ts` (the bodies), `universeScreen.test.ts` (the machine over the disc's
own layout and set, from the disc or the committed fixtures: it runs in CI), `packages/ui/test/widgets/listbox.test.ts`
(the UIVAR), `packages/central/test/universeAnswer.test.ts` (the match server's answer over a `texts.json` written in the
test), `packages/viewer/test/universeHost.test.ts`, two cases in `packages/viewer/test/frontEnd.test.ts`,
`tools/test/universeEntryCommands.test.ts`; `tools/test/universeScore.test.ts` (the frame's score, dev host). Confidence:
**reading, pending review** for every transcription; the screen's frame score is **met** (§5: 99.0 against `A_34`,
95.3 on the title crop; re-taken at sprint 11's close, 2026-10-03, after ONL-04's first run found it not met while the
page drew nothing).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R147.1 | **The chapter names nine rows**: `LobbyDisconnect` and `UpdateServerInfo` are this task's (the table declares both for ONL-04); `SwitchMenu`, `PopUpDialog`, `KillPopUp` PLAT-10's; `ClearUIVar` MENU-01a's; `VerifyPatchLevel` (ONL-05), `LobbyConnect` (ONL-07) and `UnInitNetwork` (ONL-10) stay declared -- the CROSS on a universe and the TRIANGLE out are past the list | `UNIVERSE_ENTRY_COMMANDS`; `universeEntryCommands.test.ts` | §1 |
| R147.2 | **The query and its end**: `GetServerList`'s worker handler `FUN_002fb340` (D:L198714-198748) in phase 0 clears the entries (`FUN_002fff90(0x44fd50)`), clears the two done flags `DAT_0044fd80` / `DAT_0044fd88` and sends LobbyExt 0x03 with InfoType 3, encoding 2, language 1; in phase 1, once both flags are set, it writes **1** into the worker's valve (the `short` at the valve's +4, the watchers told on a change; D:L198727-198734) -- ONL-03's `NET_WORKER_RESULT_READING` read for this worker | `UniverseList.job` | §1 |
| R147.3 | **SERVER_LIST is built at the entries' end**: `FUN_002fdaf0` (D:L199953-200104) drops a non-success status (`FUN_002f42d0`: `status == 0`) with only the flag set; a success is appended, and on EndOfList (+0x2b4) the var is added at longevity 1 as an array of `[name, status word == 0, users, max users]` per universe (D:L200083-200101) | `UniverseList.entry` | §1 |
| R147.4 | **The news is never cleared**: `FUN_002fded0` (D:L200125-200144) appends each success to 0x44fd70's list; nothing but start-up (`FUN_003000a0(0x44fd70, 0x10)`, D:L328692-328695) empties it, so a second query (a return to SELECT UNIVERSE through the DNAS screen) shows the news twice | `UniverseList.newsChunk`; the unit test | §1 |
| R147.5 | **UpdateServerInfo** (`FUN_00274c00`, D:L121558-121596): SERVER_NEWS is an **array** `[description, "\n\n" (0x3ee8d8), news...]` added at 1; SERVER_NAME added at 1 with no value, then set to the name; an index past the list reads "" (`DAT_003f5de0`, `FUN_002fda50` D:L199919-199933, `FUN_002fdaa0` D:L199936-199949) | `UniverseCommands` | §1 |
| R147.6 | **The LISTBOX's UIVAR rebuilds its items** (corrects research 117 §13.1): the var is attached to the list's second base at +0x80 (vtable 0x4076e0), whose +0xc is the thunk 0x37d060 -- `j 0x3754d0; addiu a0, a0, -0x80` -- to `FUN_003754d0` (D:L270742-270826): an array var removes every item and makes one per element; an array element is one cell per column (`FUN_0037ae10` D:L273903-274064), an IMAGE column (D:L273987-274022) taking `TEXTURES[value % count]` at its SIZE | `listbox.ts`; `listbox.test.ts` | §2 |
| R147.7 | **The ONLINE dot**: SERVERLIST's second column is an IMAGE column, SIZE 12 x 12 at POSITION 325, TOP_OFFSET -18, TEXTURES `ping_dot_green.tif`, `ping_dot_red.tif`; the cell is `status word == 0`, so a status word of **0 draws red** and any other green -- our Horizon's 1 (and SVC-05's placeholder 1) draws `A_34`'s green dot. Research 133 §5's open "status word's meaning" is answered for the client's side | the screen test | §2 |
| R147.8 | **The news is printed whole** (`FUN_003860f0` over the array, D:L279730-279791, into `FUN_00379260`'s 0x2903-byte buffer, `FUN_003860f0(var, buffer, 0x2903)` at D:L273005: `VAR_PRINT_BYTES`, applied to the TEXT's and WRAPPEDTEXT's var alike since the review's finding 2) and wrapped; a chunk that does not fit what is left of it is not printed; a line's leading spaces and newlines are skipped by the wrap (`wrapLines`), so the blank line between the description and the news is never drawn -- `A_34` shows none either | `printUiVar`; the screen test | §2 |
| R147.9 | **The match server answers the query** at `POST /texts/universe` (SVC-05's `textsHandler`, now mounted by `MatchServer`'s `http` handlers when `main.ts` has `DATA_DIR`), every field `FUN_002fdaf0` and `FUN_002fded0` read; the page asks it through `universeHost.ts` (`UNIVERSE_SERVICE_URL_READING`) | `universeAnswer.test.ts`; `universeHost.test.ts` | §4 |
| R147.10 | **The score is met** (2026-10-03, sprint 11's close; ONL-04's first run, 72.9 = the black control, was taken while the page drew no bitmap or glyph, the cause retired at ONL-01's merge): the screen run on the disc and drawn by the page's drawer scores 99.0 against `A_34` (4:3 corrected; control 72.9) on arrival, the row lit (98.9 with the row unlit, the arrival frame until FOCUS-RING, 2026-10-03: §6), 95.3 on the title crop `refs/universe.png` (control 80.0); the one visible difference the placeholder texts (H73). The recomp's `01_universe.png` frames on record are all the DNAS screen's LOCATING stage, never SELECT UNIVERSE | `tools/test/universeScore.test.ts` | §5 |

## 1. The rows and the lists (R147.1-R147.5)

The chapter's nine command lines (ONL-33's pin) and who answers each are `UNIVERSE_ENTRY_COMMANDS`, held to the pin by
`tools/test/universeEntryCommands.test.ts` as ONL-03's list is. The set: ONSTART `enter_server_select` --
`LobbyDisconnect(NA)`, `CALL ChangeServerFocus` (`SERVERLIST.op6(SELECTED_SERVER)`, GetFocusIndex into the valve;
`UpdateServerInfo(SELECTED_SERVER)`); SERVERLIST's ONFOCUS runs `ChangeServerFocus` again; TRIGGER_L1 / TRIGGER_L2 (each
bound twice) run `scroll_policy_up` / `_down`: `server_news.op4` / `op5`, WRAPPEDTEXT's `Scroll_Up` / `Scroll_Down`
(research 117 §13.8); SERVERLIST's CROSS `select_server`; TRIANGLE `exit_server_select`; `MP_SUCCESS`
`server_connected`; `MP_MEDIUS_ERROR` `OnNetError`.

**The client's lists.** `UniverseList` is the pair of vectors at 0x44fd50 (entries, 0x3d8 bytes each) and 0x44fd70
(news, 0x120 each) with their done flags. `job(service)` is the worker ONL-03's `GetServerList` polls (`NetJob`): made,
it runs phase 0 (the entries cleared, the flags cleared, the query sent); each poll is phase 1's test; ended, the result
is 1. The replies are applied in the order the server sends them: the entries, then the news (research 133 §1). A
query never answered -- no server, a refusal, a reply of another shape -- leaves the flags clear: the worker runs on,
LOCATING stands on the DNAS screen and its 90-s watchdog reboots (research 146 R146.9), as the console would without a
MUIS answer.

**`LobbyDisconnect`** (`FUN_00274d60`, D:L121599-121614): the lobby connection (0x44fe10) asked whether it is up; up,
disconnected (`FUN_003043e0`); down, `FUN_002dfdd0(0x44f370)`, not followed (`LOBBY_DISCONNECT_READING`). Answer 1. The
port has no lobby connection before ONL-07's `LobbyConnect`; the page's hook is told and nothing else happens.

## 2. The list and the news on the screen (R147.6-R147.8)

**The correction to research 117 §13.1.** That note read the primary vtable (0x407670) +0x8c, which is 0, and concluded
the list's UIVAR only names its background bitmap. The var is attached at the list's +0x80 (`FUN_00385df0(list + 0x80,
var)`, D:L271185), whose own vtable is 0x4076e0 = 0x407670 + 0x70 (the constructor `FUN_0037e8b0` stores it,
D:L275813); its +0xc, which the set-up calls at once and the manager calls on every change, is 0x37d060: two
instructions, `j 0x3754d0` and `addiu a0, a0, -0x80` (read in the ELF) -- `FUN_003754d0` with the list itself. That
callback acts on an array node only: RemoveAllItems (`FUN_00375c70`), one item per element (`FUN_0036bbc0`
D:L265826-265906: a string element one text cell; an array element `FUN_0037ae10`'s cells, up to the column count), each
added at the end; AUTOSCROLL's focus on the last (D:L270789-270793); then the list's `ON_UPDATE_UIVAR` (0x2e) bindings started
(`FUN_0026a250(0x414bb0, ..)` with the binding's ARGUMENT or none, D:L270806-270822). The draw's string-var bitmap (+0x84,
D:L269994-270009) stands as research 117 has it. Two parts of the callback are not followed:
the walk over the items' +0x30 with +0x160 / +0x164 (D:L270794-270805; research 144 §3's
`LISTBOX_REBUILD_CONTENT_PASS_READING`, which this note's `LISTBOX_UIVAR_WIDTH_PASS_READING` duplicated until the merge
with ONL-01 on 2026-10-03, §7) and `LISTBOX_ARRAY_CELL_KEYS_READING` (a cell that is itself an array, read by `VALUE` /
`COLOR` / `DISABLED`). ONL-01 (research 144 §3) read the same callback independently; the merge kept one `itemsFromUiVar`
with this note's cells (the IMAGE column, the 800-byte cell buffer, the array cell's keys) and ONL-01's name for the
content pass, and the bindings through `WidgetContext.animation` (this note's shape).

**SERVERLIST** (the disc's record): at (15, 90), 610 x 112, SPACING 20, SCALE 0.9, TOP_MARGIN 31, LEFT_MARGIN 8, PADHOG,
the highlight `brown_back.tif` in all three states, the arrows `arrow_top.tif` / `arrow_botm.tif`, NORMAL_COLOR 128 grey,
ACTIVE_COLOR and PRESSED_COLOR (91, 72, 36); four columns: text at 65 (the name), IMAGE at 325 (12 x 12, TOP_OFFSET
-18, `ping_dot_green.tif`, `ping_dot_red.tif`), text right-justified at 405 (USERS), text at 435 (MAX USERS). A text
cell's integer is printed `%d` (0x3fa4b0) into an 800-byte buffer. The IMAGE cell is a 128-grey quad at the cell's
place (`FUN_0037ab90` D:L273838-273842: the column's +4 and +0x10), not recoloured by the row's look, inside the list's
scissor. SVC-05's placeholder (status word 1, 256 users, our Horizon's) gives one row: `PLACEHOLDER UNIVERSE`, the green
dot, `0`, `256` -- `A_34`'s shape with the owner's name to come (H73).

**The news** (`server_news`, WRAPPEDTEXT on SERVER_NEWS): `FUN_00379260` prints the array element by element
(`printUiVar`: a string only when its length + 2 fits what is left, an integer or real only past 15 bytes, an array only
past 5) and wraps it. The description and the news therefore run as one text; the wrap skips the separator's newlines
at a line's start, so no blank line is drawn. L2 moves the news one pitch down when it has more rows than its
HEIGHT, L1 back (the screen test: a long news text).

## 3. The machine (the screen test)

`packages/ui/test/screens/universeScreen.test.ts` runs PLAT-10's machine over the disc's `READERC.ZAR` and `UIZANIM.ZAR`
(the disc, else the committed fixtures) with every module of the path in PLAT-08's host and a fake service:
`init_socom_online` on the DNAS screen sends the query once (InfoType 3, 2, 1); with the answer inside the first poll
SELECT UNIVERSE is built on tick 83, research 146's timing unchanged; `enter_server_select` leaves no row to a later
task; SERVERLIST shows the row and the dot; SERVER_NEWS is wrapped into `server_news`; a service still answering holds
LOCATING and SELECT UNIVERSE comes when it answers; a deep link with the list read first shows the same; with two
universes, DOWN on the list moves the focus, ONFOCUS runs `ChangeServerFocus`, and the news and SERVER_NAME follow the
focused universe; L2 / L1 scroll the news.

> Settled 2026-10-03 (FOCUS-RING, research 116 §17): the paragraph below is the record of the drift. `MainWindow`'s bit
> is cleared when it is built (the plain bitmap's constructor, D:L278176), the LISTBOX's is set (D:L275854), so the
> build's focus is `SERVERLIST` with no press and its row is drawn in ACTIVE_COLOR on arrival, as `A_34` shows. The test
> pins that.

**An open drift (§6).** The ring starts on the layout's first control, `MainWindow` -- an IMAGE among CONTROLS, enabled
by research 116's `RING_ENABLED_READING` (and its +0x48 is the shared 0x1fe270, the +0x14 bit 7 test, read in the ELF
for the IMAGE class 0x407950 and the LISTBOX 0x407670 alike) -- so the list stands NORMAL until the first DOWN. `A_34`
draws the row's text in ACTIVE_COLOR (its brightest text pixel 141, 116, 61: the gold of (91, 72, 36), not the 128
grey), with no press on record before the frame. Either the IMAGE control's bit is cleared by its set-up (not traced)
or the s4 walk pressed DOWN; the test pins today's behaviour and names it.

## 4. The server and the page (R147.9)

`MatchServer` takes `http` handlers, asked in order before its 404; `main.ts` mounts SVC-05's `textsHandler` when
`DATA_DIR` names the services' directory (SVC-04's `services.json` and SVC-05's `texts.json`, the placeholder written
into an empty one, a warning logged while it is the placeholder; each row's USERS (+0x224) the server's live count,
`MatchServer.userCount`: the pages joined to a room now, players and spectators, a socket without its hello not counted
-- the review's finding 1; our Horizon's MUIS sends 0, `MUIS.cs:320`, and `A_34` shows 0) with `ALLOWED_ORIGINS`' page origins;
`deploy/env.example` names both, commented. Unset, nothing is mounted: the deployed server's surface (`/health`,
`/rooms`, `/ws`, OWNER-4) is unchanged; mounting `/texts/*` on the deploy -- the volume, the Caddy route, the origins --
is the owner's (HUMAN_TASKS H32: "Deploying the service ... the owner's hand"); no new row. `packages/central/test/universeAnswer.test.ts` writes a `texts.json` (one universe "SOCOM
II Local", status word 1, 256 users, a description and a news text), opens the server on it and posts the client's
query: the answer is the LobbyExt 0x04 entry with every field `FUN_002fdaf0` reads and the 0xc9 news chunk; a second
case over MP2 from the fixtures holds USERS at 0 with nobody in or a socket that never said hello, 1 while a page is
joined, 0 again when it leaves.

The page: `universeHost.ts`'s `fetchUniverseService` posts the query as JSON and checks the reply field by field;
`universeServiceBase` is the address's `server=` (its WebSocket URL, OT.R9's parameter, over HTTP at its origin), else
the page's own origin (`UNIVERSE_SERVICE_URL_READING`; ONL-01 is to hand the card's configured server instead,
research 136 §4). `FrontEndSession` keeps one `UniverseList` (`universes`), hands `GetServerList` its worker over the
service and registers `UniverseCommands`; a deep link to `dlgNetServerSelect.rdr` reads the list before the session is
made (`universeReply`), as the DNAS screen leaves it -- a browser adaptation of the deep link, nothing of the original.

**The browser run** (2026-10-03, the lock FREE; Chromium over Playwright, Vite on 5350, the match server on 8825 from
`npx tsx src/main.ts` with `DATA_DIR` in the task's scratch folder and `ALLOWED_ORIGINS=http://localhost:5350`;
`?devmode&menuflow=dlgNetServerSelect.rdr&server=ws://localhost:8825/ws`): the server wrote the placeholder
`texts.json`, warned, and logged the page's query (`texts`, op `universe`, HTTP 200; the CORS preflight is answered
without a log line); the page's hook read
`dlgNetServerSelect.rdr` at `/main/online/dnas/universe`, SERVERLIST's one row `PLACEHOLDER UNIVERSE`, the green dot,
`0`, `256`, SERVER_NAME and SERVER_NEWS the placeholder's texts, a 29-item draw list; the canvas black (§5).
> Superseded 2026-10-03 (sprint 11's close): the canvas was black because that base drew no bitmap or glyph; the
> preview re-run after the merges (the plan's Log, 2026-10-03 ~23:30Z) draws the screen with the placeholder's
> universe, the green dot, 0 / 256 and the news, and §5's score is now taken on the drawn frame.

## 5. The score (R147.10)

**The score, taken at sprint 11's close** (2026-10-03; `tools/test/universeScore.test.ts`, dev host: the disc and
`SOCOM_PC_ROOT`'s captures, skipping without): SELECT UNIVERSE run on the disc -- `universeScreen.test.ts`'s rig with
the disc's faces (`FONTS_RDR`) and the MP2 captions, the placeholder universe answering the query -- reached by the
deep link and through the DNAS screen's `init_socom_online` (the two frames byte-equal), drawn by PLAT-14's drawer
(`rasterizeUiDrawList`) with the page's UIMP bank (`frontEndAssets.ts`), nothing undrawn but the 3D pass (`models`),
and scored through `tools/captureScore.ts`'s `judge` against the manifest row `online.select-universe`:

| reference | ours | control | verdict |
|---|---|---|---|
| `A_34_universe.png` (PCSX2, 640 x 480; the 4:3 correction, W7.R7), the settled frame: the list focused and its row lit on arrival (since FOCUS-RING, 2026-10-03, §6) | 99.0 | 72.9 | met |
| the same frame as it was until then (the focus on `MainWindow`, the row unlit; the lit row came "after one DOWN", 99.0) | 98.9 | 72.9 | met; no longer a state the port shows |
| `refs/universe.png` (the recomp's title crop, 245 x 24; ours cut as the harness cuts it: grey, 320 x 224 bicubic, the `universe` box [5, 8, 250, 32] of `refs.json`) | 95.3 | 80.0 | met |
| the recomp's `01_universe.png` | -- | -- | every archived one is the DNAS screen's LOCATING stage (`online.locating-universes`): not a SELECT UNIVERSE frame, never scored against this state (W9.R8, W9.R12) |

**The one visible difference** is the texts: the universe's name, description and news are the placeholder's
(`SOCOM II Local`, `Local universe for SOCOM II`, `Welcome to SOCOM II.`), not our Horizon's of `A_34`, until the
owner writes ours (H73); that difference is the texts', not the screen's. The numbers are pinned by the test; a
drawing change that moves one moves this table with it.

**ONL-04's first score** (kept for the record; superseded 2026-10-03 by the table above): through `tools/captureScore.ts`
(`judge`, `controlScore`) and `tools/captureRefs.ts` (`cropRefDistance` over the `universe` box of `refs.json`), the
page's 640 x 448 frame of §4's browser run:

| reference | ours | the reference against itself / its control | verdict |
|---|---|---|---|
| `A_34_universe.png` (PCSX2, 640 x 480) | 72.9 | black control 72.9 | not met: ours is the black frame |
| `refs/universe.png` (the recomp's title crop, 245 x 24) | no match (a flat frame: distance unbounded) | `A_34` finds it at 0.117 (bar 0.45) | not met |

The cause then: the page drew no bitmap and no glyph (research 115 §15's textures placeholder,
`FRONT_END_TEXTURES_PLACEHOLDER`; PLAT-13's glyph draw and MENU-02a's textures were not on ONL-04's base), so every
frame of the front end was black whatever its nodes held; and the page resolved no `UIMnLOC` id (research 146 §6,
finding 1).
> Superseded 2026-10-03: that cause was retired at ONL-01's merge (the page's banks and captions,
> `frontEndAssets.ts`), nine hours before ONL-04 merged; the close review's pass 1 re-drew the screen and found the
> clause met, and the table above re-derives its numbers (`tools/test/universeScore.test.ts`, the drawer handed no
> texture reproduces the old 72.9 = the control).

## 6. Unknowns, drifts, and what is not done

- **The initial focus** (§3): settled 2026-10-03 by FOCUS-RING (research 116 §17) at the reading level. It read:
  "`A_34` shows the list active; the port starts on `MainWindow`. PLAT-11's to settle (the IMAGE control's set-up, or a
  trace of the focus at the build, PLAT-36)". The IMAGE control's set-up is what it was: its constructor clears the
  enabled bit, the list's sets it, and the build's focus is the list. A trace of the focus at the build (PLAT-36)
  would make it proven.
- **What `FUN_002dfdd0(0x44f370)` does** when no lobby is up (`LOBBY_DISCONNECT_READING`). *(Read 2026-10-05,
  ONL-07, research 157 §2: with the session flag set it clears the flag, closes the transport and resets the lobby's
  lists; the page's hook is the lobby client's `disconnect`.)*
- **The callback's width pass and array cells** (`LISTBOX_REBUILD_CONTENT_PASS_READING`, research 144 §3;
  `LISTBOX_ARRAY_CELL_KEYS_READING`).
- **The extended info's two words** (research 133 §5): `FUN_002fdaf0` splits +0x2b5 on space and tab into a 32- and a
  128-byte word that nothing on this screen reads; still not traced.
  > Traced 2026-10-04 by ONL-06 (research 153 R153.7): the first word (+0x338) is the patch level `VerifyPatchLevel`
  > tests against `r0001`, the second (+0x358) the patch server it puts into `PatchServerURL`.
- **Not done here**: CROSS on a universe (`VerifyPatchLevel` ONL-05, `LobbyConnect` ONL-07, the #614 popup); TRIANGLE's
  `UnInitNetwork` (ONL-10); `OnNetError`'s popup. The services' deploy mount (H32's). (The page's `UIMnLOC` table, its
  bitmaps and glyphs, on which the score waited, are on the tree since ONL-01's merge: §5.)
  > 2026-10-04, ONL-06 (research 153 §2, §3): `VerifyPatchLevel` and `LobbyConnect` are transcribed
  > (`personaCommands.ts`) and CROSS reaches the persona form as `select_server` and `server_connected` have it; the
  > connection itself is still ONL-07's (`LOBBY_CONNECT_PLACEHOLDER`). R147.1's "stay declared" holds for
  > `UnInitNetwork` alone.
- **The entry's DNS and port** are carried to the page (`UniverseEntry.dns` / `.port`) and used by nothing yet: CROSS's
  `LobbyConnect` (ONL-07) is to read them.
  > 2026-10-04, ONL-06: `LobbyConnect` reads them into LOBBY_HOST and LOBBY_PORT, the address a persona is filed under
  > (research 153 §5, `PERSONA_HOST_PLACEHOLDER`).
- **USERS counts the match server's pages**, not a lobby's users: there is no lobby before ONL-07; the count to show
  when one exists (the universe's logged-in users, our Horizon's MUIS sends 0) is ONL-07's to settle.
  > 2026-10-18, SA-16 (the server split): the universe's USERS is **central's live lobby sessions** -- `RoomService`'s
  > sessions (`lobby.ts` `sessionCount`: an account from its first lobby call to its account session's end, a player in
  > a host's game included), handed to `ServerTexts` by `main.ts` through `universeUsers`
  > (`serverTexts.ts`) -- wherever SELECT UNIVERSE is served (central serves `/texts/*` only with a data directory, which
  > always mounts the services): an `?mp` test-room page with no login used to count 1 and now counts 0; a player in the
  > lobby but in no room used to count 0 and now counts 1. A session ends at the account session's end (a logout, a
  > takeover, the lifetime, or the idle expiry, up to `SESSION_SILENT_MS_READING`, 300 s: a killed tab stays counted up
  > to 5 minutes). The hosts' reported users leave the sum (their players hold lobby sessions: no double count). The rule is chosen,
  > not read -- `UNIVERSE_USERS_PLACEHOLDER` (§7) -- since the original's count is unobservable. The universe's **name**
  > is the owner's: HUMAN_TASKS, "The universe's name on SELECT UNIVERSE", answered 2026-10-17: "SOCOM 2 Legacy"
  > (the default `texts.json`'s, `SERVER_TEXTS_PLACEHOLDER`); its description, news and the agreement stay H73's.
- **The deployed server** mounts `/texts/*` only with `DATA_DIR` and `ALLOWED_ORIGINS` set (H32's deploy).
- **H73** already asks the owner for the universe's name, description and news; no other row is added for them.

## 7. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `LOBBY_DISCONNECT_READING` (`packages/ui/src/screens/universeCommands.ts`) | the page's lobby told; `FUN_002dfdd0` not followed | no lobby connection exists before ONL-07 | the function read, with ONL-07's lobby |
| `LISTBOX_UIVAR_WIDTH_PASS_READING` (was `packages/ui/src/widgets/listbox.ts`; retired 2026-10-03) | not applied | `FUN_003754d0`'s walk over the items' +0x30 (D:L270794-270805) was not read; ONL-01 named the same reading first | replaced by research 144 §3's `LISTBOX_REBUILD_CONTENT_PASS_READING` at the merge with ONL-01 |
| `LISTBOX_ARRAY_CELL_KEYS_READING` (`packages/ui/src/widgets/listbox.ts`) | `VALUE` as the text; `COLOR` the cell's own colour; `DISABLED` the item not selectable | *(2026-10-05, ONL-14, research 164 §3: both applied -- `COLOR` through 0x37bd60, `DISABLED` clearing the item's +0x24; the PLAY LIST's rows the first release does not offer write them.)* | the lookup's wider form (`FUN_0032f0e0`: the key at any index, nested arrays), when a list needs it |
| `UNIVERSE_SERVICE_URL_READING` (`packages/viewer/src/universeHost.ts`) | `server=`'s origin over HTTP, else the page's own | a browser adaptation (OT.R3: no DNS); the card's configured server is ONL-01's to hand in | ONL-01 passing the card's `server` (research 136 §4) |
| `NET_WORKER_RESULT_READING` (research 146 §7) | 1 | for `GetServerList`'s worker, now read: phase 1 writes 1 (D:L198727-198734) | `InitNetwork`'s worker's handler, still not followed |
| `UNIVERSE_USERS_PLACEHOLDER` (`packages/central/src/serverTexts.ts`; `lobby.ts` `sessionCount`) | central's live lobby sessions (SA-16), each until its account session ends (a killed tab up to 300 s, `SESSION_SILENT_MS_READING`) | the universe's USERS (+0x224, `FUN_002fdaf0` D:L199953-200104): the rule chosen, the original's count unobservable (our Horizon's MUIS sends 0, `MUIS.cs:320`) | a capture of the original's SELECT UNIVERSE with a known population online, or MUIS's own count read |
