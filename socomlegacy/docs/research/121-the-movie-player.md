# 121 -- The movie player: the shell's background player, the PlayMPEG movie state, the end event, loop, skip and pace (web sprint 9, PLAT-21)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`, ruling W9.R5 gives
this note its number; task PLAT-21 in `../roadmap/01-platform.md`, "What the original does" and "Unknowns"). Read-only
research, the reading the PLAT-21 implementer transcribes. Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address **retail**); the
retail ELF on the disc (`game/disc/socom2_game.elf`), read by address with `tools/elfImage.ts` (`ElfImage.cstr`,
`u32`, `readBindingTable`, and a scan of the PT_LOAD words for a function's address or its `jal`); for the three
functions the decompilation has no body for (`CMenuState_Tick` 0x1f4640, the movie state's tick 0x1ed010 and
`UIPlayMPEGNoFade` 0x27aa70), the instructions themselves, read off the recomp's generated listing of the same ELF
(`recomp/output/*_0x<addr>.cpp`, the disassembly comments; read, nothing copied); the library names of
`recomp/socom2_names.csv` (`sceMpegGetPicture` 0x1bb990, `sceMpegReset` 0x1bbad8, `setjmp` 0x198320, `longjmp`
0x198378, `sceGsSyncV` 0x1a2110, `scePad2GetButtonInfo` 0x1bda78); the disc's `RUN/UI/READERC.ZAR` and
`RUN/UIZANIM.ZAR` through `tools/dump-dialogs.ts` and `@s2u/archive` / `@s2u/scene`; the movie files'
picture counts and PTS by a scratch scan (§10); web research 96 §3.2 and 98 §§1-3, 7.3; PC research 09
(`docs/research/09-menu-movie-ipu.md`, the recomp's movie fix). Names, addresses, offsets and counts only: no
decompiled text, no disc bytes.

No code and no test is part of this note; §2's table is written for PLAT-21's unit test with a synthetic picture
source, and §12 lists the readings it will have to carry.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R121.1 | **There are two players, one decoder.** The *background player* belongs to the UI shell (the dialog manager): a dialog whose `BACKGROUND TYPE` is `MPEG` opens its movie when it is built and the menu state ticks it once a frame (`FUN_00366940`, called first thing in `CMenuState_Tick` 0x1f4640). The *movie state* is a game state of its own that `PlayMPEG` / `PlayMPEGNoFade` push over the menu (`FUN_001ed560` init, 0x1ed010 tick, `FUN_001eccf0` exit). Both drive the one global decoder (`FUN_003098e0` open, `FUN_00309850` one picture, `FUN_003096c0` ended, `FUN_003096f0` close, `FUN_00309560` restart) | D:L262866-262900; D:L51104-51369; D:L207664-207818 | §1 |
| R121.2 | **The background player's machine** (§2's table): with a movie and playing, a tick either presents one picture or -- once the stream has ended -- fires event 3 (ONMPEGEND) and then restarts the stream when the dialog's loop flag is set, else closes it. A stopped player does nothing. The event is fired at most once per end: after it the player is either closed or restarted | `FUN_00366940` D:L262877-262897 | §2 |
| R121.3 | **ONMPEGEND is event 3** (`ONSTART` 0, `ONEXIT` 1, `ONACTIVATE` 2, `ONMPEGEND` 3: the name table of `FUN_001f3bf0`, D:L54435-54444, strings 0x3e2850, 0x3e2848, 0x3e2838, 0x3e2828). It goes to **the shell's current dialog** and starts **every** EVENT binding of that dialog whose event is 3, in record order (`FUN_00367810` D:L263357-263396). It cannot reach a dialog other than the one whose movie ended: leaving a dialog closes its movie first (§4) | D:L262888; D:L263357-263396 | §4 |
| R121.4 | **A movie that fails to open ends at once**: the dialog build fires event 3 in the same build when the dialog has a movie and the open failed (D:L263762-263764). `BackgroundMPEG ON` that fails does not fire it (`FUN_00366a00` D:L262903-262943 has no event) | D:L263762-263764 | §4 |
| R121.5 | **No retail dialog loops.** The loop flag is `TYPE MPEG_LOOPING` (type 2; `IMAGE` 0, `MPEG` 1, the parse at D:L277326-277343, strings 0x3f9de8, 0x3fa068, 0x3fa070); none of READERC's dialogs says `MPEG_LOOPING` -- the nine `MPEG` backgrounds, `dlgMenu`'s `menuloop.pss` among them, are all type 1. The restart path (`FUN_00309560`) is unreached by the disc's data. The roadmap's "MENULOOP created and looped" and PC research 09's "the shell's loop restart fires at the end of MENULOOP" do not hold on this read (§5, §11) | D:L263745-263760; D:L277326-277343 | §5 |
| R121.6 | **The restart seeks, it does not reopen**: stop and reset the decoder, seek the open file (or the CD stream) to its start (`FUN_0030baf0` D:L208953-208971), clear the buffers and create the decoder again; the end tick presents no picture and picture 0 comes on the next tick. Its frame-buffer arguments are shifted by 5 where the open's are not (D:L207694 against D:L207812): **believed a defect** of the unreached path (§5) | `FUN_00309560` D:L207664-207698 | §5 |
| R121.7 | **The background player has no skip.** `FUN_00366940` reads no pad. A cinematic dialog is skipped by its own `BUTTON` bindings (e.g. `dlgSecondCinematic`'s 13 keys -> `goto_menu`), which switch the dialog and so close the movie; `dlgIntroCinematic` binds none, so SONY448 cannot be skipped by any binding (research 98 §5's open item, at the reading level) | D:L262866-262900; research 96 §3.2 | §6 |
| R121.8 | **The movie state skips on CROSS released**: at the top of each tick, when the pad's CROSS slot is in its "released this frame" state (3) and no fade runs, a 1.1 s timer starts. With `FADE` (the default) the output alpha falls from 255 to 0 over 1.0 s, holds 0 for 0.1 s, then the state closes the movie and pops; without it, alpha 0 and close on the same tick. A natural end closes and pops at once, no fade | 0x1ed044-0x1ed174; `FUN_002d9ff0` D:L179128-179186; `FUN_002da930` D:L179845 | §6 |
| R121.9 | **The pace is the game's frame, not the PTS.** Each tick decodes and uploads exactly one picture (`sceMpegGetPicture` retried until it returns one, D:L208692-208699); the TIMESTAMP callback only sets a flag no code reads (D:L208419; `DAT_00451db0`). The menu's frame is capped at 30/s (`DAT_003e1400` = 0x1e, `FUN_003aff30` D:L304746-304749; the open sets 30, the close restores 30) -- two NTSC fields, so **29.97 pictures per second** when a frame fits in two fields | §9 | §9 |
| R121.10 | **The picture is the bottom of the frame.** The background tick runs before the menu's input, update and draw and uploads the picture straight into the frame buffer being drawn (`FUN_0030b740`, the packet chosen by the current draw buffer `DAT_004a44b4`, D:L208733-208746); the dialog draws over it. A tick with no new picture leaves that buffer as the frame before left it -- what that shows is not settled (`MOVIE_HOLD_READING`) | 0x1f4660; D:L208678-208763 | §7 |
| R121.11 | **Leaving and re-entering a BACKGROUND MPEG dialog starts its movie from picture 0**: the build first unloads the old dialog (`FUN_00369210`, which closes a playing movie, D:L264407-264409, and clears the has-movie flag, D:L264422), then opens the new one's file fresh. The same holds after a pushed state returns (`FUN_001f45e0`: restart, then `ON_STATE_POP`, then two frames not presented) and after `BackgroundMPEG ON` | D:L263450; D:L54766-54776 | §8 |
| R121.12 | **The four names**: `BackgroundMPEG` (row 135, id 136, 0x27a420) starts, stops or retargets the current dialog's background; `PlayMPEG` (row 22, id 23, 0x27ab30, parse 0x27ad60) and `PlayMPEGNoFade` (row 133, id 134, 0x27aa70) push the movie state; **`PlayMovie` is not a binding** -- it is the name of an animation in the sets of `dlgArtGal2`, `dlgMakeMusicMovie` and `dlgPlayTutMovies`, which calls `PlayMPEG` | `readBindingTable` 0x3dd4d0 | §3 |
| R121.13 | **What the boot asks of the player** (research 98 §§1-3, 96 §3.2): open on the dialog's build after its ONSTART; one picture per 30/s frame; event 3 once at SONY448's end (310 pictures; `switch_menu` -> `dlgSecondCinematic`); Intro_2 opened fresh by the next dialog, ended by a key binding (13 keys) or by its end (`goto_menu_silent`); MENULOOP opened by `dlgMenu`, not looped, and left by the 120 s attract timer before its 3,732nd picture | §10 | §10 |

**The proven level** is PLAT-36's: the open / end / reset order of the boot and the menu in a recomp
`PS2X_MPEG_TRACE=1` run, and the capture timings §13 names. Everything here is the reading level.

## 1. The two players and the one decoder

**The decoder** (one set of globals; the handle is `DAT_00451cf8`):

- **Open** `FUN_003098e0(name, 1, blocking, audioStream)` (D:L207783-207818): marks a movie active
  (`DAT_004a1790`), sets the blocking flag from its third argument -- forced on when the name contains `socom.pss`
  (0x3f6560; D:L207793-207797; no such file is on the disc, and every caller passes 0, so **the blocking player is
  unreached**) -- opens the file (`FUN_0030bb60` D:L208973-209032: a host file opened and sized, or the CD stream
  started at the file's LBN), allocates the decode buffers if none are held (`FUN_00309b40`), creates the decoder
  (`FUN_0030b4d0` D:L208765-208817: `sceMpegInit`, `sceMpegCreate`, the video callback 0x30add0, the audio callback
  0x30aca0 for stream `audioStream` (and stream 0 when it is above 0), STOPDMA 0x30aaa0, TIMESTAMP 0x30a970, NODATA
  0x30a940, then demultiplexes until the input ring is full), and sets the frame cap to 30 (`FUN_003b17d0(0x1e)`,
  D:L207813). No picture is decoded by the open. Fails (returns 0) when the file does not open.
- **One picture** `FUN_00309850(drawBuffer)` -> `FUN_0030b1d0` (D:L208678-208763): arms a `setjmp` (D:L208691); asks
  `sceMpegGetPicture` for one picture into the RGB buffer, again while it returns an error (D:L208692-208699); on the
  stream's **first** picture builds two GS upload packets, one per frame buffer, placing the picture by its height
  against 448 (`DAT_003df350` = 0x1c0; D:L208701-208730); uploads the picture with the packet of the frame buffer being
  drawn this frame (D:L208733-208746); feeds the movie's audio ring and starts its playback once it holds enough
  (D:L208747-208751). The decompiler shows `FUN_00309850` passing two arguments; the instruction in the branch delay
  slot at 0x309864 copies its own argument into the third, so the draw buffer does reach `FUN_0030b1d0`.
- **End of data**: the NODATA callback `FUN_0030a940` (D:L208398-208406) `longjmp`s back into that `setjmp`; the
  second branch (D:L208752-208760) marks the stream **ended** (`DAT_00455e38` = 1), stops the movie audio and resets
  the decoder. No picture is presented on that tick.
- **Ended?** `FUN_003096c0` -> `FUN_0030b180` (D:L208660-208676): the ended mark, or `FUN_001bbab8` (unnamed in
  `socom2_names.csv`; the roadmap calls it `sceMpegIsEnd`), which reports the decoder at its end.
- **Close** `FUN_003096f0` (D:L207712-207731): restores the frame cap (`DAT_003e13f8` = 0x1e, read off the ELF),
  stops and frees the decoder, stops the stream (`FUN_0030ba90`: closes the file or stops the CD stream), frees the
  buffers it allocated (`FUN_00309a10`), clears the active mark.
- **Restart** `FUN_00309560` (D:L207664-207698): §5.

**The background player** is the shell's (offsets on the shell, the object `CMenuState` holds at +8): `+0x279`
has-movie, `+0x278` playing, `+0x27a` loop, `+0x27c` the file name (a string). Its tick is `FUN_00366940`
(D:L262866-262900); its start `FUN_00366a00` (D:L262903-262943, the menu state's thunk `FUN_001f3bd0` D:L54361); its
stop `FUN_00366b10` (D:L262945-262958, thunk `FUN_001f3be0` D:L54405). The tick is called by `CMenuState_Tick`
(0x1f4640; a `jal 0x366940` at 0x1f4660, read off the ELF) before the pad read (0x1f4668), the shell update and
input (`FUN_003654c0`, 0x1f4688) and the draw, and the frame ends with the flip `FUN_003aff30` (0x1f4820/0x1f4834).
Its return value is not used.

**The movie state** (the object at 0x4086f4 filled by `FUN_001eda60`, D:L51371-51481; vtable at 0x404f88 holding
init 0x1ed560, tick 0x1ed010 and exit 0x1eccf0 -- found by scanning the ELF's words) is pushed by `PlayMPEG` /
`PlayMPEGNoFade` through the state manager at 0x4084c0 (`FUN_002cf380`, a queued push). Its init `FUN_001ed560`
(D:L51220-51369) stops the game's sounds, waits for the sound system to settle (D:L51237-51255, `MOVIE_SETTLE_READING`),
reconfigures the display only when `INGAME` is set (D:L51259-51360), and opens the movie non-blocking with the
command's audio stream (D:L51362); +8 is "playing". Its tick (0x1ed010-0x1ed558, no decompiled body): §6 for the
skip; when not playing it closes and pops (0x1ed138-0x1ed174); when ended it closes and pops; else it adds the frame
time to the movie clock (+0x60), presents one picture (`jal 0x309850`, the draw buffer `DAT_004a44b4` in the delay
slot, 0x1ed190), updates the subtitle lines and flips the frame itself (0x1ed4dc; the first flip of the state is
not presented, `DAT_00408c00`). Its exit `FUN_001eccf0` (D:L51104-51176) frees the buffers, restores the display
and the frame cap when `INGAME`, sets the output alpha back to 255 (`FUN_003b1760(1.0, 0, 0, 0)`) and resumes sound.

## 2. The background player's state machine (the unit test's table)

The test's picture source stands for the decoder: `open(name) -> ok`, `next() -> picture | ended`, `seekStart()`,
`close()`. "Tick" is one call of `FUN_00366940`; "build" is the dialog build `FUN_00367950` (D:L263398-263776);
"unload" `FUN_00369210` (D:L264277-264425). States: **NONE** (has-movie 0), **STOPPED** (has-movie 1, playing 0),
**PLAYING** (playing 1, the source not ended), **ENDED** (playing 1, the source ended).

| # | state | input / condition | what happens (in order) | next | evidence |
|---|---|---|---|---|---|
| 1 | NONE | tick | nothing | NONE | D:L262877 |
| 2 | any | unload (the dialog is left) | if playing: close; has-movie := 0; playing := 0 | NONE | D:L264407-264422 |
| 3 | NONE | build, background `IMAGE` or none | unload (row 2), then ONSTART (event 0) | NONE | D:L263450, L263733 |
| 4 | NONE | build, background `MPEG` (1) / `MPEG_LOOPING` (2) | unload; ONSTART (event 0); name := FILENAME; has-movie := 1; loop := (type = 2); open | PLAYING if the open succeeded, else STOPPED **and event 3 fired now** | D:L263745-263764 |
| 5 | PLAYING | tick, the source gives a picture | present it (upload into the frame buffer being drawn) | PLAYING | D:L262879-262885 |
| 6 | PLAYING | tick, the source has no more data (NODATA) | no picture presented; the source is marked ended | ENDED | D:L208752-208760 |
| 7 | PLAYING | tick, the source reports its end before the call (`FUN_001bbab8`) | as row 8 | -- | D:L208662-208670 |
| 8 | ENDED | tick | fire event 3 (every ONMPEGEND binding of the current dialog, once); then: loop set -> restart (row 9); loop clear -> playing := 0, close | PLAYING (loop) / STOPPED | D:L262887-262896 |
| 9 | ENDED, loop | (row 8's restart) | stop and reset the decoder, seek to the file's start, clear the buffers, create again; **no picture this tick**; picture 0 on the next | PLAYING | D:L207664-207698 |
| 10 | STOPPED | tick | nothing (no event, however long) | STOPPED | D:L262877 |
| 11 | PLAYING / ENDED | `BackgroundMPEG OFF` | close; playing := 0; **no event 3** | STOPPED | `FUN_00366b10` D:L262945-262958 |
| 12 | STOPPED / NONE | `BackgroundMPEG OFF` | nothing (returns 0) | unchanged | D:L262953 |
| 13 | PLAYING / ENDED / STOPPED | `BackgroundMPEG ON` | if playing: close; open the stored name from its start | PLAYING if opened, else STOPPED (**no event**) | `FUN_00366a00` D:L262914-262940 |
| 14 | PLAYING / ENDED / STOPPED | `BackgroundMPEG <file>` | as row 13 with name := the file (kept for later `ON`s) | as row 13 | D:L262924-262935 |
| 15 | NONE | `BackgroundMPEG ON` / `<file>` | nothing (returns false): a dialog without an MPEG background cannot gain one | NONE | D:L262914 |
| 16 | any with has-movie | state pop (`ON_STATE_POP`, `FUN_001f45e0`) | row 13 (restart from picture 0), then event `ON_STATE_POP`; the menu's next 2 frames are flipped without being shown (+0x10 := 2; 0x1f4808-0x1f4824) | as row 13 | D:L54766-54776 |

ONSTART (rows 3, 4) is fired at the end of the build's branch taken when `DAT_0049eaa0` is set (D:L263689-263734);
the other branch fires none. Which way the front end goes was not read; the order that matters here -- ONSTART, if
fired, before the movie opens -- holds either way.

What the test asserts, from these rows: a source of *N* pictures presents pictures 0..*N*-1 on ticks 1..*N*; on tick
*N*+1 no picture (row 6, the NODATA path -- or row 7's end check, `MOVIE_END_LATENCY_READING`); on tick *N*+2 event 3
exactly once; with loop clear, no further picture and no further event on any later tick; with loop set, picture 0
on tick *N*+3 and event 3 again *N*+2 ticks later; `OFF` never fires the event; a failed build-time open fires it
during the build, after ONSTART; a failed `ON` does not.

## 3. The entries: BackgroundMPEG, PlayMPEG, PlayMPEGNoFade -- and "PlayMovie"

`readBindingTable(elf, 0x3dd4d0)` (research 96 §4: 207 rows) holds three movie rows and no `PlayMovie`:

| entry | row / id / fn (fn2) | arguments | fade | loop | skip | layer |
|---|---|---|---|---|---|---|
| `BackgroundMPEG` | 135 / 136 / 0x27a420 | one string: `ON`, `OFF`, a file name, or `INPUT_STRING` (the context's input string is taken instead; D:L124418-124421) | none | the dialog's (§5) | none (§6) | the current dialog's background, under its widgets |
| `PlayMPEG` | 22 / 23 / 0x27ab30 (parse 0x27ad60) | `ARGUMENT` or `FILE` (a file name), or `INDEX` (a key into `mpeg_subtitles.rdr`, which gives the file and the subtitles); `FADE` (bool, default 1), `INGAME` (default 1), `INTERLACE` (default 1), `AUDIOSTREAM` (a number, or `VALVE` / `UIVAR` naming one), `DEST_RECT`, `SOURCE_RECT`, `BILINEAR` (default 0) (D:L124676-124759; strings 0x3ee888-0x3eeee0) | with `FADE`: the skip fades out over 1.0 s (§6) | none | CROSS released (§6) | full screen, its own state; the menu is suspended under it |
| `PlayMPEGNoFade` | 133 / 134 / 0x27aa70 | its one string (no parse of its own, fn2 0): the file | none: fade 0, `INDEX` 0 | none | CROSS released, at once | as `PlayMPEG`; the record's other fields keep the last `PlayMPEG`'s values (it writes only the name, fade and index) |

- **`BackgroundMPEG`** (`FUN_0027a420`, D:L124410-124435): `ON` -> `FUN_00366a00(shell, none)`, `OFF` ->
  `FUN_00366b10(shell)`, anything else -> `FUN_00366a00(shell, file)`; always returns 1 (done). The disc uses it in
  `dlgMenu` only: `OFF` around the memory-card load popups and `ON` after them (`MainMenuOnLoad`, `LoadGameOnListBox`,
  `CancelLoadGame`), and `OFF` before the mission shortcut's `SWITCHMENU LOAD_SCREEN`
  (`npx tsx tools/dump-dialogs.ts --dialog dlgMenu.rdr`). So a popup does not by itself stop the background: the
  scripts stop it around card access and restart it from picture 0 afterwards.
- **`PlayMPEG`** (`FUN_0027ab30`, D:L124609-124674) is a two-call command on its own flag `DAT_00414ea0`: the first
  call fills the movie state's record (`FUN_001eda60`), queues its push and returns 0 (not done); the next call clears
  the flag and returns 1 (done). A runtime that re-ticks a command until it is done (PLAT-07's) therefore holds the
  calling sequence across the movie -- `dlgPlayTutMovies`' `PlayMovie` plays its tutorials one after another (in the
  order Tut_01, 02, 03, **05, 04**, 06 ... 12; Tut_11 and Tut_12 are not on the disc, research 96 §3.5, so their open
  fails, the state's first tick closes and pops, and the sequence goes on). A gate comes first: when the object
  `DAT_00440c38` exists and bit 0x10 of its byte +0xe1 is clear, the command returns 1 without playing
  (`PLAYMPEG_GATE_READING`).
- **`PlayMPEGNoFade`** (0x27aa70-0x27ab28, read off the ELF): the same gate and two-call shape on its own flag
  `DAT_00414ea8`; calls `FUN_001eda60(record, file, 0, 0)` and queues the same push. No script on the disc names it
  (a search of every `.ZAR` outside `RUN/MOVIES` finds only `PlayMPEG`).
- **"PlayMovie"** is an animation name: the `ONSTART` of `dlgArtGal2` (`PlayMPEG ArtGall2.pss`, `INGAME false`),
  `dlgMakeMusicMovie` (a `SelectedMovie` switch over `alb_aop`, `braz_aop`, `alg_aop`, `russ_aop`, `MusVid`) and
  `dlgPlayTutMovies` (the twelve tutorials). None of the three has a `BACKGROUND`, so a pushed movie never meets a
  background movie on the one decoder. Every `PlayMPEG` on the disc says `INGAME false`, so the display block of
  `FUN_001ed560` (frame cap off, interlace, the rectangles, bilinear) is never taken by a menu movie.

**The plan's two movie interfaces, against this read.** The command side (`packages/ui/src/movie/`) is what
`BackgroundMPEG` (start / stop / retarget, rows 11-15), `PlayMPEG` and `PlayMPEGNoFade` (push a full-screen movie;
done on the call after it ends) call, and what returns event 3 to the current dialog (§4); the build and unload (rows
2-4) and the state pop (row 16) are PLAT-10's manager calling the same interface. The draw side is PLAT-14's movie
layer, under the dialog's widgets (R121.10), holding its picture when none comes (`MOVIE_HOLD_READING`). The
pushed movie is full screen over everything, so it needs the layer only when the viewer draws it there. In this
note's base (`agent/web-s6` at a0000494) neither PLAT-14's layer nor PLAT-07's runtime is merged
(`packages/ui/src` holds `index.ts`, `loadPhases.ts`, `uiVars.ts`, `valves.ts`); the check against merged code is
the implementer's at dispatch.

## 4. The end event: once, to whom, and when the dialog changed

- **Delivery.** `FUN_00367810(shell, 3, none)` walks the shell's EVENT records (count at +0x8d8, 0x10-byte records
  from +0x6f8: kind 1 = event, +0x705 the event id, +0x6fc the animation, +0x700 the `ARGUMENT`) and starts each match
  -- with its own `ARGUMENT` when it has one (D:L263370-263391). Every ONMPEGEND binding of the dialog fires, in record
  order; none is "consumed". The animation runs under PLAT-07's runtime; a `SWITCHMENU` it issues is queued
  (`FUN_0027e720`, PLAT-10's).
- **Once.** The event is fired only from row 8 (once per end, then closed or restarted) and from row 4's failed open.
  Nothing re-fires it while the player is stopped (row 10).
- **To which dialog.** Always the shell's current one. A dialog change unloads the old dialog first (row 2: its movie
  closed, has-movie cleared), so an end of one dialog's movie cannot be delivered to the next; the next dialog's own
  movie starts fresh. A failed open of the new dialog's movie fires the new dialog's ONMPEGEND during its build, after
  its ONSTART (D:L263733 then D:L263763).
- **Where it can never come from.** `dlgGameComplete` binds ONMPEGEND but its background is `IMAGE` (`Flag_back.tif`):
  neither fire site is reached for it. A by-name event sender (`FUN_0027e610` D:L126520, through `FUN_001f3bf0`, which
  maps `ONMPEGEND` to 3) exists, but no caller of it was found (no `jal` and no word holding its address in the ELF);
  its binding is believed dead. The other eight ONMPEGEND users have `MPEG` backgrounds: `dlgIntroCinematic`,
  `dlgSecondCinematic`, `dlgAttractCinematic`, `dlgCredits`, and the four AOP cinematics.
- **The movie state** fires no ONMPEGEND: its end closes and pops (0x1ed154-0x1ed174), and the calling sequence goes
  on through `PlayMPEG`'s second call.

## 5. The loop restart

- **What sets the loop.** Only the dialog's `BACKGROUND TYPE`: `MPEG_LOOPING` -> type 2 -> loop 1 (D:L263745-263755).
  `BackgroundMPEG` does not touch it. **No dialog on the disc says `MPEG_LOOPING`** (the nine `MPEG` backgrounds are
  type 1; a search of READERC's parsed layouts and of the raw `.ZAR` bytes finds the word nowhere), so on the retail
  data **nothing loops**, the menu's `menuloop.pss` included.
- **How the restart works** (`FUN_00309560`, only for a non-blocking stream): the decoder is stopped (`FUN_0030b120`:
  ended mark, audio stopped, `sceMpegReset`, `FUN_001bb948`), the stream is **sought** to its start (`FUN_0030baf0`:
  `sceLseek` of the host file to offset 0, or `sceCdStSeek` to the CD stream's start LBN, D:L208953-208971), the
  RGB, packet, audio and work buffers are cleared, and the decoder is created again (`FUN_0030b4d0`, which
  re-primes the ring). The file is not reopened. Returns 1, so playing stays set. **A failed seek is not handled**:
  `FUN_0030baf0` then calls `sceClose` on the host file's handle and returns false, but `FUN_00309560` ignores the
  result and still calls `FUN_0030b4d0`, which clears the ended mark (D:L208776) and loops on the read callback
  0x30b9d0 until it returns non-zero (D:L208802-208803). The callback has no decompiled body and was not read, so
  what follows -- a hang in that loop, or an end on a later tick -- is **not read**. Unreached on the disc (nothing
  loops).
- **The gap.** The tick that detects the end presents nothing (row 8), and so does the NODATA tick before it (row 6):
  one or two frames without a new picture between the last picture and picture 0 (`MOVIE_END_LATENCY_READING`).
- **A believed defect, unexercised.** The open passes the frame buffers to `FUN_0030b4d0` as they are (`DAT_004a44b4`,
  `DAT_004a44b0`: frame-buffer page numbers, 0 and 0x8c or 0x46; D:L207812); the restart passes them shifted left by 5
  (D:L207694), the buffer being drawn at that moment first. `FUN_0030b4d0` stores them as the first and second
  buffer (`DAT_00455e40`, `DAT_00455e44`, D:L208778-208779); `FUN_0030b1d0` builds packet 1 at the first x 0x20 and
  packet 2 at the second x 0x20 (D:L208716-208728), and picks packet 1 only when the draw buffer it is given -- not
  shifted -- equals the stored first (D:L208734-208746). Two cases follow. **(A) The restart comes while buffer 0 is
  drawn**: first = 0, second = 0x8c << 5 (or 0x46 << 5). The choice is still right (buffer 0 matches 0 -> packet 1,
  at 0; the other buffer -> packet 2), but packet 2 addresses 32 times too far, so the non-zero buffer's pictures go
  astray. **(B) The restart comes while the non-zero buffer is drawn**: first = 0x8c << 5, second = 0. No draw buffer
  ever equals the first, so every frame takes packet 2, which addresses buffer 0 at its right place: every picture
  lands in buffer 0, whichever buffer is being drawn. The path is unreached by the disc (above); PLAT-21 should
  implement the restart as the clean seek the roadmap asks for (end + loop -> restart), and not carry either case.

## 6. Skip: which buttons, from when, what comes next

- **The background player has none.** Skipping a cinematic dialog is its `BUTTON` / `TRIGGER` bindings, read by the
  menu's input after the movie's tick (0x1f4688), live from the dialog's first tick unless a `SuspendMenuInput` is in
  force (PLAT-11's): `dlgSecondCinematic` and `dlgAttractCinematic` bind START, CIRCLE, SQUARE, TRIANGLE, CROSS, the
  d-pad, R1, R2, L1, L2 (not SELECT) to `goto_menu dlgMenu.rdr`; the four AOP cinematics bind CROSS to the same
  `SetFirstMission` as their ONMPEGEND; `dlgCredits` binds CROSS and TRIANGLE to `BackOutWithMusic`, again its
  ONMPEGEND's; `dlgIntroCinematic` binds nothing. What is shown next is the target dialog, whose own background (if
  any) opens from picture 0 -- `goto_menu` -> `dlgMenu` -> MENULOOP from its first picture.
- **The movie state** (0x1ed044-0x1ed174): after the pad read (`FUN_002d9e40`), if the pad object `DAT_0044f108`
  exists, its button slot 9 is in state 3, and the fade timer (+0x24, -1.0 at init) is negative, the timer becomes
  1.1 s. Slot 9 is CROSS: `FUN_002da930` fills slot 9 from `scePad2GetButtonInfo` index 0xe (digital) and 0x1a
  (pressure; D:L179844-179845), and 0x1a is CROSS in the pressure order the other slots confirm (0x14 RIGHT .. 0x1b
  SQUARE, 0x1c-0x1f L1, R1, L2, R2). The states are `FUN_002d9ff0`'s (D:L179128-179186): 0 up, 1 pressed this frame,
  2 held, 3 **released** this frame -- so the skip is CROSS's release. While the timer *t* > 0 it falls by the frame
  time; with `FADE`, while *t* >= 0.1 the output alpha is (*t* - 0.1) x 255 (`FUN_003b1760`, D:L305410-305426:
  black colour, alpha byte), below 0.1 it is 0, and when *t* < 0 the state stops; without `FADE` the alpha is 0 and
  the state stops on the same tick. The movie keeps decoding through the fade. The skip is live from the state's first
  tick; nothing else skips it. **One case is not settled: the CROSS that started the movie.** All three callers start
  `PlayMPEG` from their `ONSTART`, and that dialog is reached by a menu binding. If the binding fires on the press,
  CROSS can still be held when the state starts, and `FUN_002d9ff0` turns its release into state 3 on one of the
  state's first ticks: the movie would be skipped as soon as it began. The menu's BUTTON binding fires when the pad
  slot's state equals a byte held per binding (+0x704, copied from the layout record's +0xc at D:L263606, compared at
  D:L264106 in `FUN_00368650`), so each binding chooses its own edge. The value that the bindings leading to
  `dlgArtGal2`, `dlgPlayTutMovies` and `dlgMakeMusicMovie` hold was not read, and neither was the path a BUTTON
  widget's activation takes. Reading: the release of that CROSS is not seen as a skip, so the movie plays
  (`MOVIE_SKIP_CARRY_READING`, §14). What comes next: the state pops, the menu state resumes (`FUN_001f45e0`: its background
  restarts, `ON_STATE_POP`, two frames unshown) and `PlayMPEG`'s second call returns done.
- **The unreached blocking player** (`FUN_0030af40` D:L208595-208643) would skip on CROSS held
  (`scePad2GetButtonInfo` index 0xe, D:L208636) and paces itself at 1/30 s (`FUN_002d9e40(0.0333...)`, the float
  0x3d088889); not reached on the disc (§1).

## 7. What is drawn while a movie opens, and on a tick without a picture

- The open is synchronous (the file, the decoder, the primed ring) inside the build or the command; it decodes no
  picture. The first picture is presented by the **next** tick of the menu state. The frame that ends the build is
  flipped with no movie picture in it.
- The player never clears the frame buffer, and a tick that presents nothing leaves the draw buffer as it was --
  double-buffered, so the content is the frame drawn two flips before, under the dialog's new draw. Whether the menu's
  frame clears the buffer before the dialog draws (so the gap would be black) was not read (`MOVIE_HOLD_READING`).
  On the boot this cannot be seen: SONY448's last 15 pictures are black (research 98 §1), and INTRO_2 opens on a fade.
- The movie state's first frame is not presented (`DAT_00408c00`, its flip with 0, 0x1ed4d4-0x1ed4e8), so the screen
  keeps the menu's last frame for one more frame before the first movie picture.

## 8. A BACKGROUND MPEG dialog left and re-entered

The build's first act is the unload (D:L263450 -> `FUN_00369210`): a playing movie is closed and has-movie cleared.
Re-entering builds again and opens the file afresh: **the movie starts over from picture 0**, every time, even when
the next dialog names the same file (`dlgSecondCinematic` and `dlgAttractCinematic` both play `Intro_2.pss`). There is
no resume point anywhere in the shell's fields. The same restart from 0 follows a pushed state's return (row 16) and a
script's `BackgroundMPEG ON` (row 13).

## 9. The pace

- **Per tick, one picture.** The background tick presents at most one picture (rows 5-9); the movie state's tick
  likewise (0x1ed190). `sceMpegGetPicture` is asked for a picture and retried until it gives one, so a slow stream
  slows the frame rather than skipping pictures. The TIMESTAMP callback in non-blocking mode only writes
  `DAT_00451db0`, which `FUN_0030b1d0` clears and no code reads: **the PTS do not pace the presentation**, and no
  picture is dropped or repeated to keep time.
- **The tick's rate.** The flip `FUN_003aff30` (D:L304731) waits field by field (`sceGsSyncV`) while the frame's time
  plus 1/60 is below 1/`DAT_003e1400`, then once more; `DAT_003e1400` is 0x1e (30) in the ELF and the movie open and
  close both write 30 (`FUN_003b17d0` D:L305429-305441; 60 would mean no cap). So a menu frame lasts two fields when
  its work fits in one: **29.97 pictures per second** on NTSC (60000/1001 fields per second, so 1001/30000 s per
  picture), slower when a frame overruns (`MOVIE_PICTURE_PERIOD_READING`).
- **Against the files' own rate.** SONY448 and MENULOOP are coded at 30 fps (PTS step 3000 of 90 kHz), INTRO_2 at
  29.97 (step 3003; research 98 §7.3's stream lines, and §11 below): the console shows SONY448 and MENULOOP 0.1 %
  slower than their PTS (SONY448 10.34 s for 310 pictures), INTRO_2 at its own rate. Research 98 §1's "30 per second
  across the s02 press" (98-100 pictures in 3.2-3.3 s) cannot tell 30 from 29.97 and agrees with both.
- **The audio** of a movie is fed per tick by the same call and started once buffered (D:L208747-208751); how its
  playback is clocked against the pictures is PLAT-20's (not read here).

## 10. What the boot asks of the player (research 98 §§1-3, research 96 §3.2)

1. `dlgIntroScreen` (`TYPE IMAGE`, file blank, no objects) has no movie: row 3. Its `do_onstart` ends in
   `SWITCHMENU dlgIntroCinematic.rdr`.
2. `dlgIntroCinematic` (`TYPE MPEG`, `run/movies/common/sony448.pss`, no buttons): the build runs ONSTART
   (`TurnOffVagStream`, i.e. `VagStreaming OFF`) and **then** opens SONY448 (row 4). Pictures 0..309, one per tick at
   29.97/s; the cards are those pictures (research 98 §1: the Sony card 11-140, the Zipper card 161-294, black 0-10,
   141-160, 295-309). No binding skips it (§6; research 98's CROSS presses after s02-s04 did not, and `mb10_pcsx2`'s
   frames show no pause across the s04 press). At its end: event 3, once -> `switch_menu` with
   `dlgSecondCinematic.rdr`; the player is closed by row 8 before the switch is processed.
3. `dlgSecondCinematic` (`TYPE MPEG`, `run/movies/Intro_2.pss`): built fresh, Intro_2 from picture 0 (row 4). 13 keys
   -> `goto_menu dlgMenu.rdr`, which unloads it (row 2); its end -> event 3 -> `goto_menu_silent dlgMenu.rdr`. The
   s05 "intro / warning" frame of the boot runs is believed to be its opening fade (research 98 §4.1).
4. `dlgMenu` (`TYPE MPEG`, `run/movies/common/menuloop.pss`): opened fresh (row 4), **not looping** (§5). Its ONSTART
   `UiStopAttract` waits 120 s, then `UiAttractMode` fades `MENUFADER` for 0.5 s and switches to
   `dlgAttractCinematic` (Intro_2 again, from 0), whose end or key returns to `dlgMenu` and MENULOOP from 0. Idle,
   the switch comes about 120.5 s after the menu's ONSTART, at about picture 3,611 of MENULOOP's 3,732 (124.5 s at
   29.97/s): the end is not reached. PC research 09's recomp run saw the same (MENULOOP from 28 s, the attract at
   149 s with picture 3,600).

So the boot needs rows 2, 3, 4, 5, 6/7 and 8 (no loop), one picture per frame, the ONSTART-before-open order, and
nothing of the skip, the loop or the movie state.

## 11. The disc's movies (counts)

The picture start codes and the PTS of the video stream (0xE0) of three files, by a scratch scan of the program
stream (pack headers skipped, every 0xE0 PES payload concatenated, `pictureHeaders` of `tools/fmvStream.ts` over the
result); the script was run from `redotcom` and not kept in the tree:

| file | pictures | coding types | sequence_end codes | first / last PTS (90 kHz) | PTS step | span + one picture |
|---|---|---|---|---|---|---|
| `RUN/MOVIES/COMMON/SONY448.PSS` | 310 | 310 I | 1 | 3,808 / 930,808 | 3,000 | 10.333 s |
| `RUN/MOVIES/COMMON/MENULOOP.PSS` | 3,732 | 3,732 I | 1 | 4,797 / 11,197,797 | 3,000 | 124.400 s |
| `RUN/MOVIES/INTRO_2.PSS` | 3,836 | 277 I, 1,067 P, 2,492 B | 1 | 3,728 / 11,520,233 (3,813 PTS) | 3,003 | 127.995 s |

SONY448's 310 is research 98 §1's (ffmpeg's decode), here from the coded stream. The scan, for re-running (a scratch
file `count.ts` in `redotcom`, then deleted; `npx tsx count.ts <file>...`):

```ts
import { readFileSync } from 'node:fs';
import { pictureHeaders } from './tools/fmvStream.ts';
for (const f of process.argv.slice(2)) {
  const b = readFileSync(f); const parts: Buffer[] = []; let i = 0, first = -1, last = -1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0 || b[i + 1] !== 0 || b[i + 2] !== 1) { i++; continue; }
    const id = b[i + 3]!;
    if (id === 0xba) { i += 14 + (b[i + 13]! & 7); continue; }        // MPEG-2 pack header and its stuffing
    if (id < 0xbb) { i += 4; continue; }                               // program end (0xB9) and the like
    const len = b.readUInt16BE(i + 4), body = i + 6;
    if (id === 0xe0) {
      if (b[body + 1]! & 0x80) {                                       // PTS present
        const p = b.subarray(body + 3, body + 8);
        const pts = ((p[0]! >> 1) & 7) * 2 ** 30 + (((p[1]! << 8) | p[2]!) >> 1) * 2 ** 15 + (((p[3]! << 8) | p[4]!) >> 1);
        if (first < 0) first = pts; last = pts;
      }
      parts.push(b.subarray(body + 3 + b[body + 2]!, body + len));
    }
    i = body + len;
  }
  console.log(f, pictureHeaders(Buffer.concat(parts)).length, first, last);
}
```

## 12. Where this differs from the roadmap, from PC research 09 and from research 98

- **The roadmap's PLAT-21 block** says "UI commands PlayMPEG ..., PlayMPEGNoFade, BackgroundMPEG ..., PlayMovie":
  `PlayMovie` is an animation name, not a command (§3). "Then loop flag +0x27a -> `FUN_00309560` reset and seek": true
  of the code, but no dialog sets the flag (§5). "ONMPEGEND (9 uses); BACKGROUND TYPE MPEG in 9 dialogs": both 9, but
  not the same nine -- `dlgMenu` has the background and no ONMPEGEND, `dlgGameComplete` the ONMPEGEND and no movie
  (§4). "CROSS skips INTRO_2": CROSS and twelve other keys, by `dlgSecondCinematic`'s bindings, not by the player
  (§6). Its acceptance "end + loop -> restart" stays testable on the state machine (row 9) though retail data never
  takes it. Its proven level's "MENULOOP created and looped" (citing PC research 09 L76-80) is not what the decomp
  reads: created, yes; looped, no (§5, §10). The roadmap is not this task's to edit; the controller carries these into it.
- **PC research 09** (the recomp's movie fix) writes the end flag "so the shell's loop restart (`FUN_00309560`) fires
  at the end of MENULOOP" and calls the recomp's pictures "PTS-paced by the HLE". The first is not the console's
  behaviour (§5); the second is the recomp's pacing, not the game's (§9). Its observation -- the attract at 149 s,
  before MENULOOP's end -- agrees with §10.
- **Research 98 §5** leaves "a global skip outside the dialog is not ruled out" for SONY448: the player has none (§6),
  and the movie state's CROSS skip belongs to `PlayMPEG` movies only. A shell-wide key handler outside the dialog's
  bindings was not read (PLAT-11's `FUN_003654c0`); that is what is left of the item.

## 13. Settled, not settled, and what would settle it

- **Settled at the reading level**: the two players and their entry points; the background machine's rows 1-16; the
  event's number, fan-out, once-ness and target; the failed-open event; the TYPE parse and that no dialog loops; the
  restart's seek; the skip of the movie state (CROSS release, the 1.1 s timer, the fade's shape) and that the background
  player has none; the leave / re-enter restart from 0; one picture per tick, no PTS pacing, the 30/s frame cap; the
  disc's picture counts and PTS steps (§11).
- **Not settled**:
  - which end check fires first at a stream's end (NODATA on the call after the last picture, or `FUN_001bbab8` right
    after it): one frame more or less between the last picture and the event (`MOVIE_END_LATENCY_READING`);
  - what a frame without a new picture shows (the previous buffer's content, or a clear) (`MOVIE_HOLD_READING`);
  - whether busy menu frames overrun two fields, slowing the movie (`MOVIE_PICTURE_PERIOD_READING`);
  - the sound settle before a pushed movie opens (`MOVIE_SETTLE_READING`) and the `PlayMPEG` gate's object
    (`PLAYMPEG_GATE_READING`);
  - whether input during the 120 s restarts the attract timer, so that MENULOOP's end can be reached at all (which
    animations call `UiStopAttract`: MENU-09's / PLAT-10's read); and what the menu shows then (the player closed,
    rows 8 and 10);
  - whether the CROSS that opened a `PlayMPEG` dialog skips its movie when it is released (§6; the binding's edge byte
    +0x704 for the extras' bindings, PLAT-11's read) (`MOVIE_SKIP_CARRY_READING`);
  - what a failed restart seek leads to (§5: the read callback 0x30b9d0 on a closed file, not read; unreached);
  - the believed defect of §5, on hardware.
- **The roadmap's second Unknown, "whether `FUN_001ed560`'s subtitles are used outside missions"**: not in the front
  end. Subtitles are loaded only on `PlayMPEG`'s `INDEX` path (`FUN_001eda60`'s fourth argument, the command record's
  byte +0x40, D:L51394-51475: the `mpeg_subtitles.rdr` entry gives the file and the lines). The front end's
  `PlayMPEG`s are 18 records in `dlgArtGal2`, `dlgMakeMusicMovie` and `dlgPlayTutMovies` (all in
  `RUN/UIZANIM.ZAR`; none in `EXTZANIM` or `MPZANIM`). Each names its file directly, and its byte +0x40 is 0
  (a scratch scan of the decoded `UI_COMMAND`s' bytes past +0x10 through `@s2u/scene`'s `decodeUiSet`; FADE 1,
  INGAME 0, INTERLACE 0 on all 18). So no front-end movie has subtitles. Whether a mission's script uses `INDEX` was
  not read; that is outside PLAT-21.
- **What settles it**: PLAT-36's recomp trace (`PS2X_MPEG_TRACE=1` with the frame index of each picture, the end and
  the event) across SONY448 -> Intro_2 and on the menu; a 60 fps capture across SONY448's end and Intro_2's first
  pictures (the gap's frames and their colour); a 60 fps capture of the menu at MENULOOP's 124 s with the attract
  timer held off by input (BOOT-01 / MENU-09); a PCSX2 capture across a `PlayMPEG` skip (the fade's curve).

## 14. Placeholders and readings

No code held these when the note was written. *(2026-10-02, PLAT-21: each is now a constant of
`packages/fmv/src/player.ts` or `packages/ui/src/movie/movieCommands.ts`, as its status says; the last three rows are
the implementation's own, §15; `MOVIE_CLOCK_CATCHUP_READING` is the review round's, §15.)*

| name | stands for | searched / reading | status |
|---|---|---|---|
| `MOVIE_PICTURE_PERIOD_READING` | the time between two presented pictures | the 30/s frame cap of `FUN_003aff30` / `FUN_003b17d0` (§9): two NTSC fields, 1001/30000 s, when the frame fits; reading: a fixed 1001/30000 s, ignoring the PTS | in code since 2026-10-02: `packages/fmv/src/player.ts` (`MovieFrameClock`'s period) |
| `MOVIE_END_LATENCY_READING` | the frames between the last picture and event 3 | NODATA path: one frame with no picture, then the event's frame (rows 6, 8); the `FUN_001bbab8` path would save one. Reading: the NODATA path (one empty frame, then the event) | in code since 2026-10-02: `packages/fmv/src/player.ts` (`'nodata'`; `'decoder'` selectable) |
| `MOVIE_HOLD_READING` | what the movie layer shows on a frame with no new picture, and before the first | the player never clears (§7); the menu's own clear not read. Reading: the layer keeps its last picture, black before any | in code since 2026-10-02: `packages/fmv/src/player.ts` (the sink is written only with a picture) |
| `MOVIE_SETTLE_READING` | the pause before a pushed movie opens | `FUN_001ed560`'s wait while the sound system drains (D:L51237-51255), not timed. Reading: none (open at once) | in code since 2026-10-02: `packages/fmv/src/player.ts` (0 s) |
| `MOVIE_SKIP_CARRY_READING` | whether the release of the CROSS that opened a `PlayMPEG` dialog skips its movie | the movie state has no guard and reads CROSS's release from its first tick (§6); the menu binding's edge is a per-binding byte (+0x704, D:L263606, D:L264106) whose value for the extras' bindings was not read. Reading: that release does not skip (the movie plays) | in code since 2026-10-02: `packages/fmv/src/player.ts` (`'pressed-in-state'`) |
| `PLAYMPEG_GATE_READING` | when `PlayMPEG` / `PlayMPEGNoFade` do nothing | the object `DAT_00440c38` (`FUN_002b3580` returns it, `FUN_002b3590` sets it) and its bit 0x10 at +0xe1, not identified (a bit 0x10 at +0xe1 is set at D:L145030 and cleared at D:L144775 on objects not shown to be this one). Reading: the gate is open in the front end (always play) | in code since 2026-10-02: `packages/ui/src/movie/movieCommands.ts` (`'open'`) |
| `MOVIE_PICTURE_LATE_READING` | what a tick does when the browser's decoder has no picture ready | the original stalls the frame until `sceMpegGetPicture` gives one (D:L208692-208699), which a page cannot. Reading: the tick presents nothing and the player's state does not move (§15) | in code since 2026-10-02: `packages/fmv/src/player.ts` (`'hold-tick'`) |
| `PLAYMPEG_RECORD_INITIAL_PLACEHOLDER` | the movie record's fields `PlayMPEGNoFade` leaves alone, before any `PlayMPEG` wrote them | the statics 0x40871d-0x408750 and `DAT_00408720`, not read off the ELF; unreached (no script names `PlayMPEGNoFade`, §3). Zero / false | in code since 2026-10-02: `packages/ui/src/movie/movieCommands.ts` |
| `MOVIE_CLOCK_CATCHUP_READING` | the most menu frames the clock stand-in runs for one page frame | the console runs one movie tick per frame: `CMenuState_Tick` calls the tick once (0x1f4660) and ends in the flip (0x1f4820); the flip's cap (`FUN_003aff30`, D:L304746-304749) only waits more fields while the frame is short of 1/30 s, never runs a second tick, so an overrun frame is late and the time is not caught up (structural: no line states a late-frame rule). Reading: 2 (one late display frame caught up, the rest of a longer gap -- a hidden tab, a GC pause over about 100 ms -- dropped). The dropped pictures are lost for good: once PLAT-20 gives a sound clock, the pictures fall behind it after each stall, so PLAT-12 / PLAT-20 must pace the movie by the audio, not by this stand-in | in code since 2026-10-02: `packages/fmv/src/player.ts` (`MovieFrameClock`); PLAT-12's clock (`packages/ui/src/clock/uiClock.ts`, merged) replaces it when the front end wires the host |
| `BLACK_SOURCE_UNKNOWN_COUNT_PLACEHOLDER` | the picture count of a movie §11 did not count, for the black stand-in source until PLAT-19b | none searched: PLAT-19b's decoder gives the real stream. 0 (the movie ends at once) | in code since 2026-10-02: `packages/fmv/src/player.ts` (`BlackPictureSource`) |

## 15. 2026-10-02: the implementation (PLAT-21) and what its transcription re-read

Written by PLAT-21's implementer on `agent/web-s9-player` (base `agent/web-s6` at c705fb89: PLAT-07 and PLAT-18
merged; PLAT-08, PLAT-14 and PLAT-19b not). Nothing in §§1-14 was found wrong against the decompilation; what the
transcription had to settle beyond the note is below.

- **Where it is.** `packages/fmv/src/player.ts`: `BackgroundMoviePlayer` (§2's rows 1-16: `build` = unload, the
  caller's ONSTART, `load`; `tick` = `FUN_00366940`; `on` / `off` = `FUN_00366a00` / `FUN_00366b10`; `statePop` = row
  16's restart), `MovieStatePlayer` (§6's movie state), `MovieFrameClock` (W9.R10's stand-in for PLAT-12) and the
  picture source interface. `packages/ui/src/movie/movieCommands.ts`: the `MovieService` the commands call, the
  entries `BackgroundMPEG`, `PlayMPEG`, `PlayMPEGNoFade` (rows 135, 22, 133 of the table at 0x3dd4d0), the record decode
  of `FUN_0027ad60`, and ONMPEGEND's delivery (`deliverDialogEvent` / `deliverMpegEnd` = `FUN_00367810`).
  `BlackPictureSource` (in `player.ts`) is the black stand-in until PLAT-19b.
  `packages/viewer/src/moviePlayerHost.ts`: the two players over one source, a `MovieService` for the commands. The unit tests
  are `packages/fmv/test/player.test.ts` (§2's "what the test asserts", tick by tick), `packages/ui/test/movie/` and
  `packages/viewer/test/moviePlayerHost.test.ts`.
- **The picture source** ("the next picture, or the end"), which PLAT-19b's worker provides: `open(name, {audioStream})`
  synchronous, true when the file exists, no picture decoded; `next()` each picture once and in order, `MOVIE_END` on
  the call after the last, `MOVIE_PENDING` when the worker has none ready; `restart()` the stream from picture 0 (the
  clean seek of §5, not its believed defect); `close()`; optionally `atEnd()` for row 7.
- **`MOVIE_PICTURE_LATE_READING` (new).** The console never lacks a picture at a tick: `FUN_0030b1d0` retries
  `sceMpegGetPicture` until it gives one (D:L208692-208699), so a slow stream slows the frame. A page's decoder runs in
  a worker; a tick whose picture is not ready presents nothing and moves nothing (no end, no event), so the stream is
  slowed and never skipped, as on the console.
- **The movie state's tick, re-read off its disassembly** (0x1ed044-0x1ed194, the recomp's listing of the retail ELF):
  the timer set by the release (0x1ed088) is read back at 0x1ed090 and decremented **on the same tick**; the stop (the
  timer below 0, or any timer tick without `FADE`) clears +8 at 0x1ed11c, and the "not playing" test at 0x1ed138 that
  follows closes and pops **on that same tick, with no picture**. So with `FADE` at 29.97/s the pop comes on the 33rd
  tick counting the release's (1.1 / (1001/30000) = 32.97); without it, on the release's own tick. The alpha argument of
  `FUN_003b1760` is the float t - 0.1 (1.0 = 255).
- **`AUDIOSTREAM`'s kinds** (`FUN_0027ad60`, the strings read off the ELF: 0x3eeeb0 `VALVE`, 0x3eeeb8 `UIVAR`): +0x14
  is 1 for `VALVE <name>` and 2 for `UIVAR <name>`, the name's index at +0x18; `PlayMPEG` reads the value at its call
  (`FUN_00351ef0`'s u16 at +4, or `FUN_00385900`'s int) and leaves `DAT_00408720` as it was when the lookup fails. The
  entries take the lookup as a parameter (`resolveAudioStream`): a `ZAnimUiCommand` carries no name table.
- **The two `RECT`s**: `DEST_RECT` (0x3eeec0) is read into +0x30 and its found flag kept at +0x1c; `SOURCE_RECT`
  (0x3eeed0) into +0x20. Copied, not interpreted (no front-end movie says `INGAME`, §3).
- **Two choices the disc never reaches.** A `BACKGROUND TYPE MPEG` with no `FILENAME` is taken as a failed open (event
  3 during the build): the open is given no name, and what `FUN_003098e0` does with none was not read. The three
  boot backgrounds name a file (§10); that the other six do was not checked here. And an ONMPEGEND handler that left the dialog synchronously stops the end tick from
  closing or restarting a movie that is no longer the dialog's -- on the console the switch is queued (`FUN_0027e720`), so
  the tick always finishes first. *(Review round, 2026-10-02: the first guard read only has-movie and playing, so a
  handler that built a next `BACKGROUND TYPE MPEG` dialog at once -- `dlgIntroCinematic` to `dlgSecondCinematic` --
  had its new movie closed, or restarted with `MPEG_LOOPING`, by the old tick. The player now counts its opens and
  unloads and the tick does nothing after its event when the count moved.)*
- **The movie state's end check** (review round). Its tick calls `FUN_003096c0` at 0x1ed144 (`jal 0x3096c0`, read off
  the ELF) after the +8 test at 0x1ed138 -- the check `FUN_00366940` makes (D:L262878): the ended mark or
  `FUN_001bbab8`. `MovieStatePlayer` takes the same `endCheck` as the background player, so `MOVIE_END_LATENCY_READING`
  moves both together.
- **`PlayMPEG INDEX` in the host** (review round). The viewer's host resolves the key through a `resolveSubtitleKey`
  lookup (`mpeg_subtitles.rdr`, §13). No front-end `PlayMPEG` says `INDEX` (§13); `INGAME`, `INTERLACE`, `BILINEAR`
  and the rects stay unmodelled for the same reason (§3). *(Second review round, 2026-10-02: the first round threw
  when the lookup was absent or gave no file, calling the original's behaviour unread. It is read: `FUN_001eda60`
  zeroes its result at 0x1edac4 (`move $s4, $zero`, before the test of the rdr pointer `DAT_00437d08`), sets it only
  from the key's `FILENAME` (`FUN_0032ee10` at 0x1edc34, the string 0x3e2110), and at 0x1ede18-0x1ede24 puts the string
  at 0x3e2140 -- `INVALID`, read off the ELF -- in place of a 0 (D:L51404-51473). So an rdr not loaded, a key not in
  it and a record with no `FILENAME` all name `INVALID`; `FUN_001801e0` (D:L51476) only copies the name, and the
  init's open (`FUN_003098e0`, D:L51362) fails on it (no disc file of that name), so the state's first tick closes and
  pops (§1, 0x1ed138). The host now does the same: `MOVIE_INDEX_FALLBACK_NAME`, with the test in
  `packages/viewer/test/moviePlayerHost.test.ts`.)*
- **The event's `ARGUMENT`.** `FUN_00367810` starts a binding with an argument through `FUN_00272bb0` (node index 0xFA).
  The runtime carries an instance's first input since research 363 (`ZAnimRuntime.start`'s input), but
  `runtimeEventStarter` still starts the animation without the binding's `ARGUMENT` -- the gap:
  `dlgIntroCinematic`'s `switch_menu dlgSecondCinematic.rdr` would read no input if it were wired (tests only today):
  PLAT-08 / PLAT-10's.
- **What stays owed**: the proven level (PLAT-36's `PS2X_MPEG_TRACE=1` run, §13); the pictures (PLAT-19b) and the
  sound (PLAT-20); the layer (PLAT-14); the table's binding of the three rows (PLAT-08, W9.R4).

*[Added 2026-10-02, sprint 9's connecting lines (S9-WIRE; research 115 §16.4): `MoviePlayerHost` gained `onCover`,
called when the queued push applies and before the movie state's init, as CG's push calls the top state's OnCover
before the pushed state's Init (`FUN_002ce9e0` D:L171928-171931). The page passes the menu state's OnCover
(`FUN_00366b10`), so a dialog's background movie is closed for the pushed movie and restarted at its pop. Found and not
changed: the host ticks the movie state on the frame the push is applied, where CG ticks nothing on that frame (R115.11):
the movie's first frame comes one frame earlier than the original's.]*
*[Fixed 2026-10-02 (S9-WIRE's review round; research 115 §16.4): the push and the movie state's pop are each applied on
a frame that ticks nothing (R115.11), so the first picture comes the frame after the push and the menu resumes the frame
after the pop's; a skip with FADE is now 33 ticks to the pop request and 34 frames to the pop.]*
