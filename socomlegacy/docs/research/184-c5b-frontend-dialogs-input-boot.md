# 184 -- C5b -- the front end's dialogs, popups, boot, menu input, soft keyboard, routes, loading, UI variables and valves

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C5b-frontend-dialogs-input-boot.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §10.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** `CheckTeamStatus` answers 0 because no game exists -- answer 0 is right today, but implement the game's test: game object && (team byte || word 0x441470) (V4 #14, §10).

**Overridden in part (research 206 §1):** the menu tick is 30 Hz -- 29.97 Hz (525 HBLANKs) (V4 #17, §10).

Agent C5b-frontend-dialogs-input-boot, research wave 2026-10-04. Read-only. Scripts and their outputs:
`scratch/C5b/` (README lists what each prints). `$PORT` = the `agent/online` snapshot. `D:L<n>` = a line of
`socom2_game.elf.decomp.c` (r0001); `SCUS L<n>` = `SCUS_972.75.decomp.c`. ELF reads are of
`C:/Projects/socom_pc/game/disc/socom2_game.elf` (`scratch/C5b/elf.py`); disassembly by capstone (`disas.py`).
Machine-readable ledger: `ledger-C5b.tsv` (68 rows).

## 0. Summary

Inventory: the 49 `C5b-` ledger names, 2 names defined in this cluster's files that the ledger files elsewhere
(`MENU_TICK_RATE_READING`, `MENU_KEYS_READING`), 14 *note only* gaps from notes 104, 114, 115, 116, 118, 119 and 125,
and 3 unnamed items from the sweep (`scratch/C5b/sweep.out`; nearly all other sweep hits are names already counted,
`unknown` as a TypeScript type, or `open` as a verb).

| status | all 68 rows | the 49 ledger names |
|---|---|---|
| RESOLVED | 24 | 17 |
| PARTIAL | 9 | 8 |
| UNRESOLVED | 11 | 5 |
| NOT-A-GAP | 24 | 19 |

Five findings change code that is in the port now:

1. **`DPTOFP_ROUNDING_READING` is wrong.** The game's `dptofp` truncates toward zero, so `SuspendMenuInput 0.15` is
   0x3e199999, not 0x3e19999a. PROVEN two ways: the machine code, and a unicorn run of the game's own function.
2. **`SKB_BLANK_READING` is wrong for two keys on the US grid.** Š (U+0160, cell 352) and Ÿ (U+0178, cell 376) count as
   white space in the original, because the ctype lookup runs past the end of its table. PROVEN from the ELF's static
   bytes.
3. **`SKB_FIT_READING` differs at the edges.** The original's width test includes each word's trailing spaces, and a
   first word too wide for the line fails the whole text. PROVEN.
4. **`UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER`: three of the four `unknown` rows are short reads with real
   answers.** Offline, `IsNetwork` answers 0 and `CheckTeamStatus` answers 0 where the port gives 1; `MediusEnabled`
   answers 1, as the port already does.
5. **`MENU_STICK_READING` can become a read.** The game's dead zone, rescale, clamp and radial step are all read,
   with their values taken from PCSX2 RDRAM dumps.

| item | status | grade | answer (one line) |
|---|---|---|---|
| ARMORY_TOUCH_READING | NOT-A-GAP | - | browser adaptation; C4 owns it |
| BOOT_CARD_STUB_PLACEHOLDER | NOT-A-GAP | - | a stub scenario for BOOT-05 (unbuilt card) |
| BOOT_HARDWARE_STUB_PLACEHOLDER | PARTIAL | STRONG | the no-HDD answer is now sourced (status 1); the rest is BOOT-09's scenario |
| CHILD_SCALE_READING | RESOLVED | STRONG | scale about the parent's place: the disc's centre stays at x=590 over 22 PCSX2 samples |
| CIRCUIT_MERGE_READING | PARTIAL | BELIEVED | no new lever; the captures keep deciding it |
| DESKTOP_SCREEN_LOOK_PLACEHOLDER | NOT-A-GAP | - | no original; the owner's call |
| DESKTOP_SCREEN_TEXT_PLACEHOLDER | NOT-A-GAP | - | no original; the owner's call |
| DPTOFP_ROUNDING_READING | RESOLVED | PROVEN | **wrong: chop, not nearest** |
| EE_FPU_ROUNDING_READING | PARTIAL | STRONG | supported: the soft-float path also chops (C6 owns it) |
| HDD_ABSENT_STATUS_READING | RESOLVED | STRONG | 1, by every path without a usable HDD |
| INPUT_STRING_NULL_READING | NOT-A-GAP | - | the screens cluster's |
| LISTBOX_UNSET_READING | NOT-A-GAP | PROVEN | all 66 disc LISTBOXes carry the four keys; the heap is not cleared |
| LOADER_START_PLACEHOLDER | UNRESOLVED | - | no timed console boot capture exists |
| LOADING_FADE_READING | PARTIAL | STRONG | the capture shows the fade in and no fade out; duration not resolvable at 1 fps |
| LOADING_HOLD_PLACEHOLDER | UNRESOLVED | - | as LOADER_START |
| LOADING_SCREEN_WAIT_PLACEHOLDER | NOT-A-GAP | - | browser adaptation |
| LOAD_CONFIG_VALVES_PLACEHOLDER | NOT-A-GAP | - | feature work (BOOT-05 / OPT-02) |
| MENU_KEY_LATCH_READING | NOT-A-GAP | - | browser adaptation |
| MENU_STICK_READING | RESOLVED | STRONG | the game's pipeline transcribed, with values from PCSX2 |
| MENU_TOUCH_READING | NOT-A-GAP | - | browser adaptation |
| ONL_02_RETURN_FOCUS_READING | NOT-A-GAP | - | the screens cluster's |
| PHYSICAL_TYPING_READING | PARTIAL | STRONG | the USB repeat is `sceUsbKbSetRepeat(0, 20, 6)`; the unit is not in the corpus |
| PMODE_ALP_SCALE_READING | PARTIAL | BELIEVED | ALP/255; immaterial (under 0.4%) |
| POPUP_FOCUS_PULSE_READING | NOT-A-GAP | - | already resolved 2026-10-02 |
| POPUP_FONT_READING | RESOLVED | PROVEN | the dialog's `FONT`, the whole chain read |
| POPUP_NAME_UNUSED_READING | NOT-A-GAP | - | note only |
| POPUP_STALE_FOCUS_READING | RESOLVED | STRONG | the handler read: the toggle plus sound on stale widths |
| POPUP_TEXT_SCALE_READING | NOT-A-GAP | - | 1.0 everywhere |
| POSITION_UNSET_READING | NOT-A-GAP | PROVEN | 144 + 42 entries all carry the keys |
| PULOADGP_HOLD_PLACEHOLDER | UNRESOLVED | - | as LOADER_START |
| RAW_UPLOAD_PLACEHOLDER | UNRESOLVED | - | as LOADER_START |
| ROT_FIELD_READING | RESOLVED | PROVEN | the machine code stores all three to +0x24; ROTZ wins; no disc file uses them |
| ROUTE_SESSION_PLACEHOLDER | NOT-A-GAP | - | browser design |
| SCREEN_BUTTONS_STEP_READING | NOT-A-GAP | - | a test-only path |
| SINGLE_CONTROL_FOCUS_READING | RESOLVED | PROVEN | the transcription is exact; its doc wording needs a fix |
| SKB_BLANK_READING | RESOLVED | PROVEN | **Š and Ÿ count as blank** |
| SKB_CELL_TOKEN_READING | RESOLVED | PROVEN | the typed nodes confirm it; parse with types |
| SKB_FIT_READING | RESOLVED | PROVEN | **trailing spaces are measured** |
| SKB_JAMO_READING | NOT-A-GAP | PROVEN | no such word on the US grids |
| SKB_KEYPAD_READING | RESOLVED | PROVEN | confirmed |
| SKB_LEGEND_ORDER_READING | UNRESOLVED | - | the draw order not traced; no capture |
| SKB_PIECE_ATLAS_READING | RESOLVED | PROVEN | 512x512 from the texture headers |
| SKB_RECIP_NODES_READING | RESOLVED | STRONG | confirmed; **`SkbRecipState0.tif` is absent from the disc** |
| SKB_TOUCH_READING | NOT-A-GAP | - | browser adaptation |
| TOKEN_TYPE_READING | RESOLVED | PROVEN | exact; a typed parse removes it |
| UIVAR_REUSED_VALUE_READING | PARTIAL | BELIEVED | the stale word is the previous var's; it is unknowable only for strings |
| UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER | PARTIAL | PROVEN | the 4 `unknown` rows read (IsNetwork 0, CheckTeamStatus 0, MediusEnabled 1) |
| UI_TEXTURE_BANKS_READING | RESOLVED | STRONG | the global asset list in load order; the first library holding the name wins |
| VSYNC_HZ_READING | RESOLVED | STRONG | 59.94 Hz, from the game's own 15734.25 H/s |
| MENU_TICK_RATE_READING (C6's file) | RESOLVED | PROVEN | `DAT_003e1400` = 30 |
| MENU_KEYS_READING (C3's file) | NOT-A-GAP | - | the owner's key map |
| TRIGGER_BINDING_READING (note) | RESOLVED | STRONG | pad +0x11..+0x13 = 0 in every PCSX2 dump |
| LIST_EVENT_PRESSURE_READING (note) | RESOLVED | PROVEN | fires only at raw pressure 129; never with a W3C d-pad |
| STICK_SWAP_READING (note) | RESOLVED | STRONG | off (the constructor clears it; 0 in the captures) |
| POPUP_SUSPEND_READING (note) | RESOLVED | STRONG | `SuspendMenuInput` silences the popup |
| UNHELD_BITMAP_READING (note) | PARTIAL | STRONG | null handle; the image's bit 0 is cleared |
| SKB_PAD_BYTES_READING (note) | RESOLVED | PROVEN | the table re-read |
| SKB_JOIN_READING (note) | RESOLVED | STRONG | consistent with the wrap read |
| POPUP_FOCUS_READING (note) | NOT-A-GAP | - | already read |
| SKB_SCALE, SKB_CLOSE_SOUND, VALVE_POOL, UIVAR_ELEMENT_EQUAL, MENU_EVENT_RECORDS, R114's five EXIT_* (notes) | UNRESOLVED | - | not attempted this pass (see the ledger) |
| 3 unnamed sweep items | NOT-A-GAP | - | the fn2 builder's caller, the online stand-ins, the load-phase OWED markers |

---

## 1. The input: the pad, the stick, the focus ring

### 1.1 MENU_STICK_READING (`$PORT/packages/viewer/src/menuInput.ts:47-52`) -- RESOLVED, STRONG

**What it stands for.** How the browser gamepad's left stick becomes the menus' stick.

**Current value.** The W3C axes, both negated, with no dead zone; the menus' 0.2 / 0.6 hysteresis is then applied to
the raw W3C value.

**Prior search.** Research 116 §11 and §15: "the game's own dead zone and curve (pad +0x288, D:L179566-179633) are not
reproduced".

**What I did.**
- Read the whole stick path of the pad reader `FUN_002da930`, D:L179556-179811.
- Read its helpers: `FUN_002da3a0` (D:L179274-179348), `FUN_002da200` (D:L179233-179269), the constructor
  `FUN_002dbb90` (D:L179950-180009), the defaults `FUN_002da5e0` (D:L179353-179389), the presets `FUN_002da6c0`
  (D:L179394-179419) and the clamp `FUN_00267a60` (D:L113440-113457).
- Read the values the game actually held from the PCSX2 RDRAM dumps `logs/parity/title_pcsx2.rdram`,
  `postload_pcsx2.rdram` and `spawn_pcsx2.rdram`: the pad record pointer is `DAT_0044f108`, the record is at 0x849e90
  in all three. Script: `scratch/C5b/padrec.py`, output `padrec.out`.

**Answer.** The menus read pad +0x220 / +0x224: the dispatch `FUN_00368650` copies them into `DAT_0049ea78` /
`DAT_0049ea80` at D:L263848-263849 and applies the 0.2 / 0.6 hysteresis to the previous frame's values at
D:L263829-263846. Those fields are the left stick (+0x210 / +0x214) after this pipeline:

1. `v = (127.5 - raw) * 0.007843138` per axis (D:L179556-179559). Raw 0 is +1, so x is positive to the left and y
   positive upwards; the port's sign flip matches.
2. `FUN_002da3a0`, a stuck-stick filter. It acts only when |v| < +0x28c (0.01), which the dead zone below zeroes
   anyway, so it is inert in the menus.
3. **Dead zone.** If |v| < +0x288 the axis becomes 0 (D:L179566-179578). +0x288 = **0.3** (0x3e99999a) in all three
   PCSX2 dumps. The constructor's default is 0.33 (D:L179359); I did not find the writer of 0.3 for stick 0.
4. **Rescale**, when +0x2a0 is set (it is 01 in the dumps; D:L179594-179613): `v -= sign(v) * 0.3`, then
   `v *= 1/(1-0.3)`, then clamp to [-1, 1] (`FUN_00267a60` with bounds 0x3df220 = -1.0 and 0x3df228 = 1.0).
5. **Radial step** `FUN_002da200`, when +0x2a1 is set (01 in the dumps), in mode `DAT_003df240` = 1 (ELF):
   - Compare `(int)|x|` with `(int)|y|`. If `(int)|y| < (int)|x|`, f = y/x; if `(int)|x| < (int)|y|`, f = x/y; else f = 1.
   - Then x and y are each multiplied by `sqrt(|f| + 1)` and clamped to ±1 (bounds 0x3df248 / 0x3df250).
   - Inside the unit square the integer casts are both 0, so this is a gain of sqrt(2).
6. **The curve** (D:L179636-179689) is gated by +0x2a8 / +0x2a9, which are 00 for stick 0: off. The **smoothing**
   (D:L179744-179799) needs +0x2a2, which is 0: off. The **swap** (+0x20c, D:L179800-179807) is 0: off.
7. The pipeline then copies +0x210 / +0x214 to +0x220 / +0x224 (D:L179810-179811).

The stick-0 config the game held (+0x284..+0x2ab):

| offset | value | role |
|---|---|---|
| +0x284 | 0.0164 | stuck-filter step |
| +0x288 | 0.3 | dead zone |
| +0x28c | 0.01 | stuck-filter threshold |
| +0x290 | 0.65 | curve multiplier |
| +0x294 | 1.0 | curve exponent |
| +0x298 | 1 | stuck-filter flag |
| +0x29c | 0.2 | stuck-filter time |
| +0x2a0 | 1 | rescale on |
| +0x2a1 | 1 | radial on |
| +0x2a2 | 0 | smoothing off |
| +0x2a4 | 0.75 | smoothing |
| +0x2a8 / +0x2a9 | 0, 0 | curve off |

**Implementation suggestion.** Add `MENU_STICK_PIPELINE` to `viewer/src/menuInput.ts`, applied to the negated W3C axes
before the 0.2 / 0.6 hysteresis: steps 3-5 above with dead zone 0.3, in the f32 helpers (`Math.fround` with the port's
chop helper, `EE_FPU_ROUNDING_READING`). Write the tests first:
- an axis at 0.29 gives 0;
- 0.5 gives `(0.5-0.3)/0.7*sqrt(2)` = 0.404;
- full right gives x = -1;
- the diagonal (0.7, 0.7) gives `((0.7-0.3)/0.7)*sqrt(2)` = 0.808 on both axes.

Rename the constant to a read (`MENU_STICK`) and keep one reading for the writer of 0.3.

**Owed evidence.** Where stick 0's 0.3 / 0.65 / 0.75 are written. A watchpoint on pad+0x288 in PCSX2 from boot, or a
read of the in-game options' writer of the `stick_preset` valve, would settle it (see Leads).

### 1.2 TRIGGER_BINDING_READING (note only, research 116 §15) -- RESOLVED, STRONG

The pad record comes from `FUN_00180e10(0x2d4)` (D:L179010). Sizes above 0x18 go to `FUN_00181b40`, which is newlib
`malloc` (`FUN_00194c30`, names csv). Nothing clears the record. In every PCSX2 dump, pad +0x11..+0x13 =
`00 00 00` (`padrec.out`). So the reading "0, inert" is what the console held at the title, after a load and at the
spawn. No code change.

### 1.3 STICK_SWAP_READING (note only) -- RESOLVED, STRONG

The constructor sets pad[0x20c] = 0 (D:L179958). The swap would apply at D:L179800-179807. The value is 0 in every
dump. "Off" is right.

### 1.4 LIST_EVENT_PRESSURE_READING (note only) -- RESOLVED, PROVEN

The pressure f32 is `(float)raw * DAT_003df268`, and `DAT_003df268` = 0x3b808081 (1/255, ELF), per
`FUN_002d9ff0` D:L179170-179171. Byte 2 of that f32 is 1 **only for raw = 129**, under both nearest and chop
(`pressure_byte.py`). The pad does run in pressure mode: +0x1e4 = 3 in the dumps, and D:L179518-179520 sends it.

So `dlgLANBriefingRoom` GAMELIST's `ONSCROLL` fires on a frame whose DOWN pressure reads exactly 129. A real DualShock 2
can pass through that value; a W3C d-pad, which is digital, never does. The port's "never fires" is right for the
browser.

### 1.5 SINGLE_CONTROL_FOCUS_READING (`$PORT/packages/ui/src/input/focusRing.ts:29-33`) -- RESOLVED, PROVEN

I read `FUN_003670d0` (D:L263102-263176) line by line:
- It deactivates the control at +0x6d0 (vtable +0x54) and steps the index modulo +0x290.
- If the new control is enabled (+0x48), it activates it (+0x50) only when the index changed, and plays the sound
  only then.
- If the new control is disabled and some control is enabled, it recurses with sound 0 and plays the sound unless the
  walk came back to the old index.

`FocusRing.step` is an exact transcription of this. Only the doc is imprecise: the deactivated-and-not-re-activated
case is a ring of **one control** (n = 1). A ring with n > 1 and one enabled control re-activates it silently, which
is the `LADDER_LIST_FOCUS` case.

**Suggestion.** Reword the JSDoc to "a ring of one control (n = 1)". No behaviour change.

### 1.6 MENU_TICK_RATE_READING (`ui/src/input/menuInput.ts:39-47`; the ledger files it under C6) -- RESOLVED, PROVEN

The ELF holds `DAT_003e1400` = 0x1e and `DAT_003e13f8` = 0x1e (`elf.py 3e1400 1 u32`). The cap loop is D:L304747. So
30 Hz.

### 1.7 DPTOFP_ROUNDING_READING (`$PORT/packages/ui/src/input/menuInput.ts:65-74`) -- RESOLVED, PROVEN: the reading is wrong

**Current value.** `'to nearest'`; `atofF32 = Math.fround(parseFloat(s))`.

**Prior search.** "the soft-float library rounds to nearest; the body not read line by line".

**What I did.**
- Disassembled `dptofp` (`FUN_001a12d8`, 0x1a12d8-0x1a132c). It unpacks the double (`FUN_001a0838`), takes
  `(frac << 2) >> 32` with a sticky bit, and calls `FUN_001a06f0` -> 0x1a05d8.
- Read 0x1a05d8, the pack routine: it forms the fraction with `srl $a1,$a1,7` at 0x1a0638 (and in the delay slot at
  0x1a0624) and adds **no** rounding constant. It returns through `mtc1 $a2,$f0`.
- Ran the game's own function under unicorn (`tools_py/ee_unicorn.py`) on 11 doubles: `scratch/C5b/dptofp_unicorn.py`,
  output `dptofp_unicorn.out`. Every non-exact value comes back **truncated**:

| input | game | nearest-even | chop |
|---|---|---|---|
| 0.15 | 0x3e199999 | 0x3e19999a | 0x3e199999 |
| 0.1 | 0x3dcccccc | 0x3dcccccd | 0x3dcccccc |
| 1+3·2^-24 | 0x3f800001 | 0x3f800002 | 0x3f800001 |

**Answer.** `dptofp` rounds toward zero. `SuspendMenuInput "0.15"` is 0x3e199999 = 0.14999999105930328.

**Implementation suggestion.**
- Rename the constant to `DPTOFP_ROUNDING = 'toward zero'` (a read, not a reading).
- Make `atofF32` chop: take `Math.fround(x)` and, when |that| > |x|, step one ulp toward zero (the same chop as
  `text/f32.ts`).
- Test first: `atofF32('0.15') === 0.14999999105930328`.
- What moves with it: the suspend's dispatch count stays 5 at 100/2997 s a tick (0.149999991 / 0.0333667 = 4.4955,
  ceil 5), so no sequence test changes.

### 1.8 POPUP_SUSPEND_READING (note only, research 118 §11) -- RESOLVED, STRONG

- `SuspendMenuInput`'s writer is `FUN_001f3bb0` (D:L54351-54358): it writes `*(MS+8) + 0x900`, with MS = 0x408538.
- The shell tick (D:L262262-262269) runs the dispatch `FUN_00368650` only when +0x900 <= 0.
- The dispatch's first act is the popup's handler, when the POPUP node is visible (D:L263850-263854).

So a suspended menu silences the popup too, and the reading holds.

---

## 2. Popups

### 2.1 POPUP_FONT_READING (`$PORT/packages/ui/src/popup/popup.ts:69-75`) -- RESOLVED, PROVEN

The chain, read end to end:
- The design parser stores the dialog's `FONT` string (key 0x3f9eb0 = "FONT", ELF) into design+0xc (D:L277309-277315).
- `CGameMenu_LoadFromDesign` builds menu+0x210 with `FUN_00359c40(menu+0x210, UiParams root, design+0xc's string)`
  (D:L263492-263505). That function reads UiParams `faces` -> name -> `texture` (strings 0x3f8868 and 0x3f8870).
- The popup's +0x300 is set to menu+0x210 (D:L263672), and `FUN_00370610` gives it to the text and both labels
  (D:L268377-268379).
- `FUN_0038dea0`, which the note thought might fill +0x210, is the soft keyboard's initialiser
  (`DAT_0049ecd0 = 0`, then `FUN_0038bac0` on each layout). It is handed the same +0x210 (D:L263668).

**Answer.** The popup draws in the face named by the dialog's `FONT`, which is the port's reading.

**Suggestion.** Rename the constant to a read (`POPUP_FONT = 'the dialog's FONT'`) and cite D:L277309 / D:L263505 /
D:L263672. The soft keyboard should take the same face; the port already does this through the dialog context, so
check it rather than change it.

### 2.2 POPUP_STALE_FOCUS_READING (`popup.ts:84-89`) -- RESOLVED, STRONG

The popup's input handler `FUN_00370990` (D:L268478-268549), on LEFT (pad +4) or RIGHT (+3):
- toggles +0x334 between 1 and 2 when the other label's width (+0x9d0 or +0x580) is > 0;
- switches the label states (vtable +0x50 / +0x54);
- plays `SELECTION` (`FUN_0036a2c0`);
- never checks the valve pointer +0x330.

A buttonless record clears only +0x330 (D:L266856-266858). So the widths and the answer are stale, and the toggle and
its sound happen, as the reading says. On CROSS, +0x330 = 0 means no valve write (D:L268489-268506).

**Owed.** Whether the toggled labels are visible on a buttonless popup: a PCSX2 frame of `boot.card-searching` (popup
827) with LEFT pressed.

### 2.3 POPUP_TEXT_SCALE_READING -- NOT-A-GAP

`FUN_00370610` initialises the word to 1.0 (0x3f800000 at D:L268380). Note 118 §2 counts 1.0 on all 285 records. No
picture depends on what the word means.

### 2.4 POPUP_NAME_UNUSED_READING, POPUP_FOCUS_PULSE_READING, POPUP_FOCUS_READING -- NOT-A-GAP

These are a note-only reading, a row already resolved (2026-10-02, `POPUP_FOCUS_GLOW`) and an interpretation of a bit
already read. Nothing is open.

---

## 3. The dialog loader and the `.rdr` reader

### 3.1 A note on typed parsing (applies to TOKEN_TYPE, SKB_CELL_TOKEN, and research 117's UIVAR_SPEC_TOKEN)

The compiled `.rdr` keeps each node's type byte: 1 int, 2 float, 3 string, 4 list (research 36 §6). `parseRdr` drops
it. `scratch/C5b/dumprdr.ts` dumps the same files with the type kept, about 40 lines of code. A `parseRdrTyped` in
`packages/archive/src/rdr.ts`, returning `{i}|{f}|{s}|list`, would turn three readings into reads. The test: every
member of `RUN/UI/READERC.ZAR` and `READERX.ZAR` parses, and the soft keyboard's integer cells are exactly
`[34, 161, 352, 376, 8222, 8364]`.

### 3.2 TOKEN_TYPE_READING (`$PORT/packages/ui/src/rdrLookup.ts:29-30`) -- RESOLVED, PROVEN

Research 105's typed probe already found the reading exact on the disc. With the typed parse above, it becomes a read.

### 3.3 LISTBOX_UNSET_READING (`$PORT/packages/ui/src/dialog.ts:66-71`) -- NOT-A-GAP, PROVEN

**The engine's lookup.** `FUN_0032f0d0` (D:L230212-230252) walks a list's elements in order, searching a list element
recursively. A string equal to the key answers the next node. `scratch/C5b/rdrfind.py` is that walk in Python.

**The disc.**
- 58 LISTBOXes in `RUN/UI/READERC.ZAR` and 8 in `READERX.ZAR`: **every one** carries all four keys
  (`listbox_keys.out`).
- `dlgMPBriefingRoom` GAMELIST has a stray `"OnPlayerListReturn"` string between `XSIZE` and `YSIZE`. A pairwise parse
  finds none of its keys, which is my first scan's error (`rdrscan.py`, superseded). The engine's walk finds them all.

**The allocator.** The object comes from `FUN_00180e10(0x120)` -> `malloc` (D:L277914), which is not cleared. The base
constructor `FUN_00383160` (D:L278187-278230) does not touch +0x24..+0x30. So an unset value would be heap garbage, and
no disc dialog reaches it.

**Suggestion.** None for behaviour. Keep 0. Add a disc test that all 66 LISTBOXes resolve the four keys through
`RdrLookup`; it guards the stray-token case.

### 3.4 POSITION_UNSET_READING (`dialog.ts:73-82`) -- NOT-A-GAP, PROVEN

Re-verified with the engine's lookup: 144 MAPCONTROL elements and 42 RADIOSTRIP subordinates, 0 lacking a key
(`pos_unset.py`, output `pos_unset.out`).

### 3.5 ROT_FIELD_READING (`dialog.ts:248`) -- RESOLVED, PROVEN

The question was whether D:L277177-277184 is a decompiler merge of three stores. The machine code
(`scratch/C5b/rot_dis.txt`, `FUN_003812b0`) shows it is not:

| key | key string | stored by |
|---|---|---|
| ROTX | 0x3f9ff8 | `swc1 $f0, 0x24($s2)` at 0x38149c |
| ROTY | 0x3fa000 | `swc1 $f0, 0x24($s2)` at 0x3814c0 |
| ROTZ | 0x3fa008 | `swc1 $f0, 0x24($s2)` at 0x3814e0 |

All three go to the same offset, so the last one, ROTZ, wins. No `.rdr` in READERC or READERX carries
ROTX/ROTY/ROTZ (grep of the typed dumps: 0 files). The behaviour is unreachable on the disc.

**Suggestion.** Change the comment to "machine code 0x38149c/0x3814c0/0x3814e0: one field, ROTZ wins". Keep the
behaviour.

### 3.6 UIVAR_REUSED_VALUE_READING (`$PORT/packages/ui/src/uiVars.ts:62-67`) -- PARTIAL, BELIEVED

From research 104 §9's read of `FUN_00386b00` (D:L280167-280186): the stale value word is the previous occupant's.

| previous var | what the new int reads |
|---|---|
| an int | that int |
| an f32 | its bits, as an int |
| a string | a pointer, which cannot be known |

So the port could carry the int and f32 cases exactly; only the string case is a true unknown. I did not scan the
disc for a var added without `VALUE` after a temporaries' clear.

**Owed.** That scan: dialogs' `UIVAR` specs without `VALUE` whose name a temporary held before. Without one, nothing
needs changing.

---

## 4. The soft keyboard

### 4.1 SKB_BLANK_READING (`$PORT/packages/ui/src/keyboard/text.ts:48-57`) -- RESOLVED, PROVEN: the reading is wrong for two US keys

**How the original decides.** `FUN_003996b0` (D:L291028-291074) decodes each character with `FUN_0039f0c0`, which is
UTF-8 to 16 bits (D:L294576-294595). It then tests the byte at `0x1d08d1 + (c & 0xffff)` for bit 0x08 (D:L291064).

**Where those bytes are.** Segment 1 of the ELF (0x100000-0x1d5000) is file-backed, read-only data. So every
c < 0x472f reads a static byte, PROVEN by the ELF. For c >= 0x4d2f the read lands in .bss, which is runtime data.

**The results** (`skb_blank.py`, output `skb_blank.out`):
- Below 256, the white space is 0x09-0x0d and 0x20.
- Above 256, **5446 code points under 0x472f have the bit set**. Among the US grid's integer cells: **U+0160 (cell 352,
  Š) byte 0x1d and U+0178 (cell 376, Ÿ) byte 0x0a are white space**. U+201E (8222) and U+20AC (8364) are not.

**Answer.** A text made only of Š, Ÿ and spaces is blank in the original: the name is refused or treated as empty, as
`FUN_003996b0`'s callers do.

**Implementation suggestion.**
- Replace the 256-entry rule with a 0x472f-byte table read from the ELF and checked in as a constant, or with the
  exact set the US grids can produce: `{0x09-0x0d, 0x20, 0x160, 0x178}`.
- Test first: `skbBlank([0x160]) === true`, `skbBlank([0x20ac]) === false`.
- Typed USB keys produce ASCII only (research 119 §10), so no other code point reaches the test from a US keyboard.

### 4.2 SKB_FIT_READING (defined `keyboard/text.ts:58-67`; named in `softKeyboard.ts:436`) -- RESOLVED, PROVEN: the port differs at the edges

**What I read.**
- `FUN_0039a5b0` (D:L291706-291785) calls `FUN_0039ae50(width x the font scale, ..., text, font, mode 1)`.
- Mode 1 (D:L292166-292190): the first segment starts at the text. A new segment starts at every byte that is
  non-white after a white byte. The test is ctype bit 0x08, with a **signed** index: `lb` at 0x39af18 / 0x39af0c.
- A segment is therefore a word **plus its trailing white space**, and the last one runs to the NUL.
- `FUN_0039b350` (D:L292261-292331) lays out lines. Each line extends segment by segment while the width of the text
  from the line's start to the segment's end, **trailing spaces included**, is <= the width.
- When the first segment of a line is already too wide, the layout returns 0: the text does not fit at all.
- `FUN_0039a5b0` then refuses when there are more lines than 1, or 2 when `UserStringLineHeight` is set (D:L291742-291754).

**How the port differs.** `skbWrap` measures character prefixes, cuts after the last space within the fit, and then
extends over the following spaces **without measuring them**. Example, at a width that just fails "AAAA " but passes
"AAAA":
- original: the first segment "AAAA " does not fit, so the whole text is refused;
- port: lines "AAAA " and "BBBB".

**The high bytes.** The signed index means bytes 0xd5-0xd7, 0xe0, 0xe1, 0xe4, 0xe7, 0xe8, 0xef, 0xf1-0xf3 and 0xf8 count
as white space in the wrap (`skb_fit_ctype.py`). None occurs in the UTF-8 of a US grid character (C2/C3 lead bytes,
80-BF continuations, E2 82 AC, E2 80 9E), so the US disc is unaffected.

**Implementation suggestion.**
- Rewrite `skbWrap` segment-wise: split where white is followed by non-white; take segments greedily while
  `measure(line + segment including its trailing spaces) <= width`; return null when the first segment of a line fails.
- Tests:
  - `skbWrap("AAAA BBBB")` with width = measure("AAAA") + 0.5 is null;
  - with width = measure("AAAA ") it gives two lines.
- `SKB_JOIN_READING`, below, then holds by construction.

### 4.3 SKB_JOIN_READING (note only) -- RESOLVED, STRONG

Line 1 keeps its trailing spaces, because they belong to its last segment (D:L292171-292190). So `FUN_00399d20`'s
append of line 2 restores the text.

### 4.4 SKB_CELL_TOKEN_READING, SKB_JAMO_READING (`keyboard/params.ts:41-55`) -- RESOLVED / NOT-A-GAP, PROVEN

The typed dump of `RUN/UI/READERC.ZAR` `UiParams.rdr` has 12 grids (`skb_cells.py`, output `skb_cells.out`):
- integer cells: exactly 34, 161, 352, 376, 8222, 8364;
- the digits 0-9 are **string** nodes;
- the multi-character words are only `Action2, BackSpace, CapsLock, Enter, Exit, Legend, MsgPlayer, ParenL, ParenR,
  Quote1, Recip, Shift, Space, Switch1, null`, so no jamo lookup is reached.

**Suggestion.** With the typed parse, read integer cells as code points directly and drop the reading.

### 4.5 SKB_PIECE_ATLAS_READING (`keyboard/params.ts:134-139`) -- RESOLVED, PROVEN

`RUN/UI/UISK_TXR.ZED`'s texdat headers (u16 width and height at +0 and +2, research 36 §5) give
`SKB_English_Set.tif`, `SKB_English_Set2.tif`, `SKB_Euro_Set.tif` and `SKB_Euro_Set2.tif` as 512x512, 8 bpp
(`uisk_sizes.ts`, output `uisk_sizes.out`).

**Suggestion.** Rename to `SKB_PIECE_ATLAS = 512` and cite the file.

Also from the same listing: `SkbLegend.tif` is 128x256 (`UiParams` draws it at 170x230), and `SkbBg.tif` is 512x256.

### 4.6 SKB_RECIP_NODES_READING (`softKeyboard.ts:48-53`) -- RESOLVED, STRONG; a new finding

**What the code does.**
- `FUN_0038b8f0` (D:L282873-282929) looks the key up in the layout's key map (+0x164, through `FUN_0038e8f0`). Only
  when the key is there does it build both images with `FUN_00395d50` at the key's rectangle (+0 / +4 position,
  +8 / +0xc size).
