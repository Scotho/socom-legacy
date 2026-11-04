# 262 -- Clans on the service side: identity (SVC-08), membership (SVC-09), messages (SVC-10)

Written 2026-10-09 for SVC-08 (`../roadmap/06-online-services.md` "SVC-08"), wave 1 of web sprint 10
(`../plans/2026-10-09-web-sprint-10-the-services.md`; the note's number is the sprint's, 261-269). SVC-09 and SVC-10
fill §4 and §5. Sources: our Horizon's source read as files at the `ref/desktop` pin
(`desktop@be557831` `server/horizon-server/`: `Server.Medius/Medius/MLS.cs`,
`Server.Database/DbController.cs`, `RT.Common/Types.cs`, `RT.Common/Constants.cs`, `RT.Models/Lobby/`, read at the pin
with `git show be5578311:server/horizon-server/...`; the desktop's git-ignored `dist/` copy holds the same
`DbController.cs`, `Types.cs` and `Constants.cs` but not the same `MLS.cs`, which at the pin carries the desktop's LOCAL
clamps -- 3 lines more from :1481, 6 from :2191, 9 from :2242 -- so every `MLS.cs` line here is the pinned file's); the retail decompilation `socom2_game.elf.decomp.c`
(`D:L<n>` its line, `FUN_<addr>` its functions; cited, never pasted); the retail ELF's strings and instructions by
address (`S:0x...`, ELF 0x...); ONL-33's pin of the online dialogs (`tools/test/onlineDialogs.pinned.json`). It stands
on research 97 (the Medius map, §2.1 the clan rows), 119 (the software keyboard's caps), 131 and 220 (the store), 154
(the lobby's HTTP seam), 155 (the stats record; the tag at +0x34) and 156 (the invitations row), and does not restate
them.

The code: `packages/central/src/clans.ts` (`ClanService`, one method per pair; `clanHandler`, `POST /clan/<op>`; the
clan stats codec `consoleClanStats`, `clanIconIndex`, `clanIconFile`, `clanTag`; `rosterLeaderColumn`), mounted by
`createServices` (`packages/central/src/bridge.ts`, one line beside the lobby's and the ARMORY's handlers, the session's
bearer as its caller). The store is SVC-04's as it stands (`ClanRecord`, `createClan` ... `setClanStats`): no field was
missing. The test: `packages/central/test/clans.test.ts` (35: one `describe` per pair, the endpoint's Origin, method,
body and ticket checks, the mount). Confidence: **reading, reviewed 2026-10-09** (SVC-08's, SVC-09's and SVC-10's reviews) for every transcription below; nothing is
**proven** -- ONL-32's transcripts of the same actions (H27, H94) are the proven level, not claimed.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R262.1 | **Eight pairs answer clan identity**: CreateClan 0x54, DisbandClan 0x56, GetClanByID 0x58, GetClanByName 0x5a, TransferClanLeadership 0x5c, GetMyClans 0x7c, UpdateClanStats 0x84, GetClanMemberList_ExtraInfo 0xda, each with our Horizon's answer and status | `ClanService`; `clans.test.ts` pairs 1-8 | §1 |
| R262.2 | **Horizon answers NotClanLeader and AlreadyLeaderOfClan nowhere** (`MLS.cs` holds no use of either); a non-leader's disband or transfer is MediusFail, and a create by an account already in a clan is not checked at all. The codes are the title's (`Types.cs:78, :80`; `FUN_002f4300` names every code from -1000 to 4): ours answers them as named placeholders | `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`, `IN_A_CLAN_CREATE_STATUS_PLACEHOLDER` | §1.2, §3 |
| R262.3 | **Disband needs no empty roster**: Horizon's `DeleteClan` (`DbController.cs:1566-1609`) checks only that the caller leads the clan, clears every member's clan, sets every invitation revoked and removes the clan | `ClanService.disband`; the store's `disbandClan` | §3.2 |
| R262.4 | **The icon digits are always 000**: the console formats the clan stats as `"%.3d%.12d%s"` with a literal zero for the first argument (the call's `$a2` is `$zero` at ELF 0x2e7c98 after a create and 0x2e7dec from the leader's tag) -- so V6's icon index reads 0, `clan_icon_00.tif`, for every clan the retail console makes | `consoleClanStats`, `clanIconIndex` | §2.1 |
| R262.5 | **The tag is the clan stats from +15**: `Clan_Description`, typed on dlgManageRosterLeader's `clan_tag` (3 characters of 15 bytes), posted by UpdateClanStats and read back by GetMyClans into `Clan_Description` (D:L187818); the 12 digits between are the clan rating | `clanTag` | §2.2 |
| R262.6 | **"(Leader)" is the console's**: the roster reply carries account ids; `FUN_002e6af0` marks the row whose id equals the leader id GetMyClans answered | `rosterLeaderColumn` | §1.3 |
| R262.7 | **Two citations corrected**: V6's "member list with 999" is GetMyClanMessages' page size (`FUN_00645ec0`, D:L187828-187830), not the roster's; research 97's GetClanRoster row "(clan id, start 0, count 1)" is the clan id, the ladder stat index 0 and the sort order 1 by Horizon's model | the files | §2.3 |
| R262.8 | **Six pairs answer membership** (SVC-09): InvitePlayerToClan 0x62, CheckMyClanInvitations 0x64 (the real list), RespondToClanInvitation 0x66, RevokeClanInvitation 0x68, RemovePlayerFromClan 0x60 (QuitClan is the same request with the caller's own account) and GetClanInvitationsSent 0x7a, with Horizon's statuses or §3.3's placeholders | `ClanService.invite` ... `invitationsSent`; `clans.test.ts` pairs 9-14 | §4.1 |
| R262.9 | **The clan cap is the client's count**: members plus invitations sent below 16 (`CanInviteMorePlayersToClan`); the server's -956 is MP_CLAN_FULL. Horizon has no cap: ours refuses the seventeenth seat, `CLAN_CAP_PLACEHOLDER` 16 (H-next b) | `CLAN_CAP_PLACEHOLDER` | §4.2 |
| R262.10 | **The leader cannot leave**: Horizon refuses the leader's quit or removal with Fail, "must transfer or disband" (`DbController.cs:1678-1680`); ours answers LeaderCannotLeaveClan (-951) | `LEADER_LEAVE_STATUS_PLACEHOLDER` | §4.3 |
| R262.11 | **"ClanInviteRevokeHack" read**: the leader's console adds a member by AddPlayerToClan for every accepted invitation the sent list answers, then revokes it -- a server that listed decided invitations; Horizon lists the undecided only and joins on the accept, and ours ships Horizon's model as a placeholder, the owner's choice (H-next h) | `INVITATION_LISTS_UNDECIDED_PLACEHOLDER` | §4.4 |
| R262.12 | **The page's ticketless request keeps SVC-09a's none**: a port seam until the clan panels are unparked (W10.R4's follow-up sends the ticket); a ticket gets the real list | `CLAN_INVITATIONS_TICKETLESS_ADAPTATION` (*retired 2026-10-15 by INVITE-TICKETLESS: a ticketless request 401, research 273 §9*) | §4.5 |
| R262.13 | **Five pairs answer the messages** (SVC-10): GetMyClanMessages 0x6c (the member's pane), SendClanMessage 0x6e, ModifyClanMessage 0x70, DeleteClanMessage 0x72, GetAllClanMessages 0x7e (the leader's list, with the ids); the leader posts, edits and deletes, any member reads | `ClanService.myMessages` ... `deleteMessage`; `clans.test.ts` pairs 15-19 | §5.1 |
| R262.14 | **The console keeps five**: the leader's screen offers the "-1" row to write a new message only below five (`FUN_002e6400` D:L186377); Horizon keeps any number. Ours refuses a sixth MaxExceeded | `CLAN_MESSAGES_CAP_PLACEHOLDER` | §5.2 |
| R262.15 | **CLAN_MESSAGE_EMPTY and CLAN_MESSAGE_ID_ERR are the console's own**, raised before sending (`FUN_002e60c0`, `FUN_002e8310`); the server answers MediusFail to a wrong id (Horizon's own) and to an empty text (a placeholder) | `leaderMessageCommand`; `CLAN_MESSAGE_EMPTY_STATUS_PLACEHOLDER` | §5.3 |
| R262.16 | **DeleteClanMessage is answered MediusFail by Horizon's default**, not left unanswered: with no handler, its default case queues the request's default failure (`MLS.cs:4073-4082`); the console's delete callback is silent on a failure, so the message stays and nothing is shown. Ours deletes | `DELETE_CLAN_MESSAGE_PLACEHOLDER` | §5.4 |
| R262.17 | **Horizon's "no reply" is a reply**: a request it refuses by throwing (no clan) is caught and answered with the request's default failure when a session exists (`MLS.cs:4086-4095`), MediusFail or NoResult -- a correction to §1.1's and §4.1's "no reply" | the files | §5.5 |

## 1. Identity: the operations, the codes, the lines

### 1.1 The pairs

Every handler first refuses a request without a logged-in session by an exception: with no session's client
(`ClientObject` null) nothing is answered; from a client not logged in, the catch answers the request's default failure
(`MLS.cs:4086-4095`, §5.5). Ours answers either 401 at the endpoint and reads no body. The statuses are `MediusCallbackStatus` (`Types.cs:68-137`): Success 0, NoResult 1,
AlreadyLeaderOfClan -992 (:78), NotClanLeader -990 (:80), ClanNotFound -971 (:99), ClanNameInUse -970 (:100), Fail -966
(:104).

| pair | the console's side | Horizon's answer | ours |
|---|---|---|---|
| CreateClan, Lobby 0x54 -> 0x55 | `UICreateClan` (`FUN_0027a950` D:L124567-124587, the name from `CLANNAMEVAR`) -> the text filter (`FUN_002e7a10` D:L187112-187135) -> `FUN_002e7aa0` D:L187137-187165 (0x4c bytes, the name at +0x2c:32) -> cb `FUN_002e7b80` D:L187167-187221: any status but 0 MP_CREATE_CLAN_FAILURE (D:L187186); 0: the clan id +0x1c kept, the leader id set to mine (D:L187193), MP_CREATE_CLAN_SUCCESS, the stats post (§2) | `MLS.cs:1471-1519`: a name the CLAN_NAME filter refuses, Fail (:1484-1493); `CreateClan` with zero stats (:1495; `DbController.cs:1510-1564`: a clan of the name, compared lower-cased (:1462), throws (:1518, :1541), else the clan, the creator its leader and member, the creator's clan id moved (:1535)); Success with the clan id (:1503), any failure ClanNameInUse (:1506-1514) | the name's rules, Fail; a standing clan of the name, ClanNameInUse; the caller in a clan, `IN_A_CLAN_CREATE_STATUS_PLACEHOLDER`; else Success and the id (the reply's clan id 0 on a refusal) |
| DisbandClan, 0x56 -> 0x57 | `UIDisbandClan` -> `FUN_002e6850` D:L186500-186519 (0x2c, the clan id at +0x28) -> cb `FUN_002e68e0`: a failure prints "Clan Disband Error: %s" with the status's name (`S:0x3f3fa0`, D:L186533-186536) and raises MP_DISBAND_CLAN_FAILURE; Success clears the clan state and raises MP_DISBAND_CLAN_SUCCESS (D:L186550) | `MLS.cs:2043-2081`: no clan, an exception the catch answers MediusFail, the request's default (:2053-2055 -> :4086-4095, §5.5); `DeleteClan` false, Fail (:2071-2076); Success (:2063-2068) | no standing clan of the id, `NO_SUCH_CLAN_STATUS_PLACEHOLDER`; not the leader, `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`; else Success (§3.2) |
| GetClanByID, 0x58 -> 0x59 | not sent by any V1 action (research 97 §2.1) | `MLS.cs:1779-1815`: Success with the application, the name, the leader's id and name, the stats, the clan status (:1793-1803); none, ClanNotFound (:1806-1812) | the same; a disbanded clan is none (Horizon's simulated store removes it, `DbController.cs:1588`) |
| GetClanByName, 0x5a -> 0x5b | not sent by any V1 action | `MLS.cs:1817-1852`: Success with the id, the leader, the stats, the status (:1830-1840); none, ClanNotFound (:1843-1849) | the same, the name keyed as the store keys names (`NAME_KEY_CASE_FOLD_PLACEHOLDER`, research 131) |
| TransferClanLeadership, 0x5c -> 0x5d | `UITransferLeadership` (dlgManageRosterLeader's `appoint_leader`, after a YES) -> `FUN_002e81b0` D:L187372-187410 (the roster entry's id at +0x28, its name at +0x2c; not in the roster, MP_PLAYER_NOT_FOUND) -> cb `FUN_002e82a0`: any failure MP_PLAYER_NOT_FOUND, Success MP_LEADERSHIP_TRANSFER_SUCCESS (D:L187428) | `MLS.cs:2287-2325`, the caller's own clan: no clan, MediusFail by the catch (:2297-2299 -> :4086-4095); `ClanTransferLeadership` (`DbController.cs:1612-1660`: not the leader, no such account, or not a member of the clan, false (:1621-1630)) -> Fail (:2315-2320); Success (:2307-2312) | no clan, `NO_SUCH_CLAN_STATUS_PLACEHOLDER`; not the leader, `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`; the new leader no member of the clan, Fail; else Success, the old leader a member |
| GetMyClans, 0x7c -> 0x7d | GetClan (`FUN_002e8a90` D:L187723-187765, start 1, page 999) -> cb `cbGetMyClans` `FUN_002e8bd0` D:L187769-187846: a failure clears the clan state and, when a clan was held, raises MP_CLAN_DISBANDED (D:L187797); Success keeps the clan id, the leader id (+0x44, D:L187811; MP_MEDIUS_BECAME_LEADER when it turns to mine, D:L187808), the name, the stats (+0x68), then asks the roster and the messages | `MLS.cs:1614-1672`: no clan, NoResult with EndOfList (:1627-1634); the clan (:1641-1654) | the same |
| UpdateClanStats, 0x84 -> 0x85 | §2: after a create and from the leader's tag (300 bytes, the stats at +0x2c:256) -> cb `FUN_002e7e70` (Success rewrites PLAYER_NAME_AND_TAG; a failure is silent) | `MLS.cs:1891-1929`: any logged-in account, any clan; `PostClanMediusStats` (`DbController.cs:1415-1443`) false, ClanNotFound (:1916-1923) | the same, the leader only (`CLAN_STATS_POSTER_PLACEHOLDER`) |
| GetClanMemberList_ExtraInfo, 0xda -> 0xdb | GetClanRoster -> `FUN_002e69f0` D:L186557-186581 (0x24: the clan id +0x18, 0 at +0x1c, 1 at +0x20) -> cb `FUN_002e6a90` -> the rows (`FUN_002e6af0` D:L186601-186699) | `MLS.cs:1674-1730`: one row per member -- the id, the name, the member's 256 account stats, the online state, LadderStat the request's index, LadderPosition 1, TotalRankings 0 (:1689-1712); none, one ClanNotFound row (:1716-1722); the last ends the list (:1725) | the same; the online state from a presence hook (`ROSTER_ONLINE_STATE_READING`), the ladder fields Horizon's (`ROSTER_LADDER_READING`) |

The roadmap's acceptance names create, disband, by-name and by-id; the console's own look-up is GetMyClans, and the
"(Leader)" mark needs it and the roster, so both are answered here (GetClanRoster is also SVC-09's: §4). UpdateClanStats
is SVC-11's operation by the roadmap; its server side is answered here because the console posts it as the second half
of a create, and the icon's place is in it.

### 1.2 The codes the client reads

The console tells success from failure only (`FUN_002f42d0` is `status == 0`, research 97 R97.5): every refusal of a
create is MP_CREATE_CLAN_FAILURE, every refusal of a transfer MP_PLAYER_NOT_FOUND. One status is visible by name: a
disband's failure line prints `FUN_002f4300(status)`, whose table names every code from -1000 to 4 (D:L194356-194524),
so a non-leader's disband reads "Clan Disband Error: MediusNotClanLeader" here where our Horizon's would name
MediusFail. The console never sends it: dlgManageRosterLeader, the only screen with DISBAND, is opened only for the
leader (`create_modify_clan`: `IsMemberOfClan` then `IsLeaderOfClan`, ONL-33's pin), and dlgCreateClan only for an
account in no clan. V3's "Errors" are the names in that table, not a record of which codes Sony's server answered.

### 1.3 The roster and "(Leader)"

The rows the console builds (`FUN_002e6af0`): the id as "%d", the name (+0x20), an online glyph from the connect status
(+0x140), the member's description (+0xdf: the account stats' +0x9f), the ladder position (+0x1d0), the leader column --
"(Leader)" (`S:0x3f4010`) when the row's id (+0x1c) equals the leader id GetMyClans answered (D:L186633,
D:L186656-186662), else " " -- the medal from the position (`FUN_002eaee0`), and the lobby and game names or "MAIN
MENU". The server sends ids; the mark is the console's rule, transcribed as `rosterLeaderColumn` and held by the test of
a second persona's view (pair 8).

## 2. The icon and the tag

### 2.1 The clan stats as the console writes them

After a create succeeds (`FUN_002e7b80` D:L187204-187216) and when the leader sets the tag (`FUN_002e7d70`
D:L187237-187246, dlgManageRosterLeader's `clan_tag`: `GetTextInput(Clan_Description)`, `NetCensorText`,
`UpdateClanStats`), the console formats `"%.3d%.12d%s"` (`S:0x3f4328`) into a 256-byte buffer and copies all 256 bytes
into the request (`FUN_00195800` is a plain copy). The arguments, read at the instructions: `$a2` is `$zero` (ELF
0x2e7c98, 0x2e7dec, the delay slots of the calls), `$a3` the word at 0x44f770 and `$t0` the string `Clan_Description`.
So the record is three zero digits, the clan rating in twelve, the tag, a NUL; the first call before it
(`"clan_icon_%.2d.tif"`, `S:0x3f4310`, of zero) is overwritten. The bytes after the NUL are the console's stack
(`CLAN_STATS_TAIL_READING`).

GetMyClans' callback reads the icon back as V6 says -- `atoi` (`FUN_00191490` is `strtol(s, 0, 10)`) of the first three
bytes into `"clan_icon_%.2d.tif"` (D:L187819-187822) -- and uses the name nowhere after: the retail console writes icon 0
for every clan and draws no icon from it. Which `clan_icon_NN` exist on the disc is ONL-33's. The server stores the 256
bytes as sent; the test posts the console's bytes after a create and reads the icon number back, 0.

### 2.2 The tag and the rating

The tag is the record from +15: GetMyClans sets `Clan_Description` from 0x44f5f7, the record (0x44f5e8) + 0xf
(D:L187818); dlgManageRosterLeader's keyboard caps it at 3 characters of 15 bytes (research 119 §5). It is drawn
`[tag]` beside the name (PLAYER_NAME_AND_TAG, `S:0x3f43a0`) and copied into the account stats at +0x34 (research 155)
-- V21's 16-byte tag of the in-game records (research 91) is that. The rating in the twelve digits is `DAT_0044f770`:
the first eight roster rows' LadderStat (+0x1cc) summed and divided by 8 when the roster holds eight or more
(D:L186682-186690), else 0 -- with Horizon's LadderStat (the request's index, 0) it is always 0 today. `CLAN_TAGS`
(`S:0x3ef370`) is an argument a game-list command compares (`FUN_0027d900` D:L126119), SVC-11's; not read here.

### 2.3 Two citations corrected

V6 says "on join the client requests the member list with 999"; the 999 at D:L187828 is GetMyClanMessages' page size
(`FUN_00645ec0`, start 1, page 999, D:L187825-187830). The roster request (`FUN_002e69f0`) carries the clan id, 0 and
1, which Horizon's `MediusGetClanMemberList_ExtraInfoRequest` reads as ClanID, LadderStatIndex and SortOrder -- not
research 97's "start 0, count 1". Neither file is edited here.

## 3. The unknowns, settled or named

### 3.1 The clan name's rules

The original server's rules for a clan name (a word list, reserved names, which characters) are unobservable (ONL-33,
H85; the owner's answer of 2026-10-04, OT.R32: the client's rules stand). Ours: the field's 31 bytes and no NUL (the
store's `fitsField`, `CLANNAME_MAXLEN` 32, `Constants.cs:13`) and at most `CLAN_NAME_CHARS_PLACEHOLDER` (13) characters,
the keyboard's cap on dlgCreateClan (research 119 §5); a name outside them is refused MediusFail, the status Horizon
gives a name its filter refuses (`MLS.cs:1484-1493`). At the pin the desktop added a trim before the filter
(`MLS.cs:1481-1483`, marked LOCAL: `MediusText.ClanName`, `ChatClamp.Fit` to `CLANNAME_MAXLEN`), so Horizon accepts an
over-long name shortened where ours refuses it; the console never sends one (the keyboard's 13). Names compare case-folded (`NAME_KEY_CASE_FOLD_PLACEHOLDER`, as
Horizon lower-cases). No word list (H85; SVC-23's filter).

### 3.2 Disband and the roster

Horizon's `DeleteClan` (`DbController.cs:1566-1609`, simulated mode): the clan by id; not found or the caller not its
leader, false (:1576-1577); every member's clan id cleared (:1580-1581); every invitation's response status set to 3,
revoked (:1584-1585); the clan removed from the database (:1588). **No empty roster is required**: the leader disbands a
clan with members in it, and they are freed. Ours does the same through the store's `disbandClan`: the members freed,
the undecided invitations revoked, the record kept with `disbanded` (SVC-04's choice, research 131) and invisible to
every look-up (ClanNotFound), its name free. Horizon also marks decided invitations revoked; with the clan gone they are
unreadable there, and CheckMyClanInvitations lists only undecided ones (`MLS.cs:1533-1553`), so the difference shows
nowhere.

### 3.3 The codes Horizon does not answer

`NOT_CLAN_LEADER_STATUS_PLACEHOLDER` (NotClanLeader where Horizon answers Fail), `NO_SUCH_CLAN_STATUS_PLACEHOLDER`
(ClanNotFound where Horizon answers MediusFail, §5.5) and `IN_A_CLAN_CREATE_STATUS_PLACEHOLDER` (AlreadyLeaderOfClan for
a leader, Fail for a member, where Horizon checks nothing): §6. Only the disband's is visible on the console (§1.2), and
no console screen sends any of the three. Where the original's server is unknown and Horizon's answer is known --
NotClanLeader (-990) against MediusFail, ClanNotFound against MediusFail, a refused create from an account already
in a clan against Horizon moving the creator to the new clan -- the default follows the brief and V3's status table over
Horizon, as named placeholders; the one visible effect is the "Clan Disband Error: %s" line's status name.

## 4. SVC-09

*Written 2026-10-09 for SVC-09 (wave 2 of web sprint 10). Reading, reviewed 2026-10-09; nothing proven -- ONL-32's
transcripts of invite, accept, decline, revoke, remove and quit (H27, H94) are the proven level.*

The code: `ClanService.invite`, `respond`, `revoke`, `remove`, `quit`, `invitationsSent` and `myInvitations`
(`packages/central/src/clans.ts`), the paths `POST /clan/invite`, `/clan/respond`, `/clan/revoke`, `/clan/remove`,
`/clan/invitations-sent` on `clanHandler`; CheckMyClanInvitations' real list in `clanInvitations.ts`
(`myClanInvitations(store, accountId, q)`, `invitationPage`), its handler now mounted by `createServices` (`bridge.ts`)
with the session's bearer, no longer by `main.ts` without one; the store's additive `acceptClanInvitation` (the answer
and the membership in one change) and `clanInvitationsTo` (`serviceStore.ts`). The tests: `clans.test.ts` pairs 9-14,
the membership endpoint and the two-login mount; `clanInvitations.test.ts` (the real list, the paging, 401);
`serviceStore.test.ts` (the accept's one change and its refusals, the read).

### 4.1 The pairs

The statuses beyond §1.1's: MaxExceeded -956 (`Types.cs:114`), LeaderCannotLeaveClan -951 (:119), NotClanMember -947
(:123). Every handler first refuses a request without a logged-in session by an exception (no session's client: no
answer; a client not logged in: the request's default failure by the catch, §5.5); ours answers 401 at the endpoint. Horizon's lines are `desktop@be557831` `MLS.cs` and `DbController.cs` (simulated mode).

| pair | the console's side | Horizon's answer | ours |
|---|---|---|---|
| InvitePlayerToClan, Lobby 0x62 -> 0x63 | `CZOnlineLobby_InvitePlayerToClan` `FUN_002e7600` D:L186970-187046 refuses before sending: no name, MP_PLAYER_NOT_FOUND; a name in the roster, MP_PLAYER_IS_LEADER for my own, else MP_PLAYER_ALREADY_MEMBER; a name in the sent list, MP_PLAYER_ALREADY_INVITED (D:L186996-187033) -> AccountGetID by name -> `FUN_002e7850` D:L187063-187081: the account at +0x28 (AccountGetID's +0x18), "Clan %s invites you to join." of the clan name (`S:0x3f4220`) at +0x2c:200, and the same text whispered -> cb `FUN_002e7960` D:L187093-187107: -956 MP_CLAN_FULL, -985 nothing, any other failure MP_PLAYER_NOT_FOUND; Success refreshes the sent list | `MLS.cs:1930-1967`: no clan, MediusFail by the catch (:1940-1942 -> :4086-4095); `CreateClanInvitation` (`DbController.cs:1714-1771`): no clan, Fail (:1723-1725); not the leader, Fail (:1728-1729); no such account, Fail (:1732-1734); an undecided invitation to it already, Fail (:1736-1738); else the invitation (:1741-1750) -> Success (:1949-1956), any false Fail (:1957-1964). No cap, no check of the target's clan | no clan, `NO_SUCH_CLAN_STATUS_PLACEHOLDER`; not the leader, `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`; a text past the field's 199 bytes, Fail; no such account or already invited, Fail; the seats (members + undecided) at `CLAN_CAP_PLACEHOLDER`, MaxExceeded; else Success. The target's clan is not checked (as Horizon); its accept is (§4.3) |
| CheckMyClanInvitations, 0x64 -> 0x65 | research 156 §2 (`FUN_002e8650`, start 0, page 999; cb `FUN_002e86c0` keeps a row whose response status is 0, 1 or 2, D:L187599-187601) | `MLS.cs:1521-1568`: the account's undecided invitations (:1537), paged (:1538-1539), Success each (:1540-1550); none, NoResult (:1553-1560); `GetClanInvitationsByAccount` (`DbController.cs:1779-1812`) takes each clan's first invitation to the account (:1796) | the undecided invitations of standing clans, every one, paged as Horizon (`invitationPage`: skip (start - 1) x size -- the console's 0 skips none -- take size); none, NoResult |
| RespondToClanInvitation, 0x66 -> 0x67 | `UIAcceptInvitation` / `UIDeclineInvitation` -> `FUN_002e89f0` D:L187700-187705 / `FUN_002e8980` D:L187679-187684 (0xf8: the invitation id +0x28, 1 or 2 at +0x2c, the text at +0x30 zero) -> cb `FUN_002e8a60` D:L187717-187718: success or not, the received list asked again | `MLS.cs:1969-2002`; `RespondToClanInvitation` (`DbController.cs:1822-1887`): no such invitation, its clan, its account, not the caller's, or decided, false (:1831-1851); the answer, its text and its time recorded (:1854-1856); an accept adds the account to the clan, moving it from any other (:1858-1863) -> Success or Fail (:1984-1998) | the caller's own undecided invitation of a standing clan, else Fail; a decline closes it with its text and time; an accept joins in one store change (`acceptClanInvitation`) -- an account already in a clan is refused, `IN_A_CLAN_ACCEPT_STATUS_PLACEHOLDER`, the invitation left undecided; a response but 1 or 2 is a malformed body (400; the console sends no other) |
| RevokeClanInvitation, 0x68 -> 0x69 | `UIRevokeInvite` -> `FUN_002e72a0` D:L186837-186885 (the name looked up in the sent list -- none, MP_PLAYER_NOT_FOUND -- its account at +0x28) -> cb `FUN_002e7420`: the sent list asked again | `MLS.cs:2004-2041`: no clan, MediusFail by the catch (:2014-2016 -> :4086-4095); `RevokeClanInvitation` (`DbController.cs:1896-1940`): no clan or not the leader, false (:1905-1911); the clan's first invitation to the account, none or decided, false (:1913-1920); else revoked, 3 (:1923) | no clan, `NO_SUCH_CLAN_STATUS_PLACEHOLDER`; not the leader, `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`; no undecided invitation to the account, Fail; else revoked (the store's 3, its time stamped) |
| RemovePlayerFromClan, 0x60 -> 0x61 | `CZOnlineLobby_RemovePlayerFromClan` `FUN_002e7450` D:L186903-186942: the roster's selected row; my own, MP_PLAYER_IS_LEADER before sending (D:L186925-186928); else the account +0x28, the clan +0x2c -> cb `FUN_002e7580` D:L186954-186964: failure MP_PLAYER_NOT_FOUND, Success MP_SUCCESS and the roster asked again | `MLS.cs:1570-1612`: the caller in no clan, NotClanMember (:1580-1586); `ClanLeave` (`DbController.cs:1662-1704`, the request's clan): none, false (:1670-1672); another's removal by a non-leader, false (:1675-1676); the leader, false, "must transfer or disband" (:1678-1680); a non-member, true and no change (:1682-1689) -> Success or Fail (:1592-1607) | NotClanMember as Horizon; no standing clan of the id, `NO_SUCH_CLAN_STATUS_PLACEHOLDER`; a non-leader's removal of another, `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`; the leader, `LEADER_LEAVE_STATUS_PLACEHOLDER`; a non-member, Success and no change; else the member leaves |
| QuitClan (the same 0x60) | `UIQuitClan` -> `FUN_002e8ef0` D:L187852-187870: my own account at +0x28, the clan at +0x2c -> cb `FUN_002e8f70` D:L187875-187895: Success clears the clan state (the ids to -1, the name, the roster) and posts the stats; a failure is silent | as RemovePlayerFromClan | `quit` = `remove` with the caller's own account: a member leaves; the leader is refused `LEADER_LEAVE_STATUS_PLACEHOLDER` (transfer or disband first) |
| GetClanInvitationsSent, 0x7a -> 0x7b | `UIGetInvitedPlayers` -> `FUN_002e6ea0` D:L186709-186729 (page 999 at +0x2c) -> cb `FUN_002e6f50` D:L186734-186782: a row of status 1 sends AddPlayerToClan and a revoke (§4.4); rows of 0, 1 and 2 kept (D:L186773-186776), drawn "Undecided", "Accepted", "Declined" (`FUN_002e70b0` D:L186810-186822); none, "No Invitations Sent" (`S:0x3f40d0`) | `MLS.cs:1732-1777`: the caller's clan (none: `ClanId.Value` of none, an exception the catch answers NoResult, the request's default, :1742 -> :4086-4095); its undecided invitations (:1748), paged (:1749-1750), Success each with the invitee, the response's text, status and time (:1751-1759); none, NoResult (:1763-1771) | the same; the caller in no clan, NoResult, as Horizon's catch answers (SVC-10's review: no longer `NO_SUCH_CLAN_STATUS_PLACEHOLDER`) |
| AccountGetID, Lobby 0x17 -> 0x18 (`Types.cs:597-598`) -- *added 2026-10-15, NU-14; reading, pending review; not a clan pair, served on the lobby's handler* | InvitePlayerToClan's lookup of the typed name, after its refusals: `FUN_002e7600` D:L187034-187038 (0x46 bytes, the session key at +0x15, the name at +0x26:32; `FUN_00649e28` D:L561475-561495) -> cb `FUN_002e7850` D:L187049-187083 reads the status +0x1c and the account +0x18: not Success, MP_PLAYER_NOT_FOUND; Success, the invitation above | `MLS.cs:468-497`: no session, an exception (:471-472); `GetAccountByName` (`DbController.cs:159-182`, simulated mode: the application's account whose name lower-cased equals the request's, :167) -> Success and its id (:479-486); none, AccountNotFound -998 (`Types.cs:72`; :488-494). The database, not a session's presence: a player logged off is found | `AccountGetIdService` (`accountGetId.ts`), `POST /lobby/account-id` `{ accountName }` on `lobbyHandler` (the invite's lookup, research 273 §2.2, and the ignore list's add's, research 269 §1.6): the store's account of the name (`nameKey`) **with a live session** (`AccountService.loginAt`), in a room or not, Success and its id; else -- logged off, no such account, a name outside the field's 31 bytes -- -998 and the account 0; no ticket 401. `ACCOUNT_GET_ID_PRESENCE_READING`: the disc's #376 ("does not exist or is not currently logged in") outranks Horizon's offline-found answer (the merge controller's ruling between readings, 2026-10-15; first built on Horizon's, the review's F1). Before it the pages asked SVC-18's FindPlayer, which finds only a player in a room or a game seat (`chat.ts` `findPlayer`) -- the owner's playtest of 2026-10-15 (NU-14) |

### 4.2 The clan cap (H-next b)

The original server's cap is unobservable. The console shows a full clan only when the server answers an invitation
-956 (MediusMaxExceeded -> MP_CLAN_FULL, `FUN_002e7960` D:L187095-187097), and its own rule, read by the screens before
an invite, is the roster's count plus the invitations sent below 16 (`CanInviteMorePlayersToClan`, ELF 0x2e5fe0,
research 97 R97.6), beside UIMnLOC 384's "16 members plus invitees". Horizon has no cap. Ours counts as the client does
-- the members and the undecided invitations together -- and refuses an invite at `CLAN_CAP_PLACEHOLDER` (16) with
-956: the leader and fifteen invitations hold 16 seats, the seventeenth is refused. An accept moves a seat from the
invitations to the roster, so the roster never passes the cap through invitations. What settles it: the owner's ruling
(H-next b, H34) or an ONL-32 transcript of a server's -956.

### 4.3 The leader cannot leave; where ours differs from Horizon

Horizon refuses the leader's own quit and any removal of the leader with MediusFail (`DbController.cs:1678-1680`); the
clan's leader must transfer the leadership (§1.1) or disband it (§3.2). Ours answers the title's code for it,
LeaderCannotLeaveClan (-951), as `LEADER_LEAVE_STATUS_PLACEHOLDER` (§3.3's rule); the console shows neither (its remove
refuses its own row before sending; its quit's callback is silent on a failure). After a transfer the old leader quits
as a member.

Four places where ours is not Horizon's, each named:
- **An accept from an account in a clan** is refused (`IN_A_CLAN_ACCEPT_STATUS_PLACEHOLDER`); Horizon moves the account
  and leaves it on the old clan's roster (`DbController.cs:1859-1863`), which the store's one-clan rule (SVC-04) forbids.
- **Revoke** takes the clan's undecided invitation to the account (`REVOKE_LIVE_INVITATION_READING`); Horizon takes the
  clan's first one (`:1914`) and fails if it is decided, so after a decline and a second invitation Horizon can no
  longer revoke the second. A reading, because the client shows it: the console revokes a row of the sent list it was
  answered, by that row's account (`FUN_002e72a0` D:L186855-186878), and those rows are the undecided invitations, so
  the one it means is the live one.
- **CheckMyClanInvitations** lists every undecided invitation (`INVITATIONS_RECEIVED_LIVE_PLACEHOLDER`); Horizon lists
  each clan's first invitation to the account (`:1796`), so after a decline it never lists a second invitation from the
  same clan. The store keeps one undecided invitation per clan and account, so ours lists at most one per clan, the live
  one. A placeholder: the client draws whatever rows it is sent (`FUN_002e86c0`), so it shows neither rule.
- **An empty invitation text** is refused MediusFail, where Horizon stores one (`DbController.cs:1741-1750`): the
  store's width rule for an invitation (`fitsField`, 1 to 199 bytes). The console always sends "Clan %s invites you to
  join." (`S:0x3f4220`, D:L187074), so no console request meets the refusal; labelled here, not a constant.

### 4.4 Which invitations the lists hold (`INVITATION_LISTS_UNDECIDED_PLACEHOLDER`)

The console's rows can show more than Horizon sends. Its received list keeps a reply whose response status is 0, 1 or 2
(D:L187599-187601) and draws "Accepted" and "Declined" beside "Undecided" (`FUN_002e8780` D:L187642-187654); its
sent list does the same (`FUN_002e70b0` D:L186810-186822), and for every row whose status is 1 the leader's console
sends AddPlayerToClan (Lobby 0x5e, `FUN_00645a48`) with "Everyon Welcome %s to the clan" (`S:0x3f4070`) and then
RevokeClanInvitation, whose callback's label is "ClanInviteRevokeHack" (`S:0x3f40f0`, the stub at ELF 0x2e7270; the
add's is "MediusAddPlayerToClan", `S:0x3f4110`, ELF 0x2e7280) -- `FUN_002e6f50` D:L186758-186772. That is a server
that listed decided invitations and made the member on the leader's add, the revoke clearing the accepted row (the
roadmap's "what ClanInviteRevokeHack means", answered at the reading level). Horizon lists the undecided only
(`MLS.cs:1537`, `:1748`), joins on the invitee's accept (`DbController.cs:1858-1863`) and has no handler for 0x5e
(research 97 R97.3), so against it the console never sends the add. Ours ships Horizon's model -- the pairing the
console is known to run against -- against the client's reading, and 0x5e stays unanswered: a placeholder
(`INVITATION_LISTS_UNDECIDED_PLACEHOLDER`), the owner's choice in the plan's H174 (H-next h). What settles it: an ONL-32
transcript of an accept against the original's server (gone), or the owner choosing the client's model; the change
would be the lists' filter, a 0x5e handler and the accept not joining.

### 4.5 The page's ticketless request (`CLAN_INVITATIONS_TICKETLESS_ADAPTATION`, a port seam)

*[2026-10-15: retired 2026-10-15 by INVITE-TICKETLESS: a ticketless request 401, research 273 §9. Since ONL-28's `connectClanInvitations` the page asks only with the ticket; what follows is the
seam as it stood.]*

The page's half (`packages/viewer/src/clanInvitationsHost.ts:39`) posts `/clan/invitations` with no ticket, and its test
holds that request (`packages/viewer/test/usagePolicyHost.test.ts:37-41`); the clan panels are parked this sprint
(W10.R4), so no page file changes here. The server keeps SVC-09a's contract for that request: **no Authorization header,
SVC-09a's none** (the one NoResult reply) -- so the ONLINE menu's row reads "NO INVITATIONS" by an answer, as before,
and logs no refusal; a ticket that names no session, 401; a valid ticket, the caller's list. It is the port's seam, not
an unknown of the original: the console sends its session key on every request (`FUN_002e8650`) and Horizon sends no
reply without a session (`MLS.cs:1523-1529`). **Its owner**: the task that unparks the clan panels (W10.R4's
follow-up) makes the page send the session's ticket on this path and retires the seam -- the lane's, not the owner's
call, so no H-next row. Until then an invitee on the page does not see an invitation the server holds.

## 5. SVC-10

*Written 2026-10-09 for SVC-10 (wave 2 of web sprint 10). Reading, reviewed 2026-10-09; nothing proven -- ONL-32's
transcripts of post, modify, delete and a second member's read, and the captures of the MESSAGES band and the leader's
page, are the proven level.*

The code: `ClanService.myMessages`, `allMessages`, `send`, `modify`, `deleteMessage` (`packages/central/src/clans.ts`),
the paths `POST /clan/messages`, `/clan/all-messages`, `/clan/send-message`, `/clan/modify-message`,
`/clan/delete-message` on `clanHandler` (mounted by `createServices` as before; no `bridge.ts` change); the cut
`clanMessageCut`; the console's half transcribed beside it, as `rosterLeaderColumn` is -- `leaderMessageRows` (the leader's
list), `leaderMessageCommand` (a write's checks), `consoleDeleteSends`, `memberMessagesView` (the member's pane). The
store is SVC-04's as it stands (`addClanMessage`, `editClanMessage`, `deleteClanMessage`, the `clanMessage` counter): no
store change. The tests: `clans.test.ts` -- the vocabulary, the cut, the console's side, pairs 15-19 over SVC-09's
two-persona rig (the second member joined by invite and accept), the message paths on the endpoint, and two logins
through `createServices`.

### 5.1 The pairs

Horizon's lines are `desktop@be557831` `MLS.cs` and `DbController.cs` (simulated mode). Every handler first needs a
logged-in session (no session's client: no answer; not logged in: the default failure by the catch -- ours 401 for both)
and a clan (none: an exception, answered by the catch, §5.5).

| pair | the console's side | Horizon's answer | ours |
|---|---|---|---|
| GetMyClanMessages, Lobby 0x6c -> 0x6d | after GetMyClans (`cbGetMyClans` `FUN_002e8bd0` D:L187824-187831, the pane set to "Retrieving messages from server...", `S:0x3f4460`) and `FUN_00279790` -> `FUN_002e8460` D:L187484-187504 (0x34: the clan id +0x28, start 1 +0x2c, page 999 +0x30) -> cb `FUN_002e84e0` D:L187508-187560: a reply not Success sets MEDIUS_CLAN_MESSAGES (`S:0x3f3900`) to "No clan messages." (`S:0x3f3f60`, D:L187521-187523); each Success adds "\n" (`S:0x3f44a8`) and its text (+0x20) to the pane (D:L187525-187556) | `MLS.cs:2083-2129`: the session's clan, its store asked (0, 1) -- the first message only, whatever the request (:2097); each a Success with the clan id and the text (:2101-2111); none, one NoResult with the clan id (:2113-2121); the last ends the list (:2124). `GetClanMessages` (`DbController.cs:1947-1977`) skips startIndex x size and takes size (:1960-1962) | the caller's clan, the page the request asks (`MY_CLAN_MESSAGES_PAGE_READING`), oldest first (`CLAN_MESSAGES_ORDER_PLACEHOLDER`); none, NoResult with the clan id; no clan, NoResult (Horizon's catch, §5.5) |
| GetAllClanMessages, 0x7e -> 0x7f | `UIGetLeaderMessages` `FUN_0027a0b0` D:L124272-124280 -> `FUN_002e6310` D:L186303-186321 (0x30: start 1 +0x28, page 999 +0x2c; the leader's cache cleared first) -> cb `FUN_002e6390` D:L186325-186345: each Success kept by its id (`FUN_002e65b0` D:L186393-186450: +0x1c the id, +0x20 the text, +0xe8 the state, +0xec the end), drawn at the list's end; a failure draws what is kept | `MLS.cs:2131-2177`: the store asked (start - 1, size) (:2145); each Success with the id, the text and ClanMessageRead (:2151-2158); none, NoResult (:2162-2170) | the same; any member may ask, as Horizon (only the leader's screen does) |
| SendClanMessage, 0x6e -> 0x6f | dlgManageRosterLeader's SEND_CLAN_MESSAGE (`S:0x3eedb0`; `FUN_002797f0` D:L123956-123994 -> `FUN_002e8310` D:L187434-187458) or the leader list's "-1" row (`FUN_0027a0e0` D:L124282-124302 -> `FUN_002e60c0` D:L186244-186256): an empty text raises CLAN_MESSAGE_EMPTY (D:L187446-187447, D:L186246-186249); else 0xee with the text at +0x26:200 (D:L187451-187455) -> cb `FUN_002e83f0` D:L187462-187480: Success asks the leader's list again; a failure formats "Failed To Send Message. Error -> %s" (`S:0x3f4430`) into a buffer it never draws (D:L187474-187475) | `MLS.cs:2179-2231`: the text clamped to 199 characters (:2193-2195, marked LOCAL); a text the CLAN_MESSAGE filter refuses, Fail (:2197-2205); `ClanAddMessage` (`DbController.cs:1986-2030`): not the leader, false (:2000-2001); else appended with the next id (:2004-2008) -> Success or Fail (:2212-2227). No cap | no clan, `NO_SUCH_CLAN_STATUS_PLACEHOLDER`; not the leader, `NOT_CLAN_LEADER_STATUS_PLACEHOLDER`; the text cut to the field (§5.3), empty `CLAN_MESSAGE_EMPTY_STATUS_PLACEHOLDER`; five held, `CLAN_MESSAGES_CAP_PLACEHOLDER`; else appended, Success |
| ModifyClanMessage, 0x70 -> 0x71 | a listed row's write (`FUN_0027a0e0` -> `FUN_002e60c0`): an empty text CLAN_MESSAGE_EMPTY (D:L186239-186242); an id the leader's cache does not hold CLAN_MESSAGE_ID_ERR (D:L186261-186270); else 0xf4, the id +0x28, the text +0x2c:200 (D:L186272-186280) -> cb `FUN_002e62d0` D:L186287-186300: Success asks the list again; a failure is silent | `MLS.cs:2233-2285`: the clamp (:2247-2249, LOCAL), the filter (:2251-2259); `ClanEditMessage` (`DbController.cs:2038-2083`): not the leader, false (:2052-2053); no message of the id in the clan, false (:2056-2058); else the text replaced in place (:2061) -> Success or Fail (:2266-2281) | as the send, and an id the caller's clan does not hold MediusFail (Horizon's own); else replaced in place, Success |
| DeleteClanMessage, 0x72 -> 0x73 | a listed row's delete (`FUN_0027a1c0` D:L124304-124321, the row's id by `atoi`) -> `FUN_002e6010` D:L186187-186204: any id but -1, 0x2c with the id at +0x28 (D:L186196-186201; no list check, no event) -> cb `FUN_002e6080` D:L186207-186220 ("DeleteClanMessage", `S:0x3f3e60`): Success asks the list again; a failure is silent | **no handler** (V20; the model `RT.Models/Lobby/MediusDeleteClanMessageRequest.cs`): the default case logs it and queues the request's default failure, MediusFail (`MLS.cs:4073-4082` -> `:4104-4111`) | `DELETE_CLAN_MESSAGE_PLACEHOLDER` (§5.4): the leader's (else the two placeholders above), by id in the caller's clan (else MediusFail); Success and the message removed |

### 5.2 How many a clan keeps, and their order (`CLAN_MESSAGES_CAP_PLACEHOLDER`, `CLAN_MESSAGES_ORDER_PLACEHOLDER`)

The original server's store is unobservable. **The console's own number is five**: `FUN_002e6400` (D:L186347-186390)
draws the leader's list into ClanLeaderMessages (`S:0x3f3f20`) -- a row per kept message, its id as "%d" (`S:0x3f3ef8`),
its text, "Message %d:" (`S:0x3f3f00`) counting from 1 (D:L186363-186375) -- and, only while it holds fewer than five
(D:L186377), the row "-1" (`S:0x3f3f10`), " " (`S:0x3f3f18`), "Message %d:" (D:L186378-186383). The "-1" row is the only
way the console writes a new message (`FUN_002e60c0` D:L186244), so it never sends a sixth. Horizon keeps any number
(`DbController.cs:2004-2008`). Ours keeps five and answers a sixth MaxExceeded (-956, `Types.cs:114`), the title's code
for a full list, which the console would not show (§5.1, the send's callback). The member's pane draws every reply,
uncapped (`FUN_002e84e0`). **The order**: Horizon's list as appended (`:2004`), an edit in place (`:2061`), paged as kept
-- oldest first; the console draws the replies in the order they come. Ours is Horizon's, by message id. What settles
both: an ONL-32 transcript of a leader posting past five, or the owner's call.

### 5.3 The codes, the empty text and the cut

The console refuses an empty text and a stale id itself, before any request: CLAN_MESSAGE_EMPTY and CLAN_MESSAGE_ID_ERR
are dlgManageRosterLeader's events (`S:0x3e23c0`, `0x3e23e0`; ONL-33's pin), raised through the lobby's event hook
(`S:0x3f3e80`, `0x3f3ea0`). `leaderMessageCommand` transcribes the checks and the test holds each. The server sees
neither from a console: a wrong id is answered MediusFail, Horizon's own answer (`DbController.cs:2056-2058`); an empty
text, which Horizon would store, is refused MediusFail by the store's field rule (`CLAN_MESSAGE_EMPTY_STATUS_PLACEHOLDER`).
**The cut**: the builders put the text in a 200-byte field with its NUL at the last byte (`FUN_00645f60` +0x26:200,
`FUN_00646008` +0x2c:200, `FUN_0064f3d8`; `WIDTHS.clanMessage`, CLANMSG_MAXLEN `Constants.cs:15`), so the server reads
at most 199 bytes, ending at any NUL. `clanMessageCut` keeps those 199 bytes and does not refuse a longer text -- where
SVC-09's invite refuses one (§4.1) -- since the field the console sends is the cut text; it counts UTF-8 bytes and never
splits a character (an adaptation: the keyboard types one byte a character, research 119 §5). The desktop's Horizon cuts
to 199 characters and maps the unprintable to '?' (`MLS.cs:2193-2195`, LOCAL, `ChatClamp.Fit`); ours does not map (the
store keeps UTF-8). No word filter (Horizon's CLAN_MESSAGE context, `MLS.cs:2197`; SVC-23's).

### 5.4 Delete (`DELETE_CLAN_MESSAGE_PLACEHOLDER`)

What the console sends: from the leader's list, the selected row's id (`atoi` of its first column, `FUN_0027a1c0`
D:L124304-124321), any id but the "-1" row's, in a 0x2c request with the id at +0x28 (`FUN_002e6010` D:L186196-186201,
builder `FUN_006460b0` D:L558991-559012). It checks nothing else and raises no event. Its callback (`FUN_002e6080`
D:L186215-186218) asks the leader's list again on Success and does nothing on a failure. **Against our Horizon**: there is
no handler, and the default case answers the request's default failure (`MLS.cs:4073-4082`; the model's
`GetDefaultFailedResponse` is MediusFail) -- so the message stays, the list is not asked again, and the console shows
nothing (the roadmap's question, answered at the reading level: nothing). The original server's answer is unobservable.
Ours does what the request means, as Horizon's edit does its checks (`DbController.cs:2038-2083`): the leader only, the
id in the caller's clan (else MediusFail), then Success and the message gone -- a second member's read no longer holds
it, and a slot is free (§5.2). Who may delete: the leader, as Horizon's post and edit (`:2000-2001`, `:2052-2053`) and
the console's (the list is the leader's screen). What settles it: an ONL-32 transcript of a delete against the original's
server (gone), or the owner's call.

### 5.5 A correction: Horizon answers the requests it throws on

§1.1 and §4.1 read a request from an account in no clan as "no reply" until SVC-10's review (`MLS.cs:2053-2055`,
`:2297-2299`, `:1940-1942`, `:2014-2016`, `:1742`); corrected where they are written, in this note, `clans.ts` and the
tests' names. Each is an exception thrown inside the handler's `try`; the catch (`MLS.cs:4086-4095`) queues
the request's default failure whenever the session's client exists (`SendDefaultFailedResponse`, `:4104-4111`) --
MediusFail for disband, transfer, invite and revoke, NoResult for the sent list and for both message reads (the models'
`GetDefaultFailedResponse`, `RT.Models/Lobby/`). Only a request without a session's client (`ClientObject` null) goes unanswered; one from a client not logged in is
answered the same way. Where Horizon's answer is MediusFail, `NO_SUCH_CLAN_STATUS_PLACEHOLDER` keeps ClanNotFound, as
§3.3's rule has it; where it is NoResult -- the sent list and both message reads -- ours answers NoResult, Horizon's
known answer, which §3.3's rule (a code Horizon answers only as MediusFail) does not cover. One value changes with it:
the sent list for an account in no clan, ClanNotFound before, NoResult now (`ClanService.invitationsSent`; its test).

## 6. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `CLAN_NAME_CHARS_PLACEHOLDER` (`packages/central/src/clans.ts`) | 13 | the original server's clan-name rules are unobservable (ONL-33, H85); the client keyboard's cap on dlgCreateClan (research 119 §5) beside the field's 31 bytes | the owner's rules (H85), or a period capture of the original refusing a name |
| `NOT_CLAN_LEADER_STATUS_PLACEHOLDER` (`clans.ts`) | NotClanLeader, -990 | a disband, transfer or stats post by an account that does not lead the clan; Horizon answers MediusFail (`DbController.cs:1576-1577`, `:1621-1622` -> `MLS.cs:2071-2076`, `:2315-2320`); the title's code for it is -990 (`Types.cs:80`), the name a disband failure prints | an ONL-32 transcript of a non-leader's disband against the original's server (gone), or the owner's call |
| `NO_SUCH_CLAN_STATUS_PLACEHOLDER` (`clans.ts`) | ClanNotFound, -971 | a disband of no standing clan, a transfer, invite or revoke by an account in none; Horizon answers MediusFail (`DbController.cs:1576` -> `MLS.cs:2071-2076`; the others by the catch, `MLS.cs:2053-2055`, `:2297-2299`, `:1940-1942`, `:2014-2016` -> `:4086-4095`, §5.5). Not the sent list, which answers NoResult as Horizon | as above |
| `IN_A_CLAN_CREATE_STATUS_PLACEHOLDER` (`clans.ts`) | `{ leader: -992, member: -966 }` | a create by an account in a standing clan; Horizon checks none (`DbController.cs:1516-1541`), the store keeps one clan an account | as above |
| `CLAN_STATS_POSTER_PLACEHOLDER` (`clans.ts`) | the leader | every UpdateClanStats the console sends is its leader's (the create's callback; dlgManageRosterLeader's `clan_tag`); Horizon checks none (`MLS.cs:1891-1929`) | ONL-32's transcript of a member's screen (none posts) |
| `CLAN_STATS_TAIL_READING` (`clans.ts`) | 0 | the bytes after the record's NUL are the console's stack (a 256-byte copy, D:L187213); no reader goes past the NUL | an ONL-32 capture of the post's bytes |
| `ROSTER_LADDER_READING` (`clans.ts`) | LadderPosition 1, TotalRankings 0, LadderStat the request's index | Horizon's stand-ins (`MLS.cs:1698-1699`, `:1709`) until the ladder | SVC-13's ladder answering the roster's fields -- **retired** 2026-10-14 by CLAN-ROSTER-LADDER (research 310 §6 item 1: the stored rating, the board's position, `ROSTER_UNRANKED_POSITION_READING` off it, the board's length) |
| `ROSTER_ONLINE_STATE_READING` (`clans.ts`) | the room service's seat; logged in in no room the menus' lobby; offline without a presence hook | Horizon's offline state (`MLS.cs:1700-1707`) without the hook; *(2026-10-16, CLAN-DOT, research 272 §12: createServices wires `roomPresence(rooms, loggedIn)` and PROFILE-PRIVACY's `sees` -- `ROSTER_PLACE_WITHHELD_READING`, research 272 §9; it had wired none, so every row answered offline)* | ONL-32's transcript of a roster |
| `CLAN_CAP_PLACEHOLDER` (`clans.ts`) | 16 seats: the members and the undecided invitations together | the server's -956 is the console's only sign of a full clan (`FUN_002e7960` D:L187095-187097); the client's own count is roster + invitations sent < 16 (ELF 0x2e5fe0); Horizon has none (§4.2) | the owner's ruling (H-next b, H34) or an ONL-32 transcript of a server's -956 |
| `IN_A_CLAN_ACCEPT_STATUS_PLACEHOLDER` (`clans.ts`) | `{ leader: -992, member: -966 }` | an accept by an account in a standing clan; Horizon moves the account (`DbController.cs:1859-1863`), the store keeps one clan an account; the create's codes (§4.3) | an ONL-32 transcript of such an accept, or the owner's call |
| `LEADER_LEAVE_STATUS_PLACEHOLDER` (`clans.ts`) | LeaderCannotLeaveClan, -951 | the leader's quit or removal; Horizon answers MediusFail (`DbController.cs:1678-1680` -> `MLS.cs:1602-1606`); the title's code for it is -951 (`Types.cs:119`); no console screen shows it (§4.3) | as above |
| `INVITATION_LISTS_UNDECIDED_PLACEHOLDER` (`clans.ts`) | the undecided only; an accept joins; AddPlayerToClan unanswered | Horizon's model, against the client's reading: Horizon lists the undecided and joins on the accept (`MLS.cs:1537`, `:1748`; `DbController.cs:1858-1863`); the console's rows draw decided invitations and its leader adds accepted ones by 0x5e then revokes them ("ClanInviteRevokeHack", `FUN_002e6f50` D:L186758-186772; §4.4) | settled by ONL-32's transcript of an accept against the original's server, or the owner (the plan's H174 (H-next h)) |
| `ACCOUNT_GET_ID_PRESENCE_READING` (`packages/central/src/accountGetId.ts`; NU-14, 2026-10-15, reading, pending review) | an account of the name with a live session, in a room or not; else AccountNotFound -998 | AccountGetID, the invite's and the ignore add's lookup (§4.1's row); the disc's #376 names a player not logged in as not found (research 269 §1.6); the other reading Horizon's database lookup (`MLS.cs:468-497`, `DbController.cs:159-182`); the full row research 273 §7 | ONL-32's transcript of an invite (or an ignore add) of a player off line |
| `REVOKE_LIVE_INVITATION_READING` (`clans.ts`) | the clan's undecided invitation to the account | the console revokes a row of the sent list it was answered, by its account (`FUN_002e72a0` D:L186855-186878), and those rows are the undecided invitations; Horizon takes the clan's first invitation to the account and fails if it is decided (`DbController.cs:1914-1920`; §4.3) | an ONL-32 transcript of a revoke after a decline and a second invitation |
| `INVITATIONS_RECEIVED_LIVE_PLACEHOLDER` (`packages/central/src/clanInvitations.ts`) | every undecided invitation, at most one a clan | Horizon lists each clan's first invitation to the account, then only if undecided (`DbController.cs:1796` -> `MLS.cs:1537`), hiding a second after a decline; the client draws whatever it is sent (`FUN_002e86c0`), so it shows neither (§4.3) | an ONL-32 transcript of a second invitation after a decline, or the owner's call |
| `CLAN_INVITATIONS_TICKETLESS_ADAPTATION` (`packages/central/src/clanInvitations.ts`) | a request with no Authorization header answered SVC-09a's none (the one NoResult reply); a ticket naming no session 401; a valid ticket the caller's list | an adaptation, not a ledger name: a port seam, no unknown of the original -- the page's `clanInvitationsHost.ts` sends no ticket while the clan panels are parked (W10.R4); the console sends its session key on every request (`FUN_002e8650`) and Horizon sends no reply without a session (`MLS.cs:1523-1529`) (§4.5) | nothing to settle: the task that unparks the clan panels makes the page send the ticket and retires the seam -- *retired 2026-10-15 by INVITE-TICKETLESS: a ticketless request 401, research 273 §9* |
| `CLAN_MESSAGES_CAP_PLACEHOLDER` (`clans.ts`) | `{ messages: 5, status: MaxExceeded -956 }` | the original server's cap is unobservable; Horizon keeps any number (`DbController.cs:2004-2008`); the console offers a new message only below five (`FUN_002e6400` D:L186377), so no console sends a sixth (§5.2) | an ONL-32 transcript of a leader posting past five, or the owner's call |
| `CLAN_MESSAGES_ORDER_PLACEHOLDER` (`clans.ts`) | oldest first, by message id | Horizon's list as appended and paged (`DbController.cs:2004`, `:1960-1962`), an edit in place (`:2061`); the console draws the replies as they come (§5.2) | an ONL-32 transcript of a read after two posts and an edit |
| `CLAN_MESSAGE_EMPTY_STATUS_PLACEHOLDER` (`clans.ts`) | MediusFail, -966 | an empty post or edit; the console refuses it first with CLAN_MESSAGE_EMPTY (`FUN_002e8310` D:L187446-187447, `FUN_002e60c0` D:L186239-186248); Horizon stores it (`MLS.cs:2195-2207`); the store's field rule refuses it (§5.3) | none from a console; the owner's call |
| `DELETE_CLAN_MESSAGE_PLACEHOLDER` (`clans.ts`) | the leader's, by id: Success and removed; a wrong id MediusFail | Horizon has no handler: its default answers MediusFail (`MLS.cs:4073-4082`), the message stays and the console's silent callback shows nothing (`FUN_002e6080` D:L186215-186218); the original server's answer is unobservable (§5.4) | an ONL-32 transcript of a delete against the original's server (gone), or the owner's call |
| `MY_CLAN_MESSAGES_PAGE_READING` (`clans.ts`) | the page the request asks (start 1, page 999 from the console), paged as GetAllClanMessages | the console asks start 1, page 999 and draws every reply (`FUN_002e8460` D:L187497-187500, `FUN_002e84e0` D:L187554-187556); Horizon's GetMyClanMessages asks its store for (0, 1), the first message only (`MLS.cs:2097`) (§5.1) | an ONL-32 transcript of a member's read of two or more messages |

## 7. What is left

- **The proven level**: ONL-32's transcripts of create, disband, by-name and by-id (H27, H94); the clan pages' captures
  (ONL-26/27). Not claimed.
- **SVC-09** (§4) *(2026-10-09: built, reading, reviewed)*: invite, respond, revoke, remove, quit, the sent list
  and CheckMyClanInvitations' real answer with its session check (`CLAN_INVITATIONS_SESSION_READING` retired, research
  156; a disbanded clan's invitations skipped); the cap a placeholder (H-next b). Its proven level is ONL-32's
  transcripts of invite, accept, decline, revoke, remove and quit -- not claimed. **Still owed from it**: the roster's
  presence (`ROSTER_ONLINE_STATE_READING`; the room service's rooms and games by account, with their names -- not in
  SVC-09's brief); the page's invitations request sending the session's ticket (`packages/viewer/src/clanInvitationsHost.ts`
  sends none and is answered SVC-09a's none, `CLAN_INVITATIONS_TICKETLESS_ADAPTATION`, §4.5 -- owned by the task that
  unparks the clan panels, W10.R4's follow-up, which retires the seam -- *retired 2026-10-15 by INVITE-TICKETLESS: a ticketless request 401, research 273 §9*); AddPlayerToClan (0x5e) if the owner takes the
  client's model (§4.4, H174 (H-next h)).
- **SVC-10** (§5) *(2026-10-09: built, reading, reviewed)*: GetMyClanMessages, GetAllClanMessages, send, modify
  and delete over the store's messages, the cut, the console's half (the leader's rows and checks, the member's pane);
  four placeholders and a reading (§6). Its proven level is ONL-32's transcripts of post, modify, delete and a second
  member's read and the captures of the MESSAGES band and the leader's page -- not claimed. **Still owed from it**: the
  page's MESSAGES band and the leader's list calling `/clan/messages` ... (ONL-26 .. ONL-30, the clan panels parked,
  W10.R4); the CLAN_MESSAGE word filter (SVC-23's); the cap and delete's answer settled (§5.2, §5.4).
- **SVC-11**: the clan rating's twelve digits from a real ladder, `CLAN_TAGS`, the clan ladder post (0xce type 1).
- **The page**: the clan screens' commands (ONL-26 .. ONL-30) calling `/clan/*`; the TextFilter request before a
  create (Lobby 0x98, SVC-23's filter); which `clan_icon_NN` the disc holds (ONL-33).
- **Not run here**: the workspace typecheck, the whole suite, a build, a browser (the host conditions of wave 1); for
  SVC-09 the server package's typecheck was not run either (the seat's hold during its run) -- the merge check's; for
  SVC-10 likewise (the merge controller's hold of 2026-10-09 20:00Z during the landing gate).
