# 269 -- The players' pages and the medals: IGNORE, PLAYER RANKING, FRIENDS, the medals (ONL-25, ONL-30a, ONL-24, ONL-34, ONL-19)

- Date: 2026-10-11 (web sprint 18, the players' half, wave 2; the plan
  `../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md`, W18.R4).
- Status: **reading, reviewed** (ONL-25's §1, 2026-10-11; ONL-30a's §2, 2026-10-12; ONL-24's §3, 2026-10-12; ONL-34's §4, 2026-10-12; ONL-19's §5, 2026-10-13; each by a fresh reviewer before its merge -- 65cd082e1, 84407600c, a6ae27b6f, e01267af6, 75c481390 -- web sprint 18's Log). Every value of the original below is read from the
  disc's dialogs through the repository's readers (`tools/dump-online-dialogs.ts --dialog dlgIgnoreList.rdr`, the
  layouts of `RUN/UI/READERC.ZAR`, the sets of `RUN/UIZANIM.ZAR`, the captions of `UIMNLOC`), from the retail
  decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and from the ELF's strings
  (`S:0x<addr>`); our Horizon is cited at the `ref/desktop` pin (`desktop@be557831:...`, read with `git show`), evidence
  of the message's shape, not of Sony's server. Unit-tested against that reading, and the page replayed over the
  machine from the disc's own records (§1.8); nothing here is measured on the original running -- the recomp capture of
  the page and ONL-32's transcripts of an add, a remove and a list are the proven level.
