# 310 -- Clan stats and the clans' ladder: what the console posts, what the server must rank (SVC-11, CLAN-STATS)

- Date: 2026-10-13 (web sprint 19, clan games and the clans' ladder; the plan
  `../plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md`; roadmap 06 SVC-11, H188).
- Status: **reading** (reviewed 2026-10-13 by a fresh reviewer: PASS WITH FINDINGS, folded at 7bc7386d9; written before the build; no code changed with it). Every value of the original
  below is read from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted),
  the ELF's strings (`S:0x<addr>`) and, for one four-word callback the decompiler gives no body, the ELF's instruction
  words (`ELF 0x<addr>`, read off the file's third load segment by hand; `tools/elfImage.ts` is the repository's reader
  that would confirm them), and the disc's scripts as the pinned dump holds them (`tools/test/onlineDialogs.pinned.json`:
  `dlgClanLadderLobby.rdr`). **No test was run for this note** (source inspection only). Nothing here is measured on the
  original running -- ONL-32's two-clan transcripts are the proven level.
- Stands on research [155](155-the-stats-record-the-ladder-and-the-ranks.md) (§1.3 what the client posts and when, §6
  call 8), [261](261-the-stats-record-and-the-ladder.md) (§9 the players' ladder: the three answers, the medal and tier,
  ties, `LADDER_CLAN_TOTAL_PLACEHOLDER`), [262](262-clans.md) (§2.1 the clan stats record `"%.3d%.12d%s"`, §2.2 the tag
  and the rating), [271](271-create-clan.md) (§2.3 the create's post, §2.4 the clan's ladder post,
  `CLAN_LADDER_POST_PLACEHOLDER`), [272](272-clan-roster.md) (§4 the roster's rows and the clan rating; §6 the leader's
  tag), [269](269-the-players-pages-and-the-medals.md) (§2.4 `CLAN_LADDER_MODES_PLACEHOLDER`) and
  [97](97-service-shape-and-medius-map.md) (§2.2 the message ids), and does not restate them.
- Built since (2026-10-14): **CLAN-ROSTER-LADDER**, §6 item 1 -- the roster rows' ladder fields in `clans.ts`
  (`ROSTER_UNRANKED_POSITION_READING` in code, `ROSTER_LADDER_READING` retired; reading, pending review); and
  **CLAN-BOARD-SERVER**, §6 item 2 -- the clans' board and its three answers in `ladder.ts` and `lobbyHttp.ts` on the
  owner's W19.R7 (`CLAN_LADDER_VALUE_SOURCE_OWNER`, `CLAN_LADDER_TIE_ORDER_OWNER`, `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER` in
  code; `LADDER_CLAN_TOTAL_PLACEHOLDER` retired; reading, pending review; §6 item 2's "as built"); the rest of this note is
  as written.
