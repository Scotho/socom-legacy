# 187 -- C8 -- the simulated card, the persona, netcnf, accounts, the lobby and the service store

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C8-card-online-services.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V4 (`research-wave-2026-10-04/V4-verify-ui-audio-card.md`) has landed and is folded in as §10.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

Research agent C8, wave 2026-10-04. Scope: `clusters.json` key `C8-card-online-services` (17 files under
`$PORT/packages/{card,server,viewer}/src/`). Read-only; no build, no game run, no server contacted. Every number below
comes from a script in `scratch/C8/` (README there) whose output is saved under `scratch/C8/out/`. Decompiled text is
cited, not copied: `D:L<n>` is a line of `socom2_game.elf.decomp.c` (r0001); IRX addresses are `.text` offsets of the
disc's own modules `RUN/IRX/{MCMAN,NETCNF,EZNETCNF}.IRX` (the game loads them from `cdrom0:\RUN\IRX\`, D:L44620-44622).

**The new levers this report brings** (none was used by the notes it answers):

1. **The disc's Sony IOP modules, disassembled.** `EZNETCNF.IRX` keeps its symbol table (`getCombinationList`,
   `getDisplayName`, its imports by name), which pins the sysclib import numbers (#22 `strcmp`, #29 `strncmp`) that
   `MCMAN.IRX` and `NETCNF.IRX` import without symbols. That made Sony's card driver and network-configuration library
   readable: `scratch/C8/irx.py`, `stubs.py`, `check_operands.py` (30 claims, all PASS).
2. **The netcnf `.dat` encoding, broken by known plaintext.** NETCNF.IRX encodes `ifc*.dat` / `dev*.dat` with 24
   rotation counts derived from an 8-byte console ID (0x1284, 0xda8); every decoded file must open with the 36-byte
   `# <Sony Computer Entertainment Inc.>` header (the -15 magic check, 0x60c0-0x6160). The header gives 18 of the 24
   counts outright, and two candidates remain for the other six. The PCSX2 card's `ifc000.dat` and `dev000.dat`
   decode completely: `netcnf_dat_decode.py`.
3. **The persona chain read end to end**, from the universe reply (`FUN_002fdaf0`) through `LobbyConnect` and
   `UpdateAcctInfo` to the account list's upsert, loader and writer (`FUN_002fbce0`, `FUN_002fc280`, `FUN_002fc440`):
   `decomp_cites.py` (67 citations, all PASS).

## 1. Summary

Counts, 50 rows: **38 named ledger items** -- RESOLVED 15, PARTIAL 5, UNRESOLVED 4, NOT-A-GAP 14; **12 unnamed / note-only
items** -- RESOLVED 4, PARTIAL 1, UNRESOLVED 3, NOT-A-GAP 4.

| # | item | status | grade | one-line answer |
|---|---|---|---|---|
| 1 | CARD_NAMES_CASE_SENSITIVE_READING | RESOLVED | STRONG | Sony's mcman matches a path part to a directory entry by `strncmp` (MCMAN 0x6a14); no case conversion is imported: case-sensitive, as the port does |
| 2 | MC_DELETE_OPEN_FILE_DENIED_READING | RESOLVED | STRONG | mcman's delete walks its 3-handle table and answers -5 when a handle holds the entry (MCMAN 0x7e30-0x7eac) |
| 3 | MC_DAMAGED_RESULT_PLACEHOLDER | PARTIAL | BELIEVED | no "damaged" card exists on the console; mcman answers -2 (NoFormat) for a bad superblock (0x4180) and -5 for a PS1-type card with PS1 access off (0x884); which one the browser's damaged record should mimic is a design call |
| 4 | MC_DAMAGED_GETINFO_PLACEHOLDER | PARTIAL | BELIEVED | as #3: the bad-superblock analogue is "PS2, unformatted"; the EE probe maps type 2 + -5 to state 6 and type 2 + format 0 to state 1 |
| 5 | NETCNF_ATTACH_CONTENTS_READING | RESOLVED | PROVEN | decoded: `ifc000.dat` = `type nic` + `dhcp` (**not `eth`**); `dev000.dat` = `type nic`, `vendor "SCE"`, `product "Ethernet (Network Adaptor)"`, `phy_config auto` |
| 6 | NETCNF_COLUMNS_READING | RESOLVED | STRONG | eznetcnf entry +8 = the combination's index name, +0x28 = the ifc's index name, +0x48 = the dev's index name (EZNETCNF 0x618-0x690) |
| 7 | NETCNF_ENTRY_FLAGS_READING | RESOLVED | STRONG | +0 = 0 for a loaded entry (-1 only when the env's file-error counter is set); unused slots are -8 (EZNETCNF 0x528-0x53c, 0x694-0x6ac) |
| 8 | NETCNF_NO_INDEX_IS_EMPTY_READING | RESOLVED | STRONG | NETCNF maps an index open failure (-3) to count 0 (0x20d4-0x20dc); eznetcnf returns that 0; the EE shows the empty list (D:L123195) |
| 9 | NETCNF_MALFORMED_RESULT_PLACEHOLDER | RESOLVED | STRONG | no single code: -1 (net file unreadable), -8 (entry not in index), -14 (no interface line), -15 (bad header), -21 (an attachment failing), -n (n bad lines); a malformed index is **empty, not an error**; all but -15 draw #586 |
| 10 | PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER | PARTIAL | STRONG | no constant exists: a record's bytes follow R102.4's flattening (23 nodes and 13 new string bytes in `two.bin`'s second record, with 16-byte alignment); 192 B is one case |
| 11 | PERSONA_HOST_AS_GIVEN_READING | RESOLVED | STRONG | the console stores the universe entry's **DNS string as MUIS sent it** (+0x9c), compared by `strcmp`, never a resolved address |
| 12 | PERSONA_NO_MAXIMUM_READING | RESOLVED | STRONG | the loader adds every record, the writer writes every record, the list is a growable vector; only the form stops at 3 a server |
| 13 | PERSONA_PORT_READING | RESOLVED | STRONG | the console writes LOBBY_PORT = the universe entry's Port (+0x11c); 10075 is the ELF's port for `socom2-prod.pdonline.scea.com` (D:L210549) |
| 14 | PERSONA_SAME_LOGIN_REPLACES_IN_PLACE_READING | RESOLVED | STRONG | rewritten where it stands, but keyed by **HOST, PORT and NAME** (the port omits PORT) |
| 15 | PERSONA_TOWN_READING | RESOLVED | STRONG | '' is right (a new record is zeroed); "no screen sets it" is wrong: the form's HOMETOWN row sets it |
| 16 | SAVE_PASSWORD_NO_CLEARS_READING | RESOLVED | STRONG | under NO the password argument is nulled (0x2fd0ec) and the writer omits PASSWORD from the card (D:L199263) |
| 17 | PERSONA_HOST_PLACEHOLDER | RESOLVED | STRONG | "LOBBY_HOST and LOBBY_PORT as the universe entry gives them" is exactly the original; what is left of OC-3 is only what DNS/port our universe entry carries |
| 18 | SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER | NOT-A-GAP | PROVEN | a ruled deviation (OT.R17); the original writes the password in plain text under YES (D:L199263) |
| 19 | UNIVERSE_SERVICE_URL_READING | NOT-A-GAP | PROVEN | a ruled adaptation (OT.R3); the original's MUIS is `socom2-prod.muis.pdonline.scea.com`:10071 (D:L210550-210551) |
| 20 | LADDER_STATS_COUNT_READING | PARTIAL | BELIEVED | (0x58 - 0x1c)/4 = 15, read from both posters' memset and the builder's send length; only stat 0 is ever non-zero |
| 21 | NAME_KEY_CASE_FOLD_PLACEHOLDER | UNRESOLVED | -- | Sony's server rule; nothing in the client decides it |
| 22 | CLAN_INVITATIONS_SESSION_READING | RESOLVED | STRONG | the original request carries the session key (D:L187576): answers are per session; the port's unchecked answer is equivalent while no clan exists |
| 23 | REMEMBER_TOKEN_IDLE_MS_PLACEHOLDER | NOT-A-GAP | -- | a server policy with no original (the console kept the password on its card); *2026-10-11: moved -- now `REMEMBER_TOKEN_IDLE_MS_OWNER` (SVC-03a, W18.R9; §5.2)* |
| 24 | LOGIN_ATTEMPTS_PLACEHOLDER | NOT-A-GAP | -- | a server policy; Sony's lockout is unobservable |
| 25 | LOGIN_WINDOW_MS_PLACEHOLDER | NOT-A-GAP | -- | as #24 |
| 26 | CREATE_ATTEMPTS_PLACEHOLDER | NOT-A-GAP | -- | as #24 |
| 27 | ROOM_WORLD_ID_FIRST_READING | NOT-A-GAP | STRONG | the client only carries the id back; any id renders the same |
| 28 | NEW_ROOM_STATUS_PLACEHOLDER | NOT-A-GAP | PROVEN | every non-zero status but -974 draws the same text (D:L190283, D:L190305) |
| 29 | ROOM_FULL_STATUS_READING | NOT-A-GAP | PROVEN | every non-zero JoinChannel status draws "It may be full" (D:L190718-190723) |
| 30 | FIND_WORLD_NOT_FOUND_READING | NOT-A-GAP | PROVEN | every non-zero status draws one text (D:L190341) |
| 31 | MAP_NOT_OFFERED_STATUS_PLACEHOLDER | NOT-A-GAP | PROVEN | every non-zero status but -975 draws MP_MEDIUS_JOIN_GAME_FAILURE (D:L190607) |
| 32 | FILTER_ID_READING | PARTIAL | BELIEVED | the client never reads the reply's FilterID and clears id 1 (D:L197617); 'field' satisfies it; Sony's numbering unobservable |
| 33 | FILTER_COMPARISON_READING | UNRESOLVED | -- | Sony's direction is unobservable; under a literal reading the client's two filters favour opposite directions |
| 34 | LOBBY_WORLD_FILTER_READING | UNRESOLVED | -- | coupled to #33; also: Horizon ORs filters |
| 35 | SPECTATOR_PASSWORD_READING | UNRESOLVED | -- | Sony's rule unobservable; the client side is read (it sends SpectatorGamePassword when watching) |
| 36 | GAMES_PER_ROOM_PLACEHOLDER | NOT-A-GAP | PROVEN | a server policy; the client asks at most 256 games a page (its only bound) |
| 37 | GAMES_PER_HOST_PLACEHOLDER | NOT-A-GAP | -- | a server policy; Horizon sets none |
| 38 | PAGE_SIZE_MAX_READING | NOT-A-GAP | PROVEN | a server policy; the client asks 999 at most |
| U1 | the `$~<room>` game-name suffix (lobby.ts:684-692) | RESOLVED | STRONG | the client writes it: `CreateMPGame` builds `GAMENAME + "$~" + LOBBYNAME` (`FUN_002f9410`, D:L197739-197744) |
| U2 | `/lobby/*` request-rate limit (lobbyHttp.ts:23-24) | NOT-A-GAP | -- | a server policy (SVC-23) |
| U3 | the options save around AcctInfo (persona.ts:18-19) | NOT-A-GAP | -- | implementation owed to OPT-01; no value is unsure |
| U4 | a closed or pulled card's handle (research 134 note) | PARTIAL | STRONG | Sony's mcman answers -5 for a closed/unknown handle (0x11e0) and drops every handle of a slot after a result below -9 (0x68c); the port answers NoEntry |
| U5 | MC_MAX_OPEN_FILES 32 (libmc.ts, not ledgered) | RESOLVED | STRONG | Sony's mcman holds **3** handles; the 4th open answers -7 (0x6ba0-0x6bbc); 32 is the recomp stub's |
| U6 | CreateChannel1's last four bytes, +0x90 (research 154 §8) | RESOLVED | BELIEVED | GenericField1, by Horizon's CreateChannel layout that matches the client's to +0x90 |
| U7 | SELECT UNIVERSE's USERS column (research 147 §6) | RESOLVED | STRONG | the reply's UserCount (+0x224) and MaxUsers (+0x228); the ONLINE cell is (Status +0x220 == 0) (D:L200090-200092) |
| U8 | LADDER_TIE_ORDER_PLACEHOLDER (research 155, note only) | UNRESOLVED | -- | Sony's server, unobservable |
| U9 | LADDER_ENTRY_READING (research 155, note only) | UNRESOLVED | -- | as U8 |
| U10 | RESULT_AUDIT_RETENTION_PLACEHOLDER (research 155, note only) | NOT-A-GAP | -- | an owner policy |
| U11 | GetDir's one time (research 134 note) | UNRESOLVED | -- | not researched beyond the note |
| U12 | a file deleted by another tab (research 134 note) | NOT-A-GAP | -- | browser-only; no console analogue |

## 2. Card (libmc, cardSlots)

### 1. CARD_NAMES_CASE_SENSITIVE_READING (`card/src/cardSlots.ts:57-62`)
- **What it stands for:** whether the card tells `SaveGame0` from `savegame0`. **Current:** `true`.
- **Prior search:** research 99 §7.12 read mymcplus (`ps2mc.py` L1156, L1749), not Sony's driver.
- **What I did:** disassembled the disc's `RUN/IRX/MCMAN.IRX` (the module the game loads, D:L44620-44622). The PS2
  path lookup (around 0x6670-0x6a6c) splits the path at `/` and compares each part with a directory entry's name at
  entry +0x40 through sysclib import #29 (0x69cc, 0x6a14, 0x6a5c). The `.dat` IRX `EZNETCNF.IRX` keeps symbols, and
  its stubs show sysclib #22 = `strcmp`, #29 = `strncmp` (`out/stubs_eznetcnf.out`). MCMAN imports sysclib #12, 14,
  20, 22, 23, 27, 29, 30 and none of #6/#7/#8 (`toupper`, `tolower`, `look_ctype_table`; `out/stubs_mcman.out`).
  The wildcard matcher at 0x528 uses #29 and #22 as well.
- **Answer:** names are compared byte for byte. Sony's driver agrees with mymcplus. **STRONG** (the operand is the call;
  one interpretive step: 0x6670 is the entry lookup, read from its shape).
- **Implementation:** retire the `_READING` suffix (rename `CARD_NAMES_CASE_SENSITIVE`), cite MCMAN 0x6a14; no
  behaviour changes. Test: the existing case test, its comment citing the IRX.

### 2. MC_DELETE_OPEN_FILE_DENIED_READING (`card/src/libmc.ts:72-77`)
- **What it stands for:** Delete of a file a handle holds open. **Current:** DeniedPermit (-5), read from the recomp
  stub's host behaviour.
- **What I did:** found McDelete by its body: export #13 at 0x1c24 refuses an empty name (-4) and `.` or `..` (0x498,
  -5 at 0x1c84). It then calls the PS2 path 0x84e4, which checks Exists (0x8000), Writeable (0x2) and a live
  sub-folder (-6 NotEmpty) and calls 0x7d6c. 0x7d6c walks the handle table at 0x261c0 (3 entries of 0x30 bytes; the
  fields status +0, port +6, slot +8, the parent cluster +0x20 and the entry index +0x24). It answers **-5** when an
  open handle names the same port, slot, cluster and index (0x7e30-0x7eac).
- **Answer:** -5, from Sony's own driver. **STRONG** (the operand at 0x7ea4 is the refusal; the step is naming export
  #13 McDelete by its body).
- **Implementation:** rename to `MC_DELETE_OPEN_FILE_DENIED` with the MCMAN citation; behaviour unchanged.

### 2.1 3-4. MC_DAMAGED_RESULT_PLACEHOLDER, MC_DAMAGED_GETINFO_PLACEHOLDER (`card/src/libmc.ts:61-70`)
- **What they stand for:** what a command and GetInfo answer on a slot whose browser record is corrupt. **Current:**
  -5; `{type 2, free 0, format 1}`.
- **Prior search:** research 134 §5 chose -5 because the EE probe sets it apart (`FUN_003a1cf0`, state 6).
- **What I did:** read what Sony's mcman answers for the two nearest real conditions:
  - **a corrupt filesystem:** the card check compares the superblock with "Sony PS2 Memory Card Format " (strncmp
    0x1c bytes, 0x4174). A mismatch answers **-2 NoFormat** (0x4180), so the card reads as unformatted.
  - **-5 from the card check:** answered when the slot's card type byte is 1 (a PS1 card) and the global PS1-access
    word (0x11d40) is 0 (0x87c-0x884, 0x8a8-0x8c4).
  - The EE probe (`FUN_003a1cf0` D:L296128-296164, called from `IsMemcardSaveOK` at 0x27e130, which stores the state in
    `memcard_error_code`, string 0x3ef380) gives: a result below -9 -> 2, a type other than 2 -> 2, type 2 with
    format 0 -> 1, type 2 with -5 -> 6, else 0.
  - The conditions under which mcman's GetInfo answers type 2 *and* -5 were not traced (export #21 0x9b4 and its
    callees 0x3608, 0xa534, 0xa794 not read).
