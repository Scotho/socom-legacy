# 272 -- the clan's roster: GetMyClans, the member's and the leader's pages, the leader's actions (ONL-27)

- Date: 2026-10-13 (web sprint 18, the clans' half, wave 3; the plan `../plans/2026-10-13-web-sprint-18-the-clans-pages.md`,
  W18.R12-R14; the brief `../plans/briefs/2026-10-13-s18c-onl-27-roster.md`).
- Status: **reading, reviewed** (ONL-27, 2026-10-13, by a fresh reviewer in two passes -- PASS WITH FINDINGS, then PASS; merged at 4aefd9f5c after its fresh review, the clans' plan's Log). Every value of the original below is read from the disc's dialogs through the
  repository's readers (`tools/dump-online-dialogs.ts --dialog dlgManageRoster.rdr` and `--dialog
  dlgManageRosterLeader.rdr`: the layouts of `RUN/UI/READERC.ZAR`, the sets of `RUN/UIZANIM.ZAR`, the captions of
  `UIMNLOC`; `loadDialog` for the lists' columns and the titles' literals; the `GetTextInput` block through
  `decodeTextInput`), from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never
  pasted) and from the ELF's strings and instructions (`S:0x<addr>`, `ELF 0x<addr>`, `tools/elfImage.ts`). Unit-tested
  against that reading, and both pages replayed over the machine from the disc's own records (§10); nothing here is
  measured on the original running -- ONL-32's capture (PC research 80 H1 "Clan: roster") is the proven level.
- CLAN-RECORD-POST (2026-10-15, web sprint 19, the clans' finish, wave 3; the brief
  `../plans/briefs/2026-10-15-cf3-clan-record-post.md`): §8 item 4 and its rows of §9 -- **reading, pending review**.
- PLAYER-INFO-CLAN (2026-10-15, web sprint 19, the clans' finish, wave 4; the brief
  `../plans/briefs/2026-10-15-cf4-player-info-clan.md`): §5's VIEW INFO, §8 item 7 and its row of §9 -- **reading,
  pending review**.
- CLAN-DOT (2026-10-16, web sprint 41; the brief `../plans/briefs/2026-10-16-s41-clan-dot.md`): §12 -- **reading, pending
  review**.
- Stands on research [271](271-create-clan.md) (§3 the client's clan `LobbyClan`, the CLAN row; §2.3 the stats record and
  PLAYER_NAME_AND_TAG; §4 the transport pattern), [273](273-clan-invitations.md) (§2.4 the seat rule; §3 RESPOND TO
  INVITES' branches), [274](274-clan-messages.md) (§1.3 the band's seam; §2 EDIT NEWS on the leader's page),
  [262](262-clans.md) (SVC-08 / SVC-09: the operations and their codes, `ROSTER_LADDER_READING`), [269](269-the-players-pages-and-the-medals.md)
  (§2 the medal `ladderMedal`, the keyed cell, PLAYER INFO's origins) and [261](261-the-stats-record-and-the-ladder.md) (§1 the account
  record's +0x9f description), and does not restate them.
- Code: `packages/ui/src/screens/manageRosterCommands.ts` (`ManageRosterCommands`: GetClan, IsMemberOfClan,
  IsLeaderOfClan, GetClanRoster, GetClanMemberInfo, QuitClan; `clanRosterRows`, `sortClanRoster`, `clanRosterRating`,
  `rosterMemberOf`; the names of §9); `packages/ui/src/screens/manageRosterLeaderCommands.ts`
  (`ManageRosterLeaderCommands`: RemovePlayerFromClan, TransferLeadership, DisbandClan, UpdateClanStats;
  `mediusStatusText`, `clanDisbandErrorText`); `packages/ui/src/screens/createClanCommands.ts` (`LobbyClan`: the roster's
  rows `ClanRosterMember`, `self`, `find`, `leaderIsMine(name)`); `packages/ui/src/screens/worldOfSocomCommands.ts` (the
  GetClan stub and the two reads removed; `GET_CLAN_STUB_READING` retired); the page's transport and mount
  `packages/viewer/src/manageRosterHost.ts` (`fetchManageRosterService`, `sessionManageRoster`, `connectManageRoster`).
  The services are SVC-08's and SVC-09's (`packages/central/src/clans.ts`); since CLAN-RECORD-POST they write the
  account's record's clan fields (`recordClanOf`, `withRecordClan` in `packages/central/src/stats/accountStatsStore.ts`; §8
  item 4). The mount in
  `packages/viewer/src/frontEnd.ts` (a hot file) is applied under the seat's claim (HANDOFF §3 on `agent/online`), §7.

## 1. The member's roster as read (`dlgManageRoster.rdr`)

READERC; background `multplay_back.tif`; scripts its own set and `UIanim.rdr`.

- **The layout**: the title `bar_title`, the layout's literal "CLAN ROSTER:" (no UIMnLOC id); `txtClanName` on
  CLANNAMEVAR; the LISTBOX `RosterList` on **CLAN_ROSTER**; the rows `LeaveClan` #459 "LEAVE CLAN", `ViewInfo` #460 "VIEW
  INFO", `return` #314; `clanrating` #462 "Clan Rating:" and `txtClanRating` on **ClanRating** (the layout's default " ");
  the column heads `Category0Text` #464 "RANK" with its children `Category1Text` #316 "ONLINE", `Category2Text` #465
  "MEDAL", `Category3Text` #466 "MEMBER", `Category4Text` #467 "POSITION"; the help `DescriptionText`; PLAYER INFO's
  pop-up (`pop_missionBack`, #863, the two lists, the description, `playerinfo_ctl_desc` #864); the foot on
  PLAYER_NAME_AND_TAG with the five medals; the net monitor.
- **The bindings**: ONSTART `net_monitor`, `OnMRosterStart`, `ActivateMedalOfMerit`; TRIANGLE
  `goto_menu(dlgWorldOfSOCOM.rdr)`; MP_MEDIUS_ERROR `OnMultiplayerDisconnect`; **MP_MEDIUS_BECAME_LEADER**
  `have_become_leader`; **MP_CLAN_DISBANDED** `clan_disbanded`; MP_SYSTEM_MESSAGE `OnSystemMessage`; the list's CROSS
  `playerinfo_activate` and TRIANGLE `OnRosterListReturn(NONE)`; LEAVE CLAN ONACTIVATE `OnLeaveClanBtn` (#468 "¦ Leave
  your Clan.") and CROSS `leave_clan`; VIEW INFO ONACTIVATE `OnViewInfoBtn` (#471 "¦ Browse roster and view player
  stats.") and CROSS `view_info`; RETURN ONACTIVATE `ReturnAct` (#322) and CROSS `check_then_save_and_leave`; PLAYER INFO's
  R1 / SQUARE / TRIANGLE.
- **The animations**: `OnMRosterStart` -- `DisableButton(RosterList)`, `EnableButton(LeaveClan)`,
  `ActivateButton(LeaveClan)`, **`GetClanRoster`, `GetClanMessages`, `GetClan`**; `leave_clan` -- `POPUP #473` ("Are you
  sure you want to leave the Clan?", NO #246 / YES #253), YES (2) `QuitClan(NA)`, `POPUP #474` ("You have successfully
  left your Clan", no button), `SWITCHMENU(dlgWorldOfSOCOM.rdr)`; NO `POPUP #389`; `view_info` -- the list enabled and
  active, #472 "¦ View player stats."; `OnRosterListReturn` -- the list disabled, VIEW INFO active; `playerinfo_activate`
  -- the pop-up shown, its variables cleared, `GetPlayerInfo(INPUT_STRING)` with the command's +0x10 word **1, the CLAN
  origin** (`PLAYER_INFO_ORIGIN`, research 269 §2.4); `have_become_leader` -- `POPUP #469` ("You have become leader of the
  Clan.", #226) then `SWITCHMENU(dlgManageRosterLeader.rdr)`; `clan_disbanded` -- `POPUP #470` ("Your Clan has been
  disbanded.", #226) then `SWITCHMENU(dlgWorldOfSOCOM.rdr)`; `check_then_save_and_leave` -- `SWITCHMENU(dlgWorldOfSOCOM.rdr)`.
- **The edges**: LEAVE CLAN's, RETURN's, TRIANGLE's and MP_CLAN_DISBANDED's to SOCOM II ONLINE; MP_MEDIUS_BECAME_LEADER's
  to the leader's roster.
- **How it is reached**: SOCOM II ONLINE's CLAN row for a member (`create_modify_clan`: `IsMemberOfClan` and not
  `IsLeaderOfClan`, research 271 §3), and the leader's MP_LEADERSHIP_TRANSFER_SUCCESS (§2).