- Code as read when written (since changed by CLAN-ROSTER-LADDER and CLAN-BOARD-SERVER, 2026-10-14: both names below
  retired): `packages/central/src/clans.ts` (`ROSTER_LADDER_READING`, the roster's reply),
  `packages/central/src/ladder.ts` (`LADDER_CLAN_TOTAL_PLACEHOLDER`, the player board), `packages/central/src/serviceStore.ts`
  (`ClanRecord.ladder`, `setLadder`, `LADDER_STATS_COUNT_READING`), `packages/ui/src/screens/createClanCommands.ts`
  (`CLAN_LADDER_POST_PLACEHOLDER`), `packages/ui/src/screens/manageRosterLeaderCommands.ts` (UpdateClanStats),
  `packages/ui/src/screens/manageRosterCommands.ts` (`clanRosterRating`), `packages/ui/src/screens/ladderLobbyCommands.ts`
  (`CLAN_LADDER_MODES_PLACEHOLDER`).

## 1. The answers

| row | answer | where |
|---|---|---|
| R310.1 | **After a clan game the console posts nothing for the clan.** Its posts at a round's end and at the match's end are its own player's, as in any game: `AccountUpdateStats` (0x11) and `UpdateLadderStats` type 0 with its rating (`FUN_002faa80` D:L198415-198443, from D:L75804 and D:L76655; research 155 §1.3). No function on the results path calls the clan's stats post or the clan's ladder post; a clan game's result reaches the clan only through its members' ratings. | §2 |
| R310.2 | **`UpdateClanStats` (Lobby 0x84) has two senders, both the leader's**: the create's callback (`FUN_002e7b80` D:L187204-187217) and the leader's tag (`FUN_002e7d70` D:L187223-187252, row 102 `FUN_00277610` D:L122923-122930, which the disc's scripts call only from `dlgManageRosterLeader`'s `clan_tag`). The record is `"%.3d%.12d%s"` of 0, the rating **as it stood before this post** (`DAT_0044f770`, D:L187243) and the tag; the clan id at +0x28 (D:L187247). | §2.1 |
| R310.3 | **The clan's ladder post follows each `UpdateClanStats`**: `FUN_002e7f50` (D:L187285-187328) recomputes the rating from the roster the console holds -- 0, or with 8 rows or more the first eight's LadderStat after the sort (the largest first) summed and divided by 8 toward zero (D:L187301-187320) -- and posts `UpdateLadderStats` type 1 at +0x18 with the value at +0x1c (D:L187322-187325); the request names no clan (the server keys it by the sender). Its callback (ELF 0x2e80b0, four words) only tests the reply's status under the name "MediusUpdateClanRanking" (S:0x3f43c0) and keeps nothing: **"MediusUpdateClanRanking" is this reply's name, not a request of its own.** | §2.2 |
| R310.4 | **`DAT_0044f770`, the clan rating**: written by the roster's draw (`FUN_002e6af0` D:L186601-186704: the same mean, into ClanRating) and by `FUN_002e7f50`; read only by the two stats posts. Each roster row's LadderStat is GetClanMemberList_ExtraInfo's (stat index 0, research 272 §4): the member's player ladder stat 0 -- the rating his own console posts as type 0. So the clan's value is **the mean of its eight best members' ratings, 0 under eight members**, as the server reports those ratings. | §2.3 |
| R310.5 | **The clans' ladder pages ask three things**: ClanLadderPosition (Lobby 0xd4: the client's clan id, stat 0, sort 1; the position back), GetTotalRankings (0xd8, "ClanTotal", type 1; `TotalClans` back) and ClanLadderList (0xd2: "ClanLadderList" 14 rows from a start, "ClanLadderLeaders" the top 10). **A row carries no value**: the clan id, the name, the position, a status, the list's end (`FUN_002ebcf0`). The page draws the position, the name and the clan medal `FUN_002ead80` (D:L188867-188895: position x 1000 / `TotalClans` -- under 51 4, under 301 3, under 851 2, else 1; 0 while the total is 0; no top-ten rung), the client's own clan's row tinted. | §3 |
| R310.6 | **`ClanTotal`** is the number of clans the server ranks: the client stores it as `TotalClans` and `DAT_0044f870` (`FUN_002eb1b0` D:L189074-189086) and uses it for the medal and the list's paging bound (`DAT_0044f85c`, which the position reply also writes -- to the position, D:L188852 -- beside the total's D:L189086; the list request also goes out while no rows are held, `DAT_0044f854 == 0`, D:L188617). `LADDER_CLAN_TOTAL_PLACEHOLDER` (0) is retired by a server that counts its ranked clans. | §3.3 |
| R310.7 | **What the server must hold and rank**: per account its rating (held: the stored record's +0x04); per clan its stats record (held, as posted) and its value; the order of the clans by value (sort order 1: the largest first), each clan's position and the total; and in each roster row the member's rating, his player position and the players' total (today `ROSTER_LADDER_READING`: 0, 1, 0). **Not in the client, so owner rows**: whether the value is the leader's last post or computed by the server from the members' current ratings; whether a clan under eight members (value 0) is ranked and counted; the clans' tie order. (A disbanded clan off the board is the store's own rule, no owner call, §4 item 4.) | §4 |

## 2. What the console posts for a clan

### 2.1 The stats record: the create and the leader's tag

