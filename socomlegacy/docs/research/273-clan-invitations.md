# 273 -- INVITE PLAYERS and RESPOND TO INVITES: the leader's invite and revoke, a player's accept and decline, the INVITATIONS row (ONL-28)

- Date: 2026-10-13 (web sprint 18, the clans' half, wave 2; the plan `../plans/2026-10-13-web-sprint-18-the-clans-pages.md`,
  W18.R12-R14; the brief `../plans/briefs/2026-10-13-s18c-onl-28-invitations.md`).
- Status: **reading, reviewed** (ONL-28, 2026-10-13, by a fresh reviewer -- PASS WITH FINDINGS; merged at 4cd320410 after its fresh review, the clans' plan's Log). Every value of the original below is read from the disc's dialogs through the
  repository's readers (`tools/dump-online-dialogs.ts --dialog dlgInvitedPlayers.rdr`, `--dialog dlgRespondToInvites.rdr`,
  `--dialog dlgWorldOfSOCOM.rdr`, `--dialog dlgManageRosterLeader.rdr`: the layouts of `RUN/UI/READERC.ZAR`, the sets of
  `RUN/UIZANIM.ZAR`, the captions of `UIMNLOC`; the `GetTextInput` block through `decodeTextInput`), from the retail
  decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and from the ELF's strings,
  data and instructions (`S:0x<addr>`, `ELF 0x<addr>`, `tools/elfImage.ts`). Unit-tested against that reading, and both
  pages replayed over the machine from the disc's own records (§8); nothing here is measured on the original running --
  ONL-32's capture (two personas: A invites, B accepts; PC research 80 H1 "Clan: invite") is the proven level.
  *2026-10-15, NU-14 (the owner's playtest: "unable to send an invite to a known online player"): the invite's lookup is
  the services' own AccountGetID at `/lobby/account-id`, a logged-in account of the name (`ACCOUNT_GET_ID_PRESENCE_READING`;
  §2.2, §5, §6 item 1, §7, §9; research 262 §4.1's row, research 269 §1.6) -- reading, pending review.*
- Stands on research [271](271-create-clan.md) (§3 the client's clan `LobbyClan`, the GetClan stub; §4 the transport
  pattern), [262](262-clans.md) (§4 SVC-09: the pairs, the cap, the lists, `INVITATION_LISTS_UNDECIDED_PLACEHOLDER`;
  §4.5 the ticketless seam), [156](156-the-user-agreement-and-the-invitations-row.md) (§2 SVC-09a's CheckMyInvites and the
  received list), [158](158-the-socom-ii-online-menu.md) (SOCOM II ONLINE's rows), [119](119-the-software-keyboard.md)
  (§5 the call sites' caps), [97](97-service-shape-and-medius-map.md) (§2 the clan rows, R97.6) and
  [269](269-the-players-pages-and-the-medals.md) (§1 the page-over-the-machine pattern, the FindPlayer stand-in), and
  does not restate them.
- Code: `packages/ui/src/screens/invitedPlayersCommands.ts` (`InvitedPlayersCommands`: the five rows, the sent list,
  the invite's state; `invitedPlayersRows`, `clanInviteText`, `clanWelcomeText`); `packages/ui/src/screens/respondToInvitesCommands.ts`
  (`RespondToInvitesCommands`: the two rows over SVC-09a's `MyClanInvitations`); `packages/ui/src/screens/createClanCommands.ts`
  (`LobbyClan.roster`, empty, ONL-27's to fill *[2026-10-13, ONL-27: built -- GetMyClans keeps the clan, the rosters and their rows are 272's (§3, §4).]*); `packages/ui/src/screens/worldOfSocomCommands.ts` (the INVITATIONS row out of
  `PARKED_ROWS`); the page's transport and mount `packages/viewer/src/clanInvitationsHost.ts` (`fetchClanMembershipService`,
  `sessionClanMembership`, `connectClanInvitations`). The services are SVC-09's and SVC-18's, unchanged
  (`packages/central/src/clans.ts`: `/clan/invite`, `/clan/invitations-sent`, `/clan/revoke`, `/clan/respond`;
  `clanInvitations.ts`: `/clan/invitations`; `lobbyHttp.ts`: `/lobby/find-player`, `/lobby/chat`) *[2026-10-15, NU-14: the invite's lookup is `lobbyHttp.ts`' `/lobby/account-id` (`accountGetId.ts`), no longer `/lobby/find-player`]*. The mount in
  `packages/viewer/src/frontEnd.ts` (a hot file) is applied under the seat's claim (HANDOFF §3 on `agent/online`),
  pinned as text by the host's test (§5).

## 1. INVITE PLAYERS as read (the disc's record)

`dlgInvitedPlayers.rdr` (READERC; background `multplay_back.tif`; scripts its own set and `UIanim.rdr`):

- **The layout**: the title `bar_title` #377 "INVITE PLAYERS"; `txtClanName` on CLANNAMEVAR; the column heads
  `DescriptionTextCR` #378 "CLAN ROSTER", `DescriptionTextIP` #379 "INVITED PLAYERS", `Category2Text` #380 "STATUS";
  `DescriptionTextLow` #381 "Select a player and ¦ Remove them" (the help line); the rows `invite` #382 "INVITE
  PLAYER", `RevokeInv` #383 "REVOKE INVITE", `return` #314 "RETURN"; the LISTBOXes `RosterList` on CLAN_ROSTER and
  `Invited Players` (a name with a space; the scripts spell it, the dump prints `<text 15>`) on INVITED_PLAYERS; the
  foot's #149 / #150; `playername` on PLAYER_NAME_AND_TAG with the five medals; the net monitor.
- **The bindings**: ONSTART `net_monitor`, `OnInvitePlaystart`, `find_invited_players`, `ActivateMedalOfMerit`;
  TRIANGLE `goto_menu(PREVIOUS_SCREEN)`; MP_PLAYER_NOT_FOUND `player_not_found`; MP_MEDIUS_ERROR
  `OnMultiplayerDisconnect`; MP_PLAYER_ALREADY_MEMBER `player_already_member`; MP_PLAYER_ALREADY_INVITED
  `player_already_invited`; MP_PLAYER_IS_LEADER `player_is_leader`; ON_SKB_APPLY `do_invite`; MP_CLAN_FULL
  `ClanFullError`; MP_SYSTEM_MESSAGE `OnSystemMessage`; `invite` ONACTIVATE `OnInvitePlayAct` (#385 "¦ Invite
  players.") and CROSS `invite_player`; `RevokeInv` ONACTIVATE `OnRevokeInvAct` (#386 "¦ Revoke invitations.") and
  CROSS `OnRevokeInvPress`; the list's TRIANGLE `BackToButtons` and CROSS `revoke_invite`; `return` ONACTIVATE
  `ReturnAct` (#322) and CROSS `goto_menu(PREVIOUS_SCREEN)`.
- **The animations**: `OnInvitePlaystart` disables both lists and, unless `CanInviteMorePlayersToClan`, runs
  `ClanFullError`; `find_invited_players` loops `GetInvitedPlayers`, `WAIT 2`, `IF CanInviteMorePlayersToClan`
  `EnableButton(invite)`, `WAIT 20` (a sent list asked every 22 s); `invite_player`: `IF CanInviteMorePlayersToClan`
  `GetTextInput(PLAYER_INVITE_NAME)` `ELSE` `ClanFullError`, then INVITE enabled and active; `do_invite`: `IF
  CanInviteMorePlayersToClan` `InvitePlayerToClan(NA)` `ELSE` `ClanFullError`; `ClanFullError`: INVITE disabled, REVOKE
  active, `POPUP #384 buttons #226 -> AreYouReallySure` and the wait; `OnRevokeInvPress`: `IF ClanHasInvitations` #386,
  the list enabled and active, `ELSE` #387; `revoke_invite`: `IF ClanHasInvitations` `POPUP #388 buttons #246/#253`
  (NO / YES) -- YES (2) `RevokeInvite(INPUT_STRING)`, `KillPopUp`, INVITE enabled and active, `GetInvitedPlayers`; NO
  `POPUP #389` -- then INVITE active and the list disabled; `player_not_found` / `player_already_invited` /
  `player_already_member` / `player_is_leader` each a popup, #390 / #391 / #392 / #393; `BackToButtons` gives the focus
  back to REVOKE and enables INVITE when a seat is left.
- **The keyboard** (`invite_player`'s block, the command's 0xAC bytes, `decodeTextInput`): `UiVar` PLAYER_INVITE_NAME,
  `SkbName` `MPPLAYERNAME`, `Purpose` `_394_EnterInvite_MSG` (#394 "Enter Name of Player to Invite"), **`MaxChars` 14,
  `MaxBytes` 31**, no flags (research 119 §5's row, re-read by `tools/test/clanInvitationsDisc.test.ts`). PLAT-17 applies
  the caps as it does CREATE CLAN's.
- **The captions** (UIMnLOC): #384 "There may only be a total of 16 members and invitees for any Clan. To invite more
  people to join your Clan, revoke existing invites or remove current members." with #226 "CONTINUE"; #387 "There are no
  outstanding Clan invitations."; #388 "Do you really want to remove this player from the invite list?"; #389 "Action
  cancelled, ¦ CONTINUE."; #390 "That player does not exist. ¦ CONTINUE."; #391 "Player has already been invited to
  join your Clan. ¦ CONTINUE."; #392 "That player is already a member of your Clan." and " ¦ CONTINUE." on a second
  line; #393 "You are the leader of the Clan; you cannot invite yourself. ¦ CONTINUE."; #394 the keyboard's title.
- **How it is reached**: from the leader's roster only -- `dlgManageRosterLeader.rdr`'s INVITATIONS row (#476) is
  `goto_menu(dlgInvitedPlayers.rdr)` (SND_DINK); the page has no edge out but `PREVIOUS_SCREEN`, so TRIANGLE and RETURN go
  back to the roster. The roster page is ONL-27's (its rows answer the table's declared values until then); today it is
  reached by CREATE CLAN's success (research 271 §1), or by SOCOM II ONLINE's CLAN row while the client's clan holds the
  create's leader -- forgotten at the next SOCOM II ONLINE (271 §3). *[2026-10-13, ONL-27: built -- GetMyClans keeps the clan, the rosters and their rows are 272's (§3, §4).]*

## 2. INVITE PLAYERS' rows (the C bodies)

### 2.1 The sent list: `GetInvitedPlayers`, its reply, its rows

- **`FUN_0027a3f0`** (GetInvitedPlayers, D:L124400-124407) calls `FUN_002e6ea0` and answers 1.
- **`FUN_002e6ea0`** (D:L186707-186729): only while the lobby session's +0x7d is set and its state +0x60 is 0x0b: the
  sent list 0x44f720 emptied (`FUN_002e9160` D:L187939-187958), GetClanInvitationsSent sent (0x30 bytes: the session key
  at +0x15, +0x28 left 0, 999 at +0x2c; `FUN_00645cd8`, Lobby 0x7a) with the callback `FUN_002e6f50`.
- **`FUN_002e6f50`** (D:L186734-186782), one reply: a status (+0x18) not Success ("MediusGetClanInvitationsSent",
  S:0x3f4050) draws the list as it stands (`FUN_002e70b0`); a Success row whose response status (+0x108) is 1 first
  sends AddPlayerToClan (0xf4 bytes: the account +0x1c at +0x28, `"Everyon Welcome %s to the clan"` (S:0x3f4070, the
  original's spelling) of the row's name +0x20 at +0x2c:200; `FUN_00645a48`, the callback `FUN_002e7280` a log of
  "MediusAddPlayerToClan", S:0x3f4110) and then a revoke of the account (`FUN_00645e20`, the callback `FUN_002e7270` a log of
  "ClanInviteRevokeHack", S:0x3f40f0) -- research 262 §4.4; a row of response status 0, 1 or 2 is kept (`FUN_002e9030`
  D:L187898-187936: appended unless a record holds its account; the record 0xf0 bytes -- the account +0, the name +4:32,
  the status +0x24, the response's text +0x28:200); the list drawn when the row ends it (+0x110).
- **`FUN_002e70b0`** (D:L186785-186832): INVITED_PLAYERS (S:0x3f3920, the lobby's +0xd4, added TEMPORARY at the
  session's start, D:L182215-182216) set to an array: an empty list, one row [`"No Invitations Sent"` (S:0x3f40d0),
  `" "` (S:0x3f3f18)]; else per record [its name, its status word: 1 "Accepted", 2 "Declined", 0 "Undecided", else
  "Unknown" (S:0x3f40b0, 0x3f40a0, 0x3f4090, 0x3f40c0)] -- `invitedPlayersRows`. The rows' order is the replies'
  (SVC-09's: the clan's undecided invitations in the store's order).

Against our services (`INVITATION_LISTS_UNDECIDED_PLACEHOLDER`, the server's: Horizon's model, the undecided only, an
accept joining at once) every listed row is "Undecided" and the hack's AddPlayerToClan is never sent; it is transcribed
whole, the AddPlayerToClan a request our services do not answer (the page's service has no `addPlayer`).

### 2.2 `InvitePlayerToClan`: the checks, the lookup, the invitation and its whisper

- **`FUN_0027a740`** (D:L124512-124547): PLAYER_INVITE_NAME (S:0x3eee50) found or added TEMPORARY; when it holds a
  string (type 3), its text to `FUN_002e7600` and that function's answer; else 1.
- **`FUN_002e7600`** (D:L186970-187047), with the invite's state `DAT_0044f798` (BSS: 0 at boot; 0 idle, 1 the lookup
  sent, 2 the invitation sent, 3 done): 0 unless the session is up in state 11; in the state 3, 0 and the state set 0
  (D:L186990-186993: so the statement ticks once more and the next tick starts afresh); in the states 1 and 2, 1 and
  nothing. In the state 0: no name or an empty one raises MP_PLAYER_NOT_FOUND (S:0x3f4130), 1; a name the roster holds
  (`FUN_002e9460` D:L188026-188056 on 0x44f740 -- the row's name +0x20 case-blind, else the name's `strtol` against the
  row's account +0x1c; the name in `a1`, ELF 0x2e76ac) raises MP_PLAYER_IS_LEADER (S:0x3f4170) when the name is the
  session's own (`FUN_00198b80`, case-blind, 0x66a4f4), else MP_PLAYER_ALREADY_MEMBER (S:0x3f41c0), 1; a name on the
  sent list (case-blind, D:L187014-187031) raises MP_PLAYER_ALREADY_INVITED (S:0x3f41e0), 1; else AccountGetID by the name
  (0x46 bytes: the session key at +0x15, the name at +0x26:32; `FUN_00649e28`, the callback `FUN_002e7850`), the state 1,
  1.
- **`FUN_002e7850`** (D:L187049-187083): a status (+0x1c) not Success ("MediusGetPlayerForInvitation", S:0x3f4200)
  raises MP_PLAYER_NOT_FOUND, the state 3; else InvitePlayerToClan (Lobby 0x62, 0xf4 bytes: the account +0x18 of the
  reply at +0x28, the text at +0x2c:200; `FUN_00645b90`, the callback `FUN_002e7960`), the text `sprintf` of `"Clan %s
  invites you to join."` (S:0x3f4220) and the clan's name (0x44f5a4, `LobbyClan.name`); the state 2; and the same text
  whispered to the account -- `FUN_002f4d60(lobby, account, 1, text)` (D:L194713-194738): ChatMessage (0x70 bytes: the
  type 1 at +0x28, the target at +0x2c, the text's first 63 bytes at +0x30). Neither cut bites: a clan name is at most 31
  bytes (research 271 §2.1), so the text is at most 57.
- **`FUN_002e7960`** (D:L187087-187108): a status (+0x18) not Success ("MediusInvitePlayerToClanInvitation",
  S:0x3f4240) raises MP_CLAN_FULL (S:0x3f4268) for MediusMaxExceeded -956, nothing for MediusRequestDenied -985
  (`desktop@be557831:server/horizon-server/RT.Common/Types.cs:85`, `:114`), MP_PLAYER_NOT_FOUND for any other; a Success
  asks the sent list again (`FUN_002e6ea0`). The state 3.

**What each answer shows** (the page's captions, by the set's bindings):

| the case | the console | the page |
|---|---|---|
| a name the lookup finds; SVC-09's `invite` Success | the invitation and its whisper; the sent list again | the new row "Undecided" |
| an empty name, or a name the lookup does not find (`INVITE_NAME_LOOKUP_PLACEHOLDER`) *[2026-10-15, NU-14: AccountGetID on the services: no account of the name]* | MP_PLAYER_NOT_FOUND | #390 |
| a name on the sent list | MP_PLAYER_ALREADY_INVITED, nothing sent | #391 |
| a member of the roster / the leader's own name | MP_PLAYER_ALREADY_MEMBER / MP_PLAYER_IS_LEADER, nothing sent | #392 / #393 -- ~~never today: no roster held (`CLAN_ROSTER_UNHELD_READING`)~~ *[2026-10-13, ONL-27: raised -- the roster held, `CLAN_ROSTER_UNHELD_READING` retired, research 272 §4, §9]* |
| the clan full: SVC-09's -956 (members and undecided invitations at `CLAN_CAP_PLACEHOLDER`) | MP_CLAN_FULL | `ClanFullError`: #384 with #226, INVITE disabled, REVOKE active |
| SVC-09's other refusals (-966 a standing invitation or no such account, -990 not the leader, -971 no clan) | MP_PLAYER_NOT_FOUND | #390 |
| -985 MediusRequestDenied | nothing | nothing |
| no seat left by the client's own rule | `ClanFullError` before any request | #384 |

*[2026-10-15, NU-14.]* **The branch the owner hit** (his two-window playtest; the server's log, outside the tree: one
`/lobby/find-player` 200, then no `/clan/invite`, only `/clan/invitations-sent` polls): `found` (`FUN_002e7850`'s
transcription in `invitedPlayersCommands.ts`) on a lookup status not Success -- MP_PLAYER_NOT_FOUND, #390 "That player
does not exist.", the state 3, no invitation. The lookup was SVC-18's FindPlayer (`chat.ts` `findPlayer`), which answers
AccountNotFound (-998) for an account in no briefing room and no game seat (`onLobby`); the invitee, a known account,
was in neither -- the leader on the clan pages after the match, the invitee off the lobby. The console sends
AccountGetID, which asks nothing of a room or a game: the disc's #376 (IGNORE's caption for the same request's failure,
research 269 §1.6) says what it refuses -- a player who "does not exist or is not currently logged in". The fix at the
root: the services answer AccountGetID (`packages/central/src/accountGetId.ts`, `POST /lobby/account-id`
`{ accountName }`: the store's account of the name, case-blind as the store keys names, with a live session --
`ACCOUNT_GET_ID_PRESENCE_READING`; else -998) and both pages' transports ask it (`clanInvitationsHost.ts`,
`ignoreListHost.ts`). *(The review's F1, 2026-10-15: first built on Horizon's reading -- any account, logged in or not,
`desktop@be557831` `MLS.cs:468-497`, `DbController.cs:159-182` -- then ruled for the disc's #376; Horizon's is the other
reading, §7. The route moved from `/clan/account-id` to `/lobby/account-id`, shared with the ignore list's add.)* So an
invitee whose session had ended is #390 still, as the original's text has it. *[2026-11-10, CLAN-INVITES: no longer --
the owner's word, "ensure clan invites are sent to accounts that exist but are offline" (2026-11-10 ~20:35Z, after a player's report),
overturned the 2026-10-15 ruling: AccountGetID answers any account of the name, logged in or not (Horizon's lookup; the
invite's own #390 names no logged-off case), so a logged-off invitee is invited and reads it at his next CheckMyInvites
(§7).]* The rows' refusals before any request
(#390 empty, #391, #392, #393, #384) were each already shown; none returned silently. Tests:
`packages/central/test/accountGetId.test.ts` (the service, the path and its auth, the owner's case through
`createServices` with `@s2u/ui`'s rows: a player logged in in no room invited and listed, a logged-off one #390 until he
logs in; the ignore list's add the same), `packages/viewer/test/clanInvitationsHost.test.ts` (the transport's path and
body; the owner's case at the mount: FindPlayer's -998 no longer asked), `packages/ui/test/screens/invitedPlayersScreen.test.ts`
(the owner's case and #392 / #393 over the machine).

### 2.3 `RevokeInvite`

- **`FUN_0027a310`** (D:L124363-124377): the argument (`FUN_0026ed60`, the record's +8), INPUT_STRING (S:0x3ee898)
  replaced by the running animation's input string (`FUN_00272480`) -- the row's first cell, the name; to
  `FUN_002e72a0`, whose answer it returns (`jal 0x2e72a0` and the epilogue, ELF 0x27a378-0x27a38c).
- **`FUN_002e72a0`** (D:L186835-186882): 0 unless the session is up in state 11; with the sent list empty, 1 and
  nothing; else the record of the name (case-blind): none raises MP_PLAYER_NOT_FOUND, 1; found, RevokeClanInvitation
  (Lobby 0x68, 0x2c bytes, the record's account at +0x28; `FUN_00645e20`) with the callback `FUN_002e7420`
  (D:L186888-186898): its status logged ("MediusRevokePlayerInvitation", S:0x3f4150), the sent list asked again. 1.
  SVC-09's `revoke` closes the clan's undecided invitation to the account (`REVOKE_LIVE_INVITATION_READING`, the
  server's).

### 2.4 `ClanHasInvitations` and the seats

Neither row has a decompiled block (research 107 §5's folded rows); both read off the ELF's instructions:

- **`ClanHasInvitations`** (ELF 0x277960: `lui a0, 0x45; j 0x2e7290; addiu a0, a0, -0xc90`; at 0x2e7290 `lui at,
  0x45; lw v0, -0x8dc(at); jr ra; sltu v0, zero, v0`): the sent list's count `DAT_0044f724` is not 0.
- **`CanInviteMorePlayersToClan`** (ELF 0x27a830 -> 0x2e5fe0: `lw v1, -0x8bc(at)` the roster's count `DAT_0044f744`, `lw
  v0, -0x8dc(at)` the sent list's, `addu v0, v1, v0`, `jr ra; slti v0, v0, 16`): the roster and the invitations sent,
  together, under 16 (R97.6; #384's "16") -- `CLAN_INVITE_SEATS`, the client's number, read. The server's own cap is
  `CLAN_CAP_PLACEHOLDER` (16, members and undecided invitations; research 262 §4.2). The roster is ONL-27's
  (`CLAN_ROSTER_UNHELD_READING`): held by none, the client counts the invitations sent alone -- one seat more than the
  original's client, whose roster holds the leader; the server's -956 then answers the sixteenth with the same #384.
  *[2026-10-13, ONL-27: the roster held in `LobbyClan.roster`, so the client counts the roster and the invitations sent,
  as the original's (research 272 §4, §9).]*

## 3. RESPOND TO INVITES as read, and its rows

`dlgRespondToInvites.rdr` (READERC; background `multplay_back.tif`; scripts its own set and `UIanim.rdr`):

- **The layout**: the title #724 "RESPOND TO INVITES"; `txtClanName` on CLANNAMEVAR; `DescriptionText` (the help line);
  the column heads `CategoryText2` #380 "STATUS", `CategoryText3` #725 "CLAN INVITATION"; the rows `Accept` #726
  "ACCEPT", `Decline` #727 "DECLINE", `LeaveClan` #459 "LEAVE CLAN", `return` #67 "RETURN"; the LISTBOX `Invitations` on
  MY_CLAN_INVITES (SVC-09a's rows: [the invitation's id, its text, its status word], research 156 §2); the foot, the
  medals, the net monitor.
- **The bindings**: ONSTART `net_monitor`, `OnRespondStart`, `ActivateMedalOfMerit`, `find_invited_players`; TRIANGLE
  `goto_menu(PREVIOUS_SCREEN)`; MP_MEDIUS_ERROR `OnMultiplayerDisconnect`; MP_SYSTEM_MESSAGE `OnSystemMessage`; `Accept`
  ONACTIVATE `OnAcceptAct` and CROSS `OnAcceptPress`; `Decline` ONACTIVATE `OnDeclineAct` and CROSS `OnDeclinePress`;
  `LeaveClan` ONACTIVATE `OnLeaveClanAct` (#468 "¦ Leave your Clan.") and CROSS `leave_clan`; `return` ONACTIVATE
  `ReturnAct` (#322) and CROSS `check_then_save_and_leave` (`SWITCHMENU(dlgWorldOfSOCOM.rdr)`); the list's TRIANGLE
  `OnRespondStart` and CROSS `Accept_invite`.
- **The animations**: `OnRespondStart`: `IF IsLeaderOfClan` LEAVE CLAN hidden and disabled, `ELSEIF IsMemberOfClan`
  enabled and active, `ELSE` disabled; then ACCEPT active and the list disabled. `find_invited_players` loops
  `CheckMyInvites`, `WAIT 30`. `OnAcceptAct` / `OnDeclineAct`: `AcceptOrDecline` 0 / 1, #728 "¦ Activate the accept
  invitations list." / #729 "¦ Activate the decline invitations list."; `OnAcceptPress` / `OnDeclinePress`: `IF
  HasClanInvitations` the list active and enabled, #730 "Select invitation and ¦ Accept." / #731 "Select invitation and ¦
  Decline.". `Accept_invite`, for an accept (`AcceptOrDecline` 0): the leader -- `POPUP` of the set's own 149-byte text,
  no UIMnLOC id ("You are the leader of a clan.  You must appoint a new leader or disband the clan from the manage
  roster screen before joining a new clan. ¦ Continue.", `LEADER_CANNOT_JOIN_TEXT`), no button, the wait; a member --
  `POPUP #732` ("You must leave the your currect Clan before you can join another. ¦ CONTINUE.", the original's
  spelling: **"must leave before joining"**), no button, the wait, then LEAVE CLAN active and enabled, the list disabled,
  `CALL OnRespondStart`; no clan -- `AcceptInvitation(INPUT_STRING)`, #733 "I accept the invite.", `WAIT 1`, `POPUP #734`
  ("Invitation accepted.  You have been added to the Clan. ¦ CONTINUE.", whatever the reply), the wait, `KillPopup`,
  `SWITCHMENU(dlgWorldOfSOCOM.rdr)`. For a decline: #735 "Thanks anyway.", `DeclineInvitation(INPUT_STRING)`, `WAIT 1`,
  DECLINE active, the list disabled. `leave_clan`: #736 (NO / YES), YES `QuitClan(NA)` and #474 -- QuitClan is ONL-27's
  row (the table's declared answer until then). *[2026-10-13, ONL-27: built -- GetMyClans keeps the clan, the rosters and their rows are 272's (§3, §4).]*
- **The valves' spelling**: the leader's branch sets `AlreadyOnAClan` and waits on `AlreadyOnAclan`, which the popup's
  CROSS sets; transcribed as the set holds it.
- **The menu queue's order** (`./menuQueue`, `FUN_003654c0` D:L262288-262290: the top record consumed first): a frame's
  first `ActivateButton` is the last applied, so after #732 the focus rests on LEAVE CLAN (its ONACTIVATE #468), as at a
  member's ONSTART -- not on ACCEPT, which `OnRespondStart` activates after it.
- **The edges**: the accept's and RETURN's `SWITCHMENU(dlgWorldOfSOCOM.rdr)`; TRIANGLE `PREVIOUS_SCREEN` (SOCOM II ONLINE,
  with SND_DINK).

**The two rows**:

- **`FUN_00277550`** (AcceptInvitation, D:L122892-122908) / **`FUN_002774c0`** (DeclineInvitation, D:L122873-122889):
  the argument, INPUT_STRING replaced by the running animation's input string -- the row's first cell, the invitation's
  id -- read by `strtol` base 10 (`FUN_00191490`), to `FUN_002e89f0` / `FUN_002e8980`; 1.
- **`FUN_002e89f0`** / **`FUN_002e8980`** (D:L187668-187707): RespondToClanInvitation (Lobby 0x66, 0xf8 bytes: the
  session key at +0x15, the id at +0x28, 1 accept / 2 decline at +0x2c, the text +0x30 left empty; `FUN_00645d78`), sent
  whatever the session's state (no +0x7d or +0x60 test), the callback `FUN_002e8a60`.
- **`FUN_002e8a60`** (D:L187710-187720): the status logged ("RespondToClanInvitation", S:0x3f4500), the received list
  asked again (`FUN_002e8650`, SVC-09a's `MyClanInvitations.check`), whatever the status.

**What an accept leaves the client's clan as: unchanged.** `FUN_002e8a60` writes no clan id (`DAT_003df298`), no leader
(`DAT_0044f5c4`) and no name (0x44f5a4); the client learns its new clan from GetMyClans, which SOCOM II ONLINE's
`init_screen` runs at the switch the accept's script makes (`GetClan` -> `FUN_002e8a90`; its reply `FUN_002e8bd0` sets the
three ids and the name). That row is ONL-27's: today its stub applies the no-clan reply (`GET_CLAN_STUB_READING`), so
after an accept `LobbyClan` stays the no-clan state -- the server holds the membership (SVC-09's `respond` joins), the
client does not until ONL-27. *[2026-10-13, ONL-27: built -- GetMyClans replaces the stub, so an accept is known at the
next SOCOM II ONLINE (research 272 §3).]*

**What each case shows** (the page as built, over SVC-09):

| the case | the console | the page |
|---|---|---|
| no clan, ACCEPT a row; SVC-09's `respond` Success (the account joins, `acceptClanInvitation`) | #733, #734, SOCOM II ONLINE | the same; `LobbyClan` untouched |
| no clan, ACCEPT; SVC-09 refuses (the invitation gone -966; the account in a clan, `IN_A_CLAN_ACCEPT_STATUS_PLACEHOLDER`) | #734 all the same (the script does not wait on the reply); the list asked again | the same |
| a member, ACCEPT | #732, nothing sent | #732 -- never today (§6 item 3) |
| the leader, ACCEPT | the set's 149-byte text, nothing sent | the same -- never today (§6 item 3) |
| DECLINE a row | #735; the list asked again | the same |

## 4. SOCOM II ONLINE's INVITATIONS row (N6)

`TurnOnInvitations` (ONSTART, a loop each second): `IF HasClanInvitations` `EnableButton(invitations)` and
`invitations.op1(_476_INVITATIONS_MSG)` (#476 "INVITATIONS") `ELSE` `invitations.op1(_794_NoInvitations_MSG)` (#794 "NO
INVITATIONS") and `DisableButton(invitations)` -- **the row's two forms**: invitations waiting, INVITATIONS, a stop of the
walk with its ONACTIVATE `invitationsAct` (#787 "¦ View current Clan invites.", the `InvitedPlayers` pane on
MY_CLAN_INVITES); none, NO INVITATIONS, disabled. Its CROSS, `Goto_Invites`: `VALVE StartMusic = 1`,
`SwitchMenu(dlgRespondToInvites.rdr)`, no sound. The row is out of `PARKED_ROWS` (`worldOfSocomCommands.ts`): its CROSS
runs the set's script whole. `HasClanInvitations` reads the received list SVC-09a fills (research 156 §2), which with the
session's ticket is now the account's own (§5): an invitation waiting lights the row.

## 5. The transport and the mount

`packages/viewer/src/clanInvitationsHost.ts`, added beside SVC-09a's `fetchClanInvitationsService`:
`fetchClanMembershipService(base)` posts `POST <base>/clan/invitations` `{ start, pageSize }`, `/clan/invitations-sent`
`{ start, pageSize }`, `/clan/invite` `{ playerAccountId, message }`, `/clan/revoke` `{ playerAccountId }`, `/clan/respond`
`{ clanInvitationId, response, message }`, `/lobby/find-player` `{ name }` *[2026-10-15, NU-14: `/lobby/account-id` `{ accountName }`, AccountGetID]* and `/lobby/chat` `{ messageType, targetId,
message }` (204), each with the session's ticket as the bearer, `credentials: 'omit'`, `cache: 'no-store'`; 401 the
session lost (the lobby client's `sessionLost`), any other refusal or shape a request never answered; no ticket, no
request. `<base>` is the page's own origin (`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`): the bearer
never goes to a `server=` host. `connectClanInvitations(host, { uiVars, clan, invitations, service, ticket, sessionLost,
event, inputString, lobby })`, with a transport, registers SOCOM II ONLINE's `CheckMyInvites` and `HasClanInvitations`
again over the session's received list with the ticket -- **the page sends the ticket**, which research 262 §4.5 owes to
the task that unparks the clan panels; the server's ticketless branch (`CLAN_INVITATIONS_TICKETLESS_ADAPTATION`) stays,
unreached by a page so mounted, its retirement a server change outside this row's files (§9) *[2026-10-15: retired by
INVITE-TICKETLESS, a ticketless request 401 (§9)]* -- and mounts INVITE
PLAYERS' five rows and RESPOND TO INVITES' two over the same transport.

**The mount in `frontEnd.ts` -- a hot file's four hunks, applied under the seat's claim** (by content, as ONL-26's; the option with its doc line):
1. the import line `from './clanInvitationsHost'` gains `connectClanInvitations, fetchClanMembershipService, type
   ClanMembershipTransport`;
2. the session option `clanMembership?: ClanMembershipTransport;` after `createClan?: CreateClanTransport;`;
3. after `connectCreateClan(...)`: `connectClanInvitations(this.host, { uiVars: this.uiVars, clan: this.world.commands.clan,
   invitations: this.world.invitations, service: o.clanMembership, ticket: () => this.lobby?.ticket() ?? null,
   sessionLost: (t) => { this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts),
   inputString: (cmd) => this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null });`;
4. the page's `clanMembership: fetchClanMembershipService(accountServiceBase(search, win.location, devBuild())),` after
   `createClan: fetchCreateClanService(...)`.
`packages/viewer/test/clanInvitationsHost.test.ts` pins the four lines as text (the import, the option, the call after
`connectCreateClan`, the page's transport): the shipped page mounts both pages and its INVITATIONS row asks with the
ticket.

## 6. The deviations

1. **The invite's lookup** (`INVITE_NAME_LOOKUP_PLACEHOLDER`): AccountGetID asked as SVC-18's FindPlayer, which finds
   only a player on the lobby -- a player off line is #390 where the console's server would have found his account.
   *[2026-10-15, NU-14: gone -- the services answer AccountGetID (`/lobby/account-id`, research 262 §4.1), a logged-in
   account of the name in a room or not (`ACCOUNT_GET_ID_PRESENCE_READING` then; `ACCOUNT_GET_ID_PRESENCE_OWNER` since 2026-11-10, §7); the owner's case (§2.2, after the table).]*
2. **The roster unheld** (`CLAN_ROSTER_UNHELD_READING`): no roster refusal (#392, #393) is raised and the seat rule
   counts the invitations sent alone, until ONL-27's GetClanRoster fills `LobbyClan.roster`. Inviting oneself goes to
   the server, which takes it (SVC-09's `invite` checks no target's clan; the accept is refused,
   `IN_A_CLAN_ACCEPT_STATUS_PLACEHOLDER`). *[2026-10-13, ONL-27: gone -- the roster held, #392 / #393 raised and the seat
   rule the original's (research 272 §4, §9).]*
3. **The client's clan forgotten** (`GET_CLAN_STUB_READING`, ONL-27's; research 271 §3): RESPOND TO INVITES is reached
   from SOCOM II ONLINE only, whose `init_screen` clears the client's clan, so its leader and member branches are never
   taken: a member accepts, the server refuses, and the page still shows #734 (the script shows it whatever the reply).
   *[2026-10-13, ONL-27: gone -- GetMyClans transcribed, both branches taken (research 272 §3).]*
4. **The chains' ticket** (`CLAN_INVITE_TICKET_ADAPTATION`, a browser adaptation): an invite, a revoke or a response
   goes on only under the ticket it began with; an invite so cut ends in the state 3, as its own failures end it.
5. **The sent list's replies** (`INVITED_PLAYERS_LATEST_REPLY_ADAPTATION`, a browser adaptation): a reply is taken only
   for the latest request, under the ticket still held.

## 7. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `INVITE_NAME_LOOKUP_PLACEHOLDER` (ui `screens/invitedPlayersCommands.ts`) | `'AccountGetID asked as FindPlayer: only a player on the lobby is found'` | the invite's AccountGetID by name (Lobby 0x17, `FUN_00649e28`; the reply `FUN_002e7850` D:L187049-187083), which our services do not serve (§2.2, §6 item 1) | an AccountGetID operation on the services (by name), as for the ignore list's (`IGNORE_NAME_LOOKUP_PLACEHOLDER`, research 269 §1.7); ONL-32's transcript of an invite of a player off line | retired 2026-10-15 (NU-14): the services' AccountGetID (`accountGetId.ts`, `/lobby/account-id`; `ACCOUNT_GET_ID_PRESENCE_READING`) asked by the page; the constant removed |
| `ACCOUNT_GET_ID_PRESENCE_READING` (server `accountGetId.ts`) | `'any account of the name, logged in or not; else AccountNotFound'` *(2026-11-10, CLAN-INVITES; was `'an account of the name with a live session, in a room or not; else AccountNotFound'`)* | which accounts AccountGetID (Lobby 0x17; the invite's `FUN_002e7600` D:L187034-187038 and the ignore add's `FUN_00300c50` D:L202232-202236) finds. *Since CLAN-INVITES (2026-11-10): any account of the name, logged in or not -- Horizon's database lookup (`desktop@be557831` `MLS.cs:468-497`, `DbController.cs:159-182`); the invite's own failure caption #390 "That player does not exist." (§1) names no logged-off case, and the invitation is stored for the invitee's next CheckMyInvites (§4); the owner's word, "ensure clan invites are sent to accounts that exist but are offline" (2026-11-10 ~20:35Z), overturns the ruling below. The ignore add asks the same request, so a logged-off player can be ignored too.* Before it (NU-14): one logged in (`AccountService.loginAt`, the session the lobby already uses), in a room or not. The evidence: the disc's #376, IGNORE's caption for the same request's failure, "That player does not exist or is not currently logged in." (research 269 §1.1, §1.6). The other reading: Horizon's any account, logged in or not (`desktop@be557831` `MLS.cs:468-497`, `DbController.cs:159-182`); the original's text outranks it (the merge controller's ruling between readings, 2026-10-15) | ONL-32's transcript of an invite (or an ignore add) of a player off line | renamed 2026-11-10 (the review's F1): the value is the owner's ruling, not a reading -- `ACCOUNT_GET_ID_PRESENCE_OWNER`, the next row; this name retired |
| `ACCOUNT_GET_ID_PRESENCE_OWNER` (server `accountGetId.ts`) | `'any account of the name, logged in or not; else AccountNotFound'` | which accounts AccountGetID finds -- **the owner's ruling against the best reading**. The best reading stays NU-14's (an account with a live session): the disc's #376, the ignore dialog's own wording for this request, "does not exist or is not currently logged in", and `FUN_002e7850` whispering the invitation's text to the account found (`FUN_002f4d60`). The owner ruled for any account, logged in or not (Horizon's, `MLS.cs:468-497`, `DbController.cs:159-182`): "ensure clan invites are sent to accounts that exist but are offline" (2026-11-10 ~20:35Z). The ignore add asks the same request, so a logged-off player can be ignored too (HUMAN_TASKS H441) | ONL-32's transcript of an invite (or an ignore add) of a player off line; the owner may overturn it | the owner's (2026-11-10) |
| `CLAN_ROSTER_UNHELD_READING` (ui `screens/invitedPlayersCommands.ts`) | `'the roster is ONL-27\'s: none held, the cap counts the invitations sent, no roster refusal'` | the roster 0x44f740 that `CanInviteMorePlayersToClan` (ELF 0x2e5fe0) counts and `FUN_002e9460` searches (§2.2, §2.4) | ONL-27's GetClanRoster filling `LobbyClan.roster` | retired 2026-10-13: ONL-27's GetClanRoster holds the roster (research 272 §4) |
| `CLAN_INVITE_TICKET_ADAPTATION` (ui `screens/invitedPlayersCommands.ts`; read by `respondToInvitesCommands.ts`) | `'an invite, a revoke or a response goes on only under the ticket it began with'` | no original: the console's chains die with its connection (§6 item 4) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `INVITED_PLAYERS_LATEST_REPLY_ADAPTATION` (ui `screens/invitedPlayersCommands.ts`) | `'a sent list reply taken only for the latest request, under the ticket still held'` | no original: the console's replies come in order on one connection (§6 item 5) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `CLAN_CAP_PLACEHOLDER` (server `clans.ts`, research 262 §6) | 16 | the original server's cap; the client's own rule now read (`CLAN_INVITE_SEATS`, §2.4) | the owner (H-next b, H34) or ONL-32's transcript | kept: listed in research 262, unchanged |
| `INVITATION_LISTS_UNDECIDED_PLACEHOLDER` (server `clans.ts`, research 262 §6) | Horizon's model | which invitations the lists hold; the leader's AddPlayerToClan, transcribed here client-side (§2.1) and never sent against our services | ONL-32's transcript of an accept, or the owner (H174) | kept: listed in research 262, unchanged |
| `GET_CLAN_STUB_READING` (ui `screens/worldOfSocomCommands.ts`, research 158) | the no-clan reply at once | GetMyClans; why an accept leaves `LobbyClan` empty (§3) and the respond page's clan branches are not taken (§6 item 3) | ONL-27 | retired 2026-10-13 (ONL-27's GetMyClans, research 272 §3) |
| `CLAN_INVITE_LIVE_ADAPTATION` (server `clanInviteLive.ts`; read by ui `screens/clanInvitations.ts` `refresh`, viewer `clanInvitationsHost.ts` `withClanInvitationNotice`) | `'a changed received list marked on the invitee\'s /lobby/chat-lines reply; the page asks the list again'` | no original: the original asks the received list only at `init_screen`, RESPOND TO INVITES' `WAIT 30` loop and a respond's reply (§3, §4), so a new invitation never reaches a player resting on SOCOM II ONLINE; the owner asked for live arrival (§10); applied only on SOCOM II ONLINE and RESPOND TO INVITES (`CLAN_INVITE_LIVE_DIALOGS`, the review's F2) | nothing to settle: a labelled browser adaptation, the original's screens, requests and replies unchanged | adaptation (CLAN-INVITES, 2026-11-10) |

## 8. The tests, and the runs (unit tests, a dev-disc test and the pages over the machine; no browser, no capture)

- `packages/ui/test/screens/invitedPlayersScreen.test.ts` (new): the five rows held to the table (ids 76, 77, 79, 124,
  190, ONL-28's) and the ELF's names; the sent list -- the request, the rows and their words, the none row, the keep
  rule, the accepted row's AddPlayerToClan and revoke, a failure, the session down; the seat rule over the roster and the
  sent list; the invite -- its four requests and text, the state machine (1, 2, the 3-then-0 tick), the refusals before
  any request (empty, already invited, a roster member, the leader), each answer's event (-956, -985, -966, not found),
  the variable holding no string, the session down, the ticket adaptation; the revoke -- INPUT_STRING's name, not found,
  the empty list, the session down; `LobbyClan.roster` and its clearing. Over the machine from the disc's records (or
  the fixtures): reached from the leader's roster; ONSTART; INVITE PLAYER's keyboard (`MPPLAYERNAME`, #394, 14 / 31) and
  the invite; #390, #391, #384 (MP_CLAN_FULL) with INVITE disabled; the cap of 16 at ONSTART; REVOKE (#387, #386, #388,
  NO #389, YES the revoke); TRIANGLE back to the roster.
- `packages/ui/test/screens/respondToInvitesScreen.test.ts` (new): the two rows held to the table (113, 114, ONL-28's);
  accept and decline -- the response's fields, the list asked again whatever the status, the argument, the ticket
  adaptation, the client's clan untouched; the INVITATIONS row unparked. Over the machine: the row's two forms; its CROSS
  (StartMusic, the switch, no sound); ONSTART with no clan; ACCEPT (#730, #733, #734, the return); DECLINE (#729, #731,
  #735); a member (#732, the focus on LEAVE CLAN); the leader (the 149-byte text); RETURN and TRIANGLE.
- `packages/viewer/test/clanInvitationsHost.test.ts` (new): each request's path, body, bearer, credentials and cache;
  401 the session lost, the other refusals and shapes rejected; no ticket no request; the mount -- the INVITATIONS row's
  check with the bearer over the received list, an invite and an accept over the transport, and no transport;
  `frontEnd.ts`'s four lines pinned as text.
- `tools/test/clanInvitationsDisc.test.ts` (new, dev-disc): both layouts, bindings, animations' ops and edges off the
  disc; the list named with a space; `invite_player`'s block decoded; the leader's roster's INVITATIONS edge; the
  respond set's 149-byte literal; SOCOM II ONLINE's `Goto_Invites`; the ELF's strings, the two folded rows' instructions
  and the BSS words.
- Changed for the row's unparking: `packages/ui/test/screens/worldOfSocomCommands.test.ts` (the parked rows),
  `worldOfSocomScreen.test.ts` (the INVITATIONS row's CROSS now opens the page), `onlineOptionsScreen.test.ts` (the gate's
  example row).
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 9. What is left

- ~~**The server's ticketless branch** (`CLAN_INVITATIONS_TICKETLESS_ADAPTATION`, `packages/central/src/clanInvitations.ts`):
  with the mount applied, no page asks without a ticket; retiring the branch (a ticketless request 401, as the other
  clan paths) is a server change for the seat to place.~~ *[2026-10-15, INVITE-TICKETLESS (the clans' finish, product
  track: the 401 is our service's wire, OT.R27) -- retired, reading, pending review. The read first: no page path sends
  `/clan/invitations` without the ticket -- `frontEnd.ts` builds `fetchClanInvitationsService` (:797) and hands it to
  `connectWorldOfSocom` (:424, registered at `worldOfSocomHost.ts:279`), but `connectClanInvitations` (:438) registers
  `CheckMyInvites` and `HasClanInvitations` again in the same constructor (the host's `setHandler` replaces by row id,
  `uiCommands.ts:581-585`) over `sessionClanMembership`, which sends nothing without a ticket
  (`clanInvitationsHost.ts:141-143`); the page always hands `clanMembership` (`frontEnd.ts:806`); RESPOND TO INVITES'
  re-ask goes over the same ticketed service (`clanInvitationsHost.ts:196`); the taunt editor's session mounts neither
  service (`tauntEditor.ts:58`); nothing under `src/modern/**`, the forge or `packages/playtest` asks it. So a request
  with no Authorization header is now 401 before the body is read, as `clans.ts`'s `clanHandler`; the constant is
  removed; the page draws nothing differently (a deep link with no ticket already sent nothing, the row "NO
  INVITATIONS"). Tests: `packages/central/test/clanInvitations.test.ts` (the ticketless 401, the handler and the match
  server's port), `clans.test.ts` (the two logged-in players' case), `packages/viewer/test/clanInvitationsHost.test.ts`
  (the mount over the world's ticketless rows: never asked; no ticket, no request). Owed to the seat: `bridge.ts`'s mount
  comment (a hot file); research 262 §4.5 and its rows and research 156 §2's dated line still describe the seam as
  live -- *done 2026-10-15 (d18bf11a2: the comment, cleared by the merge controller and the gameplay seat; 262, 156,
  roadmap 06 and PLATFORM bracketed as retired)*.]*
- **ONL-27**: GetClan's GetMyClans (the respond page's leader and member branches, the client's clan after an accept),
  GetClanRoster into `LobbyClan.roster` (`CLAN_ROSTER_UNHELD_READING`), QuitClan (LEAVE CLAN). *2026-10-13: built by ONL-27 (research 272 §3-§5) -- GetMyClans, the roster held, QuitClan; the mount in `frontEnd.ts` is the seat's (272 §7).*
- ~~**An AccountGetID on the services** (`INVITE_NAME_LOOKUP_PLACEHOLDER`, with the ignore list's).~~ *[2026-10-15, NU-14:
  built (`/lobby/account-id`, `ACCOUNT_GET_ID_PRESENCE_READING`) and asked by the invite and by the ignore list's add
  (`IGNORE_NAME_LOOKUP_PLACEHOLDER` retired, research 269 §1.7).]*
- ~~**A rendered run** of both pages on a lobby-launched persona pair where the merge controller asks for one.~~ *[2026-10-13: rendered -- `e2e/menuClan.spec.ts`, 1 passed at 20261013T1416Z (5dc0a71a2) and
  20261013T1536Z (e0649c544), the clans' plan's Log.]*
- **The proven level**: ONL-32's capture of an invite and an accept by two personas (PC research 80 H1 "Clan: invite"),
  with the server's records checked through SVC-09, and its transcript of the invite's lookup, the invitation, the
  whisper and the response.

## 10. CLAN-INVITES (2026-11-10): offline invitees, and live arrival

The owner's request, 2026-11-10 ~20:35Z, after a player's report ("inviting ppl to clans isn't working?", "invites still
dont work, unless maybe the player needs to be online?"): "ensure clan invites are sent to accounts that exist but are
offline, and that clan invites come in live for a player that recieves one. Try to do this efficiently but i suppose a
poll is acceptable if it's our only option".

1. **Offline invitees** (simulation track, reading, pending review). The invite died at the lookup:
   `accountGetId.ts`'s AccountGetID answered -998 for an account with no live session (`ACCOUNT_GET_ID_PRESENCE_READING`
   as NU-14 ruled it, §7), so `FUN_002e7850` raised MP_PLAYER_NOT_FOUND (#390) and nothing was sent; SVC-09's `invite`
   itself stores an invitation for any account. Re-ruled on the owner's word to Horizon's lookup -- any account of the
   name, logged in or not (`ACCOUNT_GET_ID_PRESENCE_OWNER`, §7's row) -- **the owner's ruling against the best reading**:
   the disc's #376 ("does not exist or is not currently logged in", the ignore dialog's wording for this request) and
   `FUN_002e7850`'s whisper to the invitee read as a lookup of players on line; the invite's own #390 and the stored
   invitation (§4) do not outweigh them. Named `_OWNER` at the review's F1 (2026-11-10). The whisper `FUN_002e7850` sends with the invitation reaches no one off line
   (`chat.ts`, `WHISPER_REACH_READING`). The ignore list's add asks the same request -- the server cannot tell the two
   apart -- so a logged-off player can now be ignored too (research 269 §1.6; HUMAN_TASKS H441, the owner's to confirm).
2. **Live arrival** (`CLAN_INVITE_LIVE_ADAPTATION`, a browser adaptation, §7's row). The original has no push of an
   invitation: the received list is asked at SOCOM II ONLINE's `init_screen` (`FUN_0027a3c0` D:L124390-124397 ->
   `FUN_002e8650` D:L187564-187581), in RESPOND TO INVITES' `find_invited_players` loop (`WAIT 30`, §3) and after a
   respond's reply (`FUN_002e8a60` D:L187710-187720). The channel chosen is one the page already holds: the briefing
   room transport's `/lobby/chat-lines` poll (`CHAT_POLL_MS_ADAPTATION`, 1 s, running from login while the lobby is up,
   on the menus too), which already carries central's `system` and `says`. Central (`clanInviteLive.ts`
   `ClanInviteNotices`) marks a logged-in account whose received list changed -- SVC-09's `invite` to it, its `revoke`,
   its clan's `disband` (`ClanService`'s `invitationsChanged`) -- and the account's next poll carries `clanInvitations:
   true` once; a session's end forgets the mark, and an account off line is not marked (its login's `init_screen` asks).
   The page (`withClanInvitationNotice` over `withSays`, `frontEnd.ts`) then asks CheckMyClanInvitations again under the
   ticket the poll was sent with (`MyClanInvitations.refresh`): the same request, the list replaced only when the replies
   are in so the INVITATIONS row never reads empty while one waits, and each reply handled as `FUN_002e86c0` handles it
   -- so the original's own `TurnOnInvitations` lights the row, the list's MP_MEDIUS_HAS_INVITES is raised as at the
   menu's entry (whether any dialog binds it is unread), and an open RESPOND TO INVITES shows the new row. **The cost**:
   no new request, connection or period; one set lookup per poll on central; one CheckMyClanInvitations per change; a
   change reaches the page up to one poll (1 s) late. *(The review's F2, 2026-11-10: the list is asked again only while the
   page shows SOCOM II ONLINE or RESPOND TO INVITES -- `CLAN_INVITE_LIVE_DIALOGS`, viewer `clanInvitationsHost.ts` -- the
   two menus the original asks it from, so MP_MEDIUS_HAS_INVITES reaches no other dialog; elsewhere the mark stays pending
   and SOCOM II ONLINE's own `init_screen` CheckMyInvites asks the list on entry.)* A full push channel was not added: the page holds no socket to
   central on the menus, and the 1 s poll is already paid for.
3. **Tests** (written, not run on the authoring host, whose free memory was under the floor; the controller runs them):
   `packages/central/test/accountGetId.test.ts` (the lookup, the path, the owner's invite of a logged-off player and the
   ignore add), `packages/central/test/clanInviteLive.test.ts` (the marks; invite, revoke and disband through
   `createServices`), `packages/ui/test/screens/clanInvitations.test.ts` (`refresh`),
   `packages/viewer/test/clanInvitationsHost.test.ts` (`chatReplyOf`, the wrapper, `live`, the `frontEnd.ts` lines).
   Not claimed: a rendered run, or ONL-32's transcript of an invite of a player off line (the proven level).