- **Answer:** the original has no "damaged" state. Its corrupt-card behaviour is NoFormat with format 0, which drives
  the game's format offer and can erase the card. -5 with type 2 is a state whose console cause is not yet read.
  **PARTIAL, BELIEVED.**
- **Implementation:** the choice is the controller's, not a value. Keep -5 if the format offer must never be reached
  from a browser record (the R7 reason); to mirror the console instead, answer -2 with `format 0`. Either way,
  document MCMAN 0x4180 and 0x884 at the constants.
- **Owed evidence:** a read of MCMAN export #21 (0x9b4) through 0xa794 for the type-2-with--5 case; and the card
  script's branch on `memcard_error_code == 6` (the text it draws), from `READERC.ZAR`'s card dialogs.

### 2.2 U4. A closed or pulled card's handle (research 134 "Note only")
- **Note:** a handle whose file another tab deleted, or whose card was pulled, answers NoEntry at its next
  Read/Write/Seek.
- **What I did:** read McRead (export #8, 0x1188). A handle number of 3 or more, or a closed slot, answers **-5**
  (0x11a4-0x11e0), as does one whose +2 flag is clear (0x11ec-0x11f8; read as its read access, by place). After any command whose result is below -9 (a
  card gone), mcman clears every handle of that port and slot (0x68c, called from the command wrappers, e.g.
  0x1d04).
- **Answer:** on the console a pulled card's handle is dropped and its next Read answers -5, not -4. **PARTIAL,
  STRONG.** The deleted-by-another-tab case has no console analogue (U12).
- **Implementation:** if the port models a pulled card, answer DeniedPermit for a handle on a slot whose card changed.

### 2.3 U5. MC_MAX_OPEN_FILES = 32 (`card/src/libmc.ts:58-59`; not ledgered)
- **What I did:** McOpen's PS2 path (0x6b10) scans the same 3-entry table (0x6b84-0x6ba8). With none free it answers
  **-7 UpLimitHandle** (0x6bac-0x6bbc); the PS1 path does the same (0xacbc-0xacd8).
- **Answer:** Sony's driver holds 3 open files across both ports; 32 is the recomp stub's `kMcMaxOpenFiles`.
  **STRONG.** The game never holds more than one or two at once (its card layer opens, reads or writes, then closes),
  so this is parity of an edge, not of the path.
- **Implementation:** `MC_MAX_OPEN_FILES = 3`, citing MCMAN 0x6ba0; the libmc test that opens 33 handles becomes 4.

## 3. netcnf (the saved network configuration)

### 5. NETCNF_ATTACH_CONTENTS_READING (`card/src/netcnf.ts:44-54`)
- **What it stands for:** what the card's `ifc000.dat` / `dev000.dat` hold. **Current:** ifc `{type: 'eth', dhcp}`
  (from the disc's `IFC003.CNF`), dev `{nic, SCE, Ethernet (Network Adaptor), auto}`.
- **Prior search:** "encoded and not decoded".
- **What I did:**
  - Read NETCNF.IRX's decoder. 0x1284 expands 8 ID bytes (from cdvdman import #22) into 24 rotation counts: each
    byte gives `(b>>5)+1`, `((b>>2)&7)+1`, `(b&3)+1`.
  - 0xda8 decodes each little-endian halfword as `rotr16(~h, k[i])`, `i = (i+1) % 24`, and a trailing byte as
    `rotr8(~b, k[i])` (0xe8c-0xf94).
  - The loader rejects with -15 any file whose first 36 bytes are not the Sony header (0x60c0-0x6160).
  - `extract_bwnetcnf.py` read `/BWNETCNF` from the desktop's PCSX2 cards (written by Sony's set-up program, PC
    research 18 c). `netcnf_dat_decode.py` recovered counts 0-17 from the header. The schedule check holds (every
    third count is 4 or less). Two candidates remain for counts 18-23. Counts 19-22, which decode `type nic`, are the
    same in both. Only the candidate with `k[18]=6` gives the header's blank line and "Network" in the product
    (`out/netcnf_dat_decode.out`; ID bytes `00 ac ff ff ff ff b9 86`).
- **Answer (decoded):**
  - `ifc000.dat` (52 B): the header, a blank line, `type nic`, `dhcp`.
  - `dev000.dat` (113 B): the header, a blank line, `type nic`, `vendor "SCE"`,
    `product "Ethernet (Network Adaptor)"`, `phy_config auto`.

  The decoded lengths equal the card's sizes. **PROVEN** (decoded data of the original program's own write). The
  port's `ifc.type 'eth'` is wrong: the disc's `IFC003.CNF` template is not what the program saved.