- **The senders** of `UpdateClanStats` (`FUN_00646660`, Lobby 0x84, 300 bytes, callback `FUN_002e7e70`): the create's
  callback (D:L187215) and `FUN_002e7d70` (D:L187248) -- no other call of `FUN_00646660` exists. `FUN_002e7d70` is row 102
  `UpdateClanStats` (`FUN_00277610` D:L122923-122930); in the disc's scripts the row runs from `dlgManageRosterLeader`'s
  `clan_tag` only (`GetTextInput(Clan_Description)`, `NetCensorText`, `UpdateClanStats`; research 272 §6; the pinned
  command table counts one use, `tools/test/golden/uiCommandTable.json`).
- **The record** (research 262 §2.1): `"%.3d%.12d%s"` (S:0x3f4328, D:L187243) of 0, `DAT_0044f770` and the tag string
  (`Clan_Description`), 256 bytes into the request at +0x2c; the client's clan id `DAT_0044f59c` at +0x28 (D:L187247).
  **The twelve digits are the rating as last computed** -- by the roster's last draw or the previous ladder post -- since
  the recompute (`FUN_002e7f50`) runs after the send (D:L187250). At the create the client holds no roster, so 0.
- **The reply** (`FUN_002e7e70` D:L187255-187282): a Success ("MediusUpdateClanStats", S:0x3f4360) rewrites
  PLAYER_NAME_AND_TAG; a refusal is silent (research 272 §6).
- **Who reads the twelve digits**: the client's readers of the record found here and in research 262 / 272 read the icon
  (its first three bytes, `atoi`) and the tag (+15) only; ClanRating is drawn from the roster, not from the record. No
  reader of the digits was found (a reading, not a proof of absence).

### 2.2 The clan's ladder post

- **`FUN_002e7f50`** (D:L187285-187328), called by the create's callback (D:L187217) and by `FUN_002e7d70` (D:L187250),
  nowhere else: `DAT_0044f770` to 0 (D:L187301); with the held roster (`DAT_0044f748`, its count `DAT_0044f744`) of 8 or
  more rows (D:L187302), the rows sorted (`FUN_002e9b40`, the largest LadderStat first: research 272 §4,
  `CLAN_ROSTER_SORT_READING`), the first eight's LadderStat (+0x1cc) summed, a negative sum biased by 7 and shifted right
  3 -- a division by 8 toward zero (D:L187304-187320); then a 0x58-byte `UpdateLadderStats` zeroed, type 1 at +0x18, the
  value at +0x1c (D:L187322-187324), sent by `FUN_0064b248` (D:L187325). No clan id is written: the post is the
  sender's.
- **The callback, 0x2e80b0** (the four words before `FUN_002e80c0`, which the decompiler gives no body): `lw a1, 0x18(a3)`;
  `lui a0, 0x3f`; `j 0x2f42d0`; `addiu a0, a0, 0x43c0` (ELF 0x2e80b0-0x2e80bc, words 8ce50018 3c04003f 080bd0b4 248443c0)
  -- a tail call of `FUN_002f42d0` (D:L194338-194343: true when the status is 0) with the name S:0x3f43c0
  "MediusUpdateClanRanking" and the reply's status; the answer is dropped. So the reply changes nothing on the console,
  and "MediusUpdateClanRanking" names the 0xce reply's check, not a separate request (roadmap 06 SVC-11 lists it beside
  the others).
- **When it runs**: only at a create (value 0) and at each tag the leader sets. **Nothing re-posts a clan's value after a
  game, a member's join or a member's rating change**: on the original's servers the posted value stood until the
  leader next set the tag -- unless Sony's server computed the clans' order itself, which no client code shows (§4).

### 2.3 `DAT_0044f770` and the roster's LadderStat

- **Writers**: `FUN_002e6af0` (D:L186601-186704, the roster's draw: 0 at entry, D:L186623; the same eight-row mean,
  D:L186634-186690; into ClanRating, S:0x3f4038, D:L186693-186701) -- called after every roster change (D:L186544,
  D:L186572, D:L186595) and at GetMyClans' no-clan reply and a quit (D:L187802, D:L187891) -- and `FUN_002e7f50`.
  **Readers**: the two stats formats (D:L187210, D:L187243). The port: `clanRosterRating` (`manageRosterCommands.ts`).
