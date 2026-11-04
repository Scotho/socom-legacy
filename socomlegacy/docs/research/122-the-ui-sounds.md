# 122 -- The UI sounds: how a menu names a sound, how the name finds a bank and an index, the 989snd call, the widgets' own cues and the names that stay silent (web sprint 9, READ-PLAT-23)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`, PLAT-23's row; the
task's block is `../roadmap/01-platform.md` "PLAT-23"). The reading PLAT-23's implementer transcribes. Read-only
research. Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` =
its line; every `FUN_` address retail), the retail ELF on the disc (`game/disc/socom2_game.elf`, read by address with
`tools/elfImage.ts`: the binding table, short strings, vtables and their typeinfo names), the disc's
`RUN/SOUNDRDR.ZAR` (`sounds.rdr`), `RUN/SOUNDS/BNKSTORE.ZAR` (`HUDUI.bnk`), `RUN/UI/READERC.ZAR` / `READERX.ZAR` and the
three zAnim archives, read with the repository's readers (`@s2u/archive` `Zar`/`parseRdr`, `@s2u/scene`
`parseAnimSets`/`decodeUiProgram`, `@s2u/sound` `parseBankFile`/`soundHash`) by probes outside the tree (names, indexes
and counts only), the 989snd reference `C:/Projects/socom_pc/research/989snd-ziemas` (`common/common.h` command numbers,
`iop/blocksnd.c` the volume and pan rules), and the recomp's 989snd play logs under `C:/Projects/socom_pc/logs` (§9).
It builds on web research 81 (the banks, the CRC-32 lookup, the zAnim `SOUND` command, the 3D play), 95 §3.9 and §5.1
(the ARMORY's sounds, the menu init) and 96 (the binding table, the sets); it does not restate them.

**Overridden in part (research 206 §1):** the archived boots play two `.METAL` popups before the intro movie (R122.12, `BOOT_POPUP_METAL_READING`) -- they never fire on a normal boot; the boot popups come from the card check (R2-AV, research 205 §2.9).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R122.1 | **A name finds its sound through `sounds.rdr`, not through the bank's name table.** `FUN_00344f30` (D:L243197-243210) takes the CRC-32 of the name's bytes as they stand (`FUN_003a2370` D:L296364-296387: `strlen` bytes, case kept, the sigil and any trailing whitespace included) and binary-searches one sorted vector of sound objects at **0x48dc08** (begin pointer 0x48dc10, count 0x48dc0c; `FUN_00344ee0` D:L243163-243175 -> `FUN_00344bf0` D:L243027-243122), keyed unsigned by the hash at object +0x18. The vector holds one object per `sounds.rdr` `SETS` entry of every block loaded so far (and one per `GROUPS` group, R122.3); a name no loaded entry carries returns null, and every caller tests for null and plays nothing. Above all of it a byte, **`DAT_0048dd28`**, silences the whole system: the lookup, the block load, the object fill, the plays and the group load each do nothing while it is non-zero (§2, `SOUND_OFF_SWITCH_READING`) | `FUN_00344f30`, 0x48dc08 | §2 |
| R122.2 | **The bank and the index are the block's, by position.** `FUN_00344090` (D:L242656-242758) loads the bank of the block's name (`FUN_00343dd0` D:L242557-242616: `RUN\SOUNDS\<name>.BNK`, from `BNKSTORE.ZAR` by location on the disc) and appends a 0x18-byte record (name, handle +0x10, status +0x14: 1 loaded, -1 not) to the bank vector 0x48dbe8; then `FUN_003435c0` (D:L242313-242552) makes an object per entry of `SETS/<block>`: **+0x10 the bank slot** (the counter 0x48db40, one per call, kept in step with the record), **+0x12 the entry's ordinal in the block**, +0x18 the hash, +4 `VOLUME` (default 1.0), +0xc/+0xe `RANGE` (default **160/430**, `FUN_00345620` D:L243424-243425), flags (`ONESHOT` +0x1c bit 2, `ST` streamed bit 0, `AMBIENT`, `DOPPLER`, `LOOP`, `HS`, `HQ`, `VQ`, `PRIORITY`, the `TYPE_*`/`MUS` class). For `HUDUI` the ordinal **equals the bank's own index for all 24 sounds** (checked on the disc: `sounds.rdr` HUDUI entry n hashes to `HUDUI.bnk` name n) | `FUN_00344090`, `FUN_003435c0` | §2 |
| R122.3 | **"UI" is not a bank.** The menu init's `FUN_003448e0("UI")` (D:L54853, D:L242929-242936) is `FUN_00348130` (D:L244929-244986): it reads `sounds.rdr`'s **`GROUPS/UI`**, two weighted groups -- `SND_HS_OPDV` (12 entries `SND_HST_01..12`) and `SND_VO_OPDV` (12 entries `SND_VOT_01..12`), all `UIVOICE` `ST` entries (the 12 `SND_HST_*` also `HS`: the headset route, R122.4) -- the audio options' headset and voice test lines (`dlgOptions_Audio.rdr`). So `UI_BANK_PLACEHOLDER`'s premise ("bank UI, not on the disc", research 95 §5.1) is wrong: there is no UI bank to miss, and the menus' bank is `HUDUI` by the source | `FUN_00348130` | §5 |
| R122.4 | **The play, down to 989snd** (the object's vtable 0x406ac0): unplaced `+0xc` (`FUN_00343550`, volume 1.0) or `+0x10` -> `+0x18` (`FUN_00343140` D:L242175-242252); placed `+0x14` (`FUN_00342b20` D:L242044-242170, research 81 §3's arithmetic); `+0x1c` (`FUN_00342aa0` D:L242023-242035) forces the one-shot bit for the call. The guard: the slot is below the bank count and its status is 1, or the entry is `ST`. Then **a `ONESHOT` entry is 989snd `SL_PLAYSOUND_A` (18)** (`FUN_003403b0` D:L240670-240689) and anything else `SL_PLAYSOUND` (17) with a handle (`FUN_00340360` D:L240646-240665, callback 0x346300); an `ST` entry streams (`FUN_00342240`) -- **except an `HS` entry** (`ST`'s sub-key `HS`, ELF 0x3f77a8, object +0x1c bit 3): while `DAT_0045a0c1` is 0 it is handed to `FUN_0034b6c0` (volume x 1024) instead of any 989snd call or stream (the test at D:L242112-242115 placed, D:L242200-242203 unplaced; what runs before it, §3), which queues it only when the queue object's byte +0xb is set, the entry is `TYPE_DEATH_DAMAGE` or it carries `ST`'s `PD` -- none of which the data gives these entries; on the front end's table that is exactly the 12 `SND_HST_01..12`, the options' headset test (`HEADSET_ROUTE_READING`, §3). The six words: **bank** = the slot's handle, **sound** = object +0x12, **vol** = `1024 x volume x VOLUME x DAT_003e0070` (1.0), **pan** = the caller's (**-1 unplaced: 989snd takes the sound's own `Pan`**, `blocksnd.c` 97-99, 135-137), **pitch_mod** = the caller's (0, or the zAnim's +0xe under flag 0x40), **bend** 0. The **group** is not an argument: it is the bank sound's `VolGroup` -- **14** for the 19 menu sounds, **2** for the five countdowns | vtable 0x406ac0 | §3 |
| R122.5 | **Four routes name a UI sound**: a zAnim `SOUND` command (research 81 §6; resolved lazily per animation by `FUN_0026e7c0` D:L117651-117695); `uisounds.rdr`'s three names (`TELETYPE` .TYPE, `BACK` .BACK, `SELECTION` .METAL) read by the menu init (D:L54857-54880; again by the IOP-reset handler `FUN_001f53d0` D:L55187-55216); `UiParams.rdr` `CommonSoftKeyboardProps`'s six (`FUN_00397070` D:L289706-289795, resolved by `FUN_00397bc0` D:L290055-290094); and two code literals the front end reaches (`.METAL` in `PopUpDialog`, `SND_NEG`) | §1 | §1 |
| R122.6 | **The binding table's sound commands** (0x3dd4d0, `readBindingTable`): row 126 `StopAllSounds` (id 127, `FUN_00277930` -> `FUN_00346c00` -> 989snd `SL_STOPALLSOUNDS` 24, no argument; 81 calls in the sets); row 127 `FadeAllSounds` (id 128, `FUN_00277910` -> `FUN_00346c30`: every **handle-tracked** voice -- not the one-shots -- to volume 0 over 360 ticks, 1.5 s, by `SL_AUTOVOL_A` 34; 10 calls); row 134 `VagStreaming` (id 135, `FUN_0027a5e0`, argument `ON`/`OFF`: starts or stops the stream system; 13 ON, 94 OFF). Three commands play a UI sound as a side effect: row 12 `SwitchMenu` with `PREVIOUS_SCREEN` plays **`BACK`** (16 calls); row 15 `ActivateButton` plays **`SELECTION`** when the named control is found (242 calls); row 13 `PopUpDialog` plays **`.METAL`** when the screen has a `POPUP` (252 calls). No row plays a sound by name | §4 | §4 |
| R122.7 | **The widgets' implicit sounds** (by class, the vtables' typeinfo names): the screen's default focus move (UP/DOWN or the stick, when nothing bound the key) plays `SELECTION` when the focus index changed; `CUIListBox` UP/DOWN (repeat after 0.4 s held) plays `SELECTION` when the row moved; `CRadioStrip` LEFT/RIGHT/CROSS (wrapping) and `CSliderBar` LEFT/RIGHT (every step and every held frame past 0.4 s, at the ends too) and `CPopUpDialog` CROSS/TRIANGLE/LEFT/RIGHT play `SELECTION`; `CTeleType`, `C2DCounter` and `CListItemTimedTextTypeImpl` play `TELETYPE`; the soft keyboard plays its six. **A button's CROSS, a cancel and an error play nothing of their own**: those are the scripts' (`.DINK`, `.NEG`, `SwitchMenu PREVIOUS_SCREEN`) | §6 | §6 |
| R122.8 | **The front end's table** (the menu init `FUN_001f4860` D:L54850-54853): blocks `HUDUI` (24, the one bank on the disc), `SMUS` (212, all `ST`: music) and `UIVOICE` (91, all `ST`: briefing and options voice), groups `GROUPS/UI` (2): **329 objects**. `TCM_ECHO` has no block in `sounds.rdr` and no bank, so it adds nothing: **`.TCM_SLIDE` and `.TCM_SELECT` resolve in HUDUI (12, 13)**, and `.METAL` is HUDUI 8 -- the roadmap's first unknown answered | §5 | §5 |
| R122.9 | **The dev disc's names** (§7): the three zAnim archives' 399 `SOUND` commands name **89 distinct sounds**: **81 resolve** in the front end's table (9 HUDUI one-shots, 17 SMUS music streams, 53 UIVOICE voice streams, the 2 UI groups -- an object each, their member `UI_GROUP_PICK_READING`), **3 are silent** (`" "` 24 commands, `SND_DINK` 15, `^M73_113` 1), **5 not placed** (`SP_COMMON`'s grade groups in `dlgExitState`: `EXIT_STATE_GROUPS_READING`). The dialog files add 5 more names (.TYPE, .BACK, .SKB_TYPE, .SKB_NAV resolve; `".SLIDE\t"` is silent): **94 distinct, 85 resolve, 4 silent, 5 not placed** | §7 | §7 |
| R122.10 | **Silence to reproduce** (§8): `SND_DINK` (no sigil), `" "`, `".SLIDE\t"` (the keyboard's `ScaleDownSound`, a trailing tab: the keyboard's scale-down is silent), `SND_NEG` (the code's refusal cue, `DAT_0048dd90`: no entry; outside the menus), `^M73_113` (no new-play flag), `SELECTION`'s fallback `""` (hash 0). Each is a lookup that returns null, never a substitute | §8 | §8 |
| R122.11 | **Every UI play the recomp logged is unplaced and a one-shot** (§9): 202,807 HUDUI plays in the 454 `C:/Projects/socom_pc/logs/run_*.log` that carry one, and 183,014 more in 345 of the gate's 346 `*.game.log` (counted 2026-10-02), all 989snd 0x12 on the HUDUI handle with pan -1; volumes 0x400, 0x4cc (1.2), 0x333 (0.8), 0x2cc (0.7) -- the `SOUND` commands' own. So the menus' flag-2 (`0x82`) commands play unplaced (`UI_SOUND_PLACE_READING`) | §9 | §9 |
| R122.12 | **The "87 boot one-shots" are the menus' own cues.** The archived boots play two `.METAL` before the intro movie (the two `POPUPDIALOG`s of `dlgIntroScreen`'s `do_onstart`: `BOOT_POPUP_METAL_READING`) and, on the main menu, `ActivateMenuBtns`'s slide-in: .TCM_SLIDE 1.2, .METAL 0.8, `ActivateButton`'s .METAL 1.0, .METAL 0.7, .TCM_SLIDE 0.7, .METAL 0.7 -- exactly the recomp log's order. The owner's "0 on the main menu" came from a log bucketed by line number, which the PC project retracted (PC KNOWN, the stray-sound row: settled 2026-09-22, the `blop_a/b/c` runs) | §9 | §9 |
| R122.13 | **The ARMORY precedent** (`viewer/src/armory.ts:37-39`) plays the right samples from the right bank, but its label is wrong (R122.3) and it misses three cues the source plays: `ActivateButton`'s `.METAL` (8 calls in `dlg_equipment_mp.rdr`: `EquipMpSealBtn`, `EquipMpTerrBtn`, `EquipWeaponBtn` x5, `EquipMPDoneBtn`), `PopUpDialog`'s `.METAL` (the confirm popup), and the popup's own `SELECTION` on its keys -- research 95 §3.9's "none: ... the confirm popup" is contradicted | §10 | §10 |

**The proven level** is PLAT-36's (the 989snd play log against the browser's, per screen action). Everything here is
the reading level: the decompilation and the disc, with the recomp's logs as the cross-check §9 names.

## 1. The four routes a UI sound is named by

1. **A zAnim `SOUND` command** (set 0 command 30, `FUN_002659c0` D:L112319-112500; research 81 §6 has the layout). The
   name is the animation set's name-table string at the command's u16 +6. The animation keeps one 16-byte slot per name
   it has played (`FUN_0026e7c0` D:L117651-117695): the first play of a name resolves it with `FUN_00344f30` and keeps
   the object (+8) and the voice handle (+0xc); a slot whose object is null makes the command a no-op. Only flag 0x80
   starts a voice; without it the command retunes the voice already playing (research 81 §6). Flags 0x400/0x800 hand the
   sound to the priority slot `FUN_00348dc0` (research 81 §6, `SOUND_PRIORITY_SLOT_READING`): no UI set uses them.
2. **`uisounds.rdr`** (`RUN/UI/READERC.ZAR`, read from `data/common/dialog`): `SOUNDS (TELETYPE (.TYPE) BACK (.BACK)
   SELECTION (.METAL))`. The menu init reads it twice (D:L54829-54848 before the sound blocks, D:L54857-54880 after):
   `TELETYPE` and `BACK` are kept as **names** in the menu-state object 0x408538 (+0x14, +0x20, a short-string at
   0x40854c and 0x408558) and resolved at each use; `SELECTION` is resolved once into **`DAT_00408564`** (an absent key
   resolves `""`, R122.10). The IOP-reset handler `FUN_001f53d0` (D:L55187-55216) reloads the blocks and re-reads all
   three. The teletype's object is `DAT_0049ea88`, re-resolved from the `TELETYPE` name by `FUN_00369880`
   (D:L264497-264508) and `FUN_00367950` (D:L263765-263769).
3. **`UiParams.rdr` `CommonSoftKeyboardProps`** (`RUN/UI/READERC.ZAR`, `data/common`; `FUN_003943e0` D:L288235-288243
   -> `FUN_00397070`): `ScaleUpSound` .SLIDE, `ScaleDownSound` `".SLIDE\t"`, `KeyPressSound` .SKB_TYPE,
   `KeyPressEnterSound` .THUNK, `NavigationSound` .SKB_NAV, `NegativeSound` .NEG, resolved by `FUN_00397bc0` into
   `DAT_004a1110`, `DAT_004a1108`, `DAT_004a10f0`, `DAT_004a10e8`, `DAT_004a10f8`, `DAT_004a1100`.
4. **Code literals**: `.METAL` (ELF 0x3ef3c0) in `PopUpDialog` (§4); `SND_NEG` (0x3f7858) resolved into `DAT_0048dd90`
   after every block load (D:L242747) and played by `FUN_003419c0` (D:L241460-241467) from seven sites outside the
   menu classes read here (`FUN_0021bda0`, `FUN_0021c6f0`, `FUN_00594cf0`); five more `.TCM_SELECT`/`.TCM_SLIDE`
   resolutions (`FUN_00202520`, `FUN_0020b2c0`, `FUN_0021cd40`, `FUN_00227ad0`, `FUN_00232970`, the strings
   0x3e3d48-0x3e5dc0) sit in game-state code that was not traced -- the in-game command menus, by their names.

## 2. The lookup: `sounds.rdr`, the sorted table, the bank slot

- **The script.** `RUN/SOUNDRDR.ZAR/sounds.rdr` (research 81 §3): `SETS` holds 128 blocks, `GROUPS` 11. A `SETS` entry's
  first word is its hash (an integer; a string would be hashed at load, D:L242364-242373 -- none of the front end's
  329 is). The front end's blocks: `HUDUI` 24 entries, all `ONESHOT` (`.BOMB_BEEP` alone has a `RANGE`, 50-100); `SMUS`
  212, all `ST` (203 `MUS`, 12 `LOOP`; `N1` the VAG name); `UIVOICE` 91, all `ST`. `GROUPS`: `SP_COMMON`, `MP_COMMON`,
  seven casts, `HOSTAGE`, `UI`.
- **The load** (`FUN_00344090(parent, block)`, D:L242656-242758): load the bank `block` (`FUN_00343dd0`), take
  `SETS`, look the parent's upper-cased name up under it (the menu passes `"sounds.rdr"`, which `SETS` does not hold, so
  the lookup falls back to `SETS` itself), then the block's upper-cased name; for each entry a 0x3c-byte object
  (`FUN_00345620` defaults, D:L243413-243449), filled (`FUN_003435c0`) and inserted in hash order (`FUN_00343f90`
  D:L242621-242651). A block `sounds.rdr` lacks adds nothing and still advances the slot counter; a bank the disc lacks
  leaves its record at status -1, so its non-`ST` entries exist but refuse to play (§3).
- **The table** holds pointers; the search compares the 32-bit hash unsigned; equal hashes in two loaded blocks are not
  told apart (none collide in the front end's 329).
- **The name is hashed as spelt**: the sigil is part of it (`.DINK` and `SND_DINK` are different names), so is case and
  whitespace. No fallback, no sigil stripping, no second table.
- **The off switch `DAT_0048dd28`.** Every function of this chain tests the byte first and does nothing while it is
  non-zero: the lookup `FUN_00344f30` (D:L243204: returns null), the block load `FUN_00344090` (D:L242672), the object
  fill `FUN_003435c0` (D:L242331), the plays `FUN_00342b20` (D:L242062) and `FUN_00343140` (D:L242184) and the group load
  `FUN_003448e0` (D:L242932) -- 92 tests in all, D:L241619-245173. No assignment to it is in the decompilation by name,
  so what sets it, and whether it is ever set on a retail run, is `SOUND_OFF_SWITCH_READING`; a port that models only
  "a null lookup plays nothing" does not have this whole-system silence. The recomp's logs (§9) play sounds, so it was 0
  there.

## 3. The play, argument by argument

| caller | path | 989snd call | bank | sound | vol | pan | pitch_mod | bend |
|---|---|---|---|---|---|---|---|---|
| zAnim `SOUND` 0x80, no place | `+0x18` `FUN_00343140` (D:L112473) | 18 if `ONESHOT`, else 17 with a handle | slot's handle | +0x12 | `1024 x cmd volume x VOLUME` | -1, or the u16 +0xc under flag 0x20 | the s16 +0xe under 0x40, else 0 | 0 |
| zAnim `SOUND` 0x82, a node that resolves | `+0x14` `FUN_00342b20` (D:L112460) | the same split | the same | the same | research 81 §3 (`RANGE` gain) | the source's azimuth 0..359 | 0 | 0 |
| `SELECTION`, `TELETYPE`, keyboard | `+0x1c` -> `+0xc` (forced one-shot) | 18 | | | 1024 | -1 | 0 | 0 |
| `SwitchMenu PREVIOUS_SCREEN` (.BACK) | `+0xc` | 18 (.BACK is `ONESHOT`) | | | 1024 | -1 | 0 | 0 |
| `ST` entry (music, voice) | `FUN_00342240` | a VAG stream from `VAGSTORE.ZAR` (research 81 §1) | -- | the entry's `N1` | | | | |
| `ST` + `HS` entry, `DAT_0045a0c1` 0 (`SND_HST_01..12`) | `FUN_0034b6c0` (D:L242200-242203; placed D:L242112-242115) | none here: queued if the queue's +0xb is set (these entries have no `PD`, no `TYPE_*`), else dropped (`HEADSET_ROUTE_READING`) | -- | the object | `1024 x volume` (unplaced) / the placed gain `<< 10` | | | |

- **The guard** (both play paths, D:L242067-242069, D:L242194-242196): slot < bank count and (status 1 or `ST`). A
  `HUDUI` sound always passes; a `SMUS`/`UIVOICE` entry passes only because it streams.
- **The `HS` branch** is the first play branch, in both play paths, but not the first thing after the guard. Placed
  (`FUN_00342b20`): the guard, the gain and azimuth, the +0x28 side call `FUN_002b6530` (D:L242100-242104), the early
  return 0 for a `ONESHOT` entry whose gain came out 0 (D:L242105-242107), `FUN_0033f8a0`, and `FUN_003472a0` for a
  class-3 entry (D:L242109-242111), then the `HS` test (D:L242112). Unplaced (`FUN_00343140`): the side call runs before
  the guard (D:L242189-242193), then the guard, the class-3 `FUN_003472a0` (D:L242197-242199) and the `HS` test
  (D:L242200). None of these touches the 12 `SND_HST_*` (`ST`, not `ONESHOT`, class 0). An object whose +0x1c bit 3 is set
  (`FUN_003435c0` sets it for the `HS` key inside `ST`, string 0x3f77a8) is handed, while `DAT_0045a0c1` is 0, to
  `FUN_0034b6c0` (D:L246909-246944) on the object `FUN_0034bb80` returns (`DAT_0049e158`). That function has two gates
  (D:L246918-246922): with no free slot (its +0x28 count 0) it returns 0; otherwise it queues **only if** the queue
  object's byte **+0xb** is non-zero, or the entry's class (+0x1d >> 5) is 3 (`TYPE_DEATH_DAMAGE`, ELF 0x3f7740), or
  +0x1c bit 6 is set (`ST`'s sub-key `PD`, ELF 0x3f77d8, D:L242483-242486) -- and if none holds it returns 1 and queues
  nothing. When it queues, the caller's argument, the object and the volume go into the free slot (a slot of -1:
  returns 0, nothing queued). Either way nothing reaches 989snd or `VAGSTORE` here. On the disc the 12 `SND_HST_*` are
  exactly `ST (N1 <name> HS ())` -- no `PD`, no `TYPE_*` -- so whether a headset line is queued or dropped turns on the
  queue's +0xb alone, which was not read (`HEADSET_ROUTE_READING`): a port must not queue every `HS` play. With
  `DAT_0045a0c1` non-zero the entry streams like any `ST`. `sounds.rdr` carries `HS` on many mission entries; in the front
  end's 329 objects it is on exactly 12, the `UIVOICE` entries that hash to `SND_HST_01..12` (checked on the disc) --
  the members of `GROUPS/UI`'s `SND_HS_OPDV`, the audio options' headset test. By the names the route is the headset's;
  what drains the queue and what `DAT_0045a0c1` stands for (389 mentions, D:L50573-501653: a game-wide flag, not
  the sound system's own) were not read: `HEADSET_ROUTE_READING`, for the audio options' task. A port must not stream these 12 through
  `VAGSTORE` as it does the other voices.
- **Pan -1** is 989snd's "the sound's own `Pan`" (`blocksnd.c` 97-99, 135-137): 0 for all 24 HUDUI sounds. **Vol** 1024
  is the sound's own `Vol` (`(Vol x vol) >> 10`, clamped 127): .DINK 98, .BACK 83, .THUNK 103, .SLIDE 113, .NEG 90,
  .TYPE 44, .METAL 115, .SKB_TYPE 90, .SFX_VOL_SLIDER 127, .TCM_SLIDE 70, .TCM_SELECT 50, .SKB_NAV 90, .COUNTDOWN 127.
- **The group** is the bank sound's `VolGroup`: 14 (indexes 0-18), 2 (19-23). The sound system's init gives groups 1,
  4, 14, 6 and 2 the voice range 24-47 (`SL_SETGROUPVOICERANGE` 78, D:L243340-243345); the group master is
  `SetMasterVolume`'s (0x400 for group 14 in the archived boots), which the package's `voiceLevel(vol, modifier)` already
  takes (`packages/sound/src/render.ts`). Which option slider moves group 14 is the audio options' task
  (`GROUP_14_MASTER_READING`).
- **A one-shot has no handle**: `FadeAllSounds` does not reach it (§4), `StopAllSounds` does.

## 4. The binding table's sound commands (0x3dd4d0)

Rows by `readBindingTable` (research 96 §4); calls counted over the three archives' named sets with `decodeUiProgram`.

| row | id | name | fn | argument | what it does (to 989snd) | calls |
|---|---|---|---|---|---|---|
| 126 | 127 | `StopAllSounds` | `FUN_00277930` (D:L123047-123052) -> `FUN_00346c00` (D:L244200-244207) | none | `SL_STOPALLSOUNDS` (24, no data, `FUN_00340270` D:L240582) | 81 in 17 sets |
| 127 | 128 | `FadeAllSounds` | `FUN_00277910` (D:L123037-123042) -> `FUN_00346c30` (D:L244212-244239) | none | for each voice in the handle list 0x48df98 (filled by `FUN_00347960`/`FUN_00347690` D:L244565-244661 on every non-one-shot play): fade time 1.5 s, `SL_AUTOVOL_A` (34) with (handle, 0, 360 ticks, 2) | 10 in 9 sets |
| 134 | 135 | `VagStreaming` | `FUN_0027a5e0` (D:L124467-124490) | `ON` / `OFF` (strings 0x3eee38/0x3eee40; `INPUT_STRING` takes the caller's input) | `ON`: the stream flag `DAT_0048dda0` = 1 and `FUN_003450f0` (D:L243262-243276) starts the stream system if idle; `OFF`: `FUN_00344f80` (D:L243215-243233) stops it, resets the auto-reverb (`SL_AUTOVERB` 16, depth 0 over 0xf0) and clears the flag | 13 ON, 94 OFF, 26 sets |
| 12 | 13 | `SwitchMenu` | `FUN_0027e720` (D:L126556-126640) | a dialog, or `PREVIOUS_SCREEN` (0x3ef3a0) | `PREVIOUS_SCREEN` pops the history and plays `BACK` unplaced (D:L126591-126599), whether or not the history held a screen; a forward switch plays nothing | 16 of 467 |
| 15 | 16 | `ActivateButton` | `FUN_0027c360` (D:L125377-125392) | a control's name | queues menu command 6; `FUN_003654c0` (D:L262317-262320) -> `FUN_00366b60` (D:L262964-263016) focuses the control and plays `SELECTION` if it was found -- also when it already had the focus | 242 in 44 sets |
| 13 | 14 | `PopUpDialog` | `FUN_0027eb10` (D:L126644-126651) -> `FUN_0027eff0` (D:L126862-126900) | the record | queues command 3; when the current screen has a `POPUP` object it is shown and **`.METAL`** (the literal, not `SELECTION`) plays as a one-shot (D:L126897-126900) | 252 in 53 sets |

`PlayMPEG`, `PlayMPEGNoFade` and `BackgroundMPEG` (rows 22, 133, 135) are the movies' sound (PLAT-19); `SetTtySpeedFactor`
(row 115) sets the teletype's rate, so the tick's rate, not its sound.

## 5. What the front end has loaded

The menu state's init `FUN_001f4860` (D:L54850-54853) and its IOP-reset twin `FUN_001f53d0` (D:L55187-55190):
`FUN_00344090("sounds.rdr", "HUDUI")`, `("sounds.rdr", "SMUS")`, `("sounds.rdr", "UIVOICE")`, then `FUN_003448e0("UI")`.

| block | `sounds.rdr` | bank on the disc | objects | plays |
|---|---|---|---|---|
| `HUDUI` | `SETS`, 24, all `ONESHOT` | `BNKSTORE.ZAR/HUDUI.bnk` (24 named sounds) | 24 | from the bank |
| `SMUS` | `SETS`, 212, all `ST` | none (status -1) | 212 | streamed (`MUS_MENU_THEME`, `MUS_ONLINE_MENU`, `MUS_ARMORY`, `MUS_JUKE_01..12` ...) |
| `UIVOICE` | `SETS`, 91, all `ST` | none | 91 | streamed (the briefings' `^Mnn_nnn`, the options' `SND_VOT_*`); the 12 `SND_HST_*` carry `HS` and are queued for the headset route instead (§3, `HEADSET_ROUTE_READING`) |
| `UI` | `GROUPS`, 2 | (not a bank) | 2 | a group picks a member (`UI_GROUP_PICK_READING`) |

`packages/viewer/src/soundData.ts` `SOUND_GLOBAL_BANKS` (`HUDUI.bnk`, research 81 §1) is the front end's whole bank
list: nothing else the menus play comes from a bank. The music and the voice are streams (PLAT-19's and the options'
tasks), resolved by the same table. A mission's load adds its blocks (`FUN_00344450`, research 81 §1; `SP_COMMON` or
`MP_COMMON` groups by `FUN_00344910` D:L242941-243022) -- what the table holds when the exit screens run after a
mission is `EXIT_STATE_GROUPS_READING`.

## 6. The widgets' implicit sounds

Classes by the vtable holding each handler and its typeinfo name (read off the ELF). Key bytes of the pad event are
`1 + code`, the codes `FUN_0036a5d0` (D:L264985-265075) gives: START 0, SELECT 1, RIGHT 2, LEFT 3, UP 4, DOWN 5,
TRIANGLE 6, CIRCLE 7, SQUARE 8, CROSS 9; a byte of 1 is a press, 2 a hold.

| who | when | sound | source |
|---|---|---|---|
| the screen (`FUN_00368650` D:L263806-264247) | DOWN or the stick down, when the popup, the focused control and the screen's `CONTROLS` bindings all left the key: next enabled control (wrapping); UP or the stick up: previous | `SELECTION`, only if the focus index changed | `FUN_003670d0` D:L263102-263176, `FUN_00366d70` D:L263021-263097 |
| `ActivateButton` (command 6) | the named control found | `SELECTION` | `FUN_00366b60` D:L262964-263016 |
| `CUIListBox` (`FUN_003745e0` D:L270311-270445) | UP / DOWN (or the stick), again each tick of a hold past 0.4 s | `SELECTION` when the row moved (none at the first or last row) | `FUN_00374010` D:L270113, `FUN_003742f0` D:L270212 |
| `CRadioStrip` (`FUN_00370f60` D:L268671-268720) | LEFT previous, RIGHT next, CROSS next, wrapping | `SELECTION` | D:L268692-268716 |
| `CSliderBar` (`FUN_00371d00` D:L269059-269180) | LEFT / RIGHT a step; held past 0.4 s, a step each tick | `SELECTION` each step, at the ends as well | D:L269093-269174 |
| `CPopUpDialog` (`FUN_00370990` D:L268478-268545) | CROSS (accept), TRIANGLE (cancel), LEFT / RIGHT (the other choice, when it is shown) | `SELECTION` | D:L268512-268540 |
| `CTeleType` (`FUN_00377b80`), `C2DCounter` (`FUN_0037b5c0`), `CListItemTimedTextTypeImpl` (`FUN_0037bc40`) | a glyph typed / a count step | `TELETYPE` (`FUN_0036a300` D:L264867-264874) | D:L272308, D:L272481, D:L274240, D:L274431 |
| the soft keyboard (`GetTextInput`) | `FUN_00395de0` (D:L289054-289088) by slot: 0 ScaleUp, 1 ScaleDown, 2 Navigation, 3 KeyPress, 4 KeyPressEnter, 5 Negative; called from `FUN_0038b390` (1), `FUN_0038c000` (3), `FUN_0038c040` (4), `FUN_0038c130` (2), `FUN_0038d200` (3), `FUN_0038d770` (0), `FUN_00399b30`/`FUN_00399c20` (3), `FUN_00399ec0` (5, 3) | the six of §1.3 | `KEYBOARD_SOUND_TRIGGERS_READING` |
| a button, CROSS / CIRCLE / TRIANGLE on a screen, a refusal | -- | none of the code's: each is the script's (`.DINK` 164 commands, `.NEG` 65, `SwitchMenu PREVIOUS_SCREEN`) | §4, §7 |

`SELECTION` is `DAT_00408564` through `FUN_0036a2c0` (D:L264855-264862) wherever the table says so; `TELETYPE` is
`DAT_0049ea88`. Both play forced one-shot, unplaced, at 1.0.

## 7. The dev disc's inventory (names and counts)

Method: every set of `RUN/UIZANIM.ZAR`, `EXTZANIM.ZAR` and `MPZANIM.ZAR` (`parseAnimSets`), every set-0 command 30 of
every sequence, its name from the animation's name table, its flags and its flag-0x10 volume; every string of every
`RUN/UI/READERC.ZAR` and `READERX.ZAR` member that is a sigilled name, starts `SND_` or sits under a key naming a sound;
each name hashed (`soundHash`) and looked up in `sounds.rdr`'s `SETS` and `GROUPS`. `tools/dialogInventory.ts` and
`tools/dump-dialogs.ts` do not extract `SOUND` commands (their sets are animations and names); the probe used their
readers and is not in the tree -- PLAT-23 makes it a tool and a pinned test.

**The sets: 399 `SOUND` commands, 89 distinct names.**

| class | names | commands | resolves to |
|---|---|---|---|
| HUDUI one-shots | 9: `.DINK` (164), `.NEG` (65), `.SLIDE` (14), `.TCM_SELECT` (10), `.METAL` (4), `.TCM_SLIDE` (2), `.THUNK` (2), `.COUNTDOWN` (1), `.SFX_VOL_SLIDER` (1) | 263 | HUDUI 0, 4, 3, 13, 8, 12, 2, 19, 11 |
| SMUS music | 17: `MUS_MENU_THEME`, `MUS_ONLINE_MENU`, `MUS_ARMORY`, `MUS_SUCCESS`, `MUS_FAILURE`, `MUS_JUKE_01..12` | 24 | SMUS `ST` (#5, #6, #7, #9, #10, #200-211) |
| UIVOICE voice | 53: `^M51_140` ... `^M83_159` (briefing, objectives, debriefing, game complete) | 65 | UIVOICE `ST` (53 of #36-#90) |
| UI groups | 2: `SND_HS_OPDV`, `SND_VO_OPDV` (`dlgOptions_Audio.rdr`) | 2 | `GROUPS/UI` |
| not placed | 5: `SND_A/B/C/D/F_DISPLAY` (`EXTZANIM` `dlgExitState.rdr`) | 5 | `GROUPS/SP_COMMON`, loaded by a mission (`EXIT_STATE_GROUPS_READING`) |
| silent | 3: `" "` (`ObjectiveDisplayAnim.rdr`, `Common_Brief_Anims.rdr`), `SND_DINK` (`UIanim.rdr` in all three archives, `dlgScreenAdjust`, `dlgNetServerSelect`, `dlgExitState`, the MP round screens), `^M73_113` (`dlgDebriefing.rdr`) | 24 + 15 + 1 | none; `^M73_113` is only in `M73_SVO`, and its command has flags 0 (no new play) |

Flags seen: 0x80 and 0x82 (a place asked for), 0x90 (a volume: `dlgMenu`'s 1.2/0.8/0.7, `dlgManageRoster`), 0x280
(0x200 with a new play: the voice lines, the music test groups, the briefing beds), 0x0 (`^M73_113`). The 0x200 flag sets
the name slot's +2 (D:L112360-112362); READERX's uncompiled `dlgExitState` spells the same commands' key
`STOP_ON_EXIT` (`STOP_ON_EXIT_FLAG_READING`).

**The dialog files: 17 distinct names** *(corrected 2026-10-02 by PLAT-23's review: 15 missed the two below)*, 5 not
in the sets: `uisounds.rdr` `.TYPE`, `.BACK`, `.METAL`; `UiParams.rdr` `.SLIDE`, `".SLIDE\t"`, `.SKB_TYPE`, `.THUNK`,
`.SKB_NAV`, `.NEG`; READERX `dlgExitState.rdr`'s eight (`MUS_SUCCESS`, `MUS_FAILURE` -- the value of a `SOUND` node's
`NAME`, which carries no sigil -- `.DINK` and the five grade groups, the source of the EXTZANIM commands). New against the sets: `.TYPE` (HUDUI 7), `.BACK` (1), `.SKB_TYPE`
(10), `.SKB_NAV` (16) resolve; `".SLIDE\t"` is silent.

**In all: 94 distinct names, 85 resolve, 4 silent, 5 not placed.** HUDUI's other 11 sounds (`.COUNT`, `.TYPE_1`,
`.SKB_ENTER`, `.NV_GOGGLES_ON`/`_OFF`, `.BOMB_BEEP`, `.SPLASHSCROLL_1`, `.COUNTDOWN2..5`) are named by no front-end
file; the goggles' are the code's (research 81 §1).

## 8. Silence to reproduce

| name | where | why silent |
|---|---|---|
| `SND_DINK` | 15 `SOUND` commands (0x82) | no entry hashes to it (the sigilled `.DINK` is a different name) |
| `" "` | 24 commands (0x280) | no entry |
| `".SLIDE\t"` | `UiParams.rdr` `ScaleDownSound` | the tab is hashed (`FUN_0032ee10` returns the stored string untrimmed): the keyboard's scale-down plays nothing while its scale-up plays `.SLIDE` |
| `^M73_113` | `dlgDebriefing.rdr`, one command | flags 0: a retune of a voice that is not playing |
| `SND_NEG` | `DAT_0048dd90`, seven sites outside the menus | no entry |
| `SELECTION` absent | `uisounds.rdr` without the key | resolves `""`, hash 0, no entry (the disc has the key) |
| an `SMUS`/`UIVOICE` name with streaming off | after `VagStreaming OFF` | the stream system is down (`FUN_00344f80`); whether the play is dropped or queued is the stream task's |

A name in a block whose bank is missing and that is not `ST` would exist and still not play (the guard, §3); no
front-end name is one.

## 9. Evidence: the recomp's 989snd logs

- **What exists**: the recomp logs every 989snd RPC with its words. Under `C:/Projects/socom_pc/logs`, 454 `run_*.log`
  carry `PlaySound` lines (`[ps2xIOP] 989snd: snd_PlaySoundVolPanPMPBNoReturn (fno 0x00000012) [bank, sound, vol, pan,
  pitch_mod, bend]`), and the gate's game logs under `D:/socom_archive/parity/gate/*/*.game.log` the same (`famb/title`:
  .METAL x9, .TCM_SLIDE x2). HUDUI is the boot's one `snd_BankLoadByLoc` (handle 0x00a00000, 24 sounds, block 3,472 B,
  VAG 60,928 B). The `blop_a/b/c` runs keep `drive.txt` and `mix.wav`, not the logs; `run_20260922_005048.log` (the
  owner's R239 log) is not archived. No screen markers: a play is placed by its neighbours (stream starts, CD reads).
- **What they say** (counted 2026-10-02; a play is a `fno 0x00000012` or other `snd_PlaySound*` line whose bank word is
  0x00a00000): over the `run_*.log` files of `C:/Projects/socom_pc/logs` (471 then, 454 of them with a HUDUI play),
  202,807 HUDUI plays; over the gate's `D:/socom_archive/parity/gate/*/*.game.log` (346, 345 with one), 183,014 more,
  counted apart and not in the breakdown below. In both, every one is 0x12 (the one-shot) with pan -1, pitch_mod 0 and
  bend 0, and none is another play call (R122.11). The `run_*.log` breakdown: sound 7 .TYPE 183,954;
  8 .METAL 9,514 (1.0 7,753, 0.7 1,174, 0.8 587); 16 .SKB_NAV 4,377; 0 .DINK 1,817; 12 .TCM_SLIDE 1,174 (1.2 and 0.7,
  587 each); 10 .SKB_TYPE 762; 1 .BACK 447; 11 .SFX_VOL_SLIDER 430; 2 .THUNK 141; 3 .SLIDE 136; 4 .NEG 50; 13
  .TCM_SELECT 5. Every index is the one §7 resolves; nothing from SMUS/UIVOICE as a bank play.
- **The boot** (`run_20260920_005329.log`; at least 19 other logs hold exactly two HUDUI plays, the boot's pair): two
  `.METAL` at 1.0 after the HUDUI load and before the first movie stream, then, during the third stream (the main
  menu's background movie, by its place), the six plays of `ActivateMenuBtns` in R122.12's order. PLAT-36 is the proven
  comparison.

## 10. The ARMORY precedent, and what the earlier notes said

- **`viewer/src/armory.ts:37-39`** plays `.DINK`, `.SLIDE`, the scripts' `.NEG` and the description's `.TYPE` from
  `HUDUI.bnk`: the samples (HUDUI 0, 3, 4, 7) and the unplaced one-shot match R122.4 and R122.11. Against this reading:
  the bank is HUDUI by the source, not a stand-in for a missing "UI" bank (`UI_BANK_PLACEHOLDER` is answered, R122.3);
  `TELETYPE_TICK_SOUND_READING`'s "`DAT_0049ea88`'s bank not resolved" is resolved (HUDUI's slot, index 7); and three cues
  are missing (R122.13). Whether the page's `.DINK` should also carry the command's volume (1.0 for every ARMORY command)
  changes nothing here.
- **Research 95 §3.9** "none: ... the confirm popup": the popup's `PopUpDialog` plays `.METAL` and its keys `SELECTION`.
- **Research 95 §5.1 and the roadmap's PLAT-23 block** ("bank UI, not on the disc"; "SMUS, TCM_ECHO, MULTI, HOSTAGE and
  UI banks are not on the disc"): SMUS's bank is absent but its entries stream; TCM_ECHO has no block at all; UI is a
  group block.
- **Research 81 §8** `DEFAULT_RANGE_PLACEHOLDER` (30-200, "a sound `sounds.rdr` does not list"): such a sound has no object
  on the console and is silent; an entry without `RANGE` gets 160-430 (`FUN_00345620`). For the sound package's owner;
  no UI sound depends on it.
- **The PC project's stray-sound row** (KNOWN, R239): the 87/0 bucketing is retracted there; §9 reads the archived logs
  again and finds the menus' own cues.

## 11. What is not settled, and what would settle it

- **Placement** (`UI_SOUND_PLACE_READING`): why the 0x82 commands play unplaced -- the 0xf9 node in a UI animation
  (`FUN_0026f4e0` D:L118170-118179: the animation's object +0x3c or its node) was not followed into the UI objects; the
  logs say unplaced. A trace of `FUN_002659c0`'s branch on the main menu settles it.
- **The groups' pick** (`UI_GROUP_PICK_READING`): `FUN_00347f00` (D:L244833) and the group's play (vtable 0x406b50,
  `+0xc` `FUN_00348710` D:L245161) were not read; `DYNAMIC_WEIGHTS 0.05` is the data.
- **The headset route** (`HEADSET_ROUTE_READING`): what drains `FUN_0034b6c0`'s queue (the object at `DAT_0049e158`),
  what sets that object's byte +0xb (with no `PD` and no `TYPE_DEATH_DAMAGE` on the 12 `SND_HST_*`, it alone decides
  queued or dropped) and what `DAT_0045a0c1` means; until then the 12 are not streamed (§3). The audio options' task
  reads it.
- **The off switch** (`SOUND_OFF_SWITCH_READING`): what writes `DAT_0048dd28` (no assignment by name in the
  decompilation; the ELF's stores to 0x48dd28 would settle it).
- **The inventory's tool**: landed with PLAT-23 (2026-10-02, §13): `packages/ui/src/sounds/inventory.ts` and the
  dev-disc test `packages/ui/test/sounds/uiSoundsDisc.test.ts` reproduce §7's counts (399 commands, 89 and 94 names).
- **The exit screens' table** (`EXIT_STATE_GROUPS_READING`): whether `SP_COMMON` is still loaded at `dlgExitState`.
- **The keyboard's triggers** (`KEYBOARD_SOUND_TRIGGERS_READING`): which key reaches which of the nine callers.
- **Group 14's master** (`GROUP_14_MASTER_READING`): the options slider that sets it.
- **The boot's two `.METAL`** (`BOOT_POPUP_METAL_READING`): `do_onstart`'s two `POPUPDIALOG`s are the candidates (each
  inside a valve test); a log with screen markers settles it.
- **Timing** (the acceptance's one frame): every cue above starts on the frame its handler runs; PLAT-36's capture is
  the measure.

## 12. Placeholders and readings

Two names are the ARMORY's code; five more are PLAT-23's code since 2026-10-02 (§13); one is OBF-31's (§14); the rest
are *note only*.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `UI_BANK_PLACEHOLDER` (`viewer/src/armory.ts`) | the "UI" bank the menu init asks for | answered: "UI" is `sounds.rdr` `GROUPS/UI` (`FUN_00348130`), the menus' bank is HUDUI by `FUN_00344090` (R122.3) | open in code; answered here; the ARMORY's file is PLAT-34's (W9.R7), which retires it (2026-10-02: not PLAT-23) |
| `TELETYPE_TICK_SOUND_READING` (`viewer/src/armoryText.ts`) | the teletype's sample | `.TYPE`, HUDUI 7, through `uisounds.rdr` `TELETYPE` and `DAT_0049ea88` (§1.2); the logs' sound 7 | open in code; confirmed here |
| `UI_SOUND_PLACE_READING` | how a 0x82 `SOUND` plays in the menus | unplaced, the bank's pan, the command's volume: every logged HUDUI play has pan -1 (§9); the node branch not followed (§11) | open in code: `packages/ui/src/sounds/uiSoundCues.ts` (PLAT-23) |
| `UI_GROUP_PICK_READING` | which member a `GROUPS` group plays | `DYNAMIC_WEIGHTS 0.05` over 12 entries; the pick function not read (§11): the two `GROUPS/UI` names resolve to an object but have no defined member yet | open in code: `packages/sound/src/uiSounds.ts` (PLAT-23) |
| `HEADSET_ROUTE_READING` | where an `ST`+`HS` entry (`SND_HST_01..12`) goes while `DAT_0045a0c1` is 0 | handed to `FUN_0034b6c0` instead of streamed (§3), which queues only if the queue object's +0xb is set, the entry is `TYPE_DEATH_DAMAGE` or carries `PD` (else returns 1, nothing queued): these 12 have neither, so +0xb decides; +0xb's writer, the queue's consumer and the flag's meaning not read | open in code: `packages/sound/src/uiSounds.ts` (PLAT-23) |
| `SOUND_OFF_SWITCH_READING` | the byte `DAT_0048dd28` that silences the whole sound system | tested first by every function of the chain (§2); no writer found by name; 0 on every logged run | open in code: `packages/sound/src/uiSounds.ts` (PLAT-23) |
| `EXIT_STATE_GROUPS_READING` | the five grade groups of `dlgExitState` | `GROUPS/SP_COMMON`, loaded by a mission's `FUN_00344910`; reading: they resolve after a mission | *note only* |
| `KEYBOARD_SOUND_TRIGGERS_READING` | which keyboard press plays which of the six | the nine callers of `FUN_00395de0` and their slots are read (§6); their keys are not | *note only* |
| `GROUP_14_MASTER_READING` | the master volume of the menu sounds' group | `SetMasterVolume` group 14 at 0x400 in the archived boots; the slider not traced | *note only* |
| `BOOT_POPUP_METAL_READING` | the two `.METAL` before the intro movie | `dlgIntroScreen` `do_onstart`'s two `POPUPDIALOG`s (`PopUpDialog` plays `.METAL`, §4) | *note only* |
| `STOP_ON_EXIT_FLAG_READING` | `SOUND` flag 0x200 | READERX's `dlgExitState` source names `STOP_ON_EXIT` on the commands that carry 0x280; the code sets the slot's +2 (D:L112360); what reads it not traced | open in code: `packages/ui/src/sounds/uiSoundCues.ts` (PLAT-23) |
| `ROUND_SCREENS_STOP_ALL_READING` (`viewer/src/matchSound.ts`) | what stops and what is not started at the round screens' start | `FUN_002aa910` -> `FUN_00346b30` (`SL_STOPALLSOUNDS`), `FUN_00344f80` (the stream system), `FUN_00348860` (the music slot), D:L151220-151222; MPExitState alone ticked (§14). The page: one `RoundAudioHost.reset` at the first screen frame, then no world sound until the next `roundStart`; the beds' loops and a ring already sounding left open (LATER 580). Settles it: a capture of a round's end with a shot, a voice and the win music sounding | open in code (OBF-31, 2026-10-31); reading, pending review |

## 13. What PLAT-23 built on this reading, and what it found (2026-10-02)

Added by PLAT-23's implementer (reading, pending review). The code: the table `packages/sound/src/uiSounds.ts`
(`UiSoundTable`, `frontEndSoundTable`, `uiSoundNames`, `keyboardSoundNames`, the play's words), the cues, the `SOUND`
command and the three sound rows `packages/ui/src/sounds/uiSoundCues.ts` (`UiSoundCues`), the names the files carry
`packages/ui/src/sounds/inventory.ts`, and the page's host `packages/viewer/src/uiSoundHost.ts`. Re-read at the source
for it, beyond §§1-8:

- **The key search is depth-first** (`FUN_0032f0d0` / `FUN_0032f0e0`, D:L230210-230299): `FUN_003435c0` finds `ONESHOT`,
  `MUS`, `TYPE_*` anywhere in the entry and `HS`, `PD`, `HQ`, `VQ`, `LOOP`, `N1` anywhere inside `ST`. On the disc 8 of
  SMUS's 212 entries carry `MUS` inside `ST` only -- `MUS_MENU_THEME` (`MUUI0001`), `MUS_ONLINE_MENU` (`MUUI0003`),
  `MUS_ARMORY` (`MUUI0005`), `MUUI0002`, `MUUI0004`, `MUUI0006`, `MGEN0065` and `MUSSCARY` -- so SMUS has 211 music-class entries
  by the engine's search, not the 203 a top-level count gives (§2's "203 `MUS`" counted the top level). **A drift found
  outside this task's files**: `packages/sound/src/script.ts` `parseStreamEntries` tests `e.includes('MUS')` at the top
  level only, so its `streamFile` names those eight `.VAG` where `FUN_00342240` formats `.VPK`; the menus' music is
  PLAT-22's to play and to fix (the round's cues the streams test pins all carry `MUS` at the top level).
- **The ordinal** is `DAT_0048db38`, reset to 0 at each block load (D:L242675) and stored at +0x12 (D:L242547-242548);
  the slot is `DAT_0048db40` at +0x10 (D:L242549), advanced also by the two early returns of a block `SETS` lacks
  (D:L242698, D:L242716).
- **The volume word** is `(int)(volume x 1024 x VOLUME x DAT_003e0070)` in single precision with `cvt.w.s`'s
  truncation: 1.2 -> 0x4cc, 0.8 -> 0x333, 0.7 -> 0x2cc -- §9's logged words exactly (rounding would give 0x4cd and
  0x2cd).
- **The `SOUND` command** (`FUN_002659c0`, D:L112350-112510): flag 0x1 looks no name up (the node of byte +7 instead,
  D:L112350-112355), so nothing plays; the name index is the **byte** at +6 (`FUN_0026e7c0`'s `short` from a byte
  read), where PLAT-07's runtime reads a u16 (`zanimRuntime.ts`, SOUND) -- the same on every command whose byte +7 is 0,
  which is every one without flag 0x1; recorded for PLAT-07's owner, not changed here. An unplaced new play of an entry
  with `HQ` or `VQ` goes to `FUN_003428f0` (D:L112466-112470) rather than the play: none of the front end's 329 objects
  has either, nor `PD` or `TYPE_DEATH_DAMAGE` (pinned in `packages/sound/test/uiSoundsDisc.test.ts`). The disc's 399
  menu commands carry the flags 0x0 (1), 0x80 (191), 0x82 (117), 0x90 (5), 0x280 (85) and nothing else; 0x100, 0x400
  and 0x800 are reported unmodelled.
- **The silence**: every one of R122.10's names is reproduced as a null lookup, and the page's `GameAudio`, which
  retries a name with its blanks trimmed (`audio.ts` `find`), is reached only after the exact hash has resolved, so
  `".SLIDE	"` stays silent there too.
- **What the page does not yet do**: `StopAllSounds` on the page stops the music slot only -- `GameAudio` keeps no
  handle to a one-shot's voice (owed to a change of `audio.ts`, a hot file); `FadeAllSounds` has nothing of this host's
  to fade (it starts no handle voice); the front end's streams (SMUS, UIVOICE) and the headset queue are counted, not
  played (PLAT-22, the audio options' task, `HEADSET_ROUTE_READING`).
- **A new play replaces its name slot's voice** (found in review, 2026-10-02): before a new play (0x80) `FUN_002659c0`
  stops and frees the voice the same name slot still holds (`FUN_00347610` / `FUN_00347810` on slot +0xc, D:L112451-112455)
  and stores the new play's handle there (D:L112462, D:L112474). A one-shot (every HUDUI play) leaves no handle, so the
  menus' bank plays are unchanged; but `UiSoundPlay` carries no name slot, so a stream (SMUS's music, UIVOICE's lines)
  has nothing that says "stop this slot's previous voice first". **Owed to PLAT-22**, which plays the streams: the play
  needs the slot (the command's byte +6 within its animation) and the stop-before-play.
- **The dialog files' names** (corrected in review, 2026-10-02): `dialogSoundNames` now also takes a `SOUND` node's
  `NAME`, so §7 counts 17 (`MUS_SUCCESS`, `MUS_FAILURE` from `dlgExitState.rdr`); the 94-name union is unchanged (both
  are in the EXTZANIM sets' commands too).
- **The ARMORY's `.TYPE`**: HUDUI's 24 sounds all have `InstanceLimit` 0 (read off the bank), so 989snd caps none of
  them: each teletype tick is a new one-shot. `GameAudio.restart`'s one-voice tick (the ARMORY's) is the page's
  adaptation; this host plays each tick as `play`. Which is heard is PLAT-36's measure.
- **Chris's swap-panel citation** (`../integration/chris-v5-notes.md` §6, S11): `uisounds.rdr` SELECTION / BACK and this
  note's HUDUI reading are one chain, not two sources: the file gives the names (`.METAL`, `.BACK`), the table gives
  their indexes (HUDUI 8, 1). Pinned in `packages/sound/test/uiSoundsDisc.test.ts`.
- **Connected (2026-10-02, sprint 9's connecting lines, S9-WIRE; research 115 §16.2):** the page's front end
  (`packages/viewer/src/frontEnd.ts`, `FrontEndSession`'s `sounds`) hands the cues to the command host (`SOUND`), to the
  shell's PopUpDialog (`popup()`) and to SwitchMenu's PREVIOUS_SCREEN (`back()`), its three rows to PLAT-08's host
  (research 115 §16.3), and the widgets' SELECTION / TELETYPE and the popup's keys to `selection()`, `teletype()` and
  `popup()` through the dialog's widget host (§16.5). `mountFrontEnd` makes no cues yet: the page's `GameAudio` holds
  HUDUI only with a map. *[Connected 2026-10-02, S9-WIRE's review round (research 115 §16.2): `mountFrontEnd` makes
  the cues itself (`pageUiSounds`) over a `GameAudio` of the front end's own holding HUDUI alone; `audio.ts` unchanged.]*

## 14. The stop at the round screens (OBF-31, 2026-10-31; reading, pending review)

Added by OBF-31's implementer for Craig's v0.3.33 playtest ("i was still able to hear shots and sounds during the match
end screen"). Read at the source in the retail decompilation, every line re-read for this section; the code is
`packages/viewer/src/matchSound.ts` (`ROUND_SCREENS_STOP_ALL_READING`), `matchFirearm.ts` and `matchThrow.ts`, the test
`packages/viewer/test/roundScreenSilence.test.ts`.

- **The trigger.** Online, a client's mission tick `FUN_002aa490` finds the host's +0x113 at 4 or 6 -- after the host's
  own 3.0 s wait, the page's `ENGINE_READ_S` (research 81 §13, `ROUND_SCREENS_SILENCE_WALK_READING`) -- and calls the
  mission's end `FUN_002aa910` (D:L151127-151131; the function at D:L151203).
- **The stop of every sound, once.** `FUN_002aa910` calls, in order, `FUN_00346b30` (D:L151220), `FUN_00344f80`
  (D:L151221) and `FUN_00348860` (D:L151222).
  - `FUN_00346b30` (D:L244173-244195), under the sound-off byte `DAT_0048dd28` at 0 (`SOUND_OFF_SWITCH_READING`):
    `FUN_00341060` (D:L241124-241132, a master reset when `DAT_0048de10` is set), then `FUN_00340270` (D:L244182) --
    989snd command 0x18 with no data (`FUN_0033f8b0(0x18, ...)`, D:L240585), `SL_STOPALLSOUNDS` 24 (§4, row 126) --
    then each handle-tracked voice of the list `DAT_0048dfa0` zeroed and queued, `FUN_00346550` (D:L244191; the function
    D:L243967-243994: each queued handle released through `FUN_00347810` and unlinked) and `FUN_00347120(0,0)`
    (D:L244192; the function D:L244390-244424: the list re-filtered, `FUN_00346550` again, `FUN_003408f0`).
  - `FUN_00344f80` (D:L243215-243233) is `VagStreaming OFF`'s own call (`FUN_0027a5e0` D:L124485, §4 row 134): the
    stream object's stop through its vtable +0x14, its mode `DAT_0048dd98` to 0, `FUN_0034b8c0` (the stream queue
    `DAT_0049e158` cleared, D:L246965-246985), a `FUN_0033f130(.., 6, ..)` command 0x4c, 989snd 0x34 (`FUN_0033f700`,
    D:L240175-240180), `FUN_0033f5f0` (D:L240141-240170: waits on the IOP, sends 0x35 and clears `DAT_00488fb0`, the
    open flag `FUN_0033f720` tests before it opens a stream with the 0xb000 buffer that is a VPK's, research 124 R124.1),
    `DAT_004a1798` to 0, `FUN_0034be10` (D:L247186-247204), the four stream slots `DAT_003dffb0..c8` to -1, and
    `SL_AUTOVERB` 16 to depth 0 (`FUN_0033f220(2, 0, 0xf0, 3)`). The round's line and its win music are streams (`^PH_*`
    VAG and `MUS_*` VPK, `FUN_00342240` playing through 989snd 0x2c `FUN_0033f580`, research 124 R124.3): they stop here.
  - `FUN_00348860` (D:L245208-245223) stops SOUND's one-voice music slot (`FUN_00348dc0`, research 124 R124.5 and §7;
    the slot's voice `DAT_0048e080` is set at D:L245406 and D:L245416): `DAT_003e0080` to 1, the slot's entry
    `DAT_0048e088` stopped (`FUN_00349d30`, D:L246009-246019), the slot's voice stopped by 989snd 0x15
    (`FUN_00347610` D:L244547-244560 -> `FUN_00340330`) and released (`FUN_00347810`, D:L244597-244637), the pending cue
    `DAT_0048e0b0` and its priority `DAT_0048e0b4` cleared. **The win music stops at the screens' start** -- by the slot's
    stop and by the stream system's -- so the page stops its music slot there (`RoundAudioHost.reset` -> `stopMusic`).
- **Nothing new starts.** The state machine `FUN_002ce9e0` (D:L171866) ticks only the stack's top through its vtable
  +0x14 (D:L171877-171888); under ROUND COMPLETE, FINAL ROUND and GAME COMPLETE that is MPExitState, whose Tick
  `FUN_00223680` (D:L75899-75958) runs its menus, not CoreState's world (research 115 §8.2), until the next round's
  restart pops it (D:L75935-75936). No round, reload, throw, effect, voice or warning is started meanwhile.
- **The page** (`ROUND_SCREENS_STOP_ALL_READING`): the sound part (`mountSound`'s `frame`) calls `RoundAudioHost.reset`
  once on the first frame a screen is up (`NetPage.screenUp`) -- `GameAudio.stopTransient` (the voices, the slide, the
  streams' voices), the music slot stopped, the round's queued cues dropped -- and from then to the next `roundStart`
  plays none of the firearm's sounds (`fireEvent`: the rounds, reloads, dry clicks and bolts; `effect`; `goggles`;
  `roundFired`), none of the net's voices (`reloadSound`, `deathVoice`, `hurtVoice`, `escorteeVoice`), no `ring`, no
  grenade warning, no throw clip's callback of another body. The firearm (`matchFirearm.ts`) takes no press under a
  screen (neither the hands' -- a throw, a rocket -- nor its own), lets a held trigger go each frame, and its source's
  `ready` is false (no round, no reload begun or landed); the throwables (`matchThrow.ts`) take no trigger, let a waiting
  rocket go (LATER 192's `launcherWaits`) and start none of their sounds. Through the engine's 3 s every one is as
  before; at `roundStart` all are heard again (`RoundAudioHost.roundStart` already stops the last round's voices).
  `room.ts`'s refusal after `roundOver` is unchanged. The review's fold (F1, N3): a taunt's vocal plays neither for
  another's nor for the sender's echo and the Chat menu neither opens nor sends (`matchTaunts.ts`); a scene program's
  SOUND goes through the gated `MatchSound.sceneSound` on both pages (`main.ts`, `matchMount.ts`) -- the world's step
  itself runs on (LATER 580's first half); a grenade's pin pulled in the 3 s is let go at the first screen frame
  (`GrenadeThrower.cancelMenuHold`, no throw).
- **The held latches** (OBF-31b, 2026-10-31; reading, pending review): the same rule -- a held trigger let go, no press
  taken (`FUN_002ce9e0` D:L171877-171888) -- for every latch the hands' trigger holds, since the hands swallow the let-go
  under a screen: the turret's (`matchActions.ts` `turretFrame`, by the turret's own release `trigger(false)` before the
  frame's rounds -- no claim under the screens, nothing held at `roundStart`), the firearm's mounted raise feed and pull
  count (`matchFirearm.ts` `fireFrame`), the launcher's and a placing's raise feeds (`matchThrow.ts`, at the first screen
  frame; a placing's `release` not asked, N3's cancel its let-go); a held grenade keeps N3's rule. Unit tier:
  `roundScreenSilence.test.ts`, `matchActions.test.ts` ("OBF-31b").
- **Unread** (LATER 580): a received taunt's text line still posts on the HUD under the screens (`matchTaunts.ts`, the
  code unchanged). No source decides it either way: `FUN_002ce9e0` ticking only the top state (D:L171877-171888) argues
  against it, but where a chat line received under MPExitState is handled has not been read. Settled by that read or a
  capture of a taunt sent at a round's end.
- **Left open** (LATER 580): the beds' and emitters' loops (`SL_STOPALLSOUNDS` stops every voice, and nothing of
  CoreState restarts them; the page's loops run on under the screens), a ringing ears' duck and its fade timer already
  running at the screens' start (`RingingEars`; its tone is a transient voice, `WebAudioOut.play`'s set, so the reset
  stops it; no new ring starts), the walk and the room's mover still stepped (LATER 580's first
  half), and a projectile already in the air whose blast the room tells under the screens (the room's, its sound through
  the gated effects and throwables). Settled by a capture of a round's end with a shot, a voice and the win music
  sounding.
