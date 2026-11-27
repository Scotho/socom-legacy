# 143 -- The card prompts of the online entry and the persona save (OPT-05i)

Written 2026-10-03 for OPT-05i (`../roadmap/04-options-memory-card.md` "OPT-05i", the online path's slice of OPT-05a;
the plan `../plans/2026-10-02-online-path-target.md`, OT.R6, OT.R8). Sources: the card script set `UIMemCardAnim.rdr`
and the sets that reach it in `RUN/UIZANIM.ZAR`, decoded with `decodeUiSet` (`@s2u/scene`) and listed with ONL-33's
listing (`tools/onlineDialogs.ts`, research 128); `RUN/LOCALE/STATES/UIMNLOC.ZAR` for the captions' message names;
`RUN/ICONS/LIST.ICO`'s size; the retail decompilation `game/analysis/socom2_game.elf.decomp.c` (`D:L<line>`,
`FUN_<addr>`; cited, never pasted) and, where it has no block or drops a branch, the retail ELF's instructions and
data (read with `tools/elfImage.ts`: the vtable at 0x4081f0, the strings); PLAT-26a's libmc (research 134), OPT-04a's
persona file (research 135), MENU-01a's card rows (research 138), BOOT-04's f0 card (research 139 §3). The code is
`packages/ui/src/screens/cardCommands.ts` (the rows and the lists) and `tools/cardPromptCommands.ts` (the walk and its
pin); the tests `packages/ui/test/screens/cardCommands.test.ts` (CI, a card built in the test),
`tools/test/cardPromptCommands.test.ts` (CI) and `tools/test/cardPromptCommandsDisc.test.ts` (dev disc).
Confidence: **reading, pending review** for every transcription; §4 lists the placeholder and the readings.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R143.1 | **The online path enters the card set at three places**: `dlgReturnFromNTGUI2`'s `do_onstart` -> `UIanim.rdr` `intro_onstart` (whose `end_of_screen` calls `load_initial_config`: the slot select of `A_30`, R128.3); `dlgNetPlayerName`'s `memcard_operations`, run by CONNECT's `register_new_account` and by TRIANGLE's `leave_player_name_screen` when `SaveAvailable` is 1 (the "save to the memory card?" prompt of `A_42`); and `has_memcard_changed`, which LOGIN's scripts call. From them the `CALL`s reach **26 animations, 23 of `UIMemCardAnim.rdr`'s 26** (not reached: `NoSOCOMDataFound`, `VerifyNoSave`, `LoadGameOnStart`) -- every one decodes with no unknown command, and so do the set's other three | `tools/test/cardPromptCommands.pinned.json` | §1 |
| R143.2 | **On a present, formatted card the path runs 14 of them; 10 are reached only from a parked card state** and are owed: the four format prompts and `CannotSaveNotFormatted` (OPT-05c), `CannotSaveNoSpace` (OPT-05d), `DisplayErrorLoading` and `DisplayErrorSaving` (OPT-05f), `CannotSaveNoMemcard` (OPT-05b; OPT-05g for a removal), `AskToLoadData` (OPT-05g); two (`SwitchToProgressiveVideo`, `verify_video_dtv`) only with `video_mode` 1 (MENU-01) | `CARD_PROMPT_ANIMATIONS` | §1 |
| R143.3 | **They name 22 spellings of 21 rows**: 10 an earlier task answers (PLAT-10's popup and switch rows; MENU-01a's seven card rows), **5 this task implements** -- IsSpaceForSaveGameFile, IsMemcardSaveOK, LoadConfig, SaveConfig, MC_CreateIconFiles -- and 6 declared: FormatMemCard (OPT-05c: only the unformatted branches dispatch it), ListSavedGames (MENU-13), StoreOptions, CheckVideoMode, SwitchProgressiveVideo (MENU-01), UpdateAcctInfo (ONL-06) | `CARD_PROMPT_COMMANDS` | §1 |
| R143.4 | **The captions are `UIMnLOC` ids, as named**: the slot select #828 `_828_SelectMemCardSlot_MSG` with #510/#511, then #829; the save prompt #831 `_831_WouldLikeSave_MSG` with YES #253 first, then #830 `_830_SelectSlotAbort_MSG` with TRIANGLE; #832/#833 checking, #834/#835 saving, #857 overwrite; on the boot chain #827, #842/#843, #844/#845 (`CARD_PROMPT_CAPTIONS`, held to `UIMnLOC.rdr` on the dev disc). `AskToLoadData` (a new card) shows a 102-character literal, not #853 | the pin; `UIMnLOC.rdr` | §1 |
| R143.5 | **SaveConfig's first run on an empty card leaves the f0 card exactly**: after `Ensure_MC_Dirs` (MkDir, ChDir, the icons, SaveConfig) the folder holds the twelve files at the f0 sizes -- the save file, `icon.sys` 964, `LIST.ICO` 50,234, `SaveGame0..6` 1,952, `PATCHFILE.DAT` 2,048,000 and `SCRATCHPAD.DAT` 944,128 -- the last computed, not copied: `2999 - (2,070 KB + 13 >> 1 + 1)` = 922 KB from `FUN_003a1060` over the 13 entries `./*` lists (its third argument read in the instructions, 0x3a1944-0x3a1958) | `cardCommands.test.ts` | §2 |
| R143.6 | **`IsMemcardSaveOK` (no decompiled block) is the card-state probe into `memcard_error_code`**: its instructions (0x27e120-0x27e194) call `FUN_003a1cf0`, acquire the valve at 0x3ef380 TEMP, store the state through the watchers when it changed and answer `state == 0`. The probe's state is **not reset between its two GetInfo tries** (s1 zeroed once, 0x3a1d1c), and its refused-issue branch (0x3a1d4c, the block the decompiler removed) is unreachable (`sltu v0, zero, v0` before `bgez`) | 0x27e120; 0x3a1cf0 | §2 |
| R143.7 | **`FUN_003a1c60`'s guard (roadmap OPT-01's unknown) is `CMemCardIO::IsOpen`**: vtable +0x10 of the vtable at 0x4081f0 is `FUN_003a04c0` (`lw v0, 4(a0); slt; xori`: the handle at +4 not negative), and the constructor (`FUN_003a22e0`, `FUN_002ca800`) sets the handle to -1 -- so SaveConfig deletes `SCRATCHPAD.DAT` whenever the object holds no file open, which between commands it does unless the last Close was refused: `CMemCardIO::Close` `FUN_003a04d0` posts `MEMCARD_ERROR` on a Close refused at submission and keeps the handle at +4 (D:L295361-295363), and only an accepted Close writes -1 (D:L295367); r0004's twin `r0004:0x003c0a20` is unchanged (masked) | 0x4081f0; D:L296330-296359; D:L295349-295377 | §2 |
| R143.8 | **A save's card failure at completion posts nothing**: `CSaveManager::Save` answers 1 whatever its Open or Write answered (D:L239174-239237; only the in-memory ZAR's failure gives 0), and its Open, Write and Close are the object's own (vtable +8, +0x2c, +0xc, D:L239225-239237), which post `MEMCARD_ERROR` only when libmc refuses the command at submission -- Open (D:L295412-295414), Write (D:L295243-295245), Close (D:L295361-295363) -- and are silent on a failure the command reports at completion; so a full card's SaveConfig is silent -- on the reading that libmc reports a full card at completion, not at submission (libmc's result convention, research 134; `MC_ISSUE_FAILURE_READING`), which no line of the original shows; OPT-05d's capture settles it. The fillers' Open (`FUN_003a1980`) posts on a refusal too, and `MC_CreateIconFiles` posts at every step (§2). `save_and_leave` reaches `DisplayErrorSaving` through `memcard_error`, which those set (OPT-05f's to trace); r0004's twins of the object's Open, Write and Close (`r0004:0x003c0af0`, `0x003c06b0`, `0x003c0a20`) are unchanged (masked) | D:L239141-239245; D:L296036-296077; D:L295525-295655; D:L295226-295442 | §2 |
| R143.9 | **r0004 adds a `PATCHFILE.DAT` / `APACHE00.ZDB` rule at two of these rows, and upper-cases the filler's glob** (R4P-249, 2026-11-24; reading, pending review): `IsSpaceForSaveGameFile` (`r0004:0x0027c520`) issues three or four GetDir -- and, when both names are in the folder and no file is open, a Delete of `PATCHFILE.DAT` -- before GetInfo, and starts its sum at 1 KB when neither is there (the bar 2999 KB, not 3000); `SaveConfig`'s first step (`r0004:0x003c2290`) asks the same two names after the scratch delete and deletes `PATCHFILE.DAT` when both are there and no file is open; the filler step globs `*.ZDB` (`r0004:0x00427ca0`), so a card holding the patch archive gets no `PATCHFILE.DAT` filler | `r0004:0x0027c520`; `r0004:0x003c2290`; `r0004:0x00427ca0` | §2 |