- **A row's LadderStat** (+0x1cc) is the reply's to GetClanMemberList_ExtraInfo with ladder stat index 0 and sort order 1
  (research 272 §4, D:L186573-186576): the member's ladder stat 0, which every console posts as its own rating
  (`UpdateLadderStats` type 0 at +0x1c, `FUN_002faa80` D:L198436-198440; research 155 §1.3). The row's position (+0x1d0)
  draws the member's medal with the players' medal function against the players' total (`FUN_002eaee0`, research 272
  §4). So the roster is the members' player-ladder entries, and the clan's value is a function of their ratings. *The
  medal (corrected at the review, 2026-10-13):* `FUN_002eaee0` (D:L186663) weighs the row's position against the
  client's own players' total `DAT_0044f800` -- the PlayerTotal reply's (D:L189011, D:L189071, D:L189137), not the
  row's total field -- and gives 5 (the top-ten medal) for any position under 11 once that total is 1 or more, position
  0 included; what the original's server sent as an unranked member's position is not known
  (`ROSTER_UNRANKED_POSITION_READING`, below).
- **The port when this note was written**: the server answered LadderStat = the request's index (0), the position 1 and the total 0
  (`ROSTER_LADDER_READING`, `clans.ts`), so every clan read 0, and every member's medal was 0 only while the page held no players' total (once it held
  one, position 1 drew the top-ten medal).
- **Since CLAN-ROSTER-LADDER (2026-10-14; §6 item 1; reading, pending review)**: `ClanService.roster` answers each
  row's LadderStat with the member's stored rating (`readAccountStats`, +0x04 -- on the board or off it, as the original's
  console posts a rating from its first login, D:L198403-198405, and after each game, D:L198436-198440), its position with
  his place on SVC-13's board (the `ladder` option, `LadderService.board`), off it `ROSTER_UNRANKED_POSITION_READING`
  (0), and its total with the board's length in every row. The page's `clanRosterRating` is unchanged and now draws the
  eight-best mean. An unranked member's row then draws "0" in RANK (D:L186655) and, against the page's own players'
  total, the top-ten medal (5) once that total is 1 or more, none while it is 0 (D:L188942-188954) -- the same medal
  position 1 drew before. *Without a board* (a `ClanService` given no `ladder`) every position is 0 and the total 0,
  the LadderStat still the stored rating; `createServices` (`bridge.ts`) gives the clan service SVC-13's board (the same
  `LadderService` the lobby's ladder answers from), so the live services' rows carry the board's positions and length.

## 3. The clans' ladder pages

### 3.1 The position and the total (`GetClanRanking`, `GetLadderInfo` mode 6)

- **`FUN_002eab80`** (D:L188790-188827), from row `GetClanRanking` (`FUN_0027a250` D:L124323-124331, second argument 0)
  and from `GetLadderInfo` mode 6 (D:L123454-123456, with `FUN_002ea6b0(10)` after it; its second argument is lost by
  the decompiler): with no clan held (`FUN_002e6830` D:L186491-186496: `DAT_003df298` is -1) the position is 0 and the
  list asked from 1 for 14 rows; else **ClanLadderPosition** (0x24 bytes, `FUN_00646838`, research 97: Lobby 0xd4):
  optionally the tag "GetSurrounding" (S:0x3f45f8) at +0, the client's clan id at +0x18, stat index 0 at +0x1c, sort
  order 1 at +0x20 (D:L188810-188817). Then, always, **GetTotalRankings** with the tag "ClanTotal" (S:0x3f4608) and type 1
  (D:L188820-188824).
- **The position's reply** (`FUN_002eac70` D:L188829-188864): on Success (the status at +0x20) the position at +0x18
  into the variable `ClanLadderRanking` (S:0x3f4640) and `DAT_0044f868`; tagged "GetSurrounding", the list asked from
  the position itself, from 1 when the position is 2 or less, for 14 rows (D:L188856-188860; corrected by research 311
  §11 item 6 at ONL-30: an earlier line here read `max(1, position - 2)`, the players' page's rule, `FUN_002eb340`).