- It is called with key 1 (`SkbRecipState0.tif` / `SkbRecipState1.tif`, D:L283007) and with key 0xb
  (`JapWideKeyCap.tif` / `JapNarrowKeyCap.tif`, D:L283008).
- The toggle `FUN_00396220` (D:L289181-289203) acts only when both +0xa0 nodes exist.

So the reading is confirmed.

**New.** `SkbRecipState0.tif` is **in no file of the disc tree**: a byte grep of `RUN/` finds only `SkbRecipState1` in
`UI/UISK_TXR.ZED`. The ELF names both strings (0x3fad20 and 0x3fad40). The state-0 image is therefore built with a null
texture handle (see `UNHELD_BITMAP_READING`). The TEAM/ALL indicator draws only in state 1.

**Suggestion.** Check the port draws nothing for state 0 rather than falling back; test that state 0 renders no texel
at the Recip key's rectangle. Capture `A_37_namekbd.png` shows the key labelled `TEAM`.

### 4.7 SKB_KEYPAD_READING (`keyboard/usb.ts:31-35`) -- RESOLVED, PROVEN

`FUN_002dbd90` (D:L180055-180092) does `memset(rec, 0, 0x20)` and then writes only +0, +4, +8, +0xc and +0x14. The +0x18
gate at D:L283414 therefore never opens. Confirmed.