- Stands on research [263](263-chat-the-ignore-list-and-moderation.md) (§4: SVC-17's pairs, the client's list and its
  filtering side, the cap, the row's PlayerStatus), [119](119-the-software-keyboard.md) (§5 the keyboards' call sites,
  §8 Action2 and `ON_SKB_APPLY2`), [158](158-the-socom-ii-online-menu.md) (SOCOM II ONLINE's rows and panes),
  [266](266-the-chat-panels.md) (§1 the chat keyboard, §1.7 the ignore filter's effect),
  [268](268-the-friends-and-the-player-lookups.md) (§1.5 item 4: the ignore list's PlayerStatus under PROFILE-PRIVACY,
  SVC-15's) and [302](302-original-options-and-communications.md) (§4 `CopyUIVar`), and does not
  restate them.
- Code (§1): `packages/ui/src/screens/ignoreListCommands.ts` (`IgnoreListCommands`, `ignoreListRows`, the names of §1.7);
  `worldOfSocomCommands.ts` (`GetIgnoreList` existing, the IGNORE row out of `PARKED_ROWS`); `briefingRoomCommands.ts`
  (`CopyUIVar` and `AddToIgnore` existing); `optionsCommands.ts` (`COPY_UI_VAR_DIALOGS` with the BRIEFING ROOM and the
  GAME LOBBY); the page's transport and mount `packages/viewer/src/ignoreListHost.ts` (`fetchIgnoreListService`,
  `sessionIgnoreList`, `connectIgnoreList`), wired in `packages/viewer/src/frontEnd.ts`. The services are SVC-17's and
  SVC-18's, unchanged (`packages/central/src/ignore.ts`, `chat.ts`, `lobbyHttp.ts`).
- Code (§2): `packages/ui/src/screens/ladderLobbyCommands.ts` (`LadderLobbyCommands`, `ladderMedal`, `ladderTier`,
  `readPlayerRecord`, `podiumRows`, `rankingRows`, `playerInfoLists`, the names of §2.4); `worldOfSocomCommands.ts`
  (`GetLadderInfo` existing, the PLAYER RANKING row out of `PARKED_ROWS`); `briefingRoomCommands.ts` (`GetPlayerInfo`
  existing, not reached); `uiCommands.ts` (rows 92 and 173 owned by ONL-30a); the page's transport and mount
  `packages/viewer/src/ladderLobbyHost.ts` (`fetchLadderService`, `sessionLadder`, `connectLadderLobby`), wired in
  `packages/viewer/src/frontEnd.ts`. The services are SVC-13's and SVC-15a's, unchanged (`packages/central/src/ladder.ts`,
  `playerInfo.ts`, `lobbyHttp.ts`).
- Code (§3): `packages/ui/src/screens/friendListCommands.ts` (`FriendListCommands`, `friendListRows`,
  `friendConfirmationRows`, the names of §3.7); `worldOfSocomCommands.ts` (`GetFriendsList` existing, the FRIENDS row out
  of `PARKED_ROWS`); `usagePolicyCommands.ts` (`GetFriendInvitations`' why); `ladderLobbyCommands.ts` (PLAYER INFO's
  FRIEND origin, `friendState`); `optionsCommands.ts` (`COPY_UI_VAR_DIALOGS` with FRIENDS); the page's transport and
  mount `packages/viewer/src/friendListHost.ts` (`fetchFriendListService`, `sessionFriendList`, `connectFriendList`),
  wired in `packages/viewer/src/frontEnd.ts` (with `ladderLobbyHost.ts`'s `friendState`). The service is SVC-16's,
  unchanged (`packages/central/src/friends.ts`, `lobbyHttp.ts`).
- Code (§4): `packages/ui/src/screens/gameLobbyCommands.ts` (`GameLobbyCommands.seatTold`, the side lists' medal column,
  `LOBBY_MEDAL_TOLD_READING`; `PLAYER_TIER_PARKED_READING` narrowed); the page's game socket
  `packages/viewer/src/gameLobbyHost.ts` (`GameSocketHost`: the room's `seatTold` and the way back from the match hand the
  client's `SeatToldBoard` to the lobby). The two valves and both sets' runs are ONL-30a's (§2.2, §2.4 item 7) and the
  dialog runtime's, unchanged; SEAT-TOLD's event and board are SVC-07c's (research 264 §2), unchanged.
- Code (§5): `packages/viewer/src/scoreboard.ts` (`GameDetails`, `gameDetailLines`, `sessionGameDetails`,
  `servedRoomDetails`, `LAN_GAME_LINE`, `DETAILS_UNKNOWN`, `NO_CLAN`, `ScoreRowInfo.clan`); the feeds in `hud.ts`
  (`setGameDetails`), `matchMount.ts` (`gameVars`), `frontEnd.ts` and `main.ts` (§5.5).
- Sections: §1 IGNORE (ONL-25), §2 PLAYER RANKING, PLAYER INFO on CROSS and the menu's top ten (ONL-30a), §3 FRIENDS
  (ONL-24), §4 the medal of merit (ONL-34) and §5 the in-round scoreboard's online fields (ONL-19) are written.

## 1. IGNORE (`dlgIgnoreList`, ONL-25)

*Added 2026-10-11 (web sprint 18, wave 2). Reading, reviewed (at its merge, 65cd082e1).*

### 1.1 The page as read (the disc's record)

`dlgIgnoreList.rdr` of `RUN/UI/READERC.ZAR` (background `multplay_back.tif`; scripts its own set and `UIanim.rdr`):

- **The widgets**: the title `bar_title` #368 IGNORE LIST; the help bar `InfoTextT` #149 and `InfoTextX` #150; the
  player's name `playername` (PLAYER_NAME_AND_TAG) with the five medals under it; the category texts #316 ONLINE and
  #317 PLAYER NAME; `DescriptionText` (the help line); three BUTTONs -- `Ignore` #370 IGNORE, `RemoveIgnore` #371 REMOVE
  IGNORE, `return` #314 RETURN -- and the LISTBOX `IgnoreList` on IgnoreListVar (XPOS 178, YPOS 116, 250 x 276, SPACING
  19, SCALE 0.9, `PADHOG`, `NOSELECT`) with **three columns**: POSITION 800 (the account id, off the list's 250-wide
  box: drawn nowhere), 90 (the name) and 21 (the status glyph, SCALE 1.2, TOP_OFFSET 7). #369 I.D. and #375 Enter Name
  of Player to Ignore are in the range but no widget's or script's (§1.4).
- **The bindings and scripts** (the set's own unless marked):
  - ONSTART: `net_monitor` and `ActivateMedalOfMerit` (UIanim.rdr), and `OnIgnoreListStart`: `GetIgnoreList(NA)`,
    `DisableButton(IgnoreList)`.
  - IGNORE: ONACTIVATE `OnIgnoreAct` (#372 "¦ Add to your ignore list."); CROSS `OnIgnorePress`: `STOP menu_fade_up`,
    `ClearUIVar(PLAYER_IGNORE_NAME)`, `GetTextInput(PLAYER_IGNORE_NAME)`, WHILE `skb_done == 0`, then IF
    `TestUIVar(PLAYER_IGNORE_NAME)` `AddToIgnore(NA)`.
  - REMOVE IGNORE: ONACTIVATE `OnRemoveIgnoreAct` (#373 "¦ Manage your ignore list."); CROSS `OnRemoveIgnorePress`: IF
    `TestUIVar(IgnoreListVar)` -- a row held -- `EnableButton(IgnoreList)`, `ActivateButton(IgnoreList)`.
  - The list: ONACTIVATE `OnIgnoreListActivate` (`IgnoreListActive = 1`); CROSS `OnIgnoreListPress`: `SitAndSpin = 0`,
    the popup #374 "Are you sure you wish to remove this player from your ignore list?" with #253 YES / #246 NO into
    SitAndSpin, WHILE 0, IF `SitAndSpin == 1` (YES, the first button) `RemoveFromIgnore(INPUT_STRING)` -- the focused
    row's first cell, the id (the LISTBOX's argument rule, research 117 §6.1); TRIANGLE `OnIgnoreListReturn`:
    `DisableButton(IgnoreList)`, `ActivateButton(RemoveIgnore)`, `IgnoreListActive = 0`; ON_UPDATE_UIVAR
    `OnIgnoreListUpdate`: the list emptied while active runs `OnIgnoreListReturn`.
  - RETURN: ONACTIVATE `OnReturnAct` (#322 "¦ Return to SOCOM II Online."); CROSS `OnReturnPress`:
    `SWITCHMENU(PREVIOUS_SCREEN)`, no sound of its own. The screen's TRIANGLE: `goto_menu(PREVIOUS_SCREEN)`
    (UIanim.rdr: `SOUND SND_DINK`, then the switch).
  - The events the rows raise, each a popup over the fader (0 -> 0.7) with one button #226 CONTINUE into SitAndSpin:
    MP_PLAYER_NOT_FOUND `PlayerNotFound` (#376 "That player does not exist or is not currently logged in. Please check
    your spelling and try again."); MP_IGNORE_LIST_FULL `IgnoreListFull` (a literal of 77 bytes: "Your ignore list is
    full. Remove players from your ignore list and try again."); PLAYER_IS_IGNORED `PlayerIsAlreadyIgnored` (a literal
    of 37: "You are already ignoring that player."). MP_MEDIUS_ERROR `OnMultiplayerDisconnect` and MP_SYSTEM_MESSAGE
    `OnSystemMessage` (UIanim.rdr) as on every online page.

### 1.2 The rows (the C bodies)

PLAT-08's table rows 165 `GetIgnoreList` (0x27a280), 166 `RemoveFromIgnore` (0x2798e0), 167 `AddToIgnore` (0x279f50),
each answering 1 (research 107 §5). The client's list is the vector at 0x44fde0 (research 263 §4.2), one for the
session: emptied at each fetch (`FUN_00302fc0` D:L203619-203626) and touched by nothing else -- the lobby's resets
leave it.

- **`GetIgnoreList`** (`FUN_0027a280` D:L124333-124340) -> `FUN_00300f00` (D:L202303-202318): the list emptied,
  GetIgnoreList sent with the callback `FUN_00300f70` (D:L202321-202340): a status not Success (`FUN_002f42d0`
  "GetIgnoreList", S:0x3f6028) draws the list as it stands; a Success row is kept (`FUN_00301ed0` D:L202884-202948:
  appended unless a record holds its account id, D:L202914-202921; the name search above it, D:L202903-202911, is
  computed and not used) and the list drawn at the row ending it (+0x44). The draw `FUN_00301920`
  (D:L202685-202721): one array per record -- `"%d"` (S:0x3f6118) of the account id, the name, and the glyph S:0x3f6140
  (the byte 0xAA) for a PlayerStatus of 0 or S:0x3f6148 (0xA7) for any other -- set into IgnoreListVar (S:0x3f6150),
  added TEMPORARY (`FUN_003857c0(.., 0, 1)`). One byte each, below 0xC0, so each is its own code to the engine
  (`packages/ui/src/text/codes.ts`), a glyph of the menus' font.
- **`AddToIgnore`** (`FUN_00279f50` D:L124215-124230): PLAYER_IGNORE_NAME (S:0x3eee00, added TEMPORARY when absent), its
  text when it holds a string, to `FUN_00300c50` (D:L202208-202244): none or empty, nothing; a name on the list
  (case-blind, `FUN_00198b80`) raises PLAYER_IS_IGNORED (S:0x3f5fa0, D:L202238-202240) and sends nothing; else
  AccountGetID by the name (0x46 bytes, the name at +0x26:32, D:L202232-202236; `IGNORE_NAME_LOOKUP_PLACEHOLDER` -- *retired 2026-10-15 (NU-14): the add asks `/lobby/account-id`,
  `ACCOUNT_GET_ID_PRESENCE_READING`*), whose
  reply `FUN_00300db0` (D:L202246-202273) raises MP_PLAYER_NOT_FOUND (S:0x3f5fe0) on a status not Success and else sends
  AddToIgnoreList with the account; its reply `FUN_00300e60` (D:L202275-202301) raises MP_IGNORE_LIST_FULL (S:0x3f6010)
  on **any** status but Success (V4) and else asks the list again (D:L202292-202298).
- **`RemoveFromIgnore`** (`FUN_002798e0` D:L123996-124014): the argument (`FUN_0026ed60`), INPUT_STRING (S:0x3ee898)
  replaced by the running animation's input string (`FUN_00272480`); a text there, its id by `strtol` base 10
  (`FUN_00191490` D:L9969-9977) to `FUN_00300fe0` (D:L202343-202366): RemoveFromIgnoreList sent only for an account on
  the list; its reply `FUN_003010c0` (D:L202370-202390) asks the list again on Success and says nothing on a failure.

`IgnoreListCommands` is these three over one record list; the events go into the built dialog as the lobby's do
(`lobbyEventInto`), so on IGNORE they run the popups of §1.1 and on a dialog that binds none (the briefing room) they do
nothing, as the original's.

### 1.3 SOCOM II ONLINE's IGNORE row and pane

The menu's ONSTART `get_friend_list` runs `GetFriendsList` and `GetIgnoreList`; the IGNORE row's ONACTIVATE shows the
pane's LISTBOX `IgnoreList` (columns 800 / 85 / 15, research 158), which IgnoreListVar fills. The row's CROSS
`Goto_Ignore` is `StartMusic = 1`, `SwitchMenu(dlgIgnoreList.rdr)`, no sound: unparked (`PARKED_ROWS` without it,
`PARKED_ROW_GATE_READING`'s line), so the set's script runs whole. `GetIgnoreList` in `WORLD_OF_SOCOM_ENTRY_COMMANDS`
is `existing` (ONL-25's body). `menuRoutes.ts` already listed the dialog.

### 1.4 The keyboard, and the chat keyboards' IGNORE key

- **IGNORE's keyboard**: `MPPLAYERNAME` on PLAYER_IGNORE_NAME with no caps (MaxChars and MaxBytes 0: the width's fit
  only, research 119 §5); its title key is spelt `PURPOSE`, which the set does not carry, so the request's +0x10 is
  empty and the keyboard opens untitled -- #375 is shown nowhere (research 119 §5's row).
- **The briefing room's and the game lobby's IGNORE key** (the chat keyboard `ChatSkb`'s Action2, research 119 §8):
  Action2 mode titles the keyboard `Action2Title` and ENTER posts ON_SKB_APPLY2 with the text written into CHATMESSAGE;
  both dialogs bind it to `on_skb_apply_2`: `CopyUIVar(NA)`, `AddToIgnore(NA)`. The `CopyUIVar` record's +0x10 and
  +0x14 (`FUN_0027fd70`'s, research 302 §4) name the animation's names 2 and 3, **CHATMESSAGE -> PLAYER_IGNORE_NAME**
  (read off the disc's set for `dlgMPBriefingRoom.rdr`, `dlgGameLobby.rdr`, `dlgManageRosterLeader.rdr`; the same in
  each). So the key ignores **the name typed**, not a line's sender: no chat line is selectable (CHATLIST is a
  WRAPPEDTEXT). OPTIONS' `CopyUIVar` body (`./optionsCommands`) now answers on those two dialogs
  (`COPY_UI_VAR_DIALOGS`); `BRIEFING_ROOM_ENTRY_COMMANDS` lists `CopyUIVar` and `AddToIgnore` `existing`. The briefing
  room binds none of the three events: a refused add there is silent, as the original's. The FRIENDS page's and the
  clan roster's `on_skb_apply_2` are their tasks' (ONL-24, the clans').

### 1.5 The transport

`fetchIgnoreListService` posts `/lobby/ignore-list` `{}`, `/lobby/ignore-add` and `/lobby/ignore-remove`
`{ ignoreAccountId }` (SVC-17's, `LOBBY_IGNORE_PATHS`) and `/lobby/find-player` `{ name }` (SVC-18's, the lookup)
*[2026-10-15, NU-14: the lookup is `/lobby/account-id` `{ accountName }`, AccountGetID, `packages/central/src/accountGetId.ts`]* at the
page's own origin, `Authorization: Bearer <ticket>`, no credentials, not cached; `sessionIgnoreList` reads the ticket at
each request (none: no request) and hands a 401 to the lobby client's `sessionLost` (state 2, MP_MEDIUS_ERROR, which
IGNORE binds to `OnMultiplayerDisconnect`); any other refusal or shape is a request never answered -- the answers read as
`BRIEFING_ROOM_HTTP_ADAPTATION`. `connectIgnoreList` mounts the rows once on the session (`frontEnd.ts`), so SOCOM II
ONLINE's pane, IGNORE and the chat keyboards share the list, as the console's one vector. The rows' PlayerStatus is what
`/lobby/ignore-list` serves (`IGNORE_PLAYER_STATUS_READING`, the server's), unchanged here: putting it under
PROFILE-PRIVACY is SVC-15's (research 268 §1.5 item 4).

### 1.6 The deviations

1. **The add's lookup** (`IGNORE_NAME_LOOKUP_PLACEHOLDER`): FindPlayer where the console sends AccountGetID. Horizon's
   AccountGetID finds any account of the name (desktop@be557831:server/horizon-server/Server.Medius/Medius/MLS.cs:468-498,
   `GetAccountByName`); ours finds only a player in a briefing room or a game (`WHISPER_REACH_READING`), so a player
   off line, or on the menus, is MP_PLAYER_NOT_FOUND here. The page's own #376 names both cases ("does not exist or is
   not currently logged in"), so Sony's behaviour is not known. ~~The services hold no AccountGetID; adding one is a
   server task (the brief kept SVC-17's and SVC-18's routes as they are).~~ *[2026-10-15, NU-14: was -- the services
   answer AccountGetID at `/lobby/account-id` (`accountGetId.ts`), a logged-in account of the name in a room or not
   (`ACCOUNT_GET_ID_PRESENCE_READING`, research 273 §7): #376 itself is the evidence, read as the original's own text
   over Horizon's offline-found answer (the merge controller's ruling between readings). The add's lookup asks it;
   `IGNORE_NAME_LOOKUP_PLACEHOLDER` retired (§1.7).]* *[2026-11-10, CLAN-INVITES: re-ruled by the owner against the best reading (`ACCOUNT_GET_ID_PRESENCE_OWNER`; HUMAN_TASKS
   H441 for the ignore side) on the owner's
   word, "ensure clan invites are sent to accounts that exist but are offline": AccountGetID answers any account of the name, logged
   in or not (Horizon's), so the add now finds a logged-off player too; #376 is still shown for no such name (research
   273 §7).]*
2. **The reply's order** (`IGNORE_LIST_LATEST_REPLY_ADAPTATION`, a browser adaptation): a list reply is taken only for
   the latest request under the ticket still held.
3. **The chains' ticket** (`IGNORE_ADD_TICKET_ADAPTATION`, a browser adaptation; the fresh review's finding, 2026-10-11):
   the add's FindPlayer -> AddToIgnoreList -> list and the remove's RemoveFromIgnoreList -> list go on only under the
   session's ticket they began with, as SVC-15a's own-record read (`sessionPlayerInfo`): an answer that lands after a
   logoff and another login adds nothing to the new account's list and raises no popup there.

### 1.7 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `IGNORE_NAME_LOOKUP_PLACEHOLDER` (ui `screens/ignoreListCommands.ts`) | `'AccountGetID asked as FindPlayer: only a player on the lobby is found'` | the add's AccountGetID by name (Lobby 0x17, `FUN_00649e28` D:L561475-561496; the reply's +0x18 / +0x1c read by `FUN_00300db0` D:L202258-202270): Horizon answers any account (MLS.cs:468-498); the page asks `/lobby/find-player`, which finds only a player on the lobby (§1.6 item 1) | an AccountGetID operation on the services; ONL-32's transcript of an add of a player off line | retired 2026-10-15 (NU-14): the services' AccountGetID (`/lobby/account-id`, `ACCOUNT_GET_ID_PRESENCE_READING`, research 273 §7) asked by the add; the constant removed |
| `IGNORE_ADD_TICKET_ADAPTATION` (ui `screens/ignoreListCommands.ts`) | `'an add or a remove goes on only under the ticket it began with'` | no original: the console's chain dies with its connection (§1.6 item 3) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `IGNORE_LIST_LATEST_REPLY_ADAPTATION` (ui `screens/ignoreListCommands.ts`) | `'a list reply taken only for the latest request, under the ticket still held'` | no original: the console's replies come in order on one connection (§1.6 item 2) | nothing to settle: a labelled adaptation of the transport | adaptation |

### 1.8 The tests, and the runs (unit tests and the page over the machine; no browser, no capture)

- `packages/ui/test/screens/ignoreListScreen.test.ts` (new): the three rows held to the table (id, function, task,
  answer 1) and the ELF's names and glyph bytes; `GetIgnoreList` -- the request, nothing drawn before the reply, the rows
  `["%d", name, glyph]`, IgnoreListVar TEMPORARY, NoResult drawn empty, one row per account id, a non-Success row
  drawing what is held, a stale reply dropped; `AddToIgnore` -- found (FindPlayer, add, the list again), already listed
  (case-blind, PLAYER_IS_IGNORED, nothing sent), not found (MP_PLAYER_NOT_FOUND), refused by -956 and -988 (both
  MP_IGNORE_LIST_FULL), no name, a lookup or an add answered after the ticket changed going no further; `RemoveFromIgnore` -- INPUT_STRING's id removed and the list asked again, an id not
  listed and `NA` sending nothing, a refused remove silent; the unparked entries. Over the machine from the disc's
  records (or the fixtures): SOCOM II ONLINE's ONSTART asking the list and the IGNORE row's pane drawing it, its CROSS
  switching to the page; the page's ONSTART, the three columns (800 / 90 / 21), the captions; ADD through the keyboard
  (`MPPLAYERNAME`, untitled, no caps) found, not found (#376), full (the 77-byte text), already listed (the 37-byte
  text); REMOVE (the list enabled and activated, #374, YES) and the empty list's no-op and the list's TRIANGLE; the way
  back (TRIANGLE with SND_DINK, RETURN silent). The briefing room's IGNORE key: R1, the Action2 key pressed, a name typed
  and ENTER -- `CopyUIVar`, `AddToIgnore`, FindPlayer, the add, the list, and no chat line sent.
- `packages/viewer/test/ignoreListHost.test.ts` (new): the four requests' paths, bodies and bearer; 401 the session lost,
  other refusals and shapes rejected; the row check; no ticket no request; the mount's rows over the transport.
- `worldOfSocomScreen.test.ts` (ONSTART's `GetIgnoreList(NA) table`), `worldOfSocomCommands.test.ts` (the parked rows
  without IGNORE, `Goto_Ignore` ungated), `tools/test/worldOfSocomEntryCommands.test.ts` (the entry counts 2 / 3 / 24 /
  3); the menu rig (`worldOfSocomRig.ts`) mounts the rows over a fake answering Horizon's empty list.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 2. PLAYER RANKING, PLAYER INFO on CROSS, and the menu's top ten (`dlgLadderLobby`, ONL-30a)

*Added 2026-10-12 (web sprint 18, wave 3). Reading, reviewed (at its merge, 84407600c).*

### 2.1 The page as read (the disc's record)

`dlgLadderLobby.rdr` of `RUN/UI/READERC.ZAR` (`tools/dump-online-dialogs.ts --dialog dlgLadderLobby.rdr`,
`tools/dump-dialogs.ts --dialog dlgLadderLobby.rdr --tree`; background `multplay_back.tif`; scripts its own set and
`UIanim.rdr`):

- **The widgets**: the title `bar_title` #396 PLAYER RANKING; `desc_low_text` #395 (the scroll line); the help bar
  `InfoTextT` #149, `InfoTextX` #150; `playername` (PLAYER_NAME_AND_TAG) with the five medals under it; the headers
  `TopTen_text` #151 THE PODIUM, `player_text_lft` and `player_text_rt` #398 PLAYER, `rank_text` (literal "RANK"); the
  RANK INSIGNIA legend -- `rank_desc_text` "RANK INSIGNIA", the five ranks `admiral_text` .. `ensign_text` (ADMIRAL,
  CAPTAIN, LT. COMMANDER, LIEUTENANT, ENSIGN), the five bands `adm_text_desc` .. `ensign_text_desc` (TOP 10 PLAYERS,
  TOP 5%, NEXT 5-30%, NEXT 30-85%, LOWEST 15%) and the five medals `medal_black` .. `medal_blue` (12 x 12), all literal
  (research 155 §2.3); the arrows `arrow_up` (310, 77) and `arrow_dwn` (310, 342), 35 x 35.
- **THE PODIUM**: the LISTBOX `LadderTop10` on LADDER_LEADERS (23, 77; 100 x 180; SCALE 0.9, SPACING 19, `PADHOG`,
  `NOSELECT`), three columns at 10 / 90 / 35: the position, the name, the tag.
- **The page's rows**: the LISTBOX `LadderList` on LADDER_RANKING (340, 97; 285 x 400; SCALE 0.9, SPACING 19,
  LEFT_MARGIN -15, `PADHOG`), five columns -- **-600** (the key cell: 340 - 15 - 600, left of the screen, drawn nowhere),
  130 (the name: 455, under PLAYER at 455), 47 (the position, under RANK at 344), 20 (the medal, an IMAGE column 16 x 16,
  TOP_OFFSET -18, TEXTURES `null.tif`, `Medal_Blue.tif` .. `Medal_Black.tif`) and 80 (the tag). No rating is drawn: the
  first cell, which research 155 §2.2 reads as the rating, is drawn off the screen and is PLAYER INFO's key (§2.4 item 2).
- **PLAYER INFO, a page inside the dialog**: `pop_missionBack` (640 x 448) and its children -- the title `bar_title`
  (WRAPPEDTEXT #863 PLAYER STATS on PLAYER_INFO_NAME_VAR), `playerinfo_list1` on PLAYER_INFO_VAR1 (three columns 0 / 130 /
  0, the third an IMAGE column 28 x 28 at TOP_OFFSET -34 with the medals' TEXTURES), `playerinfo_list2` on
  PLAYER_INFO_VAR2 (0 / 230 RIGHT_JUSTIFIED), `playerinfo_description` on PLAYER_INFO_DESCRIPTION, and the BUTTON
  `playerinfo_ctl_desc` #864.
- **The bindings and scripts** (the set's own unless marked):
  - ONSTART: `PulseArrows` (both arrows' opacity 0.2 <-> 0.99, forever), `get_ladder_top_10` (`HIDE pop_missionBack`,
    `ClearUIVar(LADDER_LEADERS)`, `GetLadderInfo` mode 0, `DisableButton(LadderTop10)`), `net_monitor` and
    `ActivateMedalOfMerit` (UIanim.rdr). The screen's L1 / L2 name `scroll_news_up` / `scroll_news_down`, which no set
    defines.
  - `LadderList`: L1 `ladder_up` (IF `GetLadderInfo` mode 2, then mode 4, `WAIT 0.5`), L2 `ladder_down` (mode 3, then
    5), each bound on FALLING and on DOWN; CROSS `playerinfo_activate` (`SHOW pop_missionBack`, `EnableButton` /
    `ActivateButton(playerinfo_ctl_desc)`, the five PLAYER_INFO variables cleared, `GetPlayerInfo(INPUT_STRING)` mode 3).
  - ON_LADDER_REFRESH `RefreshArrows`: IF mode 3 `SHOW arrow_dwn` ELSE HIDE; IF mode 2 `SHOW arrow_up` ELSE HIDE.
  - `playerinfo_ctl_desc`: R1 `playerinfo_send_message` (`KeyboardPurpose = 99`; with PLAYER_INFO_NAME_VAR held,
    CHATMESSAGE cleared, the keyboard on it, `PruneUIVarSpaces`, `SendMediusChat(CHATMESSAGE)` -- ONL-23's whisper to
    PLAYER_INFO_CHAT_NAME_VAR); SQUARE `playerinfo_ignore_player` (a DEBUG op only: nothing); TRIANGLE
    `playerinfo_deactivate` (`CALL OnPlayerListReturn` -- `ActivateButton(LadderList)` --, `HIDE pop_missionBack`, the
    three disabled).
  - The screen's TRIANGLE `goto_menu(PREVIOUS_SCREEN)` (UIanim.rdr: `SOUND SND_DINK`, the switch); MP_MEDIUS_ERROR
    `OnMultiplayerDisconnect`, MP_SYSTEM_MESSAGE `OnSystemMessage` (UIanim.rdr); MP_PLAYER_NOT_FOUND `PlayerNotFound` --
    the fader 0 -> 0.7, a popup of a literal text of 74 bytes, "The message cannot be sent because that player is not
    currently logged in.", with #226 CONTINUE into SitAndSpin. It is the whisper's: `FUN_002f4a20` raises it when
    FindPlayer for the recipient fails (D:L194614-194619); PLAYER INFO's own lookup raises no event (§2.3).
- **The modes the sets carry** (the command's word at +0x10; read off the disc's sets with the scene decoder):
  `dlgLadderLobby` 0 (ONSTART), 2 / 4 and 3 / 5 (L1, L2), 3 and 2 (the arrows), GetPlayerInfo 3; `dlgWorldOfSOCOM`
  1 and 7 (its ONSTART); `dlgClanLadderLobby` 6, 8 / 10, 9 / 11, 9 and 8; GetPlayerInfo 0 in `dlgMPBriefingRoom`, 1 in
  `dlgManageRoster` and `dlgManageRosterLeader`, 2 in `dlgFriendList`.
- **SOCOM II ONLINE**: ONSTART `get_ladder_top_10` hides the five medals under `playername` and runs `GetLadderInfo`
  modes 1 and 7; the PLAYER RANKING row's ONACTIVATE `rankingAct` (#788) shows `BlueBack`, `TopTenText` #765 TOP TEN
  SOCOM II ONLINE PLAYERS and `LadderTop10` on LADDER_LEADERS (178, 138; columns 20 / 130 / 65); its CROSS `Goto_Ladder`
  is `StartMusic = 1`, `SwitchMenu(dlgLadderLobby.rdr)`, no sound. ON_LADDER_REFRESH runs `DisplayMedalOfMerit`.

### 2.2 The rows (the C bodies)

PLAT-08's table rows 92 `GetLadderInfo` (0x2784d0, fn2 0x278750) and 173 `GetPlayerInfo` (0x279b50, fn2 0x279bf0).

- **`GetLadderInfo`** (`FUN_002784d0` D:L123407-123492) by its mode -- the record builder `FUN_00278750`
  (D:L123495-123578) maps "CLAN" (S:0x3eecd0), "Top10" (S:0x3eecd8), "LadderPressUp" (S:0x3eece0), "LadderPressDown"
  (S:0x3eecf0), "LadderUp" (S:0x3eed00), "LadderDown" (S:0x3eed10) to it; the disc's scripts carry the word written:
  0 my position (`FUN_002eb2c0` D:L189094-189114: only while the lobby's +0x7d is set and its state is 11) and the
  podium; 1 my position (`FUN_002eafb0` D:L188973-188992, at any state) and the podium; 2 0 while the page's start is
  under 2; 3 0 while the total is under the start + 14; 4 the page from `max(1, start - 14)` when the start is above 1;
  5 the page from the start + 14; 6-11 the clans' (§2.4 item 4); any other my position alone. Every other answer 1.
- **My position's two replies.** `FUN_002eb010` (mode 1, D:L188994-189051): a Success holds my position and the total
  (`DAT_0044f7f8`, `DAT_0044f7c0`, `DAT_0044f800`; D:L189008-189011), sets LadderRanking (S:0x3f4678, TEMPORARY) to the
  position, writes LadderMedalOfMerit (S:0x3f4690) and LadderRankRestriction (S:0x3f46b0) from `FUN_002eaee0` and
  `FUN_002eae20` of my position (D:L189020-189045) and raises ON_LADDER_REFRESH (S:0x3f45e0, D:L189047); a failure
  changes nothing. `FUN_002eb340` (modes 0 and the default, D:L189117-189180): a failure opens the page from 1
  (D:L189130-189131); a Success holds the same, frees the page's request (D:L189146), opens the page at
  `max(1, my position - 2)` (D:L189147-189151) and writes the two valves -- no event of its own (the page's draw raises
  it).
- **The page and the podium.** `FUN_002eb510` (D:L189183-189214): only with no request out (`DAT_0044f878`), a start
  above 0 and below the total -- or no row held -- the rows freed, the start held, "TheRest" (S:0x3f4728) asked: stat 0,
  order 1, the start, `7 << 1` = 14 rows. `FUN_002eb610` (D:L189217-189240): the podium's rows freed, "TheBest"
  (S:0x3f4730) asked, 10 from 1. The reply `FUN_002eb6a0` (D:L189243-189274), a row at a time: a status not Success
  frees the page's request whatever the tag (D:L189253-189256); a TheRest row kept and, at the one ending the list, the
  request freed and the page drawn; a TheBest row kept and at the end the podium drawn. A row (`FUN_002ebe50`
  D:L189547-189606) is kept once per position (D:L189570) -- the position, the reply's +0x20 (D:L189584), the name, the
  record parsed (`FUN_002f9ac0`, D:L189580) with its tag drawn `[%s]` (S:0x3f4748, D:L189593-189594) or empty, the
  online state copied whole (D:L189597) -- and the list's +0x10 (for the page's list, the total `DAT_0044f7c0`) raised
  to its position (D:L189601-189603).
- **The draws.** THE PODIUM (`FUN_002eb7a0` D:L189313-189358): sorted by position (`FUN_002ec260`), each row
  `["%d" (S:0x3f45c8) of the position, the name, the tag]` into LADDER_LEADERS (D:L189355); no event. The page
  (`FUN_002eb900` D:L189361-189455): sorted, each row `[the key, the name, "%d" of the position, the medal, the tag]`
  -- the medal `FUN_002eaee0` of the row's position against **my** total `DAT_0044f800` (D:L189391); the row whose name
  is the session's (`strcmp` with 0x66a4f4, D:L189399) has its name, position and tag as keyed cells of `VALUE` and
  `COLOR` 91, 72, 36 (D:L189400-189427) -- into LADDER_RANKING (D:L189449), then ON_LADDER_REFRESH (D:L189451).
- **The medal and the tier** (V8): `FUN_002eaee0` (D:L188934-188970) -- 0 while the total is 0 or below, 5 for all
  while it is 1 to 11, from 12 5 under position 11, else by `position x 1000 / (total - 10)`: under 51 4, under 301 3,
  under 851 2, else 1; `FUN_002eae20` (D:L188898-188931) the same without the top-ten rung, 4 for all under 12. **Which
  medal a row shows: the page's transcription, not the server's `medalOf`** -- the rows carry no medal (`LadderRow`:
  position, stat, name, record, state; Horizon's `MediusLadderList_ExtraInfoResponse` likewise), and the client
  computes it from the position against its own cached total; `ladderMedal` / `ladderTier` are held equal to
  `ladder.ts`'s `medalOf` / `tierOf` at every position of every total to 300 and at the bands of 1,000 and 100,000
  (`tools/test/ladderLobbyParity.test.ts`).
- **`GetPlayerInfo`** (`FUN_00279b50` D:L124078-124094): the argument -- INPUT_STRING the running animation's input
  string, the row's first cell (the LISTBOX's argument rule, research 117 §6.1) -- and the origin at +0x10 to
  `FUN_002efe50` (D:L191683-191719): PLAYER_INFO_VAR1 "Retrieving Player Info" (S:0x3f4bc0), PLAYER_INFO_VAR2 and
  PLAYER_INFO_DESCRIPTION " " (S:0x3f4bf8), each added TEMPORARY; PlayerInfo sent with the account id `strtol` reads of
  the text (D:L191699) and the origin's tag in the MessageID (3 LADDER S:0x3f4c38, 2 FRIEND S:0x3f4c30, 1 CLAN
  S:0x3f4c28, 0 and any other BRIEFING S:0x3f4c18; D:L191702-191716), the reply to `FUN_002f0020`. 1.

### 2.3 PLAYER INFO's page (`FUN_002f0020` D:L191722-192146, V11)

- **Not Success** (D:L191788): PLAYER_INFO_VAR1 "Could not retrieve player information." (S:0x3f4ee0), the two others
  " " (D:L192140-192143). No event: MP_PLAYER_NOT_FOUND on this page is the whisper's (§2.1).
- **Success**: the record parsed (D:L191790); from the ladder (the tag LADDER, D:L191791) the page's row of the reply's
  name -- looked up case-blind in the page's rows only (`FUN_002ebc20` D:L189458-189484, the list 0x44f7b0; a player
  on the podium but not on the page is not found) -- gives the online state and its position in place of +0x08
  (D:L191793-191821); the other origins read their own lists (§2.4 item 5). PLAYER_INFO_NAME_VAR is `%s` of the name, or
  with a clan tag `#C` 80 40 20 `[%s] ` `#C` 53 48 24 `%s` (S:0x3f4c58, S:0x3f4c40; D:L191933-191940);
  PLAYER_INFO_CHAT_NAME_VAR the name (D:L191941-191942).
- **PLAYER_INFO_VAR1, in V11's order** (D:L191946-192060): `[" ", " "]`; `[" ", " ", the medal]` (`FUN_002eaee0` of the
  position against my total, D:L191954); `[" ", " "]`; `["%s %s" of the clan's name and "(Leader)" or "", " "]`
  (S:0x3f4ca0, S:0x3f4ca8, the leader bit +0x02 bit 7, D:L191962-191968); LADDER POSITION (the position); SCORE (+0x04);
  TOTAL # OF GAMES (+0x20 `& 0x3fffff`); ROUNDS WON (+0x14); ROUNDS LOST (+0x18); three `[" ", " "]`
  (D:L191997-192008); HOMETOWN (+0x60); then for a state of 0 `["NOT CURRENTLY LOGGED IN\n", " "]` (S:0x3f4dc0,
  D:L192014-192019), else ONLINE (`%d min.` of +0x0c, S:0x3f4d38), BRIEFING ROOM (MAIN MENU, S:0x3f4d50, for a world
  whose name opens "Medius" -- `strncmp` 6, D:L192027 -- else the name) and GAME (D:L192038-192056: in a game, 3, its
  name; in a room, 2, "In Lobby" S:0x3f4da0 as a keyed cell in 91, 72, 36; 1 "Logging In" S:0x3f4d88; 0 "Disconnecting"
  S:0x3f4d78, unreachable under the outer test; else " ").
- **PLAYER_INFO_DESCRIPTION** (D:L192061-192068): `[["DESCRIPTION:\n" (S:0x3f4de0), the description +0x9f]]`.
- **PLAYER_INFO_VAR2** (D:L192069-192135): KILLS (+0x1c), DEATHS (+0x2a), SUICIDES (+0x2c), BOMBS PLANTED (+0x2e), BOMBS
  DEFUSED (+0x30), HOSTAGES RESCUED (+0x24), VIPs RESCUED (+0x26), VIPs KILLED (+0x28), BONUS OBJECTIVES (+0x22 `>> 6`),
  HIT PERCENTAGE (`%d %%` of +0x01 `& 0x7f`, S:0x3f4e88), HEAD SHOTS (+0x32), `[" ", " "]`, TOTAL PLAYING TIME
  (`%d : %.2d` of +0x10's hours and minutes, unsigned, S:0x3f4eb0, D:L192130). The shorts are unsigned (research 261
  §1). `FUN_002f3ee0`, called on the record (D:L191932), is an empty body (D:L194166-194172).
- **What PROFILE-PRIVACY withholds** is what the server serves (research 268 §1.4-§1.5): a stranger's row carries the
  empty state and so draws NOT CURRENTLY LOGGED IN; the record is served to every asker. Unchanged here.

### 2.4 The port: what is built, and how it departs

The rows are `LadderLobbyCommands` (`ladderLobbyCommands.ts`), mounted once on the session (`connectLadderLobby`,
`frontEnd.ts`), so SOCOM II ONLINE's top ten and PLAYER RANKING share one client ladder, as the console's lobby object.
The transport is ours (OT.R27): `/lobby/ladder-list`, `/lobby/total-rankings` and `/lobby/player-info` at the page's own
origin with the session's ticket as the bearer, no credentials, not cached; a 401 handed to the lobby client's
`sessionLost` (state 2, MP_MEDIUS_ERROR, `OnMultiplayerDisconnect` on both dialogs); any other refusal or shape a
request never answered; an answer that lands under a ticket no longer held never answered (as SVC-15a's
`sessionPlayerInfo`).

1. **My position by name** (`LADDER_POSITION_BY_NAME_ADAPTATION`, a browser adaptation of the request): 0xf1 carries my
   account id (+0x18), which the page does not hold (its login answers a ticket; `OWN_RECORD_BY_NAME_ADAPTATION`'s
   reason), and `/lobby/ladder-position` takes an id. The host answers it from the own record's live +0x08
   (`/lobby/player-info` by name; the ladder's order now, 0 off the board, research 268 §1.2) and the board's length
   (`/lobby/total-rankings`, type 0): Success with both and a position above 0, else NoResult -- what 0xf1 answers
   (`LadderService.position`). One request on the console, two here. *Retired 2026-10-12 by SVC-15 (research 268 §3.6):
   the services answer `/lobby/ladder-position` for the bearer's own account, and the page asks it in one request.*
2. **The rows' key** (`LADDER_ROW_KEY_ADAPTATION`, a browser adaptation): the console draws `%d` of the reply's +0x20 in
   the first cell, off the screen, and its CROSS asks PlayerInfo by that number as an **account id**
   (`FUN_002efe50` D:L191699) -- so for this client +0x20 is a player's key, where research 155 §2.2, research 261 §9 and
   our server read it as the ladder stat (`LadderRow.ladderStat`, the rating; Horizon's newer response names both a
   `LadderStat` and an `AccountID`, desktop@be557831:server/horizon-server/RT.Models/Lobby/MediusLadderList_ExtraInfoResponse.cs:19-26,
   and the console's form, the name at +0x24, has room for one). *A finding against research 155 §2.2's "the ladder
   stat (the rating)": no column of the page draws the rating.* The services' rows carry no account id, so the page's
   key cell holds the row's name and PLAYER INFO from the ladder asks `/lobby/player-info` by it; the reply's handler
   looks the row up by the name anyway (`FUN_002ebc20`). Nothing visible changes. Settles: the services' row carrying
   the account id at +0x20 (a server task; then the key is `%d` of it and the request by id, as the original's) or
   ONL-32's transcript of an 0xef reply. *Retired 2026-10-12 by SVC-15 (research 268 §3.6): the services' row carries the
   account id at +0x20 (`LadderRow.accountId`); the key cell is `%d` of it and PLAYER INFO from the ladder asks by it.*
3. **The keyed cells** (`LADDER_KEYED_CELL_READING`): my row's three tinted cells and PLAYER INFO's "In Lobby" are built
   flat -- `VALUE`, the text, `COLOR`, the three numbers -- where the original nests each key's value in an array of its
   own (`FUN_003333f0`, `FUN_00333490`), because the page's LISTBOX reads a key's string value only
   (`LISTBOX_ARRAY_CELL_KEYS_READING`). Drawn the same.
4. **The clans' modes** (`CLAN_LADDER_MODES_PLACEHOLDER`): 6, 7, 10, 11 send nothing (ClanLadderList 0xd2 and the clan's
   position are SVC-11's; CLAN RANKING drawn and inert, W18.R1, H188's default -- its row stays in `PARKED_ROWS`); 8 and
   9 answer 0 over the clan list's start and total, 0 with no answer ever written. SOCOM II ONLINE's mode 7 therefore
   leaves CLAN_LADDER_LEADERS as the session's start left it. (Retired 2026-10-14 by ONL-30: the clans' half is built,
   research 311.)
5. **The other origins' lists** (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`): CLAN (0x44f740, D:L191825-191857), FRIEND
   (0x44fdc0, D:L191859-191890) and BRIEFING (the room's players, D:L191891-191929) are their pages' (ONL-27, ONL-24,
   SVC-15) and not held here -- *FRIEND held since ONL-24 (§3.4): the placeholder is narrowed to CLAN and BRIEFING; BRIEFING held since SVC-15 (research 268 §3.5): narrowed to CLAN; CLAN held since PLAYER-INFO-CLAN (2026-10-15, research 272 §5: the roster's row of the reply's name, `LobbyClan.find`, its online state and +0x1d0, handed in as `clanState`): the placeholder retired*: from them the page finds no entry -- state 0, NOT CURRENTLY LOGGED IN, the record's own
   +0x08 -- and asks by the account id as the original does. The briefing room's PLAYERLIST CROSS reaches this body only
   once SVC-15 fills the list (`BRIEFING_ROOM_ENTRY_COMMANDS`: `GetPlayerInfo` existing, not reached).
6. **The record** (`PLAYER_INFO_RECORD_VERSION_READING`): an `'E'` record read at its offsets, any other the default
   (`'E'`, the rating 1000, the rest 0; `FUN_002f9ac0` D:L198207-198222); the older versions' conversions are not
   transcribed -- the services serve every record through the one codec, which writes `'E'` (W18.R2).
   `readPlayerRecord` is the client's read of the served bytes, not a second server codec: it is held to
   `accountStatsCodec.ts`'s encode of a full record field by field (`tools/test/ladderLobbyParity.test.ts`).
7. **DisplayMedalOfMerit, as built today.** SOCOM II ONLINE's `DisplayMedalOfMerit` (its own set) is the runtime's
   decode: IF / ELSEIF `LadderMedalOfMerit` 1..5, `SHOW` `Medal_Blue` .. `Medal_Black`; nothing in it was changed. What
   is new is that it runs: mode 1's reply (`FUN_002eb010`) writes the valve and raises ON_LADDER_REFRESH, so on the
   menu the medal under the name now shows when my position is answered -- the star on a ladder under 12, the Ensign's
   at 20th of 30 -- and none with no answer (the valve 0, the five hidden by `get_ladder_top_10`). ONL-34 owns the
   decode's check of both sets' ops, the moments the position is asked off these two pages and the lobby lists' medal
   (W18.R7); the page's `ActivateMedalOfMerit` at PLAYER RANKING's ONSTART reads the valve as it then stands. *Checked 2026-10-12 by ONL-34 (§4.1-§4.3): both sets' ops as decoded are the record's, and no other moment asks the position.*

### 2.5 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `LADDER_KEYED_CELL_READING` (ui `screens/ladderLobbyCommands.ts`) | `'a keyed cell built flat (VALUE text COLOR rgb); the original nests each value in an array'` | the shape of a tinted cell: the original's `FUN_003333f0` / `FUN_00333490` nest each key's value in an array (read by `FUN_0032ee10`); the page's LISTBOX reads a key's string value only (`LISTBOX_ARRAY_CELL_KEYS_READING`) (§2.4 item 3) | that listbox reading widened to the nested value | reading |
| `CLAN_LADDER_MODES_PLACEHOLDER` (ui `screens/ladderLobbyCommands.ts`) | `'the clans\' ladder parked: 6, 7, 10, 11 send nothing; 8, 9 answer 0 over its empty state'` | `GetLadderInfo`'s clan modes: ClanLadderList (Lobby 0xd2) and the clan's position (`FUN_002eab80`, `FUN_002ea6b0`, `FUN_002ea5c0`), not served (§2.4 item 4) | SVC-11's clan ladder and CLAN RANKING's task (ONL-30; H188) | retired 2026-10-14 by ONL-30 (research 311 §8.2 item 2: the clans' half built over CLAN-BOARD-SERVER) |
| `PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` (was ui `screens/ladderLobbyCommands.ts`) | `'the clan list not held here: no entry, state 0'` | PLAYER INFO's presence lines and position from the CLAN origin's list (D:L191825-191857) (§2.4 item 5); the FRIEND origin's list is held since ONL-24 (§3.4), the BRIEFING origin's since SVC-15 (D:L191891-191929, research 268 §3.5) | ONL-27's roster | retired 2026-10-15 by PLAYER-INFO-CLAN (narrowed 2026-10-12 by ONL-24, then by SVC-15): the CLAN origin reads the clan's roster through `clanState` (`LobbyClan.find`, `FUN_002e9460` D:L188026-188056; the row's online state D:L191830-191854 and its +0x1d0 D:L191855), every origin's list held (research 272 §5) |
| `PLAYER_INFO_RECORD_VERSION_READING` (ui `screens/ladderLobbyCommands.ts`) | `'E read whole; any other first byte the default record (the rating 1000)'` | `FUN_002f9ac0`'s parse of a reply's record: the older versions' conversions (D:L198093-198206) not transcribed, the services serve `'E'` only (§2.4 item 6) | a served record of another version | reading |
| `LADDER_POSITION_BY_NAME_ADAPTATION` (was ui `screens/ladderLobbyCommands.ts`) | -- | no original: 0xf1 by account id, which the page does not hold (§2.4 item 1) | -- | retired 2026-10-12 by SVC-15 (research 268 §3.6): the services' position route takes the bearer's own; one request |
| `LADDER_ROW_KEY_ADAPTATION` (was ui `screens/ladderLobbyCommands.ts`) | -- | the console's key cell `%d` of the reply's +0x20, PlayerInfo by that id; the services' rows carried no account id (§2.4 item 2) | -- | retired 2026-10-12 by SVC-15 (research 268 §3.6): the services' row carries the account id at +0x20; the key and PLAYER INFO's request by it |

### 2.6 The tests, and the runs (unit tests and the page over the machine; no browser, no capture)

- `packages/ui/test/screens/ladderLobbyScreen.test.ts` (new): the two rows held to the table (id, function, task, the
  answers); the unparked entries and the gate (PLAYER RANKING open, CLAN RANKING parked); the medal at the boundaries
  and research 155 §2.3's bands at 12, 100, 250 and 1,000, the tier's small ladders; over a seeded ladder through the
  service's fake -- mode 0 (my position by name, THE PODIUM's ten, the page from my position less 2, LadderRanking and
  the two valves, my row tinted, one ON_LADDER_REFRESH), every row's medal 0 while my total is 0 and `FUN_002eaee0` of
  its position once answered, mode 0 off state 11, mode 1 (the valves and the event, no page), the paging both ways (2
  / 3 at the top and the bottom, one request at a time, nothing past the total), a page never answered, a NoResult
  page, one row per position, the clans' modes; PLAYER INFO from the ladder (the key by name, "Retrieving Player Info",
  V11's three lists with TOTAL PLAYING TIME, the name with its tag, the presence lines for a room, a game, the main menu,
  logging in and off line, a player off the page), not found, another origin by id, the record's default. Over the
  machine from the disc's records (or the fixtures): SOCOM II ONLINE's ONSTART (modes 1 and 7: my position and the
  podium), the PLAYER RANKING row's pane (#788, #765, `LadderTop10` 20 / 130 / 65), `DisplayMedalOfMerit` (the star on a
  ladder of 5, the Ensign's at 20th of 30, none unanswered), PLAYER RANKING's CROSS switching and CLAN RANKING's inert;
  the page's ONSTART, the captions (#396, #151, #398, #395) and the legend's literals, both lists' columns, the podium,
  the fourteen rows with their medals' textures and my row's colours, L2 / L1 and the arrows, CROSS -> PLAYER INFO (the
  lists, the medal's texture, TRIANGLE back to the list), R1's whisper refused -> PlayerNotFound's 74-byte text with
  #226, and TRIANGLE back with SND_DINK.
- `packages/viewer/test/ladderLobbyHost.test.ts` (new): the requests' paths, bodies and bearer; my position composed
  (on and off the board, an unknown name); 401 the session lost, other refusals and shapes rejected; the rows checked;
  no ticket no request; an answer under another ticket refused; the mount over the transport, and with none.
- `tools/test/ladderLobbyParity.test.ts` (new): `ladderMedal` / `ladderTier` equal to the server's `medalOf` / `tierOf`;
  `readPlayerRecord` equal to `accountStatsCodec.ts`'s decode of its own encode, field by field.
- `worldOfSocomScreen.test.ts` (ONSTART's `GetLadderInfo(NA) table` twice; the gate's example now CLAN RANKING),
  `worldOfSocomCommands.test.ts` (the parked rows without PLAYER RANKING), `tools/test/worldOfSocomEntryCommands.test.ts`
  (the entry counts 2 / 3 / 25 / 2), `packages/viewer/test/worldOfSocomHost.test.ts` (the gate: CLAN RANKING taken,
  PLAYER RANKING not); the menu rig (`worldOfSocomRig.ts`) mounts the rows over a fake answering an empty board.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 3. FRIENDS (`dlgFriendList`, ONL-24)

*Added 2026-10-12 (web sprint 18, wave 3; W18.R4, W18.R5, H191's default). Reading, reviewed (at its merge, a6ae27b6f).*

### 3.1 The page as read (the disc's record)

`dlgFriendList.rdr` of `RUN/UI/READERC.ZAR` (`tools/dump-online-dialogs.ts --dialog dlgFriendList.rdr`,
`tools/dump-dialogs.ts --dialog dlgFriendList.rdr --tree`; background `multplay_back.tif`; scripts its own set and
`UIanim.rdr`; the commands' words at +0x10 read off the set with the scene decoder, `decodeUiProgram`):

- **The widgets**: the title `bar_title` #315 FRIENDS; the help bar `InfoTextT` #149, `InfoTextX` #150; `playername`
  (PLAYER_NAME_AND_TAG) with the five medals under it; seven BUTTONs at x 16 -- `AddNewFriend` #308 ADD NEW FRIEND (y
  65), `MessageFriend` #309 MESSAGE (95), `ViewInfo` #310 VIEW INFO (125), `RemoveFriend` #311 REMOVE FRIEND (155),
  `ConfirmFriend` #312 CONFIRM FRIEND (185), `RejectFriend` #313 REJECT FRIEND (215), `return` #314 RETURN (367); the
  category texts #316 ONLINE, #317 PLAYER NAME, #318 ROOM NAME/GAME; `DescriptionText` (the help line).
- **The friends list**: the LISTBOX `FriendList` on FriendListVar (178, 116; 250 x 250; SPACING 41, SCALE 1, LEFT_MARGIN
  10, TOP_MARGIN 30, `PADHOG`, `NOSELECT`) with **five columns**: -300 (the account id, left of the box: drawn nowhere),
  72 (the name), 8 (the status glyph, SCALE 1.2, TOP_OFFSET 7), 273 (the lobby) and 273 at TOP_OFFSET 20 (the game,
  under the lobby: a row is two lines, hence the spacing of 41).
- **The requests to me**: the LISTBOX `ConfirmationList` on FriendConfirmationListVar, a child of `MainWindow` (0, 45;
  128 x 150; SPACING 17, `NOSELECT`, `PADHOG`), two columns: -500 (the account id, drawn nowhere) and 100 (the name).
- **The info window** `PlayerInfoWindow` (387, 92; `popupOp.tif`) with #319 Player, #320 Game, #321 Lobby and the three
  values on FriendInfoName, FriendInfoGame, FriendInfoLobby. Every script that names it HIDEs it (`OnFriendListStart`,
  `OnFriendListReturn`, the three list presses); none SHOWs it, and `FUN_00301140` writes the variables only: the
  window is never shown by the record -- as the port's build draws it, hidden.
- **PLAYER INFO, a page inside the dialog**: `pop_missionBack` and its children, the same widgets as PLAYER RANKING's
  (§2.1: #863 on PLAYER_INFO_NAME_VAR, `playerinfo_list1`, `playerinfo_list2`, `playerinfo_description`,
  `playerinfo_ctl_desc` #864), with the same three scripts (`playerinfo_activate`, `playerinfo_deactivate`,
  `playerinfo_send_message`, the last with KeyboardPurpose 99 and `SendMediusChat(CHATMESSAGE)` to
  PLAYER_INFO_CHAT_NAME_VAR) and `playerinfo_ignore_player` a DEBUG op.
- **No INVITE TO GAME.** No widget, caption, script or command of the record invites to a game: the buttons are the
  seven above, the captions the page names are 149, 150, 308-324, 326-329, 335-337, 863, 864, and UIMnLOC's 308-337
  hold none (330 "Enter Chat", 331 "Enter Player Name. ¤ To Accept and Enter Message.", 332 "Enter Name of Player to
  Ignore.", 333 "Enter Name of Player to Befriend.", 334 "That player does not exist or is not currently logged in.
  ...", 325 "¦ View information about a Friend." -- none named by the page). Roadmap 05's "invite to game" has no
  original on this page: nothing is built or parked for it (§3.4).
- **The bindings and scripts** (the set's own unless marked):
  - ONSTART: `net_monitor` and `ActivateMedalOfMerit` (UIanim.rdr); `OnFriendListStart`: `GetFriendsList(NA)`,
    `ActivateButton(AddNewFriend)`, `DisableButton(FriendList)`, `DisableButton(ConfirmationList)`, `HIDE
    PlayerInfoWindow`; `playerinfo_onstart` (`CALL playerinfo_deactivate`).
  - Each button's ONACTIVATE sets the help line and the headers: ADD NEW FRIEND #323 "¦ Invite someone to your Friends
    list.", MESSAGE #324 "¦ Send a message to a Friend.", VIEW INFO a literal "¦ View a Friend's info." (#325 is not
    used), REMOVE FRIEND #326, CONFIRM FRIEND #327, REJECT FRIEND #328, RETURN #322; the first four `ShowFriendList`
    (SHOW FriendList, HIDE ConfirmationList), CONFIRM and REJECT `ShowConfirmationList` (the reverse).
  - ADD NEW FRIEND's CROSS `OnAddNewFriendPress`: `STOP menu_fade_up`, `ClearUIVar(PLAYER_FRIEND_NAME)`,
    `GetTextInput(PLAYER_FRIEND_NAME)` -- its title word (+0x10) empty, so the keyboard opens untitled and #333 is shown
    nowhere --, WHILE `skb_done == 0`, IF `TestUIVar(PLAYER_FRIEND_NAME)` `AddFriend(NA)`.
  - MESSAGE / VIEW INFO / REMOVE FRIEND's CROSS: IF `TestUIVar(FriendListVar)` -- `FriendListAction` 1 / 2 / 0,
    `EnableButton(FriendList)`, `ActivateButton(FriendList)`, `HIDE PlayerInfoWindow`; ELSE the literal line "No Friends
    in your list." (VIEW INFO sets its action 2 before the test too).
  - The friends list: ONFOCUS and ONACTIVATE `OnFriendListScroll` (`GetFriendInfo(INPUT_STRING)`), ONACTIVATE
    `OnFriendListActivate` (`FriendListActive = 1`); CROSS `OnFriendListPress` by `FriendListAction` -- 0: SitAndSpin 0,
    the popup #329 "Are you sure you wish to remove this player from your Friends list?" with #253 YES / #246 NO, IF
    `SitAndSpin == 1` `RemoveFriend(INPUT_STRING)`; 1: IF `TestUIVar(FriendInfoName)`, `ClearUIVar(CHATTEXT)`,
    `GetTextInput(CHATTEXT)` (titled `_330_EnterChat_MSG`), WHILE, `PruneUIVarSpaces(CHATTEXT)`, IF `TestUIVar(CHATTEXT)`
    `SendMediusChat(CHATTEXT)` -- the recipient's variable at the command's +0x10 **FriendInfoName**; 2: `CALL
    playerinfo_activate` (`GetPlayerInfo(INPUT_STRING)`, the word at +0x10 **2**, FRIEND). TRIANGLE `OnFriendListReturn`:
    `DisableButton(FriendList)`, the focus back to the button of the action, `HIDE PlayerInfoWindow`, `FriendListActive
    = 0`; ON_UPDATE_UIVAR `OnFriendListUpdate`: the list emptied while active runs `OnFriendListReturn`.
  - CONFIRM / REJECT's CROSS: IF `TestUIVar(FriendConfirmationListVar)` -- `ConfirmListPurpose` 1 / 2,
    `EnableButton(ConfirmationList)`, `ActivateButton(ConfirmationList)`; ELSE the literal line "No requests awaiting
    confirmation." / "No requests to reject.".
  - The requests list: ONACTIVATE `ConfirmationListActive = 1`; CROSS `OnConfirmListPress` -- purpose 1:
    `ConfirmFriend(INPUT_STRING)`, `CALL AskToAddFriend` (the fader, the popup #336 "Would you like to add them to your
    Friends list?" with the buttons "Yes" / "No", IF `SitAndSpin == 1` `AddFriendDirectly(INPUT_STRING)`); else: the
    fader, the popup of a literal "Are you sure you wish to reject this friend invitation?" with #246 NO / #253 YES, IF
    `SitAndSpin == 2` (YES, the second button) `RejectFriend(INPUT_STRING)`. TRIANGLE `OnConfirmListReturn`; its
    ON_UPDATE_UIVAR `OnConfirmationListUpdate` tests `TestUIVar(ConfirmationListVar)` -- **a name no code sets** (the
    ELF's variable is FriendConfirmationListVar, S:0x3f6120), so the test is always false and the update runs
    `OnConfirmListReturn` whenever the list is active: after any answer the focus goes back to its button. Built as the
    record has it.
  - The events, each a popup over the fader with one button #226 CONTINUE into SitAndSpin: MP_PLAYER_NOT_FOUND
    `PlayerNotFound` -- **a literal of 74 bytes**, "The message cannot be sent because that player is not currently
    logged in." (PLAYER RANKING's, the whisper's; *a correction to research 268 §2.1's row, which gives the not-found of
    ADD NEW FRIEND caption 334: the page draws the literal, and 334 is shown nowhere on it*); MP_PLAYER_IS_FRIEND
    `PlayerAlreadyFriend` #335; MP_FRIEND_CONFIRMATION_REQUESTED `OnFriendListConfirmationSent` #337. ON_SKB_APPLY2
    `on_skb_apply_2`: `CopyUIVar(NA)` (names 2 and 3: CHATMESSAGE -> PLAYER_IGNORE_NAME), `AddToIgnore(NA)` -- PLAYER
    INFO's chat keyboard's IGNORE key, as the briefing room's (§1.4). MP_MEDIUS_ERROR `OnMultiplayerDisconnect` and
    MP_SYSTEM_MESSAGE `OnSystemMessage` (UIanim.rdr). `OnDeclinePress` (the literal "STUB ANIM.") is bound nowhere.
  - The way back: the screen's TRIANGLE `goto_menu(PREVIOUS_SCREEN)` (SND_DINK, the switch); RETURN's CROSS
    `OnReturnPress`: `SWITCHMENU(PREVIOUS_SCREEN)`, no sound of its own.

### 3.2 The rows (the C bodies)

PLAT-08's table rows 157 `GetFriendsList` (0x27a2e0), 158 `RemoveFriend` (0x279980), 163 `AddFriend` (0x27a050), 164
`GetFriendInfo` (0x279ab0), 168 `ConfirmFriend` (0x279eb0), 169 `RejectFriend` (0x279e10), 170 `AddFriendDirectly`
(0x279fb0), 206 `GetFriendInvitations` (0x27a2b0), each answering 1. The client's two lists (research 268 §2.1): the
friends list 0x44fdc0 (pointers to the reply's 0xd0-byte rows) and the requests to me 0x44fe00 (0x40-byte records;
`FUN_00402420` D:L328705-328720 reserves 64 at boot, the count 0).

- **`GetFriendsList`** (`FUN_0027a2e0` D:L124353-124360) -> `FUN_00301750` (D:L202617-202629): the list emptied
  (`FUN_00302210` D:L203018-203034, no draw), GetBuddyList_ExtraInfo sent with `FUN_003017a0` (D:L202632-202651): a
  status not Success draws the list as it stands; a Success row is kept (`FUN_003020a0` D:L202951-203014, unless a record
  holds its account, D:L202972) and the list drawn at the row ending it (+0xcc). The draw `FUN_00301a70`
  (D:L202724-202778): per record `"%d"` (S:0x3f6118) of the account, the name, the glyph S:0x3f6140 (0xAA) for a
  PlayerStatus of 0 or S:0x3f6148 (0xA7), then for 0 two empty cells (S:0x3f5f50, ""), for a lobby whose name opens
  "Medius" (S:0x3f6090, six characters) "MAIN MENU" (S:0x3f6098) and " " (S:0x3f60a8), else the lobby (+0x4c) and the
  game (+0x8c) -- into FriendListVar (S:0x3f6160), TEMPORARY. No state gate: the list is asked whatever the lobby's
  state.
- **`GetFriendInfo`** (`FUN_00279ab0` D:L124057-124075) -> `FUN_00301140` (D:L202393-202432): the three variables
  added TEMPORARY; the record of the account `strtol` reads -- none: all three ""; else FriendInfoName the name and, a
  "Medius..." lobby, FriendInfoGame "MAIN MENU" and FriendInfoLobby " ", any other the game and the lobby. Local; no
  status tested (an off-line friend's empty names).
- **`AddFriend`** (`FUN_0027a050` D:L124254-124269): PLAYER_FRIEND_NAME (S:0x3eee20, added TEMPORARY), its text when a
  string, to `FUN_003013c0` (D:L202483-202544): no name raises MP_PLAYER_IS_FRIEND (S:0x3f60b0, D:L202541 -- the body's
  fall through, not reached past the script's `TestUIVar`); a name on the friends list (+0x20, case-blind,
  D:L202500), on the requests to me (+0x1c, D:L202514) or the session's own (0x66a4f4, D:L202522) raises it too
  (D:L202535) and sends nothing; else FindPlayer by name, type 1 (D:L202524-202530), whose reply `FUN_003015d0`
  (D:L202547-202580) raises MP_PLAYER_NOT_FOUND (S:0x3f5fe0, D:L202564) on a failure, and on a success sends LobbyExt
  0x05 for the account at +0x48 (D:L202568-202573) and raises MP_FRIEND_CONFIRMATION_REQUESTED (S:0x3f5f60, D:L202576)
  at once. The port's one call and its status: `FRIEND_REQUEST_EVENT_READING` (§3.7).
- **`GetFriendInvitations`** (`FUN_0027a2b0` D:L124343-124350) -> `FUN_003012f0` (D:L202435-202454): only while the
  lobby is up (+0x7d) and in state 11 (+0x60), GetBuddyInvitations with `FUN_00301350` (D:L202457-202480): each row to
  `FUN_00301db0` (D:L202828-202881) -- one with no name skipped (D:L202844), one whose account is held kept as it is
  (D:L202849), else appended and the list drawn (`FUN_00301810` D:L202654-202682: per record `"%d"` of +0x18 and the name
  +0x1c, into FriendConfirmationListVar at longevity 2, D:L202678). The status is not read; the list is never emptied
  but by the answers.
- **`ConfirmFriend`** / **`RejectFriend`** (`FUN_00279eb0` D:L124194-124212 / `FUN_00279e10` D:L124173-124191) ->
  `FUN_00300a70` (D:L202111-202132) / `FUN_00300af0` (D:L202135-202156): the account `strtol` reads, LobbyExt 0x07 sent
  with 2 / 0xfffffc27 (-985) whether or not it is listed, no reply kept; then `FUN_00301cf0` (D:L202803-202825) drops
  every record of it and draws the list.
- **`AddFriendDirectly`** (`FUN_00279fb0` D:L124233-124251) -> `FUN_00300b70` (D:L202159-202175): AddToBuddyList for the
  account; its reply `FUN_00300c10` (D:L202192-202205) asks the list again on Success ("AddToBuddyList", S:0x3f5f88),
  else nothing. Its INPUT_STRING in `AskToAddFriend` is copied from the ConfirmationList caller instance. The original
  `RUN/UIZANIM.ZAR`, read through `Zar.parse` / `parseAnimSets`, has `dlgFriendList.rdr/OnConfirmListPress`, sequence
  `NA`, CALL at `Seq_Data` 68: size 20, flags `0x1`, argument block 0. It inherits inputs without a blocking wait;
  [research 363](363-native-ui-call-inputs.md) records the reviewed per-instance lifetime.
- **`RemoveFriend`** (`FUN_00279980` D:L124017-124035) -> `FUN_003016a0` (D:L202583-202598): RemoveFromBuddyList for the
  account, whether or not listed; its reply `FUN_00301710` (D:L202601-202614) asks the list again on Success.

### 3.3 The pushes and the transport

- **The forward** (LobbyExt 0x06, `FUN_003009c0` D:L202089-202108, filed at the library's init `FUN_00300840`): the
  request kept (`FUN_00301db0`, D:L202098) and its line "%s has invited you to join their friends list." (S:0x3f5f20,
  D:L202099) of the requester's name passed to the front end screen's line call (vtable +0x2c, `FUN_001f4d20`,
  D:L202106) with the empty name (S:0x3f5f50), the flag 1 in `t2` and the kind 1 -- the ninth argument, on the stack,
  which the decompiled text drops: read from the ELF's instructions at 0x3009f8-0x300a50 (`sd v0, 0(sp)` with v0 1;
  `t2` 1), as `CHAT_LINE_ARGS_READING` reads the chat's own line (0x2f4cc4-0x2f4d34: the flag in `t2`, the kind 5 / 0
  on the stack). Kind 1 is a universe line: in state 11 added to every room's history (`FUN_001f5020`), else to the game
  lobby's panel (`FUN_001f4df0`, D:L54939-55015: the name "" passed, so `": "` and the text after the colour). The port
  hands it to ONL-23's `BriefingRoomChat.screenLine` (`FRIEND_INVITED_LINE`).
- **The request's reply** (Lobby 0x44, `FUN_00300be0` D:L202178-202189): status 2 asks the friends list again; any other
  nothing.
- **The poll** (`FRIEND_EVENTS_POLL_MS_ADAPTATION`, the page's half of the server's `FRIEND_EVENTS_POLL_ADAPTATION`):
  `/lobby/friend-events` once a second while the lobby is up with a ticket, one request at a time, a reply taken only
  under its ticket; each push handled in order.
- **The transport** (`packages/viewer/src/friendListHost.ts`): `fetchFriendListService` posts the seven
  `LOBBY_FRIEND_PATHS` -- `/lobby/friend-list` `{}`, `/lobby/friend-request` `{ name }`, `/lobby/friend-answer`
  `{ accountId, status }` (its 204 the no reply), `/lobby/friend-invitations` `{}`, `/lobby/friend-add` and
  `/lobby/friend-remove` `{ accountId }`, `/lobby/friend-events` `{}` -- at the page's own origin, `Authorization: Bearer
  <ticket>`, no credentials, not cached; each answer checked field by field. `sessionFriendList` reads the ticket at
  each request (none: no request) and hands a 401 to the lobby client's `sessionLost` (state 2, MP_MEDIUS_ERROR, which
  FRIENDS binds to `OnMultiplayerDisconnect`); any other refusal or shape is a request never answered.
  `connectFriendList` mounts the rows once on the session (`frontEnd.ts`), so SOCOM II ONLINE's pane, FRIENDS, the usage
  agreement's `GetFriendInvitations` and PLAYER INFO's FRIEND origin share the two lists, as the console's; its
  `frame` runs the poll on the page's clock. The server is SVC-16's, unchanged; the rows' online state is what
  `/lobby/friend-list` serves (`FRIEND_ONLINE_STATE_READING`, PROFILE-PRIVACY the server's).

### 3.4 MESSAGE, INVITE TO GAME, VIEW INFO and PLAYER INFO's FRIEND origin

- **MESSAGE: built** -- by ONL-23's `SendMediusChat` (`briefingRoomChat.ts`), which the session already mounts: the
  record's statement is `SendMediusChat(CHATTEXT)` with FriendInfoName at +0x10 (the focused row's name, written by
  `GetFriendInfo` on the list's focus), so the text is a whisper -- FindPlayer by the name, then ChatMessage type 1 to the
  account found, or MP_PLAYER_NOT_FOUND (`FUN_002f4a20` D:L194614-194619), which this page binds to its 74-byte literal.
  The path exists on the server (SVC-18's `/lobby/find-player`, `/lobby/chat`); its reach is SVC-18's
  (`WHISPER_REACH_READING`: a friend in no briefing room or game is not found). No change was needed; the page test
  holds the chain.
- **INVITE TO GAME: none on the record** (§3.1). Nothing to build, and nothing drawn to park: the roadmap's word has
  no widget or command on `dlgFriendList`. A game invitation by a friend, if the original had one elsewhere, is not on
  this page's record.
- **VIEW INFO**: the list's focus fills the three FriendInfo variables (`GetFriendInfo`); CROSS opens PLAYER INFO over
  the page, ONL-30a's `GetPlayerInfo` with the origin 2: asked by the account id `strtol` reads of the row's first cell
  (`FUN_002efe50` D:L191699), the original's.
- **PLAYER INFO's FRIEND origin, filled**: `FUN_002f0020` reads, for a reply tagged FRIEND (S:0x3f4c30), the friends
  list's record of the reply's name, case-blind (`FUN_00301c40` D:L202781-202800, called at D:L191861) and copies its
  online state whole -- the status +0x40, the two world ids, the lobby +0x4c and the game +0x8c -- leaving the position
  the record's own +0x08 (D:L191859-191890; no position is copied, unlike the ladder's). `LadderLobbyCommands` takes it
  as `friendState` (ONL-24's `FriendListCommands.onlineStateByName`, wired in `frontEnd.ts` and the menu rig), so a
  friend in a room or a game shows ONLINE, BRIEFING ROOM and GAME, and one off line NOT CURRENTLY LOGGED IN.
  `PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` is narrowed to the CLAN and BRIEFING origins (§2.4 item 5, §2.5). *[2026-10-15:
  retired by PLAYER-INFO-CLAN, every origin's list held (§2.5).]*

### 3.5 The menu row, the usage agreement and the IGNORE key

- **SOCOM II ONLINE**: `get_friend_list` (ONSTART) runs `GetFriendsList` -- `existing` in `WORLD_OF_SOCOM_ENTRY_COMMANDS`
  (the `parked(...)` line removed) -- and the FRIENDS row's ONACTIVATE shows the pane's `FriendList` on FriendListVar
  (columns 800 / 85 / 15: the name and the glyph). The row's CROSS `Goto_Friends` (`StartMusic = 1`,
  `SwitchMenu(dlgFriendList.rdr)`, no sound) is out of `PARKED_ROWS`: the set's script runs whole.
- **The usage agreement's `GetFriendInvitations`** (`retrieve_usage`, after each login): its reply now has a reader
  (the ConfirmationList), and the session's mount answers it. `USAGE_POLICY_ENTRY_COMMANDS` keeps the row `declared` for
  its own chapter (that chapter's rig mounts no ONL-24 body, as it mounts no ONL-11 body for RefreshRoomList) with its
  `why` naming the body.
- **The IGNORE key on FRIENDS**: `COPY_UI_VAR_DIALOGS` (`optionsCommands.ts`) gains `dlgFriendList.rdr` -- its
  `on_skb_apply_2` copies CHATMESSAGE into PLAYER_IGNORE_NAME (names 2 and 3 of its animation, read off the set) before
  ONL-25's `AddToIgnore`, PLAYER INFO's chat keyboard's Action2 as the briefing room's (§1.4).

### 3.6 The deviations

1. **The request in one call** (`FRIEND_REQUEST_BY_NAME_ADAPTATION`, the server's): FindPlayer and LobbyExt 0x05 are one
   request; its status decides the event (`FRIEND_REQUEST_EVENT_READING`), where the console raises its event from
   FindPlayer's answer alone; the page shows MP_PLAYER_NOT_FOUND only for FindPlayer's -998 and #337 for every other
   status, so it shows what the console would. **Research 268 §2.4's line "-958, the page's MP_PLAYER_IS_FRIEND" is
   corrected here** (that note not edited): the console raises MP_PLAYER_IS_FRIEND only before it sends (D:L202535,
   D:L202541), never from a request's answer.
2. **The pushes polled** (`FRIEND_EVENTS_POLL_MS_ADAPTATION`): a forward drawn, and a confirmed requester's list asked,
   up to a second late.
3. **The replies' order and the session** (`FRIEND_LIST_LATEST_REPLY_ADAPTATION`, `FRIEND_TICKET_ADAPTATION`, browser
   adaptations): a list reply taken only for the latest request under the ticket still held; every other answer acts only
   under the ticket its request began with.
4. **Unchanged, for the owner**: the lists are one way and a confirmation cannot be withdrawn (research 268 §2.3, §2.7;
   H191's default, as the original). REMOVE FRIEND takes the friend off the remover's list only.

### 3.7 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `FRIEND_REQUEST_EVENT_READING` (ui `screens/friendListCommands.ts`) | `'-998 MP_PLAYER_NOT_FOUND; any other MP_FRIEND_CONFIRMATION_REQUESTED'` | the event of ADD NEW FRIEND from the one call's status: the console raises MP_PLAYER_NOT_FOUND on FindPlayer's failure and MP_FRIEND_CONFIRMATION_REQUESTED at once on its success, reading no status of the request (D:L202562-202576, `FUN_00300be0`), so the server's -958 (`FRIEND_REQUEST_REFUSED_PLACEHOLDER`) shows #337 too (*corrected 2026-10-12, ONL-24's review B1: it was shown as #335, from research 268 §2.4's design line, which the console's code does not do*) | ONL-32's transcript of a refused request (a second one, past a cap) | reading |
| `FRIEND_EVENTS_POLL_MS_ADAPTATION` (ui `screens/friendListCommands.ts`) | `1000` | no original: LobbyExt 0x06 and Lobby 0x44 are pushes; the page polls the server's mailbox (§3.3) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `FRIEND_LIST_LATEST_REPLY_ADAPTATION` (ui `screens/friendListCommands.ts`) | `'a list reply taken only for the latest request, under the ticket still held'` | no original: the console's replies come in order on one connection (§3.6 item 3) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `FRIEND_TICKET_ADAPTATION` (ui `screens/friendListCommands.ts`) | `'an answer acts only under the ticket its request began with'` | no original: the console's chain dies with its connection (§3.6 item 3) | nothing to settle: a labelled adaptation of the transport | adaptation |

`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER` (§2.5) is narrowed, not retired: its FRIEND list is held now (§3.4), the CLAN and
BRIEFING lists remain. *[2026-10-15: retired -- BRIEFING by SVC-15, CLAN by PLAYER-INFO-CLAN (§2.5).]* The readings this page leans on are listed where they live: `WORLD_LOBBY_STATE_READING` and
`ACCOUNT_NAME_READING` (research 158; the lobby's state and the own name, `AddFriend`'s and `GetFriendInvitations`'
tests), per-instance CALL inputs ([research 363](363-native-ui-call-inputs.md)), `CHAT_LINE_ARGS_READING` (research 266 §1) and the server's
`FRIEND_*` names (research 268 §2.8).

`INPUT_STRING_CALLED_READING` (research 165 §1) is retired, 2026-10-23 (MLS-PASS): original flag 1 copies the
caller's instance inputs; a later keyboard event cannot replace them. Research 363 records the reviewed reading.

### 3.8 The tests, and the runs (unit tests and the page over the machine; no browser, no capture)

- `packages/ui/test/screens/friendListScreen.test.ts` (new): the eight rows held to the table (id, function, task, answer
  1) and the ELF's names; `GetFriendsList` -- none (NoResult drawn empty, TEMPORARY), one, several with their online
  states (off line, a room, a game, the menus), one row per account, a non-Success row drawing what is held, a reply
  under another ticket dropped; `GetFriendInfo` -- a game, the menus, off line, not listed, nothing sent; `AddFriend` --
  sent and MP_FRIEND_CONFIRMATION_REQUESTED, one's own name, a friend, one who asked me and no name (MP_PLAYER_IS_FRIEND,
  nothing sent), -998 (not found) and -958, -956, -988 (each #337) by `FRIEND_REQUEST_EVENT_READING`, an answer after the ticket changed;
  `GetFriendInvitations` -- gated on the lobby up in state 11, NoResult skipped, each kept once at longevity 2; the
  forward kept and its line; CONFIRM (2, dropped, drawn) and the add back (the list asked again), a refused add back,
  REJECT (-985); the answer 2 pushed asking the list again and other statuses not; the poll's period, one at a time, its
  ticket; REMOVE and a refused remove; PLAYER INFO from the FRIEND origin (by id, the friend's online state); the
  unparked entries. Over the machine from the disc's records (or the fixtures): SOCOM II ONLINE's ONSTART asking the list,
  the pane's columns, `Goto_Friends` switching; the page's ONSTART, the five and two columns, the captions; ADD through
  the keyboard (#337), one's own name (#335), not found (the 74-byte literal); CONFIRM empty (its literal line) and
  with a request (#336 YES: the add back; NO: none); REJECT (the literal, YES the second button); REMOVE (#329 YES); VIEW
  INFO empty (its literals) and with friends (`GetFriendInfo` on the focus, PLAYER INFO by the id, TRIANGLE back);
  MESSAGE (the keyboard on CHATTEXT, the whisper to FriendInfoName); the way back (TRIANGLE with SND_DINK, RETURN silent).
- `packages/viewer/test/friendListHost.test.ts` (new): the seven requests' paths, bodies and bearer, the answer's 204;
  401 the session lost, other refusals and shapes rejected; the rows and the pushes checked; no ticket no request; the
  mount's rows over the transport, the poll's forward and line, a 401 to `sessionLost`, no transport never answered.
- `worldOfSocomScreen.test.ts` (ONSTART's `GetFriendsList(NA) table`), `worldOfSocomCommands.test.ts` and
  `onlineOptionsScreen.test.ts` (the parked rows without FRIENDS; the gate's example INVITATIONS),
  `tools/test/worldOfSocomEntryCommands.test.ts` (the entry counts 2 / 3 / 26 / 1); the menu rig (`worldOfSocomRig.ts`)
  mounts the rows over a fake answering Horizon's empty list, and hands the ladder rows their FRIEND origin.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 4. The medal of merit: beside the persona's name, and in the game lobby's lists (ONL-34)

*Added 2026-10-12 (web sprint 18, wave 4; W18.R7, H189's default). Reading, reviewed (at its merge, e01267af6).*

### 4.1 The two sets' ops as read (the disc's record)

Read off `RUN/UIZANIM.ZAR` (and the copies in `RUN/EXTZANIM.ZAR` and `RUN/MPZANIM.ZAR`) with the scene decoder
(`decodeUiProgram`), held by `tools/test/medalOfMeritDisc.test.ts`; listed by `tools/dump-online-dialogs.ts --dialog
dlgIgnoreList.rdr` (the library) and `--dialog dlgWorldOfSOCOM.rdr` (the menu's own set).

- **`UIanim.rdr`'s `ActivateMedalOfMerit`** (sixteen commands, one sequence): `HIDE Medal_Black`, `HIDE Medal_Gold`,
  `HIDE Medal_Silver`, `HIDE Medal_Bronze`, `HIDE Medal_Blue` (OBJECT_ACTIVE_STATE, its +4 0), then `IF
  LadderMedalOfMerit == 1` `SHOW Medal_Blue`, `ELSEIF == 2` `SHOW Medal_Bronze`, `ELSEIF == 3` `SHOW Medal_Silver`,
  `ELSEIF == 4` `SHOW Medal_Gold`, `ELSEIF == 5` `SHOW Medal_Black`, `ENDIF`. The same ops in every copy of `UIanim.rdr`
  the three archives hold; `dlgExitState.rdr`, `dlgMultiplayerRound.rdr`, `dlgMultiplayerFinal.rdr` and
  `dlgMultiplayerFinalReally.rdr` carry a copy of the animation too, which no binding names.
- **SOCOM II ONLINE's `DisplayMedalOfMerit`** (`dlgWorldOfSOCOM.rdr`'s own set): the same five branches and `ENDIF`, **no
  HIDE first**; the menu's ONSTART `get_ladder_top_10` hides the five, then asks `GetLadderInfo` modes 1 and 7 (§2.1).
- **Each condition** is one token, a VALVE test (cmd 61): the valve by name (the flags byte +13 = 2), the operand at +8
  (1 .. 5), the operation byte at +12 = **2** -- equality in `FUN_00353fd0`'s switch (D:L252181; case 2 at
  D:L252188-252189: the valve's short against the operand's low 16 bits); `UI_VALVE_OPS[2]` is `==`. So the decode the
  runtime already runs (ONL-30a, §2.4 item 7) is the record's: neither set's run was changed.
- **What a value draws**: 0 none (the HIDEs: `ActivateMedalOfMerit`'s own, or the menu's ONSTART's); 1 `Medal_Blue` (the
  Ensign's gold bar, research 155 §2.3); 2 `Medal_Bronze`; 3 `Medal_Silver`; 4 `Medal_Gold`; 5 `Medal_Black`, the
  Admiral's white star. A value outside 0-5 matches no branch and draws none; the valve's only writers are the position
  replies, with `FUN_002eaee0`'s 0-5 (§2.2).
- **A consequence kept** (the record's): `DisplayMedalOfMerit` hides nothing, so a second ON_LADDER_REFRESH on the same
  build of the menu with another medal would show two images. The menu asks once per build (its ONSTART) and every way
  back to it builds it again, so no path of ours raises a second one there. Unchanged, as the original's.

### 4.2 Where the medal stands (the sixteen dialogs)

Of READERC's dialogs, sixteen hold `playername` (a WRAPPEDTEXT on PLAYER_NAME_AND_TAG) with the five IMAGE children
`Medal_Blue` .. `Medal_Black` (each `<name>.tif`): `dlgClanLadderLobby`, `dlgCreateClan`, `dlgCreateGame`,
`dlgFriendList`, `dlgIgnoreList`, `dlgInvitedPlayers`, `dlgLadderLobby`, `dlgManageRoster`, `dlgManageRosterLeader`,
`dlgMPBriefingRoom`, `dlgOnlineFilters`, `dlgOnlineOptions`, `dlgRespondToInvites`, `dlgSetSOP`, `dlgSetTaunts` -- each
binding `ActivateMedalOfMerit` at its SCREEN's ONSTART -- and `dlgWorldOfSOCOM`, which binds `DisplayMedalOfMerit` on
ON_LADDER_REFRESH. No other binding names either animation. Four more dialogs carry a `playername` without the medals
(`dlgLAN_Options` on PLAYER_NAME_AND_TAG; `dlgLANBriefingRoom`, `dlgNetConnect` and `dlgUsagePolicy` a TEXT on
PLAYERNAMEVAR), and `dlgGameLobby` has none (research 155 §3, re-read: the game lobby's medals are its lists'). The
fifteen draw the valve as it stands at their build: the last position answer's (ONL-30a's two replies, §2.2).

**PLAYER RANKING's two sets of medals** (added 2026-11-02, task Cz2blD4S; reading, pending review). `dlgLadderLobby` is
the one dialog of the 114 in READERC and READERX whose screen holds names that differ only by case: the foot's
`Medal_Blue` .. `Medal_Black` under `playername` and the RANK INSIGNIA legend's `medal_blue` .. `medal_black` (§2.1),
the legend's shallower in `findNode`'s walk (`packages/ui/test/screens/nodeNameCaseDisc.test.ts`, which pins the list).
The menu's find-by-name compares by `strcmp` (`FUN_00315d00` D:L215255-215290, research 106 §8,
`NODE_NAME_MATCH_READING`), so `ActivateMedalOfMerit`'s HIDE / SHOW reach the foot's five and the legend's stay as the
layout draws them. Until this task the runtime folded case and took the first in the walk -- the legend's -- so the
foot drew all five pictures on top of each other and the legend only the one shown (a playtest screenshot); since,
`ladderLobbyScreen.test.ts` holds the foot's one medal and the legend's five.

### 4.3 The moments the position is asked

`FUN_002eafb0` (mode 1's ask; its reply `FUN_002eb010`) and `FUN_002eb2c0` (mode 0's and the default's; its reply
`FUN_002eb340`) have one caller in the decompiled text, `GetLadderInfo` (`FUN_002784d0`: D:L123424 for mode 1,
D:L123420 for mode 0, D:L123489 for any mode above 11); neither function's address stands anywhere else in the text,
and the replies' only as the asks' own callbacks (D:L188988, D:L189110). The one other writer of the cached total,
`FUN_002eb1b0` (GetTotalRankings' reply, "PlayerTotal" S:0x3f46c8 or "ClanTotal" S:0x3f4608, D:L189054-189090), is asked
only by the clans' `FUN_002eab80`, with "ClanTotal" (D:L188820-188823). And every `GetLadderInfo` the disc's sets carry
(the three archives; each command's mode word at +0x10): `dlgWorldOfSOCOM`'s ONSTART 1 and 7; `dlgLadderLobby`'s
ONSTART 0, and 2-5 on its L1 / L2 and arrows; `dlgClanLadderLobby`'s 6 and 8-11 -- **no mode above 11**. So the
original asks my position at two moments only: SOCOM II ONLINE's build (mode 1, at any state) and PLAYER RANKING's (mode
0, only while up in state 11) -- both ONL-30a's, built. **Nothing more to build**: the fifteen ONSTART dialogs draw what
the menu's last answer left.

### 4.4 The game lobby's two lists (W18.R7)

- **The column** (`dlgGameLobby.rdr`, `tools/dump-dialogs.ts --dialog dlgGameLobby.rdr --tree`): `B_SEALLIST` on
  BSEALLISTVAR and `B_REDLIST` on BTERRLISTVAR, four columns each -- 60 (the name); **202 at TOP_OFFSET -16, an IMAGE 12 x
  12, TEXTURES `null.tif`, `Medal_Blue.tif`, `Medal_Bronze.tif`, `Medal_Silver.tif`, `Medal_Gold.tif`,
  `Medal_Black.tif`** (the medal, `TEXTURES[value]`); -1 at TOP_OFFSET -15, an IMAGE 8 x 8 (the ready dot); 14 (the
  tag). `B_SPECLIST` has one column.
- **The original's two writers**: the game's player list `FUN_002c5010` (D:L166061-166178; drawn while the game object's
  +0x114 is 1, D:L166084) builds each side's rows `[name +0xe, medal +0x42, dot, keyed tag]` (D:L166120-166121,
  D:L166140-166141) from each player state -- the medal each console publishes, `FUN_002eaee0` of its own position, or 4
  for the name `oop9` (`FUN_002c5360` D:L166200-166205; H189) -- into the four variables at the game object's +0x84 ..
  +0x90 (D:L166168-166171) -- *[traced at the merge, the review's F2]* `FUN_002a76d0` (D:L149526-149533) sets those four slots
  to BSEALLISTVAR, BTERRLISTVAR, BSPECLISTVAR and BNONELISTVAR (S:0x3f1040-0x3f1070), so both writers fill the same two
  lists (that the object is `DAT_00437ce8`'s is not proven, only that its +0x112 / +0x114 layout fits); and the lobby server's reply to
  `RefreshGamePlayerList`, `FUN_002f7020` (D:L196331-196496), builds the same shape into BSEALLISTVAR and BTERRLISTVAR
  (S:0x3f5788, S:0x3f5798; D:L196468-196469) by **its own arithmetic**: `FUN_002eaee0` of each player's record position
  against the console's own total (D:L196436, D:L196448; my own seat's from my position, D:L196407, D:L196420).
- **The port** (`LOBBY_MEDAL_TOLD_READING`): each seat's medal is the room's last `seatTold` -- SVC-07c's event, sent at
  every seat's join and after each counted round, each naming every player seated (research 264 §2); its medal the
  server's `medalOf` at the seat's standing with `oop9`'s 4 applied (`publishedMedal`), the first writer's value -- and
  0 (`null.tif`) for a seat the event names not. The page computes no medal (W18.R7: the second writer's arithmetic would
  be the page's own). `GameLobbyCommands.seatTold` takes the client's `SeatToldBoard` whole and draws the lists again;
  `GameSocketHost` hands the board over at each `seatTold` (the board hears the event first: its listener is the
  client's own, added at the client's construction) and at the way back from the match (`adopt`: a round's event
  reaches the match's client, not this host). A new game held, or the lobby left, forgets the last game's medals.
  `PLAYER_TIER_PARKED_READING` (research 165 §6) is narrowed to the rank refusal: the lists draw a medal now.
- **The H189 case** stays the server's (`publishedMedal`; `OOP9_MEDAL_NAME_READING`, research 264 §6): the page draws
  the 4 it is told.

### 4.5 The star on a ladder under 12

`FUN_002eaee0` gives 5 to every position while the total is 1 to 11 (D:L188946-188948), and the server's `medalOf` is
held equal to it (`tools/test/ladderLobbyParity.test.ts`). So a ladder under 12 tells every ranked seat 5, the lists draw
`Medal_Black.tif` on every row, and the name's medal on the sixteen dialogs is the star (the valve 5) -- the look of the
archived frames (`A_45_lobby2.png`, `A_54_gamelobby2.png`: the star for everyone, research 155 §3 "The star
explained"). Tested at the reading level; **the proven level -- the star's place and size against the two frames -- is
owed to a browser window on the owner's word** (the plan's gate item 5), not run here.

### 4.6 ONL-30a's owed test (its review's F3)

PLAYER RANKING's tint compares a row's name with the session's by `FUN_00198f18` (D:L189399), a strcmp (D:L15847-15859:
byte by byte, case kept), so a row whose name differs from mine only in case is **not** tinted. `rankingRows` and the
rows' mode 0 page are tested so (`medalOfMerit.test.ts`); no code changed.

### 4.7 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `LOBBY_MEDAL_TOLD_READING` (ui `screens/gameLobbyCommands.ts`) | `'each seat\'s medal from the last SEAT-TOLD event; 0 (null.tif) for a seat it names not'` | the game lobby's lists' medal column. The original has two writers: the player states' published +0x42 (`FUN_002c5010` D:L166121, D:L166141; `FUN_002c5360` D:L166200-166205) and the lobby server's reply's own `FUN_002eaee0` of each record's position (`FUN_002f7020` D:L196436, D:L196448); the port draws the first's value as the server tells it (W18.R7). Which the console shows last between rounds, and what a state not yet published holds (0 here), are unread (§4.4); one concrete case: the second writer applies no `oop9` override (D:L196407 / 196420 / 196436 / 196448), so a pre-round lobby drawn by it shows `oop9`'s computed medal where the port draws 4 | ONL-32's transcript of a game lobby with ranked players across a round; a capture of the lists with a medal other than the star | reading |

`PLAYER_TIER_PARKED_READING` is research 165 §6's row, narrowed there (2026-10-12) to the rank refusal. The names this
section leans on are listed where they live: `SEAT_TOLD_BETWEEN_ROUNDS_READING`, `SEAT_TOLD_PLAYERS_ONLY_READING` and
`OOP9_MEDAL_NAME_READING` (research 264 §6); `READY_DOT_READING` and `GAME_PLAYER_LIST_PUSH_ADAPTATION` (research 165).

### 4.8 The tests, and the runs (unit tests, a dev-disc test and the pages over the machine; no browser, no capture)

- `tools/test/medalOfMeritDisc.test.ts` (new, dev-disc; it skips without `SOCOM_DISC` / `SOCOM_PC_ROOT`): the sixteen
  dialogs and their bindings; both sets' ops, every copy of `ActivateMedalOfMerit`, the valve tests' operation byte 2,
  flags 2 and operands 1-5; every `GetLadderInfo` site with its mode, and the position's two asks.
- `packages/ui/test/screens/medalOfMerit.test.ts` (new): for each medal 0-5, a seeded ladder through the ladder service's
  fake -- SOCOM II ONLINE's image (`DisplayMedalOfMerit` on the position's answer) and IGNORE's (`ActivateMedalOfMerit` at
  its ONSTART) over the machine from the disc (or the fixtures); the lobby's lists from `seatTold` (0 before any event,
  0 for a seat not named, the next event replacing the board, a side switch keeping the told medals, the star for all,
  `oop9`'s told 4, a new game forgetting); the case-only tint, by `rankingRows` and over mode 0's page.
- `packages/ui/test/screens/gameLobbyScreen.test.ts`: the two lists over the machine with their textures
  (`Medal_Black.tif` on both rows, then `Medal_Bronze.tif` and `Medal_Gold.tif` after the next event).
- `packages/viewer/test/gameLobbyHost.test.ts`: the room's `seatTold` reaching the lobby as the client's board holds it
  (an out-of-range medal dropped by the board); a round's event heard by the match's client handed back at `adopt`; the
  server's own `medalOf` and `publishedMedal` on a ladder of 5, through the socket into a real `GameLobbyCommands` -- the
  star for two players, `oop9`'s 4.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 5. The in-round scoreboard's online fields (ONL-19)

SELECT held in a network round (research 87 §12, research 91 §11). This section reads the board's online half from the
decompilation and the ELF's strings (read with `tools/elfImage.ts`). It is not measured on the original running: no
frame of the held board is archived (87 §12). ONL-32's recomp capture of an online round with SELECT held is the
proven level. Both builders run only in a network game (`DAT_0045a0c1`, D:L79674, D:L80021).

### 5.1 GAME DETAILS (`FUN_0022be20` D:L79676-79866)

The branch is `FUN_003045b0(0x44fe10)` (D:L79678). It reads the valve `ComeFromLan` (S:0x3f6328; D:L204495-204506), and
a non-zero value is the LAN branch. Each line's text comes from `FUN_00385900(0x437e80, name)`, the UI variable table.
A string variable (type 3) gives its text. A missing variable gives "UNKNOWN" (S:0x3e57e8).

| line | online (`ComeFromLan` 0) | LAN | cite |
|---|---|---|---|
| 1 (y 145) | the UI variable MEDIUS_LOBBY_NAME (S:0x3e57d0) | "LAN game" (S:0x3e5860) | D:L79680-79689; D:L79780 |
| 2 (y 165) | the UI variable GAMENAMEVAR (S:0x3e57f0), laid as "???" (S:0x3e5800) and then given its text (`FUN_00363830`) | the same; a held variable that is not a string gives "GAME TYPE ERROR" (S:0x3e5870) | D:L79709-79721; D:L79797-79812 |
| 3 (y 185) | the type word by game +0x111 (`DAT_00437ce8`): 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACT, 5 SUPPRESSION (S:0x3e5828-0x3e5850), else "GAMETYPE ERROR02" (S:0x3e5810) | the same switch | D:L79739-79754; D:L79830-79845 |

- **The pen** is x 24 (0x41c00000). The y is 104 + 25 + 16 (`DAT_003dc940`), stepping by 20 (`DAT_003dc948`): 145,
  165, 185. The scale is 0.8 (`DAT_003dc8d0`) and the colour is (115, 115, 115) at alpha 110 (`DAT_003dc900`).
- **The cut:** while a line is wider than (152 - 10) - 24 = 118, its last character is dropped and "-" appended
  (D:L79696-79706 and each line's copy). This is the same as the LAN lines, and as `cutLine` does.
- **Built once, at the open:** the three lines are built only on the press, while `DAT_0040f608` is 0
  (D:L79676-79866). The 1.0 s rebuild while SELECT is held calls `FUN_0022cc10` alone (D:L79872-79876), which rebuilds
  the panel and the spectators and never touches the details' text objects 0x40f410 / 0x40f4c0 / 0x40f570. Their other
  uses are the draw (D:L79143-79145) and the close (`FUN_0022bb30`: `DAT_0040f608 = 0` at D:L79529, their release at
  D:L79543-79545). So a variable changed while the board is up is not seen until the next open. The port takes the
  details when the board opens (SELECT pressed) and keeps them until it closes.
- **Not modelled: three error branches.** On every path of the port a held variable is a string (`uiVar` answers
  null both for a variable not held and for one that is not a string), so none of these is reached:
  - on a LAN, a held GAMENAMEVAR that is not a string draws "GAME TYPE ERROR" (S:0x3e5870, D:L79807-79809), where the
    port would draw "UNKNOWN";
  - online, a held MEDIUS_LOBBY_NAME that is not a string copies from a null pointer (D:L79685-79690);
  - online, a held GAMENAMEVAR that is not a string does the same (D:L79713-79719).
- **What the front end's session holds:**
  - MEDIUS_LOBBY_NAME is the room's name, written at the room's join (`@s2u/ui` `briefingRoomCommands.ts`,
    `FUN_002e0450` D:L182779-182780).
  - GAMENAMEVAR is the game's drawn name, the part before "$~". It is written when the game is held, for the joiner and
    for the host alike: the host's `CreateMPGame` value "<name>$~<room>" is replaced at `created` -> `enterGameLobby`
    -> `hold` (`gameLobbyCommands.ts`, D:L197346-197355, `GAME_NAME_DRAWN_CUT_READING`).
  - `ComeFromLan` is the opener's valve, read the same way as KEYBOARD-WHISPER's line (`FUN_001f7ff0` D:L56828-56830,
    research 266 §3.9).
  - `sessionGameDetails` reads these three; the port computes none of them.
- **`/testroom`'s served round** has no Medius lobby and no created game. Its two variables take the ARMORY title bar's
  stand-ins for the same two variables (`servedRoomDetails`, equal to `armoryNames` online):
  - MEDIUS_LOBBY_NAME is the match server's name (the welcome's `server`), else `ARMORY_SERVER_NAME_READING` ("LOCAL").
  - GAMENAMEVAR is the room's map (`ARMORY_GAME_NAME_READING`).
  - These are research 95 §8 and the controller's ruling under the owner's mandate, 2026-10-01.
  - The round is served, so the branch is the online one.
  - The viewer's own walk, with no room, keeps the LAN fill it had (`LAN_GAME_LINE`, the map, its type).

### 5.2 The rows: "[clan]" and the name (`FUN_0022a290` D:L78976-79097)

- **The name** is the player's +0x14. It is drawn at `DAT_0040f628` + 70 = 153 + 70 = 223 (D:L79033-79035;
  `DAT_003dc8e0` holds the integer 70).
- **The clan** is a separate string at `DAT_0040f628` + 10 = 163 (D:L79052-79053). Its 16-byte buffer is seeded from
  `_DAT_003dc980`. That word holds the bytes 20 00 00 00, followed by two zero words, so the seed is one space
  (D:L79043-79046). `FUN_002c3ac0` looks up the player's slot at +0xfc8 (D:L79042, D:L165206-165222). The slot's record
  in `DAT_004414c4` gives its +0x2e, the clan tag (research 91 §13); no record gives "" (S:0x3f2a30). When that lookup is
  non-null and non-empty (`FUN_00199288`), the buffer becomes "[" (S:0x3e57a0), the tag, "]" (S:0x3e57a8)
  (D:L79047-79051).
- So a row with a clan draws "[TAG]" at 163 and the name at 223, as two strings. A row without one draws one space at
  163 (nothing seen) and the name at 223. The tag is not cut: the function has no cut loop.
- **The colours** (D:L79004-79025, D:L79040, D:L79058):
  - The name is (115, 115, 115). The local player's blue is 12 (0x41400000, D:L79020), on the name alone.
  - The clan is (128, 64, 32) on every row.
  - Both are scaled by 0.6 when +0xe1 bit 4 is clear.
  - Both take alpha 110 through the +0x34 call with `DAT_003dc900`.
- **The buffer's end:** the buffer is 16 bytes as the decompiler lays out the frame. "[" + a tag of 14 or more
  characters + "]" + NUL runs past it (the record holds up to 15, R91 §13). What the console then draws is unread; the
  port draws the whole tag (`CLAN_TAG_OVERRUN_READING`, §5.6). No tag of the port reaches the board today.
- **A finding against the plan's and the roadmap's cite:** 0x3e53b8 "[%s]" and 0x3e53c0 "" (R91 §18.2.4) are the round
  end screen's list, not this board's: `FUN_00224210` formats them (D:L76312-76317), called from `FUN_00223680`
  (D:L75946-75949; `roundScreens.ts`). The board builds its own "["
  + tag + "]": the same visible form from other strings.
- **The port:** `ScoreRowInfo.clan` is drawn as above. The room's `score` rows carry no clan (`room.ts`
  `scoreEvent`; `net/protocol.ts` `ScoreRow`), so every row draws as one without a clan. The clans are parked on the
  round's path, as the talker's line is (`TALKER_CLAN_PARKED_READING`, research 227 §3). The feed is the clans' half: a
  member's tag on the room's rows, a protocol and room change (§7). *(Fed 2026-10-13 by CLAN-TAG-ROUND, research 275: the
  room's score rows carry each seat's tag, the page draws it as above, unchanged.)*

### 5.3 The spectators (`FUN_0022cc10` D:L80021-80062; the slots `FUN_0022ac30` D:L79207-79216)

- **The walk:** the builder walks the player list (`DAT_004362e8`, next at +4, the object at +8 when its +0x10 is 2)
  in its own order. It takes each object `FUN_002c2fd0` calls a spectator (D:L80036; D:L164611-164640): the local
  player by the lobby's own flag (`FUN_002f6d00(0x44f370)`), another by its record's bit 0x10000.
- **Each slot:** the spectator's name (+0x14) goes into the next of eight slots, cut to 118 with "-"
  (D:L80038-80049). The walk stops at 8 (D:L80030), and the slots left over are emptied (D:L80056-80060).
- **The place:** x 24 (0x18), y 254 + 16 + 16.8 i, which is 270 + 16.8 i (D:L79214), at scale 0.8 and alpha 110.
  The team rows leave spectators out (`FUN_0022de60` D:L80605).
- **The colour:** the slots' colour is not set here. It is the text object's own default (`FUN_003631c0`'s virtual
  initialiser, unread). The port draws the details' (115, 115, 115) (`SPECTATOR_RGB_READING`, §5.6). ONL-32's
  capture settles it (§7).
- **The port:** the room's `score` frame names the spectators (`room.ts` `scoreEvent`, the lobby's `spectators()`).
  They reach `NetPage` -> `Hud.setScoreRows` -> the board's cap of 8 and its cut. Both matches take this one wiring
  (research 101 §7, SVC-25's audit).
- **The order:** the port's lobby lists the queue head first, then the watchers in join order (`net/lobby.ts`). The
  original lists its player list's order, whose insertion is not read here. The two agree while no spectator is
  queued behind a watcher (`SPECTATOR_ORDER_READING`, §5.6, §7).

### 5.4 No rank, medal or rating

The board draws name, clan, kills, deaths and score, and in the original the satchel. No code path above reads a
rating, a medal or a position (research 155 §3, R155.11). The port's board reads none either: a row that carries
SEAT-TOLD's rating and medal draws exactly as one without, and the board's textures are `newweapnbkrnd.tif` and the
font alone.

### 5.5 The port and the tests (unit tests; no browser, no capture)

- `scoreboard.ts`:
  - `gameDetailLines` gives the three lines from `GameDetails`. The board takes `details`; without it, the LAN fill is
    unchanged.
  - `ScoreRowInfo.clan` gives "[TAG]" at 163 in (128, 64, 32). Without a clan the row draws `NO_CLAN`, the space.
  - `sessionGameDetails` is the front end's source, and `servedRoomDetails` is `/testroom`'s.
- `packages/viewer/test/scoreboardOnline.test.ts` (new) holds:
  - the online lines, "UNKNOWN", the LAN lines, and the five type words through `gameCaption`;
  - the lines' place and their cut, and the LAN fill unchanged;
  - both sources (`sessionGameDetails` over a session's variables and valve; `servedRoomDetails` against
    `armoryNames`);
  - "[clan]" with and without a clan: the local player's, the dead row's, an uncut tag;
  - the spectators' order, cut and cap of 8;
  - no rank, medal or rating.
- **The feeds** (claimed by content on `agent/online`'s HANDOFF §3):
  - `hud.ts`: `Hud.setGameDetails` takes the details' getter; `setScoreboard` reads it when the board opens into the
    model's `scoreboardDetails` and clears it at the close (§5.1). `boardLayout` draws from that field, so the page's
    pass (`hudPass`, `Hud.render`) and the board's measure (`state()`) share one source.
  - `matchMount.ts`: the front end's mount gets the session's ports (`gameVars`, handed by `frontEnd.ts`, which imports
    no board: OT.R12) and sets `sessionGameDetails` after each map's `setGame`.
  - `main.ts`: `/testroom` sets `servedRoomDetails(net.serverName(), map.name)` while a served round is up (`net` and
    no `solo`); the walk keeps the fill.
  - `packages/viewer/test/scoreboardFeeds.test.ts` (new) draws through `hudPass` over the HUD's own model. It holds
    the details taken at the open (a variable changed while SELECT is held leaves the line; the next open shows the new
    one), the model's field cleared at the close, and null giving the fill back. It also pins the three mounts' lines; `startMenu.test.ts`'s pin of the mount call is widened to admit
    `gameVars`, in the same order.
- The runs and their counts are in the task's report (RED, then GREEN, one file per run).

### 5.6 Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `SPECTATOR_RGB_READING` (viewer `scoreboard.ts`) | `[115, 115, 115]` | the SPECTATORS names' colour: `FUN_0022ac30` sets only their scale and alpha 110 (D:L79212-79216); the colour is the text object's own default (`FUN_003631c0`'s virtual initialiser, unread). The port draws the details' | ONL-32's recomp capture of an online round with SELECT held and a spectator; or a read of the text object's initialiser | reading |
| `SPECTATOR_ORDER_READING` (viewer `scoreboard.ts`) | `'the room\'s: its queue head first, then the watchers in join order'` | the spectators' order: the original walks its player list (`DAT_004362e8`, D:L80021-80055), whose insertion order is unread; the port lists the room's lobby order (`net/lobby.ts`). The two agree while no spectator is queued behind a watcher | a read of the player list's insert, or the same capture with a spectator queued behind a watcher | reading |
| `CLAN_TAG_OVERRUN_READING` (viewer `scoreboard.ts`) | `'the whole tag, uncut'` | a clan tag of 14 or 15 characters, past `FUN_0022a290`'s 16-byte buffer (D:L79043-79051): what the console draws is unread; the port draws the whole tag. No tag reaches the board yet (the clans' half) *(one does since CLAN-TAG-ROUND, research 275: the published state's 15 at most)* | the same capture with a member whose tag is 14 or 15 characters | reading |

## 7. What is left

- **ONL-25** (§1): done at the reading level, reviewed. Owed: ~~the services' AccountGetID and the add's lookup moved
  to it (`IGNORE_NAME_LOOKUP_PLACEHOLDER`)~~ *(built by NU-14, 2026-10-15: `/lobby/account-id`, §1.6 item 1)*; ~~the rows' PlayerStatus under PROFILE-PRIVACY (SVC-15, research 268 §1.5 item
  4)~~ *(wired by SVC-15, 2026-10-12: research 268 §3.3 item 1, the ignore service's `sees` in `bridge.ts`'s
  `createServices`)*; the recomp capture of the page and ONL-32's transcripts (an add, a remove, a list, a refused add).
- **ONL-30a** (§2): done at the reading level, reviewed. Owed: ~~the services' ladder row carrying the account id
  at +0x20 and the key and PLAYER INFO's request moved to it (`LADDER_ROW_KEY_ADAPTATION`; a server task, the finding
  against research 155 §2.2 that no column draws the rating); a position route taking the bearer's own account, which
  would make my position one request again (`LADDER_POSITION_BY_NAME_ADAPTATION`)~~ *(both retired by SVC-15,
  2026-10-12: research 268 §3.6, `ladderLobbyHost.ts:20-22`)*; the clans' modes with SVC-11 and
  CLAN RANKING (`CLAN_LADDER_MODES_PLACEHOLDER`, H188); ~~the CLAN / FRIEND / BRIEFING origins' lists with their pages
  (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`)~~ *(retired 2026-10-15 by PLAYER-INFO-CLAN, §2.5)*; the LISTBOX's nested keyed value (`LADDER_KEYED_CELL_READING`); ~~ONL-34's
  check of `DisplayMedalOfMerit`'s and `ActivateMedalOfMerit`'s ops (§2.4 item 7)~~ *(done 2026-10-12, §4.1)*; the proven level -- no frame of
  PLAYER RANKING or PLAYER INFO is archived (research 155 §3): the recomp capture of both pages and ONL-32's transcripts of
  a 0xf1, an 0xef page and a PlayerInfo from the ladder.
- **ONL-24** (§3): done at the reading level, reviewed. Owed: ONL-32's two-persona recomp run (the acceptance:
  request, confirm with the add back, reject, remove, the list's states, the refused requests that settle
  `FRIEND_REQUEST_EVENT_READING`); a two-client e2e (welcome, the seat's, separately for the browser slot); ~~the CLAN and
  BRIEFING origins of PLAYER INFO~~ the CLAN origin of PLAYER INFO (`PLAYER_INFO_ORIGIN_LISTS_PLACEHOLDER`, ~~ONL-27~~ *[2026-10-13: not ONL-27's -- it kept the placeholder, research 272 §11; a later row, LATER 42]* *[2026-10-15: built by PLAYER-INFO-CLAN, the placeholder retired, §2.5]*) *(the BRIEFING origin built by
  SVC-15, 2026-10-12: research 268 §3.5)*; the owner's word if a friend's
  consent is to be withdrawable (H191). No INVITE TO GAME is owed on this page: the record has none (§3.1).
- **ONL-34** (§4): done at the reading level, reviewed. Owed: the proven level -- the star's place and size on the
  sixteen dialogs and in the lobby's lists against `A_45_lobby2.png` and `A_54_gamelobby2.png`, a capture comparison in a
  browser window on the owner's word (the plan's gate item 5); the other four medals need a ladder our Horizon cannot give
  (ONL-32, or the owner's frames of the original); which of the lists' two writers the console shows last between rounds
  (`LOBBY_MEDAL_TOLD_READING`, ONL-32's transcript). Nothing owed for the position's asks: the original has no moment
  beyond ONL-30a's two (§4.3).
- **ONL-19** (§5): done at the reading level, reviewed, in both matches (§5.5). Owed:
  - ONL-32's recomp capture of an online round with SELECT held: the three lines, a clan row, the spectators and their
    colour (`SPECTATOR_RGB_READING`), a 14- or 15-character tag (`CLAN_TAG_OVERRUN_READING`) (§5.6);
  - ~~the clans' half: a member's tag on the room's `score` rows (protocol and `room.ts`, with SVC-08's tag), which
    `ScoreRowInfo.clan` draws as read~~ *(CLAN-TAG-ROUND, 2026-10-13: research 275)*;
  - the original's player-list order for the spectators against the port's queue-then-watchers
    (`SPECTATOR_ORDER_READING`, §5.6), on the same capture or a read of the list's insert.