### 3.2 The list (`GetLadderInfo` modes 6, 7, 10, 11)

- **ClanLadderList** (Lobby 0xd2, 0x28 bytes, `FUN_006467a8`): "ClanLadderList" (S:0x3f4578; `FUN_002ea5c0`
  D:L188605-188634: one at a time, a start above 0 and below the total, the page doubled -- 14) or "ClanLadderLeaders"
  (S:0x3f4590; `FUN_002ea6b0` D:L188636-188659: from 1, the count given -- 10), stat index 0 and sort order 1 in both.
- **The reply's rows** (`FUN_002ea730` D:L188661-188694, by tag; `FUN_002ebcf0` keeps one row a position): the tag, the
  clan id +0x18, the clan name +0x1c (32 bytes), **the position +0x3c**, a status +0x40, the end of the list +0x44 -- no
  value, no stats.
- **The drawing**: the leaders (`FUN_002ea800` D:L188695-188729) as `"%d"` of the position and the name into
  CLAN_LADDER_LEADERS; the ranking (`FUN_002ea930` D:L188730-188789) as the position, the name and the clan medal, the
  row of the client's own clan (+0x18 equal to `DAT_0044f59c`) in the colour (91, 72, 36) (D:L188757-188768), into
  CLAN_LADDER_RANKING, then ON_LADDER_REFRESH (S:0x3f45e0, D:L188783). `dlgClanLadderLobby` lists them in `LadderTop10`
  and `LadderList` and pages with L1 / L2 (its `ladder_up`, `ladder_down`).

### 3.3 The clan medal and the total

- **`FUN_002ead80`** (D:L188867-188895): with no position given, the client's own (`DAT_0044f868`); 0 while
  `DAT_0044f870` is 0 or below; else `p = position x 1000 / total`: under 51 4, under 301 3, under 851 2, else 1. Unlike
  the players' `medalOf` (research 261 §9.2) it has no top-ten rung and no small-ladder rule; its product's width at the
  instructions is not read here (the players' wraps in 32 bits, research 261 §9.2).
- **`TotalClans`**: GetTotalRankings' reply tagged "ClanTotal" (`FUN_002eb1b0` D:L189074-189086) sets `DAT_0044f870`, the
  variable `TotalClans` (S:0x3f46f8) and the list's bound `DAT_0044f85c`.

## 4. What the server must hold, and the rules the client does not carry

- **Held already**: each account's rating (the stored record's +0x04, `readAccountStats`; the players' board,
  `ladder.ts`); each clan's 256-byte stats record as posted (`ClanRecord.stats`); a slot for a type-1 ladder post
  (`ClanRecord.ladder`, `setLadder`, no writer).
- **To serve**: in each roster row the member's rating (LadderStat), his position on the players' board and the board's
  length (retiring `ROSTER_LADDER_READING`); the clans' board -- each live clan's value, ordered largest first, each
  clan's position and the count (0xd4, 0xd2, 0xd8 type 1; retiring `LADDER_CLAN_TOTAL_PLACEHOLDER` and the parked modes of
  `CLAN_LADDER_MODES_PLACEHOLDER`).