### 4.8 SKB_PAD_BYTES_READING (note only) -- RESOLVED, PROVEN

Re-read from the ELF: 0x3fb388 holds `01 03 02 02 02 03 03 04 01 04 05 04`.

### 4.9 SKB_LEGEND_ORDER_READING (`softKeyboard.ts:55-60`) -- UNRESOLVED

**Searched.**
- `SkbLegend.tif` is named only in `UiParams.rdr` (Legend `Size 170 230`, `SlideInSec` / `SlideOutSec` 0.2), not in
  the ELF.
- The layout build `FUN_0038bac0` adds two images at the end (D:L283009-283024): +0x480 (texture `DAT_004a1320`) and
  +0x530 (texture 0). Each goes through `FUN_00395d50` -> `FUN_0036ab20`, which adds the node to the parent through the
  parent's vtable +0x28 (D:L265212-265230).
- Which of the two is the legend, and the order the parent's list draws in, were not traced.
- The capture `A_37_namekbd.png` has the legend closed.

**Owed evidence.** Either:
- a PCSX2 frame mid-slide of the legend (the persona name keyboard, press LEGEND, capture at 60 fps across the 0.2 s
  slide), to see whether the keyboard covers the legend; or
- a read of the parent's vtable +0x28 (insert at the head or the tail) together with the draw walk.

