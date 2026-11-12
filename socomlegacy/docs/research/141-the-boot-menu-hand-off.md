# 141 -- The boot -> MENU hand-off: dlgMenu over MENULOOP, the fade-up, the GS's alpha byte, no loop seam (BOOT-06)

Written 2026-10-03 for BOOT-06 (`../roadmap/02-boot.md` "BOOT-06"; facts B16, B18, B19; research 139 §1 step 5 and §9,
140, 121 §5 and §10; the plan `../plans/2026-10-02-online-path-target.md`, sprint 11's "full menu sprint"). Sources:
`RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR` through the repository's readers (`loadDialog`, `parseAnimSets`,
`decodeUiProgram`: the ops below are decoded data, RS.R8); `RUN/MOVIES/COMMON/MENULOOP.PSS` through the page's decoder
core (PLAT-19b's `MovieDecoder` on `libmpeg2.wasm`, in Node); the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; cited, never pasted); the
archived captures `logs/parity/gate/x51_gate_iop/title/` (the recompiled game's title gate), `logs/parity/runs/mb10_pcsx2/`
(PCSX2, a burst across the key that skips Intro_2) and the gate's reference `scripts/parity/ref_main_menu_ours.png`.

The code: `packages/ui/src/compositor/frame.ts` (`packedAlphaByte`) and its use in `drawList.ts` (a 2D quad's alpha
sent as the GS takes it, §2). The tools: `tools/menuloopMask.ts` (MENU-02a's mask, moved out of its test so two tests
share it), `tools/nodeMovieSource.ts` (BOOT-04's Node picture source, moved out of its test likewise). The tests:
`packages/ui/test/compositor/compositor.test.ts` (CI: the packed byte), `tools/test/menuHandoffDisc.test.ts` (dev
disc: the decoded hand-off, the fade-up on the page's path, the console's burst, no seam), `tools/test/titleMenuDisc.test.ts`
(dev disc, the built wasm and the gate's script and reference: `title_menu.txt` on the page's path, scored).
`frontEnd.ts` is not touched (MENU-02a used the hot file's lines). Confidence: **reading, pending review** for every
transcription; the title window is **capture-scored** (§4); ~~the fade's shape against the console is **contradicted in
part** (§3)~~ *(2026-10-03, MENU-FADE)* the entry's frames are **capture-scored** against the console's burst (§3).

**Rewritten in part 2026-10-03 by MENU-FADE** (the owner's report on the preview, dated 2026-10-04 in the task's brief:
"as the main menu loads in, there's a black flicker that occurs a few times before the image is static"): §2 "The
blend", §3, the answers R141.4 - R141.8 and R141.11 - R141.14, §4's numbers, §5's last paragraph, §6 and §7. The ramp,
the second of black and the lone lit frame the page drew at `dlgMenu`'s entry were the page's, not the original's: the
fader's quad is untextured, the GS blends it by the `ALPHA_1` the last bound texture set, and on `dlgMenu` that texture
is the roller's, additive -- black added changes nothing. The code: `packages/viewer/src/uiCompositorView.ts` (the
register carried through the draw list) and `menuArt.ts` (a bitmap carries its bind's blend); `frontEnd.ts` again not
touched. The tests: `packages/viewer/test/uiCompositorView.test.ts` (CI), `tools/test/menuEntryFadeDisc.test.ts` (dev
disc, the built wasm and the PCSX2 captures). Sources added: the ELF's data read by address (the GS environment
packets at 0x3e0880 and 0x3e0980, the vtable at 0x406c10); the texture records' bind packets in `RUN/UI/*_TXR.ZED` and
`RUN/COMMON/FONT_TXR.ZED`; `RUN/MOVIES/INTRO_2.PSS` decoded; the instructions of 0x1f5cd0 and 0x364860 off the recomp's
listing (`recomp/output/*_0x<addr>.cpp`, the disassembly comments; read, nothing copied); eight more PCSX2 runs' `s05`
(`logs/parity/runs/pcsx2_mission_b` .. `_g`, `pcsx2_title1`, `transition_pcsx2`); the desktop's call trace of the menu's
starts (`desktop@be557831:docs/archive/STATUS-log-to-2026-09-26.md:2478`). Confidence of the new readings: **reading,
pending review**.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R141.1 | **The shell does not restart MENULOOP: there is no loop seam on the disc's data.** `dlgMenu`'s background is `TYPE MPEG` (1), not `MPEG_LOOPING` (2) -- research 121 R121.5, re-read here off READERC -- so at the stream's end the player fires event 3 (no ONMPEGEND binding on `dlgMenu`) and closes. B16's "loops on end" and the block's "the shell restarts MENULOOP at its end (the last picture index 3731 -> 0)" are drift | `menuHandoffDisc.test.ts` | §1 |
| R141.2 | **The idle menu leaves MENULOOP before its end**: `UiStopAttract` (dlgMenu's ONSTART) waits 120 s, `UiAttractMode` fades MENUFADER 0 -> 0.99 in 0.5 s, waits 0.5 s and switches to `dlgAttractCinematic`; the page builds it 121.2 s after `dlgMenu` with MENULOOP at picture ~3,611 of 3,732 (124.5 s). Nothing restarts the movie (the source's `restart` never called). The roller's keys do not restart the attract's wait (`UiStopAttract` is called by ONSTART, `CancelLoadGame` and `LoadGameOnListBox` only) | the same | §1 |
| R141.3 | **MENULOOP ends black on its own**: its pictures fade from ~3,300 (mean 27.7) to ~3,400 (10.0) and are black from ~3,500 (1.0) to the last (3,600-3,731: 0.0). The gate's s19 -- the manifest's `menu.attract-fade`, "the menu fading to the attract" -- is the menu over this dark end; UiAttractMode's own fade comes at or after s20 | `titleMenuDisc.test.ts` | §1, §4 |
| R141.4 | **`menu_fade_up`** (`UIanim.rdr`, auto-started with its set): `OBJECT_OPACITY_FROM_TO MENUFADER 1 -> 0` in **1.5 s** (rate -2/3), decoded and pinned; with `SetMenuValve`'s `0.99 -> 0 in 0.75 s` on the same node (research 139 §9) MENUFADER passes 0 on the 16th tick after the build, is under 0 until the 45th (one 0 on the 23rd, `SetMenuValve`'s end), and 0 for good from the 45th. *(2026-10-03, MENU-FADE: that is the opacity, and it stands -- R141.12; what the frame shows of it is nothing, R141.11)* | `menuHandoffDisc.test.ts`, `menuEntryFadeDisc.test.ts` | §2 |
| R141.5 | **A 2D quad's alpha reaches the GS as the low byte of a truncated integer**: `FUN_003643b0` converts the quad's colour with `vftoi0` (`FUN_001bfef8`) into a PACKED GIF packet (tag `0x3000400000008002`, NREG 3, FLG 0; registers `0x512`: ST, RGBAQ, XYZ2), and a PACKED RGBAQ keeps bits 7:0 of each word. So MENUFADER under 0 is an alpha of 128-255 ~~-- the black quad covers the frame --~~ *(2026-10-03, MENU-FADE: it would under the source blend, and does where no additive texture was bound; on `dlgMenu` the fader is added, R141.11, and nothing shows)* where the drawer took the negative alpha and brightened the menu by up to 1.6x (research 139 §9's concern). Fixed (`packedAlphaByte`); the text's glyphs, whose packet is PACKED RGBAQ too, in the fix round (`layoutText`) | `frame.ts`, `drawList.ts`, `text/layout.ts`; `compositor.test.ts`, `layout.test.ts` | §2 |
| R141.6 | **The hand-off on the page's path, from the key**: the switch's fade and countdown (17 ticks with Intro_2's own `menu_fade_up` at 0.24, 1.1 s in), the build -- its own frame the dialog as its file has it: `LoadGameBack`'s popup_bg under the logo, every roller item lit --, the menu whole from the next tick, 0.57 s after the key; the browser shows the same (§5). ~~the build, the menu lit as MENUFADER falls (15 ticks), black for 29 ticks (one lit frame), the menu whole 2.07 s after the key~~ *(the page until MENU-FADE, 2026-10-03: the owner's flicker)* | `menuHandoffDisc.test.ts`, `menuEntryFadeDisc.test.ts` | §2, §5 |
| R141.7 | **Against the console's burst** (PCSX2 `mb10_pcsx2/s06_burst_*`, ~0.22 s apart, from the key): burst_000 Intro_2's dark opening; burst_001-009 black -- the switch, then the console's build of `dlgMenu` off the disc, about 1.6 s the page does not spend --; burst_010 the build's own frame (the page's scores **97.7** against it); burst_011-016 the menu over MENULOOP's pictures 2, 9, 16, 22, 29, 36, undimmed (the page's frames at those pictures: **99.7, 97.2, 97.3, 98.1, 98.1, 98.1**). No fade-up and no black after the build: `MENU_ENTRY_FADE_READING` resolved. ~~The end agrees (ours 2.07 s); the lit fade-up of the first 0.5 s after the build is in none of the console's frames -- not explained, recorded~~ *(2026-10-03)* | `menuEntryFadeDisc.test.ts`, `menuHandoffDisc.test.ts` | §3 |
| R141.8 | **`title_menu.txt` on the page's path, the movie drawn: s00..s18 all >= 90 against `ref_main_menu_ours.png`, masked and whole** -- 91.1 .. 97.1 masked, 90.9 .. 97.2 whole (the gate's own unmasked rule); the script's `untilref` matches after 2 presses (dist 3.7), s00 0.9 s after `dlgMenu`'s build. *(Re-measured 2026-10-03 by MENU-FADE: 90.4 .. 97.4 both ways, dist 3.6 and 3.9 s before -- every capture is now 91 pictures sooner, §4)* | `titleMenuDisc.test.ts` | §4 |
| R141.9 | **Over the black stand-in the script cannot reach s00**: drive.py's thumbnail crops to content, a menu over black is cropped to the dialog's box, 47.3 from the reference (the bar 14), twelve presses spent. The page in the browser still draws the movie black (`MOVIE_SOURCE_PLACEHOLDER`: the worker source is not handed to `FrontEndSession`, a `frontEnd.ts` line), so the browser run of the whole script is owed to that line | `titleMenuDisc.test.ts` | §4, §6 |
| R141.10 | **The footer and the version line** (B19) are drawn over MENULOOP: `_507_DevelopedZipper_MSG`, `_508_Copyright_MSG` and `VERSION_STRING` "SOCOM 2 r0001 17:22:21 Oct 11 2003" (MENU-02a's: `registerMainUiVars`, the TEXT's UIVAR told at its attach; nothing undrawn in its frame) -- seen in the drawn run's captures, scored with them, not asserted apart | `titleMenuDisc.test.ts` (the captures) | §4 |
| R141.11 | **`ALPHA_1` is a register the last bound texture set, and MENUFADER's quad binds none** (MENU-FADE, 2026-10-03). A texture record ends in its bind packet -- a GIF A+D block of `ALPHA_1`, `TEX1_1`, `TEX0_1`, `TEST_1`, `CLAMP_1`, six quadwords selected -- which a textured quad sends before it draws (a `DIRECT`) and a mesh too (an `UNPACK` to VU1); the untextured fader sends its PRIM and ST, RGBAQ, XYZ2 alone. The tick draws the backplane (the controls), the 3D pass, then the foreplane (MENUFADER, POPUP), and the roller's twelve textures bind 0x48, Cd + Cs x As: while the roller is drawn the black fader adds nothing -- at 128, at a part, at a wrapped byte. Every other texture of the 57 `RUN/UI` libraries and the font's binds 0x44 | `uiCompositorView.ts` (the draw loop), `uiRasterRules.ts` (`blendAfterBind`, the rule's body since GM-05), `menuArt.ts`; `uiCompositorView.test.ts`, `menuEntryFadeDisc.test.ts` | §2 |
| R141.12 | **The opacity op adds; both programs run; MENUFADER does go under 0** (the brief's three questions). `FUN_0025f880` adds rate x dt to the node's +0x9c each tick and writes its target when its time is under dt plus what it has consumed; the begin writes its `from`; the scheduler ticks the instances in start order, every sequence with the whole step, so two ops on one node both add and the later begin's `from` is what the first tick leaves. `menu_fade_up` starts with its set, `SetMenuValve` from ONSTART right after (the desktop's call trace of the recompiled game lists them so); its fade is unconditional | `menuEntryFadeDisc.test.ts` | §2 |
| R141.13 | **Where no texture is bound the fader shows, on the console as on the page**: on `dlgSecondCinematic` (no control, no model) eight PCSX2 captures of Intro_2's opening are its picture k at the brightness `menu_fade_up`'s k-th tick leaves -- picture 6 at 0.14 and 0.18, 9 at 0.21, 10 at 0.24, 11 at 0.26 (twice), 12 at 0.28, 13 at 0.31, where the packed alpha gives 0.14, 0.20, 0.23, 0.25, 0.27, 0.30 | `menuEntryFadeDisc.test.ts` | §3 |
| R141.14 | **The title script's s19 and s20 now fall where the gate's do**: s19 (picture 3,444) scores 86.8 whole, inside B18's 83-90 band (82.9 at picture 3,535 before, 0.1 under it); s20 is the menu black under `UiAttractMode`'s fade -- the roller hidden first, so that fade covers -- 0.2 s before the attract's build, as the gate's s20 is black | `titleMenuDisc.test.ts` | §4 |

## 1. The hand-off and the movie's end

The boot's last switch (research 139 §1): `dlgSecondCinematic`'s ONMPEGEND `goto_menu_silent dlgMenu.rdr`, or one of
thirteen keys -> `goto_menu dlgMenu.rdr` (`SND_DINK`, `STOP_ANIMATION menu_fade_up`, `SWITCHMENU`). `dlgMenu`
(`tools/dump-dialogs.ts --dialog dlgMenu.rdr`): background `MPEG` `run/movies/common/menuloop.pss`, libraries
`ui/assetlib/ui2d`, `ui/assetlib/uibf`, scripts `dlgMenu.rdr`, `uianim.rdr`, `UIMemCardAnim.rdr`; ONSTART `PulseArrows`,
`UiStopAttract`, `SetMenuValve`, `has_memcard_changed`, `CleanupMissionMemory`. The build opens MENULOOP from picture 0
(research 121 row 4) after the ONSTART (D:L263745-263764), one picture a tick.

**No loop.** The loop flag is the background's type alone (`MPEG_LOOPING` -> 2 -> the shell's +0x27a, D:L263745-263755;
the parse D:L277326-277343), and `dlgMenu` says `MPEG` (`loadDialog(...).background` `{ type: 1 }`, pinned). At the
end the tick fires event 3 to the current dialog and, the flag clear, closes the stream (`FUN_00366940`
D:L262887-262892); `dlgMenu` binds no ONMPEGEND, so nothing follows, and the layer keeps the last picture it was given
(`MOVIE_HOLD_READING`) -- picture 3,731, which is black (R141.3). `menuHandoffDisc.test.ts` runs that end on the page's
path (its "held on the menu past the last picture" case: `dlgMenu` built without its ONSTART `UiStopAttract`, standing
in for the attract wait the LOAD GAME list keeps restarting): every picture to 3,731, the player `STOPPED` after it, no
restart and no re-open, the layer holding picture 3,731; with the loop flag forced on it fails (the source restarted,
the last picture 163 when the run stops). So "the last picture index 3731 -> 0" never happens on
the disc's data, and a seam "with no black frame beyond the original's" has nothing to compare: the original shows
black there for its own last ~230 pictures whichever way the end is handled. PC research 09's "the shell's loop restart
fires at the end of MENULOOP" was already withdrawn by research 121 §5 and §13; B16 still says "loops on end".

**The end is not reached idle.** `UiStopAttract` (decoded): `STOP_ANIMATION UiAttractMode`, `WAIT 120`, `SuspendMenuInput
3.0`, `CALL UiAttractMode`. `UiAttractMode`, two sequences under one condition (two `cmd 7` tokens, not decoded here):
the roller faded out in 0.25 s and hidden with the arrows; `FadeAllSounds`, `STOP_ANIMATION menu_fade_up`, MENUFADER
`0 -> 0.99` in 0.5 s, `WAIT 0.5`, `VagStreaming OFF`, `SWITCHMENU dlgAttractCinematic.rdr`; else `CALL UiStopAttract`
(the 120 s again). On the page the attract's dialog is built 121.2 s after `dlgMenu`'s (the 120 s, the fade, the
switch's countdown), MENULOOP's last picture then ~3,611; `menuHandoffDisc.test.ts` pins that it comes before 3,731 and
that the source is never restarted. Whether input defers it: `UiStopAttract` is started by `dlgMenu`'s ONSTART,
`CancelLoadGame` and `LoadGameOnListBox` only -- not by `OnMenuBtnDown` / `OnMenuBtnUp` -- so walking the roller does not;
the LOAD GAME list does (and turns the movie off and on, `BackgroundMPEG`), and `UiAttractMode`'s else-branch would if
its condition failed. Research 121 §13's question ("whether input during the 120 s restarts the attract timer") is
answered for the roller's keys: it does not.

**MENULOOP's own end** (the 3,732 pictures decoded in Node, the mean of R, G and B every 100 pictures): 0-300 ~23-24;
400-500 ~17; 800-3,200 26-33; 3,300 27.7; 3,400 10.0; 3,500 1.0; 3,600 and every picture from 3,700 to 3,731: 0.0.

## 2. The fade-up and the GS's alpha byte

`UIanim.rdr`'s `menu_fade_up` (flags & 7 = 1: it starts with its set, as `screenScripts.test.ts` holds):
one sequence, `OBJECT_OPACITY_FROM_TO MENUFADER from 1 to 0, rate -2/3, 1.5 s` (`decodeUiProgram`; pinned). The step
is `FUN_0025f880` (D:L108814-108831): the node's opacity (+0x9c) plus the rate times dt, and the target written when the
time is spent. `SetMenuValve`'s first sequence runs `MENUFADER 0.99 -> 0 in 0.75 s` on the same node from the same
build, so both step it (research 139 §9): measured on the page's path, MENUFADER falls 1.0, 0.95, 0.88 ... 0.02 over
the 15 ticks after the build, is -0.05 on the 16th, -0.45 on the 22nd, 0 on the 23rd (SetMenuValve's end writes its
target), then falls again at -2/3 a second alone to -0.47, and is 0 from the 45th (menu_fade_up's end, 1.5 s).

What the frame shows of an opacity under 0 is the 2D adaptor's and the packet's. The adaptor `FUN_0036d8b0`
(D:L266729-266747) sets the quad's alpha to f x 128 for f under 1 (research 112 §3, `drawnAlpha`). The quad's draw
`FUN_003643b0` (D:L261637-261708) builds a GIF packet: the tag `0x3000400000008002` (NLOOP 2, EOP, PRE with the quad's
PRIM, FLG 0 = PACKED, NREG 3), the register list `0x512` (ST, RGBAQ, XYZ2), and per vertex the ST, the colour
`FUN_001bfef8(dst, quad + 0x30)` and the position `FUN_001bfee8`. `FUN_001bfef8` (D:L40841-40853) is `lqc2`, `vftoi0`,
`sqc2`: the four floats (R, G, B at +0x30 .. +0x38, the alpha at +0x3c) truncated toward zero to 32-bit integers. In
PACKED mode the GS takes R, G, B and A from bits 7:0 of the four words. So the alpha the GS blends with is
`trunc(f x 128) & 0xff`: -6.2 is 250, -57.1 is 199, -0.6 is 0. With the fader black, an alpha of 128 or more leaves
`Cd + (0 - Cd) x A / 128 <= 0`, which the blend's clamp (`GS_MODULATE_BLEND_READING`) makes black *(2026-10-03,
MENU-FADE: under the source blend, 0x44. Which blend the fader draws with is the last bind's -- "The blend" below --
and on `dlgMenu` it is the additive one, under which a black quad changes nothing whatever its byte)*. The drawer had taken
the float as it was: a negative alpha brightened the frame under the fader by up to 1.6x for the second the fader sat
under 0 -- research 139 §9's "would *brighten* a non-black picture beneath". `packedAlphaByte` is now applied to every
2D quad's alpha in the draw list (`spriteItem`). The text's glyphs go the same way, read in the fix round: the text
draw's colour words are `int(float)` (D:L260695-260705, the bold alpha x 1.5 included) and `FUN_00361bd0` sends them in a
PACKED packet whose register list is `0x531` -- RGBAQ, UV, XYZ2 (D:L260266-260269) -- so `layoutText` now keeps bits 7:0
of each word too (`layout.test.ts`: -6.14 -> 250, bold -> 247). The models are not changed: their path (the 3D pass,
`projectModels`, its alpha clamped to 0-1) was not read here, and no model's opacity is known to go under 0. A fractional alpha is truncated as well, which moved two pinned scores by 0.1 (`uiCompositorScore.test.ts`:
dlgCreateGame's title band 98.0 -> 98.1 and 97.8 -> 97.9). The colour words go through the same `vftoi0`; the colours
the quads carry are whole numbers within 0-255, so only the alpha is converted.

### The blend: `ALPHA_1` is the last bind's (MENU-FADE, 2026-10-03)

The owner saw the entry flicker: on the page the menu came up as a ramp, went black for a second with one lit frame in
it, and came back at 1.5 s. The opacity behind that is the original's (R141.12): the op adds, both programs run, the
sum goes under 0. What the page had wrong is what the GS does with the fader's quad.

- **The op.** `FUN_0025f880` (D:L108804-108831) is the tick of `OBJECT_OPACITY_FROM_TO`: when the op's time (+0x14) is
  under dt plus the time the command has consumed, the node's +0x9c takes the target (+0xc) and the rest of dt is
  handed on; otherwise +0x9c takes +0x9c plus the rate (+0x10) times dt -- an increment, not a value computed from the
  start. `FUN_0025f960` (D:L108835-108848), its begin, writes the `from` (+8). Neither clamps; the command has no end
  function (the registration, D:L106889). Two running ops on one node each add on every tick, in the scheduler's order
  (start order: research 106 §2), and nothing arbitrates: the last begin's `from` stands after the first tick, each
  end's target for the tick it is written on.
- **The programs.** `menu_fade_up` (flags & 7 = 1) starts when `UIanim.rdr` is activated at build step 8;
  `SetMenuValve` is the third ONSTART binding, started right after (`FUN_00367950` D:L263692-263734). Its first
  sequence is `CameFromExtras = 0`, `BeenPastOptions = 0`, `SuspendMenuInput 0.75`, `SavedGames` and `LoadGameBack`
  hidden, then the fade: no condition on it, no valve read. The desktop's call trace of the recompiled game at the
  menu's build lists `menu_fade_up`, `PulseArrows`, `UiStopAttract`, `SetMenuValve`, `has_memcard_changed`,
  `CleanupMissionMemory`, `Ensure_MC_Dirs_Fast`, in that order (`desktop@be557831:docs/archive/STATUS-log-to-2026-09-26.md:2478`).
  So the opacity is the table's of R141.4: 0.946 on the first tick (0.99 - 1.32 dt), 0.0663 less a tick, under 0 from
  the 16th, -0.446 on the 22nd, 0 on the 23rd, -0.022 a tick down to -0.467 on the 44th, 0 from the 45th.
- **The quad carries no blend.** `FUN_003643b0` (D:L261637-261708) copies a texture's bind call in front of a textured
  quad (D:L261658-261668: the 16 bytes at the texture's +0x30) and then sends the PRIM in the GIF tag and ST, RGBAQ,
  XYZ2. MENUFADER's quad has no texture: nothing goes before it. The hook the draw calls first on its context (vtable
  +0x10) is, for the menu's context (the object at 0x49eaa8, its vtable at 0x406c10), the function at 0x1f5cd0: a bare
  return. The alpha's setter `FUN_00364860` (D:L261830-261849, checked against its instructions) leaves the PRIM's
  blend bit set at every alpha, 128 included.
- **The bind packet sets it.** A texture record ends in a prebuilt packet (research 36 §5). On every texture of `UI2D`,
  `UIBF`, `UI` and `FONT` it is a GIF tag (NLOOP 5, A+D) and `ALPHA_1`, `TEX1_1`, `TEX0_1`, `TEST_1`, `CLAMP_1`, and
  the record's `selectQwc` is 6: the whole block goes with a bind. `FUN_00354f80` (D:L252772-252832) keeps the packet
  and has `FUN_003c3ce0` (D:L315838-315872) build two DMA references to it: at +0x30 a `DIRECT` of the six quadwords
  (a 2D quad's bind) and at +0x40 an `UNPACK` of them into VU1's memory (a mesh's, kicked with it).
- **Nothing else writes it in a frame.** The game sets the GS's environment once (the ELF's packet at 0x3e0880:
  `ALPHA_1` 0x44, `COLCLAMP` 1, `TEST_1` 0x5000d among fifteen registers) and sends a shorter one at every flip
  (0x3e0980, from `FUN_003aff30` D:L304731-304835: DTHE, DIMX, FRAME_1, XYOFFSET_1, SCISSOR_1, TEST_1, ZBUF_1 -- no
  `ALPHA_1`). So an untextured quad is blended by the last texture bound before it.
- **On `dlgMenu` that is the roller.** The tick draws the backplane, the 3D pass, the foreplane (CMenuState's Tick,
  0x1f4700 - 0x1f47dc); the controls and the objects hang under the backplane (`FUN_003696d0` D:L264427-264492: the
  fallback parent is G+0xc4, as `dialogScreen.ts` builds them; research 115 §4.3 step 5 says foreplane), MENUFADER and
  POPUP under the foreplane (`FUN_00369170` D:L264251-264260 draws G+0xc8). So the fader follows the roller's quads,
  and their twelve textures -- `menu_*_on.tif`, `menu_*_off.tif` in `UI_TXR` -- bind `ALPHA_1` 0x48: (Cs - 0) x As +
  Cd. Black times any alpha is nothing added. Every other texture of the 57 `RUN/UI/*_TXR.ZED` libraries and of
  `FONT_TXR` binds 0x44 (a probe over all of them; the test pins the 134 of the menu's four libraries), and only
  `dlgMenu` names `mainmenu_roller`: no other dialog of the disc changes.
- **The scripts work around it.** Each program a binding of `dlgMenu` starts to leave it hides `Roller` (and the
  arrows) before it fades or switches -- `UiAttractMode` (the roller faded out in 0.25 s and hidden, then MENUFADER 0 -> 0.99),
  `UiprepMission1`, `CallOptions`, `do_multi_or_medius`, `go_to_LAN_play`, `CallExtras`, `MainMenuOnLoad` -- and with
  the roller hidden the last bind is a control's 0x44 again, so those fades cover. The entry's two fades run with the
  roller drawn, and are not seen.

The drawer carries the register through the draw list (`rasterizeUiDrawList`): a textured quad, a glyph and a drawn
triangle of the 3D pass set it to their bitmap's blend and draw with it; an untextured quad draws with it as it stands.
The roller's own quads are therefore drawn additive: against PCSX2's settled frame (`burst_030`, MENULOOP's picture
130; a probe) the roller's region fits Cd + 0.56 x Cs x As with the destination's coefficient at -0.10, where the
source blend needs +0.56 -- the picture behind the roller is not attenuated. (The 0.56 is §7's.) Two edges are not
read and are named: `GS_ALPHA_FRAME_START_READING` and `UI_MESH_BIND_READING` (§6).

The sequence the page draws from the key that skips Intro_2 (1.1 s into it, as the PCSX2 run pressed):

| ticks after the key | what is drawn | MENUFADER |
|---|---|---|
| 0-16 | Intro_2's picture under the switch's fade, then black | 0.24 -> 0.99 (the switch, 2 x min(dt, 0.05) a frame), the countdown |
| 17 | `dlgMenu` built: the dialog as its file has it -- `LoadGameBack`'s popup_bg whole under the logo, every roller item lit, the arrows whole (mean 34.0; 33.9 before GM-15d drew the 3D pass's models by the GS's top-left rule and GEQUAL, research 380 §4) | 1.0, the quad's alpha 128: added, nothing |
| 18 on | the menu whole (20.6 - 25.2 over the black stand-in while the roller settles, 22.4 after) | 0.95 -> -0.45, 0 on tick 40, -0.02 -> -0.47, 0 from tick 62 |

Until MENU-FADE the page drew tick 17 black, ticks 18-32 as a ramp (mean 1.3 -> 22.6), ticks 33-61 black but for tick
40, and the menu whole from tick 62.

## 3. Against the console

The PCSX2 run `logs/parity/runs/mb10_pcsx2` pressed CROSS at s05 (Intro_2's opening) and burst-captured the next 25 s
(`s06_burst_000..111`; the files ~0.22 s apart by their times; the key went down within the 0.18 s before burst_000).
Read again 2026-10-03 (MENU-FADE) with the movies decoded and the frames compared region by region:

- **burst_000**: Intro_2's picture 15 at 0.18 of its brightness -- that dialog's own `menu_fade_up` and the first ticks
  of the switch's fade over it.
- **burst_001 - 009** (1.9 s): black, every pixel 0. The switch's fade, then the console's build of `dlgMenu` -- its
  libraries, the roller, MENULOOP's stream off the disc: about 1.6 s the page does not spend (it builds 0.57 s after
  the key). Not the fader under 0, as this note first read these frames.
- **burst_010** is the build's own frame, drawn before any script has run: `LoadGameBack`'s popup_bg over the whole
  frame (a fit of the margins: 0.95 x popup_bg + 0.04 x MENULOOP's first picture), the logo and the legalese at 0.999
  and 0.996 of their settled brightness, every roller item lit, the arrows whole. MENUFADER is 1.0 and its quad's
  alpha 128 on that frame (the build writes the alpha, D:L263612-263626; the node's opacity is its constructor's 1.0,
  `FUN_00316e30` D:L215844) -- and the fader covers nothing. The page's frame on the build's tick scores **97.7**
  against it (the black control 67.5; before MENU-FADE the page's was black: 67.5).
- **burst_011 - 016**: the menu over MENULOOP's pictures 2, 9, 16, 22, 29, 36, each at 0.998 of the decoded picture's
  brightness in the margins, where no control draws; the roller's items dim, then NEW GAME lit and swelling as
  `ActivateMenuBtns` runs; the arrows pulsing up from 0.2. The page's opacity at those pictures is 0.81, 0.35, -0.11,
  0, -0.16, -0.31, and nothing of it shows on the console. The page's frames at the six pictures score **99.7, 97.2,
  97.3, 98.1, 98.1, 98.1** against them (before MENU-FADE: 70.3, 88.4, 60.1 -- the control's own --, 98.1, 60.2, 60.2).

So `MENU_ENTRY_FADE_READING` is resolved: the console's frames showed no lit half of a fade-up because no fade shows at
`dlgMenu`'s entry at all, and the black before the menu is the build. Of the two candidates this note first named, the
first -- "the console's build of `dlgMenu` costs real time" -- was half of it; the other half is §2's blend.

**The contrast: a fader that shows.** `dlgSecondCinematic` has no control and no model, so nothing binds a texture and
the register stays the environment's 0x44. Eight PCSX2 runs captured Intro_2's opening at different moments (each
run's s05, taken on a settled screen before the key). Matched against the decoded pictures by least squares they are
picture k at brightness r -- 6 at 0.14 and 0.18, 9 at 0.21, 10 at 0.24, 11 at 0.26 (two runs), 12 at 0.28, 13 at 0.31
-- where `menu_fade_up`'s k-th tick with the packed alpha leaves 0.14, 0.20, 0.23, 0.25, 0.27, 0.30 (R141.13). One
fade, the source blend and the alpha byte, measured: `packedAlphaByte` (§2) stands on it. The fit is good to about a
tick: whether picture k meets the fader's k-th tick or its (k+1)-th is not settled by it. (The page shows picture k
under the (k+2)-th: its first picture comes a tick late, research 121's `MOVIE_PICTURE_LATE_READING`.)

**What the console's timing leaves open.** The build's 1.6 s is the emulated disc's; a console's own is BOOT-01's.
The build's frame stays up on the console for as long as the first tick takes -- believed long, its card reads being
synchronous (`FUN_003a0950` D:L295499-295522 waits on `sceMcSync`, 0x1b4390; the desktop's trace lists `Ensure_MC_Dirs_Fast`'s
and `GetNumSavedGames`' `sceMcGetDir` calls on that tick) -- and burst_010 caught it; on the page it is one tick.

## 4. The title script on the page's path (the block's acceptance)

`tools/test/titleMenuDisc.test.ts` runs `scripts/parity/title_menu.txt` with PLAT-30's step runner (`runSteps`,
drive.py's vocabulary and its fixed-count `untilref`) over `FrontEndSession` from `/` -- the loader's screens, the boot
dialogs, SONY448, Intro_2, `dlgMenu`, all on the disc's scripts and art (`withMenuArt`) -- at a virtual clock (one
PLAT-12 tick per 1001/30000 s of the driver's time), the press the page hook's (`FrontEndSession.press`,
`__frontEnd.press` in the browser). Each capture is scored by the gate's rule (`judge`; `titleVerdict` over the window
s00..s18) against `scripts/parity/ref_main_menu_ours.png` (the gate's `TITLE_REF`, 320 x 224), masked with
`menuloopMask` taken from the same frame drawn with the movie layer cleared (the dialog alone), and whole.

**The movie drawn** (MENULOOP decoded by the page's core in Node; the wasm `S2U_FMV_WASM`): `untilref` presses CROSS
twice (the second skips Intro_2) and matches at dist 3.7; `dlgMenu` is built at 24.5 s and s00 is taken at 25.4 s
(0.9 s on), MENULOOP at picture 24; the captures follow 6 s apart at pictures 204, 384 ... 3,264 (s18). *(Re-measured
2026-10-03 by MENU-FADE: with the menu whole from its build the settle wait ends 91 ticks sooner. Before: dist 3.6, s00
at 28.4 s -- 3.9 s on: the ramp and the black, then the settle wait's 1.5 s --, pictures 115, 295 ... 3,355, and the
scores 97.2 / 97.2, 97.3 / 97.4, 96.7 / 96.9, 97.4 / 97.3, 94.3 / 94.3, 94.0 / 94.0, 95.2 / 95.2, 94.7 / 94.7, 90.4 /
90.4, 95.7 / 95.7, 96.2 / 96.2, 95.6 / 95.6, 94.1 / 94.0, 94.6 / 94.6, 94.2 / 94.3, 96.7 / 96.4, 91.7 / 91.5, 93.2 /
93.0, 97.2 / 97.1.)* Scores (masked / whole):

| s00 | s01 | s02 | s03 | s04 | s05 | s06 | s07 | s08 | s09 |
|---|---|---|---|---|---|---|---|---|---|
| 97.1 / 97.2 | 97.1 / 97.1 | 96.8 / 96.6 | 96.8 / 96.9 | 96.8 / 96.8 | 93.2 / 93.2 | 93.6 / 93.6 | 93.8 / 93.8 | 94.1 / 94.1 | 94.1 / 94.1 |

| s10 | s11 | s12 | s13 | s14 | s15 | s16 | s17 | s18 |
|---|---|---|---|---|---|---|---|---|
| 96.0 / 96.0 | 95.9 / 95.9 | 95.0 / 94.9 | 92.5 / 92.6 | 94.1 / 94.2 | 96.4 / 96.2 | 92.9 / 92.7 | 91.1 / 90.9 | 95.2 / 94.9 |

19/19 at or over 90 both ways: the block's reading level (masked) and the first half of its proven level (the gate's
rule unmasked) are met on the page's path in Node. The mask is small once the movie draws (0-26 blocks: the frame's
black corners), so the two columns differ by at most 0.3. The lowest, s17 (91.1 masked, 90.9 whole), is MENULOOP's
picture 3,084 behind the dialog's own blocks (the score does not say which part of the picture loses; it was s08,
90.4, at picture 1,555). The gate's own record for this window on the recompiled game is 93.2-99.4 (gate.py's
calibration). After the window: s19 (picture 3,444) is the menu over MENULOOP's fade to black, **86.8** whole -- inside
the gate's s19 band 83-90 (R141.3; 82.9 at picture 3,535 before, 0.1 under it); s20 is the menu still, black (nothing
over 4 of 255), 120.1 s after s00 and 0.2 s before the attract's build, in `UiAttractMode`'s fade -- which covers, the
roller hidden first (§2) --, as the gate's s20 is black; s21 and s22 are `dlgAttractCinematic` (Intro_2 at pictures 173,
353). ~~The gate's s20 is black where ours is 2.8 s into the attract: our s00 comes 3.9 s after the build, so the
attract (121.2 s after the build) falls 117.3 s after s00, before the gate's s20 at ~120.5 s~~ *(until MENU-FADE)*;
the console's s00-to-attract interval is BOOT-07's.

**The movie black** (the page's own stand-in): the script's `untilref` never matches -- 12 presses, dist 47.3 -- because
drive.py's thumbnail crops the frame to its content before the comparison (`crop_to_content`, ported in
`captureScore.thumb`) and a menu over black is cropped to the dialog's own box. That is why the drawn run is the
acceptance, and why the browser run of the whole script is owed: the page's session is still given the black source.

## 5. The browser run

2026-10-03, the lock FREE: headless Chromium (SwiftShader) on the Vite server at port 5312 over the worktree's
git-ignored partial tree under `public/maps/` (the files the front end reads, MENU-02a's copy), `/?devmode&menuflow`,
the opener from the loader; at `dlgSecondCinematic` + 1.1 s the hook's `press('CROSS')`, then the canvas read back every
animation frame for 6 s (`getImageData`, the shell's MENUFADER): the fade to 0.99 and `dlgMenu` by 0.37 s, the menu lit
0.43-0.84 s as the fader falls (mean 3.9 -> 22.6), black 0.87-1.82 s (the fader -0.05 .. -0.47, one 0 between), the menu
whole from 1.86 s (22.4); no brightened frame. The settled canvas scores 90.7 masked and 82.9 whole against
`ref_main_menu_ours.png` (the movie black). The script itself was not run in the browser (§4: it cannot reach s00 over
the black movie). The probe was a throwaway (`tools/zz-*.ts`), not committed. *(That is the page until MENU-FADE:
the ramp and the second of black are gone, below.)*

**MENU-FADE's run** (2026-10-03, the lock FREE): headless Chromium on the Vite server at port 5380 over a copy of the
lane's served tree and its built decoder, the controller's script (the canvas's mean each animation frame, the
dialog's name beside it; a copy in the agent's scratch folder, not committed), both paths. Before, on the preview (the
controller's run): the deep link's menu lit for 0.62 s, black 0.21 s (14 frames), lit a frame or two, black 0.68 s (42
frames); the opener's hand-off the same (4 and 17 frames at its frame rate). After: **no dark frame after the first
lit one on either path**. The deep link (`?devmode&menuflow=dlgMenu.rdr`): `dlgMenu`'s first frame at 1.19 s, black
for two frames (the build's tick has no frame there: the session's first), 21.7 at 1.25 s, 18.4 while the worker's
first pictures are awaited, 34 from 1.54 s on. The opener: black for the switch (10 frames), 29.4 on the build's frame,
18.4 for three frames, 34 from 0.19 s after it. The 18.4 is the menu over a movie layer still black: the page's first
picture comes late (research 121's `MOVIE_PICTURE_LATE_READING`), where the console's first tick has it.

## 6. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `MENU_ENTRY_FADE_READING` | why the console's frames show no lit menu in the first 0.5 s after `dlgMenu`'s build, where the scripts' `menu_fade_up` (with the packed alpha) lights it | §3: the dialog's build and the movie's stream start on the console not modelled; or the burst's timing; a 60 fps capture across the key (BOOT-01) or PLAT-36's trace of MENUFADER and the flips | resolved 2026-10-03 by MENU-FADE: no fade shows at the entry at all -- the fader is added after the roller's bind (§2 "The blend") -- and the console's black is its build of the dialog (§3) |
| `GS_ALPHA_FRAME_START_READING` (`packages/viewer/src/uiCompositorView.ts`) | the blend of an untextured quad drawn before any texture is bound in its frame | `source` (0x44, the GS environment's, the ELF's packet at 0x3e0880). The console keeps the register across frames (the per-flip packet at 0x3e0980 writes no `ALPHA_1`), so such a quad draws with the previous frame's last bind; that differs only after an additive last bind, which no script of `dlgMenu` leaves (each hides `Roller` before its switch). A register kept across the session's frames settles it | reading |
| `UI_MESH_BIND_READING` (`packages/viewer/src/uiCompositorView.ts`) | when a triangle of the 3D pass sets the register | when it is drawn; a culled face and a missing bitmap set nothing. Whether VU1 kicks a mesh's bind packet when every one of its triangles is culled was not read (the UI models' VU1 program); the roller's twelve textures bind the same 0x48, so it cannot matter there | reading |
| `MOVIE_SOURCE_PLACEHOLDER` (`viewer/src/frontEnd.ts`, research 139 §8) | the page's movie source, black | reused: the page's MENULOOP is black, so the title script's `untilref` cannot match in the browser (§4); the drawn run uses the page's decoder core in Node | retired 2026-10-03 by MOVIE-WIRE on the lane (the page's source is the disc's; the browser run of the title script is the controller's, owed in §7) |

Reused, not added: research 112's drawer readings (`GS_MODULATE_BLEND_READING`'s clamp is what turns the packed alpha
into black under the source blend), 121's `MOVIE_HOLD_READING` and `MOVIE_PICTURE_LATE_READING`, 139's
and 140's. `packedAlphaByte` is a read, not a reading (§2). `GS_MODULATE_BLEND_READING` (research 112 §9's row) is
narrowed by MENU-FADE, not retired: the blend equation left it (read: §2 "The blend"), MODULATE and the clamp stay.

## 7. Not done, where the sources disagree, what was found

- **The block's loop is not built, by the parity rule**: the disc says `TYPE MPEG` for `dlgMenu`, so the original does
  not restart MENULOOP (R141.1); the block's acceptance "the loop seam (3731 -> 0) shows no black frame beyond the
  original's" has no seam to measure on the console's data. What BOOT-01 can still capture: the menu held past 124.5 s
  (the LOAD GAME list open, which restarts the attract's wait) to show what the console draws after the last picture.
- **B16 says "loops on end"**; research 121 R121.5 and this note say not. The segment's fact is corrected in place.
- **The manifest's `menu.attract-fade`** called s19 "the main menu fading to the attract"; it is the menu over
  MENULOOP's own black end (R141.3): its row now carries the note.
- ~~**The fade-up's first half** is in the scripts and not in the console's burst (§3, `MENU_ENTRY_FADE_READING`).~~
  *(Resolved 2026-10-03, MENU-FADE: §2 "The blend", §3.)*
- **The browser run of the whole script is owed** to the page's movie source (§4, §5): handing PLAT-19c's worker source
  to `FrontEndSession` is a `frontEnd.ts` line, the hot file's budget used by MENU-02a. The Node run is the page's path
  with the page's decoder core; the browser showed the hand-off and the settled frame (§5).
- **The proven level**: the movie drawn and scored unmasked is met in Node (§4); "the seam against BOOT-01's capture"
  is answered by the data (no seam), the capture owed to BOOT-01 all the same.
- `UiAttractMode`'s condition (two `cmd 7` tokens) is not decoded here: BOOT-07's.
- ~~**Owed to BOOT-07: s19 is 0.1 under B18's band.** The page's s19 (picture 3,535, the menu over MENULOOP's black
  end, R141.3) scores 82.9 whole where B18 gives the gate's s19 83-90.~~ *(2026-10-03, MENU-FADE: s19 is picture 3,444
  now and scores 86.8, inside the band, and s20 is black as the gate's; §4, R141.14.)* What BOOT-07 still owes: the
  console's own s00-to-attract interval, and whether the gate's "fade" at s19 is MENULOOP's end (this note) or
  `UiAttractMode`'s MENUFADER.
- **Found by MENU-FADE, not its task: the roller is brighter on the page than on the console.** Against `burst_030`
  the roller's region fits 0.56 of the page's contribution (correlation 0.98; a probe), under either blend: the UI
  models' vertex colour or lighting is not read (`projectModels` takes the mesh's colours as they stand; research 95's
  `UI_MODEL_LIT_READING`). The additive draw adds to it a little: three pins of `mainMenuMovie.test.ts` fell 0.1 (96.1
  -> 96.0, 98.1 -> 98.0, 97.8 -> 97.7 at picture 202; 95.7 -> 95.6 at 2.5 s). MENU-02a's owner's.
- **Not modelled: the console's build time** (about 1.6 s of black between the switch and the menu on PCSX2; none on
  the page) -- BOOT-01's timed boot; and the register kept across frames (`GS_ALPHA_FRAME_START_READING`).
- **Other notes left as they stand** (not this task's files): research 115 §4.3 step 5 and its "Draw order" put the
  controls on the foreplane (they hang under the backplane: §2); research 139 §9 and research 140 §3 / §7 describe
  MENUFADER under 0 as brightening or as black -- on `dlgMenu` it is neither (§2); research 110's and 106's fade
  timings stand (they are the opacity's).
- **Not held by a test**: the margins' 0.998 at burst_011 - 016, the 0.95 x popup_bg fit of burst_010 and the roller's
  regression are a throwaway probe's numbers (`tools/zz-*.ts`, not committed); the scores of §3 are the test's.
