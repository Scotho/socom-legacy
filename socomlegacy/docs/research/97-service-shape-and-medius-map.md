# 97 -- The service shape and the Medius message map (web sprint 6, SVC-02 and SVC-01)

Written 2026-10-01 for web sprint 6 (plan `../plans/2026-10-01-web-sprint-6-foundations.md`, ruling W6.R6: this note
holds SVC-02 and SVC-01; the task blocks are [`../roadmap/06-online-services.md`](../roadmap/06-online-services.md)).
Read-only research. Sources: the retail decompilation `socom2_game.elf.decomp.c` r0001 (`D:Lnnn` = its line, every
address retail), the retail ELF `game/disc/socom2_game.elf` read by [`../../tools/dump-medius-ids.ts`](../../tools/dump-medius-ids.ts)
(and, for the UI entry points Ghidra did not split into functions, disassembled at the address named -- "ELF
0x...."), `recomp/socom2_names.csv` (the `UI*` names), `socom2_game.elf.strings.txt` (`S:0x...`), our Horizon
(`server/horizon-server/`: `MLS.cs:n` is `Server.Medius/Medius/MLS.cs`, `Types.cs` is `RT.Common/Types.cs`, models under
`RT.Models/Lobby/`) and the PCSX2 lobby log `logs/parity/s4_pcsx2/slice-Medius.log` (the s4 slice: Horizon's own log of
two original clients in PCSX2). Paths without a prefix are the recompilation project's (`SOCOM_PC_ROOT`). V1-V25 are the
facts table of the roadmap segment. **No server was contacted for this note** (R293); it is reading only.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R97.1 | **The message ids are not in the ELF's `.data`.** Every `DAT_00686xxx` slot a builder posts is in the BSS (the last PT_LOAD ends its file image at 0x66a000 and its memory at 0x686f80). `FUN_0064db00` (D:L564041-564312) fills them at the library's init, one `FUN_0063c8a0(slot, class, handler)` each, and `FUN_0063c8a0` hands out the class's next id from a zeroed counter: **a slot's id is its ordinal among its class's registrations.** 264 registrations: Lobby 0x00-0xfc (253), LobbyExt 0x00-0x0a (11). Four ids are proven on the wire by the s4 slice: 0x00 `WorldReport0`, 0x01 `PlayerReport`, 0x11 `AccountUpdateStats`, 0xce `UpdateLadderStats` (§1.2, §3) | the roadmap's "a `.data` read" is corrected (SVC-02's Unknowns); `tools/dump-medius-ids.ts` decodes the registration order from the ELF's code and the dev-disc test pins every id this note uses | §1 |
| R97.2 | **Ladder posts are the plain form**: `UpdateLadderStats`, Lobby 0xce, 0x58 bytes (`FUN_0064b248`). No LobbyExt 0x0b (`UpdateLadderStatsWide`) slot is registered at all: the client cannot send the wide form. **Proven for the player's post**: the s4 slice shows it on the wire (`MsgClass:MessageClassLobby MsgType:206`) after each `MediusAccountUpdateStatsRequest`, and our Horizon logging it `Unhandled Medius Message` | SVC-13's "whether ladders use `UpdateLadderStatsWide`" is answered (no); a service must accept Lobby 0xce | §3 |
| R97.3 | **Horizon lacks more than V20 lists**: no handler for `UpdateLadderStats` (0xce), the Lobby-class `LadderList_ExtraInfo0` (0xef; Horizon's request model is the LobbyExt 0x0f form), `AddPlayerToClan` (0x5e; model only), `BanPlayer` (0x8a), the buddy confirmation's LobbyExt 0x05, 0x07 and 0x08 (no models), and `DeleteClanMessage` (0x72; V20 already) | the PLAYER RANKING list, the stats-to-ladder post and the friend confirmation do not work against our Horizon today; every shape has to supply them | §4 |
| R97.4 | **The buddy confirmation is LobbyExt 0x05-0x09**: AddFriend finds the player (`FindPlayer` 0x39) and sends `AddToBuddyListConfirmation` (Ext 0x05); the invitee receives Ext 0x06, answers Ext 0x07 with `MediusRequestAccepted` (2) or `MediusRequestDenied` (-985), and lists pending ones with `GetBuddyInvitations` (Ext 0x08) | SVC-16's "the confirmation protocol" is answered at the reading level | §2.3 |
| R97.5 | **The client tells success from failure, not one error from another**: in the retail build `FUN_002f42d0(label, status)` is `return status == 0` (D:L194338-194344), so V3's `Medius*` labels are the names of a compiled-out error report. Of the callbacks read for §2, one tests specific codes: the invitation's (`FUN_002e7960` D:L187095-187101): -956 -> MP_CLAN_FULL, -985 (`MediusRequestDenied`) -> no event, any other failure -> MP_PLAYER_NOT_FOUND (corrected in the review: this row first said only V4's -956 was tested). The other specific tests in the lobby are on the room and game paths, not §2's rows (`FUN_002ed850` D:L190283, `FUN_002edba0` D:L190425-190430 including -972, `cbCreateGame` D:L190607, `FUN_002eefa0` D:L191166-191175: SVC-03's and SVC-06's); two failures print the status's name (`FUN_002f4300`, D:L186533 disband, D:L187474 clan message) | the error vocabulary a service must reproduce is per action: success, or failure and the `MP_*` event the client raises (§2), plus the named codes | §1.3 |
| R97.6 | Client-side rules found on the way: `CanInviteMorePlayersToClan` is roster + invitations sent < 16 (ELF 0x2e5fe0); `IsClanChallengeGame` returns 0, always (ELF 0x2795d0); the clan's ladder value is the mean of the first eight roster entries' `+0x1cc` after a sort, 0 under eight members, posted as `UpdateLadderStats` type 1 (`FUN_002e7f50` D:L187285-187326) | for SVC-09, SVC-11 and SVC-13 (their blocks are not edited here) | §2.1, §2.2 |
| R97.7 | **SVC-01's mapping:** V1 and V2 hold 58 entries; 32 send a request of their own, 12 are events or variables of a named operation's response (corrected in the review from 33 / 11: `ClanLeaderMessages` is a UI variable, §5 row 58), 14 are client-local (each naming the operation whose result it reads). They need 34 requests and 2 server pushes; the same screens use 10 more | the record OC-7 is ruled on; one server test per pair: 44 pairs (§9) | §5, §9 |
| R97.8 | **The three shapes compared; the note recommends (b)**, a native service with one JSON operation per Medius request, in its own process, proven by an adapter that replays ONL-32's transcripts. No shape makes the match cross-play (DME peer-to-peer on UDP vs our WebSocket simulation); only (a) shares the lobby with recompilation and PCSX2 players, at the cost of a browser SCERT client, a bridge and eight Horizon handlers plus R4's hashing on the box console players use | **OC-7 is the owner's, open**; sprint 8's work under each shape is §8 | §6, §7, §8 |

## 1. How a request is built and numbered

### 1.1 The builders

Each libmedius request builder takes the request buffer and a callback (`FUN_0064xxxx(buf, callback)`), terminates its
fixed string fields with `FUN_0064f3d8(field, width)` (which writes a NUL at `width - 1`, D:L564314-564333), stores the
callback in a `DAT_00686axx` word, and posts the buffer with `FUN_00621268(0x40, DAT_0065618c, 0xffff, class,
DAT_00686xxx, length, buf)` (D:L531185-531213 -> `FUN_006158f8` D:L523498-523587; the class is `param_4 < 6`, the type a byte
`param_5 < 0x100`, a payload under 0x1ff sent whole). So each builder fixes the request's **class**, its **length** and
its **string widths**; the **type** is the word in the slot at the time of the call. Every builder sits between
D:L558638 and D:L562453; their lengths and widths are in §2's tables (column "len; fields").

Most requests open with the same two fields: `MessageID` 21 bytes at +0 (`MESSAGEID_MAXLEN`) and `SessionKey` 17 at
+0x15 (`SESSIONKEY_MAXLEN`); the caller copies the session key from 0x66a4d0. A few carry no session key (the
ladder and buddy-list requests: `MessageID` only).

### 1.2 The ids: a registration order, read from the code

`DAT_00686b24`..`DAT_00686f3c` lie in the BSS (`tools/dump-medius-ids.ts` prints the segment map: the PT_LOAD at
0x4c5380 has filesz 0x1a4c80 and memsz 0x1c1c00, so 0x66a000..0x686f80 is zeroed memory). `FUN_0064db00` (D:L564041-564312;
called by the two library init entry points, `FUN_006471e8` D:L559788 and `FUN_00647318` D:L559822, which then set `DAT_00656188` to 1) registers each request slot and its
response slot in turn, e.g. `FUN_0063c8a0(0x686b24, 1, 0x64bca8)`. `FUN_0063c8a0` (D:L552195-552223) refuses unless the
registry is up, reads the class's counter, writes it into the slot, files the handler at `[class][id]` and increments
the counter. The counters are allocated by `FUN_0063c700` (D:L552128-552171) through `FUN_00632340`, which memsets the
block to zero (`FUN_001959b8(p, 0, size)`). Hence: **id = the slot's ordinal among its class's registrations, from 0.**

The read is the tool's: it decodes `FUN_0064db00`'s MIPS from the ELF (each call is `lui a0` / `lui a2` / `addiu a0` /
`addiu a2` / `jal 0x63c8a0` with `addiu a1, zero, class` in the delay slot), stops at `jr ra`, refuses any call it
cannot resolve, and counts. 264 calls: 253 in class 1 (MessageClassLobby, ids 0x00-0xfc) and 11 in class 4
(MessageClassLobbyExt, ids 0x00-0x0a); none twice. `tools/test/dumpMediusIds.test.ts` pins every id this note states
(dev disc only) and tests the ELF address map and the decode on a synthetic ELF (CI).

**Cross-check.** The ordinals equal Horizon's enum values (`Types.cs` `MediusLobbyMessageIds` 0x00-0xFC,
`MediusLobbyExtMessageIds` 0x00-0x0A) wherever this note compares them, and the late additions sit where the enum puts
them (`DAT_00686bc0` registered 244th of class 1 = 0xf3 `JoinGame`, `DAT_00686ba0` = 0xf4 `CreateGame1`, though their
slots lie among the 0x2x requests). Four ids are **proven** on the wire by the s4 slice, which Horizon decoded by
number: 0x00 `WorldReport0` (18 times; slot 0x686b24, `FUN_00649700` D:L561227-561247 posting at D:L561239, called by
`FUN_002ef590` D:L191409), 0x01 `PlayerReport`, 0x11 `AccountUpdateStatsRequest`, 0xce (raw, 206). The rest are **reading**: the id from
the ELF, the name from Horizon's enum for that number, the match confirmed by the UI chain into the builder and by the
builder's fields against Horizon's model of the same name.

**The caveat.** The ids hold for the registration that follows the registry's init. A second init without
the registry's teardown would count on (both init entry points refuse while `DAT_00656188` is 1, D:L559764, D:L559810); the
logoff's in-process restart (KNOWN [logoff-relaunch]) is not traced through this. ONL-32's transcripts settle it.

### 1.3 Status: success or not

Every callback reads the response's status with `FUN_002f42d0(label, status)`, which in retail is `status == 0`
(`MediusSuccess`; D:L194338-194344): the label argument (`0x3f42b0` "MediusCreateClan", ...) is unused. On failure the
callback raises an `MP_*` event through the lobby's event hook `DAT_0044f3c8` (the UI scripts' vocabulary, S:0x3f3e80-
0x3f60b0); on success it raises the success event or refreshes a list. Specific codes: -956 `MediusMaxExceeded` on an
invitation -> MP_CLAN_FULL (`FUN_002e7960` D:L187091-187098, V4); -972 on a join (V4). `FUN_002f4300` (D:L194356-194524;
status -> its `Medius*` name, S:0x3f5510-0x3f55d0) is called twice, to print the status into a failure line: "Clan
Disband Error: %s" (D:L186533) and the clan message's send failure (S:0x3f4430, D:L187474).

## 2. The action -> message table (SVC-02)

Columns: the UI action (`recomp/socom2_names.csv`; V1/V2's names); the chain from the UI entry to the builder (decomp
lines, or ELF address where Ghidra made no function); the builder and its lines; the slot; **class and id from the ELF**
(`dump-medius-ids.ts`; L = Lobby, X = LobbyExt) with Horizon's name for that id; the request's length and the string
fields the builder terminates (offset:width); Horizon's handler (`MLS.cs` line of the `case`), or none. The `MP_*` events
are the action's error vocabulary (§1.3), with the lines that raise them. "Local" rows send nothing.

### 2.1 Clan

| action | chain | builder | slot | id | len; fields | Horizon |
|---|---|---|---|---|---|---|
| CreateClan | `UICreateClan` D:L124567-124587 -> `FUN_002e7a10` D:L187112-187135 (the name to the text filter, `MediusTextFilterPassFail` 0; refused: MP_FILTER_FAILURE D:L187150) -> cb `FUN_002e7aa0` D:L187137-187165 -> `FUN_00645710`; its cb `FUN_002e7b80` D:L187167-187221 raises MP_CREATE_CLAN_FAILURE (D:L187186) or MP_CREATE_CLAN_SUCCESS (D:L187196) and posts `UpdateClanStats` (the icon digits, format S:0x3f4328) and the clan ladder (`FUN_002e7f50`) | `FUN_00648678` D:L560596-560618 then `FUN_00645710` D:L558638-558660 | 0x686dc4, 0x686cb4 | L 0x98 TextFilter, L 0x54 CreateClan | 0x6c; +0:21 +0x15:17 +0x2c:64 / 0x4c; +0:21 +0x15:17 +0x2c:32 (clan name) | `MLS.cs:3941`, `MLS.cs:1471` |
| DisbandClan | `UIDisbandClan` ELF 0x27a920 (j `FUN_002e6850`) -> `FUN_002e6850` D:L186500-186519 (logged in, lobby state 0xb) -> cb `FUN_002e68e0` (MP_DISBAND_CLAN_FAILURE with "Clan Disband Error: %s" D:L186533-186536, MP_DISBAND_CLAN_SUCCESS D:L186550) | `FUN_006457b8` D:L558662-558683 | 0x686cbc | L 0x56 DisbandClan | 0x2c; +0:21 +0x15:17; clan id +0x28 | `MLS.cs:2040` |
| GetClan | `UIGetClan` ELF 0x27aa60 (j `FUN_002e8a90`) -> `FUN_002e8a90` D:L187723-187765 (start 1, count 999) -> cb `cbGetMyClans` 0x2e8bd0 | `FUN_006463e0` D:L559108-559129 | 0x686d4c | L 0x7c GetMyClans | 0x30; +0:21 +0x15:17 | `MLS.cs:1611` |
| IsMemberOfClan | ELF 0x27a910 (j `FUN_002e6830` D:L186491-186497: clan id 0x3df298 != -1) | local | -- | -- | -- | -- |
| IsLeaderOfClan | D:L124550-124565 -> `FUN_002e67d0` D:L186474-186489 (the leader id 0x44f5c4 equals mine) | local | -- | -- | -- | -- |
| InvitePlayerToClan, InvitePlayerToClanWithArg | D:L124510-124548, D:L124493-124508 -> `CZOnlineLobby_InvitePlayerToClan` `FUN_002e7600` D:L186970-187047 (refusals: MP_PLAYER_NOT_FOUND, MP_PLAYER_IS_LEADER, MP_PLAYER_ALREADY_MEMBER, MP_PLAYER_ALREADY_INVITED) -> `AccountGetID` by name -> cb `cbInvitePlayerToClanGetID` 0x2e7850 D:L187049-187083 -> invitation with V5's text; the same text whispered as a `ChatMessage` (`FUN_002f4d60` D:L194713-194738, type 1) -> cb `FUN_002e7960` (-956 MP_CLAN_FULL, D:L187097) | `FUN_00649e28` D:L561475-561496, `FUN_00645b90` D:L558803-558825 | 0x686b4c, 0x686cec | L 0x17 AccountGetID, L 0x62 InvitePlayerToClan | 0x46; +0:21 +0x15:17, name +0x26:32 / 0xf4; +0:21 +0x15:17 +0x2c:200 | `MLS.cs:468`, `MLS.cs:1927` |
| CanInviteMorePlayersToClan | ELF 0x27a830 (j 0x2e5fe0: roster count 0x44f744 + invitations-sent count 0x44f724 < 16) | local | -- | -- | -- | -- |
| RemovePlayerFromClan | ELF 0x27a840 -> `CZOnlineLobby_RemovePlayerFromClan` `FUN_002e7450` D:L186901-186942 (MP_PLAYER_NOT_FOUND, MP_PLAYER_IS_LEADER) -> cb `FUN_002e7580` (MP_SUCCESS) | `FUN_00645af0` D:L558780-558801 | 0x686ce4 | L 0x60 RemovePlayerFromClan | 0x30; +0:21 +0x15:17; account +0x28, clan +0x2c | `MLS.cs:1567` |
| QuitClan | `UIQuitClan` D:L123692-123700 -> `FUN_002e8ef0` D:L187850-187870 (account = mine) | `FUN_00645af0` | 0x686ce4 | L 0x60 RemovePlayerFromClan | as above | `MLS.cs:1567` |
| GetClanRoster | D:L124380-124388 -> `FUN_002e69f0` D:L186557-186581 (clan id, start 0, count 1) | `FUN_006468c8` D:L559291-559311 | 0x686e28 | L 0xda GetClanMemberList_ExtraInfo | 0x24; +0:21 | `MLS.cs:1671` |
| GetClanMemberInfo | D:L124038-124055 -> `FUN_002e6000` D:L186177-186185 (the roster cache) | local | -- | -- | -- | -- |
| CheckClanInvites | D:L124390-124398 -> `FUN_002e8650` D:L187564-187580 (count 999) -> cb `FUN_002e86c0` (MP_MEDIUS_HAS_INVITES, D:L187604) | `FUN_00645c38` D:L558827-558848 | 0x686cf4 | L 0x64 CheckMyClanInvitations | 0x30; +0:21 +0x15:17 | `MLS.cs:1518` |
| HasClanInvitations | ELF 0x277950 (j 0x2e8770: received invitations count 0x44f704 != 0) | local | -- | -- | -- | -- |
| ClanHasInvitations | ELF 0x277960 (j 0x2e7290: invitations-sent count 0x44f724 != 0) | local | -- | -- | -- | -- |
| GetClanMessages | D:L123936-123944 -> `FUN_002e8460` D:L187484-187504 (clan id, start 1, count 999) | `FUN_00645ec0` D:L558920-558941 | 0x686d1c | L 0x6c GetMyClanMessages | 0x34; +0:21 +0x15:17 | `MLS.cs:2080` |
| SendClanMessage | D:L123956-123994 -> `FUN_002e8310` D:L187434-187458 (empty: CLAN_MESSAGE_EMPTY) | `FUN_00645f60` D:L558943-558965 | 0x686d24 | L 0x6e SendClanMessage | 0xee; +0:21 +0x15:17 +0x26:200 | `MLS.cs:2176` |
| ModifyClanMessage | D:L124282-124302 -> `FUN_002e60c0` D:L186223-186284: id -1 sends a new message (as SendClanMessage), else modifies (unknown id: CLAN_MESSAGE_ID_ERR) | `FUN_00646008` D:L558967-558989 | 0x686d2c | L 0x70 ModifyClanMessage | 0xf4; +0:21 +0x15:17 +0x2c:200; message id +0x28 | `MLS.cs:2227` |
| DeleteClanMessage | D:L124304-124321 -> `FUN_002e6010` D:L186187-186204 | `FUN_006460b0` D:L558991-559012 | 0x686d34 | L 0x72 DeleteClanMessage | 0x2c; +0:21 +0x15:17; message id +0x28 | **none** (model only; V20) |
| GetClanRanking | D:L124323-124331 -> `FUN_002eab80` D:L188790-188827 | `FUN_00646838` D:L559269-559289, `FUN_0064aee8` D:L561937-561957 | 0x686e08, 0x686e18 | L 0xd4 ClanLadderPosition, L 0xd8 GetTotalRankings | 0x24; +0:21 / 0x1c; +0:21 | `MLS.cs:1851`, `MLS.cs:1160` |
| UpdateClanStats | `UIUpdateClanStats` D:L122923-122931 -> `CZOnlineLobby_UpdateClanStats` `FUN_002e7d70` D:L187223-187253 -> then `FUN_002e7f50` D:L187285-187326 (the clan ladder value, R97.6) | `FUN_00646660` D:L559200-559222, `FUN_0064b248` D:L562069-562089 | 0x686d74, 0x686e4c | L 0x84 UpdateClanStats, L 0xce UpdateLadderStats (type 1) | 300; +0:21 +0x15:17 +0x2c:256 / 0x58; +0:21 | `MLS.cs:1888`; **none** for 0xce |
| IsClanChallengeGame | ELF 0x2795d0: `jr ra` returning 0 | local (a stub) | -- | -- | -- | -- |
| ClanGameClosed | D:L125939-125954 -> `FUN_002f8c60` D:L197433-197455 (the game list cache) | local | -- | -- | -- | -- |
| ClanGameSwapSides | D:L125956-126000 (the game's clan option 4, V21) | local | -- | -- | -- | -- |
| NotOnCorrectClanTeam | D:L122911-122921 -> `FUN_002e80c0` | local | -- | -- | -- | -- |
| TransferClanLeadership (V2) | `UITransferLeadership` ELF 0x277430 (jal at 0x277498) -> `FUN_002e81b0` D:L187372-187410 (MP_PLAYER_NOT_FOUND) -> cb `FUN_002e82a0` (MP_LEADERSHIP_TRANSFER_SUCCESS, D:L187428) | `FUN_006459a0` D:L558732-558754 | 0x686cd4 | L 0x5c TransferClanLeadership | 0x4c; +0:21 +0x15:17 +0x2c:32; account +0x28 | `MLS.cs:2278` |
| ClanLeaderMessages (V2) | the UI var `S:0x3f3f20`, filled by `FUN_002e6400` (D:L186347-186391) from `UIGetLeaderMessages` D:L124272-124280 -> `FUN_002e6310` D:L186303-186321 (start 1, count 999) | `FUN_00646520` D:L559154-559175 | 0x686d64 | L 0x7e GetAllClanMessages | 0x30; +0:21 +0x15:17 | `MLS.cs:2128` |

Beyond V1/V2, on the same screens: `UIGetInvitedPlayers` D:L124400-124408 -> `FUN_002e6ea0` D:L186707-186727 ->
`FUN_00645cd8` L 0x7a `GetClanInvitationsSent` (`MLS.cs:1729`); its callback `cbGetClanInvitationsSent` 0x2e6f50
(D:L186732-186783) is the leader's **accept path**: for each invitation whose response is 1 (accepted) it sends
`AddPlayerToClan` (`FUN_00645a48` D:L558756-558778, L 0x5e, 0xf4 with the welcome line "Everyon Welcome %s to the clan"
in the 200-byte field) and then `RevokeClanInvitation` (`FUN_00645e20` D:L558897-558918, L 0x68). Our Horizon has **no
handler for 0x5e** and instead adds the member when the invitee responds (`DbController.cs:1822` `RespondToClanInvitation`).
`UIRevokeInvite` D:L124363-124378 -> `FUN_002e72a0` -> L 0x68 (`MLS.cs:2001`). `UIAcceptInvitation` D:L122892-122909 and
`UIDeclineInvitation` D:L122873-122890 -> `FUN_002e89f0` / `FUN_002e8980` -> `FUN_00645d78` D:L558873-558895, L 0x66
`RespondToClanInvitation` with response 1 / 2 (0xf8; +0x30:200) (`MLS.cs:1966`).

### 2.2 Ladder and stats

| action | chain | builder | slot | id | len; fields | Horizon |
|---|---|---|---|---|---|---|
| GetLadderInfo (player; default, "Top10") | `UIGetLadderInfo` D:L123407-123493, the argument parsed by `FUN_00278750` D:L123495-123578 ("CLAN" at S:0x3eecd0 picks the clan modes 6-11): mode 0 `FUN_002eb2c0` D:L189094-189115 (my position) + `FUN_002eb610` D:L189217-189241 (10 rows from 1); mode 1 `FUN_002eafb0` D:L188973-188992 + `FUN_002eb610` | `FUN_0064b1b8` D:L562047-562067, `FUN_0064b128` D:L562025-562045 | 0x686e5c, 0x686e40 | L 0xf1 LadderPosition_ExtraInfo, L 0xef LadderList_ExtraInfo0 | 0x24; +0:21 / 0x28; +0:21 | `MLS.cs:1238`; **none** for L 0xef (Horizon's `MediusLadderList_ExtraInfoRequest` is X 0x0f) |
| LadderUp / LadderDown (V2) | modes 4 / 5: `FUN_002eb510` D:L189183-189215 with start -14 / +14, 7 x 2 rows | `FUN_0064b128` | 0x686e40 | L 0xef | as above | none |
| LadderPressUp / LadderPressDown (V2) | modes 2 / 3: no request; the command returns 0 at the list's top (start < 2) or bottom (total < start + 14) | local | -- | -- | -- | -- |
| GetLadderInfo "CLAN" (clan ladder) | mode 6 `FUN_002eab80` (as GetClanRanking) + `FUN_002ea6b0` D:L188636-188659 (10 from 1); 7 the list only; 10 / 11 page by `FUN_002ea5c0` D:L188605-188634 | `FUN_006467a8` D:L559247-559267 | 0x686e00 | L 0xd2 ClanLadderList | 0x28; +0:21 | `MLS.cs:1276` |
| LADDER_LEADERS, LADDER_RANKING (V2) | UI vars registered at D:L182221-182224 (lobby +0xdc, +0xe0), written by `FUN_002eb7a0` D:L189313-189360 and `FUN_002eb900` D:L189361-189456 from the 0xef callback `FUN_002eb6a0` D:L189243-189276 | (0xef's response) | -- | L 0xef | -- | none |
| CLAN_LADDER_LEADERS, CLAN_LADDER_RANKING (V2) | lobby +0xe4, +0xe8 (D:L182225-182228), written by `FUN_002ea800` D:L188695-188729 and `FUN_002ea930` D:L188730-188789 from the 0xd2 callback `FUN_002ea730` D:L188661-188694 | (0xd2's response) | -- | L 0xd2 | -- | `MLS.cs:1276` |
| ON_LADDER_REFRESH (V2) | raised by `FUN_002ea930` D:L188783, `FUN_002eb010` D:L189047 (the 0xf1 callback) and `FUN_002eb900` D:L189451 | (the responses) | -- | -- | -- | -- |
| GameRejectsRank | D:L125922-125937 -> `FUN_002f8bc0` D:L197404-197429 (the game's rank bits against `FUN_002eae20`, V8) | local | -- | -- | -- | -- |

The stats post (V10, `FUN_002faa80` D:L198411-198444; called from five sites -- `cbGetMyClans`, the quit's callback
`FUN_002e8f70`, `FUN_002ee540`, `FUN_002f96f0`, `FUN_002fa8f0` -- and seen in the s4 slice at a match's end): `FUN_006482b0`
D:L560459-560481, L 0x11 `AccountUpdateStats` (0x126; +0:21 +0x15:17 +0x26:256: the 256-byte blob), handled
`MLS.cs:500` (not persisted in simulated mode, V20); then `FUN_0064b248`, L 0xce `UpdateLadderStats` (0x58; ladder type 0
at +0x18, the rating `ram0x0066a754` at +0x1c), **no Horizon handler** -- proven by the s4 slice (§3). `PLAYER INFO`:
`UIGetPlayerInfo` D:L124078-124095 -> `FUN_002efe50` D:L191683-191717 -> `FUN_00648d30` D:L560860-560881, L 0x31
`PlayerInfo` (0x2c; account +0x28) (`MLS.cs:1399`); the login's own-stats read (`FUN_002fa870`, the label
"MediusGetPlayerStats" at D:L198381) is the same request.

### 2.3 Friends

| action | chain | builder | slot | id | len; fields | Horizon |
|---|---|---|---|---|---|---|
| GetFriendsList | D:L124353-124361 -> `FUN_00301750` D:L202617-202630 | `FUN_0064ae58` D:L561915-561935 | 0x686e10 | L 0xd6 GetBuddyList_ExtraInfo | 0x15; +0:21 (no session key) | `MLS.cs:627` |
| AddFriend | D:L124254-124270 -> `FUN_003013c0` D:L202483-202545 (already a friend or pending: MP_PLAYER_IS_FRIEND, D:L202535, D:L202541; my own name: nothing) -> `FindPlayer` by name (type 1) -> cb `FUN_003015d0` D:L202547-202580 (MP_PLAYER_NOT_FOUND D:L202564) -> `AddToBuddyListConfirmation` (account +0x28, 0 at +0x2c) and **MP_FRIEND_CONFIRMATION_REQUESTED** (D:L202576) | `FUN_00648f10` D:L560929-560951, `FUN_006492d8` D:L561069-561090 | 0x686c18, 0x686c50 | L 0x39 FindPlayer, X 0x05 AddToBuddyListConfirmation | 0x50; +0:21 +0x15:17 +0x30:32 / 0x30; +0:21 +0x15:17 | `MLS.cs:1346`; **none** for X 0x05 (no model) |
| AddFriendDirectly | D:L124233-124252 -> `FUN_00300b70` D:L202159-202175 -> cb 0x300c10 (the list refreshed) | `FUN_00649198` D:L561023-561044 | 0x686c30 | L 0x3f AddToBuddyList | 0x2c; +0:21 +0x15:17; account +0x28 | `MLS.cs:543` |
| ConfirmFriend | D:L124194-124213 -> `FUN_00300a70` D:L202111-202132: status 2 (`MediusRequestAccepted`), the request dropped from the local list (`FUN_00301cf0`) | `FUN_00649378` D:L561092-561112 | 0x686c40 | X 0x07 AddToBuddyListFwdConfirmationResponse | 0x38; +0:21 +0x1c:17; status +0x18, account +0x30 | **none** (no model) |
| RejectFriend | D:L124173-124192 -> `FUN_00300af0` D:L202135-202156: status -985 (`MediusRequestDenied`) | `FUN_00649378` | 0x686c40 | X 0x07 | as above | none |
| RemoveFriend | D:L124017-124036 -> `FUN_003016a0` D:L202583-202597 -> cb 0x301710 (refresh) | `FUN_00649238` D:L561046-561067 | 0x686c48 | L 0x41 RemoveFromBuddyList | 0x2c; +0:21 +0x15:17 | `MLS.cs:585` |
| GetFriendInfo | D:L124057-124076 -> `FUN_00301140` D:L202393-202430 (the buddy-list cache 0x44fdc8) | local | -- | -- | -- | -- |
| GetFriendInvitations | D:L124343-124351 -> `FUN_003012f0` D:L202435-202455 -> cb `FUN_00301350` (the invitation list 0x44fe00) | `FUN_0064b368` D:L562113-562133 | 0x686e94 | X 0x08 GetBuddyInvitations | 0x15; +0:21 | **none** (no model) |
| MP_FRIEND_CONFIRMATION_REQUESTED (V2) | raised on the requester's side after X 0x05 is sent (D:L202576) | (AddFriend) | -- | -- | -- | -- |
| MP_PLAYER_IS_FRIEND (V2) | AddFriend's local refusal (D:L202535, D:L202541) | (AddFriend) | -- | -- | -- | -- |
| FriendInfoName, FriendInfoGame, FriendInfoLobby (V2) | written by GetFriendInfo (`FUN_00301140`, S:0x3f6058-0x3f6080) from 0xd6's cache; "Medius" shown as "MAIN MENU" | (0xd6's response) | -- | L 0xd6 | -- | `MLS.cs:627` |
| FriendConfirmationListVar (V2) | drawn by `FUN_00301810` D:L202654-202683 (S:0x3f6120) from the invitation list that X 0x08's callback and the received X 0x06 fill | (X 0x08, X 0x06) | 0x686c38 (received) | X 0x06 AddToBuddyListFwdConfirmation | -- | none |

The invitee's side: a received X 0x06 (slot 0x686c38, response handler 0x64c428) reaches `FUN_003009c0` D:L202089-202107,
which keeps it in the invitation list and draws the invitation line (S:0x3f5f20) in the
chat window; how the handler reaches `FUN_003009c0` is not traced.

### 2.4 Ignore, chat and the server's texts

| action | chain | builder | slot | id | len; fields | Horizon |
|---|---|---|---|---|---|---|
| GetIgnoreList | D:L124333-124341 -> `FUN_00300f00` D:L202303-202318 | `FUN_00649400` D:L561114-561135 | 0x686c5c | L 0xc0 GetIgnoreList | 0x26; +0:21 +0x15:17 | `MLS.cs:754` |
| AddToIgnore | D:L124215-124231 -> `FUN_00300c50` D:L202208-202244 (already ignored: PLAYER_IS_IGNORED) -> `AccountGetID` -> cb `FUN_00300db0` D:L202246-202273 (MP_PLAYER_NOT_FOUND) -> AddToIgnoreList -> cb `FUN_00300e60` D:L202275-202301 (any failure: MP_IGNORE_LIST_FULL, V4; else the list refreshed) | `FUN_00649e28`, `FUN_006494a0` D:L561137-561158 | 0x686b4c, 0x686c64 | L 0x17 AccountGetID, L 0xc2 AddToIgnoreList | 0x46 (as above) / 0x2c; +0:21 +0x15:17; account +0x28 | `MLS.cs:468`, `MLS.cs:824` |
| RemoveFromIgnore | D:L123996-124015 -> `FUN_00300fe0` D:L202343-202366 -> cb 0x3010c0 (refresh) | `FUN_00649540` D:L561160-561181 | 0x686c6c | L 0xc4 RemoveFromIgnoreList | 0x2c; +0:21 +0x15:17 | `MLS.cs:864` |
| SendMediusChat | D:L125872-125880 opens the keyboard (`FUN_00281d40`) with ELF 0x27d250, which jumps to `FUN_002f4860` D:L194526-194590 | as SendChatText | | | | |
| SendChatText | D:L125617-125625 -> `FUN_0027cbb0` D:L125627-125640 -> `FUN_002f4860`: broadcast = the text filter (`MediusTextFilterReplace` 1, `Types.cs`) then, in `FUN_002f4ba0` D:L194653-194711, `ChatMessage` type 0 target -1; a whisper = `FindPlayer` by name -> cb `FUN_002f4a20` D:L194594-194651 (MP_PLAYER_NOT_FOUND D:L194618) -> filter -> `ChatMessage` type 1 to the account | `FUN_00648678`, `FUN_00648f10`, `FUN_00649060` D:L560977-560998 | 0x686dc4, 0x686c18, 0x686c20 | L 0x98 TextFilter, L 0x39 FindPlayer, L 0x3b ChatMessage | 0x6c / 0x50 / 0x70; +0:21 +0x15:17 +0x30:64 (type +0x28, target +0x2c) | `MLS.cs:3941`, `MLS.cs:1346`, `MLS.cs:3860` |
| GetMediusAnnouncements | D:L125862-125870 -> `FUN_002f7710` D:L196520-196540 | `FUN_00649820` D:L561272-561293 | 0x686c80 | L 0x4b GetAnnouncements | 0x2c; +0:21 +0x15:17 | `MLS.cs:356` |

Also met: `UIGetUsagePolicy` D:L123946-123954 -> `FUN_002f79f0` -> `FUN_006495e0`, L 0x47 `Policy` (`MLS.cs:401`);
`UIRefreshGamePlayerList` D:L126068-126090 -> `FUN_002f6ec0` -> `FUN_00648c90`, L 0x2f `GameWorldPlayerList`
(`MLS.cs:2626`); `UIRefreshRoomPlayerList` D:L126105-126147 -> 0x31 `PlayerInfo` and, by `FUN_002f1240`, L 0xdc
`GetLobbyPlayerNames_ExtraInfo` (`MLS.cs:2937`); `UIBanSelfFromGame` D:L123702-123710 -> `FUN_002f95f0` ->
`FUN_00649d88`, L 0x8a `BanPlayer` (no Horizon model or handler); `UISetPlayerDescription` and `UINetCensorText` -> L 0x98.

### 2.5 What no row could settle

Every V1/V2 entry is traced to a builder or to a local rule above; none is left blank. What the reading cannot give:
**the order and timing of the requests on the wire, the responses' contents and the server's statuses** -- ONL-32's
transcript of each action (`ONL-32` is the proven level for every id but 0x00, 0x01, 0x11 and 0xce, which the s4 slice
shows). Two paths are read only in part: how the X 0x06 handler reaches `FUN_003009c0` (§2.3) and which of
`FUN_002eb7a0` / `FUN_002eb900` writes the leaders and which the page (§2.2: both from 0xef's callback, told apart by the
request's `MessageID` tag).

## 3. The ladder: wide or plain (the block's question)

**Plain.** The client posts `UpdateLadderStats` (Lobby 0xce, `FUN_0064b248`, 0x58 bytes: `MessageID` 21, ladder type at
+0x18, the stats from +0x1c) from two places: the player's post after the account stats (`FUN_002faa80`
D:L198436-198440, type 0, the rating `ram0x0066a754`) and the clan's (`FUN_002e7f50` D:L187322-187326, type 1, the
eight-member mean). No `UpdateLadderStatsWide` exists in this client: the LobbyExt registrations end at 0x0a
(`DnasSignaturePost`), so no slot can hold 0x0b (the dev-disc test checks it), and no other builder posts in class 4
with a ladder-sized body. The s4 slice proves the player's post on the wire: twice, right after each
`MediusAccountUpdateStatsRequest`, Horizon logs `RawMediusMessage MsgClass:MessageClassLobby MsgType:206` with the
rating at byte 28 (0x3e5 = 997, 0x3eb = 1003) and warns `Unhandled Medius Message` (`slice-Medius.log` lines 262-274). The same slice shows 0x00 `WorldReport0` 18 times (the game's world report while
hosting; slot 0x686b24), the fourth proven id.

What remains for ONL-32: the clan post on the wire (a clan screen's `UpdateClanStats`), the ladder reads (0xef, 0xf1,
0xd2, 0xd4, 0xd8) and their responses, and what a server answers to 0xce (the client's callback 0x2fab60 is not read).

## 4. What our Horizon lacks, by id

V20 named DeleteClanMessage, the ClanTeamChallenge family and the buddy confirmation. The client's own requests add:

| id | request | sent by | Horizon |
|---|---|---|---|
| L 0xce | UpdateLadderStats | every stats post (`FUN_002faa80`, player); every clan stats post (clan) | no model; logged unhandled (s4 slice) |
| L 0xef | LadderList_ExtraInfo0 | PLAYER RANKING's list and paging | no model for the Lobby form (its model is X 0x0f) |
| L 0x5e | AddPlayerToClan | the leader's accept path (§2.1) | model, no handler; Horizon adds on the response instead |
| L 0x72 | DeleteClanMessage | DeleteClanMessage | model, no handler (V20) |
| L 0x8a | BanPlayer | BanSelfFromGame | neither |
| X 0x05, X 0x07, X 0x08 | the buddy confirmation | AddFriend, Confirm/RejectFriend, GetFriendInvitations | neither (V20) |

## 5. The mapping: every V1/V2 entry to one operation and one error vocabulary (SVC-01)

**The count.** V1 lists 33 entries (25 clan, counting `InvitePlayerToClan` and `InvitePlayerToClanWithArg` apart; 2
ladder; 3 ignore; 3 chat) and V2 25 (8 friend actions; 2 events; 4 friend variables; 4 ladder variables; 5 ladder
controls; `TransferClanLeadership`; `ClanLeaderMessages`): **58 entries, every one mapped below**. 32 send a request
of their own (the operation named); 12 are events or variables that a named operation's response raises or fills (this
line said 33 and 11 until the review: row 58, `ClanLeaderMessages`, is the UI variable `S:0x3f3f20` that
`FUN_002e6400` D:L186347-186391 fills, not an action; the request is `UIGetLeaderMessages`'s); 14
are client-local and send nothing (the operation whose cached result they read is named). The service operations are
named by the Medius request they mirror and its id (§2): under every shape of §6 an operation is one Medius request
and its response, so the mapping is the same whatever is built.

**The error vocabulary** of an operation is the Medius status its response carries (`MediusCallbackStatus`,
`Types.cs:68-138`: 0 success, negatives the errors of V3) and what the client makes of it, which is only success or
failure plus V4's codes (R97.5). The column names the `MP_*` events the client raises (local refusals before the
request, then the response's), with §2's lines; "no event" where the callback's lines raise none.

| # | entry | operation (id) | prerequisite / follow-on requests | error vocabulary |
|---|---|---|---|---|
| 1 | CreateClan | CreateClan (L 0x54) | TextFilter 0x98 before; UpdateClanStats 0x84, UpdateLadderStats 0xce after | MP_FILTER_FAILURE (filter status < 0); MP_CREATE_CLAN_FAILURE (any status but 0: V3's ClanNameInUse, AlreadyLeaderOfClan, ... alike); MP_CREATE_CLAN_SUCCESS |
| 2 | DisbandClan | DisbandClan (L 0x56) | -- | MP_DISBAND_CLAN_FAILURE with the status's name; MP_DISBAND_CLAN_SUCCESS |
| 3 | GetClan | GetMyClans (L 0x7c) | -- | from the response: MP_CLAN_DISBANDED (D:L187797), MP_MEDIUS_BECAME_LEADER (D:L187808) |
| 4 | IsMemberOfClan | local: GetMyClans' clan id | -- | -- |
| 5 | IsLeaderOfClan | local: the clan's leader id (GetMyClans) | -- | -- |
| 6 | InvitePlayerToClan | InvitePlayerToClan (L 0x62) | AccountGetID 0x17 before; ChatMessage 0x3b (the whispered text) after | local MP_PLAYER_NOT_FOUND, MP_PLAYER_IS_LEADER, MP_PLAYER_ALREADY_MEMBER, MP_PLAYER_ALREADY_INVITED; AccountGetID failure MP_PLAYER_NOT_FOUND; -956 MP_CLAN_FULL (D:L187095-187097), -985 `MediusRequestDenied` no event (D:L187100), any other failure MP_PLAYER_NOT_FOUND (D:L187101) |
| 7 | InvitePlayerToClanWithArg | InvitePlayerToClan (L 0x62) | as 6 | as 6 |
| 8 | CanInviteMorePlayersToClan | local: the roster (0xda) and sent-invitation (0x7a) counts, < 16 | -- | -- |
| 9 | RemovePlayerFromClan | RemovePlayerFromClan (L 0x60) | -- | local MP_PLAYER_NOT_FOUND, MP_PLAYER_IS_LEADER; failure MP_PLAYER_NOT_FOUND (D:L186957); MP_SUCCESS (D:L186962) |
| 10 | QuitClan | RemovePlayerFromClan (L 0x60), the account mine | -- | no event (cb `FUN_002e8f70` D:L187873-) |
| 11 | GetClanRoster | GetClanMemberList_ExtraInfo (L 0xda) | -- | no event (cb `FUN_002e6a90` D:L186585-) |
| 12 | GetClanMemberInfo | local: the roster (0xda) | -- | -- |
| 13 | CheckClanInvites | CheckMyClanInvitations (L 0x64) | -- | MP_MEDIUS_HAS_INVITES (D:L187604) |
| 14 | HasClanInvitations | local: CheckMyClanInvitations' list | -- | -- |
| 15 | ClanHasInvitations | local: GetClanInvitationsSent's list (0x7a) | -- | -- |
| 16 | GetClanMessages | GetMyClanMessages (L 0x6c) | -- | no event (cb `FUN_002e84e0` D:L187508-) |
| 17 | SendClanMessage | SendClanMessage (L 0x6e) | -- | local CLAN_MESSAGE_EMPTY; failure: the status's name in the send-failure line (D:L187474) |
| 18 | ModifyClanMessage | ModifyClanMessage (L 0x70); message id -1: SendClanMessage (L 0x6e) | -- | local CLAN_MESSAGE_EMPTY, CLAN_MESSAGE_ID_ERR |
| 19 | DeleteClanMessage | DeleteClanMessage (L 0x72) | -- | no event (cb `FUN_002e6080` D:L186207-) |
| 20 | GetClanRanking | ClanLadderPosition (L 0xd4) | GetTotalRankings 0xd8 beside it | no event in the callbacks read |
| 21 | UpdateClanStats | UpdateClanStats (L 0x84) | UpdateLadderStats 0xce (type 1) after | success: the PLAYER_NAME_AND_TAG variable rewritten (cb `FUN_002e7e70` D:L187255-); failure silent |
| 22 | IsClanChallengeGame | local: always 0 | -- | -- |
| 23 | ClanGameClosed | local: the game list's entry (SVC-06) | -- | -- |
| 24 | ClanGameSwapSides | local: the game's clan option | -- | -- |
| 25 | NotOnCorrectClanTeam | local: the game's clan sides | -- | -- |
| 26 | GetLadderInfo | by its argument (§2.2): player LadderList_ExtraInfo0 (L 0xef), "CLAN" ClanLadderList (L 0xd2) | modes 0, 1: LadderPosition_ExtraInfo 0xf1; mode 6: ClanLadderPosition 0xd4 + GetTotalRankings 0xd8 | ON_LADDER_REFRESH (D:L188783, D:L189047, D:L189451) |
| 27 | GameRejectsRank | local: the game list's rank bits against the tier (V8) | -- | -- |
| 28 | GetIgnoreList | GetIgnoreList (L 0xc0) | -- | no event |
| 29 | AddToIgnore | AddToIgnoreList (L 0xc2) | AccountGetID 0x17 before; GetIgnoreList 0xc0 after | local PLAYER_IS_IGNORED; MP_PLAYER_NOT_FOUND; any failure MP_IGNORE_LIST_FULL (V4) |
| 30 | RemoveFromIgnore | RemoveFromIgnoreList (L 0xc4) | GetIgnoreList 0xc0 after | no event |
| 31 | SendMediusChat | ChatMessage (L 0x3b) | TextFilter 0x98 before; a whisper FindPlayer 0x39 first | whisper MP_PLAYER_NOT_FOUND (D:L194618); the message has no response |
| 32 | SendChatText | ChatMessage (L 0x3b) | as 31 | as 31 |
| 33 | GetMediusAnnouncements | GetAnnouncements (L 0x4b) | -- | no event |
| 34 | GetFriendsList | GetBuddyList_ExtraInfo (L 0xd6) | -- | no event |
| 35 | AddFriend | AddToBuddyListConfirmation (X 0x05) | FindPlayer 0x39 before | local MP_PLAYER_IS_FRIEND; MP_PLAYER_NOT_FOUND; MP_FRIEND_CONFIRMATION_REQUESTED once sent |
| 36 | AddFriendDirectly | AddToBuddyList (L 0x3f) | GetBuddyList_ExtraInfo 0xd6 after | no event |
| 37 | ConfirmFriend | AddToBuddyListFwdConfirmationResponse (X 0x07), status 2 | -- | the request has no callback |
| 38 | RejectFriend | AddToBuddyListFwdConfirmationResponse (X 0x07), status -985 | -- | the request has no callback |
| 39 | RemoveFriend | RemoveFromBuddyList (L 0x41) | GetBuddyList_ExtraInfo 0xd6 after | no event |
| 40 | GetFriendInfo | local: GetBuddyList_ExtraInfo's list | -- | -- |
| 41 | GetFriendInvitations | GetBuddyInvitations (X 0x08) | -- | no event |
| 42 | MP_FRIEND_CONFIRMATION_REQUESTED | AddFriend's (X 0x05) | -- | (it is one) |
| 43 | MP_PLAYER_IS_FRIEND | AddFriend's local refusal | -- | (it is one) |
| 44 | FriendInfoName | GetBuddyList_ExtraInfo's data (via GetFriendInfo) | -- | -- |
| 45 | FriendInfoGame | as 44 | -- | -- |
| 46 | FriendInfoLobby | as 44 | -- | -- |
| 47 | FriendConfirmationListVar | GetBuddyInvitations' data (X 0x08), and the received X 0x06 | -- | -- |
| 48 | LADDER_LEADERS | LadderList_ExtraInfo0's data (L 0xef) | -- | -- |
| 49 | LADDER_RANKING | LadderList_ExtraInfo0's data (L 0xef) | -- | -- |
| 50 | CLAN_LADDER_LEADERS | ClanLadderList's data (L 0xd2) | -- | -- |
| 51 | CLAN_LADDER_RANKING | ClanLadderList's data (L 0xd2) | -- | -- |
| 52 | LadderUp | LadderList_ExtraInfo0 (L 0xef), 14 back; "CLAN": ClanLadderList (L 0xd2) | -- | ON_LADDER_REFRESH |
| 53 | LadderDown | as 52, 14 on | -- | ON_LADDER_REFRESH |
| 54 | LadderPressUp | local: the list's top | -- | -- |
| 55 | LadderPressDown | local: the list's bottom | -- | -- |
| 56 | ON_LADDER_REFRESH | ClanLadderList's and LadderPosition_ExtraInfo's responses | -- | (it is one) |
| 57 | TransferClanLeadership | TransferClanLeadership (L 0x5c) | -- | local MP_PLAYER_NOT_FOUND; MP_PLAYER_NOT_FOUND on failure, MP_LEADERSHIP_TRANSFER_SUCCESS (D:L187424, D:L187428) |
| 58 | ClanLeaderMessages | a UI variable: GetAllClanMessages' data (L 0x7e, sent by `UIGetLeaderMessages`) | -- | -- |

The operations these 58 entries need: 34 requests (CreateClan, TextFilter, UpdateClanStats, UpdateLadderStats,
DisbandClan, GetMyClans, AccountGetID, InvitePlayerToClan, ChatMessage, RemovePlayerFromClan,
GetClanMemberList_ExtraInfo, CheckMyClanInvitations, GetMyClanMessages, SendClanMessage, ModifyClanMessage,
DeleteClanMessage, ClanLadderPosition, GetTotalRankings, LadderPosition_ExtraInfo, LadderList_ExtraInfo0,
ClanLadderList, GetIgnoreList, AddToIgnoreList, RemoveFromIgnoreList, FindPlayer, GetAnnouncements,
GetBuddyList_ExtraInfo, AddToBuddyListConfirmation, AddToBuddyListFwdConfirmationResponse, AddToBuddyList,
RemoveFromBuddyList, GetBuddyInvitations, TransferClanLeadership, GetAllClanMessages) and two server pushes
(`ChatFwdMessage` L 0x3c to the chat's receivers; `AddToBuddyListFwdConfirmation` X 0x06 to the invitee). The same
screens need ten more that V1/V2 do not name (§2: AccountUpdateStats, PlayerInfo, GetClanInvitationsSent,
RespondToClanInvitation, RevokeClanInvitation, AddPlayerToClan, Policy, GameWorldPlayerList,
GetLobbyPlayerNames_ExtraInfo, BanPlayer); accounts, rooms and games are SVC-03's and SVC-06's.

## 6. The three shapes

What exists (V25): `packages/server` is a Node WebSocket match server (`server.ts` 515 lines, `room.ts` 2,377):
`/health`, `/metrics`, `/rooms`, `/ws`; one `Room` per map; a session token per page (`isSessionToken`); guest names;
rate limits (120 binary / 40 text frames a second, 4,096-byte frames); no accounts, no database, no lobby; the
protocol (`viewer/src/net/protocol.ts`, version 9) declares a `chat` event no one sends. Our Horizon (V20, V24) is a
separate C# server on the hosted box: MAS, MLS, MUIS, NAT, DME on TCP 10071-10078 and UDP; simulated mode on
`config/simulated.db`.

**One fact holds for all three: the match itself is not cross-play.** The console's match runs on a DME game server: the
client asks the lobby for a client-server game and connects over TCP plus UDP to the game server the join answer names,
with the consoles' own UDP channel beside it (research 343 §6; LATER 98; was: "DME peer-to-peer over UDP with one
player hosting (V23)", too short); redotcom's is its own server-authoritative WebSocket simulation. No shape here makes
a browser player and a PCSX2 player share a round; at most the lobby (chat, friends, clans, the ladder) is shared.

| | (a) browser Medius client, WebSocket-to-TCP bridge, our Horizon | (b) redotcom-native service, JSON operations 1:1 with Medius, our database | (c) (b) inside `packages/server` |
|---|---|---|---|
| **What it takes** | in the browser: the RT/SCERT framing, its key exchange and RC4 (`RT.Cryptography`), app id 10472, and a codec for every request and response of §2 at Horizon's model layouts; a bridge from WebSocket (TLS) to MAS 10075 / MLS 10078 / MUIS 10071 that forwards nothing else; in Horizon (C#): the §4 handlers (0xce, 0xef, 0x5e, 0x8a, X 0x05/0x07/0x08, 0x72), stats persistence, R4's hashing and credential store (below); the match server registering its rooms in Horizon's game list (SVC-07) | a new service (TypeScript, Node 22): one handler per operation of §5 taking and returning JSON with the request's fields at their widths (§2) and the `MediusCallbackStatus` codes; a database; R4 natively; the browser's lobby calls it over HTTPS or a WebSocket | (b)'s operations as new message types on the match server's protocol (version 10) and handlers beside `Room`, the database in the same process |
| **Horizon today covers / lacks** | covers V20's list and the requests marked with an `MLS.cs` line in §2; lacks §4 (8 requests) and stats persistence | not used; `MLS.cs` and `DbController.cs` stay the reference for rules no capture shows (who may disband, how invitations resolve) | as (b) |
| **Persistence** | simulated mode keeps clans in `simulated.db` and does not persist stats (V20); a database mode or new code is needed | ours, every record at the original's widths (SVC-04) | ours, in the match server's process |
| **What the 1:1 claim rests on** | the wire is the original protocol: ONL-32's transcripts replay byte for byte against it | the mapping of §5 (one operation per Medius request, the same fields and statuses), proven by an adapter that turns ONL-32's request bytes into the JSON operation and the JSON response into Medius bytes to compare with the transcript | as (b) |
| **Cross-play** | the lobby with the recompilation and PCSX2 clients on the same Horizon: chat, friends, clans, ladder, the game list (not the match, above) | none with them unless a Medius front end is later put on the same operations (the conformance adapter is its start) | as (b) |
| **R4's credential** | Horizon's MAS keeps an unsalted SHA-256 of the 32-byte password (`MAS.cs:403, 605, 643`): it must hash with argon2id or scrypt, keep issued credentials (hashed, revocable) and accept one in the password field (a 128-bit value is 22 base64url characters; the field holds 31). The change is to the server every console client of that Horizon uses, and its existing accounts' hashes migrate (the owner's call, SVC-04) | built in from the first line: `node:crypto` has scrypt on Node 22 (argon2id by a dependency or a later Node: SVC-03's choice); the card's credential is ours alone | as (b) |
| **Security surface** | Horizon's C# parsers, already on the internet, now reached from any web page through the bridge; the bridge itself (an open TCP proxy unless pinned to three ports); RC4 inside TLS | a small JSON surface we write and test; no legacy crypto; the account store in its own process | (b)'s surface added to the match server's: a match-server fault can reach the account store; one process to harden |
| **Deployment (the owner's hand)** | the bridge and the Horizon changes on the hosted box, where the console players' accounts live; any connection from our services to the hosted Horizon is the owner's (SVC-01's owner calls) | a new service and its database on a box the owner names (the prepared `socom-mp`, not live) | the existing `socom-mp` deployment, one process |

## 7. The recommendation (the note's; OC-7 is the owner's)

> **Ruled 2026-10-01 (the owner, R6 in `../MISSION.md`): shape (c).** "we are going for C"; "use the existing node
> server and add all s2 required features as we spec'd. we will not use a medius server, we will recreate the features
> needed for socom on our match server to start." The services are built inside `packages/server`; §8's (c) column is
> what sprint 8 builds. The recommendation below was (b) and is kept as the record of what the note argued; its
> reason 4 (the account store apart from the match process) is the one the ruling sets aside, and its own last
> sentence stands: the operations are the same code, so the process boundary can be drawn later without redoing them.

**This note recommends (b): a redotcom-native service whose operations are the Medius requests of §5, one for one,
built as its own package and process, with the conformance adapter of §6 from the start.** It is a recommendation, not
a decision: the shape is OC-7, the owner's call, and sprint 8 builds on the ruling, whichever it is.

Reasons, from the evidence above:

1. **The 1:1 claim does not depend on the transport.** The client's behaviour is set by which requests it sends and
   which statuses it gets back (§2, R97.5); a JSON operation per Medius request with the same fields and statuses
   reproduces that, and ONL-32's transcripts, replayed through the adapter, prove it as strongly for (b) as for (a).
   (a)'s advantage is the wire, which the browser player never sees.
2. **(a) costs most where the browser gains least.** It needs a 2004-era crypto layer and a full binary codec in the
   page, a bridge, and changes to a C# server -- eight handlers, stats persistence and R4's hashing -- on the box the
   console players use, so every change touches them too. Its one gain, lobby cross-play with recompilation and PCSX2
   players, stops at the match (§6).
3. **R4 and persistence are first-class in (b).** The credential design and the 256-byte stats record (SVC-03, SVC-04,
   SVC-12c) are written once, in the project's own language, without migrating Horizon's accounts.
4. **(b) over (c): the account store apart from the match process.** A separate process keeps a match-server fault away
   from the accounts and lets each be deployed alone; the operations are the same code, so (c) stays a hosting choice
   the owner can make now or later without redoing the work.

**What would change it.** If the owner rates lobby cross-play with the desktop and PCSX2 players as a requirement, (a)
is the only shape that gives it now (or (b) plus a later Medius front end on the same operations, grown from the
adapter). If running one process is the overriding hosting constraint, (c). If ONL-32 shows a server behaviour that
cannot be expressed per request (a stateful exchange the mapping misses), the mapping is revisited under any shape.

## 8. What sprint 8 builds under each shape

| task | (a) bridge to Horizon | (b) native service | (c) inside `packages/server` |
|---|---|---|---|
| SVC-03 accounts and the credential | MAS in C#: argon2id or scrypt, a credential table, issue/check/revoke, a login accepting a credential; the page's SCERT + MAS client in TypeScript; the hosted accounts' migration | the account store, scrypt or argon2id, the credential's issue/check/revoke, the login and create operations with V3's errors (AccountAlreadyExists, AccountNotFound, AccountLoggedIn), in TypeScript | as (b), in the match server |
| SVC-04 persistence | Horizon's database: stats persisted beyond simulated mode (`DbController.cs`), backups | the schema at the original's widths (name 32, clan name 32, clan message 200, stats 256, clan stats 256), backup and restore | as (b), in the match server's process |
| SVC-05 server texts | Horizon's announcements and policy (`MLS.cs:305, 356, 401`) and MUIS: configuration | GetAnnouncements, Policy and the universe entry as operations | as (b) |
| SVC-12a the per-match arithmetic | the same pure function and unit tests under every shape | same | same |
| SVC-12b the offsets read live | the same run (PLAT-36, ONL-32) under every shape | same | same |
| SVC-12c the server's record | Horizon: `AccountUpdateStats` (`MLS.cs:500`) storing the blob, and a new `UpdateLadderStats` 0xce handler | the AccountUpdateStats and UpdateLadderStats operations storing the 256-byte record and the ladder value | as (b) |
| SVC-16 friends with confirmation | Horizon: models and handlers for X 0x05, 0x06 (push), 0x07, 0x08 and the pending-request store | the friend operations, the pending store and the X 0x06 push over the service's socket | as (b), the push on the match socket |

## 9. The conformance suite's table of contents (one server test per pair)

The reading level of SVC-03 onward is one server test per request/response pair the client uses, run against a local
service only (R293). The pairs, request -> response by id (the response's id is Horizon's enum's, `Types.cs`, and in
the registration of §1.2 the slot after the request's, except that GetAnnouncements 0x4b and GetAllAnnouncements 0x4c
share 0x4d): each test sends the request with §2's fields and widths and checks the response's id, fields and status for
success and for each failure §5 names. ONL-32's transcript of the same action is the same test's proven level.

- **Clans (18):** 0x54 -> 0x55 CreateClan; 0x56 -> 0x57 DisbandClan; 0x5c -> 0x5d TransferClanLeadership; 0x5e -> 0x5f
  AddPlayerToClan; 0x60 -> 0x61 RemovePlayerFromClan; 0x62 -> 0x63 InvitePlayerToClan (success, -956, -985 and another failure, the three the client tells apart); 0x64 -> 0x65
  CheckMyClanInvitations; 0x66 -> 0x67 RespondToClanInvitation; 0x68 -> 0x69 RevokeClanInvitation; 0x6c -> 0x6d
  GetMyClanMessages; 0x6e -> 0x6f SendClanMessage; 0x70 -> 0x71 ModifyClanMessage; 0x72 -> 0x73 DeleteClanMessage; 0x7a
  -> 0x7b GetClanInvitationsSent; 0x7c -> 0x7d GetMyClans; 0x7e -> 0x7f GetAllClanMessages; 0x84 -> 0x85
  UpdateClanStats; 0xda -> 0xdb GetClanMemberList_ExtraInfo.
- **Ladder and stats (7):** 0x11 -> 0x12 AccountUpdateStats; 0xce -> 0xcf UpdateLadderStats (types 0 and 1); 0xd2 ->
  0xd3 ClanLadderList; 0xd4 -> 0xd5 ClanLadderPosition; 0xd8 -> 0xd9 GetTotalRankings; 0xef -> 0xf0
  LadderList_ExtraInfo0; 0xf1 -> 0xf2 LadderPosition_ExtraInfo.
- **Players and lookups (5):** 0x17 -> 0x18 AccountGetID; 0x31 -> 0x32 PlayerInfo; 0x39 -> 0x3a FindPlayer; 0x2f -> 0x30
  GameWorldPlayerList; 0xdc -> 0xdd GetLobbyPlayerNames_ExtraInfo.
- **Friends (6):** 0xd6 -> 0xd7 GetBuddyList_ExtraInfo; 0x3f -> 0x40 AddToBuddyList; 0x41 -> 0x42 RemoveFromBuddyList;
  X 0x05 AddToBuddyListConfirmation -> X 0x06 pushed to the invitee; X 0x07 (no response to the sender; what the
  requester then receives is ONL-32's); X 0x08 -> X 0x09 GetBuddyInvitations.
- **Ignore (3):** 0xc0 -> 0xc1; 0xc2 -> 0xc3; 0xc4 -> 0xc5.
- **Chat and texts (4):** 0x98 -> 0x99 TextFilter (pass/fail and replace); 0x3b ChatMessage -> 0x3c ChatFwdMessage to the
  receivers (broadcast and whisper); 0x4b -> 0x4d GetAnnouncements (0x4c is GetAllAnnouncements, whose builder no
  caller reaches); 0x47 -> 0x48 Policy.
- **Moderation (1):** 0x8a -> 0x8b BanPlayer.

44 pairs in all (18 + 7 + 5 + 6 + 3 + 4 + 1), before the accounts, rooms and games SVC-03 and SVC-06 add.

## 10. What is settled, what is not, and what would settle it

- **Settled (reading, the ELF):** every id in §2, by the registration order (§1.2); the class of every request; each
  builder's length and terminated fields. **Proven:** 0x00, 0x01, 0x11 and 0xce on the wire (the s4 slice).
- **Settled (reading, the decomp):** the action chains of §2; ladder posts plain (§3); the buddy confirmation's message
  set (R97.4); success-or-failure status handling (R97.5).
- **Settled (reading, SVC-01):** the mapping of all 58 V1/V2 entries (§5) and the pairs (§9); the shapes' costs as
  far as the code read shows them (§6). **Decided since** (the owner, 2026-10-01, R6): the shape is (c), §7's note.
- **Not settled:** each request's other fields' meaning beyond the ones named (the decomp's stack offsets are named only
  where a caller writes a known value); the responses' layouts; the server's statuses for each failure; the order of
  requests on the wire. **ONL-32** (a local-stack transcript of each action, compared id by id and field by field)
  settles them; nothing here needs a game run to stand at the reading level.

## 11. Placeholders and readings

None: this note introduces no constant. The tool's `NOTE_SLOTS` is a list of addresses, each pinned by the dev-disc test.
