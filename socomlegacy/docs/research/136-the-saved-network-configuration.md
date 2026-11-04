# 136 -- The saved network configuration on the virtual card (ONL-01a)

Written 2026-10-02 for ONL-01a (`../roadmap/05-online-front-end.md` "ONL-01a"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R3 and OT.R6). Sources: PC research 18:153-160 (the configuration
made with Sony's set-up program and saved to the card), research 128 §2.3-2.4 (R128.5, R128.6: `dlgNetLogin`'s rows,
`NetCnfOpen`), the game's decompilation (`D:L<line>`), the retail disc's `RUN/IRX/NETCNF.IRX`, `RUN/IRX/EZNETCNF.IRX`,
`CNF/`, `DEV002.CNF` and `IFC003.CNF` (names, strings and sizes only), the PC project's PCSX2 card that holds a
configuration (listed, §1), and the desktop recompilation's eznetcnf stand-in as evidence only
(`desktop@be55783:third_party/ps2recomp/ps2xIOP/src/modules/eznetcnf.cpp`). The code is `packages/card/src/netcnf.ts`;
its tests `packages/card/test/netcnf.test.ts` (CI, a card built in the test) and `tools/test/netcnfDisc.test.ts` (dev
host: the disc). Confidence: **reading, pending review** for every transcription; §5 lists the placeholder and the
readings.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R136.1 | **The configuration is the folder `BWNETCNF` with six files**: `SYS_NET.ICO` 33,688 B, `icon.sys` 964, `dev000.dat` 113, `BWNETCNF` 99 (the index), `ifc000.dat` 52, `net000.cnf` 100 -- 39 clusters with the folder on the stub's card | the PCSX2 card, listed; `NETCNF.IRX` strings; the disc's `CNF/` | §1 |
| R136.2 | **The index is one `%d,%d,%s,%s\n` line an entry -- type, state, file, name**: `0,1,net000.cnf,Combination1`, `1,1,ifc000.dat,Setting 1`, `2,1,dev000.dat,SCE/Ethernet (Network Adaptor)`; the combination file joins the two attachments: `interface "ifc000.dat + dev000.dat" "ifc000.dat" "dev000.dat"` | the PCSX2 card; `NETCNF.IRX` 0x9abc | §1 |
| R136.3 | **LOGIN's row and HARDWARE line are the interface's and the device's names**: the key (+8) is the combination's name `Combination1`, the row's name (+0x28) the interface's `Setting 1`, the HARDWARE line (+0x48) the device's -- a reading of eznetcnf through the capture `A_31` | `A_31`; research 128 R128.5-R128.6 | §2 |
| R136.4 | **`NetCnfOpen`'s rows**: below 0, NETCNF_ERROR with errno = -result (#585 for 15, else #586); 0, an empty list (#578); else a row an entry whose flags are not negative, numbered i + 1 over all entries, its name `%s` under 31 characters, else `%.32s...` | `FUN_00277dd0` D:L123192-123234 | §3 |
| R136.5 | **Our server is in the interface settings' file** (`ifc000.dat`'s JSON `server`), a browser adaptation: the console's interface settings lead to a server through DNS, which OT.R3 skips | OT.R3 | §4 |

## 1. The files on the card

**Names.** `RUN/IRX/NETCNF.IRX` (65,805 B; Sony's netcnf library, the module `EZNETCNF.IRX` imports
`sceNetCnfGetCount`, `sceNetCnfGetList` and `sceNetCnfLoadEntry` from) holds the card layout among its strings:
`/BWNETCNF/BWNETCNF` (0x9a44), `/BWNETCNF` (0x9acc), `BWNETCNF` (0x9a7c), the file patterns `%snet%03d%s`,
`%sifc%03d%s`, `%sdev%03d%s` (0x9a98-0x9ab0) with the suffixes `.cnf` (0x9a6c) and `.dat` (0x9a74), the index line
`%d,%d,%s,%s\n` (0x9abc), the icons `SYS_NET.ICO` and `icon.sys` (0x9a2c, 0x9a38), and the usage line `icon=<icon-path>
iconsys=<iconsys-path>` with `-no_check_capacity` (0x9814-0x9868). `tools/test/netcnfDisc.test.ts` finds each.

**A card that holds one** (the block's unknown). PC research 18 c made the configuration once on PCSX2 (EDIT NETWORK
CONFIGURATIONS -> Add Setting -> slot 1 -> Ethernet -> PPPoE not required -> IP automatic -> DNS automatic -> "Setting
1") and copied the card to the second instance. Listed 2026-10-02 with mymcplus 3.0.5 over read-only copies of the PC
project's `tools/pcsx2/memcards/Mcd001.ps2` and `tools/pcsx2_b/memcards/Mcd001.ps2` (their `BWNETCNF` folders the same; neither card
copied into this tree): the root holds `BASCUS-97275SOCOMII` and `BWNETCNF`; `BWNETCNF` lists, in its directory order,

