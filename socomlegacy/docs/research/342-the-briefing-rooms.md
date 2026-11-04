# 342 -- The briefing rooms: no reader of `mp_rooms.rdr`, what the room list takes, and the rooms central answers (SA-1)

SA-1 of the server split (`../plans/2026-10-17-server-split.md`, SA.R4, SA-1, SA-17), simulation track, research only,
2026-10-17. Reading for every transcription and search below (the decompilation was re-read on this host; reviewed
2026-10-17, PASS WITH FINDINGS, the findings folded); placeholder where §6 names it; no original-running comparison:
no capture of a retail server is held anywhere the repository can reach (§3).

Sources: the retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` its line, `FUN_<addr>` its
functions; cited, never pasted), its strings dump `socom2_game.elf.strings.txt` (`S:0x...`, the address of a string),
the C library's names from `recomp/socom2_names.csv` (0x1988d0 `sprintf`, 0x198b80 `strcasecmp`, 0x198f18 `strcmp`,
0x199060 `strcpy`, 0x199288 `strlen`, 0x199648 `strncmp`, 0x1999c0 `strrchr`); the US disc tree (`SOCOM_DISC`) through
ONL-33's pin `tools/test/onlineDialogs.pinned.json` (`mpRooms`, re-derived from the disc by
`tools/test/onlineDialogsDisc.test.ts`) and a byte search for names (§1.3); reCOM's clone under
`SOCOM_PC_ROOT/research/recom` (SOCOM 1, at its commit 5b05af1); the captures under `SOCOM_PC_ROOT/logs/parity/`; the
desktop at the pin `be5578311` (`desktop@be5578311:<path>:<line>`). No server was contacted, no game, browser or test
was run. It stands on research 128 (§5, the table; R128.11), 154 (the pairs and the room set), 161 (the room list:
R161.1-R161.5), 162 (the join: R162.1, R162.4) and 163 (CREATE GAME's play list), and does not restate them.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R342.1 | **The retail client has no reader of `mp_rooms.rdr`.** Every `.rdr` is found by its member name (`FUN_0032f630` -> `FUN_0032c040`, the name's basename looked up in each mounted archive); the loader's 29 calls with a literal name name other files, and every call handed a name traces to an ELF string, a format whose result cannot be this name (`%sLOC.rdr`), a SWITCHMENU target, the program's arguments or disc data; the one direct call of `FUN_0032c040` asks for `chartype.rdr` (D:L405178), and the 27 direct archive lookups (`FUN_00258650`, `FUN_00258740`: models, textures, map and save data) are held by the byte search. No executable on the disc holds the bytes `rooms` in any case, and the disc holds `mp_rooms` once: READERC's own key. R128.11 is settled: no reader (`MP_ROOMS_READER_READING`, research 128 §8, answered here) | D:L230477-230619, D:L228183-228231; §1.2's list | §1.1-§1.3 |
| R342.2 | **The table looks like a development leftover carried from SOCOM 1**, read by neither the online nor the LAN path: SOCOM 1's `mp_rooms.rdr` (reCOM's data) holds 15 rooms of the same shape and `LIMIT` 256, the first six of them the same names in the same order; SOCOM II's keeps those six, adds ASIA EAST and ASIA WEST, and puts four test rooms first; its game lists name "TBD MP53", "TBD MP62" and "Test MP99", list map 63 ("After Hours", no `RUN/MP63.ZDB` on the disc) and never map 64 (`RUN/MP64.ZDB`, Shadow Falls) | the pin; reCOM `data/s1/common/dialog/mp_rooms.rdr`; the disc's `RUN/` | §1.4 |
| R342.3 | **What the room list takes from each 0xed answer**: a success status, a world id from 0, the players (+0x20), MaxPlayers (+0x22), SecurityLevel (+0x24), GenericField1 (+0x28), the name (+0x2c, 64 bytes), EndOfList (+0x6c). It draws three columns: the name, the players as `# of PLAYERS`, and GenericField1's low four bits as the four rank icons. MaxPlayers and SecurityLevel are kept and never drawn | D:L184900-184969, D:L184974-185054 | §2.1 |
| R342.4 | **The order is the client's**: GenericField1's high half ascending, then the name's length, then the name without case. With GenericField1 0 on all eight, the list reads EU EAST, EU WEST, US EAST, US WEST, ASIA EAST, ASIA WEST, AUSTRALIA, US CENTRAL; only the server's high half can give the table's own order | D:L185059-185086 | §2.2 |
| R342.5 | **The client hides only** a room with no name, a "+Clan - " room not the member's own clan's, and a name opening "Medius" (case as written). Nothing hides a test room: a room is shown if and only if the server lists it | D:L184995-185006 | §2.2 |
| R342.6 | **A room's limit is the server's to enforce**: the client reads MaxPlayers only into CreateChannel1 (state 20, not reached from the list, R162.1); a full room is the server's JoinChannel refusal ("Cannot join room. It may be full.", S:0x3f49a0). A room record made by the client defaults MaxPlayers to 256 (0x100) before the server's value overwrites it | D:L185223; D:L190249; research 154 §2 | §2.3 |
| R342.7 | **A room has no password from the client's side**: JoinChannel copies its password from S:0x3f48d0, an empty string, so a room the server guards with one cannot be joined | D:L190691 | §2.3 |
| R342.8 | **A lobby named "Medius..." is the main menu to the client**: the list hides it (R342.5); the clan roster's and the friend list's builders draw such a lobby "MAIN MENU" (research 272 §12, 268), and so does the player-information popup, after "BRIEFING ROOM:" (S:0x3f4d48, S:0x3f4d50, S:0x3f4d60) -- read as: the original's server kept a player who had joined no room in a lobby so named. The name past "Medius" is not known: the existing `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` (server `ladder.ts`) | D:L186670 (`FUN_002e6af0`), D:L202759-202762 (`FUN_00301a70`), D:L192027-192034 (`FUN_002f0020`) | §2.4 |
| R342.9 | **Nothing shows the names retail's servers sent.** The room-list captures are of the original against the desktop's Horizon ("Channel 1", "US East (Ohio)", the latter the hosted Horizon's own setting); Horizon's "Alpha".."Delta" are the emulator's; the desktop's research at the pin names no retail room; the s4 slice carries "Channel 1" only as the suffix of a game's name | `logs/parity/`; `desktop@be5578311:docs/archive/CURRENT_SPRINT-to-sprint-8.md:24` | §3 |
| R342.10 | **The answer for SA-17**: the eight regional rooms in the table's order, named as the table spells them (`BRIEFING_ROOM_NAMES_READING`), MaxPlayers 256 (`BRIEFING_ROOM_LIMIT_READING`), GenericField1 0 (`BRIEFING_ROOM_GENERIC_FIELD1_PLACEHOLDER`), SecurityLevel none and no password (R342.7), no test room, and none of the table's game lists made as games | §4 | §4 |

## 1. The reader (R342.1, R342.2)

### 1.1 How the client reads an `.rdr`

`FUN_0032f630` (D:L230477-230619) is the loader: with flag bit 0 clear it first asks `FUN_0032c040` (D:L228183-228231),
which cuts the name to its basename (`strrchr` of '/', then of '\\', D:L228194-228205) and walks the mounted
archives (the list at 0x488514, D:L228207-228221) asking each for a member of that name (`FUN_00258650`, D:L228221) --
by name only; nothing in it or in the archive helpers beside it (`FUN_0032c1e0` open, D:L228236-228264; `FUN_0032c2b0`
close, D:L228269-228305; `FUN_0032c570` index each, D:L228364-228374) walks an archive's members by index. Not found,
it opens the name as a file.

`readerc.zar` (S:0x3e1da8, S:0x3e2da0, S:0x3f1898) is mounted from two directories. From "run/ui" (`RUN/UI/READERC.ZAR`,
the one holding `mp_rooms.rdr`): at the UI's start (`FUN_001f4860`, D:L54801, S:0x3e2db0) and at a mission's load
(`FUN_002ad290`, D:L152581, S:0x3f18a8), unmounted at D:L49721 (`FUN_001ea720`, S:0x3e1db8) and D:L151840
(`FUN_002abd40`, S:0x3f18a8). From "run" (S:0x3f1a50; `RUN/READERC.ZAR`, which holds no `mp_rooms`, §1.3): at the
mission's load (D:L152582), unmounted at D:L152671 (`FUN_002ad290`). Mounting makes the members findable by name; it
reads none of them.

### 1.2 Every load, and the names handed in

The loader is called at 47 places (`grep FUN_0032f630(` over the decompilation, its own definition aside). The 29 with
a literal name, resolved through the strings dump: `uisounds.rdr` (D:L54829, 54857, 55194), `hud.rdr` (58928, 152611),
`hudobjectives.rdr` (152152), `missioncams.rdr` (152157), `mission.rdr` (152347), `materials.rdr`, `decals.rdr`,
`fonts.rdr`, `messages.rdr`, `subtitles.rdr`, `small_messages.rdr`, `motion.rdr`, `mpeg_subtitles.rdr`,
`missionlist.rdr` (152633-152649), `controller.rdr` (166553), `sounds.rdr` (243247, 243267, 243286, 243338),
`dyntex.rdr` (253460), `UiParams.rdr` (283963, 288240), `dynamics.rdr` (419934), `damanim.rdr` (460957), `motion.rdr`
(495489), `animset.rdr` (495532). The 18 handed a name, followed to their callers:

| call (D:L) | in | the name it is handed |
|---|---|---|
| 59680 | `FUN_001ff4f0` | `lensflare.rdr` (D:L59606) |
| 131740 | `FUN_002886c0` | `motion.rdr` (D:L131952) |
| 157264 | `FUN_002b4f40` | `actions.rdr` (D:L152160) |
| 242909 | `FUN_00344450` | a field of the mission's record (D:L152105): disc data |
| 245676 | `FUN_00349670` | `sndjukeboxm.rdr` (D:L152107) |
| 250934 | `FUN_00351d40` | `global_valves.rdr` (D:L152619) |
| 263210 | `FUN_00367430` | the dialog loader (research 105 R105.1): a SWITCHMENU target or the first dialog, from the scripts |
| 296494, 296735 | `FUN_003a2510`, `FUN_003a2c10` | `ftsxp.rdr` (S:0x3e1e10, set at D:L49994) and the program's arguments (a walk from the second, leading '-' cut, "RELEASE" recognised, D:L296469-296494) |
| 297102-297110, 297260-297269 | `FUN_003a3490`, `FUN_003a3900` | built by `sprintf` from "%sLOC.rdr" (S:0x3fbe08) or "DATA\COMMON\ZRDR\LOCRDR\%s\%sLOC.rdr" (S:0x3fbe40): a language table |
| 301362 | `FUN_003aaa90` | `ai_turrets.rdr` (D:L152669) |
| 303417 | `FUN_003ae240` | `ai_vehicles.rdr` (D:L152670) |
| 322057 | `FUN_003cd810` | `zweapon.rdr` (D:L323437) |
| 400494 | `FUN_005337f0` | `vehicles.rdr` (D:L156159) |
| 406981 | `FUN_0053e220` | `character.rdr` (D:L152665) |

The other format that ends in `.rdr`, "%s.rdr" (S:0x3f72f8), is the save manager's (`FUN_0033d410`, D:L238814-238827,
beside "zSaveHeader" and "CSaveModuleList") and goes through the archive lookup `FUN_00258740`, not the loader.