**The roster's list** (`loadDialog`, `FUN_0037eab0`'s columns) has seven columns: text at x -270 (the row's key, off the
page), 163 (the name), 57 (the glyph), 875 (the description, off the page), -10 (the position), 352 (the mark), and an
IMAGE at 112 over `null.tif`, `Medal_Blue` .. `Medal_Black` (the medal). The leader's list is the same at 162, 51, 350 and
110. So the five heads read: RANK the ladder position, ONLINE the glyph, MEDAL the medal, MEMBER the name, POSITION
"(Leader)" (§4).

## 2. The leader's roster as read (`dlgManageRosterLeader.rdr`)

- **The layout**: the title's literal "MANAGE CLAN:"; the rows `EditNews` #475, `invitedplayers` #476 "INVITATIONS",
  `removeplayers` #477 "REMOVE PLAYERS", `ViewInfo` #460, `appointleader` #478 "APPOINT LEADER", `disbandclan` #479 "DISBAND
  CLAN", `SetTag` #480 "CLAN TAG", `return` #314; the LISTBOXes `RosterList` (CLAN_ROSTER), `Invited Players`
  (INVITED_PLAYERS, ONL-28's) and `ClanMessageList` (ClanLeaderMessages, ONL-29's); `motd` on MEDIUS_MOTD; the clan rating
  and the heads as the member's, and #483 "INVITED PLAYER" / #380 "STATUS" over the invited list; `txtClanPassword` on
  Clan_Password (no script names it); PLAYER INFO's pop-up; the foot and the medals.
