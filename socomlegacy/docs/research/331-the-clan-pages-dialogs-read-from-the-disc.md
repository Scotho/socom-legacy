# 331 -- The clan pages' dialogs, read from the disc: captions, commands, keyboards and their caps, and what holds each (ONL-33's clan slice)

- Date: 2026-10-15 (web sprint 19, the clans' finish, wave 6; the plan
  `../plans/2026-10-15-web-sprint-19-the-clans-finish.md`, the row CLAN-DIALOGS-READ, W19.R14; the brief
  `../plans/briefs/2026-10-15-cf6-clan-dialogs-read.md`). Branch `agent/online-dialogs` from `5a90c83b3`.
- Status: **reading, pending review.** Every value of the original below is read from the disc's dialogs through the
  repository's readers -- `tools/dump-online-dialogs.ts`'s `readChapters` (the layouts of `RUN/UI/READERC.ZAR`, the sets
  of `RUN/UIZANIM.ZAR`), `loadDialog` over `parseRdr` (the lists' geometry), `locTable` / `readLocArchive` over
  `RUN/LOCALE/STATES/UIMNLOC.ZAR` (the captions' texts), `decodeTextInput` (each `GetTextInput` block, the command's
  0xAC bytes) and `readSoftKeyboards` (`UiParams.rdr`) -- and held by the dev-disc tests named in each table; the
  keyboard's cap check is cited from the retail decompilation (`socom2_game.elf.decomp.c`, `FUN_<addr>`, `D:L<n>`;
  never pasted). Nothing here is measured on the original running: ONL-32's captures of the clan pages are the proven
  level, not claimed. Decoded names, ids and texts only (RS.R8); no disc bytes are committed.