Beside the loader, two ways reach a member by name directly:

- `FUN_0032c040` itself is called once outside the loader: `FUN_0053b4b0` asks for `chartype.rdr` (S:0x65b308,
  D:L405178).
- The archive lookups `FUN_00258650` (24 calls) and `FUN_00258740` (3) -- 27 in all, one of them `FUN_0032c040`'s own
  (D:L228221) -- otherwise take the keys of models, textures, map data and save data ("Anim_Sets", "Clutter",
  "visuals", "world_tree", "textures", "zSaveHeader", "CSaveModuleList" and names built from those records). None
  can name `mp_rooms`: a name they are handed comes from the ELF or from disc data, and §1.3's byte search holds both.

### 1.3 The disc and the executables, searched

A name the loader could be handed comes from the ELF's strings, from `sprintf` over them, or from data read off the disc
(scripts, mission records, the program's arguments -- on the disc, whatever the boot loader `SCUS_972.75` hands it).
A case-insensitive byte search over every file of the disc tree but its 69 `.PSS` movies (a throwaway script in the
session's scratch directory, not kept; the ZAR and ZDB archives store their members uncompressed --
`packages/archive/src/zar.ts`, `zdb.ts` -- so a name inside any member is in its archive's bytes) found:

- `mp_rooms`: once on the whole disc, in `RUN/UI/READERC.ZAR` -- its own key in the archive's string table. No
  script set (`UIZANIM.ZAR` and the rest), no dialog, no mission file, no other READERC (`RUN/READERC.ZAR` holds none)
  names it.
- In `socom2_game.elf`, `SCUS_972.75` and `SCUSNGUI.ELF`: `rooms`, `mp_room`, `roomname` and `mission_sequence` 0
  times each. The strings dump agrees: no ELF string contains `rooms` (the "room" strings are the lobby's --
  `RefreshRoomList`, `ROOMLISTVAR`, `JoinMPRoom`, `room_rank_bits`, the three join failures, "BRIEFING ROOM:").
- The eight regional names and the test rooms' names (`us central` .. `asia west`, `rtime test`, `sony test`,
  `test pit`): only in `RUN/UI/READERC.ZAR` (mp_rooms.rdr's string table), never in a locale table.

So no load can be handed `mp_rooms.rdr`: the name is in no executable, no built name can produce it, and no disc data
other than the key itself spells it. The table is loaded by nobody, online or on the LAN (both paths are this ELF).

### 1.4 What the table looks like (R342.2)

- **SOCOM 1's table.** reCOM's clone holds SOCOM 1's `data/s1/common/dialog/mp_rooms.rdr` as text: 15 rooms, each
  `LIMIT` 256, with the same `GAMENAME` / `FRIENDLYFIRE` / `MAXPLAYERS` / `MISSION_SEQUENCE` games -- US CENTRAL, US
  EAST, US WEST, EU EAST, EU WEST, AUSTRALIA, then DEUTSCHLAND, ESPAÑA, FRANCE, ITALIA, U. K., ASIA NORTH, ASIA SOUTH,
  HANGUK, NIHON. reCOM's sources name no reader of it. Where reCOM's data came from is not established here (desktop
  research 11 is the rule for what of reCOM holds for SOCOM II).
- **SOCOM II's edit of it** (the pin, research 128 §5): four test rooms first (ZIPPER, RTime TEST, SONY TEST, a
  developer's "Keep out" room), then SOCOM 1's first six in SOCOM 1's order and ASIA EAST, ASIA WEST.
- **A pre-release map list.** The game lists name map 53 "TBD MP53" and map 62 "TBD MP62" (the disc's maps are
  Foxhunt and Enowapi, research 172's map table), ZIPPER's "Test MP99" (no `RUN/MP99.ZDB`) and "ALPHA MISSIONS";
  map 63 "After Hours" (no `RUN/MP63.ZDB`; After Hours is one of the HDD maps, research 172 §7) is a game of its own
  and is listed by "Medley" (all maps), "Suppression Medley" and ZIPPER's "ALPHA MISSIONS" -- not by the Breach,
  Demolition, Escort or Extraction Medley -- and no game lists map 64 (`RUN/MP64.ZDB`, Shadow Falls, the same table),
  which the disc ships.
- **Not the client's play lists.** CREATE GAME's games are the player's own play list (`PLAYLISTVAR`, research 163
  R163.5), not a room's `GAMELIST`; nothing in the client creates a game from a table.

What the table was for is not read: its keys look like a lobby server's configuration -- a channel's limit, a
channel's games -- but no source says so, and what `LIMIT` limits is itself unread (players per room or games per room:
the client's own fresh room record defaults MaxPlayers to 256, D:L185223, and asks the game list in pages of 256,
D:L184292).

## 2. The channel list's handling (R342.3-R342.8)

Research 161 transcribed the request and the draw (R161.1-R161.5, D:L184852-185088); re-read here at the source, it
holds. What SA-17 needs of it:

### 2.1 The fields (R342.3)

The request is ChannelList_ExtraInfo0 (Lobby 0xec), PageID 1, PageSize 999 (`FUN_002e3aa0`, D:L184880-184895). Each
0xed answer reaches `FUN_002e3b00` (D:L184900-184969): a non-success status (`FUN_002f42d0`, "RoomList") is dropped;
a world id below 0 is dropped (D:L184914); a name already held (`strcmp`, D:L184917-184925) is overwritten in place,
else a record is added (`FUN_002e4240`, D:L185208-185233, copying with `FUN_002e4300`, D:L185238-185277). The fields
kept: status +0x18, world id +0x1c, players +0x20, MaxPlayers +0x22 (D:L184950, D:L185264), SecurityLevel +0x24,
GenericField1 +0x28, the name +0x2c (64 bytes), EndOfList +0x6c, which draws (D:L184964). GenericField2-4, a game
count and GenericFieldLevel are not in the client's answer at all (its name follows GenericField1 at +0x2c).

The draw (`FUN_002e3cc0`, D:L184974-185054) reads of each record only the name (record +0x38), the players (+0x2c) and
GenericField1 (+0x34): a row is [name, players, then 1, 2, 3, 4 for each low bit set -- all four when the low four bits
are 0] into ROOMLISTVAR (D:L185051). The disc's `ROOMLIST` draws them under ROOM NAME, # of PLAYERS, ELIGIBLE RANKS
(R161.4; the captures in §3 show the same three). No limit, no password mark, no game count is drawn.

### 2.2 The order and the filters (R342.4, R342.5)

The records are sorted (`FUN_002e5150` with `FUN_002e3f80`, D:L184988) by GenericField1 >> 16 ascending, then `strlen`,
then `strcasecmp` (D:L185059-185086). For the eight names with GenericField1 0: the four of seven letters first in
case-free order (EU EAST, EU WEST, US EAST, US WEST), then the three of nine (ASIA EAST, ASIA WEST, AUSTRALIA), then
US CENTRAL. The table's own order (US CENTRAL first) is drawn only if the server sets the high halves 0..7.

A record is skipped when its name is empty, when it opens "+Clan - " (`strncmp` 8, S:0x3f3e28) and is not "+Clan - %s"
(S:0x3f3e38) of the player's clan, or when it opens "Medius" (`strncmp` 6, S:0x3f3e48) (D:L184995-185006). No test of a
name for "TEST", "Keep out" or anything of the table's: a test room listed by a server is drawn like any other.

### 2.3 The limit and the password (R342.6, R342.7)

Among the 26 functions that reach the client's room records (every user of 0x44f568 or `DAT_0044f570`), MaxPlayers
(record +0x2e) is read once: state 20's CreateChannel1 sends it with the name (`FUN_002ed740`, D:L190249,
the request at D:L190256), and state 20 is reached only for a record with no world id, which the list never keeps
(R162.1). So the limit is the server's: a full room is its JoinChannel refusal, which the client draws as "Cannot join
room. It may be full. Please try another." (`FUN_002ee3a0`, D:L190704-190774; S:0x3f49a0; research 154 §2,
`ROOM_FULL_STATUS_READING`). The 256 a fresh record carries (D:L185223) is overwritten by the answer's own (D:L185264)
before anything reads it.

