# 265 -- ONLINE OPTIONS and ONLINE FILTERS: the rows, their valves, the SAVE and the description to the record (OPT-15, ONL-15)

- Date: 2026-10-10 (web sprint 22, wave 1; the plan `../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md`,
  W22.R1; the brief `../plans/briefs/2026-10-10-s22-w1-opt-15.md`). Written for OPT-15 on `agent/online-opt15` from
  `agent/online` 9b6ca2509; section 2 is ONL-15's (the brief `../plans/briefs/2026-10-10-s22-w1-onl-15.md`), written on
  `agent/online-onl15` from `agent/online` 0bce90cd5.
- Status: **reading, reviewed** (OPT-15 and ONL-15 2026-10-10, each by a reviewer who did not write it; the sprint's
  Log). Every value below is transcribed from the US disc through the repository's
  readers -- the dialogs `RUN/UI/READERC.ZAR` and their scripts `RUN/UIZANIM.ZAR` (`tools/dump-dialogs.ts --dialog
  dlgOnlineOptions.rdr --tree`, `tools/dump-online-dialogs.ts --dialog dlgOnlineOptions.rdr`), the ELF's strings
  (`tools/elfImage.ts`) -- the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never
  pasted), the ELF's instructions read by address where the decompilation has no block, and the recomp's saved cards
  under `SOCOM_PC_ROOT` read with the dev tool (`tools/cardFile.ts`). Nothing here is measured on the original running:
  the recomp's captures of the page and its toggle-and-card-diff runs are OPT-19's (H25).