- Stands on research [271](271-create-clan.md) (CREATE CLAN), [272](272-clan-roster.md) (the two rosters),
  [273](273-clan-invitations.md) (INVITE PLAYERS, RESPOND TO INVITES, the INVITATIONS row),
  [274](274-clan-messages.md) (the MESSAGES band, EDIT NEWS, the message's keyboard), [311](311-clan-ranking.md) (CLAN
  RANKING and the menu's clan podium), [158](158-the-socom-ii-online-menu.md) (SOCOM II ONLINE's rows),
  [119](119-the-software-keyboard.md) (§4 the block, §5 the 30 call sites, §6 the caps) and
  [128](128-the-online-dialogs.md) (ONL-33's chapter and its pin), and does not restate them: this note is the survey
  across them and the record of what holds each value.
- Code as read (nothing changed in `packages/`): `packages/ui/src/keyboard/frontEnd.ts` (`SoftKeyboardFrontEnd.getTextInput`,
  the block decoded from the running command and the keyboard opened with it), `packages/ui/src/keyboard/softKeyboard.ts`
  (`insert`, the caps through `skbWithinCaps`), `packages/ui/src/keyboard/text.ts` (`skbWithinCaps`, `SKB_FIT_READING`);
  the clan screens under `packages/ui/src/screens/` (`createClanCommands.ts`, `manageRosterCommands.ts`,
  `manageRosterLeaderCommands.ts`, `invitedPlayersCommands.ts`, `respondToInvitesCommands.ts`, `clanMessagesCommands.ts`,
  `ladderLobbyCommands.ts`, `worldOfSocomCommands.ts`); the services' fields `packages/central/src/serviceStore.ts`
  (`WIDTHS`) and `packages/central/src/clans.ts` (`CLAN_NAME_CHARS_PLACEHOLDER`).

## 1. The answers

| row | answer | where |
|---|---|---|
| R331.1 | **Every clan dialog is now read at the dialog level by a dev-disc test.** The one with none was CLAN RANKING (`dlgClanLadderLobby.rdr`): its chapter sat only in ONL-33's whole-chapter pin (`onlineDialogsDisc.test.ts`) and its behaviour over the machine (`clanLadderLobbyScreen.test.ts`). `tools/test/clanDialogsDisc.test.ts` now holds its layout, bindings, ops, the `GetLadderInfo` mode at each command's +0x10, its two lists' geometry and its captions' texts. | §3.7 |
| R331.2 | **ONL-33's unknown "which keyboard limits the clan name, clan message and description" is read**: the clan name -- `dlgCreateClan` / `SetVariable`, `MPPLAYERNAME`, titled #224, **13 characters of 31 bytes**; the clan message -- `dlgManageRosterLeader` / `SendClanMessage`, `ChatSkb`, titled #497, **199 of 199** (the recipient edit 14 / 31); the "description" -- the variable `Clan_Description`, which holds the **clan tag** (`dlgManageRosterLeader` / `clan_tag`, `MPPLAYERNAME`, titled #499, **3 of 15**). The clan pages' other keyboards: INVITE PLAYER 14 / 31 (#394) and PLAYER INFO's whisper on both rosters (`PlayerChatSkb`, titled #361, 55 / 55). RESPOND TO INVITES, CLAN RANKING and SOCOM II ONLINE's clan rows open none. *Inference*: the roadmap's "description" is `Clan_Description` (no clan page has another description keyboard; the player's own description is `dlgOnlineOptions` / `SetPlayerDescription`, 63 / 65, research 119 §5, not a clan page). | §4 |
| R331.3 | **The page applies each block's caps, by construction**: the `GetTextInput` row's body (`FUN_0038d770`, D:L283990-284046; research 119 §4) opens the keyboard on the running command's block -- the port's `SoftKeyboardFrontEnd.getTextInput` decodes that block from the command's bytes and opens `SoftKeyboard` with it -- and every character goes through the caps check (`FUN_00396d40`, D:L289553-289608: the text's byte length within the cap when that is above 0, its character count within the other when that is above 0), the port's `skbWithinCaps` in `SoftKeyboard.insert`. **No clan screen sets a cap of its own** (a search of `packages/ui/src/screens/` and `packages/viewer/src/` for a clan input's length finds none). So the disc and the page cannot differ here, and nothing is fixed; the new test types one past each clan block's caps on the page's keyboard over the disc's layouts. | §4 |
| R331.4 | **The services' fields hold what the caps let through**: the clan name 31 bytes into the 32-byte field (`WIDTHS.clanName`) and `CLAN_NAME_CHARS_PLACEHOLDER` equal to the block's 13 (research 262 §6, research 271 §2.1: the original server's own rule stays the placeholder); the message 199 bytes into the 200-byte field (`WIDTHS.clanMessage`); the invited name 31 into the account name's 32. | §4 |
| R331.5 | **The fit can bind before MaxChars** on a real face: the keyboard refuses a character whose text no longer fits the edit's lines (`SKB_FIT_READING`, research 119 §6; `FUN_0039a5b0` D:L291706-291785, the wrap's measure not transcribed). For the 199-character message on `ChatSkb`'s two lines this may come first. It is the keyboard's reading, listed in research 119, not a clan screen's value; the new test types without a face (no width refusal), so it holds the caps alone. | §4, §6 |
| R331.6 | **Every caption id the six clan dialogs name is decoded** (with the popups' buttons and the keyboards' titles), and the texts the port draws come from the same table through the same reader (each machine test compares a drawn text with `UIMNLOC`'s). The literals no id carries are held: "CLAN ROSTER:", "MANAGE CLAN:" (the titles' layout literals), the leader's refusal (60 bytes) and its "Continue", RESPOND TO INVITES' leader refusal (149 bytes), CLAN RANKING's "RANK", and the CLAN row's three help lines (16 and 19 bytes). | §2, §3 |
| R331.7 | **No difference between the disc and the port was found**: nothing is changed under `packages/ui/src/screens/`. `clan_icon_NN` is excluded (W19.R14: none on the disc, R128.13 / R262.4). | -- |

## 2. The captions decoded (UIMNLOC)