| file | bytes | clusters (1 KB) |
|---|---|---|
| `SYS_NET.ICO` | 33,688 | 33 |
| `icon.sys` | 964 | 1 |
| `dev000.dat` | 113 | 1 |
| `BWNETCNF` | 99 | 1 |
| `ifc000.dat` | 52 | 1 |
| `net000.cnf` | 100 | 1 |

and a deleted `BWNETCNF.tmp` (99 B, its exists bit clear: the index rewritten through a temporary file). The listing's
dev tool is mymcplus, not one under `tools/`: R7 dropped the card filesystem, and `tools/cardFile.ts` reads saves,
not card images. The icons are the disc's `CNF/SYS_NET.ICO` and `CNF/ICON.SYS`, byte counts equal (the dev-disc test).
`BWNETCNF` and `net000.cnf` are plain text, and their lengths are their sizes: the index's three lines (R136.2) are 99
characters; `net000.cnf` is Sony's header line `# <Sony Computer Entertainment Inc.>`, a blank line and the
`interface` line, 100 (the unit test builds both texts). `ifc000.dat` and `dev000.dat` are encoded (`.dat`;
`NETCNF.IRX` "decoding error (magic="; the game's own "Your Network Configuration file was created on another
PlayStation 2 console" at 0x3eebd0 for errno 15), not decoded here.

**Here** the six files are written with these names and sizes, their `data` our JSON (R7): the index's lines as
`{ entries: [{ type, stat, file, name }] }`, the combination as `{ interface: { name, ifc, dev } }`, the device as the
disc's `DEV002.CNF` (`type nic`, `vendor "SCE"`, `product "Ethernet (Network Adaptor)"`, `phy_config auto`), the
interface as `IFC003.CNF`'s Ethernet with DHCP (`type eth`, `dhcp`) plus our server, the icons `null`
(`NETCNF_ATTACH_CONTENTS_READING`: the card's encoded files were not decoded). On the stub's card the folder and the
files take 39 clusters; the unit test holds the fall in free space.

## 2. The columns (eznetcnf's answer)

`NetCnfOpen(mc0:|mc1:)` (`FUN_00277dd0`, D:L123168-123237) passes the device to eznetcnf's RPC function 1
(`FUN_001e8740`, D:L48670), which fills the list at 0x457c40: a 48-byte head, then 0x68-byte entries, +0 the flags,
+8 the key, +0x28 the name, +0x48 the third column (research 128 §2.4). eznetcnf is an IOP module, not decompiled; its
symbols name `getCombinationList`, `getDisplayName`, `getCombinationValue`. Which name fills which column is a reading
(`NETCNF_COLUMNS_READING`): the capture `A_31` shows "1 Setting 1" and HARDWARE "SCE/Ethernet (Network Adaptor)" from a
card whose index names `Combination1`, `Setting 1` and `SCE/Ethernet (Network Adaptor)`; so the row's name is the
interface's and the HARDWARE line the device's, and the key -- which `NetCnfCurrCombo` (`FUN_00277bf0`, D:L123125)
compares and `NetCnfSelectCombo` (`FUN_00277ab0`, D:L123082) hands to RPC function 2 as a combination's name (the
stand-in's notes, `eznetcnf.cpp:14-15`) -- the combination's. The stand-in writes the hardware name at +8 and nothing at
+0x48 (R128.6): this module puts the combination's name at the key and the device's at the HARDWARE line.

`netCnfCombinationList(mc, 'mc0:')` reads the card through PLAT-26a's libmc only (Open RDONLY, GetDir for the size,
Read, Close): the index, then for each combination its file and its interface settings' file (for the server). A card
with no index is an empty list (`NETCNF_NO_INDEX_IS_EMPTY_READING`: `A_05` shows #578, not an error); an index or a
file not in our JSON's shape, or a file the index names missing, is `NETCNF_MALFORMED_RESULT_PLACEHOLDER` (-1); a libmc
failure is passed as it is.

## 3. The rows

`netCnfRows` / `netCnfOpen` transcribe D:L123192-123234: a result below 1 and not 0 posts NETCNF_ERROR with
`NETCNF_ERRNO` = -result (D:L123199-123206), which `OnNetCnfError` shows as #585 for 15 and #586 otherwise (research
128 §2.3); 0 is an empty `NETCNF_DB` (LOGIN then shows #578 / #581). Otherwise each entry is formatted -- `%s`
(0x3eebc8) when its length is under 31 (`FUN_00199288`, its argument lost in the decompilation), else `%.32s...`
(0x3eebb8) (D:L123214-123219) -- and rowed when its flags are not negative (D:L123220) as (i + 1, the name, the +0x48
string) (D:L123221-123225), i counting every entry. The selected row (`NetCnfCurrCombo`, the list's default) is
ONL-01's, with the screen.

## 4. The first-use write and the server

The original never writes the configuration from the game: Sony's program does, behind EDIT NETWORK CONFIGURATIONS
(N18), which OT.R3 does not build. `ensureNetCnf(mc, port, server)` is OT.R3's write ("a card with none gets it
written at first use"): when the index is absent (GetDir lists no `BWNETCNF` in the folder), it checks the space
first, as netcnf does unless `-no_check_capacity` (a card without room gets nothing, FullDevice), makes the folder and
writes the files through libmc (Open WRONLY|CREAT|TRUNC, Write of the nominal size and the JSON, Close), **the index
last** (the unit test holds the order), so a write cut short leaves no index and is made whole at the next first use.
The space counted is what is still missing: a file a cut-short write left is rewritten in place (TRUNC), so only the
clusters it lacks count. One case leaves an index: a write cut short between the index's Open, whose CREAT makes the
file on the card (libmc's Open), and its Write leaves it 0 bytes; every index this write finishes is 99, so a 0-byte
index is taken for absent and written again (fix round, 2026-10-02: before it, that card answered #586 for good). An
index present with any content -- whatever it holds -- is never rewritten. Nothing is drawn for the write (the block's unknown; ruled by no one yet). The card's own creation order
(the listing's) is not observable over the stub, whose GetDir sorts by name.

`server` is the caller's string (the viewer's central server; ONL-01 passes it). It lives in `ifc000.dat`'s JSON: the
console's interface settings hold the DNS through which the game's hostnames reach a server; OT.R3 skips the DNS
("we have a central host"), so ours names the server itself -- a browser adaptation, read back as the entry's
`server`, which is not in the original's 0x68-byte entry.

## 5. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `NETCNF_ATTACH_CONTENTS_READING` | the device `nic` / `SCE` / `Ethernet (Network Adaptor)` / `auto`; the interface `nic`, DHCP (was `eth`: mended 2026-10-04) | the card's `ifc000.dat` and `dev000.dat` were decoded by the C8 card (#5: `ifc000.dat` = `type nic` + `dhcp`, `dev000.dat` as ours); the decode is the evidence, held outside the tree (no card bytes enter git, research 102); the row stays until the reviewer re-reads it at the source | a reviewer's re-read of the decode over the PCSX2 card's files |
| `NETCNF_COLUMNS_READING` | key the combination's name, row the interface's, HARDWARE the device's | eznetcnf is not decompiled; `A_31` and the card's index agree with it | a read of `EZNETCNF.IRX`'s `getCombinationList` / `getDisplayName` |
| `NETCNF_ENTRY_FLAGS_READING` | 0 | the EE rows an entry with flags not negative (D:L123220); eznetcnf's value is not read | the same read |
| `NETCNF_NO_INDEX_IS_EMPTY_READING` | true: no index is count 0, #578 | `A_05`; what eznetcnf answers for the missing file is not read | the same read, or a recomp trace of RPC function 1 on a card without one |
| `NETCNF_MALFORMED_RESULT_PLACEHOLDER` | -1 (#586) | a configuration not in our JSON's shape has no original; only -15 (#585) is known of netcnf's errors | netcnf's error codes (`NETCNF.IRX`) |

## 6. What is not done, and where the sources disagree

- **The selected row** (`NetCnfCurrCombo`, the list head's default at +4) and `NetCnfSelectCombo`'s RPC function 2
  (the interface data handed to eznetctl) are not built: ONL-01's, with the screen; the list's maximum (eznetcnf's
  "ezList length limit reached") is not read -- one configuration is ever written.
- **N5 against the reader**: the recomp's stand-in answers without the card and puts the hardware at the key (R128.6);
  this module follows the reader and the card, not the stand-in.
- **PC research 18 names `BWNETCNF` and `net000.cnf` only**; the card lists six files (R136.1). Both are right: the
  research named what it grepped for.
- **The disc's `.CNF` files end their lines on CR LF**; the card's `net000.cnf` on LF (its 100 bytes count LF). Our
  texts are built with LF, as the card's.

**2026-10-04 (C8-FIX, from `C8-card-online-services.md` (research wave 2026-10-04; held outside the tree, at the controller's) #5).** The interface's type is `nic`, not `eth`: the research wave decoded the original
program's own `ifc000.dat` (`type nic` + `dhcp`); `IFC003.CNF`'s `eth` is the disc's generic-Ethernet pair (NET003); the matching
template for our `DEV002.CNF` is `IFC005.CNF` / `NET005.CNF` (`type nic`), and the game never writes an interface
config itself (it reads net003/net005 from the disc or net_ex.cnf from the card, D:L210469-210489). `NETCNF_ATTACH_CONTENTS_READING.ifc` is `{ type: 'nic', dhcp: true }` and a new card gets that. **Saved
cards:** a card written by an earlier build holds `type eth`; nothing here validates the type (the reader takes the
index and the net file only, and `ensureNetCnf` skips a card that has the index), so such a card is read as it stands
and never rewritten -- both are read (`netcnf.test.ts`, "still read, and not rewritten"). The name keeps its suffix
until the reviewer re-reads the decode; the C8 card's other netcnf findings (#6 row numbers, #8, #9, the list head's 6)
are not done here.