JoinChannel's password is copied from S:0x3f48d0 (`FUN_002ee290`, D:L190691), which holds an empty string (the strings
dump lists nothing between "testgame" at 0x3f48c0 and "PasswordValve" at 0x3f48d8; the byte at 0x3f48d0 read through the
ELF's program headers is 0 -- read with a scratch script, owed a re-read with `tools/elfImage.ts`). The room list draws
no password mark and no screen asks for one: a room is joined without a password, always.

### 2.4 The lobby outside the rooms (R342.8)

The player-information popup (`FUN_002f0020`, D:L191724-192146) builds, for a player record holding a lobby name (the
64-byte copy at D:L191798-191808 and its siblings), the line "BRIEFING ROOM:" (S:0x3f4d60, D:L192034) followed by that
name -- or by "MAIN MENU" (S:0x3f4d50) when the name opens "Medius" (S:0x3f4d48, `strncmp` 6, D:L192027-192029). With
the list's own "Medius" skip (§2.2) and the two list builders research 272 names -- the clan roster's (`FUN_002e6af0`,
D:L186670, `strncmp` 6 with S:0x3f4020) and the friend list's (`FUN_00301a70`, D:L202759-202762, S:0x3f6090, "MAIN
MENU" S:0x3f6098; research 268) -- the client treats a lobby so named as the place a player sits before joining a
room. What the original's server called it past "Medius" is not on the disc or in the code: that unknown is already
named, `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` = 'Medius' (`packages/server/src/ladder.ts`, CLAN-DOT; ledgered in research
272 §9 and §12 and in research 101's register), and this note adds no name for it.

## 3. What retail showed (R342.9)

- **Captures.** 36 room-list captures sit under `logs/parity/` (31 distinct images by sha256, 27 distinct file
  sizes). Seven were opened: `s4_pcsx2/A_47_rooms.png`, `frostfire_two_clients_20261008/A_10_rooms.png`, `s11_chat_A/10_rooms.png` and
  `join_owner_lobby/10_rooms.png` show one room, "Channel 1"; `s13_v2_on/A_10_rooms.png`,
  `hosted_join_20260922_143520/10_rooms.png` and `ladder_20260922_234417/A_10_rooms.png` show one room, "US East
  (Ohio)". "Channel 1" is Horizon's simulated database channel (research 154 §3); "US East (Ohio)" is the hosted
  Horizon's own lobby-channel setting (`desktop@be5578311:docs/archive/CURRENT_SPRINT-to-sprint-8.md:24`, a
  `db.config.json` setting). Every opened capture shows the three columns of §2.1 and the four icons of GenericField1 0.
  The other 29 were not opened.