The ids each clan dialog names (its chapter's `locs`), with the popups' buttons and the keyboards' titles the chapters do
not list -- both derived off the disc by the test: each `POPUP #<text> buttons #<a>/#<b>` of the chapter's own and
library animations (a chapter's `locs` hold a popup's text, not its buttons: `namedBy`, `tools/onlineDialogs.ts`), and
each block's `Purpose`, `MsgPlayerTitle` and `Action2Title` -- decoded through `UIMNLOC` and trimmed; "/" marks a line break inside a text. CC CREATE CLAN, MR the member's
roster, ML MANAGE CLAN, IP INVITE PLAYERS, RI RESPOND TO INVITES, CR CLAN RANKING. Held, every id and text, by
`tools/test/clanDialogsDisc.test.ts` ("every id the six clan dialogs name, the popups' buttons and the keyboards'
titles"): the texts are literals in the test, read once off the disc and written there, and each run compares the disc
with them. SOCOM II ONLINE's clan rows' texts (#521, #148, #476, #794, #766, #774, #787, #789) are held by the same
file's "the captions' texts (UIMNLOC): #521, ..." and listed in §3.1.

| id | text (trimmed) | dialogs |
|---|---|---|
| #54 | Unaffiliated | MR, ML, IP, RI, CR |
| #67 | RETURN | RI |
| #148 | CLAN RANKING | CR |
| #149 | ¬ BACK | CC, MR, ML, IP, RI, CR |
| #150 | ¦ SELECT | CC, MR, ML, IP, RI |
| #151 | THE PODIUM | CR |
| #217 | CREATE CLAN | CC |
| #218 | Creating a Clan will make you the leader of the Clan.  As the Clan leader, command your Clan. Invite great players to join your Clan and remove the dead-weight players. Send News to your Clan members, informing them of upcoming matches or practice sessions.  Use the Briefing Room's Create Game screen to set your Clan's side to either SEAL or Terrorist and allow other players to challenge your Clan's abilities. | CC |
| #219 | SET CLAN NAME | CC |
| #220 | CREATE CLAN | CC |
| #221 | ¦ Create your new Clan. | CC |
| #222 | ¦ Give your Clan a name. | CC |
| #223 | Clan Creation Failure. It is possible that that name is already in use. ¦ CONTINUE. | CC |
| #224 | Create Clan Name | CC (the keyboard's title) |
| #225 | The Clan name you selected could not be registered due to questionable content in the name. Please select another Clan name and try again. | CC |
| #226 | CONTINUE | CC, MR, IP (a popup's button) |
| #246 | NO | ML, IP, MR, RI (a popup's button) |
| #253 | YES | ML, IP, MR, RI (a popup's button) |
| #314 | RETURN | MR, ML, IP |
| #316 | ONLINE | MR, ML |
| #322 | ¦ Return to SOCOM II Online. | MR, ML, IP, RI |
| #331 | Enter Player Name. ¤ To Accept and Enter Message. | ML (the message keyboard's recipient edit, `MsgPlayerTitle`) |
| #332 | Enter Name of Player to Ignore. | ML (the message keyboard's `Action2Title`) |
| #361 | Enter a Chat Message | MR, ML (the whisper keyboard's title) |
| #377 | INVITE PLAYERS | IP |
| #378 | CLAN ROSTER | IP |
| #379 | INVITED PLAYERS | IP |
| #380 | STATUS | ML, IP, RI |
| #381 | Select a player and ¦ Remove them | IP |
| #382 | INVITE PLAYER | IP |
| #383 | REVOKE INVITE | IP |
| #384 | There may only be a total of 16 members and invitees for any Clan. To invite more people to join your Clan, revoke existing invites or remove current members. | IP |
| #385 | ¦ Invite players. | IP |
| #386 | ¦ Revoke invitations. | IP |
| #387 | There are no outstanding Clan invitations. | IP |
| #388 | Do you really want to remove this player from the invite list? | IP |
| #389 | Action cancelled, ¦ CONTINUE. | MR, ML, IP |
| #390 | That player does not exist. ¦ CONTINUE. | IP |
| #391 | Player has already been invited to join your Clan. ¦ CONTINUE. | IP |
| #392 | That player is already a member of your Clan. /  ¦ CONTINUE. | IP |
| #393 | You are the leader of the Clan; you cannot invite yourself. ¦ CONTINUE. | IP |
| #394 | Enter Name of Player to Invite | IP (the keyboard's title) |
| #395 | ¶ and ¼ to scroll roster list. | CR |
| #459 | LEAVE CLAN | MR, RI |
| #460 | VIEW INFO | MR, ML |
| #462 | Clan Rating: | MR, ML |
| #464 | RANK | MR, ML |
| #465 | MEDAL | MR, ML |
| #466 | MEMBER | MR, ML |
| #467 | POSITION | MR, ML |
| #468 | ¦ Leave your Clan. | MR, RI |
| #469 | You have become leader of the Clan. | MR |
| #470 | Your Clan has been disbanded. | MR |
| #471 | ¦ Browse roster and view player stats. | MR, ML |
| #472 | ¦ View player stats. | MR, ML |
| #473 | Are you sure you want to leave the Clan? | MR |
| #474 | You have successfully left your Clan | MR, RI |
| #475 | EDIT NEWS | ML |
| #476 | INVITATIONS | ML |
| #477 | REMOVE PLAYERS | ML |
| #478 | APPOINT LEADER | ML |
| #479 | DISBAND CLAN | ML |
| #480 | CLAN TAG | ML |
| #483 | INVITED PLAYER | ML |
| #485 | ¦ Edit your Clan news. | ML |
| #486 | ¦ Invite players to join. | ML |
| #487 | ¦ Select players for removal. | ML |
| #488 | ¦ Disband your Clan. | ML |
| #489 | ¦ Modify your Clan tag. | ML |
| #490 | ¦ Appoint a new leader. | ML |
| #491 | You have selected a different Clan leader. If you continue with this selection, you will no longer be the leader of this Clan. Do you wish to continue and appoint a new leader? | ML |
| #492 | Do you really want to remove this player from the Clan? | ML |
| #493 | You have successfully removed the player. | ML |
| #495 | ¦ Remove Player. | ML |
| #496 | Select a member and appoint them as leader | ML |
| #497 | Enter a Message to Send to Clan. | ML (the keyboard's title) |
| #498 | ¦ Edit. · Delete. ¬ Cancel. | ML |
| #499 | Enter the Text for Your Clan Tag. | ML (the keyboard's title) |
| #500 | Are you sure you want to disband your Clan? This action is irreversible. | ML |
| #501 | Disband cancelled. ¦ CONTINUE. | ML |
| #502 | Unable to perform action. Player is Leader. | ML |
| #503 | That message could not be deleted. ¦ CONTINUE. | ML |
| #504 | You cannot post blank messages. ¦ CONTINUE. | ML |
| #505 | That player does not exist. ¦ CONTINUE. | ML |
| #506 | Player has been successfully removed from the Clan. ¦ CONTINUE. | ML |
| #521 | CLAN | CR |
| #724 | RESPOND TO INVITES | RI |
| #725 | CLAN INVITATION | RI |
| #726 | ACCEPT | RI |
| #727 | DECLINE | RI |
| #728 | ¦ Activate the accept invitations list. | RI |
| #729 | ¦ Activate the decline invitations list. | RI |
| #730 | Select invitation and ¦ Accept. | RI |
| #731 | Select invitation and ¦ Decline. | RI |
| #732 | You must leave the your currect Clan before you can join another. ¦ CONTINUE. | RI |
| #733 | I accept the invite. | RI |
| #734 | Invitation accepted.  You have been added to the Clan. ¦ CONTINUE. | RI |
| #735 | Thanks anyway. | RI |
| #736 | Are you sure you wish to leave the Clan? | RI |
| #863 | PLAYER STATS | MR, ML |
| #864 | ½ TEXT CHAT  ¬ BACK | MR, ML |

## 3. The dialogs, one table each

Each row names what is read and **which test holds it** (file and case). "Machine" means the page replayed over the
front-end machine from the disc's records (or the committed fixtures); "disc" a dev-disc test reading the disc itself.
The column "before" says whether a test held it before this row; "new" is `tools/test/clanDialogsDisc.test.ts`.

### 3.1 SOCOM II ONLINE's clan rows (`dlgWorldOfSOCOM.rdr`)

| what | as read | held by |
|---|---|---|
| the rows | `ClanManage` #521, `Clanranking` #148, `invitations` #476 / #794 (`TurnOnInvitations`: #476 and enabled with an invitation, else #794 and disabled; WAIT 1, LOOP) | disc: `worldOfSocomEntryCommands.test.ts` ("is the dialog of research 128 §4.7: ... the eleven rows in N6's order"); new: "the rows: ClanManage #521, ..." and "the CROSS scripts"; machine: `respondToInvitesScreen.test.ts` ("the row's two forms") |
| the help lines | `ClanManageAct`: the set's literals "¦ Create a clan." (16 bytes, no clan), "¦ View clan roster." and "¦ Manage your clan." (19 bytes each, the member's and the leader's); `ClanRankingAct` #789; `invitationsAct` #787 | machine: `worldOfSocomScreen.test.ts` ("the walk: ... each row's ONACTIVATE sets its help line and its pane": the no-clan line and #789); the member's and the leader's lines held by no text before -- new: "the help lines" (the three literals off the set) |
| the CROSS scripts | `create_modify_clan` (StartMusic 1, `.DINK`, IsMemberOfClan / IsLeaderOfClan to dlgManageRosterLeader, dlgManageRoster or dlgCreateClan); `Goto_ClanLadder`, `Goto_Invites` (StartMusic 1, SwitchMenu) | machine: `createClanScreen.test.ts` ("SOCOM II ONLINE's CLAN row with no clan"), `manageRosterScreen.test.ts` ("a member's CLAN row ...", "the leader's CLAN row ..."), `clanLadderLobbyScreen.test.ts` ("CLAN RANKING's CROSS ..."), `respondToInvitesScreen.test.ts` ("its CROSS (Goto_Invites)"); disc: `clanInvitationsDisc.test.ts` ("SOCOM II ONLINE reaches it"); new: "the CROSS scripts" |
| the panes | `RosterList` (CLAN_ROSTER); `ClanLadderTop10` (CLAN_LADDER_LEADERS) at (178, 138), columns 20 / 130, under `ClanTopTenText` #766 and `CategoryText2c` #774; `InvitedPlayers` (MY_CLAN_INVITES); the MESSAGES band (`ClanMessages` on MEDIUS_CLAN_MESSAGES, #775) | machine: `clanLadderLobbyScreen.test.ts` ("the menu's ONSTART ... fills ClanLadderTop10"); disc: `clanMessagesDisc.test.ts` ("the band ..."); new: "the rows", "the menu's podium" (the place) |
| the requests | `get_ladder_top_10`: `GetLadderInfo` modes **1 then 7** at the commands' +0x10 (research 311 §2.2 confirmed); `init_screen`: `CheckMyInvites`, `GetClan`; MP_CLAN_DISBANDED `clan_disbanded` (#470 with #226) | machine: `clanLadderLobbyScreen.test.ts` (mode 7's one request); disc: `clanMessagesDisc.test.ts` ("init_screen ends on GetClan"); the modes off the disc held by no test before -- new: "the menu's podium" |
| the commands | `CheckMyInvites` FUN_0027a3c0, `GetClan` FUN_0027aa60, `GetLadderInfo` FUN_002784d0, `HasClanInvitations` FUN_00277950, `IsLeaderOfClan` FUN_0027a890, `IsMemberOfClan` FUN_0027a910 | disc: `onlineDialogsDisc.test.ts` (the pin); `worldOfSocomEntryCommands.test.ts` (every name answered by a task); new: "the CROSS scripts" |
| keyboards | none | new: (the dialog's set holds no `GetTextInput` the clan rows reach; the menu opens none) |
| UI vars | CLAN_ROSTER, CLAN_LADDER_LEADERS, MY_CLAN_INVITES, MEDIUS_CLAN_MESSAGES | disc: `onlineDialogsDisc.test.ts` (the pin) |

### 3.2 CREATE CLAN (`dlgCreateClan.rdr`)

| what | as read | held by |
|---|---|---|
| captions | #217 (title), #218, #219, #220, #221, #222, #223, #225 with #226, #149, #150; the keyboard's title #224 | disc: `createClanDisc.test.ts` ("the layout: ..."); machine: `createClanScreen.test.ts` ("ONSTART: ... the title #217, ...", "a refused create ... #223", "a name the text filter refuses ... #225 with #226"); texts: new ("every id the six clan dialogs name") |
| commands | `CreateClan` FUN_0027a950, `GetTextInput` FUN_002808d0, `PruneUIVarSpaces` FUN_00278370, `TestUIVar` FUN_00278200 | disc: `createClanDisc.test.ts` ("the animations' ops ...") |
| keyboard | `SetVariable`: `$1` (CLANNAMEVAR), `MPPLAYERNAME`, #224, **13 / 31** | disc: `createClanDisc.test.ts` ("SetVariable's GetTextInput block"); machine: `createClanScreen.test.ts` ("SET CLAN NAME: ... a 14th refused"); new: the caps typed, the byte cap (10 three-byte characters, the 11th refused) |
| UI vars | CLANNAMEVAR, PLAYER_NAME_AND_TAG | disc: `onlineDialogsDisc.test.ts` (the pin) |

### 3.3 The member's roster (`dlgManageRoster.rdr`)

| what | as read | held by |
|---|---|---|
| captions | #459, #460, #314, #462, #464, #316, #465, #466, #467, #468-#474, #389, #322, #863, #864, #149, #150, #54; the title's literal "CLAN ROSTER:" | disc: `manageRosterDisc.test.ts` ("the layout: ..."); machine: `manageRosterScreen.test.ts` ("the member's roster ONSTART ...", "LEAVE CLAN ...", "VIEW INFO (#471) ...", "MP_CLAN_DISBANDED ...", "MP_MEDIUS_BECAME_LEADER ..."); texts: new |
| commands | `GetClan` FUN_0027aa60, `GetClanMessages` FUN_00279790, `GetClanRoster` FUN_0027a390, `GetPlayerInfo` FUN_00279b50 (origin CLAN, +0x10 word 1), `QuitClan` FUN_00278d00, `SendMediusChat` FUN_0027d220 | disc: `manageRosterDisc.test.ts` ("the animations' ops and the edges", "PLAYER INFO from the roster is the CLAN origin") |
| keyboard | PLAYER INFO's `playerinfo_send_message`: CHATMESSAGE, `PlayerChatSkb`, #361, **55 / 55** | disc: `packages/ui/test/keyboard/keyboardDisc.test.ts` (the 30 blocks by layout only); this dialog's block held by no test before -- new: "every GetTextInput of the clan dialogs' own sets" and the caps typed |
| UI vars | CLAN_ROSTER, CLANNAMEVAR, PLAYER_NAME_AND_TAG, ClanRating, the PLAYER INFO set (PLAYER_INFO_NAME_VAR, _VAR1, _VAR2, _DESCRIPTION, _CHAT_NAME_VAR), CHATMESSAGE | disc: `manageRosterDisc.test.ts` (the list and the rating), `onlineDialogsDisc.test.ts` (the pin) |

### 3.4 The leader's MANAGE CLAN (`dlgManageRosterLeader.rdr`), with EDIT NEWS

| what | as read | held by |
|---|---|---|
| captions | #475-#480, #460, #314, #483, #380, #485-#493, #495, #496, #498, #500-#506, #462, #464-#467, #316, #471, #472, #389, #322, #863, #864, #149, #150, #54; the title's literal "MANAGE CLAN:"; the set's literal refusal (60 bytes) and "Continue"; the keyboards' titles #499, #497; the popups' buttons #246 / #253 | disc: `manageRosterDisc.test.ts` ("the layout: the eight rows ...", "DoSomething's two literals"), `clanMessagesDisc.test.ts` ("the layout: EDIT NEWS ...", "the captions' texts (UIMNLOC)": #475, #485, #497, #498, #503, #504); machine: `manageRosterLeaderScreen.test.ts` (REMOVE PLAYERS, APPOINT LEADER, DISBAND CLAN, CLAN TAG, VIEW INFO), `clanMessagesScreen.test.ts` (EDIT NEWS, the post, the two errors); texts: new |
| commands | `DisbandClan` FUN_0027a920, `GetClanMemberInfo` FUN_00279a20, `GetClanRanking` FUN_0027a250, `GetClanRoster` FUN_0027a390, `IsLeaderOfClan` FUN_0027a890, `RemovePlayerFromClan` FUN_0027a840, `TransferLeadership` FUN_00277430, `UpdateClanStats` FUN_00277610, `NetCensorText` FUN_002776e0, `DeleteClanMessage` FUN_0027a1c0, `GetLeaderMessages` FUN_0027a0b0, `ModifyClanMessage` FUN_0027a0e0, `GetInvitedPlayers` FUN_0027a3f0 | disc: `manageRosterDisc.test.ts` ("the animations' ops: ..."), `clanMessagesDisc.test.ts` ("the animations' ops as the set holds them") |
| keyboards | `clan_tag`: Clan_Description, `MPPLAYERNAME`, #499, **3 / 15**; `SendClanMessage`: SEND_CLAN_MESSAGE, `ChatSkb`, #497 (#331 / #332 the recipient's titles), **199 / 199**, 2: 14 / 31; PLAYER INFO's whisper (#361) 55 / 55 | disc: `manageRosterDisc.test.ts` ("clan_tag's GetTextInput block"), `clanMessagesDisc.test.ts` ("SendClanMessage's GetTextInput block"); machine: `manageRosterLeaderScreen.test.ts` ("CLAN TAG (#489): ... 3 characters of 15 bytes": TDEX kept TDE), `clanMessagesScreen.test.ts` ("a post: ... 199 characters of 199 bytes", the request only); the message's 200th character refused and the whisper's block held by no test before -- new: the caps typed (199 'a' then one refused; 99 two-byte characters, the 100th refused) |
| UI vars | CLAN_ROSTER, INVITED_PLAYERS, MEDIUS_MOTD, ClanLeaderMessages, CLANNAMEVAR, PLAYER_NAME_AND_TAG, ClanRating, Clan_Password, the PLAYER INFO set, CHATMESSAGE, SEND_CLAN_MESSAGE (and the pin's "NA") | disc: `manageRosterDisc.test.ts`, `clanMessagesDisc.test.ts`, `onlineDialogsDisc.test.ts` (the pin) |

### 3.5 INVITE PLAYERS (`dlgInvitedPlayers.rdr`)

| what | as read | held by |
|---|---|---|
| captions | #377-#393, #314, #322, #149, #150, #54; #226 (ClanFullError's button), #246 / #253 (the revoke's); the keyboard's title #394 | disc: `clanInvitationsDisc.test.ts` ("the layout: the title #377, ..."; "the animations' ops ..."); machine: `invitedPlayersScreen.test.ts` ("ONSTART: ... the captions #377-#383, #385", "the roster's refusals' captions", "the answers' captions", "REVOKE INVITE ..."); texts: new |
| commands | `CanInviteMorePlayersToClan` FUN_0027a830, `ClanHasInvitations` FUN_00277960, `GetInvitedPlayers` FUN_0027a3f0, `InvitePlayerToClan` FUN_0027a740, `RevokeInvite` FUN_0027a310 | disc: `clanInvitationsDisc.test.ts` |
| keyboard | `invite_player`: PLAYER_INVITE_NAME, `MPPLAYERNAME`, #394, **14 / 31** | disc: `clanInvitationsDisc.test.ts` ("invite_player's GetTextInput block"); machine: `invitedPlayersScreen.test.ts` ("INVITE PLAYER: ...", the request only); the 15th refused held by no test before -- new: the caps typed |
| UI vars | PLAYER_NAME_AND_TAG, CLANNAMEVAR, CLAN_ROSTER, INVITED_PLAYERS | disc: `clanInvitationsDisc.test.ts` ("the layout"), `onlineDialogsDisc.test.ts` |

### 3.6 RESPOND TO INVITES (`dlgRespondToInvites.rdr`)

| what | as read | held by |
|---|---|---|
| captions | #724-#736, #380, #459, #468, #474, #67, #322, #149, #150, #54; the set's literal leader refusal (149 bytes) | disc: `clanInvitationsDisc.test.ts` ("the layout: the title #724, ...", "the leader's refusal is the set's own literal"); machine: `respondToInvitesScreen.test.ts` ("ONSTART with no clan: ... the captions #724-#727, #380, #728", ACCEPT, DECLINE, the member, the leader, the way back); texts: new |
| commands | `AcceptInvitation` FUN_00277550, `DeclineInvitation` FUN_002774c0, `QuitClan` FUN_00278d00, `CheckMyInvites` FUN_0027a3c0, `HasClanInvitations` FUN_00277950, `IsLeaderOfClan` FUN_0027a890, `IsMemberOfClan` FUN_0027a910 | disc: `clanInvitationsDisc.test.ts` ("the animations' ops: ...") |
| keyboards | none | new: "every GetTextInput of the clan dialogs' own sets" (none) |
| UI vars | PLAYER_NAME_AND_TAG, CLANNAMEVAR, MY_CLAN_INVITES | disc: `clanInvitationsDisc.test.ts`, `onlineDialogsDisc.test.ts` |

### 3.7 CLAN RANKING (`dlgClanLadderLobby.rdr`)

| what | as read | held by |
|---|---|---|
| captions | `bar_title` #148, `TopTen_text` #151, `player_text_lft` / `_rt` #521, `rank_text` the layout's literal "RANK", `desc_low_text` #395, `InfoTextT` #149; `txtClanName` (CLANNAMEVAR, #54's text by default); no BUTTON; the chapter's ids 54, 148, 149, 151, 395, 521 | machine: `clanLadderLobbyScreen.test.ts` ("the page's ONSTART ...": #148, #151); disc before: the pin only (`onlineDialogsDisc.test.ts`) -- new: "the layout: ...", "the captions' texts (UIMNLOC): ..." |
| bindings and ops | ONSTART `PulseArrows`, `net_monitor`, `get_ladder_top_10` (ClearUIVar(CLAN_LADDER_LEADERS), GetLadderInfo, DisableButton(LadderTop10)), `ActivateMedalOfMerit`; TRIANGLE `goto_menu(PREVIOUS_SCREEN)`; ON_LADDER_REFRESH `RefreshArrows`; L1 `ladder_up`, L2 `ladder_down` (each bound twice), UP / DOWN to NONE; no CROSS; no edge but the library's | machine: `clanLadderLobbyScreen.test.ts` (ONSTART, L1 / L2, RefreshArrows, TRIANGLE); disc before: the pin only -- new: "the bindings: ...", "the animations' ops ..." |
| the modes | `GetLadderInfo` at +0x10: the entry **6**; L1 **8** (the IF's condition) then **10**; L2 **9** then **11**; `RefreshArrows` **9** then **8** (both conditions) -- the module's `LADDER_INFO_MODE`. A condition's command sits inside its IF record from +8 (`conditionTokens`, the runtime's reader), so a read of the statements alone finds only 10 and 11 | machine: `clanLadderLobbyScreen.test.ts` (the requests each mode sends); off the disc held by no test before -- new: "the modes at each GetLadderInfo's +0x10" |
| the lists | `LadderList` (CLAN_LADDER_RANKING) at (320, 90), 350 x 400, SPACING 19, LEFT_MARGIN -15, TOP_MARGIN 22, PADHOG, NOSELECT, columns 50 / 130 / 820 (the medal image, 16 x 16 at TOP_OFFSET -20, over `null.tif` and the five medals); `LadderTop10` (CLAN_LADDER_LEADERS) at (23, 90), 250 x 220, SPACING 19, LEFT_MARGIN 25, TOP_MARGIN 30, columns 10 / 90 | machine: `clanLadderLobbyScreen.test.ts` (the columns' positions, the medal textures, the cells off the frame); the place, size and margins off the disc held by no test before -- new: "the lists as laid out" |
| commands | `GetLadderInfo` FUN_002784d0, `ClearUIVar` FUN_002780a0, `DisableButton` FUN_0027c160 | new: "the animations' ops ..."; disc: `onlineDialogsDisc.test.ts` (the pin) |
| keyboards | none | new: (none) |
| UI vars | PLAYER_NAME_AND_TAG, CLANNAMEVAR, CLAN_LADDER_RANKING, CLAN_LADDER_LEADERS (`ClanLadderRanking` and `TotalClans` are named by no layout or set, research 311 §3.1) | new: "the layout: ..." |

### 3.8 The clan messages' pages

The clan messages have no dialog of their own: the MESSAGES band is SOCOM II ONLINE's (`motd`'s children, #775 / #776),
the leader's list and post are MANAGE CLAN's EDIT NEWS (§3.4), and the member's roster asks the pane at its ONSTART
(`GetClanMessages`, §3.3). All held by `tools/test/clanMessagesDisc.test.ts` (the band, the leader's page, the list's
geometry, `SendClanMessage`'s block, the captions' texts #475, #485, #497, #498, #503, #504, #775, #776; the command
`SendClanMessage` FUN_002797f0 bound by no dialog) and `packages/ui/test/screens/clanMessagesScreen.test.ts` over the
machine. Nothing found unheld.

## 4. The keyboards and their caps (ONL-33's unknown)

| page / animation | `UiVar` | layout | title | caps (chars / bytes) | the page's cap | the service's field |
|---|---|---|---|---|---|---|
| CREATE CLAN / `SetVariable` | `$1` (CLANNAMEVAR) | `MPPLAYERNAME` | #224 | **13 / 31** | the block's (R331.3) | `WIDTHS.clanName` 32 (31 + NUL); `CLAN_NAME_CHARS_PLACEHOLDER` 13 |
| MANAGE CLAN / `clan_tag` | Clan_Description (the tag) | `MPPLAYERNAME` | #499 | **3 / 15** | the block's | the clan stats' text from +15 (`consoleClanStats`, 256 bytes) |
| MANAGE CLAN / `SendClanMessage` | SEND_CLAN_MESSAGE | `ChatSkb` | #497 (#331 / #332) | **199 / 199**, 2: 14 / 31 | the block's (the fit, R331.5) | `WIDTHS.clanMessage` 200 (199 + NUL) |
| INVITE PLAYERS / `invite_player` | PLAYER_INVITE_NAME | `MPPLAYERNAME` | #394 | **14 / 31** | the block's | `WIDTHS.accountName` 32 |
| both rosters / `playerinfo_send_message` | CHATMESSAGE | `PlayerChatSkb` | #361 | **55 / 55** | the block's | the chat's (ONL-23's) |

Held, off the disc, by `tools/test/clanDialogsDisc.test.ts` ("every GetTextInput of the clan dialogs' own sets", "the
keyboards' titles (UIMNLOC)", "the services' fields hold what the caps let through") and typed on the page's keyboard
over `UiParams.rdr`'s layouts ("the page's keyboard applies each clan block's caps", one case per block: MaxChars + 1
ASCII characters leave MaxChars; a wider character repeated stops at `min(MaxChars, floor(MaxBytes / width))`).

## 5. What changed with this row

- `tools/test/clanDialogsDisc.test.ts` (new, dev-disc): §3.1, §3.7, §2's map and §4. The tests are the read's holders.
  The caption map of §2 and the title #361 were read once off the disc (a throwaway read through the same readers, not
  committed) and written into the test as literals; the test compares the disc with them. The first run corrected the
  draft in three places, none of them a value of research 271-274 or 311: PLAYER INFO's whisper block is titled #361
  (the draft said none); the modes in L1's, L2's and `RefreshArrows`' IF conditions are read through `conditionTokens`
  (the draft's statement-only read found 10 and 11 alone; with the conditions, 8 / 10, 9 / 11 and 9 / 8, as research 311
  §2.2 has them); the CLAN row's help literals are the set's names starting with "¦" (a length filter also caught the
  widget name `BriefingRoomName`).
- `docs/PROCESS.md`: the web notes' range to 71-331.
- Nothing under `packages/`: the survey found no value in a clan screen that differs from the disc's.

## 6. Placeholders and readings

None new. Named here and unchanged: `CLAN_NAME_CHARS_PLACEHOLDER` (server `clans.ts`, research 262 §6: the original
server's clan-name rule; the client's cap read again in §4) and `SKB_FIT_READING` (ui `keyboard/text.ts`, research 119
§6: where the fit binds before the caps; ONL-32's capture of a long clan message settles it).

## 7. What is left

- **The proven level**: ONL-32's captures of each clan page (PC research 80 H1's clan rows), each caption compared with
  §2 and each keyboard's last accepted character with §4 -- the owner's window (W19.R13), not claimed here.
- `clan_icon_NN`: excluded (W19.R14); roadmap 05's ONL-33 line is CLAN-ROADMAP-SYNC's.
