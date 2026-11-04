# 228 -- The save's op sequence and libmc's five remaining commands (PLAT-26)

Written 2026-10-09 00:13Z for PLAT-26 (`../roadmap/01-platform.md` "PLAT-26"; web sprint 15,
`../plans/2026-10-08-web-sprint-15-the-cards-data.md`, W15.R2) against `agent/online` 2b1daffaf. It continues research
134 (PLAT-26a: the ten file commands and Delete) and stands on research 99 §7 (PLAT-25's slots). Sources: the
recompilation's libmc stub `third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp` at the desktop's
commit 152579aa (its last change, pushed with the desktop's PR #23), cited `:<line>` below and in full as
`desktop@be5578311:third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp:<line>`, each line verified in
the working copy; *(2026-10-09, the close's fix 1: cited at the `ref/desktop` pin be5578311, which holds the file as
152579aaf left it -- `git log -1 be5578311 -- <the file>` gives 152579aaf, an ancestor of the pin, with no diff between
the two)*; the game's decompilation `game/analysis/socom2_game.elf.decomp.c` (`D:L<line>`, `FUN_<addr>`, cited,
never pasted) and its strings. The code is `packages/card/src/libmc.ts`; the tests `packages/card/test/libmcCommands.test.ts`
(the five, the harness) and `libmc.test.ts` (the ten; its "not ported" block replaced); the harness
`packages/card/test/mcReplay.ts`. Confidence: **reading, pending review** for every transcription; nothing here is
proven (no trace of the original or of the fixed recomp was replayed).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R228.1 | **The five answer as the stub does**, result by result, on PLAT-25's file table; `McNotPortedError` and the "NOT PORTED" line are gone (no caller named them but the replaced test) | `libmc.ts`; `libmcCommands.test.ts` | §1 |
| R228.2 | **The game reaches one of the five: Format**, through the UI command `FormatMemCard` (`FUN_003a12e0`, D:L295810-295831; the call D:L295821). Unformat, SetFileInfo, GetEntSpace and Rename have no call site in either ELF | the wrappers' call sites | §2 |
| R228.3 | **Format moves the slot's revision as a save does** (one more on a write; none on a card already empty and formatted; a damaged record's wipe past its legible revision and the clock) and follows the re-read rule | `cardSlots.ts` `format`; research 99 §7.1, §7.4 | §1 |
| R228.4 | **The options save on a fresh card, as read, is 114 libmc steps** from the card probe to the scratch filler; the harness replays it with no divergence; its only failures are nine NoEntry deletes; it leaves the f0 card's twelve files and GetInfo's free 5,007 | `libmcCommands.test.ts` | §3 |
| R228.5 | **The pre-fix trace is not the specification**: its five `cmd=13 result=-5` are the recomp's own bug; its op order agrees with the reading where compared | `logs/parity/s8_save_yes.game.log` L1040-1164 (on the host) | §4 |
| R228.6 | **The page issues the reading** (OPT-01, 2026-10-09): its own rows -- MENU-01a's, OPT-05i's, the persona module as the save's `CardConfigFile` (`connectPersona`) -- dispatched as the reading names them give the 114 steps Sync pair for pair and argument for argument; dispatched in `save_and_leave`'s order after "change an option, RETURN, YES" they give **124 steps, the 114 in order with ten checks before and between them**; the twelve f0 files, free 8000 -> 5,007, only the nine NoEntry deletes FAILED. No page change was needed; the reading's Mkdir argument was corrected to the script's | `packages/viewer/test/optionsSave.test.ts`; `optionsSaveRig.ts` | §3 |
| R228.7 | **The second save is 39 steps** on the card the first left: the folder found by both `Ensure_MC_Dirs_Fast` and `Ensure_MC_Dirs`, `AskToOverwrite`'s wait (one `IsMemCardInserted` a 0.1 s), then the script's own `SaveConfig`: the scratch and the save file deleted with Succeed, the save file written, the seven dummies and the patch filler found and kept, the scratch made again at 922 KB; no FAILED line, free 5,007 again | `mcReplay.ts` `optionsSaveAndLeaveOnASavedCard` | §3 |
| R228.8 | **The free figure and the space rule hold on the slot**: after each save `8000 - (1 + each file's KB)` = 5,007; the scratch is `2999 - (2,070 + (13 >> 1) + 1)` KB over the slot's own listing; `IsSpaceForSaveGameFile` asks GetInfo alone at 3001 KB free or more. The save file's `data` holds `CUIVarManager`, `CValveSaveManager`, `CAcctDB` in the f0 save's module order | `optionsSave.test.ts`; `tools/test/optionsSaveDev.test.ts` | §3 |

