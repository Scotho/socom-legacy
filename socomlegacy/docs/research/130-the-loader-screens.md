# 130 -- The loader's raw screens: `PULOADGP.RAW` and `LOADING.RAW`, their upload, fades and order (BOOT-02)

Written 2026-10-02 for BOOT-02 (`../roadmap/02-boot.md` "BOOT-02"; facts B1-B6, B21). Sources: the **loader's**
decompilation `C:/Projects/socom_pc/game/analysis/SCUS_972.75.decomp.c` (`SCUS L<n>` = its line; the disc's boot ELF,
not the game's `socom2_game.elf`), the loader ELF `SCUS_972.75` itself read by virtual address with `tools/elfImage.ts`
(instruction words and the GIF packet at 0x1ce680), its strings (`SCUS_972.75.strings.txt`), the dev disc's
`RUN/RAW/*.RAW`, and captures: PCSX2's `golden/s00_CROSS.png` (the parity archive), `logs/parity/runs/pcsx2_mission_a/
s00_CROSS.png`, the recompiled game's `logs/parity/gate/x51_gate_iop/title/w00_000.png` and its 0.5 s boot burst
`logs/s13_31_boot_shots/` (PC KNOWN [raw-strips]). The code is `packages/ui/src/boot/loaderScreens.ts`; its tests
`packages/ui/test/boot/loaderScreens.test.ts` (CI, synthetic RAWs) and `tools/test/loaderScreensDisc.test.ts` (dev disc
and captures; skips without them). Confidence: **reading, pending review** for every transcription; the LOADING frame
is **capture-scored** (§4); the hold times are placeholders (§5; LOADING's stands in with the recomp's lower bound).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R130.1 | **A `.RAW` file is the upload's bytes and nothing else**: `width x height` CT32 pixels, bytes R, G, B, A, top row first, no header. Its dimensions are the call's (`FUN_001c6570(path, 0x280, h, x, y)`); every file's size is `640 x h x 4` | SCUS L44009-44065; the disc | §1 |
| R130.2 | **Four call sites, six files**: `jal 0x1c6570` at 0x1c518c (PULOADGP 640x128 at y 160), 0x1c593c (LOADING 640x448 at 0, 0), 0x1c5d1c (PUNOTREM / PUNOTRE2, the card-patch path), 0x1c6468 (PUPUTBAK / PUPUTBA2, the patch path's card-removed prompt); the argument registers read from the instructions | the ELF; SCUS L43514, L43660, L43757, L43981 | §1 |
| R130.3 | **The stored alpha is 0 in every pixel of all six files, and the screen does not show it**: the PMODE values the loader writes (0xe1, 0x7f23) take `MMOD` 1, the register's own ALP. The block's unknown "alpha 0x80 = 1.0 or 0xFF" is neither | the disc; SCUS L44029-44063 | §1 |
| R130.4 | **Each upload is framed by a fade**: 10 fields out (ALP 255 .. 25), the upload at ALP 0, 11 fields in (0 .. 254), then 0xff, then the steady 0x7f23. The eleventh field in exists only under the EE's round-toward-zero | SCUS L44024-44031, L44055-44063; the instruction words | §2 |
| R130.5 | **What is under the panel is black**: the GS setup sends a black SPRITE over 1024x1024 before anything is shown | `FUN_001c67c0` SCUS L44094-44098; the GIF packet at 0x1ce680 | §2 |
| R130.6 | **The order, disc boot, no card patch**: black (IOP reboot, `SIO2MAN`, `CDVDSTM`) -> PULOADGP (the five other IRX, the card library, the two slots' save check) -> LOADING (`DNAS.BIN`, `FTSCORE`, `ZSEALETC`, the overlay's start). With a patch, PUNOTREM/PUNOTRE2 come between them and **LOADING is still drawn after** -- the roadmap's "replace it" is corrected (§3) | SCUS L43391-43671 | §3 |
| R130.7 | **LOADING through the page's 640x448 path scores 99.9** against both PCSX2 captures (bar 98 / 90; the black control 84.9) **and 100.0, mad 0, against the recompiled game's frame** | `tools/test/loaderScreensDisc.test.ts` | §4 |
| R130.8 | **The hold times are not constants of the code**: they are the IOP loads, the card checks and the CD reads. No capture shows PULOADGP; the recompiled game's burst shows LOADING for >= 2.5 s. Both owed to BOOT-01 (H19) | §5 | §5 |

## 1. The files and the calls

`FUN_001c6570(path, width, height, x, y)` (SCUS L44009-44065) fades the screen out, opens the file, sets one image
packet (`FUN_001a2520`: DBP `(x*4 + y*0xa00) >> 8`, DBW `width >> 6`, PSMCT32, `width x 0x40`) and then, until the
height is used up, reads 0x28000 bytes (640 x 64 x 4) into a stack buffer, flushes the cache, sends them
(`FUN_001a2848`) and steps the packet's DBP by 0x280 blocks -- 64 lines of a 640-wide CT32 buffer (L44044-44052). So
the file is read and shown strip by strip, in file order, top strip first: LOADING in seven strips at DBP 0, 0x280 ..
0xf00, PULOADGP in two at 0x640 (line 160) and 0x8c0. PC KNOWN [raw-strips] measured the recompiled game putting every
strip at its own DBP (closed 2026-09-26).

The call sites, read from the ELF (the argument registers a1 width, a2 height, a3 x, t0 y set by `addiu reg, zero,
imm` or `daddu reg, zero, zero` in the five words before each `jal` and its delay slot; the test re-reads them):

| call | caller | file (string) | a1, a2, a3, t0 |
|---|---|---|---|
| 0x1c518c | `FUN_001c4cc0` (SCUS L43502-43514) | `PULOADGP.RAW` (0x1d43c8) | 0x280, 0x80, 0, 0xa0 |
| 0x1c593c | `FUN_001c4cc0` (SCUS L43648-43660) | `LOADING.RAW` (0x1d4458) | 0x280, 0x1c0, 0, 0 |
| 0x1c5d1c | `FUN_001c5b30` (SCUS L43739-43757) | `PUNOTREM.RAW` / `PUNOTRE2.RAW` (0x1d44d0 / 0x1d44e0, slot 0 / 1) | 0x280, 0x80, 0, 0xa0 |
| 0x1c6468 | `FUN_001c6390` (SCUS L43962-43981) | `PUPUTBAK.RAW` / `PUPUTBA2.RAW` (0x1d44f8 / 0x1d4508) | 0x280, 0x80, 0, 0xa0 |

The path is `cdrom0:` (0x1d4388) + `\RUN\RAW\` (0x1d43b8) + the name (+ `;1`, 0x1d4390) on a disc boot; `host0:.`
(0x1d4360) on a development boot (`iRam001e60c0` set), not modelled.

The files on the US disc (sizes and sha256 pinned by the test; decoded data, RS.R8):

| file | bytes | shows |
|---|---|---|
| `LOADING.RAW` | 1,146,880 (640x448x4) | the SOCOM II logo, the trident, "LOADING..." bottom right |
| `PULOADGP.RAW` | 327,680 (640x128x4) | a framed panel: "Locating saved data. Do not remove memory card (8MB) (for PlayStation®2)." |
| `PUNOTREM.RAW`, `PUNOTRE2.RAW` | 327,680 each | PUNOTREM: "Loading data from memory card (8MB) (for PlayStation®2) in MEMORY CARD slot 1. Do not remove memory card ..."; PUNOTRE2 the slot-2 panel (its picture not looked at; by the call's slot argument). BOOT-11's; not drawn here |
| `PUPUTBAK.RAW`, `PUPUTBA2.RAW` | 327,680 each | "No memory card (8MB) (for PlayStation®2) in MEMORY CARD slot 1 [PUPUTBA2: slot 2]. Please insert memory card (8MB) (for PlayStation®2). (cross) to continue." BOOT-11's |

Every pixel's fourth byte is 0 in all six. The display never reads it: during a fade `PMODE` is `ALP << 8 | 0xe1`
(circuit 1, `MMOD` 1, `SLBG` 1) and after it 0x7f23 (both circuits, `MMOD` 1): the merge uses the register's ALP, not
the buffer's alpha. `decodeRaw` therefore keeps R, G, B and makes the picture opaque. The colour order was checked on
the decoded pictures (the logo's gold and teal as the captures show them; a red/blue swap drops the PCSX2 score to
92.8, §4).

## 2. The fades and the frame under the panel

`FUN_001c6570`'s two loops, one step per `FUN_001a2110(0)` -- libgraph's `sceGsSyncV` (SCUS L21933-21960: it waits
for the V-blank and returns `CSR`'s field bit):

- out: f from 1.0, `PMODE = (int)(f * 255) << 8 | 0xe1`, f += -0.1, while f >= 0; then `PMODE = 0xe1` (ALP 0);
- in, after the upload: f from 0.0, the same write, f += 0.1, while f <= 1.0; then 0xffe1, then 0x7f23.

The instructions settle the arithmetic: the steps are the words 0xbdcccccd (`lui`/`ori` at 0x1c65c4/0x1c65cc) and
0x3dcccccd (0x1c6734/0x1c673c) -- 0.1 rounded to nearest at compile time -- added with `add.s`; 255.0 is 0x437f0000;
`mul.s` then `cvt.w.s`; the loops close on `c.lt.s`/`bc1f` and `c.le.s`/`bc1t` against 1.0. Under the EE's
round-toward-zero (`EE_FPU_ROUNDING_READING`, research 111 §1.4) the ALP values are 255, 229, 203, 178, 152, 127, 101,
76, 50, 25 out (10 fields) and 0, 25, 51, 76, 101, 127, 152, 178, 203, 229, 254 in (11 fields: the sum after ten adds
is 0.99999982 <= 1.0). Rounded to nearest the in-fade would stop after ten (the sum passes 1.0). In the page a field is
1001/60000 s (`VSYNC_HZ_READING`). The fade is drawn as a black quad at `1 - ALP/255` over the buffer
(`PMODE_ALP_SCALE_READING`): with `SLBG` 1 and `BGCOLOR` 0 (`FUN_001c67c0` SCUS L44077) the merge leaves each pixel
at ALP/255 of itself, which the quad reproduces.

The GS setup `FUN_001c67c0` (SCUS L44068-44100) sets 640x448 interlaced (`SMODE2` 1), both display circuits on the
buffer at 0 (`DISPFB1` = `DISPFB2` = 0x1400), `PMODE` 0x7f23, and sends the 10 quadwords at 0x1ce680 (read from the
ELF): a GIF tag (NLOOP 9, A+D), `PRMODECONT` 1, `FRAME_1` FBP 0, `XYOFFSET_1` 0, `SCISSOR_1` 0..1024 x 0..1024,
`TEST_1` 0, `PRIM` 6 (SPRITE), `RGBAQ` 0 (black, Q 1.0), `XYZ2` (0, 0) and (1024, 1024). So the frame starts black and
the panel's 128 lines sit on black (`LOADER_CLEAR`).

`DISPLAY2` is set one line lower than `DISPLAY1` (DY + 1, SCUS L44083-44090) and the steady 0x7f23 blends the two
circuits at 0x7f/255. Read literally that is a two-line filter; the captures decide against it (§4,
`CIRCUIT_MERGE_READING`).

## 3. The order

`FUN_001c4cc0` (SCUS L43391-43671), a disc boot (`iRam001e60c0` 0):

1. reboot the IOP with `DNAS271.IMG` (0x1d4378) and wait (L43441-43458); `FUN_001c67c0`: the black frame (L43471);
2. load `SIO2MAN.IRX`, `CDVDSTM.IRX` (0x1d4398, 0x1d43a8), each retried until it loads (L43472-43501);
3. **PULOADGP** (L43502-43514);
4. load `SIO2D`, `DBCMAN`, `DS2U_S1`, `MCMAN`, `MCSERV` (0x1d43d8..0x1d4418, L43515-43589); start the card library
   (L43590-43598); for slot 0, then slot 1, check `BASCUS-97275SOCOMII` and `APACHE00.ZDB` (0x1d4430, 0x1d4448;
   L43599-43643);
5. with a patch found: `FUN_001c5b30(slot)` draws **PUNOTREM** (slot 0) or **PUNOTRE2** (slot 1) and loads the
   overlays from the card (L43646, L43714-43766); a card read under -9 there calls `FUN_001c6390`, which draws
   **PUPUTBAK**/**PUPUTBA2**, waits for a pad button and relaunches the loader (`cdrom0:\SCUS_972.75;1`, 0x1d4520);
6. **LOADING** (L43648-43660), whatever step 5 did;
7. with no patch: `FUN_001c59c0` loads `DNAS.BIN` and `FTSCORE` + `ZSEALETC` from `cdrom0:\OVERLAY\REL\` (L43661-43663,
   L43676-43709); then the overlay is started (L43667-43668) and the game's own boot follows (BOOT-04).

`LOADER_SEQUENCE` is steps 3 and 6. **Drift found in the roadmap**: BOOT-02's "What the original does" says
"PUNOTREM/PUNOTRE2 replace it [LOADING] on the card-patch path"; the code draws the patch panel *before* LOADING and
LOADING after it on both paths. BOOT-11 owns that path.

The game ELF draws LOADING.RAW again on its own: CloseAndSwitch offline calls `FUN_003b1a70("RUN\RAW\LOADING.RAW")`
(D:L128118-128119, research 115; `showLoadingPicture` in `packages/ui/src/screens/screenCommands.ts`). That path is
the game's, not the loader's; `decodeRaw` serves it when it is wired.

## 4. The scores

LOADING at its hold (`LoaderScreens.frame`, `composeLoaderFrame`), drawn by the page's drawer `rasterizeUiDrawList`
(`packages/viewer/src/uiCompositorView.ts`) with `loaderTextures`, scored by `tools/captureScore.ts` `judge` (the
captures squeezed onto the 320x224 grid whole, compare.score's rule; no mask):

| capture | source | size | score | mad | block | black control |
|---|---|---|---|---|---|---|
| `golden/s00_CROSS.png` (`SOCOM_PARITY_ARCHIVE`) | PCSX2 | 640x480 | **99.9** | 0.0024 | 0 | 84.9 |
| `logs/parity/runs/pcsx2_mission_a/s00_CROSS.png` | PCSX2 | 640x480 | **99.9** | 0.0024 | 0 | 84.9 |
| `logs/parity/gate/x51_gate_iop/title/w00_000.png` | recomp | 640x448 | **100.0** | 0 | 0 | 84.9 |

With the two-line filter of §2 drawn (circuit 2 one line down under circuit 1 at 0x7f/255) the same frames scored
99.7 (mad 0.0059) against both PCSX2 captures and 99.7 (mad 0.0061) against the recompiled game's: the buffer as it
stands is closer to the original on every capture, so the page draws it so (`CIRCUIT_MERGE_READING`). With PCSX2's
4:3 letterbox correction (`pcsx2Letterbox`) the PCSX2 scores are unchanged (99.9). The block's bars are 98 (mission_a)
and 90 (golden): both met. The block's third check -- "the bytes equal the recomp's strip-upload trace" -- has no trace
file on this host: the recompiled game's own test (`ps2_gs_tests.cpp`, PC KNOWN [raw-strips]) builds the seven-strip
stream from the file and reads each strip back at its DBP; this note's test holds the same DBPs and strip order
against the file (§1), and the recompiled game's frame equals ours to the last byte the scorer sees (mad 0). A GS
upload trace of the original (PLAT-36) is still owed.

**PULOADGP has no frame**: no capture of the original or the recompiled game shows it (the recompiled game's burst
starts on LOADING at 1 s). It is recorded owed in the golden manifest's `statesWithoutFrame` as
`state.boot-loader-panel` (BOOT-01, `pcsx2-boot-timed`) and is not scored against any other state's frame.

## 5. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `VSYNC_HZ_READING` (`ui/src/boot/loaderScreens.ts`) | the fade's step, one field | 60000/1001 Hz: `sceGsSyncV` per step; `SMODE2` 1 (interlace) and `SYSTEM.CNF` `VMODE = NTSC` (B1). The field rate was not measured on a capture | open |
| `PMODE_ALP_SCALE_READING` | the merge's ALP scale | 255 = 1.0 (the loader ends each fade in on 0xff, SCUS L44062); read neither in a GS manual nor in PCSX2's merge for this task | open |
| `CIRCUIT_MERGE_READING` | the steady 0x7f23 picture | the buffer as it stands: the literal two-line filter (DISPLAY2 DY + 1) scores lower on all three captures (§4); how interlaced frame mode maps the DY unit was not read | open |
| `LOADER_START_PLACEHOLDER` | the black before the panel's fade (the IOP reboot, two IRX loads) | 0 s: no counterpart in a browser and no timed capture; BOOT-01's >= 2 Hz boot record and the owner's call H19 | open |
| `RAW_UPLOAD_PLACEHOLDER` | the black while a file is read and sent | 0 s: a CD read's time, not a constant; BOOT-01 | open |
| `PULOADGP_HOLD_PLACEHOLDER` | the panel's hold after its fade in (five IRX, the card library, the save check) | 0 s: no capture shows the panel; the panel shows through its fade in and LOADING's fade out (21 fields). BOOT-01, H19 | open |
| `LOADING_HOLD_PLACEHOLDER` | LOADING's hold until the game's boot takes the screen | 2.5 s stands in, from the recompiled game's burst (`logs/s13_31_boot_shots/`: LOADING at 1.0-3.5 s, the card search at 4.0 s) -- a lower bound on a loader whose IOP loads are not the console's, not a reading of the original (no wall-time test pins it); BOOT-01, H19 | open |

`EE_FPU_ROUNDING_READING` (research 111 §1.4) is reused for the fades' arithmetic.

## 6. The entry point

`LoaderScreens` (`@s2u/ui`) is the state the front end enters first: `new LoaderScreens()`, then per frame
`composeLoaderFrame(screens.frame(t))` drawn with `loaderTextures(await readLoaderImages(source))`, until
`screens.done(t)`; then the game's boot (BOOT-04: `dlgIntroScreen.rdr`). No route is added here: the route `/` and the
page's wiring are another stream's (the menu-flow routes).