- **The bindings** (beyond ONL-28's INVITATIONS and ONL-29's EDIT NEWS): ONSTART `find_invited_players`, `net_monitor`,
  `OnMRosterLeaderStart`, **`MRosterLeaderStartData`** (`GetClanRoster`, `GetLeaderMessages`, `GetMediusAnnouncements`,
  `GetClanRanking`), `ActivateMedalOfMerit`; TRIANGLE `goto_menu(dlgWorldOfSOCOM.rdr)`; MP_DISBAND_CLAN_SUCCESS
  `disband_success` (`SWITCHMENU(dlgWorldOfSOCOM.rdr)`); MP_DISBAND_CLAN_FAILURE `disband_failure` (`POPUP INPUT_STRING`: the
  event's text); MP_PLAYER_IS_LEADER `OnPlayerLeaderError` (#502 "Unable to perform action. Player is Leader.");
  MP_LEADERSHIP_TRANSFER_SUCCESS `goto_menu(dlgManageRoster.rdr)`; the roster list's CROSS `DoSomething`, TRIANGLE
  `OnMRosterLeaderStart(NONE)`, ONFOCUS and ONACTIVATE `OnRosterListScroll` (`GetClanMemberInfo(INPUT_STRING)`);
  REMOVE PLAYERS ONACTIVATE `OnremoveplayersBtn` (`ActivateRosterFrom = 0`, #487 "¦ Select players for removal."), VIEW
  INFO `OnViewInfoBtn` (2, #471), APPOINT LEADER `OnappointleaderBtn` (1, #490 "¦ Appoint a new leader."), each CROSS
  `OnRemoveAppointPress` (the list active and enabled, #495 "¦ Remove Player." / #496 "Select a member and appoint them
  as leader" / #472); DISBAND CLAN ONACTIVATE `OndisbandclanBtn` (#488 "¦ Disband your Clan.") and CROSS `clan_disband`;
  CLAN TAG ONACTIVATE `OnclantagBtn` (#489 "¦ Modify your Clan tag.") and CROSS `clan_tag`; RETURN as the member's.
- **`DoSomething`** (the roster row's CROSS), by `ActivateRosterFrom`: **0, remove** -- `IF NOT IsLeaderOfClan(INPUT_STRING)`
  the sequence `remove_player` (`POPUP #492` "Do you really want to remove this player from the Clan?", NO / YES; YES
  `RemovePlayerFromClan(NA)`, `KillPopUp`, #493 "You have successfully removed the player."; NO `POPUP #389`) and the help
  " " (the set's literal, `<text 1>`); else the set's own literal **"You are the leader of this clan, you cannot remove
  yourself."** (60 bytes, no UIMnLOC id) with the literal button "Continue"; **1, appoint** -- the sequence
  `appoint_leader`: `IF NOT IsLeaderOfClan(INPUT_STRING)` `POPUP #491` (the long warning, NO / YES), YES
  `TransferLeadership(INPUT_STRING)` and `KillPopUp`, NO `POPUP #389`; the leader's own row does nothing; **2, view** --
  `CALL playerinfo_activate`.
- **`clan_disband`**: `POPUP #500` ("Are you sure you want to disband your Clan? This action is irreversible.", NO / YES),
  YES `DisbandClan(NA)`, NO `POPUP #501` ("Disband cancelled. ¦ CONTINUE.").
- **`clan_tag`**: `GetTextInput(Clan_Description)`, `WHILE skb_done != 1`, `NetCensorText(Clan_Description)`, `WAIT 0.5`,
  `UpdateClanStats(NA)`. **The keyboard** (the command's 0xAC bytes, `decodeTextInput`): `UiVar` Clan_Description,
  `SkbName` `MPPLAYERNAME`, `Purpose` `_499_EnterTextTag_MSG` (#499 "Enter the Text for Your Clan Tag."), **`MaxChars` 3,
  `MaxBytes` 15**, no flags. PLAT-17 applies the caps as for the clan's name (research 271 §2.1): a fourth character is
  refused.
- **Captions with no binding**: #505 ("That player does not exist.") and #506 ("Player has been successfully removed from
  the Clan.") are the set's `player_not_found` / `player_ejected`, bound by no event: MP_PLAYER_NOT_FOUND and MP_SUCCESS
  show nothing on this page. #494 (the leader cannot leave) is no page's.
- **The edges**: TRIANGLE, RETURN and MP_DISBAND_CLAN_SUCCESS to SOCOM II ONLINE; INVITATIONS to INVITE PLAYERS;
  MP_LEADERSHIP_TRANSFER_SUCCESS to the member's roster.
- **How it is reached**: SOCOM II ONLINE's CLAN row for the leader, CREATE CLAN's success (research 271 §1), the member's
  MP_MEDIUS_BECAME_LEADER (§1).

## 3. GetMyClans: `GetClan` in place of the stub

- **`GetClan`** (0x27aa60, no decompiled block: `lui a0, 0x45; j 0x2e8a90; addiu a0, a0, -0xc90`, ELF 0x27aa60-0x27aa68) is
  **`FUN_002e8a90`** (D:L187723-187766): 1 at once unless the session is up in state 11; by its state `DAT_0044f788`: 1
  answers 0; 2 goes back to 0 and answers 1; else CLANNAMEVAR and Clan_Description (the lobby's +0xf0 / +0xf4) emptied,
  `DAT_0044f790` = the clan id not -1 **or** the own record's clan name's first byte (0x66a790) not 0 (D:L187753;
  `CLAN_DISBANDED_OWN_RECORD_READING`), GetMyClans sent (Lobby 0x7c, 0x30 bytes: the session key at +0x15, **1 at +0x28,
  999 at +0x2c**, D:L187754-187759; `FUN_006463e0`, the callback `FUN_002e8bd0`), the state 1, and 0. A statement answering
  0 holds its sequence: SOCOM II ONLINE's `init_screen` and the member's `OnMRosterStart` wait on the reply.
- **`FUN_002e8bd0`** (D:L187769-187847), one reply. **A status not Success** ("GetMyClans", S:0x3f4518, D:L187787): the
  three ids -1 and the name zeroed (D:L187789-187792), CLANNAMEVAR and Clan_Description "" (D:L187793-187794); when the
  request was made in a clan, **MP_CLAN_DISBANDED** (S:0x3f4550, D:L187795-187798) and the own record's post
  (`FUN_002faa80`, D:L187799; the services' at the reply, `RECORD_CLAN_FIELDS_READING`, §8 item 4); the roster emptied and drawn (D:L187801-187802) -- CLAN_ROSTER
  an empty array, ClanRating 0. **Success**: **MP_MEDIUS_BECAME_LEADER** (S:0x3f4530) when the leader id was known (not
  -1) and not mine and the reply's leader (+0x44) is mine (D:L187806-187809); the clan id (+0x1c) into `DAT_003df298` and
  `DAT_0044f59c`, the leader id (+0x44) into `DAT_0044f5c4`, the name (+0x24, 32 bytes, `FUN_00199800`) into 0x44f5a4
  (D:L187810-187813); the stats (+0x68, 256 bytes) into 0x44f5e8 (D:L187814-187816); CLANNAMEVAR the name and
  Clan_Description **the tag at the stats' +15** (0x44f5f7, D:L187817-187818); the icon's file name `clan_icon_%.2d.tif`
  (S:0x3f4310) of `atoi` of the first three characters into a stack buffer nothing reads (D:L187819-187822); **the roster
  asked** (`FUN_002e69f0`, D:L187823, §4) and **the band** (MEDIUS_CLAN_MESSAGES the retrieving text, GetMyClanMessages
  with the clan id just set, D:L187824-187831: ONL-29's `myClanMessages`, research 274 §1.3). **Both**:
  PLAYER_NAME_AND_TAG added PERMANENT (D:L187837) and set to `"%s"` of the account name with no tag, else S:0x3f43a0 (`#C`
  0x80 0x40 0x20 `"[%s] "` `#C` 0x80 0x80 0x80 the name) of Clan_Description's text and the name (D:L187838-187844;
  `playerNameAndTag`, research 271 §2.3); the state 2 (D:L187845).
- **What it lights**, each now the original's: SOCOM II ONLINE's CLAN row reaches the member's or the leader's roster for
  a clan made in any session (research 271 §3's "forgotten" is gone); the room list's "+Clan - %s" rule draws the
  member's clan room (`roomListRows`, research 271 §3); RESPOND TO INVITES takes its leader branch (LEAVE CLAN hidden and
  disabled, the 149-byte refusal) and its member branch (LEAVE CLAN active, #732) -- research 273 §6 item 3; an accept is
  known at the next SOCOM II ONLINE (research 273 §3); the foot reads "[tag] name" for a tagged clan.
- **The clan id's three other readers** (CLAN-ID-WIRE, 2026-10-13; a reading, reviewed -- three fresh passes, the last
  PASS, high; merged at 32a8b70be, the clans' plan's Log): the id GetMyClans writes
  (`DAT_0044f59c`, D:L187810-187812; -1 on the no-clan reply, D:L187790) reaches, as the client's `LobbyClan.clanId`
  handed by `frontEnd.ts`, CREATE GAME's GF3 (`clanField`: `FUN_002e99f0` over `FUN_002e9840`, D:L188172-188282 --
  clan 12 under affiliations 1..4 sends 0xA000000C..0xD000000C, a player in no clan -1), AUTOPLAY's candidate test
  (`FUN_002e9940` D:L188215-188244 in `FUN_002f8fd0`) and the game lobby's `ClanGameClosed` (`FUN_002f8c60`
  D:L197433-197455 with `FUN_002e9940`): a clan game (affiliation 3) of the member's own clan is open to him, another
  clan's closed; `OWN_CLAN_NONE_READING` is retired (research 165 §6).
- **Our services** (`clans.ts` `myClans`): the caller's standing clan as one Success reply ending the list, else one
  NoResult (Horizon's, `MLS.cs:1614-1672` at be557831). The page's transport hands the reply on as a list of one.
- **`GET_CLAN_STUB_READING` is retired** (research 158 §8, 273 §7, 274 §6 rows): `WorldOfSocomCommands` no longer
  registers GetClan, IsMemberOfClan or IsLeaderOfClan; `ManageRosterCommands` does, over the same client clan.

## 4. The roster: GetClanRoster, its rows, the clan rating

- **`GetClanRoster`** (`FUN_0027a390` D:L124380-124387) -> **`FUN_002e69f0`** (D:L186557-186582), also GetMyClans'
  success and the leader's removal's: only while the session is up in state 11, **the roster emptied and drawn at once**
  (D:L186571-186572), then GetClanMemberList_ExtraInfo (Lobby 0xda, 0x24 bytes, **no session key**: the clan id
  `DAT_003df298` at +0x18, the ladder stat index 0 at +0x1c, the sort order 1 at +0x20, D:L186573-186576;
  `FUN_006468c8`, the callback `FUN_002e6a90`). The row answers 1 whatever.
- **`FUN_002e6a90`** (D:L186585-186598), one reply row: a Success ("MemberListRequest", S:0x3f3fe0) kept by its account
  unless a row holds it (`FUN_002e9590` D:L188060-188138: a 0x1dc-byte copy -- the account +0x1c, the name +0x20:32, the
  account's stats +0x40:256, the online state +0x140..+0x1cb, the ladder stat +0x1cc, the position +0x1d0, the total
  +0x1d4, the end +0x1d8) and, when it ends the list, the roster drawn; a refusal nothing (our services' ClanNotFound
  row for a clan gone: nothing kept).
- **`FUN_002e6af0`** (D:L186601-186704), the draw: the rating `DAT_0044f770` 0 (D:L186623); the roster sorted
  (`FUN_002e9b40`, D:L186627: below 21 rows the selection sort `FUN_002ea240` D:L188497-188526 -- the largest ladder stat
  first, the first of equals, the displaced row swapped into the found one's place; `CLAN_ROSTER_SORT_READING`); per row
  (D:L186641-186680) the array **[the key cell -- VALUE (S:0x3f3ff8) of `"%d"` of the account --, the name, the ONLINE glyph
  ª (S:0x3f4000) for a state +0x140 of 0 else § (S:0x3f4008), the description (+0xdf: the account record's +0x9f,
  research 261 §1), `"%d"` of the position (+0x1d0), "(Leader)" (S:0x3f4010) when the row's account is the leader id
  else " ", the medal `FUN_002eaee0` of the position (an int), then offline "" "" else the room -- "MAIN MENU" (S:0x3f4028)
  and " " for one named "Medius..." (`strncmp` 6, S:0x3f4020) -- and the game]**; with eight rows or more the first
  eight's ladder stats summed (D:L186634-186640, D:L186681-186683), and the sum divided by 8 toward zero (D:L186687-186690);
  the rows set into CLAN_ROSTER (the lobby's +0xd8, S:0x3f3930, D:L186692) and the rating into ClanRating (S:0x3f4038,
  TEMPORARY, an int, written when it differs, D:L186693-186701). `clanRosterRows`, `sortClanRoster`, `clanRosterRating`.
- **The key cell** is built flat (VALUE and the text), as the ladder's (`LADDER_KEYED_CELL_READING`, research 269 §2.4);
  the list draws its text in the off-page column and a row's INPUT_STRING is it -- the account id (the machine test reads
  `GetPlayerInfo(INPUT_STRING)` of 99 off a row).
- **The medal** is `ladderMedal(position, my total)` (`FUN_002eaee0` D:L188934-188970 against `DAT_0044f800`, research 269
  §2): the module reads my total through `ladderTotal` (ONL-30a's ladder rows, `state().myTotal`); absent, 0 and no medal.
  A row's position of -1 is replaced by my own, `DAT_0044f7f8` (D:L188943-188945), read through `ladderPosition`
  (`state().myPosition`; absent, 0): `ladderMedal`'s third argument, which ONL-30a's own calls now hand too (the review's
  F2, 2026-10-13).
- **The clan rating (#462, W18.R13)** shows what the record holds: the mean of the first eight rows' ladder stat. Since
  CLAN-ROSTER-LADDER (2026-10-14, research 310 §2.3) our services answer each row's ladder stat with the member's stored
  rating, its position his place on the players' board and its total the board's length, so the rating is the real
  eight-best mean (0 under eight members); until then they answered the request's index -- 0 (`ROSTER_LADDER_READING`,
  retired) -- the position 1 and the total 0, and the rating read **0**. Drawn at the request it reads 0 before any reply
  (the layout's default " " shows only until the first GetClanRoster). The plan's "empty until clan games exist" is this:
  the original's builder writes the int 0, not a blank. The clans' ladder is SVC-11's (H188).
- **`IsLeaderOfClan`** (`FUN_0027a890` D:L124550-124564): the argument, INPUT_STRING replaced, to **`FUN_002e67d0`**
  (D:L186474-186488): the roster's row of that name (case-blind) or, failing that, of the account its `strtol` gives
  (`FUN_002e9460` D:L188026-188057) -- its account compared with the leader id; no row, the session's own. `LobbyClan.find`,
  `leaderIsMine(name)`. With the roster held, INVITE PLAYERS' refusals #392 / #393 and its seat rule count the roster
  (`CLAN_ROSTER_UNHELD_READING` retired, research 273 §2.4): an invite of the leader's own name is refused #393 before
  any request, as the original's.
- **`GetClanMemberInfo`** (`FUN_00279a20` D:L124038-124054 -> `FUN_002e6000` D:L186177-186184): the roster looked up by
  the row's key and nothing kept or sent; 1.

## 5. The member's actions

- **`QuitClan`** (`FUN_00278d00` D:L123692-123699) -> **`FUN_002e8ef0`** (D:L187850-187870): only while the session's
  +0x7d is set (no state test): RemovePlayerFromClan (Lobby 0x60, 0x30 bytes: the session key at +0x15, **the session's
  own account `DAT_0066a4f0` at +0x28**, the clan `DAT_003df298` at +0x2c; `FUN_00645af0`, the callback `FUN_002e8f70`); 1.
  **`FUN_002e8f70`** (D:L187873-187895): a Success ("QuitClan", S:0x3f4568) -- the three ids -1 and the name zeroed,
  CLANNAMEVAR and Clan_Description "", MEDIUS_CLAN_MESSAGES "No clan messages." (D:L187889), the roster emptied and drawn,
  the own record's post (D:L187892; the services' at the quit's Success, `RECORD_CLAN_FIELDS_READING`, §8 item 4); a
  refusal nothing. The page knows its own account id only by
  name (`CLAN_SELF_BY_NAME_ADAPTATION`, §8 item 1): unknown, nothing is sent. Our services: `/clan/remove` with the
  caller's own id is the quit; the leader's own is refused (`LEADER_LEAVE_STATUS_PLACEHOLDER`, the server's) -- the leader's
  page has no LEAVE CLAN, and RESPOND TO INVITES hides its row for the leader.
- **VIEW INFO**: PLAYER INFO of the row's account, the CLAN origin -- whose presence lines and position the original reads
  from this roster (`FUN_002f0020` D:L191825-191857: the roster's row of the reply's name, its online state, its +0x1d0).
  *[2026-10-15, PLAYER-INFO-CLAN: built.]* The read (D:L191825-191857): the tag CLAN (S:0x3f4c28, `FUN_00198f18`
  D:L191825) picks the branch; `FUN_002e9460(0x44f740, reply +0x1c)` (D:L191827) finds the roster's row of the reply's
  name -- none for an empty name; the first row whose +0x20 name equals it case-blind (`FUN_00198b80`), else the first
  whose +0x1c account equals the name's `strtol` (`FUN_00191490`) (D:L188026-188056) -- the port's `LobbyClan.find`
  already (ONL-27). Found, it copies the row's online state whole into the page's state -- the status +0x140, the two
  world ids +0x144 / +0x148, the lobby's name +0x14c:64 and the game's +0x18c:64 (D:L191830-191854) -- and its +0x1d0,
  the member's ladder position (`FUN_002e9590` copies it from the reply's +0x1d0, D:L188131; §4; `ClanRosterMember.ladderPosition`),
  over the parsed record's +0x08 (D:L191855: the record sits at the frame's -0x210, so -0x208 is its +0x08 -- the LADDER
  branch writes the row's +0xa8 position there the same way). Not found: nothing copied over the state zeroed at D:L191789, so state 0, NOT CURRENTLY LOGGED
  IN (D:L192014-192017), and the record's own +0x08. The port: `LadderLobbyCommands`' option `clanState(name)`
  (`ClanRosterPresence`: the row's `online` and `ladderPosition`), built in the ladder's mount
  (`packages/viewer/src/ladderLobbyHost.ts`, `connectLadderLobby`) from the session's `LobbyClan` that `frontEnd.ts`
  already hands it as `clan` -- `(name) => clan.find(name)`, read at each reply, so the roster GetClanRoster last wrote;
  `frontEnd.ts` unchanged. `PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` retired (research 269 §2.5): every origin's list held.

## 6. The leader's actions

- **`RemovePlayerFromClan`** (0x27a840, no decompiled block, ELF 0x27a840-0x27a880): the running animation's input string
  (`jal 0x272480` with the context +0x18, or none) -- **the row's key, not the command's "NA"** -- to **`FUN_002e7450`**
  (D:L186901-186943), whose answer is dropped (`addiu v0, zero, 1`): only while the session is up in state 11, the row of
  that name or id: none MP_PLAYER_NOT_FOUND (S:0x3f4130); the session's own account MP_PLAYER_IS_LEADER (S:0x3f4170) --
  never from this page, whose script refuses the leader's row first; else RemovePlayerFromClan of the row's account and the
  clan (`DAT_003df2a0` keeps the account and nothing reads it), the callback **`FUN_002e7580`** (D:L186946-186967): a
  refusal ("MediusRemovePlayerFromClan", S:0x3f4190) MP_PLAYER_NOT_FOUND; a Success MP_SUCCESS (S:0x3f41b0) and the roster
  asked again. Neither event is bound on the page: #493 is the script's, shown at YES whatever the reply.
- **`TransferLeadership`** (0x277430, no decompiled block, ELF 0x277430-0x2774b0): the argument, INPUT_STRING replaced, to
  **`FUN_002e81b0`** (D:L187372-187410), **with no check of the session**: no name or an empty one, or no row of it,
  MP_PLAYER_NOT_FOUND; else TransferClanLeadership (Lobby 0x5c, 0x4c bytes: the session key +0x15, the row's account
  +0x28, its name +0x2c:32; `FUN_006459a0`), the callback **`FUN_002e82a0`** (D:L187413-187431): a refusal
  ("TransferClanLeadership", S:0x3f43e0) MP_PLAYER_NOT_FOUND; a Success MP_LEADERSHIP_TRANSFER_SUCCESS (S:0x3f4400) -- the
  page goes to the member's roster, whose GetClan learns the new leader (§3). The client's leader id is not written here.
- **`DisbandClan`** (0x27a920, no decompiled block: `jal 0x2e6850`, then 1) -> **`FUN_002e6850`** (D:L186500-186518): only
  while the session is up in state 11, DisbandClan (Lobby 0x56, 0x2c bytes: the session key, the clan `DAT_0044f59c` at
  +0x28; `FUN_006457b8`), the callback **`FUN_002e68e0`** (D:L186521-186554): a refusal ("MediusDisbandClan", S:0x3f3f40)
  raises MP_DISBAND_CLAN_FAILURE (S:0x3f3fc0) **with the text "Clan Disband Error: %s"** (S:0x3f3fa0) of the status's name
  (`FUN_002f4300` D:L194356-194523: 4 down to 0 and -954 down to -1000, each a string of the ELF, else "Unknown/Invalid
  Medius Status Code", S:0x3f55d0; `mediusStatusText`), D:L186531-186537 -- the page pops it (`disband_failure`); a Success:
  CLANNAMEVAR "", **Clan_Description " "** (S:0x3f3f18, where the other branches write ""), MEDIUS_CLAN_MESSAGES "No clan
  messages." (D:L186540-186542), the roster emptied and drawn, the ids -1 and the name zeroed (D:L186543-186548),
  MP_DISBAND_CLAN_SUCCESS (S:0x3f3f80, D:L186549-186551) -- the page returns to SOCOM II ONLINE. Our services: the leader's
  disband frees every member (`clans.ts` `disband`); a member's next GetMyClans is NoResult, so his roster's ONSTART raises
  MP_CLAN_DISBANDED (#470, §1).
- **`UpdateClanStats`** (`FUN_00277610` D:L122923-122930) -> **`FUN_002e7d70`** (D:L187223-187252), **with no check of the
  session**: Clan_Description (S:0x3f42f0, added TEMPORARY) -- its text when it holds a string -- into `"%.3d%.12d%s"`
  (S:0x3f4328) of 0, the rating and the tag (`clanStatsRecord`, research 271 §2.3), 256 bytes, UpdateClanStats (Lobby 0x84,
  300 bytes: the clan `DAT_0044f59c` at +0x28, the stats at +0x2c; `FUN_00646660`), the callback **`FUN_002e7e70`**
  (D:L187255-187282): a Success ("MediusUpdateClanStats", S:0x3f4360) sets PLAYER_NAME_AND_TAG (PERMANENT, D:L187272) to
  "[tag] name" in the two colours, a refusal is silent; then **`FUN_002e7f50`** (D:L187285-187328): the rating 0, and with
  eight rows or more the roster sorted and the first eight's mean (D:L187301-187320); its ladder post not sent
  (`CLAN_LADDER_POST_PLACEHOLDER`, research 271 §2.4). `NetCensorText(Clan_Description)` before it is ONL-06's row
  (`NET_CENSOR_TEXT_PLACEHOLDER`, research 153): no filter. **The tag's form**: three characters (the keyboard's cap), shown
  "[TAG] name" at the foot and read back by GetMyClans at the stats' +15 (§3); a variable holding no string sends no tag
  (`FUN_002e7d70` passes a null pointer to `"%s"`; the lobby's own variable always holds one -- GetMyClans and the disband
  write it).

## 7. The transport and the mount

`packages/viewer/src/manageRosterHost.ts`: `fetchManageRosterService(base)` posts `/clan/my-clans` `{ start, pageSize }`,
`/clan/roster` `{ clanId, ladderStatIndex, sortOrder }`, `/clan/remove` `{ playerAccountId, clanId }`,
`/clan/transfer-leadership` `{ newLeaderAccountId, newLeaderAccountName }`, `/clan/disband` `{ clanId }` and
`/clan/update-stats` `{ clanId, stats }` (512 hex digits), each with the session's ticket as the bearer, `credentials:
'omit'`, `cache: 'no-store'`, at the page's own origin (`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`); the
replies checked field by field; 401 the session lost; any other refusal or shape a request never answered; no ticket, no
request. `connectManageRoster(host, { uiVars, clan, service, ticket, sessionLost, event, inputString, lobby, clanMessages,
ladderTotal, ladderPosition })` registers both modules' ten rows over the client's clan and returns them.

**The mount in `frontEnd.ts` -- a hot file's four hunks, applied under the seat's claim** (HANDOFF §3 on `agent/online`, by content):
1. a new import after `./clanMessagesHost`'s: `import { connectManageRoster, fetchManageRosterService, type
   ManageRosterTransport } from './manageRosterHost';`;
2. the session option after `clanMessages?: ClanMessagesTransport;`: `/** ONL-27: SVC-08's GetMyClans, roster, leadership,
   disband and stats and SVC-09's removal (./manageRosterHost); absent, never answered. */ manageRoster?:
   ManageRosterTransport;`;
3. the handles kept: `connectClanMessages(this.host, { ... });` becomes `const clanMessages = connectClanMessages(this.host,
   { ... });` and `connectLadderLobby(this.host, { ... });` becomes `const ladder = connectLadderLobby(this.host, { ... });`
   (the calls' text unchanged), and after the ladder's: `connectManageRoster(this.host, { uiVars: this.uiVars, clan:
   this.world.commands.clan, service: o.manageRoster, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => {
   this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), inputString: (cmd) =>
   this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null, clanMessages, ladderTotal: () =>
   ladder.state().myTotal, ladderPosition: () => ladder.state().myPosition });   // ONL-27 (research 272)` -- ONL-29's owed
   handle (research 274 §8); `ladderPosition` added after the review's F2 (2026-10-13), within the claimed call;
4. the page's `manageRoster: fetchManageRosterService(accountServiceBase(search, win.location, devBuild())),   // ONL-27:
   the rosters, the same base and bearer` after `clanMessages: fetchClanMessagesService(...)`.
`packages/viewer/test/manageRosterHost.test.ts` pins the four as text (the import after the messages' host's, the option,
the two handles and the call after the ladder's, the page's transport). A deep link to SOCOM II ONLINE holds no ticket, so
GetMyClans is not sent there and the foot stays empty (the transport sends nothing without one; the console reaches the
menu only logged in) -- `frontEnd.test.ts`'s deep-link case says so.

## 8. The deviations

1. **The session's own account id** (`CLAN_SELF_BY_NAME_ADAPTATION`, a browser adaptation): learned by the account's name
   from GetMyClans' leader and the roster's rows; QuitClan is not sent while it is unknown.
2. **The replies' sessions** (`CLAN_REQUEST_SESSION_ADAPTATION`, `CLAN_ROSTER_TICKET_ADAPTATION`, browser adaptations):
   GetMyClans' and the roster's replies taken for the latest request under the ticket held; at the first clan row under
   a new ticket the client's clan, its own id and GetClan's state reset (`LobbyClan.reset`; the console's lobby teardown,
   init and login, D:L182261, D:L182267, D:L182792-182795, D:L191037 -- the review's F1, 2026-10-13: a second login on the
   page never inherits the first account's id); the quit's and the leader's actions' replies act only under their ticket.
3. **MP_CLAN_DISBANDED's test** (`CLAN_DISBANDED_OWN_RECORD_READING`): the clan id alone; the own record's clan name is not
   held by the page. Since CLAN-RECORD-POST (item 4) the server's record holds it as the original's posts would have
   left it -- kept through a disband until the account's own next GetMyClans, so a member whose clan was disbanded while
   he was away still has it at his next login; the page reads only the description of its own record (OPT-15), so the
   test is unchanged (a page holding its own record's clan name from that read, before GetMyClans, would settle it).
4. **The own record's post** after a no-clan reply and a quit -- CLAN-RECORD-POST, 2026-10-15, `RECORD_CLAN_FIELDS_READING`
   (server `clans.ts`); `CLAN_RECORD_POST_PLACEHOLDER` retired. **The read.** (a) `FUN_002faa80` (D:L198411-198443),
   only with the session up (+0x7d), builds the record (`FUN_002fab80` D:L198446-198559) and posts it
   (AccountUpdateStats, then UpdateLadderStats type 0 of the rating, research 155 R155.4). Of the build's fields three are
   the client clan's: **+0x40** the clan's name, 32 bytes of 0x44f5a4 (`FUN_00199800`, D:L198533) -- GetMyClans' reply
   +0x24 (D:L187813), zeroed by a no-clan reply, a quit and a disband (D:L187792, D:L187886, D:L186547); **+0x34** the tag,
   12 bytes of the variable `Clan_Description` (S:0x3f5c00; "" when it holds no string, 0x3f5ba8; D:L198534-198541) --
   the clan stats' +15 after a GetMyClans Success (D:L187818), "" after a no-clan reply or a quit (D:L187794, D:L187888),
   " " after the leader's disband (S:0x3f3f18, D:L186541), the leader's keyboard on CLAN TAG; **+0x02 bit 7** the leader
   bit, the session's own account `DAT_0066a4f0` equal to the clan's leader `DAT_0044f5c4` (D:L198542-198547; the reply's
   +0x44, D:L187811; -1 without a clan). The rest of the build is the session's (+0x01 bit 7, the minutes, the hometown,
   the position) and not this row's. The callers of `FUN_002faa80`: the no-clan reply to a request made in a clan
   (D:L187799), the quit's Success (D:L187892), the lobby's state 11 -- 120 s after entering it, then every 300 s
   (`FUN_002ee540` D:L190777-190797) --, the own-stats read of a record not `'E'` (`FUN_002fa8f0` D:L198403-198405) and
   `FUN_002f96f0`'s post at a round's and a match's end (D:L197911, D:L75804, D:L76655) -- every call in the
   decompiled text -- and the description's TextFilter callback (ELF 0x2fa800-0x2fa860, `ownerFields.ts`). None follows a
   create, an accept, a transfer (`FUN_002e82a0` D:L187413-187431), a removal of another (`FUN_002e7580`
   D:L186946-186967) or a disband (`FUN_002e68e0` D:L186521-186554) itself: each reaches the record at the account's next
   lobby post (D:L190789), carrying what its client clan holds then. An accept, a transfer and a removal reach the client
   clan only through the GetMyClans that teaches it (D:L187810-187818); the create (`FUN_002e7b80` D:L187192-187203: the
   clan id, the leader its own id, the name from CLANNAMEVAR, Clan_Description ""), the leader's own disband
   (D:L186540-186548: the ids -1, the name zeroed, Clan_Description " ") and the leader's own tag (CLAN TAG's keyboard into
   Clan_Description, posted by `FUN_002e7d70` D:L187223-187252) reach it from the console's own reply or keyboard, with no
   GetMyClans. (b) In the port, the record is
   the account's 256-byte blob in the service store (`ServiceStore.accountStats`, `stats/accountStatsStore.ts`), written
   by the results queue (`results.ts`, the counters and the rating), the void (`stats/void.ts`) and the owner-fields
   operation (the description alone, `ownerFields.ts`); nothing wrote its clan fields, so they stayed "" and 0. Its
   readers of them: PLAYER INFO's first row "%s %s" of the name and "(Leader)" and its title "[tag] name"
   (`ladderLobbyCommands.ts`, over GetPlayerInfo, `playerInfo.ts`), PLAYER RANKING's rows' tag (the ladder rows' records,
   `ladder.ts`), the modern UI's profile (`modernHttp.ts` over `statsRecord.ts`'s `playerInfoLines`). Not readers: the
   round's "[clan]" strings (`seatClanTag`, the clan store's tag, `CLAN_TAG_AT_SEAT_READING`), the own-stats read of
   OPT-15 (the description), the roster's rows (the description +0x9f). (c) **The design**: the services write the three
   fields, from the clan store (`recordClanOf`: the standing clan's tag at its stats' +15, its name, the leader bit when
   its leader is the account; none, "" "" 0), at the account's own GetMyClans reply (`myClans`) and its own quit's Success
   (`remove` of the caller's own id) -- the moments its console learns the change and posts -- every other byte as
   stored (`withRecordClan`; a blob not `'E'` from the default record, as the owner-fields write). The page posts no
   record (OT.R27: our network, the server authoritative). Not written at the store's change: a member's record would
   move before his console knew, and the record's clan name kept through a disband is what MP_CLAN_DISBANDED's test reads
   for a member who was away (D:L187753, item 3) -- cleared at the disband, that notice could never be given. The
   differences from the console's own posts, (a) to (e) of `RECORD_CLAN_FIELDS_READING`: a Success's fields at the reply
   rather than at the lobby's next post (up to 120 s / 300 s later); the disband's transient " " written only at the
   leader's own disband (LATER 55) and cleared at his next GetMyClans, as the console's no-clan post clears it; an own
   quit that changed no membership writes the standing clan's, where the console posts empty fields; a no-clan reply to a
   request not made in a clan writes the empty fields where the console posts nothing; and (e) the create, the leader's
   own disband and his own tag, which the console's next lobby post carries with no GetMyClans, are written at their own
   Success since LATER 55 (2026-10-21; reading, pending review: `FUN_002e7b80` D:L187192-187203, `FUN_002e68e0`
   D:L186540-186548, `FUN_002e7d70` D:L187223-187252) -- the create's and the tag's from the clan store, the disband's as
   the post carries them (the tag " ", the name zeroed, no leader bit; `DISBANDED_RECORD_CLAN`); a tag post the services
   refuse writes nothing, where the console's Clan_Description keeps the typed tag for its next post. A record write the store
   refuses (stale, busy) is logged and the reply answered as ever (the console's post is a request of its own). The
   ladder post beside it carries
   the rating the server already holds (SVC-13's): nothing to send. A record stored before this change holds "" until its
   account's next GetMyClans.
5. **The long roster's quicksort** (`CLAN_ROSTER_SORT_READING`): the selection sort for every length; 21 rows are past the
   16 seats.
6. **The clan ladder post** after the tag (`CLAN_LADDER_POST_PLACEHOLDER`, research 271): not sent.
7. ~~**PLAYER INFO's CLAN origin** (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`, research 269, kept): not read from the roster yet
   (§5).~~ *[2026-10-15: built by PLAYER-INFO-CLAN -- the roster's row's online state and +0x1d0 through `clanState`
   (§5); the placeholder retired. No difference left.]*

## 9. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_SELF_BY_NAME_ADAPTATION` (ui `screens/manageRosterCommands.ts`) | `'the session\'s own account id learned by its name: the leader\'s in GetMyClans\' reply, a roster row\'s'` | no original: the console's `DAT_0066a4f0` from its login, which the page is never told (§8 item 1) | nothing to settle: a labelled adaptation (a login reply carrying the id would retire it) | adaptation |
| `CLAN_REQUEST_SESSION_ADAPTATION` (ui `screens/manageRosterCommands.ts`) | `"GetMyClans' reply taken under the ticket it was asked with; a new ticket resets the client's clan, its own id and GetClan's state"` | no original: the console's replies die with the connection, its teardown resets the state (`FUN_002df8e0` -> `FUN_002e81a0`, D:L182267), its init the ids (D:L182792-182795), its login the own id (D:L191037) (§8 item 2) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `CLAN_ROSTER_TICKET_ADAPTATION` (ui `screens/manageRosterCommands.ts`; read by `manageRosterLeaderCommands.ts`) | `'a roster reply taken only for the latest request; a quit or a leader\'s action acts only under its ticket'` | no original: as the invitations' chains (§8 item 2) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `CLAN_DISBANDED_OWN_RECORD_READING` (ui `screens/manageRosterCommands.ts`) | `'MP_CLAN_DISBANDED\'s test reads the clan id alone: the own record\'s clan name (0x66a790) not held'` | `DAT_0044f790`'s second term (D:L187753): the parsed own record's clan name, written only by the record's post (§3, §8 item 3) | the own record held whole by the page, with its clan fields served | reading |
| `CLAN_RECORD_POST_PLACEHOLDER` (was ui `screens/manageRosterCommands.ts`) | `'the own stats record\'s post (FUN_002faa80) after a clan change not sent'` | `FUN_002faa80` (D:L198411-198443) after a no-clan reply from a clan (D:L187799) and a quit (D:L187892) | -- | retired 2026-10-15 by CLAN-RECORD-POST: the services write the record's clan fields (§8 item 4), replaced by `RECORD_CLAN_FIELDS_READING` |
| `RECORD_CLAN_FIELDS_READING` (server `clans.ts`; `recordClanOf`, and `withRecordClan` in `stats/accountStatsStore.ts`) | `'the record\'s clan fields written by the services at the account\'s own GetMyClans reply, own quit and own create\'s, disband\'s and tag post\'s Success'` | the console's own post of its record (`FUN_002faa80`, `FUN_002fab80` D:L198533-198547) after a no-clan reply from a clan, a quit, the lobby's 120 s / 300 s and a round's or match's end (§8 item 4): the fields written at the account's own GetMyClans reply and quit, from the clan store, and (LATER 55) at its own create's, disband's and tag post's Success; (a)-(e) of the constant's doc the differences | ONL-32's capture: an account's record read back (PLAYER INFO) between a clan change and its console's next post | reading, pending review |
| `CLAN_ROSTER_SORT_READING` (ui `screens/manageRosterCommands.ts`) | `'the selection sort FUN_002ea240 for every roster; the 21-row quicksort past the 16 seats not transcribed'` | `FUN_002e9b40`'s quicksort from 21 rows (D:L188320-188454), its pivot rotating on `DAT_003df2a8` (§4, §8 item 5) | a roster past 20 rows (none under the 16 seats) | reading |
| `GET_CLAN_STUB_READING` (was ui `screens/worldOfSocomCommands.ts`, research 158) | the no-clan reply at once | GetMyClans | -- | retired 2026-10-13: GetMyClans transcribed (§3) |
| `CLAN_ROSTER_UNHELD_READING` (was ui `screens/invitedPlayersCommands.ts`, research 273) | no roster held | GetClanRoster | -- | retired 2026-10-13: the roster held (§4) |
| `MY_CLAN_MESSAGES_ENTRY_READING` (was ui `screens/clanMessagesCommands.ts`, research 274) | the band not asked | GetMyClans' success | -- | retired 2026-10-13: the success calls `myClanMessages` (§3) |
| `PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` (was ui `screens/ladderLobbyCommands.ts`, research 269) | the clan list not held there | PLAYER INFO's CLAN origin (§5) | a `clanState` hook over `LobbyClan.find` in the ladder module and its mount | retired 2026-10-15 by PLAYER-INFO-CLAN: the hook built (§5), research 269's row retired |
| `CLAN_LADDER_POST_PLACEHOLDER` (ui `screens/createClanCommands.ts`, research 271) | not sent | the tag's `FUN_002e7f50` too (§6) | SVC-11 | kept: listed in research 271, unchanged |
| `ROSTER_LADDER_READING` (server `clans.ts`, research 262) | the stat the request's index, position 1, total 0 | the roster's ladder fields, so the clan rating 0 (§4) | SVC-13's ladder in the roster rows; ONL-32's transcript | retired 2026-10-14 by CLAN-ROSTER-LADDER (research 262's row; research 310 §6 item 1) |
| `ROSTER_ONLINE_STATE_READING` (server `clans.ts`, research 262) | `'the room service's seat; logged in in no room the menus' lobby; offline without a presence hook'` | each roster row's online state (+0x140..+0x1cb), drawn as the ONLINE glyph (`FUN_002e6af0` D:L186647-186653) and copied by PLAYER INFO (§5); asked at the page's entry, GetMyClans' success and a removal's success (D:L124385, D:L187823, D:L186964) (§12) | ONL-32's transcript of a roster | reading, pending review (CLAN-DOT, 2026-10-16: wired by createServices; listed in research 262 §6) |
| `LISTBOX_WRAPPED_LINE_SCALE_READING` (ui `widgets/listbox.ts`; research 117) | `'the wrapped lines at the list\'s SCALE: the column\'s reaches them only at a later set (D:L273490)'` | a WRAPPED_TEXT cell's lines: the column's SCALE is written into the CWrappedText's +0x40 at every draw (0x37adf0, ELF 0x407168), but the lines take it only at the text's set (`FUN_00379f70` D:L273490), made before any draw, and the draw `FUN_003794b0` reads none (§12) | a set of the same cell's text after a draw (the page makes none); no disc WRAPPED_TEXT column carries a SCALE | reading, pending review |
| `ROSTER_PLACE_WITHHELD_READING` (server `clans.ts`) | `'the status to every clanmate; the place (ids, names) only where PROFILE-PRIVACY lets the asker see'` | the seat's ruling (c) on W18.R4 (where a player is, to his friends and roommates only): every clanmate reads the member's status, the place -- the world ids +0x144 / +0x148, the names +0x14c / +0x18c, which PLAYER INFO from the CLAN origin copies whole (§5) -- only one `sees` lets; the original sent the state whole (§12) | the owner's word on PROFILE-PRIVACY for clanmates | reading, pending review |
| `MAIN_MENU_PRESENCE_PLACEHOLDER` (server `ladder.ts`; wired in `bridge.ts`; research 261 §6, 263 §6, 268 §2.8) | `PLAYER_STATUS.InChatWorld` (2) | the status a logged-in account in no room and no game answers: the console on the menus sits in a lobby world the roster's builder (`FUN_002e6af0` D:L186670) and the friend list's (D:L202759-202762) draw MAIN MENU; the value a reimplementation's -- Horizon's session status, logged in and not in a game InChatWorld (`desktop@be557831 Server.Medius/Medius/Models/ClientObject.cs:300-309`, its roster `MLS.cs:1702`) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript of a roster or friend row for a member on the menus | placeholder: a reimplementation's figure |
| `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` (server `ladder.ts`) | `'Medius'` | that account's lobby world's name: both builders test its first six characters against "Medius" (S:0x3f4020, S:0x3f6090) and draw MAIN MENU; Sony's name for the world is not on the disc (Horizon's default channel "Default", `Models/Channel.cs:27` at be557831, would not draw it) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |
| `MAIN_MENU_LOBBY_WORLD_ID_PLACEHOLDER` (server `ladder.ts`) | `-1` | that world's id (+0x144): Horizon's for a client in no channel (`MLS.cs:1706` at be557831, a reimplementation); no list draws it, PLAYER INFO copies it (D:L191830-191854) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |

## 10. The tests, and the runs (unit tests, a dev-disc test and the pages over the machine; no browser, no capture)

- `packages/ui/test/screens/manageRosterScreen.test.ts` (new): the six rows held to the table and registered; SOCOM II
  ONLINE's module without them; GetClan's state machine, the no-clan reply (and MP_CLAN_DISBANDED from a clan), the
  success (the ids, the tag, PLAYER_NAME_AND_TAG, the roster's request, the band), MP_MEDIUS_BECAME_LEADER, the own id by
  name, the session adaptation; GetClanRoster's request, its rows kept and drawn, the cells, the selection sort and its
  swap, the rating (fewer than eight, the mean, a negative sum), the medal of each position, the ticket adaptation;
  IsLeaderOfClan by name, by id, by INPUT_STRING; GetClanMemberInfo; QuitClan and its reply. Over the machine: the
  arrival's GetMyClans, the CLAN row to each roster and to CREATE CLAN; the member's ONSTART, title, heads, rating and rows;
  LEAVE CLAN (#473, #389, #474, the quit, SOCOM II ONLINE); VIEW INFO (#471, #472, GetPlayerInfo of the row's key);
  MP_CLAN_DISBANDED (#470) and MP_MEDIUS_BECAME_LEADER (#469); TRIANGLE and RETURN; the band through GetMyClans; RESPOND TO
  INVITES' member and leader branches.
- `packages/ui/test/screens/manageRosterLeaderScreen.test.ts` (new): the four rows held to the table; the status names and
  the disband's text; the removal (the input string, not found, the own row, a refusal, the session down), the
  transfer (no session check, not found, a refusal), the disband (the success's writes, a refusal's text), the tag post
  (the record, the foot, the rating step), the ticket adaptation. Over the machine: the leader's ONSTART, title, rows and
  the mark; REMOVE PLAYERS (#487, #495, #492, #493, #389, the literal refusal); APPOINT LEADER (#490, #496, #491, the switch
  to the member's roster); DISBAND CLAN (#488, #500, #501, the switch, the failure's text); CLAN TAG (#489, `MPPLAYERNAME`,
  #499, 3 / 15, the fourth refused, the post, the foot); VIEW INFO; RETURN.
- `packages/viewer/test/manageRosterHost.test.ts` (new): each request's path, body, bearer, credentials and cache; the
  replies' shapes; 401 the session lost; no ticket no request; the mount's rows over the transport, the lobby down, no
  transport.
- `tools/test/manageRosterDisc.test.ts` (new, dev-disc): both layouts, bindings, animations' ops, edges and commands off the
  disc; the titles' literals; the seven columns; GetPlayerInfo's origin word; DoSomething's literals; `clan_tag`'s block;
  the ELF's strings, `FUN_002f4300`'s names and the four folded rows' instructions.
- Changed for the stub's retirement: `worldOfSocomCommands.test.ts`, `worldOfSocomScreen.test.ts` (a title),
  `createClanScreen.test.ts`, `invitedPlayersScreen.test.ts`, `clanMessagesScreen.test.ts`, `respondToInvitesScreen.test.ts`
  (a comment), the rig `worldOfSocomRig.ts` (the clan rows over Horizon's no-clan answer by default),
  `tools/test/worldOfSocomEntryCommands.test.ts` (the counts), `packages/viewer/test/worldOfSocomHost.test.ts`.
- With the mount (§7): `packages/viewer/test/manageRosterHost.test.ts` pins its four hunks as text;
  `packages/viewer/test/frontEnd.test.ts`'s deep link hands a NoResult `manageRoster` and asserts no GetMyClans without a
  ticket and the foot empty.
- PLAYER-INFO-CLAN (§5): `packages/ui/test/screens/ladderLobbyScreen.test.ts` -- the CLAN origin's presence lines and
  position from `clanState` (the row's online state, its +0x1d0 over +0x08), a name not on it NOT CURRENTLY LOGGED IN and
  +0x08, the other origins never reading it, the placeholder gone; `packages/viewer/test/ladderLobbyHost.test.ts` -- the
  mount over a real `LobbyClan`'s roster (the name case-blind), GetPlayerInfo of origin 1 through the transport; the
  `friendListScreen.test.ts` line on the retired name dropped.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 11. What is left

- ~~**PLAYER INFO's CLAN origin** (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`): a `clanState(name)` hook in
  `ladderLobbyCommands.ts` over `LobbyClan.find` (the row's online state and +0x1d0) and its line in the mount.~~
  *[2026-10-15: PLAYER-INFO-CLAN -- built (§5), the placeholder retired; LATER 42 closed.]*
- **SVC-11 / SVC-13**: the clans' ladder and the roster rows' ladder fields (the clan rating, the medals, the RANK
  column).
- ~~**The own record's clan fields** (`CLAN_RECORD_POST_PLACEHOLDER`).~~ *[2026-10-15: CLAN-RECORD-POST -- the services
  write them (§8 item 4, `RECORD_CLAN_FIELDS_READING`); MP_CLAN_DISBANDED's second term (item 3) still waits on the page
  holding its own record's clan name.]*
- ~~**A rendered run** of both pages on a lobby-launched persona pair where the merge controller asks for one.~~ *[2026-10-13: rendered -- `e2e/menuClan.spec.ts`, 1 passed at 20261013T1416Z (5dc0a71a2) and
  20261013T1536Z (e0649c544), the clans' plan's Log.]*
- **The proven level**: ONL-32's capture of both pages (PC research 80 H1), with the server's records checked through
  SVC-08 / SVC-09, and its transcript of GetMyClans, the roster, a quit, a removal, a transfer, a disband and a tag post.

## 12. CLAN-DOT: the ONLINE dot's place and its state (2026-10-16)

Web sprint 41 (the plan `../plans/2026-10-16-web-sprint-41-the-owners-lobby-batch.md`, W41.R2; the brief
`../plans/briefs/2026-10-16-s41-clan-dot.md`). The owner's words: "clan player online status (red or green dot) are not
centered in their row, and the online status does not update based on player state". **Reading, pending review.**

- **The dot's place -- cause and fix (written).** The ONLINE column (#316) of `RosterList` is the layout's third text
  column: POSITION 57, TOP_OFFSET 6 and **its own SCALE 1.2** over the list's 0.8 (the leader's: 51, 8, 1.2; `loadDialog`
  of both layouts). The row's draw `FUN_0037ab90` places the cell (D:L273841) and, the column's +0x18 not 0 (D:L273892),
  calls the text content's vtable +0x28 (D:L273893) with that SCALE in `$f12` (`lwc1 $f12, 0x18` at ELF 0x37ad88); the
  text content's vtable 0x407b40 (`FUN_0036b4b0`) holds 0x37adf0 there -- `lw v1, 4(a0); jr ra; swc1 $f12, 0x40(v1)`,
  the cell text's SCALE (+0x40). The LISTBOX widget drew every cell at the list's SCALE (`LISTBOX_CELL_SCALE_READING`,
  research 117), so the glyph (0xa7 / 0xaa of `font_text_01`: 25 x 24 texels, element scale 0.6, baseline 2) was two
  thirds of its size, its foot at the row's foot + 6: with a row's foot at 100 its centre 94 against the name's 90 (the
  leader's 96), at the column's SCALE 88 (90). Every list that draws these glyphs carries the same column -- `dlgFriendList`,
  `dlgIgnoreList`, both rosters and SOCOM II ONLINE's RosterList, IgnoreList and FriendList (and `dlgInvitedPlayers`' off-page
  column at -270, SCALE 0.7) -- each drawn through the widget, so the fix is the widget's: `listboxCellScale`
  (`packages/ui/src/widgets/listbox.ts`), a text column's non-zero SCALE its cell's node scale. The review (2026-10-16)
  read the TIMED_TEXT and WRAPPED_TEXT contents in the bytes: both vtables hold 0x37adf0 at +0x28 (0x4070a0 at ELF
  0x4070c8, 0x407140 at ELF 0x407168), both types list 0x3f8f40 as a base, so the cast (D:L273846) takes them and the
  SCALE is written into them too -- a TIMED_TEXT cell draws at it (built); a WRAPPED_TEXT cell's lines take their scale
  only at the text's set (`FUN_00379f70` D:L273490) and its draw reads none, so they keep the list's
  (`LISTBOX_WRAPPED_LINE_SCALE_READING`, read, no disc column affected: none of either kind has a SCALE). The reading
  retired.
- **The state -- when the console asks.** `FUN_002e69f0` has three callers: `FUN_0027a390` (GetClanRoster, D:L124385), the
  removal's success (D:L186964) and GetMyClans' success (D:L187823); the sets run GetClanRoster only from the member's
  `OnMRosterStart` and the leader's `MRosterLeaderStartData` (ONSTART; the leader's `get_clan_roster` animation is bound to
  no event) and GetClan from SOCOM II ONLINE's `init_screen`. No timer and no lobby event asks it while the page is up:
  the dot is the state at the page's entry, as the server answered it (+0x140, `FUN_002e6af0` D:L186647-186653). The
  page asks at the same three moments (§4), so it is not the stale side.
- **The state -- the server's answer (cause and fix).** `createServices` built the clan service with no presence hook
  (`packages/central/src/bridge.ts`, the `/clan` handler), so every row answered the offline state
  (`ROSTER_ONLINE_STATE_READING`, server `clans.ts`): the dot never turned green. Fixed, as the seat ruled (the merge
  controller's clearance, 2026-10-16):
  - **The presence**: the clan service takes `roomPresence(rooms, loggedIn)` -- in a game InGameWorld, in a room
    InChatWorld, each with its world's id and name, as the ladder's and the friends' rows -- and `loggedIn`
    (`AccountService.loginAt`, a live session) puts a logged-in member in no room in the menus' lobby: the status
    `MAIN_MENU_PRESENCE_PLACEHOLDER` (InChatWorld, a reimplementation's figure: Horizon's session status,
    `ClientObject.cs:300-309` at be557831), the name `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` ('Medius', the six characters the
    builders test: the roster's D:L186670, the friend list's D:L202759-202762, so the original's MAIN MENU), the id
    `MAIN_MENU_LOBBY_WORLD_ID_PLACEHOLDER` (-1). The same `loggedIn` reaches the ladder's, the friends' and the ignore list's
    rows and PLAYER INFO's status, each the port's narrowing to Disconnected until now (`LADDER_ONLINE_STATE_READING`,
    `FRIEND_ONLINE_STATE_READING`, `IGNORE_PLAYER_STATUS_READING`, `PLAYER_INFO_STATUS_READING`, reworded).
  - **The place (ruling (c) on PROFILE-PRIVACY, W18.R4)**: the status goes to every clanmate; the place -- the world ids
    and names, which PLAYER INFO from the CLAN origin copies whole (§5) -- only to one `sees` lets (himself, a roommate, a
    friend); to any other clanmate it is blanked (`ROSTER_PLACE_WITHHELD_READING`). Being on line is not withheld
    (research 268 §1.5 item 4).
  - **The logout**: `AccountService.logout` / `signOut` end the session at once (`end`: its account's entry dropped, the
    room service's `logoff`), and `loginAt` expires an idle session (`SESSION_SILENT_MS_READING`, 300 s) before it
    answers, so the next ask reads the member offline.
- **The tests.** `packages/ui/test/screens/manageRosterScreen.test.ts` (the ONLINE glyph's quads at the column's SCALE),
  `packages/ui/test/widgets/listboxUiVar.test.ts` (`listboxCellScale`); `packages/central/test/clans.test.ts` (the live
  services' `/clan/roster`: a non-friend clanmate not in the room reads the member online with an empty place, a friend
  and a roommate the place, a logged-in member in no room the menus' lobby, a logout offline at the next ask; and
  `ROSTER_PLACE_WITHHELD_READING` over a fake presence), `packages/central/test/ladder.test.ts` (`roomPresence`'s
  `loggedIn`), `packages/central/test/ignore.test.ts` and `packages/central/test/playerInfo.test.ts` (the menus' status, a
  logout Disconnected). The rendered check (`packages/viewer/e2e/menuClan.spec.ts` with `MENU_CLAN_FRAMES`, a playtest
  instrument) is the merge controller's browser slot's.