## 1. The walk and the list

`tools/cardPromptCommands.ts` decodes every named set of `RUN/UIZANIM.ZAR` with `decodeUiSet` and walks from the three
entries: a `CALL` is found in the caller's set, else in the one set that defines the name (each callee is defined once
in that archive: the walk throws otherwise; `intro_onstart` also exists in EXTZANIM and MPZANIM, which the front end's
dialogs do not load, research 139 §4). For each animation the pin keeps the bound functions it names (`namedBy`), its
calls, its popups' ids, its ops as lines (names, ids and counts; a literal caption as `<text N>`) and `unknown` -- an op
or condition token outside `ZANIM_COMMAND_NAMES`, or a bound function no row of PLAT-08's table answers: empty for all
26, and for the set's three others (the dev-disc test).

| animation | status | task | why |
|---|---|---|---|
| `UIanim.rdr/intro_onstart` | path | OPT-05i | the boot chain before LOGIN; its activation-2 sequences idle, `end_of_screen` runs (R128.3) |
| `AskToFormat`, `AreYouSureYouWantToFormat`, `AreYouSureYouDontWantToFormat`, `do_formatting` | owed | OPT-05c | unformatted (#846-#851, #836-#839) |
| `Ensure_MC_Dirs` | path | OPT-05i | the first save on a card without the folder |
| `load_initial_config`, `find_a_memcard`, `choose_memcard_slot` | path | OPT-05i | `A_30`; the select only with both slots holding a card (OPT-05h's flow here) |
| `DisplayLoadingWarning`, `Ensure_MC_Dirs_Fast`, `NoSOCOMDataFound2` | path | OPT-05i | the read, or the first visit's "no SOCOM II data" (#844/#845) |
| `CannotSaveNoSpace` | owed | OPT-05d | full |
| `DisplayErrorLoading` | owed | OPT-05f | a load that does not parse |
| `SwitchToProgressiveVideo`, `verify_video_dtv` | video | MENU-01 | `video_mode` 1 |
| `dlgNetPlayerName.rdr/memcard_operations`, `CanWeSavePassword` | path | OPT-05i | `A_42`'s entry; no card -> #607 (its own popup, a parked state) |
| `save_and_leave`, `choose_memcard_slot_cancellable`, `AskToOverwrite` | path | OPT-05i | O20; the overwrite's flow and tests are OPT-05e's |
| `CannotSaveNoMemcard` | owed | OPT-05b | no card (OPT-05g: removed) |
| `DisplayErrorSaving` | owed | OPT-05f | `memcard_error` after the save |
| `CannotSaveNotFormatted` | owed | OPT-05c | `memcard_error_code` 1 |
| `has_memcard_changed` | path | OPT-05i | the 1.5-s poll |
| `AskToLoadData` | owed | OPT-05g | a new card detected |

What "owed" means here (OT.R8): the rows this task implements read the card as it is and answer what the original
answers -- `IsMemcardSaveOK` writes 1, 2 or 6 into `memcard_error_code` when the card is not well, `LoadConfig` posts
`MEMCARD_ERROR` for a file it cannot read -- so the scripts take the parked branch as the original would; that branch's
prompts and their flow are the named task's, not tested here as a flow. `FormatMemCard`, which only those branches
dispatch, stays declared: PLAT-08's typed `not implemented: OPT-05a` outcome (the table's owner; OPT-05c in the list).

The rows (`CARD_PROMPT_COMMANDS`; `cardPromptCommands.test.ts` holds it to the pin: a name with no entry, an entry no
animation names, or a spelling that does not fold to its row fails it):

| status | rows | task |
|---|---|---|
| earlier | PopUpDialog (`POPUPDIALOG`), KillPopUp (`KILLPOPUP`), SwitchMenu (`SWITCHMENU`) | PLAT-10 |
| earlier | IsMemCardInserted, IsMemCardFormatted, MC_ChPort, MC_ChDir, MC_Exists, MC_MkDir, MC_Changed | MENU-01a |
| here | IsSpaceForSaveGameFile, IsMemcardSaveOK, LoadConfig, SaveConfig, MC_CreateIconFiles | OPT-05i |
| declared | FormatMemCard | OPT-05c (the table: OPT-05a) |
| declared | ListSavedGames; StoreOptions, CheckVideoMode, SwitchProgressiveVideo; UpdateAcctInfo | MENU-13; MENU-01; ONL-06 |

## 2. The bodies

Each runs on `CMemCardIO` (0x436460) at the port and slot MENU-01a's `MC_ChPort` set: `MenuCommands.cardIo()` hands
them over and performs the method's opening `sceMcSync(0, discard, discard)`, which consumes a poll `MC_Changed` left in
flight (R138.5). Every libmc command answers through its result, as PLAT-26a's stub does; the "refused issue" branches
are not reached (`MC_ISSUE_FAILURE_READING`, research 138) -- they are where the object's own Open, Write and Close post
`MEMCARD_ERROR` (R143.8), so the port's stub never takes that post.

- **The object's own file** -- the vtable at 0x4081f0: +8 open `FUN_003a05a0`, +0xc close `FUN_003a04d0`, +0x10 is-open
  `FUN_003a04c0`, +0x14 size `FUN_003a04b0`, +0x24 read `FUN_003a0270`, +0x2c write `FUN_003a0160`. Open: the mode's
  bits to libmc's flags (1 read, 2 write, 4 both, 8 create; D:L295395-295404); with 0x10 and 0x08 Delete first, its
  result unread, the size reset (D:L295406-295410); a read mode asks GetDir of the path for one entry and keeps its
  size (D:L295420-295429; a GetDir that finds none leaves the last size). Open, read, write and close set the valve
  `MEMCARD_STATUS_VALVE` (0x3fbc50, TEMP) to 1, 2, 3, 0 and post `MEMCARD_STATUS` (0x3fbc68).
- **IsSpaceForSaveGameFile** `FUN_0027b3d0` (D:L124932-124944; 0x27b3d0-0x27b41c): `FUN_003a1210` -- GetInfo's free
  KB, asked again only while the result is below -9 (D:L295779-295807) -- and below 3001 plus `FUN_003a1060` -- GetDir
  `..` for one entry, then `./*` for 0x14, the sum of `(size + 0x3ff) >> 10` over the non-empty entries, plus half the
  count and one when any was non-empty (D:L295714-295774); true when not below 3000.
- **IsMemcardSaveOK** 0x27e120 (instructions; R143.6): `FUN_003a1cf0` (D:L296128-296172) -- GetInfo up to twice; 2 on a
  result below -9 or a type other than 2, 1 on a format flag of 0, 6 on a result of -5, the state kept across the
  tries -- into `memcard_error_code`; true when 0.
- **LoadConfig** `FUN_0027b0e0` (D:L124789-124813) -> `FUN_003a1730` (D:L295956-295974): `CSaveManager::Load(name,
  0xe)` (`FUN_0033d6d0` D:L238880-239000) reads the file (Open mode 1, its GetDir, Read of the size, Close), re-reads it
  for the header (`FUN_0033d4a0` D:L238830-238877), then opens the module list from memory; 0 posts `MEMCARD_ERROR`,
  else `LOADED_FROM_MEMCARD` (0x3fbd20). Here "opens" is the file read and `CardConfigFile.restore` taking its JSON.
  Then `AUTOMESSAGES` (0x3eef20) acquired TEMPORARY (`FUN_003857c0(.., 0, 1)`); a string equal to `ON` (0x3eee38,
  case-insensitive) gives `FUN_005e7fb0(0)`, another string 1 (the byte `DAT_00650b08`).
- **SaveConfig** `FUN_0027b000` (D:L124762-124786): `FUN_003a1c60` deletes `SCRATCHPAD.DAT` when no file is open
  (R143.7); `FUN_003a17e0` saves the file (`CSaveManager::Save(name, 0xe, 0, "", 0)`: Delete, Open WRONLY|CREAT, one
  Write, Close; R143.8); each of `SaveGame0..6` GetDir does not find is saved by `FUN_003a1ea0` with the dummy text
  (0x3eef00); `FUN_003a1880` (D:L295995-296026): no `*.zdb` -> `PATCHFILE.DAT` of 2000 KB, then `SCRATCHPAD.DAT` of
  `2999 - FUN_003a1060()` KB when above 0, each by `FUN_003a1980` (GetDir; Open 0x202; Seek `(n - 1) * 0x400`; Write
  0x400; Close; an Open refused posts `MEMCARD_ERROR`). R7: the dummies and the fillers carry their sizes and no data;
  the save file's JSON and size are the modules' (`CardConfigFile`; `CONFIG_FILE_PLACEHOLDER` without one).
- **MC_CreateIconFiles** `FUN_0027b190` -> `FUN_003a0a10` (D:L295525-295655): `icon.sys` (0x3fbcc0) Open 0x202, Write
  0x3c4 bytes, Close; `LIST.ICO` (0x3fbc88) Open 0x203 and the disc's `RUN\ICONS\LIST.ICO` (0x3fbcd0) copied a KB at a
  time while the read gives a whole KB -- 49 Writes of 1,024 and one of 58 -- then Close. It posts `MEMCARD_ERROR` and ends at every step: either
  card Open refused or answering below 0 (D:L295576-295582, D:L295607-295613), an `icon.sys` Write or Close refused
  (D:L295586-295593), the disc's `LIST.ICO` failing to open (D:L295600-295601), a `LIST.ICO` Write refused or answering
  below 0 (D:L295616-295630), its final Close refused or answering below 0 (D:L295634-295641); the body answers 0,
  the row 1. R7: no icon bytes. **r0004** (`r0004:0x003c1020`, CHANGED, grew; D4:L319892-320020) posts at the same
  steps (D4:L319944-320008) but copies `LIST.ICO` 0x19000 bytes (100 KB) at a time (D4:L319984-319995): one Write
  while the file read is under 100 KB -- the disc's 50,234 (R143.5) would go in one where r0001 makes fifty; r0004's
  own copy of the file is not read here. The port follows r0001's fifty (a lead for the owner, not changed here).
- **r0004's patch-file rule** (R143.9; R4P-249, 2026-11-24; the build `socom2_game.elf` of r0004, sha256 starting
  `08be8ce7`; seat-kill's author read and its fresh second read of the instructions, the r0004 decompilation not
  opened; **reading, pending review**). `P` is `PATCHFILE.DAT` (`r0004:0x0041a270`, `0x00427ca8`), `A` is
  `APACHE00.ZDB` (`r0004:0x0041a280`, `0x00427cc8`); names are bare, so the card's current folder.
  - *Exists* `r0004:0x003c0f60` (r0001 `FUN_003a0950`): a GetDir of the name, mode 0, one entry; present when the
    result is above 0. *DeleteFile* `r0004:0x003c0d20`: with a file of the object's open (vtable +0x10,
    `r0004:0x003c0d4c`) nothing is issued; else Delete. A refused issue posts `MEMCARD_ERROR` in both
    (`r0004:0x003c0fb4`, `r0004:0x003c0d78`); a negative result is plain absent (`CARD_ISSUE_REFUSED_PLACEHOLDER`).
  - *IsSpaceForSaveGameFile* `r0004:0x0027c520` (row id 0x39, a table word at `r0004:0x00408a40`; r0001's
    `FUN_0027b3d0` is its tail): Exists P, and when present Exists A (`r0004:0x0027c524`-`0x0027c55c`); both ->
    DeleteFile P, its answer ignored (`r0004:0x0027c560`-`0x0027c570`); Exists P again, and when absent Exists A;
    absent too -> the sum starts at `SAVE_SPACE_NO_PATCH_KB` = 1 (`r0004:0x0027c578`-`0x0027c5ac`); then r0001's
    tail instruction for instruction (`r0004:0x0027c5b0`-`0x0027c5e8`): plus the free KB, below 3001 plus the
    folder's KB, true when not below 3000. The commands before GetInfo:

    | the folder holds | commands before GetInfo |
    |---|---|
    | neither | GetDir P (0), GetDir P (0), GetDir A (0) |
    | P alone | GetDir P (1), GetDir A (0), GetDir P (1) |
    | A alone | GetDir P (0), GetDir P (0), GetDir A (1) |
    | both, no file open | GetDir P (1), GetDir A (1), Delete P, GetDir P (0), GetDir A (1) |
    | both, a file open | GetDir P (1), GetDir A (1), GetDir P (1) -- no Delete |

    With neither, a card whose free KB, or free plus folder KB, is exactly 2999 answers true (r0001: false); at free
    3000 the folder is not counted (1 + 3000 is not below 3001), so its two GetDir are not issued. After the Delete the
    card holds A, so no 1 KB. What the Delete does to GetInfo's free count rides on libmc's model (a cluster per KB,
    research 228 §1): the real card driver's count after a Delete is not read, and only a sum of exactly 3000 with an
    even entry count could turn on it, which no test asserts.
  - *SaveConfig* (`r0004:0x003c2290`, its first step): after the scratch delete (as r0001, `r0004:0x003c22a0`-
    `0x003c2314`), GetDir P -- issued even with a file open -- absent: done (`r0004:0x003c2318`-`0x003c23a0`); GetDir
    A, absent: done (`r0004:0x003c23a4`-`0x003c2430`); vtable +0x10 again, a file open: done (`r0004:0x003c2438`);
    Delete P (`r0004:0x003c244c`-`0x003c24ac`). The same block runs at the start of `SaveSavedGame` (row id 0x3d,
    `r0004:0x00280ba4`) and of the patch download (`r0004:0x002ce25c`); the port has no `SaveSavedGame` handler in
    `cardCommands.ts` and no patch download, so nothing is built for either.
  - *The filler's glob*: `*.ZDB` (`r0004:0x00427ca0`) where r0001 has `*.zdb` (0x3fbd40); libmc matches names by exact
    case (`MC_NAME_CASE_READING`), so only r0004's finds `APACHE00.ZDB`. The page writes no `APACHE00.ZDB`
    (`PATCH_ARCHIVE_ON_CARD_PLACEHOLDER`): on its own card only the 1 KB, the extra GetDir and the glob's case are
    observable; the other cases are held by tests over a card the test builds.
  - Which r0004 script asks `IsSpaceForSaveGameFile` is not read: the replay lists (`mcReplay.ts`) keep r0001's
    `save_and_leave` order (`R0004_SPACE_SCRIPT_READING`). Out of this task, named so it is not lost: r0004's
    `IsMemcardSaveOK` (`r0004:0x0027f2a0`, row id 0xcc) repeats the space test's block when the card state is 0 and a
    case-insensitive compare against `StartPatchDownload` answers equal; `CardCommands.IsMemcardSaveOK` stays r0001's
    0x27e120 (the controller's call; a new row by default).

## 3. What the tests hold

`cardCommands.test.ts` (41 tests) builds two slots in memory and PLAT-26a's `Libmc` over them, with MENU-01a's
`MenuCommands` and this module registered in one `UiCommandHost`, and records every libmc call: each row's answers and
command order on an empty formatted card, an unformatted card, no card, a damaged record (state 6) and a card full of
foreign files; R143.5's twelve files; a second save (the scratch made again, the dummies kept); a full card's silent
save; LoadConfig's eight commands and its two events; AUTOMESSAGES; the port MC_ChPort set; the drained poll. The
boundaries the card cannot be made to hit exactly (2999 / 3000 KB, the retry, the unreset state) run over a made-up
libmc. R4P-249 adds r0004's patch-file rule (R143.9): the five card cases of the space test and their commands
(the 1 KB at 2999 / 2998 and at 3000 over the made-up libmc, the Delete and the open-file gate over both), SaveConfig's
GetDir pair and Delete (a file open: the GetDir still issued, the deletes not; a test seam, `holdFileOpenForTest`,
holds the handle), and the `*.ZDB` glob on a card holding `APACHE00.ZDB` alone. The four card states are pinned as `FUN_003a1cf0`'s literals (0, 1, 2, 6). `save_and_leave` tests only 1 and 2 by
value (`IF memcard_error_code == 1` / `ELSEIF ... == 2`, `cardPromptCommands.pinned.json` lines 816 and 818); 0 is
reached as `IsMemcardSaveOK`'s boolean (line 768), and 6 falls through to the space test (lines 820-821). `cardPromptCommands.test.ts` holds the pin, the lists and the captions in CI; `cardPromptCommandsDisc.test.ts`
re-derives the pin, decodes all 26 animations, reads the captions' message names and `LIST.ICO`'s size on the disc.

## 4. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `CONFIG_FILE_PLACEHOLDER` | 4,784 B, no JSON; a load parses whenever the file was read | the save file's modules (UI variables, valves, accounts) are OPT-01's, OPT-02's and OPT-04a's; without one handed in, SaveConfig writes the virgin size | the page's wiring: `CardConfigFile` over OPT-04a's `PersonaCard` and OPT-02's valves (OPT-01) |
| `CONFIG_HEADER_CHECK_READING` | the header re-read issued; its module word taken as matching | `FUN_0033d6d0` refuses a file whose `zSaveHeader` word differs from 0xe (D:L238929-238930); R7's file has no header bytes | OPT-01's file format under R7 |
| `LIST_ICO_BYTES_READING` | 50,234 | `RUN/ICONS/LIST.ICO`'s size on the disc (the dev-disc test reads it) | -- (held by the test) |
| `SAVE_GAME_DUMMY_BYTES_READING` | 1,952 | the f0 card's `SaveGame0..6` (research 139 §3); under R7 a dummy is its size | OPT-01's trace (PLAT-36) |
| `PATCH_ARCHIVE_ON_CARD_PLACEHOLDER` | the page writes no `APACHE00.ZDB` | no patch download is ported (R293), so the space test's and SaveConfig's cases with the patch archive (R143.9) occur only on a card a test or an imported save builds (R4P-249) | a patch download ported, or an imported card from the console holding one |
| `MC_NAME_CASE_READING` | exact case, as libmc matches (`@s2u/card` `wildcardMatch`) | r0001's `*.zdb` against r0004's `*.ZDB` (`r0004:0x00427ca0`) differ only under an exact-case match; the real card driver's rule is not read (R4P-249) | a card-call trace of r0004: GetDir `*.zdb` against `APACHE00.ZDB` |
| `CARD_ISSUE_REFUSED_PLACEHOLDER` | the refused-issue posts not reached | r0004's Exists, DeleteFile and SaveConfig's new block post `MEMCARD_ERROR` only when the issue call answers below 0 (`r0004:0x003c0fb4`, `r0004:0x003c0d78`, `r0004:0x003c2354`); `CardFileIo` answers one result per command and has no refused issue (as `MC_ISSUE_FAILURE_READING`, research 138) (R4P-249) | a refused-issue notion added to `CardFileIo`, should libmc model a busy IOP; a trace of the original |
| `R0004_SPACE_SCRIPT_READING` | r0001's `save_and_leave` order | which r0004 `.rdr` asks `IsSpaceForSaveGameFile` (row id 0x39, a table word only, `r0004:0x00408a40`) is not read; `mcReplay.ts`'s lists follow r0001's `UIMemCardAnim.rdr` `save_and_leave` (R4P-249) | the r0004 disc's `UIMemCardAnim.rdr` decoded against the pin |
| `SAVE_SPACE_NO_PATCH_KB` | 1 | read at `r0004:0x0027c5ac`: the sum starts at 1 KB when neither `PATCHFILE.DAT` nor `APACHE00.ZDB` is in the folder; a value at its address, but why one KB is not read anywhere (R4P-249) | -- (the value is read; its reason only from a design source) |
| `CARD_PATHS.patchArchive`, `CARD_PATHS.patchGlob` | `APACHE00.ZDB`; `*.ZDB` | read at `r0004:0x0041a280` / `0x00427cc8` and `r0004:0x00427ca0` (r0001's glob 0x3fbd40 is `*.zdb`) (R4P-249) | -- (read off the r0004 ELF; reading, pending review) |

## 5. What is not done, and where the sources disagree

- **Not registered on the page.** The rows answer in `@s2u/ui`; the page's `packages/viewer/src/menuCommandsHost.ts`
  (MENU-01a's) still registers only MENU-01a's thirteen, so under `?menuflow` the five stay `not implemented`. One call
  beside `connectMenuCommands` -- `new CardCommands({ valves, uiVars, card: libmc, io: () => menu.cardIo(), event })
  .register(host)` -- is the controller's (a viewer file this task does not own), with `CardConfigFile` over
  OPT-04a's `PersonaCard` when OPT-01 lands.
  > Superseded 2026-10-04 by ONL-06 (research 153 §5, R153.11): `packages/viewer/src/personaHost.ts` registers the five
  > with the persona module as their `CardConfigFile` (`PersonaCard.contents` / `restore`). The page's boot still
  > answers the card rows from BOOT-04's stubs for the whole session, so the five and MENU-01a's seven are the real ones
  > only while the persona form is the dialog built (`PERSONA_FORM_CARD_ROWS_ADAPTATION`), until BOOT-05.
- **The `MEMCARD_ERROR` event is not linked to the `memcard_error` valve.** `handle_memcard_error` is OPT-05f's to
  trace and wire (R143.8); until it is, `DisplayErrorSaving` and `DisplayErrorLoading` cannot be reached, and
  without a `CardConfigFile` handed in SaveConfig writes the virgin 4,784 B with no data and LoadConfig restores
  nothing (`CONFIG_FILE_PLACEHOLDER`): ONL-02's account list read from the card stays empty until OPT-01.
- **No flow test.** The acceptance is the decode, the rows and the captions' ids; running `save_and_leave` through the
  runtime to the frame is ONL-07's score (`A_42`), and the slot select ONL-01's (`A_30`). Neither frame is scored here.
- **The proven level** -- the libmc command sequence of a save against the recomp's trace (PLAT-36, OPT-01's
  acceptance) -- is not reached; every body is a reading, pending review.
- **FormatMemCard** keeps the table's owner (OPT-05a) while this list names OPT-05c, the state that dispatches it.
- **A full card**: `save_and_leave` asks `IsSpaceForSaveGameFile` before SaveConfig, so the save meets a full card only
  when the space rule passes and the Write still does not fit; the save itself then posts nothing, the Write's failure coming at completion (R143.8, a reading of libmc's convention), and the
  file is left as Open made it. What the console shows there is OPT-05d's capture to settle.
  > The modern editors (MU-F2b, 2026-10-10): the modern profile and settings save the file through `PersonaCard`
  > without this chain, so `packages/viewer/src/modern/cardSave.ts` (`saveWithinCard`) asks the same rule first --
  > `CardCommands.IsSpaceForSaveGameFile` (`FUN_0027b3d0` D:L124932-124944) run as it is over the page's card -- then
  > libmc's Write rule for the enlarged file (its clusters against the free ones, the old file's and, when short,
  > `SCRATCHPAD.DAT`'s, which `SaveConfig` releases first: `FUN_003a1c60` D:L296104-296126) and refuses before the
  > Delete. Two browser adaptations, labelled in the file: the scratch file released only when the save needs it, the
  > fillers left to the game's own `SaveConfig` (`MODERN_SAVE_SCRATCH_ADAPTATION`); the whole save -- the checks, the
  > scratch release, the writer's Delete/Open/Write -- staged on a memory copy of the card (`CardSlots.stage`) and
  > persisted as one write of the slot's record, compare-and-swap on its revision (`CARD_SAVE_STAGED_COMMIT_ADAPTATION`;
  > MU-F2d, dot's review of MU-F2b, which replaced a rollback whose restore could itself be refused or overwrite another
  > tab's newer save): a quota refusal leaves the stored record byte-identical, and another tab's save in between is
  > refused as "the memory card changed" once this tab can read it, not overwritten -- within the cross-tab window of
  > research 99 §7.6 (two tabs saving inside localStorage's propagation delay) both pass the check and the later write
  > wins. The original's flow (`@s2u/ui`) is unchanged.
  > Reading, pending review; `packages/viewer/test/modern/cardSave.test.ts` and
  > `packages/card/test/cardSlotsStage.test.ts` hold it.