- **The rules no client code gives** (each an owner row, H188's successor; OT.R33 settled the players' analogues):
  1. **The value's source** (`CLAN_LADDER_VALUE_SOURCE_PLACEHOLDER`): the original's console posts the eight-best mean
     only at a create and a tag set (§2.2), so on Sony's servers the value either stood stale between a leader's posts or
     was computed by the server (no client code shows which). Our services take no rating from a page (research 261 §9.3:
     the board reads the stored record; the store's type-0 slot has no writer), so the recommendation is the same rule
     for the clans: the server computes each clan's value from its members' stored ratings at each ask -- the console's
     own formula, always fresh -- and ignores a page's type-1 post. *The owner approved it 2026-10-14 (H219, "approved";
     the plan's W19.R7): the owner's value, `CLAN_LADDER_VALUE_SOURCE_OWNER` at CLAN-BOARD-SERVER's build.*
  2. **A clan under eight members** (`CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER`): its value is 0 by the client's formula; ranked
     at 0 and counted in `TotalClans`, or off the board. The recommendation follows the players' rule (an account off the
     board until it has a counted result, OT.R33 call 5): off the board until it has eight members. *The owner approved
     the default on condition of parity (H220, 2026-10-14, "approved if that was parity with original"; W19.R7); the
     original server's side is unread, so the name stays a placeholder.*
  3. **Ties** (`CLAN_LADDER_TIE_ORDER_PLACEHOLDER`): the players' `LADDER_TIE_ORDER_OWNER` (the lower id first) applied to
     clan ids. *The owner's word 2026-10-14 (H221, "default is fine"; W19.R7): `CLAN_LADDER_TIE_ORDER_OWNER` at the build.*
  4. **A disbanded clan**: off the board and out of the total (its record stays, `ClanRecord.disbanded`) -- the store's
     own rule for every other clan service; no owner call needed.
  5. **A clan game's own weight**: none in the client -- a clan game counts for the clan only through its members'
     ratings; any clan-versus-clan score (Horizon's ClanTeamChallenge family) has no caller on this client (research
     308 §6).

## 5. Placeholders and readings

