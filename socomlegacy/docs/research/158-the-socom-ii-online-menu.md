# 158 -- The SOCOM II ONLINE menu (`dlgWorldOfSOCOM`): its rows, SERVER NEWS, and the rows whose pages are parked (ONL-09)

Written 2026-10-03 for ONL-09 (`../roadmap/05-online-front-end.md` "ONL-09"), wave 2 of sprints 16 and 17
(`../plans/2026-10-02-online-path-target.md`, OT.R16; OT.R6, OT.R8). Sources: `dlgWorldOfSOCOM.rdr`'s layout and set as
the repository's readers decode them (`tools/dump-dialogs.ts --dialog dlgWorldOfSOCOM.rdr --tree`,
`tools/dump-online-dialogs.ts --dialog dlgWorldOfSOCOM.rdr`; ONL-33's pin `tools/test/onlineDialogs.pinned.json`);
`global_valves.rdr` of `RUN/READERC.ZAR`; the US disc's `UIMnLOC.rdr`; the retail decompilation
`socom2_game.elf.decomp.c` (`D:L<n>` its line, `FUN_<addr>` its functions; cited, never pasted); the retail ELF's
strings and words by address (`tools/elfImage.ts`); our Horizon's source read as files (`server/horizon-server/` of the
PC project, cited at the `ref/desktop` pin be557831); the archived captures `A_44_lobby.png` and `A_45_lobby2.png`
(`logs/parity/s4_pcsx2/`, PCSX2 against our local Horizon), `09_lobby.png` and `09_lobby_no_news.png`
(`logs/parity/s17_q2_logoff/online1/`, the recomp) and the harness's caption crop `scripts/parity/refs/lobby_news.png`.
**No server but the stream's own local match server was contacted** (R293). It stands on research 104 (valves and UI
variables), 107 (the command table), 115-117 (the dialog host, input, the widgets; 116 §17 the focus rule), 128 (the
online dialogs, §4.7 and §4.15), 133 (SVC-05's texts), 152 (the music), 155 §3 (where a rank shows) and 156 (the
agreement and the invitations row's answer), and does not restate them.

The code: `packages/ui/src/screens/worldOfSocomCommands.ts` (`GetMediusAnnouncements` and its reply, the lobby
session's variables, the launch's valves, four stubs, the parked rows' gate, `WORLD_OF_SOCOM_ENTRY_COMMANDS`);
`packages/ui/src/widgets/widgetSet.ts` (a dialog's TELETYPE ticked and commanded); `packages/viewer/src/worldOfSocomHost.ts`
(the announcement's service, the session's mount); `packages/viewer/src/frontEnd.ts` (eleven lines: the two options,
the imports, the session's `world`, the mount, `onLaunch`, the page's two services). The tests:
`packages/ui/test/screens/worldOfSocomCommands.test.ts` (25), `worldOfSocomScreen.test.ts` (23: the machine over the
disc's own layout and set through `worldOfSocomRig.ts`, from the disc or the committed fixtures -- it runs in CI),
three cases in `packages/ui/test/widgets/objects.test.ts`, `packages/viewer/test/worldOfSocomHost.test.ts` (8), three
cases in `packages/viewer/test/frontEnd.test.ts`, `tools/test/worldOfSocomEntryCommands.test.ts` (11; the pin, and the
disc or the fixtures) and `tools/test/worldOfSocomScore.test.ts` (3; the dev host's disc and captures). Confidence:
**reading, pending review** for every transcription; the frames' chrome scores are **met**, the news text and the
medal are scored apart and **not met**, each for a cause that is not the drawing's (§5).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R158.1 | **The dialog runs from its record and set**: 67 objects and 28 controls on `multplay_back.tif`; the eleven rows are BUTTONs at x 16, y 66..367 (155 x 29); seven LISTBOXes and four text controls share the pane; the SERVER NEWS panel is a BUTTON (`popup_motd_button`, 460 x 320) over a dimmer. Every row's help line and pane is its ONACTIVATE animation's | the layout; `worldOfSocomScreen.test.ts` | §1, §2.4 |
| R158.2 | **ONSTART is eight animations**, in the bindings' order: `TurnOnInvitations`, `init_screen`, `PulseArrows`, `CallMusic`, `net_monitor` (UIanim), `OnBriefingRoomstart`, `get_ladder_top_10`, `get_friend_list`; the test pins their 24 dispatches | the set | §2.1 |
| R158.3 | **`PopupNewsOnce` is a valve, not a command**: `init_screen` tests it against 0, sets it to 1 and activates the popup's button; else it hides the popup and disables the button. `global_valves.rdr` declares it 0 with no type word (PERM), so it is 0 at every launch and SERVER NEWS shows once a launch -- again after the logoff's reboot | the set; `RUN/READERC.ZAR` | §2.5, §3.4 |
| R158.4 | **The focus**: the build activates `LadderTop10` (the first control built enabled); the next tick applies the queue newest first. First arrival: `ActivateButton(newsandmessages)` then `ActivateButton(popup_motd_button)`, two SELECTION sounds, the focus on `popup_motd_button`. Second arrival (`PopupNewsOnce` 1): one activation, one SELECTION, the focus on `newsandmessages` -- pinned | research 116 §17; the test | §2.2 |
| R158.5 | **CROSS on arrival closes SERVER NEWS in the original**: the recomp's harness takes `09_lobby.png`, presses CROSS until the caption is gone and takes `09_lobby_no_news.png` with MESSAGES lit. Only `popup_motd_button` binds a CROSS that hides the panel, so the first arrival's focus is seen in a frame pair, not on the reading alone; the port's CROSS gives that frame at 99.4 | `desktop@be557831:tools_py/parity/online_login_ours.py:1891-1899` | §2.2, §5 |
| R158.6 | **SERVER NEWS and MESSAGES show one text**: `popup_motd_text` and `motd` both name the UI variable MEDIUS_MOTD (the block's unknown). `GetMediusAnnouncements` fills it: `FUN_0027d1f0` -> `FUN_002f7710` (the retrieving text, Lobby 0x4b with the application id 0x28e8), the reply `FUN_002f77a0` (the text, a "\n", then held texts that fit 800 bytes; a failure "No server messages.") | the layout; D:L125862-125869, D:L196520-196627 | §2.6, §3.1 |
| R158.7 | **A fresh match server shows SERVER NEWS with no line**: SVC-05 answers a success with an empty text when the store holds no announcement, as our Horizon does, and the client writes the empty text and the separator. What the panel says is the owner's to write (H73) | `serverTexts.ts`; research 133 §5 | §3.1, §5 |
| R158.8 | **The name at the foot is PLAYER_NAME_AND_TAG, not PLAYERNAMEVAR**, and it is written by `GetClan`'s reply (`FUN_002e8bd0`): "%s" of the account's name with no clan, "#C@ [%s] #C%s" of the tag and the name with one. So `init_screen`'s `GetClan(NA)` must answer for the name to show: stubbed with the reply for a player in no clan *[2026-10-13, ONL-27: GetMyClans in place of the stub, both branches, research 272 §3]* | the layout; D:L187723-187850 | §2.8, §3.2 |
| R158.9 | **The star in the captures is `Medal_Black`**, shown by the set's `DisplayMedalOfMerit` on ON_LADDER_REFRESH when `LadderMedalOfMerit` is 5. The ladder is parked: no request, no event, no medal -- what the original draws with no ladder answer. Who sets the valve and raises the event is not decoded here (ONL-34) | the set; research 155 §3 | §2.8 |
| R158.10 | **`RefreshRoomList` is aimed at the node `ROOMLIST`**: ONL-33's listing prints it `ROOMLIST.op16` (`.op5`, `.op3`), but the byte at +6 is a name's index (below 0xE8), the name RefreshRoomList. The pin's `commands` list lacks the row for that reason: the chapter dispatches 32 rows, not 31 | the set; `worldOfSocomEntryCommands.test.ts` | §2.3 |
| R158.11 | **Two rows work today**: BRIEFING ROOMS (CROSS: `.DINK`, the focus to the room list -- no rows, so it takes no pad) and REFRESH LIST (CROSS: `.DINK`, `RefreshRoomList`, the row greyed and the focus on OPTIONS for five seconds, a 5..1 count beside the caption). `RefreshRoomList` is the one handler ONL-11 replaces | the set; the test | §2.4, §3.2 |
| R158.12 | **Eight rows' pages are parked and their CROSS is inert** (OT.R8): AUTOPLAY, CLAN, PLAYER RANKING, CLAN RANKING, INVITATIONS, OPTIONS, FRIENDS, IGNORE. A binding gate takes the start of each one's CROSS animation; nothing of the script runs. Each is owed to its task *[2026-10-13: CLAN unparked by ONL-26 (research 271 §3), INVITATIONS by ONL-28 (research 273 §4)]* | `PARKED_ROWS` | §2.4, §7 |
| R158.13 | **NO INVITATIONS**: `TurnOnInvitations` asks `HasClanInvitations` every second; SVC-09a's rows, mounted on the session here, answer none, so the row reads #794 and is disabled -- passed over by the walk. Unmounted, the table's default answer lit it | research 156 §2 | §2.4, §4 |
| R158.14 | **AUTOPLAY is a pane of this dialog**: the fields #770-772 with the filter valves' texts -- on a fresh card #655 ANY MAP, #661 ANY NUMBER OF PLAYERS, #669 ANY SPEED ( 65000 ), `GameSpeedFilter` being 65000 in `global_valves.rdr` -- and #783 typed out by the TELETYPE `O_filters`, which nothing ticked in a dialog before this task | the set; `widgetSet.ts` | §2.7 |
| R158.15 | **The music**: `CallMusic` starts MUS_ONLINE_MENU unless `StartMusic` is 1; every exit that keeps the stream sets it (the rows' scripts, BRIEFING ROOMS and REFRESH LIST), `Goto_Options` and `exit_lobby` stop the stream instead. Pinned: one start on arrival, none on an arrival with `StartMusic` 1, one more with 0 | research 152 R152.2, R152.7 | §2.9 |
| R158.16 | **The score**: chrome 99.7 (`09_lobby`), 99.9 (`A_44`), 99.5 (`09_lobby_no_news`), 99.8 (`A_45`); with each capture's own announcement served, whole frames 99.4-99.8 and text regions 99.1-99.8; the caption crop 98.3. Not met: the news text with a fresh server's empty announcement, and the medal (71.1 / 71.3) | `worldOfSocomScore.test.ts` | §5 |

## 1. The dialog

`RUN/UI/READERC.ZAR` `dlgWorldOfSOCOM.rdr`: `LIBRARY` `ui/assetlib/uimp`, background `multplay_back.tif`, `FONT`
`font_text_01`, `SCRIPT_LIBRARY` `dlgWorldOfSOCOM.rdr` and `uianim.rdr`; 95 widgets -- 67 objects and 28 controls.

- **The chrome** (objects): the title `bar_title` #764 at (30, 65) in `font_titlebar_01`; `InfoTextT` #149 and
  `InfoTextX` #150 at the foot; `playername`, a WRAPPEDTEXT at (45, 432) on the UI variable PLAYER_NAME_AND_TAG
  (PERMANENT, `DISPLAY_ONE_LINE`), with five 16 x 16 medal images as its children at (-23, -23); the help bar
  `DescFieldTop` (176, 65; 450 x 32) and `DescriptionText` (185, 94); the network dot `net_conn_ind_Yel` /
  `net_conn_ind_blue` (`NetMonY.tif`, `NetMonB.tif`), children of a node `letterbar` the layout does not have.
- **The pane's objects**: the room list's header (`DescFieldTop2`, #767-769); AUTOPLAY's fields (`which_map` #770
  with its children #771 and #772 and three 293 x 28 field backs, `game_type_desc` on `MissionNameUIVar` with
  `game_player_desc` and `game_speed_desc`, and the TELETYPE `O_filters` at (190, 247): MAXLENGTH 370, MAXHEIGHT 170,
  INTERVAL 1100, SPACING 20, PULSERATE 10, FADECURSOR); the podium's header (`BlueBack`, #765, #766); five column
  header bands (`DescFieldMid` .. `DescFieldMid5` with #316, #466, #227, #317, #774, #464); the join strip
  (`Progress_dummy` and its eighteen children, `JoiningAnim`).
- **The controls, in file order -- the focus ring**: `MainWindow` (IMAGE); the LISTBOXes `LadderTop10`
  (LADDER_LEADERS), `ClanLadderTop10` (CLAN_LADDER_LEADERS), `RosterList` (CLAN_ROSTER), `IgnoreList` (IgnoreListVar),
  `FriendList` (FriendListVar), `ROOMLIST` (ROOMLISTVAR; six columns, four of them medal images) and `InvitedPlayers`
  (MY_CLAN_INVITES); `motd` (WRAPPEDTEXT on MEDIUS_MOTD at (205, 125), 390 x 99, SCALE 0.9) with its children
  `ClanMessages` (MEDIUS_CLAN_MESSAGES), a band and `ClanMessageText` #775; the eleven BUTTONs `newsandmessages` #776,
  `briefingrooms` #777, `autoplay` #778, `ClanManage` #521, `ranking` #396, `Clanranking` #148, `invitations` #476,
  `refreshlist` #407, `options` #702, `friends` #315, `Ignore` #370 (x 16; y 66, 97, 127, 157, 187, 217, 247, 277,
  307, 337, 367; 155 x 29; NORMAL `brown_back.tif`, ACTIVE `brown_back_real.tif` with a text glow, DISABLED text
  50, 50, 50); `FiveCount`, a TEXT child of `refreshlist`; `popup_motd` (`LittleBlack.tif`, 660 x 600 at 0.8: the
  dimmer), `popup_motd_description` #779, `popup_motd_button` (a BUTTON, 460 x 320 at (105, 85) in the dimmer, its
  caption #780, `popupOp.tif` in all four states) and `popup_motd_text` (WRAPPEDTEXT on MEDIUS_MOTD, 400 x 197).

The popup's button looks the same in every state, so no frame can show it lit; R158.5 is the evidence for the focus.

## 2. The set

### 2.1 ONSTART

Eight animations, started in the bindings' order; `worldOfSocomScreen.test.ts` pins the dispatches of the first three
ticks (24):

1. `TurnOnInvitations`: `IF HasClanInvitations` -> EnableButton and #476, else #794 and DisableButton; WAIT 1; LOOP.
2. `init_screen`: the `PopupNewsOnce` branch (§2.5); `OptionsMenuChanged` = 0; `GetMediusAnnouncements`,
   `CheckMyInvites`, `RefreshRoomList` at `ROOMLIST`; a second sequence that waits 30 s and asks the room list again,
   forever; `GetClan` last -- it answers 0 until its reply, which holds only this sequence's end.
3. `PulseArrows`: an opacity loop on `arrow_up`, a node the layout does not have.
4. `CallMusic` (§2.9).
5. `net_monitor` (UIanim.rdr): the blue dot's opacity 0.99 <-> 0.1 every 0.5 s; eight `net_send_ind_*` /
   `net_recv_ind_*` nodes this layout does not have.
6. `OnBriefingRoomstart`: the join strip reset, `playername` shown, `NoExitState` 0, the lists and `motd` disabled,
   `ActivateButton(newsandmessages)`.
7. `get_ladder_top_10`: the five medals hidden, `GetLadderInfo` twice -- modes 1 and 7 at the command's +0x10.
8. `get_friend_list`: `GetFriendsList`, `GetIgnoreList`.

### 2.2 The focus on each arrival (R158.4, R158.5)

By research 116 §17's rule the build's own focus is `LadderTop10`, the first control built enabled (`MainWindow` is
an IMAGE), activated with no SELECTION. The ONSTART scripts' `ActivateButton` records are applied at the next tick,
newest first:

| arrival | queued, in order | applied | SELECTION sounds | settled focus |
|---|---|---|---|---|
| the first of a launch (`PopupNewsOnce` 0) | `popup_motd_button` (`init_screen`), `newsandmessages` (`OnBriefingRoomstart`) | `newsandmessages`, then `popup_motd_button` | 2, on the tick after the build | `popup_motd_button` |
| any later one (`PopupNewsOnce` 1) | `newsandmessages` | `newsandmessages`; `init_screen` disables `popup_motd_button` | 1 | `newsandmessages` |

On the first arrival `newsandmessages`' ONACTIVATE (`OnNewsbtn`) still runs: the help line #781 is set under the
panel, hidden with its bar by `init_screen`. On the popup UP and DOWN scroll its text (`scroll_popup_news_*`: ops 4
and 5 of `popup_motd_text`, a SPACING a press, bound on the press and on DOWN held); LEFT, RIGHT, L1 and L2 are bound
to animations named `none` / `NONE`, which exist in no set: nothing. CROSS runs `popup_motd_response`: the dimmer and
the caption hidden, the help bar shown, the button disabled, `ActivateButton(newsandmessages)`.

**What a capture says.** The recomp's harness (`desktop@be557831:tools_py/parity/online_login_ours.py:1891-1899`,
`press_until_gone` at `:1223-1234`) waits for the SERVER NEWS caption, takes `09_lobby.png`, presses CROSS until the
caption is gone and takes `09_lobby_no_news.png` two seconds later: MESSAGES lit, the panel gone. Only
`popup_motd_button` binds a CROSS that hides the panel (`newsandmessages` binds none), so the frame pair shows the
first arrival's focus where no single frame can. It is a pair of frames, not a trace of the focus: the level stays a
reading. The later arrival has no capture (ONL-32's walk).

### 2.3 A row aimed at a node (R158.10)

A `ui::UI_COMMAND` with a node carries at +6 either the node's op + 0xE8 or, below 0xE8, an index into the
animation's names -- a table row called with that node (research 107: the node's object is asked first, then the
table by the name). ONL-33's listing prints both as `<node>.op<n>`. In this set the second form occurs once, four
times: `ROOMLIST.op16` (`init_screen`, twice), `.op5` (`refresh_roomlist`), `.op3` (`OnBadJoinState`,
`OnJoinRoomFailure`) are names[16], [5] and [3] of their animations, each `RefreshRoomList`; the row's body reads the
node's object to hand its list to the request (`FUN_0027daa0` D:L126149-126170). A LISTBOX's ops stop at 11, so the
object declines and the row runs. `ONLINE_LOBBY_STATE.op0` (`join_room`) and `subtitles.op0`
(`refresh_filter_screen`) are the other kind of oddity: names[0] is `NA`, no row -- the dispatcher answers 1.

The pin's `commands` list is built from node-less commands and so lacks `RefreshRoomList`:
`WORLD_OF_SOCOM_ENTRY_COMMANDS` has 32 rows against the pin's 31, and the test holds the four animations' names to the
disc. The tool's listing is ONL-33's to correct (§7).

### 2.4 The rows

Each row's ONACTIVATE hides and shows the pane's nodes and sets `DescriptionText`. "State" is what CROSS does on the
page today.

| row | caption | ONACTIVATE | help line | pane | CROSS, as the set has it | state | owed to |
|---|---|---|---|---|---|---|---|
| `newsandmessages` | #776 MESSAGES | `OnNewsbtn` | #781 | `motd`: the news, the #775 band, the clan messages' text | none bound; L1 / L2 (the screen's) scroll `motd` | as the original; the band's text empty | ONL-29 (the clan messages) |
| `briefingrooms` | #777 BRIEFING ROOMS | `OnBriefingRoombtn` | #782 | `ROOMLIST` under #767-769 | `PressBriefingRoombtn`: `StartMusic` 1, `.DINK`, `ActivateButton(ROOMLIST)`, `EnableButton(ROOMLIST)`, #782 | runs; the list has no row | ONL-11 (the rooms, entering one) |
| `autoplay` | #778 AUTOPLAY | `aplaytext` | #784 | §2.7 | `join_random_game`: `StartMusic` 1, `.DINK`, popup #801 kept, the join strip, WAIT 0.5, `JoinMPGame(RANDOM)` | gated | ONL-15 |
| `ClanManage` | #521 CLAN | `ClanManageAct` | a literal: "Create a clan." with no clan, "View clan roster." a member, "Manage your clan." the leader | `RosterList` under #316 / #466 / #227 | `create_modify_clan`: `StartMusic` 1, `.DINK`, `SwitchMenu` to `dlgCreateClan`, `dlgManageRoster` or `dlgManageRosterLeader` | gated; the help line is the no-clan one *[2026-10-13: runs -- ungated by ONL-26 (research 271 §3); the member's and the leader's help lines and pages since ONL-27's GetMyClans (research 272 §3)]* | ONL-26, ONL-27 |
| `ranking` | #396 PLAYER RANKING | `rankingAct` | #788 | `BlueBack` #765, `LadderTop10` under #464 / #317 | `Goto_Ladder`: `StartMusic` 1, `SwitchMenu(dlgLadderLobby.rdr)`; no sound | gated; the list has no row | ONL-30 |
| `Clanranking` | #148 CLAN RANKING | `ClanRankingAct` | #789 | `BlueBack` #766, `ClanLadderTop10` under #464 / #774 | `Goto_ClanLadder`: `StartMusic` 1, `SwitchMenu(dlgClanLadderLobby.rdr)`; no sound | gated; the list has no row | ONL-30 |
| `invitations` | #794 NO INVITATIONS (#476 with one) | `invitationsAct` | #787 | `InvitedPlayers` under #774 | `Goto_Invites`: `StartMusic` 1, `SwitchMenu(dlgRespondToInvites.rdr)`; no sound | disabled: never a stop (gated should one arrive) *[2026-10-13: runs -- unparked by ONL-28, lit by `TurnOnInvitations` with an invitation (research 273 §4)]* | ONL-28 |
| `refreshlist` | #407 REFRESH LIST | `refreshAct` | #790 | as BRIEFING ROOMS | `refresh_roomlist`: `StartMusic` 1, `.DINK`, `RefreshRoomList` at `ROOMLIST`, `DisableButton(refreshlist)`, `ActivateButton(options)`, `FiveCount` 5..1 a second each, WAIT 5, `ActivateButton(refreshlist)`, `EnableButton(refreshlist)` | runs; the request is a stub | ONL-11 (`RefreshRoomList`) |
| `options` | #702 OPTIONS | `optiontext` | #786 | empty | `Goto_Options`: `StopAllSounds`, `VagStreaming(OFF)`, `SwitchMenu(dlgOnlineOptions.rdr)`; no sound | runs (unparked by TAUNTS, 2026-10-07: research 301 §6; on dlgOnlineOptions SETUP TAUNTS and the save unparked with the taunts (2026-10-07), SETUP MESSAGING with Chris's settings (2026-10-07: research 302 §3); the other rows stay OT.R8-parked, owed to OPT-15 in sprint 22) | OPT-15 |
| `friends` | #315 FRIENDS | `FriendsAct` | #785 | `FriendList` under #316 / #317 | `Goto_Friends`: `StartMusic` 1, `SwitchMenu(dlgFriendList.rdr)`; no sound | gated; the list has no row | ONL-24 |
| `Ignore` | #370 IGNORE | `Ignoretext` | #791 | `IgnoreList` under #316 / #317 | `Goto_Ignore`: `StartMusic` 1, `SwitchMenu(dlgIgnoreList.rdr)`; no sound | gated; the list has no row | ONL-25 |

**The walk** (pinned): DOWN from MESSAGES stops on ten rows -- NO INVITATIONS is disabled and passed -- and wraps to
MESSAGES; UP from MESSAGES goes to IGNORE (the popup's button and every list are disabled).

**BRIEFING ROOMS with no rooms.** CROSS puts the focus on `ROOMLIST`. A LISTBOX with no item takes no pad (its input
`FUN_003745e0` answers 0 at once), so CROSS reaches no binding -- `join_room`, with `CanJoinRoom` and `JoinMPRoom`, is
not run -- TRIANGLE is the screen's (the logoff popup, not the list's `OnBriefingRoomstart`), and DOWN steps the ring
to MESSAGES. That is the transcribed dispatch on an empty list; the original always had rooms, so no frame shows it.

**The gate** (`PARKED_ROW_GATE_READING`, `parkedRowGate`): a `UiBindingGate` in PLAT-08's host, asked before a
binding's animation starts; it takes the eight CROSS animations of the table's gated rows on this dialog and nothing
else. Taking the start whole, rather than letting the script run to its switch, is the choice this task made: running
OPTIONS's script to the unreachable page would stop the music with nothing to restart it, and AUTOPLAY's would raise
a popup only the server's answer closes. The cost is that CLAN's and AUTOPLAY's `.DINK` do not play. With the gate
removed the set's own script runs and the disc's page is built: the test shows PLAYER RANKING's CROSS reach
`dlgLadderLobby.rdr`. Each task removes its row from `PARKED_ROWS`.

### 2.5 SERVER NEWS once a launch (R158.3)

`init_screen`'s first sequence: `IF PopupNewsOnce == 0` -> `VALVE PopupNewsOnce = 1`, `ActivateButton(popup_motd_button)`,
the caption #779 shown, the help bar and its text hidden; `ELSE` the dimmer and the caption hidden, the help bar
shown, `DisableButton(popup_motd_button)`. No row of the command table is named `PopupNewsOnce` and the ELF holds no
such string: it is a valve, named by this set and by `global_valves.rdr`, which declares it 0 with no type word --
PERM, by `CValve_Open`'s default (`FUN_00351d40`; research 104 §6). A PERM valve survives the menus; the next launch
(the logoff's `LoadExecPS2`) reads the table anew, so the news shows again at the next login.

The port: the valve is seeded at each launch with the eleven others of the set that the table names (§3.4).

### 2.6 MESSAGES (R158.6)

`motd` and `popup_motd_text` both print MEDIUS_MOTD: one text, the panel's at scale 1 and the pane's at 0.9. Under it
in the pane, the band `DescFieldMid` and #775 "Clan messages" over `ClanMessages` (MEDIUS_CLAN_MESSAGES, the empty
string from the session's start): drawn; its text is `GetClanMessages`' (ONL-29), which this dialog's set does not
call. `scroll_news_up` / `scroll_news_down` (the screen's L1 and L2, on the press and held) are `motd`'s ops 4 and 5.

### 2.7 AUTOPLAY's pane (R158.14)

`aplaytext` calls `refresh_filter_screen`, gives `O_filters` #783 and shows it with `which_map` and
`game_type_desc`. `refresh_filter_screen` copies `GameTypeMapIndex` into `GameTypeFilter` and captions the three
fields from the filter valves: the type 0, 252..248 -> #655-660, else `GetMissionInformation` (a map's name); the
players 0, 2..14 -> #661-668; the speed 65000, 300, 600, 1200 -> #669-672. `global_valves.rdr` gives
`GameSpeedFilter` 65000 (PERSIST), the others 0: a fresh card reads ANY MAP, ANY NUMBER OF PLAYERS, ANY SPEED
( 65000 ). Unseeded, the speed valve was 0, no branch matched and the field kept its layout caption #638.

`O_filters` is the one TELETYPE of the online path. Its text was never typed: the widget set made nothing of a
TELETYPE and no tick reached it. It is now ticked with the widgets (`FUN_00377b80`: the type sound, ON_TTY_DONE) and
commanded by op (`FUN_00378600` D:L272607-272656: 4 `Continue`, 5 `scroll_up`, 6 `scroll_down`, 7 `finish`, then the
base `FUN_0036fcc0`'s Caption and Valve into the setter `FUN_00378a10`). Every row beside AUTOPLAY gives it " " and
hides it.

### 2.8 The name and the medal (R158.8, R158.9)

`playername` reads PLAYER_NAME_AND_TAG (0x3f4380). Two functions write it, both replies: GetMyClans' `FUN_002e8bd0`
(D:L187837-187845) and UpdateClanStats' `FUN_002e7e70` (D:L187272-187279). Each prints the session's account name
(0x66a4f4) as "%s" (0x3f43b8), or with a clan tag as "#C@ [%s] #C%s" (0x3f43a0). On this dialog the first is reached
from `init_screen`'s `GetClan(NA)`; §3.2 has the stub.

The medals are hidden by `get_ladder_top_10` and shown by `DisplayMedalOfMerit`, bound on ON_LADDER_REFRESH:
`LadderMedalOfMerit` 1..5 shows `Medal_Blue`, `_Bronze`, `_Silver`, `_Gold`, `_Black`. The test raises the event with
the valve at 5 and sees `Medal_Black`. The captures' star is that image (research 155 §3: our Horizon answers every
player a position that makes the medal 5). With the ladder parked nothing asks and nothing answers: the port draws no
medal. Which reply sets the valve and raises the event from `GetLadderInfo`'s modes 1 and 7 is ONL-34's decode.

### 2.9 The music (R158.15)

`CallMusic`: `IF StartMusic == 1` nothing, `ELSE VagStreaming(ON)` and `SOUND MUS_ONLINE_MENU`. `StartMusic` is in no
valve table: made TEMP at 0 by the script's parse. It is set to 1 by `PressBriefingRoombtn`, `refresh_roomlist`,
`join_random_game`, `create_modify_clan` and the five `Goto_*` scripts that keep the stream; `Goto_Options` and
`exit_lobby` stop it (`StopAllSounds`, `VagStreaming(OFF)`) and leave the valve alone. The test: one start on the
first arrival; none on an arrival with the valve at 1; one more on an arrival with it at 0.

### 2.10 The logoff (ONL-10's)

TRIANGLE is bound on the screen to `exit_lobby`: three animations stopped, the fader to 0.7, `AreYouSure` 0, the
popup #793 with #246 NO and #253 YES, a wait on the valve. On 2 (YES): `StopAllSounds`, `VagStreaming(OFF)`, popup
#422, `LobbyLogout`, `UnInitNetwork`, `socom_online_initialized` 0, `NetCnfClose`, `NetCnfUnInit`,
`SWITCHMENU(REBOOT)`, `KILLPOPUP`, the fader back. Else `KILLPOPUP` and the fader back. The pin's listing is held by
`worldOfSocomEntryCommands.test.ts`; the screen test holds the popup and NO. YES is ONL-10's: `LobbyLogout` is left as
the two earlier modules register it.

### 2.11 The other events

`MP_JOIN_ROOM` -> `ReturnToBriefingRoom` (UIanim: `SWITCHMENU(dlgMPBriefingRoom.rdr)`, or the LAN room);
`MP_MEDIUS_JOIN_ROOM_FAILURE` -> `OnJoinRoomFailure`; `MP_MEDIUS_READY_TO_CONNECT` -> `join_game` (to
`dlgGameLobby.rdr`); `MP_MEDIUS_JOIN_GAME_FAILURE` -> #803; `MP_RANDOM_GAME_FOUND`; `MP_MEDIUS_BECAME_LEADER` -> #802;
`MP_CLAN_DISBANDED` -> #470; `MP_MEDIUS_ERROR` -> `OnMultiplayerDisconnect`; `MP_SYSTEM_MESSAGE` -> `OnSystemMessage`.
No service raises any of them yet: ONL-11, ONL-12, ONL-15, ONL-22 and ONL-27 own them.

## 3. The commands

Every bound function the chapter names, with the task that owns its body and its state on the page
(`WORLD_OF_SOCOM_ENTRY_COMMANDS`, held to the pin). **here**: this task's body. **existing**: an earlier task's body,
registered on the session. **stub**: registered here for the owner named, answering as the original's body answers
with no data. **parked**: not registered -- the table's declared row answers, its cited constant or the placeholder.

| row | function | owner | state | what reaches it here, and what answers |
|---|---|---|---|---|
| `SwitchMenu` (spelt `SWITCHMENU` too) | `FUN_0027e720` | PLAT-10 | existing | the rows' scripts, `exit_lobby`, `join_game`, the library |
| `PopUpDialog`, `KillPopUp` | `FUN_0027eb10`, `FUN_0027d190` | PLAT-10 | existing | the logoff popup and the event popups |
| `ActivateButton`, `EnableButton`, `DisableButton` | `FUN_0027c360`, `FUN_0027c260`, `FUN_0027c160` | PLAT-10 | existing | the focus and the enabled bits |
| `SuspendMenuInput` | `FUN_00277220` | PLAT-11 | existing | `join_room` |
| `StopAllSounds`, `VagStreaming` | `FUN_00277930`, `FUN_0027a5e0` | PLAT-23 | existing | `CallMusic`, `Goto_Options`, `exit_lobby` |
| `NetCnfClose`, `NetCnfUninit` | `FUN_00277d50`, `FUN_00278020` | ONL-01 | existing | `exit_lobby`, `OnMultiplayerDisconnect` |
| `CheckMyInvites`, `HasClanInvitations` | `FUN_0027a3c0`, 0x277950 | SVC-09a | existing, mounted here | `init_screen`; `TurnOnInvitations` and `invitationsAct` |
| `LobbyLogout` | `FUN_0027dcc0` | ONL-10 | existing (ONL-08's and ONL-06's stand-in) | `exit_lobby` after YES |
| `GetMediusAnnouncements` | `FUN_0027d1f0` | ONL-09 | **here** | `init_screen` (§3.1) |
| `RefreshRoomList` | `FUN_0027daa0` | ONL-11 | **stub**: 1 while online, no request, no rooms | `init_screen` and every 30 s, `refresh_roomlist`, the join failures |
| `GetClan` | 0x27aa60 -> `FUN_002e8a90` | ONL-27 | **stub**: the no-clan reply at once *[2026-10-13, ONL-27: GetMyClans, `ManageRosterCommands` (research 272 §3)]* | `init_screen` |
| `IsMemberOfClan`, `IsLeaderOfClan` | 0x27a910 -> `FUN_002e6830`; `FUN_0027a890` | ONL-27 | **stub**: 0 *[2026-10-13, ONL-27: over the client's clan, `ManageRosterCommands` (research 272 §3)]* | `ClanManageAct`, `create_modify_clan` |
| `GetLadderInfo` | `FUN_002784d0` | ONL-30 | parked: the placeholder 1, the body's own answer for modes 1 and 7 | `get_ladder_top_10` |
| `GetFriendsList`, `GetIgnoreList` | `FUN_0027a2e0`, `FUN_0027a280` | ONL-24, ONL-25 | parked: the constant 1 | `get_friend_list` |
| `GetMissionInformation` | `FUN_00275ef0` | ONL-15 | parked: the constant 1 | `refresh_filter_screen`, only for a map's index |
| `CanJoinRoom`, `JoinMPRoom` | `FUN_0027d690`, `FUN_0027d270` | ONL-11 | parked: not reached with no rooms | `join_room` |
| `JoinMPGame`, `CheckJoinMP` | `FUN_0027d730`, `FUN_0027e2b0` | ONL-12 | parked: not reached | `join_random_game` (gated, ONL-15), `join_game` |
| `ConnectToGameServer`, `JoinGameServer` | `FUN_0027e4c0`, `FUN_0027e380` | ONL-16 | parked: not reached | `join_game` |
| `DisconnectFromGameServer`, `LobbyBailout` | `FUN_0027e420`, `FUN_0027dc90` | ONL-22 | parked: not reached | `join_game`; `OnMultiplayerDisconnect` |
| `UnInitNetwork` | `FUN_0027e5c0` | ONL-10 | parked: the constant 1 | `exit_lobby` after YES, `OnMultiplayerDisconnect` |

Thirty-two rows: one here, four stubs, fourteen existing, thirteen parked.

### 3.1 `GetMediusAnnouncements`

`FUN_0027d1f0` (D:L125862-125869) calls `FUN_002f7710(0x44f370)` (D:L196520-196540) and answers 1. Only while the
lobby session's +0x7d is set and its state byte +0x60 is 0x0b: MEDIUS_MOTD (the variable at lobby +0xc8) is set to
"Retrieving messages from server..." (0x3f57c0) and a 0x2c-byte request goes out -- the session key at +0x15, 0x28e8
at +0x28 -- with the callback `FUN_002f77a0`.

`FUN_002f77a0` (D:L196542-196627): a status that is not success (`FUN_002f42d0`, "MediusGetAnnouncements") sets the
variable to "No server messages." (0x3f5810). A success builds an array of the reply's text (+0x20) and "\n"
(0x3f5808); when the variable already holds an array, a budget of 800 less the text's length and two for each held
element is spent on the held strings from the last one back, and every string after the first that does not fit is
appended in order. The request has just made the variable a string, so one reply to one request yields exactly
[text, "\n"]; the tail is kept only when two replies arrive with no request between. The lengths are `strlen`s: the
port counts UTF-8 bytes.

The page's service (`AnnouncementService`) posts `{ applicationId: 10472 }` to the match server's
`/texts/announcement` (SVC-05; the endpoint takes any JSON object) and takes back `status`, `announcementId`,
`announcement`, `endOfList`. A failure of any kind is a request never answered: the retrieving text stays.

### 3.2 The stubs

- **`RefreshRoomList`** (`ROOM_LIST_STUB_READING`): the row's answer is `FUN_002e3a30`'s (D:L184852-184875) -- 0 unless
  the session is up in state 11, then the client's room list cleared, the request sent (`FUN_002e3aa0`
  D:L184878-184895: 0x1a bytes, 1 at +0x16 and 999 at +0x18, the callback `FUN_002e3b00`) and 1. The stub answers the
  same and sends nothing: ROOMLISTVAR stays as the session's start left it, with no value, and the list draws no row.
  **ONL-11 replaces this one handler** (and takes `CanJoinRoom` and `JoinMPRoom` from the table).
- **`GetClan`** (`GET_CLAN_STUB_READING`): 0x27aa60 is `j FUN_002e8a90` (D:L187723-187766). Not online: 1. Else by its
  state `DAT_0044f788`: 1 answers 0; 2 goes to 0 and answers 1; 0 empties CLANNAMEVAR and Clan_Description (0x3f3a08,
  0x3f3a20), sends GetMyClans (0x30 bytes, 1 at +0x28 and 999 at +0x2c), goes to 1 and answers 0. The reply
  `FUN_002e8bd0` on a status that is not success -- our Horizon's NoResult for an account in no clan
  (`desktop@be557831:server/horizon-server/Server.Medius/Medius/MLS.cs:1614-1636`) -- sets the clan's ids to -1,
  empties the two variables, writes PLAYER_NAME_AND_TAG and goes to 2. The stub applies that reply inside the call
  that asks: 0 on that tick, 1 on the next. With a clan the reply's other branch (the tag, the roster request, the
  leader events) is ONL-27's. *[2026-10-13, ONL-27: built -- GetMyClans sent and both branches transcribed
  (`GET_CLAN_STUB_READING` retired, research 272 §3).]*
- **`IsMemberOfClan`** (0x27a910 -> `FUN_002e6830` D:L186491-186497: the clan id at 0x3df298 is not -1; the word is
  -1 in the ELF and at the lobby's init, D:L182792) and **`IsLeaderOfClan`** (`FUN_0027a890` D:L124550-124564 ->
  `FUN_002e67d0` D:L186474-186488: the clan's leader id, -1 with no clan, is the named member's or mine): 0.
  Unstubbed, the table's default 1 made CLAN's help line the leader's. *[2026-10-13, ONL-27: both read the client's clan
  (`ManageRosterCommands`, research 272 §3).]*

### 3.3 The lobby session's variables

`FUN_002df6a0` (D:L182187-182232; called from `LobbyConnect`'s `FUN_002e0030` at D:L182671) adds thirteen variables
TEMPORARY, in this order: GAMELISTVAR, ROOMLISTVAR, ROOMPLAYERLISTVAR, MEDIUS_CHAT_RECV_VAR (an empty array),
MEDIUS_MOTD and MEDIUS_CLAN_MESSAGES (each then set to the empty string), INVITED_PLAYERS, CLAN_ROSTER,
MY_CLAN_INVITES, LADDER_LEADERS, LADDER_RANKING, CLAN_LADDER_LEADERS, CLAN_LADDER_RANKING. So MY_CLAN_INVITES exists
before any invitations reply (research 156's note that the port added it only at the first publish). The body ends by
asking the room list once unless the LAN lobby is up (ONL-11's). `lobbySessionStart` transcribes the thirteen; the
session calls it when it is made, since `LobbyConnect` is ONL-07's (§7).

### 3.4 The launch's valves

`WORLD_OF_SOCOM_GLOBAL_VALVES`: of the chapter's 22 valves, the twelve `global_valves.rdr` names, with its values and
type words, in its order -- `ComeFromLan`, `GameTypeFilter`, `socom_online_state`, `socom_online_initialized`,
`LadderMedalOfMerit`, `mp_join_game`, `JoinAsSpectator` (0, PERM); `GamePlayerFilter` (0), `GameSpeedFilter` (65000),
`FF_FILTER` (2) (PERSIST); `PopupNewsOnce` (0, PERM); `GameTypeMapIndex` (0, PERSIST). The other ten (`AreYouSure`,
`StartMusic`, `NoExitState` ...) are in no table. The test reads the table off the disc or the fixtures and holds the
list to it (185 entries, research 104 R104.6). The page loads no `global_valves.rdr`; the twelve are seeded at the
session's start and at every `LoadExecPS2`.

## 4. The page

`connectWorldOfSocom` (`packages/viewer/src/worldOfSocomHost.ts`) is the session's one call: the thirteen variables,
this task's five rows and the gate, SVC-09a's `ClanInvitationCommands` over a `MyClanInvitations` whose event sink is
the menu state's (`MP_MEDIUS_HAS_INVITES`), and the valves. `FrontEndSession` takes two services (`announcement`,
`clanInvitations`); absent, a request is never answered. `mountFrontEnd` hands it `fetchAnnouncementService` and
`fetchClanInvitationsService` at ONL-04's base (`universeServiceBase`). `onLaunch` seeds the valves again. ONL-07's
lobby session hands in `lobbyUp`, `lobbyState` and `accountName` when it lands; until then the three readings of §8.

## 5. The score (R158.16)

`tools/test/worldOfSocomScore.test.ts`: the dialog run on the disc through the rig, drawn by the page's drawer with
the UIMP bank, the disc's faces and the MP2 captions, scored by PLAT-30's scorer. The persona's name is set to each
capture's (`socomp`, `socomc`). SERVER NEWS is taken 90 ticks after the build; the menu 30 ticks after one CROSS.
Each frame against its own state's capture (W9.R8). Triples are score, black control, matched.

Two regions are scored apart, masked in the chrome:

- **the news text** -- `[130, 132, 540, 344]` in the panel, `[196, 96, 600, 198]` in the pane. The captures show our
  Horizon's announcement of each day (title, "\n", body, "\n": `MLS.cs:356-399`): "Horizon Medius Server" / "Source
  available on GitHub" on `s4_pcsx2`, with "Welcome to the SOCOM Unzipped Project" before them on `s17_q2_logoff`. A
  fresh match server serves none;
- **the medal** -- `[16, 403, 44, 431]` (§2.8).

| frame | capture | whole | chrome | text region | medal |
|---|---|---|---|---|---|
| SERVER NEWS, a fresh server's empty text | `09_lobby.png` | 97.1 | **99.7** (71.5) | 91.0 (41.4): **not met** | 71.1 (56.5): **not met** |
| SERVER NEWS, the same | `A_44` (4:3) | 98.6 | **99.9** (71.4) | 94.9 (42.1): **not met** | 71.3 (56.8): **not met** |
| the menu, the same | `09_lobby_no_news.png` | 96.7 | **99.5** (75.0) | 83.3 (69.9): **not met** | 71.1: **not met** |
| the menu, the same | `A_45` (4:3) | 98.6 | **99.8** (75.7) | 92.0 (74.8): **not met** | 71.3: **not met** |
| SERVER NEWS, the capture's own text | `09_lobby.png` | 99.6 | 99.7 | **99.4** | 71.1 |
| SERVER NEWS, the same | `A_44` (4:3) | 99.8 | 99.9 | **99.8** | 71.3 |
| the menu, the same | `09_lobby_no_news.png` | 99.4 | 99.5 | **99.1** | 71.1 |
| the menu, the same | `A_45` (4:3) | 99.8 | 99.8 | **99.8** | 71.3 |
| the caption crop (`refs.json` `lobby_news`, grey 320 x 224) | `lobby_news.png` | 98.3 (39.9) | | | |

**The text regions with the empty text are not met whatever the number.** Three of the four sit over 90 and the
scorer calls them matched: nothing is drawn where the captures have two or three lines, the lines are a small share
of each region, and the number is the panel behind them. They are reported as not met by what the frames show, and
no bar is claimed from them. The cause is the text served, not its drawing: with the captures' own announcements the
same regions score 99.1-99.8. The owner's announcement is H73's.

**The medal is not met**: 71.1 against the recomp, 71.3 against the console. The captures show `Medal_Black`; the
port draws none because the ladder is parked. The decode that would draw it is ONL-34's.

Not pixel-exact against the recomp's frames (N20; research 144 §7 says why). The manifest's rows `online.server-news`
and `online.menu` carry the numbers; their counts did not move (59 rows, 184 captures); `09_lobby_no_news.png` is now
marked looked at. `online.menu` is MESSAGES lit only: **one capture per row of the walk is owed to ONL-32** (PC
research 80-online-menus §4 item 1, not yet run). The nine other panes stand at the reading level.

## 6. The browser look

2026-10-03, the lock FREE: Chromium over Playwright on the worktree's own Vite at 5417, a match server on 8870 with
`DATA_DIR` in the scratch folder and `ALLOWED_ORIGINS=http://localhost:5417`, at
`?devmode&menuflow=dlgWorldOfSOCOM.rdr&server=ws://localhost:8870/ws`. Read off the page's hook and seven screenshots
(kept in the scratch folder; none is in the tree):

- **arrival**: SERVER NEWS up over the dimmed rows, the focus `popup_motd_button`, `PopupNewsOnce` 1, the panel's
  text empty -- the local server is fresh. NO INVITATIONS greyed. The server logged `texts announcement 200` and
  `clan invitations 200`; no request failed. The route read `/main/online/dnas/universe/persona/connect/agreement/world`;
- **after Enter (CROSS)**: the panel gone, MESSAGES lit, the help line #781, the "Clan messages" band;
- **ArrowDown**: BRIEFING ROOMS lit, "Select a Briefing Room." over ROOM NAME / # of PLAYERS / ELIGIBLE RANKS and no row;
- **ArrowDown**: AUTOPLAY lit, its help line #784, the three fields reading ANY MAP, ANY NUMBER OF PLAYERS, ANY
  SPEED ( 65000 ), and #783 typed in four lines under them; Enter there changed nothing;
- **ArrowDown**: CLAN lit, "Create a clan.";
- three more ArrowDowns reached REFRESH LIST (NO INVITATIONS passed); Enter greyed it with "4" beside its caption and
  lit OPTIONS; five seconds on the focus was back on REFRESH LIST;
- **Backspace (TRIANGLE)** raised the logoff popup; Enter on NO closed it.

No name showed at the foot: a deep link has no persona (PLAYERNAMEVAR unset). The music: `MUS_ONLINE_MENU`,
`MUUI0003.VPK`, playing, one play from arrival to the end of the run, no underrun (the browser was started with
autoplay allowed; MENU-MUSIC's own spec covers the gesture). The served tree was a copy, deleted after the run.

## 7. Unknowns, contradictions, what is not done

- **The block's unknowns.** "Whether SERVER NEWS and MESSAGES show one text or two": one (R158.6), at the reading
  level and in the four scored frames. "The pages behind AUTOPLAY, OPTIONS and CLAN as reached from this menu": by
  the set, AUTOPLAY is no page -- a pane here and a join to `dlgGameLobby.rdr` on the server's answer; OPTIONS is
  `dlgOnlineOptions.rdr`; CLAN is `dlgCreateClan.rdr`, `dlgManageRoster.rdr` or `dlgManageRosterLeader.rdr` by the
  two clan tests. No frame of any of them from this menu is on record: ONL-32's walk.
- **Owed with each parked row** (§2.4): its page, and its CROSS script's own statements -- CLAN's and AUTOPLAY's
  `.DINK` among them. The row's line leaves `PARKED_ROWS` with its task.
- **Owed to ONL-10.** `LobbyLogout` is registered twice today (ONL-08's and ONL-06's stand-ins); this task added
  none. A reboot keeps the launch's valve store (the opener's one object): the twelve valves of §3.4 are reset here,
  but `StartMusic` and every other valve survive a logoff, so after a logoff in one page session the next login's
  `CallMusic` finds `StartMusic` at 1 if any row set it and starts no music. A launch that starts from a new store
  -- `global_valves.rdr` whole, then the card -- is BOOT-10a's and OPT-02's.
- **Owed to ONL-07.** The lobby's flag, state byte and account name (three readings, §8); the thirteen variables are
  added when the session is made, not at `LobbyConnect`.
- **Owed to ONL-11.** `RefreshRoomList`'s body; `CanJoinRoom`, `JoinMPRoom`; the session start's first room list
  request; the transcribed dispatch on an empty list has no frame. *(2026-10-05, ONL-11, research 161: the body is
  built -- the request with the session's ticket, the reply and the draw; `CanJoinRoom` and `JoinMPRoom` stay the
  table's behind the room row's gate, `ROOM_JOIN_GATE_READING`, owed to ONL-12; the session start's request is not
  sent before a login, owed with `LobbyConnect`'s move.)*
- **Owed to ONL-34.** The medal's decode (§2.8).
- **Owed to ONL-33.** The listing prints a table row aimed at a node as `<node>.op<n>` and leaves it out of a
  chapter's `commands` (§2.3); other chapters may hold such rows. Correcting the tool re-pins every chapter.
- **The announcement on a fresh server**: an empty SERVER NEWS at every login (R158.7). Horizon's own behaviour, kept
  by SVC-05; Sony's is unobservable.
- **`letterbar`, `arrow_up`, `DescFieldBotm`, `Category0Text`** and a dozen more names the set or the layout uses
  exist in no layout node: the ops on them do nothing, as in the original (research 95 §1.4).
- **Not done here**: `PROCESS.md`'s range line (the controller's: it ends at 156, this note is 158); the corpus (the
  controller's rebuild: the new sources cite notes, so `corpus.test.ts` is red until then); research 101 (no name of
  this task is in the round's packages).

## 8. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `WORLD_LOBBY_STATE_READING` (`packages/ui/src/screens/worldOfSocomCommands.ts`) | no hook: the session counts as up, in state 11 | `FUN_002f7710`, `FUN_002e3a30` and `FUN_002e8a90` act only while lobby +0x7d is set and +0x60 is 0x0b; the port has no lobby session before ONL-07, and the original reaches this menu only past the connect, in state 11 | ONL-07 handing in its flag and state (`lobbyUp`, `lobbyState`) |
| `ROOM_LIST_STUB_READING` (the same file) | the answer of `FUN_002e3a30` transcribed; no request; ROOMLISTVAR not written | REFRESH LIST, `init_screen` and the 30-s refresh need the row before ONL-11 builds the rooms | ONL-11's body replacing the stub -- **retired 2026-10-05** by ONL-11 (research 161 §1-§3) |
| `GET_CLAN_STUB_READING` (the same file) | `FUN_002e8a90`'s state machine; the no-clan reply (`FUN_002e8bd0`'s failure branch) applied in the call that asks | the name at the foot is written by that reply; clans are parked, so no clan exists and no request is sent | retired 2026-10-13: replaced by ONL-27's GetMyClans (`ManageRosterCommands.GetClan`, research 272 §3) |
| `ACCOUNT_NAME_READING` (the same file) | no hook: PLAYERNAMEVAR's text, else the empty string | the reply prints the session's account name (0x66a4f4), which the login's answer fills; `LobbyLogin` sends PLAYERNAMEVAR as that name | ONL-07 handing in the session's account name (`accountName`) |
| `PARKED_ROW_GATE_READING` (the same file) | the CROSS animation of a row whose page is parked is not started | OT.R8: drawn and inert; running a script to its unreachable page would stop the music (OPTIONS) or raise a popup nothing closes (AUTOPLAY) | each row's task building its page and removing its line from `PARKED_ROWS` |