- **The s4 slice** (`logs/parity/s4_pcsx2/slice-Medius.log`, research 159 R159.3, PROVE-1's set) carries no channel
  list; the room appears only as the suffix of the game's name, `test$~Channel 1` (its line 14).
- **Horizon** (`desktop@be5578311:server/horizon-server/Server.Medius/Medius/MLS.cs:3373-3418`, research 154 R154.1)
  makes "Alpha", "Bravo", "Charlie", "Delta", 64 each, when no lobby channel exists: an emulator's choice, evidence of
  the answer's shape only.
- **The desktop's research and documents at the pin** name no regional room and do not mention `mp_rooms` outside the
  web project's own copies (`git grep -i` over `be5578311` for `mp_rooms`, `us central`, `asia west`).

So the names retail's servers sent are not known to the repository, and nothing ties them to the table: the eight
names are the disc's, not a proven list of what Sony's servers answered.

## 4. The answer for SA-17 (R342.10)

| what central answers | value | level | source |
|---|---|---|---|
| the rooms | the table's eight regional rooms, no test room | placeholder (`BRIEFING_ROOM_NAMES_READING`) | the plan's SA.R4 and SA-17; the table (§1.4); the client draws whatever is listed (R342.5) |
| each room's name | US CENTRAL, US EAST, US WEST, EU EAST, EU WEST, AUSTRALIA, ASIA EAST, ASIA WEST, spelled as the table spells them (capitals, one space) | the names a reading of the disc (128's pin, its dev-disc test); that retail sent them, placeholder (`BRIEFING_ROOM_NAMES_READING`) | `mp_rooms.rdr` via `onlineDialogs.pinned.json` `mpRooms` [4..11] |
| MaxPlayers (+0x22) | 256 each | the table's value a reading; its meaning and retail's limit, placeholder (`BRIEFING_ROOM_LIMIT_READING`) | `LIMIT` 256 on all twelve rooms (128 §5); the client's own fresh-record default, D:L185223 |
| GenericField1 (+0x28) | 0 each: every rank admitted, all four icons drawn, the client's own order (R342.4) | placeholder (`BRIEFING_ROOM_GENERIC_FIELD1_PLACEHOLDER`) | the table carries no rank or order field; Horizon's default 0 (research 154 §3) |
| SecurityLevel (+0x24) | none, no password | reading (R342.7) | D:L190691, S:0x3f48d0 |
| the players (+0x20) | the room's members, as research 154 §5 counts them | reading of the column (R342.3); what retail counted, not read | D:L185010 (drawn verbatim) |
| world ids | central's own, from 0 | reading: the client keeps only ids from 0 (D:L184914) and only carries them back | R161.2 |
| the columns | name, # of PLAYERS, the four rank icons: nothing else is drawn | reading (R342.3) | D:L184974-185054; `ROOMLIST`'s layout (R161.4) |
| the test rooms | never listed | the plan's rule; the client would draw them (R342.5) | -- |
| the table's game lists | none made: no game exists in a room until a player creates it | reading: nothing in the client creates a game from a table (§1.4) | research 163 R163.5 |

