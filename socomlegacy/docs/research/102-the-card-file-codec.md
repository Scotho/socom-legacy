# 102 -- The card file codec: the scrambler, ZAR V2 both ways, the flattened rdr both ways (web sprint 6, PLAT-27)

Written 2026-10-01 for PLAT-27 (`../roadmap/01-platform.md`), web sprint 6 (plan
`../plans/2026-10-01-web-sprint-6-foundations.md`; W6.R2 puts the writers in `@s2u/archive` and the scrambler and the
save modules in `@s2u/card`, W6.R8 keeps the ground truth outside this clone). The format was already read by the PC
project: PC research `docs/research/80-persona-card-format.md` (the persona-card note; steps 3-5 are the scrambler,
the archive and the rdr) and its reference codec `tools_py/card_save.py` with its test `tools_py/tests/test_card_save.py`.
This note cites them rather than repeating them and records what porting them found that they do not say. Sources, all
read-only under `SOCOM_PC_ROOT` (`C:/Projects/socom_pc` on the dev host): the decompilation
`game/analysis/socom2_game.elf.decomp.c` (`Lnnn` = its line), the four card fixtures
`third_party/ps2recomp/ps2xTest/fixtures/cards/{virgin,one,two,created}.bin`, and the 72 saves under
`logs/parity/<run>/mc0/BASCUS-97275SOCOMII/` (9 runs, each one `BASCUS-97275SOCOMII` and seven `SaveGame<n>`). The
probes were scratch scripts outside the repository; no card bytes are in git.