### 4.10 PHYSICAL_TYPING_READING (defined `viewer/src/softKeyboardKeys.ts:12-25`) -- PARTIAL, STRONG

The owner's adaptation stands. Its open sub-item, "the USB library's repeat was not read", now has an answer: the USB
keyboard init `FUN_002dbf00` (D:L180137-180147) calls:
- `sceUsbKbInit`;
- `sceUsbKbSetCodeType(0, 0)`;
- `sceUsbKbSetRepeat(0, 0x14, 6)`, which stores 20 and 6 into the keyboard's record (`FUN_001beda0` D:L39841-39857;
  names csv 0x1beda0).

The unit of 20 and 6 is not in the corpus. Sony's libusbkb reference would give it; it is likely 1/60 s, which would
make 0.333 s to the first repeat and then every 0.1 s, but that is a **lead**, not a source.

**Owed.** The unit, from the libusbkb reference or from the IOP module `usbkeybd.irx` on the disc, if present.

**Suggestion.** Optionally replace the browser's repeat with 20 / 6 units once the unit is settled.

### 4.11 SKB_TOUCH_READING, MENU_TOUCH_READING, ARMORY_TOUCH_READING, MENU_KEY_LATCH_READING, MENU_KEYS_READING -- NOT-A-GAP

Browser adaptations with no original; owner's defaults.