- **Implementation:** `NETCNF_ATTACH_CONTENTS = { ifc: { type: 'nic', dhcp: true }, dev: unchanged }`, and drop
  `_READING`. Test: an assertion on `ifc.type === 'nic'` citing this decode (no card bytes enter git, research 102).
  The server reads `server` from the same JSON, so nothing else moves.

### 6. NETCNF_COLUMNS_READING (`card/src/netcnf.ts:109-118`)
- **What it stands for:** which name fills the key, the row and HARDWARE. **Current:** combination / ifc / dev.
- **What I did:** read `getCombinationList` (EZNETCNF 0x39c, by its symbol):
  - per type-0 index entry it parses the combination's number from its name (`getCombinationValue`: the first digit
    run, `strtol` base 10);
  - it loads the entry (`loadEnv` -> `sceNetCnfLoadEntry`) and fills slot `number - 1`, 0x68 bytes from +0x30: +4 the
    protocol type, +8 the combination's index name (strncpy 0x1f);
  - +0x48 is `getDisplayName(pair->attach_dev, type-2 list)`, the device's index name; +0x28 is
    `getDisplayName(pair->attach_ifc, type-1 list)`, the interface's (0x618-0x690). `getDisplayName` (0x2c4) matches a
    file name against the list's +8 and returns the entry's +0x108.
  - The EE rows each slot `[i+1, +0x28 (cut to "%.32s..." from 31 chars), +0x48]` (D:L123205-123227).
- **Answer:** the port's reading is the original's. **STRONG** (symbols plus the EE reader). One difference the
  one-combination card never shows: the original's row number is the combination's number (its slot), not its place
  among entries.
