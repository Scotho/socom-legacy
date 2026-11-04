# 134 -- libmc's file commands over the virtual card (PLAT-26a)

Written 2026-10-02 for PLAT-26a (`../roadmap/01-platform.md` "PLAT-26a"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R6). Sources: the recompilation's libmc stub
`third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp` in the desktop tree (cited `:<line>`), its
flag constants `ps2xRuntime/include/runtime/ps2_memory.h:53-65`, the libmc wrappers' addresses `recomp/socom2.toml`
L221-244, and the game's decompilation `game/analysis/socom2_game.elf.decomp.c` (`D:L<line>`) with its strings
(`socom2_game.elf.strings.txt`). It stands on research 99 §7 (PLAT-25's slots). The code is
`packages/card/src/libmc.ts`; its tests `packages/card/test/libmc.test.ts` (CI, a file table built in the test).
Confidence: **reading, pending review** for every transcription of the stub and the decomp; the three named values of
§5 are a placeholder and a reading.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R134.1 | **The game calls twelve of libmc's sixteen file commands**: GetInfo, Open, Close, Seek, Read, Write, Flush, Mkdir, Chdir, GetDir, **Delete** and Format. SetFileInfo, Rename, GetEntSpace and Unformat have **no call site** in the game's ELF | the wrappers `FUN_001b3d40` .. `FUN_001b5058` (toml L221-244); their call sites | §1 |
| R134.2 | **Delete is on the save path**: `CMemCardIO`'s open deletes the file before a create when its mode asks (bits 0x10 and 0x08), and the filler cleanup deletes `PATCHFILE.DAT` and `SCRATCHPAD.DAT`. PLAT-26a ports it with the ten (the block left it to PLAT-26) | `FUN_003a05a0` D:L295406-295410; `FUN_003a1bd0` D:L296092, `FUN_003a1c60` D:L296116 | §1, §6 |
| R134.3 | **The ten (and Delete) answer as the stub does**, result by result, on PLAT-25's file table: each branch transcribed and pinned by a table row | `libmc.ts`; `libmc.test.ts` | §2 |
| R134.4 | **The card's refusals map onto the stub's results**; a `changed` save is re-read and answered ChangedCard (-1) only when the card differs from what libmc last read, else retried once | research 99 §7.9; PLAT-26's rule | §3, §4 |
| R134.5 | **The stub answers Mkdir of an existing folder with Succeed; the game also takes NoEntry (-4) there** -- a sign the console's libmc answers -4, which the stub does not. Kept as the stub has it | `:1306-1308`; `FUN_003a0890` D:L295490 | §6 |

## 1. The game's card layer and what it calls

The libmc wrappers sit at `sceMcOpen@0x001B3D40` .. `sceMcGetEntSpace@0x001B5058` (`recomp/socom2.toml` L221-244); the
decompilation names them `FUN_<addr>` (D:L33345-33990). Their call sites in the game's ELF:

| command | wrapper | call sites |
|---|---|---|
| GetInfo | `FUN_001b44c8` | D:L44659, L44681 (the patch check, both ports); L295792, L295844, L295875, L295902, L295937, L296146, L296260, L296262 |
| Open | `FUN_001b3d40` | D:L44968; L295412 (`CMemCardIO`'s open), L295574 (`icon.sys`, 0x202), L295605 (`LIST.ICO`, 0x203), L296063 (a filler, 0x202) |
| Close | `FUN_001b3ea0` | D:L44998; L295361, L295591, L295634, L296073 |
| Seek | `FUN_001b3f58` | D:L44986; L295307, L295333, L296069 |
| Read | `FUN_001b40c0` | D:L44971, L44979, L44988; L295194, L295276 |
| Write | `FUN_001b41d8` | D:L295167, L295243, L295585 (`icon.sys`, 0x3c4 bytes), L295618 (`LIST.ICO`, 1 KB at a time), L296071 (a filler's last KB) |
| Flush | `FUN_001b4bb0` | D:L295215 |
| Mkdir | `FUN_001b3e68` | D:L295483 |
| Chdir | `FUN_001b4888` | D:L44666, L44688; L295456 |
| GetDir | `FUN_001b46b8` | D:L44669, L44691; L295421, L295511, L295732, L295745, L296008 (`*.zdb`), L296050 |
| Delete | `FUN_001b4a98` | D:L295407, L296092 (`PATCHFILE.DAT`), L296116 (`SCRATCHPAD.DAT`) |
| Format | `FUN_001b49c8` | D:L295821 |
| SetFileInfo, Rename, GetEntSpace, Unformat | `FUN_001b4c68`, `FUN_001b4e30`, `FUN_001b5058`, `FUN_001b4f88` | none: their definitions only (D:L33864, L33914, L33988, L33957) |

The class is `CMemCardIO` (the string at 0x3fbc20); the methods the save and the persona files go through:

- **Open** (`FUN_003a05a0`, D:L295382-295442): the caller's mode bits become libmc's flags -- 0x01 read (`O_RDONLY`),
  0x02 write (`| O_WRONLY`), 0x04 both (`O_RDWR`), 0x08 create (`| O_CREAT`) (D:L295395-295404); with 0x10 and 0x08 the
  file is **deleted first** and its size reset (D:L295406-295410); after the open, a read-mode open asks GetDir of the
  same path for one entry and takes its `FileSizeByte` (the table's +0x10) as the file's size (D:L295420-295429).
- **Read / Write** (`FUN_003a0270`, `FUN_003a0160`): the Sync result is the count, a negative one read as 0
  (D:L295282-295286, L295249-295253). **Seek** (`FUN_003a0390`): the caller's 1 is CUR, 2 END, anything else SET
  (D:L295303-295306); **Tell** is Seek(0, CUR) (`FUN_003a0430`, D:L295333). **Flush** `FUN_003a0100`; **Close**
  `FUN_003a04d0`, which forgets the handle (-1, D:L295367).
- **Mkdir** (`FUN_003a0890`) reports an error unless the result is 0 **or -4** (D:L295490); **Chdir** (`FUN_003a07d0`)
  any non-zero; an existence check is GetDir with one entry, true when the count is above 0 (`FUN_003a0950`).
- **The fillers** (`FUN_003a1980`, D:L296036-296077): when GetDir finds no such name, Open 0x202, Seek to
  `(n - 1) * 0x400`, Write 0x400 bytes of 0xEE, Close -- an `n` KB file. `FUN_003a1880` makes `PATCHFILE.DAT` 2000 KB
  when no `*.zdb` is on the card, and `SCRATCHPAD.DAT` when its count of the folder leaves room (D:L296018-296024).
- **The folder's size** (`FUN_003a1060`, D:L295714-295774): GetDir of up to 0x14 entries; the sum of each non-empty
  entry's `(size + 0x3ff) >> 10`, plus half the count, plus one. The game's own figure, not the card's free space
  (OPT-05d's to use).

The patch check (`FUN_001c4cc0` from D:L44449, `FUN_001c61a0` from D:L44947) asks both ports for
`BASCUS-97275SOCOMII/APACHE00.ZDB` (the strings at 0x1d4430, 0x1d4448) and reads it: the r0004 patch path, not the
online path's.

## 2. The commands, as ported

Each row is the stub's branch, in the stub's order; the tests' table rows carry the same citations. "Gate": no card
NoEntry, unformatted NoFormat (the stub's `isMcCardPresent` then `state.formatted`, e.g. :1287-1293), a damaged
record `MC_DAMAGED_RESULT_PLACEHOLDER` (§5).

| command | the stub | what it answers here |
|---|---|---|
| GetInfo | :1178-1249 | type 2, free (8000 less the used clusters, research 99 §7.2), format 1, Succeed; unformatted: type 2, free 0, format 0, NoFormat; no card, or a port or slot the stub has no card for (`isValidMcPortSlot`, :131-134: ports 0 and 1, slot 0): type 0, NoEntry |
| Open | :1330-1399, fopen modes :689-734 | the gate; a refused path, the root or a folder DeniedPermit (a name holding a C0 control character or DEL too, the card's `invalid` -- the stub on its Windows host finds no such file and answers NoEntry, :1369-1371, :1382; the game's paths are fixed ASCII); missing without `O_CREAT` NoEntry; its folder missing NoEntry; without write access the mode is "rb", which a missing file fails (NoEntry); with write access `O_CREAT` on a missing file or `O_TRUNC` makes a 0-byte file at the open, `O_APPEND` writes at the end; write-only is "wb" / "ab" (no read) except on an existing file without `O_APPEND` or `O_TRUNC`, which is "r+b" and reads (the game's 0x202 on a file already there, :717-731); then the handle (1 and up, the next free; the 4th open handle is UpLimitHandle (was the 33rd until 2026-10-04, see the note at the foot), **after** a CREAT made its file, :1379-1391) |
| Close | :851-869 | Succeed, the handle forgotten; an unknown handle NoEntry |
| Flush | :943-957 | Succeed for a known handle (every Write is already on the card), NoEntry otherwise |
| Seek | :1486-1522 | the new position; SET, CUR, END, any other origin SET (:1498-1506); a position before 0 DeniedPermit (fseek's failure), the position kept; past the end is allowed |
| Read | :1401-1437 | a size of 0 or less 0; an unknown handle NoEntry; a handle without read access ("wb", "ab": write-only with `O_TRUNC` or `O_APPEND`, or creating its file) DeniedPermit (fread's error, :1427); a write-only "r+b" handle reads; else the bytes read up to the end, and the file's JSON |
| Write | :1639-1705 | a size of 0 or less 0; an unknown handle NoEntry; a growth (`clusters(end) - clusters(before)` when the write ends past the file) that does not fit FullDevice, whole -- **before** the handle's access is looked at (:1678-1685); a handle without write access DeniedPermit; else the file's size is `max(before, end)`, `data` when given its new JSON, the result the size |
| Mkdir | :1278-1328 | the gate; a refused path DeniedPermit; a folder already there (the root too) Succeed, nothing written; over a file, or under one, DeniedPermit; its folder missing NoEntry |
| Chdir | :797-849 | the gate; `''` keeps the folder; a refused path DeniedPermit; a folder (the root by `..`) Succeed and the port's current folder moves; else NoEntry; answers the current folder (`/` with no card) |
| GetDir | :991-1167 | the gate; a refused path DeniedPermit and the `GetDir REFUSED` line (:1021); a folder named without `*` or `?` lists it all; else the last name is the pattern in its folder; `.` and `..` first when they match (:1085-1086), then the folder's entries in the stub's order (research 99 §7.9); `wildcardMatch` case-sensitive (:548-585); names cut to 31 characters (:544-545); attributes 0x8093 a file, 0x80a3 a folder (:539-543); at most `maxEntries` (0 or less: none, :1130-1131); a missing folder NoEntry |
| Delete | :871-922 | the gate; a refused path DeniedPermit (a C0 control character or DEL too, through the card's `invalid`; the stub on Windows answers NoEntry there, :898); the root NoEntry (:894); a folder with entries NotEmpty; a file or an empty folder Succeed; nothing there NoEntry; a file a handle holds open DeniedPermit (§5) |

**The session**: `init` and `end` close every handle, count handles from 1 again and put both ports at the root
(:1256-1276, :924-941); `sync` answers -1 when nothing is pending, else 1 with the last command and its result, once
(:1564-1606). **The FAILED line** -- `[mc] command <n> FAILED result=<r> (<name>) card=<card>` -- is written for every
negative result, in every build, and never for a count, a handle or a position (`setMcCommandResultLocked`, :604-624,
ruling R238). The stub names port 0's folder whatever the port (:620-621); here, slot 1's key. **The trace knob**
(`PS2X_MC_TRACE`, :146-150) adds `[MC] GetInfo port= type= free= format= result=` (:1245-1247) and `[MC] Sync cmd=
result=` (:1587). The lines go to the `log` the composition root gives.

**The path** (`normalizeMcPath`, the stub's `normalizeGuestMcPathLocked` :395-465 and `isSafeMcPathComponent`
:750-758): backslashes are slashes; a leading `mc0:` or `mc1:` (any case) is dropped; a relative path starts at the
port's current folder; `.` is skipped; `..` pops, and at the root sets "climbed", which is forgiven only when no name
follows (`..` and `a/../..` are the root; `/../escape.bin` is refused); a part holding `:` or ending in a space or a dot
is refused. A part the card itself refuses (a C0 control character, DEL: research 99 §7.1) answers DeniedPermit through
the card's `invalid`; the stub does not refuse it (:750-758), and on its Windows host the file is not found, so Open
and Delete answer NoEntry there (:1369-1371, :1382, :898). A known difference, left: the game's paths are fixed ASCII.

## 3. The card's refusals as libmc's results

PLAT-25's typed refusals (research 99 §7.9) become the stub's codes: `no-card` NoEntry; `unformatted` NoFormat; `full`
FullDevice; `no-entry` NoEntry; `not-empty` NotEmpty; `wrong-kind` DeniedPermit (the stub's Mkdir over a file, :1308);
`invalid` DeniedPermit (an unsafe path, :1298-1300); `write-failed` -- the `setItem` threw, reported by the slot --
DeniedPermit (the stub's `ferror` after `fwrite`, :1685: "Error saving" is the game's reading of it); `damaged` the
placeholder of §5; `changed` §4.

## 4. ChangedCard: the re-read and the one retry

PLAT-26's rule (the sprint 6 close review; research 99 §7.1, §7.9): a slot has one revision, which an `ext` save moves
too. libmc keeps, per port, **what it last read**: the revision and the card's content (present, formatted, files,
folders; not `ext`), taken at the end of every command on that port (`CardSlot.read`, added for this). A save is made at
that revision. Refused `changed`, the slot is re-read: when the card's content differs from what was last read, the
answer is **ChangedCard (-1)**, nothing written; when it is the same (an `ext` save, or a save that changed nothing on
the card), the save is tried **once** more at the fresh revision. Since the reference moves at every command, a card
pulled and put back between two saves answers ChangedCard once and the save after it goes through -- the console's
libmc's habit of reporting a changed card once. The first save of a session takes the slot as it finds it.

## 5. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `MC_DAMAGED_RESULT_PLACEHOLDER` | DeniedPermit (-5) | the stub has no damaged card; a PS2 card answering -5 is the one the game's card-state probe sets apart (`FUN_003a1cf0` D:L296152-296158, its state 6) | OPT-05f ("Error loading data", `_841`) and PLAT-26's trace (PLAT-36) |
| `MC_DAMAGED_GETINFO_PLACEHOLDER` | type 2, free 0, format 1 | R7 calls a damaged record "a present card" (research 99 §7.4); its free space cannot be counted | as above |
| `MC_DELETE_OPEN_FILE_DENIED_READING` | true: DeniedPermit | the stub's `std::filesystem::remove` (:905-912) fails on its Windows host while the `FILE*` is open and succeeds on POSIX; the recomp runs on Windows. The game never deletes a file it holds open (the deletes of §1 come before an open or after a close) | PLAT-26's trace |

Note only (no constant stands in): a handle's file **deleted by another tab** while open answers NoEntry at its next
Read, Write or Seek to the end (the stub's host decides: POSIX keeps writing the unlinked file, Windows cannot delete
it); a card **pulled while a handle is open** answers NoEntry there too (the stub's files stay on its host). Guest
memory does not exist here: the stub's DeniedPermit for a buffer or table address that does not resolve (:1420-1423,
:1141-1156) has no counterpart, and GetDir's entries carry one time (the stub writes the same value as `_Create` and
`_Modify`, :536-537) as milliseconds, not the stub's `SceMcStDateTime`.

## 6. Where the sources disagree, and what is left

- **Delete**: the PLAT-26a block leaves Delete to PLAT-26; the dispatch brief names it, and the game's open and filler
  cleanup call it (§1). Ported here; the not-ported five are Format, Unformat, SetFileInfo, GetEntSpace and Rename --
  each logs `[mc] command <n> NOT PORTED (PLAT-26)` and throws `McNotPortedError`, leaving nothing for Sync.
- **The block's unknown** ("whether the online path's saves call a command beyond these ten"): statically, the only
  commands beyond the ten the game's ELF calls at all are Delete and Format (§1). Format is the card-management
  screen's (`FUN_003a12e0`), parked. PLAT-36's trace would confirm it running.
- **Mkdir of an existing folder**: the stub answers Succeed (:1306-1308); the game's `FUN_003a0890` also accepts -4
  without an error (D:L295490), which suggests the console's libmc answers NoEntry there. Kept as the stub has it (the
  block's rule); PLAT-26's trace, or a PCSX2 run, would settle it.
- **The stub's sizes come from its host** (a file's bytes); here they are the nominal sizes PLAT-25 keeps, and a Write
  that carries no `data` keeps the file's JSON -- R7's split between the original's sizes and our contents.
- Left to PLAT-26: the five commands above and the proven level's replay of a recorded MC op sequence.
- **For the streams that build on this** (the review of 2026-10-02): (1) no composition root builds a `Libmc` over
  `() => localStorage` with a log sink yet -- the integrating stream's; (2) ~~Format is refused (above), and the
  card-management screen and OPT-05's "format?" prompt (D:L295821) need it~~ *(corrected 2026-10-09, PLAT-26: Format
  is ported (research 228 §1); D:L295821 is the Format call inside the UI command `FormatMemCard`, `FUN_003a12e0`, which
  the card prompts' unformatted branches dispatch -- not the prompt itself; research 228 §2)*; (3) Read hands back the whole file's JSON
  at each chunk -- code that reads the save in pieces (D:L295194, L295276) maps the JSON itself, there are no bytes
  (PLAT-27 dropped); (4) GetDir's times are milliseconds, not `SceMcStDateTime` -- a screen showing a save's date
  converts them; (5) each command returns its result directly as well as leaving it for `sync()`: the stub returns 0
  and gives it only through Sync, and no busy state is modelled, so `sync()` never answers 0 ("still running") --
  callers following `CMemCardIO`'s Sync loop (`FUN_001b4390` after each wrapper) see the original's sequence, the
  direct value is a convenience the original lacks; (6) the Mkdir-existing answer and the damaged-record
  placeholders wait for PLAT-36's trace.

**2026-10-04 (C8-FIX, from `C8-card-online-services.md` (research wave 2026-10-04; held outside the tree, at the controller's) U5).** `MC_MAX_OPEN_FILES` is 3, not 32: Sony's `MCMAN.IRX` scans a 3-entry handle table
and the 4th open answers -7 `UpLimitHandle` (MCMAN 0x6b84-0x6bbc; the PS1 path 0xacbc-0xacd8). The 32 was the desktop
stub's `kMcMaxOpenFiles`. The constant is a reading with no suffix (a value, as it was). Callers: every caller opens,
reads or writes and closes (the card's own tests, `personaRig`, the screen hosts); the named test files of `card`, `ui`
and `viewer` that drive libmc pass with 3. Still open from the card: U4 (a closed handle answers -5 on the console,
NoEntry here) and #3/#4 (the damaged-slot answers).

**2026-10-04 (C8-FIX review round).** `MC_CreateIconFiles` (`cardCommands.ts`) closes LIST.ICO's handle on every path:
with 3 handles, three failed copies that returned without closing left every later open answering -7. Tested (three
failed copies, then a successful copy and `SaveConfig`). Not modelled: mcman dropping every handle of a slot after a
card error (C8 U4, result below -9; MCMAN 0x68c), and a closed handle answering -5.

**2026-10-09 (PLAT-26).** The five left here are ported -- Format, Unformat, SetFileInfo, GetEntSpace and Rename
answer as the stub does, `McNotPortedError` retired -- and the save chain's op sequence is replayed as a reading: research 228.
Item (2) of the list above is corrected in place: D:L295821 is `FormatMemCard`'s Format call, not the "format?" prompt.