### 4.12 SKB_SCALE_READING, SKB_CLOSE_SOUND_READING (note only) -- UNRESOLVED, not attempted

The open/close timing needs a 60 fps capture. The close sound belongs to the sound table (C7, research 122).

---

## 5. Textures and the loading screen

### 5.1 UI_TEXTURE_BANKS_READING (`$PORT/packages/viewer/src/frontEndAssets.ts:28-34`) -- RESOLVED (the mechanism), STRONG

**The lookup.** A dialog bitmap resolves through `FUN_0036a230(name, ctx)` (D:L264825-264850), which calls
`FUN_00321390(0x45c3c0, name)`. That function is **`zdb::CAssetList::GetTexHandle`** (names csv; the demo symbol's
callgraph match, 0.80). It walks the global asset list 0x45c3c0 from its first element and asks each library's texture
table (`FUN_00354670(lib+0x14, name)`) until one answers. It returns null when none does (D:L221922-221935).

**The list's order.** Libraries are appended at the **tail**: `FUN_001feae0(out, 0x45c3c0, &end sentinel 0x45c3c4,
&lib)` at D:L221650-221651 and D:L221744-221745, the std::list insert before end(). The list is cleared at
D:L328843-328845. So the search order is the order the libraries were loaded, and the first library loaded that holds
the name wins.

**Answer.** The port's "first bank holding the name" is the right rule, provided the port loads banks in the original's
library load order.

**Suggestion.**
- Order `pageUiTextures`' banks by the load order the dialogs' `LIBRARIES` and the font library imply. The font
  library is the boot's, so it comes first if it is loaded first; this was not traced.
- Today the loads complete in arbitrary order (`Promise.all`, `banks.push` on completion), so the lookup order depends
  on network timing. Make `banks` ordered by declaration, not by completion.
- Test: two banks holding one name, with the second resolving first, still answer from the first.

**Owed.** The boot's load order of the font library against the dialog libraries: the callers of `FUN_00320ea0` and
`FUN_00320d70` at boot.

### 5.2 UNHELD_BITMAP_READING (note only, research 125 §7) -- PARTIAL, STRONG

When no library holds a name, `GetTexHandle` returns 0 and `FUN_0036a230` returns 0. The image builder `FUN_003646d0`
(D:L261748-261768) then clears the image's +0x14 bit 0, when +0x14 bit 3 is set. The draw's use of bit 0 was not read.
"Nothing drawn" is consistent with this.

### 5.3 CHILD_SCALE_READING (`$PORT/packages/viewer/src/loadingLayout.ts:26-34`) -- RESOLVED, STRONG

**The second line of evidence.** The PCSX2 1-fps READY series `logs/parity/s4_pcsx2/{A,B}_ready010..020` (research 18
§: one frame a second after READY) shows the loading disc in 22 samples. Its bright-pixel extent varies in width from
3 to 31 px, and its **centre stays at x = 590.0 in every sample** (`disc_spin.py`, output `disc_spin.out`).

A scale about the child's own origin (its top-left at -15) would move the centre with the width. So the disc turns
about the parent's place, as the reading says.

**Suggestion.** Rename to `CHILD_SCALE` (a read with a capture) and cite `disc_spin.out`. A test asserting that the
drawn disc's centre is invariant under the spin already exists or is cheap.

### 5.4 LOADING_FADE_READING (`$PORT/packages/ui/src/loading.ts:150-162`) -- PARTIAL, STRONG

**The capture the note named.** The note owed the series `A_ready009..020`; it is on disk (`ready_lum.py`,
`ready_ratio.py`, outputs alongside):
- frame 8 is black;
- frame 9 is the loading screen **uniformly dimmed**: the per-pixel ratio to the steady frame 12 is 0.423 (A) and 0.386
  (B), with the 10th-90th percentile spread under 0.02, which is a black fader;
- frames 10-20 are at ratio 1.000;
- frame 21 is already the round, itself dark;
- no frame shows the loading screen partly dimmed before the round.

**Answer.**
- A fade in from black is drawn.
- No fade out is captured. At 1 fps a fade out shorter than about 1 s could still fall between samples, so the "no fade
  out" half of the reading is supported, not proven.
- Frame 9's ratio corresponds to a fader alpha of about 74/128. That fits `OnMenuStart`'s 1.5 s at about 0.6 s, and it
  also fits the 0.5 s ramp at about 0.2 s, so the duration is not settled.

**Owed.** A >= 10 fps PCSX2 capture from READY through the loading screen into the round (any map). The fade-in
duration is then the frame count from the first non-black frame to ratio 1.

### 5.5 LOADING_SCREEN_WAIT_PLACEHOLDER -- NOT-A-GAP

A browser adaptation (research 125 §7).

---

## 6. The boot and the loader screens

### 6.1 HDD_ABSENT_STATUS_READING (`$PORT/packages/ui/src/boot/bootBindings.ts:78-85`) -- RESOLVED, STRONG

**Prior search.** "`DAT_0049e2dc`'s writer not read: 1 is the reading."

**What I read.**
- The writers of `DAT_0049e2dc`:
  - `FUN_0034f960` (D:L249477-249486) sets it to -1. It is called from the game's main `FUN_001e7040` at D:L47865
    (and again at D:L329616).
  - `FUN_0034f1e0` sets -1 on an unmount.
  - `FUN_0034f230` (D:L249268-249315) sets it to `FUN_001aa498(0x3f7ff8 "hdd0:", 0x4807, ...)`. `FUN_001aa498` is
    **`sceDevctl`** (names csv, relinked-body), so this is the HDD status devctl.
- `FUN_0034f230` runs only when `DAT_003e01b4 != 1` (the ELF holds 0) and the value is still -1. It first load-starts
  `RUN\IRX\HDD\ATAD.IRX`, `HDD.IRX` and `PFS.IRX` (the table at 0x3e0250, read from the ELF). If any module answers
  1 = did not stay resident, it skips the devctl and the value stays -1.
- `FUN_0039d050` (D:L293426-293507) answers 1 whenever `DAT_0049e2dc != 0`. It answers 0 or 2 only when the devctl
  returned 0: 0 on a successful mount, 2 on a failed one.

**Answer.** With no usable HDD the status is **1**, whichever branch is taken: the modules not resident (-1), or
the devctl non-zero. Status 2 needs a working HDD whose partition fails to mount. `HardDriveOperation` then writes
`hard_disk_error_code` = 1 (D:L123596-123621).

The one interpretive step: that `sceDevctl(HDIOC_STATUS)` is non-zero without an HDD, or that `ATAD.IRX` does not stay
resident. Either path gives 1.

**Suggestion.** Rename to `HDD_ABSENT_STATUS = 1`, a read, citing D:L293438/293497 and D:L249280-249314. No value
change.

### 6.2 BOOT_HARDWARE_STUB_PLACEHOLDER -- PARTIAL, STRONG

Its HDD half is now sourced (above). The pad-connected and NTSC answers are the scenario of a stock US console. BOOT-09
owns the branches.

### 6.3 BOOT_CARD_STUB_PLACEHOLDER, LOAD_CONFIG_VALVES_PLACEHOLDER -- NOT-A-GAP

These stand for unbuilt features (BOOT-05, OPT-02). Each row's original behaviour is already cited in research 139 §3;
nothing is unsourced.

### 6.4 VSYNC_HZ_READING (`boot/loaderScreens.ts:92-98`) -- RESOLVED, STRONG

The game sets its own line rate by video mode in `FUN_003b14a0` (D:L305345-305386; the frame end calls it on a mode
change, D:L304752-304753):

| mode | lines | H-blank rate (float) |
|---|---|---|
| NTSC, mode 0 | 448 | 0x4675d900 = **15734.25 /s** |
| PAL, mode 1 | 512 | 15550 /s |
| DTV, mode 2 | - | 31468.5 /s |

dt is the timer-0 H-blank count times `1/rate` (D:L249327-249333, D:L304757-304764).

15734.25 / 262.5 lines a field = 59.94006 Hz = 60000/1001 to 1 ppm. The 262.5 lines a field is the NTSC standard, the
one step not in the corpus. Combined with `SMODE2` 1 (SCUS L44088) and `SYSTEM.CNF VMODE = NTSC`, that gives two
independent lines.

**Suggestion.** Cite D:L305383 in the doc. No value change.

### 6.5 PMODE_ALP_SCALE_READING -- PARTIAL, BELIEVED

No GS manual is in the corpus. The ps2recomp GS backend (`research/ps2recomp/ps2xRuntime/src/lib/gs/gs_cpu_backend.cpp`
L449-453, L1866) blends `dst + (src - dst) * ALP / 255` in MMOD 1. That is an independent emulator implementation and
agrees with the reading, but it is a lead, not the original.

The difference between /255 and /256 is at most 1/256 of a channel, below what any capture here resolves. Treat it as
immaterial.

### 6.6 CIRCUIT_MERGE_READING -- PARTIAL, BELIEVED

No new lever. The captures' scores (research 130 §4) still decide it.

### 6.7 LOADER_START_PLACEHOLDER, RAW_UPLOAD_PLACEHOLDER, PULOADGP_HOLD_PLACEHOLDER, LOADING_HOLD_PLACEHOLDER -- UNRESOLVED

**Searched.**
- The PCSX2 runs' manifests (`logs/parity/runs/pcsx2_mission_a..g`, `pcsx2_title1`, `transition_pcsx2`). Their `t` is
  measured from the emulator's start, BIOS included, and the first shot (s00 = LOADING at t = 8.4 s, waited 5.2 s) is
  taken when the frame is stable. No sub-second boot series exists.
- `logs/s13_31_boot_shots/` is the recompiled game's 0.5 s series, which is not the console.

**Owed evidence** (BOOT-01, H19). A PCSX2 run with the CDVD at real speed ("fast CDVD" off), capturing every frame, or
at >= 10 Hz with frame indices, from the disc's ELF start. Read off it:
- the black before the panel;
- the panel's first non-black frame and its full-ALP frame;
- the panel's hold;
- the LOADING logo's first frame and its hold until the Sony card.

Optionally, a PCSX2 trace of the `sceSifLoadModule` calls timestamps the IRX loads.

---

## 7. Routes, commands, valves

### 7.1 UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER (`$PORT/packages/ui/src/uiCommands.ts:427-433`) -- PARTIAL, PROVEN

The four rows marked `unknown` are short bodies the decompiler folded. Read from the disassembly:

| row | body | answer |
|---|---|---|
| 46 `MediusEnabled` (0x27aff0) | `lbu v0, 0x45a1c8` | its only writer, the boot `FUN_001eabd0` (D:L49986, called first by main), sets 1: **1** |
| 100 `IsNetwork` (0x27e6d0) | `lbu v0, 0x45a0c1` | the network-game flag, cleared at D:L328773: **0 offline** |
| 147 `CheckTeamStatus` (0x2772c0) | 0 when the word at 0x437ce8 (the game object) is 0; else 1 when the byte 0x45a0c0 or the word 0x441470 is non-zero | **0 in the front end** |
| 131 `SysLoadIRX` | `FUN_00277300` (D:L122828-122841) copies its argument and answers 1 | already 1 |

The other 79 rows of the 83 still need their bodies (each owning task).

**Suggestion.** Give rows 46, 100 and 147 bodies now: `MediusEnabled` 1; `IsNetwork` = the page's online flag (0 until
the online lane sets it); `CheckTeamStatus` = 0 while no game exists. Tests: an offline front-end call of `IsNetwork`
answers 0 and of `CheckTeamStatus` answers 0.

**Where it matters.** The port now answers 1 for `IsNetwork`, which would take online branches in the scripts offline.
It is worth checking which disc scripts call it: grep `IsNetwork` in the typed dumps.

### 7.2 ROUTE_SESSION_PLACEHOLDER, SCREEN_BUTTONS_STEP_READING -- NOT-A-GAP

These are browser design and a test-only path.

### 7.3 VALVE_POOL_READING, UIVAR_ELEMENT_EQUAL_READING, MENU_EVENT_RECORDS_READING, R114's EXIT_* rows -- UNRESOLVED (not attempted)

Listed in the ledger for completeness. These are note-only gaps without a constant. No new lever was applied this pass.

### 7.4 Owned elsewhere, named here

`EE_FPU_ROUNDING_READING` (C6): the `dptofp` finding is supporting evidence that the soft-float path also truncates.
`INPUT_STRING_NULL_READING` and `ONL_02_RETURN_FOCUS_READING` belong to the screens cluster. `MENU_KEYS_READING` is the
owner's.

---

## 8. Sourced but not implemented (multiplayer-relevant)

1. **`IsNetwork`, `CheckTeamStatus` and `MediusEnabled` bodies** (§7). The online flow's scripts branch on them. The
   port answers 1 for all three; `IsNetwork` must follow the network-game flag (byte 0x45a0c1).
2. **The lobby's stick and pad pipeline** (§1). The online menus (lobby, rooms, briefing room) take the same
   processed stick: dead zone 0.3, rescale, the sqrt(2) radial step.
3. **`dlgLANBriefingRoom` GAMELIST `ONSCROLL`** fires only on a DOWN pressure of exactly 129 (a pressure pad); it never
   fires in the browser.
4. **Chat and name typing.**
   - A name made only of Š, Ÿ and spaces is blank in the original (§4).
   - The wrap counts trailing spaces, which changes when a chat line or name is refused (§4).
   - The USB repeat is set to (20, 6).
   - The TEAM/ALL indicator has no state-0 texture on the disc, so only ALL (state 1) shows a bitmap.
5. **`dlgMPBriefingRoom` GAMELIST carries a stray token** (`"OnPlayerListReturn"` between `XSIZE` and `YSIZE`). Any
   pairwise `.rdr` reader in the port (not `RdrLookup`) would misread that list; worth a disc test.

## 9. Leads for other workstreams

- **C2 (movement / camera), the right stick's look curve.** PCSX2's pad record holds stick 1's config at +0x2ac:

  | field | value |
  |---|---|
  | dead zone | 0.3 |
  | curve multiplier | 0.65 |
  | exponent | **3.0** |
  | rescale | on |
  | radial | on |
  | smoothing | **on** (+0x2ca = 1), factor 0.75 at +0x2cc |
  | curve | **on** for both axes (+0x2d0 = +0x2d1 = 1) |

  - The curve is `|0.65 · v · v^(n-1)|` with its sign kept, n = (int)3.0 (D:L179636-179742).
  - The smoothing (D:L179744-179799) depends on dt (`param_1`).
  - These are exactly `FUN_002da6c0`'s preset 0 (D:L179394-179403), chosen by the valve `stick_preset` (0x3ef000) at
    D:L125077-125078 and D:L125202-125203, with the UI vars `STICK_SENSITIVITY`, `STICK_INERTIA` and
    `STICK_DEADZONE`. Presets 1 and 2 are at D:L179404-179417.
  - The sensitivity's UI mapping is `FUN_002da800` (D:L179443-179457).

  Data: `scratch/C5b/padrec.out`.
- **C6 / everyone: rounding.** Every `(float)double` in the game code goes through `dptofp`, which **chops**
  (`dptofp_unicorn.py`). Any tuning constant the decomp shows as a double expression converted to float should be
  chopped, not rounded.
- **C9 / the archive package.** A typed `parseRdr` (`scratch/C5b/dumprdr.ts`) retires `TOKEN_TYPE_READING`,
  `SKB_CELL_TOKEN_READING` and research 117's `UIVAR_SPEC_TOKEN_READING` at once.
- **C6 (compositor).** A null texture handle clears the image's +0x14 bit 0 (`FUN_003646d0`), which bears on
  `UNHELD_BITMAP` and on the `SkbRecipState0` case.
- **C7 (audio).** `SKB_CLOSE_SOUND_READING` is untouched here.
- **Captures already on disk that answer UI questions.** `logs/parity/s4_pcsx2/` (867 PCSX2 frames: login, persona,
  name keyboard `A_37`, EULA, lobby, briefing room `A_48` and `B_42`, create game, playlist, game lobby) and
  `logs/parity/{title,postload,spawn}_pcsx2.rdram` (the full pad record, the asset list 0x45c3c0, the valves). Any
  RDRAM field question about the front end's statics can be read from them before a new run is ordered.

## 10. Verification (V4, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V4-verify-ui-audio-card.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V4/`). V4 verified C4, C5a, C5b, C6, C7, C8 and C9 (34 claims sampled). What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table). V4's tally over its 34 sampled claims: CONFIRMED 29, CONFIRMED-WITH-CORRECTION 5, WRONG 0, UNVERIFIABLE 0.