**Corrected 2026-10-01 -- R7: the codec is gone from the shipped packages; its reader stays as a dev instrument.**
PLAT-27 was built, reviewed and merged on 2026-10-01 (`1c20d326`) and dropped the same day by the owner's ruling R7
(`../specs/2026-10-01-web-r7-account-and-card-design.md` section 4's PLAT-27 row, amended by section 7 item 1): the
port reads and writes no card byte format, and nothing in a shipped package knows them. What remains:

- **The reader, a dev instrument:** `tools/cardFile.ts` -- the unscrambler, the lossless ZAR and rdr readers
  (`readZarTree`, `readRdrTree`, the float node included), the save file (`readSaveFile`, `findSaveKey`,
  `saveModules`, `saveHeader`) and the persona decode (`readPersonas`, `readCardFile`), on top of `@s2u/archive`'s
  `Zar.parse` and `Reader`; plus `zarExtents` / `rdrExtents`, which account for every byte of a file. It is for
  checking what the game really persisted against real cards (PLAT-06's `PersistentValves.rdr`, research 96 section
  5, reads through it) and for a possible one-way importer of a real save later. No file under `packages/` may import
  it: `tools/test/packageBoundaries.test.ts` rule (c).
- **The format knowledge, unchanged:** sections 1-6 are research and stand as written; where they name a file under
  `card/src/` or `archive/src/` (`scramble.ts`, `saveFile.ts`, `persona.ts`, the additions to `zar.ts` and `rdr.ts`),
  read it as the code of `1c20d326` and of the paused fix round (`3cc238ad`, `10594ae0`; their writer code never landed).
- **Deleted:** every writer -- `writeZar`, `writeRdr` and the `rdrInt` / `rdrFloat` / `rdrString` / `rdrList`
  builders, `writeSaveFile`, `encodeSaveHeader`, `writePersonas`, `writeCardFile`, the forward `scramble`,
  `pcLauncherLayout` -- with `@s2u/card`'s `scramble.ts`, `saveFile.ts` and `persona.ts`, PLAT-27's additions to
  `@s2u/archive`'s `zar.ts` and `rdr.ts` (both are again what they were before it), and their package tests. The
  paused fix round (`agent/web-s6-codec`: the writers' limits, the multi-persona write) went with them; its citation
  fixes and its hand-built known-answer bytes were kept (section 7).
- **History, on record:** the round trip -- all 76 game-written files and their 139 rdr keys rewritten byte for byte
  from the decoded tree, `created.bin` as the write of `s17pc` into `virgin.bin` -- held at `1c20d326` and passed
  review. Without the writers it cannot be re-run; `tools/test/cardFileDev.test.ts` holds the readers' side of it
  instead (section 7).

## 0. Answers

| # | finding | where it lands | section |
|---|---|---|---|
| R102.1 | The scrambler is PC research 80's, as written: two byte passes, `0x96` forward then the last byte backward. The signed reads in the original and in `card_save.py` change nothing (byte arithmetic) | `card/src/scramble.ts` | §1 |
| R102.2 | **The game's archive layout is fully determined** by the key tree plus three values the head and the gaps carry: `stable_ofs` (a guest heap address, different on every run), the string table with no leading empty name, and **`0xAF` in every alignment gap** (`FUN_00257590` L104078). With those, all 72 saves and the three game-written fixtures are rewritten byte for byte | `archive/src/zar.ts` `writeZar`, `readZarTree`, `ZAR_SAVE_FILL` | §2 |
| R102.3 | `card_save.py`'s `build_zar` writes another layout (leading empty name, `stable_ofs` 0, zero gaps) -- the PC launcher's, `created.bin`'s. The game's loader reads both. So PC research 80's "round-trips all 72 example files byte for byte" holds for the scrambler and for one-record `AcctInfo.rdr`; read -> `build_zar` does not give a game-written archive back. This codec does | `pcLauncherLayout`; the layout is a parameter | §2 |
| R102.4 | **The game's rdr flattening is fully determined** by the typed tree with each node's flags byte: a list's children are one block allocated when the list is reached, depth-first; strings interned as reached; a list with flags `4` points at the first earlier block of equal nodes and has none of its own. All 139 rdr keys in the 76 files come back byte for byte | `archive/src/rdr.ts` `writeRdr`, `readRdrTree`, `RDR_FLAG_SHARED` | §3 |
| R102.5 | No save holds a float node (type 2): every node in the 139 keys is an int, a string or a list. The float is written and read (synthetic tests) because UI variable files may carry it (the block's "seen in UI var nodes"); no card example proves it | `rdrFloat` | §3 |
| R102.6 | `zSaveHeader`'s second word equals the archive's appversion in all 76 files: 14 in `BASCUS-97275SOCOMII`, 12 in `SaveGame<n>` | `saveFile.ts` `SaveHeader.version` | §4 |
| R102.7 | The personas decode exactly as `card_save.py` decodes them on all 76 files (the records, the key list and sizes, the plain archive); `created.bin` is `writeCardFile(virgin.bin, [s17pc])` | `card/src/persona.ts` | §5 |
| R102.8 | **Several personas share values** (added 2026-10-01, the PLAT-27 review's F1): `two.bin`'s second record flags 4 exactly its value lists equal to the first record's. The writer does the same, so `two.bin` comes back byte for byte through the persona API (6,400 B; 6,576 without the sharing). One example of two records: the rule for more is `PERSONA_SHARED_VALUES_READING` | `writePersonas` | §5 |
| R102.9 | **The card's size is not a persona count.** The 4,784 / 6,208 / 6,400 B of `virgin` / `one` / `two` are three cards: `one` and `two` also hold the ten UI-variable keys (`MPLOCALSOP1-5`, `MPTAUNTMSG1-5`) a card gains once the game has been online, `virgin` none. `virgin.bin` with `one.bin`'s persona is 5,248 B (`created.bin`'s size), with `two.bin`'s two 5,440 B | PLAT-25's block corrected | §5 |

*R7, 2026-10-01: the "where it lands" column is the code of `1c20d326` (R102.8's sharing in `writePersonas`: the
paused fix round's `10594ae0`, whose writer code never landed). The readers named in it are now in
`tools/cardFile.ts`; the writers (`writeZar`, `writeRdr`, `rdrFloat`, `writePersonas`, `pcLauncherLayout`) are deleted.
The findings stand. R102.9's correction of PLAT-25's block in `01-platform.md` was made by the paused
fix round and withdrawn with it (the roadmap is carried by the R7 stream); the measurement stands here.*

## 1. The scrambler (`sub_0033DC30`, inverse `FUN_0033de00`)

PC research 80 step 3 states the algorithm; the decompilation agrees: `FUN_0033dc30` L239032-239086 (seed at L239040),
`FUN_0033de00` L239091-239136 (its seed at L239104). Two details the note does not give:

- Both functions unroll the forward pass eight bytes a step while more than eight remain (L239043-239071 in the
  scrambler), then finish byte by byte (L239073); the backward pass is L239080. The output does not depend on it; the
  tests cover the lengths around it (7, 8, 9, 15, 16, 17, 24, 25).
- The backward pass reads the last byte unconditionally, so on an empty buffer the original reads one byte before it. The
  game never scrambles an empty buffer; the port, like `card_save.py`, returns an empty buffer and gives one byte no
  backward step.

The key is one byte and the step `k ^= (k + p) & 0xff` lets two key streams meet and stay met, so a flipped byte does not
reach every later byte (the scrambler is an obfuscation, not a cipher; nothing depends on that).

## 2. ZAR version 2 in the saves

The archive is research 36 §1's: a 100-byte head, the string table, 16-byte keys in pre-order, the data blob aligned to
`padding`. In the 76 files: flags 0, padding 16, crc 0, appversion 14 or 12, head words 5-20 zero, and the head's
data-size word (word 21) is the blob's size rounded up to 16. What the game's writer chooses beyond the tree:

| | the game (72 saves; `virgin`, `one`, `two`) | the PC launcher (`build_zar`; `created.bin`) |
|---|---|---|
| string table | each key's name once, in pre-order, no leading empty name | led by an empty name |
| `stable_ofs` (word 3) | a guest heap address: e.g. 0x187b970 (`virgin`), 16,439,104 (`one`), 25,660,160 (a `SaveGame` of run f0) | 0 |
| the root's name pointer | 0 | 0 (reads as the empty name) |
| a key without data | offset 0 | offset 0 |
| each key's data | at the next multiple of 16 after the previous key's | the same |
| the gaps (keys -> data, between data, after the last) | **0xAF** | 0 |

The fill: `FUN_00258bd0` (the archive's write, L104960-) calls `FUN_00257590` (L104977), which allocates an alignment
buffer and fills it with `0xAF` (L104077-104078) before writing it. Every gap byte in the 75 game-written files is 0xAF.

`readZarTree` returns the tree with copies of each key's bytes and the `ZarLayout` that writes the same bytes again
(the fill read from the first gap, `ZAR_SAVE_FILL` when there is none); `writeZar` writes either layout. `Zar.parse`, the
reader the viewer and the scene use, is unchanged; it reads both. `writeZar` refuses a root with a name or data: the
root record keeps only its child count (`zar_main.cpp:57-62`), so either would be lost (review F4).

## 3. The flattened rdr

PC research 80 step 5 gives the format (`{1, stable_size, node_ofs}`, the string table, 8-byte nodes
`{u8 type, u8 flags, u16 count, u32 value}`). The writing rule, measured on all 139 rdr keys of the 76 files
(13 `AcctInfo.rdr`, 13 `PersistentValves.rdr`, 25 + 25 UI variable files `MPLOCALSOP<n>.rdr` / `MPTAUNTMSG<n>.rdr`,
63 `MissionData.rdr`), each rewritten byte for byte from its typed tree:

- node 0 is the root; a list's children are one block of nodes allocated **when the list is reached**, the children
  then filled in order, depth-first -- so an empty list's value is the next free node (`two.bin`'s second record's
  `PROFILE_INFO` points at node 68, one past the end);
- a string goes into the table when first reached; the table is padded with zeros to 16 (`node_ofs = 12 + stable_size`
  rounded up, PC research 80);
- **a list with flags 4 has no block of its own**: its value is the first block already allocated whose nodes equal its
  children (type, flags, value; nested lists by their contents). 3,396 lists carry it, in `PersistentValves.rdr`,
  `MissionData.rdr` and the two-record `AcctInfo.rdr` (the second record's values equal to the first's: HOST, TOWN,
  GENDER, PORT, SAVEPASSWORD, the checksums) -- PC research 80's "shared between records", with the rule that picks the
  block;
- **flags 1** is on the 50 strings of the UI variable files and nowhere else. Research 36 §6 names flags bit 0 `isclone`
  and bit 1 `packed`; the value 4 is in its `unused` field. What the game means by 1 is not read; it is kept as it is;
- every int, string and float node has count 0 (`readRdrTree` ignores a leaf's count, as `parseRdr` does).

`readRdrTree` keeps each node's type and flags; `parseRdr` (the scripts' reader) is unchanged. `writeRdr` writes the
float (type 2) as an f32 and refuses what does not fit (a string outside NUL-free latin-1, a list over 65,535
children) and what its own readers would refuse (review F2, F3):

- an int outside the signed 32-bit range: the value word is read signed (`readRdrTree` and `parseRdr` read `i32`,
  `card_save.py` `<i`), so 3e9 would read back as -1,294,967,296;
- a node deeper than the readers' cap (`MAX_DEPTH`, 64);
- a tree whose walk costs more than `RDR_VISIT_FACTOR` (16) visits a node written: a block shared by many lists is
  walked once for each, so 200 lists flagged 4 over one 200-int block (401 nodes, 40,201 visits) is refused. The two
  limits are the readers' constants, applied before anything is written.

## 4. The save file: `zSaveHeader` and the modules

The loader's header read `FUN_0033d4a0` (L238832-238874) unscrambles the file (L238851), opens the archive with padding
0x10 (L238857), finds `zSaveHeader` and reads 0x10c = 268 bytes of it (L238861) -- PC research 80's "checks nothing
else". Word 0 is 268 and **word 1 is the archive's appversion** in all 76 files; the other 260 bytes differ by run
(PC research 80: heap pointers and floats) and are kept as read. `saveFile.ts` reads and writes the file
(`readSaveFile` = unscramble + `readZarTree`; `writeSaveFile` the inverse), decodes the header, and lists the modules
(`CSaveModuleList`'s children in file order: `CUIVarManager`, `CValveSaveManager`, `CAcctDB`; `CMission` in a
`SaveGame<n>`).

## 5. The persona store

`persona.ts` follows `card_save.py`'s `read_personas` and `write_personas` (one 16-node record a persona; PC research
80 step 5), and `writeCardFile` its `write_card_file`: the template's `CAcctDB/AcctInfo.rdr` replaced, every other key's
bytes kept, the archive written in the PC launcher's layout with the template's appversion. Checked on the dev host
(2026-10-01) by a scratch comparison over all 76 files: this codec's personas, key names and sizes, and plain archive
equal `card_save.py`'s on every file. `virgin`/`one`/`two` hold none, `s27pa`, and `s16pc` then `s16pd` (PC research
80's table); `writeCardFile(virgin.bin, [s17pc])` is `created.bin`, `s17pc` being `test_card_save.py`'s (L73-75, used
at L101-104).

**Several records** (added 2026-10-01, the review's F1). `card_save.py`'s `write_personas` writes no sharing, so for
`two.bin`'s personas it gives an 856-byte `AcctInfo.rdr` where the game's is 688, and a 6,576-byte card for 6,400.
Read from `two.bin` (the same bytes as `logs/parity/s16_l1b_step0b`'s, the one card with two records): the second
record's value lists for HOST, TOWN, GENDER, PORT and SAVEPASSWORD, and its PROFILE_CHECKSUM list, carry flags 4 and
point at the first record's blocks -- exactly the lists equal to the first record's; NAME and PASSWORD differ and have
their own blocks; the empty PROFILE_INFO is equal but not shared; PROFILES is not equal (it holds a flagged list). PC
research 80 step 5 ("flags 4 marks a node the game shared between records") names the flag; this is the rule it
follows on that card. `writePersonas` applies it: a later record's non-empty value list equal to the first record's
is flagged 4, and `writeRdr` points it at the first equal block. `two.bin` then comes back byte for byte through
`writeCardFile(two.bin, readCardFile(two.bin), layout)` (a dev-host test). Beyond two records it is a reading,
`PERSONA_SHARED_VALUES_READING` (§8).

**The card's size.** The block's "4,784 B empty / 6,208 one persona / 6,400 two" (PLAT-25) are three different cards,
measured 2026-10-01: `one.bin` and `two.bin` hold ten 64-byte UI-variable keys under `CUIVarManager` that `virgin.bin`
lacks (PC research 80 step 4: they appear once the game has been online). `virgin.bin` with `one.bin`'s persona is
5,248 B (as `created.bin`), with `two.bin`'s two personas 5,440 B; `one.bin` with `two.bin`'s personas is 6,400 B.

## 6. What is settled, what is not, and what would settle it

Settled: the scrambler (decompilation and 76 files); the archive layout the game writes (§2) and the rdr flattening
(§3), each reproduced on every file; the header's two words (§4); the persona decode against the reference (§5).

Not settled, none of it on a path a save takes:

- **A repeated key name.** No save has one. The writer interns it once, as `card_save.py` does; whether the game's
  string table does is not read (`FUN_0025a2f0`, the archive's insert, and `FUN_00258bd0` would say).
- **The meaning of rdr flags 1** (the UI variables' strings) and whether a list with flags 4 may point at a block that is
  not the first equal one. The writer keeps flags as read and points at the first; every file agrees. The game's
  flattener (reached from `CSaveManager::Save`, `FUN_0033dff0`) would say.
- **A float node in a save.** None exists in the 76 files; the float path is held by synthetic tests only.
- **The game's `stable_ofs` for a new card.** It is wherever the game's heap put the table; a browser-written card uses
  the PC launcher's 0, which the loader reads (the PC project's `created.bin` is in use by its tests and launcher).
- **Sharing beyond two records** (`PERSONA_SHARED_VALUES_READING`). One card holds two records; none holds three.
  Whether a third record compares with the first or with the one before it, whether an equal NAME or PASSWORD would
  be shared, and which block an equal value under another key points at (the writer takes the first equal block, which
  for a GENDER of 1 equal to SAVEPASSWORD's 1 is GENDER's) are not read. Settled by a card the game writes with three
  personas, some values equal across keys, or by reading the flattener (`FUN_0033dff0`'s callees). A file written
  this way and loaded by the game is not yet proven either (`created.bin` holds one record).
- **Decode defaults.** A record missing a key decodes to `card_save.py`'s defaults (empty strings, gender 0, port
  10075, savePassword 0). No card has such a record; the game's own default is not read.

## 7. The tests, and what runs where

- In CI (`web.yml` runs `npm test` in `web/` with no `SOCOM_PC_ROOT` and no PC project checkout; this repository's
  `third_party/ps2recomp/` has no `ps2xTest/fixtures/`): the synthetic tests --
  `card/test/scramble.test.ts` (hand-worked vectors, the involution on random and edge buffers),
  `archive/test/zarWrite.test.ts` (the game's and the launcher's layouts byte by byte, write -> read -> write at
  appversion 14 and 12), `archive/test/rdrWrite.test.ts` (every node type with the float, the sharing rule, the 24-byte
  empty root), `card/test/saveFile.test.ts` (a save built in the test decodes to the same personas, the header, the
  modules, the sharing between records). `card/test/cardFixtures.test.ts` skips there.
- **The gap the review named, and its close.** Those synthetic tests compare each writer with its own reader, so a
  mistake made the same way in both would pass in CI. `card/test/knownAnswer.test.ts` (added 2026-10-01) holds known
  answers without game bytes: a one-record `AcctInfo.rdr` for a made-up persona and a tiny launcher-layout archive
  around it, each laid out byte by byte in the test from the format's rules (the head words, the string table, the key
  records, the node table in allocation order), not by the writer under test; the card is then their scramble, the
  scrambler itself being held by hand-worked vectors. The game's own layout (`stable_ofs`, 0xAF) stays dev-host only,
  in `zarWrite.test.ts`'s hand-checked head and gap bytes and the fixtures.
- On the dev host with `SOCOM_PC_ROOT` set: `cardFixtures.test.ts` round-trips the four fixtures and their rdr keys,
  checks the personas, `created.bin` and `two.bin` through the persona API, and (where `logs/parity/` exists)
  round-trips the 72 saves and their 111 rdr keys.

**Corrected 2026-10-01 -- R7.** The package tests above were deleted with the code they tested. What runs now:

- In CI: `tools/test/cardFile.test.ts`, the reader on input built in the test by hand from the format's rules
  (`tools/test/cardFileSupport.ts`, test support only): the fix round's hand-built one-record `AcctInfo.rdr`, a
  `PersistentValves.rdr` with an int, strings, lists, a float (type 2) and a flags-1 string, a save in the game's
  layout (a heap `stable_ofs`, 0xAF gaps) and one in the launcher's, each laid out byte by byte with its offsets in a
  comment; the card is their scramble by a few-line forward scrambler that lives in the test support only and is
  itself held by the hand-worked vectors of section 1. It checks the decoded trees, the layouts, the personas, the
  header and modules, and that `zarExtents` / `rdrExtents` tile each file with nothing unreferenced or unreached.
  `tools/test/dialogInventory.test.ts` takes PLAT-06's `PersistentValves.rdr` out of the same hand-built save.
- On the dev host with `SOCOM_PC_ROOT` set: `tools/test/cardFileDev.test.ts` -- the four fixtures decode to PC
  research 80's personas (names, hosts, ports; passwords only non-empty), `two.bin`'s keys and header; all 76 files
  read to the pinned counts (469 keys holding 170,984 B, 139 rdr keys, appversion 14 in 13 files and 12 in 63), each
  archive and each rdr key accounts for every byte (the structural invariant in place of the byte-equal round trip),
  and, when bash and a Python are there, each file's appversion, key names, sizes and child counts and personas equal
  what `card_save.py` reports (spawned once through the PC project's `scripts/python_env.sh`).
  `tools/test/dialogInventoryDisc.test.ts` still pins the 65 valve names and the 4,144 B on the f0 card and the four
  fixtures.

**Corrected 2026-10-01 -- what the tiling gives up (the move's review, F1).** The extents' tiling checks structure,
not decoded values or data content. The reviewer mutated the reader on `two.bin`: a list count lowered by one (a
skipped node shows as unreached) and a key size one byte short or five long were caught; `zSaveHeader`'s size raised
by one or four into its alignment gap, an int's value changed, an int node read as a float and a flags-4 byte cleared
were not, and nothing checked the copy of each key's data. So value fidelity on real files rests on three things:
(i) the reader is the code of `1c20d326`, unchanged, where the byte-equal round trip of all 76 files was verified;
(ii) the hand-built CI answers; (iii) the comparison with `card_save.py` and PLAT-06's 65 valve names. The cheap
closes were made the same day:

- `cardFileDev.test.ts`'s one Python spawn now dumps each key's bytes and every rdr key's full decoded tree (types,
  ints, float bits, strings, list shapes, flags bytes -- decoded node by node in the spawned script from PC research 80
  step 5's node format, since `card_save.py`'s own walk keeps neither flags nor floats) and every persona field, and
  the test compares all of them on the 76 files. When bash or Python is missing, the three comparison tests skip with
  the reason in their names and a `console.warn` saying what was not compared.
- `cardFile.test.ts` checks each key's bytes in the hand-built game-layout save, and a hand-built launcher-layout save
  (`handBoundarySave`) with one key ending inside its alignment gap (`zSaveHeader`, 268 of 272) and one ending exactly
  on the boundary that ends the blob (16 B), so a key read long or short fails.
- Mutants of `tools/cardFile.ts` run against the extended tests (all RED): `zSaveHeader`'s data read one or four
  bytes long (7 tests fail, CI and dev host); every int read plus one, or read as a float (5); only the ints equal to
  2 changed or read as floats (2: the hand-built persona's checksums in CI, and on the 76 files only the new rdr-value
  comparison -- the first-round tests caught neither on real files); every list's flags 4 cleared (1: only the new
  rdr-value comparison).

## 8. Placeholders and readings

No placeholder and no reading in code any more (**corrected 2026-10-01**, R7: the one reading went with the writer
that applied it). Every constant in `tools/cardFile.ts` is read from the decompilation, from PC research 80 or
`card_save.py`, or measured on the game-written files as cited above.

| name | what it stands for | status |
|---|---|---|
| `PERSONA_SHARED_VALUES_READING` (retired) | `writePersonas` flagged a later record's non-empty value list equal to the first record's as shared (4); read from `two.bin`, the one card with two records (§5); the rule beyond two, and a game load of such a file, unproven (§6) | removed 2026-10-01 with `writePersonas` (R7); the observation stays in §5 and §6 as research |