- **Implementation:** drop `_READING`. Optionally number rows by the combination name's digits, with a test of a lone
  `Combination2` listed as row 2.

### 7. NETCNF_ENTRY_FLAGS_READING (`card/src/netcnf.ts:120-121`)
- **What I did:** `getCombinationList` first writes -8 into +0 of all ten slots (0x528-0x53c). A loaded entry gets
  `env+0x2c != 0 ? -1 : 0` (0x694-0x6ac). That word is netcnf's file-error counter, incremented only on write
  failures (NETCNF 0x7a80-0x7b00). The special-provider check that would overwrite it runs only when the request's
  flag bit 0 is set, and the EE passes 0 (`FUN_001e8740(..,0,..)` D:L123192).
- **Answer:** 0. The EE's "flags not negative" test (D:L123220) is what skips the -8 empty slots. **STRONG.**
- **Implementation:** rename `NETCNF_ENTRY_FLAGS = 0`. Optionally model the -8 empty slots if rows by number (#6) are
  adopted.

### 8. NETCNF_NO_INDEX_IS_EMPTY_READING (`card/src/netcnf.ts:123-128`)
- **What I did:**
  - `sceNetCnfGetCount` (NETCNF export #4, 0x368) calls 0x2280, which reads the index through 0x20b0 -> 0x1198.
  - 0x1198 answers -3 for any open failure but -5, and -18 for -5 (0x11c0-0x11d4).
  - 0x20b0 turns **-3 into 0** (0x20d4-0x20dc).
  - eznetcnf returns a count of 0 or below unchanged, without sending a list (0x3e0-0x414). The EE treats 0 as an
    empty list (D:L123195).
  - The console capture `A_05` (#578) agrees.
- **Answer:** a missing index is an empty list, and so is any index that cannot be opened (except the IOP's -5, which
  becomes -18 and #586). **STRONG** (code plus capture).
- **Implementation:** rename; consider widening the rule from NoEntry to every open failure but an I/O error (the libmc
  -> ioman errno mapping through mcman's device layer was not traced: BELIEVED for codes other than NoEntry).

### 9. NETCNF_MALFORMED_RESULT_PLACEHOLDER (`card/src/netcnf.ts:130-136`)
- **What I did:** read the load path, `sceNetCnfLoadEntry` (export #6, 0x464) -> 0x23e0 -> 0x6740 -> 0x5f2c:

  | code | when (NETCNF.IRX address) |
  |---|---|
  | -8 | the index lists no such entry (0x2470, 0x2554) |
  | -1 | the net file is unreadable (0x5fc0-0x5fc4, 0x60a4) |
  | -15 | the header is wrong (0x6160) |
  | -n | n lines failed to parse: each line handler answers -1 (0x57f8, 0x582c), summed at 0x61d4 |
  | -14 | no interface pair (0x67b0) |
  | -21 | an attachment's load failed other than -15/-16 (0x6814-0x6828, 0x6878-0x688c) |

  `getCombinationList` returns the first failing load (0x5ec-0x734). A malformed *index* is parsed line by line
  (0x2314-0x23a0) and non-matching lines are skipped. A garbage index therefore counts 0: the empty list, #578.
- **Answer:** the visible outcome is #585 for -15 and #586 for any other negative, so the errno never shows. The
  port's -1 is the original's code for its main case (a net file named but missing). For an index not in our shape the
  original shows **the empty list, not #586**. **STRONG.**
- **Implementation:** rename to `NETCNF_UNREADABLE_NET_FILE_RESULT = -1`. Map a malformed index to `{result: 0}`. Add
  tests: an unparseable index -> rows `[]` with ok; a missing combination file -> -1 -> #586.

### 3.1 Lead (for C5a): the list's head
`getCombinationList` writes head +0 from `netdbMap(path, 6, 10, 10)`: **6** for an `mc` device, 10 otherwise
(0x6f8-0x71c), and that is also the RPC result. Head +4 is a copy of +8, the first listed combination's number
(0x704-0x710). The EE loops head +0 slots (D:L123193). So "the count" in research 144 R144.1 is the device's slot
count (6), not the number of configurations. This bears on C5a's `NETCNF_DEFAULT_INDEX_READING`: the default is the
first index entry's combination number (1 for `Combination1`), and when the count is 0 nothing is sent, leaving the EE
buffer unchanged.

## 4. Persona (the account list on the card)

The chain, read whole:
- **The universe reply.** `FUN_002fdaf0` (the UniverseStatusList reply, D:L199982) copies the reply's +0x1c name
  (128), +0x9c DNS (128), +0x11c Port, +0x120 description (256), +0x220 Status, +0x224 UserCount, +0x228 MaxUsers,
  +0x22c billing (8), +0x234 its name (128) and +0x2b4 the extended info into a 0x3d8-byte entry (D:L200011, 200022).
  Those sizes and that order are Horizon's universe-reply fields (`Constants.cs:40-45`).
- **LobbyConnect** (`FUN_00276780`) sets LOBBY_HOST = entry +0x9c (`FUN_002fd980`, D:L199910) and LOBBY_PORT =
  entry +0x11c (`FUN_002fd8b0`, D:L199888) (D:L122480-122484). It is the only setter of LOBBY_HOST.
- **UpdateAcctInfo** (`FUN_00275130`, UI command 154) hands LOBBY_HOST, LOBBY_PORT, PLAYERNAMEVAR, PLAYERPASSWORD,
  PLAYERHOMETOWN, PLAYERGENDER and SecurePassword to `FUN_002fd0d0` (D:L121745-121779).
- **The upsert** (`FUN_002fbce0` D:L199016-199184), its loader caller `FUN_002fc280` (D:L199234) and its writer
  `FUN_002fc440`.

### 11. PERSONA_HOST_AS_GIVEN_READING (`card/src/persona.ts:97-103`) and 17. PERSONA_HOST_PLACEHOLDER (`viewer/src/personaHost.ts:43-50`)
- **Prior:** PC KNOWN calls HOST "the resolved address"; KNOWN's own open alternative was "MUIS's DNS string".
- **Answer:** HOST is the universe entry's **DNS field exactly as MUIS sent it**, copied to the record's +0 (0x80),
  and compared with `strcmp` (`FUN_00198f18`, an exact demo-symbol match in `socom2_names.csv`) at D:L199060. Nothing
  resolves it. KNOWN's cards (HOST <the hosted box> where the MUIS Endpoint was <the hosted box>) agree. **STRONG** (decomp
  chain, Horizon's field order, KNOWN's observation).
- **Implementation:**
  - `PERSONA_HOST_AS_GIVEN` (drop `_READING`).
  - Correct `personaHost.ts`'s header: the console's value is "the lobby's DNS string as the universe entry gives it",
    not "resolved".
  - `PERSONA_HOST_PLACEHOLDER`'s mechanism is the original's. What remains open is only which DNS/port our
    `texts.json` universe carries (today `''` and 0, so records are filed under HOST `''`, PORT 0), which is the
    owner's OC-3 / SVC-05 call. Rename to `PERSONA_HOST_FROM_UNIVERSE_ENTRY` and leave OC-3 on the universe text.

### 13. PERSONA_PORT_READING (`card/src/persona.ts:35-41`)
- **Answer:** the record's PORT is LOBBY_PORT, the universe entry's Port (D:L122481, D:L199888), handed whole
  (D:L121779). The form path never uses a default. 10075 is the ELF's own port for `socom2-prod.pdonline.scea.com`
  (`FUN_0030e290` writes 0x275b, D:L210549; the MUIS host gets 0x2757 = 10071, D:L210551). Our Horizon's lobby port
  shares it. **STRONG.**
- **Implementation:** keep 10075 as the API default for a caller naming no port, renamed `PERSONA_DEFAULT_PORT`, with
  this citation; the form path already passes LOBBY_PORT.

### 14. PERSONA_SAME_LOGIN_REPLACES_IN_PLACE_READING (`card/src/persona.ts:67-74`)
- **Answer:** an existing record is rewritten where it stands. A record not found is appended and zeroed (vector
  insert `FUN_002fe3e0` at the end, D:L199068-199070). The key is **HOST (strcmp) + PORT (word) + NAME (strcmp)**
  (D:L199060-199062). No move to the front; names compared with case. **STRONG** (research 153 R153.1 agrees).
- **Divergence found:** `withPersona` (persona.ts:175-181) matches on HOST and NAME only. Two records with the same
  host and name but different ports are one record in the port and two on the console.
- **Implementation:** add `&& r.PORT === record.PORT` to the find. Test: two logins differing only in PORT leave two
  records.

### 12. PERSONA_NO_MAXIMUM_READING (`card/src/persona.ts:76-84`)
- **Answer:** no cap.
  - The loader `FUN_002fc280` calls the upsert for every child of the AcctInfo array (D:L199234).
  - The writer `FUN_002fc440` writes every record.
  - The vector's only bound is its allocation limit (0xd6853 records, `FUN_002fe3e0`).
  - The form makes at most three a server: `FUN_00276af0` pads the list with `<New Persona>` rows `for (; i < 3; ...)`
    (D:L122572), and that row is the only way to a new name (R153.3).

  **STRONG.**
- **Implementation:** rename; behaviour unchanged.

### 15. PERSONA_TOWN_READING (`card/src/persona.ts:43-44`)
- **Answer:** `''` is right: a new record is zeroed (D:L199070). HOMETOWN is copied only when handed (D:L199078), and
  the form clears PLAYERHOMETOWN on a new name (R153 table, ENTER). The comment "No screen sets it" is wrong: the form's
  HOMETOWN row (`set_player_hometown`, 20 chars / 63 bytes, R153.4) sets it, and `personaHost.ts:141` already passes
  `town`. **STRONG.**
- **Implementation:** rename `PERSONA_DEFAULT_TOWN`, fix the comment.

### 16. SAVE_PASSWORD_NO_CLEARS_READING (`card/src/persona.ts:61-66`)
- **What I did:** disassembled 0x2fd0d0 (`elfdis.py`). At 0x2fd0ec `movz t0, zero, t3` nulls the password argument
  when SAVEPASSWORD (t3) is 0, and the upsert then leaves the held password unchanged in memory (D:L199075). The writer
  `FUN_002fc440` emits PASSWORD only when the field is non-empty **and** SAVEPASSWORD is set (D:L199263).
- **Answer:** under NO the card's record carries no PASSWORD node at all, so the next load has an empty password. R7's
  `{length: 0}` gives the same observable result. **STRONG.**
- **Implementation:** rename (`SAVE_PASSWORD_NO_STORES_NONE`), cite D:L199263; no behaviour change.

### 10. PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER (`card/src/persona.ts:53-59`)
- **What I did:** `persona_bytes.py` accounts for `AcctInfo.rdr` in the fixtures. In `one.bin` it is 488 B: 115 B of
  strings padded to 128, then 45 nodes. In `two.bin` it is 688 B: 128 B of strings to 144, then 68 nodes.
- **What the second record adds:** 23 nodes (184 B) and 13 string bytes (`s16pd`, `pwsixd`). Six of its value lists
  are flagged shared (4) onto the first record's blocks: HOST, TOWN, GENDER, PORT, SAVEPASSWORD and the 16 checksums.
  The file grows 192 B, the module 200 B (16-byte alignment of the string table and of the archive's data).
- **Answer:** there is no per-record constant. The growth follows R102.4's flattening rule and the writer's order
  (D:L199263ff): 1 array node, 16 key/value nodes (14 when PASSWORD is omitted), one node per unshared value list, 4
  for PROFILES, plus each new interned string, then 16-byte alignment. **PARTIAL, STRONG** (the rule is read; the
  third-record bytes are computed, not observed).
- **Implementation:** under R7 the size is nominal and only feeds the free-space count. Either keep 192 as "the
  observed delta for a 5-char name and a saved 6-char password", renamed `_READING`. Or compute it (`8 x nodes + new
  string bytes`, aligned) and test that it reproduces 6,400 B from `one.bin`'s shape.

### 18. SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER (`viewer/src/personaHost.ts:34-41`)
- **Answer:** the original writes the password in plain text under YES (D:L199263). The port's NO-for-everything is
  OT.R17's ruled deviation (security), to be replaced by R7's token. **NOT-A-GAP** for research; the value is known.

### 4.1 U3. The options save around AcctInfo (`card/src/persona.ts:18-19`)
- Owed to OPT-01 (the twelve-file options save); the command order is already read (research 135, 143). Not a value.
  **NOT-A-GAP** here.

## 5. The universe and the services

### 19. UNIVERSE_SERVICE_URL_READING (`viewer/src/universeHost.ts:13-20`)
- The original connects to `socom2-prod.muis.pdonline.scea.com` port 10071 (strings 0x3f6940, `FUN_0030e290`
  D:L210550-210551) through the DNS its configuration names. The port's origin rule is OT.R3's ruled adaptation.
  **NOT-A-GAP.**

### 5.1 U7. SELECT UNIVERSE's USERS column (research 147 §6 note)
- `FUN_002fdaf0` builds SERVER_LIST rows of `[name, Status == 0, UserCount, MaxUsers]` (D:L200090-200092). USERS is
  the universe reply's UserCount, whatever the server counts; what Sony counted is unobservable. **RESOLVED (client),
  STRONG.** The count to send is ONL-07's / the owner's.

### 22. CLAN_INVITATIONS_SESSION_READING (`central/src/clanInvitations.ts:30-36`)
- `CheckMyInvites` -> `FUN_002e8650` copies the session key (0x66a4d0, 17 bytes) into the request at +0x15
  (D:L187576). The original's answer is therefore per session (per account), and Horizon refuses without one. While
  no clan can exist every account's answer is the same NoResult, so the unchecked endpoint is observably equal.
  **RESOLVED, STRONG** (the request plus Horizon `MLS.cs:1523-1529`).
- **Implementation:** none now. SVC-09 adds the session check, and its test asks for two accounts' different answers.

### 20. LADDER_STATS_COUNT_READING (`central/src/serviceStore.ts:40-45`)
- Both posters zero a 0x58-byte request and write only type (+0x18) and stat 0 (+0x1c): the account at D:L198436
  (the rating), the clan at D:L187322 (the clan mean). The builder sends 0x58 bytes (D:L562081). So the stats run
  +0x1c..+0x58 = 15 ints if nothing follows them. **PARTIAL, BELIEVED** (one line; Horizon drops this message and has
  no LADDERSTATS constant; only `LADDERSTATSWIDE_MAXLEN` 100).
- Only stat 0 is ever non-zero, so the width cannot be observed past index 0 from the client.
- **Owed:** a wire capture of one post on the local stack (ONL-32), or another Medius-1.x title's struct.

### 21. NAME_KEY_CASE_FOLD_PLACEHOLDER (`central/src/serviceStore.ts:47-53`)
- **UNRESOLVED.** Searched: the client's own name compares (the persona key uses `strcmp`, D:L199062) say nothing about
  the server; Horizon folds (DbController.cs:167, :1462). Sony's rule is unobservable. It remains the owner's call.

### 5.2 23-26. REMEMBER_TOKEN_IDLE_MS_PLACEHOLDER, LOGIN_ATTEMPTS_PLACEHOLDER, LOGIN_WINDOW_MS_PLACEHOLDER, CREATE_ATTEMPTS_PLACEHOLDER (`central/src/accounts.ts:50-72`, `accountHttp.ts:48`)
- These are server security policies with no original: the console kept its password on the card, and Sony's lockout
  rules are unobservable. **NOT-A-GAP**: the owner's numbers (SVC-03's Owner calls). No research can source them.
- *2026-10-11 (SVC-03a, W18.R9: the owner's direction on HUMAN_TASKS H178):* `REMEMBER_TOKEN_IDLE_MS_PLACEHOLDER` moved
  -- it is now `REMEMBER_TOKEN_IDLE_MS_OWNER` in `central/src/accounts.ts`, an owner's value (30 days, a rolling window),
  beside the token's rotation, grace and cap (research 132 §8); `accountHttp.ts` reads the new name. The other three
  stay as they were.

## 6. The lobby (briefing rooms and the game list)

The client's verdict on any reply is `FUN_002f42d0`: **success iff status == 0** (D:L194343). Its texts per failure:
- **CreateChannel1:** -974 goes on to FindWorldByName (D:L190283); every other non-zero status shows one text
  (D:L190305).
- **FindWorldByName:** one text (D:L190341).
- **JoinChannel:** "It may be full" for every non-zero status (D:L190718-190723).
- **cbCreateGame:** -975 has its own text, every other status MP_MEDIUS_JOIN_GAME_FAILURE (D:L190607).

### 6.1 28, 29, 30, 31. NEW_ROOM_STATUS_PLACEHOLDER, ROOM_FULL_STATUS_READING, FIND_WORLD_NOT_FOUND_READING, MAP_NOT_OFFERED_STATUS_PLACEHOLDER (`central/src/lobby.ts:105-156`)
- On the client any code with the same sign class renders identically. The exact Sony codes are unobservable and
  invisible. **NOT-A-GAP, PROVEN** (the client's branches).
- **Implementation:** rename the suffixes to `_CHOICE` (or keep them as ledger-free constants), citing the branch
  lines above. Add a test that each is non-zero and not -974 / -975.

### 27. ROOM_WORLD_ID_FIRST_READING (`lobby.ts:97-103`)
- The client stores the id and carries it back (JoinChannel +0x28, CreateGame1 GF1 = DAT_0066a538, D:L190576). Nothing
  draws it. **NOT-A-GAP.**

### 32. FILTER_ID_READING (`lobby.ts:127-132`)
- AUTOPLAY sets `{field 1, operator 3, baseline 1}` (D:L197547-197549) and later clears FilterID **1** (D:L197617). The
  0x4f reply's FilterID is never read (`FUN_002f8ed0` reads only the status).
- On the original server the PlayerCount filter therefore had id 1 in the sessions that reach AUTOPLAY. 'field'
  satisfies that, and so would a per-session counter from 1, or Horizon's counter from 0 *if* the room filter (field
  10) had been set first in the session.
- **PARTIAL, BELIEVED.**
- **Owed:** whether a session that reaches AUTOPLAY has entered a room first, which decides whether Horizon's numbering
  would also work (a read of the login-to-menu path, or ONL-32's transcript).

### 6.2 33-34. FILTER_COMPARISON_READING, LOBBY_WORLD_FILTER_READING (`lobby.ts:134-149`)
- **New analysis:** the client's two filters cannot both be literal under one direction.
  - AUTOPLAY `(PlayerCount, >=, 1)`: under the port's `field op baseline` it keeps games with players; under Horizon's
    `baseline op field` it keeps only games of at most one player. The client's own pass then demands a non-zero
    count (D:L197630-197635).
  - The room filter `(LobbyWorldId, <, 0)` (field 10 at D:L191655, operator and baseline zeroed by the memset): under
    `field op baseline` it keeps nothing, hence the port's invented 'session-room'; under `baseline op field`
    (`0 < id`) it keeps every game.
  - Horizon also combines a session's filters with **any** (OR, `MediusManager.cs:205-214`), not all.
- **UNRESOLVED:** Sony's server is unobservable; Horizon is not evidence of it. The pair should be ruled together (the
  owner or controller). The port's present pair keeps the client usable.

### 35. SPECTATOR_PASSWORD_READING (`lobby.ts:173-180`)
- **Client side, read:** when watching, JoinGame carries SpectatorGamePassword, and PlayerGamePassword otherwise
  (D:L190376-190395). CreateGame1 sets the spectator password var to the empty string (0x3f48d0) when
  spectators are off (D:L190535-190555).
- Which field Sony's server compared is **UNRESOLVED** (unobservable; ONL-32 on our stack shows only our server).

### 6.3 36-38. GAMES_PER_ROOM_PLACEHOLDER, GAMES_PER_HOST_PLACEHOLDER, PAGE_SIZE_MAX_READING (`lobby.ts:158-187`)
- These are server policies. The client's own bounds are a page of 256 games (D:L184291-184292) and 999 rooms
  (D:L184891; AUTOPLAY's games 999 at D:L197581). **NOT-A-GAP**, for SVC-23 and the owner.

### 6.4 U1. The `$~<room>` suffix (`lobby.ts:684-692`, research 154 §8 "the writer is not traced")
- **What I did:** found the only `$~` string in the ELF (raw-byte search; at 0x3f5af8, beside MP_GAME_NAME_EXISTS) and
  its one reference: `FUN_002f9410` (D:L197718).
- **How the name is built:** while the session is up (+0x7d) and in state 0x0b, `FUN_002f9410` builds the game name
  var (lobby +0xc4) + `"$~"` + the lobby-world name var (+0xc0) (D:L197739-197744) and writes it back to the game name
  var.
- **What follows:** it looks the result up in the room's local list. If found, it posts MP_GAME_NAME_EXISTS. If not,
  it sets `mp_persistent` 0, `mp_game_sort_order` 0x7f and steps the lobby state (`FUN_002efe20(.., 0xd)`).
- **The caller:** UI command 44 `CreateMPGame` (`FUN_0027d7d0`, D:L126058; `uiCommands.ts:146`).
- **Answer:** the suffix is the client's own: CREATE GAME names the game `<name>$~<room>`. That makes names unique per
  room, and the list draws up to `$~`. **STRONG.**
- **Implementation (ONL-13):** CreateMPGame's body sends `GameName = name + '$~' + LOBBYNAME`. Its duplicate check runs
  against the room's list before any request. `drawnName` stays as is. The server's GameNameExists check then compares
  whole suffixed names.

### 6.5 U2. A request-rate limit on `/lobby/*` (`lobbyHttp.ts:23-24`)
- A server policy (SVC-23); no original. **NOT-A-GAP.**

### 6.6 U6. CreateChannel1's +0x90 (research 154 §8)
- Horizon's sibling `MediusCreateChannelRequest` reads AppID +0x28, MaxPlayers +0x2c, LobbyName +0x30 (64), Password
  +0x70 (32), **GenericField1 +0x90**, then GF2-4 and the level (`MediusCreateChannelRequest.cs:35-48`). The client's
  CreateChannel1 matches this layout through +0x90 (research 154) and ends at 0x94. So +0x90 is GenericField1.
  **RESOLVED, BELIEVED** (one line: Horizon's sibling struct).

### 6.7 U8-U10. Research 155's note-only stand-ins (the store's ladder)
- `LADDER_TIE_ORDER_PLACEHOLDER` and `LADDER_ENTRY_READING` cover Sony's server behaviour, unobservable: **UNRESOLVED**
  (owner call 5; R155.1's client behaviour stands). `RESULT_AUDIT_RETENTION_PLACEHOLDER` is an owner policy:
  **NOT-A-GAP.**

### 6.8 U11, U12. Research 134's other notes
- **GetDir's single time:** not researched past the note. Owed: a read of mcman's GetDir entry fill (export #12 0x14f8
  -> 0x8020) for its two date fields. **UNRESOLVED.**
- **A file deleted by another tab:** browser-only. **NOT-A-GAP.**

## 7. Peer questions (online lane, OT.R27: player-visible behaviour only)

C7 answered these first ([186](186-c7-audio-movie.md) §1); at the coordinator's request this section checks each of C7's claims
by a route of my own and extends them. The verdicts are CONFIRMED, CORRECTED or EXTENDED.

**My route:**
- the texts from my own Python reader of the disc's `RUN/LOCALE/STATES/*LOC.ZAR` (`scratch/C8/loc_dump.py` ->
  `out/loc_all.tsv`, `out/loc_peer.out`; 1,930 rows);
- the dialogs from `$PORT/tools/dump-dialogs.ts`, run from my scratch folder against the `$PORT` sources
  (`tsconfig.port.json`; outputs `out/dlg_*.txt`, `out/sets_*.txt`);
- the scripts' op streams from my own `uiops.ts` over the port's `decodeUiProgram` (`out/uiops_*.out`);
- every `D:L` below checked by `decomp_cites.py` (PASS).

### 7.1 Q1. A kick for idling or lag: what shows, and after how long -- CONFIRMED, EXTENDED
- **No idle or lag kick: confirmed.**
  - The only way to the kick screen `dlgNetBanned.rdr` from a player's own game is `dlgMultiplayerRound`'s
    `ExitOnStart`, at the round-end screen. My op dump (`out/uiops_round.out`) reads: IF `HaveBeenBannedFromGame`:
    `BanSelfFromGame`, WAIT 0.5, `GameStatePopCommand(dlgNetBanned.rdr)`; ELSE WAIT 5 and the `ReplayMission` loop.
  - `HaveBeenBannedFromGame` (`FUN_002c3550`) is true when the votes exceed **half** the voter's side. The test is a
    strict `>`: `count/2.0 < votes`, D:L165002 and D:L165078.
  - The ELF's other references to `dlgNetBanned.rdr` are the spectator-eject handlers, D:L159609 and D:L159633.
- **EXTENDED: the vote's writer, which C7 left owed.** `FUN_002ba040` is registered for the in-game message "Voter"
  (0x3f2420; `FUN_0030cff0(.., 0x2ba040, 0x3f2420)` at D:L159131). It writes the sender's slot byte +0x48 through
  `FUN_002c3a20` (D:L165175).
- **EXTENDED: a second visible text.** On each vote the target's HUD chat line shows **"Voting: You have %d votes
  against you."** (0x3f26c0, D:L159765, through `FUN_002b6530` on 0x4366a0). That message is in the ELF, not in
  UIMnLOC.
- **The screen, confirmed.** `dlgNetBanned.rdr` shows three texts together:
  - #539 `_539_YouveBeenKicked_MSG` "YOU HAVE BEEN KICKED FROM THIS GAME" (320,150, scale 0.8);
  - #541 `_541_AbortingMissionNoDot_MSG` "ABORTING MISSION" (320,200, scale 0.6);
  - #540 `_540_ReturningSocomEll_MSG` "RETURNING TO SOCOM II ONLINE..." (320,236, scale 0.6).

  Its ONSTART is `DisconnectFromGameServer`, **WAIT 4**, then `exit_lobby` -> `ReturnToWorldOfSOCOM`
  (`out/uiops_banned.out`). TRIANGLE leaves at once.
- **The 90 s timer, confirmed.** `TimeoutMonitor` is WAIT 90 then `GameStatePopCommand(dlgNetError.rdr)`
  (`out/uiops_round.out`). It is a stall guard on the round-end screen, not a kick.
- **Not held:** an idle or lag kick timer. Searched: the ELF strings (kick, idle, afk, lag, timeout) and the 303 UI
  animation sets' names (`out/sets_all.txt`). Owed: a two-console session with one player idle through a round.

### 7.2 Q2. A second login of a logged-in account -- CONFIRMED
- `FUN_002eefa0`, the AccountLogin reply (tag 0x3f4a80), handles a failed status as follows:
  - -998 (D:L191166) goes to state 10;
  - **-997 (-0x3e5, D:L191170) raises `MP_PLAYER_LOGGED_IN`** (0x3f4a90, D:L191172);
  - -978 raises `MP_INVALID_PASSWORD`;
  - anything else raises `MP_MEDIUS_ERROR` "Login Failure".
- `dlgNetConnect.rdr` binds `MP_PLAYER_LOGGED_IN -> OnPlayerLoggedIn`: POPUPDIALOG **#543** `_543_AccountInfoAlready_MSG`
  "The account information you provided is already logged in to SOCOM II Online. Please use a different Player Name
  and Password or log out the other player account. ¦ CONTINUE.", then `exit_connect_screen` =
  `SWITCHMENU(PREVIOUS_SCREEN)` (`out/dlg_dlgNetConnect.txt`). **PROVEN.**

### 7.3 Q3. A new persona's name is refused -- CONFIRMED, EXTENDED (C7's "client rules not found" is filled)
- **The refusal, confirmed.** Before registration the client sends a text filter of **type 0 (pass/fail)** on the
  account name (0x66a4f4, D:L190941). On a negative result `FUN_002eea70` raises `MP_FILTER_FAILURE` (D:L190966) and
  goes to state 6. `dlgNetConnect.rdr` binds `MP_FILTER_FAILURE -> OnFilterFailure`: POPUPDIALOG **#544**
  `_544_PlayerNameQuestable_MSG` "The Player Name you selected could not be registered due to questionable content in
  the name. Please select another name and try to login again. ¦ CONTINUE.", then back to the previous screen (the
  persona form).
- **#304 is dlgCreateGame's, confirmed:** "You must enter a valid game name before game creation can occur. ¦
  CONTINUE." (`--msg-users 304 304`). It is not a persona message.
- **EXTENDED: a second, silent filter at entry.** The persona form's `OnSKBApply` calls `NetCensorText`
  (`FUN_002776e0`, D:L122960-122978). It sends a **type 1 (replace)** text filter (`FUN_002f4df0`, D:L194753) and
  the callback `FUN_002777c0` (D:L122982) writes the reply's text **back into the field** (PLAYERNAMEVAR or
  PLAYERHOMETOWN). There is no popup: the typed name can come back altered by the server. The alteration (asterisks?)
  is the server's and unobservable for Sony. The port's `NET_CENSOR_TEXT_PLACEHOLDER` (C5a) is this call.
- **EXTENDED: client-side name rules** (research 119 R119.3-R119.6, R119.9, read from the disc's `GetTextInput`
  blocks and agreeing with the PC runtime's open-line log):
  - the keyboard `CREATEPLAYERNAME` with purpose #455 "Enter Player Name";
  - **at most 14 characters and 31 UTF-8 bytes** (a 15th key plays `.NEG`);
  - `NoDQuote`: `"` types `'`;
  - the characters are those of the keyboard's grid;
  - ENTER on an empty, all-blank or unchanged text is a cancel (no `AllowEmpty`);
  - the card keeps NAME in 0x20 bytes (D:L199062ff).

  **No reserved-name list** was found: the ELF strings searched for reserved/invalid/illegal/vulgar give only an
  unrelated "Reserved" (0x3ed270). The `NameIsVulgar` valve's writer is not in the sets (research 153 §7). Reserved
  names were therefore the server filter's business.

### 7.4 Q4. The host leaves before launch; a game ends because too few players remain -- CONFIRMED in part, CORRECTED (#529)
- **The host leaves in the game lobby, confirmed: no message, the role migrates.** `Session_master_migration`
  (`out/uiops_gamelobby.out`) waits in a 1 s loop while not session master. When the console becomes master it
  disables PlayerReady, enables **Lock**, calls `OnStartGameLock`, and runs `Watch45SecClock` every second (the new
  host inherits the 45-second launch clock), then re-enables PlayerReady. It carries no message id.
  - The lobby's network-loss path `MP_MEDIUS_ERROR -> OnNetError` shows #365 "You have been disconnected from SOCOM
    Online.", then either `SWITCHMENU(REBOOT)` or `DisconnectFromGameServer` and back to the briefing room.
    **EXTENDED:** the REBOOT branch exists, so it is not always the briefing room.
- **Too few players, confirmed: `dlgNetAbandoned.rdr`, #528.**
  - The ClientLeaves handler `FUN_002bc530` is registered with the joins handler at D:L158901. When the game object's
    +0xcc is set, it pushes `dlgNetAbandoned.rdr` when the client count minus pending joins is **below 3**
    (D:L161139). When +0xcc is clear it calls `FUN_002c00f0` instead.
  - On screen: `DisconnectFromGameServer`, then the popup **#528** "All players left the game before you were able to
    join. Please try again.", then `ReturnToWorldOfSOCOM` (`out/uiops_abandoned.out`).
  - Grade STRONG for the screen and the threshold operand; the meaning of +0xcc stays BELIEVED (C7's caveat).
- **#529 CORRECTED.** C7 says `dlgNetAbort.rdr` (#529 "ABORTING MISSION.") is reached only by
  `MP_VERSION_NUMBER_ERROR`. The ELF has a second route:
  - The mission state machine `FUN_002a9b30`: online (`DAT_0045a0c1`), when the state becomes **4**, it waits 3 s
    (D:L150620) and sets the next dialog to `dlgNetAbort.rdr` (D:L150624).
  - State 4 is entered when the `mission_abort` valve is set: the valve is the game object's +0x1ac (D:L151848), and
    D:L151146 / D:L151158 move the state to 4 on it.
  - dlgNetAbort then shows #529 with #531 "RETURNING TO SOCOM II ONLINE" (#530 "RETURNING TO LAN BRIEFING ROOM" on
    LAN), does `DisconnectFromGameServer`, **WAIT 3**, and returns to SOCOM II ONLINE (`out/uiops_abort.out`).
  - **Not traced:** who sets `mission_abort` in an online game. No UI animation set names it (`out/sets_all.txt`); the
    pause menu's "...to abort the game?" (0x3e3d00) is the likely writer. Owed: that writer, or one capture of a
    player quitting a live game.
- **#352 / #353, confirmed:** dlgGameLobby's prompts for joining a game already started (spectate / ghost). They are
  not leave messages.

## 8. Sourced but not implemented (multiplayer-relevant)

1. **The game name's room suffix** (U1): CREATE GAME must send `<name>$~<room>`. Without it two rooms cannot hold
   games of one name, and the B_43 list's cut (`drawnName`) has nothing to cut.
2. **The persona key includes PORT** (#14): `withPersona` must match HOST, PORT and NAME.
3. **The card's ifc type is `nic`** (#5).
4. **Sony's mcman: 3 handles, -5 for a closed handle, handles dropped after a card error** (U4, U5). Today the port
   follows the recomp stub (32 handles, NoEntry).
5. **netcnf's row number is the combination's number, the list's head count is 6 on a card, and a malformed index is
   an empty list** (#6, #8, #9, the C5a lead).
6. **USERS = UserCount** from the universe reply (U7): when ONL-07 brings a lobby, the universe text's `userCount`
   should be the logged-in count, not the page count.

## 9. Leads for other workstreams

- **C5a (front-end screens):** `NETCNF_DEFAULT_INDEX_READING`: head +4 is the first index entry's combination number
  and head +0 is 6 for `mc` (EZNETCNF 0x6f8-0x710). `NETDEVICE_LIST_READING` / `NETCNF_IOP_PLACEHOLDER`:
  `EZNETCNF.IRX`'s `rpcDispatch` (0x8c8) serves functions 0 (count), 1 (combination list) and 2 (`getProperties`,
  0x7b0, which loads the named combination with `loadEnv` and `sceNetcnfifReadEnv`). Its symbols make those reads
  quick (`irx.py syms`).
- **C5a / OPT-05:** the EE card probe's states (1 unformatted, 2 no PS2 card, 6 type 2 with -5) and mcman's -2 / -5
  sources (#3-4).
- **C1 (server texts):** the universe reply's layout is confirmed field by field (`FUN_002fdaf0`): name +0x1c, DNS
  +0x9c, Port +0x11c, Status +0x220 (the ONLINE cell is `Status == 0`), UserCount +0x224, MaxUsers +0x228. The
  persona HOST is the DNS string our `texts.json` universe sends, so an empty DNS files every persona under HOST `''`.
- **Anyone reading IOP modules:** `stubs.py` plus EZNETCNF's symbols name every sysclib/ioman import index. The
  approach extends to `NTGUI2.IRX`, `INET*.IRX` and `MCSERV.IRX` on the same disc.

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
| 27 | the netcnf ifc type is `nic`, not `eth` | C8 | CONFIRMED | my own key from ID bytes `00 ac ff ff ff ff b9 86` decodes `ifc000.dat` to header, blank, `type nic`, `dhcp`; both k[18] candidates give `nic` |
| 28 | `withPersona` omits PORT from the record key | C8 | CONFIRMED | D:L199058-199062 matches HOST strcmp, +0x80 word, +0x84 strcmp; the writer emits +0x80 under "PORT" (0x3f5d60); port `persona.ts:176` uses HOST+NAME |
| 29 | the card driver holds 3 open files (the port has 32) | C8 | CONFIRMED | MCMAN .text 0x6b84-0x6bbc: `slti fp,3` over a 0x30-stride table; none free -> -7 |
| 30 | SAVE PASSWORD NO: the record carries no PASSWORD node | C8 | CONFIRMED | 0x2fd0ec `movz t0,zero,t3`; the writer emits PASSWORD (0x3f5d50) only when non-empty and SAVEPASSWORD set |

### 10.2 Claim 27: netcnf `type nic` -- CONFIRMED

- I built the 24 counts from C8's ID bytes through the schedule myself, rather than recovering them from the header
  (`v_netcnf.py`). With `b9` the files decode cleanly to the header, a blank line, `type nic` and `dhcp` (52 B). The
  dev file decodes to `type nic`, `vendor "SCE"`, `product "Ethernet (Network Adaptor)"`, `phy_config auto` (113 B).
- With the other candidate (`19`) only the blank line and one product byte break; `nic` is the same.
- Caveat: the files are what Sony's set-up program wrote on the desktop's PCSX2 cards, which is the right evidence for
  "what a real card holds".
- The port's `netcnf.ts:52` `type: 'eth'` is wrong.

### 10.3 Claim 28: The persona key includes PORT -- CONFIRMED

- D:L199058-199062 matches HOST (strcmp), +0x80 against `param_3`, and +0x84 (strcmp). The writer `FUN_002fc440`
  emits +0x80 under the key at 0x3f5d60, which reads `PORT` from the ELF; +0x00 is `HOST` (0x3f5d38) and +0x84 is
  `NAME` (0x3f5d40).
- The port's `persona.ts:176` matches `HOST && NAME`.

### 10.4 Claim 29: Three open files -- CONFIRMED

MCMAN.IRX (disc `RUN/IRX`), .text 0x6b84-0x6bbc: `lb 0x61c0(base+i*0x30)`, `slti fp,3`; when no entry is free,
`addiu v0,zero,-7`. The port's `libmc.ts:55` has 32 (the recompilation stub's). The game never nears either limit, as
C8 notes.

### 10.5 Claim 30: SAVE PASSWORD NO stores no PASSWORD -- CONFIRMED

- 0x2fd0ec `movz $t0,$zero,$t3` nulls the password argument when the save flag is 0. The writer writes `PASSWORD`
  (0x3f5d50) only when +0xa4 is non-empty and +0x1314 (`SAVEPASSWORD`, 0x3f5d80) is set.
- C8 grades the observable behaviour equal to the port's `{length: 0}`. That is right for a reload. The card's bytes
  differ (no node versus an empty node), which matters only to `PERSONA_FILE_EXTRA_RECORD_BYTES` sizing.

### 10.6 What an implementer should take from this (the verifier's list, for all seven reports)

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