Verifier V4, research wave 2026-10-04. Read-only. Scripts and their saved outputs are in `scratch/V4/` (README there).
`D:L<n>` is a line of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). `$PORT` is the
`agent/online` snapshot named in the brief. No decompiled text is quoted.

**Method.** I sampled 34 claims, at least 4 from each report. I took every must-include claim, then the "the port is
wrong" claims and the PROVEN/STRONG rows an implementer would act on. Where I could, I re-derived each one by a
different route from the author's:
- I disassembled the ELF myself instead of trusting the decompiler.
- I read `.data` vtables to fix slot meanings.
- I scanned raw disc bytes instead of using the author's parser.
- I read the cells in the PCSX2 dumps.
- I re-ran the C5b unicorn script and decoded C8's netcnf files with my own key build.

I then checked each claim against `$PORT` to confirm that the port does what the report says.

**Result.** No claim in the sample is wrong. 29 are confirmed as written. 5 are confirmed with a correction:
- In two of them the stated value or answer is right but the reasoning or wording is not. For `CheckTeamStatus`
  (C5b) this matters for the implementation.
- In the other three a detail needs adding.

### 10.1 Verdicts

| # | claim | report | verdict | one-line reason |
|---|---|---|---|---|
| 12 | `atofF32` must chop: 0.15 -> 0x3e199999 | C5b | CONFIRMED | `SuspendMenuInput` = atof -> `jal 0x1a12d8`; the pack at 0x1a0624/0x1a0638 is `srl 7` with no round add; unicorn re-run reproduces |
| 13 | `IsNetwork` answers 0 offline (the port gives 1) | C5b | CONFIRMED | 0x27e6d0 = `lbu 0x45a0c1`; 0 in all 5 menu dumps; the port's placeholder answers true |
| 14 | `CheckTeamStatus` answers 0 offline, "0 while no game exists" | C5b | CONFIRMED-WITH-CORRECTION | the answer 0 is right, the reason is wrong: 0x437ce8 is **non-zero** (0x869360) in every menu dump; the 0 comes from 0x45a0c0 = 0 and 0x441470 = 0 |
| 15 | `MediusEnabled` answers 1 | C5b | CONFIRMED | 0x27aff0 = `lbu 0x45a1c8`; the boot store at 0x1eac08; 1 in the dumps; the zero at 0x402874 is the static initializer, which runs first |
| 16 | Š (U+0160) and Ÿ (U+0178) count as blank in the soft keyboard | C5b | CONFIRMED | `andi 0xffff; lb 0x1d08d1(c); andi 8` at 0x39975c; bytes 0x1d / 0x0a, the same in title_pcsx2.rdram |
| 17 | `MENU_TICK_RATE` = 30 Hz (`DAT_003e1400` = 30) | C5b | CONFIRMED-WITH-CORRECTION | the cap word is 30, but the frame is 2 fields: 525 HBLANKs, dt 0.033367 s, 29.97 Hz in all three PCSX2 dumps (C6's figure); "30 Hz" is nominal |

### 10.2 Claim 12: `atofF32` truncates -- CONFIRMED

- `FUN_00277220` (`SuspendMenuInput`) is `jal 0x191478` (atof), then `jal 0x1a12d8` (dptofp), then `jal 0x1f3bb0`.
- I disassembled the pack routine 0x1a05d8 myself: the fraction is `srl $a1,$a1,7` (0x1a0624 delay slot and 0x1a0638)
  with no rounding add before the mask.
- Re-running `scratch/C5b/dptofp_unicorn.py` reproduces 0x3e199999 for 0.15, plus 0x3dcccccc and the others.
- The port's `menuInput.ts:65-74` rounds to nearest. The fix and the test (`atofF32('0.15') === 0.14999999105930328`)
  stand.

### 10.3 Claims 13, 15: `IsNetwork`, `MediusEnabled` -- CONFIRMED

- 0x27e6d0 is `lui 0x46; jr ra; lbu v0,-0x5f3f(at)`, which reads byte 0x45a0c1. 0x27aff0 reads byte 0x45a1c8.
- In all five menu dumps: 0x45a0c1 = 0 and 0x45a1c8 = 1.
- **Port.** `uiCommands.ts:427-433` answers `true` (1) for every unknown row, so `IsNetwork` is wrong offline.

### 10.4 Claim 14: `CheckTeamStatus` -- CONFIRMED-WITH-CORRECTION

- The body at 0x2772c0-0x2772fc reads exactly as C5b says: word 0x437ce8 == 0 -> 0; else byte 0x45a0c0 or word
  0x441470 non-zero -> 1; else 0.
- **But** 0x437ce8 = 0x869360 (non-zero) in menu, menu2, menu3, menu4 and menuC. The front-end answer of 0 comes from
  0x45a0c0 = 0 and 0x441470 = 0, not from "no game object".
- C5b's suggestion "`CheckTeamStatus` = 0 while no game exists" would return the right value for the wrong reason, and
  would go wrong once a game object exists and neither team cell is set.
- **Implement the predicate:** `gameObject && (teamByte || word441470)`, with the game object counted as present in
  the front end. The test "offline front end answers 0" still holds.

### 10.5 Claim 16: Š and Ÿ are blank -- CONFIRMED

- 0x39975c-0x399770: `andi v1,v0,0xffff; lui/addiu 0x1d08d0; addu; lb v0,1(v0); andi v0,v0,8`. The index is
  `c & 0xffff`, unsigned.
- `v_skb_blank.py`: byte 0x1d08d1+0x160 = 0x1d and +0x178 = 0x0a, both with bit 8 set. U+20AC and U+201E read 0.
- The same bytes appear in title_pcsx2.rdram, so nothing overwrites that range at run time.
- Side note: Ž (U+017D) is blank too, but it is not an integer cell on the US grid.
- I also listed the grid's raw non-ASCII string cells (`v_skb_grid_bytes.out`). If those Latin-1 bytes are stored as
  UTF-8 of their code point (research 119 §6, the port's model), they decode below 256 and are not blank, so C5b's set
  `{0x09-0x0d, 0x20, 0x160, 0x178}` stands. If the engine instead inserted the raw byte, leads 0xC0-0xDF would decode
  to other code points; I did not trace the insert, and C5b did not either.

### 10.6 Claim 17: `MENU_TICK_RATE_READING` -- CONFIRMED-WITH-CORRECTION

- `DAT_003e1400` = `DAT_003e13f8` = 30 in the ELF, as C5b says, and the cap loop is at D:L304747.
- The rate is not 30 Hz. I read title_pcsx2, postload_pcsx2 and spawn_pcsx2: the last frame's RCNT0 count is 525 HBLANKs,
  dt 0.033367 s, i.e. 29.97 Hz (two NTSC fields).
- C6's `UI_TICK_RATE` 2997/100 is the right one. `menuInput.ts`'s 30 should become the same constant, as C6 says.

### 10.7 What an implementer should take from this (the verifier's list, for all seven reports)

- Every sampled "the port is wrong" claim held. The changes the reports propose for the camera, popup focus, `atofF32`,
  `IsNetwork`, the alpha-0 depth write, the cursor colour, UIVAR typing, movie gain, fade stepping, the default range,
  register-2 flooring, netcnf `nic`, the persona key, MC handles, the zoom fog and the zoom LOD can be acted on.
- Two of those need the adjustments above:
  - `CheckTeamStatus`: implement the predicate `w437ce8 && (b45a0c0 || w441470)`, not "no game exists".
  - The cursor: grey means 128/255 on an untextured quad.
- Three small ones:
  - The menu tick is 29.97 Hz.
  - Reuse `SOUND_DEFAULT_RANGE`.
  - Use 457.0074, the game's float, as the focal.
