# 06 -- The online services (`SVC-`)

What stands behind the online screens of segment 05: the service shape, the protocol vocabulary, accounts and
personas, persistence, the server's texts, the room and game list, the match server's bridge, clans, stats and the
ladder, rank gates, player info, friends, ignore, text chat, voice, and moderation. **ONL owns the screens; SVC owns
the operations, rules, persistence and protocol.**

**The reading this segment rests on, ruled (OWNER-SVC-0; the owner, 2026-10-01, R2: "the client is ported and
server/multiplayer is ours"):** the browser client reproduces everything the console client does, and the server side
is ours, because Sony's servers are gone. One consequence: the original
server's internal rules cannot be observed (the ladder rating formula, the clan size cap, the friend-confirmation
storage, the text filter). Each is listed as an unknown, never as a fact. **Our Horizon is a reimplementation; its
behaviour is evidence of Horizon, not of Sony.**

The campaign skip does not touch this segment. Conventions: [README](README.md#conventions).

**Two levels for every service task.** The reading level is reachable now: server tests of the operation, its record
widths and its error vocabulary, held to V1-V25 and to `MLS.cs`/`Constants.cs` line by line, run against a **local**
service only. The proven level is ONL-32's transcript of the same action compared field by field (named on each task's
**Proven by** line). No service task waits for ONL-32's window to be dispatched. `MLS.cs:n` is a line of
`server/horizon-server/Server.Medius/Medius/MLS.cs`; `Constants.cs` is `RT.Common/Constants.cs` in the same tree.

## Facts this segment rests on