- Stands on research [229](229-the-options-and-personas-json.md) (§2 the 65 valves, §3 the toggles' table, §4 the
  persistence rule), [301](301-original-taunts.md) §6 and [302](302-original-options-and-communications.md) §3 (SETUP
  TAUNTS and SETUP MESSAGING, their editors and the card's `CUIVarManager` module), [155](155-the-stats-record-the-ladder-and-the-ranks.md)
  §1.1 and §4.1 (the record; "a page never reports a result"), [261](261-the-stats-record-and-the-ladder.md) §4-§5 (the
  record's bytes and its store), [119](119-the-software-keyboard.md) §5-§6 (the keyboard's requests, caps and fit),
  [105](105-the-dialog-loader.md) R105.6 (the keys the engine never reads), and does not restate them.
- Code (OPT-15): `packages/ui/src/screens/onlineOptionsCommands.ts` (`OnlineOptionsCommands`, `SetPlayerDescription`),
  `packages/ui/src/screens/worldOfSocomCommands.ts` (`ONLINE_OPTIONS_PARKED_ROWS`, empty), `packages/central/src/ownerFields.ts`
  (`OwnerFieldsService`, `OWNER_FIELDS`), `packages/central/src/lobbyHttp.ts` (`/lobby/owner-fields`, `LOBBY_OWNER_PATHS`), `packages/central/src/bridge.ts` (the mount),
  `packages/viewer/src/worldOfSocomHost.ts` (`fetchOwnerFieldsService`, `sessionOwnerFields`, the mount),
  `packages/viewer/src/frontEnd.ts` (the session's option). Tests: `packages/ui/test/screens/onlineOptionsScreen.test.ts`,
  `packages/central/test/ownerFields.test.ts`, `packages/viewer/test/worldOfSocomHost.test.ts`, and the dev-host
  `tools/test/onlineOptionsSaveDisc.test.ts`.
- Code (ONL-15, §2): `packages/ui/src/screens/onlineFiltersCommands.ts` (`OnlineFiltersCommands`, `GetMissionInformation`,
  `gameTypePasses`, `seedNumMultiMissions`), `packages/ui/src/screens/autoplayCommands.ts` (`AutoplaySearch`,
  `autoplayCandidate`, `autoplayPick`), `packages/ui/src/screens/briefingRoomCommands.ts` (`passes` with the type, the
  AUTOPLAY half: `readAutoplayFilters`, `admits`, `joinRoomForRandomGame`), `packages/ui/src/screens/gameLobbyCommands.ts`
  (`JoinMPGame(RANDOM)`, `randomGameFound`, state 17's MP_MEDIUS_READY_TO_CONNECT), `packages/ui/src/screens/worldOfSocomCommands.ts`
  (AUTOPLAY's row unparked, the entry list), `packages/viewer/src/briefingRoomHost.ts`, `gameLobbyHost.ts`, `frontEnd.ts`
  (the mount). Tests: `packages/ui/test/screens/onlineFiltersScreen.test.ts`, `packages/ui/test/screens/autoplay.test.ts`,
  `packages/central/test/lobby.test.ts` and `lobbyHttp.test.ts` (the seeded set, AUTOPLAY's chain over the endpoint).

## 1. ONLINE OPTIONS (OPT-15)

SOCOM II ONLINE's OPTIONS row opens `dlgOnlineOptions.rdr` (`Goto_Options`, unparked with the taunts, research 301 §6).
Its scripts are `dlgOnlineOptions.rdr`, `uianim.rdr` and `UIMemCardAnim.rdr`; its set holds 20 animations.

### 1.1 The rows

| row (caption) | control | its binding | what the disc's script does | valve or home | today |
|---|---|---|---|---|---|
| PLAYER DESCRIPTION (`_397_PlayerDescr_MSG`, #397) | BUTTON `playerdesc` | CROSS `SetPlayerDescription`; ONACTIVATE `playerdescAct` (help #682) | `.DINK`; `GetTextInput(PlayerDescription)`, waits while `skb_done != 1`; the dialog's `ON_SKB_APPLY` runs `OnSKBApply`: the command `SetPlayerDescription`, `DescChanged = 1` | no valve: the UI variable `PlayerDescription` (the WRAPPEDTEXT at (210,128)), sent to the record's +0x9f (§1.3) | runs (OPT-15) |
| SETUP MESSAGING (#674) | BUTTON `Messaging` (the first) | CROSS `goto_menu(dlgSetSOP.rdr)`; help #684 | `SwitchMenu` | `MPLOCALSOP1-5`, the card's `CUIVarManager` (302 §3) | runs (2026-10-07) |
| SETUP TAUNTS (#675) | BUTTON `Messaging` (the second) | CROSS `goto_menu(dlgSetTaunts.rdr)`; help #683 | `SwitchMenu` | `MPTAUNTMSG1-5`, the same module (301 §6) | runs (2026-10-07) |
| INPUT FILTERS (#676) | BUTTON `filters` | CROSS `goto_menu(dlgOnlineFilters.rdr)`; help #686 | `SwitchMenu` | no valve of its own: the page `dlgOnlineFilters.rdr` and its valves (`GameTypeMapIndex`, `GameTypeFilter`, `GamePlayerFilter`, `GameSpeedFilter`, `FF_FILTER`, `LockedFilter`, `GamePasswordFilter`) -- ONL-15's (§2); its RETURN and TRIANGLE come back here | runs (OPT-15): the disc's page opens; its effect on the game list is ONL-15's |
| TEAMMATE NAMES (#677) | RADIOSTRIP `TeamMateNames`: `TeamMateNameOn` (#185) / `TeamMateNameOff` (#678) | ONCHECK `Enable_TeamNames` / `Disable_TeamNames`; help #680 | `DISPLAY_MP_TEAM_NAMES` = 1 / 0, `DISPTEAM_NAMES` = 1 (either box: "changed"), `OptionsMenuChanged` = 1 | `DISPLAY_MP_TEAM_NAMES`, one of the 65 PERSIST valves (229 §2-§3, default 1) | runs (OPT-15); its in-round effect is not this task's (§1.2) |
| EXTERNAL WHISPERS (a literal caption, no UIMnLOC id) | RADIOSTRIP `ExternalWhispers`: `WhispersOn` / `WhispersOff` | ONCHECK `Enable_Whispers` / `Disable_Whispers`; help: a literal text ("Toggle in-game Text Messages ON or OFF.") | `EnableExternalWhispers` = 1 / 0, `OptionsMenuChanged` = 1 | `EnableExternalWhispers`, one of the 65 (default 1) | runs (OPT-15); its in-round effect is not this task's (§1.2) |
| SAVE (#679) | BUTTON `ForceSave` | CROSS `ForceSave`; help #681 | `CALL save_and_leave` (`UIMemCardAnim.rdr`: #831, the slot, `Ensure_MC_Dirs`, `SaveConfig(BASCUS-97275SOCOMII)`) | the card (§1.4) | runs (2026-10-07) |
| RETURN (#67) | BUTTON `return` | CROSS `check_then_save_and_leave`; help #322 | with `OptionsMenuChanged == 1`, `save_and_leave`; else `SwitchMenu(dlgWorldOfSOCOM.rdr)` | -- | runs (2026-10-07) |

- **The dialog's own events.** ONSTART `OnStartAct`: `TEMPDISPLAY_MP_TEAM_NAMES = DISPLAY_MP_TEAM_NAMES`, `DescChanged =
  0`, `CopyUiVar` (the description's copy; the names `PlayerDescription` and `TEMPPlayerDescription` are the set's), the
  strips selected from the two valves (`TeamMateNames.op4` / `ExternalWhispers.op4`: the ON box for 1, the OFF box for
  0), `WAIT 0.5`, `DISPTEAM_NAMES = 0`, `OptionsMenuChanged` kept as it came in. TRIANGLE `OnOptionsBack`: with
  `DescChanged == 1` or `DISPTEAM_NAMES == 1`, the popup "Are you sure you want to clear your changes?" (#246 / #253);
  an answer of 1 runs nothing more; the other restores the description (`CopyUiVar`, then the command
  `SetPlayerDescription` again with the old text) and `DISPLAY_MP_TEAM_NAMES` from its copy, re-selects both strips,
  sets `OptionsMenuChanged = 0` and runs `check_then_save_and_leave`. Without a change TRIANGLE runs
  `check_then_save_and_leave` at once.
  **The whispers have no copy and no change flag**: the discard leaves `EnableExternalWhispers` as toggled and a whisper
  change alone asks nothing. The disc's behaviour, run as the scripts hold it.
- **The strips' `VALVE` key.** Both RADIOSTRIPs carry `VALVE DISPLAY_MP_TEAM_NAMES` -- `ExternalWhispers` too, a copy
  slip on the disc -- and the engine never reads a RADIOSTRIP's `VALVE` (research 105 R105.6): the selection is the
  ONSTART's `op4`, so the slip is inert, in the original and here.
- **The unpark.** `ONLINE_OPTIONS_PARKED_ROWS` (`worldOfSocomCommands.ts`, OT.R8) held PLAYER DESCRIPTION, INPUT FILTERS
  and the two strips since 2026-10-07 (research 301 §6); it is empty since OPT-15, its gates kept for a later row. Every
  row's script runs whole; the only command the four needed that was not answered is `SetPlayerDescription` (row 101
  of PLAT-08's table, `FUN_00277640`; `GetTextInput` is PLAT-17's).

### 1.2 The two valves and where their effect lives

- **`DISPLAY_MP_TEAM_NAMES`** (the name at 0x3e5540) is read where an actor's HUD part is set up: `FUN_00227340` takes
  the valve (`FUN_00351ff0`, D:L77558) into its flag at +0x5e4 (D:L77559). OPTIONS' VIDEO page has the same strip
  (`dlgOptions_Video`, parked for OPT-11; research 229 §3) on the same valve. **The in-round effect -- the teammates'
  names drawn or not -- is the HUD's (SVC-19 / the HUD's task), not this task's** (the plan's H-next e: the row on ONLINE
  OPTIONS as O21 lists it, its effect SVC-19's / the HUD's). The page's match does not read the valve today.
- **`EnableExternalWhispers`** (0x3ef0e0) is copied by `StoreOptions` (`FUN_0027b960`, the valve D:L125147, the branch
  D:L125150-125155) through `FUN_002a41f0` (D:L147670-147692: the valve written, the global `DAT_003de620` set,
  D:L147690) -- the page's `OptionGlobals.store` copies it with the other option valves (`OPTION_VALVES`,
  research 302 §4). In the round, `FUN_001f7ff0` passes a chat message of kind 5 on only when the global is set or
  `FUN_0029e590` admits it (D:L56712-56715),
  and the in-game menu's entry 0xb toggles it, "IN-GAME TEXT MESSAGES ON / OFF" (`FUN_002041e0` D:L61858-61867;
  `FUN_00204a40` D:L62104-62111 draws it). **That effect is the match chat's (SVC-19), not this task's**; what kind 5
  is (the help text's "in-game text messages", the caption's "external whispers") is read no further here.

### 1.3 PLAYER DESCRIPTION: the keyboard, and the text to the record

- **The keyboard** (research 119 §5's row): `GetTextInput` on `PlayerDescription`, layout `PlayerChatSkb`, **63
  characters / 65 bytes**, no flags. The caps and the one-line fit (`SKB_FIT_READING`, 119 §6) cut what is typed; the
  screen test types 70 characters and holds that what the keyboard keeps (at most 63) is what the row sends.
- **The original's send** (`SetPlayerDescription`, `FUN_00277640` D:L122933-122945): the UI variable named at 0x3eeb40
  (`PlayerDescription`), when it is a string (type 3, D:L122940-122942), handed to `FUN_002fa7f0` (D:L198336-198343),
  which asks the lobby server's TextFilter -- type 1, Replace, at most 0x40 bytes of the text (`FUN_002f4df0`
  D:L194740-194762: the type D:L194753, the copy D:L194755, the request D:L194759) -- with the callback at ELF
  0x2fa800 (`FUN_002fa800`, 0x2fa800-0x2fa860; the decompilation has no block for it, the instructions read by address):
  `FUN_001988d0(0x66a7ef, "%s", reply text)` prints the filtered text into the session's record at +0x9f (the record at
  0x66a750); `FUN_003857c0` / `FUN_003862a0` set the UI variable `PlayerDescription` (0x3f5b60) from that field;
  `FUN_002faa80(0x44f370)` posts the whole record (research 155 §1.3). The row answers 1 at once.
- **At the login** the own-stats read sets `PlayerDescription` from the stored record's +0x9f (`FUN_002fa8f0`
  D:L198401-198402); a new account's default record is zero-filled (D:L198207-198222), so its description is empty.
  The session's start writes "Description Not Set" (0x3f39b0) into the session's copy first (D:L182644), which the
  read then replaces. The port has no login read yet: `PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER` (§6). *(2026-10-11, SVC-15a:
  built -- the read at each entry into state 11 over `/lobby/player-info`, research 268 §1.7; the placeholder retired.)*
- **The record's field**: +0x9f, 66 bytes, copied by each build as 0x21 byte pairs (`FUN_002fab80` D:L198513-198523;
  research 261 §4). The keyboard's 63 and the send's 0x40 never fill it; the port cuts at 0x40 (§1.5).
- **The port** (W22.R1, research 155 §4.1): `SetPlayerDescription` (`OnlineOptionsCommands`) sends the variable's string
  to the services' owner-fields operation and sets the variable to the text the operation answers, as the callback sets
  it from the field; no string, no service or no answer: nothing changes (a request never answered). The page's
  transport is `POST /lobby/owner-fields` with the session's ticket as the bearer, read as the room list's answer is
  (`fetchOwnerFieldsService`, `sessionOwnerFields`: 2xx the stored text; 401 the session lost; anything else a
  request never answered) -- a browser adaptation of the transport (OT.R27). **No text filter**: the TextFilter's words
  were Sony's server's and are unread; the port applies none beyond the cut, `CHAT_FILTER_PLACEHOLDER`'s default
  (research 263 §5.3, H-next d) for this text as for the chat's.

### 1.4 The SAVE's write

- **What SAVE writes.** `ForceSave` and RETURN-with-a-change end in `SaveConfig(BASCUS-97275SOCOMII)` -- the page's
  `connectPersona` config under OPT-05i's chain over PLAT-26a's libmc (research 301 §6; unchanged here). The file's
  `CValveSaveManager` module holds every PERSIST valve (research 229 R229.1): `DISPLAY_MP_TEAM_NAMES` and
  `EnableExternalWhispers` are two of the 65, so a toggle shows in the next save (229 §3's unit test holds each row's
  VALVE writes to the module). The `CUIVarManager` module holds the longevity-3 UI variables, `MPLOCALSOP1-5` and
  `MPTAUNTMSG1-5` (229 §4). **The description is not on the card**: it is the record's (+0x9f), on the server;
  `PlayerDescription` is a temporary variable (the WRAPPEDTEXT's UIVAR names no longevity).
- **The acceptance's diff** (roadmap 04 OPT-15 under R7: the values compared, the dev tool reading the recomp's card;
  `tools/test/onlineOptionsSaveDisc.test.ts`, dev host): `logs/parity/s16_l1b_step0b`'s card holds the ten keys
  `MPLOCALSOP1-5` then `MPTAUNTMSG1-5`, each its HudCLOC key 60757-60766; the page's `SaveConfig` after
  `dlgNetLogin.rdr`'s ONSTART writes the same ten names and values in the same order; an edited SOP and taunt differ
  from the card at those two keys only. Run 2026-10-10 with `SOCOM_PC_ROOT`: 3 passed (it held on the base too: the
  page already wrote them; the test is the acceptance's, not a change).
- **When the SOPs and taunts are first written** (the block's unknown) -- **a reading from the cards**: they exist only
  once `dlgNetLogin.rdr`'s ONSTART has added them at longevity 3 (302 §4; `persistenceRuleDisc.test.ts`), and a SAVE
  writes the ones the manager holds (`CUIVarManager_Serialize`, 229 §4). The recomp's f0 card -- an offline
  playthrough's -- holds the module empty; `s16_l1b_step0b` began with no card (`card_before.txt`) and after its first
  online session's persona save holds the ten at 6,208 B (`card_after1.txt`; `personaFileSize(1, 10)`). So an offline
  SAVE before any online session writes none; the first SAVE after the online login writes all ten; after that they
  persist (the boot's `LoadConfig` restores them, and every later SAVE, offline or online, writes them). Not a placeholder:
  the reading is the scripts' and the two cards', held by the dev-host test. Proven only by OPT-19's runs.

### 1.5 The owner-fields operation (the services)

- **What it writes**: `OwnerFieldsService.write` (`packages/central/src/ownerFields.ts`) -- the caller's own record,
  bytes +0x9f..+0xe0: the text cut at the 0x40 bytes the original's send copies (`DESCRIPTION_SENT_MAX`, `FUN_002f4df0`
  D:L194755; the review's low, 2026-10-10: cut at the field's 66 until then), zero-filled past its end, so the field
  always holds a NUL after it; every other byte as stored, the
  tail +0xe1..+0xff among them. `OWNER_FIELDS` is `['description']`: the dialog edits no other field. The hometown
  (+0x60, `PLAYERHOMETOWN`) and the gender (+0x03 bit 0, `PLAYERGENDER`) are `dlgNetPlayerName`'s rows (research 153;
  the build copies them from the session, D:L198548-198554, D:L198468), so they are not owned here; W22.R1's
  operation takes them when the persona form's task sends them (§7).
- **Departures, labelled.** The original's `"%s"` leaves an older, longer text's bytes after the new NUL; the port
  clears them (no reader reads past the NUL; the bytes would keep an old text a player replaced). A record that is not
  an `'E'` record is served as the default (`readAccountStats`, D:L198207-198222); the write starts from that default
  and sets the text -- what the original's login posts for such an account (D:L198403-198405), plus the text. A
  character past 0xff is no byte of the record (SVC-12b's codec rule): refused, nothing written.
- **The path**: `POST /lobby/owner-fields` `{ description }` -> `{ description }` (`LOBBY_OWNER_PATHS`, mounted when
  `lobbyHandler` is given `ownerFields`). The account is the bearer's (`identify`), never the body's; a body with any
  key but `description`, or no string `description`, is refused 400; no bearer 401.
- **Research 169 §4's negative test for this path** (`ownerFields.test.ts`): a record with every field away from its
  default and a non-zero tail, before and after -- only offsets +0x9f..+0xe0 differ; the rating, kills, games, the
  position, the hometown and the gender read back the same; the other account's bytes are unchanged; bodies naming
  `rating`, `accountId`, `hometown`, `gender` or `kills` are refused and write nothing.
- **Mounted** (2026-10-10, the fix round, after `agent/online` cf87361a9 -- SVC-12d's `bridge.ts` -- was merged into the
  branch): `createServices` gives the lobby handler `ownerFields: new OwnerFieldsService(o.store)` beside the ignore list
  and the ladder, so the page's `POST /lobby/owner-fields` with a login's ticket reaches the store. Held over the mounted
  path by `ownerFields.test.ts` (a logged-in persona's ticket writes its description, the record's other bytes the same;
  no ticket or a stale one 401, nothing written).

### 1.6 Tests (reading level)

- `packages/ui/test/screens/onlineOptionsScreen.test.ts` (10): the list empty and every row's binding and strip
  ungated; `SetPlayerDescription` as a row (the send and the answer written back; no string, no service, no answer);
  over the machine (disc or fixtures): PLAYER DESCRIPTION's `.DINK`, its keyboard's request (`PlayerChatSkb`, 63 / 65)
  and the kept text sent with `DescChanged` 1; INPUT FILTERS building `dlgOnlineFilters.rdr`; each strip's start from
  its valve and RIGHT / LEFT writing it (`DISPTEAM_NAMES` and `OptionsMenuChanged` 1); SETUP MESSAGING, SETUP TAUNTS and
  RETURN as before. RED with the rows parked: 5 failed of 10.
- `packages/central/test/ownerFields.test.ts` (8, the last over `createServices`' mount), `packages/viewer/test/worldOfSocomHost.test.ts` (+3: the transport and
  the mount), `tools/test/onlineOptionsSaveDisc.test.ts` (3, dev host).

## 2. ONLINE FILTERS and AUTOPLAY (ONL-15)

Written 2026-10-10 for ONL-15 on `agent/online-onl15` from `agent/online` 0bce90cd5 (the brief
`../plans/briefs/2026-10-10-s22-w1-onl-15.md`). Sources as §1's, and Horizon at the pin (`git -C $SOCOM_PC_ROOT show
be5578311:server/horizon-server/...`, cited `desktop@be557831 <file>:<lines>`). The scripts are the disc's
(`tools/dump-online-dialogs.ts --dialog dlgOnlineFilters.rdr`, `--dialog dlgWorldOfSOCOM.rdr`); the captions UIMnLOC's.
**Reading, reviewed 2026-10-10**; nothing is measured against the original running (the proven level is ONL-32's, §2.6).

### 2.1 The filtering side: what the console sends, what it drops itself, what the server honours

- **The console sends two filters, no more.** The decompilation's only calls of SetGameListFilter0's builder
  (`FUN_00649960` D:L561320-561340) are D:L191656 and D:L197550; of ClearGameListFilter0's (`FUN_00649a00`
  D:L561343-561363) D:L197153, D:L197618 and D:L197652. So: entering a room, the lobby world's filter -- field 10
  (LOBBY_WORLDID), operator and baseline 0 (`FUN_002efc80` D:L191653-191657); and AUTOPLAY's chain (§2.4) -- clear
  FilterID 10, set field 1 (PLAYER_COUNT) operator 3 (>=) baseline 1, the list, clear FilterID 1. **None of the six
  filter valves is ever sent.**
- **The console drops the rest itself, from the entries.** Each game list request reads the six valves into globals
  (`FUN_002e2920` D:L184278-184289: GameTypeFilter, GamePlayerFilter, GameSpeedFilter, GamePasswordFilter, FF_FILTER,
  LockedFilter; their start 0, 0, 65000, 2, 2, 2, `FUN_003042b0` D:L204390-204395), and the draw (`FUN_002e2ce0`
  D:L184413) keeps a record only when `FUN_002e3080` (D:L184509-184546) passes it: a password game hidden at
  GamePasswordFilter 0, an open game at 1 (security bit 0; 2 any); the game type (`FUN_002e31e0`, §2.2); players at least
  GamePlayerFilter; GenericField2 (the response time the PING column reads) at most GameSpeedFilter; FF_FILTER 2, or 1 /
  0 matching RulesSet bit 0; LockedFilter 2, or 1 and a world status not 3 (0 refuses every game). Research 162 §2
  transcribed all but the type; the type is transcribed here (`GAME_TYPE_FILTER_READING` retired, research 162 §6).
- **Horizon at the pin honours any field it is sent**: SetGameListFilter0 adds a filter and answers its FilterID
  (desktop@be557831 `Server.Medius/Medius/MLS.cs:2700-2722`; `Models/ClientObject.cs:529-543`, the id a per-session
  counter, `:185`), ClearGameListFilter0 removes by that id (`MLS.cs:2747-2768`, `ClientObject.cs:545-548`), and
  GameList_ExtraInfo0 lists the games the filters match (`MLS.cs:2479-2533` over `MediusManager.cs:229-236`), each
  filter comparing one `MediusGameListFilterField` (`Models/GameListFilter.cs:16-40`; the fields `RT.Common/Types.cs:379-396`).
  The block's `MLS.cs:2676-2747` is SetGameListFilter (the non-0 request) to ClearGameListFilter at the pin's numbering.
- **The port** (SVC-06's `RoomService`, `packages/central/src/lobby.ts`, as built -- no change in this task): the server
  honours every field it is sent, as Horizon does, which covers the two the console sends; its three readings stand
  (`FILTER_ID_READING` -- the id is the field, so AUTOPLAY's clears of 10 and 1 find the filters they name, where
  Horizon's counter would not; `FILTER_COMPARISON_READING`; `LOBBY_WORLD_FILTER_READING`). One more difference, noted:
  Horizon's list keeps a game **any** filter matches (`MediusManager.cs:236`; its own `IsGameMatch`,
  `ClientObject.cs:550-553`, would take all), the port's **every**; moot for the original's traffic, which never holds
  two (AUTOPLAY clears 10 before it sets 1, and 1 before the room's join sets 10 again). **The page drops what the
  console dropped**: `BriefingRoomCommands`' `passes` (`FUN_002e3080`), now with the type. Held by
  `packages/central/test/lobby.test.ts` ("ONL-15: ... over a seeded set": six games varying the room, the players, the
  response time, a password, friendly fire and the play list; the unfiltered list carries every one with the fields the
  page's filter reads; the room's filter, AUTOPLAY's order and the clears each equal the hand-filtered list) and
  `packages/ui/test/screens/onlineFiltersScreen.test.ts` (the client's filter over a seeded set: for each of fifteen
  valve settings the drawn list equals the hand-filtered one); the endpoint by `packages/central/test/lobbyHttp.test.ts`
  (AUTOPLAY's chain over `/lobby/clear-filter`, `/lobby/set-filter`, `/lobby/game-list`).

### 2.2 The game type: `FUN_002e31e0` (the one filter not transcribed until now)

GameTypeFilter 0 passes every game. Otherwise the game's play list -- the 'D' record's bytes from 8 to the first 0 (the
record's +0x1a2: the vtable at 0x4066b0, slot +8, is ELF 0x2e24c0, `jr ra` with `addiu v0, a0, 0x1a2`) -- must hold
maps of one game type, the first map's (D:L184565-184575; a map's type is its mission record's TYPE, `FUN_002c8b80`
D:L168500-168519: the first record of that NUMBER flagged multiplayer); then 252, 251, 250, 249, 248 pass the play
lists of Suppression (5), Demolition (2), Extraction (4), Escort (3), Breach (1) (D:L184578-184607; the captions #656
"Suppression ONLY" .. #660 "Breach ONLY" agree), and any other value passes a play list of that one map alone
(D:L184608-184613). The port: `gameTypePasses`, `playListOf`, `missionGameType` (`packages/ui/src/screens/onlineFiltersCommands.ts`)
over `missionlist.rdr`'s records (ONL-13's `missionRecords`), called from `passes` (D:L184527-184530). The port bounds the
play list at 0x20 bytes, as `FUN_002e33e0` reads it; the original's loop runs to the first 0 (the 'D' record's 0x28
bytes end at +0x1c2, so a full list reads two bytes past it) -- a bound, not a value change, for any list a host sends.

### 2.3 ONLINE FILTERS (`dlgOnlineFilters.rdr`)

INPUT FILTERS on ONLINE OPTIONS opens it (§1.1). The layout's rows, top to bottom, and the set's scripts:

| row (caption) | control | CROSS / its strip's boxes | valve(s) written | description drawn (`refresh_filter_screen`) |
|---|---|---|---|---|
| MAP TYPE (#639) | BUTTON `gamestype` | `increment_game_filter`: `GameTypeMapIndex` 0 -> 251 -> 250 -> 252 -> 249 -> 248 -> 1, then +1 to `NumMultiMissions`, then 0; for a map, `GetMissionInformation` | `GameTypeMapIndex`, `GameTypeFilter` (the same value; for a map the mission's NUMBER), `OptionsMenuChanged`, `MapChanged`, `GameFilterChanged` 1 | `game_type_desc`: #655 ANY MAP, #656-#660, or the map's NAME (the TEXT's UIVAR `MissionNameUIVar`) |
| # OF PLAYERS (#640) | BUTTON `NumPlayersTab` | `increment_player_filter`: 0, 2, 4 .. 14, 0 | `GamePlayerFilter`, `OptionsMenuChanged`, `PlayersChanged` | `game_player_desc` #661 ANY NUMBER OF PLAYERS, #662-#668 "More than n players" |
| RESPONSE TIME (#641) | BUTTON `responsetime` | `increment_speed_filter`: 65000, 300, 600, 1200, 65000 | `GameSpeedFilter`, `OptionsMenuChanged`, `SpeedChanged` | `game_speed_desc` #669 ANY SPEED (65000), #670 Fast (300), #671 Average (600), #672 Slow (1200) |
| FRIENDLY FIRE (#232) | RADIOSTRIP `FF`: `FF_ON` ENABLED (#642), `FF_OFF` DISABLED (#643), `FF_NOPREF` DON'T CARE (#644) | `enable_FF` / `disable_FF` / `nopref_FF` | `FF_FILTER` 1 / 0 / 2, `OptionsMenuChanged`, `FFChanged` | the strip's box (`FF.op4`) |
| PASSWORD (#251) | RADIOSTRIP `Pword`: `EN` NO PASS (#645), `DIS` PASS ONLY (#646), `NoPref` DON'T CARE (#644) | `enable_password_filter` / `disable_password_filter` / `nopref_password_filter` | `GamePasswordFilter` 0 / 1 / 2, `OptionsMenuChanged`, `PassChanged` | the strip's box (`Pword.op4`) |
| RESET FILTERS (#647) | BUTTON `resetFilters` | `OnResetBtnDwn` | the seven to 0, 0, 0, 65000, 2, 2, 2 (`ONLINE_FILTER_RESET`), `OptionsMenuChanged` | all three redrawn; `DescriptionText` #648 |
| RETURN (#67) | BUTTON `return` | `goto_menu(PREVIOUS_SCREEN)` | -- | -- |

- **The valves** are OPT-02's (research 229 §2): `GameTypeMapIndex`, `GamePlayerFilter`, `GameSpeedFilter`, `FF_FILTER`,
  `LockedFilter`, `GamePasswordFilter` PERSIST; `GameTypeFilter` PERM (each launch's `global_valves.rdr` makes it 0, and
  AUTOPLAY's `refresh_filter_screen` on SOCOM II ONLINE copies the index into it, then `GetMissionInformation` the map's
  NUMBER). The page names `LockedFilter` only in RESET and `refresh_filter_screen` (`locked.op0`, a control the layout
  lacks: inert, in the original and here); its own `enable_locked_filter` .. scripts are bound to nothing.
- **The page has no SAVE.** Each change sets `OptionsMenuChanged` 1; RETURN and TRIANGLE go back to ONLINE OPTIONS,
  whose ONSTART keeps the flag as it came in, so its RETURN runs `save_and_leave` -- the card's path (§1.4), which writes
  the PERSIST valves in `CValveSaveManager` (research 229 R229.1). ONL-15 adds nothing to that path.
- **TRIANGLE** (`OnFiltersBack`): with any of the five change flags, the popup (#246 / #253); NO restores the six `TEMP*`
  copies `ActivateGames` took at ONSTART and goes back; YES goes back as changed. Without a change it goes back at once.
- **`GetMissionInformation`** (row 188, `FUN_00275ef0` D:L122200-122252), `OnlineFiltersCommands`: the record's byte
  +0x10 (1 on the disc) and three names' indices at +0x14, +0x18, +0x1c -- `MissionNameUIVar`, `GameTypeFilter`,
  `GameTypeMapIndex` on the disc's commands (read off the record by a probe of the screen rig); the missions whose
  multiplayer flag equals the byte counted in the table's order, and at the index valve less one the NAME into the text
  variable (TEMPORARY) and the NUMBER into the number valve; 1 always.
- **`NumMultiMissions`** (S:0x3f2e20): the multiplayer missions present, set when the table is read (`FUN_002c8c10`
  D:L168587-168598); the page seeds it at each launch from `missionlist.rdr` (`seedNumMultiMissions`; every map present,
  `MISSION_ARCHIVE_PRESENT_READING`): 22 on the US disc, VIGILANCE first. The map cycle lists all 22, the original's;
  the first release's default-map rule (OT.R16; four maps since OT.R45) narrows CREATE GAME's list, not the filter, which only hides games.
- **Held by** `onlineFiltersScreen.test.ts` over the machine (the disc or the fixtures): ONSTART's three descriptions and
  the strips at the reset values; MAP TYPE's cycle with each caption, the first and second maps by name and number, and
  the wrap past the 22nd; the players' and speeds' cycles with their captions; both strips' boxes writing their valves,
  and starting from them; RESET; TRIANGLE's popup after a change and the way back without one.

### 2.4 AUTOPLAY: the chain, and the pick rule (a reading: `AUTOPLAY_PICK_PLACEHOLDER` not needed, §6)

SOCOM II ONLINE's AUTOPLAY row (#778): ONACTIVATE `aplaytext` (the filters' pane, #783/#784, its own
`refresh_filter_screen`); CROSS `join_random_game` (`StartMusic`, `.DINK`, the kept popup #801 "Searching For Game To
Join. Please Be Patient.", the progress strip, `JoinMPGame(RANDOM)`). `JoinMPGame` with RANDOM (S:0x3f5928) and its
callbacks, transcribed in `AutoplaySearch` (`packages/ui/src/screens/autoplayCommands.ts`):

1. `FUN_002f83b0` D:L197147-197155: the candidates emptied, ClearGameListFilter0 FilterID 10; the row answers 1.
2. `FUN_002f8e50` D:L197533-197553: SetGameListFilter0 field 1, operator 3, baseline 1.
3. `FUN_002f8ed0` D:L197558-197586: GameTypeFilter, GamePlayerFilter, GameSpeedFilter, FF_FILTER and LockedFilter read
   into the list's globals (S:0x3f5a38 .. S:0x3f5a90) -- **not GamePasswordFilter**, whose global keeps the last list's
   value, or the start's 2 -- then GameList_ExtraInfo0, PageID 1, PageSize 999 (D:L197579-197583).
4. `FUN_002f8fd0` D:L197591-197655, each entry: a non-success -- Horizon's NoResult when no game is listed -- posts
   MP_MEDIUS_JOIN_GAME_FAILURE (S:0x3f5ac0; the menu's `OnRandomGameFailure`, #803 "No Game Found. Change Filter Settings
   or Join Game Manually.") and clears FilterID 1. A success with a world id from 0 is a **candidate** when
   (D:L197629-197639): its players are fewer than MaxPlayers less its spectator slots ('D'[4]), **more than**
   GamePlayerFilter (strictly: the list's own test, also applied, is "at least"; the captions say "More than n
   players") and not 0; `FUN_002e3080` passes it (the record in a0: ELF 0x2f9050 loads it for the call at 0x2f9084);
   its world status is not 3; it has no password (security bit 0); its clan field admits the player (`FUN_002e9940`
   D:L188215-188244: not another clan's clan game, against the client's clan id `DAT_0044f59c` -- the page's
   `LobbyClan.clanId` since CLAN-ID-WIRE, 2026-10-13, research 272 §3); its rank bits admit the tier
   (`FUN_002e3490`; `PLAYER_TIER_PARKED_READING`: no tier, no refusal); every map of its play list is held
   (`FUN_002e33e0`; `MISSION_AVAILABLE_READING`). The EndOfList entry then picks and clears FilterID 1 (D:L197647-197652).
5. **The pick** (`FUN_002f9220` D:L197658-197715): no candidate, MP_MEDIUS_JOIN_GAME_FAILURE. Otherwise the candidate
   with the largest MaxPlayers less MinPlayers; between equals the smaller GenericField2 (the response time); between
   equals again the first in the list's order (D:L197678-197692: a later candidate replaces the best only when strictly
   larger, or equal and strictly faster). Not "the first game the filters admit": the roomiest, then the fastest. Its
   world id kept (`DAT_0066a5f0`), its clan field noted (`FUN_002e9ab0`: no reader in the port), its name into
   GAMENAMEVAR, the player count kept (`DAT_0066a998`: no reader in the port), PlayerGamePassword emptied
   (D:L197693-197698); then its room -- the client's room record whose world id is the game's GenericField1
   (`FUN_002e4410`, D:L197699): none, MP_MEDIUS_JOIN_GAME_FAILURE; found, the random-join flag (`DAT_0066a5e8`),
   MP_RANDOM_GAME_FOUND (S:0x3f5ae0; the menu's `random_game_found` popup) and `FUN_002e3790` with the room's name
   (D:L197706-197710).

**The join through the path's own join.** The room's JoinChannel (state 19, `BriefingRoomCommands`); its success, with
the flag set, queues state 15 instead of state 11 and MP_JOIN_ROOM (`FUN_002efc80` D:L191641-191652; the room's filter
field 10 still sent); state 15's JoinGame (`GameLobbyCommands`, ONL-16a) for the kept world id -- its entry clears the flag
too (D:L190399); a refused JoinChannel leaves the flag set, as the console's until state 15 or the lobby's own resets
clear it -- its close (`FUN_002df650` D:L182182), the lists' reset (`FUN_002df8e0` D:L182283, which the close and the
disconnect call), its init (`FUN_002e0450` D:L182778), and D:L182840. The port clears it where its lobby client opens and
closes (`LobbyClient.onReset`, run by `connect` and `disconnect`; the review's low, 2026-10-10: a refused AUTOPLAY join,
a logoff and a login, then a listed room's join went on to state 15 and the stale game -- `autoplay.test.ts` holds it).
JoinGame's success queues state 17, **whose entry posts
MP_MEDIUS_READY_TO_CONNECT**: the state's code has no decompiled block, read at ELF 0x2ef3c0 -- phase 1 (the branch at
0x2ef3f0 to 0x2ef408) acquires `mp_locked_game` (S:0x3f4b00) and calls `DAT_0044f3c8` with S:0x3f4b10 (0x2ef43c-0x2ef454).
**Not transcribed**: phase 1's three other calls -- 0x2f7690 (at 0x2ef408), `FUN_002df8e0(0x44f370)` (0x2ef42c: the
client's room list, the lobby's lists, AUTOPLAY's candidates and the random-join flag reset, D:L182241-182289) and
`FUN_002f4fc0(0)` (0x2ef434) -- nor the state's other phases.
SOCOM II ONLINE binds it to `join_game` (#806, `ConnectToGameServer`, `CheckJoinMP`, `JoinGameServer`,
`SWITCHMENU(dlgGameLobby.rdr)`); no other dialog of the path binds it, so the port posts it at every state 17 entry, as
the original. `GameLobbyCommands.randomGameFound` holds the picked record (the world id; GAMENAMEVAR drawn; the empty
password; for the port's own match start, the first mission 'D'[8]) and writes **none of the settings valves** a listed
join writes (D:L197176-197300), as `FUN_002f9220` writes none: `RANDOM_JOIN_SETTINGS_READING` (§6).

- **The gate retired.** AUTOPLAY's row left `PARKED_ROWS` (OT.R8's gate, research 158); SOCOM II ONLINE's entry list
  names `GetMissionInformation` (ONL-15) and the five join rows (`JoinMPGame`, `CheckJoinMP`, `ConnectToGameServer`,
  `JoinGameServer`, `DisconnectFromGameServer`, ONL-16a's `GameLobbyCommands`) as existing bodies
  (`WORLD_OF_SOCOM_ENTRY_COMMANDS`; `tools/test/worldOfSocomEntryCommands.test.ts`: 2 / 3 / 23 / 4).
- **The page's mount** (`packages/viewer`): `connectBriefingRoom` takes the missions (the type filter) and makes the
  `AutoplaySearch` over the same transport, `/lobby/clear-filter` added (`BriefingRoomTransport.clearGameListFilter`);
  `connectGameLobby` takes `randomGame`; `FrontEndSession` registers `OnlineFiltersCommands` and seeds
  `NumMultiMissions` at each launch, when the mission table's read lands and when the session is made with it read.
  Driven by `packages/viewer/test/briefingRoomHost.test.ts` (+2: the transport's `/lobby/clear-filter`, and the mount's
  `autoplay.start()` sending clear 10 then set 1 with the session's bearer); the rest of the mount by no test here.
- **Held by** `packages/ui/test/screens/autoplay.test.ts`: the candidate test rule by rule, `FUN_002e9940`, the pick's
  three keys; the chain's requests in order, the found game's room joined, no candidate, NoResult, the room not held, the
  filters' say, a list never answered; over the machine (the disc's `join_random_game` and `join_game`): CROSS's
  `.DINK` and #801, `JoinMPGame(RANDOM)`, the four requests, JoinChannel into the pick's room with no MP_JOIN_ROOM, the
  room's filter, JoinGame for the pick, GAMENAMEVAR, and the GAME LOBBY built over the game socket; and #803 with
  nothing joined when no game is listed.

### 2.5 FILTER_BUDDIES, FILTER_CLANAFFILIATION, FILTER_CLANONLY: `SetFilters`, called by no script

The block's three strings (S:0x3ef1c8, S:0x3ef190, S:0x3ef1e0) are three of the eight UI variables row 27 `SetFilters`
(`FUN_0027c460` D:L125395-125467, declared for ONL-15 in PLAT-08's table) adds -- FILTER_GAMETYPE, FILTER_RATECATEGORY,
FILTER_MAP, FILTER_CLANAFFILIATION, FILTER_RESPONSETIME, FILTER_BUDDIES, FILTER_CLANONLY, FILTER_RATEREQUIREMENT -- and
sets one of to a fixed text by its argument ("GameType", ... "Buddies Only", ...). **No script on the disc calls it**:
the dialog inventory's pin names it only among the ELF's binding names (`tools/test/dialogInventory.pinned.json`, `elf`
`bindingNames`), no dialog's set and no code reads the eight variables. Nothing to port: the row stays the table's
declared one (its constant 1), and no ONLINE FILTERS row stands for a buddies or clan filter.

### 2.6 What is proven, and what is owed

Nothing here is measured on the original running. The recomp captures of ONLINE FILTERS and AUTOPLAY's pane, the
filtered list for a seeded game set against the recomp's, and AUTOPLAY's pick against a recomp run with two or more
games are the proven level: ONL-32's (the roadmap block's acceptance).

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER` (ui `screens/onlineOptionsCommands.ts`) | `'unset until SetPlayerDescription answers'`: the variable absent, the description's WRAPPEDTEXT empty until the player sets it in the session | the login's own-stats read, which sets `PlayerDescription` from the stored record's +0x9f (`FUN_002fa8f0` D:L198401-198402). **Its cost on TRIANGLE's discard**: after a reload the record holds "abc" and the dialog opens blank (its WRAPPEDTEXT adds the variable with no value, `widgets/widgetSet.ts` `follow`); ONSTART's `CopyUIVar` copies that empty value to `TEMPPlayerDescription`; the player types "xyz", which is stored; TRIANGLE's restore copies the empty value back and `SetPlayerDescription` sends nothing (no string) -- the record keeps the discarded "xyz" while the page shows blank, where the original restores "abc" and re-sends it | **owed to SVC-15a** (segment 06, PLAYER INFO's lookup; sprint 18): the page asking its own account's record there at the login, the variable set from its +0x9f, as the original's own-stats read does. SVC-15a, not an OPT-15 follow-up, because it is the task that serves a stored record to a page (by account, with the served fields filled); a second read path for one field would duplicate it. Its block carries the dated line | retired 2026-10-11 by SVC-15a (research 268 §1.7): the own-stats read built -- `OnlineOptionsCommands.readOwnRecord` at state 11's entry, `PlayerDescription` from the own record's +0x9f |
| `RANDOM_JOIN_SETTINGS_READING` (ui `screens/gameLobbyCommands.ts`, ONL-15) | `'AUTOPLAY's join writes no settings valve (FUN_002f9220); their source in the console's lobby unread'` | AUTOPLAY's pick keeps the world id, GAMENAMEVAR, the player count and an empty PlayerGamePassword (`FUN_002f9220` D:L197693-197698) and writes none of the settings valves a listed join writes (`FUN_002f83b0` D:L197176-197300); the port writes none either (`randomGameFound`), so the GAME LOBBY shows them as the last game left them. Where the console's lobby takes a random join's settings from (the game's peer session, presumably) is not read | a read of the game lobby's own writes of those valves after a join (the DME session's callbacks), or ONL-32's capture of the GAME LOBBY reached by AUTOPLAY | open |
| `AUTOPLAY_PICK_PLACEHOLDER` (never code; the brief's name) | -- | AUTOPLAY's pick rule, should `FUN_002f8fd0` be unread | -- | *note only*; resolved as a reading (§2.4): the candidates `FUN_002f8fd0` keeps, then `FUN_002f9220`'s largest MaxPlayers less MinPlayers, the smaller GenericField2, the first in the list's order |
| `GAME_TYPE_FILTER_READING` (was ui `screens/briefingRoomCommands.ts`; research 162 §6) | -- | GameTypeFilter's test for a non-zero value | -- | retired 2026-10-10 by ONL-15 (§2.2): `FUN_002e31e0` transcribed, `gameTypePasses` |
| `ONLINE_OPTIONS_FIRST_WRITE_PLACEHOLDER` (never code) | -- | when `MPLOCALSOP1-5` / `MPTAUNTMSG1-5` are first written, and whether an offline SAVE writes them (roadmap 04 OPT-15's unknown) | -- | *note only*; resolved as a reading (§1.4): the first SAVE after `dlgNetLogin`'s ONSTART; an offline SAVE before any online session writes none (f0's card), every later one writes them |

## 7. What is left

- ~~**The login's read** (`PLAYER_DESCRIPTION_AT_LOGIN_PLACEHOLDER`, owed to SVC-15a, §6): the stored description into
  `PlayerDescription` at the login. Until then TRIANGLE's discard after a reload keeps the discarded text in the
  record and shows the page blank (§6's row).~~ *(2026-10-11, SVC-15a: built, research 268 §1.7; reading, pending
  review.)*
- **The in-round effects**: TEAMMATE NAMES' (`DISPLAY_MP_TEAM_NAMES` -> the HUD's names, `FUN_00227340` D:L77558-77559)
  and EXTERNAL WHISPERS' (`DAT_003de620` -> the round's chat filter on kind 5, `FUN_001f7ff0` D:L56712) are SVC-19's /
  the HUD's (H-next e's default).
- **The hometown and the gender**: `dlgNetPlayerName`'s rows (ONL-06's form; OPT-04 keeps them in the card's persona
  records). **No task owes writing them into the record yet.** The original re-copies the hometown from
  `PLAYERHOMETOWN` into every record it builds and posts (D:L198548-198554) and the gender bit likewise (D:L198468); the
  port's page never posts a record, so the stored record's hometown and gender stay as the match server last wrote them
  (empty and 0 for a record it built from the default) until a task sends them through W22.R1's operation
  (`OWNER_FIELDS` grows, the negative test with it).
- **The discard over the machine**: TRIANGLE's restoring path (`CopyUiVar` back, `SetPlayerDescription` with the old text) runs
  as the scripts hold it but is not driven by the screen test (the rig mounts no `CopyUIVar`).
- **The text filter**: H-next d / SVC-23's (`CHAT_FILTER_PLACEHOLDER`).
- **The proven level**: OPT-19's recomp captures of ONLINE OPTIONS and its toggle-and-card-diff runs (H25).
- **ONL-15's (§2), what is left.** `RANDOM_JOIN_SETTINGS_READING` (§6). The proven level -- the recomp captures of
  ONLINE FILTERS and AUTOPLAY's pane, the filtered list for a seeded set against the recomp's, AUTOPLAY's pick with two
  or more games -- is ONL-32's. The page's mount (`packages/viewer`: the missions to the briefing room, `AutoplaySearch`
  over `/lobby/clear-filter`, `randomGame`, `OnlineFiltersCommands`, `NumMultiMissions` at each launch) is driven by no
  test here but the briefing room's (`briefingRoomHost.test.ts`); the ui, server and viewer typechecks exit 0 at
  ONL-15's merge (02fc983c2, 2026-10-10). `NumMultiMissions` is seeded when the mission table's read lands, at the session's making and at
  each launch (the review's low, 2026-10-10: a deep link or a late read no longer leaves it 0); no host test drives the
  seed. Who reads FILTER_BUDDIES / FILTER_CLANAFFILIATION /
  FILTER_CLANONLY: nothing on the disc (`SetFilters`, §2.5). The clan field AUTOPLAY notes (`FUN_002e9ab0`) and the
  player count (`DAT_0066a998`) have no reader in the port yet (the clan pages', ONL-26/27).