Proposed for CLAN-STATS; each is *note only* until the build carries it (the ledger's rule) -- `ROSTER_UNRANKED_POSITION_READING`
is in code since CLAN-ROSTER-LADDER (2026-10-14); the rest are not yet.
The existing names this note would retire are listed where they live: `ROSTER_LADDER_READING` (server `clans.ts`,
research 262), `LADDER_CLAN_TOTAL_PLACEHOLDER` (server `ladder.ts`, research 261 §9), `CLAN_LADDER_POST_PLACEHOLDER` (ui
`createClanCommands.ts`, research 271 §6).
`CLAN_LADDER_MODES_PLACEHOLDER` (ui `ladderLobbyCommands.ts`, research 269) was retired by ONL-30 (research 311, 2026-10-14).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_LADDER_VALUE_SOURCE_PLACEHOLDER` (never in code) | `'computed by the server at each ask from the members\' stored ratings: the eight best\'s mean, 0 under eight'` | the original's source of a clan's ladder value: its leader's console's type-1 post at a create and a tag set (`FUN_002e7f50` D:L187285-187328), or Sony's server's own computation -- no client code shows which | ruled: the owner approved it 2026-10-14 (H219, W19.R7); no capture of Sony's servers remains | retired: replaced by `CLAN_LADDER_VALUE_SOURCE_OWNER` at CLAN-BOARD-SERVER's build (2026-10-14) |
| `CLAN_LADDER_VALUE_SOURCE_OWNER` (server `ladder.ts`) | `'computed by the server at each ask from the members\' stored ratings: the eight best\'s mean'` (`clanLadderValue`, `LadderService.clanBoard`) | where a clan's ladder value comes from: the owner's value -- each live clan's eight-best mean (`FUN_002e6af0` D:L186623-186690: the rows sorted largest first, the first eight summed in 32 bits, +7 when negative, `>> 3`) of its members' stored ratings, the roster's LadderStat (`readAccountStats` +0x04, on the players' board or off it), computed at each ask (kept against the store's revision); a page's type-1 post not taken | nothing to settle: the owner's rule (H219, W19.R7; named `CLAN_LADDER_VALUE_SOURCE_PLACEHOLDER` until the build) | the owner's rule (W19.R7); in code since CLAN-BOARD-SERVER (2026-10-14); reading, pending review |
| `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER` (server `ladder.ts`) | `'off the board and out of TotalClans until eight members'` | whether a clan whose value is 0 by the client's formula (fewer than eight rows, D:L186634, D:L187302) is ranked and counted | the owner approved the default on condition of parity; the server side unread (H220, 2026-10-14, W19.R7) -- settled by a read or a transcript of the original server's clan ladder with a clan under eight (none known) | in code since CLAN-BOARD-SERVER (2026-10-14; `LadderService.clanBoard`); stays a placeholder (H220's condition) |

*The under-eight answer as the console meets it (CLAN-BOARD-SERVER's review, 2026-10-14):* the port answers a clan off the
board at 0xd4 with ClanNotFound (-971, Horizon's for clans, `MLS.cs:1881-1885` at the pin). The console asks for the list
around its clan only inside the Success branch (`FUN_002eac70` D:L188840-188861), so a clan that falls under eight keeps
its last Success position in `DAT_0044f868` and the clan medal (`FUN_002ead80` D:L188876-188877) weighs that stale position
against the new, smaller total; a Success answer with position 0 would instead behave as a player in no clan does
(D:L188806-188807: position 0, the list from 1). Which the original server sent is the placeholder's open question --
ONL-30 should see it, and a capture of an under-eight clan's CLAN RANKING settles it. *Open, for when bans exist:* a
banned member's rating counts toward the clan's value today (the roster's LadderStat and the console's ClanRating do the
same; the ban list is empty) -- whether it still should once SVC-23's bans exist is not decided.
| `CLAN_LADDER_TIE_ORDER_PLACEHOLDER` (never in code) | `'the lower clan id first'` | the clans' order at equal values; the client keeps one row a position and draws what it is sent (`FUN_002ebcf0`) | ruled: the owner's word 2026-10-14 (H221, "default is fine", W19.R7); the players' `LADDER_TIE_ORDER_OWNER` the precedent | retired: replaced by `CLAN_LADDER_TIE_ORDER_OWNER` at CLAN-BOARD-SERVER's build (2026-10-14) |
| `CLAN_LADDER_TIE_ORDER_OWNER` (server `ladder.ts`) | `'clan id ascending'` | the clans' order at equal values: the lower clan id first, the players' `LADDER_TIE_ORDER_OWNER` applied to clans | nothing to settle: the owner's rule (H221, W19.R7; named `CLAN_LADDER_TIE_ORDER_PLACEHOLDER` until the build) | the owner's rule (W19.R7); in code since CLAN-BOARD-SERVER (2026-10-14) |
| `ROSTER_UNRANKED_POSITION_READING` (server `clans.ts`) | `0` | the position the original's server sent in a roster row for a member with no place on the players' board; with a players' total held, the client draws the top-ten medal for any position under 11 (`FUN_002eaee0` D:L186663, D:L188946-188954), 0 included, and prints "0" in RANK (D:L186655); no medal while it holds no total. 0 is the port's own "no position" (the players' position answer off the board, a ClanNotFound row); -1 is excluded (the medal function takes it for the viewer's own position, D:L188943-188944) | ONL-32's roster transcript with an unranked member | in code since CLAN-ROSTER-LADDER (2026-10-14); reading, pending review |
| `CLAN_STATS_DIGITS_STALE_READING` (note only) | -- | the stats record's twelve digits carry the rating as last computed, before the post's own recompute (D:L187243 before D:L187250); no reader of them was found (§2.1) | ONL-32's transcript of a leader's tag post after a roster change (the digits against the ClanRating drawn) | *note only* |

## 6. What CLAN-STATS (and the clans' ladder) should build

**Larger than 3 points as one task**; three rows of about 2-3 points each, in this order:

1. **The roster's ladder fields** (server `clans.ts`, about 2 points): each GetClanMemberList_ExtraInfo row's LadderStat
   the member's stored rating, its position the member's place on the players' board, its total the board's length (an
   account off the board: the position `ROSTER_UNRANKED_POSITION_READING` -- not "medal 0": the client draws the top-ten
   medal for any position under 11 once it holds a players' total, §2.3); `ROSTER_LADDER_READING` retired. The page's
   ClanRating then shows the real eight-best mean with no page change (`clanRosterRating` is the transcription).
   *Test first* (`packages/central/test/clans.test.ts`): a clan of nine rated members -- the rows' LadderStat their ratings,
   their positions and the total from the board; and over the page (`packages/ui/test/screens/`), ClanRating the mean of
   the eight best toward zero, 0 at seven.
2. **The clans' board and its three answers** (server `ladder.ts` and `lobbyHttp.ts`, about 3 points): each live clan's
   value by `CLAN_LADDER_VALUE_SOURCE_PLACEHOLDER`, the order largest first with `CLAN_LADDER_TIE_ORDER_PLACEHOLDER`,
   `CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER`, disbanded clans off; `/lobby/total-rankings` type 1 the ranked count
   (`LADDER_CLAN_TOTAL_PLACEHOLDER` retired); a clan position (0xd4's fields: the clan id, stat 0, sort 1; the position
   and a status) and a clan list (0xd2's: the tag, stat 0, sort 1, the start, the page; rows of clan id, name, position,
   the end), each refusing another stat index or sort order as the players' endpoints do (research 261 §9.5). The type-1
   post: not taken from a page (the store's `setLadder` type 1 keeps no writer, as type 0).
   *Test first* (`packages/server/test/ladder*.test.ts`): three clans of eight or more and one of five -- the order, the
   positions, the total 3, the small clan off; a tie by the lower id; a disbanded clan off; the list's pages of 14 and the
   leaders' 10.
   *As built (CLAN-BOARD-SERVER, 2026-10-14; reading, pending review; `packages/central/test/clanBoard.test.ts`):*
   `LadderService.clanBoard` -- every clan not disbanded with eight members or more, at `clanLadderValue` of its members'
   stored ratings, largest first, ties by the lower clan id, kept against the store's revision (the store's read
   `ServiceStore.clansList`); `totalRankings` type 1 its length (`LADDER_CLAN_TOTAL_PLACEHOLDER` retired);
   `/lobby/clan-ladder-position` (`{ clanId, ladderStatIndex: 0, sortOrder: 1, tag? }`, the tag "GetSurrounding" or
   absent -> `{ tag, status, ladderPosition, totalRankings }`, off the board ClanNotFound with 0 and 0, Horizon's at the pin
   `desktop@be557831 MLS.cs:1881-1885`) and `/lobby/clan-ladder-list` (`{ tag, ladderStatIndex: 0, sortOrder: 1,
   startPosition, pageSize }`, the tag "ClanLadderList" or "ClanLadderLeaders" -> `{ entries: [{ tag, status, clanId,
   clanName, ladderPosition, endOfList }] }`, past the end one NoResult row), mounted with the players' three
   (`LOBBY_LADDER_PATHS`); another stat index, sort order or tag 400. The value is not on the wire (R310.5).
3. **The pages** (ui `ladderLobbyCommands.ts`, `worldOfSocomCommands.ts`, viewer transport, about 3 points): modes 6, 7,
   10, 11 send the two requests and draw `FUN_002ea800` / `FUN_002ea930`'s rows, the clan medal transcribed
   (`clanMedalOf(position, total)`, `FUN_002ead80`), the client's own clan tinted, ON_LADDER_REFRESH;
   `CLAN_LADDER_MODES_PLACEHOLDER` retired; SOCOM II ONLINE's clan podium (`ClanLadderTop10`) filled; CLAN RANKING out of
   `PARKED_ROWS` -- **the owner's call** (H188's default keeps it inert until SVC-11; this row is that SVC-11 work, so the
   default's condition is met, but the unparking is a row the owner sees). `CLAN_LADDER_POST_PLACEHOLDER` re-filed as an
   adaptation (the server computes; the page posts nothing) or retired with item 2's decision.
   *Test first*: the medal's boundaries (50/51, 300/301, 850/851 per mille; total 0), the rows' cells and the tint, the
   paging bounds by `DAT_0044f85c` (the total's and the position's writers, §3.3).

## 7. What is left

- **The owner's rows** (§4: the value's source, the clans under eight, ties): to be added to `HUMAN_TASKS.md` by the
  controller with this note's recommendations as the defaults.
- **Not read here**: mode 6's second argument to `FUN_002eab80` (lost by the decompiler; whether the CLAN RANKING page
  asks "GetSurrounding"), `FUN_002ec7e0` (the clan list's sort before drawing), the clan medal's product width at the
  instructions, `FUN_002f4080`'s argument 0x7b in the list request (D:L188628).
- **The proven level**: ONL-32's transcripts of a leader's tag post (0x84 then 0xce type 1, the value against the roster
  drawn) and of the CLAN RANKING page against a seeded clans' board.
