# 04 -- Options and the memory card (`OPT-`)

The OPTIONS screens and what each setting does, and everything the game keeps on the card: the options save, the
persistent valves, the personas, the ARMORY's loadout file, the card dialogs, card timing, managing the simulated card,
and moving it between the browser and the desktop. The card itself (store, filesystem, libmc, codec) is platform:
PLAT-25, PLAT-37, PLAT-26, PLAT-27. **The card's storage and the password are ruled** (the owner, 2026-10-01, R4): two
slots in IndexedDB, each a raw 8 MB PCSX2 `.ps2` image with ECC (PLAT-25, PLAT-37); the account password never kept in
the browser, the card's `PASSWORD` field holding a server-issued credential instead (OPT-04, SVC-03). The desktop-only
screen is PLAT-28; this segment wires its options hooks (OPT-17).

**Corrected by R7 (the owner, 2026-10-01, replacing R4;
[the spec](../specs/2026-10-01-web-r7-account-and-card-design.md)).** The paragraph above is R4's. Under R7 the card
itself is platform's PLAT-24 (storage), PLAT-25 (two virtual card slots in localStorage, in our own JSON: a file table
with the original's names and nominal sizes, an extension area `ext`, a revision counter) and PLAT-26 (libmc over that
table); PLAT-37 (the filesystem) and PLAT-27 (the codec) are dropped, and so is "moving it between the browser and the
desktop" (OPT-08: no export, no import). The tasks below keep the original's **files, names, nominal sizes and op
sequence**, with our contents: the save UI is the original's word for word and frame for frame, the bytes are not. The
account is a plain name and password as the original asks for them; the server keeps an argon2id (or scrypt) hash; no
credential on the card and no revocation screen (SVC-03). **SAVE PASSWORD: YES is ruled** (R7's §7 item 5, the owner,
2026-10-01: "agreed on cookie"): it keeps a server-issued remember token in an HttpOnly, Secure, SameSite cookie on
the match server's host, never the password; the slot's persona record keeps SAVEPASSWORD: YES and the password's
length (for the masked row), never the password or the token (OPT-04, SVC-03). The obfuscated store of the spec's §2,
the owner's first pick, was replaced by this the same day.

The campaign is out of scope for now: campaign saves get no tasks; the options save still writes the seven dummy
`SaveGame<n>` files (OPT-01), because the card would not match the original without them; the campaign valves are
written with their defaults (OPT-02). Conventions: [README](README.md#conventions).

## Facts this segment rests on

| # | Fact | Source |
|---|---|---|
| O1 | OPTIONS: AUDIO OPTIONS, VIDEO OPTIONS, CONTROLLER OPTIONS, CONTROLLER PRESETS, HDD (ENABLED/DISABLED, DISABLED ticked), RETURN; footer "BACK / SELECT"; OPTIONS is the main menu's 4th roller item | `logs/parity/options_explore_sheet.png`; `logs/parity/runs/options_explore/s04..s11`; `scripts/parity/options_explore.txt` |
| O2 | `dlgOptions_Menu.rdr` (8,576 B): `AudioOpBtn`, `VideoOpBtn`, `ControlOpBtn`, `ControlPresetBtn`, `HDDOnOff` (RADIOSTRIP, valve `HDD_ENABLE`), `SaveAndLeaveBtn` (`check_then_save_and_leave`); scripts uianim, UIMemCardAnim, UIHardDiskAnim; `USES_MEMCARD`; TRIANGLE -> `Triangle_Back` ("...will not save your changed options..." YES/NO); `SuspendMenuInput 1.75`; enabling HDD -> a 40GB-HDD confirmation (`CheckHDDEnable`); music `MUS_ONLINE_MENU` (`Call_Music`); `GoToStickSetup` -> `dlgStickSetup.rdr` (not on the disc) | `RUN/UI/READERC.ZAR` |
| O3 | AUDIO: MUSIC, SOUND, DIALOG, HEADSET VOLUME sliders; SOUND STEREO/MONO/Dolby Pro Logic II; DEFAULT SETTINGS; RETURN; TRIANGLE after a change -> "Pressing (triangle) will clear your changes..." YES/NO (NO highlighted); info lines `_689`, `_697`-`_701`; a press moves ~5 px of a 290 px track; rows 44 px apart | `D:/socom_archive/parity/s10_audio_options/s06..s22`; `dlgOptions_Audio.rdr` (12,512 B); UIMnLOC `_688`-`_701`; `scripts/parity/music_only_mission.txt` header |
| O4 | `InitSystemTuners` (`FUN_0038a7a0`, D:L282240-282480): SOUND_VOLUME 1.0, MUSIC_VOLUME 0.74, BRIGHTNESS 0.5, DIALOG_VOLUME 1.0, HEADSET_CONTROLLER 0.75; two sets of STICK_SENSITIVITY/INERTIA/DEADZONE tuners. The rdr UIVAR VALUEs disagree (MUSIC 0.5, BRIGHTNESS 1.0, sticks 0.5); the captured knobs match the tuners (music ~0.71 of the track, brightness mid) | decomp; strings 0x3fa918..0x3fa9a0; O3, O5 captures |
| O5 | VIDEO: BRIGHTNESS slider with a grey ramp; TEAMMATE NAMES; VIDEO MODE INTERLACED / PROGRESSIVE SCAN (480p); HELP WINDOWS; HEAD BOB; SCREEN POSITION; DEFAULT SETTINGS; RETURN. 480p runs `SwitchProgressiveVideo`, `verify_video_dtv` / `monitor_acceptance` / `switch_safeguard` with `_721`-`_723` | `logs/parity/runs/presets_explore/s13..s15, final.png`; `dlgOptions_Video.rdr` (13,736 B); UIMnLOC `_703`, `_710`-`_723` |
| O6 | SCREEN ADJUST (`dlgScreenAdjust.rdr`, 5,712 B): d-pad runs `screen_up/left/right/down`; CROSS `leave_screen_save`, TRIANGLE `leave_screen_no_save` (discard popup); valves `SaveScreenOriginX/Y`, `ScreenOriginX/Y`; `SuspendMenuInput 2.0`. `UISetScreenOrigin` (`FUN_0027bf10` D:L125263-125277) sets `DAT_004a4508 = ScreenOriginX - 0x80`, `DAT_004a450c = ScreenOriginY - 0x80`, +0x12 on Y when `DAT_004a44f4 == 2` (DTV) | rdr; decomp |
| O7 | `UISwitchProgressiveVideo` / `UICheckVideoMode` compare with "NTSC" (0x3ef140) / "DTV" (0x3ef148) and set `DAT_004a44f4` (2 = DTV) | `FUN_0027bf90`, `FUN_0027c070` (D:L125280-125330) |
| O8 | CONTROLLER OPTIONS (`dlgControllerSelection.rdr`, 18,176 B): VIBRATION; AIM ASSIST (`AutoAim`; `NoAutoAim` disables); PITCH NORMAL/INVERT; FIRE RATE SELECT/L3; PRESETS CUSTOM/RECRUIT/SAILOR/SEAL (`StickPresetCustom/Trainee/Soldier/Seal`); LOOK SPEED (STICK_SENSITIVITY), ACCELERATION (STICK_INERTIA), DEAD ZONE (STICK_DEADZONE) sliders; DEFAULT SETTINGS; RETURN; TEMP_* copies. **No capture of this screen exists** | rdr; UIMnLOC `_183`-`_216` |
| O9 | `UISetStickPreset` (`FUN_0027b790` D:L125060-125110), when `stick_preset < 3`: STICK_SENSITIVITY = `FUN_002da800(ctl,1)`, STICK_INERTIA = 1 - `ctl+0x2cc`, STICK_DEADZONE = `FUN_002da7a0(ctl,1)` - 0.02, from `DAT_0044f108` | decomp |
| O10 | CONTROLLER PRESETS: "1 - Precision Shooter", "2 - Lefty", "3 - Scout", "4 - Sure Shot"; LEFT/RIGHT pages; "X SELECT / (triangle) BACK"; "N - ... preset has been selected". `UIStoreOptions` maps `SelectedControllerConfig` 4/3/2/1/other to "Goldeneye"/"Config4"/"Reverse"/"Default"/"Default" via `FUN_002c5d60`. `controller.rdr` has 4 ControllerConfigs (14/14/15/14 mappings); pictures ContPic1-4 (`op_controller.tif`, `UIOP_TXR.ZED`) | `runs/presets_explore/s09, s10`; UIMnLOC `_154`-`_182`; D:L125240-125255; strings 0x3ef0f8..0x3ef110 |
| O11 | `UIStoreOptions` (`FUN_0027b960` D:L125113-125262) applies STEREO_CONTROLLER (0 -> `FUN_00340480(1)`, 2 -> `(0)`, 1 -> `()`, arguments lost in the decomp), INVERT_PITCH (`DAT_003df198` +-1.0), FIREMODESWAP (`DAT_0044d500` + `FUN_00592050`), AutoAim (`DAT_003df1a0`), VIBRATION (`FUN_00592be0`), SUBTITLE (`FUN_003435b0`), DIALOG (`DAT_003dd4a0`), ORDER_RESPONSE (`DAT_003df1d0`), BOBBING_1ST_PERSON (`DAT_003df190`), EnableExternalWhispers (`FUN_002a41f0`), the stick preset, the controller config, `FUN_00389c60`, the screen origin; it fetches STICK_SWAP_CONTROLLER and video_mode and discards both. `UIInitializeOptions` (`FUN_0027b420` D:L124949-125050) is the reverse read and takes STEREO as 0/1 only | decomp |
| O12 | `UISaveConfig` (`FUN_0027b000` D:L124762-124784): (1) `FUN_003a1c60` deletes `SCRATCHPAD.DAT`; (2) saves the named file (`FUN_003a17e0`); (3) for i = 0..6 creates `SaveGame%d` if missing with "This game is a dummy game."; (4) `FUN_003a1880`: `PATCHFILE.DAT` at 2000 KB if missing, then `SCRATCHPAD.DAT` at (2999 - used KB); a filler is seeked to (n-1)*1024 and gets 1 KB of 0xEE | D:L295995-296080; strings 0x3eeef0, 0x3eef00, 0x3fbd48, 0x3fbd58 |
| O13 | `UIIsSpaceForSaveGameFile` (`FUN_0027b3d0` D:L124931-124941): free KB (`FUN_003a1210`) + KB the save already uses (`FUN_003a1060` D:L295712-295775, files rounded up to 1 KB) must be > 2999 ("At least 3000KB is needed": `_823`, `_826`, `_855`, `_856`) | decomp |
| O14 | `MC_CreateIconFiles` (`FUN_003a0a10` D:L295525-295655) builds `icon.sys` (964 B, "PS2D", the title via `FUN_003a0ee0`, a line break at 0x12, 0x60 at +0xC), names LIST.ICO for all three icons and copies `RUN\ICONS\LIST.ICO` (50,234 B); on failure posts `MEMCARD_ERROR`. The card's icon.sys differs from the disc's `ICON.SYS` from byte 5; LIST.ICO is byte-equal | decomp; cmp of `logs/parity/f0/mc0/...` with `game/disc/RUN/ICONS/` |
| O15 | `PersistentValves.rdr` names 65 valves -- options: STEREO, INVERT_PITCH, VIBRATION, SUBTITLE, DIALOG and ORDER_RESPONSE_CONTROLLER, BOBBING_1ST_PERSON, STICK_SWAP_CONTROLLER, AutoAim, FIREMODESWAP_CONTROLLER, NoAutoAim, SelectedControllerConfig, ChosePresetOnce, HelpWindowsEnabled, stick_preset, video_mode, DISPLAY_MP_TEAM_NAMES, EnableExternalWhispers, VoiceMask, ScreenOriginX/Y, HDD_ENABLE; online: SecurePassword, PLAYERGENDER, GamePlayerFilter, GameSpeedFilter, GamePasswordFilter, FF_FILTER, LockedFilter, GameTypeMapIndex; campaign: GameComplete, incr_miss_*, Set<char> unlocks, MissNNStats. **No volume, brightness or stick slider is in it** | web R96 §5: 4,144 bytes, 65 names, the same on the f0 card and the four fixture cards (`tools_py/card_save.py` `unscramble`/`parse_zar` spawned by `tools/test/dialogInventoryDisc.test.ts`, the names decoded with `parseRdr`; the TS card codec is PLAT-27's -- R7, 2026-10-01: PLAT-27 is dropped and its readers become a dev tool under `tools/`) |
| O16 | `CUIVarManager_Serialize` (`FUN_00385670` D:L279374-279400) writes only UI vars of longevity 3 (`+0x24 == 3`), with a password test (`SecurePassword` / `PLAYERPASSWORD` / `STORE_PASSWORD`); `InitSystemTuners` registers the volume/brightness/stick vars at longevity 2 | decomp; strings 0x3fa480..0x3fa4a0 |
| O17 | Card UI commands: IsMemCardInserted, IsMemCardFormatted, IsSpaceForSaveGameFile, FormatMemCard, DoesSlotHaveGame, IsMemcardSaveOK, GetNumSavedGames, LoadConfig, SaveConfig, MC_ChDir, MC_ChPort, MC_ChSlot, MC_Exists, MC_MkDir, MC_CreateIconFiles, MC_Changed (`MC_ChPort`/`MC_ChSlot` set `DAT_00436480`/`DAT_00436484`; `MC_Changed` writes `mc_changed_slot`) | `game/overlays/all_strings.txt:1123-1266`; `recomp/socom2_names.csv` 0x27b000..0x27e1b0 |
| O18 | `UIMemCardAnim.rdr` (26 animations, 99 names in its name table) names: MainMenuCardSlot(Choice), AskToFormat, AreYouSureYouWantToFormat, do_formatting, MemcardGotFormatted, AreYouSureYouDontWantToFormat, Ensure_MC_Dirs(_Fast), CannotSaveNotFormatted, CannotSaveNoMemcard, KeepTryingMemcardLoad, find_a_memcard, choose_memcard_slot(_cancellable), has_memcard_changed, AcceptNoFormat, memcard_have_loaded_config, memcard_already_selected, MemcardAlreadyHasData, num_memcards; also NoSOCOMDataFound(2), DisplayErrorSaving/Loading, DisplayLoadingWarning, VerifyNoSave, mc_changed_slot. *Corrected by PLAT-06: the scratch string scan (~59,699 B; the set holds 21,662 B under its key) ran into other sets and listed eleven of their names as this set's: DiscoverWhichSlot, TryToFormat, AskToOverwriteSlot (`dlgDebriefing.rdr`), WatchForMemcardRemoval, GetSlotToLoadFrom (`dlgMenu.rdr`), StopMemcardRemovalWatch, EmptySlotSelect (`dlgNetLogin.rdr`), check_formatted (`UIanim.rdr`), memcard_error_spin (`UIHardDiskAnim.rdr`), handle_memcard_error (`dlgIntroScreen.rdr`, `dlgMenu.rdr`), FULL_SLOT (`ShowAndSpin.rdr`)* | web R96 §7 (`tools/dump-dialogs.ts --set 'UIMemCardAnim.rdr'`, the name table through `parseAnimSets`; `--set '.*'` finds the other sets' names); the set's branches are decoded by OPT-05a |
| O19 | Card messages `_823`-`_861` (slot 1/slot 2 variants: insufficient space, Formatting..., Copying system files..., no card, Searching..., Select MEMORY CARD slot, Checking..., Would you like to save..., Saving..., Error saving, Error loading, Loading preferences..., No SOCOM II data, format prompts, not formatted, unsaved data can be lost, New memory card detected, overwrite, cannot save), plus `_509`-`_517`, `_456`, `_607`, `_608`, `_1359`-`_1364`; more spelled literally in the scripts | UIMnLOC; `RUN/UIZANIM.ZAR` literals |
| O20 | Captured save flow (ours): "Would you like to save to the memory card (8MB)...?" YES/NO (YES highlighted) -> "Select MEMORY CARD slot: (triangle) Abort." slot 1/slot 2 -> on a used slot "Overwritten data will be lost..." (NO highlighted) -> one black frame with a small cyan mark -> onward | `D:/socom_archive/parity/s8_save_yes/s00..s05`; `scripts/parity/refs/ref_save_slot_ours.png`, `ref_save_overwrite_ours.png`, `scripts/parity/ref_save_prompt_ours.png`; `scripts/parity/save_empty_card.txt` |
| O21 | ONLINE OPTIONS: PLAYER DESCRIPTION, SETUP MESSAGING (`dlgSetSOP`), SETUP TAUNTS (`dlgSetTaunts`), INPUT FILTERS (`dlgOnlineFilters`), TEAMMATE NAMES, EXTERNAL WHISPERS, SAVE (`_681`), RETURN; LAN OPTIONS has the same rows without description, filters and whispers. SOPs and taunts persist as `MPLOCALSOP1..5` / `MPTAUNTMSG1..5` (64 B each) | `dlgOnlineOptions.rdr` (12,640 B), `dlgLAN_Options.rdr` (8,656 B); UIMnLOC `_673`-`_687`; PC research 80-persona-card-format |
| O22 | The ARMORY's loadout save writes `WeapProfile_%d.dat` (card or HDD) through `SaveCharacterProfile` modes 3/4 (`FUN_0033eb70`/`FUN_0033e7f0`); no example card holds that file | web R95 §4.4, L922-923; string 0x3ee9e0 |

## Tasks

### OPT-01 -- The options save (`SaveConfig`) writes the card exactly as the game does
- **Goal:** leaving OPTIONS, ONLINE OPTIONS or a persona save produces the same 12 files in the same order.
- **What the original does:** O12, O14; `CSaveManager_Save` 0x33dff0 writes zSaveHeader and CSaveModuleList
  {CUIVarManager, CValveSaveManager, CAcctDB}; the SaveGame dummy is a ZAR with zSaveHeader text "This game is a dummy
  game." and a CMission -> MissionData.rdr of 1,432 B (decode of `SaveGame0`). Result: 12 files / 3020 KB (KNOWN
  [card-folder]).