## 1. What each command does (the stub)

Every command keeps the convention of research 134 §6 (5): its result is left for `sync()` and returned directly; no busy
state is modelled. A negative result writes the FAILED line (`setMcCommandResultLocked`, :604-624, the line :620).

| command | the stub | what it answers here |
|---|---|---|
| Format (0x10, :26) | `sceMcFormat` :959-989 | no card in the slot, or a port or slot the stub has none for: NoEntry (:964, :967; `isMcCardPresent` :152-160, `isValidMcPortSlot` :131-134); **no format gate**: a formatted or an unformatted card is closed of the port's handles (:969, `closeMcFilesForPortLocked` :639-656 -- the port's only), emptied and formatted (:972-981), the port at the root (:980), Succeed (:982). **A refused write is the port's adaptation, not the stub's behaviour**: the stub's one failure on a present card comes after it has already removed everything (:972) -- it cannot make the root again, answers NoEntry (:974-978) and its card is left empty; the port's save is atomic, so a write the storage refuses answers NoEntry and leaves the card **unchanged** (`libmcCommands.test.ts` holds the files still there). NoEntry, not the DeniedPermit every other command answers for a refused write (`failureResult`, research 134 §3), because NoEntry is the only failure code the stub's Format and Unformat answer on a present card, and the game reads only "0 or not" from Format (`FUN_003a12e0`, D:L295827-295828, §2): the code is the stub's, the card left whole is ours. A damaged record is wiped to a fresh card -- the one save PLAT-25 lets it take (research 99 §7.4); the stub has no damaged card |
| Unformat (0x11, :27) | `sceMcUnformat` :1608-1637 | as Format, left unformatted (:1628): Succeed on a formatted or an unformatted card; a refused write NoEntry with the card unchanged, the same adaptation as Format's (the stub empties first, :1621, and fails at :1623-1624); GetInfo then answers NoFormat, free 0, format 0 (:1203-1206). A damaged record answers `MC_DAMAGED_RESULT_PLACEHOLDER` (research 134 §5): PLAT-25 lets only a format replace it |
| SetFileInfo (0x0E, :24) | `sceMcSetFileInfo` :1524-1562 | the stub reads the port, the slot and the path only (:1526-1528) and **sets nothing** -- no attribute, no time, no name: the gate (no card NoEntry :1530, :1533; unformatted NoFormat :1536-1538), a refused path DeniedPermit (:1543-1545), then Succeed when the entry exists -- a file, a folder, the root (:1551-1553) -- else NoEntry (:1530). Nothing is written, the revision stays |
| GetEntSpace (0x12, :28) | `sceMcGetEntSpace` :1169-1176 | **1024** (:1173) whatever the port, the slot and the path; the card is not asked, no FAILED line. A plain value with its cite, `MC_ENT_SPACE`: the game never calls it (§2), so no `*_READING` |
| Rename (0x13, :29) | `sceMcRename` :1439-1484 | the gate (no card NoEntry :1446, :1449; unformatted NoFormat :1452-1454); either path refused DeniedPermit (:1460-1463); the old entry, and the new one's folder, must exist -- else NoEntry, checked before anything else (:1470-1471); then the host's `rename` decides (:1473-1474) and PLAT-25's `rename` follows it where Windows and POSIX agree: a file onto a file replaces it; a file onto a folder, a folder onto a file, a folder into itself, the root as either name, a new folder that is a file: DeniedPermit. A folder onto a folder is DeniedPermit (Windows refuses it; POSIX takes an empty one: note only, `cardSlots.ts`). A file a handle holds open -- the old name, the new one, or inside a folder renamed -- DeniedPermit (`MC_RENAME_OPEN_FILE_DENIED_READING`, §5). A name onto itself is Succeed, nothing written |