SA-54 ROOMS-LISTED (2026-10-21) lists a subset of these eight, an adaptation over this answer: §7.

A game's room is in its name (`<name>$~<room>`, R159.3, R163.5) and in the creating player's joined channel; either
gives SA.R4's placement its region. A name that opens "Medius" is never shown as a room, nor a "+Clan - " room but the
player's own clan's (R342.5): a lobby outside the rooms, if central keeps one, takes a "Medius" name -- the existing
`MAIN_MENU_LOBBY_NAME_PLACEHOLDER` (§2.4).

## 5. Unknowns and what is not done

- **The names retail's servers sent** (R342.9): no capture, transcript or document of a retail channel list is known.
  A period screenshot of BRIEFING ROOMS on Sony's servers, or a packet capture of a retail 0xed answer, would settle
  them; the owner may hold such footage (not asked here: a question for the seat to raise).
- **What `LIMIT` limits**: unread, since nothing reads the table (§1.4).
- **The default lobby's name** past "Medius" (§2.4; `MAIN_MENU_LOBBY_NAME_PLACEHOLDER`, research 272 §12).
- **What retail's # of PLAYERS counted** (players in the room only, or with those in its games): the client draws the
  server's number as sent.
- **The sort's stability** (`FUN_002e5150`, not read): equal keys need equal names, which the records never hold (R161).
- **Not done here**: no code, no test. 128's pin already holds every room's name, limit and games, re-derived from the
  disc by `tools/test/onlineDialogsDisc.test.ts` (`mpRooms` compared whole), so SA-17's eight rows need no new pin; the
  absence of a reader (R342.1) rests on the searches of §1.2-§1.3, which a reviewer re-runs. `PROCESS.md`'s research
  range is the seat's (the brief).