- **Today:** none.
- **Gap:** the writer; zSaveHeader's per-run words (heap pointers and floats, PC research 80) produced as a template
  copy, as the recomp's creator does.
- **Corrected by R7 (the owner, 2026-10-01):** "writes the card exactly as the game does" now means **the same files,
  names, nominal sizes and op sequence** (PLAT-26's trace), **with our contents**: each file's `data` in PLAT-25's
  file table is our JSON (in `BASCUS-97275SOCOMII`: the UI vars, the valves of OPT-02, the personas of OPT-04; the
  dummies, the icons and the fillers carry their nominal sizes and no game bytes). The byte-equal acceptance becomes
  op-sequence-equal; the zSaveHeader template copy, the icon bytes and "each side loads the other's card" go (no image,
  no import or export).
- **Acceptance:** after a scripted "change an option, RETURN, YES", the browser card's file list, sizes and MC op
  sequence equal the recomp trace (PLAT-26); `BASCUS-97275SOCOMII` matches `logs/parity/f0/...` byte for byte except
  zSaveHeader words 3-7; icon.sys and LIST.ICO equal the f0 copies (LIST.ICO read from the disc; nothing committed);
  each side loads the other's card. **Under R7:** after the same script, the slot's file table lists the f0 card's 12
  files with the f0 sizes as nominal sizes, the free figure falls as the recomp's `mcUsedClusters` rule says, and the
  MC op sequence equals the recomp trace (PLAT-26), op for op and result for result; what each file's `data` holds is
  OPT-02's, OPT-03's and OPT-04's to test; the virgin-card first-save failure (KNOWN [virgin-save]) appears as on the
  recomp.
- **Proven by:** PLAT-36 (the MC op sequence). The byte comparison with the f0 card uses an existing artefact and is
  the reading level. *(R7: the reading level is the f0 card's file list and sizes, read once with the dev tool under
  `tools/`; there is no byte comparison.)*
- **Dependencies:** PLAT-25, PLAT-26, OPT-02. **Size:** L (four modules, two fillers, icons, an exact op
  order). *(R7, 2026-10-01: PLAT-27 left this line when R7 dropped it.)*
- **Unknowns:** the dummy's MissionData content (copy the f0 template, or read `CMission` serialize); what
  `FUN_003a1c60`'s vtable+0x10 guard tests before the SCRATCHPAD delete (D:L296104-296127); **which vars this save
  writes at all** -- the longevity rule says the volume, brightness and stick sliders are not written (O16); OPT-03
  validates that before anything is persisted beyond it, and this task writes exactly what O15/O16 name meanwhile.
- **Owner calls:** none.
- **Merged from:** options OPT-04; menus MENU-17.

### OPT-02 -- `PersistentValves.rdr`: decode, encode and the 65 valves
- **Corrected by R7 (the owner, 2026-10-01):** kept as the rule of *what* persists -- the 65 valves, written with
  their defaults where the campaign sets them -- and no longer as a byte codec: the valves are JSON in the
  `BASCUS-97275SOCOMII` file's `data` in PLAT-25's file table (the part the game writes as its 4,144-B
  `CValveSaveManager/PersistentValves.rdr` module; the file keeps its name and nominal size). The title's "decode,
  encode" and the byte-for-byte acceptance below are the pre-R7 task's; the R7 acceptance follows them.
- **Goal:** options persist as the game persists them.
- **What the original does:** O15; `CValveSaveManager` writes NAME/VAL pairs (4,144 B); read back by
  `CValveSaveManager_UnSerialize` 0x352960.
- **Today:** none; s5 valves are in memory only. PLAT-09's store (`packages/ui`, merged) holds the persistent flag.
- **Gap:** the persistent flag in PLAT-09's store, and the codec. *(R7: the codec is the valves' JSON.)*
- **Acceptance:** decode and re-encode the f0, `s16_l1b_step0` and `s16_l1b_step0b` copies byte for byte; after toggling
  each option of OPT-09..OPT-16, the card diff shows the same VAL change as the same toggle in a recomp run. **Under
  R7:** the JSON holds exactly the 65 names the f0, `s16_l1b_step0` and `s16_l1b_step0b` copies hold, with the values
  they hold (read with the dev tool under `tools/`; dev-host); a round trip through the slot keeps every value; after
  toggling each option of OPT-09..OPT-16, the slot's valve JSON shows the same valve change as the same toggle's card
  diff in a recomp run.