**The re-read rule** (research 134 §4) holds for the three that change the card: Format, Unformat and Rename are saves
at the revision last read; a card another tab changed since answers ChangedCard (-1), nothing written; an `ext` save
alone is retried once. The stub never answers ChangedCard (it has no second writer); the rule is PLAT-26's own
(roadmap PLAT-26, the sprint 6 close review).

**Format and the slot's revision** (the brief's question): yes, a Format moves `rev` exactly as a save does -- one more
when it writes; **none** when the card was already formatted and empty (a change that changes nothing writes nothing,
research 99 §7.1); a damaged record's wipe takes `max(its legible revision, the clock) + 1` (research 99 §7.4). Another
tab holding the old revision then answers ChangedCard at its next save, once.

## 2. Which of the five the game reaches (the decompilation)

The libmc wrappers (research 134 §1) and their call sites, read again in both ELFs:

| command | wrapper | `socom2_game.elf` | `SCUS_972.75` |
|---|---|---|---|
| Format | `FUN_001b49c8` (D:L33764) | **D:L295821**, in `FUN_003a12e0` (D:L295810-295831) | its definition only |
| Unformat | `FUN_001b4f88` (D:L33957) | none | none |
| SetFileInfo | `FUN_001b4c68` (D:L33864) | none | none |
| Rename | `FUN_001b4e30` (D:L33914) | none | none |
| GetEntSpace | `FUN_001b5058` (D:L33988) | none | none |

