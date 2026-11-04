# 311 -- CLAN RANKING: the clans' page, its requests, rows and medal, and SOCOM II ONLINE's clan podium (ONL-30)

- Date: 2026-10-14 (web sprint 19's clans' half, the online seat; the row ONL-30 of
  `plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md`, on research 310 §6 item 3 and the server
  CLAN-BOARD-SERVER built, the plan's Log 2026-10-14 11:05Z; written before ONL-30's build, no code changed with it).
- Status: **reading** (reviewed 2026-10-14: the first review FAIL on the clans' list start and a second visit's rule, folded at a5f767656; a narrow re-review PASS, high -- the plan's Log). ONL-30's build (2026-10-14) carries §8.2 items 1-4 and §9's two readings in code (reading, pending review); it found §11 item 9 (L1 on an empty list). Every value of the original below is read from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted), the ELF's strings (`S:0x<addr>`, each
  re-read off the file's bytes for this note) and, where the decompiler loses an argument, the ELF's instruction words
  (`ELF 0x<addr>`, read off the file's load segments by a scratch reader; `tools/elfImage.ts` is the repository's reader
  that would confirm them); the disc's dialogs as the pinned dump holds them (`tools/test/onlineDialogs.pinned.json`:
  `dlgClanLadderLobby.rdr`, `dlgWorldOfSOCOM.rdr`), the two dialogs' list geometry read off `RUN/UI/READERC.ZAR` by a
  scratch transcription of the repository's `parseRdr` (`packages/archive/src/rdr.ts`; the build's dev-disc test reads it
  through `tools/dump-dialogs.ts --tree`), and the captions off `RUN/LOCALE/STATES/UIMNLOC.ZAR`. Source inspection only:
  **no test, node, build or browser was run for this note**, and nothing here is measured on the original running --
  ONL-32's capture of CLAN RANKING against a seeded clans' board is the proven level (§12).