| # | Fact | Source |
|---|---|---|
| V1 | Client UI actions (demo symbols). Clan: CreateClan, DisbandClan, GetClan, IsMemberOfClan, IsLeaderOfClan, InvitePlayerToClan(WithArg), CanInviteMorePlayersToClan, RemovePlayerFromClan, QuitClan, GetClanRoster, GetClanMemberInfo, CheckClanInvites, HasClanInvitations, ClanHasInvitations, GetClanMessages, SendClanMessage, ModifyClanMessage, DeleteClanMessage, GetClanRanking, UpdateClanStats, IsClanChallengeGame, ClanGameClosed, ClanGameSwapSides, NotOnCorrectClanTeam. Ladder: GetLadderInfo, GameRejectsRank. Ignore: GetIgnoreList, AddToIgnore, RemoveFromIgnore. Chat: SendMediusChat, SendChatText, GetMediusAnnouncements | `recomp/socom2_names.csv` rows 0x002775e0-0x0027dde0 |
| V2 | Friends: GetFriendsList, AddFriend, AddFriendDirectly, ConfirmFriend, RejectFriend, RemoveFriend, GetFriendInfo, GetFriendInvitations; events MP_FRIEND_CONFIRMATION_REQUESTED, MP_PLAYER_IS_FRIEND; vars FriendInfoName/Game/Lobby, FriendConfirmationListVar. Ladder vars LADDER_LEADERS, LADDER_RANKING, CLAN_LADDER_LEADERS, CLAN_LADDER_RANKING; LadderUp/Down, LadderPressUp/Down, ON_LADDER_REFRESH; TransferClanLeadership; ClanLeaderMessages | `S:0x3ee358`-`0x3ee820`, `0x3e2370`, `0x3f5f60`-`0x3f6160`, `0x3eece0`-`0x3eed10`, `0x3f3950`-`0x3f3990`, `0x3f43e0`, `0x3f3f20` |
| V3 | Medius operation labels (callback error-report names, e.g. `FUN_002f42d0(0x3f4620, status)`): CreateClan, DisbandClan, AddPlayerToClan, RemovePlayerFromClan, InvitePlayerToClanInvitation, GetClanInvitationsSent, RevokePlayerInvitation, UpdateClanStats, UpdateClanRanking, UpdateLadderRanking, UpdateAccountStats, GetPlayerStats, GetPlayerForInvitation, GetGamePlayers, GetAnnouncements. Errors: ClanNameInUse, ClanNotFound, NotClanLeader, AlreadyLeaderOfClan, AccountAlreadyExists, AccountNotFound, AccountLoggedIn, PlayerBanned, PlayerNotPrivileged, NumFiltersAtMax | strings `Medius*` 0x3f3f40-0x3f5be0; D:L194427-194493 |
| V4 | -956 (`MediusMaxExceeded`) on an invite raises MP_CLAN_FULL; any AddToIgnoreList failure raises MP_IGNORE_LIST_FULL; -972 (`MediusPlayerBanned`) raises MP_BANNED_FROM_GAME | `FUN_002e7960` D:L187091-187098; `RT.Common/Types.cs:98,114`; `FUN_00300e60` D:L202283-202289; web R91 §17.1 |
| V5 | A clan invitation's text is `"Clan %s invites you to join."` copied into a 200-byte field; the welcome line "Everyon Welcome %s to the clan" (sic) | D:L187071-187076; `S:0x3f4220`, `0x3f4070`; `CLANMSG_MAXLEN = 200` (`Constants.cs:15`) |
| V6 | A clan's icon is `clan_icon_%.2d.tif`, its index the first 3 characters (atoi) of the 0x100-byte clan stats; on join the client requests the member list with 999 (reading 999 as a page size is an inference). *[2026-10-15, CLAN-ROADMAP-SYNC (W19.R14): no `clan_icon_NN` is on the disc and the retail console's index is always 0 (R128.13, R262.4).]* | D:L187811-187830 |
| V7 | Clan ranking tier `FUN_002ead80`: `p = position*1000 / ClanTotal`; p<51 -> 4, <301 -> 3, <851 -> 2, else 1; 0 when ClanTotal is 0 | D:L188867-188896 |
| V8 | Medal of merit `FUN_002eaee0` (LadderMedalOfMerit): total<12 -> 5 if total>0 else 0; else position<11 -> 5; else `p = position*1000/(total-10)`: <51 -> 4, <301 -> 3, <851 -> 2, else 1. Rank restriction tier `FUN_002eae20` (LadderRankRestriction): the same without the top-10 rung (total<12 and >0 -> 4). PLAYER INFO draws the medal from the position | D:L188898-188971; `FUN_002eb010` D:L189014-189046; D:L191955 |
| V9 | At session init the ladder rating defaults to 99 and the description to "Description Not Set". *([2026-10-04, OT.R18] web research 155 R155.1: 99 lasts only until the login's own-stats read -- the stored record replaces it, and a record whose first byte is not `'E'` (a new account's zero bytes) becomes the default record, **rating 1000**, `FUN_002f9ac0` D:L198207-198222; the s4 slice shows 1000 on both new players.)* | D:L182642-182644; `S:0x3f39b0` |
| V10 | The 256-byte account stats blob (`ACCOUNTSTATS_MAXLEN`), built by `FUN_002fab80`, posted by `FUN_002faa80` (a 0x126 account-stats request plus a 0x58 ladder request with the rating): +1 bit7 `DAT_0045a0c3`; +2 bit7 "I lead my clan"; +4 rating; +8 ladder position; +0xc minutes since login; +0x10..+0x20 ints; +0x24..+0x32 shorts; +0x34 Clan_Description (12); +0x40 clan name (0x20); +0x60 PLAYERHOMETOWN (0x3f); +0x9f PlayerDescription (0x42). *([2026-10-04, OT.R18] web research 155 §1.1 names every field: +0 the version `'E'`, +1 bits 0-6 the hit percentage, +0x10 seconds played, +0x14 / +0x18 rounds won / lost, +0x1c kills, +0x20 games (22 bits) and bonus objectives (10 bits), +0x24..+0x32 hostages rescued, VIPs rescued, VIPs killed, deaths, suicides, bombs planted, bombs defused, head shots.)* | D:L198403-198556; `S:0x3f5b60`-`0x3f5c00`; `Constants.cs:12` |
| V11 | PLAYER INFO fields in order: name "(Leader)", LADDER POSITION, SCORE, TOTAL # OF GAMES, ROUNDS WON, ROUNDS LOST, HOMETOWN, ONLINE ("NOT CURRENTLY LOGGED IN" / "%d min."), BRIEFING ROOM, GAME ("Disconnecting" / "Logging In" / "In Lobby" / "MAIN MENU"), DESCRIPTION, KILLS, DEATHS, SUICIDES, BOMBS PLANTED, BOMBS DEFUSED, HOSTAGES RESCUED, VIPs RESCUED, VIPs KILLED, BONUS OBJECTIVES, HIT PERCENTAGE, HEAD SHOTS; buttons BRIEFING, FRIEND, LADDER. Label-to-offset mapping rests on stack offsets (an inference). *(Corrected [2026-10-04, OT.R18], web research 155 R155.2: a last field follows HEAD SHOTS -- TOTAL PLAYING TIME, `h : mm` of the record's +0x10, D:L192130-192131, `S:0x3f4ec0`; BRIEFING, FRIEND, LADDER are not buttons but tags of the request for the place the page is opened from, and there are four -- `LADDER`, `FRIEND`, `CLAN` (`S:0x3f4c28`), `BRIEFING` -- `FUN_002efe50` D:L191702-191715, read back at D:L191791, L191825, L191859; and the mapping is corroborated by the final screen's YOUR STATS, which prints the same counters under its own captions.)* | D:L191940-192130; `S:0x3f4c00`-`0x3f4ea0`, `0x3f4c18`-`0x3f4c38` |
| V12 | Career stats per match `FUN_00225070`: adds actor counters +0x550, +0x556, +0x558, +0x57c, +0x57a, +0x544, and +0x560 into one of three shorts by game type (3 = ESCORT, by side); hit % a running average of `+0x588*100`; time from game +0xf0; two counters from the parameters; the games count a 22-bit field. Upload only with respawn off and outside ladder games. `FUN_00225a00` (D:L76886-76925) lists the counters in display order. At match end the client sent `MediusAccountUpdateStatsRequest` and `MediusPlayerReport` (2 each in the slice). *(Corrected [2026-10-04, OT.R18], web research 155 R155.3, R155.6: the second condition is not "outside ladder games" but **outside LAN games** -- `FUN_003045b0` D:L204493-204508 reads the valve `ComeFromLan`, `S:0x3f6328`; in ESCORT a Terrorist's short takes +0x55c, not +0x560, D:L76622-76625; the bonus-objectives field is replaced, not added, ELF 0x2251d4-0x2251e8; and the slice's two stats posts are a **round's** end -- the rating, which moves every round, `FUN_002232a0` D:L75798-75805 -- the world still active and the career counters zero.)* | D:L76580-76680; web R91 §9 (D:L76078-76082); `s4_pcsx2/slice-Medius.log` |
| V13 | In-round scoring: enemy kill +2; suicide or team kill -2; deaths 0; round won +5; alive at the end +1; objectives as listed | web R91 §8 (`FUN_00545290`..`FUN_00545c90`, D:L411473-411894) |
| V14 | Rank gates: UI vars `room_rank_bits`, `game_info_rank_restrictions`, `mp_rank_restrictions`; GameRejectsRank; filters "rate requirement" / "rate category" | D:L184790, L184824, L184101, L196736, L197287; names csv 0x0027d440; `S:0x3ef160`, `0x3ef1f0` |
| V15 | Voice, proven: the headset opens when an online game session starts; capture 1 ch 8000 Hz 16-bit, playback 2 ch 8000 Hz; hold-to-talk with a floor request to the host (type 1, grant type 3); codec SASE, 160-sample (20 ms) frames of 64 bits = 3200 bit/s, read every 80 ms; carried in the DME session. **Under our runtime the game never sends voice** | KNOWN [voice-headset]; PC research 56 §0 |
| V16 | Voice floor table: 12 entries at `voice+0x70` (owner word, 0x100 = free; expiry); the host arbitrates (1 grants a free entry, 2 releases if the owner matches, 3 sets owner and expiry, 4 clears); sent as 12 shorts in message 0x40; current channel `voice+0x24`, 0xb = radio OFF; "channel busy" = another owner holds the entry; mute is one byte per 24 player slots at `+0x10a4`. *([2026-10-05, OT.R23] web research 170 R170.2, R170.5: the 12 entries are **indexed by channel** -- one floor per channel; the channels are 0 TEAM, 1-2 the radio's other settings, 3 the dead zone, each +4 for one side, 9 the game lobby, 10 spectators, 11 radio off, `FUN_002c2c20` D:L164422-164461; "type 3" has no sender in the code read.)* | `FUN_0030e8e0` D:L210894-210964; `FUN_0030e7f0` L210844-210892; `FUN_0030e790` L210826; `FUN_0030e540`/`e6e0` L210688, L210783; `FUN_0030e550`/`e580` L210697-210724 |
| V17 | In-game command menu: RADIO > ACTIVE CHANNEL (TEAM / OFFENSE / DEFENSE), RADIO ON/OFF; TEAMMATES > player > VOTE RETAIN:REMOVE, MUTE ON:OFF; MESSAGES CUSTOM MSG 1-5; TAUNTS (CHARACTER TAUNT, CUSTOM TAUNT 01-05); a spectator gets RADIO only; items need the player alive; valve `mp_radio_channel_valve`. VOICE MODULATION ON/OFF (`DAT_003df1a8`, "VoiceMask"). *([2026-10-05, OT.R23] web research 170 R170.10: TEAMMATES > MUTE is the per-slot mute of V16, local, and an ignored player is muted at his join.)* | web R91 §17.3; `S:0x3e5cf0`-`0x3e6538`, `0x662800`; D:L81400-81436, L81556-81572, L61721-61730, L62026-62032 |
| V18 | Text chat: R1 opens `ChatSkb` (63 characters); `GetTextInput` -> `PruneUIVarSpaces` -> `SendMediusChat`; `"%s (All): %s"`, `"@%s (Team): %s"`; whisper `/w ''player name'' message`; `EnableExternalWhispers`; UI var `MAX_CHAT_TEXT_LENGTH` registered with 99; Medius' chat field is 64. **The receive function for a game-lobby line is not identified** (the Sprint 11 wrap `chatFanoutRecv` 0x2f4ef0 never fired); a second send path `SendChatText` -> `FUN_0027cb80` -> `FUN_002f4860` | PC research 66 §1, §4; `S:0x3f2704`, `0x3f2725`, `0x3ef6d0`, `0x3ef0e0`; D:L47896; `Constants.cs:34`; KNOWN [chat-recv-wrap] |
| V19 | Horizon's chat routes Broadcast to the sender's channel and Whisper to a named player; other types are logged unhandled; fields clamped (`ChatClamp`) | `MLS.cs:4118-4197`; `ChatClamp.cs` |
| V20 | Our Horizon covers buddies (no confirmation), ignore, ladder wide stats, ladder lists and positions, clans (create, invite, respond, revoke, remove, disband, messages get/send/modify, transfer, ladder), text filter, announcements; it has **no** handler for DeleteClanMessage (the model exists), the ClanTeamChallenge family (models exist) or a buddy-confirmation flow, and nothing named UpdateLadderRanking, UpdateClanRanking or GetPlayerStats. In simulated mode stats are not persisted and `GetPlayerList` returns `[]`; clans persist to `simulated.db`. *(Corrected [2026-10-04, OT.R18], web research 155 §1.4: the 256-byte record **is** saved with the simulated document -- `DbController.cs:1379-1395` sets it and flags the save, `:118-125`, `:62-67`; "not persisted" was the README's word. And the desktop's live checkout, after the pin, answers `UpdateLadderStats` 0xce with a success it keeps nothing of and `LadderList_ExtraInfo0` 0xef with an empty page, `Server.Medius/Medius/Medius150Replies.cs:42-57`: still no ladder.)* | `MLS.cs:543-2287`, `3959-4002`; `Server.Database/DbController.cs:807-2091`, `1510-1537`; `RT.Models/Lobby/`; server/README |
| V21 | Clan games: 1 "Terrorist team", 2 "SEAL team", 3 "Members only" (others refused, code 4 "Closed clan game"), 4 "Alternate teams" (sides swap each full game); the clan tag is 16 bytes (15 characters), drawn "[clan]"; the name keeps 30 characters | web R91 L247 (`FUN_002bc620` D:L161256-161299), L349, L42 |
| V22 | Original moderation: a teammates-only strict-majority vote to remove; a spectator eject at >60%; a rejoin refused with -972 and "banned from that game"; **no idle kick, no host kick** | web R91 §17 (`FUN_002c3550` D:L164913-165085) |
| V23 | A persona is a Medius account kept on the card per server HOST; a stranger's first login on a server is a create. SOCOM II is a Medius peer-to-peer title: lobby over MAS/MLS/MUIS on TCP, match traffic host-based over UDP. The client is app id 10472, library 1.50.0013 | KNOWN [persona-decoded], [personas-per-server]; PC research 80-persona-card-format; PC research 02 "Topology" |
| V24 | The project's Horizon runs hosted (Lightsail, simulated mode, DB `config/simulated.db`, ops backups); its text filters are configuration (TextFilterDefault, AccountName, ClanName, ClanMessage, Chat, GameName); it supports IP, MAC and account bans | `server/README.md`; `Server.Medius/Config/AppSettings.cs:40-65`; `DbController.cs:658-745` |
| V25 | SOCOM Legacy today: no accounts and no persistence (W3.R5); one `Room` per map; names <= 30 printable characters; rate limits 120 binary / 40 text frames a second; payload 4096; the vote kick; a 10-min address ban (placeholder); an idle kick (the owner's W3.R13, not the original's); a `chat` event declared, never sent; no voice, clan, ladder, friend or ignore code | `docs/specs/2026-09-29-web-sprint-3-multiplayer-design.md:19,48,142-143`; `packages/match/src/server.ts:53-59`; `viewer/src/net/protocol.ts:393`; `packages/match/src/room.ts:84,377,1570-1605`; `viewer/src/net/lobby.ts` |

## Tasks

### SVC-01 -- The service architecture, decided and recorded
- **Goal:** one decision record: how the browser reaches online services, and how that is held to the original.
- **What the original does:** V23; the UI actions call libmedius builders (`FUN_00645b90`, `FUN_006482b0`,
  `FUN_0064b248`, ..., D:L558803-562069).
- **Today:** a WebSocket match server only (V25); a web MP box (socom-mp) separate from the Horizon box. The record is
  written: web research 97 §5 maps all 58 V1/V2 entries (32 send their own request, 12 are a named response's events
  or variables, 14 are client-local; 33 / 11 until research 97's review moved `ClanLeaderMessages` to the variables) to one operation and one error vocabulary; §6 compares the three shapes, §7 gives
  the note's recommendation ((b), a native service, one JSON operation per Medius request, in its own process) and what
  would change it, §8 what sprint 8 builds under each, §9 the 44 request/response pairs of the conformance suite. The
  shape itself was OC-7, open until the owner ruled it on 2026-10-01: **(c), inside the existing match server** (R6;
  the note had recommended (b)).
  *Amended 2026-10-19 (the server split, [`plans/2026-10-17-server-split.md`](../plans/2026-10-17-server-split.md);
  SA.R2, SA.R6, SA.R11; row SA-15):* R6's shape (c) stands for the services, which are now one central service
  (`packages/central`) on the owner's box; the games have left it -- one match process per game (`packages/match`),
  forked by a community host's supervisor (`packages/host`). The deploy record is
  [`deploy/README.md`](../../deploy/README.md)'s three tiers, with `deploy/DEPLOY-TO-REMOTE.md` and
  `deploy/DEPLOY-FROM-REMOTE.md`; the socom-mp box above is history. The owner's calls below are unchanged.
- **Gap:** no lobby or social service. Shapes: (a) a browser Medius client over a WebSocket-to-TCP bridge into our
  Horizon (lobby cross-play with the recomp and PCSX2); (b) a redotcom-native JSON service whose operations and errors
  map 1:1 to the Medius operations of V1-V4, on our database; (c) (b) folded into `packages/server`.
- **Acceptance:** the record maps every UI action in V1, V2 to one service operation and one error vocabulary (V3, V4);
  reading level: one server test per request/response pair the client uses, built from V1-V4 and `MLS.cs`, run against
  a local service only (R293: no connection to a server that is not ours, and none to ours from a test); proven level:
  ONL-32's transcripts are the conformance suite whatever the shape.
- **Proven by:** ONL-32.
- **Dependencies:** none. **Size:** S (a document from gathered facts); the service built on it is the sum of
  SVC-03..23.
- **Unknowns:** the client's full request set (only the s4 slice is on disk; no full Medius log exists) -- ONL-32. Read
  since (research 97 §1.2, §2): the client registers 264 message slots (Lobby 0x00-0xfc, LobbyExt 0x00-0x0a) and the
  V1/V2 actions use 34 requests and 2 pushes; what stays for ONL-32 is the requests' order and timing on the wire, the
  responses and the servers' statuses.
- **Owner calls:** **OWNER-SVC-0** (the reading) -- **ruled** (R2, 2026-10-01); **the shape** (a/b/c) (OC-7: extend the
  SOCOM Legacy WebSocket server or bridge to our Horizon, whose simulated mode does not persist stats) -- **ruled (c)**
  (R6, 2026-10-01: "use the existing node server and add all s2 required features as we spec'd. we will not use a
  medius server, we will recreate the features needed for socom on our match server to start"); cross-play with
  recomp and PCSX2 players -- not built, by the same ruling. **Deploying any shape, and any connection from a service to the hosted Horizon (shape (a)'s
  bridge), are the owner's** (CLAUDE.md boundaries; the socom-mp box is prepared, not live): a row on the owner's list
  in `docs/HUMAN_TASKS.md`, never part of this task. The decision record is a document; the conformance suite runs
  against a local service only.
- **Merged from:** services SVC-01; online front end ONL-39.

### SVC-02 -- Which Medius message each client action sends
- **Goal:** settle the protocol the browser speaks or mirrors.
- **What the original does:** each builder terminates fixed-width fields and posts a fixed-length request whose type
  is the word in a `DAT_00686xxx` slot: `FUN_0064b248` sends 0x58 bytes typed by `DAT_00686e4c`, `FUN_0064b1b8` 0x24 by
  `DAT_00686e5c`, `FUN_00648d30` 0x2c by `DAT_00686bf8` (D:L558638-562453; the lengths, not the ids, are the 0x58,
  0x24, 0x2c -- corrected by web research 97 §1). The slots are BSS, filled at the library's init in registration order
  (`FUN_0064db00`): those three are Lobby 0xce `UpdateLadderStats`, 0xf1 `LadderPosition_ExtraInfo`, 0x31 `PlayerInfo`
  (research 97 §1.2). The labels include UpdateLadderRanking, UpdateClanRanking, GetPlayerStats, UpdateAccountStats
  (V3), none of which Horizon has by those names (V20); in retail they are the names of a compiled-out error report
  (research 97 §1.3).
- **Today:** the map at the reading level -- web research 97 §2 (every V1/V2 action, its chain, builder, slot, class
  and id, length and fields, Horizon's handler) and `tools/dump-medius-ids.ts`, which reads the ids from the ELF;
  `tools/test/dumpMediusIds.test.ts` pins them (dev disc) and tests the ELF map on a synthetic ELF (CI). Ladder posts
  are the plain form (research 97 §3), proven for the player's post by the s4 slice.
- **Gap:** the proven level for the ids not in the s4 slice (all but 0x00, 0x01, 0x11, 0xce) and the responses.
- **Acceptance:** reading level: a table of action, builder, message id and length read from the r0001 ELF (no run
  needed), each row citing its builder's decomp lines. The ids are not in `.data`: the `DAT_00686xxx` slots are BSS and
  the read is of `FUN_0064db00`'s registration order (research 97 §1.2; this line said "a `.data` read" until research
  97). Proven level: each id agrees with ONL-32's transcript of the same action.
- **Proven by:** ONL-32.
- **Dependencies:** none. **Size:** M (an ELF read plus a transcript compare).
- **Unknowns:** ~~the `DAT_00686xxx` contents -- the `.data` read~~ settled by research 97 §1.2 (the registration
  order; the slots hold nothing in the ELF); ~~whether ladder posts are the wide form~~ settled: plain, Lobby 0xce
  (research 97 §3; the wide form is not registered, and the s4 slice shows 0xce on the wire). Open: the clan's ladder
  post and the ladder reads on the wire, the responses' layouts and the servers' statuses -- ONL-32's transcripts.
- **Owner calls:** none.
- **Merged from:** services SVC-04.

### SVC-03 -- Accounts and personas (the service side): name and password, the hash, the remember token
- **Shrunk by R7 (the owner, 2026-10-01; [the spec](../specs/2026-10-01-web-r7-account-and-card-design.md) §2, §4,
  §7 item 5).** The block was "Accounts and personas (the service side), and the card credential": under R4 the server
  also issued a revocable random credential of at least 128 bits on a login with SAVE PASSWORD YES, written into the
  card's `PASSWORD` field, checked at the next login, listed and revoked, with two open calls (who may revoke; a
  credential's lifetime). R7 drops "the SSO stuff": the card credential, its list and its revocation, and those two
  calls go. What is left is account create and login by name and password, the argon2id hash, the login errors in the
  console's words -- and, by the owner's ruling on SAVE PASSWORD the same day, a **remember token** in a cookie. The
  R4 text is kept below where it records the reasoning, marked.
- **Goal:** create, log in and log out exactly as the console does: a plain player name and password, entered as the
  original asks, sent over TLS at account creation and at login; the server keeps only a slow hash of the password,
  and SAVE PASSWORD: YES is honoured with a remember token the page cannot read. *(It read: "with the password handled
  as R4 rules: never kept in the browser, only a slow hash kept on the server, and a revocable server-issued
  credential on the card.")*
- **What the original does:** V23; errors AccountAlreadyExists, AccountNotFound, AccountLoggedIn (V3) and the persona
  errors 543-548; ACCOUNTNAME and PASSWORD 32 bytes (`Constants.cs:11,16`); the in-game name keeps 30 (web R91 L42).
  The console kept the password plain on the card (PC research 80-persona-card-format; `SECURITY.md` records it for the
  desktop's card folder); how Sony's servers stored it is unobservable.
- **The ruling (R7, the owner, 2026-10-01, replacing R4):** the account is a plain name and password; the password
  travels **over TLS** at account creation and at login; the server stores **only an argon2id (or scrypt) hash** of
  it; there is no credential on the card and no revocation screen. **SAVE PASSWORD: YES** (R7's §7 item 5, ruled the
  same day: "agreed on cookie"): at that login the server checks the password against the hash, issues a long random
  **remember token**, keeps only the token's hash, and sets the token as an **HttpOnly, Secure, SameSite cookie on the
  match server's host**; a later login presents the cookie instead of a password; the server expires a token unused
  for a period and drops every token of a persona when its password changes; the login endpoint checks the request's
  Origin and limits attempts. The persona record on the card keeps SAVEPASSWORD and the password's length, never the
  password or the token (OPT-04). **SAVE PASSWORD: NO** stores nothing. The controller's default, which the owner may
  overturn: where the hosting cannot carry the cookie (a self-hosted page on another site than its server), YES
  behaves as NO, and the token is never put where page script can read it. What it does not fix: the password is
  still typed into the page at a login. *(R4's ruling, replaced: "the typed password travels once, over TLS, at
  account creation or login; the server stores only an argon2id (or scrypt) hash of it. On a login with SAVE PASSWORD
  YES the server issues a random credential of at least 128 bits (a CSPRNG), which the client writes into the card's
  `PASSWORD` field (OPT-04) in place of the password; a later login presents the credential, the server checks it, and
  revoking it on the server invalidates it, so a leaked card or export (OPT-08) reveals no reusable password. The
  server keeps the credential only as a hash too (a fast hash suffices for a random 128-bit value; this detail is the
  backlog's, not the ruling's), with the account, the persona and its HOST.")*
- **Today:** guest names only (`lobby.ts` `guestName`, `sanitizeName`; W3.R5).
- **2026-10-04, HARD-SEAT (research 169 measures 1 and 7, OT.R26):** the account on the seat in every room (a maps'
  hello with a ticket too: the persona name, one live seat an account, guests in the uncounted maps' rooms only,
  `GUEST_SEATS_IN_UNCOUNTED_ROOMS_DEFAULT`); a session's absolute lifetime (`SESSION_ABSOLUTE_LIFETIME_MS`, 12 h, an
  owner's default); the ticket-bearing match socket pinned to the page's own origin (`matchSocketUrl`). Open: the
  names held to the keyboard (H85), the page's game socket wired in the front end (ONL-13 on).
- **Gap:** an account store with the password hash (argon2id parameters recorded; scrypt if the runtime lacks
  argon2id); create and login by name and password; the login errors as the console words them; the remember token
  (issue at a login with SAVE PASSWORD: YES, check, idle expiry, drop on a password change; only its hash kept); an
  **HTTPS login endpoint beside the WebSocket** that sets the cookie; the **Origin check** on that endpoint (the
  ruling's requirement); a **limit on login attempts**. No credential list, no revocation screen. The card side is
  OPT-04; the screens ONL-06/ONL-07. *(R7: "credential issue, check, list and revoke" left this line.)* **Open design
  point, not a requirement:** if the cookie is ever presented on the WebSocket handshake itself, that handshake must
  check Origin (cross-site WebSocket hijacking); a design where the cookie is presented only to the HTTPS login
  endpoint, which answers with a short-lived ticket for the socket, needs no handshake Origin rule and keeps a page on
  another site playable (where YES behaves as NO, play goes on). *(Corrected 2026-10-01, review of the R7 re-cut: this
  line first required an Origin check on the WebSocket handshake too, beyond the ruling, which names the login
  endpoint only.)*
- **Acceptance:** reading level (CI, a local service only, R293): the section's server tests from V1-V25 and
  `MLS.cs`; the account row holds an argon2id/scrypt hash and no plain password (a test reads the DB after a create);
  a login with the right password succeeds and one with a wrong password is refused with the console's
  not-found/bad-password error (V3's vocabulary, the exact code from ONL-32); a create for a taken name is refused with
  AccountAlreadyExists; a login with SAVE PASSWORD: YES sets an HttpOnly, Secure, SameSite cookie whose token the DB
  holds only as a hash, a later login with the cookie and no password succeeds, an idle-expired token and every token
  of a persona whose password changed are refused; a request to the login endpoint from another Origin is refused
  (it first read "a login or a WebSocket handshake", corrected as the Gap is); a login past the attempt limit is
  refused; the typed password and the token appear in no log line. Proven level:
  ONL-32's login/create transcript replayed against our service returns the same status codes; the persona screens
  match `A_35`..`A_41` (ONL-06/07). *(R7: it read "a credential issued at login is >= 128 bits from the CSPRNG, logs
  in, and after revocation is refused with the console's not-found/bad-password error"; that test goes.)*
- **Proven by:** ONL-32 (the transcript compare).
- **Dependencies:** SVC-01, SVC-04. **Size:** M. *(Kept M under R7, 2026-10-01: the credential list and revocation
  went out, the token, the endpoint and the attempt limit came in, about the same. If the cookie's cross-host setup
  pushes it past four days, the token and its endpoint split off as their own task; it is not resized to L.)*
- **Unknowns:** the original's name character rules and duplicate-name behaviour (keyboard side ONL-33; server side
  unobservable); which status the original returns for a wrong password (ONL-32's forced error); whether shape (a) of
  SVC-01 (a Medius bridge to our Horizon) can meet R4: our Horizon stores an unsalted SHA-256 of the password
  (`Server.Medius/Medius/MAS.cs:403, 605, 643`, `Utils.ComputeSHA256`), below R4's argon2id/scrypt bar, and checks the
  32-byte Medius password field itself -- SVC-01's record names what shape (a) would change on the Horizon side.
  *(Shape (a) is moot since R6 ruled (c); R7 keeps the same argon2id/scrypt bar.)* **To confirm before the cookie is
  relied on (R7):** Safari may cap the cookie at about a week when the match server's host resolves to another
  network than the site's -- a check on the deployed hosts.
- **Owner calls:** the password storage policy on the server and SAVE PASSWORD on a browser card -- **ruled** (R4,
  2026-10-01). Still open: who may revoke (the player from a page, the operator, both) and a credential's lifetime.
  **R7 (2026-10-01):** the server's policy is ruled (an argon2id or scrypt hash) and SAVE PASSWORD: YES is ruled (the
  remember token in a cookie); R4's two revocation calls go with the card credential. **Still open: the token's idle
  lifetime; the attempt limit's numbers and its shape** (per name, which lets any client lock a name out for the
  window; HUMAN_TASKS H30, research 132 section 6). Where the hosting cannot carry the cookie, YES behaves as NO: the
  controller's default, which the owner may overturn.
- *([2026-10-05, OT.R22] web research 169 §6 (the security and anti-cheat assessment; owner row H89) adds to this
  task's acceptance, at its mount: (1) account requests go only to the host the build was made for, never to one the
  address bar's `server=` names (`universeHost.ts:23-34` reads it today), nor to the HOST and PORT a persona on the
  page's card carries (`personaHost.ts`, `PERSONA_HOST_PLACEHOLDER`): a crafted link, or a written card, must not
  carry a typed password elsewhere; (2) the login's ticket -- the session's bearer in the bridge's design (SVC-07a) --
  travels in the hello's body and in a header, never in an address, goes only to the pinned host (the match socket too: it honours `server=` today, and the connect branch's pin covers account requests only), and the session has a stated end (the bridge's:
  60 s after its last use with no socket holding it; corrected on review, 2026-10-05: an earlier wording here said
  "ends at the socket's close", which the bridge does not do); (3) the create refuses a name outside the keyboard's
  characters and its 14-character cap -- `accounts.ts:154` takes any 31 bytes of text today -- and whatever H85
  rules; (4) the server refuses to start with the endpoint mounted behind a proxy and `TRUST_PROXY` unset (research
  132 §6 (b)). It also records what the block does not hold: no rule on a password's length or strength (the owner's
  decision D5 of H89), the hash run on the thread that ticks the rooms (the proposed SVC-23c), the Origin rule being
  no lock against a script (it stops another site's page, nothing else), and the name key's lockout (H30).)*
- **Merged from:** services SVC-05; R4's credential design (2026-10-01); shrunk by R7, with its remember token
  (2026-10-01).
- *([2026-10-11, W18.R9] "the token's idle lifetime" above is answered: H178, the owner's direction, built as SVC-03a
  below.)*

### SVC-03a -- REMEMBER-ROTATE: the remember cookie's longer, rotating life (web sprint 18, merged)
- **Slice of:** SVC-03 ([2026-10-11, W18.R9]; HUMAN_TASKS H178): SVC-03's remember token given its lifetime, the open
  call "the token's idle lifetime".
- **Goal:** the remember cookie lives longer and rotates, as the owner directed, with nothing the console's screens read
  changed.
- **What the original does:** nothing to transcribe: the console kept its password on the memory card (R7); the remember
  token is a server policy, a labelled adaptation under OT.R27 (research 132 §8). A refused token answers the
  original's -978 MediusInvalidPassword, as the AccountLogin callback reads it (`FUN_002eefa0` D:L191174-191178;
  research 132 §2).
- **Today:** ~~SVC-03's token (research 132 §4): refused and dropped when idle 30 days
  (`REMEMBER_TOKEN_IDLE_MS_PLACEHOLDER`), touched on a token login with the same token kept, replaced only at a password
  login; the logout keeps it; a password change drops every one.~~ *[2026-10-11, merged at 94ab47b9f; W18.R9-R10;
  research 132 §8; a server policy, a labelled adaptation under OT.R27]* the token rolls 30 days idle
  (`REMEMBER_TOKEN_IDLE_MS_OWNER`, the placeholder retired), rotates at a use 24 h or more after its issue with a 60 s
  grace answered with the newest, drops its whole chain when a rotated-out token is presented after the grace, is capped
  90 days from the chain's password login, and is forgotten by `forget: true` on logout.
- **Gap:** ~~a 30-day idle window each use extends, the cookie's `Max-Age` re-sent at each use; a rotation at a use 24 h
  or more after the token's issue, with a 60 s grace for the old token (answered with the newest); the whole chain
  dropped when a rotated-out token is presented after its grace (the theft signal); a 90-day cap from the password login
  that began the chain; `forget: true` on `/account/logout` (the plain logout keeps the token); each figure a named
  `*_OWNER` constant citing its practice; the token's chain in the store (a schema step and its tested migration, the
  JSON form and SQLite alike); the routes' contract written for the launcher. Unchanged: HttpOnly, Secure,
  SameSite=Strict, `Path=/account`, one cookie per account, only hashes stored, the attempt limits, the statuses.~~ *[closed 2026-10-13 at the players' half's close: built, Today above.]*
- **Acceptance:** server unit tests on a fake clock: a use at 23 h 59 m keeps the token and rolls the idle window; at
  24 h it rotates; the old token within 60 s is accepted and answered with the newest, at 61 s the chain is dropped and
  the cookie cleared; a chain at 90 days less 1 ms signs in, at 90 days it is refused; 30 days idle refused; `forget`
  drops and clears, the plain logout keeps; a password change drops every chain; the migration of a store with tokens;
  the cookie line's every attribute.
- **Proven by:** nothing of the original's: a server policy, held by its tests (research 132 §8).
- **Dependencies:** SVC-03, SVC-04. **Size:** S.
- **Unknowns:** whether a browser keeps a `Secure` cookie set over plain HTTP on 127.0.0.1 or localhost
  (`REMEMBER_LOOPBACK_SECURE_COOKIE_READING`, research 132 §7) -- the browser's behaviour, not the original's.
- **Owner calls:** H178 answered 2026-10-11 (the owner, in the merge controller's seat, relayed by the merge
  controller; W18.R9): *"yes, give cookies a longer rotating duration (whatever is commonly accepted and somewhat
  secure)"* -- the figures the seat's under those words; SameSite=Strict kept (W18.R9's settled line). "Remember me" on
  by default is the client's (the launcher's, dot's), not this task's.
- **Merged from:** new, 2026-10-11 (W18.R9; H178), added to sprint 18 by the merge controller.

### SVC-04 -- Persistence on our hosted box
- **Goal:** durable storage of accounts, clans, clan messages and invitations, buddies, ignore lists, stats blobs,
  ladder entries and announcements.
- **What the original does:** server-side storage is unobservable; the client sees only the records of V5-V12.
- **Today:** none in SOCOM Legacy (V25); Horizon persists to `simulated.db` with ops backups (V24).
  *(2026-10-05, OT.R37, merged at ea9efbf9; web research 220: overtaken -- the store is
  `packages/central/src/serviceStore.ts` (research 131), since OT.R37 on SQLite, `DATA_DIR/services.sqlite` through
  `node:sqlite`, a change writing only the rows that differ; its JSON backup and restore kept; the loadouts in it.)*
- **Gap:** a schema holding each record at the original's widths (name 32, clan name 32, clan message 200, stats 256,
  clan stats 256; `Constants.cs`), the account's password hash and its issued credentials as hashes with their
  revocation state (SVC-03, R4), backup and restore. **Corrected by R7 (2026-10-01):** the issued credentials and
  their revocation state go from what is persisted (R7 issues none on the card); the account keeps its argon2id/scrypt
  password hash, and what is persisted gains the remember tokens' hashes with their last-used time (SVC-03's idle
  expiry; R7's §7 item 5).
- **Acceptance:** each operation's DB effect equals Horizon's `-Show` diff for the same ONL-32 step, ids normalised; a
  restore test passes.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-01. **Size:** M.
- **Unknowns:** none on the client side; the hosting target (the prepared `socom-mp` box is not live).
- **Owner calls:** which box hosts it, data retention, migrating the hosted Horizon's existing accounts (hosting and
  data are the owner's: CLAUDE.md boundaries).
- **Merged from:** services SVC-06; platform PLAT-30.

### SVC-05 -- Server texts: universe, policy, announcements (SERVER NEWS, MESSAGES)
- **Goal:** the universe entry, the agreement and the news carried as the client reads them.
- **What the original does:** GetMediusAnnouncements (names csv 0x0027d1f0); `MLS.cs:305` (GetAllAnnouncements), `:356`;
  body up to 1000 (`ANNOUNCEMENT_MAXLEN`, `Constants.cs:26`); policy via `MediusGetPolicyRequest` (`MLS.cs:401`); MUIS
  LobbyExt 0x03 -> 0x04 entries.
- **Today:** none.
- **Gap:** the sources for ONL-04, ONL-08, ONL-09.
- **Acceptance:** the same body on the console and SOCOM Legacy, captures compared (`A_44`, `A_45`, a long-body sheet per PC
  research 80-online-menus Q3 for the scroll speed).
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-04. **Size:** S.
- **Unknowns:** whether SERVER NEWS and the MESSAGES pane show one text or two.
- **Owner calls:** our universe name, news, agreement text and announcements.
- **Merged from:** services SVC-07; online front end ONL-04/ONL-08 (server texts).

### SVC-06 -- Rooms and the game list: create, list, details, join, filters
- **Goal:** rooms (channels) and hosted games listed per room with the original's fields; joins honouring full,
  password, rank and clan rules; filtering.
- **What the original does:** N8, N12 (segment 05); Medius `GameList_ExtraInfo`, `GameInfo`, `CreateGame1`, `JoinGame`
  (`MLS.cs:2415-2952`), `cbCreateGame` 0x2ee090 (`MLS.cs:2771-2834`); `SetGameListFilter*` (`MLS.cs:2676-2747`);
  GameStats carries map and rules; join errors (segment 05, N21).
- **Today:** a page joins a map's room directly (`server.ts`); anonymous `/rooms` counts (`roomsBody`). The service
  side is built (2026-10-04, reading, pending review; web research 154): `packages/central/src/lobby.ts` -- the room set
  as Horizon makes it (Alpha, Bravo, Charlie, Delta, 64 players, no rank limit: desktop@be557831 `MLS.cs:3383-3384`),
  the nine pairs the client sends (ChannelList_ExtraInfo0, CreateChannel1, FindWorldByName, JoinChannel,
  SetGameListFilter0, ClearGameListFilter0, GameList_ExtraInfo0, CreateGame1, JoinGame; GAME DETAILS sends none), the
  map allowlist on create and report (OT.R16), the bridge's calls (SVC-07a) and the client's reading of both lists
  (B_43's columns); `packages/central/src/lobbyHttp.ts`, `POST /lobby/<op>`, not yet mounted (it needs SVC-07a's
  session). The screens' filters are the client's (research 154 R154.4). The review's fix round (2026-10-04): the GAME
  row's rank icons by the whole of GameStats byte 7, a game ends with its host seated or not (`gamesHostedBy`), the
  watcher's password and seats, OT.R16 through GameStats byte 8, the report checked as the create, BACK's two leaves
  on the endpoint, the `identify` contract (research 154 §1, §10). `maps: []` offers every map (`main.ts`'s
  convention): **the release's deployment MUST set `MAPS=MP1,MP2,MP6,MP7,MP12,MP51,MP71,MP72`** (OT.R16, OT.R45, V13-2, V13-3, DF-14; the live line is the deploy's env).
- **Gap:** the room set, the list, join rules, filters. *(Since research 154: the capture compare (ONL-32), the
  GameStats layout past the bytes the lists read, the endpoint's mounting with a session (SVC-07a).)*
- **Acceptance:** server tests whose list rows equal what the recomp shows for the same games (`B_43`: "1 16 / 0 8 /
  test / dots"); a recomp-vs-redotcom capture of the same game listed; the filtered list for a seeded game set matches.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-01, SVC-03, SVC-04. **Size:** L.
- **Unknowns:** the GameStats byte layout (map and rules) -- decode it from a local-stack log beside the CREATE GAME
  settings; client- or server-side filtering (ONL-15).
- **Owner calls:** **OC-4** -- the room set (names, count, rank limits; Horizon's "Alpha..Delta" are server-made).
  *(Ruled 2026-10-04, the online path's plan OT.R17: the default names; the count and limits as the Horizon server
  makes them, read from its sources.)*
- **Merged from:** online front end ONL-15; services SVC-24 (list half); online front end ONL-13 (room set).

### SVC-07 -- The match server's bridge to the services
- **Goal:** games and their results reach the services as the original's games do.
- **What the original does:** games are created and joined through MLS; the list shows IN/MAX, SPEC/MAX, PING, PASS,
  CLAN; stats and ladder are posted **by each client** after the match (V10, V12).
- **Today:** rooms per map; anonymous counts. *(2026-10-10, SVC-07, reading, reviewed 2026-10-10; web research 264 §2: the
  results applied -- the store's version 2 (`lastResult`, `lastAudit`; schema 3, a version 1 database migrated once
  after `services.v1.backup`, a version 1 JSON or backup migrated as read, a version 3 refused), the journaled queue
  (`stats/results.ts`: `results.journal`, the queue's counter, the per-account mark, one store change a result -- the
  rating by SVC-13a's function, the fold by SVC-12a's, under respawn off, OT.R33's five at the start and
  `LADDER_PASSWORD_GAMES_PLACEHOLDER`), the three failures (`stale` re-read, I/O retried with a growing delay,
  `format` to `results.dead`), the bounds of OT.R22's note (2) to the dead letters, the audit ledger (`results.audit`,
  reconciled at open), the ladder's order kept until stale, each seat's rating and medal computed but not yet sent
  (`SEAT_RATING_TOLD_PLACEHOLDER`; SEAT-TOLD proposed, research 264 §7), a leaver's match kept and folded as it stood
  (OT.R33 call 7 (b), `LEAVE_COST_OWNER`); SVC-12c's writer retired into it (W22.R2), its tests moved; OT.R22's
  negative test over every `ClientEvent` type and mounted path. Its note (3)'s counter: the queue's, above every stored
  mark. Owed: the proven level (ONL-32 through PROVE-1); a finding against `LADDER_ENTRY_PLACEHOLDER` (OPT-15's
  description write puts a never-played account on the board; the fix named for SVC-23a's brief).)*
- **Gap:** room registration in the game list; identity on join (the account, not a guest name); readiness and launch
  in the room (ONL-16); results written to SVC-12c/SVC-13.
- **Acceptance:** a played web match leaves the same stats and ladder rows that SVC-12a's unit tests compute from its
  event log; the games list matches the console's columns by capture.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-01, SVC-03, SVC-06, SVC-12a, SVC-12c (the record exists before the bridge writes it),
  SVC-07a, SVC-12d (the room's counters and the results it hands over; [2026-10-09] promoted, below). **Size:** L.
  *([2026-10-02, OT.R6] parked until the online path runs; SVC-07a, its path slice, is the bridge up to the match's
  start.)*
- **Unknowns:** none on the original side.
- **Owner calls:** **who posts the stats** -- the original's client does; a server-authoritative post resists cheating
  but differs from the original (a deviation for the owner).
- *([2026-10-04, OT.R18] web research 155 §4 is the plan for the results. It settles what a result is and when: the
  room hands over a round's result at **every round's end** -- the rating moves per round, R155.3, R155.5 -- and the
  match's counters once at its end (the fold, then the last round's rating, as the original); the room only enqueues
  a result -- the store's commit is synchronous and never runs inside a tick -- and one worker applies the journaled
  queue in order, each result in one store change that sets each account's high-water mark (match, round) and its
  last audit entry, so a result is applied once and in order; the audit line is appended after and reconciled at
  open; `stale`, an I/O failure and `format` each have a stated handling; the new fields need a schema version 2
  and its migration, this task's first step (research 155 §4.2, corrected on review). What the room must count first is SVC-12d
  (proposed, below). It asks the owner: who reports (this block's call; the plan's default is the match server),
  which games count, the smallest counted game, what a leave costs -- HUMAN_TASKS H86, calls 1, 2, 3, 7. Its sprint
  is the plan's A (research 155 §5).)*
- *([2026-10-05, OT.R22] web research 169 §4 (the security and anti-cheat assessment; owner row H89) adds to this
  task's acceptance: (1) a negative test -- over every client message (`protocol.ts`'s `ClientEvent`) and every
  mounted HTTP path, none changes a rating, a career counter or a ladder entry: a result comes only from the room's
  own state, handed over inside the process (the match server and the services are one process today,
  `main.ts:56-77`, so there is no message between them to forge or replay); (2) the services bound what they accept
  even from their own room -- a kill count above the opposing seats in a round without respawn, a round shorter than
  the 15 s the round's script watches nothing in, a seat on both sides -- and send such a result to the dead-letter
  file; (3) results are ordered by a counter kept in the store, not by the match's start time alone: a clock set
  backwards must not make new results look already applied (research 155 §4.2's mark); (4) should the match server
  and the services ever be two processes, research 169 §4.3's five conditions hold before any result crosses: the
  report never from a page, each report authenticated, a repeated one refused, the channel encrypted, bounds and a
  rate on what is accepted. What it cannot close: whoever controls the server process controls every rating, and a
  result computed correctly from a cheated match is a valid result.)*
- **Merged from:** services SVC-24.

### SVC-07a -- The bridge up to the match's start
- **Slice of:** SVC-07 ([2026-10-02, OT.R6, OT.R7]; the online-path plan, `../plans/2026-10-02-online-path-target.md`):
  the bridge the path needs up to the match's start -- a game in the list, the account on its seat, readiness and
  launch -- without the results posted after the match (to SVC-12c and SVC-13, parked). The path needs nothing of
  SVC-12a or SVC-12c before the start, so the cut is this slice of SVC-07, not a slice of the stats record.
- **Goal:** a game created in CREATE GAME is a match room in the game list, joined by accounts, launched as the
  original launches it.
- **What the original does:** from SVC-07: games are created and joined through MLS; the list shows IN/MAX, SPEC/MAX,
  PING, PASS, CLAN; N12 of the online segment (a host's world report: `GameName`, `MinPlayers`, `MaxPlayers`,
  `GameLevel`, `GameStats`).
- **Today:** rooms per map; anonymous counts (SVC-07's). *(2026-10-05, SVC-07a, reading, pending review; web
  research 159)* built on `agent/bridge`:
  `packages/central/src/bridge.ts` (`GameBridge`, `createServices`, mounted in `main.ts` with `DATA_DIR`: `/account/*`
  and `/lobby/*`) and `gameLobby.ts` (`PreMatch`). The login's ticket is the session's bearer on `/lobby/*` and in the
  match socket's hello; the host's world report (`/lobby/world-report`) makes the game's match room with its limits and
  lists it, the server then reporting staging / active and the spectators as the host's reporter, IN / SPEC the room's;
  the seats carry the accounts' names; READY (30 s gate, 5 s repeat), every player ready launches at once, 80% starts
  the 11 s countdown, the host forces it (OC-5: HUMAN_TASKS H90); OT.R21's respawn refused; SVC-06's review items
  answered (research 159 §3); Lobby 0x49 and 0x86 answered with no reply. Owed: a per-account request rate (SVC-23),
  the capture compare (ONL-32), the results (SVC-07).)*
- **Gap:** SVC-07's first three: room registration in the game list; identity on join (the account, not a guest
  name); readiness and launch in the room (ONL-16a). Left to SVC-07: the results written to SVC-12c/SVC-13.
- **Acceptance:** the games list matches the console's columns by capture (`B_43`; SVC-07's second clause); server
  tests: a game created through SVC-06 is a room in the list, its seats carry the joining accounts' names, and its
  launch starts the match for every seat.
- **Proven by:** ONL-32 (the transcript compare).
- **Dependencies:** SVC-01, SVC-03, SVC-06. **Size:** M. **Then:** SVC-07 (the results after the match).
- **Unknowns:** none on the original side (SVC-07's); the GameStats byte layout is SVC-06's.
- **Owner calls:** none here (who posts the stats is SVC-07's). *(2026-10-05, SVC-07a: wrong for the launch -- OC-5
  asks whether the owner's 10 s countdown, idle kick and queue stand against the original's READY gate and host
  launch, which a game's room now runs: HUMAN_TASKS H90.)*
- *([2026-10-05, OT.R22] web research 169 §2.4, §6.2, §6.5 and §7 items 1 and 3 (the security and anti-cheat
  assessment; owner row H89; corrected on review the same day to match what the bridge builds): today a seat is a
  name the client typed -- the hello's name goes to the room as sent (`server.ts:361`, `room.ts:553`) -- so this task
  is what every later ladder rule stands on. The bridge (`agent/bridge`, `e0d478b8`, `3a10556c` and its work in
  progress) makes the login's ticket a **reusable session bearer**: `Authorization: Bearer` on `/lobby/*`
  (`bearerIdentify`), and in the hello's body at a game's socket (`AccountService.attach`); every use restarts a 60 s
  idle clock; a socket's close `detach`es and does not end the session; the session ends at the logoff or 60 s after
  its last use with no socket holding it. Added to its acceptance: the seat's name is the account's, never the
  hello's, and the room's `name` event does not rename an account's seat (`room.ts:971`); one live seat an account
  across every room; `identify` is that same server-side session, never a field of a request (research 154 §1's
  contract), carried in a header or the body, not a cookie and not an address; no cookie is ever read on the
  WebSocket's handshake (it has no Origin check and accepts any path starting `/ws`, `server.ts:161-164`); a game
  that will report takes no guest, and an anonymous watcher only by the owner's decision D3 of H89 (research 169
  measure 3: small, and it closes a radar that needs no skill); no counted result from a room joined by map. **Left
  open by the design, for this task's review:** a stolen bearer works for as long as it is used (no absolute
  lifetime; a socket left open keeps it alive), and it lives in the page's memory where injected script can read it;
  `attach` counts sockets with no cap -- the join closes the account's older socket in the same game and an account
  is in one game at a time, so one seat an account **appears** enforced, to be held by a test. Tests: a hello without
  a valid ticket takes no seat in a game made through the list; one ticket's second socket in the same game closes
  the first; one ticket cannot hold seats in two games; a second login of a seated account is refused.)*
- **Merged from:** sliced from SVC-07 by OT-0 (2026-10-02, OT.R6).

### SVC-08 -- Clan core: create, disband, look up, leadership, icon, tag
- **Goal:** clan identity as the original handles it.
- **What the original does:** V1; MP_CREATE_CLAN_SUCCESS/FAILURE, MP_CLAN_DISBANDED, "Clan Disband Error: %s"
  (`S:0x3e2750`-`0x3e2790`, `0x3f3fa0`); ClanNameInUse, ClanNotFound, NotClanLeader, AlreadyLeaderOfClan (V3);
  TransferClanLeadership; "(Leader)" (V11); the icon (V6); the tag (V21); `CLAN_TAGS`; `MediusCreateClanRequest`
  (`MLS.cs:1471`).
- **Today:** ~~none.~~ the clan's identity on the services: `packages/central/src/clans.ts` -- eight request/response
  pairs over the store's `ClanRecord` (create with the tag and the icon into the 256-byte clan stats, disband, by id,
  by name, transfer leadership, GetMyClans, UpdateClanStats, the roster) on `POST /clan/<op>` with the login's ticket
  (mounted by `createServices`, `bridge.ts`); the codes Horizon never answers (NotClanLeader, AlreadyLeaderOfClan) and a
  create from inside a clan named placeholders; disband needs no empty roster; the name cap
  `CLAN_NAME_CHARS_PLACEHOLDER` 13 (H85); the retail console writes the icon digits as "000" (research 262 §2).
- *([2026-10-10, SVC-08] built on `agent/online` at b7e7fb552 -- web research 262 §1-§3, §6, §7; reading, reviewed
  2026-10-09 (pass 1 FAIL on the brief's cites, pass 2 PASS); owed: the proven level, ONL-32's transcripts of create,
  disband, by-name and by-id (H27, H94); the roster's online state (`ROSTER_ONLINE_STATE_READING`) and its ladder
  fields (`ROSTER_LADDER_READING`) *[2026-10-15: `ROSTER_LADDER_READING` retired by CLAN-ROSTER-LADDER, merged at
  590c109bd, 2026-10-14; research 310 §6.1]*.)*
- **Gap:** ~~all of it,~~ *[2026-10-13]* built 2026-10-09 (PR #128, 2026-10-10; Today above, b7e7fb552; the pages over it ONL-26 / ONL-27,
  merged at c16867679 / 4aefd9f5c); left: ~~which `clan_icon_NN` exist (ONL-33)~~ *[2026-10-15, CLAN-ROADMAP-SYNC
  (W19.R14): settled -- none on the disc, the index always 0 (R128.13, R262.4)]*, the proven level (ONL-32).
- **Acceptance:** ONL-32 transcripts for create, disband, by-name and by-id with the same status codes; the clan pages'
  captures match (ONL-26/27); the icon number written into the clan stats equals the console's for the same choice.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-01, SVC-03, SVC-04, ONL-33. **Size:** M.
- **Unknowns:** the clan name's character and length rules (ONL-33); the clan stats layout beyond the icon digits;
  whether disband needs an empty roster (server-side; Horizon's `DeleteClan` `DbController.cs:1566` is the only
  reference).
- **Owner calls:** none.
- **Merged from:** services SVC-08; online front end ONL-30 (service side).

### SVC-09 -- Clan membership: invite, respond, revoke, remove, quit, roster
- **Goal:** the member lifecycle with the original's texts and errors.
- **What the original does:** `CZOnlineLobby_InvitePlayerToClan` 0x2e7600 -> `cbInvitePlayerToClanGetID` 0x2e7850
  (AccountGetID) -> an invitation carrying V5's text; -956 -> MP_CLAN_FULL (V4); CanInviteMorePlayersToClan;
  CheckMyClanInvitations, RespondToClanInvitation; "NO INVITATIONS" greyed with none (N6); GetClanInvitationsSent
  (`cbGetClanInvitationsSent` 0x2e6f50), RevokePlayerInvitation, RemovePlayerFromClan 0x2e7450, QuitClan,
  GetClanRoster (999, V6); ClanInviteRevokeHack (`S:0x3f40f0`); "16 members plus invitees" (UIMnLOC 384);
  `MLS.cs:1930-2004`.
- **Today:** ~~none.~~ the member lifecycle on the services (`packages/central/src/clans.ts`): invite (the leader only;
  the cap `CLAN_CAP_PLACEHOLDER` 16, H-next b), respond (an accept joins, a decline closes), revoke, remove, quit (the
  leader's -951, `LEADER_LEAVE_STATUS_PLACEHOLDER`), the leader's sent list, five `/clan/...` paths;
  CheckMyClanInvitations answers the caller's real list on a ticket (`packages/central/src/clanInvitations.ts`, mounted
  by `createServices` in `bridge.ts`, the old mount gone from `main.ts`; `CLAN_INVITATIONS_SESSION_READING` retired)
  and SVC-09a's none to the page's ticketless request (`CLAN_INVITATIONS_TICKETLESS_ADAPTATION`) *[2026-10-15, INVITE-TICKETLESS:
  retired -- a ticketless request 401]*; the lists Horizon's
  model (`INVITATION_LISTS_UNDECIDED_PLACEHOLDER`, H-next h).
- *([2026-10-10, SVC-09] built on `agent/online` at 3a07ed90b -- web research 262 §4, §6, §7; reading, reviewed
  2026-10-09; owed: the proven level, ONL-32's transcripts (invite, accept, decline, revoke, remove, quit); the
  roster's online state (`ROSTER_ONLINE_STATE_READING`, SVC-08's); AddPlayerToClan (0x5e) with H-next h; the page's
  ticket on `/clan/invitations`, by the task that unparks the clan panels (W10.R4), which retires the seam *[2026-10-15: retired by INVITE-TICKETLESS -- a ticketless request 401, research 273 §9]*.)*
- **Gap:** ~~all of it, plus the online menu row's enabled state.~~ *[2026-10-13]* built 2026-10-09 (PR #128, 2026-10-10; Today above,
  3a07ed90b); the online menu row's enabled state built by ONL-28 (merged at 4cd320410, research 273 §4); left: the
  server's ticketless branch (research 273 §9) *[2026-10-15: retired by INVITE-TICKETLESS -- a ticketless request 401, research 273 §9]*, the proven level (ONL-32).
- **Acceptance:** two-persona ONL-32 transcripts (invite, accept, revoke, remove, quit) and captures, replayed with the
  same codes; the row reads "NO INVITATIONS" (greyed) until an invite arrives.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-08, SVC-09a. **Size:** M. *([2026-10-02, OT.R6] parked until the online path runs;
  SVC-09a, its path slice, answers the invitations row for a player with none.)*
- **Unknowns:** **the clan member cap** -- it comes from the server's -956, so the original's number is unobservable
  (UIMnLOC 384's "16" is the client's text; a period capture or document would settle the server rule); what
  ClanInviteRevokeHack means (not read); what the invited player sees (ONL-32).
- **Owner calls:** the clan cap, if no source gives the server's.
- **Merged from:** services SVC-09; online front end ONL-32 (service side).

### SVC-09a -- The invitations row's answer: a player with no clan invitation
- **Slice of:** SVC-09 ([2026-10-02, OT.R6, OT.R8]; the online-path plan, `../plans/2026-10-02-online-path-target.md`):
  what ONL-09's INVITATIONS row needs while clans are parked -- the original's answer for a player with no invitation
  -- without the member lifecycle.
- **Goal:** the SOCOM II ONLINE menu's row reads "NO INVITATIONS" (greyed), as the original does for a player with none.
- **What the original does:** from SVC-09: CheckMyClanInvitations; "NO INVITATIONS" greyed with none (N6);
  `MLS.cs:1930-2004`; NO INVITATIONS <-> INVITATIONS (UIMnLOC 476, 794; ONL-09).
- **Today:** *(2026-10-04, SVC-09a, pending review; web research 156 §2)* the row's request is read:
  `dlgWorldOfSOCOM`'s `init_screen` runs `CheckMyInvites` (`FUN_0027a3c0` -> `FUN_002e8650`), CheckMyClanInvitations,
  Lobby 0x64 (start 0, page size 999), and `TurnOnInvitations` reads `HasClanInvitations` (the received count != 0).
  The match server answers it at `POST /clan/invitations` (`packages/central/src/clanInvitations.ts`, mounted beside
  SVC-05's texts) with our Horizon's none -- one MediusNoResult reply with EndOfList (`MLS.cs:1553-1560`; *[2026-10-10, SVC-09]* the handler now answers the caller's real list with a ticket and SVC-09a's "none" without one *[2026-10-15: retired by INVITE-TICKETLESS -- a ticketless request 401, research 273 §9]*, mounted in `createServices` -- research 262 §4, §4.5; the
  CheckMyClanInvitations handler is `MLS.cs:1521-1568` in the PC project's `server/horizon-server`, not the
  `:1930-2004` cited above, which are the invite, respond and revoke handlers), which `FUN_002e86c0` reads as none:
  the count 0, MY_CLAN_INVITES `[" ", "No Invitations", " "]`. The client half for ONL-09 is `clanInvitations.ts`
  (`ClanInvitationCommands`, `MyClanInvitations`) and the page's `clanInvitationsHost.ts`; ONL-09 registers them and
  draws the row.
- **Gap:** the request the row sends, answered for an account with no invitation. While SVC-08 is parked no clan can
  exist, so every account has none: this is the true answer, not a stand-in (OT.R8).
- **Acceptance:** a server test: the request (named by SVC-02's map, web research 97) answered with the status and the
  empty list the client reads as none, per `MLS.cs:1930-2004`; ONL-09's row drawn greyed against `A_45`.
- **Proven by:** ONL-32 (the transcript compare).
- **Dependencies:** SVC-01, SVC-03. **Size:** S. **Then:** SVC-09 (the lifecycle and the row's INVITATIONS state).
- **Unknowns:** which request the row sends, and when -- the CheckMyClanInvitations path read (SVC-02's map does not
  name it for this row).
- **Owner calls:** none.
- **Merged from:** sliced from SVC-09 by OT-0 (2026-10-02, OT.R6).

### SVC-10 -- Clan messages
- **Goal:** the leader posts and edits messages; members read them under MESSAGES.
- **What the original does:** SendClanMessage, GetClanMessages, ModifyClanMessage, DeleteClanMessage;
  CLAN_MESSAGE_EMPTY, CLAN_MESSAGE_ID_ERR; "No clan messages."; ClanLeaderMessages, SEND_CLAN_MESSAGE,
  MEDIUS_CLAN_MESSAGES (`S:0x3e23c0`, `0x3e23e0`, `0x3f3e60`-`0x3f3f60`, `0x3eedb0`, `0x3f3900`); 200 bytes (V5);
  `MLS.cs:2083-2233`.
- **Today:** ~~none.~~ clan messages on the services (`packages/central/src/clans.ts`, no store change):
  GetMyClanMessages (the page the console asks, `MY_CLAN_MESSAGES_PAGE_READING`), GetAllClanMessages, SendClanMessage
  (the leader; the cap `CLAN_MESSAGES_CAP_PLACEHOLDER` 5, the order `CLAN_MESSAGES_ORDER_PLACEHOLDER`),
  ModifyClanMessage, and DeleteClanMessage -- Horizon has none (V20); ours deletes, the leader's, by id
  (`DELETE_CLAN_MESSAGE_PLACEHOLDER`); the text cut at 199 bytes and the NUL (V5); five `/clan/...` paths.
- *([2026-10-10, SVC-10] built on `agent/online` at 4dd3e175d -- web research 262 §5, §6, §7; reading, reviewed
  2026-10-09; owed: the proven level, ONL-32's transcript of post, modify, delete and a second member's read and the
  captures of the MESSAGES band and the leader's page; four short strings (`S:0x3f3ef8`, `0x3f3f10`, `0x3f3f18`,
  `0x3f44a8`) not re-read at the review, owed to the close -- *re-read at the close review 2026-10-10: "%d", "-1", " ", "\n", holding*.)*
- **Gap:** ~~all of it;~~ *[2026-10-13]* built 2026-10-09 (PR #128, 2026-10-10; Today above, 4dd3e175d; the pages over it ONL-29, merged at
  a41ce242c); Horizon has no DeleteClanMessage handler (V20); left: the proven level (ONL-32).
- **Acceptance:** ONL-32 transcript (post, modify, delete, read by a second member); captures of the MESSAGES band and
  the leader page match.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-08, SVC-09. **Size:** S.
- **Unknowns:** how many messages a clan keeps and their order (server-side); who may delete; what the console shows
  when delete fails against Horizon (ONL-32).
- **Owner calls:** none.
- **Merged from:** services SVC-10; online front end ONL-33 (service side).

### SVC-11 -- Clan games and challenges
- **Goal:** clan-option games and their clan stats as the original runs them.
- **What the original does:** V21; IsClanChallengeGame, ClanGameClosed, ClanGameSwapSides, NotOnCorrectClanTeam,
  UpdateClanStats (`CZOnlineLobby_UpdateClanStats` 0x2e7d70); `SwapClanSides` (web R95.5); `ClanSwapSidesIndex` += 1 per
  match (web R91 §18.3); FILTER_CLANAFFILIATION, FILTER_CLANONLY; the CLAN column; ClanRating, ClanTotal,
  MediusUpdateClanRanking; join refusal 524.
- **Today:** (corrected at CLAN-JOIN, research 308 §9) built -- CREATE GAME's clan field (GF3, CLAN-ID-WIRE), the
  BRIEFING ROOM's `ClanGameClosed` (#524), the CLAN column, AUTOPLAY's clan test, the 100% rule (CLAN-EIGHTY), and
  CLAN-JOIN's seats by the clan option (the server's `clanSide`; the room's roster is `packages/viewer/src/net/lobby.ts`),
  its "Closed clan game" and "Too many players" refusals and SWITCH TEAMS closed in options 1, 2 and 4, and (2026-10-14)
  the swap after a full game in option 4 (CLAN-SWAP, research 309 §10, on ONL-20b's return); ~~not built -- the clan
  stats and ranking.~~ *[2026-10-15, the clans' half and the clans' finish: the clans' ladder built -- the roster rows'
  ladder fields and ClanRating the eight-best mean (CLAN-ROSTER-LADDER, merged at 590c109bd; research 310 §6.1;
  `ROSTER_LADDER_READING` retired); the clans' board and its three answers, `/lobby/total-rankings` type 1,
  `/lobby/clan-ladder-position` (0xd4) and `/lobby/clan-ladder-list` (0xd2) (CLAN-BOARD-SERVER, merged at 053e82417;
  research 310 §6.2): the value computed fresh by the server as the console's eight-best mean (H219,
  `CLAN_LADDER_VALUE_SOURCE_OWNER`), ties by the lower clan id (H221, `CLAN_LADDER_TIE_ORDER_OWNER`), a clan under eight
  members off the board (`CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER` kept on H220's condition), `LADDER_CLAN_TOTAL_PLACEHOLDER`
  retired; CLAN RANKING over it (ONL-30, merged at 406e46fd9; research 311) and its reply chain freed of a request that
  never settles (CLAN-RANKING-STALL, merged at be1d62001; research 311 §3.7); the account's own record's clan name, tag
  and leader bit written by the services at its own GetMyClans reply and quit (CLAN-RECORD-POST, merged at 5b1dad159;
  `RECORD_CLAN_FIELDS_READING`, research 272 §8 item 4; LATER 55). The clan's stats record is the leader's two posts
  (UpdateClanStats at the create and the tag, R310.2, SVC-08's pair); after a clan game the console posts nothing for
  the clan (R310.1).]* `IsClanChallengeGame` and
  `NotOnCorrectClanTeam` have no caller (R308.1, R308.5); the clan filters are dead (R308.4).
- **Gap:** ~~clan options in creation and joining;~~ *[2026-10-15: built -- CREATE GAME's clan field (CLAN-ID-WIRE) and
  CLAN-JOIN (merged at 0207c5161, research 308 §9), Today above]* the side swap (read in research 309; it needed
  ONL-20b's return to the game lobby after a full game; built by CLAN-SWAP 2026-10-14, the proven level ONL-32's two-game transcript); ~~the
  post-game clan stats and ranking update.~~ *[2026-10-15, CLAN-BOARD-SERVER (053e82417): no post-game clan update
  exists in the original (R310.1); the clans' ladder is the server's fresh eight-best mean (H219), built (Today above);
  left: an under-eight clan's handling on the original server (`CLAN_LADDER_UNDER_EIGHT_PLACEHOLDER`, H220's condition),
  the clan ladder post (`CLAN_LADDER_POST_PLACEHOLDER`, research 271 §6), CLAN RANKING's down arrow after a stall and a
  re-entry (LATER 54), the record's clan fields after a create, a leader's own disband or own tag (LATER 55), the proven
  level (ONL-32).]* *[2026-10-21: LATER 54 done (agent/later-54; the re-entry's released list raises no ON_LADDER_REFRESH).]* *[LATER 55 done (B123).]*
- **Acceptance:** two-clan ONL-32 runs: the joiner's refusal text and code match; the swap after a full game matches;
  the clan stats and ranking transcript after a game matches. *[2026-10-15: after a game the original posts nothing for
  the clan (R310.1), so that transcript holds the players' own posts only.]*
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-08, SVC-06, SVC-07, ONL-13, ONL-16. **Size:** L.
- **Unknowns:** ~~what UpdateClanStats sends (around 0x2e7d70, not read);~~ *[2026-10-15: read -- `"%.3d%.12d%s"`
  from the leader's create and tag only (`FUN_002e7d70` D:L187223-187252; research 310 R310.2)]* whether "clan
  challenge" is anything beyond option games (Horizon models a ClanTeamChallenge family; SOCOM II's labels never name
  it); ~~the clan rating formula (server-side);~~ *[2026-10-15: the owner's H219 (2026-10-14, "approved", W19.R7) -- the
  console's eight-best mean computed fresh by the server, built by CLAN-BOARD-SERVER (053e82417)]* when "Requires 100%
  ready" is enforced (a script read).
- **Owner calls:** ~~the clan rating formula, if no period source turns up.~~ *[2026-10-15: answered as H219-H221
  (2026-10-14, W19.R7; `../HUMAN_TASKS.md`).]*
- **Merged from:** services SVC-11; online front end ONL-34.

### SVC-12a -- Player stats: the per-match arithmetic, as unit tests (decomp only)
- **Goal:** the career record's per-match update computed exactly as `FUN_00225070` computes it.
- **What the original does:** V12 (per-match accumulation and when it uploads), V13 (round scoring), V9 (rating
  default 99), V10 (the layout).
- **Today:** the room counts kills, deaths and score (`room.ts:217`) and sends score rows (`protocol.ts` `score`);
  ~~nothing persists.~~ the fold built: `packages/match/src/stats/accountStats.ts`, pure -- `applyMatch` exactly as
  `FUN_00225070` folds a match (the 7-bit hit-% average, the 22-bit games count wrapping, the game-type shorts with
  ESCORT by side, the bonus objectives replaced), `uploadsAfter` (respawn off and not a LAN game), YOUR STATS' order;
  the record stored and written at a match's end by SVC-12c.
- *([2026-10-10, SVC-12a] built on `agent/online` at 726aa51bf -- web research 261 §1-§3, §6, §7; reading, reviewed
  2026-10-09 (every cite re-read, the fold decoded at the ELF); owed: the proven level, PLAT-36's PEEK and ONL-32's
  payload (SVC-12b, H147); `HEAD_SHOT_COUNT_PLACEHOLDER` and `BONUS_OBJECTIVE_COUNT_PLACEHOLDER`; the fold's rounding
  (`STATS_FOLD_ROUNDING_READING`: one hit in 200 shots would prove it).)*
- **Gap:** a pure function turning a match's event list into the record's fields.
- **Acceptance:** unit tests (CI) held to `FUN_00225070`'s arithmetic (D:L76580-76680), including the hit-percentage
  running average of `+0x588*100`, the 22-bit games count, the three game-type shorts (ESCORT by side), and the upload
  rule (respawn off, outside LAN games); each test cites its lines. *(Corrected [2026-10-04, OT.R18]: it read
  "outside ladder games"; the valve `FUN_003045b0` reads is `ComeFromLan`, D:L204493-204508, `S:0x3f6328`.)*
- **Dependencies:** none. **Size:** M.
- **Unknowns:** which actor counter is which label (+0x550/+0x556/+0x558/+0x57a/+0x57c/+0x544/+0x576/+0x578/+0x55a;
  `FUN_00225a00` D:L76886-76925 lists them in display order) -- SVC-12b; why a ladder game skips the upload.
- **Owner calls:** none (who posts is SVC-07's).
- *([2026-10-04, OT.R18] web research 155 §1.1 and §1.2 are this task's table: every field of the record with what
  the match's end adds to it and the line that does it, and each counter's label at the reading level (R155.2) -- the
  bonus-objectives field replaced, not added; the ESCORT Terrorist's short from +0x55c. "Why a ladder game skips the
  upload" is answered: there is no ladder game, the test is the LAN valve. Still unread: which hits count a head
  shot, and the writer of the bonus-objectives counter (research 155 §8). The rating is not this function's: it is
  SVC-13a's (proposed, below). Its sprint is the plan's A.)*
- **Merged from:** services SVC-12; online front end ONL-35 (stats). Split from SVC-12 on 2026-10-01 (it was XL).

### SVC-12b -- Player stats: the offsets read against a live record
- **Goal:** each counter and blob offset tied to its PLAYER INFO label by a live read, raising SVC-12a and V10/V11 to
  proven.
- **What the original does:** V10, V11 (the label-to-offset mapping rests on stack offsets, an inference).
- **Today:** ~~none.~~ the record's bytes at the reading level: `packages/central/src/stats/accountStatsCodec.ts`
  encodes and decodes the 256 bytes at SVC-12a's offsets and widths, each offset cited to its writer and its readers
  (the 16-bit fields unsigned; a first byte not `'E'` the default record); the dev-host test
  `tools/test/accountStatsSlice.test.ts` decodes the s4 slice's two PlayerReports and two UpdateAccountStats and
  re-encodes each byte for byte over +0x00..+0xe0 (it skips without `SOCOM_PC_ROOT`). The run this block asks for is
  not made: the block stays open.
- *([2026-10-10, SVC-12b] built on `agent/online` at bc3589fff -- web research 261 §4, §6, §7; reading, reviewed
  2026-10-09; owed: the proven level, PLAT-36's PEEK (H26) and ONL-32's `UpdateAccountStats` payload; the unread bits
  (`STATS_BYTE1_BIT7_PLACEHOLDER` for `DAT_0045a0c3`, `STATS_BYTE2_LOW_BITS_PLACEHOLDER`,
  `STATS_BYTE3_HIGH_BITS_PLACEHOLDER`); the older versions' upgrade (`STATS_OLDER_VERSION_PLACEHOLDER`).)*
- **Gap:** the mapping, read from a run.
- **Acceptance:** a recomp `PS2X_PEEK` of 0x66a750..+0x100 after a match on a local Horizon (PLAT-36) equals SVC-12a's
  output for the same events; ONL-32's `UpdateAccountStats` payload decoded field by field.
- **Proven by:** PLAT-36 (the PEEK); ONL-32 (the payload).
- **Dependencies:** SVC-12a. **Size:** M.
- **Unknowns:** what +0x10..+0x20 hold; what `DAT_0045a0c3` is -- the writers' decomp reads plus the run.
- **Owner calls:** none.
- *([2026-10-04, OT.R18] web research 155 §1.1 answers "what +0x10..+0x20 hold" at the reading level: seconds played,
  rounds won, rounds lost, kills, and the games count with the bonus objectives; the label of each field is read
  twice over (R155.2). What stays for this task is the proven level -- the PEEK and ONL-32's payload -- and the bits
  still unread: `DAT_0045a0c3`, +0x02's low five bits, +0x03's high six. The s4 slice already shows four fields on
  the wire: the version `'E'`, the rating 1000 / 997 / 1003, the position and the minutes. Its sprint is the plan's
  C.)*
- **Merged from:** SVC-12 (split).

### SVC-12c -- Player stats: the server's record
- **Goal:** the 256-byte record stored per account and updated by the client's post, as the original server received
  it.
- **What the original does:** V10, V12 (the client posts `MediusAccountUpdateStatsRequest` and `MediusPlayerReport`
  after the match; 2 each in `s4_pcsx2/slice-Medius.log`); `ACCOUNTSTATS_MAXLEN` 256 (`Constants.cs:12`).
- **Today:** ~~nothing persists (V25).~~ the record stored and written:
  `packages/central/src/stats/accountStatsStore.ts` (`readAccountStats` -- the zero blob and a first byte not `'E'`
  read as the default record, rating 1000; `writeAccountStats` at the width; `serveAccountStats`, the position and the
  minutes filled when served) ~~and `packages/server/src/stats/matchEndStats.ts`, the writer (W10.R1): the room's
  `onRoundOver` hook (`room.ts`, one call in `endRound`) fed through `bridge.ts`, the round blocks summed at every
  round's end and the fold run once, at the game over, as `FUN_00223970` does; the bombs planted and defused from the
  room's events (`MATCH_BOMB_COUNTS_READING`).~~ *(2026-10-11, struck at sprint 22's close review; SVC-07,
  2026-10-10, W22.R2:)* `stats/matchEndStats.ts` is retired; the writer is `packages/central/src/stats/results.ts`'s
  journaled queue, fed by the room's `onRoundOver` hook through `bridge.ts` (`GameBridge.results`): the rating at every
  round's end, the fold once at the match's end as `FUN_00223970` does, the bombs the room's one count
  (`MATCH_BOMB_COUNTS_READING`; web research 264 §1.1, §2). No endpoint lets a page post counters or a rating.
- *([2026-10-10, SVC-12c] built on `agent/online` at baf393a65 -- web research 261 §5, §6, §7; reading, reviewed
  2026-10-09 (every cite re-read, the hand case recomputed); owed: the proven level, ONL-32's post replayed; the
  roster serving the raw blob (a new account's zero blob as stored; SVC-07 / SVC-13); the served fields
  (`STATS_SERVED_FIELDS_PLACEHOLDER`); the match clock's hold (`MATCH_CLOCK_TOTAL_READING`); the screens and the
  posts, SVC-07's in sprint 22 (W10.R1).)*
- **Gap:** the stored record and the post's handler.
- **Acceptance:** reading level: server tests storing and returning the record at its width from the post's fields
  (V10, `MLS.cs`); proven level: ONL-32's post replayed against our service leaves the same record.
- **Proven by:** ONL-32.
- **Dependencies:** SVC-02, SVC-04, SVC-12a. **Size:** M.
- **Unknowns:** none beyond SVC-12b's.
- **Owner calls:** none (who posts is SVC-07's).
- *([2026-10-04, OT.R18] web research 155 §4.4 brings this block to the plan: the record is **written by the match
  server** (SVC-07's results), not "updated by the client's post" -- under the plan's default for SVC-07's call a
  page's post never moves a rating or a counter, and can change only the fields a player owns (hometown,
  description, gender). The record is versioned: a stored blob whose first byte is not `'E'` reads as the default
  record, rating 1000 (R155.1) -- the codec this task builds; the position and the minutes are filled when a record
  is served. The proven level's replay of ONL-32's post then checks the layout, not the path. Asked of the owner:
  H86 call 1. Its sprint is the plan's A.)*
- **Merged from:** SVC-12 (split).

### SVC-13 -- The ladder: rating, position, rankings, medals, ranks
- **Goal:** PLAYER RANKING and CLAN RANKING data and the medal, rank and tier values, 1:1.
- **What the original does:** V7, V8; the rating posted with the stats (V10), shown as SCORE (V11), default 99 (V9);
  LADDER_LEADERS, LADDER_RANKING, CLAN_LADDER_*, ClanLadderList, ClanLadderLeaders, GetTotalRankings,
  GetLadderPosition, GetLadderRanking, GetClanLadderRanking (D:L188730-189046); ranks ENSIGN...ADMIRAL (UIMnLOC 869-873;
  UILdLOC 2001-2005); `Medal_{Black,Blue,Bronze,Gold,Silver}.tif`; `MLS.cs:1089-1346`. *(Corrected [2026-10-04,
  OT.R18], web research 155 R155.9: the online ranks' names are `dlgLadderLobby.rdr`'s own literal captions under
  "RANK INSIGNIA" -- ADMIRAL, CAPTAIN, LT. COMMANDER, LIEUTENANT, ENSIGN, with their bands TOP 10 PLAYERS, TOP 5%,
  NEXT 5-30%, NEXT 30-85%, LOWEST 15% -- not UIMnLOC 869-873, which only the campaign's `dlgCareerStats` and
  `dlgSelectRank` name (`tools/dump-dialogs.ts --msg-users 869 873`), nor UILdLOC 2001-2005, the offline
  game-complete ratings (web research 125 §3).)*
- **Today:** ~~none.~~ the ladder on the services: `packages/central/src/ladder.ts` -- `medalOf` 0-5 and `tierOf` 0-4
  exactly as `FUN_002eaee0` / `FUN_002eae20` (V7 and V8's boundaries line for line); the board from the store by
  rating descending, ties the lower id first (`LADDER_TIE_ORDER_OWNER`, OT.R33 call 5); ~~on it only a written record
  (`LADDER_ENTRY_PLACEHOLDER`); `countsForLadder` (`LADDER_MIN_PLAYERS_AT_START` 5, H-next a) exported with no caller;~~
  *(2026-10-11, struck at sprint 22's close review; SVC-07 and SVC-23a, 2026-10-10:)* on it an account from its first
  counted, rated round (`LADDER_ENTRY_OWNER`: the account's one-way `ratedOnce` flag, rated once as a non-ghost; OT.R33
  call 5 (b); web research 264 §3.2); `countsForLadder` (`LADDER_MIN_PLAYERS_AT_START` 5, H-next a) called by
  `stats/results.ts`'s guards before a result is computed (research 264 §2.3);
  Lobby 0xf1, 0xd8 and 0xef answered at `/lobby/ladder-position`, `/lobby/total-rankings` and `/lobby/ladder-list`
  (mounted in `bridge.ts`); the rating the client's Elo (W10.R2; SVC-13a's `rating.ts`, ~~no caller yet~~
  *(2026-10-11, struck at sprint 22's close review: called by `stats/results.ts`'s queue at every counted round's end
  since SVC-07, 2026-10-10; research 264 §2)*).
- *([2026-10-10, SVC-13] built on `agent/online` at b978c377d -- web research 261 §9, §6, §7; reading, reviewed
  2026-10-09 (pass 1 FAIL, pass 2 PASS); owed: the proven level, the console beside a seeded local Horizon and ONL-32;
  ~~`countsForLadder` applied to results (SVC-07);~~ *(2026-10-11, struck at sprint 22's close review: applied by
  SVC-07, 2026-10-10, before a result is computed; research 264 §2.3)* the banned off the board once a ban state exists
  (`LADDER_BANNED_SOURCE_PLACEHOLDER`, SVC-23a/b); ~~the clan total (`LADDER_CLAN_TOTAL_PLACEHOLDER` 0, the clan ladder
  parked); the clan roster's ladder fields (`ROSTER_LADDER_READING`).~~ *[2026-10-15: the clan total retired by
  CLAN-BOARD-SERVER (merged at 053e82417, research 310 §6.2: `/lobby/total-rankings` type 1 the ranked clans' count);
  the roster's ladder fields by CLAN-ROSTER-LADDER (merged at 590c109bd, research 310 §6.1).]*)*
- **Gap:** ~~the ranking service and the tier/medal values for ONL-27/ONL-30~~ *[2026-10-13: built (Today above); ONL-27
  (merged at 4aefd9f5c, research 272 §4) and ONL-30a over them; left: the clan ladder's lists for CLAN RANKING (with
  SVC-11, sprint 19), the roster rows' ladder fields (`ROSTER_LADDER_READING`), the proven level (ONL-32)]*.
  *[2026-10-15: the clan ladder's lists built -- the clans' board, its position (0xd4) and list (0xd2) by
  CLAN-BOARD-SERVER (053e82417) and CLAN RANKING over them by ONL-30 (406e46fd9, research 311), its reply chain by
  CLAN-RANKING-STALL (be1d62001); the roster rows' ladder fields by CLAN-ROSTER-LADDER (590c109bd), each member's stored
  rating, board position and total (`ROSTER_LADDER_READING` retired); left: the proven level (ONL-32).]*
- **Acceptance:** unit tests of the tier functions at every boundary (positions 10/11; totals 11/12; per-mille 50/51,
  300/301, 850/851) against V7, V8 line for line; a seeded ladder on the local Horizon gives the same page on the
  console and SOCOM Legacy; the medal icon per tier matches the console's drawing.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-04, SVC-12c, ONL-33, SVC-13a (the per-round arithmetic; [2026-10-09] promoted, below).
  **Size:** L.
- **Unknowns:** **how the rating changes after a match** -- not computed in any function read, so possibly the
  server's; a read of every writer of `ram0x0066a754` beyond D:L182642 settles the client side; the server side is
  unobservable; which image each medal tier draws; how a ladder game differs from a normal one; whether ladders use
  `UpdateLadderStatsWide`.
- **Owner calls:** the rating formula, if it is server-side.
- *([2026-10-04, OT.R18] web research 155 §2 answers three of the Unknowns at the reading level. **How the rating
  changes**: it is the client's own arithmetic, run at every round's end -- `FUN_002253c0` D:L76661-76768 and the
  calculator `FUN_00239d40` D:L86199-86280: an Elo form, K = 3 a player, each player's share of his side's part
  split by match score, floor 200, a late joiner's change halved (R155.5, R155.7); one round of the s4 session
  agrees value for value, 1000 -> 997 and 1003 (R155.6). The unit tests of it are SVC-13a (proposed, below).
  **Which image each tier draws**: medal 1-5 are `Medal_Blue`, `Medal_Bronze`, `Medal_Silver`, `Medal_Gold`,
  `Medal_Black` -- ENSIGN to ADMIRAL -- the order of every medal column's TEXTURES (R155.9). **How a ladder game
  differs**: there is none; the valve is `ComeFromLan`. The rating formula is therefore not an owner call. What
  stays unobservable is the server's part: the order of equal ratings and which accounts it counted -- named
  stand-ins, and the owner's H86 calls 4 (the ranks' bands on a small ladder), 5 (who is ranked) and 6 (seasons).
  What the server is asked is small: the position and the total (Lobby 0xf1), the total alone (0xd8), a page of the
  list by stat 0 descending (0xef) -- research 155 §2.2; rank, medal and gate are the page's own computation. Its
  sprint is the plan's B.)*
- **Merged from:** services SVC-13; online front end ONL-35 (ranks).

### SVC-14 -- Rank restrictions on rooms and games
- **Goal:** rooms and games that refuse players outside a rank band, as the original.
- **What the original does:** V14; the restriction tier (V8); join error 525.
- **Today:** ~~none.~~ the gate enforced on the services' two joins (W10.R3): `lobby.ts` `rankAdmitsRoom`
  (GenericField1's low four bits, `FUN_002e34e0`) and `rankAdmitsGame` (GameStats byte 7, `FUN_002e3490`), the
  player's tier `LadderService.tier` (`FUN_002eae20` at the stored position); a refused join answered MediusFail
  (`RANK_REFUSED_STATUS_PLACEHOLDER`: no Medius status means rank), the messages #525 for a game and #50 for a room
  (`RANK_REFUSAL_MESSAGES`); the original's check is the client's, so the server's is the port's
  (`RANK_GATE_ON_SERVER_ADAPTATION`); an unranked account tier 0 (`RANK_TIER_UNRANKED_READING`), refused by every
  restricted room and game (H-next i); `ROOM_RANK_NOT_ENFORCED_READING` retired.
- *([2026-10-10, SVC-14] built on `agent/online` at 268554d13 -- web research 261 §10, §6, §7; reading, reviewed
  2026-10-09; owed: the proven level, ONL-32's run with a restricted game; a fresh account's tier (H-next i); where
  #50 is drawn (research 161 §5).)*
- **Gap:** the rank bits on rooms and games and the refusal.
- **Acceptance:** an ONL-32 run with a restricted game: the refusal capture and code match.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-13, SVC-06, SVC-14a. **Size:** M. *([2026-10-02, OT.R6] parked until the online path runs;
  SVC-14a, its path slice, carries the rooms' rank bits.)*
- **Unknowns:** the bits' meaning (D:L184790-184824, L197287, not read); which rooms the original server marked (server
  data).
- **Owner calls:** none (the room set is OC-4).
- *([2026-10-04, OT.R18] web research 155 §2.3: the gate judges by `FUN_002eae20`'s tier -- four tiers, the medal's
  rule without the top-ten rung, 4 for everyone while the ladder holds 1 to 11 -- which the original's **client**
  computed and tested itself (`GameRejectsRank` is local, `FUN_002f8bc0` D:L197404-197429). Under the plan the
  services judge a join by the same rule from the stored position, so a page cannot talk its way past a gate. The
  four icons are `Medal_Blue`, `Medal_Bronze`, `Medal_Silver`, `Medal_Gold`: ENSIGN, LIEUTENANT, LT. COMMANDER,
  CAPTAIN. Asked of the owner: whether the gate comes with the ladder or stays parked (parked by OT.R6 meanwhile, not
  the original's behaviour) -- H86 call 10. Having no top-ten rung, the tier splits before the medal does: on a ladder
  of 14, position 1 is tier 3, positions 2-3 tier 2, the rest tier 1, so an Admiral there would be refused by a
  Captain-only game (research 155 §2.3, corrected on review). Its sprint is the plan's C.)*
- **Merged from:** services SVC-14.

### SVC-14a -- A room's eligible ranks, carried on the list
- **Slice of:** SVC-14 ([2026-10-02, OT.R6]; the online-path plan, `../plans/2026-10-02-online-path-target.md`): what
  ONL-11's list draws -- each room's eligible-rank bits -- without the refusal (the rank gate, join error 525) and the
  ladder ranks it judges by (SVC-13, parked).
- **Goal:** the room list carries each room's rank bits as the original's list reads them.
- **What the original does:** N8 of the online segment: ELIGIBLE RANKS, four rank icons per room (`A_47_rooms.png`);
  `room_rank_bits` (D:L184790, L184824; ONL-11); from SVC-14: the bits' meaning at D:L184790-184824 and L197287 (not
  read).
- **Today:** none.
- **Gap:** the bits' meaning read from the cited lines, and the bits carried on SVC-06's room records with the values
  the owner's room set gives (OC-4); no join is refused here (SVC-14).
- **Acceptance:** unit tests of the bits' layout transcribed from D:L184790-184824 and L197287, each citing its lines;
  a server test listing rooms with their bits; ONL-11 draws the icons from them (its capture, `A_47`).
- **Proven by:** ONL-32 (the transcript compare).
- **Dependencies:** SVC-06. **Size:** S. **Then:** SVC-14 (the gate).
- **Unknowns:** the bits' meaning (SVC-14's) -- read here; which ranks the original's rooms admitted (server data;
  OC-4).
- **Owner calls:** **OC-4** -- the room set, with its rank limits (SVC-06's). *(Ruled 2026-10-04, OT.R17: the default
  names.)*
- **[2026-10-05, SVC-14a]** **Read and carried** (merged at 6814e8ef; web research 161 §4): the bits are GenericField1's
  low four, bit n-1 admitting rank tier n, every tier when they are 0 (`CanJoinRoom`'s body `FUN_002e34e0`
  D:L184706-184712; the list's icons D:L185011-185046); D:L184790 and L184824 copy them into the valve
  `room_rank_bits` at the join (`FUN_002e3790`); D:L197287 is the game list's counterpart (`FUN_002f83b0`, the valve
  `mp_rank_restrictions`, GameStats byte 7), not the rooms'. Server: `ROOM_RANK_BITS`, `roomEligibleRanks`
  (`packages/central/src/lobby.ts`), the bits on each room's 0xed entry, Horizon's four at 0; client: `ELIGIBLE_RANKS`,
  the medals drawn. **Drawn, not enforced** (`ROOM_RANK_NOT_ENFORCED_READING`): no join is refused by rank while the
  ladder is not built; the gate stays SVC-14's. *(retired 2026-10-09, SVC-14: the gate is enforced, research 261 §10)* The capture (`A_47`) is not compared.
- **Merged from:** sliced from SVC-14 by OT-0 (2026-10-02, OT.R6).

### SVC-15 -- Player info, find player, player list
- **Goal:** the PLAYER INFO data and its lookups, with live status.
- **What the original does:** V11; FindPlayer, PlayerInfo, GetPlayerStats (V3); PLAYER LIST in the briefing room.
- **Today:** ~~score rows only.~~ *[2026-10-12, merged at 8d6ed4ca1; research 268 §3]* the briefing room's PLAYER LIST
  (the request at most every 10 s, the reply by account, the draw by name; `FUN_002f1240`, `FUN_002f13f0`,
  `FUN_002f1670`), PLAYER INFO's BRIEFING origin, the server's route answering the bearer's own room only
  (`ROOM_PLAYER_LIST_OTHER_WORLD_READING`); the lookups' presence under PROFILE-PRIVACY; ONL-30a's two adaptations
  retired (the ladder row's account id, the position by the bearer's own account). PLAYER INFO's lookup is SVC-15a's.
- **Gap:** ~~the lookups and where a player is (status).~~ built (above); left: the proven level (ONL-32).
- **Acceptance:** the console's page for a seeded persona compared field by field with redotcom's (captures; ONL-30);
  the ONL-32 transcript of the lookup.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-12c, SVC-13, SVC-16, SVC-15a (PLAYER INFO's lookup; [2026-10-09] promoted, below). **Size:** M.
- **Unknowns:** the field-to-offset mapping (stack inference; SVC-12b's `PS2X_PEEK` of the parsed struct); what drives
  BRIEFING ROOM / GAME during play.
- **Owner calls:** none.
- *([2026-10-04, OT.R18] web research 155 §3 and §1.1: the page's fields and their offsets are read (R155.2), TOTAL
  PLAYING TIME included. "What drives BRIEFING ROOM / GAME" is answered for the client: the page prints them from
  the list it was opened from -- the ladder row's own online state, the friends list's entry, or the player's entry
  among the briefing room's players (`FUN_002f0020` D:L191791-191929) -- not from the lookup, whose answer is the
  name, a status and the 256-byte record. The medal on the page is computed from the position against the viewer's
  own total. The lookup without friends is SVC-15a (proposed, below), so that PLAYER INFO does not wait for SVC-16.
  Asked of the owner: what a profile shows whom -- H86 call 9.)*
- **Merged from:** services SVC-15.

### SVC-16 -- Friends (buddies) with confirmation
- **Goal:** the friends operations as the original.
- **What the original does:** V2; FILTER_BUDDIES (`S:0x3ef1c8`); Medius buddy handlers in Horizon (`MLS.cs:543-627`)
  without confirmation (V20).
- **Today:** ~~none.~~ *[2026-10-11, merged at 9bd4210b7; research 268 §2]* friends with the original client's
  confirmation, read at the decompilation: the request (LobbyExt 0x05, `FUN_003013c0`), its forward and answer (2 or
  -985), the add-back on caption 336, the waiting requests, the remove and the list; one-way lists; seven
  `/lobby/friend-*` routes (one a polled push, an adaptation); the direct add only toward an account whose list holds
  the adder (`FRIEND_DIRECT_ADD_READING`). The page is ONL-24's (a6ae27b6f).
- **Gap:** ~~all of it, including the confirmation.~~ built (above); left: the proven level (ONL-32).
- **Acceptance:** two-persona ONL-32 runs (request, confirm, reject, direct add, remove, the friend shown in a game or
  lobby): codes and captures match (ONL-24).
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-03, SVC-04, SVC-02. **Size:** M.
- **Unknowns:** **the confirmation protocol** (not modelled by Horizon; SVC-02 settles what the client sends); the list
  cap; whether confirmation rode another message.
- **Owner calls:** none.
- **Merged from:** services SVC-16; online front end ONL-28 (service side).

### SVC-17 -- The ignore list
- **Goal:** ignore and unignore, with the effect on chat.
- **What the original does:** GetIgnoreList, AddToIgnore, RemoveFromIgnore; MP_IGNORE_LIST_FULL (V4); PLAYER_IS_IGNORED,
  PLAYER_IGNORE_NAME, IgnoreListVar; `FindIgnoreListPlayerID` (`S:0x3f5fc0`); `MLS.cs:754-864`.
- **Today:** ~~none.~~ the list on the services: `packages/central/src/ignore.ts` (`IgnoreService` list, add, remove
  over the store's `ignored`, the codes as Horizon answers them), the three `/lobby/ignore-*` paths; the chat's hook
  filled: a game lobby's line from an ignored sender dropped at the bridge, as the console drops it on receipt
  (`IGNORED_GAME_LINE_ADAPTATION`), a room line and a whisper held back at the server (`IGNORED_LOBBY_LINE_READING`:
  the console never filters them); the cap `IGNORE_LIST_CAP_PLACEHOLDER` 64; the voice mute at join SVC-20c's,
  untouched.
- *([2026-10-10, SVC-17] built on `agent/online` at 5472951c5 -- web research 263 §4, §6, §7; reading, reviewed
  2026-10-09; owed: the proven level, ONL-32's transcripts of add, remove and list and of an ignored player's line
  (the ignorer's panel and a third's); the server's drop inferred until then.)*
- **Gap:** the list service and suppression in lobby and in-game chat.
- **Acceptance:** ONL-32: add, remove, list (codes and captures); an ignored player's line absent on the ignorer's panel
  and present on a third's.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-03, SVC-18 (the chat it filters comes first). **Size:** S.
- **Unknowns:** the cap; whether ignoring also mutes voice (voice mute is per slot, V16; the link is not read); client-
  or server-side filtering (a local-stack log). *([2026-10-05, OT.R23] web research 170 R170.10 answers the second:
  a player on the ignore list is muted when he joins the session, `FUN_002c5830` D:L166403-166406 with `FUN_003008e0`
  D:L202064-202086 -- the voice half is SVC-20c's, proposed.)*
- **Owner calls:** none.
- **Merged from:** services SVC-17; online front end ONL-29 (service side).

### SVC-18 -- Lobby text chat (briefing room, game lobby)
- **Goal:** text chat in rooms matching the original's routing, formats and limits.
- **What the original does:** V18, V19; the panels (ONL-23).
- **Today:** ~~the `chat` event type with no sender (V25).~~ lobby text chat on the services:
  `packages/central/src/chat.ts` (the room line, the whisper, the history, the cut at 63; the filter hook SVC-17
  fills), `lobbyHttp.ts`'s `/lobby/find-player`, `/lobby/chat` and `/lobby/chat-lines`; `bridge.ts` relays a game
  lobby's line to the game's other seats, no echo, confined to the pre-match lobby (`ROUND_CHAT_SCOPE_PLACEHOLDER`);
  `protocol.ts`'s `chat` events carry the sender. The transport read (research 263 §1): the briefing room's chat the
  lobby server's, the game lobby's the game session's (DME), whispers the lobby server's. The panels parked (W10.R4).
- *([2026-10-10, SVC-18] built on `agent/online` at 928bba24a -- web research 263 §1-§3, §6, §7; reading, reviewed
  2026-10-09; owed: the proven level, ONL-32's transcripts of a line and a whisper; the server's reach
  (`ROOM_LINE_SKIPS_GAME_SEATS_READING`, `WHISPER_REACH_READING`) inferred until then; the round's team scope
  (SVC-19's); the panels (W10.R4); two labelled adaptations with their cost (non-printable bytes to '?'; the page
  polls for its lines).)*
- **Gap:** send, route to the channel, whisper, history, length cut; a filter hook SVC-17 fills.
- **Acceptance:** ONL-32 transcript of a line and a whisper (same message types and fields); each receiver's panel
  matches the console's capture (PC research 66 rounds 2-3); the 63-character keyboard limit and the effective cut agree
  with what the console sends at 63 and 64 characters.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-01, PLAT-17. **Size:** M. **Then:** SVC-17 (its ignore filter attaches here).
- **Unknowns:** whether game-lobby chat is MLS or DME ("(All)" and "VOICE CHAT ALL" point at game-room chat; the next
  trace was to start there); the receive function (V18); panel history length; who receives briefing-room chat while
  others sit in a game lobby.
- **Owner calls:** none.
- **Merged from:** services SVC-18; online front end ONL-26 (service side).

### SVC-19 -- In-game text chat, team chat, custom messages and taunts
- **Goal:** chat during a round with team and all routing, and the command menu's custom messages and taunts.
- **What the original does:** V17, V18; `MPTAUNTMSG1-5` (`S:0x3f29d0`-`0x3f2a10`); the custom texts edited in ONLINE
  OPTIONS (OPT-15).
- **Today:** ~~the HUD message window shows kill lines (`protocol.ts` `kill`); no chat.~~ *[2026-10-12, merged at
  9bee502ac with REFUSED-MAP; research 266 §3]* the game chat's scope (`FUN_002ba870`: all, or the sender's side, the
  spectators their own), relayed by the bridge to the seats in scope, "(Team)" drawn as S:0x3f2700;
  `ROUND_CHAT_SCOPE_PLACEHOLDER` retired; a round's game lines in the game lobby's panel; the round's message window
  draws the lobby server's whispers and universe lines, EXTERNAL WHISPERS (`FUN_001f7ff0`). The custom messages and
  taunts were built before (266 §3.5); the round's USB-keyboard `/w` line is KEYBOARD-WHISPER's (1613e03ca, 266 §3.9).
- **2026-10-10:** from ONL-16's chat half (web research 266 §2.3, reading, reviewed 2026-10-10): the console's game-chat
  receiver (`FUN_002ba9d0`, registered by `FUN_002b8660` D:L159083) appends every line to the game lobby's panel
  (BCHATLISTVAR, PERMANENT) while the game object stands, with no state check (D:L160135) -- so the round's lines,
  "(Team)" ones included (S:0x3f2700), are in the lobby's panel after a match; the page hands the game socket to the
  match and its panel is not fed during one. This task's to build with the round's chat.
- **Gap:** ~~room-relayed chat with a team scope; the custom messages and taunts in round; the round's lines into the
  game lobby's panel (above).~~ *[closed 2026-10-13: built, Today above (SVC-19, 9bee502ac).]*
- **Acceptance:** a two-instance recomp round on a local Horizon: a team line, an all line and a custom message; each
  side's message window compared with redotcom's for the same script.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-18, SVC-07, OPT-15; the HUD. **Size:** M.
- **Unknowns:** whether the dead see the living's chat and whether spectators see team chat (not read); where custom
  messages are kept (card, OPT-15, or server); the in-round chat button (R1 fires in a round) and the SOP/taunt buttons
  -- a pad trace.
- **Owner calls:** none.
- **Merged from:** services SVC-19; online front end ONL-26 (in-round), ONL-37 (in-round use).

### SVC-20a -- Voice floor control and the channel map: the state machine (decomp only)
*([2026-10-08, web sprint 20] built on `agent/online` -- SVC-20a: `packages/match/src/voiceFloor.ts` (the floor table, the literal channel function, who hears whom; research 225 §1-§3, §5.1), merged 5ed5ede85; the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- **Goal:** who may talk, on which channel, as the original's floor table and channel map rule it, held by unit tests,
  as pure functions the match server's room runs as the game's host.
- **What the original does:** V15, V16, V17; "CIRCLE VOICE CHAT ALL" in the game lobby (`A_54`); PC research 66 §4
  item 5: action 0x0a bound to slot 0x0d, which **if** a slot is the libpad bit index is CIRCLE (the caption agrees;
  not proof). *([2026-10-05, OT.R23] web research 170 §2-§3: one floor entry **per channel** (12), granted by the
  game's host only when free (`FUN_0030e8e0` D:L210896-210964), the table broadcast on every change; a client re-asks
  every 1000 ms, records at most 10 000 ms and is then held off 10 000 ms; the host expires a grant at 15 000 ms
  (`FUN_0030ec10` D:L210968-211306, `FUN_00310080` D:L211751-211753); the channel map of V16's dated line, the dead
  moved to their side's dead zone and spectators to 10 (`FUN_002c2c20`); hearing is exact channel equality and the
  slot mute, no distance (`FUN_0030f7e0` D:L211395-211449). The slot is not the libpad bit index: with the pad's slot
  order (web research 116 §1) slot 0x0d is L2 and slot 0x07 CIRCLE, the round's two talk buttons (R170.7).)*
- **Today:** none.
- **Gap:** the floor table on the room's host authority (12 entries, 0x100 free, owner-match release, expiry), channel
  selection, per-slot mute, the busy state (`action_channel_busy.tif`) -- no audio. *([2026-10-05, OT.R23] and: the
  table keyed by channel, the 1 s re-ask, the 10 s cap and its 10 s hold-off, the 15 s expiry, the clear at a round's
  start; the channel function -- base, side bit, dead zone, spectators, radio off, the lobby's 9.)*
- **Acceptance:** unit tests (CI) of the floor state machine against `FUN_0030e8e0` (D:L210894-210964) and
  `FUN_0030e7f0` (L210844-210892): each request type 1-4, the 0x100 free sentinel, owner-match on release, expiry; mute
  per slot against `FUN_0030e550`/`e580` (L210697-210724). Reading level only until SVC-20b's reference exists.
  *([2026-10-05, OT.R23] and: the client's states 1-4 and their timings against `FUN_0030ec10`'s cited lines; the
  channel function against `FUN_002c2c20` for the lobby, alive, dead, spectating, radio off and both sides; who hears
  whom, research 170 §3.2's table row by row. The proven level is SVC-20b's two-instance recomp run, owed, not a
  gate.)*
- **Dependencies:** SVC-07a. **Size:** M. *([2026-10-05, OT.R23] research 170 §7.2: it stands on SVC-07a's game room,
  not on SVC-07's results; the controller swaps SVC-07 for SVC-07a when he moves this task into sprint 17, and brings
  the README's layer map and SPRINTS.md with it.)* *([2026-10-07, OT.R39] done: it read "SVC-07" until the merge
  controller made the swap on moving the task into sprint 20, with the README's map and SPRINTS.md.)*
- **Unknowns:** the floor hold time (`voice+0x34`; KNOWN [voice-headset]: "a 10 s cap" on action 10); what grants the
  floor in a lobby with no game host; channel numbering 0..10 against TEAM / OFFENSE / DEFENSE and the lobby ALL --
  decomp reads from `FUN_0030ec10` (D:L210966+) and of `mp_radio_channel_valve`'s users. *([2026-10-05, OT.R23]
  answered by research 170: the hold is 10 s at the client and 15 s at the host (`VOICE_FLOOR_HOLD_READING`); the game
  lobby is inside the game session, whose host grants, and the briefing room has no voice; the numbering is R170.5.
  Left: `VOICE_OFFENSE_DEFENSE_NUMBER_READING`, `VOICE_SIDE_BIT_READING`, `VOICE_DEAD_CHANNEL_READING`,
  `VOICE_LATE_JOINER_READING`, `VOICE_CUTOFF_LOCKOUT_READING` -- research 170 §10.)*
- **Owner calls:** none. *([2026-10-05, OT.R23] the original's rules where they differ from the owner's summary --
  spectators apart, one floor per channel, late joiners silent -- are reported in H87, VOICE-DIFFERENCES.)*
- *([2026-10-04, R170-FIX] web research 170 corrected against W2-R (197) and the R2-AV card; the acceptance changes
  as follows. **The channel function**: OFFENSE is 2 and DEFENSE 1 (TEAM 0); SEALs 0-3 and Terrorists 4-7 by side, so a
  side swap moves the blocks; a spectator is 10, never above; **a death moves a player to his side's dead zone only
  when the game has no respawn or he is a ghost** -- in a respawn game he keeps his living channel and his talk flag
  until he returns (event 0x23 restores the remembered radio setting); a late joiner starts the round on the dead zone.
  **The floor**: unchanged at 10 s hold, 1 s re-ask, 15 s host expiry, 10 s wait; new, a talk that stays held after the
  cut resumes by itself at 20 s if the channel is free, which the room's floor must allow (it is a client re-ask) and
  its test must pin. **Who hears whom**: the dead row of research 170 §3.2 holds only without respawn. Unknowns that
  change: `VOICE_OFFENSE_DEFENSE_NUMBER_READING`, `VOICE_SIDE_BIT_READING`, `VOICE_DEAD_CHANNEL_READING` and
  `VOICE_SPECTATOR_CHANNEL_READING` are resolved (strong; the first proven by two readers); `VOICE_LATE_JOINER_READING`
  too (the late-joiner valve). Left to the two-instance run: the respawn exception and the dead's talk, as readings.)*
- **Merged from:** services SVC-20; online front end ONL-27. Split from SVC-20 on 2026-10-01 (it was XL).

### SVC-20b -- Voice transport in the browser
*([2026-10-08, web sprint 20] built on `agent/online` -- SVC-20b: the wire `net/voiceWire.ts` (V-WIRE, 57a09b29c), the room's relay (`room.ts`, `Conn.sendLossy`, the caps; research 225 §4; 844a7a455) and the page's voice client (`voice/voiceClient.ts`, `voicePlayback.ts`; research 226 §3; 4d78f30fe); the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- **Goal:** voice carried and heard as the original routes it. *([2026-10-05, OT.R23] the microphone, the room's relay
  under SVC-20a's floor and channels, playback.)*
- **What the original does:** V15 (capture 1 ch 8000 Hz, playback 2 ch, 20 ms SASE frames read every 80 ms, carried in
  the DME session); **under our runtime the game never sends voice**. *([2026-10-05, OT.R23] web research 170 §1,
  §6.1: the voice object runs from the game session's join to its leave (`FUN_002b83e0` D:L158881-158882,
  `FUN_002b8390` D:L158815-158824) and is off in the ARMORY; 640 samples per 80 ms, 32 bytes of SASE a message;
  playback L = R at `headset_controller` x 100; no headset, no voice in either direction; no proximity.)*
- **Today:** none.
- **Gap:** a browser path (`getUserMedia`, then WebRTC audio or frames relayed by our room server -- the relay keeps
  the host's floor arbitration, SVC-20a, in one place); who hears whom. *([2026-10-05, OT.R23] research 170 §6.3
  recommends the relay: the match socket carries 80-ms binary frames, the room drops a frame from a client that does
  not hold its channel's floor and sends it only to the members on that channel; never peer to peer (H87
  VOICE-TRANSPORT, *default* the relay). The payload is 8 kHz 16-bit PCM until SVC-21's call
  (`VOICE_CODEC_PLACEHOLDER`). First over the game lobby's channels 9 and 10; the round's are SVC-20c's. A
  per-connection voice rate and the send backlog are server checks (research 169 §2.1, §6.7).)*
- **Acceptance:** once the recomp sends voice (Q5, `docs/BACKLOG.md:62-65`), a two-instance run with `PS2X_PEEK` of the
  table and channel words compared with redotcom's for the same press script. Until then the voice rules stay
  **cannot-pass** (PC research 80-online-menus §3). *([2026-10-05, OT.R23] **the cannot-pass gate is lifted for the
  browser**: OC-6 is answered, browser voice now. The build's acceptance: server tests of the relay against SVC-20a's
  rules (a frame without the floor dropped; delivered on the sender's channel only; the floor freed on a leave); a
  two-browser e2e in a game lobby -- one holds, the other hears a known tone, a third pressing meanwhile is not heard
  and is shown busy. The recomp's two-instance run above stays the **proven** level, owed, not a gate.)*
  *([2026-10-04, STARTUP] the capture MUST take its microphone from `packages/viewer/src/gameMicrophone.ts`
  `getGameMicrophone()` -- the setup page's device, the default when it is gone, null when the player turned it off
  -- and open it only when talk begins, never at load (the owner, 2026-10-04: "make sure the game retains controller
  and mic settings as the setup implies").)*
- **Dependencies:** SVC-20a, PLAT-11 (talk binding). **Size:** L. *([2026-10-05, OT.R23] it read "; the recomp's Q5
  voice work (main project)": no longer a dependency, only the proven level's source.)*
- **Unknowns:** who hears whom (the receive side's channel and team check not read); whether the dead talk to or hear
  the living; proximity (`ProximityDistance`, `S:0x3fcd70`, not read); the recomp's talk gate (unidentified); whether
  the PCSX2 setup presents a USB headset. *([2026-10-05, OT.R23] research 170 answers the first three: exact channel
  equality; the dead apart from the living both ways; no proximity (`ProximityDistance` is a projectile's). Left: the
  DME framing (`VOICE_WIRE_FRAMING_PLACEHOLDER`), the recomp's gate, the PCSX2 headset.)*
- **Owner calls:** **OC-6** -- ship browser-microphone voice before the recomp reference exists, or represented-only
  until the original's path is proven. Until ruled, nothing here is dispatched and ONL-16 draws the talk indicator
  idle. *([2026-10-05, OT.R23] **ruled**: browser voice now (H36). Open, in H87: the transport (*default* the relay)
  and whether a player without a microphone listens (*default* no, the original's).)*
- *([2026-10-04, R170-FIX] research 170's corrections that reach the transport. **Who may talk**: the dead may talk online
  (R2-AV strong; W2-R-03 leaves it open, `VOICE_DEAD_TALK_READING`): the relay must not drop a frame for a player being
  dead, only for a channel or floor rule -- on the dead zone without respawn, on his own channel with it. **The talk
  timing the client keeps**: lobby talk on press, cut at 10 s by the room, and a key still held re-asks and talks again at
  20 s (10 s on, 10 s off) while the floor is free; no sound plays on a press, a busy floor or a release (`VOICE_TALK_SOUND_READING`
  resolved: none). Modulation is not the transport's: the talker's console modulated before it sent, and the game lobby
  never does (SVC-22).)*
- **Merged from:** SVC-20 (split).

### SVC-21 -- The voice codec's sound
*([2026-10-08, web sprint 20] built on `agent/online` -- SVC-21: `voice/voiceCodec.ts` -- Opus narrowband through WebCodecs, 8 kHz mono 6 000 bit/s 20 ms (OT.R24; research 226 §1-§2), merged 416f05bc4; the browsers' acceptance owed to H-next a; the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- *([2026-10-05, OT.R24] **Ruled by the owner**: Opus narrowband, mono, 8 kHz audio, 6 kbit/s to start -- low quality on
  purpose, closer to the original's low-bitrate SASE than clean audio; a labelled browser adaptation. With the codec
  ruled, SVC-21 is the encoder and decoder wired on the room relay's frames, and joins the voice tasks in sprint 17;
  a SASE port stays the proven level, not pursued.)*
- **Goal:** voice that sounds like the original's.
- **What the original does:** SASE, 8 kHz mono, 20 ms frames of 64 bits, 3200 bit/s, with VAD; 237 functions, all
  recompiled and running as guest code (PC research 56 §0).
- **Today:** none.
- **Gap:** (1) SASE in the browser (a WASM build of the recompiled functions, or a port), byte-exact with the recomp; or
  (2) Opus over WebRTC band-limited to 8 kHz (sounds different).
- **Acceptance:** (1) for the same PCM in, the encoded frames equal the recomp's bit for bit (frames dumped from
  `voice_net_fill_cb` 0x30f990, PC research 56 §6.1), decoded PCM within a stated tolerance; (2) an owner listen only,
  which is not 1:1.
- **Dependencies:** SVC-20b. **Size:** M for the ruled Opus narrowband path; a future SASE port remains L.
- **Unknowns:** none technical for (1).
- **Owner calls:** (1) or (2); the licence question of shipping the game's codec code. *([2026-10-05, OT.R23] still
  open after OC-6's ruling (H36's open half, now H87 VOICE-CODEC): web research 170 §6.2 adds (0) the original's
  8 kHz 16-bit PCM uncompressed, and recommends (2) Opus narrowband, labelled, with (1) the proven level only if the
  licence is ever cleared. *Default meanwhile*: (0), so the transport and the UI do not wait on the call. The size is
  (1)'s; (0) and (2) are far smaller -- the controller re-sizes when the call is made. Research 170 §7.2 proposes that
  this task alone stays in sprint 20, with the recomp reference.)*
- *([2026-10-04, R170-FIX] voice modulation reaches the codec's task: the original's talker has his character's
  `VoiceFont` -- a pitch offset and a spectral factor, 8 distinct blocks on the disc -- applied to his own encoder, ON by
  default, never in the game lobby (R2-AV §1.14, strong; partial: what the numbers sound like is inside the codec's
  setters and not read). With Opus narrowband (OT.R24) there is no such encoder, so the effect is a browser
  approximation made before the encode -- SVC-22 owns the toggle and the approximation; this task only guarantees the
  frames carry already-modulated audio. A SASE port would reproduce it exactly, if ever licensed.)*
- **Merged from:** services SVC-21.

### SVC-22 -- The headset UX in the browser
*([2026-10-08, web sprint 20] built on `agent/online` -- SVC-22: the talk input `voice/talkInput.ts` (SVC-22a, 3a187d8fd: the presets, RUN AND TALK, the lockouts, the 10/20 s cycle, read at the source) and the headset UX `voice/headset.ts`, `voice/modulation.ts` (SVC-22b, d6f2a81c4; research 226 §4-§5); the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- **Goal:** the talk key, the headset indicator and the voice options as the original presents them.
- **What the original does:** "CIRCLE VOICE CHAT ALL", the bottom-left icon and bar (`A_54`); RADIO ON/OFF; VOICE
  MODULATION / `VoiceMask` (V17); the headset opens with the game session (V15); `HEADSETO.IRX`, `CHeadsetTuner`
  (`S:0x3f8050`, `0x3fa9b8`); HEADSET VOLUME (OPT-10).
- **Today:** none.
- **Gap:** a mic-permission flow (no original counterpart), the talk binding, the indicator, the modulation option and
  its DSP.
- **Acceptance:** captures of the game lobby with headset present and absent, PCSX2 vs SOCOM Legacy; the modulation's effect
  matched on recorded samples once SVC-20b's reference runs.
- **Dependencies:** SVC-20a, PLAT-11. **Size:** M. **Then:** the talk itself is SVC-20b's. *([2026-10-07, OT.R39] it
  read "SVC-20a, OPT-10, PLAT-11": OPT-10 is in sprint 14, parked, and sprint 20 is not. Until OPT-10's HEADSET VOLUME
  exists, voice plays at the original's default playback volume -- `headset_controller` x 100, clamped 0..100 (R170.12,
  research 170 §6.1), the UI variable's default 0.75 that `InitSystemTuners` writes, which the sound package already
  holds as `HEADSET_VOLUME_DEFAULT` (`packages/sound/src/musicStream.ts`) -- so 75, labelled in the code as the default
  standing in for the slider; OPT-10 wires the slider to it when built.)*
- *([2026-10-05, OT.R23] web research 170 §4, §6.4: the microphone asked at the first talk press, never on load,
  after the page's one line; a refusal is "no headset"; `echoCancellation` on, `autoGainControl` on for the codec's
  gain steer, capture resampled to 8 kHz mono -- labelled adaptations. The buttons: the lobby's CIRCLE held
  (`VCButton`), the round's CIRCLE held past 0.3 s (the talk stance) and L2 with RUN AND TALK ON (the `Default`
  preset), each with its 10 s cap; the page's keys are a labelled adaptation. The icon and bar are the voice
  indicators (ONL-16b, MATCH-05); the red dot and the star are the rows' ready dot and star (N13 of segment
  05), not voice.)*
- **Unknowns:** what VOICE MODULATION does (the code behind `DAT_003df1a8`); what the icon, bar, red dot and star mean;
  what the console shows with no headset (a PCSX2 capture, if its USB headset can be absent or present).
- **Owner calls:** the mic-permission screen's wording (no original); whether the headset is a PLAT-28 desktop-only
  feature instead. *([2026-10-05, OT.R23] the second is answered -- browser voice now (H36); the wording stays open
  (H87 VOICE-MIC-NOTICE, *default* a stated placeholder line, `VOICE_MIC_NOTICE_PLACEHOLDER`), with the round's
  keyboard talk key (H87 VOICE-KEY, *default* V held; the lobby's CIRCLE is the menus' R).)*
- *([2026-10-04, R170-FIX] research 170 corrected against W2-R and R2-AV; the goal and acceptance change. **The talk
  buttons are the selected preset's, not Default's**: Default, Reverse and Config4 talk on CIRCLE (held past 0.3 s;
  a tap opens the command menu) and on L2 with RUN AND TALK ON; **Goldeneye talks on SQUARE and has no RUN AND TALK**.
  RUN AND TALK takes the configured SwapWeapon2 and suppresses its weapon swap, so a pad layer that binds L2 or CIRCLE
  alone would double-fire (W2-R-02; the viewer's `main.ts` swap2 is unconditional today). **No talk stance**: the
  round's "state 5" is the command menu's, so the round's talk draws no pose; nothing here animates the soldier. After a
  round talk CIRCLE is dead for 1.3 s (1.0 s after an L2 talk): neither talks nor opens the menu. **VOICE MODULATION**:
  default ON, the talker's character pitch and spectral factor, never in the game lobby, so the toggle and its
  browser approximation (a labelled AudioWorklet pitch shift is the card's suggestion) are this task's; 8 blocks to
  store by character. **The indicators**: no per-row talk mark in the game lobby; the round's marker is a pulsing
  `hud_talk.tif` at the speaker hidden past 900 units; no sound anywhere in the voice path. Acceptance additions: a
  Goldeneye pad's L2 never talks and still swaps; RUN AND TALK OFF swaps and never talks, ON talks and never swaps; each
  lockout edge (1.3 s, 1.0 s, a 0.3 s tap). Unknowns now: `VOICE_MODULATION_PLACEHOLDER` (the effect's sound),
  `VOICE_INDICATOR_LOOK_PLACEHOLDER`; the lockouts are `VOICE_TALK_LOCKOUT_READING`.)*
- **Merged from:** services SVC-22.

### SVC-23 -- Moderation and abuse limits
- **Goal:** the original's moderation reproduced, and the public-web limits named as ours.
- **What the original does:** V22; per-slot voice mute (V16); the ignore list (SVC-17); whether SOCOM II calls Medius'
  text filter is unknown (no TextFilter label in the image, V3). *([2026-10-10, SVC-23] read: the client asks the lobby
  server's TextFilter before every online line and keeps no word list -- research 263 §5.3)*
- **Today:** *([2026-10-10, SVC-23] the state on `agent/online` at a26b25df0; was: "vote kick, a 10-min address ban, idle kick,
  rate limits, name sanitising (V25); Horizon offers text filters and IP/MAC/account bans (V24)".)* The team's vote to
  remove read rule by rule (SVC-23d) and its every rule held by a `room.test.ts` test; the removed player's address
  refused 10 minutes in the room (`VOTE_BAN_SCOPE_PLACEHOLDER`, H-next d's default); no text filter beyond the 63/64 cut
  (`CHAT_FILTER_PLACEHOLDER`, `chat.ts`); the idle kick (OT.R41), the flood limits (SVC-23c), name sanitising -- each ours,
  listed as a deviation (web research 263 §5.3); no reporting path, no account ban, no spectators' eject; the lobby's
  `banFromGame` (the account's -972 for that game) not yet called; Horizon offers text filters and IP/MAC/account bans
  (V24), none followed.
- **Gap:** the ban's scope (the original refuses rejoin to "that game"; a dedicated room never ends); account-level
  bans, chat flood limits, a reporting path -- each beyond the original is an owner ruling, not a 1:1 claim.
- **Acceptance:** the original's parts verified against web R91 §17's lines by the room tests
  (`packages/central/test/room.test.ts`) and a recomp vote run; the non-original parts listed as deviations in the docs.
- **Proven by:** ONL-32 (the transcript compare; the reading level is the section's server tests from V1-V25 and
  `MLS.cs`).
- **Dependencies:** SVC-03, SVC-18, SVC-23c, SVC-23d ([2026-10-09] promoted, below). **Size:** M.
- **Unknowns:** what `BanSelfFromGame` sends (web R91 §17.4); whether a chat filter existed.
- **Owner calls:** the ban scope; a chat filter; the idle kick (already the owner's own deviation, W3.R13).
- *([2026-10-04, OT.R18] web research 155 §4.5 lists what the original did against ladder abuse -- all of it in the
  client: respawn and LAN games change nothing; K is 3 a player, so a one-on-one moves a rating by less than 6 a
  round (3 between equal ratings) while uneven sides move more -- one player beating three at equal ratings gains 18; the
  expectation makes a win over a much weaker player worth 1; the floor is 200; a late joiner gets half -- and what
  it did not: the counters have no guard, a loss is dodged by leaving, and each console posted its own record. The
  last is closed by the match server reporting (SVC-07). The rest are rules the owner chooses -- H86 calls 2, 3, 7
  -- and their build, with the operator's void of a match, is SVC-23a (proposed, below).)*
- *([2026-10-05, OT.R22] web research 169 (the security and anti-cheat assessment; owner row H89) adds to this
  task's Gap and acceptance: the reporting path's least form -- a report names a player and a match, is rate-limited,
  and is kept beside the audit ledger for a moderator -- and the account ban as an operator's tool (what a banned
  account keeps is H86 call 11); the vote's ban stated for what it is: by network address, so it bans everyone who
  shares the address and is dodged by changing it (`room.ts:2351`, `:2384`); and two slices cut out so that they need
  neither the chat's nor the bans' rulings, proposed below: SVC-23b (the round on the server's own clock and
  muzzle, and the round's cheat signals on the audit ledger) and SVC-23c (the server's flood limits, among them the
  request-rate limit research 154 §10 already owes this task). What no part of this task can do: prevent an aiming program, a wall view or a second account (research 169
  §3.3, §5); it can only make them visible and act afterwards.)*
- *([2026-10-09, PROMOTE-155] the four slices are tasks now (the dated line under "Proposed", below). This block depends
  on SVC-23c and SVC-23d, sprint 10's with it. SVC-23a and SVC-23b are its slices too, but each stands on SVC-07 (and
  SVC-23b on SVC-12d), sprint 22's, and sprint 10 comes before 22: they are placed in sprint 22 beside their
  prerequisites, and this block does not name them, so that it closes in sprint 10 with the parts that need no results
  (W10.R5 of [sprint 10's plan](../plans/2026-10-09-web-sprint-10-the-services.md)); their **Then:** lines are the
  proposal's order. Moderation's ladder guard and cheat signals close with them in sprint 22.)*
- *(2026-10-10, SVC-23 on `agent/online` at a26b25df0; a reading, reviewed 2026-10-10; nothing proven.)* **Verified**: the
  acceptance read clause by clause against research 91 §17 (research 263 §5.3's table) -- who votes (a dead player's vote
  refused, the one rule left without a test, tested here), on whom, the toggle, the count, the threshold, no expiry, the
  leave's clear, the point, the removal's `kicked` and 4002, no host kick -- each the `room.test.ts` test that holds it.
  **Deviations listed** (OT.R26, OT.R27): the idle kick (OT.R41, H141), the ban by address with its weakness (research
  169 §5: it refuses everyone sharing the address and is dodged by changing it), the server's count, the flood limits
  (SVC-23c's names), name sanitising, a line's non-ASCII as `?`. **H-next d's defaults**: `VOTE_BAN_SCOPE_PLACEHOLDER`
  kept, its row given the original's "that game" (-972) and what settles it; `CHAT_FILTER_PLACEHOLDER` -- no filter
  beyond the cut, the client read to ask the lobby server's TextFilter before every online line and send its reply's
  text (`FUN_002f4860`, `FUN_002f4df0`, `FUN_002f4ea0`): the filter was the server's, its words unread; Horizon's
  Replace cited as what a server-side one would be. **Owed**: the page's #539, the side switch's clear (unread), the
  recomp vote run (the proven level); **to sprint 22**, beside SVC-23a and SVC-23b (moderation's slices there): the
  reporting path and the account ban (H86 call 11), and one proposed slice, the vote's rejoin refusal (-972 through `banFromGame`, a room hook in `applyVotes`) and the spectators' VOTE ALL (the
  room has no hook that tells the bridge of a removal; the block is the next planner's) -- nothing of these built here.
- **Merged from:** services SVC-23.

## Voice placement (OT.R23, web research 170) -- promoted 2026-10-07

Written 2026-10-05 by OT-14 and promoted into **sprint 20** on 2026-10-07 with ONL-16b and MATCH-05. Research 170 §7.2
originally proposed sprint 17; that sprint closed before the proposal was carried into SPRINTS.md, so the closed sprint
is not rewritten. The README map/counts and the sprint list are updated with this promotion.

### SVC-20c -- The round's voice on the room: sides, the dead zone, spectators, the radio, mute
*([2026-10-08, web sprint 20] built on `agent/online` -- SVC-20c: the round's channels on the room -- a death clears the flag always and asks 3 only without respawn or for a ghost, a return to life asks the remembered channel, the level's start clears, a later round's does not (research 225 §5, §5.1), merged fbccd4280 after three review passes; the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- **Goal:** in a round, each player on the channel the original puts him on, the room enforcing it -- a side hears
  its own, the dead their side's dead, spectators spectators -- with the radio's settings and the per-slot mute.
- **What the original does:** web research 170 §3: the base channel 0 (TEAM) at a round's start, 3 for a late joiner
  (`FUN_001f6660` D:L55842-55849), the floor cleared then (`FUN_0030e7f0` at D:L55846); the radio's ACTIVE CHANNEL
  (0, 1, 2) kept in the player's `+0xc4` (`FUN_0022f950` D:L81578-81592); the dead moved to 3 on the event 0x22 and
  back to `+0xc4` on 0x23 (`FUN_005e6e40` D:L497716-497737), and kept there while dead (`FUN_002c2c20`
  D:L164432-164435); one side's channels +4; spectators 10; RADIO ON/OFF (`FUN_0022f880` D:L81534-81553); a channel
  change drops a hold; the mute per slot, set from the ignore list at a join (`FUN_002c5830` D:L166403-166406) and
  toggled by TEAMMATES > MUTE (`FUN_0022f4c0` D:L81402-81414).
- **Today:** none; the room knows each seat's side, life and spectating (`packages/match/src/room.ts`).
- **Gap:** the room computing each member's channel from the round's state (SVC-20a's channel function) and
  re-computing it on a death, a return, a round's start, a radio change; the requests for ACTIVE CHANNEL and RADIO
  ON/OFF (a spectator's TEAM is 10); the floor cleared at a round's start; the client's mute slots seeded from its
  ignore list (SVC-17) at each join; frames relayed only on the sender's channel (SVC-20b's relay).
- **Acceptance:** room tests from a scripted round: two players a side and a spectator -- a SEAL heard by SEALs only;
  the SEAL killed moved to his side's dead zone, his hold ended, heard by dead SEALs only and hearing no living player;
  a Terrorist on OFFENSE not heard on TEAM; RADIO OFF hears and sends nothing; a late joiner on the dead zone at the
  start; the floor cleared at the next round's start. Research 170 §3.2's table, row by row.
- **Proven by:** the two-instance recomp run of SVC-20b's acceptance (owed), across a death and a radio change.
- **Dependencies:** SVC-20a, SVC-20b, SVC-07a. **Size:** M. **Then:** MATCH-05 (the round's indicators).
- **Unknowns:** `VOICE_SIDE_BIT_READING`, `VOICE_DEAD_CHANNEL_READING`, `VOICE_OFFENSE_DEFENSE_NUMBER_READING`,
  `VOICE_SPECTATOR_CHANNEL_READING`, `VOICE_LATE_JOINER_READING` (research 170 §10).
- **Owner calls:** H87 VOICE-DIFFERENCES (the original's split, finer than the summary) and VOICE-SEAT (OT.R7 stops at
  the match's start).
- *([2026-10-04, R170-FIX] the channel rules of this task change; the acceptance's "the SEAL killed moved to his side's
  dead zone" holds **only in a game without respawn or for a ghost**. In a respawn game the killed SEAL stays on his
  living channel, keeps his hold, and is heard by and hears the living of his side until he returns; add that case to the
  scripted round. The radio rows: OFFENSE 2, DEFENSE 1 (a Terrorist on OFFENSE is 6); SEALs 0-3, Terrorists 4-7 by side
  after the side swap; spectators 10; the dead may talk on whichever channel they are on. The unknowns resolved: side
  bit, OFFENSE/DEFENSE numbers, spectators, late joiner, dead channel (research 170 §10 as corrected); left: the dead's
  talk as a reading (R2-AV yes, W2-R-03 open) and the channel count (`VOICE_CHANNEL_COUNT_READING`, a library count).)*
- **Merged from:** new (research 170 §7.1): the match half of OT.R23's task.

## Proposed (OT.R18, web research 155): not in the graph until the owner has read the plan

Written 2026-10-04 by OT-12 (the online-path plan's OT.R18: "nothing of it is built until the plan is read by the
owner"). The four blocks below are in the segment's form but under `####` headings, so that the dependency graph, the
README's table and map and SPRINTS.md do not count them yet. When the owner has answered HUMAN_TASKS H86 the
controller promotes each to a `###` block among the Tasks, adds it to its parent's Dependencies (SVC-07 -> SVC-12d,
SVC-13 -> SVC-13a, SVC-15 -> SVC-15a, SVC-23 -> SVC-23a), and brings the README, the capability matrix, SPRINTS.md and
the graph test's count with them (research 155 §5).

*Added 2026-10-05 by OT-13 (the online-path plan's OT.R22; web research 169; HUMAN_TASKS H89): two more blocks in the
same form at this section's end, SVC-23b (the round on the server's own terms, and its cheat signals) and SVC-23c
(the server's flood limits) --
slices of SVC-23 the security and anti-cheat assessment proposes -- and a dated line on SVC-12d and on SVC-23a. They
are promoted with the others (SVC-23 -> SVC-23b, SVC-23c) once the owner has read H86 and H89; nothing of them is
built before.*

*Promoted 2026-10-09 (PROMOTE-155): the condition is met -- H86 answered by OT.R33 (2026-10-04), H89 by OT.R32 -- and
the merge controller gave the word the same day under the owner's delegation ([sprint 10's
plan](../plans/2026-10-09-web-sprint-10-the-services.md), its Log of 2026-10-09 and W10.R6). SVC-12d, SVC-13a, SVC-15a,
SVC-23a, SVC-23b, SVC-23c and SVC-23d are `###` tasks, their text kept; each parent names its slice (SVC-07 -> SVC-12d,
SVC-13 -> SVC-13a, SVC-15 -> SVC-15a, SVC-23 -> SVC-23c, SVC-23d), but for SVC-23a and SVC-23b, which stand on SVC-07
and are placed in sprint 22 after SVC-23's sprint 10 (SVC-23's dated line says why). SVC-23d had no Dependencies or
Size line: both are new and said in its block. The README's table, totals and map, SPRINTS.md, the capability matrix
and the graph test's count (163 -> 170) moved with them. SVC-07b and SVC-24 below stay `####`: neither was named for
this promotion.*

*Added 2026-10-11 (PROMOTE-18; sprint 18's adoption, W18.R2 and W18.R3 of [its plan](../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md),
the merge controller's word): four blocks beside SEAT-TOLD, each written as a `###` task directly (as PROMOTE-22 wrote
SVC-23e) -- STATS-ONE, LEDGER-RESTORE, BOT-AIM and SVC-23f, sprint 22's carried items (HANDOFF §2) -- and SEAT-TOLD
brought into the graph with them. The plan names four of these by a word, not an id; the graph reads a task only under a
`### <PREFIX>-<n>` heading (`tools/roadmapGraph.ts`), so SEAT-TOLD's own block, headed `### SEAT-TOLD` at sprint 22's
SVC-07, stood outside the graph, the README's counts and every sprint. Each takes the next id of its parent's family --
**SVC-07c** (SEAT-TOLD), **SVC-12e** (STATS-ONE), **SVC-23g** (LEDGER-RESTORE), **SVC-23h** (BOT-AIM) -- the plan's
word kept at the head of its title, so either finds it. No parent names its slice: each parent (SVC-07, SVC-12b,
SVC-23a, SVC-23b, SVC-23e) is built in sprint 10 or 22, which sprint 18 comes after.*

### SVC-07c -- SEAT-TOLD: the seats told their new rating and medal after a result (web sprint 18, merged)
*([2026-10-11, PROMOTE-18] in the graph from sprint 18's adoption (W18.R3: "the block as written"): its heading read
"### SEAT-TOLD -- The seats told ...", which the graph does not read as a task, so it was in no sprint; the id SVC-07c,
its Slice of line's family, is new, the name kept. Placed in sprint 18, wave 1. SVC-07 does not name it: SVC-07 is
sprint 22's, built.)*
- **Slice of:** SVC-07 ([2026-10-10, sprint 22's SVC-07] research 264 §7; the merge controller's word: a backlog task row,
  not an owner row).
- **Goal:** after a result is applied, each seat's page holds its new rating and medal as the original's in-game player
  state did.
- **What the original does:** the lobby's and the round's player state carry the rating (+8) and the medal (+0x42),
  refreshed from the record each console posted and read (`FUN_002c5360`; research 155 §2.3, §4.4 "The lobby's medal
  and rating ... come from the server's record when a seat joins and after each round").
- **Today:** ~~SVC-07's queue computes each seat's new rating and medal and logs them (`SEAT_RATING_TOLD_PLACEHOLDER`,
  research 264 §2, §6); no event carries them to the seats; the lobby's player state shows the record as served at the
  join.~~ *(2026-10-11, SVC-07c: built; reading (reviewed: merged at 535a3e06d after its fresh review); research 264
  §2, §6, §7)* after each counted round's
  result is applied, the queue's told seats go through the bridge (`GameBridge.seatsTold`, the one path beside the log
  line) to the game's room, which sends one additive `seatTold` server event (protocol 11 kept; `{ seats: { id,
  rating, medal }[] }`, seat ids, the account ids kept on the server) to every socket of the game, players and
  spectators, and into the recording (`Room.tellRatings`); none for a respawn round, no entry for a seat whose account
  left. The page's `NetClient` holds `told`, a `SeatToldBoard` (`packages/viewer/src/net/seatTold.ts`) replaced whole
  by each event and never by what the page sends; ~~nothing draws it yet (ONL-34)~~ ONL-34 draws it (the game lobby's
  two lists' medal column, e01267af6; research 269 §4.4). The values are the queue's; the
  timing, at once after the round is applied, is a server rule (`SEAT_TOLD_BETWEEN_ROUNDS_READING`: the original's
  carriage between rounds unread). ~~A seat joining between rounds is told at the next round's event: research 155
  §4.4's refresh at a join is owed.~~ *(2026-10-11, the review's fix round: built)* a seat's join tells every socket of
  the game every seated account's pair (the stored rating, the ladder's medal; `oop9`'s medal forced to 4,
  D:L166202-166205), so a game none of whose rounds is counted shows them too; every event is the whole game's.
- **Gap:** ~~a server event from the game's room through the bridge (the result's seats with their new rating and medal),
  the page's player state updated from it; the lobby's rows likewise where they show a rating.~~ *[closed 2026-10-13: built, Today above (SVC-07c, 535a3e06d).]*
- **Acceptance:** a server test over the bridge: after a round's result each seat receives its rating and medal once;
  the page's player state holds them (a host test); nothing a page sends changes them (research 169 §4).
- **Proven by:** ONL-32 (the player state after a round, captured).
- **Dependencies:** SVC-07, SVC-13. **Size:** S.
- **Unknowns:** the event the original used between rounds (the lobby's refresh or the game session's), unread.
- **Owner calls:** none.
- **Merged from:** new, 2026-10-10 (SVC-07's review, research 264 §7).

### SVC-12e -- STATS-ONE: one decoder of the stats record (web sprint 18, merged)
- **Slice of:** SVC-12b ([2026-10-11, W18.R2]; HANDOFF §2, sprint 22's carried items, "the stats-record reconcile"):
  SVC-12b's codec made the record's one decoder before a third reader.
- **Goal:** one decoder of the 256-byte stats record on the server, every reader of the record through it, PLAYER
  INFO's formats and the medal a layer over it.
- **What the original does:** one parse and one build of the record (research 261 §4): `FUN_002f9ac0` copies an `'E'`
  record whole, 0xe4 bytes (D:L198088-198092), upgrades the older forms (D:L198093-198206) and turns any record it does
  not know into the default (D:L198207-198222); `FUN_002fab80` (D:L198446-198559) builds the 256-byte form from the
  session's record at 0x66a750; PLAYER INFO (`FUN_002f0020`) prints each field from a copy of it.
- **Today:** *[2026-10-11, merged at ff084ec28; research 261 §11]* one codec: `stats/accountStatsCodec.ts` decodes the
  record for every reader; `statsRecord.ts` is PLAYER INFO's layer only (`playerInfoLines` and the three formats);
  `modernHttp.ts` decodes with the codec; each of the five differences decided at the decompilation with its test. It
  read: ~~two modules decode the record: SVC-12b's `packages/central/src/stats/accountStatsCodec.ts` (read by the
  store, the results queue, the void, the ladder and the owner-fields path) and the modern UI tree's MU-12a
  `packages/central/src/statsRecord.ts` (read by `packages/central/src/modernHttp.ts`, with PLAYER INFO's formats and
  the medal). They differ on five points (HANDOFF §2, sprint 22's carry; W18.R2): the older version letters, the
  gender default's two names, the signed or unsigned reads of +0x0c / +0x10, the 256-byte check, the stored vs the
  live ladder position.~~
- **Gap:** ~~each of the five decided at the decompilation (`FUN_002f9ac0` the parse and the default, `FUN_002fab80` the
  builder, `FUN_002f0020` PLAYER INFO) -- the original decides, not either author; one codec left, W18.R2's default
  as settled 2026-10-11 by the merge controller: `accountStatsCodec.ts` the codec, `statsRecord.ts` keeping its
  formats and the medal as a layer over it and losing its own decode; `modernHttp.ts` reading through it.~~ *[closed 2026-10-13: built, Today above (SVC-12e).]*
- **Acceptance:** unit tests: each of the five differences held by a test at its cite; every reader of the record on
  the one codec; the tests of both modules kept, moved to the one (the reading level).
- **Proven by:** PROVE-1 on the owner's captures (the record's bytes against a transcript's `AccountUpdateStats`, as
  for SVC-12b; H185).
- **Dependencies:** SVC-12a, SVC-12b. **Size:** M. **Then:** SVC-15a and ONL-30a, the next readers (W18.R2).
- **Unknowns:** any of the five the decompilation leaves open, named in research 261 (a dated section) as a
  `*_READING` or `*_PLACEHOLDER`; the codec's own stay as listed there (research 261 §6).
- **Owner calls:** none. The modern UI tree's three paths (`statsRecord.ts`, `modernHttp.ts`,
  `packages/viewer/src/modern/profile/`) are this task's with a HANDOFF §3 claim (W18.R2's settled line; MU.R6).
- **Merged from:** new, 2026-10-11 (W18.R2; HANDOFF §2's sprint 22 carry), by PROMOTE-18.

### SVC-23g -- LEDGER-RESTORE: the void past a restore's abandoned lines (web sprint 18, merged)
- **Slice of:** SVC-23a ([2026-10-11, W18.R3]; research 264 §5.6 (a), (b) and §7, the owed line of SVC-23b's review):
  the void of a match after a restore of the store.
- **Goal:** after a restore of an older backup, the void and the reconciliation read the restored history only, never
  the abandoned history's lines.
- **What the original does:** nothing to transcribe: the original keeps no ledger and has no void (research 264 §6,
  `VOID_AUTHORITY_PLACEHOLDER`); the ledger, its counter and the void are the server's own bookkeeping (research 264
  §5.5, item 4; OT.R26 / OT.R27).
- **Today:** the queue's counter starts above the ledger's highest and the reconciliation appends an account's last
  entry only when the ledger holds it nowhere (SVC-23b; `ResultsWorker.reconcile`, `replay`; research 264 §5.6). The
  abandoned history's lines stay in the ledger below every later counter, and a reader bounded by counter alone cannot
  tell them from the restored history: (a) once a restored account plays again, a void of a match of the restored
  history counts them in its later results (`later`, `laterRated`) and plans its restore from results the record never
  held; (b) before it plays again, its last line in the ledger is an abandoned one above its mark in the store, and the
  void refuses (`ledger-behind`), saying the store was restored.
  *(2026-10-11, SVC-23g: overtaken, reviewed (merged at 39788f29e after its fresh review) -- a restore beside a ledger leaves a marker (`RestoreLine`: its
  time, the database's new instance, each restored account's mark), owed in the meta table inside the rows'
  transaction and appended once after the commit, by the restore or by the next open's reconciliation
  (`ServiceStore.settleRestores`; `ResultsWorker.reconcile`, the void's CLI); `readLedger` reads the restored history
  only, so (a) and (b) are gone: the void of a restored history's match is exact before and after the accounts play
  again, a match of the abandoned history alone is `not-in-ledger`. No schema change. Research 264 §5.6's dated
  paragraph.)*
- **Gap:** ~~a restore marker in the ledger -- a line the restore writes, naming each account's restored mark -- and the
  void (`stats/void.ts`) and the reconciliation passing by the lines before it whose counter is above that mark (research
  264 §7, the first option; W18.R3); the second option, the void bounded by the record's own marks, is the fallback if
  the marker cannot be made crash-safe.~~ *[closed 2026-10-13: built, Today above (SVC-23g, 39788f29e).]*
- **Acceptance:** server tests: the void of a restored history's match exact, before and after the account plays again;
  the crash between the restore and the marker replayed (W18.R3; the plan's gate, clause 4).
- **Proven by:** nothing of the original's: the server's own bookkeeping, held by its tests (research 264 §5.5).
- **Dependencies:** SVC-07, SVC-23a, SVC-23b. **Size:** S.
- *([2026-10-11, PROMOTE-18's review] SVC-23b named beside SVC-07 and SVC-23a: the fix rests on SVC-23b's counter
  above the ledger's highest and its reconciliation, `ResultsWorker.reconcile` and `replay` (research 264 §5.6); the
  line read "SVC-07, SVC-23a".)*
- *([2026-10-11, SVC-23g] built as the Gap says, the marker's first option (the fallback not needed); left: a void's
  line of the abandoned history still refuses that match `already-voided` after the restore (research 264 §5.6, §7).)*
- **Unknowns:** none of the original's.
- **Owner calls:** none new: who voids stays H181's (`VOID_AUTHORITY_PLACEHOLDER`, research 264 §3.4).
- **Merged from:** new, 2026-10-11 (research 264 §5.6, §7; W18.R3), by PROMOTE-18.

### SVC-23h -- BOT-AIM: the bots' hit share, measured (web sprint 18, merged)
- **Slice of:** SVC-23b ([2026-10-11, W18.R3]; research 264 §5.4, §7): the hit-share measurement SVC-23b's bounds owed.
- **Goal:** the bounds measured again with bots that aim at bodies, so that the cone's best point is read as hits, not
  as distance only.
- **What the original does:** nothing to transcribe: the original resolved its rounds on the consoles (research 169
  §3.4); the bounds are the server's own (research 264 §5.5) and the bots a test instrument.
- **Today:** SVC-23b measured the bounds with the tree's 16 honest bots (`tools/mp-bots.ts`,
  `packages/central/test/bots.test.ts`, the probe `packages/central/test/helpers/boundsProbe.ts`) at 0, 50 and 100 ms one
  way and left every bound (research 264 §5.4); ~~the bots fire down their look at the cone's centre, so they hit nothing:
  no hit share was measured, honest or gaming, and the cone's best point was read as distance only.~~ *[2026-10-11,
  merged at f492337e9; research 264 §5.4, §7]* measured with `tools/mp-bots.ts --aim bodies` (a test instrument,
  `BOT_AIM_ADAPTATION`), the rig's budget reset fixed: H186 confirmed at 50 ms; through cover a best-point page took
  1.7-2.3x the honest hits; in sight only 4 rounds, so the honest in-sight share is still unmeasured; no bound changed.
- **Gap:** ~~an aim-at-bodies mode in `tools/mp-bots.ts` -- a test instrument, labelled a browser adaptation, changing
  nothing the game does; the bounds run again (the view time, the cone's best point by body part, the saved second) at
  0 / 50 / 100 ms; the numbers and the verdicts in research 264 §5.4. **No bound changes in this task**: a changed bound
  is its own task, refusing no honest bot shot (W18.R3; H186 standing).~~ *[closed 2026-10-13: measured, Today above (SVC-23h, f492337e9).]*
- **Acceptance:** the numbers in research 264 §5.4 with the run's command (the full run is `S2U_BOUNDS_FULL=1
  S2U_BOUNDS_SECONDS=30 npx vitest run --maxWorkers=1 packages/central/test/bots.test.ts` today), a bound changed by none.
- **Proven by:** nothing of the original's: a measurement of the server's own bounds on one host with the page's own
  injector (research 264 §5.4).
- **Dependencies:** SVC-23b. **Size:** S.
- **Unknowns:** a real line's delay and loss (research 264 §7: the injector is the page's own simulator) -- not this
  task's.
- **Owner calls:** none new: H186 (the honest pages at 50 ms one way already clamped by the 200 ms view time) stands.
- **Merged from:** new, 2026-10-11 (research 264 §5.4, §7; W18.R3), by PROMOTE-18.

### SVC-23f -- The page's half of VOTE ALL and the rejoin refusal (web sprint 18, merged)
- **Slice of:** SVC-23e ([2026-10-11, W18.R3]; research 264 §4.3, §7): the page's part SVC-23e left.
- **Goal:** the page shows the spectators' vote, its eject and the vote's rejoin refusal as the original's console
  shows them.
- **What the original does:** (SVC-23e's cites) under TCM SPECTATORS, shown only while a spectator is present, a
  player toggles "VOTE ALL"; once the votes pass 0.6 x (SEALs + Terrorists) (`FUN_002c2e30` D:L164516-164544) every
  console prints "Spectators EJECTED from this game.", a later spectator's join fails "Too many spectators" and each
  spectator gets `dlgNetBanned.rdr` (research 91 §17 1.1); the vote-removed account's JoinGame to that game is
  answered -972 `MediusPlayerBanned`, shown as MP_BANNED_FROM_GAME, UIMnLOC 443/444 (`FUN_002edba0`
  D:L190405-190487, the -972 at D:L190430; research 263 §5.3).
- **Today:** the room's half is built (SVC-23e; research 264 §4): the protocol's `voteAll`, `spectatorVote` and
  `spectatorsEjected` (additive under protocol 11), the ejected spectator's #539 routed by `kicked` 'vote'.
  *[2026-10-11, merged at 54f7d5597; research 264 §4.5, §4.6]* the page's half built: the TCM's SPECTATORS root with
  VOTE ALL's row (shown only while a spectator is present), the vote lines in the window's colour 2, "Too many
  spectators" posting MP_EJECT_SPECTATOR, the -972's 443 / 444 (ONL-16a's, confirmed); the listed slots stay
  `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER`. It read: ~~Not built, the page's (research 264 §4.3): the SPECTATORS entry "VOTE ALL ON:OFF" and its two labels (S:0x3e5cc0 /
  S:0x3e5cb0), the two lines and "EJECTED" in the message window (`spectatorVoteText`, `SPECTATORS_EJECTED_TEXT`), the
  "Too many spectators" refusal's MP_EJECT_SPECTATOR dialog, and the -972's UIMnLOC 443 / 444 on the game list's join.~~
- **Gap:** ~~those drawn and bound; the game list's spectator slots after an eject read at the decompilation
  (`FUN_002f7c40`'s callers, D:L191365, D:L204009, D:L204367) and pinned, or `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER` kept
  (research 264 §6; W18.R3).~~ *[closed 2026-10-13: built, Today above (SVC-23f, 54f7d5597).]*
- **Acceptance:** page tests: the lines and dialogs drawn for a scripted eject and for a -972 (the plan's gate, clause
  4), each against its cite (the reading level).
- **Proven by:** ONL-32 (a removed player's rejoin transcript) and the recomp's vote run with two spectators (research
  264 §7).
- **Dependencies:** SVC-23e. **Size:** S.
- **Unknowns:** `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER` (what the list's IN MAX shows after an eject); left where they are
  (W18.R3): the refusal's life (`GAME_BAN_LIFE_PLACEHOLDER`, ONL-32's rejoin transcript).
- **Owner calls:** none new: the address ban's scope stays H170's.
- **Merged from:** new, 2026-10-11 (research 264 §4.3, §7; W18.R3), by PROMOTE-18.

### SVC-12d -- The room's counters and the two results it hands over
- **Goal:** the match server counts, per seat, everything the record's fold and the rating read, and hands the
  services one result at each round's end and one at the match's end.
- **What the original does:** each client counts its own player's match block (web R91 §8; research 155 §1.2: kills,
  deaths, suicides, team kills, head shots, shots and hits, the objective counters, the score, rounds won) and reads
  the others' over the net; the rating's calculator takes every seated, non-ghost player's published rating and
  match score, the sides' round wins, the last round's winner and the rounds played (`FUN_002253c0` D:L76661-76768);
  the fold takes the local block, the rounds won and lost and the game's clock total (`FUN_00225070` D:L76580-76658).
- **Today:** the room counts kills, deaths and score a seat, the round's score, the sides' wins and `matchOver`
  (`packages/match/src/room.ts`, `Room.endRound`); ~~a suicide and a team kill change the score but are not counted;
  it knows each hit's part (web research 127) but counts no head shot, shot or hit; nothing leaves the room.~~
  *(2026-10-11, struck at sprint 22's close review; SVC-12d and SVC-07, 2026-10-10:)* the room counts the whole match
  block a seat -- the suicides and team kills (PF-26's), head shots, hits and shots, the objectives, the bombs planted
  and defused, the time played, the rounds won, lost and drawn (web research 264 §1.1) -- and hands the services a
  `RoomRoundResult` at every round's end and a `RoomMatchResult` at the match's end (`stats/roomResults.ts`), which the
  bridge's queue applies (`stats/results.ts`, research 264 §2).
- **Gap:** the missing counters (suicides, team kills, head shots, shots and hits, seconds played, each seat's rounds
  won, lost and drawn; the objective counters as the rules of each game type are built); the marks the rating reads
  (a ghost of this round; joined in progress); the `RoundResult` and the `MatchResult` (research 155 §4.2) and the
  match's id; only for a game made through the game list whose seats are accounts. The hand-over only **enqueues**
  (an O(1) step): the store's commit is synchronous -- a whole clone, validation, a re-read and hash of the file, two
  fsyncs (`serviceStore.ts:639-654`) -- and must never run inside a room's tick (research 155 §4.2). At the match's
  end the `MatchResult` goes first, then the last round's `RoundResult` (the original's order, §4.1).
- **Acceptance:** room tests: a scripted match's `RoundResult`s and `MatchResult` equal the values counted by hand
  from its event log, including a suicide, a team kill, a drawn round, a seat that joins in round 2 and a seat that
  leaves in round 3; the last round's `RoundResult` handed over exactly once, after the `MatchResult`; a respawn room
  hands over nothing; the room does the same thing with the hand-over wired or not; with a store stub whose commit
  sleeps, no room's tick is lengthened.
- **Proven by:** ONL-32 (a whole match's Medius log on the local stack against the same match replayed in the room).
- **Dependencies:** SVC-07a, SVC-12a, SVC-13a. **Size:** M. **Then:** SVC-07 (the results).
- **Unknowns:** which hits the original counts as a head shot (the hit paths at D:L459528-459680, not read); the
  writer of the bonus-objectives counter (research 155 §8); that game +0xcd means "the match had begun when I
  joined" (a two-console run).
- **Owner calls:** what a leave or a dropped connection counts as (H86 call 7).
- *([2026-10-05, OT.R22] web research 169 §4.2 and §7 item 9 (the security and anti-cheat assessment; owner row H87)
  adds to this block: (1) per seat and round, beside the record's counters, the signals the audit ledger needs --
  shots, hits, hits by body part, the requests the room refused and why (`dropped()` tallies them per room today,
  `room.ts:597-602`, and they are logged and forgotten), stall-and-burst events (`CREDIT_MAX`, `room.ts:119`),
  whether the seat sent any input, the round's length; the proposed SVC-23b reads them; (2) the round a leaver
  empties is handed over **before** the room abandons it: today a classic round with a side left empty is dropped
  and the match reset (`room.ts:911-933`), so under H86 call 7's option (b) leaving would still cost nothing, and a
  player losing one against one could deny his opponent the round; (3) the test that a room joined directly by map,
  or holding a guest's seat, hands over nothing.)*
- *([2026-10-10, SVC-12d] a respawn room hands its rounds over **marked** `respawn: true` rather than nothing: the rating's caller skips them as the original's two checks of game +0xdc do (D:L75798, D:L76080; research 261 §3, 264 §1) -- the acceptance line above read "a respawn room hands over nothing"; the plan's Done-when 4 amended the same day.)*
- **Merged from:** new (research 155 §5, A3); the room's half of SVC-07's Gap "results written to SVC-12c/SVC-13".

### SVC-13a -- The rating: the per-round arithmetic, as unit tests (decomp only)
- **Slice of:** SVC-13 ([2026-10-04, OT.R18]): the rating's arithmetic, which SVC-13 listed as an unknown and
  research 155 §2.1 reads, cut out as a pure function so that the results (SVC-07) do not wait for the ranking
  service.
- **Goal:** the rating's change at a round's end computed exactly as `FUN_002253c0` and `FUN_00239d40` compute it.
- **What the original does:** research 155 §2.1 (R155.5-R155.7): pot `N / 2`; the factor by rounds played (11, 9, 7,
  5, 3 -> 0.05, 0.07, 0.10, 0.16, 0.35; else 0.05); the losing side's part `f x pot x its round wins`; the shares by
  match score (a winner's from 0.5); `K = 3N`; `E = 1 / (1 + 10^((other mean - own mean) / 400))`; `R + K x (share -
  E)` floored at 200; the local result rounded, halved for a join in progress, applied only above 0; a round with no
  winner scored as a Terrorist win; ghosts and spectators out; no change with a side empty.
- **Today:** ~~none.~~ `packages/match/src/stats/rating.ts`, pure, ~~no caller yet~~ *(2026-10-11, struck at sprint 22's
  close review: called by `stats/results.ts`'s queue at every counted round's end since SVC-07, 2026-10-10; web
  research 264 §2)*: `ratingsAfterRound`,
  `roundFactor`, `expectation`, `localRating` exactly as `FUN_002253c0` and `FUN_00239d40` compute them (W10.R2), with
  three corrections to research 155 §2.1 read from the ELF (the expectation's precisions, the losing side's order, a
  winner's share); the golden 1000 -> 997 / 1003 held.
- *([2026-10-10, SVC-13a] built on `agent/online` at 4d511671f -- web research 261 §8, §6, §7; reading, reviewed
  2026-10-09 (the four ranges disassembled by the reviewer); owed: the proven level, ONL-32's per-round posts; the
  rounding mode (`RATING_ROUNDING_READING`: one real round decides, §8); an unequal pair's expectation
  (`RATING_EXPECTATION_SOFTFLOAT_READING`); the spectators' seat (`RATING_SPECTATOR_OUT_PLACEHOLDER`); a caller (the
  results, SVC-07).)*
- **Gap:** a pure function from a `RoundResult` to each seat's new rating.
- **Acceptance:** unit tests (CI), each citing its lines: the factor table at every key and one other count; the
  shares on both sides, a side whose scores sum under 1 included; the floor; the rounding and the half (truncated);
  the no-winner round; a ghost and a spectator left out; a match's **last** round pinned explicitly (its rating
  computed from the match block as the round's fold left it, the same whether the career fold ran first or not --
  the original runs it first, research 155 §4.1); an uneven game (one beating three at 1000: +18, -6 each); and the
  golden of research 155 R155.6 -- two players at 1000, a first round with no winner, score 1 each: the SEAL 997,
  the Terrorist 1003.
- **Proven by:** ONL-32 (a whole match's posts on the local stack, each round's rating against the function's).
- **Dependencies:** none. **Size:** M. **Then:** SVC-12d, SVC-07, SVC-13.
- **Unknowns:** what `FUN_001b3620` does with the shares' sums (D:L86263, L86276; its result is unused); the meaning
  of game +0xcd (SVC-12d's); the expectation's soft-float helpers in `FUN_002397f0`, read as a power, an add and a
  divide by shape and constants only -- the s4 trace fixes E = 0.5 at equal ratings, nothing measures an unequal pair
  (research 155 §9).
- **Owner calls:** none (the arithmetic is the original's; which games it runs for is H86 calls 2 and 3).
- **Merged from:** sliced from SVC-13 by OT-12 (2026-10-04, OT.R18).

### SVC-15a -- PLAYER INFO's lookup, without friends
- **Slice of:** SVC-15 ([2026-10-04, OT.R18]): the lookup PLAYER INFO needs -- a name to its record and status --
  without the friends list SVC-15 depends on (SVC-16, parked): the page's FRIEND origin and its message and ignore
  buttons stay owed (OT.R8).
- **Goal:** a player's record and status served as the page reads them.
- **What the original does:** `GetPlayerInfo` -> `PlayerInfo` (Lobby 0x31; account id) answers the name, a status and
  the 256-byte record (`MLS.cs:1399-1437`; `FUN_002efe50` D:L191683-191720); the page prints V11's fields from the
  record (research 155 §1.1, §3) and the presence lines from the list it was opened from.
- **Today:** ~~none.~~ *[2026-10-11, merged at b1124aada; research 268 §1]* `POST /lobby/player-info` (by account id or
  name) answers the original's PlayerInfo: the status, the name, the player status and the one codec's record with
  +0x08 the live ladder position and +0x0c the minutes since the login; an unknown id NoResult, an unknown name -998;
  the whereabouts and live minutes withheld from a stranger (PROFILE-PRIVACY, `PLAYER_INFO_WITHHELD_STATUS_READING`).
- **Gap:** ~~the operation: by account or name; the record served with its position (+0x08) and minutes (+0x0c) filled
  from the ladder's order and the session; the status; a player not found (MP_PLAYER_NOT_FOUND).~~ built (above).
- **Acceptance:** server tests: a seeded account's answer holds the stored record with the live position and
  minutes; an unknown name is the not-found failure; what a stranger is shown follows the owner's call 9.
- **Proven by:** ONL-32 (the lookup's transcript; the page's capture is ONL-30a's).
- **Dependencies:** SVC-12c, SVC-13, SVC-12e. **Size:** S. **Then:** SVC-15 (find player, the PLAYER LIST, friends' presence).
- *([2026-10-11, PROMOTE-18] SVC-12e (STATS-ONE) named: the lookup serves the record, and W18.R2 makes the one decoder
  first, "SVC-15a and ONL-30a, the next readers, wait for it"; the line read "SVC-12c, SVC-13".)*
- **Unknowns:** SVC-15's -- the statuses the server sent for a player in a game (ONL-32).
- **Owner calls:** what a profile shows whom (H86 call 9).
- **Merged from:** sliced from SVC-15 by OT-12 (2026-10-04, OT.R18).
- **2026-10-10:** owed here from OPT-15 (web research 265 §6, `PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER`): the page's own
  record read at the login through this lookup, ONLINE OPTIONS' `PlayerDescription` set from its +0x9f, as the
  original's own-stats read sets it (`FUN_002fa8f0` D:L198401-198402). ~~Until then TRIANGLE's discard on ONLINE OPTIONS
  after a reload keeps the discarded text in the record and shows the page blank.~~ *(2026-10-11, SVC-15a: built -- the
  read at each entry into state 11 over `/lobby/player-info`, research 268 §1.7 and 265 §1.3's dated line; the
  placeholder retired.)*

### SVC-23a -- The ladder's limits, and the void of a match
- **Slice of:** SVC-23 ([2026-10-04, OT.R18]): the part of moderation that guards the ladder, cut out so that it can
  follow the ladder without the chat's and the bans' rulings.
- **Goal:** the rules the owner rules for which results count, applied before a result is computed; and an operator's
  way to take a match's changes back out.
- **What the original does:** research 155 §4.5: nothing beyond the arithmetic's own shape and two conditions
  (respawn off, not LAN); a leave costs nothing; the counters have no guard. Each limit beyond that is ours.
- **Today:** none. *(2026-10-10, SVC-23a, reading and the server's own rules, reviewed 2026-10-10; web research 264 §3: the
  ruled limits confirmed before a result is computed -- respawn off and no LAN game (the original's, D:L75798,
  D:L76080-76081), OT.R33's five at the start, a password game counted (the ruling; the placeholder's other value
  excluding it), a quitter's match kept (call 7 (b)) -- each excluded result leaving a ledger line naming the limit and
  why; the banned off the board and out of the total through one seam (`bannedAccounts`, no writer until SVC-23's
  account ban, `LADDER_BANNED_SOURCE_PLACEHOLDER`) the board and the void read; the board's entry from a one-way
  "rated once as a non-ghost" flag the queue sets (the store's version 3, schema 4, a schema 3 database backed up to
  `services.v2.backup` and migrated once, each flag from the audit ledger), `LADDER_ENTRY_OWNER` = 'from the first
  counted round' (OT.R33 call 5 (b)); the void of a named match from the ledger (`stats/void.ts`), newest first, exact
  per account and field while no later result changed it, else the partial restore -- the counters and games by their
  amounts, the rating less the match's own changes, the later bonus objectives and hit percentage kept -- each named in
  the void's own line with who, why and the evidence, the records and the void's record in one store change, the ladder
  marked stale, nothing recomputed; the operator's CLI over the data directory with the server stopped
  (`cli/voidMatch.ts`: `--list`, `--dry-run`; `VOID_AUTHORITY_PLACEHOLDER`, H-next c). Each non-original rule a
  deviation in research 264 §3.5. Not built: the same-address note (SVC-23b's, with the signals).)*
- **Gap:** as ruled (H86 calls 2, 3, 7): password games not counted; a minimum of players a side; what a leave
  counts as; the audit ledger's note when both sides' seats share an address; a void, from the audit ledger, of a
  named match's own rating changes and counters, as research 155 §4.2 defines it: exact (every rating, counter,
  bonus-objectives field and hit percentage to its before-value) only while no later result has touched the match's
  players; otherwise the counters exactly and the rating less the match's own changes, the later bonus objectives
  and hit percentage kept, each named in the void's audit line; a full recomputation only if call 12 asks it.
- **Acceptance:** server tests: a result the ruled limits exclude changes no record and leaves an audit line saying
  why; a voided match no later result touched leaves its accounts exactly as before it; a voided match a later result
  touched gives exactly the partial restore above, its audit line naming what was and was not restored; the ladder's
  order follows; a void records who made it, why and the evidence (call 12); each non-original rule is listed as a deviation in the docs (SVC-23's acceptance).
- **Dependencies:** SVC-07, SVC-13. **Size:** M. **Then:** SVC-23.
- **Unknowns:** none on the original's side.
- **Owner calls:** H86 calls 2 (which games count), 3 (the smallest counted game), 7 (what a leave costs), 11
  (whether a banned or voided account stays on the ladder and in its total), 12 (who may void, on what evidence).
- *([2026-10-05, OT.R22] web research 169 §5 (the security and anti-cheat assessment; owner row H89) says, abuse by
  abuse, which ruled limit closes what and what stays possible whatever is ruled: public games only, and two a side
  with equal sides, remove the one-on-one farm and the lone winner's 18 points a round; nothing removes an arranged
  game that fits the rules, because accounts are free and unchecked. Added to this block's acceptance: a result
  flagged by the proposed SVC-23b's signals is evidence for a void (call 12), never a void by itself; and the audit
  ledger's same-address note is recorded as weak evidence both ways -- a household shares an address honestly, and
  a second account hides behind a second address.)*
- **Merged from:** sliced from SVC-23 by OT-12 (2026-10-04, OT.R18).
- *(2026-10-10, SVC-23a: built on `agent/online-svc23a` -- the limits' ledger lines, the board's entry, the void and its
  CLI; web research 264 §3, §6, §7; research 261 §6 and §9.3, research 101 §5 at 303; `deploy/README.md`'s "The void of
  a match" and the schema 4 rollback. Reviewed 2026-10-10 and merged at 3eaf2c4e4, the server package's typecheck exit 0 at the merge (the
  sprint's Log); owed: H-next c, the owner's.)*

### SVC-23b -- The round on the server's own terms; its cheat signals, flags, and measured bounds
- **Slice of:** SVC-23 ([2026-10-05, OT.R22]; web research 169 §7 items 5, 9 and 11): the part of moderation that
  closes what the room can still close in a round and makes the rest visible afterwards, cut out so that it can
  follow the results (SVC-07) without the chat's and the bans' rulings. **Nothing in it prevents an aiming program or
  a wall view: nothing can, in a browser** (research 169 §3.3).
- **Goal:** an event in a round is judged by the server's clock and the server's body, not by the command or the
  point a page names; a moderator can see, for any counted match, what each seat did that an honest player rarely
  does; and the round's other bounds are as tight as measurement shows they can be without refusing honest play.
- **What the original does:** nothing of the kind is visible in the client: each console resolved its own rounds'
  hits and sent the damage, took its own blast and fall damage, and posted its own rating (web research 91 §15;
  research 155 R155.4, R155.5; research 169 §3.4); what Sony's server checked is unobservable. Every part of this
  block is ours.
- **Today:** the room refuses an impossible request and tallies the refusals per room, logged once a second and
  forgotten (`packages/match/src/room.ts`, `dropped()`; `server.ts`, `resetRates`); it measures no connection's
  delay (the scoreboard row's ping is never set). **Two bounds are open, not just loose** (corrected on review,
  2026-10-05; research 169 §3.1, §3.2, the reviewer's run): (a) a `fire`, a `reload` or a `throw` names its command,
  any of the last 64 (about a second, `shotCone.ts:57`), is decided at once if that command has run (`room.ts:1018`,
  `:2494-2496`), and its rate, reload lock, accuracy cone and body place are read at that command (`:1471`,
  `:1487-1488`, `:1701-1703`, `:2082-2084`, `:2099`) -- so six rounds were accepted in one tick with no recoil and
  killed a full-health target, a reload was cut from 118 ticks to 58, and a round left from 4.8 m behind the
  shooter's place; (b) the round, the grenade's hand, the charge's point and the launcher's muzzle are the page's
  point, held only to within 4 m of the eye and to the body's side of the walls (`:125`, `:1495-1497`, `:1705`,
  `:1757`, `:1814`, `:1857`), with no test of the line from the eye -- a round from 3.9 m above the eye was accepted
  and hit. And the pitch is not clamped on the server (`viewer/src/net/codec.ts:67`, `:113`; `moverSim.ts:50`; 170
  degrees adopted). The other bounds -- the 200 ms view time, the accuracy cone's tolerances, the one second of saved
  commands -- have not been measured for the advantage they leave a modified page (research 169 §3.2, §10).
  *(2026-10-04, HARD-ROUND, under OT.R26 and OT.R27, reading, pending review; web research 169 §7 measure 5)* (0)(a)
  and (0)(b) built on `agent/hard-round`: the rate, the weapon's lock (a reload's or an after-shot's) and the throw's
  rate are also counted on the room's own clock (`Room.serverClock`, the steps' credit), each event dated back by its
  line's stall (`FIRE_STALL_CREDIT_TICKS`, 21 ticks) with `FIRE_ARRIVAL_JITTER_TICKS` (3 ticks) of tolerance, and a
  `fire`, `reload` or `throw` naming a command more than 3 behind the room's latest is refused (`stale`); an honest page
  with 250-300 ms stalls and jitter loses nothing, a lag switch lands at most what a 400 ms hiccup delivers; every round's, hand's, charge's and launch's start is held to `START_REACH_PLACEHOLDER`
  (16 units and the root's slack) of the server's own head at the command (`shotCone.ts` `headPoint`), the head's line
  to it wall-tested. The review's runs are server tests and now refused (`room.test.ts`, `roomEquipment.test.ts`, the
  `SVC-23b measure 5` blocks); the honest bot match (`bots.test.ts`) asserts it decided rounds and refused none. The
  game's rates, reload lengths and cone are unchanged (OT.R27). Open: (0)(c) the pitch (another stream's); the start
  reach not yet measured against the page's posed muzzle and hand (a browser capture); the lag switch's movement, aim,
  the cone's best point and the wall view (research 169 §8.1 points 1, 2, 16); D7 stays open in H89 (OT.R26 lifted its
  "nothing before H86 and H89"; measure 11's bounds are untouched, as both its option (a) and its default leave them).
  *(2026-10-10, SVC-23b (1) and (2), the server's own rules (OT.R26 / OT.R27), reviewed 2026-10-10; research 264 §5)* (1)
  built: a signals line a seat and counted round in `results.audit` beside the result's lines (the shots, the hits by
  part, the refusals by why, the steps of several commands by their size -- `burstSizes`, the one read-out added to the
  room -- the commands, the input, the round's length), journaled with the result by the bridge; eight flags by the
  operator's thresholds (`flags.json` beside the store, the defaults eleven `FLAG_*_PLACEHOLDER`s), each a line in
  `results.flags` naming the seats, the round, the threshold and the value; **a flag never acts** (a test: the same
  store, revision and seats with every flag raised or none); the operator's list `cli/flags.ts` (H-next f: a CLI, read
  only, no page). (2) measured with the bots (`test/helpers/boundsProbe.ts`, three 30 s matches at 0 / 50 / 100 ms one
  way): the honest view age 120-154 ms at 0 ms and already past the 200 ms clamp at 50 ms (about 215-285, five rounds a
  run) and 100 ms (348-383), a page claiming the bound adding at most 80 ms (a target's 5 units) and only on a near-zero
  delay; the cone's half side 2.5-2.6 degrees, at most 5.6 units across at the rounds' ranges (the page's own draw a
  third of it); the honest steps at most 2 / 3 / 4 commands against the 60 the bound allows. **No bound changed** -- each verdict and
  its number in research 264 §5.4; the bots hit nothing, so a hit-share measurement is owed (bots that aim). The honest
  bot match raises no flag at the defaults. And the queue's counter now starts above the ledger's highest after a
  restore (research 264 §5.6, SVC-23a's re-review's low).
- **Gap:** (0) **first, the round on the server's own terms** (research 169 measure 5): (a) an event's timing judged
  by the server's own clock and the order of arrival -- the rate, the reload's lock and the cone's state counted from
  when the server receives the event, the body's place the server's own at that moment; the one rewind kept is the
  bounded one for where the *others* were (the 200 ms view time, lag compensation held to its bound). It does **not**
  stop aim, the lag switch (a stall then a burst of movement, which the credit allows) or the best point of the cone.
  Its parity cost: none in the rules (the original's rate and lock are the same numbers); at the edges, an honest
  page on a connection that bunches its events has some spaced or refused, which the honest bot matches must show
  is nil before it ships. (b) The muzzle, the hand, the charge's point and the launcher's muzzle derived by the server
  from its own body pose (the stance, the lean, the weapon's offset), or the page's point accepted only within the
  weapon's own offset from it instead of 4 m. It does **not** stop the original's own lean round a corner. Its cost:
  the server's pose must equal the page's camera and lean, or honest shots are refused -- the 2026-10-01 "shots do not
  register" was such a check (`room.ts:592-594`). (c) The pitch clamped on the server to the game's range (one line;
  no cost: an honest page never sends more). (1) from SVC-12d's per-seat signals, an audit line a seat and round, and flags by thresholds the operator
  sets: a hit share or head-hit share far outside the population's, many refused requests, repeated stall-and-burst,
  a side that sent no input, a round with no shot fired, the same accounts meeting again and again, a rating rising
  far faster than any other; a list a moderator reads. **A flag never acts by itself.** (2) A measurement, with the
  tree's bots, of what each remaining bound is worth to a modified client; then, only where the numbers justify it
  and honest play is not refused: the view time held to the connection's measured delay, the point inside the
  accuracy cone drawn by the server.
- **Acceptance:** server tests: events naming older commands and arriving together are spaced or refused by the
  server's clock (a burst of rounds in one tick is not all accepted; a reload naming an old command locks for its
  full length from its arrival); a round, a hand, a charge or a launcher's point beyond the server's pose and the
  weapon's offset is refused; a pitch past the game's range is clamped; the tree's honest bot matches have none of
  their shots, throws or reloads refused by (0); a scripted match's audit lines equal the values counted by hand from its event log;
  each flag fires on a scripted match built to trip it and on none of the tree's honest bot matches; no flag changes
  a rating, a record or a seat; the measurement's numbers are in a research note before any bound is changed, and a
  changed bound refuses no shot of the honest bot matches; each rule is listed as a deviation in the docs (SVC-23's
  acceptance).
- **Dependencies:** SVC-12d, SVC-07. **Size:** M. **Then:** SVC-23.
- **Unknowns:** how much each remaining bound is worth (the measurement is (2)'s first step); how closely the
  server's body pose can match the page's camera and lean for (0)(b); what thresholds tell a strong honest player
  from a program -- none can be known in advance, and none tells them apart surely.
- **Owner calls:** HUMAN_TASKS H89: D2 (before or after the ladder is public), D7 (whether (0) is built at once and
  the other bounds measured first, everything measured first, or nothing changed); who reads the flags and what he
  may do is H86 call 12.
  *(2026-10-10, SVC-23b: D7 answered by the numbers for its measured part -- (0) built, the other bounds measured, none
  changed (research 264 §5.4); who reads the flags stays H86 call 12 / H-next c and f on their defaults, the operator by
  the CLI.)*
- **Merged from:** new (web research 169 §7, items 5, 9 and 11), by OT-13 (2026-10-05, OT.R22); (0) added on review
  the same day.

### SVC-23c -- The server's flood limits
- **Slice of:** SVC-23 ([2026-10-05, OT.R22]; web research 169 §6.7 and §7 items 2 and 8): the limits a public server needs
  against a flood, cut out so that they can be built with the services' mount, before any chat or ban ruling.
- **Goal:** one machine cannot fill the rooms or the endpoints, and a flood of logins cannot stall the matches.
- **What the original does:** unobservable: such limits were Sony's servers'. V22 names the original's moderation (a
  vote; no idle kick, no host kick); nothing of a flood limit is in the client. Every limit here is ours.
- **Today:** *([2026-10-09, SVC-23c] the state on `agent/online` 268554d13; the two builds below, kept by W10.R5.)* Per
  connection: a frame's size and rate, the hello's wait, the heartbeat, the send backlog (1 MiB, then 1008); sockets 8 an
  address and 512 in all (503 at the upgrade); a silent watcher closed 4009 at the room's idle time; at the door, for every
  HTTP path and the upgrade, 20 requests a second an address with a burst of 40 (429) and a declared body over 4096 refused
  413; `/metrics` to the loopback with no proxy header, or a `METRICS_TOKEN` bearer; per room 16 players and 32 spectators;
  per address failed logins and creations, and 30 creations in all; a game's and a briefing room's password tries, 10 an
  address and 30 a world in 15 minutes; the hash on two worker threads, 32 waiting, then 429; HTTP timeouts (10 s, 15 s,
  5 s); the data file and its backups 0600 on POSIX; the start-up refusal behind a named proxy with `TRUST_PROXY` unset;
  the last-resort handler (exit 70); a room's throw ended alone (SVC-07a). Every number is ours, a named server policy
  (research 169 §9, research 263 §5.1); none is the original's. **Owed:** the front door's own limit in the deploy's
  documents (H32, the owner's deploy); a slow-reader test over a real socket; the load test that would revise every
  number; a test that a second address is served while one is at the socket cap or the request rate on a running server;
  a create's store write still on the room's thread (bounded by the 30). The acceptance's clauses with their tests:
  research 263 §5.1. *(Before the two builds of 2026-10-04 the line read:)* per connection: a frame's size and rate, the
  hello's wait, the heartbeat (`packages/match/src/server.ts`);
  per room: 16 players and 32 spectators; per address: failed logins and account creations
  (`packages/central/src/accounts.ts`). Nothing limits the connections one address opens or their total, the requests
  to the texts, clan and lobby endpoints (research 154 §8), or account creation in total; nothing bounds what the
  server holds unsent for one connection (`server.ts:290-294`), so a connection that stops reading but keeps
  answering pings grows the server's memory; watchers have no idle kick (`room.ts:2411-2412` walks the players only),
  so 32 silent connections hold a room's spectator places for good; the password hash and the store's whole-file
  write run on the thread that ticks the rooms; a room's throw is now caught per room (`stepRoom`, `server.ts:289-306`, SVC-07a's fix round, merged 2026-10-04), but `main.ts` has no last-resort handler (only SIGTERM and SIGINT, `:100-101`), so an error outside a room's step still ends the process and every match; the data file is written with the process's default permissions; no HTTP
  timeout is set; `/metrics` has no check in the server (`server.ts:434-438`) and the server listens on every
  interface by default (`main.ts:70`), so only the front door keeps it private; nothing refuses a start behind a
  proxy with `TRUST_PROXY` unset (research 132 §6 (b)). Research 169 §2.1 and §6.7 have each with its line.
- **Built, 2026-10-04 (HARD-FLOOD, `agent/hard-flood`; OT.R26, D9 (a)'s numbers as named placeholders; research 169
  §7):** the last-resort handler (`lastResort.ts`: the class logged, exit 70; the room's guard was the bridge's); the
  socket caps, 8 an address and 512 in all (503 at the upgrade); the send backlog, 1 MiB then a close 1008; a watcher
  closed 4009 after the idle kick's time with nothing sent (the page pings on its snapshots); one request-rate limiter
  at the door for every HTTP path, 20 a second per address with a burst of 40 (429), and a declared body over 4096
  refused 413; `/metrics` answering only the loopback with no proxy header, or a `METRICS_TOKEN` bearer; every refusal a
  counter on `/metrics` (`s2u_limit_total`). Held by `test/flood.test.ts`, `test/roomHostile.test.ts`,
  `test/lastResort.test.ts`; beside it measure 5 (c)'s pitch clamp and research 169 §10's fuzz (`test/roomFuzz.test.ts`).
  **Still open in this block**: a game's password tries through the limiter; the ceiling on account creations in total;
  the hash off the game's thread; HTTP timeouts; the data file owner-only; the start-up refusal; the front door's own
  limit in the deploy's documents; a slow-reader test over a real socket (the bound is held through `connect` with a peer that never reads), and the load test that would revise D9's
  numbers.
- **Built, 2026-10-04 (HARD-FLOOD-2, `agent/hard-flood-2`; OT.R26; research 169 §6.1, §6.6, §6.7, §6.8 dated lines):** a
  game's and a briefing room's password tries through a limiter, 10 wrong an address and 30 a world in 15 minutes, then
  429 InvalidPassword before the compare (`lobbyHttp.ts`, `PasswordTries`); D9 (a)'s ceiling of 30 creations in 15
  minutes in all (`D9_CREATES_TOTAL_PLACEHOLDER`); the hash on two worker threads (`passwordHash.ts`, `hashWorker.ts`,
  bundled beside `server.mjs` by the Dockerfile), 2 at once and 32 waiting, past which 429 for load (the runtime's
  `crypto.argon2` measured half on the calling thread, not used); HTTP timeouts, headers 10 s, request 15 s, kept-alive 5 s;
  the data file and its backups 0600 on POSIX (a no-op on Windows, documented); the start-up refusal with `DATA_DIR`, a
  proxy named in the environment (`MP_DOMAIN`, a public https origin) and `TRUST_PROXY` unset, a warning without
  `DATA_DIR`. D5 stays none; the password's 31-byte bound was already enforced before any hash, now tested. Held by
  `test/hardFlood2.test.ts`, `test/dataFileMode.test.ts`. **Still open in this block**: the front door's own limit in the
  deploy's documents (the owner's deploy, H32); a slow-reader test over a real socket; the load test that would revise
  every number (D9's and HARD-FLOOD-2's); a create's store write still on the room's thread (bounded by the 30; since OT.R37 the rows that differ in one
  SQLite transaction, not the whole file: research 220 R220.2).
- *[2026-10-09, SVC-23c] confirmed, no code changed:* the matrix row's tests run green on 268554d13 (`flood`, `lastResort`
  23 of 23; `roomHostile`, `roomFuzz` 16 of 16; `hardFlood2`, `dataFileMode` 26 of 26, none skipped; and the two files that
  hold the acceptance's room-throw and start-up clauses, added to PLATFORM.md's row: `server`, `mainStart` 40 of 40).
  The acceptance, clause by clause (research 263 §5.1): held at the reading level -- the backlog's close (`flood.test.ts`
  :58, :214, through `connect` with a peer object that never reads), the silent watcher (`roomHostile.test.ts` :46, :66),
  `/metrics` (`flood.test.ts` :74, :83, :203), the socket caps (`flood.test.ts` :139, :149), the rate (`flood.test.ts`
  :176, :184; another address's own bucket :30), the logins' burst as a 60 Hz event-loop timer's lateness, not a room's tick
  (`hardFlood2.test.ts` :133, the real hash on its worker; the create half **owed**, its store write still on the
  room's thread), a room's throw ended alone (`server.test.ts` :792, :811), the data file's mode
  (`dataFileMode.test.ts` :41, :61; its real mode is read only on a POSIX host, not this Windows one, in an `if`
  that reports no skip: an `it.skipIf` owed), the start-up
  refusal (`hardFlood2.test.ts` :263, :402; `mainStart.test.ts` :17), each limit named (research 169 §9, research 101
  §5's rows); **owed** -- the slow reader over a real socket, the second address served beside a capped one on a running
  server, the load test (the measurement: nothing here is proven), the front door's limit (H32).
- **Gap:** **first** (research 169 measure 2: small, and it protects the server that runs today), **the guard round each
  room's tick is done** (SVC-07a's fix round, merged 2026-10-04: a room that throws is ended and logged, its sockets closed 1011, a game's ended 4007, the others run on); and the last-resort handler in `main.ts` that logs
  before the process ends (built: HARD-FLOOD, above); then a cap on open connections per address (set for a household, not for one player) and
  in total; a bound on what is held unsent for one connection, past which it is closed; an idle limit, or a ceiling,
  for watchers; `/metrics` checked in the server or bound to the loopback; one small
  request-rate limiter every HTTP endpoint uses, a game's password tries included (the limit research 154 §10 owes
  SVC-23); a ceiling on account creations in total per window; the hash on a worker thread, or the runtime's own
  argon2 when the deploy's Node has it; HTTP timeouts; the data file and its backups readable by their owner alone; the start-up refusal;
  the front door's own rate limit written into the deploy's documents (the deploy is the owner's).
- **Acceptance:** server tests: a connection that stops reading is closed once its unsent bytes pass the bound; a
  silent watcher is moved out or refused past the limit; `/metrics` is refused to a request that is not the host's;
  connections past the cap from one address are refused while others are served; a
  burst of requests past the rate is refused with the endpoint still answering others; a login or create burst from
  many addresses lengthens no room's tick (a stub hash that sleeps); a room made to throw inside its tick is ended
  alone while another room's match goes on; the data file is created owner-only on POSIX;
  the server refuses to start with a service mounted, a proxied bind and `TRUST_PROXY` unset; each limit is a named
  server policy listed as a deviation in the docs.
- **Dependencies:** SVC-03, SVC-04. **Size:** M. **Then:** SVC-23.
- **Unknowns:** the numbers: what the server takes before a room's tick slips is not measured (research 169 §10: a
  local load test reading `/metrics`).
- **Owner calls:** HUMAN_TASKS H89 D9 (the numbers, with starting proposals there; the front door is H32's); H30
  (the login limit's shape).
- **Merged from:** new (web research 169 §7 items 2 and 8; research 154 §10's owed rate limit), by OT-13 (2026-10-05,
  OT.R22); the send bound, the watchers' limit and `/metrics` added on review the same day.
#### SVC-07b -- The game lobby's host handed on before the launch
- **Slice of:** SVC-07a ([2026-10-04, OT.R27]; the research wave's C7 card §1, cross-checked by its C8 card): what the
  player sees when a created game's host leaves before the launch.
- **Goal:** a host who leaves the game lobby before the launch hands the host's role to another player; the game stays
  listed and nobody sees a message -- as the original.
- **What the original does:** the host role passes to another player and no dialog shows (C7 §1, its FUN_/D:L there;
  BELIEVED until C8's check lands). The original did it by host migration; under OT.R27 the server owns the game, so
  only the handover the player sees is kept.
- **Today:** the bridge ends the game (`gamesHostedBy` -> `endGame`, every page closed 4007) when its host leaves before
  the launch (research 159); after the launch the game plays on (`keepsGame`).
- **Acceptance:** a test: host leaves the lobby, the next player by join order becomes host (the choice of whom is a
  named reading until traced), can change the game's settings and launch; no page is closed; the list shows the new
  host's name. The game ends only when no player is left.
- **Merged from:** new, 2026-10-04 (the research wave's answer to the online lane's question 4).
- *(2026-10-04, built: S17-SERVER, `agent/s17-server`, merged at 99ef4a80.)* `RoomService.hostGone` (`lobby.ts`) runs on the host's
  BACK, logoff or socket close before the launch. It passes the role to the next player by join order
  (`HOST_SUCCESSOR_READING`, `bridge.ts`; the original's master is the console whose client index equals the session's
  master index, `FUN_002bc080` D:L160972-160977, which the network library chooses and nobody has decoded). Watchers
  never take it. The bridge moves `PreMatch`'s host (`setHost`) and closes no page. The new host's world report and
  launch are taken. The game stays listed. It ends only when no player is left. After the launch `keepsGame` and the
  abandon below three are unchanged. Tests: `packages/central/test/hostHandover.test.ts`. Research 159 §2.
### SVC-23d -- The team's vote kick at the round's end
- **Slice of:** SVC-23 ([2026-10-04, OT.R27]; C7 §1; V22 names the original's moderation: a vote, no idle kick, no
  host kick).
- **Goal:** the original's only kick: a majority of a team votes a player out, checked at the round-end screen; the
  kicked player sees UIMn #539 "YOU HAVE BEEN KICKED FROM THIS GAME" for 4 s and returns to the lobby.
- **What the original does:** as the goal (C7 §1; the round-end screen's 90 s timeout ends in "NET ERROR"). No idle or
  lag kick exists in the original: our server's limits that close a socket (SVC-23c) show #365, never #539.
- **Today:** ~~nothing~~ *(corrected 2026-10-09 at PROMOTE-155's merge, the review's low 2:)* a team's vote to remove exists in `packages/match/src/room.ts:4617-4661` (W3.R13, with its tests in `room.test.ts`); this task reads it against the original's round-end count (research 91 §17) and keeps or changes it; its Size S and the SVC-07a dependency were set at the promotion assuming nothing built.
- **Acceptance:** the vote's screen and its count from the decompilation (the trace is owed); the server counts the
  votes, never the page; a test of a majority, a tie and a vote against oneself.
- **Dependencies:** SVC-07a (the created game's room, whose round end the vote is counted at). **Size:** S.
  **Then:** SVC-23. *([2026-10-09, PROMOTE-155] both new at the promotion: the block named no prerequisite and no
  estimate; S, said -- one count on the room at the round's end and one test set.)*
- **Merged from:** new, 2026-10-04.
- *(2026-10-10, SVC-23d on `agent/online` at 487f92b66; a reading, reviewed 2026-10-10.)* The room's vote read rule by rule
  against research 91 §17 and research 179 §6.2-§6.6 (research 263 §5.2, the table): who votes, on whom, the toggle,
  the threshold with the target counted (8 -> 5, 4 -> 3, 3 -> 2, 2 never), no expiry, the leave's clear -- kept; the
  server counts (OT.R27, labelled). **Changed: the point** -- a passed vote's target is removed as ROUND COMPLETE
  starts, or GAME COMPLETE after a match's last round (never FINAL ROUND), not at the result
  (`VOTE_KICK_POINT_READING`, `voteKickDelayS`). Tests in `room.test.ts`'s kicks block. Owed: the page's half of #539
  (the 0.5 s, the screen, its 4 s), the lobby's `banFromGame` wired to the kick and the ban's scope
  (`VOTE_BAN_SCOPE_PLACEHOLDER`, H-next d) with SVC-23, the spectators' "VOTE ALL" (not built), the recomp's vote run
  (the proven level).
### SVC-23e -- The vote's rejoin refusal and the spectators' VOTE ALL
- **Slice of:** SVC-23 ([2026-10-10, W22.R6]; research 263 §5.3 and §7): the two parts of the original's vote that
  SVC-23's close owed to sprint 22, cut out so that they follow the vote kick SVC-23d built.
- **Goal:** a player the team's vote removed is refused that game again, as the original refuses him; and the players
  can eject the spectators, as the original lets them.
- **What the original does:** *the rejoin* -- the removed player's own console asks its ban (`BanSelfFromGame`,
  `FUN_00278d30` D:L123707: MediusBanPlayer with its account and the game's world, `FUN_002f95f0` D:L197800-197804;
  research 179 §6.3), and the lobby server then answers that account's JoinGame to that game -972
  `MediusPlayerBanned`, which the client shows as MP_BANNED_FROM_GAME, UIMnLOC 443/444 (`FUN_002edba0`
  D:L190405-190487, the -972 at D:L190430; research 263 §5.3). *VOTE ALL* (research 91 §17 1.1) -- under TCM
  SPECTATORS, shown only while a spectator is present, a player toggles "VOTE ALL", the vote broadcast to all; the
  host decides once the votes pass 0.6 x (SEALs + Terrorists) (`FUN_002c2e30` D:L164516-164544) and broadcasts
  "Reject"; every console prints "Spectators EJECTED from this game.", `MaxSpectatorsValve` is set to 0 (a later
  spectator's join fails "Too many spectators") and each spectator gets `dlgNetBanned.rdr`.
- **Today:** ~~the room removes a passed vote's target as ROUND COMPLETE or GAME COMPLETE starts (SVC-23d,
  `VOTE_KICK_POINT_READING`) and refuses the removed player's network address in that room for 10 minutes
  (`VOTE_BAN_MS`, `VOTE_BAN_SCOPE_PLACEHOLDER`, H170). The lobby's `RoomService.banFromGame`
  (`packages/central/src/lobby.ts`: the account's -972 for that game, held by `lobby.test.ts`) has no caller: the room
  tells the bridge of no removal. The room has no spectators' vote.~~ *(2026-10-10, SVC-23e:)* the room tells
  `RoomOptions.onRemoved` the seat a passed vote removes, and the bridge's game rooms call `banFromGame` -- the
  account's JoinGame to that game -972 for the game's life (`GAME_BAN_LIFE_PLACEHOLDER`), another game admitting it --
  beside the room's address ban (unchanged, H170); VOTE ALL is in the room (`voteAll`: a line per spectator present,
  the room deciding at 0.6 x the players for the host, the eject, a later spectator refused "Too many spectators"); the
  page's half (the TCM entry, the lines, the dialogs) not built (research 264 §4).
- **Gap:** a room hook called in `applyVotes` (`packages/match/src/room.ts`) telling the bridge the removed seat's
  account, and the bridge calling `banFromGame` for that game and account, so that the lobby answers the account's
  JoinGame to that game -972 beside the room's address ban (whose scope stays H170's placeholder); VOTE ALL in the
  room -- a player's toggle, the count against 0.6 x the players of both sides, the eject decided by the room where the
  original's host decided (the server counts, OT.R27, labelled as SVC-23d's count is), every spectator removed with
  `dlgNetBanned`'s close and the game's spectator cap set to 0 so that a later spectator is refused.
- **Acceptance:** server tests over the bridge: the vote-removed account's JoinGame to that game answers -972 and the
  same account's JoinGame to another game is admitted; VOTE ALL past the threshold ejects every spectator and a
  spectator's join after it is refused, while one vote short ejects none and a toggled-off vote no longer counts; each
  rule's test cites the decompilation's lines above (the reading level).
- **Proven by:** ONL-32 (a removed player's rejoin transcript: the -972) and the recomp's vote run (SVC-23's owed run,
  research 263 §5.3).
- **Dependencies:** SVC-23d (built, reviewed 2026-10-10), SVC-07a (the bridge and the game's lobby). **Size:** S.
  **Then:** nothing names it (SVC-23 closed in sprint 10 without it).
- **Unknowns:** SVC-23's: how long the original's refusal lasts (MediusBanPlayer's 120, its unit unread; research 263
  §5.3) -- `VOTE_BAN_SCOPE_PLACEHOLDER` holds it.
- **Owner calls:** none new: the ban's scope stays H170's (`VOTE_BAN_SCOPE_PLACEHOLDER`).
- *([2026-10-10, PROMOTE-22] promoted at sprint 22's adoption, W22.R6 of [sprint 22's
  plan](../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md) (the merge controller's word): written as
  a `###` task directly, the slice SVC-23's close of 2026-10-10 owed to this sprint (research 263 §7). SVC-23 does not
  name it, as it names neither SVC-23a nor SVC-23b: SVC-23 is sprint 10's, and a prerequisite in sprint 22 would stand
  after it.)*
- **Merged from:** new (research 263 §5.3, §7; research 91 §17 1.1), by PROMOTE-22 (2026-10-10).
- *(2026-10-10, SVC-23e on `agent/online-svc23e`; a reading, reviewed 2026-10-10 by dot.)* Built (research 264 §4): the hook in
  `applyVotes` and `banFromGame` wired (the bridge test: the removed account -972 to that game, Success to another,
  the ban gone with the game); VOTE ALL in `room.ts` (`room.test.ts`'s kicks block: 8 players 4 no and 5 yes with
  spectators not counted, a spectator's and a dead player's toggle refused, the retraction, a leaver's vote cleared,
  the eject and the refusal after it); the protocol's `voteAll`, `spectatorVote`, `spectatorsEjected` (additive). New
  names: `GAME_BAN_LIFE_PLACEHOLDER`, `VOTE_ALL_LINE_PER_SPECTATOR_READING`, `VOTE_ALL_LISTED_SLOTS_PLACEHOLDER`. Owed:
  the page's half, the list's slots after an eject, the proven level (ONL-32, the recomp's vote run).
#### SVC-24 -- The ARMORY's loadouts kept on the account (the file service)
- **Slice of:** SVC-12c's record ([2026-10-04, OT.R27]; the research wave's R2-UI card,
  `C:/Projects/research-wave-2026-10-04/R2-UI-frontend.md`, graded strong, not yet checked by a second agent).
- **Goal:** a player's saved loadouts follow the account, not the card: what the player sees is the original's.
- **What the original does:** `SaveCharacterProfile` modes 3 and 4 upload the per-mission loadouts to the server's
  file service as `WeapProfile_<accountId>.dat` with an MD5; modes 5 and 6 download it right after the login, before
  the usage-policy screen (R2-UI; Horizon's source has the handlers).
- **Today:** the page keeps the ARMORY's profile in browser storage (`s2u.armory.v1`); the platform roadmap's OPT-20
  moves it to the simulated card's `WeapProfile_%d.dat` -- for an online player the wave reads the server as its
  home, so OPT-20 and this block must agree on one store before either is built (the offline game keeps the card's).
- **Acceptance:** under OT.R27 the transport is ours (a bearer-authenticated request on the account, size-bounded,
  never a client-named account id); the screens and their order are the original's -- the download between the login
  and USER AGREEMENT, the upload where the original's modes 3 and 4 run; a test that one account's loadouts never reach
  another, and that a missing or corrupt file falls back to the defaults.
- *(2026-10-04, verified by a second agent, the research wave's V7 #5, `V7-verify-round2-remaining.md`):* the game's
  order is a file-list request, then the create of `WeapProfile_<accountId>.dat` only if it is missing (2000 bytes, the
  account its owner, owner read and write), then the upload. The MD5 is never sent: the game keeps it and compares it at
  the login with the checksum the server returns in the file list, and downloads only when they differ. Stock Horizon
  serves none of this (no file-list handler, no checksum, an existing file refused), so saves and the login download
  stall to the scripts' 3 s timeout. Under OT.R27 the wire is ours, so the acceptance gains what the player sees:
  the login fetches the loadouts only when the stored file's checksum differs from the page's, a save never waits on a
  timeout, a first save creates the file and a later one overwrites it, and the stored file is bounded to 2000 bytes.
- *(2026-10-04, OT.R36, the owner: "loadouts saved server side"):* this block is the store for an online player's
  loadouts; OPT-20's card file stays the offline game's. The clash is settled; ONL-17 / PLAT-34 build on it.
- *(2026-10-05, `agent/s17-armory`, merged at 23d2beb5; web research 167):* built -- `GET` / `PUT /lobby/loadout` with the
  bearer (`packages/central/src/loadoutHttp.ts`): the account's records per mission and side (`FUN_002fb610`'s shape),
  every item checked against `FUN_003d3230`'s table, the side's `MpCharSet`, an offered map; the body bounded (413), the
  path behind the door's flood limits; kept on the account record in SVC-04's store behind the `LoadoutStore` seam
  (deleted with the account; since OT.R37 a `loadouts` row per account, mission and side in the SQLite store, 7121dfe9,
  research 220 R220.6), 0x80 missions at most (409). The match learns the kit server side: the bridge reads each
  seat's record at the launch and the room re-chooses it per item (`Room.storedProfile`); no protocol field. Not done:
  the login's fetch-only-when-changed checksum (the page fetches at the login's mode 5 and at the ARMORY's entry).
- **Merged from:** new, 2026-10-04.

## The proven-level harness (W22.R7) -- promoted 2026-10-10

Written 2026-10-10 by PROMOTE-22 at sprint 22's adoption (W22.R7 of [sprint 22's
plan](../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md), the merge controller's word). PROVE-1 is no
service: it scores this segment's readings of the results against the original running. It stands under a heading of
its own after the services' blocks, not beside ONL-32 (segment 05), because what it compares is built here -- SVC-12b's
codec, SVC-13's and SVC-13a's functions, the record SVC-12c writes, the results SVC-07 applies -- and every prerequisite
is this segment's; ONL-32's and PLAT-36's windows only feed it. Its prefix is its own (`PROVE-`), its number the
first; the README's segment table counts it with this file.

### PROVE-1 -- The proven-level harness for the results
- **Goal:** one scorer that turns this lane's readings of the results -- the rating each round, the stats record's
  bytes, the ladder's answers -- into proven values when the owner's captures come, each difference named.
- **What the original gives:** a match's Medius transcript on the local stack (ONL-32, R293): at each round's end the
  stats post, `AccountUpdateStats` (Lobby 0x11, the 256-byte record) then `UpdateLadderStats` (Lobby 0xce, the rating
  as ladder stat 0; `FUN_002faa80` D:L198411-198443, research 155 R155.4), and the ladder's answers (position, total);
  and PLAT-36's PEEK of the stats block 0x66a750..+0x100 after a local-stack match (`01-platform.md`, PLAT-36).
- **Today:** built (PROVE-1, 2026-10-11; research 267; reviewed 2026-10-11 by dot): `tools/prove-results.ts` scores a Medius
  transcript and a PEEK dump against `ratingsAfterRound`, the codec and `applyMatch`, and `rankLadder`, each line the
  field, both values and the tolerance, what the transcript lacks taken from a cited inputs sheet or skipped and said;
  its dev-host test `tools/test/proveResults.test.ts` runs it on the s4 slice log (`logs/parity/s4_pcsx2/slice-Medius.log`
  under `SOCOM_PC_ROOT`: one round's end, a draw, two players 1000 -> 997 / 1003; research 155 §2.1, R155.6): the round's
  two rating posts (lines 262/264, 270/272) and the two posts' fields against the `PlayerReport`s (114, 176) equal --
  proven at those inputs only (research 267 §2). Nothing else is proven: the fold, the rating past that round, the
  record's layout where the slice is zero, the ladder's answers (none in the slice) and any PEEK (none) wait for the
  owner's captures (H-next g).
- **Gap:** `tools/prove-results.ts`: a transcript's per-round rating posts against SVC-13a's `ratingsAfterRound`
  (`packages/match/src/stats/rating.ts`) over the same match replayed in the room; each `AccountUpdateStats` payload
  against the stored record byte for byte (SVC-12b's codec, `packages/central/src/stats/accountStatsCodec.ts`); the
  ladder's position and total answers against SVC-13's; the PEEK dump against the record SVC-12c wrote; each difference
  named with its field and its tolerance, the report scored.
- **Acceptance:** the harness green on the s4 slice as a dev-host test (`tools/test/proveResults.test.ts`, skipped and
  said without `SOCOM_PC_ROOT`; any `logs/parity` path it reads listed in `workflow/handoff/include.json` in the same
  commit -- the slice already is), and a run on the owner's captures leaving a scored report (no capture in git, RS.R8).
- **Proven by:** the owner's windows -- PLAT-36's PEEK (H26), ONL-32's transcripts (H27) and the second capture session
  on our own local Horizon (H94); the run on those captures is the plan's H-next g (an owner row from H176 at the landing), the s4 slice the proven set until then.
- **Dependencies:** SVC-07, SVC-12b, SVC-13, SVC-13a. **Size:** M. **Then:** the readings it scores, each moved to
  proven by its report.
- **Unknowns:** none of the original's beyond its inputs' own; each field's tolerance is the harness's to state from
  the readings, in its report.
- **Owner calls:** the windows (H26, H27, H94).
- *([2026-10-10, PROMOTE-22] promoted at sprint 22's adoption, W22.R7 (the merge controller's word): written as a `###`
  task directly. The plan's table names its need as SVC-07 only; this block adds the three it compares against
  (SVC-12b, SVC-13, SVC-13a), all sprint 10's, which sprint 22 comes after.)*
- *([2026-10-11, PROVE-1] built: the Today line read "the s4 slice log ... and SVC-12b's dev-host test
  `tools/test/accountStatsSlice.test.ts` reading its four records -- the harness's seed. Nothing compares a transcript
  with the room's own replay of the match, and nothing reads a PEEK dump." The harness compares a transcript with the
  pure functions the room's queue applies, fed the transcript's inputs; a replay through a live room is not built
  (research 267 §7).)*
- **Merged from:** new (W22.R7; research 155 §2.1, :13, :38, :149; research 261 §4), by PROMOTE-22 (2026-10-10).