No address of the four (`0x1b4f88`, `0x1b4c68`, `0x1b4e30`, `0x1b5058`) appears as a constant either. `FUN_003a12e0` has no
direct caller: it is the UI command `FormatMemCard` (research 107, the command table, line 155; OPT-05a's row), which
only the unformatted branches of the card prompts dispatch (research 143 R143.3, OPT-05c). It drains a pending Sync,
calls Format on `CMemCardIO`'s port and slot (+0x20, +0x24), posts the card error on a refused issue, and answers true
when Sync's result is 0 (D:L295820-295830) -- so Format's result 0 on an unformatted card (§1) is what the prompt needs.
Research 134 §6 (its list for the streams that build on this, item (2)) called D:L295821 "OPT-05's format? prompt": it is
the Format call inside the command, not the prompt; 134 is corrected in place (2026-10-09).

## 3. The op sequence as read, and the harness

**The harness** (`mcReplay.ts`, `replayMcOps(mc, steps)`): a step is `{ cmd, args, expect, at }` -- the command's name
as `MC_CMD` keys it, its arguments as `Libmc` takes them, the result Sync should answer, and where it was read. Each step
is called, then `sync()` is read and compared with `{ MC_CMD[cmd], expect }` -- the pair `PS2X_MC_TRACE` prints as
`[MC] Sync cmd=<n> result=<r>` (:1587). The first difference stops the replay and is reported (its index, the step,
what Sync answered). That is the proven level's shape: PLAT-36's post-fix trace gives the same pairs in order.

**The sequence fed to it** (`optionsSaveOnAFreshCard`, 114 steps, slot 1 a fresh card), each step citing its line:

1. The card probe `IsMemcardSaveOK` -> `FUN_003a1cf0`: GetInfo (D:L296146) -> 0.
2. ~~`Ensure_MC_Dirs_Fast`~~ `Ensure_MC_Dirs`' own head (corrected 2026-10-09, OPT-01, see below; research 139, the
   script as transcribed): `MC_Exists ..` -> `FUN_003a0950`, GetDir `..`
   for one entry (D:L295511) -> 1 (the root's `.`); `MC_ChDir ..` -> `FUN_003a07d0` (D:L295456) -> 0;
   `MC_Exists BASCUS-97275SOCOMII` -> 0 (not there yet).
3. `Ensure_MC_Dirs`' Mkdir ~~`/BASCUS-97275SOCOMII` (research 135 §3)~~ `BASCUS-97275SOCOMII`, the script's relative
   name (corrected 2026-10-09, OPT-01, see below) -> `FUN_0027b2c0` (D:L124877-124887) -> `FUN_003a0890`
   (D:L295483) -> 0; `MC_ChDir BASCUS-97275SOCOMII` -> 0.
4. `MC_CreateIconFiles` -> `FUN_003a0a10` (D:L295525-295655): `icon.sys` Open 0x202 (D:L295574) -> 1, Write 0x3c4
   (D:L295585), Close (D:L295591); `LIST.ICO` Open 0x203 (D:L295605) -> 2, the disc's 50,234 B a KB at a time while the
   read gives a whole KB (D:L295617-295628): 49 Writes of 1,024 and one of 58, Close (D:L295634).
5. `SaveConfig` `FUN_0027b000` (D:L124762-124786): `FUN_003a1c60` deletes `SCRATCHPAD.DAT` (D:L124772, D:L296116) ->
   -4; `FUN_003a17e0` -> `CSaveManager::Save` `FUN_0033dff0` opens the save file with mode 0x1a (D:L239225), which
   `FUN_003a05a0` turns into Delete (D:L295407) -> -4 and Open `O_WRONLY | O_CREAT` (D:L295395-295404, D:L295412) -> 3,
   then one Write (D:L239236 -> `FUN_003a0160` D:L295243) of 4,784 (the f0 card's size, research 139; the virgin size
   `CONFIG_FILE_PLACEHOLDER` stands for, research 143 §5) and Close (D:L239237 -> `FUN_003a04d0` D:L295361); seven times,
   `SaveGame<i>` GetDir for one entry (D:L124777) -> 0, then `FUN_003a1ea0` (D:L124780, D:L296202) saves the dummy the
   same way: Delete -4, Open -> 4..10, Write 1,952, Close.
6. `FUN_003a1880` (D:L124784, D:L295995-296026): GetDir `*.zdb` (D:L296008) -> 0, so `FUN_003a1980` makes
   `PATCHFILE.DAT` of 2000 KB (D:L296019): GetDir (D:L296050) -> 0, Open 0x202 (D:L296063) -> 11, Seek to 1999 KB
   (D:L296069), Write 0x400 (D:L296071), Close (D:L296073); `FUN_003a1060` (D:L296021): GetDir `..` for one (D:L295732)
   -> 1, `./*` for 0x14 (D:L295745) -> 13; `2999 - (2,070 + (13 >> 1) + 1)` = 922 KB > 0 (D:L296022-296023; research
   143 R143.5), so `SCRATCHPAD.DAT` the same way, handle 12, Seek to 921 KB.

What the tests hold: the 114 steps replay with **no divergence**; the card holds the twelve files at the f0 card's
sizes (the save file 4,784, `icon.sys` 964, `LIST.ICO` 50,234, `SaveGame0..6` 1,952, `PATCHFILE.DAT` 2,048,000,
`SCRATCHPAD.DAT` 944,128); GetInfo answers free 8000 before and `8000 - 2993` = 5,007 after (`mcUsedClusters`,
:245-288: one cluster for the folder, each file rounded up); the only FAILED lines are the nine NoEntry deletes of files
not there yet (KNOWN [card-folder], PLAT-26's acceptance). A sequence carrying the pre-fix answer `-5` for the first
`..` stops at step 1 with Sync's `{13, 1}`.

**Two corrections (OPT-01, 2026-10-09).** Step 2's first four commands are `Ensure_MC_Dirs`' own head -- `IF MC_Exists(..)`
`MC_ChDir(..)`, `IF MC_Exists(BASCUS-97275SOCOMII)` -- which issues the same commands as `Ensure_MC_Dirs_Fast` on a card
without the folder; the label "`Ensure_MC_Dirs_Fast`" above is that. And step 3's Mkdir argument is the script's,
`MC_MkDir(BASCUS-97275SOCOMII)` (the pin `tools/test/cardPromptCommands.pinned.json`, `Ensure_MC_Dirs`' ops): a relative
name at the root, not `/BASCUS-97275SOCOMII` (that is `PersonaCard.saveLogin`'s own path, research 135 §3). Both resolve
to the same folder and the Sync pair is the same; the argument matters once the page's calls are compared too. The
list moved from the test into `mcReplay.ts` (`optionsSaveOnAFreshCard`), shared by PLAT-26's harness and the page's test.

### The page's flow (OPT-01)

OPTIONS' (and ONLINE OPTIONS') RETURN runs `check_then_save_and_leave`, which with `OptionsMenuChanged` 1 calls
`UIMemCardAnim.rdr`'s `save_and_leave` (research 301 §6, research 302 §4). After YES (#831) and slot 1 (#830:
`MC_ChPort(0)`, no libmc command), its ops on a present, formatted card with room issue, in order (the pin's ops; each
row's body as research 138 and 143 read it):

1. `IF IsMemCardInserted` -> `FUN_003a1650` GetInfo (D:L295937) -> 0: one try (a well answer ends the two, D:L295944-295951).
2. `IF NOT ( IsMemCardFormatted ) AND IsMemCardInserted` -> GetInfo (`FUN_003a1580`, D:L295886-295918) -> 0, then GetInfo
   -> 0: **the condition evaluator runs every operand** -- `FUN_0025e960` runs the operand's command (D:L108389) before
   it applies the pending AND (D:L108404); nothing short-circuits (the runtime's `zanimRuntime.ts` says the same).
3. `CALL Ensure_MC_Dirs_Fast`: GetDir `..` -> 1, Chdir `..` -> 0, GetDir `BASCUS-97275SOCOMII` -> 0.
4. `IF IsMemcardSaveOK`: GetInfo -> 0 (step 1 of the 114).
5. `IF IsSpaceForSaveGameFile`: GetInfo -> 0, free 8000: not below 3001, so `FUN_003a1060` is not asked (`FUN_0027b3d0`
   D:L124930-124944; `FUN_003a1210` D:L295777-295807).
6. `MemcardAlreadyHasData = 0`; `CALL Ensure_MC_Dirs_Fast` again: the three of 3.
7. The valve still 0: no `AskToOverwrite`; #834; `CALL Ensure_MC_Dirs`: steps 2-114 of the list (its head, Mkdir, ChDir,
   the icons, `SaveConfig`). The valve stays 0, so the script's `SaveConfig` after `Ensure_MC_Dirs` does not run.

124 steps (`optionsSaveAndLeaveOnAFreshCard`): the 114 in their order, three checks and the first `Ensure_MC_Dirs_Fast`
before the probe, the space check and the second `Ensure_MC_Dirs_Fast` between the probe and `Ensure_MC_Dirs`. Left out:
the change poll `has_memcard_changed` (stopped at the start, called at the end): its GetInfo is the clock's, and a poll
in flight is drained by the next method (research 138 R138.5). **The page issues it** -- `optionsSave.test.ts` drives
the page's own rows (`connectPersona`'s wiring) in that order, the branches on the rows' answers, and reads the Sync
pairs off libmc's log sink with the trace's lines on: the 124 pairs, the arguments too; the twelve f0 files; free 8000
-> 5,007; the nine NoEntry deletes, nothing else FAILED. The rows the 114 names, dispatched alone (IsMemcardSaveOK, then
`Ensure_MC_Dirs`), give the 114 exactly. Nothing in the page moved: it already issued the reading's order.

### The second save (OPT-01)

The same flow on the card the first save left, in the same session (`optionsSaveAndLeaveOnASavedCard`, 39 steps; libmc's
handles count up for the session, research 134 §2: 13 and 14):

1. The three checks' GetInfo -> 0, 0, 0.
2. `Ensure_MC_Dirs_Fast`: GetDir `..` -> 1 (from the folder, the root's first entry), Chdir `..` -> 0, GetDir
   `BASCUS-97275SOCOMII` -> 1 (found: `MemcardAlreadyHasData` 1), Chdir into it -> 0.
3. IsMemcardSaveOK GetInfo -> 0; IsSpaceForSaveGameFile GetInfo -> 0 (free 5,007: not below 3001).
4. `Ensure_MC_Dirs_Fast` again: the four of 2.
5. `AskToOverwrite` (#857, NO first): `WHILE AreYouSure == 0` asks `IsMemCardInserted` (GetInfo -> 0) and waits 0.1 s --
   **once a 0.1 s, as long as the player takes**: one in the list (YES within the first wait); the count is the player's
   time, not the game's.
6. `Ensure_MC_Dirs`: the four of 2 (the folder found: ChDir, the valve 1; no Mkdir, no icons, no `SaveConfig` inside).
7. `MemcardAlreadyHasData == 1` -> `SaveConfig(BASCUS-97275SOCOMII)` (`FUN_0027b000`): Delete `SCRATCHPAD.DAT` -> **0**
   (D:L124772, D:L296116: the file is there now); the save file Delete -> **0**, Open -> 13, Write 4,784, Close
   (D:L124773; `FUN_0033dff0`); seven GetDir `SaveGame<i>` -> **1**: found, so not saved (D:L124777-124778); GetDir
   `*.zdb` -> 0 (D:L296008), so `FUN_003a1980(PATCHFILE.DAT, 2000)`: GetDir -> **1**, found, nothing written
   (D:L296050-296060); `FUN_003a1060`: GetDir `..` -> 1, `./*` -> 13 (the scratch deleted: 2,070 KB, 13 entries); 922 KB
   > 0, so `SCRATCHPAD.DAT` made again: GetDir -> 0, Open -> 14, Seek 943,104, Write 0x400, Close.

No FAILED line; the twelve files at the same sizes (the dummies as the first save wrote them); free 5,007 again. The
page issues it (`optionsSave.test.ts`), and the harness replays it on `Libmc` after the first (`libmcCommands.test.ts`).

### The free figure, the space rule, and the save file's modules (OPT-01)

In the page's flow, GetInfo's free after each save is `8000 - (1 + each file's KB rounded up)` (`mcUsedClusters`,
MemoryCard.cpp:245-288) = 5,007; the scratch's 922 KB is `2999 - (KB of the other eleven + (13 >> 1) + 1)` over the
slot's own listing (research 143 R143.5); after a save `IsSpaceForSaveGameFile` answers true from GetInfo alone. The save
file's `data` holds the three modules, in the f0 save's `CSaveModuleList` order (read through `tools/cardFile.ts`, the
dev-host test): `CUIVarManager` (the UI variables of longevity 3 as typed nodes, never a password-class name,
`CARD_PASSWORD_UI_VARS_PLACEHOLDER`, W15.R6), `CValveSaveManager` (every PERSIST valve as a 16-bit value; the 65 when the
registry holds `global_valves.rdr` whole, OPT-02b's dev-host test), `CAcctDB` (the personas, research 135). Its nominal
size is the persona module's (`personaFileSize`): 4,784 -- the f0 size -- with no persona and no online UI-variable keys
(research 102 R102.9), as on the f0 card. The contents are OPT-02's, OPT-03's and OPT-04's to test.

## 4. The pre-fix trace, and why it is not the specification (W15.R2)

`$SOCOM_PC_ROOT/logs/parity/s8_save_yes.game.log` (2026-09-19, 185 `[MC]` lines; on the host, never in the tree) was
recorded before the recomp's fix of 2026-09-22 (the desktop's 152579aa, its KNOWN [virgin-save]): its path normaliser
refused a trailing `..`, and the trace carries the five `cmd=13 result=-5` that the console never produced (e.g. its
L199, L654, L1040, L1046, L1053: the `MC_Exists ..` of step 2). Replaying its results would build the bug in. Its **op
order** is cited only where it agrees with the reading: its L1055-1164 run Mkdir, Chdir, the two icon files (handles 1
and 2, 50 Writes for `LIST.ICO`), the scratch Delete, the save file's Delete-Open-Write-Close (handle 3), the seven
dummies' GetDir-Delete-Open-Write-Close (handles 4-10), GetDir `*.zdb`, the patch filler (handle 11, Seek 2,046,976),
the two GetDirs of `FUN_003a1060` (1, then 13) and the scratch filler (handle 12, Seek 943,104) -- the order of §3 steps
3-6, command for command. Its results there happen to equal the reading's; they are not the evidence for it.

**A fresh card's first save succeeds (W15.R1, OPT-01, 2026-10-09).** The virgin-card failure (KNOWN [virgin-save]) was
the recomp's bug, settled by its fix and struck from the gate (W15.R1); the original on the console did not fail. On the
page the first save of a fresh card writes the twelve files with every Write whole, posts no `MEMCARD_ERROR`, and its
only FAILED lines are the nine NoEntry deletes of files not there yet (`optionsSave.test.ts`).

## 5. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `MC_RENAME_OPEN_FILE_DENIED_READING` | true: DeniedPermit | the stub's `std::filesystem::rename` (:1473-1474) fails on its Windows host while a `FILE*` is open on the old name, the new one or a file inside a folder renamed (no delete sharing), and succeeds on POSIX; the recomp runs on Windows (as `MC_DELETE_OPEN_FILE_DENIED_READING`, research 134 §5). The game never calls Rename (§2) | PLAT-36's trace, if ever a caller appears |
| a folder renamed onto a folder | DeniedPermit | Windows refuses it, POSIX takes an empty one; `cardSlots.ts` `rename` already follows Windows (research 99) | note only |

`MC_ENT_SPACE` (1024) is a value with its cite (`:1173`), not a reading: the brief named `*_READING` only for a call
the game makes, and it makes none. Research 101 §5 gains no row: `tools/test/roundLedger.test.ts` walks only the
round's packages (`viewer`, `server`, `scene`, `sound`), and research 101 §5 leaves `card` to its own task's note (this
one). (Research 101 §5's sentence "none of the six holds a `*_PLACEHOLDER` / `*_READING` name today" is stale for
`card`, which held seventeen such names before this task; left for the ledger's owner.)

OPT-01 (2026-10-09) adds no suffixed name: the second save's results are the stub's on `Libmc`'s file table, the
`AskToOverwrite` poll count is the player's time, and the block's two unknowns close without one -- the dummy's
`MissionData` content by R7 (a dummy is its nominal size, `SAVE_GAME_DUMMY_BYTES_READING`, and no game bytes: the
roadmap's "copy the f0 template, or read `CMission` serialize" is not needed), and `FUN_003a1c60`'s vtable+0x10 guard
(D:L296113-296114, before the Delete at D:L296116) by research 143 R143.7: the vtable at 0x4081f0 the constructor sets
(`FUN_003a22e0`, D:L296341) has `FUN_003a04c0` at +0x10, "the handle at +4 is not negative", and the constructor makes
that handle -1 (D:L296342). `FUN_003a04c0` has no body in the decompilation: the +0x10 entry and its test rest on
R143.7's reading of the ELF's vtable and instructions (0x4081f0, 0x3a04c0), not re-read here -- a reading, as R143.7
filed it; `CSaveManager` opens and closes it within one Save or Load, so between commands the guard
always passes and SaveConfig always deletes the scratch (`CardCommands.SaveConfig`'s `isOpen()`). Its refused-issue
branch (D:L296117-296118, the card error) is `MC_ISSUE_FAILURE_READING`'s (research 138). Research 101 §5 is unchanged
(the card package is not a round package).

## 6. What is left

- **The proven level**: a post-fix MC trace (`PS2X_MC_TRACE=1` of an options save on the fixed recomp, PLAT-36's
  window, H26 / H-next d) fed through `replayMcOps` as Sync pairs; the trace's lines carry no arguments, so the steps
  of §3 give them and the trace the results.
- **Mkdir of an existing folder** (research 134 §6): the stub's Succeed against the game's acceptance of -4
  (D:L295490); the same trace settles it.
- **The damaged record's answers** (`MC_DAMAGED_RESULT_PLACEHOLDER`, `MC_DAMAGED_GETINFO_PLACEHOLDER`, research 134 §5;
  Unformat on a damaged record answers the first): OPT-05f and the trace.
- ~~**The second save** (the dummies found, the scratch made again) and the save file's own JSON and size are OPT-01's
  (sprint 15 wave 2), on this harness.~~ *(Done 2026-10-09, OPT-01: §3, the second save and the page's flow.)*
- **The page's flow and the second save at the proven level**: the same post-fix trace of "change an option, RETURN,
  YES" on a fresh card and then on the saved one (PLAT-36) fed as Sync pairs against `optionsSaveAndLeaveOnAFreshCard`
  and `optionsSaveAndLeaveOnASavedCard` -- with the trace's change-poll lines set aside and the `AskToOverwrite` poll
  count taken from it.
- **The script run by the runtime**: the page's test dispatches the rows in `save_and_leave`'s order by hand (no ui test
  drives `UIMemCardAnim.rdr` through the runtime), and `optionsSaveRig.test.ts` holds that order to the pin's command
  calls of `save_and_leave`, `Ensure_MC_Dirs` and `Ensure_MC_Dirs_Fast` (a pin change fails it); the scored frames are
  ONL-07's and OPT-05e's.
- `CONFIG_FILE_PLACEHOLDER` (research 143 §4) stays as `CardCommands`' file when no `CardConfigFile` is handed in (a page
  without a card); the page hands the persona module in (`connectPersona`), whose size for an empty card is the f0's.