- **What would make R342.1 proven**: a call trace of `FUN_0032f630` / `FUN_0032c040` names (PLAT-36) through a whole
  online session -- login, the rooms list, a room, a game, a round -- showing `mp_rooms.rdr` never asked.

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `BRIEFING_ROOM_NAMES_READING` | the eight regional rooms of `mp_rooms.rdr` in its order, spelled as it spells them; no test room | the rooms and names retail's servers listed: the table is the disc's, read by no code (§1), and no capture shows retail's list (§3) | a capture of the original's BRIEFING ROOMS list on Sony's servers, or a transcript of a retail ChannelList 0xed answer | open; held by `packages/central/src/rooms.ts` (SA-17, 2026-10-19), pinned to the table by `test/briefingRooms.test.ts` |
| `BRIEFING_ROOM_LIMIT_READING` | 256 per room, as MaxPlayers | the table's `LIMIT`, whose meaning nothing reads, taken as the room's MaxPlayers -- the client's own fresh-record default is the same 256 (D:L185223); the game list's page size is also 256 (D:L184292) | a retail 0xed answer's MaxPlayers, or a retail JoinChannel refused as full | open; held by `rooms.ts` (SA-17) |
| `BRIEFING_ROOM_GENERIC_FIELD1_PLACEHOLDER` | 0 on every room | what retail's rooms carried in GenericField1: the low four bits the eligible ranks, the high half the list's first sort key (R342.4); the table carries neither | a retail 0xed answer, or a capture of the list showing its order and its icons | open; held by `rooms.ts` (SA-17) |
| `ROOM_PLAYER_COUNT_PLACEHOLDER` | 'members' | what a room's # of PLAYERS (+0x20) counted on retail's servers: the room's members only, or with those in its games (§5); central counts the room's members, a player in one of its games among them (JoinGame leaves no room) | a retail 0xed answer beside a known room, or a capture of the list with games running | open; held by `rooms.ts` (SA-17, 2026-10-19) |
| `MP_ROOMS_READER_READING` (research 128 §8) | -- | what reads `mp_rooms.rdr` | answered by §1 (R342.1): no reader in the retail ELF | resolved here (reading, reviewed 2026-10-17; 128 §5 and §8 point here) |

