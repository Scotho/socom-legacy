# 358 -- BRIGHTNESS: CBrightnessTuner and the full-screen pass (OPT-11)

- Date: 2026-10-23. Simulation track (what the game draws); roadmap 04 OPT-11, "a brightness transform".
- Base: `origin/main` 6d4b79359, branch `agent/brightness`.
- Status: **reading** -- read from the retail ELF (decompilation, disassembly and initialized data), and re-read at
  the source by a fresh reviewer who did not write it (2026-10-23: PASS WITH FINDINGS, F1-F4 folded). No
  capture of the original at brightness 0, 0.5 or 1 was compared; nothing here is proven.
- Settles roadmap 04 OPT-11's unknown, "what `CBrightnessTuner` does to the image (gamma? a GS register? a post pass?)":
  **a post pass** -- a full-screen GS sprite blended over the finished frame.

## 1. Sources and method

The retail ELF `game/disc/socom2_game.elf` (SHA256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`)
under the owner's `SOCOM_PC_ROOT`, read three ways: the Ghidra decompilation `socom2_game.elf.decomp.c` (cited `D:L`),
a disassembly of the functions Ghidra did not make (capstone, MIPS64 little-endian, by address), and the initialized
data words of the ELF's loaded segments (by address). The recompiler's function names (`recomp/socom2_names.csv`, a
callgraph guess at 0.80) are used below only as pointers. No decompiled text or data beyond short constants is copied.

## 2. The tuner and its update

`InitSystemTuners` (`FUN_0038a7a0`, D:L282240-282480) makes the BRIGHTNESS tuner at D:L282298-282320: a UI variable
named by the string at 0x3fa938 (`BRIGHTNESS`), longevity 2, the object's vtable set to `PTR_PTR_00408040`, and the
variable's value set to the real 0.5 (the bytes 00 00 00 3F) unless it already holds the real 0.5. (Research 104,
research 229 §3 and roadmap 04 O4 already read the variable and its default; this note reads its effect.)

The tuner vtables are 16 bytes, the last word the update a variable's change calls (initialized data at 0x408020-0x40808f):

| vtable | its update | the tuner |
|---|---|---|
| 0x408040 | **0x38a000** | BRIGHTNESS (`CBrightnessTuner`) |
| 0x408050 | 0x389f90 | STICK_SENSITIVITY (research 204: `FUN_00389f90` -> `FUN_002da8a0`, +0x290) |
| 0x408060 | 0x389f10 | STICK_INERTIA (research 204: +0x2a4 = 1 - v) |
| 0x408070 | 0x389e70 | STICK_DEADZONE (research 204: `FUN_00389e70` -> `FUN_002da7d0`, +0x288) |

The three stick rows match research 204's reading slot for slot, which places the brightness update at 0x38a000.
Ghidra did not make it a function (it is reached only through the vtable); disassembled, 0x38a000-0x38a03c reads the
variable's value -- a real (type 2) as it is, an int (type 1) converted, anything else 0.0 -- into `$f12` and jumps to
0x3afbe0.

## 3. The pass's alpha (0x3afbe0, disassembled)

0x3afbe0-0x3afd40 (between `FUN_003afba0` and `FUN_003afd50`; not decompiled) on the value b in `$f12`, with the global
`DAT_003e1408` (initialized 0x80):

- **b == 0.5** (`c.eq.s` against 0x3F000000): `DAT_003e1408` = 0x80.
- **b < 0.5**: A = `cvt.w.s`(204.8 x (0.5 - b)) -- the scale the f32 0x434CCCCD (204.8); `cvt.w.s` truncates toward
  zero -- stored in `DAT_003e1408`; the doubleword 0x46 written at 0x3e0ab0; if A is 0, `DAT_003e1408` = 0x80 again.
- **b > 0.5**: A = `cvt.w.s`(204.8 x (b - 0.5)); the doubleword 0x49 written at 0x3e0ab0.
- Then, every branch: `DAT_003e1408 << 24` written as the doubleword at 0x3e0ad0.

At b = 0 or 1, A = trunc(102.4) = 102.

## 4. The packet at 0x3e0a80 (the ELF's data, eight quadwords)

A GIF tag (NLOOP 7, EOP, NREG 1, REGS A+D), then seven register writes:

| quadword | register | value | meaning |
|---|---|---|---|
| 0x3e0a90 | TEST_1 (0x47) | 0x30000 | depth test on, always passing |
| 0x3e0aa0 | ZBUF_1 (0x4e) | 0x13a000118 | depth writes masked (ZMSK) |
| 0x3e0ab0 | ALPHA_1 (0x42) | **0x46 or 0x49** (§3) | the blend |
| 0x3e0ac0 | PRIM (0x00) | 0x46 | a sprite with alpha blending (ABE) |
| 0x3e0ad0 | RGBAQ (0x01) | **A << 24** (§3) | colour black, alpha A |
| 0x3e0ae0 | XYZF2 (0x04) | x 0x6c00, y 0x7200 | the frame's top left (1728, 1824 in 12.4) |
| 0x3e0af0 | XYZF2 (0x04) | x 0x9400, y 0x8e00 | its bottom right, 640 x 448 further |

The GS blend is ((A - B) x C >> 7) + D, C the source alpha As = A, the source colour black:
- ALPHA 0x46 (A = 0, B = Cd, C = As, D = Cd): Cd + ((0 - Cd) x As >> 7) -- **Cd x (1 - A/128)**, darker;
- ALPHA 0x49 (A = Cd, B = 0, C = As, D = Cd): Cd + (Cd x As >> 7) -- **Cd x (1 + A/128)**, brighter.

So the slider's ends give 1 - 102/128 = 0.203 and 1 + 102/128 = 1.797 of the picture.

## 5. When it is drawn

`FUN_003afba0` (D:L304644-304654) sends the packet (`FUN_003b13b0(0x3e0a80, 8, 1, 0)`) whenever `DAT_003e1408` is not
0x80. Its only caller is `FUN_00350cd0` (D:L250150-250170), which sends it first and then the frame's closing DMA tag:
the pass is the frame's last draw. `FUN_00350cd0` has sixteen callers; among them `FUN_001ebed0` at D:L50807, after
the world and the HUD (its `DAT_0044d688` branch), and functions the recompiler names `CCoreState_Tick`,
`CLoadState_Tick`, `CMenuState_UnInit` and `CGameMenu_LoadFromDesign` -- the match, the loading screen and the menus.
So the whole picture is scaled, the HUD and the menus with it.

## 6. In the browser (`viewer/src/brightness.ts`)

- `brightnessAlpha` and `brightnessFactor` are §3 and §4 in f32 (`Math.fround`) with `cvt.w.s`'s truncation. One
  difference is named: `Math.fround` rounds to nearest where the EE FPU's `sub.s` and `mul.s` round toward zero; over
  the slider's 0.00-1.00 in steps of 0.01 no alpha differs (the review's simulation, 2026-10-23).
- `brightnessOfVars` reads the variable as 0x38a000 does: a real as it is, an int converted, any other type 0.0; no
  variable at all is the default (the tuner never told).
- The factor is a CSS `brightness(k)` filter: a per-channel multiply in the picture's own encoded space, clamped, which
  is what the GS blend does to the frame buffer. At b == 0.5 (and a darkening A of 0) no filter and no inline style.
- The screens that take it are the game's own: the front end's frame (`#front-end`), a match's canvas (`mountMatch`),
  `/testroom`'s `#view` (its HUD is drawn into the same canvas) and the original loading screen. The launcher's chrome
  and the page's instruments do not -- they are not the game's picture.
- The value: the front end's session `BRIGHTNESS` each frame (OPTIONS > VIDEO's slider, now unparked); `/testroom` the
  card's stored tuners (`pageCardTunerVars`, as the volumes, at boot and at each card read).
- **A named difference** (a browser adaptation of the pass's rendering, not of its rule): the GS shifts (`>> 7`, a
  negative product floored) where CSS rounds, so a channel may differ by one step of 256.

## 7. Open, and what would raise the level

- **COLCLAMP and PABE.** The packet sets neither. The brightened values clamp only if the frame's COLCLAMP is on (the
  usual state); the port clamps (CSS). With PABE on, a pixel whose alpha has its top bit clear -- every A here is at
  most 102 -- would draw the sprite unblended, opaque black; the port assumes PABE off. No static A+D write to either
  register was found in the ELF (the review's scan, 2026-10-23); a runtime write is unread. Settled by a capture at
  brightness 0 and 1 over a white area, or by reading the game's COLCLAMP and PABE writes.
- **The proven level**: OPT-11's acceptance -- a recomp or PCSX2 capture of a fixed scene at brightness 0, 0.5 and 1
  against the browser's, compared on luminance histograms (roadmap 04 OPT-11, OPT-19).
- **Review**: an independent re-read of §2-§5 at the ELF (the vtable words, the two disassembled ranges, the packet
  words), as research 204 was read.