- **Proven by:** OPT-19 (the recomp toggles and card diffs).
- **Dependencies:** PLAT-25, PLAT-09. **Size:** M. *(R7, 2026-10-01: it read "PLAT-27, PLAT-09"; the valves' file is
  PLAT-25's record.)*
- **Unknowns:** the VAL encoding and why the file is a fixed 4,144 B -- read the serialize slot after UnSerialize and
  diff two cards. The campaign valves are written with defaults, since the file is whole. *(R7, 2026-10-01: no task
  needs the VAL encoding any more -- the browser writes JSON, and the module's 4,144 B is part of the save file's
  nominal size; the question stays open as research only.)*
- **Owner calls:** none.
- **Merged from:** options OPT-06; platform PLAT-07 (persistent subset).

### OPT-03 -- Which settings persist: the longevity rule and the slider question
- **R7 (the owner, 2026-10-01):** kept as the rule of what persists (the longevity rule); what it persists is written
  as JSON in the card files' `data` (OPT-01, OPT-02), and anything SOCOM Legacy keeps that the original never saved goes
  to the slot's `ext`, never into a file the original has (PLAT-25).
- **Goal:** persist exactly what the original persists, nothing more.
- **What the original does:** O15, O16: the volume, brightness and stick vars are longevity 2 and appear in no saved
  file; longevity-3 vars give the MPLOCALSOP/MPTAUNTMSG children.
- **Today:** none.
- **2026-10-07:** the rule as main applies it with Chris's settings (web research 302 §4): the option valves in the card's `CValveSaveManager` module; the five messages and taunts in its `CUIVarManager` module, and there too the sliders' tuners once a page's slider has been built -- its `UIVAR` spec's `LONGEVITY PERSISTENT` raises them (R104.7) and Serialize writes every longevity-3 variable (`UI_VAR_MODULE_TUNERS_READING`). The run above still settles it.
- **Gap:** the rule, validated before it is implemented.
- **Acceptance:** a recomp run changes MUSIC VOLUME and BRIGHTNESS, saves and relaunches; its card diff and relaunch
  capture (the knob position against `s10_audio_options/s06`) settle whether sliders survive a power cycle; the browser
  does the same.
- **Proven by:** OPT-19 (the save-and-relaunch run).
- **Dependencies:** OPT-01 (it validates the rule OPT-01 writes by). **Size:** S. *(R7, 2026-10-01: it read "PLAT-27,
  OPT-01"; the recomp card diff is read with the dev tool under `tools/`, not a task, and the browser side is OPT-01's
  JSON.)*
- **Unknowns:** **whether volumes, brightness and stick sliders persist at all** -- the source reading says no; settle
  with the run above. No persistence is invented.
- **Owner calls:** none.
- **Merged from:** options OPT-07.

### OPT-04 -- The persona records on the card
- **Goal:** `CAcctDB/AcctInfo.rdr` personas written and read as the game does, with HOST naming our server and the
  `PASSWORD` field holding the server-issued credential of R4, never the typed password. **Corrected by R7 (the owner,
  2026-10-01):** the personas are records in our JSON in the `BASCUS-97275SOCOMII` file's `data` (the part the game
  writes as its `CAcctDB/AcctInfo.rdr` module; PLAT-25's file table), with the
  original's fields and caps; there is no credential in the record; under SAVE PASSWORD: YES the record keeps
  SAVEPASSWORD and the password's **length**, never the password or the remember token (below).
- **What the original does:** one 16-node record per persona: HOST, NAME, TOWN, GENDER, PORT, PASSWORD (plain),
  SAVEPASSWORD, PROFILES; the login form shows the first record; HOST is the resolved address connected to, and personas
  are kept per server; a one-persona file differs from a two-persona file by one appended record (PC research
  80-persona-card-format; KNOWN [persona-headless], [persona-decoded], [personas-per-server]). `SecurePassword` is a
  UI variable, not a transform (PC research 80, "What the examples say"); the serializer tests `SecurePassword` /
  `PLAYERPASSWORD` / `STORE_PASSWORD` (O16).
- **The ruling (the owner, 2026-10-01, R4; the controller's pick) -- replaced by R7 the same day:** the typed account
  password is **never persisted in the browser** (not on the card, not in any other storage); it goes once to our
  server over TLS at account creation or login (SVC-03). The card's `PASSWORD` field holds a **server-issued random
  credential (>= 128 bits)** instead, so a leaked card or export reveals no reusable password; the login form shows it
  **masked, as the original shows the password**; revoking it on the server invalidates it (SVC-03). The record's
  format is unchanged: the credential is a string in the field the game already writes.
- **The ruling now (R7, the owner, 2026-10-01; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md) §2,
  §3, §7):** one record per persona, per HOST, with the original's fields -- HOST, NAME, TOWN, GENDER, PORT, PASSWORD,
  SAVEPASSWORD, PROFILES -- and caps (name 14, password 12), as our JSON. The account is a plain name and password
  entered as the original asks; the password goes to our server over TLS at creation and at login, which keeps an
  argon2id (or scrypt) hash (SVC-03); no credential goes into the record. **SAVE PASSWORD: NO** stores nothing, and
  the password keyboard opens at every login, as on the original. **SAVE PASSWORD: YES -- ruled** (R7's §7 item 5,
  the owner, 2026-10-01: "agreed on cookie"): the server issues a long random **remember token** at that login and
  sets it as an **HttpOnly, Secure, SameSite cookie on the match server's host**, never readable by page script; this
  record keeps **SAVEPASSWORD: YES and the password's length** (for the masked row) and **never the password or the
  token** (SVC-03 owns the token). One accepted deviation: a saved password cannot be edited character by character
  -- the keyboard on that row starts empty (ONL-06). The controller's default, which the owner may overturn: where the
  hosting cannot carry the cookie, YES behaves as NO. *(Superseded the same day: the owner's first pick was the
  password stored in this record **obfuscated** -- a fixed-key reversible scramble, then base64, a risk he accepted;
  he then asked whether the central server let it be handled more safely, and the cookie replaced it.)*
- **Today:** none; the MP name is `s2u.mp.name` (`main.ts:1104`, written at :1114); this task retires that key
  (PLAT-24).
- **Gap:** the records over PLAT-27; the rule for the browser's HOST value; writing the credential the login returned
  (SAVE PASSWORD YES) or none (NO) into `PASSWORD`; never writing the typed password. **Under R7:** the records as
  JSON in the `BASCUS-97275SOCOMII` file's `data` over PLAT-25's file table (the file's nominal size follows the
  original's: 4,784 B with no persona, 6,208 with one, 6,400 with two, PLAT-25); the HOST rule; SAVEPASSWORD as the
  player set it and, under YES, the password's length in place of the password (above); the MP name's migration
  (`migrateOnce`, PLAT-24).
- **Acceptance:** byte-for-byte round trip of `third_party/ps2recomp/ps2xTest/fixtures/cards/{virgin,one,two}.bin` (as
  `test_card_save.py`; CI); a persona created in the browser decodes with `python -m tools_py.card_save` to the same
  fields, its `PASSWORD` equal to the credential the local service issued and unequal to the typed password, and
  `--check-host` passes against our server; a test that greps every IndexedDB and localStorage write of a login for
  the typed password finds none (CI, a local service); copied into a recomp card folder, the recomp shows the persona
  (`PLAYER NAME n glyphs`, KNOWN [persona-headless]). **Under R7 (the byte round trips, the decode by
  `card_save.py`, the credential and the copy into a recomp folder go):** CI, cap and field tests -- a record keeps
  each of the eight fields, NAME cut at 14 and PASSWORD at 12, one record per persona per HOST, a second persona
  appended as the original appends it (the one- and two-persona fixtures' field values, read once with the dev tool
  under `tools/`, as the reference); a login with SAVE PASSWORD: YES leaves a record with SAVEPASSWORD: YES and the
  password's length, and a test that reads every localStorage write of that login finds neither the password nor
  the remember token in it.
- **Dependencies:** PLAT-25, OPT-01, OPT-04a. **Size:** S. **Then:** ONL-06's screens, which draw these records.
  *(R7, 2026-10-01: it read "PLAT-27, OPT-01"; the records are JSON in PLAT-25's file table.)* *([2026-10-02, OT.R6]
  parked until the online path runs; OPT-04a, its path slice, writes the records without the whole options save, and
  ONL-06 draws OPT-04a's records.)*
- **Unknowns:** how the original's login form draws a `PASSWORD` longer than the keyboard's 12-character cap (PLAT-17;
  a base64url credential of 128 bits is 22 characters, within Medius's 32-byte `PASSWORD_MAXLEN`, `Constants.cs:16`)
  -- the form's draw read in `dlgNetPlayerName` (ONL-06), a recomp run on the local stack with such a card (ONL-32);
  what SAVE PASSWORD NO writes in the original (an empty string or no change) -- the same run. *(R7, 2026-10-01: the
  first closes -- no credential, and the password is capped at 12 as the keyboard caps it; the second stays.)*
- **Owner calls:** the plain password on the card -- **ruled** (R4, 2026-10-01): a server-issued credential, never the
  typed password; **the HOST value** the browser writes (the WebSocket host? the Horizon address?) -- still open,
  shared with ONL-06 (OC-3). *(R7, 2026-10-01: R4's ruling here is replaced; **SAVE PASSWORD: YES is ruled** -- a
  remember token in an HttpOnly cookie, the record keeping only SAVEPASSWORD and the length -- after the obfuscated
  record, the owner's first pick, was replaced the same day; OC-3 is still open.)*
- **Merged from:** options OPT-08 (a draft id of the options report, not the roadmap's OPT-08); online front end
  ONL-08; R4's credential design (2026-10-01); R7's account (2026-10-01).

### OPT-04a -- The persona records on the card, without the options save
- **Slice of:** OPT-04 ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): the
  records ONL-06 draws and ONL-07's card-save prompt writes, without OPT-01's options save under them (its twelve
  files, the UI vars, the valves and the original's op sequence).
- **Goal:** the personas written to and read from the `BASCUS-97275SOCOMII` file of the virtual card as OPT-04's R7
  ruling has them: our JSON, the original's fields and caps, never the password or the remember token.
- **What the original does:** from OPT-04: one 16-node record per persona -- HOST, NAME, TOWN, GENDER, PORT, PASSWORD,
  SAVEPASSWORD, PROFILES; the login form shows the first record; HOST is the resolved address connected to, and
  personas are kept per server; a one-persona file differs from a two-persona file by one appended record (PC research
  80-persona-card-format; KNOWN [persona-headless], [persona-decoded], [personas-per-server]); the file's nominal size
  is 4,784 B with no persona, 6,208 with one, 6,400 with two (PLAT-25); caps name 14, password 12 (R7's ruling in
  OPT-04).
- **Today:** none; the MP name is `s2u.mp.name` (`main.ts`; OPT-04's Today). *(2026-10-02: `packages/card/src/persona.ts`,
  pending review; research 135 -- the records, the list per HOST, the nominal size and the save and load over PLAT-26a's
  libmc; the MP name's migration not done, research 135 §6.)*
- **Gap:** OPT-04's R7 gap over PLAT-26a's file commands: the records as JSON in the file's `data`, the file's nominal
  size by persona count, SAVEPASSWORD as the player set it and under YES the password's length, the HOST rule, and the
  MP name's migration (`migrateOnce`, PLAT-24). Not here, owed to OPT-01 (OT.R8: owed, not faked): the original's save
  writes the persona module inside its whole options save -- twelve files in its op order -- while this slice writes
  the one file.
- **Acceptance:** OPT-04's R7 acceptance (CI): a record keeps each of the eight fields, NAME cut at 14 and PASSWORD at
  12, one record per persona per HOST, a second persona appended as the original appends it (the one- and two-persona
  fixtures' field values, read once with the dev tool under `tools/`, as the reference); a login with SAVE PASSWORD:
  YES leaves SAVEPASSWORD: YES and the password's length, and no localStorage write of that login holds the password
  or the remember token; the file's nominal size follows the persona count.
- **Dependencies:** PLAT-25, PLAT-26a. **Size:** S. **Then:** OPT-04 (the records inside OPT-01's save); ONL-06.
- **Unknowns:** OPT-04's second -- what SAVE PASSWORD NO writes in the original (an empty string or no change); what
  the original's save after connect writes besides the persona module on a card that holds no options yet (OPT-01's
  op sequence, PLAT-36).
- **Owner calls:** **OC-3**, the HOST value the browser writes -- open (OPT-04's); OT.R3 has the saved configuration
  name our central server, which is a reading for OC-3, not its ruling.
- **Merged from:** sliced from OPT-04 by OT-0 (2026-10-02, OT.R6).

### OPT-05a -- `UIMemCardAnim.rdr` decoded, the 16 card commands, and the card-state hook
- **Goal:** the card script set decoded, the card UI commands answered over PLAT-26, and a developer hook that puts a
  slot into each state, so OPT-05b..OPT-05h can each be built and tested alone.
- **What the original does:** O13, O17, O18; formatting via `UIFormatMemCard` 0x27e110; errors post `MEMCARD_ERROR` ->
  `handle_memcard_error`; `memcard_error_code` (0x208380) picks the text; `has_memcard_changed` runs at ONSTART of
  dlgMenu, dlgOptions_Menu and dlgOptions_Audio.
- **Today:** none; s5 `uiZanim.ts`/`uiScript.ts` can run the scripts once the host answers the MC commands.
- **Gap:** decode the set with `decodeUiSet`; implement the 16 MC UI commands over PLAT-26; a test-only hook (moved
  here from OPT-07) setting a slot to no card / unformatted / full with foreign saves / a corrupt BASCUS file / removed.
- **Acceptance:** CI: every animation of the set decodes (no unknown command id; dev-disc-only for the decode itself);
  one unit test per MC command whose result codes follow PLAT-26's table on a store built by the hook in each state.
- **R7 (the owner, 2026-10-01):** kept; every card state stays reachable, simulated. The hook sets PLAT-25's slot
  record: no card (`present` false), unformatted (`formatted` false), full with foreign saves (the file table filled
  with nominal files), a corrupt BASCUS file (a record that fails its shape check, or a damaged file entry), removed
  (`present` false mid-run), and the card changed by another tab (the revision moved: ChangedCard).
- **Dependencies:** PLAT-06, PLAT-07, PLAT-16, PLAT-26, OPT-05i. **Size:** M. *([2026-10-02, OT.R6] parked until
  the online path runs; OPT-05i, its path slice, takes the online prompts' animations and commands first.)*
- **Unknowns:** the animations' order and branches (only names known) -- decoded here; the `memcard_error_code` ->
  message table -- the set's branches and `FUN_003a0a10`'s posts.
- **Owner calls:** none (how a player picks a card state is OPT-07).
- **Merged from:** options OPT-09; menus MENU-19. Split from OPT-05 on 2026-10-01 (it was XL).

### OPT-05b -- Card state: no card
- **Goal:** the no-card dialogs where the original shows them.
- **What the original does:** no-card `_826`, `_860`, `_861` (O19); the recomp reaches it with an empty
  `PS2X_MC_DIR_SLOT1` for slot 2.
- **Today:** none. **Gap:** the flow over OPT-05a.
- **Acceptance:** the dialog against its recomp capture with the dialog-text band method (PLAT-30). *(R7, 2026-10-01:
  in the browser, a slot record with `present` false, and both slots when the browser has no storage -- PLAT-25,
  OPT-07.)*
- **Proven by:** OPT-19 (the no-card capture).
- **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** none beyond OPT-05a's. **Owner calls:** none.
- **Merged from:** OPT-05 (split).

### OPT-05c -- Card state: unformatted, the format prompts and progress
- **Goal:** the unformatted notices, the format prompts and "Formatting..." / "Copying system files..." as the original.
- **What the original does:** unformatted `_850`, `_851`, `_858`, `_859`; formatting `_824`, `_825`, `_836`-`_839` via
  `UIFormatMemCard` 0x27e110 (O19); names TryToFormat, AskToFormat, AreYouSureYouWantToFormat, do_formatting,
  MemcardGotFormatted, AreYouSureYouDontWantToFormat, AcceptNoFormat (O18).
- **Today:** none. **Gap:** the flow over OPT-05a.
- **Acceptance:** against PCSX2 captures with a fresh unformatted `.ps2` (the recomp's folder card is always formatted).
  In the browser the state is real: a slot holding an erased image (every page 0xFF, as the project's PCSX2
  `tools/pcsx2/memcards/Mcd002.ps2` is, measured 2026-10-01) is an unformatted card, and FORMAT runs PLAT-37's
  formatter into it. **Corrected by R7 (2026-10-01):** the erased-image route goes (no image; PLAT-37 dropped). In the
  browser the state is a slot record with `formatted` false (set by OPT-05a's hook or OPT-07's control), and FORMAT
  sets `formatted` true and empties the file table (PLAT-25); the PCSX2 captures with an unformatted `.ps2` remain
  the reference for the original's screens.
- **Proven by:** OPT-19 (PCSX2).
- **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** whether "unformatted" can happen in the recomp at all -- PCSX2 settles the original's screens.
- **Owner calls:** none. **Merged from:** OPT-05 (split).

### OPT-05d -- Card state: insufficient space
- **Goal:** the "At least 3000KB is needed" path as the original.
- **What the original does:** O13 (`UIIsSpaceForSaveGameFile`, `_823`, `_826`, `_855`, `_856`).
- **Today:** none. **Gap:** the flow; the free-space rule is PLAT-26's.
- **Acceptance:** a card under 3000 KB free: the dialog against the recomp capture of a folder under 3000 KB free.
  *(R7, 2026-10-01: in the browser, a slot whose file table holds enough nominal files that the virtual 8 MB card's
  free figure is under 3000 KB, by PLAT-25's rule.)*
- **Proven by:** OPT-19. **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** none beyond OPT-05a's. **Owner calls:** none. **Merged from:** OPT-05 (split).

### OPT-05e -- Card state: overwrite
- **Goal:** the overwrite prompt on a used slot as the original.
- **What the original does:** O20: "Overwritten data will be lost..." (NO highlighted); AskToOverwriteSlot,
  MemcardAlreadyHasData (O18).
- **Today:** none. **Gap:** the flow.
- **Acceptance:** against `scripts/parity/refs/ref_save_overwrite_ours.png` and `s8_save_yes` (archived: reading and
  proven at once).
- **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** none. **Owner calls:** none. **Merged from:** OPT-05 (split).

### OPT-05f -- Card state: save and load errors, and a corrupt file
- **Goal:** "Error saving" / "Error loading" and what a damaged save shows, as the original.
- **What the original does:** DisplayErrorSaving/Loading (O18); `_841` "Error loading data" is the candidate for a
  corrupt BASCUS file (O19).
- **Today:** none. **Gap:** the flow.
- **Acceptance:** a damaged BASCUS file and a write refused mid-save: the dialogs against the recomp's captures of the
  same. A browser write refused by PLAT-25's quota check, or interrupted before the slot swap, shows this dialog
  (R4: a clear failure dialog in the original's card-error terms) and leaves the previous image whole. **Corrected by
  R7 (2026-10-01), the browser's cases:** a slot record that does not parse, has an unknown `v` or fails its shape
  check reads as a present card whose save is damaged and shows the original's corrupt-file path ("Error loading
  data", `_841`), never a silent reset; a save whose single `setItem` throws (a `QuotaExceededError`, or storage
  refused), or that finds the slot's revision moved, is refused whole, shows "Error saving" and leaves the previous
  record byte-equal (PLAT-25) -- never a browser alert.
- **Proven by:** OPT-19. **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** what a corrupt BASCUS file shows -- the recomp run. **Owner calls:** none.
- **Merged from:** OPT-05 (split).

### OPT-05g -- Card state: removal and a new card detected
- **Goal:** the removal watch and "New memory card ... detected" as the original.
- **What the original does:** WatchForMemcardRemoval / StopMemcardRemovalWatch, `MC_Changed` -> `mc_changed_slot`,
  "New memory card ... detected. Would you like to load data?" `_853` (O17-O19).
- **Today:** none. **Gap:** the flow.
- **Acceptance:** removing the card while OPTIONS is open gives the dialog sequence of the recomp with its card folder
  renamed mid-run (a capture pair). *(R7, 2026-10-01: in the browser, removal is OPT-07's control setting the slot's
  `present` false mid-run, and a new card is a slot record that changed while it was out; another tab's save reaches
  the game as ChangedCard, PLAT-25.)*
- **Proven by:** OPT-19. **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** none on the original side. **Owner calls:** none. **Merged from:** OPT-05 (split); OPT-07's acceptance.

### OPT-05h -- Card state: slot select (two slots)
- **Goal:** "Select MEMORY CARD slot" at boot and at save, as the original with two cards.
- **What the original does:** PCSX2 with two cards asks "Select MEMORY CARD slot" (`s4_pcsx2/A_00_boot.png`,
  `A_01.png`); O20's "Select MEMORY CARD slot: (triangle) Abort."; DiscoverWhichSlot, MainMenuCardSlot(Choice),
  choose_memcard_slot(_cancellable), EmptySlotSelect (O18).
- **Today:** none. **Gap:** the flow.
- **Acceptance:** against `A_00_boot.png`, `A_01.png` and `scripts/parity/refs/ref_save_slot_ours.png` (archived);
  the recomp's two-slot boot prompt (`PS2X_MC_DIR_SLOT1`) for the proven level.
- **Proven by:** OPT-19 (the recomp two-slot prompt). **Dependencies:** OPT-05a. **Size:** S.
- **Unknowns:** the slot-select condition (believed two cards present; `num_memcards`) -- OPT-05a's decode.
- **Owner calls:** none: two slots are ruled (R4, 2026-10-01; OPT-07; kept by R7, which replaced R4 the same day).
  **Merged from:** OPT-05 (split); BOOT-05's unknown.

### OPT-05i -- The card prompts of the online entry and the persona save (a slice of OPT-05a)
- **Slice of:** OPT-05a ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): the
  animations of `UIMemCardAnim.rdr` the online path runs and the card UI commands they dispatch -- the slot select
  ONLINE opens (`A_30`, if it is this set's: ONL-01's unknown) and the "save to the memory card?" prompt after connect
  (`A_42`, ONL-07), with the slot select a save asks (OPT-05h's flow at these two places) -- on a present, formatted
  card; without the card-state hook and the other states' branches (OPT-05a, OPT-05b..OPT-05h). The id is the next
  letter of OPT-05's split, the scheme allowing one letter.
- **Goal:** the card prompts the online path meets run from the card script set as the original runs them.
- **What the original does:** O17 (the 16 card UI commands); O18 (the set's 26 animations and its names:
  MainMenuCardSlot(Choice), choose_memcard_slot(_cancellable), find_a_memcard, Ensure_MC_Dirs(_Fast), num_memcards,
  DisplayErrorSaving, ...); O19 (the card messages `_823`-`_861`); O20 (the captured save flow: "Would you like to save
  to the memory card (8MB)...?" YES/NO, YES highlighted, then "Select MEMORY CARD slot: (triangle) Abort."); N4 of the
  online segment (`A_30`, `A_42`).
- **Today:** (2026-10-03, pending review; web research 143) the walk from the three entries the online dialogs run
  (`UIanim.rdr` `intro_onstart` for `A_30`, `dlgNetPlayerName.rdr` `memcard_operations` for `A_42`,
  `has_memcard_changed`) reaches 26 animations, 23 of `UIMemCardAnim.rdr`, decoded with `decodeUiSet` with no unknown
  command (`tools/cardPromptCommands.ts`, pinned); each is on the path or owed to OPT-05b..OPT-05g (or MENU-01 for the
  progressive-scan pair), `CARD_PROMPT_ANIMATIONS`; the five card rows they dispatch that MENU-01a left --
  IsSpaceForSaveGameFile, IsMemcardSaveOK, LoadConfig, SaveConfig, MC_CreateIconFiles -- are transcribed over PLAT-26a's
  libmc (`packages/ui/src/screens/cardCommands.ts`; the first save on an empty card leaves the f0 card's twelve files at
  their sizes); FormatMemCard stays declared (OPT-05c); the captions' ids are pinned (`CARD_PROMPT_CAPTIONS`). Not yet
  registered on the page (`packages/viewer/src/menuCommandsHost.ts`); the frames stay ONL-01's and ONL-07's.
- **Gap:** decode with `decodeUiSet` the animations the online dialogs start for those prompts (named in
  `dlgMPswitch`'s, `dlgNetLogin`'s and `dlgNetConnect`'s sets) and those they call, and answer the MC UI commands they
  dispatch over PLAT-26a. A branch into a parked card state (no card, unformatted, full, corrupt, removed) is reported
  as owed to OPT-05a..OPT-05h, never answered as if the card were well (OT.R8).
- **Acceptance:** CI: each animation of the list decodes (no unknown command id; the decode itself dev-disc-only); a
  unit test per MC command they dispatch whose result codes follow PLAT-26a's table on a store built in the test; the
  prompts' captions are the set's ids, as named. The frames are ONL-01's and ONL-07's scores (`A_30`, `A_42`).
- **Proven by:** OPT-19 (the recomp's two-slot prompt, OPT-05h's); ONL-32 (the online save).
- **Dependencies:** PLAT-06, PLAT-07, PLAT-16, PLAT-26a. **Size:** M. **Then:** OPT-05a (the whole set, the hook,
  the other states).
- **Unknowns:** which animations the online prompts start -- the three online dialogs' sets (ONL-33's chapter, or read
  here); whether `A_30` is this set's popup or `dlgMPswitch`'s own (ONL-01's); the slot-select condition
  (`num_memcards`; OPT-05h's).
- **Owner calls:** none.
- **Merged from:** sliced from OPT-05a by OT-0 (2026-10-02, OT.R6).

### OPT-06 -- Memory-card timing: dialog durations and op latency
- **Goal:** "Checking...", "Saving...", "Formatting..." stay up as long as on the console.
- **What the original does:** script waits (`SuspendMenuInput 1.75`, `2.0`); `s8_save_yes` shows one black frame with a
  cyan mark between slot choice and the next screen (O20); ours performs MC ops synchronously against the host disk;
  PCSX2 emulates card timing.
- **Today:** none.
- **Gap:** a latency model per MC op (per KB written).
- **Acceptance:** frame-timed bursts (>= 5 fps) of the same options save on PCSX2 and the browser: each dialog's
  duration within one capture interval of PCSX2's.
- **Proven by:** OPT-19 (the PCSX2 timing bursts).
- **Dependencies:** OPT-05a. **Size:** M (mostly measurement).
- **Unknowns:** real card write and format speeds -- a PCSX2 burst of an options save and of a format; whether PCSX2's
  timing is faithful to hardware -- a console capture (the owner has the console; PC research 79's speed run is the
  precedent).
- **Owner calls:** match PCSX2's timing or the recomp's (instant).
- **Merged from:** options OPT-10.

### OPT-07 -- Managing the simulated card outside the game (insert, remove, format)
- **Goal:** the player, and the tests, can put the card into each state the original handles.
- **What the original does:** on hardware the player removes or inserts cards; the game watches
  (`WatchForMemcardRemoval`, `MC_Changed` -> `mc_changed_slot`, "New memory card ... detected. Would you like to load
  data?" `_853`).
- **Today:** none.
- **Gap:** a player-facing control outside the game frame, over OPT-05a's state hook (the developer hook moved there).
  *(R7, 2026-10-01: the control acts on PLAT-25's slot record -- insert and remove set `present`, format sets
  `formatted` and empties the file table.)*
- **Acceptance:** each control action produces the state OPT-05a's hook produces (a unit test per action); the removal
  sequence is OPT-05g's capture pair.
- **Dependencies:** PLAT-25, OPT-05a. **Size:** M.
- **Unknowns:** none on the original side.
- **Owner calls:** **two slots -- ruled** (R4, 2026-10-01; the recomp gives one by default; PCSX2 and the console have
  two). Still open: whether players get an insert/remove/format control at all, or only the developer hook; how a user
  picks "no card" / "unformatted" (an erased image is one way, OPT-05c); what a browser without storage (a private
  window, IndexedDB refused) reads as. **R7 (2026-10-01):** two slots stand (kept by R7); "an erased image" goes (no
  image: `present` and `formatted` are the record's fields); **what a browser without storage reads as is closed:**
  a private window or localStorage refused reads as **no card** in both slots (OPT-05b), the original's own words for
  a missing card -- the controller's default under R7; the owner may overturn it. Still open: a player-facing control
  or only the developer hook.
- **Merged from:** options OPT-11; the menus researcher's call on picking a card state (folded into the owner calls
  above; it had no id of its own).

### OPT-08 -- (dropped) Card interop: export and import
- **Dropped:** by R7 (the owner, 2026-10-01; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md) §1
  item 3, §4): no export and no import of any kind, no `.ps2` images, no PCSX2 interop; a slot's data lives only in
  that browser's localStorage, and nothing goes to LATER.md. Never built (it was sprint 15's). The MENU tasks whose
  proven level used an imported owner card (MENU-04; the future-scope MENU-13) use a slot record built in the test
  instead. A later one-way importer of a real PCSX2 save would need only the card codec's readers, kept as a dev tool
  under `tools/` (R7's §7 item 1); it is no task. The id is kept (README conventions); the block below is as it was.
- **Goal:** move a browser card to PCSX2 and the desktop recompilation and back: a slot's raw `.ps2` image exported and
  imported as is (R4), and the save folder for the recompilation.
- **What the original does:** the recomp's card is the folder `cards/<profile>/BASCUS-97275SOCOMII/...` (KNOWN
  [persona-headless], [virgin-save]); PCSX2 uses `.ps2` images (`mymcplus` reads them); the slot's own format is the
  `.ps2` image (PLAT-25, PLAT-37), so a PCSX2 card is imported without conversion.
- **The ruling (R4, 2026-10-01):** import and export of real PCSX2 cards is in scope (the reason the slot is a raw
  `.ps2` image). **The export dialog warns that a card holds the account credential** (OPT-04): whoever has the file
  can log in as that persona until the credential is revoked on the server (SVC-03).
- **Today:** none.
- **Gap:** export: the slot's image as a `.ps2` file (with ECC, 8,650,752 B), and the `BASCUS-97275SOCOMII` folder as a
  zip for the recomp; import: a `.ps2` with or without ECC (8,650,752 or 8,388,608 B; PLAT-25) checked by PLAT-37's
  superblock read before it replaces a slot, and the recomp's folder zip written into a slot through PLAT-37; the
  warning before every export.
- **Acceptance:** a browser-written card, exported as `.ps2`, opens in `mymcplus` (`dir` lists the folder with the same
  sizes) and boots in PCSX2 to the login form with the persona (an owner-hand check); exported as a folder into a recomp
  home, it boots the recomp to the login form with the persona (KNOWN [persona-headless]'s method) and to the same main
  menu (LOAD GAME present, same options); the owner's PCSX2 card imported (a copy of `tools/pcsx2/memcards/Mcd001.ps2`,
  dev-host-only) lists the same tree as `mymcplus`; a recomp card imported shows the same OPTIONS state; a file that is
  not a card image is refused with no slot changed; the export warning shown before every export (a unit test).
- **Dependencies (if reopened):** PLAT-25, PLAT-26, PLAT-27, PLAT-37, OPT-01. **Size:** M.
- **Unknowns:** none.
- **Owner calls:** **ruled** (R4): `.ps2` import and export, real card images included. Still open: the warning's
  wording (new text: the original has no export).
- **Merged from:** options OPT-24; menus MENU-18 (b, c); boot BOOT-10 (import call); platform PLAT-17 (export check);
  R4 (2026-10-01).

### OPT-09 -- The OPTIONS screen (`dlgOptions_Menu`)
- **Goal:** the OPTIONS screen faithful in pixels and behaviour.
- **What the original does:** O1, O2; info lines `_705`-`_709`; the HDD line "or (left/right) Enable or disable loading
  from the HDD." (capture s09); RETURN runs `check_then_save_and_leave` -> `save_and_leave` (SaveConfig) when
  `OptionsMenuChanged` is set (`ShouldLeaveOnSaveAndLeave`, `OptionsHaveNotChanged`); ONACTIVATE handlers set instText
  (`OnAudioAct`...).
- **Today:** none.
- **2026-10-07:** unparked by Chris's settings (web research 302 §4): the main menu's OPTIONS runs `CallOptions` (MENU-03's hook unregistered); AUDIO, VIDEO and CONTROLLER OPTIONS open, RETURN runs `check_then_save_and_leave` (`StoreOptions`, the save), TRIANGLE `Triangle_Back`; CONTROLLER PRESETS and the HDD row stay OT.R8-parked (`OPTIONS_PARKED_ROWS`).
- **Gap:** the screen, its scripts and the commands they call (InitOptions, StoreOptions, SaveConfig, MC_*,
  HardDriveOperation, SWITCHMENU).
- **Acceptance:** frame comparison with `logs/parity/runs/options_explore/s04..s11` and
  `D:/socom_archive/parity/s10_audio_options/s05_CROSS.png` at >= 90; the triangle popup and the leave-with-changes
  save prompt against `ref_save_prompt_ours.png` and owed captures; the card after "change, RETURN" equals OPT-01's
  expectation.
- **Proven by:** OPT-19 (the triangle popup and the RETURN save flow).
- **Dependencies:** PLAT-15, PLAT-10, MENU-01, PLAT-16, OPT-01. **Size:** M. **Then:** OPT-16 (the HDD row).
- **Unknowns:** whether RETURN saves without asking when options changed, or asks first -- decode
  `check_then_save_and_leave` and a capture.
- **Owner calls:** none (the HDD row is OPT-16).
- **Merged from:** options OPT-12; menus MENU-12.

### OPT-10 -- AUDIO OPTIONS, and what each setting does to the mix
- **Goal:** the screen 1:1, and each control driving the bus the original drives.
- **What the original does:** O3, O4, O11; TEMP_* copy/revert via CopyUiVar; `do_audio_default`; cues `SND_VO_OPDV`,
  `SND_HS_OPDV`, `.SFX_VOL_SLIDER`; stereo/mono/DPL II via STEREO_CONTROLLER into `FUN_00340480`; the music bus's
  square-law group stage (KNOWN [989snd-decomp], `554972e`); tuner update `CMusicTuner_UpdateUIVar` 0x38a040,
  `CDialogTuner_UpdateUIVar` 0x389dc0.
- **Today:** `viewer/src/audio.ts:44-46` one master gain with `LISTENING_GAIN_PLACEHOLDER` (+12 dB, marked as not the
  game's); no music/sfx/dialog groups.
- **2026-10-07:** MUSIC, SOUND and DIALOG volume, DEFAULT SETTINGS and the discard (`CopyUIVar`) unparked by Chris's settings (web research 302 §4): the group masters read at each play (PF-32), the menus' music live; HEADSET VOLUME and SOUND (mono / stereo / Dolby Pro Logic II) stay OT.R8-parked.
- **Gap:** group gains for music, sound, dialog; a mono downmix; the headset gain for voice playback; slider step; the
  screen.
- **Acceptance:** frames against `s10_audio_options/s06..s22` including knob positions after each LEFT
  (`scripts/parity/audio_options_explore.txt`); an audio A/B against the recomp of the same menu sound and music stem at
  two slider settings (KNOWN [989snd-decomp]'s method) within the audio-parity tolerance; a music-only capture after
  zeroing SOUND and DIALOG; mono: L and R of a captured stem equal.
- **Proven by:** PLAT-36 (the audio A/B runs).
- **Dependencies:** OPT-02, OPT-03, OPT-09, PLAT-15, PLAT-22, the sound package's group model (web research 81).
  **Size:** L. **Then:** the voice playback volume. *([2026-10-07, OT.R39] SVC-22 no longer waits on this task:
  sprint 20's voice plays at the original's default (`HEADSET_VOLUME_DEFAULT`, 0.75, x 100 = 75, R170.12) until this
  task's HEADSET VOLUME slider exists; when it is built, it wires the slider's value to the voice playback in place of
  that default.)*
- **Unknowns:** slider step and range (rdr `NUM_INTERVALS` 2 does not fit the captures) -- read `CUISliderBar` and the
  tuners' UpdateUIVar; the volume curve from slider value to gain (StoreOptions D:L125111 and the 989snd volume path);
  what `FUN_00340480` does per mode and whether 989snd encodes DPL II into the stereo mix (PC research 36; Ziemas
  989snd); what HEADSET VOLUME scales (`CHeadsetTuner`; PC research 39).
- **Owner calls:** **MENU-OC-7** -- Dolby Pro Logic II (representable if the mix encodes the matrix) and HEADSET VOLUME
  (needs the voice system, SVC-20b): implement, or PLAT-28's screen.
- **Merged from:** options OPT-13; menus MENU-13.

### OPT-11 -- VIDEO OPTIONS
- **Goal:** the screen 1:1, with each row's effect where a browser can have it.
- **What the original does:** O5, O7, O11; BRIGHTNESS through `CBrightnessTuner` (default 0.5; vtable
  `PTR_PTR_00408040`); TEAMMATE NAMES = `DISPLAY_MP_TEAM_NAMES` (feeds the MP HUD, web research 87); HELP WINDOWS =
  `HelpWindowsEnabled` (campaign pop-ups, e.g. `ref_popup_prompt_ours.png`); HEAD BOB = `BOBBING_1ST_PERSON` ->
  `DAT_003df190`; SCREEN POSITION -> OPT-12; SUBTITLE_CONTROLLER.
- **Today:** none; no brightness stage in the renderer.
- **2026-10-07:** HEAD BOB, DEFAULT SETTINGS and the discard unparked by Chris's settings (web research 302 §4): `BOBBING_1ST_PERSON` on the front-end match's first-person bob; BRIGHTNESS, TEAMMATE NAMES, VIDEO MODE, HELP WINDOWS and SCREEN POSITION stay OT.R8-parked.
- **2026-10-23:** BRIGHTNESS unparked: `CBrightnessTuner`'s pass read (web research 358, reading) and
  drawn by `packages/viewer/src/brightness.ts` on the game's screens; the captures (OPT-19) stay owed.
- **Gap:** the screen; the team-name toggle into the HUD; HEAD BOB driving first person's bob
  (`BOBBING_FIRSTPERSON`, a vertical screen shift of 6 x cos(phase) PS2 pixels in first person, web research 83 L23),
  first person being back (MATCH-04).
- **Acceptance:** frames against `logs/parity/runs/presets_explore/s13..s15` and `final.png`; a recomp capture of a
  fixed scene at brightness 0, 0.5 and 1 against the browser's same scene, compared on luminance histograms.
- **Proven by:** OPT-19 (the brightness captures).
- **Dependencies:** OPT-02, OPT-09; the HUD. **Size:** M. **Then:** OPT-12 (screen position), OPT-17 (the 480p
  hook).
- **Unknowns:** none for BRIGHTNESS's rule (a post pass, web research 358); its COLCLAMP state at brightness 1
  (research 358 §7).
- **Owner calls:** **MENU-OC-8** -- VIDEO MODE / 480p: PLAT-28's screen or a no-op toggle (OPT-17). HEAD BOB is no
  longer against a ruling: the owner restored first person on 2026-10-01 (R5, overturning W5.R5's "no first person"),
  so the row is live and acts on MATCH-04's first person. HELP WINDOWS has no effect without the campaign: keep the row
  and persist it (it is in PersistentValves).
- **Merged from:** options OPT-14; menus MENU-14.

### OPT-12 -- SCREEN ADJUST (screen position)
- **Goal:** the screen-position page and the image shift it produces.
- **What the original does:** O6; the origin is persisted (O15).
- **Today:** none.
- **2026-10-07:** stays OT.R8-parked with Chris's settings (web research 302 §4): VIDEO OPTIONS' SCREEN POSITION starts nothing.
- **Gap:** the page and an offset of the 640x448 frame inside the canvas.
- **Acceptance:** captures of the page and of the main menu after 5 RIGHT and 5 DOWN presses, recomp vs browser,
  comparing the frame-edge offset in pixels.
- **Proven by:** OPT-19.
- **Dependencies:** OPT-11, OPT-02. **Size:** S.
- **Unknowns:** pixels per press and the clamp range -- read the `screen_*` animations and where `DAT_004a4508` reaches
  the GS display registers (decomp xrefs).
- **Owner calls:** whether a canvas shift counts as "the same behaviour" (proposed: yes, it moves the picture as the
  console does).
- **Merged from:** options OPT-15; menus MENU-14 (screen adjust).

### OPT-13 -- CONTROLLER OPTIONS
- **Goal:** the screen 1:1 and each control's effect on our input model.
- **What the original does:** O8, O9, O11 (vibration `FUN_00592be0`; aim assist `DAT_003df1a0`, disabled online via
  `NoAutoAim`; pitch sign `DAT_003df198`; fire-rate swap `FUN_00592050`; presets via `SetStickPreset`; three sliders
  through the stick tuners, two sets); `Initialize_Controller_Options_Stuff`, `do_controller_default`, AutoAim
  0x27a510.
- **Today:** `viewer/src/ui.ts:699-729` has its own mouse sensitivity, invert pitch and pitch ratio (localStorage at
  `ui.ts:995-1005`); `gamepad.ts`, `look.ts`.
- **2026-10-07:** PITCH (`INVERT_PITCH_CONTROLLER`) and FIRE RATE (`FIREMODESWAP_CONTROLLER`, L3 / SELECT), DEFAULT SETTINGS and the discard unparked by Chris's settings (web research 302 §4), applied in the front-end match; VIBRATION, AIM ASSIST, PRESETS and the three stick sliders stay OT.R8-parked.
- **2026-10-22 (OT.R72):** the owner unparks the whole screen -- every row works as the original's, at its ranges; LATER 315-321 (issues #447-#453), the console / front-end seat's after LATER 305.
- **Gap:** the screen; LOOK SPEED, ACCELERATION and DEAD ZONE mapped onto the look model (web research 83).
- **Acceptance:** the owed captures (OPT-19) compared per row; for each preset a turn-rate trace (degrees per second at
  full deflection) from the recomp (`PS2X_HOST_GAMEPAD`) against the browser.
- **Proven by:** OPT-19 (the captures); PLAT-36 (the `PS2X_HOST_GAMEPAD` turn-rate traces).
- **Dependencies:** OPT-02, OPT-03, OPT-09; web research 83's look model. **Size:** L.
- **Unknowns:** the RECRUIT/SAILOR/SEAL values (`FUN_002da800`/`FUN_002da7a0` and field 0x2cc per preset); which tuner
  set is used when; what vibration events exist.
- **Owner calls:** **MENU-OC-9** -- VIBRATION (Gamepad rumble exists in some browsers only): keep it, no-op where
  unsupported, or PLAT-28's screen; how the stick sliders apply to a mouse.
- **Merged from:** options OPT-16; menus MENU-15.

### OPT-14 -- CONTROLLER PRESETS
- **Goal:** the four preset pages and the selection, 1:1.
- **What the original does:** O10; `ChosePresetOnce` persisted; SetControllerConfig 0x27fb40.
- **Today:** `viewer/src/controlsList.ts` (its own key list, tab remembered in localStorage).
- **2026-10-07:** stays OT.R8-parked with Chris's settings (web research 302 §4): OPTIONS' CONTROLLER PRESETS starts nothing.
- **2026-10-18T17:25Z:** reviewed and rendered, to land (`agent/opt-14`): the fresh simulation-track review PASS WITH
  FINDINGS, high -- every reading re-read at the source and matching (the decompilation's lines, the disc's dialog
  scripts, `controller.rdr`'s four configs entry by entry, the boot order), so web research 344's values are
  **reading**; its three lows folded (F1: only the page's own front end binds the controller configs, RED then the
  fix; F2, F3 the note's words). Rendered, the data env, one browser per spec file: `controllerPresets.spec.ts` 1
  passed (30 s), `originalSettings.spec.ts` 1 passed (4.3 min). What players see: OPTIONS > CONTROLLER PRESETS opens
  the original's four pages (Precision Shooter, Lefty, Scout, Sure Shot, each its pad picture); choosing one remaps the
  pad in the match and is saved to the card; with FIRE RATE on SELECT a non-Default preset keeps its own buttons, as
  the original. Owed: the owner's playtest for the look (#87's closing bar; issue #87 (closed) 2026-10-18 on the owner's word); H241 ("in game"). gamepad.ts's claim
  released.
- **2026-10-18:** built (`agent/opt-14`), review pending (issue #87 (closed); web research 344, reading, pending review): the row
  unparked, `dlgControllerPresets.rdr` run by the front end's own runtime (the four pages, LEFT / RIGHT in a ring, CROSS
  chooses, TRIANGLE back to OPTIONS), `SetControllerConfig` (`FUN_0027fb40` -> `FUN_002c5d60`) and `UIStoreOptions`' table
  on the page's controller config, `controller.rdr`'s four configs as the pad's map (`viewer/src/controllerConfigs.ts`,
  `gamepad.ts`), the fire-rate swap on the active config (research 344 R344.8); page -> config settled (1 Default, 2 Reverse,
  3 Config4, 4 Goldeneye). In a round: H241 (the owner's). The captures (OPT-19) and the input trace (PLAT-36) stay owed.
- **Gap:** the pages (diagram art from the UI libraries) and the button layout each preset applies.
- **Acceptance:** frames against `runs/presets_explore/s09`, `s10` (pages 3 and 4 owed, OPT-19;
  `scripts/parity/presets_explore.txt` on both targets >= 90 per capture); for each preset, the action each pad button
  fires equals the recomp's (a button-to-action table from a `PS2X_HOST_GAMEPAD` input trace).
- **Proven by:** OPT-19 (pages 3 and 4); PLAT-36 (the input trace).
- **Dependencies:** OPT-02, OPT-09; the input layer (PLAT-11). **Size:** M.
- **Unknowns:** which display preset maps to which internal config (values 1..4 vs Default/Reverse/Config4/Goldeneye)
  -- read `FUN_002c5d60`'s tables and the dlgControllerPresets handlers; the diagram images' texture names.
- **Owner calls:** how a preset applies to keyboard and mouse (the original defines pad layouts only).
- **Merged from:** options OPT-17; menus MENU-16.

### OPT-15 -- ONLINE OPTIONS and LAN OPTIONS, SOPs and taunts (screens and persistence)
- **Goal:** the rows, the SAVE and the card writes 1:1; the in-round use of SOPs and taunts is SVC-19.
- **What the original does:** O21; SAVE via `ForceSaveAct` -> SaveConfig; `dlgSetSOP` (5 messages; no script set found),
  `dlgSetTaunts` (5 taunts); filters and whispers as valves (O15).
- **Today:** every row of `dlgOnlineOptions` runs from the disc's scripts (web research 265 §1): PLAYER DESCRIPTION's
  keyboard and `SetPlayerDescription` to the services' owner-fields operation (the record's +0x9f only, mounted
  in `createServices`), INPUT FILTERS to `dlgOnlineFilters` (ONL-15's page), the TEAMMATE NAMES and
  EXTERNAL WHISPERS strips on their valves, SETUP MESSAGING, SETUP TAUNTS, SAVE and RETURN; the SOPs and taunts after
  SAVE equal `s16_l1b_step0b`'s (dev host). Reading, reviewed 2026-10-10; the in-round effects SVC-19's / the HUD's.
- **2026-10-07:** SETUP TAUNTS and the save unparked with the taunts (2026-10-07); the other rows stayed OT.R8-parked, owed to OPT-15 in sprint 22 (web research 301 §6: `ONLINE_OPTIONS_PARKED_ROWS`, the five taunts in the card's `CUIVarManager` module).
- **2026-10-07:** SETUP MESSAGING unparked by Chris's settings (web research 302 §3): `dlgSetSOP` over `MPLOCALSOP1-5`, saved in the card's `CUIVarManager` module, sent by the Chat menu's MESSAGES; PLAYER DESCRIPTION, INPUT FILTERS, TEAMMATE NAMES and EXTERNAL WHISPERS stay OT.R8-parked.
- **2026-10-10:** OPT-15 (web sprint 22, wave 1; `agent/online-opt15`): the four parked rows unparked, `ONLINE_OPTIONS_PARKED_ROWS` empty (web research 265 §1); the description to the record through `/lobby/owner-fields` (W22.R1; the bearer's own record, +0x9f..+0xe0 only, research 169 §4's negative test); the acceptance's SAVE diff against `logs/parity/s16_l1b_step0b` (`tools/test/onlineOptionsSaveDisc.test.ts`); the first write of the SOPs and taunts read from the cards (265 §1.4); `PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER` named. The hometown and the gender are `dlgNetPlayerName`'s, not this dialog's. The owner call (H-next e) followed at its default: the row here, the effect SVC-19's / the HUD's.
- **Gap:** the screens and their persistence.
- **Acceptance:** card diff after SAVE against `logs/parity/s16_l1b_step0b` (which holds the default SOPs and taunts);
  the card bytes round-trip against `card_save.py --keys`; frames against owed recomp captures (OPT-19). *(R7,
  2026-10-01: the browser's card holds JSON, so the diff compares the SOP and taunt values -- the recomp's read with
  `card_save.py --keys` or the dev tool under `tools/` -- and there are no card bytes to round-trip.)*
- **Proven by:** OPT-19.
- **Dependencies:** OPT-01, OPT-02, OPT-03, PLAT-17; ONL-15 (filters behaviour). **Size:** M.
- **Unknowns:** when MPLOCALSOP/MPTAUNTMSG are first written ("once the game has been online") and whether an offline
  SAVE writes them; where PLAYER DESCRIPTION is stored (in the stats blob +0x9f per segment 06 V10, read in SVC-12b; a
  local-stack log).
- **Owner calls:** whether the in-game TEAMMATE NAMES toggle belongs here or in the HUD.
- **Merged from:** options OPT-18; online front end ONL-37.

### OPT-16 -- The HDD row
- **Goal:** the HDD row present, persisted DISABLED, never probing.
- **What the original does:** O1, O2, O15; `UIHardDriveOperation` OPEN / GET_MISSION_DATA / CLOSE; the probe loads
  ATAD/HDD/PFS; at boot `dlgIntroScreen` searches the HDD when `HDD_ENABLE` is set (PC research 77:32-37).
- **Today:** none.
- **Gap:** the row with `HDD_ENABLE` pinned to 0; ENABLED is routed to PLAT-28 by OPT-17, which comes after this row.
- **Acceptance:** frame against `options_explore/s09`; `HDD_ENABLE` is 0 on the card after any session; a card with
  `HDD_ENABLE = 1` -- a slot record built in the test (R7, 2026-10-01: it read "a desktop card ... imported into the
  browser"; there is no import) -- does not trigger the HDD search at boot (BOOT-09).
- **Dependencies:** OPT-02, OPT-09. **Size:** S.
- **Unknowns:** what the recomp's probe returns today (PC research 77:48 says unknown).
- **Owner calls:** **MENU-OC-6** -- confirm the HDD row goes to the desktop-only screen.
- **Merged from:** options OPT-21; menus MENU-OC-6.

### OPT-17 -- Wiring the desktop-only screen into the options
- **Goal:** each browser-impossible option opens PLAT-28's screen at the original's control.
- **What the original does:** at each of these points the original goes where a browser cannot follow: (1) OPTIONS ->
  HDD -> ENABLED (`CheckHDDEnable`, then OPEN probes the drive); (2) AUDIO -> SOUND -> Dolby Pro Logic II (owner call);
  (3) VIDEO -> VIDEO MODE -> PROGRESSIVE SCAN (480p; owner call); (4) CONTROLLER -> VIBRATION (owner call). The network
  configuration GUI hook is ONL-02.
- **Today:** none.
- **Gap:** registering the four hooks with PLAT-28's harness.
- **Acceptance:** PLAT-28's per-hook harness passes for each registered hook (PLAT-28 owns the test; this task names
  the dialog, the control and the press for each).
- **Dependencies:** PLAT-28, OPT-10, OPT-11, OPT-13, OPT-16 (the screens come first; the hooks attach to them).
  **Size:** S.
- **Unknowns:** none.
- **Owner calls:** rows (2)-(4) (MENU-OC-7, -8, -9).
- **Merged from:** options OPT-19 (hooks).

### OPT-18 -- Applying options to the engine (`InitOptions` / `StoreOptions` / `LoadConfig`)
- **Goal:** every persisted option takes effect at boot and on store as O11 and BOOT-05 say.
- **What the original does:** O11 (note the asymmetry: InitOptions reads STEREO as 0/1, StoreOptions handles 0/1/2);
  `LoadConfig`'s AUTOMESSAGES -> `FUN_005e7fb0`.
- **Today:** ad-hoc settings in `ui.ts`, `features.ts`, `online.ts`.
- **Gap:** one options module owning the valves and pushing them to audio, input, HUD and camera; the existing settings
  either map onto it or stay as per-viewer conveniences.
- **Acceptance:** a unit test per valve (value -> engine state); a boot from each fixture card yields the same engine
  state as the recomp (a logged state dump at the menu, recomp vs browser).
- **Proven by:** PLAT-36 (the engine-state PEEK per fixture card).
- **Dependencies:** OPT-02, OPT-10..OPT-14. **Size:** M.
- **Unknowns:** the lost arguments of `FUN_00340480` and what `FUN_00389c60` does -- read the recompiled `.cpp` under
  `recomp/output`, which keeps the register arguments.
- **Owner calls:** whether redotcom's own settings (mouse sensitivity, uniform pitch, the cog panel) stay beside the
  game's options.
- **Merged from:** options OPT-22.

### OPT-19 -- The owed captures for the offline front end: menus, options and the card
- **Goal:** one window of driven runs giving a reference capture for every screen and dialog of segments 03 and 04 that
  no archived capture covers, so each task's proven level is reached without reopening a window.
- **What the original does:** existing: O1, O3, O5, O10, O20, `s4_pcsx2/A_00_boot.png`, `A_01.png`. Missing: CONTROLLER
  OPTIONS (all rows, presets, sliders); CONTROLLER PRESETS pages 3 and 4; SCREEN ADJUST; the OPTIONS triangle popup and
  RETURN save flow; the HDD ENABLED popup; the 480p confirmation; ONLINE OPTIONS, LAN OPTIONS, SETUP MESSAGING, SETUP
  TAUNTS; every card fault dialog (no card, unformatted, format prompts and progress, insufficient space, error saving,
  error loading, new card detected, removal: OPT-05b..OPT-05h); the boot slot prompt on ours with two slots; PCSX2
  timing bursts (OPT-06); the recomp toggles and save-and-relaunch card diffs (OPT-02, OPT-03); the brightness and
  screen-position captures (OPT-11, OPT-12). From segment 03: the main menu's DOWN walk to the end on an empty card and
  on a card with saves (MENU-02); the EXTRAS hub, lists and unlock viewers on both card states (MENU-04, MENU-07); the
  LAN screens if implemented (MENU-08); CROSS on NEW GAME and LOAD GAME (MENU-03, ruled (a): the screens of
  MENU-10..MENU-16 are future scope and need no capture). From the platform: the PCSX2 focus walk and the 60-fps DOWN
  burst (PLAT-11). The traces (`PS2X_MC_TRACE` op sequences and the rest) are PLAT-36's.
- **Today:** n/a.
- **Gap:** driver scripts in the style of `scripts/parity/*_explore.txt`, on the recomp; on PCSX2 only where the recomp
  cannot reach a state (an unformatted card).
- **Acceptance:** the captures exist under `logs/parity/` with manifests (rows in PLAT-31), and the gate scorer
  reproduces each twice at 0.0 distance on its text band.
- **Dependencies:** an owner window (loop lock). **Size:** M (about 15 short driven runs).
- **Unknowns:** none.
- **Owner calls:** the window.
- **Merged from:** options OPT-23.

### OPT-20 -- `WeapProfile_%d.dat`: the ARMORY's loadout on the card
- **Goal:** the ARMORY's stored loadout written to and read from the simulated card as the game writes it, retiring the
  `s2u.armory.v1` localStorage key.
- **What the original does:** O22: the ARMORY's S5 Store (SQUARE, online) runs `CharacterProfile` mode 1 then
  `SaveCharacterProfile` modes 3/4 (web R95 §4.4 L621, L651). `UICharacterProfile` (`FUN_00275770`, D:L121919+; the name
  is a 0.80-confidence derivation in `recomp/socom2_names.csv`) formats the file name from string 0x3ee9e0
  `WeapProfile_%d.dat` with `DAT_0066a4f0` (D:L121955). `FUN_0033eb70` (D:L239592-239635) builds a buffer of 8 + n x
  0x28 bytes, has each registered module serialize into it and hands it to a writer through its vtable (+0x34);
  `FUN_0033e7f0` (D:L239461-239479) polls for the write's end. Web R95's `ARMORY_MEMCARD_SAVE_READING` (L923) records
  that these were not read further and that `_23_StoringChar_MSG` ("not saved to the memory card") is unused. No example
  card holds the file.
- **Today:** the s5 ARMORY keeps the loadout in localStorage under `s2u.armory.v1.<MAP>.<side>` (`armory.ts:34, 97`;
  `ARMORY_PROFILE_KEY_READING`).
- **Gap:** the file's layout, its writer and reader over PLAT-26/PLAT-27, the card-or-HDD branch (HDD is never taken:
  OPT-16), and the key's retirement (PLAT-24 leaves this migration to this task). **Corrected by R7 (2026-10-01):**
  over PLAT-26 alone -- the file `WeapProfile_%d.dat` keeps its name and its nominal size (8 + n x 0x28 bytes, as
  `FUN_0033eb70` builds it) in PLAT-25's file table, and its `data` is our JSON of the loadout; PLAT-27 is dropped.
- **Acceptance:** reading level: unit tests of the layout as read from `FUN_0033eb70` and the module serializers it
  calls, each citing its lines. Proven level: a recomp card after an ARMORY store on the local stack (ONL-32's window)
  compared byte for byte with the browser's card after the same store; the browser card loads the loadout back.
  **Under R7:** the reading level is the record list and the nominal size read from `FUN_0033eb70`, each citing its
  lines; the proven level compares the recomp card's file name, size and the MC op sequence of the store with the
  browser's (and the loadout's values, read from the recomp file with the dev tool under `tools/`), not bytes; the
  browser card loads the loadout back.
- **Proven by:** ONL-32 (the card after an ARMORY store).
- **Dependencies:** PLAT-26a. **Size:** M. *(R7, 2026-10-01: it read "PLAT-26, PLAT-27"; PLAT-27 is dropped.)*
  *([2026-10-02, OT.R6] it read "PLAT-26": the loadout file needs libmc's file commands, PLAT-26a, so that PLAT-34's
  fold on the online path does not wait on the parked PLAT-26.)*
- **Unknowns:** which modules serialize into the profile and their 0x28-byte records -- a decomp read from
  `FUN_0033eb70`'s module list; what `DAT_0066a4f0` numbers (the persona? the slot?) -- a caller read; when the
  game reads the file back (no reader identified) -- a decomp search for the name's other users.
- **Owner calls:** none.
- **Merged from:** the 2026-10-01 revision (O22 had no task).