## 7. SA-54 ROOMS-LISTED: the rooms central lists, an adaptation over the reading (2026-10-21)

The owner, 2026-10-21, in the merge controller's seat: "the online lane created all of the original rooms from the
original game disc. That's accurate to the game, but we only have US-CENTRAL hosting right now. Please hide the rest
for the time being." So the eight of §4 stay the reading (`BRIEFING_ROOM_NAMES_READING`, unchanged, its §6 row
unchanged), and which of them central lists is configuration -- **an adaptation, product track**: it lists a subset of
the reading and never a room the disc's table lacks, so nothing here is a new value of the original's.

- **The set**: `BRIEFING_ROOMS_LISTED_ADAPTATION` in `packages/central/src/rooms.ts`, US CENTRAL alone by default; central
  reads it from `CENTRAL_BRIEFING_ROOMS` (names comma-separated, each one of the eight exactly spelled; empty or unset,
  the default; an unknown name refuses central's start, exit 2, naming it). Opening a room is a settings edit.
- **Hidden everywhere**: a room not listed is not in the ChannelList 0xed answer; a JoinChannel to its world id is
  refused `ChannelNotFound`, the answer central gives an id no room holds (Horizon's, `MLS.cs:3147-3156`, research 154);
  FindWorldByName does not find it and CreateChannel1 makes none (`FIND_WORLD_NOT_FOUND_READING`,
  `NEW_ROOM_STATUS_PLACEHOLDER`); a CreateGame naming it is refused `Fail`, as one naming another room's id (no player is
  ever in it); a placed game of a room the setting no longer lists is not made again at central's open (SA-21's
  rebuild ends it as a normal close, logged with its own reason; its host is told the game ended and the round in play
  is lost, while a round it played before the close still counts inside `RESULTS_ACCEPT_MS`); the room counts, the members view, the presence and the regions iterate the
  listed rooms only.
- **The ids**: each room keeps its world id, `ROOM_WORLD_ID_FIRST_READING` plus its place in the reading's order (US
  CENTRAL 1 ... ASIA WEST 8), whatever the setting names, so an id never shifts when a room opens.
- **The hosts' regions** (`directory.ts` `HOST_REGIONS`) stay the eight's: a host may be validated in a region whose
  room is hidden and takes the listed rooms' games as any host does (the placement's "then any", SA-6).
- **What the client sees**: whatever is listed (R342.5); with one room, BRIEFING ROOMS shows US CENTRAL alone. Whether
  retail's servers listed fewer rooms at times is unknown (§3, §5); nothing here depends on it.
- Held by `packages/central/test/roomsListed.test.ts`; the reading's tests (`briefingRooms.test.ts`, `lobby.test.ts`)
  list the eight, as `CENTRAL_BRIEFING_ROOMS` naming all eight would.