- Stands on research [310](310-clan-stats-and-the-clans-ladder.md) (§3 the pages' three requests and their replies,
  §5's under-eight answer, §6 item 2 as built: the server's `/lobby/total-rankings` type 1, `/lobby/clan-ladder-position`
  (0xd4) and `/lobby/clan-ladder-list` (0xd2)), [269](269-the-players-pages-and-the-medals.md) (§2 the players' page,
  its modes as the disc's sets carry them, §2.4-§2.5 `LADDER_KEYED_CELL_READING` and `CLAN_LADDER_MODES_PLACEHOLDER`),
  [261](261-the-stats-record-and-the-ladder.md) (§9 the players' ladder, medal and tier), [272](272-clan-roster.md) (the
  leader's page and its `GetClanRanking`; the session's `LobbyClan`), [158](158-the-socom-ii-online-menu.md) (§2.4 the
  CLAN RANKING row, its pane and its gate), [116](116-the-menu-input.md) (§5.2 the list's UP/DOWN bound to `NONE`) and
  [97](97-service-shape-and-medius-map.md) (§2.2 the message ids), and does not restate them.
- Code as read (nothing changed): `packages/ui/src/screens/ladderLobbyCommands.ts` (`LADDER_INFO_MODE` L62-65,
  `CLAN_LADDER_MODES_PLACEHOLDER` L113-120, `GetLadderInfo` L420-436, `LadderService` L257-264, the players' state
  L377-386); `packages/ui/src/screens/worldOfSocomCommands.ts` (the `GetLadderInfo` entry's comment L108-111,
  `PARKED_ROW_GATE_READING` L200-222, `PARKED_ROWS` L227-229, the gate L252-266); `packages/ui/src/screens/createClanCommands.ts`
  (`LobbyClan` L130-207, `CLAN_LADDER_POST_PLACEHOLDER` L72-82); `packages/ui/src/uiCommands.ts` (row 162 `GetClanRanking`,
  L264, declared for ONL-30); `packages/ui/src/widgets/listbox.ts` (a cell at the list's left plus its column's
  position, L551-556); `packages/viewer/src/ladderLobbyHost.ts` (`LadderTransport`, `fetchLadderService`,
  `sessionLadder`, `connectLadderLobby`); `packages/viewer/src/frontEnd.ts` (the ladder's mount, L440-443);
  `packages/central/src/ladder.ts` (`totalRankings` L419-422, `clanPosition` L460-467, `clanList` L476-482) and
  `lobbyHttp.ts` (the three cases L397-417).

## 1. The answers

| row | answer | where |
|---|---|---|
| R311.1 | **The page's modes** (`GetLadderInfo`, `FUN_002784d0` D:L123454-123487; the words "CLAN", "Top10", "LadderPressUp", "LadderPressDown", "LadderUp", "LadderDown" mapped by `FUN_00278750` D:L123542-123573): **6 the entry** -- with a clan held, ClanLadderPosition (0xd4) tagged "GetSurrounding", GetTotalRankings "ClanTotal" type 1 (0xd8) and ClanLadderLeaders 10 from 1 (0xd2), in that order; with none, ClanLadderList 14 from 1, the total and the leaders. **7 the podium alone** (SOCOM II ONLINE's: ClanLadderLeaders 10 from 1). **8 / 9 the up / down tests** (the arrows and L1 / L2's IF): the start at 2 or more; the bound at or above the start + 14. **10 / 11 a page up / down** (ClanLadderList from `max(1, start - 14)` when the start is above 1; from the start + 14). Mode 6's second argument, which the decompiler drops, is 1 (ELF 0x2784d4), so the entry asks "GetSurrounding". The total is asked at the entry only; paging sends the list alone; ON_LADDER_REFRESH runs the arrows (8, 9), which send nothing. **The list around the clan starts at the clan's own position** (1 when it is 2 or less; `FUN_002eac70` D:L188856-188860) **and is sent only while no row is held, or at position 2** -- so on a later visit in the same session the page shows the list it last drew (§3.7). | §2, §3 |
| R311.2 | **The page's state** (the lobby object 0x44f370): the list at 0x44f850 -- its count `DAT_0044f854`, records `DAT_0044f858`, **the bound `DAT_0044f85c`** (+0xc) and **the start `DAT_0044f860`** (+0x10) -- the podium's at 0x44f820, my clan's position `DAT_0044f868`, `TotalClans` `DAT_0044f870`, one list request out at a time (`DAT_0044f880`). At boot the start is **2** and the bound 0 (`FUN_00401fa0` D:L328597-328602); the rest is BSS (0). **The bound has three writers**: the position's Success (to the position, D:L188852), the total's (D:L189086) and each row kept (raised to its position, `FUN_002ebcf0` D:L189539-189541) -- research 310 named two. | §3.1, §3.7 |
| R311.3 | **The rows**: a reply row (0x48 bytes kept, `FUN_002ebcf0` D:L189511-189537: the request's tag, the clan id +0x18, the name +0x1c, the position +0x3c, the status +0x40, the end +0x44) is kept unless one of its position is held. The podium (`FUN_002ea800` D:L188697-188727) draws `["%d" of the position, the name]` into CLAN_LADDER_LEADERS; the ranking (`FUN_002ea930` D:L188732-188787) `["%d" of the position, the name, the clan medal]` into CLAN_LADDER_RANKING, the row whose clan id is the client's (`DAT_0044f59c`) with its position and name as keyed cells in (91, 72, 36), then ON_LADDER_REFRESH. Both sort by position, ascending (`FUN_002ec7e0` D:L189844-189976, `FUN_002ed060` D:L190061-190088). **No clan tag**: the reply's "tag" is the request's MessageID. A row's end flag draws the list; a status not Success keeps nothing and frees the list's request, whatever its tag (D:L188671-188673). | §4 |
| R311.4 | **The clan medal is computed and placed off the screen**: CLAN RANKING's `LadderList` puts its third column -- a 16 x 16 image over `null.tif` and the five medals -- at POSITION 820 (the disc's layout), 820 pixels right of a list whose left is at 305 on a 640-pixel frame; `FUN_0037ab90` places a cell at the list's left plus its column's POSITION (D:L273838-273841; the column's +4 is POSITION, `FUN_0037eab0` D:L276163-276164). The player sees the position and the clan's name only. | §4.3 |
| R311.5 | **`FUN_002ead80`** (D:L188869-188895; ELF 0x2ead80-0x2eae1c): 0 while `TotalClans` is 0 or below; else `p = position x 1000 / TotalClans` -- the product in 32 bits (shifts and adds), the division signed and truncated -- **4 for p up to 50, 3 up to 300, 2 up to 850, else 1**; no top-ten rung and no small-ladder rule, so never 5. A position of -1 is replaced by `DAT_0044f868`, which no caller passes (its one caller hands each row's own position, D:L188755). One clan on the board draws 1; the first clan draws 4 only from 20 clans. | §5 |
| R311.6 | **An off-board clan** (the port's ClanNotFound, research 310 §5): the position's reply changes nothing (`FUN_002eac70` D:L188840-188862 acts only on Success), so **the list around the clan is never asked** -- the page shows the podium, an empty list on the session's first visit (or the list it last drew), both arrows pulsing, no tint; on the empty list L1 and L2 do nothing (corrected at ONL-30's build, §11 item 9: an empty LISTBOX runs none of its bindings, `FUN_003745e0` D:L270328-270330). The stale position 310 §5 worried about reaches nothing visible (R311.5; `ClanLadderRanking` is drawn by no dialog of the disc). The page does nothing of its own: the server's answer is `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER`'s open question, and the owner sees the consequence (§10). | §6 |
| R311.7 | **SOCOM II ONLINE's clan podium** (`ClanLadderTop10` on CLAN_LADDER_LEADERS at (178, 138), columns 20 / 130 under #464 RANK and #774 CLAN NAME, its header #766 "TOP TEN SOCOM II ONLINE CLANS" over `BlueBack`; shown by the CLAN RANKING row's ONACTIVATE `ClanRankingAct`): filled by mode 7 at the menu's ONSTART (`get_ladder_top_10`, after mode 1), one ClanLadderLeaders 10 from 1 drawn by `FUN_002ea800`; no position, no total. | §7 |
| R311.8 | **ONL-30 builds** the clans' half of the one client ladder in `LadderLobbyCommands` (modes 6-11, row 162 `GetClanRanking`, the replies applied in the order sent), the clans' transport in `ladderLobbyHost.ts`, the clan medal, and CLAN RANKING out of `PARKED_ROWS` -- five items, about 3 points (§8). `CLAN_LADDER_MODES_PLACEHOLDER` retired; two readings proposed (§9). The unparking meets H188's default's condition (W18.R13: "until ONL-30 merges"); what the owner sees is §10. | §8-§10 |

## 2. The page as read (the disc's record)

### 2.1 The layout (`RUN/UI/READERC.ZAR:dlgClanLadderLobby.rdr`)

- **The heads**: `bar_title` #148 CLAN RANKING (30, 65); `TopTen_text` #151 THE PODIUM (25, 89) over the left pane;
  `rank_text` the literal RANK (342, 89) and `player_text_rt` #521 CLAN (433, 89) over the right; `player_text_lft`
  #521 CLAN (137, 89) over the podium; the foot's help `desc_low_text` #395 `_395_ScrollRoster_MSG` ("¶ and ¼ to
  scroll roster list.", PLAYER RANKING's line too; #153 "± AND µ TO SCROLL CLAN LIST" is used by no dialog of the
  pinned dump), `InfoTextT` #149;
  `playername` (PLAYER_NAME_AND_TAG) with the five medals as children, `txtClanName` (CLANNAMEVAR, #54 Unaffiliated);
  the network dot; the arrows `arrow_up` (310, 77) and `arrow_dwn` (310, 342), 35 x 35.
- **`LadderList`** (the controls' third, after two IMAGEs): a LISTBOX at (320, 90), 350 x 400, PADHOG, NOSELECT, SPACING
  19, LEFT_MARGIN -15, TOP_MARGIN 22, the three colours 128; **COLUMNS** POSITION 50, POSITION 130, and POSITION 820 at
  TOP_OFFSET -20 an IMAGE of SIZE 16 x 16 over TEXTURES `null.tif`, `Medal_Blue.tif`, `Medal_Bronze.tif`,
  `Medal_Silver.tif`, `Medal_Gold.tif`, `Medal_Black.tif`; UIVAR CLAN_LADDER_RANKING. Its bindings: L1 `ladder_up`, L2
  `ladder_down` (each twice: pressed and held), UP and DOWN to `NONE` (research 116 §5.2: not scrolling).
- **`LadderTop10`**: a LISTBOX at (23, 90), 250 x 220, PADHOG, NOSELECT, SPACING 19, LEFT_MARGIN 25, TOP_MARGIN 30,
  COLUMNS POSITION 10, POSITION 90; UIVAR CLAN_LADDER_LEADERS.
- The players' page (`dlgLadderLobby`) puts its key cell at -600, left of the screen (research 269 §2.1); this page
  puts its medal at 820, right of it (§4.3).

### 2.2 The sets (the mode at each command's +0x10; research 269 §2.1, re-checked against `FUN_00278750`)

- ONSTART: `PulseArrows` (both arrows pulsing 0.2-0.99 forever), `net_monitor`, **`get_ladder_top_10`** --
  `ClearUIVar(CLAN_LADDER_LEADERS)`, `GetLadderInfo` **6** ("CLAN"), `DisableButton(LadderTop10)` -- and
  `ActivateMedalOfMerit` (the persona's own medal at the foot, the players' valve; nothing of the clans').
- `ladder_up` (L1): IF mode **8** ("CLAN LadderPressUp") then mode **10** ("CLAN LadderUp"), WAIT 0.5.
  `ladder_down` (L2): IF mode **9** then mode **11**, WAIT 0.5.
- ON_LADDER_REFRESH `RefreshArrows`: IF mode 9 SHOW `arrow_dwn` ELSE HIDE; IF mode 8 SHOW `arrow_up` ELSE HIDE.
- TRIANGLE `goto_menu(PREVIOUS_SCREEN)`; MP_MEDIUS_ERROR `OnMultiplayerDisconnect`; MP_SYSTEM_MESSAGE `OnSystemMessage`.
- No CROSS on the list: a clan's row opens nothing (the players' page opens PLAYER INFO).
- SOCOM II ONLINE's ONSTART `get_ladder_top_10`: the five medals hidden, `GetLadderInfo` 1 then **7** ("CLAN Top10").
  The CLAN RANKING row's CROSS `Goto_ClanLadder`: `StartMusic = 1`, `SwitchMenu(dlgClanLadderLobby.rdr)`, no sound.

## 3. The requests, mode by mode

### 3.1 The state the modes read and write

| what | where | boot | written by |
|---|---|---|---|
| the list's rows | 0x44f850: count `DAT_0044f854`, records `DAT_0044f858` | none (D:L328597-328600) | freed by `FUN_002ec060` in `FUN_002ea5c0` (D:L188624) and at the lobby session's reset (`FUN_002df8e0` D:L182253-182254); kept by `FUN_002ebcf0` |
| the bound | `DAT_0044f85c` (list +0xc) | 0 (D:L328601) | the position's Success (D:L188852), the total's (D:L189086), each row kept (D:L189539-189541); no free resets it (`FUN_002ec060` D:L189652-189668 and `FUN_002dfcd0` D:L182434-182457 touch the count, the records and their storage only) |
| the start | `DAT_0044f860` (list +0x10) | **2** (D:L328598) | each list request sent (D:L188626) |
| the podium's rows | 0x44f820 | none (D:L328591-328596) | freed by `FUN_002ea6b0` (D:L188648), kept by `FUN_002ebcf0` |
| my clan's position | `DAT_0044f868`; the UI variable `ClanLadderRanking` (S:0x3f4640) | 0 (BSS) | 0 with no clan (D:L188806); the position's Success (D:L188842-188851) |
| the total | `DAT_0044f870`; `TotalClans` (S:0x3f46f8) | 0 (BSS) | the total's Success (D:L189076-189085) |
| a list request out | `DAT_0044f880` | 0 (BSS) | set at a send (D:L188619); cleared by any reply row not Success (D:L188673), the list's end row (D:L188687), and the position's "GetSurrounding" Success before it asks (D:L188855) |

The state lives from boot to power-off: the session's reset frees the rows but keeps the start and the bound, and no
code but these writes them. `ClanLadderRanking` and `TotalClans` are named by no layout or set of the disc (a byte
search of `READERC.ZAR`, `READERX.ZAR`, `UIZANIM.ZAR`, `EXTZANIM.ZAR` finds neither): they are drawn nowhere.

### 3.2 Mode 6, the entry (`FUN_002eab80` D:L188792-188826, then `FUN_002ea6b0(10)`)

- **The argument.** The decompiler shows `FUN_002eab80(0x44f370)` (D:L123455). The instructions: `GetLadderInfo` sets
  a1 to 1 before its jump table (ELF 0x2784d4, `addiu a1, zero, 1`) and nothing writes a1 before the table's entry 6
  (the table at 0x3eeca0, entry 6 = 0x278638) calls `FUN_002eab80` (ELF 0x278638-0x278640); `FUN_002eab80` keeps a1 in
  s0 (ELF 0x2eab90) and copies the tag only when it is not 0 (ELF 0x2eaba8). **So the entry asks "GetSurrounding"**
  (S:0x3f45f8); row 162 `GetClanRanking` passes 0 (D:L124328) and asks no list.
- **With a clan held** (`FUN_002e6830` D:L186493-186497: `DAT_003df298` is not -1): ClanLadderPosition (0x24 bytes, Lobby
  0xd4, `FUN_00646838`, its reply `FUN_002eac70`) -- "GetSurrounding" at +0, the client's clan id `DAT_0044f59c` at
  +0x18, stat index 0 at +0x1c, sort order 1 at +0x20 (D:L188810-188818).
- **With none**: my position 0 (D:L188806) and ClanLadderList from 1 (`FUN_002ea5c0(1, 7)`, D:L188807) -- **before** the
  total, where with a clan the list waits for the position's reply.
- **Then, always**: GetTotalRankings (0x1c bytes, Lobby 0xd8, `FUN_0064aee8`, its reply `FUN_002eb1b0`) -- "ClanTotal"
  (S:0x3f4608) at +0, type 1 at +0x18 (D:L188820-188824).
- **Then** ClanLadderLeaders 10 from 1 (`FUN_002ea6b0` D:L188638-188657, from D:L123456): the podium's rows freed,
  "ClanLadderLeaders" (S:0x3f4590) at +0, stat 0 +0x18, order 1 +0x1c, start 1 +0x20, the count 10 +0x24 -- **no
  request flag**: it goes out whatever is in flight.
- No lobby-state gate on any of the three (the players' mode 0 asks only while up in state 11, `FUN_002eb2c0`).

### 3.3 Mode 7, the podium (D:L123458-123460)

`FUN_002ea6b0(10)` alone: SOCOM II ONLINE's (§7). Neither the position nor the total is asked.

### 3.4 Modes 8-11, the arrows and the pages (D:L123461-123487)

- **8** answers 0 when the start (`FUN_002eb780` D:L189297-189301: `DAT_0044f860`) is under 2, else 1.
- **9** answers 0 when the bound (`FUN_002eb760` D:L189279-189283: `DAT_0044f85c`) is under the start + 14, else 1.
- **10**: when the start is above 1, ClanLadderList from `max(1, start - 14)` (`FUN_002ea5c0(.., 7)`).
- **11**: ClanLadderList from the start + 14.
- **`FUN_002ea5c0`** (D:L188607-188633) sends only with no list request out, a start above 0, **and** the start under the
  bound or no row held (D:L188617); then: the flag set, the rows freed, the start held, "ClanLadderList" (S:0x3f4578) at
  +0, stat 0 +0x18, order 1 +0x1c, the start +0x20, `7 << 1` = 14 at +0x24 (D:L188619-188629). `FUN_002f4080`, called
  with 0x7b before the send (D:L188628), has an empty body (D:L194242-194246).
- **The last row** (a consequence, transcribed as it stands): mode 9 passes at a bound equal to the start + 14, but the
  send needs the new start strictly under it -- so on a board of exactly `start + 14` clans the down arrow shows, L2
  sends nothing, and the last clan is not reached. The players' page has the same pair (`FUN_002eb510` D:L189195-189196,
  transcribed in ONL-30a's `askPage`). Nothing to correct: the original's.

### 3.5 ON_LADDER_REFRESH

Raised by the ranking's draw only (`FUN_002ea930` D:L188782-188784, S:0x3f45e0, through `DAT_0044f3c8`), not by the
podium's, the position's or the total's reply. On CLAN RANKING it runs `RefreshArrows` (modes 9 and 8). A list that is
never drawn (no Success row, §4.4) leaves both arrows pulsing as ONSTART started them.

### 3.6 Row 162 `GetClanRanking` (the leader's page)

`FUN_0027a250` (D:L124325-124330): `FUN_002eab80(0x44f370, 0)` -- ClanLadderPosition untagged and the total, then 1. The
disc runs it from `dlgManageRosterLeader`'s ONSTART `MRosterLeaderStartData` only (research 272 §2; the pinned dump).
Its replies write `ClanLadderRanking`, `DAT_0044f868`, `TotalClans`, `DAT_0044f870` and the bound -- none drawn on that
page, all read by CLAN RANKING's next visit (the medal's total, the paging bound). The port answers the row today with
the table's default (declared for ONL-30, nothing sent).

### 3.7 The replies, and the order they meet the state

- **The position** (`FUN_002eac70` D:L188831-188863): on Success (its status at +0x20, "GetClanLadderRanking"
  S:0x3f4620; `FUN_002f42d0` D:L194340-194344: true for 0) the position at +0x18 into `ClanLadderRanking` (added
  TEMPORARY, set as an integer), `DAT_0044f868` and the bound; tagged "GetSurrounding" (a case-blind compare,
  D:L188853), the flag freed and ClanLadderList asked from the position itself, or from 1 when the position is 2 or
  less (D:L188856-188860; ELF 0x2ead3c-0x2ead48: `addiu v0, a1, -2`, `bgtz` past the `addiu a1, zero, 1`) -- not
  the players' `max(1, position - 2)` (`FUN_002eb340` D:L189147-189151). **The reply's total is not read**
  (the port's server sends one, `totalRankings`; the page must not take it). A failure changes nothing.
- **The total** (`FUN_002eb1b0` D:L189056-189091): on Success (+0x18, "GetTotalRankings" S:0x3f46e0) and the tag
  "ClanTotal" (D:L189074), the count at +0x1c into `DAT_0044f870`, `TotalClans` and the bound. ("PlayerTotal" writes the
  players' totals, D:L189068-189072; this client never asks it.)
- **The order matters.** The entry sends the position, the total and the leaders together, and the list goes out from
  the position's reply. If the original's lobby server answered on its one connection in the order asked (not read:
  §9), the position lands first (the bound = the position, the list sent -- only when no row is held, or the
  position is 2: see the next bullet), then the total (the bound = the total), then
  the leaders, then the list's rows (each raising the bound to its position, under the total): the bound ends at the total, and the rows' medals are
  weighed against it. Applied the other way -- the total before the position -- the bound ends at the position and the
  rows raise it only to the page's last, so mode 9 fails on the first page and L2 cannot page down; the list's rows
  landing before the total would draw every medal against 0. The port's requests are separate HTTP calls that may
  complete in any order, so the page applies the clans' replies in the order the requests were sent
  (`CLAN_LADDER_REPLY_ORDER_READING`, §9); the original server's order is not read (ONL-32's capture shows it).
- **A request that never settles** (CLAN-RANKING-STALL, LATER 51; read 2026-10-15, reading, pending review). The
  original matches a reply to its handler by the reply's type alone: each request type has one callback slot, rewritten
  at every send of that type (ClanLadderList / Leaders `FUN_006467a8` D:L559258, ClanLadderPosition `FUN_00646838`
  D:L559280, GetTotalRankings `FUN_0064aee8` D:L561948), and the type's dispatcher, registered once
  (`FUN_0064db00` D:L564257, D:L564259, D:L564263), calls the slot with whatever reply of that type lands
  (`FUN_0064d050` D:L563488-563495, `FUN_0064d088` D:L563500-563507, `FUN_0064d0f8` D:L563524-563531). The list's and
  the podium's replies share one handler, told apart by the tag each carries back (`FUN_002ea730` D:L188676, D:L188684);
  the position's "GetSurrounding" likewise (D:L188853). There is no request id, no queue and no client timeout: an
  unanswered request holds nothing but the list's flag (`DAT_0044f880`, tested at D:L188617), which three things free:
  the list's end row (D:L188687), any reply row not Success -- whatever its tag, the podium's included (`FUN_002ea730`
  D:L188671-188673) -- and a "GetSurrounding" Success (D:L188855). The podium has no flag of its own (`FUN_002ea6b0`),
  and its rows (0x44f820) share nothing else with the list's: `FUN_002ea730`'s leaders branch keeps into and draws
  0x44f820 only (D:L188676-188681), and the podium's +0xc (`DAT_0044f82c`) is written at boot (D:L328595) and by the
  keep, read by nothing; a failure row of the podium's freeing the list's flag is the one crossing, applied as it lands
  in the port too. **As built**: each entry (`FUN_002eab80`, mode 6 and row 162) opens a new chain -- its position, its
  total and every list sent after it until the next entry -- applied in the order sent (the bound ends at the total; the
  rows' medals against it); a request that never settles holds only the replies of its own chain sent after it. **At
  the next entry the older chain is released** (CLAN-RANKING-STALL's review, F1, the seat's ruling 2026-10-15), before
  the new entry's requests go out: its turns already landed are applied then, in the order sent, and any of it still out
  is applied as it lands, held by nothing -- the original's handlers acting on a reply when it lands (`FUN_002ea730`
  D:L188684-188688). Held instead, an older list landed behind its stalled total would be applied when the total lands,
  into a newer page: on a board of 60 with the clan at 20, the first entry's list 20..33 kept under a later L2's start
  34, drawn, ON_LADDER_REFRESH raised and the flag freed while the list from 34 is out. Released, that list is applied
  at the re-entry; the re-entry's "GetSurrounding" Success then sends no list (rows held at a position of 3 or more,
  D:L188617, the next bullet), so it stands as the list last drawn, and its rows are freed by the next send (L1 / L2,
  `FUN_002ea5c0` D:L188624). **The trade-off, accepted**: in a released chain the turns no longer wait for each other,
  so an older position landing after its total ends the bound at the position, as the original would in that order. **And the arrows** (the review's re-review, low): the released list is drawn during the re-entry's `GetLadderInfo 6`,
  so its ON_LADDER_REFRESH runs on that page -- the up arrow shown (start 20), the down arrow hidden (the bound then 33:
  the position, raised by the released rows) and no refresh after the re-entry's total sets the bound to 60, so the
  down arrow stays hidden although L2 pages; the original drew and refreshed that list on the first visit, and its
  second raises none (both arrows pulsing, the next bullet). Only after a stall and a re-entry; holding the draw would
  bring back the late list (F1), so it was named, not built. *Built by LATER 54 (2026-10-21; reading, pending review):*
  the release still applies the landed list -- drawn, its rows and bound kept -- but raises no ON_LADDER_REFRESH on the
  re-entry's page, since the original raised that list's on the page it landed on (`FUN_002ea730` D:L188684-188688 ->
  `FUN_002ea930` D:L188782-188784), the first visit's; so the re-entry's page keeps the dialog's own arrows (both
  pulsing) while L2 pages. A turn still out at the release raises its refresh when it lands, as the original's would
  (`clanLadder.test.ts`, "LATER 54", RED first; the two stall cases' event pins re-pinned). The
  podium (modes 6 and 7) joins no chain and is applied as it lands. Weighed: (b) the replies applied as they land in
  every order is refused by the source -- the bound's three writers give a different end in a different order (above);
  (a) a later entry abandoning the older unsettled turns outright would drop a late reply the original would have
  applied (a clanless re-entry with its list still out would keep the flag set for the session); (c) a timeout is not
  needed, so none is built. A stalled list keeps the flag set (no page) until a failure row of a clans' list reply
  (D:L188671-188673) or a later entry's "GetSurrounding" Success (D:L188855) frees it, as the original's.
- **A later visit in the same session.** The position's Success sets the bound to the position (D:L188852, ELF
  0x2ead24) just before the send, and the send needs the start strictly under the bound or no row held (D:L188617;
  `slt` at ELF 0x2ea5ec). With the start at the position, "under the bound" fails for a position of 3 or more and for
  position 1 (start 1, bound 1); position 2 still sends (start 1). The rows are freed only at a send or at the lobby
  session's reset (§3.1). So the session's first visit sends and draws; **a later visit sends no list**: CLAN_LADDER_RANKING
  shows what it last held (ONSTART clears only CLAN_LADDER_LEADERS), no ON_LADDER_REFRESH, both arrows pulsing, the
  start where the last visit left it; the total's reply then sets the bound, and L1 / L2 page from that start.
- Without a clan the list goes out before the total: its rows draw against the total as it stands (0 on the session's
  first visit -- every medal 0 -- else the last one asked), the total lands after. Off the screen either way (§4.3).

## 4. The rows

### 4.1 The reply and the keep (`FUN_002ea730` D:L188663-188692, `FUN_002ebcf0` D:L189489-189544)

- A row's status (+0x40) not Success ("GetClanLadderList" S:0x3f45b0) frees the list's request flag -- whatever the
  row's tag, a podium's included -- and keeps nothing (D:L188671-188673).
- A Success row is filed by its tag (case-blind, D:L188676, D:L188684): "ClanLadderLeaders" into the podium's rows,
  drawn at the row whose end byte (+0x44) is set (D:L188677-188681); "ClanLadderList" into the list's, drawn and the
  flag freed at the end row (D:L188684-188688). Another tag keeps nothing.
- The keep: a row of a position already held is dropped (D:L189504-189510; the end test still runs on it); else 0x48
  bytes copied -- the tag (0x15), the clan id +0x18, the 32-byte name +0x1c, the position +0x3c, the status +0x40, the
  end +0x44 (D:L189511-189537) -- appended, and the list's +0xc raised to the position (D:L189539-189541): for the
  list, the bound.

### 4.2 The podium's rows (`FUN_002ea800` D:L188697-188727)

Sorted by position, ascending (`FUN_002ec7e0`: a quicksort on +0x3c, ranges under 21 by `FUN_002ed060`'s selection on
+0x3c), each row an array of two strings -- `"%d"` (S:0x3f45c8) of the position and the name -- set into CLAN_LADDER_LEADERS
(the lobby's +0xe4, `DAT_0044f454`; made at D:L182225-182226). No tint, no medal, no event.

### 4.3 The ranking's rows (`FUN_002ea930` D:L188732-188787)

- Sorted as the podium's; for each row, `"%d"` of the position and the medal `FUN_002ead80(position)` (D:L188754-188755).
- **The client's clan** (the row's +0x18 equal to `DAT_0044f59c`, D:L188757): the position and the name each a keyed
  cell -- the key "VALUE" (S:0x3f45d0) with the text, the key "COLOR" (S:0x3f45d8) with the floats 91, 72, 36
  (0x42b60000, 0x42900000, 0x42100000, D:L188758-188768) -- then the medal as an integer (D:L188769). The port builds a
  keyed cell flat (`LADDER_KEYED_CELL_READING`, research 269 §2.4 item 3); the clans' rows use it unchanged.
- **Any other**: the position and the name as strings, the medal as an integer (D:L188772-188774).
- Set into CLAN_LADDER_RANKING (the lobby's +0xe8, `DAT_0044f458`; D:L182227-182228), then ON_LADDER_REFRESH.
- **The medal cell's place.** The list's left is its XPOS plus its LEFT_MARGIN, 320 - 15 = 305 (the port's
  `listbox.ts` L515, L551-556, as reviewed for ONL-30a); the third column's POSITION is 820, so the 16 x 16 medal is
  drawn at x 1125 on a 640-pixel frame (`UI_FRAME`, `packages/ui/src/compositor/frame.ts`) -- not seen. The position
  (POSITION 50, x 355) stands under RANK (342) and the name (POSITION 130, x 435) under CLAN (433). A reading of the
  layout, not a frame: ONL-32's capture is what shows it. The port draws the cell where the layout puts it and needs no
  rule of its own.

### 4.4 The end, failures and an empty board

- The server's rows end with `endOfList` on the last of the page (`ladder.ts` `clanList`); a page shorter than 14 at the
  board's end draws as it stands.
- An empty board, or a start past its end: one NoResult row (Horizon's empty answer, research 310 §6 item 2 as built)
  -- nothing kept, the flag freed, **nothing drawn**: CLAN_LADDER_RANKING keeps what it last held (the lobby's variable
  outlives the page), no ON_LADDER_REFRESH, both arrows pulsing. The podium likewise keeps what it last held -- on CLAN
  RANKING, the ONSTART's `ClearUIVar` empties it first; on SOCOM II ONLINE nothing does.
- A later visit with rows held: the "GetSurrounding" list is not sent at a position other than 2 (§3.7) -- nothing
  drawn, the last list shown, both arrows pulsing.
- A list request never answered leaves the flag set: no further page in the session (the original's, as ONL-30a's
  "a rejection is a request never answered") -- until a later entry's "GetSurrounding" Success frees it (D:L188855) and
  asks the list again, or a failure row of any clans' list reply, the podium's included, frees it (D:L188671-188673)
  (corrected by CLAN-RANKING-STALL and its review, 2026-10-15; §3.7's bullet "A request that never settles").

## 5. The clan medal (`FUN_002ead80` D:L188869-188895)

- -1 is replaced by `DAT_0044f868` (D:L188876-188878); the one caller passes each row's position (D:L188755), so only a
  row carrying -1 would meet it, and the server's rows carry positions from 1.
- `TotalClans` (`DAT_0044f870`) 0 or below: 0, the empty image (D:L188875, D:L188879).
- Else `p = position x 1000 / TotalClans` (D:L188880): at the instructions the product is `(a << 5) - a`, `<< 2`, `+ a`,
  `<< 3` in 32-bit adds and shifts and the quotient a signed `div`, truncated (ELF 0x2eada8-0x2eadc8) -- the players'
  width (research 261 §9.2): `Math.trunc(Math.imul(position, 1000) / total)`.
- `p < 51` 4, `p < 301` 3, `p < 851` 2, else 1 (D:L188881-188892; `slti` 51, 301, 851 at ELF 0x2eadcc, 0x2eade0,
  0x2eadf8). The index is the column's texture: 4 `Medal_Gold`, 3 `Medal_Silver`, 2 `Medal_Bronze`, 1 `Medal_Blue`, 0
  `null.tif`; never 5 (`Medal_Black`, the players' top ten).
- **Worked values** (the test's): total 100 -- position 5 is 4 (p 50), 6 is 3 (60), 30 is 3 (300), 31 is 2 (310), 85 is 2
  (850), 86 is 1 (860); total 20 -- position 1 is 4 (50), 2 is 3 (100); total 19 -- position 1 is 3 (52); total 1 --
  position 1 is 1 (1000); total 0 -- 0 for any position; position 0 with a total -- 4 (p 0).
- The players' `ladderMedal` (`ladderLobbyCommands.ts`) is not this function: it divides by `total - 10` and gives 5
  under position 11 (`FUN_002eaee0`). The server's `medalOf` is the players'. A new `clanMedalOf(position, total)`
  carries this one.

## 6. An off-board clan on the page (the port's ClanNotFound)

- **What the console does with it**: the position's reply is not Success, so `FUN_002eac70` writes nothing and asks no
  list (D:L188840-188862: the variable, `DAT_0044f868`, the bound and the "GetSurrounding" list all inside the Success
  branch). The total (Success) sets `TotalClans` and the bound; the leaders draw the podium.
- **What the page shows**: THE PODIUM filled; the list empty on the session's first visit to the page (CLAN_LADDER_RANKING
  as the lobby made it), or the list the page last drew; no row tinted; both arrows pulsing (no draw, no
  ON_LADDER_REFRESH). **L1 and L2 do nothing on the empty list** (corrected at ONL-30's build, §11 item 9): the LISTBOX's
  input `FUN_003745e0` returns before its bindings while it holds no row (D:L270328-270330), so `ladder_up` /
  `ladder_down` never run. Had they run, L1's mode 8 would pass at the boot start 2 and mode 10 ask the list from 1, and
  L2's mode 9 test the total (from 16 at 16 clans or more); on a later visit with the last list drawn they do run.
- **The stale position** (research 310 §5) reaches nothing visible: the medal is weighed per row from the row's own
  position (§5), and `ClanLadderRanking` is drawn by no dialog (§3.1). Only a later "GetSurrounding" Success replaces it.
- **The alternative answer**, Success with position 0, would behave as the clanless entry does: the list from 1
  (a position of 2 or less gives 1; sent only while no row is held, the bound having just been set to 0), the top 14
  drawn, no row tinted. A ranked clan's member on a later visit meets the same blocked send (§3.7): the last list, not
  his clan's surroundings.
- **The port's page does nothing of its own.** It transcribes `FUN_002eac70`; which answer the original server gave a
  clan off its board is `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER`'s open question (server `ladder.ts`; H220's condition) and
  a server change if ever settled, not a page rule. The visible consequence -- a member of a clan under eight members
  opens CLAN RANKING onto an empty list -- is put before the owner with the unparking (§10).

## 7. SOCOM II ONLINE's clan podium (`ClanLadderTop10`, under #766)

- **The layout** (`RUN/UI/READERC.ZAR:dlgWorldOfSOCOM.rdr`): `ClanLadderTop10` -- a LISTBOX at (178, 138), 250 x 250,
  NORMAL / ACTIVE / PRESSED `brown_back.tif`, colours 128 / 91 72 36, PADHOG, NOSELECT, SPACING 21, LEFT_MARGIN 10,
  TOP_MARGIN 30, COLUMNS POSITION 20, POSITION 130, on CLAN_LADDER_LEADERS -- beside `LadderTop10` (LADDER_LEADERS, the same
  place, a third column at 65 for the tag). The heads: `ClanTopTenText` #766 "TOP TEN SOCOM II ONLINE CLANS" (a child of
  `BlueBack` at (9, 24)); `DescFieldMid5` with `CategoryText1c` #464 "RANK" (197, 145) and its child `CategoryText2c` #774
  "CLAN NAME" (+120, 0).
- **Shown** by the CLAN RANKING row's ONACTIVATE `ClanRankingAct` (#789 "¦ View Clan Ranking.": `BlueBack`,
  `ClanTopTenText`, `ClanLadderTop10`, `DescFieldMid5`, `CategoryText1c` and `Category1Text2c` shown; the other panes
  hidden). `Category1Text2c` names no object of the layout -- the CLAN NAME head is `CategoryText2c`, a child of
  `CategoryText1c` -- so that SHOW lands on nothing and the head shows through its parent (a screen test expects no
  SHOW on it). Disabled at the
  menu's ONSTART (`OnBriefingRoomstart`: `DisableButton(ClanLadderTop10)`, the pinned dump; research 158 §2.4).
- **Filled** at the menu's ONSTART: `get_ladder_top_10` runs `GetLadderInfo` 1 (the players': my position and their
  podium) then **7** -- ClanLadderLeaders 10 from 1 (`FUN_002ea6b0`), drawn by `FUN_002ea800` into CLAN_LADDER_LEADERS
  (§4.2). No position, no total, no event. An empty board leaves it as the session last drew it (§4.4).
- The same variable feeds CLAN RANKING's `LadderTop10` (columns 10 / 90), so the page's podium and the menu's are one list.

## 8. The port today, and what ONL-30 builds

### 8.1 Today

- `LadderLobbyCommands` (ONL-30a) owns `GetLadderInfo` and `GetPlayerInfo` for the players' page and SOCOM II ONLINE's
  players' podium. Modes 6, 7, 10 and 11 send nothing and answer 1; 8 and 9 answer 0
  (`CLAN_LADDER_MODES_PLACEHOLDER`). `LADDER_INFO_MODE` names 6 `clanTop10` and 7 `clanBest` -- 6 is the page's entry
  (position, total, podium), 7 the podium alone.
- Row 162 `GetClanRanking` has no body (the table's default; the leader's page reaches it, `manageRosterLeaderScreen.test.ts`).
- The transport (`ladderLobbyHost.ts`) carries `/lobby/ladder-position`, `/lobby/ladder-list` and `/lobby/player-info`;
  none of the clans' three. The mount (`frontEnd.ts` L440) hands it no clan.
- `PARKED_ROWS` holds the one row `Clanranking` / `Goto_ClanLadder` / ONL-30 (`PARKED_ROW_GATE_READING`): CLAN RANKING's
  CROSS is not started (W18.R13). SOCOM II ONLINE's `ClanLadderTop10` stays as the session made it (empty).
- The server answers all three (CLAN-BOARD-SERVER, merged 053e82417): no server change is needed.

### 8.2 The task list (about 3 points; one implementer; each item with its failing test first)

1. **The clan medal** (ui `screens/ladderLobbyCommands.ts`; about 0.25): `clanMedalOf(position, total)` transcribing
   `FUN_002ead80` (§5) -- 32-bit product, truncated quotient, no -1 substitution unless a `myPosition` is handed (the
   players' convention). *Test first* (`packages/ui/test/screens/clanLadder.test.ts`, new): §5's worked values -- the
   boundaries 50/51, 300/301, 850/851 per mille at total 100, total 0, total 1, 19 against 20, position 0.
2. **The clans' half of the client ladder** (ui `screens/ladderLobbyCommands.ts`; about 1.25): the state of §3.1 (the
   list with start 2 and bound 0 at construction, `CLAN_LADDER_BOOT_STATE_READING`; the podium's rows; my position;
   `TotalClans`; the flag); `LadderService` grows `clanPosition({ clanId, ladderStatIndex: 0, sortOrder: 1, tag? })`,
   `clanTotal()` (0xd8 type 1) and `clanList({ tag, ladderStatIndex: 0, sortOrder: 1, startPosition, pageSize })`;
   modes 6-11 as §3.2-§3.4 (the clan id and "a clan held" from the session's `LobbyClan`, handed in as `clan`); the
   replies as §3.7 and §4.1 (`FUN_002eac70`, `FUN_002eb1b0`'s "ClanTotal" branch, `FUN_002ea730`, `FUN_002ebcf0`), the
   draws `FUN_002ea800` / `FUN_002ea930` (the keyed cells by `LADDER_KEYED_CELL_READING`) and ON_LADDER_REFRESH after the
   ranking only; the clans' replies applied in the order sent (`CLAN_LADDER_REPLY_ORDER_READING`: one chain, a request
   never answered freeing its turn without effect -- re-filed by CLAN-RANKING-STALL, 2026-10-15: one chain per entry,
   the podium on none, §3.7); row 162 `GetClanRanking` (`FUN_0027a250`: the entry untagged, no
   list) added to `LADDER_LOBBY_COMMAND_ROWS`; `LADDER_INFO_MODE`'s 6 and 7 renamed for what they do (`clanPage`,
   `clanPodium`); `CLAN_LADDER_MODES_PLACEHOLDER` retired. *Test first* (`clanLadder.test.ts`, over a fake service):
   mode 6 with a clan sends 0xd4 "GetSurrounding" with the clan id, then 0xd8 type 1, then the leaders 10 from 1; the
   position's Success at 20 asks the list from 20, 14 rows, at 2 from 1; with rows held from an earlier visit, the
   position's Success at 20 sends nothing and draws nothing, at 2 it asks from 1; without a clan the list from 1 goes out before the total; the
   total's and the position's replies landing in the reverse order are applied position-first (the bound ends at the
   total; mode 9 passes on page one); a ClanNotFound asks no list and writes nothing; the rows sorted, deduplicated by
   position, `["%d", name, medal]`, the own clan's two cells tinted; the podium `["%d", name]`; a NoResult row frees the
   flag and draws nothing; modes 8 and 9 at the boot start 2 and over a drawn page, the last-row case (a board of
   `start + 14` clans: arrow shown, nothing sent); 10 and 11 ask from `max(1, start - 14)` and `start + 14`; row 162 asks
   untagged and draws nothing; the reply's own `totalRankings` on 0xd4 not taken.
3. **The clans' transport** (viewer `ladderLobbyHost.ts`, and the mount in `frontEnd.ts` -- claimed at need, the row's
   hot file; about 0.5): `LadderTransport` gains `clanPosition`, `clanTotal` and `clanList` over `/lobby/clan-ladder-position`,
   `/lobby/total-rankings` (`{ ladderType: 1 }`) and `/lobby/clan-ladder-list`, each reply checked field by field as
   `ladderListOf` checks the players' (`{ tag, status, ladderPosition, totalRankings }`; `{ status, totalRankings }`;
   `{ entries: [{ tag, status, clanId, clanName, ladderPosition, endOfList }] }`), 401 the session lost, another session's
   answer never answered (`sessionLadder`); `connectLadderLobby` takes the session's `LobbyClan`
   (`this.world.commands.clan`, as `connectCreateClan` does). The "ClanTotal" tag is the console's MessageID; our reply
   carries none and the page knows which request it sent (the transport, OT.R27). *Test first*
   (`packages/viewer/test/ladderLobbyHost.test.ts`): the three bodies as the server reads them (`lobbyHttp.ts` L397-417),
   a malformed row throws, a 401 calls `sessionLost`.
4. **CLAN RANKING unparked, the page over the machine** (ui `screens/worldOfSocomCommands.ts`; about 0.75):
   `Clanranking` out of `PARKED_ROWS` (the list empty; `PARKED_ROW_GATE_READING` and the gate kept for a later parked row,
   or retired with its listing in research 158 -- the controller's call), the `GetLadderInfo` comment (L108-111) and
   SOCOM II ONLINE's mode 7 now filling `ClanLadderTop10`. *Test first*
   (`packages/ui/test/screens/clanLadderLobbyScreen.test.ts`, new, on the disc or the committed fixtures as `ladderLobbyScreen.test.ts` runs; skipped without them, said so): the
   menu's ONSTART fills `ClanLadderTop10` over a seeded fake; CLAN RANKING's CROSS switches to the page (`StartMusic` 1);
   the page's ONSTART sends the three requests; THE PODIUM's rows; the list from my position, my row first and tinted;
   a second visit in the same session showing the list last drawn, both arrows pulsing;
   the medal cell at column 820 (its sprite outside the frame); L1 / L2 paging and the arrows on ON_LADDER_REFRESH; an
   off-board clan's empty list and L1's top 14; TRIANGLE back. `worldOfSocomCommands.test.ts` and
   `worldOfSocomScreen.test.ts` rewritten where they hold CLAN RANKING inert (L385-406; L400-407).
5. **The documents and the ledger** (about 0.25): research 269 §2.5's `CLAN_LADDER_MODES_PLACEHOLDER` row marked retired
   (ONL-30); this note's §9 rows moved into code with their names (no longer *note only*) and its status; the plan's Log.
   *Optional, the controller's call (outside the row's files):* `CLAN_LADDER_POST_PLACEHOLDER` (ui `createClanCommands.ts`,
   research 271) re-filed as an adaptation -- the owner's H219 server takes no page post, so not sending 0xce type 1
   loses nothing the console shows (its reply is dropped, research 310 R310.3) -- or left until the leader's tag row is
   next touched.

**Proof**: the unit tests and the page over the machine are the reading level; a rendered run of CLAN RANKING in the
merge controller's browser slot (the plan's gate) with a seeded board of clans of eight (16 or more, so that L2
pages); ONL-32's capture is the proven level (§12).

## 9. Placeholders and readings

In code since ONL-30's build (2026-10-14), both in ui `screens/ladderLobbyCommands.ts` (reading, pending review).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_LADDER_REPLY_ORDER_READING` (ui `screens/ladderLobbyCommands.ts`) | `'the replies meeting the list\'s state applied in the order sent (position, total, list), one chain per entry, released at the next entry (then each applied as it lands); the podium applied as it lands'` (re-filed by CLAN-RANKING-STALL and its review's F1, 2026-10-15; was `'the clans\' replies applied in the order their requests were sent (position, total, leaders, list); a request never answered frees its turn'`) | the order the original's lobby server answered the entry's three requests and the list sent from the position's reply; the client applies each reply as it lands (`FUN_002eac70` D:L188852, `FUN_002eb1b0` D:L189086, `FUN_002ebcf0` D:L189539-189541 all write the bound), and the port's HTTP calls complete in any order (§3.7). As built since CLAN-RANKING-STALL (LATER 51): the original matches a reply to its handler by type alone, one callback slot per type with no request id or queue (§3.7, "A request that never settles"), so each entry opens its own chain, an unsettled request holds only the replies of its chain sent after it, the next entry releases the older chain (its landed turns applied then, the rest as they land), and the podium (no flag; it touches the list's state only by a failure row freeing the list's flag, D:L188671-188673) joins none -- no timeout. **Where it differs from the original**: when a total never settles, the original draws the entry's list as it lands -- the medals against the total before (0 on the session's first visit), the bound left at the position and raised only to the page's last row (D:L188852, D:L189539-189541), so mode 9 fails and L2 cannot page down while L1 pages up as usual; the port holds that entry's list behind the total until the next entry, which releases it (then drawn, the medals against the total as it stands; the re-entry's own total then sets the bound, so L2 pages), or until the total lands. A released chain's older position landing after its total ends the bound at the position, as the original would in that order; and the released list's draw raised ON_LADDER_REFRESH on the re-entry's page (the down arrow hidden while L2 pages), where the original's second visit raises none -- since LATER 54 (2026-10-21) it raises none either (§3.7) | ONL-32's capture of CLAN RANKING's entry: the order of the 0xd5, 0xd9 and 0xd3 replies on the wire, and the arrows on the first page | reading, pending review |
| `CLAN_LADDER_BOOT_STATE_READING` (ui `screens/ladderLobbyCommands.ts`) | `'the clan list\'s start 2 and bound 0 at the module\'s construction, kept for the front end\'s life; its rows outlive the page, freed at a send'` | the console's static constructor sets the start and bound at boot (`FUN_00401fa0` D:L328597-328602) and no session reset touches them (`FUN_002df8e0` D:L182253-182254 frees the rows only); the rows, held from the page's last draw, block a later visit's "GetSurrounding" send (§3.7); the port's module lives for the front-end session, so a page reload restarts all three where the console would keep the start and bound across logins. As built, the rows are freed at a send only: the lobby session's reset (`FUN_002df8e0`) is not wired to the module (the players' half's rows alike), so after a logoff and a login in the same page the first visit does not ask the list around the clan where the console's would | ONL-32's capture of an off-board clan's first visit (L1 pages from 1 at the boot start) | reading, pending review |

The names this note leans on are each listed where they live: `CLAN_LADDER_MODES_PLACEHOLDER` (ui `ladderLobbyCommands.ts`, research 269 §2.5) was retired by ONL-30's build (item 2 of §8.2).
`LADDER_KEYED_CELL_READING` (ui `ladderLobbyCommands.ts`, research 269 §2.5) carries the clans' tinted cells unchanged.
`CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER` (server `ladder.ts`, research 310 §5) holds the off-board answer's question (§6).
`PARKED_ROW_GATE_READING` (ui `worldOfSocomCommands.ts`, research 158) keeps its gate with an empty list (the seat's call at ONL-30).
`CLAN_LADDER_POST_PLACEHOLDER` (ui `createClanCommands.ts`, research 271 §6) is unchanged by this row unless item 5's option re-files it (then replaced).

## 10. The unparking (H188, W18.R13): what the owner sees

H188's default reads "until ONL-30 merges, CLAN RANKING drawn and inert (W18.R13)": ONL-30's merge is the condition,
so the unparking needs no new ruling, and the plan's Log records it as a row the owner sees. What a build with ONL-30
shows, and does not:

- **SOCOM II ONLINE**: the CLAN RANKING row's pane, TOP TEN SOCOM II ONLINE CLANS, lists up to ten clans -- RANK and CLAN
  NAME -- filled at the menu's entry. CROSS on the row now opens CLAN RANKING.
- **CLAN RANKING**: THE PODIUM (the top ten, position and name) on the left; on the right fourteen clans from the player's
  own (from 1 when his is first or second), RANK and CLAN, his clan's position and name in the page's heading gold (91, 72, 36) where the
  others are grey (128); L1 / L2 page by fourteen, the pulsing arrows hidden at either end; TRIANGLE back. **No medal is visible on the rows**: the disc's layout places the clan
  medal off the right of the screen (§4.3) -- not a missing feature. A clan's row opens nothing (no CROSS on the list).
- **Only clans of eight members or more are on the board** (H220's conditional default, `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER`):
  on a test server without a clan of eight both lists are empty and both arrows keep pulsing. A member of a clan under
  eight sees THE PODIUM and an empty list on entry, and L1 / L2 do nothing there (§6, §11 item 9: an empty list takes no
  pad) -- the consequence of the server's ClanNotFound, whose original counterpart is unread; a playtest needs a seeded
  clan of eight.
- **A return visit within the same session shows the list he last saw** (the original's: the list around his clan is
  asked only on the session's first visit, or with his clan second, §3.7) -- not a fault of the build.
- **What it does not show**: any clan value (the rows carry none, research 310 R310.5); a clan's change of place while the
  page is open (it asks again only at the next entry or page); anything of a clan game (none is posted for the clan,
  R310.1).

## 11. Corrections and finds (for research 310 and the code's comments; the build row applies them)

1. **The bound's third writer** (research 310 R310.6, §3.3): the list's rows raise `DAT_0044f85c` to the largest position
   kept (`FUN_002ebcf0` D:L189539-189541, the list's +0xc); 310 named the position's and the total's only.
2. **The stale position** (research 310 §5's paragraph after the under-eight row): "the clan medal ... weighs that stale
   position against the new, smaller total" -- the medal weighs each row's own position (D:L188755); `DAT_0044f868` enters
   only for a position of -1 (D:L188876-188878). The visible effect of the ClanNotFound is the unasked list (§6).
3. **Research 310 §7's "not read here"**, now read: mode 6's second argument is 1 -- the entry asks "GetSurrounding" (§3.2);
   `FUN_002ec7e0` sorts by position, ascending (§4.2); the medal's product is 32-bit (§5); `FUN_002f4080` has an empty body,
   its 0x7b unused (§3.4).
4. **The medal is not seen** (research 310 R310.5 "the page draws ... the clan medal"): it is computed and placed at column
   820, off the frame (§4.3).
5. **The code's comments**: `LADDER_INFO_MODE`'s `clanTop10` / `clanBest` (L64) name 6 and 7 for the players' modes 0 and
   1 by analogy -- 6 is the page's entry, 7 the podium (item 2 renames them); `worldOfSocomCommands.ts` L110 "the clans'
   podium not sent" changes with the row.
6. **The surrounding list's start** (research 310 §3.1, the position's reply, L126; the comment on `clanPosition` in
   server `ladder.ts` L458): both say `max(1, position - 2)`; the console asks from the position itself, from 1 at a
   position of 2 or less (D:L188856-188860; §3.7). The players' page does subtract 2 (`FUN_002eb340`).
7. **For ONL-30a's check (an aside):** the port's players' half starts `rest.start` at 0 (`ladderLobbyCommands.ts`
   L379), while the console boots `DAT_0044f7bc` at 2 (D:L328581); the players' list's free `FUN_002ec140` zeroes it
   (D:L189682) at a page send and at the session's reset (D:L182249), so the two differ only before the first.
8. **Found, nothing to change**: the last-row case (§3.4) is the original's pair of tests and the players' page carries it
   too (ONL-30a's `askPage`, the same condition); the page's help line is #395, the players' page's, not #153.
9. **L1 on an empty list (found at ONL-30's build, 2026-10-14; against R311.6, §6 and §10 as first written)**: the
   LISTBOX's input `FUN_003745e0` (D:L270311-270443) tests its row count first and returns 0 with none (D:L270328-270330),
   so a list holding no row runs none of its bindings -- CLAN RANKING's L1 `ladder_up` / L2 `ladder_down` are the list's
   (§2.1). The port's `listbox.ts` transcribes it (`input`, "if (this.count === 0) return false"), and
   `clanLadderLobbyScreen.test.ts` shows it over the machine: an off-board clan's first visit, an empty list, L1 and L2
   send nothing. So an off-board clan's member cannot page to the top fourteen on the session's first visit; R311.6, §6
   and §10 are corrected in place. ONL-32's capture confirms it at the proven level.

## 12. What is left

- **The proven level**: ONL-32's capture of CLAN RANKING against a seeded clans' board -- a ranked clan's entry (the
  three requests and their reply order, the list from the position, the tint, the arrows), a second visit in the same
  session (the list last drawn), a clanless player's, an
  off-board clan's (the original server's answer to a clan under eight, settling `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER` with
  H220's condition), a board of exactly `start + 14` clans (the last-row case), a board of one clan, the screen's right
  edge (no medal), and SOCOM II ONLINE's clan podium.
- **Not read here**: the original server's own order of answers (`CLAN_LADDER_REPLY_ORDER_READING`); what Sony's server
  sent in a row's status other than Success mid-page (the client drops the row and frees its flag, §4.1).
- **The corpus** (`docs/corpus/sections.jsonl`, `llms.txt`) carries this note at the landing's rebuild.
